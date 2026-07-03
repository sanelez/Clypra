import React, { useState, useEffect, useRef, useMemo } from "react";
import { Play, Pause, Download, Edit3, X, Sparkles, Wand2 } from "lucide-react";
import { useRecordingStore } from "@/store/recordingStore";
import { useSettingsStore } from "@/store/settingsStore";
import { AspectRatio } from "@/types";

interface ScreenRecordingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreate: (name: string, aspectRatio: AspectRatio, frameRate: 24 | 30 | 60, initialClipPaths?: string[]) => void;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const ScreenRecordingPreviewModal: React.FC<ScreenRecordingPreviewModalProps> = ({
  isOpen,
  onClose,
  onProjectCreate,
}) => {
  const { previewRecording, setPreviewRecording } = useRecordingStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Trim range (percentage: 0 to 100)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [isDragging, setIsDragging] = useState<"start" | "end" | "playhead" | null>(null);

  const filePaths = previewRecording?.filePaths || [];

  // Get screen recording or default to first file
  const videoPath = useMemo(() => {
    const screen = filePaths.find((p) => p.includes("screen"));
    return screen || filePaths[0] || "";
  }, [filePaths]);

  // Convert native path to asset URL for webview playback
  const [videoSrc, setVideoSrc] = useState("");
  useEffect(() => {
    if (!videoPath) return;

    if (isTauri) {
      import("@tauri-apps/api/core")
        .then(({ convertFileSrc }) => {
          setVideoSrc(convertFileSrc(videoPath));
        })
        .catch((err) => {
          console.error("Failed to convert file src:", err);
          setVideoSrc(videoPath);
        });
    } else {
      setVideoSrc(videoPath);
    }
  }, [videoPath]);

  // Keep video time within trim bounds when playing
  useEffect(() => {
    if (!videoRef.current || duration === 0) return;

    const minTime = (trimStart / 100) * duration;
    const maxTime = (trimEnd / 100) * duration;

    if (currentTime < minTime) {
      videoRef.current.currentTime = minTime;
    } else if (currentTime > maxTime) {
      if (isPlaying) {
        videoRef.current.currentTime = minTime; // Loop back
      } else {
        videoRef.current.currentTime = maxTime;
      }
    }
  }, [currentTime, duration, trimStart, trimEnd, isPlaying]);

  if (!isOpen || filePaths.length === 0) return null;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Drag handlers for custom trimmer and timeline scrubber
  const handleTimelineMouseDown = (e: React.MouseEvent, type: "start" | "end" | "playhead") => {
    e.preventDefault();
    setIsDragging(type);
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current || duration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const percent = relativeX * 100;

    if (isDragging === "start") {
      setTrimStart(Math.min(percent, trimEnd - 5));
    } else if (isDragging === "end") {
      setTrimEnd(Math.max(percent, trimStart + 5));
    } else if (isDragging === "playhead") {
      if (videoRef.current) {
        videoRef.current.currentTime = relativeX * duration;
      }
    }
  };

  const handleGlobalMouseUp = () => {
    setIsDragging(null);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, trimStart, trimEnd, duration]);

  const handleDownload = async () => {
    if (isDownloading || !videoPath) return;

    try {
      if (isTauri) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { copyFile } = await import("@tauri-apps/plugin-fs");

        const ext = videoPath.split(".").pop() || "webm";
        const selectedPath = await save({
          defaultPath: `clypra_recording.${ext}`,
          filters: [{ name: "Video", extensions: [ext] }],
        });

        if (selectedPath) {
          setIsDownloading(true);
          await copyFile(videoPath, selectedPath);
          setIsDownloading(false);
        }
      } else {
        // Browser fallback
        const a = document.createElement("a");
        a.href = videoSrc;
        a.download = "clypra_recording.webm";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("[PreviewModal] Download failed:", err);
      setIsDownloading(false);
    }
  };

  const handleEditMore = () => {
    const { defaultFrameRate } = useSettingsStore.getState();
    // Trim values can be loaded inside timeline later.
    // For now, auto-create project and navigate.
    onProjectCreate("Screen Recording Project", "16:9", defaultFrameRate, filePaths);
    setPreviewRecording(null);
  };

  const formatTimecode = (seconds: number, fps = 30) => {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    const frames = Math.floor((seconds % 1) * fps).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}:${frames}`;
  };

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[600px] rounded-2xl bg-[#14141e]/95 border border-white/8 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#1a1a26]/50">
          <button
            onClick={onClose}
            className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-[8px] text-red-950 font-bold"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">Screen recording</span>
          <div className="w-4" /> {/* Spacer */}
        </div>

        {/* Video Preview */}
        <div className="relative aspect-video bg-[#0a0a0f] border-b border-white/5 flex items-center justify-center overflow-hidden">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={togglePlay}
              className="max-w-full max-h-full object-contain cursor-pointer"
            />
          ) : (
            <div className="text-slate-500 text-xs">Loading preview...</div>
          )}
        </div>

        {/* Timeline & Controls */}
        <div className="p-5 flex flex-col gap-4 bg-[#14141e]">
          {/* Trimmer Timeline Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="relative h-6 bg-white/4 rounded-md border border-white/5 overflow-hidden" ref={containerRef}>
              {/* Visual Trim Region overlay */}
              <div
                className="absolute top-0 bottom-0 bg-accent/15 border-y-2 border-accent"
                style={{
                  left: `${trimStart}%`,
                  right: `${100 - trimEnd}%`,
                }}
              />

              {/* Range slider tracks (inactive areas) */}
              <div className="absolute top-0 bottom-0 left-0 bg-black/40" style={{ width: `${trimStart}%` }} />
              <div className="absolute top-0 bottom-0 right-0 bg-black/40" style={{ width: `${100 - trimEnd}%` }} />

              {/* Start Handle */}
              <div
                onMouseDown={(e) => handleTimelineMouseDown(e, "start")}
                className="absolute top-0 bottom-0 w-3 bg-accent rounded-l-md cursor-ew-resize flex items-center justify-center border-r border-white/20 select-none"
                style={{ left: `${trimStart}%`, transform: "translateX(-50%)", zIndex: 10 }}
              >
                <div className="w-0.5 h-3 bg-white/60" />
              </div>

              {/* End Handle */}
              <div
                onMouseDown={(e) => handleTimelineMouseDown(e, "end")}
                className="absolute top-0 bottom-0 w-3 bg-accent rounded-r-md cursor-ew-resize flex items-center justify-center border-l border-white/20 select-none"
                style={{ left: `${trimEnd}%`, transform: "translateX(-50%)", zIndex: 10 }}
              >
                <div className="w-0.5 h-3 bg-white/60" />
              </div>

              {/* Playhead Scrubber */}
              <div
                onMouseDown={(e) => handleTimelineMouseDown(e, "playhead")}
                className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize select-none"
                style={{ left: `${playheadPercent}%`, zIndex: 20 }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-md" />
              </div>
            </div>
          </div>

          {/* Player controls */}
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <button
              onClick={togglePlay}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
            <div className="flex items-center gap-1.5 select-none">
              <span className="text-white">{formatTimecode(currentTime)}</span>
              <span>/</span>
              <span>{formatTimecode((trimEnd - trimStart) / 100 * duration || duration)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-white font-semibold text-sm transition-all border border-white/5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? "Downloading..." : "Download"}
            </button>
            <button
              onClick={handleEditMore}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00b4c8] hover:bg-[#00cdd8] active:bg-[#00a0b0] text-slate-950 font-bold text-sm transition-all shadow-lg shadow-cyan-500/10 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              Edit more
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/5 my-1" />

          {/* Recommended tools */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-400">✨ Recommended tools for your recording</span>
            <div className="grid grid-cols-2 gap-3">
              {/* Text to Speech */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/4 cursor-pointer hover:bg-white/8 hover:border-white/8 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex flex-col select-none">
                  <span className="text-xs font-bold text-slate-200">Text to speech</span>
                  <span className="text-[10px] text-slate-500 leading-tight">Convert text into human-like speech.</span>
                </div>
              </div>

              {/* Retouch */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/4 cursor-pointer hover:bg-white/8 hover:border-white/8 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400 group-hover:scale-105 transition-transform">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col select-none">
                  <span className="text-xs font-bold text-slate-200">Retouch</span>
                  <span className="text-[10px] text-slate-500 leading-tight">Retouch face and body in one click.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
