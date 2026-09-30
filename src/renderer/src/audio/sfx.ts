import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import type { AudioBackend, Tone } from './synth';

export type Material = 'wood' | 'metal' | 'rubber' | 'stone' | 'glass' | 'leaf' | 'food' | 'bug';

export type SfxName =
  | 'grab'
  | 'grab_bug'
  | 'drop'
  | 'fling'
  | `impact_${Material}`
  | 'dizzy'
  | 'poke'
  | 'spring'
  | 'nom'
  | 'chomp'
  | 'gag'
  | 'ptoo'
  | 'sneeze'
  | 'burp'
  | 'flame'
  | 'chill'
  | 'sparkle'
  | 'tickle'
  | 'wriggle'
  | 'shake'
  | 'swish'
  | 'pan'
  | 'scroll'
  | 'edge'
  | 'hover'
  | 'hop'
  | 'whistle'
  | 'ui_pop';

/** What a thing is made of, for impact and grab sounds. */
export interface MaterialLookup {
  /** Material of an item def. Bugs are 'bug'. */
  (kind: 'bug' | 'item', defId: string): Material;
}

/** Center frequency of the grab pop per material: hard things click higher. */
const GRAB_PITCH: Readonly<Record<Material, number>> = {
  wood: 700,
  metal: 1800,
  rubber: 500,
  stone: 1300,
  glass: 2600,
  leaf: 1200,
  food: 450,
  bug: 900,
};

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

  private material: MaterialLookup = (kind) => (kind === 'bug' ? 'bug' : 'wood');
  /** Tags of an item def, so hot food roars and cold food chimes. */
  private tagsOf: (defId: string) => readonly string[] = () => [];

  attach(
    bus: EventBus<GameEvents>,
    material?: MaterialLookup,
    tagsOf?: (itemDefId: string) => readonly string[],
  ): void {
    this.detach();
    if (material) this.material = material;
    if (tagsOf) this.tagsOf = tagsOf;
    this.unsubscribers = [
      bus.on('item_grabbed', (e) =>
        e.kind === 'bug' ? this.play('grab_bug') : this.play('grab', 1, this.material(e.kind, e.defId)),
      ),
      bus.on('item_dropped', (e) =>
        e.flung
          ? this.play('fling', Math.min(1, e.speed / 20))
          : this.play('drop', Math.min(1, e.speed / 20), this.material(e.kind, e.defId)),
      ),
      bus.on('bonked', (e) => this.bonk(e.speed, this.material(e.kind, e.defId))),
      bus.on('bug_dizzy', (e) => this.play('dizzy', e.durationTicks / 60)),
      bus.on('bug_poked', () => this.play('poke')),
      bus.on('item_poked', (e) => {
        this.play('poke');
        this.play(`impact_${this.material('item', e.defId)}`, 0.4);
      }),
      bus.on('spring_bounced', () => this.play('spring')),
      bus.on('bug_fed', (e) => (e.liking === 'disliked' ? this.play('gag') : this.play('nom'))),
      bus.on('bug_ate', (e) => {
        this.play('chomp');
        const tags = this.tagsOf(e.itemDefId);
        if (tags.includes('tag_hot')) this.play('flame');
        if (tags.includes('tag_cold')) this.play('chill');
      }),
      bus.on('bug_spat', (e) => this.play(this.tagsOf(e.itemDefId).includes('tag_cold') ? 'sneeze' : 'ptoo')),
      bus.on('bug_burped', () => this.play('burp')),
      bus.on('bug_reacted', (e) => {
        if (e.reaction === 'fed_loved') this.play('sparkle');
      }),
      bus.on('bug_tickled', (e) => this.play('tickle', e.level / 3)),
      bus.on('bug_wriggled_free', () => this.play('wriggle')),
      bus.on('item_shaken', () => this.play('shake')),
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

  private bonk(speed: number, material: Material): void {
    // Piles of things landing at once should not machine-gun.
    const t = this.now();
    if (t - this.lastBonk < 60) return;
    this.lastBonk = t;
    this.play(`impact_${material}`, Math.min(1, speed / 15));
  }

  /**
   * `intensity` scales loudness or, for dizzy, the loop length in seconds.
   * `material` tunes grab and drop sounds.
   */
  play(name: SfxName, intensity = 1, material: Material = 'wood'): void {
    const j = this.jitter();
    const v = 10 ** ((this.random() * 2 - 1) * 0.1); // about +-2 dB
    const tones: Tone[] = (() => {
      switch (name) {
        case 'grab': {
          const f = GRAB_PITCH[material];
          return [
            { freq: f * j, to: f * 0.55 * j, dur: 0.05, wave: 'noise', q: 3, gain: 0.35 },
            { freq: 520 * j, to: 880 * j, dur: 0.08, wave: 'triangle', gain: 0.25 },
          ];
        }
        case 'grab_bug':
          return [
            { freq: 900 * j, to: 500 * j, dur: 0.05, wave: 'noise', q: 3, gain: 0.3 },
            { freq: 700 * j, to: 1300 * j, dur: 0.07, wave: 'square', gain: 0.1 },
          ];
        case 'drop':
          return [
            { freq: 520 * j, to: 260 * j, dur: 0.1, wave: 'sine', gain: 0.25 },
            ...impact(material, j, 0.35),
          ];
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
        case 'impact_wood':
        case 'impact_metal':
        case 'impact_rubber':
        case 'impact_stone':
        case 'impact_glass':
        case 'impact_leaf':
        case 'impact_food':
        case 'impact_bug':
          return impact(name.slice(7) as Material, j, 0.3 + 0.7 * intensity);
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
        case 'nom':
          // Three chomps as the food goes in.
          return [0, 1, 2].map((i) => ({
            freq: 700 * j,
            to: 300 * j,
            dur: 0.06,
            wave: 'noise' as const,
            q: 2,
            gain: 0.3,
            delay: i * 0.3,
          }));
        case 'chomp':
          // The swallow: a gulp that drops.
          return [
            { freq: 420 * j, to: 140 * j, dur: 0.14, wave: 'sine', gain: 0.35 },
            { freq: 900 * j, to: 400 * j, dur: 0.05, wave: 'noise', q: 2, gain: 0.15 },
          ];
        case 'gag':
          // Hurk, hurk.
          return [0, 1].map((i) => ({
            freq: 230 * j,
            to: 140 * j,
            dur: 0.14,
            wave: 'sawtooth' as const,
            gain: 0.22,
            delay: i * 0.22,
            formants: [650, 1050] as const,
          }));
        case 'ptoo':
          return [
            { freq: 2600 * j, to: 1200 * j, dur: 0.06, wave: 'noise', q: 2, gain: 0.35 },
            { freq: 480 * j, to: 1300 * j, dur: 0.1, wave: 'sine', gain: 0.3, delay: 0.04 },
          ];
        case 'sneeze':
          // Ah... ah... CHOO.
          return [
            { freq: 380 * j, to: 560 * j, dur: 0.2, wave: 'triangle', gain: 0.18, formants: [800, 1200] },
            {
              freq: 420 * j,
              to: 680 * j,
              dur: 0.22,
              wave: 'triangle',
              gain: 0.2,
              delay: 0.3,
              formants: [800, 1200],
            },
            { freq: 4200 * j, to: 1500 * j, dur: 0.2, wave: 'noise', q: 1.2, gain: 0.45, delay: 0.62 },
          ];
        case 'burp':
          // A proper belch: low sawtooth with a wobbling vowel, 400 ms.
          return [
            {
              freq: 118 * j,
              to: 78 * j,
              dur: 0.42,
              wave: 'sawtooth',
              gain: 0.5,
              attack: 0.03,
              formants: [520, 900],
              vibrato: { rate: 24, depth: 14 },
            },
            { freq: 300 * j, to: 150 * j, dur: 0.08, wave: 'noise', q: 1, gain: 0.15 },
          ];
        case 'flame':
          return [
            { freq: 900 * j, to: 260 * j, dur: 0.6, wave: 'noise', q: 0.7, gain: 0.4, attack: 0.05 },
            { freq: 95 * j, to: 70 * j, dur: 0.5, wave: 'sawtooth', gain: 0.12 },
          ];
        case 'chill':
          return [
            ...[0, 1, 2].map((i) => ({
              freq: (2600 + i * 500) * j,
              to: (3000 + i * 500) * j,
              dur: 0.12,
              wave: 'sine' as const,
              gain: 0.1,
              delay: i * 0.07,
            })),
            { freq: 6000 * j, to: 4000 * j, dur: 0.35, wave: 'noise', q: 3, gain: 0.12 },
          ];
        case 'sparkle':
          // A rising three-note chime for a loved food.
          return [1320, 1760, 2640].map((f, i) => ({
            freq: f * j,
            dur: 0.22,
            wave: 'sine' as const,
            gain: 0.16,
            delay: i * 0.08,
          }));
        case 'tickle':
          return [0, 1, 2].map((i) => ({
            freq: 3200 * j,
            to: 2200 * j,
            dur: 0.05,
            wave: 'noise' as const,
            q: 4,
            gain: 0.1 + 0.1 * intensity,
            delay: i * 0.09,
          }));
        case 'wriggle':
          return [
            { freq: 500 * j, to: 1300 * j, dur: 0.12, wave: 'sine', gain: 0.28 },
            { freq: 1500 * j, to: 700 * j, dur: 0.04, wave: 'noise', q: 2, gain: 0.2, delay: 0.1 },
          ];
        case 'shake':
          // A rattle.
          return [0, 1, 2, 3, 4].map((i) => ({
            freq: (1700 + (i % 2) * 500) * j,
            dur: 0.04,
            wave: 'noise' as const,
            q: 3,
            gain: 0.2,
            delay: i * 0.055,
          }));
        case 'swish':
          return [
            { freq: 1100 * j, to: 2400 * j, dur: 0.12, wave: 'noise', q: 1.2, gain: 0.1 + 0.08 * intensity },
          ];
        case 'pan':
          return [{ freq: 700 * j, to: 480 * j, dur: 0.2, wave: 'noise', q: 0.8, gain: 0.07 }];
        case 'scroll':
          return [{ freq: 900 * j, to: 700 * j, dur: 0.07, wave: 'noise', q: 1, gain: 0.06 }];
        case 'edge':
          return [{ freq: 600 * j, to: 1800 * j, dur: 0.3, wave: 'noise', q: 1, gain: 0.1, attack: 0.08 }];
        case 'hover':
          return [{ freq: 2000 * j, dur: 0.02, wave: 'sine', gain: 0.05 }];
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

/**
 * Material-specific impacts (game design doc, section 15): wood knock,
 * metal clink, rubber boing, stone clack, glass tink, leaf rustle, food
 * squish, and a soft bug thud.
 */
function impact(material: Material, j: number, level: number): Tone[] {
  switch (material) {
    case 'wood':
      return [
        { freq: 300 * j, to: 240 * j, dur: 0.09, wave: 'triangle', gain: 0.4 * level },
        { freq: 1800 * j, to: 900 * j, dur: 0.03, wave: 'noise', q: 1.5, gain: 0.15 * level },
      ];
    case 'metal':
      // A little FM-ish bell: a fundamental and an inharmonic partial.
      return [
        { freq: 1250 * j, dur: 0.35, wave: 'sine', gain: 0.2 * level },
        { freq: 1250 * 3.5 * j, dur: 0.18, wave: 'sine', gain: 0.1 * level },
      ];
    case 'rubber':
      return [
        {
          freq: 320 * j,
          to: 130 * j,
          dur: 0.2,
          wave: 'sine',
          gain: 0.4 * level,
          vibrato: { rate: 22, depth: 18 },
        },
      ];
    case 'stone':
      return [
        { freq: 3600 * j, to: 2400 * j, dur: 0.05, wave: 'noise', q: 1, gain: 0.3 * level },
        { freq: 210 * j, to: 150 * j, dur: 0.05, wave: 'triangle', gain: 0.25 * level },
      ];
    case 'glass':
      return [
        { freq: 3000 * j, dur: 0.12, wave: 'sine', gain: 0.14 * level },
        { freq: 4500 * j, dur: 0.08, wave: 'sine', gain: 0.1 * level },
      ];
    case 'leaf':
      return [{ freq: 1900 * j, to: 1100 * j, dur: 0.08, wave: 'noise', q: 0.8, gain: 0.18 * level }];
    case 'food':
      return [
        { freq: 520 * j, to: 240 * j, dur: 0.12, wave: 'noise', q: 1.5, gain: 0.3 * level },
        {
          freq: 180 * j,
          to: 120 * j,
          dur: 0.12,
          wave: 'sine',
          gain: 0.2 * level,
          vibrato: { rate: 30, depth: 25 },
        },
      ];
    case 'bug':
      return [
        { freq: 190 * j, to: 70 * j, dur: 0.16, wave: 'sine', gain: 0.35 * level },
        { freq: 1400 * j, to: 600 * j, dur: 0.05, wave: 'noise', q: 1, gain: 0.15 * level },
      ];
  }
}
