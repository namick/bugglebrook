import type { Command } from './commands';
import { CommandQueue } from './core/commandQueue';
import type { BugAction, BugMode, Entity, EntityId, EntityKind, Needs, SocialKind } from './core/entities';
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
import { baseAffinity, pairKey } from './data/affinity';
import type { GameEvents, Liking, Mood, ReactionType, TagCause } from './events';
import type { BodyState, Impact, MaterialSpec, ShapeSpec } from './physics/physics';
import { Physics } from './physics/physics';
import type { SavedEntity, WorldSave } from './save/schema';
import { Environment } from './systems/environment';
import { TAG_IDS, addTag, effectiveTags, expireTags, removeTag, tagOn } from './systems/tags';
import type { AdvertCandidate, BugNotice, BugWorld, LooseItem, OtherBug, TargetInfo } from './systems/bugAi';
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
  pokedBug,
  react,
  releaseBug,
  shakeBug,
  smellBug,
  springLaunched,
  tickleBug,
  updateBug,
} from './systems/bugAi';
import { CATCH_WINDUP } from './systems/bugSocial';
import { SetupRule } from './systems/setup';
import { OffScreen } from './systems/offscreen';
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
  /** The setup rule: bugs never undo the player. */
  readonly setup: SetupRule;
  /** Coarse simulation for bugs in sleeping areas. */
  readonly offscreen: OffScreen;
  /** Changes to bug-pair affinity since the world began, by pair key. Saved. */
  affinity: Record<string, number> = {};
  /** Things in bugs' front legs: item ID to bug ID. Rebuilt from the brains. */
  private readonly carried = new Map<EntityId, EntityId>();
  /** Loud things this step (crashes, hard landings) that make bugs turn and look. */
  private loud: { x: number; y: number; victim: EntityId | null }[] = [];
  /** What bugs can ask about the world this step, built once per step. */
  private worldCache: BugWorld | null = null;

  private constructor(seed: string, content: Content) {
    this.seed = seed;
    this.content = content;
    this.rng = new Rng(seed);
    this.worldWidth = worldWidth(content);
    this.terrain = Terrain.fromAreas(content.areas.all);
    this.physics = new Physics(GRAVITY, this.worldWidth, this.terrain);
    this.environment = new Environment(this);
    this.setup = new SetupRule(this);
    this.offscreen = new OffScreen(this);
    this.buildFixtures();
    this.physics.passThrough = (a, b, _nx, ny) => this.softContact(a, b, ny);
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
    sim.environment.restore(save.env ? clone(save.env) : sim.environment.state);
    sim.affinity = save.social ? clone(save.social.affinity) : {};
    sim.addMissingBugs();
    sim.refreshFriction();
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
        if (st.kind !== 'bug' || have.has(st.defId) || this.content.bugs.get(st.defId).hidden) continue;
        const x = area.xStart + st.x;
        const r = this.content.bugs.get(st.defId).radius;
        this.spawn('bug', st.defId, x, this.surfaceY(x) - r - 0.3);
        have.add(st.defId);
      }
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
    const holder = this.carried.get(id);
    if (holder !== undefined) {
      const b = this.entities.get(holder)?.bug;
      if (b && b.carrying === id) b.carrying = null;
      this.carried.delete(id);
    }
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
    this.offscreen.update();
    this.worldCache = null;
    this.updateBugs();
    this.capWalkForces();
    this.syncCarried();
    this.catchThrows();
    this.physics.measureHand(SIM_DT);
    this.environment.beforePhysics();
    this.physics.step(SIM_DT);
    this.placeMouthfuls();
    this.placeCarried();
    const impacts = this.physics.takeImpacts();
    this.handleImpacts(impacts);
    this.environment.afterPhysics(impacts);
    this.catchThrows();
    this.setup.update();
    this.gawk();
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
        this.setup.touch(entity.id);
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
        if (entity.bug) releaseBug(entity.bug, this.content.bugs.get(entity.defId), flung, s.y);
        this.setup.touch(entity.id);
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
      releaseBug(
        heldEntity.bug,
        this.content.bugs.get(heldEntity.defId),
        false,
        this.physics.getState(heldEntity.id).y,
      );
    if (!entity) {
      // Nothing there: maybe a fixture, like the hose tap.
      this.environment.pokeFixture(x, y);
      return;
    }
    const s = this.physics.getState(entity.id);
    if (entity.bug) {
      const notices = pokedBug(entity.bug, this.content.bugs.get(entity.defId), this.rng, this.tick);
      if (!notices) return;
      this.physics.setVelocity(entity.id, 0, -2.2);
      this.events.emit('bug_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
      for (const notice of notices) this.emitNotice(entity, notice, s);
    } else {
      // A poke is a touch: it stays the player's.
      this.setup.touch(entity.id);
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
      kind: entity.kind,
      x: s.x,
      y: s.y,
      // The spring is hopped onto along its own axis, so report its true height.
      halfWidth: ext.w,
      halfHeight: box ? box.height / 2 : ext.h,
      angle: s.angle,
      held: this.physics.grabbed === id,
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
    const skater = !!selfEntity && this.content.bugs.get(selfEntity.defId).swim === 'skate';
    for (const item of this.entities.ofKind('item')) {
      if (this.physics.grabbed === item.id || this.sleeping.has(item.id)) continue;
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
    }
    return out;
  }

  /**
   * The setup rule's walk-force cap (game design doc, section 5): a bug
   * walking, turning, or standing against a player setup (or anything
   * leaning on one) never pushes into it. Any velocity into the contact is
   * taken away before physics runs. Flung and curled-up bugs are the
   * player's doing and keep theirs.
   */
  private capWalkForces(): void {
    const linked = this.setupLinked();
    if (linked.size === 0) return;
    for (const bug of this.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || this.sleeping.has(bug.id) || this.byPlayer(bug)) continue;
      const s = this.physics.getState(bug.id);
      let vx = s.vx;
      let vy = s.vy;
      let changed = false;
      for (const c of this.physics.contactsOf(bug.id)) {
        // The thing in the player's hand is the player's doing.
        if (!linked.has(c.other) || this.physics.grabbed === c.other) continue;
        if (c.ny > 0.5 && b.mode !== 'st_airborne' && b.mode !== 'st_use' && b.mode !== 'st_swim') {
          // Standing on the player's things: hop off, clear of them.
          const o = this.physics.getState(c.other);
          const boxes = [...linked].map((id) => this.boxOf(id));
          const free = (d: number): boolean =>
            !boxes.some((q) => s.x + d * 1.5 > q.x0 - 0.8 && s.x + d * 1.5 < q.x1 + 0.8);
          const pref = s.x >= o.x ? 1 : -1;
          if (!free(pref) && !free(-pref)) continue;
          const dir: 1 | -1 = free(pref) ? pref : (-pref as 1 | -1);
          b.facing = dir;
          b.mode = 'st_airborne';
          b.selfLaunched = true;
          b.resume = null;
          b.airPeak = 0;
          b.airTop = s.y;
          b.social = null;
          b.carrying = null;
          b.targetId = null;
          b.action = null;
          vx = dir * 2.6;
          vy = -5.5;
          changed = true;
          this.events.emit('bug_hopped', { id: bug.id, defId: bug.defId, x: s.x, y: s.y });
          break;
        }
        const into = vx * c.nx + vy * c.ny;
        if (into <= 0) continue;
        // Standing on top of it: only its weight rests there, no shove.
        vx -= into * c.nx;
        vy -= into * c.ny;
        changed = true;
      }
      if (changed) this.physics.setVelocity(bug.id, vx, vy);
    }
  }

  /**
   * A walking bug brushing the side of a player setup (or anything leaning
   * on one) slips past it instead of shoving it: the walk-force cap. Standing
   * on top still works, and flung or curled-up bugs hit things for real.
   */
  private softContact(a: EntityId, b: EntityId, ny: number): boolean {
    const ea = this.entities.get(a);
    const eb = this.entities.get(b);
    const bug = ea?.bug ? ea : eb?.bug ? eb : null;
    const item = ea?.kind === 'item' ? ea : eb?.kind === 'item' ? eb : null;
    if (!bug?.bug || !item) return false;
    // A bug hopping about on its own drops past the player's things; one walking only slides past their sides.
    const hopping = bug.bug.mode === 'st_airborne' || bug.bug.mode === 'st_use';
    if (!hopping && Math.abs(ny) > 0.95) return false;
    if (this.byPlayer(bug)) return false;
    if (this.physics.grabbed === item.id) return false;
    return this.setupLinked().has(item.id);
  }

  /** Is this bug moving because the player just grabbed, flung, or poked it? Then it hits for real. */
  private byPlayer(bug: Entity): boolean {
    const b = bug.bug;
    if (!b) return false;
    if (b.mode === 'st_held' || this.physics.grabbed === bug.id) return true;
    const recent = b.touchedAt >= 0 && this.tick - b.touchedAt < 5 * SIM_HZ;
    return recent && ((b.mode === 'st_airborne' && !b.selfLaunched) || b.mode === 'st_rolled');
  }

  /** Is this thing leaning on a player setup (so pushing it would push the setup)? */
  private touchesSetup(id: EntityId): boolean {
    return this.setupLinked().has(id);
  }

  private linkedCache: { tick: number; ids: Set<EntityId> } | null = null;

  /**
   * Player setups plus every item touching them, directly or through other
   * items: a bug pushing any of these would push the player's work.
   */
  setupLinked(): Set<EntityId> {
    if (this.linkedCache?.tick === this.tick) return this.linkedCache.ids;
    const ids = new Set<EntityId>();
    for (const e of this.entities.ofKind('item')) if (this.setup.has(e.id)) ids.add(e.id);
    if (ids.size > 0) {
      const pairs = this.physics
        .touchingPairs()
        .filter(([a, b]) => this.entities.get(a)?.kind === 'item' && this.entities.get(b)?.kind === 'item');
      let grew = true;
      while (grew) {
        grew = false;
        for (const [a, b] of pairs) {
          if (ids.has(a) !== ids.has(b)) {
            ids.add(a);
            ids.add(b);
            grew = true;
          }
        }
      }
      // Anything about to bump into them counts too: a buffer of a few centimeters.
      const boxes = [...ids].map((id) => this.boxOf(id));
      for (const e of this.entities.ofKind('item')) {
        if (ids.has(e.id) || this.sleeping.has(e.id) || !this.physics.isActive(e.id)) continue;
        const b = this.boxOf(e.id);
        if (
          boxes.some(
            (o) => b.x0 < o.x1 + 0.3 && b.x1 > o.x0 - 0.3 && b.y0 < o.y1 + 0.15 && b.y1 > o.y0 - 0.15,
          )
        )
          ids.add(e.id);
      }
    }
    this.linkedCache = { tick: this.tick, ids };
    return ids;
  }

  private boxOf(id: EntityId): { x0: number; x1: number; y0: number; y1: number } {
    const st = this.physics.getState(id);
    const ext = halfExtents(this.content.items.get(this.entities.get(id)!.defId).shape, st.angle);
    return { x0: st.x - ext.w, x1: st.x + ext.w, y0: st.y - ext.h, y1: st.y + ext.h };
  }

  /** Is part of a player setup (other than `except`) within `reach` of x? */
  private setupNearExcept(x: number, reach: number, except: EntityId): boolean {
    for (const it of this.bugWorld().setups)
      if (it.id !== except && it.x1 > x - reach && it.x0 < x + reach) return true;
    return false;
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
      const world = this.bugWorld();
      const decision = updateBug(entity, {
        tick: this.tick,
        id: entity.id,
        world,
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
          return {
            id: other.id,
            isBug: other.kind === 'bug',
            top: info.y - info.halfHeight,
            setup: other.kind === 'item' && (this.setup.has(other.id) || this.touchesSetup(other.id)),
          };
        },
      });
      const v = decision.velocity;
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) this.physics.setVelocity(entity.id, v.x, v.y);
      if (decision.throw) this.pendingThrows.set(decision.throw.itemId, decision.throw);
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
        releaseBug(entity.bug!, def, false, state.y);
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
      if (def.habits.slimeTrail) this.environment.slime(entity, state, def.radius);
    }
    this.bugImpacts.clear();
  }

  // --- The bug AI's view of the world -----------------------------------------

  /** Things bugs threw this step, waiting to leave their legs. */
  private readonly pendingThrows = new Map<EntityId, { vx: number; vy: number; to: EntityId }>();
  /** The flat top of each area's highest ground, for Dot's poses. */
  private summits: Map<string, { x0: number; x1: number; y: number } | null> | null = null;

  /** What the bug AI can ask about the world, built once per step. */
  bugWorld(): BugWorld & { setups: { id: EntityId; x0: number; x1: number; y0: number; y1: number }[] } {
    const cached = this.worldCache as (BugWorld & { setups: never[] }) | null;
    if (cached) return cached;
    const physics = this.physics;
    const bugs: OtherBug[] = [];
    for (const e of this.entities.ofKind('bug')) {
      if (this.sleeping.has(e.id) || !e.bug) continue;
      const st = physics.getState(e.id);
      bugs.push({
        id: e.id,
        defId: e.defId,
        def: this.content.bugs.get(e.defId),
        brain: e.bug,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        supported: physics.supportNormal(e.id) !== null || this.environment.skating.has(e.id),
        held: physics.grabbed === e.id,
      });
    }
    const byId = new Map(bugs.map((b) => [b.id, b]));
    const setups: { id: EntityId; x0: number; x1: number; y0: number; y1: number }[] = [];
    const linked = this.setupLinked();
    const loose: LooseItem[] = [];
    const owners = this.mouthOwners();
    for (const e of this.entities.ofKind('item')) {
      if (this.sleeping.has(e.id)) continue;
      const def = this.content.items.get(e.defId);
      const st = physics.getState(e.id);
      const ext = halfExtents(def.shape, st.angle);
      if (linked.has(e.id)) {
        // The player's things, and anything leaning on them: pushing one pushes the setup.
        setups.push({ id: e.id, x0: st.x - ext.w, x1: st.x + ext.w, y0: st.y - ext.h, y1: st.y + ext.h });
        continue;
      }
      if (physics.grabbed === e.id || this.carried.has(e.id) || owners.has(e.id) || !physics.isActive(e.id))
        continue;
      if (this.environment.overOpenWater(st.x)) continue;
      // Right beside the player's things: leave it be.
      if (
        setups.some(
          (b) =>
            st.x + ext.w > b.x0 - 0.9 &&
            st.x - ext.w < b.x1 + 0.9 &&
            Math.abs(st.y - (b.y0 + b.y1) / 2) < 1.5,
        )
      )
        continue;
      loose.push({
        id: e.id,
        defId: e.defId,
        x: st.x,
        y: st.y,
        speed: Math.hypot(st.vx, st.vy),
        edible: def.tags.includes('tag_edible'),
        catchable: !!def.catchable,
        halfWidth: ext.w,
        top: st.y - ext.h,
      });
    }
    const slime = this.environment.state.slime;
    const world = {
      setups,
      bugs: () => bugs,
      bug: (id: EntityId) => byId.get(id) ?? null,
      setupNear: (x: number, y: number, reach: number, except: EntityId | null = null) =>
        setups.some(
          (b) => b.id !== except && b.x1 > x - reach && b.x0 < x + reach && b.y1 > y - 1.1 && b.y0 < y + 1.1,
        ),
      setupBetween: (x0: number, x1: number) => setups.some((b) => b.x1 > x0 && b.x0 < x1),
      loose: () => loose,
      isSetup: (id: EntityId) => this.setup.has(id),
      edible: (defId: string) =>
        this.content.items.has(defId) && this.content.items.get(defId).tags.includes('tag_edible'),
      affinity: (a: string, b: string) => this.affinityOf(a, b),
      slimeAt: (x: number, y: number) =>
        slime.some((t) => x >= t.x0 && x <= t.x1 && Math.abs(y - t.y) < 0.5 && t.until > this.tick),
      surfaceY: (x: number) => this.terrain.surfaceY(x),
      view: this.focus,
      summit: (x: number) => this.summitOf(x),
      waterEdge: (x: number) => this.waterEdge(x),
      cover: (x: number, fromX: number) => {
        let best: { id: EntityId; x: number } | null = null;
        for (const e of this.entities.ofKind('item')) {
          if (this.sleeping.has(e.id) || !physics.isActive(e.id) || physics.grabbed === e.id) continue;
          const def = this.content.items.get(e.defId);
          const st = physics.getState(e.id);
          const ext = halfExtents(def.shape, st.angle);
          if (ext.w < 0.2 || ext.h < 0.07 || Math.abs(st.x - x) > 3.5 || this.environment.waterAt(st.x))
            continue;
          if (Math.abs(st.x - fromX) < 0.5) continue;
          if (!best || Math.abs(st.x - x) < Math.abs(best.x - x)) best = { id: e.id, x: st.x };
        }
        return best;
      },
    };
    this.worldCache = world;
    return world;
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
  private summitOf(x: number): { x0: number; x1: number; y: number } | null {
    if (!this.summits) {
      this.summits = new Map();
      for (const area of this.content.areas.all) {
        const pts = area.terrain.map(([px, py]) => [area.xStart + px, py] as const);
        const top = Math.min(...pts.map((p) => p[1]));
        const ground = [...pts.map((p) => p[1])].sort((a, b) => a - b)[Math.floor(pts.length / 2)]!;
        const flat = pts.filter((p) => p[1] - top < 0.02);
        const x0 = Math.min(...flat.map((p) => p[0])) + 0.4;
        const x1 = Math.max(...flat.map((p) => p[0])) - 0.4;
        this.summits.set(area.id, ground - top >= 1.5 && x1 - x0 >= 0.8 ? { x0, x1, y: top } : null);
      }
    }
    return this.summits.get(this.areaOf(x).id) ?? null;
  }

  /** The dry spot nearest x from which a bug can hop into water, and which way the water lies. */
  private waterEdge(x: number): { x: number; dir: 1 | -1 } | null {
    let best: { x: number; dir: 1 | -1 } | null = null;
    for (const w of this.environment.surfaces()) {
      for (const edge of [
        { x: w.left - 0.45, dir: 1 as const },
        { x: w.right + 0.45, dir: -1 as const },
      ])
        if (!best || Math.abs(edge.x - x) < Math.abs(best.x - x)) best = edge;
    }
    return best;
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
      if (physics.grabbed === c || !physics.isActive(c) || this.sleeping.has(c)) {
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
      const throwing = this.pendingThrows.get(itemId);
      if (!this.entities.has(itemId) || owners.has(itemId)) continue;
      const hand = bug?.bug ? this.handOf(bug) : this.physics.getState(itemId);
      const item = this.entities.get(itemId)!;
      const half = halfExtents(this.content.items.get(item.defId).shape, 0).h;
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

  /** Where a bug holds things. */
  private handOf(bug: Entity): { x: number; y: number } {
    const s = this.physics.getState(bug.id);
    return handPoint(s.x, s.y, this.content.bugs.get(bug.defId).radius, bug.bug?.facing ?? 1);
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
    const x = s.x + b.facing * (this.content.bugs.get(bug.defId).radius + 0.3);
    const half = halfExtents(this.content.items.get(item.defId).shape, 0).h;
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
      if (this.sleeping.has(bug.id) || this.physics.grabbed === bug.id) continue;
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
        const victim = src.victim === null ? undefined : this.entities.get(src.victim)?.bug;
        if (victim) victim.audience++;
        for (const n of notices) this.emitNotice(entity, n, this.physics.getState(o.id));
      }
    }
  }

  private emitNotice(self: Entity, notice: BugNotice, selfState: BodyState): void {
    // A notice about the partner in some shared moment speaks for that bug.
    const other = notice.by === undefined ? undefined : this.entities.get(notice.by);
    const entity = other ?? self;
    const s = other ? this.physics.getState(other.id) : selfState;
    const base = { id: entity.id, defId: entity.defId };
    const partnerDef = (id: EntityId): string => this.entities.get(id)?.defId ?? '';
    switch (notice.type) {
      case 'landed':
        this.events.emit('bug_landed', { ...base, speed: notice.speed, x: s.x, y: s.y });
        return;
      case 'dizzy':
        this.events.emit('bug_dizzy', { ...base, speed: notice.speed, durationTicks: notice.durationTicks });
        this.noteLoud(s.x, s.y, entity.id);
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
        if (notice.reaction === 'land_hard') this.noteLoud(s.x, s.y, entity.id);
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
      case 'used':
        this.events.emit('bug_used', { ...base, targetId: notice.targetId, action: notice.action });
        return;
      case 'inspected':
        this.events.emit('bug_inspected', {
          ...base,
          itemId: notice.itemId,
          itemDefId: partnerDef(notice.itemId),
        });
        return;
      case 'social':
        this.events.emit('bug_socialized', { ...base, partnerId: notice.partnerId, kind: notice.kind });
        return;
      case 'social_end':
        this.events.emit('bug_social_ended', {
          ...base,
          partnerId: notice.partnerId,
          kind: notice.kind,
          happy: notice.happy,
        });
        return;
      case 'chatted':
        this.events.emit('bug_chatted', {
          ...base,
          partnerId: notice.partnerId,
          topic: notice.topic,
          about: notice.about,
        });
        return;
      case 'bumped': {
        const p = this.entities.has(notice.partnerId) ? this.physics.getState(notice.partnerId) : s;
        this.events.emit('bug_bumped', {
          ...base,
          partnerId: notice.partnerId,
          x: (s.x + p.x) / 2,
          y: (s.y + p.y) / 2,
        });
        return;
      }
      case 'tagged':
        this.events.emit('bug_tagged', { ...base, partnerId: notice.partnerId, x: s.x, y: s.y });
        return;
      case 'shared': {
        const item = this.entities.get(notice.itemId);
        const to = this.entities.get(notice.partnerId);
        if (!item || !to?.bug) return;
        if (to.bug.carrying === item.id) to.bug.carrying = null;
        if (to.id !== entity.id)
          this.events.emit('bug_shared', {
            ...base,
            partnerId: to.id,
            itemId: item.id,
            itemDefId: item.defId,
          });
        this.feed(to.id, item.id, false);
        return;
      }
      case 'snatched':
        this.events.emit('bug_snatched', {
          ...base,
          partnerId: notice.partnerId,
          itemId: notice.itemId,
          itemDefId: partnerDef(notice.itemId),
        });
        return;
      case 'comforted':
        this.events.emit('bug_comforted', { ...base, partnerId: notice.partnerId, x: s.x, y: s.y });
        return;
      case 'gawked':
        this.events.emit('bug_gawked', { ...base, x: notice.x, y: notice.y });
        return;
      case 'rode':
        this.events.emit('bug_rode', { ...base, mountId: notice.mountId, on: notice.on });
        return;
      case 'slept':
        this.events.emit('bug_slept', { ...base, x: s.x, y: s.y });
        return;
      case 'woke':
        this.events.emit('bug_woke', { ...base, early: notice.early });
        return;
      case 'posed':
        this.events.emit('bug_posed', { ...base, x: s.x, y: s.y });
        return;
      case 'fidgeted':
        this.events.emit('bug_fidgeted', { ...base, fidget: notice.fidget });
        return;
      case 'slipped':
        if (entity.bug) entity.bug.needs.need_clean = Math.max(0, entity.bug.needs.need_clean - 5);
        this.events.emit('bug_slipped', { ...base, x: s.x, y: s.y });
        if (entity.bug) this.emitNotice(entity, react(entity.bug, 'slip', this.rng, this.tick), s);
        return;
      case 'curled':
        this.events.emit('bug_curled', { ...base, on: notice.on });
        return;
      case 'hid':
        this.events.emit('bug_hid', { ...base, coverId: notice.coverId, on: notice.on });
        return;
      case 'affinity':
        this.nudgeAffinity(entity.defId, partnerDef(notice.partnerId), notice.delta);
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
        // A bug flung into another bug: they like each other a touch less.
        const hit = other === null ? undefined : this.entities.get(other);
        if (
          sign === 1 &&
          entity.bug &&
          hit?.bug &&
          impact.speed > 3 &&
          ((entity.bug.mode === 'st_airborne' && !entity.bug.selfLaunched) ||
            (hit.bug.mode === 'st_airborne' && !hit.bug.selfLaunched))
        )
          this.nudgeAffinity(entity.defId, hit.defId, -0.02);
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
      // Things in a mouth or in front legs go where their bug puts them.
      if (this.sleeping.has(entity.id) || !this.physics.isActive(entity.id)) continue;
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
        let x = this.rng.range(area.xStart + 1, area.xEnd - 1);
        // Never drop onto the player's things.
        const setups = this.bugWorld().setups;
        for (let tries = 0; tries < 8 && setups.some((b) => x > b.x0 - 3 && x < b.x1 + 3); tries++)
          x = this.rng.range(area.xStart + 1, area.xEnd - 1);
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
    const carrier = this.carried.get(e.id);
    if (carrier !== undefined) view.carriedBy = carrier;
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
      social: b.social ? { kind: b.social.kind, partner: b.social.partner, role: b.social.role } : null,
      carrying: b.carrying,
      groggy: this.tick < b.groggyUntil,
      gliding: b.gliding,
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
      social: { affinity: clone(this.affinity) },
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
