import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, entities, launchApp } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The wearables (M11), for reviewing their art by eye:
// `pnpm shots -g "m11 hat items"`. Writes /tmp/bb-shots/wear-items-*.png.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

/** The sixteen M11 wearables, then the M8 ones to compare them with. */
const WEARABLES = [
  'item_hat_acorn_cap',
  'item_hat_party_cone',
  'item_hat_flower_petal',
  'item_hat_tiny_top_hat',
  'item_hat_chef',
  'item_hat_wizard',
  'item_hat_candle',
  'item_hat_eggshell',
  'item_hat_goo',
  'item_hat_bubble',
  'item_acc_sunglasses',
  'item_acc_mustache',
  'item_acc_monocle',
  'item_acc_bowtie_ribbon',
  'item_acc_scarf_yarn',
  'item_acc_bandaid',
  'item_hat_thimble',
  'item_hat_mushroom',
  'item_hat_propeller',
  'item_hat_viking',
  'item_hat_yarn_beanie',
  'item_hat_pirate',
  'item_acc_googly_glasses',
  'item_acc_snorkel',
  'item_acc_headlamp',
  'item_acc_roller_skates',
  'item_acc_cape_leaf',
  'item_acc_crown_foil',
  'item_acc_backpack_matchbox',
];

test.describe('wearables', () => {
  test('m11 hat items', async () => {
    // Each sharp screenshot takes a few seconds on the software renderer.
    test.setTimeout(600_000);
    mkdirSync(DIR, { recursive: true });
    const bb = await launchApp();
    const { page } = bb;
    sharpShots(page);
    const shot = (name: string): Promise<Buffer> =>
      page.screenshot({ path: join(DIR, `wear-items-${name}.png`) });
    const closeUp = async (name: string, x: number, y: number, w: number, h: number): Promise<void> => {
      const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
      await page.screenshot({ path: join(DIR, `wear-items-${name}.png`), clip });
    };
    const spawnAll = async (list: { defId: string; x: number; y: number }[]): Promise<number[]> => {
      const before = new Set((await entities(page)).map((e) => e.id));
      await page.evaluate((l) => {
        for (const s of l) window.__bb!.send({ type: 'spawn', kind: 'item', defId: s.defId, x: s.x, y: s.y });
        window.__bb!.frames(1);
      }, list);
      await page.waitForTimeout(300);
      return (await entities(page)).filter((e) => !before.has(e.id)).map((e) => e.id);
    };
    try {
      await bb.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
      );
      await page.waitForTimeout(500);
      await clickSlot(page, 0);
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__bb!.setPaused(true));
      // Park the hand in a corner so it covers nothing.
      await page.mouse.move(4, 1070);
      const left = await page.evaluate(() => window.__bb!.camera().x);

      // Hanging in the sky in rows of six (clear of the stump), spawned before a single step.
      const cols = 6;
      const spots = WEARABLES.map((defId, i) => ({
        defId,
        x: left + 2.2 + (i % cols) * 2.1,
        y: 1.3 + Math.floor(i / cols) * 1.35,
      }));
      const hung = await spawnAll(spots);
      await shot('sheet');
      // Close-ups of the new ones; the M8 ones are on the sheet to compare with.
      for (const [i, s] of spots.slice(0, 16).entries())
        await closeUp(`close-${String(i).padStart(2, '0')}-${s.defId.slice(5)}`, s.x, s.y, 1.6, 1.2);
      await page.evaluate(() => {
        window.__bb!.send({ type: 'set_time', hour: 22 });
        window.__bb!.frames(2);
      });
      await page.waitForTimeout(400);
      await shot('sheet-night');
      for (const id of hung) await page.evaluate((e) => window.__bb!.send({ type: 'despawn', id: e }), id);
      await page.evaluate(() => {
        window.__bb!.send({ type: 'set_time', hour: 12 });
        window.__bb!.frames(2);
      });

      // Then on the ground, in rows of ten, a row at a time.
      for (let row = 0; row * 10 < WEARABLES.length; row++) {
        const list = WEARABLES.slice(row * 10, row * 10 + 10).map((defId, i) => ({
          defId,
          x: left + 1.2 + i * 1.15,
          y: 8.2,
        }));
        const ids = await spawnAll(list);
        await page.evaluate(() => window.__bb!.frames(90));
        await page.waitForTimeout(300);
        await closeUp(`ground-${row + 1}`, left + 1.2 + 4.5 * 1.15, 8.4, 12.6, 1.8);
        for (const id of ids) await page.evaluate((e) => window.__bb!.send({ type: 'despawn', id: e }), id);
        await page.evaluate(() => window.__bb!.frames(1));
      }
    } finally {
      await bb.close();
    }
  });

  test('m11 hats on bugs', async () => {
    test.setTimeout(900_000);
    mkdirSync(DIR, { recursive: true });
    const bb = await launchApp();
    const { page } = bb;
    sharpShots(page);
    const send = (c: Parameters<NonNullable<typeof window.__bb>['send']>[0]): Promise<void> =>
      page.evaluate((cmd) => window.__bb!.send(cmd), c);
    try {
      await bb.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
      );
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__bb!.freezeNextWorld(true));
      await clickSlot(page, 0);
      await page.mouse.move(4, 1070);
      // Clear the plaza's bugs, then line up six of our own on the ground left of the stump.
      for (const e of await entities(page))
        if (e.kind === 'bug' || (e.x > 64 && e.x < 78)) await send({ type: 'despawn', id: e.id });
      const BUGS = [
        'bug_ladybug_dot',
        'bug_mantis_prim',
        'bug_bee_buzzby',
        'bug_cricket_fiddle',
        'bug_moth_luma',
        'bug_stagbeetle_moose',
      ];
      const x0 = 64 + 1.6;
      for (const [i, defId] of BUGS.entries())
        await send({ type: 'spawn', kind: 'bug', defId, x: x0 + i * 2.0, y: 7.6 });
      await page.evaluate(() => window.__bb!.frames(40));
      // Content and sleepy, so they stay where they are (they wear things in their sleep).
      for (const e of await entities(page))
        if (e.kind === 'bug')
          for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean'] as const)
            await send({ type: 'set_need', id: e.id, need, value: 100 });
      await page.evaluate(() => window.__bb!.frames(20));
      const bugs = (await entities(page)).filter((e) => e.kind === 'bug').sort((a, b) => a.x - b.x);
      await page.evaluate((x) => window.__bb!.cameraTo(x), x0 - 1.2);
      await page.waitForTimeout(600);
      const heads = WEARABLES.filter((d) => d.startsWith('item_hat_') || d === 'item_acc_crown_foil');
      const faces = [
        'item_acc_sunglasses',
        'item_acc_googly_glasses',
        'item_acc_mustache',
        'item_acc_monocle',
        'item_acc_snorkel',
        'item_acc_headlamp',
      ];
      const backs = [
        'item_acc_bowtie_ribbon',
        'item_acc_cape_leaf',
        'item_acc_scarf_yarn',
        'item_acc_backpack_matchbox',
        'item_acc_bandaid',
      ];
      for (const [n, head] of heads.entries()) {
        const outfit = [
          head,
          faces[n % faces.length]!,
          backs[n % backs.length]!,
          ...(n % 3 === 0 ? ['item_acc_roller_skates'] : []),
        ];
        const made: number[] = [];
        for (const b of bugs)
          for (const defId of outfit) {
            const before = new Set((await entities(page)).map((e) => e.id));
            await send({ type: 'spawn', kind: 'item', defId, x: b.x, y: 2 });
            await page.evaluate(() => window.__bb!.frames(1));
            const item = (await entities(page)).find((e) => !before.has(e.id))!;
            made.push(item.id);
            await send({ type: 'wear', bug: b.id, item: item.id });
          }
        await page.evaluate(() => window.__bb!.frames(3));
        await page.waitForTimeout(350);
        const clip = await worldClip(page, x0 - 1, 5.6, x0 + 2.0 * 5 + 1.4, 9.1);
        await page.screenshot({
          path: join(DIR, `wear-on-${String(n).padStart(2, '0')}-${head.slice(5)}.png`),
          clip,
        });
        for (const id of made) await send({ type: 'despawn', id });
        await page.evaluate(() => window.__bb!.frames(1));
      }
    } finally {
      await bb.close();
    }
  });
});
