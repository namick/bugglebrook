import type { Command } from './commands';
import { CommandQueue } from './core/commandQueue';
import type { Entity, EntityId, EntityKind } from './core/entities';
import { EntityStore } from './core/entities';
import { EventBus } from './core/events';
import { SIM_DT } from './core/loop';
import { Rng } from './core/rng';
import { BONK_SPEED, GRAVITY, GROUND_Y, MAX_FLING_SPEED } from './constants';
import type { Content } from './data';
import { CONTENT, worldWidth } from './data';
import type { GameEvents } from './events';
import type { BodyState, MaterialSpec, ShapeSpec } from './physics/physics';
import { Physics } from './physics/physics';
import type { SavedEntity, WorldSave } from './save/schema';
import { makeDizzy, newBugBrain, updateBug } from './systems/bugAi';

/** Landing speed that makes a bug dizzy. */
const DIZZY_SPEED = 9;

/** Read-only view of one entity for the renderer and the test hook. */
export interface EntityView extends BodyState {
  id: EntityId;
  kind: EntityKind;
  defId: string;
  held: boolean;
  bug?: { mode: string; facing: 1 | -1 };
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
  readonly events = new EventBus<GameEvents>();
  readonly commands = new CommandQueue<Command>();
  readonly entities = new EntityStore();
  readonly physics: Physics;
  readonly content: Content;
  readonly worldWidth: number;
  readonly seed: string;
  rng: Rng;
  tick = 0;

  private constructor(seed: string, content: Content) {
    this.seed = seed;
    this.content = content;
    this.rng = new Rng(seed);
    this.worldWidth = worldWidth(content);
    this.physics = new Physics(GRAVITY, this.worldWidth, GROUND_Y);
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
      if (saved.bug)
        entity.bug = { ...saved.bug, mode: saved.bug.mode === 'held' ? 'tumble' : saved.bug.mode };
      sim.entities.restore(entity);
      sim.addBodyFor(entity, saved.body);
    }
    sim.entities.nextId = Math.max(save.nextId, sim.entities.nextId);
    return sim;
  }

  private defExists(kind: EntityKind, defId: string): boolean {
    return kind === 'bug' ? this.content.bugs.has(defId) : this.content.items.has(defId);
  }

  spawn(kind: EntityKind, defId: string, x: number, y: number): Entity {
    if (!this.defExists(kind, defId)) throw new Error(`Unknown ${kind} def: ${defId}`);
    const entity = this.entities.create(kind, defId);
    if (kind === 'bug') entity.bug = newBugBrain(x);
    this.addBodyFor(entity, { x, y, angle: 0, vx: 0, vy: 0, av: 0 });
    this.events.emit('entity_spawned', { id: entity.id, kind, defId });
    return entity;
  }

  remove(id: EntityId): void {
    if (!this.entities.has(id)) return;
    this.physics.removeBody(id);
    this.entities.remove(id);
    this.events.emit('entity_removed', { id });
  }

  private addBodyFor(entity: Entity, state: BodyState): void {
    if (entity.kind === 'bug') {
      const def = this.content.bugs.get(entity.defId);
      const shape: ShapeSpec = { type: 'circle', radius: def.radius };
      const material: MaterialSpec = {
        density: 1,
        friction: 0.9,
        restitution: 0.2 + 0.4 * def.traits.bouncy,
      };
      this.physics.addBody(entity.id, shape, material, state, { fixedRotation: true, linearDamping: 0.1 });
    } else {
      const def = this.content.items.get(entity.defId);
      this.physics.addBody(entity.id, def.shape, def, state);
    }
  }

  /** Queue a command for the next step. */
  send(command: Command): void {
    this.commands.push(command);
  }

  /** Advance the world by one fixed step. */
  step(): void {
    for (const command of this.commands.drain()) this.apply(command);
    this.updateBugs();
    this.physics.step(SIM_DT);
    this.handleImpacts();
    this.tick++;
  }

  /** Run `n` steps. Handy for tests. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  private apply(command: Command): void {
    switch (command.type) {
      case 'grab': {
        const id = this.physics.bodyAt(command.x, command.y, 0.15);
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
        const id = this.physics.release(MAX_FLING_SPEED);
        const entity = id === null ? undefined : this.entities.get(id);
        if (!entity) return;
        const s = this.physics.getState(entity.id);
        this.events.emit('item_dropped', {
          id: entity.id,
          kind: entity.kind,
          defId: entity.defId,
          speed: Math.hypot(s.vx, s.vy),
        });
        return;
      }
      case 'spawn':
        this.spawn(command.kind, command.defId, command.x, command.y);
        return;
    }
  }

  private updateBugs(): void {
    const held = this.physics.grabbed;
    for (const entity of this.entities.ofKind('bug')) {
      const state = this.physics.getState(entity.id);
      const decision = updateBug(entity, {
        def: this.content.bugs.get(entity.defId),
        state,
        held: held === entity.id,
        supported: this.physics.isSupported(entity.id),
        worldWidth: this.worldWidth,
        rng: this.rng,
      });
      if (decision.vx !== null) this.physics.setVelocity(entity.id, decision.vx, state.vy);
      if (decision.hop > 0) {
        this.physics.applyImpulse(entity.id, 0, -decision.hop * this.physics.mass(entity.id));
      }
    }
  }

  private handleImpacts(): void {
    const bonked = new Map<EntityId, number>();
    for (const impact of this.physics.takeImpacts()) {
      if (impact.speed < BONK_SPEED) continue;
      for (const id of [impact.a, impact.b]) {
        if (id === null) continue;
        bonked.set(id, Math.max(bonked.get(id) ?? 0, impact.speed));
      }
    }
    for (const [id, speed] of [...bonked].sort((a, b) => a[0] - b[0])) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      const s = this.physics.getState(id);
      this.events.emit('bonked', { id, kind: entity.kind, defId: entity.defId, speed, x: s.x, y: s.y });
      if (entity.bug && speed >= DIZZY_SPEED && this.physics.grabbed !== id) {
        makeDizzy(entity.bug);
        this.events.emit('bug_dizzy', { id, defId: entity.defId });
      }
    }
  }

  /** Snapshot of every entity for drawing and tests. */
  views(): EntityView[] {
    const grabbed = this.physics.grabbed;
    return this.entities.all().map((e) => {
      const view: EntityView = {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        held: grabbed === e.id,
        ...this.physics.getState(e.id),
      };
      if (e.bug) view.bug = { mode: e.bug.mode, facing: e.bug.facing };
      return view;
    });
  }

  view(id: EntityId): EntityView | undefined {
    return this.views().find((v) => v.id === id);
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
      if (e.bug) saved.bug = { ...e.bug };
      return saved;
    });
    return {
      seed: this.seed,
      tick: this.tick,
      rng: this.rng.getState(),
      nextId: this.entities.nextId,
      entities,
    };
  }
}

/** Starting layout for a new game. */
export function populateStartingWorld(sim: Sim): void {
  const onGround = (h: number): number => GROUND_Y - h / 2 - 0.01;
  sim.spawn('item', 'pebble', 4, onGround(0.56));
  sim.spawn('item', 'matchbox', 8, onGround(0.55));
  sim.spawn('item', 'matchbox', 8.1, onGround(0.55) - 0.56);
  sim.spawn('item', 'bottle_cap', 10.5, onGround(0.18));
  sim.spawn('item', 'pebble', 15, onGround(0.56));
  sim.spawn('item', 'pebble_rattle', 29, onGround(0.4));
  sim.spawn('bug', 'bip', 6, onGround(0.84));
  sim.spawn('bug', 'gloop', 12, onGround(1));
}
