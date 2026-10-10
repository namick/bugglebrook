// The shapes of the item art files (docs/06-art-guide.md, B19), shared by the
// renderer and the Node scripts in scripts/art/. Type-only imports, so Node
// can load it directly.

import type { ArtMessage, AtlasJson } from './rigFile.ts';

/** Template pixels per game pixel: item sheets are painted at 4 times game size, like the bugs. */
export const ITEM_SCALE = 4;
/** Room around the code-drawn item inside its box, in template pixels. */
export const CELL_MARGIN = 32;
/** How far a painted item may stray from the guide's outline before a warning, in template pixels. */
export const OUTLINE_TOLERANCE = 16;
/** The share of a painted item (or of the guide's shape) that may lie past the tolerance. */
export const OUTLINE_SLACK = 0.03;
/** A painted layer covering more of its box than this is a filled background, not an item. */
export const MAX_CELL_COVER = 0.95;
/** Pixels with alpha above this count as drawn when comparing outlines. */
export const MASK_ALPHA = 32;

export interface XYWH {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A picture's shape as a bitmap at game size: runs of off and on pixels, row by row, starting with off. */
export interface ItemMask {
  w: number;
  h: number;
  /** Run lengths joined by commas. */
  runs: string;
}

/** One item's place on a sheet, in template pixels. */
export interface SheetItem {
  /** The item's ID: its paint layer has this name. */
  id: string;
  /** The item's name, for messages and labels. */
  name: string;
  /** Its box: the paint must stay inside. */
  cell: XYWH;
  /** The center of its physics body: where the game pins the picture. */
  anchor: { x: number; y: number };
  /** The physics body around the anchor: a circle, or a box (with its pieces when it is built from several). */
  body:
    | { type: 'circle'; r: number }
    | {
        type: 'box';
        w: number;
        h: number;
        parts?: { x: number; y: number; w: number; h: number; angle: number }[];
      };
  /** The code-drawn item's bounds. */
  guide: XYWH;
  /** The code-drawn item's shape inside the box, one bit per game pixel. Left out of test fixtures. */
  mask?: ItemMask;
}

/** `<sheet>.rig.json`, written by `pnpm art:item-templates` next to each sheet. Never edited by hand. */
export interface ItemSheetFile {
  schema: 1;
  /** The sheet's ID and file name, like `items_food_1`. */
  id: string;
  kind: 'item_sheet';
  title: string;
  canvas: { w: number; h: number };
  /** Template pixels per game pixel. */
  scale: number;
  /** A hash of the boxes, anchors, and bodies; sheets made for another hash are out of date. */
  sheetHash: string;
  items: SheetItem[];
}

/** One built sheet in a set's `items/manifest.json`. */
export interface ManifestItemSheet {
  id: string;
  kind: 'item_sheet';
  sourceHash: string;
  sheetHash: string;
  /** drawn: at least one item is usable. empty: nothing painted yet. broken: the file could not be used. */
  status: 'drawn' | 'empty' | 'broken';
  /** Atlas pages per scale, as paths next to the set's main manifest (`items/<sheet>@2x`). */
  pages: Record<'1' | '2', string[]>;
  /** The items painted on this sheet. Each has an atlas frame named by its ID. */
  items: string[];
  /** The importer's messages. */
  report: ArtMessage[];
}

/** `items/manifest.json`: a set's item sheets, written by `pnpm art:build`. */
export interface ItemManifest {
  schema: 1;
  sheets: Record<string, ManifestItemSheet>;
}

/** Built item art to install at run time (tests, tours): sheet entries and each page's picture and JSON. */
export interface ItemPack {
  sheets: ManifestItemSheet[];
  pages: Record<string, { png: string; json: AtlasJson }>;
}

/** Pack a bitmap (row by row, 1 is drawn) into runs. */
export function encodeMask(bits: Uint8Array, w: number, h: number): ItemMask {
  const runs: number[] = [];
  let on = 0;
  let run = 0;
  for (let i = 0; i < w * h; i++) {
    const b = bits[i] ? 1 : 0;
    if (b === on) run++;
    else {
      runs.push(run);
      on = b;
      run = 1;
    }
  }
  runs.push(run);
  return { w, h, runs: runs.join(',') };
}

/** The bitmap a mask holds. */
export function decodeMask(mask: ItemMask): Uint8Array {
  const bits = new Uint8Array(mask.w * mask.h);
  let i = 0;
  let on = 0;
  for (const part of mask.runs.split(',')) {
    const n = Number(part);
    if (on) bits.fill(1, i, i + n);
    i += n;
    on = 1 - on;
  }
  return bits;
}
