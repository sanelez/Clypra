import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TemplateCard } from "../TemplateCard";
import { ClypraApi } from "@/features/text-effects/api/clypraApi";
import type { TemplateDefinition } from "@/features/text-templates/types";

// Mock the LottiePlayer component
vi.mock("@/features/text-templates/LottiePlayer", () => ({
  LottiePlayer: vi.fn(() => <div data-testid="mock-lottie-player" />),
}));

// Mock ClypraApi
vi.mock("@/features/text-effects/api/clypraApi", () => ({
  ClypraApi: {
    getLottieTemplate: vi.fn(),
  },
}));

describe("TemplateCard Component", () => {
  const mockTemplate: TemplateDefinition = {
    id: "template-1",
    category: "lower-third",
    name: "Minimal Lower Third",
    thumbnail: "", // API returns empty string
    thumbnailUrl: "http://example.com/template-thumbnail.png", // fallback
    durationFrames: 60,
    thumbnailFrame: 10,
    lottieData: null,
    description: "Mock template description",
    tags: ["mock", "test"],
    fps: 30,
    width: 1920,
    height: 1080,
    textLayers: [],
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
    const mockLottieData = { v: "5.5.0", fr: 30, ip: 0, op: 60 };
    vi.mocked(ClypraApi.getLottieTemplate).mockResolvedValue(mockLottieData);

    render(<TemplateCard {...defaultProps} />);
    
    const card = screen.getByRole("img").closest("div");
    expect(card).toBeDefined();
    if (card) {
      fireEvent.mouseEnter(card);
    }

    // Displays Loader during fetch
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(() => {
      expect(ClypraApi.getLottieTemplate).toHaveBeenCalledWith("lower-third", "template-1");
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
