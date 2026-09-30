import type { Sim } from '../../../game/sim';
import type { Camera, Point } from '../render/camera';

export type PointerMode = 'none' | 'hold' | 'pan';

/**
 * Turns pointer gestures into sim commands and camera moves.
 * Press on a thing: grab it; move: drag; release: drop or fling.
 * Press on empty space: pan the camera, and coast on release.
 * All positions come in as logical view pixels (1920x1080 space).
 */
export class PointerController {
  mode: PointerMode = 'none';
  private pointer: Point = { x: 0, y: 0 };
  private panLastX = 0;
  private panVelocity = 0;

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly viewWidthPx: number,
  ) {}

  down(view: Point): void {
    this.pointer = view;
    const world = this.camera.viewToWorld(view);
    const hit = this.sim.physics.bodyAt(world.x, world.y, 0.15);
    if (hit !== null) {
      this.mode = 'hold';
      this.camera.velocity = 0;
      this.sim.send({ type: 'grab', x: world.x, y: world.y });
    } else {
      this.mode = 'pan';
      this.panLastX = view.x;
      this.panVelocity = 0;
      this.camera.velocity = 0;
    }
  }

  move(view: Point, dt = 1 / 60): void {
    this.pointer = view;
    if (this.mode === 'pan') {
      const dxMeters = (view.x - this.panLastX) / this.camera.ppm;
      this.camera.panBy(-dxMeters);
      if (dt > 0) this.panVelocity = -dxMeters / dt;
      this.panLastX = view.x;
    }
  }

  up(): void {
    if (this.mode === 'hold') this.sim.send({ type: 'release' });
    if (this.mode === 'pan') this.camera.velocity = Math.max(-40, Math.min(40, this.panVelocity));
    this.mode = 'none';
  }

  wheel(deltaX: number, deltaY: number): void {
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    this.camera.panBy(delta / this.camera.ppm);
  }

  /** Call once per frame before sim steps: edge-scroll and send the drag target. */
  frame(dt: number): void {
    if (this.mode !== 'hold') return;
    this.camera.edgeScroll(this.pointer.x, this.viewWidthPx, dt);
    const world = this.camera.viewToWorld(this.pointer);
    this.sim.send({ type: 'drag', x: world.x, y: world.y });
  }
}
