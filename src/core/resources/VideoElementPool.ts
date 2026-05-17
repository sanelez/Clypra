/**
 * Headless Video Element Pool
 *
 * Manages a pool of headless <video> elements for frame extraction.
 * Used by export pipeline and background rendering.
 *
 * Key features:
 * - Headless (not attached to DOM)
 * - Frame-accurate seeking
 * - Resource lifecycle management
 * - Concurrent video support
 */

export interface VideoElementPoolConfig {
  /** Maximum number of concurrent video elements */
  maxConcurrent?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export class VideoElementPool {
  private elements = new Map<string, HTMLVideoElement>();
  private config: Required<VideoElementPoolConfig>;
  private activeCount = 0;

  constructor(config: VideoElementPoolConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      debug: config.debug ?? false,
    };
  }

  /**
   * Acquire a video element for a source URL.
   * Creates new element if not in pool.
   *
   * @param sourceUrl - Video source URL
   * @param seekTime - Time to seek to (in seconds)
   * @returns Video element ready at seekTime
   */
  async acquire(sourceUrl: string, seekTime: number): Promise<HTMLVideoElement> {
    let video = this.elements.get(sourceUrl);

    if (!video) {
      // Create new headless video element
      video = document.createElement("video");
      video.preload = "auto";
      video.muted = true; // Muted for export (no audio in frame extraction)

      // Set source
      video.src = sourceUrl;

      // Wait for metadata to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Video metadata load timeout: ${sourceUrl}`));
        }, 10000);

        video!.addEventListener(
          "loadedmetadata",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );

        video!.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error(`Video load error: ${sourceUrl}`));
          },
          { once: true },
        );
      });

      this.elements.set(sourceUrl, video);
      this.activeCount++;

      if (this.config.debug) {
        console.log(`[VideoElementPool] Created video element for ${sourceUrl}`);
      }
    }

    // Seek to target time
    if (Math.abs(video.currentTime - seekTime) > 0.016) {
      // > 1 frame at 60fps
      video.currentTime = seekTime;

      // Wait for seek to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Video seek timeout: ${sourceUrl} @ ${seekTime}s`));
        }, 5000);

        video!.addEventListener(
          "seeked",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );

        video!.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error(`Video seek error: ${sourceUrl} @ ${seekTime}s`));
          },
          { once: true },
        );
      });
    }

    // Ensure we have a valid frame
    if (video.readyState < 2) {
      // HAVE_CURRENT_DATA
      throw new Error(`Video not ready after seek: ${sourceUrl} @ ${seekTime}s`);
    }

    return video;
  }

  /**
   * Release a video element (pause and clear).
   *
   * @param sourceUrl - Video source URL
   */
  release(sourceUrl: string): void {
    const video = this.elements.get(sourceUrl);
    if (video) {
      video.pause();
      video.src = "";
      video.load(); // Release decoder resources
      this.elements.delete(sourceUrl);
      this.activeCount--;

      if (this.config.debug) {
        console.log(`[VideoElementPool] Released video element for ${sourceUrl}`);
      }
    }
  }

  /**
   * Release all video elements.
   */
  clear(): void {
    for (const [url] of this.elements) {
      this.release(url);
    }

    if (this.config.debug) {
      console.log(`[VideoElementPool] Cleared all video elements`);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.config.maxConcurrent,
      urls: Array.from(this.elements.keys()),
    };
  }
}
