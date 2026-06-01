import React from "react";
import { useUIStore } from "@/store/uiStore";

/**
 * Hook for viewport keyboard shortcuts
 */
export function useViewportKeyboardShortcuts(canvasWidth: number, canvasHeight: number, containerWidth: number, containerHeight: number) {
  const { previewViewport, setPreviewZoom, resetPreviewViewport, zoomPreviewToFit } = useUIStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if Ctrl/Cmd is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      switch (e.key) {
        case "=":
        case "+":
          e.preventDefault();
          setPreviewZoom(previewViewport.zoom * 1.2);
          break;

        case "-":
        case "_":
          e.preventDefault();
          setPreviewZoom(previewViewport.zoom / 1.2);
          break;

        case "0":
          e.preventDefault();
          zoomPreviewToFit(canvasWidth, canvasHeight, containerWidth, containerHeight);
          break;

        case "r":
        case "R":
          e.preventDefault();
          resetPreviewViewport();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewViewport.zoom, canvasWidth, canvasHeight, containerWidth, containerHeight, setPreviewZoom, resetPreviewViewport, zoomPreviewToFit]);
}

/**
 * Hook for viewport mouse wheel zoom
 *
 * Uses Zustand getState() to read fresh viewport state in the wheel handler,
 * avoiding stale-closure issues and eliminating effect re-subscriptions during zoom.
 */
export function useViewportWheelZoom(containerRef: React.RefObject<HTMLElement>) {
  const setPreviewZoom = useUIStore((s) => s.setPreviewZoom);
  const setPreviewPan = useUIStore((s) => s.setPreviewPan);

  React.useEffect(() => {
    let debugCount = 0;
    const debugMax = 30;
    const logWheel = (stage: string, payload?: Record<string, unknown>) => {
      if (debugCount >= debugMax) return;
      debugCount += 1;
      console.log(`[PreviewWheel] ${stage}`, payload ?? {});
    };

    const handleWheel = (e: WheelEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const target = e.target as Node | null;
      const inPreview = !!target && container.contains(target);
      if (!inPreview) {
        return;
      }

      e.preventDefault();

      // Read fresh viewport state (avoids stale closure)
      const { previewViewport } = useUIStore.getState();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Smooth zoom behavior across mouse wheels and trackpads.
      // Use exponential scaling with normalized delta for stable feel.
      const lineHeightPx = 16;
      const pageHeightPx = rect.height || 800;
      const deltaPx = e.deltaMode === 1 ? e.deltaY * lineHeightPx : e.deltaMode === 2 ? e.deltaY * pageHeightPx : e.deltaY;
      const zoomFactor = Math.exp(-deltaPx * 0.0015);
      const newZoom = Math.max(0.1, Math.min(5.0, previewViewport.zoom * zoomFactor));

      // Calculate pan to keep mouse position fixed
      const zoomRatio = newZoom / previewViewport.zoom;
      const newPanX = mouseX - (mouseX - previewViewport.panX) * zoomRatio;
      const newPanY = mouseY - (mouseY - previewViewport.panY) * zoomRatio;

      setPreviewZoom(newZoom);
      setPreviewPan(newPanX, newPanY);
    };

    // Use window-level listener and scope by contains(target) to avoid
    // event-loss through layered overlays and retargeting quirks.
    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
  }, [containerRef, setPreviewZoom, setPreviewPan]);
}

/**
 * Hook for viewport pan (space + drag or middle mouse)
 *
 * Uses refs for mutable pan state and Zustand getState() for fresh viewport reads.
 * This eliminates stale-closure drift and prevents effect re-subscriptions during panning.
 */
export function useViewportPan(containerRef: React.RefObject<HTMLElement>) {
  const setPreviewPan = useUIStore((s) => s.setPreviewPan);
  const [isPanning, setIsPanning] = React.useState(false);
  const [spacePressed, setSpacePressed] = React.useState(false);

  // Use refs for values that change rapidly during pan — avoids effect churn
  const isPanningRef = React.useRef(false);
  const panStartRef = React.useRef({ x: 0, y: 0 });
  const spacePressedRef = React.useRef(false);

  // Keep refs in sync with state (state drives UI, refs drive handlers)
  isPanningRef.current = isPanning;
  spacePressedRef.current = spacePressed;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        setSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Space + left click OR middle mouse button
      if ((spacePressedRef.current && e.button === 0) || e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;

      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;

      // Read fresh viewport state (avoids stale closure)
      const { previewViewport } = useUIStore.getState();
      setPreviewPan(previewViewport.panX + deltaX, previewViewport.panY + deltaY);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // Stable deps only — refs handle mutable state, so listeners don't need re-attaching
  }, [containerRef, setPreviewPan]);

  return { isPanning, spacePressed };
}
