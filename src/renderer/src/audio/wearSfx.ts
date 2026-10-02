import type { Tone } from './synth';

/**
 * Sounds for M11's hats and accessories and the music bugs. `Sfx` maps the
 * events to these names; this module only builds the tones.
 */
export type WearSfx =
  | 'hat_on'
  | 'hat_ding'
  | 'hat_off'
  | 'hat_pop'
  | 'party_horn'
  | 'hat_judge'
  | 'hat_swap'
  | 'headbutt'
  | 'chef_chop'
  | 'monocle'
  | 'pollen'
  | 'honey'
  | 'flutter';

export const WEAR_SFX: readonly WearSfx[] = [
  'hat_on',
  'hat_ding',
  'hat_off',
  'hat_pop',
  'party_horn',
  'hat_judge',
  'hat_swap',
  'headbutt',
  'chef_chop',
  'monocle',
  'pollen',
  'honey',
  'flutter',
];

export function isWearSfx(name: string): name is WearSfx {
  return (WEAR_SFX as readonly string[]).includes(name);
}

/** The tones of one sound. `j` is a little random detune, `intensity` 0 to 1. */
export function wearTones(name: WearSfx, j: number, intensity: number, random: () => number): Tone[] {
  const v = Math.max(0.3, intensity);
  switch (name) {
    case 'hat_on':
      // A soft fwump as it settles on.
      return [
        { freq: 520 * j, to: 300 * j, dur: 0.09, wave: 'noise', q: 1.2, gain: 0.12 * v },
        { freq: 330 * j, to: 440 * j, dur: 0.12, wave: 'triangle', gain: 0.12 * v, delay: 0.02 },
      ];
    case 'hat_ding':
      // sfx_hat_land_ding: the great shot.
      return [
        { freq: 1568 * j, dur: 0.5, wave: 'sine', gain: 0.16 * v, attack: 0.002 },
        { freq: 3136 * j, dur: 0.25, wave: 'sine', gain: 0.06 * v, attack: 0.002 },
        { freq: 2093 * j, dur: 0.45, wave: 'triangle', gain: 0.08 * v, delay: 0.08 },
      ];
    case 'hat_off':
      return [{ freq: 600 * j, to: 260 * j, dur: 0.1, wave: 'triangle', gain: 0.1 * v }];
    case 'hat_pop':
      // Popped off by the next one: a cork pop.
      return [
        { freq: 900 * j, to: 300 * j, dur: 0.06, wave: 'sine', gain: 0.2 * v },
        { freq: 2400 * j, dur: 0.03, wave: 'noise', q: 3, gain: 0.08 * v },
      ];
    case 'party_horn':
      // A paper party horn: a buzzy toot that unrolls and droops.
      return [
        {
          freq: 520 * j,
          to: 470 * j,
          dur: 0.45,
          wave: 'sawtooth',
          gain: 0.07 * v,
          attack: 0.02,
          formants: [900, 1800],
          vibrato: { rate: 18, depth: 8 },
        },
        { freq: 3000 * j, to: 1500 * j, dur: 0.2, wave: 'noise', q: 2, gain: 0.04 * v, delay: 0.05 },
      ];
    case 'hat_judge':
      // Prim's verdict: a bright little chime.
      return [
        { freq: 1320 * j, dur: 0.14, wave: 'sine', gain: 0.1 * v },
        { freq: 1760 * j, dur: 0.22, wave: 'sine', gain: 0.08 * v, delay: 0.09 },
      ];
    case 'hat_swap':
      return [
        { freq: 700 * j, to: 1000 * j, dur: 0.1, wave: 'triangle', gain: 0.1 * v },
        { freq: 1000 * j, to: 700 * j, dur: 0.1, wave: 'triangle', gain: 0.1 * v, delay: 0.12 },
      ];
    case 'headbutt':
      return [
        { freq: 180 * j, to: 90 * j, dur: 0.1, wave: 'sine', gain: 0.25 * v },
        { freq: 1200 * j, dur: 0.05, wave: 'triangle', gain: 0.08 * v, delay: 0.01 },
      ];
    case 'chef_chop':
      // Hi-yah: a whoosh and a thwack.
      return [
        { freq: 3000 * j, to: 900 * j, dur: 0.12, wave: 'noise', q: 1.5, gain: 0.12 * v },
        { freq: 260 * j, to: 140 * j, dur: 0.08, wave: 'triangle', gain: 0.22 * v, delay: 0.1 },
      ];
    case 'monocle':
      return [{ freq: 2200 * j, to: 2600 * j, dur: 0.08, wave: 'sine', gain: 0.08 * v }];
    case 'pollen':
      return [
        {
          freq: 300 * j,
          to: 360 * j,
          dur: 0.25,
          wave: 'sawtooth',
          gain: 0.03 * v,
          vibrato: { rate: 25, depth: 6 },
        },
      ];
    case 'honey':
      // A sticky blorp, then a twinkle.
      return [
        { freq: 220 * j, to: 420 * j, dur: 0.16, wave: 'sine', gain: 0.18 * v },
        { freq: 1760 * j, to: 2640 * j, dur: 0.18, wave: 'sine', gain: 0.08 * v, delay: 0.14 },
      ];
    case 'flutter':
      return [
        {
          freq: 900 + random() * 200,
          to: 500,
          dur: 0.18,
          wave: 'noise',
          q: 0.9,
          gain: 0.03 * v,
          vibrato: { rate: 16, depth: 120 },
        },
      ];
  }
}
