// Reads an artist's .ora against its rig.json: finds each part's layers,
// flattens groups, and checks everything in docs/06-art-guide.md, B10. Every
// message names the layer, says what is wrong in plain words, and how to fix it.

import { KIT_TINTABLE } from '../../src/renderer/src/art/kit.ts';
import type { ArtMessage, RigFile, RigPart } from '../../src/renderer/src/art/rigFile.ts';
import type { BlendMode, Rect } from './image.ts';
import { BLEND_MODES, alphaBounds, composite, countOpaque, crop, meanSaturation } from './image.ts';
import type { OraLayer, OraNode, OraStack } from './ora.ts';
import { OraError, mimetypeProblem, readOra } from './ora.ts';
import type { Rgba } from './png.ts';
import { PngError, blank, decodePng } from './png.ts';

/** A part's pixels: trimmed to what is drawn, with where that sits on the canvas. */
export interface PartPixels {
  img: Rgba;
  x: number;
  y: number;
}

export interface Analysis {
  messages: ArtMessage[];
  /** Drawn parts by name. Empty ones are left out. */
  parts: Map<string, PartPixels>;
  /** Drawn face pieces by name. */
  face: Map<string, PartPixels>;
  /** Pivots moved by `pivot_<name>` dots, in template pixels. */
  pivots: Map<string, { x: number; y: number }>;
  /** Nothing is drawn at all yet (a fresh template). */
  untouched: boolean;
  /** The rig hash the template was made for, if the file says. */
  madeFor: string | null;
}

/** The biggest file that doesn't get a size warning. */
export const MAX_BYTES = 8 * 1024 * 1024;
/** A `_tint` layer's mean saturation above this gets a warning. */
export const MAX_TINT_SATURATION = 0.12;
/** How close (template pixels) a limb or feeler must come to its pivot. */
export const REACH = 24;

const isGuide = (name: string): boolean => /^guide/i.test(name.trim());
const RIG_LAYER = /^guide_rig_([0-9a-f]+)$/;

/** Edit distance, for "did you mean". */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

/** The name a misspelled layer most likely meant: case and spaces first, then the closest spelling. */
export function didYouMean(name: string, names: readonly string[]): string | null {
  const norm = (s: string): string =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  const exact = names.find((n) => norm(n) === norm(name));
  if (exact) return exact;
  let best: string | null = null;
  let bestD = Infinity;
  for (const n of names) {
    const dd = editDistance(norm(name), n);
    if (dd < bestD) {
      bestD = dd;
      best = n;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(best.length / 3)) ? best : null;
}

/** A layer's own pixels placed on a canvas-sized buffer. */
function layerPixels(
  layer: OraLayer,
  w: number,
  h: number,
  say: (m: ArtMessage) => void,
): { img: Rgba; drawn: boolean } {
  const img = blank(w, h);
  if (!layer.png) {
    say({
      level: 'error',
      layer: layer.name,
      text: `"${layer.name}" points at a picture that isn't in the file.`,
    });
    return { img, drawn: false };
  }
  try {
    const png = decodePng(layer.png);
    if (png.info.bitDepth > 8)
      say({
        level: 'warning',
        layer: layer.name,
        text: `"${layer.name}" is saved in 16-bit color. Use Image > Convert Image Color Space and pick 8-bit integer.`,
      });
    if (!png.info.srgb)
      say({
        level: 'warning',
        layer: layer.name,
        text: `"${layer.name}" uses the color profile "${png.info.iccName}", not sRGB. Colors may look different in the game. Convert it to sRGB.`,
      });
    composite(img, png, layer.x, layer.y);
    return { img, drawn: countOpaque(png) > 0 };
  } catch (e) {
    const why = e instanceof PngError ? e.message : 'it could not be read';
    say({
      level: 'error',
      layer: layer.name,
      text: `"${layer.name}" has a picture the game can't read (${why}).`,
    });
    return { img, drawn: false };
  }
}

/**
 * Flatten a part: a layer as is, a group by painting its children back to
 * front with their opacity and blend mode. Hidden layers count (hiding is for
 * working, never for turning a part off); `guide...` layers inside are skipped.
 */
function flatten(node: OraNode, w: number, h: number, say: (m: ArtMessage) => void, part: string): Rgba {
  if (node.kind === 'layer') return layerPixels(node, w, h, say).img;
  const out = blank(w, h);
  for (const child of [...node.children].reverse()) {
    if (isGuide(child.name)) continue;
    const mode = child.compositeOp as BlendMode;
    if (!BLEND_MODES.includes(mode)) {
      say({
        level: 'error',
        layer: part,
        text: `"${child.name}" in "${part}" uses the blend mode ${modeName(child.compositeOp)}. The game only understands Normal, Multiply, and Inherit Alpha. Merge it into a Normal layer first.`,
      });
      continue;
    }
    if (child.filtered) {
      say({
        level: 'error',
        layer: part,
        text: `"${child.name}" in "${part}" has a filter. Merge it down first.`,
      });
      continue;
    }
    composite(out, flatten(child, w, h, say, part), 0, 0, child.opacity, mode);
  }
  return out;
}

const modeName = (op: string): string => {
  const short = op.replace(/^(svg|krita):/, '');
  return `"${short.replace(/-/g, ' ')}"`;
};

const near = (img: Rgba, cx: number, cy: number, radius: number): boolean => {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(img.w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(img.h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (img.data[(y * img.w + x) * 4 + 3]! > 128 && Math.hypot(x - cx, y - cy) <= radius) return true;
  return false;
};

function centroid(img: Rgba): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const a = img.data[(y * img.w + x) * 4 + 3]!;
      if (!a) continue;
      sx += x * a;
      sy += y * a;
      n += a;
    }
  return n ? { x: sx / n, y: sy / n } : null;
}

/** Check one .ora against its rig. `file` is the name used in messages. */
export function analyze(bytes: Uint8Array, rig: RigFile): Analysis {
  const messages: ArtMessage[] = [];
  const say = (m: ArtMessage): void => {
    messages.push(m);
  };
  const result: Analysis = {
    messages,
    parts: new Map(),
    face: new Map(),
    pivots: new Map(),
    untouched: false,
    madeFor: null,
  };
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
  if (doc.w !== rig.canvas.w || doc.h !== rig.canvas.h) {
    say({
      level: 'error',
      text: `The canvas is ${doc.w} x ${doc.h} but should be ${rig.canvas.w} x ${rig.canvas.h}. Did Image > Resize Canvas or Scale Image get used? Undo it, or start again from a fresh template.`,
    });
    return result;
  }
  const { w, h } = doc;
  const partNames = rig.parts.map((p) => p.name);
  const faceNames = rig.face;
  const known = [...partNames, ...faceNames];
  const found = new Map<string, OraNode>();
  const foundFace = new Map<string, OraNode>();
  const pivotLayers = new Map<string, OraNode>();
  const unknown = (node: OraNode, where: string): void => {
    const guess = didYouMean(node.name, known);
    say({
      level: 'warning',
      layer: node.name,
      text: guess
        ? `"${node.name}"${where} is not a part name. Did you mean "${guess}"? Rename it exactly, or start the name with "guide" if it's a sketch.`
        : `"${node.name}"${where} is not a part name. Rename it to start with "guide" (like "guide_sketch") to hide this message.`,
    });
  };
  const take = (node: OraNode, into: Map<string, OraNode>): void => {
    if (into.has(node.name) || (into === found ? foundFace : found).has(node.name))
      say({
        level: 'error',
        layer: node.name,
        text: `There are two layers named "${node.name}". Merge them or rename one, so the game knows which is the real one.`,
      });
    else into.set(node.name, node);
  };
  const visit = (stack: OraStack, group: 'root' | 'parts' | 'face'): void => {
    for (const node of stack.children) {
      const name = node.name;
      if (isGuide(name)) {
        if (group === 'root' && node.kind === 'stack') {
          for (const g of node.children) {
            const m = RIG_LAYER.exec(g.name);
            if (m) result.madeFor = m[1]!;
          }
        }
        const m = RIG_LAYER.exec(name);
        if (m) result.madeFor = m[1]!;
        continue;
      }
      if (group === 'root' && node.kind === 'stack' && (name === 'parts' || name === 'face')) {
        visit(node, name);
        continue;
      }
      if (group === 'root' && node.kind === 'stack' && name === 'pivots') {
        for (const pv of node.children) {
          const m = /^pivot_(.+)$/.exec(pv.name);
          if (m && partNames.includes(m[1]!)) pivotLayers.set(m[1]!, pv);
          else if (!isGuide(pv.name))
            say({
              level: 'warning',
              layer: pv.name,
              text: `"${pv.name}" in "pivots" doesn't name a part. Call it "pivot_" plus a part name, like "pivot_head".`,
            });
        }
        continue;
      }
      if (group !== 'face' && partNames.includes(name)) take(node, found);
      else if (group !== 'parts' && faceNames.includes(name)) take(node, foundFace);
      else unknown(node, group === 'root' ? '' : ` (in "${group}")`);
    }
  };
  visit(doc.root, 'root');

  if (result.madeFor && result.madeFor !== rig.rigHash)
    say({
      level: 'error',
      text: `This template is out of date: the game's joints moved since it was made. Ask for "pnpm art:templates --refresh-guides" to update the guides. Your drawings are kept.`,
    });

  const safe = rig.safe;
  const pixelsOf = (name: string, node: OraNode): PartPixels | null => {
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
        text: `"${name}" is at ${Math.round(node.opacity * 100)}% opacity. The game uses it at that strength. Set it to 100% unless you mean it.`,
      });
    if (
      node.kind === 'layer' &&
      !['svg:src-over', 'svg:src-atop'].includes(node.compositeOp) &&
      node.compositeOp
    )
      say({
        level: 'warning',
        layer: name,
        text: `"${name}" uses the blend mode ${modeName(node.compositeOp)}. The game draws parts as Normal.`,
      });
    const flat = flatten(node, w, h, say, name);
    const box = alphaBounds(flat);
    if (!box) return null;
    return { img: crop(flat, box), x: box.x, y: box.y };
  };
  let drawnParts = 0;
  const partPix = new Map<string, PartPixels>();
  for (const [name, node] of found) {
    const px = pixelsOf(name, node);
    if (px) {
      partPix.set(name, px);
      drawnParts++;
    }
  }
  const facePix = new Map<string, PartPixels>();
  for (const [name, node] of foundFace) {
    const px = pixelsOf(name, node);
    if (px) facePix.set(name, px);
  }
  // A fresh template (or a face group not started): no drawing anywhere yet.
  if (drawnParts === 0 && facePix.size === 0 && messages.every((m) => m.level !== 'error')) {
    result.untouched = true;
    say({ level: 'info', text: 'Nothing is drawn yet. The game keeps drawing this one in code.' });
    return result;
  }
  for (const part of rig.parts) {
    const node = found.get(part.name);
    const px = partPix.get(part.name);
    if (!node) {
      say({
        level: part.required ? 'error' : 'warning',
        layer: part.name,
        text: `"${part.name}" is missing. Make a layer named exactly "${part.name}" in the "parts" group and draw ${part.note.charAt(0).toLowerCase()}${part.note.slice(1)}`,
      });
      continue;
    }
    if (!px) {
      say({
        level: part.required ? 'error' : 'warning',
        layer: part.name,
        text: `"${part.name}" is empty. Draw ${part.note.charAt(0).toLowerCase()}${part.note.slice(1)}`,
      });
      continue;
    }
    checkPart(part, px, rig, say, safe);
  }
  // Face pieces: the kit's, or a bug's own versions that win over the kit.
  for (const [name, px] of facePix) {
    if (!checkCover(name, px, w, h, say)) continue;
    if (KIT_TINTABLE.has(name) && meanSaturation(px.img) > MAX_TINT_SATURATION)
      say({
        level: 'warning',
        layer: name,
        text: `"${name}" is a tint layer but is quite colorful. Draw it in light greys: the game adds the color.`,
      });
  }

  for (const [name, layer] of pivotLayers) {
    const flat = flatten(layer, w, h, say, `pivot_${name}`);
    const c = centroid(flat);
    if (!c) continue;
    const part = rig.parts.find((p) => p.name === name)!;
    result.pivots.set(name, c);
    say({
      level: 'info',
      layer: `pivot_${name}`,
      text: `"${name}" now turns around your dot at ${Math.round(c.x)}, ${Math.round(c.y)} instead of ${Math.round(part.pivot.x)}, ${Math.round(part.pivot.y)}.`,
    });
  }
  result.parts = partPix;
  result.face = facePix;
  return result;
}

function checkCover(
  name: string,
  px: PartPixels,
  w: number,
  h: number,
  say: (m: ArtMessage) => void,
): boolean {
  const opaque = countOpaque(px.img, 200);
  if (opaque > w * h * 0.9) {
    say({
      level: 'error',
      layer: name,
      text: `"${name}" covers almost the whole canvas. Is there a filled background on this layer? Erase it, so only the piece is left.`,
    });
    return false;
  }
  return true;
}

function checkPart(
  part: RigPart,
  px: PartPixels,
  rig: RigFile,
  say: (m: ArtMessage) => void,
  safe: RigFile['safe'] | null,
): void {
  const name = part.name;
  if (!checkCover(name, px, rig.canvas.w, rig.canvas.h, say)) return;
  const box: Rect = { x: px.x, y: px.y, w: px.img.w, h: px.img.h };
  if (safe && (box.x < safe.x0 || box.y < safe.y0 || box.x + box.w > safe.x1 || box.y + box.h > safe.y1))
    say({
      level: 'warning',
      layer: name,
      text: `"${name}" goes outside the safe box. Keep it inside the box on the guide, or it may get cut off.`,
    });
  const reaches = part.kind === 'limb_upper' || part.kind === 'limb_lower' || part.kind === 'rope';
  if (reaches && !near(px.img, part.pivot.x - px.x, part.pivot.y - px.y, REACH))
    say({
      level: 'warning',
      layer: name,
      text: `"${name}" doesn't start at its dot ("${name}" on the pivots guide). Start the drawing right on the dot, or it will float away from the body when it moves.`,
    });
  if (part.tintable || /_tint$/.test(name)) {
    const sat = meanSaturation(px.img);
    if (sat > MAX_TINT_SATURATION)
      say({
        level: 'warning',
        layer: name,
        text: `"${name}" is a tint layer but is quite colorful. Draw it in light greys: the game adds the color.`,
      });
  }
}
