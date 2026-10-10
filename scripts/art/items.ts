// Item art: turns a set's item sheets (art/src/.../items/*.ora, one paint
// layer per item) into atlas pages and `items/manifest.json`. Each item is on
// its own: one with a problem falls back to the code drawing and the rest of
// its sheet still builds. docs/06-art-guide.md, B19.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ItemManifest,
  ItemPack,
  ItemSheetFile,
  ManifestItemSheet,
  SheetItem,
} from '../../src/renderer/src/art/itemSheet.ts';
import {
  MASK_ALPHA,
  MAX_CELL_COVER,
  OUTLINE_SLACK,
  OUTLINE_TOLERANCE,
  decodeMask,
} from '../../src/renderer/src/art/itemSheet.ts';
import type { ArtMessage, AtlasFrame, AtlasJson } from '../../src/renderer/src/art/rigFile.ts';
import type { Piece, Source } from './build.ts';
import { cut, stableJson } from './build.ts';
import { alphaBounds, bleed, countOpaque, crop, halve } from './image.ts';
import type { OraNode, OraStack } from './ora.ts';
import { OraError, mimetypeProblem, readOra } from './ora.ts';
import { pack } from './pack.ts';
import type { Rgba } from './png.ts';
import { encodePng } from './png.ts';
import type { PartPixels } from './validate.ts';
import { MAX_BYTES, didYouMean, flatten, isGuide } from './validate.ts';

const PAD = 2;
const MAX_PAGE = 2048;
const STAMP = /^guide_sheet_([0-9a-f]+)$/;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** How a painted item sits against the guide's shape. */
export interface OutlineFit {
  /** The share of the painting lying more than the tolerance outside the guide's shape. */
  spill: number;
  /** The share of the guide's shape with no paint within the tolerance. */
  gap: number;
}

/** Grow a bitmap by `r` pixels in every direction (a square brush). */
export function dilate(bits: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!bits[y * w + x]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      across.fill(1, y * w + x0, y * w + x1 + 1);
    }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      if (!across[y * w + x]) continue;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let j = y0; j <= y1; j++) out[j * w + x] = 1;
    }
  return out;
}

/** Compare two shapes drawn on the same grid, forgiving `tol` pixels either way. */
export function outlineFit(
  art: Uint8Array,
  guide: Uint8Array,
  w: number,
  h: number,
  tol: number,
): OutlineFit {
  const nearGuide = dilate(guide, w, h, tol);
  const nearArt = dilate(art, w, h, tol);
  let artN = 0;
  let spill = 0;
  let guideN = 0;
  let gap = 0;
  for (let i = 0; i < w * h; i++) {
    if (art[i]) {
      artN++;
      if (!nearGuide[i]) spill++;
    }
    if (guide[i]) {
      guideN++;
      if (!nearArt[i]) gap++;
    }
  }
  return { spill: artN ? spill / artN : 0, gap: guideN ? gap / guideN : 0 };
}

/** A painting's shape inside its box at game size, the way the template's guide shape is made. */
export function maskOfCell(px: PartPixels, cell: SheetItem['cell'], scale: number): Uint8Array {
  const w = Math.floor(cell.w / scale);
  const h = Math.floor(cell.h / scale);
  const count = new Uint8Array(w * h);
  const { img } = px;
  for (let y = 0; y < img.h; y++) {
    const gy = Math.floor((px.y + y - cell.y) / scale);
    if (gy < 0 || gy >= h) continue;
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3]! <= MASK_ALPHA) continue;
      const gx = Math.floor((px.x + x - cell.x) / scale);
      if (gx >= 0 && gx < w) count[gy * w + gx]!++;
    }
  }
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bits[i] = count[i]! * 2 >= scale * scale ? 1 : 0;
  return bits;
}

export interface ItemAnalysis {
  messages: ArtMessage[];
  /** Painted items that passed their checks, by item ID. */
  items: Map<string, PartPixels>;
  /** How each painted item sits against its guide, where the sheet has the guide's shape. */
  fits: Map<string, OutlineFit>;
  /** Items on the sheet with no paint yet. */
  blank: string[];
  /** The file itself cannot be used. */
  broken: boolean;
}

/** Check one item sheet against its rig. */
export function analyzeItems(bytes: Uint8Array, sheet: ItemSheetFile): ItemAnalysis {
  const messages: ArtMessage[] = [];
  const say = (m: ArtMessage): void => {
    messages.push(m);
  };
  const result: ItemAnalysis = { messages, items: new Map(), fits: new Map(), blank: [], broken: true };
  if (bytes.length > MAX_BYTES)
    say({
      level: 'warning',
      text: `The file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, bigger than 8 MB. Delete unused layers, or check that nothing is saved at a huge size.`,
    });
  let doc;
  try {
    doc = readOra(bytes);
  } catch (e) {
    const why = e instanceof OraError ? e.message : 'it could not be read';
    say({
      level: 'error',
      text: `This isn't a working ORA file: ${why}. Save it again from Krita with File > Save As and pick OpenRaster (.ora).`,
    });
    return result;
  }
  const mime = mimetypeProblem(bytes);
  if (mime)
    say({
      level: 'warning',
      text: `The file isn't quite a standard ORA (${mime}). Krita may still open it.`,
    });
  if (doc.w !== sheet.canvas.w || doc.h !== sheet.canvas.h) {
    say({
      level: 'error',
      text: `The canvas is ${doc.w} x ${doc.h} but should be ${sheet.canvas.w} x ${sheet.canvas.h}. Did Image > Resize Canvas or Scale Image get used? Undo it, or start again from a fresh template.`,
    });
    return result;
  }
  const names = sheet.items.map((i) => i.id);
  const found = new Map<string, OraNode>();
  let madeFor: string | null = null;
  const visit = (stack: OraStack, group: 'root' | 'items'): void => {
    for (const node of stack.children) {
      if (isGuide(node.name)) {
        const stamps = node.kind === 'stack' ? node.children.map((c) => c.name) : [node.name];
        for (const s of stamps) madeFor = STAMP.exec(s)?.[1] ?? madeFor;
        continue;
      }
      if (group === 'root' && node.kind === 'stack' && node.name === 'items') {
        visit(node, 'items');
        continue;
      }
      if (!names.includes(node.name)) {
        const guess = didYouMean(node.name, names);
        say({
          level: 'warning',
          layer: node.name,
          text: guess
            ? `"${node.name}" is not an item on this sheet. Did you mean "${guess}"? Rename it exactly, or start the name with "guide" if it's a sketch.`
            : `"${node.name}" is not an item on this sheet. Rename it to start with "guide" (like "guide_sketch") to hide this message.`,
        });
      } else if (found.has(node.name))
        say({
          level: 'error',
          layer: node.name,
          text: `There are two layers named "${node.name}". Merge them or rename one, so the game knows which is the real one.`,
        });
      else found.set(node.name, node);
    }
  };
  visit(doc.root, 'root');
  if (madeFor && madeFor !== sheet.sheetHash) {
    say({
      level: 'error',
      text: `This sheet is out of date: an item changed size or moved since it was made. Ask for "pnpm art:item-templates --refresh-guides" to update it. Your paintings are kept.`,
    });
    return result;
  }
  result.broken = false;
  const { w, h } = doc;
  for (const item of sheet.items) {
    const node = found.get(item.id);
    if (!node) {
      result.blank.push(item.id);
      continue;
    }
    const before = messages.length;
    const name = item.id;
    if (node.kind === 'layer' && node.filtered)
      say({
        level: 'error',
        layer: name,
        text: `"${name}" has a filter. Merge it down to a plain layer first.`,
      });
    if (node.opacity < 0.999)
      say({
        level: 'warning',
        layer: name,
        text: `"${name}" is at ${Math.round(node.opacity * 100)}% opacity. The game shows it at full strength. Set it to 100%.`,
      });
    if (node.kind === 'layer' && node.compositeOp && node.compositeOp !== 'svg:src-over')
      say({
        level: 'warning',
        layer: name,
        text: `"${name}" uses a blend mode. The game draws items as Normal.`,
      });
    const flat = flatten(node, w, h, say, name);
    const box = alphaBounds(flat);
    if (!box) {
      result.blank.push(name);
      continue;
    }
    const px: PartPixels = { img: crop(flat, box), x: box.x, y: box.y };
    const c = item.cell;
    if (box.x < c.x || box.y < c.y || box.x + box.w > c.x + c.w || box.y + box.h > c.y + c.h)
      say({
        level: 'error',
        layer: name,
        text: `"${name}" goes outside its box (the dashed blue line). Keep it inside, and check that no stray marks for another item are on this layer.`,
      });
    else if (countOpaque(px.img, 200) > c.w * c.h * MAX_CELL_COVER)
      say({
        level: 'error',
        layer: name,
        text: `"${name}" fills its whole box. Is there a filled background on this layer? Erase it, so only the item is left.`,
      });
    if (messages.slice(before).some((m) => m.level === 'error')) continue;
    if (item.mask) {
      const mw = item.mask.w;
      const mh = item.mask.h;
      const fit = outlineFit(
        maskOfCell(px, c, sheet.scale),
        decodeMask(item.mask),
        mw,
        mh,
        Math.round(OUTLINE_TOLERANCE / sheet.scale),
      );
      result.fits.set(name, fit);
      const px4 = OUTLINE_TOLERANCE / sheet.scale;
      if (fit.spill > OUTLINE_SLACK)
        say({
          level: 'warning',
          layer: name,
          text: `"${name}" strays from the guide's shape: ${pct(fit.spill)} of it is more than ${px4} game pixels outside. Paint, bite marks, and what the item touches follow the guide, so keep the same outline.`,
        });
      if (fit.gap > OUTLINE_SLACK)
        say({
          level: 'warning',
          layer: name,
          text: `"${name}" leaves ${pct(fit.gap)} of the guide's shape empty. Fill the same shape, or the item will look like it floats and paint will hang in the air.`,
        });
    }
    result.items.set(name, px);
  }
  if (result.items.size === 0 && messages.every((m) => m.level !== 'error'))
    say({ level: 'info', text: 'Nothing is drawn yet. The game keeps drawing these items in code.' });
  else if (result.blank.length)
    say({
      level: 'info',
      text: `Not painted yet, so the game draws ${result.blank.length === 1 ? 'it' : 'them'} in code: ${result.blank.join(', ')}.`,
    });
  return result;
}

export interface BuiltItemSheet {
  entry: ManifestItemSheet;
  /** Output files by path relative to the set's output folder. */
  files: Record<string, Uint8Array>;
  messages: ArtMessage[];
  fits: Map<string, OutlineFit>;
}

/** Import one item sheet against its rig. Pure: bytes in, files out. */
export function buildItemSheet(bytes: Uint8Array, sheet: ItemSheetFile): BuiltItemSheet {
  const a = analyzeItems(bytes, sheet);
  const entry: ManifestItemSheet = {
    id: sheet.id,
    kind: 'item_sheet',
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    sheetHash: sheet.sheetHash,
    status: 'empty',
    pages: { '1': [], '2': [] },
    items: [],
    report: a.messages,
  };
  const files: Record<string, Uint8Array> = {};
  if (a.items.size === 0) {
    if (a.messages.some((m) => m.level === 'error')) entry.status = 'broken';
    return { entry, files, messages: a.messages, fits: a.fits };
  }
  entry.status = 'drawn';
  const pieces: Piece[] = [];
  for (const item of sheet.items) {
    const px = a.items.get(item.id);
    if (!px) continue;
    pieces.push(cut(item.id, px, item.anchor, null));
    entry.items.push(item.id);
  }
  for (const scale of [1, 2] as const) {
    const frames: { name: string; img: Rgba; anchor: { x: number; y: number } }[] = [];
    for (const p of pieces) {
      // The sheet is painted at 4x: halve once for 2x pages and twice for 1x.
      let img = halve(p.img);
      if (scale === 1) img = halve(img);
      bleed(img, 2);
      // No baked rim light: an item keeps the guide's outline, so the code-drawn rim fits it,
      // and leaving the rims out halves the pages.
      frames.push({ name: p.name, img, anchor: p.anchor });
    }
    const packed = pack(
      frames.map((f) => ({ name: f.name, w: f.img.w, h: f.img.h })),
      MAX_PAGE,
      PAD,
    );
    packed.pages.forEach((_pow2, page) => {
      // The packer rounds pages up to powers of two; these pages are only as big as what is on them.
      const on = packed.placed.filter((x) => x.page === page);
      const size = {
        w: Math.ceil(Math.max(...on.map((q) => q.x + q.w + PAD)) / 4) * 4,
        h: Math.ceil(Math.max(...on.map((q) => q.y + q.h + PAD)) / 4) * 4,
      };
      const base = `${sheet.id}@${scale}x${packed.pages.length > 1 ? `-${page + 1}` : ''}`;
      const out: Rgba = { w: size.w, h: size.h, data: new Uint8Array(size.w * size.h * 4) };
      const json: AtlasJson = {
        frames: {},
        meta: { image: `${base}.png`, size, scale, format: 'RGBA8888' },
      };
      for (const q of on) {
        const f = frames.find((x) => x.name === q.name)!;
        for (let y = 0; y < f.img.h; y++)
          out.data.set(
            f.img.data.subarray(y * f.img.w * 4, (y + 1) * f.img.w * 4),
            ((q.y + y) * size.w + q.x) * 4,
          );
        const fr: AtlasFrame = {
          frame: { x: q.x, y: q.y, w: q.w, h: q.h },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: q.w, h: q.h },
          sourceSize: { w: q.w, h: q.h },
          anchor: f.anchor,
        };
        json.frames[q.name] = fr;
      }
      files[`items/${base}.png`] = encodePng(out);
      files[`items/${base}.json`] = new TextEncoder().encode(stableJson(json));
      entry.pages[String(scale) as '1' | '2'].push(`items/${base}`);
    });
  }
  return { entry, files, messages: a.messages, fits: a.fits };
}

/** Built sheets as a pack the game can install while running (tests, tours). */
export function toItemPack(built: readonly BuiltItemSheet[]): ItemPack {
  const pages: ItemPack['pages'] = {};
  for (const b of built)
    for (const page of [...b.entry.pages['1'], ...b.entry.pages['2']]) {
      const png = b.files[`${page}.png`]!;
      const json = JSON.parse(new TextDecoder().decode(b.files[`${page}.json`]!)) as AtlasJson;
      pages[page] = { png: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, json };
    }
  return { sheets: built.map((b) => b.entry), pages };
}

/** Every .ora in a set's `items` folder, with the rig.json that belongs next to it. */
export function findItemSources(srcDir: string): Source[] {
  const dir = join(srcDir, 'items');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ora'))
    .sort()
    .map((f) => {
      const id = f.slice(0, -4);
      return { id, ora: join(dir, f), rig: join(dir, `${id}.rig.json`) };
    });
}

/** A sheet's rig.json, or the reason it cannot be used. */
export function readSheet(path: string): ItemSheetFile | string {
  if (!existsSync(path))
    return `There's no rig.json next to the file. Run "pnpm art:item-templates" to make it.`;
  const sheet = JSON.parse(readFileSync(path, 'utf8')) as ItemSheetFile;
  if (sheet.kind !== 'item_sheet' || !Array.isArray(sheet.items))
    return 'Its rig.json is not an item sheet. Run "pnpm art:item-templates" to make a fresh one.';
  return sheet;
}

export interface BuiltItems {
  /** Output files by path relative to the set's output folder. Empty when the set has no item sheets. */
  files: Record<string, Uint8Array>;
  messages: Map<string, ArtMessage[]>;
  built: BuiltItemSheet[];
}

/** Import every item sheet of one set. Writes nothing. */
export function buildItems(srcDir: string): BuiltItems {
  const out: BuiltItems = { files: {}, messages: new Map(), built: [] };
  const sources = findItemSources(srcDir);
  if (!sources.length) return out;
  const manifest: ItemManifest = { schema: 1, sheets: {} };
  for (const s of sources) {
    const sheet = readSheet(s.rig);
    if (typeof sheet === 'string') {
      out.messages.set(s.id, [{ level: 'error', text: sheet }]);
      continue;
    }
    const built = buildItemSheet(new Uint8Array(readFileSync(s.ora)), sheet);
    manifest.sheets[s.id] = built.entry;
    Object.assign(out.files, built.files);
    out.messages.set(s.id, built.messages);
    out.built.push(built);
  }
  out.files['items/manifest.json'] = new TextEncoder().encode(stableJson(manifest));
  return out;
}
