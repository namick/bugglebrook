import type { Tone } from './synth';

/**
 * Sounds for the trash can and the tidy whistle (playtest F1 and F2).
 * `Sfx` maps the events to these names; this module only builds the tones.
 */
export type TidySfx =
  | 'trash_chomp'
  | 'trash_burp'
  | 'trash_spit'
  | 'trash_hiccup'
  | 'trash_nope'
  | 'trash_clack'
  | 'trash_rummage'
  | 'whistle_toot'
  | 'tidy_swoosh'
  | 'came_home'
  | 'litter_skitter';

export const TIDY_SFX: readonly TidySfx[] = [
  'trash_chomp',
  'trash_burp',
  'trash_spit',
  'trash_hiccup',
  'trash_nope',
  'trash_clack',
  'trash_rummage',
  'whistle_toot',
  'tidy_swoosh',
  'came_home',
  'litter_skitter',
];

export function isTidySfx(name: string): name is TidySfx {
  return (TIDY_SFX as readonly string[]).includes(name);
}

/** A tin lid banging shut: a thud and a ringing clang with a wobble in it. */
function clang(j: number, at: number, level: number): Tone[] {
  return [
    { freq: 1400 * j, to: 500 * j, dur: 0.04, wave: 'noise', q: 2, gain: 0.3 * level, delay: at },
    {
      freq: 880 * j,
      dur: 0.45,
      wave: 'triangle',
      gain: 0.16 * level,
      delay: at,
      vibrato: { rate: 9, depth: 18 },
    },
    { freq: 1975 * j, dur: 0.3, wave: 'sine', gain: 0.1 * level, delay: at + 0.005 },
    { freq: 2960 * j, dur: 0.18, wave: 'sine', gain: 0.06 * level, delay: at + 0.01 },
  ];
}

/**
 * The tones of one sound. `intensity` is 0 to 1 for most; the burp takes
 * the meal's size and the swoosh which thing in the row it is.
 */
export function tidyTones(name: TidySfx, j: number, intensity: number, random: () => number): Tone[] {
  switch (name) {
    case 'trash_chomp':
      // Two big crunchy bites, then the lid slams with a clang.
      return [
        ...[0, 1].map((k) => ({
          freq: 900 * j,
          to: 240 * j,
          dur: 0.07,
          wave: 'noise' as const,
          q: 1.6,
          gain: 0.34,
          delay: k * 0.11,
        })),
        { freq: 160 * j, to: 90 * j, dur: 0.12, wave: 'square', gain: 0.18, delay: 0.05 },
        ...clang(j, 0.24, 1),
      ];
    case 'trash_burp': {
      // A long, low, rattly burp; a big meal is lower and longer.
      const size = Math.min(4, Math.max(1, intensity));
      const len = 0.45 + size * 0.12;
      return [
        {
          freq: (120 - size * 10) * j,
          to: (70 - size * 6) * j,
          dur: len,
          wave: 'sawtooth',
          gain: 0.36,
          attack: 0.04,
          formants: [480, 820],
          vibrato: { rate: 26, depth: 16 },
        },
        { freq: 300 * j, to: 120 * j, dur: len * 0.8, wave: 'noise', q: 3, gain: 0.08, delay: 0.05 },
        // The lid rattles as it settles.
        ...[0, 1, 2].map((k) => ({
          freq: 2200 * j,
          dur: 0.03,
          wave: 'noise' as const,
          q: 6,
          gain: 0.07,
          delay: len + k * 0.07,
        })),
      ];
    }
    case 'trash_spit':
      // "Ptooey!" and a boing as it flies out.
      return [
        { freq: 2600 * j, to: 900 * j, dur: 0.06, wave: 'noise', q: 3, gain: 0.25 },
        { freq: 220 * j, to: 520 * j, dur: 0.16, wave: 'triangle', gain: 0.22, delay: 0.05 },
        {
          freq: 300 * j,
          to: 900 * j,
          dur: 0.22,
          wave: 'sine',
          gain: 0.18,
          delay: 0.12,
          vibrato: { rate: 18, depth: 40 },
        },
        ...clang(j, 0.02, 0.5),
      ];
    case 'trash_hiccup':
      // Hic! It coughs up the last thing.
      return [
        { freq: 260 * j, to: 720 * j, dur: 0.08, wave: 'sawtooth', gain: 0.2, formants: [600, 1100] },
        { freq: 1200 * j, to: 400 * j, dur: 0.05, wave: 'noise', q: 2, gain: 0.18, delay: 0.08 },
        ...clang(j, 0.1, 0.4),
      ];
    case 'trash_nope':
      // "Nuh-uh!": two quick lid clangs, falling, and a low grumble as the whistle flies back out.
      return [
        ...clang(j * 1.1, 0, 0.5),
        ...clang(j * 0.85, 0.14, 0.45),
        {
          freq: 180 * j,
          to: 140 * j,
          dur: 0.12,
          wave: 'sawtooth',
          gain: 0.12,
          formants: [500, 900],
          delay: 0.02,
        },
        {
          freq: 160 * j,
          to: 110 * j,
          dur: 0.14,
          wave: 'sawtooth',
          gain: 0.12,
          formants: [500, 900],
          delay: 0.17,
        },
      ];
    case 'trash_clack':
      // An empty can: the lid clacks twice, a tinny "hm?".
      return [...clang(j, 0, 0.45), ...clang(j * 1.06, 0.13, 0.35)];
    case 'trash_rummage':
      // Cans and wrappers rattling about.
      return Array.from({ length: 7 }, (_, k) => ({
        freq: (1500 + random() * 2500) * j,
        to: (700 + random() * 700) * j,
        dur: 0.04,
        wave: 'noise' as const,
        q: 4,
        gain: 0.1,
        delay: k * 0.09 + random() * 0.03,
      }));
    case 'whistle_toot':
      // A referee's pea whistle: a bright trill, then a second, longer blast.
      return [
        { freq: 2950 * j, dur: 0.16, wave: 'sine', gain: 0.22, vibrato: { rate: 32, depth: 160 } },
        {
          freq: 2950 * j,
          dur: 0.38,
          wave: 'sine',
          gain: 0.24,
          delay: 0.22,
          vibrato: { rate: 34, depth: 170 },
        },
        { freq: 5900 * j, dur: 0.38, wave: 'sine', gain: 0.04, delay: 0.22 },
        { freq: 6000 * j, to: 3000 * j, dur: 0.5, wave: 'noise', q: 1.2, gain: 0.05, delay: 0.02 },
      ];
    case 'tidy_swoosh': {
      // Whoosh, a step higher for each thing in the row, so a whole tidy-up rises.
      const step = 1 + Math.min(12, intensity) * 0.06;
      return [
        {
          freq: 400 * j * step,
          to: 2600 * j * step,
          dur: 0.26,
          wave: 'noise',
          q: 1.4,
          gain: 0.2,
          attack: 0.08,
        },
        { freq: 330 * j * step, to: 990 * j * step, dur: 0.22, wave: 'sine', gain: 0.06, delay: 0.04 },
      ];
    }
    case 'came_home':
      // Plip, and a twinkle: home again.
      return [
        { freq: 700 * j, to: 1400 * j, dur: 0.08, wave: 'sine', gain: 0.16 },
        { freq: 1760 * j, dur: 0.12, wave: 'triangle', gain: 0.08, delay: 0.08 },
        { freq: 2640 * j, dur: 0.12, wave: 'triangle', gain: 0.06, delay: 0.14 },
      ];
    case 'litter_skitter':
      return [{ freq: 2400 * j, to: 1600 * j, dur: 0.03, wave: 'noise', q: 5, gain: 0.05 }];
  }
}
