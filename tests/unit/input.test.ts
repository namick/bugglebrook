import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../src/game';
import { PointerController } from '../../src/renderer/src/input/pointerController';
import { Camera } from '../../src/renderer/src/render/camera';

const setup = (): { sim: Sim; camera: Camera; input: PointerController } => {
  const sim = Sim.empty();
  const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
  return { sim, camera, input: new PointerController(sim, camera, VIEW_WIDTH_PX) };
};

describe('PointerController', () => {
  it('grabs a thing under the pointer and drags it with the pointer', () => {
    const { sim, camera, input } = setup();
    const pebble = sim.spawn('item', 'pebble', 5, GROUND_Y - 0.29);
    sim.run(10);
    const at = camera.worldToView(sim.view(pebble.id)!);
    input.down(at);
    expect(input.mode).toBe('hold');
    for (let i = 1; i <= 30; i++) {
      input.move({ x: at.x + i * 10, y: at.y - i * 8 });
      input.frame(1 / 60);
      sim.step();
    }
    expect(sim.view(pebble.id)!.held).toBe(true);
    expect(sim.view(pebble.id)!.x).toBeGreaterThan(7);
    input.up();
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(false);
    expect(input.mode).toBe('none');
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

  it('pans with the wheel', () => {
    const { camera, input } = setup();
    input.wheel(0, 300);
    expect(camera.x).toBeCloseTo(3);
    input.wheel(-100, 10);
    expect(camera.x).toBeCloseTo(2);
  });

  it('edge-scrolls while carrying something near the screen edge', () => {
    const { sim, camera, input } = setup();
    const pebble = sim.spawn('item', 'pebble', 15, GROUND_Y - 0.29);
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
