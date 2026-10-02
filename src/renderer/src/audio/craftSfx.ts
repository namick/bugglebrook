import type { Tone } from './synth';

/**
 * Sounds for the Tinker Bench, the cauldron, potions, and crafted toys (M8).
 * `Sfx` maps the events to these names; this module only builds the tones.
 */
export type CraftSfx =
  | 'tray_clink'
  | 'tray_out'
  | 'hammer'
  | 'bench_clunk'
  | 'bench_rattle'
  | 'craft_pop'
  | 'craft_tada'
  | 'uncraft'
  | 'fail_raspberry'
  | 'fail_boing'
  | 'chomp_burp'
  | 'sad_squeak'
  | 'shrug'
  | 'refuse'
  | 'shimmer'
  | 'nudge'
  | 'blueprint'
  | 'wish'
  | 'blob_split'
  | 'blob_squeak'
  | 'cauldron_plop'
  | 'cauldron_full'
  | 'slosh'
  | 'brew_bubble'
  | 'cork_pop'
  | 'fanfare'
  | 'pour'
  | 'gulp'
  | 'smash'
  | 'grow'
  | 'shrink'
  | 'float_up'
  | 'potion_twinkle'
  | 'potion_whoosh'
  | 'poof'
  | 'fizzle'
  | 'bubble_burp'
  | 'sludge_burp'
  | 'stomp'
  | 'achoo'
  | 'deflate'
  | 'shatter'
  | 'sizzle'
  | 'note'
  | 'twang'
  | 'toy_whoosh'
  | 'boing'
  | 'air_hiss'
  | 'tinkle'
  | 'tie_zip'
  | 'thwack'
  | 'scope';

/** Semitones of a major pentatonic scale. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;
const C5 = 523.25;

/** The frequency of a scale step: 0 is C5, 5 is C6, -1 is A4. */
export function noteFreq(step: number): number {
  const s = Math.round(step);
  const octave = Math.floor(s / 5);
  const degree = s - octave * 5;
  return C5 * 2 ** (octave + PENTATONIC[degree]! / 12);
}

/** How an instrument sounds, from its def ID. */
export type Timbre = 'kazoo' | 'harp' | 'bass' | 'drum' | 'tine';

export function timbreOf(defId: string): Timbre {
  if (defId.includes('kazoo')) return 'kazoo';
  if (defId.includes('harp')) return 'harp';
  if (defId.includes('bass')) return 'bass';
  if (defId.includes('drum')) return 'drum';
  return 'tine';
}

/** One musical note, in the instrument's own voice. */
export function noteTones(defId: string, step: number, j = 1): Tone[] {
  const f = noteFreq(step);
  // Notes stay in tune: only a hair of the usual jitter.
  const tune = 1 + (j - 1) * 0.05;
  switch (timbreOf(defId)) {
    case 'kazoo':
      return [
        {
          freq: f * tune,
          dur: 0.32,
          wave: 'square',
          gain: 0.09,
          attack: 0.03,
          formants: [700, 1500],
          vibrato: { rate: 7, depth: f * 0.02 },
        },
        { freq: f * 2 * tune, dur: 0.3, wave: 'sawtooth', gain: 0.03, attack: 0.03 },
      ];
    case 'harp':
      return [
        { freq: f * tune, dur: 0.7, wave: 'triangle', gain: 0.22, attack: 0.004 },
        { freq: f * 2 * tune, dur: 0.25, wave: 'sine', gain: 0.07, attack: 0.004 },
      ];
    case 'bass': {
      const low = f / 4;
      return [
        { freq: low * tune, dur: 0.55, wave: 'sine', gain: 0.4, attack: 0.01 },
        { freq: low * 2 * tune, dur: 0.2, wave: 'triangle', gain: 0.1, attack: 0.01 },
      ];
    }
    case 'drum':
      return [
        { freq: (f / 4) * tune, to: (f / 8) * tune, dur: 0.18, wave: 'sine', gain: 0.4, attack: 0.003 },
        { freq: 1800 * tune, to: 600 * tune, dur: 0.06, wave: 'noise', q: 1.5, gain: 0.2 },
      ];
    case 'tine':
      return [
        { freq: f * tune, dur: 0.45, wave: 'sine', gain: 0.18, attack: 0.004 },
        { freq: f * 3 * tune, dur: 0.12, wave: 'sine', gain: 0.05, attack: 0.004 },
      ];
  }
}

/** A run of falling-then-rising noise puffs: bubbling. */
const bubbles = (n: number, j: number, gap: number, low: number, high: number, gain: number): Tone[] =>
  Array.from({ length: n }, (_, k) => {
    const f = low + ((high - low) * k) / Math.max(1, n - 1);
    return {
      freq: f * j * (k % 2 ? 1.12 : 1),
      to: f * 1.8 * j,
      dur: 0.06,
      wave: 'sine' as const,
      gain,
      delay: k * gap,
    };
  });

/**
 * The tones of one M8 sound. `intensity` is 0 to 1 for most, and carries
 * a count where a sound needs one (cauldron_plop: how full the pot is).
 */
export function craftTones(name: CraftSfx, j: number, intensity: number, random: () => number): Tone[] {
  switch (name) {
    case 'tray_clink':
      // A bottle cap set down in a tin tray.
      return [
        { freq: 2300 * j, dur: 0.12, wave: 'sine', gain: 0.14 },
        { freq: 3450 * j, dur: 0.07, wave: 'sine', gain: 0.08, delay: 0.01 },
        { freq: 4000 * j, to: 2000 * j, dur: 0.02, wave: 'noise', q: 3, gain: 0.12 },
      ];
    case 'tray_out':
      return [
        { freq: 1900 * j, to: 1500 * j, dur: 0.08, wave: 'sine', gain: 0.1 },
        { freq: 500 * j, to: 900 * j, dur: 0.07, wave: 'triangle', gain: 0.12, delay: 0.03 },
      ];
    case 'hammer': {
      // Woody knocks across about a second, stopping for the hit-stop; more and harder when strong.
      const n = intensity > 0.5 ? 8 : 6;
      const level = 0.6 + 0.5 * intensity;
      return Array.from({ length: n }, (_, k) => {
        const at = (k * 0.95) / (n - 1) + (random() - 0.5) * 0.04;
        const f = (260 + (k % 3) * 40) * j;
        return [
          { freq: f, to: f * 0.8, dur: 0.07, wave: 'triangle' as const, gain: 0.3 * level, delay: at },
          {
            freq: 1600 * j,
            to: 700 * j,
            dur: 0.025,
            wave: 'noise' as const,
            q: 1.5,
            gain: 0.14 * level,
            delay: at,
          },
        ];
      }).flat();
    }
    case 'bench_rattle': {
      // Under the hammering (R09): bolts and caps rattling faster and faster, a hiss of steam
      // building, and a little kettle whistle at the top. It stops just before the pop (the
      // hit-stop), so the pop lands in a beat of quiet.
      const tones: Tone[] = [];
      let at = 0.12;
      for (let k = 0; at < 1.02; k++) {
        const f = (2600 + (k % 4) * 450) * j;
        tones.push({
          freq: f,
          to: f * 0.7,
          dur: 0.025,
          wave: 'noise',
          q: 5,
          gain: 0.07 + 0.08 * at,
          delay: at,
        });
        if (k % 3 === 1)
          tones.push({
            freq: (1700 + random() * 900) * j,
            dur: 0.05,
            wave: 'sine',
            gain: 0.05,
            delay: at + 0.01,
          });
        at += Math.max(0.03, 0.11 - at * 0.08) * (intensity > 0.5 ? 0.8 : 1);
      }
      tones.push(
        {
          freq: 3000 * j,
          to: 6500 * j,
          dur: 0.8,
          wave: 'noise',
          q: 0.8,
          gain: 0.06,
          attack: 0.5,
          delay: 0.25,
        },
        { freq: 1100 * j, to: 1650 * j, dur: 0.35, wave: 'sine', gain: 0.05, attack: 0.15, delay: 0.7 },
      );
      return tones;
    }
    case 'craft_pop':
      // The pop as the new thing comes out: a soft pomf of air and a bright cork pop.
      return [
        { freq: 190 * j, to: 60 * j, dur: 0.16, wave: 'sine', gain: 0.32 },
        { freq: 900 * j, to: 200 * j, dur: 0.14, wave: 'noise', q: 0.7, gain: 0.22 },
        { freq: 650 * j, to: 1300 * j, dur: 0.06, wave: 'triangle', gain: 0.16, delay: 0.02 },
      ];
    case 'bench_clunk':
      return [
        { freq: 150 * j, to: 90 * j, dur: 0.18, wave: 'triangle', gain: 0.35 },
        { freq: 700 * j, to: 300 * j, dur: 0.05, wave: 'noise', q: 1, gain: 0.15 },
      ];
    case 'craft_tada': {
      // Ta-da: a bright major arpeggio, with a sparkle on top the first time.
      const notes = [523, 659, 784, 1047];
      const tones: Tone[] = notes.map((f, k) => ({
        freq: f * j,
        dur: k === notes.length - 1 ? 0.5 : 0.16,
        wave: 'triangle' as const,
        gain: 0.18,
        delay: k * 0.08,
      }));
      if (intensity >= 1)
        tones.push(
          ...[2093, 2637, 3136, 4186].map((f, k) => ({
            freq: f * j,
            dur: 0.18,
            wave: 'sine' as const,
            gain: 0.08,
            delay: 0.32 + k * 0.06,
          })),
        );
      return tones;
    }
    case 'uncraft':
      return [
        { freq: 300 * j, to: 900 * j, dur: 0.07, wave: 'sine', gain: 0.3 },
        ...[0, 1, 2, 3].map((k) => ({
          freq: (2000 + random() * 1500) * j,
          dur: 0.025,
          wave: 'noise' as const,
          q: 4,
          gain: 0.14,
          delay: 0.1 + k * 0.06,
        })),
      ];
    case 'fail_raspberry':
      // Pbbbt: a blown raspberry with a puff of air.
      return [
        {
          freq: 95 * j,
          to: 75 * j,
          dur: 0.45,
          wave: 'sawtooth',
          gain: 0.18,
          attack: 0.02,
          formants: [400, 900],
          vibrato: { rate: 28, depth: 12 },
        },
        { freq: 500 * j, to: 200 * j, dur: 0.4, wave: 'noise', q: 1.5, gain: 0.14 },
      ];
    case 'fail_boing':
    case 'boing':
      // A trampoline boing: a wobbling rise.
      return [
        {
          freq: 140 * j,
          to: 520 * j,
          dur: 0.4,
          wave: 'sine',
          gain: 0.32,
          vibrato: { rate: 14, depth: 40 },
        },
        { freq: 280 * j, to: 900 * j, dur: 0.25, wave: 'triangle', gain: 0.08 },
      ];
    case 'chomp_burp':
      return [
        ...[0, 1].map((k) => ({
          freq: 750 * j,
          to: 300 * j,
          dur: 0.06,
          wave: 'noise' as const,
          q: 2,
          gain: 0.3,
          delay: k * 0.16,
        })),
        { freq: 420 * j, to: 140 * j, dur: 0.14, wave: 'sine', gain: 0.3, delay: 0.34 },
        {
          freq: 115 * j,
          to: 80 * j,
          dur: 0.35,
          wave: 'sawtooth',
          gain: 0.35,
          delay: 0.6,
          attack: 0.03,
          formants: [520, 900],
          vibrato: { rate: 24, depth: 14 },
        },
      ];
    case 'sad_squeak':
      // Squeak, then a slide whistle sagging down: wah-wahhh.
      return [
        { freq: 1700 * j, to: 2300 * j, dur: 0.08, wave: 'sine', gain: 0.16 },
        {
          freq: 1400 * j,
          to: 350 * j,
          dur: 0.75,
          wave: 'sine',
          gain: 0.16,
          delay: 0.18,
          attack: 0.04,
          vibrato: { rate: 6, depth: 15 },
        },
      ];
    case 'shrug':
      // Hm? Two little boops, the second higher.
      return [
        { freq: 330 * j, dur: 0.1, wave: 'sine', gain: 0.2, formants: [450, 800] },
        { freq: 440 * j, to: 400 * j, dur: 0.14, wave: 'sine', gain: 0.18, delay: 0.13 },
      ];
    case 'refuse':
      // A firm little no-no.
      return [0, 1].map((k) => ({
        freq: 260 * j,
        to: 220 * j,
        dur: 0.09,
        wave: 'square' as const,
        gain: 0.07,
        delay: k * 0.14,
      }));
    case 'shimmer':
      return [0, 1, 2, 3, 4].map((k) => ({
        freq: (2400 + (k % 2) * 400 + k * 120) * j,
        dur: 0.14,
        wave: 'sine' as const,
        gain: 0.06,
        delay: k * 0.05,
        vibrato: { rate: 12, depth: 30 },
      }));
    case 'nudge':
      return [
        { freq: 900 * j, dur: 0.06, wave: 'triangle', gain: 0.14 },
        { freq: 1350 * j, dur: 0.1, wave: 'triangle', gain: 0.12, delay: 0.08 },
      ];
    case 'blueprint':
      // A paper rustle, then a chime.
      return [
        ...[0, 1, 2].map((k) => ({
          freq: (3500 - k * 400) * j,
          to: 1800 * j,
          dur: 0.07,
          wave: 'noise' as const,
          q: 0.9,
          gain: 0.12,
          delay: k * 0.06,
        })),
        { freq: 1568 * j, dur: 0.35, wave: 'sine', gain: 0.14, delay: 0.22 },
        { freq: 2093 * j, dur: 0.4, wave: 'sine', gain: 0.1, delay: 0.3 },
      ];
    case 'wish':
      // A soft thought-bubble ding.
      return [
        { freq: 1760 * j, dur: 0.4, wave: 'sine', gain: 0.07, attack: 0.02 },
        { freq: 2640 * j, dur: 0.25, wave: 'sine', gain: 0.03, attack: 0.02 },
      ];
    case 'blob_split':
      return [
        { freq: 420 * j, to: 160 * j, dur: 0.14, wave: 'noise', q: 1.5, gain: 0.3 },
        { freq: 160 * j, to: 110 * j, dur: 0.12, wave: 'sine', gain: 0.2, vibrato: { rate: 30, depth: 20 } },
        ...[0, 1, 2].map((k) => ({
          freq: (500 + k * 150) * j,
          to: (1100 + k * 200) * j,
          dur: 0.05,
          wave: 'sine' as const,
          gain: 0.18,
          delay: 0.15 + k * 0.08,
        })),
      ];
    case 'blob_squeak':
      // A squeaky dog toy: squee-ee.
      return [
        { freq: 1300 * j, to: 1900 * j, dur: 0.1, wave: 'square', gain: 0.07, formants: [1500, 2600] },
        {
          freq: 1800 * j,
          to: 1200 * j,
          dur: 0.14,
          wave: 'square',
          gain: 0.06,
          delay: 0.1,
          formants: [1500, 2600],
        },
      ];
    case 'cauldron_plop': {
      // Plop and splash, a little higher with each thing in the pot.
      const up = 1 + 0.18 * Math.max(0, Math.min(3, intensity) - 1);
      return [
        { freq: 240 * j * up, to: 700 * j * up, dur: 0.08, wave: 'sine', gain: 0.3 },
        { freq: 1800 * j, to: 600 * j, dur: 0.22, wave: 'noise', q: 0.9, gain: 0.18, delay: 0.05 },
      ];
    }
    case 'cauldron_full':
      return [
        { freq: 520 * j, to: 260 * j, dur: 0.1, wave: 'triangle', gain: 0.2 },
        { freq: 260 * j, to: 520 * j, dur: 0.12, wave: 'triangle', gain: 0.16, delay: 0.12 },
      ];
    case 'slosh':
      return [
        { freq: 500 * j, to: 900 * j, dur: 0.25, wave: 'noise', q: 1.2, gain: 0.16, attack: 0.06 },
        ...bubbles(2, j, 0.1, 300, 400, 0.08),
      ];
    case 'brew_bubble':
      // Bubbling that climbs as it boils up.
      return bubbles(10, j, 0.075, 220, 800, 0.12);
    case 'cork_pop': {
      const tones: Tone[] = [
        { freq: 600 * j, to: 1500 * j, dur: 0.05, wave: 'sine', gain: 0.35 },
        { freq: 2500 * j, to: 1200 * j, dur: 0.03, wave: 'noise', q: 2, gain: 0.2 },
        {
          freq: 6000 * j,
          to: 4000 * j,
          dur: 0.6,
          wave: 'noise',
          q: 2,
          gain: 0.07,
          delay: 0.06,
          attack: 0.05,
        },
      ];
      return tones;
    }
    case 'fanfare':
      // A triple brew: toot-toot-tooo.
      return [
        { freq: 523 * j, dur: 0.12, wave: 'sawtooth', gain: 0.07, delay: 0.15, formants: [900, 1400] },
        { freq: 523 * j, dur: 0.12, wave: 'sawtooth', gain: 0.07, delay: 0.3, formants: [900, 1400] },
        {
          freq: 784 * j,
          dur: 0.55,
          wave: 'sawtooth',
          gain: 0.08,
          delay: 0.45,
          formants: [900, 1400],
          vibrato: { rate: 6, depth: 8 },
        },
        { freq: 1047 * j, dur: 0.5, wave: 'triangle', gain: 0.08, delay: 0.45 },
      ];
    case 'pour':
      // Glug, glug, glug.
      return [0, 1, 2].map((k) => ({
        freq: 180 * j,
        to: 360 * j,
        dur: 0.12,
        wave: 'sine' as const,
        gain: 0.28,
        delay: k * 0.2,
        formants: [400, 900] as const,
      }));
    case 'gulp':
      // Gulp, gulp, ahh.
      return [
        { freq: 380 * j, to: 150 * j, dur: 0.12, wave: 'sine', gain: 0.3 },
        { freq: 360 * j, to: 140 * j, dur: 0.12, wave: 'sine', gain: 0.3, delay: 0.22 },
        {
          freq: 420 * j,
          to: 300 * j,
          dur: 0.4,
          wave: 'sawtooth',
          gain: 0.08,
          delay: 0.5,
          attack: 0.05,
          formants: [800, 1200],
        },
      ];
    case 'smash':
      return [
        ...[0, 1, 2, 3, 4].map((k) => ({
          freq: (3000 + random() * 2500) * j,
          dur: 0.08,
          wave: 'sine' as const,
          gain: 0.08,
          delay: k * 0.035,
        })),
        { freq: 1600 * j, to: 500 * j, dur: 0.3, wave: 'noise', q: 0.8, gain: 0.2, delay: 0.02 },
      ];
    case 'grow':
      // Bwoomp: a stretchy low note gliding up, then down, over 0.6 s.
      return [
        {
          freq: 70 * j,
          to: 180 * j,
          dur: 0.3,
          wave: 'sawtooth',
          gain: 0.18,
          formants: [300, 700],
          attack: 0.04,
        },
        {
          freq: 180 * j,
          to: 60 * j,
          dur: 0.3,
          wave: 'sawtooth',
          gain: 0.18,
          delay: 0.3,
          formants: [300, 700],
        },
        { freq: 60 * j, to: 120 * j, dur: 0.6, wave: 'sine', gain: 0.2 },
      ];
    case 'shrink':
      return [
        {
          freq: 2200 * j,
          to: 600 * j,
          dur: 0.6,
          wave: 'sine',
          gain: 0.16,
          attack: 0.03,
          vibrato: { rate: 6, depth: 20 },
        },
      ];
    case 'float_up':
      return [
        { freq: 600 * j, to: 1800 * j, dur: 0.7, wave: 'sine', gain: 0.1, attack: 0.1 },
        { freq: 1500 * j, to: 4000 * j, dur: 0.7, wave: 'noise', q: 1.5, gain: 0.07, attack: 0.15 },
      ];
    case 'potion_twinkle':
      return [0, 1, 2, 3].map((k) => ({
        freq: [2093, 3136, 2637, 4186][k]! * j,
        dur: 0.2,
        wave: 'sine' as const,
        gain: 0.08,
        delay: k * 0.09,
      }));
    case 'potion_whoosh':
      return [
        { freq: 500 * j, to: 3500 * j, dur: 0.4, wave: 'noise', q: 1.5, gain: 0.16, attack: 0.08 },
        ...[0, 1, 2].map((k) => ({
          freq: (1800 + k * 500) * j,
          dur: 0.12,
          wave: 'sine' as const,
          gain: 0.07,
          delay: 0.2 + k * 0.06,
        })),
      ];
    case 'poof':
      return [{ freq: 900 * j, to: 300 * j, dur: 0.25, wave: 'noise', q: 0.8, gain: 0.14, attack: 0.02 }];
    case 'fizzle':
      // Pff, then a puzzled "huh?".
      return [
        { freq: 1200 * j, to: 400 * j, dur: 0.22, wave: 'noise', q: 0.8, gain: 0.15 },
        { freq: 2600 * j, dur: 0.08, wave: 'sine', gain: 0.05, delay: 0.1 },
        {
          freq: 300 * j,
          to: 420 * j,
          dur: 0.18,
          wave: 'sine',
          gain: 0.18,
          delay: 0.3,
          formants: [600, 1100],
        },
      ];
    case 'bubble_burp':
      // A big bubbly blorp.
      return [
        {
          freq: 90 * j,
          to: 240 * j,
          dur: 0.35,
          wave: 'sine',
          gain: 0.35,
          vibrato: { rate: 18, depth: 30 },
          formants: [350, 800],
        },
        ...bubbles(4, j, 0.07, 400, 800, 0.1).map((t) => ({ ...t, delay: (t.delay ?? 0) + 0.3 })),
      ];
    case 'sludge_burp':
      // A huge, wet one.
      return [
        {
          freq: 80 * j,
          to: 55 * j,
          dur: 0.75,
          wave: 'sawtooth',
          gain: 0.5,
          attack: 0.04,
          formants: [400, 750],
          vibrato: { rate: 18, depth: 12 },
        },
        { freq: 500 * j, to: 180 * j, dur: 0.5, wave: 'noise', q: 1.2, gain: 0.2, delay: 0.1 },
      ];
    case 'stomp':
      return [
        { freq: 70 * j, to: 40 * j, dur: 0.25, wave: 'sine', gain: 0.25 + 0.25 * intensity },
        { freq: 400 * j, to: 120 * j, dur: 0.08, wave: 'noise', q: 1, gain: 0.12 },
      ];
    case 'achoo':
      // A tiny sneeze that tinkles into snowflakes.
      return [
        { freq: 1100 * j, to: 1400 * j, dur: 0.1, wave: 'triangle', gain: 0.1, formants: [800, 1600] },
        { freq: 6000 * j, to: 3000 * j, dur: 0.1, wave: 'noise', q: 1.5, gain: 0.18, delay: 0.16 },
        ...[0, 1, 2].map((k) => ({
          freq: (3500 + k * 600) * j,
          dur: 0.1,
          wave: 'sine' as const,
          gain: 0.06,
          delay: 0.22 + k * 0.06,
        })),
      ];
    case 'deflate':
      // A long raspberry zip, pitch falling as the air runs out.
      return [
        {
          freq: 420 * j,
          to: 90 * j,
          dur: 1.2,
          wave: 'sawtooth',
          gain: 0.12,
          attack: 0.02,
          formants: [500, 1100],
          vibrato: { rate: 32, depth: 25 },
        },
        { freq: 2500 * j, to: 800 * j, dur: 1.1, wave: 'noise', q: 2, gain: 0.08 },
      ];
    case 'shatter':
      return [
        { freq: 2500 * j, to: 900 * j, dur: 0.1, wave: 'noise', q: 1, gain: 0.25 },
        ...[0, 1, 2, 3].map((k) => ({
          freq: (2800 + random() * 2400) * j,
          dur: 0.09,
          wave: 'sine' as const,
          gain: 0.08,
          delay: 0.04 + k * 0.05,
        })),
      ];
    case 'sizzle':
      return [
        { freq: 5500 * j, to: 4500 * j, dur: 0.7, wave: 'noise', q: 1.2, gain: 0.12, attack: 0.03 },
        ...[0, 1, 2].map((k) => ({
          freq: 3000 * j,
          dur: 0.015,
          wave: 'noise' as const,
          q: 6,
          gain: 0.1,
          delay: 0.1 + k * 0.17,
        })),
      ];
    case 'note':
      return noteTones('', 0, j);
    case 'twang':
      // A spring or rubber band let go.
      return [
        {
          freq: 220 * j,
          to: 160 * j,
          dur: 0.35,
          wave: 'triangle',
          gain: 0.25,
          attack: 0.003,
          vibrato: { rate: 26, depth: 30 },
        },
        { freq: 1500 * j, to: 400 * j, dur: 0.25, wave: 'noise', q: 1.5, gain: 0.12, delay: 0.03 },
      ];
    case 'toy_whoosh':
      return [{ freq: 600 * j, to: 2800 * j, dur: 0.4, wave: 'noise', q: 2, gain: 0.22, attack: 0.03 }];
    case 'air_hiss':
      return [{ freq: 4000 * j, to: 3000 * j, dur: 0.45, wave: 'noise', q: 1, gain: 0.1, attack: 0.05 }];
    case 'tinkle':
      return [0, 1, 2].map((k) => ({
        freq: [2349, 2794, 3136][k]! * j,
        dur: 0.15,
        wave: 'sine' as const,
        gain: 0.07,
        delay: k * 0.07,
      }));
    case 'tie_zip':
      return [{ freq: 1200 * j, to: 3600 * j, dur: 0.14, wave: 'noise', q: 4, gain: 0.16 }];
    case 'thwack':
      return [
        { freq: 2400 * j, to: 500 * j, dur: 0.06, wave: 'noise', q: 1, gain: 0.32 },
        { freq: 260 * j, to: 140 * j, dur: 0.12, wave: 'triangle', gain: 0.3 },
        { freq: 700 * j, to: 2200 * j, dur: 0.25, wave: 'noise', q: 2, gain: 0.12, delay: 0.06 },
      ];
    case 'scope':
      // The lens zooms in (vwoop), then a tick.
      return [
        { freq: 300 * j, to: 1200 * j, dur: 0.25, wave: 'sine', gain: 0.14, vibrato: { rate: 9, depth: 20 } },
        { freq: 3200 * j, dur: 0.02, wave: 'square', gain: 0.06, delay: 0.3 },
      ];
  }
}
