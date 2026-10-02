import { describe, expect, it } from 'vitest';
import {
  CRITTER_KINDS,
  along,
  antAt,
  birdBeat,
  blink,
  calm,
  chirp,
  critterSky,
  cruise,
  dodge,
  drift,
  flit,
  orbit,
  outOf,
  pathLength,
  perchFor,
  presence,
  row,
  skate,
  wormRise,
} from '../../src/renderer/src/render/critters';

const DAY = critterSky(12, 0);
const NIGHT = critterSky(23, 0);
const RAIN = critterSky(12, 1);

describe('critter sky and presence', () => {
  it('is day at noon and night at midnight, with a dusk in between', () => {
    expect(DAY).toEqual({ day: 1, night: 0, rain: 0 });
    expect(NIGHT.day).toBe(0);
    expect(NIGHT.night).toBe(1);
    const dusk = critterSky(19.2, 0);
    expect(dusk.day).toBeGreaterThan(0);
    expect(dusk.day).toBeLessThan(1);
    expect(critterSky(3, 0).night).toBe(1);
    expect(critterSky(6.5, 0).day).toBeCloseTo(0.5);
  });

  it('puts day critters out by day and night critters out by night', () => {
    for (const k of ['butterfly', 'bee', 'ant', 'bird'] as const) {
      expect(presence(k, DAY)).toBe(1);
      expect(presence(k, NIGHT)).toBe(0);
    }
    for (const k of ['moth', 'firefly', 'cricket'] as const) {
      expect(presence(k, NIGHT)).toBe(1);
      expect(presence(k, DAY)).toBe(0);
    }
  });

  it('sends flyers and ants home in the rain but leaves the pond alone', () => {
    expect(presence('butterfly', RAIN)).toBe(0);
    expect(presence('ant', RAIN)).toBe(0);
    expect(presence('boatman', RAIN)).toBe(1);
    expect(presence('fish', NIGHT)).toBe(1);
    expect(presence('worm', RAIN)).toBe(1);
  });

  it('leaves every area something alive at every hour', () => {
    // Water and worms are out at all hours; something flies by day and by night.
    for (let h = 0; h < 24; h += 0.5) {
      const sky = critterSky(h, 0);
      const out = CRITTER_KINDS.filter((k) => presence(k, sky) > 0.5);
      expect(out.length).toBeGreaterThan(3);
    }
  });

  it('rounds how many are out', () => {
    expect(outOf(6, 1)).toBe(6);
    expect(outOf(6, 0)).toBe(0);
    expect(outOf(6, 0.5)).toBe(3);
    expect(outOf(6, 2)).toBe(6);
  });
});

describe('critter motion', () => {
  const perches = [
    { x: 0, y: 500 },
    { x: 400, y: 450 },
    { x: 900, y: 520 },
  ];
  const opts = { fly: 3, rest: 3, loop: 30, beat: 3 };

  it('never picks the same perch twice in a row', () => {
    for (let leg = 0; leg < 200; leg++) expect(perchFor(4.2, leg, 3)).not.toBe(perchFor(4.2, leg + 1, 3));
    expect(perchFor(1, 5, 1)).toBe(0);
  });

  it('flits between perches, resting on them, and is the same at the same time', () => {
    let rested = 0;
    let flew = 0;
    for (let t = 0; t < 60; t += 0.1) {
      const p = flit(2, t, perches, opts);
      expect(flit(2, t, perches, opts)).toEqual(p);
      if (p.resting) {
        rested++;
        expect(perches.some((q) => q.x === p.x && q.y === p.y)).toBe(true);
      } else flew++;
      expect(p.flap).toBeGreaterThanOrEqual(0);
      expect(p.flap).toBeLessThanOrEqual(1);
    }
    expect(rested).toBeGreaterThan(100);
    expect(flew).toBeGreaterThan(100);
  });

  it('flies without jumps', () => {
    let last = flit(3, 0, perches, opts);
    for (let t = 1 / 60; t < 40; t += 1 / 60) {
      const p = flit(3, t, perches, opts);
      expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThan(20);
      last = p;
    }
  });

  it('keeps moths near their light and fireflies near home', () => {
    for (let t = 0; t < 30; t += 0.25) {
      const m = orbit(1, t, 100, 100, 60);
      expect(Math.hypot(m.x - 100, m.y - 100)).toBeLessThan(70);
      const f = drift(2, t, { x: 0, y: 0 }, 100);
      expect(Math.abs(f.x)).toBeLessThan(115);
      expect(Math.abs(f.y)).toBeLessThan(50);
    }
  });

  it('blinks fireflies and chirps crickets in bursts', () => {
    const glows = Array.from({ length: 600 }, (_, i) => blink(3, i / 60));
    expect(Math.max(...glows)).toBeGreaterThan(0.9);
    expect(glows.filter((g) => g < 0.1).length).toBeGreaterThan(300);
    const song = Array.from({ length: 600 }, (_, i) => chirp(3, i / 60));
    expect(song.filter((s) => s > 0.5).length).toBeGreaterThan(20);
    expect(song.filter((s) => s === 0).length).toBeGreaterThan(200);
  });

  it('pokes a worm out now and then, and it looks around', () => {
    const ups = Array.from({ length: 60 * 60 }, (_, i) => wormRise(1, i / 60, 30));
    expect(ups.filter((w) => w.up > 0.99).length).toBeGreaterThan(60);
    expect(ups.filter((w) => w.up === 0).length).toBeGreaterThan(60 * 40);
    expect(ups.some((w) => Math.abs(w.look) > 0.5)).toBe(true);
  });

  it('keeps pond critters inside their stretch of water', () => {
    for (let t = 0; t < 120; t += 0.5) {
      const b = row(1, t, 100, 500);
      expect(b.x).toBeGreaterThanOrEqual(100);
      expect(b.x).toBeLessThanOrEqual(500);
      expect(b.depth).toBeGreaterThan(0);
      expect(b.depth).toBeLessThan(1);
      const s = skate(2, t, 100, 300);
      expect(s.x).toBeGreaterThanOrEqual(100);
      expect(s.x).toBeLessThanOrEqual(300);
      const fish = cruise(3, t, 0, 1000);
      expect(fish.x).toBeGreaterThanOrEqual(0);
      expect(fish.x).toBeLessThanOrEqual(1000);
    }
    // They do go somewhere.
    expect(Math.abs(row(1, 30, 100, 500).x - row(1, 0, 100, 500).x)).toBeGreaterThan(5);
  });

  it('keeps a bird on its branch, now and then hopping', () => {
    const beats = Array.from({ length: 400 }, (_, i) => birdBeat(5, i * 0.4));
    expect(beats.some((b) => b.hop > 0)).toBe(true);
    expect(beats.some((b) => b.peck > 0.5)).toBe(true);
    expect(beats.some((b) => Math.abs(b.tilt) > 0.1)).toBe(true);
    for (const b of beats) expect([0, 1]).toContain(b.spot);
  });
});

describe('the ant line', () => {
  const path = [0, 0, 100, 0, 100, 50];

  it('measures and walks a path', () => {
    expect(pathLength(path)).toBe(150);
    expect(along(path, 0)).toMatchObject({ x: 0, y: 0 });
    expect(along(path, 50)).toMatchObject({ x: 50, y: 0 });
    expect(along(path, 125)).toMatchObject({ x: 100, y: 25 });
    expect(along(path, 999)).toMatchObject({ x: 100, y: 50 });
  });

  it('marches out empty and comes home carrying, evenly spaced', () => {
    const n = 8;
    const ants = Array.from({ length: n }, (_, i) => antAt(i, n, 3, 150, 30));
    expect(ants.filter((a) => a.home).length).toBe(n / 2);
    for (const a of ants) {
      expect(a.s).toBeGreaterThanOrEqual(0);
      expect(a.s).toBeLessThanOrEqual(150);
    }
    // One ant goes out, turns at the end, and comes back.
    const trip = Array.from({ length: 11 }, (_, i) => antAt(0, n, i, 150, 30));
    expect(trip[0]!.home).toBe(false);
    expect(trip[6]!.home).toBe(true);
    expect(trip[10]!.s).toBeCloseTo(0);
  });
});

describe('dodging', () => {
  it('scatters from the hand and re-forms once it is gone', () => {
    const s = calm();
    const at = { x: 100, y: 100 };
    let startled = false;
    for (let i = 0; i < 30; i++)
      startled = dodge(s, at, [{ x: 95, y: 100 }], 80, 200, 1 / 60, true) || startled;
    expect(startled).toBe(true);
    expect(s.dx).toBeGreaterThan(5);
    expect(s.dy).toBe(0);
    expect(s.since).toBeLessThan(0.5);
    for (let i = 0; i < 60 * 8; i++) dodge(s, at, [], 80, 200, 1 / 60, true);
    expect(s.dx).toBe(0);
    expect(s.since).toBeGreaterThan(5);
  });

  it('ignores things outside its radius and picks a side when the hand is dead on', () => {
    const s = calm();
    expect(dodge(s, { x: 0, y: 0 }, [{ x: 200, y: 0 }], 80, 200, 1 / 60)).toBe(false);
    expect(s.dx).toBe(0);
    const t = calm();
    for (let i = 0; i < 10; i++) dodge(t, { x: 10, y: 10 }, [{ x: 10, y: 10 }], 80, 200, 1 / 60);
    expect(Math.abs(t.dx) + Math.abs(t.dy)).toBeGreaterThan(1);
  });
});
