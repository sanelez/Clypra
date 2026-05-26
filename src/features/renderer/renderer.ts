import { TextEffectDefinition } from "./types";
import { applyFontConfig } from "./helpers";
import { renderNewspaper } from "./newspaper";
import { renderFrostedGlass } from "./frostedGlass";
import { renderBurnedWood } from "./burnedWood";
import { renderVictorianOrnate } from "./victorianOrnate";
import { renderCalligraphyInk } from "./calligraphyInk";
import { renderGoldFoilStamp } from "./goldFoilStamp";
import { renderClassicInk } from "./classicInk";
import { renderClassicEngraved } from "./classicEngraved";
import { renderClassicSerifGold } from "./classicSerifGold";
import { renderClassicStamp } from "./classicStamp";
import { renderClassicNeonSign } from "./classicNeonSign";
import { renderNeonYellowOutline } from "./neonYellowOutline";
import { renderGlowYellowSparkles } from "./glowYellowSparkles";

/**
 * Core Canvas 2D Text Effects Rendering Context Engine.
 * Renders full text layers onto any rendering context.
 * Bypasses all generic checks and delegates directly to specialized procedural renderers.
 */
export const renderTextEffectToContext = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, effect: TextEffectDefinition, fontSize: number, x: number, y: number, canvasWidth: number, canvasHeight: number) => {
  const lines = text.split("\n");
  const lineHeightPx = fontSize * effect.font.lineHeight;

  // Apply default setup
  applyFontConfig(ctx, effect.font, fontSize);

  // Measure text dimensions early for specialized renderers
  let textWidth = 0;
  lines.forEach((line) => {
    textWidth = Math.max(textWidth, ctx.measureText(line).width);
  });
  const textHeight = lines.length * lineHeightPx;

  // ==========================================
  // Premium Procedural Specialized Renderers (Early Return)
  // ==========================================
  if (effect.neonYellowOutline && effect.neonYellowOutline.enabled) {
    renderNeonYellowOutline(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.id === "glow-yellow" || (effect.sparkles && effect.sparkles.enabled)) {
    renderGlowYellowSparkles(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.newspaper && effect.newspaper.enabled) {
    renderNewspaper(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.frostedGlass && effect.frostedGlass.enabled) {
    renderFrostedGlass(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.burnedWood && effect.burnedWood.enabled) {
    renderBurnedWood(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.victorianOrnate && effect.victorianOrnate.enabled) {
    renderVictorianOrnate(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.calligraphyInk && effect.calligraphyInk.enabled) {
    renderCalligraphyInk(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.goldFoilStamp && effect.goldFoilStamp.enabled) {
    renderGoldFoilStamp(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.classicInk && effect.classicInk.enabled) {
    renderClassicInk(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.classicEngraved && effect.classicEngraved.enabled) {
    renderClassicEngraved(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.classicSerifGold && effect.classicSerifGold.enabled) {
    renderClassicSerifGold(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.classicStamp && effect.classicStamp.enabled) {
    renderClassicStamp(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }

  if (effect.classicNeonSign && effect.classicNeonSign.enabled) {
    renderClassicNeonSign(ctx, text, effect, fontSize, x, y, canvasWidth, canvasHeight, lines, lineHeightPx, textWidth, textHeight);
    return;
  }
};

/**
 * Core Canvas 2D Text Effects Rendering Engine.
 * Renders full text layers in premium NLE composition order.
 * @param canvas - The HTMLCanvasElement to render onto.
 * @param text - The text string, supporting newlines.
 * @param effect - The text effect definition block.
 * @param fontSize - Master font size in pixels.
 */
export const renderTextEffect = (canvas: HTMLCanvasElement, text: string, effect: TextEffectDefinition, fontSize: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTextEffectToContext(ctx, text, effect, fontSize, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height);
};

/**
 * Renders the full text effect on a configurable offscreen canvas and returns a high-resolution export PNG data URL.
 * @param text - The text string.
 * @param effect - The text effect definition block.
 * @param fontSize - Master font size in pixels.
 * @param width - Canvas export width in px (default: 800).
 * @param height - Canvas export height in px (default: 400).
 * @returns A base64 PNG data URL string.
 */
export const renderTextEffectToDataURL = (text: string, effect: TextEffectDefinition, fontSize: number, width: number = 800, height: number = 400): string => {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;

  renderTextEffect(offscreen, text, effect, fontSize);
  return offscreen.toDataURL("image/png");
};
