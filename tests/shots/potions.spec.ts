import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { freeze, frames, launchApp, lookAt, openFrozen } from '../e2e/app';
import { sharpShots } from './clip';

// The M8 tour (`pnpm shots -g "crafting"`): the Tinker Bench at rest, a near
// miss, mid-shake, the ta-da, a junk blob, blueprints on the cork board; the
// cauldron tinting, bubbling, and popping a bottle; the bug scope; every
// potion on a bug; and the crafted toys at play. Files 200- to 259-.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const PORCH_X = 102.4;
const COMPOST_X = 134.4;
const PLAZA_X = 64;

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

/** Spawn a thing at (x, y) and return its ID once the sim has it. */
async function spawn(page: Page, kind: 'item' | 'bug', defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await page.evaluate(() => window.__bb!.entities())).map((e) => e.id));
  await send(page, { type: 'spawn', kind, defId, x, y });
  await frames(page, 1);
  const found = (await page.evaluate(() => window.__bb!.entities())).find(
    (e) => !before.has(e.id) && e.defId === defId,
  );
  return found!.id;
}

/** Spawn a thing and set it gently down where the hand would (a drop target takes it). */
async function dropAt(page: Page, defId: string, x: number, y: number): Promise<number> {
  const id = await spawn(page, 'item', defId, x, y);
  await send(page, { type: 'grab', x, y });
  await frames(page, 1);
  await send(page, { type: 'release', vx: 0, vy: 0 });
  await frames(page, 2);
  return id;
}

/** Everyone full and happy, so nobody wanders off mid-shot. */
async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const e of window.__bb!.entities())
      if (e.kind === 'bug')
        for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
          window.__bb!.send({ type: 'set_need', id: e.id, need, value: 100 });
  });
}

test('crafting and potions tour', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(400);
    await openFrozen(page, 0);
    await page.mouse.move(960, 40);
    for (const area of [
      'area_flowerbed_stage',
      'area_under_porch',
      'area_compost_lab',
      'area_treehouse_arcade',
    ])
      await send(page, { type: 'unlock', area });
    await send(page, { type: 'set_time', hour: 12 });
    await frames(page, 2);
    await calm(page);

    // --- The Tinker Bench -------------------------------------------------
    const pts = (await page.evaluate(() => window.__bb!.m8Points()))!;
    await lookAt(page, PORCH_X + 10.6);
    await frames(page, 30);
    await shot(page, '200-bench');
    // Two thirds of the matchbox racer: the crank wiggles, a button's ghost flickers.
    await dropAt(page, 'item_matchbox', pts.trays[0]!.x, pts.trays[0]!.y - 0.5);
    await dropAt(page, 'item_button', pts.trays[1]!.x, pts.trays[1]!.y - 0.5);
    await frames(page, 6);
    await shot(page, '201-bench-near-miss');
    await dropAt(page, 'item_button', pts.trays[2]!.x, pts.trays[2]!.y - 0.5);
    await send(page, { type: 'pull_lever' });
    await frames(page, 30);
    await shot(page, '202-bench-shaking');
    await frames(page, 46);
    await shot(page, '203-bench-ta-da');
    await frames(page, 60);
    await shot(page, '204-bench-racer');
    // A failed combo: a junk blob with googly eyes.
    await dropAt(page, 'item_cork', pts.trays[0]!.x, pts.trays[0]!.y - 0.5);
    await dropAt(page, 'item_pebble', pts.trays[1]!.x, pts.trays[1]!.y - 0.5);
    await send(page, { type: 'pull_lever' });
    await frames(page, 76);
    await shot(page, '205-bench-blob');
    await frames(page, 60);
    await shot(page, '206-bench-blob-rest');
    // Blueprints on the cork board.
    for (const bp of ['slingshot', 'magnet_crane', 'balloon_basket', 'disco_ball']) {
      const id = await spawn(page, 'item', `item_blueprint_${bp}`, pts.trays[1]!.x + 3, 6);
      const e = (await page.evaluate((i) => window.__bb!.entity(i), id))!;
      await send(page, { type: 'grab', x: e.x, y: e.y });
      await frames(page, 1);
      await send(page, { type: 'release', vx: 0, vy: 0 });
    }
    await frames(page, 40);
    await shot(page, '207-bench-blueprints');

    // --- The cauldron -------------------------------------------------------
    await lookAt(page, COMPOST_X - 2);
    await frames(page, 30);
    await shot(page, '210-cauldron');
    const pot = pts.cauldron;
    await dropAt(page, 'item_mushroom_cap', pot.x - 0.4, pot.y - 0.6);
    await frames(page, 20);
    await shot(page, '211-cauldron-one');
    await dropAt(page, 'item_feather', pot.x + 0.3, pot.y - 0.6);
    await frames(page, 40);
    await shot(page, '212-cauldron-two');
    for (let i = 0; i < 8; i++) {
      await send(page, { type: 'stir', radians: Math.PI / 4 });
      await frames(page, 4);
    }
    await shot(page, '213-cauldron-stirring');
    for (let i = 0; i < 8; i++) {
      await send(page, { type: 'stir', radians: Math.PI / 4 });
      await frames(page, 4);
    }
    await frames(page, 20);
    await shot(page, '214-cauldron-bubbling');
    await frames(page, 44);
    await shot(page, '215-cauldron-pop');
    await frames(page, 50);
    await shot(page, '216-cauldron-bottle');
    // A three-essence brew: the foam fountain.
    for (const [d, dx] of [
      ['item_glass_bead', -0.4],
      ['item_feather', 0],
      ['item_foil_ball', 0.4],
    ] as const)
      await dropAt(page, d, pot.x + dx, pot.y - 0.6);
    for (let i = 0; i < 16; i++) await send(page, { type: 'stir', radians: Math.PI / 4 });
    await frames(page, 90);
    await shot(page, '217-cauldron-foam');
    // The bug scope.
    await dropAt(page, 'item_magnet', pts.scope.x + 1.1, 8.4);
    await frames(page, 40);
    await lookAt(page, COMPOST_X + 10);
    await send(page, { type: 'poke', x: pts.scope.x, y: pts.scope.y });
    await frames(page, 20);
    await shot(page, '218-scope');
    await send(page, { type: 'set_time', hour: 23 });
    await dropAt(page, 'item_moss_tuft', pts.scope.x + 1.1, 8.4);
    await frames(page, 60);
    await send(page, { type: 'poke', x: pts.scope.x, y: pts.scope.y });
    await frames(page, 20);
    await shot(page, '219-scope-wubbo');
    await send(page, { type: 'set_time', hour: 12 });

    // --- Every potion on a bug ------------------------------------------------
    const ALL = [
      'potion_giant',
      'potion_tiny',
      'potion_floaty',
      'potion_balloon',
      'potion_glow',
      'potion_rainbow',
      'potion_sticky_feet',
      'potion_burp',
      'potion_bubble',
      'potion_bubble_burp',
      'potion_fire_breath',
      'potion_frosty',
      'potion_heavy',
      'potion_bouncy',
      'potion_speedy',
      'potion_slowmo',
      'potion_stinky',
      'potion_sleepy',
      'potion_opera',
      'potion_squeaky',
      'potion_upside_down',
      'potion_copycat',
      'potion_hairy',
      'potion_magnet',
      'potion_ghost',
      'potion_rocket',
      'potion_snowball',
      'potion_wings',
      'potion_jelly',
      'potion_wobble',
      'potion_sludge',
      'potion_paint',
    ];
    const BUGS = [
      'bug_ladybug_dot',
      'bug_pillbug_rollo',
      'bug_snail_glorp',
      'bug_grasshopper_boing',
      'bug_stinkbug_whiff',
    ];
    // The plaza's own bugs step out of the way, so the gallery shows only the ones with potions.
    for (const e of await page.evaluate(() => window.__bb!.entities()))
      if (e.kind === 'bug' && e.x > PLAZA_X && e.x < PLAZA_X + 38 && !e.bug?.pending)
        await send(page, { type: 'despawn', id: e.id });
    let n = 220;
    for (let i = 0; i < ALL.length; i += 5) {
      await lookAt(page, PLAZA_X + 19.2);
      const group = ALL.slice(i, i + 5);
      const ids: number[] = [];
      for (const [k, p] of group.entries()) {
        const id = await spawn(page, 'bug', BUGS[k]!, PLAZA_X + 26.6 + k * 2.6, 8);
        ids.push(id);
        await frames(page, 20);
        await send(page, { type: 'give_potion', id, potion: p });
      }
      await calm(page);
      await frames(page, 70);
      await shot(page, `${n}-potions-${group.map((p) => p.replace('potion_', '')).join('-')}`);
      await frames(page, 50);
      await shot(page, `${n + 1}-potions-later`);
      for (const id of ids) await send(page, { type: 'despawn', id });
      await frames(page, 1);
      n += 2;
    }

    // --- The crafted toys at play ----------------------------------------------
    await lookAt(page, PLAZA_X + 19.2);
    // Each batch on clear ground, then carried off to the pond before the next.
    const clear = async (ids: number[]): Promise<void> => {
      for (const id of ids) await send(page, { type: 'despawn', id });
      await frames(page, 1);
    };
    const batches: readonly (readonly string[])[] = [
      ['item_trampoline', 'item_slingshot_twig', 'item_spring_launcher', 'item_popsicle_seesaw'],
      ['item_spoon_catapult', 'item_matchbox_racer', 'item_straw_rocket', 'item_pinwheel'],
      ['item_balloon_basket', 'item_balloon_red', 'item_parachute', 'item_magnet_crane'],
    ];
    let t = 240;
    for (const batch of batches) {
      const ids: number[] = [];
      for (const [k, toy] of batch.entries())
        ids.push(await spawn(page, 'item', toy, PLAZA_X + 26.5 + k * 3.2, 5.5));
      await frames(page, 90);
      await shot(page, `${t}-toys`);
      await frames(page, 180);
      await shot(page, `${t + 1}-toys-later`);
      await clear(ids);
      t += 2;
    }
    await freeze(page, false);
  } finally {
    await bb.close();
  }
});
