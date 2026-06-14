import React, { useState, useEffect, useMemo } from "react";
import { Search, Sparkles, Loader2, AlertCircle, Play, CheckCircle } from "lucide-react";
import { useVideoEffectsStore } from "../store/videoEffectsStore";
import type { OverlayAsset } from "../types";

const OVERLAY_CATEGORIES = ["All", "Particles", "Light Leaks", "Bokeh", "Film", "Weather", "Abstract"];

interface OverlayPickerProps {
  onSelect: (overlay: OverlayAsset) => void;
}

export function OverlayPicker({ onSelect }: OverlayPickerProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const manifest = useVideoEffectsStore((state) => state.manifest);
  const categories = useVideoEffectsStore((state) => state.categories);
  const manifestLoading = useVideoEffectsStore((state) => state.manifestLoading);
  const manifestError = useVideoEffectsStore((state) => state.manifestError);
  const loadManifest = useVideoEffectsStore((state) => state.loadManifest);
  const loadCategory = useVideoEffectsStore((state) => state.loadCategory);

  useEffect(() => {
    loadManifest().catch((err) => console.error("Failed to load manifest:", err));
  }, [loadManifest]);

  useEffect(() => {
    if (activeCategory !== "All") {
      loadCategory("overlay", activeCategory.toLowerCase()).catch((err) => console.error("Failed to load category:", err));
    }
  }, [activeCategory, loadCategory]);

  const overlays = useMemo(() => {
    if (activeCategory === "All") {
      const featuredOverlays = (manifest?.featured.filter((item) => item.type === "overlay") as OverlayAsset[]) || [];
      return featuredOverlays;
    } else {
      const cacheKey = `overlay:${activeCategory.toLowerCase()}`;
      return (categories[cacheKey] || []) as OverlayAsset[];
    }
  }, [manifest, categories, activeCategory]);

  const loading = manifestLoading || (activeCategory !== "All" && useVideoEffectsStore.getState().categoryLoading[`overlay:${activeCategory.toLowerCase()}`]);
  const error = manifestError || (activeCategory !== "All" && useVideoEffectsStore.getState().categoryErrors[`overlay:${activeCategory.toLowerCase()}`]);

  const filteredOverlays = useMemo(() => {
    let filtered = overlays;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((o: OverlayAsset) => o.name.toLowerCase().includes(query) || o.category.toLowerCase().includes(query) || o.tags?.some((tag: string) => tag.toLowerCase().includes(query)));
    }

    return filtered;
  }, [overlays, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="relative shrink-0 border-b border-border/40 bg-surface/5">
        <div className="grow overflow-x-auto flex items-center gap-1.5 p-2 scrollbar-none whitespace-nowrap">
          {OVERLAY_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${activeCategory === cat ? "bg-accent text-white" : "bg-surface-raised border border-border text-text-muted hover:text-text-primary"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 shrink-0 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Search overlays..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-surface-raised border border-border/60 rounded-lg pl-9 pr-4 py-2 text-xs text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all selectable" />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading overlays...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filteredOverlays.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-1 text-xs text-text-muted">
            <p>No matching overlays found</p>
            <p className="opacity-60">Try another category or search</p>
          </div>
        )}

        {!loading && !error && filteredOverlays.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {filteredOverlays.map((overlay) => (
              <OverlayCard key={overlay.id} overlay={overlay} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const OverlayCard: React.FC<{ overlay: OverlayAsset; onSelect: (overlay: OverlayAsset) => void }> = ({ overlay, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false);

  const getDownloadState = useVideoEffectsStore((state) => state.getDownloadState);
  const isDownloaded = useVideoEffectsStore((state) => state.isDownloaded);

  const downloadState = getDownloadState(overlay.id);
  const isDownloadedFlag = isDownloaded(overlay.id);
  const isDownloading = downloadState?.status === "downloading";
  const hasError = downloadState?.status === "error";

  return (
    <div className="group relative aspect-square bg-surface-raised hover:bg-surface-raised/60 rounded-lg overflow-hidden transition-all border border-border hover:border-accent/30 cursor-pointer" onClick={() => !isDownloading && onSelect(overlay)} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {overlay.isPremium && (
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-linear-to-r from-purple-500 to-pink-500 rounded-full p-1">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Cached Indicator */}
      {isDownloadedFlag && !isDownloading && (
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-green-500 rounded-full p-0.5 shadow-md">
            <CheckCircle className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Downloading Overlay */}
      {isDownloading && (
        <div className="absolute inset-0 bg-black/60 z-10 flex flex-col items-center justify-center gap-1">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-[10px] text-accent font-semibold">{downloadState?.progress || 0}%</span>
        </div>
      )}

      {overlay.duration && <div className="absolute top-2 right-2 z-10 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">{overlay.duration.toFixed(1)}s</div>}

      {overlay.thumbnail ? (
        <img src={overlay.thumbnail} alt={overlay.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-accent/20 to-accent/5">
          <span className="text-4xl opacity-40">🎬</span>
        </div>
      )}

      {isHovered && !isDownloading && !hasError && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Play className="w-8 h-8 text-white fill-white" />
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2 transition-opacity ${isHovered && !isDownloading ? "opacity-100" : "opacity-0"}`}>
        <p className="text-xs font-semibold text-white truncate">{overlay.name}</p>
        {overlay.fileSize && <p className="text-[10px] text-white/60">{(overlay.fileSize / 1024 / 1024).toFixed(1)}MB</p>}
      </div>

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
    </div>
  );
};
