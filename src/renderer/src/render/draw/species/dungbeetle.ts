import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, mix, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawEye, drawMouth } from '../face';
import { bartyFiddle } from '../../pendingLife';
import { BasePainter } from './base';
import type { Adjust, AntennaSpring, Box, LegPose, Pt } from './common';
import { RIM, dome, eyePair, limb, rigLook, springAntenna, tintHead, walkLegs } from './common';

const TEAL = 0x2e8b7a;
const VIOLET = 0x6a4fa3;

/**
 * Barty the dung beetle: a round iridescent shell that shifts from teal to
 * violet as he moves, a shovel-shaped head, and strong back legs for
 * rolling balls (walking backward, pushing with his hind legs). Flung, he
 * tucks into a shiny ball. Waiting to be found, he keeps his nose in the air.
 */
export class DungbeetlePainter extends BasePainter {
  override readonly curls = true;
  /** Where the sheen is in its teal-to-violet cycle; it runs faster as he moves. */
  private sheen = 0;

  private sheenColors(): [number, number, number] {
    const k = 0.5 + 0.5 * Math.sin(this.sheen);
    const k2 = 0.5 + 0.5 * Math.sin(this.sheen + 2.1);
    const k3 = 0.5 + 0.5 * Math.sin(this.sheen + 4.2);
    return [mix(TEAL, VIOLET, k), mix(TEAL, VIOLET, k2), mix(lighten(TEAL, 0.35), lighten(VIOLET, 0.35), k3)];
  }

  private shellPts(): number[] {
    const { r } = this;
    return dome(-r * 0.25, r * 0.44, r * 0.84, r * 1.06);
  }

  /** The shovel: a broad, flat head with a toothed front edge. */
  private shovel(g: Graphics): Graphics {
    const { r } = this;
    g.moveTo(r * 0.5, -r * 0.16).quadraticCurveTo(r * 1.05, -r * 0.34, r * 1.25, r * 0.06);
    // Three little teeth down the flared front edge.
    for (let i = 0; i < 3; i++) {
      const y0 = r * (0.08 + i * 0.12);
      g.lineTo(r * (1.4 + i * 0.03), y0 + r * 0.04).lineTo(r * (1.29 + i * 0.03), y0 + r * 0.11);
    }
    return g
      .lineTo(r * 1.42, r * 0.48)
      .quadraticCurveTo(r * 1.0, r * 0.54, r * 0.5, r * 0.48)
      .closePath();
  }

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    // Underside, in his violet.
    b.ellipse(-r * 0.25, r * 0.52, r * 0.8, r * 0.16)
      .fill(darken(def.belly, 0.2))
      .stroke(stroke());
    const g = this.L.rim;
    g.poly(this.shellPts()).stroke(RIM);
    this.shovel(g).stroke(RIM);
    g.ellipse(r * 0.42, r * 0.12, r * 0.3, r * 0.34).stroke(RIM);
    g.ellipse(-r * 0.25, r * 0.52, r * 0.8, r * 0.16).stroke(RIM);
  }

  mask(g: Graphics): void {
    const { r } = this;
    g.poly(this.shellPts()).fill(0xffffff);
    g.ellipse(-r * 0.25, r * 0.52, r * 0.8, r * 0.16).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.1, x1: r * 0.6, y0: -r * 0.32, y1: r * 0.68 };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.35, y: -this.r * 1.3 };
  }

  /** The shell, thorax, and shovel, recolored every frame as the sheen moves. */
  private drawShell(): void {
    const { r } = this;
    const s = this.L.shell.clear();
    const [c1, c2, c3] = this.sheenColors();
    // Thorax plate.
    s.ellipse(r * 0.42, r * 0.12, r * 0.3, r * 0.34)
      .fill(c2)
      .stroke(stroke());
    s.moveTo(r * 0.3, -r * 0.08)
      .quadraticCurveTo(r * 0.44, -r * 0.18, r * 0.58, -r * 0.08)
      .stroke({ width: r * 0.06, color: 0xffffff, alpha: 0.55, cap: 'round' });
    // The round shell, with bands of color sliding over it.
    const pts = this.shellPts();
    s.poly(pts).fill(c1).stroke(stroke());
    s.poly(dome(-r * 0.32, r * 0.3, r * 0.66, r * 0.82)).fill({ color: c2, alpha: 0.8 });
    s.poly(dome(-r * 0.4, r * 0.12, r * 0.46, r * 0.56)).fill({ color: c3, alpha: 0.55 });
    // Grooves along the wing cases.
    for (const k of [0.3, 0.55]) {
      s.moveTo(-r * 0.25 - r * 0.84 * k, r * 0.4)
        .quadraticCurveTo(-r * 0.25 - r * 0.7 * k, -r * 0.4 * (1 - k), -r * 0.25, -r * 0.62 + k * r * 0.1)
        .stroke({ width: 2.5, color: darken(c1, 0.35), alpha: 0.5, cap: 'round' });
    }
    s.poly(pts).stroke(stroke());
    // Shine and a twinkle.
    s.moveTo(-r * 0.85, -r * 0.1)
      .quadraticCurveTo(-r * 0.72, -r * 0.5, -r * 0.3, -r * 0.6)
      .stroke({ width: r * 0.11, color: 0xffffff, alpha: 0.7, cap: 'round' });
    const tw = Math.max(0, Math.sin(this.sheen * 1.7));
    if (tw > 0.2) s.star(-r * 0.1, -r * 0.5, 4, r * 0.1 * tw, r * 0.03).fill({ color: 0xffffff, alpha: tw });
    // The shovel head.
    this.shovel(s).fill(darken(c1, 0.25)).stroke(stroke());
    s.moveTo(r * 0.62, -r * 0.08)
      .quadraticCurveTo(r * 0.9, -r * 0.2, r * 1.1, r * 0.06)
      .stroke({ width: r * 0.06, color: lighten(c3, 0.3), alpha: 0.7, cap: 'round' });
    // The shovel's scraping lip.
    s.moveTo(r * 0.7, r * 0.43)
      .quadraticCurveTo(r * 1.05, r * 0.47, r * 1.33, r * 0.42)
      .stroke({ width: r * 0.05, color: lighten(c1, 0.35), alpha: 0.8, cap: 'round' });
  }

  /** Curled up: a shiny ball with his shovel tucked in and eyes squeezed shut. */
  private drawBall(frame: BugFrame): void {
    const { r } = this;
    const g = this.L.ball.clear();
    const [c1, c2, c3] = this.sheenColors();
    g.circle(0, 0, r).fill(c1).stroke(stroke());
    g.circle(-r * 0.12, -r * 0.12, r * 0.74).fill({ color: c2, alpha: 0.8 });
    g.circle(-r * 0.25, -r * 0.25, r * 0.42).fill({ color: c3, alpha: 0.55 });
    // The seam between his wing cases, curving round the ball.
    g.moveTo(-r * 0.2, -r * 0.97)
      .quadraticCurveTo(r * 0.35, -r * 0.1, -r * 0.1, r * 0.98)
      .stroke({ width: 3.5, color: darken(c1, 0.4), cap: 'round' });
    // Tucked legs and the shovel.
    for (const [x, y] of [
      [0.45, 0.55],
      [0.62, 0.32],
    ] as const)
      g.moveTo(r * x, r * y)
        .lineTo(r * (x + 0.18), r * (y + 0.12))
        .stroke({ width: 4.5, color: OUTLINE, cap: 'round' });
    g.moveTo(r * 0.55, -r * 0.62)
      .quadraticCurveTo(r * 1.05, -r * 0.4, r * 0.98, r * 0.05)
      .quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.55, -r * 0.62)
      .fill(darken(c1, 0.25))
      .stroke(stroke(4));
    drawEye(g, r * 0.5, -r * 0.2, r * 0.12, 'squint', { x: 0, y: 0 }, 1, c1, frame.time, 3.5);
    drawEye(g, r * 0.72, -r * 0.05, r * 0.13, 'squint', { x: 0, y: 0 }, 1, c1, frame.time, 3.5);
    g.arc(0, 0, r * 0.72, Math.PI * 1.1, Math.PI * 1.45).stroke({
      width: r * 0.14,
      color: 0xffffff,
      alpha: 0.6,
      cap: 'round',
    });
    g.circle(0, 0, r).stroke(stroke());
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { r, def } = this;
    const speed = Math.hypot(frame.vx, frame.vy);
    this.sheen += frame.dt * (0.5 + Math.min(4, speed) * 1.4);
    if (frame.face.form === 'curled') {
      this.drawBall(frame);
      return { tilt: 0, bob: 0, still: false };
    }
    this.drawShell();
    const rolling = !!frame.rolling && !frame.pose.flail;
    const aloof = frame.pending === 'aloof' && !frame.pose.flail;
    // Aloof, he fiddles while he waits: taps a foot, polishes a feeler, glances about.
    const fid = aloof ? bartyFiddle(frame.time, 0) : { tap: 0, preen: 0, glance: 0 };
    this.life = Math.max(fid.tap, fid.preen, Math.abs(fid.glance));
    const hips: Pt[] = [
      [-r * 0.62, r * 0.48],
      [-r * 0.18, r * 0.52],
      [r * 0.28, r * 0.5],
    ];
    const farShift: Pt = [r * 0.12, -r * 0.04];
    const knees: Pt[] = [];
    walkLegs(this.L.legsBack, this.L.legsFront, frame, {
      r,
      hips,
      farShift,
      ground: r,
      width: 5.5,
      footR: r * 0.07,
      farColor: darken(def.belly, 0.45),
      reverse: rolling,
      custom: (i, far, phase): LegPose | null => {
        const base = hips[i]!;
        const hip: Pt = far ? [base[0] + farShift[0], base[1] + farShift[1]] : base;
        if (frame.pose.flail) return null;
        if (i === 0) {
          const lift = far ? -r * 0.08 : 0;
          let leg: LegPose;
          if (rolling) {
            // Hind legs up on the ball behind him, pumping.
            const push = Math.sin(phase) * r * 0.08;
            leg = {
              hip,
              knee: [-r * 1.0 + push, -r * 0.12 + lift],
              foot: [-r * 1.3 + push * 1.5, r * 0.3 + lift * 2],
            };
          } else {
            const step = Math.sin(phase) * frame.pose.stride * r * 0.18;
            const up = Math.max(0, Math.cos(phase)) * frame.pose.stride * r * 0.12;
            leg = {
              hip,
              knee: [-r * 1.0 + step * 0.4, r * 0.12 + lift * 0.5],
              foot: [-r * 1.08 + step, r - up],
            };
          }
          knees[far ? 0 : 1] = leg.knee;
          return leg;
        }
        if (i === 2 && aloof && !far && fid.preen > 0) {
          const rub = Math.sin(frame.time * 16) * r * 0.05 * fid.preen;
          return {
            hip,
            knee: [hip[0] + r * 0.3 * fid.preen + r * 0.1, hip[1] - r * 0.1 * fid.preen],
            foot: [hip[0] + r * (0.3 + 0.32 * fid.preen) + rub, r - fid.preen * r * 1.05],
          };
        }
        if (i === 2 && aloof && !far && fid.tap > 0)
          return {
            hip,
            knee: [hip[0] + r * 0.2, hip[1] + r * 0.12 - fid.tap * r * 0.14],
            foot: [hip[0] + r * 0.34, r - fid.tap * r * 0.18],
          };
        if (i === 2 && frame.carrying && !rolling)
          return { hip, knee: [r * 0.72, r * 0.32], foot: [r * 0.98, -r * 0.08] };
        return null;
      },
    });
    // His strong hind legs: thick thighs with little spikes, over the thin legs.
    for (const far of [true, false]) {
      const knee = knees[far ? 0 : 1];
      if (!knee) continue;
      const g = far ? this.L.legsBack : this.L.legsFront;
      const hip: Pt = far ? [hips[0]![0] + farShift[0], hips[0]![1] + farShift[1]] : hips[0]!;
      const color = far ? darken(def.belly, 0.45) : OUTLINE;
      limb(
        g,
        hip,
        [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2 - r * 0.04],
        knee,
        far ? 9 : 11,
        color,
        far ? 0.85 : 1,
      );
      // A metallic stripe down the thigh.
      g.moveTo(hip[0], hip[1])
        .lineTo(knee[0], knee[1])
        .stroke({ width: far ? 3 : 4, color: far ? darken(def.belly, 0.2) : def.belly, cap: 'round' });
      for (const k of [0.45, 0.75])
        g.moveTo(hip[0] + (knee[0] - hip[0]) * k, hip[1] + (knee[1] - hip[1]) * k - r * 0.04)
          .lineTo(hip[0] + (knee[0] - hip[0]) * k + r * 0.02, hip[1] + (knee[1] - hip[1]) * k - r * 0.16)
          .stroke({ width: 3, color, cap: 'round', alpha: far ? 0.85 : 1 });
    }
    // Short feelers with fan-shaped clubs.
    const a = this.L.antennae;
    [
      [r * 0.72, -r * 0.18],
      [r * 0.9, -r * 0.2],
    ].forEach(([bx, by], i) => {
      const tip = springAntenna(
        a,
        frame,
        springs[i]!,
        [bx!, by!],
        [bx! + r * 0.05, by! - r * 0.25],
        [bx! + r * (0.2 + i * 0.1), by! - r * 0.36],
        4,
        0.6,
      );
      // Three little leaves fanned out.
      for (let k = -1; k <= 1; k++) {
        const ang = -Math.PI / 2 + k * 0.55 + 0.3;
        const ex = tip[0] + Math.cos(ang) * r * 0.1;
        const ey = tip[1] + Math.sin(ang) * r * 0.1;
        a.moveTo(tip[0], tip[1])
          .lineTo(ex, ey)
          .stroke({ width: r * 0.11, color: OUTLINE, cap: 'round' });
        a.moveTo(tip[0], tip[1])
          .lineTo(ex, ey)
          .stroke({ width: r * 0.11 - 4.5, color: def.accent, cap: 'round' });
      }
    });
    // Face on top of the shovel.
    const g = this.L.face;
    const f = frame.face;
    tintHead(g, f.tint, r * 0.88, r * 0.14, r * 0.38, r * 0.32);
    const look = aloof
      ? { x: 0.3 + fid.glance * 0.6, y: -0.85 + Math.abs(fid.glance) * 0.55 }
      : rigLook(frame);
    eyePair(
      g,
      frame,
      [r * 0.74, r * 0.02, r * 0.15],
      [r * 0.98, r * 0.04, r * 0.17],
      darken(TEAL, 0.25),
      3.5,
      f.eyes,
      look,
    );
    g.circle(r * 1.12, r * 0.24, r * 0.07).fill({ color: CHEEK, alpha: f.blush ? 0.9 : 0.5 });
    drawMouth(g, r * 0.98, r * 0.32, r * 0.28, f.mouth, frame.time, 0xd8f5ee, 3.5);
    // Rolling: head down, rear up. Aloof: nose in the air.
    return {
      tilt: rolling ? 0.16 : aloof ? -0.16 + Math.sin(frame.time * 1.2) * 0.02 : 0,
      bob: rolling ? -2 : 0,
      still: false,
    };
  }
}
