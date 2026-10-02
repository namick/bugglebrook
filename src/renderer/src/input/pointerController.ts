import type { EntityId } from '../../../game/core/entities';
import type { Sim } from '../../../game/sim';
import type { Camera, Point } from '../render/camera';
import { dialMinutes } from '../render/fixtureArt';
import { DOOR_DWELL } from '../render/iris';

/** `dial` is turning the sundial's rim; `lever` pulls the bench's lever; `stir` goes round the cauldron. */
export type PointerMode = 'none' | 'hold' | 'pan' | 'dial' | 'lever' | 'stir' | 'seq';

/** Input gestures that make a sound but are not sim events. */
export type Gesture = 'hover' | 'swish' | 'pan' | 'scroll' | 'edge' | 'dial' | 'lever' | 'stir';

/** Fling velocity is the cursor's average over this window (game design doc, section 2). */
export const FLING_WINDOW_MS = 80;
/** A press and release this quick and this still is a poke. */
export const POKE_MS = 200;
export const POKE_PX = 6;
/** Pressing and holding a bug this long without moving tickles it. */
export const TICKLE_MS = 600;
/** A shake: back and forth 3 strokes of at least 80 px within 0.8 s. */
export const SHAKE_STROKES = 3;
export const SHAKE_STROKE_PX = 80;
export const SHAKE_WINDOW_MS = 800;
/** A held thing moving faster than this (px/s) swishes. */
const SWISH_PX_PER_S = 1400;

/**
 * Spots a shake in a stream of pointer positions (view pixels): strokes
 * that reverse direction along x. Pure, so tests can feed it points.
 */
export class ShakeDetector {
  private anchor: number | null = null;
  /** When the current stroke started (ms). */
  private anchorT = 0;
  private extreme = 0;
  private dir = 0;
  private strokes: number[] = [];

  reset(): void {
    this.anchor = null;
    this.dir = 0;
    this.strokes = [];
  }

  /** Add a point at time `t` (ms). True when this point completes a shake. */
  push(t: number, x: number): boolean {
    if (this.anchor === null) {
      this.anchor = x;
      this.anchorT = t;
      this.extreme = x;
      return false;
    }
    const REVERSE = 20;
    if (this.dir === 0) {
      if (Math.abs(x - this.anchor) >= REVERSE) {
        this.dir = Math.sign(x - this.anchor);
        this.extreme = x;
      }
      return false;
    }
    if ((x - this.extreme) * this.dir > 0) this.extreme = x;
    else if ((this.extreme - x) * this.dir >= REVERSE) {
      // Strokes are remembered by when they started, so the whole shake fits the window.
      if (Math.abs(this.extreme - this.anchor) >= SHAKE_STROKE_PX) this.strokes.push(this.anchorT);
      this.anchor = this.extreme;
      this.anchorT = t;
      this.dir = -this.dir;
      this.extreme = x;
    }
    this.strokes = this.strokes.filter((s) => t - s <= SHAKE_WINDOW_MS);
    const current = Math.abs(this.extreme - this.anchor) >= SHAKE_STROKE_PX ? 1 : 0;
    if (this.strokes.length + current >= SHAKE_STROKES) {
      this.strokes = [];
      this.anchor = this.extreme;
      return true;
    }
    return false;
  }
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * Average velocity (units per second) over the last `windowMs` before the
 * newest sample: the distance from where the pointer was `windowMs` earlier
 * (interpolated between samples) to where it is now. With less history
 * than that, it uses the oldest sample.
 */
export function averageVelocity(samples: readonly Sample[], windowMs = FLING_WINDOW_MS): Point {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) return { x: 0, y: 0 };
  const t0 = last.t - windowMs;
  let from: Sample = samples[0]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    const a = samples[i]!;
    if (a.t <= t0) {
      const b = samples[i + 1]!;
      const k = b.t > a.t ? (t0 - a.t) / (b.t - a.t) : 0;
      from = { t: t0, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      break;
    }
  }
  const dt = (last.t - from.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - from.x) / dt, y: (last.y - from.y) / dt };
}

/**
 * Turns pointer gestures into sim commands and camera moves.
 * Press on a thing: grab it; move: drag; release: drop or fling with the
 * cursor's recent velocity. A quick still click is a poke. Press on empty
 * space: pan the camera, and coast on release. Positions come in as logical
 * view pixels (1920x1080 space).
 */
export class PointerController {
  mode: PointerMode = 'none';
  /** Cursor position in world meters, or null when it left the canvas. */
  hoverWorld: Point | null = null;
  /** The last release velocity sent to the sim (m/s), for tests. */
  lastRelease: Point | null = null;
  /** The grabbable thing under the cursor, when not holding or panning. */
  hoverId: EntityId | null = null;
  /** A clickable fixture under the cursor (the hose tap), when nothing grabbable is. */
  hoverFixture: string | null = null;
  /** The kind of that fixture (the cauldron shows the stir pose). */
  hoverFixtureKind: string | null = null;
  /** Sounds for gestures that are not sim events. */
  onGesture: ((gesture: Gesture, strength: number) => void) | null = null;
  /** Tickling the held bug right now. */
  tickling = false;
  /** The pocket slot under a view point, if the tray is open there (set by the game). */
  pocketAt: ((view: Point) => number | null) | null = null;
  /**
   * M10: go through an open doorway. A click on it, or holding something over
   * it for `DOOR_DWELL` (`carrying`). The game plays the iris wipe and sends
   * `travel` at its middle.
   */
  onDoor: ((doorId: string, carrying: boolean) => void) | null = null;
  /** Seconds the held thing has hovered a doorway, and the doorway passed through last (until the hand leaves it). */
  private doorDwell = 0;
  private doorLatch: string | null = null;
  /** Edge-scroll while carrying (a setting). */
  edgeScroll = true;
  /** Share of the pan speed the camera coasts with after a drag (less with reduce motion). */
  coastScale = 1;
  private shake = new ShakeDetector();
  private lastSwish = -Infinity;
  private lastScroll = -Infinity;
  private panSounded = false;
  private edging = false;
  private pointer: Point = { x: 0, y: 0 };
  private samples: Sample[] = [];
  private pressAt = 0;
  private pressView: Point = { x: 0, y: 0 };
  private pressWorld: Point = { x: 0, y: 0 };
  private travelled = 0;
  private panLastX = 0;
  private panVelocity = 0;
  /** The sundial being turned: its centre (world px), where the pointer was, and how far forward it has gone. */
  private dial: { cx: number; cy: number; last: Point; net: number; best: number } | null = null;
  /** The bench's lever being pulled: where the press began, how far down, and whether it fired. */
  private lever: { start: Point; amount: number; pulled: boolean } | null = null;
  /** The cauldron being stirred: its middle (world m), the ladle's last angle, and turning not yet sent. */
  private stir: { cx: number; cy: number; angle: number; unsent: number; swept: number } | null = null;
  private stirSound = 0;

  /** The fixture the hand is working right now, for the views (the lever's pull, the ladle's angle). */
  get fixtureDrag(): { kind: 'lever' | 'stir'; amount: number; angle: number } | null {
    if (this.mode === 'lever' && this.lever) return { kind: 'lever', amount: this.lever.amount, angle: 0 };
    if (this.mode === 'stir' && this.stir) return { kind: 'stir', amount: 0, angle: this.stir.angle };
    return null;
  }
  private dialSound = 0;

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly viewWidthPx: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Record where the pointer is, at event time `t` (ms, performance clock). */
  private sample(t: number): void {
    const w = this.camera.viewToWorld(this.pointer);
    this.samples.push({ t, x: w.x, y: w.y });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 250) this.samples.shift();
  }

  /**
   * Pointer handlers take the DOM event's timestamp when there is one. Events
   * can arrive in bursts on a slow frame, so the time they happened is what
   * measures the fling, not the time they were handled.
   */
  down(view: Point, t = this.now()): void {
    this.pointer = view;
    const world = this.camera.viewToWorld(view);
    this.hoverWorld = world;
    this.pressAt = t;
    this.pressView = view;
    this.pressWorld = world;
    this.travelled = 0;
    this.samples = [];
    this.sample(t);
    const hit = this.sim.pickAt(world.x, world.y);
    this.camera.velocity = 0;
    this.camera.stopGlide();
    this.hoverId = null;
    this.tickling = false;
    this.shake.reset();
    this.shake.push(t, view.x);
    const fixture = hit === null ? this.sim.environment.fixtureAt(world.x, world.y) : null;
    if (hit !== null) {
      this.mode = 'hold';
      this.sim.send({ type: 'grab', x: world.x, y: world.y });
    } else if (fixture?.kind === 'bench_lever') {
      // The clothespin lever: pull it down to work the bench.
      this.mode = 'lever';
      this.lever = { start: world, amount: 0, pulled: false };
    } else if (fixture?.kind === 'cauldron') {
      // The ladle: go round and round to stir.
      this.mode = 'stir';
      this.stir = {
        cx: fixture.x,
        cy: fixture.y,
        angle: Math.atan2((world.y - fixture.y) * 2, world.x - fixture.x),
        unsent: 0,
        swept: 0,
      };
    } else if (fixture?.kind === 'sequencer') {
      // The mushroom sequencer: a press toggles a cap or works a control; a drag paints caps.
      this.mode = 'seq';
      this.sim.send({ type: 'seq_touch', x: world.x, y: world.y, start: true });
    } else if (fixture?.kind === 'sundial') {
      // The sundial's rim: turning it clockwise moves time forward.
      this.mode = 'dial';
      this.dial = {
        cx: fixture.x * 100,
        cy: fixture.y * 100,
        last: { x: world.x * 100, y: world.y * 100 },
        net: 0,
        best: 0,
      };
    } else {
      this.mode = 'pan';
      this.panLastX = view.x;
      this.panVelocity = 0;
      this.panSounded = false;
    }
  }

  /**
   * Press on a pocket slot: its top thing comes out into the hand at the
   * cursor, and the press carries on as a hold.
   */
  takeFromPocket(slot: number, view: Point, t = this.now()): void {
    this.pointer = view;
    const world = this.camera.viewToWorld(view);
    this.hoverWorld = world;
    this.pressAt = t;
    this.pressView = view;
    this.pressWorld = world;
    // Never a poke: it came out of the pocket.
    this.travelled = POKE_PX + 1;
    this.samples = [];
    this.sample(t);
    this.camera.velocity = 0;
    this.camera.stopGlide();
    this.hoverId = null;
    this.tickling = false;
    this.shake.reset();
    this.shake.push(t, view.x);
    this.mode = 'hold';
    this.sim.send({ type: 'pocket_take', slot, x: world.x, y: world.y });
  }

  private gesture(g: Gesture, strength = 1): void {
    this.onGesture?.(g, strength);
  }

  /** What is under the cursor right now (nothing while holding or panning). */
  private updateHover(): void {
    const w = this.hoverWorld;
    const id = this.mode === 'none' && w ? this.sim.pickAt(w.x, w.y) : null;
    if (id !== null && id !== this.hoverId) this.gesture('hover');
    this.hoverId = id;
    const fixture =
      this.mode === 'none' && w && id === null ? this.sim.environment.fixtureAt(w.x, w.y) : null;
    if (fixture && fixture.id !== this.hoverFixture) this.gesture('hover');
    this.hoverFixture = fixture?.id ?? null;
    this.hoverFixtureKind = fixture?.kind ?? null;
  }

  move(view: Point, dt = 1 / 60, t = this.now()): void {
    const prev = this.pointer;
    const prevT = this.samples[this.samples.length - 1]?.t ?? t;
    this.pointer = view;
    this.hoverWorld = this.camera.viewToWorld(view);
    this.travelled = Math.max(
      this.travelled,
      Math.hypot(view.x - this.pressView.x, view.y - this.pressView.y),
    );
    this.updateHover();
    if (this.mode === 'hold') {
      this.sample(t);
      if (this.tickling && this.travelled > POKE_PX) {
        this.tickling = false;
        this.sim.send({ type: 'tickle', on: false });
      }
      if (this.shake.push(t, view.x)) this.sim.send({ type: 'shake' });
      const ms = t - prevT;
      const speed = ms > 0 ? (Math.hypot(view.x - prev.x, view.y - prev.y) / ms) * 1000 : 0;
      if (speed > SWISH_PX_PER_S && t - this.lastSwish > 250) {
        this.lastSwish = t;
        this.gesture('swish', Math.min(1, speed / 4000));
      }
    }
    if (this.mode === 'dial' && this.dial) {
      const d = this.dial;
      const at = { x: this.hoverWorld.x * 100, y: this.hoverWorld.y * 100 };
      d.net += dialMinutes(d.cx, d.cy, d.last, at);
      d.last = at;
      // Only forward: turning back and forth adds nothing until it passes the furthest point.
      if (d.net > d.best + 0.5 && this.travelled > POKE_PX) {
        this.sim.send({ type: 'dial_turn', minutes: d.net - d.best });
        d.best = d.net;
        if (t - this.dialSound > 90) {
          this.dialSound = t;
          this.gesture('dial', 0.6);
        }
      }
    }
    if (this.mode === 'lever' && this.lever) {
      const l = this.lever;
      const w = this.hoverWorld;
      // Down (and a little outward) pulls it; 0.9 m of pull is all the way.
      l.amount = Math.min(1, Math.max(0, (w.y - l.start.y) / 0.9 + Math.max(0, w.x - l.start.x) * 0.25));
      if (!l.pulled && l.amount >= 0.85) {
        l.pulled = true;
        this.sim.send({ type: 'pull_lever' });
        this.gesture('lever');
      }
    }
    if (this.mode === 'seq') {
      const w = this.hoverWorld;
      this.sim.send({ type: 'seq_touch', x: w.x, y: w.y, start: false });
    }
    if (this.mode === 'stir' && this.stir) {
      const st = this.stir;
      const w = this.hoverWorld;
      // The pot is seen from the side: squash the circle so stirring feels round.
      const a = Math.atan2((w.y - st.cy) * 2, w.x - st.cx);
      let d = a - st.angle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      st.angle = a;
      if (this.travelled > POKE_PX) {
        st.unsent += d;
        st.swept += Math.abs(d);
        if (Math.abs(st.unsent) > 0.15) {
          this.sim.send({ type: 'stir', radians: st.unsent });
          st.unsent = 0;
        }
        if (st.swept > 0.8 && t - this.stirSound > 140) {
          this.stirSound = t;
          st.swept = 0;
          this.gesture('stir', 0.6);
        }
      }
    }
    if (this.mode === 'pan') {
      const dxMeters = (view.x - this.panLastX) / this.camera.ppm;
      this.camera.panBy(-dxMeters);
      if (dt > 0) this.panVelocity = -dxMeters / dt;
      this.panLastX = view.x;
      if (!this.panSounded && this.travelled > POKE_PX) {
        this.panSounded = true;
        this.gesture('pan');
      }
    }
  }

  /** The pointer left the canvas. */
  leave(): void {
    this.hoverWorld = null;
  }

  /** Cursor velocity in world m/s over the fling window. */
  velocity(): Point {
    return averageVelocity(this.samples);
  }

  /** `view` is where the release happened; moves can still be queued behind it on a slow frame. */
  up(t = this.now(), view?: Point): void {
    if (view) {
      this.travelled = Math.max(
        this.travelled,
        Math.hypot(view.x - this.pressView.x, view.y - this.pressView.y),
      );
      this.pointer = view;
    }
    if (this.mode === 'hold') {
      const quick = t - this.pressAt <= POKE_MS && this.travelled <= POKE_PX;
      if (quick) {
        this.sim.send({ type: 'poke', x: this.pressWorld.x, y: this.pressWorld.y });
        this.lastRelease = null;
      } else {
        this.sample(t);
        const slot = this.pocketAt?.(this.pointer) ?? null;
        if (slot !== null) {
          // Let go over the pocket: it goes in (drop rule 1).
          this.lastRelease = null;
          this.sim.send({ type: 'pocket_put', slot });
        } else {
          const v = this.velocity();
          this.lastRelease = v;
          this.sim.send({ type: 'release', vx: v.x, vy: v.y });
        }
      }
    }
    if (this.mode === 'lever' || this.mode === 'stir') {
      const click = t - this.pressAt <= POKE_MS && this.travelled <= POKE_PX;
      // A click pulls the lever, or tips the cauldron over.
      if (click) this.sim.send({ type: 'poke', x: this.pressWorld.x, y: this.pressWorld.y });
      else if (this.stir && Math.abs(this.stir.unsent) > 0.01)
        this.sim.send({ type: 'stir', radians: this.stir.unsent });
      this.lever = null;
      this.stir = null;
    }
    if (this.mode === 'dial') {
      const click = t - this.pressAt <= POKE_MS && this.travelled <= POKE_PX;
      // A click on the dial pokes it (the painted sun counts clicks); a turn lets the dial go.
      if (click) this.sim.send({ type: 'poke', x: this.pressWorld.x, y: this.pressWorld.y });
      else this.sim.send({ type: 'dial_release' });
      this.dial = null;
    }
    if (this.mode === 'pan') {
      const click = t - this.pressAt <= POKE_MS && this.travelled <= POKE_PX;
      // A click on empty space pokes it: fixtures like the hose tap respond. An open doorway takes you through.
      const door = click && this.onDoor ? this.sim.hidden.doorAt(this.pressWorld.x, this.pressWorld.y) : null;
      if (door) this.onDoor?.(door.id, false);
      else if (click) this.sim.send({ type: 'poke', x: this.pressWorld.x, y: this.pressWorld.y });
      else this.camera.velocity = Math.max(-40, Math.min(40, this.panVelocity)) * this.coastScale;
    }
    this.mode = 'none';
    this.tickling = false;
    this.edging = false;
    this.updateHover();
  }

  wheel(deltaX: number, deltaY: number, t = this.now()): void {
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY * 1.5;
    this.camera.stopGlide();
    this.camera.panBy(delta / this.camera.ppm);
    if (t - this.lastScroll > 200) {
      this.lastScroll = t;
      this.gesture('scroll');
    }
  }

  /** Call once per frame before sim steps: edge-scroll and send the drag target. */
  frame(dt: number): void {
    if (this.mode !== 'hold') {
      // The world moves under a still cursor too.
      if (this.hoverWorld) this.hoverWorld = this.camera.viewToWorld(this.pointer);
      this.updateHover();
      return;
    }
    const panned = this.edgeScroll ? this.camera.edgeScroll(this.pointer.x, this.viewWidthPx, dt, 80, 9) : 0;
    if (panned !== 0 && !this.edging) this.gesture('edge');
    this.edging = panned !== 0;
    const world = this.camera.viewToWorld(this.pointer);
    this.hoverWorld = world;
    this.sim.send({ type: 'drag', x: world.x, y: world.y });
    this.dwellAtDoor(world, dt);
    // Holding a bug still: tickle it.
    const held = this.sim.physics.grabbed;
    if (
      !this.tickling &&
      held !== null &&
      this.sim.entities.get(held)?.kind === 'bug' &&
      this.travelled <= POKE_PX &&
      this.now() - this.pressAt >= TICKLE_MS
    ) {
      this.tickling = true;
      this.sim.send({ type: 'tickle', on: true });
    }
  }

  /** Holding something over an open doorway for a moment carries it through. */
  private dwellAtDoor(world: Point, dt: number): void {
    const door =
      this.onDoor && this.sim.physics.grabbed !== null
        ? this.sim.hidden.doorAt(world.x, world.y, 0.15)
        : null;
    if (!door) {
      this.doorDwell = 0;
      this.doorLatch = null;
      return;
    }
    if (door.id === this.doorLatch) return;
    this.doorDwell += dt;
    if (this.doorDwell < DOOR_DWELL) return;
    this.doorDwell = 0;
    this.doorLatch = door.to;
    this.onDoor?.(door.id, true);
  }

  /** Is the player holding something right now? */
  get holding(): boolean {
    return this.mode === 'hold' && this.sim.physics.grabbed !== null;
  }
}
