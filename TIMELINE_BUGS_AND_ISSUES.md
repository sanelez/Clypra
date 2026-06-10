# Timeline Bugs and Issues - Comprehensive Report

**Date:** Generated from investigation session  
**Status:** Open issues requiring fixes  
**Priority:** HIGH - Core editing functionality affected

---

## 🎯 Key Insight: How Professional NLEs Handle Gaps

Before diving into bugs, understand the fundamental mental model used by DaVinci Resolve, Premiere Pro, and Final Cut Pro:

### The Golden Rule

**Gaps are first-class citizens of the timeline, not accidents to be cleaned up.**

### Three Editing Modes

**1. Insert Mode (Current Clypra Behavior)**

- Clips shift to make room for inserted clip
- **Existing gaps are preserved exactly**
- Only the departure gap (where dragged clip came from) closes
- Example:
  ```
  Before:  [A]___[B]   [C]    ← user gap between A-B, bigger gap before C
  After:   [A][C]___[B]       ← C inserted, gaps preserved
  ```

**2. Ripple Mode (Power User)**

- Explicitly means "no gaps allowed, pack everything tight"
- Only used when user intentionally invokes ripple
- Example: Ripple Delete removes clip AND closes gap
- **This is where `normalizeTrack()` belongs**

**3. Free Mode (Overwrite)**

- Clip drops exactly where released
- Nothing moves, gaps stay, clips stay
- Total user control, maximum intentionality

### The Root Problem in Clypra

**Current:** `normalizeTrack()` called in Insert Mode (wrong!)  
**Correct:** `normalizeTrack()` only in Ripple Mode  
**Fix:** Remove one line, gaps preserved automatically

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [Medium Priority Issues](#medium-priority-issues)
3. [Low Priority Issues](#low-priority-issues)
4. [Architectural Concerns](#architectural-concerns)
5. [Missing Features](#missing-features)
6. [Suggested Solutions](#suggested-solutions)

---

## Critical Issues

### 🔴 BUG #1: Gap Preservation Destroyed

**Severity:** HIGH  
**Component:** Timeline Store  
**File:** `src/store/timelineStore.ts`

#### Problem Description

User-created gaps between clips are automatically destroyed after drag-and-drop operations. The `normalizeTrack()` function removes ALL gaps, making it impossible for users to manually space clips apart.

#### Current Behavior

```typescript
// After every insert operation, normalizeTrack() is called
normalizeTrack: (trackId) => {
  let currentTime = 0;
  const normalized = trackClips.map((clip) => {
    const updated = { ...clip, startTime: currentTime };
    currentTime += clip.duration; // TIGHT PACKING - removes all gaps
    return updated;
  });
};
```

#### Steps to Reproduce

1. Place two clips on a track with a 2-second gap between them
2. Drag another clip onto the same track
3. Drop the clip (insert mode activates)
4. **RESULT:** The manually created 2-second gap is destroyed

#### Impact

- Users cannot create intentional spacing between clips
- Contradicts design requirement stating "users should be able to have gaps between clips"
- Makes it impossible to create breathing room in edits
- Forces tight packing regardless of user intent

#### Root Cause

`insertClipAtIndex()` always calls `normalizeTrack()` which removes ALL gaps:

```typescript
case "insert": {
  withBatch(() => {
    orderedDragged.forEach((id, i) => {
      insertClipAtIndex(id, targetTrackId, insertionIndex + i);
    });
  });

  normalizeTrack(targetTrackId); // DESTROYS ALL GAPS
  break;
}
```

#### Suggested Solution

**The Simple Truth (Based on Professional NLEs):**

`normalizeTrack()` should ONLY be called in **Ripple Mode**, never in **Insert Mode**.

**How Professional NLEs Handle This:**

DaVinci Resolve, Premiere Pro, and Final Cut Pro all treat gaps as first-class citizens:

1. **Insert Mode** - Clips shift to make room, gaps are preserved exactly
2. **Ripple Mode** - Pack everything tight, no gaps allowed (power-user mode)
3. **Free Mode** - Drop anywhere, nothing moves

**Example from Premiere Pro:**

```
Before:  [A]___[B]   [C]    ← user gap between A-B, bigger gap before C
Drag C between A and B:
After:   [A][C]___[B]       ← C inserted, A-B gap preserved, departure gap closed
```

The departure gap closes automatically (clip physically left that position). All other gaps stay untouched.

**The Fix (One Line):**

```typescript
// useTimelineDrag.ts — drop handler
case "insert": {
  withBatch(() => {
    orderedDragged.forEach((id, i) => {
      insertClipAtIndex(id, targetTrackId, insertionIndex + i);
    });
  });
  // ← REMOVE normalizeTrack(targetTrackId) from here
  // Departure gap already closed by prefix-sum algorithm
  break;
}
```

**Why This Works:**

- The prefix-sum algorithm in `clipPositions.ts` already closes the departure gap
- It filters dragged clips from `rest` list, naturally closing the hole
- `normalizeTrack()` is redundant for departure gap AND destructive for user gaps

**Future: Add Ripple Mode**

```typescript
case "ripple": {
  withBatch(() => {
    orderedDragged.forEach((id, i) => {
      insertClipAtIndex(id, targetTrackId, insertionIndex + i);
    });
  });
  normalizeTrack(targetTrackId); // ← ONLY normalize in explicit ripple mode
  break;
}
```

**Also Add: "Pack Track" Button**

- Keep `normalizeTrack()` available as explicit user action
- Add button in track header: "Pack Track" or "Remove Gaps"
- User invokes intentionally, gaps removed intentionally
- Pattern used by DaVinci ("Fill with black" / "Remove gaps")

#### Recommended Implementation

**Priority:** URGENT  
**Effort:** Minimal (remove one line + add future ripple mode)  
**Approach:** Remove `normalizeTrack()` from insert case

1. Remove `normalizeTrack()` call from insert case in `useTimelineDrag.ts`
2. Test: Verify departure gap closes, user gaps preserved
3. Add "Pack Track" command for intentional gap removal
4. Future: Add ripple mode toggle for power users

---

### 🔴 BUG #2: No Manual Gap Creation

**Severity:** HIGH  
**Component:** Timeline Operations  
**Files:** Multiple (Timeline.tsx, TimelineStore, Commands)

#### Problem Description

There is NO WAY for users to manually create gaps/blank space between clips. This is a fundamental NLE feature that's completely missing.

#### Missing Functionality

- No "Insert Gap" command
- No "Remove Gap" command
- No way to shift clips right without dragging
- No gap manipulation tools
- No gap selection or editing

#### Industry Standard Comparison

**Adobe Premiere Pro:**

- Right-click on gap → "Ripple Delete" to close
- Edit menu → "Insert" to add blank space
- Comma (,) key to remove gap at playhead

**DaVinci Resolve:**

- "Insert" key to add blank gap
- "Ripple Delete" to close gaps
- Visual gap indicators with context menu

**Final Cut Pro:**

- Gap clip objects (visible and selectable)
- Insert gap via menu or drag
- Delete to remove gap

**Clypra:**

- ❌ None of these features exist

#### Suggested Solution

**Phase 1: Basic Commands**

```typescript
// New commands to add
export class InsertGapCommand implements Command {
  constructor(
    private trackId: string,
    private startTime: number,
    private duration: number,
    private rippleMode: boolean, // Shift clips or overwrite?
  ) {}

  apply(state: TimelineState): TimelineState {
    if (this.rippleMode) {
      // Shift all clips at/after startTime by duration
      return {
        ...state,
        clips: state.clips.map((c) => (c.trackId === this.trackId && c.startTime >= this.startTime ? { ...c, startTime: c.startTime + this.duration } : c)),
      };
    }
    // Non-ripple: just validation, clips stay put
    return state;
  }
}
```

```typescript
export class RemoveGapCommand implements Command {
  constructor(
    private trackId: string,
    private gapStart: number,
    private gapEnd: number,
  ) {}

  apply(state: TimelineState): TimelineState {
    const gapDuration = this.gapEnd - this.gapStart;

    return {
      ...state,
      clips: state.clips.map((c) => (c.trackId === this.trackId && c.startTime >= this.gapEnd ? { ...c, startTime: c.startTime - gapDuration } : c)),
    };
  }
}
```

**Phase 2: UI Integration**

- Add "Insert Gap" to Edit menu and context menu
- Add "Remove Gap" when right-clicking on empty space
- Keyboard shortcut: `I` for Insert Gap, `,` (comma) for Remove Gap
- Duration picker dialog for gap insertion

**Phase 3: Visual Gap Objects**

- Render gaps as striped/patterned regions
- Make gaps selectable (click to select)
- Show gap duration on hover
- Gap resize handles (drag to adjust space)

#### Recommended Implementation

**Priority:** URGENT  
**Effort:** Large (3-5 days)  
**Approach:** Phase 1 first, then Phase 2

---

## Medium Priority Issues

### 🟡 BUG #3: Inconsistent Ripple Edit Systems

**Severity:** MEDIUM  
**Component:** Timeline Editing  
**Files:** `timelineStore.ts`, `Clip.tsx`, `Timeline.tsx`, `TimelineToolbar.tsx`

#### Problem Description

Three separate ripple editing systems exist with different controls and behaviors, causing user confusion.

#### The Three Systems

**System 1: Drag Ripple (Always On)**

- Location: `useTimelineDrag.ts`, `dropTarget.ts`
- Control: NONE (always active for same-track drags)
- Behavior: Creates space when inserting clips
- Visual feedback: Blue gap indicator
- User control: ❌ Cannot disable

**System 2: Trim Ripple (Shift OR Toggle)**

- Location: `Clip.tsx` resize handlers
- Control: Shift key OR `rippleEditEnabled` toggle
- Behavior: Shifts downstream clips when trimming
- Visual feedback: Yellow ring (ripple) / Cyan ring (normal)
- User control: ✅ Yes (dual control)

**System 3: Delete Ripple (Settings Toggle)**

- Location: `Timeline.tsx`, `TimelineToolbar.tsx`
- Control: `autoRipple` setting in Settings Modal
- Behavior: Closes gap when deleting clips
- Visual feedback: None
- User control: ✅ Yes (settings)

#### Inconsistencies

1. **Naming conflict:**
   - `rippleEditEnabled` (timelineStore) - only affects trim
   - `autoRipple` (settingsStore) - only affects delete
   - Drag has no control variable

2. **Control confusion:**
   - Trim: Shift key OR toggle (two ways)
   - Delete: Settings only (one way)
   - Drag: Always on (zero ways)

3. **User expectations:**
   - User toggles "Ripple Edit Mode" button in toolbar
   - Expects ALL operations to ripple
   - Actually only affects trim operations
   - Drag operations still ripple regardless

#### Suggested Solution

**Option A: Unified Master Toggle (Recommended)**

```typescript
// New unified store structure
interface RippleSettings {
  enabled: boolean; // Master toggle
  dragRipple: boolean; // Override for drag
  trimRipple: boolean; // Override for trim
  deleteRipple: boolean; // Override for delete
}

// Default behavior
const defaultRippleSettings: RippleSettings = {
  enabled: true, // Master toggle ON
  dragRipple: true, // Drag follows master
  trimRipple: true, // Trim follows master
  deleteRipple: true, // Delete follows master
};
```

**Option B: Simple Single Toggle**

```typescript
// Remove all separate toggles, use one master switch
const rippleEnabled = useTimelineStore((state) => state.rippleEnabled);

// In all operations:
if (rippleEnabled) {
  // Ripple behavior
} else {
  // Standard behavior
}

// Shift key as temporary override (industry standard)
const effectiveRipple = rippleEnabled !== e.shiftKey; // XOR logic
```

**Option C: Mode-Based System**

```typescript
type EditMode = "standard" | "ripple" | "roll" | "slide";

// Like Premiere Pro's mode selection
// User selects mode via toolbar
// All operations follow selected mode
```

#### Recommended Implementation

**Priority:** MEDIUM  
**Effort:** Medium (2-3 days)  
**Approach:** Option B (Simple Single Toggle)

1. Create single `rippleEnabled` toggle in timelineStore
2. Remove `autoRipple` from settingsStore
3. Update all three systems to check `rippleEnabled`
4. Keep Shift key as temporary override
5. Update UI: Single clear toggle button
6. Visual feedback: Show ripple indicator for all operations

---

### 🟡 BUG #4: Missing Keyboard Shortcuts for Timeline Operations

**Severity:** MEDIUM  
**Component:** Timeline UI  
**Files:** `Timeline.tsx`, `TimelineToolbar.tsx`

#### Problem Description

Critical timeline operations lack keyboard shortcuts, forcing users to use mouse for everything.

#### Currently Implemented

- ✅ Delete/Backspace: Remove selected clips
- ✅ Escape: Cancel drag operation
- ✅ Ctrl+Wheel: Zoom timeline

#### Missing (Industry Standard)

**Premiere Pro:**

- `,` (comma): Ripple delete gap
- `I`: Mark In point
- `O`: Mark Out point
- `X`: Mark clip
- `;` (semicolon): Add edit
- `Ctrl+K`: Split clip at playhead
- `Ctrl+Shift+K`: Split all clips at playhead

**DaVinci Resolve:**

- `Backspace`: Ripple delete
- `Delete`: Lift (leave gap)
- `Ctrl+B`: Split clip
- `A`: Select all clips forward
- `Ctrl+\\`: Split at playhead

**Final Cut Pro:**

- `Cmd+B`: Split at playhead
- `Shift+Delete`: Ripple delete
- `Delete`: Lift
- `W`: Insert gap

#### Suggested Solution

**Priority Shortcuts (Phase 1):**

```typescript
// Add to Timeline.tsx useEffect
const SHORTCUTS = {
  // Gap operations
  i: insertGapAtPlayhead, // Insert gap
  ",": removeGapAtPlayhead, // Remove gap (comma)

  // Clip operations
  "Ctrl+K": splitClipAtPlayhead, // Split selected clip
  "Ctrl+Shift+K": splitAllAtPlayhead, // Split all clips

  // Selection
  "Ctrl+A": selectAllClips, // Select all
  "Ctrl+D": deselectAll, // Deselect all

  // Ripple toggle
  r: toggleRippleMode, // Toggle ripple mode
};
```

**Advanced Shortcuts (Phase 2):**

```typescript
const ADVANCED_SHORTCUTS = {
  // Track operations
  "Ctrl+Alt+T": addTrack, // Add new track
  "Alt+Up": selectClipAbove, // Select clip on track above
  "Alt+Down": selectClipBelow, // Select clip on track below

  // Alignment
  "Ctrl+]": nudgeClipRight, // Nudge 1 frame right
  "Ctrl+[": nudgeClipLeft, // Nudge 1 frame left
  "Ctrl+Shift+]": nudgeClipRight10, // Nudge 10 frames right
  "Ctrl+Shift+[": nudgeClipLeft10, // Nudge 10 frames left
};
```

#### Recommended Implementation

**Priority:** MEDIUM  
**Effort:** Small-Medium (2-3 days)  
**Approach:** Phase 1 shortcuts first

1. Create keyboard shortcut handler in Timeline.tsx
2. Add shortcut configuration to settings
3. Show shortcuts in tooltips
4. Add shortcut overlay (? key to show all shortcuts)
5. Make shortcuts customizable in settings

---

## Low Priority Issues

### 🟢 BUG #5: `rippleEditEnabled` Toggle Only Affects Trim

**Severity:** LOW  
**Component:** Timeline Store  
**File:** `src/store/timelineStore.ts`

#### Problem Description

The `rippleEditEnabled` toggle exists in the store and has a UI button in the toolbar, but it ONLY affects trim operations, not drag operations.

#### Current Implementation

```typescript
// Store definition
interface TimelineStore {
  rippleEditEnabled: boolean;
  toggleRippleEdit: () => void;
  // ...
}

// Only used in Clip.tsx for trim operations
const isRipple = e.shiftKey || rippleEditEnabled;

// NOT used in drag operations (drag always ripples)
```

#### User Confusion

1. User sees "Ripple edit mode (R)" button in toolbar
2. User clicks to enable ripple mode
3. User drags clip → ripple happens (expected)
4. User disables ripple mode
5. User drags clip → ripple STILL happens (unexpected!)
6. User is confused: "Why isn't the toggle working?"

#### Suggested Solution

**Option A: Make Toggle Control All Operations**

```typescript
// In dropTarget.ts
export function classifyDropTarget(input: ClassifyDropTargetInput): DropTarget {
  const { rippleEnabled } = useTimelineStore.getState();
  const isSameTrack = sourceTrackId === targetTrackId;

  // Use ripple toggle to control behavior
  const shouldRipple = rippleEnabled && isSameTrack;

  switch (region.type) {
    case "before-first":
      return shouldRipple ? { type: "insert", target: { position: "start" } } : { type: "gap", startTime: Math.max(0, effectiveTime) };
    // ...
  }
}
```

**Option B: Remove Toggle, Use Mode System**

- Remove `rippleEditEnabled` entirely
- Use same-track = ripple, cross-track = gap (current behavior)
- Make this behavior explicit in UI
- Document in user guide

#### Recommended Implementation

**Priority:** LOW  
**Effort:** Small (1 day)  
**Approach:** Option A (Make toggle control all)

This is actually covered by BUG #3 (Inconsistent Ripple Systems), so should be fixed together.

---

### 🟢 BUG #6: Confusing Gap Mode Naming

**Severity:** LOW  
**Component:** Architecture  
**File:** `src/lib/dropTarget.ts`

#### Problem Description

"Gap mode" has overlap prevention, which is confusing. The name suggests it's for creating gaps, but it actually prevents clips from overlapping.

#### Current Implementation

```typescript
// In useTimelineDrag.ts
case "gap":
case "append": {
  // "Gap mode" but has extensive overlap prevention
  const targetTrackClips = liveClips.filter(/* ... */);

  // Cascading while loop to prevent overlaps
  while (hasOverlap) {
    hasOverlap = false;
    for (const existingClip of targetTrackClips) {
      if (/* overlap detected */) {
        finalStartTime = existingEnd; // Shift to avoid overlap
        hasOverlap = true;
      }
    }
  }
}
```

#### Confusion

- **Name says:** "Gap" (implies spacing/separation)
- **Code does:** Overlap prevention (collision detection)
- **Better names:** "FreePosition", "NoRipple", "DirectPosition"

#### Suggested Solution

**Option A: Rename to Better Term**

```typescript
// Rename throughout codebase
export type DropTarget =
  | { type: "insert"; target: InsertPosition }
  | { type: "position"; startTime: number } // Was "gap"
  | { type: "append"; startTime: number };

// Or even more explicit
export type DropTarget = { type: "insert-ripple"; target: InsertPosition } | { type: "direct-position"; startTime: number } | { type: "append-end"; startTime: number };
```

**Option B: Split Into Two Types**

```typescript
// Separate gap creation from free positioning
export type DropTarget = { type: "insert"; target: InsertPosition } | { type: "free-position"; startTime: number; preventOverlap: boolean } | { type: "append"; startTime: number };
```

#### Recommended Implementation

**Priority:** LOW  
**Effort:** Small (refactor only)  
**Approach:** Option A (rename to "position")

This is mainly a code clarity issue, not a user-facing bug.

---

## Architectural Concerns

### 🔧 CONCERN #1: Conflicting Positioning Models

**Component:** Timeline Architecture  
**Files:** `timelineStore.ts`, `useTimelineDrag.ts`

#### Problem Description

Two competing systems exist for clip positioning, causing confusion and inconsistencies.

#### System A: Sequence-Based (Index)

```typescript
// Works with array indices
insertClipAtIndex: (clipId, trackId, index) => {
  trackClips.splice(index, 0, clip);

  // Then recalculates ALL positions
  let currentTime = 0;
  const updatedClips = trackClips.map((c) => {
    const updated = { ...c, startTime: currentTime, trackId };
    currentTime += c.duration; // Tight packing
    return updated;
  });
};
```

#### System B: Time-Based (Direct)

```typescript
// Direct time positioning
updateClip: (clipId, { startTime: newTime }) => {
  // Sets exact startTime, allows gaps
};

// Used by gap mode drag-and-drop
updateClip(clipId, {
  startTime: calculatedTime,
  trackId: targetTrackId,
});
```

#### Issues

1. **Semantic confusion:** Index vs time positioning
2. **Behavior difference:** One tight-packs, one allows gaps
3. **Merge conflicts:** Hard to reason about when both are used
4. **Testing complexity:** Two code paths for same operation

#### Suggested Solution

**Option A: Unified Model (Recommended)**

```typescript
// Single positioning method with options
interface ClipPositionOptions {
  method: "index" | "time";
  normalize?: boolean; // Pack clips tight?
  preventOverlap?: boolean; // Check collisions?
}

positionClip: (clipId, trackId, position: number, options: ClipPositionOptions) => {
  if (options.method === "index") {
    // Index-based positioning
    insertAtIndex(clipId, trackId, position);
    if (options.normalize) normalizeTrack(trackId);
  } else {
    // Time-based positioning
    updateClip(clipId, { startTime: position, trackId });
    if (options.preventOverlap) adjustForOverlaps(trackId);
  }
};
```

**Option B: Separate Clear APIs**

```typescript
// Index-based: Always normalizes
insertClipAtSequencePosition(clipId, trackId, index);

// Time-based: Never normalizes
setClipTimePosition(clipId, trackId, startTime, preventOverlap);
```

#### Recommended Implementation

**Priority:** MEDIUM  
**Effort:** Medium (refactor)  
**Approach:** Option B (separate clear APIs)

---

### 🔧 CONCERN #2: No Gap Data Model

**Component:** Timeline Data Model  
**Files:** Timeline store, types

#### Problem Description

Gaps are **implicit** (calculated from clip positions), not **explicit** entities. This makes them impossible to persist, select, or manipulate as first-class objects.

#### Current Model

```typescript
// Gaps don't exist as entities
interface TimelineState {
  tracks: Track[];
  clips: Clip[];
  // No gaps!
}

// Gaps are calculated on the fly
function findGaps(trackClips: Clip[]): Array<{ start: number; end: number }> {
  const gaps = [];
  for (let i = 0; i < trackClips.length - 1; i++) {
    const gapStart = trackClips[i].startTime + trackClips[i].duration;
    const gapEnd = trackClips[i + 1].startTime;
    if (gapEnd > gapStart) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }
  return gaps;
}
```

#### Limitations

1. Can't save gap preferences (which gaps are intentional)
2. Can't select gaps (no entity to select)
3. Can't manipulate gaps directly (must move clips)
4. Can't protect gaps from normalization
5. Can't distinguish user gaps from system gaps

#### Suggested Solution

**Option A: Full Gap Model (Advanced)**

```typescript
// Gaps as first-class entities
interface Gap {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  type: "manual" | "auto" | "protected";
  metadata?: {
    createdBy: "user" | "system";
    createdAt: number;
    reason?: string; // "breathing room", "transition space", etc.
  };
}

interface TimelineState {
  tracks: Track[];
  clips: Clip[];
  gaps: Gap[];  // NEW!
}

// Operations on gaps
addGap(trackId: string, startTime: number, duration: number): Gap;
removeGap(gapId: string): void;
resizeGap(gapId: string, newDuration: number): void;
protectGap(gapId: string): void; // Prevent auto-removal
```

**Option B: Gap Metadata (Simpler)**

```typescript
// Store gap info as clip metadata
interface Clip {
  // ... existing fields
  gapAfter?: {
    duration: number;
    protected: boolean;
    type: "manual" | "auto";
  };
}

// No separate gap entities, just clip annotations
```

**Option C: Hybrid (Recommended)**

```typescript
// Track gaps implicitly, protect explicitly
interface Clip {
  // ... existing fields
  protectedGapAfter?: boolean; // Flag to preserve gap after this clip
}

// Helper to find gaps
function getGaps(trackClips: Clip[]): Array<{
  start: number;
  end: number;
  duration: number;
  protected: boolean; // If preceding clip has protectedGapAfter
}> {
  // Calculate gaps on-demand, but respect protection
}

// Normalization respects protection
normalizeTrack: (trackId) => {
  trackClips.forEach((clip, i) => {
    if (!clip.protectedGapAfter) {
      // Pack this clip tight against next
    } else {
      // Preserve gap after this clip
    }
  });
};
```

#### Recommended Implementation

**Priority:** LOW-MEDIUM  
**Effort:** Medium-Large  
**Approach:** Option C (Hybrid) or Option B (Metadata)

Start with Option B, migrate to Option C if needed.

---

## Missing Features

### 📋 FEATURE #1: Track-Level Gap Operations

**Status:** Not implemented  
**Priority:** MEDIUM

#### Missing Operations

- **Pack Track:** Remove all gaps from a track
- **Distribute Evenly:** Space clips equally across track
- **Align to Grid:** Snap all clips to grid markers
- **Align Clips:** Align selected clips (left/right/center)

#### Suggested Implementation

```typescript
// New track operations
export class PackTrackCommand implements Command {
  apply(state: TimelineState): TimelineState {
    const trackClips = getTrackClips(state, this.trackId);
    let currentTime = 0;

    return {
      ...state,
      clips: state.clips.map((c) => {
        if (c.trackId !== this.trackId) return c;

        const updated = { ...c, startTime: currentTime };
        currentTime += c.duration;
        return updated;
      }),
    };
  }
}

export class DistributeEvenlyCommand implements Command {
  apply(state: TimelineState): TimelineState {
    const trackClips = getTrackClips(state, this.trackId);
    const totalDuration = trackClips.reduce((sum, c) => sum + c.duration, 0);
    const trackLength = this.endTime - this.startTime;
    const totalGap = trackLength - totalDuration;
    const gapBetween = totalGap / (trackClips.length - 1);

    // Space clips evenly...
  }
}
```

---

### 📋 FEATURE #2: Gap Visualization

**Status:** Not implemented  
**Priority:** LOW-MEDIUM

#### Missing Visuals

- No gap highlighting (empty spaces not distinct)
- No gap duration labels
- No gap selection feedback
- No gap context menu

#### Industry Standard

**Premiere Pro:**

- Gaps shown with diagonal stripe pattern
- Right-click gap → context menu
- Gap duration shown on hover

**DaVinci Resolve:**

- Gaps have distinct color
- Can select gaps
- Gap info in inspector panel

#### Suggested Implementation

```typescript
// In Track.tsx, add gap rendering
const gaps = useMemo(() => {
  const result = [];
  for (let i = 0; i < sortedTrackClips.length - 1; i++) {
    const clip = sortedTrackClips[i];
    const nextClip = sortedTrackClips[i + 1];
    const gapStart = clip.startTime + clip.duration;
    const gapEnd = nextClip.startTime;

    if (gapEnd > gapStart) {
      result.push({
        id: `gap-${clip.id}-${nextClip.id}`,
        startTime: gapStart,
        duration: gapEnd - gapStart,
        leftClipId: clip.id,
        rightClipId: nextClip.id
      });
    }
  }
  return result;
}, [sortedTrackClips]);

// Render gaps
{gaps.map(gap => (
  <div
    key={gap.id}
    className="absolute top-0 h-full bg-slate-800/30
               border border-dashed border-slate-600
               hover:bg-slate-700/40 cursor-pointer"
    style={{
      left: gap.startTime * pixelsPerSecond,
      width: gap.duration * pixelsPerSecond
    }}
    onClick={() => selectGap(gap)}
  >
    {/* Gap duration label */}
  </div>
))}
```

---

## Suggested Solutions - Priority Order

### 🔥 IMMEDIATE (Week 1)

**1. Fix Gap Preservation (BUG #1) - THE SIMPLE FIX**

- **Remove ONE line:** Delete `normalizeTrack(targetTrackId)` from insert case
- The prefix-sum algorithm already closes departure gap correctly
- All user gaps automatically preserved (no complex logic needed!)
- **Effort:** 10 minutes (one line removal + testing)
- **Impact:** CRITICAL - Fixes fundamentally broken behavior

**2. Add "Pack Track" Command**

- Keep `normalizeTrack()` as explicit user action
- Add button/menu item: "Pack Track" or "Remove All Gaps"
- User invokes intentionally when they want tight packing
- **Effort:** 1-2 hours
- **Impact:** HIGH - Provides intentional normalization option

**3. Add Basic Gap Commands (BUG #2 - Phase 1)**

- Implement `InsertGapCommand`
- Implement `RemoveGapCommand`
- Add to Edit menu
- Basic keyboard shortcuts (I, comma)
- **Effort:** 2-3 days
- **Impact:** HIGH - Core missing feature

### 📅 SHORT TERM (Week 2-3)

**3. Unify Ripple System (BUG #3)**

- Create single ripple toggle
- Make it control all operations (drag, trim, delete)
- Update UI for clarity
- **Effort:** 2-3 days
- **Impact:** MEDIUM - Improves consistency

**4. Add Keyboard Shortcuts (BUG #4)**

- Implement priority shortcuts
- Add shortcut handler
- Document shortcuts
- **Effort:** 2-3 days
- **Impact:** MEDIUM - Improves workflow

### 🎯 MEDIUM TERM (Week 4-6)

**5. Gap Visualization (FEATURE #2)**

- Render gaps as distinct elements
- Add gap selection
- Show duration labels
- Context menu for gaps
- **Effort:** 3-4 days
- **Impact:** MEDIUM - Better UX

**6. Track Operations (FEATURE #1)**

- Pack Track command
- Distribute Evenly command
- Align operations
- **Effort:** 2-3 days
- **Impact:** MEDIUM - Professional tools

**7. Refactor Architecture (CONCERN #1)**

- Unify positioning models
- Clear API separation
- Better documentation
- **Effort:** 3-5 days
- **Impact:** LOW-MEDIUM - Code quality

### 🔮 LONG TERM (Future)

**8. Gap Data Model (CONCERN #2)**

- Implement gap entities or metadata
- Gap protection system
- Gap persistence
- **Effort:** 5-7 days
- **Impact:** LOW-MEDIUM - Advanced feature

**9. Advanced Gap Commands (BUG #2 - Phase 2)**

- Gap resizing
- Gap selection
- Batch gap operations
- **Effort:** 3-4 days
- **Impact:** LOW - Nice to have

---

## Testing Strategy

### Critical Tests Needed

**1. Gap Preservation Tests**

```typescript
describe("Gap Preservation", () => {
  it("should preserve manual gaps after insert operation", () => {
    // 1. Create track with clips at 0s, 5s, 10s (gaps exist)
    // 2. Drag new clip onto track
    // 3. Verify: Original gaps still exist
  });

  it("should close departure gap when moving clip", () => {
    // 1. Create track with clips at 0s, 5s, 10s
    // 2. Move clip from 5s to different track
    // 3. Verify: Gap at 5s is closed
  });
});
```

**2. Ripple Consistency Tests**

```typescript
describe("Ripple Behavior", () => {
  it("should ripple drag when toggle is ON", () => {
    // Test drag with ripple enabled
  });

  it("should not ripple drag when toggle is OFF", () => {
    // Test drag with ripple disabled
  });

  it("should ripple trim when Shift is pressed", () => {
    // Test trim with Shift key
  });

  it("should ripple delete when autoRipple is ON", () => {
    // Test delete with setting enabled
  });
});
```

**3. Gap Operation Tests**

```typescript
describe("Gap Commands", () => {
  it("should insert gap and shift clips right", () => {
    // 1. Place clips at 0s, 5s
    // 2. Insert 2s gap at 3s
    // 3. Verify: Clip at 5s moved to 7s
  });

  it("should remove gap and shift clips left", () => {
    // 1. Place clips at 0s, 5s (gap exists)
    // 2. Remove gap at 3s-5s
    // 3. Verify: Clip at 5s moved to 3s
  });

  it("should not overlap clips when inserting gap", () => {
    // Test overlap prevention
  });
});
```

**4. Keyboard Shortcut Tests**

```typescript
describe("Keyboard Shortcuts", () => {
  it("should insert gap when 'I' is pressed", () => {
    // Test Insert Gap shortcut
  });

  it("should remove gap when ',' is pressed", () => {
    // Test Remove Gap shortcut
  });

  it("should split clip when 'Ctrl+K' is pressed", () => {
    // Test Split Clip shortcut
  });
});
```

---

## Summary

### Issue Count by Severity

| Severity            | Count | Issues                                  |
| ------------------- | ----- | --------------------------------------- |
| 🔴 HIGH             | 2     | Gap preservation, Manual gap creation   |
| 🟡 MEDIUM           | 2     | Ripple inconsistency, Missing shortcuts |
| 🟢 LOW              | 2     | Toggle confusion, Naming issues         |
| 🔧 ARCHITECTURAL    | 2     | Positioning models, Gap data model      |
| 📋 MISSING FEATURES | 2     | Track operations, Gap visualization     |

### Total Estimated Effort

- **Immediate fixes:** 3-5 days
- **Short term:** 4-6 days
- **Medium term:** 8-12 days
- **Long term:** 8-11 days

**Total:** ~23-34 days of development work

### Recommended Approach

**Phase 1: Critical Fixes (Week 1)**

- Fix gap preservation
- Add basic gap commands
- **Goal:** Make timeline usable for gap-based editing

**Phase 2: Consistency (Week 2-3)**

- Unify ripple system
- Add keyboard shortcuts
- **Goal:** Improve workflow and reduce confusion

**Phase 3: Enhancement (Week 4-6)**

- Gap visualization
- Track operations
- Architecture refactoring
- **Goal:** Professional-grade features

**Phase 4: Polish (Future)**

- Advanced gap model
- Extended commands
- **Goal:** Best-in-class timeline editing

---

## Notes

### Recently Fixed Issues ✅

These issues were identified and fixed during the investigation:

1. **Single clip repositioning** - Fixed by detecting empty track after drag
2. **Audio track positioning** - Fixed with smart track insertion
3. **Stale closure in overlap detection** - Fixed by using fresh state

### Code Files to Modify

**High Priority:**

- `src/store/timelineStore.ts` - Gap preservation, commands
- `src/hooks/useTimelineDrag.ts` - Ripple control
- `src/lib/dropTarget.ts` - Behavior classification
- `src/core/history/commands/` - New gap commands

**Medium Priority:**

- `src/components/editor/timeline/Timeline.tsx` - Keyboard shortcuts
- `src/components/editor/timeline/Track.tsx` - Gap visualization
- `src/components/editor/timeline/TimelineToolbar.tsx` - UI controls

**Low Priority:**

- `src/lib/placementPreview.ts` - Preview logic
- `src/components/editor/timeline/Clip.tsx` - Trim behavior

### Dependencies

Some fixes depend on others:

- Gap commands need gap preservation fix first
- Ripple unification affects all operations
- Gap visualization needs basic commands first

### User Impact

**Current State:**

- ❌ Users frustrated by gaps disappearing
- ❌ No way to manually add spacing
- ❌ Ripple behavior confusing
- ❌ Slow workflow (mouse-only)

**After Phase 1:**

- ✅ Gaps preserved as expected
- ✅ Can manually create gaps
- ✅ Basic timeline editing works

**After Phase 2:**

- ✅ Clear ripple behavior
- ✅ Fast keyboard workflow
- ✅ Professional editing experience

**After Phase 3:**

- ✅ Visual gap feedback
- ✅ Advanced track operations
- ✅ Industry-standard features

---

**END OF DOCUMENT**
