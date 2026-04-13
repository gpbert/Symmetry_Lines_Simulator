# Partial Gridline Hiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide only the segments of gridlines that fall within a wall's restriction projection, instead of hiding entire edge-to-edge gridlines.

**Architecture:** Replace the `Set<number>` return type in `getRestrictedGridCoords()` with `Map<number, Array<{min, max}>>` containing restricted segments per gridline. Update `drawGrid()` to draw gridlines with gaps where segments overlap. Simplify `drawRestrictedZones()` to always draw red lines within wall projection (removing the `restrictedCoords` parameter).

**Tech Stack:** Vanilla JS, HTML5 Canvas, Playwright for testing

**Spec:** `docs/superpowers/specs/2026-04-13-partial-gridline-hiding-design.md`

---

### Task 1: Update `getRestrictedGridCoords()` to return segment maps

**Files:**
- Modify: `renderer2d.js:121-165` (`getRestrictedGridCoords` function)
- Modify: `tests/hide-gridlines.spec.js` (update existing tests)

- [ ] **Step 1: Update existing tests to expect segment-based return type**

Replace the entire `tests/hide-gridlines.spec.js` with:

```js
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000/index.html';

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Partial Gridline Hiding', () => {

    test('unit: getRestrictedGridCoords returns segment maps for a horizontal wall', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Horizontal wall at y=0, spanning x=0 to x=3000
            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            // restrictedY should be a Map with segments
            const y300segments = restrictedY.get(300) || [];
            const yNeg300segments = restrictedY.get(-300) || [];
            const y600segments = restrictedY.get(600) || [];

            return {
                restrictedYIsMap: restrictedY instanceof Map,
                restrictedXIsMap: restrictedX instanceof Map,
                // y=300: restricted, segment should span wall projection (x=0 to x=3000)
                y300hasSegments: y300segments.length > 0,
                y300min: y300segments.length > 0 ? y300segments[0].min : null,
                y300max: y300segments.length > 0 ? y300segments[0].max : null,
                // y=-300: restricted, same projection
                yNeg300hasSegments: yNeg300segments.length > 0,
                yNeg300min: yNeg300segments.length > 0 ? yNeg300segments[0].min : null,
                yNeg300max: yNeg300segments.length > 0 ? yNeg300segments[0].max : null,
                // y=600: boundary — NOT restricted
                y600hasSegments: y600segments.length > 0,
                // x coords should not be restricted (wall is horizontal)
                restrictedXSize: restrictedX.size,
            };
        });

        expect(result.restrictedYIsMap).toBe(true);
        expect(result.restrictedXIsMap).toBe(true);
        expect(result.y300hasSegments).toBe(true);
        expect(result.y300min).toBe(0);
        expect(result.y300max).toBe(3000);
        expect(result.yNeg300hasSegments).toBe(true);
        expect(result.yNeg300min).toBe(0);
        expect(result.yNeg300max).toBe(3000);
        expect(result.y600hasSegments).toBe(false);
        expect(result.restrictedXSize).toBe(0);
    });

    test('unit: getRestrictedGridCoords returns 1200mm segments for envelope wall', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Rectangular envelope: walls at y=0, y=3600, x=0, x=3600
            sim.state.walls.push(new Wall(0, 0, 3600, 0, 200, 2700, null, 0));       // top
            sim.state.walls.push(new Wall(3600, 0, 3600, 3600, 200, 2700, null, 0));  // right
            sim.state.walls.push(new Wall(3600, 3600, 0, 3600, 200, 2700, null, 0));  // bottom
            sim.state.walls.push(new Wall(0, 3600, 0, 0, 200, 2700, null, 0));        // left

            sim.updateBuildingEnvelopes();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());

            // Top wall at y=0: Wall(0,0,3600,0) → d=(1,0) → n=(0,+1)
            // +y side (normal/external): 1200mm zone, segments span x=0→3600
            // -y side (opposite normal): 600mm zone, segments span x=0→3600
            const yNeg300 = restrictedY.get(-300) || [];
            const yNeg600 = restrictedY.get(-600) || [];
            const y300 = restrictedY.get(300) || [];
            const y600 = restrictedY.get(600) || [];
            const y900 = restrictedY.get(900) || [];
            const y1200 = restrictedY.get(1200) || [];

            return {
                yNeg300hasSegments: yNeg300.length > 0,
                yNeg600hasSegments: yNeg600.length > 0,  // boundary
                y300hasSegments: y300.length > 0,
                y600hasSegments: y600.length > 0,
                y900hasSegments: y900.length > 0,
                y1200hasSegments: y1200.length > 0,       // boundary
                // Check segment bounds for top wall's restriction
                y300min: y300.length > 0 ? y300[0].min : null,
                y300max: y300.length > 0 ? y300[0].max : null,
            };
        });

        // -y side: 600mm zone
        expect(result.yNeg300hasSegments).toBe(true);
        expect(result.yNeg600hasSegments).toBe(false);  // boundary
        // +y side (external): 1200mm zone
        expect(result.y300hasSegments).toBe(true);
        expect(result.y600hasSegments).toBe(true);
        expect(result.y900hasSegments).toBe(true);
        expect(result.y1200hasSegments).toBe(false);  // boundary
        // Segment spans wall projection
        expect(result.y300min).toBe(0);
        expect(result.y300max).toBe(3600);
    });

    test('unit: internal walls do not generate restricted grid coords', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build envelope
            sim.state.walls.push(new Wall(0, 0, 6000, 0, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 0, 6000, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 6000, 0, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(0, 6000, 0, 0, 200, 2700, null, 0));

            // Internal partition at x=3000
            sim.state.walls.push(new Wall(3000, 0, 3000, 6000, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            const { restrictedX } = renderer.getRestrictedGridCoords(new Set());

            return {
                // x=300 IS restricted by envelope wall at x=0
                x300restricted: restrictedX.has(300),
                // x=3300 is NOT restricted by internal wall (internal walls don't restrict)
                x3300restricted: restrictedX.has(3300),
            };
        });

        expect(result.x300restricted).toBe(true);
        expect(result.x3300restricted).toBe(false);
    });

    test('unit: multiple walls create separate segments on the same gridline', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Two horizontal walls at y=0, separated along x axis
            // Wall 1: x=0 to x=3000
            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            // Wall 2: x=6000 to x=9000
            sim.state.walls.push(new Wall(6000, 0, 9000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());
            const y300segments = restrictedY.get(300) || [];

            return {
                segmentCount: y300segments.length,
                seg0min: y300segments.length >= 1 ? y300segments[0].min : null,
                seg0max: y300segments.length >= 1 ? y300segments[0].max : null,
                seg1min: y300segments.length >= 2 ? y300segments[1].min : null,
                seg1max: y300segments.length >= 2 ? y300segments[1].max : null,
            };
        });

        expect(result.segmentCount).toBe(2);
        expect(result.seg0min).toBe(0);
        expect(result.seg0max).toBe(3000);
        expect(result.seg1min).toBe(6000);
        expect(result.seg1max).toBe(9000);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: FAIL — tests expect `Map` but get `Set`, `.get()` on Set returns undefined

- [ ] **Step 3: Implement segment-based `getRestrictedGridCoords()`**

In `renderer2d.js`, replace lines 121-165 (the entire `getRestrictedGridCoords` function) with:

```js
function getRestrictedGridCoords(skipIndices = new Set()) {
    const restrictedX = new Map(); // x-coord → [{min, max}] (y-ranges)
    const restrictedY = new Map(); // y-coord → [{min, max}] (x-ranges)

    const relevantWalls = state.walls.filter((w, idx) =>
        !skipIndices.has(idx) && (
            w.floorId === state.currentFloorId ||
            Math.abs(w.floorId - state.currentFloorId) === 1
        )
    );

    const gridStep = GRID_SIZE_EXTERNAL;

    relevantWalls.forEach(wall => {
        if (sim.isInternalWall(wall)) return;

        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        const internalFace = isHorizontal ? wall.pointA.y : wall.pointA.x;
        const normalDir = isHorizontal ? wall.n.y : wall.n.x;
        const inEnvelope = sim.isWallInEnvelope(wall);
        const hasExtension = inEnvelope && sim.envelopeWallHasExtension(wall);

        // Wall projection bounds along its length axis
        const wallMin = isHorizontal
            ? Math.min(wall.pointA.x, wall.pointB.x)
            : Math.min(wall.pointA.y, wall.pointB.y);
        const wallMax = isHorizontal
            ? Math.max(wall.pointA.x, wall.pointB.x)
            : Math.max(wall.pointA.y, wall.pointB.y);

        const use1200 = inEnvelope && !hasExtension;
        const zoneNeg = internalFace - ((use1200 && normalDir < 0) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL);
        const zonePos = internalFace + ((use1200 && normalDir > 0) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL);

        const firstGrid = Math.ceil(zoneNeg / gridStep) * gridStep;
        for (let g = firstGrid; g <= zonePos; g += gridStep) {
            const dist = Math.abs(g - internalFace);
            if (dist < 10) continue;

            const isOnNormalSide = (g - internalFace) * normalDir > 0;
            const minDist = (use1200 && isOnNormalSide) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL;
            if (dist >= minDist - 2) continue;

            const map = isHorizontal ? restrictedY : restrictedX;
            if (!map.has(g)) map.set(g, []);
            map.get(g).push({ min: wallMin, max: wallMax });
        }
    });

    return { restrictedX, restrictedY };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add renderer2d.js tests/hide-gridlines.spec.js
git commit -m "feat: getRestrictedGridCoords returns segment maps instead of Sets"
```

---

### Task 2: Update `drawGrid()` to draw partial gridlines

**Files:**
- Modify: `renderer2d.js:57-94` (`drawGrid` function)

- [ ] **Step 1: Add a test for partial gridline drawing**

Add to `tests/hide-gridlines.spec.js`, inside the `test.describe` block, after the last test:

```js
    test('unit: drawGrid completes without error using segment maps', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Place wall to create restrictions
            sim.state.walls.push(new Wall(0, 1800, 3000, 1800, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            // Trigger full draw (uses segment maps internally)
            renderer.draw();

            // If we get here, drawGrid handled segment maps correctly
            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());
            const y2100segments = restrictedY.get(2100) || [];

            return {
                drawCompleted: true,
                y2100hasSegments: y2100segments.length > 0,
                y2100min: y2100segments.length > 0 ? y2100segments[0].min : null,
                y2100max: y2100segments.length > 0 ? y2100segments[0].max : null,
            };
        });

        expect(result.drawCompleted).toBe(true);
        expect(result.y2100hasSegments).toBe(true);
        expect(result.y2100min).toBe(0);
        expect(result.y2100max).toBe(3000);
    });
```

- [ ] **Step 2: Run tests — the new test should fail because `drawGrid` still expects Sets**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: FAIL — `drawGrid` calls `.has()` on a Map (which works but checks keys, not what we want). Actually this may error or produce incorrect behavior since the `draw()` function passes `restrictedCoords.restrictedX` (now a Map) to `drawGrid` which calls `.has(Math.round(pxToMm(x)))` — this actually works on Maps too (checks keys). But the behavior is wrong: it skips the entire line when any segment exists, instead of drawing partial lines. The test should still pass since it only checks `drawCompleted`. Let me adjust — the test will pass but we need to update `drawGrid` anyway for correct partial rendering.

- [ ] **Step 3: Update `drawGrid()` to accept Maps and draw partial gridlines**

In `renderer2d.js`, replace lines 57-94 (the `drawGrid` function's signature and 300mm grid drawing section) with:

```js
function drawGrid(restrictedX = new Map(), restrictedY = new Map()) {
    if (!ctx || !canvas) {
        console.error('Canvas not initialized in drawGrid!');
        return;
    }

    const gridStepExternal = mmToPx(GRID_SIZE_EXTERNAL);
    const gridStepInternal = mmToPx(GRID_SIZE_INTERNAL);

    // Calculate visible world bounds (in pixels) accounting for pan/zoom
    const visibleLeft = -panOffset.x / zoomLevel;
    const visibleTop = -panOffset.y / zoomLevel;
    const visibleRight = (canvas.width - panOffset.x) / zoomLevel;
    const visibleBottom = (canvas.height - panOffset.y) / zoomLevel;

    // Round to grid boundaries
    const startX = Math.floor(visibleLeft / gridStepExternal) * gridStepExternal;
    const endX = Math.ceil(visibleRight / gridStepExternal) * gridStepExternal;
    const startY = Math.floor(visibleTop / gridStepExternal) * gridStepExternal;
    const endY = Math.ceil(visibleBottom / gridStepExternal) * gridStepExternal;

    // Draw 300mm grid (external) - DARK, thicker lines
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2 / zoomLevel;

    // Vertical lines (x = constant, line runs top→bottom)
    for (let x = startX; x <= endX; x += gridStepExternal) {
        const xMm = Math.round(pxToMm(x));
        const segments = restrictedX.get(xMm);
        if (!segments) {
            // No restrictions — draw full line
            ctx.beginPath();
            ctx.moveTo(x, visibleTop);
            ctx.lineTo(x, visibleBottom);
            ctx.stroke();
        } else {
            // Draw gaps around restricted segments
            // Segments are {min, max} in mm along Y axis
            const sorted = segments.slice().sort((a, b) => a.min - b.min);
            let cursor = visibleTop;
            for (const seg of sorted) {
                const segTopPx = mmToPx(seg.min);
                const segBottomPx = mmToPx(seg.max);
                if (cursor < segTopPx) {
                    ctx.beginPath();
                    ctx.moveTo(x, cursor);
                    ctx.lineTo(x, segTopPx);
                    ctx.stroke();
                }
                cursor = Math.max(cursor, segBottomPx);
            }
            if (cursor < visibleBottom) {
                ctx.beginPath();
                ctx.moveTo(x, cursor);
                ctx.lineTo(x, visibleBottom);
                ctx.stroke();
            }
        }
    }

    // Horizontal lines (y = constant, line runs left→right)
    for (let y = startY; y <= endY; y += gridStepExternal) {
        const yMm = Math.round(pxToMm(y));
        const segments = restrictedY.get(yMm);
        if (!segments) {
            // No restrictions — draw full line
            ctx.beginPath();
            ctx.moveTo(visibleLeft, y);
            ctx.lineTo(visibleRight, y);
            ctx.stroke();
        } else {
            // Draw gaps around restricted segments
            // Segments are {min, max} in mm along X axis
            const sorted = segments.slice().sort((a, b) => a.min - b.min);
            let cursor = visibleLeft;
            for (const seg of sorted) {
                const segLeftPx = mmToPx(seg.min);
                const segRightPx = mmToPx(seg.max);
                if (cursor < segLeftPx) {
                    ctx.beginPath();
                    ctx.moveTo(cursor, y);
                    ctx.lineTo(segLeftPx, y);
                    ctx.stroke();
                }
                cursor = Math.max(cursor, segRightPx);
            }
            if (cursor < visibleRight) {
                ctx.beginPath();
                ctx.moveTo(cursor, y);
                ctx.lineTo(visibleRight, y);
                ctx.stroke();
            }
        }
    }
```

Note: leave the 100mm grid section (lines 96 onwards) unchanged. The closing of the function is already there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add renderer2d.js tests/hide-gridlines.spec.js
git commit -m "feat: drawGrid draws partial gridlines using segment maps"
```

---

### Task 3: Simplify `drawRestrictedZones()` — all red lines scoped to wall projection

**Files:**
- Modify: `renderer2d.js:167-259` (`drawRestrictedZones` function)
- Modify: `renderer2d.js:586` (call site in `draw()`)

- [ ] **Step 1: Add a test for restriction lines within wall projection**

Add to `tests/hide-gridlines.spec.js`, inside the `test.describe` block:

```js
    test('unit: drawRestrictedZones completes with showRestrictionLines on', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();
            sim.state.showRestrictionLines = true;

            // Place a wall to create restrictions
            sim.state.walls.push(new Wall(0, 1800, 3000, 1800, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            // Full draw — this exercises drawRestrictedZones
            renderer.draw();

            return { drawCompleted: true };
        });

        expect(result.drawCompleted).toBe(true);
    });
```

- [ ] **Step 2: Run tests to verify the new test passes (baseline)**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: All 6 tests PASS

- [ ] **Step 3: Simplify `drawRestrictedZones()` — remove `restrictedCoords` param, scope all red lines to wall projection**

In `renderer2d.js`, replace lines 167-259 (the entire `drawRestrictedZones` function) with:

```js
function drawRestrictedZones(skipIndices = new Set()) {
    if (!state.showRestrictionLines) return;
    const relevantWalls = state.walls.filter((w, idx) =>
        !skipIndices.has(idx) && (
            w.floorId === state.currentFloorId ||
            Math.abs(w.floorId - state.currentFloorId) === 1
        )
    );

    const gridStep = GRID_SIZE_EXTERNAL;

    relevantWalls.forEach(wall => {
        // Non-structural walls don't generate restriction zones
        if (sim.isInternalWall(wall)) return;

        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        const internalFace = isHorizontal ? wall.pointA.y : wall.pointA.x;
        const normalDir = isHorizontal ? wall.n.y : wall.n.x;
        const inEnvelope = sim.isWallInEnvelope(wall);
        // Suppress 1200mm zone if wall has a placed extension OR if user is
        // currently drawing a perpendicular wall from this envelope wall
        const drawingFromThis = inEnvelope && _interactionState.isDrawingFromEnvelope
            && _interactionState.drawingWall
            && wall.containsPoint(_interactionState.drawingWall.x, _interactionState.drawingWall.y, 15);
        const hasExtension = inEnvelope && (sim.envelopeWallHasExtension(wall) || drawingFromThis);

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.5)';
        ctx.lineWidth = 4 / zoomLevel;

        // Asymmetric zone for envelope walls without extensions: 1200mm on external face side
        // Envelope walls with extensions or non-envelope walls: 600mm on both sides
        const use1200 = inEnvelope && !hasExtension;
        const zoneNeg = internalFace - ((use1200 && normalDir < 0) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL);
        const zonePos = internalFace + ((use1200 && normalDir > 0) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL);

        // Wall projection bounds — all red lines are clipped to this range
        const wallMin = isHorizontal
            ? Math.min(wall.pointA.x, wall.pointB.x)
            : Math.min(wall.pointA.y, wall.pointB.y);
        const wallMax = isHorizontal
            ? Math.max(wall.pointA.x, wall.pointB.x)
            : Math.max(wall.pointA.y, wall.pointB.y);

        const firstGrid = Math.ceil(zoneNeg / gridStep) * gridStep;
        for (let g = firstGrid; g <= zonePos; g += gridStep) {
            const dist = Math.abs(g - internalFace);
            if (dist < 10) continue; // skip the wall's own line

            // Determine min distance for this grid position's side
            const isOnNormalSide = (g - internalFace) * normalDir > 0;
            const minDist = (use1200 && isOnNormalSide) ? MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_PARALLEL;
            if (dist >= minDist - 2) continue; // skip boundary — placement is valid there

            // All red lines are clipped to wall projection
            ctx.beginPath();
            if (isHorizontal) {
                ctx.moveTo(mmToPx(wallMin), mmToPx(g));
                ctx.lineTo(mmToPx(wallMax), mmToPx(g));
            } else {
                ctx.moveTo(mmToPx(g), mmToPx(wallMin));
                ctx.lineTo(mmToPx(g), mmToPx(wallMax));
            }
            ctx.stroke();
        }
    });
}
```

- [ ] **Step 4: Update the call site in `draw()` to remove the `restrictedCoords` argument**

In `renderer2d.js`, find line 586:

```js
    drawRestrictedZones(skipZoneIndices, restrictedCoords);
```

Replace with:

```js
    drawRestrictedZones(skipZoneIndices);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add renderer2d.js tests/hide-gridlines.spec.js
git commit -m "feat: scope all restriction red lines to wall projection, remove restrictedCoords param"
```

---

### Task 4: E2E integration test and regression check

**Files:**
- Modify: `tests/hide-gridlines.spec.js`

- [ ] **Step 1: Add an e2e integration test**

Add to `tests/hide-gridlines.spec.js`, inside the `test.describe` block:

```js
    test('e2e: drawing a wall creates partial gridline restrictions', async ({ page }) => {
        const canvasBox = await page.locator('#mainCanvas').boundingBox();
        const centerX = canvasBox.x + canvasBox.width / 2;
        const centerY = canvasBox.y + canvasBox.height / 2;

        // Ensure draw mode is active
        await page.click('#drawWallBtn');
        await page.waitForTimeout(100);

        // Draw a horizontal wall by clicking two points
        await page.mouse.click(centerX - 200, centerY);
        await page.waitForTimeout(100);
        await page.mouse.click(centerX + 200, centerY);
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const renderer = window.__renderer2D;
            const sim = window.__sim;

            const wallCount = sim.state.walls.length;
            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            // Check that we have segment-based restrictions (Maps with arrays)
            let hasSegmentArrays = false;
            for (const [coord, segments] of restrictedY) {
                if (Array.isArray(segments) && segments.length > 0 && 'min' in segments[0]) {
                    hasSegmentArrays = true;
                    break;
                }
            }

            return {
                wallCount,
                hasRestrictedY: restrictedY.size > 0,
                hasSegmentArrays,
            };
        });

        expect(result.wallCount).toBeGreaterThan(0);
        expect(result.hasRestrictedY).toBe(true);
        expect(result.hasSegmentArrays).toBe(true);
    });
```

- [ ] **Step 2: Run the full hide-gridlines test suite**

Run: `npx playwright test tests/hide-gridlines.spec.js --reporter=line`
Expected: All 7 tests PASS

- [ ] **Step 3: Run ALL existing tests for regression**

Run: `npx playwright test --reporter=line`
Expected: All tests PASS (no regressions in wall-merge-flip, wall-drawing-ux, returning-wall, internal-walls, etc.)

- [ ] **Step 4: Commit**

```bash
git add tests/hide-gridlines.spec.js
git commit -m "test: add e2e integration test for partial gridline hiding"
```
