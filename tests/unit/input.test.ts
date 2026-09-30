import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { PointerController, averageVelocity } from '../../src/renderer/src/input/pointerController';
import { Camera } from '../../src/renderer/src/render/camera';

const setup = (): { sim: Sim; camera: Camera; input: PointerController; clock: { t: number } } => {
  const sim = Sim.empty();
  const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
  const clock = { t: 1000 };
  return { sim, camera, clock, input: new PointerController(sim, camera, VIEW_WIDTH_PX, () => clock.t) };
};

describe('averageVelocity', () => {
  it('averages over exactly the last 80 ms, interpolating between samples', () => {
    // Slow for a while, then 10 units per second for the last 100 ms.
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 0.1, y: 0 },
      { t: 150, x: 0.6, y: 0 },
      { t: 200, x: 1.1, y: -0.5 },
    ];
    const v = averageVelocity(samples);
    expect(v.x).toBeCloseTo(10);
    expect(v.y).toBeCloseTo(-0.5 / 0.08);
  });

  it('is zero with no history or when the pointer stopped', () => {
    expect(averageVelocity([])).toEqual({ x: 0, y: 0 });
    const still = [
      { t: 0, x: 0, y: 0 },
      { t: 50, x: 1, y: 0 },
      { t: 140, x: 1, y: 0 },
      { t: 150, x: 1, y: 0 },
    ];
    expect(averageVelocity(still).x).toBeCloseTo(0);
  });
});

describe('PointerController', () => {
  it('grabs a thing under the pointer, drags it, and flings it with the cursor velocity', () => {
    const { sim, camera, input, clock } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    sim.run(10);
    const dropped: GameEvents['item_dropped'][] = [];
    sim.events.on('item_dropped', (e) => dropped.push(e));
    const at = camera.worldToView(sim.view(pebble.id)!);
    input.down(at);
    expect(input.mode).toBe('hold');
    // 12 px per 16 ms to the right and 6 px up: 7.5 m/s and -3.75 m/s.
    for (let i = 1; i <= 30; i++) {
      clock.t += 16;
      input.move({ x: at.x + i * 12, y: at.y - i * 6 });
      input.frame(1 / 60);
      sim.step();
    }
    expect(sim.view(pebble.id)!.held).toBe(true);
    input.up();
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(false);
    expect(input.mode).toBe('none');
    expect(input.lastRelease!.x).toBeCloseTo(7.5, 1);
    expect(input.lastRelease!.y).toBeCloseTo(-3.75, 1);
    expect(dropped[0]!.flung).toBe(true);
    expect(dropped[0]!.vx).toBeCloseTo(input.lastRelease!.x);
  });

  it('turns a quick, still click into a poke', () => {
    const { sim, camera, input, clock } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    sim.run(10);
    const poked: number[] = [];
    sim.events.on('item_poked', (e) => poked.push(e.id));
    const at = camera.worldToView(sim.view(pebble.id)!);
    input.down(at);
    sim.step();
    clock.t += 120;
    input.move({ x: at.x + 3, y: at.y });
    input.up();
    sim.step();
    expect(poked).toEqual([pebble.id]);
    expect(input.lastRelease).toBeNull();
    expect(sim.physics.grabbed).toBeNull();
  });

  it('does not poke after a long press', () => {
    const { sim, camera, input, clock } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    sim.run(10);
    const poked: number[] = [];
    sim.events.on('item_poked', (e) => poked.push(e.id));
    input.down(camera.worldToView(sim.view(pebble.id)!));
    clock.t += 400;
    input.up();
    sim.step();
    expect(poked).toEqual([]);
  });

  it('pans the camera when dragging empty space, then coasts', () => {
    const { camera, input } = setup();
    input.down({ x: 1500, y: 200 });
    expect(input.mode).toBe('pan');
    input.move({ x: 1300, y: 200 }, 1 / 60);
    expect(camera.x).toBeCloseTo(2);
    input.up();
    expect(camera.velocity).toBeGreaterThan(0);
  });

  it('pans with the wheel: vertical wheel moves 1.5 px per wheel pixel', () => {
    const { camera, input } = setup();
    input.wheel(0, 200);
    expect(camera.x).toBeCloseTo(3);
    input.wheel(-100, 10);
    expect(camera.x).toBeCloseTo(2);
  });

  it('tracks the cursor for eyes, and forgets it when it leaves', () => {
    const { camera, input } = setup();
    input.move({ x: 500, y: 400 });
    expect(input.hoverWorld).toEqual(camera.viewToWorld({ x: 500, y: 400 }));
    input.leave();
    expect(input.hoverWorld).toBeNull();
  });

  it('edge-scrolls while carrying something near the screen edge', () => {
    const { sim, camera, input } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 15, GROUND_Y - 0.21);
    sim.run(5);
    input.down(camera.worldToView(sim.view(pebble.id)!));
    input.move({ x: VIEW_WIDTH_PX - 5, y: 500 });
    for (let i = 0; i < 30; i++) {
      input.frame(1 / 60);
      sim.step();
    }
    expect(camera.x).toBeGreaterThan(1);
  });
});

describe('PointerController on a slow frame', () => {
  it('uses the release position when moves are still queued behind it', () => {
    const sim = Sim.empty();
    const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    const clock = { t: 1000 };
    const input = new PointerController(sim, camera, VIEW_WIDTH_PX, () => clock.t);
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    sim.run(5);
    const at = camera.worldToView(sim.view(pebble.id)!);
    input.down(at, 1000);
    input.move({ x: at.x, y: at.y - 100 }, 1 / 60, 1200);
    // The release arrives 40 ms later, 200 px further right, before its moves.
    input.up(1240, { x: at.x + 200, y: at.y - 100 });
    expect(input.lastRelease!.x).toBeGreaterThan(20);
  });
});
