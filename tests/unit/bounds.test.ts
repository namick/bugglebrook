import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GROUND_Y,
  MAX_BODY_SPEED,
  Rng,
  SAVE_VERSION,
  Sim,
  WORLD_CEILING_Y,
  loadSaveFile,
} from '../../src/game';
import type { GameEvents } from '../../src/game';
import { MIGRATIONS } from '../../src/game/save/migrations';
import { FELL_THROUGH_DEPTH, SWEEP_TICKS, dropSpots, outOfBounds } from '../../src/game/systems/bounds';
import { PLAZA_X } from './world';

const returned = (sim: Sim): GameEvents['entity_returned'][] => {
  const out: GameEvents['entity_returned'][] = [];
  sim.events.on('entity_returned', (e) => out.push(e));
  return out;
};

/** Every entity in the world (not in the pocket) is inside its box. */
function lost(sim: Sim): string[] {
  return sim
    .views()
    .filter((v) => v.pocket === undefined)
    .filter((v) =>
      outOfBounds(v.x, v.y, sim.worldWidth, sim.surfaceY(Math.max(0, Math.min(sim.worldWidth, v.x)))),
    )
    .map((v) => `${v.defId}#${v.id} at ${v.x.toFixed(1)}, ${v.y.toFixed(1)}`);
}

function openAll(sim: Sim): void {
  for (const a of sim.content.areas.all) sim.send({ type: 'unlock', area: a.id });
  sim.step();
}

describe('the world is a closed box (R01)', () => {
  it('knows what is outside the world', () => {
    expect(outOfBounds(10, 5, 100, 9)).toBe(false);
    expect(outOfBounds(-0.1, 5, 100, 9)).toBe(true);
    expect(outOfBounds(100.1, 5, 100, 9)).toBe(true);
    expect(outOfBounds(10, WORLD_CEILING_Y - 0.1, 100, 9)).toBe(true);
    expect(outOfBounds(10, 9 + FELL_THROUGH_DEPTH + 0.1, 100, 9)).toBe(true);
    expect(outOfBounds(Number.NaN, 5, 100, 9)).toBe(true);
  });

  it('tries drop spots nearest first, all inside the open stretch', () => {
    expect(dropSpots(-50, 10, 20, 1, 5)).toEqual([10, 11, 12, 13, 14]);
    expect(dropSpots(15, 10, 20, 1, 5)).toEqual([15, 16, 14, 17, 13]);
    expect(dropSpots(500, 10, 20, 2, 3)).toEqual([20, 18, 16]);
    for (const x of dropSpots(Number.NaN, 10, 20)) expect(x >= 10 && x <= 20).toBe(true);
  });

  it('never lets a body move faster than the speed limit, whatever sets its speed', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 7, 3);
    sim.physics.setVelocity(pebble.id, 400, -300);
    sim.step();
    const v = sim.view(pebble.id)!;
    expect(Math.hypot(v.vx, v.vy)).toBeLessThanOrEqual(MAX_BODY_SPEED + 1e-6);
  });

  it('stops a thing thrown straight up at full speed under the lid', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 7, WORLD_CEILING_Y + 2);
    let top = Infinity;
    for (let i = 0; i < 120; i++) {
      sim.physics.setVelocity(pebble.id, 0, -MAX_BODY_SPEED);
      sim.step();
      top = Math.min(top, sim.view(pebble.id)!.y);
    }
    expect(top).toBeGreaterThan(WORLD_CEILING_Y);
    expect(lost(sim)).toEqual([]);
  });

  it('keeps a small thing the hand shoves into an end wall inside the world', () => {
    for (const end of ['left', 'right'] as const) {
      const sim = Sim.empty();
      openAll(sim);
      const x = end === 'left' ? 0.3 : sim.worldWidth - 0.3;
      const seed = sim.spawn('item', 'item_seed_sunflower', x, GROUND_Y - 0.3);
      sim.run(30);
      const s = sim.view(seed.id)!;
      sim.send({ type: 'grab', x: s.x, y: s.y });
      sim.step();
      // Ram it into the wall and the corner for five seconds.
      for (let i = 0; i < 300; i++) {
        sim.send({
          type: 'drag',
          x: end === 'left' ? -5 : sim.worldWidth + 5,
          y: i % 2 ? GROUND_Y : GROUND_Y - 3,
        });
        sim.step();
      }
      sim.send({ type: 'release', vx: end === 'left' ? -26 : 26, vy: 0 });
      sim.run(120);
      const v = sim.view(seed.id)!;
      expect(v.x > 0 && v.x < sim.worldWidth, `${end}: ${v.x}`).toBe(true);
      expect(sim.bounds.returned).toBe(0);
    }
  });

  it('keeps the hand from dragging a thing through a locked area’s wall', () => {
    const sim = Sim.create({ seed: 'wall' });
    const span = sim.barriers.span();
    const pebble = sim.spawn('item', 'item_pebble', span.x0 + 1, GROUND_Y - 0.5);
    sim.run(30);
    const s = sim.view(pebble.id)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    for (let i = 0; i < 240; i++) {
      sim.send({ type: 'drag', x: span.x0 - 4, y: GROUND_Y - 1 });
      sim.step();
    }
    expect(sim.view(pebble.id)!.x).toBeGreaterThan(span.x0);
  });
});

describe('lost things come back (R01)', () => {
  it('drops a thing past an end wall back in from the sky with a puff', () => {
    const sim = Sim.create({ seed: 'lost' });
    const log = returned(sim);
    const cork = sim.entities.ofKind('item').find((e) => e.defId === 'item_cork')!;
    sim.physics.place(cork.id, -108, 8, 0);
    sim.run(SWEEP_TICKS + 1);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ id: cork.id, kind: 'item', defId: 'item_cork', fromX: -108 });
    // The nearest open stretch: the flowerbed is locked, so the pond's left end.
    const span = sim.barriers.span();
    expect(log[0]!.x).toBeGreaterThanOrEqual(span.x0);
    expect(log[0]!.x).toBeLessThan(span.x0 + 5);
    expect(log[0]!.y).toBeLessThan(0);
    sim.run(180);
    expect(lost(sim)).toEqual([]);
    expect(sim.bounds.returned).toBe(1);
  });

  it('brings back something above the lid, and lifts something fallen through the ground', () => {
    const sim = Sim.create({ seed: 'lost' });
    const log = returned(sim);
    const items = sim.entities.ofKind('item').filter((e) => sim.view(e.id)!.x > PLAZA_X + 5);
    sim.physics.place(items[0]!.id, PLAZA_X + 10, -500, 0);
    sim.physics.place(items[1]!.id, PLAZA_X + 12, GROUND_Y + 40, 0);
    sim.run(SWEEP_TICKS * 2);
    expect(log.map((e) => e.id)).toEqual([items[0]!.id]);
    expect(sim.rescues).toBe(1);
    sim.run(240);
    expect(lost(sim)).toEqual([]);
  });

  it('brings back a thing that fell through the ground while its area slept', () => {
    const sim = Sim.create({ seed: 'asleep' });
    const log = returned(sim);
    const pond = sim.content.areas.get('area_puddle_pond');
    const cork = sim.entities.ofKind('item').find((e) => e.defId === 'item_cork')!;
    // The camera far right: the pond sleeps, and its bodies are switched off.
    sim.send({ type: 'focus', x0: sim.worldWidth - 19.2, x1: sim.worldWidth });
    sim.step();
    expect(sim.isSleeping(cork.id)).toBe(true);
    sim.physics.place(cork.id, pond.xStart + 20, GROUND_Y + 40, 0);
    sim.run(SWEEP_TICKS + 1);
    expect(log.map((e) => e.id)).toEqual([cork.id]);
  });

  it('drops a lost thing under the porch below its roof, not onto it', () => {
    const sim = Sim.create({ seed: 'porch' });
    openAll(sim);
    const log = returned(sim);
    const porch = sim.content.areas.get('area_under_porch');
    const pebble = sim.spawn('item', 'item_pebble', porch.xStart + 10, 5);
    sim.physics.place(pebble.id, sim.worldWidth + 30, GROUND_Y - 1, 0);
    // The right end's nearest open stretch is the treehouse; pretend the porch is the far end
    // (by the flowerpot, where the floor is clear: shelves hang over the junk pile further in).
    const span = { x0: sim.barriers.span().x0, x1: porch.xStart + 7.4 };
    sim.barriers.span = () => span;
    sim.run(SWEEP_TICKS + 1);
    expect(log).toHaveLength(1);
    expect(log[0]!.y).toBeGreaterThan(porch.roof!.y);
    sim.run(240);
    expect(sim.view(pebble.id)!.y).toBeGreaterThan(GROUND_Y - 1);
  });

  it('lets a lost bug fall back onto its feet, not dizzy', () => {
    const sim = Sim.create({ seed: 'bug' });
    const dot = sim.entities.ofKind('bug').find((e) => e.defId === 'bug_ladybug_dot')!;
    sim.physics.place(dot.id, sim.worldWidth + 40, 3, 0);
    // The sweep runs on tick 0.
    sim.step();
    expect(dot.bug!.mode).toBe('st_airborne');
    expect(dot.bug!.selfLaunched).toBe(true);
    sim.run(300);
    expect(lost(sim)).toEqual([]);
    expect(dot.bug!.mode).not.toBe('st_dizzy');
  });

  it('rescues things a save left outside the world when it loads', () => {
    const sim = Sim.create({ seed: 'load' });
    const pebble = sim.entities.ofKind('item').find((e) => e.defId === 'item_pebble')!;
    const save = sim.serialize();
    save.entities.find((e) => e.id === pebble.id)!.body.x = 400;
    const loaded = Sim.load(save);
    expect(lost(loaded)).toEqual([]);
    expect(loaded.bounds.returned).toBe(1);
  });
});

describe('save version 10', () => {
  const v9 = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'save-v9.json'), 'utf8'));

  it('brings back things a version 9 save lost past the end walls, over the lid, or under the ground', () => {
    const raw = v9();
    const world = raw.world as { entities: { id: number; kind: string; body: Record<string, number> }[] };
    const [a, b, c] = world.entities.filter((e) => e.kind === 'item');
    const bug = world.entities.find((e) => e.kind === 'bug')!;
    a!.body.x = -108;
    b!.body.x = 435;
    b!.body.y = 3;
    c!.body.y = -90;
    bug.body.y = 40;
    const migrated = MIGRATIONS[9]!(structuredClone(raw)) as typeof raw;
    expect(migrated.version).toBe(10);
    const after = (migrated.world as typeof world).entities;
    for (const e of [a, b, c, bug]) {
      const body = after.find((q) => q.id === e!.id)!.body;
      expect(body.x).toBeGreaterThan(64);
      expect(body.x).toBeLessThan(102.4);
      expect(body.y).toBeLessThan(0);
      expect(body.vx).toBe(0);
    }
    // Everything else is untouched.
    const others = after.filter((q) => ![a, b, c, bug].some((e) => e!.id === q.id));
    expect(others).toEqual(world.entities.filter((q) => ![a, b, c, bug].some((e) => e!.id === q.id)));

    const sim = Sim.load(loadSaveFile(JSON.stringify(raw)).world);
    sim.run(240);
    expect(lost(sim)).toEqual([]);
  });
});

describe('soak: nothing is ever lost (R01)', () => {
  it('the hand never presses what it holds into the end wall', () => {
    const sim = Sim.empty({ seed: 'end-wall' });
    openAll(sim);
    const x = sim.worldWidth - 3;
    const ruler = sim.spawn('item', 'item_ruler_ramp', x, sim.surfaceY(x) - 0.5);
    sim.run(30);
    const v = sim.view(ruler.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    for (let i = 0; i < 60; i++) {
      sim.send({ type: 'drag', x: sim.worldWidth + 2, y: v.y - 1 });
      sim.step();
    }
    const box = sim.boxOf(ruler.id);
    expect(box.x1).toBeLessThan(sim.worldWidth + 0.05);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(30);
    expect(sim.bounds.sweep()).toBe(0);
  });

  it('survives three minutes of fast drags and flings in every open area', () => {
    const sim = Sim.create({ seed: 'soak' });
    openAll(sim);
    const r = new Rng('hand');
    const before = sim.entities.all().length;
    let removed = 0;
    sim.events.on('entity_removed', () => removed++);
    let spawned = 0;
    sim.events.on('entity_spawned', () => spawned++);
    let fastest = 0;
    const check = (): void => {
      for (const e of sim.entities.all()) {
        if (!sim.physics.has(e.id) || !sim.physics.isActive(e.id)) continue;
        const s = sim.physics.getState(e.id);
        fastest = Math.max(fastest, Math.hypot(s.vx, s.vy));
      }
    };
    for (let cycle = 0; cycle < 90; cycle++) {
      const views = sim.views().filter((v) => v.pocket === undefined);
      const v = views[Math.floor(r.next() * views.length)]!;
      sim.send({ type: 'grab', x: v.x, y: v.y });
      sim.step();
      let x = v.x;
      let y = v.y;
      // A wild drag: up to 3 m a step, which is far faster than the speed limit.
      for (let i = 0; i < 20; i++) {
        x += (r.next() - 0.5) * 6;
        y += (r.next() - 0.6) * 3;
        sim.send({ type: 'drag', x, y });
        sim.step();
        check();
      }
      sim.send({ type: 'release', vx: (r.next() - 0.5) * 80, vy: (r.next() - 0.7) * 80 });
      for (let i = 0; i < 99; i++) {
        sim.step();
        if (i % 3 === 0) check();
      }
      expect(lost(sim), `cycle ${cycle}`).toEqual([]);
    }
    expect(fastest).toBeLessThanOrEqual(MAX_BODY_SPEED + 1e-6);
    expect(sim.bounds.returned).toBe(0);
    expect(sim.entities.all().length).toBe(before + spawned - removed);
  }, 120_000);
});

describe('a real version 10 save', () => {
  it('loads with every area open, the potion still glowing, and nothing outside the world', () => {
    const raw = readFileSync(join(import.meta.dirname, 'fixtures', 'save-v10.json'), 'utf8');
    const save = loadSaveFile(raw);
    expect(save.version).toBe(SAVE_VERSION);
    const sim = Sim.load(save.world);
    // The whole surface strip; the hidden areas past it (M10) are their own sealed stretches.
    expect(sim.barriers.span()).toEqual({ x0: 0, x1: sim.content.areas.get('area_treehouse_arcade').xEnd });
    const dot = sim.entities.ofKind('bug').find((e) => e.defId === 'bug_ladybug_dot')!;
    expect(dot.effects?.map((f) => f.potion)).toContain('potion_glow');
    sim.run(600);
    expect(lost(sim)).toEqual([]);
    expect(sim.bounds.returned).toBe(0);
    expect(sim.rescues).toBe(0);
  });
});
