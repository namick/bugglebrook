import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/game';
import { Camera } from '../../src/renderer/src/render/camera';
import { WUBBO, constellation, skyLayout, telescopeSky } from '../../src/renderer/src/render/constellations';
import {
  IRIS_HALF,
  IRIS_SECONDS,
  irisAt,
  irisPolygon,
  irisRadius,
  irisShape,
} from '../../src/renderer/src/render/iris';
import { roomLook, skyLook } from '../../src/renderer/src/render/skyLook';

// M10's hidden areas, the renderer's pure parts: the iris wipe, the
// telescope's constellations, the rooms' light, and the camera's regions.

describe('the iris wipe', () => {
  it('closes on the doorway, crosses over at 300 ms, and opens on the far side by 600 ms', () => {
    expect(IRIS_SECONDS).toBeCloseTo(0.6);
    expect(irisAt(0)).toEqual({ open: 1, arrived: false, done: false });
    expect(irisAt(IRIS_HALF - 0.001).open).toBeLessThan(0.01);
    expect(irisAt(IRIS_HALF - 0.001).arrived).toBe(false);
    expect(irisAt(IRIS_HALF + 0.001).arrived).toBe(true);
    expect(irisAt(IRIS_HALF + 0.001).open).toBeLessThan(0.02);
    expect(irisAt(IRIS_SECONDS).done).toBe(true);
    let last = 2;
    for (let t = 0; t < IRIS_HALF; t += 0.02) {
      const o = irisAt(t).open;
      expect(o).toBeLessThanOrEqual(last);
      last = o;
    }
  });

  it('opens wide enough to clear every corner of the screen', () => {
    for (const [x, y] of [
      [0, 0],
      [960, 540],
      [1900, 1000],
    ] as const) {
      const r = irisRadius(1, x, y, 1920, 1080);
      expect(r).toBeGreaterThan(Math.hypot(Math.max(x, 1920 - x), Math.max(y, 1080 - y)));
      expect(irisRadius(0, x, y, 1920, 1080)).toBe(0);
    }
  });

  it('is shaped like the doorway: an arch for the ant hill, a cone for the hat, round otherwise', () => {
    expect(irisShape('ant_hill')).toBe('arch');
    expect(irisShape('gnome_door')).toBe('cone');
    expect(irisShape('depths_door')).toBe('circle');
    expect(irisShape('hollow_door')).toBe('circle');
    for (const shape of ['arch', 'circle', 'cone'] as const) {
      const p = irisPolygon(shape, 100, 200, 50);
      expect(p.length % 2).toBe(0);
      expect(p.length).toBeGreaterThan(20);
      for (const v of p) expect(Number.isFinite(v)).toBe(true);
      // Around its middle, within about its radius.
      for (let i = 0; i < p.length; i += 2) expect(Math.hypot(p[i]! - 100, p[i + 1]! - 200)).toBeLessThan(60);
    }
  });
});

describe('the telescope', () => {
  it('has a constellation for every bug art, and for Wubbo', () => {
    const arts = [...new Set(CONTENT.bugs.all.map((b) => b.art)), 'tardigrade'];
    for (const art of arts) {
      const c = constellation(art);
      expect(c.stars.length, art).toBeGreaterThanOrEqual(5);
      for (const [a, b] of c.lines) {
        expect(c.stars[a], art).toBeDefined();
        expect(c.stars[b], art).toBeDefined();
      }
      for (const [x, y] of c.stars) {
        expect(Math.abs(x), art).toBeLessThanOrEqual(1.05);
        expect(Math.abs(y), art).toBeLessThanOrEqual(1.05);
      }
    }
    // Wubbo's is chubby with eight legs: different from everyone's.
    expect(constellation('tardigrade')).not.toEqual(constellation('ladybug'));
  });

  it('lights the bugs found and keeps the rest dark, with Wubbo dark until he is found', () => {
    const cast = CONTENT.bugs.all.map((b, i) => ({ id: b.id, art: b.art, found: i < 3 }));
    const sky = telescopeSky(cast, false);
    expect(sky).toHaveLength(cast.length + 1);
    expect(sky.filter((e) => e.lit).map((e) => e.id)).toEqual(cast.slice(0, 3).map((b) => b.id));
    expect(sky.find((e) => e.id === WUBBO)?.lit).toBe(false);
    expect(telescopeSky(cast, true).find((e) => e.id === WUBBO)?.lit).toBe(true);
    // A Wubbo in the cast is not drawn twice.
    expect(telescopeSky([...cast, { id: WUBBO, art: 'tardigrade', found: true }], true)).toHaveLength(
      cast.length + 1,
    );
  });

  it('spreads the constellations across the eyepiece without overlap', () => {
    for (const n of [6, 13, 17]) {
      const spots = skyLayout(n);
      expect(spots).toHaveLength(n);
      for (const s of spots) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(1);
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(0.1);
    }
  });
});

describe('the rooms’ light', () => {
  it('is the same at noon and midnight, and counts as dark so lamps shine', () => {
    for (const mood of ['depths', 'hollow'] as const) {
      const noon = roomLook(skyLook(12), mood);
      const night = roomLook(skyLook(0), mood);
      expect(noon.near).toBe(night.near);
      expect(noon.glow).toBeGreaterThan(0.5);
      expect(noon.stars).toBe(0);
    }
    expect(roomLook(skyLook(12), 'depths').near).not.toBe(roomLook(skyLook(12), 'hollow').near);
  });
});

describe('the camera in a hidden area', () => {
  it('stays inside the outer region: no peeking into the next area', () => {
    const cam = new Camera(240, 19.2);
    cam.setLimits(195.8, 220.8, { x0: 195.8, x1: 220.8 });
    cam.set(150);
    expect(cam.x).toBeCloseTo(195.8);
    cam.set(230);
    expect(cam.x).toBeCloseTo(220.8 - 19.2);
    cam.holding = true;
    cam.panBy(-10);
    expect(cam.x).toBeGreaterThanOrEqual(195.8);
    // On the surface the strip ends at the treehouse: the view stops there.
    cam.setLimits(0, 195.2, { x0: 0, x1: 195.2 });
    cam.set(200);
    expect(cam.x).toBeCloseTo(195.2 - 19.2);
  });
});
