import { describe, expect, it } from 'vitest';
import { FixedStepper, SIM_DT } from '../../src/game/core/loop';

describe('FixedStepper', () => {
  it('runs one step per 1/60 s of elapsed time', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 60; i++) stepper.advance(SIM_DT, () => steps++);
    expect(steps).toBe(60);
  });

  it('is independent of frame rate', () => {
    const count = (frameDt: number, seconds: number): number => {
      const stepper = new FixedStepper();
      let steps = 0;
      const frames = Math.round(seconds / frameDt);
      for (let i = 0; i < frames; i++) stepper.advance(frameDt, () => steps++);
      return steps;
    };
    expect(count(1 / 30, 2)).toBe(120);
    expect(count(1 / 144, 2)).toBeGreaterThanOrEqual(119);
    expect(count(1 / 144, 2)).toBeLessThanOrEqual(120);
    expect(count(1 / 60, 2)).toBe(120);
  });

  it('carries the remainder between frames', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    stepper.advance(SIM_DT * 0.6, () => steps++);
    expect(steps).toBe(0);
    expect(stepper.alpha).toBeCloseTo(0.6);
    stepper.advance(SIM_DT * 0.6, () => steps++);
    expect(steps).toBe(1);
    expect(stepper.alpha).toBeCloseTo(0.2);
  });

  it('clamps long stalls instead of spiralling', () => {
    const stepper = new FixedStepper(SIM_DT, 5);
    let steps = 0;
    stepper.advance(10, () => steps++);
    expect(steps).toBe(5);
    steps = 0;
    stepper.advance(SIM_DT, () => steps++);
    expect(steps).toBe(1);
  });

  it('ignores zero, negative, and NaN time', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    for (const dt of [0, -1, Number.NaN]) stepper.advance(dt, () => steps++);
    expect(steps).toBe(0);
  });
});
