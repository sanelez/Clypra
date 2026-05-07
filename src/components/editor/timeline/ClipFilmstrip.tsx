import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { normalizePathForTauriInvoke } from "../../../lib/tauri"
import { generateTimestampGrid } from "../../../lib/timelineUtils"
import { cn } from "@/lib/utils"
import { DensityLevel } from "../../../types"
import type { Clip, MediaAsset, ThumbnailTile } from "../../../types"

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic|heif|avif)$/i

/** Fixed visual tile width — never changes with zoom */
const TILE_WIDTH_PX = 60

/**
 * Dense extraction interval — extract once at this density on mount.
 * 0.5s means one frame every 0.5 seconds — enough for any zoom level.
 * At 60px per tile, you'd need >120px/s zoom to need denser than this.
 */
const EXTRACTION_INTERVAL = 0.5

/**
 * No-op kept for test compatibility. The CapCut-style architecture manages
 * its own in-memory frame cache per component instance.
 */
export function clearFilmstripFrameCache(): void {}

export interface ClipFilmstripProps {
  clip: Clip
  mediaAsset: MediaAsset
  clipWidthPx: number
  pixelsPerSecond: number
  stripHeightPx?: number
  className?: string
}

/**
 * Round a timestamp to millisecond precision for consistent Map key lookups.
 * Both the pre-fill and the Rust callback use this to ensure matching keys.
 */
function roundMs(t: number): number {
  return Math.round(t * 1000) / 1000
}

/**
 * ClipFilmstrip renders a filmstrip of thumbnail tiles for a video clip.
 *
 * CapCut-style architecture:
 * - **Extract once on import**: Generates a dense 0.5s grid and invokes
 *   `decode_frames_streaming` exactly ONCE per clip (or when trim changes).
 * - **Zoom = pure sampling**: Zoom changes compute how many 60px tiles fit,
 *   then sample every Nth frame from the existing cache. Zero Rust calls.
 * - **Trim = re-extract**: Only trimIn/trimOut changes trigger a new extraction.
 */
export function ClipFilmstrip({
  clip,
  mediaAsset,
  clipWidthPx,
  pixelsPerSecond,
  stripHeightPx = 40,
  className,
}: ClipFilmstripProps) {
  // ALL extracted frames — populated once on mount, never cleared on zoom
  const [frameCache, setFrameCache] = useState<Map<number, string>>(new Map())
  const extractionKeyRef = useRef("")

  const isVideoSource = useMemo(() => {
    const path = mediaAsset.path ?? ""
    return mediaAsset.type === "video" && path.length > 0 && !IMAGE_EXT.test(path)
  }, [mediaAsset.type, mediaAsset.path])

  const resolutionTier =
    typeof window !== "undefined" && window.devicePixelRatio >= 1.5 ? "2x" : "1x"
  const [thumbW, thumbH] = resolutionTier === "2x" ? [120, 80] : [60, 40]

  // ── Extract once on mount (not on zoom) ─────────────────────────────────
  useEffect(() => {
    if (!isVideoSource || !mediaAsset.path || !mediaAsset.duration) return

    // Only re-extract if the source video or trim points changed
    const extractionKey = `${mediaAsset.path}:${clip.trimIn}:${clip.trimOut}`
    if (extractionKey === extractionKeyRef.current) return
    extractionKeyRef.current = extractionKey

    // Generate dense timestamp grid once
    const allTimestamps = generateTimestampGrid(
      clip.trimIn,
      clip.trimOut,
      EXTRACTION_INTERVAL, // 0.5s — dense enough for all zoom levels
      mediaAsset.duration
    )

    if (allTimestamps.length === 0) return

    // Pre-fill with poster frame so nothing is blank while extracting.
    // Use roundMs() keys so they match what Rust sends back.
    if (mediaAsset.posterFrame) {
      const posterSrc = mediaAsset.posterFrame.startsWith("data:")
        ? mediaAsset.posterFrame
        : convertFileSrc(mediaAsset.posterFrame)

      setFrameCache(new Map(allTimestamps.map(t => [roundMs(t), posterSrc])))
    } else {
      // Even without a poster, initialise empty slots so we know the grid
      setFrameCache(new Map(allTimestamps.map(t => [roundMs(t), ""])))
    }

    let cancelled = false
    const videoPath = normalizePathForTauriInvoke(mediaAsset.path)
    const channel = new Channel<ThumbnailTile>()
    let receivedCount = 0

    // As each frame arrives from Rust, slot it into the cache
    channel.onmessage = (tile) => {
      if (cancelled) return
      receivedCount++
      const src = tile.path.startsWith("data:")
        ? tile.path
        : convertFileSrc(tile.path)

      // Use rounded key for consistency with the pre-fill
      const key = roundMs(tile.time)

      if (receivedCount <= 3) {
        console.log(
          `[ClipFilmstrip] Frame #${receivedCount}: time=${tile.time} key=${key} path=${tile.path.slice(0, 80)}...`
        )
      }

      setFrameCache(prev => {
        const next = new Map(prev)
        next.set(key, src)
        return next
      })
    }

    console.log(
      `[ClipFilmstrip] One-time extraction: ${allTimestamps.length} frames ` +
      `(interval=${EXTRACTION_INTERVAL}s, range=${clip.trimIn.toFixed(1)}-${clip.trimOut.toFixed(1)}s) ` +
      `size=${thumbW}x${thumbH}`
    )

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
        console.log(`[ClipFilmstrip] Extraction complete, received ${receivedCount} frames`)
      })
      .catch(err => {
        if (!cancelled) console.error("[ClipFilmstrip] Extraction failed:", err)
      })

    return () => { cancelled = true }

  // NOTE: pixelsPerSecond is intentionally NOT in this dependency array.
  // Zoom changes must NOT trigger re-extraction.
  }, [
    isVideoSource,
    mediaAsset.path,
    mediaAsset.duration,
    mediaAsset.posterFrame,
    clip.trimIn,
    clip.trimOut,
    thumbW,
    thumbH,
  ])

  // ── Sampling (zoom-reactive, zero requests) ──────────────────────────────
  // Tile count is ALWAYS driven by clip width / target tile size (~60px).
  // Each tile slot maps to the nearest cached frame — frames repeat when
  // there are fewer cached frames than tile slots. This keeps tiles at
  // ~60px (consistent with ruler tick spacing) and fills the full clip.
  const visibleTiles = useMemo(() => {
    if (frameCache.size === 0) return []

    // All cached timestamps sorted — filter out empty placeholders
    const allTimes = Array.from(frameCache.entries())
      .filter(([, src]) => src.length > 0)
      .map(([t]) => t)
      .sort((a, b) => a - b)

    if (allTimes.length === 0) return []

    // Always compute tile count from clip width — never limited by cache size
    const tileCount = Math.max(1, Math.ceil(clipWidthPx / TILE_WIDTH_PX))

    // Map each tile slot to the nearest cached frame
    const sampled: { time: number; src: string }[] = []
    const step = allTimes.length > 1
      ? (allTimes.length - 1) / (tileCount - 1)
      : 0

    for (let i = 0; i < tileCount; i++) {
      const idx = Math.min(Math.round(i * step), allTimes.length - 1)
      const t = allTimes[idx]
      sampled.push({ time: t, src: frameCache.get(t)! })
    }

    return sampled
  }, [frameCache, clipWidthPx])

  // ── Render ───────────────────────────────────────────────────────────────
  if (isVideoSource && visibleTiles.length > 0) {
    // Each tile = clipWidth / tileCount — always fills the full clip
    const tileWidthPx = clipWidthPx / visibleTiles.length

    return (
      <div
        data-testid="clip-filmstrip"
        className={cn(
          "overflow-hidden rounded-[2px] border border-black/20 bg-[#0c2730]/40",
          className
        )}
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
    )
  }

  if (mediaAsset.posterFrame) {
    return (
      <div
        data-testid="clip-filmstrip-fallback"
        className={cn(
          "relative overflow-hidden rounded-[2px] border border-black/20",
          className
        )}
        style={{ height: stripHeightPx, width: "100%" }}
      >
        <img
          src={
            mediaAsset.posterFrame.startsWith("data:")
              ? mediaAsset.posterFrame
              : convertFileSrc(mediaAsset.posterFrame)
          }
          alt=""
          className="absolute inset-0 block h-full w-full object-cover select-none"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      data-testid="clip-filmstrip-empty"
      className={cn("w-full rounded-[2px] bg-[#0c2730]/60", className)}
      style={{ height: stripHeightPx }}
    />
  )
}
