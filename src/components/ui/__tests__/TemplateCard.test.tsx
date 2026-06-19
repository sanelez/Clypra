import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TemplateCard } from "../TemplateCard";
import { TextEffectsApi } from "@/features/text-effects/api/textEffectsApi";
import type { TemplateDefinition } from "@/features/text-templates/types";

// Mock the TemplatePreviewPlayer component
vi.mock("@/features/text-templates", () => {
  const React = require("react");
  const MockPlayer = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      goToFrame: vi.fn(),
      getAnimation: vi.fn(() => ({
        totalFrames: 100,
        frameRate: 30,
        isLoaded: true,
      })),
    }));
    return React.createElement("div", { "data-testid": "mock-lottie-player" });
  });
  MockPlayer.displayName = "MockTemplatePreviewPlayer";
  return {
    TemplatePreviewPlayer: MockPlayer,
  };
});

// Mock TextEffectsApi
vi.mock("@/features/text-effects/api/textEffectsApi", () => ({
  TextEffectsApi: {
    getLottieTemplate: vi.fn(),
  },
}));

describe("TemplateCard Component", () => {
  const mockTemplate: TemplateDefinition = {
    id: "template-1",
    category: "lower-third",
    name: "Minimal Lower Third",
    label: "Minimal Lower Third",
    thumbnail: "", // API returns empty string
    preview: "",
    thumbnailUrl: "http://example.com/template-thumbnail.png", // fallback
    durationFrames: 60,
    thumbnailFrame: 10,
    lottieData: null,
    description: "Mock template description",
    tags: ["mock", "test"],
    fps: 30,
    width: 1920,
    height: 1080,
    canvasWidth: 1920,
    canvasHeight: 1080,
    duration: 2,
    textLayers: [],
    layers: [],
    defaultPlacement: "lower-third",
    lottieFile: "mock.json",
  };

  const defaultProps = {
    template: mockTemplate,
    isFavorite: false,
    isDownloading: false,
    isDownloaded: false,
    onFavorite: vi.fn(),
    onApply: vi.fn(),
    onPreview: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gracefully falls back to thumbnailUrl when thumbnail is empty", () => {
    render(<TemplateCard {...defaultProps} />);

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("http://example.com/template-thumbnail.png");
    expect(img.alt).toBe("Minimal Lower Third");
  });

  it("prefetches Lottie data from API on mouse enter/hover", async () => {
    const mockLottieData = {
      id: "template-1",
      category: "lower-third",
      label: "Minimal Lower Third",
      duration: 2,
      canvasWidth: 1920,
      canvasHeight: 1080,
      thumbnail: "",
      preview: "",
      layers: []
    };
    vi.mocked(TextEffectsApi.getLottieTemplate).mockResolvedValue(mockLottieData);

    render(<TemplateCard {...defaultProps} />);

    const card = screen.getByRole("img").closest("div");
    expect(card).toBeDefined();
    if (card) {
      fireEvent.mouseEnter(card);
    }

    // Displays Loader during fetch
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(() => {
      expect(TextEffectsApi.getLottieTemplate).toHaveBeenCalledWith("lower-third", "template-1");
      expect(screen.getByTestId("mock-lottie-player")).toBeInTheDocument();
    });
  });

  it("calls onPreview when clicked", () => {
    render(<TemplateCard {...defaultProps} />);

    const card = screen.getByRole("img").closest("div");
    if (card) fireEvent.click(card);

    expect(defaultProps.onPreview).toHaveBeenCalledTimes(1);
  });

  it("calls onFavorite when favorite star is clicked", () => {
    render(<TemplateCard {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const starBtn = buttons[0];
    fireEvent.click(starBtn);

    expect(defaultProps.onFavorite).toHaveBeenCalledTimes(1);
  });

  it("calls onApply when the apply/download button is clicked", () => {
    render(<TemplateCard {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const downloadBtn = buttons[1];
    fireEvent.click(downloadBtn);

    expect(defaultProps.onApply).toHaveBeenCalledTimes(1);
  });

  it("renders download overlay when isDownloading is true", () => {
    render(<TemplateCard {...defaultProps} isDownloading={true} />);
    expect(screen.getByText("Downloading...")).toBeInTheDocument();
  });
});
