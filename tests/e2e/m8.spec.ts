import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  entities,
  entity,
  frames,
  glideFrames,
  holdNearMouth,
  launchApp,
  jumpTo,
  openFrozen,
  pressFrozen,
  toClient,
} from './app';
import type { TestHook } from './app';

// M8 (game design doc, sections 8, 9, and 19): crafting and potions, with
// the real mouse. The sim is frozen and stepped frame by frame, and
// everything is staged with debug commands near where it is used, so each
// test runs the same on CI's slow software renderer.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const PORCH_X = 102.4;
const COMPOST_X = 134.4;

type Points = NonNullable<ReturnType<TestHook['m8Points']>>;
const points = async (page: Page): Promise<Points> => (await page.evaluate(() => window.__bb!.m8Points()))!;

/** Drop a new thing at world (x, y) and step until it lies still. */
async function stage(page: Page, defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await send(page, { type: 'spawn', kind: 'item', defId, x, y });
  // Dropped from just above the ground, it settles within half a second.
  await frames(page, 30);
  const id = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
  return id;
}

/**
 * A spot on the bench's table top past its left or right tray, to lay a
 * thing ready for the trays. (The floor beside the bench is under the
 * porch's plank shelf and the bench top, which a thing lifted from there
 * would bump.)
 */
const onTable = (p: Points, side: -1 | 1): [number, number] => [
  side < 0 ? p.trays[0]!.x - 0.62 : p.trays[2]!.x + 0.62,
  p.trays[0]!.y - 0.35,
];

/**
 * With the sim frozen: carry what the mouse holds up over the bench top or
 * the cauldron's rim, across to world (x, y), and let go gently.
 */
async function carryTo(page: Page, from: { x: number; y: number }, x: number, y: number): Promise<void> {
  const up = await toClient(page, x, y - 1.2);
  const at = await glideFrames(page, from, 0, up.y - from.y, 3, 3);
  const over = await glideFrames(page, at, up.x - at.x, 0, 4, 3);
  const to = await toClient(page, x, y);
  await glideFrames(page, over, to.x - over.x, to.y - over.y, 2, 3);
  await frames(page, 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await frames(page, 2);
}

/** Everyone full and happy, so nobody wanders into a staged scene. */
async function calm(page: Page): Promise<void> {
  for (const e of await entities(page))
    if (e.kind === 'bug')
      for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
        await send(page, { type: 'set_need', id: e.id, need, value: 100 });
}

test('two things dropped in the Tinker Bench’s trays and a pull of the lever make a slingshot', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await frames(page, 2);
    await calm(page);
    const p = await points(page);
    await jumpTo(page, PORCH_X + 9.4);
    const twig = await stage(page, 'item_twig', ...onTable(p, -1));
    const band = await stage(page, 'item_rubber_band', ...onTable(p, 1));
    // Into the trays, by hand.
    await carryTo(page, await pressFrozen(page, twig), p.trays[0]!.x, p.trays[0]!.y - 0.4);
    await carryTo(page, await pressFrozen(page, band), p.trays[1]!.x, p.trays[1]!.y - 0.4);
    expect((await page.evaluate(() => window.__bb!.bench())).trays.slice(0, 2)).toEqual([twig, band]);
    // Pull the clothespin lever down.
    const knob = await toClient(page, p.lever.x, p.lever.y);
    await page.mouse.move(knob.x, knob.y);
    await page.mouse.down();
    await frames(page, 1);
    await glideFrames(page, knob, 20, 110, 8, 1);
    await page.mouse.up();
    await frames(page, 2);
    expect((await page.evaluate(() => window.__bb!.bench())).busy).toBe(true);
    // It shakes for 1.2 s, then a slingshot pops out onto the table.
    await frames(page, 80);
    const made = (await entities(page)).filter((e) => e.defId === 'item_slingshot_twig');
    expect(made).toHaveLength(1);
    expect(await entity(page, twig)).toBeNull();
    expect((await page.evaluate(() => window.__bb!.bench())).made).toEqual(['recipe_slingshot']);
    const sounds = await page.evaluate(() => window.__bb!.sfxLog());
    expect(sounds).toEqual(expect.arrayContaining(['lever']));
  } finally {
    await bb.close();
  }
});

test('empty trays light up as a held thing comes near, and a craft crouches, rattles, holds, and pops while a bug gawks', async () => {
  // Three things carried by hand and a whole craft: longer than most.
  test.setTimeout(240_000);
  const bb = await launchApp();
  const { page } = bb;
  const look = async (): Promise<{ trays: number[]; phase: string; cards: string[] }> =>
    (await page.evaluate(() => window.__bb!.benchLook()))!;
  try {
    await openFrozen(page, 0);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await frames(page, 2);
    await calm(page);
    const p = await points(page);
    await jumpTo(page, PORCH_X + 9.4);
    // Before anything is found, the cork board has a how-to card and a faded hint.
    expect((await look()).cards).toEqual(['how', 'hint']);
    // A bug idling a few steps off, to gawk at the pop.
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_snail_glorp', x: p.trays[2]!.x + 4.5, y: 8 });
    await frames(page, 2);
    await calm(page);
    const box = await stage(page, 'item_matchbox', ...onTable(p, -1));
    expect((await look()).trays).toEqual([0, 0, 0]);
    // Picked up and brought near, the empty trays start to glow; right over one, it glows brightest.
    const from = await pressFrozen(page, box);
    const near = await toClient(page, p.trays[0]!.x - 1.6, p.trays[0]!.y - 1.4);
    await glideFrames(page, from, near.x - from.x, near.y - from.y, 4, 3);
    await frames(page, 20);
    // The glow eases on the screen's clock: let it get there.
    await expect.poll(async () => (await look()).trays[0]).toBeGreaterThan(0.3);
    expect((await look()).trays[0]).toBeLessThan(0.9);
    await page.mouse.up();
    await frames(page, 30);
    await carryTo(page, await pressFrozen(page, box), p.trays[0]!.x, p.trays[0]!.y - 0.4);
    // In the tray now: that tray has nothing left to ask for.
    await expect.poll(async () => (await look()).trays[0]).toBe(0);
    for (const tray of [1, 2]) {
      const button = await stage(page, 'item_button', ...onTable(p, 1));
      const held = await pressFrozen(page, button);
      const over = await toClient(page, p.trays[tray]!.x, p.trays[tray]!.y - 0.5);
      const up = await toClient(page, p.trays[tray]!.x, p.trays[tray]!.y - 1.6);
      await glideFrames(page, held, up.x - held.x, up.y - held.y, 4, 3);
      await glideFrames(page, up, over.x - up.x, over.y - up.y, 3, 3);
      await frames(page, 20);
      await expect.poll(async () => (await look()).trays[tray]).toBeGreaterThan(0.9);
      await page.mouse.up();
      await frames(page, 4);
    }
    expect((await page.evaluate(() => window.__bb!.bench())).trays.every((t) => t !== null)).toBe(true);
    // Pull the lever: it crouches, rattles, holds still for the hit-stop, then pops.
    const knob = await toClient(page, p.lever.x, p.lever.y);
    await page.mouse.move(knob.x, knob.y);
    await page.mouse.down();
    await frames(page, 1);
    await glideFrames(page, knob, 20, 110, 8, 1);
    await page.mouse.up();
    const phases: string[] = [];
    for (let i = 0; i < 90; i += 2) {
      await frames(page, 2);
      phases.push((await look()).phase);
    }
    const order = phases.filter((ph, i) => ph !== phases[i - 1]);
    expect(order).toEqual(expect.arrayContaining(['rattle', 'hold', 'idle']));
    expect(order.indexOf('rattle')).toBeLessThan(order.indexOf('hold'));
    expect(order.lastIndexOf('hold')).toBeLessThan(order.lastIndexOf('idle'));
    expect((await entities(page)).filter((e) => e.defId === 'item_matchbox_racer')).toHaveLength(1);
    const names = (await page.evaluate(() => window.__bb!.events())).map((e) => e.name);
    expect(names).toContain('bug_gawked');
    const sounds = await page.evaluate(() => window.__bb!.sfxLog());
    expect(sounds).toEqual(expect.arrayContaining(['bench_rattle', 'craft_pop', 'craft_tada']));
    // Made, the hint card gives way.
    expect((await look()).cards).toEqual(['how']);
  } finally {
    await bb.close();
  }
});

test('a mushroom dropped in the cauldron and stirred round twice brews a giant potion', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 1);
    for (const area of ['area_under_porch', 'area_compost_lab'] as const)
      await send(page, { type: 'unlock', area });
    await frames(page, 2);
    const p = await points(page);
    await jumpTo(page, COMPOST_X - 1);
    // A mushroom cap on the heap beside the pot: in it goes, by hand.
    const cap = await stage(page, 'item_mushroom_cap', p.cauldron.x - 2.2, 7.2);
    const from = await pressFrozen(page, cap);
    const over = await toClient(page, p.cauldron.x, p.cauldron.y - 0.5);
    await glideFrames(page, from, 0, over.y - from.y, 2, 2);
    await glideFrames(page, { x: from.x, y: over.y }, over.x - from.x, 0, 3, 2);
    await frames(page, 12);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await frames(page, 2);
    expect((await page.evaluate(() => window.__bb!.cauldron())).contents).toEqual(['item_mushroom_cap']);
    // Stir: the ladle round the pot, two and a bit turns, an eighth of a turn at a time.
    const mid = await toClient(page, p.cauldron.x, p.cauldron.y);
    const rx = (await toClient(page, p.cauldron.x + 0.9, p.cauldron.y)).x - mid.x;
    await page.mouse.move(mid.x + rx, mid.y);
    await page.mouse.down();
    await frames(page, 1);
    for (let i = 1; i <= 18; i++) {
      const a = (i / 8) * Math.PI * 2;
      await page.mouse.move(mid.x + Math.cos(a) * rx, mid.y + (Math.sin(a) * rx) / 2);
      await frames(page, 1);
    }
    await page.mouse.up();
    await frames(page, 2);
    expect((await page.evaluate(() => window.__bb!.cauldron())).bubbling).toBe(true);
    await frames(page, 64);
    expect((await entities(page)).some((e) => e.defId === 'item_potion_giant')).toBe(true);
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_first_potion');
  } finally {
    await bb.close();
  }
});

test('a potion let go at a bug\u2019s mouth is drunk, and a giant potion makes the bug giant', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 1);
    // A ladybug on cleared open ground, with a bottle beside her.
    await jumpTo(page, PLAZA_X + 18);
    for (const e of await entities(page))
      if (Math.abs(e.x - (PLAZA_X + 30)) < 3.5 && !e.bug?.pending)
        await send(page, { type: 'despawn', id: e.id });
    const before = new Set((await entities(page)).map((e) => e.id));
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_ladybug_dot', x: PLAZA_X + 30, y: 8.4 });
    await frames(page, 2);
    const glorp = (await entities(page)).find((e) => !before.has(e.id) && e.kind === 'bug')!;
    await calm(page);
    const bottle = await stage(page, 'item_potion_giant', PLAZA_X + 28.6, 8.6);
    await holdNearMouth(page, bottle, glorp.id, 0.2, -0.2, true);
    await page.mouse.up();
    await frames(page, 60);
    const g = (await entity(page, glorp.id))!;
    expect((g.effects ?? []).map((e) => e.effect)).toContain('giant');
    expect(g.scale).toBe(2);
    expect(await entity(page, bottle)).toBeNull();
  } finally {
    await bb.close();
  }
});

test('a failed combo makes a junk blob, and shaking it in the hand splits it back apart', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 2);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await frames(page, 2);
    await calm(page);
    const p = await points(page);
    await jumpTo(page, PORCH_X + 9.4);
    const cork = await stage(page, 'item_cork', ...onTable(p, -1));
    const pebble = await stage(page, 'item_pebble', ...onTable(p, 1));
    await carryTo(page, await pressFrozen(page, cork), p.trays[0]!.x, p.trays[0]!.y - 0.4);
    await carryTo(page, await pressFrozen(page, pebble), p.trays[1]!.x, p.trays[1]!.y - 0.4);
    // A click on the lever pulls it too.
    const knob = await toClient(page, p.lever.x, p.lever.y);
    await page.mouse.click(knob.x, knob.y);
    await frames(page, 90);
    const blob = (await entities(page)).find((e) => e.defId === 'item_junk_blob')!;
    expect(blob).toBeDefined();
    expect(blob.parts).toBe(2);
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_first_blob');
    // Shake it: three quick strokes back and forth.
    await frames(page, 30);
    const at = await pressFrozen(page, blob.id);
    let x = at.x;
    for (let i = 0; i < 4; i++) {
      for (const dx of [130, -130]) {
        x += dx;
        await page.mouse.move(x, at.y - 60, { steps: 3 });
        await page.waitForTimeout(30);
      }
    }
    await page.mouse.up();
    await frames(page, 10);
    expect(await entity(page, blob.id)).toBeNull();
    const back = (await entities(page)).filter((e) => e.defId === 'item_cork' || e.defId === 'item_pebble');
    expect(back.map((e) => e.defId)).toEqual(expect.arrayContaining(['item_cork', 'item_pebble']));
  } finally {
    await bb.close();
  }
});
