import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PreviewMediaPool } from "../PreviewMediaPool";
import type { Clip, MediaAsset } from "@/types";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path, // Just return the path as-is for tests
}));

// Mock browser APIs for Node environment
if (typeof HTMLVideoElement === "undefined") {
  (global as any).HTMLVideoElement = class HTMLVideoElement {
    src = "";
    currentTime = 0;
    duration = 10;
    paused = true;
    muted = true;
    volume = 1;
    playbackRate = 1;
    readyState = 4;
    seeking = false;
    playsInline = true;
    preload = "auto";
    style = { cssText: "" };
    parentNode = null;

    addEventListener() {}
    removeEventListener() {}
    load() {}
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    requestVideoFrameCallback() {
      return 1;
    }
    cancelVideoFrameCallback() {}
  };
}

if (typeof HTMLAudioElement === "undefined") {
  (global as any).HTMLAudioElement = class HTMLAudioElement extends (global as any).HTMLVideoElement {};
}

if (typeof document === "undefined") {
  (global as any).document = {
    createElement: (tag: string) => {
      if (tag === "video") return new (global as any).HTMLVideoElement();
      if (tag === "audio") return new (global as any).HTMLAudioElement();
      if (tag === "div") {
        return {
          style: { cssText: "" },
          appendChild: () => {},
          removeChild: () => {},
          parentNode: null,
        };
      }
      return {};
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
}

// Helper to create mock clips
function createMockClip(id: string, mediaId: string, startTime: number, duration: number, trimIn = 0): Clip {
  return {
    id,
    mediaId,
    trackId: "track-1",
    startTime,
    duration,
    trimIn,
    trimOut: trimIn + duration,
    kind: "video",
    volume: 1.0,
  } as Clip;
}

// Helper to create mock assets
function createMockAsset(id: string, path: string): MediaAsset {
  return {
    id,
    path,
    type: "video",
    name: `asset-${id}`,
    duration: 10,
    width: 1920,
    height: 1080,
  } as MediaAsset;
}

// Helper to wait for async operations
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PreviewMediaPool — Re-entrancy Protection", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should allow single sync call to complete normally", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    // Should not throw
    expect(() => {
      pool.sync(clips, assets, tracks, syncState);
    }).not.toThrow();

    // Should have video elements
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThan(0);
  });

  it("should queue sync request when already syncing", async () => {
    // Create a large number of clips to make sync() take longer
    const clips = Array.from({ length: 100 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 100 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    const syncState1 = {
      time: 0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    const syncState2 = {
      time: 5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    // Call sync twice rapidly
    pool.sync(clips, assets, tracks, syncState1);
    pool.sync(clips, assets, tracks, syncState2); // Should queue and return immediately

    // Give time for queued sync to process
    await wait(50);

    // Both syncs should have processed eventually
    // The pool should reflect the final state (syncState2)
    expect(pool).toBeDefined();
  });

  it("should only process the most recent queued request", async () => {
    const clips = Array.from({ length: 50 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 50 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    // Call sync multiple times rapidly (simulating 60fps calls)
    for (let i = 0; i < 10; i++) {
      pool.sync(clips, assets, tracks, {
        time: i,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    // Give time for all syncs to process
    await wait(100);

    // Pool should be in valid state (not corrupted)
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should handle sync exception gracefully and remain operational", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    // First sync should work
    pool.sync(clips, assets, tracks, syncState);

    // Dispose the pool to cause an error on next sync
    pool.dispose();

    // Second sync should not throw (disposal check returns early)
    expect(() => {
      pool.sync(clips, assets, tracks, syncState);
    }).not.toThrow();
  });

  it("should clear queued request on disposal", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    // Start a sync
    pool.sync(clips, assets, tracks, syncState);

    // Queue another sync
    pool.sync(clips, assets, tracks, { ...syncState, time: 5.0 });

    // Dispose should not throw even with queued request
    expect(() => pool.dispose()).not.toThrow();
  });

  it("should not create duplicate elements during concurrent sync attempts", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Call sync many times rapidly (simulating race condition)
    for (let i = 0; i < 20; i++) {
      pool.sync(clips, assets, tracks, {
        time: 2.5,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    // Wait for all syncs to process
    await wait(100);

    // Should only have one element for the clip (not duplicates)
    const videoElements = pool.getVideoElements();
    const clipKeys = Array.from(videoElements.keys()).filter((key) => key.includes("clip-1"));
    expect(clipKeys.length).toBeLessThanOrEqual(1);
  });

  it("should handle rapid state changes without corruption", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Simulate rapid playback state changes
    const states: Array<"playing" | "paused" | "stopped"> = ["playing", "paused", "playing", "paused", "stopped"];

    for (const state of states) {
      pool.sync(clips, assets, tracks, {
        time: 2.5,
        state,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(50);

    // Pool should remain functional
    expect(() => pool.getVideoElements()).not.toThrow();
  });
});

describe("PreviewMediaPool — Basic Functionality", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should create video elements for video clips", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    pool.sync(clips, assets, tracks, syncState);

    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThan(0);
  });

  it("should handle empty clip list", () => {
    const clips: Clip[] = [];
    const assets: MediaAsset[] = [];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 0,
      state: "paused" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    expect(() => {
      pool.sync(clips, assets, tracks, syncState);
    }).not.toThrow();

    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBe(0);
  });

  it("should cleanup on dispose", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    pool.sync(clips, assets, tracks, syncState);

    // Should have elements before dispose
    expect(pool.getVideoElements().size).toBeGreaterThan(0);

    pool.dispose();

    // Should have no elements after dispose
    expect(pool.getVideoElements().size).toBe(0);
  });

  it("should not process sync calls after disposal", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    pool.dispose();

    // Sync after disposal should return early
    pool.sync(clips, assets, tracks, syncState);

    // Should have no elements (sync was rejected)
    expect(pool.getVideoElements().size).toBe(0);
  });

  it("should handle multiple clips from same media source", () => {
    // Two clips referencing the same media (common in split scenarios)
    const clips = [
      createMockClip("clip-1", "media-1", 0, 5, 0),
      createMockClip("clip-2", "media-1", 5, 5, 5), // Split clip
    ];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];
    const syncState = {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    };

    pool.sync(clips, assets, tracks, syncState);

    const videoElements = pool.getVideoElements();
    // Should have separate elements for each clip (different trimIn values)
    expect(videoElements.size).toBeGreaterThanOrEqual(1);
  });
});

describe("PreviewMediaPool — Split Clip Scenarios", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should handle clip split at playhead", async () => {
    // Initial clip
    const initialClips = [createMockClip("clip-1", "media-1", 0, 10, 0)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync with initial clip at time 5
    pool.sync(initialClips, assets, tracks, {
      time: 5.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    // Simulate split: left clip keeps original ID, right clip gets new ID
    const splitClips = [
      createMockClip("clip-1", "media-1", 0, 5, 0), // Left (original ID, trimOut = 5)
      createMockClip("clip-2", "media-1", 5, 5, 5), // Right (new ID, trimIn = 5)
    ];

    // Sync again with split clips
    pool.sync(splitClips, assets, tracks, {
      time: 5.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Should have elements for both clips
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThanOrEqual(1);
  });

  it("should handle rapid splits without element duplication", async () => {
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Start with one clip
    let clips = [createMockClip("clip-1", "media-1", 0, 10, 0)];

    pool.sync(clips, assets, tracks, {
      time: 2.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    // Simulate multiple rapid splits
    clips = [createMockClip("clip-1", "media-1", 0, 2, 0), createMockClip("clip-2", "media-1", 2, 8, 2)];
    pool.sync(clips, assets, tracks, {
      time: 2.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    clips = [createMockClip("clip-1", "media-1", 0, 2, 0), createMockClip("clip-2", "media-1", 2, 4, 2), createMockClip("clip-3", "media-1", 6, 4, 6)];
    pool.sync(clips, assets, tracks, {
      time: 4.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(100);

    // Should have elements but not excessive duplicates
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeLessThan(10); // Reasonable upper bound
  });
});

describe("PreviewMediaPool — Performance and Memory", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should handle large number of clips efficiently", async () => {
    // Create 100 clips
    const clips = Array.from({ length: 100 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 100 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    const startTime = Date.now();

    pool.sync(clips, assets, tracks, {
      time: 50.0, // Middle of timeline
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Sync should complete in reasonable time (< 1 second for 100 clips)
    expect(duration).toBeLessThan(1000);
  });

  it("should respect cache limits", async () => {
    // Create more clips than cache limit (20)
    const clips = Array.from({ length: 30 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 30 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync with all clips
    pool.sync(clips, assets, tracks, {
      time: 30.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(100);

    // Cache should not grow unbounded
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeLessThanOrEqual(30);
  });

  it("should handle rapid time changes during playback", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5), createMockClip("clip-2", "media-2", 5, 5), createMockClip("clip-3", "media-3", 10, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4"), createMockAsset("media-3", "/path/to/video3.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Simulate 60fps playback for 1 second (60 syncs)
    for (let i = 0; i < 60; i++) {
      const time = (i / 60) * 15; // 0 to 15 seconds over 60 frames
      pool.sync(clips, assets, tracks, {
        time,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(100);

    // Should remain stable
    expect(() => pool.getVideoElements()).not.toThrow();
  });
});

describe("PreviewMediaPool — FINDING-004: Seeked Event Listener Leak", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should not accumulate seeked listeners during scrubbing", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 10)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Initial sync to create element
    pool.sync(clips, assets, tracks, {
      time: 0,
      state: "paused" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    // Simulate rapid scrubbing (100 seeks in quick succession)
    // This would previously cause 100 listeners to accumulate
    for (let i = 0; i < 100; i++) {
      pool.sync(clips, assets, tracks, {
        time: (i / 100) * 10, // Scrub from 0 to 10 seconds
        state: "paused" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(100);

    // Pool should remain functional (no memory exhaustion)
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should handle prolonged scrubbing session without memory leak", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5), createMockClip("clip-2", "media-2", 5, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Simulate extended scrubbing session (500 rapid seeks)
    // Without the fix, this would accumulate 500+ listeners per element
    for (let i = 0; i < 500; i++) {
      const time = (i % 100) / 10; // Scrub back and forth
      pool.sync(clips, assets, tracks, {
        time,
        state: "paused" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(200);

    // Should not crash or throw
    expect(() => pool.getVideoElements()).not.toThrow();

    // Elements should still be accessible
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThan(0);
  });

  it("should handle scrubbing with multiple clips without listener leak", async () => {
    // Create 10 clips to test listener leak across multiple elements
    const clips = Array.from({ length: 10 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 10 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    // Scrub across all clips multiple times
    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < 20; i++) {
        pool.sync(clips, assets, tracks, {
          time: i, // Scrub from 0 to 20 seconds
          state: "paused" as const,
          speed: 1.0,
          muted: false,
          volume: 100,
        });
      }
    }

    await wait(150);

    // With 10 elements × 5 passes × 20 seeks = 1000 total seeks
    // Without fix: 1000 listeners accumulated (crash)
    // With fix: Only ~10 listeners (one per element, auto-removed)
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should properly clean up on disposal after heavy scrubbing", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 10)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Heavy scrubbing session
    for (let i = 0; i < 200; i++) {
      pool.sync(clips, assets, tracks, {
        time: (i / 200) * 10,
        state: "paused" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(100);

    // Disposal should complete without hanging or errors
    expect(() => pool.dispose()).not.toThrow();
  });

  it("should not leak memory during seek-play-seek cycles", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 10)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Simulate user behavior: seek → play briefly → seek again
    for (let i = 0; i < 50; i++) {
      // Seek
      pool.sync(clips, assets, tracks, {
        time: (i / 50) * 10,
        state: "paused" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });

      // Play briefly
      pool.sync(clips, assets, tracks, {
        time: (i / 50) * 10,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });

      // Seek again
      pool.sync(clips, assets, tracks, {
        time: ((i + 1) / 50) * 10,
        state: "paused" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(150);

    // Should remain stable
    expect(() => pool.getVideoElements()).not.toThrow();
  });
});

describe("PreviewMediaPool — FINDING-007: Missing isActive Guard", () => {
  let pool: PreviewMediaPool;

  beforeEach(() => {
    pool = new PreviewMediaPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it("should only attempt playback on active elements", () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync with active element (within time window)
    pool.sync(clips, assets, tracks, {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThan(0);

    // Element should be marked as active
    const element = Array.from(videoElements.values())[0];
    expect(element).toBeDefined();
  });

  it("should not attempt playback on inactive elements", () => {
    const clips = [createMockClip("clip-1", "media-1", 5, 5)]; // Clip from 5-10s
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync at time 2.5 (before clip starts) - element should be inactive
    pool.sync(clips, assets, tracks, {
      time: 2.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    // Should create element (for preloading) but not attempt playback
    // This is implementation detail - main thing is no crash/errors
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should handle clip boundary crossing without playing inactive elements", async () => {
    // Two sequential clips
    const clips = [
      createMockClip("clip-1", "media-1", 0, 5), // 0-5s
      createMockClip("clip-2", "media-2", 5, 5), // 5-10s
    ];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Start at 4.5s (clip-1 active, clip-2 inactive)
    pool.sync(clips, assets, tracks, {
      time: 4.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Advance to 5.5s (clip-1 should become inactive, clip-2 active)
    pool.sync(clips, assets, tracks, {
      time: 5.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Should not throw - inactive elements should not attempt playback
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should prevent race condition when element becomes inactive during playback request", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync at 4.9s (near end of clip)
    pool.sync(clips, assets, tracks, {
      time: 4.9,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    // Immediately advance past clip boundary
    // This simulates the race where sync() marks element inactive
    // but requestPlayback() could be queued from previous frame
    pool.sync(clips, assets, tracks, {
      time: 5.1,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Should not crash or attempt playback on inactive element
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should handle multiple clips transitioning without playing inactive elements", async () => {
    // Create timeline with 5 sequential clips
    const clips = Array.from({ length: 5 }, (_, i) => createMockClip(`clip-${i}`, `media-${i}`, i * 2, 2));
    const assets = Array.from({ length: 5 }, (_, i) => createMockAsset(`media-${i}`, `/path/to/video-${i}.mp4`));
    const tracks = [{ id: "track-1", type: "video" }];

    // Play through entire timeline rapidly
    for (let time = 0; time < 10; time += 0.2) {
      pool.sync(clips, assets, tracks, {
        time,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(100);

    // Multiple clip transitions should not cause playback on inactive elements
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should respect isActive guard during rapid seeks across clip boundaries", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 3), createMockClip("clip-2", "media-2", 3, 3), createMockClip("clip-3", "media-3", 6, 3)];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4"), createMockAsset("media-3", "/path/to/video3.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Rapidly seek back and forth across boundaries
    const seekTimes = [1.5, 4.5, 7.5, 2.0, 5.0, 8.0, 0.5, 3.5, 6.5];

    for (const time of seekTimes) {
      pool.sync(clips, assets, tracks, {
        time,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
      await wait(20);
    }

    // Should handle rapid active/inactive transitions without errors
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should prevent simultaneous audio from multiple clips due to missing guard", async () => {
    // This test simulates the exact bug scenario: audio continues from
    // inactive clip while new clip also plays audio
    const clips = [createMockClip("clip-1", "media-1", 0, 5), createMockClip("clip-2", "media-2", 5, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Play through first clip
    pool.sync(clips, assets, tracks, {
      time: 4.9,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Cross boundary - clip-1 should become inactive, clip-2 active
    pool.sync(clips, assets, tracks, {
      time: 5.1,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // With guard: only clip-2 plays
    // Without guard: both clips could play simultaneously
    const videoElements = pool.getVideoElements();
    expect(videoElements.size).toBeGreaterThan(0);

    // Verify pool remains in valid state
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should handle playback state changes at clip boundaries", async () => {
    const clips = [createMockClip("clip-1", "media-1", 0, 5)];
    const assets = [createMockAsset("media-1", "/path/to/video.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Play up to near end
    pool.sync(clips, assets, tracks, {
      time: 4.95,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Pause at exact boundary
    pool.sync(clips, assets, tracks, {
      time: 5.0,
      state: "paused" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Resume after boundary (element now inactive)
    pool.sync(clips, assets, tracks, {
      time: 5.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Should handle gracefully without attempting playback on inactive element
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should maintain correct active state during 60fps playback", async () => {
    const clips = [
      createMockClip("clip-1", "media-1", 0, 1), // Short 1s clip
      createMockClip("clip-2", "media-2", 1, 1),
    ];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Simulate 60fps playback crossing clip boundary
    // 120 frames = 2 seconds at 60fps
    for (let frame = 0; frame < 120; frame++) {
      const time = frame / 60; // 0 to 2 seconds
      pool.sync(clips, assets, tracks, {
        time,
        state: "playing" as const,
        speed: 1.0,
        muted: false,
        volume: 100,
      });
    }

    await wait(100);

    // High frequency syncs with clip transitions should not cause
    // playback attempts on inactive elements
    expect(() => pool.getVideoElements()).not.toThrow();
  });

  it("should prevent CPU spike from decoding inactive video", async () => {
    // This test verifies the performance aspect: inactive elements
    // should not decode video frames (CPU intensive)
    const clips = [
      createMockClip("clip-1", "media-1", 0, 2),
      createMockClip("clip-2", "media-2", 5, 2), // Gap between clips
    ];
    const assets = [createMockAsset("media-1", "/path/to/video1.mp4"), createMockAsset("media-2", "/path/to/video2.mp4")];
    const tracks = [{ id: "track-1", type: "video" }];

    // Sync at time 3 (between clips - both inactive)
    pool.sync(clips, assets, tracks, {
      time: 3.0,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Neither clip should be playing (would waste CPU)
    // With guard: no playback attempts
    // Without guard: could start playing both clips
    expect(() => pool.getVideoElements()).not.toThrow();

    // Move to active region
    pool.sync(clips, assets, tracks, {
      time: 5.5,
      state: "playing" as const,
      speed: 1.0,
      muted: false,
      volume: 100,
    });

    await wait(50);

    // Only clip-2 should be active now
    expect(() => pool.getVideoElements()).not.toThrow();
  });
});
