use crate::thumbnail_engine::decoder::get_decoder;
use crate::models::VideoMetadata;
use base64::Engine;
use image::ImageEncoder;
use std::fs;

/// Get video metadata using native FFmpeg decoder (fast, no CLI overhead)
/// Also supports audio files (returns width=0, height=0 for audio-only)
#[tauri::command]
pub async fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    // Try to use native decoder to get metadata
    match get_decoder(&path).await {
        Ok(decoder) => {
            let guard = decoder.lock().await;
            
            let mut width = guard.width;
            let mut height = guard.height;
            let rotation = guard.rotation();
            let duration = guard.duration;
            let fps = guard.fps();
            
            // Swap dimensions for 90° and 270° rotations (portrait videos)
            if rotation == 90 || rotation == 270 {
                std::mem::swap(&mut width, &mut height);
            }
            
            drop(guard); // Release lock
            
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

            Ok(VideoMetadata {
                duration,
                width,
                height,
                fps,
                size,
            })
        }
        Err(e) if e.contains("No video stream") => {
            // Audio-only file - return metadata with width=0, height=0
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let duration = get_audio_duration(&path).await.unwrap_or(0.0);
            
            Ok(VideoMetadata {
                duration,
                width: 0,
                height: 0,
                fps: 0.0,
                size,
            })
        }
        Err(e) => Err(e),
    }
}

/// Get audio duration using ffprobe
async fn get_audio_duration(path: &str) -> Result<f64, String> {
    use std::process::Command;
    
    eprintln!("[get_audio_duration] Attempting to get duration for: {}", path);
    
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| {
            eprintln!("[get_audio_duration] Failed to run ffprobe: {}", e);
            format!("Failed to run ffprobe: {}", e)
        })?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[get_audio_duration] ffprobe failed: {}", stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }
    
    let duration_str = String::from_utf8_lossy(&output.stdout);
    eprintln!("[get_audio_duration] ffprobe output: {}", duration_str);
    
    let duration = duration_str.trim().parse::<f64>()
        .map_err(|e| {
            eprintln!("[get_audio_duration] Failed to parse duration '{}': {}", duration_str, e);
            format!("Failed to parse duration: {}", e)
        })?;
    
    eprintln!("[get_audio_duration] Successfully parsed duration: {}s", duration);
    Ok(duration)
}

/// Extract poster frame using native decoder (fast, no CLI overhead)
#[tauri::command]
pub async fn extract_poster_frame(path: String, time: f64) -> Result<String, String> {
    use image::codecs::png::PngEncoder;
    
    eprintln!("[extract_poster_frame] Extracting frame at {}s from {}", time, path);
    
    // Use native decoder
    let decoder = get_decoder(&path).await?;
    
    // Decode frame at specified time (90px height for poster)
    let rgba_bytes = {
        let mut guard = decoder.lock().await;
        guard.decode_frame(time, 160, 90)?
    };
    
    // Encode to PNG
    let mut png_data = Vec::new();
    let encoder = PngEncoder::new(&mut png_data);
    encoder.write_image(&rgba_bytes, 160, 90, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;
    
    let encoded = base64::engine::general_purpose::STANDARD.encode(&png_data);
    Ok(format!("data:image/png;base64,{}", encoded))
}

/// Extract album artwork from audio file (MP3 ID3 tags, etc.)
#[tauri::command]
pub async fn extract_audio_artwork(path: String) -> Result<Option<String>, String> {
    use std::process::Command;
    
    eprintln!("[extract_audio_artwork] Extracting artwork from: {}", path);
    
    // Use ffmpeg to extract embedded artwork
    let output = Command::new("ffmpeg")
        .args(&[
            "-i", &path,
            "-an", // No audio
            "-vcodec", "copy",
            "-f", "image2pipe",
            "-vframes", "1",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    
    if !output.status.success() || output.stdout.is_empty() {
        eprintln!("[extract_audio_artwork] No artwork found");
        return Ok(None);
    }
    
    // Encode to base64
    let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    let mime_type = "image/jpeg"; // Most audio artwork is JPEG
    
    eprintln!("[extract_audio_artwork] Extracted artwork ({} bytes)", output.stdout.len());
    Ok(Some(format!("data:{};base64,{}", mime_type, encoded)))
}
