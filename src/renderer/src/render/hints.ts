/**
 * Affordance hints (game design doc, section 2, "Hover affordances"): things
 * the player can work but has not yet (the barriers, the sundial, the bench's
 * lever, the cauldron's ladle, the pocket's tab) give a little wobble and a
 * glint when the hand rests near them, and whenever it hovers them. Pure: the
 * views ask it how much to wobble each frame.
 */

export interface HintPoint {
  x: number;
  y: number;
}

/** Things that hint. Barriers carry their fixture kind. */
export type HintKey =
  | 'sundial'
  | 'lever'
  | 'ladle'
  | 'pocket'
  | 'barrier_sunflower'
  | 'barrier_lattice'
  | 'barrier_can_tunnel'
  | 'barrier_bucket_lift'
  // Playtest F1 and F2: the trash can's lid and the tidy whistle.
  | 'trash'
  | 'whistle';

export interface HintTarget {
  key: HintKey;
  /** Where it is, in the same units as the hand (world meters, or view pixels for the pocket). */
  at: HintPoint;
  /** How close the hand must rest to count as near. */
  reach: number;
  /** The player has worked it already: hovering still wobbles it, resting near does not. */
  done: boolean;
}

export const HINT = {
  /** The hand must rest near a thing this long before it wobbles. */
  restSeconds: 1.2,
  /** "Resting" is moving slower than this, in hand units per second (scaled by reach). */
  restSpeed: 1.5,
  /** One wobble lasts this long. */
  wobbleSeconds: 0.75,
  /** And the next one waits at least this long. */
  gapSeconds: 3.2,
  /** Wobbles per wobble: back and forth this many times. */
  shakes: 2.5,
} as const;

interface TargetState {
  rest: number;
  /** Seconds into the current wobble, or -1. */
  phase: number;
  /** Seconds since the last wobble began. */
  since: number;
  hovered: boolean;
}

/** What a view needs to know about one hint this frame. */
export interface HintLook {
  /** A signed wobble, -1 to 1: multiply by the thing's own swing. */
  wobble(key: HintKey): number;
  /** How bright its glint is, 0 to 1 (a wobble's envelope, or 1 while hovered). */
  glint(key: HintKey): number;
}

/** A hint source that never hints, for menus and tests. */
export const NO_HINTS: HintLook = { wobble: () => 0, glint: () => 0 };

/** The envelope of a wobble `t` seconds in: up and down once. */
export function wobbleEnvelope(t: number): number {
  if (t < 0 || t >= HINT.wobbleSeconds) return 0;
  return Math.sin((t / HINT.wobbleSeconds) * Math.PI);
}

export class AffordanceTracker implements HintLook {
  private readonly states = new Map<HintKey, TargetState>();
  /** Wobbles started, by key (for the test hook). */
  readonly started = new Map<HintKey, number>();

  private state(key: HintKey): TargetState {
    let s = this.states.get(key);
    if (!s) {
      s = { rest: 0, phase: -1, since: Infinity, hovered: false };
      this.states.set(key, s);
    }
    return s;
  }

  /**
   * One frame. `hands` maps each target to the hand position in its units
   * (world meters for things in the world, view pixels for the pocket), or
   * null when the hand is away. `speed` is how fast the hand moves in those
   * units per second. `hovered` is the target under the hand right now.
   */
  update(
    dt: number,
    targets: readonly HintTarget[],
    hand: (t: HintTarget) => { at: HintPoint; speed: number } | null,
    hovered: HintKey | null,
  ): void {
    for (const t of targets) {
      const s = this.state(t.key);
      s.since += dt;
      if (s.phase >= 0) {
        s.phase += dt;
        if (s.phase >= HINT.wobbleSeconds) s.phase = -1;
      }
      const h = hand(t);
      const near = !!h && Math.hypot(h.at.x - t.at.x, h.at.y - t.at.y) <= t.reach;
      const still = !!h && h.speed <= HINT.restSpeed * t.reach;
      s.rest = near && still ? s.rest + dt : near ? Math.max(0, s.rest - dt * 2) : 0;
      const hoverNow = hovered === t.key;
      const hoverStart = hoverNow && !s.hovered;
      s.hovered = hoverNow;
      const ready = s.phase < 0 && s.since >= HINT.gapSeconds;
      // Hovering always answers (the design doc's barrier wobble); resting near only teaches what is new.
      if ((hoverStart && s.phase < 0) || (ready && (hoverNow || (!t.done && s.rest >= HINT.restSeconds)))) {
        s.phase = 0;
        s.since = 0;
        this.started.set(t.key, (this.started.get(t.key) ?? 0) + 1);
      }
    }
  }

  wobble(key: HintKey): number {
    const s = this.states.get(key);
    if (!s || s.phase < 0) return 0;
    return wobbleEnvelope(s.phase) * Math.sin((s.phase / HINT.wobbleSeconds) * HINT.shakes * Math.PI * 2);
  }

  glint(key: HintKey): number {
    const s = this.states.get(key);
    if (!s) return 0;
    return Math.max(s.hovered ? 1 : 0, s.phase < 0 ? 0 : wobbleEnvelope(s.phase));
  }

  /** Is this thing hovered right now? */
  hovered(key: HintKey): boolean {
    return this.states.get(key)?.hovered ?? false;
  }
}
