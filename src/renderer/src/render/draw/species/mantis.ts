import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import type { EyeSpot } from '../../rig/bugRig';
import type { LimbItem, Skeleton, SkeletonFace, SkeletonItem } from '../../rig/skeleton';
import { pivotOf, pt, quadRope, rest } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, LegPose, Pt, Oval } from './common';
import {
  RIM,
  drawSwoosh,
  eyePair,
  lerpPt,
  limb,
  limbItem,
  smooth,
  springTip,
  swooshAlpha,
  tintHead,
  tube,
} from './common';

/** One raptorial arm: shoulder, elbow (end of the thigh), and the tip of the folded blade. */
interface Arm {
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
}

/**
 * Prim the praying mantis: tall, slim, and bright green, with a triangular
 * head, huge eyes, and folded front arms. Poses and karate chops throw her
 * arms up and out.
 */
export class MantisPainter extends BasePainter {
  private abdomen(): number[] {
    const { r } = this;
    const pts: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      // A long leaf: widest just behind the middle, pointed tail curling up a touch.
      const thick = 0.22 * Math.sin(((x + 1) / 2) * Math.PI * 0.85 + 0.25);
      pts.push(
        -r * 0.68 + x * r * 0.72,
        r * 0.26 + y * r * thick - (x < -0.6 ? (x + 0.6) * (x + 0.6) * r * 0.5 : 0),
      );
    }
    return pts;
  }

  /** The long neck (prothorax), from the body up to the head. */
  private neck(): number[] {
    const { r } = this;
    return tube(
      [r * 0.0, r * 0.22],
      [r * 0.3, r * 0.05],
      [r * 0.5, -r * 0.3],
      [r * 0.88, -r * 0.7],
      r * 0.3,
      r * 0.2,
    );
  }

  private headPath(g: Graphics): Graphics {
    const { r } = this;
    return g
      .moveTo(r * 0.48, -r * 1.12)
      .quadraticCurveTo(r * 1.0, -r * 1.3, r * 1.56, -r * 1.06)
      .quadraticCurveTo(r * 1.48, -r * 0.8, r * 1.2, -r * 0.42)
      .quadraticCurveTo(r * 1.1, -r * 0.32, r * 1.0, -r * 0.44)
      .quadraticCurveTo(r * 0.62, -r * 0.8, r * 0.48, -r * 1.12)
      .closePath();
  }

  drawStatic(frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    const s = this.L.shell;
    // Abdomen with a pale belly and segment lines.
    b.poly(this.abdomen()).fill(def.body).stroke(stroke(5.5));
    b.moveTo(-r * 1.25, r * 0.36)
      .quadraticCurveTo(-r * 0.7, r * 0.52, -r * 0.05, r * 0.38)
      .stroke({ width: r * 0.1, color: def.belly, cap: 'round' });
    for (const k of [-1.05, -0.8, -0.55, -0.3])
      b.moveTo(r * k, r * 0.2)
        .quadraticCurveTo(r * (k + 0.05), r * 0.33, r * k, r * 0.44)
        .stroke({ width: 3, color: darken(def.body, 0.25), cap: 'round' });
    // Folded wings along the back, unless they are open.
    if (frame.face.form !== 'flying') {
      b.moveTo(r * 0.02, r * 0.12)
        .quadraticCurveTo(-r * 0.6, -r * 0.08, -r * 1.3, r * 0.08)
        .quadraticCurveTo(-r * 0.6, r * 0.28, r * 0.02, r * 0.22)
        .closePath()
        .fill(def.accent)
        .stroke(stroke(4.5));
      b.moveTo(-r * 0.1, r * 0.14)
        .quadraticCurveTo(-r * 0.6, r * 0.05, -r * 1.15, r * 0.1)
        .stroke({ width: 2.5, color: lighten(def.accent, 0.4), alpha: 0.9, cap: 'round' });
    }
    // The long neck and the triangular head.
    s.poly(this.neck()).fill(def.body).stroke(stroke(5));
    s.moveTo(r * 0.18, r * 0.1)
      .quadraticCurveTo(r * 0.45, -r * 0.2, r * 0.7, -r * 0.5)
      .stroke({ width: r * 0.05, color: 0xffffff, alpha: 0.45, cap: 'round' });
    this.headPath(s).fill(lighten(def.body, 0.1)).stroke(stroke());
    s.moveTo(r * 0.9, -r * 1.08)
      .quadraticCurveTo(r * 1.05, -r * 1.12, r * 1.2, -r * 1.08)
      .stroke({ width: r * 0.05, color: 0xffffff, alpha: 0.5, cap: 'round' });
    const g = this.L.rim;
    g.poly(this.abdomen()).stroke(RIM);
    g.poly(this.neck()).stroke(RIM);
    this.headPath(g).stroke(RIM);
  }

  mask(g: Graphics): void {
    g.poly(this.abdomen()).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.42, x1: r * 0.05, y0: r * 0.22, y1: r * 0.5 };
  }

  protected headOval(): Oval {
    const { r } = this;
    return { x: r * 1.02, y: -r * 0.84, rx: r * 0.42, ry: r * 0.3 };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.95, y: -this.r * 1.75 };
  }

  /** The folded "praying" arm, a karate pose (up and out), or flailing loose. */
  private arm(frame: BugFrame, far: boolean): Arm {
    const { r } = this;
    const off: Pt = far ? [r * 0.08, -r * 0.04] : [0, 0];
    const shoulder: Pt = [r * 0.5 + off[0], -r * 0.3 + off[1]];
    const sway = Math.sin(frame.time * 1.6 + (far ? 0.6 : 0)) * r * 0.03;
    // Folded: the thigh held forward, the blade hanging back down, like praying hands.
    let elbow: Pt = [r * 1.12 + off[0] + sway, -r * 0.36 + off[1]];
    let hand: Pt = [r * 0.86 + off[0] + sway, r * 0.04 + off[1]];
    if (frame.pose.flail) {
      const w = Math.sin(frame.time * 13 + (far ? 1.5 : 0)) * r * 0.2;
      elbow = [r * 1.05 + off[0], -r * 0.7 + w];
      hand = [r * 1.45 + off[0], -r * 0.95 + w * 1.4];
    }
    const kt = frame.karate;
    if (kt && kt.k > 0) {
      const k = smooth(kt.k);
      let poseElbow: Pt;
      let poseHand: Pt;
      if (far) {
        // Thrust straight out in front.
        poseElbow = [r * 1.45, -r * 0.28];
        poseHand = [r * 2.0, -r * 0.34];
      } else {
        // Raised high, blade out. A chop brings it slashing down.
        poseElbow = [r * 1.6, -r * 0.92];
        poseHand = [r * 1.82, -r * 1.6];
        if (kt.chop) {
          const slash = smooth((kt.t - 0.25) / 0.14);
          poseElbow = lerpPt(poseElbow, [r * 1.5, -r * 0.62], slash);
          poseHand = lerpPt(poseHand, [r * 2.1, -r * 0.42], slash);
        }
      }
      elbow = lerpPt(elbow, poseElbow, k);
      hand = lerpPt(hand, poseHand, k);
    }
    return { shoulder, elbow, hand };
  }

  private drawArm(g: Graphics, arm: Arm, far: boolean): void {
    const { r, def } = this;
    const color = far ? darken(def.body, 0.18) : def.body;
    const { shoulder: s, elbow: e, hand: h } = arm;
    const mid: Pt = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2];
    // Thigh: a stout tube with spines on its inner edge.
    g.poly(tube(s, [mid[0] - r * 0.02, mid[1]], [mid[0] + r * 0.02, mid[1]], e, r * 0.22, r * 0.13))
      .fill(color)
      .stroke(stroke(far ? 3.5 : 4));
    const dx = e[0] - s[0];
    const dy = e[1] - s[1];
    const len = Math.hypot(dx, dy) || 1;
    for (const k of [0.35, 0.55, 0.75]) {
      const px = s[0] + dx * k + (dy / len) * r * 0.07;
      const py = s[1] + dy * k - (dx / len) * r * 0.07;
      g.moveTo(px, py)
        .lineTo(
          px + (dy / len) * r * 0.07 - (dx / len) * r * 0.03,
          py - (dx / len) * r * 0.07 - (dy / len) * r * 0.03,
        )
        .stroke({ width: 2.5, color: OUTLINE, cap: 'round', alpha: far ? 0.8 : 1 });
    }
    // Blade: a slimmer shin with a hooked tip.
    g.poly(
      tube(
        e,
        [(e[0] * 2 + h[0]) / 3, (e[1] * 2 + h[1]) / 3],
        [(e[0] + h[0] * 2) / 3, (e[1] + h[1] * 2) / 3],
        h,
        r * 0.14,
        r * 0.07,
      ),
    )
      .fill(lighten(color, 0.08))
      .stroke(stroke(far ? 3 : 3.5));
    const hx = h[0] - e[0];
    const hy = h[1] - e[1];
    const hl = Math.hypot(hx, hy) || 1;
    g.moveTo(h[0], h[1])
      .lineTo(
        h[0] - (hx / hl) * r * 0.06 + (hy / hl) * r * 0.08,
        h[1] - (hy / hl) * r * 0.06 - (hx / hl) * r * 0.08,
      )
      .stroke({ width: 3.5, color: OUTLINE, cap: 'round' });
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r, def } = this;
    const back = this.L.legsBack;
    const front = this.L.legsFront;
    const kt = this.kt(frame);
    // Four long walking legs, knees high, like stilts.
    for (const { far, dir, leg } of this.legs(frame)) {
      const g = far ? back : front;
      const { hip, knee, foot } = leg;
      limb(g, hip, knee, foot, far ? 3.5 : 4.5, far ? darken(def.body, 0.45) : OUTLINE, far ? 0.85 : 1);
      g.moveTo(foot[0], foot[1])
        .lineTo(foot[0] + dir * r * 0.1, foot[1])
        .stroke({ width: far ? 3.5 : 4.5, color: far ? darken(def.body, 0.45) : OUTLINE, cap: 'round' });
    }
    // Open wings when flung.
    const w = this.L.wings.clear();
    if (frame.face.form === 'flying') {
      const flap = Math.sin(frame.time * 30);
      for (const [ox, k] of [
        [-0.1, 1],
        [0.08, 0.75],
      ] as const) {
        const h = r * (0.8 + 0.25 * flap * k);
        w.ellipse(r * ox - r * 0.45, -r * 0.1 - h * 0.55, r * 0.34, h)
          .fill({ color: lighten(def.accent, 0.35), alpha: 0.75 })
          .stroke({ width: 3, color: OUTLINE, alpha: 0.6 });
        w.moveTo(r * ox - r * 0.45, r * 0.2)
          .lineTo(r * ox - r * 0.45, -r * 0.1 - h * 1.3)
          .stroke({ width: 2, color: darken(def.accent, 0.2), alpha: 0.6 });
      }
    }
    // The raptorial arms: far one behind the neck, near one in front of everything.
    this.drawArm(back, this.arm(frame, true), true);
    this.drawArm(this.L.antennae, this.arm(frame, false), false);
    // A swoosh as a chop comes down.
    const sw = swooshAlpha(frame);
    if (sw > 0) drawSwoosh(this.L.antennae, r, sw);
    // Long feelers sweeping back over her.
    const a = this.L.antennae;
    for (const { base, mid, tip } of this.feelers(frame, springs))
      a.moveTo(base[0], base[1])
        .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
        .stroke({ width: 3, color: OUTLINE, cap: 'round' });
    // The face: huge eyes at the corners of the triangle, a tiny mouth at the point.
    const g = this.L.face;
    const f = frame.face;
    tintHead(g, f.tint, r * 1.02, -r * 0.84, r * 0.42, r * 0.3);
    const spot = this.faceSpots(frame);
    const [fe, ne] = spot.eyes as [EyeSpot, EyeSpot];
    eyePair(g, frame, [fe.x, fe.y, fe.r], [ne.x, ne.y, ne.r], ne.lid, 4);
    const c = spot.cheek!;
    g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth!;
    drawMouth(g, m.x, m.y, m.s, f.mouth, frame.time, OUTLINE, 3.5);
    return { tilt: -0.08 * kt, bob: 0, still: false };
  }

  /** How far into a karate pose she is, smoothed (0 when not posing). */
  private kt(frame: BugFrame): number {
    return frame.karate && frame.karate.k > 0 ? smooth(frame.karate.k) : 0;
  }

  /** Four long walking legs, knees high, like stilts; one drawn up in the crane stance. */
  private legs(frame: BugFrame): { far: boolean; dir: number; leg: LegPose }[] {
    const { r } = this;
    const pose = frame.pose;
    const kt = this.kt(frame);
    const hips: [Pt, number][] = [
      [[-r * 0.28, r * 0.3], -1],
      [[-r * 0.02, r * 0.3], 1],
    ];
    const out: { far: boolean; dir: number; leg: LegPose }[] = [];
    hips.forEach(([hip0, dir], i) => {
      for (const far of [true, false]) {
        const hip: Pt = far ? [hip0[0] + r * 0.1, hip0[1] - r * 0.04] : hip0;
        const ph = pose.legPhase + i * Math.PI + (far ? Math.PI * 0.5 : 0);
        let knee: Pt;
        let foot: Pt;
        if (pose.flail) {
          const w = Math.sin(ph * 1.1) * r * 0.2;
          knee = [hip[0] + dir * r * 0.45, hip[1] + r * 0.3];
          foot = [hip[0] + dir * r * 0.65 + w, hip[1] + r * 0.9];
        } else {
          const step = Math.sin(ph) * pose.stride * r * 0.25;
          const lift = Math.max(0, Math.cos(ph)) * pose.stride * r * 0.15;
          knee = [hip[0] + dir * r * 0.4 + step * 0.5, -r * 0.18 - lift * 0.5];
          foot = [hip[0] + dir * r * 0.78 + step, r - lift];
          if (kt > 0 && !far && dir > 0) {
            // The crane stance: one leg drawn up.
            knee = lerpPt(knee, [hip[0] + r * 0.42, -r * 0.05], kt);
            foot = lerpPt(foot, [hip[0] + r * 0.12, r * 0.42], kt);
          }
        }
        out.push({ far, dir, leg: { hip, knee, foot } });
      }
    });
    return out;
  }

  /** Long feelers sweeping back over her: base, bend, and springy tip. */
  private feelers(frame: BugFrame, springs: readonly AntennaSpring[]): { base: Pt; mid: Pt; tip: Pt }[] {
    const { r } = this;
    const bases: Pt[] = [
      [r * 0.88, -r * 1.18],
      [r * 1.1, -r * 1.18],
    ];
    return bases.map(([bx, by], i) => ({
      base: [bx, by] as Pt,
      mid: [bx - r * 0.05, by - r * 0.6] as Pt,
      tip: springTip(
        frame,
        springs[i]!,
        [bx, by],
        [bx - r * (0.45 - i * 0.2), by - r * (0.85 - i * 0.05)],
        1.3,
      ),
    }));
  }

  /** Huge eyes at the corners of the triangle, a tiny mouth at the point. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { r, def } = this;
    const f = frame.face;
    const lid = lighten(def.body, 0.1);
    return {
      tint: f.tint ? { x: r * 1.02, y: -r * 0.84, rx: r * 0.42, ry: r * 0.3, circle: false } : null,
      eyes: [
        { x: r * 0.66, y: -r * 1.04, r: r * 0.22, shape: f.eyes, lid, line: 3.5, far: true },
        { x: r * 1.36, y: -r * 0.98, r: r * 0.26, shape: f.eyes, lid, line: 4, far: false },
      ],
      cheek: { x: r * 1.36, y: -r * 0.66, r: r * 0.08, alpha: f.blush ? 0.95 : 0.55 },
      mouth: { x: r * 1.1, y: -r * 0.56, s: r * 0.24, shape: f.mouth, color: OUTLINE, line: 3.5 },
    };
  }

  /** Wings open when flung: their center and height this frame, back one first. */
  private openWings(frame: BugFrame): { x: number; y: number; h: number }[] {
    const { r } = this;
    if (frame.face.form !== 'flying') return [];
    const flap = Math.sin(frame.time * 30);
    return (
      [
        [-0.1, 1],
        [0.08, 0.75],
      ] as const
    ).map(([ox, k]) => {
      const h = r * (0.8 + 0.25 * flap * k);
      return { x: r * ox - r * 0.45, y: -r * 0.1 - h * 0.55, h };
    });
  }

  skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton {
    const { r } = this;
    const rig = this.bones;
    const items: SkeletonItem[] = [];
    const arm = (a: Arm, far: boolean): LimbItem => ({
      ...limbItem('arm_thigh', 'arm_blade', { hip: a.shoulder, knee: a.elbow, foot: a.hand }, far),
      slot: far ? 'back' : 'top',
    });
    for (const { far, leg } of this.legs(frame)) items.push(limbItem('leg_upper', 'leg_lower', leg, far));
    items.push(arm(this.arm(frame, true), true));
    // The open wings flap about their middles; the pivot sits a little above the rest middle.
    const wingRest = pivotOf(rig, 'wing_open');
    this.openWings(frame).forEach((w, i) =>
      items.push({
        kind: 'piece',
        part: 'wing_open',
        slot: 'wings',
        at: { x: w.x - r * 0.01, y: w.y + (wingRest.y + r * 0.54) },
        sy: w.h / (r * 0.8),
        far: i === 0,
      }),
    );
    const flying = frame.face.form === 'flying';
    items.push(rest(rig, 'abdomen', 'body'));
    if (!flying) items.push(rest(rig, 'wing_folded', 'body'));
    items.push(rest(rig, 'neck', 'shell'), rest(rig, 'head', 'shell'));
    items.push(arm(this.arm(frame, false), false));
    for (const { base, mid, tip } of this.feelers(frame, springs))
      items.push({ kind: 'rope', part: 'antenna', slot: 'top', pts: quadRope(pt(base), pt(mid), pt(tip)) });
    const sw = swooshAlpha(frame);
    const crown = this.crown();
    return {
      items,
      face: this.faceSpots(frame),
      headPart: 'head',
      ball: null,
      paint: [{ mask: items.findIndex((i) => i.part === 'abdomen'), box: this.paintBox(), colors: null }],
      extras: sw > 0 ? [{ kind: 'swoosh', alpha: sw }] : [],
      adjust: { tilt: -0.08 * this.kt(frame), bob: 0, still: false },
      crown: pt([crown.x, crown.y]),
    };
  }
}
