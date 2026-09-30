import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  bugNamed,
  clickSlot,
  clickUi,
  content,
  entities,
  entity,
  launchApp,
  openFrozen,
  scrollTo,
  toClient,
  waitForScene,
} from './app';
import type { TestHook } from './app';

// M6 acceptance (game design doc, sections 11 and 19): day, night, and
// weather, driven with the real mouse. The sim is frozen and stepped frame
// by frame (__bb.setPaused + __bb.frames) wherever timing matters, so CI's
// slow software renderer sees exactly the same steps as a fast machine.
test.setTimeout(180_000);

type Command = Parameters<TestHook['send']>[0];

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const frames = (page: Page, n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
const sky = (page: Page): Promise<ReturnType<TestHook['sky']>> => page.evaluate(() => window.__bb!.sky());
const freeze = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((p) => window.__bb!.setPaused(p), on);
const events = (page: Page, name: string): Promise<{ tick: number; payload: Record<string, unknown> }[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as never;

async function calmAll(page: Page): Promise<void> {
  for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
}

async function fixture(page: Page, id: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate((f) => window.__bb!.fixture(f), id))!;
}

test('the clock runs a game minute per second, and phases start at their times', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await freeze(page, true);
    const start = await sky(page);
    expect(start.hour).toBeGreaterThanOrEqual(9);
    expect(start.phase).toBe('phase_day');
    await frames(page, 60);
    expect((await sky(page)).clock - start.clock).toBe(60);
    for (const [hour, phase] of [
      [5, 'phase_dawn'],
      [7, 'phase_day'],
      [18, 'phase_dusk'],
      [20, 'phase_night'],
    ] as const) {
      await send(page, { type: 'set_time', hour });
      await frames(page, 1);
      expect((await sky(page)).phase).toBe(phase);
    }
    // The whole scene is graded: night is blue and starry, with lights.
    await send(page, { type: 'set_time', hour: 23 });
    await freeze(page, false);
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.look())).stars)
      .toBeGreaterThan(0.9);
    const look = await page.evaluate(() => window.__bb!.look());
    expect(look.glow).toBeGreaterThan(0.8);
    expect(look.near & 0xff).toBeGreaterThan((look.near >> 16) & 0xff);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('dragging the sundial clockwise moves time forward, and dragging it back never goes backward', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    const dial = await fixture(page, 'fix_sundial');
    await freeze(page, true);
    // A turn around the rim: from the back (12 o'clock) clockwise to the front.
    const rim = async (a: number): Promise<{ x: number; y: number }> =>
      toClient(page, dial.x + Math.cos(a) * 0.8, dial.y + Math.sin(a) * 0.28);
    const turn = async (from: number, to: number): Promise<void> => {
      const p0 = await rim(from);
      await page.mouse.move(p0.x, p0.y);
      await page.mouse.down();
      await frames(page, 1);
      for (let i = 1; i <= 16; i++) {
        const p = await rim(from + ((to - from) * i) / 16);
        await page.mouse.move(p.x, p.y);
        await frames(page, 2);
      }
      await page.mouse.up();
      await frames(page, 1);
    };
    const before = (await sky(page)).clock;
    await page.evaluate(() => window.__bb!.clearLogs());
    await turn(-Math.PI / 2, Math.PI / 2);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('dial');
    // Half a turn is twelve hours; the dial sweeps there at 60x.
    expect((await sky(page)).fastForward).toBe(true);
    await frames(page, 13 * 60);
    const after = await sky(page);
    expect(after.fastForward).toBe(false);
    expect(after.clock - before).toBeGreaterThan(10 * 3600);
    expect((await events(page, 'time_skipped')).length).toBe(1);
    // Counter-clockwise: nothing but the ordinary passing of time.
    await turn(Math.PI / 2, -Math.PI / 2);
    await frames(page, 60);
    const back = await sky(page);
    expect(back.clock).toBeGreaterThanOrEqual(after.clock);
    expect(back.clock - after.clock).toBeLessThan(200);
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('three quick clicks on the weather vane start a gust that blows light things along', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    const vane = await fixture(page, 'fix_weather_vane');
    await scrollTo(page, vane.x - 3);
    await freeze(page, true);
    const p = await toClient(page, vane.x, vane.y);
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(p.x, p.y);
      await frames(page, 12);
    }
    const gusts = await events(page, 'gust_started');
    expect(gusts).toHaveLength(1);
    const dir = gusts[0]!.payload.dir as number;
    expect((await sky(page)).wind).toBe(dir * 3.6);
    // A feather let go high up drifts along with the gust as it floats down.
    const feather = await page.evaluate(() => {
      window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_feather', x: 77, y: 0.5 });
      window.__bb!.frames(1);
      return window
        .__bb!.entities()
        .filter((e) => e.defId === 'item_feather')
        .at(-1)!.id;
    });
    const x0 = (await entity(page, feather))!.x;
    await frames(page, 50);
    const x1 = (await entity(page, feather))!.x;
    expect((x1 - x0) * dir).toBeGreaterThan(1);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('gust');
    // It blows for 20 s.
    await frames(page, 20 * 60);
    expect((await sky(page)).wind).toBe(0);
    await freeze(page, false);
  } finally {
    await bb.close();
  }
});

test('rain wets things in the open within 5 s, raises the pond, fills puddles, and draws within budget', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    await freeze(page, true);
    const pebble = await page.evaluate((x) => {
      window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x, y: 3.4 });
      window.__bb!.frames(60);
      return window
        .__bb!.entities()
        .filter((e) => e.defId === 'item_pebble')
        .at(-1)!.id;
    }, PLAZA_X + 18.6);
    const level = async (): Promise<number> =>
      (await page.evaluate(() => window.__bb!.water())).surfaces.find((s) => s.areaId === 'area_puddle_pond')!
        .level;
    const dry = await level();
    await send(page, { type: 'set_weather', wind: 0, rain: true });
    await frames(page, 5 * 60 + 16);
    expect((await entity(page, pebble))!.tags).toContain('tag_wet');
    await frames(page, 25 * 60);
    expect(await level()).toBeLessThan(dry - 0.05);
    expect((await sky(page)).puddles.length).toBe(2);
    // The rain shows, and stays within its particle budget.
    await freeze(page, false);
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.look())).rain).toBeGreaterThan(0.9);
    const stats = await page.evaluate(() => window.__bb!.weatherStats());
    expect(stats.drops).toBeGreaterThan(100);
    expect(stats.drops).toBeLessThanOrEqual(300);
    // After the rain the pond drains again.
    await freeze(page, true);
    const high = await level();
    await send(page, { type: 'set_weather', wind: 0, rain: false });
    await frames(page, 10 * 60);
    expect(await level()).toBeGreaterThan(high + 0.03);
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('at night tired day bugs go to sleep within 60 s; a click wakes one, groggy, and it goes back to bed', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    await freeze(page, true);
    await send(page, { type: 'set_time', hour: 20.5 });
    const day = ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_grasshopper_boing'];
    const ids = await Promise.all(day.map(async (d) => (await bugNamed(page, d)).id));
    for (const id of ids) await send(page, { type: 'set_need', id, need: 'need_energy', value: 40 });
    await frames(page, 60 * 60);
    for (const id of ids) expect((await entity(page, id))!.bug!.mode).toBe('st_sleep');
    await page.evaluate(() => window.__bb!.clearLogs());
    const glorp = (await entity(page, ids[2]!))!;
    const p = await toClient(page, glorp.x, glorp.y);
    await page.mouse.click(p.x, p.y);
    await frames(page, 3);
    const woke = await events(page, 'bug_woke');
    expect(woke.map((e) => e.payload.id)).toEqual([glorp.id]);
    expect((await entity(page, glorp.id))!.bug!.groggy).toBe(true);
    await frames(page, 40 * 60);
    expect((await entity(page, glorp.id))!.bug!.mode).toBe('st_sleep');
    // Nobody woke up on their own in the night (a bump from a falling thing may still wake one).
    expect((await events(page, 'bug_woke')).filter((e) => e.payload.early === false)).toEqual([]);
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('at night the flashlight flashed three times by the reeds calls Flick the firefly', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    const reeds = await fixture(page, 'fix_reeds');
    await scrollTo(page, reeds.x - 6);
    await freeze(page, true);
    await send(page, { type: 'set_time', hour: 22 });
    await frames(page, 2);
    // Carry the pen from the path to the reeds with the mouse.
    const pen = (await entities(page)).find((e) => e.defId === 'item_flashlight_pen')!;
    const from = await toClient(page, pen.x, pen.y);
    const to = await toClient(page, reeds.x + 2.6, 8.1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await frames(page, 2);
    expect((await entity(page, pen.id))!.held).toBe(true);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
      await frames(page, 2);
    }
    await frames(page, 20);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await frames(page, 90);
    for (let k = 0; k < 3; k++) {
      const e = (await entity(page, pen.id))!;
      const c = await toClient(page, e.x, e.y);
      await page.mouse.click(c.x, c.y);
      await frames(page, 20);
    }
    const toggles = await events(page, 'light_toggled');
    expect(toggles).toHaveLength(3);
    expect(await page.evaluate(() => window.__bb!.secrets())).toEqual(['secret_firefly_flick']);
    expect((await entities(page)).some((e) => e.defId === 'bug_firefly_flick')).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('secret');
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('eyes look back from the knothole at night (secret_stump_eyes)', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await calmAll(page);
    const hole = await fixture(page, 'fix_stump_knothole');
    await scrollTo(page, hole.x - 9);
    await freeze(page, true);
    await send(page, { type: 'set_time', hour: 23 });
    await frames(page, 2);
    const p = await toClient(page, hole.x, hole.y);
    await page.mouse.click(p.x, p.y);
    await frames(page, 3);
    const peeks = await events(page, 'knothole_peeked');
    expect(peeks).toHaveLength(1);
    expect(peeks[0]!.payload.night).toBe(true);
    expect(await page.evaluate(() => window.__bb!.secrets())).toEqual(['secret_stump_eyes']);
    await freeze(page, false);
  } finally {
    await bb.close();
  }
});

test('the time and the weather are saved with the world', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    const { page } = bb;
    await openFrozen(page, 2);
    await freeze(page, true);
    await send(page, { type: 'set_time', hour: 21.5 });
    await send(page, { type: 'set_weather', wind: 0, rain: true });
    await frames(page, 2);
    const saved = await sky(page);
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await waitForScene(page, 'menu');
    await bb.close({ keepUserData: true });
    bb = await launchApp(userData);
    await clickSlot(bb.page, 2);
    await freeze(bb.page, true);
    const back = await sky(bb.page);
    expect(back.clock).toBeGreaterThanOrEqual(saved.clock);
    expect(back.clock - saved.clock).toBeLessThan(600);
    expect(back.weather).toBe('weather_rain');
    expect(back.phase).toBe('phase_night');
    await freeze(bb.page, false);
  } finally {
    await bb.close().catch(() => undefined);
  }
});
