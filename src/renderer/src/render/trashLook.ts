/**
 * How the trash can and the tidy whistle look and move (playtest F1 and
 * F2). Pure, so Vitest can check it: the lid's spring, what makes the lid
 * open, where the googly eyes look, and the path a tidied thing swooshes
 * along.
 */

export interface Pt {
  x: number;
  y: number;
}

/** The can, in pixels: its width, its height, and the lid's overhang. */
export const CAN = { w: 150, h: 180, lid: 92 } as const;

/** How far the lid stands open, 0 (shut) to 1 (flung right back). */
export const LID = {
  /** Something it would eat is right over its mouth: wide open, ready. */
  hungry: 0.95,
  /** The hand carries something toward it: the lid lifts and chatters. */
  peek: 0.35,
  /** The hand rests near it (the hint): a sly little lift. */
  hint: 0.2,
  /** A bug is in it to the shoulders. */
  rummage: 0.75,
  /** Held things this close (m) make it peek. */
  near: 4,
} as const;

/** What the lid wants to do this frame, from what is around it. */
export interface LidInput {
  /** The held thing's distance from the mouth (m), or null when the hand holds nothing that fits. */
  held: number | null;
  /** The held thing would drop in if let go now. */
  over: boolean;
  /** A bug rummaging in it. */
  rummaging: boolean;
  /** The hint's wobble, 0 to 1. */
  hint: number;
  /** Seconds, for chatter. */
  time: number;
}

/** How open the lid wants to be (0 to 1). */
export function lidTarget(i: LidInput): number {
  if (i.over) return LID.hungry;
  if (i.rummaging) return LID.rummage + Math.max(0, Math.sin(i.time * 22)) * 0.2;
  if (i.held !== null && i.held < LID.near) {
    // Closer is wider, with a hungry chatter.
    const near = 1 - i.held / LID.near;
    return LID.peek * (0.4 + 0.6 * near) + Math.max(0, Math.sin(i.time * 14)) * 0.12 * near;
  }
  return i.hint * LID.hint;
}

/** A springy hinge: the lid swings toward its target, overshoots, and clangs. */
export class LidSpring {
  open = 0;
  vel = 0;

  /** Slam it: a kick toward shut (negative) or open (positive). */
  kick(v: number): void {
    this.vel += v;
  }

  /** One frame. Returns true the moment the lid hits the rim (a clang). */
  update(dt: number, target: number): boolean {
    const k = 260;
    const damp = 15;
    this.vel += ((target - this.open) * k - this.vel * damp) * dt;
    const before = this.open;
    this.open += this.vel * dt;
    if (this.open < 0) {
      this.open = 0;
      const hard = this.vel < -2.5 && before > 0.02;
      this.vel = -this.vel * 0.35;
      return hard;
    }
    if (this.open > 1.15) {
      this.open = 1.15;
      this.vel = Math.min(0, this.vel);
    }
    return false;
  }
}

/** Where a googly eye's pupil sits, `r` px at most from its middle, looking toward `at`. */
export function pupil(eye: Pt, at: Pt | null, r: number, time: number): Pt {
  if (!at) {
    // Nothing to watch: a slow look around.
    const a = Math.sin(time * 0.7) * 1.2;
    return { x: eye.x + Math.sin(a) * r * 0.6, y: eye.y + r * 0.3 };
  }
  const dx = at.x - eye.x;
  const dy = at.y - eye.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / 60);
  return { x: eye.x + (dx / d) * r * k, y: eye.y + (dy / d) * r * k };
}

/** The part of a bug's pose that rummaging changes. */
export interface RummagePose {
  tilt: number;
  bob: number;
  flail: boolean;
  legPhase: number;
  stride: number;
}

/**
 * A bug rummaging in the can: tipped head first toward it (`facing`), lifted
 * on its front, legs kicking in the air, wriggling as it digs. `r` is its
 * radius in pixels.
 */
export function rummagePose<P extends RummagePose>(p: P, time: number, facing: 1 | -1, r: number): P {
  const dig = Math.sin(time * 11);
  return {
    ...p,
    tilt: facing * (1.05 + dig * 0.12),
    bob: -r * (0.35 + Math.max(0, dig) * 0.1),
    flail: true,
    legPhase: time * 24,
    stride: 1,
  };
}

/** How long a tidied thing takes to swoosh (s). */
export const SWOOSH_SECONDS = 0.8;

/**
 * A tidied thing's swoosh, `t` (0 to 1) along: up in a hop, then off in an
 * arc to where it goes, spinning, shrinking a little as it leaves.
 */
export function swoosh(from: Pt, to: Pt, t: number): Pt & { scale: number; spin: number; alpha: number } {
  const u = Math.max(0, Math.min(1, t));
  // Ease in: a moment's lift before it zips.
  const e = u * u * (3 - 2 * u);
  const lift = Math.min(260, 120 + Math.abs(to.x - from.x) * 0.15);
  const x = from.x + (to.x - from.x) * e;
  const y = from.y + (to.y - from.y) * e - Math.sin(u * Math.PI) * lift;
  return {
    x,
    y,
    scale: 1 + 0.6 * Math.sin(u * Math.PI) - 0.4 * e,
    spin: u * Math.PI * 3 * Math.sign(to.x - from.x || 1),
    alpha: u > 0.85 ? (1 - u) / 0.15 : 1,
  };
}
