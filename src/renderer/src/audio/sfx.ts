import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import type { AudioBackend, Tone } from './synth';

export type SfxName =
  | 'grab'
  | 'grab_bug'
  | 'drop'
  | 'fling'
  | 'bonk'
  | 'dizzy'
  | 'poke'
  | 'spring'
  | 'chomp'
  | 'hop'
  | 'whistle'
  | 'ui_pop';

/**
 * Maps game events to synthesized sound effects (game design doc, section
 * 15). Every sound gets a little random pitch and volume so repeats do not
 * sound canned. Randomness is render-side; it never touches sim state.
 */
export class Sfx {
  /** Recent sound names, newest last. The test hook reads this. */
  readonly log: SfxName[] = [];
  private lastBonk = -Infinity;
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly backend: AudioBackend,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = () => performance.now(),
  ) {}

  attach(bus: EventBus<GameEvents>): void {
    this.detach();
    this.unsubscribers = [
      bus.on('item_grabbed', (e) => this.play(e.kind === 'bug' ? 'grab_bug' : 'grab')),
      bus.on('item_dropped', (e) => this.play(e.flung ? 'fling' : 'drop', Math.min(1, e.speed / 20))),
      bus.on('bonked', (e) => this.bonk(e.speed)),
      bus.on('bug_dizzy', (e) => this.play('dizzy', e.durationTicks / 60)),
      bus.on('bug_poked', () => this.play('poke')),
      bus.on('item_poked', () => this.play('poke')),
      bus.on('spring_bounced', () => this.play('spring')),
      bus.on('bug_ate', () => this.play('chomp')),
      bus.on('bug_hopped', () => this.play('hop')),
      bus.on('item_respawned', () => this.play('whistle')),
    ];
  }

  detach(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
  }

  private jitter(amount = 0.08): number {
    return 1 + (this.random() * 2 - 1) * amount;
  }

  private bonk(speed: number): void {
    // Piles of things landing at once should not machine-gun.
    const t = this.now();
    if (t - this.lastBonk < 60) return;
    this.lastBonk = t;
    this.play('bonk', Math.min(1, speed / 15));
  }

  /** `intensity` scales loudness or, for dizzy, the loop length in seconds. */
  play(name: SfxName, intensity = 1): void {
    const j = this.jitter();
    const v = 10 ** ((this.random() * 2 - 1) * 0.1); // about +-2 dB
    const tones: Tone[] = (() => {
      switch (name) {
        case 'grab':
          return [
            { freq: 900 * j, to: 500 * j, dur: 0.05, wave: 'noise', q: 3, gain: 0.35 },
            { freq: 520 * j, to: 880 * j, dur: 0.08, wave: 'triangle', gain: 0.25 },
          ];
        case 'grab_bug':
          return [
            { freq: 900 * j, to: 500 * j, dur: 0.05, wave: 'noise', q: 3, gain: 0.3 },
            { freq: 700 * j, to: 1300 * j, dur: 0.07, wave: 'square', gain: 0.1 },
          ];
        case 'drop':
          return [{ freq: 520 * j, to: 260 * j, dur: 0.1, wave: 'sine', gain: 0.3 }];
        case 'fling':
          // Whoosh: noise through a falling band-pass, longer for harder throws.
          return [
            {
              freq: 2400 * j,
              to: 400 * j,
              dur: 0.18 + 0.2 * intensity,
              wave: 'noise',
              q: 2,
              gain: 0.25 + 0.2 * intensity,
              attack: 0.04,
            },
          ];
        case 'bonk':
          return [
            { freq: 190 * j, to: 70 * j, dur: 0.16, wave: 'sine', gain: 0.25 + 0.35 * intensity },
            { freq: 1400 * j, to: 600 * j, dur: 0.05, wave: 'noise', q: 1, gain: 0.15 * intensity },
          ];
        case 'dizzy': {
          // Little bird tweets circling for as long as the dizzy spell lasts.
          const n = Math.max(3, Math.min(16, Math.round(intensity * 2.5)));
          return Array.from({ length: n }, (_, i) => ({
            freq: (2400 + (i % 3) * 300) * j,
            to: (3200 + (i % 2) * 400) * j,
            dur: 0.07,
            wave: 'sine' as const,
            gain: 0.12,
            delay: i * 0.38 + (i % 2) * 0.09,
          }));
        }
        case 'poke':
          return [{ freq: 600 * j, to: 900 * j, dur: 0.09, wave: 'sine', gain: 0.35 }];
        case 'spring':
          return [
            {
              freq: 180 * j,
              to: 720 * j,
              dur: 0.22,
              wave: 'sine',
              gain: 0.35,
              vibrato: { rate: 30, depth: 60 },
            },
            { freq: 360 * j, to: 1400 * j, dur: 0.18, wave: 'triangle', gain: 0.12 },
          ];
        case 'chomp':
          return [0, 1, 2].map((i) => ({
            freq: 700 * j,
            to: 300 * j,
            dur: 0.06,
            wave: 'noise' as const,
            q: 2,
            gain: 0.3,
            delay: i * 0.16,
          }));
        case 'hop':
          return [{ freq: 300 * j, to: 620 * j, dur: 0.1, wave: 'triangle', gain: 0.18 }];
        case 'whistle':
          return [
            {
              freq: 1500 * j,
              to: 400 * j,
              dur: 0.7,
              wave: 'sine',
              gain: 0.18,
              vibrato: { rate: 7, depth: 20 },
            },
          ];
        case 'ui_pop':
          return [{ freq: 900 * j, to: 1500 * j, dur: 0.06, wave: 'sine', gain: 0.35 }];
      }
    })();
    for (const tone of tones) this.backend.play({ ...tone, gain: (tone.gain ?? 0.3) * v, bus: 'sfx' });
    this.log.push(name);
    if (this.log.length > 50) this.log.shift();
  }
}
