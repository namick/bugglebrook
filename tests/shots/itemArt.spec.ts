import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatReport } from '../../scripts/art/build.ts';
import { buildItemSheet, toItemPack } from '../../scripts/art/items.ts';
import type { ItemSheetFile } from '../../src/renderer/src/art/itemSheet';
import { clickSlot, launchApp } from '../e2e/app';
import { sharpShots } from './clip';

// A set's item art, for reviewing by eye: every sheet's items in a row each,
// the code-drawn item beside the painting, then the painting with paint on
// it, with bites out of it (food), and under the night tint. Then the plaza
// by day and by night with the set on.
//
//   BB_ITEMS_SRC=/abs/folder BB_SHOTS_DIR=/abs/out pnpm shots -g "item art"
//
// BB_ITEMS_SRC is a set's source folder (the one that holds `items/`): its
// sheets are built here and now, with no `pnpm art:build`. Or name a set
// that is built into the game with BB_ART_SET=<id>. With neither, the tour
// shows the crude test sheets. BB_ITEMS_ONLY=items_food_1,items_hats_1 keeps
// it to some sheets. Writes itemart-*.png to /tmp/bb-shots (or $BB_SHOTS_DIR).

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const SRC = resolve(process.env.BB_ITEMS_SRC ?? join(import.meta.dirname, '../e2e/fixtures/art'));
const BUILT = process.env.BB_ITEMS_SRC ? undefined : process.env.BB_ART_SET;
const ONLY = (process.env.BB_ITEMS_ONLY ?? '').split(',').filter(Boolean);

test('item art: every sheet of a set beside the code-drawn items', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const { app, page, close, errors } = await launchApp();
  try {
    sharpShots(page);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    let set = BUILT;
    if (!set) {
      const dir = join(SRC, 'items');
      if (!existsSync(dir))
        throw new Error(`${SRC} has no items folder. Point BB_ITEMS_SRC at a set's folder.`);
      const built = readdirSync(dir)
        .filter((f) => f.endsWith('.ora'))
        .sort()
        .map((f) => {
          const id = f.slice(0, -4);
          const sheet = JSON.parse(readFileSync(join(dir, `${id}.rig.json`), 'utf8')) as ItemSheetFile;
          const b = buildItemSheet(new Uint8Array(readFileSync(join(dir, f))), sheet);
          console.log(formatReport(id, b.messages));
          return b;
        });
      set = 'item_tour';
      await page.evaluate(([p, id]) => window.__bb!.loadItemArt(p as never, id as string, 'Item tour'), [
        toItemPack(built),
        set,
      ] as const);
    }
    await page.evaluate((id) => window.__bb!.artSelect(id), set);
    const painted = await page.evaluate(() => window.__bb!.itemArtPainted());
    const all = await page.evaluate(() => window.__bb!.artItemSheets());
    // Sheets with something painted, unless some were asked for by name.
    const sheets = all.filter((s) =>
      ONLY.length ? ONLY.includes(s.id) : s.items.some((i) => painted.includes(i)),
    );
    console.log(`${set}: ${painted.length} items painted on ${sheets.length} sheets`);
    expect(sheets.length).toBeGreaterThan(0);
    // Park the hand in a corner so it covers nothing.
    await page.mouse.move(4, 1070);
    for (const s of sheets) {
      const board = (await page.evaluate((id) => window.__bb!.itemBoard(id), s.id))!;
      await page.screenshot({ path: join(DIR, `itemart-${s.id}.png`) });
      console.log(
        `itemart-${s.id}.png: ${board.rows.filter((r) => r.art === 'sheet').length}/${board.rows.length} painted, zoom ${board.zoom}x`,
      );
    }
    await page.evaluate(() => window.__bb!.itemBoard(null));

    // The plaza with the set on, by day and at night.
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__bb!.setPaused(true));
    // Up in the sky this time: at the bottom edge the hand would open the pocket.
    await page.mouse.move(240, 160);
    await page.evaluate(() => window.__bb!.frames(2));
    await page.screenshot({ path: join(DIR, 'itemart-world-day.png') });
    await page.evaluate(() => window.__bb!.send({ type: 'set_time', hour: 23 }));
    await page.evaluate(() => window.__bb!.frames(240));
    await page.screenshot({ path: join(DIR, 'itemart-world-night.png') });
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
