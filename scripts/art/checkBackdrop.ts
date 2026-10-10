// `node scripts/art/checkBackdrop.ts <file or folder ...> [--out <dir>] [--strict]`
//
// Checks one piece of a set's backdrop in a second or two, without touching
// the built art: a strip's .ora (its .strip.json must sit next to it), a
// sky.json, a world.json, or a folder holding any of them. It prints the same
// messages `pnpm art:build` would, plus what the game will make of the file.
//
// --out <dir> also writes pictures to look at: the strip as the game will use
// it (faded at its blend zones, cut to what shows), and that strip over the
// set's own noon and night skies, tinted the way the game tints it.
// --strict fails on warnings too (the bar for a finished set).
//
// It only reads the files it is given, so any number can run at once.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BackdropMessage, SkyPalette, StripFile } from '../../src/renderer/src/art/backdropData.ts';
import {
  DEFAULT_SKY,
  SKY_MOMENTS,
  WORLD_SWATCHES,
  hexColor,
  luma,
  parseSky,
  parseWorld,
  toneColor,
} from '../../src/renderer/src/art/backdropData.ts';
import type { BuiltStrip } from './backdrop.ts';
import { BACKDROP_DIR, buildStrip, readJson, readStripFile } from './backdrop.ts';
import { skyGuide } from './backdropTemplate.ts';
import { formatReport } from './build.ts';
import { composite } from './image.ts';
import type { Rgba } from './png.ts';
import { decodePng, encodePng } from './png.ts';

const pct = (v: number): string => `${Math.round((v / 255) * 100)}%`.padStart(4);

export interface Checked {
  name: string;
  messages: BackdropMessage[];
  /** What the game makes of the file, for the terminal. */
  notes: string[];
}

/** The sky a strip is previewed against: the `sky.json` next to it, or the game's own. */
function skyNear(dir: string): SkyPalette {
  const path = join(dir, 'sky.json');
  if (!existsSync(path)) return DEFAULT_SKY;
  return parseSky(readJson(path).value).sky ?? DEFAULT_SKY;
}

/** Multiply a picture by a tint, as the game grades a layer. */
function tinted(img: Rgba, tint: number): Rgba {
  const out: Rgba = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const t = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];
  for (let i = 0; i < out.data.length; i += 4)
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round((out.data[i + c]! * t[c]!) / 255);
  return out;
}

/** Add a picture's light onto another, as the game adds a glow. */
function addLight(dst: Rgba, src: Rgba, dx: number, dy: number, strength: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const si = (y * src.w + x) * 4;
      const di = (ty * dst.w + tx) * 4;
      const a = (src.data[si + 3]! / 255) * strength;
      for (let c = 0; c < 3; c++) dst.data[di + c] = Math.min(255, dst.data[di + c]! + src.data[si + c]! * a);
    }
}

/** A strip over the sky at noon and at night, the way the game shows it. */
export function stripPreviews(
  built: BuiltStrip,
  strip: StripFile,
  sky: SkyPalette = DEFAULT_SKY,
): { day: Rgba; night: Rgba } | null {
  const paint = built.entry.paint;
  const glow = built.entry.glow;
  if (!paint && !glow) return null;
  const w = strip.canvas.w / strip.scale;
  const h = strip.canvas.h / strip.scale;
  const out = {} as { day: Rgba; night: Rgba };
  for (const when of ['day', 'night'] as const) {
    const moment = sky.moments[when];
    const img = skyGuide(w, h, moment);
    if (paint)
      composite(
        img,
        tinted(decodePng(built.files[paint.image]!), moment[strip.layer]),
        paint.x - strip.x,
        paint.y,
      );
    // Night lights come on by how dark the near tint is, as `skyLook` works it out.
    const lit = Math.min(1, Math.max(0, (235 - luma(moment.near)) / 110));
    if (glow && lit > 0) addLight(img, decodePng(built.files[glow.image]!), glow.x - strip.x, glow.y, lit);
    out[when] = img;
  }
  return out;
}

function checkStrip(path: string, out: string | null): Checked {
  const id = basename(path, '.ora');
  const read = readStripFile(join(dirname(path), `${id}.strip.json`));
  if (!read.strip) return { name: id, messages: [read.message!], notes: [] };
  const strip = read.strip;
  const built = buildStrip(new Uint8Array(readFileSync(path)), strip);
  const notes: string[] = [`status: ${built.entry.status}`];
  for (const [what, img] of [
    ['painting', built.entry.paint],
    ['night glow', built.entry.glow],
  ] as const) {
    if (!img) continue;
    const kb = Math.round(built.files[img.image]!.length / 1024);
    notes.push(
      `${what}: ${img.w} x ${img.h} px in the game, ${kb} KB, at canvas x ${(img.x - strip.x) * strip.scale}, y ${img.y * strip.scale}`,
    );
  }
  if (out && Object.keys(built.files).length) {
    mkdirSync(out, { recursive: true });
    for (const [file, bytes] of Object.entries(built.files)) writeFileSync(join(out, basename(file)), bytes);
    const previews = stripPreviews(built, strip, skyNear(dirname(path)));
    if (previews) {
      writeFileSync(join(out, `${id}.day.png`), encodePng(previews.day));
      writeFileSync(join(out, `${id}.night.png`), encodePng(previews.night));
      notes.push(
        `pictures: ${join(out, id)}.png, .day.png, .night.png${built.entry.glow ? ', .glow.png' : ''}`,
      );
    }
  }
  return { name: id, messages: built.messages, notes };
}

function checkSky(path: string): Checked {
  const read = readJson(path);
  if (read.message) return { name: basename(path), messages: [read.message], notes: [] };
  const { sky, messages } = parseSky(read.value);
  const notes: string[] = [];
  if (sky) {
    notes.push('brightness, moment by moment (near tints every bug and toy):');
    for (const name of SKY_MOMENTS) {
      const m = sky.moments[name];
      notes.push(
        `  ${name.padEnd(11)} sky ${pct((luma(m.skyTop) + luma(m.skyBottom)) / 2)}  far ${pct(luma(m.far))}  mid ${pct(luma(m.mid))}  near ${pct(luma(m.near))}  front ${pct(luma(m.front))}`,
      );
    }
  }
  return { name: basename(path), messages, notes };
}

function checkWorld(path: string): Checked {
  const read = readJson(path);
  if (read.message) return { name: basename(path), messages: [read.message], notes: [] };
  const { world, messages } = parseWorld(read.value);
  const notes: string[] = [];
  if (world) {
    if (!world.tone.length) notes.push('no tone rules: the code-drawn world keeps its colors');
    else {
      notes.push('what the tone map does to the code-drawn world:');
      for (const [name, color] of WORLD_SWATCHES) {
        const to = toneColor(color, world.tone);
        notes.push(
          `  ${name.padEnd(26)} ${hexColor(color)} ${to === color ? 'stays' : `-> ${hexColor(to)}`}`,
        );
      }
    }
    notes.push(`water: ${hexColor(world.water.surface)} at the surface, ${hexColor(world.water.deep)} deep`);
  }
  return { name: basename(path), messages, notes };
}

/** The files a path names: itself, or everything checkable in a folder (a set's folder or its backdrop folder). */
export function filesAt(path: string): string[] {
  if (!existsSync(path)) throw new Error(`There is no ${path}.`);
  if (!statSync(path).isDirectory()) return [path];
  const dir = existsSync(join(path, BACKDROP_DIR)) ? join(path, BACKDROP_DIR) : path;
  return readdirSync(dir)
    .sort()
    .filter((f) => f.endsWith('.ora') || f === 'sky.json' || f === 'world.json')
    .map((f) => join(dir, f));
}

export function checkFile(path: string, out: string | null = null): Checked {
  const name = basename(path);
  if (name.endsWith('.ora')) return checkStrip(path, out);
  if (name === 'sky.json') return checkSky(path);
  if (name === 'world.json') return checkWorld(path);
  return {
    name,
    messages: [
      { level: 'error', text: 'Not part of a backdrop: give a strip .ora, sky.json, or world.json.' },
    ],
    notes: [],
  };
}

function main(argv: string[]): number {
  const args = [...argv];
  const strict = args.includes('--strict');
  const at = args.indexOf('--out');
  const out = at >= 0 ? resolve(args[at + 1] ?? '') : null;
  if (at >= 0) args.splice(at, 2);
  const paths = args.filter((a) => !a.startsWith('--'));
  if (!paths.length) {
    console.error(
      'usage: node scripts/art/checkBackdrop.ts <strip.ora | sky.json | world.json | folder ...> [--out <dir>] [--strict]',
    );
    return 2;
  }
  let errors = 0;
  let warnings = 0;
  let files = 0;
  for (const path of paths) {
    let list: string[];
    try {
      list = filesAt(resolve(path));
    } catch (e) {
      console.error((e as Error).message);
      return 2;
    }
    for (const file of list) {
      const t0 = performance.now();
      const r = checkFile(file, out);
      files++;
      errors += r.messages.filter((m) => m.level === 'error').length;
      warnings += r.messages.filter((m) => m.level === 'warning').length;
      console.log(formatReport(r.name, r.messages));
      for (const note of r.notes) console.log(`    ${note}`);
      console.log(`    (${Math.round(performance.now() - t0)} ms)`);
    }
  }
  console.log(`checkBackdrop: ${files} files, ${errors} errors, ${warnings} warnings`);
  return errors || (strict && warnings) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv.slice(2)));
