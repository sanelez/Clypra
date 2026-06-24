// Deprecated methods used across the system
import { useState, useEffect } from "react";
import { LaunchScreen } from "@/components/screens/LaunchScreen";
import { EditorScreen } from "@/components/screens/EditorScreen";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useProjectStore } from "@/store/projectStore";
import { useUIStore } from "@/store/uiStore";
import type { Project, AspectRatio } from "@/types";
import { fromRustProject, fromRustTrack, fromRustClip, type RustProject } from "@/types/serialization";
import { platform } from "@/core/platform";
import { SettingsModal } from "./components/ui/SettingsModal";
import { ErrorBoundary } from "@/components/ErrorBoundary"; // FIX (FINDING-022): Add root error boundary
import { initializePerformanceAdapter, shutdownPerformanceAdapter } from "@/lib/platform/performanceAdapter";

const isExternalOrDataUrl = (value: string) => value.startsWith("data:") || value.startsWith("http") || value.startsWith("asset://");

const App = () => {
  const { project, createProject, loadProject, setRecentProjects } = useProjectStore();
  const [isLoading, setIsLoading] = useState(true);
  const { showSettingsModal, toggleSettingsModal } = useUIStore();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize performance adapter for mobile optimizations
        await initializePerformanceAdapter();

        const projects = await platform.getRecentProjects();
        setRecentProjects(projects);
      } catch (error) {
        console.error("Failed to initialize app:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();

    // Cleanup on unmount
    return () => {
      shutdownPerformanceAdapter();
    };
  }, [setRecentProjects]);

  useEffect(() => {
    if (import.meta.env.DEV || !platform.isTauri()) return;

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      const isDevtoolsCombo = isMetaOrCtrl && event.shiftKey && (key === "i" || key === "j" || key === "c");
      const isInspectorKey = key === "f12";

      if (isDevtoolsCombo || isInspectorKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const handleCreateProject = (name: string, aspectRatio: AspectRatio, frameRate: 24 | 30 | 60) => {
    // Reset UI state from any previous session
    useUIStore.getState().exitSourceMode();
    createProject(name, aspectRatio, frameRate);
  };

  const handleOpenProject = async (proj: Project) => {
    try {
      useUIStore.getState().exitSourceMode();

      const appData = await platform.appDataDir();
      const projectPath = await platform.joinPaths(appData, "projects", `${proj.id}.json`);

      const projectJson = await platform.loadProject(projectPath);
      const rustProject: RustProject = JSON.parse(projectJson);

      const project = fromRustProject(rustProject);

      const mediaAssetsPayload = project.mediaAssets ?? [];
      const tracksPayload = rustProject.tracks?.map(fromRustTrack) ?? [];
      const clipsPayload = rustProject.clips?.map(fromRustClip) ?? [];
      const transitionsPayload = rustProject.transitions ?? [];

      // Resolve kind for legacy projects
      const assetMap = new Map(mediaAssetsPayload.map((a) => [a.id, a]));
      for (const clip of clipsPayload) {
        if (!clip.kind) {
          if ("text" in clip || clip.id.startsWith("text-clip-")) {
            clip.kind = "text";
          } else if (clip.mediaId.startsWith("sticker-")) {
            clip.kind = "sticker";
          } else if (clip.id.startsWith("filter-clip-")) {
            clip.kind = "filter";
          } else {
            const asset = assetMap.get(clip.mediaId);
            if (asset) {
              clip.kind = asset.type; // "video" | "audio" | "image"
            }
          }
        }
      }

      await loadProject(project, { mediaAssets: mediaAssetsPayload, tracks: tracksPayload, clips: clipsPayload, transitions: transitionsPayload });

      setTimeout(async () => {
        const { useTimelineStore } = await import("./store/timelineStore");
        const timelineState = useTimelineStore.getState();

        // NOTE: swatch property has been removed from Clip type
        // Heal any legacy/bugged filter clips on the timeline that are missing their swatch
        /*
        const filterClips = timelineState.clips.filter((c) => c.kind === "filter");
        if (filterClips.length > 0) {
          try {
            const { filterCacheManager } = await import("./features/filters/cache/filterCache");
            await filterCacheManager.initialize();

            for (const clip of filterClips) {
              if (!clip.swatch) {
                const cached = filterCacheManager.getCached(clip.mediaId);
                if (cached?.filter?.swatch) {
                  console.log(`[App] Healing empty swatch for filter clip: ${clip.id}`);
                  timelineState.updateClip(clip.id, { swatch: cached.filter.swatch });
                } else {
                  // Fallback: try loading or downloading the filter from disk/API
                  const details = await filterCacheManager.loadCachedFilter(clip.mediaId);
                  if (details?.swatch) {
                    console.log(`[App] Healed swatch for filter clip from cache file: ${clip.id}`);
                    timelineState.updateClip(clip.id, { swatch: details.swatch });
                  }
                }
              }
            }
          } catch (err) {
            console.warn("[App] Failed to heal timeline filters on project load:", err);
          }
        }
        */
      }, 200);
    } catch (error) {
      console.error("[OpenProject] Failed to open project:", error);
      useProjectStore.getState().showToast("Failed to open project", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mx-auto mb-4" />
          <p className="text-text-primary">Loading...</p>
        </div>
      </div>
    );
  }

  // FIX (FINDING-022): Wrap entire app in root-level ErrorBoundary for crash recovery
  return (
    <ErrorBoundary
      fallback={
        <div className="w-full h-full flex items-center justify-center bg-bg">
          <div className="text-center max-w-md p-8">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-text-primary mb-4">Application Error</h1>
            <p className="text-text-muted mb-6">Something went wrong. The application encountered an unexpected error.</p>
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-soft transition-colors font-semibold">
              Restart Application
            </button>
          </div>
        </div>
      }
    >
      <TooltipProvider delayDuration={0}>{project ? <EditorScreen /> : <LaunchScreen onProjectCreate={handleCreateProject} onProjectOpen={handleOpenProject} />}</TooltipProvider>
      <SettingsModal isOpen={showSettingsModal} onClose={toggleSettingsModal} />
    </ErrorBoundary>
  );
};

export default App;
