import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents, SaveFile } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { BUGS } from '../../src/game/data/bugs';
import { ACORN_MASS, LATCH_MAX, LATCH_MIN } from '../../src/game/systems/barriers';
import { PLAZA_X, POND_X } from './world';

// M7 (game design doc, sections 3, 4, 12, and 19): more areas and unlocks.

type Logged = { name: keyof GameEvents; tick: number; payload: Record<string, unknown> };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) =>
    log.push({ name, tick: sim.tick, payload: payload as Record<string, unknown> }),
  );
  return log;
}

const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

/** Where a fixture is in world meters. */
function fixture(sim: Sim, id: string): { x: number; y: number } {
  for (const area of sim.content.areas.all)
    for (const f of area.fixtures ?? []) if (f.id === id) return { x: area.xStart + f.x, y: f.y };
  throw new Error(id);
}

const area = (sim: Sim, id: string): { x0: number; x1: number } => {
  const a = sim.content.areas.get(id);
  return { x0: a.xStart, x1: a.xEnd };
};

const itemOf = (sim: Sim, defId: string): Entity =>
  sim.entities.ofKind('item').find((e) => e.defId === defId)!;
const bugOf = (sim: Sim, defId: string): Entity | undefined =>
  sim.entities.ofKind('bug').find((e) => e.defId === defId);

/** Everyone full, so nobody wanders off to eat what a test stages. */
function calm(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
}

function saveOf(sim: Sim): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: '2026-09-30T00:00:00.000Z',
    world: sim.serialize(),
    view: { cameraX: PLAZA_X },
    meta: { createdAt: '2026-09-30T00:00:00.000Z', thumb: null },
  };
}

const reload = (sim: Sim): Sim => Sim.load(loadSaveFile(JSON.stringify(saveOf(sim))).world);

/** Put a thing somewhere, at rest. */
function place(sim: Sim, id: number, x: number, y?: number): void {
  const e = sim.entities.get(id)!;
  sim.physics.place(id, x, y ?? sim.surfaceY(x) - sim.halfHeight(e) - 0.02, 0);
}

/** Roll a round thing along the floor toward the can tunnel. */
function rollAtTunnel(sim: Sim, id: number, speed = 5): void {
  const wall = sim.barriers.barrier('can_tunnel')!.wall;
  place(sim, id, wall - 2.2);
  sim.run(5);
  sim.physics.setVelocity(id, speed, 0);
}

describe('barriers and locked areas', () => {
  it('four areas start locked, each behind one barrier; only the pond and plaza are open', () => {
    const sim = Sim.create({ seed: 'locks' });
    const open = sim.content.areas.all.filter((a) => sim.barriers.isOpen(a.id)).map((a) => a.id);
    expect(open).toEqual(['area_puddle_pond', 'area_stump_plaza']);
    expect(sim.barriers.barriers().map((b) => [b.kind, b.opens])).toEqual([
      ['sunflower', 'area_flowerbed_stage'],
      ['lattice', 'area_under_porch'],
      ['can_tunnel', 'area_compost_lab'],
      ['bucket_lift', 'area_treehouse_arcade'],
    ]);
    const span = sim.barriers.span();
    expect(span.x0).toBeCloseTo(POND_X, 1);
    expect(span.x1).toBeCloseTo(area(sim, 'area_under_porch').x0 + 5.3, 5);
  });

  it(
    'walls stop things flung at a locked barrier, and bugs never cross one (10 minutes)',
    { timeout: 180_000 },
    () => {
      const sim = Sim.create({ seed: 'walls' });
      const span = sim.barriers.span();
      const pebble = sim.spawn('item', 'item_pebble', span.x0 + 3, 7);
      sim.physics.setVelocity(pebble.id, -20, -2);
      const ball = sim.spawn('item', 'item_rubber_ball', span.x1 - 3, 7);
      sim.physics.setVelocity(ball.id, 22, -2);
      for (let t = 0; t < 10 * 60 * 60; t++) {
        sim.step();
        if (t % 30 !== 0) continue;
        for (const b of sim.entities.ofKind('bug')) {
          const v = sim.view(b.id)!;
          if (v.x < span.x0 || v.x > span.x1) {
            // Only the hidden bugs waiting in locked areas live out there.
            expect(v.bug!.pending, `${v.defId} crossed a barrier`).toBeDefined();
          }
        }
      }
      expect(sim.view(pebble.id)!.x).toBeGreaterThan(span.x0);
      expect(sim.view(ball.id)!.x).toBeLessThan(span.x1);
    },
  );

  it('wetting the sunflower soil with any wet thing opens the flowerbed; a dry thing does not', () => {
    const sim = Sim.create({ seed: 'sunflower' });
    const log = record(sim);
    const soil = fixture(sim, 'fix_sunflower_gate');
    const sponge = itemOf(sim, 'item_sponge');
    place(sim, sponge.id, soil.x);
    sim.run(60);
    expect(sim.barriers.isOpen('area_flowerbed_stage')).toBe(false);
    // Dunk it in the pond, then back on the soil.
    sim.addTag(sponge.id, 'tag_wet', 'water');
    place(sim, sponge.id, soil.x + 0.3);
    sim.run(20);
    expect(sim.barriers.isOpen('area_flowerbed_stage')).toBe(true);
    expect(named(log, 'sunflower_drank')).toHaveLength(1);
    expect(named(log, 'area_unlocked')[0]).toMatchObject({ areaId: 'area_flowerbed_stage' });
    expect(sim.secrets).toContain('secret_sunflower_drink');
    expect(sim.barriers.span().x0).toBe(0);
    // Things can go through now.
    const pebble = sim.spawn('item', 'item_pebble', POND_X + 1, 7);
    sim.physics.setVelocity(pebble.id, -10, -2);
    sim.run(90);
    expect(sim.view(pebble.id)!.x).toBeLessThan(POND_X);
  });

  it('a wet bug walking onto the soil opens it too, and so does rain', () => {
    const sim = Sim.create({ seed: 'wetbug' });
    const soil = fixture(sim, 'fix_sunflower_gate');
    const dot = bugOf(sim, 'bug_ladybug_dot')!;
    place(sim, dot.id, soil.x);
    sim.addTag(dot.id, 'tag_wet', 'water');
    sim.run(20);
    expect(sim.barriers.isOpen('area_flowerbed_stage')).toBe(true);
    const rainy = Sim.create({ seed: 'rainy' });
    rainy.send({ type: 'set_weather', wind: 0, rain: true });
    rainy.run(6 * 60);
    expect(rainy.barriers.isOpen('area_flowerbed_stage')).toBe(true);
  });

  it('the lattice panel is heavy and slow to drag; pulled aside, the porch opens for good', () => {
    const sim = Sim.create({ seed: 'lattice' });
    const log = record(sim);
    const lattice = itemOf(sim, 'item_lattice_panel');
    const dot = bugOf(sim, 'bug_ladybug_dot')!;
    expect(sim.physics.mass(lattice.id)).toBeGreaterThan(sim.physics.mass(dot.id) * 8);
    const start = sim.view(lattice.id)!;
    sim.run(120);
    expect(sim.barriers.isOpen('area_under_porch')).toBe(false);
    // Grab it high up and pull it toward the plaza.
    sim.send({ type: 'grab', x: start.x, y: start.y - 2 });
    sim.step();
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 20, 3);
    const hand = { x: start.x, y: start.y - 2 };
    let lag = 0;
    for (let i = 0; i < 150; i++) {
      hand.x -= 0.04;
      sim.send({ type: 'drag', x: hand.x, y: hand.y });
      sim.step();
      if (i === 40) lag = hand.x - sim.view(lattice.id)!.x + (start.x - start.x);
    }
    void pebble;
    // It trails the hand: heavy things drag slowly.
    expect(Math.abs(lag)).toBeGreaterThan(0.05);
    sim.send({ type: 'release' });
    sim.run(60);
    expect(sim.view(lattice.id)!.x).toBeLessThan(start.x - 2);
    expect(sim.barriers.isOpen('area_under_porch')).toBe(true);
    expect(named(log, 'area_unlocked').map((e) => e.areaId)).toEqual(['area_under_porch']);
    // Putting it back does not lock the porch again.
    place(sim, lattice.id, start.x);
    sim.run(60);
    expect(sim.barriers.isOpen('area_under_porch')).toBe(true);
  });

  it('never fits in the pocket: letting go over the pocket just drops it', () => {
    const sim = Sim.create({ seed: 'bigpocket' });
    const lattice = itemOf(sim, 'item_lattice_panel');
    const v = sim.view(lattice.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    sim.send({ type: 'pocket_put', slot: 0 });
    sim.step();
    expect(sim.pocket.slots[0]).toEqual([]);
    expect(sim.physics.grabbed).toBeNull();
  });

  it('a ball-sized round thing rolled through the can tunnel opens the latch; a marble clinks back out', () => {
    for (const [defId, fits] of [
      ['item_marble_blue', false],
      ['item_rubber_ball', true],
    ] as const) {
      const sim = Sim.create({ seed: `tunnel-${defId}` });
      sim.send({ type: 'unlock', area: 'area_under_porch' });
      sim.step();
      const log = record(sim);
      const thing = sim.spawn('item', defId, 120, 7);
      rollAtTunnel(sim, thing.id);
      sim.run(120);
      const shape = sim.content.items.get(defId).shape;
      const d = shape.type === 'circle' ? shape.radius * 2 : 0;
      expect(d >= LATCH_MIN && d <= LATCH_MAX).toBe(fits);
      expect(named(log, 'tunnel_rolled')[0]).toMatchObject({ id: thing.id, fits });
      expect(sim.barriers.isOpen('area_compost_lab')).toBe(fits);
      const wall = sim.barriers.barrier('can_tunnel')!.wall;
      if (fits) {
        expect(sim.view(thing.id)!.x).toBeGreaterThan(wall);
        expect(sim.secrets).toContain('secret_rollo_tunnel');
      } else expect(sim.view(thing.id)!.x).toBeLessThan(wall);
    }
  });

  it('Rollo curled into a ball rolls through the tunnel and bumps the latch', () => {
    const sim = Sim.create({ seed: 'rollo-tunnel' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.step();
    const rollo = bugOf(sim, 'bug_pillbug_rollo')!;
    place(sim, rollo.id, 128);
    sim.run(10);
    // Three quick pokes and he curls up; then a push toward the tunnel.
    for (let i = 0; i < 3; i++) {
      const v = sim.view(rollo.id)!;
      sim.send({ type: 'poke', x: v.x, y: v.y });
      sim.run(6);
    }
    expect(sim.isRolling(rollo.id)).toBe(true);
    rollAtTunnel(sim, rollo.id, 4.5);
    sim.run(120);
    expect(sim.barriers.isOpen('area_compost_lab')).toBe(true);
  });

  it('the bucket lift rises only when its load outweighs the acorn, and opens the treehouse', () => {
    const sim = Sim.create({ seed: 'lift' });
    for (const a of ['area_under_porch', 'area_compost_lab']) sim.send({ type: 'unlock', area: a });
    sim.step();
    calm(sim);
    const log = record(sim);
    const lift = sim.barriers.barrier('bucket_lift')!;
    const floor = sim.barriers.state.lift.y;
    // Two small bugs are not enough.
    const dot = sim.spawn('bug', 'bug_ladybug_dot', lift.x - 0.45, floor - 1);
    const rollo = sim.spawn('bug', 'bug_pillbug_rollo', lift.x + 0.45, floor - 1.2);
    // Sleepy: they curl up for a nap in the bucket.
    for (const id of [dot.id, rollo.id]) sim.send({ type: 'set_need', id, need: 'need_energy', value: 5 });
    sim.run(120);
    const two = sim.barriers.bucketLoad();
    expect(two.ids.sort()).toEqual([dot.id, rollo.id].sort());
    expect(two.mass).toBeLessThan(ACORN_MASS);
    expect(sim.barriers.state.lift.phase).toBe('down');
    // Moose alone is.
    sim.remove(dot.id);
    sim.remove(rollo.id);
    const moose = bugOf(sim, 'bug_stagbeetle_moose')!;
    sim.cast.join(moose, 0, 0);
    place(sim, moose.id, lift.x, floor - 1);
    sim.send({ type: 'set_need', id: moose.id, need: 'need_energy', value: 100 });
    sim.run(40);
    expect(sim.physics.mass(moose.id)).toBeGreaterThan(ACORN_MASS);
    expect(sim.barriers.state.lift.phase).not.toBe('down');
    sim.run(6 * 60);
    expect(named(log, 'lift_moved').map((e) => e.phase)).toEqual(expect.arrayContaining(['up', 'top']));
    expect(sim.barriers.isOpen('area_treehouse_arcade')).toBe(true);
    // Moose was tipped out onto the treehouse floor.
    const house = area(sim, 'area_treehouse_arcade');
    sim.run(3 * 60);
    expect(sim.view(moose.id)!.x).toBeGreaterThan(house.x0);
  });

  it('once open, a counterweight means one small bug rides the lift', () => {
    const sim = Sim.create({ seed: 'lift2' });
    for (const a of ['area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      sim.send({ type: 'unlock', area: a });
    sim.step();
    const lift = sim.barriers.barrier('bucket_lift')!;
    const dot = sim.spawn('bug', 'bug_ladybug_dot', lift.x, sim.barriers.state.lift.y - 1);
    sim.send({ type: 'set_need', id: dot.id, need: 'need_energy', value: 100 });
    sim.run(60);
    expect(sim.barriers.state.lift.phase).not.toBe('down');
  });

  it('opened areas stay open after a save and load, with their walls gone', () => {
    const sim = Sim.create({ seed: 'keep-open' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.run(10);
    const loaded = reload(sim);
    expect(loaded.barriers.isOpen('area_flowerbed_stage')).toBe(true);
    expect(loaded.barriers.isOpen('area_under_porch')).toBe(true);
    expect(loaded.barriers.isOpen('area_compost_lab')).toBe(false);
    expect(loaded.barriers.span()).toEqual(sim.barriers.span());
    const pebble = loaded.spawn('item', 'item_pebble', POND_X + 1, 7);
    loaded.physics.setVelocity(pebble.id, -10, -2);
    loaded.run(90);
    expect(loaded.view(pebble.id)!.x).toBeLessThan(POND_X);
  });

  it('the porch roof keeps the rain off; out in the open things get wet within 5 s', () => {
    const sim = Sim.create({ seed: 'roof' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    const porch = area(sim, 'area_under_porch');
    const under = sim.spawn('item', 'item_pebble', porch.x0 + 12.4, GROUND_Y - 0.4);
    const out = sim.spawn('item', 'item_pebble', PLAZA_X + 4.6, GROUND_Y - 0.4);
    sim.run(30);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(6 * 60);
    expect(sim.hasTag(out.id, 'tag_wet')).toBe(true);
    expect(sim.hasTag(under.id, 'tag_wet')).toBe(false);
  });
});

describe('finding the new bugs (find secrets)', () => {
  it('each find secret adds its bug to the cast: joined, logged, and cheering', () => {
    const found: Record<string, string> = {
      bug_stinkbug_whiff: 'secret_whiff_found',
      bug_stagbeetle_moose: 'secret_moose_found',
      bug_dungbeetle_barty: 'secret_barty_found',
      bug_caterpillar_munch: 'secret_munch_found',
      bug_mantis_prim: 'secret_prim_found',
      bug_stickinsect_twig: 'secret_twig_blinks',
    };
    for (const [bug, secret] of Object.entries(found)) expect(BUGS.get(bug).foundBy).toBe(secret);
    const sim = Sim.create({ seed: 'cast' });
    // Twig, Moose, and Barty wait in the world; Whiff, Munch, and Prim are hiding out of it.
    expect(sim.cast.present('bug_stickinsect_twig')).toBe(true);
    expect(sim.cast.present('bug_stagbeetle_moose')).toBe(true);
    expect(sim.cast.present('bug_dungbeetle_barty')).toBe(true);
    for (const b of ['bug_stinkbug_whiff', 'bug_caterpillar_munch', 'bug_mantis_prim'])
      expect(sim.cast.present(b)).toBe(false);
    expect(sim.cast.members().sort()).toEqual(
      [
        'bug_grasshopper_boing',
        'bug_ladybug_dot',
        'bug_pillbug_rollo',
        'bug_snail_glorp',
        'bug_waterstrider_skeet',
      ].sort(),
    );
  });

  it('Whiff: once the lattice moves, a poke on his flowerpot brings him out with a stink puff', () => {
    const sim = Sim.create({ seed: 'whiff' });
    const log = record(sim);
    const pot = fixture(sim, 'fix_whiff_pot');
    sim.send({ type: 'poke', x: pot.x, y: pot.y });
    sim.run(10);
    // Still behind the lattice: nobody comes out yet.
    expect(sim.cast.present('bug_stinkbug_whiff')).toBe(false);
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.send({ type: 'poke', x: pot.x, y: pot.y });
    sim.run(30);
    expect(sim.cast.joined('bug_stinkbug_whiff')).toBe(true);
    expect(sim.secrets).toContain('secret_whiff_found');
    expect(named(log, 'bug_joined').map((e) => e.defId)).toEqual(['bug_stinkbug_whiff']);
    expect(named(log, 'bug_reacted').some((e) => e.reaction === 'join')).toBe(true);
  });

  it('Moose: stuck on his back until set upright by the hand, or knocked over by something', () => {
    const sim = Sim.create({ seed: 'moose' });
    const moose = bugOf(sim, 'bug_stagbeetle_moose')!;
    sim.run(120);
    expect(sim.view(moose.id)!.bug!.pending).toBe('stuck');
    const x0 = sim.view(moose.id)!.x;
    expect(Math.abs(x0 - sim.view(moose.id)!.x)).toBeLessThan(0.05);
    const v = sim.view(moose.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.run(20);
    expect(sim.cast.joined('bug_stagbeetle_moose')).toBe(false);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(5);
    expect(sim.cast.joined('bug_stagbeetle_moose')).toBe(true);
    expect(sim.secrets).toContain('secret_moose_found');
    // Or: something bumps him hard enough.
    const other = Sim.create({ seed: 'moose2' });
    const m2 = bugOf(other, 'bug_stagbeetle_moose')!;
    const mv = other.view(m2.id)!;
    const pebble = other.spawn('item', 'item_pebble', mv.x - 2, mv.y - 0.4);
    other.physics.setVelocity(pebble.id, 9, 0);
    other.run(60);
    expect(other.cast.joined('bug_stagbeetle_moose')).toBe(true);
  });

  it('Barty ignores everyone until a marble or ball rolls up to him', () => {
    const sim = Sim.create({ seed: 'barty' });
    const barty = bugOf(sim, 'bug_dungbeetle_barty')!;
    sim.run(5 * 60);
    expect(sim.view(barty.id)!.bug!.pending).toBe('aloof');
    // Other bugs never play with him yet.
    expect(
      sim
        .bugWorld()
        .bugs()
        .some((b) => b.id === barty.id),
    ).toBe(false);
    const v = sim.view(barty.id)!;
    // Rolled down the heap past him.
    const marble = sim.spawn('item', 'item_marble_red', v.x + 1.6, v.y - 0.6);
    sim.physics.setVelocity(marble.id, -2.5, 0);
    sim.run(3 * 60);
    expect(sim.cast.joined('bug_dungbeetle_barty')).toBe(true);
    expect(sim.secrets).toContain('secret_barty_found');
  });

  it('Munch: a click on the rustling, nibbled leaf drops him out mid-bite', () => {
    const sim = Sim.create({ seed: 'munch' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    const leaf = fixture(sim, 'fix_munch_leaf');
    sim.run(4 * 60);
    sim.send({ type: 'poke', x: leaf.x, y: leaf.y });
    sim.run(30);
    const munch = bugOf(sim, 'bug_caterpillar_munch')!;
    expect(munch).toBeDefined();
    expect(Math.abs(sim.view(munch.id)!.x - leaf.x)).toBeLessThan(1.5);
    expect(sim.secrets).toContain('secret_munch_found');
    // The leaf's hiding place is empty now: no second Munch.
    sim.send({ type: 'poke', x: leaf.x, y: leaf.y });
    sim.run(10);
    expect(sim.entities.ofKind('bug').filter((b) => b.defId === 'bug_caterpillar_munch')).toHaveLength(1);
  });

  it('Prim: the claw machine pulls her out of the prize heap the first time it is used', () => {
    const sim = Sim.create({ seed: 'prim' });
    for (const a of ['area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      sim.send({ type: 'unlock', area: a });
    sim.run(10);
    const log = record(sim);
    const button = fixture(sim, 'fix_claw_button');
    sim.send({ type: 'poke', x: button.x, y: button.y });
    sim.run(8 * 60);
    expect(named(log, 'claw_moved').map((e) => e.phase)).toEqual(['drop', 'grab', 'prize']);
    expect(sim.cast.joined('bug_mantis_prim')).toBe(true);
    expect(sim.secrets).toContain('secret_prim_found');
  });

  it('Twig: a poke while his eyes are open finds him; a poke with them shut does nothing', () => {
    const sim = Sim.create({ seed: 'twig' });
    const log = record(sim);
    const twig = bugOf(sim, 'bug_stickinsect_twig')!;
    const v = sim.view(twig.id)!;
    // Looks like a twig: pokes make it hop like one.
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(20);
    expect(sim.cast.joined('bug_stickinsect_twig')).toBe(false);
    // Hand far away: within 40 s he peeks.
    sim.send({ type: 'hand', x: v.x + 8, y: 5 });
    let peeked = false;
    for (let t = 0; t < 45 * 60 && !peeked; t++) {
      sim.step();
      peeked = !!sim.view(twig.id)!.bug!.peeking;
    }
    expect(peeked).toBe(true);
    expect(named(log, 'bug_blinked').length).toBeGreaterThanOrEqual(1);
    const at = sim.view(twig.id)!;
    sim.send({ type: 'poke', x: at.x, y: at.y });
    sim.step();
    expect(sim.cast.joined('bug_stickinsect_twig')).toBe(true);
    expect(sim.secrets).toContain('secret_twig_blinks');
  });

  it('Twig never peeks while the hand is close, and grabbing him shows his legs', () => {
    const sim = Sim.create({ seed: 'twig2' });
    const twig = bugOf(sim, 'bug_stickinsect_twig')!;
    const v = sim.view(twig.id)!;
    sim.send({ type: 'hand', x: v.x + 1, y: v.y - 0.5 });
    const log = record(sim);
    sim.run(50 * 60);
    expect(named(log, 'bug_blinked')).toHaveLength(0);
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sim.cast.joined('bug_stickinsect_twig')).toBe(true);
  });
});

/** A world with everything open and the bugs found, for trying the new bugs out. */
function openWorld(seed: string): Sim {
  const sim = Sim.create({ seed });
  for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
    sim.send({ type: 'unlock', area: a });
  sim.step();
  return sim;
}

/** An empty world with one bug of each kind asked for, on flat plaza ground, joined. */
function stage(seed: string, bugs: { def: string; x: number }[]): { sim: Sim; ids: number[] } {
  const sim = Sim.empty({ seed });
  const ids = bugs.map((b) => {
    const r = BUGS.get(b.def).radius;
    const e = sim.spawn('bug', b.def, PLAZA_X + b.x, GROUND_Y - r - 0.02);
    e.bug!.needs = { need_hunger: 100, need_fun: 100, need_energy: 100, need_social: 100, need_clean: 100 };
    return e.id;
  });
  return { sim, ids };
}

describe('signature behaviors', () => {
  it('Whiff, startled, lets off a stink cloud that other bugs smell; then fans it away, embarrassed', () => {
    const { sim, ids } = stage('whiff-puff', [
      { def: 'bug_stinkbug_whiff', x: 5 },
      { def: 'bug_ladybug_dot', x: 6.2 },
    ]);
    const [whiff, dot] = ids as [number, number];
    const log = record(sim);
    sim.run(10);
    const v = sim.view(whiff)!;
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(40);
    expect(named(log, 'stink_cloud')).toHaveLength(1);
    expect(sim.hasTag(whiff, 'tag_smelly')).toBe(true);
    expect(named(log, 'bug_reacted').some((e) => e.id === whiff && e.reaction === 'puff')).toBe(true);
    expect(named(log, 'bug_smelled').some((e) => e.id === dot)).toBe(true);
    // It clears after 6 s.
    sim.run(6 * 60);
    expect(sim.hasTag(whiff, 'tag_smelly')).toBe(false);
  });

  it('Moose lifts a heavy thing over his head, carries it, and sets it down', () => {
    const { sim, ids } = stage('moose-lift', [{ def: 'bug_stagbeetle_moose', x: 5 }]);
    const moose = ids[0]!;
    sim.entities.get(moose)!.bug!.needs.need_fun = 20;
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 7.5, GROUND_Y - 0.22);
    const log = record(sim);
    let overhead = false;
    for (let t = 0; t < 60 * 60 && !overhead; t++) {
      sim.step();
      overhead = !!sim.view(moose)!.bug!.overhead;
    }
    expect(overhead).toBe(true);
    const p = sim.view(pebble.id)!;
    expect(p.y).toBeLessThan(sim.view(moose)!.y - BUGS.get('bug_stagbeetle_moose').radius);
    sim.run(20 * 60);
    expect(named(log, 'bug_put_down').some((e) => e.itemId === pebble.id)).toBe(true);
    expect(sim.view(moose)!.bug!.carrying).toBeNull();
  });

  it('Moose pulls a friend free of the gum', () => {
    const { sim, ids } = stage('moose-free', [
      { def: 'bug_stagbeetle_moose', x: 4 },
      { def: 'bug_pillbug_rollo', x: 8 },
    ]);
    const [, rollo] = ids as [number, number];
    const gum = sim.spawn('item', 'item_gum_blob', PLAZA_X + 8, GROUND_Y - 1.3);
    sim.run(90);
    expect(sim.environment.state.sticks.some((k) => k.a === rollo || k.b === rollo)).toBe(true);
    sim.entities.get(rollo)!.bug!.needs.need_social = 100;
    const log = record(sim);
    sim.run(30 * 60);
    expect(named(log, 'bug_freed').some((e) => e.partnerId === rollo)).toBe(true);
    void gum;
  });

  it('Barty rolls round things along, walking backward', () => {
    const { sim, ids } = stage('barty-roll', [{ def: 'bug_dungbeetle_barty', x: 5 }]);
    const barty = ids[0]!;
    sim.entities.get(barty)!.bug!.needs.need_fun = 20;
    const ball = sim.spawn('item', 'item_dung_ball', PLAZA_X + 7.5, GROUND_Y - 0.31);
    const x0 = sim.view(ball.id)!.x;
    let rolling = false;
    let backward = false;
    for (let t = 0; t < 40 * 60; t++) {
      sim.step();
      const v = sim.view(barty)!;
      if (v.bug!.rolling) {
        rolling = true;
        if (Math.abs(v.vx) > 0.2 && Math.sign(v.vx) === -v.bug!.facing) backward = true;
      }
    }
    expect(rolling).toBe(true);
    expect(backward).toBe(true);
    expect(Math.abs(sim.view(ball.id)!.x - x0)).toBeGreaterThan(1);
  });

  it('Munch nibbles holes in leaves; after five leafy meals a cocoon at night, and a butterfly at dawn', () => {
    const { sim, ids } = stage('munch', [{ def: 'bug_caterpillar_munch', x: 5 }]);
    const munch = ids[0]!;
    const log = record(sim);
    const brain = sim.entities.get(munch)!.bug!;
    const leaf = sim.spawn('item', 'item_leaf', PLAZA_X + 6.2, GROUND_Y - 0.1);
    sim.run(30);
    for (let bite = 0; bite < 3; bite++) {
      brain.needs.need_hunger = 5;
      brain.decideIn = 1;
      sim.run(12 * 60);
    }
    expect(named(log, 'bug_nibbled').map((e) => e.bites)).toEqual([1, 2]);
    expect(named(log, 'bug_ate').some((e) => e.itemId === leaf.id)).toBe(true);
    expect(sim.entities.has(leaf.id)).toBe(false);
    brain.leafy = 5;
    brain.needs = { need_hunger: 100, need_fun: 100, need_energy: 30, need_social: 100, need_clean: 100 };
    sim.send({ type: 'set_time', hour: 20.5 });
    sim.run(60 * 60);
    expect(sim.view(munch)!.bug!.form).toBe('cocoon');
    expect(sim.view(munch)!.bug!.mode).toBe('st_sleep');
    // Morning.
    sim.send({ type: 'set_time', hour: 8 });
    brain.needs.need_energy = 100;
    sim.run(3 * 60);
    expect(sim.view(munch)!.bug!.form).toBe('butterfly');
    expect(named(log, 'bug_changed').map((e) => e.form)).toEqual(['cocoon', 'butterfly']);
    expect(sim.secrets).toContain('secret_munch_butterfly');
  });

  it('Prim karate-chops a feather floating down past her', () => {
    const { sim, ids } = stage('prim-chop', [{ def: 'bug_mantis_prim', x: 5 }]);
    const prim = ids[0]!;
    sim.run(30);
    const log = record(sim);
    const v = sim.view(prim)!;
    const feather = sim.spawn('item', 'item_feather', v.x + 0.6, v.y - 2.2);
    sim.run(3 * 60);
    expect(named(log, 'bug_chopped').some((e) => e.id === prim && e.itemId === feather.id)).toBe(true);
    expect(named(log, 'bug_reacted').some((e) => e.id === prim && e.reaction === 'chop')).toBe(true);
  });

  it('Twig freezes whenever the hand is near, and moves about when it is far', () => {
    const { sim, ids } = stage('twig-shy', [{ def: 'bug_stickinsect_twig', x: 5 }]);
    const twig = ids[0]!;
    sim.entities.get(twig)!.bug!.needs.need_fun = 30;
    const v = sim.view(twig)!;
    sim.send({ type: 'hand', x: v.x + 1, y: v.y - 1 });
    sim.run(20);
    const xs: number[] = [];
    for (let t = 0; t < 40 * 60; t++) {
      const now = sim.view(twig)!;
      sim.send({ type: 'hand', x: now.x + 1, y: now.y - 1 });
      sim.step();
      xs.push(sim.view(twig)!.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.3);
    sim.send({ type: 'hand', x: null, y: null });
    const x0 = sim.view(twig)!.x;
    let moved = 0;
    for (let t = 0; t < 90 * 60; t++) {
      sim.step();
      moved = Math.max(moved, Math.abs(sim.view(twig)!.x - x0));
    }
    expect(moved).toBeGreaterThan(0.5);
  });

  it('bugs dance on the flowerpot stage, and three at once make a band', () => {
    const sim = openWorld('band');
    const log = record(sim);
    const stageX = fixture(sim, 'fix_flowerpot_stage').x;
    const dancers = ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_grasshopper_boing'].map(
      (d) => bugOf(sim, d)!.id,
    );
    for (const [i, id] of dancers.entries()) {
      place(sim, id, stageX - 1.5 + i * 1.5);
      const b = sim.entities.get(id)!.bug!;
      b.needs = { need_hunger: 100, need_fun: 20, need_energy: 100, need_social: 60, need_clean: 100 };
      b.decideIn = 1;
    }
    sim.run(30 * 60);
    expect(named(log, 'bug_used').some((e) => e.action === 'dance')).toBe(true);
    expect(named(log, 'band_played').length).toBeGreaterThanOrEqual(1);
    expect(sim.secrets).toContain('secret_band_of_three');
  });
});

describe('the flowerbed stage', () => {
  it('stage lights cycle off, warm, disco, spotlight; bluebell speakers click quiet and loud', () => {
    const sim = openWorld('lights');
    const lights = fixture(sim, 'fix_stage_lights');
    const modes: number[] = [];
    for (let i = 0; i < 5; i++) {
      sim.send({ type: 'poke', x: lights.x, y: lights.y });
      sim.step();
      modes.push(sim.places.state.stageLights);
    }
    expect(modes).toEqual([1, 2, 3, 0, 1]);
    const bell = fixture(sim, 'fix_bluebell_west');
    sim.send({ type: 'poke', x: bell.x, y: bell.y });
    sim.step();
    expect(sim.places.state.muted).toEqual(['fix_bluebell_west']);
    sim.send({ type: 'poke', x: bell.x, y: bell.y });
    sim.step();
    expect(sim.places.state.muted).toEqual([]);
  });

  it('paint puddles paint things their color; a bug with all five turns patchwork (secret)', () => {
    const sim = openWorld('paint');
    const log = record(sim);
    const red = fixture(sim, 'fix_paint_red');
    const cork = sim.spawn('item', 'item_cork', red.x, red.y - 0.6);
    sim.run(60);
    expect(sim.view(cork.id)!.paint).toEqual(['paint_red']);
    expect(sim.hasTag(cork.id, 'tag_painted')).toBe(true);
    const dot = bugOf(sim, 'bug_ladybug_dot')!;
    for (const id of [
      'fix_paint_red',
      'fix_paint_blue',
      'fix_paint_yellow',
      'fix_paint_white',
      'fix_paint_black',
    ]) {
      const p = fixture(sim, id);
      place(sim, dot.id, p.x);
      sim.run(20);
    }
    expect(sim.view(dot.id)!.paint!.sort()).toEqual([
      'paint_black',
      'paint_blue',
      'paint_red',
      'paint_white',
      'paint_yellow',
    ]);
    expect(sim.secrets).toContain('secret_paint_all_five');
    expect(named(log, 'painted').length).toBeGreaterThanOrEqual(6);
    // Water washes paint off.
    sim.physics.place(cork.id, POND_X + 14.9, 8, 0);
    sim.run(60);
    expect(sim.view(cork.id)!.paint).toBeUndefined();
  });

  it('three knocks on the gnome at night, and something knocks back (secret); by day it is just a knock', () => {
    const sim = openWorld('gnome');
    const log = record(sim);
    const gnome = fixture(sim, 'fix_gnome');
    for (let i = 0; i < 3; i++) {
      sim.send({ type: 'poke', x: gnome.x, y: gnome.y });
      sim.run(20);
    }
    sim.run(120);
    expect(named(log, 'gnome_knocked')).toHaveLength(3);
    expect(named(log, 'gnome_answered')).toHaveLength(0);
    sim.send({ type: 'set_time', hour: 22 });
    for (let i = 0; i < 3; i++) {
      sim.send({ type: 'poke', x: gnome.x, y: gnome.y });
      sim.run(20);
    }
    sim.run(120);
    expect(named(log, 'gnome_answered')).toHaveLength(1);
    expect(sim.secrets).toContain('secret_gnome_knock');
  });
});

describe('under the porch', () => {
  it('the porch lamp switches on and off, and warms bugs to each other at night (R16)', () => {
    const sim = openWorld('lamp');
    const lamp = fixture(sim, 'fix_porch_lamp');
    sim.send({ type: 'poke', x: lamp.x, y: lamp.y });
    sim.step();
    expect(sim.places.state.lampOn).toBe(true);
    expect(sim.places.lights()).toHaveLength(1);
    sim.send({ type: 'set_time', hour: 22 });
    const moose = bugOf(sim, 'bug_stagbeetle_moose')!;
    sim.cast.join(moose, 0, 0);
    place(sim, moose.id, lamp.x);
    sim.entities.get(moose.id)!.bug!.needs.need_social = 20;
    sim.entities.get(moose.id)!.bug!.needs.need_energy = 100;
    sim.run(60);
    expect(sim.entities.get(moose.id)!.bug!.needs.need_social).toBeGreaterThan(20);
    sim.send({ type: 'poke', x: lamp.x, y: lamp.y });
    sim.step();
    expect(sim.places.state.lampOn).toBe(false);
  });

  it('things drop through the floor gaps now and then; caught mid-air, one is an old coin (secret)', () => {
    const sim = openWorld('gaps');
    const log = record(sim);
    sim.places.state.gapNext = sim.tick + 5;
    sim.run(10);
    const [drop] = named(log, 'floor_dropped');
    expect(drop).toBeDefined();
    const id = drop!.id as number;
    sim.run(4);
    const v = sim.view(id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sim.entities.has(id)).toBe(false);
    const held = sim.view(sim.physics.grabbed!)!;
    expect(held.defId).toBe('item_old_coin');
    expect(sim.secrets).toContain('secret_floor_coin');
    // Things that land are ordinary.
    sim.send({ type: 'release' });
    sim.places.state.gapNext = sim.tick + 5;
    sim.run(4 * 60);
    const [, second] = named(log, 'floor_dropped');
    expect(sim.view(second!.id as number)?.defId).toBe(second!.defId);
    // Then the next one comes 30 to 90 s later.
    expect(sim.places.state.gapNext - sim.tick).toBeGreaterThan(0);
  });

  it('the cobweb hammock holds a thing a moment, then lets it drop; a bug put there naps', () => {
    const sim = openWorld('web');
    const log = record(sim);
    const web = fixture(sim, 'fix_cobweb_hammock');
    const pebble = sim.spawn('item', 'item_pebble', web.x, web.y - 1);
    sim.run(60);
    expect(sim.view(pebble.id)!.y).toBeLessThan(web.y + 0.3);
    sim.run(4 * 60);
    expect(sim.view(pebble.id)!.y).toBeGreaterThan(GROUND_Y - 0.6);
    expect(named(log, 'web_caught').map((e) => e.on)).toEqual([true, false]);
    const rollo = bugOf(sim, 'bug_pillbug_rollo')!;
    sim.physics.place(rollo.id, web.x, web.y - 1, 0);
    sim.run(4 * 60);
    expect(sim.view(rollo.id)!.bug!.mode).toBe('st_sleep');
    expect(sim.view(rollo.id)!.y).toBeLessThan(web.y + 0.2);
  });

  it('the spider waves back at a hand swaying to and fro under it (secret)', () => {
    const sim = openWorld('spider');
    const spider = fixture(sim, 'fix_spider');
    for (let i = 0; i < 12; i++) {
      sim.send({ type: 'hand', x: spider.x + (i % 2 === 0 ? -0.8 : 0.8), y: spider.y + 1.5 });
      sim.run(15);
    }
    expect(sim.secrets).toContain('secret_spider_wave');
  });
});

describe('the compost lab', () => {
  it('the warm heap makes things hot after 10 s and turns food to compost goo after a minute', () => {
    const sim = openWorld('heap');
    const heap = fixture(sim, 'fix_compost_heap');
    const barty = bugOf(sim, 'bug_dungbeetle_barty')!;
    sim.remove(barty.id);
    sim.remove(itemOf(sim, 'item_dung_ball').id);
    const pebble = sim.spawn('item', 'item_matchbox', heap.x - 0.6, 7.3);
    const berry = sim.spawn('item', 'item_apple_core', heap.x + 0.5, 7.4);
    for (const b of sim.entities.ofKind('bug')) sim.remove(b.id);
    sim.run(12 * 60);
    expect(sim.hasTag(pebble.id, 'tag_hot')).toBe(true);
    const log = record(sim);
    sim.run(55 * 60);
    expect(sim.entities.has(berry.id)).toBe(false);
    expect(
      named(log, 'item_transformed').some((e) => e.from === 'item_apple_core' && e.to === 'item_compost_goo'),
    ).toBe(true);
  });

  it('shelf jars refill their ingredient every 5 game minutes when it is gone', () => {
    const sim = openWorld('jars');
    const mushroom = itemOf(sim, 'item_mushroom_cap');
    sim.remove(mushroom.id);
    const log = record(sim);
    sim.run(6 * 60 * 60);
    expect(named(log, 'jar_refilled').map((e) => e.defId)).toContain('item_mushroom_cap');
    expect(named(log, 'jar_refilled').filter((e) => e.defId === 'item_moss_tuft')).toHaveLength(0);
  });
});

describe('the treehouse arcade', () => {
  it('track pieces let go near the pegboard snap to its grid at 0, 45, or 90 degrees and stay put', () => {
    const sim = openWorld('peg');
    const board = fixture(sim, 'fix_pegboard');
    const piece = sim.spawn('item', 'item_marble_track_straight', board.x + 1.13, board.y - 0.5);
    sim.physics.place(piece.id, board.x + 1.13, board.y - 0.47, 0.5);
    sim.send({ type: 'grab', x: board.x + 1.13, y: board.y - 0.47 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    const v = sim.view(piece.id)!;
    expect(v.pinned).toBe(true);
    expect(v.angle).toBeCloseTo(Math.PI / 4, 5);
    sim.run(5 * 60);
    expect(sim.view(piece.id)!.x).toBeCloseTo(v.x, 5);
    expect(sim.view(piece.id)!.y).toBeCloseTo(v.y, 5);
    // A marble dropped on it rolls along it.
    const marble = sim.spawn('item', 'item_marble_blue', v.x - 0.4, v.y - 0.8);
    sim.run(60);
    expect(sim.view(marble.id)!.x).toBeGreaterThan(v.x);
    // Grabbing it takes it off the board.
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sim.view(piece.id)!.pinned).toBeUndefined();
  });

  it('the bead pit is full of beads once the treehouse opens, and things sink into it', () => {
    const locked = Sim.create({ seed: 'beads-locked' });
    expect(locked.places.beads).toHaveLength(0);
    const sim = openWorld('beads');
    expect(sim.places.beads.length).toBeGreaterThan(60);
    const pit = fixture(sim, 'fix_bead_pit');
    sim.run(120);
    const marble = sim.spawn('item', 'item_marble_green', pit.x, 5);
    sim.run(3 * 60);
    expect(sim.view(marble.id)!.y).toBeGreaterThan(sim.surfaceY(pit.x - 3.2) + 0.3);
  });

  it('the claw grabs a prize under it; after two misses the third try always wins', () => {
    const sim = openWorld('claw');
    const button = fixture(sim, 'fix_claw_button');
    const log = record(sim);
    // The first go finds Prim.
    sim.send({ type: 'poke', x: button.x, y: button.y });
    sim.run(8 * 60);
    expect(sim.cast.joined('bug_mantis_prim')).toBe(true);
    const phases = (): string[] => named(log, 'claw_moved').map((e) => e.phase as string);
    // Clear out the prizes but one, far to one side: misses, until the third try.
    const jar = sim.places.jar()!;
    const prizes = sim.entities
      .ofKind('item')
      .filter((e) => {
        const v = sim.view(e.id)!;
        return v.x > jar.x0 && v.x < jar.x1 && v.y > jar.top;
      })
      .map((e) => e.id);
    for (const id of prizes.slice(1)) sim.remove(id);
    place(sim, prizes[0]!, jar.x0 + 0.3);
    let tries = 0;
    while (tries < 3 && !phases().slice(3).includes('prize')) {
      // Wait for the claw to sweep far from the prize before pressing.
      for (let t = 0; t < 1500; t++) {
        sim.step();
        const tip = sim.places.clawTip()!;
        if (sim.places.state.claw.phase === 'idle' && tip.x > jar.x1 - 0.5) break;
      }
      sim.send({ type: 'poke', x: button.x, y: button.y });
      sim.run(8 * 60);
      tries++;
    }
    expect(
      phases()
        .slice(3)
        .filter((p) => p === 'miss'),
    ).toHaveLength(2);
    expect(phases().slice(3)).toContain('prize');
    expect(tries).toBe(3);
  });

  it('twelve dominoes toppling in a chain ring the bell (secret)', () => {
    const sim = openWorld('dominoes');
    sim.run(60);
    const dominoes = sim.entities.ofKind('item').filter((e) => e.defId === 'item_domino');
    expect(dominoes).toHaveLength(12);
    // Tip the first one toward the rest.
    const first = sim.view(dominoes[0]!.id)!;
    sim.physics.place(dominoes[0]!.id, first.x + 0.05, first.y, 0.4);
    sim.run(8 * 60);
    expect(sim.secrets).toContain('secret_domino_chain');
  });
});

describe('save version 8', () => {
  it('moves a version 7 world 32 m right for the flowerbed, and builds the four new areas, locked', () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'save-v7.json'), 'utf8'));
    const save = loadSaveFile(JSON.stringify(raw));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.view.cameraX).toBeCloseTo(raw.view.cameraX + 32, 9);
    raw.world.entities.forEach((e: { id: number; body: { x: number } }, i: number) => {
      expect(save.world.entities[i]!.id).toBe(e.id);
      expect(save.world.entities[i]!.body.x).toBeCloseTo(e.body.x + 32, 9);
    });
    expect(save.world.built).toEqual(['area_puddle_pond', 'area_stump_plaza']);
    const sim = Sim.load(save.world);
    // Everything that was in the pond is still in the pond.
    for (const e of raw.world.entities as { id: number; body: { x: number } }[]) {
      const v = sim.view(e.id);
      if (!v) continue;
      expect(sim.areaOf(v.x).id).toBe(sim.areaOf(e.body.x + 32).id);
    }
    expect(sim.built.sort()).toEqual(sim.content.areas.all.map((a) => a.id).sort());
    expect(itemOf(sim, 'item_lattice_panel')).toBeDefined();
    expect(sim.cast.present('bug_stickinsect_twig')).toBe(true);
    expect(sim.cast.present('bug_stagbeetle_moose')).toBe(true);
    for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      expect(sim.barriers.isOpen(a)).toBe(false);
    sim.run(10 * 60);
    expect(sim.rescues).toBe(0);
    const again = reload(sim);
    expect(again.entities.size).toBe(sim.entities.size);
  });

  it('keeps paint, pinned track, nibbled leaves, the lift, and the places through a save and load', () => {
    const sim = openWorld('keep8');
    const cork = sim.spawn('item', 'item_cork', PLAZA_X + 3, 8);
    sim.places.paint(sim.entities.get(cork.id)!, 'paint_blue', 0, 0);
    const leaf = itemOf(sim, 'item_leaf');
    sim.entities.get(leaf.id)!.bites = 2;
    sim.places.state.lampOn = true;
    sim.places.state.stageLights = 2;
    sim.run(30);
    const loaded = reload(sim);
    expect(loaded.view(cork.id)!.paint).toEqual(['paint_blue']);
    expect(loaded.view(leaf.id)!.bites).toBe(2);
    expect(loaded.places.state.lampOn).toBe(true);
    expect(loaded.places.state.stageLights).toBe(2);
    const pinned = loaded.entities.ofKind('item').filter((e) => e.pinned);
    expect(pinned.length).toBe(2);
    for (const e of pinned) expect(loaded.physics.isPinned(e.id)).toBe(true);
    expect(loaded.barriers.state.lift).toEqual(sim.barriers.state.lift);
    // And both carry on alike.
    sim.run(300);
    loaded.run(300);
    expect(JSON.stringify(loaded.serialize().places)).toBe(JSON.stringify(sim.serialize().places));
  });

  it('two worlds with the same seed stay identical through the new areas', () => {
    const a = openWorld('twins7');
    const b = openWorld('twins7');
    for (const s of [a, b]) {
      const lamp = fixture(s, 'fix_porch_lamp');
      s.send({ type: 'poke', x: lamp.x, y: lamp.y });
      s.run(20 * 60);
    }
    expect(JSON.stringify(a.serialize())).toBe(JSON.stringify(b.serialize()));
  });
});
