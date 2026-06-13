import { describe, it, expect, vi, beforeEach } from "vitest";
import { useVideoEffectsStore } from "../videoEffectsStore";
import { VideoEffectsApi } from "../../api/clypraApi";
import { videoEffectsCacheManager } from "@/lib/cache/videoEffectsCache";

// Mock Tauri plugin-fs and api
vi.mock("@tauri-apps/plugin-fs");
vi.mock("@tauri-apps/api/path", () => ({
  appCacheDir: vi.fn().mockResolvedValue("mock-cache-dir"),
  join: vi.fn().mockImplementation((...args) => Promise.resolve(args.join("/"))),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn().mockImplementation((path) => `convertFileSrc(${path})`),
}));

// Mock videoEffectsCacheManager methods
vi.mock("@/lib/cache/videoEffectsCache", () => {
  return {
    videoEffectsCacheManager: {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAllCached: vi.fn().mockReturnValue([]),
      saveManifestJson: vi.fn().mockResolvedValue(undefined),
      loadManifestJson: vi.fn().mockResolvedValue(null),
      saveCategoryJson: vi.fn().mockResolvedValue(undefined),
      loadCategoryJson: vi.fn().mockResolvedValue(null),
      isCached: vi.fn().mockReturnValue(false),
      getCached: vi.fn().mockReturnValue(null),
    },
  };
});

// Mock VideoEffectsApi
vi.mock("../../api/clypraApi", () => {
  return {
    VideoEffectsApi: {
      getManifest: vi.fn(),
      getItemsByCategory: vi.fn(),
      getCacheStats: vi.fn().mockReturnValue({}),
      clearLocalCache: vi.fn(),
      clearOverlayCache: vi.fn(),
    },
  };
});

describe("VideoEffectsStore JSON Caching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useVideoEffectsStore.setState({
      manifest: null,
      manifestLoading: false,
      manifestError: null,
      categories: {},
      categoryLoading: {},
      categoryErrors: {},
    });
  });

  it("should fetch manifest from API and cache it to disk", async () => {
    const mockManifest = { version: "1.0.0", categories: [], featured: [] };
    vi.mocked(VideoEffectsApi.getManifest).mockResolvedValueOnce(mockManifest);

    await useVideoEffectsStore.getState().loadManifest();

    expect(useVideoEffectsStore.getState().manifest).toEqual(mockManifest);
    expect(videoEffectsCacheManager.saveManifestJson).toHaveBeenCalledWith(mockManifest);
  });

  it("should fallback to disk cache if manifest API fetch fails", async () => {
    const mockManifest = { version: "1.0.0", categories: [], featured: [] };
    vi.mocked(VideoEffectsApi.getManifest).mockRejectedValueOnce(new Error("Network Error"));
    vi.mocked(videoEffectsCacheManager.loadManifestJson).mockResolvedValueOnce(mockManifest);

    await useVideoEffectsStore.getState().loadManifest();

    expect(useVideoEffectsStore.getState().manifest).toEqual(mockManifest);
    expect(useVideoEffectsStore.getState().manifestError).toBeNull();
  });

  it("should fetch category items from API and cache them to disk", async () => {
    const mockItems = [{ id: "smoke_001", name: "Smoke", type: "overlay" as const, category: "particles" }];
    vi.mocked(VideoEffectsApi.getItemsByCategory).mockResolvedValueOnce(mockItems as any);

    await useVideoEffectsStore.getState().loadCategory("overlay", "particles");

    expect(useVideoEffectsStore.getState().categories["overlay:particles"]).toEqual(mockItems);
    expect(videoEffectsCacheManager.saveCategoryJson).toHaveBeenCalledWith("overlay", "particles", mockItems);
  });

  it("should fallback to disk cache if category API fetch fails", async () => {
    const mockItems = [{ id: "smoke_001", name: "Smoke", type: "overlay" as const, category: "particles" }];
    vi.mocked(VideoEffectsApi.getItemsByCategory).mockRejectedValueOnce(new Error("Network Error"));
    vi.mocked(videoEffectsCacheManager.loadCategoryJson).mockResolvedValueOnce(mockItems as any);

    await useVideoEffectsStore.getState().loadCategory("overlay", "particles");

    expect(useVideoEffectsStore.getState().categories["overlay:particles"]).toEqual(mockItems);
  });
});
