// The backdrop importer: a set's sky.json, world.json, and painted parallax
// strips (art/src/sets/<id>/backdrop/) become backdrop.json and one PNG per
// strip next to the set's bug atlases. `pnpm art:build` and `pnpm art:check`
// run it for every set; `pnpm art:check-backdrop` checks one file.
// docs/06-art-guide.md, B14.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BackdropManifest,
  BackdropMessage,
  BackdropPack,
  StripEntry,
  StripFile,
  StripImage,
} from '../../src/renderer/src/art/backdropData.ts';
import { GLOW_LAYER, STRIP_LAYERS, parseSky, parseWorld } from '../../src/renderer/src/art/backdropData.ts';
import { stableJson } from './build.ts';
import type { BlendMode, Rect } from './image.ts';
import { BLEND_MODES, alphaBounds, bleed, composite, crop, halve } from './image.ts';
import type { OraNode } from './ora.ts';
import { OraError, mimetypeProblem, readOra } from './ora.ts';
import type { Rgba } from './png.ts';
import { PngError, blank, decodePng, encodePng } from './png.ts';

/** The folder a set's backdrop lives in, under its source folder and under its built folder. */
export const BACKDROP_DIR = 'backdrop';
/** A source file bigger than this gets a warning. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** A built strip bigger than this gets a warning: the whole set ships in the installer. */
export const MAX_STRIP_BYTES = 3 * 1024 * 1024;
/** A built picture is at most this wide, so any GPU takes it as one texture. */
export const MAX_STRIP_WIDTH = 4096;

const STAMP = /^guide_strip_([0-9a-f]+)$/;
const isGuide = (name: string): boolean => /^guide/i.test(name.trim());
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const modeName = (op: string): string => `"${op.replace(/^(svg|krita):/, '').replace(/-/g, ' ')}"`;

/** Paint `src` over `dst`; plain opaque and empty pixels skip the float math, since strips are big. */
function paint(dst: Rgba, src: Rgba, dx: number, dy: number, opacity: number, mode: BlendMode): void {
  if (mode !== 'svg:src-over' || opacity < 1) return composite(dst, src, dx, dy, opacity, mode);
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dst.w, dx + src.w);
  const y1 = Math.min(dst.h, dy + src.h);
  const d = dst.data;
  const s = src.data;
  for (let y = y0; y < y1; y++) {
    let si = ((y - dy) * src.w + (x0 - dx)) * 4;
    let di = (y * dst.w + x0) * 4;
    for (let x = x0; x < x1; x++, si += 4, di += 4) {
      const a = s[si + 3]!;
      if (a === 0) continue;
      const da = d[di + 3]!;
      if (a === 255 || da === 0) {
        d[di] = s[si]!;
        d[di + 1] = s[si + 1]!;
        d[di + 2] = s[si + 2]!;
        d[di + 3] = a;
        continue;
      }
      const sa = a / 255;
      const ba = (da / 255) * (1 - sa);
      const out = sa + ba;
      d[di] = Math.round((s[si]! * sa + d[di]! * ba) / out);
      d[di + 1] = Math.round((s[si + 1]! * sa + d[di + 1]! * ba) / out);
      d[di + 2] = Math.round((s[si + 2]! * sa + d[di + 2]! * ba) / out);
      d[di + 3] = Math.round(out * 255);
    }
  }
}

const hiddenLayer = (name: string): BackdropMessage => ({
  level: 'warning',
  layer: name,
  text: `"${name}" is hidden in Krita but still part of the picture: hiding never turns a layer off. Show it, delete it, or rename it to start with "guide".`,
});

/** Flatten layers (top first, as in the file) onto one canvas, back to front. Guides are skipped. */
function flatten(
  nodes: readonly OraNode[],
  w: number,
  h: number,
  say: (m: BackdropMessage) => void,
  state: { drawn: boolean },
): Rgba {
  const out = blank(w, h);
  for (const node of [...nodes].reverse()) {
    if (isGuide(node.name)) continue;
    const mode = node.compositeOp as BlendMode;
    if (!BLEND_MODES.includes(mode)) {
      say({
        level: 'error',
        layer: node.name,
        text: `"${node.name}" uses the blend mode ${modeName(node.compositeOp)}. The game only understands Normal, Multiply, and Inherit Alpha. Merge it into a Normal layer first.`,
      });
      continue;
    }
    if (node.filtered) {
      say({ level: 'error', layer: node.name, text: `"${node.name}" has a filter. Merge it down first.` });
      continue;
    }
    if (node.kind === 'stack') {
      const inside = { drawn: false };
      const group = flatten(node.children, w, h, say, inside);
      if (inside.drawn) state.drawn = true;
      if (inside.drawn && !node.visible) say(hiddenLayer(node.name));
      paint(out, group, 0, 0, node.opacity, mode);
      continue;
    }
    if (!node.png) {
      say({
        level: 'error',
        layer: node.name,
        text: `"${node.name}" points at a picture that isn't in the file.`,
      });
      continue;
    }
    let png;
    try {
      png = decodePng(node.png);
    } catch (e) {
      const why = e instanceof PngError ? e.message : 'it could not be read';
      say({
        level: 'error',
        layer: node.name,
        text: `"${node.name}" has a picture the game can't read (${why}).`,
      });
      continue;
    }
    if (png.info.bitDepth > 8)
      say({
        level: 'warning',
        layer: node.name,
        text: `"${node.name}" is saved in 16-bit color. Use Image > Convert Image Color Space and pick 8-bit integer.`,
      });
    if (!png.info.srgb)
      say({
        level: 'warning',
        layer: node.name,
        text: `"${node.name}" uses the color profile "${png.info.iccName}", not sRGB. Colors may look different in the game. Convert it to sRGB.`,
      });
    const has = alphaBounds(png) !== null;
    if (has && !node.visible) say(hiddenLayer(node.name));
    if (has) state.drawn = true;
    paint(out, png, node.x, node.y, node.opacity, mode);
  }
  return out;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Fade a strip out across its blend zones and empty what is never on screen.
 * `img` is the whole canvas at game size.
 */
export function finishStrip(img: Rgba, strip: StripFile): void {
  const { data, w, h } = img;
  const fade = new Float32Array(w).fill(1);
  for (let x = 0; x < Math.min(w, strip.blend.left); x++) fade[x] = smooth((x + 0.5) / strip.blend.left);
  for (let i = 0; i < Math.min(w, strip.blend.right); i++)
    fade[w - 1 - i] = Math.min(fade[w - 1 - i]!, smooth((i + 0.5) / strip.blend.right));
  for (const [a, b] of strip.hidden)
    for (let x = Math.max(0, a - strip.x); x < Math.min(w, b - strip.x); x++) fade[x] = 0;
  for (let y = 0; y < h; y++) {
    const gone = y >= strip.cover;
    for (let x = 0; x < w; x++) {
      const f = gone ? 0 : fade[x]!;
      if (f === 1) continue;
      const i = (y * w + x) * 4 + 3;
      data[i] = Math.round(data[i]! * f);
    }
  }
}

/** How many pixels in a column band have any paint. */
function painted(img: Rgba, x0: number, x1: number): number {
  let n = 0;
  for (let y = 0; y < img.h; y++)
    for (let x = Math.max(0, x0); x < Math.min(img.w, x1); x++)
      if (img.data[(y * img.w + x) * 4 + 3]! > 8) n++;
  return n;
}

export interface BuiltStrip {
  entry: StripEntry;
  /** Output files by path relative to the set's output folder. */
  files: Record<string, Uint8Array>;
  messages: BackdropMessage[];
}

/** Import one strip's .ora against its strip.json. Pure: bytes in, files out. */
export function buildStrip(bytes: Uint8Array, strip: StripFile): BuiltStrip {
  const messages: BackdropMessage[] = [];
  const say = (m: BackdropMessage): void => void messages.push(m);
  const entry: StripEntry = {
    id: strip.id,
    area: strip.area,
    layer: strip.layer,
    status: 'broken',
    sourceHash: sha256(bytes),
    stripHash: strip.stripHash,
    span: [strip.span.x0, strip.span.x1],
    paint: null,
    glow: null,
    report: messages,
  };
  const files: Record<string, Uint8Array> = {};
  const done = (): BuiltStrip => ({ entry, files, messages });
  if (bytes.length > MAX_SOURCE_BYTES)
    say({
      level: 'warning',
      text: `The file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, bigger than 8 MB. Merge layers you are done with, and paint flat areas flat.`,
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
    return done();
  }
  const mime = mimetypeProblem(bytes);
  if (mime)
    say({
      level: 'warning',
      text: `The file isn't quite a standard ORA (${mime}). Krita may still open it.`,
    });
  if (doc.w !== strip.canvas.w || doc.h !== strip.canvas.h) {
    say({
      level: 'error',
      text: `The canvas is ${doc.w} x ${doc.h} but should be ${strip.canvas.w} x ${strip.canvas.h}. Did Image > Resize Canvas or Scale Image get used? Undo it, or start again from a fresh template.`,
    });
    return done();
  }
  // The stamp says which geometry the template was made for.
  let madeFor: string | null = null;
  const stamps = (nodes: readonly OraNode[]): void => {
    for (const n of nodes) {
      const m = STAMP.exec(n.name);
      if (m) madeFor = m[1]!;
      if (n.kind === 'stack' && isGuide(n.name)) stamps(n.children);
    }
  };
  stamps(doc.root.children);
  if (madeFor !== null && madeFor !== strip.stripHash)
    say({
      level: 'error',
      text: `This template is out of date: the area or its layer changed size since it was made. Run "pnpm art:backdrop-templates --refresh-guides" to update the guides. Your painting is kept.`,
    });
  const top = doc.root.children.filter((n) => !isGuide(n.name));
  const glowNodes = top.filter((n) => n.name.trim().toLowerCase() === GLOW_LAYER);
  if (glowNodes.length > 1)
    say({
      level: 'error',
      layer: GLOW_LAYER,
      text: `There are ${glowNodes.length} layers named "glow". Put them in one group named "glow", or merge them.`,
    });
  const paintState = { drawn: false };
  const glowState = { drawn: false };
  let pic = flatten(
    top.filter((n) => !glowNodes.includes(n)),
    doc.w,
    doc.h,
    say,
    paintState,
  );
  // The glow's own opacity, blend mode, and visibility do not matter: the game adds it after dark.
  let glow = glowNodes.length
    ? flatten(
        glowNodes.map((n) => ({ ...n, opacity: 1, visible: true, compositeOp: 'svg:src-over' }) as OraNode),
        doc.w,
        doc.h,
        say,
        glowState,
      )
    : null;
  if (messages.some((m) => m.level === 'error')) return done();
  if (!paintState.drawn && !glowState.drawn) {
    entry.status = 'empty';
    say({ level: 'info', text: 'Nothing is painted yet. The game draws this stretch in code.' });
    return done();
  }
  if (strip.scale === 2) {
    pic = halve(pic);
    if (glow) glow = halve(glow);
  }
  // A painting that stops short of a seam leaves a gap where it meets its neighbour.
  for (const side of ['left', 'right'] as const) {
    const zone = strip.blend[side];
    if (!zone || !paintState.drawn) continue;
    const edge = side === 'left' ? painted(pic, 0, zone) : painted(pic, pic.w - zone, pic.w);
    const inside =
      side === 'left' ? painted(pic, zone, zone * 2) : painted(pic, pic.w - zone * 2, pic.w - zone);
    if (inside > zone * pic.h * 0.02 && edge < inside * 0.3)
      say({
        level: 'warning',
        text: `The painting stops short of the ${side} edge. Paint through the pink blend zone to the canvas edge, or a gap shows where it meets the next area.`,
      });
  }
  const place = (img: Rgba, name: string): StripImage | null => {
    finishStrip(img, strip);
    const box = alphaBounds(img);
    if (!box) return null;
    // Keep two transparent pixels all round, filled with the edge's color, so filtering stays clean.
    const x0 = Math.max(0, box.x - 2);
    const y0 = Math.max(0, box.y - 2);
    const rect: Rect = {
      x: x0,
      y: y0,
      w: Math.min(img.w, box.x + box.w + 2) - x0,
      h: Math.min(img.h, box.y + box.h + 2) - y0,
    };
    if (rect.w > MAX_STRIP_WIDTH) {
      say({
        level: 'error',
        text: `The built picture is ${rect.w} px wide, over the ${MAX_STRIP_WIDTH} px a texture may be.`,
      });
      return null;
    }
    const cut = crop(img, rect);
    bleed(cut, 2);
    const png = encodePng(cut);
    const path = `${BACKDROP_DIR}/${name}.png`;
    files[path] = png;
    if (png.length > MAX_STRIP_BYTES)
      say({
        level: 'warning',
        text: `The built picture is ${(png.length / 1024 / 1024).toFixed(1)} MB, over ${MAX_STRIP_BYTES / 1024 / 1024} MB. Noise and soft gradients compress badly: paint flatter, or it bloats the game.`,
      });
    return { image: path, x: strip.x + rect.x, y: rect.y, w: rect.w, h: rect.h };
  };
  entry.paint = paintState.drawn ? place(pic, strip.id) : null;
  entry.glow = glow && glowState.drawn ? place(glow, `${strip.id}.glow`) : null;
  if (messages.some((m) => m.level === 'error')) {
    for (const k of Object.keys(files)) delete files[k];
    entry.paint = entry.glow = null;
    return done();
  }
  if (paintState.drawn && !entry.paint)
    say({
      level: 'warning',
      text: 'Everything painted is in a part that is never on screen (the grey hatching), so nothing is used.',
    });
  entry.status = entry.paint ? 'drawn' : 'empty';
  return done();
}

/** Read and check a `.strip.json`. */
export function readStripFile(path: string): { strip: StripFile | null; message: BackdropMessage | null } {
  const fail = (text: string): { strip: null; message: BackdropMessage } => ({
    strip: null,
    message: { level: 'error', text },
  });
  if (!existsSync(path))
    return fail(
      `There's no ${path.split(/[\\/]/).pop()} next to the file. It comes with the template; copy both, or run "pnpm art:backdrop-templates".`,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fail(`${path.split(/[\\/]/).pop()} isn't valid JSON. Don't edit it by hand; make it again.`);
  }
  const s = raw as Partial<StripFile>;
  const ok =
    s &&
    s.schema === 1 &&
    s.kind === 'strip' &&
    typeof s.id === 'string' &&
    typeof s.area === 'string' &&
    STRIP_LAYERS.includes(s.layer as never) &&
    (s.scale === 1 || s.scale === 2) &&
    typeof s.canvas?.w === 'number' &&
    typeof s.canvas?.h === 'number' &&
    typeof s.x === 'number' &&
    typeof s.span?.x0 === 'number' &&
    typeof s.span?.x1 === 'number' &&
    typeof s.blend?.left === 'number' &&
    typeof s.blend?.right === 'number' &&
    typeof s.cover === 'number' &&
    Array.isArray(s.hidden) &&
    typeof s.stripHash === 'string';
  if (!ok)
    return fail(`${path.split(/[\\/]/).pop()} isn't a strip file. Don't edit it by hand; make it again.`);
  return { strip: s as StripFile, message: null };
}

/** Read one of the backdrop's JSON files: the parsed value, or an error message. */
export function readJson(path: string): { value: unknown; message: BackdropMessage | null } {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), message: null };
  } catch (e) {
    const why = e instanceof Error ? e.message : 'it could not be read';
    return {
      value: null,
      message: {
        level: 'error',
        text: `This isn't valid JSON (${why}). Check for a missing comma or quote.`,
      },
    };
  }
}

export interface BuiltBackdrop {
  /** Null when the set has no `backdrop/` folder: nothing is written for it. */
  manifest: BackdropManifest | null;
  files: Record<string, Uint8Array>;
  /** Messages by file name inside `backdrop/` (strips without their `.ora`). */
  messages: Map<string, BackdropMessage[]>;
}

/** Import a set's whole backdrop from its source folder. Writes nothing. */
export function buildBackdrop(setDir: string): BuiltBackdrop {
  const dir = join(setDir, BACKDROP_DIR);
  const out: BuiltBackdrop = { manifest: null, files: {}, messages: new Map() };
  if (!existsSync(dir)) return out;
  const manifest: BackdropManifest = {
    schema: 1,
    sky: null,
    world: null,
    strips: {},
    report: { sky: [], world: [] },
  };
  for (const [name, parse] of [
    ['sky', (v: unknown) => parseSky(v).messages],
    ['world', (v: unknown) => parseWorld(v).messages],
  ] as const) {
    const path = join(dir, `${name}.json`);
    if (!existsSync(path)) continue;
    const read = readJson(path);
    const messages = read.message ? [read.message] : parse(read.value);
    if (!messages.some((m) => m.level === 'error')) manifest[name] = read.value;
    manifest.report[name] = messages;
    out.messages.set(`${name}.json`, messages);
  }
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.ora')) continue;
    const id = f.slice(0, -4);
    const read = readStripFile(join(dir, `${id}.strip.json`));
    if (!read.strip || read.strip.id !== id) {
      out.messages.set(id, [
        read.message ?? {
          level: 'error',
          text: `${id}.strip.json belongs to ${read.strip!.id}. Keep each template's two files together, with their names unchanged.`,
        },
      ]);
      continue;
    }
    const built = buildStrip(new Uint8Array(readFileSync(join(dir, f))), read.strip);
    manifest.strips[id] = built.entry;
    Object.assign(out.files, built.files);
    out.messages.set(id, built.messages);
  }
  out.manifest = manifest;
  out.files['backdrop.json'] = new TextEncoder().encode(stableJson(manifest));
  return out;
}

/** A built backdrop as a pack the game can install while running (tests, the review tour). */
export function toBackdropPack(built: BuiltBackdrop): BackdropPack | null {
  if (!built.manifest) return null;
  const images: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(built.files))
    if (path.endsWith('.png'))
      images[path] = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  return { manifest: built.manifest, images };
}
