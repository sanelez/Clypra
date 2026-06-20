import React from "react";
import { GPUPreview } from "./GPUPreview";
import { cn } from "@/lib/utils";

interface VideoSourcePreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string;
  currentTime: number;
  isPlaying: boolean;
  width: number;
  height: number;
  duration: number;
  useGPU: boolean;
  gpuFailed: boolean;
  onTimeUpdate: (time: number) => void;
  className?: string;
}

export const VideoSourcePreview: React.FC<VideoSourcePreviewProps> = ({
  videoRef,
  src,
  currentTime,
  isPlaying,
  width,
  height,
  duration,
  useGPU,
  gpuFailed,
  onTimeUpdate,
  className,
}) => {
  return useGPU && !gpuFailed ? (
    <GPUPreview
      videoPath={src}
      currentTime={currentTime}
      isPlaying={isPlaying}
      width={width}
      height={height}
      duration={duration}
      frameRate={30}
      onTimeUpdate={onTimeUpdate}
      className={cn(
        "max-w-full max-h-full shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-black",
        className
      )}
    />
  ) : (
    <video
      ref={videoRef}
      src={src}
      className={cn(
        "max-w-full max-h-full shadow-[0_0_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-black",
        className
      )}
      playsInline
      preload="auto"
    />
  );
};
