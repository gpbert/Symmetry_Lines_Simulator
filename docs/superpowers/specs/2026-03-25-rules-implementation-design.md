# Rules Implementation Design

**Date:** 2026-03-25
**Scope:** Three UX-facing rule implementations for the Symmetry Line Simulator

## Context

The simulator enforces ZuruTech SDI manufacturing positional rules for wall placement. The core wall rules (overlap, orientation, thickness, parallel distances) are already implemented. This spec covers three remaining rule gaps that affect the wall-drawing UX.

Implementation order follows complexity: simplest first, each feature independent of the others.

---

## Feature 1: 600mm Wall Length Snapping

**Rule reference:** Structural Walls intro — "Walls can only snap their length to a 60cm grid"

### Current behavior

Wall endpoints snap to the 300mm external grid. Wall lengths can be any multiple of 300mm (300, 600, 900, 1200...).

### New behavior

Wall lengths must be multiples of 600mm. Endpoints still snap to the 300mm grid for positioning, but the length along the wall axis is constrained to 600mm increments.

### Implementation details

- **During drawing:** As the user drags, round the endpoint position along the wall axis to the nearest 600mm multiple. The preview wall reflects this snapped length.
- **During stretching:** Same constraint — stretched endpoint snaps to produce a 600mm-multiple length.
- **Minimum wall length:** Effectively becomes 600mm (the smallest valid 600mm multiple above the existing 400mm minimum from Rule 5).
- **Validation:** Add check `wall.length % 600 !== 0` to `validateWall()`. Error message: "Wall length (Xcm) must be a multiple of 60cm".
- **Auto-segmentation:** Threshold stays at 6000mm (already a multiple of 600).
- **Existing walls:** Any walls already placed that violate this are flagged on next validation run.

### UX

No new UI elements. The drawing and stretching feel changes — lengths "click" in 600mm increments. The existing length toast during drawing already shows the current length.

---

## Feature 2: Envelope Angle Validation

**Rule reference:** Structural Walls requirement 4 — "Each Wall making up the envelope of the building has its extremes connected with another Wall, either with a 90-degree angle or a 270-degree angle"

### Current behavior

Building envelopes (closed wall loops) are detected via graph traversal and rendered as blue filled polygons. No validation on connection angles.

### New behavior

When an envelope is detected, validate that every connection between envelope walls is at a right angle (90 or 270 degrees).

### Implementation details

- **Angle check:** At each envelope vertex, compute the angle between the two connected wall direction vectors. Verify it is 90 or 270 degrees (within a small tolerance, e.g., 0.1 degrees).
- **Since walls are axis-locked** (horizontal or vertical only), this is inherently satisfied in the current drawing system. The validation acts as a guard for correctness and would catch issues if the drawing system is ever extended.
- **Validation integration:** Run angle checks as part of envelope detection or on-demand validation. If a non-right-angle connection is found, flag both walls with an error.
- **Error message:** "Envelope connection must be 90 or 270 degrees"
- **Visual feedback:** Invalid envelope corners get a red indicator at the connection point.

### What this does NOT include

- Blade wall detection/warnings (deferred per user decision)
- Corner type classification (90 = Open, 270 = Closed) — manufacturing metadata, not a drawing constraint

### UX

Minimal visual change in the normal case (all corners are right angles due to axis-locked drawing). Acts as a safety net. If invalid angles are ever introduced, the user sees red corner indicators and validation errors.

---

## Feature 3: Void Drawing with Wall Proximity Rules

**Rule reference:** Structural Walls requirement 7 — "Interaction with Voids"

### Current behavior

No concept of voids exists in the simulator.

### New behavior

Users can draw rectangular voids (slab penetrations: stairwells, elevator shafts, service risers) and see how they interact with nearby walls per Rule 7.

### Void data model

```
{
  id: string,
  floorId: number,
  x: number,      // top-left corner, mm
  y: number,      // top-left corner, mm
  width: number,  // mm, multiple of 600
  height: number, // mm, multiple of 600
}
```

Stored in a `voids[]` array, per-floor (similar to `walls[]`).

### Drawing

- **New mode:** "Void" mode added alongside Draw, Select, Delete. Activated via toolbar button.
- **Interaction:** Click-and-drag to define a rectangle. First click sets one corner, drag sets the opposite corner.
- **Grid snapping:** Both corners snap to the 600mm grid (Pod's Grid cell boundaries).
- **Minimum size:** 600x600mm (one Pod's Grid cell).
- **Preview:** Semi-transparent rectangle shown during drag, green if valid, red if violating proximity rules.

### Rendering

- Voids render as a hatched or crosshatched rectangle with a distinct outline color (e.g., dashed red/pink border with diagonal line fill).
- Visible on the floor they belong to.
- Visible as ghost/overlay when viewing adjacent floors (same treatment as walls from other floors).

### Resizing and deletion

- **Resizable:** In Select mode, voids show resize handles on corners and edges. Drag to resize, constrained to 600mm grid. Minimum size enforced.
- **Deletable:** In Delete mode, click a void to remove it.
- **Not movable:** No drag-to-move. Resize handles are the only manipulation.
- **Undo/redo:** All void operations (create, resize, delete) participate in the undo/redo system.

### Wall proximity validation (Rule 7)

Two cases based on wall type:

**Internal wall** (not part of a building envelope):
- Void can be 0mm from the **non-column face** (the external face, direction of normal vector `n`).
- The steel column must be on the **opposite face** from the void.
- If a void is placed adjacent to the column face of an internal wall, show an error.

**External wall** (part of a building envelope):
- Void can be 0mm from the **column face** (the internal face, opposite to normal vector `n`).
- The void interrupts the edge beam at segment ends and substitutes the central part with a prefab beam.
- If a void is placed adjacent to the non-column face of an external wall, show an error.

**Validation feedback:**
- Restricted zones around walls visualized during void drawing (similar to wall-to-wall restricted zones).
- Zone color/style distinguishes "wrong face" restrictions from other restrictions.
- Toast messages: "Void must be on the non-column face of internal walls" / "Void must be on the column face of external walls"

### Interaction with existing features

- **Building envelopes:** Voids do not break envelope detection (they are slab penetrations, not wall modifications).
- **Cross-floor:** Voids are per-floor. No cross-floor void validation specified in the rules.
- **Slab-based restrictions toggle:** Void proximity rules respect the slab-based restriction toggle (only apply within the same slab system).

---

## Implementation order

1. **Feature 1** (600mm snapping) — self-contained, small change
2. **Feature 2** (envelope angle validation) — self-contained, builds on existing detection
3. **Feature 3** (voids) — largest feature, new object type and mode

Each feature is independently testable and deployable.

## Out of scope

- Wall height configurability
- Beam generation/visualization
- Pod's Grid computation and visualization
- Edge beam configurations
- Slab free edge distances
- Virtual beam continuation
- Standalone columns
- Blade wall detection
- 3D view (separate brainstorm)
- Corner type classification (Open/Closed)
