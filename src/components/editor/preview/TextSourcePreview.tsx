import { useState, useCallback, useEffect } from "react";
import { LottiePlayer } from "@/features/text-templates/LottiePlayer";
import { renderTextEffectAsync } from "@/features/text-effects/renderer";

export const TextSourcePreview: React.FC<{ preset: any }> = ({ preset }) => {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

  const previewText = preset?.text || "CLYPRA";
  const isTemplate = preset?.presetType === "template" || !!preset?.lottieData;

  // The preset IS the full effect definition (fetched from API). Use it directly —
  // allTextEffects is empty since definitions are no longer bundled locally.
  const effectDefinition = !isTemplate && preset?.font ? preset : null;

  useEffect(() => {
    if (!canvas || !effectDefinition || isTemplate) return;
    // renderTextEffectAsync: sets canvas size, injects + awaits the font,
    // then calls evaluateScene (full engine pipeline incl. ctx.filter for blur).
    renderTextEffectAsync(canvas, previewText, effectDefinition, 44);
  }, [canvas, previewText, effectDefinition, isTemplate]);

  if (!preset) return null;

  if (isTemplate) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center relative p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden">
        <LottiePlayer lottieData={preset.injectedData || preset.lottieData} autoplay={true} loop={true} className="w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <div className="w-full aspect-video flex items-center justify-center relative border-white/5 overflow-hidden">
      <canvas ref={canvasRef} className="max-w-full max-h-full block select-none pointer-events-none" />
    </div>
  );
};

  if (!preset) return null;

  if (isTemplate) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center relative p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden">
        <LottiePlayer lottieData={preset.injectedData || preset.lottieData} autoplay={true} loop={true} className="w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <div className="w-full aspect-video flex items-center justify-center relative border-white/5 overflow-hidden">
      <canvas ref={canvasRef} className="max-w-full max-h-full block select-none pointer-events-none" />
    </div>
  );
};
