import type { NeedId } from './data/types';

/**
 * Commands are the only way input changes the sim. They are plain data so
 * they can be logged, replayed, and injected by E2E tests.
 * Coordinates are world meters; velocities are m/s.
 */
export type Command =
  | { type: 'grab'; x: number; y: number }
  | { type: 'drag'; x: number; y: number }
  /**
   * Let go of the held thing. `vx`/`vy` is the cursor's recent velocity: the
   * thing leaves at that velocity (a fling) up to MAX_FLING_SPEED. Without
   * it, the thing keeps the velocity the hand gave it.
   */
  | { type: 'release'; vx?: number; vy?: number }
  /** A quick click: lets go of anything held, then pokes what is under the point. */
  | { type: 'poke'; x: number; y: number }
  | { type: 'spawn'; kind: 'bug' | 'item'; defId: string; x: number; y: number }
  /** The player is holding a bug still (hold-poke): tickle it, or stop. */
  | { type: 'tickle'; on: boolean }
  /** The player shook whatever they are holding. */
  | { type: 'shake' }
  /** Debug and tests: set one of a bug's needs. */
  | { type: 'set_need'; id: number; need: NeedId; value: number }
  /**
   * The camera shows world x from `x0` to `x1`. Areas far from the view
   * sleep (no physics). The renderer sends this when the camera moves.
   */
  | { type: 'focus'; x0: number; x1: number }
  /** Debug and tests: turn a tag on (for `seconds`, or its usual time) or off. */
  | { type: 'set_tag'; id: number; tag: string; on: boolean; seconds?: number }
  /** Debug and tests until weather arrives: wind in m/s (+ blows right) and rain. */
  | { type: 'set_weather'; wind: number; rain: boolean };

export type CommandType = Command['type'];
