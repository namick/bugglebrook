import { describe, expect, it } from 'vitest';
import { CONTENT, GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import {
  BOOT_CLICKS,
  CHORD_WINDOW,
  CLAW_STREAK,
  DANCE_TICKS,
  FROG_POKES,
  SLIDE_RIDES,
  TUNE_HITS,
  WINDOW_CLICKS,
} from '../../src/game/systems/clues';
import { POND, PLAZA_X } from './world';

// M10's secrets in the open areas (game design doc, section 12). Each test
// sets up the prerequisites, performs the trigger, and checks the result and
// the journal entry; secrets with prerequisites are also tried without them.

function world(seed: string, areas: readonly string[] = []): Sim {
  const sim = Sim.empty({ seed });
  for (const area of areas) sim.send({ type: 'unlock', area });
  sim.step();
  return sim;
}

function put(sim: Sim, defId: string, x: number, y?: number): Entity {
  const half = sim.halfHeightOfDef(defId);
  return sim.spawn('item', defId, x, y ?? sim.surfaceY(x) - half - 0.02);
}

function bugAt(sim: Sim, defId: string, x: number, y?: number): Entity {
  const b = sim.spawn('bug', defId, x, y ?? GROUND_Y - 0.6);
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  return b;
}

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

/** A fixture's world spot. */
function spot(sim: Sim, id: string): { x: number; y: number; r: number } {
  for (const a of sim.content.areas.all)
    for (const f of a.fixtures ?? []) if (f.id === id) return { x: a.xStart + f.x, y: f.y, r: f.radius };
  throw new Error(id);
}

const items = (sim: Sim, defId: string): Entity[] =>
  sim.entities.ofKind('item').filter((e) => e.defId === defId);

/** The secret is logged and its journal entry is discovered. */
function expectFound(sim: Sim, id: string): void {
  expect(sim.secrets).toContain(id);
  sim.step();
  expect(sim.book().secrets.find((s) => s.id === id)?.state).toBe('discovered');
}

/** Find a secret's prerequisites (and theirs) directly. */
function grant(sim: Sim, id: string): void {
  for (const r of CONTENT.secrets.get(id).requires ?? []) {
    grant(sim, r);
    sim.findSecret(r, 0, 0);
  }
}

describe('the pond', () => {
  it('three clicks on the sunken boot tip out a tiny key on a cork', () => {
    const sim = world('boot');
    const boot = spot(sim, 'fix_rubber_boot');
    for (let i = 0; i < BOOT_CLICKS; i++) {
      sim.send({ type: 'poke', x: boot.x, y: boot.y });
      sim.run(10);
    }
    expect(items(sim, 'item_key_tiny')).toHaveLength(1);
    expectFound(sim, 'secret_boot_key');
    expect(sim.book().items.find((i) => i.id === 'item_key_tiny')!.state).toBe('discovered');
    // The key floats: after a while it is at the surface, not on the bottom.
    sim.run(600);
    const key = sim.physics.getState(items(sim, 'item_key_tiny')[0]!.id);
    expect(key.y).toBeLessThan(POND.level + 0.3);
    // The boot only tips once.
    for (let i = 0; i < BOOT_CLICKS; i++) sim.send({ type: 'poke', x: boot.x, y: boot.y });
    sim.run(10);
    expect(items(sim, 'item_key_tiny')).toHaveLength(1);
  });

  it('three old coins in the teacup bring up the frog king, but only after the stump door', () => {
    const sim = world('coins');
    const cup = spot(sim, 'fix_sunken_teacup');
    const drop = (): void => {
      for (let i = 0; i < 3; i++) {
        sim.spawn('item', 'item_old_coin', cup.x, POND.level - 0.5);
        sim.run(200);
      }
    };
    drop();
    expect(sim.secrets).not.toContain('secret_teacup_coins');
    expect(items(sim, 'item_hat_bubble')).toHaveLength(0);
    grant(sim, 'secret_teacup_coins');
    const log = record(sim);
    sim.run(30);
    expect(named(log, 'frog_king')).toHaveLength(1);
    expect(items(sim, 'item_hat_bubble')).toHaveLength(1);
    expect(items(sim, 'item_old_coin')).toHaveLength(0);
    expectFound(sim, 'secret_teacup_coins');
  });

  it('five skips in one throw', () => {
    const sim = world('skips');
    sim.events.emit('skipped', { id: 1, x: POND.middle, y: POND.level, count: 4 });
    sim.step();
    expect(sim.secrets).not.toContain('secret_skip_stone');
    sim.events.emit('skipped', { id: 1, x: POND.middle, y: POND.level, count: 5 });
    sim.step();
    expectFound(sim, 'secret_skip_stone');
  });

  it('five pokes at the frog eyes make a huge ribbit, and every bug jumps', () => {
    const sim = world('frog');
    const eyes = spot(sim, 'fix_frog_eyes');
    const dot = bugAt(sim, 'bug_ladybug_dot', POND.x0 - 1.5);
    sim.run(60);
    const log = record(sim);
    for (let i = 0; i < FROG_POKES; i++) {
      sim.send({ type: 'poke', x: eyes.x, y: eyes.y });
      sim.run(5);
    }
    expect(named(log, 'frog_ribbited')).toHaveLength(1);
    expect(
      named(log, 'bug_hopped').length + named(log, 'bug_reacted').filter((r) => r.id === dot.id).length,
    ).toBeGreaterThan(0);
    expectFound(sim, 'secret_frog_blink');
  });

  it('three bugs on one raft reaching the far bank win the regatta', () => {
    const sim = world('regatta');
    const x = POND.x1 - 1.6;
    const raft = sim.spawn('item', 'item_leaf_raft', x, POND.level - 0.2);
    sim.run(90);
    const r = sim.physics.getState(raft.id);
    for (const [i, def] of ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp'].entries())
      bugAt(sim, def, r.x - 0.5 + i * 0.5, r.y - 0.8);
    for (let t = 0; t < 120 && !sim.secrets.includes('secret_raft_regatta'); t++) {
      // Keep the raft at the far bank against the bugs' own plans.
      sim.physics.setVelocity(raft.id, 0, sim.physics.getState(raft.id).vy);
      sim.run(5);
    }
    expectFound(sim, 'secret_raft_regatta');
  });
});

describe('the plaza', () => {
  it('the tiny key at the knothole opens the stump door, once the boot gave it', () => {
    const sim = world('door');
    const hole = spot(sim, 'fix_stump_knothole');
    const key = put(sim, 'item_key_tiny', hole.x - 4);
    sim.run(30);
    const carry = (): void => {
      const k = sim.physics.getState(key.id);
      sim.send({ type: 'grab', x: k.x, y: k.y });
      sim.step();
      for (let t = 0; t < 40; t++) {
        sim.send({ type: 'drag', x: hole.x, y: hole.y });
        sim.step();
      }
      sim.send({ type: 'release', vx: 0, vy: 0 });
      sim.run(20);
    };
    carry();
    expect(sim.secrets).not.toContain('secret_knothole_door');
    sim.findSecret('secret_boot_key', 0, 0);
    carry();
    expect(items(sim, 'item_map_scrap_1')).toHaveLength(1);
    expect(items(sim, 'item_old_coin')).toHaveLength(1);
    expect(items(sim, 'item_key_tiny')).toHaveLength(0);
    expectFound(sim, 'secret_knothole_door');
    expect(sim.journal.state.items).toContain('item_map_scrap_1');
  });

  it('three ring mushrooms ringing within a beat play a chord', () => {
    const sim = world('chord');
    const log = record(sim);
    const caps = ['fix_ring_mushroom_1', 'fix_ring_mushroom_2', 'fix_ring_mushroom_3'].map((id) =>
      spot(sim, id),
    );
    // As if the player let go of it just now.
    const thrown = (defId: string, x: number, y: number): Entity => {
      const e = sim.spawn('item', defId, x, y);
      sim.events.emit('item_dropped', {
        id: e.id,
        kind: 'item',
        defId,
        speed: 0,
        vx: 0,
        vy: 0,
        flung: false,
      });
      return e;
    };
    // Something just lying about never rings them.
    for (const c of caps) sim.spawn('item', 'item_pebble', c.x, c.y - 2);
    sim.run(120);
    expect(named(log, 'mushroom_bounced')).toHaveLength(0);
    // One at a time, too slow: notes, no chord.
    for (const c of caps) {
      thrown('item_pebble', c.x, c.y - 2);
      sim.run(CHORD_WINDOW + 30);
    }
    expect(named(log, 'mushroom_bounced').length).toBeGreaterThanOrEqual(3);
    expect(sim.secrets).not.toContain('secret_mushroom_chord');
    for (const c of caps) thrown('item_marble_blue', c.x, c.y - 2.5);
    sim.run(90);
    expect(named(log, 'mushroom_chord')).toHaveLength(1);
    expectFound(sim, 'secret_mushroom_chord');
  });

  it('the clover at midnight gives the golden marble, only with the map and the midnight dial', () => {
    const sim = world('clover');
    const clover = spot(sim, 'fix_clover');
    sim.send({ type: 'set_time', hour: 0.2 });
    sim.send({ type: 'poke', x: clover.x, y: clover.y });
    sim.run(5);
    expect(items(sim, 'item_marble_gold')).toHaveLength(0);
    grant(sim, 'secret_golden_marble');
    sim.send({ type: 'set_time', hour: 13 });
    sim.send({ type: 'poke', x: clover.x, y: clover.y });
    sim.run(5);
    expect(items(sim, 'item_marble_gold')).toHaveLength(0);
    sim.send({ type: 'set_time', hour: 0.2 });
    sim.send({ type: 'poke', x: clover.x, y: clover.y });
    sim.run(5);
    expect(items(sim, 'item_marble_gold')).toHaveLength(1);
    expectFound(sim, 'secret_golden_marble');
  });

  it('four map scraps touching snap into the treasure map', () => {
    const sim = world('map');
    for (let i = 1; i <= 4; i++) put(sim, `item_map_scrap_${i}`, PLAZA_X + 26 + i * 0.5);
    sim.run(60);
    expect(items(sim, 'item_treasure_map')).toHaveLength(1);
    expect(items(sim, 'item_map_scrap_1')).toHaveLength(0);
    expectFound(sim, 'secret_treasure_map');
  });

  it('scraps apart do not join', () => {
    const sim = world('apart');
    for (let i = 1; i <= 4; i++) put(sim, `item_map_scrap_${i}`, PLAZA_X + 24 + i * 2);
    sim.run(60);
    expect(items(sim, 'item_treasure_map')).toHaveLength(0);
  });

  it('a bug flung straight up at night goes into orbit and comes back with a moon crumb', () => {
    const sim = world('orbit');
    sim.send({ type: 'set_time', hour: 23 });
    const boing = bugAt(sim, 'bug_grasshopper_boing', PLAZA_X + 28);
    sim.run(60);
    const b = sim.physics.getState(boing.id);
    sim.send({ type: 'grab', x: b.x, y: b.y });
    sim.run(2);
    sim.send({ type: 'release', vx: 0.5, vy: -26 });
    sim.run(120);
    expect(sim.secrets).toContain('secret_fling_orbit');
    sim.run(400);
    expect(items(sim, 'item_moon_pebble')).toHaveLength(1);
    expect(sim.hasTag(boing.id, 'tag_glowing')).toBe(true);
    expectFound(sim, 'secret_fling_orbit');
  });

  it('a fling by day stays on the ground', () => {
    const sim = world('orbit-day');
    const boing = bugAt(sim, 'bug_grasshopper_boing', PLAZA_X + 28);
    sim.run(60);
    const b = sim.physics.getState(boing.id);
    sim.send({ type: 'grab', x: b.x, y: b.y });
    sim.run(2);
    sim.send({ type: 'release', vx: 0, vy: -26 });
    sim.run(400);
    expect(sim.secrets).not.toContain('secret_fling_orbit');
  });

  it('three bugs walking across Twig over a gap, once he has joined', () => {
    const sim = world('bridge');
    const twig = sim.spawn('bug', 'bug_stickinsect_twig', PLAZA_X + 28, GROUND_Y - 1.4);
    sim.step();
    sim.physics.setPinned(twig.id, true);
    const drop = (): void => {
      for (const def of ['bug_ladybug_dot', 'bug_snail_glorp', 'bug_grasshopper_boing']) {
        const b = bugAt(sim, def, PLAZA_X + 28, GROUND_Y - 3);
        sim.run(60);
        sim.remove(b.id);
      }
    };
    drop();
    expect(sim.secrets).not.toContain('secret_twig_bridge');
    sim.findSecret('secret_twig_blinks', 0, 0);
    drop();
    expectFound(sim, 'secret_twig_bridge');
  });
});

describe('the flowerbed', () => {
  it('four dancers for sixteen beats bring the rain', () => {
    const sim = world('dance', ['area_flowerbed_stage']);
    const stage = sim.places.stage()!;
    const bugs = ['bug_ladybug_dot', 'bug_snail_glorp', 'bug_grasshopper_boing', 'bug_ladybug_dot'].map(
      (d, i) => bugAt(sim, d, stage.x0 + [0.6, 3.4, 4.6, 5.8][i]!, stage.y - 0.8),
    );
    for (const b of bugs) {
      b.bug!.mode = 'st_perform';
      b.bug!.action = 'dance';
      b.bug!.timer = DANCE_TICKS * 2;
    }
    sim.run(DANCE_TICKS + 60);
    expect(sim.weather.raining).toBe(true);
    expectFound(sim, 'secret_rain_dance');
  });

  it('a jar at the rainbow’s end fills with rainbow paint, and the paint makes a patchwork bug', () => {
    const sim = world('rainbow', ['area_flowerbed_stage']);
    const puddle = spot(sim, 'fix_paint_blue');
    put(sim, 'item_jar_glass', puddle.x);
    sim.run(60);
    expect(items(sim, 'item_paint_rainbow')).toHaveLength(0);
    sim.send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_rainbow' });
    sim.run(30);
    expect(items(sim, 'item_paint_rainbow')).toHaveLength(1);
    expectFound(sim, 'secret_rainbow_end');
    const dot = bugAt(sim, 'bug_ladybug_dot', puddle.x + 4);
    sim.run(30);
    sim.paintFromDrop(dot.id, items(sim, 'item_paint_rainbow')[0]!);
    expect(dot.paint).toHaveLength(5);
  });
});

describe('the porch', () => {
  it('the flashlight shining in the porch at night shows a shadow puppet', () => {
    const sim = world('shadow', ['area_under_porch']);
    const porch = sim.content.areas.get('area_under_porch');
    const pen = put(sim, 'item_flashlight_pen', porch.xStart + 14);
    sim.addTag(pen.id, 'tag_glowing', 'player', null);
    sim.run(200);
    expect(sim.secrets).not.toContain('secret_flashlight_shadow');
    const log = record(sim);
    sim.send({ type: 'set_time', hour: 22 });
    sim.run(200);
    expect(named(log, 'shadow_puppet').length).toBeGreaterThan(0);
    expectFound(sim, 'secret_flashlight_shadow');
  });

  it('three lights by the lamp at night bring a spiral of moths', () => {
    const sim = world('moths', ['area_under_porch']);
    const lamp = spot(sim, 'fix_porch_lamp');
    sim.send({ type: 'set_time', hour: 22 });
    sim.send({ type: 'poke', x: lamp.x, y: lamp.y });
    sim.run(5);
    expect(sim.places.state.lampOn).toBe(true);
    for (const dx of [-0.6, 0.6]) {
      const e = sim.spawn('item', 'item_moon_pebble', lamp.x + dx, lamp.y + 0.6);
      sim.physics.setPinned(e.id, true);
    }
    sim.run(30);
    expectFound(sim, 'secret_lamp_moths');
  });
});

describe('the treehouse', () => {
  const TREE = ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'];

  it('eight marble hits in a row on the xylophone play a tune', () => {
    const sim = world('tune', TREE);
    const x = sim.content.areas.get('area_treehouse_arcade').xStart + 14;
    const xylo = put(sim, 'item_inst_leaf_xylophone', x);
    const marble = put(sim, 'item_marble_blue', x + 2);
    sim.run(5);
    const hit = { a: marble.id, b: xylo.id, speed: 3, nx: 0, ny: 1, px: x, py: 8.5 };
    for (let i = 0; i < TUNE_HITS - 1; i++) {
      sim.clues.impacts([hit]);
      sim.run(30);
    }
    expect(sim.secrets).not.toContain('secret_marble_tune');
    sim.run(400); // Too long a gap: the run starts over.
    for (let i = 0; i < TUNE_HITS - 1; i++) {
      sim.clues.impacts([hit]);
      sim.run(30);
    }
    expect(sim.secrets).not.toContain('secret_marble_tune');
    sim.clues.impacts([hit]);
    expectFound(sim, 'secret_marble_tune');
  });

  it('three claw prizes in a row win a candle hat; a miss starts over', () => {
    const sim = world('claw', TREE);
    const prize = (phase: 'prize' | 'miss'): void => {
      sim.events.emit('claw_moved', { phase, x: 190, y: 6, id: null });
      sim.step();
    };
    prize('prize');
    prize('prize');
    prize('miss');
    prize('prize');
    prize('prize');
    expect(items(sim, 'item_hat_candle')).toHaveLength(0);
    for (let i = 2; i < CLAW_STREAK; i++) prize('prize');
    expect(items(sim, 'item_hat_candle')).toHaveLength(1);
    expectFound(sim, 'secret_claw_triple');
  });

  it('the tenth ride down the leaf slide brings back a map scrap', () => {
    const sim = world('slide', TREE);
    const top = spot(sim, 'fix_leaf_slide');
    sim.clues.state.slides = SLIDE_RIDES - 2;
    for (let ride = 0; ride < 2; ride++) {
      const ball = sim.spawn('item', 'item_rubber_ball', top.x, top.y - 0.4);
      for (let t = 0; t < 400 && sim.entities.get(ball.id); t += 15) sim.run(15);
      sim.remove(ball.id);
    }
    expect(sim.clues.state.slides).toBe(SLIDE_RIDES);
    expect(items(sim, 'item_map_scrap_3')).toHaveLength(1);
    expectFound(sim, 'secret_zipline_souvenir');
  });

  it('three taps on the window: the telescope points at a secret still waiting, and the journal marks it', () => {
    const sim = world('window', TREE);
    const win = spot(sim, 'fix_treehouse_window');
    const log = record(sim);
    for (let i = 0; i < WINDOW_CLICKS; i++) {
      sim.send({ type: 'poke', x: win.x, y: win.y });
      sim.run(5);
    }
    const peek = named(log, 'telescope_peeked')[0]!;
    expect(peek.secret).toBeTruthy();
    const def = CONTENT.secrets.get(peek.secret as string);
    expect(def.tier).toBe(2);
    expect(sim.secrets).not.toContain(def.id);
    expectFound(sim, 'secret_window_telescope');
    expect(sim.book().secrets.find((s) => s.id === def.id)!.state).toBe('hinted');
  });

  it('a jar carried up to the rain cloud catches a cloud, and the cloud jar makes rain', () => {
    const sim = world('cloud');
    const jar = put(sim, 'item_jar_glass', PLAZA_X + 28);
    sim.run(5);
    sim.physics.setPosition(jar.id, PLAZA_X + 28, -1.5);
    sim.run(15);
    expect(items(sim, 'item_cloud_jar')).toHaveLength(0);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.physics.setPosition(items(sim, 'item_jar_glass')[0]!.id, PLAZA_X + 28, -1.5);
    sim.run(15);
    expect(items(sim, 'item_cloud_jar')).toHaveLength(1);
    expectFound(sim, 'secret_catch_cloud');
    sim.send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
    sim.run(200);
    const cloud = items(sim, 'item_cloud_jar')[0]!;
    const c = sim.physics.getState(cloud.id);
    sim.send({ type: 'poke', x: c.x, y: c.y });
    sim.run(3);
    expect(sim.weather.raining).toBe(true);
    expect(sim.journal.state.noticed).toContain('cloud_jar_used');
  });
});

describe('mystery clues', () => {
  it('at night the moss jar squeaks at the hand, and the journal notes it', () => {
    const sim = world('squeak', ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab']);
    const jar = spot(sim, 'fix_jar_moss');
    const log = record(sim);
    sim.send({ type: 'hand', x: jar.x, y: jar.y });
    sim.run(30);
    expect(named(log, 'moss_squeaked')).toHaveLength(0);
    sim.send({ type: 'set_time', hour: 23 });
    sim.run(30);
    expect(named(log, 'moss_squeaked')).toHaveLength(1);
    expect(sim.journal.state.noticed).toContain('moss_squeak');
    const page = sim.book().mysteries.find((m) => m.id === 'mystery_tiny_squeak')!;
    expect(page.panels[0]!.state).toBe('done');
  });

  it('rain the player sees fills the cloud mystery panel', () => {
    const sim = world('rainseen');
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(20);
    expect(sim.journal.state.noticed).toContain('rain_seen');
  });

  it('the find_secret debug command finds prerequisites first', () => {
    const sim = world('debug');
    sim.send({ type: 'find_secret', id: 'secret_golden_marble' });
    sim.step();
    expect(sim.secrets).toEqual(
      expect.arrayContaining(['secret_treasure_map', 'secret_sundial_midnight', 'secret_golden_marble']),
    );
  });
});
