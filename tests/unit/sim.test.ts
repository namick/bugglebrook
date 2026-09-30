import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';

function record(sim: Sim): Array<{ name: keyof GameEvents; payload: unknown }> {
  const log: Array<{ name: keyof GameEvents; payload: unknown }> = [];
  sim.events.onAny((name, payload) => log.push({ name, payload }));
  return log;
}

describe('Sim physics', () => {
  it('drops a spawned item onto the ground and lets it settle', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'pebble', 5, 3);
    sim.run(180);
    const v = sim.view(pebble.id)!;
    expect(v.y).toBeGreaterThan(GROUND_Y - 0.4);
    expect(v.y).toBeLessThan(GROUND_Y);
    expect(Math.abs(v.vy)).toBeLessThan(0.1);
  });

  it('stacks boxes', () => {
    const sim = Sim.empty();
    const bottom = sim.spawn('item', 'matchbox', 5, GROUND_Y - 0.3);
    const top = sim.spawn('item', 'matchbox', 5, GROUND_Y - 0.9);
    sim.run(240);
    expect(sim.view(top.id)!.y).toBeLessThan(sim.view(bottom.id)!.y - 0.4);
  });

  it('grabs an item under the pointer, drags it, and flings it on release', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'pebble', 5, GROUND_Y - 0.29);
    sim.run(30);
    const start = sim.view(pebble.id)!;
    const log = record(sim);

    sim.send({ type: 'grab', x: start.x, y: start.y });
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(true);

    // Swing the hand up and to the right over a third of a second.
    for (let i = 1; i <= 20; i++) {
      sim.send({ type: 'drag', x: start.x + i * 0.2, y: start.y - i * 0.12 });
      sim.step();
    }
    const beforeRelease = sim.view(pebble.id)!;
    expect(beforeRelease.x).toBeGreaterThan(start.x + 2);
    expect(beforeRelease.vx).toBeGreaterThan(3);

    sim.send({ type: 'release' });
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(false);
    sim.run(20);
    // Momentum carries it further after letting go.
    expect(sim.view(pebble.id)!.x).toBeGreaterThan(beforeRelease.x + 1);

    const names = log.map((e) => e.name);
    expect(names).toContain('item_grabbed');
    expect(names).toContain('item_dropped');
    const dropped = log.find((e) => e.name === 'item_dropped')!.payload as GameEvents['item_dropped'];
    expect(dropped.speed).toBeGreaterThan(3);
  });

  it('ignores grabs on empty space', () => {
    const sim = Sim.empty();
    sim.spawn('item', 'pebble', 5, GROUND_Y - 0.29);
    const log = record(sim);
    sim.send({ type: 'grab', x: 20, y: 2 });
    sim.step();
    expect(sim.physics.grabbed).toBeNull();
    expect(log.filter((e) => e.name === 'item_grabbed')).toHaveLength(0);
  });

  it('keeps flung things inside the world walls', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'pebble', 1, GROUND_Y - 1);
    sim.physics.setVelocity(pebble.id, -25, -5);
    sim.run(240);
    const v = sim.view(pebble.id)!;
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(sim.worldWidth);
    expect(v.y).toBeLessThan(GROUND_Y);
  });

  it('emits a bonk when something lands hard', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'pebble', 5, 0);
    const log = record(sim);
    sim.run(120);
    const bonk = log.find((e) => e.name === 'bonked');
    expect(bonk).toBeDefined();
    expect((bonk!.payload as GameEvents['bonked']).id).toBe(pebble.id);
  });
});

describe('Bug AI', () => {
  it('wanders on its own', () => {
    const sim = Sim.empty({ seed: 'wander' });
    const bug = sim.spawn('bug', 'bip', 10, GROUND_Y - 0.43);
    const xs = new Set<number>();
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 20; i++) {
      sim.step();
      const v = sim.view(bug.id)!;
      xs.add(Math.round(v.x));
      modes.add(v.bug!.mode);
    }
    expect(modes).toContain('walk');
    expect(modes).toContain('idle');
    expect(xs.size).toBeGreaterThan(2);
    const v = sim.view(bug.id)!;
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(sim.worldWidth);
  });

  it('goes limp when held, tumbles when flung, and gets dizzy on a hard landing', () => {
    const sim = Sim.empty({ seed: 'fling' });
    const bug = sim.spawn('bug', 'gloop', 10, GROUND_Y - 0.5);
    sim.run(30);
    const log = record(sim);
    const at = sim.view(bug.id)!;
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.step();
    expect(sim.view(bug.id)!.bug!.mode).toBe('held');
    for (let i = 1; i <= 15; i++) {
      sim.send({ type: 'drag', x: at.x + i * 0.1, y: at.y - i * 0.45 });
      sim.step();
    }
    sim.send({ type: 'release' });
    sim.step();
    // Throw it down hard.
    sim.physics.setVelocity(bug.id, 0, 20);
    sim.step();
    expect(sim.view(bug.id)!.bug!.mode).toBe('tumble');
    sim.run(60);
    expect(log.some((e) => e.name === 'bug_dizzy')).toBe(true);
    sim.run(600);
    expect(['idle', 'walk']).toContain(sim.view(bug.id)!.bug!.mode);
  });
});

describe('determinism', () => {
  const script = (sim: Sim): void => {
    for (let t = 0; t < 600; t++) {
      if (t === 100) sim.send({ type: 'grab', x: 8, y: GROUND_Y - 0.3 });
      if (t > 100 && t < 130) sim.send({ type: 'drag', x: 8 + (t - 100) * 0.1, y: 5 });
      if (t === 130) sim.send({ type: 'release' });
      if (t === 200) sim.send({ type: 'spawn', kind: 'item', defId: 'pebble', x: 12, y: 2 });
      sim.step();
    }
  };

  it('same seed and commands give an identical world', () => {
    const a = Sim.create({ seed: 'same' });
    const b = Sim.create({ seed: 'same' });
    script(a);
    script(b);
    expect(a.serialize()).toEqual(b.serialize());
  });

  it('different seeds diverge', () => {
    const a = Sim.create({ seed: 'one' });
    const b = Sim.create({ seed: 'two' });
    script(a);
    script(b);
    expect(a.serialize()).not.toEqual(b.serialize());
  });
});
