import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  POND_X,
  clickSlot,
  clickUi,
  entities,
  frames,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  spawnItem,
  toClient,
  uiAt,
  waitForScene,
} from './app';
import type { TestHook } from './app';

// The discoverability pass, with the real mouse: ghost-hand demos after the
// hand idles, affordance wobbles and glints, the cauldron's stir invitation,
// the discovery stamps, and the home stump's press-and-hold.

type Command = Parameters<TestHook['send']>[0];
type Hints = NonNullable<ReturnType<TestHook['hints']>>;
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const hints = async (page: Page): Promise<Hints> => (await page.evaluate(() => window.__bb!.hints()))!;
const fixture = async (page: Page, id: string): Promise<{ x: number; y: number }> =>
  (await page.evaluate((f) => window.__bb!.fixture(f), id))!;
const cameraX = async (page: Page): Promise<number> => (await page.evaluate(() => window.__bb!.camera())).x;
const PORCH_X = 102.4;
const COMPOST_X = 134.4;

test('after the hand idles, a ghost hand demos the sundial without touching it, and vanishes at a move', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await page.evaluate(() => window.__bb!.setGhostIdle(1.5));
    // Rest the hand in the sky, over nothing.
    await page.mouse.move(400, 120, { steps: 4 });
    const clock = (await page.evaluate(() => window.__bb!.sky())).clock;
    await expect.poll(async () => (await hints(page)).ghost.active, { timeout: 20_000 }).toBe('dial');
    // It shows: a see-through hand on the screen, gripping the rim at some point.
    await expect.poll(async () => (await hints(page)).ghost.frame?.alpha ?? 0).toBeGreaterThan(0.2);
    await expect.poll(async () => (await hints(page)).ghost.frame?.pose, { timeout: 10_000 }).toBe('grab');
    // Pure show: the dial never turned.
    const sky = await page.evaluate(() => window.__bb!.sky());
    expect(sky.fastForward).toBe(false);
    expect(sky.clock - clock).toBeLessThan(60 * 60 * 2);
    const evs = await page.evaluate(() => window.__bb!.events().map((e) => e.name));
    expect(evs).not.toContain('time_skipped');
    // Any move stops it at once.
    await page.mouse.move(460, 160);
    const after = await hints(page);
    expect(after.ghost.active).toBeNull();
    expect(after.ghost.stopped).toBe(1);
    expect(after.ghost.frame).toBeNull();
    // And it does not come straight back in the same breath.
    await page.waitForTimeout(2500);
    expect((await hints(page)).ghost.active).toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the ghost never demos what the player already did: after a turn of the dial it shows the pocket', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 1);
    const dial = await fixture(page, 'fix_sundial');
    // Turn the rim clockwise with the real mouse.
    const rim = (a: number) => toClient(page, dial.x + Math.cos(a) * 0.8, dial.y + Math.sin(a) * 0.28);
    const p0 = await rim(-Math.PI / 2);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const p = await rim(-Math.PI / 2 + (Math.PI * i) / 12);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect.poll(async () => (await hints(page)).ghost.done).toContain('dial');
    await page.evaluate(() => window.__bb!.setGhostIdle(1.5));
    await page.mouse.move(400, 120, { steps: 4 });
    await expect.poll(async () => (await hints(page)).ghost.active, { timeout: 25_000 }).toBe('pocket');
    // The tray slides up to meet the ghost, but nothing goes in.
    await expect
      .poll(async () => (await hints(page)).ghost.frame?.tray ?? false, { timeout: 10_000 })
      .toBe(true);
    await expect.poll(() => page.evaluate(() => window.__bb!.pocketOpen())).toBeGreaterThan(0.5);
    expect((await page.evaluate(() => window.__bb!.pocket())).flat()).toEqual([]);
    await page.mouse.move(440, 140);
    expect((await hints(page)).ghost.active).toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the sundial glints when the hand rests near it, and every locked barrier wobbles when its edge is hovered', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 2);
    const dial = await fixture(page, 'fix_sundial');
    // Rest the hand a little above the dial, over nothing grabbable.
    const near = await toClient(page, dial.x + 0.6, dial.y - 1.2);
    await page.mouse.move(near.x, near.y, { steps: 4 });
    await expect
      .poll(async () => (await hints(page)).wobbles.sundial ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);
    // Hovering the rim glints its notches for as long as the hand is there.
    const rim = await toClient(page, dial.x + 0.6, dial.y);
    await page.mouse.move(rim.x, rim.y, { steps: 3 });
    await expect.poll(async () => (await hints(page)).glints.sundial ?? 0).toBe(1);
    // Every barrier: the hand at the edge of its locked area. Each opens the way to the next.
    const edge = async (key: string, wall: number, cam: number): Promise<void> => {
      // The camera's limits follow the unlocks on the next frame: wait until it is where it should be.
      await expect
        .poll(async () => {
          await page.evaluate((v) => window.__bb!.cameraTo(v), cam);
          return Math.abs((await cameraX(page)) - cam);
        })
        .toBeLessThan(0.05);
      await jumpTo(page, cam);
      const before = (await hints(page)).wobbles[key] ?? 0;
      const side = wall <= cam + 1 ? 0.8 : -0.8;
      const at = await toClient(page, wall + side, 4.5);
      await page.mouse.move(at.x, at.y - 40);
      await page.mouse.move(at.x, at.y, { steps: 3 });
      await expect
        .poll(async () => (await hints(page)).wobbles[key] ?? 0, { message: key })
        .toBeGreaterThan(before);
    };
    await edge('barrier_sunflower', POND_X + 0.02, POND_X + 0.02);
    await edge('barrier_lattice', PORCH_X + 5.3, PORCH_X + 5.3 - 19.2);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await edge('barrier_can_tunnel', PORCH_X + 30.5, PORCH_X + 30.5 - 19.2);
    await send(page, { type: 'unlock', area: 'area_compost_lab' });
    await edge('barrier_bucket_lift', COMPOST_X + 26.5, COMPOST_X + 26.5 - 19.2);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the lattice wobbles when the hand rests on it before the porch is open', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await jumpTo(page, PORCH_X - 12);
    const lattice = (await entities(page)).find((e) => e.defId === 'item_lattice_panel')!;
    const at = await toClient(page, lattice.x, lattice.y);
    await page.mouse.move(at.x - 60, at.y);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await expect.poll(async () => (await hints(page)).wobbles.barrier_lattice ?? 0).toBeGreaterThan(0);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('after the first ingredient the ladle goes round by itself, and the hand turns to a stir over the pot', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 1);
    for (const area of ['area_under_porch', 'area_compost_lab'] as const)
      await send(page, { type: 'unlock', area });
    await frames(page, 2);
    const p = (await page.evaluate(() => window.__bb!.m8Points()))!;
    await jumpTo(page, COMPOST_X - 1);
    expect((await hints(page)).ladleInviting).toBe(false);
    const before = new Set((await entities(page)).map((e) => e.id));
    await send(page, {
      type: 'spawn',
      kind: 'item',
      defId: 'item_mushroom_cap',
      x: p.cauldron.x - 2.2,
      y: 7.2,
    });
    await frames(page, 30);
    const cap = (await entities(page)).find((e) => !before.has(e.id) && e.defId === 'item_mushroom_cap')!.id;
    const from = await pressFrozen(page, cap);
    const over = await toClient(page, p.cauldron.x, p.cauldron.y - 0.5);
    await glideFrames(page, from, 0, over.y - from.y, 2, 2);
    await glideFrames(page, { x: from.x, y: over.y }, over.x - from.x, 0, 3, 2);
    await frames(page, 12);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await frames(page, 2);
    expect((await page.evaluate(() => window.__bb!.cauldron())).contents).toEqual(['item_mushroom_cap']);
    // The view runs on the screen's clock: the ladle starts going round on its own.
    await expect.poll(async () => (await hints(page)).ladleInviting).toBe(true);
    // Over the pot, the hand grips an imaginary ladle and shows a swirl.
    const mid = await toClient(page, p.cauldron.x, p.cauldron.y);
    await page.mouse.move(mid.x + 40, mid.y, { steps: 3 });
    await frames(page, 2);
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.cursor())).pose).toBe('stir');
    // Stirring by hand takes over from the invitation.
    const rx = (await toClient(page, p.cauldron.x + 0.9, p.cauldron.y)).x - mid.x;
    await page.mouse.move(mid.x + rx, mid.y);
    await page.mouse.down();
    await frames(page, 1);
    for (let i = 1; i <= 6; i++) {
      const a = (i / 8) * Math.PI * 2;
      await page.mouse.move(mid.x + Math.cos(a) * rx, mid.y + (Math.sin(a) * rx) / 2);
      await frames(page, 1);
    }
    expect((await page.evaluate(() => window.__bb!.cursor())).pose).toBe('stir');
    await page.mouse.up();
    await frames(page, 2);
    await expect.poll(async () => (await hints(page)).ladleInviting).toBe(false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a secret found by hand stamps the discovery strip, which fades when the hand is away and keeps it in the save', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 2);
    expect((await page.evaluate(() => window.__bb!.stamps()))!.total).toBe(0);
    // Five quick clicks on the sun painted on the sundial: the sun puts on shades.
    const dial = await fixture(page, 'fix_sundial');
    const sun = await toClient(page, dial.x - 0.5, dial.y);
    await page.mouse.move(sun.x, sun.y, { steps: 3 });
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(sun.x, sun.y);
      await page.waitForTimeout(60);
    }
    await expect.poll(() => page.evaluate(() => window.__bb!.secrets())).toContain('secret_sun_shades');
    // The stamp lands on the strip with a thump.
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.stamps()))!.landed).toBe(1);
    const strip = (await page.evaluate(() => window.__bb!.stamps()))!;
    expect(strip.stamps).toEqual([{ kind: 'secret', ref: 'secret_sun_shades' }]);
    expect(strip.visible).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('stamp');
    // Five seconds with the hand away and it fades to 40 percent; near it, it comes back.
    await page.mouse.move(400, 700, { steps: 3 });
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.stamps()))!.alpha, { timeout: 30_000 })
      .toBeLessThan(0.45);
    const book = await uiAt(page, 'stamps');
    await page.mouse.move(book.x - 60, book.y + 20, { steps: 4 });
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.stamps()))!.alpha)
      .toBeGreaterThan(0.95);
    // Back to the menu and in again: the stamp is still there, without landing again.
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await waitForScene(page, 'menu');
    await clickSlot(page, 2);
    const again = (await page.evaluate(() => window.__bb!.stamps()))!;
    expect(again.total).toBe(1);
    expect(again.landed).toBe(0);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the home stump acts only when held, and a fling let go over it does not take the camera home', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    // Over the pond, with dry bank on the right of the screen.
    await jumpTo(page, POND_X + 14);
    const home = await uiAt(page, 'home');
    // A quick click: a little shake, and the camera stays.
    const x0 = await cameraX(page);
    await page.mouse.move(home.x, home.y, { steps: 3 });
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await expect.poll(async () => (await hints(page)).home.shake).toBeGreaterThan(0);
    await page.waitForTimeout(1200);
    expect(Math.abs((await cameraX(page)) - x0)).toBeLessThan(0.2);
    // A thing flung right and let go over the stump: still no trip home.
    const pebble = await spawnItem(page, 'item_pebble', POND_X + 25);
    const e = (await entities(page)).find((q) => q.id === pebble)!;
    const at = await toClient(page, e.x, e.y);
    await page.mouse.move(at.x, at.y, { steps: 2 });
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(at.x + ((home.x - at.x) * i) / 6, at.y + ((home.y - at.y) * i) / 6);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    expect((await hints(page)).home.progress).toBe(0);
    expect(await cameraX(page)).toBeLessThan(PLAZA_X - 8);
    // Held down: the ring fills and the camera glides home.
    await page.mouse.move(home.x, home.y, { steps: 3 });
    const held = await cameraX(page);
    await page.mouse.down();
    await expect.poll(async () => (await hints(page)).home.progress).toBeGreaterThan(0.3);
    // Keep holding until the ring closes and the camera sets off (frames can be slow here).
    await expect.poll(() => cameraX(page), { timeout: 30_000 }).toBeGreaterThan(held + 0.5);
    await page.mouse.up();
    await expect.poll(() => cameraX(page), { timeout: 30_000 }).toBeGreaterThan(PLAZA_X);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
