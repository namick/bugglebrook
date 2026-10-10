import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BufferImageSource, Graphics, Sprite } from 'pixi.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildAsset } from '../../scripts/art/build.ts';
import { buildItemSheet } from '../../scripts/art/items.ts';
import { decodePng } from '../../scripts/art/png.ts';
import { BUGS, CONTENT } from '../../src/game/data';
import type { ItemDef } from '../../src/game/data/types';
import type { AtlasSet, LoadedArt } from '../../src/renderer/src/art/artStore';
import { ArtStore, artStore, atlasSet } from '../../src/renderer/src/art/artStore';
import { ItemArtBook, bundledSheets, itemArtBook } from '../../src/renderer/src/art/itemArt';
import { BOARD_LOOKS, ItemBoard, planBoard } from '../../src/renderer/src/art/itemBoard';
import type { ItemSheetFile, ManifestItemSheet } from '../../src/renderer/src/art/itemSheet';
import { ITEM_SCALE } from '../../src/renderer/src/art/itemSheet';
import { chooseItemArt } from '../../src/renderer/src/art/itemSheets';
import { itemSheetFile, itemSheetPlans } from '../../src/renderer/src/art/itemTemplate';
import {
  itemArt,
  itemArtChoice,
  liveItemViews,
  makeItemView,
  syncItemViews,
} from '../../src/renderer/src/art/itemViews';
import type { AtlasJson, RigFile } from '../../src/renderer/src/art/rigFile';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';

// Item art in the game (docs/06-art-guide.md, B21): the choice between a
// set's painting and the code drawing, and the views that show it.

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const item = (id: string): ItemDef => CONTENT.items.get(id);
const SET = 'crude_items';

/** Build a crude fixture sheet and turn its pages into textures. */
function loadSheet(id: string): { entry: ManifestItemSheet; atlases: Partial<Record<1 | 2, AtlasSet>> } {
  const sheet = JSON.parse(readFileSync(join(FIX, 'items', `${id}.rig.json`), 'utf8')) as ItemSheetFile;
  const built = buildItemSheet(new Uint8Array(readFileSync(join(FIX, 'items', `${id}.ora`))), sheet);
  const atlases: Partial<Record<1 | 2, AtlasSet>> = {};
  for (const scale of [1, 2] as const)
    for (const page of built.entry.pages[String(scale) as '1' | '2']) {
      const img = decodePng(built.files[`${page}.png`]!);
      const json = JSON.parse(new TextDecoder().decode(built.files[`${page}.json`]!)) as AtlasJson;
      const source = new BufferImageSource({
        resource: new Uint8Array(img.data),
        width: img.w,
        height: img.h,
      });
      atlases[scale] = atlasSet(source, json, atlases[scale]);
    }
  return { entry: built.entry, atlases };
}

const FIXTURE_SHEETS = readdirSync(join(FIX, 'items'))
  .filter((f) => f.endsWith('.ora'))
  .map((f) => f.slice(0, -4))
  .sort();

beforeAll(() => {
  for (const id of FIXTURE_SHEETS) {
    const { entry, atlases } = loadSheet(id);
    itemArtBook.put(SET, entry, atlases);
  }
}, 60_000);

afterEach(() => {
  artStore.select('procedural');
  SpriteBugView.forceScale = null;
  syncItemViews();
});

describe('item art: painting or code', () => {
  const have = (
    o: Partial<Parameters<typeof chooseItemArt>[1]> = {},
  ): Parameters<typeof chooseItemArt>[1] => ({
    mode: 'drawn',
    painted: () => true,
    twigDrawn: true,
    ...o,
  });

  it('uses a painting only for an item the set painted, and never for the code-only ones', () => {
    const pebble = item('item_pebble');
    expect(chooseItemArt(pebble, have())).toBe('sheet');
    expect(chooseItemArt(pebble, have({ painted: () => false }))).toBe('code');
    expect(chooseItemArt(pebble, have({ painted: (id) => id === 'item_pebble' }))).toBe('sheet');
    expect(chooseItemArt(pebble, have({ mode: 'code' }))).toBe('code');
    // Even if a set somehow had pictures for them, these stay code-drawn.
    for (const id of [
      'item_spring_coil',
      'item_pinwheel',
      'item_paper_boat',
      'item_potion_giant',
      'item_lattice_panel',
    ])
      expect(chooseItemArt(item(id), have()), id).toBe('code');
  });

  it("gives the twig Twig's stick when he is drawn, whatever the set painted", () => {
    const twig = item('item_twig');
    expect(chooseItemArt(twig, have())).toBe('twig');
    expect(chooseItemArt(twig, have({ twigDrawn: false }))).toBe('code');
    expect(chooseItemArt(twig, have({ mode: 'code' }))).toBe('code');
  });

  it('answers from the selected set, one item at a time', () => {
    expect(itemArtBook.painted(SET)).toHaveLength(22);
    artStore.select(SET);
    expect(itemArtChoice(item('item_pebble'))).toBe('sheet');
    expect(itemArtChoice(item('item_berry_red'))).toBe('sheet');
    expect(itemArtChoice(item('item_hat_thimble'))).toBe('sheet');
    // Left blank on its sheet, on a sheet the set does not have, and never paintable.
    expect(itemArtChoice(item('item_cork'))).toBe('code');
    expect(itemArtChoice(item('item_sponge'))).toBe('code');
    expect(itemArtChoice(item('item_spring_coil'))).toBe('code');
    expect(itemArt(item('item_cork'))).toBeNull();
    // Another set has no items of its own: nothing leaks across.
    artStore.select('reference');
    expect(itemArtChoice(item('item_pebble'))).toBe('code');
    expect(itemArt(item('item_pebble'))).toBeNull();
    artStore.select('procedural');
    expect(itemArtChoice(item('item_pebble'))).toBe('code');
  });

  it('keeps sets apart and replaces a sheet when it is saved again', () => {
    let changes = 0;
    const book = new ItemArtBook(() => changes++);
    const things = loadSheet('items_things_1');
    book.put('a', things.entry, things.atlases);
    expect(changes).toBe(1);
    expect(book.get('a', 'item_pebble')!.sheet).toBe('items_things_1');
    expect(book.get('a', 'item_pebble')!.scales[1]!.texture).toBeDefined();
    expect(book.get('a', 'item_pebble')!.scales[2]!.texture).toBeDefined();
    expect(book.get('b', 'item_pebble')).toBeNull();
    expect(book.get('a', 'item_cork')).toBeNull();
    expect(book.sheet('a', 'items_things_1')!.status).toBe('drawn');
    expect(book.sheet('b', 'items_things_1')).toBeNull();
    // The sheet comes back with the pebble erased: it is code-drawn again, the rest stay.
    const fewer = { ...things.entry, items: things.entry.items.filter((i) => i !== 'item_pebble') };
    book.put('a', fewer, things.atlases);
    expect(book.get('a', 'item_pebble')).toBeNull();
    expect(book.painted('a').sort()).toEqual([...fewer.items].sort());
    // A sheet whose pages did not load paints nothing.
    book.put('c', things.entry, {});
    expect(book.painted('c')).toEqual([]);
    const store = new ArtStore();
    store.select('a');
    expect(itemArt(item('item_marble_blue'), store, book)).not.toBeNull();
    expect(itemArt(item('item_pebble'), store, book)).toBeNull();
  });

  it('finds each bundled sheet, its set, and where its pages are', () => {
    const entry = loadSheet('items_food_1').entry;
    const hats = { ...entry, id: 'items_hats_1' };
    const found = bundledSheets({
      '../../art/sets/xeno/items/manifest.json': {
        schema: 1,
        sheets: { items_food_1: entry, items_hats_1: hats },
      },
      '../../art/items/manifest.json': { schema: 1, sheets: { items_food_1: entry } },
      // A set that happens to be called "items" or "art" is still a set, and a bug manifest is not ours.
      '../../art/sets/items/items/manifest.json': { schema: 1, sheets: { items_food_1: entry } },
      '../../art/sets/art/items/manifest.json': { schema: 1, sheets: { items_food_1: entry } },
      '../../art/sets/xeno/manifest.json': { schema: 1, sheets: { nope: entry } },
    });
    expect(found.map((f) => [f.setId, f.base, f.entry.id])).toEqual([
      ['reference', '../../art/', 'items_food_1'],
      ['art', '../../art/sets/art/', 'items_food_1'],
      ['items', '../../art/sets/items/', 'items_food_1'],
      ['xeno', '../../art/sets/xeno/', 'items_food_1'],
      ['xeno', '../../art/sets/xeno/', 'items_hats_1'],
    ]);
    // A page's file is the folder plus the path the manifest gives.
    expect(`${found[3]!.base}${entry.pages['2'][0]}.png`).toBe(
      '../../art/sets/xeno/items/items_food_1@2x.png',
    );
  });

  it('draws from the 2x pages on a sharp screen and the 1x pages otherwise', () => {
    artStore.select(SET);
    const pebble = item('item_pebble');
    SpriteBugView.forceScale = 1;
    const one = itemArt(pebble)!;
    SpriteBugView.forceScale = 2;
    const two = itemArt(pebble)!;
    expect(one.k).toBe(1);
    expect(two.k).toBe(0.5);
    expect(two.texture.width).toBeCloseTo(one.texture.width * 2, -1);
    expect(one.texture.source).not.toBe(two.texture.source);
    // The same size in the world either way.
    expect(two.texture.width * two.k).toBeCloseTo(one.texture.width * one.k, 0);
    expect(one.rim).toBeNull();
  });

  it("still gives the twig item Twig's stick from the bug's own file", () => {
    const twigBug = BUGS.all.find((b) => b.art === 'stickinsect')!;
    const rig = JSON.parse(readFileSync(join(FIX, `${twigBug.id}.rig.json`), 'utf8')) as RigFile;
    const built = buildAsset(new Uint8Array(readFileSync(join(FIX, `${twigBug.id}.ora`))), rig);
    const art: LoadedArt = { entry: built.entry, scales: {} };
    for (const scale of [1, 2] as const)
      for (const page of built.entry.pages[String(scale) as '1' | '2']) {
        const img = decodePng(built.files[`${page}.png`]!);
        const json = JSON.parse(new TextDecoder().decode(built.files[`${page}.json`]!)) as AtlasJson;
        const source = new BufferImageSource({
          resource: new Uint8Array(img.data),
          width: img.w,
          height: img.h,
        });
        art.scales[scale] = atlasSet(source, json, art.scales[scale]);
      }
    const store = new ArtStore();
    store.put(art, 'family');
    store.select('family');
    const got = itemArt(item('item_twig'), store, new ItemArtBook())!;
    expect(got.texture.label).toBe('stick');
    expect(got.rim!.texture.label).toBe('stick@rim');
    store.select('procedural');
    expect(itemArt(item('item_twig'), store, new ItemArtBook())).toBeNull();
  });
});

describe('item art: the views', () => {
  const artSprite = (v: ItemSprite): Sprite | undefined =>
    v.art.children.find((c): c is Sprite => c instanceof Sprite && c.label === 'item art');
  const codeDrawing = (v: ItemSprite): Graphics[] =>
    v.art.children.filter((c): c is Graphics => c instanceof Graphics && c.visible);

  it('shows the painting where the code drawing was, to the pixel', () => {
    artStore.select(SET);
    for (const scale of [1, 2] as const) {
      SpriteBugView.forceScale = scale;
      for (const id of itemArtBook.painted(SET)) {
        const def = item(id);
        const view = makeItemView(def, 0);
        expect(view.artTexture, id).not.toBeNull();
        const code = new ItemSprite(def, 0).getLocalBounds();
        const drawn = view.getLocalBounds();
        // The crude paint is the code-drawn shape at game size, in a frame padded by a pixel or two.
        expect(drawn.minX, `${id} left ${scale}x`).toBeGreaterThan(code.minX - 3.5);
        expect(drawn.minX, `${id} left ${scale}x`).toBeLessThan(code.minX + 1.5);
        expect(drawn.maxX, `${id} right ${scale}x`).toBeLessThan(code.maxX + 3.5);
        expect(drawn.maxX, `${id} right ${scale}x`).toBeGreaterThan(code.maxX - 1.5);
        expect(drawn.minY, `${id} top ${scale}x`).toBeGreaterThan(code.minY - 3.5);
        expect(drawn.minY, `${id} top ${scale}x`).toBeLessThan(code.minY + 1.5);
        expect(drawn.maxY, `${id} bottom ${scale}x`).toBeLessThan(code.maxY + 3.5);
        expect(drawn.maxY, `${id} bottom ${scale}x`).toBeGreaterThan(code.maxY - 1.5);
        view.destroy({ children: true });
      }
    }
  });

  it('hides the code drawing behind the painting, and falls back per item', () => {
    artStore.select(SET);
    const pebble = makeItemView(item('item_pebble'), 4);
    expect(artSprite(pebble)).toBeDefined();
    // Only the painting shows: the code drawing and its heavy outline are hidden.
    expect(codeDrawing(pebble)).toEqual([]);
    const cork = makeItemView(item('item_cork'), 4);
    expect(cork.artTexture).toBeNull();
    expect(codeDrawing(cork).length).toBeGreaterThan(0);
    const spring = makeItemView(item('item_spring_coil'), 4);
    expect(spring.artTexture).toBeNull();
    // Two of a kind share one picture.
    const other = makeItemView(item('item_pebble'), 99);
    expect(other.artTexture).toBe(pebble.artTexture);
    expect(makeItemView(item('item_marble_blue')).artTexture).not.toBe(
      makeItemView(item('item_marble_red')).artTexture,
    );
  });

  it('swaps every view alive when the set changes, and back', () => {
    artStore.select('procedural');
    syncItemViews();
    const pebble = makeItemView(item('item_pebble'), 4);
    const cork = makeItemView(item('item_cork'), 4);
    expect(pebble.artTexture).toBeNull();
    artStore.select(SET);
    // Nothing moves until the frame's sync.
    expect(pebble.artTexture).toBeNull();
    syncItemViews();
    const texture = pebble.artTexture;
    expect(texture).not.toBeNull();
    expect(cork.artTexture).toBeNull();
    expect(codeDrawing(pebble)).toEqual([]);
    // A second sync with nothing new leaves the same sprite in place.
    const sprite = artSprite(pebble);
    syncItemViews();
    expect(artSprite(pebble)).toBe(sprite);
    artStore.setMode('code');
    syncItemViews();
    expect(pebble.artTexture).toBeNull();
    expect(artSprite(pebble)).toBeUndefined();
    expect(codeDrawing(pebble).length).toBeGreaterThan(0);
    artStore.setMode('drawn');
    artStore.select(SET);
    syncItemViews();
    expect(pebble.artTexture).toBe(texture);
  });

  it('forgets views that are destroyed', () => {
    const n = liveItemViews();
    const views = [makeItemView(item('item_pebble')), makeItemView(item('item_cork'))];
    expect(liveItemViews()).toBe(n + 2);
    for (const v of views) v.destroy({ children: true });
    expect(liveItemViews()).toBe(n);
    // A destroyed view is never touched again.
    artStore.select(SET);
    expect(() => syncItemViews()).not.toThrow();
  });

  it('lays paint, bite marks, and the hover rim over the painting as over the code drawing', () => {
    artStore.select(SET);
    const leaf = makeItemView(item('item_leaf'), 2);
    const code = new ItemSprite(item('item_leaf'), 2);
    for (const v of [leaf, code]) {
      v.setPaint(['paint_blue']);
      v.setBites(2);
      v.setRim(true, 0.8);
    }
    const order = (v: ItemSprite): string[] =>
      v.art.children.filter((c) => c.visible).map((c) => (c === artSprite(v) ? 'painting' : 'graphics'));
    // Rim, then the picture, then paint, then the bitten edges.
    expect(order(leaf)).toEqual(['graphics', 'painting', 'graphics', 'graphics']);
    const at = leaf.art.getChildIndex(artSprite(leaf)!);
    const paint = leaf.art.children[at + 1] as Graphics;
    // The paint is the code-drawn leaf's own wash: the same shape on both.
    const codePaint = code.art.children[code.art.children.length - 2] as Graphics;
    expect(paint.getLocalBounds().rectangle).toEqual(codePaint.getLocalBounds().rectangle);
    expect(paint.getLocalBounds().width).toBeGreaterThan(40);
    // Bites cut the painting too: the same mask as the code drawing gets.
    expect(leaf.art.mask).not.toBeNull();
    expect(code.art.mask).not.toBeNull();
    // The rim is the code-drawn outline, lit behind the painting.
    const rim = leaf.art.children[0] as Graphics;
    expect(rim).toBeInstanceOf(Graphics);
    expect([rim.visible, rim.alpha]).toEqual([true, 0.8]);
    leaf.setRim(false);
    expect(rim.visible).toBe(false);
    // Painted before the set was switched on: the painting still slides in under the paint.
    artStore.select('procedural');
    syncItemViews();
    const late = makeItemView(item('item_berry_red'), 2);
    late.setPaint(['paint_red']);
    late.setRim(true);
    artStore.select(SET);
    syncItemViews();
    expect(order(late)).toEqual(['graphics', 'painting', 'graphics']);
    expect((late.art.children[0] as Graphics).visible).toBe(true);
    // Tints and scale sit on the whole view, so they reach the painting like anything else.
    late.tint = 0x6a74b8;
    expect(late.tint).toBe(0x6a74b8);
  });

  it('lines a sheet up on the item board: code, painting, paint, bites, night', () => {
    artStore.select(SET);
    const board = new ItemBoard('items_things_1');
    expect(board.rows.map((r) => [r.id, r.art])).toEqual([
      ['item_bottle_cap', 'sheet'],
      ['item_marble_blue', 'sheet'],
      ['item_marble_red', 'sheet'],
      ['item_pebble', 'sheet'],
      ['item_ruler_ramp', 'sheet'],
      ['item_rubber_ball', 'sheet'],
      ['item_cork', 'code'],
      ['item_leaf_raft', 'code'],
    ]);
    // Painting, paint, and night for each of the six painted things; none of them is food.
    expect(board.paintedViews()).toBe(6 * 3);
    board.destroy();
    const food = new ItemBoard('items_food_1');
    expect(food.paintedViews()).toBe(8 * 4);
    food.destroy();
    artStore.select('procedural');
    const plain = new ItemBoard('items_food_1');
    expect(plain.paintedViews()).toBe(0);
    expect(plain.rows.every((r) => r.art === 'code')).toBe(true);
    plain.destroy();
  });

  it('fits any sheet on the board, zoomed out as far as it has to', () => {
    for (const plan of itemSheetPlans()) {
      const sheet = itemSheetFile(plan.id);
      const rows = sheet.items.map((i) => ({ w: i.cell.w / ITEM_SCALE, h: i.cell.h / ITEM_SCALE }));
      const p = planBoard(rows, BOARD_LOOKS.length);
      expect(p.at).toHaveLength(rows.length);
      rows.forEach((r, i) => {
        const at = p.at[i]!;
        expect(at.zoom, plan.id).toBeLessThanOrEqual(p.zoom);
        expect(at.x, plan.id).toBeGreaterThanOrEqual(0);
        expect(at.x + at.slot * BOARD_LOOKS.length, plan.id).toBeLessThanOrEqual(1920);
        expect(at.y + r.h * at.zoom, plan.id).toBeLessThanOrEqual(1080);
        // No row runs into the next one on its line, or sits on the line below.
        const next = p.at[i + 1];
        if (next && next.y === at.y)
          expect(next.x, plan.id).toBeGreaterThanOrEqual(at.x + at.slot * BOARD_LOOKS.length);
        else if (next) expect(next.y, plan.id).toBeGreaterThanOrEqual(at.y + r.h * at.zoom);
      });
    }
    // Small things get a big zoom, and several share a line.
    const small = planBoard(new Array(6).fill({ w: 60, h: 60 }), 5);
    expect(small.zoom).toBe(2.5);
    expect(small.at[1]!.y).toBe(small.at[0]!.y);
    // A wide thing among them is drawn smaller, on a line of its own, and the rest keep their zoom.
    const mixed = planBoard(
      [
        { w: 60, h: 60 },
        { w: 420, h: 40 },
        { w: 60, h: 60 },
      ],
      5,
    );
    expect(mixed.at.map((a) => a.zoom)).toEqual([3, 0.75, 3]);
    expect(new Set(mixed.at.map((a) => a.y)).size).toBe(3);
  });
});
