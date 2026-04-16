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

            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            return {
                restrictedYIsMap: restrictedY instanceof Map,
                restrictedXIsMap: restrictedX instanceof Map,
                y300isNull: restrictedY.get(300) === null,
                yNeg300isNull: restrictedY.get(-300) === null,
                y600exists: restrictedY.has(600),
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

    test('unit: envelope wall uses null for 600mm and segments for 1200mm exclusive zone', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            sim.state.walls.push(new Wall(0, 0, 3600, 0, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 0, 3600, 3600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3600, 3600, 0, 3600, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(0, 3600, 0, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedY } = renderer.getRestrictedGridCoords(new Set());

            const yNeg300 = restrictedY.get(-300);
            const y300 = restrictedY.get(300);
            const y600 = restrictedY.get(600);
            const y900 = restrictedY.get(900);

            return {
                yNeg300isNull: yNeg300 === null,
                y300isNull: y300 === null,
                y600isArray: Array.isArray(y600),
                y600min: Array.isArray(y600) && y600.length > 0 ? y600[0].min : null,
                y600max: Array.isArray(y600) && y600.length > 0 ? y600[0].max : null,
                y900isArray: Array.isArray(y900),
                y1200exists: restrictedY.has(1200),
            };
        });

        expect(result.yNeg300isNull).toBe(true);
        expect(result.y300isNull).toBe(true);
        expect(result.y600isArray).toBe(true);
        expect(result.y600min).toBe(0);
        expect(result.y600max).toBe(3600);
        expect(result.y900isArray).toBe(true);
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

            sim.state.walls.push(new Wall(0, 0, 6000, 0, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 0, 6000, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(6000, 6000, 0, 6000, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(0, 6000, 0, 0, 200, 2700, null, 0));
            sim.state.walls.push(new Wall(3000, 0, 3000, 6000, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedX } = renderer.getRestrictedGridCoords(new Set());

            return {
                x300restricted: restrictedX.has(300),
                x3300restricted: restrictedX.has(3300),
            };
        });

        expect(result.x300restricted).toBe(true);
        expect(result.x3300restricted).toBe(false);
    });

    test('unit: drawGrid completes without error', async ({ page }) => {
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
            return {
                drawCompleted: true,
                y2100isNull: restrictedY.get(2100) === null,
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
                if (value === null) { hasNullRestrictions = true; break; }
            }

            return { wallCount, hasRestrictedY: restrictedY.size > 0, hasNullRestrictions };
        });

        expect(result.wallCount).toBeGreaterThan(0);
        expect(result.hasRestrictedY).toBe(true);
        expect(result.hasNullRestrictions).toBe(true);
    });
});
