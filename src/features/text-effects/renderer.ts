import { evaluateScene as engineEvaluateScene, textEffectConfigToScene, defaultConfig as engineDefaultConfig, supportsCtxFilter, supportsOffscreenCanvas, WebGLCompositor, type TextEffectConfig } from "@clypra/engine";
import { TextEffectDefinition } from "./types/types";
import { hasRegisteredEngine, renderRegisteredEffect, _buildConfig } from "./registry";
import { getFontLoader } from "@/core/fonts/FontLoader";

// ─── Shared WebGLCompositor ───────────────────────────────────────────────────
// Platform capability detection (supportsCtxFilter) is now provided by
// @clypra/engine/platform.ts — the single canonical implementation.
// This module no longer maintains its own detection state.

let _compositor: WebGLCompositor | null = null;

function getCompositor(): WebGLCompositor | null {
  if (_compositor !== null) return _compositor;
  if (typeof document === "undefined") return null;
  _compositor = new WebGLCompositor();
  return _compositor.isSupported ? _compositor : null;
}

/**
 * Draw a SceneDocument to the target canvas context.
 *
 * Routes through WebGLCompositor when ctx.filter is unsupported (WKWebView on
 * macOS Tauri). On standard browsers and Windows WebView2, evaluates directly
 * onto the target context with no intermediate allocation.
 */
function drawScene(targetCtx: CanvasRenderingContext2D, cfg: TextEffectConfig, time: number): void {
  const scene = getOrBuildScene(cfg);
  const w = cfg.canvasWidth as number;
  const h = cfg.canvasHeight as number;

  if (!supportsCtxFilter()) {
    // WKWebView: ctx.filter is a no-op. Render to an intermediate canvas then
    // composite via WebGLCompositor which applies blur/bloom as WebGL post-fx.
    const compositor = getCompositor();

    let off: HTMLCanvasElement | OffscreenCanvas;
    if (supportsOffscreenCanvas()) {
      off = new OffscreenCanvas(w, h);
    } else {
      off = document.createElement("canvas");
      off.width = w;
      off.height = h;
    }

    const offCtx = off.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    offCtx.clearRect(0, 0, w, h);
    engineEvaluateScene(scene, time, offCtx as unknown as CanvasRenderingContext2D);

    if (compositor) {
      compositor.renderToContext(targetCtx, off, { blur: 0, bloom: 0, bloomThreshold: 0.6 });
    } else {
      // WebGL also unavailable — flat blit, no blur/bloom post-fx
      targetCtx.clearRect(0, 0, w, h);
      targetCtx.drawImage(off as CanvasImageSource, 0, 0);
    }

    // Release DOM canvas backing store if OffscreenCanvas was unavailable
    if (!(off instanceof OffscreenCanvas)) {
      (off as HTMLCanvasElement).width = 0;
      (off as HTMLCanvasElement).height = 0;
    }
    return;
  }

  // ctx.filter supported — evaluate directly onto the target context
  targetCtx.clearRect(0, 0, w, h);
  engineEvaluateScene(scene, time, targetCtx);
}

// textEffectConfigToScene is pure — cache by config object identity to avoid
// rebuilding the full SceneDocument on every animation frame.
const _sceneCache = new WeakMap<object, ReturnType<typeof textEffectConfigToScene>>();

function getOrBuildScene(cfg: TextEffectConfig) {
  if (_sceneCache.has(cfg)) return _sceneCache.get(cfg)!;
  const scene = textEffectConfigToScene(cfg);
  _sceneCache.set(cfg, scene);
  return scene;
}

/**
 * Build a TextEffectConfig from a TextEffectDefinition + runtime params.
 * Maps width/height (local engine keys) → canvasWidth/canvasHeight (engine keys).
 */
function buildEngineConfig(effect: TextEffectDefinition, text: string, fontSize: number, canvasWidth: number, canvasHeight: number, time?: number, clipStartTime?: number, clipDuration?: number): TextEffectConfig {
  const builtCfg = _buildConfig(effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
  return {
    ...engineDefaultConfig,
    ...builtCfg,
    canvasWidth,
    canvasHeight,
  } as TextEffectConfig;
}

/**
 * Render a text effect onto any 2D canvas context.
 *
 * Uses the full @clypra/engine pipeline (evaluateScene) for API-fetched effects
 * so stroke blur (ctx.filter), glow compositing, bevel, and all post-fx are
 * applied correctly. Locally registered engines (studio-generated classes) are
 * called via their drawFrame() method.
 */
export const renderTextEffectToContext = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, effect: TextEffectDefinition, fontSize: number, _x: number, _y: number, canvasWidth: number, canvasHeight: number, time?: number, clipStartTime?: number, clipDuration?: number) => {
  if (hasRegisteredEngine(effect?.id)) {
    const originalFillText = ctx.fillText.bind(ctx);
    const originalStrokeText = ctx.strokeText.bind(ctx);
    renderRegisteredEffect(ctx, effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
    ctx.fillText = originalFillText;
    ctx.strokeText = originalStrokeText;
    return;
  }

  const cfg = buildEngineConfig(effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
  drawScene(ctx as CanvasRenderingContext2D, cfg, time ?? 0);
};

/**
 * Render a text effect to an HTMLCanvasElement synchronously.
 * For preview, prefer renderTextEffectAsync which waits for fonts first.
 */
export const renderTextEffect = (canvas: HTMLCanvasElement, text: string, effect: TextEffectDefinition, fontSize: number, time?: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = 640;
    canvas.height = 360;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTextEffectToContext(ctx, text, effect, fontSize, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, time);
};

/**
 * Render a text effect to an HTMLCanvasElement after ensuring fonts are loaded.
 *
 * This is the correct entry point for preview rendering:
 * 1. Sets canvas dimensions
 * 2. Pre-loads the required font via FontLoader (deduped, cached)
 * 3. Waits for document.fonts.ready
 * 4. Draws via engineEvaluateScene (full pipeline incl. ctx.filter / WebGL fallback)
 */
export const renderTextEffectAsync = async (canvas: HTMLCanvasElement, text: string, effect: TextEffectDefinition, fontSize: number, time?: number): Promise<void> => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = 640;
  canvas.height = 360;

  const cfg = buildEngineConfig(effect, text, fontSize, canvas.width, canvas.height, time);

  if (effect?.font?.family) {
    try {
      await getFontLoader().ensureFont({
        family: effect.font.family,
        weight: effect.font.weight,
        style: effect.font.style,
      });
    } catch (error) {
      console.warn(`[TextEffects] Failed to pre-load font "${effect.font.family}":`, error);
    }
  }

  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }

  drawScene(ctx, cfg, time ?? 0);
};

/**
 * Render a text effect to a PNG data URL (export / thumbnail use).
 */
export const renderTextEffectToDataURL = (text: string, effect: TextEffectDefinition, fontSize: number, width = 800, height = 400): string => {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  renderTextEffect(offscreen, text, effect, fontSize);
  return offscreen.toDataURL("image/png");
};
