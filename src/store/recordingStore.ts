import { create } from "zustand";

export interface RecordingState {
  isRecording: boolean;
  seconds: number;
  hasWebcam: boolean;
  previewRecording: { filePaths: string[] } | null;

  setIsRecording: (v: boolean) => void;
  setSeconds: (updater: number | ((prev: number) => number)) => void;
  setHasWebcam: (v: boolean) => void;
  setPreviewRecording: (v: { filePaths: string[] } | null) => void;
  reset: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  seconds: 0,
  hasWebcam: true,
  previewRecording: null,

  setIsRecording: (v) => set({ isRecording: v }),
  setSeconds: (updater) =>
    set((state) => ({
      seconds: typeof updater === "function" ? updater(state.seconds) : updater,
    })),
  setHasWebcam: (v) => set({ hasWebcam: v }),
  setPreviewRecording: (v) => set({ previewRecording: v }),
  reset: () => set({ isRecording: false, seconds: 0, previewRecording: null }),
}));
