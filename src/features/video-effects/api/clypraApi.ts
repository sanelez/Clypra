/**
 * Clypra Video Effects API Client
 *
 * Handles fetching:
 * 1. Overlay Assets (smoke, fire, light leaks, etc.)
 * 2. Effect Presets (shake, blur, glitch, etc.)
 * 3. Transitions (zoom, dissolve, wipe, etc.)
 * 4. Filter Assets (color filters from JSON definitions)
 */

import { VideoEffectManifest, VideoEffectItem, OverlayAsset, EffectPreset, TransitionPreset, FilterAsset, VideoEffectCategory, EffectCategory } from "../types";

const BASE = "https://clypra-worker-api.abdulkabirmusa.com";
const API_KEY = import.meta.env.VITE_CLYPRA_API_KEY || "";

// Helper function to create headers with API key
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Clypra-Client": "clypra-desktop-v1",
  };

  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }

  return headers;
};

export class VideoEffectsApi {
  // In-memory caches
  private static _manifestCache: VideoEffectManifest | null = null;
  private static _categoryCache = new Map<string, VideoEffectItem[]>();
  private static _itemCache = new Map<string, VideoEffectItem>();
  private static _overlayBlobCache = new Map<string, Blob>();

  // ============================================================================
  // MANIFEST & CATEGORIES
  // ============================================================================

  /**
   * Fetch the main manifest with all categories and featured items
   */
  static async getManifest(): Promise<VideoEffectManifest> {
    if (this._manifestCache) {
      return this._manifestCache;
    }

    const res = await fetch(`${BASE}/video-effects/manifest`, {
      cache: "reload",
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to load video effects manifest: ${res.statusText}`);
    }

    const manifest = await res.json();
    this._manifestCache = manifest;
    return manifest;
  }

  /**
   * Fetch all categories by type
   */
  static async getCategoriesByType(type: EffectCategory): Promise<VideoEffectCategory[]> {
    const manifest = await this.getManifest();
    return manifest.categories.filter((cat) => cat.type === type);
  }

  /**
   * Fetch all overlays categories
   */
  static async getOverlayCategories(): Promise<VideoEffectCategory[]> {
    return this.getCategoriesByType("overlay");
  }

  /**
   * Fetch all effects categories
   */
  static async getEffectCategories(): Promise<VideoEffectCategory[]> {
    return this.getCategoriesByType("effect");
  }

  /**
   * Fetch all transitions categories
   */
  static async getTransitionCategories(): Promise<VideoEffectCategory[]> {
    return this.getCategoriesByType("transition");
  }

  // ============================================================================
  // ITEMS BY CATEGORY
  // ============================================================================

  /**
   * Fetch all items in a specific category
   */
  static async getItemsByCategory(type: EffectCategory, category: string): Promise<VideoEffectItem[]> {
    const cacheKey = `${type}:${category}`;

    if (this._categoryCache.has(cacheKey)) {
      return this._categoryCache.get(cacheKey)!;
    }

    const res = await fetch(`${BASE}/video-effects/${type}/${category}`, {
      cache: "reload",
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to load ${type} items for category "${category}": ${res.statusText}`);
    }

    const items: VideoEffectItem[] = await res.json();
    this._categoryCache.set(cacheKey, items);

    // Also cache individual items
    items.forEach((item) => {
      this._itemCache.set(item.id, item);
    });

    return items;
  }

  /**
   * Fetch overlay assets by category
   */
  static async getOverlays(category: string): Promise<OverlayAsset[]> {
    const items = await this.getItemsByCategory("overlay", category);
    return items as OverlayAsset[];
  }

  /**
   * Fetch effect presets by category
   */
  static async getEffects(category: string): Promise<EffectPreset[]> {
    const items = await this.getItemsByCategory("effect", category);
    return items as EffectPreset[];
  }

  /**
   * Fetch transitions by category
   */
  static async getTransitions(category: string): Promise<TransitionPreset[]> {
    const items = await this.getItemsByCategory("transition", category);
    return items as TransitionPreset[];
  }

  /**
   * Fetch filter assets by category
   */
  static async getFilters(category: string): Promise<FilterAsset[]> {
    const items = await this.getItemsByCategory("filter", category);
    return items as FilterAsset[];
  }

  // ============================================================================
  // INDIVIDUAL ITEMS
  // ============================================================================

  /**
   * Fetch a specific item by ID (with type hint)
   */
  static async getItem(type: EffectCategory, category: string, id: string): Promise<VideoEffectItem> {
    // Check cache first
    if (this._itemCache.has(id)) {
      return this._itemCache.get(id)!;
    }

    const res = await fetch(`${BASE}/video-effects/${type}/${category}/${id}`, {
      cache: "reload",
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to load ${type} item "${id}": ${res.statusText}`);
    }

    const item: VideoEffectItem = await res.json();
    this._itemCache.set(id, item);
    return item;
  }

  /**
   * Fetch a specific overlay asset
   */
  static async getOverlay(category: string, id: string): Promise<OverlayAsset> {
    const item = await this.getItem("overlay", category, id);
    return item as OverlayAsset;
  }

  /**
   * Fetch a specific effect preset
   */
  static async getEffect(category: string, id: string): Promise<EffectPreset> {
    const item = await this.getItem("effect", category, id);
    return item as EffectPreset;
  }

  /**
   * Fetch a specific transition
   */
  static async getTransition(category: string, id: string): Promise<TransitionPreset> {
    const item = await this.getItem("transition", category, id);
    return item as TransitionPreset;
  }

  /**
   * Fetch a specific filter asset
   */
  static async getFilter(category: string, id: string): Promise<FilterAsset> {
    const item = await this.getItem("filter", category, id);
    return item as FilterAsset;
  }

  // ============================================================================
  // OVERLAY ASSET DOWNLOADS
  // ============================================================================

  /**
   * Download an overlay asset file (with caching)
   *
   * This downloads the actual video file for overlays like smoke, fire, etc.
   * The file is cached in memory as a Blob.
   */
  static async downloadOverlay(overlay: OverlayAsset): Promise<Blob> {
    // Check cache first
    if (this._overlayBlobCache.has(overlay.id)) {
      return this._overlayBlobCache.get(overlay.id)!;
    }

    const res = await fetch(overlay.url, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to download overlay "${overlay.name}": ${res.statusText}`);
    }

    const blob = await res.blob();
    this._overlayBlobCache.set(overlay.id, blob);
    return blob;
  }

  /**
   * Download an overlay and convert to Object URL for video playback
   */
  static async getOverlayObjectURL(overlay: OverlayAsset): Promise<string> {
    const blob = await this.downloadOverlay(overlay);
    return URL.createObjectURL(blob);
  }

  /**
   * Pre-download multiple overlays in parallel (for preloading)
   */
  static async preloadOverlays(overlays: OverlayAsset[]): Promise<void> {
    await Promise.all(
      overlays.map((overlay) =>
        this.downloadOverlay(overlay).catch(() => {
          console.warn(`Failed to preload overlay: ${overlay.name}`);
        }),
      ),
    );
  }

  // ============================================================================
  // SEARCH & DISCOVERY
  // ============================================================================

  /**
   * Search across all items
   */
  static async search(query: string, type?: EffectCategory): Promise<VideoEffectItem[]> {
    const params = new URLSearchParams({ q: query });
    if (type) {
      params.append("type", type);
    }

    const res = await fetch(`${BASE}/video-effects/search?${params}`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Search failed: ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Get featured items
   */
  static async getFeatured(): Promise<VideoEffectItem[]> {
    const manifest = await this.getManifest();
    return manifest.featured;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Clear all local caches
   */
  static clearLocalCache(): void {
    this._manifestCache = null;
    this._categoryCache.clear();
    this._itemCache.clear();

    // Revoke all Object URLs before clearing blob cache
    this._overlayBlobCache.forEach((blob) => {
      URL.revokeObjectURL(URL.createObjectURL(blob));
    });
    this._overlayBlobCache.clear();
  }

  /**
   * Clear only overlay blob cache (to free memory)
   */
  static clearOverlayCache(): void {
    this._overlayBlobCache.forEach((blob) => {
      URL.revokeObjectURL(URL.createObjectURL(blob));
    });
    this._overlayBlobCache.clear();
  }

  /**
   * Get cache stats (for debugging)
   */
  static getCacheStats(): {
    manifestCached: boolean;
    categoriesCached: number;
    itemsCached: number;
    overlaysCached: number;
    totalOverlaySizeMB: number;
  } {
    let totalSize = 0;
    this._overlayBlobCache.forEach((blob) => {
      totalSize += blob.size;
    });

    return {
      manifestCached: this._manifestCache !== null,
      categoriesCached: this._categoryCache.size,
      itemsCached: this._itemCache.size,
      overlaysCached: this._overlayBlobCache.size,
      totalOverlaySizeMB: totalSize / (1024 * 1024),
    };
  }

  // ============================================================================
  // ADMIN (Cache Purging)
  // ============================================================================

  /**
   * Purge server-side cache (requires admin API key)
   */
  static async purgeServerCache(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE}/admin/purge-video-effects`, {
      method: "POST",
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to purge server cache: ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Purge all caches (local + server)
   */
  static async purgeAllCaches(): Promise<{
    local: { success: boolean };
    server: { success: boolean; message: string };
  }> {
    this.clearLocalCache();

    const serverResult = await this.purgeServerCache();

    return {
      local: { success: true },
      server: serverResult,
    };
  }
}
