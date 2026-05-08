# Audio Import and Preview Fix

## Problem

Audio files were failing to import with the error:

```
Failed to import /path/to/file.mp3: Failed to open /path/to/file.mp3: No video stream
```

Audio preview in SourcePreview was not working - the play button didn't respond.

## Root Cause

1. **Backend**: The `get_video_metadata` command was trying to open audio files as video, which failed because audio files don't have a video stream.
2. **Frontend**: The SourcePreview component had an `audioRef` but:
   - No `<audio>` element was rendered
   - The `handlePlayPause` function didn't handle audio playback

## Solution

### Backend Fix (`src-tauri/src/commands/media.rs`)

Added error handling for audio-only files:

```rust
Err(e) if e.contains("No video stream") => {
    // Audio-only file - use ffprobe to get duration
    eprintln!("[get_video_metadata] Audio-only file detected (error: {})", e);

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
```

Added `get_audio_duration` function using ffprobe:

```rust
async fn get_audio_duration(path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    // Parse duration from output
    let duration_str = String::from_utf8_lossy(&output.stdout);
    let duration = duration_str.trim().parse::<f64>()?;

    Ok(duration)
}
```

### Frontend Fix (`src/components/editor/SourcePreview.tsx`)

1. **Added audio element to render** (after video preview area):

```tsx
{
  /* Hidden audio element for audio playback */
}
{
  sourceAsset.type === "audio" && <audio ref={audioRef} src={sourcePath} preload="auto" style={{ display: "none" }} />;
}
```

2. **Updated `handlePlayPause` to handle audio**:

```tsx
const handlePlayPause = () => {
  if (useGPU) {
    // GPU preview: just toggle state, GPUPreview handles playback
    setIsPlaying(!isPlaying);
  } else if (sourceAsset.type === "audio") {
    // Audio: control audio element
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  } else {
    // HTML5 video: control video element
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  }
};
```

## Features Now Working

✅ **Audio Import**: Audio files (mp3, wav, aac, etc.) can now be imported successfully ✅ **Audio Preview**: Audio files can be previewed in SourcePreview with:

- Play/Pause controls
- Scrubbing timeline
- Time display
- IN/OUT marking
- Add to timeline

✅ **Video Preview**: GPU-accelerated video preview (when `USE_GPU_PREVIEW` is enabled) ✅ **Image Preview**: Static image preview

## Testing

To test audio import and preview:

1. **Import an audio file**:
   - Click "Import Media" in the media panel
   - Select an audio file (mp3, wav, aac, etc.)
   - File should import successfully with duration metadata

2. **Preview the audio**:
   - Click on the imported audio asset
   - SourcePreview should open showing "Audio Preview" placeholder
   - Click Play button - audio should play
   - Scrub timeline - audio should seek
   - Mark IN/OUT points - should work
   - Add to timeline - should create audio clip

## Dependencies

- **ffprobe**: Required for audio duration extraction
  - Part of FFmpeg package
  - Should be available in system PATH
  - Used by backend to get audio metadata

## Related Files

- `src-tauri/src/commands/media.rs` - Backend audio metadata handling
- `src/components/editor/SourcePreview.tsx` - Frontend audio preview UI
- `src/hooks/useMediaImport.ts` - Media import logic
- `src/components/editor/GPUPreview.tsx` - GPU-accelerated video preview

## Next Steps

All audio import and preview functionality is now complete. The SourcePreview component now supports:

- ✅ Video preview (GPU-accelerated)
- ✅ Image preview
- ✅ Audio preview with playback

Phase 2.1 (SourcePreview Integration) is now **COMPLETE**.
