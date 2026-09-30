import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAZA_X, clickSlot, content, entities, entity, launchApp, pressOn, scrollTo, toClient } from './app';

// M3 acceptance (game design doc, section 19): properties and the pond,
// driven with the real mouse and checked through window.__bb. Waits are
// generous because CI renders in software at a few frames per second.
test.setTimeout(180_000);

type Logged = { name: string; tick: number; payload: Record<string, unknown> };

const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;

const camera = async (page: Page): Promise<number> => (await page.evaluate(() => window.__bb!.camera())).x;

/** Spawn something and wait until it exists. */
async function spawn(page: Page, kind: 'bug' | 'item', defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([k, d, px, py]) =>
      window.__bb!.send({
        type: 'spawn',
        kind: k as 'bug' | 'item',
        defId: d as string,
        x: px as number,
        y: py as number,
      }),
    [kind, defId, x, y] as const,
  );
  let id = -1;
  await expect
    .poll(async () => {
      id = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)?.id ?? -1;
      return id;
    })
    .toBeGreaterThan(0);
  return id;
}

/**
 * The spot of open pond water farthest from lily pads, floating things, and
 * Skeet. Floaters drift on the current, so this is worked out each time.
 */
async function openWater(page: Page, not: number[] = []): Promise<number> {
  const water = await page.evaluate(() => window.__bb!.water());
  const level = water.surfaces[0]!.level;
  const things = (await entities(page)).filter((e) => Math.abs(e.y - level) < 1.3 && e.x < 23);
  const blockers = [
    ...water.pads.map((p) => ({ x: p.x, r: 1.1 })),
    ...things.map((e) => ({ x: e.x, r: e.defId === 'item_leaf_raft' ? 1.1 : 0.6 })),
    ...not.map((x) => ({ x, r: 0.6 })),
  ];
  // Stay well inside the screen, or carrying it there would scroll the camera.
  const cam = await camera(page);
  let best = 15;
  let bestGap = -Infinity;
  for (let x = Math.max(6.5, cam + 2.5); x <= Math.min(21.8, cam + 16.5); x += 0.1) {
    const gap = Math.min(...blockers.map((b) => Math.abs(b.x - x) - b.r));
    if (gap > bestGap) {
      bestGap = gap;
      best = x;
    }
  }
  return best;
}

/** Wait for a thing to stop moving. */
async function settle(page: Page, id: number): Promise<void> {
  await expect
    .poll(async () => {
      const e = (await entity(page, id))!;
      return Math.hypot(e.vx, e.vy) < 0.3;
    })
    .toBe(true);
}

/** Carry a held thing to a world point with the real mouse, in small steps. */
async function carryTo(page: Page, from: { x: number; y: number }, x: number, y: number): Promise<void> {
  const to = await toClient(page, x, y);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
}

test('carrying something to the screen edge pans the camera, and it arrives in the pond with its tags', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const cam0 = await camera(page);
    expect(cam0).toBeGreaterThan(PLAZA_X);
    const pebble = await spawn(page, 'item', 'item_pebble', cam0 + 4, 7);
    await settle(page, pebble);
    await page.evaluate(
      (id) => window.__bb!.send({ type: 'set_tag', id, tag: 'tag_fuzzy', on: true, seconds: 120 }),
      pebble,
    );
    await expect.poll(async () => (await entity(page, pebble))!.tags).toContain('tag_fuzzy');

    const at = await pressOn(page, pebble);
    // Lift it and hold it against the left edge of the screen.
    const rect = await page.evaluate(() => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { left: r.left, top: r.top, height: r.height };
    });
    const edge = { x: rect.left + 8, y: rect.top + rect.height * 0.55 };
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(at.x + ((edge.x - at.x) * i) / 15, at.y + ((edge.y - at.y) * i) / 15);
      await page.waitForTimeout(16);
    }
    await expect
      .poll(async () => (await entity(page, pebble))!.x, { timeout: 20_000 })
      .toBeLessThan(PLAZA_X - 3);
    // Ease off the edge and set it down gently on the pond's bank.
    const held = (await entity(page, pebble))!;
    const here = await toClient(page, held.x, held.y);
    await page.mouse.move(here.x + 200, here.y, { steps: 10 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    const e = (await entity(page, pebble))!;
    expect(await camera(page)).toBeLessThan(cam0 - 3);
    expect(await page.evaluate((x) => window.__bb!.areaAt(x), e.x)).toBe('area_puddle_pond');
    expect(e.tags).toContain('tag_fuzzy');
    expect(e.tags).toContain('tag_heavy');
  } finally {
    await bb.close();
  }
});

test('things dropped in the pond splash, get wet, and float or sink', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await scrollTo(page, 0);
    const water = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!;
    const cork = await spawn(page, 'item', 'item_cork', 3.2, 7.5);
    const pebble = await spawn(page, 'item', 'item_pebble', 3.9, 7.5);
    await settle(page, cork);
    await settle(page, pebble);
    await page.evaluate(() => window.__bb!.clearLogs());
    const corkX = await openWater(page);
    const pebbleX = await openWater(page, [corkX]);
    for (const [id, x] of [
      [cork, corkX],
      [pebble, pebbleX],
    ] as const) {
      const at = await pressOn(page, id);
      await carryTo(page, at, x, water.level - 1);
      await page.mouse.up();
      await page.mouse.move(960, 100);
    }
    await expect.poll(async () => (await events(page, 'splashed')).length).toBeGreaterThanOrEqual(2);
    const sounds = await page.evaluate(() => window.__bb!.sfxLog());
    expect(sounds.some((s) => s === 'splash' || s === 'plop')).toBe(true);
    await page.waitForTimeout(5000);
    const c = (await entity(page, cork))!;
    const p = (await entity(page, pebble))!;
    expect(c.tags).toContain('tag_wet');
    expect(c.submerged).toBeGreaterThan(0);
    expect(c.submerged).toBeLessThan(1);
    expect(p.tags).toContain('tag_wet');
    expect(p.submerged).toBe(1);
    expect(p.y).toBeGreaterThan(water.level + 1);
  } finally {
    await bb.close();
  }
});

test('a hot pepper dropped in the water hisses out in steam', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await scrollTo(page, 0);
    // Skeet would happily go and eat it before it gets to the water.
    await content(page, (await entities(page)).find((e) => e.defId === 'bug_waterstrider_skeet')!.id);
    const water = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!;
    const pepper = await spawn(page, 'item', 'item_pepper_hot', 3.4, 7.5);
    await settle(page, pepper);
    expect((await entity(page, pepper))!.tags).toContain('tag_hot');
    const at = await pressOn(page, pepper);
    // High enough that Skeet, who comes over to sniff new things, cannot catch it in his mouth.
    const skeetX = (await entities(page)).find((e) => e.defId === 'bug_waterstrider_skeet')!.x;
    await carryTo(page, at, await openWater(page, [skeetX - 1, skeetX, skeetX + 1]), water.level - 1.6);
    await page.mouse.up();
    await expect.poll(async () => (await events(page, 'steamed')).length).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => window.__bb!.sfxLog())).toContain('tsss');
    expect((await entity(page, pepper))!.tags).not.toContain('tag_hot');
  } finally {
    await bb.close();
  }
});

test('clicking the hose tap turns the spray on and off', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await scrollTo(page, 14);
    const tap = (await page.evaluate(() => window.__bb!.fixture('fix_hose_tap')))!;
    const p = await toClient(page, tap.x, tap.y);
    await page.mouse.move(p.x, p.y);
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.cursor())).pose).toBe('hover_poke');
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.water())).hoseOn).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('click_on');
    // The pond fills a little while it runs.
    const level0 = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!.level;
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.water())).surfaces[0]!.level)
      .toBeLessThan(level0 - 0.01);
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.water())).hoseOn).toBe(false);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('click_off');
  } finally {
    await bb.close();
  }
});

test('a bug dropped in the pond swims to shore and shakes itself dry', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await scrollTo(page, 0);
    const water = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!;
    const dot = await spawn(page, 'bug', 'bug_ladybug_dot', 2.6, 7.5);
    await content(page, dot);
    await settle(page, dot);
    // Carry her out over open water frame by frame, so a slow machine drops her in the same spot.
    const frames = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
    await page.evaluate(() => window.__bb!.setPaused(true));
    const d = (await entity(page, dot))!;
    const at = await toClient(page, d.x, d.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(2);
    expect((await entity(page, dot))!.held).toBe(true);
    const to = await toClient(page, await openWater(page), water.level - 1.2);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(at.x + ((to.x - at.x) * i) / 12, at.y + ((to.y - at.y) * i) / 12);
      await frames(3);
    }
    await frames(40);
    // A still hand for longer than the fling window: a gentle drop, not a throw.
    await page.waitForTimeout(150);
    await page.mouse.up();
    await frames(2);
    await page.evaluate(() => window.__bb!.setPaused(false));
    await page.mouse.move(960, 100);
    await expect.poll(async () => (await entity(page, dot))!.bug!.mode).toBe('st_swim');
    await expect.poll(async () => (await entity(page, dot))!.tags).toContain('tag_wet');
    await expect
      .poll(async () => (await events(page, 'bug_shook_dry')).some((e) => e.payload.id === dot), {
        timeout: 60_000,
      })
      .toBe(true);
    // Shaking dried it off.
    expect(
      (await events(page, 'tag_lost')).some(
        (e) => e.payload.id === dot && e.payload.tag === 'tag_wet' && e.payload.cause === 'shake',
      ),
    ).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('shake_dry');
  } finally {
    await bb.close();
  }
});

test('gum sticks to what it lands on, and a hard yank tears it off', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    // Freeze the clock and drive the sim frame by frame: slow renderers then
    // see exactly the same steps as fast ones (the gum once missed a pebble
    // that was still rolling on CI's software renderer).
    // The plaza's far right: flat, and usually free of bugs.
    await scrollTo(page, PLAZA_X + 19);
    await page.evaluate(() => window.__bb!.setPaused(true));
    const cam = await camera(page);
    // A clear, flat spot on screen, as far from every bug as can be.
    const bugsNow = (await entities(page)).filter((e) => e.kind === 'bug');
    let spot = cam + 9;
    let best = -1;
    for (let x = cam + 2; x < cam + 17; x += 0.25) {
      if (!(x > PLAZA_X + 27 && x < PLAZA_X + 35)) continue;
      const near = (await entities(page)).filter(
        (e) => e.kind === 'item' && Math.abs(e.x - x) < 0.8 && e.y > 6,
      );
      if (near.length > 0) continue;
      const d = Math.min(...bugsNow.map((b) => Math.abs(b.x - x)));
      if (d > best) {
        best = d;
        spot = x;
      }
    }
    const step = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
    const newest = async (defId: string, before: Set<number>): Promise<number> =>
      (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
    let before = new Set((await entities(page)).map((e) => e.id));
    await page.evaluate(
      (x) => window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x, y: 8 }),
      spot,
    );
    await step(1);
    const pebble = await newest('item_pebble', before);
    // Let it land and stop rolling.
    for (let i = 0; i < 12; i++) {
      await step(60);
      const p = await entity(page, pebble);
      if (p && Math.hypot(p.vx, p.vy) < 0.02 && p.y > 8) break;
    }
    const pv = (await entity(page, pebble))!;
    expect(Math.hypot(pv.vx, pv.vy)).toBeLessThan(0.05);
    before = new Set((await entities(page)).map((e) => e.id));
    await page.evaluate(
      ([x, y]) => window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_gum_blob', x: x!, y: y! }),
      [pv.x, pv.y - 0.5],
    );
    await step(90);
    const gum = await newest('item_gum_blob', before);
    const stuck = async (): Promise<boolean> =>
      (await page.evaluate(() => window.__bb!.water())).sticks.some(
        (t) => (t.a === gum && t.b === pebble) || (t.a === pebble && t.b === gum),
      );
    expect(await stuck()).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('squelch');
    // Grab the gum with the real mouse, then yank it away fast.
    const g = (await entity(page, gum))!;
    const at = await toClient(page, g.x, g.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await step(2);
    expect((await entity(page, gum))!.held).toBe(true);
    await page.mouse.move(at.x + 300, at.y - 300, { steps: 2 });
    await step(3);
    expect(await events(page, 'unstuck')).not.toHaveLength(0);
    await page.mouse.up();
    await step(2);
    expect(await stuck()).toBe(false);
    expect((await entity(page, gum))!.held).toBe(false);
    await page.evaluate(() => window.__bb!.setPaused(false));
  } finally {
    await bb.close();
  }
});

test('the pond sleeps when the camera is far across the plaza, and wakes when it comes back', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    expect(await page.evaluate(() => window.__bb!.areaAsleep('area_puddle_pond'))).toBe(false);
    await scrollTo(page, 60);
    await expect.poll(() => page.evaluate(() => window.__bb!.areaAsleep('area_puddle_pond'))).toBe(true);
    const skeet = (await entities(page)).find((e) => e.defId === 'bug_waterstrider_skeet')!;
    expect(skeet.asleep).toBe(true);
    // Asleep, Skeet runs the coarse off-screen model: no physics, but he may
    // stroll along the pond at 0.6 m/s every 2 s.
    await page.waitForTimeout(1500);
    const later = (await entity(page, skeet.id))!;
    expect(later.asleep).toBe(true);
    expect(later.x).toBeLessThan(32);
    await scrollTo(page, 20);
    await expect.poll(() => page.evaluate(() => window.__bb!.areaAsleep('area_puddle_pond'))).toBe(false);
    expect(await page.evaluate(() => window.__bb!.areaAsleep('area_stump_plaza'))).toBe(false);
  } finally {
    await bb.close();
  }
});
