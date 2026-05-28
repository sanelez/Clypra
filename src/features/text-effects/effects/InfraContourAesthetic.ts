export interface InfraContourAestheticConfig {
  width: number;
  height: number;
  text: string;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  fontSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  fillType?: "solid" | "linear" | "radial" | "pattern" | "none";
  fillColor?: string;
  fillGradientAngle?: number;
  patternType?: "chalk" | "noise" | "grunge" | "carbon" | "stripes" | "film" | "brushed" | "marble" | "halftone" | "paper";
  fillGradientStops?: Array<{ color: string; offset: number }>;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  strokePosition?: "outside" | "center" | "inside";
  strokeOpacity?: number;
  strokeLineJoin?: "round" | "miter" | "bevel";
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  shadowType?: "drop" | "inner";
  bevelEnabled?: boolean;
  bevelDepth?: number;
  bevelHighlight?: string;
  bevelShadow?: string;
  bevelDirection?: "bottom-right" | "bottom" | "right";
  bevelCoreColor?: string;
  bevelEdgeColor?: string;
  bevelEdgeWidth?: number;
  bevelBlur?: number;
  bevelBlurColor?: string;

  stackEnabled?: boolean;
  stackCount?: number;
  stackOffsetX?: number;
  stackOffsetY?: number;
  stackOpacityDecay?: number;
  stackColor1?: string;
  stackColor2?: string;
  stackColor3?: string;
  stackColor4?: string;
  panelEnabled?: boolean;
  panelColor?: string;
  panelOpacity?: number;
  panelRadius?: number;
  panelPaddingX?: number;
  panelPaddingY?: number;
  panelStrokeEnabled?: boolean;
  panelStrokeColor?: string;
  panelStrokeWidth?: number;
  textPosX?: "left" | "center" | "right";
  textPosY?: "top" | "middle" | "bottom";
  glowLayers?: Array<{
    enabled: boolean;
    color: string;
    blur: number;
    opacity: number;
    type: "outer" | "inner";
    strength?: number;
    spread?: number;
  }>;
}

export class InfraContourAestheticEngine {
  private cfg: Required<InfraContourAestheticConfig>;

  constructor(config: InfraContourAestheticConfig) {
    // Merge provided configuration with static studio defaults
    const defaults: Required<InfraContourAestheticConfig> = {
      width: 800,
      height: 200,
      text: "TEXT",
      fontFamily: "Arial Rounded MT Bold",
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: 115,
      letterSpacing: 4,
      lineHeight: 1.2,
      fillType: "none",
      fillColor: "#FFFFFF",
      fillGradientAngle: 90,
      patternType: "chalk",
      fillGradientStops: [
        {
          color: "#FFFFFF",
          offset: 0,
        },
        {
          color: "#E0E0E0",
          offset: 100,
        },
      ],
      strokeEnabled: true,
      strokeColor: "#ffffff",
      strokeWidth: 1,
      strokePosition: "outside",
      strokeOpacity: 100,
      strokeLineJoin: "round",
      shadowEnabled: false,
      shadowColor: "#FF003C",
      shadowBlur: 20,
      shadowOffsetX: 46,
      shadowOffsetY: 17,
      shadowOpacity: 80,
      shadowType: "drop",
      bevelEnabled: false,
      bevelDepth: 5,
      bevelHighlight: "#FFFFFF",
      bevelShadow: "#000000",
      bevelDirection: "bottom-right",
      bevelCoreColor: "#000000",
      bevelEdgeColor: "#2A2A38",
      bevelEdgeWidth: 0,
      bevelBlur: 0,
      bevelBlurColor: "#000000",
      stackEnabled: false,
      stackCount: 3,
      stackOffsetX: 10,
      stackOffsetY: -10,
      stackOpacityDecay: 20,
      stackColor1: "#FF7C00",
      stackColor2: "#00FFDD",
      stackColor3: "#FF00AA",
      stackColor4: "#AA00FF",
      panelEnabled: false,
      panelColor: "#1E1E26",
      panelOpacity: 80,
      panelRadius: 12,
      panelPaddingX: 40,
      panelPaddingY: 20,
      panelStrokeEnabled: false,
      panelStrokeColor: "#2A2A38",
      panelStrokeWidth: 2,
      textPosX: "center",
      textPosY: "middle",
      glowLayers: [
        {
          enabled: true,
          color: "#FF003C",
          blur: 15,
          opacity: 10,
          type: "outer",
          strength: 10,
          spread: 10,
        },
      ],
    };

    this.cfg = {
      ...defaults,
      ...config,
    };
  }

  // Satisfies standard Clypra text engine contract - For animated text effects, increments dynamic timelines
  advanceSteps(steps: number): void {
    // This effect is static and has a no-op implementation
  }

  drawFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ghostFrames?: ImageData[]): void {
    const { width, height, text, fontFamily, fontWeight, fontStyle, fontSize, letterSpacing, lineHeight, fillType, fillColor, fillGradientAngle, fillGradientStops, patternType, strokeEnabled, strokeColor, strokeWidth, strokePosition, strokeOpacity, strokeLineJoin, shadowEnabled, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity, shadowType, bevelEnabled, bevelDepth, bevelHighlight, bevelShadow, bevelDirection, bevelCoreColor, bevelEdgeColor, bevelEdgeWidth, bevelBlur, bevelBlurColor, stackEnabled, stackCount, stackOffsetX, stackOffsetY, stackOpacityDecay, stackColor1, stackColor2, stackColor3, stackColor4, panelEnabled, panelColor, panelOpacity, panelRadius, panelPaddingX, panelPaddingY, panelStrokeEnabled, panelStrokeColor, panelStrokeWidth, textPosX, textPosY } = this.cfg;

    // Clear dynamic context canvas - Absolutely no color bleed background fills allowed
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;

    // Set text font properties
    const fontStr = fontStyle + " " + fontWeight + " " + fontSize + 'px "' + fontFamily + '"';
    ctx.font = fontStr;
    ctx.lineJoin = strokeLineJoin;

    const lines = text.split("\n");
    const numLines = lines.length;
    const textBlockHeight = fontSize + (numLines - 1) * fontSize * lineHeight;

    // Determine horizontal origins
    let startX = width / 2;
    let align: CanvasTextAlign = "center";
    if (textPosX === "left") {
      startX = panelEnabled ? panelPaddingX + 20 : 50;
      align = "left";
    } else if (textPosX === "right") {
      startX = width - (panelEnabled ? panelPaddingX + 20 : 50);
      align = "right";
    }
    ctx.textAlign = align;

    // Vertical alignment origins
    let startY = (height - textBlockHeight) / 2 + fontSize * 0.8;
    if (textPosY === "top") {
      startY = (panelEnabled ? panelPaddingY + 20 : 40) + fontSize * 0.8;
    } else if (textPosY === "bottom") {
      startY = height - (panelEnabled ? panelPaddingY + 20 : 40) - textBlockHeight + fontSize * 0.8;
    }

    // Dynamic measurements
    let maxLineWidth = 0;
    const lineWidths = lines.map((line) => {
      const originalSpacing = (ctx as any).letterSpacing || "normal";
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = letterSpacing + "px";
      }
      const w = ctx.measureText(line).width;
      (ctx as any).letterSpacing = originalSpacing;
      return w;
    });
    maxLineWidth = Math.max(...lineWidths, 10);

    let xMin = startX;
    if (align === "center") {
      xMin = startX - maxLineWidth / 2;
    } else if (align === "right") {
      xMin = startX - maxLineWidth;
    }
    const xMax = xMin + maxLineWidth;
    const yMin = startY - fontSize * 0.8;
    const yMax = yMin + textBlockHeight;

    // Internal line drawer
    const renderLines = (mode: "fill" | "stroke", overrideStyle?: string | CanvasGradient | CanvasPattern, offsetX = 0, offsetY = 0) => {
      const savedLetterSpacing = (ctx as any).letterSpacing || "normal";
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = letterSpacing + "px";
      }

      if (overrideStyle) {
        if (mode === "fill") {
          ctx.fillStyle = overrideStyle;
        } else {
          ctx.strokeStyle = overrideStyle;
        }
      }

      lines.forEach((line, index) => {
        const py = startY + index * fontSize * lineHeight;
        if (mode === "fill") {
          ctx.fillText(line, startX + offsetX, py + offsetY);
        } else {
          ctx.strokeText(line, startX + offsetX, py + offsetY);
        }
      });

      (ctx as any).letterSpacing = savedLetterSpacing;
    };

    // Offscreen offset shadow renderer helper (keeps shadow crisp & avoids source text overlapping)
    const renderWithShadowTrick = (mode: "fill" | "stroke", sColor: string, sBlur: number, sOffsetX: number, sOffsetY: number, opacity: number, overrideStyle = "#000", spread = 0) => {
      ctx.save();
      ctx.globalAlpha = opacity / 100;

      const shiftX = 10000;
      ctx.shadowColor = sColor;
      ctx.shadowBlur = sBlur;
      ctx.shadowOffsetX = shiftX + sOffsetX;
      ctx.shadowOffsetY = sOffsetY;

      const savedLetterSpacing = (ctx as any).letterSpacing || "normal";
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = letterSpacing + "px";
      }

      const prevStyle = mode === "fill" ? ctx.fillStyle : ctx.strokeStyle;
      if (mode === "fill") {
        ctx.fillStyle = overrideStyle;
      } else {
        ctx.strokeStyle = overrideStyle;
      }

      const prevStrokeStyle = ctx.strokeStyle;
      const prevLineWidth = ctx.lineWidth;
      if (spread > 0) {
        ctx.strokeStyle = overrideStyle;
        ctx.lineWidth = spread * 2;
        ctx.lineJoin = strokeLineJoin;
      }

      lines.forEach((line, index) => {
        const py = startY + index * fontSize * lineHeight;
        if (mode === "fill") {
          if (spread > 0) {
            ctx.strokeText(line, startX - shiftX, py);
          }
          ctx.fillText(line, startX - shiftX, py);
        } else {
          ctx.strokeText(line, startX - shiftX, py);
        }
      });

      (ctx as any).letterSpacing = savedLetterSpacing;
      if (mode === "fill") {
        ctx.fillStyle = prevStyle;
      } else {
        ctx.strokeStyle = prevStyle;
      }
      if (spread > 0) {
        ctx.strokeStyle = prevStrokeStyle;
        ctx.lineWidth = prevLineWidth;
      }

      ctx.restore();
    };

    // 1. Background Panel (If active)
    if (panelEnabled) {
      ctx.save();
      ctx.globalAlpha = panelOpacity / 100;
      ctx.fillStyle = panelColor;

      const px = xMin - panelPaddingX;
      const py = yMin - panelPaddingY;
      const pw = xMax - xMin + 2 * panelPaddingX;
      const ph = textBlockHeight + 2 * panelPaddingY;

      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, panelRadius);
      ctx.fill();

      if (panelStrokeEnabled) {
        ctx.strokeStyle = panelStrokeColor;
        ctx.lineWidth = panelStrokeWidth;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Glow Layers (Type: Outer)
    const glowLayers = this.cfg.glowLayers || [];
    glowLayers.forEach((layer) => {
      if (layer.enabled && layer.type === "outer" && layer.opacity > 0) {
        const renderCount = Math.max(1, Math.min(20, layer.strength ?? 1));
        for (let i = 0; i < renderCount; i++) {
          renderWithShadowTrick("fill", layer.color, layer.blur, 0, 0, layer.opacity, "#000", layer.spread ?? 0);
        }
      }
    });

    // 3. Drop Shadow (Type: Drop)
    if (shadowEnabled && shadowType === "drop" && shadowOpacity > 0) {
      renderWithShadowTrick("fill", shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity);
    }

    // 4. Glitch RGB Splitting simulation (if applicable)
    const isGlitchEffect = "InfraContourAesthetic".toLowerCase().includes("glitch") || text === "SYSTEM ERR";
    if (isGlitchEffect) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      renderLines("fill", "#00FFFF", -4, -2);
      renderLines("fill", "#FF00FF", 4, 2);
      ctx.restore();
    }

    // 5. Bevel 3D Layers
    if (bevelEnabled && bevelDepth > 0) {
      ctx.save();
      for (let i = bevelDepth; i > 0; i--) {
        let dx = 0;
        let dy = 0;
        if (bevelDirection === "bottom-right") {
          dx = i;
          dy = i;
        } else if (bevelDirection === "bottom") {
          dy = i;
        } else if (bevelDirection === "right") {
          dx = i;
        }
        const sliceColor = i === 1 ? bevelHighlight : bevelShadow;
        renderLines("fill", sliceColor, dx, dy);
      }
      ctx.restore();
    }

    // 5.5. Text Multi-Stack Layers
    if (stackEnabled && (stackCount ?? 0) >= 1) {
      const cnt = stackCount ?? 3;
      const offX = stackOffsetX ?? 10;
      const offY = stackOffsetY ?? -10;
      const decay = (stackOpacityDecay ?? 20) / 100;
      const stackColors = [stackColor1 || "#FF7C00", stackColor2 || "#00FFDD", stackColor3 || "#FF00AA", stackColor4 || "#AA00FF"];

      for (let s = cnt; s >= 1; s--) {
        ctx.save();
        const dx = s * offX;
        const dy = s * offY;

        const layerOpacity = Math.max(0.01, 1 - s * decay);
        ctx.globalAlpha = layerOpacity;

        const layerColor = stackColors[(s - 1) % stackColors.length] || "#FFFFFF";

        if (strokeEnabled && strokeWidth > 0 && strokePosition !== "inside") {
          ctx.save();
          ctx.strokeStyle = layerColor;
          ctx.lineWidth = strokePosition === "outside" ? strokeWidth * 2 : strokeWidth;
          ctx.globalAlpha = (strokeOpacity / 100) * layerOpacity;
          renderLines("stroke", layerColor, dx, dy);
          ctx.restore();
        }

        renderLines("fill", layerColor, dx, dy);
        ctx.restore();
      }
    }

    // 6. Stroke Center or Outside
    if (strokeEnabled && strokeWidth > 0 && strokePosition !== "inside") {
      ctx.save();
      ctx.globalAlpha = strokeOpacity / 100;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokePosition === "outside" ? strokeWidth * 2 : strokeWidth;
      renderLines("stroke");
      ctx.restore();
    }

    // 7. Base Fill Setup (Solid, gradients or textures)
    ctx.save();
    let computedFill: string | CanvasGradient | CanvasPattern = fillColor;

    if (fillType === "linear" && fillGradientStops.length >= 2) {
      const angleRad = (fillGradientAngle * Math.PI) / 180;
      const cx = (xMin + xMax) / 2;
      const cy = (yMin + yMax) / 2;
      const r = Math.max(xMax - xMin, yMax - yMin) / 2;

      const x0 = cx - Math.cos(angleRad) * r;
      const y0 = cy - Math.sin(angleRad) * r;
      const x1 = cx + Math.cos(angleRad) * r;
      const y1 = cy + Math.sin(angleRad) * r;

      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      fillGradientStops.forEach((stop) => {
        grad.addColorStop(stop.offset / 100, stop.color);
      });
      computedFill = grad;
    } else if (fillType === "radial" && fillGradientStops.length >= 2) {
      const cx = (xMin + xMax) / 2;
      const cy = (yMin + yMax) / 2;
      const r = Math.max(xMax - xMin, yMax - yMin) / 1.5;

      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      fillGradientStops.forEach((stop) => {
        grad.addColorStop(stop.offset / 100, stop.color);
      });
      computedFill = grad;
    } else if (fillType === "pattern") {
      const pType = patternType || "chalk";
      const patColor = fillColor || "#ffffff";

      let patCanvas: any = null;
      if (typeof document !== "undefined") {
        patCanvas = document.createElement("canvas");
      } else if (typeof OffscreenCanvas !== "undefined") {
        patCanvas = new OffscreenCanvas(128, 128);
      }

      if (patCanvas) {
        if (pType === "carbon") {
          patCanvas.width = 8;
          patCanvas.height = 8;
        } else if (pType === "stripes") {
          patCanvas.width = 16;
          patCanvas.height = 16;
        } else if (pType === "halftone") {
          patCanvas.width = 24;
          patCanvas.height = 24;
        } else if (pType === "noise") {
          patCanvas.width = 96;
          patCanvas.height = 96;
        } else if (pType === "film" || pType === "brushed" || pType === "paper") {
          patCanvas.width = 128;
          patCanvas.height = 128;
        } else if (pType === "marble") {
          patCanvas.width = 256;
          patCanvas.height = 256;
        } else {
          patCanvas.width = 120;
          patCanvas.height = 120;
        }

        const patCtx = patCanvas.getContext("2d");
        if (patCtx) {
          const seedRandom = (initSeed: number) => {
            let currentSeed = initSeed;
            return () => {
              currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
              return currentSeed / 4294967296;
            };
          };
          const rand = seedRandom(42);

          if (pType === "chalk") {
            patCtx.fillStyle = "rgba(0,0,0,0)";
            patCtx.fillRect(0, 0, 120, 120);
            patCtx.fillStyle = patColor;
            for (let i = 0; i < 3500; i++) {
              const px = Math.floor(rand() * 120);
              const py = Math.floor(rand() * 120);
              patCtx.globalAlpha = 0.08 + rand() * 0.18;
              patCtx.fillRect(px, py, 1.2, 1.2);
            }
            patCtx.strokeStyle = patColor;
            for (let s = 0; s < 4; s++) {
              const angle = (s * Math.PI) / 4 + (rand() - 0.5) * 0.15;
              patCtx.lineWidth = 0.5 + rand() * 0.9;
              for (let i = 0; i < 40; i++) {
                patCtx.globalAlpha = 0.05 + rand() * 0.16;
                patCtx.beginPath();
                const startX = rand() * 120;
                const startY = rand() * 120;
                const len = 15 + rand() * 30;
                patCtx.moveTo(startX, startY);
                patCtx.lineTo(startX + Math.cos(angle) * len, startY + Math.sin(angle) * len);
                patCtx.stroke();
              }
            }
            for (let i = 0; i < 220; i++) {
              const cx = rand() * 120;
              const cy = rand() * 120;
              const r = 1 + rand() * 3;
              patCtx.globalAlpha = 0.03 + rand() * 0.08;
              patCtx.fillStyle = patColor;
              patCtx.beginPath();
              patCtx.arc(cx, cy, r, 0, Math.PI * 2);
              patCtx.fill();
            }
          } else if (pType === "noise") {
            patCtx.fillStyle = "rgba(0,0,0,0)";
            patCtx.fillRect(0, 0, 96, 96);
            patCtx.fillStyle = patColor;
            for (let i = 0; i < 4500; i++) {
              const px = Math.floor(rand() * 96);
              const py = Math.floor(rand() * 96);
              patCtx.globalAlpha = 0.12 + rand() * 0.38;
              patCtx.fillRect(px, py, rand() > 0.85 ? 1.5 : 1, rand() > 0.85 ? 1.5 : 1);
            }
            for (let i = 0; i < 150; i++) {
              const px = Math.floor(rand() * 96);
              const py = Math.floor(rand() * 96);
              const size = 1.6 + rand() * 1.5;
              patCtx.globalAlpha = 0.05 + rand() * 0.12;
              patCtx.fillRect(px, py, size, size);
            }
          } else if (pType === "grunge") {
            patCtx.fillStyle = "rgba(0,0,0,0)";
            patCtx.fillRect(0, 0, 128, 128);
            patCtx.fillStyle = patColor;
            for (let i = 0; i < 60; i++) {
              const cx = rand() * 128;
              const cy = rand() * 128;
              const r = 3 + rand() * 18;
              patCtx.globalAlpha = 0.06 + rand() * 0.15;
              patCtx.beginPath();
              patCtx.arc(cx, cy, r, 0, Math.PI * 2);
              patCtx.fill();
            }
            patCtx.strokeStyle = patColor;
            for (let i = 0; i < 22; i++) {
              const sx = rand() * 128;
              const sy = rand() * 128;
              const angle = (rand() * Math.PI) / 3 - Math.PI / 6;
              const len = 12 + rand() * 25;
              patCtx.lineWidth = 0.5 + rand() * 1.5;
              patCtx.globalAlpha = 0.15 + rand() * 0.25;
              patCtx.beginPath();
              patCtx.moveTo(sx, sy);
              patCtx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
              patCtx.stroke();
            }
            for (let i = 0; i < 1800; i++) {
              const px = Math.floor(rand() * 128);
              const py = Math.floor(rand() * 128);
              patCtx.globalAlpha = 0.08 + rand() * 0.22;
              patCtx.fillRect(px, py, 1.2, 1.2);
            }
          } else if (pType === "carbon") {
            patCtx.fillStyle = "rgba(0,0,0,0.15)";
            patCtx.fillRect(0, 0, 8, 8);
            patCtx.fillStyle = patColor;
            patCtx.globalAlpha = 0.65;
            patCtx.fillRect(0, 0, 4, 4);
            patCtx.fillRect(4, 4, 4, 4);
            patCtx.fillStyle = "#FFFFFF";
            patCtx.globalAlpha = 0.22;
            patCtx.fillRect(0, 0, 4, 1);
            patCtx.fillRect(4, 4, 4, 1);
            patCtx.fillStyle = "#000000";
            patCtx.globalAlpha = 0.35;
            patCtx.fillRect(0, 3, 4, 1);
            patCtx.fillRect(4, 7, 4, 1);
          } else if (pType === "stripes") {
            patCtx.fillStyle = "rgba(0,0,0,0)";
            patCtx.fillRect(0, 0, 16, 16);
            patCtx.strokeStyle = patColor;
            patCtx.lineWidth = 3.5;
            patCtx.globalAlpha = 0.65;
            patCtx.beginPath();
            patCtx.moveTo(-4, 12);
            patCtx.lineTo(12, -4);
            patCtx.moveTo(0, 16);
            patCtx.lineTo(16, 0);
            patCtx.moveTo(4, 20);
            patCtx.lineTo(20, 4);
            patCtx.stroke();
          } else if (pType === "film") {
            patCtx.fillStyle = patColor;
            patCtx.globalAlpha = 0.94;
            patCtx.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 4800; i++) {
              const px = Math.floor(rand() * 128);
              const py = Math.floor(rand() * 128);
              const isDark = rand() > 0.45;
              patCtx.fillStyle = isDark ? "#000000" : "#FFFFFF";
              patCtx.globalAlpha = isDark ? 0.13 + rand() * 0.22 : 0.15 + rand() * 0.28;
              patCtx.fillRect(px, py, rand() > 0.9 ? 1.5 : 1, rand() > 0.9 ? 1.5 : 1);
            }
            patCtx.strokeStyle = "rgba(255, 255, 255, 0.48)";
            for (let i = 0; i < 10; i++) {
              const sx = rand() * 128;
              const sy = rand() * 128;
              const len = 12 + rand() * 45;
              const angle = -Math.PI / 2 + (rand() - 0.5) * 0.18;
              patCtx.lineWidth = 0.35 + rand() * 0.55;
              patCtx.globalAlpha = 0.22 + rand() * 0.38;
              patCtx.beginPath();
              patCtx.moveTo(sx, sy);
              patCtx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
              patCtx.stroke();
            }
            patCtx.strokeStyle = "rgba(0, 0, 0, 0.32)";
            for (let i = 0; i < 5; i++) {
              const sx = rand() * 128;
              const sy = rand() * 128;
              const len = 15 + rand() * 50;
              const angle = -Math.PI / 2 + (rand() - 0.5) * 0.12;
              patCtx.lineWidth = 0.3 + rand() * 0.5;
              patCtx.globalAlpha = 0.18 + rand() * 0.25;
              patCtx.beginPath();
              patCtx.moveTo(sx, sy);
              patCtx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
              patCtx.stroke();
            }
            patCtx.strokeStyle = "rgba(0, 0, 0, 0.48)";
            for (let i = 0; i < 4; i++) {
              const sx = rand() * 128;
              const sy = rand() * 128;
              patCtx.lineWidth = 0.55 + rand() * 0.65;
              patCtx.globalAlpha = 0.35 + rand() * 0.3;
              patCtx.beginPath();
              patCtx.moveTo(sx, sy);
              patCtx.quadraticCurveTo(sx + (rand() - 0.5) * 16, sy + (rand() - 0.5) * 16, sx + (rand() - 0.5) * 28, sy + (rand() - 0.5) * 28);
              patCtx.stroke();
            }
            patCtx.fillStyle = "#FFFFFF";
            for (let i = 0; i < 30; i++) {
              const cx = rand() * 128;
              const cy = rand() * 128;
              const r = 0.75 + rand() * 2.4;
              patCtx.globalAlpha = 0.25 + rand() * 0.5;
              patCtx.beginPath();
              patCtx.arc(cx, cy, r, 0, Math.PI * 2);
              patCtx.fill();
            }
            patCtx.fillStyle = "#000000";
            for (let i = 0; i < 20; i++) {
              const cx = rand() * 128;
              const cy = rand() * 128;
              const r = 0.65 + rand() * 2.0;
              patCtx.globalAlpha = 0.2 + rand() * 0.4;
              patCtx.beginPath();
              patCtx.arc(cx, cy, r, 0, Math.PI * 2);
              patCtx.fill();
            }
          } else if (pType === "brushed") {
            patCtx.fillStyle = patColor;
            patCtx.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 350; i++) {
              const y = rand() * 128;
              const x = rand() * 128;
              const len = 30 + rand() * 80;
              const thickness = 0.5 + rand() * 1.5;
              const isLight = rand() > 0.45;
              patCtx.strokeStyle = isLight ? "#FFFFFF" : "#000000";
              patCtx.globalAlpha = isLight ? 0.04 + rand() * 0.12 : 0.03 + rand() * 0.08;
              patCtx.lineWidth = thickness;
              patCtx.beginPath();
              patCtx.moveTo(x, y);
              patCtx.lineTo(x + len, y);
              patCtx.stroke();
              if (x + len > 128) {
                patCtx.beginPath();
                patCtx.moveTo(x - 128, y);
                patCtx.lineTo(x + len - 128, y);
                patCtx.stroke();
              }
            }
            for (let i = 0; i < 8; i++) {
              const x = rand() * 128;
              const w = 10 + rand() * 30;
              const isLight = rand() > 0.5;
              const grad = patCtx.createLinearGradient(x, 0, x + w, 0);
              const baseColor = isLight ? "255,255,255" : "0,0,0";
              const alpha = 0.01 + rand() * 0.04;
              grad.addColorStop(0, "rgba(" + baseColor + ", 0)");
              grad.addColorStop(0.5, "rgba(" + baseColor + ", " + alpha + ")");
              grad.addColorStop(1, "rgba(" + baseColor + ", 0)");
              patCtx.fillStyle = grad;
              patCtx.globalAlpha = 1;
              patCtx.fillRect(x, 0, w, 128);
              if (x + w > 128) {
                patCtx.fillRect(x - 128, 0, w, 128);
              }
            }
          } else if (pType === "marble") {
            patCtx.fillStyle = patColor;
            patCtx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 8; i++) {
              const cx = rand() * 256;
              const cy = rand() * 256;
              const r = 40 + rand() * 70;
              const grad = patCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
              const isLight = rand() > 0.45;
              const alpha = 0.06 + rand() * 0.12;
              const cStr = isLight ? "255,255,255" : "0,0,0";
              grad.addColorStop(0, "rgba(" + cStr + ", " + alpha + ")");
              grad.addColorStop(0.5, "rgba(" + cStr + ", " + alpha * 0.4 + ")");
              grad.addColorStop(1, "rgba(" + cStr + ", 0)");
              patCtx.fillStyle = grad;
              patCtx.globalAlpha = 1;
              patCtx.beginPath();
              patCtx.arc(cx, cy, r, 0, Math.PI * 2);
              patCtx.fill();
            }
            const drawMarbleVein = (color: string, width: number, opac: number) => {
              patCtx.strokeStyle = color;
              patCtx.lineWidth = width;
              patCtx.globalAlpha = opac;
              let px = rand() * 256;
              let py = 0;
              patCtx.beginPath();
              patCtx.moveTo(px, py);
              const steps = 18;
              for (let s = 1; s <= steps; s++) {
                const progress = s / steps;
                const targetY = progress * 256;
                const frequency = 4;
                const amp = 35;
                const noise = Math.sin(progress * Math.PI * frequency + rand() * 2) * amp;
                const targetX = (px + (rand() - 0.5) * 50 + noise + 256) % 256;
                patCtx.lineTo(targetX, targetY);
              }
              patCtx.stroke();
            };
            for (let i = 0; i < 4; i++) {
              drawMarbleVein("#000000", 1.2 + rand() * 1.5, 0.15 + rand() * 0.15);
            }
            for (let i = 0; i < 3; i++) {
              const isGold = rand() > 0.4;
              const vColor = isGold ? "#EAB308" : "#FFFFFF";
              drawMarbleVein(vColor, 0.7 + rand() * 0.8, 0.2 + rand() * 0.2);
            }
            for (let i = 0; i < 5; i++) {
              drawMarbleVein("#000000", 0.4, 0.08 + rand() * 0.06);
            }
          } else if (pType === "halftone") {
            patCtx.fillStyle = "rgba(0,0,0,0)";
            patCtx.fillRect(0, 0, 24, 24);
            const dotColor = fillColor || "#ffffff";
            patCtx.fillStyle = "#000000";
            patCtx.globalAlpha = 0.35;
            patCtx.beginPath();
            patCtx.arc(12, 12, 5.5, 0, Math.PI * 2);
            patCtx.arc(0, 0, 3.5, 0, Math.PI * 2);
            patCtx.arc(24, 0, 3.5, 0, Math.PI * 2);
            patCtx.arc(0, 24, 3.5, 0, Math.PI * 2);
            patCtx.arc(24, 24, 3.5, 0, Math.PI * 2);
            patCtx.fill();
            patCtx.fillStyle = dotColor;
            patCtx.globalAlpha = 0.95;
            patCtx.beginPath();
            patCtx.arc(11, 11, 5.0, 0, Math.PI * 2);
            patCtx.arc(0, 0, 3.0, 0, Math.PI * 2);
            patCtx.arc(24, 0, 3.0, 0, Math.PI * 2);
            patCtx.arc(0, 24, 3.0, 0, Math.PI * 2);
            patCtx.arc(24, 24, 3.0, 0, Math.PI * 2);
            patCtx.fill();
            patCtx.fillStyle = dotColor === "#FFFFFF" || dotColor === "#ffffff" ? "#7C6FFF" : "#FFFFFF";
            patCtx.globalAlpha = 0.55;
            patCtx.beginPath();
            patCtx.arc(12, 0, 1.5, 0, Math.PI * 2);
            patCtx.arc(12, 24, 1.5, 0, Math.PI * 2);
            patCtx.arc(0, 12, 1.5, 0, Math.PI * 2);
            patCtx.arc(24, 12, 1.5, 0, Math.PI * 2);
            patCtx.fill();
          } else if (pType === "paper") {
            patCtx.fillStyle = patColor;
            patCtx.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 350; i++) {
              const fx = rand() * 128;
              const fy = rand() * 128;
              const flen = 3 + rand() * 12;
              const fangle = rand() * Math.PI * 2;
              const isDark = rand() > 0.4;
              patCtx.strokeStyle = isDark ? "#000000" : "#FFFFFF";
              patCtx.globalAlpha = isDark ? 0.03 + rand() * 0.08 : 0.05 + rand() * 0.12;
              patCtx.lineWidth = 0.4 + rand() * 0.7;
              patCtx.beginPath();
              patCtx.moveTo(fx, fy);
              patCtx.quadraticCurveTo(fx + Math.cos(fangle) * flen * 0.5 + (rand() - 0.5) * 4, fy + Math.sin(fangle) * flen * 0.5 + (rand() - 0.5) * 4, fx + Math.cos(fangle) * flen, fy + Math.sin(fangle) * flen);
              patCtx.stroke();
            }
            for (let i = 0; i < 5000; i++) {
              const gx = Math.floor(rand() * 128);
              const gy = Math.floor(rand() * 128);
              const isDark = rand() > 0.5;
              patCtx.fillStyle = isDark ? "#000000" : "#FFFFFF";
              patCtx.globalAlpha = isDark ? 0.04 : 0.06;
              patCtx.fillRect(gx, gy, 1, 1);
            }
            const points: [number, number][] = [];
            for (let i = 0; i < 6; i++) {
              points.push([rand() * 128, rand() * 128]);
            }
            points.push([0, 0], [128, 0], [128, 128], [0, 128]);
            for (let i = 0; i < 15; i++) {
              const p1 = points[Math.floor(rand() * points.length)];
              const p2 = points[Math.floor(rand() * points.length)];
              const p3 = points[Math.floor(rand() * points.length)];
              if (p1 !== p2 && p2 !== p3) {
                const grad = patCtx.createLinearGradient(p1[0], p1[1], p2[0], p2[1]);
                const alpha = 0.01 + rand() * 0.06;
                const isDark = rand() > 0.5;
                const cStr = isDark ? "0,0,0" : "255,255,255";
                grad.addColorStop(0, "rgba(" + cStr + ", " + alpha + ")");
                grad.addColorStop(1, "rgba(" + cStr + ", 0)");
                patCtx.fillStyle = grad;
                patCtx.globalAlpha = 1;
                patCtx.beginPath();
                patCtx.moveTo(p1[0], p1[1]);
                patCtx.lineTo(p2[0], p2[1]);
                patCtx.lineTo(p3[0], p3[1]);
                patCtx.closePath();
                patCtx.fill();
              }
            }
            for (let i = 0; i < 12; i++) {
              const sx = rand() * 128;
              const sy = rand() * 128;
              const ex = rand() * 128;
              const ey = rand() * 128;
              const dx = ex - sx;
              const dy = ey - sy;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len === 0) continue;
              const nx = -dy / len;
              const ny = dx / len;
              patCtx.strokeStyle = "#000000";
              patCtx.lineWidth = 0.5 + rand() * 1.2;
              patCtx.globalAlpha = 0.05 + rand() * 0.12;
              patCtx.beginPath();
              patCtx.moveTo(sx + nx * 0.8, sy + ny * 0.8);
              patCtx.lineTo(ex + nx * 0.8, ey + ny * 0.8);
              patCtx.stroke();
              patCtx.strokeStyle = "#000000";
              patCtx.lineWidth = 0.3 + rand() * 0.4;
              patCtx.globalAlpha = 0.08 + rand() * 0.15;
              patCtx.beginPath();
              patCtx.moveTo(sx, sy);
              patCtx.lineTo(ex, ey);
              patCtx.stroke();
              patCtx.strokeStyle = "#FFFFFF";
              patCtx.lineWidth = 0.6 + rand() * 1.5;
              patCtx.globalAlpha = 0.08 + rand() * 0.22;
              patCtx.beginPath();
              patCtx.moveTo(sx - nx * 0.8, sy - ny * 0.8);
              patCtx.lineTo(ex - nx * 0.8, ey - ny * 0.8);
              patCtx.stroke();
            }
          }

          const pat = ctx.createPattern(patCanvas as any, "repeat");
          if (pat) {
            computedFill = pat;
          }
        }
      }
    }

    if (fillType !== "none") {
      renderLines("fill", computedFill);
    }
    ctx.restore();

    // Inside stroke clipping composition fallback
    if (strokeEnabled && strokeWidth > 0 && strokePosition === "inside") {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * 2;
      ctx.globalAlpha = strokeOpacity / 100;
      renderLines("stroke");
      ctx.restore();
    }

    // 8. Glow and Shadow overlays on top (using source-atop composition)
    glowLayers.forEach((layer) => {
      if (layer.enabled && layer.type === "inner" && layer.opacity > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        const renderCount = Math.max(1, Math.min(20, layer.strength ?? 1));
        for (let i = 0; i < renderCount; i++) {
          renderWithShadowTrick("fill", layer.color, layer.blur, 0, 0, layer.opacity, "transparent", layer.spread ?? 0);
        }
        ctx.restore();
      }
    });

    if (shadowEnabled && shadowType === "inner" && shadowOpacity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      renderWithShadowTrick("fill", shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity, "transparent");
      ctx.restore();
    }

    // 9. Extra scanline grid (Glitch only)
    if (isGlitchEffect) {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1.5;
      for (let ly = yMin; ly < yMax; ly += 4) {
        ctx.beginPath();
        ctx.moveTo(xMin - 50, ly);
        ctx.lineTo(xMax + 50, ly);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export const InfraContourAestheticDefinition = {
  id: "infra-contour",
  name: "Infra Contour",
  text: "CLYPRA",
  category: "classic",
  description: "A custom Canvas 2D text effect named Infra Contour with none fill.",
  tags: ["studio-export", "custom-canvas", "none"],
  font: {
    family: "Arial Rounded MT Bold",
    weight: 700,
    style: "normal",
    letterSpacing: 4,
    lineHeight: 1.2,
  },
  fills: [],
  strokes: [
    {
      color: "#ffffff",
      width: 1,
      position: "outside",
      opacity: 100,
      lineJoin: "round",
    },
  ],
  shadows: [],
  glows: [
    {
      color: "#FF003C",
      blur: 15,
      opacity: 10,
      type: "outer",
    },
  ],
  panel: null,
} as any;
