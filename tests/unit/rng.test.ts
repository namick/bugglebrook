import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../../src/game/core/rng';

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(new Rng('garden'), 100)).toEqual(draw(new Rng('garden'), 100));
    expect(draw(new Rng(42), 100)).toEqual(draw(new Rng(42), 100));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(new Rng('a'), 10)).not.toEqual(draw(new Rng('b'), 10));
    expect(draw(new Rng(1), 10)).not.toEqual(draw(new Rng(2), 10));
    expect(hashSeed(1)).not.toBe(hashSeed('1'));
  });

  it('resumes exactly from a saved state', () => {
    const a = new Rng('resume');
    draw(a, 37);
    const b = Rng.fromState(a.getState());
    expect(draw(b, 50)).toEqual(draw(a, 50));
  });

  it('keeps values in range and covers the range', () => {
    const rng = new Rng(7);
    const ints = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      ints.add(rng.int(1, 6));
    }
    expect([...ints].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is roughly uniform', () => {
    const rng = new Rng('uniform');
    const buckets = new Array<number>(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]!++;
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan((n / 10) * 0.1);
  });

  it('picks from arrays and rejects empty ones', () => {
    const rng = new Rng(3);
    expect(['x', 'y', 'z']).toContain(rng.pick(['x', 'y', 'z']));
    expect(() => rng.pick([])).toThrow();
  });
});
