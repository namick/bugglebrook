import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildItemSheet, toItemPack } from '../../scripts/art/items.ts';
import type { ItemPack, ItemSheetFile } from '../../src/renderer/src/art/itemSheet';
import {
  PLAZA_X,
  bugNamed,
  clickSlot,
  clickUi,
  content,
  entities,
  entity,
  frames,
  launchApp as launch,
  openFrozen,
  pressOn,
  spawnFrozen,
  spawnItem,
  waitForScene,
} from './app';

async function launchApp(...args: Parameters<typeof launch>): ReturnType<typeof launch> {
  const app = await launch(...args);
  await waitForScene(app.page, 'menu');
  return app;
}

// Item art end to end: the crude test item sheets (tests/e2e/fixtures/art/items,
// made by makeItems.ts) go through the real importer into the running game. The
// items those sheets paint are drawn from them wherever an item shows; the two
// they leave blank, and the things no set may paint, stay code-drawn.

const FIXTURES = join(import.meta.dirname, 'fixtures/art/items');
const SET = 'crude_items';

function pack(): ItemPack {
  const built = ['items_things_1', 'items_food_1', 'items_hats_1'].map((id) =>
    buildItemSheet(
      new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`))),
      JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as ItemSheetFile,
    ),
  );
  expect(built.map((b) => b.entry.status)).toEqual(['drawn', 'drawn', 'drawn']);
  return toItemPack(built);
}

const install = (page: Page): Promise<void> =>
  page.evaluate(
    ([p, id]) => window.__bb!.loadItemArt(p as ItemPack, id as string, 'Crude items', 'Test fixture'),
    [pack(), SET] as const,
  );

const art = (page: Page, id: number) => page.evaluate((i) => window.__bb!.itemArt(i), id);

/** Pick the crude set on the settings board with the real mouse, or go back to the original art. */
async function chooseSet(page: Page, name: string): Promise<void> {
  await clickUi(page, 'pause');
  for (let i = 0; i < 8; i++) {
    if ((await page.evaluate(() => window.__bb!.artChoice()))?.name === name) break;
    await clickUi(page, 'art_next');
  }
  expect((await page.evaluate(() => window.__bb!.artChoice()))?.name).toBe(name);
  await clickUi(page, 'resume');
}

test('a set paints some items: the world, the hand, and the pocket show them, and the rest stay code-drawn', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await install(page);
    await clickSlot(page, 0);
    const pebble = await spawnItem(page, 'item_pebble', PLAZA_X + 12);
    const cork = await spawnItem(page, 'item_cork', PLAZA_X + 15);
    const spring = (await entities(page)).find((e) => e.defId === 'item_spring_coil')!;
    const cap = (await entities(page)).find((e) => e.defId === 'item_bottle_cap')!;
    // Tests start with the original art: everything is code-drawn.
    for (const id of [pebble, cork, spring.id, cap.id])
      expect(await art(page, id)).toEqual({ art: 'code', texture: null });

    await chooseSet(page, 'Crude items');
    await expect.poll(async () => (await art(page, pebble))?.art).toBe('sheet');
    const painted = (await art(page, pebble))!;
    expect(painted.texture).not.toBeNull();
    // The cap, already in the world, has a painting of its own.
    const capArt = (await art(page, cap.id))!;
    expect(capArt.art).toBe('sheet');
    expect(capArt.texture).not.toBe(painted.texture);
    // Left blank on its sheet, and never paintable: both fall back to code.
    expect(await art(page, cork)).toEqual({ art: 'code', texture: null });
    expect(await art(page, spring.id)).toEqual({ art: 'code', texture: null });
    expect(await page.evaluate(() => window.__bb!.itemArtPainted())).toHaveLength(22);

    // Pick the pebble up with the real mouse: in the hand it is the same painting.
    const at = await pressOn(page, pebble);
    expect((await entity(page, pebble))?.held).toBe(true);
    expect(await art(page, pebble)).toEqual(painted);
    // Carry it to the pocket, which slides up while something is held.
    await expect.poll(() => page.evaluate(() => window.__bb!.pocketOpen())).toBe(1);
    const slot = (await page.evaluate(() => window.__bb!.pocketSlotClient(1)))!;
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(at.x + ((slot.x - at.x) * i) / 15, at.y + ((slot.y - at.y) * i) / 15);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect.poll(async () => (await entity(page, pebble))!.pocket).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__bb!.pocketItemArt(1))).toEqual(painted);
    // The cork goes in beside it, still code-drawn.
    const corkAt = await pressOn(page, cork);
    const next = (await page.evaluate(() => window.__bb!.pocketSlotClient(2)))!;
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(
        corkAt.x + ((next.x - corkAt.x) * i) / 15,
        corkAt.y + ((next.y - corkAt.y) * i) / 15,
      );
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect.poll(async () => (await entity(page, cork))!.pocket).toBe(2);
    await expect
      .poll(() => page.evaluate(() => window.__bb!.pocketItemArt(2)))
      .toEqual({ art: 'code', texture: null });
    expect(await page.evaluate(() => window.__bb!.pocketArt(1))).toBe('drawn');
    expect(await page.evaluate(() => window.__bb!.pocketArt(2))).toBe('code');

    // Back to the original art: the same things, in place, are code-drawn again.
    await chooseSet(page, 'Original bugs');
    await expect.poll(() => art(page, cap.id)).toEqual({ art: 'code', texture: null });
    await expect
      .poll(() => page.evaluate(() => window.__bb!.pocketItemArt(1)))
      .toEqual({ art: 'code', texture: null });
    expect((await entity(page, pebble))!.pocket).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('a painted hat sits on a bug, and painted food shows wherever an item is pictured', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await install(page);
    await openFrozen(page, 0);
    await page.evaluate((id) => window.__bb!.artSelect(id), SET);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await content(page, glorp.id);
    const hat = await spawnFrozen(page, 'item_hat_thimble', PLAZA_X + 12);
    const band = await spawnFrozen(page, 'item_acc_bandaid', PLAZA_X + 14);
    await frames(page, 2);
    const loose = (await art(page, hat))!;
    expect(loose.art).toBe('sheet');
    // The bandage's sheet is not in this set: code-drawn, loose or worn.
    expect(await art(page, band)).toEqual({ art: 'code', texture: null });
    for (const item of [hat, band]) {
      await page.evaluate(
        ([bug, it]) => window.__bb!.send({ type: 'wear', bug: bug!, item: it! }),
        [glorp.id, item],
      );
      await frames(page, 2);
    }
    const worn = await page.evaluate((id) => window.__bb!.wornItemArt(id), glorp.id);
    expect(worn).toEqual([
      { defId: 'item_hat_thimble', ...loose },
      { defId: 'item_acc_bandaid', art: 'code', texture: null },
    ]);
    // Anywhere else an item is pictured (the journal, a thought bubble, a recipe card) asks the same question.
    expect(await page.evaluate(() => window.__bb!.itemArtFor('item_berry_red'))).toBe('sheet');
    expect(await page.evaluate(() => window.__bb!.itemArtFor('item_cork'))).toBe('code');
    expect(await page.evaluate(() => window.__bb!.itemArtFor('item_potion_giant'))).toBe('code');
    // The item board lines a sheet up from the same views.
    const board = (await page.evaluate(() => window.__bb!.itemBoard('items_food_1')))!;
    expect(board.rows.map((r) => r.art)).toEqual(new Array(8).fill('sheet'));
    expect(board.painted).toBe(8 * 4);
    await page.evaluate(() => window.__bb!.itemBoard(null));
    // With the art off the hat on his head is code-drawn again, and still on his head.
    await page.evaluate(() => window.__bb!.artSelect('procedural'));
    await frames(page, 2);
    const plain = await page.evaluate((id) => window.__bb!.wornItemArt(id), glorp.id);
    expect(plain.map((w) => [w.defId, w.art])).toEqual([
      ['item_hat_thimble', 'code'],
      ['item_acc_bandaid', 'code'],
    ]);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
