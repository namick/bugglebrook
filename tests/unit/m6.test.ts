import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents, SaveFile } from '../../src/game';
import { Rng } from '../../src/game/core/rng';
import { BUGS } from '../../src/game/data/bugs';
import { DRAIN, RAIN_RISE, sundialSun } from '../../src/game/systems/environment';
import { DECAY, NIGHT_ENERGY, decayNeeds } from '../../src/game/systems/needs';
import { newBugBrain } from '../../src/game/systems/bugAi';
import {
  DAY,
  GUST_SPEED,
  HOUR,
  MINUTE,
  START_CLOCK,
  clockLabel,
  hourOf,
  phaseAt,
  rollWeather,
  snapDial,
} from '../../src/game/systems/sky';
import { KNOTHOLE_EVERY } from '../../src/game/systems/weather';
import { PLAZA_X, POND } from './world';

// M6 (game design doc, sections 11 and 19): day, night, and weather.

type Logged = { name: keyof GameEvents; tick: number; payload: Record<string, unknown> };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) =>
    log.push({ name, tick: sim.tick, payload: payload as Record<string, unknown> }),
  );
  return log;
}

const byDef = (sim: Sim, defId: string): number =>
  sim.entities.ofKind('bug').find((b) => b.defId === defId)!.id;

/** Where a fixture is in world meters. */
function fixture(sim: Sim, id: string): { x: number; y: number } {
  for (const area of sim.content.areas.all)
    for (const f of area.fixtures ?? []) if (f.id === id) return { x: area.xStart + f.x, y: f.y };
  throw new Error(id);
}

/** Everyone full, so nobody wanders off to eat what a test stages. */
function calm(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
}

function saveOf(sim: Sim): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: '2026-09-30T00:00:00.000Z',
    world: sim.serialize(),
    view: { cameraX: 40 },
    meta: { createdAt: '2026-09-30T00:00:00.000Z', thumb: null },
  };
}

describe('the clock', () => {
  it('starts new worlds at 09:00 and runs one game minute per real second', () => {
    const sim = Sim.create({ seed: 'clock' });
    expect(sim.weather.clock).toBe(START_CLOCK);
    expect(clockLabel(sim.weather.clock)).toBe('09:00');
    sim.run(60);
    expect(sim.weather.clock).toBe(START_CLOCK + MINUTE);
    expect(clockLabel(sim.weather.clock)).toBe('09:01');
    // A whole day is 24 real minutes.
    expect(DAY / 60 / 60).toBe(24);
  });

  it('starts each phase at the listed time', () => {
    const at = (h: number, m = 0): number => h * HOUR + m * MINUTE;
    expect(phaseAt(at(4, 59))).toBe('phase_night');
    expect(phaseAt(at(5))).toBe('phase_dawn');
    expect(phaseAt(at(6, 59))).toBe('phase_dawn');
    expect(phaseAt(at(7))).toBe('phase_day');
    expect(phaseAt(at(17, 59))).toBe('phase_day');
    expect(phaseAt(at(18))).toBe('phase_dusk');
    expect(phaseAt(at(20))).toBe('phase_night');
    expect(phaseAt(DAY + at(0))).toBe('phase_night');
  });

  it('announces each phase as the clock passes into it', () => {
    const sim = Sim.create({ seed: 'phases' });
    sim.send({ type: 'set_time', hour: 17 + 59 / 60 });
    sim.step();
    const log = record(sim);
    sim.run(61);
    expect(log.filter((e) => e.name === 'phase_changed').map((e) => e.payload.phase)).toEqual(['phase_dusk']);
  });
});

describe('the sundial', () => {
  it('fast-forwards at 60x while turned, and never goes backward', () => {
    const sim = Sim.create({ seed: 'dial' });
    const start = sim.weather.clock;
    sim.send({ type: 'dial_turn', minutes: 120 });
    sim.step();
    expect(sim.weather.fastForward).toBe(true);
    // Two game hours at a game hour per real second: two seconds.
    sim.run(119);
    expect(sim.weather.clock - start).toBeGreaterThanOrEqual(2 * HOUR);
    // Turning it back does nothing.
    const now = sim.weather.clock;
    sim.send({ type: 'dial_turn', minutes: -300 });
    sim.send({ type: 'dial_release' });
    sim.run(30);
    expect(sim.weather.clock).toBeGreaterThanOrEqual(now);
    expect(sim.weather.fastForward).toBe(false);
  });

  it('snaps to a phase start within 15 minutes when let go, forward only', () => {
    expect(snapDial(17 * HOUR + 50 * MINUTE, 9 * HOUR)).toBe(18 * HOUR);
    expect(snapDial(20 * HOUR + 10 * MINUTE, 9 * HOUR)).toBe(20 * HOUR);
    expect(snapDial(15 * HOUR, 9 * HOUR)).toBe(15 * HOUR);
    // Never behind where the clock already is.
    expect(snapDial(18 * HOUR + 5 * MINUTE, 18 * HOUR + 3 * MINUTE)).toBe(18 * HOUR + 5 * MINUTE);
    // Midnight snaps too, for the secret.
    expect(snapDial(DAY + 10 * MINUTE, 9 * HOUR)).toBe(DAY);
  });

  it('turned to exactly midnight: the moonlit shadow glows (secret_sundial_midnight)', () => {
    const sim = Sim.create({ seed: 'midnight' });
    const log = record(sim);
    // 09:00 plus 14 h 55 min lands at 23:55, which snaps to 00:00.
    sim.send({ type: 'dial_turn', minutes: 14 * 60 + 55 });
    sim.step();
    sim.send({ type: 'dial_release' });
    sim.run(20 * 60);
    expect(hourOf(sim.weather.clock)).toBeLessThan(0.5);
    expect(sim.secrets).toContain('secret_sundial_midnight');
    expect(log.some((e) => e.name === 'time_skipped')).toBe(true);
  });

  it('a skip of two hours or more ends the rain', () => {
    const sim = Sim.create({ seed: 'skip-rain' });
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.step();
    sim.send({ type: 'dial_turn', minutes: 150 });
    sim.step();
    sim.send({ type: 'dial_release' });
    sim.run(4 * 60);
    expect(sim.weather.raining).toBe(false);
  });

  it('five quick clicks on the painted sun put sunglasses on the sun (secret_sun_shades)', () => {
    const sim = Sim.create({ seed: 'shades' });
    const sun = sundialSun(fixture(sim, 'fix_sundial'));
    for (let i = 0; i < 5; i++) {
      sim.send({ type: 'poke', x: sun.x, y: sun.y });
      sim.run(3);
    }
    expect(sim.weather.state.shades).toBe(0);
    expect(sim.secrets).toEqual(['secret_sun_shades']);
  });
});

describe('weather', () => {
  it('rolls clear, cloudy, rain, and wind at about the design chances', () => {
    const rng = new Rng('chances');
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const w = rollWeather(rng);
      counts[w] = (counts[w] ?? 0) + 1;
    }
    expect(counts.weather_clear! / 20000).toBeCloseTo(0.5, 1);
    expect(counts.weather_cloudy! / 20000).toBeCloseTo(0.2, 1);
    expect(counts.weather_rain! / 20000).toBeCloseTo(0.18, 1);
    expect(counts.weather_wind! / 20000).toBeCloseTo(0.12, 1);
  });

  it('changes every 6 to 12 minutes, and a rainbow after rain lasts 90 s', { timeout: 400_000 }, () => {
    const sim = Sim.create({ seed: 'changes' });
    const log = record(sim);
    for (let i = 0; i < 40; i++) sim.run(60 * 60);
    const changes = log.filter((e) => e.name === 'weather_changed');
    expect(changes.length).toBeGreaterThan(3);
    const ticks = changes.map((e) => e.tick);
    for (let i = 1; i < ticks.length; i++) {
      const gap = ticks[i]! - ticks[i - 1]!;
      const from = changes[i]!.payload.from;
      if (from === 'weather_rainbow') expect(gap).toBe(90 * 60);
      else if (from !== 'weather_shooting_stars') {
        expect(gap).toBeGreaterThanOrEqual(6 * 60 * 60);
        expect(gap).toBeLessThanOrEqual(12 * 60 * 60 + 1);
      }
    }
    for (const c of changes)
      if (c.payload.weather === 'weather_rainbow') expect(c.payload.from).toBe('weather_rain');
  });

  it(
    'is deterministic: two worlds with the same seed have the same weather and clock',
    { timeout: 240_000 },
    () => {
      const a = Sim.create({ seed: 'twins' });
      const b = Sim.create({ seed: 'twins' });
      for (const s of [a, b]) {
        s.send({ type: 'dial_turn', minutes: 200 });
        s.run(30 * 60);
        s.send({ type: 'dial_release' });
        s.run(8 * 60 * 60);
      }
      expect(JSON.stringify(a.serialize())).toBe(JSON.stringify(b.serialize()));
    },
  );

  it('weather never shifts the bugs dice: the world RNG is untouched by it', () => {
    const a = Sim.create({ seed: 'dice' });
    const b = Sim.create({ seed: 'dice' });
    b.send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_cloudy' });
    a.run(2);
    b.run(2);
    expect(a.rng.getState()).toEqual(b.rng.getState());
  });

  it('shooting stars on a clear night fall every 20 s, and bugs look up', () => {
    const sim = Sim.create({ seed: 'stars' });
    calm(sim);
    sim.send({ type: 'set_time', hour: 21 });
    sim.send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_shooting_stars' });
    const log = record(sim);
    sim.run(60 * 60);
    const stars = log.filter((e) => e.name === 'shooting_star');
    expect(stars.length).toBeGreaterThanOrEqual(2);
    expect(stars[1]!.tick - stars[0]!.tick).toBe(20 * 60);
    // At dawn the shooting stars stop.
    sim.send({ type: 'set_time', hour: 5.5 });
    sim.run(2);
    expect(sim.weather.weather).toBe('weather_clear');
  });
});

describe('rain (R15), the pond, and puddles', () => {
  it('an outdoor item gets wet within 5 s of rain; one under a roof does not', () => {
    const sim = Sim.create({ seed: 'rain' });
    calm(sim);
    const x = PLAZA_X + 33;
    const out = sim.spawn('item', 'item_pebble', x - 3, GROUND_Y - 0.25).id;
    const under = sim.spawn('item', 'item_pebble', x, GROUND_Y - 0.25).id;
    // A porch-like roof: a static board 2 m up.
    sim.physics.setPlatform('roof', x, GROUND_Y - 2, 3, 0.2, 0.5, 1 / 60);
    sim.run(60);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(5 * 60 + 16);
    expect(sim.hasTag(out, 'tag_wet')).toBe(true);
    expect(sim.hasTag(under, 'tag_wet')).toBe(false);
    sim.run(30 * 60);
    expect(sim.hasTag(under, 'tag_wet')).toBe(false);
  });

  it('the pond rises while it rains and drains after, at the stated rates', () => {
    const sim = Sim.create({ seed: 'pond-rain' });
    const level = (): number =>
      sim.environment.surfaces().find((s) => s.areaId === 'area_puddle_pond')!.level;
    const rest = level();
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(20 * 60);
    const risen = rest - level();
    expect(risen).toBeCloseTo(RAIN_RISE * 20, 2);
    sim.send({ type: 'set_weather', wind: 0, rain: false });
    sim.run(4 * 60);
    expect(rest - level()).toBeCloseTo(risen - DRAIN * 4, 2);
    expect(POND.level).toBe(rest);
  });

  it('puddles fill in the plaza dips during rain, wet what stands in them, and dry after', () => {
    const sim = Sim.create({ seed: 'puddles' });
    calm(sim);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(30 * 60);
    const full = sim.weather.puddles();
    expect(full.map((p) => p.id).sort()).toEqual(['fix_puddle_east', 'fix_puddle_west']);
    expect(full.every((p) => p.fill > 0.95)).toBe(true);
    sim.send({ type: 'set_weather', wind: 0, rain: false });
    const p = full[0]!;
    const cork = sim.spawn('item', 'item_pebble', p.x, p.y - 0.4).id;
    const log = record(sim);
    sim.run(60);
    expect(sim.hasTag(cork, 'tag_wet')).toBe(true);
    expect(log.some((e) => e.name === 'splashed' && e.payload.id === cork)).toBe(true);
    // Three minutes later they are dry.
    sim.run(3 * 60 * 60);
    expect(sim.weather.puddles()).toEqual([]);
  });

  it('bugs that dislike rain hold a leaf up as an umbrella and stay dry; they put it down after', () => {
    const sim = Sim.create({ seed: 'umbrella' });
    calm(sim);
    const dot = byDef(sim, 'bug_ladybug_dot');
    const d = sim.view(dot)!;
    sim.spawn('item', 'item_leaf', d.x + 1.4, GROUND_Y - 0.3);
    const log = record(sim);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    let up = false;
    for (let i = 0; i < 40 * 60 && !up; i++) {
      sim.step();
      up = sim.view(dot)!.bug!.umbrella;
    }
    expect(up).toBe(true);
    expect(log.some((e) => e.name === 'bug_umbrella' && e.payload.id === dot && e.payload.on)).toBe(true);
    sim.send({ type: 'set_tag', id: dot, tag: 'tag_wet', on: false });
    sim.run(10 * 60);
    if (sim.view(dot)!.bug!.umbrella) expect(sim.hasTag(dot, 'tag_wet')).toBe(false);
    sim.send({ type: 'set_weather', wind: 0, rain: false });
    sim.run(3 * 60);
    expect(sim.view(dot)!.bug!.umbrella).toBe(false);
    expect(log.some((e) => e.name === 'bug_umbrella' && e.payload.id === dot && !e.payload.on)).toBe(true);
  });

  it('never takes a player setup for an umbrella', () => {
    const sim = Sim.create({ seed: 'umbrella-setup' });
    calm(sim);
    for (const e of sim.entities.ofKind('item'))
      if (e.defId === 'item_leaf' || e.defId === 'item_feather')
        sim.send({ type: 'set_tag', id: e.id, tag: 'tag_player_setup', on: true });
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    const log = record(sim);
    sim.run(40 * 60);
    expect(log.filter((e) => e.name === 'bug_umbrella')).toEqual([]);
  });

  it('rain lovers splash about happily in it', () => {
    const sim = Sim.create({ seed: 'rain-joy' });
    calm(sim);
    const log = record(sim);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(60 * 60);
    const joy = log.filter((e) => e.name === 'bug_reacted' && e.payload.reaction === 'rain_joy');
    expect(joy.length).toBeGreaterThan(0);
    for (const e of joy) expect(BUGS.get(e.payload.defId as string).rain).toBe('likes');
  });

  it('dew falls on leaves at dawn', () => {
    const sim = Sim.create({ seed: 'dew' });
    const leaf = sim.entities.ofKind('item').find((e) => e.defId === 'item_leaf')!.id;
    sim.send({ type: 'set_time', hour: 4.99 });
    sim.run(60);
    expect(sim.hasTag(leaf, 'tag_wet')).toBe(true);
  });
});

describe('wind (R14) and the weather vane', () => {
  it('three quick clicks on the vane start a 20 s gust the way the rooster faces', () => {
    const sim = Sim.create({ seed: 'vane' });
    calm(sim);
    const vane = fixture(sim, 'fix_weather_vane');
    const log = record(sim);
    for (let i = 0; i < 3; i++) {
      sim.send({ type: 'poke', x: vane.x, y: vane.y });
      sim.run(20);
    }
    const gust = log.find((e) => e.name === 'gust_started')!;
    expect(gust).toBeDefined();
    expect(sim.environment.state.wind).toBe((gust.payload.dir as number) * GUST_SPEED);
    expect(gust.payload.dir).toBe(sim.weather.state.vane.facing);
    sim.run(20 * 60);
    expect(sim.environment.state.wind).toBe(0);
  });

  it('two slow clicks only spin it', () => {
    const sim = Sim.create({ seed: 'vane-slow' });
    const vane = fixture(sim, 'fix_weather_vane');
    const log = record(sim);
    for (let i = 0; i < 3; i++) {
      sim.send({ type: 'poke', x: vane.x, y: vane.y });
      sim.run(70);
    }
    expect(log.filter((e) => e.name === 'vane_spun')).toHaveLength(3);
    expect(log.some((e) => e.name === 'gust_started')).toBe(false);
  });

  it('wind pushes light things along and drifts the pond floaters faster', () => {
    const sim = Sim.create({ seed: 'windy' });
    calm(sim);
    const feather = sim.spawn('item', 'item_feather', PLAZA_X + 30, GROUND_Y - 0.3).id;
    sim.run(60);
    const x0 = sim.view(feather)!.x;
    sim.send({ type: 'set_weather', wind: -2, rain: false });
    sim.run(2 * 60);
    expect(sim.view(feather)!.x).toBeLessThan(x0 - 1);
  });
});

describe('night', () => {
  const DAY_BUGS = ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_grasshopper_boing'];

  it(
    'day bugs with energy under 50 are asleep within 60 s at night, and the AI never wakes them',
    { timeout: 60_000 },
    () => {
      const sim = Sim.create({ seed: 'night' });
      calm(sim);
      sim.run(30);
      sim.send({ type: 'set_time', hour: 20.5 });
      const ids = DAY_BUGS.map((d) => byDef(sim, d));
      for (const id of ids) sim.send({ type: 'set_need', id, need: 'need_energy', value: 40 });
      const log = record(sim);
      sim.run(60 * 60);
      for (const id of ids) expect(sim.view(id)!.bug!.mode, sim.view(id)!.defId).toBe('st_sleep');
      // They sleep through the night, rested or not.
      sim.run(5 * 60 * 60);
      for (const id of ids) expect(sim.view(id)!.bug!.mode).toBe('st_sleep');
      const woke = log.filter((e) => e.name === 'bug_woke' && ids.includes(e.payload.id as number));
      expect(woke).toEqual([]);
    },
  );

  it('even rested day bugs go to bed at night, and wake at dawn once rested', () => {
    const sim = Sim.create({ seed: 'dawn' });
    calm(sim);
    sim.send({ type: 'set_time', hour: 21 });
    const ids = DAY_BUGS.map((d) => byDef(sim, d));
    for (const id of ids) sim.send({ type: 'set_need', id, need: 'need_energy', value: 90 });
    sim.run(60 * 60);
    for (const id of ids) expect(sim.view(id)!.bug!.mode).toBe('st_sleep');
    sim.send({ type: 'set_time', hour: 6.3 });
    sim.run(20 * 60);
    for (const id of ids) expect(sim.view(id)!.bug!.mode).not.toBe('st_sleep');
  });

  it('a woken bug at night is groggy, stays up a while, then goes back to bed', () => {
    const sim = Sim.create({ seed: 'renap' });
    calm(sim);
    sim.send({ type: 'set_time', hour: 22 });
    sim.run(60 * 60);
    const glorp = byDef(sim, 'bug_snail_glorp');
    expect(sim.view(glorp)!.bug!.mode).toBe('st_sleep');
    const g = sim.view(glorp)!;
    sim.send({ type: 'poke', x: g.x, y: g.y });
    sim.step();
    expect(sim.view(glorp)!.bug!.groggy).toBe(true);
    sim.run(10 * 60);
    expect(sim.view(glorp)!.bug!.mode).not.toBe('st_sleep');
    sim.run(25 * 60);
    expect(sim.view(glorp)!.bug!.mode).toBe('st_sleep');
  });

  it('energy runs down 2.5 times faster up past bedtime', () => {
    const def = BUGS.get('bug_ladybug_dot');
    const a = newBugBrain(0, new Rng('a'));
    const b = newBugBrain(0, new Rng('a'));
    a.mode = b.mode = 'st_wander';
    decayNeeds(a, def, 60);
    decayNeeds(b, def, 60, false, true);
    // One second: the extra night loss is the base rate times (2.5 - 1).
    const extra = a.needs.need_energy - b.needs.need_energy;
    expect(extra).toBeCloseTo(DECAY.need_energy * def.needWeights.need_energy * (NIGHT_ENERGY - 1), 6);
  });

  it('glowing things warm up bugs close by at night (R16)', () => {
    const sim = Sim.create({ seed: 'campfire' });
    const rollo = byDef(sim, 'bug_pillbug_rollo');
    const r = sim.view(rollo)!;
    sim.spawn('item', 'item_moon_pebble', r.x + 0.9, GROUND_Y - 0.3);
    sim.send({ type: 'set_time', hour: 22 });
    sim.send({ type: 'set_need', id: rollo, need: 'need_social', value: 20 });
    sim.send({ type: 'set_need', id: rollo, need: 'need_energy', value: 100 });
    sim.step();
    // Awake (poked), next to the light.
    const v = sim.view(rollo)!;
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(60);
    expect(sim.view(rollo)!.bug!.needs.need_social).toBeGreaterThan(20);
  });
});

describe('time-of-day secrets', () => {
  it('the knothole gives something once per 10 game minutes; at night eyes look back (secret_stump_eyes)', () => {
    const sim = Sim.create({ seed: 'knothole' });
    const k = fixture(sim, 'fix_stump_knothole');
    const log = record(sim);
    sim.send({ type: 'poke', x: k.x, y: k.y });
    sim.run(30);
    sim.send({ type: 'poke', x: k.x, y: k.y });
    sim.run(30);
    const peeks = log.filter((e) => e.name === 'knothole_peeked');
    expect(peeks).toHaveLength(2);
    expect(peeks[0]!.payload.itemId).not.toBeNull();
    expect(peeks[1]!.payload.itemId).toBeNull();
    expect(sim.secrets).toEqual([]);
    sim.run(KNOTHOLE_EVERY);
    sim.send({ type: 'set_time', hour: 23 });
    sim.send({ type: 'poke', x: k.x, y: k.y });
    sim.run(2);
    const night = log.filter((e) => e.name === 'knothole_peeked').at(-1)!;
    expect(night.payload.night).toBe(true);
    expect(night.payload.itemId).not.toBeNull();
    expect(sim.secrets).toEqual(['secret_stump_eyes']);
  });

  it('a pebble that comes to rest in the moonlit teacup becomes a moon pebble (secret_moon_pebble)', () => {
    const sim = Sim.create({ seed: 'moon' });
    const cup = fixture(sim, 'fix_sunken_teacup');
    const day = sim.spawn('item', 'item_pebble', cup.x, POND.level + 0.3).id;
    sim.run(6 * 60);
    expect(sim.entities.has(day)).toBe(true);
    sim.send({ type: 'set_time', hour: 23 });
    sim.run(60);
    expect(sim.entities.has(day)).toBe(false);
    expect(sim.entities.ofKind('item').some((e) => e.defId === 'item_moon_pebble')).toBe(true);
    expect(sim.secrets).toContain('secret_moon_pebble');
    const moon = sim.entities.ofKind('item').find((e) => e.defId === 'item_moon_pebble')!;
    expect(sim.hasTag(moon.id, 'tag_glowing')).toBe(true);
  });

  it('three flashes near the reeds at night call Flick the firefly (secret_firefly_flick)', () => {
    const sim = Sim.create({ seed: 'flick' });
    calm(sim);
    const reeds = fixture(sim, 'fix_reeds');
    const pen = sim.entities.ofKind('item').find((e) => e.defId === 'item_flashlight_pen')!.id;
    sim.physics.place(pen, reeds.x + 3, GROUND_Y - 0.6, 0);
    sim.run(60);
    const click = (): void => {
      const v = sim.view(pen)!;
      sim.send({ type: 'poke', x: v.x, y: v.y });
      sim.run(30);
    };
    // By day nothing answers.
    for (let i = 0; i < 3; i++) click();
    expect(sim.entities.ofKind('bug').some((b) => b.defId === 'bug_firefly_flick')).toBe(false);
    sim.send({ type: 'set_time', hour: 22 });
    const log = record(sim);
    click();
    expect(log.filter((e) => e.name === 'fireflies_blinked')).toHaveLength(1);
    click();
    click();
    expect(sim.entities.ofKind('bug').some((b) => b.defId === 'bug_firefly_flick')).toBe(true);
    expect(sim.secrets).toEqual(['secret_firefly_flick']);
    expect(log.some((e) => e.name === 'bug_joined')).toBe(true);
    // Only one Flick, however many more flashes.
    for (let i = 0; i < 4; i++) click();
    expect(sim.entities.ofKind('bug').filter((b) => b.defId === 'bug_firefly_flick')).toHaveLength(1);
  });

  it('a click on the flashlight switches it on and off, and it does not hop', () => {
    const sim = Sim.create({ seed: 'pen' });
    const pen = sim.entities.ofKind('item').find((e) => e.defId === 'item_flashlight_pen')!.id;
    sim.run(60);
    const v = sim.view(pen)!;
    const log = record(sim);
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(5);
    expect(sim.hasTag(pen, 'tag_glowing')).toBe(true);
    expect(log.some((e) => e.name === 'item_poked')).toBe(false);
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(5);
    expect(sim.hasTag(pen, 'tag_glowing')).toBe(false);
  });

  it('Flick is a night bug: asleep by day, up by night', () => {
    const sim = Sim.create({ seed: 'owl' });
    calm(sim);
    const flick = sim.spawn('bug', 'bug_firefly_flick', PLAZA_X + 30, GROUND_Y - 0.5).id;
    calm(sim);
    sim.send({ type: 'set_need', id: flick, need: 'need_energy', value: 90 });
    sim.run(60 * 60);
    expect(sim.view(flick)!.bug!.mode).toBe('st_sleep');
    sim.send({ type: 'set_time', hour: 21 });
    sim.run(60 * 60);
    expect(sim.view(flick)!.bug!.mode).not.toBe('st_sleep');
  });
});

describe('saves (version 7)', () => {
  it('keep the clock, the weather, puddles, and secrets', () => {
    const sim = Sim.create({ seed: 'persist' });
    sim.send({ type: 'set_time', hour: 19.5 });
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(20 * 60);
    sim.findSecret('secret_sun_shades', 0, 0);
    const loaded = Sim.load(loadSaveFile(JSON.stringify(saveOf(sim))).world);
    expect(loaded.weather.clock).toBe(sim.weather.clock);
    expect(loaded.weather.weather).toBe('weather_rain');
    expect(loaded.environment.state.rain).toBe(true);
    expect(loaded.weather.puddles()).toEqual(sim.weather.puddles());
    expect(loaded.secrets).toContain('secret_sun_shades');
    expect(loaded.secrets).toEqual(sim.secrets);
    // The weather carries on exactly alike.
    sim.run(600);
    loaded.run(600);
    expect(loaded.serialize().sky).toEqual(sim.serialize().sky);
  });

  it('a version 6 world starts its clock at 09:00 in clear weather, with the flashlight pen', () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'save-v6.json'), 'utf8'));
    const save = loadSaveFile(JSON.stringify(raw));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.world.secrets).toEqual([]);
    const sim = Sim.load(save.world);
    expect(sim.weather.clock).toBe(START_CLOCK);
    expect(sim.weather.weather).toBe('weather_clear');
    expect(sim.entities.ofKind('item').some((e) => e.defId === 'item_flashlight_pen')).toBe(true);
    sim.run(60);
    expect(sim.weather.clock).toBe(START_CLOCK + MINUTE);
  });

  it('rejects a broken sky', () => {
    const good = saveOf(Sim.create());
    const bad = { ...good, world: { ...good.world, sky: { ...good.world.sky!, weather: 'weather_frogs' } } };
    expect(() => loadSaveFile(bad)).toThrow(/sky/);
    const worse = { ...good, world: { ...good.world, secrets: [3] } };
    expect(() => loadSaveFile(worse)).toThrow(/secrets/);
  });
});
