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

- **During drawing:** As the user drags, floor the endpoint position along the wall axis to the nearest 600mm multiple (always round down — the wall grows in 600mm steps, never jumping ahead of the cursor). The preview wall reflects this snapped length.
- **During stretching:** Same constraint — stretched endpoint floors to produce a 600mm-multiple length.
- **Minimum wall length:** Update `MIN_WALL_LENGTH` from 400 to 600. The 400mm check becomes redundant since 600mm is the smallest valid length. Remove or update the old 400mm validation message.
- **Validation:** Add check `wall.length % 600 !== 0` to `validateWall()`. Error message: "Wall length (Xcm) must be a multiple of 60cm".
- **Auto-segmentation:** Threshold stays at 6000mm. When splitting, segments must each be a multiple of 600mm. The splitting algorithm should divide into equal segments that are valid 600mm multiples (e.g., 6600mm → two segments of 3600mm + 3000mm, not two of 3300mm). If equal splitting produces non-600mm lengths, prefer unequal splits where all segments are valid.
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
- **Validation integration:** Run angle checks as part of `validateAllWalls()` (on-demand validation), not during envelope detection. This keeps envelope detection fast and groups all validation in one place.
- **Error message:** "Envelope connection must be 90 or 270 degrees"
- **Visual feedback:** Invalid envelope corners get a red filled circle (radius ~8px screen-space) at the connection point, rendered after envelope polygon fill and before wall rendering so it sits between the two layers.

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

Stored in a global `voids[]` array with `floorId` for filtering (same pattern as the `walls[]` array).

### Drawing

- **New mode:** "Void" mode added alongside Draw, Select, Delete. Activated via toolbar button.
- **Interaction:** Click-and-drag to define a rectangle. First click sets one corner, drag sets the opposite corner.
- **Grid snapping:** Both corners snap to the 600mm grid (Pod's Grid cell boundaries).
- **Minimum size:** 600x600mm (one Pod's Grid cell).
- **Preview:** Semi-transparent rectangle shown during drag, green if valid, red if violating proximity rules.

### Rendering

- Voids render as a hatched or crosshatched rectangle with a distinct outline color (e.g., dashed red/pink border with diagonal line fill).
- Visible on the floor they belong to.
- Visible as ghost/overlay when viewing adjacent floors: outline only (no hatch fill) at the same reduced opacity levels used for adjacent-floor walls.

### Selection, resizing and deletion

- **Selection priority:** When clicking in Select mode, walls take priority over voids (walls are the primary object). If a click lands on both a wall and a void, the wall is selected. Voids and walls cannot be selected simultaneously — selecting a void deselects any selected walls and vice versa. Selected voids use a distinct highlight (e.g., dashed blue outline) to differentiate from selected walls.
- **Resizable:** In Select mode, selected voids show resize handles on corners and edges. Drag to resize, constrained to 600mm grid. Minimum size enforced.
- **Deletable:** In Delete mode, click a void to remove it.
- **Not movable:** No drag-to-move — voids are anchored to the 600mm grid and repositioning is done by resizing or delete-and-redraw.
- **Undo/redo:** The existing undo/redo system stores wall operations with `wallIndices`. Extend the operation format to support void operations: add an `objectType` field ('wall' | 'void') and corresponding index/data fields. Existing wall operations continue to work unchanged. Void create/resize/delete each produce a new undo operation.
- **Void-to-void overlap:** Voids may not overlap. Attempting to draw or resize a void that overlaps an existing void shows an error.

### Wall proximity validation (Rule 7)

Two cases based on wall type:

**Determining adjacency:** A void is "adjacent to" a wall face if the void rectangle's edge is within 0mm (touching or overlapping) of that face's line segment, along the face's extent (not beyond the wall endpoints). The check is: does any edge of the void rectangle coincide with or cross into the wall face zone?

**Internal wall** (not part of a building envelope):
- Void can be 0mm from the **non-column face** (the external face, direction of normal vector `n`).
- The steel column must be on the **opposite face** from the void.
- If a void is adjacent to the column face of an internal wall, show an error.
- **Restricted zone:** The column-face side of internal walls is restricted for voids. Visualize as a shaded strip along the column face extending the wall's length.

**External wall** (part of a building envelope):
- Void can be 0mm from the **column face** (the internal face, opposite to normal vector `n`).
- The void interrupts the edge beam at segment ends and substitutes the central part with a prefab beam.
- If a void is adjacent to the non-column face of an external wall, show an error.
- **Restricted zone:** The non-column-face side of external walls is restricted for voids. Visualize as a shaded strip along the external face extending the wall's length.

**Restricted zone rendering during void drawing:**
- Show restricted face zones on all walls when in Void mode (similar to how wall-to-wall restricted zones appear in Draw mode).
- Use a distinct color from wall-to-wall zones (e.g., purple/magenta hatch) so the user can distinguish "can't place a void here" from "can't place a wall here".
- Zones extend from the restricted face to the nearest 600mm grid line (giving the zone a concrete visual boundary rather than extending to infinity).

**Validation feedback:**
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
