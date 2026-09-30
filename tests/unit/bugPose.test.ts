import { describe, expect, it } from 'vitest';
import { bugPose } from '../../src/renderer/src/render/bugPose';
import type { BugPoseInput } from '../../src/renderer/src/render/bugPose';

const base: BugPoseInput = { mode: 'idle', vx: 0, vy: 0, time: 1, squash: 0, phase: 0 };

describe('bugPose', () => {
  it('stretches when flying fast and roughly keeps volume', () => {
    const pose = bugPose({ ...base, mode: 'tumble', vy: 20 });
    expect(pose.sy).toBeGreaterThan(1.1);
    expect(pose.sx).toBeLessThan(1);
    expect(pose.sx * pose.sy).toBeGreaterThan(0.9);
    expect(pose.sx * pose.sy).toBeLessThan(1.15);
  });

  it('squashes on landing', () => {
    const pose = bugPose({ ...base, squash: 1 });
    expect(pose.sy).toBeLessThan(0.7);
    expect(pose.sx).toBeGreaterThan(1.3);
  });

  it('bobs while walking and not while idle', () => {
    const walking = [0.1, 0.2, 0.3].map((time) => bugPose({ ...base, mode: 'walk', time }).bob);
    expect(walking.some((b) => b < -1)).toBe(true);
    expect(bugPose(base).bob).toBe(0);
  });

  it('blinks now and then, but not when dizzy', () => {
    const open = Array.from({ length: 400 }, (_, i) => bugPose({ ...base, time: i / 60 }).eyeOpen);
    expect(open).toContain(1);
    expect(open.some((o) => o < 0.5)).toBe(true);
    const dizzy = bugPose({ ...base, mode: 'dizzy', time: 0.05 });
    expect(dizzy.dizzy).toBe(true);
    expect(dizzy.eyeOpen).toBe(1);
  });

  it('stays finite for any input', () => {
    for (const mode of ['idle', 'walk', 'held', 'tumble', 'dizzy'] as const) {
      const pose = bugPose({ ...base, mode, vx: 1e6, vy: -1e6, squash: 5 });
      for (const v of Object.values(pose)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });
});
