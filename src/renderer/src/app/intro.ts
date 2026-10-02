/**
 * The first two minutes of a new world, with no text (game design doc,
 * section 17). The scene invites; nothing is locked or scripted:
 *
 * - 0:00 fade in while the camera slides from the pond side to the stump
 *   (3 s). Dot is asleep on the bottle cap with a berry beside her.
 * - When the cursor comes near Dot, she wakes up and looks at it.
 * - About 0:40, if the player has not grabbed a bug yet, Dot walks over to
 *   the hand and asks to be flung (a spring in her speech bubble).
 * - If the player has not panned after 60 s, the camera drifts toward the
 *   pond and back once, as if it noticed Skeet.
 *
 * Pure: `Game` feeds it what happened and carries out what it returns.
 */
export const INTRO = {
  fadeSeconds: 1.2,
  slideSeconds: 3,
  /** The camera starts this far left of its resting spot, toward the pond. */
  slideFrom: 9,
  /** The cursor wakes Dot within this many meters. */
  wakeRange: 3,
  beckonAt: 40,
  driftAt: 60,
  /** How far the drift goes, in meters (200 px). */
  drift: 2,
  driftSeconds: 1.2,
  endAt: 120,
  /**
   * The scene opens close on the garden floor and pulls back as the camera
   * arrives, so the first thing seen is the bugs, not the sky (P-15).
   */
  zoom: 1.6,
  /** The pull-back starts this long in and ends with the slide. */
  zoomOutFrom: 1.2,
} as const;

/** How far the first scene is zoomed in `t` seconds after it starts: 1 once the camera has arrived. Pure. */
export function introZoom(t: number): number {
  if (t >= INTRO.slideSeconds) return 1;
  if (t <= INTRO.zoomOutFrom) return INTRO.zoom;
  const u = (t - INTRO.zoomOutFrom) / (INTRO.slideSeconds - INTRO.zoomOutFrom);
  const ease = u * u * (3 - 2 * u);
  return INTRO.zoom + (1 - INTRO.zoom) * ease;
}

export type IntroAction =
  | { type: 'wake'; id: number }
  | { type: 'beckon'; id: number; x: number }
  | { type: 'drift'; x: number; seconds: number }
  | { type: 'done' };

export interface IntroInput {
  /** The cursor in world meters, or null when it is off the window. */
  cursor: { x: number; y: number } | null;
  /** Dot, if she is in the world: where she is and whether she sleeps. */
  dot: { id: number; x: number; y: number; asleep: boolean } | null;
  /** The player has grabbed a bug at least once. */
  grabbedBug: boolean;
  /** The player has panned or scrolled the camera. */
  panned: boolean;
  /** The camera's left edge now. */
  cameraX: number;
}

export class Intro {
  t = 0;
  done = false;
  private woke = false;
  private beckoned = false;
  private drifted = false;
  private driftBack: number | null = null;

  /** 0 to 1: how dark the fade-in cover is now. */
  get cover(): number {
    return Math.max(0, 1 - this.t / INTRO.fadeSeconds);
  }

  update(dt: number, input: IntroInput): IntroAction[] {
    if (this.done) return [];
    this.t += dt;
    const out: IntroAction[] = [];
    const { dot, cursor } = input;
    // Control is live once the camera has arrived.
    const live = this.t >= INTRO.slideSeconds;
    if (
      live &&
      !this.woke &&
      dot?.asleep &&
      cursor &&
      Math.hypot(cursor.x - dot.x, cursor.y - dot.y) < INTRO.wakeRange
    ) {
      this.woke = true;
      out.push({ type: 'wake', id: dot.id });
    }
    // Woken some other way (a poke, a grab): nothing left to do.
    if (live && dot && !dot.asleep) this.woke = true;
    if (!this.beckoned && this.t >= INTRO.beckonAt) {
      this.beckoned = true;
      if (!input.grabbedBug && dot && !dot.asleep)
        out.push({ type: 'beckon', id: dot.id, x: cursor?.x ?? input.cameraX + 9.6 });
    }
    if (!this.drifted && this.t >= INTRO.driftAt) {
      this.drifted = true;
      if (!input.panned) {
        this.driftBack = input.cameraX;
        out.push({ type: 'drift', x: input.cameraX - INTRO.drift, seconds: INTRO.driftSeconds });
      }
    }
    if (this.driftBack !== null && this.t >= INTRO.driftAt + INTRO.driftSeconds + 0.6) {
      if (!input.panned) out.push({ type: 'drift', x: this.driftBack, seconds: INTRO.driftSeconds });
      this.driftBack = null;
    }
    if (this.t >= INTRO.endAt) {
      this.done = true;
      out.push({ type: 'done' });
    }
    return out;
  }
}
