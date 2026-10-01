import { describe, expect, it } from 'vitest';
import { BENCH_SHAKE } from '../../src/game/systems/bench';
import { CRAFT_POP, HIT_STOP, benchPose, trayGlow } from '../../src/renderer/src/render/areaArt/benchLive';
import { easeScale } from '../../src/renderer/src/render/potionLooks';

// R09 and R10: how the Tinker Bench works up to the pop, and how its trays answer a held thing.

describe('the bench at work (R09)', () => {
  const poses = Array.from({ length: BENCH_SHAKE }, (_, t) => benchPose(BENCH_SHAKE - t, false));

  it('crouches, rattles harder and harder, then holds still and squashed just before the pop', () => {
    expect(poses[2]!.phase).toBe('crouch');
    expect(poses[2]!.sy).toBeLessThan(1);
    expect(poses[30]!.phase).toBe('rattle');
    const rattle = poses.filter((p) => p.phase === 'rattle');
    const early = Math.max(...rattle.slice(0, 15).map((p) => Math.abs(p.dx)));
    const late = Math.max(...rattle.slice(-15).map((p) => Math.abs(p.dx)));
    expect(late).toBeGreaterThan(early * 1.5);
    // A big enough shake to see: well over the old 5 px.
    expect(late).toBeGreaterThan(10);
    const hold = poses.slice(-HIT_STOP);
    for (const p of hold) {
      expect(p.phase).toBe('hold');
      expect(p.dx).toBe(0);
      expect(p.sy).toBeLessThan(0.95);
    }
    expect(benchPose(0, false).phase).toBe('idle');
  });

  it('shakes harder with a strong helper', () => {
    const at = BENCH_SHAKE - 40;
    expect(Math.abs(benchPose(at, true).dx)).toBeGreaterThan(Math.abs(benchPose(at, false).dx));
  });

  it('pops the new thing out small, overshoots, and settles at full size', () => {
    let s: { value: number; v: number } = { value: CRAFT_POP.from, v: CRAFT_POP.speed };
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      s = easeScale(s, 1, 1 / 60);
      peak = Math.max(peak, s.value);
    }
    expect(peak).toBeGreaterThan(1.08);
    expect(s.value).toBeCloseTo(1, 1);
    expect(CRAFT_POP.sy).toBeGreaterThan(1);
    expect(CRAFT_POP.sx).toBeLessThan(1);
  });
});

describe('tray glow (R10)', () => {
  it('warms as a held thing comes near and is brightest over the tray it would go in', () => {
    expect(trayGlow(5, false)).toBe(0);
    expect(trayGlow(3.5, false)).toBe(0);
    expect(trayGlow(2, false)).toBeGreaterThan(trayGlow(3, false));
    expect(trayGlow(0.3, false)).toBeLessThan(1);
    expect(trayGlow(0.3, true)).toBe(1);
  });
});
