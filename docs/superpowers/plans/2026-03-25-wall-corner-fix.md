# Wall Corner Extension Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix wall corner extensions so walls meet with no gaps and corner columns sit side-by-side at all thicknesses (200mm and 300mm).

**Architecture:** Rewrite `computeWallExtensions()` in `sim.js` with correct geometry. Fix column positioning in both renderers. The extension data format stays `{extA, extB, colA, colB}`.

**Tech Stack:** Vanilla JavaScript ES modules

---

## The Problem

Two bugs:
1. **Wall body extension direction check is wrong** — it sometimes skips valid extensions because `Math.sign(dirToExternal) === Math.sign(dirAlongWall)` fails for certain wall orientations
2. **Column positioning is wrong** — columns stay near original positions instead of moving to sit beside the perpendicular wall's column

## The Correct Geometry

At a corner where horizontal wall H meets vertical wall V at H's endpoint:

**Wall body extension:**
- V occupies a band between `V.pointA.x` (internal face) and `V.pointA.x + V.n.x * V.thickness` (external face)
- H should extend to whichever V face is **furthest from H's body** (i.e., furthest from H's other endpoint)
- This is always the outward extension — no sign checks needed, just pick the more distant face

**Column positioning:**
The two columns at the corner should sit side-by-side. Both live on the internal face line (blue line), offset by `COLUMN_SIZE/2` along their respective wall directions toward the wall body:

- V's column center at connection: `(V.connectPt.x, V.connectPt.y + towardVBody * COLUMN_SIZE/2)` — offset along V's direction
- H's column center at connection: `(V.connectPt.x + towardHBody * COLUMN_SIZE/2, V.connectPt.y)` — offset along H's direction (but at V's X since it extends there? No...)

Actually, both columns should be on their own wall's internal face:
- V's column: centered at `(V.connectPt.x + V.n.x * COLUMN_SIZE/2, V.connectPt.y + towardVBody * COLUMN_SIZE/2)` — this is the standard column position, inside V's body
- H's extending column: centered at `(V.connectPt.x + towardHBody * COLUMN_SIZE/2, H.pointA.y + H.n.y * COLUMN_SIZE/2)` — on H's internal face, offset toward H's body along H's direction, sitting right next to V's column

The key: both columns are at the connection point's coordinates, each offset by `COLUMN_SIZE/2` along their own wall's direction toward the body. They form an L-shape at the corner.

---

## Task 1: Rewrite computeWallExtensions() in sim.js

**Files:**
- Modify: `sim.js` — replace lines 1596-1740

- [ ] **Step 1: Replace the entire function**

Read `sim.js` and find `computeWallExtensions()` (starts around line 1596). Replace it entirely with:

```javascript
export function computeWallExtensions() {
    const extensions = new Map();
    const TOL = 5; // mm connection tolerance

    state.walls.forEach((wall, idx) => {
        const isHoriz = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        if (!isHoriz) return; // Only horizontal walls extend

        const ext = { extA: null, extB: null, colA: null, colB: null };

        for (const ep of ['A', 'B']) {
            const pt = ep === 'A' ? wall.pointA : wall.pointB;
            const bodyPt = ep === 'A' ? wall.pointB : wall.pointA;
            const towardBodyX = Math.sign(bodyPt.x - pt.x); // +1 or -1

            for (let oi = 0; oi < state.walls.length; oi++) {
                if (oi === idx) continue;
                const other = state.walls[oi];
                if (wall.floorId !== other.floorId) continue;
                if (!wall.isPerpendicularTo(other)) continue;

                // Check connection
                const dA = Math.hypot(pt.x - other.pointA.x, pt.y - other.pointA.y);
                const dB = Math.hypot(pt.x - other.pointB.x, pt.y - other.pointB.y);
                if (dA >= TOL && dB >= TOL) continue;

                // Connected! Other is a vertical wall.
                // Find which face of the vertical wall is furthest from H's body
                const vIntX = other.pointA.x;
                const vExtX = other.pointA.x + other.n.x * other.thickness;
                // Pick the face FURTHEST from the wall body
                const targetX = Math.abs(vIntX - bodyPt.x) > Math.abs(vExtX - bodyPt.x)
                    ? vIntX : vExtX;

                // Only extend if target is actually away from body
                if (Math.abs(targetX - pt.x) < 1) break;
                if (Math.sign(targetX - pt.x) === towardBodyX) break;

                const extPt = { x: targetX, y: pt.y };

                // Column: sit on H's internal face, at the connection X,
                // offset by COLUMN_SIZE/2 toward H's body along X
                const connectPt = dA < TOL ? other.pointA : other.pointB;
                const col = {
                    x: connectPt.x + towardBodyX * COLUMN_SIZE / 2,
                    y: pt.y
                };

                if (ep === 'A') { ext.extA = extPt; ext.colA = col; }
                else { ext.extB = extPt; ext.colB = col; }
                break;
            }
        }

        if (ext.extA || ext.extB) extensions.set(idx, ext);
    });

    return extensions;
}
```

The key fixes:
- **Extension target**: picks the V face furthest from H's body using distance comparison, not sign math
- **Column position**: placed at `(connectPt.x + towardBodyX * COLUMN_SIZE/2, pt.y)` — on the internal face line, offset half a column width toward the wall body, sitting right next to where V's column is

- [ ] **Step 2: Verify column rendering in renderer2d.js**

Read `renderer2d.js` and check how `colA`/`colB` are used in `drawWall()`. The column rendering should place the column **centered** at the colA/colB position. The existing code around line 214 should read:

```javascript
const colABase = ext?.colA || effectiveA;
const colBBase = ext?.colB || effectiveB;
```

And then the column is drawn centered at `colABase` with the standard `COLUMN_SIZE/2` offsets along wall direction and normal. Verify this is correct — the column center is `colABase` plus the standard half-column offsets. If the code adds additional offsets on top of `colABase`, remove them since the new `col` values already include the correct offset.

Read the actual column drawing code (around lines 214-260) and verify. If there are extra offsets being applied to `colABase`, fix them.

- [ ] **Step 3: Verify column rendering in renderer3d.js**

Read `renderer3d.js` and check how `colA`/`colB` are used in `buildWallMesh()`. Around line 427:

```javascript
const colAPos = ext?.colA || effectiveA;
```

The 3D column is a BoxGeometry centered at `(mmToUnits(colAPos.x), floorY + wallHeight/2, mmToUnits(colAPos.y))`. Since `colAPos` is now the column center position (already offset by COLUMN_SIZE/2 toward body), the 3D renderer should NOT add additional direction offsets. Verify and fix if needed.

- [ ] **Step 4: Test and commit**

Test with both 200mm and 300mm walls:
1. Draw a rectangle (4 walls, closed envelope)
2. Check all 4 corners — horizontal walls should extend, no gaps
3. Columns at corners should sit side-by-side (not overlapping, not gapped)
4. Switch between 2D and 3D — corners should look consistent
5. Test with mixed thicknesses if possible

```bash
git add sim.js renderer2d.js renderer3d.js
git commit -m "fix: correct wall corner extension geometry and column positioning

Extension target picks the vertical wall face furthest from the
horizontal wall body. Column positioned at connection point offset
by COLUMN_SIZE/2 toward wall body, sitting beside the perpendicular
wall's column."
```
