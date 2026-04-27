use crate::models::VideoMetadata;
use std::process::Command;
use std::fs;

#[tauri::command]
pub fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-of", "default=noprint_wrappers=1:nokey=1:noescapestr=1",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {}", e))?;

    if !output.status.success() {
        return Err("Failed to read video metadata".to_string());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = output_str.trim().lines().collect();

    if lines.len() < 4 {
        return Err("Invalid ffprobe output".to_string());
    }

    let width = lines[0].parse::<u32>().unwrap_or(1920);
    let height = lines[1].parse::<u32>().unwrap_or(1080);
    let fps_str = lines[2];
    let fps = if let Some(idx) = fps_str.find('/') {
        let num = fps_str[..idx].parse::<f64>().unwrap_or(30.0);
        let den = fps_str[idx + 1..].parse::<f64>().unwrap_or(1.0);
        num / den
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    };
    let duration = lines[3].parse::<f64>().unwrap_or(0.0);

    let metadata = fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(VideoMetadata {
        duration,
        width,
        height,
        fps,
        size: metadata,
    })
}

#[tauri::command]
pub fn extract_poster_frame(path: String, time: f64) -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(&[
            "-ss", &time.to_string(),
            "-i", &path,
            "-vframes", "1",
            "-f", "image2",
            "-vcodec", "png",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        return Err("Failed to extract poster frame".to_string());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    Ok(format!("data:image/png;base64,{}", encoded))
}
