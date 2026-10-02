import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from '../../src/game/commands';
import { clickSlot, launchApp } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// M10's clues, for reviewing their art by eye: `pnpm shots -g "clues"`.
// Writes /tmp/bb-shots/clues-*.png: the ring mushrooms and their chord,
// the clover, the stump door, the frog eyes, the big ribbit, the boot, the
// frog king, the shadow puppet, the moth spiral, the window telescope, the
// rainbow's end, and M10's treasures in a row.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string, box?: [number, number, number, number]): Promise<void> {
  const clip = box ? await worldClip(page, ...box) : undefined;
  await page.screenshot({ path: join(DIR, `clues-${name}.png`), ...(clip ? { clip } : {}) });
}

async function send(page: Page, commands: Command[], frames = 2): Promise<void> {
  await page.evaluate(
    ([cs, n]) => {
      for (const c of cs as Command[]) window.__bb!.send(c);
      window.__bb!.frames(n as number);
    },
    [commands, frames] as const,
  );
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate((k) => window.__bb!.frames(k), n);
}

async function look(page: Page, x: number): Promise<void> {
  await page.evaluate((cx) => {
    window.__bb!.cameraTo(cx);
    window.__bb!.frames(2);
  }, x);
  await page.waitForTimeout(250);
}

async function fixture(page: Page, id: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate((f) => window.__bb!.fixture(f), id))!;
}

async function spawn(page: Page, defId: string, x: number, y: number): Promise<number> {
  return page.evaluate(
    ([d, px, py]) => {
      const before = new Set(window.__bb!.entities().map((e) => e.id));
      window.__bb!.send({
        type: 'spawn',
        kind: 'item',
        defId: d as string,
        x: px as number,
        y: py as number,
      });
      window.__bb!.frames(1);
      return window.__bb!.entities().find((e) => !before.has(e.id))!.id;
    },
    [defId, x, y] as const,
  );
}

/** Grab a thing where it is and let go of it at (x, y): it counts as the player's throw. */
async function toss(page: Page, id: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([i, px, py]) => {
      const e = window.__bb!.entity(i as number)!;
      window.__bb!.send({ type: 'grab', x: e.x, y: e.y });
      window.__bb!.frames(1);
      for (let k = 0; k < 8; k++) {
        window.__bb!.send({ type: 'drag', x: px as number, y: py as number });
        window.__bb!.frames(1);
      }
      window.__bb!.send({ type: 'release', vx: 0, vy: 0 });
      window.__bb!.frames(1);
    },
    [id, x, y] as const,
  );
}

test('clues tour', async () => {
  test.setTimeout(600_000);
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
    for (const area of [
      'area_flowerbed_stage',
      'area_under_porch',
      'area_compost_lab',
      'area_treehouse_arcade',
    ])
      await send(page, [{ type: 'unlock', area }], 1);
    await page.waitForTimeout(300);
    await page.mouse.move(1910, 520);

    // --- The plaza: the ring mushrooms, then all three at once.
    const caps = await Promise.all([1, 2, 3].map((i) => fixture(page, `fix_ring_mushroom_${i}`)));
    await look(page, caps[1]!.x - 9.6);
    await shot(page, '00-plaza');
    const box: [number, number, number, number] = [caps[0]!.x - 2, 5.6, caps[2]!.x + 2, 9.4];
    await shot(page, '01-mushrooms', box);
    const marbles = [];
    for (const c of caps) marbles.push(await spawn(page, 'item_marble_blue', c.x, 3));
    for (const [i, id] of marbles.entries()) await toss(page, id, caps[i]!.x, 4);
    for (let t = 0; t < 40; t++) {
      await frames(page, 1);
      const ev = await page.evaluate(() => window.__bb!.events().some((e) => e.name === 'mushroom_chord'));
      if (ev) break;
    }
    await frames(page, 6);
    await shot(page, '02-mushroom-chord', box);

    // The clover, by day, then at midnight with the map read, then dug.
    const clover = await fixture(page, 'fix_clover');
    await look(page, clover.x - 9.6);
    const cbox: [number, number, number, number] = [clover.x - 2.5, 6.6, clover.x + 2.5, 9.4];
    await shot(page, '03-clover', cbox);
    await send(
      page,
      [
        { type: 'find_secret', id: 'secret_treasure_map' },
        { type: 'find_secret', id: 'secret_sundial_midnight' },
        { type: 'set_time', hour: 0.2 },
      ],
      4,
    );
    await page.waitForTimeout(300);
    await shot(page, '04-clover-midnight', cbox);
    await send(page, [{ type: 'poke', x: clover.x, y: clover.y }], 20);
    await shot(page, '05-clover-dug', cbox);
    await send(page, [{ type: 'set_time', hour: 12 }], 2);

    // The stump's little door.
    const hole = await fixture(page, 'fix_stump_knothole');
    await look(page, hole.x - 9.6);
    await send(page, [{ type: 'find_secret', id: 'secret_boot_key' }], 1);
    const key = await spawn(page, 'item_key_tiny', hole.x - 3, 8);
    await frames(page, 20);
    await toss(page, key, hole.x, 3.6);
    await frames(page, 40);
    await shot(page, '06-stump-door', [hole.x - 3, 3, hole.x + 3, 9.4]);

    // --- The pond: the frog eyes, the big ribbit, the boot, the frog king.
    const eyes = await fixture(page, 'fix_frog_eyes');
    const boot = await fixture(page, 'fix_rubber_boot');
    await look(page, eyes.x - 4);
    await shot(page, '07-pond');
    for (let i = 0; i < 4; i++) await send(page, [{ type: 'poke', x: eyes.x, y: eyes.y - 0.4 }], 6);
    await shot(page, '08-frog-eyes', [eyes.x - 2, 6.5, eyes.x + 2, 10]);
    await send(page, [{ type: 'poke', x: eyes.x, y: eyes.y - 0.4 }], 20);
    await shot(page, '09-big-ribbit');
    for (let i = 0; i < 3; i++) await send(page, [{ type: 'poke', x: boot.x, y: boot.y }], 8);
    await frames(page, 60);
    await shot(page, '10-boot-tipped', [boot.x - 2.5, 6.5, boot.x + 2.5, 10.6]);
    const cup = await fixture(page, 'fix_sunken_teacup');
    await look(page, cup.x - 9.6);
    await send(page, [{ type: 'find_secret', id: 'secret_knothole_door' }], 1);
    for (let i = 0; i < 3; i++) {
      await spawn(page, 'item_old_coin', cup.x - 0.1, 8.3);
      await frames(page, 150);
    }
    for (let t = 0; t < 30; t++) {
      await frames(page, 5);
      if (await page.evaluate(() => window.__bb!.events().some((e) => e.name === 'frog_king'))) break;
    }
    await frames(page, 50);
    await shot(page, '11-frog-king');

    // --- The porch at night: the shadow puppet and the moths.
    await send(page, [{ type: 'set_time', hour: 22 }], 2);
    const lamp = await fixture(page, 'fix_porch_lamp');
    await look(page, lamp.x - 9.6);
    const pen = await spawn(page, 'item_flashlight_pen', lamp.x + 2, 8);
    await send(page, [{ type: 'set_tag', id: pen, tag: 'tag_glowing', on: true }], 1);
    for (let t = 0; t < 40; t++) {
      await frames(page, 5);
      if (await page.evaluate(() => window.__bb!.events().some((e) => e.name === 'shadow_puppet'))) break;
    }
    await frames(page, 40);
    await shot(page, '12-shadow-puppet');
    await send(page, [{ type: 'poke', x: lamp.x, y: lamp.y }], 2);
    for (const dx of [-0.6, 0.6]) await spawn(page, 'item_moon_pebble', lamp.x + dx, lamp.y + 0.5);
    await frames(page, 90);
    await shot(page, '13-moth-spiral');
    await send(page, [{ type: 'set_time', hour: 12 }], 2);

    // --- The treehouse window's telescope.
    const win = await fixture(page, 'fix_treehouse_window');
    await look(page, win.x - 3);
    for (let i = 0; i < 3; i++) await send(page, [{ type: 'poke', x: win.x, y: win.y }], 4);
    await frames(page, 30);
    await shot(page, '14-telescope');

    // --- The rainbow's end in the flowerbed.
    const puddle = await fixture(page, 'fix_paint_blue');
    await look(page, puddle.x - 9.6);
    await send(page, [{ type: 'set_weather', wind: 0, rain: false, weather: 'weather_rainbow' }], 2);
    await spawn(page, 'item_jar_glass', puddle.x, 7.5);
    await frames(page, 90);
    await shot(page, '15-rainbow-end');
    await send(page, [{ type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' }], 2);

    // --- Wubbo: the giant potion broken on the moss tuft.
    await send(page, [{ type: 'find_secret', id: 'secret_scope_wubbo' }], 1);
    const jar = await fixture(page, 'fix_jar_moss');
    await look(page, jar.x - 6);
    const mossX = jar.x + 3;
    const moss = await spawn(page, 'item_moss_tuft', mossX, 8);
    await frames(page, 60);
    const bottle = await spawn(page, 'item_potion_giant', mossX, 5);
    await page.evaluate(
      ([b, m]) => {
        const e = window.__bb!.entity(b as number)!;
        const t = window.__bb!.entity(m as number)!;
        window.__bb!.send({ type: 'grab', x: e.x, y: e.y });
        window.__bb!.frames(1);
        window.__bb!.send({ type: 'drag', x: t.x, y: t.y - 1.4 });
        window.__bb!.frames(4);
        window.__bb!.send({ type: 'release', vx: 0, vy: 16 });
        window.__bb!.frames(1);
      },
      [bottle, moss] as const,
    );
    for (let t = 0; t < 30; t++) {
      await frames(page, 4);
      if (await page.evaluate(() => window.__bb!.events().some((e) => e.name === 'wubbo_grew'))) break;
    }
    await frames(page, 10);
    await shot(page, '17-wubbo-grows');
    await frames(page, 120);
    const wubbo = await page.evaluate(() =>
      window.__bb!.entities().find((e) => e.defId === 'bug_tardigrade_wubbo'),
    );
    if (wubbo) {
      await shot(page, '18-wubbo', [wubbo.x - 1.6, wubbo.y - 1.4, wubbo.x + 1.6, wubbo.y + 0.9]);
      await send(page, [{ type: 'poke', x: wubbo.x, y: wubbo.y }], 20);
      await shot(page, '19-wubbo-poked', [wubbo.x - 1.6, wubbo.y - 1.6, wubbo.x + 1.6, wubbo.y + 0.9]);
    }

    // --- M10's treasures in a row in the plaza's sky.
    const defs = [
      'item_key_tiny',
      'item_map_scrap_1',
      'item_map_scrap_2',
      'item_map_scrap_3',
      'item_map_scrap_4',
      'item_treasure_map',
      'item_marble_gold',
      'item_gnome_nose',
      'item_hat_bubble',
      'item_hat_candle',
      'item_cloud_jar',
      'item_paint_rainbow',
      'item_acc_monocle',
    ];
    const mid = caps[1]!.x;
    await look(page, mid - 9.6);
    // Spawned in one frame and shot before they fall far.
    await page.evaluate(
      ([ds, m]) => {
        (ds as string[]).forEach((d, i) =>
          window.__bb!.send({
            type: 'spawn',
            kind: 'item',
            defId: d,
            x: (m as number) - 7.8 + i * 1.3,
            y: 4.5,
          }),
        );
        window.__bb!.frames(1);
      },
      [defs, mid] as const,
    );
    await shot(page, '16-treasures', [mid - 8.6, 3.6, mid + 8.6, 5.6]);
    const names = await page.evaluate(() => window.__bb!.secrets());
    console.log('secrets found:', names.join(' '));
  } finally {
    await bb.app.close();
  }
});
