# Fix #1: Video Export Pipeline - Headless Video Element Pool

## Problem Statement

The video export pipeline is completely broken because:

1. `videoExport.ts` does NOT pass `videoElements` to the scheduler
2. `rasterizer.ts` falls back to `fetch()` + `createImageBitmap()` for video
3. `createImageBitmap()` cannot decode video files - it will crash or extract only the first frame
4. Export of any project with video clips will fail

## Root Cause Analysis

```typescript
// videoExport.ts:95 - Current broken code
const jobId = scheduler.schedule({
  time,
  resolution: { width, height },
  pixelRatio: 1,
  outputFormat: "imagedata",
  priority: "export",
  // ❌ videoElements is undefined!
});

// rasterizer.ts:232-236 - Fallback that fails for video
if (!imageBitmap) {
  const response = await fetch(layer.sourcePath);
  const blob = await response.blob();
  imageBitmap = await createImageBitmap(blob); // ❌ Throws for MP4/MOV
}
```

## Solution Architecture

### 1. Create Headless Video Element Pool

**File:** `src/core/resources/VideoElementPool.ts`

```typescript
/**
 * Headless Video Element Pool
 *
 * Manages a pool of headless <video> elements for frame extraction.
 * Used by export pipeline and background rendering.
 *
 * Key features:
 * - Headless (not attached to DOM)
 * - Frame-accurate seeking
 * - Resource lifecycle management
 * - Concurrent video support
 */

export interface VideoElementPoolConfig {
  /** Maximum number of concurrent video elements */
  maxConcurrent?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export class VideoElementPool {
  private elements = new Map<string, HTMLVideoElement>();
  private config: Required<VideoElementPoolConfig>;
  private activeCount = 0;

  constructor(config: VideoElementPoolConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      debug: config.debug ?? false,
    };
  }

  /**
   * Acquire a video element for a source URL.
   * Creates new element if not in pool.
   *
   * @param sourceUrl - Video source URL
   * @param seekTime - Time to seek to (in seconds)
   * @returns Video element ready at seekTime
   */
  async acquire(sourceUrl: string, seekTime: number): Promise<HTMLVideoElement> {
    let video = this.elements.get(sourceUrl);

    if (!video) {
      // Create new headless video element
      video = document.createElement("video");
      video.preload = "auto";
      video.muted = true; // Muted for export (no audio in frame extraction)

      // Set source
      video.src = sourceUrl;

      // Wait for metadata to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Video metadata load timeout: ${sourceUrl}`));
        }, 10000);

        video!.addEventListener(
          "loadedmetadata",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );

        video!.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error(`Video load error: ${sourceUrl}`));
          },
          { once: true },
        );
      });

      this.elements.set(sourceUrl, video);
      this.activeCount++;

      if (this.config.debug) {
        console.log(`[VideoElementPool] Created video element for ${sourceUrl}`);
      }
    }

    // Seek to target time
    if (Math.abs(video.currentTime - seekTime) > 0.016) {
      // > 1 frame at 60fps
      video.currentTime = seekTime;

      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Video seek timeout: ${sourceUrl} @ ${seekTime}s`));
        }, 5000);

        video!.addEventListener(
          "seeked",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );

        video!.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error(`Video seek error: ${sourceUrl} @ ${seekTime}s`));
          },
          { once: true },
        );
      });
    }

    // Ensure we have a valid frame
    if (video.readyState < 2) {
      // HAVE_CURRENT_DATA
      throw new Error(`Video not ready after seek: ${sourceUrl} @ ${seekTime}s`);
    }

    return video;
  }

  /**
   * Release a video element (pause and clear).
   *
   * @param sourceUrl - Video source URL
   */
  release(sourceUrl: string): void {
    const video = this.elements.get(sourceUrl);
    if (video) {
      video.pause();
      video.src = "";
      video.load(); // Release decoder resources
      this.elements.delete(sourceUrl);
      this.activeCount--;

      if (this.config.debug) {
        console.log(`[VideoElementPool] Released video element for ${sourceUrl}`);
      }
    }
  }

  /**
   * Release all video elements.
   */
  clear(): void {
    for (const [url] of this.elements) {
      this.release(url);
    }

    if (this.config.debug) {
      console.log(`[VideoElementPool] Cleared all video elements`);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.config.maxConcurrent,
      urls: Array.from(this.elements.keys()),
    };
  }
}
```

### 2. Update Video Export Pipeline

**File:** `src/lib/videoExport.ts`

```typescript
import { VideoElementPool } from "@/core/resources/VideoElementPool";

export async function exportVideo(config: VideoExportConfig): Promise<VideoExportResult> {
  const { clips, tracks, assets, project, epoch, startTime, endTime, outputPath, frameRate = project?.frameRate || 30, width = project?.canvasWidth || 1920, height = project?.canvasHeight || 1080, codec = "h264", preset = "medium", crf = 23, pixelFormat = "yuv420p", onProgress } = config;

  const startTimeMs = Date.now();

  // Calculate frame times
  const frameDuration = 1 / frameRate;
  const frameTimes: number[] = [];
  for (let time = startTime; time < endTime; time += frameDuration) {
    frameTimes.push(time);
  }

  const totalFrames = frameTimes.length;

  if (totalFrames === 0) {
    throw new Error("No frames to export");
  }

  // Get scheduler and update timeline state
  const scheduler = getFrameScheduler();
  scheduler.updateTimeline(clips, tracks, assets, project, epoch);

  // ✅ Create headless video element pool for export
  const videoPool = new VideoElementPool({
    maxConcurrent: 10,
    debug: false,
  });

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
    },
  });

  let cancelled = false;
  let completedFrames = 0;

  try {
    // Render and write frames
    for (let i = 0; i < frameTimes.length; i++) {
      const time = frameTimes[i];

      // ✅ Pre-load and seek all video elements for this frame
      const videoElements = new Map<string, HTMLVideoElement>();

      // Find all video clips active at this time
      for (const clip of clips) {
        const asset = assets.find((a) => a.id === clip.mediaId);
        if (asset?.type !== "video") continue;

        // Check if clip is active at this time
        const clipEnd = clip.startTime + clip.duration;
        if (time < clip.startTime || time >= clipEnd) continue;

        // Calculate source time (accounting for trim)
        const clipLocalTime = time - clip.startTime;
        const trimIn = clip.trimIn || 0;
        const sourceTime = trimIn + clipLocalTime;

        // Acquire video element at exact frame time
        const key = `${clip.id}-${clip.mediaId}`;
        try {
          const video = await videoPool.acquire(asset.path, sourceTime);
          videoElements.set(key, video);
        } catch (error) {
          console.warn(`Failed to acquire video for ${key}:`, error);
          // Continue without this video - rasterizer will use fallback
        }
      }

      // ✅ Schedule frame render with video elements
      const jobId = scheduler.schedule({
        time,
        resolution: { width, height },
        pixelRatio: 1,
        outputFormat: "imagedata",
        priority: "export",
        videoElements, // ✅ Now provided!
      });

      // Wait for frame
      const result = await scheduler.wait(jobId);

      if (!(result.data instanceof ImageData)) {
        throw new Error("Expected ImageData output from scheduler");
      }

      const imageData = result.data;

      // Create progress channel
      const progressChannel = new Channel<VideoExportProgress>();
      progressChannel.onmessage = (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      };

      // Write frame to FFmpeg
      await invoke("write_export_frame", {
        sessionId,
        frameData: Array.from(imageData.data),
        onProgress: progressChannel,
      });

      completedFrames++;
    }

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
    // ✅ Always clean up video pool
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
```

### 3. Update Rasterizer Fallback

**File:** `src/core/render/rasterizer.ts`

```typescript
async function rasterizeMediaLayer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, layer: EvaluatedMediaLayer, width: number, height: number, target: RasterTarget): Promise<void> {
  try {
    // 1. Try to use active video element (bypasses decoding)
    if (layer.mediaType === "video" && target.videoElements) {
      const key = `${layer.clipId}-${layer.mediaId}`;
      const video = target.videoElements.get(key);
      if (video && video.readyState >= 2) {
        // HAVE_CURRENT_DATA
        ctx.drawImage(video, -width / 2, -height / 2, width, height);
        return;
      }
    }

    let imageBitmap: ImageBitmap | null = null;

    // 2. Try to use pre-resolved resource
    if (layer.resourceHandle) {
      const resourceCache = getResourceCache();
      const resource = resourceCache.get(layer.resourceHandle);

      if (resource && resource.data instanceof ImageBitmap) {
        imageBitmap = resource.data;
      }
    }

    // 3. Fallback: load on-demand (ONLY for images, not video)
    if (!imageBitmap) {
      if (layer.mediaType === "video") {
        // ❌ Cannot decode video without video element
        throw new Error(`Video frame extraction requires video element. ` + `Clip: ${layer.clipId}, Media: ${layer.mediaId}`);
      }

      // ✅ Only attempt for images
      const response = await fetch(layer.sourcePath);
      const blob = await response.blob();
      imageBitmap = await createImageBitmap(blob);
    }

    // Draw centered (after rotation transform)
    ctx.drawImage(imageBitmap, -width / 2, -height / 2, width, height);

    // Only close if we created it (not from resource manager)
    if (!layer.resourceHandle && imageBitmap) {
      imageBitmap.close();
    }
  } catch (error) {
    // Fallback: draw placeholder with error message
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-width / 2, -height / 2, width, height);

    // Draw error border
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(-width / 2, -height / 2, width, height);

    // Draw error text
    ctx.fillStyle = "#ff4444";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Video decode error", 0, 0);

    console.error(`[Rasterizer] Failed to render media layer:`, error);
  }
}
```

## Testing Plan

### Unit Tests

```typescript
// src/core/resources/__tests__/VideoElementPool.test.ts
describe("VideoElementPool", () => {
  it("should create and seek video element", async () => {
    const pool = new VideoElementPool();
    const video = await pool.acquire("/test/video.mp4", 5.0);

    expect(video.currentTime).toBeCloseTo(5.0, 2);
    expect(video.readyState).toBeGreaterThanOrEqual(2);

    pool.clear();
  });

  it("should reuse video elements for same URL", async () => {
    const pool = new VideoElementPool();

    const video1 = await pool.acquire("/test/video.mp4", 1.0);
    const video2 = await pool.acquire("/test/video.mp4", 2.0);

    expect(video1).toBe(video2);
    expect(video2.currentTime).toBeCloseTo(2.0, 2);

    pool.clear();
  });

  it("should handle concurrent videos", async () => {
    const pool = new VideoElementPool({ maxConcurrent: 5 });

    const videos = await Promise.all([pool.acquire("/test/video1.mp4", 0), pool.acquire("/test/video2.mp4", 0), pool.acquire("/test/video3.mp4", 0)]);

    expect(videos).toHaveLength(3);
    expect(pool.getStats().activeCount).toBe(3);

    pool.clear();
  });
});
```

### Integration Tests

```typescript
// src/lib/__tests__/videoExport.integration.test.ts
describe("Video Export Integration", () => {
  it("should export project with video clips", async () => {
    const project = createTestProject();
    const clips = [createVideoClip({ startTime: 0, duration: 5 }), createVideoClip({ startTime: 5, duration: 5 })];

    const result = await exportVideo({
      clips,
      tracks: project.tracks,
      assets: project.assets,
      project,
      epoch: 0,
      startTime: 0,
      endTime: 10,
      outputPath: "/tmp/test-export.mp4",
    });

    expect(result.cancelled).toBe(false);
    expect(result.totalFrames).toBe(300); // 10s * 30fps
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  it("should handle export cancellation", async () => {
    const project = createTestProject();

    const exportPromise = exportVideo({
      // ... config ...
    });

    // Cancel after 1 second
    setTimeout(() => {
      // Trigger cancellation
    }, 1000);

    const result = await exportPromise;
    expect(result.cancelled).toBe(true);
  });
});
```

## Performance Considerations

### Memory Usage

- Each video element holds ~10-50MB of decoded frames in memory
- Pool limit of 10 concurrent videos = ~500MB max
- Video elements are released after each frame to minimize memory

### Seeking Performance

- Seeking is the bottleneck (~10-50ms per seek)
- Consider pre-seeking next frame while rendering current frame
- For sequential export, seeking is minimal (next frame is adjacent)

### Optimization Opportunities

1. **Frame Caching**: Cache decoded frames for clips used multiple times
2. **Parallel Rendering**: Render multiple frames concurrently (requires more video elements)
3. **WebCodecs API**: Use `VideoDecoder` for frame-accurate extraction without seeking

## Migration Path

### Phase 1: Basic Implementation (Week 1)

- ✅ Create `VideoElementPool` class
- ✅ Update `videoExport.ts` to use pool
- ✅ Update `rasterizer.ts` error handling
- ✅ Add unit tests

### Phase 2: Testing & Validation (Week 2)

- ✅ Integration tests for export pipeline
- ✅ Manual testing with various video formats
- ✅ Performance profiling
- ✅ Memory leak testing

### Phase 3: Optimization (Week 3)

- Consider WebCodecs API for better performance
- Implement frame caching if needed
- Parallel rendering for faster export

## Success Criteria

- ✅ Export completes without errors for projects with video clips
- ✅ All video frames render correctly (visual inspection)
- ✅ Memory usage stays under 1GB during export
- ✅ Export speed: at least 1x realtime (30fps export for 30fps timeline)
- ✅ No memory leaks after export completion

## Rollback Plan

If issues arise:

1. Revert `videoExport.ts` changes
2. Add warning in UI: "Video export not supported"
3. Only allow export of image/text-only projects
4. Continue development in feature branch

---

**Status:** Ready for Implementation  
**Estimated Effort:** 3-4 days  
**Priority:** CRITICAL - Blocks all video export functionality
