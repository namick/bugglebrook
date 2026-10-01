import type { ActiveEffect, Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import type { BugDef, ItemShape, PotionEffect } from '../data/types';
import type { Sim } from '../sim';
import type { Brew } from './brewing';
import { napBug, wakeBug } from './bugAi';
import { PAINT_SLOTS } from './places';

/**
 * Potion effects (game design doc, section 9, "Potion outcomes"). A bug can
 * have two at once; a third replaces the oldest. They are plain data on the
 * entity (`effects`), so they last through saves. Each one ends when its
 * time runs out, or early when the bug is dunked in water. Some potions
 * work on things too: giant, tiny, glow, floaty, sticky, heavy, bouncy,
 * magnet, and paint.
 *
 * Effects work through the body (size, weight, gravity, bounce), through
 * tags (glowing, smelly, cold, sticky), through the bug's def as its AI sees
 * it (speed, size, hopping), and through a few beats (burps, bubbles,
 * stomps, sneezes). Everything that only shows (rainbow, hair, opera) is the
 * renderer's.
 */

export const MAX_EFFECTS = 2;
/** A splash from a shattered bottle lasts half as long as a drink. */
export const SPLASH_SCALE = 0.5;
/** Bottles break on anything they hit at 9 m/s (900 px/s) or more: a throw, not a drop. */
export const SHATTER_SPEED = 9;
/** A wobble potion flips every 2 s. */
export const WOBBLE_TICKS = 2 * SIM_HZ;
/** Effects that work on things, not just bugs. */
export const ITEM_EFFECTS: ReadonlySet<PotionEffect> = new Set<PotionEffect>([
  'giant',
  'tiny',
  'glow',
  'floaty',
  'sticky_feet',
  'heavy',
  'bouncy',
  'magnet',
  'paint',
]);
/** Tags some effects keep switched on while they last. */
const EFFECT_TAGS: Partial<Record<PotionEffect, string>> = {
  glow: 'tag_glowing',
  stinky: 'tag_smelly',
  frosty: 'tag_cold',
  sticky_feet: 'tag_sticky',
};
/** Upside-down and balloon bugs stop at the top of the sky. */
export const SKY_TOP = 0.35;
/** A magnet bug pulls metal this hard (as a magnet item's `magnet`): things within 2.5 m fly to it. */
export const BUG_MAGNET = 120;
/** Sludge's random cosmetic for 10 s. */
export const SLUDGE_LOOKS = ['fuzzy', 'crossed', 'hiccups'] as const;

interface BodyParams {
  scale: number;
  density: number;
  gravity: number;
  restitution: number | null;
  rolling: boolean;
}

export class Potions {
  /** The body each entity was last given, so a change rebuilds it once. Not saved. */
  private readonly bodies = new Map<EntityId, string>();
  private readonly defs = new Map<EntityId, { key: string; def: BugDef }>();
  constructor(private readonly sim: Sim) {}

  /** Potions roll the world's dice: they only roll while a potion is working. */
  private get rng(): Rng {
    return this.sim.rng;
  }

  /** The effects that count right now. A wobble shows one of its two sides at a time. */
  live(e: Entity): { effect: PotionEffect; strength: number; fx: ActiveEffect }[] {
    const out: { effect: PotionEffect; strength: number; fx: ActiveEffect }[] = [];
    for (const fx of e.effects ?? []) {
      if (fx.effect === 'wobble' && fx.flip) {
        const side = Math.floor((this.sim.tick - fx.since) / WOBBLE_TICKS) % 2;
        out.push({ effect: fx.flip[side]!, strength: fx.strength, fx });
      } else out.push({ effect: fx.effect, strength: fx.strength, fx });
    }
    return out;
  }

  /** The live effect of this kind, if any. */
  has(e: Entity, effect: PotionEffect): { strength: number; fx: ActiveEffect } | null {
    return this.live(e).find((l) => l.effect === effect) ?? null;
  }

  /**
   * A potion reaches a bug or a thing: drunk (its full time), splashed from
   * a broken bottle (half), or given by a test. Returns true if it did
   * anything.
   */
  give(target: Entity, b: Brew, how: 'drink' | 'splash' | 'debug'): boolean {
    const sim = this.sim;
    const s = sim.physics.getState(target.id);
    const isBug = target.kind === 'bug';
    const duration = Math.max(1, Math.round(b.durationTicks * (how === 'splash' ? SPLASH_SCALE : 1)));
    const effects = b.effects.filter((fx) => fx !== 'water');
    if (effects.length === 0) return isBug;
    if (!isBug && !effects.some((fx) => ITEM_EFFECTS.has(fx))) {
      sim.events.emit('potion_fizzled', { id: target.id, x: s.x, y: s.y });
      // "Huh": the nearest bug looks over.
      const near = sim.nearestBug(s.x, s.y, 4);
      if (near) sim.reactBug(near, 'huh');
      return false;
    }
    let did = false;
    for (const effect of effects) {
      if (!isBug && !ITEM_EFFECTS.has(effect)) continue;
      if (effect === 'paint') {
        this.paint(target, b.paint ?? 'paint_red', s.x, s.y);
        did = true;
        continue;
      }
      const fx: ActiveEffect = {
        potion: b.potion,
        effect,
        strength: b.strength,
        since: sim.tick,
        until: sim.tick + duration,
      };
      if (b.flip) fx.flip = [...b.flip];
      if (effect === 'wings' && b.paint) fx.paint = b.paint;
      if (effect === 'sludge') fx.paint = this.rng.pick(SLUDGE_LOOKS);
      this.add(target, fx);
      did = true;
    }
    if (isBug) this.started(target, effects);
    this.sync(target);
    return did;
  }

  /** Put an effect on, replacing the same kind and then the oldest past two. */
  private add(e: Entity, fx: ActiveEffect): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    const list = (e.effects ?? []).filter((f) => f.effect !== fx.effect);
    list.push(fx);
    while (list.length > MAX_EFFECTS) {
      const old = list.shift()!;
      this.ended(e, old, 'replaced');
    }
    e.effects = list;
    sim.events.emit('potion_started', { id: e.id, effect: fx.effect, potion: fx.potion, x: s.x, y: s.y });
  }

  /** One-off starts: a rocket goes up, a sleepy bug drops off, sludge burps. */
  private started(bug: Entity, effects: readonly PotionEffect[]): void {
    const sim = this.sim;
    const brain = bug.bug;
    if (!brain) return;
    const s = sim.physics.getState(bug.id);
    for (const effect of effects) {
      if (effect === 'sleepy' && brain.mode !== 'st_sleep' && sim.physics.grabbed !== bug.id)
        for (const n of napBug(brain, this.sim.bugDef(bug), s.x)) sim.bugNotice(bug, n);
      if (effect === 'rocket') this.fire(bug);
      if (effect === 'sludge') {
        sim.events.emit('potion_burped', { id: bug.id, kind: 'sludge', x: s.x, y: s.y, dir: brain.facing });
        sim.reactBug(bug, 'blegh');
        const look = bug.effects?.find((f) => f.effect === 'sludge')?.paint;
        if (look === 'fuzzy') sim.addTag(bug.id, 'tag_fuzzy', 'potion', 10);
        sim.findSecret('secret_sludge_burp', s.x, s.y);
      }
    }
  }

  /** Whoosh: a rocket bug goes straight up, once. */
  private fire(bug: Entity): void {
    const sim = this.sim;
    const fx = bug.effects?.find((f) => f.effect === 'rocket');
    if (!fx || fx.fired) return;
    if (sim.physics.grabbed === bug.id) sim.physics.release();
    fx.fired = true;
    sim.tossed(bug.id, 0, -17);
  }

  /** Paint from a potion: a bug is painted all over, a thing takes the color. */
  private paint(e: Entity, paint: string, x: number, y: number): void {
    this.sim.places.paint(e, paint, x, y, e.kind === 'bug' ? PAINT_SLOTS : 1);
  }

  private ended(e: Entity, fx: ActiveEffect, cause: 'timeout' | 'dunk' | 'replaced' | 'popped'): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    sim.events.emit('potion_ended', { id: e.id, effect: fx.effect, cause, x: s.x, y: s.y });
    // Effects that held a tag let it go now.
    const tag = EFFECT_TAGS[fx.effect];
    if (tag && !(e.kind === 'item' && sim.defaultTags(e).includes(tag))) sim.removeTag(e.id, tag, 'potion');
    if (fx.effect === 'sleepy' && e.bug?.mode === 'st_sleep')
      for (const n of wakeBug(e.bug, false, sim.rng, sim.tick)) sim.bugNotice(e, n);
  }

  /** Dunked in water: every potion washes off. */
  dunk(id: EntityId): void {
    const e = this.sim.entities.get(id);
    if (!e?.effects?.length) return;
    const list = e.effects;
    e.effects = [];
    for (const fx of list) this.ended(e, fx, 'dunk');
    delete e.effects;
    this.sync(e);
  }

  /** A balloon bug poked: it zips about letting its air out, with a raspberry. True if it was one. */
  poked(e: Entity): boolean {
    const fx = e.effects?.find((f) => f.effect === 'balloon');
    if (!fx || fx.zipUntil !== undefined) return false;
    fx.zipUntil = this.sim.tick + 2 * SIM_HZ;
    const s = this.sim.physics.getState(e.id);
    this.sim.events.emit('balloon_deflated', { id: e.id, x: s.x, y: s.y });
    this.sync(e);
    return true;
  }

  /** Things come out of the pocket: their potions pick up where they left off. */
  shift(e: Entity, ticks: number): void {
    if (ticks <= 0) return;
    for (const fx of e.effects ?? []) {
      fx.since += ticks;
      fx.until += ticks;
      if (fx.next !== undefined) fx.next += ticks;
      if (fx.zipUntil !== undefined) fx.zipUntil += ticks;
    }
  }

  /** A magnet bug or thing pulls this hard, or 0. */
  magnetOf(e: Entity): number {
    return this.has(e, 'magnet') ? BUG_MAGNET : 0;
  }

  /** Passes through thin barriers (the lattice, the cobweb, the tin can wall). */
  ghostly(e: Entity): boolean {
    return !!this.has(e, 'ghost');
  }

  /** Every tick: run out, beat, and keep bodies in step with their effects. */
  update(): void {
    const sim = this.sim;
    for (const e of sim.entities.all()) {
      if (!e.effects || sim.isSleeping(e.id)) {
        if (!e.effects && this.bodies.has(e.id)) this.sync(e);
        continue;
      }
      const s = sim.physics.getState(e.id);
      for (const fx of [...e.effects]) {
        const done = fx.until <= sim.tick || (fx.zipUntil !== undefined && sim.tick >= fx.zipUntil);
        if (!done) continue;
        e.effects = e.effects.filter((f) => f !== fx);
        this.ended(e, fx, fx.zipUntil !== undefined ? 'popped' : 'timeout');
      }
      if (e.effects.length === 0) {
        delete e.effects;
        this.sync(e);
        continue;
      }
      if (sim.tick % 15 === 0)
        for (const l of this.live(e)) {
          const tag = EFFECT_TAGS[l.effect];
          if (tag) sim.addTag(e.id, tag, 'potion', 1);
        }
      if (e.bug) this.beats(e, s.x, s.y, s.vx);
      this.sync(e);
      this.ceiling(e);
    }
  }

  /** Burps, bubbles, stomps, sneezes, frost, and the like. */
  private beats(bug: Entity, x: number, y: number, vx: number): void {
    const sim = this.sim;
    const brain = bug.bug!;
    const tick = sim.tick;
    const dir = brain.facing;
    const held = sim.physics.grabbed === bug.id;
    for (const { effect, fx } of this.live(bug)) {
      switch (effect) {
        case 'burp':
        case 'bubble_burp':
        case 'fire_breath': {
          if (fx.next === undefined) fx.next = tick + this.rng.int(60, 180);
          if (tick < fx.next) break;
          fx.next = tick + this.rng.int(180, 300);
          const kind = effect === 'burp' ? 'burp' : effect === 'fire_breath' ? 'fire' : 'bubble';
          sim.events.emit('potion_burped', { id: bug.id, kind, x, y, dir });
          if (kind === 'burp') this.shockwave(bug, x, y, 1.6);
          if (kind === 'fire') this.flame(bug, x, y, dir);
          if (kind === 'bubble') this.bubbleUp(bug, x, y, dir);
          break;
        }
        case 'bubble':
          if (tick % 30 === 0) {
            sim.events.emit('bubbles_blown', { id: bug.id, x: x - dir * 0.3, y: y - 0.3, count: 2 });
            this.liftLight(bug, x - dir * 0.3, y, 1.2, 9);
          }
          break;
        case 'giant':
        case 'heavy':
          if (tick % 36 === 0 && Math.abs(vx) > 0.3 && !held && sim.physics.isSupported(bug.id)) {
            sim.events.emit('giant_stomped', { id: bug.id, heavy: effect === 'heavy', x, y });
            if (effect === 'giant') this.shockwave(bug, x, y, 1.8, 0.4);
          }
          break;
        case 'frosty': {
          if (fx.next === undefined) fx.next = tick + this.rng.int(240, 420);
          if (tick >= fx.next) {
            fx.next = tick + this.rng.int(240, 420);
            sim.events.emit('frost_sneezed', { id: bug.id, x, y });
          }
          if (tick % 15 === 0) sim.environment.frostStep(x + dir * 0.9, y);
          break;
        }
        case 'balloon':
          if (fx.zipUntil !== undefined && tick % 8 === 0) {
            const a = this.rng.range(0, Math.PI * 2);
            sim.physics.setVelocity(bug.id, Math.cos(a) * 6, Math.sin(a) * 6 - 2);
          }
          break;
        case 'sleepy':
          if (brain.mode !== 'st_sleep' && !held && sim.physics.isSupported(bug.id) && tick % 30 === 0)
            for (const n of napBug(brain, sim.bugDef(bug), x)) sim.bugNotice(bug, n);
          break;
        case 'upside_down':
          if (tick % 30 === 0) sim.upsideDownAt(bug, x, y);
          break;
        case 'snowball':
          if (!held && sim.physics.isSupported(bug.id)) {
            const grown = Math.min(1.5, (fx.grown ?? 1) + Math.abs(vx) * 0.0016);
            fx.grown = Math.round(grown * 1000) / 1000;
          }
          break;
        case 'ghost':
          if (tick % 10 === 0) sim.ghostAt(bug, x, y);
          break;
        default:
          break;
      }
    }
  }

  /** A burp's ring: light things nearby get nudged away. */
  private shockwave(source: Entity, x: number, y: number, reach: number, push = 1): void {
    const sim = this.sim;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id || !sim.physics.isActive(e.id)) continue;
      if (!sim.hasTag(e.id, 'tag_light') && sim.physics.mass(e.id) > 0.4) continue;
      if (sim.setupLinked().has(e.id)) continue;
      const s = sim.physics.getState(e.id);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > reach || d < 0.01) continue;
      const k = (1 - d / reach) * 3 * push;
      sim.physics.setVelocity(e.id, s.vx + ((s.x - x) / d) * k, s.vy - 1.5 * push * (1 - d / reach));
    }
    void source;
  }

  /** Fire breath: a harmless flame puff, a hot cone 1.5 m long ahead. */
  private flame(bug: Entity, x: number, y: number, dir: 1 | -1): void {
    const sim = this.sim;
    for (const e of sim.entities.all()) {
      if (e.id === bug.id || sim.isSleeping(e.id)) continue;
      const s = sim.physics.getState(e.id);
      const ahead = (s.x - x) * dir;
      if (ahead < 0 || ahead > 1.5 || Math.abs(s.y - y) > 0.3 + ahead * 0.4) continue;
      sim.addTag(e.id, 'tag_hot', 'fire');
    }
    // R24: the breath melts ice sheets in front.
    sim.environment.meltAt(x + dir * 0.9, 0.9);
  }

  /** A giant bubble burp: a small bug in front floats up inside it for 5 s. */
  private bubbleUp(bug: Entity, x: number, y: number, dir: 1 | -1): void {
    const sim = this.sim;
    for (const other of sim.entities.ofKind('bug')) {
      if (other.id === bug.id || !other.bug || other.bug.pending || sim.isSleeping(other.id)) continue;
      if (sim.bugDef(other).radius > 0.55) continue;
      const s = sim.physics.getState(other.id);
      const ahead = (s.x - x) * dir;
      if (ahead < 0 || ahead > 2 || Math.abs(s.y - y) > 1) continue;
      this.add(other, {
        potion: 'potion_bubble_burp',
        effect: 'bubbled',
        strength: 1,
        since: sim.tick,
        until: sim.tick + 5 * SIM_HZ,
      });
      sim.tossed(other.id, dir * 0.6, -2.5);
      this.sync(other);
      return;
    }
    this.liftLight(bug, x + dir, y, 1.5, 14);
  }

  /** Bubbles carry small light things up. */
  private liftLight(source: Entity, x: number, y: number, reach: number, lift: number): void {
    const sim = this.sim;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id || !sim.physics.isActive(e.id)) continue;
      if (!sim.hasTag(e.id, 'tag_light') || sim.setupLinked().has(e.id)) continue;
      const s = sim.physics.getState(e.id);
      if (Math.hypot(s.x - x, s.y - y) > reach) continue;
      sim.physics.applyForce(e.id, 0, -sim.physics.mass(e.id) * lift);
    }
    void source;
  }

  /** Balloon and upside-down bugs stop at the top of the sky and walk along it. */
  private ceiling(e: Entity): void {
    const sim = this.sim;
    if (sim.physics.gravityScale(e.id) >= 0) return;
    const s = sim.physics.getState(e.id);
    const half = sim.halfHeight(e);
    if (s.y - half >= SKY_TOP) return;
    sim.physics.setPosition(e.id, s.x, SKY_TOP + half);
    if (s.vy < 0) sim.physics.setVelocity(e.id, s.vx, 0);
  }

  // --- Bodies and defs ---------------------------------------------------

  /** What the body should be, from the live effects. */
  params(e: Entity): BodyParams {
    const out: BodyParams = { scale: 1, density: 1, gravity: 1, restitution: null, rolling: false };
    for (const { effect, strength, fx } of this.live(e)) {
      switch (effect) {
        case 'giant':
          out.scale *= 1 + strength;
          break;
        case 'tiny':
          out.scale /= 1 + strength;
          break;
        case 'heavy':
          out.density *= 1 + 4 * strength;
          break;
        case 'floaty':
          out.gravity *= Math.max(0.05, 1 - 0.85 * strength);
          break;
        case 'ghost':
          out.gravity *= 0.15;
          break;
        case 'bubbled':
          out.gravity *= -0.12;
          break;
        case 'balloon':
          out.gravity *= fx.zipUntil !== undefined ? 0.6 : -0.35;
          break;
        case 'upside_down':
          out.gravity *= -1;
          break;
        case 'bouncy':
          out.restitution = 0.95;
          break;
        case 'jelly':
          out.restitution = Math.max(out.restitution ?? 0, 0.6);
          break;
        case 'snowball':
          out.scale *= fx.grown ?? 1;
          out.restitution = Math.max(out.restitution ?? 0, 0.55);
          out.rolling = true;
          break;
        default:
          break;
      }
    }
    out.scale = Math.round(out.scale * 100) / 100;
    return out;
  }

  /** Rebuild the body if its effects changed what it should be. */
  sync(e: Entity): void {
    const sim = this.sim;
    if (!sim.physics.has(e.id)) return;
    const p = this.params(e);
    const key = `${p.scale}|${p.density}|${p.gravity}|${p.restitution}|${p.rolling}`;
    const was = this.bodies.get(e.id) ?? '1|1|1|null|false';
    if (key === was) return;
    if (key === '1|1|1|null|false') this.bodies.delete(e.id);
    else this.bodies.set(e.id, key);
    const [oldScale, oldDensity, , oldRest, oldRolling] = was.split('|');
    if (Number(oldScale) !== p.scale || Number(oldDensity) !== p.density) {
      const before = sim.halfHeight(e);
      const base = this.baseShape(e);
      const shape = scaleShape(base.shape, p.scale);
      const after = shapeHalfHeight(shape);
      // Growing: lift it first, so it never starts in the ground.
      if (after > before && sim.physics.isActive(e.id)) {
        const s = sim.physics.getState(e.id);
        sim.physics.setPosition(e.id, s.x, s.y - (after - before) - 0.01);
      }
      sim.physics.reshape(e.id, shape, {
        density: base.density * p.density,
        friction: base.friction,
        restitution: base.restitution,
      });
      this.defs.delete(e.id);
    }
    sim.physics.setGravityScale(e.id, p.gravity);
    if (String(p.restitution) !== oldRest || String(p.rolling) !== oldRolling) {
      if (p.rolling) sim.physics.setRolling(e.id, true, p.restitution ?? 0.55);
      else if (oldRolling === 'true')
        sim.physics.setRolling(e.id, false, p.restitution ?? this.baseShape(e).restitution);
      else sim.physics.setRestitution(e.id, p.restitution ?? this.baseShape(e).restitution);
    }
  }

  /** The body an entity has without potions. */
  private baseShape(e: Entity): { shape: ItemShape; density: number; friction: number; restitution: number } {
    const sim = this.sim;
    if (e.kind === 'item') {
      const def = sim.content.items.get(e.defId);
      return { shape: def.shape, density: def.density, friction: def.friction, restitution: def.restitution };
    }
    const def = sim.content.bugs.get(e.defId);
    const shape: ItemShape = def.collider
      ? { type: 'box', width: def.collider.width, height: def.collider.height }
      : { type: 'circle', radius: def.radius };
    return { shape, density: 1, friction: sim.physics.friction(e.id), restitution: 0.15 };
  }

  /** The scale an entity is drawn and built at. */
  scaleOf(e: Entity): number {
    return e.effects ? this.params(e).scale : 1;
  }

  /**
   * The bug as its AI sees it: bigger or smaller, faster or slower, hopping
   * when bouncy, gliding with wings.
   */
  bugDef(e: Entity, base: BugDef): BugDef {
    if (!e.effects?.length) return base;
    const live = this.live(e);
    const key = live
      .map((l) => `${l.effect}:${l.strength}:${l.fx.grown ?? 1}:${l.fx.fired ?? false}`)
      .join(',');
    const cached = this.defs.get(e.id);
    if (cached?.key === key) return cached.def;
    const scale = this.params(e).scale;
    let speed = base.speed;
    const habits = { ...base.habits };
    let glides = base.glidesWhenFlung;
    let dizzyProof = base.dizzyProof;
    for (const { effect, strength, fx } of live) {
      if (effect === 'speedy') speed *= 1 + 1.5 * strength;
      if (effect === 'slowmo') speed *= Math.max(0.2, 1 - 0.7 * strength);
      if (effect === 'giant') speed *= 1.15;
      if (effect === 'tiny') speed *= 0.85;
      if (effect === 'bouncy' || effect === 'jelly') habits.hops = true;
      if (effect === 'wings') {
        habits.hops = true;
        glides = true;
      }
      if (effect === 'rocket' && fx.fired) glides = true;
      if (effect === 'snowball' || effect === 'jelly') dizzyProof = true;
      if (effect === 'upside_down') habits.hops = false;
    }
    const def: BugDef = {
      ...base,
      radius: base.radius * scale,
      mouth: [base.mouth[0] * scale, base.mouth[1] * scale],
      speed,
      habits,
      glidesWhenFlung: glides,
      dizzyProof,
      ...(base.collider
        ? { collider: { width: base.collider.width * scale, height: base.collider.height * scale } }
        : {}),
    };
    this.defs.set(e.id, { key, def });
    return def;
  }

  /** Forget an entity that left the world. */
  forget(id: EntityId): void {
    this.bodies.delete(id);
    this.defs.delete(id);
  }
}

/** A shape `k` times as big. */
export function scaleShape(shape: ItemShape, k: number): ItemShape {
  if (k === 1) return shape;
  if (shape.type === 'circle') return { type: 'circle', radius: shape.radius * k };
  return {
    type: 'box',
    width: shape.width * k,
    height: shape.height * k,
    ...(shape.parts
      ? {
          parts: shape.parts.map((p) => ({
            x: p.x * k,
            y: p.y * k,
            width: p.width * k,
            height: p.height * k,
            angle: p.angle,
          })),
        }
      : {}),
  };
}

function shapeHalfHeight(shape: ItemShape): number {
  return shape.type === 'circle' ? shape.radius : shape.height / 2;
}
