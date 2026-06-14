import React, { useMemo, useState, useEffect } from "react";
import { Filter, Grid3X3, Plus, Search, SlidersHorizontal, Sparkles, Sun, Palette, Droplets, Camera, AlertCircle, CheckCircle, Download, Loader2, type LucideIcon } from "lucide-react";
import type { TabProps } from "./types";
import { useVideoEffectsStore } from "@/features/video-effects/store/videoEffectsStore";
import type { FilterAsset } from "@/features/video-effects/types";
import { useProjectStore } from "@/store/projectStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";

// Hardcoded filter categories for instant UI rendering
const FILTER_CATEGORIES = [
  { id: "vintage", label: "Vintage" },
  { id: "modern", label: "Modern" },
  { id: "cinematic", label: "Cinematic" },
  { id: "bw", label: "B&W" },
  { id: "color", label: "Color" },
] as const;

type FilterCategory = (typeof FILTER_CATEGORIES)[number]["id"];

const FILTER_ICONS: Record<string, LucideIcon> = {
  "filter-sepia": Sun,
  "filter-retro": Camera,
  "filter-aged": Grid3X3,
  "filter-crisp": Sparkles,
  "filter-vivid": Palette,
  "filter-cool": Droplets,
  "filter-cinematic-teal": SlidersHorizontal,
  "filter-bleach": Sun,
  "filter-moody": Camera,
  "filter-bw-classic": Grid3X3,
  "filter-high-contrast": SlidersHorizontal,
  "filter-soft-bw": Droplets,
  "filter-warm": Sun,
  "filter-cool-blue": Droplets,
  "filter-purple-haze": Sparkles,
};

const DEFAULT_ICON = Filter;

export const FiltersTab: React.FC<TabProps> = ({ onAddToTimeline }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("vintage");

  const loadCategory = useVideoEffectsStore((state) => state.loadCategory);
  const categories = useVideoEffectsStore((state) => state.categories);
  const loading = useVideoEffectsStore((state) => state.categoryLoading);
  const errors = useVideoEffectsStore((state) => state.categoryErrors);

  // Initialize cache on mount
  useEffect(() => {
    useVideoEffectsStore.getState().initializeCache();
  }, []);

  // Fetch filter category items only when the active category changes
  useEffect(() => {
    const categoryKey = `filter:${activeCategory}`;
    if (!categories[categoryKey]) {
      loadCategory("filter", activeCategory).catch((err) => {
        console.error(`[FiltersTab] Failed to load category ${activeCategory}:`, err);
      });
    }
  }, [activeCategory, loadCategory, categories]);

  // Get filters for the active category only
  const allFilters = useMemo(() => {
    return (categories[`filter:${activeCategory}`] || []) as FilterAsset[];
  }, [activeCategory, categories]);

  const filteredFilters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allFilters.filter((filter) => {
      const matchesSearch = !query || filter.name.toLowerCase().includes(query) || filter.description.toLowerCase().includes(query) || filter.category.includes(query);
      return matchesSearch;
    });
  }, [allFilters, searchQuery]);

  const isCategoryLoading = useMemo(() => {
    return loading[`filter:${activeCategory}`] || false;
  }, [activeCategory, loading]);

  const categoryError = useMemo(() => {
    return errors[`filter:${activeCategory}`] || null;
  }, [activeCategory, errors]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-surface/5 select-none">
      <div className="flex items-center gap-2.5 p-1 border-b border-border/50 shrink-0 bg-surface/10">
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-sm bg-accent/10 border border-accent/20 text-accent-soft">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-[12px] font-semibold">Filters</span>
        </div>
        <div className="w-px h-5 bg-border/80 shrink-0" />
        <div className="grow overflow-x-auto flex items-center gap-2 pb-0.5 whitespace-nowrap" style={{ scrollbarWidth: "none" }}>
          {FILTER_CATEGORIES.map((category) => (
            <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeCategory === category.id ? "bg-accent text-white shadow-sm" : "text-text-muted hover:text-text-primary hover:bg-surface-raised/60"}`}>
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-1 border-b border-border/50 bg-surface/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Search filters..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-surface-raised/70 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>

      <div className="grow overflow-y-auto scrollbar-thin p-1" style={{ scrollbarWidth: "none" }}>
        {categoryError && (
          <div className="mb-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-200 flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Failed to load filters</p>
              <p className="opacity-80 mt-0.5">{categoryError}</p>
            </div>
          </div>
        )}

        {isCategoryLoading && filteredFilters.length === 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filteredFilters.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-text-muted gap-1 text-xs">
            <Filter className="w-5 h-5" />
            <p>No matching filters found</p>
            <p className="opacity-60">Try another category or search</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredFilters.map((filter) => (
              <FilterCard key={filter.id} filter={filter} onAddToTimeline={() => onAddToTimeline?.(filter as any, "filters")} />
            ))}
            {isCategoryLoading && <SkeletonCard />}
          </div>
        )}
      </div>
    </div>
  );
};

const SkeletonCard = () => (
  <div className="animate-pulse rounded-lg border border-border/30 bg-surface-raised/40 overflow-hidden flex flex-col justify-between">
    <div className="h-28 bg-white/5 relative overflow-hidden">
      <div className="absolute right-2 top-2 h-5 w-12 rounded bg-white/10" />
    </div>
    <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
      <div className="space-y-2">
        <div className="h-3.5 bg-white/10 rounded w-3/4" />
        <div className="h-3 bg-white/5 rounded w-full" />
        <div className="h-3 bg-white/5 rounded w-5/6" />
      </div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
        <div className="h-2.5 bg-white/5 rounded w-1/3" />
        <div className="h-2.5 bg-white/5 rounded w-1/4" />
      </div>
    </div>
  </div>
);

const FilterCard: React.FC<{ filter: FilterAsset; onAddToTimeline: () => void }> = ({ filter, onAddToTimeline }) => {
  const Icon = FILTER_ICONS[filter.id] || DEFAULT_ICON;
  const isReady = true; // All filters are ready (status field is just for UI labeling)

  const { getFilterDownloadState, startFilterDownload, isFilterDownloaded } = useVideoEffectsStore();

  const downloadState = getFilterDownloadState(filter.id);
  const isDownloadedFlag = isFilterDownloaded(filter.id);
  const isDownloading = downloadState?.status === "downloading";

  // Use filter-specific preview, or fallback to sample image for testing
  const previewSrc = filter.thumbnail || "/filter-previews/sample.jpg";
  const hasImage = true; // Always try to show image (filter preview or sample)

  // Apply CSS filter approximation based on filter ID for preview
  const getCSSFilterStyle = (filterId: string): React.CSSProperties => {
    const filterMap: Record<string, string> = {
      "filter-sepia": "sepia(0.8) hue-rotate(-10deg) saturate(1.2)",
      "filter-retro": "sepia(0.4) contrast(1.2) saturate(0.8) hue-rotate(10deg)",
      "filter-aged": "sepia(0.6) contrast(1.1) brightness(0.95) saturate(0.7)",
      "filter-crisp": "contrast(1.3) saturate(1.2) brightness(1.05)",
      "filter-vivid": "saturate(1.8) contrast(1.1) brightness(1.05)",
      "filter-cool": "hue-rotate(-20deg) saturate(1.2) brightness(1.05)",
      "filter-cinematic-teal": "sepia(0.3) hue-rotate(150deg) saturate(1.4)",
      "filter-bleach": "contrast(1.2) brightness(1.1) saturate(0.6)",
      "filter-moody": "contrast(1.3) brightness(0.85) saturate(0.9) hue-rotate(-10deg)",
      "filter-bw-classic": "grayscale(1) contrast(1.2)",
      "filter-high-contrast": "grayscale(1) contrast(1.6) brightness(1.05)",
      "filter-soft-bw": "grayscale(1) contrast(0.9) brightness(1.05)",
      "filter-warm": "sepia(0.3) saturate(1.3) hue-rotate(10deg) brightness(1.05)",
      "filter-cool-blue": "hue-rotate(180deg) saturate(1.2) brightness(1.05)",
      "filter-purple-haze": "hue-rotate(260deg) saturate(1.3) brightness(0.95)",
    };

    const filterValue = filterMap[filterId] || "";
    return filterValue ? { filter: filterValue } : {};
  };

  // Handle preview (download filter JSON first)
  const handlePreview = async () => {
    if (!isReady) return;

    try {
      // Download filter if not cached
      await startFilterDownload(filter);

      // TODO: Open filter preview modal
      // For now, just show a toast
      useProjectStore.getState().showToast(`Preview for ${filter.name} - Full preview coming soon!`);
    } catch (error) {
      console.error("[FilterCard] Preview failed:", error);
      useProjectStore.getState().showToast("Failed to load filter preview", "error");
    }
  };

  // Handle add to timeline (download first, then add)
  const handleAddToTimeline = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering preview
    if (!isReady || isDownloading) return;

    try {
      console.log(`[FilterCard] Adding filter "${filter.name}" to timeline`);

      // Download filter JSON with minimum delay for visual feedback
      const downloadPromise = startFilterDownload(filter);
      const delayPromise = new Promise((resolve) => setTimeout(resolve, 300));

      await Promise.all([downloadPromise, delayPromise]);
      console.log(`[FilterCard] Filter "${filter.name}" downloaded successfully`);

      // Add to timeline
      onAddToTimeline();
      console.log(`[FilterCard] Filter "${filter.name}" added to timeline`);

      // Show success feedback
      useProjectStore.getState().showToast(`Added ${filter.name} filter`);
    } catch (error) {
      console.error("[FilterCard] Add to timeline failed:", error);
      useProjectStore.getState().showToast("Failed to add filter", "error");
    }
  };

  return (
    <div onClick={handlePreview} className={`group text-left rounded-xl border bg-surface-raised/40 transition-all overflow-hidden flex flex-col h-[200px] shadow-[0_4px_16px_rgba(0,0,0,0.3)] ${isReady ? "hover:bg-surface-raised/80 hover:border-accent/40 cursor-pointer" : "opacity-70 cursor-not-allowed"} ${isDownloading ? "border-accent/60" : "border-border/40"}`}>
      {/* Downloading Overlay */}
      {isDownloading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
            <span className="text-[10px] font-semibold text-accent">{downloadState?.progress || 0}%</span>
          </div>
        </div>
      )}

      {/* Preview Area */}
      <div className="h-28 w-full relative overflow-hidden bg-surface/60 shrink-0">
        {/* Cached Indicator */}
        {isDownloadedFlag && !isDownloading && (
          <div className="absolute top-2 right-2 z-10">
            <div className="bg-green-500/90 rounded-full p-0.5 shadow-md">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
        )}

        {hasImage ? (
          // Show actual preview image with CSS filter applied for preview
          <img
            src={previewSrc}
            alt={`${filter.name} preview`}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            style={getCSSFilterStyle(filter.id)}
            loading="lazy"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
            }}
          />
        ) : (
          // Fallback to gradient swatch
          <>
            <div className={`h-full w-full bg-linear-to-br ${filter.swatch || "from-zinc-500/20 to-zinc-700/20"}`} />
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.42),transparent_38%)]" />
            <div className="absolute left-2 top-2 h-7 w-7 rounded-md bg-black/30 border border-white/10 flex items-center justify-center backdrop-blur-sm">
              <Icon className="w-4 h-4 text-white" />
            </div>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="p-2 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold text-text-primary leading-tight truncate">{filter.name}</p>

            {/* Add to Timeline Button */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={handleAddToTimeline} disabled={isDownloading || !isReady} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isDownloading ? "bg-accent/20 border border-accent cursor-wait" : isDownloadedFlag ? "bg-accent/20 hover:bg-accent border border-accent text-accent hover:text-white cursor-pointer" : "bg-surface/40 hover:bg-accent/80 border border-border/50 text-text-muted hover:text-white cursor-pointer"}`}>
                    {isDownloading ? <Download className="w-3.5 h-3.5 animate-pulse" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{isDownloadedFlag ? "Add to Timeline" : "Download & Add"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-text-muted line-clamp-2 truncate">{filter.description}</p>
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
          <span className="text-[10px] capitalize text-text-muted group-hover:text-text-primary transition-colors truncate mr-1">{filter.category}</span>
          {filter.intensity && <span className="text-[10px] text-text-muted shrink-0">{filter.intensity.default}%</span>}
        </div>
      </div>
    </div>
  );
};
