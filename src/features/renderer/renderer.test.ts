import { beforeAll, afterAll, describe, test, expect, vi } from "vitest";
import { renderTextEffect, renderTextEffectToDataURL } from "./renderer";
import { TextEffectDefinition } from "./types";
import { goldFoilStamp, classicInk, neonYellowOutline, glowYellowSparkles } from "./definitions";

const moltenGold3d: TextEffectDefinition = {
  id: "molten-gold-3d",
  name: "Molten Gold 3D",
  category: "metallic",
  description: "3D golden metallic text style",
  tags: ["gold", "metal", "3d"],
  font: {
    family: "Outfit",
    weight: 800,
    style: "normal",
    letterSpacing: 2,
    lineHeight: 1.2,
  },
  fills: [
    {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#FFE259" },
        { position: 1, color: "#FFA751" },
      ],
    },
  ],
  strokes: [
    { color: "#FFA751", width: 2, position: "outside", opacity: 1 },
  ],
  shadows: [
    { type: "drop", color: "rgba(0,0,0,0.5)", blur: 4, offsetX: 2, offsetY: 2, opacity: 1 },
  ],
  bevel: {
    depth: 8,
    highlightColor: "#FFFFFF",
    shadowColor: "#000000",
  },
};

const glitchCorrupt: TextEffectDefinition = {
  id: "glitch-corrupt",
  name: "Glitch Corrupt",
  category: "glitch",
  description: "High-intensity glitch effect",
  tags: ["glitch", "sci-fi"],
  font: {
    family: "Courier New",
    weight: 700,
    style: "normal",
    letterSpacing: 0,
    lineHeight: 1.2,
  },
  fills: [{ type: "solid", color: "#FFFFFF" }],
  strokes: [],
  shadows: [],
  glitch: {
    enabled: true,
    rgbOffset: 4,
    slices: 5,
    sliceMaxOffset: 10,
    scanlineOpacity: 0.2,
    glitchIntensity: 1.0,
    blockArtifacts: true,
    noiseBar: true,
  },
};

const allEffects = [moltenGold3d, glitchCorrupt];

// Mock canvas rendering context 2D
const mockCtx = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  strokeRect: vi.fn(),
  createImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(800 * 400 * 4),
  })),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createConicGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(800 * 400 * 4),
  })),
  putImageData: vi.fn(),
  measureText: vi.fn(() => ({ width: 120 })),
  font: "",
  textBaseline: "",
  textAlign: "",
  letterSpacing: "",
  shadowColor: "",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  strokeStyle: "",
  lineWidth: 0,
  lineJoin: "",
  fillStyle: "",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
};

beforeAll(() => {
  vi.stubGlobal("Image", class {
    src = "";
    complete = true;
    onload = () => {};
  });

  HTMLCanvasElement.prototype.getContext = vi.fn((type) => {
    if (type === "2d") return mockCtx as any;
    return null;
  });

  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mockedDataURL");
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Clypra Text Effects Engine & Presets", () => {
  test("All mock effect definitions have unique IDs", () => {
    const ids = allEffects.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(2);
    expect(uniqueIds.size).toBe(2);
  });

  test("All mock effect definitions compile with correct category mappings", () => {
    allEffects.forEach((effect) => {
      expect(effect.id).toBeDefined();
      expect(effect.name).toBeDefined();
      expect(effect.category).toBeDefined();
      expect(Array.isArray(effect.tags)).toBe(true);
      expect(effect.font).toBeDefined();
      expect(Array.isArray(effect.fills)).toBe(true);
      expect(Array.isArray(effect.strokes)).toBe(true);
      expect(Array.isArray(effect.shadows)).toBe(true);
    });
  });

  test("renderTextEffect executes without throwing for all mock presets", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;

    allEffects.forEach((effect) => {
      expect(() => {
        renderTextEffect(canvas, "Clypra Test", effect, 48);
      }).not.toThrow();
    });
  });

  test("renderTextEffectToDataURL generates a valid base64 PNG data URL", () => {
    const dataURL = renderTextEffectToDataURL("Export Preview", moltenGold3d, 48, 800, 400);
    expect(dataURL).toBeDefined();
    expect(typeof dataURL).toBe("string");
    expect(dataURL.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("Neon Yellow Outline early return renderer draws custom stroke and fill", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;

    mockCtx.strokeText.mockClear();
    mockCtx.fillText.mockClear();

    renderTextEffect(canvas, "Neon Glow", neonYellowOutline, 44);

    // Should call strokeText (tight glow + wide glow + outside black outline)
    expect(mockCtx.strokeText).toHaveBeenCalled();
    // Should call fillText (tight glow + wide glow + white body fill)
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  test("Gold Foil Stamp rendering runs cleanly without throwing errors", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;

    expect(() => {
      renderTextEffect(canvas, "PRESTIGE", goldFoilStamp, 44);
    }).not.toThrow();
  });

  test("Classic Ink rendering runs cleanly without throwing errors", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;

    expect(() => {
      renderTextEffect(canvas, "TEXT", classicInk, 48);
    }).not.toThrow();
  });

  test("Yellow Glow Sparkles rendering runs cleanly without throwing errors", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;

    expect(() => {
      renderTextEffect(canvas, "SPARKLE", glowYellowSparkles, 44);
    }).not.toThrow();
  });
});
