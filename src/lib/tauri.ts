import { invoke } from "@tauri-apps/api/core";

/**
 * Generates audio waveform peaks for visualization.
 */
export async function getAudioWaveformPeaks(inputPath: string, bucketCount: number): Promise<number[]> {
  return invoke<number[]>("audio_waveform_peaks", {
    inputPath,
    bucketCount,
  });
}

/**
 * Exports a trimmed video segment.
 */
export async function exportTrimmedVideo(inputPath: string, outputPath: string, startSec: number, endSec: number): Promise<void> {
  return invoke("trim_export", {
    inputPath,
    outputPath,
    startSec,
    endSec,
  });
}

/**
 * Extract a single video frame at a specific time using FFmpeg.
 * Returns a base64-encoded PNG data URL.
 */
export async function extractFrameAtTime(inputPath: string, timeSecs: number, width: number, height: number): Promise<string> {
  return invoke<string>("extract_frame_at_time", {
    inputPath,
    timeSecs,
    width,
    height,
  });
}

/**
 * Extract multiple frames for filmstrip generation.
 * More efficient than multiple individual frame extractions.
 * Returns an array of base64-encoded PNG data URLs.
 */
export async function extractFilmstripFrames(inputPath: string, frameCount: number, width: number, height: number): Promise<string[]> {
  return invoke<string[]>("extract_filmstrip_frames", {
    inputPath,
    frameCount,
    width,
    height,
  });
}

// --- Persistent Frame Cache Commands ---

/**
 * Get the frame cache directory path.
 * Creates the directory if it doesn't exist.
 */
export async function getFrameCacheDir(): Promise<string> {
  return invoke<string>("get_frame_cache_dir");
}

/**
 * Check if a cached frame exists for given parameters.
 * Returns the file path if it exists, null otherwise.
 */
export async function getCachedFramePath(videoPath: string, timeSecs: number, width: number, height: number): Promise<string | null> {
  return invoke<string | null>("get_cached_frame_path", {
    videoPath,
    timeSecs,
    width,
    height,
  });
}

/**
 * Save a frame (from data URL) to persistent cache.
 * Returns the path where the frame was saved.
 */
export async function saveFrameToCache(videoPath: string, timeSecs: number, width: number, height: number, dataUrl: string): Promise<string> {
  return invoke<string>("save_frame_to_cache", {
    videoPath,
    timeSecs,
    width,
    height,
    dataUrl,
  });
}

/**
 * Read a cached frame and return as base64 data URL.
 * Returns the data URL if found, null otherwise.
 */
export async function readCachedFrame(videoPath: string, timeSecs: number, width: number, height: number): Promise<string | null> {
  return invoke<string | null>("read_cached_frame", {
    videoPath,
    timeSecs,
    width,
    height,
  });
}

/**
 * Clear the entire frame cache.
 */
export async function clearFrameCache(): Promise<void> {
  return invoke("clear_frame_cache");
}

/**
 * Get the current frame cache size in megabytes.
 */
export async function getFrameCacheSize(): Promise<number> {
  return invoke<number>("get_frame_cache_size");
}

// --- Rust Thumbnail Engine Commands ---

/**
 * Initialize the thumbnail engine with app cache directory.
 * Should be called once on app startup.
 */
export async function initThumbnailCache(): Promise<void> {
  return invoke("init_thumbnail_cache");
}

/**
 * Get thumbnails for visible time range using CapCut-style grid sampling.
 * Returns array of [time, dataUrl, xPosition] tuples.
 */
export async function getThumbnailsForRange(videoPath: string, visibleStart: number, visibleEnd: number, pxPerSec: number, rulerInterval: number, thumbsPerInterval: number): Promise<Array<{ time: number; dataUrl: string; x: number }>> {
  const results = await invoke<Array<[number, string, number]>>("get_thumbnails_for_range", {
    videoPath,
    visibleStart,
    visibleEnd,
    pxPerSec,
    rulerInterval,
    thumbsPerInterval,
  });
  // Convert tuples to objects
  return results.map(([time, dataUrl, x]) => ({ time, dataUrl, x }));
}

/**
 * Get low-resolution placeholder thumbnails for visible time range.
 * Uses 50% resolution for faster generation.
 * Returns array of [time, dataUrl, xPosition] tuples.
 */
export async function getPlaceholderThumbnailsForRange(videoPath: string, visibleStart: number, visibleEnd: number, pxPerSec: number, rulerInterval: number, thumbsPerInterval: number): Promise<Array<{ time: number; dataUrl: string; x: number }>> {
  const results = await invoke<Array<[number, string, number]>>("get_placeholder_thumbnails_for_range", {
    videoPath,
    visibleStart,
    visibleEnd,
    pxPerSec,
    rulerInterval,
    thumbsPerInterval,
  });
  // Convert tuples to objects
  return results.map(([time, dataUrl, x]) => ({ time, dataUrl, x }));
}

/**
 * Get thumbnail cache statistics.
 */
export async function getThumbnailCacheStats(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("get_thumbnail_cache_stats");
}

/**
 * Clear thumbnail cache for a specific video.
 */
export async function clearThumbnailCache(videoPath: string): Promise<void> {
  return invoke("clear_thumbnail_cache", { videoPath });
}
