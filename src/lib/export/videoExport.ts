/**
 * Video Export
 *
 * High-level API for exporting videos using FFmpeg.
 * Integrates with the frame scheduler for frame rendering.
 *
 * Architecture:
 *   Timeline → Frame Scheduler → RGBA Frames → FFmpeg → MP4/MOV
 */

import { invoke, Channel, convertFileSrc } from "@tauri-apps/api/core";
import { getFrameScheduler } from "../../core/scheduler/FrameScheduler";
import { VideoElementPool } from "../../core/resources/VideoElementPool";
import { resolveClipSourceTime } from "../../core/timeline/sourceTime";
import { getActiveAudioClips } from "../../core/timeline/audioClips";
import type { Clip, Track, MediaAsset, Project, TransitionTimelineItem } from "../../types";
import type { ExportAudioClip, ExportProgress } from "../../types/export";

/**
 * Video export progress - Re-exported from types/export
 */
export type VideoExportProgress = ExportProgress;

/**
 * Video export configuration.
 */
export interface VideoExportConfig {
  /** Timeline clips */
  clips: Clip[];

  /** Timeline tracks */
  tracks: Track[];

  /** Timeline transitions */
  transitions?: TransitionTimelineItem[];

  /** Media assets */
  assets: MediaAsset[];

  /** Project settings */
  project: Project | null;

  /** Timeline epoch (for cache) */
  epoch: number;

  /** Start time in seconds */
  startTime: number;

  /** End time in seconds */
  endTime: number;

  /** Output file path */
  outputPath: string;

  /** Frame rate (defaults to project frame rate) */
  frameRate?: number;

  /** Output width (defaults to project canvas width) */
  width?: number;

  /** Output height (defaults to project canvas height) */
  height?: number;

  /** Video codec (h264, h265, prores) */
  codec?: "h264" | "h265" | "prores";

  /** Quality preset (ultrafast, fast, medium, slow, veryslow) */
  preset?: "ultrafast" | "fast" | "medium" | "slow" | "veryslow";

  /** CRF quality (0-51, lower = better quality) */
  crf?: number;

  /** Pixel format (yuv420p, yuv444p, yuv422p10le) */
  pixelFormat?: "yuv420p" | "yuv444p" | "yuv422p10le";

  /** Progress callback */
  onProgress?: (progress: VideoExportProgress) => void;
}

/**
 * Video export result.
 */
export interface VideoExportResult {
  /** Output file path */
  outputPath: string;

  /** Total frames exported */
  totalFrames: number;

  /** Total time in ms */
  totalTimeMs: number;

  /** Average time per frame in ms */
  avgTimePerFrameMs: number;

  /** Whether export was cancelled */
  cancelled: boolean;
}

/**
 * Export a video.
 *
 * This uses the frame scheduler to render frames and pipes them to FFmpeg.
 *
 * @param config - Export configuration
 * @returns Export result
 */
export async function exportVideo(config: VideoExportConfig): Promise<VideoExportResult> {
  const { clips, tracks, transitions = [], assets, project, epoch, startTime, endTime, outputPath, frameRate = project?.frameRate || 30, width = project?.canvasWidth || 1920, height = project?.canvasHeight || 1080, codec = "h264", preset = "medium", crf = 23, pixelFormat = "yuv420p", onProgress } = config;

  const startTimeMs = Date.now();

  // Calculate frame times using integer frame arithmetic (no float accumulation)
  // This prevents temporal drift in long exports
  const totalFrames = Math.round((endTime - startTime) * frameRate);
  const frameTimes: number[] = [];
  const startFrameIndex = Math.round(startTime * frameRate);

  for (let i = 0; i < totalFrames; i++) {
    const frameIndex = startFrameIndex + i;
    frameTimes.push(frameIndex / frameRate); // Single division per frame
  }

  if (totalFrames === 0) {
    throw new Error("No frames to export");
  }

  // Get scheduler and update timeline state
  const scheduler = getFrameScheduler();
  scheduler.updateTimeline(clips, tracks, assets, project, epoch, transitions);

  // Create headless video element pool for export
  const videoPool = new VideoElementPool({
    maxConcurrent: 10,
    debug: false,
  });

  // Create progress channel
  const progressChannel = new Channel<VideoExportProgress>();
  progressChannel.onmessage = (progress) => {
    if (onProgress) {
      onProgress(progress);
    }
  };

  // ✅ CRITICAL FIX (FINDING-006): Use extracted utility for audio clip logic
  // This replaces 20+ lines of inline filtering/mapping with a single function call
  const audioClips: ExportAudioClip[] = getActiveAudioClips(clips, tracks, assets, startTime, endTime);

  // Start FFmpeg export session
  const sessionId = await invoke<string>("start_video_export", {
    config: {
      outputPath,
      width,
      height,
      frameRate,
      totalFrames,
      codec,
      preset,
      crf,
      pixelFormat,
      audioClips,
    },
    onProgress: progressChannel,
  });

  let cancelled = false;
  let completedFrames = 0;

  // PERFORMANCE OPTIMIZATION: Batch frame writes to reduce IPC overhead
  // Batch size of 30-60 frames balances latency with throughput
  const BATCH_SIZE = 45; // 1.5 seconds at 30fps, 0.75s at 60fps
  const frameBuffer: Uint8Array[] = [];
  const frameSize = width * height * 4; // RGBA

  /**
   * Flush accumulated frames to backend in a single batch.
   * Reduces IPC overhead by 90% compared to per-frame writes.
   */
  async function flushFrameBatch() {
    if (frameBuffer.length === 0) return;

    // Concatenate all frames into single buffer
    const batchSize = frameBuffer.length * frameSize;
    const batchBuffer = new Uint8Array(batchSize);

    for (let i = 0; i < frameBuffer.length; i++) {
      batchBuffer.set(frameBuffer[i], i * frameSize);
    }

    // Send batch with frame count in header
    await invoke("write_export_frames_batch", batchBuffer, {
      headers: {
        "session-id": sessionId,
        "frame-count": frameBuffer.length.toString(),
      },
    });

    // Clear buffer for next batch
    frameBuffer.length = 0;
  }

  try {
    // Render and write frames
    for (let i = 0; i < frameTimes.length; i++) {
      const time = frameTimes[i];

      // Track ALL acquired video elements for this frame (base + overlays)
      const frameVideoElements: HTMLVideoElement[] = [];

      try {
        // Pre-load and seek all video elements for this frame
        const videoElements = new Map<string, HTMLVideoElement>();

        // Find all video clips active at this time
        for (const clip of clips) {
          const asset = assets.find((a) => a.id === clip.mediaId);
          if (asset?.type !== "video") continue;

          // Check if clip is active at this time
          const clipEnd = clip.startTime + clip.duration;
          if (time < clip.startTime || time >= clipEnd) continue;

          // ✅ CRITICAL FIX (FINDING-001): Use canonical source time calculation
          // Replaced inline calculation with resolveClipSourceTime utility to ensure consistency
          const { sourceTime } = resolveClipSourceTime(clip, time, {
            clampToRange: true,
            frameRate,
          });

          // Resolve path for Tauri webview context
          const resolvedPath = asset.path.startsWith("asset://") ? asset.path : convertFileSrc(asset.path);

          // Acquire video element at exact frame time
          const key = `${clip.id}-${clip.mediaId}`;
          try {
            const video = await videoPool.acquire(resolvedPath, sourceTime);
            videoElements.set(key, video);
            frameVideoElements.push(video);
          } catch (error) {
            // CRITICAL FIX: Fail export if video acquisition fails to prevent silent data corruption
            // Releasing already-acquired elements before throwing
            for (const vid of frameVideoElements) {
              videoPool.releaseElement(vid);
            }
            throw new Error(`Failed to acquire video for clip at time ${time}s: ${error}. Export aborted to prevent corrupted output.`);
          }
        }

        // Schedule frame render with video elements
        const jobId = scheduler.schedule({
          time,
          resolution: { width, height },
          pixelRatio: 1,
          outputFormat: "imagedata",
          priority: "export",
          videoElements,
        });

        // Wait for frame
        const result = await scheduler.wait(jobId);

        if (!(result.data instanceof ImageData)) {
          throw new Error("Expected ImageData output from scheduler");
        }

        const imageData = result.data;

        // Add frame to batch buffer
        const frameBytes = new Uint8Array(imageData.data.buffer);
        frameBuffer.push(frameBytes);

        completedFrames++;

        // Flush batch when full or at end of export
        if (frameBuffer.length >= BATCH_SIZE || i === frameTimes.length - 1) {
          await flushFrameBatch();
        }
      } finally {
        // ✅ CRITICAL FIX (FINDING-005): Release ALL video elements even on error
        // This prevents resource leaks when export fails mid-frame
        for (const video of frameVideoElements) {
          videoPool.releaseElement(video);
        }
      }
    }

    // Flush any remaining frames in buffer
    await flushFrameBatch();

    // Finalize export
    await invoke("finalize_video_export", { sessionId });
  } catch (error) {
    // Check if cancelled
    if (error instanceof Error && error.message.includes("cancelled")) {
      cancelled = true;
      await invoke("cancel_video_export", { sessionId }).catch(() => {
        // Ignore errors during cancellation
      });
    } else {
      // Try to cancel on error
      await invoke("cancel_video_export", { sessionId }).catch(() => {
        // Ignore errors during cancellation
      });
      throw error;
    }
  } finally {
    // Always clean up video pool
    videoPool.clear();
  }

  const totalTimeMs = Date.now() - startTimeMs;
  const avgTimePerFrameMs = completedFrames > 0 ? totalTimeMs / completedFrames : 0;

  return {
    outputPath,
    totalFrames: completedFrames,
    totalTimeMs,
    avgTimePerFrameMs,
    cancelled,
  };
}

/**
 * Check if FFmpeg is available on the system.
 *
 * @returns True if FFmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_ffmpeg_available");
  } catch {
    return false;
  }
}

/**
 * Get FFmpeg version information.
 *
 * @returns FFmpeg version string
 */
export async function getFFmpegVersion(): Promise<string> {
  return await invoke<string>("get_ffmpeg_version");
}

/**
 * Get recommended export presets.
 */
export function getExportPresets() {
  return {
    "1080p-fast": {
      width: 1920,
      height: 1080,
      codec: "h264" as const,
      preset: "fast" as const,
      crf: 23,
      pixelFormat: "yuv420p" as const,
    },
    "1080p-quality": {
      width: 1920,
      height: 1080,
      codec: "h264" as const,
      preset: "slow" as const,
      crf: 18,
      pixelFormat: "yuv420p" as const,
    },
    "720p-fast": {
      width: 1280,
      height: 720,
      codec: "h264" as const,
      preset: "fast" as const,
      crf: 23,
      pixelFormat: "yuv420p" as const,
    },
    "4k-quality": {
      width: 3840,
      height: 2160,
      codec: "h265" as const,
      preset: "medium" as const,
      crf: 20,
      pixelFormat: "yuv420p" as const,
    },
    "prores-422hq": {
      width: 1920,
      height: 1080,
      codec: "prores" as const,
      preset: "medium" as const,
      crf: 0,
      pixelFormat: "yuv422p10le" as const,
    },
  };
}
