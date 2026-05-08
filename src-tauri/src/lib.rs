use tauri::Manager;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

pub mod thumbnail_engine;
use thumbnail_engine::{DensityLevel, ThumbnailTile, init_thumbnail_engine, get_cache_stats, clear_video_thumbnail_cache};
use thumbnail_engine::decoder::{get_decoder, release_decoder};

#[cfg(test)]
mod thumbnail_engine_tests;

#[cfg(test)]
mod thumbnail_engine_proptest;

pub mod models;
pub mod commands;

/// Initialize the thumbnail engine with app cache directory
#[tauri::command]
async fn init_thumbnail_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Initialize cache directory
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;
    init_thumbnail_engine(cache_dir).await
}

/// Get thumbnail cache statistics
#[tauri::command]
fn get_thumbnail_cache_stats() -> serde_json::Value {
    get_cache_stats()
}

/// Clear thumbnail cache for a specific video
#[tauri::command]
async fn clear_thumbnail_cache(video_path: String) {
    clear_video_thumbnail_cache(&video_path).await;
}

/// Extract poster frame at 10% mark of clip duration
/// 
/// Extract poster frame using native decoder directly (bypasses queue system)
/// Returns base64-encoded WebP data URL for immediate display
#[tauri::command]
async fn extract_poster_frame_command(
    video_path: String,
    duration: f64,
    dpr: f64,
) -> Result<String, String> {
    use thumbnail_engine::decoder::get_decoder;
    use image::codecs::webp::WebPEncoder;
    
    // Calculate poster frame time (10% of duration, or 0.5s for short clips)
    let poster_time = if duration < 1.0 {
        0.5
    } else {
        duration * 0.1
    };
    
    // Base thumbnail long/short edge
    let long_edge: u32 = if dpr >= 1.5 { 320 } else { 160 };
    let short_edge: u32 = if dpr >= 1.5 { 180 } else { 90 };
    
    let decoder_arc = get_decoder(&video_path).await?;
    let (rgba_bytes, out_w, out_h) = {
        let mut decoder = decoder_arc.lock().await;
        let rotation = decoder.rotation();
        
        // For portrait videos (90°/270°), request portrait dimensions.
        // decode_frame handles the rotation internally — caller just
        // specifies the desired output size in display orientation.
        let (req_w, req_h) = if rotation == 90 || rotation == 270 {
            (short_edge, long_edge) // portrait: 90×160
        } else {
            (long_edge, short_edge) // landscape: 160×90
        };
        
        let bytes = decoder.decode_frame(poster_time, req_w, req_h)?;
        (bytes, req_w, req_h)
    };
    
    // Encode RGBA to WebP
    let mut webp_data = Vec::new();
    let encoder = WebPEncoder::new_lossless(&mut webp_data);
    encoder.encode(&rgba_bytes, out_w, out_h, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("WebP encode failed: {}", e))?;
    
    // Convert to base64 data URL
    let base64_data = BASE64.encode(&webp_data);
    Ok(format!("data:image/webp;base64,{}", base64_data))
}



// ─── Native FFmpeg Decoder Commands ─────────────────────────────────────────
// Fast path for thumbnail extraction using ffmpeg-next (no sidecar overhead)

use thumbnail_engine::{ResolutionTier, GLOBAL_CACHE};

/// Encode RGBA bytes to WebP and save to cache
async fn save_rgba_as_webp(
    rgba_bytes: &[u8],
    width: u32,
    height: u32,
    cache_path: &std::path::Path,
) -> Result<(), String> {
    use image::codecs::webp::WebPEncoder;
    let start = std::time::Instant::now();
    
    // Encode RGBA to WebP
    let mut webp_data = Vec::new();
    let encoder = WebPEncoder::new_lossless(&mut webp_data);
    encoder.encode(rgba_bytes, width, height, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("WebP encoding failed: {}", e))?;
    let encode_time = start.elapsed();
    
    // Ensure parent directory exists
    if let Some(parent) = cache_path.parent() {
        tokio::fs::create_dir_all(parent).await
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    }
    
    // Write to file
    tokio::fs::write(cache_path, &webp_data).await
        .map_err(|e| format!("Failed to write WebP file: {}", e))?;
    
    eprintln!("[save_rgba_as_webp] Encoded {}x{} → {} bytes in {:?} (file: {:?})",
              width, height, webp_data.len(), encode_time, cache_path.file_name().unwrap_or_default());
    
    Ok(())
}

/// Extract a single frame using the native decoder (fast path)
/// Returns base64-encoded RGBA data URL for immediate display (no compression blocking)
#[tauri::command]
async fn decode_frame(
    video_path: String,
    time_secs: f64,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // Get or create decoder (reused across calls)
    let decoder = get_decoder(&video_path).await?;
    
    // Decode frame (3-15ms for subsequent frames with sequential optimization)
    let rgba_bytes = {
        let mut decoder_guard = decoder.lock().await;
        decoder_guard.decode_frame(time_secs, width, height)?
    };
    
    // Return raw RGBA as base64 data URL (no compression - instant!)
    // Format: data:image/rgba;base64,<base64_rgba>
    let base64_data = BASE64.encode(&rgba_bytes);
    Ok(format!("data:image/rgba;base64,{}", base64_data))
}

/// Extract multiple frames using the native decoder with streaming
/// Uses tile-based atlas system for efficient storage (32 thumbnails per sprite sheet)
/// 
/// Performance architecture:
/// - Immediate path: decode → RGBA → base64 → frontend (3-15ms, no compression)
/// - Background path: RGBA → WebP atlas → disk (non-blocking persistence)
/// 
/// This ensures timeline scrubbing never blocks on image compression.
#[tauri::command]
async fn decode_frames_streaming(
    video_path: String,
    timestamps: Vec<f64>,
    density: DensityLevel,
    width: u32,
    height: u32,
    _duration: f64,
    on_tile: tauri::ipc::Channel<ThumbnailTile>,
) -> Result<(), String> {
    use thumbnail_engine::atlas::{get_atlas_manager, AtlasBuilder, THUMBNAILS_PER_ATLAS};
    
    let start = std::time::Instant::now();
    let video_id = format!("{:x}", md5::compute(&video_path));
    let resolution_tier = if width >= 160 { ResolutionTier::Tier2x } else { ResolutionTier::Tier1x };
    
    eprintln!("[decode_frames_streaming] START video_id={} timestamps={} density={:?} size={}x{} (ATLAS MODE + IMMEDIATE RGBA)", 
              video_id, timestamps.len(), density, width, height);
    
    // Get cache directory
    let cache_dir = match GLOBAL_CACHE.cache_dir().await {
        Some(dir) => dir,
        None => return Err("Cache not initialized".to_string()),
    };
    
    // Get atlas manager for this video
    let atlas_manager = get_atlas_manager(&video_id, density, resolution_tier, cache_dir).await;
    
    // Check which frames are already in atlases
    let mut missing_times = Vec::new();
    let mut sent_count = 0u32;
    
    {
        let manager = atlas_manager.read().await;
        for &time in &timestamps {
            if let Some(location) = manager.get_location(time) {
                // Frame exists in atlas - send immediately
                let tile = ThumbnailTile::from_atlas(
                    time,
                    location.atlas_path.to_string_lossy().to_string(),
                    density,
                    location.col,
                    location.row,
                    width,
                    height,
                );
                
                match on_tile.send(tile) {
                    Ok(_) => {
                        sent_count += 1;
                        if sent_count <= 3 {
                            eprintln!("[STREAM] Sent cached atlas tile #{}: time={:.2}s atlas={} pos=({},{})", 
                                      sent_count, time, location.atlas_index, location.col, location.row);
                        }
                    }
                    Err(e) => {
                        eprintln!("[STREAM] ✗ Failed to send cached tile: {:?}", e);
                    }
                }
            } else {
                missing_times.push(time);
            }
        }
    }
    
    eprintln!("[decode_frames_streaming] Atlas check: cached={} missing={}", sent_count, missing_times.len());
    
    // If all cached, return early
    if missing_times.is_empty() {
        eprintln!("[decode_frames_streaming] All cached in atlases, returning early ({:?})", start.elapsed());
        return Ok(());
    }
    
    // Spawn extraction task - IMMEDIATE RGBA streaming + background atlas persistence
    let total_frames = timestamps.len();
    let handle = tokio::spawn(async move {
        let bg_start = std::time::Instant::now();
        eprintln!("[decode_frames_streaming] BG task starting, missing={} frames", missing_times.len());
        
        // Get decoder
        let decoder = match get_decoder(&video_path).await {
            Ok(d) => {
                eprintln!("[decode_frames_streaming] Decoder acquired ({:?})", bg_start.elapsed());
                d
            }
            Err(e) => {
                eprintln!("[decode_frames_streaming] Failed to get decoder: {}", e);
                return;
            }
        };
        
        // Process frames in batches of THUMBNAILS_PER_ATLAS (32)
        let mut frames_decoded = 0u32;
        let mut frames_failed = 0u32;
        let mut frames_sent = sent_count;
        let mut atlases_created = 0u32;
        
        for chunk in missing_times.chunks(THUMBNAILS_PER_ATLAS) {
            let chunk_start = std::time::Instant::now();
            
            // Create atlas builder for background persistence
            let mut atlas_builder = AtlasBuilder::new(width, height);
            let mut chunk_frames: Vec<(f64, Vec<u8>)> = Vec::new();
            
            // IMMEDIATE PATH: Decode and stream RGBA to frontend (no compression!)
            for &time in chunk {
                let decode_start = std::time::Instant::now();
                
                match decoder.lock().await.decode_frame(time, width, height) {
                    Ok(rgba_bytes) => {
                        let decode_time = decode_start.elapsed();
                        
                        // IMMEDIATE: Send raw RGBA as base64 to frontend (no WebP encoding!)
                        let base64_data = BASE64.encode(&rgba_bytes);
                        let rgba_data_url = format!("data:image/rgba;base64,{}", base64_data);
                        
                        let tile = ThumbnailTile::from_path(time, rgba_data_url, density);
                        
                        match on_tile.send(tile) {
                            Ok(_) => {
                                frames_sent += 1;
                                if frames_sent <= 3 || frames_sent % 20 == 0 {
                                    eprintln!("[STREAM] Sent RGBA tile #{}/{}: time={:.2}s decode={:?} (NO COMPRESSION)", 
                                              frames_sent, total_frames, time, decode_time);
                                }
                            }
                            Err(e) => {
                                eprintln!("[STREAM] ✗ Failed to send tile #{}: {:?}", frames_sent + 1, e);
                            }
                        }
                        
                        // Save RGBA for background atlas persistence
                        chunk_frames.push((time, rgba_bytes));
                        frames_decoded += 1;
                    }
                    Err(e) => {
                        frames_failed += 1;
                        if frames_failed <= 5 {
                            eprintln!("[decode_frames_streaming] Decode failed at {}s: {}", time, e);
                        }
                    }
                }
            }
            
            if chunk_frames.is_empty() {
                continue;
            }
            
            // BACKGROUND PATH: Persist to WebP atlas (non-blocking for frontend)
            let persist_start = std::time::Instant::now();
            
            // Allocate atlas locations
            let mut locations = Vec::new();
            {
                let mut manager = atlas_manager.write().await;
                for (time, rgba_bytes) in &chunk_frames {
                    let location = manager.allocate(*time);
                    
                    // Add thumbnail to atlas
                    if let Err(e) = atlas_builder.add_thumbnail(rgba_bytes) {
                        eprintln!("[decode_frames_streaming] Failed to add thumbnail to atlas: {}", e);
                        continue;
                    }
                    
                    locations.push((*time, location));
                }
            }
            
            // Save atlas to disk (background persistence)
            if let Some((_, first_location)) = locations.first() {
                if let Err(e) = atlas_builder.save(&first_location.atlas_path).await {
                    eprintln!("[decode_frames_streaming] Failed to save atlas: {}", e);
                } else {
                    atlases_created += 1;
                    let persist_time = persist_start.elapsed();
                    eprintln!("[PERSIST] Created atlas #{} with {} thumbnails in {:?} (background, non-blocking)", 
                              atlases_created, chunk_frames.len(), persist_time);
                }
            }
            
            let chunk_time = chunk_start.elapsed();
            eprintln!("[decode_frames_streaming] Chunk complete: {} frames in {:?}", chunk_frames.len(), chunk_time);
            
            // Yield between atlas batches
            tokio::task::yield_now().await;
        }
        
        eprintln!("[decode_frames_streaming] BG task complete: decoded={} failed={} sent={}/{} atlases={} total_time={:?}",
                  frames_decoded, frames_failed, frames_sent, total_frames, atlases_created, bg_start.elapsed());
    });
    
    // Await the task — invoke resolves only after all frames are streamed
    handle.await.map_err(|e| format!("Extraction task failed: {}", e))?;
    
    Ok(())
}

/// Release the native decoder for a video to free memory
/// Call this when a clip is removed from the project
#[tauri::command]
fn release_video_decoder(video_path: String) {
    release_decoder(&video_path);
}

/// Get video metadata using the native decoder (fast, no sidecar)
#[tauri::command]
async fn get_video_metadata_fast(video_path: String) -> Result<serde_json::Value, String> {
    let decoder = get_decoder(&video_path).await?;
    let guard = decoder.lock().await;
    
    Ok(serde_json::json!({
        "duration": guard.duration,
        "width": guard.width,
        "height": guard.height,
        "path": video_path,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(dir) = handle.path().app_cache_dir() {
                    let _ = init_thumbnail_engine(dir).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_thumbnail_cache,
            get_thumbnail_cache_stats,
            clear_thumbnail_cache,
            extract_poster_frame_command,
            commands::media::get_video_metadata,
            commands::media::extract_poster_frame,
            commands::project::save_project,
            commands::project::load_project,
            commands::project::get_recent_projects,
            commands::project::delete_project,
            // Native FFmpeg decoder commands (fast path for thumbnails)
            decode_frame,
            decode_frames_streaming,
            release_video_decoder,
            get_video_metadata_fast,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
