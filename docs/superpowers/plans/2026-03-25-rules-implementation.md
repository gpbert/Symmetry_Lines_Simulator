# Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three remaining UX-facing positional rules: 600mm wall length snapping, envelope angle validation, and void drawing with wall proximity rules.

**Architecture:** All changes are in the single-file `index.html` (~4300 lines). Features are independent and implemented sequentially. The app is vanilla HTML/CSS/JavaScript with Canvas 2D rendering, no build tools.

**Tech Stack:** HTML5 Canvas, vanilla JavaScript, no dependencies.

**Spec:** `docs/superpowers/specs/2026-03-25-rules-implementation-design.md`

---

## File Structure

All changes modify a single file:

- **Modify:** `index.html` — the entire application

Key code sections (line numbers approximate, will shift as edits are made):
- Constants & state: ~lines 652-701
- Undo/redo system: ~lines 796-876
- Wall class: ~lines 911-970
- Envelope detection: ~lines 1336-1455
- Validation engine: ~lines 3034-3257
- Event listeners (mousedown/mouseup/mousemove): ~lines 3330-3700
- Mode buttons & UI: ~lines 3705-4077
- HTML sidebar: ~lines 525-650
- Rules modal: ~lines 4080-4156

---

## Task 1: 600mm Wall Length Snapping — Constants and Validation

**Files:**
- Modify: `index.html:657` (MIN_WALL_LENGTH constant)
- Modify: `index.html:3034-3043` (validateWall function)

- [ ] **Step 1: Update MIN_WALL_LENGTH constant**

Change line 657 from:
```javascript
const MIN_WALL_LENGTH = 400; // mm
```
to:
```javascript
const MIN_WALL_LENGTH = 600; // mm - smallest valid 600mm multiple
const WALL_LENGTH_GRID = 600; // mm - wall lengths must be multiples of this
```

- [ ] **Step 2: Add 600mm multiple validation to validateWall**

In `validateWall()` (~line 3034), after the existing length check, add:
```javascript
// Check wall length is a multiple of 600mm
if (wall.length >= MIN_WALL_LENGTH && wall.length % WALL_LENGTH_GRID !== 0) {
    violations.push({
        type: 'error',
        message: `Wall length (${Math.round(wall.length / 10)}cm) must be a multiple of ${WALL_LENGTH_GRID / 10}cm`
    });
}
```

- [ ] **Step 3: Update the minimum length error message**

The existing check at ~line 3038 says "Minimum: 40cm". It references `MIN_WALL_LENGTH` which is now 600, so the message auto-updates. Verify the message reads correctly: "Wall is too short (Xcm). Minimum: 60cm".

- [ ] **Step 4: Update the Rules Modal**

In the Rules Modal HTML (~line 4101), change:
```html
<li><strong>Minimum Length:</strong> 40 cm</li>
```
to:
```html
<li><strong>Minimum Length:</strong> 60 cm</li>
<li><strong>Length Grid:</strong> Walls must be multiples of 60 cm in length</li>
```

- [ ] **Step 5: Test manually and commit**

Open `index.html` in browser. Test:
1. Try drawing a wall shorter than 600mm — should be rejected
2. Try drawing a 900mm wall — should be flagged by validation as not a 600mm multiple
3. Draw a 600mm wall — should be valid
4. Draw a 1200mm wall — should be valid
5. Run "Validate All" to check existing walls

```bash
git add index.html
git commit -m "feat: add 600mm wall length snapping - validation

Wall lengths must now be multiples of 600mm. MIN_WALL_LENGTH updated
from 400mm to 600mm. Validation engine checks for 600mm multiple."
```

---

## Task 2: 600mm Wall Length Snapping — Drawing Constraint

**Files:**
- Modify: `index.html:3488-3500` (mousemove handler, draw mode)
- Modify: `index.html:3554-3562` (mousedown handler, wall finalization)

- [ ] **Step 1: Add length-snapping helper function**

Add this function near the other coordinate helpers (after `snapToGrid` around line 900):
```javascript
// Snap a wall length to the nearest lower multiple of WALL_LENGTH_GRID
function snapLengthToGrid(startPoint, endPoint) {
    // Calculate raw length along the constrained axis
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;

    if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal wall — snap X distance
        const rawLength = Math.abs(dx);
        const snappedLength = Math.floor(rawLength / WALL_LENGTH_GRID) * WALL_LENGTH_GRID;
        if (snappedLength < MIN_WALL_LENGTH) return endPoint; // Let validation catch it
        const direction = dx > 0 ? 1 : -1;
        return { x: startPoint.x + direction * snappedLength, y: startPoint.y };
    } else {
        // Vertical wall — snap Y distance
        const rawLength = Math.abs(dy);
        const snappedLength = Math.floor(rawLength / WALL_LENGTH_GRID) * WALL_LENGTH_GRID;
        if (snappedLength < MIN_WALL_LENGTH) return endPoint; // Let validation catch it
        const direction = dy > 0 ? 1 : -1;
        return { x: startPoint.x, y: startPoint.y + direction * snappedLength };
    }
}
```

- [ ] **Step 2: Apply length snapping in mousemove (preview)**

In the mousemove handler (~line 3488), replace:
```javascript
if (currentMode === 'draw' && drawingWall) {
    // Constrain to horizontal or vertical only
    const dx = Math.abs(pos.x - drawingWall.x);
    const dy = Math.abs(pos.y - drawingWall.y);

    if (dx > dy) {
        // Horizontal wall
        tempPoint = { x: pos.x, y: drawingWall.y };
    } else {
        // Vertical wall
        tempPoint = { x: drawingWall.x, y: pos.y };
    }
}
```
with:
```javascript
if (currentMode === 'draw' && drawingWall) {
    // Constrain to horizontal or vertical only
    const dx = Math.abs(pos.x - drawingWall.x);
    const dy = Math.abs(pos.y - drawingWall.y);

    let constrained;
    if (dx > dy) {
        constrained = { x: pos.x, y: drawingWall.y };
    } else {
        constrained = { x: drawingWall.x, y: pos.y };
    }

    // Snap length to 600mm grid
    tempPoint = snapLengthToGrid(drawingWall, constrained);
}
```

- [ ] **Step 3: Apply length snapping in mousedown (wall finalization)**

In the mousedown handler (~line 3554), after the horizontal/vertical constraint is applied to `finalPos`, add length snapping before the flip logic:
```javascript
// After: finalPos = { x: drawingWall.x, y: pos.y };
// Add length snapping
finalPos = snapLengthToGrid(drawingWall, finalPos);
```

Find the block (~line 3554-3562):
```javascript
let finalPos = pos;
if (dx > dy) {
    finalPos = { x: pos.x, y: drawingWall.y };
} else {
    finalPos = { x: drawingWall.x, y: pos.y };
}
```
and add after it:
```javascript
// Snap wall length to 600mm grid
finalPos = snapLengthToGrid(drawingWall, finalPos);
```

- [ ] **Step 4: Test manually and commit**

Open `index.html` in browser. Test:
1. Start drawing — preview should snap in 600mm increments (floor behavior, no jumping ahead)
2. Drag to ~500mm — preview should show 0 length (too short)
3. Drag to ~700mm — preview should snap to 600mm
4. Drag to ~1100mm — preview should snap to 600mm (floors, not rounds)
5. Drag to ~1250mm — preview should snap to 1200mm
6. Final placement matches preview

```bash
git add index.html
git commit -m "feat: add 600mm wall length snapping - drawing constraint

Preview and placement now floor wall lengths to nearest 600mm multiple.
Walls grow in 600mm increments as cursor moves."
```

---

## Task 3: 600mm Wall Length Snapping — Stretching Constraint

**Files:**
- Modify: `index.html:3434-3465` (mousemove handler, stretching)
- Modify: `index.html:3361-3392` (mouseup handler, stretch validation)

- [ ] **Step 1: Apply 600mm snapping during wall stretching**

In the mousemove handler for stretching (~line 3434), after the endpoint position is calculated (the `newPoint` variable), add length snapping. After the `if (isHorizontal) { ... } else { ... }` block that sets `newPoint`, add:

```javascript
// Snap stretched wall length to 600mm grid
const otherPoint = stretchingEndpoint === 'A'
    ? { x: stretchingWall.pointB.x, y: stretchingWall.pointB.y }
    : { x: stretchingWall.pointA.x, y: stretchingWall.pointA.y };

// Calculate length and snap
const stretchDx = Math.abs(newPoint.x - otherPoint.x);
const stretchDy = Math.abs(newPoint.y - otherPoint.y);
const rawLength = Math.max(stretchDx, stretchDy);
const snappedLength = Math.floor(rawLength / WALL_LENGTH_GRID) * WALL_LENGTH_GRID;

if (snappedLength >= MIN_WALL_LENGTH) {
    if (isHorizontal) {
        const dir = newPoint.x > otherPoint.x ? 1 : -1;
        newPoint.x = otherPoint.x + dir * snappedLength;
    } else {
        const dir = newPoint.y > otherPoint.y ? 1 : -1;
        newPoint.y = otherPoint.y + dir * snappedLength;
    }
}
```

- [ ] **Step 2: Update the mouseup stretch validation message**

In the mouseup handler (~line 3363), the MIN_WALL_LENGTH check message already references the constant:
```javascript
showToast(`Wall is too short. Minimum length is ${MIN_WALL_LENGTH / 10}cm`, 'error');
```
This will now correctly say "60cm". No change needed here.

- [ ] **Step 3: Test manually and commit**

Open `index.html` in browser. Test:
1. Draw a 1200mm wall
2. Select it, grab endpoint handle
3. Stretch — should snap in 600mm increments
4. Try to stretch below 600mm — should revert on release
5. Stretch to 1800mm — should work

```bash
git add index.html
git commit -m "feat: add 600mm wall length snapping - stretching constraint

Wall stretching now snaps to 600mm length increments, matching
the drawing behavior."
```

---

## Task 4: Envelope Angle Validation

**Files:**
- Modify: `index.html:3242-3257` (validateAllWalls function)
- Modify: `index.html:1336-1455` (envelope detection, to expose wall indices)

- [ ] **Step 1: Expose envelope wall indices from detection**

The current `detectBuildingEnvelopes` returns `loops` (arrays of polygon points) but not the wall indices involved. The `updateBuildingEnvelopes` function needs modification. First, check the current `updateBuildingEnvelopes` function.

Find `updateBuildingEnvelopes` and modify it to also store wall indices per envelope. The `findLoop` function already returns `{ path, indices }` — make sure `updateBuildingEnvelopes` stores the indices.

Find where envelopes are stored (around the `updateBuildingEnvelopes` function) and ensure each envelope object includes a `wallIndices` array (indices into the floor's wall subset). This data will be used by the angle validator.

Modify the `buildingEnvelopes` data structure. Each envelope should become:
```javascript
{ floorId, polygon: [{x, y}], wallIndices: [globalWallIndices], timestamp }
```

Update `detectBuildingEnvelopes` to return both paths and wall indices, and update `updateBuildingEnvelopes` to store them.

- [ ] **Step 2: Add envelope angle validation function**

Add this function near `validateAllWalls` (~line 3242):

```javascript
function validateEnvelopeAngles() {
    const violations = [];

    buildingEnvelopes.forEach(envelope => {
        const polygon = envelope.polygon;
        if (!polygon || polygon.length < 3) return;

        for (let i = 0; i < polygon.length; i++) {
            const prev = polygon[(i - 1 + polygon.length) % polygon.length];
            const curr = polygon[i];
            const next = polygon[(i + 1) % polygon.length];

            // Vector from prev to curr
            const v1x = curr.x - prev.x;
            const v1y = curr.y - prev.y;

            // Vector from curr to next
            const v2x = next.x - curr.x;
            const v2y = next.y - curr.y;

            // Calculate angle using cross product and dot product
            const cross = v1x * v2y - v1y * v2x;
            const dot = v1x * v2x + v1y * v2y;
            let angle = Math.atan2(cross, dot) * (180 / Math.PI);

            // Normalize to 0-360
            if (angle < 0) angle += 360;

            // Check if angle is approximately 90 or 270 degrees (tolerance of 1 degree)
            const is90 = Math.abs(angle - 90) < 1;
            const is270 = Math.abs(angle - 270) < 1;

            if (!is90 && !is270) {
                violations.push({
                    point: curr,
                    angle: angle,
                    floorId: envelope.floorId,
                    message: `Envelope connection must be 90 or 270 degrees (found ${Math.round(angle)}°)`
                });
            }
        }
    });

    return violations;
}
```

- [ ] **Step 3: Call envelope angle validation from validateAllWalls**

In `validateAllWalls` (~line 3242), add after the wall loop:
```javascript
// Validate envelope angles (Rule 4)
const envelopeViolations = validateEnvelopeAngles();
envelopeViolations.forEach(v => {
    allViolations.push({
        wallIndex: -1, // Envelope-level violation, not wall-specific
        violations: [{ type: 'error', message: v.message }],
        point: v.point
    });
});
```

- [ ] **Step 4: Store envelope angle violations for rendering**

Add a global variable near the other state (~line 700):
```javascript
let envelopeAngleViolations = []; // [{point, angle, floorId, message}]
```

Update `validateAllWalls` to store the violations:
```javascript
envelopeAngleViolations = validateEnvelopeAngles();
```

- [ ] **Step 5: Render invalid envelope corners**

In the `draw()` function, after envelope polygons are drawn but before walls, add:
```javascript
// Draw invalid envelope corner indicators
envelopeAngleViolations
    .filter(v => v.floorId === currentFloorId)
    .forEach(v => {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
        ctx.beginPath();
        ctx.arc(mmToPx(v.point.x), mmToPx(v.point.y), 8 / zoomLevel, 0, Math.PI * 2);
        ctx.fill();
    });
```

Find the appropriate location in `draw()` — look for where envelope polygons are rendered and add this after that block.

- [ ] **Step 6: Test manually and commit**

Since all walls are axis-locked (horizontal/vertical), all envelope angles should be 90° or 270° and no violations should appear. Test:
1. Draw a closed rectangle of 4 walls — should form an envelope with no angle violations
2. Draw an L-shape with 6 walls — should be fine
3. Run Validate All — no angle errors

This validation is a safety net for correctness. It will catch issues if the drawing system ever allows non-axis-aligned walls.

```bash
git add index.html
git commit -m "feat: add envelope angle validation (Rule 4)

Validate that all building envelope corners are exactly 90 or 270
degrees. Currently a safety net since walls are axis-locked."
```

---

## Task 5: Void Data Model and State

**Files:**
- Modify: `index.html:661-701` (state section)
- Modify: `index.html:796-876` (undo/redo system)

- [ ] **Step 1: Add void state variables**

After the `let walls = [];` line (~line 662), add:
```javascript
let voids = []; // Array of {id, floorId, x, y, width, height}
let selectedVoid = null; // Currently selected void (only one at a time)
let drawingVoid = null; // Void being drawn {startX, startY}
let resizingVoid = null; // {void, handle} — handle is 'n','s','e','w','ne','nw','se','sw'
let originalVoidState = null; // For undo during resize
```

Add void grid constant near the other constants (~line 652):
```javascript
const VOID_GRID = 600; // mm - voids snap to 600mm grid
const MIN_VOID_SIZE = 600; // mm - minimum void dimension
```

- [ ] **Step 2: Add void ID generator**

Add a simple ID generator near the state variables:
```javascript
let nextVoidId = 1;
function generateVoidId() {
    return 'void-' + (nextVoidId++);
}
```

- [ ] **Step 3: Extend undo/redo for voids**

Modify `addToHistory` (~line 857) to accept an operation type. Replace the function:
```javascript
function addToHistory(addedItems = [], objectType = 'wall') {
    const operation = {
        objectType: objectType,
        items: addedItems,
        timestamp: Date.now()
    };

    if (objectType === 'wall') {
        operation.wallIndices = addedItems.map(w => walls.indexOf(w));
        operation.walls = addedItems; // Keep backward compat
    } else if (objectType === 'void') {
        operation.voidIndices = addedItems.map(v => voids.indexOf(v));
        operation.voids = addedItems;
    }

    history.push(operation);
    redoHistory = [];

    if (history.length > MAX_HISTORY) {
        history.shift();
    }
}
```

- [ ] **Step 4: Update undo() to handle voids**

Modify `undo()` (~line 797). Replace the wall-removal logic:
```javascript
function undo() {
    if (history.length === 0) {
        showToast('Nothing to undo', 'info', 2000);
        return;
    }

    const lastOperation = history.pop();

    if (lastOperation.objectType === 'void') {
        // Remove the voids from this operation
        lastOperation.voids.forEach(v => {
            const idx = voids.indexOf(v);
            if (idx !== -1) voids.splice(idx, 1);
        });
        selectedVoid = null;
    } else {
        // Remove the walls from this operation (existing logic)
        lastOperation.wallIndices.forEach(index => {
            const wallIndex = walls.indexOf(lastOperation.walls[lastOperation.wallIndices.indexOf(index)]);
            if (wallIndex !== -1) {
                walls.splice(wallIndex, 1);
            }
        });
        selectedWalls = [];
    }

    redoHistory.push(lastOperation);
    if (redoHistory.length > MAX_HISTORY) {
        redoHistory.shift();
    }

    updateBuildingEnvelopes();
    updateUI();
    draw();
    showToast('Undo', 'info', 2000);
}
```

- [ ] **Step 5: Update redo() to handle voids**

Modify `redo()` (~line 831):
```javascript
function redo() {
    if (redoHistory.length === 0) {
        showToast('Nothing to redo', 'info', 2000);
        return;
    }

    const operation = redoHistory.pop();

    if (operation.objectType === 'void') {
        operation.voids.forEach(v => voids.push(v));
        addToHistory(operation.voids, 'void');
    } else {
        operation.walls.forEach(wall => walls.push(wall));
        addToHistory(operation.walls, 'wall');
    }

    selectedWalls = [];
    selectedVoid = null;
    updateBuildingEnvelopes();
    updateUI();
    draw();
    showToast('Redo', 'info', 2000);
}
```

- [ ] **Step 6: Add void deletion undo support**

Add a function for tracking void deletions (different from creation — we need to re-add on undo):
```javascript
function addVoidDeletionToHistory(deletedVoid) {
    const operation = {
        objectType: 'void-delete',
        voidData: {
            id: deletedVoid.id,
            floorId: deletedVoid.floorId,
            x: deletedVoid.x,
            y: deletedVoid.y,
            width: deletedVoid.width,
            height: deletedVoid.height
        },
        timestamp: Date.now()
    };

    history.push(operation);
    redoHistory = [];

    if (history.length > MAX_HISTORY) {
        history.shift();
    }
}
```

Then update `undo()` to handle `void-delete`:
```javascript
// Add this case in undo():
if (lastOperation.objectType === 'void-delete') {
    // Re-add the deleted void
    const vd = lastOperation.voidData;
    voids.push({ id: vd.id, floorId: vd.floorId, x: vd.x, y: vd.y, width: vd.width, height: vd.height });
    selectedVoid = null;
}
```

And in `redo()`:
```javascript
// Add this case in redo():
if (operation.objectType === 'void-delete') {
    // Re-delete the void
    const idx = voids.findIndex(v => v.id === operation.voidData.id);
    if (idx !== -1) voids.splice(idx, 1);
    addVoidDeletionToHistory(operation.voidData); // Not quite right — need to push directly
}
```

Actually, simplify: for void-delete redo, just push the operation back to history directly instead of calling addVoidDeletionToHistory (which clears redo). Handle this inline in redo().

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add void data model, state, and undo/redo support

Introduces voids[] array, void constants (600mm grid, 600mm min size),
and extends the undo/redo system to handle void create/delete operations."
```

---

## Task 6: Void Mode — UI and Drawing

**Files:**
- Modify: `index.html:533-558` (toolbar HTML)
- Modify: `index.html:3705-3735` (mode button event listeners)
- Modify: `index.html:4053-4068` (updateModeUI function)

- [ ] **Step 1: Add Void button to toolbar**

After the Flip Wall button (~line 552-557), add:
```html
<button id="drawVoidBtn" class="btn btn-secondary">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="11" height="11" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
    </svg>
    Draw Void
</button>
```

- [ ] **Step 2: Add mode button event listener**

After the delete button listener (~line 3725), add:
```javascript
document.getElementById('drawVoidBtn').addEventListener('click', () => {
    currentMode = 'void';
    drawingWall = null;
    tempPoint = null;
    drawingVoid = null;
    selectedWalls = [];
    selectedVoid = null;
    clearDrawingToast();
    updateModeUI();
    draw();
});
```

- [ ] **Step 3: Update currentMode declaration and updateModeUI**

Update the `currentMode` comment (~line 664):
```javascript
let currentMode = 'draw'; // 'draw', 'select', 'delete', 'void'
```

In `updateModeUI` (~line 4053), add the void case:
```javascript
} else if (currentMode === 'void') {
    document.getElementById('drawVoidBtn').classList.add('active');
    canvas.style.cursor = 'crosshair';
}
```

- [ ] **Step 4: Add void snapping helper**

Add near the other coordinate helpers:
```javascript
function snapToVoidGrid(value) {
    return Math.round(value / VOID_GRID) * VOID_GRID;
}
```

- [ ] **Step 5: Add void drawing in mousedown handler**

In the mousedown handler (~line 3531), add a new `else if` block for void mode, after the delete mode block:
```javascript
else if (currentMode === 'void') {
    if (!drawingVoid) {
        // Start drawing void
        const snappedX = snapToVoidGrid(pos.x);
        const snappedY = snapToVoidGrid(pos.y);
        drawingVoid = { startX: snappedX, startY: snappedY };
    } else {
        // Finish drawing void
        const snappedX = snapToVoidGrid(pos.x);
        const snappedY = snapToVoidGrid(pos.y);

        const x = Math.min(drawingVoid.startX, snappedX);
        const y = Math.min(drawingVoid.startY, snappedY);
        const width = Math.abs(snappedX - drawingVoid.startX);
        const height = Math.abs(snappedY - drawingVoid.startY);

        if (width < MIN_VOID_SIZE || height < MIN_VOID_SIZE) {
            showToast(`Void is too small. Minimum size: ${MIN_VOID_SIZE / 10}cm x ${MIN_VOID_SIZE / 10}cm`, 'error');
            drawingVoid = null;
            draw();
            return;
        }

        // Check for overlap with existing voids
        const overlaps = voids.some(v =>
            v.floorId === currentFloorId &&
            x < v.x + v.width && x + width > v.x &&
            y < v.y + v.height && y + height > v.y
        );

        if (overlaps) {
            showToast('Voids cannot overlap', 'error');
            drawingVoid = null;
            draw();
            return;
        }

        const newVoid = {
            id: generateVoidId(),
            floorId: currentFloorId,
            x: x,
            y: y,
            width: width,
            height: height
        };

        voids.push(newVoid);
        addToHistory([newVoid], 'void');
        drawingVoid = null;
        draw();
        showToast('Void placed', 'info', 2000);
    }
}
```

- [ ] **Step 6: Add void preview in mousemove handler**

In the mousemove handler, add void preview. After the wall drawing block (~line 3500), add:
```javascript
if (currentMode === 'void' && drawingVoid) {
    // Update preview — tempPoint reused for void preview endpoint
    tempPoint = {
        x: snapToVoidGrid(pos.x),
        y: snapToVoidGrid(pos.y)
    };
}
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add void drawing mode with 600mm grid snapping

New 'Draw Void' mode in toolbar. Click-drag to define rectangular
voids that snap to 600mm grid. Overlap detection prevents overlapping
voids. Minimum size 600x600mm."
```

---

## Task 7: Void Rendering

**Files:**
- Modify: `index.html` — inside the `draw()` function

- [ ] **Step 1: Add void rendering function**

Add this function before the `draw()` function:
```javascript
function drawVoid(v, opacity = 1.0, isGhost = false) {
    const x = mmToPx(v.x);
    const y = mmToPx(v.y);
    const w = mmToPx(v.width);
    const h = mmToPx(v.height);

    ctx.save();

    if (isGhost) {
        // Ghost voids from other floors: outline only
        ctx.strokeStyle = `rgba(220, 38, 38, ${opacity * 0.5})`;
        ctx.lineWidth = 1 / zoomLevel;
        ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
        ctx.strokeRect(x, y, w, h);
    } else {
        // Fill with diagonal hatch pattern
        ctx.fillStyle = `rgba(220, 38, 38, ${opacity * 0.08})`;
        ctx.fillRect(x, y, w, h);

        // Draw diagonal hatch lines
        ctx.strokeStyle = `rgba(220, 38, 38, ${opacity * 0.3})`;
        ctx.lineWidth = 1 / zoomLevel;
        ctx.beginPath();
        const step = 12 / zoomLevel;
        // Clip to void rectangle
        ctx.save();
        ctx.rect(x, y, w, h);
        ctx.clip();
        for (let i = -Math.max(w, h); i < Math.max(w, h) * 2; i += step) {
            ctx.moveTo(x + i, y);
            ctx.lineTo(x + i + Math.max(w, h), y + Math.max(w, h));
        }
        ctx.stroke();
        ctx.restore();

        // Border
        const isSelected = selectedVoid === v;
        ctx.strokeStyle = isSelected
            ? 'rgba(37, 99, 235, 0.9)'
            : `rgba(220, 38, 38, ${opacity * 0.6})`;
        ctx.lineWidth = isSelected ? 2 / zoomLevel : 1.5 / zoomLevel;
        ctx.setLineDash(isSelected ? [6 / zoomLevel, 3 / zoomLevel] : []);
        ctx.strokeRect(x, y, w, h);
    }

    ctx.restore();
}
```

- [ ] **Step 2: Add void rendering to draw() function**

In the `draw()` function, find where walls from other floors are drawn (the adjacent floor rendering section). After that section, add rendering for voids from other floors:
```javascript
// Draw voids from other floors (ghost)
if (document.getElementById('showOtherFloors').checked ||
    document.getElementById('showLevelsAbove').checked) {
    voids.forEach(v => {
        if (v.floorId !== currentFloorId) {
            const floorDiff = Math.abs(v.floorId - currentFloorId);
            if (floorDiff <= 3) {
                const ghostOpacity = floorDiff === 1 ? 0.4 : floorDiff === 2 ? 0.25 : 0.15;
                drawVoid(v, ghostOpacity, true);
            }
        }
    });
}
```

After the current-floor walls are drawn, add current-floor void rendering:
```javascript
// Draw current floor voids
voids.filter(v => v.floorId === currentFloorId).forEach(v => {
    drawVoid(v);
});
```

- [ ] **Step 3: Add void preview rendering**

In the `draw()` function, in the section where wall previews are drawn, add void preview:
```javascript
// Draw void preview
if (currentMode === 'void' && drawingVoid && tempPoint) {
    const previewX = Math.min(drawingVoid.startX, tempPoint.x);
    const previewY = Math.min(drawingVoid.startY, tempPoint.y);
    const previewW = Math.abs(tempPoint.x - drawingVoid.startX);
    const previewH = Math.abs(tempPoint.y - drawingVoid.startY);

    const tooSmall = previewW < MIN_VOID_SIZE || previewH < MIN_VOID_SIZE;
    const overlaps = voids.some(v =>
        v.floorId === currentFloorId &&
        previewX < v.x + v.width && previewX + previewW > v.x &&
        previewY < v.y + v.height && previewY + previewH > v.y
    );
    const isInvalid = tooSmall || overlaps;

    ctx.save();
    const px = mmToPx(previewX);
    const py = mmToPx(previewY);
    const pw = mmToPx(previewW);
    const ph = mmToPx(previewH);

    ctx.fillStyle = isInvalid ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = isInvalid ? 'rgba(220, 38, 38, 0.6)' : 'rgba(34, 197, 94, 0.6)';
    ctx.lineWidth = 1.5 / zoomLevel;
    ctx.setLineDash([6 / zoomLevel, 3 / zoomLevel]);
    ctx.strokeRect(px, py, pw, ph);
    ctx.restore();

    // Show dimensions
    if (previewW > 0 && previewH > 0) {
        ctx.fillStyle = isInvalid ? '#dc2626' : '#16a34a';
        ctx.font = `${11 / zoomLevel}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
            `${Math.round(previewW / 10)}cm x ${Math.round(previewH / 10)}cm`,
            px + pw / 2,
            py + ph / 2
        );
    }
}
```

- [ ] **Step 4: Test manually and commit**

Open `index.html`. Test:
1. Switch to Void mode
2. Click-drag to draw a void — should see green preview with dimensions
3. Preview turns red if < 600x600mm
4. Placed voids show with red hatching
5. Add another floor, draw walls — voids from other floors show as ghost outlines

```bash
git add index.html
git commit -m "feat: add void rendering with hatch pattern and preview

Voids render with diagonal hatch pattern and red border. Selected
voids show blue dashed border. Preview shows green/red with
dimensions. Ghost voids from adjacent floors show as dashed outlines."
```

---

## Task 8: Void Selection and Deletion

**Files:**
- Modify: `index.html` — mousedown handler (select mode, delete mode)

- [ ] **Step 1: Add void hit-testing function**

Add near the other hit-testing helpers:
```javascript
function getVoidAtPoint(x, y, floorId) {
    // Search in reverse order (newest on top)
    for (let i = voids.length - 1; i >= 0; i--) {
        const v = voids[i];
        if (v.floorId !== floorId) continue;
        if (x >= v.x && x <= v.x + v.width && y >= v.y && y <= v.y + v.height) {
            return v;
        }
    }
    return null;
}
```

- [ ] **Step 2: Add void selection in select mode**

In the mousedown select mode handler (~line 3623), after the wall selection logic, modify the "clicked on empty space" branch. The logic should be: try to select a wall first (walls take priority), if no wall found, try to select a void, if neither, clear selection.

Replace the empty-space branch:
```javascript
} else {
    // No wall clicked — check for void
    const clickedVoid = getVoidAtPoint(pos.x, pos.y, currentFloorId);
    if (clickedVoid) {
        selectedWalls = [];
        selectedVoid = clickedVoid;
    } else {
        // Clicked on empty space - clear selection
        selectedWalls = [];
        selectedVoid = null;
    }
}
```

Also, when a wall IS selected, clear void selection:
At the start of the wall selection branches (single select, shift select), add:
```javascript
selectedVoid = null;
```

- [ ] **Step 3: Add void deletion in delete mode**

In the mousedown delete mode handler (~line 3681), after checking for wall click, add void deletion:
```javascript
if (!clickedWall) {
    // No wall — check for void
    const clickedVoid = getVoidAtPoint(pos.x, pos.y, currentFloorId);
    if (clickedVoid) {
        const idx = voids.indexOf(clickedVoid);
        if (idx !== -1) {
            voids.splice(idx, 1);
            addVoidDeletionToHistory(clickedVoid);
            showToast('Void deleted', 'info', 2000);
            draw();
        }
    }
}
```

- [ ] **Step 4: Clear void drawing state on mode change**

In each mode button listener (draw, select, delete), add:
```javascript
drawingVoid = null;
selectedVoid = null;
```

- [ ] **Step 5: Test manually and commit**

Test:
1. Draw a void, switch to Select mode, click on it — should show selected (blue dashed border)
2. Click a wall near the void — wall selected, void deselected
3. Click empty space — everything deselected
4. Switch to Delete mode, click a void — deleted
5. Undo — void reappears
6. Redo — void deleted again

```bash
git add index.html
git commit -m "feat: add void selection and deletion

Voids can be selected in Select mode and deleted in Delete mode.
Walls take priority over voids for selection. Full undo/redo
support for void deletion."
```

---

## Task 9: Void Resizing

**Files:**
- Modify: `index.html` — draw function (resize handles), mousemove/mousedown/mouseup handlers

- [ ] **Step 1: Add resize handle rendering for selected voids**

In the `draw()` function, after void rendering, add resize handles for the selected void:
```javascript
// Draw resize handles on selected void
if (selectedVoid && selectedVoid.floorId === currentFloorId) {
    const v = selectedVoid;
    const handleSize = 6 / zoomLevel;
    ctx.fillStyle = '#2563eb';

    const handles = [
        { x: v.x, y: v.y, cursor: 'nw' },
        { x: v.x + v.width / 2, y: v.y, cursor: 'n' },
        { x: v.x + v.width, y: v.y, cursor: 'ne' },
        { x: v.x + v.width, y: v.y + v.height / 2, cursor: 'e' },
        { x: v.x + v.width, y: v.y + v.height, cursor: 'se' },
        { x: v.x + v.width / 2, y: v.y + v.height, cursor: 's' },
        { x: v.x, y: v.y + v.height, cursor: 'sw' },
        { x: v.x, y: v.y + v.height / 2, cursor: 'w' },
    ];

    handles.forEach(h => {
        ctx.beginPath();
        ctx.rect(
            mmToPx(h.x) - handleSize / 2,
            mmToPx(h.y) - handleSize / 2,
            handleSize,
            handleSize
        );
        ctx.fill();
    });
}
```

- [ ] **Step 2: Add resize handle hit testing**

Add a function to detect which handle was clicked:
```javascript
function getVoidResizeHandle(pos, v) {
    if (!v) return null;
    const tolerance = 150; // mm — generous hit area for handles

    const handles = [
        { x: v.x, y: v.y, handle: 'nw' },
        { x: v.x + v.width / 2, y: v.y, handle: 'n' },
        { x: v.x + v.width, y: v.y, handle: 'ne' },
        { x: v.x + v.width, y: v.y + v.height / 2, handle: 'e' },
        { x: v.x + v.width, y: v.y + v.height, handle: 'se' },
        { x: v.x + v.width / 2, y: v.y + v.height, handle: 's' },
        { x: v.x, y: v.y + v.height, handle: 'sw' },
        { x: v.x, y: v.y + v.height / 2, handle: 'w' },
    ];

    for (const h of handles) {
        const dist = Math.sqrt(Math.pow(pos.x - h.x, 2) + Math.pow(pos.y - h.y, 2));
        if (dist < tolerance) return h.handle;
    }
    return null;
}
```

- [ ] **Step 3: Start resize on mousedown in select mode**

In the select mode mousedown, before the wall selection logic, check for void resize handles:
```javascript
// Check for void resize handle first
if (selectedVoid) {
    const handle = getVoidResizeHandle(pos, selectedVoid);
    if (handle) {
        resizingVoid = { void: selectedVoid, handle: handle };
        originalVoidState = { x: selectedVoid.x, y: selectedVoid.y, width: selectedVoid.width, height: selectedVoid.height };
        canvas.style.cursor = handle + '-resize';
        return; // Don't fall through to wall selection
    }
}
```

- [ ] **Step 4: Handle resize in mousemove**

In the mousemove handler, before the wall stretching logic, add void resize handling:
```javascript
if (currentMode === 'select' && resizingVoid) {
    const v = resizingVoid.void;
    const h = resizingVoid.handle;
    const snappedX = snapToVoidGrid(pos.x);
    const snappedY = snapToVoidGrid(pos.y);

    let newX = v.x, newY = v.y, newW = v.width, newH = v.height;

    if (h.includes('w')) { newX = snappedX; newW = originalVoidState.x + originalVoidState.width - snappedX; }
    if (h.includes('e')) { newW = snappedX - v.x; }
    if (h.includes('n')) { newY = snappedY; newH = originalVoidState.y + originalVoidState.height - snappedY; }
    if (h.includes('s')) { newH = snappedY - v.y; }

    // For edge handles, only update the relevant axis
    if (h === 'n' || h === 's') { newX = v.x; newW = v.width; }
    if (h === 'e' || h === 'w') { newY = v.y; newH = v.height; }

    // Enforce minimum size
    if (newW >= MIN_VOID_SIZE && newH >= MIN_VOID_SIZE) {
        v.x = newX;
        v.y = newY;
        v.width = newW;
        v.height = newH;
    }

    draw();
    return;
}
```

- [ ] **Step 5: Finish resize on mouseup**

In the mouseup handler, add:
```javascript
if (resizingVoid) {
    const v = resizingVoid.void;

    // Check for overlap with other voids
    const overlaps = voids.some(other =>
        other !== v &&
        other.floorId === v.floorId &&
        v.x < other.x + other.width && v.x + v.width > other.x &&
        v.y < other.y + other.height && v.y + v.height > other.y
    );

    if (overlaps) {
        // Revert
        v.x = originalVoidState.x;
        v.y = originalVoidState.y;
        v.width = originalVoidState.width;
        v.height = originalVoidState.height;
        showToast('Resize would overlap another void', 'error');
    } else {
        // Save resize as a void-resize operation for undo
        // For simplicity, store old and new state
        const operation = {
            objectType: 'void-resize',
            voidRef: v,
            oldState: { ...originalVoidState },
            newState: { x: v.x, y: v.y, width: v.width, height: v.height },
            timestamp: Date.now()
        };
        history.push(operation);
        redoHistory = [];
    }

    resizingVoid = null;
    originalVoidState = null;
    canvas.style.cursor = 'pointer';
    draw();
}
```

- [ ] **Step 6: Add void-resize to undo/redo**

In `undo()`, add:
```javascript
if (lastOperation.objectType === 'void-resize') {
    const v = lastOperation.voidRef;
    v.x = lastOperation.oldState.x;
    v.y = lastOperation.oldState.y;
    v.width = lastOperation.oldState.width;
    v.height = lastOperation.oldState.height;
    selectedVoid = null;
}
```

In `redo()`, add:
```javascript
if (operation.objectType === 'void-resize') {
    const v = operation.voidRef;
    v.x = operation.newState.x;
    v.y = operation.newState.y;
    v.width = operation.newState.width;
    v.height = operation.newState.height;
    history.push(operation);
}
```

- [ ] **Step 7: Test manually and commit**

Test:
1. Draw a void, select it — 8 blue handles appear
2. Drag a corner handle — void resizes on 600mm grid
3. Drag an edge handle — only one axis moves
4. Try to resize below 600mm — blocked
5. Try to resize into another void — reverts with error
6. Undo resize — reverts to previous size
7. Redo — resize reapplied

```bash
git add index.html
git commit -m "feat: add void resizing with 600mm grid constraints

Selected voids show 8 resize handles (corners + edges). Drag to
resize, constrained to 600mm grid. Minimum 600x600mm enforced.
Overlap detection prevents invalid resizes. Full undo/redo."
```

---

## Task 10: Void Wall Proximity Validation (Rule 7)

**Files:**
- Modify: `index.html` — validation section, draw function

- [ ] **Step 1: Add function to determine if a wall is in an envelope**

Add a helper that checks if a wall participates in any building envelope:
```javascript
function isWallInEnvelope(wall) {
    const wallIdx = walls.indexOf(wall);
    return buildingEnvelopes.some(env =>
        env.wallIndices && env.wallIndices.includes(wallIdx)
    );
}
```

Note: This depends on Task 4's change to store `wallIndices` in envelopes. If that data isn't available, fall back to checking if the wall's endpoints lie on any envelope polygon edges.

- [ ] **Step 2: Add void-wall proximity validation function**

```javascript
function validateVoidWallProximity(v) {
    const violations = [];
    const floorWalls = walls.filter(w => w.floorId === v.floorId);

    floorWalls.forEach(wall => {
        // Check if void is adjacent to this wall
        // Get wall faces
        const internalA = wall.pointA;
        const internalB = wall.pointB;
        const external = wall.getExternalFacePoints();

        // Check if void rectangle edge touches or overlaps the wall's column face (internal)
        // or the non-column face (external)
        const isInEnvelope = isWallInEnvelope(wall);

        // Determine which face the void is adjacent to
        // A void is "adjacent" if its edge is within wall thickness distance of a wall face
        // and overlaps the wall's length extent

        // Wall axis extent (min/max along wall direction)
        const wallMinX = Math.min(wall.pointA.x, wall.pointB.x);
        const wallMaxX = Math.max(wall.pointA.x, wall.pointB.x);
        const wallMinY = Math.min(wall.pointA.y, wall.pointB.y);
        const wallMaxY = Math.max(wall.pointA.y, wall.pointB.y);

        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);

        // Check overlap along wall axis
        let overlapAlongAxis = false;
        if (isHorizontal) {
            overlapAlongAxis = v.x < wallMaxX && v.x + v.width > wallMinX;
        } else {
            overlapAlongAxis = v.y < wallMaxY && v.y + v.height > wallMinY;
        }

        if (!overlapAlongAxis) return; // Void doesn't extend along this wall

        // Determine which face the void touches
        // Internal face (column side) = pointA/pointB line
        // External face (non-column side) = offset by n * thickness

        const adjacencyTolerance = 10; // mm
        let touchesInternalFace = false;
        let touchesExternalFace = false;

        if (isHorizontal) {
            const internalY = wall.pointA.y;
            const externalY = wall.pointA.y + wall.n.y * wall.thickness;

            // Check if void bottom edge touches internal face or void top edge
            touchesInternalFace =
                Math.abs(v.y + v.height - internalY) < adjacencyTolerance ||
                Math.abs(v.y - internalY) < adjacencyTolerance;
            touchesExternalFace =
                Math.abs(v.y + v.height - externalY) < adjacencyTolerance ||
                Math.abs(v.y - externalY) < adjacencyTolerance;
        } else {
            const internalX = wall.pointA.x;
            const externalX = wall.pointA.x + wall.n.x * wall.thickness;

            touchesInternalFace =
                Math.abs(v.x + v.width - internalX) < adjacencyTolerance ||
                Math.abs(v.x - internalX) < adjacencyTolerance;
            touchesExternalFace =
                Math.abs(v.x + v.width - externalX) < adjacencyTolerance ||
                Math.abs(v.x - externalX) < adjacencyTolerance;
        }

        if (!touchesInternalFace && !touchesExternalFace) return;

        if (isInEnvelope) {
            // External wall: void must be on column face (internal face)
            if (touchesExternalFace) {
                violations.push({
                    type: 'error',
                    message: 'Void must be on the column face of external walls',
                    wallIndex: walls.indexOf(wall)
                });
            }
        } else {
            // Internal wall: void must be on non-column face (external face)
            if (touchesInternalFace) {
                violations.push({
                    type: 'error',
                    message: 'Void must be on the non-column face of internal walls',
                    wallIndex: walls.indexOf(wall)
                });
            }
        }
    });

    return violations;
}
```

- [ ] **Step 3: Add void validation to the validation pipeline**

In `validateAllWalls`, after the wall validation loop, add:
```javascript
// Validate void-wall proximity (Rule 7)
voids.forEach((v, idx) => {
    const voidViolations = validateVoidWallProximity(v);
    if (voidViolations.length > 0) {
        allViolations.push({
            voidIndex: idx,
            violations: voidViolations
        });
    }
});
```

- [ ] **Step 4: Show void proximity restricted zones during void drawing**

In the `draw()` function, when in void mode, render restricted face zones on walls:
```javascript
// Show void-restricted zones when in void mode
if (currentMode === 'void') {
    const floorWalls = walls.filter(w => w.floorId === currentFloorId);
    floorWalls.forEach(wall => {
        const isInEnvelope = isWallInEnvelope(wall);
        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);

        // Determine the restricted face
        // External walls: non-column face (external) is restricted
        // Internal walls: column face (internal) is restricted
        const restrictedNormalDir = isInEnvelope ? 1 : -1;
        // For internal walls, restricted is the internal face (normal direction * -1 = toward columns)
        // For external walls, restricted is the external face (normal direction * 1 = away from columns)

        const faceOffset = isInEnvelope ? wall.thickness : 0;
        const zoneDepth = VOID_GRID; // Extend one grid cell out

        ctx.save();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.08)'; // Purple tint

        const ax = wall.pointA.x + wall.n.x * faceOffset;
        const ay = wall.pointA.y + wall.n.y * faceOffset;
        const bx = wall.pointB.x + wall.n.x * faceOffset;
        const by = wall.pointB.y + wall.n.y * faceOffset;

        const nx = wall.n.x * (isInEnvelope ? 1 : -1);
        const ny = wall.n.y * (isInEnvelope ? 1 : -1);

        ctx.beginPath();
        ctx.moveTo(mmToPx(ax), mmToPx(ay));
        ctx.lineTo(mmToPx(bx), mmToPx(by));
        ctx.lineTo(mmToPx(bx + nx * zoneDepth), mmToPx(by + ny * zoneDepth));
        ctx.lineTo(mmToPx(ax + nx * zoneDepth), mmToPx(ay + ny * zoneDepth));
        ctx.closePath();
        ctx.fill();

        // Hatch pattern
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)';
        ctx.lineWidth = 1 / zoomLevel;
        const step = 10 / zoomLevel;
        ctx.beginPath();
        ctx.save();
        ctx.clip();
        const minPx = Math.min(mmToPx(ax), mmToPx(bx), mmToPx(ax + nx * zoneDepth), mmToPx(bx + nx * zoneDepth));
        const maxPx = Math.max(mmToPx(ax), mmToPx(bx), mmToPx(ax + nx * zoneDepth), mmToPx(bx + nx * zoneDepth));
        const minPy = Math.min(mmToPx(ay), mmToPx(by), mmToPx(ay + ny * zoneDepth), mmToPx(by + ny * zoneDepth));
        const maxPy = Math.max(mmToPx(ay), mmToPx(by), mmToPx(ay + ny * zoneDepth), mmToPx(by + ny * zoneDepth));
        for (let i = minPx - (maxPy - minPy); i < maxPx + (maxPy - minPy); i += step) {
            ctx.moveTo(i, minPy);
            ctx.lineTo(i + (maxPy - minPy), maxPy);
        }
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    });
}
```

- [ ] **Step 5: Add void validation check during void placement**

In the void mousedown handler (Task 6, Step 5), before `voids.push(newVoid)`, add proximity validation:
```javascript
// Check wall proximity rules
const proximityViolations = validateVoidWallProximity(newVoid);
if (proximityViolations.length > 0) {
    showToast(proximityViolations[0].message, 'error');
    drawingVoid = null;
    draw();
    return;
}
```

- [ ] **Step 6: Test manually and commit**

Test:
1. Draw some walls forming an envelope (rectangle)
2. Switch to Void mode — purple restricted zones appear on the non-column face of envelope walls
3. Draw a void touching the column face of an envelope wall — should be allowed
4. Try drawing a void on the non-column face — should be rejected with toast
5. Draw an internal wall (not part of envelope)
6. Draw a void on its non-column face — should be allowed
7. Try void on its column face — should be rejected
8. Run Validate All — any existing invalid voids are flagged

```bash
git add index.html
git commit -m "feat: add void-wall proximity validation (Rule 7)

Validates void placement against wall faces: internal walls require
voids on non-column face, external (envelope) walls require voids
on column face. Purple restricted zones shown during void drawing."
```

---

## Task 11: Final Polish and Rules Modal Update

**Files:**
- Modify: `index.html` — Rules Modal, Changelog

- [ ] **Step 1: Update Rules Modal with new rules**

Add new rule sections to the Rules Modal (~line 4096):

After the "Minimum Distances" section, add:
```html
<div class="rule-section">
    <h3>7. Envelope Connections (Rule 4)</h3>
    <ul>
        <li><strong>Angle Constraint:</strong> All wall connections in a building envelope must be exactly 90 or 270 degrees</li>
        <li><strong>Validation:</strong> Invalid angles are flagged with a red indicator at the corner</li>
    </ul>
</div>

<div class="rule-section">
    <h3>8. Voids (Rule 7)</h3>
    <ul>
        <li><strong>Placement Grid:</strong> Voids snap to the 60 cm grid</li>
        <li><strong>Minimum Size:</strong> 60 cm x 60 cm</li>
        <li><strong>Internal Walls:</strong> Voids must be placed on the non-column face (external face)</li>
        <li><strong>External Walls (Envelope):</strong> Voids must be placed on the column face (internal face)</li>
        <li><strong>No Overlap:</strong> Voids cannot overlap each other</li>
    </ul>
</div>
```

- [ ] **Step 2: Update Changelog**

Update the changelog version header and add a new section at the top of the changelog entries (~line 4212):
```html
<div class="rule-section" style="background: rgba(37, 99, 235, 0.05); padding: 16px; border-radius: 8px; border-left: 3px solid #2563eb;">
    <h3 style="margin-top: 0;">Version 1.2.0 — March 25, 2026</h3>
    <p style="font-size: 13px; color: #6b6b6b; margin-bottom: 12px;">New Rules</p>
    <ul>
        <li><strong>600mm Wall Length Snapping:</strong> Wall lengths now snap to 60cm multiples. Minimum wall length increased from 40cm to 60cm.</li>
        <li><strong>Envelope Angle Validation:</strong> Building envelope corners are validated to be exactly 90 or 270 degrees.</li>
        <li><strong>Void Drawing:</strong> New "Draw Void" mode for placing slab penetrations (stairwells, shafts). Voids snap to 60cm grid with 60cm minimum size.
            <ul style="margin-top: 6px; font-size: 13px; color: #5a5a5a;">
                <li>Click-drag to draw rectangular voids</li>
                <li>Select and resize with corner/edge handles</li>
                <li>Wall proximity validation (Rule 7): correct face enforcement for internal vs external walls</li>
                <li>Purple restricted zones show invalid placement areas</li>
                <li>Full undo/redo support</li>
            </ul>
        </li>
    </ul>
</div>
```

Also update the version number in the changelog header (~line 4205):
```html
Changelog — Version 1.2.0
```

- [ ] **Step 3: Clear void state on canvas reset**

Find the "Clear All" button handler and add void clearing:
```javascript
voids = [];
selectedVoid = null;
drawingVoid = null;
```

- [ ] **Step 4: Final integration test**

Comprehensive manual test:
1. Draw walls forming a closed envelope (rectangle)
2. Verify envelope is detected (blue fill)
3. Draw additional internal walls
4. Run Validate All — no angle errors
5. Switch to Void mode — purple restricted zones appear
6. Draw voids on correct faces — allowed
7. Try voids on wrong faces — rejected
8. Select a void, resize it — works with 600mm grid
9. Delete a void — works
10. Undo/redo through the entire sequence
11. Switch floors, draw walls and voids — cross-floor display works
12. Verify wall length snapping still works throughout

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: update rules modal and changelog for v1.2.0

Documents new rules: 600mm wall length snapping, envelope angle
validation, and void drawing with Rule 7 proximity validation."
```
