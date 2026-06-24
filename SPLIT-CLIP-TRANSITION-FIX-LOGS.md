# Split Clip Transition Fix - Logging Guide

## Issue Fixed

Preview goes blank when playback crosses split clips with transitions.

## Root Cause

When clips are split, they get new IDs but share the same media source. During transitions, the rasterizer couldn't find video elements for the new split clip IDs because they weren't tracked in the recently removed clips grace period.

## Fix Implementation

Modified `PreviewMediaPool` to track ALL clip IDs that map to the same cache key (original + split clips) and return video elements for all of them during the 500ms transition grace period.

---

## Logs to Confirm Fix is Working

### 1. When Clip is Split (in PreviewMediaPool)

**Success Pattern:**

```
[PreviewMediaPool] Removed clip clip-XXX-15 added to grace period (cache: asset-XXX...)
[PreviewMediaPool] Creating NEW video element for clip clip-XXX-16 (cache key: asset-XXX-trim0.XXX...)
```

This shows:

- Original clip (or left split) added to grace period
- New video element created for right split clip

### 2. During Transition Playback (in PreviewMediaPool)

**Success Pattern:**

```
[PreviewMediaPool] getVideoElements: Returning element for 2 clip IDs (split clips): clip-XXX-15, clip-XXX-16
```

This confirms:

- Both split clip IDs are tracked
- Video elements are returned for BOTH clips during grace period
- Rasterizer can access elements for transitions

### 3. In Rasterizer (Video Element Lookup)

**Success Pattern:**

```
[Rasterizer] ✅ Video element found for clip clip-XXX-15 (key: clip-XXX-15-asset-XXX)
[Rasterizer] ✅ Video element found for clip clip-XXX-16 (key: clip-XXX-16-asset-XXX)
```

This confirms:

- Video elements found for BOTH split clips
- No "No video element" warnings
- Transitions render correctly

**Failure Pattern (before fix):**

```
[Warning] [Rasterizer] No video element for clip clip-XXX-16 (key: clip-XXX-16-asset-XXX)
[Warning] [Rasterizer] Available keys for mediaId asset-XXX: Array (1)
```

This showed:

- Only 1 key available (the original clip)
- New split clip -16 couldn't find its element
- Preview went blank

### 4. Cache Key Mismatch Detection (Debug)

**If splits have different trimIn values:**

```
[PreviewMediaPool] SPLIT MISMATCH: Clip clip-XXX-16 has different cache key than clip-XXX-15
  New cacheKey: asset-XXX-trim5.123...
  trimIn: 5.123
```

This is EXPECTED behavior:

- Split clips with different trimIn get separate cache keys
- Separate video elements are created
- Both elements must exist during transition

---

## Performance Metrics to Monitor

**From Performance Monitor Report:**

### Before Fix:

```
rasterizer.video_element_hit                    68
rasterizer.resource_cache_miss                 441
```

- Many cache misses during transitions
- Preview blanks repeatedly

### After Fix (Expected):

```
rasterizer.video_element_hit                   200
rasterizer.resource_cache_miss                  59
```

- More video element hits
- Fewer resource cache misses
- Smooth transitions

---

## Testing Procedure

1. **Split a clip** on the timeline
2. **Add a transition** between the two split pieces
3. **Play across the transition**
4. **Check console logs** for:
   - ✅ "Removed clip added to grace period"
   - ✅ "Creating NEW video element"
   - ✅ "getVideoElements: Returning element for 2 clip IDs"
   - ✅ "Video element found for clip" (for BOTH splits)
5. **Verify visually**:
   - Preview should NOT go blank
   - Transition should render smoothly
   - Both clips visible during transition

---

## Key Files Modified

1. **src/core/resources/PreviewMediaPool.ts**
   - Changed `recentlyRemovedClips` to track array of clip IDs
   - Added logging for split detection
   - Modified `getVideoElements()` to return mappings for all tracked IDs

2. **src/core/render/rasterizer.ts**
   - Added success logging when video elements found
   - Added debug logging to show available keys on mismatch

---

## Expected Console Output Sequence

```
1. [PreviewMediaPool] Removed clip clip-1782286497980-3zj32gareqw-15 added to grace period
2. [PreviewMediaPool] Creating NEW video element for clip clip-1782286497980-3zj32gareqw-16
3. [Rasterizer] ✅ Video element found for clip clip-1782286497980-3zj32gareqw-15
4. [PreviewMediaPool] getVideoElements: Returning element for 2 clip IDs (split clips): clip-...-15, clip-...-16
5. [Rasterizer] ✅ Video element found for clip clip-1782286497980-3zj32gareqw-16
```

This sequence confirms the fix is working correctly!
