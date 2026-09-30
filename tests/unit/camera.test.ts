import { describe, expect, it } from 'vitest';
import { Camera } from '../../src/renderer/src/render/camera';
import { fitViewport } from '../../src/renderer/src/render/viewport';

describe('Camera', () => {
  it('clamps to the world', () => {
    const cam = new Camera(48, 19.2);
    cam.set(-5);
    expect(cam.x).toBe(0);
    cam.set(100);
    expect(cam.x).toBeCloseTo(28.8);
    cam.set(Number.NaN);
    expect(cam.x).toBe(0);
  });

  it('never scrolls a world narrower than the view', () => {
    const cam = new Camera(10, 19.2);
    cam.panBy(5);
    expect(cam.x).toBe(0);
  });

  it('converts between world meters and view pixels both ways', () => {
    const cam = new Camera(48, 19.2, 100);
    cam.set(10);
    expect(cam.worldToView({ x: 12, y: 3 })).toEqual({ x: 200, y: 300 });
    const back = cam.viewToWorld(cam.worldToView({ x: 17.3, y: 4.2 }));
    expect(back.x).toBeCloseTo(17.3);
    expect(back.y).toBeCloseTo(4.2);
  });

  it('centers on a point', () => {
    const cam = new Camera(48, 19.2);
    cam.centerOn(24);
    expect(cam.centerX).toBeCloseTo(24);
  });

  it('coasts to a stop after a pan fling', () => {
    const cam = new Camera(48, 19.2);
    cam.velocity = 10;
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.x).toBeGreaterThan(1);
    expect(cam.velocity).toBe(0);
  });

  it('edge-scrolls only near the edges', () => {
    const cam = new Camera(48, 19.2);
    cam.set(10);
    expect(cam.edgeScroll(960, 1920, 0.1)).toBe(0);
    expect(cam.edgeScroll(1910, 1920, 0.1)).toBeGreaterThan(0);
    expect(cam.edgeScroll(5, 1920, 0.1)).toBeLessThan(0);
  });
});

describe('fitViewport', () => {
  it('letterboxes a wide window', () => {
    const fit = fitViewport(3000, 1080, 1920, 1080);
    expect(fit.scale).toBe(1);
    expect(fit.width).toBe(1920);
    expect(fit.left).toBe(540);
    expect(fit.top).toBe(0);
  });

  it('pillarboxes a tall window and keeps 16:9', () => {
    const fit = fitViewport(960, 1000, 1920, 1080);
    expect(fit.scale).toBe(0.5);
    expect(fit.width / fit.height).toBeCloseTo(16 / 9, 2);
    expect(fit.top).toBe(230);
  });
});
