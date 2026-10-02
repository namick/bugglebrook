import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  DEPTHS_X,
  HOLLOW_X,
  PLAZA_X,
  entities,
  entity,
  frames,
  framesUntil,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  toClient,
} from './app';
import type { TestHook } from './app';

// M10's hidden areas (game design doc, section 3, areas 7 and 8), driven
// with the real mouse: through the ant hill and back, carrying something
// down, feeding the queen, the gnome's sniffle, and the telescope. The sim
// is frozen and stepped frame by frame, so the 600 ms iris wipe and the
// doorway's dwell take the same frames on any machine.

type Command = Parameters<TestHook['send']>[0];
type Hidden = NonNullable<ReturnType<TestHook['hidden']>>;

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const hidden = async (page: Page): Promise<Hidden> => (await page.evaluate(() => window.__bb!.hidden()))!;
const door = async (page: Page, id: string): Promise<{ x: number; y: number }> =>
  (await hidden(page)).doors.find((d) => d.id === id)!;
const secrets = (page: Page): Promise<string[]> => page.evaluate(() => window.__bb!.secrets());

/** Open an area as if its secret had been found, and take a frame so it lands. */
async function unlock(page: Page, area: string): Promise<void> {
  await send(page, { type: 'unlock', area });
  await frames(page, 2);
}

/** Click a doorway with the real mouse and run the wipe through. */
async function clickDoor(page: Page, id: string): Promise<void> {
  const d = await door(page, id);
  const at = await toClient(page, d.x, d.y);
  await page.mouse.move(at.x, at.y);
  await frames(page, 2);
  await page.mouse.down();
  await page.mouse.up();
  await frames(page, 2);
  expect((await hidden(page)).wiping).toBe(true);
  expect(await framesUntil(page, async () => !(await hidden(page)).wiping, 120, 10)).toBe(true);
}

test('through the ant hill into the depths and back out, with the real mouse', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    const hill = await door(page, 'fix_ant_hill');
    expect((await hidden(page)).doors.find((d) => d.id === 'fix_ant_hill')!.open).toBe(false);
    await unlock(page, 'area_ant_hill_depths');
    expect(await secrets(page)).toContain('secret_ant_sugar');
    await jumpTo(page, hill.x - 6);
    await clickDoor(page, 'fix_ant_hill');
    let h = await hidden(page);
    expect(h.area).toBe('area_ant_hill_depths');
    expect(h.inside).toBe(true);
    expect(h.trips).toBe(1);
    const cam = (await page.evaluate(() => window.__bb!.camera())).x;
    expect(cam).toBeGreaterThanOrEqual(DEPTHS_X);
    expect(cam).toBeLessThan(HOLLOW_X);
    // The sealed depths are all the camera may show: scrolling cannot leave.
    const mid = await toClient(page, DEPTHS_X + 10, 5);
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, -4000);
    await frames(page, 30);
    expect((await page.evaluate(() => window.__bb!.camera())).x).toBeGreaterThanOrEqual(DEPTHS_X);
    await clickDoor(page, 'fix_depths_shaft');
    h = await hidden(page);
    expect(h.area).toBe('area_stump_plaza');
    expect(h.inside).toBe(false);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('iris');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a pebble held over the open ant hill goes down with the hand', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 1);
    await unlock(page, 'area_ant_hill_depths');
    const hill = await door(page, 'fix_ant_hill');
    await jumpTo(page, hill.x - 6);
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_pebble', x: hill.x + 3, y: 8 });
    await frames(page, 60);
    const pebble = (await entities(page))
      .filter((e) => e.defId === 'item_pebble')
      .sort((a, b) => b.id - a.id)[0]!;
    const from = await pressFrozen(page, pebble.id);
    const to = await toClient(page, hill.x, hill.y);
    await glideFrames(page, from, to.x - from.x, to.y - from.y, 10, 2);
    // Held there a moment, it goes through.
    expect(await framesUntil(page, async () => (await hidden(page)).trips === 1, 90, 6)).toBe(true);
    expect(await framesUntil(page, async () => !(await hidden(page)).wiping, 90, 6)).toBe(true);
    const e = (await entity(page, pebble.id))!;
    expect(e.held).toBe(true);
    expect(e.x).toBeGreaterThan(DEPTHS_X);
    expect(e.x).toBeLessThan(HOLLOW_X);
    await page.mouse.up();
    await frames(page, 60);
    const after = (await entity(page, pebble.id))!;
    expect(after.x).toBeGreaterThan(DEPTHS_X);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('feeding the ant queen a honey drop: she dances and gives her monocle', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 2);
    await unlock(page, 'area_ant_hill_depths');
    const hill = await door(page, 'fix_ant_hill');
    await jumpTo(page, hill.x - 6);
    await clickDoor(page, 'fix_ant_hill');
    const queen = (await page.evaluate(() => window.__bb!.fixture('fix_ant_queen')))!;
    await jumpTo(page, queen.x - 9.6);
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_honey_drop', x: queen.x - 3, y: 8 });
    await frames(page, 60);
    const honey = (await entities(page)).find((e) => e.defId === 'item_honey_drop' && e.x > DEPTHS_X)!;
    const from = await pressFrozen(page, honey.id);
    const to = await toClient(page, queen.x, 7.7);
    await glideFrames(page, from, to.x - from.x, to.y - from.y, 12, 2);
    await frames(page, 10);
    await page.mouse.up();
    expect(
      await framesUntil(page, async () => (await secrets(page)).includes('secret_queen_sweet'), 240, 10),
    ).toBe(true);
    const h = await hidden(page);
    expect(h.depths.queenFed).toBe(1);
    expect(h.depths.dancing).toBe(true);
    expect((await entities(page)).some((e) => e.defId === 'item_acc_monocle')).toBe(true);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('hovering the gnome sniffles, and the telescope shows the cast in the stars', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    await unlock(page, 'area_flowerbed_stage');
    const gnome = (await page.evaluate(() => window.__bb!.fixture('fix_gnome')))!;
    await jumpTo(page, 0);
    const face = await toClient(page, gnome.x, gnome.y);
    await page.mouse.move(face.x, face.y);
    await frames(page, 4);
    expect((await hidden(page)).noticed).toContain('gnome_sniffle');
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('sniffle');
    // Through the hat into the hollow (opened directly here), and a look through the telescope.
    await unlock(page, 'area_gnome_hollow');
    await clickDoor(page, 'fix_gnome_hat');
    expect((await hidden(page)).area).toBe('area_gnome_hollow');
    const tel = (await page.evaluate(() => window.__bb!.fixture('fix_gnome_telescope')))!;
    const at = await toClient(page, tel.x, tel.y);
    await page.mouse.move(at.x, at.y);
    await frames(page, 2);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 30);
    let h = await hidden(page);
    expect(h.telescope.open).toBe(true);
    expect(h.telescope.lit).toContain('bug_ladybug_dot');
    expect(h.telescope.dark).toContain('bug_tardigrade_wubbo');
    // A click anywhere puts it down.
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 30);
    h = await hidden(page);
    expect(h.telescope.open).toBe(false);
    void PLAZA_X;
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
