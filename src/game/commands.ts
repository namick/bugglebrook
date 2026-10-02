import type { NeedId } from './data/types';
import type { WeatherId } from './systems/sky';

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
  /**
   * Debug and tests: set the weather. `weather` picks a state; without it,
   * rain means `weather_rain`, wind means `weather_wind`, and neither clear.
   * `wind` is in m/s (+ blows right). It runs until the next natural change.
   */
  | { type: 'set_weather'; wind: number; rain: boolean; weather?: WeatherId }
  /** Debug and tests: jump to `hour` (0 to 24, fractions allowed) on today's clock. */
  | { type: 'set_time'; hour: number }
  /** The player turned the sundial's rim forward: the world fast-forwards by this many game minutes. */
  | { type: 'dial_turn'; minutes: number }
  /** The player let go of the sundial: it snaps to a nearby phase start and finishes its sweep. */
  | { type: 'dial_release' }
  /**
   * The player let go of what they hold over pocket slot `slot` (0 to 5):
   * it goes in the pocket. A slot that cannot take it swaps: what was there
   * pops out at the hand.
   */
  | { type: 'pocket_put'; slot: number }
  /** The player pressed on a pocket slot: its top thing comes out into the hand at (x, y). */
  | { type: 'pocket_take'; slot: number; x: number; y: number }
  /**
   * A new world's first scene (game design doc, section 17): Dot asleep on
   * the bottle cap, a red berry beside her, a little peckish.
   */
  | { type: 'stage_intro' }
  /** The cursor came close to a sleeping bug in the first scene: it wakes gently and looks up. */
  | { type: 'wake'; id: number }
  /**
   * The first scene's nudge: the player has not grabbed a bug yet, so this
   * one walks toward the hand at world x and asks to be flung ("again!").
   */
  | { type: 'beckon'; id: number; x: number }
  /**
   * Where the hand is over the world (null when it left the window). The
   * renderer sends it as the pointer moves. Twig freezes when it is near,
   * and the porch spider watches it.
   */
  | { type: 'hand'; x: number | null; y: number | null }
  /** Debug and tests: open a locked area as if its barrier had been solved. */
  | { type: 'unlock'; area: string }
  /**
   * Debug, tests, and shots: find a secret as if its trigger had fired, its
   * prerequisites first. It does nothing the secret's trigger does besides
   * logging it (no items, no doors).
   */
  | { type: 'find_secret'; id: string }
  /** The player pulled the Tinker Bench's clothespin lever down (M8). */
  | { type: 'pull_lever' }
  /** The player stirred the cauldron with the ladle, by this many radians around its middle. */
  | { type: 'stir'; radians: number }
  /** Debug and tests: put a potion's effect on a bug or thing, as if it drank it. */
  | { type: 'give_potion'; id: number; potion: string }
  /** Debug and shots: take a thing out of the world. */
  | { type: 'despawn'; id: number }
  /**
   * The camera came out (photo mode, game design doc, section 14) or went
   * away. Open, bugs in view react for 0.8 s, then the world holds still
   * until it closes.
   */
  | { type: 'photo_mode'; open: boolean }
  /** The shutter fired: what the photo was of, for the event log and the journal. */
  | { type: 'photo_taken'; frame: string; filter: string; stickers: number; zoom: number; bugs: string[] }
  /** The photo's file was written (or not), after `photo_taken`. */
  | { type: 'photo_saved'; ok: boolean }
  /**
   * The player's hand on the mushroom sequencer (M9): a press (`start`) on a
   * cap or a control, or a drag across caps that paints them like the first.
   */
  | { type: 'seq_touch'; x: number; y: number; start: boolean }
  /** The player looked at these journal entries (M10): they lose their "new!" badge. */
  | { type: 'journal_seen'; keys: string[] }
  /** The player noticed a clue the renderer shows on hover (M10, `NOTICES` in `systems/journal.ts`). */
  | { type: 'notice'; what: string };

export type CommandType = Command['type'];
