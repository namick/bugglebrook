/**
 * Press-and-hold for buttons that leave the place the player is in (the
 * home stump). A ring fills while the button is held and it acts when the
 * ring closes, so a stray click in the corner, or a fling let go over it,
 * never yanks the camera away. Let go early and the ring drains and the
 * button gives a little "not yet" shake. Pure.
 */
export const HOLD = {
  /** Seconds of holding before it acts. */
  seconds: 0.45,
  /** How fast an unfinished ring drains, in rings per second. */
  drain: 3,
} as const;

export class HoldArm {
  /** 0 to 1: how full the ring is. */
  progress = 0;
  pressed = false;
  /** Seconds left of the "not yet" shake. */
  shake = 0;
  /** It acted during this press (it waits for a fresh press to act again). */
  private fired = false;

  constructor(readonly seconds: number = HOLD.seconds) {}

  press(): void {
    this.pressed = true;
    this.fired = false;
  }

  /** The press ended, on the button or off it. */
  release(): void {
    if (this.pressed && !this.fired && this.progress > 0) this.shake = 0.35;
    this.pressed = false;
  }

  /** Advance. True on the frame the ring closes: act then. */
  update(dt: number): boolean {
    this.shake = Math.max(0, this.shake - dt);
    if (this.pressed && !this.fired) {
      this.progress = Math.min(1, this.progress + dt / this.seconds);
      if (this.progress >= 1) {
        this.fired = true;
        return true;
      }
      return false;
    }
    this.progress = Math.max(0, this.progress - dt * HOLD.drain);
    return false;
  }
}
