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
 * - Multiple instances per URL (for different seek positions)
 */

export interface VideoElementPoolConfig {
  /** Maximum number of concurrent video elements */
  maxConcurrent?: number;

  /** Enable debug logging */
  debug?: boolean;
}

interface PooledVideo {
  element: HTMLVideoElement;
  url: string;
  lastSeekTime: number;
  inUse: boolean;
}

export class VideoElementPool {
  private videos: PooledVideo[] = [];
  private config: Required<VideoElementPoolConfig>;

  constructor(config: VideoElementPoolConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      debug: config.debug ?? false,
    };
  }

  /**
   * Acquire a video element for a source URL.
   * Creates new element if not in pool or reuses an existing one at the same seek position.
   *
   * @param sourceUrl - Video source URL
   * @param seekTime - Time to seek to (in seconds)
   * @returns Video element ready at seekTime
   */
  async acquire(sourceUrl: string, seekTime: number): Promise<HTMLVideoElement> {
    // Try to find an existing video element at the exact same seek position
    // This avoids unnecessary re-seeking when the same clip is used across frames
    const existingVideo = this.videos.find((v) => v.url === sourceUrl && Math.abs(v.lastSeekTime - seekTime) < 0.001 && !v.inUse);

    let pooledVideo: PooledVideo;

    if (existingVideo) {
      // Reuse existing video at same position
      pooledVideo = existingVideo;
      pooledVideo.inUse = true;
      return pooledVideo.element;
    }

    // Try to find an unused video for the same URL (will need to seek)
    const sameUrlVideo = this.videos.find((v) => v.url === sourceUrl && !v.inUse);

    if (sameUrlVideo) {
      pooledVideo = sameUrlVideo;
      pooledVideo.inUse = true;
    } else {
      // Check if we've hit the concurrent limit
      if (this.videos.length >= this.config.maxConcurrent) {
        // Find and evict the oldest unused video
        const unusedVideo = this.videos.find((v) => !v.inUse);
        if (unusedVideo) {
          this.releaseVideo(unusedVideo);
        } else {
          // All videos are in use - this shouldn't happen in sequential export
          throw new Error(`VideoElementPool: maxConcurrent (${this.config.maxConcurrent}) limit reached with all videos in use`);
        }
      }

      // Create new video element
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true; // Muted for export (no audio in frame extraction)

      // Style and add to DOM to ensure the browser composites the frames
      video.style.position = "fixed";
      video.style.top = "0";
      video.style.left = "0";
      video.style.width = "256px";
      video.style.height = "256px";
      video.style.opacity = "0.001";
      video.style.pointerEvents = "none";
      video.style.zIndex = "-9999";

      // Ensure playsinline is set for Safari/mobile webviews
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      if (typeof document !== "undefined" && document.body) {
        document.body.appendChild(video);
      }

      video.src = sourceUrl;

      pooledVideo = {
        element: video,
        url: sourceUrl,
        lastSeekTime: -1,
        inUse: true,
      };

      this.videos.push(pooledVideo);

      // Wait for metadata to load
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Video metadata load timeout: ${sourceUrl}`));
          }, 10000);

          video.addEventListener(
            "loadedmetadata",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );

          video.addEventListener(
            "error",
            () => {
              clearTimeout(timeout);
              reject(new Error(`Video load error: ${sourceUrl}`));
            },
            { once: true },
          );
        });
      } catch (error) {
        this.releaseVideo(pooledVideo);
        throw error;
      }
    }

    // Seek to target time if needed
    const video = pooledVideo.element;
    if (Math.abs(video.currentTime - seekTime) > 0.001) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Video seek timeout: ${sourceUrl} @ ${seekTime}s`));
          }, 5000);

          const onSeeked = () => {
            clearTimeout(timeout);
            cleanup();
            resolve();
          };

          const onError = () => {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(`Video seek error: ${sourceUrl} @ ${seekTime}s`));
          };

          const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
          };

          video.addEventListener("seeked", onSeeked);
          video.addEventListener("error", onError);

          // Set currentTime AFTER registering event listeners to prevent race condition
          video.currentTime = seekTime;
        });

        pooledVideo.lastSeekTime = seekTime;
      } catch (error) {
        this.releaseVideo(pooledVideo);
        throw error;
      }
    }

    // Ensure we have a valid frame
    if (pooledVideo.element.readyState < 2) {
      // HAVE_CURRENT_DATA
      this.releaseVideo(pooledVideo);
      throw new Error(`Video not ready after seek: ${sourceUrl} @ ${seekTime}s`);
    }

    return pooledVideo.element;
  }

  /**
   * Mark a video element as no longer in use, making it available for reuse.
   *
   * @param video - Video element to release
   */
  releaseElement(video: HTMLVideoElement): void {
    const pooledVideo = this.videos.find((v) => v.element === video);
    if (pooledVideo) {
      pooledVideo.inUse = false;
    }
  }

  /**
   * Release and destroy a specific video from the pool.
   */
  private releaseVideo(pooledVideo: PooledVideo): void {
    const video = pooledVideo.element;
    video.pause();
    video.src = "";
    try {
      video.load(); // Release decoder resources
    } catch (e) {
      // ignore
    }

    if (typeof video.remove === "function") {
      video.remove();
    } else if (video.parentNode) {
      video.parentNode.removeChild(video);
    }

    const index = this.videos.indexOf(pooledVideo);
    if (index !== -1) {
      this.videos.splice(index, 1);
    }
  }

  /**
   * Release a video element by URL.
   *
   * @param sourceUrl - Video source URL
   */
  release(sourceUrl: string): void {
    const videosToRelease = this.videos.filter((v) => v.url === sourceUrl);
    videosToRelease.forEach((v) => this.releaseVideo(v));
  }

  /**
   * Release all video elements.
   */
  clear(): void {
    this.videos.forEach((v) => this.releaseVideo(v));
    this.videos = [];
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      activeCount: this.videos.length,
      inUseCount: this.videos.filter((v) => v.inUse).length,
      maxConcurrent: this.config.maxConcurrent,
      urls: Array.from(new Set(this.videos.map((v) => v.url))),
    };
  }
}
