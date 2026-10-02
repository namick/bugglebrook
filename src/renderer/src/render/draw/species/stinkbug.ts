import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import type { EyeSpot } from '../../rig/bugRig';
import type { Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pt, rest, tipOn } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, Pt, WalkLegsOptions } from './common';
import {
  NO_ADJUST,
  RIM,
  eyePair,
  limbItem,
  politeBrows,
  springTip,
  tintHead,
  walkLegs,
  walkPoses,
} from './common';

/**
 * Whiff the stink bug: a shield-shaped olive body with a row of orange dots
 * along its edge, a small head, and apologetic brows. Always a little
 * worried, always polite.
 */
export class StinkbugPainter extends BasePainter {
  /** The shield: shoulder corner at the front, tapering to a point at the back. */
  private shield(g: Graphics): Graphics {
    const { r } = this;
    return g
      .moveTo(r * 0.5, r * 0.46)
      .lineTo(r * 0.6, -r * 0.14)
      .quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.76, -r * 0.54)
      .quadraticCurveTo(r * 0.3, -r * 0.8, -r * 0.3, -r * 0.76)
      .bezierCurveTo(-r * 0.92, -r * 0.7, -r * 1.24, -r * 0.12, -r * 1.3, r * 0.3)
      .quadraticCurveTo(-r * 1.28, r * 0.5, -r * 1.0, r * 0.5)
      .lineTo(r * 0.5, r * 0.46)
      .closePath();
  }

  private head: [number, number, number] = [0, 0, 0];

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    const s = this.L.shell;
    this.head = [r * 1.02, r * 0.12, r * 0.46];
    const [hx, hy, hr] = this.head;
    // Pale belly under the shield.
    b.ellipse(-r * 0.38, r * 0.52, r * 0.92, r * 0.16)
      .fill(def.belly)
      .stroke(stroke());
    // A small round head, tucked under the shield's shoulder.
    b.circle(hx, hy, hr).fill(lighten(def.body, 0.3)).stroke(stroke());
    b.ellipse(hx - hr * 0.2, hy - hr * 0.55, hr * 0.35, hr * 0.14).fill({ color: 0xffffff, alpha: 0.35 });
    // The shield.
    this.shield(s).fill(def.body).stroke(stroke());
    // Lighter top, for roundness.
    s.moveTo(r * 0.45, -r * 0.4)
      .quadraticCurveTo(r * 0.2, -r * 0.62, -r * 0.3, -r * 0.6)
      .bezierCurveTo(-r * 0.8, -r * 0.55, -r * 1.02, -r * 0.15, -r * 1.06, r * 0.15)
      .lineTo(r * 0.4, r * 0.1)
      .closePath()
      .fill({ color: lighten(def.body, 0.12), alpha: 0.65 });
    // The seam between the shoulder plate and the back, and the little triangle plate.
    s.moveTo(r * 0.12, -r * 0.74)
      .quadraticCurveTo(r * 0.22, -r * 0.2, r * 0.14, r * 0.3)
      .stroke({ width: 3.5, color: darken(def.body, 0.3), cap: 'round' });
    s.moveTo(r * 0.06, -r * 0.56)
      .lineTo(-r * 0.62, -r * 0.42)
      .lineTo(r * 0.0, -r * 0.08)
      .closePath()
      .fill({ color: lighten(def.body, 0.25), alpha: 0.7 });
    // Freckles.
    for (const [x, y] of [
      [-0.3, -0.3],
      [-0.55, -0.1],
      [0.35, -0.38],
      [-0.85, 0.02],
      [0.38, -0.05],
      [-0.2, 0.04],
    ] as const)
      s.circle(r * x, r * y, r * 0.035).fill({ color: darken(def.body, 0.35), alpha: 0.8 });
    // A darker band along the edge, with the row of orange dots.
    s.moveTo(-r * 1.18, r * 0.38)
      .lineTo(r * 0.5, r * 0.36)
      .stroke({ width: r * 0.16, color: darken(def.body, 0.25), cap: 'round' });
    for (let i = 0; i < 6; i++) {
      const x = -r * 1.08 + i * r * 0.31;
      s.circle(x, r * 0.37, r * 0.075)
        .fill(def.accent)
        .stroke({ width: 2, color: darken(def.accent, 0.35) });
    }
    this.shield(s).stroke(stroke());
    // Shine on the shoulder.
    s.moveTo(r * 0.5, -r * 0.5)
      .quadraticCurveTo(r * 0.15, -r * 0.7, -r * 0.25, -r * 0.66)
      .stroke({ width: r * 0.09, color: 0xffffff, alpha: 0.6, cap: 'round' });
    // Hover rim.
    const g = this.L.rim;
    this.shield(g).stroke(RIM);
    g.circle(hx, hy, hr).stroke(RIM);
    g.ellipse(-r * 0.38, r * 0.52, r * 0.92, r * 0.16).stroke(RIM);
  }

  mask(g: Graphics): void {
    const { r } = this;
    this.shield(g).fill(0xffffff);
    g.ellipse(-r * 0.38, r * 0.52, r * 0.92, r * 0.16).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.3, x1: r * 0.76, y0: -r * 0.05, y1: r * 0.7 };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.6, y: -this.r * 1.3 };
  }

  /** The six legs: a tripod walk, and the front pair held out when carrying. */
  private legOptions(frame: BugFrame): WalkLegsOptions {
    const { r, def } = this;
    const hips: Pt[] = [
      [-r * 0.7, r * 0.5],
      [-r * 0.2, r * 0.52],
      [r * 0.3, r * 0.5],
    ];
    return {
      r,
      hips,
      farShift: [r * 0.12, -r * 0.04],
      ground: r,
      width: 4.5,
      footR: r * 0.07,
      farColor: darken(def.body, 0.45),
      custom: (i, far) => {
        if (!frame.carrying || i !== 2 || frame.pose.flail) return null;
        const hip: Pt = far ? [hips[2]![0] + r * 0.12, hips[2]![1] - r * 0.04] : hips[2]!;
        return { hip, knee: [r * 0.75, r * 0.35], foot: [r * 0.98, -r * 0.05] };
      },
    };
  }

  /** Each jointed feeler: its base, the curves to the elbow and the tip, and where they end. */
  private feelers(
    frame: BugFrame,
    springs: readonly AntennaSpring[],
  ): { base: Pt; mid: Pt; tip: Pt; mid2: Pt; end: Pt }[] {
    const { r } = this;
    const [hx, hy, hr] = this.headAt();
    const bases: Pt[] = [
      [hx - hr * 0.35, hy - hr * 0.85],
      [hx + hr * 0.15, hy - hr * 0.9],
    ];
    return bases.map((base, i) => {
      const s = springs[i]!;
      const elbow: Pt = [base[0] + r * (0.12 + i * 0.12), base[1] - r * 0.42];
      const mid: Pt = [base[0] + r * 0.02, base[1] - r * 0.25];
      const tip = springTip(frame, s, base, elbow, 0.5);
      const mid2: Pt = [tip[0] + r * 0.18, tip[1] - r * 0.08];
      const end = springTip(frame, s, tip, [tip[0] + r * 0.32, tip[1] + r * 0.1], 1);
      return { base, mid, tip, mid2, end };
    });
  }

  private headAt(): [number, number, number] {
    const { r } = this;
    return [r * 1.02, r * 0.12, r * 0.46];
  }

  /** Small eyes, a shy blush that never quite goes away, and a small mouth. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { def } = this;
    const [hx, hy, hr] = this.headAt();
    const f = frame.face;
    const lid = lighten(def.body, 0.3);
    const eye = (x: number, y: number, er: number, line: number, far: boolean) =>
      ({ x, y, r: er, shape: f.eyes, lid, line, far }) as const;
    return {
      tint: f.tint ? { x: hx, y: hy, rx: hr * 0.95, ry: hr * 0.95, circle: true } : null,
      eyes: [
        eye(hx - hr * 0.4, hy - hr * 0.1, hr * 0.3, 3, true),
        eye(hx + hr * 0.3, hy - hr * 0.06, hr * 0.36, 3.5, false),
      ],
      polite: true,
      cheek: { x: hx + hr * 0.72, y: hy + hr * 0.38, r: hr * 0.2, alpha: f.blush ? 0.95 : 0.6 },
      mouth: { x: hx + hr * 0.22, y: hy + hr * 0.5, s: hr * 0.62, shape: f.mouth, color: OUTLINE, line: 3.5 },
    };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const [hx, hy, hr] = this.head;
    walkLegs(this.L.legsBack, this.L.legsFront, frame, this.legOptions(frame));
    // Jointed feelers, drooping politely forward.
    const a = this.L.antennae;
    for (const { base, mid, tip, mid2, end } of this.feelers(frame, springs)) {
      a.moveTo(base[0], base[1])
        .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
        .stroke({ width: 4, color: OUTLINE, cap: 'round' });
      a.moveTo(tip[0], tip[1])
        .quadraticCurveTo(mid2[0], mid2[1], end[0], end[1])
        .stroke({ width: 3.5, color: OUTLINE, cap: 'round' });
      a.circle(tip[0], tip[1], 2.6).fill(OUTLINE);
      a.circle(end[0], end[1], this.r * 0.06).fill(OUTLINE);
    }
    // Face: small eyes, worried brows, a shy blush that never quite goes away.
    const g = this.L.face;
    const f = frame.face;
    tintHead(g, f.tint, hx, hy, hr * 0.95);
    const spot = this.faceSpots(frame);
    const [fe, ne] = spot.eyes as [EyeSpot, EyeSpot];
    const far: [number, number, number] = [fe.x, fe.y, fe.r];
    const near: [number, number, number] = [ne.x, ne.y, ne.r];
    eyePair(g, frame, far, near, ne.lid, 3.5);
    politeBrows(g, f.eyes, far, near, 3.5);
    const c = spot.cheek!;
    g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth!;
    drawMouth(g, m.x, m.y, m.s, f.mouth, frame.time, OUTLINE, 3.5);
    return NO_ADJUST;
  }

  skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton {
    const rig = this.bones;
    const items: SkeletonItem[] = [rest(rig, 'belly', 'body'), rest(rig, 'head', 'body')];
    items.push(rest(rig, 'shield', 'shell'));
    for (const { far, leg } of walkPoses(frame, this.legOptions(frame)))
      items.push(limbItem('leg_upper', 'leg_lower', leg, far));
    for (const { base, tip, end } of this.feelers(frame, springs)) {
      items.push({
        kind: 'limb',
        part: 'antenna_base',
        lower: 'antenna_end',
        slot: 'top',
        hip: pt(base),
        knee: pt(tip),
        foot: pt(end),
      });
      items.push(tipOn([pt(tip), pt(end)], 'antenna_tip'));
    }
    return {
      items,
      face: this.faceSpots(frame),
      headPart: 'head',
      ball: null,
      paint: [{ mask: 2, box: this.paintBox(), colors: null }],
      extras: [],
      adjust: NO_ADJUST,
      crown: pt([this.crown().x, this.crown().y]),
    };
  }
}
