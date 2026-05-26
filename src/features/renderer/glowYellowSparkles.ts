import { TextEffectDefinition } from "./types";
import { applyFontConfig } from "./helpers";

/**
 * Procedural Canvas 2D Gold Gradient & Yellow Neon Glow Premium Text Renderer with Sparkle Particles.
 * Draws triple-layered radiating yellow neon glows (WebKit-proof), crisp black outside stroke,
 * vertical gold-yellow linear gradient body, and deterministic 4-pointed star sparkles.
 */
export const renderGlowYellowSparkles = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  effect: TextEffectDefinition,
  fontSize: number,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  lines: string[],
  lineHeightPx: number,
  textWidth: number,
  textHeight: number
) => {
  applyFontConfig(ctx, effect.font, fontSize);

  // 1. Draw Organic Radiating Neon Glow Layers (Back-to-Front blurs to bypass WebKit shadow bounds clipping)
  const glowColor = "#FFFF00";
  const glowBlurs = [75, 35, 15];
  const glowAlphas = [0.4, 0.8, 1.0];

  glowBlurs.forEach((blur, idx) => {
    ctx.save();
    ctx.globalAlpha = glowAlphas[idx];
    if (blur > 0) {
      (ctx as any).filter = `blur(${blur}px)`;
    }
    
    // Draw wide strokes and fills to grow the bloom organically from the outline shape
    lines.forEach((line, index) => {
      const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 12; // Outlined glow spread
      ctx.lineJoin = "round";
      ctx.strokeText(line, x, lineY);
      
      ctx.fillStyle = glowColor;
      ctx.fillText(line, x, lineY);
    });
    ctx.restore();
  });

  // 2. Draw Crisp Outside Stroke (protective black outline)
  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1.0;
  lines.forEach((line, index) => {
    const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
    ctx.strokeText(line, x, lineY);
  });
  ctx.restore();

  // 3. Draw Vertical Gold Linear Gradient Text Body Fill
  ctx.save();
  const gradient = ctx.createLinearGradient(x - textWidth / 2, y - textHeight / 2, x - textWidth / 2, y + textHeight / 2);
  gradient.addColorStop(0, "#8B7500");   // Antique/Dark Gold
  gradient.addColorStop(0.5, "#FFD700"); // Rich Gold
  gradient.addColorStop(1, "#FFFF99");   // Champagne highlights
  ctx.fillStyle = gradient;
  
  lines.forEach((line, index) => {
    const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
    ctx.fillText(line, x, lineY);
  });
  ctx.restore();

  // 4. Draw Beautiful Sparkle Particles on Top
  if (effect.sparkles && effect.sparkles.enabled) {
    const config = effect.sparkles;
    const spreadX = textWidth * config.spread;
    const spreadY = textHeight * config.spread;

    // Use deterministic random based on text dimensions for consistent sparkle positions
    const seed = textWidth + textHeight;
    const random = (index: number) => {
      const v = Math.sin(seed + index * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };

    ctx.save();
    ctx.globalAlpha = config.opacity;
    ctx.fillStyle = config.color;

    for (let i = 0; i < config.count; i++) {
      const sparkleX = x - spreadX / 2 + random(i * 2) * spreadX;
      const sparkleY = y - spreadY / 2 + random(i * 2 + 1) * spreadY;
      const size = config.minSize + random(i * 3) * (config.maxSize - config.minSize);

      drawStar(ctx, sparkleX, sparkleY, size);
    }
    ctx.restore();
  }
};

/**
 * Draws a beautiful high-fidelity 4-pointed star sparkle with outer flare beams and bright center core
 */
function drawStar(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);

  // Set style to fill color (white by default)
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = "round";

  // Beams (Horizontal flare)
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.lineWidth = size / 3.5;
  ctx.stroke();

  // Beams (Vertical flare)
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();

  // Diagonal flares for premium detailed star
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, -size * 0.6);
  ctx.lineTo(size * 0.6, size * 0.6);
  ctx.lineWidth = size / 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.6, -size * 0.6);
  ctx.lineTo(-size * 0.6, size * 0.6);
  ctx.stroke();

  // Highlight center core
  ctx.beginPath();
  ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
