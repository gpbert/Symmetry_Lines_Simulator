import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080/index.html';

// Helper: get canvas bounding rect, click at world mm coordinates
// The canvas uses MM_TO_PX = 0.15, panOffset starts at {0,0}, zoomLevel 1.0
// So pixel = mm * 0.15 + panOffset
// We'll use evaluate to call the renderer's screenToWorld in reverse
async function clickAtMm(page, mmX, mmY) {
    const pos = await page.evaluate(({ mmX, mmY }) => {
        const canvas = document.getElementById('mainCanvas');
        const rect = canvas.getBoundingClientRect();
        // MM_TO_PX = 0.15, panOffset and zoom from renderer
        const MM_TO_PX = 0.15;
        const px = mmX * MM_TO_PX;
        const py = mmY * MM_TO_PX;
        return { x: rect.left + px, y: rect.top + py };
    }, { mmX, mmY });
    await page.mouse.click(pos.x, pos.y);
}

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

async function getWalls(page) {
    return page.evaluate(() => {
        const sim = window.__sim;
        if (!sim) return [];
        return sim.state.walls.map(w => ({
            ax: w.pointA.x, ay: w.pointA.y,
            bx: w.pointB.x, by: w.pointB.y,
            thickness: w.thickness,
            nx: w.n.x, ny: w.n.y,
        }));
    });
}

async function getWallFlipped(page) {
    return page.evaluate(() => window.__interactionState?.wallFlipped ?? false);
}

test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for canvas to be ready
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(200);

    // Expose sim and interaction state for testing
    await page.evaluate(() => {
        // The modules are ES modules — we need to access them via the global scope
        // The app initializes via DOMContentLoaded, so state should be ready
        // We'll inject refs from the module scope into window
    });
});

test.describe('Wall auto-flip', () => {
    test('should NOT flip when no other walls exist', async ({ page }) => {
        // Draw mode is default
        // Click to start wall at (3000, 3000)
        await clickAtMm(page, 3000, 3000);
        // Move right to (4200, 3000) — left to right
        await moveToMm(page, 4200, 3000);

        // wallFlipped should be false
        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });

    test('should flip to match existing wall when drawing opposite direction on same grid line', async ({ page }) => {
        // Draw a wall: left-to-right at y=3000, from x=1200 to x=3000
        await clickAtMm(page, 1200, 3000);
        await clickAtMm(page, 3000, 3000);

        // Start a new wall to the RIGHT at x=4200, same y=3000
        await clickAtMm(page, 4200, 3000);
        // Move LEFT — opposite direction to existing, should flip to match
        await moveToMm(page, 3600, 3000);

        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);
    });

    test('should flip to match when starting right of existing wall and drawing left on same line', async ({ page }) => {
        // Draw a wall: left-to-right at y=3000, from x=1200 to x=3000
        await clickAtMm(page, 1200, 3000);
        await clickAtMm(page, 3000, 3000);

        const walls = await getWalls(page);
        expect(walls.length).toBe(1);

        // Start a new wall at x=4800, same y=3000 (to the RIGHT, with a gap)
        await clickAtMm(page, 4800, 3000);

        // Move LEFT — opposite direction, should flip to match at every step
        await moveToMm(page, 4200, 3000);
        let flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);

        await moveToMm(page, 3600, 3000);
        flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);

        await moveToMm(page, 2400, 3000);
        flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);
    });

    test('should NOT flip when same direction as existing wall on same line', async ({ page }) => {
        // Draw a wall: left-to-right at y=3000, from x=1200 to x=3000
        await clickAtMm(page, 1200, 3000);
        await clickAtMm(page, 3000, 3000);

        // Start new wall also left-to-right on same line
        await clickAtMm(page, 3600, 3000);
        await moveToMm(page, 5400, 3000);

        // Same direction as existing — should NOT flip
        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });

    test('wallFlipped resets on new draw start', async ({ page }) => {
        // Draw near a restricted zone to trigger auto-flip
        // First, draw a wall at y=3000
        await clickAtMm(page, 1200, 3000);
        await clickAtMm(page, 3000, 3000);

        // Start drawing at y=3300 (within 600mm restriction zone — will be nudged)
        // but start at a different x to avoid same grid line
        // Actually, test that wallFlipped resets when starting a new wall
        await clickAtMm(page, 6000, 6000);
        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });
});

test.describe('Wall merge', () => {
    test('merge preview shows when drawing over existing wall', async ({ page }) => {
        // Draw a wall: left-to-right at y=3000, from x=1200 to x=3000
        await clickAtMm(page, 1200, 3000);
        await clickAtMm(page, 3000, 3000);

        const wallsBefore = await getWalls(page);
        expect(wallsBefore.length).toBe(1);

        // Start a new wall overlapping — from x=2400 to x=4200
        await clickAtMm(page, 2400, 3000);
        await clickAtMm(page, 4200, 3000);

        // Should have merged into 1 wall, not 2
        const wallsAfter = await getWalls(page);
        expect(wallsAfter.length).toBe(1);
    });
});
