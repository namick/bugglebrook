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
    this.world.on('begin-contact', (contact: Contact) => this.recordImpact(contact));
    this.preSolve = (contact: Contact) => {
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
    };
    this.world.on('pre-solve', this.preSolve);
  }

  private readonly preSolve: (contact: Contact) => void;
  private filtering = true;

  /**
   * Whether any contact might need filtering this step (`passThrough`,
   * `platformPass`). The sim says no when there are no setups, ghosts, or
   * things in the cobweb, and planck then skips the per-contact callback.
   */
  set filterContacts(on: boolean) {
    if (on === this.filtering) return;
    this.filtering = on;
    if (on) this.world.on('pre-solve', this.preSolve);
    else this.world.off('pre-solve', this.preSolve);
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
    this.sizes.delete(body);
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
    this.sizes.delete(body);
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

  /** Is the body moving at all? planck puts bodies that have been still for half a second to sleep. */
  isAwake(id: EntityId): boolean {
    const body = this.requireBody(id);
    return body.isAwake() && body.isActive();
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
      if (body === this.ground || body.isDynamic()) return true;
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
    if (vx === 0 && vy === 0 && !body.isAwake()) return;
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
    body.setAwake(true);
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
    this.world.step(dt, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
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
