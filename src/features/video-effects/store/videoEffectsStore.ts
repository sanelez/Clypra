/**
 * Video Effects Store
 *
 * Manages state for:
 * - Overlays (actual video files)
 * - Effects (behavior definitions)
 * - Transitions (animation definitions)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { VideoEffectManifest, VideoEffectItem, OverlayAsset, EffectPreset, TransitionPreset, VideoEffectCategory, EffectCategory } from "../types";
import { VideoEffectsApi } from "../api/clypraApi";
import { videoEffectsCacheManager, type CachedOverlay, type VideoEffectsDownloadProgress } from "@/lib/cache/videoEffectsCache";

export type VideoEffectsDownloadStatus = "idle" | "downloading" | "completed" | "error";

export interface VideoEffectsDownloadState {
  itemId: string;
  status: VideoEffectsDownloadStatus;
  progress: number; // 0-100
  cachedOverlay?: CachedOverlay;
  error?: string;
}

interface VideoEffectsState {
  // Manifest
  manifest: VideoEffectManifest | null;
  manifestLoading: boolean;
  manifestError: string | null;

  // Categories
  categories: Record<string, VideoEffectItem[]>;
  categoryLoading: Record<string, boolean>;
  categoryErrors: Record<string, string | null>;

  // Downloaded overlays (Object URLs or Local File URLs)
  overlayURLs: Map<string, string>;

  // Download states for overlays
  downloads: Record<string, VideoEffectsDownloadState>;

  // User favorites (persisted)
  favorites: Set<string>;

  // Actions
  loadManifest: () => Promise<void>;
  loadCategory: (type: EffectCategory, category: string) => Promise<void>;
  downloadOverlay: (overlay: OverlayAsset) => Promise<string>;
  preloadOverlays: (overlays: OverlayAsset[]) => Promise<void>;
  search: (query: string, type?: EffectCategory) => Promise<VideoEffectItem[]>;

  // Cache & Disk Download Actions
  initializeCache: () => Promise<void>;
  startDownload: (overlay: OverlayAsset) => Promise<CachedOverlay>;
  getDownloadState: (itemId: string) => VideoEffectsDownloadState | null;
  isDownloaded: (itemId: string) => boolean;
  getCachedOverlay: (itemId: string) => CachedOverlay | null;
  clearDownloadState: (itemId: string) => void;
  clearCache: (itemId: string) => Promise<void>;

  // Internal setters for downloads
  _updateDownloadProgress: (itemId: string, progress: number) => void;
  _setDownloadCompleted: (itemId: string, cachedOverlay: CachedOverlay) => void;
  _setDownloadError: (itemId: string, error: string) => void;

  // Favorites
  addFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  // Cache management
  clearAllLocalCaches: () => Promise<void>;
  clearOverlayCache: () => Promise<void>;
  getCacheStats: () => ReturnType<typeof VideoEffectsApi.getCacheStats> & { diskCount: number; diskSize: number };
}

export const useVideoEffectsStore = create<VideoEffectsState>()(
  persist(
    (set, get) => ({
      // Initial state
      manifest: null,
      manifestLoading: false,
      manifestError: null,
      categories: {},
      categoryLoading: {},
      categoryErrors: {},
      overlayURLs: new Map(),
      downloads: {},
      favorites: new Set(),

      // Initialize cache (loads already downloaded items from disk index)
      initializeCache: async () => {
        try {
          await videoEffectsCacheManager.initialize();

          // Try loading cached manifest from disk
          const diskManifest = await videoEffectsCacheManager.loadManifestJson();
          if (diskManifest && !get().manifest) {
            set({ manifest: diskManifest });
          }

          const cached = videoEffectsCacheManager.getAllCached();

          const downloads: Record<string, VideoEffectsDownloadState> = { ...get().downloads };
          const overlayURLs = new Map(get().overlayURLs);

          const { appCacheDir, join } = await import("@tauri-apps/api/path");
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const appCache = await appCacheDir();

          for (const file of cached) {
            const absolutePath = await join(appCache, file.localPath);
            const localUrl = convertFileSrc(absolutePath);
            
            downloads[file.id] = {
              itemId: file.id,
              status: "completed",
              progress: 100,
              cachedOverlay: file,
            };

            overlayURLs.set(file.id, localUrl);
          }

          set({ downloads, overlayURLs });
        } catch (error) {
          console.error("[VideoEffectsStore] Failed to initialize cache:", error);
        }
      },

      // Load manifest
      loadManifest: async () => {
        const state = get();

        // Skip if already loaded or loading
        if (state.manifest || state.manifestLoading) {
          return;
        }

        set({ manifestLoading: true, manifestError: null });

        try {
          const manifest = await VideoEffectsApi.getManifest();
          set({
            manifest,
            manifestLoading: false,
            manifestError: null,
          });
          // Cache to local disk asynchronously
          videoEffectsCacheManager.saveManifestJson(manifest).catch((err) => {
            console.warn("[VideoEffectsStore] Failed to save manifest to disk cache:", err);
          });
        } catch (error) {
          // Attempt fallback to local disk cache
          try {
            const cachedManifest = await videoEffectsCacheManager.loadManifestJson();
            if (cachedManifest) {
              set({
                manifest: cachedManifest,
                manifestLoading: false,
                manifestError: null,
              });
              console.info("[VideoEffectsStore] Loaded manifest from disk cache fallback.");
              return;
            }
          } catch (cacheErr) {
            console.warn("[VideoEffectsStore] Failed to load manifest from disk cache:", cacheErr);
          }

          const message = error instanceof Error ? error.message : "Failed to load manifest";
          set({
            manifestLoading: false,
            manifestError: message,
          });
          throw error;
        }
      },

      // Load category items
      loadCategory: async (type: EffectCategory, category: string) => {
        const cacheKey = `${type}:${category}`;
        const state = get();

        // Skip if already loaded or loading
        if (state.categories[cacheKey] || state.categoryLoading[cacheKey]) {
          return;
        }

        set((state) => ({
          categoryLoading: { ...state.categoryLoading, [cacheKey]: true },
          categoryErrors: { ...state.categoryErrors, [cacheKey]: null },
        }));

        try {
          const items = await VideoEffectsApi.getItemsByCategory(type, category);

          set((state) => ({
            categories: { ...state.categories, [cacheKey]: items },
            categoryLoading: { ...state.categoryLoading, [cacheKey]: false },
            categoryErrors: { ...state.categoryErrors, [cacheKey]: null },
          }));

          // Cache to local disk asynchronously
          videoEffectsCacheManager.saveCategoryJson(type, category, items).catch((err) => {
            console.warn(`[VideoEffectsStore] Failed to save category ${cacheKey} to disk cache:`, err);
          });
        } catch (error) {
          // Attempt fallback to local disk cache
          try {
            const cachedItems = await videoEffectsCacheManager.loadCategoryJson(type, category);
            if (cachedItems) {
              set((state) => ({
                categories: { ...state.categories, [cacheKey]: cachedItems },
                categoryLoading: { ...state.categoryLoading, [cacheKey]: false },
                categoryErrors: { ...state.categoryErrors, [cacheKey]: null },
              }));
              console.info(`[VideoEffectsStore] Loaded category ${cacheKey} from disk cache fallback.`);
              return;
            }
          } catch (cacheErr) {
            console.warn(`[VideoEffectsStore] Failed to load category ${cacheKey} from disk cache:`, cacheErr);
          }

          const message = error instanceof Error ? error.message : "Failed to load category";

          set((state) => ({
            categoryLoading: { ...state.categoryLoading, [cacheKey]: false },
            categoryErrors: { ...state.categoryErrors, [cacheKey]: message },
          }));

          throw error;
        }
      },

      // Start downloading an overlay to disk
      startDownload: async (overlay: OverlayAsset): Promise<CachedOverlay> => {
        const { downloads } = get();

        // Check if already completed
        if (videoEffectsCacheManager.isCached(overlay.id)) {
          const cached = videoEffectsCacheManager.getCached(overlay.id)!;
          return cached;
        }

        if (downloads[overlay.id]?.status === "downloading") {
          // If already downloading, wait for it or return promise
          const checkCompletion = (): Promise<CachedOverlay> => {
            return new Promise((resolve, reject) => {
              const unsubscribe = useVideoEffectsStore.subscribe((state) => {
                const dl = state.downloads[overlay.id];
                if (dl?.status === "completed" && dl.cachedOverlay) {
                  unsubscribe();
                  resolve(dl.cachedOverlay);
                } else if (dl?.status === "error") {
                  unsubscribe();
                  reject(new Error(dl.error || "Download failed"));
                }
              });
            });
          };
          return checkCompletion();
        }

        set({
          downloads: {
            ...downloads,
            [overlay.id]: {
              itemId: overlay.id,
              status: "downloading",
              progress: 0,
            },
          },
        });

        try {
          const cachedOverlay = await videoEffectsCacheManager.downloadOverlay(overlay, (progress) => {
            get()._updateDownloadProgress(overlay.id, progress.percentage);
          });

          // Resolve absolute path and set URL
          const { appCacheDir, join } = await import("@tauri-apps/api/path");
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const appCache = await appCacheDir();
          const absolutePath = await join(appCache, cachedOverlay.localPath);
          const localUrl = convertFileSrc(absolutePath);

          set((state) => {
            const newURLs = new Map(state.overlayURLs);
            newURLs.set(overlay.id, localUrl);
            return { overlayURLs: newURLs };
          });

          get()._setDownloadCompleted(overlay.id, cachedOverlay);
          return cachedOverlay;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Download failed";
          get()._setDownloadError(overlay.id, errorMessage);
          throw error;
        }
      },

      getDownloadState: (itemId: string) => {
        const state = get().downloads[itemId];
        if (state) return state;

        if (videoEffectsCacheManager.isCached(itemId)) {
          const cached = videoEffectsCacheManager.getCached(itemId)!;
          return {
            itemId,
            status: "completed",
            progress: 100,
            cachedOverlay: cached,
          };
        }

        return null;
      },

      isDownloaded: (itemId: string) => {
        return videoEffectsCacheManager.isCached(itemId);
      },

      getCachedOverlay: (itemId: string) => {
        return videoEffectsCacheManager.getCached(itemId);
      },

      clearDownloadState: (itemId: string) => {
        const { downloads } = get();
        const updated = { ...downloads };
        delete updated[itemId];
        set({ downloads: updated });
      },

      clearCache: async (itemId: string) => {
        await videoEffectsCacheManager.clearCache(itemId);
        set((state) => {
          const newURLs = new Map(state.overlayURLs);
          newURLs.delete(itemId);
          return { overlayURLs: newURLs };
        });
        get().clearDownloadState(itemId);
      },

      _updateDownloadProgress: (itemId: string, progress: number) => {
        const { downloads } = get();
        if (!downloads[itemId]) return;
        set({
          downloads: {
            ...downloads,
            [itemId]: {
              ...downloads[itemId],
              progress,
            },
          },
        });
      },

      _setDownloadCompleted: (itemId: string, cachedOverlay: CachedOverlay) => {
        const { downloads } = get();
        if (!downloads[itemId]) return;
        set({
          downloads: {
            ...downloads,
            [itemId]: {
              ...downloads[itemId],
              status: "completed",
              progress: 100,
              cachedOverlay,
            },
          },
        });
      },

      _setDownloadError: (itemId: string, error: string) => {
        const { downloads } = get();
        if (!downloads[itemId]) return;
        set({
          downloads: {
            ...downloads,
            [itemId]: {
              ...downloads[itemId],
              status: "error",
              progress: 0,
              error,
            },
          },
        });
      },

      // Download overlay asset (Wrapper keeping compatibility with URL returns)
      downloadOverlay: async (overlay: OverlayAsset): Promise<string> => {
        const state = get();

        // Return cached URL if available in memory
        if (state.overlayURLs.has(overlay.id)) {
          return state.overlayURLs.get(overlay.id)!;
        }

        try {
          const cachedOverlay = await get().startDownload(overlay);
          const appCache = await import("@tauri-apps/api/path").then((m) => m.appCacheDir());
          const absolutePath = await import("@tauri-apps/api/path").then((m) => m.join(appCache, cachedOverlay.localPath));
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          const localUrl = convertFileSrc(absolutePath);

          set((state) => {
            const newURLs = new Map(state.overlayURLs);
            newURLs.set(overlay.id, localUrl);
            return { overlayURLs: newURLs };
          });

          return localUrl;
        } catch (error) {
          console.error(`Failed to download overlay "${overlay.name}":`, error);
          throw error;
        }
      },

      // Preload multiple overlays
      preloadOverlays: async (overlays: OverlayAsset[]): Promise<void> => {
        await Promise.all(
          overlays.map((overlay) =>
            get()
              .downloadOverlay(overlay)
              .catch((error) => {
                console.warn(`Failed to preload overlay "${overlay.name}":`, error);
              }),
          ),
        );
      },

      // Search
      search: async (query: string, type?: EffectCategory): Promise<VideoEffectItem[]> => {
        try {
          return await VideoEffectsApi.search(query, type);
        } catch (error) {
          console.error("Search failed:", error);
          return [];
        }
      },

      // Favorites
      addFavorite: (id: string) => {
        set((state) => {
          const newFavorites = new Set(state.favorites);
          newFavorites.add(id);
          return { favorites: newFavorites };
        });
      },

      removeFavorite: (id: string) => {
        set((state) => {
          const newFavorites = new Set(state.favorites);
          newFavorites.delete(id);
          return { favorites: newFavorites };
        });
      },

      toggleFavorite: (id: string) => {
        const state = get();
        if (state.favorites.has(id)) {
          state.removeFavorite(id);
        } else {
          state.addFavorite(id);
        }
      },

      isFavorite: (id: string): boolean => {
        return get().favorites.has(id);
      },

      // Cache management
      clearAllLocalCaches: async () => {
        await videoEffectsCacheManager.clearAllCache();
        VideoEffectsApi.clearLocalCache();

        set({
          manifest: null,
          manifestError: null,
          categories: {},
          categoryLoading: {},
          categoryErrors: {},
          overlayURLs: new Map(),
          downloads: {},
        });
      },

      clearOverlayCache: async () => {
        await videoEffectsCacheManager.clearAllCache();
        VideoEffectsApi.clearOverlayCache();

        set({ overlayURLs: new Map(), downloads: {} });
      },

      getCacheStats: () => {
        const apiStats = VideoEffectsApi.getCacheStats();
        const diskStats = videoEffectsCacheManager.getCacheStats();

        return {
          ...apiStats,
          diskCount: diskStats.count,
          diskSize: diskStats.totalSize,
        };
      },
    }),
    {
      name: "clypra-video-effects-store",
      partialize: (state) => ({
        // Persist favorites as well as manifest and categories JSON to satisfy offline loading
        favorites: Array.from(state.favorites),
        manifest: state.manifest,
        categories: state.categories,
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        favorites: new Set(persistedState?.favorites || []),
        manifest: persistedState?.manifest || null,
        categories: persistedState?.categories || {},
      }),
    },
  ),
);

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Hook to get overlays for a category
 */
export function useOverlays(category: string) {
  const store = useVideoEffectsStore();
  const cacheKey = `overlay:${category}`;

  React.useEffect(() => {
    store.loadCategory("overlay", category);
  }, [category]);

  return {
    overlays: (store.categories[cacheKey] || []) as OverlayAsset[],
    loading: store.categoryLoading[cacheKey] || false,
    error: store.categoryErrors[cacheKey] || null,
  };
}

/**
 * Hook to get effects for a category
 */
export function useEffects(category: string) {
  const store = useVideoEffectsStore();
  const cacheKey = `effect:${category}`;

  React.useEffect(() => {
    store.loadCategory("effect", category);
  }, [category]);

  return {
    effects: (store.categories[cacheKey] || []) as EffectPreset[],
    loading: store.categoryLoading[cacheKey] || false,
    error: store.categoryErrors[cacheKey] || null,
  };
}

/**
 * Hook to get transitions for a category
 */
export function useTransitions(category: string) {
  const store = useVideoEffectsStore();
  const cacheKey = `transition:${category}`;

  React.useEffect(() => {
    store.loadCategory("transition", category);
  }, [category]);

  return {
    transitions: (store.categories[cacheKey] || []) as TransitionPreset[],
    loading: store.categoryLoading[cacheKey] || false,
    error: store.categoryErrors[cacheKey] || null,
  };
}

/**
 * Hook to get manifest
 */
export function useManifest() {
  const store = useVideoEffectsStore();

  React.useEffect(() => {
    store.loadManifest();
  }, []);

  return {
    manifest: store.manifest,
    loading: store.manifestLoading,
    error: store.manifestError,
  };
}

// Add React import for hooks
import React from "react";

// Initialize cache on startup
useVideoEffectsStore.getState().initializeCache();

