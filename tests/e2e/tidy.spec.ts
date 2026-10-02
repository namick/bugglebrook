import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  entities,
  frames,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  toClient,
} from './app';
import type { TestHook } from './app';

// Playtest F1 and F2 with the real mouse: the trash can eats what the hand
// drops in and sends it home later, and the tidy whistle sends loose things
// home. The sim is frozen and stepped frame by frame, so each test runs the
// same on CI's slow software renderer.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);

const CAN = PLAZA_X + 33;
/** Where the mint leaf lives: the plaza's start list puts it here. */
const MINT_HOME = PLAZA_X + 2.6;

/** Drop a new thing at world (x, y) and step until it lies still. */
async function stage(page: Page, defId: string, x: number, y = 8): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await send(page, { type: 'spawn', kind: 'item', defId, x, y });
  await frames(page, 30);
  return (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
}

const trash = async (page: Page) => (await page.evaluate(() => window.__bb!.trash()))!;

async function eventNames(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__bb!.events().map((e) => e.name));
}

test('a thing dropped in the trash can is chomped, and comes home later', async () => {
  const { app, page } = await launchApp();
  try {
    await openFrozen(page, 0);
    await jumpTo(page, CAN - 9.6);
    const leaf = await stage(page, 'item_mint_leaf', CAN - 3);
    const at = await pressFrozen(page, leaf);
    const mouth = (await trash(page)).mouth;
    const over = await toClient(page, mouth.x, mouth.y - 0.45);
    await glideFrames(page, at, over.x - at.x, over.y - at.y, 12, 2);
    // Held still over the mouth (a gentle let-go, not a throw), the lid gapes for it.
    await frames(page, 10);
    await expect.poll(async () => (await trash(page)).lid).toBeGreaterThan(0.6);
    await page.mouse.up();
    await frames(page, 4);
    expect((await entities(page)).some((e) => e.id === leaf)).toBe(false);
    expect((await trash(page)).inside).toEqual(['item_mint_leaf']);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('trash_chomp');
    // A burp, and the lid clangs shut.
    await frames(page, 50);
    expect(await eventNames(page)).toContain('trash_burped');
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('trash_burp');
    // Later it drops back in over its home spot, far off in the plaza.
    await page.evaluate(() => window.__bb!.step(41 * 60));
    expect((await trash(page)).inside).toEqual([]);
    expect(await eventNames(page)).toContain('item_came_home');
    await page.evaluate(() => window.__bb!.step(120));
    const mints = (await entities(page)).filter((e) => e.defId === 'item_mint_leaf');
    expect(mints.some((m) => Math.abs(m.x - MINT_HOME) < 2.5)).toBe(true);
    expect((await trash(page)).eaten).toBe(1);
  } finally {
    await app.close();
  }
});

test('the tidy whistle sends loose things in view home with a click', async () => {
  const { app, page } = await launchApp();
  try {
    await openFrozen(page, 0);
    await jumpTo(page, CAN - 9.6);
    const strays = [
      await stage(page, 'item_mint_leaf', CAN - 6),
      await stage(page, 'item_flashlight_pen', CAN - 4.5),
    ];
    const whistle = (await page.evaluate(() => window.__bb!.tidy())).whistle!;
    const w = (await entities(page)).find((e) => e.id === whistle)!;
    const p = await toClient(page, w.x, w.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 2);
    const tidy = await page.evaluate(() => window.__bb!.tidy());
    expect(tidy.blown).toBe(1);
    expect(tidy.queued).toBe(2);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('whistle_toot');
    await frames(page, 40);
    // Off they swoosh, one after the other.
    const tidied = await page.evaluate(() =>
      window
        .__bb!.events()
        .filter((e) => e.name === 'item_tidied')
        .map((e) => (e.payload as { id: number }).id),
    );
    expect(tidied.sort()).toEqual([...strays].sort());
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('tidy_swoosh');
    await frames(page, 240);
    const all = await entities(page);
    const mint = all.find((e) => e.id === strays[0])!;
    const pen = all.find((e) => e.id === strays[1])!;
    expect(Math.abs(mint.x - MINT_HOME)).toBeLessThan(2.5);
    expect(Math.abs(pen.x - (PLAZA_X + 0.45))).toBeLessThan(2.5);
    // The whistle stays where it was.
    expect(Math.abs(all.find((e) => e.id === whistle)!.x - w.x)).toBeLessThan(0.5);
  } finally {
    await app.close();
  }
});

test('the trash can will not eat the tidy whistle: it spits it back out (P-26)', async () => {
  const { app, page } = await launchApp();
  try {
    await openFrozen(page, 0);
    await jumpTo(page, CAN - 9.6);
    const whistle = (await page.evaluate(() => window.__bb!.tidy())).whistle!;
    const at = await pressFrozen(page, whistle);
    const mouth = (await trash(page)).mouth;
    const over = await toClient(page, mouth.x, mouth.y - 0.45);
    await glideFrames(page, at, over.x - at.x, over.y - at.y, 12, 2);
    await frames(page, 10);
    await page.mouse.up();
    await frames(page, 30);
    // Still in the world, nothing inside, and a "nope".
    expect((await entities(page)).some((e) => e.id === whistle)).toBe(true);
    expect((await trash(page)).inside).toEqual([]);
    expect(await eventNames(page)).toContain('trash_spat');
    expect(await eventNames(page)).not.toContain('trash_chomped');
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('trash_nope');
  } finally {
    await app.close();
  }
});
