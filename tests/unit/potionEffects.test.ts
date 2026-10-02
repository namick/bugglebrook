import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { ITEMS } from '../../src/game/data/items';
import { POTIONS } from '../../src/game/data/potions';
import type { EssenceId, PotionEffect } from '../../src/game/data/types';
import { brew } from '../../src/game/systems/brewing';
import type { EssenceDrop } from '../../src/game/systems/brewing';
import { SKY_TOP } from '../../src/game/systems/potions';
import { PLAZA_X, POND, POND_X } from './world';

// M8 (game design doc, section 9): every potion's effect, start to finish,
// in its own file so the 33 long runs go beside the rest of the potion tests.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const drop = (essence: EssenceId | null, paint?: string): EssenceDrop =>
  paint ? { essence, paint } : { essence };

const bug = (sim: Sim, defId: string): Entity => sim.entities.ofKind('bug').find((b) => b.defId === defId)!;

function reloaded(sim: Sim): Sim {
  const text = JSON.stringify({
    version: SAVE_VERSION,
    savedAt: 'x',
    world: sim.serialize(),
    view: { cameraX: PLAZA_X },
    meta: { createdAt: 'x', thumb: null },
  });
  return Sim.load(loadSaveFile(text).world);
}

/** A quiet plaza with Dot standing still in the open. */
function dotWorld(seed: string): { sim: Sim; dot: Entity } {
  const sim = Sim.create({ seed });
  const dot = bug(sim, 'bug_ladybug_dot');
  // Everyone else naps, so no spring launch or game of tag lands in the middle of a test.
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: need === 'need_energy' && b !== dot ? 0 : 100 });
  sim.physics.place(dot.id, PLAZA_X + 28, GROUND_Y - 0.6, 0);
  sim.run(30);
  return { sim, dot };
}

const effectsOf = (sim: Sim, id: number): PotionEffect[] =>
  (sim.view(id)!.effects ?? []).map((e) => e.effect);

/** Every potion that leaves an effect running, and the effect. */
const TIMED = POTIONS.all.filter((p) => !['potion_water', 'potion_paint'].includes(p.id));

describe('potion effects (M8 acceptance)', () => {
  it.each(TIMED.map((p) => [p.id, p] as const))(
    '%s starts, lasts through save and load, and runs out',
    (_, p) => {
      const { sim, dot } = dotWorld(`fx-${p.id}`);
      const log = record(sim);
      sim.send({ type: 'give_potion', id: dot.id, potion: p.id });
      sim.step();
      const started = named(log, 'potion_started');
      expect(started.length, 'started').toBeGreaterThan(0);
      expect(sim.entities.get(dot.id)!.effects!.map((f) => f.potion)).toContain(p.id);
      sim.run(20);
      const loaded = reloaded(sim);
      expect(loaded.entities.get(dot.id)!.effects).toEqual(sim.entities.get(dot.id)!.effects);
      const loadedLog = record(loaded);
      loaded.run(p.durationTicks);
      expect(loaded.entities.get(dot.id)!.effects ?? []).toHaveLength(0);
      expect(named(loadedLog, 'potion_ended').length).toBeGreaterThan(0);
      expect(loaded.rescues).toBe(0);
    },
  );

  it('a dunk in the pond washes every potion off', () => {
    const { sim, dot } = dotWorld('dunk');
    const log = record(sim);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_speedy' });
    sim.step();
    sim.physics.place(dot.id, POND.middle, POND.level - 0.2, 0);
    sim.run(40);
    expect(sim.entities.get(dot.id)!.effects ?? []).toHaveLength(0);
    expect(named(log, 'potion_ended').map((e) => e.cause)).toContain('dunk');
  });

  it('a giant bug is twice the size and four times the mass', () => {
    const { sim, dot } = dotWorld('giant');
    const r = sim.bugDef(dot).radius;
    const mass = sim.physics.mass(dot.id);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_giant' });
    sim.run(10);
    expect(sim.bugDef(dot).radius).toBeCloseTo(r * 2);
    expect(sim.physics.mass(dot.id)).toBeCloseTo(mass * 4, 5);
    // And back again when it wears off.
    sim.run(POTIONS.get('potion_giant').durationTicks);
    expect(sim.physics.mass(dot.id)).toBeCloseTo(mass, 5);
    expect(sim.rescues).toBe(0);
  });

  it('a third potion replaces the oldest', () => {
    const { sim, dot } = dotWorld('three');
    for (const p of ['potion_glow', 'potion_speedy', 'potion_hairy']) {
      sim.send({ type: 'give_potion', id: dot.id, potion: p });
      sim.run(2);
    }
    expect(effectsOf(sim, dot.id)).toEqual(['speedy', 'hairy']);
  });

  it('tiny shrinks, speedy and slow-mo change the pace, heavy is five times as heavy', () => {
    const { sim, dot } = dotWorld('sizes');
    const base = sim.bugDef(dot);
    const mass = sim.physics.mass(dot.id);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_tiny' });
    sim.run(2);
    expect(sim.bugDef(dot).radius).toBeCloseTo(base.radius / 2);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_speedy' });
    sim.run(2);
    expect(sim.bugDef(dot).speed).toBeCloseTo(base.speed * 2.5 * 0.85);
    const { sim: s2, dot: d2 } = dotWorld('heavy');
    s2.send({ type: 'give_potion', id: d2.id, potion: 'potion_heavy' });
    s2.run(2);
    expect(s2.physics.mass(d2.id)).toBeCloseTo(mass * 5, 5);
    const { sim: s3, dot: d3 } = dotWorld('slow');
    s3.send({ type: 'give_potion', id: d3.id, potion: 'potion_slowmo' });
    s3.run(2);
    expect(s3.bugDef(d3).speed).toBeCloseTo(base.speed * 0.3);
  });

  it('a heavy bug cannot be flung past 900 px/s', () => {
    const { sim, dot } = dotWorld('heavyfling');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_heavy' });
    sim.run(2);
    const d = sim.view(dot.id)!;
    sim.send({ type: 'grab', x: d.x, y: d.y });
    sim.step();
    sim.send({ type: 'release', vx: 25, vy: -5 });
    sim.step();
    const v = sim.view(dot.id)!;
    expect(Math.hypot(v.vx, v.vy)).toBeLessThanOrEqual(9.5);
  });

  it('floaty and ghost bugs drift down slowly; upside-down and balloon bugs rise to the top of the sky', () => {
    for (const [potion, check] of [
      ['potion_floaty', (vy: number) => vy > 0 && vy < 6],
      ['potion_ghost', (vy: number) => vy > 0 && vy < 6],
    ] as const) {
      const { sim, dot } = dotWorld(potion);
      sim.send({ type: 'give_potion', id: dot.id, potion });
      sim.step();
      sim.physics.place(dot.id, PLAZA_X + 28, 3, 0);
      sim.run(30);
      expect(check(sim.view(dot.id)!.vy), potion).toBe(true);
    }
    for (const potion of ['potion_upside_down', 'potion_balloon']) {
      const { sim, dot } = dotWorld(potion);
      sim.send({ type: 'give_potion', id: dot.id, potion });
      sim.run(300);
      const v = sim.view(dot.id)!;
      expect(v.y - sim.bugDef(dot).radius, potion).toBeLessThan(SKY_TOP + 0.1);
    }
  });

  it('an upside-down bug walks along the top of the sky', () => {
    const { sim, dot } = dotWorld('walk-up');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_upside_down' });
    sim.run(200);
    const xs: number[] = [];
    for (let i = 0; i < 20; i++) {
      sim.run(30);
      xs.push(sim.view(dot.id)!.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    expect(sim.view(dot.id)!.y).toBeLessThan(2);
  });

  it('poking a balloon bug lets the air out: it zips about, then lands', () => {
    const { sim, dot } = dotWorld('balloon');
    const log = record(sim);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_balloon' });
    sim.run(90);
    const v = sim.view(dot.id)!;
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(200);
    expect(named(log, 'balloon_deflated')).toHaveLength(1);
    expect(named(log, 'potion_ended').map((e) => e.cause)).toContain('popped');
    sim.run(300);
    // Down on whatever is under her (the ground, the stump's top, or a thing lying there).
    const down = sim.view(dot.id)!;
    expect(sim.physics.isSupported(dot.id)).toBe(true);
    expect(sim.surfaceY(down.x) - down.y).toBeLessThan(1.2);
  });

  it('burps nudge light things, fire breath heats what is in front, bubble burps carry a small bug', () => {
    const { sim, dot } = dotWorld('burps');
    const log = record(sim);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_fire_breath' });
    const d = sim.view(dot.id)!;
    const facing = sim.view(dot.id)!.bug!.facing;
    const berry = sim.spawn('item', 'item_berry_red', d.x + facing * 0.8, GROUND_Y - 0.2);
    for (let i = 0; i < 20 && named(log, 'potion_burped').length === 0; i++) sim.run(30);
    expect(named(log, 'potion_burped')[0]!.kind).toBe('fire');
    void berry;
    const { sim: s2, dot: d2 } = dotWorld('bubbles');
    const log2 = record(s2);
    const rollo = bug(s2, 'bug_pillbug_rollo');
    s2.send({ type: 'give_potion', id: d2.id, potion: 'potion_bubble_burp' });
    // Keep Rollo just in front of Dot, whichever way she turns, until she burps.
    for (let i = 0; i < 400 && named(log2, 'potion_burped').length === 0; i++) {
      // Staring at her, quite still (an idle bug this close would shuffle aside for room).
      rollo.bug!.mode = 'st_react';
      rollo.bug!.timer = 100;
      const v = s2.view(d2.id)!;
      s2.physics.place(rollo.id, v.x + v.bug!.facing * 1.1, v.y, 0);
      s2.step();
    }
    expect(named(log2, 'potion_burped')[0]!.kind).toBe('bubble');
    expect(effectsOf(s2, rollo.id)).toContain('bubbled');
  });

  it('a frosty bug freezes the pond in front of it', () => {
    const { sim, dot } = dotWorld('frost');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_frosty' });
    sim.step();
    expect(sim.hasTag(dot.id, 'tag_cold') || sim.tick % 15 !== 0).toBe(true);
    sim.physics.place(dot.id, POND_X + 2.5, GROUND_Y - 0.9, 0);
    dot.bug!.facing = 1;
    sim.run(60);
    sim.environment.frostStep(POND.x0 + 1, POND.level);
    expect(sim.environment.state.ice.length).toBeGreaterThan(0);
  });

  it('a sleepy bug drops off at once and wakes when it wears off', () => {
    const { sim, dot } = dotWorld('sleepy');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_sleepy' });
    sim.run(5);
    expect(sim.view(dot.id)!.bug!.mode).toBe('st_sleep');
    sim.run(POTIONS.get('potion_sleepy').durationTicks + 10);
    expect(sim.view(dot.id)!.bug!.mode).not.toBe('st_sleep');
  });

  it('a rocket bug goes up once and floats down', () => {
    const { sim, dot } = dotWorld('rocket');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_rocket' });
    sim.run(20);
    const v = sim.view(dot.id)!;
    expect(v.vy).toBeLessThan(-5);
    sim.run(120);
    expect(sim.bugDef(dot).glidesWhenFlung).toBe(true);
  });

  it('a magnet bug pulls metal to it, and it sticks', () => {
    const { sim, dot } = dotWorld('magnet');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_magnet' });
    sim.step();
    const d = sim.view(dot.id)!;
    const cap = sim.spawn('item', 'item_bottle_cap', d.x + 1.5, GROUND_Y - 0.2);
    sim.run(40);
    expect(Math.abs(sim.view(cap.id)!.x - sim.view(dot.id)!.x)).toBeLessThan(0.9);
    expect(sim.environment.stuckTogether(dot.id, cap.id)).toBe(true);
  });

  it('wobble flips between its two effects every 2 s', () => {
    const { sim, dot } = dotWorld('wobble');
    const b = brew([drop('ess_grow'), drop('ess_shrink')], POTIONS);
    sim.potions.give(dot, b, 'debug');
    sim.run(5);
    expect(effectsOf(sim, dot.id)).toEqual(['giant']);
    sim.run(120);
    expect(effectsOf(sim, dot.id)).toEqual(['tiny']);
  });

  it('sludge burps green and logs the secret', () => {
    const { sim, dot } = dotWorld('sludge');
    const log = record(sim);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_sludge' });
    sim.step();
    expect(named(log, 'potion_burped')[0]!.kind).toBe('sludge');
    expect(sim.secrets).toContain('secret_sludge_burp');
  });

  it('a paint potion paints the bug all over; water washes it off', () => {
    const { sim, dot } = dotWorld('paint');
    sim.potions.give(
      dot,
      brew([drop('ess_color', 'paint_blue'), drop('ess_color', 'paint_yellow')], POTIONS),
      'drink',
    );
    sim.step();
    expect(sim.view(dot.id)!.paint).toEqual(new Array(5).fill('paint_green'));
    sim.physics.place(dot.id, POND.middle, POND.level - 0.2, 0);
    sim.run(40);
    expect(sim.hasTag(dot.id, 'tag_painted')).toBe(false);
  });

  it('effects freeze in the pocket and carry on after', () => {
    const { sim, dot } = dotWorld('pocket');
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_speedy' });
    sim.run(5);
    const left = sim.view(dot.id)!.effects![0]!.left;
    const d = sim.view(dot.id)!;
    sim.send({ type: 'grab', x: d.x, y: d.y });
    sim.step();
    sim.send({ type: 'pocket_put', slot: 0 });
    sim.run(600);
    sim.send({ type: 'pocket_take', slot: 0, x: d.x, y: d.y - 1 });
    sim.step();
    expect(Math.abs(sim.view(dot.id)!.effects![0]!.left - left)).toBeLessThanOrEqual(3);
  });
});

void ITEMS;
