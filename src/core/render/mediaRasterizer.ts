import type { EvaluatedMediaLayer, EvaluatedEffect } from "../evaluation/types";
import { resolveFilterToIR, compileFilterIRToCSS } from "./filterIR";
import { getResourceCache } from "../resources/ResourceCache";
import { CanvasDevice, EffectGraph, EffectEngine } from "@clypra/engine";
import lottie from "lottie-web";
import { useStickersStore } from "../../features/stickers/store/stickersStore";
import { segmentBodyMask } from "../../features/body-effects/segmentation/bodySegmentationWorkerClient";
import { performanceMonitor } from "@/lib/monitoring/PerformanceMonitor";
import type { RasterTarget } from "./rasterizer";

const effectEngine = new EffectEngine();

interface LottieAnimationCacheEntry {
  anim: any;
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  stickerId: string;
  cacheKey?: string;
}

const lottieRenderCache = new Map<string, LottieAnimationCacheEntry>();
let _lastVideoWarnTime = 0;
const VIDEO_WARN_INTERVAL_MS = 5000;

/**
 * Clear all cached Lottie animations and remove their DOM containers.
 * Must be called on project switch to prevent DOM node leaks and stale animation data.
 */
export function clearLottieRenderCache(): void {
  for (const [, entry] of lottieRenderCache) {
    try {
      entry.anim.destroy();
    } catch {
      // Lottie destroy can throw if already cleaned up
    }
    entry.container.remove();
  }
  lottieRenderCache.clear();
}

/**
 * Draw a non-alarming loading placeholder (dark frame with spinner indicator).
 * Used when a video element exists but hasn't loaded yet, or during pool sync.
 */
export function drawLoadingPlaceholder(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(-width / 2, -height / 2, width, height);
}

/**
 * Draw media (video element or ImageBitmap) with source rotation applied.
 *
 * CRITICAL: This handles container metadata rotation (e.g., iPhone portrait videos
 * encoded as 1280×720 with rotation=270° → display as 720×1280 portrait).
 */
export async function drawMediaWithSourceRotation(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
  width: number,
  height: number,
  sourceRotation?: number,
  effects?: EvaluatedEffect[],
  filter?: { id: string; name: string; intensity: number },
  sourceRect?: { x: number; y: number; width: number; height: number },
): Promise<void> {
  ctx.save();
  const isTransposed = sourceRotation === 90 || sourceRotation === 270;
  const drawWidth = isTransposed ? height : width;
  const drawHeight = isTransposed ? width : height;
  const frameCanvas = await renderMediaFrame(source, drawWidth, drawHeight, effects, filter, sourceRect);

  if (sourceRotation && sourceRotation !== 0) {
    ctx.rotate((sourceRotation * Math.PI) / 180);
  }

  ctx.drawImage(frameCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  CanvasDevice.release(frameCanvas);
  ctx.restore();
}

async function imageBitmapToCanvas(bitmap: ImageBitmap, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function renderMediaFrame(
  source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
  width: number,
  height: number,
  effects: EvaluatedEffect[] | undefined,
  filter?: { id: string; name: string; intensity: number },
  sourceRect?: { x: number; y: number; width: number; height: number },
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const bodyEffects = (effects || []).filter((effect) => isBodyRenderer(effect.renderer || effect.effectId));
  const videoEffects = (effects || []).filter((effect) => !isBodyRenderer(effect.renderer || effect.effectId));

  let processedSource = source;
  if (sourceRect && (videoEffects.length > 0 && bodyEffects.length === 0)) {
    // Crop/slice the source to a temporary canvas for MPG WebGL renderer compatibility
    const croppedCanvas = CanvasDevice.acquire(Math.max(1, Math.ceil(sourceRect.width)), Math.max(1, Math.ceil(sourceRect.height)));
    const croppedCtx = croppedCanvas.getContext("2d")!;
    croppedCtx.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, 0, 0, croppedCanvas.width, croppedCanvas.height);
    processedSource = croppedCanvas as any;
  }

  if (videoEffects.length > 0 && bodyEffects.length === 0) {
    try {
      const { buildManifestFromClip, isV2SupportedEffectStack, expandMpgStackEffects, renderMPGFrame } = await import("../mpg");
      const rawStack = videoEffects.map((fx) => ({
        id: fx.effectId,
        type: fx.renderer || fx.effectId,
        params: { ...fx.parameters, intensity: fx.intensity } as Record<string, unknown>,
      }));
      const stack = expandMpgStackEffects(rawStack);

      if (isV2SupportedEffectStack(stack)) {
        const manifest = buildManifestFromClip(
          "rasterizer-frame",
          "Rasterizer Frame",
          { id: "clip-inline", assetId: "source-inline", timelineStartMs: 0, timelineEndMs: 60_000, enabled: true },
          stack.map((fx) => {
            const params = fx.params as Record<string, unknown>;
            const typeLower = fx.type.toLowerCase();
            const intensity = Number(params.intensity ?? 0);
            return {
              ...fx,
              params: {
                ...params,
                brightness: params.brightness ?? (typeLower.includes("brightness") ? intensity : undefined),
                contrast: params.contrast ?? (typeLower.includes("contrast") ? intensity : undefined),
                blur: params.blur ?? params.blurAmount ?? (typeLower.includes("blur") ? intensity * 20 : undefined),
              },
            };
          }),
          { width: w, height: h, assetUri: "inline://source", assetKind: "image" },
        );

        const sourceEl = processedSource instanceof HTMLVideoElement || processedSource instanceof HTMLCanvasElement ? processedSource : await imageBitmapToCanvas(processedSource, w, h);

        const mpgCanvas = await renderMPGFrame(manifest, sourceEl, {
          timelineTimeMs: videoEffects[0]?.localTime ? videoEffects[0].localTime * 1000 : 500,
          width: w,
          height: h,
        });

        if (processedSource !== source && processedSource instanceof HTMLCanvasElement) {
          CanvasDevice.release(processedSource);
        }

        if (filter) {
          const filtered = CanvasDevice.acquire(w, h);
          const fctx = filtered.getContext("2d")!;
          const ir = resolveFilterToIR(filter.id, filter.intensity);
          const cssFilter = compileFilterIRToCSS(ir);
          if (cssFilter) fctx.filter = cssFilter;
          fctx.drawImage(mpgCanvas, 0, 0, w, h);
          return filtered;
        }

        return mpgCanvas;
      }
    } catch (err) {
      if (processedSource !== source && processedSource instanceof HTMLCanvasElement) {
        CanvasDevice.release(processedSource);
      }
      console.warn("[Rasterizer:MPG] V2 path failed, falling back to legacy", err);
    }
  }

  const canvas = CanvasDevice.acquire(w, h);
  const frameCtx = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!frameCtx) return canvas;

  if (typeof frameCtx.setTransform === "function") {
    frameCtx.setTransform(1, 0, 0, 1, 0, 0);
  }
  frameCtx.clearRect(0, 0, canvas.width, canvas.height);

  const cssFilter = buildMediaFilter(filter, effects);
  if (cssFilter) frameCtx.filter = cssFilter;

  try {
    if (sourceRect) {
      frameCtx.drawImage(
        processedSource,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } else {
      frameCtx.drawImage(processedSource, 0, 0, canvas.width, canvas.height);
    }
  } catch (error) {
    console.error(`[Rasterizer] Error drawing video to canvas:`, error);
  }

  frameCtx.filter = "none";

  const bodyMasks = await prepareBodyMasks(canvas, effects, canvas.width, canvas.height);

  for (const effect of effects || []) {
    applyRasterEffect(frameCtx, effect, canvas.width, canvas.height, bodyMasks);
  }

  return canvas;
}

export async function prepareBodyMasks(
  source: HTMLCanvasElement | OffscreenCanvas,
  effects: EvaluatedEffect[] | undefined,
  width: number,
  height: number,
): Promise<Map<string, ImageData>> {
  const result = new Map<string, ImageData>();
  const bodyEffects = (effects || []).filter((effect) => isBodyRenderer(effect.renderer || effect.effectId));

  if (bodyEffects.length === 0) return result;

  try {
    for (const effect of bodyEffects) {
      const maskData = await segmentBodyMask(source as unknown as CanvasImageSource, {
        effectId: effect.effectId,
        renderer: effect.renderer,
        time: effect.localTime,
        width,
        height,
        minConfidence: Number(effect.parameters.minConfidence ?? 0.7),
      });
      if (maskData) {
        result.set(effect.effectId, maskData);
      }
    }
  } catch (err) {
    console.warn("[Rasterizer:BodyMask] Failed to segment body mask:", err);
  }

  return result;
}

function buildMediaFilter(
  filter: { id: string; name: string; intensity: number } | undefined,
  effects: EvaluatedEffect[] | undefined,
): string {
  let cssFilter = "";

  if (filter) {
    const ir = resolveFilterToIR(filter.id, filter.intensity);
    const filterCSS = compileFilterIRToCSS(ir);
    if (filterCSS) {
      cssFilter += filterCSS;
    }
  }

  for (const effect of effects || []) {
    if (effect.intensity <= 0.001) continue;
    const rendererName = normalizeRendererName(effect.renderer || effect.effectId);
    if (rendererName === "blur") {
      const amount = Number(effect.parameters.blur ?? effect.parameters.blurAmount ?? 10) * effect.intensity;
      cssFilter += ` blur(${amount}px)`;
    }
  }

  return cssFilter.trim();
}

function applyRasterEffect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effect: EvaluatedEffect,
  width: number,
  height: number,
  bodyMasks: Map<string, ImageData>,
): void {
  if (effect.intensity <= 0.001) return;

  performanceMonitor.startTimer(`rasterizer.effect_${effect.renderer || effect.effectId}`);
  performanceMonitor.increment("rasterizer.effects_applied");

  const renderer = normalizeRendererName(effect.renderer || effect.effectId);

  if (isBodyRenderer(renderer)) {
    switch (renderer) {
      case "body_segmentation_glow":
      case "body_glow":
        renderBodySegmentationGlow(ctx, effect, width, height, bodyMasks.get(effect.effectId));
        break;
      case "body_outline":
        renderBodyOutline(ctx, effect, width, height, bodyMasks.get(effect.effectId));
        break;
      case "body_particles":
        renderBodyParticles(ctx, effect, width, height, bodyMasks.get(effect.effectId));
        break;
    }
  } else {
    try {
      const graphDef = {
        schemaVersion: "2.0.0",
        graphId: effect.effectId,
        name: effect.renderer || effect.effectId,
        nodes: [
          { id: "input-node", type: "source", params: {} },
          { id: "effect-node", type: renderer === "grain" ? "film_grain" : renderer, params: effect.parameters },
        ],
        connections: [{ fromNode: "input-node", fromOutput: "output", toNode: "effect-node", toInput: "input" }],
      };

      const graph = new EffectGraph(graphDef);
      effectEngine.loadGraph(graph);

      const sourceCopy = CanvasDevice.acquire(width, height);
      const sourceCopyCtx = sourceCopy.getContext("2d")!;
      sourceCopyCtx.clearRect(0, 0, width, height);
      sourceCopyCtx.drawImage(ctx.canvas as any, 0, 0, width, height);

      effectEngine.render(ctx as any, effect.localTime || 0, sourceCopy);

      CanvasDevice.release(sourceCopy);
    } catch (err) {
      console.warn("[Rasterizer:EffectGraph] Failed to execute through EffectEngine, falling back to legacy", err);
      switch (renderer) {
        case "glitch":
          renderGlitch(ctx, effect, width, height);
          break;
        case "rgb_split":
        case "chromatic_aberration":
        case "chromatic":
          renderRGBSplit(ctx, effect, width, height);
          break;
        case "pixelate":
          renderPixelate(ctx, effect, width, height);
          break;
        case "scanlines":
          renderScanlines(ctx, effect, width, height);
          break;
        case "film_grain":
        case "grain":
          renderFilmGrain(ctx, effect, width, height);
          break;
        case "vignette":
          renderVignette(ctx, effect, width, height);
          break;
        case "glow":
          renderFrameGlow(ctx, effect, width, height);
          break;
      }
    }
  }

  performanceMonitor.endTimer(`rasterizer.effect_${effect.renderer || effect.effectId}`);
}

function normalizeRendererName(value: string): string {
  return value.replace(/^fx-/, "").replace(/-/g, "_").toLowerCase();
}

function isBodyRenderer(value: string): boolean {
  const renderer = normalizeRendererName(value);
  return renderer === "body_segmentation_glow" || renderer === "body_glow" || renderer === "body_outline" || renderer === "body_particles";
}

function renderPixelate(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const pixelSize = Math.max(2, Math.floor(Number(effect.parameters.pixelSize ?? 18) * effect.intensity));
  const w = Math.max(4, Math.floor(width / pixelSize));
  const h = Math.max(4, Math.floor(height / pixelSize));
  const temp = CanvasDevice.acquire(w, h);
  const tempCtx = temp.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!tempCtx) {
    CanvasDevice.release(temp);
    return;
  }

  tempCtx.drawImage(ctx.canvas as any, 0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(temp, 0, 0, width, height);
  ctx.restore();
  CanvasDevice.release(temp);
}

function renderRGBSplit(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const shift = Number(effect.parameters.rgbSplit ?? effect.parameters.splitDistance ?? 8) * effect.intensity;
  if (shift < 0.25) return;
  const temp = CanvasDevice.acquire(width, height);
  const tempCtx = temp.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!tempCtx) {
    CanvasDevice.release(temp);
    return;
  }

  tempCtx.drawImage(ctx.canvas as any, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(0.65, 0.25 + effect.intensity * 0.35);
  ctx.drawImage(temp, -shift, 0);
  ctx.drawImage(temp, shift, 0);
  ctx.restore();
  CanvasDevice.release(temp);
}

function renderGlitch(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const amount = Math.max(1, Number(effect.parameters.glitchIntensity ?? 24) * effect.intensity);
  const slices = Math.max(1, Math.floor(Number(effect.parameters.sliceCount ?? 8) * effect.intensity));
  const seed = Math.floor((effect.localTime || 0) * 24);

  for (let i = 0; i < slices; i++) {
    const y = Math.floor(pseudoRandom(seed + i * 13) * height);
    const sliceHeight = Math.max(1, Math.floor(4 + pseudoRandom(seed + i * 19) * 24));
    const offset = Math.floor((pseudoRandom(seed + i * 29) - 0.5) * amount * 2);
    try {
      const imageData = ctx.getImageData(0, y, width, Math.min(sliceHeight, height - y));
      ctx.putImageData(imageData, offset, y);
    } catch {
      break;
    }
  }

  renderRGBSplit(ctx, { ...effect, parameters: { ...effect.parameters, splitDistance: amount * 0.4 } }, width, height);
}

function renderScanlines(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const count = Math.max(20, Number(effect.parameters.scanlineCount ?? 120));
  const spacing = height / count;
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.45, effect.intensity * 0.28)})`;
  for (let y = 0; y < height; y += spacing) {
    ctx.fillRect(0, y, width, Math.max(1, spacing * 0.45));
  }
  ctx.restore();
}

function renderFilmGrain(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const density = Math.floor((width * height) / 180);
  const count = Math.floor(density * effect.intensity * Number(effect.parameters.grainIntensity ?? 1));
  const seed = Math.floor((effect.localTime || 0) * 30);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = pseudoRandom(seed + i * 3) * width;
    const y = pseudoRandom(seed + i * 7) * height;
    const alpha = 0.04 + pseudoRandom(seed + i * 11) * 0.08;
    ctx.fillStyle = pseudoRandom(seed + i * 17) > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
}

function renderVignette(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const radius = Math.sqrt(width * width + height * height) / 2;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.2, width / 2, height / 2, radius);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.58, `rgba(0,0,0,${effect.intensity * 0.14})`);
  gradient.addColorStop(1, `rgba(0,0,0,${effect.intensity * 0.86})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function renderFrameGlow(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, effect: EvaluatedEffect, width: number, height: number): void {
  const color = String(effect.parameters.glowColor ?? "#00ffff");
  const blur = Number(effect.parameters.glowRadius ?? 20) * effect.intensity;
  const temp = CanvasDevice.acquire(width, height);
  const tempCtx = temp.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!tempCtx) {
    CanvasDevice.release(temp);
    return;
  }

  tempCtx.drawImage(ctx.canvas as any, 0, 0);
  tempCtx.globalCompositeOperation = "source-in";
  tempCtx.fillStyle = color;
  tempCtx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(0.9, effect.intensity);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(temp, 0, 0);
  ctx.filter = "none";
  ctx.restore();
  CanvasDevice.release(temp);
}

function renderBodySegmentationGlow(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effect: EvaluatedEffect,
  width: number,
  height: number,
  providedMask?: ImageData,
): void {
  const original = CanvasDevice.acquire(width, height);
  const originalCtx = original.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!originalCtx) {
    CanvasDevice.release(original);
    return;
  }
  originalCtx.drawImage(ctx.canvas as any, 0, 0);

  const mask = providedMask ? imageDataToCanvas(providedMask) : buildLocalBodyMask(originalCtx, width, height);
  const maskCtx = mask.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!maskCtx) {
    CanvasDevice.release(mask);
    CanvasDevice.release(original);
    return;
  }

  const color = String(effect.parameters.glowColor ?? "#00ffff");
  const radius = Math.max(2, Number(effect.parameters.glowRadius ?? 22) * effect.intensity);
  const alpha = Math.min(1, Number(effect.parameters.glowIntensity ?? 0.8) * effect.intensity);
  maskCtx.save();
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = color;
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(mask, 0, 0);
  ctx.filter = `blur(${Math.max(1, radius * 0.45)}px)`;
  ctx.drawImage(mask, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(0.35, alpha * 0.35);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  CanvasDevice.release(mask);
  CanvasDevice.release(original);
}

function renderBodyOutline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effect: EvaluatedEffect,
  width: number,
  height: number,
  providedMask?: ImageData,
): void {
  const source = CanvasDevice.acquire(width, height);
  const sourceCtx = source.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!sourceCtx) {
    CanvasDevice.release(source);
    return;
  }
  sourceCtx.drawImage(ctx.canvas as any, 0, 0);

  const mask = providedMask ? imageDataToCanvas(providedMask) : buildLocalBodyMask(sourceCtx, width, height);
  const color = String(effect.parameters.outlineColor ?? effect.parameters.glowColor ?? "#ffffff");
  const thickness = Math.max(1, Number(effect.parameters.thickness ?? 5) * effect.intensity);

  const maskCtx = mask.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (maskCtx) {
    maskCtx.save();
    maskCtx.globalCompositeOperation = "source-in";
    maskCtx.fillStyle = color;
    maskCtx.fillRect(0, 0, width, height);
    maskCtx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(1, effect.intensity);
  ctx.filter = `blur(${thickness}px)`;
  ctx.drawImage(mask, 0, 0);
  ctx.filter = "none";
  ctx.drawImage(mask, -thickness * 0.5, 0);
  ctx.drawImage(mask, thickness * 0.5, 0);
  ctx.drawImage(mask, 0, -thickness * 0.5);
  ctx.drawImage(mask, 0, thickness * 0.5);
  ctx.restore();

  CanvasDevice.release(mask);
  CanvasDevice.release(source);
}

function renderBodyParticles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effect: EvaluatedEffect,
  width: number,
  height: number,
  providedMask?: ImageData,
): void {
  const source = CanvasDevice.acquire(width, height);
  const sourceCtx = source.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!sourceCtx) {
    CanvasDevice.release(source);
    return;
  }
  sourceCtx.drawImage(ctx.canvas as any, 0, 0);

  const mask = providedMask ? imageDataToCanvas(providedMask) : buildLocalBodyMask(sourceCtx, width, height);
  const maskCtx = mask.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!maskCtx) {
    CanvasDevice.release(mask);
    CanvasDevice.release(source);
    return;
  }

  let maskData: ImageData | null = null;
  try {
    maskData = maskCtx.getImageData(0, 0, width, height);
  } catch {
    maskData = null;
  }

  const color = String(effect.parameters.particleColor ?? effect.parameters.glowColor ?? "#00ffff");
  const count = Math.floor(Number(effect.parameters.particleCount ?? 120) * effect.intensity);
  const seed = Math.floor((effect.localTime || 0) * 24);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(0.85, 0.25 + effect.intensity * 0.6);

  for (let i = 0; i < count; i++) {
    const x = Math.floor(pseudoRandom(seed + i * 37) * width);
    const y = Math.floor(pseudoRandom(seed + i * 43) * height);
    const idx = (y * width + x) * 4 + 3;
    if (maskData && maskData.data[idx] < 64) continue;
    const drift = Math.sin((effect.localTime + i) * 2.1) * 8 * effect.intensity;
    const size = 1 + pseudoRandom(seed + i * 53) * 3;
    ctx.beginPath();
    ctx.arc(x + drift, y - pseudoRandom(seed + i * 59) * 20 * effect.intensity, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  CanvasDevice.release(mask);
  CanvasDevice.release(source);
}

function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement | OffscreenCanvas {
  const canvas = CanvasDevice.acquire(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function buildLocalBodyMask(
  sourceCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  const mask = CanvasDevice.acquire(width, height);
  const maskCtx = mask.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!maskCtx) return mask;

  try {
    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let totalLuma = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 16) {
      totalLuma += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      samples++;
    }
    const avgLuma = samples > 0 ? totalLuma / samples : 96;
    const threshold = Math.max(18, Math.min(180, avgLuma * 0.78));

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      const confidence = alpha > 8 && (luma > threshold || chroma > 28) ? 255 : 0;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = confidence;
    }

    maskCtx.putImageData(imageData, 0, 0);
  } catch {
    maskCtx.drawImage(sourceCtx.canvas as any, 0, 0);
    maskCtx.globalCompositeOperation = "source-in";
    maskCtx.fillStyle = "#ffffff";
    maskCtx.fillRect(0, 0, width, height);
  }

  return mask;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export async function rasterizeMediaLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: EvaluatedMediaLayer,
  width: number,
  height: number,
  target: RasterTarget,
  projectWidth?: number,
  projectHeight?: number,
): Promise<void> {
  performanceMonitor.startTimer(`rasterizer.media_${layer.mediaType}`);

  // Note: All media layers are guaranteed to have a conform record (via initialization
  // and project deserialization migration). Legacy crop Math is discarded in favor of conform.
  const sourceRect = undefined;


  try {
    if (layer.clipKind === "sticker") {
      const stickerId = layer.stickerSourceId || layer.mediaId.replace("sticker-", "");
      let cachedSticker = useStickersStore.getState().getCachedSticker(stickerId);
      if (!cachedSticker) {
        await useStickersStore.getState().initializeCache();
        cachedSticker = useStickersStore.getState().getCachedSticker(stickerId);
      }

      const stickerFormat = "lottie";
      const lottieSourcePath = cachedSticker?.localAnimationPath ?? layer.stickerAnimationPath;

      if (stickerFormat === "lottie" && lottieSourcePath) {
        let cacheEntry = lottieRenderCache.get(layer.clipId);

        if (!cacheEntry || cacheEntry.stickerId !== stickerId) {
          if (cacheEntry) {
            cacheEntry.anim.destroy();
            cacheEntry.container.remove();
          }

          try {
            const { stickerCacheManager } = await import("@/features/stickers/cache/stickerCache");
            let absoluteLottiePath = lottieSourcePath;
            if (!absoluteLottiePath.startsWith("/") && !absoluteLottiePath.startsWith("file:") && !absoluteLottiePath.startsWith("asset://")) {
              const { appCacheDir, join } = await import("@tauri-apps/api/path");
              const appCache = await appCacheDir();
              absoluteLottiePath = await join(appCache, absoluteLottiePath);
            }

            const lottieData = await stickerCacheManager.readLottieJson(absoluteLottiePath);

            const container = document.createElement("div");
            container.style.width = `${width}px`;
            container.style.height = `${height}px`;
            container.style.position = "absolute";
            container.style.left = "-9999px";
            container.style.top = "-9999px";
            document.body.appendChild(container);

            const anim = lottie.loadAnimation({
              container,
              renderer: "canvas",
              autoplay: false,
              loop: true,
              animationData: JSON.parse(JSON.stringify(lottieData)),
            });

            anim.goToAndStop(0, true);
            await Promise.resolve();

            const canvas = container.querySelector("canvas") as HTMLCanvasElement;
            if (canvas) {
              cacheEntry = { anim, canvas, container, stickerId };
              lottieRenderCache.set(layer.clipId, cacheEntry);
            }
          } catch (err) {
            console.error("[Rasterizer] Failed to load Lottie animation:", err);
          }
        }

        if (cacheEntry) {
          const totalFrames = cacheEntry.anim.totalFrames;
          const frameRate = cacheEntry.anim.frameRate || 30;
          const speed = layer.stickerSettings?.speed ?? 1.0;
          const loop = layer.stickerSettings?.loop ?? true;

          let frame = Math.floor(layer.sourceTime * speed * frameRate);
          if (loop) {
            frame = frame % totalFrames;
          } else {
            frame = Math.min(frame, totalFrames - 1);
          }

          cacheEntry.anim.goToAndStop(frame, true);
          await Promise.resolve();

          await drawMediaWithSourceRotation(ctx, cacheEntry.canvas, width, height, layer.sourceRotation, layer.effects, layer.filter, sourceRect);
          return;
        }
      }
    }

    if (layer.mediaType === "video" && target.videoElements) {
      const key = `${layer.clipId}-${layer.mediaId}`;
      const video = target.videoElements.get(key);

      if (video) {
        if (video.readyState >= 2) {
          performanceMonitor.increment("rasterizer.video_element_hit");
          await drawMediaWithSourceRotation(ctx, video, width, height, layer.sourceRotation, layer.effects, layer.filter, sourceRect);
          performanceMonitor.endTimer(`rasterizer.media_${layer.mediaType}`);
          return;
        }
        performanceMonitor.increment("rasterizer.video_element_loading");
        drawLoadingPlaceholder(ctx, width, height);
        performanceMonitor.endTimer(`rasterizer.media_${layer.mediaType}`);
        return;
      } else {
        const now = performance.now();
        if (now - _lastVideoWarnTime > VIDEO_WARN_INTERVAL_MS) {
          _lastVideoWarnTime = now;
          console.warn(`[Rasterizer] No video element for clip ${layer.clipId} (key: ${key})`);
          if (target.videoElements.size > 0) {
            const availableKeys = Array.from(target.videoElements.keys()).filter((k) => k.includes(layer.mediaId));
            console.warn(`[Rasterizer] Available keys for mediaId ${layer.mediaId}:`, availableKeys);
          }
        }
      }
    }

    let imageBitmap: ImageBitmap | null = null;

    const resolvedHandle = target.resourceHandleMap?.get(layer.layerId) ?? layer.resourceHandle;
    if (resolvedHandle) {
      const resourceCache = getResourceCache();
      const resource = resourceCache.get(resolvedHandle);

      if (resource && resource.data instanceof ImageBitmap) {
        performanceMonitor.increment("rasterizer.resource_cache_hit");
        imageBitmap = resource.data;
      } else {
        performanceMonitor.increment("rasterizer.resource_cache_miss");
        console.warn(`[Rasterizer] Resource handle ${resolvedHandle} not found or not ImageBitmap`);
      }
    } else if (layer.mediaType === "image") {
      console.warn(`[Rasterizer] No resourceHandle for image clip ${layer.clipId}, falling back to fetch`);
    }

    if (!imageBitmap) {
      if (layer.mediaType === "video") {
        const now = performance.now();
        if (now - _lastVideoWarnTime > VIDEO_WARN_INTERVAL_MS) {
          _lastVideoWarnTime = now;
          console.warn(`[Rasterizer] No video element for clip ${layer.clipId} — video pool may not have synced yet`);
        }
        drawLoadingPlaceholder(ctx, width, height);
        performanceMonitor.endTimer(`rasterizer.media_${layer.mediaType}`);
        return;
      }

      const response = await fetch(layer.sourcePath);
      const blob = await response.blob();
      imageBitmap = await createImageBitmap(blob);
    }

    await drawMediaWithSourceRotation(ctx, imageBitmap, width, height, layer.sourceRotation, layer.effects, layer.filter, sourceRect);

    if (!resolvedHandle && imageBitmap) {
      imageBitmap.close();
    }

    performanceMonitor.endTimer(`rasterizer.media_${layer.mediaType}`);
  } catch (error) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-width / 2, -height / 2, width, height);

    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(-width / 2, -height / 2, width, height);

    ctx.save();
    ctx.fillStyle = "#ff4444";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Media decode error", 0, -10);
    ctx.font = "10px monospace";
    ctx.fillStyle = "#ff8888";
    ctx.fillText(layer.mediaType === "video" ? "Missing video element" : "Load failed", 0, 10);
    ctx.restore();

    performanceMonitor.increment("rasterizer.media_decode_error");
    performanceMonitor.endTimer(`rasterizer.media_${layer.mediaType}`);
    console.error(`[Rasterizer] Failed to render media layer:`, error);
  }
}
