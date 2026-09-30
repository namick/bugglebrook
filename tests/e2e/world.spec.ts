import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAZA_X, clickSlot, entities, entity, launchApp, waitForScene } from './app';
import type { EntityView } from './app';

/** The item farthest from any bug, so a wandering bug is not grabbed instead. */
async function lonelyItem(page: Page): Promise<EntityView> {
  const all = await entities(page);
  const bugs = all.filter((e) => e.kind === 'bug');
  const items = all.filter((e) => e.kind === 'item');
  const distance = (e: EntityView): number => Math.min(...bugs.map((b) => Math.abs(b.x - e.x)));
  const onScreen = items.filter((e) => e.x > PLAZA_X + 4 && e.x < PLAZA_X + 15 && e.defId !== 'item_leaf');
  return onScreen.sort((a, b) => distance(b) - distance(a))[0]!;
}

async function dragWithMouse(page: Page, from: EntityView, dxPx: number, dyPx: number): Promise<void> {
  const start = await page.evaluate(([x, y]) => window.__bb!.worldToClient(x!, y!), [from.x, from.y]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect.poll(async () => (await entity(page, from.id))?.held).toBe(true);
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + (dxPx * i) / steps, start.y + (dyPx * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

test('choosing a slot opens the world, and dragging a prop with the mouse moves it', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);

    const all = await entities(page);
    expect(all.filter((e) => e.kind === 'bug').length).toBe(4);
    expect(all.filter((e) => e.kind === 'item').length).toBeGreaterThanOrEqual(10);

    // Bugs wander on their own.
    const tick0 = await page.evaluate(() => window.__bb!.tick());
    await expect.poll(() => page.evaluate(() => window.__bb!.tick())).toBeGreaterThan(tick0 + 30);

    const prop = await lonelyItem(page);
    await dragWithMouse(page, prop, 250, -200);

    await expect.poll(async () => (await entity(page, prop.id))!.held).toBe(false);
    const moved = (await entity(page, prop.id))!;
    expect(Math.hypot(moved.x - prop.x, moved.y - prop.y)).toBeGreaterThan(1);
    expect(moved.x).toBeGreaterThan(prop.x + 1);

    const sounds = await page.evaluate(() => window.__bb!.sfxLog());
    expect(sounds).toContain('grab');
    expect(sounds.some((s) => s === 'drop' || s === 'fling')).toBe(true);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('dragging empty space pans the camera', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 1);
    const before = (await page.evaluate(() => window.__bb!.camera())).x;
    // Sky is always empty; drag it left to look right.
    const a = await page.evaluate(() => window.__bb!.worldToClient(window.__bb!.camera().x + 15, 2));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(a.x - i * 40, a.y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.camera())).x)
      .toBeGreaterThan(before + 1);
  } finally {
    await bb.close();
  }
});

test('the world autosaves, survives going home, and survives a restart', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    await clickSlot(bb.page, 2);
    const before = new Set((await entities(bb.page)).map((e) => e.id));
    await bb.page.evaluate(() =>
      window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: 9, y: 3 }),
    );
    await expect.poll(async () => (await entities(bb.page)).some((e) => !before.has(e.id))).toBe(true);
    const pebble = (await entities(bb.page)).find((e) => !before.has(e.id))!;

    // Home button saves and returns to the menu.
    const home = await bb.page.evaluate(() => window.__bb!.homeButtonClient());
    await bb.page.mouse.click(home!.x, home!.y);
    await waitForScene(bb.page, 'menu');
    const slots = await bb.page.evaluate(() => window.__bb!.listSlots());
    expect(slots.map((s) => s.exists)).toEqual([false, false, true]);

    await bb.close({ keepUserData: true });
    bb = await launchApp(userData);
    await clickSlot(bb.page, 2);
    const restored = await entities(bb.page);
    expect(restored.find((e) => e.id === pebble.id)?.defId).toBe('item_pebble');
    expect(restored.filter((e) => e.kind === 'bug')).toHaveLength(4);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the sim pauses while the window is hidden', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(true);
    const t = await page.evaluate(() => window.__bb!.tick());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__bb!.tick())).toBe(t);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => window.__bb!.tick())).toBeGreaterThan(t);
  } finally {
    await bb.close();
  }
});
