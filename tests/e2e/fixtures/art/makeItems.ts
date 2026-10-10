// Makes the crude test item sheets: each painted item is the code-drawn
// item's own shape, filled flat in a loud color with a dark edge, so a test
// (or a person) can tell at a glance that an item is drawn from a painting.
// Test fixtures only, never real art.
//
//   pnpm art:item-templates --out tests/e2e/fixtures/art/items --refresh-guides items_things_1 items_food_1 items_hats_1
//   node tests/e2e/fixtures/art/makeItems.ts
//
// Rerun both when an item on these sheets changes size or shape (a unit test
// checks). The first writes each sheet's rig.json; the second paints over
// the template, guides and all, so the files stay small.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WriteNode } from '../../../../scripts/art/ora.ts';
import { writeOra } from '../../../../scripts/art/ora.ts';
import type { Rgba } from '../../../../scripts/art/png.ts';
import { blank, encodePng } from '../../../../scripts/art/png.ts';
import type { ItemSheetFile, SheetItem } from '../../../../src/renderer/src/art/itemSheet.ts';
import { decodeMask } from '../../../../src/renderer/src/art/itemSheet.ts';

const DIR = join(import.meta.dirname, 'items');

/** Items left unpainted on purpose, so tests can watch them fall back to code. */
export const BLANK = ['item_cork', 'item_leaf_raft'];

/** Each sheet's loud fill. */
const FILLS: Record<string, [number, number, number]> = {
  items_things_1: [255, 43, 214],
  items_food_1: [255, 140, 0],
  items_hats_1: [0, 200, 255],
};
const EDGE = [43, 29, 46];
/** The dark edge's width, in game pixels. */
const EDGE_PX = 3;

/** One item's layer: its guide shape at sheet scale, cropped tight with offsets the way Krita saves it. */
function layer(item: SheetItem, scale: number, fill: readonly number[]): WriteNode {
  const m = item.mask!;
  const bits = decodeMask(m);
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < m.w && y < m.h && !!bits[y * m.w + x];
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (on(x, y)) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) throw new Error(`${item.id} has an empty guide shape`);
  const img: Rgba = blank((x1 - x0 + 1) * scale, (y1 - y0 + 1) * scale);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!on(x, y)) continue;
      let edge = false;
      for (let dy = -EDGE_PX; dy <= EDGE_PX && !edge; dy++)
        for (let dx = -EDGE_PX; dx <= EDGE_PX && !edge; dx++) edge = !on(x + dx, y + dy);
      const rgba = [...(edge ? EDGE : fill), 255];
      for (let j = 0; j < scale; j++)
        for (let i = 0; i < scale; i++)
          img.data.set(rgba, (((y - y0) * scale + j) * img.w + (x - x0) * scale + i) * 4);
    }
  return { name: item.id, png: encodePng(img), x: item.cell.x + x0 * scale, y: item.cell.y + y0 * scale };
}

for (const f of readdirSync(DIR).filter((n) => n.endsWith('.rig.json'))) {
  const sheet = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as ItemSheetFile;
  const fill = FILLS[sheet.id];
  if (!fill) throw new Error(`No crude color for ${sheet.id}`);
  const { w, h } = sheet.canvas;
  const empty = encodePng(blank(1, 1));
  const stack: WriteNode[] = [
    {
      name: 'guides',
      locked: true,
      children: [{ name: `guide_sheet_${sheet.sheetHash}`, png: empty, visible: false }],
    },
    {
      name: 'items',
      children: sheet.items.map((i) =>
        BLANK.includes(i.id) ? { name: i.id, png: empty } : layer(i, sheet.scale, fill),
      ),
    },
  ];
  writeFileSync(
    join(DIR, `${sheet.id}.ora`),
    writeOra({ w, h, stack, merged: encodePng(blank(8, 8)), thumbnail: encodePng(blank(8, 8)) }),
  );
}
console.log('Wrote the crude test item sheets to tests/e2e/fixtures/art/items/.');
