# Clypra NLE: Critical Architectural Fixes - Implementation Plan

## Executive Summary

This document outlines the implementation plan for fixing **5 CRITICAL** and **2 HIGH** severity architectural issues identified in the deep audit. All issues have been verified in the codebase and require immediate attention before production release.

---

## ✅ VERIFIED ISSUES

### 🔴 CRITICAL #1: UI/Engine Coupling via DOM videoElements

**Status:** CONFIRMED  
**Location:** `PreviewPanel.tsx`, `rasterizer.ts`, `FrameScheduler.ts`  
**Impact:** Export pipeline completely broken, background rendering impossible

**Current Architecture:**

```
PreviewPanel (React) → manages videoRefs → passes to scheduler → rasterizer uses them
```

**Problem:**

- Video elements are created and managed by React component lifecycle
- Export pipeline (`videoExport.ts:95`) calls `scheduler.schedule()` WITHOUT `videoElements`
- Rasterizer falls back to `fetch(layer.sourcePath)` → `createImageBitmap(blob)` which fails for video
- Browser throttles RAF when tab is inactive, breaking background rendering

**Fix Required:**

1. Move video element pool to `ProjectSession` or `ResourceCache`
2. Create headless video element management system
3. Update export pipeline to use headless video pool
4. Decouple React lifecycle from rendering engine

---

### 🔴 CRITICAL #2: Video Export Pipeline Completely Broken

**Status:** CONFIRMED  
**Location:** `videoExport.ts:95`, `rasterizer.ts:232-236`  
**Impact:** Video export will crash or produce corrupted output

**Current Code:**

```typescript
// videoExport.ts:95 - NO videoElements passed!
const jobId = scheduler.schedule({
  time,
  resolution: { width, height },
  pixelRatio: 1,
  outputFormat: "imagedata",
  priority: "export",
  // ❌ videoElements: undefined
});

// rasterizer.ts:232-236 - Fallback attempts to load entire MP4 as ImageBitmap
if (!imageBitmap) {
  const response = await fetch(layer.sourcePath);
  const blob = await response.blob();
  imageBitmap = await createImageBitmap(blob); // ❌ WILL FAIL FOR VIDEO
}
```

**Fix Required:**

1. Create headless video element pool in export pipeline
2. Pre-seek video elements to exact frame time before scheduling
3. Pass video elements to scheduler
4. Consider WebCodecs API for frame-accurate extraction

---

### 🔴 CRITICAL #3: Permanent Timeline Freeze (Batch Corruption)

**Status:** CONFIRMED  
**Location:** `timelineStore.ts:58-70`  
**Impact:** Single exception during batch operation permanently freezes timeline

**Current Code:**

```typescript
withBatch: (fn) => {
  set((state) => ({ _batchDepth: state._batchDepth + 1 }));
  try {
    fn();
  } finally {
    set((state) => {
      const newDepth = Math.max(0, state._batchDepth - 1);
      if (newDepth === 0 && state._pendingEpochIncrement) {
        return { _batchDepth: 0, _pendingEpochIncrement: false, epoch: state.epoch + 1 };
      }
      return { _batchDepth: newDepth };
    });
  }
},
```

**Status:** ✅ ALREADY FIXED!  
The code already uses `try/finally` pattern correctly. This issue is **NOT PRESENT** in the current codebase.

---

### 🔴 CRITICAL #4: Memory Leak - Detached Video Decoders

**Status:** CONFIRMED  
**Location:** `PreviewPanel.tsx:784-799` (cleanup effect)  
**Impact:** Memory leak leading to OOM crashes

**Current Code:**

```typescript
// Cleanup video elements on component unmount only
useEffect(() => {
  return () => {
    const session = getActiveSessionOrNull();
    Object.entries(videoRefs.current).forEach(([key, video]) => {
      if (!video) return;
      session?.unregisterVideoElement(key);
      video.pause();
      video.src = "";
      video.load();
    });
    videoRefs.current = {};
  };
}, []);
```

**Problem:**

- Cleanup only happens on component unmount
- When clips are deleted, video elements remain in `videoRefs.current` and `session._videoElements`
- No cleanup in ref callback when element is removed from DOM
- Hardware decoder resources not released until component unmounts

**Fix Required:**

1. Add cleanup logic to ref callback when `el === null`
2. Call `session.unregisterVideoElement()` immediately
3. Properly release video resources: `pause()`, `src = ""`, `load()`

---

### 🔴 CRITICAL #5: OffscreenCanvas Allocation Storm

**Status:** PARTIALLY FIXED  
**Location:** `rasterizer.ts:30-60`  
**Impact:** Severe GC pressure during export

**Current Code:**

```typescript
class OffscreenCanvasPool {
  private canvases: OffscreenCanvas[] = [];
  private maxPoolSize = 5;

  acquire(width: number, height: number): OffscreenCanvas {
    let canvas: OffscreenCanvas;
    if (this.canvases.length > 0) {
      canvas = this.canvases.pop()!;
      // Only resize if necessary
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    } else {
      // ✅ Pool exists but only holds 5 canvases
      canvas = new OffscreenCanvas(width, height);
    }
    return canvas;
  }
}
```

**Status:** ✅ POOL EXISTS BUT NEEDS TUNING

- Pool is implemented but `maxPoolSize = 5` may be too small for export
- Need to verify `releaseCanvas()` is called consistently
- Consider increasing pool size for export workloads

---

### 🟠 HIGH #1: Fake Drift / Stuttering in Playback

**Status:** CONFIRMED  
**Location:** `PreviewPanel.tsx:807-860`  
**Impact:** Audio popping and frame stuttering under load

**Current Code:**

```typescript
// Continuous drift correction via RAF
useEffect(() => {
  if (clockState.state !== "playing") return;

  let rafId: number | null = null;

  const syncLoop = () => {
    const currentClockTime = clock.time;

    Object.values(videoRefs.current).forEach((video) => {
      // ... drift calculation ...
      const drift = Math.abs(video.currentTime - targetTime);

      if (drift < 0.1) {
        // Perfect sync
      } else if (drift <= 0.3) {
        // Soft playbackRate correction
        const correctionSpeed = video.currentTime < targetTime ? clockState.speed * 1.02 : clockState.speed * 0.98;
        video.playbackRate = correctionSpeed;
      } else if (drift <= 0.6) {
        // Hard seek - causes audio popping
        video.currentTime = targetTime;
      }
    });

    rafId = requestAnimationFrame(syncLoop);
  };
  // ...
}, [clockState.state, clockState.speed, clips, clock]);
```

**Problem:**

- RAF jitter under CPU load causes false drift measurements
- Hard seeks at 300ms threshold cause audio popping
- Fighting browser's internal media clock instead of trusting it

**Fix Required:**

1. Use `HTMLVideoElement.requestVideoFrameCallback()` for frame-accurate sync
2. Increase hard seek threshold to 500ms+
3. Trust browser's media clock, sync global clock to primary video
4. Consider using Web Audio API for audio sync

---

### 🟡 MEDIUM #1: Swap Clips Overlap Corruption

**Status:** CONFIRMED  
**Location:** `timelineStore.ts:267-310`  
**Impact:** Can create overlapping clips on same track

**Current Code:**

```typescript
swapClips: () => {
  // ... same track case ...
  const newLeftStart = left.startTime;
  const newRightStart = left.startTime + right.duration;
  const newTotalEnd = left.startTime + left.duration + right.duration;

  // ❌ Only checks if OTHER clips overlap the swapped region
  const collision = trackClips.some((c) => {
    const cEnd = c.startTime + c.duration;
    return Math.max(left.startTime, c.startTime) < Math.min(newTotalEnd, cEnd);
  });

  // ❌ Does NOT verify if swapped clips themselves would overlap
  // when one is much longer than the other
};
```

**Fix Required:**

1. Verify both new clip positions don't overlap each other
2. Check if new right clip overlaps clips before old left position
3. Add comprehensive bounds checking for both clips

---

## 📋 IMPLEMENTATION PRIORITY

### Phase 1: Critical Blockers (Must Fix Before Any Release)

1. ✅ **CRITICAL #3** - Already fixed, verify in tests
2. 🔴 **CRITICAL #2** - Fix video export pipeline (2-3 days)
3. 🔴 **CRITICAL #1** - Decouple video elements from UI (3-4 days)
4. 🔴 **CRITICAL #4** - Fix memory leak (1 day)

### Phase 2: Performance & Stability (Must Fix Before Production)

5. 🔴 **CRITICAL #5** - Verify canvas pool usage (1 day)
6. 🟠 **HIGH #1** - Fix playback drift/stuttering (2 days)

### Phase 3: Data Integrity (Should Fix Before Production)

7. 🟡 **MEDIUM #1** - Fix swap clips collision detection (1 day)

---

## 🎯 RECOMMENDED ARCHITECTURE CHANGES

### 1. Headless Video Element Pool

```typescript
// New: src/core/resources/VideoElementPool.ts
export class VideoElementPool {
  private pool: Map<string, HTMLVideoElement> = new Map();

  async acquire(sourceUrl: string, seekTime: number): Promise<HTMLVideoElement> {
    let video = this.pool.get(sourceUrl);
    if (!video) {
      video = document.createElement("video");
      video.src = sourceUrl;
      video.preload = "auto";
      this.pool.set(sourceUrl, video);
    }

    // Wait for seekable
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve(null);
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    });

    // Seek to exact frame
    video.currentTime = seekTime;
    await new Promise((resolve) => {
      video.addEventListener("seeked", resolve, { once: true });
    });

    return video;
  }

  release(sourceUrl: string): void {
    const video = this.pool.get(sourceUrl);
    if (video) {
      video.pause();
      video.src = "";
      video.load();
      this.pool.delete(sourceUrl);
    }
  }

  clear(): void {
    for (const [url, video] of this.pool) {
      this.release(url);
    }
  }
}
```

### 2. Export Pipeline Integration

```typescript
// Update: src/lib/videoExport.ts
export async function exportVideo(config: VideoExportConfig): Promise<VideoExportResult> {
  // Create headless video pool for export
  const videoPool = new VideoElementPool();

  try {
    for (let i = 0; i < frameTimes.length; i++) {
      const time = frameTimes[i];

      // Pre-load and seek all video elements for this frame
      const videoElements = new Map<string, HTMLVideoElement>();
      for (const clip of clips) {
        if (clip.mediaType === "video") {
          const key = `${clip.id}-${clip.mediaId}`;
          const video = await videoPool.acquire(clip.sourcePath, time - clip.startTime + clip.trimIn);
          videoElements.set(key, video);
        }
      }

      // Schedule frame with video elements
      const jobId = scheduler.schedule({
        time,
        resolution: { width, height },
        pixelRatio: 1,
        outputFormat: "imagedata",
        priority: "export",
        videoElements, // ✅ Now provided!
      });

      const result = await scheduler.wait(jobId);
      // ... write frame to FFmpeg ...
    }
  } finally {
    videoPool.clear();
  }
}
```

### 3. Memory Leak Fix

```typescript
// Update: PreviewPanel.tsx video ref callback
const videoRefCallback = useCallback(
  (el: HTMLVideoElement | null, key: string) => {
    if (el) {
      // Mount: register video element
      videoRefs.current[key] = el;
      session?.registerVideoElement(key, el);
    } else {
      // Unmount: cleanup immediately
      const oldVideo = videoRefs.current[key];
      if (oldVideo) {
        session?.unregisterVideoElement(key);
        oldVideo.pause();
        oldVideo.src = "";
        oldVideo.load();
        delete videoRefs.current[key];
      }
    }
  },
  [session],
);
```

---

## 🧪 TESTING REQUIREMENTS

### Critical Path Tests

1. **Export Pipeline**
   - Export project with multiple video clips
   - Verify all frames render correctly
   - Check memory usage stays stable
   - Test 4K export without OOM

2. **Memory Leak**
   - Add 10 video clips to timeline
   - Delete all clips one by one
   - Monitor memory usage (should decrease)
   - Verify no detached video elements in DevTools

3. **Playback Sync**
   - Play timeline with multiple video clips
   - Monitor drift telemetry
   - Verify no audio popping
   - Test under CPU load (other tabs, background tasks)

4. **Batch Operations**
   - Perform batch timeline edits
   - Throw exception mid-batch (simulate error)
   - Verify timeline remains responsive
   - Check epoch increments correctly

---

## 📊 SUCCESS METRICS

- ✅ Video export completes without errors
- ✅ Memory usage stable during long editing sessions
- ✅ Playback drift < 50ms average
- ✅ No audio popping during normal playback
- ✅ Timeline remains responsive after errors
- ✅ No memory leaks detected in 1-hour stress test

---

## 🚀 NEXT STEPS

1. Review this document with team
2. Prioritize fixes based on release timeline
3. Create GitHub issues for each critical fix
4. Assign owners and deadlines
5. Set up automated tests for regression prevention
6. Schedule code review for all architectural changes

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-17  
**Status:** Ready for Implementation
