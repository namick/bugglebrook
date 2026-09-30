import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import type { AudioBackend, Tone } from './synth';

export type SfxName = 'grab' | 'grab_bug' | 'drop' | 'fling' | 'bonk' | 'dizzy' | 'ui_pop';

/**
 * Maps game events to synthesized sound effects. Pitch jitter uses a
 * render-side random source; it never touches sim state.
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
      bus.on('item_dropped', (e) => this.play(e.speed > 8 ? 'fling' : 'drop')),
      bus.on('bonked', (e) => this.bonk(e.speed)),
      bus.on('bug_dizzy', () => this.play('dizzy')),
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

  play(name: SfxName, intensity = 1): void {
    const j = this.jitter();
    const table: Record<SfxName, Tone[]> = {
      grab: [{ freq: 520 * j, to: 880 * j, dur: 0.09, wave: 'triangle', gain: 0.35 }],
      grab_bug: [
        { freq: 700 * j, to: 1300 * j, dur: 0.07, wave: 'square', gain: 0.12 },
        { freq: 1100 * j, to: 900 * j, dur: 0.08, wave: 'square', gain: 0.1, delay: 0.08 },
      ],
      drop: [{ freq: 660 * j, to: 300 * j, dur: 0.12, wave: 'sine', gain: 0.35 }],
      fling: [{ freq: 380 * j, to: 1500 * j, dur: 0.28, wave: 'triangle', gain: 0.3 }],
      bonk: [{ freq: 190 * j, to: 80 * j, dur: 0.18, wave: 'sine', gain: 0.25 + 0.35 * intensity }],
      dizzy: [0, 1, 2].map((i) => ({
        freq: 900 - i * 120,
        to: 700 - i * 120,
        dur: 0.1,
        wave: 'triangle' as const,
        gain: 0.2,
        delay: i * 0.1,
      })),
      ui_pop: [{ freq: 900 * j, to: 1500 * j, dur: 0.06, wave: 'sine', gain: 0.35 }],
    };
    for (const tone of table[name]) this.backend.play(tone);
    this.log.push(name);
    if (this.log.length > 50) this.log.shift();
  }
}
