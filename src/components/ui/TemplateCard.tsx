import React, { useRef, useState, useEffect } from "react";
import { TemplateDefinition } from "@/features/text-templates/types";
import { Star, Loader2, Check, Plus } from "lucide-react";
import { TemplatePreviewPlayer, type TemplatePreviewPlayerHandle } from "@/features/text-templates";
import { TextEffectsApi } from "@/features/text-effects/api/textEffectsApi";

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
  const lottieRef = useRef<TemplatePreviewPlayerHandle>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [lottieData, setLottieData] = useState<any>(template.lottieData || null);
  const [isLoadingLottie, setIsLoadingLottie] = useState(false);

  // Track if we should play after fetch completes
  const shouldPlayAfterFetchRef = useRef(false);
  // Track the current fetch to allow cancellation
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  const resolvedThumbnailUrl = template.thumbnailUrl || template.thumbnail || `https://raw.githubusercontent.com/AIEraDev/clypra-api/main/data/thumbnails/${template.id}.png`;

  // Prefetch lottieData on hover if not already loaded
  useEffect(() => {
    if (isHovered && !lottieData && !isLoadingLottie) {
      // Mark that we want to play after fetch (if still hovering)
      shouldPlayAfterFetchRef.current = true;

      // Create abort controller for this fetch
      const abortController = new AbortController();
      fetchAbortControllerRef.current = abortController;

      setIsLoadingLottie(true);

      TextEffectsApi.getLottieTemplate(template.category, template.id)
        .then((data: any) => {
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
        .catch((err: unknown) => {
          if (abortController.signal.aborted) {
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
        // Play animation starting from the beginning (frame 0)
        lottieRef.current.goToFrame(0);
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

    // Reset to start and play if Lottie player is already loaded
    if (lottieRef.current && lottieData && loop) {
      lottieRef.current.goToFrame(0);
      lottieRef.current.play();
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setIsHovered(false);
    shouldPlayAfterFetchRef.current = false;

    // Reset back to static thumbnail frame instead of pausing on active frame
    if (lottieRef.current && lottieData) {
      lottieRef.current.pause();
      lottieRef.current.goToFrame(template.thumbnailFrame || 0);
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
  // const initPercentage = template.durationFrames && template.durationFrames > 0 ? ((template.thumbnailFrame || 0) / template.durationFrames) * 100 : 0;

  return (
    <div onClick={onPreview} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="w-full aspect-video bg-surface-raised/10 hover:bg-surface-raised/20 border border-border/30 hover:border-accent/40 rounded-md relative overflow-hidden flex flex-col justify-between transition-all duration-500 group">
      {/* Downloading Overlay */}
      {isDownloading && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-30 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full border-3 border-accent border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-accent">Downloading...</span>
          </div>
        </div>
      )}

      {/* Lottie Preview Container - Scales up subtly on hover */}
      <div className="absolute inset-0 flex items-center justify-center cursor-pointer p-2 transition-transform duration-700 ease-out group-hover:scale-[1.03]">
        {isLoadingLottie ? (
          <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <span className="text-xs font-medium">Loading...</span>
          </div>
        ) : lottieData ? (
          <TemplatePreviewPlayer
            ref={lottieRef}
            lottieData={lottieData}
            autoplay={false} // Manual control via ref
            loop={loop}
            initialFrame={template.thumbnailFrame || 0}
            onFrameChange={handleFrameChange}
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_#00000080]"
          />
        ) : resolvedThumbnailUrl ? (
          <img
            src={resolvedThumbnailUrl}
            alt={template.name}
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_#00000080]"
            onError={(e) => {
              // Fallback to placeholder if thumbnail fails to load
              e.currentTarget.style.display = "none";
            }}
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
      <div className="absolute bottom-0 left-0 right-0 p-1 cursor-default flex items-end justify-between z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        {/* Favorite Star Button (hover show or active) */}
        <button onClick={onFavorite} className={`w-4 h-4 bg-surface/70 cursor-pointer flex justify-center items-center rounded-full hover:bg-surface/80 border border-border/50 text-text-muted hover:text-text-primary transition-all duration-300 z-10 pointer-events-auto ${isFavorite ? "opacity-100 text-yellow-400!" : "opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2"}`}>
          <Star className={`w-2.5 h-2.5 ${isFavorite ? "fill-yellow-400 text-yellow-400!" : ""}`} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply(e);
          }}
          disabled={isDownloading}
          className={`w-4 h-4 bg-surface/70 cursor-pointer flex justify-center items-center rounded-full text-text-primary transition-all duration-300 relative pointer-events-auto group/btn ${isDownloaded ? "bg-accent/20 border border-accent text-accent cursor-default" : isDownloading ? "bg-accent/30 border border-accent cursor-wait" : "bg-accent hover:bg-accent/80 border border-border/50 cursor-pointer"}`}
        >
          {isDownloading ? <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : isDownloaded ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5 group-hover/btn:scale-110 transition-transform" />}
        </button>
      </div>
    </div>
  );
};
