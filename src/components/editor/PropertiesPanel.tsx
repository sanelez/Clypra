import React from "react";
import { Settings } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { useUIStore } from "@/store/uiStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { TransformClipCommand } from "@/core/history/commands/TransformCommand";
import { calculateClipDimensions, type ClipFitModeExtended } from "@/lib/timelineClip";

export const PropertiesPanel: React.FC = () => {
  const { selectedClipIds } = useUIStore();
  const { clips } = useTimelineStore();
  const { mediaAssets, project } = useProjectStore();
  const { execute } = useHistoryStore();

  const selectedClipId = selectedClipIds[0] ?? null;
  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const selectedAsset = mediaAssets.find((a) => a.id === selectedClip?.mediaId);
  const isVisualClip = selectedAsset?.type === "video" || selectedAsset?.type === "image";

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="w-[23rem] min-h-0 panel-shell flex flex-col p-4 overflow-y-auto scrollbar-thin shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4" />
          <span className="text-sm font-medium">Properties</span>
        </div>
        <EmptyState icon={Settings} title="Select a clip to edit" />
      </div>
    );
  }

  const handleUpdate = (key: keyof typeof selectedClip, value: any) => {
    const oldTransform = { [key]: selectedClip[key] };
    const newTransform = { [key]: value };
    execute(new TransformClipCommand(selectedClipId, oldTransform, newTransform));
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

  return (
    <div className="w-[23rem] min-h-0 panel-shell flex flex-col overflow-y-auto scrollbar-thin shrink-0">
      <div className="p-4 panel-head">
        <h3 className="font-semibold text-text-primary">Clip Properties</h3>
      </div>

      <div className="flex-1 p-4 space-y-6">
        {/* Transform Section */}
        <div>
          <h4 className="text-sm font-semibold text-text-primary mb-3">Transform</h4>
          <div className="space-y-2">
            {isVisualClip && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Fit Mode</label>
                  <select value={selectedClip.fitMode ?? "cover"} onChange={(e) => handleApplyFit(e.target.value as ClipFitModeExtended)} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary">
                    <option value="contain">Contain</option>
                    <option value="cover">Cover</option>
                    <option value="fill">Fill</option>
                    <option value="stretch">Stretch</option>
                    <option value="original">Original</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => handleApplyFit(selectedClip.fitMode ?? "cover")} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary hover:bg-white/6 transition-colors">
                    Reset Transform
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-muted block mb-1">X</label>
                <input type="number" value={Math.round(selectedClip.x)} onChange={(e) => handleUpdate("x", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Y</label>
                <input type="number" value={Math.round(selectedClip.y)} onChange={(e) => handleUpdate("y", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-muted block mb-1">Width</label>
                <input type="number" value={Math.round(selectedClip.width)} onChange={(e) => handleUpdate("width", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Height</label>
                <input type="number" value={Math.round(selectedClip.height)} onChange={(e) => handleUpdate("height", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">Rotation</label>
              <div className="flex items-center gap-2">
                <input type="range" min="-180" max="180" value={selectedClip.rotation} onChange={(e) => handleUpdate("rotation", Number(e.target.value))} className="flex-1" />
                <input type="number" value={Math.round(selectedClip.rotation)} onChange={(e) => handleUpdate("rotation", Number(e.target.value))} className="w-12 bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">Opacity</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="100" value={selectedClip.opacity} onChange={(e) => handleUpdate("opacity", Number(e.target.value))} className="flex-1" />
                <span className="text-xs text-text-primary w-8">{Math.round(selectedClip.opacity)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clip Section */}
        <div>
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-text-primary">Clip</h4>
            <p className="text-[11px] text-text-muted mt-1">Some controls below are not fully functional yet.</p>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-muted block">Speed</label>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted">Not fully functional</span>
              </div>
              <select defaultValue="1x" disabled className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary opacity-60 cursor-not-allowed">
                <option value="0.25x">0.25x</option>
                <option value="0.5x">0.5x</option>
                <option value="1x">1x</option>
                <option value="1.5x">1.5x</option>
                <option value="2x">2x</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-muted block">Trim In (s)</label>
                <span className="text-[10px] text-text-muted">Basic mode</span>
              </div>
              <input type="number" value={selectedClip.trimIn.toFixed(2)} onChange={(e) => handleUpdate("trimIn", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-muted block">Trim Out (s)</label>
                <span className="text-[10px] text-text-muted">Basic mode</span>
              </div>
              <input type="number" value={selectedClip.trimOut.toFixed(2)} onChange={(e) => handleUpdate("trimOut", Number(e.target.value))} className="w-full bg-surface-raised border border-border rounded px-2 py-1 text-xs text-text-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
