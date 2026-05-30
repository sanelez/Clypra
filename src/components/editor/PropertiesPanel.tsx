import React, { useState } from "react";
import { Settings, Type, Layout, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Sparkles, Bookmark, Save, Trash2 } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/store/uiStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { TransformClipCommand } from "@/core/history/commands/TransformCommand";
import { calculateClipDimensions, type ClipFitModeExtended } from "@/lib/timelineClip";
import { allTextEffects } from "@/features/text-effects/registry";
import type { TextEffectDefinition } from "@/features/text-effects/types/types";
import type { TextClip } from "@/types";
import { normalizeFontFamily } from "@/core/evaluation/evaluator";
import { usePresetStore } from "@/store/presetStore";

import { _buildConfig } from "@/features/text-effects/registry";

export const PropertiesPanel: React.FC = () => {
  const { selectedClipIds } = useUIStore();
  const { clips } = useTimelineStore();
  const { mediaAssets, project } = useProjectStore();
  const { execute } = useHistoryStore();

  const [activePropertyTab, setActivePropertyTab] = useState<"text" | "transform">("text");
  const [newPresetName, setNewPresetName] = useState("");
  const { presets, savePreset, deletePreset } = usePresetStore();

  const selectedClipId = selectedClipIds[0] ?? null;
  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const selectedAsset = mediaAssets.find((a) => a.id === selectedClip?.mediaId);
  const isVisualClip = selectedAsset?.type === "video" || selectedAsset?.type === "image";
  const isTextClip = selectedClip && "text" in selectedClip;

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="w-92 min-h-0 panel-shell flex flex-col p-4 overflow-y-auto scrollbar-thin shrink-0 select-none">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4" />
          <span className="text-sm font-medium">Properties</span>
        </div>
        <EmptyState icon={Settings} title="Select a clip to edit" />
      </div>
    );
  }

  // Cast selected clip to TextClip when it is a text layer
  const textClip = selectedClip as unknown as TextClip;

  const handleUpdate = (key: string, value: any) => {
    const oldTransform = { [key]: (selectedClip as any)[key] };
    const newTransform = { [key]: value };
    execute(new TransformClipCommand(selectedClipId, oldTransform, newTransform));
  };

  const handleUpdateMultiple = (fields: Record<string, any>) => {
    const oldFields: Record<string, any> = {};
    for (const key in fields) {
      oldFields[key] = (selectedClip as any)[key];
    }
    execute(new TransformClipCommand(selectedClipId, oldFields, fields));
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

  // Quick switch text effects
  const applyEffectPreset = (effect: TextEffectDefinition) => {
    handleUpdateMultiple({
      styleId: effect.id,
      fontFamily: effect.font.family,
      color: effect.fills?.[0]?.color,
      fontWeight: effect.font.weight,
      fontStyle: effect.font.style,
      stroke: effect.strokes?.[0] ? { color: effect.strokes[0].color, width: effect.strokes[0].width } : undefined,
      shadow: effect.shadows?.[0] ? { color: effect.shadows[0].color, blur: effect.shadows[0].blur, offsetX: effect.shadows[0].offsetX ?? 0, offsetY: effect.shadows[0].offsetY ?? 0 } : undefined,
    });
  };

  // Get the selected effect's definition from allTextEffects
  const effectDefinition = allTextEffects.find((e) => e.id === textClip.styleId);

  if (effectDefinition) {
    // Resolve the definition into the exact flat config the engine constructor expects!
    const effectDefaults = _buildConfig(effectDefinition, textClip.text, textClip.fontSize, textClip.width || 640, textClip.height || 360);

    // Now you have the strict defaults defined by the studio! E.g.:
    console.log("Strict Default Fill Color:", effectDefaults.fillColor);
    console.log("Strict Default Bevel Depth:", effectDefaults.bevelDepth);
    console.log("Strict Default Scanline Toggle:", effectDefaults.isGlitchEffect);
  }

  return (
    <div className="w-92 min-h-0 panel-shell flex flex-col overflow-hidden shrink-0">
      {/* Header Panel Tabs */}
      <div className="panel-head flex items-center justify-between border-b border-border select-none">
        {isTextClip ? (
          <div className="flex w-full">
            <button onClick={() => setActivePropertyTab("text")} className={`flex-1 py-3 text-xs font-semibold tracking-wide border-b-2 text-center transition-all cursor-pointer ${activePropertyTab === "text" ? "text-accent border-accent bg-accent/5" : "text-text-muted border-transparent hover:text-text-primary"}`}>
              <span className="flex items-center justify-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                Text Style
              </span>
            </button>
            <button onClick={() => setActivePropertyTab("transform")} className={`flex-1 py-3 text-xs font-semibold tracking-wide border-b-2 text-center transition-all cursor-pointer ${activePropertyTab === "transform" ? "text-accent border-accent bg-accent/5" : "text-text-muted border-transparent hover:text-text-primary"}`}>
              <span className="flex items-center justify-center gap-1.5">
                <Layout className="w-3.5 h-3.5" />
                Video (Transform)
              </span>
            </button>
          </div>
        ) : (
          <div className="p-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-text-primary text-sm">Clip Properties</h3>
          </div>
        )}
      </div>

      {/* Property Contents */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        {/* Render Text Styling studio if text clip is selected and active tab is text */}
        {isTextClip && activePropertyTab === "text" && (
          <div className="space-y-5">
            {/* Text Editor Box */}
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5 select-none">Text Content</label>
              <textarea value={textClip.text || ""} onChange={(e) => handleUpdate("text", e.target.value)} rows={3} placeholder={effectDefinition?.text || "CLYPRA"} className="w-full bg-surface-raised border border-border/80 rounded-lg p-2.5 text-xs text-text-primary outline-none focus:border-accent resize-none selectable" />
            </div>

            {/* Style Presets Library */}
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-2 select-none">Style Presets</label>
              
              <div className="space-y-3 p-3 bg-surface-raised/20 border border-border/40 rounded-xl">
                {/* Horizontal preset selection carousel */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {presets.map((preset) => (
                    <div key={preset.id} className="relative shrink-0 group/preset">
                      <button
                        onClick={() => {
                          handleApplyPreset(preset);
                        }}
                        className="px-3 py-2 bg-surface-raised hover:bg-surface-raised/80 border border-border/60 hover:border-accent rounded-lg text-xs font-semibold text-text-primary transition-all cursor-pointer whitespace-nowrap"
                        style={{ fontFamily: preset.fontFamily, color: preset.color }}
                      >
                        {preset.name}
                      </button>

                      {preset.isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreset(preset.id);
                          }}
                          className="absolute -top-1.5 -right-1.5 p-0.5 bg-destructive text-white rounded-full opacity-0 group-hover/preset:opacity-100 transition-opacity hover:bg-destructive/80 cursor-pointer"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save Current Style as Preset */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Custom style name..."
                    className="flex-1 min-w-0 bg-surface-raised border border-border/80 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex items-center gap-1 shrink-0"
                    onClick={() => {
                      if (!newPresetName.trim()) return;
                      savePreset(newPresetName.trim(), {
                        fontFamily: textClip.fontFamily,
                        fontSize: textClip.fontSize,
                        fontWeight: textClip.fontWeight,
                        fontStyle: textClip.fontStyle,
                        color: textClip.color,
                        align: textClip.align,
                        valign: textClip.valign,
                        lineHeight: textClip.lineHeight,
                        letterSpacing: textClip.letterSpacing,
                        stroke: textClip.stroke,
                        shadow: textClip.shadow,
                        background: textClip.background,
                        keyframes: (textClip as any).keyframes,
                      });
                      setNewPresetName("");
                    }}
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Typography Options */}
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-2 select-none">Typography</label>

              <div className="space-y-3 p-3 bg-surface-raised/20 border border-border/40 rounded-xl">
                {/* Font Family Select */}
                <div>
                  <label className="text-[10px] text-text-muted block mb-1 select-none">Font Family</label>
                  <select value={normalizeFontFamily(textClip.fontFamily || "Inter Variable")} onChange={(e) => handleUpdate("fontFamily", e.target.value)} className="w-full bg-surface-raised border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none">
                    <optgroup label="System Fonts">
                      <option value="Arial">Arial</option>
                      <option value="Arial Black">Arial Black</option>
                      <option value="Arial Rounded MT Bold">Arial Rounded MT Bold</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Impact">Impact</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                      <option value="Palatino">Palatino</option>
                    </optgroup>
                    <optgroup label="Google Web Fonts">
                      <option value="Inter Variable">Inter</option>
                      <option value="Geist Variable">Geist</option>
                      <option value="Outfit Variable">Outfit</option>
                      <option value="Space Grotesk Variable">Space Grotesk</option>
                      <option value="Roboto Variable">Roboto</option>
                      <option value="Roboto Condensed">Roboto Condensed</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Lato">Lato</option>
                      <option value="Montserrat Variable">Montserrat</option>
                      <option value="Raleway">Raleway</option>
                      <option value="Oswald">Oswald</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="Anton">Anton</option>
                      <option value="Bebas Neue">Bebas Neue</option>
                      <option value="Nunito">Nunito</option>
                      <option value="Poppins">Poppins</option>
                      <option value="Permanent Marker">Permanent Marker</option>
                      <option value="Bangers">Bangers</option>
                      <option value="Press Start 2P">Press Start 2P</option>
                      <option value="Dancing Script">Dancing Script</option>
                      <option value="Pacifico">Pacifico</option>
                    </optgroup>
                  </select>
                </div>

                {/* Font Size slider */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-text-muted mb-1 select-none">
                    <span>Font Size</span>
                    <span className="font-mono text-text-primary">{textClip.fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min="10" max="150" value={textClip.fontSize || 48} onChange={(e) => handleUpdate("fontSize", Number(e.target.value))} className="grow accent-accent" />
                    <input type="number" value={textClip.fontSize || 48} onChange={(e) => handleUpdate("fontSize", Number(e.target.value))} className="w-12 bg-surface-raised border border-border rounded text-center py-0.5 text-xs text-text-primary outline-none" />
                  </div>
                </div>

                {/* Weight, Italic, Alignments */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {/* Style buttons */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-text-muted block select-none">Font Style</label>
                    <div className="flex gap-1 bg-surface-raised border border-border/60 p-0.5 rounded">
                      <button onClick={() => handleUpdate("fontWeight", textClip.fontWeight === "bold" ? "normal" : "bold")} className={`flex-1 py-1 rounded text-xs font-bold transition-all ${textClip.fontWeight === "bold" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        B
                      </button>
                      <button onClick={() => handleUpdate("fontStyle", textClip.fontStyle === "italic" ? "normal" : "italic")} className={`flex-1 py-1 rounded text-xs italic transition-all ${textClip.fontStyle === "italic" ? "bg-accent text-white font-bold" : "text-text-muted hover:text-text-primary"}`}>
                        I
                      </button>
                    </div>
                  </div>

                  {/* Alignment buttons */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-text-muted block select-none">Horizontal Align</label>
                    <div className="flex gap-1 bg-surface-raised border border-border/60 p-0.5 rounded">
                      <button onClick={() => handleUpdate("align", "left")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.align === "left" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleUpdate("align", "center")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.align === "center" || !textClip.align ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleUpdate("align", "right")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.align === "right" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Vertical align and letter spacing */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Vertical align */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-text-muted block select-none">Vertical Align</label>
                    <div className="flex gap-1 bg-surface-raised border border-border/60 p-0.5 rounded">
                      <button onClick={() => handleUpdate("valign", "top")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.valign === "top" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignStartVertical className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleUpdate("valign", "middle")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.valign === "middle" || !textClip.valign ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignCenterVertical className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleUpdate("valign", "bottom")} className={`flex-1 py-1 rounded flex items-center justify-center transition-all ${textClip.valign === "bottom" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                        <AlignEndVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Letter spacing */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-text-muted block select-none">Letter Spacing ({textClip.letterSpacing || 0}px)</label>
                    <input type="number" value={textClip.letterSpacing || 0} onChange={(e) => handleUpdate("letterSpacing", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded py-1 px-2 text-center text-xs text-text-primary outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Styling Customizers */}
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-2 select-none">Style Customizers</label>

              <div className="space-y-3.5 p-3.5 bg-surface-raised/20 border border-border/40 rounded-xl">
                {/* Solid Text Color */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-primary select-none">Text Color</span>
                  <div className="flex items-center gap-2">
                    {/* Linear Gradients Quick Selectors */}
                    <select
                      value={(textClip.color || "#ffffff").includes(",") ? textClip.color : "solid"}
                      onChange={(e) => {
                        if (e.target.value !== "solid") {
                          handleUpdate("color", e.target.value);
                        }
                      }}
                      className="bg-surface-raised border border-border rounded text-[10px] py-1 px-1.5 text-text-muted outline-none"
                    >
                      <option value="solid">Solid Color</option>
                      <option value="#ffe066, #b38600">Gold Gradient</option>
                      <option value="#ff3e00, #ff0077, #aa00ff">Sunset Gradient</option>
                      <option value="#ff007f, #aa00ff, #00c8ff, #00ff66">Rainbow Gradient</option>
                    </select>
                    <input type="color" value={(textClip.color || "#ffffff").includes(",") ? "#ffffff" : textClip.color || "#ffffff"} onChange={(e) => handleUpdate("color", e.target.value)} className="w-7 h-7 bg-transparent border-0 cursor-pointer rounded overflow-hidden" />
                  </div>
                </div>

                {/* Stroke / Outline options */}
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between select-none">
                    <span className="text-xs text-text-primary font-medium">Outline / Stroke</span>
                    <input
                      type="checkbox"
                      checked={!!textClip.stroke}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleUpdate("stroke", { color: "#000000", width: 4 });
                        } else {
                          handleUpdate("stroke", undefined);
                        }
                      }}
                      className="rounded border-border accent-accent cursor-pointer"
                    />
                  </div>

                  {textClip.stroke && (
                    <div className="space-y-2 p-2 bg-surface-raised/40 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-muted">Color</span>
                        <input type="color" value={textClip.stroke.color} onChange={(e) => handleUpdate("stroke", { ...textClip.stroke, color: e.target.value })} className="w-6 h-6 bg-transparent border-0 cursor-pointer" />
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] text-text-muted mb-1 select-none">
                          <span>Thickness</span>
                          <span>{textClip.stroke.width}px</span>
                        </div>
                        <input type="range" min="1" max="15" value={textClip.stroke.width} onChange={(e) => handleUpdate("stroke", { ...textClip.stroke, width: Number(e.target.value) })} className="w-full accent-accent" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Outer Glow / Shadow */}
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between select-none">
                    <span className="text-xs text-text-primary font-medium">Outer Glow / Shadow</span>
                    <input
                      type="checkbox"
                      checked={!!textClip.shadow}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleUpdate("shadow", { color: "#ff0000", blur: 15, offsetX: 0, offsetY: 0 });
                        } else {
                          handleUpdate("shadow", undefined);
                        }
                      }}
                      className="rounded border-border accent-accent cursor-pointer"
                    />
                  </div>

                  {textClip.shadow && (
                    <div className="space-y-2 p-2 bg-surface-raised/40 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-muted">Glow Color</span>
                        <input type="color" value={textClip.shadow.color} onChange={(e) => handleUpdate("shadow", { ...textClip.shadow, color: e.target.value })} className="w-6 h-6 bg-transparent border-0 cursor-pointer" />
                      </div>

                      <div>
                        <div className="flex justify-between text-[9px] text-text-muted mb-1 select-none">
                          <span>Blur Radius</span>
                          <span>{textClip.shadow.blur}px</span>
                        </div>
                        <input type="range" min="1" max="30" value={textClip.shadow.blur} onChange={(e) => handleUpdate("shadow", { ...textClip.shadow, blur: Number(e.target.value) })} className="w-full accent-accent" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-text-muted block mb-0.5 select-none">Offset X</label>
                          <input type="number" value={textClip.shadow.offsetX} onChange={(e) => handleUpdate("shadow", { ...textClip.shadow, offsetX: Number(e.target.value) })} className="w-full bg-surface-raised border border-border text-center rounded py-0.5 text-xs text-text-primary outline-none" />
                        </div>
                        <div>
                          <label className="text-[9px] text-text-muted block mb-0.5 select-none">Offset Y</label>
                          <input type="number" value={textClip.shadow.offsetY} onChange={(e) => handleUpdate("shadow", { ...textClip.shadow, offsetY: Number(e.target.value) })} className="w-full bg-surface-raised border border-border text-center rounded py-0.5 text-xs text-text-primary outline-none" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Background Box Backing */}
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between select-none">
                    <span className="text-xs text-text-primary font-medium">Background Box</span>
                    <input
                      type="checkbox"
                      checked={!!textClip.background}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleUpdate("background", { color: "rgba(0,0,0,0.6)", padding: 12, borderRadius: 6 });
                        } else {
                          handleUpdate("background", undefined);
                        }
                      }}
                      className="rounded border-border accent-accent cursor-pointer"
                    />
                  </div>

                  {textClip.background && (
                    <div className="space-y-2 p-2 bg-surface-raised/40 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-muted">Box Color</span>
                        <input type="color" value={textClip.background.color.startsWith("rgba") ? "#000000" : textClip.background.color} onChange={(e) => handleUpdate("background", { ...textClip.background, color: e.target.value })} className="w-6 h-6 bg-transparent border-0 cursor-pointer" />
                      </div>

                      <div>
                        <div className="flex justify-between text-[9px] text-text-muted mb-1 select-none">
                          <span>Box Padding</span>
                          <span>{textClip.background.padding}px</span>
                        </div>
                        <input type="range" min="0" max="30" value={textClip.background.padding} onChange={(e) => handleUpdate("background", { ...textClip.background, padding: Number(e.target.value) })} className="w-full accent-accent" />
                      </div>

                      <div>
                        <div className="flex justify-between text-[9px] text-text-muted mb-1 select-none">
                          <span>Border Radius</span>
                          <span>{textClip.background.borderRadius}px</span>
                        </div>
                        <input type="range" min="0" max="25" value={textClip.background.borderRadius} onChange={(e) => handleUpdate("background", { ...textClip.background, borderRadius: Number(e.target.value) })} className="w-full accent-accent" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Presets Quick Switch */}
            <div>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-2 select-none">Quick Presets Switch</label>
              <div className="grid grid-cols-3 gap-2 bg-surface-raised/10 border border-border/40 p-2.5 rounded-xl">
                {allTextEffects.slice(0, 6).map((effect) => (
                  <button
                    key={effect.id}
                    onClick={() => applyEffectPreset(effect)}
                    className="p-2 rounded bg-surface-raised border border-border hover:border-accent text-center truncate text-[10px] text-text-primary font-bold shadow-[0_2px_4px_rgba(0,0,0,0.15)] transition-all cursor-pointer max-w-[90px]"
                    style={{
                      fontFamily: effect.font.family,
                      color: effect.fills?.[0]?.color ?? "#ffffff",
                      textShadow: effect.shadows?.[0] ? `0 0 4px ${effect.shadows[0].color}` : effect.glows?.[0] ? `0 0 4px ${effect.glows[0].color}` : "none",
                    }}
                  >
                    {effect.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Video Transform properties (rendered for non-text or if transform tab is selected) */}
        {(!isTextClip || activePropertyTab === "transform") && (
          <div className="space-y-6">
            {/* Transform Properties */}
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-3">Transform</h4>
              <div className="space-y-2">
                {isVisualClip && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">Fit Mode</label>
                      <select value={selectedClip.fitMode ?? "cover"} onChange={(e) => handleApplyFit(e.target.value as ClipFitModeExtended)} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary outline-none">
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                        <option value="fill">Fill</option>
                        <option value="stretch">Stretch</option>
                        <option value="original">Original</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={() => handleApplyFit(selectedClip.fitMode ?? "cover")} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary hover:bg-white/6 transition-all active:scale-[0.97]">
                        Reset Fit
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">X Position</label>
                    <input type="number" value={Math.round(selectedClip.x)} onChange={(e) => handleUpdate("x", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Y Position</label>
                    <input type="number" value={Math.round(selectedClip.y)} onChange={(e) => handleUpdate("y", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Width</label>
                    <input type="number" value={Math.round(selectedClip.width)} onChange={(e) => handleUpdate("width", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Height</label>
                    <input type="number" value={Math.round(selectedClip.height)} onChange={(e) => handleUpdate("height", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-text-muted block mb-1">Rotation</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="-180" max="180" value={selectedClip.rotation} onChange={(e) => handleUpdate("rotation", Number(e.target.value))} className="grow accent-accent" />
                    <input type="number" value={Math.round(selectedClip.rotation)} onChange={(e) => handleUpdate("rotation", Number(e.target.value))} className="w-12 bg-surface-raised border border-border rounded px-2 py-0.5 text-xs text-text-primary text-center outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-text-muted block mb-1">Opacity</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={selectedClip.opacity * 100} onChange={(e) => handleUpdate("opacity", Number(e.target.value) / 100)} className="grow accent-accent" />
                    <span className="text-xs text-text-primary w-8 text-right">{Math.round(selectedClip.opacity * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Clip Timing properties */}
            <div className="border-t border-border/40 pt-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-text-primary">Timing Options</h4>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Trim In (seconds)</label>
                  <input type="number" value={selectedClip.trimIn.toFixed(2)} onChange={(e) => handleUpdate("trimIn", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2.5 py-1 text-xs text-text-primary outline-none" />
                </div>

                <div>
                  <label className="text-xs text-text-muted block mb-1">Trim Out (seconds)</label>
                  <input type="number" value={selectedClip.trimOut.toFixed(2)} onChange={(e) => handleUpdate("trimOut", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2.5 py-1 text-xs text-text-primary outline-none" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
