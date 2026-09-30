import type { Graphics } from 'pixi.js';
import type { Picto } from '../reactions';
import type { BugDef } from '../../../../game/data/types';
import { OUTLINE, STAR, lighten, stroke } from '../palette';
import { heartPath, spiral } from './face';

const LINE = 3.5;
const RED = 0xff4f5e;
const BLUE = 0x4d9bff;
const GREEN_FACE = 0xa6dc5a;
const YELLOW_FACE = 0xffd84d;
const GLOVE = 0xffd9b8;
const TONGUE = 0xff7a93;
const MOUTH = 0x7a2336;

/**
 * Draw one wordless pictogram centered at (x, y), about `s` pixels across.
 * `food` is drawn by the bubble itself (a mini item), not here.
 */
export function drawPicto(g: Graphics, picto: Picto, x: number, y: number, s: number, time = 0): void {
  const h = s / 2;
  const st = stroke(LINE);
  switch (picto) {
    case 'heart':
      heartPath(g, x, y, s * (1 + 0.06 * Math.sin(time * 10)))
        .fill(RED)
        .stroke(st);
      g.circle(x - h * 0.35, y - h * 0.3, h * 0.13).fill({ color: 0xffffff, alpha: 0.85 });
      return;
    case 'star':
      g.star(x, y, 5, h, h * 0.48, time * 0.8)
        .fill(STAR)
        .stroke(st);
      return;
    case 'exclaim':
      g.roundRect(x - h * 0.2, y - h * 0.95, h * 0.4, h * 1.25, h * 0.2)
        .fill(RED)
        .stroke(st);
      g.circle(x, y + h * 0.72, h * 0.22)
        .fill(RED)
        .stroke(st);
      return;
    case 'question':
      g.moveTo(x - h * 0.5, y - h * 0.35)
        .bezierCurveTo(x - h * 0.5, y - h * 1.05, x + h * 0.6, y - h * 1.05, x + h * 0.55, y - h * 0.4)
        .bezierCurveTo(x + h * 0.5, y - h * 0.05, x, y, x, y + h * 0.3)
        .stroke({ width: h * 0.42, color: OUTLINE, cap: 'round', join: 'round' });
      g.moveTo(x - h * 0.5, y - h * 0.35)
        .bezierCurveTo(x - h * 0.5, y - h * 1.05, x + h * 0.6, y - h * 1.05, x + h * 0.55, y - h * 0.4)
        .bezierCurveTo(x + h * 0.5, y - h * 0.05, x, y, x, y + h * 0.3)
        .stroke({ width: h * 0.22, color: BLUE, cap: 'round', join: 'round' });
      g.circle(x, y + h * 0.78, h * 0.2)
        .fill(BLUE)
        .stroke(st);
      return;
    case 'laugh':
    case 'yum':
    case 'yuck': {
      const color = picto === 'yuck' ? GREEN_FACE : YELLOW_FACE;
      g.circle(x, y, h).fill(color).stroke(st);
      if (picto === 'laugh') {
        for (const dx of [-0.38, 0.38])
          g.moveTo(x + h * dx - h * 0.2, y - h * 0.2)
            .quadraticCurveTo(x + h * dx, y - h * 0.5, x + h * dx + h * 0.2, y - h * 0.2)
            .stroke(stroke(3));
        g.moveTo(x - h * 0.55, y + h * 0.05)
          .quadraticCurveTo(x, y + h * 0.95, x + h * 0.55, y + h * 0.05)
          .closePath()
          .fill(MOUTH)
          .stroke(stroke(3));
        // Tears of laughter.
        for (const dx of [-1, 1])
          g.ellipse(x + dx * h * 0.95, y - h * 0.05, h * 0.14, h * 0.2)
            .fill(0x9fd8ff)
            .stroke(stroke(2));
        return;
      }
      if (picto === 'yum') {
        for (const dx of [-0.38, 0.38])
          g.moveTo(x + h * dx - h * 0.2, y - h * 0.15)
            .quadraticCurveTo(x + h * dx, y - h * 0.45, x + h * dx + h * 0.2, y - h * 0.15)
            .stroke(stroke(3));
        g.moveTo(x - h * 0.5, y + h * 0.2)
          .quadraticCurveTo(x, y + h * 0.7, x + h * 0.5, y + h * 0.2)
          .stroke(stroke(3));
        g.ellipse(x + h * 0.35, y + h * 0.42, h * 0.18, h * 0.22)
          .fill(TONGUE)
          .stroke(stroke(2.5));
        return;
      }
      // Yuck: squeezed-shut eyes, wavy mouth, tongue out.
      for (const dx of [-0.38, 0.38]) {
        const ex = x + h * dx;
        const k = dx < 0 ? 1 : -1;
        g.moveTo(ex - k * h * 0.2, y - h * 0.4)
          .lineTo(ex + k * h * 0.12, y - h * 0.22)
          .lineTo(ex - k * h * 0.2, y - h * 0.04)
          .stroke(stroke(3));
      }
      g.ellipse(x, y + h * 0.52, h * 0.18, h * 0.26)
        .fill(TONGUE)
        .stroke(stroke(2.5));
      g.moveTo(x - h * 0.5, y + h * 0.3);
      for (let i = 1; i <= 6; i++) g.lineTo(x - h * 0.5 + (h * i) / 6, y + h * (i % 2 ? 0.18 : 0.3));
      g.stroke(stroke(3));
      return;
    }
    case 'sweat':
      g.moveTo(x, y - h)
        .quadraticCurveTo(x + h * 0.75, y + h * 0.1, x, y + h * 0.75)
        .quadraticCurveTo(x - h * 0.75, y + h * 0.1, x, y - h)
        .fill(0x9fd8ff)
        .stroke(st);
      g.circle(x - h * 0.18, y + h * 0.2, h * 0.14).fill(0xffffff);
      return;
    case 'swirl':
      spiral(g, x, y, h * 0.9, 2.4, time * 5).stroke({
        width: h * 0.22,
        color: 0x9b6bd6,
        cap: 'round',
        join: 'round',
      });
      return;
    case 'dots':
      for (const dx of [-0.62, 0, 0.62]) g.circle(x + h * dx, y + h * 0.2, h * 0.19).fill(OUTLINE);
      return;
    case 'spring': {
      g.roundRect(x - h * 0.6, y + h * 0.6, h * 1.2, h * 0.3, 3)
        .fill(0x6c7a8c)
        .stroke(stroke(3));
      const pts: [number, number][] = [];
      for (let i = 0; i <= 6; i++)
        pts.push([x + (i % 2 ? h * 0.45 : -h * 0.45), y + h * 0.6 - (i / 6) * h * 1.2]);
      for (const [w, c] of [
        [7, OUTLINE],
        [3.5, 0xc7d3e3],
      ] as const) {
        pts.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
        g.stroke({ width: w, color: c, cap: 'round', join: 'round' });
      }
      g.roundRect(x - h * 0.6, y - h * 0.9, h * 1.2, h * 0.3, 3)
        .fill(0xff6b5b)
        .stroke(stroke(3));
      return;
    }
    case 'up':
      g.poly([
        x,
        y - h,
        x + h * 0.8,
        y - h * 0.1,
        x + h * 0.32,
        y - h * 0.1,
        x + h * 0.32,
        y + h * 0.9,
        x - h * 0.32,
        y + h * 0.9,
        x - h * 0.32,
        y - h * 0.1,
        x - h * 0.8,
        y - h * 0.1,
      ])
        .fill(0x5cc26a)
        .stroke(st);
      return;
    case 'thumbs_up':
    case 'thumbs_down': {
      // A fist with the thumb sticking up (or down).
      const k = picto === 'thumbs_up' ? 1 : -1;
      const fy = (v: number): number => y + v * h * k;
      g.roundRect(x - h * 0.55, Math.min(fy(-0.15), fy(0.8)), h * 1.2, h * 0.95, h * 0.28)
        .fill(GLOVE)
        .stroke(st);
      for (let i = 1; i <= 2; i++) {
        const ly = fy(-0.15 + i * 0.32);
        g.moveTo(x + h * 0.05, ly)
          .lineTo(x + h * 0.6, ly)
          .stroke(stroke(2.5));
      }
      g.roundRect(x - h * 0.55, Math.min(fy(-0.95), fy(0)), h * 0.46, h * 0.95, h * 0.22)
        .fill(GLOVE)
        .stroke(st);
      g.rect(x - h * 0.48, Math.min(fy(-0.2), fy(0.05)), h * 0.32, h * 0.25).fill(GLOVE);
      // A little cuff so it reads as a hand.
      g.roundRect(x + h * 0.62, Math.min(fy(-0.05), fy(0.7)), h * 0.3, h * 0.75, 4)
        .fill(BLUE)
        .stroke(stroke(3));
      return;
    }
    case 'cross':
      for (const d of [1, -1]) {
        g.moveTo(x - h * 0.7, y - h * 0.7 * d)
          .lineTo(x + h * 0.7, y + h * 0.7 * d)
          .stroke({ width: h * 0.55, color: OUTLINE, cap: 'round' });
      }
      for (const d of [1, -1]) {
        g.moveTo(x - h * 0.7, y - h * 0.7 * d)
          .lineTo(x + h * 0.7, y + h * 0.7 * d)
          .stroke({ width: h * 0.3, color: RED, cap: 'round' });
      }
      return;
    case 'grr':
      // The cartoon anger mark: four bulging corners.
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const cx = x + dx * h * 0.55;
        const cy = y + dy * h * 0.55;
        g.moveTo(cx - dx * h * 0.05, cy - dy * h * 0.55)
          .quadraticCurveTo(cx - dx * h * 0.05, cy - dy * h * 0.05, cx - dx * h * 0.55, cy - dy * h * 0.05)
          .stroke({ width: h * 0.34, color: OUTLINE, cap: 'round' });
        g.moveTo(cx - dx * h * 0.05, cy - dy * h * 0.55)
          .quadraticCurveTo(cx - dx * h * 0.05, cy - dy * h * 0.05, cx - dx * h * 0.55, cy - dy * h * 0.05)
          .stroke({ width: h * 0.18, color: RED, cap: 'round' });
      }
      return;
    case 'zzz':
      [
        [-0.45, 0.35, 0.5],
        [0.1, -0.1, 0.4],
        [0.55, -0.55, 0.3],
      ].forEach(([dx, dy, k]) => {
        const zx = x + h * dx!;
        const zy = y + h * dy!;
        const z = h * k!;
        g.moveTo(zx - z, zy - z)
          .lineTo(zx + z, zy - z)
          .lineTo(zx - z, zy + z)
          .lineTo(zx + z, zy + z)
          .stroke({ width: 4, color: 0x5b6ee1, cap: 'round', join: 'round' });
      });
      return;
    case 'note':
      g.ellipse(x - h * 0.25, y + h * 0.55, h * 0.36, h * 0.27).fill(OUTLINE);
      g.moveTo(x + h * 0.08, y + h * 0.5)
        .lineTo(x + h * 0.08, y - h * 0.85)
        .quadraticCurveTo(x + h * 0.55, y - h * 0.55, x + h * 0.65, y - h * 0.15)
        .stroke(stroke(5));
      return;
    case 'fire':
      g.moveTo(x, y - h)
        .bezierCurveTo(x + h * 0.9, y - h * 0.1, x + h * 0.8, y + h * 0.9, x, y + h * 0.9)
        .bezierCurveTo(x - h * 0.8, y + h * 0.9, x - h * 0.9, y - h * 0.1, x, y - h)
        .fill(0xff7a1f)
        .stroke(st);
      g.moveTo(x, y - h * 0.2)
        .bezierCurveTo(x + h * 0.45, y + h * 0.3, x + h * 0.35, y + h * 0.75, x, y + h * 0.75)
        .bezierCurveTo(x - h * 0.35, y + h * 0.75, x - h * 0.45, y + h * 0.3, x, y - h * 0.2)
        .fill(STAR);
      return;
    case 'snow':
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(x - Math.cos(a) * h, y - Math.sin(a) * h)
          .lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h)
          .stroke({ width: 4, color: 0x7fc4f0, cap: 'round' });
      }
      return;
    case 'drop': {
      // A fat blue water drop.
      g.moveTo(x, y - h * 0.95)
        .bezierCurveTo(x + h * 0.25, y - h * 0.45, x + h * 0.72, y - h * 0.05, x + h * 0.72, y + h * 0.3)
        .bezierCurveTo(x + h * 0.72, y + h * 0.75, x + h * 0.38, y + h * 0.98, x, y + h * 0.98)
        .bezierCurveTo(x - h * 0.38, y + h * 0.98, x - h * 0.72, y + h * 0.75, x - h * 0.72, y + h * 0.3)
        .bezierCurveTo(x - h * 0.72, y - h * 0.05, x - h * 0.25, y - h * 0.45, x, y - h * 0.95)
        .closePath()
        .fill(0x5cc3e6)
        .stroke(st);
      g.ellipse(x - h * 0.3, y + h * 0.25, h * 0.14, h * 0.24).fill({ color: 0xffffff, alpha: 0.85 });
      return;
    }
    case 'stink': {
      // Three wavy green stink lines.
      for (let i = -1; i <= 1; i++) {
        const bx = x + i * h * 0.55;
        const wob = Math.sin(time * 8 + i) * h * 0.08;
        const pts: [number, number][] = [];
        for (let k = 0; k <= 6; k++)
          pts.push([bx + Math.sin(k * 1.4 + time * 6 + i) * h * 0.18 + wob, y + h * 0.9 - (k / 6) * h * 1.8]);
        for (const [w, c] of [
          [h * 0.32, OUTLINE],
          [h * 0.16, 0x9bd14a],
        ] as const) {
          pts.forEach(([px, py], k) => (k === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
          g.stroke({ width: w, color: c, cap: 'round', join: 'round' });
        }
      }
      return;
    }
    case 'sun': {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + time * 0.8;
        g.moveTo(x + Math.cos(a) * h * 0.7, y + Math.sin(a) * h * 0.7)
          .lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h)
          .stroke({ width: 4, color: 0xffa62b, cap: 'round' });
      }
      g.circle(x, y, h * 0.55)
        .fill(STAR)
        .stroke(st);
      g.moveTo(x - h * 0.25, y + h * 0.08)
        .quadraticCurveTo(x, y + h * 0.3, x + h * 0.25, y + h * 0.08)
        .stroke(stroke(2.5));
      return;
    }
    case 'rain': {
      // A little grey cloud with three drops falling from it.
      for (let i = -1; i <= 1; i++) {
        const dx = x + i * h * 0.5;
        const dy = y + h * 0.55 + ((time * 1.6 + (i + 1) * 0.33) % 1) * h * 0.4;
        g.moveTo(dx, dy - h * 0.16)
          .lineTo(dx - h * 0.06, dy + h * 0.16)
          .stroke({ width: 3.5, color: 0x4d9bff, cap: 'round' });
      }
      for (const [cx, cy, r] of [
        [x - h * 0.45, y + h * 0.05, h * 0.34],
        [x, y - h * 0.18, h * 0.45],
        [x + h * 0.45, y + h * 0.05, h * 0.34],
      ] as const)
        g.circle(cx, cy, r + LINE / 2).fill(OUTLINE);
      for (const [cx, cy, r] of [
        [x - h * 0.45, y + h * 0.05, h * 0.34],
        [x, y - h * 0.18, h * 0.45],
        [x + h * 0.45, y + h * 0.05, h * 0.34],
      ] as const)
        g.circle(cx, cy, r - LINE / 2).fill(0xc9d2e3);
      return;
    }
    case 'moon': {
      // A sleepy crescent moon.
      g.circle(x, y, h * 0.8).fill(OUTLINE);
      g.circle(x, y, h * 0.8 - LINE / 2).fill(0xfff1b8);
      g.circle(x + h * 0.4, y - h * 0.22, h * 0.62).fill(0x5a64a8);
      g.moveTo(x - h * 0.5, y + h * 0.05)
        .quadraticCurveTo(x - h * 0.38, y + h * 0.18, x - h * 0.26, y + h * 0.05)
        .stroke(stroke(2.5));
      return;
    }
    case 'food':
    case 'friend':
      return;
  }
}

/**
 * A friend's face for bubbles (gossip, missing a friend): a round head in
 * the bug's colors with its eyes and one telling feature.
 */
export function drawFriend(g: Graphics, def: BugDef, x: number, y: number, s: number): void {
  const h = s / 2;
  const st = stroke(LINE);
  const head =
    def.art === 'ladybug'
      ? 0x3a2a40
      : def.art === 'pillbug'
        ? lighten(def.body, 0.35)
        : lighten(def.body, 0.1);
  if (def.art === 'ladybug') {
    // Her red shell peeking over the top of her head.
    g.circle(x - h * 0.45, y - h * 0.35, h * 0.55)
      .fill(def.body)
      .stroke(st);
    g.circle(x - h * 0.55, y - h * 0.45, h * 0.12).fill(OUTLINE);
  } else if (def.art === 'snail') {
    g.circle(x - h * 0.5, y - h * 0.2, h * 0.55)
      .fill(def.accent)
      .stroke(st);
    spiral(g, x - h * 0.5, y - h * 0.2, h * 0.4, 1.6).stroke({ width: 2.5, color: 0xffffff, cap: 'round' });
  } else if (def.art === 'grasshopper' || def.art === 'strider') {
    for (const dx of [-0.2, 0.25])
      g.moveTo(x + h * dx, y - h * 0.55)
        .quadraticCurveTo(x + h * (dx - 0.1), y - h * 1.1, x + h * (dx - 0.45), y - h * 1.05)
        .stroke({ width: 3, color: OUTLINE, cap: 'round' });
  }
  g.circle(x + h * 0.1, y + h * 0.05, h * 0.62)
    .fill(head)
    .stroke(st);
  for (const dx of [-0.12, 0.32]) {
    g.circle(x + h * dx, y - h * 0.05, h * 0.18)
      .fill(0xffffff)
      .stroke(stroke(2));
    g.circle(x + h * dx + h * 0.04, y - h * 0.03, h * 0.08).fill(OUTLINE);
  }
  const cool = def.art === 'strider';
  g.moveTo(x - h * 0.08, y + h * 0.3)
    .quadraticCurveTo(x + h * 0.12, y + h * (cool ? 0.38 : 0.5), x + h * 0.36, y + h * 0.3)
    .stroke(stroke(2.5));
  g.circle(x + h * 0.52, y + h * 0.25, h * 0.08).fill({ color: 0xff8fab, alpha: 0.9 });
}
