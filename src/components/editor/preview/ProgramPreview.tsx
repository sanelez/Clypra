import React, { useState } from "react";
import { SimpleProgramPreview } from "./SimpleProgramPreview.jsx";
import { ComplexProgramPreview } from "./ComplexProgramPreview.jsx";
import { PixiProgramPreview } from "./PixiProgramPreview.jsx";
import { DEV_PREVIEW_MODE, PRODUCTION_PREVIEW_MODE, type PreviewMode } from "./previewMode.js";

// React Error Boundary to catch WebGL / Pixi initialization errors
class PreviewErrorBoundary extends React.Component<{ fallback: React.ReactNode; onError: (error: Error) => void; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const ProgramPreview: React.FC<any> = (props) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>(import.meta.env.DEV ? DEV_PREVIEW_MODE : PRODUCTION_PREVIEW_MODE);

  const handleWebGLFailure = (error: Error) => {
    console.error("[ProgramPreview] complex-pixi mode failed, falling back to complex-canvas2d for this session", error);
    setPreviewMode("complex-canvas2d");
  };

  switch (previewMode) {
    case "simple":
      return (
        <PreviewErrorBoundary fallback={<ComplexProgramPreview {...props} />} onError={handleWebGLFailure}>
          <SimpleProgramPreview {...props} />
        </PreviewErrorBoundary>
      );

    case "complex-pixi":
      return (
        <PreviewErrorBoundary fallback={<ComplexProgramPreview {...props} />} onError={handleWebGLFailure}>
          <PixiProgramPreview {...props} />
        </PreviewErrorBoundary>
      );

    case "complex-canvas2d":
    default:
      return <ComplexProgramPreview {...props} />;
  }
};
