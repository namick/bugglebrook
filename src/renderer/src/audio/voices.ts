import type { EventBus } from '../../../game/core/events';
import { Rng } from '../../../game/core/rng';
import type { BugDef, VoiceProfile } from '../../../game/data/types';
import type { GameEvents } from '../../../game/events';
import type { AudioBackend, Tone } from './synth';

export type Emotion = 'happy' | 'question' | 'grumpy' | 'scared' | 'dizzy' | 'sleepy' | 'whee' | 'ooh';

/** Vowel formants in Hz: a, e, i, o, u (game design doc, section 16). */
const VOWELS: readonly (readonly [number, number])[] = [
  [800, 1200],
  [400, 2000],
  [300, 2300],
  [450, 800],
  [325, 700],
];

interface Shape {
  /** Syllable count range. */
  count: [number, number];
  /** Pitch position 0..1 in the bug's range, per syllable index 0..1. */
  pitch: (t: number, i: number, rng: Rng) => number;
  /** Speed multiplier on the bug's syllable rate. */
  rate: number;
  /** Glide within each syllable, in pitch positions. */
  glide: number;
  gain: number;
}

const SHAPES: Readonly<Record<Emotion, Shape>> = {
  happy: { count: [3, 5], pitch: (t) => 0.35 + 0.6 * t, rate: 1, glide: 0.1, gain: 0.3 },
  question: { count: [2, 4], pitch: (t) => (t >= 0.99 ? 0.95 : 0.4), rate: 1, glide: 0.15, gain: 0.26 },
  grumpy: { count: [1, 2], pitch: () => 0.12, rate: 1.2, glide: -0.05, gain: 0.28 },
  scared: {
    count: [3, 6],
    pitch: (_t, _i, rng) => 0.75 + rng.range(-0.12, 0.2),
    rate: 1.4,
    glide: 0.1,
    gain: 0.26,
  },
  dizzy: {
    count: [3, 4],
    pitch: (_t, i) => 0.45 + 0.3 * Math.sin(i * 1.3),
    rate: 0.7,
    glide: -0.2,
    gain: 0.26,
  },
  sleepy: { count: [2, 3], pitch: (t) => 0.5 - 0.4 * t, rate: 0.55, glide: -0.1, gain: 0.2 },
  whee: { count: [1, 1], pitch: () => 0.55, rate: 0.35, glide: 0.45, gain: 0.32 },
  ooh: { count: [1, 2], pitch: (t) => 0.3 + 0.1 * t, rate: 0.5, glide: 0.08, gain: 0.3 },
};

/**
 * Build one line of gibberish for a bug: 1 to 6 syllables, each a formant
 * filtered note, some with a noise consonant. Pure and seeded, so tests can
 * check it with a null backend.
 */
export function voiceLine(voice: VoiceProfile, emotion: Emotion, rng: Rng): Tone[] {
  const shape = SHAPES[emotion];
  const count = rng.int(shape.count[0], shape.count[1]);
  const syllable = 1 / (voice.syllablesPerSecond * shape.rate);
  const span = voice.high - voice.low;
  const tones: Tone[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const p = Math.min(1.1, Math.max(0, shape.pitch(t, i, rng)));
    const freq = voice.low + span * p;
    const to = voice.low + span * Math.max(0, p + shape.glide);
    const vowel = rng.pick(VOWELS);
    const dur = Math.max(0.06, Math.min(0.9, syllable * rng.range(0.75, 1.1)));
    if (rng.chance(0.5)) {
      tones.push({
        freq: 3000,
        to: 1800,
        dur: 0.02,
        wave: 'noise',
        q: 1,
        gain: shape.gain * 0.5,
        delay: at,
        bus: 'voice',
      });
    }
    tones.push({
      freq,
      to,
      dur,
      wave: voice.wave,
      gain: shape.gain,
      delay: at + 0.012,
      attack: 0.02,
      formants: [vowel[0] * voice.formantShift, vowel[1] * voice.formantShift],
      vibrato:
        voice.vibratoDepth > 0 || emotion === 'scared'
          ? { rate: voice.vibratoHz || 11, depth: voice.vibratoDepth || span * 0.05 }
          : undefined,
      bus: 'voice',
    });
    at += dur * 0.92;
  }
  return tones;
}

/** How each bug reacts out loud to what happens to it. */
function emotionFor(def: BugDef, event: 'grabbed' | 'flung' | 'poked' | 'recovered'): Emotion {
  switch (event) {
    case 'grabbed':
      return def.likesFlinging ? 'happy' : def.art === 'snail' ? 'ooh' : 'scared';
    case 'flung':
      return def.likesFlinging ? 'whee' : def.art === 'snail' ? 'ooh' : 'scared';
    case 'poked':
      return def.art === 'ladybug' ? 'happy' : def.art === 'snail' ? 'grumpy' : 'scared';
    case 'recovered':
      return def.likesFlinging ? 'happy' : def.art === 'snail' ? 'ooh' : 'sleepy';
  }
}

/**
 * Gibberish bug voices driven by game events. At most three bugs talk at
 * once; others skip their line. Each bug's lines are seeded from its ID and
 * a line counter, so a bug sounds like itself without repeating exactly.
 */
export class BugVoices {
  /** Recent lines (bug def and emotion), newest last. The test hook reads this. */
  readonly log: { defId: string; emotion: Emotion }[] = [];
  private busyUntil = new Map<number, number>();
  private lines = new Map<number, number>();
  private offs: Array<() => void> = [];

  constructor(
    private readonly backend: AudioBackend,
    private readonly bugs: { get(id: string): BugDef },
    private readonly now: () => number = () => performance.now(),
  ) {}

  attach(bus: EventBus<GameEvents>): void {
    this.detach();
    const def = (id: string): BugDef => this.bugs.get(id);
    this.offs = [
      bus.on('item_grabbed', (e) => {
        if (e.kind === 'bug') this.say(e.id, e.defId, emotionFor(def(e.defId), 'grabbed'));
      }),
      bus.on('item_dropped', (e) => {
        if (e.kind === 'bug' && e.flung) this.say(e.id, e.defId, emotionFor(def(e.defId), 'flung'), true);
      }),
      bus.on('bug_poked', (e) => this.say(e.id, e.defId, emotionFor(def(e.defId), 'poked'))),
      bus.on('bug_dizzy', (e) => this.say(e.id, e.defId, 'dizzy', true)),
      bus.on('bug_recovered', (e) => this.say(e.id, e.defId, emotionFor(def(e.defId), 'recovered'))),
      bus.on('bug_ate', (e) => this.say(e.id, e.defId, e.liking === 'disliked' ? 'grumpy' : 'happy')),
      bus.on('bug_used', (e) => this.say(e.id, e.defId, 'whee')),
      bus.on('bug_chose_action', (e) => this.say(e.id, e.defId, 'question')),
    ];
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  /** Speak a line. `interrupt` cuts in even if this bug is mid-line. */
  say(id: number, defId: string, emotion: Emotion, interrupt = false): boolean {
    const t = this.now();
    for (const [bug, until] of this.busyUntil) if (until <= t) this.busyUntil.delete(bug);
    const mine = this.busyUntil.get(id);
    if (mine !== undefined && !interrupt) return false;
    if (mine === undefined && this.busyUntil.size >= 3) return false;
    const n = (this.lines.get(id) ?? 0) + 1;
    this.lines.set(id, n);
    const tones = voiceLine(this.bugs.get(defId).voice, emotion, new Rng(`${id}:${n}`));
    const length = Math.max(...tones.map((tn) => (tn.delay ?? 0) + tn.dur));
    this.busyUntil.set(id, t + length * 1000 + 150);
    for (const tone of tones) this.backend.play(tone);
    this.log.push({ defId, emotion });
    if (this.log.length > 50) this.log.shift();
    return true;
  }
}
