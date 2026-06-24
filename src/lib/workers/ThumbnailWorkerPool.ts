/**
 * Thumbnail Worker Pool Manager
 *
 * Manages a pool of web workers for parallel thumbnail processing.
 * Distributes decode requests across workers using round-robin scheduling.
 *
 * Architecture:
 *   ThumbnailWorkerPool → Worker 1, Worker 2, ..., Worker N
 *                          ↓
 *                    Main Thread (callbacks)
 *
 * Features:
 * - Automatic worker pool creation (N = CPU cores - 1, max 4)
 * - Round-robin load balancing
 * - Request tracking and timeout handling
 * - Graceful shutdown
 *
 * Usage:
 *   const pool = ThumbnailWorkerPool.getInstance();
 *   await pool.decode(rawData, width, height, tileKey, (bitmap) => {
 *     // Use bitmap on main thread
 *   });
 */

import type { ThumbnailDecodeRequest, ThumbnailWorkerResponse } from "@/workers/thumbnailWorker";
import { performanceMonitor } from "../monitoring/PerformanceMonitor";

interface PendingRequest {
  requestId: number;
  tileKey: string;
  resolve: (bitmap: ImageBitmap) => void;
  reject: (error: Error) => void;
  timeoutHandle: number;
}

export class ThumbnailWorkerPool {
  private static instance: ThumbnailWorkerPool | null = null;
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private initialized = false;

  // Configuration
  private readonly workerCount: number;
  private readonly requestTimeoutMs = 10000; // 10 seconds

  private constructor(workerCount?: number) {
    if (workerCount !== undefined) {
      // Use provided worker count (for adaptive mobile optimization)
      this.workerCount = workerCount;
    } else {
      // Determine optimal worker count: CPU cores - 1 (leave one for main thread), max 4
      const cpuCount = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      this.workerCount = Math.min(Math.max(cpuCount - 1, 1), 4);
    }
  }

  static getInstance(workerCount?: number): ThumbnailWorkerPool {
    if (!ThumbnailWorkerPool.instance) {
      ThumbnailWorkerPool.instance = new ThumbnailWorkerPool(workerCount);
    }
    return ThumbnailWorkerPool.instance;
  }

  /**
   * Reset the singleton instance with a new worker count.
   * Used when device state changes (battery/thermal) require adaptation.
   */
  static reset(workerCount: number): void {
    if (ThumbnailWorkerPool.instance) {
      ThumbnailWorkerPool.instance.shutdown();
      ThumbnailWorkerPool.instance = null;
    }
    ThumbnailWorkerPool.instance = new ThumbnailWorkerPool(workerCount);
  }

  /**
   * Get current worker count.
   */
  getWorkerCount(): number {
    return this.workerCount;
  }

  /**
   * Initialize the worker pool. Called automatically on first decode request.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    performanceMonitor.increment("thumbnail_worker.pool_init");

    // Create workers
    for (let i = 0; i < this.workerCount; i++) {
      try {
        const worker = new Worker(new URL("@/workers/thumbnailWorker.ts", import.meta.url), {
          type: "module",
        });

        worker.addEventListener("message", (event: MessageEvent<ThumbnailWorkerResponse>) => {
          this.handleWorkerMessage(event.data);
        });

        worker.addEventListener("error", (error) => {
          console.error(`[ThumbnailWorkerPool] Worker ${i} error:`, error);
          performanceMonitor.increment("thumbnail_worker.worker_error");
        });

        this.workers.push(worker);
      } catch (error) {
        console.error(`[ThumbnailWorkerPool] Failed to create worker ${i}:`, error);
        performanceMonitor.increment("thumbnail_worker.worker_creation_failed");
      }
    }

    this.initialized = true;

    performanceMonitor.gauge("thumbnail_worker.pool_size", this.workers.length);

    console.log(`[ThumbnailWorkerPool] Initialized with ${this.workers.length} workers`);
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(response: ThumbnailWorkerResponse): void {
    if (response.type === "decoded") {
      const pending = this.pendingRequests.get(response.requestId);
      if (!pending) {
        console.warn(`[ThumbnailWorkerPool] Received response for unknown request ${response.requestId}`);
        return;
      }

      // Clear timeout
      clearTimeout(pending.timeoutHandle);

      // Remove from pending
      this.pendingRequests.delete(response.requestId);

      // Track metrics
      performanceMonitor.timing("thumbnail_worker.decode_duration", response.processingTimeMs);
      performanceMonitor.increment("thumbnail_worker.decode_success");

      // Resolve promise
      pending.resolve(response.bitmap);
    } else if (response.type === "error") {
      const pending = this.pendingRequests.get(response.requestId);
      if (!pending) {
        console.warn(`[ThumbnailWorkerPool] Received error for unknown request ${response.requestId}`);
        return;
      }

      // Clear timeout
      clearTimeout(pending.timeoutHandle);

      // Remove from pending
      this.pendingRequests.delete(response.requestId);

      // Track error
      performanceMonitor.increment("thumbnail_worker.decode_error");

      // Reject promise
      pending.reject(new Error(response.error));
    }
  }

  /**
   * Decode raw RGBA bytes into ImageBitmap using worker pool
   *
   * @param rawData - Raw RGBA bytes from Tauri decoder
   * @param width - Frame width
   * @param height - Frame height
   * @param tileKey - Tile cache key
   * @returns Promise that resolves with ImageBitmap (transferred from worker)
   */
  async decode(rawData: Uint8Array, width: number, height: number, tileKey: string): Promise<ImageBitmap> {
    // Lazy initialization
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.workers.length === 0) {
      throw new Error("No workers available");
    }

    performanceMonitor.increment("thumbnail_worker.decode_request");
    performanceMonitor.gauge("thumbnail_worker.pending_requests", this.pendingRequests.size);

    // Generate request ID
    const requestId = this.nextRequestId++;

    // Select worker (round-robin)
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;

    // Create promise for response
    return new Promise<ImageBitmap>((resolve, reject) => {
      // Set timeout
      const timeoutHandle = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        performanceMonitor.increment("thumbnail_worker.decode_timeout");
        reject(new Error(`Thumbnail decode timeout for ${tileKey}`));
      }, this.requestTimeoutMs);

      // Register pending request
      this.pendingRequests.set(requestId, {
        requestId,
        tileKey,
        resolve,
        reject,
        timeoutHandle,
      });

      // Send request to worker
      const request: ThumbnailDecodeRequest = {
        type: "decode",
        rawData,
        width,
        height,
        tileKey,
        requestId,
      };

      // Transfer rawData buffer to worker (zero-copy)
      worker.postMessage(request, [rawData.buffer]);
    });
  }

  /**
   * Shutdown and clean up all workers.
   * Alias for dispose() - used by performance adapter.
   */
  shutdown(): void {
    this.dispose();
  }

  /**
   * Terminate all workers and clean up resources
   */
  dispose(): void {
    // Reject all pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error("Worker pool disposed"));
    }
    this.pendingRequests.clear();

    // Terminate workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;

    console.log("[ThumbnailWorkerPool] Disposed");
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      workerCount: this.workers.length,
      pendingRequests: this.pendingRequests.size,
      initialized: this.initialized,
    };
  }
}

// Expose for debugging
if (typeof window !== "undefined") {
  (window as any).__thumbnailWorkerPool = ThumbnailWorkerPool.getInstance();
}
