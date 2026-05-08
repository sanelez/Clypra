import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Expand, Pause, Play, Shrink, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "../ui/Button";
import { usePlayback } from "../../hooks/usePlayback";
import { useProjectStore } from "../../store/projectStore";
import { useTimelineStore } from "../../store/timelineStore";
import { useUIStore } from "../../store/uiStore";
import { resolvePreviewScene } from "../../lib/previewScene";
import { SourcePreview } from "./SourcePreview";
import { cn } from "../../lib/utils";

/** Program preview “viewer” aspect (width / height). */
type PreviewAspectPreset =
  | "original"
  | "custom"
  | "16:9"
  | "4:3"
  | "2.35:1"
  | "2:1"
  | "1.85:1"
  | "9:16"
  | "3:4"
  | "5.8-inch"
  | "1:1";

const PREVIEW_ASPECT_LABEL: Record<PreviewAspectPreset, string> = {
  original: "Original",
  custom: "Custom",
  "16:9": "16:9",
  "4:3": "4:3",
  "2.35:1": "2.35:1",
  "2:1": "2:1",
  "1.85:1": "1.85:1",
  "9:16": "9:16",
  "3:4": "3:4",
  "5.8-inch": "5.8-inch",
  "1:1": "1:1",
};

const PREVIEW_ASPECT_RATIO: Partial<Record<PreviewAspectPreset, number>> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "2.35:1": 2.35,
  "2:1": 2,
  "1.85:1": 1.85,
  "9:16": 9 / 16,
  "3:4": 3 / 4,
  "5.8-inch": 1170 / 2532,
  "1:1": 1,
};

function previewAspectWidthOverHeight(preset: PreviewAspectPreset, canvasWidth: number, canvasHeight: number): number {
  const ch = Math.max(1, canvasHeight);
  if (preset === "original" || preset === "custom") {
    return canvasWidth / ch;
  }
  return PREVIEW_ASPECT_RATIO[preset] ?? canvasWidth / ch;
}

function resolveOriginalPreviewAspect(
  layers: Array<{ mediaId: string }>,
  mediaAssets: Array<{ id: string; width?: number; height?: number }>,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const projectRatio = canvasWidth / Math.max(1, canvasHeight);
  if (layers.length !== 1) return projectRatio;
  const onlyLayer = layers[0];
  const asset = mediaAssets.find((a) => a.id === onlyLayer.mediaId);
  if (!asset?.width || !asset?.height || asset.width <= 0 || asset.height <= 0) return projectRatio;
  return asset.width / asset.height;
}

/** Largest rectangle with aspect W/H = R inside the panel. */
function previewViewportSize(panelWidth: number, panelHeight: number, widthOverHeight: number): { vw: number; vh: number } {
  const R = widthOverHeight;
  let vw = Math.min(panelWidth, panelHeight * R);
  let vh = vw / R;
  if (vh > panelHeight + 0.5) {
    vh = panelHeight;
    vw = vh * R;
  }
  return { vw: Math.max(1, vw), vh: Math.max(1, vh) };
}

function PreviewAspectShapeIcon({ widthOverHeight }: { widthOverHeight: number }) {
  const max = 22;
  const min = 8;
  let w: number;
  let h: number;
  if (widthOverHeight >= 1) {
    h = 12;
    w = Math.round(Math.min(max, Math.max(min, h * widthOverHeight)));
  } else {
    w = 12;
    h = Math.round(Math.min(max, Math.max(min, w / widthOverHeight)));
  }
  return <span className="inline-flex shrink-0 rounded-sm border border-border-soft bg-bg" style={{ width: w, height: h }} aria-hidden />;
}

function AspectMenuRow({
  preset,
  selected,
  onSelect,
  icon,
  disabled,
}: {
  preset: PreviewAspectPreset;
  selected: PreviewAspectPreset;
  onSelect: (p: PreviewAspectPreset) => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const isSel = selected === preset;
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSel}
      disabled={disabled}
      title={preset === "custom" ? "Custom size (coming soon)" : PREVIEW_ASPECT_LABEL[preset]}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-raised",
        isSel && "bg-surface-raised",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
      onClick={() => {
        if (!disabled) onSelect(preset);
      }}
    >
      <span className="flex w-5 shrink-0 justify-center">{isSel ? <Check className="h-3.5 w-3.5 text-accent" /> : null}</span>
      <span className="min-w-0 flex-1 truncate">{PREVIEW_ASPECT_LABEL[preset]}</span>
      <span className="flex shrink-0 items-center justify-end text-text-muted">{icon}</span>
    </button>
  );
}

export const PreviewPanel: React.FC = () => {
  const { previewMode } = useUIStore();

  // If in source mode, show SourcePreview
  if (previewMode === "source") {
    return <SourcePreview />;
  }

  // Otherwise show program (timeline) preview
  return <ProgramPreview />;
};

const ProgramPreview: React.FC = () => {
  const { isPlaying, currentTime, duration, frameRate, play, pause, seek, formatTime } = usePlayback();
  const { project, mediaAssets } = useProjectStore();
  const { tracks, clips } = useTimelineStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  /** Bumps after program <video> metadata loads so we re-seek once duration is valid. */
  const [previewVideoReadyTick, setPreviewVideoReadyTick] = useState(0);
  /** fit = letterbox full canvas; fill = zoom canvas to cover panel (crop edges). */
  const [previewScaleMode, setPreviewScaleMode] = useState<"fit" | "fill">("fit");
  const [previewAspectPreset, setPreviewAspectPreset] = useState<PreviewAspectPreset>("original");
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const aspectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aspectMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (aspectMenuRef.current && !aspectMenuRef.current.contains(e.target as Node)) {
        setAspectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [aspectMenuOpen]);

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };

    const resizeObserver = new ResizeObserver(() => updateDimensions());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      setTimeout(updateDimensions, 0);
    }

    return () => resizeObserver.disconnect();
  }, [project]);

  const scene = useMemo(
    () =>
      resolvePreviewScene({
        tracks,
        clips,
        assets: mediaAssets,
        time: currentTime,
        project: project ?? null,
      }),
    [tracks, clips, mediaAssets, currentTime, project],
  );

  useEffect(() => {
    Object.values(videoRefs.current).forEach((video) => {
      if (!video) return;
      const layer = scene.layers.find((l) => l.mediaId === video.dataset.mediaId && l.clipId === video.dataset.clipId);
      if (!layer) return;

      video.muted = isMuted || volume === 0;
      video.volume = Math.max(0, Math.min(1, volume / 100));

      if (Number.isFinite(video.duration) && video.duration > 0) {
        const t = Math.max(0, Math.min(layer.sourceTime, Math.max(0, video.duration - 0.01)));
        if (Math.abs(video.currentTime - t) > 0.05) {
          video.currentTime = t;
        }
      }

      if (isPlaying) {
        try {
          const p = video.play();
          if (p && typeof p.catch === "function") void p.catch(() => undefined);
        } catch {
          // noop in test/jsdom environments
        }
      } else {
        try {
          video.pause();
        } catch {
          // noop
        }
      }
    });
  }, [scene, isPlaying, isMuted, volume, previewVideoReadyTick]);

  if (!project) return null;

  if (dimensions.width === 0 || dimensions.height === 0) {
    return (
      <div className="flex-1 bg-bg flex flex-col min-h-0 rounded-tl-xl border-l border-t border-white/[0.03]">
        <div className="flex-1 flex items-center justify-center p-4 md:p-6 overflow-hidden relative bg-[#06080a]">
          <div ref={containerRef} className="w-full h-full flex items-center justify-center">
            <div className="text-text-muted">Loading preview...</div>
          </div>
        </div>
      </div>
    );
  }

  const canvasWidth = project.canvasWidth;
  const canvasHeight = project.canvasHeight;
  const originalAspectR = resolveOriginalPreviewAspect(scene.layers, mediaAssets, canvasWidth, canvasHeight);
  const aspectR = previewAspectPreset === "original" ? originalAspectR : previewAspectWidthOverHeight(previewAspectPreset, canvasWidth, canvasHeight);
  const { vw, vh } = previewViewportSize(dimensions.width, dimensions.height, aspectR);
  const scaleFit = Math.min(vw / canvasWidth, vh / canvasHeight);
  const scaleFill = Math.max(vw / canvasWidth, vh / canvasHeight);
  const scale = previewScaleMode === "fit" ? scaleFit : scaleFill;
  const displayWidth = canvasWidth * scale;
  const displayHeight = canvasHeight * scale;

  const landscapePresets: PreviewAspectPreset[] = ["16:9", "4:3", "2.35:1", "2:1", "1.85:1"];
  const portraitPresets: PreviewAspectPreset[] = ["9:16", "3:4", "5.8-inch"];

  const selectAspectPreset = (p: PreviewAspectPreset) => {
    if (p === "custom") return;
    setPreviewAspectPreset(p);
    setAspectMenuOpen(false);
  };

  const step = 1 / Math.max(1, frameRate);

  return (
    <div className="flex-1 bg-bg flex flex-col min-h-0 rounded-tl-xl border-l border-t border-white/[0.03]">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center px-4 h-10 shrink-0 gap-2">
        <span className="text-[13px] font-semibold text-text-primary tracking-tight">Program Preview</span>
        <span className="text-[13px] text-text-muted">— Timeline</span>
      </div>

      {/* ── Video Area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-[#06080a] relative">
        <div className="absolute inset-0 checkerboard opacity-[0.15] pointer-events-none" />
        <div ref={containerRef} className="w-full h-full flex items-center justify-center p-4 md:p-6 relative z-10 overflow-hidden">
          <div 
            data-testid="program-preview-viewport" 
            className="relative flex shrink-0 items-center justify-center overflow-hidden rounded shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10" 
            style={{ width: vw, height: vh }}
          >
            <div data-testid="program-preview-canvas" className="relative shrink-0 bg-black" style={{ width: displayWidth, height: displayHeight }}>
            {scene.layers.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-text-muted">Preview</div>
            ) : (
              scene.layers.map((layer) => (
                <div
                  key={`${layer.clipId}-${layer.mediaId}`}
                  data-testid="preview-layer"
                  className="absolute overflow-hidden"
                  style={{
                    left: layer.x * scale,
                    top: layer.y * scale,
                    width: layer.width * scale,
                    height: layer.height * scale,
                    opacity: Math.max(0, Math.min(1, layer.opacity > 1 ? layer.opacity / 100 : layer.opacity)),
                    transform: `rotate(${layer.rotation}deg)`,
                    transformOrigin: "center center",
                    zIndex: layer.zIndex + 1,
                  }}
                >
                  {layer.mediaType === "video" ? (
                    <video
                      data-media-id={layer.mediaId}
                      data-clip-id={layer.clipId}
                      ref={(el) => {
                        videoRefs.current[`${layer.clipId}-${layer.mediaId}`] = el;
                      }}
                      src={layer.sourcePath}
                      muted={isMuted || volume === 0}
                      playsInline
                      preload="auto"
                      onLoadedMetadata={() => setPreviewVideoReadyTick((n) => n + 1)}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img src={layer.posterFrame || layer.sourcePath} alt={layer.mediaId} className="w-full h-full object-contain" />
                  )}
                </div>
              ))
            )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrub Bar (thin, edge-to-edge) ────────────────────────── */}
      <div
        className="h-[5px] w-full cursor-pointer group relative shrink-0"
        onMouseDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const doSeek = (clientX: number) => {
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            seek(ratio * duration);
          };
          doSeek(e.clientX);
          const handleMove = (moveEvent: MouseEvent) => doSeek(moveEvent.clientX);
          const handleUp = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
          };
          window.addEventListener("mousemove", handleMove);
          window.addEventListener("mouseup", handleUp);
        }}
      >
        <div className="absolute inset-0 bg-surface" />
        <div className="absolute top-0 bottom-0 left-0 bg-accent" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-accent border-2 border-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 5px)` }}
        />
      </div>

      {/* ── Bottom Controls ────────────────────────────────────────── */}
      <div className="flex items-center h-10 px-3 shrink-0 relative">
        {/* Timecodes */}
        <div className="flex items-baseline gap-1 select-none w-[120px]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span className="text-[12px] font-medium text-accent">{formatTime(currentTime)}</span>
          <span className="text-[11px] text-text-muted/50">/</span>
          <span className="text-[12px] text-text-muted">{formatTime(duration)}</span>
        </div>

        {/* Center play controls */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <button
            onClick={() => seek(Math.max(0, currentTime - step))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors text-text-muted hover:text-text-primary"
            title="Previous frame"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => (isPlaying ? pause() : play())}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition-colors text-text-primary mx-1"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-[18px] h-[18px]" /> : <Play className="w-[18px] h-[18px] ml-0.5" />}
          </button>
          <button
            onClick={() => seek(Math.min(duration, currentTime + step))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors text-text-muted hover:text-text-primary"
            title="Next frame"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Aspect menu */}
          <div className="relative shrink-0" ref={aspectMenuRef}>
            <button
              onClick={() => setAspectMenuOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
              title="Preview aspect ratio"
              aria-expanded={aspectMenuOpen}
            >
              <span className="max-w-[4.5rem] truncate">{PREVIEW_ASPECT_LABEL[previewAspectPreset]}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            </button>
            {aspectMenuOpen && (
              <div
                className="absolute bottom-full right-0 z-50 mb-1 w-[220px] overflow-hidden rounded-lg border border-border bg-surface py-1 text-text-primary shadow-xl"
                role="listbox"
              >
                <div className="px-1">
                  <AspectMenuRow
                    preset="original"
                    selected={previewAspectPreset}
                    onSelect={selectAspectPreset}
                    icon={<PreviewAspectShapeIcon widthOverHeight={canvasWidth / Math.max(1, canvasHeight)} />}
                  />
                  <AspectMenuRow preset="custom" selected={previewAspectPreset} onSelect={selectAspectPreset} disabled icon={<span className="w-[22px]" />} />
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Landscape</div>
                <div className="px-1">
                  {landscapePresets.map((p) => (
                    <AspectMenuRow
                      key={p}
                      preset={p}
                      selected={previewAspectPreset}
                      onSelect={selectAspectPreset}
                      icon={<PreviewAspectShapeIcon widthOverHeight={PREVIEW_ASPECT_RATIO[p]!} />}
                    />
                  ))}
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Portrait</div>
                <div className="px-1">
                  {portraitPresets.map((p) => (
                    <AspectMenuRow
                      key={p}
                      preset={p}
                      selected={previewAspectPreset}
                      onSelect={selectAspectPreset}
                      icon={<PreviewAspectShapeIcon widthOverHeight={PREVIEW_ASPECT_RATIO[p]!} />}
                    />
                  ))}
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="px-1">
                  <AspectMenuRow
                    preset="1:1"
                    selected={previewAspectPreset}
                    onSelect={selectAspectPreset}
                    icon={<PreviewAspectShapeIcon widthOverHeight={1} />}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setPreviewScaleMode((m) => (m === "fit" ? "fill" : "fit"))}
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
            title={previewScaleMode === "fit" ? "Fill preview — scale to cover (crop edges)" : "Fit preview — show entire frame (letterbox)"}
          >
            {previewScaleMode === "fit" ? <Expand className="w-3.5 h-3.5" /> : <Shrink className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            onClick={() => setIsMuted((m) => !m)}
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-16 h-1 bg-surface-raised rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
