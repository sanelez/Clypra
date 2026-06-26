import React, { useEffect } from "react";
// @ts-ignore - react-dnd types issue
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { SettingsModal } from "@/components/ui/SettingsModal";
import { SuccessToast } from "@/components/ui/SuccessToast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { usePlaybackControls } from "@/hooks/usePlaybackClock";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectStore } from "@/store/projectStore";
import { useUIStore } from "@/store/uiStore";

interface EditorScreenProps {
  onRequestClose?: () => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({ onRequestClose }) => {
  const toastMessage = useProjectStore((s) => s.toastMessage);
  const toastVariant = useProjectStore((s) => s.toastVariant);
  const { toastMessage: shortcutToast } = useKeyboardShortcuts();
  const { setDuration } = usePlaybackControls();
  const projectDuration = useProjectStore((s) => s.project?.duration ?? 0);

  useEffect(() => {
    setDuration(projectDuration);
  }, [projectDuration, setDuration]);

  return (
    <ErrorBoundary>
      <DndProvider backend={HTML5Backend}>
        <div className="w-full h-full overflow-hidden">
          <EditorLayout onRequestClose={onRequestClose} />
          <SuccessToast message={toastMessage || shortcutToast} variant={toastMessage ? toastVariant : "success"} />
        </div>
      </DndProvider>
    </ErrorBoundary>
  );
};
