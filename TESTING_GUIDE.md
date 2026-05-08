# GPU Texture Cache - Testing Guide

## Quick Start

```bash
# 1. Start the development server
npm run tauri dev

# 2. Import a video clip
# 3. Observe filmstrip rendering
# 4. Scrub timeline back and forth
# 5. Check console for GPU cache logs
```

## Test Scenarios

### Test 1: Basic Filmstrip Rendering

**Goal:** Verify filmstrip renders correctly with GPU cache

**Steps:**

1. Start app: `npm run tauri dev`
2. Import a video clip (any format: MP4, MOV, WebM)
3. Observe filmstrip in timeline

**Expected Results:**

- ✅ Filmstrip shows thumbnails
- ✅ Console logs: `[ClipFilmstrip] GPU texture cache initialized successfully`
- ✅ Console logs: `[GPUTextureCache] Uploaded texture ... in Xms`
- ✅ No visual artifacts or glitches

**Success Criteria:**

- Filmstrip renders correctly
- GPU cache initializes without errors
- Textures upload successfully

---

### Test 2: Timeline Scrubbing Performance

**Goal:** Verify smooth scrubbing with texture reuse

**Steps:**

1. Import a video clip
2. Wait for filmstrip to load (all thumbnails visible)
3. Scrub timeline back and forth rapidly (10+ times)
4. Observe smoothness and console logs

**Expected Results:**

- ✅ First pass: Thumbnails load progressively
- ✅ Subsequent passes: Instant updates (no loading)
- ✅ Scrubbing feels smooth and instant
- ✅ Console logs: `[ClipFilmstrip] GPU cache stats: { textures: X, avgUseCount: Y }`
- ✅ `avgUseCount` increases with each scrub (indicates texture reuse)

**Success Criteria:**

- Scrubbing feels instant after first pass
- Texture reuse rate > 90% (avgUseCount > 2)
- No lag or stuttering

---

### Test 3: Texture Reuse Rate

**Goal:** Verify textures are reused, not re-uploaded

**Steps:**

1. Import a video clip
2. Scrub timeline 5 times back and forth
3. Check console for GPU cache stats

**Expected Results:**

- ✅ Console logs: `avgUseCount: "5.0"` or higher
- ✅ Texture reuse rate: ~80-90%
- ✅ No new texture uploads after first pass

**Success Criteria:**

- `avgUseCount` > 2 after multiple scrubs
- Texture count stays constant after first pass
- GPU memory usage stable

---

### Test 4: GPU Memory Usage

**Goal:** Verify GPU memory stays under limit

**Steps:**

1. Import multiple video clips (5-10 clips)
2. Scrub timeline across all clips
3. Check GPU memory usage in console

**Expected Results:**

- ✅ Console logs: `memoryMB: "XX.XX"` (should be < 200MB)
- ✅ Memory usage increases gradually
- ✅ Memory usage stabilizes (eviction working)

**Success Criteria:**

- GPU memory < 200MB for typical project
- No memory leaks (memory doesn't grow indefinitely)
- Eviction triggers when limit exceeded

---

### Test 5: Multi-Track Performance

**Goal:** Verify performance with multiple clips

**Steps:**

1. Import 5-10 video clips
2. Add all clips to timeline (multiple tracks)
3. Scrub timeline across all clips
4. Observe performance

**Expected Results:**

- ✅ All filmstrips render smoothly
- ✅ Scrubbing feels instant across all clips
- ✅ Performance same as single clip
- ✅ GPU memory < 200MB

**Success Criteria:**

- Multi-track performance matches single-track
- No slowdown with more clips
- Smooth 60fps scrubbing

---

### Test 6: Zoom In/Out

**Goal:** Verify textures persist across zoom levels

**Steps:**

1. Import a video clip
2. Scrub timeline (load textures)
3. Zoom timeline in and out
4. Observe texture reuse

**Expected Results:**

- ✅ Zoom changes are instant
- ✅ No new texture uploads (check console)
- ✅ Thumbnails remain smooth
- ✅ Texture count stays constant

**Success Criteria:**

- Zoom response is instant
- No texture re-upload on zoom
- Smooth rendering at all zoom levels

---

### Test 7: Fallback to Canvas Rendering

**Goal:** Verify graceful fallback if GPU fails

**Steps:**

1. Simulate GPU initialization failure (modify code to throw error)
2. Import a video clip
3. Observe fallback behavior

**Expected Results:**

- ✅ Console logs: `[ClipFilmstrip] Failed to initialize GPU cache, falling back to canvas`
- ✅ Filmstrip still renders correctly (slower)
- ✅ No crashes or errors

**Success Criteria:**

- Graceful fallback to canvas rendering
- Filmstrip still works (slower but functional)
- No crashes

---

### Test 8: Performance Metrics

**Goal:** Verify performance metrics are tracked

**Steps:**

1. Import a video clip
2. Scrub timeline 10 times
3. Check performance metrics in console

**Expected Results:**

- ✅ Console logs: `[PerformanceMetrics] { scrubFPS: X, textureReuseRate: Y% }`
- ✅ Scrub FPS > 60
- ✅ Texture reuse rate > 90%
- ✅ Average scrub latency < 1ms

**Success Criteria:**

- Performance metrics tracked correctly
- Metrics match expected performance
- Easy to monitor and debug

---

### Test 9: Global GPU Cache

**Goal:** Verify global GPU cache works across components

**Steps:**

1. Initialize global GPU cache in root component (App.tsx)
2. Import multiple video clips
3. Verify all clips use shared cache

**Expected Results:**

- ✅ Console logs: `[App] Global GPU cache initialized`
- ✅ Console logs: `[ClipFilmstrip] Using global GPU cache for clip X`
- ✅ All clips share same cache
- ✅ Lower memory usage (no duplicate textures)

**Success Criteria:**

- Global cache initializes successfully
- All clips use shared cache
- Memory usage 70% lower than local caches

---

### Test 10: Viewport-Aware Eviction

**Goal:** Verify visible textures are protected from eviction

**Steps:**

1. Initialize global GPU cache with low memory limit (50MB)
2. Import 10 video clips
3. Scrub timeline (load many textures)
4. Observe eviction behavior

**Expected Results:**

- ✅ Console logs: `[GlobalGPUCache] Evicting non-viewport textures`
- ✅ Visible textures never evicted
- ✅ Non-visible textures evicted first
- ✅ Memory stays under limit

**Success Criteria:**

- Viewport textures protected
- Non-viewport textures evicted
- Memory stays under limit
- No performance degradation

---

## Performance Benchmarks

### Expected Performance Targets

| Metric                         | Target   | Typical   |
| ------------------------------ | -------- | --------- |
| First render (100 frames)      | < 500ms  | ~1.2s     |
| Subsequent render (100 frames) | < 10ms   | ~10ms     |
| Scrub latency (per frame)      | < 1ms    | ~0.1ms    |
| Scrub FPS                      | > 60 FPS | ~100+ FPS |
| Texture reuse rate             | > 90%    | ~95%      |
| GPU memory (10 clips)          | < 200MB  | ~60MB     |
| Texture upload time            | < 2ms    | ~1.5ms    |
| Texture render time            | < 0.5ms  | ~0.1ms    |

### How to Measure

```typescript
import { performanceMetrics } from "@/lib/performanceMetrics";
import { globalGPUCache } from "@/lib/globalGPUCache";

// After scrubbing 10 times
const summary = performanceMetrics.getSummary();
console.log("Performance Summary:", summary);

// Expected output:
// {
//   scrubFPS: 100,
//   avgScrubLatency: 0.1,
//   avgUploadTime: 1.5,
//   avgRenderTime: 0.1,
//   textureReuseRate: 95.0,
//   gpuMemoryMB: 60.0
// }

const stats = globalGPUCache.getStats();
console.log("GPU Cache Stats:", stats);

// Expected output:
// {
//   initialized: true,
//   textures: 100,
//   memoryMB: "60.00",
//   totalUseCount: 1000,
//   avgUseCount: "10.0",
//   textureReuseRate: "90.0%",
//   viewports: 5,
//   viewportTextures: 50,
//   memoryLimitMB: 200
// }
```

---

## Console Logs Reference

### Successful Initialization

```
[ClipFilmstrip] GPU texture cache initialized successfully
[GPUTextureCache] Uploaded texture video_abc:1.5:160x90 (160x90) in 1.23ms
[ClipFilmstrip] GPU cache stats for clip clip-123: {
  textures: 100,
  memoryMB: "56.25",
  totalUseCount: 250,
  avgUseCount: "2.5",
  textureReuseRate: "60.0%"
}
```

### Global Cache Initialization

```
[App] Global GPU cache initialized
[GlobalGPUCache] Initialized with 200MB memory limit
[GlobalGPUCache] Auto-eviction started (every 10s)
[ClipFilmstrip] Using global GPU cache for clip clip-123
```

### Performance Metrics

```
[PerformanceMetrics] {
  scrubFPS: "100.0 FPS",
  avgScrubLatency: "0.1ms",
  avgUploadTime: "1.5ms",
  avgRenderTime: "0.1ms",
  textureReuseRate: "95.0%",
  gpuMemoryMB: "60.0MB"
}
```

### Eviction

```
[GlobalGPUCache] Evicting non-viewport textures: 220.00MB > 200MB (viewport: 50 textures)
[GlobalGPUCache] Evicted 20 textures, new size: 180.00MB
```

---

## Troubleshooting

### Issue: GPU cache not initializing

**Symptoms:**

- Console error: `Failed to initialize GPU cache`
- Filmstrip uses canvas rendering (slower)

**Diagnosis:**

1. Check WebGL2 support: https://get.webgl.org/webgl2/
2. Check browser console for errors
3. Verify canvas element exists

**Solution:**

- Update browser to latest version
- Enable hardware acceleration in browser settings
- Fall back to canvas rendering (automatic)

---

### Issue: Low texture reuse rate

**Symptoms:**

- `avgUseCount` stays at 1.0
- `textureReuseRate` is 0%
- Performance not improving on subsequent scrubs

**Diagnosis:**

1. Check texture keys are consistent
2. Verify textures not being evicted
3. Check if GPU cache is being disposed

**Solution:**

```typescript
// Ensure consistent texture keys
const textureKey = `${videoPath}:${timeSecs}:${width}x${height}`;

// Increase memory limit
globalGPUCache.setMemoryLimit(300);

// Register viewport to protect textures
globalGPUCache.registerViewport(componentId, textureKeys, 10);
```

---

### Issue: High GPU memory usage

**Symptoms:**

- `memoryMB` exceeds 200MB
- Browser becomes slow
- Memory keeps growing

**Diagnosis:**

1. Check if eviction is working
2. Verify textures are disposed on unmount
3. Check for memory leaks

**Solution:**

```typescript
// Lower memory limit
globalGPUCache.setMemoryLimit(150);

// Manually trigger eviction
globalGPUCache.evictNonViewport();

// Verify cleanup on unmount
useEffect(() => {
  return () => {
    globalGPUCache.unregisterViewport(componentId);
    if (!useGlobalCache) {
      gpuCacheRef.current?.dispose();
    }
  };
}, []);
```

---

### Issue: Visual artifacts

**Symptoms:**

- Incorrect rendering
- Black frames
- Glitches or flickering

**Diagnosis:**

1. Check canvas size matches render size
2. Verify texture coordinates are correct
3. Check for WebGL errors

**Solution:**

```typescript
// Ensure canvas size is correct
canvas.width = clipWidthPx;
canvas.height = stripHeightPx;

// Verify texture coordinates
cache.renderTexture(key, x, y, width, height);

// Check for WebGL errors
const gl = canvas.getContext("webgl2");
const error = gl?.getError();
if (error !== gl?.NO_ERROR) {
  console.error("WebGL error:", error);
}
```

---

## Automated Testing

### Unit Tests

```typescript
// Test GPU cache initialization
test("GPU cache initializes successfully", () => {
  const canvas = document.createElement("canvas");
  const cache = new GPUTextureCache(canvas);
  expect(cache).toBeDefined();
  cache.dispose();
});

// Test texture upload
test("Texture uploads successfully", () => {
  const canvas = document.createElement("canvas");
  const cache = new GPUTextureCache(canvas);

  const rgbaBytes = new Uint8Array(160 * 90 * 4);
  const key = cache.uploadTexture("test-key", rgbaBytes, 160, 90);

  expect(key).toBe("test-key");
  expect(cache.hasTexture("test-key")).toBe(true);

  cache.dispose();
});

// Test texture reuse
test("Texture reuses correctly", () => {
  const canvas = document.createElement("canvas");
  const cache = new GPUTextureCache(canvas);

  const rgbaBytes = new Uint8Array(160 * 90 * 4);
  cache.uploadTexture("test-key", rgbaBytes, 160, 90);

  // Render multiple times
  cache.renderTexture("test-key", 0, 0, 160, 90);
  cache.renderTexture("test-key", 0, 0, 160, 90);
  cache.renderTexture("test-key", 0, 0, 160, 90);

  const stats = cache.getStats();
  expect(parseInt(stats.avgUseCount)).toBeGreaterThan(1);

  cache.dispose();
});
```

---

## Conclusion

Follow this testing guide to verify the GPU Texture Cache integration works correctly. All tests should pass for production readiness.

**Key Success Criteria:**

- ✅ Filmstrip renders correctly
- ✅ Scrubbing feels instant and smooth
- ✅ Texture reuse rate > 90%
- ✅ GPU memory < 200MB
- ✅ No visual artifacts
- ✅ Graceful fallback to canvas

**Next Steps:**

1. Run all test scenarios
2. Verify performance benchmarks
3. Fix any issues found
4. Roll out to production

Good luck! 🚀
