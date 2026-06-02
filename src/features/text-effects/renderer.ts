import { evaluateScene, textEffectConfigToScene, defaultConfig as engineDefaultConfig, type TextEffectConfig } from "@clypra/engine";
import { applyFontConfig, resolveFontFamilyName } from "./lib/helpers";
import { TextEffectDefinition } from "./types/types";
import { hasRegisteredEngine, renderRegisteredEffect, _buildConfig } from "./registry";

// ─── Scene cache ──────────────────────────────────────────────────────────────
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
  // Use evaluateScene — the correct full pipeline. This is the only path that
  // correctly applies ctx.filter for stroke blur, multi-pass glow compositing,
  // bevel depth, and all other post-fx the engine supports.
  const cfg = buildEngineConfig(effect, text, fontSize, canvasWidth, canvasHeight, time, clipStartTime, clipDuration);
  const scene = getOrBuildScene(cfg);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  evaluateScene(scene, time ?? 0, ctx as CanvasRenderingContext2D);
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

  // Step 1 — Set canvas dimensions before any drawing
  canvas.width = 640;
  canvas.height = 360;

  const cfg = buildEngineConfig(effect, text, fontSize, canvas.width, canvas.height, time);
  const fontFamily = (cfg.fontFamily as string) || "Inter";
  const fontWeight = (cfg.fontWeight as number) || 700;

  // Step 2 — Inject Google Font stylesheet if not already present
  const fontId = `clypra-font-${fontFamily.replace(/\s+/g, "-").toLowerCase()}`;
  if (!document.getElementById(fontId)) {
    const link = document.createElement("link");
    link.id = fontId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${fontWeight}&display=swap`;
    document.head.appendChild(link);
  }

  // Step 3 — Wait for the specific font variant before first draw
  const fontSpec = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  try {
    await document.fonts.load(fontSpec);
  } catch {
    // Font load failed (offline / unknown family) — render with fallback
  }

  // Step 4 — Draw
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderTextEffectToContext(ctx, text, effect, fontSize, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, time);
  };

  draw();

  // Step 5 — Re-draw after all fonts settle (catches variable-weight variants)
  document.fonts.ready.then(draw);
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
