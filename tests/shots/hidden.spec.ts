import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEPTHS_X, HOLLOW_X, PLAZA_X, clickSlot, launchApp } from '../e2e/app';
import type { TestHook } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// M10's hidden areas, for reviewing their art by eye: `pnpm shots -g "hidden"`.
// Writes hidden-*.png: the plaza's ant hill before and after, the iris
// wipe, the Ant Hill Depths by day, at night, and in rain, each fixture up
// close, the gnome and his nose, Gnome Hollow, the telescope's sky, and the
// finale's fireworks.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
type Command = Parameters<TestHook['send']>[0];

async function shot(page: Page, name: string, box?: [number, number, number, number]): Promise<void> {
  const clip = box ? await worldClip(page, ...box) : undefined;
  await page.screenshot({ path: join(DIR, `hidden-${name}.png`), ...(clip ? { clip } : {}) });
}

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const frames = (page: Page, n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);

/** Put the camera's left edge at world x, and let a screen frame catch up. */
async function look(page: Page, x: number): Promise<void> {
  await page.evaluate((v) => {
    window.__bb!.cameraTo(v);
    window.__bb!.frames(2);
  }, x);
  await page.waitForTimeout(250);
}

/** Move the hand out of the way. */
const away = (page: Page): Promise<void> => page.mouse.move(1900, 560);

async function client(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([a, b]) => window.__bb!.worldToClient(a!, b!), [x, y] as const);
}

async function door(page: Page, id: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate(() => window.__bb!.hidden()))!.doors.find((d) => d.id === id)!;
}

/** Click a doorway and run the wipe through. */
async function through(page: Page, id: string): Promise<void> {
  const d = await door(page, id);
  const at = await client(page, d.x, d.y);
  await page.mouse.move(at.x, at.y);
  await frames(page, 2);
  await page.mouse.down();
  await page.mouse.up();
  await frames(page, 45);
  await page.waitForTimeout(250);
}

test('hidden areas tour', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { page } = bb;
  sharpShots(page);
  try {
    await bb.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
    );
    await page.waitForTimeout(500);
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__bb!.setPaused(true));
    // --- The plaza's ant hill ---------------------------------------------
    const hill = await door(page, 'fix_ant_hill');
    await look(page, hill.x - 4);
    await away(page);
    await shot(page, '00-anthill-closed');
    const hillBox: [number, number, number, number] = [hill.x - 3, hill.y - 3.2, hill.x + 4, 9.6];
    const over = await client(page, hill.x + 0.2, hill.y + 0.3);
    await page.mouse.move(over.x, over.y);
    await frames(page, 20);
    await page.waitForTimeout(300);
    await shot(page, '01-anthill-thought', hillBox);
    await away(page);
    // The player's sugar cube, by the hill: the ants carry it in.
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_sugar_cube', x: hill.x + 1.6, y: 8 });
    await frames(page, 40);
    const cube = (await page.evaluate(() => window.__bb!.entities()))
      .filter((e) => e.defId === 'item_sugar_cube')
      .sort((a, b) => Math.abs(a.x - hill.x) - Math.abs(b.x - hill.x))[0]!;
    await send(page, { type: 'set_tag', id: cube.id, tag: 'tag_player_setup', on: true });
    await frames(page, 30);
    await frames(page, 70);
    await shot(page, '02-ants-carry-sugar', hillBox);
    await frames(page, 130);
    await frames(page, 30);
    await shot(page, '03-anthill-crumbling', hillBox);
    await frames(page, 90);
    await shot(page, '04-anthill-open', hillBox);
    await shot(page, '05-plaza-anthill-open');
    // --- The iris wipe ------------------------------------------------------
    const at = await client(page, hill.x, hill.y);
    await page.mouse.move(at.x, at.y);
    await frames(page, 2);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 10);
    await shot(page, '06-iris-closing');
    await frames(page, 12);
    await page.waitForTimeout(200);
    await shot(page, '07-iris-opening');
    await frames(page, 30);
    await away(page);
    await page.waitForTimeout(250);
    // --- The depths by day ----------------------------------------------------
    await look(page, DEPTHS_X + 0.6);
    await shot(page, '10-depths-west-day');
    await look(page, DEPTHS_X + 6.4);
    await shot(page, '11-depths-east-day');
    await shot(page, '12-queen', [DEPTHS_X + 16.4, 4.2, DEPTHS_X + 21.6, 9.6]);
    await shot(page, '13-root-knot', [DEPTHS_X + 21.6, 6.2, DEPTHS_X + 25.6, 9.6]);
    await shot(page, '14-nursery', [DEPTHS_X + 10.2, 0.8, DEPTHS_X + 16, 4.4]);
    await look(page, DEPTHS_X + 0.6);
    await shot(page, '15-pantry-day', [DEPTHS_X + 5, 4, DEPTHS_X + 10, 9.6]);
    await shot(page, '16-shaft', [DEPTHS_X + 1.5, 0, DEPTHS_X + 6.5, 4.2]);
    // The ant line with something riding it.
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_pebble', x: DEPTHS_X + 15, y: 5.8 });
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_ant_crumb', x: DEPTHS_X + 13, y: 5.8 });
    await frames(page, 40);
    await shot(page, '17-ant-line', [DEPTHS_X + 9, 4.2, DEPTHS_X + 16.8, 7.4]);
    // Hover the queen: she thinks of sweets. Then feed her.
    const queen = (await page.evaluate(() => window.__bb!.fixture('fix_ant_queen')))!;
    await look(page, DEPTHS_X + 6.4);
    const qa = await client(page, queen.x, queen.y);
    await page.mouse.move(qa.x, qa.y);
    await frames(page, 4);
    await shot(page, '18-queen-hover', [DEPTHS_X + 16.4, 4.2, DEPTHS_X + 21.6, 9.6]);
    await away(page);
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_honey_drop', x: queen.x, y: 7.5 });
    await frames(page, 50);
    await shot(page, '19-queen-dance', [DEPTHS_X + 15.6, 4.2, DEPTHS_X + 22.4, 9.6]);
    await frames(page, 40);
    await shot(page, '20-queen-gift', [DEPTHS_X + 15.6, 4.2, DEPTHS_X + 22.4, 9.6]);
    // Moose at the root.
    await send(page, {
      type: 'spawn',
      kind: 'bug',
      defId: 'bug_stagbeetle_moose',
      x: DEPTHS_X + 22.6,
      y: 8.2,
    });
    await frames(page, 40);
    await shot(page, '21-root-pulled', [DEPTHS_X + 20.6, 5.6, DEPTHS_X + 25.6, 9.6]);
    await frames(page, 90);
    await shot(page, '22-depths-east-after');
    // Larvae wiggle when poked.
    const larva = (await page.evaluate(() => window.__bb!.fixture('fix_larva_middle')))!;
    const la = await client(page, larva.x, larva.y);
    await page.mouse.move(la.x, la.y);
    await frames(page, 2);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 8);
    await away(page);
    await shot(page, '23-larva-wiggle', [DEPTHS_X + 10.2, 0.8, DEPTHS_X + 16, 4.4]);
    // --- Night: the ants asleep in rows, and the map scrap on the pantry pile ---
    await send(page, { type: 'set_time', hour: 23 });
    await look(page, DEPTHS_X + 0.6);
    await frames(page, 90);
    await shot(page, '30-depths-west-night');
    await shot(page, '31-pantry-night', [DEPTHS_X + 5, 4, DEPTHS_X + 10, 9.6]);
    await look(page, DEPTHS_X + 6.4);
    await frames(page, 30);
    await shot(page, '32-depths-east-night');
    // --- Rain: a trickle down the shaft, and leaf umbrellas ------------------
    await send(page, { type: 'set_time', hour: 11 });
    await send(page, { type: 'set_weather', wind: 0, rain: true });
    await look(page, DEPTHS_X + 0.6);
    await frames(page, 120);
    await page.waitForTimeout(600);
    await shot(page, '33-depths-rain');
    await shot(page, '34-shaft-rain', [DEPTHS_X + 0.6, 0, DEPTHS_X + 7, 4.4]);
    await send(page, { type: 'set_weather', wind: 0, rain: false });
    // --- The conga: music through the bluebells ------------------------------
    await send(page, { type: 'unlock', area: 'area_flowerbed_stage' });
    await frames(page, 2);
    const seq = (await page.evaluate(() => window.__bb!.sequencer()))!;
    for (const [row, col] of [
      [0, 0],
      [1, 2],
      [2, 4],
      [3, 6],
      [5, 0],
      [5, 4],
    ] as const)
      await send(page, {
        type: 'seq_touch',
        x: seq.caps[row]![col]!.x,
        y: seq.caps[row]![col]!.y,
        start: true,
      });
    await frames(page, 60);
    await page.waitForTimeout(400);
    await shot(page, '35-conga');
    await send(page, { type: 'seq_touch', x: seq.stone.x, y: seq.stone.y, start: true });
    await frames(page, 2);
    await send(page, { type: 'seq_touch', x: seq.stone.x, y: seq.stone.y, start: true });
    await frames(page, 2);
    // --- Back up, and the gnome ---------------------------------------------
    await through(page, 'fix_depths_shaft');
    await look(page, 0);
    await away(page);
    const gnomeBox: [number, number, number, number] = [0, 5.4, 7, 9.6];
    await shot(page, '40-gnome-no-nose', gnomeBox);
    const face = await client(page, 1.8, 7.6);
    await page.mouse.move(face.x, face.y);
    await frames(page, 30);
    await shot(page, '41-gnome-sniffle', gnomeBox);
    // The nose, carried home in the hand.
    const nose = (await page.evaluate(() => window.__bb!.entities())).find(
      (e) => e.defId === 'item_gnome_nose',
    )!;
    await page.evaluate((id) => {
      const e = window.__bb!.entity(id)!;
      window.__bb!.send({ type: 'despawn', id });
      window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_gnome_nose', x: 5.5, y: 6 });
      void e;
    }, nose.id);
    await frames(page, 60);
    const nose2 = (await page.evaluate(() => window.__bb!.entities())).find(
      (e) => e.defId === 'item_gnome_nose',
    )!;
    const na = await client(page, nose2.x, nose2.y);
    await page.mouse.move(na.x, na.y);
    await frames(page, 2);
    await page.mouse.down();
    await frames(page, 2);
    const hole = await client(page, 2.4, 6.6);
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(na.x + ((hole.x - na.x) * i) / 10, na.y + ((hole.y - na.y) * i) / 10);
      await frames(page, 2);
    }
    await frames(page, 10);
    await shot(page, '42-gnome-holding-nose', gnomeBox);
    const into = await client(page, 1.76, 7.42);
    await page.mouse.move(into.x, into.y);
    await frames(page, 20);
    await page.mouse.up();
    await frames(page, 12);
    await away(page);
    await shot(page, '43-gnome-sneeze', gnomeBox);
    await frames(page, 90);
    await shot(page, '44-gnome-hat-open', gnomeBox);
    // --- Gnome Hollow ---------------------------------------------------------
    // Some lost toys for the museum: things flung out of the world come back, and the shelf remembers.
    for (const [i, defId] of [
      'item_rubber_ball',
      'item_marble_blue',
      'item_pebble',
      'item_berry_red',
      'item_spring_coil',
      'item_leaf',
      'item_bottle_cap',
      'item_jelly_bean',
      'item_feather',
    ].entries())
      await send(page, { type: 'spawn', kind: 'item', defId, x: PLAZA_X + 10 + i, y: -40 });
    await frames(page, 40);
    await through(page, 'fix_gnome_hat');
    await look(page, HOLLOW_X + 0.6);
    await away(page);
    await frames(page, 10);
    await shot(page, '50-hollow');
    await shot(page, '51-lost-shelf', [HOLLOW_X + 1.6, 3.2, HOLLOW_X + 7.2, 7]);
    await shot(page, '52-telescope', [HOLLOW_X + 12.4, 0.6, HOLLOW_X + 19.2, 5.4]);
    await shot(page, '53-pedestal-door', [HOLLOW_X + 0.6, 5.6, HOLLOW_X + 13, 9.6]);
    await send(page, { type: 'set_time', hour: 22 });
    await frames(page, 20);
    await shot(page, '54-hollow-night');
    await send(page, { type: 'set_time', hour: 11 });
    // The telescope: the cast in the stars.
    const tel = (await page.evaluate(() => window.__bb!.fixture('fix_gnome_telescope')))!;
    const ta = await client(page, tel.x, tel.y);
    await page.mouse.move(ta.x, ta.y);
    await frames(page, 2);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 40);
    await shot(page, '55-telescope-sky');
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 20);
    // The golden marble on the moon pedestal.
    const cup = (await page.evaluate(() => window.__bb!.fixture('fix_moon_pedestal')))!;
    await send(page, {
      type: 'spawn',
      kind: 'item',
      defId: 'item_marble_gold',
      x: cup.x + 0.1,
      y: cup.y - 0.6,
    });
    await frames(page, 40);
    await away(page);
    await shot(page, '56-marble-home', [HOLLOW_X + 6.6, 5.2, HOLLOW_X + 12.6, 9.6]);
    // --- The finale: the telescope opens, everyone to the plaza, fireworks ---
    await page.evaluate(() => window.__bb!.debugFinale());
    await frames(page, 90);
    await shot(page, '60-finale-telescope');
    await frames(page, 120);
    await page.waitForTimeout(300);
    await frames(page, 240);
    await shot(page, '61-finale-gather');
    await frames(page, 50);
    await shot(page, '62-finale-fireworks');
    await frames(page, 70);
    await shot(page, '63-finale-fireworks-2');
    await frames(page, 70);
    await shot(page, '64-finale-fireworks-3');
  } finally {
    await bb.close();
  }
});
