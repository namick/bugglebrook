import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAZA_X, POND_X, clickSlot, jumpTo, launchApp, toClient } from './app';
import type { TestHook } from './app';

// R04 and R34: the world's ambient critters and the signs of life from bugs
// waiting to be found. Critters are render-only scenery, read through
// `__bb.critters()`; the hand is the real mouse.

type Command = Parameters<TestHook['send']>[0];
type Critter = ReturnType<TestHook['critters']>[number];

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const critters = (page: Page, area: string): Promise<Critter[]> =>
  page.evaluate((a) => window.__bb!.critters().filter((c) => c.area === a), area);

const AREAS: readonly [string, number, string[], string[]][] = [
  ['area_flowerbed_stage', 0, ['butterfly', 'bee'], ['moth', 'firefly', 'cricket']],
  ['area_puddle_pond', POND_X, ['boatman', 'skater', 'fish'], ['boatman', 'fish', 'cricket']],
  ['area_stump_plaza', PLAZA_X, ['ant', 'butterfly'], ['moth', 'cricket']],
  ['area_compost_lab', 134.4, ['butterfly'], ['moth', 'cricket']],
  ['area_treehouse_arcade', 163.2, ['bird'], ['moth', 'firefly']],
];

test('every area has critters by day and by night', async () => {
  test.setTimeout(240_000);
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    // The porch too: the compost lab and the treehouse are past it.
    for (const id of [...AREAS.map(([a]) => a), 'area_under_porch'])
      await send(page, { type: 'unlock', area: id });
    for (const [hour, day] of [
      [12, true],
      [23, false],
    ] as const) {
      await send(page, { type: 'set_time', hour });
      await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
      for (const [id, x, byDay, byNight] of AREAS) {
        await jumpTo(page, x + 1);
        const want = day ? byDay : byNight;
        await expect
          .poll(async () => (await critters(page, id)).filter((c) => want.includes(c.kind)).length, {
            message: `${id} at ${hour}:00`,
          })
          .toBeGreaterThan(0);
        // Night flyers stay home by day, and day flyers by night.
        const kinds = new Set((await critters(page, id)).map((c) => c.kind));
        for (const k of day ? ['moth', 'firefly', 'cricket'] : ['butterfly', 'bee', 'ant', 'bird'])
          expect(kinds.has(k as Critter['kind']), `${k} in ${id} at ${hour}:00`).toBe(false);
      }
    }
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the ant line scatters from the hand and forms up again', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await send(page, { type: 'set_time', hour: 12 });
    // Bugs startle ants too, and Dot and Rollo start on the ant line, so take
    // the plaza's bugs out: only the hand may scatter the line here.
    const bugs = (await page.evaluate(() => window.__bb!.entities())).filter(
      (e) => e.kind === 'bug' && e.x > PLAZA_X - 2 && e.x < PLAZA_X + 40,
    );
    for (const b of bugs) await send(page, { type: 'despawn', id: b.id });
    await jumpTo(page, PLAZA_X);
    const ants = (): Promise<Critter[]> =>
      critters(page, 'area_stump_plaza').then((all) => all.filter((c) => c.kind === 'ant'));
    await expect.poll(async () => (await ants()).length).toBeGreaterThanOrEqual(6);
    await expect.poll(async () => (await ants()).filter((a) => a.startled).length).toBe(0);
    // Put the hand down right on an ant on the flat ground past the hill.
    const target =
      (await ants()).filter((a) => a.x > PLAZA_X + 5).sort((a, b) => a.x - b.x)[0] ?? (await ants())[0]!;
    const at = await toClient(page, target.x, target.y);
    await page.mouse.move(at.x, at.y - 60, { steps: 4 });
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await expect.poll(async () => (await ants()).filter((a) => a.startled).length).toBeGreaterThan(0);
    // Nobody grabbed anything: ants are scenery.
    expect(await page.evaluate(() => window.__bb!.entities().filter((e) => e.held).length)).toBe(0);
    // Take the hand away: they re-form.
    await page.mouse.move(at.x, 80, { steps: 4 });
    await expect
      .poll(async () => (await ants()).filter((a) => a.startled).length, { timeout: 10_000 })
      .toBe(0);
  } finally {
    await bb.close();
  }
});

test('bugs waiting to be found show signs of life, and idle bugs skip redraws', async () => {
  test.setTimeout(120_000);
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    const life = (defId: string): Promise<number> =>
      page.evaluate((d) => window.__bb!.pendingLife().find((p) => p.defId === d)?.life ?? -1, defId);
    // Twig, disguised as a twig in the plaza: a feeler twitch or a blink every few seconds.
    const twig = (await page.evaluate(() => window.__bb!.entities())).find(
      (e) => e.defId === 'bug_stickinsect_twig',
    )!;
    await jumpTo(page, twig.x - 8);
    await expect
      .poll(() => life('bug_stickinsect_twig'), { timeout: 15_000, intervals: [50] })
      .toBeGreaterThan(0.5);
    // R36: still bugs keep their drawings while they breathe.
    const before = await page.evaluate(() => window.__bb!.bugRedraws());
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => window.__bb!.bugRedraws());
    expect(after.drawn).toBeGreaterThan(before.drawn);
    expect(after.skipped - before.skipped).toBeGreaterThan(after.drawn - before.drawn);
    // Moose stuck on his back and Barty aloof, in the compost lab.
    for (const id of ['area_under_porch', 'area_compost_lab']) await send(page, { type: 'unlock', area: id });
    await jumpTo(page, 134.4 + 3);
    await expect
      .poll(() => life('bug_stagbeetle_moose'), { timeout: 15_000, intervals: [50] })
      .toBeGreaterThan(0.8);
    await expect
      .poll(() => life('bug_dungbeetle_barty'), { timeout: 15_000, intervals: [50] })
      .toBeGreaterThan(0.5);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
