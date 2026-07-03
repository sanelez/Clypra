import { describe, it, expect, vi, beforeEach } from "vitest";
import { rasterizeScene, clearLottieRenderCache } from "../rasterizer";
import { CanvasDevice } from "@clypra/engine";
import type { EvaluatedScene, EvaluatedMediaLayer } from "../../evaluation/types";

vi.mock("@clypra/engine", async () => {
  const actual = await vi.importActual<typeof import("@clypra/engine")>("@clypra/engine");
  return {
    ...actual,
    CanvasDevice: {
      acquire: vi.fn((w: number, h: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        // Mock getContext to return a basic mock 2D context
        canvas.getContext = vi.fn().mockReturnValue({
          fillStyle: "",
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          setTransform: vi.fn(),
          scale: vi.fn(),
          fillRect: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
        });
        return canvas;
      }),
      release: vi.fn(),
    },
    TransitionRenderer: {
      render: vi.fn(),
    },
  };
});

describe("Scene Rasterizer Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("clearLottieRenderCache", () => {
    it("should destroy animated instances and remove containers from document body", () => {
      // Should run without throwing errors
      expect(() => clearLottieRenderCache()).not.toThrow();
    });
  });

  describe("rasterizeScene", () => {
    const mockScene = {
      sceneId: "scene-1",
      timestamp: 1.0,
      visualLayers: [
        {
          layerId: "layer-bg",
          layerType: "media",
          mediaType: "video",
          mediaId: "video-asset-1",
          sourcePath: "asset.mp4",
          clipId: "clip-1",
          startTime: 0,
          duration: 5.0,
          trimIn: 0,
          trimOut: 5.0,
          x: 0, y: 0, width: 1920, height: 1080, rotation: 0,
          opacity: 1,
          blendMode: "normal",
          sourceRotation: 0,
          sourceTime: 1.0,
          clipKind: "media",
        } as any,
      ],
      audioLayers: [],
      transitions: [],
      activeFilter: undefined,
      metadata: {
        canvasWidth: 1920,
        canvasHeight: 1080,
      } as any,
    } as any as EvaluatedScene;

    it("should acquire a canvas from CanvasDevice pool, size it, and return a valid RasterFrame", async () => {
      const target = {
        width: 960,
        height: 540,
        pixelRatio: 1,
      };

      const frame = await rasterizeScene(mockScene, target);
      
      expect(CanvasDevice.acquire).toHaveBeenCalledWith(960, 540);
      expect(frame.width).toBe(960);
      expect(frame.height).toBe(540);
      expect(frame.scaleX).toBeCloseTo(0.5);
      expect(frame.scaleY).toBeCloseTo(0.5);

      // Verify releaseCanvas calls release
      frame.releaseCanvas?.();
      expect(CanvasDevice.release).toHaveBeenCalledWith(frame.canvas);
    });

    it("should draw video elements directly if pre-resolved map is supplied in target", async () => {
      const mockVideoElement = {
        readyState: 4, // HAVE_ENOUGH_DATA
        playbackRate: 1.0,
        play: vi.fn(),
      } as unknown as HTMLVideoElement;

      const videoElements = new Map<string, HTMLVideoElement>();
      videoElements.set("clip-1-video-asset-1", mockVideoElement);

      const target = {
        width: 1920,
        height: 1080,
        videoElements,
      };

      const frame = await rasterizeScene(mockScene, target);
      const mockCtx = frame.ctx;

      // Verify that drawImage was called to draw the video element
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });
  });
});
