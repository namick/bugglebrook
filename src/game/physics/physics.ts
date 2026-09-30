import { AABB, Box, Circle, Edge, MouseJoint, Vec2, World } from 'planck';
import type { Body, Contact } from 'planck';
import type { EntityId } from '../core/entities';

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

export interface Impact {
  a: EntityId | null;
  b: EntityId | null;
  /** Relative approach speed along the contact normal, m/s. */
  speed: number;
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

  constructor(
    gravity: number,
    readonly width: number,
    readonly groundY: number,
  ) {
    this.world = new World({ gravity: { x: 0, y: gravity } });
    this.ground = this.world.createBody({ type: 'static' });
    const wallTop = groundY - 60;
    this.ground.createFixture(new Edge(Vec2(-1, groundY), Vec2(width + 1, groundY)), {
      friction: 0.8,
    });
    this.ground.createFixture(new Edge(Vec2(0, wallTop), Vec2(0, groundY)), { friction: 0.3 });
    this.ground.createFixture(new Edge(Vec2(width, wallTop), Vec2(width, groundY)), {
      friction: 0.3,
    });

    this.world.on('begin-contact', (contact: Contact) => this.recordImpact(contact));
  }

  private recordImpact(contact: Contact): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ba = fa.getBody();
    const bb = fb.getBody();
    const manifold = contact.getWorldManifold(null);
    if (!manifold) return;
    const n = manifold.normal;
    const point = manifold.points[0] ?? ba.getPosition();
    const va = ba.getLinearVelocityFromWorldPoint(point);
    const vb = bb.getLinearVelocityFromWorldPoint(point);
    const approach = (va.x - vb.x) * n.x + (va.y - vb.y) * n.y;
    // Grazing contacts are not impacts.
    if (approach < 1) return;
    this.pendingImpacts.push({
      a: (ba.getUserData() as EntityId | null) ?? null,
      b: (bb.getUserData() as EntityId | null) ?? null,
      speed: approach,
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
    body.setUserData(id);
    this.bodies.set(id, body);
  }

  removeBody(id: EntityId): void {
    const body = this.bodies.get(id);
    if (!body) return;
    if (this.grabbedId === id) this.release();
    this.world.destroyBody(body);
    this.bodies.delete(id);
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

  applyImpulse(id: EntityId, ix: number, iy: number): void {
    const body = this.requireBody(id);
    body.applyLinearImpulse(Vec2(ix, iy), body.getWorldCenter(), true);
  }

  mass(id: EntityId): number {
    return this.requireBody(id).getMass();
  }

  /** True if the body touches something below it (ground or another body). */
  isSupported(id: EntityId): boolean {
    const body = this.requireBody(id);
    for (let edge = body.getContactList(); edge; edge = edge.next ?? null) {
      const contact = edge.contact;
      if (!contact.isTouching()) continue;
      const manifold = contact.getWorldManifold(null);
      if (!manifold) continue;
      // The normal points from fixture A to fixture B.
      const sign = contact.getFixtureA().getBody() === body ? 1 : -1;
      if (manifold.normal.y * sign > 0.5) return true;
    }
    return false;
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
    this.grabJoint?.setTarget(Vec2(x, Math.min(y, this.groundY - 0.05)));
  }

  /** Drop the held body, capping its speed so it cannot tunnel. */
  release(maxSpeed = Infinity): EntityId | null {
    const id = this.grabbedId;
    if (this.grabJoint) this.world.destroyJoint(this.grabJoint);
    this.grabJoint = null;
    this.grabbedId = null;
    if (id !== null && this.bodies.has(id)) {
      const body = this.requireBody(id);
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
