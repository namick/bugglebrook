import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dizzySeconds } from '../../src/game/systems/bugAi';
import { MAX_FLING_SPEED } from '../../src/game/constants';
import {
  PLAZA_X,
  clickSlot,
  content,
  entities,
  entity,
  frames,
  framesUntil,
  freeze,
  glideFrames,
  launchApp,
  openFrozen,
  pressFrozen,
} from './app';
import type { EntityView } from './app';

// M1 acceptance (game design doc, section 19), driven with the real mouse.
// CI renders WebGL in software at a few frames per second, so apart from the
// launch and frame-time check, every test freezes the sim (__bb.setPaused)
// and steps it frame by frame (__bb.frames): a slow machine then sees the
// same steps as a fast one.
test.setTimeout(300_000);

type Logged = { name: string; tick: number; payload: Record<string, number | string | boolean> };

const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;

const toClient = (page: Page, x: number, y: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x, y]);

async function bugNamed(page: Page, defId: string): Promise<EntityView> {
  return (await entities(page)).find((e) => e.defId === defId)!;
}

/** Move the mouse in small steps with real time between them (for camera pans, which ignore the sim). */
async function glide(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  return { x: from.x + dx, y: from.y + dy };
}

/**
 * A flick: the last moves and the release go out back to back, so they
 * reach the page together even when a slow renderer delays input. Waiting
 * on each one would look like "move, pause, let go", which is a drop.
 */
async function flick(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  const sent: Promise<void>[] = [];
  for (let i = 1; i <= steps; i++)
    sent.push(page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps));
  sent.push(page.mouse.up());
  await Promise.all(sent);
}

test('launches into the plaza within 5 s and holds 60 fps with 3 bugs and 20 items', async () => {
  const started = Date.now();
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await expect.poll(() => page.evaluate(() => window.__bb!.renderStats().sprites)).toBeGreaterThan(15);
    expect(Date.now() - started).toBeLessThan(5000);

    const all = await entities(page);
    // The starting cast (hidden bugs waiting to be found do not count yet).
    expect(
      all
        .filter((e) => e.kind === 'bug' && !e.bug?.pending)
        .map((e) => e.defId)
        .sort(),
    ).toEqual([
      'bug_grasshopper_boing',
      'bug_ladybug_dot',
      'bug_pillbug_rollo',
      'bug_snail_glorp',
      'bug_waterstrider_skeet',
    ]);
    const items = all.filter((e) => e.kind === 'item').length;
    for (let i = items; i < 20; i++) {
      await page.evaluate(
        (k) =>
          window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: 68 + k * 0.7, y: 2 }),
        i,
      );
    }
    await expect
      .poll(async () => (await entities(page)).filter((e) => e.kind === 'item').length)
      .toBeGreaterThanOrEqual(20);

    // Let 600 frames pass in the world, then check frame times.
    await expect
      .poll(() => page.evaluate(() => window.__bb!.frameTimes(600).length), { timeout: 280_000 })
      .toBe(600);
    const stats = (xs: number[]): { mean: number; p95: number } => ({
      mean: xs.reduce((a, b) => a + b, 0) / xs.length,
      p95: [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!,
    });
    const total = stats(await page.evaluate(() => window.__bb!.frameTimes(600)));
    const update = stats(await page.evaluate(() => window.__bb!.updateTimes(600)));
    const software = await page.evaluate(() => window.__bb!.softwareRenderer());
    console.log(
      `frame work over 600 frames: update mean ${update.mean.toFixed(2)} ms p95 ${update.p95.toFixed(2)} ms; ` +
        `with render mean ${total.mean.toFixed(2)} ms p95 ${total.p95.toFixed(2)} ms (software GL: ${software})`,
    );
    expect(update.mean).toBeLessThan(16.7);
    expect(update.p95).toBeLessThan(16.7);
    // Software WebGL rasterizes on the CPU, so its render time is not the game's.
    if (!software) {
      expect(total.mean).toBeLessThan(16.7);
      expect(total.p95).toBeLessThan(16.7);
    }
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('pressing a bug holds it; a fast release flings it at the cursor velocity', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await freeze(page, true);
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    let at = await pressFrozen(page, rollo.id);
    expect((await entity(page, rollo.id))!.bug!.mode).toBe('st_held');
    const voices = await page.evaluate(() => window.__bb!.voiceLog());
    expect(voices.some((v) => v.defId === 'bug_pillbug_rollo')).toBe(true);

    at = await glideFrames(page, at, 0, -250, 12);
    await page.waitForTimeout(100);
    // A quick throw up and to the right.
    await flick(page, at, 240, -120, 6);
    await frames(page, 2);

    expect((await events(page, 'item_dropped')).length).toBe(1);
    const [dropped] = await events(page, 'item_dropped');
    const cursor = (await page.evaluate(() => window.__bb!.lastRelease()))!;
    expect(dropped!.payload.flung).toBe(true);
    expect(Math.hypot(cursor.x, cursor.y)).toBeGreaterThanOrEqual(2.5);
    // The bug leaves at the cursor's 80 ms average velocity (capped), within 10 percent.
    const cap = Math.min(1, MAX_FLING_SPEED / Math.hypot(cursor.x, cursor.y));
    const vx = dropped!.payload.vx as number;
    const vy = dropped!.payload.vy as number;
    expect(Math.abs(vx - cursor.x * cap)).toBeLessThanOrEqual(0.1 * Math.hypot(cursor.x, cursor.y) * cap);
    expect(Math.abs(vy - cursor.y * cap)).toBeLessThanOrEqual(0.1 * Math.hypot(cursor.x, cursor.y) * cap);
    expect(vx).toBeGreaterThan(0);
    const modes = await page.evaluate(
      (id) =>
        window
          .__bb!.events()
          .filter((e) => e.name === 'item_dropped' && (e.payload as { id: number }).id === id).length,
      rollo.id,
    );
    expect(modes).toBe(1);
    // Right after the release, it is airborne.
    expect(['st_airborne', 'st_landing', 'st_dizzy', 'st_idle']).toContain(
      (await entity(page, rollo.id))!.bug!.mode,
    );
    const sounds = await page.evaluate(() => window.__bb!.sfxLog());
    expect(sounds).toContain('grab_bug');
    expect(sounds).toContain('fling');
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a released bug is st_airborne on the next step', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 1);
    await freeze(page, true);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const at = await pressFrozen(page, dot.id);
    const top = await glideFrames(page, at, 0, -300, 10);
    await page.waitForTimeout(100);
    await flick(page, top, 200, -100, 5);
    // Paused, so the release is still queued; one step applies it.
    await page.evaluate(() => window.__bb!.step(1));
    expect((await entity(page, dot.id))!.bug!.mode).toBe('st_airborne');
    await page.evaluate(() => window.__bb!.setPaused(false));
  } finally {
    await bb.close();
  }
});

test('a hard landing makes a bug dizzy for the design-doc duration', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    // Friends pat a dizzy bug better sooner (M4); keep them happy so the base formula shows.
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    await freeze(page, true);
    let at = await pressFrozen(page, dot.id);
    // Lift her high, then throw her down.
    at = await glideFrames(page, at, 60, -560, 20);
    await frames(page, 12);
    await page.waitForTimeout(200);
    await flick(page, at, 30, 220, 4);
    await framesUntil(page, async () => (await events(page, 'bug_dizzy')).length > 0, 10 * 60);
    expect((await events(page, 'bug_dizzy')).length).toBeGreaterThan(0);
    const [dizzy] = await events(page, 'bug_dizzy');
    expect(dizzy!.payload.id).toBe(dot.id);
    const speed = dizzy!.payload.speed as number;
    expect(speed).toBeGreaterThanOrEqual(9);
    const expected = dizzySeconds(speed);
    expect(Math.abs((dizzy!.payload.durationTicks as number) / 60 - expected)).toBeLessThanOrEqual(0.1);
    expect((await entity(page, dot.id))!.bug!.mode).toBe('st_dizzy');

    const mine = async () =>
      (await events(page, 'bug_recovered')).filter((e) => e.payload.id === dot.id && e.tick > dizzy!.tick);
    await framesUntil(page, async () => (await mine()).length > 0, 12 * 60, 20);
    const [recovered] = await mine();
    expect(Math.abs((recovered!.tick - dizzy!.tick) / 60 - expected)).toBeLessThanOrEqual(0.1);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('dizzy');
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a quick click pokes: bugs react, items hop', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 2);
    await freeze(page, true);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    const g = await toClient(page, glorp.x, glorp.y);
    await page.mouse.click(g.x, g.y);
    await frames(page, 2);
    expect((await events(page, 'bug_poked')).length).toBe(1);
    expect((await events(page, 'bug_poked'))[0]!.payload.id).toBe(glorp.id);

    // The on-screen item farthest from any bug, so the click lands on it.
    const all = await entities(page);
    const bugs = all.filter((e) => e.kind === 'bug');
    const gap = (e: EntityView): number => Math.min(...bugs.map((b) => Math.hypot(b.x - e.x, b.y - e.y)));
    const cap = all
      .filter((e) => e.kind === 'item' && e.x > PLAZA_X + 4 && e.x < PLAZA_X + 21)
      .sort((a, b) => gap(b) - gap(a))[0]!;
    const c = await toClient(page, cap.x, cap.y);
    await page.mouse.click(c.x, c.y);
    await frames(page, 2);
    expect((await events(page, 'item_poked')).length).toBeGreaterThanOrEqual(1);
    expect(await events(page, 'item_dropped')).toEqual([]);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('poke');
    await freeze(page, false);
  } finally {
    await bb.close();
  }
});

test('scrolling and dragging the background move the camera and never move items', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 1);
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    await freeze(page, true);
    // The toy pile, far from every bug; let it settle first.
    const pile = async (): Promise<EntityView[]> =>
      (await entities(page)).filter(
        (e) => e.kind === 'item' && e.x > PLAZA_X + 27 && e.x < PLAZA_X + 38.4 && e.y > 8,
      );
    await framesUntil(page, async () => (await pile()).every((e) => Math.hypot(e.vx, e.vy) < 0.02), 20 * 60);
    const before = await pile();
    const cam0 = (await page.evaluate(() => window.__bb!.camera())).x;

    const sky = await toClient(page, cam0 + 9, 1.5);
    await page.mouse.move(sky.x, sky.y);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(20);
    }
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.camera())).x)
      .toBeGreaterThan(cam0 + 5);
    const cam1 = (await page.evaluate(() => window.__bb!.camera())).x;

    // Drag empty sky to the right to look left again.
    await page.mouse.move(sky.x, sky.y);
    await page.mouse.down();
    await glide(page, sky, 500, 0, 12);
    await page.mouse.up();
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.camera())).x)
      .toBeLessThan(cam1 - 3);

    // A second of sim with the camera moved: nothing it passed over was touched.
    await frames(page, 60);
    const after = await pile();
    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), b.defId).toBeLessThan(0.02);
    }
    expect(await events(page, 'item_grabbed')).toEqual([]);
    await freeze(page, false);
  } finally {
    await bb.close();
  }
});
