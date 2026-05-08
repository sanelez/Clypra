# GPU Preview Critical Fixes

## Problem Summary

GPUPreview component was stuck in infinite initialization deadlock due to 4 architectural bugs in the WebGL rendering lifecycle.

## Root Causes Identified

### Bug #1: Canvas Never Rendered During Initialization (CRITICAL DEADLOCK)

**Problem:**

```typescript
if (!useGPUCache) {
  return <div>GPU Preview Initializing...</div>;
}
return <canvas ref={canvasRef} />;
```

**Why it failed:**

1. `useGPUCache === false` initially
2. React returns loading `<div>`, canvas never mounts
3. `canvasRef.current === null`
4. GPU cache initialization skipped
5. `useGPUCache` never becomes `true`
6. **Infinite deadlock**

**Fix:** Always render canvas, overlay loading state:

```typescript
return (
  <div className="relative w-full h-full">
    <canvas ref={canvasRef} width={width} height={height} />
    {!useGPUCache && (
      <div className="absolute inset-0 bg-black/70">
        GPU Preview Initializing...
      </div>
    )}
  </div>
);
```

### Bug #2: Missing Dependency Array (CATASTROPHIC)

**Problem:**

```typescript
useEffect(() => {
  // Initialize GPU cache
}); // No dependency array!
```

**Why it failed:**

- Runs on **every render**
- Creates/disposes WebGL resources repeatedly
- Recreates shaders, buffers, textures
- May destroy active context
- Kills rendering performance

**Fix:**

```typescript
useEffect(() => {
  // Initialize GPU cache
}, []); // Run once on mount
```

### Bug #3: Missing Viewport Configuration

**Problem:**

- Canvas width/height initially 0
- Never called `gl.viewport()`
- WebGL viewport invalid
- Rendering happens but nothing visible

**Fix:**

```typescript
// In constructor
this.gl.viewport(0, 0, canvas.width, canvas.height);

// In renderTexture (update on resize)
this.gl.viewport(0, 0, canvasWidth, canvasHeight);
```

### Bug #4: Coordinate Space Mismatch

**Problem:**

- Vertices in 0..1 space
- Transform matrix assumes pixel coordinates
- Quad rendered outside clip space
- Rendering succeeds but nothing visible

**Fix:** Simplified to fullscreen quad in clip space (-1 to 1):

```typescript
const vertices = new Float32Array([
  -1,
  -1,
  0,
  1, // Bottom-left
  1,
  -1,
  1,
  1, // Bottom-right
  -1,
  1,
  0,
  0, // Top-left
  1,
  1,
  1,
  0, // Top-right
]);
```

Removed matrix transform entirely:

```glsl
// Before: gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
// After:  gl_Position = vec4(a_position, 0.0, 1.0);
```

## Files Modified

### 1. `/src/components/editor/GPUPreview.tsx`

- ✅ Always render canvas (fix deadlock)
- ✅ Add dependency array `[]` to useEffect
- ✅ Enhanced logging for initialization flow

### 2. `/src/lib/gpuTextureCache.ts`

- ✅ Add viewport initialization in constructor
- ✅ Update viewport in renderTexture
- ✅ Simplify vertex shader (remove matrix)
- ✅ Change vertices to clip space (-1 to 1)
- ✅ Remove unused matrix properties and methods

## Why ClipFilmstrip Works But GPUPreview Didn't

**ClipFilmstrip:**

1. Always mounts canvas
2. Initializes WebGL after mount
3. Renders into it

**GPUPreview (before fix):**

1. Conditionally mounts canvas
2. Initialization depends on canvas
3. Canvas never mounts → deadlock

## Performance Architecture Note

Current IPC architecture:

```
Rust RGBA → IPC → JS Array → Uint8Array → WebGL upload
```

This is CPU-copy bottlenecked and will struggle with:

- 4K video
- Multiple streams
- Timeline playback

**Future optimization needed:**

- Shared memory
- Zero-copy buffers
- WebCodecs
- WebGPU
- Native texture interop

For MVP, current architecture is acceptable.

## Testing Instructions

1. Open app and click on a video file
2. Open browser console (F12)
3. Look for initialization logs:
   ```
   [GPUPreview] 🎬 Starting GPU cache initialization...
   [GPUTextureCache] 🚀 Starting initialization...
   [GPUTextureCache] ✅ WebGL2 context created
   [GPUTextureCache] Viewport set to: 1920 x 1080
   [GPUTextureCache] ✅ Initialization complete!
   [GPUPreview] ✅ Local GPU texture cache initialized successfully
   ```
4. Video should render in GPU preview
5. Scrubbing should be smooth and instant

## Expected Behavior

- ✅ Canvas always renders
- ✅ WebGL initializes once on mount
- ✅ Viewport properly configured
- ✅ Fullscreen quad renders correctly
- ✅ Video frames display immediately
- ✅ Smooth playback and scrubbing
- ✅ No re-initialization on re-renders

## Status

All 4 critical bugs fixed. GPU preview should now work correctly.
