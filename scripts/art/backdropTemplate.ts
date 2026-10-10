// Strip templates: turns the guide pictures the game draws for a painted
// parallax strip (src/renderer/src/art/backdropTemplate.ts) into a layered
// .ora, plus its strip.json. Run with `node scripts/art/backdropTemplates.ts`,
// which drives the real app. docs/06-art-guide.md, B14.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkyMoment, StripFile } from '../../src/renderer/src/art/backdropData.ts';
import {
  DEFAULT_SKY,
  DEFAULT_WORLD,
  GLOW_LAYER,
  skyJson,
  worldJson,
} from '../../src/renderer/src/art/backdropData.ts';
import { BACKDROP_DIR } from './backdrop.ts';
import { ROOT, stableJson } from './build.ts';
import { composite, fitWithin } from './image.ts';
import type { WriteNode } from './ora.ts';
import { readOra, writeOra } from './ora.ts';
import type { Rgba } from './png.ts';
import { blank, decodePng, encodePng } from './png.ts';
import { checkSetId } from './sets.ts';
import { emptyPng, fromDataUrl, keep } from './template.ts';

/** The guide pictures for one strip template, as PNG bytes the size of the canvas. */
export interface StripGuidePngs {
  strip: StripFile;
  current: Uint8Array;
  lines: Uint8Array;
  unseen: Uint8Array;
  notes: Uint8Array;
}

/** What the in-game hook returns: data URLs, the code-drawn layer in tiles. */
export interface StripGuideUrls {
  strip: StripFile;
  current: { x: number; png: string }[];
  lines: string;
  unseen: string;
  notes: string;
}

/** How strong the code-drawn layer shows under the painting. */
export const UNDER_OPACITY = 0.6;

/** Join the tiles of the code-drawn layer and re-encode everything with our encoder. */
export function stripGuides(g: StripGuideUrls): StripGuidePngs {
  const { w, h } = g.strip.canvas;
  const current = blank(w, h);
  for (const tile of g.current) composite(current, decodePng(fromDataUrl(tile.png)), tile.x, 0);
  const normalize = (url: string): Uint8Array => encodePng(decodePng(fromDataUrl(url)));
  return {
    strip: g.strip,
    current: encodePng(current),
    lines: normalize(g.lines),
    unseen: normalize(g.unseen),
    notes: normalize(g.notes),
  };
}

const channel = (c: number, shift: number): number => (c >> shift) & 255;

/** A stepped line through [offset, value] stops, like a canvas gradient. */
function ramp(stops: readonly (readonly [number, number])[], t: number): number {
  if (t <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [o1, v1] = stops[i]!;
    const [o0, v0] = stops[i - 1]!;
    if (t <= o1) return v0 + ((v1 - v0) * (t - o0)) / Math.max(1e-6, o1 - o0);
  }
  return stops[stops.length - 1]![1];
}

/** The sky at one moment (the game's own noon by default), so a painter sees the hills against what will be behind them. */
export function skyGuide(w: number, h: number, day: SkyMoment = DEFAULT_SKY.moments.day): Rgba {
  const img = blank(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    // The same three sprites `Background.drawSky` stacks: a flat base, the top gradient, the horizon glow.
    const top = ramp(
      [
        [0, 1],
        [0.3, 0.75],
        [0.66, 0],
      ],
      t,
    );
    const glow =
      ramp(
        [
          [0.3, 0],
          [0.72, 0.85],
          [1, 0.35],
        ],
        t,
      ) * day.horizonAlpha;
    const rgb = [16, 8, 0].map((s) => {
      const base = channel(day.skyBottom, s) + (channel(day.skyTop, s) - channel(day.skyBottom, s)) * top;
      return Math.round(base + (channel(day.horizon, s) - base) * glow);
    });
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = rgb[0]!;
      img.data[i + 1] = rgb[1]!;
      img.data[i + 2] = rgb[2]!;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/** The name of the hidden layer that stamps a template with its strip hash. */
export const stampName = (hash: string): string => `guide_strip_${hash}`;

/** The locked guides on top: notes, lines, and the never-seen shading. */
function topGuides(g: StripGuidePngs): WriteNode {
  return {
    name: 'guides',
    locked: true,
    children: [
      { name: 'guide_notes', png: g.notes },
      { name: 'guide_lines', png: g.lines },
      { name: 'guide_unseen', png: g.unseen },
      { name: stampName(g.strip.stripHash), png: emptyPng(), visible: false },
    ],
  };
}

/** The locked guides underneath: the code-drawn layer over the noon sky. */
function underGuides(g: StripGuidePngs, sky: Uint8Array): WriteNode {
  return {
    name: 'guides_under',
    locked: true,
    children: [
      { name: 'guide_current', png: g.current, opacity: UNDER_OPACITY },
      { name: 'guide_sky', png: sky },
    ],
  };
}

function merged(g: StripGuidePngs, sky: Rgba): { merged: Uint8Array; thumbnail: Uint8Array } {
  const out: Rgba = { w: sky.w, h: sky.h, data: new Uint8Array(sky.data) };
  const layers: [Uint8Array, number][] = [
    [g.current, UNDER_OPACITY],
    [g.unseen, 1],
    [g.lines, 1],
    [g.notes, 1],
  ];
  for (const [png, opacity] of layers) composite(out, decodePng(png), 0, 0, opacity);
  return { merged: encodePng(out), thumbnail: encodePng(fitWithin(out, 256)) };
}

/** A fresh strip template: guides on top, an empty `glow` and `paint` layer, and the code-drawn layer underneath. */
export function buildStripTemplate(g: StripGuidePngs): Uint8Array {
  const { w, h } = g.strip.canvas;
  const sky = skyGuide(w, h);
  const stack: WriteNode[] = [
    topGuides(g),
    { name: GLOW_LAYER, png: emptyPng() },
    { name: 'paint', png: emptyPng() },
    underGuides(g, encodePng(sky)),
  ];
  return writeOra({ w, h, stack, ...merged(g, sky) });
}

/** Swap in new guides and keep every painted layer byte for byte. */
export function refreshStripGuides(existing: Uint8Array, g: StripGuidePngs): Uint8Array {
  const { w, h } = g.strip.canvas;
  const sky = skyGuide(w, h);
  const doc = readOra(existing);
  const painted = doc.root.children.filter((n) => !n.name.startsWith('guide')).map((n) => keep(n, doc.files));
  const stack: WriteNode[] = [topGuides(g), ...painted, underGuides(g, encodePng(sky))];
  return writeOra({ w, h, stack, ...merged(g, sky) });
}

export interface PlacedStrip {
  id: string;
  /** Where the .ora went. */
  ora: string;
  action: 'created' | 'refreshed' | 'fresh copy';
}

/**
 * Write a strip template where it belongs. With `out`, into that folder
 * (anywhere, for handing templates to painters). Otherwise a new strip's goes
 * into the set's `backdrop/` folder; an existing source is never overwritten:
 * with `refresh` its guides are swapped in place, else the fresh template
 * goes to art/templates/ for comparing.
 */
export function placeStripTemplate(
  g: StripGuidePngs,
  opts: { refresh: boolean; setId?: string; root?: string; out?: string },
): PlacedStrip {
  const id = g.strip.id;
  const json = new TextEncoder().encode(stableJson(g.strip));
  const write = (dir: string, bytes: Uint8Array): string => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.ora`), bytes);
    writeFileSync(join(dir, `${id}.strip.json`), json);
    return join(dir, `${id}.ora`);
  };
  if (opts.out) {
    const existing = join(opts.out, `${id}.ora`);
    if (existsSync(existing) && opts.refresh)
      return {
        id,
        ora: write(opts.out, refreshStripGuides(new Uint8Array(readFileSync(existing)), g)),
        action: 'refreshed',
      };
    return { id, ora: write(opts.out, buildStripTemplate(g)), action: 'created' };
  }
  const root = opts.root ?? ROOT;
  const prefix = opts.setId && opts.setId !== 'reference' ? `sets/${checkSetId(opts.setId)}/` : '';
  const srcDir = join(root, 'art/src', prefix, BACKDROP_DIR);
  const src = join(srcDir, `${id}.ora`);
  if (!existsSync(src)) return { id, ora: write(srcDir, buildStripTemplate(g)), action: 'created' };
  if (opts.refresh)
    return {
      id,
      ora: write(srcDir, refreshStripGuides(new Uint8Array(readFileSync(src)), g)),
      action: 'refreshed',
    };
  return {
    id,
    ora: write(join(root, 'art/templates', prefix, BACKDROP_DIR), buildStripTemplate(g)),
    action: 'fresh copy',
  };
}

/** Starter `sky.json` and `world.json`: the game's own look written out in full, so nothing changes until edited. */
export function starterJson(): { sky: string; world: string } {
  return {
    sky: JSON.stringify(skyJson(DEFAULT_SKY), null, 2) + '\n',
    world: JSON.stringify(worldJson(DEFAULT_WORLD), null, 2) + '\n',
  };
}

/** Write the starter JSON files into a folder, leaving any that are already there. */
export function placeStarterJson(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const made: string[] = [];
  const starter = starterJson();
  for (const [name, text] of [
    ['sky.json', starter.sky],
    ['world.json', starter.world],
  ] as const) {
    const file = join(dir, name);
    if (existsSync(file)) continue;
    writeFileSync(file, text);
    made.push(file);
  }
  return made;
}
