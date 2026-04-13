# Partial Gridline Hiding Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Branch:** feature/grid-visualization

## Problem

The current gridline hiding implementation hides entire gridlines (edge-to-edge) when any wall's restriction zone covers that grid coordinate. This is overly aggressive — a wall at x=0→3000 with a 600mm restriction zone hides the entire y=300 gridline across the full canvas, even though the restriction only applies near that wall. Users can still snap to hidden gridline positions far from the restricting wall, creating a confusing mismatch between visual feedback and actual behavior.

## Goal

Hide only the **segments** of gridlines that fall within a wall's restriction projection. The rest of the gridline remains visible and snappable. This makes the visual feedback accurate: hidden = restricted here, visible = available here.

## Non-Goals

- No changes to snapping logic (`snapToGrid`, `snapLengthToGrid`, `nudgeStartPointOutOfZones`)
- No changes to validation logic (`isEndpointRestricted`, `validateWall`, `validateAllWalls`)
- No changes to wall placement rules (Rule 3a: 600mm parallel, 1200mm opposite-facing)
- Restriction line toggle ("Show restriction lines") behavior is preserved

## Design

### Data Model

Replace the current `getRestrictedGridCoords()` return type:

**Before:**
```
{ restrictedX: Set<number>, restrictedY: Set<number> }
```

**After:**
```
{
  restrictedX: Map<number, Array<{min: number, max: number}>>,
  restrictedY: Map<number, Array<{min: number, max: number}>>
}
```

Each key is a grid coordinate (mm). Each value is a list of restricted segments along that gridline, where `min`/`max` are the start/end positions (mm) along the perpendicular axis.

**Example:** A horizontal wall at y=1800, spanning x=0→3000, with a 600mm zone:
- `restrictedY.get(1500)` → `[{min: 0, max: 3000}]` — y=1500 gridline hidden from x=0 to x=3000
- `restrictedY.get(2100)` → `[{min: 0, max: 3000}]` — y=2100 gridline hidden from x=0 to x=3000

**Example:** A horizontal envelope wall at y=0, spanning x=0→3600, with 1200mm external zone (normal pointing outward, y < 0):
- `restrictedY.get(-300)` → `[{min: 0, max: 3600}]` — within wall projection
- `restrictedY.get(-900)` → `[{min: 0, max: 3600}]` — within wall projection
- `restrictedY.get(300)` → `[{min: 0, max: 3600}]` — 600mm internal side

### Segment Bounds

For each wall contributing a restricted gridline:

- **Segment min/max** = the wall's extent along its length axis:
  - Horizontal wall: `min = Math.min(wall.pointA.x, wall.pointB.x)`, `max = Math.max(wall.pointA.x, wall.pointB.x)`
  - Vertical wall: `min = Math.min(wall.pointA.y, wall.pointB.y)`, `max = Math.max(wall.pointA.y, wall.pointB.y)`

- This applies to both 600mm and 1200mm zones. The 1200mm envelope lines already use wall projection bounds for red line clipping — this makes 600mm zones consistent.

- When multiple walls restrict the same gridline coordinate, their segments are stored as separate entries in the array. No merging is required — `drawGrid` checks all segments.

### `getRestrictedGridCoords()` Changes

The function already iterates walls and computes restricted grid coordinates. Changes:

1. Replace `Set` with `Map<number, Array<{min, max}>>`
2. Instead of `.add(g)`, push `{min: wallMin, max: wallMax}` into the array for coordinate `g`
3. Compute `wallMin`/`wallMax` from the wall's pointA/pointB along its length axis

### `drawGrid()` Changes

Currently draws each 300mm gridline as a single line from visible edge to visible edge, skipping entirely if the coordinate is in the restricted Set.

New behavior for each gridline:
1. Look up the coordinate in the restricted Map
2. If no entry, draw the full line (unchanged)
3. If segments exist, sort them by `min`, then draw the **gaps**:
   - Draw from visible edge to first segment's `min`
   - Draw from first segment's `max` to second segment's `min`
   - ... continue for all segments
   - Draw from last segment's `max` to visible edge
4. Convert segment bounds from mm to px using `mmToPx()` before drawing

Short segments (< 1px at current zoom) can be skipped to avoid rendering artifacts.

### `drawRestrictedZones()` Changes

When "Show restriction lines" is toggled ON:

- **600mm restriction lines:** Change from infinite (edge-to-edge) to wall-projection-scoped. Draw red lines from `wallMin` to `wallMax` only. This matches how 1200mm lines already behave.
- **1200mm restriction lines:** No change — already clipped to wall projection.
- The `restrictedCoords` parameter passed to `drawRestrictedZones()` can be removed. Previously it was used to skip red lines for fully-hidden gridlines. Now that gridlines are only partially hidden (within wall projection), red lines should always draw within that same projection — they overlay exactly the hidden segment, giving visual feedback about why the gridline is missing there.

When "Show restriction lines" is toggled OFF:
- No red lines drawn (unchanged)
- Gridline segments are still hidden (the hiding is always active)

### No Changes to Snapping or Validation

The following functions remain completely untouched:
- `sim.snapToGrid()` — rounds to nearest grid multiple
- `sim.snapLengthToGrid()` — snaps wall length, respects restriction zones
- `sim.isEndpointRestricted()` — checks if a coordinate is in a restriction zone
- `sim.nudgeStartPointOutOfZones()` — nudges start points out of restriction zones
- `sim.validateWall()` / `sim.validateAllWalls()` — validates all structural rules

Rule 3a enforcement (600mm parallel, 1200mm opposite-facing) is entirely handled by these functions. The gridline hiding is purely visual — it communicates restrictions to the user but does not enforce them. Enforcement happens at the snapping and validation layers.

## Files Modified

- `renderer2d.js`: `getRestrictedGridCoords()`, `drawGrid()`, `drawRestrictedZones()`
- `tests/hide-gridlines.spec.js`: Update existing tests, add segment-based tests

## Testing Strategy

1. **Unit tests for `getRestrictedGridCoords()`:** Verify segments have correct min/max bounds for horizontal and vertical walls, 600mm and 1200mm zones
2. **Unit tests for `drawGrid()` segment logic:** Verify gridlines are partially drawn (check that restricted coordinates produce segments, not full hiding)
3. **Integration test:** Draw walls, verify restricted segments are computed, trigger `draw()`, confirm no errors
4. **Visual verification:** Manual check that gridlines appear/disappear correctly near walls
5. **Regression:** Run full existing test suite to confirm no changes to snapping/validation behavior
