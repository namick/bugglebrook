import type { Command } from './commands';
import { CommandQueue } from './core/commandQueue';
import type { BugAction, BugMode, Entity, EntityId, EntityKind, Needs, SocialKind } from './core/entities';
import { EntityStore } from './core/entities';
import { EventBus } from './core/events';
import { SIM_DT, SIM_HZ } from './core/loop';
import { Rng } from './core/rng';
import { GRAVITY, VIEW_WIDTH_M } from './constants';
import type { Content } from './data';
import { CONTENT, areaAt, worldWidth } from './data';
import { MATERIALS } from './data/materials';
import type { MaterialId } from './data/types';
import type { AreaDef, BugDef, ItemDef, PendingState, WearSlot } from './data/types';
import { baseAffinity, pairKey } from './data/affinity';
import type { GameEvents, Liking, Mood, ReactionType, TagCause } from './events';
import type { BodyState, Impact, MaterialSpec, ShapeSpec } from './physics/physics';
import { Physics } from './physics/physics';
import type { SavedEntity, WorldCounters, WorldSave } from './save/schema';
import { Environment } from './systems/environment';
import { addTag, effectiveTags, expireTags, removeTag, tagOn } from './systems/tags';
import type { AdvertCandidate, BugNotice, BugSky, BugWorld, TargetInfo } from './systems/bugAi';
import {
  GAWK_RANGE,
  PERCEPTION,
  canEat,
  catchTurn,
  feedBug,
  friendNear,
  gawkBug,
  handPoint,
  likingOf,
  moodOf,
  newBugBrain,
  napBug,
  pocketBug,
  react,
  reactBug,
  releaseBug,
  smellBug,
  springLaunched,
  updateBug,
  wonderBug,
} from './systems/bugAi';
import { CATCH_WINDUP } from './systems/bugSocial';
import { SetupRule } from './systems/setup';
import { newSkyState } from './systems/sky';
import { Weather } from './systems/weather';
import { Barriers } from './systems/barriers';
import type { BarrierState } from './systems/barriers';
import { Places } from './systems/places';
import { Cast } from './systems/cast';
import type { Pocketable, PocketState } from './systems/pocket';
import { emptyPocket, tidyPocket } from './systems/pocket';
import { OffScreen } from './systems/offscreen';
import type { DropCandidate, DropTarget } from './systems/dropTargets';
import { pickDropTarget } from './systems/dropTargets';
import { Terrain } from './world/terrain';
import type { Placed } from './world/startLayout';
import { leanAgainst, stackTop } from './world/startLayout';
import { Bench } from './systems/bench';
import { Cauldron } from './systems/cauldron';
import { Journal } from './systems/journal';
import { Clues } from './systems/clues';
import { Hidden } from './systems/hidden';
import { journalBook } from './systems/journalBook';
import type { JournalBook } from './systems/journalBook';
import { Trash } from './systems/trash';
import { Wardrobe } from './systems/wardrobe';
import { MusicBugs } from './systems/musicBugs';
import { HEAD_TURNS } from './data/items11';
import { Tidy } from './systems/tidy';
import { Bounds } from './systems/bounds';
import type { PhotoState } from './systems/photo';
import { PHOTO_MOMENT_TICKS, TOTEM_TICKS, findTotem, inFrame } from './systems/photo';
import { BUG_RESTITUTION, halfExtents } from './simShared';
import {
  pocketable as _pocketable,
  pocketFits as _pocketFits,
  putInPocket as _putInPocket,
  takeFromPocket as _takeFromPocket,
  leavePocket as _leavePocket,
} from './simPocket';
import {
  handleImpacts as _handleImpacts,
  popBalloon as _popBalloon,
  tryCatch as _tryCatch,
  trySpring as _trySpring,
} from './simImpacts';
import { emitNotice as _emitNotice } from './simNotices';
import {
  isPotion as _isPotion,
  brewOf as _brewOf,
  bottleBrew as _bottleBrew,
  drink as _drink,
  shatterPotion as _shatterPotion,
  shatter as _shatter,
  paintFromDrop as _paintFromDrop,
  dropInto as _dropInto,
  upsideDownAt as _upsideDownAt,
  ghostAt as _ghostAt,
  ghostThrough as _ghostThrough,
  isGhost as _isGhost,
} from './simPotions';
import {
  capWalkForces as _capWalkForces,
  softContact as _softContact,
  byPlayer as _byPlayer,
  touchesSetup as _touchesSetup,
  setupLinked as _setupLinked,
  boxOf as _boxOf,
  setupNearExcept as _setupNearExcept,
} from './simSetupGuard';
import { bugWorld as _bugWorld, summitOf as _summitOf, waterEdge as _waterEdge } from './simBugWorld';
import { apply as _apply, poke as _poke, stageIntro as _stageIntro } from './simCommands';
import { Potions, SKY_TOP, scaleShape } from './systems/potions';
import { Toys } from './systems/toys';
import { bodyDensity } from './data/itemSize';
import type { Brew } from './systems/brewing';
import type { ActiveEffect, SavedPart, ToyState } from './core/entities';

/** A curled-up Rollo bounces like a marble (standing bugs: `BUG_RESTITUTION`). */
const ROLLED_RESTITUTION = 0.6;
/** How often consumables drop back in when an area runs low. */
export const RESPAWN_TICKS = 45 * SIM_HZ;
/** How far (m) a respawn drop keeps from the player's setups: a jelly bean falling from the sky can bounce and skid 6.5 m off a root slope. */
export const RESPAWN_CLEAR = 8;
/** Anything this far below the surface is pulled back up. */
const BURIED_DEPTH = 0.25;
const NO_TAGS: readonly string[] = [];
/** Spat food leaves the mouth this fast, forward and up (m/s). */
const SPIT_SPEED = { x: 4.2, y: -4.6 };
/** Areas this far (in meters) from the camera's view sleep: no physics. One screen. */
export const SLEEP_DISTANCE = VIEW_WIDTH_M;
/** Wet things grip less; frozen things hardly at all (game design doc, section 6). */
const WET_FRICTION = 0.7;
const FROZEN_FRICTION = 0.05;
const BUG_FRICTION = 0.1;
/** After bouncy food, the involuntary hop comes this many ticks later. */
const BOUNCY_HOP_DELAY = 50;
/** A stink bug's cloud lasts 6 s, and he can let off one every 8 s at most. */
const STINK_SECONDS = 6;
const STINK_EVERY = 8 * SIM_HZ;
/** Anything with a body this far straight overhead keeps the rain off (the porch boards are 6.5 m up). */
const SHELTER_REACH = 8;
/** M9's instruments, given to worlds saved before the sequencer. */
const M9_STARTERS: readonly string[] = [
  'item_inst_seedpod_maraca',
  'item_inst_acorn_castanets',
  'item_inst_thimble_drum',
  'item_inst_bottle_flute',
  'item_inst_leaf_xylophone',
];
/** M11's hats and accessories, given to worlds saved before the wardrobe. */
const M11_STARTERS: readonly string[] = [
  'item_hat_acorn_cap',
  'item_hat_party_cone',
  'item_hat_flower_petal',
  'item_hat_tiny_top_hat',
  'item_hat_chef',
  'item_acc_sunglasses',
  'item_acc_mustache',
  'item_acc_bowtie_ribbon',
  'item_acc_bandaid',
];
/** Things M8 added to the areas' start lists, given to worlds saved before it. */
const M8_STARTERS: readonly string[] = [
  'item_string',
  'item_balloon_red',
  'item_balloon_blue',
  'item_maple_seed',
  'item_hat_thimble',
  'item_comb_tooth',
  'item_glass_bead',
  'item_paint_red',
  'item_paint_blue',
  'item_paint_yellow',
  'item_paint_white',
  'item_paint_black',
  'item_popcorn_kernel',
  'item_hat_mushroom',
  'item_ant_crumb',
  'item_blueprint_slingshot',
  'item_blueprint_magnet_crane',
  'item_blueprint_balloon_basket',
  'item_blueprint_disco_ball',
];
/** Read-only view of one bug's mind, for the renderer and the test hook. */
export interface BugView {
  mode: BugMode;
  facing: 1 | -1;
  needs: Needs;
  action: BugAction | null;
  targetId: EntityId | null;
  /** Ticks left in the current mode. */
  timer: number;
  /** Full length of the current dizzy spell, in ticks. */
  dizzyTicks: number;
  /** Airborne by its own hop, not thrown. */
  selfLaunched: boolean;
  mood: Mood;
  /** Food being chewed, and how the bug feels about it. */
  mouthful: { id: EntityId; defId: string; liking: Liking } | null;
  /** The latest reaction and how many ticks ago it started. */
  reaction: { type: ReactionType; variant: number; age: number } | null;
  /** Ticks spent being tickled, or 0. */
  tickle: number;
  /** Woozy from being shaken. */
  woozy: boolean;
  /** Playing with another bug: what, with whom, and which side. */
  social: { kind: SocialKind; partner: EntityId; role: 'lead' | 'follow' } | null;
  /** What it holds in its front legs. */
  carrying: EntityId | null;
  /** Just woken and still groggy. */
  groggy: boolean;
  /** Gliding down on open wings. */
  gliding: boolean;
  /** Holding what it carries overhead, as an umbrella against the rain. */
  umbrella: boolean;
  /** Waiting to be found (M7): stuck on its back, ignoring everyone, or disguised. */
  pending?: PendingState;
  /** Twig's tiny eyes are open for a peek. */
  peeking?: boolean;
  /** Munch as a cocoon or a butterfly. */
  form?: 'cocoon' | 'butterfly';
  /** Holding what it carries over its head (Moose), or rolling it behind (Barty). */
  overhead?: boolean;
  rolling?: boolean;
  /** Paint patches on it. */
  paint?: string[];
  /** What it wears (M11), in slot order. */
  wearing?: { slot: WearSlot; id: EntityId; defId: string }[];
  /** Playing its own legs (Fiddle). */
  fiddling?: boolean;
}

/** A potion effect as the renderer sees it (M8). */
export interface EffectView {
  effect: ActiveEffect['effect'];
  potion: string | null;
  strength: number;
  /** Ticks since it began, and ticks left. */
  age: number;
  left: number;
  paint?: string;
  grown?: number;
  zipping?: boolean;
  /** Sludge's look: fuzzy, crossed, hiccups. */
  look?: string;
}

/** Read-only view of one entity for the renderer and the test hook. */
export interface EntityView extends BodyState {
  id: EntityId;
  kind: EntityKind;
  defId: string;
  held: boolean;
  /** Food sitting in a bug's mouth: the ID of that bug. */
  inMouthOf?: EntityId;
  /** Held in a bug's front legs: the ID of that bug. */
  carriedBy?: EntityId;
  bug?: BugView;
  /** Every tag that is on right now, sorted. */
  tags: string[];
  /** Fraction under water, 0 to 1. */
  submerged: number;
  /** How far a soaking paper thing is toward sinking, 0 to 1. */
  soggy?: number;
  /** Asleep with its area: frozen in place until the camera comes back. */
  asleep?: boolean;
  /** In the pocket tray: which slot. Not in the world while this is set. */
  pocket?: number;
  /** Paint on it: an item's color, or a bug's patches. */
  paint?: string[];
  /** Worn by a bug (M11): which, and in which slot. Drawn on the bug, not in the world. */
  worn?: { by: EntityId; slot: WearSlot };
  /** Bites nibbled out of a leaf. */
  bites?: number;
  /** Snapped onto the pegboard. */
  pinned?: boolean;
  /** Potion effects working on it (M8), with any wobble showing its current side. */
  effects?: EffectView[];
  /** How big potions have made it (1 normal). */
  scale?: number;
  /** A potion bottle's color, and its potion (null for a mix). */
  brew?: { color: number; potion: string | null; paint?: string };
  /** Toasted by heat. */
  toasted?: boolean;
  /** A crafted toy's state. */
  toy?: ToyState;
  /** How many things went into it (a crafted thing or a junk blob). */
  parts?: number;
}

export interface SimOptions {
  seed?: string | number;
  content?: Content;
}

/**
 * The whole game world, headless. Owns entities, physics, RNG, the command
 * queue, and the event bus. Advance it with `step()`; it knows nothing about
 * rendering, input devices, audio, or wall-clock time.
 */
export class Sim {
  /**
   * Strict IDs: `findSecret` throws on a secret ID the content does not
   * have, instead of quietly finding nothing. The unit tests turn it on
   * (`tests/unit/setup.ts`) so a typo cannot hide; a player's game never
   * crashes over one.
   */
  static strict = false;

  readonly events = new EventBus<GameEvents>();
  readonly commands = new CommandQueue<Command>();
  readonly entities = new EntityStore();
  readonly physics: Physics;
  readonly terrain: Terrain;
  readonly content: Content;
  readonly worldWidth: number;
  readonly seed: string;
  rng: Rng;
  tick = 0;
  /** Times something had to be pulled back out of the ground. Tests expect 0. */
  rescues = 0;
  /** Hardest impact per bug during the last physics step. */
  bugImpacts = new Map<EntityId, number>();
  /** Bugs a spring just launched: ignore their contact with it for a moment. */
  launchGrace = new Map<EntityId, number>();
  rolling = new Set<EntityId>();
  /** Things the player just threw, and when: they can land in a mouth. */
  thrown = new Map<EntityId, number>();
  /** Water, fixtures, and the property rules. */
  readonly environment: Environment;
  /** What the camera shows, or null (tests, headless): then nothing sleeps. */
  focus: { x0: number; x1: number } | null = null;
  private readonly asleepAreas = new Set<string>();
  /** Entities whose bodies are switched off because their area sleeps. */
  private readonly sleeping = new Set<EntityId>();
  /** The setup rule: bugs never undo the player. */
  readonly setup: SetupRule;
  /** Coarse simulation for bugs in sleeping areas. */
  readonly offscreen: OffScreen;
  /** Changes to bug-pair affinity since the world began, by pair key. Saved. */
  affinity: Record<string, number> = {};
  /** Things in bugs' front legs: item ID to bug ID. Rebuilt from the brains. */
  readonly carried = new Map<EntityId, EntityId>();
  /** Loud things this step (crashes, hard landings) that make bugs turn and look. */
  private loud: { x: number; y: number; victim: EntityId | null }[] = [];
  /** What bugs can ask about the world this step, built once per step. */
  worldCache: BugWorld | null = null;
  /** The pocket tray's slots. Saved. */
  pocket: PocketState = emptyPocket();
  /** Everything in the pocket, for quick checks. Rebuilt from `pocket`. */
  readonly pocketed = new Set<EntityId>();
  /** Running counts kept for the menu: how often the player fed each bug. Saved. */
  counters: WorldCounters = { fed: {} };
  /** Day, night, and weather: the clock, the sundial, the vane, puddles. */
  readonly weather: Weather;
  /** Secrets found in this world, in the order they were found. Saved. */
  secrets: string[] = [];
  /** The barriers between areas, and which areas are open. */
  readonly barriers: Barriers;
  /** The fixtures of the flowerbed, porch, compost lab, and treehouse. */
  readonly places: Places;
  /** Who has joined, and the hidden bugs waiting to be found. */
  readonly cast: Cast;
  /** The Tinker Bench (M8). */
  readonly bench: Bench;
  /** The compost cauldron (M8). */
  readonly cauldron: Cauldron;
  /** Potion effects on bugs and things (M8). */
  readonly potions: Potions;
  /** Crafted toys and balloons (M8). */
  readonly toys: Toys;
  /** Brings back anything that leaves the world. */
  readonly bounds: Bounds;
  /** M10's clues and secrets in the open areas (saved as `world.clues`). */
  readonly clues: Clues;
  /** The journal's memory (M10): what the player met, found, and saw (saved as `world.journal`). */
  readonly journal: Journal;
  /** M10: the hidden areas' doorways, the depths, and the hollow. */
  readonly hidden: Hidden;
  /** The trash can (playtest F1). */
  readonly trash: Trash;
  /** The tidy whistle, slow tidying, and the junk cap (playtest F2). */
  readonly tidy: Tidy;
  /** Hats and accessories, and who wears what (M11). */
  readonly wardrobe: Wardrobe;
  /** Buzzby, Fiddle, and Luma: how they are found and what they get up to (M11). */
  readonly musicBugs: MusicBugs;
  /** Where the player's hand is over the world, or null. Sent by the renderer (`hand`). */
  hand: { x: number; y: number } | null = null;
  /** Areas whose starting things are in the world. Saved, so areas added later get theirs on load. */
  built: string[] = [];
  /** Photo mode (M11): the camera is out. Not saved. */
  photo: PhotoState | null = null;
  /** Ticks four bugs have stood stacked, for the totem secret. */
  private totemTicks = 0;

  private constructor(seed: string, content: Content) {
    this.seed = seed;
    this.content = content;
    this.rng = new Rng(seed);
    this.worldWidth = worldWidth(content);
    this.terrain = Terrain.fromAreas(content.areas.all);
    this.physics = new Physics(GRAVITY, this.worldWidth, this.terrain);
    this.environment = new Environment(this);
    this.weather = new Weather(this);
    this.setup = new SetupRule(this);
    this.offscreen = new OffScreen(this);
    this.barriers = new Barriers(this);
    this.places = new Places(this);
    this.cast = new Cast(this);
    this.bench = new Bench(this);
    this.cauldron = new Cauldron(this);
    this.potions = new Potions(this);
    this.toys = new Toys(this);
    this.bounds = new Bounds(this);
    this.journal = new Journal(this);
    this.clues = new Clues(this);
    this.hidden = new Hidden(this);
    this.trash = new Trash(this);
    this.tidy = new Tidy(this);
    this.wardrobe = new Wardrobe(this);
    this.musicBugs = new MusicBugs(this);
    this.buildFixtures();
    this.buildSolids();
    this.barriers.build();
    this.places.build();
    this.hidden.build();
    this.physics.passThrough = (a, b, _nx, ny) => this.softContact(a, b, ny) || this.ghostThrough(a, b);
    // The cobweb hammock lets things sink through after a moment; ghosts pass the web and the can wall.
    this.physics.platformPass = (key, id) =>
      (key === 'solid_cobweb' && this.places.webLetsGo(id)) ||
      ((key === 'solid_cobweb' || key === 'solid_can_wall') && this.isGhost(id));
  }

  /** Fixed solids: the porch boards, shelves, the tin can wall, the jar, the slide. */
  private buildSolids(): void {
    for (const area of this.content.areas.all)
      for (const solid of area.solids ?? []) {
        if (solid.box) {
          const [x0, y0, x1, y1] = solid.box;
          this.physics.addStaticBox(
            solid.id,
            area.xStart + x0,
            y0,
            area.xStart + x1,
            y1,
            solid.friction ?? 0.7,
          );
        } else if (solid.chain)
          this.physics.addStaticChain(
            solid.id,
            solid.chain.map(([x, y]) => ({ x: area.xStart + x, y })),
            solid.friction,
          );
      }
  }

  /** Static fixtures with bodies: the sunken teacup is a cup things can land in. */
  private buildFixtures(): void {
    for (const area of this.content.areas.all)
      for (const f of area.fixtures ?? []) {
        if (f.kind !== 'teacup') continue;
        const cx = area.xStart + f.x;
        const bottom = this.terrain.surfaceY(cx) - 0.02;
        const r = f.radius;
        const h = 0.66;
        // The cup's walls: a U from rim to rim, curving under.
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const a = Math.PI * t;
          pts.push({ x: cx - Math.cos(a) * r, y: bottom - h + Math.sin(a) * h * 0.95 });
        }
        this.physics.addStaticChain(f.id, pts);
      }
  }

  /** A fresh, empty world. */
  static empty(options: SimOptions = {}): Sim {
    const sim = new Sim(String(options.seed ?? 1), options.content ?? CONTENT);
    // Empty on purpose: loading it again adds nothing.
    sim.built = sim.content.areas.all.map((a) => a.id);
    return sim;
  }

  /** A fresh world with the starting bugs and props. */
  static create(options: SimOptions = {}): Sim {
    const sim = Sim.empty(options);
    sim.built = [];
    populateStartingWorld(sim);
    return sim;
  }

  /** The starting things for these areas go into the world, and they count as built. */
  populate(areas: readonly AreaDef[]): void {
    for (const area of areas) {
      if (!this.built.includes(area.id)) this.built.push(area.id);
      // Start things placed so far, for piles: what stacks on them and leans on them.
      const placed: Placed[] = [];
      for (const s of area.start) {
        let x = area.xStart + s.x;
        const shape = s.kind === 'item' ? this.content.items.get(s.defId).shape : null;
        const half = shape ? halfExtents(shape, 0).h : this.content.bugs.get(s.defId).radius;
        // A hidden bug that was found already (in a save) does not come back.
        if (s.kind === 'bug' && s.pending && this.cast.present(s.defId)) continue;
        const water = s.onWater ? this.environment.waterAt(x) : null;
        // Floaters start sitting in the water, skaters standing on it.
        let y =
          s.pin !== undefined && s.y !== undefined
            ? s.y
            : water
              ? water.level - half * (s.kind === 'bug' ? 1 : 0.4)
              : (s.y ?? this.surfaceY(x)) - (s.lift ?? 0) - half - 0.01;
        let angle = s.pin ?? 0;
        const prev = placed[placed.length - 1];
        if (shape && s.lean && prev) {
          const corner = s.lean === 1 ? prev.x0 : prev.x1;
          ({ x, y, angle } = leanAgainst(prev, shape, s.lean, this.surfaceY(corner)));
        } else if (shape && s.stack) {
          const top = stackTop(placed, x, halfExtents(shape, 0).w);
          if (top !== null) y = top - half - 0.01;
        }
        const e = this.spawn(s.kind, s.defId, x, y);
        if (angle !== 0) this.physics.place(e.id, x, y, angle);
        if (s.pin !== undefined) {
          this.physics.setPinned(e.id, true);
          e.pinned = true;
        }
        if (shape) {
          const ext = halfExtents(shape, angle);
          placed.push({ x0: x - ext.w, x1: x + ext.w, top: y - ext.h });
        }
        if (s.pending && e.bug) {
          e.bug.pending = s.pending;
          e.bug.restX = x;
        }
      }
    }
  }

  /** Rebuild a world from a save. */
  static load(save: WorldSave, content: Content = CONTENT): Sim {
    const sim = new Sim(save.seed, content);
    sim.tick = save.tick;
    sim.rng = Rng.fromState(save.rng);
    for (const saved of save.entities) {
      if (!sim.defExists(saved.kind, saved.defId)) continue; // content removed since save
      const entity: Entity = { id: saved.id, kind: saved.kind, defId: saved.defId };
      if (saved.bug) {
        entity.bug = clone(saved.bug);
        // Nobody is holding it any more.
        if (entity.bug.mode === 'st_held') entity.bug.mode = 'st_airborne';
      }
      if (saved.tags) entity.tags = clone(saved.tags);
      if (saved.soak !== undefined) entity.soak = saved.soak;
      if (saved.paint) entity.paint = [...saved.paint];
      if (saved.bites) entity.bites = saved.bites;
      if (saved.parts) entity.parts = clone(saved.parts);
      if (saved.brew) entity.brew = clone(saved.brew);
      if (saved.effects) entity.effects = clone(saved.effects);
      if (saved.toasted) entity.toasted = true;
      if (saved.home) entity.home = { ...saved.home };
      if (saved.toy) entity.toy = clone(saved.toy);
      if (saved.wearing && entity.bug) entity.wearing = { ...saved.wearing };
      sim.entities.restore(entity);
      sim.addBodyFor(entity, saved.body);
      if (saved.pinned) {
        entity.pinned = true;
        sim.physics.setPinned(entity.id, true);
      }
    }
    sim.entities.nextId = Math.max(save.nextId, sim.entities.nextId);
    // Food that was mid-chew goes back in the mouth; carried things back in the legs.
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b) continue;
      if (b.mouthful !== null) {
        if (b.mode === 'st_eat' && sim.entities.has(b.mouthful)) sim.physics.setActive(b.mouthful, false);
        else b.mouthful = null;
      }
      if (b.carrying !== null) {
        if (sim.entities.has(b.carrying) && !sim.carried.has(b.carrying)) {
          sim.physics.setActive(b.carrying, false);
          sim.carried.set(b.carrying, bug.id);
        } else b.carrying = null;
      }
    }
    sim.counters = save.counters ? clone(save.counters) : { fed: {} };
    // The pocket's things stay out of the world. A bug marked pocketed that
    // no slot holds (a save from before the pocket) drops back in.
    sim.pocket = tidyPocket(save.pocket ? clone(save.pocket) : emptyPocket(), (id) => sim.entities.has(id));
    for (const id of sim.pocket.slots.flat()) {
      sim.pocketed.add(id);
      sim.physics.setActive(id, false);
      const b = sim.entities.get(id)!.bug;
      if (b && b.mode !== 'st_pocketed') pocketBug(b);
    }
    for (const bug of sim.entities.ofKind('bug'))
      if (bug.bug?.mode === 'st_pocketed' && !sim.pocketed.has(bug.id)) bug.bug.mode = 'st_airborne';
    sim.environment.restore(save.env ? clone(save.env) : sim.environment.state);
    // Saves from before the clock start at 09:00 in clear weather, and get M6's new things.
    sim.weather.restore(save.sky ? clone(save.sky) : newSkyState(save.seed, save.tick));
    if (!save.sky) sim.addMissingItems(['item_flashlight_pen']);
    sim.secrets = save.secrets ? [...save.secrets] : [];
    sim.affinity = save.social ? clone(save.social.affinity) : {};
    if (save.barriers) sim.barriers.restore(clone(save.barriers));
    if (save.places) sim.places.restore(clone(save.places));
    if (save.bench) sim.bench.restore(clone(save.bench));
    if (save.journal) sim.journal.restore(clone(save.journal));
    if (save.clues) sim.clues.restore(clone(save.clues));
    if (save.hidden) sim.hidden.restore(clone(save.hidden));
    sim.hidden.build();
    if (save.cauldron) sim.cauldron.restore(clone(save.cauldron));
    if (save.trash) sim.trash.restore(clone(save.trash));
    if (save.tidy) sim.tidy.restore(clone(save.tidy));
    if (save.wardrobe) sim.wardrobe.restore(clone(save.wardrobe));
    // Worn things go back on their bugs, bodies off.
    sim.wardrobe.rebuild();
    // Areas new since the save get their starting things (M7's four areas, in older saves).
    sim.built = save.built ? [...save.built] : sim.content.areas.all.map((a) => a.id);
    sim.populate(sim.content.areas.all.filter((a) => !sim.built.includes(a.id)));
    sim.addMissingBugs();
    // M8's new things join worlds saved before the bench existed.
    if (!save.bench) sim.addMissingItems(M8_STARTERS);
    // M9's instruments join worlds saved before the sequencer.
    if (!save.places?.sequencer) sim.addMissingItems(M9_STARTERS);
    // The tidy whistle joins worlds saved before the trash can.
    if (!save.trash) sim.addMissingItems(['item_tidy_whistle']);
    // M11's hats and accessories join worlds saved before the wardrobe.
    if (!save.wardrobe) sim.addMissingItems(M11_STARTERS);
    sim.toys.restore();
    for (const e of sim.entities.all()) if (e.effects) sim.potions.sync(e);
    sim.refreshFriction();
    // Anything a save left outside the world (R01) drops back in.
    sim.bounds.sweep();
    if (!save.journal) sim.journal.seed();
    // What was at rest settles again before the first step, so piles do not slump.
    sim.physics.settleLoaded();
    return sim;
  }

  /**
   * Starting bugs that a save predates (Boing arrived in M4) join the world
   * where they would have started. Hidden bugs still have to be found.
   */
  private addMissingBugs(): void {
    const have = new Set(this.entities.ofKind('bug').map((b) => b.defId));
    for (const area of this.content.areas.all)
      for (const st of area.start) {
        if (st.kind !== 'bug' || have.has(st.defId)) continue;
        const def = this.content.bugs.get(st.defId);
        // Hidden bugs still have to be found; one that waits in the world (Twig) takes its place.
        if (def.hidden && (!st.pending || this.secrets.includes(def.foundBy ?? ''))) continue;
        const x = area.xStart + st.x;
        const bug = this.spawn('bug', st.defId, x, this.surfaceY(x) - def.radius - 0.3);
        if (st.pending && bug.bug) {
          bug.bug.pending = st.pending;
          bug.bug.restX = x;
        }
        have.add(st.defId);
      }
  }

  /** Starting items a save predates join it where they would have started. */
  private addMissingItems(defIds: readonly string[]): void {
    const have = new Set(this.entities.ofKind('item').map((e) => e.defId));
    for (const area of this.content.areas.all)
      for (const st of area.start) {
        if (st.kind !== 'item' || !defIds.includes(st.defId) || have.has(st.defId)) continue;
        if (!this.content.items.has(st.defId)) continue;
        const x = area.xStart + st.x;
        const half = halfExtents(this.content.items.get(st.defId).shape, 0).h;
        this.spawn('item', st.defId, x, (st.y ?? this.surfaceY(x)) - half - 0.3);
        have.add(st.defId);
      }
  }

  defExists(kind: EntityKind, defId: string): boolean {
    return kind === 'bug' ? this.content.bugs.has(defId) : this.content.items.has(defId);
  }

  /** Height of the ground surface at world x. */
  surfaceY(x: number): number {
    return this.terrain.surfaceY(x);
  }

  spawn(kind: EntityKind, defId: string, x: number, y: number): Entity {
    if (!this.defExists(kind, defId)) throw new Error(`Unknown ${kind} def: ${defId}`);
    const entity = this.entities.create(kind, defId);
    if (kind === 'bug') entity.bug = newBugBrain(x, this.rng);
    if (kind === 'item' && this.content.items.get(defId).unique) entity.home = { x, y };
    this.addBodyFor(entity, { x, y, angle: 0, vx: 0, vy: 0, av: 0 });
    this.events.emit('entity_spawned', { id: entity.id, kind, defId });
    return entity;
  }

  remove(id: EntityId): void {
    const gone = this.entities.get(id);
    if (!gone) return;
    // A bug leaving the world lets go of what it wears.
    if (gone.wearing) this.wardrobe.takeAllOff(gone, 'dropped');
    this.wardrobe.forget(id);
    const holder = this.carried.get(id);
    if (holder !== undefined) {
      const b = this.entities.get(holder)?.bug;
      if (b && b.carrying === id) b.carrying = null;
      this.carried.delete(id);
    }
    this.environment.forget(id);
    this.bench.taken(id);
    this.toys.forget(id);
    this.potions.forget(id);
    this.trash.forget(id);
    this.sleeping.delete(id);
    // The setup cache may list it; later systems this step would look up its gone body.
    this.linkedCache = null;
    if (this.pocketed.delete(id)) this.pocket = tidyPocket(this.pocket, (e) => e !== id);
    this.physics.removeBody(id);
    this.entities.remove(id);
    this.rolling.delete(id);
    this.thrown.delete(id);
    this.events.emit('entity_removed', { id });
  }

  private addBodyFor(entity: Entity, state: BodyState): void {
    if (entity.kind === 'bug') {
      const def = this.content.bugs.get(entity.defId);
      const shape: ShapeSpec = def.collider
        ? { type: 'box', width: def.collider.width, height: def.collider.height }
        : { type: 'circle', radius: def.radius };
      // Low friction: the AI drives walking and gripping through velocity, and
      // ground friction would only fight it.
      const material: MaterialSpec = { density: 1, friction: BUG_FRICTION, restitution: BUG_RESTITUTION };
      this.physics.addBody(entity.id, shape, material, state, {
        fixedRotation: true,
        linearDamping: 0.1,
        walker: true,
      });
    } else {
      const def = this.content.items.get(entity.defId);
      const material = { density: bodyDensity(def), friction: def.friction, restitution: def.restitution };
      this.physics.addBody(entity.id, def.shape, material, state, {
        linearDamping: def.linearDamping,
        angularDamping: def.angularDamping,
      });
    }
  }

  /** Queue a command for the next step. */
  send(command: Command): void {
    this.commands.push(command);
  }

  /** Advance the world by one fixed step. */
  step(): void {
    for (const command of this.commands.drain()) this.apply(command);
    // Photo mode: after the camera moment the world holds still. Commands
    // still land (the shutter, the camera going away), but nothing moves and
    // the clock stops, so no timer runs out while the player frames a shot.
    if (this.photo) {
      if (!this.photo.frozen && this.tick - this.photo.at >= PHOTO_MOMENT_TICKS) this.photo.frozen = true;
      if (this.photo.frozen) {
        this.journal.update();
        return;
      }
    }
    this.weather.update();
    this.barriers.update();
    this.places.update();
    this.hidden.update();
    this.bench.update();
    this.cauldron.update();
    this.trash.update();
    this.tidy.update();
    this.wardrobe.update();
    this.musicBugs.update();
    if (this.tick % 15 === 0) this.updateSleep();
    if (this.tick % 15 === 0) this.totem();
    this.offscreen.update();
    this.cast.update();
    this.worldCache = null;
    this.updateBugs();
    this.potions.update();
    this.capWalkForces();
    this.syncCarried();
    this.catchThrows();
    this.physics.measureHand(SIM_DT);
    this.toys.beforePhysics();
    this.environment.beforePhysics();
    this.physics.filterContacts =
      this.setupLinked().size > 0 ||
      Object.keys(this.places.state.web).length > 0 ||
      this.entities.all().some((e) => !!e.effects && this.potions.ghostly(e));
    this.physics.step(SIM_DT);
    this.placeMouthfuls();
    this.placeCarried();
    this.wardrobe.place();
    const impacts = this.physics.takeImpacts();
    this.handleImpacts(impacts);
    this.toys.impacts(impacts);
    this.clues.impacts(impacts);
    this.environment.afterPhysics(impacts);
    this.catchThrows();
    this.setup.update();
    this.gawk();
    this.rescueBuried();
    this.bounds.update();
    if (this.tick % 60 === 0)
      for (const [k, t] of this.passing) if (t < this.tick - 1) this.passing.delete(k);
    if (this.tick > 0 && this.tick % RESPAWN_TICKS === 0) this.respawn();
    this.clues.update();
    this.journal.update();
    this.tick++;
  }

  /** Run `n` steps. Handy for tests. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  apply(command: Command): void {
    _apply(this, command);
  }

  // --- The pocket tray -------------------------------------------------------

  pocketable(e: Entity): Pocketable {
    return _pocketable(this, e);
  }

  /** What each pocket slot holds, bottom of the stack first. */
  pocketSlots(): { ids: EntityId[]; defId: string | null; kind: EntityKind | null }[] {
    return this.pocket.slots.map((ids) => {
      const top = ids.length > 0 ? this.entities.get(ids[ids.length - 1]!) : undefined;
      return { ids: [...ids], defId: top?.defId ?? null, kind: top?.kind ?? null };
    });
  }

  /** Could the thing in the hand go in this slot without a swap? */
  pocketFits(slot: number, id: EntityId): boolean {
    return _pocketFits(this, slot, id);
  }

  /**
   * Tuck the held thing into a pocket slot: it leaves the world. A slot that
   * cannot take it swaps, and what was there pops out where the thing was.
   */
  putInPocket(entity: Entity, slot: number): void {
    _putInPocket(this, entity, slot);
  }

  /** Pull the top thing out of a slot into the hand at (x, y), kept above the ground. */
  takeFromPocket(slot: number, x: number, y: number): void {
    _takeFromPocket(this, slot, x, y);
  }

  /** Back into the world at (x, y), with its timers moved on past the time it spent in the pocket. */
  leavePocket(entity: Entity, x: number, y: number, ticks: number): void {
    _leavePocket(this, entity, x, y, ticks);
  }

  /** Half the height of a bug or an item, upright. */
  halfHeight(e: Entity): number {
    return this.halfHeightOf(e);
  }

  halfHeightOf(e: Entity): number {
    return e.kind === 'bug'
      ? this.bugDef(e).radius
      : halfExtents(this.content.items.get(e.defId).shape, 0).h * this.potions.scaleOf(e);
  }

  /** Half the height of an item def, upright. */
  halfHeightOfDef(defId: string): number {
    return halfExtents(this.content.items.get(defId).shape, 0).h;
  }

  /** The bug as its AI sees it: potions change its size, speed, and how it gets about. */
  bugDef(e: Entity): BugDef {
    return this.potions.bugDef(e, this.content.bugs.get(e.defId));
  }

  /** A material's default tags. */
  materialTags(material: MaterialId): readonly string[] {
    return MATERIALS[material].tags;
  }

  // --- M8: crafting and potions ------------------------------------------------

  /** A thing as it is now, to tuck inside another (a crafted toy, a junk blob, the cauldron). */
  snapshot(e: Entity): SavedPart {
    const part: SavedPart = { defId: e.defId };
    if (e.tags) {
      const tags = clone(e.tags);
      delete tags.tag_player_setup;
      if (Object.keys(tags).length > 0) part.tags = tags;
    }
    if (e.paint && e.paint.length > 0) part.paint = [...e.paint];
    if (e.bites) part.bites = e.bites;
    if (e.toasted) part.toasted = true;
    if (e.brew) part.brew = clone(e.brew);
    if (e.parts) part.parts = clone(e.parts);
    return part;
  }

  /** Bring a tucked-away thing back into the world at (x, y). */
  restorePart(part: SavedPart, x: number, y: number): Entity {
    const def = this.content.items.has(part.defId) ? part.defId : 'item_pebble';
    const e = this.spawn('item', def, x, y);
    if (part.tags) e.tags = clone(part.tags);
    if (part.paint) e.paint = [...part.paint];
    if (part.bites) e.bites = part.bites;
    if (part.toasted) e.toasted = true;
    if (part.brew) e.brew = clone(part.brew);
    if (part.parts) e.parts = clone(part.parts);
    this.refreshFriction(e);
    return e;
  }

  /** Balloons lifted a bug off its feet: it is in the air now, paddling. */
  liftBug(bug: Entity): void {
    const b = bug.bug;
    if (!b || b.mode === 'st_airborne' || b.mode === 'st_held') return;
    const s = this.physics.getState(bug.id);
    releaseBug(b, this.bugDef(bug), false, s.y);
    b.selfLaunched = true;
    // Off the ground with a little tug, so it does not land again at once.
    this.physics.setVelocity(bug.id, s.vx, Math.min(s.vy, -0.8));
    this.launchGrace.set(bug.id, this.tick + 6);
  }

  /** A trampoline bounced a bug: up it goes, and the soft bed never makes it dizzy. */
  bounceBug(bug: Entity, toyId?: EntityId): void {
    const b = bug.bug;
    if (!b) return;
    const s = this.physics.getState(bug.id);
    if (b.mode !== 'st_airborne') releaseBug(b, this.bugDef(bug), false, s.y);
    b.selfLaunched = true;
    b.airPeak = 0;
    this.launchGrace.set(bug.id, this.tick + 4);
    this.bugImpacts.delete(bug.id);
    if (toyId !== undefined && springLaunched(b, toyId, this.tick))
      this.events.emit('bug_used', { id: bug.id, defId: bug.defId, targetId: toyId, action: 'bounce' });
  }

  private basketCache: { tick: number; list: Entity[] } | null = null;

  /** Balloon baskets in the world, found once a step. */
  private baskets(): Entity[] {
    if (this.basketCache?.tick !== this.tick)
      this.basketCache = {
        tick: this.tick,
        list: this.entities.ofKind('item').filter((e) => this.content.items.get(e.defId).toy === 'basket'),
      };
    return this.basketCache.list;
  }

  /** How fast the toy a bug stands on is moving, so the bug goes along with it. */
  private rideVelocity(id: EntityId): { x: number; y: number; moving: boolean; aloft: boolean } {
    // Inside a balloon basket that is off the ground, it is carried, touching the floor or not.
    const bs = this.physics.getState(id);
    for (const basket of this.baskets()) {
      if (this.isSleeping(basket.id)) continue;
      const k = this.physics.getState(basket.id);
      if (Math.abs(bs.x - k.x) > 0.66 || bs.y > k.y + 0.8 || bs.y < k.y - 0.4) continue;
      if (!this.physics.isSupported(basket.id) && this.physics.grabbed !== basket.id)
        return { x: k.vx, y: k.vy, moving: true, aloft: true };
    }
    const under = this.physics.supportBody(id);
    const e = under === null ? undefined : this.entities.get(under);
    const toy = e?.kind === 'item' ? this.content.items.get(e.defId).toy : undefined;
    if (!e || !toy) return { x: 0, y: 0, moving: false, aloft: false };
    const s = this.physics.getState(e.id);
    // On a racer on the move, it holds on and enjoys the ride.
    const racing = toy === 'racer' && Math.hypot(s.vx, s.vy) > 0.4;
    return { x: s.vx, y: s.vy, moving: true, aloft: racing };
  }

  /** Shaken up, a fizzy thing shoots up out of the hand at 1500 px/s. It only has one fizz in it. */
  fizz(e: Entity): void {
    this.physics.release();
    const s = this.physics.getState(e.id);
    this.physics.setVelocity(e.id, s.vx * 0.2, -15);
    this.removeTag(e.id, 'tag_fizzy', 'shake');
    if (this.content.items.get(e.defId).toy === 'rocket') e.toy = { ...(e.toy ?? {}), flying: true };
    this.events.emit('toy_used', {
      id: e.id,
      toy: this.content.items.get(e.defId).toy ?? 'rocket',
      action: 'launch',
      x: s.x,
      y: s.y,
    });
  }

  /** A bug notices something and reacts (it stops if it was only pottering about). */
  reactBug(bug: Entity, type: ReactionType): void {
    if (!bug.bug || this.isSleeping(bug.id)) return;
    const s = this.physics.getState(bug.id);
    for (const n of reactBug(bug.bug, type, this.rng, this.tick)) this.emitNotice(bug, n, s);
  }

  /** The nearest bug that is about (joined, awake), within `reach`. */
  nearestBug(x: number, y: number, reach: number): Entity | null {
    let best: { e: Entity; d: number } | null = null;
    for (const bug of this.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || this.isSleeping(bug.id) || bug.bug.mode === 'st_sleep') continue;
      const s = this.physics.getState(bug.id);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= reach && (!best || d < best.d)) best = { e: bug, d };
    }
    return best?.e ?? null;
  }

  /** A toy sends something flying (the spring launcher): bugs go up like a fling. */
  launchFromToy(e: Entity, vx: number, vy: number): void {
    const s = this.physics.getState(e.id);
    this.physics.setVelocity(e.id, vx, vy);
    this.launchGrace.set(e.id, this.tick + 4);
    if (!e.bug || e.bug.pending) return;
    releaseBug(e.bug, this.bugDef(e), true, s.y);
    this.emitNotice(e, react(e.bug, 'fling', this.rng, this.tick), s);
  }

  /** Is this a potion bottle? */
  isPotion(e: Entity): boolean {
    return _isPotion(this, e);
  }

  /** The brew in a bottle that never went through the cauldron: its potion, plain. */
  brewOf(potionId: string): Brew {
    return _brewOf(this, potionId);
  }

  bottleBrew(e: Entity): Brew {
    return _bottleBrew(this, e);
  }

  /** A bug drank a potion. */
  drink(bug: Entity, bottle: Entity): void {
    _drink(this, bug, bottle);
  }

  /** A bottle hit something hard: it breaks and splashes what it hit (half the time). */
  shatterPotion(bottle: Entity, otherId: EntityId | null, x: number, y: number): void {
    _shatterPotion(this, bottle, otherId, x, y);
  }

  /** Rule R11: a fragile thing knocked hard breaks into pieces. */
  shatter(e: Entity, into: string, count: number): void {
    _shatter(this, e, into, count);
  }

  /** A balloon pops with a bang and leaves its scrap behind. */
  pop(e: Entity, cause: 'sharp' | 'hot' | 'chop'): void {
    _popBalloon(this, e, cause);
  }

  /** Paint a bug from a paint drop let go on it (drop rule 5): the drop is used up. */
  paintFromDrop(bugId: EntityId, drop: Entity): void {
    _paintFromDrop(this, bugId, drop);
  }

  /** The drop target took it: in a mouth, a tray, the cauldron, or paint on a bug. */
  dropInto(target: DropTarget, entity: Entity): void {
    _dropInto(this, target, entity);
  }

  /** An upside-down bug on the porch boards: it hangs with the spider and they share a crumb. */
  upsideDownAt(bug: Entity, x: number, y: number): void {
    _upsideDownAt(this, bug, x, y);
  }

  /** A ghost bug drifting through the lattice spooks Whiff, who spooks everyone. */
  ghostAt(bug: Entity, x: number, y: number): void {
    _ghostAt(this, bug, x, y);
  }

  /** Ghosts pass through the lattice panel. */
  ghostThrough(a: EntityId, b: EntityId): boolean {
    return _ghostThrough(this, a, b);
  }

  isGhost(id: EntityId): boolean {
    return _isGhost(this, id);
  }

  /**
   * The first scene of a new world (game design doc, section 17): Dot
   * asleep on the bottle cap with a red berry beside her, a little peckish,
   * so hovering her shows a berry thought.
   */
  stageIntro(): void {
    _stageIntro(this);
  }

  poke(x: number, y: number): void {
    _poke(this, x, y);
  }

  /** Target lookup for the AI: where an entity is and how big it is. */
  private targetInfo(id: EntityId): TargetInfo | null {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const s = this.physics.getState(id);
    const scale = this.potions.scaleOf(entity);
    const shape: ShapeSpec =
      entity.kind === 'bug'
        ? { type: 'circle', radius: this.bugDef(entity).radius }
        : scaleShape(this.content.items.get(entity.defId).shape, scale);
    const ext = halfExtents(shape, s.angle);
    const box = shape.type === 'box' ? shape : null;
    return {
      defId: entity.defId,
      kind: entity.kind,
      x: s.x,
      y: s.y,
      // The spring is hopped onto along its own axis, so report its true height.
      halfWidth: ext.w,
      halfHeight: box ? box.height / 2 : ext.h,
      angle: s.angle,
      held: this.physics.grabbed === id,
      ...(this.isPotion(entity) ? { drink: true } : {}),
      ...(entity.toasted ? { toasted: true } : {}),
    };
  }

  /**
   * Everything items offer bugs right now, as seen by bug `self`. Player
   * setups still offer what can be done in place (bounce, sniff, nap by), but
   * never eat or carry: the setup rule. Anything the bug has not sniffed yet
   * offers `inspect`, with a bonus while the player's touch is fresh.
   */
  private advertsFor(self: EntityId): AdvertCandidate[] {
    const claimedBy = new Map<EntityId, EntityId>();
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      if (
        b &&
        b.targetId !== null &&
        b.action !== 'inspect' &&
        (b.mode === 'st_seek' || b.mode === 'st_eat' || b.mode === 'st_use')
      )
        claimedBy.set(b.targetId, bug.id);
      if (b && b.carrying !== null) claimedBy.set(b.carrying, bug.id);
    }
    const out: AdvertCandidate[] = [];
    const selfEntity = this.entities.get(self);
    const brain = selfEntity?.bug;
    const selfX = selfEntity ? this.physics.getState(self).x : 0;
    const selfDef = selfEntity ? this.content.bugs.get(selfEntity.defId) : null;
    const skater = selfDef?.swim === 'skate';
    for (const item of this.entities.ofKind('item')) {
      if (this.physics.grabbed === item.id || this.isSleeping(item.id)) continue;
      if (!this.physics.isActive(item.id)) continue; // in someone's mouth or legs
      const s = this.physics.getState(item.id);
      if (Math.abs(s.x - selfX) > PERCEPTION * 3) continue;
      // Only skaters go after things out on the water.
      if (!skater && this.environment.overOpenWater(s.x)) continue;
      const def = this.content.items.get(item.defId);
      // The player's things, what leans on them, and what sits right beside them are off limits.
      const setup = this.setupLinked().has(item.id) || this.bugWorld().setupNear(s.x, s.y, 0.9, item.id);
      const owner = claimedBy.get(item.id);
      const claimed = owner !== undefined && owner !== self;
      const base = { id: item.id, defId: item.defId, x: s.x, y: s.y, claimed };
      for (const advert of def.adverts) {
        // A spring on its side is not bounceable.
        if (advert.action === 'bounce' && Math.abs(s.angle) > 0.5) continue;
        // Never eat, carry, or nap on top of the player's things.
        if (setup && (advert.action === 'eat' || advert.action === 'carry' || advert.action === 'sleep'))
          continue;
        // Bouncing near the player's things might land on them.
        if (advert.action === 'bounce' && this.setupNearExcept(s.x, 3, item.id)) continue;
        out.push({ ...base, action: advert.action, needs: advert.needs });
      }
      if (brain && !brain.inspected.includes(item.id))
        out.push({
          ...base,
          claimed: false,
          action: 'inspect',
          needs: { need_fun: 8 },
          fresh: this.setup.fresh(item.id),
        });
      if (!selfDef || setup) continue;
      // Moose lifts heavy things over his head; Barty rolls round things along.
      if (
        selfDef.habits.strong &&
        def.tags.includes('tag_heavy') &&
        !def.unpocketable &&
        this.physics.mass(item.id) < 1.5
      )
        out.push({ ...base, action: 'lift', needs: { need_fun: 18 } });
      if (
        selfDef.habits.rollsBalls &&
        def.shape.type === 'circle' &&
        def.shape.radius >= 0.12 &&
        def.shape.radius <= 0.36
      )
        out.push({
          ...base,
          action: 'roll',
          needs: { need_fun: 16 },
          // His ball is his pride and joy.
          bonus: item.defId === 'item_dung_ball' ? 10 : 2,
        });
    }
    // Moose frees friends stuck in something sticky.
    if (selfDef?.habits.strong)
      for (const stuck of this.stuckBugs()) {
        if (stuck === self || this.isSleeping(stuck)) continue;
        const s = this.physics.getState(stuck);
        if (Math.abs(s.x - selfX) > PERCEPTION) continue;
        const e = this.entities.get(stuck)!;
        out.push({
          id: stuck,
          defId: e.defId,
          x: s.x,
          y: s.y,
          claimed: claimedBy.has(stuck) && claimedBy.get(stuck) !== self,
          action: 'lift',
          needs: { need_social: 20, need_fun: 6 },
          like: 1.5,
          bonus: 20,
        });
      }
    return out;
  }

  /** Bugs stuck to something by a sticky weld (gum). */
  private stuckBugs(): EntityId[] {
    const out: EntityId[] = [];
    for (const k of this.environment.state.sticks)
      for (const id of [k.a, k.b]) if (this.entities.get(id)?.bug && !out.includes(id)) out.push(id);
    return out.sort((a, b) => a - b);
  }

  /**
   * The setup rule's walk-force cap (game design doc, section 5): a bug
   * walking, turning, or standing against a player setup (or anything
   * leaning on one) never pushes into it. Any velocity into the contact is
   * taken away before physics runs. Flung and curled-up bugs are the
   * player's doing and keep theirs.
   */
  capWalkForces(): void {
    _capWalkForces(this);
  }

  /**
   * A walking bug brushing the side of a player setup (or anything leaning
   * on one) slips past it instead of shoving it: the walk-force cap. Standing
   * on top still works, and flung or curled-up bugs hit things for real.
   */
  softContact(a: EntityId, b: EntityId, ny: number): boolean {
    return _softContact(this, a, b, ny);
  }

  /** Is this bug moving because the player just grabbed, flung, or poked it? Then it hits for real. */
  byPlayer(bug: Entity): boolean {
    return _byPlayer(this, bug);
  }

  /** Is this thing leaning on a player setup (so pushing it would push the setup)? */
  touchesSetup(id: EntityId): boolean {
    return _touchesSetup(this, id);
  }

  linkedCache: { tick: number; ids: Set<EntityId> } | null = null;
  /** Bug and setup pairs passing through each other (the setup rule), and the last tick they did. Not saved. */
  readonly passing = new Map<number, number>();

  /**
   * Player setups plus every item touching them, directly or through other
   * items: a bug pushing any of these would push the player's work.
   */
  setupLinked(): Set<EntityId> {
    return _setupLinked(this);
  }

  boxOf(id: EntityId): { x0: number; x1: number; y0: number; y1: number } {
    return _boxOf(this, id);
  }

  /** Is part of a player setup (other than `except`) within `reach` of x? */
  setupNearExcept(x: number, reach: number, except: EntityId): boolean {
    return _setupNearExcept(this, x, reach, except);
  }

  private updateBugs(): void {
    const held = this.physics.grabbed;
    const heldEntity = held === null ? undefined : this.entities.get(held);
    let offered: { x: number; y: number; defId: string } | null = null;
    if (heldEntity?.kind === 'item' && this.content.items.get(heldEntity.defId).tags.includes('tag_edible')) {
      const s = this.physics.getState(heldEntity.id);
      offered = { x: s.x, y: s.y, defId: heldEntity.defId };
    }
    for (const entity of this.entities.ofKind('bug')) {
      if (this.isSleeping(entity.id)) continue;
      // Walking about on its own, it slips past things at rest; flung or curled up, it hits them.
      this.physics.setGentle(entity.id, !this.byPlayer(entity) && !this.rolling.has(entity.id));
      const def = this.bugDef(entity);
      const state = this.physics.getState(entity.id);
      const graceUntil = this.launchGrace.get(entity.id);
      const inGrace = graceUntil !== undefined && this.tick < graceUntil;
      if (graceUntil !== undefined && !inGrace) this.launchGrace.delete(entity.id);
      let adverts: AdvertCandidate[] | null = null;
      const home = this.content.areas.tryGet(def.home);
      const onWater = this.environment.skating.has(entity.id);
      // Up in a balloon basket, it just rides along and looks out until it lands.
      const ride = this.rideVelocity(entity.id);
      if (ride.aloft && this.physics.grabbed !== entity.id) continue;
      const world = this.bugWorld();
      const support = inGrace ? null : this.supportFor(entity, state, def, onWater);
      const decision = updateBug(entity, {
        tick: this.tick,
        id: entity.id,
        world,
        sky: this.skyFor(entity, def),
        def,
        state,
        held: held === entity.id,
        support,
        submerged: this.environment.submerged.get(entity.id) ?? 0,
        overWater: (x) => this.environment.overOpenWater(x),
        shore: this.environment.shoreFrom(state.x),
        frozen: this.hasTag(entity.id, 'tag_frozen'),
        // Shut in a hidden area, home is out of reach: no pining at the wall.
        home: home && !this.hidden.hiddenAt(state.x) ? { x0: home.xStart, x1: home.xEnd } : null,
        reach: this.barriers.span(state.x),
        hand: this.hand,
        drowsy: !!entity.effects && !!this.potions.has(entity, 'sleepy'),
        impact: inGrace ? 0 : (this.bugImpacts.get(entity.id) ?? 0),
        worldWidth: this.worldWidth,
        rng: this.rng,
        offered,
        adverts: () => (adverts ??= this.advertsFor(entity.id)),
        target: (id) => this.targetInfo(id),
        obstacle: (dir) => {
          const id = this.physics.blockedBy(entity.id, dir);
          const other = id === null ? undefined : this.entities.get(id);
          const info = id === null ? null : this.targetInfo(id);
          if (!other || !info) return null;
          return {
            id: other.id,
            isBug: other.kind === 'bug',
            top: info.y - info.halfHeight,
            setup: other.kind === 'item' && (this.setup.has(other.id) || this.touchesSetup(other.id)),
          };
        },
      });
      const v = decision.velocity;
      // Standing still on flat ground, a bug is left to rest, so it (and what it leans on) can sleep.
      const resting =
        v !== null &&
        !ride.moving &&
        Math.abs(v.x) < 1e-6 &&
        Math.abs(v.y) <= 0.11 &&
        Math.abs(state.vx) < 0.05 &&
        Math.abs(state.vy) < 0.05 &&
        support !== null &&
        Math.abs(support.x) < 0.02 &&
        !onWater;
      if (v && !resting && Number.isFinite(v.x) && Number.isFinite(v.y)) {
        // Standing on a moving toy (the balloon basket, a racer, a seesaw), it goes along with it.
        // Riding a toy, it just stands: no push into the floor that would drag the toy down.
        const stand = ride.moving && Math.abs(v.y) < 0.15 ? 0 : v.y;
        this.physics.setVelocity(entity.id, v.x + ride.x, stand + ride.y);
      }
      if (decision.throw) this.pendingThrows.set(decision.throw.itemId, decision.throw);
      if (decision.take) this.takeInMouth(entity, decision.take.itemId, decision.take.liking, false);
      if (decision.eat) {
        const item = this.entities.get(decision.eat.itemId);
        if (item && this.nibbled(entity, item)) {
          // A caterpillar takes a bite out of a leaf and leaves the rest, full of holes.
        } else if (item && this.isPotion(item)) {
          this.drink(entity, item);
        } else if (item) {
          const s = this.physics.getState(item.id);
          this.ateEffects(entity, item);
          this.remove(item.id);
          this.events.emit('bug_ate', {
            id: entity.id,
            defId: entity.defId,
            itemId: item.id,
            itemDefId: item.defId,
            liking: decision.eat.liking,
            x: s.x,
            y: s.y,
          });
        }
      }
      if (decision.spit) this.spit(entity, decision.spit.itemId);
      for (const notice of decision.notices) this.emitNotice(entity, notice, state);
      if (decision.wriggle && this.physics.grabbed === entity.id) {
        this.physics.release();
        releaseBug(entity.bug!, def, false, state.y);
        this.physics.setVelocity(entity.id, entity.bug!.facing * 1.5, -5);
        this.events.emit('bug_wriggled_free', { id: entity.id, defId: entity.defId, x: state.x, y: state.y });
      }
      // Anything that stops a bug chewing makes it drop its food.
      const brain = entity.bug;
      if (brain && brain.mouthful !== null && brain.mode !== 'st_eat') {
        const itemId = brain.mouthful;
        brain.mouthful = null;
        if (this.entities.has(itemId)) {
          this.aboveGround(itemId);
          this.physics.setActive(itemId, true);
        }
      }
      this.syncRolling(entity);
      if (def.habits.slimeTrail) this.environment.slime(entity, state, def.radius);
    }
    this.bugImpacts.clear();
  }

  /**
   * What a bug stands on. Upside down (a potion), it stands on whatever is
   * over it: a roof, the boards, or the top of the sky.
   */
  private supportFor(
    entity: Entity,
    state: BodyState,
    def: BugDef,
    onWater: boolean,
  ): { x: number; y: number } | null {
    if (entity.effects && this.physics.gravityScale(entity.id) < 0) {
      if (state.y - def.radius <= SKY_TOP + 0.03) return { x: 0, y: -1 };
      return this.physics.supportNormal(entity.id, true);
    }
    return this.physics.supportNormal(entity.id) ?? (onWater ? { x: 0, y: -1 } : null);
  }

  // --- The bug AI's view of the world -----------------------------------------

  /** Things bugs threw this step, waiting to leave their legs. */
  private readonly pendingThrows = new Map<EntityId, { vx: number; vy: number; to: EntityId }>();
  /** The flat top of each area's highest ground, for Dot's poses. */
  summits: Map<string, { x0: number; x1: number; y: number } | null> | null = null;

  /** What the bug AI can ask about the world, built once per step. */
  bugWorld(): BugWorld & { setups: { id: EntityId; x0: number; x1: number; y0: number; y1: number }[] } {
    return _bugWorld(this);
  }

  /** How much two bug defs like each other now: the table, plus what play has changed. */
  affinityOf(a: string, b: string): number {
    if (a === b) return 1;
    const v = baseAffinity(a, b) + (this.affinity[pairKey(a, b)] ?? 0);
    return Math.max(-1, Math.min(1, v));
  }

  /** Nudge a pair's affinity (sharing food +0.05, bumped while flung -0.02). */
  nudgeAffinity(a: string, b: string, delta: number): void {
    if (a === b || !Number.isFinite(delta)) return;
    const key = pairKey(a, b);
    const next = Math.round(((this.affinity[key] ?? 0) + delta) * 1000) / 1000;
    const base = baseAffinity(a, b);
    this.affinity[key] = Math.max(-1 - base, Math.min(1 - base, next));
  }

  /** The flat top of the highest ground in the area around x, at least 1.5 m up. */
  summitOf(x: number): { x0: number; x1: number; y: number } | null {
    return _summitOf(this, x);
  }

  /** The dry spot nearest x from which a bug can hop into water, and which way the water lies. */
  waterEdge(x: number): { x: number; dir: 1 | -1 } | null {
    return _waterEdge(this, x);
  }

  // --- Carrying ----------------------------------------------------------------

  /**
   * Things go into and out of bugs' front legs as their brains say: picked
   * up, handed over, snatched, thrown, or set down.
   */
  private syncCarried(): void {
    const physics = this.physics;
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      const c = b?.carrying ?? null;
      if (!b || c === null) continue;
      const item = this.entities.get(c);
      if (!item || item.kind !== 'item') {
        b.carrying = null;
        continue;
      }
      const holder = this.carried.get(c);
      if (holder === bug.id) continue;
      if (holder !== undefined) {
        // Handed over, snatched, or caught.
        const other = this.entities.get(holder)?.bug;
        if (other && other.carrying === c) other.carrying = null;
        this.carried.set(c, bug.id);
        continue;
      }
      if (physics.grabbed === c || !physics.isActive(c) || this.isSleeping(c)) {
        b.carrying = null;
        continue;
      }
      this.environment.unstickAll(c);
      physics.setActive(c, false);
      this.carried.set(c, bug.id);
      this.thrown.delete(c);
      this.events.emit('bug_picked_up', { id: bug.id, defId: bug.defId, itemId: c, itemDefId: item.defId });
    }
    const owners = this.mouthOwners();
    for (const [itemId, bugId] of [...this.carried].sort((a, b) => a[0] - b[0])) {
      const bug = this.entities.get(bugId);
      if (bug?.bug?.carrying === itemId) continue;
      this.carried.delete(itemId);
      // An umbrella let go of any way at all (a tumble, a hop) is down.
      if (bug?.bug?.umbrella) {
        bug.bug.umbrella = false;
        this.events.emit('bug_umbrella', { id: bugId, defId: bug.defId, itemId, on: false });
      }
      const throwing = this.pendingThrows.get(itemId);
      if (!this.entities.has(itemId) || owners.has(itemId)) continue;
      let hand = bug?.bug ? this.handOf(bug) : this.physics.getState(itemId);
      const item = this.entities.get(itemId)!;
      const ext = halfExtents(this.content.items.get(item.defId).shape, 0);
      const half = ext.h;
      // Set down (not thrown) against the player's setup, it goes on the bug's other side (the setup rule).
      if (bug && !throwing && this.setupNearExcept(hand.x, ext.w + 0.2, itemId)) {
        const bx = this.physics.getState(bug.id).x;
        const other = { x: 2 * bx - hand.x, y: hand.y };
        if (!this.setupNearExcept(other.x, ext.w + 0.2, itemId)) hand = other;
      }
      const floor = this.terrain.surfaceY(hand.x) - half - 0.01;
      physics.place(itemId, hand.x, Math.min(hand.y, floor), 0);
      physics.setActive(itemId, true);
      if (throwing) {
        physics.setVelocity(itemId, throwing.vx, throwing.vy);
        this.events.emit('bug_threw', {
          id: bugId,
          defId: bug?.defId ?? '',
          itemId,
          x: hand.x,
          y: hand.y,
          vx: throwing.vx,
          vy: throwing.vy,
        });
      } else {
        physics.setVelocity(itemId, 0, 0.5);
        this.events.emit('bug_put_down', {
          id: bugId,
          defId: bug?.defId ?? '',
          itemId,
          x: hand.x,
          y: hand.y,
        });
      }
    }
    this.pendingThrows.clear();
  }

  /** Where a bug holds things: in its front legs, or overhead for an umbrella. */
  private handOf(bug: Entity): { x: number; y: number } {
    const s = this.physics.getState(bug.id);
    const r = this.bugDef(bug).radius;
    if (bug.bug?.umbrella) return { x: s.x + (bug.bug.facing ?? 1) * r * 0.1, y: s.y - r * 1.3 - 0.08 };
    const held = bug.bug?.carrying ?? null;
    const half = held !== null && this.entities.has(held) ? this.halfHeightOf(this.entities.get(held)!) : 0;
    // Moose holds heavy things up over his head.
    if (bug.bug?.overhead) return { x: s.x, y: s.y - r - half - 0.12 };
    // Barty rolls his ball along the ground behind him (he walks backward).
    if (bug.bug?.rolling) {
      const x = s.x - (bug.bug.facing ?? 1) * (r + half + 0.04);
      return { x, y: this.terrain.surfaceY(x) - half - 0.02 };
    }
    return handPoint(s.x, s.y, r, bug.bug?.facing ?? 1);
  }

  /** Carried things ride along in their bug's front legs. */
  private placeCarried(): void {
    for (const [itemId, bugId] of this.carried) {
      const bug = this.entities.get(bugId);
      if (!bug || !this.entities.has(itemId)) continue;
      const hand = this.handOf(bug);
      const def = this.content.items.get(this.entities.get(itemId)!.defId);
      const floor = this.terrain.surfaceY(hand.x) - halfExtents(def.shape, 0).h;
      this.physics.place(itemId, hand.x, Math.min(hand.y, floor), 0);
    }
  }

  /** Set down whatever a bug is carrying, at its feet. `asleep` keeps it asleep with its area. */
  putDown(bugId: EntityId, asleep = false): void {
    const bug = this.entities.get(bugId);
    const b = bug?.bug;
    if (!bug || !b || b.carrying === null) return;
    const itemId = b.carrying;
    b.carrying = null;
    this.carried.delete(itemId);
    const item = this.entities.get(itemId);
    if (!item) return;
    const s = this.physics.getState(bugId);
    const ext = halfExtents(this.content.items.get(item.defId).shape, 0);
    const half = ext.h;
    // In front of the bug, or behind it if that would set it against the player's setup (the setup rule).
    const reach = this.bugDef(bug).radius + 0.3;
    const clear = ext.w + 0.25;
    const front = s.x + b.facing * reach;
    const back = s.x - b.facing * reach;
    const x = !this.setupNearExcept(front, clear, itemId)
      ? front
      : !this.setupNearExcept(back, clear, itemId)
        ? back
        : s.x;
    this.physics.place(itemId, x, this.terrain.surfaceY(x) - half - 0.02, 0);
    if (asleep) this.sleeping.add(itemId);
    else this.physics.setActive(itemId, true);
  }

  /** Is this item in a bug's front legs? */
  carrierOf(itemId: EntityId): EntityId | null {
    return this.carried.get(itemId) ?? null;
  }

  /**
   * Games of catch: a throw that reaches the front legs of the bug whose
   * turn it is gets caught.
   */
  private catchThrows(): void {
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      const s = b?.social;
      if (!b || !s || s.kind !== 'soc_catch' || b.mode !== 'st_social' || b.carrying !== null) continue;
      if (this.isSleeping(bug.id) || this.physics.grabbed === bug.id) continue;
      const partner = this.entities.get(s.partner);
      if (!partner?.bug) continue;
      const lead = s.role === 'lead' ? s : partner.bug.social;
      if (!lead || lead.kind !== 'soc_catch' || lead.item === null || lead.beat <= 0) continue;
      const leadId = s.role === 'lead' ? bug.id : partner.id;
      const followId = s.role === 'lead' ? partner.id : bug.id;
      if (catchTurn(leadId, followId, lead) !== bug.id) continue;
      const item = lead.item;
      if (!this.entities.has(item) || this.carried.has(item) || this.physics.grabbed === item) continue;
      if (!this.physics.isActive(item)) continue;
      const hand = this.handOf(bug);
      const is = this.physics.getState(item);
      if (Math.hypot(is.x - hand.x, is.y - hand.y) > 0.62) continue;
      b.carrying = item;
      b.timer = CATCH_WINDUP;
      b.facing = partner && this.physics.getState(partner.id).x >= this.physics.getState(bug.id).x ? 1 : -1;
      lead.beat = 0;
      this.carried.set(item, bug.id);
      this.physics.setActive(item, false);
      this.physics.place(item, hand.x, hand.y, 0);
      this.events.emit('bug_caught', { id: bug.id, defId: bug.defId, itemId: item, x: hand.x, y: hand.y });
    }
  }

  // --- Loud things -------------------------------------------------------------

  /** Something loud happened: bugs nearby will turn and look. */
  noteLoud(x: number, y: number, victim: EntityId | null = null): void {
    this.loud.push({ x, y, victim });
  }

  /** Idle bugs near a crash turn to look (`soc_gawk`); nervous ones hide or curl up. */
  private gawk(): void {
    const loud = this.loud;
    if (loud.length === 0) return;
    this.loud = [];
    this.worldCache = null;
    const world = this.bugWorld();
    for (const src of loud) {
      for (const o of world.bugs()) {
        if (o.id === src.victim || o.held) continue;
        if (Math.hypot(o.x - src.x, o.y - src.y) > GAWK_RANGE) continue;
        const entity = this.entities.get(o.id)!;
        const friend = friendNear(world.bugs(), o.id, o.def, o.x, 3, (a, b) => this.affinityOf(a, b));
        const notices = gawkBug(o.brain, o.def, o.x, src, this.rng, this.tick, {
          friend,
          cover: world.cover(o.x, src.x),
        });
        if (notices.length === 0) continue;
        o.brain.decideIn = Math.min(o.brain.decideIn, 2);
        this.puff(entity);
        const victim = src.victim === null ? undefined : this.entities.get(src.victim)?.bug;
        if (victim) victim.audience++;
        for (const n of notices) this.emitNotice(entity, n, this.physics.getState(o.id));
      }
    }
  }

  emitNotice(self: Entity, notice: BugNotice, selfState: BodyState): void {
    _emitNotice(this, self, notice, selfState);
  }

  // --- Day, night, and weather -----------------------------------------------

  /** What a bug's AI knows about the time and the weather where it stands. */
  private skyFor(bug: Entity, def: BugDef): BugSky {
    const w = this.weather;
    return {
      bedtime: w.bedtime(def, bug.id),
      evening: w.eveningFor(def),
      rain: w.raining && !this.sheltered(bug),
      raining: w.raining,
      wind: this.environment.state.wind,
      dark: w.dark,
    };
  }

  /** Out under the sky in an open area: not under a roof, and not behind a locked barrier. */
  outdoors(x: number, y: number): boolean {
    const area = this.areaOf(x);
    if (!this.barriers.isOpen(area.id)) return false;
    const roof = area.roof;
    return !(roof && x >= area.xStart + roof.x0 && x <= area.xStart + roof.x1 && y > roof.y);
  }

  /** Does this thing glow: a glowing item, or a bug like Flick? */
  glows(e: Entity): boolean {
    if (e.kind === 'bug') return !!this.content.bugs.get(e.defId).glows || this.wardrobe.has(e, 'glow');
    return this.hasTag(e.id, 'tag_glowing');
  }

  /**
   * Out of the rain: something is overhead (a leaf held up as an umbrella,
   * or anything with a body within 8 m straight above), or it is under water.
   */
  sheltered(e: Entity): boolean {
    if (e.bug?.umbrella && e.bug.carrying !== null) return true;
    if (!this.physics.has(e.id) || !this.physics.isActive(e.id)) return true;
    const s = this.physics.getState(e.id);
    const half = this.halfHeightOf(e);
    return this.physics.coveredAbove(e.id, s.x, s.y - half * 0.6, SHELTER_REACH);
  }

  /** The camera came out or went away (photo mode). Bugs in frame react by personality. */
  setPhotoMode(open: boolean): void {
    if (open === (this.photo !== null)) return;
    if (!open) {
      this.photo = null;
      this.events.emit('photo_mode_closed', {});
      return;
    }
    this.photo = { at: this.tick, frozen: false };
    const view = this.view0();
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || b.pending || this.isSleeping(bug.id) || b.mode === 'st_sleep') continue;
      if (!inFrame(this.physics.getState(bug.id).x, view)) continue;
      this.reactBug(bug, 'camera');
    }
    this.events.emit('photo_mode_opened', { x0: view.x0, x1: view.x1 });
  }

  /** Four bugs stacked and still for two seconds strike a pose: the totem secret (checked every 15 ticks). */
  private totem(): void {
    const bugs = this.bugWorld().bugs();
    const stack = findTotem(bugs);
    this.totemTicks = stack ? this.totemTicks + 15 : 0;
    if (!stack || this.totemTicks < TOTEM_TICKS) return;
    this.totemTicks = -TOTEM_TICKS * 4;
    const top = bugs.find((b) => b.id === stack[stack.length - 1])!;
    for (const id of stack) {
      const bug = this.entities.get(id);
      if (bug) this.reactBug(bug, 'camera');
    }
    this.events.emit('totem_made', { ids: stack, x: top.x, y: top.y });
    this.findSecret('secret_bug_totem', top.x, top.y);
  }

  /**
   * A secret was found: the first time, it is logged and announced. A
   * blocked secret, or one whose prerequisites are not all found yet, does
   * not fire (section 12's "Requires"). True if it was found just now.
   */
  findSecret(id: string, x: number, y: number): boolean {
    if (Sim.strict && !this.content.secrets.has(id)) throw new Error(`Unknown secret: ${id}`);
    if (!this.canFind(id)) return false;
    this.secrets.push(id);
    this.events.emit('secret_found', { id, x, y });
    return true;
  }

  /** Could `id` be found now: not found yet, not blocked, and its prerequisites found? */
  canFind(id: string): boolean {
    if (this.secrets.includes(id)) return false;
    const def = this.content.secrets.tryGet(id);
    // An ID the content lacks is never found: it would sit in the save as a secret that is not one.
    if (!def || def.blocked) return false;
    return (def.requires ?? []).every((r) => this.secrets.includes(r));
  }

  /** The journal as pages (M10), from the saved state. Pure read; the renderer draws it. */
  book(): JournalBook {
    return journalBook({
      content: this.content,
      secrets: this.secrets,
      journal: this.journal.state,
      made: this.bench.state.made,
      hinted: this.bench.state.hinted,
    });
  }

  /** The world x range the camera shows, or the whole world when nobody is watching. */
  view0(): { x0: number; x1: number } {
    return this.focus ?? { x0: 0, x1: this.worldWidth };
  }

  /** Something wonderful in the sky over x: bugs that are up turn and look (a shooting star, a rainbow). */
  lookUp(x: number, y: number): void {
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || this.isSleeping(bug.id)) continue;
      if (b.mode !== 'st_idle' && b.mode !== 'st_wander') continue;
      const s = this.physics.getState(bug.id);
      if (Math.abs(s.x - x) > 12 || !this.physics.isSupported(bug.id)) continue;
      for (const n of wonderBug(b, s.x, x, this.rng, this.tick)) this.emitNotice(bug, n, s);
      this.events.emit('bug_gawked', { id: bug.id, defId: bug.defId, x, y });
    }
  }

  /**
   * What a meal leaves behind: hot food makes the eater hot, cold food
   * cold; bouncy food makes it hop; soap comes back up as a bubbly burp.
   */
  /**
   * Munch nibbles leaves: each meal is a bite, and the leaf stays in the
   * world with a hole in it until the third bite finishes it. True if it
   * was only a nibble.
   */
  private nibbled(bug: Entity, food: Entity): boolean {
    const def = this.content.bugs.get(bug.defId);
    if (!def.habits.metamorphosis || !this.hasTag(food.id, 'tag_leafy')) return false;
    if (bug.bug) bug.bug.leafy = (bug.bug.leafy ?? 0) + 1;
    const bites = (food.bites ?? 0) + 1;
    if (bites >= 3) return false;
    food.bites = bites;
    this.aboveGround(food.id);
    this.physics.setActive(food.id, true);
    const s = this.physics.getState(food.id);
    this.events.emit('bug_nibbled', { id: bug.id, defId: bug.defId, itemId: food.id, bites, x: s.x, y: s.y });
    return true;
  }

  /** Startled, a stink bug lets off a green cloud (at most every few seconds), then fans it away. */
  puff(bug: Entity, react_ = true): void {
    const b = bug.bug;
    if (!b || b.pending || !this.content.bugs.get(bug.defId).habits.stinkCloud) return;
    if (b.puffedAt !== undefined && this.tick - b.puffedAt < STINK_EVERY) return;
    b.puffedAt = this.tick;
    this.addTag(bug.id, 'tag_smelly', 'stink', STINK_SECONDS);
    const s = this.physics.getState(bug.id);
    this.events.emit('stink_cloud', { id: bug.id, x: s.x, y: s.y });
    if (react_) this.emitNotice(bug, react(b, 'puff', this.rng, this.tick), s);
  }

  private ateEffects(bug: Entity, food: Entity): void {
    const brain = bug.bug;
    if (!brain) return;
    const def = this.content.bugs.get(bug.defId);
    // Whiff eats mint hoping to smell nice. A green cloud comes out anyway.
    if (def.habits.stinkCloud && food.defId === 'item_mint_leaf') {
      brain.puffedAt = undefined;
      this.puff(bug, false);
    }
    if (def.habits.metamorphosis && this.hasTag(food.id, 'tag_leafy')) brain.leafy = (brain.leafy ?? 0) + 1;
    // Munch eats paper and burps confetti.
    if (food.defId === 'item_paper_scrap' && brain.burpAt < 0) brain.burpAt = this.tick + 60;
    if (this.hasTag(food.id, 'tag_hot')) this.addTag(bug.id, 'tag_hot', 'food');
    if (this.hasTag(food.id, 'tag_cold')) this.addTag(bug.id, 'tag_cold', 'food');
    if (this.hasTag(food.id, 'tag_bouncy')) brain.hopAt = this.tick + BOUNCY_HOP_DELAY;
    if (this.hasTag(food.id, 'tag_soapy') && brain.burpAt < 0) brain.burpAt = this.tick + 70;
  }

  // --- Tags ------------------------------------------------------------------

  /** An entity's default tags: its item def's plus its material's. Bugs have none. */
  defaultTags(entity: Entity): readonly string[] {
    if (entity.kind === 'bug') return NO_TAGS;
    let tags = this.defaultTagCache.get(entity.defId);
    if (!tags) {
      const def = this.content.items.get(entity.defId);
      const mat = MATERIALS[def.material]?.tags ?? [];
      tags = mat.length === 0 ? def.tags : [...new Set([...def.tags, ...mat])];
      this.defaultTagCache.set(entity.defId, tags);
    }
    return tags;
  }

  /** Each item def's tags with its material's, worked out once. */
  private readonly defaultTagCache = new Map<string, readonly string[]>();

  hasTag(id: EntityId, tag: string): boolean {
    const e = this.entities.get(id);
    return !!e && tagOn(e.tags, this.defaultTags(e), tag, this.tick);
  }

  tagsOf(id: EntityId): string[] {
    const e = this.entities.get(id);
    return e ? effectiveTags(e.tags, this.defaultTags(e), this.tick) : [];
  }

  /**
   * Turn a tag on (for `seconds`, or its usual time). Hot and wet on the same
   * thing cancel out in steam (rule R2), and so do hot and frozen (R4).
   */
  addTag(id: EntityId, tag: string, cause: TagCause, seconds?: number | null): boolean {
    const e = this.entities.get(id);
    if (!e) return false;
    // The yarn beanie keeps its wearer warm.
    if (tag === 'tag_cold' && e.wearing && this.wardrobe.has(e, 'warm')) return false;
    const defaults = this.defaultTags(e);
    e.tags ??= {};
    const gained = addTag(e.tags, defaults, tag, this.tick, seconds);
    if (gained) this.emitTag('tag_gained', e, tag, cause);
    if (tag === 'tag_wet' && this.hasTag(id, 'tag_hot')) {
      this.removeTag(id, 'tag_wet', 'steam');
      this.removeTag(id, 'tag_hot', 'steam', 20);
      const s = this.physics.getState(id);
      this.events.emit('steamed', { id, otherId: null, x: s.x, y: s.y });
    } else if (tag === 'tag_hot' && this.hasTag(id, 'tag_frozen')) this.environment.thaw(id);
    this.tidyTags(e);
    return gained;
  }

  /** Turn a tag off. Default tags come back after `seconds`, if given. */
  removeTag(id: EntityId, tag: string, cause: TagCause, seconds: number | null = null): boolean {
    const e = this.entities.get(id);
    if (!e) return false;
    e.tags ??= {};
    const lost = removeTag(e.tags, this.defaultTags(e), tag, this.tick, seconds);
    if (lost) this.emitTag('tag_lost', e, tag, cause);
    this.tidyTags(e);
    return lost;
  }

  private tidyTags(e: Entity): void {
    if (e.tags && Object.keys(e.tags).length === 0) delete e.tags;
  }

  private emitTag(name: 'tag_gained' | 'tag_lost', e: Entity, tag: string, cause: TagCause): void {
    const s = this.physics.getState(e.id);
    // Washed clean: the paint goes with the tag.
    if (name === 'tag_lost' && tag === 'tag_painted') delete e.paint;
    this.events.emit(name, { id: e.id, tag, cause, x: s.x, y: s.y });
    if (tag === 'tag_wet' || tag === 'tag_frozen') this.refreshFriction(e);
  }

  /** Wear off timed tags. Melting ice leaves things wet. */
  expire(e: Entity): void {
    if (!e.tags) return;
    const { lost, returned } = expireTags(e.tags, this.defaultTags(e), this.tick);
    for (const tag of lost) {
      this.emitTag('tag_lost', e, tag, 'wore_off');
      if (tag === 'tag_frozen') {
        this.addTag(e.id, 'tag_wet', 'thaw');
        const s = this.physics.getState(e.id);
        this.events.emit('thawed', { id: e.id, x: s.x, y: s.y });
      }
    }
    for (const tag of returned) this.emitTag('tag_gained', e, tag, 'returned');
    this.tidyTags(e);
  }

  /** Set each body's friction from its tags: wet grips less, frozen slides. */
  refreshFriction(only?: Entity): void {
    for (const e of only ? [only] : this.entities.all()) {
      if (!this.physics.has(e.id)) continue;
      // Bottle-cap skates: the wearer rolls almost without friction.
      const base =
        e.kind === 'bug'
          ? BUG_FRICTION * (e.wearing && this.wardrobe.has(e, 'skates') ? 0.1 : 1)
          : this.content.items.get(e.defId).friction;
      const k = this.hasTag(e.id, 'tag_frozen')
        ? FROZEN_FRICTION
        : this.hasTag(e.id, 'tag_wet')
          ? WET_FRICTION
          : 1;
      const want = base * k;
      if (Math.abs(this.physics.friction(e.id) - want) > 1e-9) this.physics.setFriction(e.id, want);
    }
  }

  /** The hardest hit this bug took in the last physics step (m/s), or 0. */
  bugImpact(id: EntityId): number {
    return this.bugImpacts.get(id) ?? 0;
  }

  /** Turn a bug's notice into events (for systems outside the AI, like the cast). */
  bugNotice(bug: Entity, notice: BugNotice): void {
    this.emitNotice(bug, notice, this.physics.getState(bug.id));
  }

  /** Curl up for a nap right here (a bug put in the cobweb hammock). */
  napHere(bug: Entity): void {
    const b = bug.bug;
    if (!b || b.pending || b.mode === 'st_sleep' || this.physics.grabbed === bug.id) return;
    const s = this.physics.getState(bug.id);
    for (const n of napBug(b, this.content.bugs.get(bug.defId), s.x)) this.emitNotice(bug, n, s);
  }

  /**
   * Thrown by the world, not the player (the bucket lift tipping out): it
   * flies at (vx, vy). A bug takes it as a hop of its own, so it lands on
   * its feet without getting dizzy.
   */
  tossed(id: EntityId, vx: number, vy: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    this.physics.setVelocity(id, vx, vy);
    const b = e.bug;
    if (!b) return;
    releaseBug(b, this.content.bugs.get(e.defId), false, this.physics.getState(id).y);
    b.selfLaunched = true;
    this.events.emit('bug_hopped', { id, defId: e.defId, ...this.xy(id) });
  }

  private xy(id: EntityId): { x: number; y: number } {
    const s = this.physics.getState(id);
    return { x: s.x, y: s.y };
  }

  /** A skater touched down on the water: the AI counts it as a landing. */
  noteBugImpact(id: EntityId, speed: number): void {
    this.bugImpacts.set(id, Math.max(this.bugImpacts.get(id) ?? 0, speed));
  }

  /** A bug caught a whiff of something smelly (rule R8). */
  smell(bug: Entity, sourceId: EntityId, sourceX: number): void {
    const brain = bug.bug;
    if (!brain || this.physics.grabbed === bug.id) return;
    const def = this.content.bugs.get(bug.defId);
    const s = this.physics.getState(bug.id);
    const notices = smellBug(brain, def, s.x, sourceX, this.rng, this.tick, this.worldWidth);
    if (notices.length === 0) return;
    this.events.emit('bug_smelled', { id: bug.id, defId: bug.defId, sourceId, liked: def.likesStink });
    for (const notice of notices) this.emitNotice(bug, notice, s);
  }

  // --- Area sleep ------------------------------------------------------------

  /** The area containing world x. */
  areaOf(x: number): AreaDef {
    return areaAt(x, this.content);
  }

  isAreaAsleep(areaId: string): boolean {
    return this.asleepAreas.has(areaId);
  }

  /** Out of the world for now: asleep with its area, or tucked in the pocket. */
  isSleeping(id: EntityId): boolean {
    return this.sleeping.has(id) || this.pocketed.has(id);
  }

  /** In the pocket tray. */
  isPocketed(id: EntityId): boolean {
    return this.pocketed.has(id);
  }

  /** What the hand would pick up at (x, y): a worn hat before the bug under it, then any body. */
  pickAt(x: number, y: number): EntityId | null {
    return this.wardrobe.wornAt(x, y) ?? this.physics.bodyAt(x, y, 0.2);
  }

  /**
   * Areas more than a screen from the camera's view sleep: their bodies are
   * switched off and their bugs pause (game design doc, section 3). Held
   * things never sleep. Without a focus (tests, headless runs) all areas
   * stay awake.
   */
  updateSleep(): void {
    const f = this.focus;
    for (const area of this.content.areas.all) {
      const gap = f ? Math.max(area.xStart - f.x1, f.x0 - area.xEnd, 0) : 0;
      // The hidden areas are worlds apart: only the one being looked at is awake.
      const asleep = (f && this.hidden.asleepFor(area, f)) ?? gap >= SLEEP_DISTANCE;
      if (asleep === this.asleepAreas.has(area.id)) continue;
      if (asleep) this.asleepAreas.add(area.id);
      else this.asleepAreas.delete(area.id);
      this.places.setAreaAsleep(area.id, asleep);
      this.events.emit(asleep ? 'area_slept' : 'area_woke', { areaId: area.id });
    }
    const mouthfuls = new Set(this.mouthOwners().keys());
    for (const e of this.entities.all()) {
      // Pocketed things belong to no area; they stay switched off. So do worn ones, on their bugs.
      if (this.pocketed.has(e.id) || this.wardrobe.isWorn(e.id)) continue;
      const x = this.physics.getState(e.id).x;
      const asleep = this.asleepAreas.has(this.areaOf(x).id) && this.physics.grabbed !== e.id;
      if (asleep && !this.sleeping.has(e.id)) {
        if (mouthfuls.has(e.id) || this.carried.has(e.id)) continue;
        this.sleeping.add(e.id);
        this.physics.setActive(e.id, false);
      } else if (!asleep && this.sleeping.has(e.id)) {
        this.sleeping.delete(e.id);
        this.physics.setActive(e.id, true);
        // Back in view: a bug carries on with whatever it was doing off-screen.
        if (e.bug) this.offscreen.wake(e);
      }
    }
  }

  /**
   * Where a bug's mouth is in the world right now, or null. Uses the def's
   * mouth anchor, mirrored when the bug faces left.
   */
  mouthAnchor(bugId: EntityId): { x: number; y: number } | null {
    const entity = this.entities.get(bugId);
    if (!entity?.bug) return null;
    const def = this.bugDef(entity);
    const s = this.physics.getState(bugId);
    return { x: s.x + def.mouth[0] * entity.bug.facing, y: s.y + def.mouth[1] };
  }

  /** Every drop target available right now, except on `exclude` itself. */
  private dropCandidates(exclude: EntityId): DropCandidate[] {
    const out: DropCandidate[] = [
      ...this.bench.candidates(),
      ...this.cauldron.candidates(),
      ...this.trash.candidates(exclude),
      ...this.wardrobe.candidates(exclude),
    ];
    for (const bug of this.entities.ofKind('bug')) {
      if (bug.id === exclude || !bug.bug || this.physics.grabbed === bug.id) continue;
      if (bug.bug.pending) continue;
      if (this.isSleeping(bug.id)) continue;
      const s = this.physics.getState(bug.id);
      out.push({ kind: 'body', entityId: bug.id, x: s.x, y: s.y });
      if (!canEat(bug.bug)) continue;
      const m = this.mouthAnchor(bug.id)!;
      out.push({ kind: 'mouth', entityId: bug.id, x: m.x, y: m.y });
    }
    return out;
  }

  /** What drop rules see on a thing: its tags, plus `item`, `potion`, and `paint`. */
  private dropTags(entity: Entity): string[] {
    const def = this.content.items.get(entity.defId);
    const tags = [...def.tags, 'item'];
    if (this.isPotion(entity)) tags.push('potion');
    if (def.paint || def.id === 'item_paint_rainbow') tags.push('paint');
    if (def.wear) tags.push('wearable');
    if (HEAD_TURNS[def.id]) tags.push('head_turn');
    return tags;
  }

  /**
   * The drop target that would take this entity if it were let go of right
   * now, or null. The renderer uses this to light up the mouth it would feed.
   */
  dropTargetFor(id: EntityId): DropTarget | null {
    const entity = this.entities.get(id);
    if (!entity || entity.kind !== 'item' || !this.physics.isActive(id)) return null;
    const s = this.physics.getState(id);
    return pickDropTarget(this.dropTags(entity), s.x, s.y, this.dropCandidates(id));
  }

  /** The player fed a bug: the food goes in its mouth. */
  feed(bugId: EntityId, itemId: EntityId, byPlayer: boolean): void {
    const bug = this.entities.get(bugId);
    const item = this.entities.get(itemId);
    if (!bug?.bug || !item || !canEat(bug.bug)) return;
    const def = this.bugDef(bug);
    // Turn to face the food.
    const bs = this.physics.getState(bugId);
    const is = this.physics.getState(itemId);
    if (Math.abs(is.x - bs.x) > 0.05) bug.bug.facing = is.x > bs.x ? 1 : -1;
    const liking = feedBug(bug.bug, def, itemId, item.defId, this.isPotion(item), !!item.toasted);
    if (byPlayer) this.counters.fed[bug.defId] = (this.counters.fed[bug.defId] ?? 0) + 1;
    this.takeInMouth(bug, itemId, liking, byPlayer);
  }

  private takeInMouth(bug: Entity, itemId: EntityId, liking: Liking, byPlayer: boolean): void {
    const item = this.entities.get(itemId);
    if (!item) return;
    this.environment.unstickAll(itemId);
    this.physics.setActive(itemId, false);
    this.linkedCache = null;
    this.thrown.delete(itemId);
    this.placeMouthful(bug, itemId);
    this.events.emit('bug_fed', {
      id: bug.id,
      defId: bug.defId,
      itemId,
      itemDefId: item.defId,
      liking,
      byPlayer,
    });
  }

  /**
   * A mouth on a steep root can sit below the ground next to it: food let go
   * of there is lifted clear of the ground first, so it never starts buried.
   */
  private aboveGround(itemId: EntityId): void {
    const e = this.entities.get(itemId);
    if (!e) return;
    const s = this.physics.getState(itemId);
    const ext = halfExtents(this.content.items.get(e.defId).shape, s.angle);
    let floor = Infinity;
    for (const dx of [-ext.w, 0, ext.w]) floor = Math.min(floor, this.terrain.surfaceY(s.x + dx));
    const top = floor - ext.h - 0.01;
    if (s.y > top) this.physics.setPosition(itemId, s.x, top);
  }

  /** Food in a mouth sits just in front of the mouth anchor. */
  private placeMouthful(bug: Entity, itemId: EntityId): void {
    const m = this.mouthAnchor(bug.id);
    if (!m || !bug.bug) return;
    this.physics.place(itemId, m.x + bug.bug.facing * 0.06, m.y, 0);
  }

  private placeMouthfuls(): void {
    for (const bug of this.entities.ofKind('bug')) {
      const id = bug.bug?.mouthful;
      if (id !== null && id !== undefined && this.entities.has(id)) this.placeMouthful(bug, id);
    }
  }

  /** "Ptoo": disliked food flies back out of the mouth, forward and up. */
  private spit(bug: Entity, itemId: EntityId): void {
    const item = this.entities.get(itemId);
    if (!item || !bug.bug) return;
    const facing = bug.bug.facing;
    this.placeMouthful(bug, itemId);
    this.aboveGround(itemId);
    this.physics.setActive(itemId, true);
    // Barty does not spit: he rolls it away from him along the ground.
    const rolls = this.content.bugs.get(bug.defId).habits.rollsBalls;
    const vx = rolls ? facing * 2.4 : facing * SPIT_SPEED.x + this.rng.range(-0.6, 0.6);
    const vy = rolls ? -0.6 : SPIT_SPEED.y + this.rng.range(-0.8, 0.4);
    this.physics.setVelocity(itemId, vx, vy);
    const s = this.physics.getState(itemId);
    this.events.emit('bug_spat', {
      id: bug.id,
      defId: bug.defId,
      itemId,
      itemDefId: item.defId,
      x: s.x,
      y: s.y,
      vx,
      vy,
    });
  }

  /** Rollo curls into a rolling ball while flying, and stands back up after. */
  private syncRolling(entity: Entity): void {
    const def = this.content.bugs.get(entity.defId);
    const brain = entity.bug;
    const want =
      !!brain &&
      def.curlsWhenFlung &&
      ((brain.mode === 'st_airborne' && !brain.selfLaunched) || brain.mode === 'st_rolled');
    if (want === this.rolling.has(entity.id)) return;
    this.physics.setRolling(entity.id, want, want ? ROLLED_RESTITUTION : BUG_RESTITUTION);
    if (want) this.rolling.add(entity.id);
    else this.rolling.delete(entity.id);
  }

  /** True while a bug is curled up as a ball. */
  isRolling(id: EntityId): boolean {
    return this.rolling.has(id);
  }

  handleImpacts(impacts: Impact[]): void {
    _handleImpacts(this, impacts);
  }

  /** A thrown food that hits a bug near its mouth gets eaten: a great shot. */
  tryCatch(itemId: EntityId, bugId: EntityId): void {
    _tryCatch(this, itemId, bugId);
  }

  /**
   * A spring launches whatever lands on its top along its axis. `sign` is 1
   * if the spring is body A of the contact (so the normal points away from it).
   */
  trySpring(springId: EntityId, def: ItemDef, otherId: EntityId, impact: Impact, sign: number): boolean {
    return _trySpring(this, springId, def, otherId, impact, sign);
  }

  /**
   * Put something that left the world back at (x, y), still, as if it had
   * just been let go there: unstuck, set down, a bug falling onto its feet.
   */
  bringBack(entity: Entity, x: number, y: number): void {
    const id = entity.id;
    this.environment.unstickAll(id);
    this.thrown.delete(id);
    if (entity.pinned) {
      entity.pinned = false;
      this.physics.setPinned(id, false);
    }
    this.physics.removePivot(id);
    if (entity.toy?.pivot) delete entity.toy.pivot;
    if (entity.bug) {
      this.putDown(id);
      if (this.rolling.delete(id)) this.physics.setRolling(id, false, BUG_RESTITUTION);
    }
    this.physics.place(id, x, y, 0);
    this.physics.setVelocity(id, 0, 1);
    if (this.sleeping.delete(id)) this.physics.setActive(id, true);
    if (entity.bug) {
      releaseBug(entity.bug, this.content.bugs.get(entity.defId), false, y);
      entity.bug.selfLaunched = true;
      entity.bug.lastX = x;
    }
    this.worldCache = null;
    this.linkedCache = null;
  }

  /** Safety net: anything that ends up inside the ground is lifted back out. */
  private rescueBuried(): void {
    for (const entity of this.entities.all()) {
      // Things in a mouth or in front legs go where their bug puts them.
      if (this.isSleeping(entity.id) || !this.physics.isAwake(entity.id)) continue;
      const p = this.physics.position(entity.id);
      const floor = this.terrain.surfaceY(p.x);
      if (p.y > floor + BURIED_DEPTH) {
        const s = this.physics.getState(entity.id);
        this.physics.setPosition(entity.id, s.x, floor - 0.6);
        this.physics.setVelocity(entity.id, s.vx, Math.min(0, s.vy));
        this.rescues++;
      }
    }
  }

  /** Drop consumables back in from above when an area runs low. */
  private respawn(): void {
    for (const area of this.content.areas.all) {
      if (!this.barriers.isOpen(area.id)) continue;
      for (const entry of area.respawn) {
        const have = this.entities
          .ofKind('item')
          .filter((e) => e.defId === entry.item && !this.pocketed.has(e.id))
          .filter((e) => {
            const x = this.physics.getState(e.id).x;
            return x >= area.xStart && x < area.xEnd;
          }).length;
        if (have >= entry.count) continue;
        let x = this.rng.range(area.xStart + 1, area.xEnd - 1);
        // Never drop onto the player's things, nor close enough to bounce into them from the sky.
        const setups = this.bugWorld().setups;
        const clear = RESPAWN_CLEAR;
        const near = (at: number): boolean => setups.some((b) => at > b.x0 - clear && at < b.x1 + clear);
        for (let tries = 0; tries < 8 && near(x); tries++) x = this.rng.range(area.xStart + 1, area.xEnd - 1);
        // The player's things fill the area: no drop this time.
        if (near(x)) continue;
        // Indoors, it drops from just under the roof (the treehouse's, the depths' ceiling).
        const roof = area.roof;
        const local = x - area.xStart;
        const y = roof && local >= roof.x0 && local <= roof.x1 ? roof.y + 0.3 : -0.5;
        const entity = this.spawn('item', entry.item, x, y);
        this.events.emit('item_respawned', { id: entity.id, defId: entity.defId, x, y });
      }
    }
  }

  /** How many of an item kind lie in an area, not counting pocketed ones. */
  looseIn(defId: string, area: AreaDef): number {
    let n = 0;
    for (const e of this.entities.ofKind('item')) {
      if (e.defId !== defId || this.pocketed.has(e.id) || !this.physics.has(e.id)) continue;
      const x = this.physics.getState(e.id).x;
      if (x >= area.xStart && x < area.xEnd) n++;
    }
    return n;
  }

  /** Snapshot of every entity for drawing and tests. */
  views(): EntityView[] {
    const grabbed = this.physics.grabbed;
    const owners = this.mouthOwners();
    return this.entities.all().map((e) => this.viewOf(e, grabbed, owners));
  }

  /** Item ID to the bug chewing it. */
  mouthOwners(): Map<EntityId, EntityId> {
    const owners = new Map<EntityId, EntityId>();
    for (const bug of this.entities.ofKind('bug'))
      if (bug.bug && bug.bug.mouthful !== null) owners.set(bug.bug.mouthful, bug.id);
    return owners;
  }

  private viewOf(e: Entity, grabbed: EntityId | null, owners: Map<EntityId, EntityId>): EntityView {
    const view: EntityView = {
      id: e.id,
      kind: e.kind,
      defId: e.defId,
      held: grabbed === e.id,
      ...this.physics.getState(e.id),
      tags: this.tagsOf(e.id),
      submerged: this.environment.submerged.get(e.id) ?? 0,
    };
    const owner = owners.get(e.id);
    if (owner !== undefined) view.inMouthOf = owner;
    const carrier = this.carried.get(e.id);
    if (carrier !== undefined) view.carriedBy = carrier;
    if (this.sleeping.has(e.id)) view.asleep = true;
    if (this.pocketed.has(e.id)) view.pocket = this.pocket.slots.findIndex((ids) => ids.includes(e.id));
    const worn = this.wardrobe.wornBy(e.id);
    if (worn) view.worn = { by: worn.bug, slot: worn.slot };
    if (e.paint && e.paint.length > 0) view.paint = [...e.paint];
    if (e.bites) view.bites = e.bites;
    if (e.pinned) view.pinned = true;
    if (e.effects?.length) {
      view.effects = this.potions.live(e).map(({ effect, strength, fx }) => ({
        effect,
        potion: fx.potion,
        strength,
        age: this.tick - fx.since,
        left: fx.until - this.tick,
        ...(fx.paint && fx.effect !== 'sludge' ? { paint: fx.paint } : {}),
        ...(fx.effect === 'sludge' && fx.paint ? { look: fx.paint } : {}),
        ...(fx.grown !== undefined ? { grown: fx.grown } : {}),
        ...(fx.zipUntil !== undefined ? { zipping: true } : {}),
      }));
      const scale = this.potions.scaleOf(e);
      if (scale !== 1) view.scale = scale;
    }
    if (e.kind === 'item') {
      const def = this.content.items.get(e.defId);
      if (e.brew)
        view.brew = {
          color: e.brew.color,
          potion: e.brew.potion,
          ...(e.brew.paint ? { paint: e.brew.paint } : {}),
        };
      else if (def.potion) view.brew = { color: def.color, potion: def.potion };
    }
    if (e.toasted) view.toasted = true;
    if (e.toy && Object.keys(e.toy).length > 0) view.toy = clone(e.toy);
    if (e.parts) view.parts = e.parts.length;
    if (e.kind === 'item' && e.soak) {
      const after = this.content.items.get(e.defId).soggyAfter;
      if (after) view.soggy = Math.min(1, e.soak / (after * SIM_HZ));
    }
    if (e.bug) view.bug = this.bugView(e);
    return view;
  }

  private bugView(e: Entity): BugView {
    const b = e.bug!;
    const def = this.content.bugs.get(e.defId);
    const food = b.mouthful === null ? undefined : this.entities.get(b.mouthful);
    return {
      mode: b.mode,
      facing: b.facing,
      needs: { ...b.needs },
      action: b.action,
      targetId: b.targetId,
      timer: b.timer,
      dizzyTicks: b.dizzyTicks,
      selfLaunched: b.selfLaunched,
      mood: moodOf(b, this.tick),
      mouthful: food ? { id: food.id, defId: food.defId, liking: likingOf(def, food.defId) } : null,
      reaction: b.reaction
        ? { type: b.reaction.type, variant: b.reaction.variant, age: this.tick - b.reaction.tick }
        : null,
      tickle: b.tickle,
      woozy: this.tick < b.woozyUntil,
      social: b.social ? { kind: b.social.kind, partner: b.social.partner, role: b.social.role } : null,
      carrying: b.carrying,
      groggy: this.tick < b.groggyUntil,
      gliding: b.gliding,
      umbrella: !!b.umbrella && b.carrying !== null,
      ...(b.pending ? { pending: b.pending } : {}),
      ...(b.eyesUntil !== undefined && this.tick < b.eyesUntil ? { peeking: true } : {}),
      ...(b.form ? { form: b.form } : {}),
      ...(b.overhead && b.carrying !== null ? { overhead: true } : {}),
      ...(b.rolling && b.carrying !== null ? { rolling: true } : {}),
      ...(b.mode === 'st_perform' && b.action === 'play' && b.targetId === null ? { fiddling: true } : {}),
      ...(e.wearing
        ? { wearing: this.wardrobe.wornOn(e).map((w) => ({ slot: w.slot, id: w.id, defId: w.def.id })) }
        : {}),
    };
  }

  view(id: EntityId): EntityView | undefined {
    const e = this.entities.get(id);
    if (!e) return undefined;
    return this.viewOf(e, this.physics.grabbed, this.mouthOwners());
  }

  /** Serialize the world. A held item is saved where it is, as if dropped. */
  serialize(): WorldSave {
    const entities: SavedEntity[] = this.entities.all().map((e) => {
      const saved: SavedEntity = {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        body: this.physics.getState(e.id),
      };
      if (e.bug) saved.bug = clone(e.bug);
      if (e.tags) saved.tags = clone(e.tags);
      if (e.soak) saved.soak = e.soak;
      if (e.paint && e.paint.length > 0) saved.paint = [...e.paint];
      if (e.pinned) saved.pinned = true;
      if (e.bites) saved.bites = e.bites;
      if (e.parts) saved.parts = clone(e.parts);
      if (e.brew) saved.brew = clone(e.brew);
      if (e.effects && e.effects.length > 0) saved.effects = clone(e.effects);
      if (e.toasted) saved.toasted = true;
      if (e.home) saved.home = { ...e.home };
      if (e.toy && Object.keys(e.toy).length > 0) saved.toy = clone(e.toy);
      if (e.wearing && Object.keys(e.wearing).length > 0) saved.wearing = { ...e.wearing };
      return saved;
    });
    return {
      seed: this.seed,
      tick: this.tick,
      rng: this.rng.getState(),
      nextId: this.entities.nextId,
      entities,
      env: clone(this.environment.state),
      social: { affinity: clone(this.affinity) },
      pocket: clone(this.pocket),
      counters: clone(this.counters),
      sky: this.weather.serialize(),
      secrets: [...this.secrets],
      barriers: clone(this.barriers.state) as BarrierState,
      places: this.places.serialize(),
      built: [...this.built],
      bench: this.bench.serialize(),
      cauldron: this.cauldron.serialize(),
      journal: this.journal.serialize(),
      clues: this.clues.serialize(),
      hidden: this.hidden.serialize(),
      trash: this.trash.serialize(),
      tidy: this.tidy.serialize(),
      wardrobe: this.wardrobe.serialize(),
    };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Starting layout for a new game, from each area's start list. */
export function populateStartingWorld(sim: Sim): void {
  sim.populate(sim.content.areas.all);
}
