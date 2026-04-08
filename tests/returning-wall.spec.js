import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000/index.html';

// Helper: click at world mm coordinates on the canvas
async function clickAtMm(page, mmX, mmY) {
    const pos = await page.evaluate(({ mmX, mmY }) => {
        const canvas = document.getElementById('mainCanvas');
        const rect = canvas.getBoundingClientRect();
        const MM_TO_PX = 0.15;
        const px = mmX * MM_TO_PX;
        const py = mmY * MM_TO_PX;
        return { x: rect.left + px, y: rect.top + py };
    }, { mmX, mmY });
    await page.mouse.click(pos.x, pos.y);
}

// Helper: move mouse to world mm coordinates
async function moveToMm(page, mmX, mmY) {
    const pos = await page.evaluate(({ mmX, mmY }) => {
        const canvas = document.getElementById('mainCanvas');
        const rect = canvas.getBoundingClientRect();
        const MM_TO_PX = 0.15;
        const px = mmX * MM_TO_PX;
        const py = mmY * MM_TO_PX;
        return { x: rect.left + px, y: rect.top + py };
    }, { mmX, mmY });
    await page.mouse.move(pos.x, pos.y);
}

// Helper: get all walls with their properties
async function getWalls(page) {
    return page.evaluate(() => {
        const sim = window.__sim;
        if (!sim) return [];
        return sim.state.walls.map(w => ({
            ax: w.pointA.x, ay: w.pointA.y,
            bx: w.pointB.x, by: w.pointB.y,
            thickness: w.thickness,
            nx: w.n.x, ny: w.n.y,
            length: w.length,
        }));
    });
}

// Helper: get returning wall overrides info
async function getOverrides(page) {
    return page.evaluate(() => {
        const sim = window.__sim;
        if (!sim) return [];
        const result = [];
        for (const [wall, override] of sim.state.returningWallOverrides) {
            const idx = sim.state.walls.indexOf(wall);
            result.push({
                wallIndex: idx,
                originalThickness: override.originalThickness,
                wasFlipped: override.wasFlipped,
                originalAx: override.originalPointA.x,
                originalAy: override.originalPointA.y,
            });
        }
        return result;
    });
}

// Helper: get building envelopes info
async function getEnvelopes(page) {
    return page.evaluate(() => {
        const sim = window.__sim;
        if (!sim) return [];
        return sim.state.buildingEnvelopes.map(env => ({
            floorId: env.floorId,
            wallCount: env.wallIndices.length,
            wallIndices: env.wallIndices,
        }));
    });
}

// Helper: draw a wall from start to end in mm
async function drawWall(page, startX, startY, endX, endY) {
    await clickAtMm(page, startX, startY);
    await moveToMm(page, endX, endY);
    await clickAtMm(page, endX, endY);
    await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Returning Wall Rule', () => {

    test('unit: flipWallAroundCenter keeps geometric center in place', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const w = new Wall(1200, 1800, 3600, 1800, 200);

            const extBefore = w.getExternalFacePoints();
            const centerBefore = {
                x: (w.pointA.x + w.pointB.x + extBefore.a.x + extBefore.b.x) / 4,
                y: (w.pointA.y + w.pointB.y + extBefore.a.y + extBefore.b.y) / 4,
            };
            const normalBefore = { x: w.n.x, y: w.n.y };

            sim.flipWallAroundCenter(w);

            const extAfter = w.getExternalFacePoints();
            const centerAfter = {
                x: (w.pointA.x + w.pointB.x + extAfter.a.x + extAfter.b.x) / 4,
                y: (w.pointA.y + w.pointB.y + extAfter.a.y + extAfter.b.y) / 4,
            };
            const normalAfter = { x: w.n.x, y: w.n.y };

            return { centerBefore, centerAfter, normalBefore, normalAfter };
        });

        // Center should stay the same
        expect(Math.abs(result.centerBefore.x - result.centerAfter.x)).toBeLessThan(1);
        expect(Math.abs(result.centerBefore.y - result.centerAfter.y)).toBeLessThan(1);
        // Normal should have flipped
        expect(result.normalBefore.x).toBeCloseTo(-result.normalAfter.x, 5);
        expect(result.normalBefore.y).toBeCloseTo(-result.normalAfter.y, 5);
    });

    test('unit: detectReturningWallPairs finds pair in L-shaped envelope', async ({ page }) => {
        // Programmatically create an L-shaped envelope where two walls share Y=1800
        // and have the same orientation, but one faces outward.
        //
        // Shape (clockwise outer boundary):
        //   A(600,600) → B(3600,600) → C(3600,1800) → D(4800,1800)
        //   → E(4800,3600) → F(1800,3600) → G(1800,1800) → H(600,1800) → A
        //
        // Wall CD at Y=1800: (3600,1800)→(4800,1800), n=(0,1) points down.
        //   External-face test point at (4200,1801) is INSIDE polygon → external faces inward → CD is the returning wall
        // Wall GH at Y=1800: (600,1800)→(1800,1800), n=(0,1) points down.
        //   External-face test point at (1200,1801) is OUTSIDE polygon → external faces outward → GH is correct

        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            // Clear existing state
            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Create walls of the L-shape (all with consistent orientation for the envelope to connect)
            sim.state.walls.push(new Wall(600, 600, 3600, 600, 200, 2700, null, 0));      // 0: AB top
            sim.state.walls.push(new Wall(3600, 600, 3600, 1800, 200, 2700, null, 0));     // 1: BC right-upper
            sim.state.walls.push(new Wall(3600, 1800, 4800, 1800, 200, 2700, null, 0));    // 2: CD step-out
            sim.state.walls.push(new Wall(4800, 1800, 4800, 3600, 200, 2700, null, 0));    // 3: DE right-lower
            sim.state.walls.push(new Wall(4800, 3600, 1800, 3600, 200, 2700, null, 0));    // 4: EF bottom
            sim.state.walls.push(new Wall(1800, 3600, 1800, 1800, 200, 2700, null, 0));    // 5: FG left-lower
            sim.state.walls.push(new Wall(600, 1800, 1800, 1800, 200, 2700, null, 0));     // 6: GH returning wall (same dir as CD)
            sim.state.walls.push(new Wall(600, 1800, 600, 600, 200, 2700, null, 0));       // 7: HA left-upper

            // Run envelope detection and returning wall rule
            const changeInfo = sim.updateBuildingEnvelopes();

            // Gather results
            const overrides = [];
            for (const [wall, override] of sim.state.returningWallOverrides) {
                const idx = sim.state.walls.indexOf(wall);
                overrides.push({
                    wallIndex: idx,
                    wasFlipped: override.wasFlipped,
                    originalThickness: override.originalThickness,
                    currentThickness: wall.thickness,
                });
            }

            return {
                envelopeCount: sim.state.buildingEnvelopes.length,
                envelopeWallCount: sim.state.buildingEnvelopes[0]?.wallIndices?.length || 0,
                overrides,
                wall2Thickness: sim.state.walls[2].thickness,
                wall6Thickness: sim.state.walls[6].thickness,
            };
        });

        // Should have detected an envelope
        expect(result.envelopeCount).toBe(1);
        expect(result.envelopeWallCount).toBe(8);

        // Should have returning wall overrides
        expect(result.overrides.length).toBe(2);

        // One should be flipped, one should not
        const flipped = result.overrides.find(o => o.wasFlipped);
        const notFlipped = result.overrides.find(o => !o.wasFlipped);
        expect(flipped).toBeTruthy();
        expect(notFlipped).toBeTruthy();

        // Wall 2 (CD) should be the flipped one — its external face points into the polygon
        expect(flipped.wallIndex).toBe(2);
        // Wall 6 (GH) should NOT be flipped — its external face points outward
        expect(notFlipped.wallIndex).toBe(6);

        // Both walls in the pair should now be 300mm
        expect(flipped.currentThickness).toBe(300);
        expect(notFlipped.currentThickness).toBe(300);

        // Original thickness should have been 200mm
        expect(flipped.originalThickness).toBe(200);
        expect(notFlipped.originalThickness).toBe(200);
    });

    test('unit: overrides revert when walls are disconnected', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Same L-shape as above
            sim.state.walls.push(new Wall(600, 600, 3600, 600, 200, 2700, null, 0));      // 0: AB
            sim.state.walls.push(new Wall(3600, 600, 3600, 1800, 200, 2700, null, 0));     // 1: BC
            sim.state.walls.push(new Wall(3600, 1800, 4800, 1800, 200, 2700, null, 0));    // 2: CD
            sim.state.walls.push(new Wall(4800, 1800, 4800, 3600, 200, 2700, null, 0));    // 3: DE
            sim.state.walls.push(new Wall(4800, 3600, 1800, 3600, 200, 2700, null, 0));    // 4: EF
            sim.state.walls.push(new Wall(1800, 3600, 1800, 1800, 200, 2700, null, 0));    // 5: FG
            sim.state.walls.push(new Wall(600, 1800, 1800, 1800, 200, 2700, null, 0));     // 6: GH
            sim.state.walls.push(new Wall(600, 1800, 600, 600, 200, 2700, null, 0));       // 7: HA

            sim.updateBuildingEnvelopes();

            const overridesBeforeBreak = sim.state.returningWallOverrides.size;

            // Disconnect the pair by removing BOTH connecting verticals between them:
            // Remove wall 1 (BC) and wall 5 (FG) — this disconnects CD from GH.
            // Remove higher index first to avoid shifting.
            sim.state.walls.splice(5, 1);
            sim.state.walls.splice(1, 1);
            sim.updateBuildingEnvelopes();

            const overridesAfterBreak = sim.state.returningWallOverrides.size;
            const allThicknesses = sim.state.walls.map(w => w.thickness);

            return { overridesBeforeBreak, overridesAfterBreak, allThicknesses };
        });

        expect(result.overridesBeforeBreak).toBe(2);
        expect(result.overridesAfterBreak).toBe(0);
        result.allThicknesses.forEach(t => expect(t).toBe(200));
    });

    test('unit: independent aligned walls do NOT trigger returning wall rule', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Two independent horizontal walls on the same Y, same orientation
            sim.state.walls.push(new Wall(600, 1800, 2400, 1800, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 1800, 5400, 1800, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            return {
                envelopeCount: sim.state.buildingEnvelopes.length,
                overrideCount: sim.state.returningWallOverrides.size,
                thicknesses: sim.state.walls.map(w => w.thickness),
            };
        });

        expect(result.envelopeCount).toBe(0);
        expect(result.overrideCount).toBe(0);
        result.thicknesses.forEach(t => expect(t).toBe(200));
    });

    test('unit: walls already >= 30cm keep their thickness on reversion', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Same L-shape but wall 2 (CD) starts at 300mm
            sim.state.walls.push(new Wall(600, 600, 3600, 600, 200, 2700, null, 0));      // 0
            sim.state.walls.push(new Wall(3600, 600, 3600, 1800, 200, 2700, null, 0));     // 1: BC
            sim.state.walls.push(new Wall(3600, 1800, 4800, 1800, 300, 2700, null, 0));    // 2: CD (300mm!)
            sim.state.walls.push(new Wall(4800, 1800, 4800, 3600, 200, 2700, null, 0));    // 3
            sim.state.walls.push(new Wall(4800, 3600, 1800, 3600, 200, 2700, null, 0));    // 4
            sim.state.walls.push(new Wall(1800, 3600, 1800, 1800, 200, 2700, null, 0));    // 5: FG
            sim.state.walls.push(new Wall(600, 1800, 1800, 1800, 200, 2700, null, 0));     // 6: GH
            sim.state.walls.push(new Wall(600, 1800, 600, 600, 200, 2700, null, 0));       // 7

            sim.updateBuildingEnvelopes();
            const thicknessesWithOverride = sim.state.walls.map(w => w.thickness);

            // Disconnect the pair by removing both connecting verticals
            sim.state.walls.splice(5, 1); // remove FG
            sim.state.walls.splice(1, 1); // remove BC
            sim.updateBuildingEnvelopes();
            const thicknessesAfterRevert = sim.state.walls.map(w => w.thickness);

            return { thicknessesWithOverride, thicknessesAfterRevert };
        });

        // Wall 2 (CD, originally 300) should stay 300 during override (max(300,300)=300)
        expect(result.thicknessesWithOverride[2]).toBe(300);
        // Wall 6 (GH, originally 200) should be 300 during override
        expect(result.thicknessesWithOverride[6]).toBe(300);

        // After reversion (walls shifted: old 2→0 after 2 removals before it...
        // actually: removed idx 5, then idx 1. Wall 2 (CD) becomes idx 1, wall 6 (GH) becomes idx 4)
        // CD originally 300 → should revert to 300
        expect(result.thicknessesAfterRevert[1]).toBe(300);
        // GH originally 200 → should revert to 200
        expect(result.thicknessesAfterRevert[4]).toBe(200);
    });
});
