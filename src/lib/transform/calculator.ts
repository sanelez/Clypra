/**
 * Transform Calculator
 *
 * Core transform math for clip manipulation in canvas space.
 * Handles coordinate conversions, constraint enforcement, and transform operations.
 *
 * IMPORTANT: The `clip` parameter in calculateTransform must be the clip state
 * captured at drag start (startTransform), NOT the live clip state. Delta is
 * computed as (currentMouse - startMouse) and applied to the start state,
 * producing an absolute result that does not compound across frames.
 */

import type { Clip, TransformHandle, TransformConstraints } from "@/types";

const MIN_CLIP_SIZE = 20; // Minimum width/height in pixels

/**
 * Calculate new transform from handle drag operation.
 * Returns partial clip update with new position/dimensions.
 *
 * @param clip - The clip state at drag start (NOT live state — avoids compounding)
 * @param handle - Which handle is being dragged
 * @param startMousePos - Mouse position at drag start (canvas space)
 * @param currentMousePos - Current mouse position (canvas space)
 * @param constraints - Transform constraints
 * @param startAngle - For rotation: the initial angle at mousedown (radians). Optional.
 */
export function calculateTransform(
  clip: Clip,
  handle: TransformHandle,
  startMousePos: { x: number; y: number },
  currentMousePos: { x: number; y: number },
  constraints: TransformConstraints,
  startAngle?: number,
): Partial<Clip> {
  const delta = {
    x: currentMousePos.x - startMousePos.x,
    y: currentMousePos.y - startMousePos.y,
  };

  switch (handle) {
    case "move":
      return handleMove(clip, delta, constraints);

    case "nw":
    case "ne":
    case "sw":
    case "se":
      return handleCornerDrag(clip, handle, delta, constraints);

    case "n":
    case "s":
    case "e":
    case "w":
      return handleEdgeDrag(clip, handle, delta, constraints);

    case "rotate":
      return handleRotation(clip, currentMousePos, constraints, startAngle);

    default:
      return {};
  }
}

/**
 * Handle move operation (drag border).
 * Constrains position to canvas bounds.
 */
function handleMove(clip: Clip, delta: { x: number; y: number }, constraints: TransformConstraints): Partial<Clip> {
  let newX = clip.x + delta.x;
  let newY = clip.y + delta.y;

  // Constrain to canvas bounds (allow partial off-canvas)
  const minX = -clip.width * 0.5;
  const maxX = constraints.canvasWidth - clip.width * 0.5;
  const minY = -clip.height * 0.5;
  const maxY = constraints.canvasHeight - clip.height * 0.5;

  newX = Math.max(minX, Math.min(maxX, newX));
  newY = Math.max(minY, Math.min(maxY, newY));

  return { x: newX, y: newY };
}

/**
 * Handle corner drag for scaling.
 * Maintains aspect ratio if locked.
 */
function handleCornerDrag(clip: Clip, handle: "nw" | "ne" | "sw" | "se", delta: { x: number; y: number }, constraints: TransformConstraints): Partial<Clip> {
  const aspectRatio = clip.sourceAspectRatio ?? clip.width / clip.height;
  const isLocked = constraints.aspectRatioLocked;

  // Determine scale direction based on handle
  const scaleX = handle === "ne" || handle === "se" ? 1 : -1;
  const scaleY = handle === "sw" || handle === "se" ? 1 : -1;

  let newWidth = clip.width + delta.x * scaleX;
  let newHeight = clip.height + delta.y * scaleY;

  // Enforce minimum size
  newWidth = Math.max(constraints.minWidth, newWidth);
  newHeight = Math.max(constraints.minHeight, newHeight);

  if (isLocked) {
    // Maintain aspect ratio - use the dimension that changed more
    const widthChange = Math.abs(newWidth - clip.width);
    const heightChange = Math.abs(newHeight - clip.height);

    if (widthChange > heightChange) {
      newHeight = newWidth / aspectRatio;
    } else {
      newWidth = newHeight * aspectRatio;
    }
  }

  // Calculate new position (opposite corner stays fixed)
  let newX = clip.x;
  let newY = clip.y;

  if (handle === "nw" || handle === "sw") {
    // Left edge moved
    newX = clip.x + (clip.width - newWidth);
  }

  if (handle === "nw" || handle === "ne") {
    // Top edge moved
    newY = clip.y + (clip.height - newHeight);
  }

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Handle edge drag for single-axis scaling.
 * Enforces aspect ratio when locked (adjusts the perpendicular axis proportionally).
 */
function handleEdgeDrag(clip: Clip, handle: "n" | "s" | "e" | "w", delta: { x: number; y: number }, constraints: TransformConstraints): Partial<Clip> {
  const aspectRatio = clip.sourceAspectRatio ?? clip.width / clip.height;
  const isLocked = constraints.aspectRatioLocked;

  let newX = clip.x;
  let newY = clip.y;
  let newWidth = clip.width;
  let newHeight = clip.height;

  switch (handle) {
    case "n":
      newHeight = clip.height - delta.y;
      newHeight = Math.max(constraints.minHeight, newHeight);
      if (isLocked) {
        newWidth = newHeight * aspectRatio;
        // Center the width change horizontally
        newX = clip.x + (clip.width - newWidth) / 2;
      }
      newY = clip.y + (clip.height - newHeight);
      break;

    case "s":
      newHeight = clip.height + delta.y;
      newHeight = Math.max(constraints.minHeight, newHeight);
      if (isLocked) {
        newWidth = newHeight * aspectRatio;
        newX = clip.x + (clip.width - newWidth) / 2;
      }
      break;

    case "e":
      newWidth = clip.width + delta.x;
      newWidth = Math.max(constraints.minWidth, newWidth);
      if (isLocked) {
        newHeight = newWidth / aspectRatio;
        // Center the height change vertically
        newY = clip.y + (clip.height - newHeight) / 2;
      }
      break;

    case "w":
      newWidth = clip.width - delta.x;
      newWidth = Math.max(constraints.minWidth, newWidth);
      if (isLocked) {
        newHeight = newWidth / aspectRatio;
        newY = clip.y + (clip.height - newHeight) / 2;
      }
      newX = clip.x + (clip.width - newWidth);
      break;
  }

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Handle rotation around clip center.
 * Uses delta-angle from drag start to prevent initial snap.
 *
 * @param clip - Clip at drag start
 * @param mousePos - Current mouse position (canvas space)
 * @param constraints - Transform constraints
 * @param startAngle - Angle (radians) from clip center to mouse at drag start
 */
function handleRotation(clip: Clip, mousePos: { x: number; y: number }, constraints: TransformConstraints, startAngle?: number): Partial<Clip> {
  // Calculate clip center
  const centerX = clip.x + clip.width / 2;
  const centerY = clip.y + clip.height / 2;

  // Calculate current angle from center to mouse
  const currentAngle = Math.atan2(mousePos.y - centerY, mousePos.x - centerX);

  // If we have a start angle, compute rotation as delta from it
  // This prevents the initial 90° snap since rotation starts from the clip's current angle
  let degrees: number;
  if (startAngle !== undefined) {
    const deltaAngle = currentAngle - startAngle;
    degrees = clip.rotation + (deltaAngle * 180) / Math.PI;
  } else {
    // Fallback: absolute angle (will snap on first frame)
    degrees = (currentAngle * 180) / Math.PI;
  }

  // Normalize to -180..180
  degrees = ((degrees % 360) + 540) % 360 - 180;

  // Optional: Snap to 15-degree increments
  const snapThreshold = 5; // degrees
  const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180];

  for (const snapAngle of snapAngles) {
    if (Math.abs(degrees - snapAngle) < snapThreshold) {
      degrees = snapAngle;
      break;
    }
  }

  return { rotation: degrees };
}

/**
 * Get the cursor style for a transform handle.
 * Accounts for clip rotation to show the correct resize direction.
 */
export function getCursorForHandle(handle: TransformHandle, rotation: number = 0): string {
  const baseCursors: Record<TransformHandle, string> = {
    move: "move",
    nw: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    se: "nwse-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    rotate: "grab",
  };

  if (handle === "move" || handle === "rotate") {
    return baseCursors[handle];
  }

  // For resize handles, rotate the cursor to match clip rotation
  // Cursor directions cycle every 45° through 8 directions
  const cursorAngles: string[] = [
    "ns-resize",    // 0°
    "nesw-resize",  // 45°
    "ew-resize",    // 90°
    "nwse-resize",  // 135°
    "ns-resize",    // 180°
    "nesw-resize",  // 225°
    "ew-resize",    // 270°
    "nwse-resize",  // 315°
  ];

  const handleBaseAngle: Record<string, number> = {
    n: 0, ne: 45, e: 90, se: 135,
    s: 180, sw: 225, w: 270, nw: 315,
  };

  const baseAngle = handleBaseAngle[handle] ?? 0;
  const totalAngle = (baseAngle + rotation + 360) % 360;
  const index = Math.round(totalAngle / 45) % 8;

  return cursorAngles[index];
}

/**
 * Check if a point is inside a clip's bounds.
 * Handles rotation by inverse-rotating the point around clip center.
 */
export function isPointInClip(point: { x: number; y: number }, clip: Clip): boolean {
  const rotation = clip.rotation ?? 0;

  // Fast path: no rotation — simple AABB test
  if (rotation === 0) {
    return point.x >= clip.x && point.x <= clip.x + clip.width && point.y >= clip.y && point.y <= clip.y + clip.height;
  }

  // Rotation-aware: un-rotate the point around clip center, then AABB test
  const centerX = clip.x + clip.width / 2;
  const centerY = clip.y + clip.height / 2;

  const dx = point.x - centerX;
  const dy = point.y - centerY;

  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const unrotatedX = dx * cos - dy * sin + centerX;
  const unrotatedY = dx * sin + dy * cos + centerY;

  return unrotatedX >= clip.x && unrotatedX <= clip.x + clip.width && unrotatedY >= clip.y && unrotatedY <= clip.y + clip.height;
}

/**
 * Get default transform constraints for a clip.
 */
export function getDefaultConstraints(canvasWidth: number, canvasHeight: number, aspectRatioLocked: boolean = true): TransformConstraints {
  return {
    aspectRatioLocked,
    minWidth: MIN_CLIP_SIZE,
    minHeight: MIN_CLIP_SIZE,
    canvasWidth,
    canvasHeight,
    snapToGrid: false,
    snapThreshold: 10,
  };
}
