/** Simulation rate. Every sim step advances exactly this much time. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Accumulator that turns variable frame times into a whole number of fixed
 * sim steps. Frame spikes are clamped so a long stall (debugger, window drag)
 * does not trigger a burst of catch-up steps.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly dt: number = SIM_DT,
    readonly maxStepsPerFrame: number = 5,
  ) {}

  /**
   * Add elapsed real time (seconds) and run `step` as many times as it fits.
   * Returns the number of steps taken.
   */
  advance(elapsedSeconds: number, step: () => void): number {
    if (!(elapsedSeconds > 0)) return 0;
    this.accumulator += Math.min(elapsedSeconds, this.dt * this.maxStepsPerFrame);
    let steps = 0;
    // Small epsilon guards against float drift leaving a step unrun.
    while (this.accumulator + 1e-9 >= this.dt && steps < this.maxStepsPerFrame) {
      step();
      this.accumulator -= this.dt;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }

  /** Fraction of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
