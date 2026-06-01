import React from "react";
import { useUIStore } from "@/store/uiStore";
import { SourcePreview } from "./SourcePreview";
import { ProgramPreview } from "./ProgramPreview";

export const PreviewPanel: React.FC = () => {
  const { previewMode } = useUIStore();

  // If in source mode, show SourcePreview
  if (previewMode === "source") {
    return <SourcePreview />;
  }

  return <ProgramPreview />;
};
