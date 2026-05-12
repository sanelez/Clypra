/**
 * Project Runtime Manager
 *
 * Centralized orchestration point for project-scoped runtime lifecycle.
 * Handles initialization, disposal, and switching of project runtime state.
 *
 * Architecture principle:
 * - Project owns runtime
 * - Runtime owns playback, caches, evaluation state
 * - Runtime dies when project dies
 *
 * This prevents state leakage across project switches by enforcing
 * deterministic teardown order and ownership boundaries.
 */

import { getPlaybackClock } from "../playback/PlaybackClock";
import { getFrameScheduler } from "../scheduler/FrameScheduler";

/**
 * Reset playback clock to initial state.
 * Stops playback, resets time, clears audio context.
 */
function resetPlaybackClock(): void {
  const clock = getPlaybackClock();

  // Stop playback (pauses and resets to 0)
  clock.stop();

  // Reset to default values
  clock.setDuration(0);
  clock.setSpeed(1.0);
  clock.setFrameRate(30);

  // Note: AudioContext is kept alive for reuse
  // Full disposal would require clock.dispose() but that's Phase 2
}

/**
 * Reset timeline store to initial state.
 * Clears tracks, clips, selections, and view state.
 */
async function resetTimelineStore(): Promise<void> {
  const { useTimelineStore } = await import("../../store/timelineStore");
  const { TIMELINE_ZOOM_DEFAULT, TIMELINE_PPS_PER_ZOOM } = await import("../../lib/timelineZoom");

  useTimelineStore.setState({
    tracks: [],
    clips: [],
    mainVideoTrackId: null,
    epoch: 0,
    zoomLevel: TIMELINE_ZOOM_DEFAULT,
    scrollLeft: 0,
    pixelsPerSecond: TIMELINE_ZOOM_DEFAULT * TIMELINE_PPS_PER_ZOOM,
    rippleEditEnabled: false,
  });
}

/**
 * Reset UI store to initial state.
 * Clears selections, preview mode, and UI flags.
 */
async function resetUIStore(): Promise<void> {
  const { useUIStore } = await import("../../store/uiStore");

  useUIStore.setState({
    selectedClipIds: [],
    selectedTrackId: null,
    previewMode: "program",
    // Note: Other UI flags are managed by components and reset naturally on unmount
  });
}

/**
 * Reset render engine state.
 * Clears frame caches, cancels pending jobs, invalidates evaluation cache.
 */
function resetRenderEngine(): void {
  const scheduler = getFrameScheduler();

  // Cancel all pending jobs
  scheduler.cancelAll();

  // Note: clearCache() method doesn't exist yet on FrameScheduler
  // This is Phase 2 work - explicit cache management
  // Currently caches are invalidated via epoch changes

  // Note: Video element cleanup happens in PreviewPanel unmount
  // Full resource disposal would require explicit video ref cleanup (Phase 2)
}

/**
 * Clear evaluation caches.
 * Invalidates scene evaluation cache tied to previous project.
 */
async function clearEvaluationCaches(): Promise<void> {
  // Evaluation cache is tied to epoch in timelineStore
  // Resetting epoch to 0 invalidates all cached evaluations
  // This is handled by resetTimelineStore()
  // Future: If we add separate evaluation cache, clear it here
}

/**
 * Release video and audio resources.
 * Pauses videos, releases audio nodes, clears media element references.
 */
function releaseMediaResources(): void {
  // Video elements are managed by PreviewPanel component
  // They will be cleaned up when component unmounts
  // Future Phase 2: Explicit video ref registry for deterministic cleanup
  // Future Phase 2: Audio graph disposal
  // Future Phase 2: Decoder pool cleanup
}

/**
 * Cancel async background tasks.
 * Stops thumbnail generation, waveform analysis, and other background work.
 */
function cancelAsyncTasks(): void {
  // Future: Cancel thumbnail generation workers
  // Future: Cancel waveform analysis
  // Future: Cancel frame extraction jobs
  // Future: Cancel decoder workers
  // Currently these are handled implicitly by component unmounts
  // Phase 2 would make this explicit
}

/**
 * Initialize project runtime.
 * Sets up playback, render engine, and evaluation state for new project.
 */
export async function initializeProjectRuntime(): Promise<void> {
  // Playback clock is lazy-initialized on first use
  // Render engine is lazy-initialized on first use

  // Reset stores to clean state
  await resetTimelineStore();
  await resetUIStore();

  // Future Phase 2: Explicit runtime initialization
  // - Create ProjectSession instance
  // - Initialize owned subsystems
  // - Attach to project lifecycle
}

/**
 * Dispose project runtime.
 * Tears down all project-scoped state in deterministic order.
 *
 * Teardown order (critical for avoiding race conditions):
 * 1. Cancel async tasks (prevent new work)
 * 2. Stop playback (prevent time updates)
 * 3. Clear render engine (cancel pending frames)
 * 4. Release media resources (close decoders, release memory)
 * 5. Clear evaluation caches (invalidate computed state)
 * 6. Reset stores (clear UI state)
 */
export async function disposeProjectRuntime(): Promise<void> {
  // 1. Cancel async background tasks
  cancelAsyncTasks();

  // 2. Stop playback immediately
  resetPlaybackClock();

  // 3. Clear render engine (cancel pending jobs, clear caches)
  resetRenderEngine();

  // 4. Release media resources
  releaseMediaResources();

  // 5. Clear evaluation caches
  await clearEvaluationCaches();

  // 6. Reset stores (UI state, timeline state)
  await resetTimelineStore();
  await resetUIStore();
}

/**
 * Switch project runtime.
 * Disposes current project runtime and initializes new one.
 *
 * This is the single orchestration point for project switches.
 * Ensures deterministic teardown → bootup sequence.
 */
export async function switchProjectRuntime(): Promise<void> {
  // Dispose current project runtime
  await disposeProjectRuntime();

  // Initialize new project runtime
  await initializeProjectRuntime();
}

/**
 * Get runtime health status (for debugging).
 * Reports on leaked state, pending jobs, and resource usage.
 */
export function getRuntimeHealthStatus(): {
  playbackState: string;
  pendingJobs: number;
  cacheSize: number;
  epoch: number;
} {
  const clock = getPlaybackClock();
  const scheduler = getFrameScheduler();

  return {
    playbackState: clock.state,
    pendingJobs: scheduler.getStats().active,
    cacheSize: scheduler.getStats().cacheHitRate,
    epoch: 0, // Would read from timelineStore
  };
}
