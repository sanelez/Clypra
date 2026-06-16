import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffectsStore } from "@/features/text-effects/store/effectsStore";
import { useProjectStore } from "../projectStore";
import { useTimelineStore } from "../timelineStore";
import type { Project, TextClip, Track } from "@/types";

vi.mock("@/core/runtime/ProjectSession", () => ({
  disposeActiveSession: vi.fn(),
  createProjectSession: vi.fn(),
}));

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: null,
      mediaAssets: [],
      recentProjects: [],
      toastMessage: null,
      toastVariant: "success",
    });
    useTimelineStore.getState().hydrateFromProject({ tracks: [], clips: [] });
    useEffectsStore.setState({
      index: {},
      indexLoading: false,
      indexError: null,
      definitions: {},
      loadingId: null,
      prefetchingIds: new Set(),
      selectedEffect: null,
      selectedCategory: null,
    });
  });

  it("preloads saved text effect definitions before hydrating timeline clips", async () => {
    const project: Project = {
      id: "project-1",
      name: "Loaded Project",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: "16:9",
      canvasWidth: 1920,
      canvasHeight: 1080,
      frameRate: 30,
      duration: 10,
    };
    const tracks: Track[] = [{ id: "track-text", type: "text", name: "Text", muted: false, locked: false, visible: true, height: 30 }];
    const clips: TextClip[] = [
      {
        id: "clip-text",
        kind: "text",
        trackId: "track-text",
        mediaId: "",
        startTime: 0,
        duration: 3,
        trimIn: 0,
        trimOut: 3,
        x: 100,
        y: 100,
        width: 500,
        height: 160,
        opacity: 1,
        rotation: 0,
        text: "CLYPRA",
        fontFamily: "Inter",
        fontSize: 96,
        color: "#ffffff",
        align: "center",
        valign: "middle",
        lineHeight: 1.2,
        paddingX: 16,
        paddingY: 16,
        styleId: "premium-sticker",
      },
    ];

    const originalHydrate = useTimelineStore.getState().hydrateFromProject;
    const hydrateSpy = vi.fn((payload: { tracks?: any[]; clips?: any[] }) => {
      expect(useEffectsStore.getState().definitions["premium-sticker"]).toBeDefined();
      originalHydrate(payload);
    });
    useTimelineStore.setState({ hydrateFromProject: hydrateSpy } as any);

    await useProjectStore.getState().loadProject(project, { tracks, clips, mediaAssets: [] });

    expect(hydrateSpy).toHaveBeenCalledWith({ tracks, clips, transitions: [], gaps: [] });
    expect(useTimelineStore.getState().clips[0]).toMatchObject({ id: "clip-text", styleId: "premium-sticker" });
  });
});
