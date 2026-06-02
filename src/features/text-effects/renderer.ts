import { evaluateScene, textEffectConfigToScene, defaultConfig as engineDefaultConfig, WebGLCompositor, type TextEffectConfig } from "@clypra/engine";
import { TextEffectDefinition } from "./types/types";
import { hasRegisteredEngine, renderRegisteredEffect, _buildConfig } from "./registry";

// ─── ctx.filter support detection ────────────────────────────────────────────
// Tauri WebView (WKWebView on macOS) does not support ctx.filter, which the
// engine uses for stroke blur and glow effects. Detect once at module load and
// use the WebGLCompositor workaround when unsupported.
let _ctxFilterSupported: boolean | null = null;
let _compositor: InstanceType<typeof WebGLCompositor> | null = null;

function isCtxFilterSupported(): boolean {
  if (_ctxFilterSupported !== null) return _ctxFilterSupported;
  try {
    const test = document.createElement("canvas").getContext("2d")!;
    test.filter = "blur(4px)";
    _ctxFilterSupported = test.filter !== "none" && test.filter !== "" && test.filter !== "blur(4px)";
    // Some WebViews accept the assignment silently but don't actually apply it —
    // check if the filter string round-trips correctly.
    _ctxFilterSupported = test.filter.includes("blur");
  } catch {
    _ctxFilterSupported = false;
  }
  return _ctxFilterSupported;
}

function getCompositor(): InstanceType<typeof WebGLCompositor> | null {
  if (_compositor !== null) return _compositor;
  _compositor = new WebGLCompositor();
  return _compositor.isSupported ? _compositor : null;
}

/**
 * Draw an evaluated scene to the target canvas.
 * Routes through WebGLCompositor when ctx.filter is unsupported (Tauri WebView).
 */
function drawScene(targetCtx: CanvasRenderingContext2D, cfg: TextEffectConfig, time: number): void {
  const scene = getOrBuildScene(cfg);
  const w = cfg.canvasWidth as number;
  const h = cfg.canvasHeight as number;

  if (!isCtxFilterSupported()) {
    // ctx.filter unsupported — render to OffscreenCanvas first, then composite
    // via WebGLCompositor which applies blur/glow as WebGL post-fx.
    const compositor = getCompositor();
    const off = new OffscreenCanvas(w, h);
    const offCtx = off.getContext("2d") as OffscreenCanvasRenderingContext2D;
    offCtx.clearRect(0, 0, w, h);
    evaluateScene(scene, time, offCtx as unknown as CanvasRenderingContext2D);

    if (compositor) {
      compositor.renderToContext(targetCtx, off, { blur: 0, bloom: 0, bloomThreshold: 0.6 });
    } else {
      // WebGL also unsupported — draw flat (no blur/glow, best we can do)
      targetCtx.clearRect(0, 0, w, h);
      targetCtx.drawImage(off, 0, 0);
    }
    return;
  }

  // ctx.filter is supported — evaluate directly onto the target context
  targetCtx.clearRect(0, 0, w, h);
  evaluateScene(scene, time, targetCtx);
}

// textEffectConfigToScene is pure — cache by config identity to avoid rebuilding
// on every animation frame.
const _sceneCache = new WeakMap<object, ReturnType<typeof textEffectConfigToScene>>();

function getOrBuildScene(cfg: TextEffectConfig) {
  if (_sceneCache.has(cfg)) return _sceneCache.get(cfg)!;
  const scene = textEffectConfigToScene(cfg);
  _sceneCache.set(cfg, scene);
  return scene;
}

/**
 * Build the engine config from a TextEffectDefinition + runtime params.
 * Correctly maps width/height → canvasWidth/canvasHeight for the engine.
 */
function buildEngineConfig(effect: TextEffectDefinition, text: string, fontSize: number, canvasWidth: number, canvasHeight: number, time?: number, clipStartTime?: number, clipDuration?: number): TextEffectConfig {
  const builtCfg = _buildConfig(effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
  return {
    ...engineDefaultConfig,
    ...builtCfg,
    // _buildConfig writes to width/height (legacy local-engine keys).
    // The published engine uses canvasWidth/canvasHeight for text centering.
    canvasWidth,
    canvasHeight,
  } as TextEffectConfig;
}

/**
 * Core Canvas 2D Text Effects Rendering Context Engine.
 * Renders full text layers onto any rendering context.
 *
 * Uses evaluateScene (the correct full pipeline) for API-fetched effects so
 * that stroke blur (ctx.filter), glow compositing, bevel, and all other
 * post-fx are applied correctly.
 */
export const renderTextEffectToContext = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, effect: TextEffectDefinition, fontSize: number, _x: number, _y: number, canvasWidth: number, canvasHeight: number, time?: number, clipStartTime?: number, clipDuration?: number) => {
  // ── Locally registered engine (studio-generated class) ────────────────────
  // These are registered via register() in registry.ts and handle their own
  // animation interception internally.
  if (hasRegisteredEngine(effect?.id)) {
    const originalFillText = ctx.fillText;
    const originalStrokeText = ctx.strokeText;
    renderRegisteredEffect(ctx, effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
    ctx.fillText = originalFillText;
    ctx.strokeText = originalStrokeText;
    return;
  }

  // ── @clypra/engine pipeline (all API-fetched effects) ─────────────────────
  // Routes through drawScene which detects ctx.filter support and falls back
  // to WebGLCompositor when running inside Tauri's WKWebView.
  const cfg = buildEngineConfig(effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
  drawScene(ctx as CanvasRenderingContext2D, cfg, time ?? 0);
};

/**
 * Render a text effect to an HTMLCanvasElement synchronously.
 * Canvas must be sized correctly before calling.
 *
 * For preview use, prefer renderTextEffectAsync which waits for fonts first.
 */
export const renderTextEffect = (canvas: HTMLCanvasElement, text: string, effect: TextEffectDefinition, fontSize: number, time?: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Size must be set before drawing — engine centers relative to canvas dimensions.
  // Only reset if not already sized to avoid clearing a pre-sized canvas.
  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = 640;
    canvas.height = 360;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTextEffectToContext(ctx, text, effect, fontSize, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, time);
};

/**
 * Render a text effect to an HTMLCanvasElement, waiting for fonts first.
 *
 * This is the correct entry point for preview rendering. It:
 * 1. Sets canvas dimensions
 * 2. Injects the required Google Font if needed
 * 3. Waits for the font to load
 * 4. Draws via evaluateScene (full engine pipeline including ctx.filter)
 * 5. Re-draws after document.fonts.ready to catch any late-loading variants
 */
export const renderTextEffectAsync = async (canvas: HTMLCanvasElement, text: string, effect: TextEffectDefinition, fontSize: number, time?: number): Promise<void> => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Step 1 — Set canvas dimensions before any drawing.
  // Engine centers text relative to canvasWidth/canvasHeight.
  canvas.width = 640;
  canvas.height = 360;

  const cfg = buildEngineConfig(effect, text, fontSize, canvas.width, canvas.height, time);

  // Step 2 — All fonts are pre-loaded via Fontsource imports in index.css.
  // Wait for document.fonts.ready to ensure they are fully registered before
  // the first draw, preventing fallback-font renders.
  await document.fonts.ready;

  // Step 3 — Draw (routes through WebGLCompositor if ctx.filter unsupported)
  const draw = () => drawScene(ctx, cfg, time ?? 0);

  draw();
};

/**
 * Renders the full text effect on a configurable offscreen canvas and returns
 * a high-resolution export PNG data URL.
 */
export const renderTextEffectToDataURL = (text: string, effect: TextEffectDefinition, fontSize: number, width = 800, height = 400): string => {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  renderTextEffect(offscreen, text, effect, fontSize);
  return offscreen.toDataURL("image/png");
};
