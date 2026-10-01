import type { PotionEffect } from '../../../game/data/types';
import type { EffectView } from '../../../game/sim';
import { PAINT_HEX } from '../../../game/systems/paint';
import { mix } from './palette';

/**
 * How potion effects look on a bug or a thing (game design doc, section 9,
 * "Visual"). Pure: the effects as the sim reports them, plus the time, give
 * a size, a tint, transparency, and the extras to draw around the body.
 * `WorldView` applies it. Kept flat and readable, in the game's style.
 */

export type PotionExtra =
  | 'fur'
  | 'wings'
  | 'bubble'
  | 'snowball'
  | 'sticky_feet'
  | 'magnet'
  | 'shiny'
  | 'flies'
  | 'frost'
  | 'crossed'
  | 'hiccups'
  | 'jelly'
  | 'balloon'
  | 'ghost'
  | 'stars_feet';

export type PotionTrail = 'rainbow' | 'smoke' | 'speed' | 'sparkle' | null;

export interface PotionLook {
  /** Drawn size: giant, tiny, snowball (the sim's scale). */
  scale: number;
  /** A multiply tint, or null. */
  tint: number | null;
  /** 1 opaque; a ghost is 0.35. */
  alpha: number;
  /** Upside down: drawn flipped. */
  flipY: boolean;
  /** Puffed round (balloon), 0 to 1. */
  round: number;
  /** Jiggle (jelly), 0 to 1. */
  wobble: number;
  /** A glow around it: color and radius in px, or null. */
  glow: { color: number; radius: number } | null;
  /** What it leaves behind as it moves. */
  trail: PotionTrail;
  /** Extras drawn around the body. */
  extras: ReadonlySet<PotionExtra>;
  /** The color of wings, or a rainbow's current hue. */
  color: number;
  /** Plays slowed down (slow-mo) or sped up (speedy): multiplies its animation clock. */
  pace: number;
  /** Musical notes float off it (opera, squeaky). */
  notes: boolean;
}

/** The six colors of a rainbow trail, in order. */
export const RAINBOW: readonly number[] = [0xe8453c, 0xff8c2e, 0xffd23f, 0x5cc85a, 0x4d7cff, 0x9b5de5];

/** A rainbow cycles through its hues every 3 s. */
export function rainbowAt(time: number): number {
  const t = (((time / 3) % 1) + 1) % 1;
  const i = Math.floor(t * RAINBOW.length);
  const k = t * RAINBOW.length - i;
  return mix(RAINBOW[i]!, RAINBOW[(i + 1) % RAINBOW.length]!, k);
}

const PLAIN: PotionLook = {
  scale: 1,
  tint: null,
  alpha: 1,
  flipY: false,
  round: 0,
  wobble: 0,
  glow: null,
  trail: null,
  extras: new Set(),
  color: 0xffffff,
  pace: 1,
  notes: false,
};

/** The look for a set of effects. `scale` is the sim's (it owns the size); `time` is in seconds. */
export function potionLook(effects: readonly EffectView[] | undefined, scale = 1, time = 0): PotionLook {
  if (!effects || effects.length === 0) return scale === 1 ? PLAIN : { ...PLAIN, scale };
  const extras = new Set<PotionExtra>();
  const out: PotionLook = { ...PLAIN, scale, extras, glow: null };
  const tints: number[] = [];
  for (const fx of effects) {
    const e: PotionEffect = fx.effect;
    switch (e) {
      case 'giant':
      case 'tiny':
        break;
      case 'floaty':
        out.trail = out.trail ?? 'sparkle';
        break;
      case 'balloon':
        out.round = fx.zipping ? 0.4 : 1;
        extras.add('balloon');
        break;
      case 'glow':
        out.glow = { color: 0xfff27a, radius: 220 };
        break;
      case 'rainbow':
        out.color = rainbowAt(time);
        tints.push(mix(out.color, 0xffffff, 0.35));
        out.trail = 'rainbow';
        break;
      case 'sticky_feet':
        extras.add('sticky_feet');
        break;
      case 'frosty':
        tints.push(0xc8ecff);
        extras.add('frost');
        break;
      case 'heavy':
        tints.push(0x9a98b0);
        break;
      case 'speedy':
        out.trail = 'speed';
        out.pace *= 1.8;
        break;
      case 'slowmo':
        out.pace *= 0.35;
        break;
      case 'opera':
      case 'squeaky':
        out.notes = true;
        break;
      case 'upside_down':
        out.flipY = true;
        extras.add('stars_feet');
        break;
      case 'copycat':
        extras.add('shiny');
        break;
      case 'hairy':
        extras.add('fur');
        break;
      case 'magnet':
        extras.add('magnet');
        break;
      case 'ghost':
        out.alpha = 0.35;
        extras.add('ghost');
        break;
      case 'rocket':
        out.trail = 'smoke';
        break;
      case 'snowball':
        extras.add('snowball');
        break;
      case 'wings':
        extras.add('wings');
        out.color = fx.paint ? (PAINT_HEX[fx.paint] ?? 0xff9ff3) : 0xff9ff3;
        break;
      case 'jelly':
        out.wobble = 1;
        out.alpha = Math.min(out.alpha, 0.8);
        tints.push(0xbff5dc);
        extras.add('jelly');
        break;
      case 'bubbled':
        extras.add('bubble');
        break;
      case 'sludge':
        tints.push(0x9ccc4a);
        extras.add('flies');
        if (fx.look === 'crossed') extras.add('crossed');
        if (fx.look === 'hiccups') extras.add('hiccups');
        if (fx.look === 'fuzzy') extras.add('fur');
        break;
      default:
        break;
    }
  }
  if (tints.length > 0) out.tint = tints.reduce((a, b) => mix(a, b, 0.5));
  return out;
}

/** The size a potion is easing to: a stretchy overshoot, like a "bwoomp" (spring step, pure). */
export function easeScale(
  s: { value: number; v: number },
  target: number,
  dt: number,
): { value: number; v: number } {
  const k = 90;
  const c = 9;
  const v = s.v + ((target - s.value) * k - s.v * c) * dt;
  return { value: s.value + v * dt, v };
}
