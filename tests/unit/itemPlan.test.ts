import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildItemSheet } from '../../scripts/art/items.ts';
import { PIXELS_PER_METER as PPM } from '../../src/game/constants';
import { BUGS, CONTENT } from '../../src/game/data';
import type { ItemDef } from '../../src/game/data/types';
import type { ItemSheetFile } from '../../src/renderer/src/art/itemSheet';
import { CELL_MARGIN, ITEM_SCALE } from '../../src/renderer/src/art/itemSheet';
import {
  CODE_DRAWN,
  SHEET_MAX,
  layoutSheet,
  paintable,
  planSheets,
  sheetGroup,
  sheetOf,
} from '../../src/renderer/src/art/itemSheets';
import { itemSheetFile, itemSheetPlans, measureItem } from '../../src/renderer/src/art/itemTemplate';

// Which items a set may paint and where they sit on their sheets
// (docs/06-art-guide.md, B21), checked against every real item, and the
// committed sheets checked against that layout.

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const ITEMS = CONTENT.items.all;
const item = (id: string): ItemDef => CONTENT.items.get(id);

const FIXTURE_SHEETS = readdirSync(join(FIX, 'items'))
  .filter((f) => f.endsWith('.ora'))
  .map((f) => f.slice(0, -4))
  .sort();

describe('item sheets: what a set may paint', () => {
  it('gives every item one place on one sheet, or a reason it stays code-drawn', () => {
    const plans = planSheets(ITEMS);
    const placed = plans.flatMap((p) => p.items.map((d) => d.id));
    expect(new Set(placed).size).toBe(placed.length);
    for (const def of ITEMS) {
      if (paintable(def)) expect(placed, def.id).toContain(def.id);
      else {
        expect(placed, def.id).not.toContain(def.id);
        expect(CODE_DRAWN[def.art], def.id).toMatch(/\.$/);
      }
    }
    expect(placed).toHaveLength(ITEMS.filter(paintable).length);
    // Every exclusion names an art key the game really has.
    for (const key of Object.keys(CODE_DRAWN))
      expect(
        ITEMS.some((d) => d.art === key),
        key,
      ).toBe(true);
    expect(Object.keys(CODE_DRAWN).sort()).toEqual([
      'lattice',
      'paper_boat',
      'pinwheel',
      'potion',
      'spring',
      'twig',
    ]);
    expect(ITEMS.filter((d) => !paintable(d)).map((d) => d.id)).toEqual(
      expect.arrayContaining(['item_spring_coil', 'item_twig', 'item_paper_boat', 'item_pinwheel']),
    );
  });

  it('names sheets by group and number, a few items each, never like a bug file', () => {
    const plans = planSheets(ITEMS);
    const ids = plans.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of plans) {
      expect(p.id).toMatch(/^items_(things|food|toys|music|hats|worn)_[1-9]\d*$/);
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.items.length).toBeLessThanOrEqual(SHEET_MAX);
      for (const d of p.items) expect(sheetGroup(d), d.id).toBe(p.group);
      expect(BUGS.has(p.id)).toBe(false);
    }
    expect(sheetOf('item_pebble', ITEMS)).toBe('items_things_1');
    expect(sheetOf('item_berry_red', ITEMS)).toBe('items_food_1');
    expect(sheetOf('item_hat_thimble', ITEMS)).toBe('items_hats_1');
    expect(sheetOf('item_acc_monocle', ITEMS)).toMatch(/^items_worn_/);
    expect(sheetOf('item_inst_comb_kazoo', ITEMS)).toMatch(/^items_music_/);
    expect(sheetOf('item_popsicle_seesaw', ITEMS)).toMatch(/^items_toys_/);
    expect(sheetOf('item_spring_coil', ITEMS)).toBeNull();
    // Items that share an art key and differ by color each get a layer of their own.
    for (const id of ['item_marble_blue', 'item_marble_red', 'item_paint_red', 'item_paint_blue'])
      expect(sheetOf(id, ITEMS), id).not.toBeNull();
  });

  it('keeps earlier sheets as they are when the game gains an item', () => {
    const before = planSheets(ITEMS);
    const extra: ItemDef = { ...item('item_pebble'), id: 'item_new_rock' };
    const after = planSheets([...ITEMS, extra]);
    const things = (plans: typeof before): string[][] =>
      plans.filter((p) => p.group === 'things').map((p) => p.items.map((d) => d.id));
    const a = things(before);
    const b = things(after);
    expect(b.slice(0, a.length - 1)).toEqual(a.slice(0, -1));
    expect(b.flat()).toEqual([...a.flat(), 'item_new_rock']);
    expect(after.filter((p) => p.group !== 'things')).toEqual(before.filter((p) => p.group !== 'things'));
  });

  it('lays every sheet out in boxes that hold the code-drawn item with room to spare', () => {
    let area2x = 0;
    for (const plan of itemSheetPlans()) {
      const sheet = itemSheetFile(plan.id);
      expect(sheet.kind).toBe('item_sheet');
      expect(sheet.scale).toBe(ITEM_SCALE);
      expect(sheet.items.map((i) => i.id)).toEqual(plan.items.map((d) => d.id));
      expect(sheet.canvas.w % 64).toBe(0);
      expect(sheet.canvas.h % 64).toBe(0);
      expect(sheet.canvas.w, sheet.id).toBeLessThanOrEqual(1856);
      expect(sheet.canvas.h, sheet.id).toBeLessThanOrEqual(2560);
      sheet.items.forEach((it, i) => {
        const c = it.cell;
        for (const v of [c.x, c.y, c.w, c.h, it.anchor.x, it.anchor.y]) expect(v % 8, it.id).toBe(0);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w, it.id).toBeLessThanOrEqual(sheet.canvas.w);
        expect(c.y + c.h, it.id).toBeLessThanOrEqual(sheet.canvas.h);
        // The drawing and the body both fit, with the margin around them.
        const def = item(it.id);
        const b = measureItem(def);
        const s = def.shape;
        const hw = (s.type === 'circle' ? s.radius : s.width / 2) * PPM;
        const hh = (s.type === 'circle' ? s.radius : s.height / 2) * PPM;
        const S = ITEM_SCALE;
        expect(it.anchor.x - c.x, it.id).toBeGreaterThanOrEqual(Math.max(-b.x0, hw) * S + CELL_MARGIN);
        expect(c.x + c.w - it.anchor.x, it.id).toBeGreaterThanOrEqual(Math.max(b.x1, hw) * S + CELL_MARGIN);
        expect(it.anchor.y - c.y, it.id).toBeGreaterThanOrEqual(Math.max(-b.y0, hh) * S + CELL_MARGIN);
        expect(c.y + c.h - it.anchor.y, it.id).toBeGreaterThanOrEqual(Math.max(b.y1, hh) * S + CELL_MARGIN);
        expect(it.guide.x).toBeGreaterThanOrEqual(c.x);
        expect(it.guide.y + it.guide.h).toBeLessThanOrEqual(c.y + c.h);
        // No box touches another.
        for (const other of sheet.items.slice(i + 1)) {
          const o = other.cell;
          const apart = c.x + c.w <= o.x || o.x + o.w <= c.x || c.y + c.h <= o.y || o.y + o.h <= c.y;
          expect(apart, `${it.id} and ${other.id}`).toBe(true);
        }
        // Even at 2x, one item fits an atlas page.
        expect(Math.max(c.w, c.h) / 2, it.id).toBeLessThan(2040);
        area2x += (c.w / 2) * (c.h / 2);
      });
    }
    // A whole set of items at 2x stays about the size of the bug cast's pages.
    expect(area2x / 1e6).toBeLessThan(6);
  });

  it('stamps a sheet with a hash of its layout', () => {
    const plan = itemSheetPlans().find((p) => p.id === 'items_things_1')!;
    const a = layoutSheet(plan, measureItem);
    expect(a.sheetHash).toMatch(/^[0-9a-f]{16}$/);
    expect(layoutSheet(plan, measureItem).sheetHash).toBe(a.sheetHash);
    // An item drawn bigger moves the boxes, and the hash with them.
    const grown = layoutSheet(plan, (def) => {
      const b = measureItem(def);
      return def.id === 'item_pebble' ? { ...b, x1: b.x1 + 20 } : b;
    });
    expect(grown.sheetHash).not.toBe(a.sheetHash);
    // So does a body of another size.
    const fat = { ...plan, items: plan.items.map((d) => (d.id === 'item_cork' ? { ...d, density: 9 } : d)) };
    expect(layoutSheet(fat, measureItem).sheetHash).toBe(a.sheetHash);
    const wide = {
      ...plan,
      items: plan.items.map((d) =>
        d.id === 'item_marble_blue' ? { ...d, shape: { type: 'circle' as const, radius: 0.2 } } : d,
      ),
    };
    expect(layoutSheet(wide, measureItem).sheetHash).not.toBe(a.sheetHash);
  });

  it("has crude test sheets that match the game's items now (see makeItems.ts if not)", () => {
    expect(FIXTURE_SHEETS).toEqual(['items_food_1', 'items_hats_1', 'items_things_1']);
    for (const id of FIXTURE_SHEETS) {
      const fixture = JSON.parse(readFileSync(join(FIX, 'items', `${id}.rig.json`), 'utf8')) as ItemSheetFile;
      const now = itemSheetFile(id);
      expect(fixture.sheetHash, id).toBe(now.sheetHash);
      // The generator's file is the same layout, plus each item's shape.
      expect({ ...fixture, items: fixture.items.map(({ mask: _mask, ...rest }) => rest) }, id).toEqual(now);
      for (const it of fixture.items) {
        expect(it.mask!.w, it.id).toBe(it.cell.w / ITEM_SCALE);
        expect(it.mask!.h, it.id).toBe(it.cell.h / ITEM_SCALE);
      }
    }
  });
});

/** Every set's source folder that has item sheets, by set ID. */
function setsWithItems(): [string, string][] {
  const src = join(ROOT, 'art/src');
  const dirs: [string, string][] = [['reference', src]];
  if (existsSync(join(src, 'sets')))
    for (const id of readdirSync(join(src, 'sets')).sort()) dirs.push([id, join(src, 'sets', id)]);
  return dirs.filter(([, dir]) => existsSync(join(dir, 'items')));
}

/**
 * Sets whose items are finished: every one of the paintable items painted,
 * and not a message from the importer. Add a set's ID here when it gets there.
 */
const COMPLETE_ITEM_SETS: string[] = [];

describe('committed item sheets', () => {
  it("match the game's items now (run pnpm art:item-templates --set <id> --refresh-guides if not)", () => {
    for (const [set, dir] of setsWithItems())
      for (const f of readdirSync(join(dir, 'items')).filter((n) => n.endsWith('.rig.json'))) {
        const sheet = JSON.parse(readFileSync(join(dir, 'items', f), 'utf8')) as ItemSheetFile;
        expect(
          itemSheetPlans().map((p) => p.id),
          `${set}/${f}`,
        ).toContain(sheet.id);
        expect(sheet.sheetHash, `${set}/${f}`).toBe(itemSheetFile(sheet.id).sheetHash);
      }
  });

  it('build without errors, and a finished set has every item painted and nothing to report', () => {
    for (const id of COMPLETE_ITEM_SETS) expect(setsWithItems().map(([s]) => s)).toContain(id);
    for (const [set, dir] of setsWithItems()) {
      const painted: string[] = [];
      for (const f of readdirSync(join(dir, 'items')).filter((n) => n.endsWith('.ora'))) {
        const id = f.slice(0, -4);
        const sheet = JSON.parse(readFileSync(join(dir, 'items', `${id}.rig.json`), 'utf8')) as ItemSheetFile;
        const built = buildItemSheet(new Uint8Array(readFileSync(join(dir, 'items', f))), sheet);
        expect(
          built.messages.filter((m) => m.level === 'error'),
          `${set}/${f}`,
        ).toEqual([]);
        if (COMPLETE_ITEM_SETS.includes(set)) expect(built.messages, `${set}/${f}`).toEqual([]);
        painted.push(...built.entry.items);
      }
      if (COMPLETE_ITEM_SETS.includes(set))
        expect(painted.sort(), set).toEqual(
          ITEMS.filter(paintable)
            .map((d) => d.id)
            .sort(),
        );
    }
  }, 120_000);
});
