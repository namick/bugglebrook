import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DebugBugPatch } from '../../src/renderer/src/debug/testHook';
import {
  PLAZA_X,
  content,
  entities,
  entity,
  frames,
  framesUntil,
  freeze,
  glideFrames,
  holdNearMouth,
  launchApp,
  pressFrozen,
  scrollTo,
  toClient,
} from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// Close-ups of the M7 bugs for judging their art by eye: `pnpm shots -g "M7 bugs"`.
// Writes /tmp/bb-shots/bugs-*.png (or $BB_SHOTS_DIR).

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

/** The stage: a stretch of flat plaza cleared of toys, and where the camera looks. */
const STAGE = PLAZA_X + 29.5;
const CAMERA = PLAZA_X + 22;

/** A close-up around a world point, `w` by `h` meters. */
async function closeUp(page: Page, name: string, x: number, y: number, w = 4, h = 2.6): Promise<void> {
  const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  await page.screenshot({ path: join(DIR, `bugs-${name}.png`), clip });
}

/** Park the hand in a corner, out of the shot and far enough that Twig does not freeze. */
const handAway = (page: Page): Promise<void> => page.mouse.move(960, 60);

const debugBug = (page: Page, id: number, patch: DebugBugPatch): Promise<void> =>
  page.evaluate(([i, p]) => window.__bb!.debugBug(i as number, p as DebugBugPatch), [id, patch] as const);

async function spawn(page: Page, kind: 'bug' | 'item', defId: string, x: number, y = 7): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([k, d, px, py]) =>
      window.__bb!.send({
        type: 'spawn',
        kind: k as 'bug',
        defId: d as string,
        x: px as number,
        y: py as number,
      }),
    [kind, defId, x, y] as const,
  );
  await frames(page, 2);
  const found = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId);
  return found!.id;
}

/** Pick a thing up with sim commands and set it down at `x` (clearing the stage). */
async function moveThing(page: Page, id: number, x: number): Promise<void> {
  const e = (await entity(page, id))!;
  await page.evaluate(([px, py]) => window.__bb!.send({ type: 'grab', x: px!, y: py! }), [e.x, e.y]);
  // Up over anything in the way (the stump), across, then down near the ground.
  const steps = Math.max(20, Math.ceil(Math.abs(x - e.x) * 4));
  for (let i = 1; i <= 10; i++) {
    await page.evaluate(
      ([px, py]) => window.__bb!.send({ type: 'drag', x: px!, y: py! }),
      [e.x, e.y - (e.y - 5) * (i / 10)],
    );
    await frames(page, 1);
  }
  for (let i = 1; i <= steps; i++) {
    const tx = e.x + ((x - e.x) * i) / steps;
    await page.evaluate(([px]) => window.__bb!.send({ type: 'drag', x: px!, y: 5 }), [tx]);
    await frames(page, 1);
  }
  for (let i = 1; i <= 15; i++) {
    await page.evaluate(
      ([px, py]) => window.__bb!.send({ type: 'drag', x: px!, y: py! }),
      [x, 5 + 2.7 * (i / 15)],
    );
    await frames(page, 1);
  }
  await frames(page, 15);
  await page.evaluate(() => window.__bb!.send({ type: 'release', vx: 0, vy: 0 }));
  await frames(page, 45);
}

async function where(page: Page, id: number): Promise<{ x: number; y: number; mode: string }> {
  const e = (await entity(page, id))!;
  return { x: e.x, y: e.y, mode: e.bug?.mode ?? '' };
}

const fill = (page: Page, id: number, need: string, value: number): Promise<void> =>
  page.evaluate(
    ([i, n, v]) =>
      window.__bb!.send({ type: 'set_need', id: i as number, need: n as 'need_fun', value: v as number }),
    [id, need, value] as const,
  );

/** A bug's standard set: idle, walking, hover, poke, held, flung, dizzy, asleep, eating, offered, painted. */
async function tour(page: Page, name: string, id: number, food: string, h = 2.6, w = 4): Promise<void> {
  const shoot = async (tag: string, dy = -0.35): Promise<void> => {
    const p = await where(page, id);
    await closeUp(page, `${name}-${tag}`, p.x, p.y + dy, w, h);
  };
  await content(page, id);
  await frames(page, 40);
  await handAway(page);
  await page.waitForTimeout(250);
  await shoot('idle');
  // Walking: beckoned a little way along.
  const start = await where(page, id);
  await page.evaluate(([i, x]) => window.__bb!.send({ type: 'beckon', id: i!, x: x! }), [id, start.x + 2.5]);
  await frames(page, 24);
  await page.waitForTimeout(200);
  await shoot('walking');
  await framesUntil(page, async () => (await where(page, id)).mode !== 'st_wander', 400);
  // Hovered: the rim light, and eyes on the hand.
  const p = await where(page, id);
  const near = await toClient(page, p.x + 0.9, p.y - 0.9);
  await page.mouse.move(near.x, near.y);
  await frames(page, 2);
  const on = await toClient(page, p.x, p.y);
  await page.mouse.move(on.x, on.y);
  await frames(page, 2);
  await page.waitForTimeout(300);
  await shoot('hover');
  // Poked.
  await page.mouse.click(on.x, on.y);
  await frames(page, 6);
  await page.mouse.move(near.x, near.y - 200);
  await frames(page, 2);
  await page.waitForTimeout(250);
  await shoot('poke');
  await frames(page, 90);
  // Held up in the hand.
  let at = await pressFrozen(page, id);
  at = await glideFrames(page, at, 0, -200, 10, 2);
  await frames(page, 20);
  await page.waitForTimeout(250);
  await shoot('held', 0);
  // Flung up and across: in the air.
  await glideFrames(page, at, 260, -60, 4, 1);
  await page.mouse.up();
  await frames(page, 5);
  await page.waitForTimeout(150);
  await shoot('flung', 0);
  await framesUntil(page, async () => (await where(page, id)).mode !== 'st_airborne', 300, 5);
  await handAway(page);
  await frames(page, 90);
  // Slammed into the ground: dizzy.
  at = await pressFrozen(page, id);
  at = await glideFrames(page, at, 0, -330, 10, 2);
  await frames(page, 10);
  await glideFrames(page, at, 30, 330, 3, 1);
  await page.mouse.up();
  await frames(page, 2);
  await framesUntil(page, async () => (await where(page, id)).mode !== 'st_airborne', 300, 3);
  await frames(page, 12);
  await handAway(page);
  await page.waitForTimeout(250);
  await shoot(`dizzy-${(await where(page, id)).mode}`);
  await framesUntil(page, async () => (await where(page, id)).mode !== 'st_dizzy', 900);
  await frames(page, 60);
  // Asleep.
  await fill(page, id, 'need_energy', 0);
  const slept = await framesUntil(page, async () => (await where(page, id)).mode === 'st_sleep', 1800);
  await page.waitForTimeout(250);
  await shoot(slept ? 'asleep' : 'asleep-not');
  await content(page, id);
  await page.evaluate((i) => window.__bb!.send({ type: 'wake', id: i }), id);
  await frames(page, 120);
  // Hungry, with food held near: mouth open wide.
  await fill(page, id, 'need_hunger', 5);
  const b = await where(page, id);
  const snack = await spawn(page, 'item', food, b.x + 1.6, 6);
  await frames(page, 60);
  try {
    await holdNearMouth(page, snack, id, 0.3, -0.1);
    await freeze(page, true);
    await page.waitForTimeout(300);
    await shoot('offered');
  } catch {
    // The snack rolled under someone; skip this one.
    await freeze(page, true);
  }
  await page.mouse.up();
  await handAway(page);
  const ate = await framesUntil(page, async () => (await where(page, id)).mode === 'st_eat', 900, 5);
  await frames(page, 20);
  await page.waitForTimeout(200);
  await shoot(ate ? 'eating' : 'eating-not');
  await framesUntil(page, async () => (await where(page, id)).mode !== 'st_eat', 600);
  await frames(page, 100);
  await content(page, id);
  // Painted: one color, then all five.
  await debugBug(page, id, { paint: ['paint_blue'] });
  await frames(page, 2);
  await page.waitForTimeout(200);
  await shoot('paint-1');
  await debugBug(page, id, {
    paint: ['paint_red', 'paint_blue', 'paint_yellow', 'paint_white', 'paint_black'],
  });
  await frames(page, 2);
  await page.waitForTimeout(200);
  await shoot('paint-5');
  await debugBug(page, id, { paint: null });
  // A couple of reactions.
  for (const [type, variant] of [
    ['grab', 0],
    ['fed_loved', 0],
    ['fed_disliked', 0],
    ['tickle', 1],
  ] as const) {
    await debugBug(page, id, { reaction: { type, variant } });
    await frames(page, 2);
    await page.waitForTimeout(350);
    await shoot(`react-${type}`);
    await frames(page, 150);
  }
}

/** Each bug's own looks, staged right after its tour. */
async function extras(page: Page, name: string, id: number): Promise<void> {
  let p: { x: number; y: number; mode: string };
  let at: { x: number; y: number };
  if (name === 'moose') {
    // Moose: stuck on his back, then lifting a pebble overhead.
    await content(page, id);
    await frames(page, 60);
    await debugBug(page, id, { pending: 'stuck' });
    await frames(page, 4);
    await handAway(page);
    await page.waitForTimeout(400);
    p = await where(page, id);
    await closeUp(page, 'moose-stuck', p.x, p.y - 0.4, 5, 3);
    await debugBug(page, id, { pending: null });
    await frames(page, 30);
    p = await where(page, id);
    const pebble = await spawn(page, 'item', 'item_pebble', p.x + 1.4, 7);
    await frames(page, 60);
    await debugBug(page, id, { carrying: pebble, overhead: true });
    await frames(page, 12);
    await page.waitForTimeout(300);
    p = await where(page, id);
    await closeUp(page, 'moose-overhead', p.x, p.y - 0.8, 5, 3.4);
    await frames(page, 40);
    await page.waitForTimeout(200);
    p = await where(page, id);
    await closeUp(page, 'moose-overhead-walk', p.x, p.y - 0.8, 5, 3.4);
    await debugBug(page, id, { carrying: null, overhead: false });
    await frames(page, 30);
  }
  if (name === 'barty') {
    // Barty: aloof, then rolling a dung ball.
    await content(page, id);
    await debugBug(page, id, { pending: 'aloof' });
    await frames(page, 30);
    await page.waitForTimeout(300);
    p = await where(page, id);
    await closeUp(page, 'barty-aloof', p.x, p.y - 0.35, 3.8, 2.4);
    await debugBug(page, id, { pending: null });
    p = await where(page, id);
    const dung = await spawn(page, 'item', 'item_rubber_ball', p.x - 1.1, 7);
    await frames(page, 60);
    await debugBug(page, id, { carrying: dung, rolling: true });
    await framesUntil(
      page,
      async () => {
        const v = await entity(page, id);
        return v?.bug?.mode === 'st_wander' && v.bug.rolling === true;
      },
      300,
      1,
    );
    await frames(page, 2);
    await page.waitForTimeout(250);
    p = await where(page, id);
    await closeUp(page, 'barty-rolling', p.x, p.y - 0.35, 4.2, 2.4);
    await frames(page, 30);
    await page.waitForTimeout(250);
    p = await where(page, id);
    await closeUp(page, 'barty-rolling-2', p.x, p.y - 0.35, 4.2, 2.4);
    await debugBug(page, id, { carrying: null, rolling: false });
    await frames(page, 20);
  }
  if (name === 'munch') {
    // Munch: a cocoon, then a butterfly on the ground and in the air.
    await content(page, id);
    await debugBug(page, id, { form: 'cocoon' });
    await fill(page, id, 'need_energy', 0);
    await framesUntil(page, async () => (await where(page, id)).mode === 'st_sleep', 1200);
    await page.waitForTimeout(400);
    p = await where(page, id);
    await closeUp(page, 'munch-cocoon', p.x, p.y - 0.5, 3, 2.6);
    await debugBug(page, id, { form: 'butterfly' });
    await content(page, id);
    await page.evaluate((i) => window.__bb!.send({ type: 'wake', id: i }), id);
    await frames(page, 90);
    await page.waitForTimeout(300);
    p = await where(page, id);
    await closeUp(page, 'munch-butterfly', p.x, p.y - 0.6, 3.4, 2.6);
    await debugBug(page, id, { paint: ['paint_red', 'paint_white'] });
    at = await pressFrozen(page, id);
    at = await glideFrames(page, at, 0, -260, 10, 2);
    await frames(page, 10);
    await glideFrames(page, at, 200, -80, 4, 1);
    await page.mouse.up();
    await frames(page, 14);
    await handAway(page);
    await page.waitForTimeout(150);
    p = await where(page, id);
    await closeUp(page, 'munch-butterfly-flying', p.x, p.y - 0.4, 3.4, 2.8);
    await framesUntil(page, async () => (await where(page, id)).mode !== 'st_airborne', 600, 5);
    await debugBug(page, id, { form: null, paint: null });
  }
  if (name === 'prim') {
    // Prim: a karate pose and a chop.
    await content(page, id);
    await frames(page, 60);
    // Reactions run on sim time, so step into them.
    await debugBug(page, id, { reaction: { type: 'poke', variant: 1 } });
    await frames(page, 25);
    await page.waitForTimeout(300);
    p = await where(page, id);
    await closeUp(page, 'prim-pose', p.x + 0.3, p.y - 0.7, 4, 3.2);
    await frames(page, 150);
    await debugBug(page, id, { reaction: { type: 'chop', variant: 0 } });
    await frames(page, 12);
    await page.waitForTimeout(200);
    await closeUp(page, 'prim-chop-up', p.x + 0.3, p.y - 0.7, 4, 3.2);
    await frames(page, 14);
    await page.waitForTimeout(200);
    await closeUp(page, 'prim-chop-down', p.x + 0.3, p.y - 0.7, 4, 3.2);
    await frames(page, 150);
  }
}

/** Toss a bug off the stage so it is out of the next bug's shots. */
async function offStage(page: Page, id: number): Promise<void> {
  await moveThing(page, id, PLAZA_X + 4 + Math.random() * 6);
}

test('M7 bugs close-ups', async () => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await page.waitForFunction(
      () => window.__bb!.menuSettled() && window.__bb!.slotButtonClient(0) !== null,
      undefined,
      { timeout: 30_000 },
    );
    // Open slot 0 (the world can take a while to build on a busy machine).
    const sign = (await page.evaluate(() => window.__bb!.slotButtonClient(0)))!;
    await page.mouse.click(sign.x, sign.y);
    await page.waitForFunction(() => window.__bb!.scene() === 'world', undefined, { timeout: 60_000 });
    await page.waitForTimeout(800);
    await scrollTo(page, CAMERA);
    await freeze(page, true);
    // Clear the toys off the far flat stretch, except Twig (who is not a toy).
    const twig = (await entities(page)).find((e) => e.defId === 'bug_stickinsect_twig')!;
    for (const e of await entities(page))
      if (
        e.kind === 'item' &&
        e.x > PLAZA_X + 26.5 &&
        e.x < PLAZA_X + 38.3 &&
        e.y > 6 &&
        Math.abs(e.x - twig.x) > 1.5
      )
        await moveThing(page, e.id, PLAZA_X + 3 + Math.random() * 7);
    await frames(page, 30);
    await handAway(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(DIR, 'bugs-00-stage.png') });

    // Twig disguised, next to a real twig: they should look the same.
    const item = await spawn(page, 'item', 'item_twig', twig.x - 2.2, 8.5);
    await frames(page, 60);
    await page.waitForTimeout(300);
    const t0 = await where(page, twig.id);
    await closeUp(page, 'twig-disguised-vs-item', t0.x - 1.1, t0.y - 0.2, 4, 1.2);
    await debugBug(page, twig.id, { peekTicks: 600 });
    await frames(page, 2);
    await page.waitForTimeout(300);
    await closeUp(page, 'twig-peeking', t0.x - 1.1, t0.y - 0.2, 4, 1.2);
    await frames(page, 600);
    // Twig joins and gets the full tour.
    await debugBug(page, twig.id, { pending: null });
    await moveThing(page, twig.id, STAGE);
    await moveThing(page, item, PLAZA_X + 8);
    await tour(page, 'twig', twig.id, 'item_leaf', 2, 3.4);
    await offStage(page, twig.id);

    // Everyone else, one at a time on the stage.
    const cast: [string, string, string, number, number][] = [
      ['whiff', 'bug_stinkbug_whiff', 'item_mint_leaf', 2.4, 3.6],
      ['moose', 'bug_stagbeetle_moose', 'item_apple_core', 3.4, 5],
      ['barty', 'bug_dungbeetle_barty', 'item_rotten_banana_bit', 2.6, 3.8],
      ['munch', 'bug_caterpillar_munch', 'item_leaf', 2.4, 3.8],
      ['prim', 'bug_mantis_prim', 'item_honey_drop', 3.2, 4],
    ];
    const ids = new Map<string, number>();
    for (const [name, defId, food, h, w] of cast) {
      const id = await spawn(page, 'bug', defId, STAGE);
      ids.set(name, id);
      await frames(page, 90);
      await tour(page, name, id, food, h, w);
      await extras(page, name, id);
      await offStage(page, id);
    }

    // The lineup, next to Dot, by day and by night.
    const line: [string, number][] = [
      ['bug_ladybug_dot', -2.6],
      ['bug_stinkbug_whiff', -1.3],
      ['bug_stagbeetle_moose', 0.7],
      ['bug_dungbeetle_barty', 2.9],
      ['bug_caterpillar_munch', 4.5],
      ['bug_mantis_prim', 6.2],
      ['bug_stickinsect_twig', 7.9],
    ];
    const mine = new Map<string, number>([...ids].map(([n, i]) => [cast.find((c) => c[0] === n)![1], i]));
    mine.set('bug_stickinsect_twig', twig.id);
    for (const [defId, dx] of line) {
      const id = mine.get(defId) ?? (await spawn(page, 'bug', defId, STAGE + dx));
      await moveThing(page, id, STAGE + dx);
      await content(page, id);
    }
    await frames(page, 10);
    await handAway(page);
    await page.waitForTimeout(400);
    await closeUp(page, 'lineup-day', STAGE + 2.7, 8.0, 12.6, 3.4);
    await page.evaluate(() => window.__bb!.send({ type: 'set_time', hour: 22 }));
    await frames(page, 30);
    await page.waitForTimeout(1500);
    await closeUp(page, 'lineup-night', STAGE + 2.7, 8.0, 12.6, 3.4);
  } finally {
    if (bb.errors.length > 0) console.log(bb.errors.join('\n'));
    await bb.close();
  }
});
