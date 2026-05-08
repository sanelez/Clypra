/**
 * Performance Metrics Tracker
 *
 * Tracks real-time performance metrics for GPU texture cache and timeline operations.
 * Used for monitoring, debugging, and optimization.
 *
 * Usage:
 * ```typescript
 * import { performanceMetrics } from '@/lib/performanceMetrics';
 *
 * // Track timeline scrubbing
 * performanceMetrics.trackScrubLatency(12.5); // ms
 *
 * // Track texture upload
 * performanceMetrics.trackTextureUpload(1.8); // ms
 *
 * // Get current metrics
 * const metrics = performanceMetrics.getMetrics();
 * console.log('Scrub FPS:', metrics.scrubFPS);
 * ```
 */

export interface PerformanceMetrics {
  // Timeline scrubbing
  scrubLatency: number[]; // ms per frame (last 100 samples)
  scrubFPS: number; // frames per second
  avgScrubLatency: number; // average ms per frame

  // GPU cache
  textureUploadTime: number[]; // ms per upload (last 100 samples)
  textureRenderTime: number[]; // ms per render (last 100 samples)
  textureReuseRate: number; // % of renders from cache (0-100)
  gpuMemoryUsage: number; // MB

  // Overall
  timestamp: number; // when metrics were captured
  sampleCount: number; // total samples collected
}

class PerformanceMetricsTracker {
  private scrubLatencies: number[] = [];
  private textureUploadTimes: number[] = [];
  private textureRenderTimes: number[] = [];
  private textureUploads: number = 0;
  private textureRenders: number = 0;
  private maxSamples: number = 100; // Keep last 100 samples
  private lastScrubTime: number = 0;
  private gpuMemoryMB: number = 0;

  /**
   * Track timeline scrubbing latency
   */
  trackScrubLatency(latencyMs: number): void {
    this.scrubLatencies.push(latencyMs);
    if (this.scrubLatencies.length > this.maxSamples) {
      this.scrubLatencies.shift();
    }
    this.lastScrubTime = Date.now();
  }

  /**
   * Track texture upload time
   */
  trackTextureUpload(uploadTimeMs: number): void {
    this.textureUploadTimes.push(uploadTimeMs);
    if (this.textureUploadTimes.length > this.maxSamples) {
      this.textureUploadTimes.shift();
    }
    this.textureUploads++;
  }

  /**
   * Track texture render time
   */
  trackTextureRender(renderTimeMs: number): void {
    this.textureRenderTimes.push(renderTimeMs);
    if (this.textureRenderTimes.length > this.maxSamples) {
      this.textureRenderTimes.shift();
    }
    this.textureRenders++;
  }

  /**
   * Update GPU memory usage
   */
  updateGPUMemory(memoryMB: number): void {
    this.gpuMemoryMB = memoryMB;
  }

  /**
   * Calculate average from array
   */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const avgScrubLatency = this.average(this.scrubLatencies);
    const scrubFPS = avgScrubLatency > 0 ? 1000 / avgScrubLatency : 0;

    // Texture reuse rate: (renders - uploads) / renders * 100
    // If we render 100 times but only upload 10 times, reuse rate = 90%
    const textureReuseRate = this.textureRenders > 0 ? ((this.textureRenders - this.textureUploads) / this.textureRenders) * 100 : 0;

    return {
      scrubLatency: [...this.scrubLatencies],
      scrubFPS: Math.round(scrubFPS * 10) / 10, // Round to 1 decimal
      avgScrubLatency: Math.round(avgScrubLatency * 10) / 10,

      textureUploadTime: [...this.textureUploadTimes],
      textureRenderTime: [...this.textureRenderTimes],
      textureReuseRate: Math.max(0, Math.min(100, textureReuseRate)), // Clamp 0-100
      gpuMemoryUsage: this.gpuMemoryMB,

      timestamp: Date.now(),
      sampleCount: this.scrubLatencies.length,
    };
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    scrubFPS: number;
    avgScrubLatency: number;
    avgUploadTime: number;
    avgRenderTime: number;
    textureReuseRate: number;
    gpuMemoryMB: number;
  } {
    const metrics = this.getMetrics();
    return {
      scrubFPS: metrics.scrubFPS,
      avgScrubLatency: metrics.avgScrubLatency,
      avgUploadTime: Math.round(this.average(this.textureUploadTimes) * 10) / 10,
      avgRenderTime: Math.round(this.average(this.textureRenderTimes) * 10) / 10,
      textureReuseRate: Math.round(metrics.textureReuseRate * 10) / 10,
      gpuMemoryMB: Math.round(metrics.gpuMemoryUsage * 10) / 10,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.scrubLatencies = [];
    this.textureUploadTimes = [];
    this.textureRenderTimes = [];
    this.textureUploads = 0;
    this.textureRenders = 0;
    this.lastScrubTime = 0;
    this.gpuMemoryMB = 0;
  }

  /**
   * Log metrics to console
   */
  logMetrics(): void {
    const summary = this.getSummary();
    console.log("[PerformanceMetrics]", {
      scrubFPS: `${summary.scrubFPS} FPS`,
      avgScrubLatency: `${summary.avgScrubLatency}ms`,
      avgUploadTime: `${summary.avgUploadTime}ms`,
      avgRenderTime: `${summary.avgRenderTime}ms`,
      textureReuseRate: `${summary.textureReuseRate}%`,
      gpuMemoryMB: `${summary.gpuMemoryMB}MB`,
    });
  }

  /**
   * Start periodic logging (every 10 seconds)
   */
  startPeriodicLogging(intervalMs: number = 10000): () => void {
    const intervalId = setInterval(() => {
      if (this.scrubLatencies.length > 0) {
        this.logMetrics();
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Export singleton instance
export const performanceMetrics = new PerformanceMetricsTracker();
