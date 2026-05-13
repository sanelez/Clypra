import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";

describe("useFullscreen", () => {
  let mockFullscreenElement: Element | null = null;
  let fullscreenChangeListeners: Array<() => void> = [];

  beforeEach(() => {
    // Mock fullscreen API
    mockFullscreenElement = null;
    fullscreenChangeListeners = [];

    Object.defineProperty(document, "fullscreenEnabled", {
      writable: true,
      value: true,
    });

    Object.defineProperty(document, "fullscreenElement", {
      get: () => mockFullscreenElement,
    });

    document.documentElement.requestFullscreen = vi.fn(async () => {
      mockFullscreenElement = document.documentElement;
      fullscreenChangeListeners.forEach((listener) => listener());
    });

    document.exitFullscreen = vi.fn(async () => {
      mockFullscreenElement = null;
      fullscreenChangeListeners.forEach((listener) => listener());
    });

    document.addEventListener = vi.fn((event: string, listener: any) => {
      if (event === "fullscreenchange") {
        fullscreenChangeListeners.push(listener);
      }
    });

    document.removeEventListener = vi.fn((event: string, listener: any) => {
      if (event === "fullscreenchange") {
        fullscreenChangeListeners = fullscreenChangeListeners.filter((l) => l !== listener);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with isFullscreen false", () => {
    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isSupported).toBe(true);
  });

  it("should enter fullscreen", async () => {
    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.enterFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(true);
    });

    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it("should exit fullscreen", async () => {
    const { result } = renderHook(() => useFullscreen());

    // Enter fullscreen first
    await act(async () => {
      await result.current.enterFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(true);
    });

    // Exit fullscreen
    await act(async () => {
      await result.current.exitFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(false);
    });

    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it("should toggle fullscreen", async () => {
    const { result } = renderHook(() => useFullscreen());

    // Toggle to enter
    await act(async () => {
      await result.current.toggleFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(true);
    });

    // Toggle to exit
    await act(async () => {
      await result.current.toggleFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(false);
    });
  });

  it("should call onFullscreenChange callback", async () => {
    const onFullscreenChange = vi.fn();
    const { result } = renderHook(() => useFullscreen({ onFullscreenChange }));

    await act(async () => {
      await result.current.enterFullscreen();
    });

    await waitFor(() => {
      expect(onFullscreenChange).toHaveBeenCalledWith(true);
    });

    await act(async () => {
      await result.current.exitFullscreen();
    });

    await waitFor(() => {
      expect(onFullscreenChange).toHaveBeenCalledWith(false);
    });
  });

  it("should handle unsupported fullscreen API", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      writable: true,
      value: false,
    });

    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isSupported).toBe(false);
  });
});
