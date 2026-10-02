import { Container } from 'pixi.js';
import type { EntityView, Sim } from '../../../../game/sim';
import type { HintLook } from '../hints';
import type { Particles } from '../particles';
import type { SkyLook, WeatherMix } from '../skyLook';

/** Draw an additive light (a soft glow sprite) this frame: world px, radius, color, alpha, stretch. */
export type LightFn = (
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
  sx?: number,
  sy?: number,
) => void;

/** Ambient sounds an area makes (played through `Sfx.ambient`, so they never fill the log). */
export type AreaSound =
  | 'bee_hum'
  | 'birdsong'
  | 'creak'
  | 'drip'
  | 'board_patter'
  | 'bubble_blorp'
  | 'steam_hiss'
  | 'arcade_blip'
  | 'leaf_rustle'
  | 'scratch'
  | 'tulip_hum'
  // M10: the depths (marching feet, snoring rows) and the hollow's little clock.
  | 'ant_march'
  | 'ant_snore'
  | 'hollow_tick';

/** What a live area view knows each frame. */
export interface AreaFrame {
  sim: Sim;
  dt: number;
  time: number;
  /** The view's left and right edges, in world pixels. */
  left: number;
  right: number;
  look: SkyLook;
  weather: WeatherMix;
  views: readonly EntityView[];
  /** The hand over the world, in world pixels, or null. */
  hand: { x: number; y: number } | null;
  particles: Particles;
  sound: (name: AreaSound, strength: number) => void;
  /**
   * A fixture the hand is working (M8): pulling the bench's lever down
   * (`amount` 0 to 1), or stirring the cauldron (`angle` of the ladle).
   */
  drag?: { kind: 'lever' | 'stir'; amount: number; angle: number } | null;
  /** Affordance wobbles and glints (`render/hints.ts`): things the hand rests near or hovers. */
  hints?: HintLook;
  /** Reduce motion is on. */
  reduced?: boolean;
  /** The music (M9): the sequencer's playhead column and how loud it plays here, and the beat. */
  music?: AreaMusic | null;
}

export interface AreaMusic {
  /** The sequencer's playhead column, 0 to 7. */
  seqColumn: number;
  /** The sequencer's volume where the camera is (0 when silent). */
  seqVolume: number;
  /** Beats on the music clock, for bobbing on the beat. */
  beat: number;
}

/**
 * A live part of an area: drawn every frame while it is on screen.
 * `back` sits behind entities, `front` in front of them; both are graded
 * with the time of day. `lights` adds glows (lamps, neon, steam warmth).
 */
export abstract class AreaLive {
  readonly back = new Container();
  readonly front = new Container();
  /** Additive light shapes (stage light cones, the light shaft), outside the time-of-day grading. */
  readonly glow = new Container();

  constructor(
    /** The world-pixel span this view draws in, to skip it when off screen. */
    readonly x0: number,
    readonly x1: number,
  ) {}

  /** Is any of it on screen (with a margin)? */
  shows(f: AreaFrame): boolean {
    return this.x1 > f.left - 300 && this.x0 < f.right + 300;
  }

  /** Called every frame, on screen or not (timers keep running). */
  abstract update(f: AreaFrame): void;

  /** Add this frame's lights. */
  lights(_f: AreaFrame, _light: LightFn): void {}

  /** Subscribe to sim events; returns the unsubscribers. */
  listen(_sim: Sim, _particles: Particles): Array<() => void> {
    return [];
  }
}
