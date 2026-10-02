import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import type { Tone } from './synth';

/**
 * Sounds for M10's clues and secrets: the boot's glug, the stump door's
 * creak, the frog king's deep ribbit, the ring mushrooms' notes and chord,
 * the reed horn, the telescope's zoom, and so on. `Sfx` plays them; this
 * module builds the tones and says which event plays which.
 */
export const CLUE_SFX = [
  'boot_glug',
  'door_creak',
  'frog_croak',
  'frog_ribbit',
  'frog_king',
  'mushroom_boing',
  'mushroom_chord',
  'reed_horn',
  'rain_rumble',
  'rainbow_fill',
  'shadow_boo',
  'moth_flutter',
  'xylo_tune',
  'claw_spin',
  'souvenir',
  'window_tap',
  'telescope_zoom',
  'cloud_catch',
  'cloud_open',
  'map_snap',
  'dig',
  'orbit_whoosh',
  'orbit_return',
  'proud_sigh',
  'tiny_squeak',
  'wubbo_pop',
] as const;

export type ClueSfx = (typeof CLUE_SFX)[number];

const SET = new Set<string>(CLUE_SFX);
export function isClueSfx(name: string): name is ClueSfx {
  return SET.has(name);
}

/** The five pentatonic notes of the ring mushrooms, low to high (Hz). */
const RING = [392, 494, 587];

export function clueTones(name: ClueSfx, j: number, intensity: number): Tone[] {
  const v = Math.max(0.2, Math.min(1.5, intensity));
  switch (name) {
    case 'boot_glug':
      return [0, 0.12, 0.24].map((d, k) => ({
        freq: (180 + k * 40) * j,
        to: (260 + k * 50) * j,
        dur: 0.12,
        wave: 'sine' as const,
        gain: 0.18,
        delay: d,
      }));
    case 'door_creak':
      return [
        {
          freq: 300 * j,
          to: 520 * j,
          dur: 0.5,
          wave: 'sawtooth',
          gain: 0.05,
          vibrato: { rate: 18, depth: 40 },
        },
        { freq: 2400 * j, dur: 0.05, wave: 'noise', q: 6, gain: 0.08, delay: 0.5 },
      ];
    case 'frog_croak':
      return [
        { freq: 220 * j, to: 160 * j, dur: 0.12, wave: 'square', gain: 0.06 * v, formants: [500, 900] },
      ];
    case 'frog_ribbit':
      // A huge two-part "rib-bit" that rattles the pond.
      return [
        { freq: 90 * j, to: 70 * j, dur: 0.22, wave: 'sawtooth', gain: 0.2, formants: [300, 700] },
        {
          freq: 110 * j,
          to: 60 * j,
          dur: 0.35,
          wave: 'sawtooth',
          gain: 0.22,
          formants: [350, 800],
          delay: 0.25,
        },
        { freq: 50 * j, dur: 0.5, wave: 'sine', gain: 0.25, delay: 0.25 },
      ];
    case 'frog_king':
      // An even deeper ribbit, a gulp, and a "ptoo".
      return [
        { freq: 70 * j, to: 55 * j, dur: 0.4, wave: 'sawtooth', gain: 0.24, formants: [250, 600] },
        {
          freq: 80 * j,
          to: 45 * j,
          dur: 0.5,
          wave: 'sawtooth',
          gain: 0.24,
          formants: [280, 650],
          delay: 0.45,
        },
        { freq: 900 * j, to: 300 * j, dur: 0.1, wave: 'square', gain: 0.08, delay: 1.1 },
      ];
    case 'mushroom_boing': {
      const f = RING[Math.max(0, Math.min(2, Math.round(intensity) - 1))] ?? RING[0]!;
      return [
        { freq: f * j, dur: 0.35, wave: 'sine', gain: 0.14 },
        { freq: f * 2 * j, dur: 0.2, wave: 'triangle', gain: 0.05 },
        { freq: 140 * j, to: 260 * j, dur: 0.12, wave: 'sine', gain: 0.1 },
      ];
    }
    case 'mushroom_chord':
      return [...RING, 784].map((f, k) => ({
        freq: f * j,
        dur: 1.4,
        wave: 'triangle' as const,
        gain: 0.09,
        delay: k * 0.03,
        vibrato: { rate: 5, depth: 6 },
      }));
    case 'reed_horn':
      return [
        { freq: 233 * j, dur: 0.3, wave: 'sawtooth', gain: 0.08, formants: [700, 1200] },
        { freq: 311 * j, dur: 0.6, wave: 'sawtooth', gain: 0.09, formants: [700, 1200], delay: 0.32 },
      ];
    case 'rain_rumble':
      return [
        { freq: 60 * j, to: 40 * j, dur: 1.2, wave: 'noise', q: 1, gain: 0.25 },
        { freq: 523 * j, to: 784 * j, dur: 0.4, wave: 'sine', gain: 0.06, delay: 0.2 },
      ];
    case 'rainbow_fill':
      return [523, 587, 659, 784, 880, 1047].map((f, k) => ({
        freq: f * j,
        dur: 0.22,
        wave: 'sine' as const,
        gain: 0.09,
        delay: k * 0.06,
      }));
    case 'shadow_boo':
      return [
        { freq: 120 * j, to: 90 * j, dur: 0.9, wave: 'sine', gain: 0.15, vibrato: { rate: 6, depth: 10 } },
        { freq: 240 * j, to: 180 * j, dur: 0.9, wave: 'triangle', gain: 0.05 },
      ];
    case 'moth_flutter':
      return Array.from({ length: 8 }, (_, k) => ({
        freq: 1800 * j,
        to: 2400 * j,
        dur: 0.05,
        wave: 'noise' as const,
        q: 3,
        gain: 0.04,
        delay: k * 0.07,
      }));
    case 'xylo_tune':
      return [523, 659, 784, 659, 880, 784, 1047, 1319].map((f, k) => ({
        freq: f * j,
        dur: 0.25,
        wave: 'sine' as const,
        gain: 0.12,
        delay: k * 0.16,
      }));
    case 'claw_spin':
      return [
        { freq: 400 * j, to: 1600 * j, dur: 0.6, wave: 'square', gain: 0.05 },
        { freq: 784 * j, dur: 0.2, wave: 'sine', gain: 0.1, delay: 0.6 },
        { freq: 1047 * j, dur: 0.35, wave: 'sine', gain: 0.1, delay: 0.75 },
      ];
    case 'souvenir':
      return [
        { freq: 659 * j, dur: 0.15, wave: 'triangle', gain: 0.1 },
        { freq: 988 * j, dur: 0.3, wave: 'triangle', gain: 0.1, delay: 0.12 },
      ];
    case 'window_tap':
      return [{ freq: 2600 * j, to: 2200 * j, dur: 0.04, wave: 'triangle', gain: 0.1 }];
    case 'telescope_zoom':
      return [
        { freq: 200 * j, to: 1200 * j, dur: 0.45, wave: 'sine', gain: 0.08 },
        { freq: 1568 * j, dur: 0.3, wave: 'sine', gain: 0.06, delay: 0.45 },
      ];
    case 'cloud_catch':
      return [
        { freq: 400 * j, to: 200 * j, dur: 0.3, wave: 'noise', q: 1.5, gain: 0.12 },
        { freq: 880 * j, dur: 0.3, wave: 'sine', gain: 0.08, delay: 0.2 },
      ];
    case 'cloud_open':
      return [
        { freq: 1200 * j, to: 300 * j, dur: 0.4, wave: 'noise', q: 1.2, gain: 0.15 },
        { freq: 80 * j, dur: 0.6, wave: 'sine', gain: 0.12, delay: 0.25 },
      ];
    case 'map_snap':
      return [
        { freq: 3000 * j, dur: 0.03, wave: 'noise', q: 4, gain: 0.12 },
        { freq: 523 * j, dur: 0.2, wave: 'triangle', gain: 0.1, delay: 0.05 },
        { freq: 784 * j, dur: 0.3, wave: 'triangle', gain: 0.1, delay: 0.15 },
      ];
    case 'dig':
      return [0, 0.15, 0.3].map((d) => ({
        freq: 700 * j,
        to: 300 * j,
        dur: 0.09,
        wave: 'noise' as const,
        q: 1.5,
        gain: 0.12,
        delay: d,
      }));
    case 'orbit_whoosh':
      return [{ freq: 300 * j, to: 2400 * j, dur: 0.7, wave: 'noise', q: 3, gain: 0.12 }];
    case 'orbit_return':
      return [
        { freq: 2400 * j, to: 300 * j, dur: 0.6, wave: 'noise', q: 3, gain: 0.1 },
        { freq: 1319 * j, dur: 0.3, wave: 'sine', gain: 0.08, delay: 0.6 },
      ];
    case 'wubbo_pop':
      // Growing from tiny to bug size: a rising wobble, a pop, and a bubbly giggle.
      return [
        { freq: 200 * j, to: 900 * j, dur: 0.6, wave: 'sine', gain: 0.12, vibrato: { rate: 12, depth: 40 } },
        { freq: 600 * j, to: 200 * j, dur: 0.08, wave: 'square', gain: 0.08, delay: 0.6 },
        ...[0, 1, 2, 3].map((k) => ({
          freq: (300 + (k % 2) * 60) * j,
          dur: 0.09,
          wave: 'sine' as const,
          gain: 0.08,
          delay: 0.75 + k * 0.1,
          vibrato: { rate: 12, depth: 20 },
        })),
      ];
    case 'tiny_squeak':
      return [
        { freq: 2600 * j, to: 3400 * j, dur: 0.06, wave: 'sine', gain: 0.06 },
        { freq: 3000 * j, to: 3800 * j, dur: 0.05, wave: 'sine', gain: 0.05, delay: 0.09 },
      ];
    case 'proud_sigh':
      return [{ freq: 330 * j, to: 220 * j, dur: 0.6, wave: 'sine', gain: 0.07, formants: [600, 1000] }];
  }
}

/** Which events play which clue sounds. Returns the unsubscribers. */
export function clueSounds(
  bus: EventBus<GameEvents>,
  play: (name: ClueSfx, intensity?: number) => void,
): Array<() => void> {
  return [
    bus.on('boot_tipped', () => play('boot_glug')),
    bus.on('nook_opened', () => play('door_creak')),
    bus.on('frog_blinked', () => play('frog_croak', 0.6)),
    bus.on('frog_ribbited', () => play('frog_ribbit')),
    bus.on('frog_king', () => play('frog_king')),
    bus.on('mushroom_bounced', (e) => play('mushroom_boing', e.index + 1)),
    bus.on('mushroom_chord', () => play('mushroom_chord')),
    bus.on('regatta_won', () => play('reed_horn')),
    bus.on('rain_danced', () => play('rain_rumble')),
    bus.on('rainbow_caught', () => play('rainbow_fill')),
    bus.on('shadow_puppet', () => play('shadow_boo')),
    bus.on('moths_swirled', () => play('moth_flutter')),
    bus.on('marble_tune', () => play('xylo_tune')),
    bus.on('claw_spun', () => play('claw_spin')),
    bus.on('slide_souvenir', () => play('souvenir')),
    bus.on('window_tapped', () => play('window_tap')),
    bus.on('telescope_peeked', () => play('telescope_zoom')),
    bus.on('cloud_caught', () => play('cloud_catch')),
    bus.on('cloud_jar_opened', () => play('cloud_open')),
    bus.on('map_assembled', () => play('map_snap')),
    bus.on('clover_dug', () => play('dig')),
    bus.on('orbit_launched', () => play('orbit_whoosh')),
    bus.on('orbit_returned', () => play('orbit_return')),
    bus.on('twig_bridged', () => play('proud_sigh')),
    bus.on('moss_squeaked', () => play('tiny_squeak')),
    bus.on('wubbo_grew', () => play('wubbo_pop')),
  ];
}
