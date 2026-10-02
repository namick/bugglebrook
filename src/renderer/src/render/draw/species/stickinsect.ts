import type { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../../game/constants';
import { CHEEK, OUTLINE, darken, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawEye, drawMouth } from '../face';
import { twigTell } from '../../pendingLife';
import { BasePainter } from './base';
import type { Adjust, AntennaSpring, Box, PainterArgs, Pt } from './common';
import { RIM, limb, rigLook, springAntenna, tintHead } from './common';

/** The plaza's item twig: 1.3 m by 0.11 m. Twig is drawn to match it exactly. */
const TWIG_W = 1.3 * PIXELS_PER_METER;
const TWIG_H = 0.11 * PIXELS_PER_METER;

/**
 * Twig the stick insect looks exactly like the plaza's twig (see `twig` in
 * draw/item.ts). Disguised, he is a twig, down to the last nub; when he
 * peeks, two tiny eyes open. Joined, he stands on six thin legs with his
 * stick body raised a little, deadpan.
 */
export class StickinsectPainter extends BasePainter {
  constructor(args: PainterArgs) {
    // His collider is a box: the ground is half its height below the center.
    const h = args.def.collider ? (args.def.collider.height * PIXELS_PER_METER) / 2 : args.r;
    super(args, h);
  }

  /** Lying flat and still, exactly like the item (until he is picked up and his legs come out). */
  private lying(frame: BugFrame): boolean {
    return frame.pending === 'disguised' && !frame.pose.flail;
  }

  /** Lying down: disguised, asleep, or thrown rigid like a stick. */
  private flat(frame: BugFrame): boolean {
    return this.lying(frame) || frame.mode === 'st_sleep' || this.rigid(frame);
  }

  /** Thrown: rigid as a stick, legs tucked, eyes shut. */
  private rigid(frame: BugFrame): boolean {
    return frame.mode === 'st_airborne' && !frame.hopping;
  }

  /** The stick's center line (y) in rig space: resting on the ground, or raised on its legs. */
  private stickY(frame: BugFrame): number {
    return this.flat(frame) ? this.foot - TWIG_H / 2 : -this.r * 0.55;
  }

  override key(frame: BugFrame): string {
    // Lying disguised, he cancels the facing flip so the nubs match the item's.
    return this.lying(frame) ? `twig:${frame.facing}` : `stick:${this.stickY(frame)}`;
  }

  /** The item twig's drawing, centered at (0, cy). `sx` mirrors it. */
  private drawStick(g: Graphics, cy: number, sx: number): void {
    const { def } = this;
    const w = TWIG_W;
    const h = TWIG_H;
    g.roundRect(-w / 2, cy - h / 2, w, h, h / 2)
      .fill(def.body)
      .stroke(stroke(4.5));
    for (const [x, dir] of [
      [-0.18, -1],
      [0.26, 1],
    ] as const) {
      g.moveTo(sx * w * x, cy - h / 2 + 2)
        .lineTo(sx * (w * x + dir * h * 0.8), cy - h * 1.3)
        .stroke({ width: h * 0.55, color: OUTLINE, cap: 'round' });
      g.moveTo(sx * w * x, cy - h / 2 + 2)
        .lineTo(sx * (w * x + dir * h * 0.8), cy - h * 1.3)
        .stroke({ width: h * 0.55 - 6, color: def.body, cap: 'round' });
    }
    for (let i = 0; i < 5; i++) {
      const x = -w * 0.4 + i * w * 0.2;
      g.moveTo(sx * x, cy - h * 0.1)
        .lineTo(sx * (x + w * 0.07), cy - h * 0.1)
        .stroke({ width: 2, color: darken(def.body, 0.35), cap: 'round' });
    }
    g.ellipse(sx * (w / 2 - h * 0.5), cy, h * 0.25, h * 0.32).fill(def.belly);
  }

  drawStatic(frame: BugFrame): void {
    const lying = this.lying(frame);
    const cy = this.stickY(frame);
    this.drawStick(this.L.body, cy, lying ? frame.facing : 1);
    const w = TWIG_W;
    const h = TWIG_H;
    this.L.rim.roundRect(-w / 2, cy - h / 2, w, h, Math.min(8, h / 2)).stroke(RIM);
  }

  mask(g: Graphics, frame: BugFrame): void {
    const cy = this.stickY(frame);
    g.roundRect(-TWIG_W / 2, cy - TWIG_H / 2, TWIG_W, TWIG_H, TWIG_H / 2).fill(0xffffff);
  }

  paintBox(frame: BugFrame): Box {
    const cy = this.stickY(frame);
    return { x0: -TWIG_W / 2, x1: TWIG_W / 2, y0: cy - TWIG_H * 0.1, y1: cy + TWIG_H / 2 };
  }

  override crown(frame: BugFrame): { x: number; y: number } {
    return { x: TWIG_W * 0.35, y: this.stickY(frame) - this.r * 1.3 };
  }

  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust {
    const { def } = this;
    const lying = this.lying(frame);
    const g = this.L.face;
    const f = frame.face;
    const cy = this.stickY(frame);
    const end = TWIG_W / 2;
    if (lying) {
      // A twig. Except, now and then, for two tiny eyes (the sim's peeks, and his
      // own tells: a blink every third time) or a feeler that twitches.
      const tell = frame.pending === 'disguised' ? twigTell(frame.time, 0) : { twitch: 0, eyes: 0 };
      const sx = frame.facing;
      const open = frame.peeking ? 1 : tell.eyes;
      this.life = Math.max(open, tell.twitch);
      if (open > 0.05) {
        const look = rigLook(frame);
        for (const x of [end - 30, end - 18])
          drawEye(g, sx * x, cy - 0.5, 4.2, 'open', look, open, def.body, frame.time, 2.2);
      }
      if (tell.twitch > 0.02) {
        const tip: Pt = [sx * (end + 12), cy - 3 - tell.twitch * 13];
        this.L.antennae
          .moveTo(sx * (end - 3), cy - 2)
          .quadraticCurveTo(sx * (end + 6), cy - 4 - tell.twitch * 4, tip[0], tip[1])
          .stroke({ width: 2.4, color: darken(def.body, 0.3), cap: 'round' });
      }
      return { tilt: 0, bob: 0, still: true };
    }
    const flat = this.flat(frame);
    // Six thin legs. Flat, they fold along the stick; standing, knees high; held, they dangle.
    const hips = [end * 0.55, end * 0.05, -end * 0.5];
    hips.forEach((hx, i) => {
      for (const far of [true, false]) {
        const lg = far ? this.L.legsBack : this.L.legsFront;
        const color = far ? darken(def.body, 0.45) : OUTLINE;
        const width = far ? 2.8 : 3.4;
        const dir = i === 0 ? 1.3 : i === 1 ? 0.6 : -1.1;
        const hip: Pt = [hx + (far ? 6 : 0), cy + TWIG_H * 0.3];
        const ph = frame.pose.legPhase * 0.8 + i * 2.1 + (far ? Math.PI : 0);
        let knee: Pt;
        let foot: Pt;
        if (flat) {
          // Folded along the stick.
          knee = [hip[0] + dir * 10, cy + TWIG_H * 0.55];
          foot = [hip[0] + dir * 26, cy + TWIG_H * 0.5];
        } else if (frame.pose.flail) {
          // Held: legs dangling and wriggling.
          const w = Math.sin(frame.time * 9 + i * 1.3 + (far ? 1 : 0)) * 6;
          knee = [hip[0] + dir * 14, cy + 16];
          foot = [hip[0] + dir * 22 + w, cy + 40 + Math.abs(w)];
        } else {
          const step = Math.sin(ph) * frame.pose.stride * 10;
          const lift = Math.max(0, Math.cos(ph)) * frame.pose.stride * 6;
          knee = [hip[0] + dir * 14 + step * 0.4, cy - 24 - lift];
          foot = [hip[0] + dir * 34 + step, this.foot - lift];
        }
        limb(lg, hip, knee, foot, width, color, far ? 0.85 : 1);
      }
    });
    // Two thin feelers off the front end.
    const a = this.L.antennae;
    if (!flat) {
      [0, 1].forEach((i) => {
        springAntenna(
          a,
          frame,
          springs[i]!,
          [end - 4, cy - 3],
          [end + 14, cy - 18 - i * 4],
          [end + 30 + i * 6, cy - 22 + i * 6],
          2.5,
          0.7,
        );
      });
    }
    // Tiny eyes near the front end, heavy-lidded; a very small, very flat mouth.
    tintHead(g, f.tint, end - 22, cy, 22, TWIG_H);
    const look = rigLook(frame);
    // Thrown rigid: eyes shut. Just landed: one eye open to check.
    const shut = this.rigid(frame);
    const wink = frame.mode === 'st_landing' || frame.mode === 'st_recover';
    const open = shut ? 0 : frame.pose.eyeOpen;
    drawEye(g, end - 30, cy - 1.5, 4.6, f.eyes, look, wink ? 0 : open, def.body, frame.time, 2.4);
    drawEye(g, end - 17, cy - 1.5, 5.2, f.eyes, look, open, def.body, frame.time, 2.4);
    g.circle(end - 9, cy + 3, 2.4).fill({ color: CHEEK, alpha: f.blush ? 0.9 : 0.35 });
    drawMouth(g, end - 14, cy + 2.5, 10, f.mouth, frame.time, OUTLINE, 2);
    return { tilt: 0, bob: 0, still: false };
  }
}
