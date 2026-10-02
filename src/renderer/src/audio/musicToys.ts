// The music toys (game design doc, section 10): instruments the player pokes
// or knocks, bugs playing instruments on their own, the mushroom sequencer,
// the band layer, and the theme. All synthesized, all quantized to the next
// 16th note of the music clock, and every pitched note picked from the
// playing track's pentatonic scale, so nothing clashes with the stems.
// Pure helpers up top; `MusicToys` schedules the notes.

import type { GameEvents } from '../../../game/events';
import { keyName } from '../../../shared/music';
import type { Tone } from './synth';
import type { AudioBackend } from './synth';
import type { MusicClock } from './musicClock';
import { STEPS_PER_BEAT, midiFreq } from './musicClock';

/** How an instrument sounds. */
export type ToyTimbre =
  | 'kazoo'
  | 'harp'
  | 'bass'
  | 'drum'
  | 'maraca'
  | 'castanets'
  | 'flute'
  | 'xylophone'
  | 'tine'
  | 'mushroom'
  | 'choir'
  // M11: Fiddle bowing his own legs.
  | 'fiddle';

export function toyTimbre(defId: string): ToyTimbre {
  if (defId === FIDDLE_LEGS) return 'fiddle';
  if (defId.includes('kazoo')) return 'kazoo';
  if (defId.includes('harp')) return 'harp';
  if (defId.includes('can_bass')) return 'bass';
  if (defId.includes('drum')) return 'drum';
  if (defId.includes('maraca')) return 'maraca';
  if (defId.includes('castanets')) return 'castanets';
  if (defId.includes('flute')) return 'flute';
  if (defId.includes('xylophone')) return 'xylophone';
  return 'tine';
}

/** What Fiddle plays when he plays his own legs (M11): no item, his own timbre. */
export const FIDDLE_LEGS = 'fiddle_legs';

/** How a music bug plays any pitched instrument (section 10): Fiddle walks a melody, Buzzby runs up the scale. */
export type PlayStyle = 'fiddle' | 'buzz' | null;

/** Unpitched timbres: quantized, but no scale note. */
export const UNPITCHED: ReadonlySet<ToyTimbre> = new Set(['drum', 'maraca', 'castanets']);

/** Each pitched timbre's octave for degree 0 (4 is middle C's). */
const OCTAVE: Partial<Record<ToyTimbre, number>> = {
  kazoo: 4,
  harp: 4,
  bass: 2,
  flute: 5,
  xylophone: 5,
  tine: 5,
  mushroom: 5,
  choir: 4,
  fiddle: 5,
};

export function timbreOctave(t: ToyTimbre): number {
  return OCTAVE[t] ?? 4;
}

/**
 * Repeated pokes walk a short motif up and down the scale from the
 * instrument's own degree, so they make a tune rather than one note.
 */
export const MOTIF: readonly number[] = [0, 1, 2, 4, 3, 2, 1, -1];

export function motifDegree(base: number, n: number): number {
  return base + MOTIF[((n % MOTIF.length) + MOTIF.length) % MOTIF.length]!;
}

/**
 * A bug's part on an instrument (section 10, "How bugs play"): for a 16th
 * step (0 is the bar's downbeat), the scale degree to play (relative to the
 * chord root's degree for pitched parts), `hit` for an unpitched hit, or
 * null for a rest. `seed` varies the part from bug to bug.
 */
export function bugPart(
  timbre: ToyTimbre,
  step: number,
  seed: number,
  style: PlayStyle = null,
): { degree: number; velocity: number } | 'hit' | null {
  const s = ((step % 16) + 16) % 16;
  const bar = Math.floor(step / 16);
  const r = hash01(seed, step);
  if (!UNPITCHED.has(timbre) && style === 'fiddle') {
    // Walks up or down the scale by one or two steps on the beats, with a long note to end the bar.
    if (s % 4 !== 0) return null;
    const walk = [0, 1, 3, 2, 4, 3, 1, 2];
    const k = bar * 4 + s / 4;
    const degree = walk[k % walk.length]! * (Math.floor(bar / 2) % 2 === 0 ? 1 : -1);
    return { degree, velocity: s === 12 ? 0.9 : 0.7 };
  }
  if (!UNPITCHED.has(timbre) && style === 'buzz')
    // Ascending runs on the 8ths.
    return s % 2 === 0 ? { degree: ((s / 2) % 5) + (bar % 2) * 2, velocity: 0.7 } : null;
  switch (timbre) {
    case 'drum':
      // Hits on 1 and 3, a fill on 4.
      if (s === 0 || s === 8) return 'hit';
      return s >= 12 && r < 0.6 ? 'hit' : null;
    case 'maraca':
      return s % 2 === 0 ? 'hit' : null;
    case 'castanets':
      // The off-beats.
      return s % 4 === 2 ? 'hit' : null;
    case 'bass':
      // Root on 1, fifth on 3.
      if (s === 0) return { degree: 0, velocity: 1 };
      if (s === 8) return { degree: 3, velocity: 0.8 };
      return null;
    case 'harp':
      // Arpeggiates the chord on the 8ths.
      return s % 2 === 0 ? { degree: [0, 2, 4, 5, 4, 2, 0, 2][s / 2]!, velocity: 0.7 } : null;
    case 'xylophone':
      // Ascending runs on the 8ths.
      return s % 2 === 0 ? { degree: ((s / 2) % 5) + (bar % 2) * 2, velocity: 0.75 } : null;
    case 'flute':
      // Long soft tones, one a bar.
      return s === 0 ? { degree: [2, 4, 1, 0][bar % 4]!, velocity: 0.6 } : null;
    case 'kazoo':
      // Toots on the beats, on scale notes.
      return s % 4 === 0 && r < 0.65
        ? { degree: Math.floor(hash01(seed + 7, step) * 6), velocity: 0.75 }
        : null;
    default:
      return s % 4 === 0 && r < 0.5
        ? { degree: Math.floor(hash01(seed + 3, step) * 5), velocity: 0.6 }
        : null;
  }
}

/** A small deterministic hash to 0..1, for bug parts. */
export function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A note or hit in an instrument's own voice. `freq` is null for unpitched timbres. */
export function toyTones(timbre: ToyTimbre, freq: number | null, velocity = 1, length = 0.3): Tone[] {
  const v = velocity;
  const f = freq ?? 440;
  switch (timbre) {
    case 'kazoo':
      return [
        {
          freq: f,
          dur: 0.3,
          wave: 'square',
          gain: 0.08 * v,
          attack: 0.03,
          formants: [700, 1500],
          vibrato: { rate: 7, depth: f * 0.02 },
        },
        { freq: f * 2, dur: 0.28, wave: 'sawtooth', gain: 0.025 * v, attack: 0.03 },
      ];
    case 'harp':
      return [
        { freq: f, dur: 0.7, wave: 'triangle', gain: 0.2 * v, attack: 0.004 },
        { freq: f * 2, dur: 0.25, wave: 'sine', gain: 0.06 * v, attack: 0.004 },
      ];
    case 'bass':
      return [
        { freq: f, dur: 0.5, wave: 'sine', gain: 0.38 * v, attack: 0.01 },
        { freq: f * 2, dur: 0.2, wave: 'triangle', gain: 0.1 * v, attack: 0.01 },
      ];
    case 'flute':
      return [
        {
          freq: f,
          dur: Math.max(0.4, length),
          wave: 'sine',
          gain: 0.16 * v,
          attack: 0.08,
          vibrato: { rate: 5, depth: f * 0.008 },
        },
        { freq: 2400, to: 1800, dur: 0.12, wave: 'noise', q: 2, gain: 0.04 * v, attack: 0.02 },
      ];
    case 'xylophone':
      return [
        { freq: f, dur: 0.35, wave: 'sine', gain: 0.22 * v, attack: 0.002 },
        { freq: f * 4, dur: 0.06, wave: 'sine', gain: 0.06 * v, attack: 0.002 },
      ];
    case 'mushroom':
      // A soft round pluck, like a cap going boop.
      return [
        { freq: f, dur: 0.28, wave: 'triangle', gain: 0.17 * v, attack: 0.004 },
        { freq: f * 1.5, to: f, dur: 0.05, wave: 'sine', gain: 0.05 * v, attack: 0.002 },
      ];
    case 'fiddle':
      // A bowed note: a slow attack, a formant body, and a singing vibrato.
      return [
        {
          freq: f,
          dur: Math.max(0.35, length),
          wave: 'sawtooth',
          gain: 0.07 * v,
          attack: 0.07,
          formants: [900, 2200],
          vibrato: { rate: 5.5, depth: f * 0.01 },
        },
        { freq: f * 2, dur: Math.max(0.3, length * 0.8), wave: 'triangle', gain: 0.03 * v, attack: 0.09 },
      ];
    case 'choir':
      return [
        {
          freq: f,
          dur: Math.max(0.3, length),
          wave: 'sawtooth',
          gain: 0.05 * v,
          attack: 0.05,
          formants: [650, 1100],
          vibrato: { rate: 5.5, depth: f * 0.012 },
        },
      ];
    case 'drum':
      return [
        { freq: 160, to: 70, dur: 0.18, wave: 'sine', gain: 0.4 * v, attack: 0.003 },
        { freq: 1800, to: 600, dur: 0.06, wave: 'noise', q: 1.5, gain: 0.18 * v },
      ];
    case 'maraca':
      return [{ freq: 6500, to: 5200, dur: 0.07, wave: 'noise', q: 2.5, gain: 0.12 * v, attack: 0.004 }];
    case 'castanets':
      return [
        { freq: 2600, to: 2200, dur: 0.035, wave: 'noise', q: 6, gain: 0.2 * v, attack: 0.001 },
        { freq: 1300, dur: 0.03, wave: 'triangle', gain: 0.08 * v, attack: 0.001 },
      ];
    default:
      return [
        { freq: f, dur: 0.45, wave: 'sine', gain: 0.2 * v, attack: 0.003 },
        { freq: f * 3.01, dur: 0.12, wave: 'sine', gain: 0.05 * v, attack: 0.003 },
      ];
  }
}

/** A kick and a snare for the sequencer's drum row. */
export function seqDrum(kick: boolean, velocity = 1): Tone[] {
  return kick
    ? [{ freq: 120, to: 45, dur: 0.22, wave: 'sine', gain: 0.45 * velocity, attack: 0.002 }]
    : [
        { freq: 2200, to: 1200, dur: 0.12, wave: 'noise', q: 0.9, gain: 0.2 * velocity, attack: 0.002 },
        { freq: 220, to: 160, dur: 0.07, wave: 'triangle', gain: 0.12 * velocity, attack: 0.002 },
      ];
}

/** One scheduled note, for the test hook and the scale check. */
export interface NoteLog {
  /** Audio clock time it sounds. */
  time: number;
  /** Music clock beats at that time; a 16th boundary when `time` is on the grid. */
  beat: number;
  /** MIDI note, or null for an unpitched hit. */
  midi: number | null;
  key: string;
  /** The area the music (and so the key) follows. */
  area: string | null;
  source: 'player' | 'hit' | 'bug' | 'seq' | 'band' | 'theme';
  defId: string;
  /** When the note was asked for (before quantizing). */
  asked: number;
}

/** The theme: G E D C C D E G on the melody rows (`sequencer.ts` THEME), as degrees, twice. */
export const THEME_DEGREES: readonly number[] = [4, 2, 1, 0, 0, 1, 2, 4];

export type MusicEvents = Pick<
  GameEvents,
  'note_played' | 'band_played' | 'secret_found' | 'instrument_played'
>;

/** A note to schedule: when (audio time), pitch (degree or null), and how. */
interface Pending {
  time: number;
  timbre: ToyTimbre;
  degree: number | null;
  /** Semitones added after the degree (the bass's chord root). */
  semis: number;
  velocity: number;
  source: NoteLog['source'];
  defId: string;
  asked: number;
  octave: number;
  length?: number;
}

/**
 * Schedules toy notes on the music clock through the synth backend. It
 * keeps a short log of what it played for the test hook.
 */
export class MusicToys {
  readonly log: NoteLog[] = [];
  /** How many times each instrument was poked, for its motif. */
  private readonly pokes = new Map<number, number>();
  /** The last 16th step scheduled for each running part. */
  private readonly parts = new Map<string, number>();
  private bandUntil = -Infinity;
  private bandStep = -1;
  private themeAt = -Infinity;

  constructor(
    private readonly backend: AudioBackend,
    readonly clock: MusicClock,
    private readonly now: () => number,
    private readonly area: () => string | null,
  ) {}

  /** A note the player poked or a thing knocked: quantized to the next 16th. Returns the log entry. */
  note(e: GameEvents['note_played'], volume = 1): NoteLog | null {
    const timbre = toyTimbre(e.defId);
    const asked = this.now();
    const time = this.clock.next(asked + 0.004, STEPS_PER_BEAT).time;
    let degree: number | null = null;
    if (!UNPITCHED.has(timbre)) {
      if (e.poked) {
        const n = this.pokes.get(e.id) ?? 0;
        this.pokes.set(e.id, n + 1);
        degree = motifDegree(e.note, n);
      } else degree = e.note;
    }
    return this.play({
      time,
      timbre,
      degree,
      semis: 0,
      velocity: volume,
      source: e.poked ? 'player' : 'hit',
      defId: e.defId,
      asked,
      octave: timbreOctave(timbre),
    });
  }

  /** The band layer joins for 16 bars. */
  band(): void {
    const bar = this.clock.period * this.clock.beatsPerBar;
    this.bandUntil = this.now() + 16 * bar;
  }

  /** The theme, sung once by every bug, from the next bar. */
  theme(): void {
    this.themeAt = this.clock.nextBar(this.now() + 0.05);
    const eighth = this.clock.period / 2;
    for (let rep = 0; rep < 2; rep++)
      THEME_DEGREES.forEach((d, i) => {
        const time = this.themeAt + (rep * 8 + i) * eighth;
        for (const octave of [4, 5])
          this.play({
            time,
            timbre: 'choir',
            degree: d,
            semis: 0,
            velocity: octave === 4 ? 1 : 0.6,
            source: 'theme',
            defId: 'theme',
            asked: this.now(),
            octave,
            length: eighth * 0.95,
          });
      });
  }

  /**
   * Run a part (a bug on an instrument, the sequencer, the band) for the 16th
   * steps from the last one done up to `lookahead` seconds ahead. `fn` gives
   * what plays on each step.
   */
  part(key: string, lookahead: number, fn: (step: number, time: number) => void): void {
    const now = this.now();
    const until = this.clock.beatAt(now + lookahead) * STEPS_PER_BEAT;
    const first = Math.ceil(this.clock.beatAt(now + 0.01) * STEPS_PER_BEAT);
    let s = this.parts.get(key);
    if (s === undefined || s < first - 1 || s > until + 64) s = first - 1;
    for (let step = s + 1; step <= until; step++) fn(step, this.clock.timeOfBeat(step / STEPS_PER_BEAT));
    this.parts.set(key, Math.max(s, Math.floor(until)));
  }

  /** Forget parts that stopped, so a new start begins fresh. */
  endPartsExcept(live: ReadonlySet<string>): void {
    for (const k of [...this.parts.keys()]) if (!live.has(k)) this.parts.delete(k);
  }

  /** A bug's part on an instrument: its pattern for each 16th step. */
  bugStep(
    bugId: number,
    defId: string,
    step: number,
    time: number,
    volume: number,
    style: PlayStyle = null,
  ): void {
    const timbre = toyTimbre(defId);
    const hit = bugPart(timbre, step, bugId, style);
    if (!hit) return;
    const root = this.chordDegree(step);
    this.play({
      time,
      timbre,
      degree: hit === 'hit' ? null : root + hit.degree,
      semis: 0,
      velocity: (hit === 'hit' ? 0.8 : hit.velocity) * volume,
      source: 'bug',
      defId,
      asked: time,
      octave: timbreOctave(timbre),
      length:
        timbre === 'flute' ? this.clock.period * 3 : timbre === 'fiddle' ? this.clock.period * 2 : undefined,
    });
  }

  /** The band layer: a counter-melody an octave up, on the 8ths, while it lasts. */
  updateBand(volume: number): void {
    if (this.now() > this.bandUntil) return;
    this.part('band', 0.15, (step, time) => {
      if (step % 2 !== 0 || time > this.bandUntil) return;
      this.bandStep++;
      const walk = [0, 1, 2, 1, 3, 2, 4, 3][this.bandStep % 8]!;
      this.play({
        time,
        timbre: 'xylophone',
        degree: this.chordDegree(step) + walk + 5,
        semis: 0,
        velocity: 0.55 * volume,
        source: 'band',
        defId: 'band',
        asked: time,
        octave: 4,
      });
    });
  }

  get bandActive(): boolean {
    return this.now() <= this.bandUntil;
  }

  /**
   * The chord this bar as a scale degree: the 4-bar progression the pad
   * plays (I, vi, IV, V), with each root moved to the nearest scale note.
   */
  chordDegree(step: number): number {
    const bar = Math.floor(step / (STEPS_PER_BEAT * this.clock.beatsPerBar));
    // Degrees of the pentatonic: 0, the 6th (4), the 2nd/4th (1), the 5th (3).
    return [0, 4, 1, 3][((bar % 4) + 4) % 4]! - (bar % 4 === 1 ? 5 : 0);
  }

  /** Schedule one note now (or at its time) and log it. */
  play(p: Pending): NoteLog | null {
    const now = this.now();
    if (p.time < now - 0.02) return null;
    let midi: number | null = null;
    if (p.degree !== null) midi = this.clock.midi(p.degree, p.octave) + p.semis;
    const tones =
      p.timbre === 'drum' || p.timbre === 'maraca' || p.timbre === 'castanets'
        ? toyTones(p.timbre, null, p.velocity)
        : toyTones(p.timbre, midi === null ? null : midiFreq(midi), p.velocity, p.length);
    for (const t of tones)
      this.backend.play({ ...t, delay: Math.max(0, p.time - now) + (t.delay ?? 0), bus: 'sfx' });
    const entry: NoteLog = {
      time: p.time,
      beat: this.clock.beatAt(p.time),
      midi,
      key: keyName(this.clock.key),
      area: this.area(),
      source: p.source,
      defId: p.defId,
      asked: p.asked,
    };
    this.log.push(entry);
    if (this.log.length > 400) this.log.shift();
    return entry;
  }

  /** Play a raw drum (the sequencer's drum row), logged as unpitched. */
  drum(kick: boolean, time: number, velocity: number): void {
    const now = this.now();
    if (time < now - 0.02) return;
    for (const t of seqDrum(kick, velocity))
      this.backend.play({ ...t, delay: Math.max(0, time - now), bus: 'sfx' });
    this.log.push({
      time,
      beat: this.clock.beatAt(time),
      midi: null,
      key: keyName(this.clock.key),
      area: this.area(),
      source: 'seq',
      defId: kick ? 'seq_kick' : 'seq_snare',
      asked: time,
    });
    if (this.log.length > 400) this.log.shift();
  }
}
