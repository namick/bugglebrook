// The layer rules of docs/05-music-brief.md section 7.12: from a snapshot of
// what is going on, how loud each of a track's four layers should be, the
// track's own gain, and the music bus's low-pass. Pure.

import type { MusicLayer } from '../../../shared/music';
import { MUSIC_LAYERS } from '../../../shared/music';
import type { RulesPhase } from './musicManifest';

export type LayerGains = Record<MusicLayer, number>;

export interface MixState {
  rules: RulesPhase;
  /** The first game hour of dusk or dawn, on the outgoing track. */
  thinning: boolean;
  /** Seconds since the player last did anything. */
  idle: number;
  /** Five or more awake bugs on screen doing something, or the player dragged or flung in the last 4 bars. */
  busy: boolean;
  /** A player note or the sequencer played in this area recently (see `MusicEngine`). */
  playerMusic: boolean;
  /** The sequencer's drum row has active steps and is playing here. */
  seqDrums: boolean;
  /** A bug plays an instrument in view. */
  bugPlaying: boolean;
  raining: boolean;
  /** The porch, the ant hill, and the gnome hollow keep the rain off the music. */
  sheltered: boolean;
  /** Ant Hill Depths at night: the ants sleep. */
  antHillNight: boolean;
  /** The pause board is open. */
  paused: boolean;
  /** The unlock stinger is playing over the music. */
  stinger: boolean;
}

export const QUIET_MIX: MixState = {
  rules: 'day',
  thinning: false,
  idle: 0,
  busy: false,
  playerMusic: false,
  seqDrums: false,
  bugPlaying: false,
  raining: false,
  sheltered: false,
  antHillNight: false,
  paused: false,
  stinger: false,
};

export interface MixTargets {
  gains: LayerGains;
  /** The track's gain, linear. */
  track: number;
  /** The music bus low-pass in Hz, or null for none. */
  lowpass: number | null;
}

/** Idle thresholds, seconds. */
export const IDLE_SOFT = 45;
export const IDLE_DEEP = 120;

const db = (d: number): number => 10 ** (d / 20);

type Row = readonly [number, number, number, number];

const mul = (g: LayerGains, row: Row): void => {
  MUSIC_LAYERS.forEach((l, i) => (g[l] *= row[i]!));
};

/** Section 7.12, row by row. Factors multiply, then clamp to 0..1. */
export function mixTargets(s: MixState): MixTargets {
  const g: LayerGains = { drums: 1, bass: 1, harmony: 1, lead: 1 };
  // Base. Busy replaces the base lead factor with 1.0.
  const base: Row = s.rules === 'day' ? [1, 1, 1, 0.85] : [0.6, 0.9, 1, 0.7];
  mul(g, s.busy ? [base[0], base[1], base[2], 1] : base);
  if (s.thinning) mul(g, [0.3, 1, 1, 0.6]);
  // Idle rows, which busy cancels; 120 s replaces 45 s.
  if (!s.busy) {
    if (s.idle >= IDLE_DEEP) mul(g, [0.6, 1, 1, 0.4]);
    else if (s.idle >= IDLE_SOFT) mul(g, [1, 1, 1, 0.6]);
  }
  if (s.playerMusic) mul(g, [1, 1, 0.85, 0.25]);
  if (s.seqDrums) mul(g, [0.5, 1, 1, 1]);
  if (s.bugPlaying) mul(g, [1, 1, 1, 0.5]);
  if (s.raining) mul(g, s.sheltered ? [1, 1, 1, 0.8] : [0, 1, 1, 0.6]);
  if (s.antHillNight) mul(g, [0.3, 1, 1, 0.6]);
  for (const l of MUSIC_LAYERS) g[l] = Math.max(0, Math.min(1, g[l]));
  let track = 1;
  let lowpass: number | null = s.raining && !s.sheltered ? 2000 : null;
  if (s.paused) {
    track *= db(-6);
    lowpass = 900;
  }
  if (s.stinger) track *= db(-9);
  return { gains: g, track, lowpass };
}

/**
 * A track with no stems plays one `full` layer: it follows the rules
 * through its track gain, at the mean of the four factors.
 */
export function fullGain(g: LayerGains): number {
  return (g.drums + g.bass + g.harmony + g.lead) / 4;
}
