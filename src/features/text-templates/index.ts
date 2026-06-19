/**
 * Text Templates Feature
 * Public exports for text template functionality
 */

export { useTemplateStore } from "./templateStore";
export { renderToFrameSequence, renderFrameSequenceToTauri } from "./FrameRenderer";
export { TemplatePreviewPlayer, type TemplatePreviewPlayerHandle } from "./TemplatePreviewPlayer";

export type { TemplateDefinition } from "./types";
