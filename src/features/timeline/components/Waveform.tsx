/**
 * Waveform Component for Timeline Engine v1
 * Renders audio waveform visualization using HTML5 Canvas
 */

import { useEffect, useRef } from "react";

export interface WaveformProps {
  peaks: number[] | null;
  width: number;
  height: number;
  className?: string;
}

/**
 * Renders waveform using HTML5 Canvas with high-DPI support
 * Uses requestAnimationFrame for smooth updates
 */
export function Waveform({ peaks, width, height, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // If no peaks data, render empty state
      if (!peaks || peaks.length === 0) return;

      const centerY = height / 2;

      ctx.fillStyle = "#10b981"; // emerald-500

      // CapCut-style thin waveform with high density
      // Fixed: 1px bar width with 1px gap = 2px per bar (very dense like reference)
      const pixelsPerBar = 2;
      const totalBars = Math.ceil(width / pixelsPerBar);
      const step = Math.max(1, Math.floor(peaks.length / totalBars));

      for (let i = 0; i < totalBars; i++) {
        // Sample from peaks array
        const peakIndex = Math.min(i * step, peaks.length - 1);
        const peakValue = peaks[peakIndex];

        // Thinner bars - only 1px wide
        const barHeight = Math.max(2, peakValue * centerY * 0.85); // slightly scaled down
        const x = i * pixelsPerBar;

        // Draw thin vertical line
        ctx.fillRect(x, centerY - barHeight, 1, barHeight * 2);
      }
    });

    // Cleanup: cancel animation frame on unmount or dependency change
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [peaks, width, height]);

  if (width <= 0 || height <= 0) return null;

  return <canvas ref={canvasRef} className={className} aria-label="Audio waveform visualization" />;
}
