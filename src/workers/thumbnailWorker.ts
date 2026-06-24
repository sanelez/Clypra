/**
 * Thumbnail Processing Web Worker
 *
 * Offloads ImageBitmap creation and canvas operations from the main thread
 * to improve UI responsiveness during scroll and playback.
 *
 * Architecture:
 *   Main Thread → Worker: { type: 'decode', rawData, width, height }
 *   Worker → Main Thread: { type: 'decoded', bitmap (transferred), tileKey }
 *
 * Benefits:
 * - Frees main thread during thumbnail decode storms (scroll/zoom)
 * - Parallel processing of multiple thumbnails
 * - ImageBitmap creation is off main thread
 * - Transfer of ImageBitmap (not copy) for zero-copy performance
 *
 * Performance:
 * - ImageBitmap creation: ~2-5ms per tile
 * - Transfer overhead: <0.1ms (structured clone with transfer)
 * - Total latency: ~3-6ms (vs blocking main thread for same duration)
 */

/// <reference lib="webworker" />

export interface ThumbnailDecodeRequest {
  type: "decode";
  /** Raw RGBA bytes from Tauri decoder */
  rawData: Uint8Array;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Tile cache key for response matching */
  tileKey: string;
  /** Request ID for tracking */
  requestId: number;
}

export interface ThumbnailDecodeResponse {
  type: "decoded";
  /** ImageBitmap (transferred, not copied) */
  bitmap: ImageBitmap;
  /** Tile cache key */
  tileKey: string;
  /** Request ID */
  requestId: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface ThumbnailErrorResponse {
  type: "error";
  /** Error message */
  error: string;
  /** Tile cache key */
  tileKey: string;
  /** Request ID */
  requestId: number;
}

export type ThumbnailWorkerMessage = ThumbnailDecodeRequest;
export type ThumbnailWorkerResponse = ThumbnailDecodeResponse | ThumbnailErrorResponse;

declare const self: DedicatedWorkerGlobalScope;

/**
 * Process thumbnail decode request
 */
async function processThumbnailDecode(request: ThumbnailDecodeRequest): Promise<void> {
  const startTime = performance.now();

  try {
    const { rawData, width, height, tileKey, requestId } = request;

    // Validate dimensions
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid dimensions: ${width}x${height}`);
    }

    // Validate buffer size (RGBA = 4 bytes per pixel)
    const expectedSize = width * height * 4;
    if (rawData.byteLength !== expectedSize) {
      throw new Error(`Buffer size mismatch: expected ${expectedSize} bytes (${width}x${height}x4), got ${rawData.byteLength}`);
    }

    // Create ImageData from raw RGBA bytes
    const imageData = new ImageData(new Uint8ClampedArray(rawData.buffer, rawData.byteOffset, rawData.byteLength), width, height);

    // Create ImageBitmap (this is the expensive operation we're offloading)
    // ImageBitmap is hardware-accelerated and can be transferred to main thread
    const bitmap = await createImageBitmap(imageData);

    const processingTimeMs = performance.now() - startTime;

    // Transfer bitmap to main thread (zero-copy transfer)
    const response: ThumbnailDecodeResponse = {
      type: "decoded",
      bitmap,
      tileKey,
      requestId,
      processingTimeMs,
    };

    self.postMessage(response, [bitmap]);
  } catch (error) {
    const errorResponse: ThumbnailErrorResponse = {
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      tileKey: request.tileKey,
      requestId: request.requestId,
    };

    self.postMessage(errorResponse);
  }
}

/**
 * Worker message handler
 */
self.addEventListener("message", (event: MessageEvent<ThumbnailWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "decode":
      // Process decode request asynchronously
      processThumbnailDecode(message).catch((error) => {
        const errorResponse: ThumbnailErrorResponse = {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
          tileKey: message.tileKey,
          requestId: message.requestId,
        };
        self.postMessage(errorResponse);
      });
      break;

    default:
      console.warn(`[ThumbnailWorker] Unknown message type:`, message);
  }
});

// Worker ready signal
self.postMessage({ type: "ready" });

export {};
