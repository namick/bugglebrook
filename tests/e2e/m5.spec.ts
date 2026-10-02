import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLAZA_X,
  POND_X,
  bugNamed,
  clickSlot,
  clickUi,
  content,
  entities,
  entity,
  launchApp,
  pressOn,
  scrollTo,
  spawnItem,
  toClient,
  uiAt,
  waitForScene,
} from './app';
import type { Launched } from './app';

// M5 acceptance (game design doc, section 19): saves, the menu, settings,
// and the pocket, driven with the real mouse and checked through window.__bb.

/** Back to the menu the way a player goes: pause, then the stump sign. */
async function toMenu(page: Page): Promise<void> {
  await clickUi(page, 'pause');
  await clickUi(page, 'to_menu');
  await waitForScene(page, 'menu');
}

/** Close with the menu's door and wait for the app to exit. */
async function quitByDoor(bb: Launched): Promise<void> {
  const closed = bb.app.waitForEvent('close');
  await clickUi(bb.page, 'door');
  await closed;
}

/** Press a slot sign and drag it with the real mouse to a client point. */
async function dragSign(page: Page, slot: number, to: { x: number; y: number }) {
  // Signs spring up from the ground when the menu opens: wait until they stand still.
  await expect.poll(() => page.evaluate(() => window.__bb!.menuSettled()), { timeout: 20_000 }).toBe(true);
  const from = (await page.evaluate((s) => window.__bb!.slotButtonClient(s), slot))!;
  // Stop the menu's clock: the lid then only closes as the test steps it,
  // however slow the machine is.
  await page.evaluate(() => window.__bb!.freezeMenu(true));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate((s) => window.__bb!.sign(s)?.pressed, slot)).toBe(true);
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 16, from.y + ((to.y - from.y) * i) / 16);
    await page.waitForTimeout(20);
  }
  await expect
    .poll(() => page.evaluate((s) => window.__bb!.sign(s), slot))
    .toMatchObject({ dragging: true, picture: true });
  return from;
}

test('a slot autosaves with its picture, and the world is back after quitting and relaunching', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    const { page } = bb;
    await clickSlot(page, 1);
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    // Play: drop a pebble and drag it somewhere with the mouse.
    const pebble = await spawnItem(page, 'item_pebble', PLAZA_X + 9);
    const at = await pressOn(page, pebble);
    const to = await toClient(page, PLAZA_X + 11, 7.5);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(at.x + ((to.x - at.x) * i) / 12, at.y + ((to.y - at.y) * i) / 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect
      .poll(async () => {
        const e = (await entity(page, pebble))!;
        return !e.held && Math.hypot(e.vx, e.vy) < 0.3;
      })
      .toBe(true);
    // Freeze the world so what is saved is what we remember.
    await page.evaluate(() => window.__bb!.setPaused(true));
    const placed = (await entity(page, pebble))!;
    const tick = await page.evaluate(() => window.__bb!.tick());
    expect(tick).toBeGreaterThan(0);

    await toMenu(page);
    await page.evaluate(() => window.__bb!.setPaused(false));
    await expect.poll(() => page.evaluate(() => window.__bb!.slotPictures())).toEqual([null, true, null]);
    // The file has a picture of the world and a backup beside it.
    const file = JSON.parse(readFileSync(join(userData, 'saves', 'slot-2.json'), 'utf8'));
    expect(file.meta.thumb).toMatch(/^data:image\/(jpeg|png);base64,/);
    expect(existsSync(join(userData, 'saves', 'slot-2.bak.json'))).toBe(true);
    await quitByDoor(bb);

    bb = await launchApp(userData);
    await waitForScene(bb.page, 'menu');
    expect(await bb.page.evaluate(() => window.__bb!.slotPictures())).toEqual([null, true, null]);
    await clickSlot(bb.page, 1);
    await bb.page.evaluate(() => window.__bb!.setPaused(true));
    const back = (await entity(bb.page, pebble))!;
    expect(back.defId).toBe('item_pebble');
    expect(Math.abs(back.x - placed.x)).toBeLessThan(0.1);
    expect(Math.abs(back.y - placed.y)).toBeLessThan(0.1);
    expect(await bb.page.evaluate(() => window.__bb!.tick())).toBeGreaterThanOrEqual(tick);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close().catch(() => undefined);
  }
});

test('a corrupt save comes back from its backup', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    await clickSlot(bb.page, 0);
    await bb.page.evaluate(() => window.__bb!.saveNow());
    await toMenu(bb.page);
    await bb.close({ keepUserData: true });
    // Something mangled the save while the game was closed.
    writeFileSync(join(userData, 'saves', 'slot-1.json'), '{"version": 6, "world": ', 'utf8');
    bb = await launchApp(userData);
    await waitForScene(bb.page, 'menu');
    expect(await bb.page.evaluate(() => window.__bb!.slotPictures())).toEqual([true, null, null]);
    await clickSlot(bb.page, 0);
    expect((await entities(bb.page)).filter((e) => e.kind === 'bug' && !e.bug?.pending)).toHaveLength(5);
    expect(existsSync(join(userData, 'saves', 'slot-1.corrupt-1.json'))).toBe(true);
  } finally {
    await bb.close();
  }
});

test('dragging a slot sign into the compost bin deletes it; pulling it back out in time keeps it', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    for (const slot of [0, 2]) {
      await clickSlot(page, slot);
      await page.evaluate(() => window.__bb!.saveNow());
      await toMenu(page);
    }
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.listSlots())).map((s) => s.exists))
      .toEqual([true, false, true]);
    const problems = await page.evaluate(() => window.__bb!.saveProblems());
    expect(await page.evaluate(() => window.__bb!.slotPictures()), problems.join('\n')).toEqual([
      true,
      null,
      true,
    ]);
    const bin = await uiAt(page, 'bin');
    const mouth = { x: bin.x, y: bin.y - 60 };

    const menuFrames = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.menuFrames(k), n);
    const progress = (): Promise<number> => page.evaluate(() => window.__bb!.binProgress());

    // Slot 3: into the bin, then back out before the lid shuts (1 s of its 1.5 s).
    const home = await dragSign(page, 2, mouth);
    await menuFrames(60);
    expect(await progress()).toBeGreaterThan(0.5);
    expect(await progress()).toBeLessThan(1);
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(mouth.x + ((home.x - mouth.x) * i) / 10, mouth.y + ((home.y - mouth.y) * i) / 10);
    await menuFrames(30);
    expect(await progress()).toBe(0);
    await page.mouse.up();
    await menuFrames(150);
    expect(await page.evaluate(() => window.__bb!.sign(2)?.picture)).toBe(true);
    expect((await page.evaluate(() => window.__bb!.listSlots()))[2]!.exists).toBe(true);

    // Slot 1: dropped in the bin, the lid closes on it and it is gone.
    await page.evaluate(() => window.__bb!.freezeMenu(false));
    await dragSign(page, 0, mouth);
    await page.mouse.up();
    await menuFrames(100);
    await page.evaluate(() => window.__bb!.freezeMenu(false));
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.listSlots())).map((s) => s.exists), {
        timeout: 15_000,
      })
      .toEqual([false, false, true]);
    await expect.poll(() => page.evaluate(() => window.__bb!.slotPictures())).toEqual([null, null, true]);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('bin_shut');
    // The empty sign starts a new world.
    await clickSlot(page, 0);
    expect(await page.evaluate(() => window.__bb!.scene())).toBe('world');
  } finally {
    await bb.close();
  }
});

test('the pause board freezes the world, and settings persist across restarts outside the slot files', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await clickUi(page, 'pause');
    await uiAt(page, 'resume'); // the board has dropped in and stopped
    expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(true);
    const t = await page.evaluate(() => window.__bb!.tick());
    // Drag the sound slider's sunflower from 80 down to about 30.
    const from = (await page.evaluate(() => window.__bb!.sliderClient('sfx', 80)))!;
    const to = (await page.evaluate(() => window.__bb!.sliderClient('sfx', 30)))!;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, to.y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    // Click the music vine near its start: about 10.
    const music = (await page.evaluate(() => window.__bb!.sliderClient('music', 10)))!;
    await page.mouse.click(music.x, music.y);
    await clickUi(page, 'toggle_reduceMotion');
    await clickUi(page, 'toggle_edgeScroll');
    const settings = await page.evaluate(() => window.__bb!.settings());
    expect(settings.sfx).toBeGreaterThanOrEqual(27);
    expect(settings.sfx).toBeLessThanOrEqual(33);
    expect(settings.music).toBeGreaterThanOrEqual(7);
    expect(settings.music).toBeLessThanOrEqual(13);
    expect(settings.reduceMotion).toBe(true);
    expect(settings.edgeScroll).toBe(false);
    expect(await page.evaluate(() => window.__bb!.tick())).toBe(t);
    await clickUi(page, 'resume');
    expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__bb!.tick())).toBeGreaterThan(t);
    expect(await page.evaluate(() => window.__bb!.reduceMotion())).toBe(true);
    await page.evaluate(() => window.__bb!.saveNow());
    await bb.close({ keepUserData: true });

    const stored = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
    expect(stored).toMatchObject({
      sfx: settings.sfx,
      music: settings.music,
      reduceMotion: true,
      edgeScroll: false,
    });
    const slotText = readFileSync(join(userData, 'saves', 'slot-1.json'), 'utf8');
    expect(slotText).not.toMatch(/reduceMotion|edgeScroll|"sfx"/);

    bb = await launchApp(userData);
    await waitForScene(bb.page, 'menu');
    expect(await bb.page.evaluate(() => window.__bb!.settings())).toEqual(settings);
    // The menu's gear opens the same board, showing the stored values.
    await clickUi(bb.page, 'gear');
    await expect.poll(() => bb.page.evaluate(() => window.__bb!.panelOpen())).toBe(true);
    await clickUi(bb.page, 'toggle_reduceMotion');
    await expect.poll(() => bb.page.evaluate(() => window.__bb!.settings().reduceMotion)).toBe(false);
    await clickUi(bb.page, 'resume');
    await expect.poll(() => bb.page.evaluate(() => window.__bb!.panelOpen())).toBe(false);
  } finally {
    await bb.close();
  }
});

/**
 * Slam a bug straight down onto the stump, frame by frame (so a slow
 * renderer does exactly the same), then let the screen draw a few frames.
 * Returns how many shakes the view asked for and the biggest shake offset drawn.
 */
async function slam(page: Page, id: number): Promise<{ requests: number; max: number }> {
  const frames = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
  await page.evaluate(() => window.__bb!.setPaused(true));
  await page.evaluate(() => window.__bb!.resetShakeStats());
  const b = (await entity(page, id))!;
  await page.evaluate(([x, y]) => window.__bb!.send({ type: 'grab', x: x!, y: y! }), [b.x, b.y]);
  await frames(2);
  expect((await entity(page, id))!.held).toBe(true);
  await page.evaluate((x) => window.__bb!.send({ type: 'drag', x, y: 0.8 }), b.x);
  await frames(60);
  await page.evaluate(() => window.__bb!.send({ type: 'release', vx: 0, vy: 26 }));
  // Step until it hits, one frame at a time so each impact gets drawn.
  for (let i = 0; i < 30; i++) {
    await frames(1);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const stats = await page.evaluate(() => window.__bb!.shakeStats());
  await page.evaluate(() => window.__bb!.setPaused(false));
  return stats;
}

test('reduce motion turns off screen shake entirely', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    // Glorp, alone on the stump, never gets dizzy: slam him as often as needed.
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await content(page, glorp.id);
    const loud = await slam(page, glorp.id);
    expect(loud.requests).toBeGreaterThan(0);
    expect(loud.max).toBeGreaterThan(0);
    await clickUi(page, 'pause');
    await clickUi(page, 'toggle_reduceMotion');
    await clickUi(page, 'resume');
    await expect.poll(() => page.evaluate(() => window.__bb!.reduceMotion())).toBe(true);
    await page.waitForTimeout(1500);
    const calm = await slam(page, glorp.id);
    expect(calm.requests).toBeGreaterThan(0);
    expect(calm.max).toBe(0);
  } finally {
    await bb.close();
  }
});

test('the pocket carries a thing from the pond to the plaza', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await scrollTo(page, POND_X);
    const sponge = (await entities(page)).find((e) => e.defId === 'item_sponge')!;
    expect(await page.evaluate((x) => window.__bb!.areaAt(x), sponge.x)).toBe('area_puddle_pond');
    // Pick it up; the pocket slides up while something is held.
    const at = await pressOn(page, sponge.id);
    await expect.poll(() => page.evaluate(() => window.__bb!.pocketOpen())).toBe(1);
    const slot = (await page.evaluate(() => window.__bb!.pocketSlotClient(2)))!;
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(at.x + ((slot.x - at.x) * i) / 15, at.y + ((slot.y - at.y) * i) / 15);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect.poll(async () => (await entity(page, sponge.id))!.pocket).toBe(2);
    expect(await page.evaluate(() => window.__bb!.pocket())).toEqual([[], [], [sponge.id], [], [], []]);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('pocket_in');

    // Over in the plaza, drag it back out of the pocket.
    await scrollTo(page, PLAZA_X + 4);
    // Hover the bottom edge of the screen: the pocket slides up.
    const cam = (await page.evaluate(() => window.__bb!.camera())).x;
    const bottom = await toClient(page, cam + 9.6, 10.72);
    await page.mouse.move(bottom.x, bottom.y, { steps: 4 });
    await expect.poll(() => page.evaluate(() => window.__bb!.pocketOpen())).toBe(1);
    const out = (await page.evaluate(() => window.__bb!.pocketSlotClient(2)))!;
    await page.mouse.move(out.x, out.y, { steps: 3 });
    await page.mouse.down();
    await expect.poll(async () => (await entity(page, sponge.id))!.held).toBe(true);
    const drop = await toClient(page, PLAZA_X + 14, 6.5);
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(out.x + ((drop.x - out.x) * i) / 15, out.y + ((drop.y - out.y) * i) / 15);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const e = (await entity(page, sponge.id))!;
        return !e.held && e.pocket === undefined && Math.hypot(e.vx, e.vy) < 0.3;
      })
      .toBe(true);
    const e = (await entity(page, sponge.id))!;
    expect(await page.evaluate((x) => window.__bb!.areaAt(x), e.x)).toBe('area_stump_plaza');
    expect(await page.evaluate(() => window.__bb!.pocket())).toEqual([[], [], [], [], [], []]);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the first scene: Dot naps on the bottle cap and wakes when the hand comes near', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.enableIntro(true));
    await clickSlot(page, 0);
    await expect.poll(async () => (await bugNamed(page, 'bug_ladybug_dot')).bug!.mode).toBe('st_sleep');
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    // The camera slides in from the pond side and settles with Dot in the middle.
    // Scene time runs slower than the wall clock on a slow renderer (frames are capped at 0.1 s).
    await expect
      .poll(() => page.evaluate(() => window.__bb!.intro()?.t ?? 0), { timeout: 60_000 })
      .toBeGreaterThan(3.2);
    const cam = (await page.evaluate(() => window.__bb!.camera())).x;
    expect(Math.abs(cam + 9.6 - dot.x)).toBeLessThan(0.5);
    expect((await page.evaluate(() => window.__bb!.intro()))!.cover).toBe(0);
    const near = await toClient(page, dot.x + 1.2, dot.y - 1);
    await page.mouse.move(near.x - 300, near.y - 200);
    await page.mouse.move(near.x, near.y, { steps: 8 });
    await expect
      .poll(async () => (await entity(page, dot.id))!.bug!.mode, { timeout: 30_000 })
      .not.toBe('st_sleep');
    const woke = (await page.evaluate(() => window.__bb!.events())).filter((e) => e.name === 'bug_woke');
    expect(woke.length).toBeGreaterThan(0);
  } finally {
    await bb.close();
  }
});
