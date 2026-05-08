import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePathForTauriInvoke } from "../../../lib/tauri";
import { generateTimestampGrid } from "../../../lib/timelineUtils";
import { cn } from "@/lib/utils";
import { DensityLevel } from "../../../types";
import type { Clip, MediaAsset, ThumbnailTile } from "../../../types";
import { GPUTextureCache } from "@/lib/gpuTextureCache";
import { globalGPUCache } from "@/lib/globalGPUCache";
import { performanceMetrics } from "@/lib/performanceMetrics";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic|heif|avif)$/i;

/** Fixed visual tile width — never changes with zoom */
const TILE_WIDTH_PX = 60;

/**
 * Adaptive extraction interval — scales with video duration to cap frame count.
 *   ≤ 60s  → 0.5s  (max 120 frames)
 *   ≤ 300s → 1.0s  (max 300 frames)
 *   ≤ 600s → 2.0s  (max 300 frames)
 *   > 600s → ceil(duration / 200)  (max ~200 frames)
 */
function getExtractionInterval(durationSecs: number): number {
  if (durationSecs <= 60) return 0.5;
  if (durationSecs <= 300) return 1.0;
  if (durationSecs <= 600) return 2.0;
  return Math.ceil(durationSecs / 200);
}

/**
 * No-op kept for test compatibility. The CapCut-style architecture manages
 * its own in-memory frame cache per component instance.
 */
export function clearFilmstripFrameCache(): void {}

export interface ClipFilmstripProps {
  clip: Clip;
  mediaAsset: MediaAsset;
  clipWidthPx: number;
  pixelsPerSecond: number;
  stripHeightPx?: number;
  className?: string;
}

/**
 * Round a timestamp to millisecond precision for consistent Map key lookups.
 * Both the pre-fill and the Rust callback use this to ensure matching keys.
 */
function roundMs(t: number): number {
  return Math.round(t * 1000) / 1000;
}

/**
 * ClipFilmstrip renders a filmstrip of thumbnail tiles for a video clip.
 *
 * GPU-Centric Architecture (Phase 1):
 * - **GPU texture cache**: Upload RGBA to GPU once, reuse forever
 * - **Zero re-upload**: Subsequent renders use cached GPU textures
 * - **Fallback support**: Falls back to canvas if GPU unavailable
 *
 * CapCut-style architecture:
 * - **Extract once on import**: Generates a dense 0.5s grid and invokes
 *   `decode_frames_streaming` exactly ONCE per clip (or when trim changes).
 * - **Zoom = pure sampling**: Zoom changes compute how many 60px tiles fit,
 *   then sample every Nth frame from the existing cache. Zero Rust calls.
 * - **Trim = re-extract**: Only trimIn/trimOut changes trigger a new extraction.
 */
export function ClipFilmstrip({ clip, mediaAsset, clipWidthPx, pixelsPerSecond, stripHeightPx = 40, className }: ClipFilmstripProps) {
  // GPU texture cache (Phase 1: WebGL)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuCacheRef = useRef<GPUTextureCache | null>(null);
  const [useGPUCache, setUseGPUCache] = useState(false);
  const [textureKeys, setTextureKeys] = useState<Map<number, string>>(new Map());
  const componentId = useRef(`filmstrip-${clip.id}-${Math.random().toString(36).substr(2, 9)}`).current;

  // Try to use global GPU cache first, fall back to local cache
  const useGlobalCache = typeof window !== "undefined" && globalGPUCache.isInitialized();

  // Legacy canvas-based cache (fallback)
  const [frameCache, setFrameCache] = useState<Map<number, string>>(new Map());
  const extractionKeyRef = useRef("");
  const channelRef = useRef<Channel<ThumbnailTile> | null>(null);

  const isVideoSource = useMemo(() => {
    const path = mediaAsset.path ?? "";
    return mediaAsset.type === "video" && path.length > 0 && !IMAGE_EXT.test(path);
  }, [mediaAsset.type, mediaAsset.path]);

  const resolutionTier = typeof window !== "undefined" && window.devicePixelRatio >= 1.5 ? "2x" : "1x";
  const [thumbW, thumbH] = resolutionTier === "2x" ? [120, 80] : [60, 40];

  // ── Initialize GPU texture cache ────────────────────────────────────────
  useEffect(() => {
    // Try to use global GPU cache first
    if (useGlobalCache) {
      const globalCache = globalGPUCache.getCache();
      if (globalCache) {
        gpuCacheRef.current = globalCache;
        setUseGPUCache(true);
        console.log(`[ClipFilmstrip] Using global GPU cache for clip ${clip.id}`);
        return;
      }
    }

    // Fall back to local GPU cache
    if (!canvasRef.current || gpuCacheRef.current) return;

    try {
      gpuCacheRef.current = new GPUTextureCache(canvasRef.current);
      setUseGPUCache(true);
      console.log(`[ClipFilmstrip] Local GPU texture cache initialized for clip ${clip.id}`);
    } catch (err) {
      console.warn(`[ClipFilmstrip] Failed to initialize GPU cache for clip ${clip.id}, falling back to canvas:`, err);
      setUseGPUCache(false);
    }

    return () => {
      // Only dispose local cache, not global cache
      if (!useGlobalCache && gpuCacheRef.current) {
        gpuCacheRef.current.dispose();
        gpuCacheRef.current = null;
      }

      // Unregister from global cache
      if (useGlobalCache) {
        globalGPUCache.unregisterViewport(componentId);
      }
    };
  }, [useGlobalCache, clip.id, componentId]);

  // ── Extract once on mount (not on zoom) ─────────────────────────────────
  useEffect(() => {
    if (!isVideoSource || !mediaAsset.path || !mediaAsset.duration) return;

    // Only re-extract if the source video or trim points changed
    const extractionKey = `${mediaAsset.path}:${clip.trimIn}:${clip.trimOut}`;
    if (extractionKey === extractionKeyRef.current) return;
    extractionKeyRef.current = extractionKey;

    // Adaptive interval: caps frame count for long videos
    const interval = getExtractionInterval(mediaAsset.duration);

    // Generate dense timestamp grid once
    const allTimestamps = generateTimestampGrid(clip.trimIn, clip.trimOut, interval, mediaAsset.duration);

    if (allTimestamps.length === 0) return;

    // Pre-fill with poster frame so nothing is blank while extracting.
    // Use roundMs() keys so they match what Rust sends back.
    if (mediaAsset.posterFrame) {
      const posterSrc = mediaAsset.posterFrame.startsWith("data:") ? mediaAsset.posterFrame : convertFileSrc(mediaAsset.posterFrame);

      setFrameCache(new Map(allTimestamps.map((t) => [roundMs(t), posterSrc])));
    } else {
      // Even without a poster, initialise empty slots so we know the grid
      setFrameCache(new Map(allTimestamps.map((t) => [roundMs(t), ""])));
    }

    let cancelled = false;
    const videoPath = normalizePathForTauriInvoke(mediaAsset.path);
    const receivedCountRef = { current: 0 };

    // Create channel with callback directly in constructor
    const channel = new Channel<ThumbnailTile>();

    channel.onmessage = async (tile) => {
      if (cancelled) return;

      receivedCountRef.current++;

      // GPU-optimized path: Use decode_frame_gpu for raw RGBA bytes
      if (useGPUCache && gpuCacheRef.current) {
        try {
          const decodeStart = performance.now();

          // Request raw RGBA bytes (no base64 encoding!)
          const rgbaBytes = await invoke<number[]>("decode_frame_gpu", {
            videoPath,
            timeSecs: tile.time,
            width: thumbW,
            height: thumbH,
          });

          const decodeTime = performance.now() - decodeStart;
          const uploadStart = performance.now();

          // Upload to GPU texture cache (once)
          const textureKey = `${mediaAsset.path}:${tile.time}:${thumbW}x${thumbH}`;
          gpuCacheRef.current.uploadTexture(textureKey, new Uint8Array(rgbaBytes), thumbW, thumbH);

          const uploadTime = performance.now() - uploadStart;

          // Track performance metrics
          performanceMetrics.trackTextureUpload(uploadTime);
          performanceMetrics.trackScrubLatency(decodeTime + uploadTime);

          // Store texture key for rendering
          const key = roundMs(tile.time);
          setTextureKeys((prev) => {
            const next = new Map(prev);
            next.set(key, textureKey);
            return next;
          });

          return;
        } catch (err) {
          console.error(`[ClipFilmstrip] GPU upload failed at ${tile.time}s, falling back to canvas:`, err);
          // Fall through to canvas-based rendering
        }
      }

      // Canvas-based fallback path
      // Handle atlas-based tiles
      if (tile.atlas_coords) {
        // Extract thumbnail from atlas sprite sheet
        extractThumbnailFromAtlas(tile.path, tile.atlas_coords)
          .then((dataUrl) => {
            const key = roundMs(tile.time);
            setFrameCache((prev) => {
              const next = new Map(prev);
              next.set(key, dataUrl);
              return next;
            });
          })
          .catch((err) => {
            console.error(`[ClipFilmstrip] Failed to extract atlas tile at ${tile.time}s:`, err);
          });
      } else if (tile.path.startsWith("data:image/rgba;base64,")) {
        // IMMEDIATE PATH: Raw RGBA data URL from backend (no compression!)
        // Convert RGBA to displayable format using canvas
        decodeRgbaDataUrl(tile.path, thumbW, thumbH)
          .then((dataUrl) => {
            const key = roundMs(tile.time);
            setFrameCache((prev) => {
              const next = new Map(prev);
              next.set(key, dataUrl);
              return next;
            });
          })
          .catch((err) => {
            console.error(`[ClipFilmstrip] Failed to decode RGBA tile at ${tile.time}s:`, err);
          });
      } else {
        // Legacy per-frame tile (WebP or file path)
        const src = tile.path.startsWith("data:") ? tile.path : convertFileSrc(tile.path);
        const key = roundMs(tile.time);
        setFrameCache((prev) => {
          const next = new Map(prev);
          next.set(key, src);
          return next;
        });
      }
    };

    // Helper function to decode RGBA data URL to displayable format
    // RGBA format: data:image/rgba;base64,<base64_rgba_bytes>
    // This is the IMMEDIATE path - no compression blocking!
    const decodeRgbaDataUrl = async (dataUrl: string, width: number, height: number): Promise<string> => {
      return new Promise((resolve, reject) => {
        try {
          // Extract base64 data
          const base64Data = dataUrl.replace("data:image/rgba;base64,", "");

          // Decode base64 to binary
          const binaryString = atob(base64Data);
          const bytes = new Uint8ClampedArray(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Create ImageData from RGBA bytes
          const imageData = new ImageData(bytes, width, height);

          // Create canvas and draw ImageData
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          ctx.putImageData(imageData, 0, 0);

          // Convert to data URL (browser handles compression efficiently)
          resolve(canvas.toDataURL("image/webp", 0.9));
        } catch (err) {
          reject(err);
        }
      });
    };

    // Helper function to extract thumbnail from atlas
    const extractThumbnailFromAtlas = async (atlasPath: string, coords: { col: number; row: number; thumb_width: number; thumb_height: number }): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = convertFileSrc(atlasPath);

        img.onload = () => {
          try {
            // Create canvas to extract thumbnail
            const canvas = document.createElement("canvas");
            canvas.width = coords.thumb_width;
            canvas.height = coords.thumb_height;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
              reject(new Error("Failed to get canvas context"));
              return;
            }

            // Extract thumbnail from atlas at (col, row) position
            ctx.drawImage(
              img,
              coords.col * coords.thumb_width, // source x
              coords.row * coords.thumb_height, // source y
              coords.thumb_width, // source width
              coords.thumb_height, // source height
              0,
              0, // dest x, y
              coords.thumb_width, // dest width
              coords.thumb_height, // dest height
            );

            // Convert to data URL
            resolve(canvas.toDataURL("image/webp"));
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => {
          reject(new Error(`Failed to load atlas: ${atlasPath}`));
        };
      });
    };

    channelRef.current = channel; // Keep reference to prevent GC

    console.log(`[ClipFilmstrip] One-time extraction: ${allTimestamps.length} frames ` + `(interval=${interval}s, range=${clip.trimIn.toFixed(1)}-${clip.trimOut.toFixed(1)}s) ` + `size=${thumbW}x${thumbH}`);

    // Single invoke — happens once per clip, not on every zoom
    invoke("decode_frames_streaming", {
      videoPath,
      timestamps: allTimestamps,
      density: DensityLevel.High, // extract at High density once
      width: thumbW,
      height: thumbH,
      duration: mediaAsset.duration,
      onTile: channel,
    })
      .then(() => {
        console.log(`[ClipFilmstrip] Extraction complete, received ${receivedCountRef.current} frames`);
      })
      .catch((err) => {
        if (!cancelled) console.error("[ClipFilmstrip] Extraction failed:", err);
      });

    return () => {
      cancelled = true;
      channelRef.current = null; // Clean up reference
    };

    // NOTE: pixelsPerSecond is intentionally NOT in this dependency array.
    // Zoom changes must NOT trigger re-extraction.
  }, [isVideoSource, mediaAsset.path, mediaAsset.duration, mediaAsset.posterFrame, clip.trimIn, clip.trimOut, thumbW, thumbH, useGPUCache]);

  // ── GPU Rendering (reuse textures, no re-upload) ─────────────────────────
  useEffect(() => {
    if (!useGPUCache || !gpuCacheRef.current || !canvasRef.current || textureKeys.size === 0) return;

    const canvas = canvasRef.current;
    const cache = gpuCacheRef.current;

    // Update canvas dimensions if needed
    if (canvas.width !== clipWidthPx || canvas.height !== stripHeightPx) {
      canvas.width = clipWidthPx;
      canvas.height = stripHeightPx;
    }

    // Register viewport with global cache (if using global cache)
    if (useGlobalCache) {
      const viewportTextureKeys = new Set(textureKeys.values());
      globalGPUCache.registerViewport(componentId, viewportTextureKeys, 10); // High priority for visible clips
    }

    const renderStart = performance.now();

    const renderFrame = () => {
      cache.clear();

      // Calculate visible tiles
      const tileCount = Math.max(1, Math.ceil(clipWidthPx / TILE_WIDTH_PX));

      // Get all texture keys sorted by time
      const sortedKeys = Array.from(textureKeys.entries()).sort((a, b) => a[0] - b[0]);

      if (sortedKeys.length === 0) return;

      // Sample textures for visible tiles
      const tileWidthPx = clipWidthPx / tileCount;
      const step = sortedKeys.length > 1 ? (sortedKeys.length - 1) / (tileCount - 1) : 0;

      for (let i = 0; i < tileCount; i++) {
        const idx = Math.min(Math.round(i * step), sortedKeys.length - 1);
        const [, textureKey] = sortedKeys[idx];
        const x = i * tileWidthPx;

        // Render texture from GPU cache (instant, no upload!)
        cache.renderTexture(textureKey, x, 0, tileWidthPx, stripHeightPx);
      }
    };

    renderFrame();

    const renderTime = performance.now() - renderStart;
    performanceMetrics.trackTextureRender(renderTime);

    // Update GPU memory usage in performance metrics
    if (cache.getStats) {
      const stats = cache.getStats();
      performanceMetrics.updateGPUMemory(parseFloat(stats.memoryMB));
    }

    // Log GPU cache stats periodically
    if (textureKeys.size > 0 && textureKeys.size % 20 === 0) {
      const stats = cache.getStats();
      console.log(`[ClipFilmstrip] GPU cache stats for clip ${clip.id}:`, stats);
    }
  }, [textureKeys, clipWidthPx, stripHeightPx, useGPUCache, useGlobalCache, componentId, clip.id]);

  // ── Sampling (zoom-reactive, zero requests) ──────────────────────────────
  // Tile count is ALWAYS driven by clip width / target tile size (~60px).
  // Each tile slot maps to the nearest cached frame — frames repeat when
  // there are fewer cached frames than tile slots. This keeps tiles at
  // ~60px (consistent with ruler tick spacing) and fills the full clip.
  const visibleTiles = useMemo(() => {
    if (frameCache.size === 0) return [];

    // All cached timestamps sorted — filter out empty placeholders
    const allTimes = Array.from(frameCache.entries())
      .filter(([, src]) => src.length > 0)
      .map(([t]) => t)
      .sort((a, b) => a - b);

    if (allTimes.length === 0) return [];

    // Count unique sources to detect if we're still showing duplicates
    const uniqueSources = new Set(Array.from(frameCache.values()).filter((src) => src.length > 0));
    if (uniqueSources.size <= 3) {
      console.log(`[ClipFilmstrip] visibleTiles: ${uniqueSources.size} unique sources in cache of ${frameCache.size} entries`);
    }

    // Always compute tile count from clip width — never limited by cache size
    const tileCount = Math.max(1, Math.ceil(clipWidthPx / TILE_WIDTH_PX));

    // Map each tile slot to the nearest cached frame
    const sampled: { time: number; src: string }[] = [];
    const step = allTimes.length > 1 ? (allTimes.length - 1) / (tileCount - 1) : 0;

    for (let i = 0; i < tileCount; i++) {
      const idx = Math.min(Math.round(i * step), allTimes.length - 1);
      const t = allTimes[idx];
      sampled.push({ time: t, src: frameCache.get(t)! });
    }

    return sampled;
  }, [frameCache, clipWidthPx]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (isVideoSource && visibleTiles.length > 0) {
    // GPU-accelerated rendering path
    if (useGPUCache && textureKeys.size > 0) {
      return (
        <div
          data-testid="clip-filmstrip-gpu"
          className={cn("overflow-hidden rounded-[2px] border border-black/20 bg-[#0c2730]/40", className)}
          style={{
            height: stripHeightPx,
            width: "100%",
          }}
        >
          <canvas
            ref={canvasRef}
            width={clipWidthPx}
            height={stripHeightPx}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
        </div>
      );
    }

    // Canvas-based fallback rendering path
    const tileWidthPx = clipWidthPx / visibleTiles.length;

    return (
      <div
        data-testid="clip-filmstrip"
        className={cn("overflow-hidden rounded-[2px] border border-black/20 bg-[#0c2730]/40", className)}
        style={{
          height: stripHeightPx,
          width: "100%",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {visibleTiles.map((tile, index) => (
          <img
            key={`${tile.time}-${index}`}
            src={tile.src}
            alt=""
            style={{
              width: tileWidthPx,
              minWidth: 0,
              height: stripHeightPx,
              objectFit: "cover",
              objectPosition: "center",
              flex: "1 1 0",
            }}
            draggable={false}
          />
        ))}
      </div>
    );
  }

  if (mediaAsset.posterFrame) {
    return (
      <div data-testid="clip-filmstrip-fallback" className={cn("relative overflow-hidden rounded-[2px] border border-black/20", className)} style={{ height: stripHeightPx, width: "100%" }}>
        <img src={mediaAsset.posterFrame.startsWith("data:") ? mediaAsset.posterFrame : convertFileSrc(mediaAsset.posterFrame)} alt="" className="absolute inset-0 block h-full w-full object-cover select-none" draggable={false} />
      </div>
    );
  }

  return <div data-testid="clip-filmstrip-empty" className={cn("w-full rounded-[2px] bg-[#0c2730]/60", className)} style={{ height: stripHeightPx }} />;
}
