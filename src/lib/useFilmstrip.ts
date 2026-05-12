/**
 * useFilmstrip — hook for ClipFilmstrip
 *
 * Replaces the inline extraction orchestration in ClipFilmstrip.
 * ClipFilmstrip becomes a pure canvas consumer.
 *
 * Responsibilities:
 *   - Subscribe to RenderRuntime epoch for this clip
 *   - Request artifacts via transport layer (requestBatchArtifacts)
 *   - Re-request on epoch change (triggers on zoom-tier-commit, scroll, trim)
 *   - Cancel in-flight requests on epoch change or unmount
 *   - Return sorted TransportArtifacts for RasterSurface to render
 *   - **Own ImageBitmap lifecycle**: Close bitmaps when replaced or on cleanup
 *
 * Non-responsibilities (intentionally excluded):
 *   - Tile layout math (RasterSurface handles this)
 *   - Canvas drawing (RasterSurface handles this)
 *   - Zoom level → tier mapping (SRP via RenderRuntime handles this)
 *   - Epoch computation (RenderRuntime handles this)
 *
 * ImageBitmap Ownership Semantics:
 *   - This hook OWNS all ImageBitmaps it receives from the transport layer
 *   - Bitmaps are closed when:
 *     1. Replaced by higher-tier artifacts for the same timestamp
 *     2. Epoch changes (scroll, zoom, trim invalidation)
 *     3. Component unmounts
 *   - RasterSurface borrows bitmaps for rendering but does NOT own them
 *   - Prevents GPU resource leaks from progressive tier upgrades (L0→L1→L2→L3)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRenderEngineStore } from "../store/renderEngineStore";
import { useRenderState } from "./renderEngine/hooks";
import { SpatialTier, InteractionState } from "./renderEngine/types";
import { requestProgressiveTiers, type TransportArtifact } from "./renderEngine/transport";
import { DEFAULT_FILMSTRIP_TILE_WIDTH_PX, generateFilmstripSlotTimestamps, getFilmstripTileWidthForTier, getReadableFilmstripTier } from "./filmstripLayout";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseFilmstripOptions {
  clipId: string;
  videoPath: string;
  trimIn: number;
  trimOut: number;
  duration: number;
  clipWidthPx?: number;
  tileWidthPx?: number;
  stripHeightPx?: number;
  posterFrame?: string;
  enabled?: boolean;
}

export interface UseFilmstripResult {
  /** Sorted TransportArtifacts ready to pass to RasterSurface.drawFilmstrip() */
  artifacts: readonly TransportArtifact[];
  /** True while the first batch is loading */
  isLoading: boolean;
  /** True if no tier has been decoded yet — show posterFrame fallback */
  isFallback: boolean;
  /** Current interaction state — surface can dim during ballistic scroll */
  interactionState: InteractionState;
  /** SRP-selected tier used for UI-only layout decisions. */
  spatialTier: SpatialTier;
}

export function useFilmstrip(opts: UseFilmstripOptions): UseFilmstripResult {
  const { clipId, videoPath, trimIn, trimOut, duration, enabled = true, clipWidthPx, tileWidthPx, stripHeightPx, posterFrame } = opts;

  const runtime = useRenderEngineStore((s) => s.runtime);
  const renderState = useRenderState(clipId);
  const cancelRef = useRef<(() => void) | null>(null);

  // Sorted artifacts, keyed by timestamp+tier so we never duplicate
  const [artifacts, setArtifacts] = useState<readonly TransportArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track previous request signature to avoid duplicate decode requests.
  const prevRequestKeyRef = useRef<string>("");

  // Hold reference to previous epoch's artifacts to prevent premature bitmap closure
  const prevArtifactsRef = useRef<readonly TransportArtifact[]>([]);

  // Hold reference to current artifacts for unmount cleanup (avoids stale closure)
  const currentArtifactsRef = useRef<readonly TransportArtifact[]>([]);

  // Clear previous bitmaps on unmount or re-request
  const disposePrev = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    // Note: bitmap cleanup happens in the effect cleanup, not here
    // to avoid closing bitmaps that are still being rendered
  }, []);

  useEffect(() => {
    // Don't request frames if we're still in fallback state (waiting for real runtime state)
    if (!enabled || !videoPath || !duration || !runtime || renderState.isFallback) return;

    const { epochId, currentTier, interactionState } = renderState;

    // Don't request during scrubbing — wait for Converging/Idle without
    // poisoning the request signature for the next stable state.
    if (interactionState === InteractionState.Scrubbing) return;

    const { spatialTier } = currentTier;
    const tileWidth = tileWidthPx ?? getFilmstripTileWidthForTier(spatialTier);
    const stripHeight = stripHeightPx ?? 40;
    const clipWidth = clipWidthPx ?? duration * DEFAULT_FILMSTRIP_TILE_WIDTH_PX;
    const timestampsSecs = generateFilmstripSlotTimestamps({
      trimIn,
      trimOut,
      duration,
      clipWidthPx: clipWidth,
      tileWidthPx: tileWidth,
    });
    if (timestampsSecs.length === 0) return;

    const timestampsMs = timestampsSecs.map((t) => Math.round(t * 1000));
    const startTier = SpatialTier.L0;
    const targetTier = getReadableFilmstripTier(spatialTier, tileWidth, stripHeight, window.devicePixelRatio || 1);
    const requestKey = [epochId, trimIn, trimOut, duration, clipWidth, tileWidth, stripHeight, targetTier, timestampsMs.join(",")].join("|");

    if (requestKey === prevRequestKeyRef.current) return;
    prevRequestKeyRef.current = requestKey;

    // Cancel any in-flight request for the previous signature.
    disposePrev();

    // Keep previous artifacts visible during upgrade (don't clear on re-request)
    setIsLoading(true);

    // Accumulated artifacts for this epoch — keyed by `${timestampMs}:${spatialTier}`
    // Higher-tier arrivals naturally replace lower-tier entries for the same timestamp.
    const accumulated = new Map<string, TransportArtifact>();

    // RAF-batched flush: coalesce all artifacts arriving within the same frame
    // into a single setArtifacts() call. Without this, every artifact triggers
    // a React re-render → full canvas redraw, causing visible flickering as
    // L0/L1/L2/L3 thumbnails replace each other one-by-one.
    let rafId: number | null = null;
    let flushDirty = false;

    const scheduleFlush = () => {
      if (rafId !== null) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!flushDirty) return;
        flushDirty = false;

        // For each timestamp, keep only the highest tier received so far
        // CRITICAL: Close lower-tier bitmaps that are being replaced to prevent GPU leak
        const bestByTime = new Map<number, TransportArtifact>();
        for (const a of accumulated.values()) {
          const existing = bestByTime.get(a.timestampMs);
          if (!existing || a.spatialTier > existing.spatialTier) {
            // Close the replaced bitmap if it's a different object
            if (existing && existing.bitmap && existing.bitmap !== a.bitmap) {
              existing.bitmap.close();
            }
            bestByTime.set(a.timestampMs, a);
          }
        }
        const sorted = Array.from(bestByTime.values()).sort((a, b) => a.timestampMs - b.timestampMs);

        console.log("[useFilmstrip] scheduleFlush: setting", sorted.length, "artifacts");
        // Close previous epoch's bitmaps now that we have new ones ready
        // This prevents black gaps during the transition
        for (const prevArtifact of prevArtifactsRef.current) {
          if (prevArtifact.bitmap) {
            // Only close if this bitmap isn't being reused in the new set
            const isReused = sorted.some((a) => a.bitmap === prevArtifact.bitmap);
            if (!isReused) {
              prevArtifact.bitmap.close();
            }
          }
        }
        prevArtifactsRef.current = sorted;

        // Use functional update to avoid dependency on artifacts state
        setArtifacts(() => sorted);
        currentArtifactsRef.current = sorted; // Keep ref in sync for unmount cleanup
        setIsLoading(false);
      });
    };

    // Progressive tier sequence: always start at L0 for fast-paint, then
    // converge to the SRP-committed tier for the current zoom level.
    cancelRef.current = requestProgressiveTiers({
      videoPath,
      timestampsMs,
      startTier,
      targetTier,
      epochId,
      clipId,
      onArtifact: (artifact) => {
        console.log("[useFilmstrip] onArtifact received:", artifact.timestampMs, "tier:", artifact.spatialTier, "bitmap:", !!artifact.bitmap);
        const key = `${artifact.timestampMs}:${artifact.spatialTier}`;
        // Close existing bitmap for this key if we're replacing it
        const existing = accumulated.get(key);
        if (existing && existing.bitmap && existing.bitmap !== artifact.bitmap) {
          console.log("[useFilmstrip] Closing replaced bitmap for key:", key);
          existing.bitmap.close();
        }
        accumulated.set(key, artifact);
        flushDirty = true;
        scheduleFlush();
      },
      onComplete: () => {
        // Final flush — ensure all remaining artifacts are committed
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        // Synchronous final flush to guarantee nothing is dropped
        // CRITICAL: Close lower-tier bitmaps that are being replaced
        const bestByTime = new Map<number, TransportArtifact>();
        for (const a of accumulated.values()) {
          const existing = bestByTime.get(a.timestampMs);
          if (!existing || a.spatialTier > existing.spatialTier) {
            // Close the replaced bitmap if it's a different object
            if (existing && existing.bitmap && existing.bitmap !== a.bitmap) {
              existing.bitmap.close();
            }
            bestByTime.set(a.timestampMs, a);
          }
        }
        const sorted = Array.from(bestByTime.values()).sort((a, b) => a.timestampMs - b.timestampMs);

        // Close previous epoch's bitmaps now that the full new set is ready
        for (const prevArtifact of prevArtifactsRef.current) {
          if (prevArtifact.bitmap) {
            const isReused = sorted.some((a) => a.bitmap === prevArtifact.bitmap);
            if (!isReused) {
              prevArtifact.bitmap.close();
            }
          }
        }
        prevArtifactsRef.current = sorted;

        // Use functional update to avoid dependency on artifacts state
        setArtifacts(() => sorted);
        currentArtifactsRef.current = sorted; // Keep ref in sync for unmount cleanup
        setIsLoading(false);
      },
    });

    return () => {
      // Cancel pending RAF flush before cancelling requests
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // CRITICAL: Don't close accumulated bitmaps here - they're now tracked in prevArtifactsRef
      // and will be closed when the next batch completes (in scheduleFlush/onComplete)
      accumulated.clear();
      disposePrev();
    };
  }, [
    enabled,
    videoPath,
    duration,
    trimIn,
    trimOut,
    clipWidthPx,
    tileWidthPx,
    stripHeightPx,
    // Re-run when epoch changes (covers zoom-tier, scroll, trim)
    renderState.epochId,
    renderState.currentTier.spatialTier,
    renderState.interactionState,
    renderState.isFallback,
    runtime,
    clipId,
    disposePrev,
  ]);

  // Unmount cleanup ONLY - close all bitmaps to prevent GPU leak
  // Uses refs to avoid stale closures and running on every artifacts change
  useEffect(() => {
    return () => {
      console.log("[useFilmstrip] UNMOUNT cleanup - closing all bitmaps");
      disposePrev();
      // Close all bitmaps in the current artifacts ref
      for (const artifact of currentArtifactsRef.current) {
        if (artifact.bitmap) {
          console.log("[useFilmstrip] Closing artifact bitmap on unmount:", artifact.timestampMs);
          artifact.bitmap.close();
        }
      }
      // Also close any lingering previous epoch bitmaps
      for (const artifact of prevArtifactsRef.current) {
        if (artifact.bitmap && !currentArtifactsRef.current.some((a) => a.bitmap === artifact.bitmap)) {
          console.log("[useFilmstrip] Closing prevArtifact bitmap on unmount:", artifact.timestampMs);
          artifact.bitmap.close();
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ONLY on unmount - empty deps array!

  return {
    artifacts,
    isLoading,
    isFallback: renderState.isFallback || artifacts.length === 0,
    interactionState: renderState.interactionState,
    spatialTier: renderState.currentTier.spatialTier,
  };
}
