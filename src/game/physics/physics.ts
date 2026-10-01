import { AABB, Box, Chain, Circle, Edge, MouseJoint, RevoluteJoint, Vec2, WeldJoint, World } from 'planck';
import type { Body, Contact, Joint } from 'planck';
import type { EntityId } from '../core/entities';
import type { Terrain } from '../world/terrain';

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

  constructor(
    gravity: number,
    readonly width: number,
    readonly terrain: Terrain,
  ) {
    this.world = new World({ gravity: { x: 0, y: gravity } });
    this.ground = this.world.createBody({ type: 'static' });
    const pts = terrain.points.map(([x, y]) => Vec2(x, y));
    // Extend past the walls so nothing slips around the ends.
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    pts.unshift(Vec2(first.x - 2, first.y));
    pts.push(Vec2(last.x + 2, last.y));
    this.ground.createFixture(new Chain(pts, false), { friction: 0.8 });
    const wallTop = -60;
    const wallBottom = Math.max(...terrain.points.map((p) => p[1])) + 1;
    this.ground.createFixture(new Edge(Vec2(0, wallTop), Vec2(0, wallBottom)), { friction: 0.3 });
    this.ground.createFixture(new Edge(Vec2(width, wallTop), Vec2(width, wallBottom)), { friction: 0.3 });

    this.world.on('begin-contact', (contact: Contact) => this.recordImpact(contact));
    this.world.on('pre-solve', (contact: Contact) => {
      const ba = contact.getFixtureA().getBody();
      const bb = contact.getFixtureB().getBody();
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
    });
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
    if (shape.type === 'box') this.halfExtents.set(id, { x: shape.width / 2, y: shape.height / 2 });
    body.setUserData(id);
    this.bodies.set(id, body);
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
  }

  /** Gravity on this body, times g: 1 normal, 0.15 floaty, -1 falls up. */
  setGravityScale(id: EntityId, scale: number): void {
    const body = this.requireBody(id);
    if (body.getGravityScale() === scale) return;
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
    this.world.destroyBody(body);
    this.bodies.delete(id);
    this.halfExtents.delete(id);
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

  setVelocity(id: EntityId, vx: number, vy: number): void {
    const body = this.requireBody(id);
    body.setLinearVelocity(Vec2(vx, vy));
    body.setAwake(true);
  }

  /** Move a body, keeping its velocity. Used to rescue things stuck in the ground. */
  setPosition(id: EntityId, x: number, y: number): void {
    const body = this.requireBody(id);
    body.setPosition(Vec2(x, y));
    body.setAwake(true);
  }

  /**
   * Take a body out of the simulation (no collisions, no motion) or put it
   * back. Food in a bug's mouth is inactive. Inactive bodies cannot be grabbed.
   */
  setActive(id: EntityId, active: boolean): void {
    const body = this.requireBody(id);
    if (!active && this.grabbedId === id) this.release();
    body.setActive(active);
    if (active) body.setAwake(true);
  }

  isActive(id: EntityId): boolean {
    return this.requireBody(id).isActive();
  }

  /** Move a body to a pose and stop it. */
  place(id: EntityId, x: number, y: number, angle: number): void {
    const body = this.requireBody(id);
    body.setTransform(Vec2(x, y), angle);
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
  }

  /** Push a body at its center of mass for the next step (N). */
  applyForce(id: EntityId, fx: number, fy: number): void {
    const body = this.requireBody(id);
    body.applyForceToCenter(Vec2(fx, fy), true);
  }

  applyTorque(id: EntityId, torque: number): void {
    this.requireBody(id).applyTorque(torque, true);
  }

  /** Change a body's friction (wet things grip less, ice hardly at all). */
  setFriction(id: EntityId, friction: number): void {
    const body = this.requireBody(id);
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
    this.world.destroyBody(body);
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
  }

  /** An invisible wall from high above down into the ground at x (a locked barrier). */
  addWall(key: string, x: number): void {
    if (this.platforms.has(key)) return;
    const body = this.world.createBody({ type: 'static' });
    const bottom = Math.max(...this.terrain.points.map((p) => p[1])) + 1;
    body.createFixture(new Edge(Vec2(x, -60), Vec2(x, bottom)), { friction: 0.3 });
    this.platforms.set(key, body);
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
    body.setActive(active);
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
    if (pinned === body.isStatic()) return;
    body.setType(pinned ? 'static' : 'dynamic');
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
  }

  isPinned(id: EntityId): boolean {
    return this.requireBody(id).isStatic();
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
    return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }

  /** Glue two bodies together where they are now. Returns a handle for `unweld`. */
  weld(a: EntityId, b: EntityId, x: number, y: number): number {
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

  /** What this body touches right now, with the contact normal pointing from it to the other. */
  contactsOf(id: EntityId): { other: EntityId; nx: number; ny: number }[] {
    const body = this.requireBody(id);
    const out: { other: EntityId; nx: number; ny: number }[] = [];
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const other = edge.other ? (edge.other.getUserData() as EntityId | null) : null;
      if (other == null) continue;
      const m = contact.getWorldManifold(null);
      if (!m) continue;
      const sign = contact.getFixtureA().getBody() === body ? 1 : -1;
      out.push({ other, nx: m.normal.x * sign, ny: m.normal.y * sign });
    }
    return out;
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
    const pa = body.getPosition();
    const pb = this.requireBody(b).getPosition();
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  }

  applyImpulse(id: EntityId, ix: number, iy: number): void {
    const body = this.requireBody(id);
    body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
  }

  mass(id: EntityId): number {
    return this.requireBody(id).getMass();
  }

  /** Rotational inertia about the center of mass. */
  inertia(id: EntityId): number {
    return this.requireBody(id).getInertia();
  }

  /**
   * Let a body roll freely as a bouncy ball, or stand it back upright with
   * its normal material. Rollo curls up this way.
   */
  setRolling(id: EntityId, rolling: boolean, restitution: number): void {
    const body = this.requireBody(id);
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
      let nx = manifold.normal.x * sign;
      let ny = manifold.normal.y * sign;
      // Upside down, what holds it up is overhead: mirror it, so it reads like ground.
      if (overhead) ny = -ny;
      if (ny >= -0.3) continue;
      // Standing on a small loose thing (a bottle cap, a pebble): treat its top as
      // flat, or gripping would shove it out from underneath. Long things (the
      // ruler ramp, a raft) keep their slope.
      const other = edge.other;
      const otherId = other ? (other.getUserData() as EntityId | null) : null;
      if (otherId != null && other && other.isDynamic() && (this.halfExtents.get(otherId)?.x ?? 0) < 0.8) {
        nx = 0;
        ny = -1;
      }
      if (best === null || ny < best.y) best = { x: nx, y: ny };
    }
    return best;
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

  /** Topmost (highest ID) dynamic body containing the point, or null. */
  bodyAt(x: number, y: number, pad = 0.05): EntityId | null {
    const point = Vec2(x, y);
    let best: EntityId | null = null;
    this.world.queryAABB(new AABB(Vec2(x - pad, y - pad), Vec2(x + pad, y + pad)), (fixture) => {
      const id = fixture.getBody().getUserData() as EntityId | null;
      if (id == null) return true;
      if (fixture.testPoint(point) || this.nearFixture(fixture.getBody(), point, pad)) {
        if (best === null || id > best) best = id;
      }
      return true;
    });
    return best;
  }

  private nearFixture(body: Body, point: Vec2, pad: number): boolean {
    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      if (shape instanceof Circle) {
        const c = body.getWorldPoint(shape.getCenter());
        if (Vec2.distance(c, point) <= shape.getRadius() + pad) return true;
      } else {
        // Boxes: distance from the point to the box in its local frame.
        const half = this.halfExtents.get(body.getUserData() as EntityId);
        if (!half) continue;
        const local = body.getLocalPoint(point);
        const dx = Math.max(0, Math.abs(local.x) - half.x);
        const dy = Math.max(0, Math.abs(local.y) - half.y);
        if (Math.hypot(dx, dy) <= pad) return true;
      }
    }
    return false;
  }

  /** Attach a soft "hand" joint to a body at a world point. */
  grab(id: EntityId, x: number, y: number, strength = 1): void {
    this.release();
    const body = this.requireBody(id);
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
    this.world.step(dt, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
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
