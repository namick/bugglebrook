import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSets } from '../../scripts/art/build.ts';
import { checkOne } from '../../scripts/art/checkOne.ts';
import type { ItemGuides } from '../../scripts/art/itemTemplate.ts';
import { buildItemTemplate, placeItemTemplate, refreshItemGuides } from '../../scripts/art/itemTemplate.ts';
import {
  analyzeItems,
  buildItemSheet,
  buildItems,
  dilate,
  maskOfCell,
  outlineFit,
  toItemPack,
} from '../../scripts/art/items.ts';
import type { WriteNode } from '../../scripts/art/ora.ts';
import { readOra, walk, writeOra } from '../../scripts/art/ora.ts';
import type { Rgba } from '../../scripts/art/png.ts';
import { blank, decodePng, encodePng } from '../../scripts/art/png.ts';
import type { ItemManifest, ItemSheetFile } from '../../src/renderer/src/art/itemSheet';
import { decodeMask, encodeMask } from '../../src/renderer/src/art/itemSheet';
import type { AtlasJson, RigFile } from '../../src/renderer/src/art/rigFile';
import { EMPTY, layer, rect } from './artFixtures';

// The item art importer (docs/06-art-guide.md, B19): a sheet with one paint
// layer per item goes in, atlas pages and a manifest entry come out, and
// each item stands or falls on its own.

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const W = 256;
const H = 128;

/** A disc of `r` game pixels as a guide shape for a 28 x 28 game pixel box, centered. */
function discMask(r: number, n = 28): Uint8Array {
  const bits = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) <= r) bits[y * n + x] = 1;
  return bits;
}

/** A small sheet: a ball and a brick, each in a 112 x 112 box at 4x. */
function testSheet(masks = false): ItemSheetFile {
  return {
    schema: 1,
    id: 'items_test_1',
    kind: 'item_sheet',
    title: 'Test items',
    canvas: { w: W, h: H },
    scale: 4,
    sheetHash: 'abc123',
    items: [
      {
        id: 'item_ball',
        name: 'Ball',
        cell: { x: 8, y: 8, w: 112, h: 112 },
        anchor: { x: 64, y: 64 },
        body: { type: 'circle', r: 40 },
        guide: { x: 24, y: 24, w: 80, h: 80 },
        ...(masks ? { mask: encodeMask(discMask(6), 28, 28) } : {}),
      },
      {
        id: 'item_brick',
        name: 'Brick',
        cell: { x: 136, y: 8, w: 112, h: 112 },
        anchor: { x: 192, y: 64 },
        body: { type: 'box', w: 64, h: 32 },
        guide: { x: 160, y: 48, w: 64, h: 32 },
      },
    ],
  };
}

/** A filled disc (straight alpha) centered on a point. */
function disc(cx: number, cy: number, r: number, rgba = [230, 70, 60, 255]): Rgba {
  const img = blank(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) img.data.set(rgba, (y * W + x) * 4);
  return img;
}

/** A sheet file: the stamp in a guides group, then the given layers in `items`. */
function sheetOra(
  layers: WriteNode[],
  opts: { hash?: string; w?: number; top?: WriteNode[] } = {},
): Uint8Array {
  const w = opts.w ?? W;
  return writeOra({
    w,
    h: H,
    stack: [
      ...(opts.top ?? []),
      {
        name: 'guides',
        locked: true,
        children: [
          { name: 'guide_current', png: encodePng(disc(64, 64, 40)), opacity: 0.35 },
          { name: `guide_sheet_${opts.hash ?? 'abc123'}`, png: EMPTY(), visible: false },
        ],
      },
      { name: 'items', children: layers },
    ],
    merged: encodePng(blank(8, 8)),
    thumbnail: encodePng(blank(8, 8)),
  });
}

const BALL = (): WriteNode => layer('item_ball', disc(64, 64, 40));
const BRICK = (): WriteNode => layer('item_brick', rect(W, H, 160, 48, 64, 32, [60, 120, 230, 255]));
const levels = (m: { level: string }[]): string[] => m.map((x) => x.level);
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('item sheets: the importer', () => {
  it('leaves a blank sheet alone', () => {
    const built = buildItemSheet(sheetOra([{ name: 'item_ball', png: EMPTY() }]), testSheet());
    expect(built.entry.status).toBe('empty');
    expect(built.entry.items).toEqual([]);
    expect(built.files).toEqual({});
    expect(built.messages).toEqual([
      { level: 'info', text: 'Nothing is drawn yet. The game keeps drawing these items in code.' },
    ]);
  });

  it('packs each painted item into 1x and 2x pages, pinned by the center of its body', () => {
    const built = buildItemSheet(sheetOra([BALL(), BRICK()]), testSheet());
    expect(built.messages).toEqual([]);
    expect(built.entry).toMatchObject({
      id: 'items_test_1',
      kind: 'item_sheet',
      status: 'drawn',
      sheetHash: 'abc123',
      items: ['item_ball', 'item_brick'],
      pages: { '1': ['items/items_test_1@1x'], '2': ['items/items_test_1@2x'] },
    });
    expect(Object.keys(built.files).sort()).toEqual([
      'items/items_test_1@1x.json',
      'items/items_test_1@1x.png',
      'items/items_test_1@2x.json',
      'items/items_test_1@2x.png',
    ]);
    for (const scale of [1, 2] as const) {
      const json = JSON.parse(text(built.files[`items/items_test_1@${scale}x.json`]!)) as AtlasJson;
      const png = decodePng(built.files[`items/items_test_1@${scale}x.png`]!);
      expect(json.meta.scale).toBe(scale);
      expect(json.meta.size).toEqual({ w: png.w, h: png.h });
      // No rim frames: the game lights the code-drawn outline instead.
      expect(Object.keys(json.frames).sort()).toEqual(['item_ball', 'item_brick']);
      const ball = json.frames.item_ball!;
      const brick = json.frames.item_brick!;
      // The art is 80 px across at 4x: 20 game pixels, times the scale, plus the padding around it.
      expect(ball.frame.w).toBeGreaterThanOrEqual(20 * scale);
      expect(ball.frame.w).toBeLessThanOrEqual(20 * scale + 4);
      expect(brick.frame.w).toBeGreaterThanOrEqual(16 * scale);
      expect(brick.frame.h).toBeLessThanOrEqual(8 * scale + 4);
      // Both were painted centered on their anchors.
      for (const f of [ball, brick]) {
        expect(f.anchor.x).toBeCloseTo(0.5, 1);
        expect(f.anchor.y).toBeCloseTo(0.5, 1);
      }
      // Pages are only as big as what is on them.
      expect(png.w * png.h).toBeLessThan((ball.frame.w + brick.frame.w + 12) * (ball.frame.h + 12));
      // The ball's own color made it onto the page.
      const mid = ((ball.frame.y + (ball.frame.h >> 1)) * png.w + ball.frame.x + (ball.frame.w >> 1)) * 4;
      expect([...png.data.subarray(mid, mid + 4)]).toEqual([230, 70, 60, 255]);
    }
    // Same file in, same bytes out.
    expect(buildItemSheet(sheetOra([BALL(), BRICK()]), testSheet()).files).toEqual(built.files);
  });

  it('pins an off-center painting by the anchor, not by the middle of the picture', () => {
    // A brick with a flag sticking 16 px up from its top-left corner.
    const img = rect(W, H, 160, 48, 64, 32, [60, 120, 230, 255]);
    for (let y = 32; y < 48; y++)
      for (let x = 160; x < 168; x++) img.data.set([0, 0, 0, 255], (y * W + x) * 4);
    const built = buildItemSheet(sheetOra([layer('item_brick', img)]), testSheet());
    const json = JSON.parse(text(built.files['items/items_test_1@2x.json']!)) as AtlasJson;
    const f = json.frames.item_brick!;
    // The anchor is 32 px in from the left and 32 down from the flag's tip, at 4x.
    expect(f.anchor.x * f.frame.w).toBeCloseTo(16 + (f.frame.w - 32) / 2, 0);
    expect(f.anchor.y * f.frame.h).toBeGreaterThan(f.frame.h / 2);
    expect(f.anchor.y * f.frame.h).toBeCloseTo(16 + (f.frame.h - 24) / 2, 0);
  });

  it('builds the painted items and says which are still to do', () => {
    const built = buildItemSheet(sheetOra([BALL(), { name: 'item_brick', png: EMPTY() }]), testSheet());
    expect(built.entry.status).toBe('drawn');
    expect(built.entry.items).toEqual(['item_ball']);
    expect(built.messages).toEqual([
      { level: 'info', text: 'Not painted yet, so the game draws it in code: item_brick.' },
    ]);
    // A layer that is missing altogether counts the same.
    expect(buildItemSheet(sheetOra([BALL()]), testSheet()).messages).toEqual(built.messages);
  });

  it('drops one item with a problem and keeps the rest of its sheet', () => {
    // The ball's layer has a stray mark over in the brick's box.
    const stray = disc(64, 64, 40);
    stray.data.set([0, 0, 0, 255], (60 * W + 200) * 4);
    const built = buildItemSheet(sheetOra([layer('item_ball', stray), BRICK()]), testSheet());
    expect(built.entry.status).toBe('drawn');
    expect(built.entry.items).toEqual(['item_brick']);
    expect(built.messages).toHaveLength(1);
    expect(built.messages[0]).toMatchObject({ level: 'error', layer: 'item_ball' });
    expect(built.messages[0]!.text).toContain('goes outside its box');
    const json = JSON.parse(text(built.files['items/items_test_1@1x.json']!)) as AtlasJson;
    expect(Object.keys(json.frames)).toEqual(['item_brick']);
  });

  it('is broken when no painted item is usable', () => {
    const filled = rect(W, H, 8, 8, 112, 112, [255, 255, 255, 255]);
    const built = buildItemSheet(sheetOra([layer('item_ball', filled)]), testSheet());
    expect(built.entry.status).toBe('broken');
    expect(built.files).toEqual({});
    expect(built.messages[0]!.text).toContain('fills its whole box');
  });

  it('refuses a sheet made for another layout, or with another canvas', () => {
    const stale = buildItemSheet(sheetOra([BALL()], { hash: 'ffff0000' }), testSheet());
    expect(stale.entry.status).toBe('broken');
    expect(stale.files).toEqual({});
    expect(stale.messages[0]!.text).toContain('out of date');
    expect(stale.messages[0]!.text).toContain('pnpm art:item-templates --refresh-guides');
    const resized = buildItemSheet(sheetOra([BALL()], { w: 300 }), testSheet());
    expect(resized.entry.status).toBe('broken');
    expect(resized.messages[0]!.text).toContain('The canvas is 300 x 128 but should be 256 x 128');
    const junk = buildItemSheet(new Uint8Array([1, 2, 3]), testSheet());
    expect(junk.entry.status).toBe('broken');
    expect(junk.messages[0]!.text).toContain("isn't a working ORA");
  });

  it('names layers it does not know, skips guides, and refuses two layers with one name', () => {
    const a = analyzeItems(
      sheetOra([BALL(), layer('item_bal', disc(64, 64, 10)), layer('scribble', disc(64, 64, 10))], {
        top: [layer('guide_sketch', disc(200, 64, 30))],
      }),
      testSheet(),
    );
    expect(levels(a.messages)).toEqual(['warning', 'warning', 'info']);
    expect(a.messages[0]!.text).toContain('Did you mean "item_ball"?');
    expect(a.messages[1]!.text).toContain('start with "guide"');
    expect([...a.items.keys()]).toEqual(['item_ball']);
    const twice = analyzeItems(sheetOra([BALL(), BALL()]), testSheet());
    expect(twice.messages[0]).toMatchObject({ level: 'error', layer: 'item_ball' });
    expect(twice.messages[0]!.text).toContain('two layers named "item_ball"');
  });

  it('flattens a group named for an item, and takes layers outside the items group', () => {
    const group: WriteNode = {
      name: 'item_ball',
      children: [
        layer('shade', disc(64, 64, 20, [128, 128, 128, 255]), { compositeOp: 'svg:multiply' }),
        layer('base', disc(64, 64, 40)),
      ],
    };
    const built = buildItemSheet(sheetOra([group], { top: [BRICK()] }), testSheet());
    expect(built.messages).toEqual([]);
    expect(built.entry.items).toEqual(['item_ball', 'item_brick']);
    const bad: WriteNode = {
      name: 'item_ball',
      children: [
        layer('glow', disc(64, 64, 20), { compositeOp: 'svg:screen' }),
        layer('base', disc(64, 64, 40)),
      ],
    };
    const refused = buildItemSheet(sheetOra([bad]), testSheet());
    expect(refused.entry.items).toEqual([]);
    expect(refused.messages[0]!.text).toContain('blend mode');
  });

  it('warns about a faded or blended item layer but still builds it', () => {
    const built = buildItemSheet(
      sheetOra([layer('item_ball', disc(64, 64, 40), { opacity: 0.5 }), BRICK()]),
      testSheet(),
    );
    expect(levels(built.messages)).toEqual(['warning']);
    expect(built.messages[0]!.text).toContain('50% opacity');
    expect(built.entry.items).toEqual(['item_ball', 'item_brick']);
  });
});

describe('item sheets: keeping the outline', () => {
  it('grows a shape by a square brush', () => {
    const bits = new Uint8Array(49);
    bits[3 * 7 + 3] = 1;
    const grown = dilate(bits, 7, 7, 2);
    expect(grown.reduce((a, b) => a + b, 0)).toBe(25);
    expect(grown[0]).toBe(0);
    expect(grown[1 * 7 + 1]).toBe(1);
    // At the edge it stops at the edge.
    const corner = new Uint8Array(49);
    corner[0] = 1;
    expect(dilate(corner, 7, 7, 2).reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('measures what strays outside the guide and what the painting leaves empty', () => {
    const guide = discMask(10);
    expect(outlineFit(guide, guide, 28, 28, 4)).toEqual({ spill: 0, gap: 0 });
    // A little bigger or smaller is inside the tolerance.
    expect(outlineFit(discMask(13), guide, 28, 28, 4)).toEqual({ spill: 0, gap: 0 });
    expect(outlineFit(discMask(7), guide, 28, 28, 4)).toEqual({ spill: 0, gap: 0 });
    // Much smaller: a ring of the guide is bare.
    const small = outlineFit(discMask(3), guide, 28, 28, 4);
    expect(small.spill).toBe(0);
    expect(small.gap).toBeGreaterThan(0.3);
    // A different shape: the corners of a square stick out past a small disc.
    const square = new Uint8Array(28 * 28).fill(1);
    const spilled = outlineFit(square, discMask(6), 28, 28, 4);
    expect(spilled.spill).toBeGreaterThan(0.3);
    expect(spilled.gap).toBe(0);
    // Nothing painted is nothing to complain about.
    expect(outlineFit(new Uint8Array(28 * 28), guide, 28, 28, 4)).toEqual({ spill: 0, gap: 1 });
  });

  it('reads a painting at game size: a pixel is on when most of it is painted', () => {
    const cell = { x: 8, y: 8, w: 112, h: 112 };
    // A 6 x 4 block of template pixels at the box corner: one and a half game pixels wide, one tall.
    const img = blank(6, 4);
    img.data.fill(255);
    const bits = maskOfCell({ img, x: 8, y: 8 }, cell, 4);
    expect([bits[0], bits[1], bits[2], bits[28]]).toEqual([1, 1, 0, 0]);
    // Faint paint does not count.
    img.data.fill(20);
    expect(maskOfCell({ img, x: 8, y: 8 }, cell, 4)[0]).toBe(0);
  });

  it('packs a shape into runs and back', () => {
    const bits = discMask(9);
    const mask = encodeMask(bits, 28, 28);
    expect(mask.runs).toMatch(/^\d+(,\d+)*$/);
    expect(mask.runs.length).toBeLessThan(400);
    expect(decodeMask(mask)).toEqual(bits);
    const empty = encodeMask(new Uint8Array(12), 4, 3);
    expect(empty).toEqual({ w: 4, h: 3, runs: '12' });
    expect(decodeMask(empty)).toEqual(new Uint8Array(12));
    const full = new Uint8Array(12).fill(1);
    expect(decodeMask(encodeMask(full, 4, 3))).toEqual(full);
  });

  it('passes a painting on the guide, and warns when it grows, shrinks, or changes shape', () => {
    // The guide is a disc 6 game pixels in radius: 24 on the sheet.
    const sheet = testSheet(true);
    const on = buildItemSheet(sheetOra([layer('item_ball', disc(64, 64, 24))]), sheet);
    expect(on.messages.filter((m) => m.level !== 'info')).toEqual([]);
    expect(on.fits.get('item_ball')).toEqual({ spill: 0, gap: 0 });
    // Up to 4 game pixels bigger is inside the tolerance.
    const snug = buildItemSheet(sheetOra([layer('item_ball', disc(64, 64, 40))]), sheet);
    expect(snug.messages.filter((m) => m.level !== 'info')).toEqual([]);
    // A thin feeler past the outline is free.
    const feeler = disc(64, 64, 24);
    for (let y = 20; y < 40; y++)
      for (let x = 62; x < 66; x++) feeler.data.set([0, 0, 0, 255], (y * W + x) * 4);
    const extra = buildItemSheet(sheetOra([layer('item_ball', feeler)]), sheet);
    expect(extra.fits.get('item_ball')!.spill).toBeGreaterThan(0);
    expect(extra.messages.filter((m) => m.level !== 'info')).toEqual([]);
    const big = buildItemSheet(sheetOra([layer('item_ball', disc(64, 64, 52))]), sheet);
    expect(big.messages[0]).toMatchObject({ level: 'warning', layer: 'item_ball' });
    expect(big.messages[0]!.text).toMatch(
      /strays from the guide's shape: \d+% of it is more than 4 game pixels/,
    );
    // It still builds: the outline is a warning, not an error.
    expect(big.entry.items).toEqual(['item_ball']);
    const tiny = buildItemSheet(sheetOra([layer('item_ball', disc(64, 64, 4))]), sheet);
    expect(tiny.messages[0]!.text).toMatch(/leaves \d+% of the guide's shape empty/);
    expect(tiny.entry.items).toEqual(['item_ball']);
  });
});

describe('item sheets: templates', () => {
  const guides = (sheet = testSheet()): ItemGuides => ({
    sheet,
    current: encodePng(disc(64, 64, 40)),
    boxes: encodePng(rect(W, H, 8, 8, 4, 4, [58, 123, 213, 255])),
    notes: encodePng(rect(W, H, 0, 0, 4, 4, [0, 0, 0, 255])),
  });

  it('makes a sheet with locked guides, the layout stamp, and an empty layer per item', () => {
    const bytes = buildItemTemplate(guides());
    const doc = readOra(bytes);
    expect([doc.w, doc.h]).toEqual([W, H]);
    expect(doc.root.children.map((n) => n.name)).toEqual(['guides', 'items']);
    const names = walk(doc.root).map((n) => n.node.name);
    expect(names).toEqual([
      'guides',
      'guide_notes',
      'guide_boxes',
      'guide_current',
      'guide_sheet_abc123',
      'items',
      'item_ball',
      'item_brick',
    ]);
    const all = walk(doc.root).map((n) => n.node);
    expect(all.find((n) => n.name === 'guides')!.attrs['edit-locked']).toBe('true');
    expect(all.find((n) => n.name === 'guide_current')!.opacity).toBeCloseTo(0.35);
    expect(all.find((n) => n.name === 'guide_sheet_abc123')!.visible).toBe(false);
    // A fresh template imports as "nothing drawn yet": the guides are not paint.
    const built = buildItemSheet(bytes, testSheet());
    expect(built.entry.status).toBe('empty');
    expect(levels(built.messages)).toEqual(['info']);
    expect(buildItemTemplate(guides())).toEqual(bytes);
  });

  it('refreshes the guides and keeps the paintings, moving each with its box', () => {
    const painted = sheetOra([BALL(), BRICK(), layer('guide_sketch', disc(30, 30, 5))]);
    const moved = testSheet();
    moved.sheetHash = 'def456';
    // The brick's box moved 8 px left and 4 down; a third item joined the sheet.
    moved.items[1] = {
      ...moved.items[1]!,
      cell: { x: 128, y: 12, w: 112, h: 112 },
      anchor: { x: 184, y: 68 },
    };
    moved.items.push({
      id: 'item_new',
      name: 'New',
      cell: { x: 244, y: 8, w: 8, h: 8 },
      anchor: { x: 248, y: 12 },
      body: { type: 'circle', r: 2 },
      guide: { x: 246, y: 10, w: 4, h: 4 },
    });
    const bytes = refreshItemGuides(painted, guides(moved), testSheet());
    const nodes = walk(readOra(bytes).root).map((n) => n.node);
    expect(nodes.map((n) => n.name)).toEqual([
      'guides',
      'guide_notes',
      'guide_boxes',
      'guide_current',
      'guide_sheet_def456',
      'items',
      'item_ball',
      'item_brick',
      'guide_sketch',
      'item_new',
    ]);
    const before = walk(readOra(painted).root).map((n) => n.node);
    const at = (list: typeof nodes, name: string): [number, number] => {
      const n = list.find((x) => x.name === name)!;
      return [n.x, n.y];
    };
    expect(at(nodes, 'item_ball')).toEqual(at(before, 'item_ball'));
    expect(at(nodes, 'item_brick')).toEqual([
      at(before, 'item_brick')[0] - 8,
      at(before, 'item_brick')[1] + 4,
    ]);
    // The refreshed sheet builds against the new layout with nothing to say but the new blank item.
    const built = buildItemSheet(bytes, moved);
    expect(built.entry.items).toEqual(['item_ball', 'item_brick']);
    expect(built.messages).toEqual([
      { level: 'info', text: 'Not painted yet, so the game draws it in code: item_new.' },
    ]);
    const json = JSON.parse(text(built.files['items/items_test_1@2x.json']!)) as AtlasJson;
    expect(json.frames.item_brick!.anchor.x).toBeCloseTo(0.5, 1);
    expect(json.frames.item_brick!.anchor.y).toBeCloseTo(0.5, 1);
  });

  it('never overwrites a sheet that is already there unless asked to refresh it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-item-tpl-'));
    try {
      expect(placeItemTemplate(guides(), { dir, refresh: false }).action).toBe('created');
      const ora = join(dir, 'items_test_1.ora');
      expect(JSON.parse(readFileSync(join(dir, 'items_test_1.rig.json'), 'utf8'))).toEqual(testSheet());
      writeFileSync(ora, sheetOra([BALL()]));
      const painted = readFileSync(ora);
      expect(placeItemTemplate(guides(), { dir, refresh: false }).action).toBe('kept');
      expect(readFileSync(ora)).toEqual(painted);
      expect(placeItemTemplate(guides(), { dir, refresh: true }).action).toBe('refreshed');
      expect(buildItemSheet(new Uint8Array(readFileSync(ora)), testSheet()).entry.items).toEqual([
        'item_ball',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('item sheets: a whole set', () => {
  const fixture = (id: string): [Uint8Array, ItemSheetFile] => [
    new Uint8Array(readFileSync(join(FIX, 'items', `${id}.ora`))),
    JSON.parse(readFileSync(join(FIX, 'items', `${id}.rig.json`), 'utf8')) as ItemSheetFile,
  ];

  it('builds the crude test sheets cleanly, with two items left for the code to draw', () => {
    const things = buildItemSheet(...fixture('items_things_1'));
    expect(things.entry.status).toBe('drawn');
    expect(things.entry.items).toEqual([
      'item_bottle_cap',
      'item_marble_blue',
      'item_marble_red',
      'item_pebble',
      'item_ruler_ramp',
      'item_rubber_ball',
    ]);
    expect(things.messages).toEqual([
      {
        level: 'info',
        text: 'Not painted yet, so the game draws them in code: item_cork, item_leaf_raft.',
      },
    ]);
    for (const id of ['items_food_1', 'items_hats_1']) {
      const built = buildItemSheet(...fixture(id));
      expect(built.messages, id).toEqual([]);
      expect(built.entry.items, id).toHaveLength(8);
      // The crude paint is the guide's own shape.
      for (const fit of built.fits.values()) expect(fit, id).toEqual({ spill: 0, gap: 0 });
    }
  });

  it('turns built sheets into a pack the running game can install', () => {
    const built = [buildItemSheet(...fixture('items_things_1')), buildItemSheet(...fixture('items_food_1'))];
    const pack = toItemPack(built);
    expect(pack.sheets.map((s) => s.id)).toEqual(['items_things_1', 'items_food_1']);
    expect(Object.keys(pack.pages).sort()).toEqual([
      'items/items_food_1@1x',
      'items/items_food_1@2x',
      'items/items_things_1@1x',
      'items/items_things_1@2x',
    ]);
    expect(pack.pages['items/items_food_1@2x']!.png).toMatch(/^data:image\/png;base64,/);
    expect(Object.keys(pack.pages['items/items_food_1@2x']!.json.frames)).toContain('item_berry_red');
  });

  it("builds a set's items into its own folder and manifest, beside its bugs", () => {
    const src = mkdtempSync(join(tmpdir(), 'bb-item-sets-'));
    try {
      const dir = join(src, 'sets/family');
      mkdirSync(join(dir, 'items'), { recursive: true });
      mkdirSync(join(dir, 'bugs'), { recursive: true });
      mkdirSync(join(src, 'sets/plain'), { recursive: true });
      writeFileSync(join(dir, 'set.json'), JSON.stringify({ name: 'Family drawing', credit: 'Test artist' }));
      writeFileSync(join(src, 'sets/plain/set.json'), JSON.stringify({ name: 'Plain', credit: 'Nobody' }));
      for (const ext of ['ora', 'rig.json']) {
        copyFileSync(join(FIX, `bug_ladybug_dot.${ext}`), join(dir, 'bugs', `bug_ladybug_dot.${ext}`));
        copyFileSync(join(FIX, 'items', `items_food_1.${ext}`), join(dir, 'items', `items_food_1.${ext}`));
      }
      // A sheet with no rig.json next to it is an error, not a crash.
      writeFileSync(join(dir, 'items', 'items_lost_1.ora'), sheetOra([BALL()]));
      const built = buildSets(src);
      const manifest = JSON.parse(text(built.files['sets/family/items/manifest.json']!)) as ItemManifest;
      expect(manifest.schema).toBe(1);
      expect(Object.keys(manifest.sheets)).toEqual(['items_food_1']);
      expect(manifest.sheets.items_food_1!.items).toHaveLength(8);
      expect(built.files['sets/family/items/items_food_1@1x.png']).toBeDefined();
      expect(built.files['sets/family/items/items_food_1@2x.json']).toBeDefined();
      // The bug manifest is as it was: items have their own.
      const bugs = JSON.parse(text(built.files['sets/family/manifest.json']!)) as { assets: object };
      expect(Object.keys(bugs.assets)).toEqual(['bug_ladybug_dot']);
      expect(Object.keys(bugs)).toEqual(['assets', 'schema']);
      expect(built.messages.get('family/items_food_1')).toEqual([]);
      expect(built.messages.get('family/items_lost_1')![0]).toMatchObject({ level: 'error' });
      // A set with no item sheets gets no items folder, and neither does the reference set here.
      expect(
        Object.keys(built.files).filter((f) => f.includes('items/') && !f.startsWith('sets/family/')),
      ).toEqual([]);
      expect(buildItems(join(src, 'sets/plain')).files).toEqual({});
      expect(buildSets(src).files).toEqual(built.files);
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });

  it('checks one file on its own: an item sheet, a bug, or the kit', () => {
    const [bytes, sheet] = fixture('items_things_1');
    const things = checkOne('items_things_1', bytes, sheet, true);
    expect(things.ok).toBe(true);
    expect(things.complete).toBe(false);
    expect(things.text).toContain('painted item_pebble  (outside the guide 0.0%, guide left empty 0.0%)');
    expect(things.text).toContain('blank   item_cork');
    expect(things.text).toContain('status=drawn items=6/8');
    expect(Object.keys(things.files).sort()).toEqual([
      'items/items_things_1@1x.json',
      'items/items_things_1@1x.png',
      'items/items_things_1@2x.json',
      'items/items_things_1@2x.png',
      'items_things_1-preview@1x.png',
      'items_things_1-preview@2x.png',
    ]);
    // The preview is the sheet at game size, on grass.
    const preview = decodePng(things.files['items_things_1-preview@1x.png']!);
    expect([preview.w, preview.h]).toEqual([sheet.canvas.w / 4, sheet.canvas.h / 4]);
    expect([...preview.data.subarray(0, 4)]).toEqual([156, 207, 122, 255]);
    const food = checkOne('items_food_1', ...fixture('items_food_1'));
    expect([food.ok, food.complete]).toEqual([true, true]);
    expect(food.files).toEqual({});
    // A sheet with a warning is not ok; one with an error names the item.
    const faded = checkOne(
      't',
      sheetOra([layer('item_ball', disc(64, 64, 40), { opacity: 0.5 })]),
      testSheet(),
    );
    expect([faded.ok, faded.complete]).toEqual([false, false]);
    const stray = disc(64, 64, 40);
    stray.data.set([0, 0, 0, 255], (60 * W + 200) * 4);
    const bad = checkOne('t', sheetOra([layer('item_ball', stray)]), testSheet());
    expect(bad.ok).toBe(false);
    expect(bad.text).toContain('ERROR   item_ball');
    // Bugs and the kit go through the same door.
    const rig = (id: string): RigFile =>
      JSON.parse(readFileSync(join(FIX, `${id}.rig.json`), 'utf8')) as RigFile;
    const dot = checkOne(
      'bug_ladybug_dot',
      new Uint8Array(readFileSync(join(FIX, 'bug_ladybug_dot.ora'))),
      rig('bug_ladybug_dot'),
    );
    expect(dot.ok).toBe(true);
    expect(dot.text).toContain('status=drawn parts=8/8');
    // The crude Dot has only her seven pink mouths, so she is not a finished bug.
    expect(dot.complete).toBe(false);
    expect(dot.text).toContain('face pieces not drawn in this file');
  });
});
