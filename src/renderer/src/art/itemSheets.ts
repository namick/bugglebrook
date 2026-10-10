import { PIXELS_PER_METER } from '../../../game/constants';
import type { ItemArt as ItemArtKey, ItemDef } from '../../../game/data/types';
import type { ItemSheetFile, SheetItem } from './itemSheet';
import { CELL_MARGIN, ITEM_SCALE } from './itemSheet';
import { hashString } from './rigData';

/**
 * Which items an art set may paint, how they are grouped into sheets, and
 * where each sits on its sheet (docs/06-art-guide.md, B19). Pure: the
 * measuring and drawing that need Pixi are in `itemTemplate.ts`.
 */

/**
 * Items the game always draws in code, by art key, and why. Each has a moving
 * part or a look that changes with the sim, which one flat picture cannot show.
 */
export const CODE_DRAWN: Readonly<Partial<Record<ItemArtKey, string>>> = {
  spring: 'The coil is redrawn every frame as it squashes and springs back.',
  pinwheel: 'The wheel is a second drawing that turns on the stick.',
  potion: 'The liquid is recolored for the brew inside, and all 34 bottles share one drawing.',
  paper_boat: 'It is redrawn as it soaks, sagging until it sinks.',
  twig: "It uses the `stick` part of Twig's own file, so a disguised Twig matches the twigs around him.",
  lattice:
    'With its vines it is 7 m across, a barrier the size of a fixture. Its picture alone would need more texture than every other item together.',
};

/** True when a set may paint this item. */
export const paintable = (def: Pick<ItemDef, 'art'>): boolean => !(def.art in CODE_DRAWN);

/** Where an item's picture comes from. */
export type ItemArtChoice = 'sheet' | 'twig' | 'code';

/**
 * Pick an item's picture: the selected set's painting when it has one,
 * Twig's stick for the twig, and the code drawing for everything else.
 */
export function chooseItemArt(
  def: Pick<ItemDef, 'id' | 'art'>,
  have: { mode: 'drawn' | 'code'; painted: (itemId: string) => boolean; twigDrawn: boolean },
): ItemArtChoice {
  if (have.mode === 'code') return 'code';
  if (def.art === 'twig') return have.twigDrawn ? 'twig' : 'code';
  if (!paintable(def)) return 'code';
  return have.painted(def.id) ? 'sheet' : 'code';
}

/** The sheet groups, in file order. */
export const SHEET_GROUPS = ['things', 'food', 'toys', 'music', 'hats', 'worn'] as const;
export type SheetGroup = (typeof SHEET_GROUPS)[number];

/** At most this many items share a sheet. */
export const SHEET_MAX = 8;
/** A sheet also ends once its items' bodies, with their margins, pass this many template pixels. */
export const SHEET_AREA = 1_500_000;

/** The group an item is painted with. */
export function sheetGroup(def: ItemDef): SheetGroup {
  if (def.wear === 'head') return 'hats';
  if (def.wear) return 'worn';
  if (def.toy === 'instrument' || def.note !== undefined) return 'music';
  if (def.toy) return 'toys';
  if (def.adverts.some((a) => a.action === 'eat')) return 'food';
  return 'things';
}

export interface SheetPlan {
  /** The sheet's ID and file name, like `items_food_1`. */
  id: string;
  group: SheetGroup;
  items: ItemDef[];
}

/** Roughly how much of a sheet an item takes: its body with the margin around it, in template pixels. */
function footprint(def: ItemDef): number {
  const k = PIXELS_PER_METER * ITEM_SCALE;
  const s = def.shape;
  const w = (s.type === 'circle' ? s.radius * 2 : s.width) * k + CELL_MARGIN * 2;
  const h = (s.type === 'circle' ? s.radius * 2 : s.height) * k + CELL_MARGIN * 2;
  return w * h;
}

/**
 * Every paintable item, split into sheets: by group, then in registry order,
 * up to eight to a sheet (fewer when they are big). Adding an item to the
 * game puts it at the end of its group, so earlier sheets keep their items.
 */
export function planSheets(defs: readonly ItemDef[]): SheetPlan[] {
  const plans: SheetPlan[] = [];
  for (const group of SHEET_GROUPS) {
    let n = 0;
    let open: SheetPlan | null = null;
    let area = 0;
    for (const def of defs) {
      if (!paintable(def) || sheetGroup(def) !== group) continue;
      const a = footprint(def);
      if (!open || open.items.length >= SHEET_MAX || area + a > SHEET_AREA) {
        open = { id: `items_${group}_${++n}`, group, items: [] };
        plans.push(open);
        area = 0;
      }
      open.items.push(def);
      area += a;
    }
  }
  return plans;
}

/** The sheet an item is painted on, or null when it is always code-drawn. */
export function sheetOf(itemId: string, defs: readonly ItemDef[]): string | null {
  return planSheets(defs).find((p) => p.items.some((d) => d.id === itemId))?.id ?? null;
}

/** A drawing's bounds in game pixels from the body's center. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A sheet is at least this wide, in template pixels. */
export const SHEET_W = 1600;
/** Space between boxes and around the edge. */
export const GAP = 32;
/** Room above each box for its name. */
export const LABEL_H = 40;
/** The band of notes across the top. */
export const HEAD_H = 104;

const up = (v: number, step: number): number => Math.ceil(v / step) * step;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

function bodyOf(def: ItemDef): SheetItem['body'] {
  const k = PIXELS_PER_METER * ITEM_SCALE;
  const s = def.shape;
  if (s.type === 'circle') return { type: 'circle', r: r3(s.radius * k) };
  return {
    type: 'box',
    w: r3(s.width * k),
    h: r3(s.height * k),
    ...(s.parts
      ? {
          parts: s.parts.map((p) => ({
            x: r3(p.x * k),
            y: r3(p.y * k),
            w: r3(p.width * k),
            h: r3(p.height * k),
            angle: r3(p.angle),
          })),
        }
      : {}),
  };
}

/**
 * Lay a sheet out: each item gets a box around its code-drawn bounds (and
 * its body) with `CELL_MARGIN` to spare, placed left to right in rows. Boxes
 * and anchors land on multiples of 8 template pixels, so they are whole game
 * pixels at every scale.
 */
export function layoutSheet(plan: SheetPlan, measure: (def: ItemDef) => Bounds): ItemSheetFile {
  const S = ITEM_SCALE;
  const k = PIXELS_PER_METER;
  const boxes = plan.items.map((def) => {
    const b = measure(def);
    const s = def.shape;
    const hw = (s.type === 'circle' ? s.radius : s.width / 2) * k;
    const hh = (s.type === 'circle' ? s.radius : s.height / 2) * k;
    const left = up(Math.max(-b.x0, hw) * S + CELL_MARGIN, 8);
    const right = up(Math.max(b.x1, hw) * S + CELL_MARGIN, 8);
    const top = up(Math.max(-b.y0, hh) * S + CELL_MARGIN, 8);
    const bottom = up(Math.max(b.y1, hh) * S + CELL_MARGIN, 8);
    return { def, b, left, top, w: left + right, h: top + bottom };
  });
  const width = Math.max(SHEET_W, up(Math.max(...boxes.map((c) => c.w)) + GAP * 2, 64));
  const items: SheetItem[] = [];
  let x = GAP;
  let y = HEAD_H + LABEL_H;
  let rowH = 0;
  for (const c of boxes) {
    if (x > GAP && x + c.w + GAP > width) {
      x = GAP;
      y += rowH + GAP + LABEL_H;
      rowH = 0;
    }
    const anchor = { x: x + c.left, y: y + c.top };
    items.push({
      id: c.def.id,
      name: c.def.name,
      cell: { x, y, w: c.w, h: c.h },
      anchor,
      body: bodyOf(c.def),
      guide: {
        x: Math.floor(anchor.x + c.b.x0 * S),
        y: Math.floor(anchor.y + c.b.y0 * S),
        w: Math.ceil((c.b.x1 - c.b.x0) * S),
        h: Math.ceil((c.b.y1 - c.b.y0) * S),
      },
    });
    x += c.w + GAP;
    rowH = Math.max(rowH, c.h);
  }
  const canvas = { w: width, h: up(y + rowH + GAP, 64) };
  return {
    schema: 1,
    id: plan.id,
    kind: 'item_sheet',
    title: `Items: ${plan.group} ${plan.id.split('_').pop()} (${plan.id})`,
    canvas,
    scale: S,
    sheetHash: sheetHashOf(canvas, items),
    items,
  };
}

/**
 * The hash of a sheet's layout: which items it holds, their boxes, anchors,
 * and bodies. When an item changes size or a box moves, the hash changes and
 * sheets made for the old one are out of date.
 */
export function sheetHashOf(canvas: { w: number; h: number }, items: readonly SheetItem[]): string {
  return hashString(
    JSON.stringify([
      ITEM_SCALE,
      canvas.w,
      canvas.h,
      items.map((i) => [i.id, i.cell.x, i.cell.y, i.cell.w, i.cell.h, i.anchor.x, i.anchor.y, i.body]),
    ]),
  );
}
