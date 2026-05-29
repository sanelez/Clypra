import React, { useRef, useEffect, useState, useCallback, useMemo, RefObject } from "react";
import { useDragLayer } from "react-dnd";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTimelineStore, getInsertIndexForNewTrack } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useUIStore } from "@/store/uiStore";
import { usePlayback } from "@/hooks/usePlayback";
import type { Clip, VideoMetadata } from "@/types";
import { createClipFromAsset, getTimelineViewportEnd } from "@/lib/timelineClip";
import { autoAdaptSequenceForFirstVisualClip } from "@/lib/sequenceAutoAspect";
import { DEFAULT_PLACEMENT_POLICY, resolveClipStartTime, resolvePreferredTrackId, resolveTargetTrackType } from "@/lib/placementPolicy";
import { useRenderRuntime } from "@/hooks/useRenderRuntime";
import { getActiveSessionOrNull } from "@/core/runtime/ProjectSession";
import { TIMELINE_MAX_PPS, TIMELINE_MIN_PPS } from "@/lib/timelineZoom";
import { suspendAutoSave, resumeAutoSave } from "@/store/middleware/autoSaveMiddleware";
import { generateId } from "@/lib/id";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineRuler } from "./TimelineRuler";
import { TrackList } from "./TrackList";
import { Track } from "./Track";
import { Playhead } from "./Playhead";
import { EmptyTimelineDropZone } from "./EmptyTimelineDropZone";

const SELECT_TRACE = import.meta.env.DEV;
const traceSelect = (...args: unknown[]) => {
  if (!SELECT_TRACE) return;
  console.log("[SelectTrace][Timeline]", ...args);
};

/** Multiplier on normalized wheel delta (pixels); higher = stronger zoom per tick. */
const WHEEL_ZOOM_SENSITIVITY = 0.006;
/** Extra multiplier for Ctrl/⌘ + wheel zoom feel (higher = faster). */
const WHEEL_ZOOM_SPEED_MULTIPLIER = 2.5;
const DRAG_RENDER_EPSILON_PX = 0.25;
const BOUNDARY_SNAP_EPSILON_PX = 2;
const TIME_SNAP_EPSILON_SEC = 0.06;

function normalizeWheelDeltaY(e: WheelEvent, viewportClientHeight: number): number {
  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return e.deltaY * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return e.deltaY * Math.max(1, viewportClientHeight);
    default:
      return e.deltaY;
  }
}

/** Map viewport Y to a track using each row's DOM rect (ruler / flex centering safe). */
function resolveTrackAtClientY(container: HTMLElement, tracks: Array<{ id: string }>, clientY: number): { targetTrackId: string | null; willCreateNewTrack: boolean; newTrackPosition: "above" | "below" | null } {
  if (tracks.length === 0) {
    return { targetTrackId: null, willCreateNewTrack: true, newTrackPosition: "below" };
  }

  const rects: { id: string; top: number; bottom: number }[] = [];
  for (const track of tracks) {
    const row = container.querySelector<HTMLElement>(`[data-track-id="${track.id}"]`);
    if (!row) continue;
    const r = row.getBoundingClientRect();
    rects.push({ id: track.id, top: r.top, bottom: r.bottom });
  }

  if (rects.length === 0) {
    return { targetTrackId: null, willCreateNewTrack: false, newTrackPosition: null };
  }

  const firstTop = Math.min(...rects.map((x) => x.top));
  const lastBottom = Math.max(...rects.map((x) => x.bottom));

  if (clientY < firstTop) {
    return { targetTrackId: null, willCreateNewTrack: true, newTrackPosition: "above" };
  }
  if (clientY >= lastBottom) {
    return { targetTrackId: null, willCreateNewTrack: true, newTrackPosition: "below" };
  }

  for (const track of tracks) {
    const row = container.querySelector<HTMLElement>(`[data-track-id="${track.id}"]`);
    if (!row) continue;
    const r = row.getBoundingClientRect();
    if (clientY >= r.top && clientY < r.bottom) {
      return { targetTrackId: track.id, willCreateNewTrack: false, newTrackPosition: null };
    }
  }

  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const rect of rects) {
    const mid = (rect.top + rect.bottom) / 2;
    const d = Math.abs(clientY - mid);
    if (d < bestDist) {
      bestDist = d;
      bestId = rect.id;
    }
  }
  return { targetTrackId: bestId, willCreateNewTrack: false, newTrackPosition: null };
}

export const Timeline: React.FC = () => {
  const { tracks, clips, pixelsPerSecond, scrollLeft, setScrollLeft, getTimelineEndTime, addClip, addTrack, insertTrackAt, insertClipAtIndex, updateClip, normalizeTrack, removeEmptyNonMainTracks, withBatch, clipDragMode, snapEnabled } = useTimelineStore();

  const { mediaAssets, addMediaAsset, project, updateProject } = useProjectStore();
  const { previewMode, exitSourceMode, clearSelection } = useUIStore();
  const { currentTime, duration, isPlaying, seek, setDuration } = usePlayback();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const isProcessingDropRef = useRef(false);

  // Monitor drag state from MediaTab
  const { isDragging: isMediaDragging } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging() && monitor.getItemType() === "MEDIA_ASSET",
  }));

  useEffect(() => {
    setIsDraggingMedia(isMediaDragging);
  }, [isMediaDragging]);

  // ── RenderRuntime event wiring ──────────────────────────────────────────────
  const runtime = useRenderRuntime();

  // Attach scroll/pointer listeners to the timeline scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!runtime || !container) return;
    return runtime.attach(container);
  }, [runtime]); // re-attach if runtime changes (e.g. project switch)

  // Notify runtime when zoom scale changes. Layout uses px/s; SRP uses zoomLevel.
  useEffect(() => {
    if (!runtime) return;
    runtime.notifyZoom(pixelsPerSecond / 100);
  }, [runtime, pixelsPerSecond]);

  // Pointer-based drag state with gap engine
  const [dragState, setDragState] = useState<{
    draggingClipId: string | null;
    draggedClipIds: string[];
    offsetX: number;
    offsetY: number;
    /** Pointer X in timeline content space at drag start (handles horizontal scroll). */
    pointerXContentStart: number;
    /** Pointer Y in viewport at drag start (pairs with translateY in track space). */
    pointerClientYStart: number;
    /** Keeps ghost X aligned after moving dragged clip to tail in store (px). */
    visualLeftAnchorDelta: number;
    originalTrackId: string;
    originalIndex: number;
    originalStartTime: number; // Keep for ESC cancel
    originalPlacements: Record<string, { trackId: string; startTime: number; index: number }>;
    // Gap engine state
    targetTrackId: string | null;
    insertionIndex: number | null;
    gapStartTime: number | null;
    gapDuration: number | null;
    targetStartTime: number | null;
    isInvalidPosition?: boolean; // For visual feedback
    // New track creation
    willCreateNewTrack?: boolean;
    newTrackPosition?: "above" | "below" | null;
  } | null>(null);

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;
  const dragMoveRafRef = useRef<number | null>(null);
  const dragMovePointerRef = useRef<{ clipId: string; clientX: number; clientY: number } | null>(null);
  const dragTrackMetricsRef = useRef<
    Map<
      string,
      {
        trackClips: Clip[];
        prefixWidths: Float64Array;
        midpoints: Float64Array;
      }
    >
  >(new Map());

  // ── Lookup maps: O(n) once per clip/track change, O(1) during drag ──
  const clipMapRef = useRef<Map<string, (typeof clips)[number]>>(new Map());
  const trackClipsMapRef = useRef<Map<string, typeof clips>>(new Map());

  useMemo(() => {
    clipMapRef.current = new Map(clips.map((c) => [c.id, c]));

    const tcMap = new Map<string, typeof clips>();
    for (const track of tracks) {
      tcMap.set(
        track.id,
        clips.filter((c) => c.trackId === track.id).sort((a, b) => a.startTime - b.startTime),
      );
    }
    trackClipsMapRef.current = tcMap;
  }, [clips, tracks]);

  const buildDragTrackMetrics = useCallback((draggedClipIds: string[], pps: number) => {
    const draggedSet = new Set(draggedClipIds);
    const metrics = new Map<
      string,
      {
        trackClips: Clip[];
        prefixWidths: Float64Array;
        midpoints: Float64Array;
      }
    >();

    for (const track of useTimelineStore.getState().tracks) {
      const trackClips = (trackClipsMapRef.current.get(track.id) ?? []).filter((c) => !draggedSet.has(c.id));
      const prefixWidths = new Float64Array(trackClips.length + 1);
      const midpoints = new Float64Array(trackClips.length);
      for (let i = 0; i < trackClips.length; i++) {
        const w = trackClips[i].duration * pps;
        prefixWidths[i + 1] = prefixWidths[i] + w;
        midpoints[i] = prefixWidths[i] + w / 2;
      }
      metrics.set(track.id, { trackClips, prefixWidths, midpoints });
    }

    dragTrackMetricsRef.current = metrics;
  }, []);

  // Handle clip drag with gap engine
  const handleClipDragStart = useCallback(
    (clipId: string, startX: number, startY: number) => {
      const clip = clipMapRef.current.get(clipId);
      if (!clip) return;
      suspendAutoSave();
      const selectedClipIds = useUIStore.getState().selectedClipIds;
      const draggedClipIds = selectedClipIds.includes(clipId) ? selectedClipIds : [clipId];
      const pps = useTimelineStore.getState().pixelsPerSecond;
      buildDragTrackMetrics(draggedClipIds, pps);

      // Find clip's index in its track
      const trackClips = trackClipsMapRef.current.get(clip.trackId) ?? [];
      const originalIndex = trackClips.findIndex((c) => c.id === clipId);
      const originalPlacements: Record<string, { trackId: string; startTime: number; index: number }> = {};
      for (const draggedId of draggedClipIds) {
        const dragged = clipMapRef.current.get(draggedId);
        if (!dragged) continue;
        const draggedTrackClips = trackClipsMapRef.current.get(dragged.trackId) ?? [];
        originalPlacements[dragged.id] = {
          trackId: dragged.trackId,
          startTime: dragged.startTime,
          index: draggedTrackClips.findIndex((c) => c.id === dragged.id),
        };
      }

      // Pack other clips to t=0.. — then move dragged clip to tail so it never shares startTime with siblings (avoids overlap in store).
      const originalLeftPx = Math.round(clip.startTime * pps);

      const otherClips = trackClips.filter((c) => c.id !== clipId);
      let tailTime = 0;
      withBatch(() => {
        let currentTime = 0;
        otherClips.forEach((c) => {
          updateClip(c.id, { startTime: currentTime });
          currentTime += c.duration;
        });

        tailTime = currentTime;
        updateClip(clipId, { startTime: tailTime });
      });
      const leftNewPx = Math.round(tailTime * pps);
      const visualLeftAnchorDelta = originalLeftPx - leftNewPx;

      const container = containerRef.current;
      let pointerXContentStart = startX;
      const pointerClientYStart = startY;
      if (container) {
        const cr = container.getBoundingClientRect();
        pointerXContentStart = startX - cr.left + container.scrollLeft;
      }

      const nextDragState = {
        draggingClipId: clipId,
        draggedClipIds,
        offsetX: visualLeftAnchorDelta,
        offsetY: 0,
        pointerXContentStart,
        pointerClientYStart,
        visualLeftAnchorDelta,
        originalTrackId: clip.trackId,
        originalIndex,
        originalStartTime: clip.startTime,
        originalPlacements,
        targetTrackId: null as string | null,
        insertionIndex: null as number | null,
        gapStartTime: null as number | null,
        gapDuration: null as number | null,
        targetStartTime: null as number | null,
        isInvalidPosition: false,
        willCreateNewTrack: false,
        newTrackPosition: null as "above" | "below" | null,
      };
      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
    },
    [buildDragTrackMetrics, updateClip, withBatch],
  );

  const flushQueuedClipDragMove = useCallback(() => {
    dragMoveRafRef.current = null;
    const pointer = dragMovePointerRef.current;
    if (!pointer) return;
    const { clipId, clientX, clientY } = pointer;
    const ds = dragStateRef.current;
    if (!ds || ds.draggingClipId !== clipId) return;

    const container = containerRef.current;
    if (!container) return;

    const cr = container.getBoundingClientRect();
    const pointerXContent = clientX - cr.left + container.scrollLeft;
    const contentDeltaPx = pointerXContent - ds.pointerXContentStart;
    const offsetX = contentDeltaPx + ds.visualLeftAnchorDelta;
    const offsetY = clientY - ds.pointerClientYStart;

    const { clips: liveClips, tracks: liveTracks } = useTimelineStore.getState();
    const clip = clipMapRef.current.get(clipId) ?? liveClips.find((c) => c.id === clipId);
    if (!clip) return;

    const { targetTrackId, willCreateNewTrack, newTrackPosition } = resolveTrackAtClientY(container, liveTracks, clientY);

    // If creating new track, show indicator and skip insertion calculation.
    if (willCreateNewTrack) {
      const next = {
        ...ds,
        offsetX,
        offsetY,
        isInvalidPosition: false,
        targetTrackId: null,
        insertionIndex: null,
        gapStartTime: null,
        gapDuration: null,
        targetStartTime: null,
        willCreateNewTrack: true,
        newTrackPosition,
      };
      const visualChanged = Math.abs((next.offsetX ?? 0) - (ds.offsetX ?? 0)) > DRAG_RENDER_EPSILON_PX || Math.abs((next.offsetY ?? 0) - (ds.offsetY ?? 0)) > DRAG_RENDER_EPSILON_PX;
      dragStateRef.current = next;
      if (visualChanged || ds.willCreateNewTrack !== next.willCreateNewTrack || ds.newTrackPosition !== next.newTrackPosition) {
        setDragState(next);
      }
      return;
    }

    const targetTrack = liveTracks.find((t) => t.id === targetTrackId);
    const isTextClip = "text" in clip;
    const isTrackTypeMismatch = targetTrack
      ? (isTextClip ? targetTrack.type !== "text" : targetTrack.type === "text")
      : false;
    const isInvalidPosition = targetTrack?.locked || isTrackTypeMismatch || false;
    if (isInvalidPosition) {
      const next = {
        ...ds,
        offsetX,
        offsetY,
        isInvalidPosition: true,
        targetTrackId: null,
        insertionIndex: null,
        gapStartTime: null,
        gapDuration: null,
        targetStartTime: null,
        willCreateNewTrack: false,
        newTrackPosition: null,
      };
      const visualChanged = Math.abs((next.offsetX ?? 0) - (ds.offsetX ?? 0)) > DRAG_RENDER_EPSILON_PX || Math.abs((next.offsetY ?? 0) - (ds.offsetY ?? 0)) > DRAG_RENDER_EPSILON_PX;
      dragStateRef.current = next;
      if (visualChanged || ds.isInvalidPosition !== next.isInvalidPosition) {
        setDragState(next);
      }
      return;
    }

    if (!targetTrackId) {
      const next = { ...ds, offsetX, offsetY };
      const visualChanged = Math.abs((next.offsetX ?? 0) - (ds.offsetX ?? 0)) > DRAG_RENDER_EPSILON_PX || Math.abs((next.offsetY ?? 0) - (ds.offsetY ?? 0)) > DRAG_RENDER_EPSILON_PX;
      dragStateRef.current = next;
      if (visualChanged) {
        setDragState(next);
      }
      return;
    }

    const { pixelsPerSecond: livePps, clipDragMode: dragMode, snapEnabled: snapOn } = useTimelineStore.getState();
    const pps = Math.max(1, livePps);
    const dragPrimaryPlacement = ds.originalPlacements[ds.draggingClipId];
    const dragPrimaryStart = dragPrimaryPlacement?.startTime ?? 0;
    const deltaTime = (offsetX - ds.visualLeftAnchorDelta) / pps;
    let targetStartTime = Math.max(0, dragPrimaryStart + deltaTime);

    if (snapOn) {
      const snapCandidates: number[] = [0, currentTime];
      const onTrack = (trackClipsMapRef.current.get(targetTrackId) ?? []).filter((c) => c.id !== clipId);
      for (const c of onTrack) {
        snapCandidates.push(c.startTime, c.startTime + c.duration);
      }
      let closest = targetStartTime;
      let best = Infinity;
      for (const t of snapCandidates) {
        const d = Math.abs(t - targetStartTime);
        if (d <= TIME_SNAP_EPSILON_SEC && d < best) {
          best = d;
          closest = t;
        }
      }
      targetStartTime = closest;
    }

    if (dragMode === "insert" || dragMode === "ripple") {
      const trackMetrics = dragTrackMetricsRef.current.get(targetTrackId) ?? {
        trackClips: [],
        prefixWidths: new Float64Array(1),
        midpoints: new Float64Array(0),
      };
      const pointerX = clientX - cr.left + container.scrollLeft;
      let lo = 0;
      let hi = trackMetrics.midpoints.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const clipMidpoint = trackMetrics.midpoints[mid];
        if (pointerX < clipMidpoint) hi = mid;
        else lo = mid + 1;
      }
      let insertionIndex = lo;
      const boundaryMidpoint = trackMetrics.midpoints[Math.max(0, Math.min(trackMetrics.midpoints.length - 1, insertionIndex - 1))];
      if (Number.isFinite(boundaryMidpoint) && Math.abs(pointerX - boundaryMidpoint) <= BOUNDARY_SNAP_EPSILON_PX && ds.targetTrackId === targetTrackId && ds.insertionIndex !== null) {
        insertionIndex = ds.insertionIndex;
      }
      const gapStartTime = trackMetrics.prefixWidths[Math.max(0, Math.min(trackMetrics.prefixWidths.length - 1, insertionIndex))] / pps;
      const next = {
        ...ds,
        offsetX,
        offsetY,
        isInvalidPosition: false,
        targetTrackId,
        insertionIndex,
        gapStartTime,
        gapDuration: clip.duration,
        targetStartTime,
        willCreateNewTrack: false,
        newTrackPosition: null,
      };
      const visualChanged = Math.abs((next.offsetX ?? 0) - (ds.offsetX ?? 0)) > DRAG_RENDER_EPSILON_PX || Math.abs((next.offsetY ?? 0) - (ds.offsetY ?? 0)) > DRAG_RENDER_EPSILON_PX;
      const targetChanged = ds.targetTrackId !== next.targetTrackId || ds.targetStartTime !== next.targetStartTime || ds.insertionIndex !== next.insertionIndex || ds.isInvalidPosition !== next.isInvalidPosition || ds.willCreateNewTrack !== next.willCreateNewTrack || ds.newTrackPosition !== next.newTrackPosition;
      dragStateRef.current = next;
      if (visualChanged || targetChanged) setDragState(next);
      return;
    }

    const next = {
      ...ds,
      offsetX,
      offsetY,
      isInvalidPosition: false,
      targetTrackId,
      insertionIndex: null,
      gapStartTime: targetStartTime,
      gapDuration: clip.duration,
      targetStartTime,
      willCreateNewTrack: false,
      newTrackPosition: null,
    };
    const visualChanged = Math.abs((next.offsetX ?? 0) - (ds.offsetX ?? 0)) > DRAG_RENDER_EPSILON_PX || Math.abs((next.offsetY ?? 0) - (ds.offsetY ?? 0)) > DRAG_RENDER_EPSILON_PX;
    const targetChanged =
      ds.targetTrackId !== next.targetTrackId ||
      ds.targetStartTime !== next.targetStartTime ||
      ds.insertionIndex !== next.insertionIndex ||
      ds.isInvalidPosition !== next.isInvalidPosition ||
      ds.willCreateNewTrack !== next.willCreateNewTrack ||
      ds.newTrackPosition !== next.newTrackPosition;
    dragStateRef.current = next;
    if (visualChanged || targetChanged) {
      setDragState(next);
    }
  }, []);

  const handleClipDragMove = useCallback((clipId: string, _deltaX: number, _deltaY: number, clientX: number, clientY: number) => {
    const ds = dragStateRef.current;
    if (!ds || ds.draggingClipId !== clipId) return;
    dragMovePointerRef.current = { clipId, clientX, clientY };
    if (dragMoveRafRef.current !== null) return;
    dragMoveRafRef.current = requestAnimationFrame(flushQueuedClipDragMove);
  }, [flushQueuedClipDragMove]);

  const clearQueuedDragMove = useCallback(() => {
    if (dragMoveRafRef.current !== null) {
      cancelAnimationFrame(dragMoveRafRef.current);
      dragMoveRafRef.current = null;
    }
    dragMovePointerRef.current = null;
    dragTrackMetricsRef.current.clear();
  }, []);

  const handleClipDragEnd = useCallback(
    (clipId: string) => {
      flushQueuedClipDragMove();
      const dragSnapshot = dragStateRef.current;
      if (!dragSnapshot) {
        clearQueuedDragMove();
        return;
      }

      const sourceTrackIds = Array.from(new Set(Object.values(dragSnapshot.originalPlacements).map((p) => p.trackId)));
      const restoreDraggedToOriginal = () => {
        withBatch(() => {
          const affectedTracks = new Set<string>();
          dragSnapshot.draggedClipIds.forEach((id) => {
            const placement = dragSnapshot.originalPlacements[id];
            if (!placement) return;
            affectedTracks.add(placement.trackId);
            updateClip(id, {
              trackId: placement.trackId,
              startTime: placement.startTime,
            });
          });
          affectedTracks.forEach((trackId) => normalizeTrack(trackId));
        });
      };

      if (dragSnapshot.isInvalidPosition) {
        restoreDraggedToOriginal();
        dragStateRef.current = null;
        setDragState(null);
        clearQueuedDragMove();
        resumeAutoSave();
        return;
      }

      const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId);
      if (!clip) {
        dragStateRef.current = null;
        setDragState(null);
        clearQueuedDragMove();
        resumeAutoSave();
        return;
      }
      // Note: Main track protection removed - timeline is now time-centric, not track-centric
      // Users can freely move clips between tracks without structural constraints
      // The compositor will handle rendering at any time, even if tracks are empty

      // Handle new track creation (ordered: video at top, audio after first video track)
      if (dragSnapshot.willCreateNewTrack && dragSnapshot.newTrackPosition) {
        const isTextClip = "text" in clip;
        const mediaAsset = useProjectStore.getState().mediaAssets.find((a) => a.id === clip.mediaId);
        const trackType = isTextClip ? "text" : (mediaAsset?.type === "audio" ? "audio" : "video");

        const store = useTimelineStore.getState();
        const insertIndex = getInsertIndexForNewTrack(store.tracks, trackType);
        const newTrackId = store.insertTrackAt(trackType, insertIndex);
        const orderedDragged = [...dragSnapshot.draggedClipIds].sort((a, b) => {
          const pa = dragSnapshot.originalPlacements[a];
          const pb = dragSnapshot.originalPlacements[b];
          if (!pa || !pb) return a.localeCompare(b);
          if (pa.startTime !== pb.startTime) return pa.startTime - pb.startTime;
          return a.localeCompare(b);
        });
        const baseStartTime = dragSnapshot.targetStartTime ?? 0;
        const primaryDraggedId = dragSnapshot.draggingClipId ?? dragSnapshot.draggedClipIds[0];
        const primaryOriginalStart = (primaryDraggedId ? dragSnapshot.originalPlacements[primaryDraggedId]?.startTime : undefined) ?? 0;
        withBatch(() => {
          orderedDragged.forEach((id) => {
            const placement = dragSnapshot.originalPlacements[id];
            if (!placement) return;
            const relativeStartOffset = placement.startTime - primaryOriginalStart;
            updateClip(id, {
              trackId: newTrackId,
              startTime: Math.max(0, baseStartTime + relativeStartOffset),
            });
          });
        });
        removeEmptyNonMainTracks(sourceTrackIds);

        dragStateRef.current = null;
        setDragState(null);
        clearQueuedDragMove();
        resumeAutoSave();
        return;
      }

      const { pixelsPerSecond: livePps, clipDragMode: dragMode } = useTimelineStore.getState();
      if ((dragMode === "insert" || dragMode === "ripple") && dragSnapshot.targetTrackId && dragSnapshot.insertionIndex !== null) {
        const orderedDragged = [...dragSnapshot.draggedClipIds].sort((a, b) => {
          const pa = dragSnapshot.originalPlacements[a];
          const pb = dragSnapshot.originalPlacements[b];
          if (!pa || !pb) return a.localeCompare(b);
          if (pa.startTime !== pb.startTime) return pa.startTime - pb.startTime;
          return a.localeCompare(b);
        });
        orderedDragged.forEach((id, i) => insertClipAtIndex(id, dragSnapshot.targetTrackId!, dragSnapshot.insertionIndex! + i));
        if (dragMode === "ripple") normalizeTrack(dragSnapshot.targetTrackId);
        removeEmptyNonMainTracks(sourceTrackIds);
        dragStateRef.current = null;
        setDragState(null);
        clearQueuedDragMove();
        resumeAutoSave();
        return;
      }

      const pps = livePps;
      const anchor = dragSnapshot.visualLeftAnchorDelta ?? 0;
      const deltaTime = (dragSnapshot.offsetX - anchor) / pps;
      const normalizedDeltaTime = Math.max(
        deltaTime,
        ...dragSnapshot.draggedClipIds.map((id) => {
          const placement = dragSnapshot.originalPlacements[id];
          return placement ? -placement.startTime : 0;
        }),
      );
      const destinationTrackId = dragSnapshot.targetTrackId;

      withBatch(() => {
        dragSnapshot.draggedClipIds.forEach((id) => {
          const placement = dragSnapshot.originalPlacements[id];
          if (!placement) return;
          updateClip(id, {
            startTime: Math.max(0, placement.startTime + normalizedDeltaTime),
            trackId: destinationTrackId ?? placement.trackId,
          });
        });
      });
      removeEmptyNonMainTracks(sourceTrackIds);

      dragStateRef.current = null;
      setDragState(null);
      clearQueuedDragMove();
      resumeAutoSave();
    },
    [flushQueuedClipDragMove, clearQueuedDragMove, updateClip, insertTrackAt, insertClipAtIndex, normalizeTrack, removeEmptyNonMainTracks, withBatch],
  );

  // Handle ESC key to cancel drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      clearQueuedDragMove();
      const ds = dragStateRef.current;
      if (!ds) return;

      withBatch(() => {
        const affectedTracks = new Set<string>();
        ds.draggedClipIds.forEach((id) => {
          const placement = ds.originalPlacements[id];
          if (!placement) return;
          affectedTracks.add(placement.trackId);
          updateClip(id, {
            trackId: placement.trackId,
            startTime: placement.startTime,
          });
        });
        affectedTracks.forEach((trackId) => normalizeTrack(trackId));
      });

      dragStateRef.current = null;
      setDragState(null);
      resumeAutoSave();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearQueuedDragMove, normalizeTrack, updateClip, withBatch]);

  // Handle Delete/Backspace key to remove selected clips
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete or Backspace
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      // Don't delete if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const { selectedClipIds } = useUIStore.getState();
      if (selectedClipIds.length === 0) return;

      // Note: Main track protection removed - users can delete any clips
      // Timeline validation will inform about gaps, but never blocks deletion
      // The compositor handles rendering gracefully even with empty tracks

      // Remove each selected clip (batched — single epoch increment)
      const store = useTimelineStore.getState();
      const { removeClip, normalizeTrack, removeEmptyNonMainTracks, withBatch } = store;
      const affectedTracks = new Set<string>();

      withBatch(() => {
        selectedClipIds.forEach((clipId) => {
          const clip = store.clips.find((c) => c.id === clipId);
          if (clip) {
            affectedTracks.add(clip.trackId);
            removeClip(clipId);
          }
        });

        // Normalize affected tracks to close gaps
        affectedTracks.forEach((trackId) => normalizeTrack(trackId));
        removeEmptyNonMainTracks(Array.from(affectedTracks));
      });

      // Clear selection after deletion
      useUIStore.getState().clearSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      clearQueuedDragMove();
    };
  }, [clearQueuedDragMove]);

  const handleTimelinePointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (dragStateRef.current?.draggingClipId) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-timeline-interactive="true"]')) return;
    traceSelect("timeline pointerdown -> clearSelection", {
      target: target.tagName,
      className: target.className,
      selectedBefore: useUIStore.getState().selectedClipIds,
    });
    useUIStore.getState().clearSelection();
  }, []);

  // ✅ CRITICAL SEPARATION: Viewport extent vs Sequence duration
  //
  // Viewport extent (contentWidth) = visual editor space (min 10s for UX)
  // Sequence duration (duration) = actual authored content (playback stops here)
  //
  // This separation is fundamental to professional NLE architecture:
  // - Viewport can be larger than content (allows scrubbing, insertion, markers)
  // - Playback stops at sequence end (no black frames after content)
  const contentEnd = duration; // Sequence duration (authored content)
  const viewportEnd = getTimelineViewportEnd(contentEnd); // Viewport extent (editor space, min 10s)
  const contentWidth = Math.round(viewportEnd * pixelsPerSecond);

  const seekFromPointer = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-timeline-interactive="true"]')) return;

      // Clicking any non-clip area in timeline deselects all clips.
      clearSelection();

      // Exit source mode when clicking on timeline
      if (previewMode === "source") {
        exitSourceMode();
        // Also switch transport authority back to program context
        getActiveSessionOrNull()?.transportAuthority?.setActiveContext("program");
      }

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left + container.scrollLeft;
      // Clamp seeking to actual program duration, not viewport padding
      const time = Math.max(0, Math.min(x / pixelsPerSecond, duration));
      seek(time);
    },
    [duration, pixelsPerSecond, seek, previewMode, exitSourceMode, clearSelection],
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollLeft(target.scrollLeft);
  };

  // Ctrl/Cmd + wheel (and trackpad pinch → ctrlKey in Chromium): zoom timeline; anchor time under pointer.
  // Coalesce wheel deltas to one rAF so rapid zoom does not sync-layout + setState per native wheel event.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pendingDy = 0;
    let pendingClientX = 0;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (pendingDy === 0) return;

      const dy = pendingDy * WHEEL_ZOOM_SPEED_MULTIPLIER;
      pendingDy = 0;

      const oldPps = useTimelineStore.getState().pixelsPerSecond;
      const nextPps = Math.max(TIMELINE_MIN_PPS, Math.min(TIMELINE_MAX_PPS, oldPps * Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY)));
      if (Math.abs(nextPps - oldPps) < 0.05) return;

      const rect = container.getBoundingClientRect();
      const localX = pendingClientX - rect.left;
      const scrollLeftDom = container.scrollLeft;

      // ✅ Read duration fresh from state (not captured in closure)
      const currentDuration = getTimelineEndTime();
      const currentViewportEnd = getTimelineViewportEnd(currentDuration);
      let anchorTime = (scrollLeftDom + localX) / oldPps;
      anchorTime = Math.max(0, Math.min(anchorTime, currentViewportEnd));

      useTimelineStore.getState().setPixelsPerSecond(nextPps);

      const nextContentWidth = Math.round(currentViewportEnd * nextPps);
      const maxScrollLeft = Math.max(0, nextContentWidth - container.clientWidth);
      let nextScrollLeft = anchorTime * nextPps - localX;
      nextScrollLeft = Math.max(0, Math.min(nextScrollLeft, maxScrollLeft));

      container.scrollLeft = nextScrollLeft;
      useTimelineStore.getState().setScrollLeft(nextScrollLeft);
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      pendingDy += normalizeWheelDeltaY(e, container.clientHeight);
      pendingClientX = e.clientX;
      if (!rafId) {
        rafId = requestAnimationFrame(flush);
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []); // ✅ Effect runs once, reads fresh state imperatively

  // ✅ Set playback duration based on actual sequence content
  // Professional NLE principle: Sequence duration = authored content length
  //
  // CRITICAL DISTINCTION:
  // - Sequence duration (playback range) = max clip end time
  // - Viewport extent (editor space) = can be larger for UX
  //
  // Playback should STOP at sequence end, not continue on black frames.
  // Empty timeline = 0 duration (playback immediately stops).
  useEffect(() => {
    const sequenceDuration = getTimelineEndTime(); // Actual authored content end
    setDuration(sequenceDuration); // Playback stops here
  }, [clips]);

  // ✅ CRITICAL: Clamp playhead to sequence bounds
  // Professional NLE behavior:
  // - When sequence shrinks (clip deleted), playhead snaps to new end
  // - Playhead never exceeds authored content duration
  // - Empty timeline (duration=0) → playhead at 0
  useEffect(() => {
    if (currentTime > duration) {
      seek(duration);
    }
  }, [duration, currentTime, seek]);

  // Auto-scroll during playback: bulletproof viewport tracking with strict invariants
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Editing actions (trim/delete/split) must not move the viewport.
    // Auto-follow is playback-only.
    if (!isPlaying) return;

    // ✅ 1. Use DOM truth for all measurements
    const viewportWidth = container.clientWidth;
    const contentWidthActual = container.scrollWidth;
    const maxScrollLeft = Math.max(0, contentWidthActual - viewportWidth);

    // ✅ 2. Derive playhead position in pixel space ONLY (single source of truth)
    const playheadX = Math.round(currentTime * pixelsPerSecond);

    // ✅ 3. Get current scroll position
    let newScrollLeft = container.scrollLeft;

    // ✅ 4. CRITICAL: When playhead is at the absolute end, force scroll to max
    // This handles the case where playback stops (isPlaying becomes false) at the end
    const isAtAbsoluteEnd = currentTime >= duration - 0.01; // Within 10ms of end

    if (isAtAbsoluteEnd) {
      // Force scroll to absolute maximum when at the end
      newScrollLeft = maxScrollLeft;
    } else {
      // ✅ 5. Jump logic during playback: when playhead reaches 90% of viewport, jump forward
      const bufferPx = viewportWidth * 0.1;
      const rightEdge = newScrollLeft + viewportWidth;

      if (playheadX >= rightEdge - bufferPx) {
        // Jump viewport so playhead appears at left edge
        newScrollLeft = playheadX;
      }

      // ✅ 6. Enforce visibility invariant during playback: playhead must always be visible
      const currentRightEdge = newScrollLeft + viewportWidth;
      if (playheadX > currentRightEdge) {
        newScrollLeft = Math.min(playheadX, maxScrollLeft);
      }
    }

    // ✅ 7. HARD CLAMP to valid scroll range
    newScrollLeft = Math.max(0, Math.min(newScrollLeft, maxScrollLeft));

    // ✅ 8. Snap to end if within epsilon (eliminate ghost gap)
    const epsilon = 2; // px
    if (maxScrollLeft - newScrollLeft < epsilon) {
      newScrollLeft = maxScrollLeft;
    }

    // ✅ 9. Apply scroll if changed (avoid unnecessary updates)
    if (Math.abs(container.scrollLeft - newScrollLeft) > 0.5) {
      container.scrollLeft = newScrollLeft;
      setScrollLeft(newScrollLeft);
    }
  }, [currentTime, pixelsPerSecond, isPlaying, contentWidth, duration]);

  const getMediaType = (path: string): "video" | "audio" | "image" => {
    const lower = path.toLowerCase();
    if (/\.(mp4|mov|avi|mkv|webm|flv)$/i.test(lower)) return "video";
    if (/\.(mp3|wav|aac|flac|m4a)$/i.test(lower)) return "audio";
    return "image";
  };

  const handleTauriFileDrop = useCallback(
    async (paths: string[]) => {
      const dropTime = resolveClipStartTime({
        intent: "timeline_end",
        timelineEndTime: getTimelineEndTime(),
      });

      for (const filePath of paths) {
        try {
          const filename = filePath.split("/").pop() || filePath.split("\\").pop() || "Unknown";
          const type = getMediaType(filename);

          // Check if asset already exists
          let asset = mediaAssets.find((a) => a.path === filePath);

          if (!asset) {
            // Import new asset
            if (type === "video" || type === "audio") {
              const metadata: VideoMetadata = await invoke("get_video_metadata", { path: filePath });
              const posterFrame: string | undefined = type === "video" ? ((await invoke("extract_poster_frame", { path: filePath, time: 0.0 }).catch(() => undefined)) as string | undefined) : undefined;

              asset = {
                id: generateId("asset"),
                name: filename,
                path: filePath,
                type,
                duration: metadata.duration,
                width: metadata.width,
                height: metadata.height,
                posterFrame,
                size: metadata.size,
              };
            } else {
              asset = {
                id: generateId("asset"),
                name: filename,
                path: filePath,
                type: "image" as const,
                duration: 0,
                size: 0,
                posterFrame: convertFileSrc(filePath),
              };
            }

            addMediaAsset(asset);
          }

          // Add clip to timeline at end
          const targetTrackType = resolveTargetTrackType(asset);
          let targetTrackId = resolvePreferredTrackId({ tracks: useTimelineStore.getState().tracks, asset });

          // If no track exists for this type, create one
          if (!targetTrackId) {
            addTrack(targetTrackType);
            targetTrackId = resolvePreferredTrackId({ tracks: useTimelineStore.getState().tracks, asset });
          }

          if (targetTrackId) {
            if (DEFAULT_PLACEMENT_POLICY.autoAdaptSequenceForFirstVisualClip) {
              autoAdaptSequenceForFirstVisualClip({
                project,
                existingClips: clips,
                asset,
                updateProject,
              });
            }
            const nextProject = useProjectStore.getState().project;

            const newClip = createClipFromAsset({
              asset,
              trackId: targetTrackId,
              startTime: dropTime,
              width: nextProject?.canvasWidth || project?.canvasWidth || 1920,
              height: nextProject?.canvasHeight || project?.canvasHeight || 1080,
            });

            addClip(newClip);
          }
        } catch (error) {
          console.error(`[Timeline] Failed to import ${filePath}:`, error);
          useProjectStore.getState().showToast(`Failed to import ${filePath.split("/").pop() || "file"}`, "error");
        }
      }
    },
    [mediaAssets, addMediaAsset, tracks, clips, project, updateProject, getTimelineEndTime, addClip, addTrack],
  );

  // Listen for drag events and handle file drops
  useEffect(() => {
    let unlistenHover: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;

    const setupListener = async () => {
      try {
        // Listen for drag over
        unlistenHover = await listen<{ position: { x: number; y: number } }>("tauri://drag-over", (event) => {
          if (!containerRef.current) return;

          const rect = containerRef.current.getBoundingClientRect();
          const { x, y } = event.payload.position;

          // Check if mouse is over this container
          const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          setIsDraggingOver(isOver);
        });

        // Listen for drop and process files
        unlistenDrop = await listen<{
          paths: string[];
          position: { x: number; y: number };
        }>("tauri://drag-drop", async (event) => {
          setIsDraggingOver(false);

          if (!containerRef.current || isProcessingDropRef.current) {
            return;
          }

          const rect = containerRef.current.getBoundingClientRect();
          const { x, y } = event.payload.position;

          // Check if dropped over this container
          const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

          if (isOver) {
            isProcessingDropRef.current = true;
            try {
              await handleTauriFileDrop(event.payload.paths);
            } finally {
              isProcessingDropRef.current = false;
            }
          }
        });

        // Listen for drag cancelled
        unlistenCancel = await listen("tauri://drag-cancelled", () => {
          setIsDraggingOver(false);
        });
      } catch (error) {
        console.error("[Timeline] Failed to setup drag listeners:", error);
      }
    };

    setupListener();

    return () => {
      // Clean up listeners safely
      if (unlistenHover) {
        try {
          unlistenHover();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (unlistenDrop) {
        try {
          unlistenDrop();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (unlistenCancel) {
        try {
          unlistenCancel();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [handleTauriFileDrop]);

  return (
    <div className="h-80 flex flex-col select-none bg-[#141920] relative">
      <TimelineToolbar />

      <div className="flex-1 flex overflow-hidden">
        {clips.length > 0 && <TrackList />}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          onPointerDownCapture={handleTimelinePointerDownCapture}
          onClick={seekFromPointer}
          id="timeline-tracks-container"
          className={`flex-1 overflow-x-auto overflow-y-auto scrollbar-thin px-1 relative transition-colors border-l border-[#2b3442] ${isDraggingOver ? "bg-cyan-500/10 ring-2 ring-cyan-500/50 ring-inset" : ""}`}
        >
          {/* Minimal empty state hint - brutally subtle, preserves workspace identity */}
          {clips.length === 0 && <div className="absolute top-1/2 left-3 text-xl text-white pointer-events-none font-mono">Drop media here • I to import</div>}

          <div
            style={{
              width: `${contentWidth}px`,
              minHeight: "100%",
            }}
            className="relative flex flex-col"
          >
            <TimelineRuler pixelsPerSecond={pixelsPerSecond} scrollLeft={scrollLeft} />

            <div className="relative flex-1 flex flex-col min-h-0">
              {clips.length === 0 ? (
                <EmptyTimelineDropZone isDragging={isDraggingMedia} />
              ) : (
                <>
                  {/* New track indicator - above all tracks */}
                  {dragState?.willCreateNewTrack && dragState?.newTrackPosition === "above" && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none z-50"
                      style={{
                        top: 0,
                        height: "2px",
                        background: "#3b82f6",
                        boxShadow: "0 0 8px rgba(59, 130, 246, 0.6)",
                      }}
                    />
                  )}

                  {tracks.map((track) => (
                    <React.Fragment key={track.id}>
                      <Track
                        track={track}
                        pixelsPerSecond={pixelsPerSecond}
                        clips={clips}
                        onClipDragStart={handleClipDragStart}
                        onClipDragMove={handleClipDragMove}
                        onClipDragEnd={handleClipDragEnd}
                        dragState={
                          dragState
                            ? {
                                draggingClipId: dragState.draggingClipId,
                                offsetX: dragState.offsetX,
                                offsetY: dragState.offsetY,
                                isInvalidPosition: dragState.isInvalidPosition,
                                targetTrackId: dragState.targetTrackId,
                                insertionIndex: dragState.insertionIndex,
                                gapStartTime: dragState.gapStartTime,
                                gapDuration: dragState.gapDuration,
                              }
                            : undefined
                        }
                      />
                    </React.Fragment>
                  ))}

                  {/* New track indicator - below all tracks */}
                  {dragState?.willCreateNewTrack && dragState?.newTrackPosition === "below" && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none z-50"
                      style={{
                        bottom: 0,
                        height: "2px",
                        background: "#3b82f6",
                        boxShadow: "0 0 8px rgba(59, 130, 246, 0.6)",
                      }}
                    />
                  )}

                  <Playhead pixelsPerSecond={pixelsPerSecond} duration={duration} containerRef={containerRef} rulerHeight={24} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
