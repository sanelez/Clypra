import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Plus, X, Maximize2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useUIStore } from "../../store/uiStore";
import { useTimelineStore } from "../../store/timelineStore";
import { useProjectStore } from "../../store/projectStore";
import { createClipFromAsset } from "../../lib/timelineClip";

export const SourcePreview: React.FC = () => {
  const { sourceAsset, sourceInPoint, sourceOutPoint, exitSourceMode, markSourceIn, markSourceOut } = useUIStore();
  const { tracks, clips, addClip, addTrack } = useTimelineStore();
  const { project } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Reset when asset changes
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [sourceAsset?.id]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isScrubbing) setCurrentTime(video.currentTime);
    };
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
    };
  }, [isScrubbing]);

  // Scrubber drag handlers
  const seekToPosition = useCallback(
    (clientX: number) => {
      if (!scrubRef.current || duration <= 0) return;
      const rect = scrubRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      if (videoRef.current) videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration],
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const handleMove = (e: MouseEvent) => seekToPosition(e.clientX);
    const handleUp = () => setIsScrubbing(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isScrubbing, seekToPosition]);

  if (!sourceAsset) return null;

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const handleAddToTimeline = () => {
    if (!project) return;
    const targetTrackType = sourceAsset.type === "audio" ? "audio" : "video";
    let targetTrack = tracks.find((track) => track.type === targetTrackType && !track.locked);
    if (!targetTrack) {
      addTrack(targetTrackType);
      targetTrack = useTimelineStore.getState().tracks.find((t) => t.type === targetTrackType && !t.locked);
    }
    if (!targetTrack) return;

    const trackClips = clips.filter((c) => c.trackId === targetTrack.id);
    const startTime = trackClips.length > 0 ? Math.max(...trackClips.map((c) => c.startTime + c.duration)) : 0;
    const newClip = createClipFromAsset({
      asset: sourceAsset,
      trackId: targetTrack.id,
      startTime,
      width: project.canvasWidth,
      height: project.canvasHeight,
    });

    const trimIn = sourceInPoint ?? 0;
    const trimOut = sourceOutPoint ?? newClip.duration;
    newClip.trimIn = trimIn;
    newClip.trimOut = trimOut;
    newClip.duration = trimOut - trimIn;

    addClip(newClip);
    exitSourceMode();
  };

  /** Format time as HH:MM:SS:FF (frame-accurate) */
  const formatTC = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  };

  const sourcePath = convertFileSrc(sourceAsset.path);
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const mediaLabel = sourceAsset.type === "video" ? "video" : sourceAsset.type === "audio" ? "audio" : "image";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 h-10 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text-primary tracking-tight">Previewing</span>
          <span className="text-[13px] text-text-muted">— {mediaLabel}</span>
        </div>
        <button
          onClick={exitSourceMode}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors text-text-muted hover:text-text-primary"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Video Area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-[#06080a] relative">
        <div className="absolute inset-0 checkerboard opacity-[0.15] pointer-events-none" />
        <div className="w-full h-full flex items-center justify-center p-4 md:p-6 relative z-10">
          {sourceAsset.type === "video" ? (
            <video
              ref={videoRef}
              src={sourcePath}
              className="max-w-full max-h-full rounded shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-black"
              playsInline
              preload="auto"
            />
          ) : sourceAsset.type === "image" ? (
            <img src={sourcePath} alt={sourceAsset.name} className="max-w-full max-h-full rounded shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-black object-contain" />
          ) : (
            <div className="w-64 h-48 bg-surface-raised rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 flex items-center justify-center">
              <div className="text-sm font-medium text-text-muted">Audio Preview</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrub Bar (thin, edge-to-edge) ────────────────────────── */}
      <div
        ref={scrubRef}
        className="h-[5px] w-full cursor-pointer group relative shrink-0"
        onMouseDown={(e) => {
          setIsScrubbing(true);
          seekToPosition(e.clientX);
        }}
      >
        {/* Track bg */}
        <div className="absolute inset-0 bg-surface" />
        {/* In/Out range */}
        {sourceInPoint !== null && sourceOutPoint !== null && duration > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-accent/15"
            style={{
              left: `${(sourceInPoint / duration) * 100}%`,
              width: `${((sourceOutPoint - sourceInPoint) / duration) * 100}%`,
            }}
          />
        )}
        {/* Progress fill */}
        <div className="absolute top-0 bottom-0 left-0 bg-accent" style={{ width: `${progressPct}%` }} />
        {/* Playhead dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-accent border-2 border-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progressPct}% - 5px)` }}
        />
      </div>

      {/* ── Bottom Controls ────────────────────────────────────────── */}
      <div className="flex items-center h-10 px-3 shrink-0 gap-3">
        {/* Timecodes */}
        <div className="flex items-baseline gap-1 select-none" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span className="text-[12px] font-medium text-accent">{formatTC(currentTime)}</span>
          <span className="text-[11px] text-text-muted/50">/</span>
          <span className="text-[12px] text-text-muted">{formatTC(duration)}</span>
        </div>

        {/* Centered play button */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition-colors text-text-primary"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-[18px] h-[18px]" /> : <Play className="w-[18px] h-[18px] ml-0.5" />}
          </button>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => markSourceIn(currentTime)}
            className="px-2 h-6 rounded text-[10px] font-medium text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
            title="Mark In (I)"
          >
            IN
          </button>
          <button
            onClick={() => markSourceOut(currentTime)}
            className="px-2 h-6 rounded text-[10px] font-medium text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
            title="Mark Out (O)"
          >
            OUT
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={handleAddToTimeline}
            className="flex items-center gap-1 px-2.5 h-6 rounded bg-accent/90 hover:bg-accent text-white text-[10px] font-semibold transition-colors"
            title="Add to Timeline"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
};
