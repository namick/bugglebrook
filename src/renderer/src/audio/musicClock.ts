// The music clock (game design doc section 10, brief section 7.11): the
// playing track's tempo, key, and beat grid on the audio clock. Music toys
// and the sequencer quantize to it and pick their notes from its scale. Pure.

import type { MusicKey } from '../../../shared/music';
import { pentatonic, pitchClass } from '../../../shared/music';

export interface ClockTrack {
  bpm: number;
  beatsPerBar: number;
  key: MusicKey;
}

/** Notes per beat on the player's grid: 16ths. */
export const STEPS_PER_BEAT = 4;

/** A small allowance so a time right on a grid line counts as on it. */
const EPS = 1e-6;

export class MusicClock {
  bpm = 96;
  beatsPerBar = 4;
  key: MusicKey = { tonic: 'C', mode: 'major' };
  scale: number[] = pentatonic('major');
  /** Audio time (seconds) of beat `beat0`. */
  private t0 = 0;
  private beat0 = 0;

  get period(): number {
    return 60 / this.bpm;
  }

  /**
   * Follow a track whose bar line falls at `at` (audio seconds). Beat
   * numbers stay continuous: the new grid counts on from the bar the old
   * one had reached, so bar 1 of the track is a bar line of the clock.
   */
  follow(track: ClockTrack, at: number): void {
    const reached = Math.round(this.beatAt(at) / this.beatsPerBar);
    this.bpm = track.bpm;
    this.beatsPerBar = track.beatsPerBar;
    this.setKey(track.key);
    this.t0 = at;
    this.beat0 = reached * track.beatsPerBar;
  }

  setKey(key: MusicKey): void {
    this.key = { ...key };
    this.scale = pentatonic(key.mode);
  }

  /** Beats since the clock started (fractional) at audio time `t`. */
  beatAt(t: number): number {
    return this.beat0 + (t - this.t0) / this.period;
  }

  timeOfBeat(beat: number): number {
    return this.t0 + (beat - this.beat0) * this.period;
  }

  /** Where in the bar `t` falls, 0 to beatsPerBar. */
  beatInBar(t: number): number {
    const b = this.beatAt(t);
    return ((b % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
  }

  /** The next grid line at or after `t`, `perBeat` lines a beat (4 is 16ths). */
  next(t: number, perBeat = STEPS_PER_BEAT): { time: number; step: number } {
    const step = Math.ceil(this.beatAt(t) * perBeat - EPS);
    return { time: this.timeOfBeat(step / perBeat), step };
  }

  /** The next bar line at or after `t`. */
  nextBar(t: number): number {
    const bar = Math.ceil(this.beatAt(t) / this.beatsPerBar - EPS);
    return this.timeOfBeat(bar * this.beatsPerBar);
  }

  /** The MIDI note of scale degree `degree` (any integer: 5 is an octave up) above the tonic in `octave` (4 is middle C's). */
  midi(degree: number, octave = 4): number {
    return degreeMidi(this.key, degree, octave);
  }
}

/** The MIDI note of a pentatonic degree in a key; degree 0 is the tonic in `octave`. */
export function degreeMidi(key: MusicKey, degree: number, octave = 4): number {
  const scale = pentatonic(key.mode);
  const d = Math.round(degree);
  const oct = Math.floor(d / scale.length);
  const step = d - oct * scale.length;
  return 12 * (octave + 1) + pitchClass(key.tonic) + 12 * oct + scale[step]!;
}

export const midiFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Is a MIDI note in the key's pentatonic scale? */
export function inScale(key: MusicKey, midi: number): boolean {
  const pc = (((midi - pitchClass(key.tonic)) % 12) + 12) % 12;
  return pentatonic(key.mode).includes(pc);
}
