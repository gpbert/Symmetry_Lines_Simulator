# Structural Internal Walls Design Spec

**Date:** 2026-04-14
**Status:** Draft

## Problem

Currently, walls inside a building envelope are always non-structural (no columns, 100mm grid). The rules document (Rule 7a) specifies void interaction behavior for structural internal walls, but these don't exist in the simulator yet. Users need the ability to convert internal walls to structural to support the full rule set and prepare for void-wall interaction (future spec).

## Goal

Allow users to convert non-structural internal walls to structural. Structural internal walls gain steel columns, snap to the 300mm grid, and participate in restriction zone enforcement — matching the behavior of standalone and envelope walls.

## Non-Goals

- Void-wall interaction (separate future spec)
- Slab/Pod's Grid visualization
- Changes to envelope detection (structural internal walls are NOT part of envelope loops)

## Wall Classification

Walls are classified by two properties: position (inside/outside envelope) and structural flag.

| Position | Structural | Type | Grid | Columns | Restriction Zones |
|----------|-----------|------|------|---------|-------------------|
| Outside envelope | always true | Standalone structural | 300mm | Yes | Yes (600mm/1200mm) |
| Envelope loop | always true | Envelope wall | 300mm | Yes | Yes (600mm/1200mm) |
| Inside envelope | false (default) | Non-structural | 100mm | No | No |
| Inside envelope | true (converted) | Structural internal | 300mm | Yes | Yes (600mm/1200mm) |

The `structural` flag is stored on the wall object. Default is `false` for walls drawn inside an envelope. All other walls are implicitly structural (no flag needed — they already behave as structural).

Classification is dynamic based on position:
- A structural internal wall moved outside an envelope becomes a standalone structural wall
- A structural internal wall moved back inside becomes structural internal again
- The `structural` flag persists regardless of position

## Conversion UX

### Trigger

When a non-structural internal wall is selected, a **"Make Structural"** button appears in the sidebar. The button does NOT appear for:
- Envelope walls (already structural)
- Walls not inside an envelope
- Walls already marked structural

### Conversion Steps

On clicking "Make Structural":

1. **Add to undo history** — Cmd+Z reverts fully (position, length, structural flag)
2. **Set `wall.structural = true`**
3. **Snap position to nearest valid 300mm gridline** — the wall's internal face (column face) shifts to the closest 300mm gridline that is NOT in a restriction zone of any other structural wall. If the nearest gridline is restricted, check the next gridlines outward in both directions. If no valid gridline can be found within a reasonable range (e.g., 10 grid positions / 3000mm), prevent the conversion and show a brief toast: "Not enough space to convert to structural."
4. **Snap length to nearest 300mm multiple** — the wall length adjusts to the nearest valid multiple of 300mm. Both endpoints shift accordingly and must land on 300mm grid positions.
5. **Redraw** — wall renders with columns, blue internal face, grey fill, dimension labels

### Undo

Cmd+Z reverts the conversion:
- `wall.structural` returns to `false`
- Wall returns to its original position and length on the 100mm grid
- Columns disappear
- Wall stops creating restriction zones

There is no explicit "Make Non-Structural" button — undo is the only way to revert.

## Rendering

Structural internal walls render identically to envelope walls:
- Grey fill with blue internal face line
- 10x10cm steel columns at each end
- Dimension labels
- Same stroke weights and colors

The only visual difference: they are not connected to other walls in the envelope loop (no corner extensions).

## Behavior

### Restriction Zones

Structural internal walls create restriction zones:
- **600mm** for parallel same-orientation walls
- **1200mm** for opposite-facing parallel walls

These zones apply between:
- Structural internal ↔ envelope walls
- Structural internal ↔ standalone structural walls
- Structural internal ↔ other structural internal walls

Non-structural walls continue to be exempt from all restriction checks.

### Gridline Hiding

Restricted gridlines near structural internal walls are hidden using the same segment-based logic as envelope walls. Since structural internal walls are not part of envelopes, their 600mm zone hides entire gridlines (null/infinite), not projection-limited segments. The 1200mm opposite-facing zone is projection-limited.

### Grid Snapping

- Position snaps to 300mm external grid
- Length snaps to 300mm multiples
- When selected and moved, snaps to 300mm grid
- Auto-segmentation if length exceeds 6000mm

### Cross-Floor Rules

Structural internal walls enforce cross-floor rules on adjacent levels:
- Overlapping segments must share orientation and thickness
- Distance rules apply between consecutive floors

### Returning Wall Rule

Structural internal walls can participate in returning wall pairs if they share a grid line with another structural wall (envelope or structural internal) and are connected via shared endpoints or envelope membership.

## Files Modified

- `sim.js`: Add `structural` property to Wall, update `isInternalWall()` to check structural flag
- `interaction.js`: Handle "Make Structural" button, grid snapping on conversion
- `renderer2d.js`: Render structural internal walls with columns and structural styling
- `index.html`: Add "Make Structural" button UI

## Testing Strategy

1. **Unit: Wall classification** — verify `isInternalWall()` returns false for structural internal walls
2. **Unit: Conversion** — verify position/length snap to 300mm grid on conversion
3. **Unit: Restriction zones** — verify structural internal walls create 600mm/1200mm zones
4. **Unit: Undo** — verify Cmd+Z reverts position, length, and structural flag
5. **Integration: Gridline hiding** — verify gridlines hide near structural internal walls
6. **E2E: Full conversion flow** — draw internal wall, convert, verify rendering and behavior
