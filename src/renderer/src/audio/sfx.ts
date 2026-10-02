import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import { craftTones, noteTones, type CraftSfx } from './craftSfx';
import { isTidySfx, tidyTones, type TidySfx } from './tidySfx';
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
  | 'whoosh_in'
  | 'dial'
  | 'dial_done'
  | 'rain'
  | 'wind'
  | 'cricket'
  | 'vane'
  | 'gust'
  | 'secret'
  | 'stamp'
  | 'twinkle'
  | 'knock'
  | 'blink'
  | 'light_on'
  | 'light_off'
  | 'slurp'
  | 'unlock'
  | 'creak'
  | 'latch'
  | 'lift'
  | 'bell'
  | 'paint'
  | 'knock_back'
  | 'rustle'
  | 'hum'
  | 'web'
  | 'jar'
  // M11, photo mode: the camera coming out and going away, the shutter, stickers.
  | 'camera_open'
  | 'camera_close'
  | 'shutter'
  | 'sticker_peel'
  | 'sticker_stick'
  | 'snap'
  | 'claw'
  | 'domino'
  | 'stink_puff'
  | 'chop'
  | 'nibble'
  | 'cocoon'
  | 'freed'
  | 'band'
  | 'stage'
  | 'bee_hum'
  | 'birdsong'
  | 'board_patter'
  | 'drip'
  | 'bubble_blorp'
  | 'steam_hiss'
  | 'arcade_blip'
  | 'leaf_rustle'
  | 'scratch'
  | 'tulip_hum'
  | 'peek_twig'
  // M8: the bench's lever and the cauldron's ladle (gestures), and crafting and potions.
  | 'lever'
  | 'stir'
  | CraftSfx
  // Playtest F1 and F2: the trash can and the tidy whistle.
  | TidySfx;

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
    case 'mat_junk':
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

/** What a failed craft sounds like, by the junk it made. */
const FAIL_SOUND: Readonly<Record<GameEvents['bench_failed']['kind'], SfxName>> = {
  sticky: 'slurp',
  smelly: 'fail_raspberry',
  bouncy: 'fail_boing',
  food: 'chomp_burp',
  plain: 'sad_squeak',
};

const BURP_SOUND: Readonly<Record<GameEvents['potion_burped']['kind'], SfxName>> = {
  burp: 'burp',
  fire: 'flame',
  bubble: 'bubble_burp',
  sludge: 'sludge_burp',
};

const TOY_SOUND: Readonly<Record<GameEvents['toy_used']['action'], SfxName>> = {
  fire: 'twang',
  launch: 'toy_whoosh',
  boing: 'boing',
  inflate: 'air_hiss',
  deflate: 'air_hiss',
  hang: 'tinkle',
  attach: 'tie_zip',
  fling: 'thwack',
};

/** The sound of a potion taking hold. */
export function startSound(effect: GameEvents['potion_started']['effect']): SfxName {
  switch (effect) {
    case 'giant':
      return 'grow';
    case 'tiny':
      return 'shrink';
    case 'floaty':
    case 'balloon':
      return 'float_up';
    case 'glow':
      return 'potion_twinkle';
    default:
      return 'potion_whoosh';
  }
}

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
      bus.on('entity_returned', () => this.play('whistle')),
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
      // Day, night, and weather (M6).
      bus.on('vane_spun', () => this.play('vane')),
      bus.on('gust_started', () => this.play('gust')),
      bus.on('time_skipped', () => this.play('dial_done')),
      bus.on('sun_clicked', (e) => this.play('twinkle', 0.3 + e.count * 0.1)),
      bus.on('knothole_peeked', (e) => this.play(e.night ? 'blink' : 'knock')),
      bus.on('shooting_star', () => this.play('twinkle', 1)),
      bus.on('light_toggled', (e) => this.play(e.on ? 'light_on' : 'light_off')),
      bus.on('fireflies_blinked', (e) => this.play('blink', e.answer ? 1 : 0.5)),
      bus.on('secret_found', () => this.play('secret')),
      bus.on('bug_joined', () => this.play('ta_da')),
      bus.on('item_transformed', () => this.play('twinkle', 1)),
      bus.on('bug_umbrella', (e) => this.limited('pick', 150, e.on ? 0.7 : 0.4)),
      // M7: the new areas and bugs.
      bus.on('sunflower_drank', () => this.play('slurp')),
      bus.on('area_unlocked', () => this.play('unlock')),
      bus.on('tunnel_rolled', (e) => this.play(e.fits ? 'latch' : 'clink')),
      bus.on('lift_moved', (e) => this.play(e.phase === 'top' ? 'pop' : 'lift')),
      bus.on('stage_lights_changed', () => this.play('stage')),
      bus.on('speaker_toggled', () => this.play('bell')),
      bus.on('painted', () => this.limited('paint', 200)),
      bus.on('gnome_knocked', () => this.play('knock')),
      bus.on('gnome_answered', () => this.play('knock_back')),
      bus.on('hideout_stirred', (e) =>
        this.limited(
          e.fixture === 'fix_tulip' ? 'hum' : e.fixture === 'fix_can_tunnel' ? 'scratch' : 'rustle',
          300,
          0.7,
        ),
      ),
      bus.on('band_played', () => this.play('band')),
      bus.on('lamp_toggled', (e) => this.play(e.on ? 'light_on' : 'light_off')),
      bus.on('floor_dropped', () => this.play('plip')),
      bus.on('web_caught', (e) => {
        if (e.on) this.limited('web', 200);
      }),
      bus.on('spider_waved', () => this.play('twinkle', 1)),
      bus.on('jar_refilled', () => this.limited('jar', 300)),
      bus.on('track_snapped', (e) => this.play(e.on ? 'snap' : 'pick')),
      bus.on('claw_moved', (e) =>
        this.play(e.phase === 'prize' ? 'ta_da' : e.phase === 'miss' ? 'clink' : 'claw'),
      ),
      bus.on('dominoes_fell', () => this.play('domino')),
      bus.on('stink_cloud', () => this.play('stink_puff')),
      bus.on('bug_freed', () => this.play('freed')),
      bus.on('bug_nibbled', () => this.limited('nibble', 150)),
      bus.on('bug_changed', (e) => this.play(e.form === 'cocoon' ? 'cocoon' : 'twinkle', 1)),
      bus.on('bug_chopped', () => this.play('chop')),
      bus.on('bug_blinked', () => this.play('peek_twig')),
      // M8: the Tinker Bench, the cauldron, potions, and crafted toys.
      bus.on('tray_filled', () => this.limited('tray_clink', 80)),
      bus.on('tray_emptied', () => this.limited('tray_out', 80)),
      bus.on('bench_pulled', (e) => {
        if (e.empty) return this.play('bench_clunk');
        this.play('hammer', e.strong ? 1 : 0.4);
        this.play('bench_rattle', e.strong ? 1 : 0.4);
      }),
      bus.on('crafted', (e) => {
        this.play('craft_pop');
        this.play('craft_tada', e.first ? 1 : 0.6);
      }),
      bus.on('uncrafted', () => this.play('uncraft')),
      bus.on('bench_failed', (e) => this.play(FAIL_SOUND[e.kind])),
      bus.on('bench_shrugged', () => this.play('shrug')),
      bus.on('bench_refused', () => this.play('refuse')),
      bus.on('bench_hinted', () => this.limited('shimmer', 400)),
      bus.on('bench_nudged', () => this.limited('nudge', 400)),
      bus.on('blueprint_found', () => this.play('blueprint')),
      bus.on('bug_wished', () => this.limited('wish', 1500, 0.7)),
      bus.on('blob_split', () => this.play('blob_split')),
      bus.on('blob_squeaked', () => this.limited('blob_squeak', 120)),
      bus.on('cauldron_added', (e) => this.play('cauldron_plop', e.count)),
      bus.on('cauldron_full', () => this.limited('cauldron_full', 200)),
      bus.on('cauldron_stirred', () => this.limited('slosh', 150)),
      bus.on('cauldron_bubbled', () => this.play('brew_bubble')),
      bus.on('potion_brewed', (e) => {
        this.play('cork_pop');
        if (e.triple) this.play('fanfare');
      }),
      bus.on('cauldron_tipped', () => this.play('pour')),
      bus.on('potion_drunk', () => this.play('gulp')),
      bus.on('potion_shattered', () => this.play('smash')),
      bus.on('potion_started', (e) => this.limited(startSound(e.effect), 120)),
      bus.on('potion_ended', () => this.limited('poof', 120, 0.7)),
      bus.on('potion_fizzled', () => this.play('fizzle')),
      bus.on('potion_burped', (e) => this.play(BURP_SOUND[e.kind])),
      bus.on('giant_stomped', (e) => this.limited('stomp', 180, e.heavy ? 1 : 0.6)),
      bus.on('frost_sneezed', () => this.limited('achoo', 300)),
      bus.on('balloon_deflated', () => this.play('deflate')),
      bus.on('shattered', () => this.limited('shatter', 100)),
      bus.on('toasted', () => this.limited('sizzle', 250)),
      // With the music toys running (M9), they play notes on the beat; this only logs them.
      bus.on('note_played', (e) =>
        this.toysPlayNotes ? this.logOnly('note') : this.playNote(e.defId, e.note),
      ),
      bus.on('toy_used', (e) => this.limited(TOY_SOUND[e.action], 100)),
      bus.on('scope_viewed', () => this.play('scope')),
      // Playtest F1 and F2: the trash can and tidying up.
      bus.on('trash_chomped', () => this.limited('trash_chomp', 120)),
      bus.on('trash_burped', (e) => this.play('trash_burp', e.size)),
      bus.on('trash_spat', (e) => this.play(e.why === 'hiccup' ? 'trash_hiccup' : 'trash_spit')),
      bus.on('trash_poked', () => this.play('trash_clack')),
      bus.on('trash_rummaged', () => this.play('trash_rummage')),
      bus.on('item_came_home', () => this.limited('came_home', 150, 0.7)),
      bus.on('whistle_blown', () => {
        this.swooshes = 0;
        this.play('whistle_toot');
      }),
      bus.on('item_tidied', (e) => {
        if (e.cause === 'drift') return;
        this.limited('tidy_swoosh', 40, this.swooshes++);
      }),
      bus.on('litter_nudged', () => this.limited('litter_skitter', 200, 0.6)),
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
  /** Background sounds (rain, wind, crickets): played like any other, but kept out of the log. */
  ambient(name: SfxName, intensity = 1): void {
    this.play(name, intensity, 'wood', false);
  }

  play(name: SfxName, intensity = 1, material: Material = 'wood', log = true): void {
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
        case 'dial':
          // A stone ratchet: a dry little click per notch.
          return [
            { freq: 1500 * j, to: 900 * j, dur: 0.03, wave: 'noise', q: 6, gain: 0.18 * intensity },
            { freq: 320 * j, to: 260 * j, dur: 0.04, wave: 'triangle', gain: 0.08 * intensity },
          ];
        case 'lever':
          // The clothespin lever snaps down: a woody clack and a spring's boing.
          return [
            { freq: 900 * j, to: 300 * j, dur: 0.05, wave: 'noise', q: 5, gain: 0.2 },
            { freq: 180 * j, to: 360 * j, dur: 0.22, wave: 'triangle', gain: 0.12, delay: 0.03 },
          ];
        case 'stir':
          // A slosh round the pot.
          return [{ freq: 500 * j, to: 260 * j, dur: 0.26, wave: 'noise', q: 2, gain: 0.08 * intensity }];
        case 'dial_done':
          return [
            { freq: 660 * j, dur: 0.12, wave: 'sine', gain: 0.14 },
            { freq: 990 * j, dur: 0.18, wave: 'sine', gain: 0.12, delay: 0.09 },
          ];
        case 'rain':
          // One soft patter: a few tiny ticks of high noise.
          return [0, 1, 2].map((k) => ({
            freq: (2600 + this.random() * 3400) * j,
            dur: 0.02 + this.random() * 0.02,
            wave: 'noise' as const,
            q: 5,
            gain: 0.03 * intensity,
            delay: k * (0.02 + this.random() * 0.04),
          }));
        case 'wind':
          return [
            {
              freq: 300 * j,
              to: 900 * j,
              dur: 1.6,
              wave: 'noise',
              q: 1.2,
              gain: 0.1 * intensity,
              attack: 0.6,
            },
          ];
        case 'gust':
          return [
            { freq: 250 * j, to: 1400 * j, dur: 1.2, wave: 'noise', q: 1.5, gain: 0.22, attack: 0.3 },
            {
              freq: 1400 * j,
              to: 500 * j,
              dur: 1.4,
              wave: 'noise',
              q: 1.5,
              gain: 0.16,
              attack: 0.2,
              delay: 1,
            },
          ];
        case 'cricket':
          // Crickets: a quick triple chirp.
          return [0, 1, 2].map((k) => ({
            freq: 4300 * j,
            to: 4100 * j,
            dur: 0.035,
            wave: 'sine' as const,
            gain: 0.025 * intensity,
            delay: k * 0.07,
            vibrato: { rate: 60, depth: 80 },
          }));
        case 'vane':
          // A creaky spoon swinging round.
          return [
            {
              freq: 520 * j,
              to: 780 * j,
              dur: 0.22,
              wave: 'triangle',
              gain: 0.12,
              vibrato: { rate: 30, depth: 25 },
            },
            { freq: 2200 * j, to: 1600 * j, dur: 0.05, wave: 'noise', q: 8, gain: 0.08, delay: 0.2 },
          ];
        case 'secret':
          // A little magic arpeggio.
          return [523, 659, 784, 1047, 1319].map((f, k) => ({
            freq: f * j,
            dur: 0.28,
            wave: 'sine' as const,
            gain: 0.12,
            delay: k * 0.08,
          }));
        case 'stamp':
          // An ink stamp hitting paper: a soft low thump and a papery tap.
          return [
            { freq: 160 * j, to: 70 * j, dur: 0.09, wave: 'sine', gain: 0.3 },
            { freq: 1800 * j, to: 900 * j, dur: 0.04, wave: 'noise', q: 2, gain: 0.12 },
          ];
        case 'twinkle':
          return [
            { freq: 1760 * j, to: 2640 * j, dur: 0.18, wave: 'sine', gain: 0.1 * intensity },
            { freq: 2640 * j, to: 3520 * j, dur: 0.2, wave: 'sine', gain: 0.07 * intensity, delay: 0.1 },
          ];
        case 'knock':
          return [
            { freq: 240 * j, to: 180 * j, dur: 0.07, wave: 'triangle', gain: 0.3 },
            { freq: 240 * j, to: 180 * j, dur: 0.07, wave: 'triangle', gain: 0.25, delay: 0.14 },
          ];
        case 'blink':
          return [
            { freq: 1200 * j, to: 1600 * j, dur: 0.06, wave: 'sine', gain: 0.1 * intensity },
            { freq: 1600 * j, to: 1200 * j, dur: 0.06, wave: 'sine', gain: 0.08 * intensity, delay: 0.12 },
          ];
        case 'light_on':
          return [{ freq: 1800 * j, to: 900 * j, dur: 0.04, wave: 'square', gain: 0.1 }];
        case 'light_off':
          return [{ freq: 900 * j, to: 500 * j, dur: 0.04, wave: 'square', gain: 0.08 }];
        // --- M7 ---------------------------------------------------------------
        case 'slurp':
          // The sunflower drinks: a long gurgly slurp rising, then a happy pop.
          return [
            {
              freq: 400 * j,
              to: 1400 * j,
              dur: 0.5,
              wave: 'noise',
              q: 6,
              gain: 0.18,
              vibrato: { rate: 18, depth: 120 },
            },
            {
              freq: 300 * j,
              to: 900 * j,
              dur: 0.45,
              wave: 'sine',
              gain: 0.12,
              vibrato: { rate: 14, depth: 40 },
            },
            { freq: 880 * j, to: 1320 * j, dur: 0.12, wave: 'triangle', gain: 0.15, delay: 0.55 },
          ];
        case 'unlock':
          // A new place: a bright rising chord with a shimmer.
          return [392, 523, 659, 784, 1047].map((f, k) => ({
            freq: f * j,
            dur: 0.5 - k * 0.04,
            wave: (k % 2 ? 'sine' : 'triangle') as 'sine' | 'triangle',
            gain: 0.12,
            delay: k * 0.07,
          }));
        case 'creak':
          return [
            {
              freq: 180 * j,
              to: 140 * j,
              dur: 0.35,
              wave: 'sawtooth',
              gain: 0.05 * intensity,
              vibrato: { rate: 30, depth: 20 },
            },
          ];
        case 'latch':
          return [
            { freq: 2200 * j, to: 1600 * j, dur: 0.05, wave: 'square', gain: 0.12 },
            { freq: 300 * j, to: 200 * j, dur: 0.18, wave: 'triangle', gain: 0.25, delay: 0.06 },
            {
              freq: 140 * j,
              to: 110 * j,
              dur: 0.5,
              wave: 'sawtooth',
              gain: 0.08,
              delay: 0.2,
              vibrato: { rate: 20, depth: 10 },
            },
          ];
        case 'lift':
          // The pulley squeaks round.
          return [0, 1, 2].map((k) => ({
            freq: 900 * j,
            to: 1100 * j,
            dur: 0.08,
            wave: 'sine' as const,
            gain: 0.06 * intensity,
            delay: k * 0.18,
          }));
        case 'bell':
          return [
            {
              freq: 660 * j,
              to: 640 * j,
              dur: 0.5,
              wave: 'sine',
              gain: 0.14,
              vibrato: { rate: 6, depth: 8 },
            },
            { freq: 1320 * j, dur: 0.3, wave: 'sine', gain: 0.05 },
          ];
        case 'paint':
          return [
            { freq: 300 * j, to: 700 * j, dur: 0.16, wave: 'noise', q: 8, gain: 0.2 },
            { freq: 500 * j, to: 260 * j, dur: 0.12, wave: 'sine', gain: 0.12 },
          ];
        case 'knock_back':
          // Hollow knocks from inside the gnome: deeper and slower.
          return [0, 1, 2].map((k) => ({
            freq: 150 * j,
            to: 110 * j,
            dur: 0.1,
            wave: 'triangle' as const,
            gain: 0.35,
            delay: 0.1 + k * 0.32,
          }));
        case 'rustle':
        case 'leaf_rustle':
          return [0, 1, 2, 3].map((k) => ({
            freq: (2500 + this.random() * 2000) * j,
            dur: 0.04,
            wave: 'noise' as const,
            q: 2,
            gain: 0.06 * intensity,
            delay: k * 0.05,
          }));
        case 'hum':
        case 'tulip_hum':
          return [
            {
              freq: 220 * j,
              to: 230 * j,
              dur: 0.6,
              wave: 'sawtooth',
              gain: 0.04 * intensity,
              vibrato: { rate: 25, depth: 6 },
              attack: 0.1,
            },
          ];
        case 'bee_hum':
          return [
            {
              freq: 180 * j,
              to: 200 * j,
              dur: 0.9,
              wave: 'sawtooth',
              gain: 0.025 * intensity,
              vibrato: { rate: 28, depth: 10 },
              attack: 0.3,
            },
          ];
        case 'birdsong':
          return [0, 1, 2].map((k) => ({
            freq: (2400 + k * 300) * j,
            to: (3200 - k * 200) * j,
            dur: 0.07,
            wave: 'sine' as const,
            gain: 0.04 * intensity,
            delay: k * 0.11,
          }));
        case 'web':
          return [
            {
              freq: 500 * j,
              to: 300 * j,
              dur: 0.25,
              wave: 'sine',
              gain: 0.1,
              vibrato: { rate: 12, depth: 30 },
            },
          ];
        case 'jar':
          return [
            { freq: 2093 * j, dur: 0.25, wave: 'sine', gain: 0.08 },
            { freq: 3136 * j, dur: 0.18, wave: 'sine', gain: 0.04 },
          ];
        case 'camera_open':
          // A lens whirring out, then a bright ready blip.
          return [
            { freq: 180 * j, to: 420 * j, dur: 0.28, wave: 'noise', q: 6, gain: 0.14 },
            { freq: 1320 * j, to: 1760 * j, dur: 0.08, wave: 'sine', gain: 0.18, delay: 0.26 },
          ];
        case 'camera_close':
          return [
            { freq: 420 * j, to: 160 * j, dur: 0.26, wave: 'noise', q: 6, gain: 0.12 },
            { freq: 880 * j, to: 660 * j, dur: 0.08, wave: 'sine', gain: 0.14, delay: 0.2 },
          ];
        case 'shutter':
          // Click-clack: a sharp tick, the shutter's clap, and the film motor.
          return [
            { freq: 4200 * j, to: 2600 * j, dur: 0.02, wave: 'square', gain: 0.16 },
            { freq: 1800 * j, to: 500 * j, dur: 0.06, wave: 'noise', q: 1.2, gain: 0.4, delay: 0.015 },
            { freq: 2600 * j, to: 1400 * j, dur: 0.03, wave: 'square', gain: 0.12, delay: 0.07 },
            {
              freq: 240 * j,
              to: 300 * j,
              dur: 0.35,
              wave: 'noise',
              q: 8,
              gain: 0.07,
              delay: 0.14,
              attack: 0.05,
            },
          ];
        case 'sticker_peel':
          return [{ freq: 600 * j, to: 2400 * j, dur: 0.12, wave: 'noise', q: 2.5, gain: 0.2 * intensity }];
        case 'sticker_stick':
          return [
            { freq: 700 * j, to: 1100 * j, dur: 0.05, wave: 'sine', gain: 0.3 * intensity },
            {
              freq: 2200 * j,
              to: 900 * j,
              dur: 0.04,
              wave: 'noise',
              q: 2,
              gain: 0.18 * intensity,
              delay: 0.02,
            },
          ];
        case 'snap':
          return [
            { freq: 3000 * j, to: 1800 * j, dur: 0.03, wave: 'square', gain: 0.12 },
            { freq: 900 * j, dur: 0.05, wave: 'triangle', gain: 0.1, delay: 0.03 },
          ];
        case 'claw':
          // A whirring motor.
          return [
            {
              freq: 120 * j,
              to: 160 * j,
              dur: 0.6,
              wave: 'sawtooth',
              gain: 0.05,
              vibrato: { rate: 40, depth: 8 },
            },
          ];
        case 'domino':
          return [0, 1, 2, 3, 4].map((k) => ({
            freq: (1400 - k * 60) * j,
            dur: 0.03,
            wave: 'square' as const,
            gain: 0.05,
            delay: k * 0.07,
          }));
        case 'stink_puff':
          // Pfffft: an embarrassed little cloud.
          return [
            { freq: 160 * j, to: 90 * j, dur: 0.35, wave: 'noise', q: 3, gain: 0.25 },
            {
              freq: 120 * j,
              to: 70 * j,
              dur: 0.3,
              wave: 'sawtooth',
              gain: 0.06,
              vibrato: { rate: 20, depth: 15 },
            },
          ];
        case 'chop':
          return [
            { freq: 3000 * j, to: 600 * j, dur: 0.12, wave: 'noise', q: 2, gain: 0.3 },
            { freq: 700 * j, to: 1100 * j, dur: 0.1, wave: 'square', gain: 0.07, delay: 0.05 },
          ];
        case 'nibble':
          return [0, 1].map((k) => ({
            freq: 1800 * j,
            to: 1200 * j,
            dur: 0.03,
            wave: 'noise' as const,
            q: 5,
            gain: 0.15,
            delay: k * 0.08,
          }));
        case 'cocoon':
          return [
            {
              freq: 800 * j,
              to: 400 * j,
              dur: 0.8,
              wave: 'sine',
              gain: 0.08,
              vibrato: { rate: 5, depth: 30 },
              attack: 0.3,
            },
          ];
        case 'freed':
          return [
            { freq: 400 * j, to: 900 * j, dur: 0.12, wave: 'triangle', gain: 0.2 },
            { freq: 1400 * j, dur: 0.06, wave: 'sine', gain: 0.1, delay: 0.1 },
          ];
        case 'band':
          return [262, 330, 392, 523].map((f, k) => ({
            freq: f * j,
            dur: 0.9,
            wave: 'triangle' as const,
            gain: 0.09,
            delay: k * 0.03,
          }));
        case 'stage':
          return [
            { freq: 1200 * j, dur: 0.04, wave: 'square', gain: 0.08 },
            { freq: 1800 * j, dur: 0.04, wave: 'square', gain: 0.06, delay: 0.05 },
          ];
        case 'board_patter':
          // Rain drumming on wooden boards: low wooden ticks.
          return [0, 1, 2].map((k) => ({
            freq: (500 + this.random() * 400) * j,
            dur: 0.03,
            wave: 'noise' as const,
            q: 4,
            gain: 0.04 * intensity,
            delay: k * (0.03 + this.random() * 0.05),
          }));
        case 'drip':
          return [{ freq: 1500 * j, to: 2400 * j, dur: 0.06, wave: 'sine', gain: 0.07 * intensity }];
        case 'bubble_blorp':
          return [
            { freq: 220 * j, to: 520 * j, dur: 0.12, wave: 'sine', gain: 0.08 * intensity },
            { freq: 300 * j, to: 700 * j, dur: 0.1, wave: 'sine', gain: 0.05 * intensity, delay: 0.15 },
          ];
        case 'steam_hiss':
          return [
            {
              freq: 5000 * j,
              to: 4000 * j,
              dur: 0.6,
              wave: 'noise',
              q: 1,
              gain: 0.03 * intensity,
              attack: 0.2,
            },
          ];
        case 'arcade_blip':
          return [0, 1, 2].map((k) => ({
            freq: [880, 1175, 1568][k]! * j,
            dur: 0.05,
            wave: 'square' as const,
            gain: 0.03 * intensity,
            delay: k * 0.07,
          }));
        case 'scratch':
          return [0, 1, 2].map((k) => ({
            freq: 3000 * j,
            to: 2000 * j,
            dur: 0.06,
            wave: 'noise' as const,
            q: 6,
            gain: 0.05 * intensity,
            delay: k * 0.09,
          }));
        case 'peek_twig':
          return [
            { freq: 3000 * j, dur: 0.02, wave: 'noise', q: 8, gain: 0.08 },
            { freq: 140 * j, dur: 0.15, wave: 'sine', gain: 0.08, delay: 0.05 },
          ];
        default:
          return isTidySfx(name)
            ? tidyTones(name, j, intensity, this.random)
            : craftTones(name, j, intensity, this.random);
      }
    })();
    this.emit(name, tones, v, log);
  }

  /** The music toys play `note_played` on the music clock instead (set by `Game`). */
  toysPlayNotes = false;

  /** Log a sound something else played. */
  logOnly(name: SfxName): void {
    this.log.push(name);
    if (this.log.length > 50) this.log.shift();
  }

  /** A musical thing's note: `step` on a pentatonic scale, in its instrument's voice. */
  playNote(defId: string, step: number): void {
    const t = this.now();
    // A pile of notes landing at once plays as a chord, not a flood.
    if (t - this.lastNote < 30) return;
    this.lastNote = t;
    this.emit('note', noteTones(defId, step, this.jitter()), 10 ** ((this.random() * 2 - 1) * 0.05), true);
  }

  private lastNote = -Infinity;
  /** Things swooshed home since the whistle last blew: each swoosh is a step higher. */
  private swooshes = 0;

  private emit(name: SfxName, tones: readonly Tone[], v: number, log: boolean): void {
    for (const tone of tones) this.backend.play({ ...tone, gain: (tone.gain ?? 0.3) * v, bus: 'sfx' });
    if (!log) return;
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
