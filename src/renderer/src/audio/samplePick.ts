// Variation for sample playback (docs/08-sound-brief.md, part 6.4): a shuffle
// bag per folder, random pitch and gain, intensity as loudness and darkness,
// and pan from the screen position. Pure, with an injected `random`.

import { DARK_HZ, GAIN_JITTER_DB, OPEN_HZ, QUIET_DB } from './sfxCatalog';

/**
 * Deals take indices so that every take plays before any repeats, and the
 * same take never plays twice in a row (unless there is only one).
 */
export class ShuffleBag {
  private bag: number[] = [];
  private last = -1;

  constructor(
    private readonly size: number,
    private readonly random: () => number,
  ) {}

  next(): number {
    if (this.size <= 1) return 0;
    if (this.bag.length === 0) {
      const fresh = Array.from({ length: this.size }, (_, i) => i);
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j]!, fresh[i]!];
      }
      // Dealt from the end: keep the last take played off the top.
      if (fresh[fresh.length - 1] === this.last)
        [fresh[0], fresh[fresh.length - 1]] = [fresh[fresh.length - 1]!, fresh[0]!];
      this.bag = fresh;
    }
    this.last = this.bag.pop()!;
    return this.last;
  }
}

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const semisToRate = (semis: number): number => 2 ** (semis / 12);

export interface Variation {
  /** Playback rate (pitch). */
  rate: number;
  /** Gain, dB. */
  gainDb: number;
  /** Low-pass cutoff, Hz, or null for open. */
  lowpass: number | null;
}

/**
 * Pitch within `pitch` semitones either way (plus a fixed shift), gain
 * within 1.5 dB, and intensity (0 to 1) as -18 dB to full and a low-pass
 * from 1.5 kHz to open.
 */
export function vary(random: () => number, pitch: number, intensity: number, semis = 0): Variation {
  const i = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 1));
  const shift = semis + (random() * 2 - 1) * pitch;
  const jitter = (random() * 2 - 1) * GAIN_JITTER_DB;
  return {
    rate: semisToRate(shift),
    gainDb: jitter + QUIET_DB * (1 - i),
    lowpass: i >= 1 ? null : DARK_HZ * (OPEN_HZ / DARK_HZ) ** i,
  };
}

/** How far off-screen a sound may be and still play (screen widths from the middle). */
export const HEAR_WIDTHS = 0.6;
/** Off the edge but within reach: this much quieter, dB. */
export const EDGE_DB = -9;
/** On screen, pan reaches this far. */
export const PAN_SPREAD = 0.6;

/**
 * Stereo pan for a sound at `frac` of the screen's width (0 left edge, 1
 * right edge). On screen it pans up to 0.6; just off the edge it plays
 * fully panned and 9 dB down; further away it is skipped (null).
 */
export function panFor(frac: number): { pan: number; gainDb: number } | null {
  const fromMiddle = frac - 0.5;
  if (Math.abs(fromMiddle) > HEAR_WIDTHS) return null;
  if (Math.abs(fromMiddle) > 0.5) return { pan: Math.sign(fromMiddle), gainDb: EDGE_DB };
  return { pan: Math.max(-1, Math.min(1, frac * 2 - 1)) * PAN_SPREAD, gainDb: 0 };
}
