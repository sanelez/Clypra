use std::path::PathBuf;
use tauri::Manager;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

/// Downsampled peak envelope of the first audio stream (for waveform UI). Returns ~`bucket_count`
/// values in 0..1. If there is no audio, returns zeros.
#[tauri::command]
async fn audio_waveform_peaks(input_path: String, bucket_count: u32) -> Result<Vec<f32>, String> {
    // Check FFmpeg availability first
    if let Err(_) = check_ffmpeg_available().await {
        // Return empty peaks if FFmpeg not available (non-critical feature)
        return Ok(vec![0.0; (bucket_count as usize).clamp(32, 512)]);
    }

    let buckets = (bucket_count as usize).clamp(32, 512);
    let has = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            &input_path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stream_list = String::from_utf8_lossy(&has.stdout);
    if !has.status.success() || stream_list.trim().is_empty() {
        return Ok(vec![0.0; buckets]);
    }

    let probe = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &input_path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !probe.status.success() {
        return Ok(vec![0.0; buckets]);
    }

    let duration: f64 = String::from_utf8_lossy(&probe.stdout)
        .trim()
        .parse()
        .unwrap_or(0.0);

    if !duration.is_finite() || duration <= 0.0 {
        return Ok(vec![0.0; buckets]);
    }

    const SR: u32 = 8000;
    let total_samples = ((duration * f64::from(SR)).floor() as usize).max(1);
    let samples_per_bucket = (total_samples / buckets).max(1);

    let mut child = Command::new("ffmpeg")
        .args([
            "-v",
            "error",
            "-i",
            &input_path,
            "-map",
            "0:a:0",
            "-ac",
            "1",
            "-ar",
            &SR.to_string(),
            "-f",
            "f32le",
            "-",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("ffmpeg: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("no ffmpeg stdout")?;

    let mut peaks = vec![0.0f32; buckets];
    let mut bucket_idx = 0usize;
    let mut count_in_bucket = 0usize;
    let mut max_in_bucket = 0.0f32;

    let mut stash: Vec<u8> = Vec::new();
    let mut buf = vec![0u8; 32 * 1024];

    loop {
        let n = stdout.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        stash.extend_from_slice(&buf[..n]);
        let mut i = 0usize;
        while i + 4 <= stash.len() {
            let sample = f32::from_le_bytes(stash[i..i + 4].try_into().unwrap());
            i += 4;
            let a = sample.abs();
            if bucket_idx >= buckets {
                continue;
            }
            if count_in_bucket >= samples_per_bucket {
                peaks[bucket_idx] = max_in_bucket;
                bucket_idx += 1;
                count_in_bucket = 0;
                max_in_bucket = 0.0;
            }
            if a > max_in_bucket {
                max_in_bucket = a;
            }
            count_in_bucket += 1;
        }
        if i > 0 {
            stash.copy_within(i.., 0);
            stash.truncate(stash.len() - i);
        }
    }

    if bucket_idx < buckets && (count_in_bucket > 0 || max_in_bucket > 0.0) {
        peaks[bucket_idx] = max_in_bucket;
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Ok(vec![0.0; buckets]);
    }

    let mut max_peak = 0.0f32;
    for &p in &peaks {
        if p > max_peak {
            max_peak = p;
        }
    }
    if max_peak > 1.0e-12 {
        for p in &mut peaks {
            *p = (*p / max_peak).min(1.0);
        }
    }

    Ok(peaks)
}

/// Trim `input_path` to `[start_sec, end_sec)` and write to `output_path` using stream copy.
/// Requires `ffmpeg` on `PATH` (e.g. `brew install ffmpeg` on macOS).
#[tauri::command]
async fn trim_export(
    input_path: String,
    output_path: String,
    start_sec: f64,
    end_sec: f64,
) -> Result<(), String> {
    // Check FFmpeg availability first
    if let Err(e) = check_ffmpeg_available().await {
        return Err(e);
    }

    if !end_sec.is_finite() || !start_sec.is_finite() {
        return Err("Start and end times must be finite numbers.".into());
    }
    if end_sec <= start_sec {
        return Err("End time must be greater than start time.".into());
    }

    let ss = format!("{:.6}", start_sec);
    let to = format!("{:.6}", end_sec);

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &input_path,
            "-ss",
            &ss,
            "-to",
            &to,
            "-c",
            "copy",
            &output_path,
        ])
        .output()
        .await
        .map_err(|e| {
            format!(
                "Could not run ffmpeg ({e}). Install ffmpeg and ensure it is on your PATH."
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = stderr.trim();
        let msg = if tail.len() > 800 {
            format!("...{}", &tail[tail.len().saturating_sub(800)..])
        } else {
            tail.to_string()
        };
        return Err(format!("ffmpeg failed:\n{msg}"));
    }

    Ok(())
}

/// RAII guard for temp directory cleanup
/// Automatically removes directory when dropped, even on panic
struct TempDirGuard(PathBuf);

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

/// Get hardware acceleration arguments for FFmpeg based on platform
/// Uses VideoToolbox on macOS, DXVA2/D3D11VA on Windows, VAAPI on Linux
fn get_hwaccel_args() -> Vec<&'static str> {
    #[cfg(target_os = "macos")]
    {
        vec!["-hwaccel", "videotoolbox"]
    }
    #[cfg(target_os = "windows")]
    {
        // Try D3D11VA first (newer), fallback to DXVA2
        vec!["-hwaccel", "d3d11va", "-hwaccel_output_format", "nv12"]
    }
    #[cfg(target_os = "linux")]
    {
        vec!["-hwaccel", "vaapi", "-vaapi_device", "/dev/dri/renderD128"]
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        vec![]
    }
}

/// Check if FFmpeg is installed and available on PATH
async fn check_ffmpeg_available() -> Result<(), String> {
    match Command::new("ffmpeg").arg("-version").output().await {
        Ok(output) if output.status.success() => Ok(()),
        Ok(_) => Err("FFmpeg found but returned error".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err("FFmpeg not found. Please install FFmpeg:\n• macOS: brew install ffmpeg\n• Ubuntu: sudo apt install ffmpeg\n• Windows: Download from ffmpeg.org".into())
        }
        Err(e) => Err(format!("Failed to check FFmpeg: {}", e)),
    }
}

/// Extract a single frame at the specified time from a video file.
/// Returns a base64-encoded PNG data URL for display in the frontend.
/// Uses FFmpeg for frame-accurate extraction with timeout protection.
#[tauri::command]
async fn extract_frame_at_time(
    input_path: String,
    time_secs: f64,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // Check FFmpeg availability first
    if let Err(e) = check_ffmpeg_available().await {
        return Err(e);
    }

    // Validate inputs
    if !time_secs.is_finite() || time_secs < 0.0 {
        return Err("Time must be a non-negative finite number".into());
    }
    if width == 0 || height == 0 {
        return Err("Width and height must be positive".into());
    }

    let time_str = format!("{:.6}", time_secs);
    let scale_str = format!("{}:{}", width, height);

    use tokio::time::{timeout, Duration};

    // Hybrid seeking strategy for frame-accurate extraction:
    // 1. Fast seek to 2 seconds before target (keyframe, fast)
    // 2. Precise decode the remaining 2 seconds to exact frame (accurate)
    let fast_seek_time = (time_secs - 2.0).max(0.0);
    let precise_seek_secs = if fast_seek_time > 0.0 { "2.0" } else { &time_str };
    
    let fast_seek_str = format!("{:.3}", fast_seek_time);

    // Build FFmpeg args with hardware acceleration if available
    let hwaccel_args = get_hwaccel_args();
    let mut ffmpeg_args: Vec<&str> = vec![
        "-hide_banner",
        "-loglevel", "error",
        // Fast input seek to keyframe near target (fast but less accurate)
        "-ss", &fast_seek_str,
    ];
    
    // Add hardware acceleration args before -i
    ffmpeg_args.extend(hwaccel_args.iter().cloned());
    
    // Create vf filter string with proper lifetime
    let vf_filter = format!("scale={}:force_original_aspect_ratio=decrease,pad={}:(ow-iw)/2:(oh-ih)/2:black", scale_str, scale_str);
    
    // Continue with input and output args
    ffmpeg_args.extend([
        "-i", &input_path,
        // Precise output seek to exact frame (decodes from keyframe to target)
        "-ss", precise_seek_secs,
        // Output just one frame
        "-vframes", "1",
        // Scale to requested dimensions
        "-vf", &vf_filter,
        // PNG for lossless quality
        "-f", "image2",
        "-vcodec", "png",
        "-pix_fmt", "rgba",
        "pipe:1", // Output to stdout
    ]);

    // Spawn FFmpeg with 5-second timeout
    let ffmpeg_result = timeout(
        Duration::from_secs(5),
        Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await;

    match ffmpeg_result {
        Ok(Ok(output)) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("FFmpeg failed: {}", stderr));
            }

            // Encode PNG bytes to base64 data URL
            let base64_data = base64::encode(&output.stdout);
            Ok(format!("data:image/png;base64,{}", base64_data))
        }
        Ok(Err(e)) => Err(format!("Failed to spawn FFmpeg: {}", e)),
        Err(_) => Err("Frame extraction timeout (5s exceeded)".into()),
    }
}

/// Extract multiple frames for filmstrip generation.
/// More efficient than multiple extract_frame_at_time calls.
#[tauri::command]
async fn extract_filmstrip_frames(
    input_path: String,
    frame_count: u32,
    width: u32,
    height: u32,
) -> Result<Vec<String>, String> {
    // Check FFmpeg availability first
    if let Err(e) = check_ffmpeg_available().await {
        return Err(e);
    }

    if frame_count == 0 || frame_count > 100 {
        return Err("Frame count must be between 1 and 100".into());
    }
    if width == 0 || height == 0 {
        return Err("Width and height must be positive".into());
    }

    use tokio::time::{timeout, Duration};

    // Probe video for duration and frame rate
    let probe = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration:stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1",
            &input_path,
        ])
        .output()
        .await
        .map_err(|e| format!("FFprobe failed: {}", e))?;

    if !probe.status.success() {
        return Err("Failed to probe video".into());
    }

    let probe_output = String::from_utf8_lossy(&probe.stdout);
    let mut duration = 0.0;
    let mut fps = 30.0; // Default fallback

    for line in probe_output.lines() {
        if line.starts_with("duration=") {
            duration = line.trim_start_matches("duration=").parse().unwrap_or(0.0);
        } else if line.starts_with("r_frame_rate=") {
            // Parse fraction like "30000/1001" for 29.97fps
            let fps_str = line.trim_start_matches("r_frame_rate=");
            if let Some((num, den)) = fps_str.split_once('/') {
                if let (Ok(n), Ok(d)) = (num.parse::<f64>(), den.parse::<f64>()) {
                    if d > 0.0 {
                        fps = n / d;
                    }
                }
            } else if let Ok(f) = fps_str.parse::<f64>() {
                fps = f;
            }
        }
    }

    if duration <= 0.0 {
        return Err("Invalid video duration".into());
    }

    // Create temp directory for frames with RAII cleanup guard
    let temp_dir = std::env::temp_dir().join("kyro_filmstrip").join(
        &format!("{}_{}", 
            input_path.replace(['/', '\\', ':'], "_"),
            std::process::id()
        )
    );
    
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let _temp_guard = TempDirGuard(temp_dir.clone()); // Auto-cleanup on drop

    // Calculate frame interval using actual video FPS
    let interval = duration / f64::from(frame_count);
    let select_expr = (0..frame_count)
        .map(|i| format!("eq(n,{})", (i as f64 * interval * fps) as u32))
        .collect::<Vec<_>>()
        .join("+");

    let scale_str = format!("{}:{}", width, height);
    let output_pattern = temp_dir.join("frame_%03d.png").to_string_lossy().to_string();

    // Extract all frames in one FFmpeg call with hardware acceleration
    let hwaccel_args = get_hwaccel_args();
    let mut ffmpeg_args: Vec<&str> = vec![
        "-hide_banner",
        "-loglevel", "error",
    ];
    
    // Add hardware acceleration args before -i
    ffmpeg_args.extend(hwaccel_args.iter().cloned());
    
    // Create filter string with proper lifetime
    let filter_str = format!(
        "select='{}',scale={}:force_original_aspect_ratio=decrease,pad={}:(ow-iw)/2:(oh-ih)/2:black,setpts=N/FRAME_RATE/TB",
        select_expr, scale_str, scale_str
    );
    
    // Continue with input and filter args
    ffmpeg_args.extend([
        "-i", &input_path,
        "-vf", &filter_str,
        "-vsync", "vfr",
        &output_pattern,
    ]);

    let ffmpeg_result = timeout(
        Duration::from_secs(30),
        Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .output(),
    )
    .await;

    match ffmpeg_result {
        Ok(Ok(output)) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("FFmpeg failed: {}", stderr));
            }

            // Read and encode each frame
            let mut frames = Vec::new();
            for i in 1..=frame_count {
                let frame_path = temp_dir.join(format!("frame_{:03}.png", i));
                if let Ok(data) = std::fs::read(&frame_path) {
                    let base64_data = base64::encode(&data);
                    frames.push(format!("data:image/png;base64,{}", base64_data));
                }
            }

            // TempDirGuard auto-cleans temp directory when function returns

            if frames.is_empty() {
                return Err("No frames extracted".into());
            }

            Ok(frames)
        }
        Ok(Err(e)) => {
            Err(format!("Failed to spawn FFmpeg: {}", e))
        }
        Err(_) => {
            Err("Filmstrip extraction timeout (30s exceeded)".into())
        }
    }
}

/// Get the frame cache directory path
/// Creates the directory if it doesn't exist
#[tauri::command]
fn get_frame_cache_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get app cache dir: {}", e))?
        .join("frames");
    
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;
    
    Ok(cache_dir.to_string_lossy().to_string())
}

/// Check if a cached frame exists and return its path
#[tauri::command]
fn get_cached_frame_path(
    app_handle: tauri::AppHandle,
    video_path: String,
    time_secs: f64,
    width: u32,
    height: u32,
) -> Result<Option<String>, String> {
    let cache_dir = get_frame_cache_dir(app_handle)?;
    
    // Create a unique hash for this frame request
    let frame_key = format!("{}_{:.3}_{}x{}", video_path, time_secs, width, height);
    let hash = format!("{:x}", md5::compute(&frame_key));
    let frame_path = std::path::PathBuf::from(&cache_dir).join(format!("{}.png", hash));
    
    if frame_path.exists() {
        Ok(Some(frame_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Save a frame (from data URL) to persistent cache
#[tauri::command]
fn save_frame_to_cache(
    app_handle: tauri::AppHandle,
    video_path: String,
    time_secs: f64,
    width: u32,
    height: u32,
    data_url: String,
) -> Result<String, String> {
    let cache_dir = get_frame_cache_dir(app_handle)?;
    
    // Create a unique hash for this frame request
    let frame_key = format!("{}_{:.3}_{}x{}", video_path, time_secs, width, height);
    let hash = format!("{:x}", md5::compute(&frame_key));
    let frame_path = std::path::PathBuf::from(&cache_dir).join(format!("{}.png", hash));
    
    // Parse data URL and save
    if let Some(base64_data) = data_url.strip_prefix("data:image/png;base64,") {
        let decoded = base64::decode(base64_data)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;
        std::fs::write(&frame_path, decoded)
            .map_err(|e| format!("Failed to write frame: {}", e))?;
        Ok(frame_path.to_string_lossy().to_string())
    } else {
        Err("Invalid data URL format".into())
    }
}

/// Read a cached frame and return as base64 data URL
#[tauri::command]
fn read_cached_frame(
    app_handle: tauri::AppHandle,
    video_path: String,
    time_secs: f64,
    width: u32,
    height: u32,
) -> Result<Option<String>, String> {
    if let Some(path) = get_cached_frame_path(app_handle, video_path, time_secs, width, height)? {
        let data = std::fs::read(&path)
            .map_err(|e| format!("Failed to read cached frame: {}", e))?;
        let base64_data = base64::encode(&data);
        Ok(Some(format!("data:image/png;base64,{}", base64_data)))
    } else {
        Ok(None)
    }
}

/// Clear the entire frame cache
#[tauri::command]
fn clear_frame_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = get_frame_cache_dir(app_handle)?;
    let _ = std::fs::remove_dir_all(&cache_dir);
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to recreate cache dir: {}", e))?;
    Ok(())
}

/// Get cache size in MB
#[tauri::command]
fn get_frame_cache_size(app_handle: tauri::AppHandle) -> Result<f64, String> {
    let cache_dir = get_frame_cache_dir(app_handle)?;
    let mut total_size = 0u64;
    
    for entry in walkdir::WalkDir::new(&cache_dir).into_iter().flatten() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                total_size += metadata.len();
            }
        }
    }
    
    Ok(total_size as f64 / (1024.0 * 1024.0)) // Convert to MB
}

#[cfg(test)]
mod lib_test;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            trim_export,
            audio_waveform_peaks,
            extract_frame_at_time,
            extract_filmstrip_frames,
            get_frame_cache_dir,
            get_cached_frame_path,
            save_frame_to_cache,
            read_cached_frame,
            clear_frame_cache,
            get_frame_cache_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
