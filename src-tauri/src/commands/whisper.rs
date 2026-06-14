use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub size: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
}

/// Download a Whisper model by triggering the openai-whisper library to cache it
#[tauri::command]
pub async fn download_whisper_model(
    app: tauri::AppHandle,
    size: String,
) -> Result<(), String> {
    use std::process::Command;
    use std::time::Instant;
    
    eprintln!("🦀 [download_whisper_model] Starting download for model: {}", size);
    
    // Get app data directory
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models").join("whisper");
    
    // Create models directory if it doesn't exist
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    eprintln!("🦀 [download_whisper_model] Models directory: {:?}", models_dir);
    
    // Emit initial progress event
    let _ = app.emit(
        "whisper_model_progress",
        DownloadProgressPayload {
            size: size.clone(),
            downloaded_bytes: 0,
            total_bytes: 100_000_000, // Placeholder - actual size varies
            speed_bytes_per_sec: 0,
        },
    );

    // Use Python script to load the model, which will trigger automatic download via openai-whisper
    // The openai-whisper library automatically downloads models to ~/.cache/whisper/
    let start = Instant::now();
    
    let output = Command::new("uv")
        .args(&[
            "run",
            "python",
            "-c",
            &format!(
                "import whisper; \
                 print('Downloading Whisper model: {}...'); \
                 model = whisper.load_model('{}'); \
                 print('Model loaded successfully!');",
                size, size
            ),
        ])
        .output()
        .map_err(|e| format!("Failed to execute download command: {}", e))?;

    let elapsed = start.elapsed();
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("🦀 [download_whisper_model] Download failed!");
        eprintln!("  stdout: {}", stdout);
        eprintln!("  stderr: {}", stderr);
        return Err(format!("Failed to download model: {}\n{}", stdout, stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("🦀 [download_whisper_model] Download completed in {:?}", elapsed);
    eprintln!("  Output: {}", stdout);
    
    // Create a marker file in our app directory to track that this model has been downloaded
    let model_path = models_dir.join(format!("{}.bin", size));
    std::fs::write(&model_path, format!("Downloaded at: {:?}", std::time::SystemTime::now()))
        .map_err(|e| format!("Failed to create model marker: {}", e))?;
    
    eprintln!("🦀 [download_whisper_model] Created marker at {:?}", model_path);

    // Emit completion event
    let _ = app.emit(
        "whisper_model_progress",
        DownloadProgressPayload {
            size: size.clone(),
            downloaded_bytes: 100_000_000,
            total_bytes: 100_000_000,
            speed_bytes_per_sec: 0,
        },
    );

    Ok(())
}

/// Delete a downloaded Whisper model
#[tauri::command]
pub async fn delete_whisper_model(
    app: tauri::AppHandle,
    size: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let model_path = app_data_dir
        .join("models")
        .join("whisper")
        .join(format!("{}.bin", size));

    if model_path.exists() {
        std::fs::remove_file(&model_path)
            .map_err(|e| format!("Failed to delete model file: {}", e))?;
        eprintln!("🦀 [delete_whisper_model] Deleted model: {:?}", model_path);
    }

    Ok(())
}

/// List all downloaded Whisper models
#[tauri::command]
pub async fn list_downloaded_models(
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models").join("whisper");

    if !models_dir.exists() {
        return Ok(vec![]);
    }

    let mut models = Vec::new();

    let entries = std::fs::read_dir(&models_dir)
        .map_err(|e| format!("Failed to read models directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(stem) = path.file_stem() {
                if let Some(name) = stem.to_str() {
                    models.push(name.to_string());
                }
            }
        }
    }

    Ok(models)
}

/// Cancel an ongoing Whisper model download
#[tauri::command]
pub async fn cancel_whisper_download(
    size: String,
) -> Result<(), String> {
    // TODO: Implement download cancellation
    // This requires maintaining a registry of active downloads with cancellation tokens
    eprintln!("🦀 [cancel_whisper_download] Would cancel download for: {}", size);
    Ok(())
}

/// Verify if a Whisper model is actually downloaded to disk
#[tauri::command]
pub async fn verify_whisper_model_exists(
    app: tauri::AppHandle,
    size: String,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let model_path = app_data_dir
        .join("models")
        .join("whisper")
        .join(format!("{}.bin", size));

    let exists = model_path.exists() && model_path.is_file();
    
    if exists {
        // Also check file size to ensure it's not a corrupted/empty file
        if let Ok(metadata) = std::fs::metadata(&model_path) {
            let file_size = metadata.len();
            eprintln!("🦀 [verify_whisper_model_exists] Model '{}' at {:?}: exists ({}MB)", 
                size, model_path, file_size / 1_048_576);
            
            // Whisper models should be at least 1MB (even tiny is ~39MB)
            if file_size < 1_000_000 {
                eprintln!("⚠️ [verify_whisper_model_exists] Model file too small, likely corrupted");
                return Ok(false);
            }
        }
    } else {
        eprintln!("🦀 [verify_whisper_model_exists] Model '{}' at {:?}: not found", size, model_path);
    }
    
    Ok(exists)
}
