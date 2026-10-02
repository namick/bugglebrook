import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { mooseFlail } from '../../pendingLife';
import { BasePainter } from './base';
import type { EyeSpot } from '../../rig/bugRig';
import type { PieceItem, Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pivotOf, pt, rest } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, LegPose, Pt, WalkLegsOptions } from './common';
import {
  RIM,
  bezierAt,
  dome,
  eyePair,
  limbItem,
  springTip,
  tintHead,
  tube,
  walkLegs,
  walkPoses,
} from './common';

/**
 * Moose the stag beetle: a big, glossy red-brown gentle giant with a white
 * shine stripe, huge antler mandibles, and small kind eyes. He can lie stuck
 * on his back with his legs waving, and lifts heavy things over his head.
 */
export class StagbeetlePainter extends BasePainter {
  /** The stuck legs' wave phase: it speeds up in bursts, so it is integrated, not read off the clock. */
  private wave = 0;
  private waveAt = 0;
  /** Stuck on his back, the body is mirrored about this line (its shell rests on the ground). */
  private get flipLine(): number {
    return this.r * 0.46;
  }

  private stuck(frame: BugFrame): boolean {
    return frame.pending === 'stuck' && !frame.pose.flail;
  }

  override key(frame: BugFrame): string {
    return this.stuck(frame) ? 'stuck' : 'normal';
  }

  /** Map a body y for the current pose: mirrored when he is on his back. */
  private ys(stuck: boolean): (y: number) => number {
    const p = this.flipLine;
    return stuck ? (y) => p - y : (y) => y;
  }

  /** Where the head is: on the front of the thorax, upright either way. */
  private head(stuck: boolean): [number, number, number, number] {
    const { r } = this;
    return stuck ? [r * 0.9, r * 0.3, r * 0.36, r * 0.31] : [r * 0.92, r * 0.14, r * 0.36, r * 0.31];
  }

  private elytra(stuck: boolean): number[] {
    const { r } = this;
    const y = this.ys(stuck);
    const pts = dome(-r * 0.35, r * 0.48, r * 0.82, r * 1.02);
    return pts.map((v, i) => (i % 2 === 1 ? y(v) : v));
  }

  /** One antler's shapes: the main beam (a crescent rising up), a forward tine, and a small inner tooth. */
  private antler(
    ox: number,
    oy: number,
    k: number,
  ): { beam: number[]; tine: number[]; tooth: number[]; glint: Pt[] } {
    const { r } = this;
    const p0: Pt = [ox, oy];
    const p1: Pt = [ox + r * 0.5 * k, oy + r * 0.04 * k];
    const p2: Pt = [ox + r * 0.78 * k, oy - r * 0.36 * k];
    const p3: Pt = [ox + r * 0.52 * k, oy - r * 0.86 * k];
    const fork = bezierAt(p0, p1, p2, p3, 0.6);
    const nub = bezierAt(p0, p1, p2, p3, 0.32);
    return {
      beam: tube(p0, p1, p2, p3, r * 0.26 * k, r * 0.07 * k),
      tine: tube(
        [fork[0] - r * 0.04 * k, fork[1]],
        [fork[0] + r * 0.12 * k, fork[1] - r * 0.02 * k],
        [fork[0] + r * 0.26 * k, fork[1] - r * 0.1 * k],
        [fork[0] + r * 0.32 * k, fork[1] - r * 0.3 * k],
        r * 0.13 * k,
        r * 0.045 * k,
      ),
      tooth: tube(
        [nub[0] - r * 0.02 * k, nub[1]],
        [nub[0] - r * 0.06 * k, nub[1] - r * 0.08 * k],
        [nub[0] - r * 0.1 * k, nub[1] - r * 0.12 * k],
        [nub[0] - r * 0.16 * k, nub[1] - r * 0.18 * k],
        r * 0.1 * k,
        r * 0.035 * k,
      ),
      glint: [bezierAt(p0, p1, p2, p3, 0.2), bezierAt(p0, p1, p2, p3, 0.5), bezierAt(p0, p1, p2, p3, 0.78)],
    };
  }

  private mandible(g: Graphics, ox: number, oy: number, color: number, line: number, k = 1): void {
    const { r } = this;
    const a = this.antler(ox, oy, k);
    g.poly(a.tine).fill(color).stroke(stroke(line));
    g.poly(a.tooth)
      .fill(color)
      .stroke(stroke(line * 0.85));
    g.poly(a.beam).fill(color).stroke(stroke(line));
    const [p, q, t] = a.glint as [Pt, Pt, Pt];
    g.moveTo(p[0] - r * 0.02, p[1] - r * 0.06 * k)
      .quadraticCurveTo(q[0] - r * 0.05 * k, q[1] - r * 0.02, t[0] - r * 0.05 * k, t[1])
      .stroke({ width: r * 0.05 * k, color: 0xffffff, alpha: 0.5, cap: 'round' });
  }

  /** Where the two antlers sit on the head: far (smaller, higher, darker) and near. */
  private antlerSpots(hx: number, hy: number): [number, number, number][] {
    const { r } = this;
    return [
      [hx + r * 0.08, hy - r * 0.16, 0.82],
      [hx + r * 0.24, hy + r * 0.02, 1],
    ];
  }

  drawStatic(frame: BugFrame): void {
    const { r, def } = this;
    const stuck = this.stuck(frame);
    const y = this.ys(stuck);
    const b = this.L.body;
    const s = this.L.shell;
    const [hx, hy, hrx, hry] = this.head(stuck);
    // Underside, the shell, then the thorax plate.
    b.ellipse(-r * 0.3, y(r * 0.5), r * 0.95, r * 0.17)
      .fill(darken(def.body, 0.25))
      .stroke(stroke());
    b.poly(this.elytra(stuck)).fill(def.body).stroke(stroke());
    const inner = dome(-r * 0.42, r * 0.36, r * 0.64, r * 0.8).map((v, i) => (i % 2 === 1 ? y(v) : v));
    b.poly(inner).fill({ color: lighten(def.body, 0.1), alpha: 0.7 });
    // The white shine stripe that makes him glossy.
    b.moveTo(-r * 0.98, y(-r * 0.0))
      .bezierCurveTo(-r * 0.92, y(-r * 0.42), -r * 0.6, y(-r * 0.56), -r * 0.12, y(-r * 0.5))
      .stroke({ width: r * 0.1, color: def.accent, alpha: 0.85, cap: 'round' });
    b.circle(r * 0.06, y(-r * 0.44), r * 0.045).fill({ color: def.accent, alpha: 0.85 });
    b.ellipse(r * 0.46, y(r * 0.1), r * 0.3, r * 0.34)
      .fill(lighten(def.body, 0.06))
      .stroke(stroke());
    b.moveTo(r * 0.3, y(-r * 0.12))
      .quadraticCurveTo(r * 0.44, y(-r * 0.22), r * 0.6, y(-r * 0.14))
      .stroke({ width: r * 0.06, color: 0xffffff, alpha: 0.55, cap: 'round' });
    // The far antler behind the head, the head, then the near antler.
    const [far, near] = this.antlerSpots(hx, hy) as [[number, number, number], [number, number, number]];
    this.mandible(s, far[0], far[1], darken(def.belly, 0.3), 4.5, far[2]);
    s.ellipse(hx, hy, hrx, hry).fill(lighten(def.body, 0.12)).stroke(stroke());
    s.moveTo(hx - hrx * 0.6, hy - hry * 0.55)
      .quadraticCurveTo(hx - hrx * 0.1, hy - hry * 0.95, hx + hrx * 0.4, hy - hry * 0.7)
      .stroke({ width: r * 0.06, color: 0xffffff, alpha: 0.45, cap: 'round' });
    this.mandible(s, near[0], near[1], def.belly, 5.5, near[2]);
    // Hover rim.
    const g = this.L.rim;
    g.poly(this.elytra(stuck)).stroke(RIM);
    g.ellipse(-r * 0.3, y(r * 0.5), r * 0.95, r * 0.17).stroke(RIM);
    g.ellipse(r * 0.46, y(r * 0.1), r * 0.3, r * 0.34).stroke(RIM);
    g.ellipse(hx, hy, hrx, hry).stroke(RIM);
    for (const [ox, oy, k] of this.antlerSpots(hx, hy)) {
      const sh = this.antler(ox, oy, k);
      g.poly(sh.beam).stroke(RIM);
      g.poly(sh.tine).stroke(RIM);
    }
  }

  mask(g: Graphics, frame: BugFrame): void {
    const { r } = this;
    const stuck = this.stuck(frame);
    g.poly(this.elytra(stuck)).fill(0xffffff);
    g.ellipse(-r * 0.3, this.ys(stuck)(r * 0.5), r * 0.95, r * 0.17).fill(0xffffff);
  }

  paintBox(frame: BugFrame): Box {
    const { r } = this;
    const y = this.ys(this.stuck(frame));
    const a = y(-r * 0.08);
    const b = y(r * 0.68);
    return { x0: -r * 1.2, x1: r * 0.5, y0: Math.min(a, b), y1: Math.max(a, b) };
  }

  override crown(frame: BugFrame): { x: number; y: number } {
    return { x: this.r * 0.5, y: this.stuck(frame) ? -this.r * 1.0 : -this.r * 1.15 };
  }

  /** Advance the stuck legs' wave by this frame: bursts of frantic flailing, then tired little waves. */
  private advance(frame: BugFrame): ReturnType<typeof mooseFlail> {
    const stuck = this.stuck(frame);
    const flail = mooseFlail(frame.time, 0);
    this.life = stuck ? flail.amp : 0;
    if (stuck) this.wave += Math.min(0.25, Math.max(0, frame.time - this.waveAt)) * 7.5 * flail.speed;
    this.waveAt = frame.time;
    return flail;
  }

  private legOptions(frame: BugFrame, flail: ReturnType<typeof mooseFlail>): WalkLegsOptions {
    const { r, def } = this;
    const stuck = this.stuck(frame);
    const y = this.ys(stuck);
    const hips: Pt[] = [
      [-r * 0.72, y(r * 0.5)],
      [-r * 0.25, y(r * 0.52)],
      [r * 0.32, y(r * 0.48)],
    ];
    const farShift: Pt = [r * 0.12, stuck ? r * 0.04 : -r * 0.04];
    return {
      r,
      hips,
      farShift,
      ground: r,
      width: 7,
      footR: r * 0.065,
      farColor: darken(def.body, 0.4),
      reach: 0.18,
      custom: (i, far): LegPose | null => {
        const base = hips[i]!;
        const hip: Pt = far ? [base[0] + farShift[0], base[1] + farShift[1]] : base;
        if (stuck) {
          // Legs waving helplessly in the air.
          const ph = this.wave + i * 1.9 + (far ? 2.4 : 0);
          const foot: Pt = [
            hip[0] + Math.sin(ph) * r * 0.3 * flail.amp + (i - 1) * r * 0.2,
            -r * 0.62 + Math.cos(ph) * r * 0.16 * flail.amp - (1 - flail.amp) * r * 0.1,
          ];
          const knee: Pt = [(hip[0] + foot[0]) / 2 + (i - 1) * r * 0.18, (hip[1] + foot[1]) / 2 + r * 0.08];
          return { hip, knee, foot };
        }
        if (i !== 2 || frame.pose.flail) return null;
        if (frame.overhead) {
          // Front legs up, holding the load over his head.
          const sway = Math.sin(frame.time * 3) * r * 0.03;
          return far
            ? { hip, knee: [r * 0.82, -r * 0.62], foot: [-r * 0.08 + sway, -r * 1.14] }
            : { hip, knee: [r * 0.6, -r * 0.5], foot: [r * 0.22 + sway, -r * 1.1] };
        }
        if (frame.carrying) return { hip, knee: [r * 0.75, r * 0.3], foot: [r * 0.98, -r * 0.08] };
        return null;
      },
    };
  }

  /** Each elbowed feeler: base, elbow, and the springy tip. */
  private feelers(
    frame: BugFrame,
    springs: readonly AntennaSpring[],
  ): { base: Pt; elbow: Pt; mid: Pt; tip: Pt }[] {
    const { r } = this;
    const [hx, hy, hrx, hry] = this.head(this.stuck(frame));
    const bases: Pt[] = [
      [hx - hrx * 0.25, hy - hry * 0.8],
      [hx + hrx * 0.2, hy - hry * 0.88],
    ];
    return bases.map((base, i) => {
      const elbow: Pt = [base[0] + r * 0.05, base[1] - r * 0.32];
      const mid: Pt = [elbow[0] + r * 0.12, elbow[1] - r * 0.06];
      const tip = springTip(
        frame,
        springs[i]!,
        elbow,
        [elbow[0] + r * (0.26 + i * 0.05), elbow[1] + r * 0.02],
        0.6,
      );
      return { base, elbow, mid, tip };
    });
  }

  /** Small, kind eyes; worried on his back. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { r, def } = this;
    const [hx, hy, hrx, hry] = this.head(this.stuck(frame));
    const f = frame.face;
    const lid = lighten(def.body, 0.12);
    return {
      tint: f.tint ? { x: hx, y: hy, rx: hrx * 0.95, ry: hry * 0.95, circle: false } : null,
      eyes: [
        { x: hx - hrx * 0.22, y: hy - hry * 0.2, r: r * 0.085, shape: f.eyes, lid, line: 3, far: true },
        { x: hx + hrx * 0.3, y: hy - hry * 0.15, r: r * 0.1, shape: f.eyes, lid, line: 3.5, far: false },
      ],
      cheek: { x: hx + hrx * 0.62, y: hy + hry * 0.3, r: r * 0.06, alpha: f.blush ? 0.95 : 0.55 },
      mouth: {
        x: hx + hrx * 0.18,
        y: hy + hry * 0.42,
        s: r * 0.24,
        shape: f.mouth,
        color: 0xffd0b8,
        line: 3.5,
      },
    };
  }

  private adjustFor(frame: BugFrame, flail: ReturnType<typeof mooseFlail>): Adjust {
    return {
      tilt: this.stuck(frame) ? Math.sin(frame.time * 2.4) * 0.05 + flail.rock : 0,
      bob: 0,
      still: false,
    };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r } = this;
    const flail = this.advance(frame);
    walkLegs(this.L.legsBack, this.L.legsFront, frame, this.legOptions(frame, flail));
    // Elbowed feelers with little combs at the ends.
    const a = this.L.antennae;
    for (const { base, elbow, mid, tip } of this.feelers(frame, springs)) {
      a.moveTo(base[0], base[1])
        .lineTo(elbow[0], elbow[1])
        .stroke({ width: 4.5, color: OUTLINE, cap: 'round' });
      a.moveTo(elbow[0], elbow[1])
        .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
        .stroke({ width: 4, color: OUTLINE, cap: 'round' });
      for (let k = 0; k < 3; k++)
        a.moveTo(tip[0] - r * 0.02 + k * r * 0.035, tip[1] - r * 0.02)
          .lineTo(tip[0] + k * r * 0.035, tip[1] + r * 0.06)
          .stroke({ width: 3.5, color: OUTLINE, cap: 'round' });
    }
    // Face: small, kind eyes; worried on his back.
    const g = this.L.face;
    const f = frame.face;
    const [hx, hy, hrx, hry] = this.head(this.stuck(frame));
    tintHead(g, f.tint, hx, hy, hrx * 0.95, hry * 0.95);
    const spot = this.faceSpots(frame);
    const [fe, ne] = spot.eyes as [EyeSpot, EyeSpot];
    eyePair(g, frame, [fe.x, fe.y, fe.r], [ne.x, ne.y, ne.r], ne.lid, 3.5);
    const c = spot.cheek!;
    g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth!;
    drawMouth(g, m.x, m.y, m.s, f.mouth, frame.time, m.color, 3.5);
    return this.adjustFor(frame, flail);
  }

  skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton {
    const rig = this.bones;
    const flail = this.advance(frame);
    const stuck = this.stuck(frame);
    // On his back, the body is mirrored about the flip line and the head stays upright.
    const body = (part: string): PieceItem => {
      const q = pivotOf(rig, part);
      return stuck
        ? { kind: 'piece', part, slot: 'body', at: { x: q.x, y: this.flipLine - q.y }, sy: -1 }
        : rest(rig, part, 'body');
    };
    const items: SkeletonItem[] = [body('belly'), body('shell'), body('thorax')];
    const [hx, hy] = this.head(stuck);
    const [far, near] = this.antlerSpots(hx, hy) as [[number, number, number], [number, number, number]];
    items.push(
      {
        kind: 'piece',
        part: 'antler',
        slot: 'shell',
        at: pt([far[0], far[1]]),
        sx: far[2],
        sy: far[2],
        far: true,
      },
      { kind: 'piece', part: 'head', slot: 'shell', at: pt([hx, hy]) },
      { kind: 'piece', part: 'antler', slot: 'shell', at: pt([near[0], near[1]]) },
    );
    for (const { far: f, leg } of walkPoses(frame, this.legOptions(frame, flail)))
      items.push(limbItem('leg_upper', 'leg_lower', leg, f));
    for (const { base, elbow, tip } of this.feelers(frame, springs))
      items.push({
        kind: 'limb',
        part: 'antenna_base',
        lower: 'antenna_end',
        slot: 'top',
        hip: pt(base),
        knee: pt(elbow),
        foot: pt(tip),
      });
    const crown = this.crown(frame);
    return {
      items,
      face: this.faceSpots(frame),
      headPart: 'head',
      ball: null,
      paint: [{ mask: 1, box: this.paintBox(frame), colors: null }],
      extras: [],
      adjust: this.adjustFor(frame, flail),
      crown: pt([crown.x, crown.y]),
    };
  }
}
