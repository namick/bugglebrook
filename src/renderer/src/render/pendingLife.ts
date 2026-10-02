/**
 * Signs of life from bugs that wait to be found (R04, R34): render-only
 * idle motion read from the brain's `pending` state. Moose, stuck on his
 * back, flails in bursts and then rests his legs; Barty, aloof, taps a foot,
 * polishes a feeler, and glances about; Twig, disguised as a twig, gives
 * himself away every few seconds with a feeler twitch or a quick blink.
 * Pure functions of the time and a per-bug phase.
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Cheap deterministic hash to [0, 1). */
function hash(a: number, b: number): number {
  const s = Math.sin(a * 91.7 + b * 47.3 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

/** A bump from 0 up to 1 and back over `u` in [0, 1]. */
const bump = (u: number): number => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI));

/** Moose's legs: how fast they wave (a multiplier), how far (0 to 1), and how much he rocks (radians). */
export interface Flail {
  speed: number;
  amp: number;
  rock: number;
  /** Seconds into the current burst, or -1 while resting. */
  burst: number;
}

/** Bursts of frantic flailing every 3 to 6 s, each about 1.4 s; tired little waves in between. */
export function mooseFlail(time: number, phase: number): Flail {
  const period = 4.5;
  const n = Math.floor(time / period);
  const start = n * period + hash(n, phase) * 2;
  const into = time - start;
  const len = 1.4;
  if (into >= 0 && into < len) {
    const k = bump(into / len);
    return { speed: 1 + 1.4 * k, amp: 0.45 + 0.55 * k, rock: Math.sin(time * 9) * 0.1 * k, burst: into };
  }
  // Resting: legs drift slowly, a little sigh of a rock.
  return { speed: 0.35, amp: 0.4, rock: Math.sin(time * 1.3) * 0.02, burst: -1 };
}

/** Barty fiddling while he waits: a foot tap, a feeler polish, a glance (-1 left to 1 right). */
export interface Fiddle {
  tap: number;
  preen: number;
  glance: number;
}

/** One fidget every 2.5 s or so, picked by a hash: tap tap tap, polish a feeler, or look about. */
export function bartyFiddle(time: number, phase: number): Fiddle {
  const period = 2.6;
  const n = Math.floor(time / period);
  const u = time / period - n;
  const pick = hash(n, phase + 3);
  const none: Fiddle = { tap: 0, preen: 0, glance: 0 };
  if (u > 0.7) return none;
  const k = u / 0.7;
  if (pick < 0.4) return { ...none, tap: Math.abs(Math.sin(k * Math.PI * 3)) * bump(k) };
  if (pick < 0.7) return { ...none, preen: bump(k) };
  if (pick < 0.92) return { ...none, glance: (hash(n, phase + 7) < 0.5 ? -1 : 1) * clamp01(bump(k) * 1.6) };
  return none;
}

/** Twig's tells: a feeler lifting (0 to 1), and his eyes peeking open (0 shut to 1 open). */
export interface Tell {
  twitch: number;
  eyes: number;
}

/** Seconds between Twig's tells, about. */
export const TELL_EVERY = 4.5;

/**
 * Every 3.5 to 5.5 s, Twig twitches a feeler (a quick flick, twice); every
 * third tell he opens his eyes for a moment instead and blinks. Subtle, but
 * a player who watches the twig will catch it.
 */
export function twigTell(time: number, phase: number): Tell {
  const n = Math.floor(time / TELL_EVERY);
  const at = n * TELL_EVERY + hash(n, phase) * 2;
  const into = time - at;
  if (into < 0) return { twitch: 0, eyes: 0 };
  if (n % 3 === 2) {
    // A peek: open, a blink in the middle, open, shut.
    if (into > 0.9) return { twitch: 0, eyes: 0 };
    const open = clamp01(Math.min(into / 0.08, (0.9 - into) / 0.08));
    const blink = into > 0.4 && into < 0.5 ? 0 : 1;
    return { twitch: 0, eyes: open * blink };
  }
  // A twitch: two quick flicks in half a second.
  if (into > 0.5) return { twitch: 0, eyes: 0 };
  return { twitch: Math.abs(Math.sin((into / 0.5) * Math.PI * 2)), eyes: 0 };
}
