/**
 * Video Decode Manager
 *
 * Intelligent decoder selection and fallback strategy.
 * Chooses optimal decode path based on:
 * - Browser capabilities (WebCodecs support)
 * - Video format/codec
 * - Decode context (thumbnail vs playback)
 * - Performance characteristics
 *
 * Decode Paths:
 * 1. GPU (WebCodecs): Best performance, frame-accurate
 * 2. Standard (HTMLVideoElement): Universal fallback
 *
 * Usage:
 *   const manager = VideoDecodeManager.getInstance();
 *   const bitmap = await manager.decodeFrame(videoPath, timestamp);
 */

import { gpuDecoderPool } from "./GPUVideoDecoder";
import { performanceMonitor } from "../monitoring/PerformanceMonitor";

export interface DecodeOptions {
  /** Preferred decode method */
  preferredMethod?: "gpu" | "standard" | "auto";
  /** Target dimensions (for optimization) */
  width?: number;
  height?: number;
  /** Priority (higher = decode sooner) */
  priority?: number;
}

export interface DecodeResult {
  bitmap: ImageBitmap;
  timestampSeconds: number;
  method: "gpu" | "standard";
  duration: number;
}

/**
 * Video Decode Manager
 *
 * Manages decode path selection and fallback logic.
 */
export class VideoDecodeManager {
  private static instance: VideoDecodeManager | null = null;
  private gpuSupported: boolean;
  private gpuEnabled: boolean = true;

  // Performance tracking for adaptive path selection
  private gpuDecodeStats = { successes: 0, failures: 0, avgLatency: 0 };
  private standardDecodeStats = { successes: 0, failures: 0, avgLatency: 0 };

  private constructor() {
    this.gpuSupported = gpuDecoderPool.isGPUAccelerationSupported();

    if (this.gpuSupported) {
      console.log("[VideoDecodeManager] GPU acceleration available");
    } else {
      console.log("[VideoDecodeManager] GPU acceleration not available, using standard decode");
    }
  }

  static getInstance(): VideoDecodeManager {
    if (!VideoDecodeManager.instance) {
      VideoDecodeManager.instance = new VideoDecodeManager();
    }
    return VideoDecodeManager.instance;
  }

  /**
   * Decode a frame at specific timestamp
   *
   * Automatically selects best decode path based on capabilities and performance.
   */
  async decodeFrame(videoPath: string, timestampSeconds: number, options: DecodeOptions = {}): Promise<DecodeResult> {
    const { preferredMethod = "auto", width, height, priority = 0 } = options;

    performanceMonitor.increment("video_decode.request");
    const startTime = performance.now();

    try {
      // Determine decode method
      const method = this.selectDecodeMethod(preferredMethod);

      let result: DecodeResult;

      if (method === "gpu" && this.gpuSupported && this.gpuEnabled) {
        try {
          const gpuResult = await gpuDecoderPool.decodeFrame(videoPath, timestampSeconds, priority);
          result = {
            ...gpuResult,
            method: "gpu",
          };

          // Update stats
          const latency = performance.now() - startTime;
          this.updateStats(this.gpuDecodeStats, latency, true);

          performanceMonitor.increment("video_decode.gpu_success");
        } catch (error) {
          console.warn(`[VideoDecodeManager] GPU decode failed, falling back to standard:`, error);
          this.updateStats(this.gpuDecodeStats, 0, false);
          performanceMonitor.increment("video_decode.gpu_fallback");

          // Fallback to standard
          result = await this.decodeFrameStandard(videoPath, timestampSeconds);
        }
      } else {
        result = await this.decodeFrameStandard(videoPath, timestampSeconds);
      }

      performanceMonitor.timing("video_decode.latency", performance.now() - startTime);
      performanceMonitor.increment("video_decode.success");

      return result;
    } catch (error) {
      performanceMonitor.increment("video_decode.error");
      throw error;
    }
  }

  /**
   * Standard decode using HTMLVideoElement
   */
  private async decodeFrameStandard(videoPath: string, timestampSeconds: number): Promise<DecodeResult> {
    const startTime = performance.now();

    try {
      // Create temporary video element
      const video = document.createElement("video");
      video.src = videoPath;
      video.preload = "metadata";
      video.muted = true;

      // Wait for video to load
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", reject, { once: true });
      });

      // Seek to timestamp
      video.currentTime = timestampSeconds;

      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.addEventListener("error", reject, { once: true });
      });

      // Create ImageBitmap from video frame
      const bitmap = await createImageBitmap(video);

      // Cleanup
      video.remove();

      const latency = performance.now() - startTime;
      this.updateStats(this.standardDecodeStats, latency, true);

      performanceMonitor.increment("video_decode.standard_success");

      return {
        bitmap,
        timestampSeconds: video.currentTime,
        method: "standard",
        duration: latency,
      };
    } catch (error) {
      this.updateStats(this.standardDecodeStats, 0, false);
      performanceMonitor.increment("video_decode.standard_error");
      throw error;
    }
  }

  /**
   * Select decode method based on preferences and capabilities
   */
  private selectDecodeMethod(preferred: "gpu" | "standard" | "auto"): "gpu" | "standard" {
    if (preferred === "gpu") return "gpu";
    if (preferred === "standard") return "standard";

    // Auto selection based on availability and performance
    if (!this.gpuSupported || !this.gpuEnabled) return "standard";

    // Use GPU if available and performing well
    const gpuFailureRate = this.gpuDecodeStats.failures / Math.max(1, this.gpuDecodeStats.successes + this.gpuDecodeStats.failures);

    if (gpuFailureRate > 0.3) {
      // Too many GPU failures - disable and use standard
      console.warn(`[VideoDecodeManager] High GPU failure rate (${(gpuFailureRate * 100).toFixed(1)}%), disabling GPU decode`);
      this.gpuEnabled = false;
      return "standard";
    }

    return "gpu";
  }

  /**
   * Update performance statistics
   */
  private updateStats(stats: typeof this.gpuDecodeStats, latency: number, success: boolean): void {
    if (success) {
      stats.successes++;
      // Running average
      stats.avgLatency = (stats.avgLatency * (stats.successes - 1) + latency) / stats.successes;
    } else {
      stats.failures++;
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      gpuSupported: this.gpuSupported,
      gpuEnabled: this.gpuEnabled,
      gpu: { ...this.gpuDecodeStats },
      standard: { ...this.standardDecodeStats },
      gpuPool: this.gpuSupported ? gpuDecoderPool.getStats() : null,
    };
  }

  /**
   * Enable/disable GPU acceleration
   */
  setGPUEnabled(enabled: boolean): void {
    this.gpuEnabled = enabled && this.gpuSupported;
    console.log(`[VideoDecodeManager] GPU acceleration ${this.gpuEnabled ? "enabled" : "disabled"}`);
  }

  /**
   * Release resources for a video
   */
  releaseVideo(videoPath: string): void {
    if (this.gpuSupported) {
      gpuDecoderPool.closeDecoder(videoPath);
    }
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    if (this.gpuSupported) {
      gpuDecoderPool.dispose();
    }
  }
}

// Export singleton
export const videoDecodeManager = VideoDecodeManager.getInstance();

// Expose for debugging
if (typeof window !== "undefined") {
  (window as any).__videoDecodeManager = videoDecodeManager;
}
