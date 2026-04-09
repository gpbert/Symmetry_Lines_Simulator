import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000/index.html';

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Internal Walls', () => {

    test('unit: getEnvelopeContainingPoint detects point inside envelope', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build a rectangle envelope: (600,600) to (3600,3600)
            sim.state.walls.push(new Wall(600, 600, 3600, 600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 600, 3600, 3600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 3600, 600, 3600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(600, 3600, 600, 600, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            const insidePoint = sim.getEnvelopeContainingPoint(1800, 1800, 0);
            const outsidePoint = sim.getEnvelopeContainingPoint(0, 0, 0);
            const wrongFloor = sim.getEnvelopeContainingPoint(1800, 1800, 1);

            return {
                envelopeCount: sim.state.buildingEnvelopes.length,
                insideFound: insidePoint !== null,
                outsideFound: outsidePoint !== null,
                wrongFloorFound: wrongFloor !== null,
            };
        });

        expect(result.envelopeCount).toBe(1);
        expect(result.insideFound).toBe(true);
        expect(result.outsideFound).toBe(false);
        expect(result.wrongFloorFound).toBe(false);
    });

    test('unit: isInternalWall correctly classifies walls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build envelope
            sim.state.walls.push(new Wall(600, 600, 3600, 600, 200, 2700, null, 0));   // 0: boundary
            sim.state.walls.push(new Wall(3600, 600, 3600, 3600, 200, 2700, null, 0));  // 1: boundary
            sim.state.walls.push(new Wall(3600, 3600, 600, 3600, 200, 2700, null, 0));  // 2: boundary
            sim.state.walls.push(new Wall(600, 3600, 600, 600, 200, 2700, null, 0));    // 3: boundary

            // Add an internal wall (partition inside the envelope)
            sim.state.walls.push(new Wall(1200, 600, 1200, 3600, 200, 2700, null, 0));  // 4: internal

            // Add an independent wall outside
            sim.state.walls.push(new Wall(5000, 5000, 6000, 5000, 200, 2700, null, 0)); // 5: external orphan

            sim.updateBuildingEnvelopes();

            return {
                wall0Internal: sim.isInternalWall(sim.state.walls[0]),  // boundary = false
                wall1Internal: sim.isInternalWall(sim.state.walls[1]),  // boundary = false
                wall4Internal: sim.isInternalWall(sim.state.walls[4]),  // partition = true
                wall5Internal: sim.isInternalWall(sim.state.walls[5]),  // orphan = false
            };
        });

        expect(result.wall0Internal).toBe(false);  // boundary wall
        expect(result.wall1Internal).toBe(false);  // boundary wall
        expect(result.wall4Internal).toBe(true);   // internal partition
        expect(result.wall5Internal).toBe(false);  // outside, not internal
    });

    test('unit: internal walls do NOT restrict external walls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build envelope
            sim.state.walls.push(new Wall(600, 600, 6000, 600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 600, 6000, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 6000, 600, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(600, 6000, 600, 600, 200, 2700, null, 0));

            // Internal wall at Y=3000 (far enough from envelope walls to avoid their zones)
            sim.state.walls.push(new Wall(1200, 3000, 5400, 3000, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            // Check: the internal wall's restriction zone should NOT affect external wall detection
            // A point at Y=2700 (within 600mm of internal wall at Y=3000) should NOT be restricted
            // for external walls, but IS restricted for internal walls.
            // Y=2700 is 2100mm from top wall (Y=600) and 3300mm from bottom wall (Y=6000)
            // — well outside both envelope walls' zones.
            const restrictionForExternal = sim.findRestrictingWallAtPoint(3000, 2700, 0, false);
            // But should be restricted for internal walls
            const restrictionForInternal = sim.findRestrictingWallAtPoint(3000, 2700, 0, true);

            return {
                externalRestricted: restrictionForExternal !== null,
                internalRestricted: restrictionForInternal !== null,
            };
        });

        expect(result.externalRestricted).toBe(false); // internal wall doesn't restrict external
        expect(result.internalRestricted).toBe(true);   // internal wall restricts other internal
    });

    test('unit: internal walls ARE restricted by external walls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build envelope with top wall at Y=600
            sim.state.walls.push(new Wall(600, 600, 6000, 600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 600, 6000, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 6000, 600, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(600, 6000, 600, 600, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            // Check: a point at Y=800 (within 600mm of external wall at Y=600)
            // should be restricted for internal walls
            const restrictionForInternal = sim.findRestrictingWallAtPoint(3000, 800, 0, true);

            return {
                internalRestrictedByExternal: restrictionForInternal !== null,
            };
        });

        expect(result.internalRestrictedByExternal).toBe(true);
    });

    test('unit: returning wall rule skips internal walls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build envelope
            sim.state.walls.push(new Wall(600, 600, 6000, 600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 600, 6000, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 6000, 600, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(600, 6000, 600, 600, 200, 2700, null, 0));

            // Two internal walls on the same grid line with same orientation
            // These should NOT trigger the returning wall rule
            sim.state.walls.push(new Wall(1200, 2400, 2400, 2400, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 2400, 4800, 2400, 200, 2700, null, 0));

            sim.updateBuildingEnvelopes();

            return {
                overrideCount: sim.state.returningWallOverrides.size,
                wall4Thickness: sim.state.walls[4].thickness,
                wall5Thickness: sim.state.walls[5].thickness,
            };
        });

        // No returning wall overrides for internal walls
        expect(result.overrideCount).toBe(0);
        expect(result.wall4Thickness).toBe(200); // unchanged
        expect(result.wall5Thickness).toBe(200); // unchanged
    });

    test('unit: snapLengthToGrid uses 100mm for internal walls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;

            // External wall: 300mm grid
            const ext = sim.snapLengthToGrid(
                { x: 600, y: 600 },
                { x: 1450, y: 600 },
                0,
                300  // WALL_LENGTH_GRID
            );

            // Internal wall: 100mm grid
            const int = sim.snapLengthToGrid(
                { x: 600, y: 600 },
                { x: 1450, y: 600 },
                0,
                100  // GRID_SIZE_INTERNAL
            );

            return {
                extX: ext.x,  // Should snap to 600 + 600 = 1200 (floor(850/300)*300 = 600)
                intX: int.x,  // Should snap to 600 + 800 = 1400 (floor(850/100)*100 = 800)
            };
        });

        // 1450 - 600 = 850 raw length
        // External: floor(850/300)*300 = 600 → endpoint at 1200
        expect(result.extX).toBe(1200);
        // Internal: floor(850/100)*100 = 800 → endpoint at 1400
        expect(result.intX).toBe(1400);
    });
});
