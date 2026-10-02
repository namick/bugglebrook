import { describe, expect, it } from 'vitest';
import {
  HOVER_LIFT,
  SquashSpring,
  approach,
  hoverLift,
  rimPulse,
  stretchFor,
} from '../../src/renderer/src/render/juice';

describe('SquashSpring', () => {
  it('snaps to 1.15 x 0.87 on grab, then springs back within about 300 ms', () => {
    const s = new SquashSpring();
    s.grab();
    expect(s.sx).toBe(1.15);
    expect(s.sy).toBe(0.87);
    for (let i = 0; i < 20; i++) s.update(1 / 60);
    expect(Math.abs(s.sx - 1)).toBeLessThan(0.03);
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    expect(s.settled).toBe(true);
  });

  it('overshoots a little on the way back, for a wobble', () => {
    const s = new SquashSpring();
    s.grab();
    let min = Infinity;
    for (let i = 0; i < 40; i++) {
      s.update(1 / 60);
      min = Math.min(min, s.sx);
    }
    expect(min).toBeLessThan(1);
  });

  it('squashes harder for harder landings, capped at 0.6 tall', () => {
    const soft = new SquashSpring();
    soft.land(5);
    const hard = new SquashSpring();
    hard.land(100);
    expect(hard.sy).toBeLessThan(soft.sy);
    expect(hard.sy).toBeCloseTo(0.6);
    expect(hard.sx * hard.sy).toBeCloseTo(1);
  });

  it('survives huge frame times', () => {
    const s = new SquashSpring();
    s.land(20);
    s.update(5);
    expect(Number.isFinite(s.sx)).toBe(true);
  });
});

describe('stretch and approach', () => {
  it('stretches along motion: 1 + speed / 25, capped', () => {
    expect(stretchFor(0)).toBe(1);
    expect(stretchFor(5)).toBeCloseTo(1.2);
    expect(stretchFor(100)).toBeCloseTo(1.3);
    expect(stretchFor(100, 1.4)).toBeCloseTo(1.4);
    expect(stretchFor(5, 1.3, 0.5)).toBeCloseTo(1.1);
  });

  it('approaches a target smoothly and independent of frame rate', () => {
    const a = approach(approach(0, 1, 10, 1 / 60), 1, 10, 1 / 60);
    const b = approach(0, 1, 10, 2 / 60);
    expect(a).toBeCloseTo(b);
  });
});

describe('the hover rim and lift', () => {
  it('pulses between 60 and 100 percent at 2 Hz', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 1; t += 0.01) {
      lo = Math.min(lo, rimPulse(t));
      hi = Math.max(hi, rimPulse(t));
    }
    expect(lo).toBeCloseTo(0.6, 2);
    expect(hi).toBeCloseTo(1, 2);
    expect(rimPulse(0.5)).toBeCloseTo(rimPulse(0));
    expect(rimPulse(0.25)).toBeCloseTo(rimPulse(0));
  });

  it('lifts a hovered thing quickly, and lets it settle back', () => {
    let lift = 0;
    for (let i = 0; i < 12; i++) lift = hoverLift(lift, true, 1 / 60);
    expect(lift).toBeGreaterThan(HOVER_LIFT * 0.95);
    expect(lift).toBeLessThanOrEqual(HOVER_LIFT);
    for (let i = 0; i < 30; i++) lift = hoverLift(lift, false, 1 / 60);
    expect(lift).toBeLessThan(HOVER_LIFT * 0.01);
  });
});
