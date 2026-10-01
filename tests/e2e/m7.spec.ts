import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  POND_X,
  entities,
  entity,
  frames,
  lookAt,
  settleCamera,
  framesUntil,
  freeze,
  glideFrames,
  launchApp,
  openFrozen,
  pressFrozen,
  scrollTo,
  toClient,
} from './app';
import type { TestHook } from './app';

// M7 acceptance (game design doc, sections 3, 4, 12, and 19): more areas
// and unlocks, driven with the real mouse. The sim is frozen and stepped
// frame by frame wherever timing matters, so CI's slow software renderer
// sees exactly the same steps as a fast machine.
test.setTimeout(240_000);

type Command = Parameters<TestHook['send']>[0];

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const unlocked = (page: Page): Promise<string[]> => page.evaluate(() => window.__bb!.unlocked().open);
const camera = async (page: Page): Promise<number> => (await page.evaluate(() => window.__bb!.camera())).x;
type Logged = { name: string; tick: number; payload: Record<string, unknown> };
const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;
const fixture = async (page: Page, id: string): Promise<{ x: number; y: number }> =>
  (await page.evaluate((f) => window.__bb!.fixture(f), id))!;

/** With the sim frozen: carry what the mouse holds to world (x, y) and let go gently. */
async function carryTo(page: Page, from: { x: number; y: number }, x: number, y: number): Promise<void> {
  const to = await toClient(page, x, y);
  await glideFrames(page, from, to.x - from.x, to.y - from.y, 16, 2);
  await frames(page, 30);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await frames(page, 2);
}

test('watering the droopy sunflower with a wet sponge opens the flowerbed, for good', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    expect(await unlocked(page)).not.toContain('area_flowerbed_stage');
    // Locked: the camera can look 4 m past the barrier, then springs back.
    await scrollTo(page, 0);
    await expect.poll(() => camera(page)).toBeGreaterThan(POND_X - 4.2);
    await page.mouse.move(960, 600);
    await expect.poll(() => camera(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(POND_X - 0.05);
    await settleCamera(page);
    const soil = await fixture(page, 'fix_sunflower_gate');
    const sponge = (await entities(page)).find((e) => e.defId === 'item_sponge')!;
    // Dunk it in the pond...
    await carryTo(page, await pressFrozen(page, sponge.id), POND_X + 7.5, 8.2);
    expect(
      await framesUntil(page, async () => (await entity(page, sponge.id))!.tags.includes('tag_wet'), 300),
    ).toBe(true);
    // ...and onto the sunflower's cracked soil.
    await carryTo(page, await pressFrozen(page, sponge.id), soil.x, soil.y - 0.6);
    expect(
      await framesUntil(page, async () => (await unlocked(page)).includes('area_flowerbed_stage'), 240),
    ).toBe(true);
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_sunflower_drink');
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toEqual(
      expect.arrayContaining(['slurp', 'unlock']),
    );
    // Now the camera goes on into the flowerbed, and it stays open after a save and a relaunch.
    await freeze(page, false);
    await scrollTo(page, 2);
    expect(await camera(page)).toBeLessThan(10);
    await page.evaluate(() => window.__bb!.saveNow());
    await bb.close({ keepUserData: true });
    const again = await launchApp(bb.userData);
    try {
      await openFrozen(again.page, 0);
      expect(await unlocked(again.page)).toContain('area_flowerbed_stage');
    } finally {
      await again.close();
    }
  } catch (err) {
    await bb.close();
    throw err;
  }
});

test('the heavy lattice panel drags aside slowly and opens the way under the porch', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 1);
    await lookAt(page, PLAZA_X + 24.5);
    // The camera stops short of the porch, past the lattice.
    const span = await page.evaluate(() => window.__bb!.unlocked().span);
    expect((await camera(page)) + 19.2).toBeLessThanOrEqual(span.x1 + 4.01);
    const lattice = (await entities(page)).find((e) => e.defId === 'item_lattice_panel')!;
    const at = await toClient(page, lattice.x, lattice.y - 1.5);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    expect((await entity(page, lattice.id))!.held).toBe(true);
    // Pull it toward the plaza: it lags behind the hand.
    await glideFrames(page, at, -360, 0, 30, 3);
    await frames(page, 60);
    await page.waitForTimeout(150);
    await page.mouse.up();
    expect(
      await framesUntil(page, async () => (await unlocked(page)).includes('area_under_porch'), 300),
    ).toBe(true);
    expect((await entity(page, lattice.id))!.x).toBeLessThan(lattice.x - 1.8);
  } finally {
    await bb.close();
  }
});

test('clicks work the porch lamp and the stage lights; a click on the claw button finds Prim', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 2);
    for (const area of [
      'area_flowerbed_stage',
      'area_under_porch',
      'area_compost_lab',
      'area_treehouse_arcade',
    ])
      await send(page, { type: 'unlock', area });
    await frames(page, 2);
    const click = async (id: string): Promise<void> => {
      const f = await fixture(page, id);
      await lookAt(page, f.x - 9.6);
      const p = await toClient(page, f.x, f.y);
      await page.mouse.move(p.x, p.y);
      await frames(page, 2);
      expect((await page.evaluate(() => window.__bb!.cursor())).pose).toBe('hover_poke');
      await page.mouse.down();
      await page.mouse.up();
      await frames(page, 3);
    };
    await click('fix_porch_lamp');
    expect((await page.evaluate(() => window.__bb!.places())).lampOn).toBe(true);
    await click('fix_stage_lights');
    await click('fix_stage_lights');
    expect((await page.evaluate(() => window.__bb!.places())).stageLights).toBe(2);
    await click('fix_claw_button');
    expect(
      await framesUntil(
        page,
        async () => (await page.evaluate(() => window.__bb!.secrets())).includes('secret_prim_found'),
        900,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => window.__bb!.cast())).toContain('bug_mantis_prim');
  } finally {
    await bb.close();
  }
});

test('one of the plaza twigs has legs: picking it up finds Twig', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    const twig = (await entities(page)).find((e) => e.defId === 'bug_stickinsect_twig')!;
    expect(twig.bug!.pending).toBe('disguised');
    expect(await page.evaluate(() => window.__bb!.cast())).not.toContain('bug_stickinsect_twig');
    await lookAt(page, twig.x - 9.6);
    await pressFrozen(page, twig.id);
    await page.mouse.up();
    await frames(page, 30);
    expect(await page.evaluate(() => window.__bb!.cast())).toContain('bug_stickinsect_twig');
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_twig_blinks');
  } finally {
    await bb.close();
  }
});

test('a ball rolled through the can tunnel opens the latch; a marble clinks back out', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 1);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await frames(page, 2);
    const wall = (await fixture(page, 'fix_can_tunnel')).x + 0.2;
    // Locked: the camera stops 4 m past the tin can wall.
    await lookAt(page, wall);
    expect((await camera(page)) + 19.2).toBeLessThanOrEqual(wall + 4.01);
    await lookAt(page, wall - 15);
    const roll = async (defId: string): Promise<number> => {
      await send(page, { type: 'spawn', kind: 'item', defId, x: wall - 4, y: 6 });
      await frames(page, 90);
      const thing = (await entities(page)).filter((e) => e.defId === defId).sort((a, b) => b.id - a.id)[0]!;
      // Pick it up, set it down by the wall, then bowl it along the floor at the tunnel.
      const from = await pressFrozen(page, thing.id);
      const low = await toClient(page, wall - 3.2, 8.6);
      await glideFrames(page, from, low.x - from.x, low.y - from.y, 16, 2);
      await frames(page, 20);
      await glideFrames(page, low, 64, 0, 8, 1);
      await page.mouse.up();
      await frames(page, 2);
      return thing.id;
    };
    // A marble is too small to bump the latch: it rattles back out.
    const marble = await roll('item_marble_blue');
    expect(
      await framesUntil(
        page,
        async () => (await events(page, 'tunnel_rolled')).some((e) => e.payload.id === marble),
        240,
      ),
    ).toBe(true);
    await frames(page, 60);
    expect((await events(page, 'tunnel_rolled')).find((e) => e.payload.id === marble)!.payload.fits).toBe(
      false,
    );
    expect(await unlocked(page)).not.toContain('area_compost_lab');
    expect((await entity(page, marble))!.x).toBeLessThan(wall);
    // Clear it out of the tunnel mouth before bowling the next one.
    await carryTo(page, await pressFrozen(page, marble), wall - 8, 8.2);
    // A rubber ball is just a pill bug wide: through it goes, and the latch drops.
    const ball = await roll('item_rubber_ball');
    expect(
      await framesUntil(page, async () => (await unlocked(page)).includes('area_compost_lab'), 300),
    ).toBe(true);
    expect((await events(page, 'tunnel_rolled')).find((e) => e.payload.id === ball)!.payload.fits).toBe(true);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toEqual(
      expect.arrayContaining(['latch', 'unlock']),
    );
  } finally {
    await bb.close();
  }
});

test('Moose, set upright and dropped in the bottom bucket, outweighs the acorn and rides up to the treehouse', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 2);
    for (const area of ['area_under_porch', 'area_compost_lab']) await send(page, { type: 'unlock', area });
    await frames(page, 2);
    const moose = (await entities(page)).find((e) => e.defId === 'bug_stagbeetle_moose')!;
    expect(moose.bug!.pending).toBe('stuck');
    const lift = await fixture(page, 'fix_bucket_lift');
    await lookAt(page, lift.x - 12);
    // The treehouse is shut: the camera may only peek 4 m past the lift's wall.
    const span = await page.evaluate(() => window.__bb!.unlocked().span);
    expect((await camera(page)) + 19.2).toBeLessThanOrEqual(span.x1 + 4.01);
    // Grabbing Moose rights him (and finds him); carry him over the bucket and let go.
    const from = await pressFrozen(page, moose.id);
    await send(page, { type: 'set_need', id: moose.id, need: 'need_energy', value: 100 });
    await carryTo(page, from, lift.x, lift.y - 1.2);
    expect(await page.evaluate(() => window.__bb!.cast())).toContain('bug_stagbeetle_moose');
    expect(
      await framesUntil(
        page,
        async () => (await page.evaluate(() => window.__bb!.places())).lift !== 'down',
        240,
      ),
    ).toBe(true);
    // Up he goes; the camera follows the bucket into the treehouse, which opens for good.
    expect(
      await framesUntil(page, async () => (await unlocked(page)).includes('area_treehouse_arcade'), 600),
    ).toBe(true);
    expect((await events(page, 'lift_moved')).map((e) => e.payload.phase)).toEqual(
      expect.arrayContaining(['up', 'top']),
    );
    // The glide runs on the screen's clock, not the sim's.
    await expect.poll(() => camera(page), { timeout: 15_000 }).toBeGreaterThan(lift.x - 6);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toEqual(
      expect.arrayContaining(['lift', 'unlock']),
    );
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_moose_found');
  } finally {
    await bb.close();
  }
});
