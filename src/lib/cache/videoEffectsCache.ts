/**
 * Video Effects Cache Manager
 * Handles downloading and caching video effects overlay files (.webm, .mp4, .mov) from the API to disk
 */

import { BaseDirectory, exists, mkdir, writeFile, readFile, remove, readDir } from "@tauri-apps/plugin-fs";
import { join, appCacheDir } from "@tauri-apps/api/path";
import type { OverlayAsset, VideoEffectManifest, VideoEffectItem, EffectCategory } from "@/features/video-effects/types";

export interface CachedOverlay {
  id: string;
  localPath: string; // Relative path under AppCache (e.g. "video-effects/filename.webm")
  originalUrl: string;
  fileName: string;
  size: number;
  downloadedAt: number;
}

export interface VideoEffectsDownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

const CACHE_DIR = "video-effects";
const CACHE_INDEX_FILE = "index.json";

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_. ]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

function getFileExtension(url: string, defaultExt = "webm"): string {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : defaultExt;
}

class VideoEffectsCacheManager {
  private cacheIndex: Map<string, CachedOverlay> = new Map();
  private cacheDir: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const appCache = await appCacheDir();
      this.cacheDir = await join(appCache, CACHE_DIR);

      const dirExists = await exists(this.cacheDir, { baseDir: BaseDirectory.AppCache });
      if (!dirExists) {
        await mkdir(this.cacheDir, { baseDir: BaseDirectory.AppCache, recursive: true });
      }

      await this.loadIndex();
      this.initialized = true;
    } catch (error) {
      console.error("[VideoEffectsCache] Failed to initialize:", error);
      throw new Error("Failed to initialize video effects cache");
    }
  }

  private async loadIndex(): Promise<void> {
    if (!this.cacheDir) return;

    try {
      const indexPath = await join(this.cacheDir, CACHE_INDEX_FILE);
      const indexExists = await exists(indexPath, { baseDir: BaseDirectory.AppCache });

      if (indexExists) {
        const indexData = await readFile(indexPath, { baseDir: BaseDirectory.AppCache });
        const indexJson = new TextDecoder().decode(indexData);
        const indexArray: CachedOverlay[] = JSON.parse(indexJson);

        this.cacheIndex.clear();
        indexArray.forEach((item) => {
          this.cacheIndex.set(item.id, item);
        });
      }
    } catch (error) {
      console.warn("[VideoEffectsCache] Failed to load index, starting fresh:", error);
      this.cacheIndex.clear();
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.cacheDir) return;

    try {
      const indexPath = await join(this.cacheDir, CACHE_INDEX_FILE);
      const indexArray = Array.from(this.cacheIndex.values());
      const indexJson = JSON.stringify(indexArray, null, 2);
      const indexData = new TextEncoder().encode(indexJson);

      await writeFile(indexPath, indexData, { baseDir: BaseDirectory.AppCache });
    } catch (error) {
      console.error("[VideoEffectsCache] Failed to save index:", error);
    }
  }

  isCached(itemId: string): boolean {
    return this.cacheIndex.has(itemId);
  }

  getCached(itemId: string): CachedOverlay | null {
    return this.cacheIndex.get(itemId) || null;
  }

  getCachedPath(itemId: string): string | null {
    const cached = this.cacheIndex.get(itemId);
    return cached ? cached.localPath : null;
  }

  async downloadOverlay(
    item: OverlayAsset,
    onProgress?: (progress: VideoEffectsDownloadProgress) => void
  ): Promise<CachedOverlay> {
    await this.initialize();

    if (!this.cacheDir) {
      throw new Error("Cache directory not initialized");
    }

    if (this.isCached(item.id)) {
      const cached = this.cacheIndex.get(item.id)!;
      return cached;
    }

    try {
      const ext = getFileExtension(item.url, item.fileFormat || "webm");
      const sanitizedName = sanitizeFileName(item.name);
      const fileName = `${item.id}_${sanitizedName}.${ext}`;
      const relativePath = `${CACHE_DIR}/${fileName}`;

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (onProgress && total > 0) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
          });
        }
      }

      const fileData = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        fileData.set(chunk, offset);
        offset += chunk.length;
      }

      await writeFile(relativePath, fileData, { baseDir: BaseDirectory.AppCache });

      const cachedFile: CachedOverlay = {
        id: item.id,
        localPath: relativePath,
        originalUrl: item.url,
        fileName,
        size: loaded,
        downloadedAt: Date.now(),
      };

      this.cacheIndex.set(item.id, cachedFile);
      await this.saveIndex();

      return cachedFile;
    } catch (error) {
      console.error("[VideoEffectsCache] Download failed:", error);
      throw new Error(`Failed to download video overlay: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async ensureDownloaded(
    item: OverlayAsset,
    onProgress?: (progress: VideoEffectsDownloadProgress) => void
  ): Promise<CachedOverlay> {
    await this.initialize();

    if (this.isCached(item.id)) {
      return this.cacheIndex.get(item.id)!;
    }

    return this.downloadOverlay(item, onProgress);
  }

  async saveManifestJson(manifest: VideoEffectManifest): Promise<void> {
    await this.initialize();
    if (!this.cacheDir) return;
    try {
      const filePath = `${CACHE_DIR}/manifest.json`;
      const data = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      await writeFile(filePath, data, { baseDir: BaseDirectory.AppCache });
    } catch (error) {
      console.error("[VideoEffectsCache] Failed to save manifest JSON:", error);
    }
  }

  async loadManifestJson(): Promise<VideoEffectManifest | null> {
    await this.initialize();
    if (!this.cacheDir) return null;
    try {
      const filePath = `${CACHE_DIR}/manifest.json`;
      const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppCache });
      if (!fileExists) return null;
      const data = await readFile(filePath, { baseDir: BaseDirectory.AppCache });
      const jsonText = new TextDecoder().decode(data);
      return JSON.parse(jsonText);
    } catch (error) {
      console.warn("[VideoEffectsCache] Failed to load manifest JSON:", error);
      return null;
    }
  }

  async saveCategoryJson(
    type: EffectCategory,
    category: string,
    items: VideoEffectItem[]
  ): Promise<void> {
    await this.initialize();
    if (!this.cacheDir) return;
    try {
      const fileName = `category_${type}_${category}.json`;
      const filePath = `${CACHE_DIR}/${fileName}`;
      const data = new TextEncoder().encode(JSON.stringify(items, null, 2));
      await writeFile(filePath, data, { baseDir: BaseDirectory.AppCache });
    } catch (error) {
      console.error(`[VideoEffectsCache] Failed to save category JSON for ${type}/${category}:`, error);
    }
  }

  async loadCategoryJson(
    type: EffectCategory,
    category: string
  ): Promise<VideoEffectItem[] | null> {
    await this.initialize();
    if (!this.cacheDir) return null;
    try {
      const fileName = `category_${type}_${category}.json`;
      const filePath = `${CACHE_DIR}/${fileName}`;
      const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppCache });
      if (!fileExists) return null;
      const data = await readFile(filePath, { baseDir: BaseDirectory.AppCache });
      const jsonText = new TextDecoder().decode(data);
      return JSON.parse(jsonText);
    } catch (error) {
      console.warn(`[VideoEffectsCache] Failed to load category JSON for ${type}/${category}:`, error);
      return null;
    }
  }

  async clearCache(itemId: string): Promise<void> {
    await this.initialize();

    const cached = this.cacheIndex.get(itemId);
    if (!cached) return;

    try {
      const fileExists = await exists(cached.localPath, { baseDir: BaseDirectory.AppCache });
      if (fileExists) {
        await remove(cached.localPath, { baseDir: BaseDirectory.AppCache });
      }

      this.cacheIndex.delete(itemId);
      await this.saveIndex();
    } catch (error) {
      console.error("[VideoEffectsCache] Failed to clear cache:", error);
      throw error;
    }
  }

  async clearAllCache(): Promise<void> {
    await this.initialize();

    if (!this.cacheDir) return;

    try {
      const entries = await readDir(this.cacheDir, { baseDir: BaseDirectory.AppCache });

      for (const entry of entries) {
        if (entry.name !== CACHE_INDEX_FILE) {
          const filePath = await join(this.cacheDir, entry.name);
          await remove(filePath, { baseDir: BaseDirectory.AppCache });
        }
      }

      this.cacheIndex.clear();
      await this.saveIndex();
    } catch (error) {
      console.error("[VideoEffectsCache] Failed to clear all cache:", error);
      throw error;
    }
  }

  getCacheStats(): { count: number; totalSize: number; items: CachedOverlay[] } {
    const items = Array.from(this.cacheIndex.values());
    const totalSize = items.reduce((sum, item) => sum + item.size, 0);

    return {
      count: items.length,
      totalSize,
      items,
    };
  }

  getAllCached(): CachedOverlay[] {
    return Array.from(this.cacheIndex.values());
  }
}

export const videoEffectsCacheManager = new VideoEffectsCacheManager();
