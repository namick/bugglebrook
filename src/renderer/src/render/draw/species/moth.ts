import type { Graphics } from 'pixi.js';
import type { EyeShape } from '../../bugFace';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import { fuzzOval, inFlight, turned } from './bee';
import type { EyeSpot } from '../../rig/bugRig';
import type { Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pt, quadRope, rest } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, Oval, Pt, WalkLegsOptions } from './common';
import { RIM, eyePair, springTip, tintHead, walkLegs, walkPoses } from './common';

/** A cubic bezier from a to d as points (without the first). */
function curve(a: Pt, b: Pt, c: Pt, d: Pt, n = 10): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    );
  }
  return out;
}

/**
 * Luma the moth: a fuzzy, pale lavender body, broad wings with two big
 * eye-spots, feathery feelers, and sleepy eyes. She rests with her wings
 * swept back and flies in slow, lazy loops.
 */
export class MothPainter extends BasePainter {
  private headAt(): [number, number, number] {
    const { r } = this;
    return [r * 0.78, -r * 0.2, r * 0.44];
  }

  private abdomen(): number[] {
    const { r } = this;
    return fuzzOval(-r * 0.55, r * 0.34, r * 0.62, r * 0.3, 12, 0.06);
  }

  private thorax(): number[] {
    const { r } = this;
    return fuzzOval(r * 0.18, r * 0.2, r * 0.4, r * 0.38, 12, 0.08);
  }

  /** Where the wings are rooted, on top of the thorax. */
  private wingRoot(): Pt {
    const { r } = this;
    return [r * 0.08, -r * 0.1];
  }

  /** The broad fore wing, pointing up from its root (template space). */
  private foreShape(): number[] {
    const { r } = this;
    return [
      0,
      0,
      ...curve([0, 0], [r * 0.1, -r * 0.5], [r * 0.05, -r * 1.1], [-r * 0.12, -r * 1.42]),
      ...curve([-r * 0.12, -r * 1.42], [-r * 0.55, -r * 1.45], [-r * 1.05, -r * 1.1], [-r * 1.0, -r * 0.62]),
      ...curve([-r * 1.0, -r * 0.62], [-r * 0.85, -r * 0.3], [-r * 0.4, -r * 0.08], [0, 0]),
    ];
  }

  /** The rounder hind wing, poking out behind and below the fore wing. */
  private hindShape(): number[] {
    const { r } = this;
    return [
      0,
      0,
      ...curve([0, 0], [-r * 0.3, -r * 0.3], [-r * 0.95, -r * 0.55], [-r * 1.15, -r * 0.25]),
      ...curve([-r * 1.15, -r * 0.25], [-r * 1.3, r * 0.05], [-r * 0.6, r * 0.2], [0, 0]),
    ];
  }

  /** The eye-spots' centers and sizes (template space): fore wing, then hind wing. */
  private spots(): [number, number, number][] {
    const { r } = this;
    return [
      [-r * 0.5, -r * 0.82, r * 0.2],
      [-r * 0.78, -r * 0.18, r * 0.15],
    ];
  }

  /**
   * The wings' turn this frame: swept back over her at rest, breathing a
   * little, and a slow, deep beat in the air.
   */
  private wingAngle(frame: BugFrame): number {
    if (!inFlight(frame)) return -0.7 + Math.sin(frame.time * 1.1) * 0.05;
    const beat = 0.5 + 0.5 * Math.sin(frame.time * 8);
    return 0.35 - beat * 1.25;
  }

  /** One wing pair (hind, then fore) turned about the root, with its eye-spots. */
  private wingPair(g: Graphics, ox: number, oy: number, angle: number, far: boolean): void {
    const { def } = this;
    const base = lighten(def.body, 0.3);
    const fill = far ? darken(base, 0.15) : base;
    const edge = far ? darken(def.body, 0.15) : def.body;
    const line = { width: far ? 3.5 : 4.5, color: OUTLINE, alpha: far ? 0.85 : 1, join: 'round' as const };
    const t = (pts: number[]): number[] => turned(pts, ox, oy, angle);
    for (const [shape, spot] of [
      [this.hindShape(), this.spots()[1]!],
      [this.foreShape(), this.spots()[0]!],
    ] as const) {
      g.poly(t(shape)).fill(fill);
      // A soft, darker band along the outer edge.
      g.poly(t(shape)).stroke({ width: this.r * 0.1, color: edge, alpha: 0.7, join: 'round' });
      g.poly(t(shape)).stroke(line);
      const [sx, sy, sr] = spot;
      const [cx, cy] = t([sx, sy]) as [number, number];
      // The eye-spot: a violet ring, a pale middle, a dark pupil with a glint.
      g.circle(cx, cy, sr)
        .fill(def.accent)
        .stroke({ width: 2.5, color: OUTLINE, alpha: far ? 0.7 : 0.9 });
      g.circle(cx, cy, sr * 0.62).fill(lighten(def.accent, 0.55));
      g.circle(cx, cy, sr * 0.36).fill(darken(def.accent, 0.5));
      g.circle(cx - sr * 0.15, cy - sr * 0.15, sr * 0.12).fill(0xffffff);
    }
  }

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    // The soft abdomen with faint segment lines.
    b.poly(this.abdomen()).fill(def.body).stroke(stroke(5));
    for (const k of [-0.95, -0.7, -0.45, -0.2])
      b.moveTo(r * k, r * 0.12)
        .quadraticCurveTo(r * (k + 0.06), r * 0.34, r * k, r * 0.58)
        .stroke({ width: 2.5, color: darken(def.body, 0.2), alpha: 0.7, cap: 'round' });
    // The fluffy thorax, a pale ruff at the collar, and the head.
    b.poly(this.thorax()).fill(lighten(def.body, 0.1)).stroke(stroke(5));
    const [hx, hy, hr] = this.headAt();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.55 + i * 0.32;
      b.circle(hx + Math.cos(a) * hr * 1.0, hy + Math.sin(a) * hr * 1.0, hr * 0.24).fill(def.belly);
    }
    b.circle(hx, hy, hr).fill(lighten(def.body, 0.2)).stroke(stroke(5));
    b.ellipse(hx - hr * 0.2, hy - hr * 0.58, hr * 0.36, hr * 0.13).fill({ color: 0xffffff, alpha: 0.5 });
    this.drawRim(this.L.rim, this.wingAngle(_frame));
  }

  private drawRim(g: Graphics, angle: number): void {
    const [hx, hy, hr] = this.headAt();
    const [wx, wy] = this.wingRoot();
    g.poly(this.abdomen()).stroke(RIM);
    g.poly(this.thorax()).stroke(RIM);
    g.circle(hx, hy, hr).stroke(RIM);
    g.poly(turned(this.foreShape(), wx, wy, angle)).stroke(RIM);
    g.poly(turned(this.hindShape(), wx, wy, angle)).stroke(RIM);
  }

  mask(g: Graphics): void {
    g.poly(this.abdomen()).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.2, x1: r * 0.08, y0: r * 0.34, y1: r * 0.66 };
  }

  protected headOval(): Oval {
    const [x, y, r] = this.headAt();
    return { x, y, rx: r, ry: r };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.8, y: -this.r * 1.2 };
  }

  /** Six thin legs: a walk, or tucked up and dangling while she flies. */
  private legOptions(frame: BugFrame): WalkLegsOptions {
    const { r, def } = this;
    const flying = inFlight(frame);
    const hips: Pt[] = [
      [-r * 0.05, r * 0.5],
      [r * 0.18, r * 0.54],
      [r * 0.4, r * 0.5],
    ];
    return {
      r,
      hips,
      farShift: [r * 0.1, -r * 0.05],
      ground: r,
      width: 3.5,
      footR: 0,
      farColor: darken(def.body, 0.45),
      custom: (i, far) => {
        if (!flying) return null;
        const h = hips[i]!;
        const hip: Pt = far ? [h[0] + r * 0.1, h[1] - r * 0.05] : h;
        const swing = Math.sin(frame.time * 4 + i * 1.4 + (far ? 1 : 0)) * r * 0.05;
        return {
          hip,
          knee: [hip[0] + (i - 1) * r * 0.12, hip[1] + r * 0.16],
          foot: [hip[0] + (i - 1) * r * 0.2 - r * 0.06 + swing, hip[1] + r * 0.36],
        };
      },
    };
  }

  /** Feathery feelers: base, bend, and springy tip. */
  private feelers(frame: BugFrame, springs: readonly AntennaSpring[]): { base: Pt; mid: Pt; tip: Pt }[] {
    const { r } = this;
    const [hx, hy, hr] = this.headAt();
    const bases: Pt[] = [
      [hx - hr * 0.1, hy - hr * 0.88],
      [hx + hr * 0.3, hy - hr * 0.88],
    ];
    return bases.map(([bx, by], i) => ({
      base: [bx, by] as Pt,
      mid: [bx + r * 0.12, by - r * 0.5] as Pt,
      tip: springTip(
        frame,
        springs[i]!,
        [bx, by],
        [bx + r * (0.5 + i * 0.12), by - r * (0.7 - i * 0.05)],
        1.2,
      ),
    }));
  }

  /** A feathered feeler: the shaft, with little barbs on both sides that shrink toward the tip. */
  private drawFeeler(g: Graphics, base: Pt, mid: Pt, tip: Pt): void {
    const { r } = this;
    g.moveTo(base[0], base[1])
      .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
      .stroke({ width: 3, color: OUTLINE, cap: 'round' });
    const at = (t: number): Pt => {
      const u = 1 - t;
      return [
        u * u * base[0] + 2 * u * t * mid[0] + t * t * tip[0],
        u * u * base[1] + 2 * u * t * mid[1] + t * t * tip[1],
      ];
    };
    for (let i = 1; i <= 7; i++) {
      const t = 0.15 + i * 0.11;
      const [x, y] = at(t);
      const [x2, y2] = at(Math.min(1, t + 0.02));
      const len = Math.hypot(x2 - x, y2 - y) || 1;
      const nx = -(y2 - y) / len;
      const ny = (x2 - x) / len;
      const k = r * 0.16 * (1 - t * 0.6);
      for (const side of [1, -1])
        g.moveTo(x, y)
          .lineTo(x + (nx * side + (x2 - x) / len) * k, y + (ny * side + (y2 - y) / len) * k)
          .stroke({ width: 2, color: OUTLINE, cap: 'round' });
    }
  }

  /** Her eyes rest half shut: open eyes show as sleepy ones. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { def } = this;
    const [hx, hy, hr] = this.headAt();
    const f = frame.face;
    const shape: EyeShape = f.eyes === 'open' ? 'sleepy' : f.eyes;
    const lid = lighten(def.body, 0.2);
    const eye = (x: number, y: number, er: number, line: number, far: boolean) =>
      ({ x, y, r: er, shape, lid, line, far }) as const;
    return {
      tint: f.tint ? { x: hx, y: hy, rx: hr * 0.95, ry: hr * 0.95, circle: true } : null,
      eyes: [
        eye(hx - hr * 0.3, hy - hr * 0.06, hr * 0.3, 3, true),
        eye(hx + hr * 0.34, hy - hr * 0.02, hr * 0.36, 3.5, false),
      ],
      cheek: { x: hx + hr * 0.72, y: hy + hr * 0.4, r: hr * 0.18, alpha: f.blush ? 0.95 : 0.6 },
      mouth: { x: hx + hr * 0.26, y: hy + hr * 0.52, s: hr * 0.5, shape: f.mouth, color: OUTLINE, line: 3.5 },
    };
  }

  /** Slow, lazy loops in the air: a deep bob and a gentle roll. */
  private adjust(frame: BugFrame): Adjust {
    if (!inFlight(frame)) return { tilt: 0, bob: 0, still: false };
    return { tilt: Math.sin(frame.time * 1.6) * 0.12, bob: Math.sin(frame.time * 8) * 3, still: false };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r } = this;
    // The far pair behind the body, the near pair over her back.
    const angle = this.wingAngle(frame);
    const [wx, wy] = this.wingRoot();
    this.wingPair(this.L.wings.clear(), wx + r * 0.1, wy - r * 0.05, angle * 0.85, true);
    this.wingPair(this.L.shell.clear(), wx, wy, angle, false);
    if (frame.rim) this.drawRim(this.L.rim.clear(), angle);
    walkLegs(this.L.legsBack, this.L.legsFront, frame, this.legOptions(frame));
    const a = this.L.antennae;
    for (const { base, mid, tip } of this.feelers(frame, springs)) this.drawFeeler(a, base, mid, tip);
    const g = this.L.face;
    const f = frame.face;
    const [hx, hy, hr] = this.headAt();
    tintHead(g, f.tint, hx, hy, hr * 0.95);
    const spot = this.faceSpots(frame);
    const [fe, ne] = spot.eyes as [EyeSpot, EyeSpot];
    eyePair(g, frame, [fe.x, fe.y, fe.r], [ne.x, ne.y, ne.r], ne.lid, 3.5, fe.shape);
    const c = spot.cheek!;
    g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth!;
    drawMouth(g, m.x, m.y, m.s, f.mouth, frame.time, OUTLINE, 3.5);
    return this.adjust(frame);
  }

  skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton {
    const { r } = this;
    const rig = this.bones;
    const items: SkeletonItem[] = [];
    const angle = this.wingAngle(frame);
    const [wx, wy] = this.wingRoot();
    for (const part of ['wing_hind', 'wing_fore'])
      items.push({
        kind: 'piece',
        part,
        slot: 'wings',
        at: { x: wx + r * 0.1, y: wy - r * 0.05 },
        rotation: angle * 0.85,
        far: true,
      });
    for (const { far, leg } of walkPoses(frame, this.legOptions(frame)))
      items.push({
        kind: 'limb',
        part: 'leg_upper',
        lower: 'leg_lower',
        slot: far ? 'back' : 'front',
        far,
        hip: pt(leg.hip),
        knee: pt(leg.knee),
        foot: pt(leg.foot),
      });
    const mask = items.length;
    items.push(rest(rig, 'abdomen', 'body'), rest(rig, 'thorax', 'body'), rest(rig, 'head', 'body'));
    for (const part of ['wing_hind', 'wing_fore'])
      items.push({ kind: 'piece', part, slot: 'shell', at: { x: wx, y: wy }, rotation: angle });
    for (const { base, mid, tip } of this.feelers(frame, springs))
      items.push({ kind: 'rope', part: 'antenna', slot: 'top', pts: quadRope(pt(base), pt(mid), pt(tip)) });
    const crown = this.crown();
    return {
      items,
      face: this.faceSpots(frame),
      headPart: 'head',
      ball: null,
      paint: [{ mask, box: this.paintBox(), colors: null }],
      extras: [],
      adjust: this.adjust(frame),
      crown: pt([crown.x, crown.y]),
    };
  }
}
