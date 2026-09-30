import type { EventBus } from '../../../game/core/events';
import { Rng } from '../../../game/core/rng';
import type { BugDef, VoiceProfile } from '../../../game/data/types';
import type { ChatTopic, GameEvents, Mood } from '../../../game/events';
import { reactionLook } from '../render/reactions';
import type { AudioBackend, Tone } from './synth';

export type Emotion =
  | 'happy'
  | 'question'
  | 'grumpy'
  | 'scared'
  | 'dizzy'
  | 'sleepy'
  | 'whee'
  | 'ooh'
  | 'giggle'
  | 'gasp'
  | 'yum'
  | 'love'
  | 'yuck'
  | 'meh';

export const EMOTIONS: readonly Emotion[] = [
  'happy',
  'question',
  'grumpy',
  'scared',
  'dizzy',
  'sleepy',
  'whee',
  'ooh',
  'giggle',
  'gasp',
  'yum',
  'love',
  'yuck',
  'meh',
];

/** How a chat line sounds, by what it is about. */
const CHAT_EMOTION: Readonly<Record<ChatTopic, Emotion>> = {
  food: 'yum',
  friend: 'question',
  star: 'whee',
  question: 'question',
  heart: 'love',
  note: 'happy',
  spring: 'whee',
  drop: 'meh',
  zzz: 'sleepy',
  laugh: 'giggle',
  sun: 'happy',
};

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
  // Hee-hee-hee: quick, high, bouncing between two notes.
  giggle: { count: [4, 6], pitch: (_t, i) => 0.62 + 0.28 * (i % 2), rate: 1.6, glide: 0.12, gain: 0.26 },
  // A sharp in-breath that shoots up.
  gasp: { count: [1, 1], pitch: () => 0.7, rate: 0.9, glide: 0.4, gain: 0.3 },
  // Mmm-nom-nom: a warm rise and fall.
  yum: { count: [3, 4], pitch: (t) => 0.4 + 0.3 * Math.sin(t * Math.PI), rate: 0.85, glide: 0.06, gain: 0.3 },
  // A long, swooning swoop up.
  love: { count: [2, 3], pitch: (t) => 0.6 + 0.4 * t, rate: 0.55, glide: 0.3, gain: 0.3 },
  // Bleh: falling and sour.
  yuck: { count: [2, 3], pitch: (t) => 0.5 - 0.45 * t, rate: 1, glide: -0.3, gain: 0.3 },
  // Meh-eh: flat and a little down.
  meh: { count: [2, 2], pitch: (t) => 0.35 - 0.08 * t, rate: 0.75, glide: -0.05, gain: 0.24 },
};

/** How a mood colors a bug's voice: pitch and tempo multipliers, and extra glide. */
export interface MoodVoice {
  pitch: number;
  rate: number;
  glide: number;
}

export function moodVoice(mood: Mood | undefined): MoodVoice {
  switch (mood) {
    case 'mood_happy':
      return { pitch: 1.08, rate: 1.12, glide: 0.06 };
    case 'mood_grumpy':
      return { pitch: 0.84, rate: 0.85, glide: -0.1 };
    case 'mood_sleepy':
      return { pitch: 0.88, rate: 0.68, glide: -0.12 };
    case 'mood_hungry':
      return { pitch: 0.95, rate: 0.9, glide: -0.06 };
    case 'mood_bored':
      return { pitch: 0.94, rate: 0.8, glide: 0 };
    default:
      return { pitch: 1, rate: 1, glide: 0 };
  }
}

/**
 * Build one line of gibberish for a bug: 1 to 6 syllables, each a formant
 * filtered note, some with a noise consonant. Pure and seeded, so tests can
 * check it with a null backend.
 */
export function voiceLine(voice: VoiceProfile, emotion: Emotion, rng: Rng, mood?: Mood): Tone[] {
  const shape = SHAPES[emotion];
  const m = moodVoice(mood);
  const count = rng.int(shape.count[0], shape.count[1]);
  const syllable = 1 / (voice.syllablesPerSecond * shape.rate * m.rate);
  const span = voice.high - voice.low;
  const tones: Tone[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const p = Math.min(1.1, Math.max(0, shape.pitch(t, i, rng)));
    const freq = (voice.low + span * p) * m.pitch;
    const to = (voice.low + span * Math.max(0, p + shape.glide + m.glide)) * m.pitch;
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
        voice.vibratoDepth > 0 || emotion === 'scared' || emotion === 'love'
          ? { rate: voice.vibratoHz || 11, depth: voice.vibratoDepth || span * 0.05 }
          : undefined,
      bus: 'voice',
    });
    at += dur * 0.92;
  }
  return tones;
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
  private moodOf: (id: number) => Mood | undefined = () => undefined;
  /** Called with every line spoken: which bug, the emotion, and its length in seconds. */
  onLine: ((id: number, emotion: Emotion, seconds: number) => void) | null = null;

  constructor(
    private readonly backend: AudioBackend,
    private readonly bugs: { get(id: string): BugDef },
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Listen to the sim. `moodOf` tells each line what mood its bug is in, so a
   * grumpy bug grumbles lower and slower than a happy one.
   */
  attach(bus: EventBus<GameEvents>, moodOf: (id: number) => Mood | undefined = () => undefined): void {
    this.detach();
    this.moodOf = moodOf;
    const def = (id: string): BugDef => this.bugs.get(id);
    this.offs = [
      // Grabs, pokes, flings, landings, meals, and tickles: the reaction's own voice.
      bus.on('bug_reacted', (e) => {
        const emotion = reactionLook(def(e.defId).art, e.reaction, e.variant).emotion;
        const urgent = e.reaction === 'grab' || e.reaction === 'fling' || e.reaction.startsWith('fed_');
        this.say(e.id, e.defId, emotion, urgent);
      }),
      bus.on('bug_tickled', (e) => this.say(e.id, e.defId, 'giggle', true)),
      bus.on('bug_beckoned', (e) => this.say(e.id, e.defId, 'happy', true)),
      bus.on('bug_wriggled_free', (e) => this.say(e.id, e.defId, 'giggle', true)),
      bus.on('bug_dizzy', (e) => this.say(e.id, e.defId, 'dizzy', true)),
      bus.on('item_shaken', (e) => {
        if (e.kind === 'bug') this.say(e.id, e.defId, def(e.defId).dizzyProof ? 'ooh' : 'dizzy', true);
      }),
      bus.on('bug_recovered', (e) => {
        const d = def(e.defId);
        this.say(e.id, e.defId, d.likesFlinging ? 'happy' : d.art === 'snail' ? 'ooh' : 'sleepy');
      }),
      bus.on('bug_fed', (e) => {
        if (e.liking === 'disliked') this.say(e.id, e.defId, 'gasp', true);
      }),
      bus.on('bug_used', (e) => {
        if (e.action === 'bounce') this.say(e.id, e.defId, 'whee');
      }),
      bus.on('bug_chose_action', (e) => {
        if (e.action === 'eat' || e.action === 'bounce' || e.action.startsWith('soc_'))
          this.say(e.id, e.defId, 'question');
      }),
      // A chat line: the pictogram's mood in gibberish.
      bus.on('bug_chatted', (e) => this.say(e.id, e.defId, CHAT_EMOTION[e.topic], true)),
      bus.on('bug_tagged', (e) => this.say(e.id, e.defId, 'giggle')),
      bus.on('bug_caught', (e) => this.say(e.id, e.defId, 'whee')),
      bus.on('bug_shared', (e) => this.say(e.id, e.defId, 'happy')),
      bus.on('bug_snatched', (e) => this.say(e.id, e.defId, 'giggle', true)),
      bus.on('bug_comforted', (e) => this.say(e.id, e.defId, 'ooh')),
      bus.on('bug_rode', (e) => {
        if (e.on) this.say(e.id, e.defId, 'whee');
      }),
      bus.on('bug_fidgeted', (e) => {
        if (e.fidget === 'hum') this.say(e.id, e.defId, 'happy');
        else if (e.fidget === 'yawn') this.say(e.id, e.defId, 'sleepy');
      }),
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
    const tones = voiceLine(this.bugs.get(defId).voice, emotion, new Rng(`${id}:${n}`), this.moodOf(id));
    const length = Math.max(...tones.map((tn) => (tn.delay ?? 0) + tn.dur));
    this.busyUntil.set(id, t + length * 1000 + 150);
    for (const tone of tones) this.backend.play(tone);
    this.onLine?.(id, emotion, length);
    this.log.push({ defId, emotion });
    if (this.log.length > 50) this.log.shift();
    return true;
  }
}
