import React, { useState } from "react";
import { Type, Layout, Sparkles, Film, Music, Image, FileText, Clock, Shuffle, Smile, Filter } from "lucide-react";
import { PropertySection } from "./properties/primitives/PropertySection";
import { PropertySlider } from "./properties/primitives/PropertySlider";
import { useUIStore } from "@/store/uiStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { TransformClipCommand } from "@/core/history/commands/TransformCommand";
import { calculateClipDimensions, type ClipFitModeExtended } from "@/lib/timeline/timelineClip";
import { recalculateTextClipBounds } from "@/lib/text/textClip";
import type { Clip, TextClip } from "@/types";
import { usePresetStore } from "@/store/presetStore";

import { EmptyPropertiesState } from "./properties/EmptyPropertiesState";
import { TextStyleSection } from "./properties/TextStyleSection";
import { TransformSection } from "./properties/TransformSection";
import { AudioSection } from "./properties/AudioSection";
import { TextAnimationControls } from "./properties/TextAnimationControls";
import { EffectsFiltersSection } from "./properties/EffectsFiltersSection";
import { TransitionSection } from "./properties/TransitionSection";
import { StickerSettingsSection } from "./properties/StickerSettingsSection";

const TEXT_BOUNDS_STYLE_KEYS: (keyof TextClip)[] = ["text", "fontSize", "fontFamily", "fontWeight", "fontStyle", "styleId", "stroke", "shadow", "background", "letterSpacing", "lineHeight"];
const MANUAL_BOUNDS_KEYS: (keyof Clip)[] = ["x", "y", "width", "height"];

export function shouldRecalculateTextBoundsForPropertyUpdate(updates: Record<string, unknown>): boolean {
  const hasManualBounds = MANUAL_BOUNDS_KEYS.some((key) => key in updates);
  const hasStyleChange = TEXT_BOUNDS_STYLE_KEYS.some((key) => key in updates);
  return hasStyleChange && !hasManualBounds;
}

export function buildClipPropertyTransform(clip: Clip, updates: Record<string, unknown>, canvasWidth: number, canvasHeight: number): { oldTransform: Record<string, unknown>; newTransform: Record<string, unknown> } {
  let newTransform = { ...updates };

  if ("text" in clip && shouldRecalculateTextBoundsForPropertyUpdate(updates)) {
    const recalculated = recalculateTextClipBounds(clip as TextClip, updates as Partial<TextClip>, canvasWidth, canvasHeight);
    newTransform = {
      ...newTransform,
      x: recalculated.x,
      y: recalculated.y,
      width: recalculated.width,
      height: recalculated.height,
    };
  }

  const oldTransform: Record<string, unknown> = {};
  for (const key of Object.keys(newTransform)) {
    oldTransform[key] = (clip as unknown as Record<string, unknown>)[key];
  }

  return { oldTransform, newTransform };
}

/** Clip type display info */
function getClipTypeInfo(assetType: string | undefined, isText: boolean, isSticker?: boolean, isFilter?: boolean) {
  if (isText) return { icon: FileText, label: "Text", color: "text-purple-400" };
  if (isSticker) return { icon: Smile, label: "Sticker", color: "text-pink-400" };
  if (isFilter) return { icon: Sparkles, label: "Filter", color: "text-violet-400" };
  switch (assetType) {
    case "video":
      return { icon: Film, label: "Video", color: "text-blue-400" };
    case "audio":
      return { icon: Music, label: "Audio", color: "text-green-400" };
    case "image":
      return { icon: Image, label: "Image", color: "text-amber-400" };
    default:
      return { icon: Film, label: "Clip", color: "text-text-muted" };
  }
}

type TextPropertyTab = "text" | "animation" | "transform";

const TEXT_TABS: { id: TextPropertyTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "text", label: "Text Style", icon: Type },
  { id: "animation", label: "Animation", icon: Sparkles },
  { id: "transform", label: "Transform", icon: Layout },
];

export const PropertiesPanel: React.FC = () => {
  const { selectedClipIds, selectedTransitionId, clearSelection } = useUIStore();
  const { clips, transitions, updateTransition, removeTransition } = useTimelineStore();
  const { mediaAssets, project } = useProjectStore();
  const { execute } = useHistoryStore();

  const [activePropertyTab, setActivePropertyTab] = useState<TextPropertyTab>("text");
  const [newPresetName, setNewPresetName] = useState("");
  const { presets, savePreset, deletePreset } = usePresetStore();

  const selectedTransition = transitions.find((t) => t.id === selectedTransitionId);

  if (selectedTransitionId && selectedTransition) {
    return (
      <div className="w-full md:w-92 min-h-0 panel-shell flex flex-col overflow-hidden shrink-0">
        <div className="panel-head border-b border-border">
          <div className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border/40 flex items-center justify-center shrink-0 text-accent">
              <Shuffle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text-primary truncate">
                {selectedTransition.type === "dissolve" ? "Dissolve" : "Fade"} Transition
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-medium text-accent">Transition</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
          <TransitionSection
            selectedTransition={selectedTransition}
            updateTransition={updateTransition}
            removeTransition={removeTransition}
            clearSelection={clearSelection}
          />
        </div>
      </div>
    );
  }

  const selectedClipId = selectedClipIds[0] ?? null;
  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const selectedAsset = mediaAssets.find((a) => a.id === selectedClip?.mediaId);
  const isVisualClip = selectedAsset?.type === "video" || selectedAsset?.type === "image";
  const isAudioClip = selectedAsset?.type === "audio";
  const isVideoClip = selectedAsset?.type === "video"; // Video clips have audio tracks
  const isTextClip = selectedClip && "text" in selectedClip;
  const hasAudioTrack = isAudioClip || isVideoClip; // Both audio clips and video clips have audio

  if (!selectedClipId || !selectedClip) {
    return <EmptyPropertiesState />;
  }

  // Cast selected clip to TextClip when it is a text layer
  const textClip = selectedClip as unknown as TextClip;

  const canvasWidth = project?.canvasWidth ?? 1920;
  const canvasHeight = project?.canvasHeight ?? 1080;

  const handleUpdate = (key: string, value: any) => {
    const { oldTransform, newTransform } = buildClipPropertyTransform(selectedClip, { [key]: value }, canvasWidth, canvasHeight);
    execute(new TransformClipCommand(selectedClipId, oldTransform, newTransform));
  };

  const handleUpdateMultiple = (fields: Record<string, any>) => {
    const { oldTransform: oldFields, newTransform: newFields } = buildClipPropertyTransform(selectedClip, fields, canvasWidth, canvasHeight);
    execute(new TransformClipCommand(selectedClipId, oldFields, newFields));
  };

  const handleApplyPreset = (preset: any) => {
    handleUpdateMultiple({
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight || "normal",
      fontStyle: preset.fontStyle || "normal",
      color: preset.color,
      align: preset.align || "center",
      valign: preset.valign || "middle",
      lineHeight: preset.lineHeight || 1.2,
      letterSpacing: preset.letterSpacing || 0,
      stroke: preset.stroke,
      shadow: preset.shadow,
      background: preset.background,
      keyframes: preset.keyframes,
      styleId: undefined, // Clear the preset styleId
    });
  };

  const handleApplyFit = (fitMode: ClipFitModeExtended) => {
    if (!selectedClip || !selectedAsset || !project || !isVisualClip) return;
    const rect = calculateClipDimensions(selectedAsset, project.canvasWidth, project.canvasHeight, fitMode);
    execute(
      new TransformClipCommand(
        selectedClip.id,
        {
          x: selectedClip.x,
          y: selectedClip.y,
          width: selectedClip.width,
          height: selectedClip.height,
          fitMode: selectedClip.fitMode,
        },
        {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fitMode,
        },
      ),
    );
  };

  const isSticker = selectedClip?.kind === "sticker" || selectedClip?.mediaId.startsWith("sticker-");
  const isFilter = selectedClip?.kind === "filter" || selectedClip?.id.startsWith("filter-clip-");

  // Clip type info for the header
  const typeInfo = getClipTypeInfo(selectedAsset?.type, !!isTextClip, isSticker, isFilter);
  const TypeIcon = typeInfo.icon;
  const clipName = isTextClip ? (textClip.text || "Text").slice(0, 24) : isFilter ? (selectedClip.name || "Filter") : selectedAsset?.name || "Clip";
  const clipDuration = selectedClip.duration.toFixed(1);

  return (
    <div className="w-full md:w-92 min-h-0 panel-shell flex flex-col overflow-hidden shrink-0">
      {/* Clip Info Header */}
      <div className="panel-head border-b border-border">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg bg-surface-raised border border-border/40 flex items-center justify-center shrink-0 ${typeInfo.color}`}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary truncate">{clipName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
              <span className="text-[9px] text-text-muted/40">•</span>
              <span className="text-[9px] text-text-muted tabular-nums flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {clipDuration}s
              </span>
            </div>
          </div>
        </div>

        {/* Tabs for text clips */}
        {isTextClip && (
          <div className="flex border-t border-border/40">
            {TEXT_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activePropertyTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActivePropertyTab(tab.id)} className={`flex-1 py-2 text-[10px] font-semibold tracking-wide text-center transition-all cursor-pointer border-b-2 ${isActive ? "text-accent border-accent bg-accent/[0.04]" : "text-text-muted border-transparent hover:text-text-primary hover:bg-white/[0.02]"}`}>
                  <span className="flex items-center justify-center gap-1.5">
                    <TabIcon className="w-3 h-3" />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Property Contents */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {/* Sticker properties */}
        {isSticker && <StickerSettingsSection selectedClip={selectedClip} handleUpdate={handleUpdate} />}

        {/* Audio properties (audio clips or video clips) */}
        {hasAudioTrack && <AudioSection selectedClip={selectedClip} handleUpdate={handleUpdate} />}

        {/* Text Styling (text clip + text tab) */}
        {isTextClip && activePropertyTab === "text" && <TextStyleSection textClip={textClip} presets={presets} newPresetName={newPresetName} setNewPresetName={setNewPresetName} handleUpdate={handleUpdate} handleUpdateMultiple={handleUpdateMultiple} handleApplyPreset={handleApplyPreset} savePreset={savePreset} deletePreset={deletePreset} />}

        {/* Text Animations (text clip + animation tab) */}
        {isTextClip && activePropertyTab === "animation" && <TextAnimationControls clip={textClip} handleUpdate={handleUpdate} handleUpdateMultiple={handleUpdateMultiple} />}

        {/* Transform (visual clips, or text clips on transform tab) */}
        {(isVisualClip || (isTextClip && activePropertyTab === "transform")) && <TransformSection selectedClip={selectedClip} isVisualClip={isVisualClip} handleUpdate={handleUpdate} handleApplyFit={handleApplyFit} canvasWidth={canvasWidth} canvasHeight={canvasHeight} />}

        {/* Effects and Filters */}
        {isVisualClip && <EffectsFiltersSection selectedClip={selectedClip} handleUpdate={handleUpdate} />}

        {/* Filter Clip Settings */}
        {isFilter && (
          <PropertySection title="Filter Settings" icon={<Filter className="w-3.5 h-3.5 text-accent-soft" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-surface-raised/40 border border-border/30 rounded-lg p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {selectedClip.name}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">Timeline Filter</p>
                </div>
              </div>

              <PropertySlider
                label="Intensity"
                value={Math.round(((selectedClip as any).intensity ?? 0.8) * 100)}
                min={0}
                max={100}
                step={1}
                suffix="%"
                onChange={(val) => handleUpdate("intensity", val / 100)}
                compact
              />
            </div>
          </PropertySection>
        )}
      </div>
    </div>
  );
};
