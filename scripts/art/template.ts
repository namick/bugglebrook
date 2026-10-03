import { checkSetId } from './sets.ts';
// Art templates: turns the guide pictures the game draws (src/renderer/src/art/
// template.ts) into a layered .ora for the artist, plus its rig.json. Run with
// `pnpm art:templates` (scripts/art/templates.ts), which drives the real app.
// docs/06-art-guide.md, B5.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RigFile } from '../../src/renderer/src/art/rigFile.ts';
import { ROOT, stableJson } from './build.ts';
import { composite, fitWithin } from './image.ts';
import type { OraNode, WriteNode } from './ora.ts';
import { readOra, writeOra } from './ora.ts';
import type { Rgba } from './png.ts';
import { blank, decodePng, encodePng } from './png.ts';

/** The guide pictures for one template, as PNG bytes the size of the canvas. */
export interface Guides {
  rig: RigFile;
  current: Uint8Array;
  pivots: Uint8Array;
  safe: Uint8Array;
  notes: Uint8Array;
}

/** How faint the code-drawn bug is in the template. */
export const CURRENT_OPACITY = 0.35;

/** Face pieces that start in a bug's own face group (A4: dark heads need light pink line mouths). */
export const FACE_STARTERS: Record<string, readonly string[]> = {
  bug_ladybug_dot: [
    'mouth_smile',
    'mouth_chew_1',
    'mouth_chew_2',
    'mouth_wobble_1',
    'mouth_wobble_2',
    'mouth_flat',
    'mouth_frown',
  ],
  bug_firefly_flick: [
    'mouth_smile',
    'mouth_chew_1',
    'mouth_chew_2',
    'mouth_wobble_1',
    'mouth_wobble_2',
    'mouth_flat',
    'mouth_frown',
  ],
};

/** A 1 x 1 transparent PNG: what Krita saves for an empty layer. */
export const emptyPng = (): Uint8Array => encodePng(blank(1, 1));

/** A data URL's bytes. */
export function fromDataUrl(url: string): Uint8Array {
  const comma = url.indexOf(',');
  return new Uint8Array(Buffer.from(url.slice(comma + 1), 'base64'));
}

/** Re-encode with our encoder, so the bytes don't depend on the browser's PNG settings. */
const normalize = (png: Uint8Array): Uint8Array => encodePng(decodePng(png));

/** The locked guides group, top first. */
function guideGroup(g: Guides): WriteNode {
  return {
    name: 'guides',
    locked: true,
    children: [
      { name: 'guide_notes', png: normalize(g.notes) },
      { name: 'guide_safe', png: normalize(g.safe) },
      { name: 'guide_pivots', png: normalize(g.pivots) },
      { name: 'guide_current', png: normalize(g.current), opacity: CURRENT_OPACITY },
      { name: `guide_rig_${g.rig.rigHash}`, png: emptyPng(), visible: false },
    ],
  };
}

/** What the file looks like flattened: the guides (part layers start empty). */
function merged(g: Guides): { merged: Uint8Array; thumbnail: Uint8Array } {
  const { w, h } = g.rig.canvas;
  const out: Rgba = blank(w, h);
  const layers: [Uint8Array, number][] = [
    [g.current, CURRENT_OPACITY],
    [g.pivots, 1],
    [g.safe, 1],
    [g.notes, 1],
  ];
  for (const [png, opacity] of layers) composite(out, decodePng(png), 0, 0, opacity);
  return { merged: encodePng(out), thumbnail: encodePng(fitWithin(out, 256)) };
}

/** A fresh template: guides, empty part layers front to back, and the face group. */
export function buildTemplate(g: Guides): Uint8Array {
  const rig = g.rig;
  const empty = (name: string): WriteNode => ({ name, png: emptyPng() });
  const stack: WriteNode[] = [guideGroup(g)];
  if (rig.kind === 'face_kit') stack.push({ name: 'face', children: rig.face.map(empty) });
  else {
    stack.push({ name: 'parts', children: [...rig.parts].reverse().map((p) => empty(p.name)) });
    stack.push({ name: 'face', children: (FACE_STARTERS[rig.id] ?? []).map(empty) });
  }
  return writeOra({ w: rig.canvas.w, h: rig.canvas.h, stack, ...merged(g) });
}

/** A node read from a file, written back as it was: same pictures, same data paths. */
export function keep(node: OraNode, files: Record<string, Uint8Array>): WriteNode {
  const base = {
    name: node.name,
    opacity: node.opacity,
    visible: node.visible,
    compositeOp: node.compositeOp,
    ...(node.attrs['edit-locked'] === 'true' ? { locked: true } : {}),
  };
  if (node.kind === 'stack') return { ...base, children: node.children.map((c) => keep(c, files)) };
  return { ...base, png: files[node.src] ?? emptyPng(), src: node.src, x: node.x, y: node.y };
}

/**
 * Swap in new guides and keep every other layer byte for byte. Used when the
 * rig changed after the artist started drawing.
 */
export function refreshGuides(existing: Uint8Array, g: Guides): Uint8Array {
  const doc = readOra(existing);
  const stack = doc.root.children.map((n) => (n.name === 'guides' ? guideGroup(g) : keep(n, doc.files)));
  if (!doc.root.children.some((n) => n.name === 'guides')) stack.unshift(guideGroup(g));
  return writeOra({ w: g.rig.canvas.w, h: g.rig.canvas.h, stack, ...merged(g) });
}

export interface Placed {
  id: string;
  /** Where the .ora went, relative to the repo. */
  ora: string;
  action: 'created' | 'refreshed' | 'fresh copy';
}

/**
 * Write a template where it belongs. A new bug's goes straight into art/src/
 * (nothing to lose). An existing source is never overwritten: with `refresh`
 * its guides are swapped in place, otherwise the fresh template goes to
 * art/templates/ for comparing.
 */
export function placeTemplate(g: Guides, opts: { refresh: boolean; root?: string; setId?: string }): Placed {
  const root = opts.root ?? ROOT;
  const sub = g.rig.kind === 'face_kit' ? 'faces' : 'bugs';
  const prefix = opts.setId && opts.setId !== 'reference' ? `sets/${checkSetId(opts.setId)}/` : '';
  const srcDir = join(root, 'art/src', prefix, sub);
  const src = join(srcDir, `${g.rig.id}.ora`);
  const rigJson = new TextEncoder().encode(stableJson(g.rig));
  if (!existsSync(src)) {
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(src, buildTemplate(g));
    writeFileSync(join(srcDir, `${g.rig.id}.rig.json`), rigJson);
    return { id: g.rig.id, ora: `art/src/${prefix}${sub}/${g.rig.id}.ora`, action: 'created' };
  }
  if (opts.refresh) {
    writeFileSync(src, refreshGuides(new Uint8Array(readFileSync(src)), g));
    writeFileSync(join(srcDir, `${g.rig.id}.rig.json`), rigJson);
    return { id: g.rig.id, ora: `art/src/${prefix}${sub}/${g.rig.id}.ora`, action: 'refreshed' };
  }
  const out = join(root, 'art/templates', prefix);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${g.rig.id}.ora`), buildTemplate(g));
  writeFileSync(join(out, `${g.rig.id}.rig.json`), rigJson);
  return { id: g.rig.id, ora: `art/templates/${prefix}${g.rig.id}.ora`, action: 'fresh copy' };
}
