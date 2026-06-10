/**
 * Gap Commands
 *
 * History commands for gap operations (insert, remove, resize, protect).
 * Gaps are first-class timeline entities.
 */

import type { Command } from "../Command";
import { generateCommandId } from "../Command";
import type { Gap } from "@/types/gap";
import type { Clip } from "@/types";
import { insertGapWithRipple, createGap } from "@/lib/gapEngine";

interface TimelineState {
  clips: Clip[];
  gaps: Gap[];
  epoch: number;
}

/**
 * Insert Gap Command
 *
 * Inserts a gap at specified position, shifting clips right (ripple)
 */
export class InsertGapCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly undoable: boolean = true;

  private insertedGap: Gap | null = null;
  private shiftedClips: Array<{ id: string; originalStartTime: number }> = [];

  constructor(
    private readonly trackId: string,
    private readonly startTime: number,
    private readonly duration: number,
  ) {
    this.id = generateCommandId();
    this.label = "Insert Gap";
    this.timestamp = Date.now();
  }

  apply(state: TimelineState): TimelineState {
    // Create gap
    const gap = createGap({
      trackId: this.trackId,
      startTime: this.startTime,
      duration: this.duration,
      type: "manual" as const,
      source: "user-insert" as const,
      metadata: {
        createdAt: Date.now(),
        userCreated: true,
      },
    });

    this.insertedGap = gap;

    // Find clips that need to shift
    const affectedClips = state.clips.filter((c) => c.trackId === this.trackId && c.startTime >= this.startTime);

    // Store original positions for undo
    this.shiftedClips = affectedClips.map((c) => ({
      id: c.id,
      originalStartTime: c.startTime,
    }));

    // Apply the gap insertion and shift clips
    return {
      ...state,
      gaps: [...state.gaps, gap],
      clips: state.clips.map((c) => {
        if (c.trackId === this.trackId && c.startTime >= this.startTime) {
          return {
            ...c,
            startTime: c.startTime + this.duration,
          };
        }
        return c;
      }),
      epoch: state.epoch + 1,
    };
  }

  invert(): Command {
    if (!this.insertedGap) {
      throw new Error("Cannot invert InsertGapCommand: no gap stored");
    }
    return new RemoveGapCommand(this.insertedGap.id);
  }

  toJSON(): Record<string, any> {
    return {
      type: "InsertGap",
      trackId: this.trackId,
      startTime: this.startTime,
      duration: this.duration,
      insertedGap: this.insertedGap,
      shiftedClips: this.shiftedClips,
    };
  }

  static fromJSON(data: Record<string, any>): InsertGapCommand {
    const cmd = new InsertGapCommand(data.trackId, data.startTime, data.duration);
    cmd.insertedGap = data.insertedGap;
    cmd.shiftedClips = data.shiftedClips || [];
    return cmd;
  }
}

/**
 * Remove Gap Command
 *
 * Removes a gap, shifting clips left (ripple delete)
 */
export class RemoveGapCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly undoable: boolean = true;

  private removedGap: Gap | null = null;
  private shiftedClips: Array<{ id: string; originalStartTime: number }> = [];

  constructor(private readonly gapId: string) {
    this.id = generateCommandId();
    this.label = "Remove Gap";
    this.timestamp = Date.now();
  }

  apply(state: TimelineState): TimelineState {
    // Find the gap
    const gap = state.gaps.find((g) => g.id === this.gapId);
    if (!gap) return state;

    this.removedGap = gap;
    const gapEnd = gap.startTime + gap.duration;

    // Find clips that need to shift
    const affectedClips = state.clips.filter((c) => c.trackId === gap.trackId && c.startTime >= gapEnd);

    // Store original positions for undo
    this.shiftedClips = affectedClips.map((c) => ({
      id: c.id,
      originalStartTime: c.startTime,
    }));

    // Remove gap and shift clips left
    return {
      ...state,
      gaps: state.gaps.filter((g) => g.id !== this.gapId),
      clips: state.clips.map((c) => {
        if (c.trackId === gap.trackId && c.startTime >= gapEnd) {
          return {
            ...c,
            startTime: c.startTime - gap.duration,
          };
        }
        return c;
      }),
      epoch: state.epoch + 1,
    };
  }

  invert(): Command {
    if (!this.removedGap) {
      throw new Error("Cannot invert RemoveGapCommand: no gap stored");
    }
    return new RestoreGapCommand(this.removedGap, this.shiftedClips);
  }

  toJSON(): Record<string, any> {
    return {
      type: "RemoveGap",
      gapId: this.gapId,
      removedGap: this.removedGap,
      shiftedClips: this.shiftedClips,
    };
  }

  static fromJSON(data: Record<string, any>): RemoveGapCommand {
    const cmd = new RemoveGapCommand(data.gapId);
    cmd.removedGap = data.removedGap;
    cmd.shiftedClips = data.shiftedClips || [];
    return cmd;
  }
}

/**
 * Restore Gap Command (inverse of remove)
 */
class RestoreGapCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly undoable: boolean = true;

  constructor(
    private readonly gap: Gap,
    private readonly originalPositions: Array<{ id: string; originalStartTime: number }>,
  ) {
    this.id = generateCommandId();
    this.label = "Restore Gap";
    this.timestamp = Date.now();
  }

  apply(state: TimelineState): TimelineState {
    // Restore gap
    const restoredGap = { ...this.gap };

    // Shift clips back to original positions
    const clipsWithRestoredPositions = state.clips.map((c) => {
      const originalPosition = this.originalPositions.find((p) => p.id === c.id);
      if (originalPosition) {
        return {
          ...c,
          startTime: originalPosition.originalStartTime,
        };
      }
      return c;
    });

    return {
      ...state,
      gaps: [...state.gaps, restoredGap],
      clips: clipsWithRestoredPositions,
      epoch: state.epoch + 1,
    };
  }

  invert(): Command {
    return new RemoveGapCommand(this.gap.id);
  }

  toJSON(): Record<string, any> {
    return {
      type: "RestoreGap",
      gap: this.gap,
      originalPositions: this.originalPositions,
    };
  }

  static fromJSON(data: Record<string, any>): RestoreGapCommand {
    return new RestoreGapCommand(data.gap, data.originalPositions);
  }
}

/**
 * Resize Gap Command
 *
 * Changes gap duration, shifting clips as needed
 */
export class ResizeGapCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly undoable: boolean = true;

  private originalDuration: number | null = null;
  private shiftedClips: Array<{ id: string; originalStartTime: number }> = [];

  constructor(
    private readonly gapId: string,
    private readonly newDuration: number,
  ) {
    this.id = generateCommandId();
    this.label = "Resize Gap";
    this.timestamp = Date.now();
  }

  apply(state: TimelineState): TimelineState {
    // Find the gap
    const gap = state.gaps.find((g) => g.id === this.gapId);
    if (!gap) return state;

    this.originalDuration = gap.duration;
    const deltaTime = this.newDuration - gap.duration;
    const gapEnd = gap.startTime + gap.duration;

    // Find clips that need to shift
    const affectedClips = state.clips.filter((c) => c.trackId === gap.trackId && c.startTime >= gapEnd);

    // Store original positions for undo
    this.shiftedClips = affectedClips.map((c) => ({
      id: c.id,
      originalStartTime: c.startTime,
    }));

    // Resize gap and shift clips
    return {
      ...state,
      gaps: state.gaps.map((g) => (g.id === this.gapId ? { ...g, duration: this.newDuration } : g)),
      clips: state.clips.map((c) => {
        if (c.trackId === gap.trackId && c.startTime >= gapEnd) {
          return {
            ...c,
            startTime: c.startTime + deltaTime,
          };
        }
        return c;
      }),
      epoch: state.epoch + 1,
    };
  }

  invert(): Command {
    if (this.originalDuration === null) {
      throw new Error("Cannot invert ResizeGapCommand: no original duration stored");
    }
    return new ResizeGapCommand(this.gapId, this.originalDuration);
  }

  toJSON(): Record<string, any> {
    return {
      type: "ResizeGap",
      gapId: this.gapId,
      newDuration: this.newDuration,
      originalDuration: this.originalDuration,
      shiftedClips: this.shiftedClips,
    };
  }

  static fromJSON(data: Record<string, any>): ResizeGapCommand {
    const cmd = new ResizeGapCommand(data.gapId, data.newDuration);
    cmd.originalDuration = data.originalDuration;
    cmd.shiftedClips = data.shiftedClips || [];
    return cmd;
  }
}

/**
 * Toggle Gap Protection Command
 *
 * Marks a gap as protected (won't be removed during pack track)
 */
export class ToggleGapProtectionCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  readonly undoable: boolean = true;

  constructor(private readonly gapId: string) {
    this.id = generateCommandId();
    this.label = "Toggle Gap Protection";
    this.timestamp = Date.now();
  }

  apply(state: TimelineState): TimelineState {
    return {
      ...state,
      gaps: state.gaps.map((g) =>
        g.id === this.gapId
          ? {
              ...g,
              protected: !g.protected,
              type: !g.protected ? ("protected" as const) : ("manual" as const),
            }
          : g,
      ),
      epoch: state.epoch + 1,
    };
  }

  invert(): Command {
    // Toggle is its own inverse
    return new ToggleGapProtectionCommand(this.gapId);
  }

  toJSON(): Record<string, any> {
    return {
      type: "ToggleGapProtection",
      gapId: this.gapId,
    };
  }

  static fromJSON(data: Record<string, any>): ToggleGapProtectionCommand {
    return new ToggleGapProtectionCommand(data.gapId);
  }
}
