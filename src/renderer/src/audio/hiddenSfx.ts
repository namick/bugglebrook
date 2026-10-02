import type { Tone } from './synth';

/** M10's sounds: the hidden areas, their doorways, and the finale. */
export const HIDDEN_SFX = [
  'iris',
  'crumble',
  'ant_march',
  'ant_cheer',
  'ant_snore',
  'queen_munch',
  'conveyor',
  'root_creak',
  'root_pop',
  'larva_squeak',
  'sniffle',
  'gnome_sneeze',
  'telescope',
  'marble_seat',
  'fanfare',
  'firework_whistle',
  'firework_pop',
  'hollow_tick',
] as const;

export type HiddenSfx = (typeof HIDDEN_SFX)[number];

const NAMES: ReadonlySet<string> = new Set(HIDDEN_SFX);

export function isHiddenSfx(name: string): name is HiddenSfx {
  return NAMES.has(name);
}

/** The tones of one M10 sound. `intensity` is 0 to 1. `j` is a small random pitch wobble near 1. */
export function hiddenTones(name: HiddenSfx, j: number, intensity: number): Tone[] {
  switch (name) {
    case 'iris':
      // Through the doorway: a soft whoosh down, a hollow "fwomp", and a whoosh back up.
      return [
        { freq: 1800 * j, to: 300 * j, dur: 0.28, wave: 'noise', q: 1.5, gain: 0.18 },
        { freq: 140 * j, to: 90 * j, dur: 0.12, wave: 'sine', gain: 0.25, delay: 0.26 },
        { freq: 300 * j, to: 1600 * j, dur: 0.28, wave: 'noise', q: 1.5, gain: 0.14, delay: 0.32 },
      ];
    case 'crumble':
      // Dirt falling away: a rattle of little noise bursts, then a soft thump.
      return [
        ...[0, 0.07, 0.12, 0.2, 0.26, 0.34, 0.45].map((d, k) => ({
          freq: (2200 - k * 180) * j,
          dur: 0.05,
          wave: 'noise' as const,
          q: 4,
          gain: 0.12,
          delay: d,
        })),
        { freq: 120 * j, to: 70 * j, dur: 0.2, wave: 'sine', gain: 0.3, delay: 0.5 },
      ];
    case 'ant_march':
      // A tiny patter of many feet.
      return [0, 0.05, 0.1, 0.15, 0.2, 0.25].map((d) => ({
        freq: 3800 * j,
        dur: 0.015,
        wave: 'noise' as const,
        q: 10,
        gain: 0.05 * intensity,
        delay: d,
      }));
    case 'ant_cheer':
      // The colony cheers: lots of tiny high "yay!"s.
      return [0, 0.04, 0.09, 0.13, 0.18, 0.22, 0.27].map((d, k) => ({
        freq: (1500 + (k % 3) * 260) * j,
        to: (2100 + (k % 3) * 300) * j,
        dur: 0.12,
        wave: 'triangle' as const,
        gain: 0.06,
        delay: d,
        formants: [900, 2400] as const,
      }));
    case 'ant_snore':
      // A whole row of ants snoring in unison: tiny and wheezy.
      return [
        { freq: 1400 * j, to: 900 * j, dur: 0.5, wave: 'noise', q: 6, gain: 0.05 * intensity, attack: 0.2 },
        { freq: 220 * j, to: 180 * j, dur: 0.45, wave: 'triangle', gain: 0.03 * intensity, attack: 0.2 },
      ];
    case 'queen_munch':
      // Nom nom nom, regal.
      return [0, 0.13, 0.26].map((d) => ({
        freq: 700 * j,
        to: 380 * j,
        dur: 0.09,
        wave: 'square' as const,
        gain: 0.08,
        delay: d,
        formants: [700, 1100] as const,
      }));
    case 'conveyor':
      // Passed along from hand to hand: tick-tick-tick.
      return [0, 0.06, 0.12, 0.18].map((d, k) => ({
        freq: (2600 - k * 120) * j,
        dur: 0.02,
        wave: 'sine' as const,
        gain: 0.06,
        delay: d,
      }));
    case 'root_creak':
      return [
        {
          freq: 140 * j,
          to: 90 * j,
          dur: 0.5,
          wave: 'sawtooth',
          gain: 0.06,
          vibrato: { rate: 18, depth: 12 },
        },
        { freq: 600 * j, to: 400 * j, dur: 0.35, wave: 'noise', q: 8, gain: 0.05 },
      ];
    case 'root_pop':
      // The root comes free: a big creak, a pop, and a shower of dirt.
      return [
        {
          freq: 160 * j,
          to: 70 * j,
          dur: 0.4,
          wave: 'sawtooth',
          gain: 0.08,
          vibrato: { rate: 22, depth: 18 },
        },
        { freq: 220 * j, to: 900 * j, dur: 0.08, wave: 'sine', gain: 0.3, delay: 0.42 },
        { freq: 2400 * j, to: 600 * j, dur: 0.35, wave: 'noise', q: 1.5, gain: 0.15, delay: 0.46 },
      ];
    case 'larva_squeak':
      return [
        { freq: 900 * j, to: 1500 * j, dur: 0.09, wave: 'sine', gain: 0.12 },
        { freq: 1500 * j, to: 1100 * j, dur: 0.1, wave: 'sine', gain: 0.1, delay: 0.1 },
      ];
    case 'sniffle':
      // Sniff-sniff: two short breathy pulls.
      return [
        { freq: 2600 * j, to: 3400 * j, dur: 0.12, wave: 'noise', q: 3, gain: 0.12 },
        { freq: 2600 * j, to: 3600 * j, dur: 0.16, wave: 'noise', q: 3, gain: 0.14, delay: 0.18 },
      ];
    case 'gnome_sneeze':
      // A big, deep, ceramic "ah... ah... CHOO!" with a ring at the end.
      return [
        { freq: 180 * j, to: 300 * j, dur: 0.3, wave: 'triangle', gain: 0.2, formants: [700, 1100] },
        {
          freq: 200 * j,
          to: 360 * j,
          dur: 0.32,
          wave: 'triangle',
          gain: 0.22,
          delay: 0.4,
          formants: [700, 1100],
        },
        { freq: 3000 * j, to: 800 * j, dur: 0.35, wave: 'noise', q: 1, gain: 0.5, delay: 0.82 },
        { freq: 880 * j, dur: 0.6, wave: 'sine', gain: 0.08, delay: 0.95 },
      ];
    case 'telescope':
      // Brass sliding out, then the sky: a slow shimmer.
      return [
        { freq: 500 * j, to: 900 * j, dur: 0.25, wave: 'noise', q: 6, gain: 0.08 },
        ...[784, 988, 1175, 1568].map((f, k) => ({
          freq: f * j,
          dur: 0.6,
          wave: 'sine' as const,
          gain: 0.07,
          delay: 0.25 + k * 0.12,
          vibrato: { rate: 5, depth: 6 },
        })),
      ];
    case 'marble_seat':
      // The golden marble settles in the moon's cup: a clear ring.
      return [
        { freq: 1568 * j, dur: 0.9, wave: 'sine', gain: 0.12 },
        { freq: 2349 * j, dur: 0.7, wave: 'sine', gain: 0.06, delay: 0.02 },
      ];
    case 'fanfare':
      return [523, 659, 784, 1047, 784, 1047, 1319].map((f, k) => ({
        freq: f * j,
        dur: k === 6 ? 0.7 : 0.16,
        wave: 'triangle' as const,
        gain: 0.12,
        delay: k * 0.15,
      }));
    case 'firework_whistle':
      return [{ freq: 600 * j, to: 2600 * j, dur: 0.7, wave: 'sine', gain: 0.06 * intensity }];
    case 'firework_pop':
      // A soft boom and a crackle of sparkles.
      return [
        { freq: 110 * j, to: 50 * j, dur: 0.3, wave: 'sine', gain: 0.35 * intensity },
        {
          freq: 3000 * j,
          to: 1200 * j,
          dur: 0.5,
          wave: 'noise',
          q: 1.2,
          gain: 0.12 * intensity,
          delay: 0.05,
        },
        ...[0.2, 0.32, 0.41, 0.55].map((d, k) => ({
          freq: (3200 + k * 400) * j,
          dur: 0.02,
          wave: 'noise' as const,
          q: 12,
          gain: 0.06 * intensity,
          delay: d,
        })),
      ];
    case 'hollow_tick':
      // A little clock somewhere in the hollow.
      return [
        { freq: 2400 * j, dur: 0.02, wave: 'noise', q: 14, gain: 0.04 * intensity },
        { freq: 2000 * j, dur: 0.02, wave: 'noise', q: 14, gain: 0.035 * intensity, delay: 0.5 },
      ];
  }
}
