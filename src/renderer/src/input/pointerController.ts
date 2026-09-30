import type { Sim } from '../../../game/sim';
import type { Camera, Point } from '../render/camera';

export type PointerMode = 'none' | 'hold' | 'pan';

/** Fling velocity is the cursor's average over this window (game design doc, section 2). */
export const FLING_WINDOW_MS = 80;
/** A press and release this quick and this still is a poke. */
export const POKE_MS = 200;
export const POKE_PX = 6;

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
  private pointer: Point = { x: 0, y: 0 };
  private samples: Sample[] = [];
  private pressAt = 0;
  private pressView: Point = { x: 0, y: 0 };
  private pressWorld: Point = { x: 0, y: 0 };
  private travelled = 0;
  private panLastX = 0;
  private panVelocity = 0;

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly viewWidthPx: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  private sample(): void {
    const w = this.camera.viewToWorld(this.pointer);
    const t = this.now();
    this.samples.push({ t, x: w.x, y: w.y });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 250) this.samples.shift();
  }

  down(view: Point): void {
    this.pointer = view;
    const world = this.camera.viewToWorld(view);
    this.hoverWorld = world;
    this.pressAt = this.now();
    this.pressView = view;
    this.pressWorld = world;
    this.travelled = 0;
    this.samples = [];
    this.sample();
    const hit = this.sim.physics.bodyAt(world.x, world.y, 0.2);
    this.camera.velocity = 0;
    if (hit !== null) {
      this.mode = 'hold';
      this.sim.send({ type: 'grab', x: world.x, y: world.y });
    } else {
      this.mode = 'pan';
      this.panLastX = view.x;
      this.panVelocity = 0;
    }
  }

  move(view: Point, dt = 1 / 60): void {
    this.pointer = view;
    this.hoverWorld = this.camera.viewToWorld(view);
    this.travelled = Math.max(
      this.travelled,
      Math.hypot(view.x - this.pressView.x, view.y - this.pressView.y),
    );
    if (this.mode === 'hold') this.sample();
    if (this.mode === 'pan') {
      const dxMeters = (view.x - this.panLastX) / this.camera.ppm;
      this.camera.panBy(-dxMeters);
      if (dt > 0) this.panVelocity = -dxMeters / dt;
      this.panLastX = view.x;
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

  up(): void {
    if (this.mode === 'hold') {
      const quick = this.now() - this.pressAt <= POKE_MS && this.travelled <= POKE_PX;
      if (quick) {
        this.sim.send({ type: 'poke', x: this.pressWorld.x, y: this.pressWorld.y });
        this.lastRelease = null;
      } else {
        this.sample();
        const v = this.velocity();
        this.lastRelease = v;
        this.sim.send({ type: 'release', vx: v.x, vy: v.y });
      }
    }
    if (this.mode === 'pan') this.camera.velocity = Math.max(-40, Math.min(40, this.panVelocity));
    this.mode = 'none';
  }

  wheel(deltaX: number, deltaY: number): void {
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY * 1.5;
    this.camera.panBy(delta / this.camera.ppm);
  }

  /** Call once per frame before sim steps: edge-scroll and send the drag target. */
  frame(dt: number): void {
    if (this.mode !== 'hold') return;
    this.camera.edgeScroll(this.pointer.x, this.viewWidthPx, dt, 80, 9);
    const world = this.camera.viewToWorld(this.pointer);
    this.hoverWorld = world;
    this.sample();
    this.sim.send({ type: 'drag', x: world.x, y: world.y });
  }
}
