import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  bugNamed,
  clickSlot,
  content,
  entities,
  entity,
  holdNearMouth,
  launchApp,
  pressOn,
  spawnItem,
  toClient,
} from './app';

// M2 acceptance (game design doc, section 19): feeding, likes, reactions,
// sounds, and the hand cursor, driven with the real mouse. Waits are
// generous because CI renders in software at a few frames per second.
test.setTimeout(180_000);

type Logged = { name: string; tick: number; payload: Record<string, unknown> };

const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;

const hook = <T>(page: Page, fn: () => T): Promise<T> => page.evaluate(fn);

test('a berry dropped within 50 px of a mouth is eaten; outside 50 px it falls', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    // Glorp, alone on the stump top, so no other mouth is nearby.
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    for (const e of await entities(page)) if (e.kind === 'bug') await content(page, e.id);

    // Outside the snap radius: about 75 px from the mouth. It just falls.
    const far = await spawnItem(page, 'item_berry_red', glorp.x + 1.8);
    await holdNearMouth(page, far, glorp.id, 0.35, -0.65);
    // While held, every mouth glows by taste; berries are neutral to Glorp.
    await expect
      .poll(() => hook(page, () => window.__bb!.glowing()))
      .toContainEqual({ id: glorp.id, liking: 'neutral' });
    expect(await page.evaluate((id) => window.__bb!.dropTarget(id), far)).toBeNull();
    await page.mouse.up();
    await expect.poll(async () => (await entity(page, far))?.vy ?? 1).toBeLessThan(0.05);
    await page.waitForTimeout(300);
    expect((await events(page, 'bug_fed')).filter((e) => e.payload.itemId === far)).toEqual([]);
    expect(await entity(page, far)).not.toBeNull();
    expect((await entity(page, far))!.inMouthOf).toBeUndefined();

    // Inside: 30 px above the mouth. Into the mouth it goes.
    await content(page, glorp.id);
    const near = await spawnItem(page, 'item_berry_red', (await entity(page, glorp.id))!.x + 1.8);
    await holdNearMouth(page, near, glorp.id, 0.05, -0.3);
    await expect.poll(() => page.evaluate((id) => window.__bb!.dropTarget(id), near)).toBe(glorp.id);
    await page.mouse.up();
    await expect.poll(async () => (await events(page, 'bug_fed')).length).toBe(1);
    const [fed] = await events(page, 'bug_fed');
    expect(fed!.payload).toMatchObject({ id: glorp.id, itemId: near, liking: 'neutral', byPlayer: true });
    expect((await entity(page, glorp.id))!.bug!.mode).toBe('st_eat');
    // Chewed, swallowed, and a happy reaction with a bubble.
    await expect.poll(async () => (await events(page, 'bug_ate')).length, { timeout: 30_000 }).toBe(1);
    expect(await entity(page, near)).toBeNull();
    const reacted = await events(page, 'bug_reacted');
    expect(reacted.some((e) => e.payload.reaction === 'fed_neutral')).toBe(true);
    expect(await hook(page, () => window.__bb!.sfxLog())).toEqual(expect.arrayContaining(['nom', 'chomp']));
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('disliked food is spat out and stays in the world', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    // Glorp, alone on the stump, dislikes hot pepper.
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    for (const e of await entities(page)) if (e.kind === 'bug') await content(page, e.id);
    const pepper = await spawnItem(page, 'item_pepper_hot', glorp.x + 1.8);
    await holdNearMouth(page, pepper, glorp.id, 0.05, -0.3);
    // His mouth glows grey.
    await expect
      .poll(() => hook(page, () => window.__bb!.glowing()))
      .toContainEqual({ id: glorp.id, liking: 'disliked' });
    await page.mouse.up();
    await expect.poll(async () => (await events(page, 'bug_spat')).length, { timeout: 30_000 }).toBe(1);
    const [spat] = await events(page, 'bug_spat');
    expect(spat!.payload).toMatchObject({ id: glorp.id, itemId: pepper });
    expect(await events(page, 'bug_ate')).toEqual([]);
    const after = await entity(page, pepper);
    expect(after).not.toBeNull();
    expect(after!.inMouthOf).toBeUndefined();
    expect(await hook(page, () => window.__bb!.sfxLog())).toContain('ptoo');
    await expect
      .poll(async () => (await hook(page, () => window.__bb!.bubbles())).some((b) => b.bugId === glorp.id))
      .toBe(true);
    await expect.poll(async () => (await entity(page, glorp.id))!.bug!.mood).toBe('mood_grumpy');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('three pokes in a row never repeat a reaction variant back to back', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 2);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await content(page, glorp.id);
    for (let i = 0; i < 4; i++) {
      const g = (await entity(page, glorp.id))!;
      const p = await toClient(page, g.x, g.y);
      await page.mouse.click(p.x, p.y);
      await expect
        .poll(
          async () => (await events(page, 'bug_reacted')).filter((e) => e.payload.reaction === 'poke').length,
        )
        .toBe(i + 1);
      // Let the reaction finish before the next poke.
      await expect.poll(async () => (await entity(page, glorp.id))!.bug!.mode).not.toBe('st_react');
    }
    const variants = (await events(page, 'bug_reacted'))
      .filter((e) => e.payload.reaction === 'poke')
      .map((e) => e.payload.variant as number);
    expect(variants).toHaveLength(4);
    for (let i = 1; i < variants.length; i++) expect(variants[i]).not.toBe(variants[i - 1]);
  } finally {
    await bb.close();
  }
});

test('every verb makes a sound', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 1);
    for (const e of await entities(page)) if (e.kind === 'bug') await content(page, e.id);
    const clear = (): Promise<void> => page.evaluate(() => window.__bb!.clearLogs());
    const heard = async (): Promise<string[]> => [
      ...(await hook(page, () => window.__bb!.sfxLog())),
      ...(await hook(page, () => window.__bb!.voiceLog())).map((v) => `voice:${v.emotion}`),
    ];
    const expectSound = async (verb: string, sound: string): Promise<void> => {
      await expect.poll(heard, { message: `${verb} should play ${sound}` }).toContain(sound);
    };

    // Grab, drag, drop: a pebble.
    const cam = (await page.evaluate(() => window.__bb!.camera())).x;
    const pebble = await spawnItem(page, 'item_pebble', cam + 8);
    await clear();
    let at = await pressOn(page, pebble);
    await expectSound('grab', 'grab');
    await clear();
    // Drag it quickly back and forth: a swish, and three strokes make a shake.
    for (const dx of [140, -20, 140, -20, 140, -20]) {
      await page.mouse.move(at.x + dx, at.y - 150, { steps: 2 });
    }
    await expectSound('drag', 'swish');
    await expectSound('shake', 'shake');
    at = { x: at.x + 60, y: at.y - 150 };
    await page.mouse.move(at.x, at.y, { steps: 6 });
    await page.waitForTimeout(400);
    await clear();
    await page.mouse.up();
    await expectSound('drop', 'drop');

    // Fling it.
    await expect.poll(async () => (await entity(page, pebble))!.vy).toBeLessThan(0.05);
    at = await pressOn(page, pebble);
    await clear();
    await Promise.all([
      ...[1, 2, 3, 4].map((i) => page.mouse.move(at.x + i * 60, at.y - i * 40)),
      page.mouse.up(),
    ]);
    await expectSound('fling', 'fling');

    // Poke a bug standing on the ground (a bug in the air ignores pokes).
    await page.waitForTimeout(1500);
    await clear();
    await expect
      .poll(async () => {
        const bug = (await entities(page)).find(
          (e) => e.kind === 'bug' && ['st_idle', 'st_wander', 'st_seek'].includes(e.bug!.mode),
        );
        if (bug) {
          const p = await toClient(page, bug.x, bug.y);
          await page.mouse.click(p.x, p.y);
          await page.waitForTimeout(200);
        }
        return heard();
      })
      .toContain('poke');
    await page.waitForTimeout(800);

    // Hold-poke a bug: it gets tickled.
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const dp = await toClient(page, dot.x, dot.y);
    await page.mouse.move(dp.x, dp.y);
    await clear();
    await page.mouse.down();
    await expectSound('hold-poke', 'tickle');
    await expect.poll(heard).toContain('voice:giggle');
    await page.mouse.up();

    // Pan by dragging the sky, then scroll the wheel.
    // An empty patch of sky, well away from anything flying about.
    const all = await entities(page);
    const camX = (await page.evaluate(() => window.__bb!.camera())).x;
    const skyX = [4, 8, 12, 16, 2, 10, 14]
      .map((d) => camX + d)
      .find((x) => all.every((e) => Math.hypot(e.x - x, e.y - 1.2) > 2.5))!;
    const sky = await toClient(page, skyX, 1.2);
    await page.mouse.move(sky.x, sky.y);
    await clear();
    await page.mouse.down();
    await page.mouse.move(sky.x - 200, sky.y, { steps: 6 });
    await page.mouse.up();
    await expectSound('pan', 'pan');
    await clear();
    await page.mouse.wheel(0, 120);
    await expectSound('scroll', 'scroll');

    // Edge scroll: carry something to the right edge.
    const pebble2 = await spawnItem(
      page,
      'item_pebble',
      (await page.evaluate(() => window.__bb!.camera().x)) + 12,
    );
    await pressOn(page, pebble2);
    await clear();
    const edge = await page.evaluate(() => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: r.right - 10, y: r.top + r.height * 0.5 };
    });
    await page.mouse.move(edge.x, edge.y, { steps: 8 });
    await expectSound('edge scroll', 'edge');
    await page.mouse.up();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('hovering a grabbable object switches the cursor to hover_grab within 1 frame', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    // Over a menu card, the hand points.
    await expect.poll(() => page.evaluate(() => window.__bb!.scene())).toBe('menu');
    const card = (await page.evaluate(() => window.__bb!.slotButtonClient(0)))!;
    await page.mouse.move(card.x, card.y);
    await expect.poll(async () => (await hook(page, () => window.__bb!.cursor())).pose).toBe('hover_poke');
    await clickSlot(page, 0);

    await page.mouse.move(960, 120);
    await expect.poll(async () => (await hook(page, () => window.__bb!.cursor())).pose).toBe('open');
    const spring = (await entities(page)).find((e) => e.defId === 'item_spring_coil')!;
    const p = await toClient(page, spring.x, spring.y);
    expect((await hook(page, () => window.__bb!.cursor())).pose).toBe('open');
    await page.mouse.move(p.x, p.y);
    const after = await hook(page, () => window.__bb!.cursor());
    expect(after.pose).toBe('hover_grab');
    expect(after.visible).toBe(true);
    // The pose changed within one frame of the pointer event that caused it.
    expect(after.poseFrame - after.moveFrame).toBeLessThanOrEqual(1);

    // Holding it makes a fist; letting go opens the hand.
    await page.mouse.down();
    await expect.poll(async () => (await hook(page, () => window.__bb!.cursor())).pose).toBe('grab');
    await page.mouse.up();
    await page.mouse.move(960, 120);
    await expect.poll(async () => (await hook(page, () => window.__bb!.cursor())).pose).toBe('open');
    // Dragging the sky shows the flat panning palm.
    await page.mouse.down();
    await page.mouse.move(700, 120, { steps: 4 });
    expect((await hook(page, () => window.__bb!.cursor())).pose).toBe('pan');
    await page.mouse.up();
  } finally {
    await bb.close();
  }
});

test('holding a bug still tickles it until it wriggles free', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    await content(page, dot.id);
    const p = await toClient(page, dot.x, dot.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await expect
      .poll(async () => (await events(page, 'bug_wriggled_free')).length, { timeout: 60_000 })
      .toBe(1);
    const levels = (await events(page, 'bug_tickled')).map((e) => e.payload.level);
    expect(levels).toEqual([1, 2, 3]);
    expect((await entity(page, dot.id))!.held).toBe(false);
    await page.mouse.up();
  } finally {
    await bb.close();
  }
});

test('Glorp never gets dizzy: a hard landing sends him into his shell', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await content(page, glorp.id);
    const p = await toClient(page, glorp.x, glorp.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await expect.poll(async () => (await entity(page, glorp.id))!.held).toBe(true);
    await page.mouse.move(p.x, p.y - 300, { steps: 20 });
    await page.waitForTimeout(250);
    await Promise.all([
      ...[1, 2, 3, 4].map((i) => page.mouse.move(p.x, p.y - 300 + i * 55)),
      page.mouse.up(),
    ]);
    await expect
      .poll(async () => (await events(page, 'bug_reacted')).some((e) => e.payload.reaction === 'land_hard'), {
        timeout: 30_000,
      })
      .toBe(true);
    expect(await events(page, 'bug_dizzy')).toEqual([]);
    expect(await hook(page, () => window.__bb!.voiceLog())).toContainEqual({
      defId: 'bug_snail_glorp',
      emotion: 'ooh',
    });
  } finally {
    await bb.close();
  }
});
