import type { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../../game/constants';
import { CHEEK, OUTLINE, darken, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawEye, drawMouth } from '../face';
import { twigTell } from '../../pendingLife';
import { BasePainter } from './base';
import type { Skeleton, SkeletonFace } from '../../rig/skeleton';
import { pt, quadRope } from '../../rig/skeleton';
import type { Adjust, AntennaSpring, Box, LegPose, PainterArgs, Pt } from './common';
import { RIM, limb, limbItem, rigLook, springTip, tintHead } from './common';

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

  /** Disguised: how open the tiny eyes are and how far a feeler twitches (the sim's peeks, and his own tells). */
  private tells(frame: BugFrame): { open: number; twitch: number } {
    const tell = frame.pending === 'disguised' ? twigTell(frame.time, 0) : { twitch: 0, eyes: 0 };
    const open = frame.peeking ? 1 : tell.eyes;
    this.life = Math.max(open, tell.twitch);
    return { open, twitch: tell.twitch };
  }

  /** The twitching feeler while disguised: base, bend, and tip. */
  private twitchFeeler(sx: number, cy: number, twitch: number): { base: Pt; mid: Pt; tip: Pt } {
    const end = TWIG_W / 2;
    return {
      base: [sx * (end - 3), cy - 2],
      mid: [sx * (end + 6), cy - 4 - twitch * 4],
      tip: [sx * (end + 12), cy - 3 - twitch * 13],
    };
  }

  /** Six thin legs. Flat, they fold along the stick; standing, knees high; held, they dangle. */
  private legs(frame: BugFrame): { far: boolean; leg: LegPose }[] {
    const cy = this.stickY(frame);
    const end = TWIG_W / 2;
    const flat = this.flat(frame);
    const hips = [end * 0.55, end * 0.05, -end * 0.5];
    const out: { far: boolean; leg: LegPose }[] = [];
    hips.forEach((hx, i) => {
      for (const far of [true, false]) {
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
        out.push({ far, leg: { hip, knee, foot } });
      }
    });
    return out;
  }

  /** Two thin feelers off the front end, standing. */
  private feelers(frame: BugFrame, springs: readonly AntennaSpring[]): { base: Pt; mid: Pt; tip: Pt }[] {
    const cy = this.stickY(frame);
    const end = TWIG_W / 2;
    return [0, 1].map((i) => {
      const base: Pt = [end - 4, cy - 3];
      return {
        base,
        mid: [end + 14, cy - 18 - i * 4] as Pt,
        tip: springTip(frame, springs[i]!, base, [end + 30 + i * 6, cy - 22 + i * 6], 0.7),
      };
    });
  }

  /** Tiny eyes near the front end, heavy-lidded; a very small, very flat mouth. */
  private faceSpots(frame: BugFrame): SkeletonFace {
    const { def } = this;
    const f = frame.face;
    const cy = this.stickY(frame);
    const end = TWIG_W / 2;
    // Thrown rigid: eyes shut. Just landed: one eye open to check.
    const shut = this.rigid(frame);
    const wink = frame.mode === 'st_landing' || frame.mode === 'st_recover';
    const open = shut ? 0 : frame.pose.eyeOpen;
    const eye = (x: number, er: number, o: number, far: boolean) =>
      ({ x, y: cy - 1.5, r: er, shape: f.eyes, lid: def.body, line: 2.4, far, open: o }) as const;
    return {
      tint: f.tint ? { x: end - 22, y: cy, rx: 22, ry: TWIG_H, circle: false } : null,
      eyes: [eye(end - 30, 4.6, wink ? 0 : open, true), eye(end - 17, 5.2, open, false)],
      cheek: { x: end - 9, y: cy + 3, r: 2.4, alpha: f.blush ? 0.9 : 0.35 },
      mouth: { x: end - 14, y: cy + 2.5, s: 10, shape: f.mouth, color: OUTLINE, line: 2 },
    };
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
      const sx = frame.facing;
      const { open, twitch } = this.tells(frame);
      if (open > 0.05) {
        const look = rigLook(frame);
        for (const x of [end - 30, end - 18])
          drawEye(g, sx * x, cy - 0.5, 4.2, 'open', look, open, def.body, frame.time, 2.2);
      }
      if (twitch > 0.02) {
        const { base, mid, tip } = this.twitchFeeler(sx, cy, twitch);
        this.L.antennae
          .moveTo(base[0], base[1])
          .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
          .stroke({ width: 2.4, color: darken(def.body, 0.3), cap: 'round' });
      }
      return { tilt: 0, bob: 0, still: true };
    }
    for (const { far, leg } of this.legs(frame)) {
      const lg = far ? this.L.legsBack : this.L.legsFront;
      const color = far ? darken(def.body, 0.45) : OUTLINE;
      const width = far ? 2.8 : 3.4;
      limb(lg, leg.hip, leg.knee, leg.foot, width, color, far ? 0.85 : 1);
    }
    // Two thin feelers off the front end.
    const a = this.L.antennae;
    if (!this.flat(frame))
      for (const { base, mid, tip } of this.feelers(frame, springs))
        a.moveTo(base[0], base[1])
          .quadraticCurveTo(mid[0], mid[1], tip[0], tip[1])
          .stroke({ width: 2.5, color: OUTLINE, cap: 'round' });
    // Tiny eyes near the front end, heavy-lidded; a very small, very flat mouth.
    tintHead(g, f.tint, end - 22, cy, 22, TWIG_H);
    const look = rigLook(frame);
    const spot = this.faceSpots(frame);
    for (const e of spot.eyes) drawEye(g, e.x, e.y, e.r, f.eyes, look, e.open!, def.body, frame.time, 2.4);
    const c = spot.cheek!;
    g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth!;
    drawMouth(g, m.x, m.y, m.s, f.mouth, frame.time, OUTLINE, 2);
    return { tilt: 0, bob: 0, still: false };
  }

  skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton {
    const { def } = this;
    const cy = this.stickY(frame);
    const end = TWIG_W / 2;
    const crownAt = this.crown(frame);
    const sk: Skeleton = {
      items: [],
      face: null,
      headPart: 'stick',
      ball: null,
      paint: [],
      extras: [],
      adjust: { tilt: 0, bob: 0, still: false },
      crown: pt([crownAt.x, crownAt.y]),
    };
    const items = sk.items;
    if (this.lying(frame)) {
      // Exactly the item twig: the facing flip is cancelled so the nubs match.
      const sx = frame.facing;
      const { open, twitch } = this.tells(frame);
      items.push({ kind: 'piece', part: 'stick', slot: 'body', at: { x: 0, y: cy }, sx });
      if (twitch > 0.02) {
        const { base, mid, tip } = this.twitchFeeler(sx, cy, twitch);
        items.push({ kind: 'rope', part: 'antenna', slot: 'top', pts: quadRope(pt(base), pt(mid), pt(tip)) });
      }
      sk.face =
        open > 0.05
          ? {
              tint: null,
              eyes: [end - 30, end - 18].map((x, i) => ({
                x: sx * x,
                y: cy - 0.5,
                r: 4.2,
                shape: 'open' as const,
                lid: def.body,
                line: 2.2,
                far: i === 0,
                open,
              })),
              cheek: null,
              mouth: null,
            }
          : null;
      sk.headPart = null;
      sk.adjust = { tilt: 0, bob: 0, still: true };
      return sk;
    }
    // Lying flat, his legs fold tight under the stick: drawn legs can't shrink that far, so they tuck away.
    if (!this.flat(frame))
      for (const { far, leg } of this.legs(frame)) items.push(limbItem('leg_upper', 'leg_lower', leg, far));
    items.push({ kind: 'piece', part: 'stick', slot: 'body', at: { x: 0, y: cy } });
    if (!this.flat(frame))
      for (const { base, mid, tip } of this.feelers(frame, springs))
        items.push({ kind: 'rope', part: 'antenna', slot: 'top', pts: quadRope(pt(base), pt(mid), pt(tip)) });
    sk.face = this.faceSpots(frame);
    sk.paint.push({
      mask: items.findIndex((i) => i.part === 'stick'),
      box: this.paintBox(frame),
      colors: null,
    });
    return sk;
  }
}
