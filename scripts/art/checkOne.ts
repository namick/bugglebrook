// `pnpm art:check-one <file.ora> [--preview <dir>] [--strict]`
//
// Check one art file against the rig.json next to it, in a second or less,
// without touching the generated atlases: an item sheet, a bug, or the face
// kit. `pnpm art:build` rebuilds every set and must not run twice at once;
// this reads one file and is safe to run alongside anything.
//
// Exits 0 when the file has no errors and no warnings. With --strict it must
// also be finished: nothing left to paint and not a single message.
// --preview writes the atlas pages this file would build, and for an item
// sheet a picture of the paintings at game size, into a folder of your own.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ItemSheetFile } from '../../src/renderer/src/art/itemSheet.ts';
import type { ArtMessage, RigFile } from '../../src/renderer/src/art/rigFile.ts';
import { buildAsset, formatReport } from './build.ts';
import { composite, halve } from './image.ts';
import { analyzeItems, buildItemSheet } from './items.ts';
import type { Rgba } from './png.ts';
import { encodePng } from './png.ts';

export interface Checked {
  /** What to print. */
  text: string;
  /** No errors and no warnings. */
  ok: boolean;
  /** Finished: everything painted and no messages at all. */
  complete: boolean;
  /** Files a preview writes, by name. */
  files: Record<string, Uint8Array>;
}

/** The green the previews sit on: about the plaza's grass. */
const GRASS = [156, 207, 122, 255];

/** The sheet's good paintings on grass, at 2x and at game size. */
function previews(bytes: Uint8Array, sheet: ItemSheetFile): Record<string, Uint8Array> {
  const { w, h } = sheet.canvas;
  const full: Rgba = { w, h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < w * h; i++) full.data.set(GRASS, i * 4);
  for (const px of analyzeItems(bytes, sheet).items.values()) composite(full, px.img, px.x, px.y);
  const two = halve(full);
  return {
    [`${sheet.id}-preview@2x.png`]: encodePng(two),
    [`${sheet.id}-preview@1x.png`]: encodePng(halve(two)),
  };
}

const clean = (messages: readonly ArtMessage[]): boolean => messages.every((m) => m.level === 'info');

/** Check one file's bytes against its rig. Pure. */
export function checkOne(
  name: string,
  bytes: Uint8Array,
  rig: RigFile | ItemSheetFile,
  preview = false,
): Checked {
  if (rig.kind === 'item_sheet') {
    const built = buildItemSheet(bytes, rig);
    const lines = [formatReport(name, built.messages)];
    for (const item of rig.items) {
      const fit = built.fits.get(item.id);
      const state = built.entry.items.includes(item.id)
        ? 'painted'
        : built.messages.some((m) => m.layer === item.id && m.level === 'error')
          ? 'ERROR  '
          : 'blank  ';
      const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
      lines.push(
        `  ${state} ${item.id}${fit ? `  (outside the guide ${pct(fit.spill)}, guide left empty ${pct(fit.gap)})` : ''}`,
      );
    }
    const e = built.entry;
    lines.push(
      `status=${e.status} items=${e.items.length}/${rig.items.length} pages1x=${e.pages['1'].length} pages2x=${e.pages['2'].length}`,
    );
    return {
      text: lines.join('\n'),
      ok: e.status !== 'broken' && clean(built.messages),
      complete: e.items.length === rig.items.length && built.messages.length === 0,
      files: preview ? { ...built.files, ...previews(bytes, rig) } : {},
    };
  }
  const built = buildAsset(bytes, rig);
  const e = built.entry;
  const missing = rig.kind === 'bug' ? rig.face.filter((n) => !e.face.includes(n)) : [];
  const lines = [
    formatReport(name, built.messages),
    `status=${e.status} parts=${Object.keys(e.parts).length}/${rig.parts.length} face=${e.face.length}/${rig.face.length} pages1x=${e.pages['1'].length} pages2x=${e.pages['2'].length}`,
  ];
  if (missing.length) lines.push(`face pieces not drawn in this file: ${missing.join(', ')}`);
  return {
    text: lines.join('\n'),
    ok: e.status !== 'broken' && clean(built.messages),
    complete: e.status === 'drawn' && built.messages.length === 0 && missing.length === 0,
    files: preview ? built.files : {},
  };
}

function main(argv: string[]): number {
  const p = argv.indexOf('--preview');
  const out = p >= 0 ? argv[p + 1] : undefined;
  const strict = argv.includes('--strict');
  const file = argv.find((a, i) => !a.startsWith('--') && (p < 0 || i !== p + 1));
  if (!file || (p >= 0 && !out)) {
    console.error('usage: pnpm art:check-one <file.ora> [--preview <dir>] [--strict]');
    return 2;
  }
  const ora = resolve(file);
  const name = basename(ora, '.ora');
  const t0 = performance.now();
  let rig: RigFile | ItemSheetFile;
  try {
    rig = JSON.parse(readFileSync(join(dirname(ora), `${name}.rig.json`), 'utf8')) as RigFile | ItemSheetFile;
  } catch {
    console.error(`There's no ${name}.rig.json next to ${ora}. The template generator writes it.`);
    return 2;
  }
  const checked = checkOne(name, new Uint8Array(readFileSync(ora)), rig, !!out);
  console.log(checked.text);
  if (out) {
    for (const [path, bytes] of Object.entries(checked.files)) {
      const full = join(resolve(out), path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
    }
    console.log(`wrote ${Object.keys(checked.files).length} files under ${resolve(out)}`);
  }
  const pass = strict ? checked.complete : checked.ok;
  console.log(
    `${pass ? 'ok' : 'NOT ok'}${strict ? ' (strict: finished, no messages)' : ''} (${Math.round(performance.now() - t0)} ms)`,
  );
  return pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv.slice(2)));
