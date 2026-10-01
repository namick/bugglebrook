import type { Graphics } from 'pixi.js';
import { hash01 } from '../../bugPose';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { paintColors } from '../paint';
import { BasePainter } from './base';
import type { Adjust, AntennaSpring, Box, Pt } from './common';
import { NO_ADJUST, RIM, eyePair, limb, springAntenna, tintHead } from './common';

const WING_ORANGE = 0xff9f1c;
const WING_TEAL = 0x2ec4b6;
const SILK = 0xf2eed6;
const SILK_SHADE = 0xd9d0a8;

interface Segment {
  x: number;
  y: number;
  rad: number;
}

/**
 * Munch the caterpillar: six green segments with yellow spots, a round head,
 * tiny stub feet, and a massive smile. He inches along with a wave through
 * his segments. He can also be a sleeping cocoon or a butterfly with big
 * orange and teal wings (still clearly Munch's face).
 */
export class CaterpillarPainter extends BasePainter {
  override key(frame: BugFrame): string {
    return frame.morph ?? 'caterpillar';
  }

  override paintsItself(frame: BugFrame): boolean {
    return !frame.morph;
  }

  private head(): [number, number, number] {
    const { r } = this;
    return [r * 0.92, r * 0.1, r * 0.5];
  }

  // --- Static art ---------------------------------------------------------

  drawStatic(frame: BugFrame): void {
    if (frame.morph === 'cocoon') this.drawCocoon();
    else if (frame.morph === 'butterfly') this.drawButterflyBody();
  }

  /** The cocoon: an upright, silk-wrapped teardrop with a little window for his sleeping face. */
  private cocoonPath(g: Graphics): Graphics {
    const { r } = this;
    return g
      .moveTo(0, -r * 1.55)
      .bezierCurveTo(r * 0.55, -r * 1.45, r * 0.78, -r * 0.4, r * 0.66, r * 0.35)
      .bezierCurveTo(r * 0.58, r * 0.9, r * 0.25, r * 1.0, 0, r * 1.0)
      .bezierCurveTo(-r * 0.25, r * 1.0, -r * 0.58, r * 0.9, -r * 0.66, r * 0.35)
      .bezierCurveTo(-r * 0.78, -r * 0.4, -r * 0.55, -r * 1.45, 0, -r * 1.55)
      .closePath();
  }

  private drawCocoon(): void {
    const { r, def } = this;
    const s = this.L.shell;
    // The thread it hangs from, up into the air.
    s.moveTo(0, -r * 1.5)
      .bezierCurveTo(r * 0.12, -r * 1.8, -r * 0.1, -r * 2.05, r * 0.04, -r * 2.4)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.75, cap: 'round' });
    this.cocoonPath(s).fill(SILK).stroke(stroke());
    // A hint of green showing through, and silk wrapped round and round.
    s.ellipse(r * 0.05, r * 0.1, r * 0.42, r * 0.75).fill({ color: def.body, alpha: 0.18 });
    for (let i = 0; i < 6; i++) {
      const y = -r * 1.1 + i * r * 0.38;
      const w = r * (0.42 + 0.22 * Math.sin(((i + 1) / 7) * Math.PI));
      s.moveTo(-w, y + r * 0.1)
        .quadraticCurveTo(0, y - r * 0.12 + (i % 2) * r * 0.05, w, y - r * 0.06)
        .stroke({ width: 3, color: SILK_SHADE, cap: 'round' });
    }
    s.moveTo(-r * 0.4, -r * 0.9)
      .quadraticCurveTo(-r * 0.52, -r * 0.2, -r * 0.42, r * 0.4)
      .stroke({ width: r * 0.1, color: 0xffffff, alpha: 0.7, cap: 'round' });
    // The window where his face peeks out.
    s.ellipse(r * 0.12, -r * 0.62, r * 0.36, r * 0.26)
      .fill(lighten(def.body, 0.1))
      .stroke(stroke(4));
    s.moveTo(-r * 0.26, -r * 0.82)
      .quadraticCurveTo(r * 0.12, -r * 0.98, r * 0.5, -r * 0.8)
      .stroke({ width: 5, color: SILK, cap: 'round' });
    this.cocoonPath(s).stroke(stroke());
    this.cocoonPath(this.L.rim).stroke(RIM);
  }

  /** The butterfly's slim body and head; the wings move, so they are drawn every frame. */
  private drawButterflyBody(): void {
    const { r, def } = this;
    const b = this.L.body;
    const [hx, hy, hr] = this.butterflyHead();
    // Slim, striped abdomen.
    b.poly(this.abdomen()).fill(def.body).stroke(stroke(5));
    for (let i = 0; i < 4; i++) {
      const x = -r * 0.85 + i * r * 0.26;
      b.moveTo(x, r * 0.12)
        .quadraticCurveTo(x + r * 0.05, r * 0.27, x, r * 0.42)
        .stroke({ width: 3, color: darken(def.body, 0.3), cap: 'round' });
    }
    // A fuzzy thorax.
    b.circle(r * 0.32, r * 0.18, r * 0.27)
      .fill(lighten(def.body, 0.05))
      .stroke(stroke(5));
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.9 + i * 0.4;
      b.circle(r * 0.32 + Math.cos(a) * r * 0.25, r * 0.18 + Math.sin(a) * r * 0.25, r * 0.05).fill(
        lighten(def.body, 0.3),
      );
    }
    b.circle(hx, hy, hr).fill(lighten(def.body, 0.1)).stroke(stroke());
    b.ellipse(hx - hr * 0.25, hy - hr * 0.6, hr * 0.35, hr * 0.13).fill({ color: 0xffffff, alpha: 0.5 });
  }

  private butterflyHead(): [number, number, number] {
    const { r } = this;
    return [r * 0.82, r * 0.04, r * 0.42];
  }

  private abdomen(): number[] {
    const { r } = this;
    const pts: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      const thick = 0.12 + 0.08 * (x + 1) * 0.5;
      pts.push(-r * 0.42 + x * r * 0.62, r * 0.27 + y * r * thick + x * r * 0.04);
    }
    return pts;
  }

  mask(g: Graphics, frame: BugFrame): void {
    if (frame.morph === 'cocoon') {
      this.cocoonPath(g).fill(0xffffff);
      return;
    }
    g.poly(this.abdomen()).fill(0xffffff);
    g.circle(this.r * 0.32, this.r * 0.18, this.r * 0.27).fill(0xffffff);
  }

  paintBox(frame: BugFrame): Box | null {
    const { r } = this;
    if (frame.morph === 'cocoon') return { x0: -r * 0.7, x1: r * 0.7, y0: r * 0.15, y1: r * 1.0 };
    if (frame.morph === 'butterfly') return { x0: -r * 1.05, x1: r * 0.6, y0: r * 0.22, y1: r * 0.48 };
    return null;
  }

  override crown(frame: BugFrame): { x: number; y: number } {
    if (frame.morph === 'cocoon') return { x: 0, y: -this.r * 1.9 };
    if (frame.morph === 'butterfly') return { x: this.r * 0.6, y: -this.r * 1.0 };
    return { x: this.r * 0.75, y: -this.r * 0.95 };
  }

  // --- Per frame ----------------------------------------------------------

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    if (frame.morph === 'cocoon') return this.updateCocoon(frame);
    if (frame.morph === 'butterfly') return this.updateButterfly(frame, springs);
    return this.updateCaterpillar(frame, springs);
  }

  /** Where each segment sits this frame: inching, dangling, floating in a U, or munching. */
  private segments(frame: BugFrame): Segment[] {
    const { r } = this;
    const { pose } = frame;
    const mode = frame.mode;
    const out: Segment[] = [];
    const ph = pose.legPhase * 0.55;
    const lump = mode === 'st_eat' ? (frame.time * 1.3) % 1.4 : -1;
    for (let i = 0; i < 6; i++) {
      let rad = r * (i < 4 ? 0.38 : 0.38 - (i - 3) * 0.05);
      let x = r * 0.36 - i * r * 0.39;
      let y = r * 0.9 - rad;
      if (pose.flail) {
        // Dangling from the hand, or wriggling through the air.
        const d = x / r + 0.4;
        y += d * d * r * (mode === 'st_held' ? 0.16 : 0.05) + Math.sin(frame.time * 9 + i * 0.9) * r * 0.06;
        x *= mode === 'st_airborne' ? 1.08 : 1;
      } else if (mode === 'st_swim') {
        // Floating in a U.
        const d = x / r + 0.6;
        y -= d * d * r * 0.16;
      } else {
        // The inching wave runs from the tail to the head.
        const w = Math.max(0, Math.sin(ph + i * 0.95));
        y -= w * w * pose.stride * r * 0.32;
        x -= Math.cos(ph + i * 0.95) * pose.stride * r * 0.05;
        y -= (0.5 + 0.5 * Math.sin(frame.time * 2.2 - i * 0.7)) * r * 0.025;
      }
      if (lump >= 0) {
        // A bite travelling down to his tummy.
        const k = Math.exp(-((i - lump * 4.5) ** 2) * 1.5);
        rad *= 1 + 0.22 * k;
        y -= rad * 0.1 * k;
      }
      out.push({ x, y, rad });
    }
    return out;
  }

  private updateCaterpillar(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r, def } = this;
    const segs = this.segments(frame);
    const b = this.L.body.clear();
    const back = this.L.legsBack;
    const front = this.L.legsFront;
    const rim = this.L.rim.clear();
    const colors = paintColors(frame.paint);
    const painted = (i: number): number | null => {
      const n = colors.length;
      if (n === 0) return null;
      if (n === 1) return i === 2 || i === 3 ? colors[0]! : null;
      if (n < 5) return i <= n ? colors[i % n]! : null;
      return colors[i % n]!;
    };
    // Stub feet: the far ones behind, the near ones in front.
    segs.forEach((s, i) => {
      for (const far of [true, false]) {
        const g = far ? back : front;
        const fx = s.x + (far ? r * 0.1 : -r * 0.02);
        const wig = frame.pose.flail ? Math.sin(frame.time * 14 + i + (far ? 1 : 0)) * r * 0.05 : 0;
        const fy = s.y + s.rad * 0.8 + (far ? -r * 0.03 : 0);
        if (i < 2) {
          // True legs: tiny dark points under the front segments.
          limb(
            g,
            [fx, fy - r * 0.05],
            [fx + r * 0.06 + wig, fy + r * 0.08],
            [fx + r * 0.02 + wig, fy + r * 0.17],
            4,
            OUTLINE,
            far ? 0.75 : 1,
          );
          continue;
        }
        g.roundRect(fx - r * 0.07 + wig, fy - r * 0.04, r * 0.14, r * 0.2, r * 0.07)
          .fill(far ? darken(def.body, 0.35) : darken(def.body, 0.15))
          .stroke(stroke(3));
      }
    });
    // A little orange tail horn.
    const tail = segs[5]!;
    b.moveTo(tail.x - tail.rad * 0.2, tail.y - tail.rad * 0.85)
      .quadraticCurveTo(
        tail.x - tail.rad * 0.7,
        tail.y - tail.rad * 1.6,
        tail.x - tail.rad * 1.0,
        tail.y - tail.rad * 1.35,
      )
      .stroke({ width: 7, color: OUTLINE, cap: 'round' });
    b.moveTo(tail.x - tail.rad * 0.2, tail.y - tail.rad * 0.85)
      .quadraticCurveTo(
        tail.x - tail.rad * 0.7,
        tail.y - tail.rad * 1.6,
        tail.x - tail.rad * 1.0,
        tail.y - tail.rad * 1.35,
      )
      .stroke({ width: 3, color: def.accent, cap: 'round' });
    // Segments from the tail forward, so each overlaps the one behind.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]!;
      const shade = i % 2 === 0 ? def.body : lighten(def.body, 0.07);
      b.circle(s.x, s.y, s.rad).fill(shade).stroke(stroke(5));
      const paint = painted(i);
      if (paint !== null) this.segmentPaint(b, s, paint, i);
      b.circle(s.x - s.rad * 0.12, s.y + s.rad * 0.12, s.rad * 0.26).fill(def.belly);
      b.circle(s.x + s.rad * 0.38, s.y - s.rad * 0.3, s.rad * 0.11).fill(def.belly);
      b.moveTo(s.x - s.rad * 0.55, s.y - s.rad * 0.45)
        .quadraticCurveTo(s.x - s.rad * 0.1, s.y - s.rad * 0.82, s.x + s.rad * 0.3, s.y - s.rad * 0.72)
        .stroke({ width: s.rad * 0.16, color: 0xffffff, alpha: 0.45, cap: 'round' });
      b.circle(s.x, s.y, s.rad).stroke(stroke(5));
      if (frame.rim) rim.circle(s.x, s.y, s.rad).stroke(RIM);
    }
    // The round head, riding on the first segment.
    const [hx0, hy0, hr] = this.head();
    const s0 = segs[0]!;
    const hx = hx0 + (s0.x - r * 0.36) * 0.8;
    const hy = hy0 + (s0.y - (r * 0.9 - r * 0.38)) * 0.8 + (frame.mode === 'st_swim' ? -r * 0.1 : 0);
    b.circle(hx, hy, hr).fill(lighten(def.body, 0.12)).stroke(stroke());
    b.ellipse(hx - hr * 0.25, hy - hr * 0.62, hr * 0.38, hr * 0.13).fill({ color: 0xffffff, alpha: 0.5 });
    if (frame.rim) rim.circle(hx, hy, hr).stroke(RIM);
    this.antennae(frame, springs, hx, hy, hr);
    this.face(frame, hx, hy, hr);
    return NO_ADJUST;
  }

  /** Paint on the lower half of one segment, with a ragged top edge. */
  private segmentPaint(g: Graphics, s: Segment, color: number, i: number): void {
    const pts: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = 0.08 * Math.PI + (k / 10) * 0.84 * Math.PI;
      pts.push(s.x + Math.cos(a) * (s.rad - 3), s.y + Math.sin(a) * (s.rad - 3));
    }
    for (let k = 0; k <= 4; k++) {
      const x = s.x - s.rad * 0.85 + (k / 4) * s.rad * 1.7;
      pts.push(x, s.y - s.rad * (0.05 + 0.25 * hash01(i, k)));
    }
    g.poly(pts).fill(color);
    g.ellipse(s.x - s.rad * 0.3, s.y + s.rad * 0.1, s.rad * 0.2, s.rad * 0.08).fill({
      color: 0xffffff,
      alpha: 0.45,
    });
  }

  private antennae(
    frame: BugFrame,
    springs: readonly AntennaSpring[],
    hx: number,
    hy: number,
    hr: number,
  ): void {
    const { r, def } = this;
    const a = this.L.antennae;
    [
      [hx - hr * 0.35, hy - hr * 0.85],
      [hx + hr * 0.2, hy - hr * 0.92],
    ].forEach(([bx, by], i) => {
      const tip = springAntenna(
        a,
        frame,
        springs[i]!,
        [bx!, by!],
        [bx! - r * 0.02, by! - r * 0.2],
        [bx! + r * (0.02 + i * 0.1), by! - r * 0.34],
        4.5,
        0.6,
      );
      a.circle(tip[0], tip[1], r * 0.09)
        .fill(def.accent)
        .stroke(stroke(3));
    });
  }

  /** Big round eyes and a massive smile. */
  private face(frame: BugFrame, hx: number, hy: number, hr: number, closed = false): void {
    const { def } = this;
    const g = this.L.face;
    const f = frame.face;
    tintHead(g, f.tint, hx, hy, hr * 0.95);
    const lid = lighten(def.body, 0.12);
    eyePair(
      g,
      frame,
      [hx - hr * 0.32, hy - hr * 0.2, hr * 0.32],
      [hx + hr * 0.28, hy - hr * 0.16, hr * 0.38],
      lid,
      4,
      f.eyes,
      undefined,
      closed ? 0 : frame.pose.eyeOpen,
    );
    g.circle(hx + hr * 0.72, hy + hr * 0.3, hr * 0.16).fill({ color: CHEEK, alpha: f.blush ? 0.95 : 0.7 });
    g.circle(hx - hr * 0.62, hy + hr * 0.32, hr * 0.13).fill({ color: CHEEK, alpha: f.blush ? 0.8 : 0.55 });
    // His smile is huge.
    const big = f.mouth === 'smile' || f.mouth === 'grin' || f.mouth === 'lick';
    drawMouth(g, hx + hr * 0.08, hy + hr * 0.38, hr * (big ? 1.15 : 0.8), f.mouth, frame.time, OUTLINE, 4);
  }

  private updateCocoon(frame: BugFrame): Adjust {
    const { r } = this;
    // Two closed eyes and a sleepy smile in the window.
    const g = this.L.face;
    const hx = r * 0.12;
    const hy = -r * 0.6;
    const snore = frame.face.mouth === 'o';
    g.moveTo(hx - r * 0.24, hy - r * 0.02)
      .quadraticCurveTo(hx - r * 0.15, hy + r * 0.06, hx - r * 0.06, hy - r * 0.02)
      .stroke(stroke(3.5));
    g.moveTo(hx + r * 0.06, hy - r * 0.02)
      .quadraticCurveTo(hx + r * 0.16, hy + r * 0.06, hx + r * 0.26, hy - r * 0.02)
      .stroke(stroke(3.5));
    if (snore)
      g.ellipse(hx + r * 0.02, hy + r * 0.13, r * 0.05, r * 0.045)
        .fill(0x7a2336)
        .stroke(stroke(2.5));
    else
      g.moveTo(hx - r * 0.06, hy + r * 0.1)
        .quadraticCurveTo(hx + r * 0.02, hy + r * 0.16, hx + r * 0.1, hy + r * 0.1)
        .stroke(stroke(3));
    g.circle(hx + r * 0.32, hy + r * 0.08, r * 0.05).fill({ color: CHEEK, alpha: 0.7 });
    if (frame.face.tint) tintHead(g, frame.face.tint, hx, hy, r * 0.34, r * 0.24);
    // Gently swaying on its thread.
    const k = frame.pose.flail ? 0.16 : 0.05;
    return { tilt: Math.sin(frame.time * 1.3) * k, bob: 0, still: false };
  }

  /** One wing pair in local space: the pivot at the origin, the wings rising up and back. */
  private wingPair(g: Graphics, ox: number, oy: number, angle: number, mirror: boolean, alpha: number): void {
    const { r } = this;
    const sx = mirror ? -1 : 1;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tf = (x: number, y: number): [number, number] => {
      const lx = x * sx;
      return [ox + lx * cos - y * sin, oy + lx * sin + y * cos];
    };
    const poly = (pts: readonly (readonly [number, number])[]): number[] => pts.flatMap(([x, y]) => tf(x, y));
    const curve = (
      a: readonly [number, number],
      b: readonly [number, number],
      c: readonly [number, number],
      d: readonly [number, number],
      n = 10,
    ): [number, number][] => {
      const out: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        out.push([
          u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
        ]);
      }
      return out;
    };
    const line = { width: 4.5, color: OUTLINE, alpha, join: 'round' as const };
    // Hind wing: a teal lobe with an orange eye-spot.
    const hind = [
      ...curve([0, 0], [-r * 0.25, -r * 0.1], [-r * 0.95, -r * 0.45], [-r * 0.95, -r * 0.05]),
      ...curve([-r * 0.95, -r * 0.05], [-r * 0.95, r * 0.25], [-r * 0.35, r * 0.25], [0, r * 0.08]),
    ];
    g.poly(poly(hind)).fill({ color: WING_TEAL, alpha }).stroke(line);
    const [ex, ey] = tf(-r * 0.58, -r * 0.08);
    g.circle(ex, ey, r * 0.14)
      .fill({ color: WING_ORANGE, alpha })
      .stroke({ ...line, width: 3 });
    g.circle(ex, ey, r * 0.05).fill({ color: OUTLINE, alpha });
    // Fore wing: a big orange sail with a teal edge and white dots.
    const fore = [
      ...curve([0, 0], [-r * 0.05, -r * 0.6], [r * 0.15, -r * 1.3], [r * 0.32, -r * 1.55]),
      ...curve([r * 0.32, -r * 1.55], [-r * 0.15, -r * 1.65], [-r * 0.75, -r * 1.35], [-r * 0.82, -r * 0.6]),
      ...curve([-r * 0.82, -r * 0.6], [-r * 0.6, -r * 0.25], [-r * 0.25, -r * 0.05], [0, 0]),
    ];
    g.poly(poly(fore)).fill({ color: WING_ORANGE, alpha });
    const edge = curve(
      [r * 0.32, -r * 1.55],
      [-r * 0.15, -r * 1.65],
      [-r * 0.75, -r * 1.35],
      [-r * 0.82, -r * 0.6],
    );
    g.poly(
      poly([
        ...edge,
        ...curve([-r * 0.62, -r * 0.68], [-r * 0.55, -r * 1.15], [-r * 0.1, -r * 1.42], [r * 0.22, -r * 1.4]),
      ]),
    ).fill({ color: WING_TEAL, alpha });
    for (const [x, y] of [
      [0.08, -1.42],
      [-0.28, -1.42],
      [-0.58, -1.18],
      [-0.7, -0.85],
    ] as const) {
      const [dx, dy] = tf(r * x, r * y);
      g.circle(dx, dy, r * 0.05).fill({ color: 0xffffff, alpha });
    }
    // Veins.
    for (const [x, y] of [
      [-0.1, -1.2],
      [-0.5, -0.9],
    ] as const) {
      const [ax, ay] = tf(0, 0);
      const [bx, by] = tf(r * x, r * y);
      g.moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ width: 2.5, color: darken(WING_ORANGE, 0.3), alpha });
    }
    g.poly(poly(fore)).stroke(line);
  }

  private updateButterfly(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r, def } = this;
    const flying = frame.mode === 'st_airborne' || frame.mode === 'st_use';
    const speed = flying ? 16 : frame.pose.flail ? 11 : 2.2;
    const flap = 0.5 + 0.5 * Math.sin(frame.time * speed);
    const open = flying || frame.pose.flail ? 0.2 + 0.8 * flap : 0.38 + 0.2 * flap;
    // Far pair (mirrored) behind the body, near pair in front.
    const w = this.L.wings.clear();
    const s = this.L.shell.clear();
    const px = r * 0.28;
    const py = r * 0.05;
    this.wingPair(w, px + r * 0.06, py - r * 0.02, open * 0.9, true, 1);
    this.wingPair(s, px, py, -open * 0.9, false, 1);
    if (frame.rim) {
      const rim = this.L.rim.clear();
      rim.poly(this.abdomen()).stroke(RIM);
      rim.circle(...this.butterflyHead()).stroke(RIM);
      this.wingRim(rim, px, py, -open * 0.9, false);
      this.wingRim(rim, px + r * 0.06, py - r * 0.02, open * 0.9, true);
    }
    // Six thin legs: standing, or tucked up while he flutters.
    const legs = this.L.legsFront;
    const back = this.L.legsBack;
    const tucked = flying || frame.pose.flail;
    [r * 0.15, r * 0.32, r * 0.48].forEach((hx, i) => {
      for (const far of [true, false]) {
        const g = far ? back : legs;
        const ph = frame.pose.legPhase + i * 2.1 + (far ? Math.PI : 0);
        const step = Math.sin(ph) * frame.pose.stride * r * 0.15;
        const hip: Pt = [hx + (far ? r * 0.06 : 0), r * 0.32];
        const foot: Pt = tucked
          ? [hx + (i - 1) * r * 0.25 + Math.sin(frame.time * 8 + i) * r * 0.04, r * 0.72]
          : [hx + (i - 1) * r * 0.35 + step, r - Math.max(0, Math.cos(ph)) * frame.pose.stride * r * 0.1];
        const knee: Pt = [(hip[0] + foot[0]) / 2 + (i - 1) * r * 0.12, (hip[1] + foot[1]) / 2 - r * 0.12];
        limb(g, hip, knee, foot, far ? 3 : 3.5, far ? darken(def.body, 0.4) : OUTLINE, far ? 0.8 : 1);
      }
    });
    const [hx, hy, hr] = this.butterflyHead();
    // Long feelers with clubbed tips.
    const a = this.L.antennae;
    [
      [hx - hr * 0.2, hy - hr * 0.85],
      [hx + hr * 0.25, hy - hr * 0.9],
    ].forEach(([bx, by], i) => {
      const tip = springAntenna(
        a,
        frame,
        springs[i]!,
        [bx!, by!],
        [bx! + r * 0.05, by! - r * 0.5],
        [bx! + r * (0.3 + i * 0.12), by! - r * (0.75 - i * 0.05)],
        3.5,
        1.1,
      );
      a.ellipse(tip[0], tip[1], r * 0.08, r * 0.06).fill(OUTLINE);
    });
    this.face(frame, hx, hy, hr);
    return { tilt: 0, bob: flying ? Math.sin(frame.time * speed) * 3 : 0, still: false };
  }

  private wingRim(g: Graphics, ox: number, oy: number, angle: number, mirror: boolean): void {
    const { r } = this;
    const sx = mirror ? -1 : 1;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const pts: number[] = [];
    for (const [x, y] of [
      [0, 0],
      [r * 0.32, -r * 1.55],
      [-r * 0.82, -r * 0.6],
      [-r * 0.95, -r * 0.05],
      [0, r * 0.08],
    ] as const)
      pts.push(ox + x * sx * c - y * s, oy + x * sx * s + y * c);
    g.poly(pts).stroke(RIM);
  }
}
