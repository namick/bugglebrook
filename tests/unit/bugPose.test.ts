import { describe, expect, it } from 'vitest';
import { BUG_MODES } from '../../src/game';
import { blinkAmount, bugPose } from '../../src/renderer/src/render/bugPose';
import type { BugPoseInput } from '../../src/renderer/src/render/bugPose';

const base: BugPoseInput = { mode: 'st_idle', vx: 0, vy: 0, time: 1, phase: 0, walkSpeed: 1 };

describe('bugPose', () => {
  it('breathes while idle: 1.0 to 1.03 tall at 0.3 Hz, keeping volume', () => {
    const heights = Array.from({ length: 400 }, (_, i) => bugPose({ ...base, time: i / 60 }).sy);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0.999);
    expect(Math.max(...heights)).toBeLessThanOrEqual(1.031);
    expect(Math.max(...heights)).toBeGreaterThan(1.02);
    const p = bugPose({ ...base, time: 0.8 });
    expect(p.sx * p.sx * p.sy).toBeCloseTo(1, 2);
  });

  it('moves the legs and bobs while walking, faster for faster bugs', () => {
    const walking = [0.1, 0.2, 0.3].map((time) => bugPose({ ...base, mode: 'st_wander', vx: 1, time }));
    expect(walking.some((p) => p.bob < -1)).toBe(true);
    expect(walking[0]!.stride).toBeCloseTo(1);
    const slow = bugPose({ ...base, mode: 'st_wander', vx: 0.5, time: 1, walkSpeed: 0.5 }).legPhase;
    const fast = bugPose({ ...base, mode: 'st_wander', vx: 1.3, time: 1, walkSpeed: 1.3 }).legPhase;
    expect(fast).toBeGreaterThan(slow);
    expect(bugPose(base).bob).toBe(0);
    expect(bugPose(base).stride).toBe(0);
  });

  it('flails when held or flying', () => {
    for (const mode of ['st_held', 'st_airborne', 'st_use'] as const)
      expect(bugPose({ ...base, mode }).flail).toBe(true);
    expect(bugPose(base).flail).toBe(false);
  });

  it('blinks every few seconds, but not when dizzy', () => {
    const open = Array.from({ length: 60 * 20 }, (_, i) => bugPose({ ...base, time: i / 60 }).eyeOpen);
    expect(open).toContain(1);
    const blinks = open.filter((o, i) => o < 0.5 && (open[i - 1] ?? 1) >= 0.5).length;
    expect(blinks).toBeGreaterThanOrEqual(3);
    expect(blinks).toBeLessThanOrEqual(10);
    const dizzy = Array.from({ length: 600 }, (_, i) => bugPose({ ...base, mode: 'st_dizzy', time: i / 60 }));
    expect(dizzy.every((p) => p.dizzy && p.eyeOpen === 1)).toBe(true);
  });

  it('gives different bugs different blink moments', () => {
    const a = Array.from({ length: 600 }, (_, i) => blinkAmount(i / 60, 1.37));
    const b = Array.from({ length: 600 }, (_, i) => blinkAmount(i / 60, 2.74));
    expect(a).not.toEqual(b);
  });

  it('stays finite for any input', () => {
    for (const mode of BUG_MODES) {
      const pose = bugPose({ ...base, mode, vx: 1e6, vy: -1e6, time: 1e5 });
      for (const v of Object.values(pose)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });
});
