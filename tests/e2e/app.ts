import { _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { EntityView } from '../../src/game/sim';
import type { TestHook } from '../../src/renderer/src/debug/testHook';

export type { TestHook, EntityView };

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
  errors: string[];
  close(options?: { keepUserData?: boolean }): Promise<void>;
}

const root = resolve(import.meta.dirname, '../..');

/**
 * Launch the built app (out/) in test mode with an isolated userData dir.
 * Pass an existing `userData` to relaunch into the same saves.
 */
export async function launchApp(userData?: string): Promise<Launched> {
  const dir = userData ?? mkdtempSync(join(tmpdir(), 'bugglebrook-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // Some hosts (editors built on Electron) leak this; it turns Electron into plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [...(process.env.BB_ELECTRON_ARGS?.split(' ').filter(Boolean) ?? []), root],
    env: { ...env, BUGGLEBROOK_TEST: '1', BUGGLEBROOK_USER_DATA: dir },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.waitForFunction(() => window.__bb !== undefined);
  // On a software renderer (CI's xvfb), draw at a tiny resolution: tests read the game through
  // the hook, and every frame drawn in software holds the page up. Tours want real pictures.
  if (!process.env.BB_FULL_RENDER) await page.evaluate(() => window.__bb!.liteRender(true));
  // A tiling window manager may stretch the window to fill its tile. Put it
  // back to the 1280x720 that CI's virtual screen gives it.
  if (!process.env.CI) {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 720));
    await expect.poll(() => page.evaluate(() => `${innerWidth}x${innerHeight}`)).toBe('1280x720');
  }
  return {
    app,
    page,
    userData: dir,
    errors,
    async close(options = {}) {
      await app.close();
      if (!options.keepUserData) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function waitForScene(page: Page, scene: 'menu' | 'world'): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__bb!.scene())).toBe(scene);
}

/** Click a menu slot card with the real mouse. Retries if a busy machine drops the first click. */
export async function clickSlot(page: Page, slot: number): Promise<void> {
  await waitForScene(page, 'menu');
  for (let attempt = 0; attempt < 3; attempt++) {
    const pos = await page.evaluate((s) => window.__bb!.slotButtonClient(s), slot);
    // No slot card: the earlier click took and the menu is on its way out while the world loads.
    if (pos === null && attempt > 0) break;
    expect(pos).not.toBeNull();
    await page.mouse.click(pos!.x, pos!.y);
    try {
      await expect.poll(() => page.evaluate(() => window.__bb!.scene()), { timeout: 6000 }).toBe('world');
      return;
    } catch {
      // Not in yet: the click may have landed while the menu was still settling.
    }
  }
  // A busy machine can take a while to build the world.
  await expect.poll(() => page.evaluate(() => window.__bb!.scene()), { timeout: 60_000 }).toBe('world');
}

export const entities = (page: Page): Promise<EntityView[]> => page.evaluate(() => window.__bb!.entities());

export const entity = (page: Page, id: number): Promise<EntityView | null> =>
  page.evaluate((i) => window.__bb!.entity(i), id);

export const toClient = (page: Page, x: number, y: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x, y]);

export async function bugNamed(page: Page, defId: string): Promise<EntityView> {
  return (await entities(page)).find((e) => e.defId === defId)!;
}

/** Fill a bug's needs so it does not go off to eat or play while a test stages something. */
export async function content(page: Page, id: number): Promise<void> {
  await page.evaluate((bug) => {
    for (const need of ['need_hunger', 'need_fun', 'need_energy', 'need_social', 'need_clean'] as const)
      window.__bb!.send({ type: 'set_need', id: bug, need, value: 100 });
  }, id);
}

/** Where Puddle Pond starts: the Flowerbed Stage is to its left (locked at first). */
export const POND_X = 32;

/** Where the plaza starts: Puddle Pond is to its left. */
export const PLAZA_X = 64;

/** Flat stretches of the plaza (off the stump's root slopes), in world x. */
const FLAT: readonly [number, number][] = [
  [PLAZA_X + 1, PLAZA_X + 11.8],
  [PLAZA_X + 16.6, PLAZA_X + 22.4],
  [PLAZA_X + 27, PLAZA_X + 37.5],
];

/** The nearest spot to x on flat ground with nothing within 0.7 m. */
async function clearSpot(page: Page, x: number): Promise<number> {
  const all = await entities(page);
  for (let d = 0; d < 6; d += 0.1)
    for (const c of [x + d, x - d]) {
      if (!FLAT.some(([a, b]) => c >= a && c <= b)) continue;
      if (all.every((e) => Math.abs(e.x - c) > 0.7 || e.y < 6)) return c;
    }
  return x;
}

/** Drop a new item from the sky near world x (on a clear flat spot) and wait for it to settle. */
export async function spawnItem(page: Page, defId: string, near: number): Promise<number> {
  const x = await clearSpot(page, near);
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([d, px]) => window.__bb!.send({ type: 'spawn', kind: 'item', defId: d!, x: px!, y: 6 }),
    [defId, x] as const,
  );
  let id = -1;
  await expect
    .poll(async () => {
      const found = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId);
      id = found?.id ?? -1;
      return found !== undefined && Math.abs(found.vy) < 0.3 && Math.hypot(found.vx, found.vy) < 1;
    })
    .toBe(true);
  return id;
}

/** With the sim frozen: drop a new item near world x (on a clear flat spot) and step until it settles. */
export async function spawnFrozen(page: Page, defId: string, near: number): Promise<number> {
  const x = await clearSpot(page, near);
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([d, px]) => window.__bb!.send({ type: 'spawn', kind: 'item', defId: d!, x: px!, y: 6 }),
    [defId, x] as const,
  );
  let id = -1;
  const settled = async (): Promise<boolean> => {
    const found = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId);
    id = found?.id ?? -1;
    return found !== undefined && Math.abs(found.vy) < 0.3 && Math.hypot(found.vx, found.vy) < 1;
  };
  await page.evaluate(() => window.__bb!.frames(20));
  for (let i = 0; i < 30 && !(await settled()); i++) await page.evaluate(() => window.__bb!.frames(10));
  expect(id).toBeGreaterThan(0);
  return id;
}

/**
 * Press on an entity with the real mouse until the sim says it is held
 * (it may still be rolling). Returns where the mouse is.
 */
export async function pressOn(page: Page, id: number): Promise<{ x: number; y: number }> {
  let at = { x: 0, y: 0 };
  await expect
    .poll(async () => {
      const e = (await entity(page, id))!;
      at = await toClient(page, e.x, e.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      // Slow frames (several apps at once, software GL) can take a while to step the sim.
      for (let i = 0; i < 8; i++) {
        if ((await entity(page, id))?.held) return true;
        await page.waitForTimeout(50);
      }
      await page.mouse.up();
      return false;
    })
    .toBe(true);
  return at;
}

/**
 * Pick an item up with the real mouse and hold it at an offset from a
 * bug's mouth anchor (in meters), following the bug if it moves. Leaves the
 * mouse button down. The sim is frozen and stepped frame by frame while the
 * hand moves, so a slow machine carries it exactly like a fast one.
 */
export async function holdNearMouth(
  page: Page,
  itemId: number,
  bugId: number,
  dx: number,
  dy: number,
  stayFrozen = false,
) {
  const frames = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
  await page.evaluate(() => window.__bb!.setPaused(true));
  try {
    const e = (await entity(page, itemId))!;
    let at = await toClient(page, e.x, e.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(2);
    expect((await entity(page, itemId))?.held).toBe(true);
    for (let round = 0; round < 8; round++) {
      const m = (await page.evaluate((b) => window.__bb!.mouthOf(b), bugId))!;
      const to = await toClient(page, m.x + dx, m.y + dy);
      for (let i = 1; i <= 4; i++) {
        await page.mouse.move(at.x + ((to.x - at.x) * i) / 4, at.y + ((to.y - at.y) * i) / 4);
        await frames(2);
      }
      at = to;
      await frames(4);
    }
    // Let the item settle under the hand before letting go gently, and keep
    // the hand still longer than the fling window so the release is a drop.
    await frames(30);
    await page.waitForTimeout(150);
  } finally {
    if (!stayFrozen) await page.evaluate(() => window.__bb!.setPaused(false));
  }
}

/** Scroll the camera with the real mouse wheel until its left edge rests near `x` (or as near as it may). */
export async function scrollTo(page: Page, x: number): Promise<void> {
  await page.mouse.move(960, 200);
  let off = Infinity;
  for (let i = 0; i < 30; i++) {
    // Aim inside the stretch the camera rests in: past a locked barrier it
    // only peeks and springs back, so it would never get there.
    const cam = await page.evaluate(() => window.__bb!.camera());
    off = Math.min(cam.max, Math.max(cam.min, x)) - cam.x;
    if (Math.abs(off) < 0.3) return;
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, (off * 100) / 1.5)));
    // The camera coasts after a wheel turn on the screen's clock, which is
    // slow on a software renderer: let it stop before measuring again, or
    // the next turn piles onto a stale reading and overshoots.
    await settleCamera(page);
  }
  throw new Error(`scrollTo(${x}): the camera is still ${off.toFixed(2)} m off`);
}

/**
 * Wait until the camera has stopped moving (it glides on the screen's clock,
 * even with the sim frozen). Still means unchanged over at least three
 * screen frames, however slowly the screen draws them.
 */
export async function settleCamera(page: Page): Promise<void> {
  let since = await page.evaluate(() => window.__bb!.camera());
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => window.__bb!.camera());
        if (Math.abs(now.x - since.x) >= 0.002) since = now;
        return now.frame - since.frame >= 3;
      },
      { intervals: [50], timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * Scroll the camera with the real wheel until its left edge is near x, and
 * wait for it to settle. Works with the sim frozen, so the world does not
 * move on while the camera does: it steps two frames at the end so the
 * area in view wakes up.
 */
export async function lookAt(page: Page, x: number): Promise<void> {
  await scrollTo(page, x);
  await settleCamera(page);
  // The sim hears where the camera is on its next step (faraway areas sleep), so take a couple.
  await page.evaluate(() => window.__bb!.isPaused() && window.__bb!.frames(2));
}

/**
 * Staging: put the camera at world x at once (for tests about something
 * else than scrolling), and step two frames so the area there wakes.
 */
export async function jumpTo(page: Page, x: number): Promise<void> {
  await page.evaluate((v) => window.__bb!.cameraTo(v), x);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__bb!.isPaused() && window.__bb!.frames(2));
}

export type UiName = Parameters<TestHook['uiClient']>[0];

/** Where a named UI control is once it has stopped moving (boards drop in with a bounce). */
export async function uiAt(page: Page, name: UiName): Promise<{ x: number; y: number }> {
  let last: { x: number; y: number } | null = null;
  let at: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      last = at;
      at = await page.evaluate((n) => window.__bb!.uiClient(n), name);
      return at !== null && last !== null && Math.hypot(at.x - last.x, at.y - last.y) < 1.5;
    })
    .toBe(true);
  return at!;
}

/** Click a named UI control (pause, resume, a toggle, the gear...) with the real mouse. */
export async function clickUi(page: Page, name: UiName): Promise<void> {
  const p = await uiAt(page, name);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
}

/** Run `n` frames of input and sim at 60 Hz right now (the sim should be frozen with `setPaused`). */
export const frames = (page: Page, n: number): Promise<void> =>
  page.evaluate((k) => window.__bb!.frames(k), n);

/** Freeze the sim's clock (or let it run again). Frozen, only `frames` and `step` move it. */
export const freeze = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((p) => window.__bb!.setPaused(p), on);

/**
 * With the sim frozen: press on an entity with the real mouse and run two
 * frames, so the grab lands however slow the machine is. Returns where the
 * mouse is.
 */
export async function pressFrozen(page: Page, id: number): Promise<{ x: number; y: number }> {
  const e = (await entity(page, id))!;
  const at = await toClient(page, e.x, e.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await frames(page, 2);
  expect((await entity(page, id))?.held).toBe(true);
  return at;
}

/** With the sim frozen: move the mouse in `steps` even steps, running `per` frames after each. */
export async function glideFrames(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps: number,
  per = 1,
): Promise<{ x: number; y: number }> {
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await frames(page, per);
  }
  return { x: from.x + dx, y: from.y + dy };
}

/** With the sim frozen: run frames until `done` says yes, up to `max` frames. Returns whether it did. */
export async function framesUntil(
  page: Page,
  done: () => Promise<boolean>,
  max: number,
  chunk = 30,
): Promise<boolean> {
  for (let n = 0; n < max; n += chunk) {
    if (await done()) return true;
    await frames(page, chunk);
  }
  return done();
}

/**
 * Open a slot with its world frozen before the first step. Test worlds are
 * seeded by slot, so a test that then drives the sim with `frames` and
 * `step` sees exactly the same world every run.
 */
export async function openFrozen(page: Page, slot: number): Promise<void> {
  await page.evaluate(() => window.__bb!.freezeNextWorld(true));
  await clickSlot(page, slot);
  expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(true);
}
