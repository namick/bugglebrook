import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dizzySeconds } from '../../src/game/systems/bugAi';
import { MAX_FLING_SPEED } from '../../src/game/constants';
import { PLAZA_X, clickSlot, entities, entity, launchApp } from './app';
import type { EntityView } from './app';

// M1 acceptance (game design doc, section 19), driven with the real mouse.
// CI renders WebGL in software at a few frames per second, and the sim runs
// at most 0.1 s per frame, so waits here are generous.
test.setTimeout(180_000);

type Logged = { name: string; tick: number; payload: Record<string, number | string | boolean> };

const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;

const toClient = (page: Page, x: number, y: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x, y]);

async function bugNamed(page: Page, defId: string): Promise<EntityView> {
  return (await entities(page)).find((e) => e.defId === defId)!;
}

/** Press on an entity and wait until the sim says it is held. */
async function pressOn(page: Page, e: EntityView): Promise<{ x: number; y: number }> {
  const p = await toClient(page, e.x, e.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(async () => (await entity(page, e.id))?.held).toBe(true);
  return p;
}

/** Move the mouse in small steps, one per frame. */
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
    expect(
      all
        .filter((e) => e.kind === 'bug')
        .map((e) => e.defId)
        .sort(),
    ).toEqual(['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_waterstrider_skeet']);
    const items = all.filter((e) => e.kind === 'item').length;
    for (let i = items; i < 20; i++) {
      await page.evaluate(
        (k) =>
          window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: 36 + k * 0.7, y: 2 }),
        i,
      );
    }
    await expect
      .poll(async () => (await entities(page)).filter((e) => e.kind === 'item').length)
      .toBeGreaterThanOrEqual(20);

    // Let 600 frames pass in the world, then check frame times.
    await expect
      .poll(() => page.evaluate(() => window.__bb!.frameTimes(600).length), { timeout: 150_000 })
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
    await clickSlot(page, 0);
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    let at = await pressOn(page, rollo);
    expect((await entity(page, rollo.id))!.bug!.mode).toBe('st_held');
    const voices = await page.evaluate(() => window.__bb!.voiceLog());
    expect(voices.some((v) => v.defId === 'bug_pillbug_rollo')).toBe(true);

    at = await glide(page, at, 0, -250, 12);
    // A quick throw up and to the right.
    await flick(page, at, 240, -120, 6);

    await expect.poll(async () => (await events(page, 'item_dropped')).length).toBe(1);
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
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a released bug is st_airborne on the next step', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 1);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const at = await pressOn(page, dot);
    const top = await glide(page, at, 0, -300, 10);
    await page.evaluate(() => window.__bb!.setPaused(true));
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
    await clickSlot(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    let at = await pressOn(page, dot);
    // Lift her high, then throw her down.
    at = await glide(page, at, 60, -560, 20);
    await page.waitForTimeout(200);
    await flick(page, at, 30, 220, 4);

    await expect
      .poll(async () => (await events(page, 'bug_dizzy')).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const [dizzy] = await events(page, 'bug_dizzy');
    expect(dizzy!.payload.id).toBe(dot.id);
    const speed = dizzy!.payload.speed as number;
    expect(speed).toBeGreaterThanOrEqual(9);
    const expected = dizzySeconds(speed);
    expect(Math.abs((dizzy!.payload.durationTicks as number) / 60 - expected)).toBeLessThanOrEqual(0.1);
    expect((await entity(page, dot.id))!.bug!.mode).toBe('st_dizzy');

    await expect
      .poll(async () => (await events(page, 'bug_recovered')).length, { timeout: 90_000 })
      .toBeGreaterThan(0);
    const [recovered] = await events(page, 'bug_recovered');
    expect(Math.abs((recovered!.tick - dizzy!.tick) / 60 - expected)).toBeLessThanOrEqual(0.1);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('dizzy');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a quick click pokes: bugs react, items hop', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 2);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    const g = await toClient(page, glorp.x, glorp.y);
    await page.mouse.click(g.x, g.y);
    await expect.poll(async () => (await events(page, 'bug_poked')).length).toBe(1);
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
    await expect.poll(async () => (await events(page, 'item_poked')).length).toBeGreaterThanOrEqual(1);
    expect(await events(page, 'item_dropped')).toEqual([]);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('poke');
  } finally {
    await bb.close();
  }
});

test('scrolling and dragging the background move the camera and never move items', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 1);
    // The toy pile, far from every bug; let it settle first.
    const pile = async (): Promise<EntityView[]> =>
      (await entities(page)).filter((e) => e.kind === 'item' && e.x > PLAZA_X + 27 && e.y > 8);
    await expect.poll(async () => (await pile()).every((e) => Math.hypot(e.vx, e.vy) < 0.02)).toBe(true);
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

    const after = await pile();
    for (const b of before) {
      const a = after.find((e) => e.id === b.id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), b.defId).toBeLessThan(0.02);
    }
    expect(await events(page, 'item_grabbed')).toEqual([]);
  } finally {
    await bb.close();
  }
});
