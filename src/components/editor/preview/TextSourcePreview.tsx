import { useState, useCallback, useEffect } from "react";
import { LottiePlayer } from "@/features/text-templates/LottiePlayer";
import { renderTextEffect } from "@/features/text-effects/renderer";
import { allTextEffects } from "@/features/text-effects/registry";
import { getFontFamilyStack } from "@/features/text-effects/lib/helpers";

export const TextSourcePreview: React.FC<{ preset: any }> = ({ preset }) => {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

  const previewText = preset.text || "Default text";
  const isTemplate = preset?.presetType === "template" || !!preset?.lottieData;
  const styleId = preset?.styleId || preset?.id;
  const premiumEffect = styleId ? allTextEffects.find((e) => e.id === styleId) : null;

  useEffect(() => {
    if (!canvas || !premiumEffect || isTemplate) return;
    canvas.width = 640;
    canvas.height = 360;

    const overriddenEffect = {
      ...premiumEffect,
      font: {
        ...premiumEffect.font,
        family: preset?.font?.family || premiumEffect.font.family,
      },
    };

    renderTextEffect(canvas, previewText, overriddenEffect, 44);

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        // Redraw once fonts have finished loading
        renderTextEffect(canvas, previewText, overriddenEffect, 44);
      });
    }
  }, [canvas, previewText, premiumEffect, isTemplate, preset?.font?.family]);

  useEffect(() => {
    if (preset?.font?.family) {
      const stack = getFontFamilyStack(preset.font.family);
      console.info(`[Info] [Clypra HTML Preview] Font Applied to Heading: "${preset.font.family}" | Mapped Stack: ${stack} | Target: <h1 className="absolute top-3 left-3"> ("Abdulkabir Musa") (TextSourcePreview.tsx)`);
    }
  }, [preset?.font?.family]);

  if (!preset) return null;

  if (isTemplate) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center relative p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden">
        <LottiePlayer lottieData={preset.injectedData || preset.lottieData} autoplay={true} loop={true} className="w-full h-full object-contain" />
      </div>
    );
  }

  // Always use Canvas display since all effects are registered procedurally
  return (
    <div className="w-full aspect-video flex items-center justify-center relative p-8 border-white/5 overflow-hidden">
      <h1 className="absolute top-1 left-3 text-white z-10" style={{ fontFamily: getFontFamilyStack(preset?.font?.family || "sans-serif") }}>
        Abdulkabir Musa
      </h1>
      <canvas ref={canvasRef} className="max-w-full max-h-full block select-none pointer-events-none relative z-10" />
    </div>
  );
};
