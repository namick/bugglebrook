import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { SEAL } from '../../src/game/data/hiddenAreas';
import { CONVEYOR_SPEED, SUGAR_CARRY } from '../../src/game/systems/depths';
import { NOSE_HOLE } from '../../src/game/systems/hollow';
import { DEPTHS_X, HOLLOW_X, PLAZA_X } from './world';

// M10's hidden areas (game design doc, section 3, areas 7 and 8): the Ant
// Hill Depths and Gnome Hollow, their doorways, and their secrets.

const DEPTHS = 'area_ant_hill_depths';
const HOLLOW = 'area_gnome_hollow';
const FLOWERBED_X = 0;

function world(seed = 'hidden'): Sim {
  const sim = Sim.create({ seed });
  sim.step();
  return sim;
}

/** Open an area the way a solved barrier or secret would. */
function unlock(sim: Sim, area: string): void {
  sim.send({ type: 'unlock', area });
  sim.step();
}

/**
 * Open an area without finding the secret that opens it, to show that the
 * secrets inside wait for their prerequisites.
 */
function openQuietly(sim: Sim, area: string): void {
  sim.barriers.state.open.push(area);
  sim.barriers.restore(sim.barriers.state);
}

/** Look at a spot, so its area wakes and the rest sleep, as the camera would. */
function lookAt(sim: Sim, x: number): void {
  sim.send({ type: 'focus', x0: x - 9.6, x1: x + 9.6 });
  sim.step();
}

/** Is the secret's journal entry discovered? */
function inBook(sim: Sim, id: string): boolean {
  return sim.book().secrets.find((e) => e.id === id)?.state === 'discovered';
}

/** A full round trip through the save format, as the game writes it. */
function serializeSave(sim: Sim): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    savedAt: '2026-10-02T00:00:00.000Z',
    world: sim.serialize(),
    view: { cameraX: 40 },
    meta: { createdAt: '2026-10-01T00:00:00.000Z', thumb: null },
  });
}

const items = (sim: Sim, defId: string): Entity[] =>
  sim.entities.ofKind('item').filter((e) => e.defId === defId);

describe('the hidden areas', () => {
  it('lie past the strip, each sealed: its own open stretch and camera region', () => {
    const sim = world();
    const house = sim.content.areas.get('area_treehouse_arcade');
    expect(DEPTHS_X).toBe(house.xEnd);
    expect(sim.content.areas.get(DEPTHS).xEnd).toBe(HOLLOW_X);
    expect(sim.barriers.span().x1).toBeLessThanOrEqual(house.xEnd);
    expect(sim.barriers.span(DEPTHS_X + 10)).toEqual({ x0: DEPTHS_X + SEAL, x1: HOLLOW_X });
    expect(sim.barriers.span(HOLLOW_X + 5)).toEqual({ x0: HOLLOW_X + SEAL, x1: sim.worldWidth });
    expect(sim.barriers.region(PLAZA_X + 5)).toEqual({ x0: 0, x1: house.xEnd });
    expect(sim.barriers.region(DEPTHS_X + 5)).toEqual({ x0: DEPTHS_X, x1: HOLLOW_X });
    expect(sim.barriers.view(HOLLOW_X + 5)).toEqual({ x0: HOLLOW_X, x1: sim.worldWidth });
  });

  it('keep everything in: a hard fling never gets out of the depths or the hollow', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    const pebbles = [
      sim.spawn('item', 'item_pebble', DEPTHS_X + 1.5, GROUND_Y - 0.5),
      sim.spawn('item', 'item_pebble', DEPTHS_X + 24.5, GROUND_Y - 0.5),
      sim.spawn('item', 'item_pebble', HOLLOW_X + 1.5, GROUND_Y - 0.5),
      sim.spawn('item', 'item_pebble', HOLLOW_X + 18.5, GROUND_Y - 0.5),
    ];
    sim.physics.setVelocity(pebbles[0]!.id, -28, -20);
    sim.physics.setVelocity(pebbles[1]!.id, 28, -20);
    sim.physics.setVelocity(pebbles[2]!.id, -28, -25);
    sim.physics.setVelocity(pebbles[3]!.id, 28, -25);
    sim.run(240);
    const [a, b, c, d] = pebbles.map((p) => sim.physics.getState(p.id));
    expect(a!.x).toBeGreaterThan(DEPTHS_X + SEAL - 0.05);
    expect(b!.x).toBeLessThan(HOLLOW_X);
    expect(c!.x).toBeGreaterThan(HOLLOW_X + SEAL - 0.05);
    expect(d!.x).toBeLessThan(sim.worldWidth);
    for (const s of [a, b, c, d]) expect(s!.y).toBeGreaterThan(0.5);
    expect(sim.bounds.returned).toBe(0);
  });

  it('start with their things: crumbs and a foil crown below, the fourth map scrap on the shelf', () => {
    const sim = world();
    const inDepths = (e: Entity): boolean => {
      const x = sim.physics.getState(e.id).x;
      return x > DEPTHS_X && x < HOLLOW_X;
    };
    expect(items(sim, 'item_ant_crumb').filter(inDepths)).toHaveLength(6);
    expect(items(sim, 'item_acc_crown_foil').filter(inDepths)).toHaveLength(1);
    const scrap = items(sim, 'item_map_scrap_4')[0]!;
    expect(sim.physics.getState(scrap.id).x).toBeGreaterThan(HOLLOW_X);
    // Nothing that a secret gives is there yet.
    for (const id of ['item_gnome_nose', 'item_acc_monocle', 'item_map_scrap_2'])
      expect(items(sim, id)).toEqual([]);
    sim.run(120);
    expect(sim.rescues).toBe(0);
    expect(sim.bounds.returned).toBe(0);
  });

  it('sleep unless the camera is inside, and then the rest of the world sleeps', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, PLAZA_X + 19);
    expect(sim.isAreaAsleep(DEPTHS)).toBe(true);
    expect(sim.isAreaAsleep(HOLLOW)).toBe(true);
    // The treehouse is right next door in x, but a world apart.
    lookAt(sim, DEPTHS_X + 9.6);
    expect(sim.isAreaAsleep(DEPTHS)).toBe(false);
    expect(sim.isAreaAsleep('area_treehouse_arcade')).toBe(true);
    expect(sim.isAreaAsleep('area_stump_plaza')).toBe(true);
  });

  it('give a bug inside its own reach, and no pull toward a home it cannot get to', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 9.6);
    const dot = sim.spawn('bug', 'bug_ladybug_dot', DEPTHS_X + 2, GROUND_Y - 0.4);
    for (let i = 0; i < 40; i++) {
      sim.run(30);
      const x = sim.physics.getState(dot.id).x;
      expect(x).toBeGreaterThan(DEPTHS_X + SEAL - 0.05);
      expect(x).toBeLessThan(HOLLOW_X);
    }
  });
});

describe('doorways', () => {
  it('stay shut until the hidden area opens, then carry what the hand holds through and back', () => {
    const sim = world();
    const hill = sim.hidden.door('fix_ant_hill')!;
    expect(sim.hidden.doorOpen('fix_ant_hill')).toBe(false);
    expect(sim.hidden.doorAt(hill.x, hill.y)).toBeNull();
    unlock(sim, DEPTHS);
    expect(sim.hidden.doorAt(hill.x, hill.y)?.id).toBe('fix_ant_hill');
    const pebble = sim.spawn('item', 'item_pebble', hill.x + 0.5, GROUND_Y - 0.3);
    sim.step();
    const at = sim.physics.getState(pebble.id);
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.step();
    sim.send({ type: 'travel', door: 'fix_ant_hill' });
    sim.step();
    const shaft = sim.hidden.door('fix_depths_shaft')!;
    let s = sim.physics.getState(pebble.id);
    expect(sim.physics.grabbed).toBe(pebble.id);
    expect(Math.abs(s.x - shaft.x)).toBeLessThan(0.6);
    expect(sim.areaOf(s.x).id).toBe(DEPTHS);
    // It cannot be dragged out through the wall.
    sim.send({ type: 'drag', x: DEPTHS_X - 5, y: 3 });
    sim.run(30);
    s = sim.physics.getState(pebble.id);
    expect(s.x).toBeGreaterThan(DEPTHS_X + SEAL - 0.05);
    sim.send({ type: 'travel', door: 'fix_depths_shaft' });
    sim.step();
    s = sim.physics.getState(pebble.id);
    expect(sim.areaOf(s.x).id).toBe('area_stump_plaza');
    expect(sim.physics.grabbed).toBe(pebble.id);
  });
});

describe('secret_ant_sugar', () => {
  it('ignores the plaza sugar cube nobody touched, even next to the hill', () => {
    const sim = world();
    const door = sim.hidden.depths.hillDoor()!;
    const cube = sim.spawn('item', 'item_sugar_cube', door.x + 1.2, GROUND_Y - 0.3);
    sim.run(SUGAR_CARRY * 3);
    expect(sim.entities.has(cube.id)).toBe(true);
    expect(sim.barriers.isOpen(DEPTHS)).toBe(false);
  });

  it('the player puts sugar by the hill: the ants carry it in and the depths open', () => {
    const sim = world();
    const door = sim.hidden.depths.hillDoor()!;
    const cube = sim.spawn('item', 'item_sugar_cube', door.x + 2.5, GROUND_Y - 0.3);
    sim.run(20);
    const s = sim.physics.getState(cube.id);
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(20);
    expect(sim.hidden.depths.state.sugar?.id).toBe(cube.id);
    sim.run(SUGAR_CARRY + 10);
    expect(sim.entities.has(cube.id)).toBe(false);
    expect(sim.barriers.isOpen(DEPTHS)).toBe(true);
    expect(sim.secrets).toContain('secret_ant_sugar');
    expect(inBook(sim, 'secret_ant_sugar')).toBe(true);
    expect(sim.hidden.doorOpen('fix_ant_hill')).toBe(true);
  });

  it('too far away (more than 3 m), the ants never notice', () => {
    const sim = world();
    const door = sim.hidden.depths.hillDoor()!;
    const cube = sim.spawn('item', 'item_sugar_cube', door.x + 3.6, GROUND_Y - 0.3);
    sim.send({ type: 'set_tag', id: cube.id, tag: 'tag_player_setup', on: true });
    sim.run(SUGAR_CARRY * 2);
    expect(sim.barriers.isOpen(DEPTHS)).toBe(false);
  });
});

/** The queen's throne top, and a spot just over it. */
function overThrone(sim: Sim): { x: number; y: number } {
  const q = sim.places.fixtures('ant_queen')[0]!;
  return { x: q.x, y: 7.6 };
}

describe('secret_queen_sweet', () => {
  it('something sweet on the throne: she eats it, dances, and gives the monocle (once)', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    const at = overThrone(sim);
    const bean = sim.spawn('item', 'item_honey_drop', at.x, at.y);
    sim.run(60);
    expect(sim.entities.has(bean.id)).toBe(false);
    expect(sim.hidden.depths.state.queenFed).toBe(1);
    expect(sim.secrets).toContain('secret_queen_sweet');
    expect(inBook(sim, 'secret_queen_sweet')).toBe(true);
    expect(items(sim, 'item_acc_monocle')).toHaveLength(1);
    sim.spawn('item', 'item_sugar_cube', at.x, at.y);
    sim.run(60);
    expect(sim.hidden.depths.state.queenFed).toBe(2);
    expect(items(sim, 'item_acc_monocle')).toHaveLength(1);
  });

  it('turns down things that are not sweet', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    const at = overThrone(sim);
    const pebble = sim.spawn('item', 'item_pebble', at.x, at.y);
    sim.run(60);
    expect(sim.entities.has(pebble.id)).toBe(true);
    expect(sim.secrets).not.toContain('secret_queen_sweet');
  });

  it('cannot fire before secret_ant_sugar', () => {
    const sim = world();
    openQuietly(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    const at = overThrone(sim);
    sim.spawn('item', 'item_honey_drop', at.x, at.y);
    sim.run(60);
    expect(sim.secrets).not.toContain('secret_queen_sweet');
    expect(items(sim, 'item_acc_monocle')).toEqual([]);
  });
});

/** A bug standing on the bottom tunnel's floor, just touching the root knot on its left. */
function atRoot(sim: Sim, defId: string): Entity {
  const knot = sim.content.areas.get(DEPTHS).solids!.find((s) => s.id === 'solid_root_knot')!.box!;
  const r = sim.content.bugs.get(defId).radius;
  const x = DEPTHS_X + knot[0] - r - 0.05;
  return sim.spawn('bug', defId, x, GROUND_Y - r - 0.05);
}

describe('secret_root_pull', () => {
  it('Moose at the root knot pulls it free, and the gnome nose rolls out', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    atRoot(sim, 'bug_stagbeetle_moose');
    sim.run(30);
    expect(sim.hidden.depths.rootStuck).toBe(false);
    expect(sim.secrets).toContain('secret_root_pull');
    expect(inBook(sim, 'secret_root_pull')).toBe(true);
    const nose = items(sim, 'item_gnome_nose');
    expect(nose).toHaveLength(1);
    expect(sim.physics.hasPlatform('solid_root_knot')).toBe(false);
  });

  it('a small bug cannot; a giant one can', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    const dot = atRoot(sim, 'bug_ladybug_dot');
    sim.run(60);
    expect(sim.hidden.depths.rootStuck).toBe(true);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_giant' });
    sim.run(20);
    // Grown, set back against the knot.
    const knot = sim.content.areas.get(DEPTHS).solids!.find((q) => q.id === 'solid_root_knot')!.box!;
    const r = sim.halfHeight(dot);
    sim.physics.place(dot.id, DEPTHS_X + knot[0] - r - 0.05, GROUND_Y - r - 0.05, 0);
    sim.run(30);
    expect(sim.hidden.depths.rootStuck).toBe(false);
  });

  it('cannot fire before secret_ant_sugar', () => {
    const sim = world();
    openQuietly(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    atRoot(sim, 'bug_stagbeetle_moose');
    sim.run(60);
    expect(sim.hidden.depths.rootStuck).toBe(true);
    expect(items(sim, 'item_gnome_nose')).toEqual([]);
  });

  it('stays pulled after a save', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    atRoot(sim, 'bug_stagbeetle_moose');
    sim.run(30);
    const again = Sim.load(loadSaveFile(serializeSave(sim)).world);
    expect(again.physics.hasPlatform('solid_root_knot')).toBe(false);
    expect(again.hidden.depths.rootStuck).toBe(false);
  });
});

/** A pattern on the flowerbed's sequencer, as the player would cap it. */
function playMusic(sim: Sim): void {
  const rows = sim.places.sequencer.patterns[sim.places.sequencer.current];
  rows[0] = 0b10101010;
  rows[5] = 0b00010001;
}

describe('secret_ant_conga', () => {
  it('the sequencer playing through the bluebells while the player is in the depths: a conga', () => {
    const sim = world();
    unlock(sim, 'area_flowerbed_stage');
    unlock(sim, DEPTHS);
    playMusic(sim);
    lookAt(sim, DEPTHS_X + 9.6);
    sim.run(60);
    expect(sim.hidden.depths.state.conga).toBe(true);
    expect(sim.secrets).toContain('secret_ant_conga');
    expect(inBook(sim, 'secret_ant_conga')).toBe(true);
  });

  it('not with both speakers quiet, nor from up in the plaza', () => {
    const sim = world();
    unlock(sim, 'area_flowerbed_stage');
    unlock(sim, DEPTHS);
    playMusic(sim);
    lookAt(sim, PLAZA_X + 19);
    sim.run(60);
    expect(sim.hidden.depths.state.conga).toBe(false);
    sim.places.state.muted = sim.places.fixtures('bluebell').map((b) => b.fixture.id);
    lookAt(sim, DEPTHS_X + 9.6);
    sim.run(60);
    expect(sim.hidden.depths.state.conga).toBe(false);
    expect(sim.secrets).not.toContain('secret_ant_conga');
  });

  it('cannot fire before secret_ant_sugar', () => {
    const sim = world();
    unlock(sim, 'area_flowerbed_stage');
    openQuietly(sim, DEPTHS);
    playMusic(sim);
    lookAt(sim, DEPTHS_X + 9.6);
    sim.run(60);
    expect(sim.secrets).not.toContain('secret_ant_conga');
  });
});

describe('secret_map_scrap_2', () => {
  it('at night, with the ants asleep, the scrap is on top of the pantry pile', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 9.6);
    sim.run(60);
    expect(items(sim, 'item_map_scrap_2')).toEqual([]);
    sim.send({ type: 'set_time', hour: 23 });
    sim.run(60);
    expect(items(sim, 'item_map_scrap_2')).toHaveLength(1);
    expect(sim.secrets).toContain('secret_map_scrap_2');
    expect(inBook(sim, 'secret_map_scrap_2')).toBe(true);
    sim.run(120);
    const s = sim.physics.getState(items(sim, 'item_map_scrap_2')[0]!.id);
    // Resting on the pile, inside the pantry.
    expect(s.x).toBeGreaterThan(DEPTHS_X + 5.6);
    expect(s.x).toBeLessThan(DEPTHS_X + 9.4);
    expect(s.y).toBeLessThan(GROUND_Y);
  });

  it('cannot fire before secret_ant_sugar', () => {
    const sim = world();
    openQuietly(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 9.6);
    sim.send({ type: 'set_time', hour: 23 });
    sim.run(60);
    expect(items(sim, 'item_map_scrap_2')).toEqual([]);
  });
});

describe('the ant line', () => {
  it('passes a small thing left along the middle tunnel into the pantry', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 9.6);
    const line = sim.places.fixtures('ant_conveyor')[0]!;
    const crumb = sim.spawn('item', 'item_pebble', line.x + 2, line.fixture.y - 0.2);
    sim.run(30);
    const s0 = sim.physics.getState(crumb.id);
    expect(s0.vx).toBeLessThan(-CONVEYOR_SPEED * 0.5);
    sim.run(60 * 8);
    // Off the line at its left end, down into the pantry, and rolled off the pile.
    const s = sim.physics.getState(crumb.id);
    expect(s.x).toBeGreaterThan(DEPTHS_X + 5.6);
    expect(s.x).toBeLessThan(DEPTHS_X + 10.5);
    expect(s.y).toBeGreaterThan(line.fixture.y + 2);
    expect(sim.hidden.depths.riding.has(crumb.id)).toBe(false);
  });
});

/** Everything the gnome's nose needs: the depths found and the root pulled. */
function noseReady(sim: Sim): Entity {
  unlock(sim, 'area_flowerbed_stage');
  unlock(sim, DEPTHS);
  sim.findSecret('secret_root_pull', 0, 0);
  return sim.spawn('item', 'item_gnome_nose', FLOWERBED_X + 6, GROUND_Y - 1);
}

/** Carry a thing to (x, y) in the hand and let go gently. */
function carryTo(sim: Sim, e: Entity, x: number, y: number): void {
  const s = sim.physics.getState(e.id);
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  for (let i = 0; i < 90; i++) {
    sim.send({ type: 'drag', x, y });
    sim.step();
  }
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

describe('secret_gnome_inside', () => {
  it('the nose back in its hole: a sneeze, the hat opens, and Gnome Hollow is open', () => {
    const sim = world();
    const nose = noseReady(sim);
    sim.run(30);
    expect(sim.journal.state.noticed).toContain('nose_carried');
    carryTo(sim, nose, FLOWERBED_X + NOSE_HOLE.x, NOSE_HOLE.y);
    expect(sim.entities.has(nose.id)).toBe(false);
    expect(sim.barriers.isOpen(HOLLOW)).toBe(true);
    expect(sim.secrets).toContain('secret_gnome_inside');
    expect(inBook(sim, 'secret_gnome_inside')).toBe(true);
    expect(sim.hidden.doorOpen('fix_gnome_hat')).toBe(true);
    expect(sim.hidden.hollow.noseOn).toBe(true);
  });

  it('a nose let go elsewhere just falls', () => {
    const sim = world();
    const nose = noseReady(sim);
    carryTo(sim, nose, FLOWERBED_X + 9, 7);
    expect(sim.entities.has(nose.id)).toBe(true);
    expect(sim.barriers.isOpen(HOLLOW)).toBe(false);
  });

  it('cannot fire before secret_root_pull', () => {
    const sim = world();
    unlock(sim, 'area_flowerbed_stage');
    unlock(sim, DEPTHS);
    const nose = sim.spawn('item', 'item_gnome_nose', FLOWERBED_X + 6, GROUND_Y - 1);
    carryTo(sim, nose, FLOWERBED_X + NOSE_HOLE.x, NOSE_HOLE.y);
    expect(sim.entities.has(nose.id)).toBe(true);
    expect(sim.barriers.isOpen(HOLLOW)).toBe(false);
    expect(sim.secrets).not.toContain('secret_gnome_inside');
  });

  it('the hollow, once open, is reached through the hat and left through its door', () => {
    const sim = world();
    const nose = noseReady(sim);
    carryTo(sim, nose, FLOWERBED_X + NOSE_HOLE.x, NOSE_HOLE.y);
    const to = sim.hidden.travel('fix_gnome_hat');
    expect(to?.id).toBe('fix_hollow_door');
    expect(sim.areaOf(to!.x).id).toBe(HOLLOW);
    expect(sim.hidden.travel('fix_hollow_door')?.id).toBe('fix_gnome_hat');
  });
});

describe('secret_constellations', () => {
  it('a look through the telescope', () => {
    const sim = world();
    const nose = noseReady(sim);
    carryTo(sim, nose, FLOWERBED_X + NOSE_HOLE.x, NOSE_HOLE.y);
    lookAt(sim, HOLLOW_X + 9.6);
    const tel = sim.places.fixtures('telescope')[0]!;
    sim.send({ type: 'poke', x: tel.x, y: tel.fixture.y });
    sim.step();
    expect(sim.secrets).toContain('secret_constellations');
    expect(inBook(sim, 'secret_constellations')).toBe(true);
  });

  it('cannot fire before secret_gnome_inside', () => {
    const sim = world();
    openQuietly(sim, HOLLOW);
    lookAt(sim, HOLLOW_X + 9.6);
    const tel = sim.places.fixtures('telescope')[0]!;
    sim.send({ type: 'poke', x: tel.x, y: tel.fixture.y });
    sim.step();
    expect(sim.secrets).not.toContain('secret_constellations');
  });
});

describe('the moon pedestal', () => {
  it('holds the golden marble in its cup', () => {
    const sim = world();
    openQuietly(sim, HOLLOW);
    lookAt(sim, HOLLOW_X + 9.6);
    const cup = sim.hidden.hollow.cup()!;
    const marble = sim.spawn('item', 'item_marble_gold', cup.x + 0.1, cup.y - 0.4);
    sim.run(60);
    const s = sim.physics.getState(marble.id);
    expect(marble.pinned).toBe(true);
    expect(Math.abs(s.x - cup.x)).toBeLessThan(0.05);
  });
});

describe('saves', () => {
  it('a save from before the hidden areas gets them built on load', () => {
    const sim = world();
    const save = sim.serialize();
    // As written before M10: no hidden state, and the two areas not built.
    delete save.hidden;
    save.built = (save.built ?? []).filter((a) => a !== DEPTHS && a !== HOLLOW);
    save.entities = save.entities.filter((e) => e.body.x < DEPTHS_X);
    const again = Sim.load(save);
    expect(
      items(again, 'item_ant_crumb').filter((e) => again.physics.getState(e.id).x > DEPTHS_X),
    ).toHaveLength(6);
    expect(items(again, 'item_map_scrap_4')).toHaveLength(1);
    expect(again.built).toContain(DEPTHS);
    expect(again.hidden.depths.state.queenFed).toBe(0);
  });

  it('keeps the queen fed count and the ants mid-carry round a save', () => {
    const sim = world();
    unlock(sim, DEPTHS);
    lookAt(sim, DEPTHS_X + 15);
    const at = overThrone(sim);
    sim.spawn('item', 'item_honey_drop', at.x, at.y);
    sim.run(60);
    const again = Sim.load(loadSaveFile(serializeSave(sim)).world);
    expect(again.hidden.depths.state.queenFed).toBe(1);
  });
});
