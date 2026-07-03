import React, { useEffect, useRef } from "react";
import { StopCircle } from "lucide-react";
import { useRecordingStore } from "@/store/recordingStore";
import { DualRecordService } from "@/services/dualRecordService";
import { useSettingsStore } from "@/store/settingsStore";
import { AspectRatio } from "@/types";

interface FloatingWidgetProps {
  onProjectCreate: (name: string, aspectRatio: AspectRatio, frameRate: 24 | 30 | 60, initialClipPaths?: string[]) => void;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const FloatingWidget: React.FC<FloatingWidgetProps> = ({ onProjectCreate }) => {
  const { seconds, setSeconds, hasWebcam, setPreviewRecording, setIsRecording } = useRecordingStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [setSeconds]);

  // Stream binding effect
  useEffect(() => {
    let active = true;
    let clonedStream: MediaStream | null = null;

    const attachStream = () => {
      if (!active) return;
      const stream = DualRecordService.getInstance().getWebcamStream();
      if (videoRef.current && stream) {
        if (clonedStream) {
          clonedStream.getTracks().forEach((t) => t.stop());
        }

        // WebKit workaround: Clone the stream to force re-binding the video tracks
        // to this new element in the Safari/Tauri webview sandbox.
        clonedStream = stream.clone();
        videoRef.current.srcObject = clonedStream;
        videoRef.current.play().catch((err) => {
          console.error("[FloatingWidget] Failed to play video stream:", err);
        });
      } else {
        setTimeout(attachStream, 100);
      }
    };
    attachStream();

    return () => {
      active = false;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (clonedStream) {
        clonedStream.getTracks().forEach((t) => t.stop());
        clonedStream = null;
      }
    };
  }, [hasWebcam]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleStop = async () => {
    try {
      const { filePaths } = await DualRecordService.getInstance().stopRecording();

      if (isTauri) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          const win = getCurrentWindow();
          await win.setMinSize(new LogicalSize(1100, 720));
          await win.setSize(new LogicalSize(1100, 720));
          await win.setAlwaysOnTop(false);
        } catch (winErr) {
          console.error("[FloatingWidget] Failed to restore window size:", winErr);
        }
      }

      setPreviewRecording({ filePaths });
      setIsRecording(false);
    } catch (err: any) {
      console.error("[FloatingWidget] Stop recording failed:", err);
    }
  };


  return (
    <div
      className="w-full h-full select-none flex flex-col items-center justify-between text-slate-100 p-4 relative"
      style={{
        background: "linear-gradient(160deg, #12121c 0%, #0c0c14 100%)",
      }}
      data-tauri-drag-region
    >
      {/* Top Drag Indicator Area */}
      <div
        data-tauri-drag-region
        className="w-full h-4 flex items-center justify-center cursor-move text-slate-600 hover:text-slate-400 active:text-slate-300 transition-colors"
      >
        <div data-tauri-drag-region className="w-12 h-1 bg-white/20 rounded-full" />
      </div>

      {/* Circular Facecam Bubble */}
      {hasWebcam ? (
        <div className="relative w-48 h-48 rounded-full overflow-hidden border-2 border-accent/40 shadow-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            REC {formatTime(seconds)}
          </div>
        </div>
      ) : (
        <div className="relative w-48 h-48 rounded-full flex flex-col items-center justify-center border-2 border-dashed border-white/20 bg-white/5">
          <span className="text-3xl">🖥️</span>
          <span className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wide">Recording Screen</span>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            REC {formatTime(seconds)}
          </div>
        </div>
      )}

      {/* Control toolbar */}
      <div className="w-full bg-[#181826]/90 border border-white/10 rounded-2xl p-3 flex items-center justify-between shadow-xl mb-1">
        <div className="flex flex-col ml-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Duration</span>
          <span className="text-xs font-bold text-white font-mono">{formatTime(seconds)}</span>
        </div>

        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-900/30"
        >
          <StopCircle className="w-4 h-4" />
          Stop Capture
        </button>
      </div>
    </div>
  );
};
