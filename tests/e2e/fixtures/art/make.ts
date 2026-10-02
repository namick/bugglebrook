// Makes the crude test art pack: a deliberately simple Dot and face kit in flat
// shapes and loud colors, so a test (or a person) can tell at a glance that a
// bug is drawn from sprites. Test fixtures only, never real art.
//
//   node tests/e2e/fixtures/art/make.ts
//
// Rerun it when Dot's rig or the face kit changes (a unit test checks).

import type { SKRSContext2D } from '@napi-rs/canvas';
import { createCanvas } from '@napi-rs/canvas';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WriteNode } from '../../../../scripts/art/ora.ts';
import { writeOra } from '../../../../scripts/art/ora.ts';
import type { Rgba } from '../../../../scripts/art/png.ts';
import { blank, encodePng } from '../../../../scripts/art/png.ts';
import { FACE_KIT, KIT_EYE_R, KIT_MOUTH_W, kitCell } from '../../../../src/renderer/src/art/kit.ts';
import type { RigFile } from '../../../../src/renderer/src/art/rigFile.ts';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '../../../..');

type Draw = (g: SKRSContext2D) => void;

/** A layer drawn with a 2D canvas, cropped tight with offsets the way Krita saves it. */
function layer(name: string, w: number, h: number, draw: Draw): WriteNode {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  draw(g);
  const data = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
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
  if (x1 < 0) return { name, png: encodePng(blank(1, 1)) };
  const out: Rgba = blank(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++)
    out.data.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * out.w * 4);
  return { name, png: encodePng(out), x: x0, y: y0 };
}

const fill = (g: SKRSContext2D, color: string): void => {
  g.fillStyle = color;
  g.fill();
};

function rect(g: SKRSContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.beginPath();
  g.rect(x, y, w, h);
  fill(g, color);
}

function bar(g: SKRSContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string): void {
  g.lineWidth = width;
  g.lineCap = 'square';
  g.strokeStyle = color;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function poly(g: SKRSContext2D, pts: number[], color: string, width = 0): void {
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  if (width) {
    g.lineWidth = width;
    g.lineJoin = 'miter';
    g.strokeStyle = color;
    g.stroke();
  } else {
    g.closePath();
    fill(g, color);
  }
}

const merged = (w: number, h: number) => ({ merged: encodePng(blank(w, h)), thumbnail: encodePng(blank(64, 64)) });

/** Dot as flat geometric shapes: an orange shell with blue squares, a teal box head, purple stick legs. */
function crudeDot(rig: RigFile): Uint8Array {
  const { w, h } = rig.canvas;
  const P = Object.fromEntries(rig.parts.map((p) => [p.name, p]));
  const r = 50 * rig.scale;
  const o = rig.origin;
  const at = (fx: number, fy: number): [number, number] => [o.x + fx * r, o.y + fy * r];
  const parts: Record<string, Draw> = {
    wing: (g) => {
      const p = P.wing!.pivot;
      g.globalAlpha = 0.7;
      rect(g, p.x - 0.28 * r, p.y - 1.1 * r, 0.56 * r, 1.1 * r, '#7fe9ff');
      g.globalAlpha = 1;
    },
    leg_upper: (g) => {
      const p = P.leg_upper!;
      bar(g, p.pivot.x, p.pivot.y, p.pivot.x, p.pivot.y + p.length!, 28, '#3b1f8f');
    },
    leg_lower: (g) => {
      const p = P.leg_lower!;
      bar(g, p.pivot.x, p.pivot.y, p.pivot.x, p.pivot.y + p.length!, 24, '#3b1f8f');
      rect(g, p.pivot.x - 20, p.pivot.y + p.length! - 12, 44, 24, '#ffd000');
    },
    belly: (g) => {
      const [x, y] = at(-0.1, 0.42);
      rect(g, x - 0.95 * r, y - 0.3 * r, 1.9 * r, 0.6 * r, '#2f2a5a');
    },
    head: (g) => {
      const [x, y] = at(0.8, 0.12);
      rect(g, x - 0.52 * r, y - 0.52 * r, 1.04 * r, 1.04 * r, '#14a39a');
    },
    shell: (g) => {
      const [cx, cy] = at(-0.15, 0.34);
      const pts: number[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        pts.push(cx + Math.cos(a) * 1.02 * r, cy + Math.sin(a) * 1.14 * r);
      }
      poly(g, pts, '#ff7a00');
      for (const [sx, sy] of [
        [-0.6, -0.4],
        [-0.1, -0.65],
        [0.3, -0.25],
        [-0.75, 0.05],
        [-0.25, 0.05],
      ] as const) {
        const [x, y] = at(sx, sy);
        rect(g, x - 0.12 * r, y - 0.12 * r, 0.24 * r, 0.24 * r, '#1f4fff');
      }
    },
    antenna: (g) => {
      const p = P.antenna!;
      bar(g, p.pivot.x, p.pivot.y, p.pivot.x, p.pivot.y - p.length!, 22, '#a0208f');
    },
    antenna_tip: (g) => {
      const p = P.antenna_tip!.pivot;
      rect(g, p.x - 24, p.y - 24, 48, 48, '#ffd000');
    },
  };
  const m = rig.faceAnchors!.mouth;
  const pink = '#ff4fd8';
  const line = Math.max(10, m.s * 0.12);
  const zig = (g: SKRSContext2D, k: number, dy: number): void => {
    const pts: number[] = [];
    for (let i = 0; i <= 4; i++) pts.push(m.x - m.s / 2 + (i * m.s) / 4, m.y + (i % 2 ? dy : 0) * k);
    poly(g, pts, pink, line);
  };
  const face: Record<string, Draw> = {
    mouth_smile: (g) => poly(g, [m.x - m.s / 2, m.y, m.x, m.y + m.s * 0.3, m.x + m.s / 2, m.y], pink, line),
    mouth_chew_1: (g) => zig(g, 1, m.s * 0.15),
    mouth_chew_2: (g) => zig(g, -1, m.s * 0.15),
    mouth_wobble_1: (g) => zig(g, 1, m.s * 0.1),
    mouth_wobble_2: (g) => zig(g, -1, m.s * 0.1),
    mouth_flat: (g) => bar(g, m.x - m.s / 2, m.y, m.x + m.s / 2, m.y, line, pink),
    mouth_frown: (g) => poly(g, [m.x - m.s / 2, m.y + m.s * 0.2, m.x, m.y - m.s * 0.1, m.x + m.s / 2, m.y + m.s * 0.2], pink, line),
  };
  const stack: WriteNode[] = [
    { name: 'guides', locked: true, children: [{ name: `guide_rig_${rig.rigHash}`, png: encodePng(blank(1, 1)), visible: false }] },
    { name: 'parts', children: [...rig.parts].reverse().map((p) => layer(p.name, w, h, parts[p.name]!)) },
    { name: 'face', children: Object.entries(face).map(([n, d]) => layer(n, w, h, d)) },
  ];
  return writeOra({ w, h, stack, ...merged(w, h) });
}

/** The face kit as blocky shapes: square eyes, a diamond heart, zigzag mouths. */
function crudeKit(rig: RigFile): Uint8Array {
  const { w, h } = rig.canvas;
  const R = KIT_EYE_R;
  const M = KIT_MOUTH_W;
  const ink = '#1a1440';
  const draw: Record<string, (g: SKRSContext2D, x: number, y: number) => void> = {
    eye_white: (g, x, y) => {
      rect(g, x - R, y - R, 2 * R, 2 * R, ink);
      rect(g, x - R + 12, y - R + 12, 2 * R - 24, 2 * R - 24, '#ffffff');
    },
    eye_pupil: (g, x, y) => rect(g, x - R * 0.5, y - R * 0.5, R, R, '#000000'),
    eye_closed: (g, x, y) => bar(g, x - R, y, x + R, y, 16, ink),
    eye_happy: (g, x, y) => poly(g, [x - R, y + R * 0.3, x, y - R * 0.6, x + R, y + R * 0.3], ink, 16),
    eye_squint: (g, x, y) => poly(g, [x - R * 0.7, y - R * 0.6, x + R * 0.5, y, x - R * 0.7, y + R * 0.6], ink, 16),
    eye_squeezed: (g, x, y) => {
      bar(g, x - R, y - R, x + R, y + R, 16, ink);
      bar(g, x + R, y - R, x - R, y + R, 16, ink);
    },
    eye_spiral: (g, x, y) => poly(g, [x, y, x + R * 0.3, y, x + R * 0.3, y + R * 0.3, x - R * 0.6, y + R * 0.3, x - R * 0.6, y - R * 0.6, x + R * 0.8, y - R * 0.6], ink, 12),
    eye_heart: (g, x, y) => poly(g, [x, y - R, x + R, y, x, y + R, x - R, y], '#ff2050'),
    eye_sleepy_lid: (g, x, y) => rect(g, x - R, y - R, 2 * R, R, '#d0d0d0'),
    brow_angry: (g, x, y) => bar(g, x - R, y - R * 1.4, x + R, y - R * 0.6, 20, ink),
    brow_worried: (g, x, y) => bar(g, x - R, y - R * 1.1, x + R, y - R * 1.6, 16, ink),
    brow_polite: (g, x, y) => bar(g, x - R, y - R * 1.2, x + R, y - R * 1.6, 14, ink),
    cheek: (g, x, y) => rect(g, x - R * 0.5, y - R * 0.3, R, R * 0.6, '#ff8fd0'),
  };
  const mouth = (g: SKRSContext2D, x: number, y: number, name: string): void => {
    const i = FACE_KIT.indexOf(name as never);
    const open = ['mouth_grin', 'mouth_o', 'mouth_whee', 'mouth_aah', 'mouth_teeth'].includes(name);
    if (open) {
      const mh = name === 'mouth_o' ? M * 0.3 : M * 0.45;
      const mw = name === 'mouth_o' ? M * 0.4 : M;
      rect(g, x - mw / 2, y - mh * 0.2, mw, mh, ink);
      rect(g, x - mw / 2 + 10, y - mh * 0.2 + 10, mw - 20, mh - 20, name === 'mouth_teeth' ? '#ffffff' : '#c0205a');
      return;
    }
    const pts: number[] = [];
    for (let k = 0; k <= 4; k++) pts.push(x - M / 2 + (k * M) / 4, y + ((k + i) % 2 ? M * 0.12 : 0));
    poly(g, pts, ink, 14);
    if (name === 'mouth_lick' || name === 'mouth_tongue') rect(g, x + M * 0.15, y, M * 0.2, M * 0.3, '#ff7a93');
    if (name === 'mouth_puff') {
      rect(g, x - M * 0.6, y - M * 0.1, M * 0.25, M * 0.25, '#a0e070');
      rect(g, x + M * 0.35, y - M * 0.1, M * 0.25, M * 0.25, '#a0e070');
    }
  };
  const layers = FACE_KIT.map((name) =>
    layer(name, w, h, (g) => {
      const { x, y } = kitCell(name);
      if (name.startsWith('mouth_')) mouth(g, x, y, name);
      else draw[name]!(g, x, y);
    }),
  );
  const stack: WriteNode[] = [
    { name: 'guides', locked: true, children: [{ name: `guide_rig_${rig.rigHash}`, png: encodePng(blank(1, 1)), visible: false }] },
    { name: 'face', children: layers },
  ];
  return writeOra({ w, h, stack, ...merged(w, h) });
}

const dotRig = join(ROOT, 'art/src/bugs/bug_ladybug_dot.rig.json');
const kitRig = join(ROOT, 'art/src/faces/face_kit.rig.json');
copyFileSync(dotRig, join(HERE, 'bug_ladybug_dot.rig.json'));
copyFileSync(kitRig, join(HERE, 'face_kit.rig.json'));
writeFileSync(join(HERE, 'bug_ladybug_dot.ora'), crudeDot(JSON.parse(readFileSync(dotRig, 'utf8')) as RigFile));
writeFileSync(join(HERE, 'face_kit.ora'), crudeKit(JSON.parse(readFileSync(kitRig, 'utf8')) as RigFile));
console.log('Wrote the crude test art pack to tests/e2e/fixtures/art/.');
