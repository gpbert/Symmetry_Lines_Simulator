import { test, expect } from '@playwright/test';

async function clickAtMm(page, mmX, mmY) {
    const pos = await page.evaluate(({ mmX, mmY }) => {
        const canvas = document.getElementById('mainCanvas');
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + mmX * 0.15, y: rect.top + mmY * 0.15 };
    }, { mmX, mmY });
    await page.mouse.click(pos.x, pos.y);
}

async function moveToMm(page, mmX, mmY) {
    const pos = await page.evaluate(({ mmX, mmY }) => {
        const canvas = document.getElementById('mainCanvas');
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + mmX * 0.15, y: rect.top + mmY * 0.15 };
    }, { mmX, mmY });
    await page.mouse.move(pos.x, pos.y);
}

async function getWalls(page) {
    return page.evaluate(() => {
        return window.__state.walls.map(w => ({
            ax: w.pointA.x, ay: w.pointA.y,
            bx: w.pointB.x, by: w.pointB.y,
            thickness: w.thickness,
            nx: w.n.x, ny: w.n.y,
            dNormX: w.dNorm.x, dNormY: w.dNorm.y,
            floorId: w.floorId,
        }));
    });
}

async function getWallFlipped(page) {
    return page.evaluate(() => window.__interactionState?.wallFlipped ?? false);
}

async function getPreviewWallN(page) {
    return page.evaluate(() => {
        const i = window.__interactionState;
        const sim = window.__sim;
        const dw = i.drawingWall, tp = i.tempPoint, wf = i.wallFlipped;
        if (!dw || !tp) return null;
        const sx = wf ? tp.x : dw.x, sy = wf ? tp.y : dw.y;
        const ex = wf ? dw.x : tp.x, ey = wf ? dw.y : tp.y;
        const w = new sim.Wall(sx, sy, ex, ey, 200, 2700, null, 0);
        return w.length > 0 ? { nx: w.n.x, ny: w.n.y } : null;
    });
}

test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForSelector('#mainCanvas');
    await page.waitForTimeout(300);
});

test.describe('Auto-flip: orientation matching on same grid line', () => {
    test('horizontal: drawing right-to-left matches left-to-right wall', async ({ page }) => {
        await clickAtMm(page, 1200, 1500);
        await clickAtMm(page, 3000, 1500);

        await clickAtMm(page, 4200, 1500);
        await moveToMm(page, 3600, 1500);

        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);

        const n = await getPreviewWallN(page);
        const walls = await getWalls(page);
        expect(n.ny).toBe(walls[0].ny);
    });

    test('horizontal: drawing same direction as existing — no flip', async ({ page }) => {
        await clickAtMm(page, 1200, 1500);
        await clickAtMm(page, 3000, 1500);

        await clickAtMm(page, 3600, 1500);
        await moveToMm(page, 5400, 1500);

        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });

    test('vertical: drawing bottom-to-top matches top-to-bottom wall', async ({ page }) => {
        await clickAtMm(page, 2000, 600);
        await clickAtMm(page, 2000, 1800);

        await clickAtMm(page, 2000, 3600);
        await moveToMm(page, 2000, 3000);

        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(true);

        const n = await getPreviewWallN(page);
        const walls = await getWalls(page);
        expect(n.nx).toBe(walls[0].nx);
    });

    test('no flip when no existing walls', async ({ page }) => {
        await clickAtMm(page, 2000, 2000);
        await moveToMm(page, 3000, 2000);

        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });

    test('wallFlipped resets on new draw start', async ({ page }) => {
        await clickAtMm(page, 2000, 2000);
        const flipped = await getWallFlipped(page);
        expect(flipped).toBe(false);
    });
});

test.describe('Wall merging', () => {
    test('overlapping walls merge into one on placement', async ({ page }) => {
        await clickAtMm(page, 1200, 1500);
        await clickAtMm(page, 3000, 1500);
        expect((await getWalls(page)).length).toBe(1);

        await clickAtMm(page, 2400, 1500);
        await clickAtMm(page, 4200, 1500);

        const walls = await getWalls(page);
        expect(walls.length).toBe(1);
    });

    test('merge adopts new wall thickness', async ({ page }) => {
        await clickAtMm(page, 1200, 1500);
        await clickAtMm(page, 3000, 1500);
        expect((await getWalls(page))[0].thickness).toBe(200);

        await page.selectOption('#wallThickness', '300');
        await clickAtMm(page, 2400, 1500);
        await clickAtMm(page, 4200, 1500);

        const walls = await getWalls(page);
        expect(walls.length).toBe(1);
        expect(walls[0].thickness).toBe(300);
    });
});

test.describe('Thickness conversion', () => {
    test('all aligned walls convert to new thickness on placement', async ({ page }) => {
        await clickAtMm(page, 600, 1500);
        await clickAtMm(page, 1800, 1500);
        await clickAtMm(page, 2400, 1500);
        await clickAtMm(page, 3600, 1500);
        expect((await getWalls(page)).length).toBe(2);

        await page.selectOption('#wallThickness', '300');
        await clickAtMm(page, 4200, 1500);
        await clickAtMm(page, 5400, 1500);

        const walls = await getWalls(page);
        walls.forEach(w => expect(w.thickness).toBe(300));
    });
});

test.describe('No JS errors during drawing', () => {
    test('no errors when drawing near walls with different thickness', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await clickAtMm(page, 1200, 1500);
        await clickAtMm(page, 3000, 1500);

        await page.selectOption('#wallThickness', '300');
        await clickAtMm(page, 1200, 1500);
        await moveToMm(page, 3000, 1500);
        await moveToMm(page, 2400, 1500);
        await moveToMm(page, 1800, 1500);

        expect(errors.length).toBe(0);
    });
});
