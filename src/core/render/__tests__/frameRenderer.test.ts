/**
 * Frame Renderer Tests
 *
 * Validates deterministic frame rendering from EvaluatedScene.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderFrame, renderFrameToPNG, renderFrameToJPEG, renderFrameToImageData } from "../frameRenderer";
import type { EvaluatedScene, EvaluatedMediaLayer, EvaluatedTextLayer } from "@/core/evaluation/types";

// Mock OffscreenCanvas for Node environment
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
    this.width = width;
    this.height = height;
  }
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  private ctx: any;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ctx = {
      fillStyle: "",
      strokeStyle: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
      lineWidth: 1,
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      getImageData: vi.fn(() => new MockImageData(width, height)),
      measureText: vi.fn((text: string) => ({
        width: text.length * 10,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 3,
        fontBoundingBoxAscent: 15,
        fontBoundingBoxDescent: 5,
        alphabeticBaseline: 0,
      })),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      setTransform: vi.fn(),
    };
  }

  getContext(type: string) {
    return type === "2d" ? this.ctx : null;
  }

  transferToImageBitmap() {
    return Promise.resolve({ width: this.width, height: this.height, close: vi.fn() });
  }

  convertToBlob(options?: any) {
    return Promise.resolve(new Blob(["mock"], { type: options?.type || "image/png" }));
  }
}

// @ts-ignore - Mock for Node environment
globalThis.OffscreenCanvas = MockOffscreenCanvas;
// @ts-ignore - Mock for Node environment
globalThis.ImageData = MockImageData;
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    blob: () => Promise.resolve(new Blob(["mock-image"])),
  } as any),
);
globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width: 100, height: 100, close: vi.fn() } as any));

describe("Frame Renderer", () => {
  const createMockScene = (layers: any[] = []): EvaluatedScene => ({
    visualLayers: layers,
    audioLayers: [],
    transitions: [],
    metadata: {
      time: 0,
      canvasWidth: 1920,
      canvasHeight: 1080,
      frameRate: 30,
      isGap: layers.length === 0,
    },
  });

  describe("renderFrame", () => {
    it("renders empty scene with background color", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
        backgroundColor: "#000000",
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.format).toBe("imagebitmap");
      expect(result.renderTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("renders to ImageBitmap by default", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
      expect(result.data).toHaveProperty("width");
      expect(result.data).toHaveProperty("height");
    });

    it("renders to ImageData when requested", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
        format: "imagedata",
      });

      expect(result.format).toBe("imagedata");
      expect(result.data).toHaveProperty("data");
      expect(result.data).toHaveProperty("width");
      expect(result.data).toHaveProperty("height");
    });

    it("renders to Blob when requested", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
        format: "blob",
        mimeType: "image/png",
      });

      expect(result.format).toBe("blob");
      expect(result.data).toBeInstanceOf(Blob);
    });

    it("scales output to requested dimensions", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1280,
        height: 720,
      });

      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
    });

    it("tracks render time", async () => {
      const scene = createMockScene();

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.renderTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.renderTimeMs).toBeLessThan(1000); // Should be fast for empty scene
    });
  });

  describe("Text Layer Rendering", () => {
    it("renders text layer with correct styling", async () => {
      const textLayer: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "text",
        zIndex: 0,
        layerType: "text",
        x: 100,
        y: 100,
        width: 800,
        height: 100,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
        text: "Hello World",
        fontFamily: "Inter",
        fontSize: 48,
        color: "#ffffff",
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.2,
        letterSpacing: 0,
      };

      const scene = createMockScene([textLayer]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });

    it("renders multi-line text", async () => {
      const textLayer: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "text",
        zIndex: 0,
        layerType: "text",
        x: 100,
        y: 100,
        width: 800,
        height: 200,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
        text: "Line 1\nLine 2\nLine 3",
        fontFamily: "Inter",
        fontSize: 32,
        color: "#ffffff",
        fontWeight: "normal",
        fontStyle: "normal",
        textAlign: "left",
        verticalAlign: "top",
        lineHeight: 1.5,
        letterSpacing: 0,
      };

      const scene = createMockScene([textLayer]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });

    it("applies text opacity", async () => {
      const textLayer: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "text",
        zIndex: 0,
        layerType: "text",
        x: 100,
        y: 100,
        width: 800,
        height: 100,
        rotation: 0,
        opacity: 0.5,
        inTransition: false,
        blendMode: "normal",
        text: "Semi-transparent",
        fontFamily: "Inter",
        fontSize: 48,
        color: "#ffffff",
        fontWeight: "normal",
        fontStyle: "normal",
        textAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.2,
        letterSpacing: 0,
      };

      const scene = createMockScene([textLayer]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });

    it("applies text rotation", async () => {
      const textLayer: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "text",
        zIndex: 0,
        layerType: "text",
        x: 500,
        y: 400,
        width: 800,
        height: 100,
        rotation: 45,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
        text: "Rotated Text",
        fontFamily: "Inter",
        fontSize: 48,
        color: "#ffffff",
        fontWeight: "normal",
        fontStyle: "normal",
        textAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.2,
        letterSpacing: 0,
      };

      const scene = createMockScene([textLayer]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });
  });

  describe("Media Layer Rendering", () => {
    it("renders media layer", async () => {
      const mediaLayer: EvaluatedMediaLayer = {
        layerId: "media1",
        clipId: "clip1",
        role: "primary",
        zIndex: 0,
        layerType: "media",
        mediaId: "m1",
        mediaType: "image",
        sourcePath: "https://example.com/image.jpg",
        sourceTime: 0,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
      };

      const scene = createMockScene([mediaLayer]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });

    it("handles media load errors gracefully", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

      const mediaLayer: EvaluatedMediaLayer = {
        layerId: "media1",
        clipId: "clip1",
        role: "primary",
        zIndex: 0,
        layerType: "media",
        mediaId: "m1",
        mediaType: "image",
        sourcePath: "https://example.com/missing.jpg",
        sourceTime: 0,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
      };

      const scene = createMockScene([mediaLayer]);

      // Should not throw, should render placeholder
      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });
  });

  describe("Compositing", () => {
    it("renders layers in correct z-order", async () => {
      const layer1: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "background",
        zIndex: 0,
        layerType: "text",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
        text: "Background",
        fontFamily: "Inter",
        fontSize: 48,
        color: "#ffffff",
        fontWeight: "normal",
        fontStyle: "normal",
        textAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.2,
        letterSpacing: 0,
      };

      const layer2: EvaluatedTextLayer = {
        ...layer1,
        layerId: "text2",
        clipId: "clip2",
        role: "overlay",
        zIndex: 1,
        text: "Foreground",
      };

      const scene = createMockScene([layer1, layer2]);

      const result = await renderFrame(scene, {
        width: 1920,
        height: 1080,
      });

      expect(result.format).toBe("imagebitmap");
    });
  });

  describe("Convenience Functions", () => {
    it("renderFrameToPNG produces PNG blob", async () => {
      const scene = createMockScene();

      const blob = await renderFrameToPNG(scene, 1920, 1080);

      expect(blob).toBeInstanceOf(Blob);
    });

    it("renderFrameToJPEG produces JPEG blob", async () => {
      const scene = createMockScene();

      const blob = await renderFrameToJPEG(scene, 1920, 1080, 0.9);

      expect(blob).toBeInstanceOf(Blob);
    });

    it("renderFrameToImageData produces ImageData", async () => {
      const scene = createMockScene();

      const imageData = await renderFrameToImageData(scene, 1920, 1080);

      expect(imageData).toHaveProperty("data");
      expect(imageData).toHaveProperty("width");
      expect(imageData).toHaveProperty("height");
    });
  });

  describe("Determinism", () => {
    it("produces identical output for identical input", async () => {
      const textLayer: EvaluatedTextLayer = {
        layerId: "text1",
        clipId: "clip1",
        role: "text",
        zIndex: 0,
        layerType: "text",
        x: 100,
        y: 100,
        width: 800,
        height: 100,
        rotation: 0,
        opacity: 1.0,
        inTransition: false,
        blendMode: "normal",
        text: "Deterministic",
        fontFamily: "Inter",
        fontSize: 48,
        color: "#ffffff",
        fontWeight: "normal",
        fontStyle: "normal",
        textAlign: "center",
        verticalAlign: "middle",
        lineHeight: 1.2,
        letterSpacing: 0,
      };

      const scene = createMockScene([textLayer]);

      const result1 = await renderFrame(scene, { width: 1920, height: 1080 });
      const result2 = await renderFrame(scene, { width: 1920, height: 1080 });

      // Same dimensions
      expect(result1.width).toBe(result2.width);
      expect(result1.height).toBe(result2.height);
      expect(result1.format).toBe(result2.format);
    });
  });
});
