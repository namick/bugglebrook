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
  | 'ui_pop'
  | 'splash'
  | 'plop'
  | 'plip'
  | 'tsss'
  | 'freeze'
  | 'thaw'
  | 'squelch'
  | 'pop'
  | 'clink'
  | 'bubble'
  | 'stink'
  | 'shake_dry'
  | 'click_on'
  | 'click_off'
  | 'blub'
  | 'squish'
  | 'bzzt'
  | 'trickle'
  | 'boop'
  | 'tag'
  | 'toss'
  | 'catch'
  | 'pat'
  | 'snore'
  | 'ta_da'
  | 'slide'
  | 'pick'
  | 'sniff'
  | 'crash'
  | 'curl'
  | 'pocket_in'
  | 'pocket_out'
  | 'ui_tick'
  | 'ui_open'
  | 'ui_close'
  | 'toggle_on'
  | 'toggle_off'
  | 'bin_shut'
  | 'whoosh_in';

/**
 * The impact sound for a material. Soft materials (cloth, paper) thud like
 * leaves; plastic bounces like rubber; jelly squishes like food; shell clacks
 * like stone.
 */
export function soundMaterial(material: string): Material {
  switch (material) {
    case 'mat_cloth':
    case 'mat_paper':
      return 'leaf';
    case 'mat_plastic':
      return 'rubber';
    case 'mat_jelly':
      return 'food';
    case 'mat_shell':
      return 'stone';
    default: {
      const m = material.slice(4);
      return (
        (['wood', 'metal', 'rubber', 'stone', 'glass', 'leaf', 'food'] as const).find((k) => k === m) ??
        'wood'
      );
    }
  }
}

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
      // Water and property rules.
      bus.on('splashed', (e) =>
        e.speed > 1.5 || e.size > 0.25
          ? this.play('splash', Math.min(1, 0.3 + e.speed / 10))
          : this.play('plop', 0.6),
      ),
      bus.on('skipped', () => this.play('plip')),
      bus.on('steamed', () => this.play('tsss')),
      bus.on('froze', () => this.play('freeze')),
      bus.on('ice_formed', () => this.play('freeze', 0.8)),
      bus.on('thawed', () => this.play('thaw')),
      bus.on('ice_melted', () => this.play('thaw', 0.6)),
      bus.on('stuck', () => this.play('squelch')),
      bus.on('unstuck', () => this.play('pop')),
      bus.on('magnet_snapped', () => this.play('clink')),
      bus.on('bubbles_blown', () => this.limited('bubble', 180, 0.6)),
      bus.on('bug_smelled', () => this.play('stink')),
      bus.on('bug_shook_dry', () => this.play('shake_dry')),
      bus.on('hose_toggled', (e) => this.play(e.on ? 'click_on' : 'click_off')),
      bus.on('boot_bubbled', () => this.play('blub')),
      bus.on('wrung_out', () => this.play('squish')),
      bus.on('water_zapped', () => this.play('bzzt')),
      bus.on('bug_bumped', () => this.play('boop')),
      bus.on('bug_tagged', () => this.play('tag')),
      bus.on('bug_threw', () => this.play('toss')),
      bus.on('bug_caught', () => this.play('catch')),
      bus.on('bug_comforted', () => this.play('pat')),
      bus.on('bug_posed', () => this.play('ta_da')),
      bus.on('bug_slipped', () => this.play('slide')),
      bus.on('bug_picked_up', () => this.limited('pick', 150, 0.6)),
      bus.on('bug_put_down', () => this.limited('pick', 150, 0.4)),
      bus.on('bug_snatched', () => this.play('swish')),
      bus.on('bug_inspected', () => this.play('sniff')),
      bus.on('bug_curled', (e) => (e.on ? this.play('curl') : undefined)),
      bus.on('stack_fell', () => this.play('crash')),
      bus.on('pocketed', () => this.play('pocket_in')),
      bus.on('unpocketed', () => this.play('pocket_out')),
      bus.on('pocket_swapped', () => this.play('pocket_out', 0.7)),
      bus.on('bug_beckoned', () => this.play('boop')),
    ];
  }

  private lastLimited = new Map<SfxName, number>();

  /** Play at most once per `ms`, for sounds that can come in floods. */
  private limited(name: SfxName, ms: number, intensity = 1): void {
    const t = this.now();
    if (t - (this.lastLimited.get(name) ?? -Infinity) < ms) return;
    this.lastLimited.set(name, t);
    this.play(name, intensity);
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
        case 'splash':
          // A noise burst through a band-pass that opens, then bubble blips.
          return [
            {
              freq: 500 * j,
              to: 2600 * j,
              dur: 0.18 + 0.15 * intensity,
              wave: 'noise',
              q: 0.8,
              gain: 0.45 * intensity,
            },
            {
              freq: 1400 * j,
              to: 500 * j,
              dur: 0.3,
              wave: 'noise',
              q: 1.5,
              gain: 0.18 * intensity,
              delay: 0.05,
            },
            ...[0.1, 0.17, 0.26].map((d, i) => ({
              freq: (420 + i * 160) * j,
              to: (820 + i * 200) * j,
              dur: 0.05,
              wave: 'sine' as const,
              gain: 0.18,
              delay: d,
            })),
          ];
        case 'plop':
          return [
            { freq: 950 * j, to: 320 * j, dur: 0.09, wave: 'sine', gain: 0.3 * intensity },
            { freq: 1800 * j, to: 900 * j, dur: 0.04, wave: 'noise', q: 2, gain: 0.12 * intensity },
          ];
        case 'plip':
          return [{ freq: 1500 * j, to: 750 * j, dur: 0.05, wave: 'sine', gain: 0.3 }];
        case 'tsss':
          return [
            { freq: 6500 * j, to: 3800 * j, dur: 0.65, wave: 'noise', q: 1.1, gain: 0.3, attack: 0.02 },
            { freq: 2200 * j, to: 1600 * j, dur: 0.3, wave: 'noise', q: 2, gain: 0.1 },
          ];
        case 'freeze':
          return [
            ...[0, 0.05, 0.11, 0.16].map((d) => ({
              freq: 4200 * j,
              to: 3000 * j,
              dur: 0.03,
              wave: 'noise' as const,
              q: 3,
              gain: 0.2 * intensity,
              delay: d,
            })),
            { freq: 1760 * j, dur: 0.45, wave: 'sine', gain: 0.12 * intensity, delay: 0.12 },
            { freq: 2640 * j, dur: 0.4, wave: 'sine', gain: 0.08 * intensity, delay: 0.16 },
          ];
        case 'thaw':
          return [
            { freq: 1300 * j, to: 600 * j, dur: 0.07, wave: 'sine', gain: 0.22 * intensity },
            { freq: 1100 * j, to: 500 * j, dur: 0.07, wave: 'sine', gain: 0.18 * intensity, delay: 0.16 },
          ];
        case 'squelch':
          return [
            { freq: 500 * j, to: 180 * j, dur: 0.14, wave: 'noise', q: 2, gain: 0.3 },
            {
              freq: 220 * j,
              to: 120 * j,
              dur: 0.15,
              wave: 'sine',
              gain: 0.22,
              vibrato: { rate: 28, depth: 30 },
            },
          ];
        case 'pop':
          return [{ freq: 700 * j, to: 1500 * j, dur: 0.04, wave: 'sine', gain: 0.2 * intensity }];
        case 'clink':
          return [
            { freq: 2100 * j, dur: 0.25, wave: 'sine', gain: 0.18 },
            { freq: 2100 * 2.7 * j, dur: 0.12, wave: 'sine', gain: 0.08 },
          ];
        case 'bubble':
          return [0, 0.06, 0.13].map((d, i) => ({
            freq: (560 + i * 140) * j,
            to: (980 + i * 120) * j,
            dur: 0.04,
            wave: 'sine' as const,
            gain: 0.1 * intensity,
            delay: d,
          }));
        case 'stink':
          // A little "pfff" and a low wobble.
          return [
            { freq: 320 * j, to: 140 * j, dur: 0.3, wave: 'noise', q: 0.7, gain: 0.25 },
            {
              freq: 95 * j,
              to: 80 * j,
              dur: 0.25,
              wave: 'sawtooth',
              gain: 0.08,
              vibrato: { rate: 18, depth: 12 },
            },
          ];
        case 'shake_dry':
          // "Brrrr": a quick run of spray flicks.
          return Array.from({ length: 7 }, (_, i) => ({
            freq: (2600 - i * 120) * j,
            to: (1400 - i * 60) * j,
            dur: 0.045,
            wave: 'noise' as const,
            q: 1.3,
            gain: 0.2,
            delay: i * 0.055,
          }));
        case 'click_on':
          return [
            { freq: 1400 * j, dur: 0.03, wave: 'square', gain: 0.12 },
            { freq: 2100 * j, dur: 0.04, wave: 'square', gain: 0.1, delay: 0.05 },
          ];
        case 'click_off':
          return [
            { freq: 2100 * j, dur: 0.03, wave: 'square', gain: 0.1 },
            { freq: 1200 * j, dur: 0.04, wave: 'square', gain: 0.12, delay: 0.05 },
          ];
        case 'blub':
          return [0, 0.08, 0.15, 0.25, 0.31].map((d, i) => ({
            freq: (260 + (i % 3) * 90) * j,
            to: (520 + (i % 2) * 140) * j,
            dur: 0.06,
            wave: 'sine' as const,
            gain: 0.22,
            delay: d,
          }));
        case 'squish':
          return [
            { freq: 900 * j, to: 260 * j, dur: 0.22, wave: 'noise', q: 1.4, gain: 0.3 },
            { freq: 1200 * j, to: 600 * j, dur: 0.06, wave: 'sine', gain: 0.15, delay: 0.2 },
          ];
        case 'bzzt':
          return [
            { freq: 110 * j, dur: 0.35, wave: 'square', gain: 0.12, vibrato: { rate: 45, depth: 30 } },
            { freq: 5000 * j, to: 3000 * j, dur: 0.3, wave: 'noise', q: 2, gain: 0.12 },
          ];
        case 'boop':
          // Two heads meet: a soft rising blip and a tiny knock.
          return [
            { freq: 420 * j, to: 780 * j, dur: 0.12, wave: 'sine', gain: 0.32 },
            { freq: 900 * j, to: 500 * j, dur: 0.04, wave: 'noise', q: 4, gain: 0.15 },
          ];
        case 'tag':
          return [
            { freq: 880 * j, to: 1320 * j, dur: 0.07, wave: 'square', gain: 0.1 },
            { freq: 1320 * j, to: 1760 * j, dur: 0.07, wave: 'square', gain: 0.1, delay: 0.08 },
          ];
        case 'toss':
          return [{ freq: 1800 * j, to: 600 * j, dur: 0.16, wave: 'noise', q: 2, gain: 0.18, attack: 0.03 }];
        case 'catch':
          return [
            { freq: 300 * j, to: 180 * j, dur: 0.05, wave: 'noise', q: 3, gain: 0.25 },
            { freq: 660 * j, to: 990 * j, dur: 0.1, wave: 'triangle', gain: 0.2, delay: 0.03 },
          ];
        case 'pat':
          return [0, 0.16, 0.32].map((delay) => ({
            freq: 260 * j,
            to: 180 * j,
            dur: 0.06,
            wave: 'noise' as const,
            q: 2,
            gain: 0.18,
            delay,
          }));
        case 'snore':
          // A soft, low, breathy snore.
          return [
            {
              freq: 300 * j,
              to: 180 * j,
              dur: 0.55,
              wave: 'noise',
              q: 3,
              gain: 0.07 * intensity,
              attack: 0.2,
            },
            { freq: 90 * j, to: 70 * j, dur: 0.5, wave: 'sine', gain: 0.05 * intensity, attack: 0.2 },
          ];
        case 'ta_da':
          return [523, 659, 784].map((f, i) => ({
            freq: f * j,
            to: f * j,
            dur: i === 2 ? 0.3 : 0.1,
            wave: 'triangle' as const,
            gain: 0.18,
            delay: i * 0.1,
          }));
        case 'slide':
          return [
            {
              freq: 300 * j,
              to: 900 * j,
              dur: 0.35,
              wave: 'sine',
              gain: 0.18,
              vibrato: { rate: 18, depth: 40 },
            },
          ];
        case 'pick':
          return [{ freq: 700 * j, to: 1000 * j, dur: 0.05, wave: 'triangle', gain: 0.18 * intensity }];
        case 'pocket_in':
          // A denim "fwup" and a button click: tucked away.
          return [
            { freq: 1800 * j, to: 500 * j, dur: 0.14, wave: 'noise', q: 1.2, gain: 0.3 },
            { freq: 660 * j, to: 330 * j, dur: 0.12, wave: 'triangle', gain: 0.22, delay: 0.04 },
            { freq: 1400 * j, dur: 0.03, wave: 'square', gain: 0.08, delay: 0.14 },
          ];
        case 'pocket_out':
          return [
            { freq: 500 * j, to: 1900 * j, dur: 0.12, wave: 'noise', q: 1.2, gain: 0.26 * intensity },
            { freq: 360 * j, to: 820 * j, dur: 0.12, wave: 'triangle', gain: 0.22 * intensity },
          ];
        case 'ui_tick':
          // Pitched by the slider's value (intensity 0 to 1), so you hear the level.
          return [{ freq: 500 + 700 * intensity, dur: 0.04, wave: 'sine', gain: 0.1 + 0.25 * intensity }];
        case 'ui_open':
          return [
            { freq: 300 * j, to: 700 * j, dur: 0.16, wave: 'triangle', gain: 0.22 },
            { freq: 900 * j, to: 1200 * j, dur: 0.1, wave: 'sine', gain: 0.15, delay: 0.12 },
          ];
        case 'ui_close':
          return [{ freq: 800 * j, to: 300 * j, dur: 0.16, wave: 'triangle', gain: 0.2 }];
        case 'toggle_on':
          return [
            { freq: 700 * j, dur: 0.05, wave: 'square', gain: 0.1 },
            { freq: 1050 * j, dur: 0.07, wave: 'sine', gain: 0.22, delay: 0.05 },
          ];
        case 'toggle_off':
          return [
            { freq: 1050 * j, dur: 0.05, wave: 'square', gain: 0.1 },
            { freq: 620 * j, dur: 0.07, wave: 'sine', gain: 0.2, delay: 0.05 },
          ];
        case 'bin_shut':
          // Clunk, then a squelchy settle.
          return [
            { freq: 180 * j, to: 60 * j, dur: 0.2, wave: 'triangle', gain: 0.45 },
            { freq: 900 * j, to: 200 * j, dur: 0.1, wave: 'noise', q: 2, gain: 0.3 },
            { freq: 400 * j, to: 160 * j, dur: 0.25, wave: 'noise', q: 4, gain: 0.2, delay: 0.12 },
          ];
        case 'whoosh_in':
          return [{ freq: 300, to: 1600, dur: 0.5, wave: 'noise', q: 0.8, gain: 0.16, attack: 0.3 }];
        case 'sniff':
          return [0, 0.12].map((delay) => ({
            freq: 3200 * j,
            to: 2400 * j,
            dur: 0.07,
            wave: 'noise' as const,
            q: 3,
            gain: 0.1,
            delay,
          }));
        case 'crash':
          return [
            { freq: 400 * j, to: 120 * j, dur: 0.3, wave: 'noise', q: 1, gain: 0.35 },
            { freq: 160 * j, to: 60 * j, dur: 0.25, wave: 'sine', gain: 0.3 },
          ];
        case 'curl':
          return [{ freq: 500 * j, to: 250 * j, dur: 0.14, wave: 'triangle', gain: 0.22 }];
        case 'trickle':
          return [
            { freq: 3200 * j, to: 2200 * j, dur: 0.12, wave: 'noise', q: 3, gain: 0.07 * intensity },
            { freq: 900 * j, to: 1300 * j, dur: 0.03, wave: 'sine', gain: 0.04 * intensity, delay: 0.05 },
          ];
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
