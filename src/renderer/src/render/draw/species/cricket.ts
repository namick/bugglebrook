import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import type { EyeSpot } from '../../rig/bugRig';
import type { Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pt, quadRope, rest } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, LegPose, Oval, Pt, WalkLegsOptions } from './common';
import { RIM, eyePair, limb, limbItem, springTip, tintHead, tube, walkLegs, walkPoses } from './common';

/** Is Fiddle playing: told so, or performing (or playing an instrument)? */
export function fiddling(frame: BugFrame): boolean {
  if (frame.pose.flail && frame.mode !== 'st_use') return false;
  return !!frame.fiddling || frame.mode === 'st_perform' || frame.mode === 'st_use';
}

/**
 * Fiddle the cricket: long, low, and dark brown, with folded wings, very
 * long feelers, and back legs shaped like violin bows. A dark spot on his
 * head sits like a beret. When he plays, he lifts one back leg and bows it
 * across the other.
 */
export class CricketPainter extends BasePainter {
  private abdomen(): number[] {
    const { r } = this;
    const pts: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      // Long and low, a little fatter toward the back.
      const thick = 0.34 + 0.06 * Math.max(0, -x);
      pts.push(-r * 0.45 + x * r * 0.78, r * 0.38 + y * r * thick);
    }
    return pts;
  }

  /** The folded wings along his back, from the shoulder to past the tail. */
  private wingPath(g: Graphics): Graphics {
    const { r } = this;
    return g
      .moveTo(r * 0.2, r * 0.08)
      .quadraticCurveTo(-r * 0.4, -r * 0.14, -r * 1.3, r * 0.14)
      .quadraticCurveTo(-r * 1.36, r * 0.3, -r * 1.2, r * 0.36)
      .quadraticCurveTo(-r * 0.5, r * 0.34, r * 0.2, r * 0.3)
      .closePath();
  }

  private thoraxAt(): [number, number, number, number] {
    const { r } = this;
    return [r * 0.38, r * 0.2, r * 0.34, r * 0.3];
  }

  private headAt(): [number, number, number] {
    const { r } = this;
    return [r * 0.87, -r * 0.22, r * 0.43];
  }

  /** The beret-shaped dark spot on top of his head: a flat cap tipped to one side, with a little tab. */
  private beret(g: Graphics, color: number): void {
    const [hx, hy, hr] = this.headAt();
    g.ellipse(hx - hr * 0.12, hy - hr * 0.7, hr * 0.66, hr * 0.26).fill(color);
    g.circle(hx - hr * 0.05, hy - hr * 0.98, hr * 0.09).fill(color);
  }

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    // Two little tail prongs, then the long body with segment lines.
    for (const k of [0, 1])
      b.moveTo(-r * 1.15, r * 0.36 + k * r * 0.1)
        .quadraticCurveTo(-r * 1.4, r * 0.3 + k * r * 0.12, -r * 1.58, r * 0.18 + k * r * 0.18)
        .stroke({ width: 4, color: OUTLINE, cap: 'round' });
    b.poly(this.abdomen()).fill(def.body).stroke(stroke(5));
    b.moveTo(-r * 1.1, r * 0.6)
      .quadraticCurveTo(-r * 0.5, r * 0.76, r * 0.2, r * 0.6)
      .stroke({ width: r * 0.08, color: def.belly, alpha: 0.8, cap: 'round' });
    // Folded wings, a shade lighter, with dark veins.
    this.wingPath(b).fill(lighten(def.body, 0.14)).stroke(stroke(4.5));
    for (const [x0, y0, x1, y1] of [
      [0.1, 0.12, -1.15, 0.2],
      [-0.1, 0.22, -0.95, 0.3],
      [-0.4, 0.04, -0.55, 0.32],
      [-0.75, 0.08, -0.85, 0.32],
    ] as const)
      b.moveTo(r * x0, r * y0)
        .lineTo(r * x1, r * y1)
        .stroke({ width: 2.5, color: def.accent, alpha: 0.7, cap: 'round' });
    b.moveTo(r * 0.05, r * 0.05)
      .quadraticCurveTo(-r * 0.45, -r * 0.08, -r * 1.0, r * 0.08)
      .stroke({ width: r * 0.05, color: 0xffffff, alpha: 0.35, cap: 'round' });
    // The shoulder plate.
    const [tx, ty, trx, try_] = this.thoraxAt();
    b.ellipse(tx, ty, trx, try_).fill(lighten(def.body, 0.06)).stroke(stroke(5));
    b.moveTo(tx - trx * 0.6, ty - try_ * 0.55)
      .quadraticCurveTo(tx, ty - try_ * 0.85, tx + trx * 0.6, ty - try_ * 0.5)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.4, cap: 'round' });
    // The head, a warmer lighter brown so his face reads, and his beret.
    const [hx, hy, hr] = this.headAt();
    b.circle(hx, hy, hr).fill(def.belly).stroke(stroke(5));
    this.beret(b, def.accent);
    b.ellipse(hx + hr * 0.25, hy - hr * 0.38, hr * 0.2, hr * 0.08).fill({ color: 0xffffff, alpha: 0.35 });
    // Hover rim.
    const g = this.L.rim;
    g.poly(this.abdomen()).stroke(RIM);
    g.ellipse(tx, ty, trx, try_).stroke(RIM);
    g.circle(hx, hy, hr).stroke(RIM);
  }

  mask(g: Graphics): void {
    g.poly(this.abdomen()).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.23, x1: r * 0.33, y0: r * 0.36, y1: r * 0.8 };
  }

  protected headOval(): Oval {
    const [x, y, r] = this.headAt();
    return { x, y, rx: r, ry: r };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.85, y: -this.r * 1.2 };
  }

  /** The four small front legs: a walk, held out when carrying. */
  private legOptions(frame: BugFrame): WalkLegsOptions {
    const { r, def } = this;
    const hips: Pt[] = [
      [r * 0.22, r * 0.44],
      [r * 0.5, r * 0.42],
    ];
    return {
      r,
      hips,
      farShift: [r * 0.1, -r * 0.04],
      ground: r,
      width: 4,
      footR: r * 0.05,
      farColor: darken(def.body, 0.45),
      custom: (i, far) => {
        if (frame.pose.flail && fiddling(frame)) {
          // Playing an instrument: standing still on his front legs.
          const hip: Pt = far ? [hips[i]![0] + r * 0.1, hips[i]![1] - r * 0.04] : hips[i]!;
          const fx = hip[0] + (i - 0.5) * r * 0.08;
          return {
            hip,
            knee: [(hip[0] + fx) / 2 + (i === 1 ? 1 : -1) * r * 0.14, hip[1] + (r - hip[1]) * 0.3 - r * 0.08],
            foot: [fx, r],
          };
        }
        if (!frame.carrying || i !== 1 || frame.pose.flail) return null;
        const hip: Pt = far ? [hips[1]![0] + r * 0.1, hips[1]![1] - r * 0.04] : hips[1]!;
        return { hip, knee: [r * 0.82, r * 0.3], foot: [r * 1.08, -r * 0.02] };
      },
    };
  }

  /**
   * The big back legs, far one first: a thick thigh up to a high knee, and a
   * long, straight shin like a violin bow down to the foot. Playing, the near
   * one lifts and saws across the far one.
   */
  private hindLegs(frame: BugFrame): { far: boolean; leg: LegPose }[] {
    const { r } = this;
    const pose = frame.pose;
    const play = fiddling(frame);
    const out: { far: boolean; leg: LegPose }[] = [];
    for (const far of [true, false]) {
      const off = far ? r * 0.12 : 0;
      const hip: Pt = [-r * 0.32 + off, r * 0.4 - (far ? r * 0.04 : 0)];
      let knee: Pt;
      let foot: Pt;
      if (play && !far) {
        // The bow: the shin held across the far thigh like a bow on strings, sawing along itself.
        const saw = Math.sin(frame.time * 9) * r * 0.2;
        knee = [-r * 1.0 + saw * 0.84, -r * 0.1 - saw * 0.55];
        foot = [r * 0.0 + saw * 0.84, -r * 0.75 - saw * 0.55];
      } else if (play) {
        // The fiddle: raised a little higher, knee up by his shoulder.
        knee = [-r * 0.78 + off, -r * 0.62];
        foot = [-r * 1.15 + off, r * 0.9];
      } else if (pose.flail) {
        const w = Math.sin(pose.legPhase + (far ? 1 : 0)) * r * 0.2;
        knee = [-r * 0.95 + off, -r * 0.1 + w * 0.5];
        foot = [-r * 1.15 + off + w, r * 0.95];
      } else {
        const ph = pose.legPhase + (far ? Math.PI : 0);
        const step = Math.sin(ph) * pose.stride * r * 0.14;
        const lift = Math.max(0, Math.cos(ph)) * pose.stride * r * 0.12;
        knee = [-r * 0.88 + off + step * 0.4, -r * 0.42 - lift * 0.5];
        foot = [-r * 1.3 + off + step, r - lift];
      }
      out.push({ far, leg: { hip, knee, foot } });
    }
    return out;
  }

  /** A back leg: a drumstick thigh, then the shin drawn as a violin bow (a stick with its hair). */
  private drawHindLeg(g: Graphics, leg: LegPose, far: boolean): void {
    const { r, def } = this;
    const { hip, knee, foot } = leg;
    const color = far ? darken(def.body, 0.3) : def.body;
    const mid: Pt = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2];
    g.poly(tube(hip, [mid[0] + r * 0.04, mid[1]], [mid[0] - r * 0.02, mid[1]], knee, r * 0.3, r * 0.12))
      .fill(color)
      .stroke(stroke(far ? 3.5 : 4));
    g.moveTo(hip[0] + (knee[0] - hip[0]) * 0.2, hip[1] + (knee[1] - hip[1]) * 0.2)
      .lineTo(hip[0] + (knee[0] - hip[0]) * 0.75, hip[1] + (knee[1] - hip[1]) * 0.75)
      .stroke({ width: 2.5, color: lighten(color, 0.35), alpha: 0.8, cap: 'round' });
    // The bow: the stick, and the pale hair a little off it, joined at both ends.
    const dx = foot[0] - knee[0];
    const dy = foot[1] - knee[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * r * 0.08;
    const ny = (dx / len) * r * 0.08;
    const a: Pt = [knee[0] + dx * 0.1, knee[1] + dy * 0.1];
    const b: Pt = [knee[0] + dx * 0.92, knee[1] + dy * 0.92];
    g.moveTo(a[0], a[1])
      .lineTo(a[0] + nx, a[1] + ny)
      .lineTo(b[0] + nx, b[1] + ny)
      .lineTo(b[0], b[1])
      .stroke({ width: 2, color: far ? 0xd9c9a8 : 0xf4ead2, alpha: far ? 0.8 : 1, join: 'round' });
    limb(
      g,
      knee,
      [(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2],
      foot,
      far ? 3.5 : 4.5,
      far ? darken(def.body, 0.45) : OUTLINE,
      far ? 0.85 : 1,
    );
    // The frog by the knee, and the foot.
    g.circle(a[0] + nx * 0.5, a[1] + ny * 0.5, r * 0.06).fill(far ? darken(def.accent, 0.2) : def.accent);
    g.moveTo(foot[0], foot[1])
      .lineTo(foot[0] - r * 0.12, foot[1])
      .stroke({ width: far ? 3.5 : 4.5, color: far ? darken(def.body, 0.45) : OUTLINE, cap: 'round' });
  }

  /** Very long feelers, sweeping up and back over him. */
  private feelers(frame: BugFrame, springs: readonly AntennaSpring[]): { base: Pt; mid: Pt; tip: Pt }[] {
    const { r } = this;
    const [hx, hy, hr] = this.headAt();
    const bases: Pt[] = [
      [hx + hr * 0.15, hy - hr * 0.85],
      [hx + hr * 0.45, hy - hr * 0.78],
    ];
    return bases.map(([bx, by], i) => ({
      base: [bx, by] as Pt,
      mid: [bx + r * (0.25 + i * 0.1), by - r * 1.1] as Pt,
      tip: springTip(
        frame,
        springs[i]!,
        [bx, by],
        [bx - r * (1.25 - i * 0.25), by - r * (0.95 + i * 0.1)],
        1.6,
      ),
    }));
  }

  /** Steady eyes and a small mouth: a serious musician, with a little blush. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { def } = this;
    const [hx, hy, hr] = this.headAt();
    const f = frame.face;
    const lid = def.belly;
    const eye = (x: number, y: number, er: number, line: number, far: boolean) =>
      ({ x, y, r: er, shape: f.eyes, lid, line, far }) as const;
    return {
      tint: f.tint ? { x: hx, y: hy, rx: hr * 0.95, ry: hr * 0.95, circle: true } : null,
      eyes: [
        eye(hx - hr * 0.28, hy - hr * 0.06, hr * 0.28, 3, true),
        eye(hx + hr * 0.36, hy - hr * 0.02, hr * 0.34, 3.5, false),
      ],
      cheek: { x: hx + hr * 0.72, y: hy + hr * 0.38, r: hr * 0.16, alpha: f.blush ? 0.95 : 0.5 },
      mouth: { x: hx + hr * 0.3, y: hy + hr * 0.52, s: hr * 0.52, shape: f.mouth, color: OUTLINE, line: 3.5 },
    };
  }

  /** Playing, he leans back a touch and sways with the tune. */
  private adjust(frame: BugFrame): Adjust {
    if (!fiddling(frame)) return { tilt: 0, bob: 0, still: false };
    return { tilt: -0.08 + Math.sin(frame.time * 4.5) * 0.04, bob: 0, still: false };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const back = this.L.legsBack;
    const front = this.L.legsFront;
    const [far, near] = this.hindLegs(frame) as [
      { far: boolean; leg: LegPose },
      { far: boolean; leg: LegPose },
    ];
    this.drawHindLeg(back, far.leg, true);
    walkLegs(back, front, frame, this.legOptions(frame));
    // The near back leg goes over everything when it bows, so it shows across the body.
    this.drawHindLeg(fiddling(frame) ? this.L.antennae : front, near.leg, false);
    const a = this.L.antennae;
    for (const { base, mid, tip } of this.feelers(frame, springs))
      a.moveTo(base[0], base[1])
        .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
        .stroke({ width: 3, color: OUTLINE, cap: 'round' });
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
    const rig = this.bones;
    const items: SkeletonItem[] = [];
    const [far, near] = this.hindLegs(frame) as [
      { far: boolean; leg: LegPose },
      { far: boolean; leg: LegPose },
    ];
    items.push(limbItem('hindleg_thigh', 'hindleg_shin', far.leg, true));
    for (const { far: f, leg } of walkPoses(frame, this.legOptions(frame)))
      items.push(limbItem('leg_upper', 'leg_lower', leg, f));
    const mask = items.length;
    items.push(
      rest(rig, 'abdomen', 'body'),
      rest(rig, 'wing_folded', 'body'),
      rest(rig, 'thorax', 'body'),
      rest(rig, 'head', 'body'),
    );
    items.push({
      ...limbItem('hindleg_thigh', 'hindleg_shin', near.leg, false),
      slot: fiddling(frame) ? 'top' : 'front',
    });
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
