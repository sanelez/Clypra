import type { Clip } from "@/types";

export const PREVIEW_MEDIA_LOOKAHEAD_SECONDS = 1.5;
export const PREVIEW_MEDIA_RETENTION_SECONDS = 0.25;

// ─── FINDING-010: Memoize clip filtering ─────────────────────────────────────
// This function is called 60fps during playback, but results only change when
// clock crosses clip boundaries (rare - maybe 1-10 times/sec).
// Cache results keyed by rounded time + clip count to avoid repeated filtering.
const clipFilterCache = new Map<string, Clip[]>();
const MAX_CACHE_SIZE = 100; // Limit cache growth (100 entries = ~1.67 seconds at 60fps)

export function getPreviewMediaSyncClips(clips: Clip[], time: number): Clip[] {
  // ER-HIDDEN-001 fix: Use all clip IDs to construct cache key to prevent collisions on undo/redo
  const clipIdsHash = clips.map((c) => c.id).join(",");
  const cacheKey = `${time.toFixed(1)}-${clips.length}-${clipIdsHash}`;

  // Check cache first (hot path - saves ~0.5-1ms per frame × 60fps)
  if (clipFilterCache.has(cacheKey)) {
    return clipFilterCache.get(cacheKey)!;
  }

  // Cache miss - perform filtering
  const result = clips.filter((clip) => {
    const clipEnd = clip.startTime + clip.duration;
    const isCurrent = clip.startTime <= time && time < clipEnd;
    const isUpcoming = clip.startTime > time && clip.startTime <= time + PREVIEW_MEDIA_LOOKAHEAD_SECONDS;
    const isRecentlyEnded = clipEnd <= time && clipEnd >= time - PREVIEW_MEDIA_RETENTION_SECONDS;
    return isCurrent || isUpcoming || isRecentlyEnded;
  });

  // Store in cache
  clipFilterCache.set(cacheKey, result);

  // Evict oldest entries if cache grows too large
  if (clipFilterCache.size > MAX_CACHE_SIZE) {
    const firstKey = clipFilterCache.keys().next().value;
    if (firstKey) clipFilterCache.delete(firstKey);
  }

  return result;
}

// Export for testing
export function clearClipFilterCache(): void {
  clipFilterCache.clear();
}
// ──────────────────────────────────────────────────────────────────────────────
