// The art importer: `pnpm art:build` turns the artist's .ora files into atlas
// pages and a manifest the game loads; `pnpm art:check` rebuilds everything in
// memory and fails if the committed files differ or a file has an error.
// docs/06-art-guide.md, B6.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KIT_EYE_R, KIT_MOUTH_W, kitCell } from '../../src/renderer/src/art/kit.ts';
import type {
  ArtMessage,
  ArtPack,
  AtlasFrame,
  AtlasJson,
  Manifest,
  ManifestAsset,
  ManifestPart,
  RigFile,
} from '../../src/renderer/src/art/rigFile.ts';
import type { Rect } from './image.ts';
import { bleed, crop, halve, rimOf, rotateCw } from './image.ts';
import { pack } from './pack.ts';
import type { Rgba } from './png.ts';
import { encodePng } from './png.ts';
import type { PartPixels } from './validate.ts';
import { analyze } from './validate.ts';

export const ROOT = resolve(import.meta.dirname, '../..');
export const SRC_DIR = join(ROOT, 'art/src');
export const OUT_DIR = join(ROOT, 'src/renderer/art');
/** Rim light width in game pixels (the code-drawn rim's crisp stroke is about this wide). */
export const RIM_PX = 8;
const PAD = 2;
const MAX_PAGE = 2048;

/** JSON with sorted keys and a final newline: the same data always makes the same bytes. */
export function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object')
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((k) => [k, sort((x as Record<string, unknown>)[k])]),
      );
    return x;
  };
  return JSON.stringify(sort(v), null, 1) + '\n';
}

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const down = (v: number): number => Math.floor(v / 4) * 4;
const up = (v: number): number => Math.ceil(v / 4) * 4;

interface Piece {
  name: string;
  /** The 4x picture, already rotated for feelers. */
  img: Rgba;
  /** The pivot as a fraction of the picture. */
  anchor: { x: number; y: number };
  rim: boolean;
}

/** Cut a part out at 4x, trimmed and aligned to 4 pixels so it halves cleanly. Feelers are turned to lie along +x. */
function cut(
  name: string,
  px: PartPixels,
  pivot: { x: number; y: number },
  rope: { length: number } | null,
): Piece {
  let box: Rect;
  if (rope) {
    // From the base dot straight up `length` pixels, as wide as the drawing, centered on the pivot.
    let half = 4;
    for (let y = 0; y < px.img.h; y++)
      for (let x = 0; x < px.img.w; x++)
        if (px.img.data[(y * px.img.w + x) * 4 + 3]! > 0)
          half = Math.max(half, Math.abs(px.x + x + 0.5 - pivot.x));
    const x0 = down(pivot.x - half - PAD);
    const x1 = up(pivot.x + half + PAD);
    const y1 = Math.round(pivot.y);
    const y0 = y1 - up(rope.length);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else {
    const x0 = down(px.x - PAD);
    const y0 = down(px.y - PAD);
    box = { x: x0, y: y0, w: up(px.x + px.img.w + PAD) - x0, h: up(px.y + px.img.h + PAD) - y0 };
  }
  let img = crop(px.img, { x: box.x - px.x, y: box.y - px.y, w: box.w, h: box.h });
  let anchor = { x: (pivot.x - box.x) / box.w, y: (pivot.y - box.y) / box.h };
  if (rope) {
    img = rotateCw(img);
    anchor = { x: 0, y: (pivot.x - box.x) / box.w };
  }
  return { name, img, anchor: { x: r3(anchor.x), y: r3(anchor.y) }, rim: !rope };
}

export interface BuiltAsset {
  entry: ManifestAsset;
  /** Output files by path relative to the output folder. */
  files: Record<string, Uint8Array>;
  messages: ArtMessage[];
}

/** Import one .ora against its rig. Pure: bytes in, files out. */
export function buildAsset(bytes: Uint8Array, rig: RigFile): BuiltAsset {
  const a = analyze(bytes, rig);
  const dir = rig.kind === 'face_kit' ? 'faces' : 'bugs';
  const entry: ManifestAsset = {
    id: rig.id,
    kind: rig.kind,
    sourceHash: sha256(bytes),
    rigHash: rig.rigHash,
    status: 'empty',
    pages: { '1': [], '2': [] },
    parts: {},
    face: [],
    ...(rig.faceAnchors ? { faceAnchors: scaledAnchors(rig) } : {}),
    report: a.messages,
  };
  const files: Record<string, Uint8Array> = {};
  if (a.messages.some((m) => m.level === 'error')) {
    entry.status = 'broken';
    return { entry, files, messages: a.messages };
  }
  if (a.untouched) return { entry, files, messages: a.messages };
  entry.status = 'drawn';
  const pieces: Piece[] = [];
  for (const part of rig.parts) {
    const px = a.parts.get(part.name);
    if (!px) continue;
    const pivot = a.pivots.get(part.name) ?? part.pivot;
    const rope = part.kind === 'rope' ? { length: part.length ?? 0 } : null;
    pieces.push(cut(part.name, px, pivot, rope));
    const mp: ManifestPart = {
      kind: part.kind,
      pivot: { x: r3((pivot.x - rig.origin.x) / rig.scale), y: r3((pivot.y - rig.origin.y) / rig.scale) },
    };
    if (part.length !== undefined) mp.length = r3(part.length / rig.scale);
    if (part.tintable) mp.tintable = true;
    if (part.form) mp.form = part.form;
    entry.parts[part.name] = mp;
  }
  for (const name of [...a.face.keys()].sort()) {
    const px = a.face.get(name)!;
    const pivot =
      rig.kind === 'face_kit'
        ? kitCell(name)
        : name.startsWith('mouth_')
          ? rig.faceAnchors!.mouth
          : rig.faceAnchors!.eye;
    const piece = cut(name, px, pivot, null);
    piece.rim = false;
    pieces.push(piece);
    entry.face.push(name);
  }
  for (const scale of [1, 2] as const) {
    const frames: { name: string; img: Rgba; anchor: { x: number; y: number } }[] = [];
    for (const p of pieces) {
      let img = halve(p.img);
      if (scale === 1) img = halve(img);
      bleed(img, 2);
      frames.push({ name: p.name, img, anchor: p.anchor });
      if (p.rim) {
        const grow = RIM_PX * scale;
        const rim = rimOf(img, grow);
        const pad = (rim.w - img.w) / 2;
        frames.push({
          name: `${p.name}@rim`,
          img: rim,
          anchor: { x: r3((p.anchor.x * img.w + pad) / rim.w), y: r3((p.anchor.y * img.h + pad) / rim.h) },
        });
      }
    }
    const packed = pack(
      frames.map((f) => ({ name: f.name, w: f.img.w, h: f.img.h })),
      MAX_PAGE,
      PAD,
    );
    packed.pages.forEach((size, page) => {
      const base = `${rig.id}@${scale}x${packed.pages.length > 1 ? `-${page + 1}` : ''}`;
      const sheet: Rgba = { w: size.w, h: size.h, data: new Uint8Array(size.w * size.h * 4) };
      const json: AtlasJson = {
        frames: {},
        meta: { image: `${base}.png`, size, scale, format: 'RGBA8888' },
      };
      for (const q of packed.placed.filter((x) => x.page === page)) {
        const f = frames.find((x) => x.name === q.name)!;
        for (let y = 0; y < f.img.h; y++)
          sheet.data.set(
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
      files[`${dir}/${base}.png`] = encodePng(sheet);
      files[`${dir}/${base}.json`] = new TextEncoder().encode(stableJson(json));
      entry.pages[String(scale) as '1' | '2'].push(`${dir}/${base}`);
    });
  }
  return { entry, files, messages: a.messages };
}

/** Built assets as a pack the game can install while running (hot reload, tests). */
export function toArtPack(built: readonly BuiltAsset[]): ArtPack {
  const pages: ArtPack['pages'] = {};
  for (const b of built)
    for (const page of [...b.entry.pages['1'], ...b.entry.pages['2']]) {
      const png = b.files[`${page}.png`]!;
      const json = JSON.parse(new TextDecoder().decode(b.files[`${page}.json`]!)) as AtlasJson;
      pages[page] = { png: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, json };
    }
  return { assets: built.map((b) => b.entry), pages };
}

/** Face anchors in game pixels from the rig origin. */
function scaledAnchors(rig: RigFile): ManifestAsset['faceAnchors'] {
  const f = rig.faceAnchors!;
  const s = rig.scale;
  return {
    eye: { x: r3((f.eye.x - rig.origin.x) / s), y: r3((f.eye.y - rig.origin.y) / s), r: r3(f.eye.r / s) },
    mouth: {
      x: r3((f.mouth.x - rig.origin.x) / s),
      y: r3((f.mouth.y - rig.origin.y) / s),
      s: r3(f.mouth.s / s),
    },
  };
}

/** The kit's reference sizes in game pixels: the eye white's radius and a mouth's width. */
export const KIT_REF = { eyeR: KIT_EYE_R / 4, mouthW: KIT_MOUTH_W / 4 };

export interface Source {
  id: string;
  ora: string;
  rig: string;
}

/** Every .ora with a rig.json next to it, in `art/src/bugs` and `art/src/faces`. */
export function findSources(srcDir = SRC_DIR): Source[] {
  const out: Source[] = [];
  for (const sub of ['bugs', 'faces']) {
    const dir = join(srcDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.ora')) continue;
      const id = f.slice(0, -4);
      out.push({ id, ora: join(dir, f), rig: join(dir, `${id}.rig.json`) });
    }
  }
  return out;
}

export interface BuildAll {
  manifest: Manifest;
  files: Record<string, Uint8Array>;
  messages: Map<string, ArtMessage[]>;
}

/** Import every source. Writes nothing. */
export function buildAll(srcDir = SRC_DIR): BuildAll {
  const manifest: Manifest = { schema: 1, assets: {} };
  const files: Record<string, Uint8Array> = {};
  const messages = new Map<string, ArtMessage[]>();
  for (const s of findSources(srcDir)) {
    if (!existsSync(s.rig)) {
      messages.set(s.id, [
        {
          level: 'error',
          text: `There's no ${s.id}.rig.json next to the file. Run "pnpm art:templates" to make it.`,
        },
      ]);
      continue;
    }
    const rig = JSON.parse(readFileSync(s.rig, 'utf8')) as RigFile;
    const built = buildAsset(new Uint8Array(readFileSync(s.ora)), rig);
    manifest.assets[s.id] = built.entry;
    Object.assign(files, built.files);
    messages.set(s.id, built.messages);
  }
  files['manifest.json'] = new TextEncoder().encode(stableJson(manifest));
  return { manifest, files, messages };
}

/** Every file under a folder, by path relative to it. */
function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.name !== 'README.md') out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

/** Write a build to the output folder, removing stale pages. Returns the paths written. */
export function writeBuild(build: Pick<BuildAll, 'files'>, outDir = OUT_DIR): string[] {
  const keep = new Set(Object.keys(build.files));
  for (const f of listFiles(outDir)) if (!keep.has(f)) rmSync(join(outDir, f));
  const written: string[] = [];
  for (const [path, bytes] of Object.entries(build.files)) {
    const full = join(outDir, path);
    if (existsSync(full) && Buffer.compare(readFileSync(full), Buffer.from(bytes)) === 0) continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    written.push(path);
  }
  return written;
}

/** What differs between a fresh build and the folder: stale, missing, and extra files. */
export function compareBuild(build: Pick<BuildAll, 'files'>, outDir = OUT_DIR): string[] {
  const problems: string[] = [];
  const on = new Set(listFiles(outDir));
  for (const [path, bytes] of Object.entries(build.files)) {
    if (!on.has(path)) problems.push(`${path} is missing`);
    else if (Buffer.compare(readFileSync(join(outDir, path)), Buffer.from(bytes)) !== 0)
      problems.push(`${path} is out of date`);
    on.delete(path);
  }
  for (const extra of on) problems.push(`${extra} has no source`);
  return problems;
}

const MARK = { error: 'x', warning: '!', info: '-' } as const;

/** The report as the artist sees it in the terminal. */
export function formatReport(id: string, messages: readonly ArtMessage[]): string {
  const lines = [`${id}.ora`];
  for (const m of messages) lines.push(`  ${MARK[m.level]} ${m.text}`);
  if (!messages.length) lines.push('  - All good.');
  return lines.join('\n');
}

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const srcDir = SRC_DIR;
  const t0 = performance.now();
  const build = buildAll(srcDir);
  let errors = 0;
  for (const [id, msgs] of build.messages) {
    errors += msgs.filter((m) => m.level === 'error').length;
    if (msgs.some((m) => m.level !== 'info') || !check) console.log(formatReport(id, msgs));
  }
  if (check) {
    const problems = compareBuild(build);
    for (const p of problems) console.log(`  x ${p}`);
    if (problems.length)
      console.log('The art files are out of date. Run "pnpm art:build" and commit the result.');
    const ms = Math.round(performance.now() - t0);
    console.log(
      `art:check: ${build.messages.size} files, ${errors} errors, ${problems.length} stale (${ms} ms)`,
    );
    return errors || problems.length ? 1 : 0;
  }
  const written = writeBuild(build);
  console.log(`art:build: ${written.length ? written.join(', ') : 'nothing changed'}`);
  return errors ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv.slice(2)));
