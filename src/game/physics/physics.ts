import {
  AABB,
  Box,
  Chain,
  Circle,
  MouseJoint,
  RevoluteJoint,
  Settings,
  Transform,
  Vec2,
  WeldJoint,
  World,
} from 'planck';
import type { Body, Contact, Joint } from 'planck';
import type { EntityId } from '../core/entities';
import type { Terrain } from '../world/terrain';
import { MAX_BODY_SPEED, WORLD_CEILING_Y } from '../constants';

export interface BoxPartSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

/** A circle, or a box; a box with `parts` is built from those boxes (its size is then the bounds). */
export type ShapeSpec =
  | { type: 'circle'; radius: number }
  | { type: 'box'; width: number; height: number; parts?: readonly BoxPartSpec[] };

export interface MaterialSpec {
  density: number;
  friction: number;
  restitution: number;
}

/** Kinematic state of one body. Plain numbers so it serializes as-is. */
export interface BodyState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  av: number;
}

export interface BodyOptions {
  fixedRotation?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  /** A bug: it never settles, and while it walks about on its own it slips past small things at rest (`setGentle`). */
  walker?: boolean;
}

/** What a settled body touched when it froze: a static part of the world or another settled body. */
interface Link {
  body: Body;
  /** Contact normal, pointing from the settled body to `body`. */
  nx: number;
  ny: number;
  px: number;
  py: number;
}

/** A settled body: static until something wakes it, with what it touched and its mass while dynamic. */
interface Settled {
  links: Link[];
  mass: number;
  inertia: number;
}

/** A contact that began during the last step. */
export interface Impact {
  /** Entity IDs, or null for the ground and walls. */
  a: EntityId | null;
  b: EntityId | null;
  /** Relative approach speed along the contact normal, m/s. */
  speed: number;
  /** Contact normal, pointing from a to b. */
  nx: number;
  ny: number;
  /** Contact point. */
  px: number;
  py: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** Wrap an angle into (-PI, PI] so saved state has one canonical form. */
export function wrapAngle(a: number): number {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;
/** How thick the world's end walls and ceiling are: thick enough that nothing is ever pushed through. */
const BOUNDARY_THICKNESS = 3;
/** How thick a locked barrier's wall is, on its locked side. */
const BARRIER_THICKNESS = 0.3;
/** How long a body must have stayed put (steps) before it may settle. planck sleeps bodies after 30. */
const SETTLE_STEPS = 30;
/** How often (steps) things are checked for having stayed put, and settled. */
const SETTLE_EVERY = 15;
/** A body that strays no further than this from where it came to rest (m, rad) has stayed put. Piles jitter. */
const STILL_DRIFT = 0.02;
const STILL_TURN = 0.04;
/** Faster than this (m/s, rad/s) when checked, it is moving, wherever it is. */
const STILL_SPEED = 0.08;
const STILL_SPIN = 0.3;
/** After this long put (steps), walking bugs slip past a thing instead of shoving it. */
const RESTING_STEPS = 15;
/** Bugs slip past only small things (reach from the center, m). Big ones (a ramp, a lattice panel) they climb. */
const SLIP_REACH = 0.45;
/** A contact more upright than this (|normal y|) is standing on it, or it resting on the bug: no slipping. */
const SLIP_NORMAL = 0.8;
/** A thing moving at least this fast (m/s) wakes settled things it is about to touch, if it is at least half as heavy. */
const WAKE_SPEED = 0.5;
/** A thing moving at least this fast (m/s) wakes settled things it is about to touch, however heavy. */
const WAKE_FAST = 2;
/** How many things deep a hard knock wakes a settled pile at once; the next step takes it further if it is still going. */
const KNOCK_SPREAD = 3;
/** A bug must be going this fast (flung or falling, not walking or hopping) to wake settled things. */
const WALKER_WAKE_SPEED = 6;

/**
 * Thin wrapper over planck.js. The rest of the sim talks to bodies by entity
 * ID and never touches planck types directly, so the engine can be swapped.
 */
export class Physics {
  readonly world: World;
  private bodies = new Map<EntityId, Body>();
  private ground: Body;
  private grabJoint: MouseJoint | null = null;
  private grabbedId: EntityId | null = null;
  private pendingImpacts: Impact[] = [];
  private halfExtents = new Map<EntityId, Vec>();
  /** Lily pads, ice sheets: bodies that are part of the world, keyed by name. */
  private platforms = new Map<string, Body>();
  private welds = new Map<number, { joint: Joint; a: EntityId; b: EntityId }>();
  /** Seesaws and catapults resting on their pivots: a hinge to the world. */
  private pivots = new Map<EntityId, Joint>();
  private nextWeld = 1;
  private grabTarget: Vec | null = null;
  private lastGrabTarget: Vec | null = null;
  /** Steps since the hand's target last moved: moves arrive once per frame, not per step. */
  private stillSteps = 0;
  /** How fast the hand moved its target during the last step, m/s. */
  handSpeed = 0;
  /** Bugs' bodies: they never settle. */
  private readonly bugs = new Set<Body>();
  /** Bugs walking about on their own (`setGentle`). */
  private readonly gentle = new Set<Body>();
  /** Settled bodies, made static until something wakes them (R12 of the post-M8 review). */
  private readonly settled = new Map<Body, Settled>();
  /** Where each body came to rest, and the step it did. */
  private readonly still = new Map<Body, { x: number; y: number; a: number; since: number }>();
  private steps = 0;

  /** The lowest point of the terrain, plus a meter. */
  readonly bottom: number;

  constructor(
    gravity: number,
    readonly width: number,
    readonly terrain: Terrain,
  ) {
    this.bottom = Math.max(...terrain.points.map((p) => p[1])) + 1;
    this.world = new World({ gravity: { x: 0, y: gravity } });
    this.ground = this.world.createBody({ type: 'static' });
    const pts = terrain.points.map(([x, y]) => Vec2(x, y));
    // Extend past the walls so nothing slips around the ends.
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    pts.unshift(Vec2(first.x - 2, first.y));
    pts.push(Vec2(last.x + 2, last.y));
    this.ground.createFixture(new Chain(pts, false), { friction: 0.8 });
    // Solid end walls up to a ceiling: a closed box. Thick boxes, not edges,
    // so a body squeezed against them is pushed back in, never out.
    const T = BOUNDARY_THICKNESS;
    const top = WORLD_CEILING_Y;
    const bottom = this.bottom + 2;
    const box = (x0: number, y0: number, x1: number, y1: number): Box =>
      new Box((x1 - x0) / 2, (y1 - y0) / 2, Vec2((x0 + x1) / 2, (y0 + y1) / 2), 0);
    this.ground.createFixture(box(-T, top - T, 0, bottom), { friction: 0.3 });
    this.ground.createFixture(box(width, top - T, width + T, bottom), { friction: 0.3 });
    this.ground.createFixture(box(-T, top - T, width + T, top), { friction: 0.3 });

    this.selectiveContinuous();
    this.world.on('begin-contact', (contact: Contact) => {
      this.fresh.add(contact);
      this.recordImpact(contact);
    });
    this.world.on('end-contact', (contact: Contact) => this.parted(contact));
    this.preSolve = (contact: Contact) => {
      const ba = contact.getFixtureA().getBody();
      const bb = contact.getFixtureB().getBody();
      if (this.slipsPast(contact, ba, bb)) {
        contact.setEnabled(false);
        return;
      }
      if (!this.filtering) return;
      const a = ba.getUserData() as EntityId | null;
      const b = bb.getUserData() as EntityId | null;
      const pass = this.platformPass;
      if (pass && (a == null) !== (b == null)) {
        const key = this.platformKeys.get(a == null ? ba : bb);
        if (key !== undefined && pass(key, (a ?? b)!)) contact.setEnabled(false);
        return;
      }
      const filter = this.passThrough;
      if (!filter) return;
      if (a == null || b == null) return;
      const m = contact.getWorldManifold(null);
      if (m && filter(a, b, m.normal.x, m.normal.y)) contact.setEnabled(false);
    };
    this.world.on('pre-solve', this.preSolve);
  }

  private readonly preSolve: (contact: Contact) => void;
  private filtering = true;

  /**
   * Whether any contact might need filtering this step (`passThrough`,
   * `platformPass`). The sim says no when there are no setups, ghosts, or
   * things in the cobweb, and the per-contact callback skips them.
   */
  set filterContacts(on: boolean) {
    this.filtering = on;
  }

  /** Contacts where a walking bug is slipping past the side of a thing at rest, until they part. */
  private readonly slipping = new Set<Contact>();
  /** Contacts that began touching this step. */
  private readonly fresh = new Set<Contact>();
  /** Pairs that were slipping when one of them settled or woke, until the step they must touch again by. */
  private readonly slipCarry = new Map<number, number>();

  private slipKey(a: Body, b: Body): number {
    const x = (a.getUserData() as EntityId | null) ?? -1;
    const y = (b.getUserData() as EntityId | null) ?? -1;
    return x < y ? pairKey(x, y) : pairKey(y, x);
  }

  /**
   * A bug walking or hopping on its own slips past the side of a thing at
   * rest instead of shoving it, so a pile it brushes stays at rest (and may
   * settle). Standing on it still works, a thing resting on a bug still
   * rests there, and a moving thing still hits the bug. Once slipping, a
   * pair keeps slipping until they part, so they never pop apart. Only a
   * contact that just began can start slipping: something that came to rest
   * leaning on a bug stays on it instead of sinking in.
   */
  private slipsPast(contact: Contact, ba: Body, bb: Body): boolean {
    const ga = this.gentle.has(ba);
    if (ga === this.gentle.has(bb)) return false;
    if (this.slipping.has(contact)) return true;
    if (!this.fresh.has(contact)) return false;
    if (this.slipCarry.size > 0 && this.slipCarry.delete(this.slipKey(ba, bb))) {
      this.slipping.add(contact);
      return true;
    }
    const item = ga ? bb : ba;
    if (item.getUserData() == null || this.bugs.has(item)) return false;
    if (!this.settled.has(item) && !(item.isDynamic() && this.stillFor(item) >= RESTING_STEPS)) return false;
    if (this.grabbedId !== null && item.getUserData() === this.grabbedId) return false;
    if (this.sizeOf(item).reach > SLIP_REACH) return false;
    const m = contact.getWorldManifold(null);
    if (!m || Math.abs(m.normal.y) > SLIP_NORMAL) return false;
    this.slipping.add(contact);
    return true;
  }

  /**
   * Is this bug walking about on its own (not flung, held, or rolling)? Then
   * it slips past things at rest and never wakes settled ones by walking into them.
   */
  setGentle(id: EntityId, gentle: boolean): void {
    const body = this.requireBody(id);
    if (gentle) this.gentle.add(body);
    else this.gentle.delete(body);
  }

  /**
   * Contacts this says yes to are ignored for one step: the bodies slide
   * past each other. The sim uses it so walking bugs never shove the
   * player's setups sideways.
   */
  passThrough: ((a: EntityId, b: EntityId, nx: number, ny: number) => boolean) | null = null;

  /** Contacts between a world part and an entity that this says yes to are ignored (the cobweb letting go). */
  platformPass: ((key: string, id: EntityId) => boolean) | null = null;
  private readonly platformKeys = new Map<Body, string>();

  private recordImpact(contact: Contact): void {
    const ba = contact.getFixtureA().getBody();
    const bb = contact.getFixtureB().getBody();
    const manifold = contact.getWorldManifold(null);
    if (!manifold) return;
    const n = manifold.normal;
    const point = manifold.points[0] ?? ba.getPosition();
    const va = ba.getLinearVelocityFromWorldPoint(point);
    const vb = bb.getLinearVelocityFromWorldPoint(point);
    const approach = (va.x - vb.x) * n.x + (va.y - vb.y) * n.y;
    // Grazing contacts and bodies drifting apart are not impacts.
    if (approach < 0.05) return;
    this.pendingImpacts.push({
      a: (ba.getUserData() as EntityId | null) ?? null,
      b: (bb.getUserData() as EntityId | null) ?? null,
      speed: approach,
      nx: n.x,
      ny: n.y,
      px: point.x,
      py: point.y,
    });
  }

  addBody(
    id: EntityId,
    shape: ShapeSpec,
    material: MaterialSpec,
    state: BodyState,
    options: BodyOptions = {},
  ): void {
    if (this.bodies.has(id)) throw new Error(`Body already exists for entity ${id}`);
    const body = this.world.createBody({
      type: 'dynamic',
      position: Vec2(state.x, state.y),
      angle: state.angle,
      linearVelocity: Vec2(state.vx, state.vy),
      angularVelocity: state.av,
      fixedRotation: options.fixedRotation ?? false,
      linearDamping: options.linearDamping ?? 0.05,
      angularDamping: options.angularDamping ?? 0.1,
      bullet: false,
    });
    this.addFixtures(body, shape, material);
    // Adding fixtures moves the center of mass, and planck shifts the velocity to match a spin
    // about the old one; put back the velocity it was given, so a loaded world moves on exactly.
    body.setLinearVelocity(Vec2(state.vx, state.vy));
    if (shape.type === 'box') this.halfExtents.set(id, { x: shape.width / 2, y: shape.height / 2 });
    body.setUserData(id);
    this.bodies.set(id, body);
    if (options.walker) {
      this.bugs.add(body);
      this.gentle.add(body);
    }
  }

  private addFixtures(body: Body, shape: ShapeSpec, material: MaterialSpec): void {
    if (shape.type === 'box' && shape.parts)
      for (const p of shape.parts)
        body.createFixture(new Box(p.width / 2, p.height / 2, Vec2(p.x, p.y), p.angle), material);
    else {
      const planckShape =
        shape.type === 'circle' ? new Circle(shape.radius) : new Box(shape.width / 2, shape.height / 2);
      body.createFixture(planckShape, material);
    }
  }

  /**
   * Give a body a new shape and material in place (a potion made it giant,
   * tiny, or heavy). Its pose, speed, joints, and hand keep going.
   */
  reshape(id: EntityId, shape: ShapeSpec, material: MaterialSpec): void {
    const body = this.requireBody(id);
    this.disturb(body);
    const first = body.getFixtureList();
    const friction = first?.getFriction() ?? material.friction;
    const restitution = first?.getRestitution() ?? material.restitution;
    for (let f = body.getFixtureList(); f;) {
      const next = f.getNext();
      body.destroyFixture(f);
      f = next;
    }
    this.addFixtures(body, shape, { ...material, friction, restitution });
    if (shape.type === 'box') this.halfExtents.set(id, { x: shape.width / 2, y: shape.height / 2 });
    else this.halfExtents.delete(id);
    body.resetMassData();
    body.setAwake(true);
    this.sizes.delete(body);
  }

  /** Gravity on this body, times g: 1 normal, 0.15 floaty, -1 falls up. */
  setGravityScale(id: EntityId, scale: number): void {
    const body = this.requireBody(id);
    if (body.getGravityScale() === scale) return;
    this.disturb(body);
    body.setGravityScale(scale);
    body.setAwake(true);
  }

  gravityScale(id: EntityId): number {
    return this.requireBody(id).getGravityScale();
  }

  /** Change how bouncy a body is. */
  setRestitution(id: EntityId, restitution: number): void {
    const body = this.requireBody(id);
    for (let f = body.getFixtureList(); f; f = f.getNext()) f.setRestitution(restitution);
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) edge.contact.resetRestitution();
  }

  restitution(id: EntityId): number {
    return this.requireBody(id).getFixtureList()?.getRestitution() ?? 0;
  }

  /**
   * Hinge a body to the world at a point (a seesaw on its cork), letting it
   * turn between `lower` and `upper` radians from its angle now.
   */
  setPivot(id: EntityId, x: number, y: number, lower: number, upper: number): void {
    this.removePivot(id);
    const body = this.requireBody(id);
    this.disturb(body);
    const joint = this.world.createJoint(
      new RevoluteJoint(
        { enableLimit: true, lowerAngle: lower, upperAngle: upper },
        this.ground,
        body,
        Vec2(x, y),
      ),
    );
    if (joint) this.pivots.set(id, joint);
  }

  removePivot(id: EntityId): void {
    const joint = this.pivots.get(id);
    if (!joint) return;
    this.world.destroyJoint(joint);
    this.pivots.delete(id);
  }

  hasPivot(id: EntityId): boolean {
    return this.pivots.has(id);
  }

  removeBody(id: EntityId): void {
    const body = this.bodies.get(id);
    if (!body) return;
    if (this.grabbedId === id) this.release();
    for (const [handle, w] of this.welds) if (w.a === id || w.b === id) this.unweld(handle);
    this.removePivot(id);
    this.leave(body);
    this.world.destroyBody(body);
    this.leaving = null;
    this.sizes.delete(body);
    this.bodies.delete(id);
    this.halfExtents.delete(id);
    this.bugs.delete(body);
    this.gentle.delete(body);
    this.still.delete(body);
  }

  has(id: EntityId): boolean {
    return this.bodies.has(id);
  }

  getState(id: EntityId): BodyState {
    const body = this.requireBody(id);
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return {
      x: p.x,
      y: p.y,
      angle: wrapAngle(body.getAngle()),
      vx: v.x,
      vy: v.y,
      av: body.getAngularVelocity(),
    };
  }

  /**
   * Is the body moving at all? planck puts bodies that have been still for
   * half a second to sleep, and small things that have stayed put settle.
   */
  isAwake(id: EntityId): boolean {
    const body = this.requireBody(id);
    return body.isAwake() && body.isActive() && !this.settled.has(body);
  }

  /** How fast a body moves. The returned vector is live and read-only: copy it to keep it. */
  velocity(id: EntityId): Readonly<Vec> {
    return this.requireBody(id).getLinearVelocity();
  }

  /** Where a body is. The returned point is live and read-only: copy it to keep it. */
  position(id: EntityId): Readonly<Vec> {
    return this.requireBody(id).getPosition();
  }

  /**
   * Is any fixed part of the world (not the ground, not an entity) within
   * `r` of (x, y)? Used to find a clear spot to drop something into.
   */
  solidNear(x: number, y: number, r: number): boolean {
    let hit = false;
    const box = new AABB(Vec2(x - r, y - r), Vec2(x + r, y + r));
    this.world.queryAABB(box, (fixture) => {
      const body = fixture.getBody();
      if (body === this.ground || body.isDynamic() || this.settled.has(body)) return true;
      // The tree's boxes are padded; check the fixture's own.
      for (let i = 0; i < fixture.getShape().getChildCount(); i++)
        if (AABB.testOverlap(box, fixture.getAABB(i))) hit = true;
      return !hit;
    });
    return hit;
  }

  setVelocity(id: EntityId, vx: number, vy: number): void {
    const body = this.requireBody(id);
    // Asking a sleeping body to keep still changes nothing: let it (and what it touches) sleep on.
    if (vx === 0 && vy === 0 && (!body.isAwake() || this.settled.has(body))) return;
    this.disturb(body);
    body.setLinearVelocity(Vec2(vx, vy));
    body.setAwake(true);
  }

  /** Move a body, keeping its velocity. Used to rescue things stuck in the ground. */
  setPosition(id: EntityId, x: number, y: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.setPosition(Vec2(x, y));
    body.setAwake(true);
    // Moved into something settled: let them push each other apart, as two moving things would.
    if (body.isActive()) this.thawAround(body);
  }

  /**
   * Take a body out of the simulation (no collisions, no motion) or put it
   * back. Food in a bug's mouth is inactive. Inactive bodies cannot be grabbed.
   */
  setActive(id: EntityId, active: boolean): void {
    const body = this.requireBody(id);
    if (!active && this.grabbedId === id) this.release();
    if (body.isActive() !== active) {
      if (active) this.disturb(body);
      else this.leave(body);
    }
    body.setActive(active);
    this.leaving = null;
    if (active) body.setAwake(true);
  }

  isActive(id: EntityId): boolean {
    return this.requireBody(id).isActive();
  }

  /** Move a body to a pose and stop it. */
  place(id: EntityId, x: number, y: number, angle: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.setTransform(Vec2(x, y), angle);
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
    if (body.isActive()) this.thawAround(body);
  }

  /** Push a body at its center of mass for the next step (N). */
  applyForce(id: EntityId, fx: number, fy: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.applyForceToCenter(Vec2(fx, fy), true);
  }

  applyTorque(id: EntityId, torque: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.applyTorque(torque, true);
  }

  /** Change a body's friction (wet things grip less, ice hardly at all). */
  setFriction(id: EntityId, friction: number): void {
    const body = this.requireBody(id);
    // Slipperier, it may slide off where it settled.
    if (body.getFixtureList()?.getFriction() !== friction) this.disturb(body);
    for (let f = body.getFixtureList(); f; f = f.getNext()) f.setFriction(friction);
    // Contacts cache mixed friction; refresh them.
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) edge.contact.resetFriction();
  }

  friction(id: EntityId): number {
    return this.requireBody(id).getFixtureList()?.getFriction() ?? 0;
  }

  /**
   * A moving part of the world (a lily pad, an ice sheet): a kinematic box
   * that entities stand on like ground. Creates it, or moves it so it
   * arrives at (x, y) after `dt` seconds.
   */
  setPlatform(
    key: string,
    x: number,
    y: number,
    width: number,
    height: number,
    friction: number,
    dt: number,
  ): void {
    const existing = this.platforms.get(key);
    if (!existing) {
      const body = this.world.createBody({ type: 'kinematic', position: Vec2(x, y) });
      body.createFixture(new Box(width / 2, height / 2), { friction, restitution: 0.05 });
      this.platforms.set(key, body);
      return;
    }
    const p = existing.getPosition();
    existing.setLinearVelocity(Vec2((x - p.x) / dt, (y - p.y) / dt));
  }

  removePlatform(key: string): void {
    const body = this.platforms.get(key);
    if (!body) return;
    this.leave(body);
    this.world.destroyBody(body);
    this.leaving = null;
    this.sizes.delete(body);
    this.platforms.delete(key);
    this.platformKeys.delete(body);
  }

  hasPlatform(key: string): boolean {
    return this.platforms.has(key);
  }

  platformPosition(key: string): Vec | null {
    const body = this.platforms.get(key);
    if (!body) return null;
    const p = body.getPosition();
    return { x: p.x, y: p.y };
  }

  /** Entities touching a platform. */
  onPlatform(key: string): EntityId[] {
    const body = this.platforms.get(key);
    const out: EntityId[] = [];
    if (!body) return out;
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      if (!edge.contact.isTouching()) continue;
      const id = edge.other?.getUserData() as EntityId | null | undefined;
      if (id != null && !out.includes(id)) out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  /**
   * A fixed part of the world shaped as an open polyline (the sunken
   * teacup): static, never grabbed, collides like the ground.
   */
  addStaticChain(key: string, points: readonly Vec[], friction = 0.7): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({ type: 'static' });
    body.createFixture(
      new Chain(
        points.map((p) => Vec2(p.x, p.y)),
        false,
      ),
      { friction, restitution: 0.1 },
    );
    this.platforms.set(key, body);
    this.platformKeys.set(body, key);
    this.thawAround(body);
  }

  /**
   * A fixed box in the world (the porch boards, a shelf, the tin can wall):
   * static, never grabbed, collides like the ground.
   */
  addStaticBox(key: string, x0: number, y0: number, x1: number, y1: number, friction = 0.7): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({ type: 'static', position: Vec2((x0 + x1) / 2, (y0 + y1) / 2) });
    body.createFixture(new Box((x1 - x0) / 2, (y1 - y0) / 2), { friction, restitution: 0.1 });
    this.platforms.set(key, body);
    this.thawAround(body);
  }

  /**
   * An invisible wall from the ceiling down into the ground at x (a locked
   * barrier). Its face is at x; it is a little thick on the `side` it keeps
   * shut (-1 left, 1 right), so nothing pushed hard against it squeezes through.
   */
  addWall(key: string, x: number, side: 1 | -1 = 1): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({ type: 'static' });
    const x0 = side > 0 ? x : x - BARRIER_THICKNESS;
    body.createFixture(
      new Box(
        BARRIER_THICKNESS / 2,
        (this.bottom - WORLD_CEILING_Y) / 2,
        Vec2(x0 + BARRIER_THICKNESS / 2, (this.bottom + WORLD_CEILING_Y) / 2),
        0,
      ),
      { friction: 0.3 },
    );
    this.platforms.set(key, body);
    this.thawAround(body);
  }

  /**
   * A moving part of the world built from boxes (the bucket lift's bucket):
   * kinematic, placed at (x, y), with parts relative to it.
   */
  addKinematic(key: string, x: number, y: number, parts: readonly BoxPartSpec[], friction = 0.8): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({ type: 'kinematic', position: Vec2(x, y) });
    for (const p of parts)
      body.createFixture(new Box(p.width / 2, p.height / 2, Vec2(p.x, p.y), p.angle), {
        friction,
        restitution: 0.05,
      });
    this.platforms.set(key, body);
  }

  /** Move a kinematic part so it arrives at (x, y) after `dt` seconds; `dt` 0 puts it there at once. */
  moveKinematic(key: string, x: number, y: number, dt: number): void {
    const body = this.platforms.get(key);
    if (!body) return;
    if (dt <= 0) {
      body.setTransform(Vec2(x, y), 0);
      body.setLinearVelocity(Vec2(0, 0));
      return;
    }
    const p = body.getPosition();
    body.setLinearVelocity(Vec2((x - p.x) / dt, (y - p.y) / dt));
  }

  /**
   * Small loose bodies that are part of the world, not entities (the bead
   * pit's beads): dynamic circles that nobody can grab. They sleep when still.
   */
  addBead(key: string, x: number, y: number, radius: number, density: number): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({
      type: 'dynamic',
      position: Vec2(x, y),
      linearDamping: 0.8,
      angularDamping: 1.5,
    });
    body.createFixture(new Circle(radius), { density, friction: 0.4, restitution: 0.2 });
    this.platforms.set(key, body);
  }

  /** Switch a world part (a bead) on or off, as its area wakes and sleeps. */
  setPlatformActive(key: string, active: boolean): void {
    const body = this.platforms.get(key);
    if (!body || body.isActive() === active) return;
    if (active) this.disturb(body);
    else this.leave(body);
    body.setActive(active);
    this.leaving = null;
  }

  /** Where a world part is and how fast it moves, or null. */
  platformState(key: string): { x: number; y: number; vx: number; vy: number; angle: number } | null {
    const body = this.platforms.get(key);
    if (!body) return null;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return { x: p.x, y: p.y, vx: v.x, vy: v.y, angle: body.getAngle() };
  }

  /**
   * Pin an entity's body in place (a track piece snapped to the pegboard):
   * static until grabbed. Or let it go again.
   */
  setPinned(id: EntityId, pinned: boolean): void {
    const body = this.requireBody(id);
    this.disturb(body);
    if (pinned === body.isStatic()) return;
    // Things that settled against a pinned piece lose it when it comes loose.
    if (!pinned) this.thawLinkedTo(body);
    body.setType(pinned ? 'static' : 'dynamic');
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
  }

  isPinned(id: EntityId): boolean {
    const body = this.requireBody(id);
    return body.isStatic() && !this.settled.has(body);
  }

  /**
   * Pairs of entities where one rests on top of the other right now: their
   * contact normal is mostly vertical. Lower ID first, sorted.
   */
  restingPairs(): [EntityId, EntityId][] {
    const out: [EntityId, EntityId][] = [];
    const seen = new Set<string>();
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const a = c.getFixtureA().getBody().getUserData() as EntityId | null;
      const b = c.getFixtureB().getBody().getUserData() as EntityId | null;
      if (a == null || b == null || a === b) continue;
      const m = c.getWorldManifold(null);
      if (!m || Math.abs(m.normal.y) < 0.6) continue;
      const pair: [EntityId, EntityId] = a < b ? [a, b] : [b, a];
      const key = `${pair[0]}:${pair[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
    this.settledPairs(out, seen, 0.6);
    return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }

  /** Pairs of entities touching through settled bodies' links (planck keeps no contact between two static bodies). */
  private settledPairs(out: [EntityId, EntityId][], seen: Set<string>, minNy: number): void {
    for (const [body, s] of this.settled) {
      const a = body.getUserData() as EntityId | null;
      if (a == null) continue;
      for (const l of s.links) {
        const b = l.body.getUserData() as EntityId | null;
        if (b == null || a === b || Math.abs(l.ny) < minNy) continue;
        const pair: [EntityId, EntityId] = a < b ? [a, b] : [b, a];
        const key = `${pair[0]}:${pair[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(pair);
      }
    }
  }

  /** Glue two bodies together where they are now. Returns a handle for `unweld`. */
  weld(a: EntityId, b: EntityId, x: number, y: number): number {
    this.disturb(this.requireBody(a));
    this.disturb(this.requireBody(b));
    const joint = this.world.createJoint(
      new WeldJoint(
        { frequencyHz: 0, dampingRatio: 0 },
        this.requireBody(a),
        this.requireBody(b),
        Vec2(x, y),
      ),
    );
    if (!joint) throw new Error('Could not weld');
    const handle = this.nextWeld++;
    this.welds.set(handle, { joint, a, b });
    return handle;
  }

  unweld(handle: number): void {
    const w = this.welds.get(handle);
    if (!w) return;
    this.world.destroyJoint(w.joint);
    this.welds.delete(handle);
  }

  /**
   * What this body touches right now, with the contact normal pointing from
   * it to the other. A bug slipping past a thing does not count (`slipsPast`).
   */
  contactsOf(id: EntityId): { other: EntityId; nx: number; ny: number }[] {
    const body = this.requireBody(id);
    const out: { other: EntityId; nx: number; ny: number }[] = [];
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      // A bug slipping past a thing at rest neither pushes it nor stands on it.
      if (!contact.isTouching() || this.slipping.has(contact)) continue;
      const other = edge.other ? (edge.other.getUserData() as EntityId | null) : null;
      if (other == null) continue;
      const m = contact.getWorldManifold(null);
      if (!m) continue;
      const sign = contact.getFixtureA().getBody() === body ? 1 : -1;
      out.push({ other, nx: m.normal.x * sign, ny: m.normal.y * sign });
    }
    for (const l of this.links(body)) {
      const other = l.body.getUserData() as EntityId | null;
      if (other != null) out.push({ other, nx: l.nx, ny: l.ny });
    }
    return out;
  }

  private static readonly NO_LINKS: readonly Link[] = [];

  /** What a settled body touched when it settled (none for any other body). */
  private links(body: Body): readonly Link[] {
    return this.settled.get(body)?.links ?? Physics.NO_LINKS;
  }

  /** Pairs of entities touching right now, lower ID first, sorted. */
  touchingPairs(): [EntityId, EntityId][] {
    const out: [EntityId, EntityId][] = [];
    const seen = new Set<string>();
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const a = c.getFixtureA().getBody().getUserData() as EntityId | null;
      const b = c.getFixtureB().getBody().getUserData() as EntityId | null;
      if (a == null || b == null || a === b) continue;
      const pair: [EntityId, EntityId] = a < b ? [a, b] : [b, a];
      const key = `${pair[0]}:${pair[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
    this.settledPairs(out, seen, 0);
    return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }

  /** A point where two touching bodies meet, or the midpoint of their centers. */
  contactPoint(a: EntityId, b: EntityId): Vec {
    const body = this.requireBody(a);
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      if (edge.other?.getUserData() !== b || !edge.contact.isTouching()) continue;
      const m = edge.contact.getWorldManifold(null);
      const p = m?.points[0];
      if (p) return { x: p.x, y: p.y };
    }
    for (const l of this.links(body)) if (l.body.getUserData() === b) return { x: l.px, y: l.py };
    const pa = body.getPosition();
    const pb = this.requireBody(b).getPosition();
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  }

  applyImpulse(id: EntityId, ix: number, iy: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
  }

  mass(id: EntityId): number {
    const body = this.requireBody(id);
    return this.settled.get(body)?.mass ?? body.getMass();
  }

  /** Rotational inertia about the center of mass. */
  inertia(id: EntityId): number {
    const body = this.requireBody(id);
    return this.settled.get(body)?.inertia ?? body.getInertia();
  }

  /**
   * Let a body roll freely as a bouncy ball, or stand it back upright with
   * its normal material. Rollo curls up this way.
   */
  setRolling(id: EntityId, rolling: boolean, restitution: number): void {
    const body = this.requireBody(id);
    this.disturb(body);
    body.setFixedRotation(!rolling);
    if (!rolling) {
      body.setAngle(0);
      body.setAngularVelocity(0);
    }
    body.setAngularDamping(rolling ? 1.2 : 0.1);
    for (let f = body.getFixtureList(); f; f = f.getNext()) f.setRestitution(restitution);
    body.setAwake(true);
  }

  /** The entity this body stands on (its most upright support), or null for the ground or nothing. */
  supportBody(id: EntityId): EntityId | null {
    const body = this.requireBody(id);
    let best: { id: EntityId; ny: number } | null = null;
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const other = edge.other ? (edge.other.getUserData() as EntityId | null) : null;
      if (other == null) continue;
      const m = contact.getWorldManifold(null);
      if (!m) continue;
      const sign = contact.getFixtureA().getBody() === body ? -1 : 1;
      const ny = m.normal.y * sign;
      if (ny < -0.5 && (!best || ny < best.ny)) best = { id: other, ny };
    }
    for (const l of this.links(body)) {
      const other = l.body.getUserData() as EntityId | null;
      if (other != null && -l.ny < -0.5 && (!best || -l.ny < best.ny)) best = { id: other, ny: -l.ny };
    }
    return best?.id ?? null;
  }

  /**
   * The upward normal of whatever the body is standing on, or null if it is
   * not supported. Picks the most upright contact. With `overhead`, it looks
   * for what holds an upside-down body up instead, mirrored to read as ground.
   */
  supportNormal(id: EntityId, overhead = false): Vec | null {
    const body = this.requireBody(id);
    let best: Vec | null = null;
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const manifold = contact.getWorldManifold(null);
      if (!manifold) continue;
      // The normal points from fixture A to fixture B; flip it to point into this body.
      const sign = contact.getFixtureA().getBody() === body ? -1 : 1;
      best = this.betterSupport(
        best,
        edge.other ?? null,
        manifold.normal.x * sign,
        manifold.normal.y * sign,
        overhead,
      );
    }
    for (const l of this.links(body)) best = this.betterSupport(best, l.body, -l.nx, -l.ny, overhead);
    return best;
  }

  /** `supportNormal`'s pick between the best support so far and one more, its normal pointing into the body. */
  private betterSupport(
    best: Vec | null,
    other: Body | null,
    nx: number,
    ny: number,
    overhead: boolean,
  ): Vec | null {
    // Upside down, what holds it up is overhead: mirror it, so it reads like ground.
    if (overhead) ny = -ny;
    if (ny >= -0.3) return best;
    // Standing on a small loose thing (a bottle cap, a pebble): treat its top as
    // flat, or gripping would shove it out from underneath. Long things (the
    // ruler ramp, a raft) keep their slope.
    const otherId = other ? (other.getUserData() as EntityId | null) : null;
    const loose = !!other && (other.isDynamic() || this.settled.has(other));
    if (otherId != null && loose && (this.halfExtents.get(otherId)?.x ?? 0) < 0.8) {
      nx = 0;
      ny = -1;
    }
    return best === null || ny < best.y ? { x: nx, y: ny } : best;
  }

  /**
   * The entity touching this body on its `dir` side (1 right, -1 left), such
   * as a pebble in a walking bug's way. Null if nothing is there.
   */
  blockedBy(id: EntityId, dir: 1 | -1): EntityId | null {
    const body = this.requireBody(id);
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const other = edge.other;
      const otherId = other ? (other.getUserData() as EntityId | null) : null;
      if (otherId == null) continue;
      const manifold = contact.getWorldManifold(null);
      if (!manifold) continue;
      const sign = contact.getFixtureA().getBody() === body ? -1 : 1;
      // Low things (a bottle cap) touch a round bug near its bottom: count those too.
      if (manifold.normal.x * sign * dir < -0.35) return otherId;
    }
    for (const l of this.links(body)) {
      const otherId = l.body.getUserData() as EntityId | null;
      if (otherId != null && -l.nx * dir < -0.35) return otherId;
    }
    return null;
  }

  /** True if the body touches something below it (ground or another body). */
  isSupported(id: EntityId): boolean {
    return this.supportNormal(id) !== null;
  }

  /**
   * Is anything with a body (not `self`, not the ground) straight above
   * (x, y) within `reach` meters? Rain uses it: things under a roof stay dry.
   */
  coveredAbove(self: EntityId, x: number, y: number, reach: number): boolean {
    let hit = false;
    this.world.rayCast(Vec2(x, y), Vec2(x, y - reach), (fixture) => {
      const body = fixture.getBody();
      if (body === this.ground || body.getUserData() === self) return -1;
      hit = true;
      return 0;
    });
    return hit;
  }

  /**
   * The body under a point: the topmost (highest ID) one whose shape holds
   * it, or else the nearest one within `pad` (ties go to the topmost). So a
   * click right on a small thing grabs it, not a bigger neighbor whose
   * padded edge reaches over it (R02 of the post-M8 review).
   */
  bodyAt(x: number, y: number, pad = 0.05): EntityId | null {
    const point = Vec2(x, y);
    let inside: EntityId | null = null;
    let near: EntityId | null = null;
    let nearest = Infinity;
    this.world.queryAABB(new AABB(Vec2(x - pad, y - pad), Vec2(x + pad, y + pad)), (fixture) => {
      const id = fixture.getBody().getUserData() as EntityId | null;
      if (id == null) return true;
      if (fixture.testPoint(point) || this.withinBounds(id, fixture.getBody(), point)) {
        if (inside === null || id > inside) inside = id;
        return true;
      }
      const d = this.distanceTo(fixture.getBody(), point);
      if (d <= pad && (d < nearest - 1e-9 || (Math.abs(d - nearest) <= 1e-9 && near !== null && id > near))) {
        nearest = d;
        near = id;
      }
      return true;
    });
    return inside ?? near;
  }

  /** Inside a box body's overall bounds: a hollow thing (a bottle cap, a cup) counts as under the hand. */
  private withinBounds(id: EntityId, body: Body, point: Vec2): boolean {
    const half = this.halfExtents.get(id);
    if (!half) return false;
    const local = body.getLocalPoint(point);
    return Math.abs(local.x) <= half.x && Math.abs(local.y) <= half.y;
  }

  /** How far a point is from a body's shapes (0 inside). */
  private distanceTo(body: Body, point: Vec2): number {
    let best = Infinity;
    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      if (shape instanceof Circle) {
        const c = body.getWorldPoint(shape.getCenter());
        best = Math.min(best, Math.max(0, Vec2.distance(c, point) - shape.getRadius()));
      } else if (shape instanceof Box) {
        // Boxes, and the parts of compound ones (a tilted part counts by its bounds).
        const local = body.getLocalPoint(point);
        const v = shape.m_vertices;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of v) {
          x0 = Math.min(x0, p.x);
          x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y);
          y1 = Math.max(y1, p.y);
        }
        const dx = Math.max(0, x0 - local.x, local.x - x1);
        const dy = Math.max(0, y0 - local.y, local.y - y1);
        best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  }

  /** Attach a soft "hand" joint to a body at a world point. */
  grab(id: EntityId, x: number, y: number, strength = 1): void {
    this.release();
    const body = this.requireBody(id);
    this.disturb(body);
    // A pinned piece comes loose in the hand.
    if (body.isStatic()) this.setPinned(id, false);
    const joint = new MouseJoint(
      { maxForce: 400 * strength * body.getMass(), frequencyHz: 8 * Math.sqrt(strength), dampingRatio: 0.9 },
      this.ground,
      body,
      Vec2(x, y),
    );
    this.grabJoint = this.world.createJoint(joint);
    this.grabbedId = id;
    this.grabTarget = { x, y };
    this.lastGrabTarget = { x, y };
    this.handSpeed = 0;
    body.setAwake(true);
  }

  moveGrab(x: number, y: number): void {
    const cx = Math.min(this.width - 0.05, Math.max(0.05, x));
    const target = { x: cx, y: Math.min(y, this.terrain.surfaceY(cx) - 0.05) };
    this.grabJoint?.setTarget(Vec2(target.x, target.y));
    if (this.grabJoint) this.grabTarget = target;
  }

  /**
   * Drop the held body. With a velocity, the body leaves at that velocity
   * (the cursor's fling); without one it keeps the joint's. Either way the
   * speed is capped so nothing can tunnel.
   */
  release(maxSpeed = Infinity, velocity?: Vec): EntityId | null {
    const id = this.grabbedId;
    if (this.grabJoint) this.world.destroyJoint(this.grabJoint);
    this.grabJoint = null;
    this.grabbedId = null;
    this.grabTarget = null;
    this.lastGrabTarget = null;
    this.handSpeed = 0;
    if (id !== null && this.bodies.has(id)) {
      const body = this.requireBody(id);
      // The hand's joint is to the ground body, so while held a thing passes through the
      // ground (dragging never scrapes). Letting go, its ground contacts must come back
      // now: otherwise something already resting there sinks through until it moves on.
      for (let f = body.getFixtureList(); f; f = f.getNext()) f.refilter();
      if (velocity) body.setLinearVelocity(Vec2(velocity.x, velocity.y));
      const v = body.getLinearVelocity();
      const speed = v.length();
      if (speed > maxSpeed) body.setLinearVelocity(Vec2.mul(v, maxSpeed / speed));
    }
    return id;
  }

  get grabbed(): EntityId | null {
    return this.grabbedId;
  }

  /** How fast the hand is pulling its target this step (m/s). Call once per step, before `step`. */
  measureHand(dt: number): number {
    const t = this.grabTarget;
    const l = this.lastGrabTarget;
    this.stillSteps++;
    if (!t || !l) {
      this.handSpeed = 0;
      this.stillSteps = 0;
    } else if (t.x !== l.x || t.y !== l.y) {
      // Spread the move over the steps since the last one (slow frames run several steps).
      this.handSpeed = Math.hypot(t.x - l.x, t.y - l.y) / (Math.min(this.stillSteps, 6) * dt);
      this.stillSteps = 0;
    }
    this.lastGrabTarget = t ? { ...t } : null;
    return this.handSpeed;
  }

  step(dt: number): void {
    // planck caps each body's move per step; this makes that cap our speed limit.
    // Any velocity above it, from any cause, is scaled down as the step integrates.
    Settings.maxTranslation = MAX_BODY_SPEED * dt;
    this.wakeAhead(dt);
    this.fresh.clear();
    if (this.slipCarry.size > 0)
      for (const [key, until] of this.slipCarry) if (until < this.steps) this.slipCarry.delete(key);
    this.world.step(dt, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.settle();
  }

  /**
   * Each body's thinnest half-size (m: moving more than this in a step could
   * carry it through the ground) and its reach from its center (m: how far a
   * turn swings its ends).
   */
  private readonly sizes = new Map<Body, { thin: number; reach: number }>();

  private sizeOf(body: Body): { thin: number; reach: number } {
    let size = this.sizes.get(body);
    if (!size) {
      let thin = Infinity;
      let reach = 0;
      const local = body.getLocalCenter();
      for (let f = body.getFixtureList(); f; f = f.getNext()) {
        const sh = f.getShape();
        const aabb = new AABB();
        sh.computeAABB(aabb, Transform.identity(), 0);
        const lo = aabb.lowerBound;
        const hi = aabb.upperBound;
        thin = Math.min(thin, (hi.x - lo.x) / 2, (hi.y - lo.y) / 2);
        const dx = Math.max(Math.abs(lo.x - local.x), Math.abs(hi.x - local.x));
        const dy = Math.max(Math.abs(lo.y - local.y), Math.abs(hi.y - local.y));
        reach = Math.max(reach, Math.hypot(dx, dy));
      }
      size = { thin, reach };
      this.sizes.set(body, size);
    }
    return size;
  }

  /**
   * Continuous collision only for bodies that need it. planck checks every
   * awake body against the ground for tunneling each step, and that check
   * cost most of a busy step (R12 of the post-M8 review). A body moving less
   * than half its thinnest size in a step cannot pass through anything, so
   * while the time-of-impact pass runs, slow bodies' fixtures are marked as
   * sensors, which the pass skips. No fast body, no pass at all.
   */
  private selectiveContinuous(): void {
    type Fx = { m_isSensor: boolean };
    const solver = (this.world as unknown as { m_solver: { solveWorldTOI(step: { dt: number }): void } })
      .m_solver;
    const toi = solver.solveWorldTOI.bind(solver);
    const hidden: Fx[] = [];
    solver.solveWorldTOI = (step) => {
      let fast = false;
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic() || !b.isAwake() || !b.isActive()) continue;
        // How far it moved this step (the solve has already moved it), and how far it would go next.
        const sw = (b as unknown as { m_sweep: { c0: Vec; c: Vec; a0: number; a: number } }).m_sweep;
        const v = b.getLinearVelocity();
        const size = this.sizeOf(b);
        const moved = Math.hypot(sw.c.x - sw.c0.x, sw.c.y - sw.c0.y) + Math.abs(sw.a - sw.a0) * size.reach;
        const next = (Math.hypot(v.x, v.y) + Math.abs(b.getAngularVelocity()) * size.reach) * step.dt;
        if (Math.max(moved, next) > size.thin * 0.5) {
          fast = true;
          continue;
        }
        for (let f = b.getFixtureList(); f; f = f.getNext()) {
          const fx = f as unknown as Fx;
          if (fx.m_isSensor) continue;
          fx.m_isSensor = true;
          hidden.push(fx);
        }
      }
      try {
        if (fast) toi(step);
      } finally {
        for (const fx of hidden) fx.m_isSensor = false;
        hidden.length = 0;
      }
    };
  }

  // --- Settling -----------------------------------------------------------------
  //
  // planck sleeps a whole island of touching bodies at once, and only once
  // every body in it has held still for half a second. In a crowded pile some
  // contact always flickers, and a bug walking into the pile joins it to the
  // bug's island, so piles never slept (R12 of the post-M8 review). So the
  // physics settles things itself: one that has stayed put for
  // SETTLE_STEPS (within STILL_DRIFT; piles jitter) turns static, unless a
  // moving part of the world, a cobweb, a pinned piece, or a bug holds it up.
  // It keeps a link to each static or settled thing it touched, so contact
  // queries still see the pile. A settled thing wakes (turns dynamic again):
  // - when anything here moves it, pushes it, changes its gravity, friction,
  //   or shape, welds it, pins it, grabs it, or switches it off (`disturb`);
  // - when something is about to hit it hard enough to move it (`wakeAhead`);
  // - when something it rests on, or leans against, wakes, leaves, or moves
  //   away (`wake`, `leave`, `parted`);
  // - when something is moved into it, a part of the world appears on it, or
  //   it presses down on a bug that walked in under it (`wakeOverBugs`).
  // Walking bugs slip past small things at rest (`slipsPast`) and never wake them.

  /** Has this body settled (static until something wakes it)? */
  isSettled(id: EntityId): boolean {
    return this.settled.has(this.requireBody(id));
  }

  /** Something is about to move or push this body: it is not still, and if it settled, it wakes. */
  private disturb(body: Body): void {
    if (this.settled.has(body)) this.wake([body]);
    this.still.delete(body);
  }

  /**
   * Wake settled bodies, and every settled body resting on one that wakes,
   * as it falls with it. With `spread`, a hard knock carries that many
   * things deep through the pile in any direction.
   */
  private wake(start: Body[], spread = 0): void {
    const waking = new Map<Body, number>();
    const queue = start.filter((b) => this.settled.has(b));
    for (const b of queue) waking.set(b, 0);
    for (let i = 0; i < queue.length; i++) {
      const body = queue[i]!;
      const depth = waking.get(body)!;
      for (const l of this.settled.get(body)!.links) {
        const other = this.settled.get(l.body);
        if (!other || waking.has(l.body)) continue;
        // Resting on it: it falls with it. Beside it, it wakes only if this one moves away (`parted`),
        // unless the knock spreads through the pile.
        if (l.ny < -0.5 || depth < spread) {
          waking.set(l.body, depth + 1);
          queue.push(l.body);
        }
      }
    }
    for (const body of queue) {
      // Settled bodies it stays in touch with keep links only to settled bodies: planck has the contact now.
      for (const l of this.settled.get(body)!.links) {
        const other = this.settled.get(l.body);
        if (other && !waking.has(l.body)) other.links = other.links.filter((k) => k.body !== body);
      }
    }
    this.retyping = true;
    for (const body of queue) {
      this.settled.delete(body);
      body.setType('dynamic');
      body.setAwake(true);
      // If nothing comes of it, it settles again at the next check but one.
      const p = body.getPosition();
      this.still.set(body, {
        x: p.x,
        y: p.y,
        a: body.getAngle(),
        since: this.steps - SETTLE_STEPS + SETTLE_EVERY,
      });
    }
    this.retyping = false;
    // Find its contacts before the next solve, not after it.
    if (queue.length > 0) (this.world as unknown as { m_newFixture: boolean }).m_newFixture = true;
  }

  /**
   * This body leaves the world (removed, eaten, pocketed, its area asleep):
   * whatever settled on it or against it wakes. Things that touched it
   * while moving find out through `parted`.
   */
  private leave(body: Body): void {
    this.still.delete(body);
    const s = this.settled.get(body);
    if (s) this.wake([body, ...s.links.filter((l) => l.ny < 0.5).map((l) => l.body)]);
    else if (body.isStatic()) this.thawLinkedTo(body);
    // Its contacts end as it goes: settled things it held up wake (`parted`), and nothing watches it.
    this.leaving = body;
    if (this.watches.length > 0) this.watches = this.watches.filter((w) => w.other !== body);
  }

  /** The body leaving the world right now (see `leave`). */
  private leaving: Body | null = null;

  /** Wake everything settled against this body (a world part going away, a pinned piece coming loose). */
  private thawLinkedTo(body: Body): void {
    const hit: Body[] = [];
    for (const [b, s] of this.settled) if (s.links.some((l) => l.body === body)) hit.push(b);
    this.wake(hit);
  }

  /** Wake settled bodies overlapping a new part of the world, so they are pushed out of it, not left inside. */
  private thawAround(body: Body): void {
    if (this.settled.size === 0) return;
    const hit: Body[] = [];
    const box = this.ahead;
    for (let f = body.getFixtureList(); f; f = f.getNext())
      for (let i = 0; i < f.getShape().getChildCount(); i++) {
        f.getShape().computeAABB(box, body.getTransform(), i);
        this.world.queryAABB(box, (g) => {
          const b = g.getBody();
          if (b !== body && this.settled.has(b) && !hit.includes(b)) hit.push(b);
          return true;
        });
      }
    this.wake(hit);
  }

  private readonly ahead = new AABB();
  private readonly hits: Body[] = [];
  private readonly knocks: Body[] = [];

  /**
   * Before the solve: wake settled things that something is about to hit
   * hard enough to move them: anything fast (a throw, a fall), anything
   * slower but at least half as heavy (a rolling ball), a flung bug, a
   * moving platform, and whatever is in the hand. A walking bug does not.
   */
  private wakeAhead(dt: number): void {
    this.wakeLost();
    if (this.settled.size === 0) return;
    const hits = this.hits;
    const held = this.grabbedId === null ? null : (this.bodies.get(this.grabbedId) ?? null);
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (b.isStatic() || !b.isAwake() || !b.isActive()) continue;
      const v = b.getLinearVelocity();
      const reach = b.isDynamic() ? this.sizeOf(b).reach : 0;
      const moving = Math.hypot(v.x, v.y) + Math.abs(b.getAngularVelocity()) * reach;
      const gentle = this.gentle.has(b);
      if (b.isKinematic() ? moving === 0 : b !== held && moving < (gentle ? WALKER_WAKE_SPEED : WAKE_SPEED))
        continue;
      // Anything it touches wakes; or only what it is heavy enough to shift.
      const any = b === held || b.isKinematic() || moving >= (gentle ? WALKER_WAKE_SPEED : WAKE_FAST);
      const mass = b.getMass();
      const lo = this.ahead.lowerBound;
      const hi = this.ahead.upperBound;
      lo.x = lo.y = Infinity;
      hi.x = hi.y = -Infinity;
      for (let f = b.getFixtureList(); f; f = f.getNext())
        for (let i = 0; i < f.getShape().getChildCount(); i++) {
          const box = f.getAABB(i);
          lo.x = Math.min(lo.x, box.lowerBound.x);
          lo.y = Math.min(lo.y, box.lowerBound.y);
          hi.x = Math.max(hi.x, box.upperBound.x);
          hi.y = Math.max(hi.y, box.upperBound.y);
        }
      if (lo.x > hi.x) continue;
      // Where it may get to this step, with a little to spare.
      const pad = moving * dt * 2 + 0.03;
      lo.x -= pad;
      lo.y -= pad;
      hi.x += pad;
      hi.y += pad;
      this.world.queryAABB(this.ahead, (f) => {
        const o = f.getBody();
        const s = o === b ? undefined : this.settled.get(o);
        if (!s || !(any || mass >= s.mass * 0.5)) return true;
        // A hard knock carries on through the pile within the step: wake its neighbors too.
        const list = any ? this.knocks : hits;
        if (!list.includes(o)) list.push(o);
        return true;
      });
    }
    if (hits.length > 0) this.wake(hits);
    if (this.knocks.length > 0) this.wake(this.knocks, KNOCK_SPREAD);
    hits.length = 0;
    this.knocks.length = 0;
  }

  /** How many steps this body has stayed where it came to rest (counted every SETTLE_EVERY steps). */
  private stillFor(b: Body): number {
    const at = this.still.get(b);
    return at ? this.steps - at.since : 0;
  }

  /** May this body settle now? */
  private canSettle(b: Body): boolean {
    return (
      b.isDynamic() &&
      b.isActive() &&
      // Entities only: the bead pit's beads stay loose for bugs to wade through.
      b.getUserData() != null &&
      !this.bugs.has(b) &&
      this.stillFor(b) >= SETTLE_STEPS &&
      b.getJointList() === null &&
      b.getFixtureList() !== null
    );
  }

  /** After the solve: count how long each thing has held still, and now and then settle what has. */
  private settle(): void {
    this.wakeLost();
    this.wakeOverBugs();
    this.checkWatches();
    if (++this.steps % SETTLE_EVERY !== 0) return;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic() || !b.isActive() || this.bugs.has(b)) continue;
      const p = b.getPosition();
      const a = b.getAngle();
      const at = this.still.get(b);
      const v = b.getLinearVelocity();
      const moving =
        b.isAwake() && (Math.hypot(v.x, v.y) > STILL_SPEED || Math.abs(b.getAngularVelocity()) > STILL_SPIN);
      if (
        !at ||
        moving ||
        Math.hypot(p.x - at.x, p.y - at.y) > STILL_DRIFT ||
        Math.abs(a - at.a) > STILL_TURN
      )
        this.still.set(b, { x: p.x, y: p.y, a, since: this.steps });
    }
    const batch = new Set<Body>();
    for (let b = this.world.getBodyList(); b; b = b.getNext())
      if (this.canSettle(b) && this.restsFree(b)) batch.add(b);
    if (batch.size > 0) this.settleAll(batch);
  }

  /**
   * A settled thing pressing down on a bug (one that walked in under a
   * leaning panel) wakes, so the bug pushes it up instead of being pushed
   * into the ground.
   */
  private wakeOverBugs(): void {
    if (this.settled.size === 0) return;
    const over = this.hits;
    for (const bug of this.gentle) {
      for (let edge = bug.getContactList(); edge; edge = edge.next ?? null) {
        const c = edge.contact;
        const o = edge.other!;
        if (!this.settled.has(o) || !c.isTouching() || !c.isEnabled() || over.includes(o)) continue;
        const m = c.getWorldManifold(null);
        const sign = c.getFixtureA().getBody() === bug ? 1 : -1;
        if (m && m.normal.y * sign < -0.3) over.push(o);
      }
    }
    if (over.length > 0) this.wake(over);
    over.length = 0;
  }

  /**
   * Nothing it touches stops it settling: no moving part of the world, no
   * cobweb or teacup that may let go of it, and no bug holding it up. Things
   * beside it or under it may still move; if they leave, it wakes (`lost`).
   */
  private restsFree(b: Body): boolean {
    for (let edge = b.getContactList(); edge; edge = edge.next ?? null) {
      const c = edge.contact;
      if (!c.isTouching() || !c.isEnabled()) continue;
      const o = edge.other!;
      if (o.isKinematic()) return false;
      // A cobweb or the teacup may let go of it; a pinned piece may come loose (and keeps no links).
      if (o.isStatic() && (this.platformKeys.has(o) || (o.getUserData() != null && !this.settled.has(o))))
        return false;
      if (this.bugs.has(o)) {
        const m = c.getWorldManifold(null);
        const sign = c.getFixtureA().getBody() === b ? 1 : -1;
        if (!m || m.normal.y * sign > 0.5) return false;
      }
    }
    return true;
  }

  /** Settle these bodies: each keeps a link to what static or settled thing it touches, then turns static. */
  private settleAll(batch: Set<Body>): void {
    const all: [Body, Settled][] = [];
    for (const body of batch) {
      const links: Link[] = [];
      for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
        const c = edge.contact;
        const o = edge.other!;
        if (!c.isTouching() || !c.isEnabled() || !(o.isStatic() || batch.has(o))) continue;
        const m = c.getWorldManifold(null);
        if (!m) continue;
        const sign = c.getFixtureA().getBody() === body ? 1 : -1;
        const p = m.points[0] ?? body.getPosition();
        const link = { body: o, nx: m.normal.x * sign, ny: m.normal.y * sign, px: p.x, py: p.y };
        links.push(link);
        // Settled already: it keeps the link the other way, as planck will drop the contact.
        this.settled.get(o)?.links.push({ body, nx: -link.nx, ny: -link.ny, px: p.x, py: p.y });
      }
      all.push([body, { links, mass: body.getMass(), inertia: body.getInertia() }]);
    }
    this.retyping = true;
    for (const [body, s] of all) {
      this.settled.set(body, s);
      body.setType('static');
      this.still.delete(body);
    }
    this.retyping = false;
  }

  /** True while bodies change type here: the contacts that drops are not things leaving. */
  private retyping = false;
  /** Settled bodies that something under or beside them left this step. */
  private readonly lost: Body[] = [];

  /**
   * Settled bodies that a moving thing just stopped touching from below or
   * beside, and where that thing was. Contacts in a pile flicker on and off
   * while nothing moves, so the settled body wakes only once the other one
   * has really moved away (`checkWatches`).
   */
  private watches: { body: Body; other: Body; x: number; y: number }[] = [];

  /**
   * A contact ended. A settled body that lost something under it or beside
   * it may fall: if that thing left the world, it wakes now; if it is moving
   * off, it wakes once it has gone. A bug slipping past never held it up.
   */
  private parted(contact: Contact): void {
    const ba = contact.getFixtureA().getBody();
    const bb = contact.getFixtureB().getBody();
    // planck reuses contact objects: forget this one slipping before it comes back as another pair.
    if (this.slipping.delete(contact)) {
      // A thing settling or waking loses its contacts and gets new ones: the pair keeps slipping.
      if (this.retyping) this.slipCarry.set(this.slipKey(ba, bb), this.steps + 3);
      return;
    }
    if (this.retyping || this.settled.size === 0) return;
    const body = this.settled.has(ba) ? ba : this.settled.has(bb) ? bb : null;
    if (!body) return;
    const other = body === ba ? bb : ba;
    const p = body.getWorldCenter();
    const q = other.getWorldCenter();
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    // It was on top: this one did not need it.
    if (dy < -0.3 * Math.hypot(dx, dy)) return;
    if (other === this.leaving) {
      if (!this.lost.includes(body)) this.lost.push(body);
      return;
    }
    if (this.watches.some((w) => w.body === body && w.other === other)) return;
    const at = other.getPosition();
    this.watches.push({ body, other, x: at.x, y: at.y });
  }

  /** Wake settled bodies whose neighbor has moved away since they parted. */
  private checkWatches(): void {
    if (this.watches.length === 0) return;
    const gone: Body[] = [];
    this.watches = this.watches.filter((w) => {
      if (!this.settled.has(w.body) || this.settled.has(w.other)) return false;
      const at = w.other.getPosition();
      if (Math.hypot(at.x - w.x, at.y - w.y) <= STILL_DRIFT) return true;
      gone.push(w.body);
      return false;
    });
    this.wake(gone);
  }

  /** Wake settled bodies that lost something they may have rested on. */
  private wakeLost(): void {
    if (this.lost.length === 0) return;
    const lost = this.lost.splice(0);
    this.wake(lost);
  }

  /** Impacts recorded since the last call. */
  takeImpacts(): Impact[] {
    const out = this.pendingImpacts;
    this.pendingImpacts = [];
    return out;
  }

  private requireBody(id: EntityId): Body {
    const body = this.bodies.get(id);
    if (!body) throw new Error(`No body for entity ${id}`);
    return body;
  }
}
