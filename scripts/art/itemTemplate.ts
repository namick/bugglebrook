// Item sheet templates: turns the guide pictures the game draws (src/renderer/
// src/art/itemTemplate.ts) into a layered .ora with one empty paint layer per
// item, plus its rig.json. Run with `pnpm art:item-templates`
// (scripts/art/itemTemplates.ts), which drives the real app.
// docs/06-art-guide.md, B21.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ItemSheetFile } from '../../src/renderer/src/art/itemSheet.ts';
import { stableJson } from './build.ts';
import { composite, fitWithin } from './image.ts';
import type { OraNode, WriteNode } from './ora.ts';
import { readOra, writeOra } from './ora.ts';
import type { Rgba } from './png.ts';
import { blank, decodePng, encodePng } from './png.ts';
import { CURRENT_OPACITY, emptyPng, keep } from './template.ts';

/** The guide pictures for one sheet, as PNG bytes the size of the canvas. */
export interface ItemGuides {
  sheet: ItemSheetFile;
  current: Uint8Array;
  boxes: Uint8Array;
  notes: Uint8Array;
}

/** Re-encode with our encoder, so the bytes don't depend on the browser's PNG settings. */
const normalize = (png: Uint8Array): Uint8Array => encodePng(decodePng(png));

/** The locked guides group, top first. The hidden last layer says which layout the sheet was made for. */
function guideGroup(g: ItemGuides): WriteNode {
  return {
    name: 'guides',
    locked: true,
    children: [
      { name: 'guide_notes', png: normalize(g.notes) },
      { name: 'guide_boxes', png: normalize(g.boxes) },
      { name: 'guide_current', png: normalize(g.current), opacity: CURRENT_OPACITY },
      { name: `guide_sheet_${g.sheet.sheetHash}`, png: emptyPng(), visible: false },
    ],
  };
}

/** What the file looks like flattened: the guides (paint layers start empty). */
function merged(g: ItemGuides): { merged: Uint8Array; thumbnail: Uint8Array } {
  const { w, h } = g.sheet.canvas;
  const out: Rgba = blank(w, h);
  const layers: [Uint8Array, number][] = [
    [g.current, CURRENT_OPACITY],
    [g.boxes, 1],
    [g.notes, 1],
  ];
  for (const [png, opacity] of layers) composite(out, decodePng(png), 0, 0, opacity);
  return { merged: encodePng(out), thumbnail: encodePng(fitWithin(out, 256)) };
}

/** A fresh sheet: the guides on top, then an `items` group with one empty layer per item. */
export function buildItemTemplate(g: ItemGuides): Uint8Array {
  const stack: WriteNode[] = [
    guideGroup(g),
    { name: 'items', children: g.sheet.items.map((i) => ({ name: i.id, png: emptyPng() })) },
  ];
  return writeOra({ w: g.sheet.canvas.w, h: g.sheet.canvas.h, stack, ...merged(g) });
}

/**
 * Swap in new guides and keep every painting. When an item's box moved since
 * the sheet was made (`old` is the rig.json it was painted against), its
 * layer moves with it; items new to the sheet get an empty layer.
 */
export function refreshItemGuides(
  existing: Uint8Array,
  g: ItemGuides,
  old: ItemSheetFile | null,
): Uint8Array {
  const doc = readOra(existing);
  const was = new Map((old?.items ?? []).map((i) => [i.id, i.anchor]));
  const now = new Map(g.sheet.items.map((i) => [i.id, i.anchor]));
  const names = new Set<string>();
  // A painting moves as one: a layer by its own offset, a group by every layer inside it.
  const moveBy = (n: WriteNode, dx: number, dy: number): WriteNode =>
    'children' in n
      ? { ...n, children: n.children.map((c) => moveBy(c, dx, dy)) }
      : { ...n, x: (n.x ?? 0) + dx, y: (n.y ?? 0) + dy };
  const place = (n: OraNode): WriteNode => {
    names.add(n.name);
    const a = was.get(n.name);
    const b = now.get(n.name);
    const kept = keep(n, doc.files);
    return a && b ? moveBy(kept, b.x - a.x, b.y - a.y) : kept;
  };
  const stack: WriteNode[] = doc.root.children
    .filter((n) => n.name !== 'guides')
    .map((n) =>
      n.kind === 'stack' && n.name === 'items'
        ? { ...keep({ ...n, children: [] }, doc.files), children: n.children.map(place) }
        : place(n),
    );
  const fresh: WriteNode[] = g.sheet.items
    .filter((i) => !names.has(i.id))
    .map((i) => ({ name: i.id, png: emptyPng() }));
  const group = stack.find((n) => n.name === 'items' && 'children' in n);
  if (group && 'children' in group) group.children.push(...fresh);
  else if (fresh.length) stack.push({ name: 'items', children: fresh });
  stack.unshift(guideGroup(g));
  return writeOra({ w: g.sheet.canvas.w, h: g.sheet.canvas.h, stack, ...merged(g) });
}

export interface PlacedSheet {
  id: string;
  /** Where the .ora went. */
  ora: string;
  action: 'created' | 'refreshed' | 'kept';
}

/**
 * Write a sheet into a folder. An existing sheet is never overwritten: with
 * `refresh` its guides are swapped in place and its paintings kept, otherwise
 * it is left alone.
 */
export function placeItemTemplate(g: ItemGuides, opts: { dir: string; refresh: boolean }): PlacedSheet {
  const ora = join(opts.dir, `${g.sheet.id}.ora`);
  const rig = join(opts.dir, `${g.sheet.id}.rig.json`);
  const rigJson = new TextEncoder().encode(stableJson(g.sheet));
  if (!existsSync(ora)) {
    mkdirSync(opts.dir, { recursive: true });
    writeFileSync(ora, buildItemTemplate(g));
    writeFileSync(rig, rigJson);
    return { id: g.sheet.id, ora, action: 'created' };
  }
  if (!opts.refresh) return { id: g.sheet.id, ora, action: 'kept' };
  const old = existsSync(rig) ? (JSON.parse(readFileSync(rig, 'utf8')) as ItemSheetFile) : null;
  writeFileSync(ora, refreshItemGuides(new Uint8Array(readFileSync(ora)), g, old));
  writeFileSync(rig, rigJson);
  return { id: g.sheet.id, ora, action: 'refreshed' };
}
