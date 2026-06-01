import React, { useRef, useState, useEffect } from "react";
import { TemplateDefinition } from "@/features/text-templates/types";
import { Download, Star, Loader2, Check } from "lucide-react";
import { LottiePlayer, LottiePlayerHandle } from "@/features/text-templates/LottiePlayer";
import { ClypraApi } from "@/features/text-effects/api/clypraApi";

interface TemplateCardProps {
  template: TemplateDefinition;
  isFavorite: boolean;
  isDownloading: boolean;
  isDownloaded?: boolean;
  loop?: boolean; // NEW: Control whether template should loop
  onFavorite: (e: React.MouseEvent) => void;
  onApply: (e: React.MouseEvent) => void;
  onPreview: () => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  isFavorite,
  isDownloading,
  isDownloaded = false,
  loop = true, // Default to looping
  onFavorite,
  onApply,
  onPreview,
}) => {
  const lottieRef = useRef<LottiePlayerHandle>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [lottieData, setLottieData] = useState<any>(template.lottieData || null);
  const [isLoadingLottie, setIsLoadingLottie] = useState(false);

  // Track if we should play after fetch completes
  const shouldPlayAfterFetchRef = useRef(false);
  // Track the current fetch to allow cancellation
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  // Prefetch lottieData on hover if not already loaded
  useEffect(() => {
    if (isHovered && !lottieData && !isLoadingLottie) {
      // Mark that we want to play after fetch (if still hovering)
      shouldPlayAfterFetchRef.current = true;

      // Create abort controller for this fetch
      const abortController = new AbortController();
      fetchAbortControllerRef.current = abortController;

      setIsLoadingLottie(true);

      ClypraApi.getLottieTemplate(template.category, template.id)
        .then((data) => {
          // Check if fetch was cancelled (user moused out)
          if (abortController.signal.aborted) {
            return;
          }

          setLottieData(data);
          setIsLoadingLottie(false);

          // Only play if user is still hovering AND loop is enabled
          if (shouldPlayAfterFetchRef.current && loop) {
            // Play will be triggered by the next useEffect when lottieData changes
          }
        })
        .catch((err) => {
          if (abortController.signal.aborted) {
            console.log(`Fetch cancelled for template ${template.id}`);
            return;
          }
          console.error(`Failed to load Lottie data for template ${template.id}:`, err);
          setIsLoadingLottie(false);
        });
    }

    // Cleanup: cancel fetch if user mouses out while fetching
    if (!isHovered && isLoadingLottie) {
      shouldPlayAfterFetchRef.current = false;
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort();
        fetchAbortControllerRef.current = null;
      }
    }
  }, [isHovered, lottieData, isLoadingLottie, template.category, template.id, loop]);

  // Control playback based on hover state and loop setting
  useEffect(() => {
    if (lottieRef.current && lottieData) {
      if (loop && isHovered && shouldPlayAfterFetchRef.current) {
        // Play animation when hovering and loop is enabled
        lottieRef.current.play();
      } else if (!loop) {
        // For non-looping templates, show thumbnail frame
        lottieRef.current.goToFrame(template.thumbnailFrame || 0);
      }
    }
  }, [lottieData, isHovered, loop, template.thumbnailFrame]);

  // Handle mouse enter
  const handleMouseEnter = () => {
    setIsHovered(true);
    shouldPlayAfterFetchRef.current = true;
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setIsHovered(false);
    shouldPlayAfterFetchRef.current = false;

    // Pause animation if it's playing
    if (lottieRef.current && lottieData && loop) {
      lottieRef.current.pause();
    }
  };

  // Handle high-performance off-React timeline progress bar update (60fps)
  const handleFrameChange = (currentFrame: number, totalFrames: number) => {
    if (progressBarRef.current) {
      const percentage = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;
      progressBarRef.current.style.width = `${percentage}%`;
    }
  };

  // Initial calculation for static mounting percentage
  const initPercentage = template.durationFrames && template.durationFrames > 0 ? ((template.thumbnailFrame || 0) / template.durationFrames) * 100 : 0;

  console.log("TEMPLATE CARD: ", template);

  return (
    <div onClick={onPreview} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="w-full aspect-video bg-surface-raised/10 hover:bg-surface-raised/20 border border-border/30 hover:border-accent/40 rounded-xl relative overflow-hidden flex flex-col justify-between transition-all duration-500 group cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_4px_30px_rgba(139,92,246,0.15)]">
      {/* Downloading Overlay */}
      {isDownloading && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-30 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full border-3 border-accent border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-accent">Downloading...</span>
          </div>
        </div>
      )}

      {/* Favorite Star Button (hover show or active) */}
      <button onClick={onFavorite} className={`absolute top-2 right-2 p-1.5 cursor-pointer rounded-full bg-black/60 hover:bg-black/80 border border-white/5 text-white/70 hover:text-white transition-all duration-300 z-10 pointer-events-auto ${isFavorite ? "opacity-100 text-yellow-400!" : "opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2"}`}>
        <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-yellow-400 text-yellow-400!" : ""}`} />
      </button>

      {/* Lottie Preview Container - Scales up subtly on hover */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-2 transition-transform duration-700 ease-out group-hover:scale-[1.03]">
        {isLoadingLottie ? (
          <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <span className="text-xs font-medium">Loading...</span>
          </div>
        ) : !loop && template.thumbnail ? (
          // Show static thumbnail for non-looping templates
          <img
            src={template.thumbnail}
            alt={template.name}
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]"
            onError={(e) => {
              // Fallback to placeholder if thumbnail fails to load
              e.currentTarget.style.display = "none";
            }}
          />
        ) : lottieData ? (
          <LottiePlayer
            ref={lottieRef}
            lottieData={lottieData}
            autoplay={false} // Manual control via ref
            loop={loop}
            initialFrame={template.thumbnailFrame || 0}
            onFrameChange={handleFrameChange}
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
            <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
              <span className="text-2xl">📝</span>
            </div>
            <span className="text-xs font-medium">{template.name}</span>
          </div>
        )}
      </div>

      {/* Footer Info / Apply Download Button */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-linear-to-t from-black/90 via-black/40 to-transparent flex items-end justify-between z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <span className="text-[10px] text-white font-semibold tracking-wide truncate drop-shadow-md pr-4">{template.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply(e);
          }}
          disabled={isDownloading}
          className={`w-6 h-6 rounded-full flex items-center justify-center text-white transition-all duration-300 relative shadow-lg pointer-events-auto group/btn ${isDownloaded ? "bg-green-500/30 border border-green-500 text-green-500 cursor-default" : isDownloading ? "bg-accent/30 border border-accent cursor-wait" : "bg-accent hover:bg-accent/80 border border-white/10 cursor-pointer"}`}
        >
          {isDownloading ? <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : isDownloaded ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3 h-3 group-hover/btn:scale-110 transition-transform" />}
        </button>
      </div>

      {/* Sleek, Off-React Timeline Playback Progress Bar */}
      {loop && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5 overflow-hidden z-20 pointer-events-none">
          <div ref={progressBarRef} style={{ width: `${initPercentage}%` }} className="h-full bg-linear-to-r from-accent to-accent-soft rounded-r-full transition-[width] duration-75 ease-out shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
        </div>
      )}
    </div>
  );
};
