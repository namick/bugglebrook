import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { CONTENT } from '../../src/game/data';
import { HONEY_LOADS, LUMA_AFTER, POLLEN_EVERY } from '../../src/game/systems/musicBugs';
import { bugPart } from '../../src/renderer/src/audio/musicToys';
import { PLAZA_X } from './world';

// M11: the music bugs M9 left out (game design doc, sections 4 and 10):
// how Buzzby, Fiddle, and Luma are found, and what each one does.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const FLOWERBED = CONTENT.areas.get('area_flowerbed_stage');
const PORCH = CONTENT.areas.get('area_under_porch');
const stage = FLOWERBED.fixtures!.find((f) => f.kind === 'stage')!;

function bugOf(sim: Sim, defId: string): Entity | undefined {
  return sim.entities.ofKind('bug').find((b) => b.defId === defId);
}

function calm(sim: Sim, b: Entity): void {
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: 90 });
}

describe('finding the music bugs', () => {
  it('Buzzby comes out of the tulip when an instrument is played on the stage by day', () => {
    const sim = Sim.create({ seed: 'buzzby' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 11 });
    sim.step();
    const log = record(sim);
    const x = FLOWERBED.xStart + stage.x;
    const maraca = sim.spawn('item', 'item_inst_seedpod_maraca', x, stage.y - 0.6);
    sim.run(60);
    expect(bugOf(sim, 'bug_bee_buzzby')).toBeUndefined();
    const s = sim.view(maraca.id)!;
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.run(5);
    expect(sim.secrets).toContain('secret_buzzby_found');
    expect(sim.cast.joined('bug_bee_buzzby')).toBe(true);
    expect(named(log, 'hideout_stirred').some((e) => e.fixture === 'fix_tulip')).toBe(true);
  });

  it('but not at night, and not off the stage', () => {
    const sim = Sim.create({ seed: 'buzzby-night' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 23 });
    sim.step();
    const x = FLOWERBED.xStart + stage.x;
    const maraca = sim.spawn('item', 'item_inst_seedpod_maraca', x, stage.y - 0.6);
    sim.run(60);
    let s = sim.view(maraca.id)!;
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.run(5);
    expect(sim.cast.joined('bug_bee_buzzby')).toBe(false);
    sim.remove(maraca.id);
    sim.send({ type: 'set_time', hour: 11 });
    const off = sim.spawn('item', 'item_inst_seedpod_maraca', FLOWERBED.xStart + 7.5, 8);
    sim.run(60);
    s = sim.view(off.id)!;
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.run(5);
    expect(sim.cast.joined('bug_bee_buzzby')).toBe(false);
  });

  it('Fiddle climbs out when the sequencer has four caps on at night', () => {
    const sim = Sim.create({ seed: 'fiddle' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 23 });
    sim.run(31);
    const rows = sim.places.sequencer.patterns[sim.places.sequencer.current];
    rows[0] = 0b1;
    rows[1] = 0b10;
    rows[2] = 0b100;
    sim.run(31);
    expect(sim.cast.joined('bug_cricket_fiddle')).toBe(false);
    rows[3] = 0b1000;
    sim.run(31);
    expect(sim.secrets).toContain('secret_fiddle_found');
    const fiddle = bugOf(sim, 'bug_cricket_fiddle')!;
    expect(sim.view(fiddle.id)!.bug!.fiddling).toBe(true);
  });

  it('Luma flies in to the porch lamp left on at night', () => {
    const sim = Sim.create({ seed: 'luma' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.send({ type: 'set_time', hour: 22 });
    sim.step();
    sim.places.state.lampOn = true;
    sim.run(LUMA_AFTER - 60);
    expect(sim.cast.joined('bug_moth_luma')).toBe(false);
    sim.run(120);
    expect(sim.secrets).toContain('secret_luma_found');
    const luma = bugOf(sim, 'bug_moth_luma')!;
    const lamp = PORCH.fixtures!.find((f) => f.kind === 'porch_lamp')!;
    expect(Math.abs(sim.view(luma.id)!.x - (PORCH.xStart + lamp.x))).toBeLessThan(3);
  });

  it('the lamp by day does nothing', () => {
    const sim = Sim.create({ seed: 'luma-day' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.send({ type: 'set_time', hour: 12 });
    sim.step();
    sim.places.state.lampOn = true;
    sim.run(LUMA_AFTER + 120);
    expect(sim.cast.joined('bug_moth_luma')).toBe(false);
  });
});

describe('what they do', () => {
  it('Buzzby takes pollen to the thimble, and every fifth load makes a honey drop', () => {
    const sim = Sim.empty({ seed: 'pollen' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 10 });
    const x = PLAZA_X + 5;
    const bee = sim.spawn('bug', 'bug_bee_buzzby', x, sim.surfaceY(x) - 0.5);
    calm(sim, bee);
    const thimble = sim.spawn('item', 'item_hat_thimble', x + 4, sim.surfaceY(x + 4) - 0.3);
    const log = record(sim);
    // What the drop is when it is made: Buzzby loves honey and may eat it before the run ends.
    const made: string[] = [];
    sim.events.on('honey_made', (e) => made.push(sim.entities.get(e.itemId)?.defId ?? 'none'));
    sim.run(POLLEN_EVERY * (HONEY_LOADS + 2));
    const loads = named(log, 'pollen_delivered').filter((e) => e.itemId === thimble.id);
    expect(loads.length).toBeGreaterThanOrEqual(HONEY_LOADS);
    expect(named(log, 'honey_made')).toHaveLength(1);
    expect(made).toEqual(['item_honey_drop']);
  });

  it('never takes pollen to a thimble that is part of a setup', () => {
    const sim = Sim.empty({ seed: 'pollen-setup' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 10 });
    const x = PLAZA_X + 5;
    const bee = sim.spawn('bug', 'bug_bee_buzzby', x, sim.surfaceY(x) - 0.5);
    calm(sim, bee);
    const thimble = sim.spawn('item', 'item_hat_thimble', x + 4, sim.surfaceY(x + 4) - 0.3);
    sim.addTag(thimble.id, 'tag_player_setup', 'player', null);
    const log = record(sim);
    sim.run(POLLEN_EVERY * 3);
    expect(named(log, 'pollen_delivered')).toEqual([]);
  });

  it('Fiddle plays his own legs at night, now and then', () => {
    const sim = Sim.empty({ seed: 'legs' });
    sim.send({ type: 'set_time', hour: 22 });
    const x = PLAZA_X + 5;
    const fiddle = sim.spawn('bug', 'bug_cricket_fiddle', x, sim.surfaceY(x) - 0.5);
    calm(sim, fiddle);
    const log = record(sim);
    let fiddled = false;
    for (let i = 0; i < 60 * 60 && !fiddled; i++) {
      sim.step();
      fiddled = !!sim.view(fiddle.id)!.bug!.fiddling;
    }
    expect(fiddled).toBe(true);
    expect(named(log, 'bug_fiddled').length).toBeGreaterThan(0);
  });

  it('Luma loops round a light at night', () => {
    const sim = Sim.empty({ seed: 'loops' });
    sim.send({ type: 'set_time', hour: 22 });
    const x = PLAZA_X + 5;
    const luma = sim.spawn('bug', 'bug_moth_luma', x, sim.surfaceY(x) - 0.5);
    calm(sim, luma);
    const lamp = sim.spawn('item', 'item_flashlight_pen', x + 3, sim.surfaceY(x + 3) - 0.2);
    sim.addTag(lamp.id, 'tag_glowing', 'player', null);
    const log = record(sim);
    sim.run(60 * 40);
    expect(named(log, 'moth_circled').some((e) => !e.own)).toBe(true);
  });

  it('in sunglasses, Luma stays awake by day', () => {
    const sim = Sim.empty({ seed: 'shades' });
    sim.send({ type: 'set_time', hour: 12 });
    const x = PLAZA_X + 5;
    const luma = sim.spawn('bug', 'bug_moth_luma', x, sim.surfaceY(x) - 0.5);
    sim.step();
    expect(sim.weather.bedtime(sim.bugDef(luma), luma.id)).toBe(true);
    sim.wardrobe.putOn(luma, sim.spawn('item', 'item_acc_sunglasses', x + 3, 8.5), 'player', false, true);
    expect(sim.weather.bedtime(sim.bugDef(luma), luma.id)).toBe(false);
  });

  it('Fiddle walks a melody and Buzzby runs up the scale on any pitched instrument', () => {
    const fiddle = Array.from({ length: 32 }, (_, s) => bugPart('harp', s, 1, 'fiddle'));
    expect(fiddle.filter((n) => n !== null)).toHaveLength(8);
    expect(fiddle.every((n, s) => (s % 4 === 0) === (n !== null))).toBe(true);
    const buzz = Array.from({ length: 16 }, (_, s) => bugPart('kazoo', s, 1, 'buzz'));
    const degrees = buzz.filter((n): n is { degree: number; velocity: number } => n !== null && n !== 'hit');
    expect(degrees.map((d) => d.degree)).toEqual([0, 1, 2, 3, 4, 0, 1, 2]);
    // Unpitched instruments keep their own beat.
    expect(bugPart('drum', 0, 1, 'fiddle')).toBe('hit');
  });

  it('Luma in the stage spotlight at night dances (secret_moth_spotlight)', () => {
    const sim = Sim.empty({ seed: 'spotlight' });
    sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
    sim.send({ type: 'set_time', hour: 23 });
    const x = FLOWERBED.xStart + stage.x;
    // Found first: the spotlight secret needs her found.
    const luma = sim.cast.find('bug_moth_luma', x, stage.y - 1)!;
    calm(sim, luma);
    sim.run(40);
    expect(sim.secrets).toContain('secret_luma_found');
    expect(sim.secrets).not.toContain('secret_moth_spotlight');
    sim.places.state.stageLights = 3;
    sim.run(40);
    expect(sim.secrets).toContain('secret_moth_spotlight');
  });
});
