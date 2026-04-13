import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000/index.html';

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Gridline Hiding', () => {

    test('unit: standalone wall hides gridlines infinitely (null)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Standalone horizontal wall at y=0, spanning x=0 to x=3000
            // Not part of an envelope — 600mm restriction is global
            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            return {
                restrictedYIsMap: restrictedY instanceof Map,
                restrictedXIsMap: restrictedX instanceof Map,
                // y=300: within 600mm, standalone wall → null (infinite hiding)
                y300isNull: restrictedY.get(300) === null,
                yNeg300isNull: restrictedY.get(-300) === null,
                // y=600: boundary — NOT restricted
                y600exists: restrictedY.has(600),
                // x coords should not be restricted (wall is horizontal)
                restrictedXSize: restrictedX.size,
            };
        });

        expect(result.restrictedYIsMap).toBe(true);
        expect(result.restrictedXIsMap).toBe(true);
        expect(result.y300isNull).toBe(true);
        expect(result.yNeg300isNull).toBe(true);
        expect(result.y600exists).toBe(false);
        expect(result.restrictedXSize).toBe(0);
    });

    test('unit: envelope wall uses infinite for 600mm zone and segments for 1200mm-exclusive zone', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Rectangular envelope
            sim.state.walls.push(new Wall(0, 0, 3600, 0, 200, 2700, null, 0));       // top
            sim.state.walls.push(new Wall(3600, 0, 3600, 3600, 200, 2700, null, 0));  // right
            sim.state.walls.push(new Wall(3600, 3600, 0, 3600, 200, 2700, null, 0));  // bottom
            sim.state.walls.push(new Wall(0, 3600, 0, 0, 200, 2700, null, 0));        // left

            sim.updateBuildingEnvelopes();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());

            // Top wall at y=0: Wall(0,0,3600,0) → d=(1,0) → n=(0,+1)
            // +y side is external face (normal side): 1200mm zone
            // -y side: 600mm zone

            // -y side: 600mm zone → infinite (null)
            const yNeg300 = restrictedY.get(-300);

            // +y side within 600mm: also infinite (null)
            const y300 = restrictedY.get(300);

            // +y side between 600mm-1200mm: projection-limited (segments)
            const y600 = restrictedY.get(600);
            const y900 = restrictedY.get(900);

            // +y side at 1200mm: boundary — NOT restricted
            const y1200 = restrictedY.has(1200);

            return {
                // 600mm zone: infinite
                yNeg300isNull: yNeg300 === null,
                y300isNull: y300 === null,
                // 600mm-1200mm exclusive zone: segments
                y600isArray: Array.isArray(y600),
                y600min: Array.isArray(y600) && y600.length > 0 ? y600[0].min : null,
                y600max: Array.isArray(y600) && y600.length > 0 ? y600[0].max : null,
                y900isArray: Array.isArray(y900),
                // boundary
                y1200exists: y1200,
            };
        });

        // 600mm zone: infinite hiding
        expect(result.yNeg300isNull).toBe(true);
        expect(result.y300isNull).toBe(true);
        // 600mm-1200mm exclusive zone: projection-limited segments
        expect(result.y600isArray).toBe(true);
        expect(result.y600min).toBe(0);
        expect(result.y600max).toBe(3600);
        expect(result.y900isArray).toBe(true);
        // boundary: not restricted
        expect(result.y1200exists).toBe(false);
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
                // x=3300 is NOT restricted by internal wall
                x3300restricted: restrictedX.has(3300),
            };
        });

        expect(result.x300restricted).toBe(true);
        expect(result.x3300restricted).toBe(false);
    });

    test('unit: standalone walls create infinite restrictions (not segments)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Two standalone horizontal walls at y=0
            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 0, 9000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());
            const y300 = restrictedY.get(300);

            return {
                y300isNull: y300 === null,
            };
        });

        expect(result.y300isNull).toBe(true);
    });

    test('unit: drawGrid completes without error with mixed restrictions', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            sim.state.walls.push(new Wall(0, 1800, 3000, 1800, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            renderer.draw();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());
            const y2100 = restrictedY.get(2100);

            return {
                drawCompleted: true,
                y2100isNull: y2100 === null,
            };
        });

        expect(result.drawCompleted).toBe(true);
        expect(result.y2100isNull).toBe(true);
    });

    test('e2e: drawing a wall creates gridline restrictions', async ({ page }) => {
        const canvasBox = await page.locator('#mainCanvas').boundingBox();
        const centerX = canvasBox.x + canvasBox.width / 2;
        const centerY = canvasBox.y + canvasBox.height / 2;

        await page.click('#drawWallBtn');
        await page.waitForTimeout(100);

        await page.mouse.click(centerX - 200, centerY);
        await page.waitForTimeout(100);
        await page.mouse.click(centerX + 200, centerY);
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const renderer = window.__renderer2D;
            const sim = window.__sim;

            const wallCount = sim.state.walls.length;
            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());

            let hasNullRestrictions = false;
            for (const [coord, value] of restrictedY) {
                if (value === null) {
                    hasNullRestrictions = true;
                    break;
                }
            }

            return {
                wallCount,
                hasRestrictedY: restrictedY.size > 0,
                hasNullRestrictions,
            };
        });

        expect(result.wallCount).toBeGreaterThan(0);
        expect(result.hasRestrictedY).toBe(true);
        expect(result.hasNullRestrictions).toBe(true);
    });
});
