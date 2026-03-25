# 3D View with Shared Model Architecture

**Date:** 2026-03-25
**Scope:** Refactor the single-file app into a shared-model architecture and add a 3D view with full interactive parity.

## Context

The Symmetry Line Simulator is currently a ~4800 line single-file vanilla JS app (`index.html`). All data, logic, validation, and Canvas 2D rendering are interleaved in one `<script>` block. Adding a 3D view requires decoupling the data/logic layer from the rendering layer so both views share the same state without duplicating rules or behavior.

A separate `index3d.html` exists but is an independent prototype with its own state — it shares nothing with the main app. It will be replaced by this architecture.

## Goal

A toggle button in the top-right corner of the viewport switches between 2D and 3D views. Both views show identical content, support identical interactions (draw walls, draw voids, select, delete, stretch, resize), and enforce identical rules. Any change to rules or UX is implemented once in the shared model.

## File Structure

```
index.html        — HTML/CSS, sidebar, modals, toggle button, bootstrap script
sim.js            — data model, state, constants, validation, undo/redo, envelope detection
renderer2d.js     — Canvas 2D drawing + screenToWorld coordinate conversion
renderer3d.js     — Three.js scene, camera, controls + screenToWorld coordinate conversion
interaction.js    — shared mouse/keyboard handlers (mode logic written once)
```

## Module: `sim.js`

The single source of truth. No DOM, no rendering, no event handling. Pure data and logic.

### Exports

**Classes:**
- `Wall` — constructor, `updateVectors()`, `getExternalFacePoints()`, `getInternalFacePoints()`, `isParallelTo()`, `isPerpendicularTo()`, `distanceToWall()`, `overlapsInProjection()`, `sameOrientation()`, `oppositeOrientation()`, `containsPoint()`

**Constants:**
- `GRID_SIZE_EXTERNAL` (300mm), `GRID_SIZE_INTERNAL` (100mm), `COLUMN_SIZE` (100mm)
- `MIN_WALL_LENGTH` (400mm), `WALL_LENGTH_GRID` (300mm)
- `MIN_DISTANCE_PARALLEL` (600mm), `MIN_DISTANCE_OPPOSITE` (1200mm)
- `VOID_GRID` (600mm), `MIN_VOID_SIZE` (600mm)

**State** (mutable, read directly by renderers):
- `walls` — array of Wall instances
- `voids` — array of `{id, floorId, x, y, width, height}`
- `floors` — array of `{id, name, height}`
- `currentFloorId` — active floor
- `currentMode` — `'draw' | 'select' | 'delete' | 'void'`
- `selectedWalls` — array of selected Wall references
- `selectedVoid` — selected void reference or null
- `buildingEnvelopes` — detected envelope polygons with wall indices
- `slabRestrictionsEnabled` — isolation toggle state
- `history`, `redoHistory` — undo/redo stacks
- `envelopeAngleViolations` — cached validation results

**Mutations** (modify state, return success/error info):
- `addWall(ax, ay, bx, by, thickness, height, groupId, floorId)` → Wall or error
- `removeWall(wall)` — removes and updates envelopes
- `addVoid(floorId, x, y, width, height)` → void object or error
- `removeVoid(void)` — removes with history
- `resizeVoid(void, newX, newY, newWidth, newHeight)` → success or error
- `undo()`, `redo()`
- `setMode(mode)`, `switchFloor(floorId)`, `addFloor()`, `removeFloor(floorId)`
- `setSlabRestrictions(enabled)`
- `clearAll()`

**Queries** (read-only):
- `validateWall(wall, wallIndex)` → violations array
- `validateAllWalls()` → all violations
- `validateEnvelopeAngles()` → angle violations
- `validateVoidWallProximity(void)` → proximity violations
- `isWallInRestrictedZone(wall)` → restriction info
- `isWallInEnvelope(wall)` → boolean
- `getVoidAtPoint(x, y, floorId)` → void or null
- `getRestrictedZones(wall, floorId)` → zone geometries
- `detectBuildingEnvelopes(floorId)` → polygons

**Helpers:**
- `snapToGrid(value, gridSize)`
- `snapToVoidGrid(value)`
- `snapLengthToGrid(startPoint, endPoint)`
- `generateVoidId()`
- `getVoidResizeHandle(pos, void)` → handle name or null

## Renderer Interface

Both `renderer2d.js` and `renderer3d.js` export an object implementing:

```javascript
{
    init(container)          // Set up canvas/scene inside the DOM container
    draw()                   // Full redraw from sim.js state
    activate()               // Show, bind resize, start animation loop (3D)
    deactivate()             // Hide, unbind, stop loop
    screenToWorld(event)     // Mouse event → {x, y} in mm coordinates
    drawPreview(start, current, mode)  // Live preview during drawing
    destroy()                // Cleanup (optional, for hot-reload)
}
```

### `renderer2d.js`

Extracted from the current `index.html` draw code. The `draw()` function contains:
- Grid rendering (300mm external, 100mm internal)
- Restricted zone visualization
- Building envelope polygons
- Wall rendering (current floor + ghost walls from other floors)
- Void rendering (hatch pattern, ghost voids)
- Void preview, wall preview
- Selection highlights, resize handles, endpoint handles
- Snap indicators
- Envelope angle violation indicators
- Void restricted zones (purple) in void mode

`screenToWorld(event)` performs the existing pan/zoom inverse transform to convert screen pixels to mm coordinates.

### `renderer3d.js`

New Three.js-based renderer with visual parity:

**Scene setup:**
- Three.js with WebGL renderer, antialiasing, shadows
- OrbitControls: right-click rotate, middle-click pan, scroll zoom
- Perspective camera with sensible defaults

**Grid:**
- Ground plane grid matching 2D: 300mm major lines, 100mm minor lines
- Grid rendered at the current floor's Y height

**Walls:**
- Box meshes with width = thickness, height = wall height, depth = wall length
- Steel column indicators at wall ends (small box meshes)
- Internal face (blue) and external face (gray) distinguished by material colors
- Selected walls: blue material
- Ghost walls from other floors: transparent material with reduced opacity

**Voids:**
- Semi-transparent box cutouts or flat rectangles on the floor plane with hatch texture
- Selected void: blue outline
- Ghost voids from other floors: outline only at reduced opacity

**Building envelopes:**
- Translucent floor plane fill inside detected envelope polygons

**Restricted zones:**
- Semi-transparent colored volumes when in draw or void mode
- Same color coding: orange (600mm parallel), red (1200mm opposite), purple (void restricted faces)

**Section cut (floor visibility):**
- All floors below current: fully rendered (complete walls, slabs)
- Current floor: walls at full height
- Floors above current: hidden (clipped away)
- "Show Levels Below" toggle: controls visibility of floors below the current one
- "Show Levels Above" toggle: controls visibility of floors above (if ever needed)

**`screenToWorld(event)`:** Raycasts from camera through mouse position onto the ground plane at the current floor's Y height, converts the intersection point to mm coordinates.

## Module: `interaction.js`

Shared mouse/keyboard event handlers. Written once, works with both renderers.

**Imports:** `sim.js` for state and mutations, active renderer reference for `screenToWorld()` and `draw()`.

**Tracks interaction state:**
- `drawingWall` — start point of wall being drawn
- `tempPoint` — current cursor position during drawing
- `wallFlipped` — flip state during drawing
- `drawingVoid` — start point of void being drawn
- `isDragging` — wall move in progress
- `dragStartPos`, `originalWallPos` — move state
- `stretchingWall`, `stretchingEndpoint`, `originalStretchPoint` — stretch state
- `resizingVoid`, `originalVoidState` — void resize state

**Event handlers:**

`onMouseDown(event)`:
- Gets mm coordinates via `activeRenderer.screenToWorld(event)`
- Branches on `sim.currentMode`: draw, select, delete, void
- Draw mode: starts wall drawing or finalizes placement (calls `sim.addWall()`)
- Select mode: checks void resize handles, wall endpoint handles, wall click, void click
- Delete mode: finds wall or void at click, calls `sim.removeWall()` or `sim.removeVoid()`
- Void mode: starts or finalizes void drawing (calls `sim.addVoid()`)

`onMouseMove(event)`:
- Gets mm coordinates
- Updates preview via `activeRenderer.drawPreview()`
- Handles wall stretching, void resizing, wall dragging
- Updates cursor style

`onMouseUp(event)`:
- Finalizes stretching, dragging, resizing operations
- Calls appropriate `sim.*` mutations

`onKeyDown(event)`:
- Delete/Backspace: remove selected walls/void
- Escape: cancel drawing, switch to select mode
- Space: flip wall orientation
- Ctrl+Z: undo, Ctrl+Shift+Z: redo

After any mutation, calls `activeRenderer.draw()` and updates UI (toast, sidebar state).

## `index.html` Structure

**HTML:** Sidebar (tools, level management, wall properties, actions), two renderer containers (one visible at a time), toggle button, toast container, modals (rules, feedback, changelog).

**CSS:** All existing styles, plus the 3D toggle button.

**Bootstrap script (~30 lines):**
```javascript
import * as sim from './sim.js';
import { renderer2D } from './renderer2d.js';
import { renderer3D } from './renderer3d.js';
import { initInteraction } from './interaction.js';

let activeRenderer = renderer2D;
renderer2D.init(document.getElementById('container-2d'));
renderer3D.init(document.getElementById('container-3d'));

activeRenderer.activate();
activeRenderer.draw();

initInteraction(() => activeRenderer);

// Toggle button
document.getElementById('toggleViewBtn').addEventListener('click', () => {
    activeRenderer.deactivate();
    activeRenderer = activeRenderer === renderer2D ? renderer3D : renderer2D;
    activeRenderer.activate();
    activeRenderer.draw();
});

// Sidebar event listeners → sim.* mutations → activeRenderer.draw()
```

**Toggle button:** Top-right corner of the viewport, small icon. Shows a cube icon when in 2D (click to go 3D), shows a grid/2D icon when in 3D (click to go 2D).

## Migration Path

This is a refactor of existing working code, not a rewrite:

1. **Extract `sim.js`** — move all data, logic, validation functions out of `index.html`. The 2D view should remain functionally identical.
2. **Extract `renderer2d.js`** — move Canvas 2D drawing code into the renderer interface. Wire up to `sim.js`.
3. **Extract `interaction.js`** — move event handlers, refactor to use `screenToWorld()` abstraction.
4. **Verify 2D still works** — the app should behave identically to before the refactor.
5. **Build `renderer3d.js`** — new Three.js renderer implementing the same interface.
6. **Add toggle button** — wire up the view switch.

Steps 1-4 are pure refactoring with no new features. Step 5 is the only net-new code. Step 6 is trivial wiring.

## Out of Scope

- Split-screen / simultaneous 2D+3D views
- 3D-specific features not in 2D (e.g., fly-through, VR)
- Build tooling or bundling
- The existing `index3d.html` prototype (will be replaced/removed)
