import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000/index.html';

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Hide Unavailable Gridlines', () => {

    test('unit: getRestrictedGridCoords returns restricted coordinates for a horizontal wall', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Place a horizontal wall at y=0 (pointA.y = 0)
            // Wall faces upward (n.y < 0), so restriction is 600mm on both sides
            // since it's not in an envelope
            sim.state.walls.push(new Wall(0, 0, 3000, 0, 200, 2700, null, 0));
            sim.updateBuildingEnvelopes();

            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            return {
                // y=300 is 300mm from wall at y=0 — within 600mm, should be restricted
                y300restricted: restrictedY.has(300),
                // y=-300 is 300mm from wall at y=0 — within 600mm, should be restricted
                yNeg300restricted: restrictedY.has(-300),
                // y=600 is exactly 600mm — NOT restricted (boundary is valid)
                y600restricted: restrictedY.has(600),
                // y=900 is 900mm — NOT restricted
                y900restricted: restrictedY.has(900),
                // x coordinates should not be restricted (wall is horizontal, restricts y only)
                hasAnyRestrictedX: restrictedX.size > 0,
            };
        });

        expect(result.y300restricted).toBe(true);
        expect(result.yNeg300restricted).toBe(true);
        expect(result.y600restricted).toBe(false);
        expect(result.y900restricted).toBe(false);
        expect(result.hasAnyRestrictedX).toBe(false);
    });

    test('unit: getRestrictedGridCoords returns 1200mm restriction for envelope wall external side', async ({ page }) => {
        const result = await page.evaluate(() => {
            const sim = window.__sim;
            const Wall = sim.Wall;
            const renderer = window.__renderer2D;

            sim.state.walls = [];
            sim.state.buildingEnvelopes = [];
            sim.state.returningWallOverrides.clear();

            // Build a rectangular envelope: walls at y=0 (top), y=3600 (bottom),
            // x=0 (left), x=3600 (right)
            sim.state.walls.push(new Wall(0, 0, 3600, 0, 200, 2700, null, 0));       // top, faces outward (n.y < 0)
            sim.state.walls.push(new Wall(3600, 0, 3600, 3600, 200, 2700, null, 0));  // right
            sim.state.walls.push(new Wall(3600, 3600, 0, 3600, 200, 2700, null, 0));  // bottom
            sim.state.walls.push(new Wall(0, 3600, 0, 0, 200, 2700, null, 0));        // left

            sim.updateBuildingEnvelopes();

            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            // Top wall at y=0: Wall(0,0,3600,0) → d=(1,0) → n=(0,+1)
            // Normal (+y) side is external face: 1200mm restriction
            // Opposite (-y) side: 600mm restriction
            return {
                // -y side (opposite normal): 600mm zone
                yNeg300: restrictedY.has(-300),   // 300mm away — restricted
                yNeg600: restrictedY.has(-600),   // boundary — NOT restricted
                // +y side (normal/external face): 1200mm zone
                y300: restrictedY.has(300),        // 300mm — restricted
                y600: restrictedY.has(600),        // 600mm — restricted
                y900: restrictedY.has(900),        // 900mm — restricted
                y1200: restrictedY.has(1200),      // boundary — NOT restricted
            };
        });

        // -y side: 600mm zone
        expect(result.yNeg300).toBe(true);
        expect(result.yNeg600).toBe(false);
        // +y side (external face): 1200mm zone
        expect(result.y300).toBe(true);
        expect(result.y600).toBe(true);
        expect(result.y900).toBe(true);
        expect(result.y1200).toBe(false);
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

            // x=3300 is 300mm from internal wall at x=3000
            // Internal walls should NOT generate restrictions
            // But x=3300 might be restricted by envelope wall at x=0 or x=6000
            // x=300 IS restricted by envelope wall at x=0
            // x=3300 is NOT restricted by envelope walls (too far from x=0 and x=6000)
            return {
                x300restrictedByEnvelope: restrictedX.has(300),
                x3300notRestrictedByInternal: !restrictedX.has(3300),
            };
        });

        expect(result.x300restrictedByEnvelope).toBe(true);
        expect(result.x3300notRestrictedByInternal).toBe(true);
    });

    test('e2e: drawing a wall dynamically hides nearby gridlines', async ({ page }) => {
        // Get canvas center for coordinate calculation
        const canvasBox = await page.locator('#mainCanvas').boundingBox();
        const centerX = canvasBox.x + canvasBox.width / 2;
        const centerY = canvasBox.y + canvasBox.height / 2;

        // Ensure draw mode is active
        await page.click('#drawWallBtn');
        await page.waitForTimeout(100);

        // Draw a horizontal wall by clicking two points
        // Click first point (left of center)
        await page.mouse.click(centerX - 200, centerY);
        await page.waitForTimeout(100);

        // Click second point (right of center) to complete wall
        await page.mouse.click(centerX + 200, centerY);
        await page.waitForTimeout(300);

        // Verify that restricted grid coords are now populated
        const result = await page.evaluate(() => {
            const renderer = window.__renderer2D;
            const sim = window.__sim;

            // There should be at least one wall now
            const wallCount = sim.state.walls.length;

            // Get restricted coords
            const { restrictedX, restrictedY } = renderer.getRestrictedGridCoords(new Set());

            return {
                wallCount,
                hasRestrictedY: restrictedY.size > 0,
                totalRestrictedY: restrictedY.size,
            };
        });

        expect(result.wallCount).toBeGreaterThan(0);
        expect(result.hasRestrictedY).toBe(true);
    });
});
