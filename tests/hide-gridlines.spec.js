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
});
