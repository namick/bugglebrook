import type { Command } from './commands';
import { CommandQueue } from './core/commandQueue';
import type { BugMode, Entity, EntityId, EntityKind, Needs } from './core/entities';
import { EntityStore } from './core/entities';
import { EventBus } from './core/events';
import { SIM_DT, SIM_HZ } from './core/loop';
import { Rng } from './core/rng';
import { BONK_SPEED, FLING_SPEED, GRAVITY, MAX_FLING_SPEED, VIEW_WIDTH_M } from './constants';
import type { Content } from './data';
import { CONTENT, areaAt, worldWidth } from './data';
import { MATERIALS } from './data/materials';
import type { AreaDef, ItemDef } from './data/types';
import { NEED_IDS } from './data/types';
import type { GameEvents, Liking, Mood, ReactionType, TagCause } from './events';
import type { BodyState, Impact, MaterialSpec, ShapeSpec } from './physics/physics';
import { Physics } from './physics/physics';
import type { SavedEntity, WorldSave } from './save/schema';
import { Environment } from './systems/environment';
import { TAG_IDS, addTag, effectiveTags, expireTags, removeTag, tagOn } from './systems/tags';
import type { AdvertCandidate, BugNotice, TargetInfo } from './systems/bugAi';
import {
  canEat,
  feedBug,
  likingOf,
  moodOf,
  newBugBrain,
  pokeBug,
  react,
  releaseBug,
  shakeBug,
  smellBug,
  springLaunched,
  tickleBug,
  updateBug,
} from './systems/bugAi';
import type { DropCandidate, DropTarget } from './systems/dropTargets';
import { pickDropTarget } from './systems/dropTargets';
import { Terrain } from './world/terrain';

/** Bugs bounce a little; a curled-up Rollo bounces like a marble. */
const BUG_RESTITUTION = 0.15;
const ROLLED_RESTITUTION = 0.6;
/** How often consumables drop back in when an area runs low. */
export const RESPAWN_TICKS = 45 * SIM_HZ;
/** Anything this far below the surface is pulled back up. */
const BURIED_DEPTH = 0.25;
/** A thrown thing can land in a mouth for this long after it leaves the hand. */
const THROWN_TICKS = 90;
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
const TAG_SET: ReadonlySet<string> = new Set(TAG_IDS);

/** Read-only view of one bug's mind, for the renderer and the test hook. */
export interface BugView {
  mode: BugMode;
  facing: 1 | -1;
  needs: Needs;
  action: 'eat' | 'bounce' | null;
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
}

/** Read-only view of one entity for the renderer and the test hook. */
export interface EntityView extends BodyState {
  id: EntityId;
  kind: EntityKind;
  defId: string;
  held: boolean;
  /** Food sitting in a bug's mouth: the ID of that bug. */
  inMouthOf?: EntityId;
  bug?: BugView;
  /** Every tag that is on right now, sorted. */
  tags: string[];
  /** Fraction under water, 0 to 1. */
  submerged: number;
  /** How far a soaking paper thing is toward sinking, 0 to 1. */
  soggy?: number;
  /** Asleep with its area: frozen in place until the camera comes back. */
  asleep?: boolean;
}

export interface SimOptions {
  seed?: string | number;
  content?: Content;
}

const halfExtents = (shape: ShapeSpec, angle: number): { w: number; h: number } => {
  if (shape.type === 'circle') return { w: shape.radius, h: shape.radius };
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return {
    w: (shape.width / 2) * c + (shape.height / 2) * s,
    h: (shape.width / 2) * s + (shape.height / 2) * c,
  };
};

/**
 * The whole game world, headless. Owns entities, physics, RNG, the command
 * queue, and the event bus. Advance it with `step()`; it knows nothing about
 * rendering, input devices, audio, or wall-clock time.
 */
export class Sim {
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
  private bugImpacts = new Map<EntityId, number>();
  /** Bugs a spring just launched: ignore their contact with it for a moment. */
  private launchGrace = new Map<EntityId, number>();
  private rolling = new Set<EntityId>();
  /** Things the player just threw, and when: they can land in a mouth. */
  private thrown = new Map<EntityId, number>();
  /** Water, fixtures, and the property rules. */
  readonly environment: Environment;
  /** What the camera shows, or null (tests, headless): then nothing sleeps. */
  private focus: { x0: number; x1: number } | null = null;
  private readonly asleepAreas = new Set<string>();
  /** Entities whose bodies are switched off because their area sleeps. */
  private readonly sleeping = new Set<EntityId>();

  private constructor(seed: string, content: Content) {
    this.seed = seed;
    this.content = content;
    this.rng = new Rng(seed);
    this.worldWidth = worldWidth(content);
    this.terrain = Terrain.fromAreas(content.areas.all);
    this.physics = new Physics(GRAVITY, this.worldWidth, this.terrain);
    this.environment = new Environment(this);
  }

  /** A fresh, empty world. */
  static empty(options: SimOptions = {}): Sim {
    return new Sim(String(options.seed ?? 1), options.content ?? CONTENT);
  }

  /** A fresh world with the starting bugs and props. */
  static create(options: SimOptions = {}): Sim {
    const sim = Sim.empty(options);
    populateStartingWorld(sim);
    return sim;
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
      sim.entities.restore(entity);
      sim.addBodyFor(entity, saved.body);
    }
    sim.entities.nextId = Math.max(save.nextId, sim.entities.nextId);
    // Food that was mid-chew goes back in the mouth.
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || b.mouthful === null) continue;
      if (b.mode === 'st_eat' && sim.entities.has(b.mouthful)) sim.physics.setActive(b.mouthful, false);
      else b.mouthful = null;
    }
    sim.environment.restore(save.env ? clone(save.env) : sim.environment.state);
    sim.refreshFriction();
    return sim;
  }

  private defExists(kind: EntityKind, defId: string): boolean {
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
    this.addBodyFor(entity, { x, y, angle: 0, vx: 0, vy: 0, av: 0 });
    this.events.emit('entity_spawned', { id: entity.id, kind, defId });
    return entity;
  }

  remove(id: EntityId): void {
    if (!this.entities.has(id)) return;
    this.environment.forget(id);
    this.sleeping.delete(id);
    this.physics.removeBody(id);
    this.entities.remove(id);
    this.rolling.delete(id);
    this.thrown.delete(id);
    this.events.emit('entity_removed', { id });
  }

  private addBodyFor(entity: Entity, state: BodyState): void {
    if (entity.kind === 'bug') {
      const def = this.content.bugs.get(entity.defId);
      const shape: ShapeSpec = { type: 'circle', radius: def.radius };
      // Low friction: the AI drives walking and gripping through velocity, and
      // ground friction would only fight it.
      const material: MaterialSpec = { density: 1, friction: BUG_FRICTION, restitution: BUG_RESTITUTION };
      this.physics.addBody(entity.id, shape, material, state, { fixedRotation: true, linearDamping: 0.1 });
    } else {
      const def = this.content.items.get(entity.defId);
      this.physics.addBody(entity.id, def.shape, def, state, {
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
    if (this.tick % 15 === 0) this.updateSleep();
    this.updateBugs();
    this.physics.measureHand(SIM_DT);
    this.environment.beforePhysics();
    this.physics.step(SIM_DT);
    this.placeMouthfuls();
    const impacts = this.physics.takeImpacts();
    this.handleImpacts(impacts);
    this.environment.afterPhysics(impacts);
    this.rescueBuried();
    if (this.tick > 0 && this.tick % RESPAWN_TICKS === 0) this.respawn();
    this.tick++;
  }

  /** Run `n` steps. Handy for tests. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  private apply(command: Command): void {
    switch (command.type) {
      case 'grab': {
        const id = this.physics.bodyAt(command.x, command.y, 0.2);
        const entity = id === null ? undefined : this.entities.get(id);
        if (!entity) return;
        this.physics.grab(entity.id, command.x, command.y);
        this.events.emit('item_grabbed', {
          id: entity.id,
          kind: entity.kind,
          defId: entity.defId,
          x: command.x,
          y: command.y,
        });
        return;
      }
      case 'drag':
        this.physics.moveGrab(command.x, command.y);
        return;
      case 'release': {
        const cursor =
          command.vx !== undefined && command.vy !== undefined ? { x: command.vx, y: command.vy } : undefined;
        const id = this.physics.release(MAX_FLING_SPEED, cursor);
        const entity = id === null ? undefined : this.entities.get(id);
        if (!entity) return;
        const s = this.physics.getState(entity.id);
        const speed = Math.hypot(s.vx, s.vy);
        const flung = speed >= FLING_SPEED;
        if (entity.bug) releaseBug(entity.bug, this.content.bugs.get(entity.defId), flung);
        this.events.emit('item_dropped', {
          id: entity.id,
          kind: entity.kind,
          defId: entity.defId,
          speed,
          vx: s.vx,
          vy: s.vy,
          flung,
        });
        if (entity.bug && flung) this.emitNotice(entity, react(entity.bug, 'fling', this.rng, this.tick), s);
        if (flung) this.thrown.set(entity.id, this.tick);
        else {
          // A gentle drop: the first matching drop target takes it.
          const target = this.dropTargetFor(entity.id);
          if (target) this.feed(target.entityId, entity.id, true);
        }
        return;
      }
      case 'tickle': {
        const held = this.physics.grabbed;
        const entity = held === null ? undefined : this.entities.get(held);
        if (!entity?.bug) return;
        const s = this.physics.getState(entity.id);
        for (const notice of tickleBug(entity.bug, command.on, this.rng, this.tick))
          this.emitNotice(entity, notice, s);
        return;
      }
      case 'shake': {
        const held = this.physics.grabbed;
        const entity = held === null ? undefined : this.entities.get(held);
        if (!entity) return;
        const s = this.physics.getState(entity.id);
        if (entity.bug) shakeBug(entity.bug, this.tick);
        else this.environment.wring(entity);
        this.events.emit('item_shaken', {
          id: entity.id,
          kind: entity.kind,
          defId: entity.defId,
          x: s.x,
          y: s.y,
        });
        return;
      }
      case 'set_need': {
        const brain = this.entities.get(command.id)?.bug;
        if (brain && NEED_IDS.includes(command.need) && Number.isFinite(command.value))
          brain.needs[command.need] = Math.min(100, Math.max(0, command.value));
        return;
      }
      case 'poke':
        this.poke(command.x, command.y);
        return;
      case 'spawn':
        this.spawn(command.kind, command.defId, command.x, command.y);
        return;
      case 'focus':
        if (Number.isFinite(command.x0) && Number.isFinite(command.x1)) {
          this.focus = { x0: command.x0, x1: command.x1 };
          this.updateSleep();
        }
        return;
      case 'set_tag': {
        if (!this.entities.has(command.id) || !TAG_SET.has(command.tag)) return;
        if (command.on) this.addTag(command.id, command.tag, 'debug', command.seconds);
        else this.removeTag(command.id, command.tag, 'debug');
        return;
      }
      case 'set_weather': {
        const env = this.environment.state;
        if (Number.isFinite(command.wind)) env.wind = Math.max(-6, Math.min(6, command.wind));
        if (command.rain && !env.rain) env.rainSince = this.tick;
        env.rain = !!command.rain;
        return;
      }
    }
  }

  private poke(x: number, y: number): void {
    const id = this.physics.bodyAt(x, y, 0.2);
    const entity = id === null ? undefined : this.entities.get(id);
    // A poke is a click, so whatever the press picked up is let go in place.
    const held = this.physics.release(MAX_FLING_SPEED, { x: 0, y: 0 });
    const heldEntity = held === null ? undefined : this.entities.get(held);
    if (heldEntity?.bug && heldEntity !== entity)
      releaseBug(heldEntity.bug, this.content.bugs.get(heldEntity.defId), false);
    if (!entity) {
      // Nothing there: maybe a fixture, like the hose tap.
      this.environment.pokeFixture(x, y);
      return;
    }
    const s = this.physics.getState(entity.id);
    if (entity.bug) {
      if (!pokeBug(entity.bug)) return;
      this.physics.setVelocity(entity.id, 0, -2.2);
      this.events.emit('bug_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
      this.emitNotice(entity, react(entity.bug, 'poke', this.rng, this.tick), s);
    } else {
      this.physics.setVelocity(entity.id, s.vx + this.rng.range(-0.6, 0.6), -3.2);
      this.events.emit('item_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
    }
  }

  /** Target lookup for the AI: where an entity is and how big it is. */
  private targetInfo(id: EntityId): TargetInfo | null {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const s = this.physics.getState(id);
    const shape: ShapeSpec =
      entity.kind === 'bug'
        ? { type: 'circle', radius: this.content.bugs.get(entity.defId).radius }
        : this.content.items.get(entity.defId).shape;
    const ext = halfExtents(shape, s.angle);
    const box = shape.type === 'box' ? shape : null;
    return {
      defId: entity.defId,
      x: s.x,
      y: s.y,
      // The spring is hopped onto along its own axis, so report its true height.
      halfWidth: ext.w,
      halfHeight: box ? box.height / 2 : ext.h,
      angle: s.angle,
      held: this.physics.grabbed === id,
    };
  }

  /** Everything bugs could use right now, as seen by bug `self`. */
  private advertsFor(self: EntityId): AdvertCandidate[] {
    const claimedBy = new Map<EntityId, EntityId>();
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      if (b && b.targetId !== null && (b.mode === 'st_seek' || b.mode === 'st_eat' || b.mode === 'st_use'))
        claimedBy.set(b.targetId, bug.id);
    }
    const out: AdvertCandidate[] = [];
    const selfEntity = this.entities.get(self);
    const skater = !!selfEntity && this.content.bugs.get(selfEntity.defId).swim === 'skate';
    for (const item of this.entities.ofKind('item')) {
      const def = this.content.items.get(item.defId);
      if (def.adverts.length === 0 || this.physics.grabbed === item.id) continue;
      if (!this.physics.isActive(item.id)) continue; // in someone's mouth, or asleep
      const s = this.physics.getState(item.id);
      // Only skaters go after things out on the water.
      if (!skater && this.environment.overOpenWater(s.x)) continue;
      for (const advert of def.adverts) {
        // A spring on its side is not bounceable.
        if (advert.action === 'bounce' && Math.abs(s.angle) > 0.5) continue;
        const owner = claimedBy.get(item.id);
        out.push({
          id: item.id,
          defId: item.defId,
          x: s.x,
          y: s.y,
          action: advert.action,
          needs: advert.needs,
          claimed: owner !== undefined && owner !== self,
        });
      }
    }
    return out;
  }

  private updateBugs(): void {
    const held = this.physics.grabbed;
    const heldEntity = held === null ? undefined : this.entities.get(held);
    let offered: { x: number; y: number } | null = null;
    if (heldEntity?.kind === 'item' && this.content.items.get(heldEntity.defId).tags.includes('tag_edible')) {
      const s = this.physics.getState(heldEntity.id);
      offered = { x: s.x, y: s.y };
    }
    for (const entity of this.entities.ofKind('bug')) {
      if (this.sleeping.has(entity.id)) continue;
      const def = this.content.bugs.get(entity.defId);
      const state = this.physics.getState(entity.id);
      const graceUntil = this.launchGrace.get(entity.id);
      const inGrace = graceUntil !== undefined && this.tick < graceUntil;
      if (graceUntil !== undefined && !inGrace) this.launchGrace.delete(entity.id);
      let adverts: AdvertCandidate[] | null = null;
      const home = this.content.areas.tryGet(def.home);
      const onWater = this.environment.skating.has(entity.id);
      const decision = updateBug(entity, {
        tick: this.tick,
        def,
        state,
        held: held === entity.id,
        support: inGrace
          ? null
          : (this.physics.supportNormal(entity.id) ?? (onWater ? { x: 0, y: -1 } : null)),
        submerged: this.environment.submerged.get(entity.id) ?? 0,
        overWater: (x) => this.environment.overOpenWater(x),
        shore: this.environment.shoreFrom(state.x),
        frozen: this.hasTag(entity.id, 'tag_frozen'),
        home: home ? { x0: home.xStart, x1: home.xEnd } : null,
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
          return { id: other.id, isBug: other.kind === 'bug', top: info.y - info.halfHeight };
        },
      });
      if (decision.velocity) this.physics.setVelocity(entity.id, decision.velocity.x, decision.velocity.y);
      if (decision.take) this.takeInMouth(entity, decision.take.itemId, decision.take.liking, false);
      if (decision.eat) {
        const item = this.entities.get(decision.eat.itemId);
        if (item) {
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
        releaseBug(entity.bug!, def, false);
        this.physics.setVelocity(entity.id, entity.bug!.facing * 1.5, -5);
        this.events.emit('bug_wriggled_free', { id: entity.id, defId: entity.defId, x: state.x, y: state.y });
      }
      // Anything that stops a bug chewing makes it drop its food.
      const brain = entity.bug;
      if (brain && brain.mouthful !== null && brain.mode !== 'st_eat') {
        const itemId = brain.mouthful;
        brain.mouthful = null;
        if (this.entities.has(itemId)) this.physics.setActive(itemId, true);
      }
      this.syncRolling(entity);
    }
    this.bugImpacts.clear();
  }

  private emitNotice(entity: Entity, notice: BugNotice, s: BodyState): void {
    const base = { id: entity.id, defId: entity.defId };
    switch (notice.type) {
      case 'landed':
        this.events.emit('bug_landed', { ...base, speed: notice.speed, x: s.x, y: s.y });
        return;
      case 'dizzy':
        this.events.emit('bug_dizzy', { ...base, speed: notice.speed, durationTicks: notice.durationTicks });
        return;
      case 'recovered':
        this.events.emit('bug_recovered', base);
        return;
      case 'chose':
        this.events.emit('bug_chose_action', { ...base, action: notice.action, targetId: notice.targetId });
        return;
      case 'hopped':
        this.events.emit('bug_hopped', { ...base, x: s.x, y: s.y });
        return;
      case 'reacted':
        this.events.emit('bug_reacted', { ...base, reaction: notice.reaction, variant: notice.variant });
        return;
      case 'burped': {
        const m = this.mouthAnchor(entity.id);
        this.events.emit('bug_burped', { ...base, x: m?.x ?? s.x, y: m?.y ?? s.y });
        return;
      }
      case 'tickled':
        this.events.emit('bug_tickled', { ...base, level: notice.level });
        return;
      case 'swam':
        this.events.emit('bug_swam', { ...base, x: s.x, y: s.y });
        return;
      case 'shook_dry':
        this.removeTag(entity.id, 'tag_wet', 'shake');
        this.events.emit('bug_shook_dry', { ...base, x: s.x, y: s.y });
        return;
    }
  }

  /**
   * What a meal leaves behind: hot food makes the eater hot, cold food
   * cold; bouncy food makes it hop; soap comes back up as a bubbly burp.
   */
  private ateEffects(bug: Entity, food: Entity): void {
    const brain = bug.bug;
    if (!brain) return;
    if (this.hasTag(food.id, 'tag_hot')) this.addTag(bug.id, 'tag_hot', 'food');
    if (this.hasTag(food.id, 'tag_cold')) this.addTag(bug.id, 'tag_cold', 'food');
    if (this.hasTag(food.id, 'tag_bouncy')) brain.hopAt = this.tick + BOUNCY_HOP_DELAY;
    if (this.hasTag(food.id, 'tag_soapy') && brain.burpAt < 0) brain.burpAt = this.tick + 70;
  }

  // --- Tags ------------------------------------------------------------------

  /** An entity's default tags: its item def's plus its material's. Bugs have none. */
  defaultTags(entity: Entity): readonly string[] {
    if (entity.kind === 'bug') return [];
    const def = this.content.items.get(entity.defId);
    const mat = MATERIALS[def.material]?.tags ?? [];
    return mat.length === 0 ? def.tags : [...new Set([...def.tags, ...mat])];
  }

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
      const base = e.kind === 'bug' ? BUG_FRICTION : this.content.items.get(e.defId).friction;
      const k = this.hasTag(e.id, 'tag_frozen')
        ? FROZEN_FRICTION
        : this.hasTag(e.id, 'tag_wet')
          ? WET_FRICTION
          : 1;
      const want = base * k;
      if (Math.abs(this.physics.friction(e.id) - want) > 1e-9) this.physics.setFriction(e.id, want);
    }
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

  isSleeping(id: EntityId): boolean {
    return this.sleeping.has(id);
  }

  /**
   * Areas more than a screen from the camera's view sleep: their bodies are
   * switched off and their bugs pause (game design doc, section 3). Held
   * things never sleep. Without a focus (tests, headless runs) all areas
   * stay awake.
   */
  private updateSleep(): void {
    const f = this.focus;
    for (const area of this.content.areas.all) {
      const gap = f ? Math.max(area.xStart - f.x1, f.x0 - area.xEnd, 0) : 0;
      const asleep = gap >= SLEEP_DISTANCE;
      if (asleep === this.asleepAreas.has(area.id)) continue;
      if (asleep) this.asleepAreas.add(area.id);
      else this.asleepAreas.delete(area.id);
      this.events.emit(asleep ? 'area_slept' : 'area_woke', { areaId: area.id });
    }
    const mouthfuls = new Set(this.mouthOwners().keys());
    for (const e of this.entities.all()) {
      const x = this.physics.getState(e.id).x;
      const asleep = this.asleepAreas.has(this.areaOf(x).id) && this.physics.grabbed !== e.id;
      if (asleep && !this.sleeping.has(e.id)) {
        if (mouthfuls.has(e.id)) continue;
        this.sleeping.add(e.id);
        this.physics.setActive(e.id, false);
      } else if (!asleep && this.sleeping.has(e.id)) {
        this.sleeping.delete(e.id);
        this.physics.setActive(e.id, true);
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
    const def = this.content.bugs.get(entity.defId);
    const s = this.physics.getState(bugId);
    return { x: s.x + def.mouth[0] * entity.bug.facing, y: s.y + def.mouth[1] };
  }

  /** Every drop target available right now, except on `exclude` itself. */
  private dropCandidates(exclude: EntityId): DropCandidate[] {
    const out: DropCandidate[] = [];
    for (const bug of this.entities.ofKind('bug')) {
      if (bug.id === exclude || !bug.bug || !canEat(bug.bug) || this.physics.grabbed === bug.id) continue;
      const m = this.mouthAnchor(bug.id)!;
      out.push({ kind: 'mouth', entityId: bug.id, x: m.x, y: m.y });
    }
    return out;
  }

  /**
   * The drop target that would take this entity if it were let go of right
   * now, or null. The renderer uses this to light up the mouth it would feed.
   */
  dropTargetFor(id: EntityId): DropTarget | null {
    const entity = this.entities.get(id);
    if (!entity || entity.kind !== 'item' || !this.physics.isActive(id)) return null;
    const def = this.content.items.get(entity.defId);
    const s = this.physics.getState(id);
    return pickDropTarget(def.tags, s.x, s.y, this.dropCandidates(id));
  }

  /** The player fed a bug: the food goes in its mouth. */
  private feed(bugId: EntityId, itemId: EntityId, byPlayer: boolean): void {
    const bug = this.entities.get(bugId);
    const item = this.entities.get(itemId);
    if (!bug?.bug || !item || !canEat(bug.bug)) return;
    const def = this.content.bugs.get(bug.defId);
    // Turn to face the food.
    const bs = this.physics.getState(bugId);
    const is = this.physics.getState(itemId);
    if (Math.abs(is.x - bs.x) > 0.05) bug.bug.facing = is.x > bs.x ? 1 : -1;
    const liking = feedBug(bug.bug, def, itemId, item.defId);
    this.takeInMouth(bug, itemId, liking, byPlayer);
  }

  private takeInMouth(bug: Entity, itemId: EntityId, liking: Liking, byPlayer: boolean): void {
    const item = this.entities.get(itemId);
    if (!item) return;
    this.environment.unstickAll(itemId);
    this.physics.setActive(itemId, false);
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
    this.physics.setActive(itemId, true);
    const vx = facing * SPIT_SPEED.x + this.rng.range(-0.6, 0.6);
    const vy = SPIT_SPEED.y + this.rng.range(-0.8, 0.4);
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
    const want = !!brain && def.curlsWhenFlung && brain.mode === 'st_airborne' && !brain.selfLaunched;
    if (want === this.rolling.has(entity.id)) return;
    this.physics.setRolling(entity.id, want, want ? ROLLED_RESTITUTION : BUG_RESTITUTION);
    if (want) this.rolling.add(entity.id);
    else this.rolling.delete(entity.id);
  }

  /** True while a bug is curled up as a ball. */
  isRolling(id: EntityId): boolean {
    return this.rolling.has(id);
  }

  private handleImpacts(impacts: Impact[]): void {
    const bonked = new Map<EntityId, number>();
    const launched = new Set<EntityId>();
    for (const impact of impacts) {
      for (const [self, other, sign] of [
        [impact.a, impact.b, 1],
        [impact.b, impact.a, -1],
      ] as const) {
        if (self === null) continue;
        const entity = this.entities.get(self);
        if (!entity) continue;
        if (entity.kind === 'bug')
          this.bugImpacts.set(self, Math.max(this.bugImpacts.get(self) ?? 0, impact.speed));
        if (entity.kind === 'item' && other !== null) this.tryCatch(self, other);
        if (impact.speed >= BONK_SPEED) bonked.set(self, Math.max(bonked.get(self) ?? 0, impact.speed));
        const def = entity.kind === 'item' ? this.content.items.get(entity.defId) : null;
        if (def?.launchSpeed && other !== null && !launched.has(other))
          if (this.trySpring(self, def, other, impact, sign)) launched.add(other);
      }
    }
    for (const [id, speed] of [...bonked].sort((a, b) => a[0] - b[0])) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      const s = this.physics.getState(id);
      this.events.emit('bonked', { id, kind: entity.kind, defId: entity.defId, speed, x: s.x, y: s.y });
    }
  }

  /** A thrown food that hits a bug near its mouth gets eaten: a great shot. */
  private tryCatch(itemId: EntityId, bugId: EntityId): void {
    const at = this.thrown.get(itemId);
    if (at === undefined) return;
    if (this.tick - at > THROWN_TICKS) {
      this.thrown.delete(itemId);
      return;
    }
    const target = this.dropTargetFor(itemId);
    if (target?.kind === 'mouth' && target.entityId === bugId) this.feed(bugId, itemId, true);
  }

  /**
   * A spring launches whatever lands on its top along its axis. `sign` is 1
   * if the spring is body A of the contact (so the normal points away from it).
   */
  private trySpring(
    springId: EntityId,
    def: ItemDef,
    otherId: EntityId,
    impact: Impact,
    sign: number,
  ): boolean {
    if (impact.speed < 1 || this.physics.grabbed === otherId || !this.entities.has(otherId)) return false;
    if (def.shape.type !== 'box') return false;
    const s = this.physics.getState(springId);
    const up = { x: Math.sin(s.angle), y: -Math.cos(s.angle) };
    const along = (impact.px - s.x) * up.x + (impact.py - s.y) * up.y;
    const normalAlong = (impact.nx * up.x + impact.ny * up.y) * sign;
    if (along < def.shape.height / 2 - 0.08 || normalAlong < 0.7) return false;
    const o = this.physics.getState(otherId);
    const vUp = o.vx * up.x + o.vy * up.y;
    const tx = (o.vx - vUp * up.x) * 0.6;
    const ty = (o.vy - vUp * up.y) * 0.6;
    const launch = def.launchSpeed ?? 0;
    // A sideways nudge so nothing lands back on the spring forever. Bugs
    // bouncing on purpose drift the way they face.
    const other = this.entities.get(otherId);
    const drift = other?.bug ? other.bug.facing * 1.4 : this.rng.range(-1, 1);
    this.physics.setVelocity(otherId, tx + up.x * launch - up.y * drift, ty + up.y * launch + up.x * drift);
    this.launchGrace.set(otherId, this.tick + 4);
    this.bugImpacts.delete(otherId);
    this.events.emit('spring_bounced', { id: springId, targetId: otherId, x: s.x, y: s.y });
    if (other?.bug && springLaunched(other.bug, springId, this.tick))
      this.events.emit('bug_used', { id: otherId, defId: other.defId, targetId: springId, action: 'bounce' });
    return true;
  }

  /** Safety net: anything that ends up inside the ground is lifted back out. */
  private rescueBuried(): void {
    for (const entity of this.entities.all()) {
      if (this.sleeping.has(entity.id)) continue;
      const s = this.physics.getState(entity.id);
      const floor = this.terrain.surfaceY(s.x);
      if (s.y > floor + BURIED_DEPTH) {
        this.physics.setPosition(entity.id, s.x, floor - 0.6);
        this.physics.setVelocity(entity.id, s.vx, Math.min(0, s.vy));
        this.rescues++;
      }
    }
  }

  /** Drop consumables back in from above when an area runs low. */
  private respawn(): void {
    for (const area of this.content.areas.all) {
      for (const entry of area.respawn) {
        const have = this.entities
          .ofKind('item')
          .filter((e) => e.defId === entry.item)
          .filter((e) => {
            const x = this.physics.getState(e.id).x;
            return x >= area.xStart && x < area.xEnd;
          }).length;
        if (have >= entry.count) continue;
        const x = this.rng.range(area.xStart + 1, area.xEnd - 1);
        const entity = this.spawn('item', entry.item, x, -0.5);
        this.events.emit('item_respawned', { id: entity.id, defId: entity.defId, x, y: -0.5 });
      }
    }
  }

  /** Snapshot of every entity for drawing and tests. */
  views(): EntityView[] {
    const grabbed = this.physics.grabbed;
    const owners = this.mouthOwners();
    return this.entities.all().map((e) => this.viewOf(e, grabbed, owners));
  }

  /** Item ID to the bug chewing it. */
  private mouthOwners(): Map<EntityId, EntityId> {
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
    if (this.sleeping.has(e.id)) view.asleep = true;
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
      return saved;
    });
    return {
      seed: this.seed,
      tick: this.tick,
      rng: this.rng.getState(),
      nextId: this.entities.nextId,
      entities,
      env: clone(this.environment.state),
    };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Starting layout for a new game, from each area's start list. */
export function populateStartingWorld(sim: Sim): void {
  for (const area of sim.content.areas.all) {
    for (const s of area.start) {
      const x = area.xStart + s.x;
      const half =
        s.kind === 'bug'
          ? sim.content.bugs.get(s.defId).radius
          : halfExtents(sim.content.items.get(s.defId).shape, 0).h;
      const water = s.onWater ? sim.environment.waterAt(x) : null;
      // Floaters start sitting in the water, skaters standing on it.
      const y = water
        ? water.level - half * (s.kind === 'bug' ? 1 : 0.4)
        : sim.surfaceY(x) - (s.lift ?? 0) - half - 0.01;
      sim.spawn(s.kind, s.defId, x, y);
    }
  }
}
