# Module Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the monolithic `index.html` (~4900 lines) into four ES modules (`sim.js`, `renderer2d.js`, `interaction.js`, updated `index.html`) with zero behavior change. This is a pure refactor — the 2D view must work identically after extraction.

**Architecture:** The `sim.js` module owns all state, validation, and business logic. `renderer2d.js` owns Canvas 2D drawing and coordinate conversion. `interaction.js` owns shared mouse/keyboard event handling for app-level tools. `index.html` becomes HTML/CSS + sidebar wiring + bootstrap.

**Tech Stack:** Vanilla JavaScript ES modules, HTML5 Canvas 2D. No build tools. Served over HTTP (Vercel).

**Spec:** `docs/superpowers/specs/2026-03-25-3d-view-design.md`

---

## File Structure

```
index.html        — HTML/CSS, sidebar, modals, toast system, bootstrap (modify)
sim.js            — data model, state, constants, Wall class, validation, undo/redo, envelopes (create)
renderer2d.js     — Canvas 2D drawing, coordinate conversion, grid, preview (create)
interaction.js    — shared mouse/keyboard handlers for tools (create)
```

### What goes where

**`sim.js`** (extracted from index.html):
- Constants: lines 659-668 (`GRID_SIZE_EXTERNAL` through `MIN_VOID_SIZE`)
- Wall class: lines 964-1182
- State variables: `walls`, `voids`, `selectedWalls`, `selectedVoid`, `currentMode`, `floors`, `currentFloorId`, `buildingEnvelopes`, `newEnvelopeTimestamp`, `slabRestrictionsEnabled`, `history`, `redoHistory`, `envelopeAngleViolations`, `showLevelsBelow`, `showLevelsAbove`
- Undo/redo: `addToHistory`, `undo`, `redo`, `addVoidDeletionToHistory` (lines 818-928)
- Grid helpers: `snapToGrid`, `snapToVoidGrid`, `snapLengthToGrid` (lines 1184-1211)
- Void helpers: `generateVoidId`, `getVoidAtPoint`, `getVoidResizeHandle` (lines 813-830, 2299-2329)
- Geometric queries: `getEndpointNearPoint` (lines 2270-2297) — wall endpoint hit-testing, used by both rendering and interaction
- Envelope detection: `detectBuildingEnvelopes`, `updateBuildingEnvelopes`, `pointNearLineSegment`, `pointInPolygon`, `getWallSlabSystem`, `envelopesOverlap`, `getConnectedSlabSystems`, `areWallsInSameSlabSystem`, `getPredictedSlabSystemForPreviewWall` (lines 1414-1912)
- Validation: `validateWall`, `validateAllWalls`, `validateEnvelopeAngles`, `validateVoidWallProximity`, `isWallInRestrictedZone`, `isWallInEnvelope` (lines 2016-2162, 3310-3668)
- Restricted zone calculation: `getRestrictedZones` (lines 1294-1376)

**`renderer2d.js`** (extracted from index.html):
- Canvas setup, resize handling (lines 930-961)
- Pixel conversion: `mmToPx`, `pxToMm`, `pxSnapToGrid` (lines 1213-1225)
- Grid drawing: `drawGrid` (lines 1228-1292)
- Restricted zone drawing: `drawRestrictedZones` (lines 1378-1412)
- Envelope drawing: `drawBuildingEnvelopes` (lines 2331-2430)
- Wall drawing: `drawWall` (lines 2164-2268)
- Void drawing: `drawVoid` (lines 2432-2466)
- Snap indicator: `drawSnapIndicator` (lines 3715-3732)
- Main draw function: `draw` (lines 2468-3308)
- Pan/zoom state: `panOffset`, `zoomLevel`
- `MM_TO_PX` constant (line 661) — 2D-specific, does NOT go in `sim.js`
- `screenToWorld(event)` — extracted from `getMousePosition` (lines 3691-3713)

**`interaction.js`** (extracted from index.html):
- Interaction state: `drawingWall`, `tempPoint`, `wallFlipped`, `drawingToastElement`, `drawingVoid`, `isDragging`, `dragStartPos`, `originalWallPos`, `stretchingWall`, `stretchingEndpoint`, `originalStretchPoint`, `resizingVoid`, `originalVoidState`, `currentMousePos`, `currentMouseScreenPos`
- All mouse event handlers from `setupEventListeners` (lines 3734-4624): wheel, mouseup, mousemove, mouseleave, mousedown
- Keyboard handler (lines within setupEventListeners)
- `updateDrawingToast`, `clearDrawingToast` (lines 752-810) — interaction-specific toast management

**`index.html`** (what remains):
- All HTML structure (sidebar, modals, canvas container)
- All CSS
- Toast notification system: `showToast` (lines 719-750) — DOM function
- Sidebar event listeners: mode buttons, floor management, wall properties, actions (lines 4109-4624)
- UI update functions: `updateFloorDropdown`, `updateModeUI`, `updateUI` (lines 4626-4664)
- Bootstrap: import modules, init renderer, init interaction, wire sidebar

---

## Task 1: Create `sim.js` — Constants, Wall Class, State

**Files:**
- Create: `sim.js`
- Modify: `index.html`

- [ ] **Step 1: Create `sim.js` with constants**

Create `sim.js` and move all constants from index.html lines 659-668:

```javascript
// sim.js — Shared data model, state, and business logic
// No DOM, no rendering, no event handling.

// Constants
export const GRID_SIZE_EXTERNAL = 300;
export const GRID_SIZE_INTERNAL = 100;
export const COLUMN_SIZE = 100;
export const MIN_WALL_LENGTH = 400;
export const WALL_LENGTH_GRID = 300;
export const MIN_DISTANCE_PARALLEL = 600;
export const MIN_DISTANCE_OPPOSITE = 1200;
export const VOID_GRID = 600;
export const MIN_VOID_SIZE = 600;
export const MAX_HISTORY = 50;
```

- [ ] **Step 2: Move Wall class to `sim.js`**

Copy the entire `Wall` class (lines 964-1182) into `sim.js` and add `export` before `class Wall`. The Wall class has no DOM dependencies — it's pure math.

- [ ] **Step 3: Move state variables to `sim.js`**

Add exported state object. Use a plain object so renderers can read properties directly:

```javascript
// State — mutable, read by renderers
export const state = {
    walls: [],
    voids: [],
    selectedWalls: [],
    selectedVoid: null,
    currentMode: 'draw',
    floors: [{ id: 0, name: 'Level 1', height: 0 }],
    currentFloorId: 0,
    buildingEnvelopes: [],
    newEnvelopeTimestamp: null,
    slabRestrictionsEnabled: false,
    showLevelsBelow: true,
    showLevelsAbove: true,
    history: [],
    redoHistory: [],
    envelopeAngleViolations: [],
    nextVoidId: 1,
};
```

- [ ] **Step 4: Move grid/snap helpers to `sim.js`**

Move `snapToGrid`, `snapToVoidGrid`, `snapLengthToGrid`, `generateVoidId` to `sim.js`. Update them to reference `state.*` instead of bare variables, and constants from the module scope. Export each function.

- [ ] **Step 5: Update `index.html` to import from `sim.js`**

Change the `<script>` tag to `<script type="module">`. Add:
```javascript
import { Wall, state, GRID_SIZE_EXTERNAL, ... } from './sim.js';
```

Remove the moved constants, Wall class, state variables, and helper functions from index.html. Replace all bare references to state variables with `state.*` (e.g., `walls` → `state.walls`, `currentFloorId` → `state.currentFloorId`).

**Important:** This is the most tedious step. Every reference to `walls`, `voids`, `floors`, `currentFloorId`, `selectedWalls`, `selectedVoid`, `currentMode`, `buildingEnvelopes`, `slabRestrictionsEnabled`, `history`, `redoHistory`, `envelopeAngleViolations`, `newEnvelopeTimestamp` must be prefixed with `state.`. Search and replace carefully — avoid replacing local variable names that shadow state (e.g., `wall` in a forEach callback is NOT `state.wall`).

- [ ] **Step 6: Test and commit**

Open `index.html` in browser (via local server or Vercel dev). Verify:
1. App loads without console errors
2. Can draw a wall
3. Wall validation works
4. Undo/redo works

```bash
git add sim.js index.html
git commit -m "refactor: extract constants, Wall class, and state to sim.js"
```

---

## Task 2: Move Undo/Redo and Void Helpers to `sim.js`

**Files:**
- Modify: `sim.js`
- Modify: `index.html`

- [ ] **Step 1: Move undo/redo functions to `sim.js`**

Move `addToHistory`, `undo`, `redo`, `addVoidDeletionToHistory` to `sim.js`. Update references from bare state variables to `state.*`. Export each function.

The `undo()` and `redo()` functions currently call `updateBuildingEnvelopes()`, `updateUI()`, `draw()`, and `showToast()`. These are not yet in `sim.js`. For now, make undo/redo accept a callback for post-operation side effects:

```javascript
export function undo(onComplete) {
    // ... existing logic with state.* references ...
    if (onComplete) onComplete();
}
```

The caller in index.html passes `() => { updateBuildingEnvelopes(); updateUI(); draw(); showToast('Undo', 'info', 2000); }`.

- [ ] **Step 2: Move void helpers to `sim.js`**

Move `generateVoidId`, `getVoidAtPoint`, `getVoidResizeHandle` to `sim.js`. Update state references. Export.

- [ ] **Step 3: Update `index.html` imports and remove moved code**

Update the import statement. Remove moved functions from index.html. Update all call sites.

- [ ] **Step 4: Test and commit**

Verify undo/redo works, void selection/deletion works.

```bash
git add sim.js index.html
git commit -m "refactor: move undo/redo and void helpers to sim.js"
```

---

## Task 3: Move Envelope Detection and Slab System Logic to `sim.js`

**Files:**
- Modify: `sim.js`
- Modify: `index.html`

- [ ] **Step 1: Move envelope and slab functions to `sim.js`**

Move these functions (in dependency order):
1. `pointNearLineSegment`
2. `pointInPolygon`
3. `detectBuildingEnvelopes`
4. `updateBuildingEnvelopes` — currently calls `draw()`. Change to accept a callback like undo/redo.
5. `getWallSlabSystem`
6. `envelopesOverlap`
7. `getConnectedSlabSystems`
8. `areWallsInSameSlabSystem`
9. `getPredictedSlabSystemForPreviewWall`

Update all state references to `state.*`. Export each function.

- [ ] **Step 2: Update `index.html` imports and remove moved code**

- [ ] **Step 3: Test and commit**

Draw a closed rectangle of 4 walls — verify envelope detection still works (blue fill appears). Verify cross-floor envelope behavior.

```bash
git add sim.js index.html
git commit -m "refactor: move envelope detection and slab system logic to sim.js"
```

---

## Task 4: Move Validation to `sim.js`

**Files:**
- Modify: `sim.js`
- Modify: `index.html`

- [ ] **Step 1: Move validation functions to `sim.js`**

Move:
1. `getRestrictedZones` — zone geometry calculation (used by both rendering and placement validation)
2. `isWallInRestrictedZone` — placement check
3. `validateWall`
4. `validateAllWalls` — currently calls `draw()`. Change to return violations and let caller handle draw.
5. `validateEnvelopeAngles`
6. `validateVoidWallProximity`
7. `isWallInEnvelope`

Update state references. Export.

- [ ] **Step 2: Update `index.html`**

Update imports, remove moved code, update call sites. `validateAllWalls` callers should now do:
```javascript
const violations = validateAllWalls();
draw();
```

- [ ] **Step 3: Test and commit**

Draw walls that violate distance rules — verify red highlighting and toast messages still work. Draw voids near walls — verify proximity validation.

```bash
git add sim.js index.html
git commit -m "refactor: move validation engine to sim.js"
```

---

## Task 5: Create `renderer2d.js` — Drawing Functions

**Files:**
- Create: `renderer2d.js`
- Modify: `index.html`

- [ ] **Step 1: Create `renderer2d.js` with the renderer object**

```javascript
// renderer2d.js — Canvas 2D renderer
import * as sim from './sim.js';

let canvas, ctx;
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1.0;
let isPanning = false;
let lastPanPos = { x: 0, y: 0 };

export const renderer2D = {
    init(container) { ... },
    draw() { ... },
    activate() { ... },
    deactivate() { ... },
    screenToWorld(event) { ... },
    get panOffset() { return panOffset; },
    get zoomLevel() { return zoomLevel; },
};
```

- [ ] **Step 2: Move pixel conversion functions**

Move `mmToPx`, `pxToMm`, `pxSnapToGrid` into `renderer2d.js` as module-level functions (not exported — internal to the renderer).

- [ ] **Step 3: Move drawing functions**

Move into `renderer2d.js` as module-level functions:
- `drawGrid`
- `drawRestrictedZones`
- `drawBuildingEnvelopes`
- `drawWall`
- `drawVoid`
- `drawSnapIndicator`
- The main `draw` function

Also add `MM_TO_PX` as a module-level constant in `renderer2d.js`:
```javascript
const MM_TO_PX = 0.15; // 2D-specific scale factor
```

Each function reads from `sim.state` instead of bare variables. Drawing functions use the module-level `ctx`, `canvas`, `panOffset`, `zoomLevel`.

**Important — interaction state during Task 5:** The `draw()` function reads interaction state variables (`drawingWall`, `tempPoint`, `wallFlipped`, `drawingVoid`, `stretchingWall`, `currentMousePos`, `currentMouseScreenPos`) for preview rendering. These variables are NOT yet in `interaction.js` (that's Task 6). During Task 5, keep these variables in `index.html` scope and have `renderer2d.js` read them via a setter:

```javascript
// renderer2d.js
let _interactionState = {};
export function setInteractionState(state) { _interactionState = state; }
```

In index.html, after the interaction variables are still declared there:
```javascript
renderer2D.setInteractionState({
    get drawingWall() { return drawingWall; },
    get tempPoint() { return tempPoint; },
    // ... etc
});
```

In Task 6, this gets replaced with the proper `interactionState` import from `interaction.js`.

- [ ] **Step 4: Implement the renderer interface methods**

```javascript
init(container) {
    canvas = container.querySelector('canvas') || document.createElement('canvas');
    if (!container.querySelector('canvas')) container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    this._resizeHandler = () => { /* resize logic */ };
},

activate() {
    canvas.parentElement.style.display = 'block';
    window.addEventListener('resize', this._resizeHandler);
    this._resizeHandler(); // Initial size
    this._bindNavigation();
},

deactivate() {
    canvas.parentElement.style.display = 'none';
    window.removeEventListener('resize', this._resizeHandler);
    this._unbindNavigation();
},

screenToWorld(event) {
    // Existing getMousePosition logic — inverse pan/zoom transform
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const worldX = (canvasX - panOffset.x) / zoomLevel;
    const worldY = (canvasY - panOffset.y) / zoomLevel;
    let x = pxToMm(worldX);
    let y = pxToMm(worldY);
    // Always snaps to 300mm external grid. Void mode callers re-snap
    // to VOID_GRID (600mm) at the call site in interaction.js.
    x = sim.snapToGrid(x, sim.GRID_SIZE_EXTERNAL);
    y = sim.snapToGrid(y, sim.GRID_SIZE_EXTERNAL);
    return { x, y, screenX: canvasX, screenY: canvasY };
},
```

- [ ] **Step 5: Move navigation (pan/zoom) into renderer**

The wheel handler and the pan logic (middle-click/ctrl+click) from `setupEventListeners` move into `_bindNavigation()` / `_unbindNavigation()` methods on the renderer. These are bound to the canvas element.

- [ ] **Step 6: Update `index.html`**

Import `renderer2D` from `renderer2d.js`. Remove all moved drawing functions and pixel conversion. The `draw()` call sites in index.html should now call `renderer2D.draw()`.

- [ ] **Step 7: Test and commit**

Verify: grid renders, walls render with correct colors, envelopes show blue fill, restricted zones appear, pan/zoom works, void rendering works.

```bash
git add renderer2d.js index.html
git commit -m "refactor: extract Canvas 2D renderer to renderer2d.js"
```

---

## Task 6: Create `interaction.js` — Event Handlers

**Files:**
- Create: `interaction.js`
- Modify: `index.html`

- [ ] **Step 1: Create `interaction.js` with interaction state**

```javascript
// interaction.js — Shared mouse/keyboard event handlers
import * as sim from './sim.js';

let activeRenderer = null;
let showToast = null;

// Interaction state
let drawingWall = null;
let tempPoint = null;
let wallFlipped = false;
let drawingToastElement = null;
let drawingVoid = null;
let isDragging = false;
let dragStartPos = null;
let originalWallPos = null;
let stretchingWall = null;
let stretchingEndpoint = null;
let originalStretchPoint = null;
let resizingVoid = null;
let originalVoidState = null;
let currentMousePos = null;
let currentMouseScreenPos = null;

// Expose interaction state for renderers to read during draw()
export const interactionState = {
    get drawingWall() { return drawingWall; },
    get tempPoint() { return tempPoint; },
    get wallFlipped() { return wallFlipped; },
    get drawingVoid() { return drawingVoid; },
    get stretchingWall() { return stretchingWall; },
    get stretchingEndpoint() { return stretchingEndpoint; },
    get resizingVoid() { return resizingVoid; },
    get currentMousePos() { return currentMousePos; },
    get currentMouseScreenPos() { return currentMouseScreenPos; },
};

let getRenderer = null;

export function initInteraction(getActiveRenderer, toastFn) {
    getRenderer = getActiveRenderer;
    showToast = toastFn;
}

// Helper — always returns the current active renderer
function renderer() { return getRenderer(); }

export function bindToCanvas(canvasElement) {
    canvasElement.addEventListener('mouseup', onMouseUp);
    canvasElement.addEventListener('mousemove', onMouseMove);
    canvasElement.addEventListener('mouseleave', onMouseLeave);
    canvasElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
}
```

- [ ] **Step 2: Move mouse/keyboard handlers**

Move the handler functions from `setupEventListeners` (lines 3734-4624) into `interaction.js`:
- `onMouseUp` — wall stretch finalization, void resize finalization, drag finalization
- `onMouseMove` — void resize, wall stretch, wall drag, draw preview, void preview
- `onMouseDown` — mode-based click handling (draw, select, delete, void)
- `onMouseLeave` — cancel in-progress operations
- `onKeyDown` — Delete, Escape, Space, Ctrl+Z, Ctrl+Shift+Z

Each handler calls `activeRenderer.screenToWorld(event)` for coordinates and `activeRenderer.draw()` after mutations. Replace `showToast(...)` calls with the passed-in `showToast` function.

**Key refactoring:** The handlers currently reference the canvas-specific pan logic. Navigation events (middle-click pan, ctrl+click pan) should be identified and skipped by interaction.js — they're handled by the renderer's own navigation binding. Add early returns:

```javascript
function onMouseDown(e) {
    // Skip navigation events — handled by renderer
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) return;
    // ... rest of app-level interaction
}
```

- [ ] **Step 3: Move drawing toast functions**

Move `updateDrawingToast` and `clearDrawingToast` to `interaction.js` (they manage a DOM element during drawing interaction). They call `showToast` internally — use the passed-in function.

- [ ] **Step 4: Update renderer2d.js draw() to read interaction state**

The `draw()` function in `renderer2d.js` needs to read `interactionState` from `interaction.js` to render previews, snap indicators, etc.:

```javascript
import { interactionState } from './interaction.js';

// Inside draw():
if (interactionState.drawingWall && interactionState.tempPoint) {
    // Draw wall preview...
}
```

- [ ] **Step 5: Update `index.html`**

Remove `setupEventListeners` and all moved handler code. Import and call:
```javascript
import { initInteraction, bindToCanvas } from './interaction.js';

initInteraction(() => activeRenderer, showToast);
// After renderer init:
bindToCanvas(document.querySelector('canvas'));
```

- [ ] **Step 6: Test and commit**

Verify ALL interactions work:
1. Draw a wall (click-click) — preview shows, wall placed
2. Flip wall (Space key) — orientation flips
3. Select a wall — highlights blue
4. Move a wall (drag in select mode) — moves and snaps
5. Stretch a wall endpoint — snaps to 300mm grid
6. Delete a wall — removed with toast
7. Draw a void — preview with dimensions, placed
8. Select a void — blue dashed border, resize handles
9. Resize a void — snaps to 600mm grid
10. Delete a void — removed
11. Undo/Redo through all operations
12. Pan (middle-click) and zoom (scroll) — still works
13. Keyboard shortcuts (Delete, Escape, Ctrl+Z)

```bash
git add interaction.js renderer2d.js index.html
git commit -m "refactor: extract interaction handlers to interaction.js"
```

---

## Task 7: Clean Up `index.html` — Sidebar Wiring and Bootstrap

**Files:**
- Modify: `index.html`
- Modify: `sim.js` (minor — add `showLevelsBelow`/`showLevelsAbove` setters if not already present)

- [ ] **Step 1: Refactor sidebar event listeners**

The remaining JS in `index.html` should be:
1. `showToast()` function (DOM-dependent)
2. Sidebar button listeners that call `sim.*` + `activeRenderer.draw()`
3. `updateFloorDropdown()`, `updateModeUI()`, `updateUI()`
4. Modal open/close logic
5. Bootstrap: import modules, init everything

Verify that all sidebar listeners reference `sim.state.*` and call `activeRenderer.draw()` after mutations.

- [ ] **Step 2: Add `showLevelsBelow` and `showLevelsAbove` to `sim.state`**

These are already in the state object from Task 1. Wire the checkbox listeners:
```javascript
document.getElementById('showOtherFloors').addEventListener('change', (e) => {
    sim.state.showLevelsBelow = e.target.checked;
    activeRenderer.draw();
});
document.getElementById('showLevelsAbove').addEventListener('change', (e) => {
    sim.state.showLevelsAbove = e.target.checked;
    activeRenderer.draw();
});
```

- [ ] **Step 3: Write the bootstrap script**

```javascript
import * as sim from './sim.js';
import { renderer2D } from './renderer2d.js';
import { initInteraction, bindToCanvas } from './interaction.js';

let activeRenderer = renderer2D;
renderer2D.init(document.querySelector('.canvas-container'));
activeRenderer.activate();

initInteraction(() => activeRenderer, showToast);
bindToCanvas(document.querySelector('canvas'));

// Sidebar wiring follows...
```

- [ ] **Step 4: Verify `index.html` is mostly HTML/CSS**

Count the remaining JS lines. The `<script type="module">` block should be roughly:
- `showToast` function (~30 lines)
- Bootstrap (~10 lines)
- Sidebar listeners (~100 lines)
- UI update functions (~40 lines)
- Modal logic (~30 lines)
- Total: ~210 lines (down from ~4300)

- [ ] **Step 5: Full regression test and commit**

Run through every feature:
1. All drawing modes (wall, void)
2. All selection/manipulation (select, move, stretch, resize)
3. All deletion (walls, voids)
4. All validation (distance rules, length, envelope angles, void proximity)
5. Floor management (add, remove, switch, show/hide levels)
6. Undo/redo across all operations
7. Slab isolation toggle
8. Clear All
9. Pan/zoom
10. Modals (rules, feedback, changelog)
11. Toast notifications

```bash
git add index.html sim.js renderer2d.js interaction.js
git commit -m "refactor: finalize module extraction, clean up index.html

index.html is now ~300 lines of HTML/CSS + ~210 lines of bootstrap/sidebar JS.
All data, logic, rendering, and interaction code lives in ES modules."
```

---

## Task 8: Add 2D/3D Container Structure and Toggle Button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update HTML to have two renderer containers**

Replace the single canvas container:
```html
<div class="main-content">
    <div id="container-2d" class="renderer-container">
        <canvas id="mainCanvas"></canvas>
    </div>
    <div id="container-3d" class="renderer-container" style="display: none;">
        <!-- Three.js renders here -->
    </div>
    <button id="toggleViewBtn" class="toggle-view-btn" title="Switch to 3D view">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 1L16 5V13L9 17L2 13V5L9 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M9 17V9M9 9L2 5M9 9L16 5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
    </button>
</div>
```

- [ ] **Step 2: Add toggle button CSS**

```css
.toggle-view-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 20;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    background: #ffffff;
    color: #2a2a2a;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.toggle-view-btn:hover {
    background: #fafafa;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
}
.renderer-container {
    width: 100%;
    height: 100%;
    position: relative;
}
```

- [ ] **Step 3: Update bootstrap to support toggle**

```javascript
import { renderer2D } from './renderer2d.js';
// renderer3D will be imported when it exists — for now just toggle between 2D states

let activeRenderer = renderer2D;

document.getElementById('toggleViewBtn').addEventListener('click', () => {
    // Placeholder — will swap renderers when renderer3d.js exists
    showToast('3D view coming soon', 'info', 2000);
});
```

- [ ] **Step 4: Test and commit**

Verify toggle button appears in top-right corner, shows cube icon, is clickable. 2D view still works perfectly.

```bash
git add index.html
git commit -m "feat: add 2D/3D container structure and toggle button placeholder"
```

---

## Task 9: Add Three.js Import Map

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add import map to `<head>`**

Add before the `<script type="module">`:
```html
<script type="importmap">
{
    "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "chore: add Three.js import map for 3D renderer"
```

---

## Summary

| Task | Description | Creates | Risk |
|------|-------------|---------|------|
| 1 | Constants, Wall class, state → sim.js | sim.js | Medium — many reference updates |
| 2 | Undo/redo, void helpers → sim.js | — | Low |
| 3 | Envelope/slab logic → sim.js | — | Medium — complex interdependencies |
| 4 | Validation → sim.js | — | Low |
| 5 | Drawing functions → renderer2d.js | renderer2d.js | High — largest extraction |
| 6 | Event handlers → interaction.js | interaction.js | High — complex state threading |
| 7 | Clean up index.html | — | Low |
| 8 | Container structure + toggle button | — | Low |
| 9 | Three.js import map | — | Trivial |

Tasks 1-4 extract logic into `sim.js` incrementally. Each task should leave the app working. Tasks 5-6 are the hardest — they decouple rendering from interaction. Task 7 is cleanup. Tasks 8-9 prepare for the 3D renderer (Plan 2).
