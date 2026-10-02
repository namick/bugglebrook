import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import type { EyeSpot } from '../../rig/bugRig';
import type { Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pt, quadRope, rest, tipOn } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, Oval, Pt, WalkLegsOptions } from './common';
import { RIM, eyePair, springTip, tintHead, walkLegs, walkPoses } from './common';

/**
 * A fuzzy oval: an ellipse whose edge ripples in small tufts. Buzzby's body
 * and Luma's fluff.
 */
export function fuzzOval(cx: number, cy: number, rx: number, ry: number, tufts = 16, depth = 0.05): number[] {
  const pts: number[] = [];
  const n = tufts * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + depth * Math.abs(Math.sin(a * tufts * 0.5));
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return pts;
}

/** Points of a shape drawn pointing up from (0, 0), turned by `angle` and moved to (ox, oy). */
export function turned(pts: readonly number[], ox: number, oy: number, angle: number, sx = 1): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]! * sx;
    const y = pts[i + 1]!;
    out.push(ox + x * c - y * s, oy + x * s + y * c);
  }
  return out;
}

/** An ellipse as points, for shapes that turn. */
function ovalPts(cx: number, cy: number, rx: number, ry: number, n = 20): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

/** Is a winged bug in the air: flying on purpose, gliding, or flung? */
export function inFlight(frame: BugFrame): boolean {
  return frame.face.form === 'flying' || frame.mode === 'st_airborne' || frame.mode === 'st_use';
}

/**
 * Buzzby the bumblebee: a round, fuzzy yellow body with three black stripes,
 * a blunt little stinger, and tiny wings that blur when she flies. Small and
 * busy.
 */
export class BeePainter extends BasePainter {
  private body(): [number, number, number, number] {
    const { r } = this;
    return [-r * 0.18, r * 0.18, r * 0.84, r * 0.66];
  }

  private headAt(): [number, number, number] {
    const { r } = this;
    return [r * 0.8, -r * 0.04, r * 0.44];
  }

  private stinger(): number[] {
    const { r } = this;
    return [
      -r * 0.92,
      r * 0.1,
      -r * 1.16,
      r * 0.2,
      -r * 1.2,
      r * 0.26,
      -r * 1.15,
      r * 0.32,
      -r * 0.9,
      r * 0.4,
    ];
  }

  /** The dark band between x0 and x1 across the body, bowed a little toward the head. */
  private band(x0: number, x1: number): number[] {
    const [cx, cy, rx, ry] = this.body();
    const yAt = (x: number): number => ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const bow = (y: number): number => ((y - cy) / ry) ** 2 * this.r * 0.08;
    const top: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const x = x0 + ((x1 - x0) * i) / 6;
      const h = yAt(x) * 1.02;
      top.push(x - bow(cy - h), cy - h);
      bottom.unshift(x - bow(cy + h), cy + h);
    }
    return [...top, ...bottom];
  }

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    const [cx, cy, rx, ry] = this.body();
    const [hx, hy, hr] = this.headAt();
    // The blunt nub of a stinger, behind the body.
    b.poly(this.stinger()).fill(def.belly).stroke(stroke(4));
    // The fuzzy round body.
    const fuzz = fuzzOval(cx, cy, rx, ry);
    b.poly(fuzz).fill(def.body);
    // A softer, lighter top for roundness, then three black stripes over the back half.
    b.ellipse(cx + r * 0.25, cy - ry * 0.45, rx * 0.4, ry * 0.25).fill({ color: 0xffffff, alpha: 0.3 });
    for (const [x0, x1] of [
      [-0.86, -0.7],
      [-0.56, -0.38],
      [-0.22, -0.04],
    ] as const)
      b.poly(this.band(r * x0, r * x1)).fill(def.belly);
    // The fuzzy outline and tufts.
    b.poly(fuzz).stroke(stroke(5));
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.85 + i * 0.28;
      const x = cx + Math.cos(a) * rx * 0.86;
      const y = cy + Math.sin(a) * ry * 0.86;
      b.moveTo(x, y)
        .lineTo(x + Math.cos(a) * r * 0.08, y + Math.sin(a) * r * 0.08)
        .stroke({ width: 2.5, color: lighten(def.body, 0.5), alpha: 0.8, cap: 'round' });
    }
    // The round head, a lighter, creamier yellow, with a shine.
    b.circle(hx, hy, hr).fill(lighten(def.body, 0.35)).stroke(stroke(5));
    b.ellipse(hx - hr * 0.2, hy - hr * 0.58, hr * 0.38, hr * 0.14).fill({ color: 0xffffff, alpha: 0.5 });
    this.drawRim(this.L.rim);
  }

  private drawRim(g: Graphics): void {
    const [cx, cy, rx, ry] = this.body();
    const [hx, hy, hr] = this.headAt();
    g.poly(fuzzOval(cx, cy, rx, ry)).stroke(RIM);
    g.circle(hx, hy, hr).stroke(RIM);
    g.poly(this.stinger()).stroke(RIM);
  }

  mask(g: Graphics): void {
    const [cx, cy, rx, ry] = this.body();
    g.ellipse(cx, cy, rx, ry).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.02, x1: r * 0.66, y0: r * 0.2, y1: r * 0.86 };
  }

  protected headOval(): Oval {
    const [x, y, r] = this.headAt();
    return { x, y, rx: r, ry: r };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.75, y: -this.r * 1.15 };
  }

  /** Where the wings are rooted, on top of the body. */
  private wingRoot(): Pt {
    const { r } = this;
    return [-r * 0.12, -r * 0.42];
  }

  /** One wing pointing up from its root, as the template draws it. */
  private wingShape(): number[] {
    const { r } = this;
    return ovalPts(0, -r * 0.3, r * 0.17, r * 0.3);
  }

  /**
   * The two wings' angles this frame (far one first). Folded back at rest, a
   * fast blur in the air. `blur` is how wide the blur fans, 0 on the ground.
   */
  private wings(frame: BugFrame): { angle: number; blur: number }[] {
    if (!inFlight(frame))
      return [
        { angle: -0.75, blur: 0 },
        { angle: -1.05, blur: 0 },
      ];
    const beat = Math.sin(frame.time * 70);
    return [
      { angle: -0.35 + beat * 0.55, blur: 0.6 },
      { angle: -0.45 - beat * 0.55, blur: 0.6 },
    ];
  }

  /** Six short legs: a tripod walk, tucked up and dangling while she flies. */
  private legOptions(frame: BugFrame): WalkLegsOptions {
    const { r, def } = this;
    const flying = inFlight(frame);
    return {
      r,
      hips: [
        [-r * 0.5, r * 0.66],
        [-r * 0.15, r * 0.72],
        [r * 0.2, r * 0.7],
      ],
      farShift: [r * 0.1, -r * 0.05],
      ground: r,
      width: 4,
      footR: r * 0.06,
      farColor: darken(def.belly, 0.2),
      custom: (i, far) => {
        if (!flying) return null;
        const swing = Math.sin(frame.time * 9 + i * 1.3 + (far ? 1 : 0)) * r * 0.04;
        const hx = -r * 0.5 + i * r * 0.35 + (far ? r * 0.1 : 0);
        const hy = r * (i === 1 ? 0.72 : 0.68) - (far ? r * 0.05 : 0);
        return {
          hip: [hx, hy],
          knee: [hx + r * 0.1, hy + r * 0.1],
          foot: [hx - r * 0.06 + swing, hy + r * 0.18],
        };
      },
    };
  }

  /** Short, elbowed feelers with round knobs: base, bend, and springy tip. */
  private feelers(frame: BugFrame, springs: readonly AntennaSpring[]): { base: Pt; mid: Pt; tip: Pt }[] {
    const { r } = this;
    const [hx, hy, hr] = this.headAt();
    const bases: Pt[] = [
      [hx - hr * 0.2, hy - hr * 0.85],
      [hx + hr * 0.25, hy - hr * 0.9],
    ];
    return bases.map(([bx, by], i) => ({
      base: [bx, by] as Pt,
      mid: [bx + r * 0.02, by - r * 0.42] as Pt,
      tip: springTip(frame, springs[i]!, [bx, by], [bx + r * (0.26 + i * 0.08), by - r * 0.46], 0.9),
    }));
  }

  /** Big round eyes, a rosy blush, and a small mouth. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { def } = this;
    const [hx, hy, hr] = this.headAt();
    const f = frame.face;
    const lid = lighten(def.body, 0.35);
    const eye = (x: number, y: number, er: number, line: number, far: boolean) =>
      ({ x, y, r: er, shape: f.eyes, lid, line, far }) as const;
    return {
      tint: f.tint ? { x: hx, y: hy, rx: hr * 0.95, ry: hr * 0.95, circle: true } : null,
      eyes: [
        eye(hx - hr * 0.34, hy - hr * 0.12, hr * 0.3, 3, true),
        eye(hx + hr * 0.3, hy - hr * 0.08, hr * 0.36, 3.5, false),
      ],
      cheek: { x: hx + hr * 0.7, y: hy + hr * 0.4, r: hr * 0.17, alpha: f.blush ? 0.95 : 0.65 },
      mouth: { x: hx + hr * 0.22, y: hy + hr * 0.5, s: hr * 0.55, shape: f.mouth, color: OUTLINE, line: 3.5 },
    };
  }

  /** A gentle hover while she flies. */
  private adjust(frame: BugFrame): Adjust {
    if (!inFlight(frame)) return { tilt: 0, bob: 0, still: false };
    return { tilt: Math.sin(frame.time * 4.5) * 0.06, bob: Math.sin(frame.time * 9) * 2.5, still: false };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r } = this;
    // Tiny wings: folded back at rest, a fan of blurred beats in the air.
    const w = this.L.wings.clear();
    const [wx, wy] = this.wingRoot();
    const shape = this.wingShape();
    this.wings(frame).forEach(({ angle, blur }, i) => {
      const ox = wx + (i === 0 ? r * 0.1 : 0);
      const oy = wy - (i === 0 ? r * 0.04 : 0);
      if (blur > 0)
        for (const k of [-1, -0.5, 0.5, 1])
          w.poly(turned(shape, ox, oy, angle + k * blur)).fill({ color: 0xffffff, alpha: 0.22 });
      w.poly(turned(shape, ox, oy, angle))
        .fill({ color: 0xeaf6ff, alpha: blur > 0 ? 0.55 : 0.8 })
        .stroke({ width: 3, color: OUTLINE, alpha: blur > 0 ? 0.45 : 0.8 });
    });
    walkLegs(this.L.legsBack, this.L.legsFront, frame, this.legOptions(frame));
    // Short feelers with round knobs.
    const a = this.L.antennae;
    for (const { base, mid, tip } of this.feelers(frame, springs)) {
      a.moveTo(base[0], base[1])
        .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
        .stroke({ width: 3.5, color: OUTLINE, cap: 'round' });
      a.circle(tip[0], tip[1], r * 0.07).fill(OUTLINE);
    }
    if (frame.rim) this.drawRim(this.L.rim.clear());
    const g = this.L.face;
    const f = frame.face;
    const [hx, hy, hr] = this.headAt();
    tintHead(g, f.tint, hx, hy, hr * 0.95);
    const spot = this.faceSpots(frame);
    const [fe, ne] = spot.eyes as [EyeSpot, EyeSpot];
    eyePair(g, frame, [fe.x, fe.y, fe.r], [ne.x, ne.y, ne.r], ne.lid, 3.5);
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
    const [wx, wy] = this.wingRoot();
    this.wings(frame).forEach(({ angle, blur }, i) =>
      items.push({
        kind: 'piece',
        part: 'wing',
        slot: 'wings',
        at: { x: wx + (i === 0 ? r * 0.1 : 0), y: wy - (i === 0 ? r * 0.04 : 0) },
        rotation: angle,
        far: i === 0,
        ...(blur > 0 ? { alpha: 0.6 } : {}),
      }),
    );
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
    items.push(rest(rig, 'stinger', 'body'));
    const mask = items.length;
    items.push(rest(rig, 'body', 'body'), rest(rig, 'head', 'body'));
    for (const { base, mid, tip } of this.feelers(frame, springs)) {
      const pts = quadRope(pt(base), pt(mid), pt(tip));
      items.push({ kind: 'rope', part: 'antenna', slot: 'top', pts }, tipOn(pts, 'antenna_tip'));
    }
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
