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
  const { clipId, videoPath, trimIn, trimOut, duration, enabled = true } = opts;

  const runtime = useRenderEngineStore((s) => s.runtime);
  const renderState = useRenderState(clipId);
  const cancelRef = useRef<(() => void) | null>(null);

  // Sorted artifacts, keyed by timestamp+tier so we never duplicate
  const [artifacts, setArtifacts] = useState<readonly TransportArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track previous request signature to avoid duplicate decode requests.
  const prevRequestKeyRef = useRef<string>("");

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
    const tileWidthPx = opts.tileWidthPx ?? getFilmstripTileWidthForTier(spatialTier);
    const stripHeightPx = opts.stripHeightPx ?? 40;
    const clipWidthPx = opts.clipWidthPx ?? duration * DEFAULT_FILMSTRIP_TILE_WIDTH_PX;
    const timestampsSecs = generateFilmstripSlotTimestamps({
      trimIn,
      trimOut,
      duration,
      clipWidthPx,
      tileWidthPx,
    });
    if (timestampsSecs.length === 0) return;

    const timestampsMs = timestampsSecs.map((t) => Math.round(t * 1000));
    const startTier = SpatialTier.L0;
    const targetTier = getReadableFilmstripTier(spatialTier, tileWidthPx, stripHeightPx, window.devicePixelRatio || 1);
    const requestKey = [epochId, trimIn, trimOut, duration, clipWidthPx, tileWidthPx, stripHeightPx, targetTier, timestampsMs.join(",")].join("|");

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
        setArtifacts(sorted);
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
        const key = `${artifact.timestampMs}:${artifact.spatialTier}`;
        // Close existing bitmap for this key if we're replacing it
        const existing = accumulated.get(key);
        if (existing && existing.bitmap && existing.bitmap !== artifact.bitmap) {
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
        setArtifacts(sorted);
        setIsLoading(false);
      },
    });

    return () => {
      // Cancel pending RAF flush before cancelling requests
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // CRITICAL: Close all accumulated bitmaps on epoch change to prevent GPU leak
      for (const artifact of accumulated.values()) {
        if (artifact.bitmap) {
          artifact.bitmap.close();
        }
      }
      accumulated.clear();
      disposePrev();
    };
  }, [
    enabled,
    videoPath,
    duration,
    trimIn,
    trimOut,
    opts.clipWidthPx,
    opts.tileWidthPx,
    opts.stripHeightPx,
    // Re-run when epoch changes (covers zoom-tier, scroll, trim)
    renderState.epochId,
    renderState.currentTier.spatialTier,
    renderState.interactionState,
    renderState.isFallback,
    runtime,
    clipId,
    disposePrev,
  ]);

  // Unmount cleanup - close all bitmaps to prevent GPU leak
  useEffect(() => {
    return () => {
      disposePrev();
      // Close all bitmaps in the current artifacts array
      for (const artifact of artifacts) {
        if (artifact.bitmap) {
          artifact.bitmap.close();
        }
      }
    };
  }, [disposePrev, artifacts]);

  return {
    artifacts,
    isLoading,
    isFallback: renderState.isFallback || artifacts.length === 0,
    interactionState: renderState.interactionState,
    spatialTier: renderState.currentTier.spatialTier,
  };
}
