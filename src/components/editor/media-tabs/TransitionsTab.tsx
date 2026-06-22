/**
 * Transitions Tab Component
 * Displays available transitions that can be applied between clips on timeline
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Wand2, Plus, AlertCircle } from "lucide-react";
import type { TabProps } from "./types";
import { useProjectStore } from "@/store/projectStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { TransitionsApi } from "@/features/transitions/api/transitionsApi";
import type { TransitionAsset } from "@/features/transitions/types";

// Hardcoded transition categories for instant UI rendering
const TRANSITION_CATEGORIES = [
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "wipe", label: "Wipe" },
  { id: "zoom", label: "Zoom" },
  { id: "dissolve", label: "Dissolve" },
  { id: "creative", label: "Creative" },
] as const;

type TransitionCategory = (typeof TRANSITION_CATEGORIES)[number]["id"];

export const TransitionsTab: React.FC<TabProps> = ({ onAddToTimeline }) => {
  const [activeCategory, setActiveCategory] = useState<TransitionCategory>("fade");
  const [transitions, setTransitions] = useState<TransitionAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch transitions when category changes
  useEffect(() => {
    const fetchTransitions = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await TransitionsApi.getByCategory(activeCategory);
        setTransitions(data);
      } catch (err) {
        console.error(`[TransitionsTab] Failed to load category ${activeCategory}:`, err);
        setError(err instanceof Error ? err.message : "Failed to load transitions");
      } finally {
        setLoading(false);
      }
    };

    fetchTransitions();
  }, [activeCategory]);

  // Filter transitions based on category
  const filteredTransitions = useMemo(() => transitions, [transitions]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-surface/5 select-none">
      {/* Header with category tabs */}
      <div className="flex items-center gap-2.5 p-1 border-b border-border/50 shrink-0 bg-surface/10">
        <div className="grow overflow-x-auto flex items-center gap-2 pb-0.5 whitespace-nowrap" style={{ scrollbarWidth: "none" }}>
          {TRANSITION_CATEGORIES.map((category) => (
            <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer shrink-0 hover:bg-accent/10 hover:text-accent ${activeCategory === category.id ? "bg-accent/10 text-accent" : "text-text-muted"}`}>
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="grow overflow-y-auto scrollbar-thin p-1" style={{ scrollbarWidth: "none" }}>
        {error && (
          <div className="mb-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-200 flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Failed to load transitions</p>
              <p className="opacity-80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {loading && filteredTransitions.length === 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filteredTransitions.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-text-muted gap-1 text-xs">
            <Wand2 className="w-5 h-5" />
            <p>No matching transitions found</p>
            <p className="opacity-60">Try another category or search</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {filteredTransitions.map((transition) => (
              <TransitionCard key={transition.id} transition={transition} onAddToTimeline={() => onAddToTimeline?.(transition as any, "transitions")} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SkeletonCard = () => (
  <div className="w-full aspect-square animate-pulse rounded-xl border border-border/30 bg-surface-raised/40 overflow-hidden flex flex-col justify-between p-1">
    <div className="flex-1 bg-white/5 relative overflow-hidden rounded-lg">
      <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white/10" />
    </div>
    <div className="flex items-center justify-between w-full mt-0.5">
      <div className="h-2.5 bg-white/10 rounded w-16" />
      <div className="h-4 w-4 rounded-full bg-white/10" />
    </div>
  </div>
);

const TransitionCard: React.FC<{ transition: TransitionAsset; onAddToTimeline: () => void }> = ({ transition, onAddToTimeline }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle video playback on hover
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      // Reset to start and play
      video.currentTime = 0;
      const playPromise = video.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Video play failed:", error);
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isHovered]);

  const handleAddToTimeline = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToTimeline();
    useProjectStore.getState().showToast(`Added ${transition.name} transition`);
  };

  return (
    <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className="w-full aspect-square bg-surface-raised/40 hover:bg-surface-raised/80 border border-border/40 hover:border-accent/40 rounded-xl relative overflow-hidden flex flex-col justify-between p-1 transition-all duration-300 group cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      {/* Premium Badge - top-left, appears on hover */}
      {transition.isPremium && (
        <button className={`absolute top-1 left-1 p-1 rounded-full bg-surface/40 hover:bg-surface/60 border border-border/50 transition-all duration-200 z-10 ${isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
          <Wand2 className="w-3 h-3 text-purple-400" />
        </button>
      )}

      {/* Preview area - with hover scale animation */}
      <div className="flex-1 flex items-center justify-center w-full select-none relative overflow-hidden transition-transform duration-500 ease-out group-hover:scale-[1.05]">
        {/* WebM Video Preview (shown on hover) */}
        {transition.preview && <video ref={videoRef} src={transition.preview} loop muted playsInline preload="auto" controls={false} disablePictureInPicture style={{ pointerEvents: "none" }} className={`max-w-full max-h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] select-none transition-opacity duration-300 absolute inset-0 m-auto ${isHovered ? "opacity-100 z-10" : "opacity-0 z-0"}`} />}

        {/* Static Thumbnail */}
        {!imageError ? (
          <img src={transition.thumbnail} alt={transition.name} className={`max-w-full max-h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] select-none pointer-events-none transition-opacity duration-300 absolute inset-0 m-auto ${isHovered ? "opacity-0 z-0" : "opacity-100 z-10"}`} onError={() => setImageError(true)} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-text-muted">
            <Wand2 className="w-6 h-6" />
            <span className="text-[9px] font-medium">{transition.name}</span>
          </div>
        )}
      </div>

      {/* Footer - name + apply button, always visible */}
      <div className="flex items-center justify-between w-full mt-0.5 z-10">
        <span className="text-[9px] text-text-muted font-medium group-hover:text-text-primary transition-colors truncate max-w-[65px]">{transition.name}</span>
        <button onClick={handleAddToTimeline} title="Add transition to timeline" aria-label="Add transition to timeline" className="w-4 h-4 rounded-full flex items-center justify-center transition-all bg-accent hover:bg-accent/85 border border-accent text-white cursor-pointer">
          <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
