// Makes the crude test backdrop: loud flat strips for a few areas, a sky no
// one could mistake for the game's own, and a tone map, so a test (or a
// person) can tell at a glance that a backdrop comes from an art set. Test
// fixtures only, never real art.
//
//   node tests/e2e/fixtures/art/backdrop/make.ts
//
// It paints one .ora for every .strip.json in this folder. Make those with
//   pnpm art:backdrop-templates --out tests/e2e/fixtures/art/backdrop --scale 1 \
//     area_puddle_pond_mid area_flowerbed_stage_far
//   pnpm art:backdrop-templates --out tests/e2e/fixtures/art/backdrop area_puddle_pond_far
// and rerun this when an area changes size (a unit test checks the hashes).
// The plaza and the other areas have no strip here on purpose: tests check
// that they fall back to the code-drawn layers.

import type { SKRSContext2D } from '@napi-rs/canvas';
import { createCanvas } from '@napi-rs/canvas';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WriteNode } from '../../../../../scripts/art/ora.ts';
import { writeOra } from '../../../../../scripts/art/ora.ts';
import type { Rgba } from '../../../../../scripts/art/png.ts';
import { blank, encodePng } from '../../../../../scripts/art/png.ts';
import type { StripFile } from '../../../../../src/renderer/src/art/backdropData.ts';
import { DEFAULT_SKY, skyJson } from '../../../../../src/renderer/src/art/backdropData.ts';

const HERE = import.meta.dirname;

type Draw = (g: SKRSContext2D) => void;

/** A layer drawn with a 2D canvas, cropped tight with offsets the way Krita saves it. */
function layer(name: string, w: number, h: number, draw: Draw, more: Partial<WriteNode> = {}): WriteNode {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  // Hard edges: the same bytes on every machine.
  g.imageSmoothingEnabled = false;
  draw(g);
  const data = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
  // Canvas edges are antialiased differently across platforms: keep only solid pixels.
  for (let i = 3; i < data.length; i += 4) data[i] = data[i]! >= 128 ? 255 : 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { name, png: encodePng(blank(1, 1)), ...more } as WriteNode;
  const out: Rgba = blank(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++)
    out.data.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * out.w * 4);
  return { name, png: encodePng(out), x: x0, y: y0, ...more } as WriteNode;
}

/** A crude strip: far ones are magenta zigzag mountains with cyan lights, mid ones orange spikes. */
function crudeStrip(strip: StripFile): Uint8Array {
  const { w, h } = strip.canvas;
  const s = strip.scale;
  const ground = strip.ground * s;
  const far = strip.layer === 'far';
  const step = (far ? 220 : 90) * s;
  const top = (far ? 520 : 600) * s;
  // Rectangles only, on whole pixels, so every machine draws the same picture.
  const shapes: Draw = (g) => {
    g.fillStyle = far ? '#c13ad6' : '#ff8a1f';
    g.fillRect(0, ground - 60 * s, w, h - ground + 60 * s);
    for (let x = 0, i = 0; x < w; x += step, i++) {
      const peak = top + ((i * 97) % 5) * 40 * s;
      const half = Math.round(step * (far ? 0.5 : 0.18));
      // A stepped peak.
      for (let k = 0; k < 6; k++) {
        const y = peak + ((ground - peak) * k) / 6;
        const wk = Math.round((half * (k + 1)) / 6);
        g.fillRect(x + Math.round(step / 2) - wk, Math.round(y), wk * 2, Math.round(ground - y));
      }
    }
  };
  const shade: Draw = (g) => {
    g.fillStyle = '#9a9aff';
    g.fillRect(0, ground - 30 * s, w, 30 * s + h - ground);
  };
  const lights: Draw = (g) => {
    g.fillStyle = '#40f0ff';
    for (let x = step / 2, i = 0; x < w; x += step, i++) {
      const peak = top + ((i * 97) % 5) * 40 * s;
      g.fillRect(Math.round(x) - 6 * s, Math.round(peak) + 30 * s, 12 * s, 12 * s);
    }
  };
  const stack: WriteNode[] = [
    {
      name: 'guides',
      locked: true,
      children: [{ name: `guide_strip_${strip.stripHash}`, png: encodePng(blank(1, 1)), visible: false }],
    },
    ...(far ? [layer('glow', w, h, lights)] : []),
    {
      name: 'paint',
      children: [
        layer('shade', w, h, shade, { compositeOp: 'svg:multiply' }),
        layer('shapes', w, h, shapes),
        // A sketch the importer must leave out.
        layer('guide_sketch', w, h, (g) => {
          g.fillStyle = '#00ff00';
          g.fillRect(0, 0, w, 40 * s);
        }),
      ],
    },
  ];
  const tiny = encodePng(blank(1, 1));
  return writeOra({ w, h, stack, merged: tiny, thumbnail: tiny });
}

// A sky nothing like the game's own: lime days, plum nights, a pink sun, a green moon.
const sky = skyJson(DEFAULT_SKY) as {
  moments: Record<string, Record<string, unknown>>;
  sun: Record<string, string>;
  moon: Record<string, string>;
  stars: string[];
};
Object.assign(sky.moments.day!, { skyTop: '#3fd07a', skyBottom: '#d8ff9a', near: '#f6ecff', far: '#ffe8f0' });
Object.assign(sky.moments.night!, { skyTop: '#2a0a3a', skyBottom: '#4a1450', near: '#9a7ac8', far: '#5a3a8a' });
Object.assign(sky.moments.late_night!, { skyTop: '#2a0a3a', skyBottom: '#4a1450', near: '#9a7ac8' });
sky.sun.disc = '#ff7ad0';
sky.moon.disc = '#b8ffb0';
sky.stars = ['#ffb0f0', '#b0fff0'];

// Greens go magenta and browns go blue; the pond turns mint. The porch's
// soil is too grey for a tone rule, so a shade rule turns it teal.
const world = {
  tone: [
    { from: '#5aa845', to: '#d040c0', spread: 70 },
    { from: '#a8744f', to: '#3050b0', spread: 30 },
  ],
  shade: [{ area: 'area_under_porch', from: '#4a3540', to: '#206080' }],
  water: { surface: '#7af0c8', deep: '#1f8a7a' },
};

let n = 0;
for (const f of readdirSync(HERE).sort()) {
  if (!f.endsWith('.strip.json')) continue;
  const strip = JSON.parse(readFileSync(join(HERE, f), 'utf8')) as StripFile;
  writeFileSync(join(HERE, `${strip.id}.ora`), crudeStrip(strip));
  n++;
}
writeFileSync(join(HERE, 'sky.json'), JSON.stringify(sky, null, 2) + '\n');
writeFileSync(join(HERE, 'world.json'), JSON.stringify(world, null, 2) + '\n');
console.log(`Wrote the crude test backdrop (${n} strips, sky.json, world.json) to tests/e2e/fixtures/art/backdrop/.`);
