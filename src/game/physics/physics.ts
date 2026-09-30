import { AABB, Box, Chain, Circle, Edge, MouseJoint, Vec2, World } from 'planck';
import type { Body, Contact } from 'planck';
import type { EntityId } from '../core/entities';
import type { Terrain } from '../world/terrain';

export type ShapeSpec = { type: 'circle'; radius: number } | { type: 'box'; width: number; height: number };

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
  }

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
    const planckShape =
      shape.type === 'circle' ? new Circle(shape.radius) : new Box(shape.width / 2, shape.height / 2);
    body.createFixture(planckShape, material);
    if (shape.type === 'box') this.halfExtents.set(id, { x: shape.width / 2, y: shape.height / 2 });
    body.setUserData(id);
    this.bodies.set(id, body);
  }

  removeBody(id: EntityId): void {
    const body = this.bodies.get(id);
    if (!body) return;
    if (this.grabbedId === id) this.release();
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

  applyImpulse(id: EntityId, ix: number, iy: number): void {
    const body = this.requireBody(id);
    body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
  }

  mass(id: EntityId): number {
    return this.requireBody(id).getMass();
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

  /**
   * The upward normal of whatever the body is standing on, or null if it is
   * not supported. Picks the most upright contact.
   */
  supportNormal(id: EntityId): Vec | null {
    const body = this.requireBody(id);
    let best: Vec | null = null;
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const manifold = contact.getWorldManifold(null);
      if (!manifold) continue;
      // The normal points from fixture A to fixture B; flip it to point into this body.
      const sign = contact.getFixtureA().getBody() === body ? -1 : 1;
      const nx = manifold.normal.x * sign;
      const ny = manifold.normal.y * sign;
      if (ny < -0.3 && (best === null || ny < best.y)) best = { x: nx, y: ny };
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
      if (manifold.normal.x * sign * dir < -0.6) return otherId;
    }
    return null;
  }

  /** True if the body touches something below it (ground or another body). */
  isSupported(id: EntityId): boolean {
    return this.supportNormal(id) !== null;
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
  grab(id: EntityId, x: number, y: number): void {
    this.release();
    const body = this.requireBody(id);
    const joint = new MouseJoint(
      { maxForce: 400 * body.getMass(), frequencyHz: 8, dampingRatio: 0.9 },
      this.ground,
      body,
      Vec2(x, y),
    );
    this.grabJoint = this.world.createJoint(joint);
    this.grabbedId = id;
    body.setAwake(true);
  }

  moveGrab(x: number, y: number): void {
    const cx = Math.min(this.width - 0.05, Math.max(0.05, x));
    this.grabJoint?.setTarget(Vec2(cx, Math.min(y, this.terrain.surfaceY(cx) - 0.05)));
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
