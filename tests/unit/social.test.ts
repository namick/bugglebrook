import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Needs } from '../../src/game/core/entities';
import { BUGS } from '../../src/game/data/bugs';
import { baseAffinity } from '../../src/game/data/affinity';
import { makeDizzy } from '../../src/game/systems/bugAi';
import { PLAZA_X } from './world';

// M4: bugs playing together (game design doc, section 5, "Bug to bug
// interactions"), sleep and nap piles, and each bug's signature behavior.

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

const FULL: Needs = { need_hunger: 100, need_fun: 100, need_energy: 100, need_social: 100, need_clean: 100 };

/** An empty plaza with bugs placed on flat ground (plaza-local x), all content unless told otherwise. */
function stage(
  seed: string,
  bugs: { def: string; x: number; needs?: Partial<Needs> }[],
): { sim: Sim; ids: number[] } {
  const sim = Sim.empty({ seed });
  const ids = bugs.map((b) => {
    const r = BUGS.get(b.def).radius;
    const e = sim.spawn('bug', b.def, PLAZA_X + b.x, GROUND_Y - r - 0.01);
    e.bug!.needs = { ...FULL, ...b.needs };
    e.bug!.decideIn = 5;
    return e.id;
  });
  return { sim, ids };
}

const brainOf = (sim: Sim, id: number) => sim.entities.get(id)!.bug!;

describe('playing together', () => {
  it('lonely bugs chat: lines alternate between them, with pictures, and they feel better', () => {
    let chats = 0;
    for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      const { sim, ids } = stage(seed, [
        { def: 'bug_pillbug_rollo', x: 5, needs: { need_social: 15 } },
        { def: 'bug_snail_glorp', x: 7, needs: { need_social: 15 } },
      ]);
      const log = record(sim);
      sim.run(40 * 60);
      const lines = find(log, 'bug_chatted');
      if (lines.length === 0) continue;
      chats++;
      expect(lines.length).toBeGreaterThanOrEqual(3);
      // Speakers alternate.
      for (let i = 1; i < 3; i++) expect(lines[i]!.id).not.toBe(lines[i - 1]!.id);
      const ends = find(log, 'bug_social_ended').filter((e) => e.kind === 'soc_chat');
      expect(ends.some((e) => e.happy)).toBe(true);
      for (const id of ids) expect(brainOf(sim, id).needs.need_social).toBeGreaterThan(20);
      expect(sim.affinityOf('bug_pillbug_rollo', 'bug_snail_glorp')).toBeGreaterThan(
        baseAffinity('bug_pillbug_rollo', 'bug_snail_glorp'),
      );
    }
    expect(chats).toBeGreaterThanOrEqual(3);
  });

  it('bored, cheeky bugs play tag: they take turns being it, then laugh', () => {
    let games = 0;
    for (const seed of ['t1', 't2', 't3', 't4', 't5', 't6']) {
      const { sim } = stage(seed, [
        { def: 'bug_ladybug_dot', x: 5, needs: { need_fun: 10, need_social: 40 } },
        { def: 'bug_grasshopper_boing', x: 7.5, needs: { need_fun: 10, need_social: 40 } },
      ]);
      const log = record(sim);
      sim.run(40 * 60);
      const tags = find(log, 'bug_tagged');
      if (!find(log, 'bug_socialized').some((e) => e.kind === 'soc_tag')) continue;
      games++;
      expect(tags.length).toBeGreaterThanOrEqual(1);
      const ended = find(log, 'bug_social_ended').filter((e) => e.kind === 'soc_tag');
      expect(ended.length).toBeGreaterThan(0);
      if (ended.some((e) => e.happy))
        expect(find(log, 'bug_reacted').some((e) => e.reaction === 'play')).toBe(true);
    }
    expect(games).toBeGreaterThanOrEqual(2);
  });

  it('two bugs play catch with a ball: throws are caught, and the ball stays in the world', () => {
    let played = 0;
    for (const seed of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) {
      const { sim } = stage(seed, [
        { def: 'bug_ladybug_dot', x: 5, needs: { need_fun: 10, need_social: 50 } },
        { def: 'bug_grasshopper_boing', x: 8, needs: { need_fun: 10, need_social: 50 } },
      ]);
      const ball = sim.spawn('item', 'item_rubber_ball', PLAZA_X + 6, GROUND_Y - 0.27);
      const log = record(sim);
      sim.run(45 * 60);
      const throws = find(log, 'bug_threw');
      if (throws.length === 0) continue;
      played++;
      expect(find(log, 'bug_caught').length).toBeGreaterThanOrEqual(1);
      expect(throws.every((t) => t.itemId === ball.id)).toBe(true);
      expect(sim.entities.has(ball.id)).toBe(true);
    }
    expect(played).toBeGreaterThanOrEqual(2);
  });

  it('a generous bug carries a snack to a hungry friend, who eats it', () => {
    let shared = 0;
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const { sim } = stage(seed, [
        { def: 'bug_pillbug_rollo', x: 5, needs: { need_social: 20 } },
        { def: 'bug_ladybug_dot', x: 8.5, needs: { need_hunger: 20 } },
      ]);
      // Dot is too comfy to go and get it herself.
      brainOf(sim, 2).decideIn = 100000;
      brainOf(sim, 2).timer = 100000;
      const berry = sim.spawn('item', 'item_berry_red', PLAZA_X + 3.6, GROUND_Y - 0.18);
      const log = record(sim);
      sim.run(40 * 60);
      const gifts = find(log, 'bug_shared');
      if (gifts.length === 0) continue;
      shared++;
      expect(gifts[0]).toMatchObject({ id: 1, partnerId: 2, itemId: berry.id });
      expect(find(log, 'bug_ate').some((e) => e.id === 2 && e.itemId === berry.id)).toBe(true);
      expect(sim.affinityOf('bug_pillbug_rollo', 'bug_ladybug_dot')).toBeGreaterThanOrEqual(
        baseAffinity('bug_pillbug_rollo', 'bug_ladybug_dot') + 0.05,
      );
    }
    expect(shared).toBeGreaterThanOrEqual(2);
  });

  it('a cheeky bug snatches a snack someone is carrying, and they chase', () => {
    let snatched = 0;
    for (const seed of ['n1', 'n2', 'n3', 'n4']) {
      const { sim, ids } = stage(seed, [
        { def: 'bug_pillbug_rollo', x: 4 },
        { def: 'bug_grasshopper_boing', x: 1.6, needs: { need_hunger: 45, need_fun: 50 } },
      ]);
      const [rollo] = ids;
      const berry = sim.spawn('item', 'item_berry_red', PLAZA_X + 5, GROUND_Y - 0.18);
      brainOf(sim, ids[1]!).decideIn = 30;
      sim.run(20);
      // Rollo is carrying the berry off to eat beside a friend far away.
      const rb = brainOf(sim, rollo!);
      rb.carrying = berry.id;
      rb.mode = 'st_seek';
      rb.action = 'eat';
      rb.targetId = -6;
      rb.targetX = PLAZA_X + 11;
      rb.timer = 100000;
      const log = record(sim);
      sim.run(25 * 60);
      const grabs = find(log, 'bug_snatched');
      if (grabs.length === 0) continue;
      snatched++;
      expect(grabs[0]).toMatchObject({ partnerId: rollo, itemId: berry.id });
      expect(find(log, 'bug_reacted').some((e) => e.id === rollo && e.reaction === 'robbed')).toBe(true);
      expect(find(log, 'bug_socialized').some((e) => e.kind === 'soc_steal')).toBe(true);
      // Somebody ends up eating it: the thief, or its owner after a tag.
      expect(find(log, 'bug_ate').some((e) => e.itemId === berry.id)).toBe(true);
    }
    expect(snatched).toBeGreaterThanOrEqual(2);
  });

  it('a friend pats a dizzy bug, which gets better sooner', () => {
    const { sim, ids } = stage('pat', [
      { def: 'bug_ladybug_dot', x: 5 },
      { def: 'bug_pillbug_rollo', x: 7.5, needs: { need_social: 50 } },
    ]);
    const [dot, rollo] = ids;
    sim.run(30);
    const ticks = makeDizzy(brainOf(sim, dot!), 20, sim.tick);
    const start = sim.tick;
    brainOf(sim, rollo!).decideIn = 1;
    const log = record(sim);
    sim.run(ticks + 60);
    expect(find(log, 'bug_comforted')[0]).toMatchObject({ id: rollo, partnerId: dot });
    const rec = log.find((e) => e.name === 'bug_recovered')!;
    expect(rec.tick - start).toBeLessThan(ticks - 30);
  });

  it('idle bugs turn to look at a crash; the one who crashed may laugh along', () => {
    const { sim, ids } = stage('gawk', [
      { def: 'bug_ladybug_dot', x: 5 },
      { def: 'bug_snail_glorp', x: 8 },
      { def: 'bug_grasshopper_boing', x: 10 },
    ]);
    const [dot, glorp, boing] = ids;
    sim.run(30);
    for (const id of ids) brainOf(sim, id).decideIn = 100000;
    const log = record(sim);
    const s = sim.view(dot!)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'drag', x: s.x, y: 3 });
    sim.run(40);
    sim.send({ type: 'release', vx: 0, vy: 20 });
    sim.run(4 * 60);
    expect(find(log, 'bug_dizzy').map((e) => e.id)).toContain(dot);
    const lookers = find(log, 'bug_gawked').map((e) => e.id);
    expect(lookers).toContain(glorp);
    expect(lookers).toContain(boing);
    expect(find(log, 'bug_reacted').filter((e) => e.reaction === 'gawk').length).toBeGreaterThanOrEqual(2);
  });

  it('nervous Rollo, alone, ducks behind cover or curls up at a crash instead', () => {
    const { sim, ids } = stage('hide', [
      { def: 'bug_pillbug_rollo', x: 6 },
      { def: 'bug_ladybug_dot', x: 10 },
    ]);
    sim.spawn('item', 'item_bottle_cap', PLAZA_X + 4.6, GROUND_Y - 0.1);
    sim.run(30);
    for (const id of ids) brainOf(sim, id).decideIn = 100000;
    const log = record(sim);
    sim.noteLoud(PLAZA_X + 9, GROUND_Y - 0.5, null);
    sim.run(2);
    const rollo = ids[0]!;
    const hid = find(log, 'bug_hid').some((e) => e.id === rollo && e.on);
    const curled = find(log, 'bug_curled').some((e) => e.id === rollo && e.on);
    expect(hid || curled).toBe(true);
    sim.run(10 * 60);
    expect(['st_idle', 'st_wander', 'st_react', 'st_seek']).toContain(brainOf(sim, rollo).mode);
  });

  it('Boing hops onto a friend’s head for a ride and hops off again', () => {
    let rides = 0;
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const { sim, ids } = stage(seed, [
        { def: 'bug_snail_glorp', x: 6 },
        { def: 'bug_grasshopper_boing', x: 9, needs: { need_fun: 30, need_social: 40 } },
      ]);
      const [glorp, boing] = ids;
      brainOf(sim, glorp!).decideIn = 100000;
      brainOf(sim, glorp!).timer = 100000;
      const log = record(sim);
      let above = false;
      for (let t = 0; t < 40 * 60; t++) {
        sim.step();
        if (brainOf(sim, boing!).mode === 'st_ride')
          above ||= sim.view(boing!)!.y < sim.view(glorp!)!.y - 0.6;
      }
      const rode = find(log, 'bug_rode');
      if (!rode.some((e) => e.on)) continue;
      rides++;
      expect(above).toBe(true);
      expect(rode.some((e) => !e.on)).toBe(true);
    }
    expect(rides).toBeGreaterThanOrEqual(2);
  });
});

describe('sleep', () => {
  it('a tired bug naps, snores its energy back up, and wakes on its own', () => {
    const { sim, ids } = stage('nap', [{ def: 'bug_pillbug_rollo', x: 6, needs: { need_energy: 25 } }]);
    const log = record(sim);
    sim.run(10 * 60);
    expect(find(log, 'bug_slept').map((e) => e.id)).toContain(ids[0]);
    // Sleep refills 1.5 energy a second.
    sim.run(30 * 60);
    expect(brainOf(sim, ids[0]!).mode).toBe('st_sleep');
    expect(brainOf(sim, ids[0]!).needs.need_energy).toBeGreaterThan(65);
    // Rested: up it gets, on its own.
    brainOf(sim, ids[0]!).needs.need_energy = 99.6;
    sim.step();
    expect(find(log, 'bug_woke')).toContainEqual(expect.objectContaining({ id: ids[0], early: false }));
    expect(find(log, 'bug_reacted').some((e) => e.reaction === 'wake')).toBe(true);
  });

  it('a poke wakes a sleeper groggy, and it nods off again later if still tired', () => {
    const { sim, ids } = stage('poke', [{ def: 'bug_snail_glorp', x: 6, needs: { need_energy: 20 } }]);
    const log = record(sim);
    sim.run(10 * 60);
    const id = ids[0]!;
    expect(brainOf(sim, id).mode).toBe('st_sleep');
    const s = sim.view(id)!;
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.step();
    expect(find(log, 'bug_woke')).toContainEqual(expect.objectContaining({ id, early: true }));
    expect(sim.view(id)!.bug!.groggy).toBe(true);
    // A sleeping bug is never woken by the AI: only the player (or a hard bump) does it.
    brainOf(sim, id).needs.need_energy = 30;
    sim.run(25 * 60);
    expect(find(log, 'bug_slept').filter((e) => e.id === id).length).toBeGreaterThanOrEqual(2);
  });

  it('a sleepy bug curls up next to a sleeping friend: a nap pile', () => {
    const { sim, ids } = stage('pile', [
      { def: 'bug_pillbug_rollo', x: 6, needs: { need_energy: 20 } },
      { def: 'bug_snail_glorp', x: 10, needs: { need_energy: 40, need_social: 40 } },
    ]);
    const [rollo, glorp] = ids;
    // Rollo drops off first.
    brainOf(sim, glorp!).decideIn = 600;
    sim.run(8 * 60);
    expect(brainOf(sim, rollo!).mode).toBe('st_sleep');
    const socialBefore = brainOf(sim, glorp!).needs.need_social;
    sim.run(20 * 60);
    expect(brainOf(sim, glorp!).mode).toBe('st_sleep');
    const gap = Math.abs(sim.view(rollo!)!.x - sim.view(glorp!)!.x);
    expect(gap).toBeLessThan(BUGS.get('bug_pillbug_rollo').radius + BUGS.get('bug_snail_glorp').radius + 0.8);
    sim.run(10 * 60);
    expect(brainOf(sim, glorp!).needs.need_social).toBeGreaterThan(socialBefore);
  });
});

describe('signature behaviors', () => {
  it('Rollo curls into a rolling ball after three quick pokes, then peeks out', () => {
    const { sim, ids } = stage('curl', [{ def: 'bug_pillbug_rollo', x: 6 }]);
    const id = ids[0]!;
    sim.run(30);
    const log = record(sim);
    for (let i = 0; i < 3; i++) {
      const s = sim.view(id)!;
      sim.send({ type: 'poke', x: s.x, y: s.y });
      sim.run(20);
    }
    expect(find(log, 'bug_curled')).toContainEqual({ id, defId: 'bug_pillbug_rollo', on: true });
    expect(sim.isRolling(id)).toBe(true);
    sim.run(10 * 60);
    expect(find(log, 'bug_curled').some((e) => !e.on)).toBe(true);
    expect(find(log, 'bug_reacted').some((e) => e.reaction === 'peek')).toBe(true);
    expect(sim.isRolling(id)).toBe(false);
  });

  it('Rollo lines up loose pebbles in a neat row where he rests', () => {
    const { sim, ids } = stage('row5', [{ def: 'bug_pillbug_rollo', x: 5, needs: { need_fun: 60 } }]);
    const pebbles = [2.2, 8.5, 9.6].map(
      (x) => sim.spawn('item', 'item_pebble', PLAZA_X + x, GROUND_Y - 0.21).id,
    );
    sim.run(3 * 60 * 60);
    const b = brainOf(sim, ids[0]!);
    const x0 = b.restX + BUGS.get('bug_pillbug_rollo').radius + 0.4;
    const inRow = pebbles.filter((p) => {
      const x = sim.view(p)!.x;
      const k = Math.round((x - x0) / 0.55);
      return k >= 0 && Math.abs(x - (x0 + k * 0.55)) < 0.22;
    });
    expect(inRow.length).toBeGreaterThanOrEqual(2);
  });

  it('Dot climbs to the top of the stump, poses, and glides down with her wings open', () => {
    let shows = 0;
    for (const seed of ['d1', 'd2', 'd3', 'd4']) {
      const { sim, ids } = stage(seed, [{ def: 'bug_ladybug_dot', x: 11, needs: { need_fun: 35 } }]);
      const log = record(sim);
      let glided = false;
      for (let t = 0; t < 60 * 60; t++) {
        sim.step();
        glided ||= brainOf(sim, ids[0]!).gliding;
      }
      const posed = find(log, 'bug_posed');
      if (posed.length === 0) continue;
      shows++;
      expect(posed[0]!.y).toBeLessThan(4.2);
      expect(glided).toBe(true);
      expect(find(log, 'bug_dizzy')).toHaveLength(0);
      expect(find(log, 'bug_used').some((e) => e.action === 'perform')).toBe(true);
    }
    expect(shows).toBeGreaterThanOrEqual(3);
  });

  it('Dot comes into view and poses when she has been ignored for a while', () => {
    const { sim, ids } = stage('ignored', [{ def: 'bug_ladybug_dot', x: 3, needs: { need_social: 40 } }]);
    sim.send({ type: 'focus', x0: PLAZA_X + 20, x1: PLAZA_X + 20 + 19.2 });
    const log = record(sim);
    sim.run(3 * 60 * 60);
    const poses = find(log, 'bug_posed');
    expect(poses.length).toBeGreaterThan(0);
    expect(poses.some((p) => p.x > PLAZA_X + 22.5 && p.x < PLAZA_X + 36.7)).toBe(true);
    void ids;
  });

  it('Glorp leaves a slime trail that fades after 30 s, and other bugs slip on it', () => {
    const { sim, ids } = stage('slime', [
      { def: 'bug_snail_glorp', x: 4 },
      { def: 'bug_ladybug_dot', x: 2 },
    ]);
    const [glorp, dot] = ids;
    const g = brainOf(sim, glorp!);
    g.mode = 'st_wander';
    g.targetX = PLAZA_X + 9;
    g.timer = 100000;
    sim.run(6 * 60);
    const trail = sim.environment.state.slime;
    expect(trail.length).toBeGreaterThan(0);
    expect(Math.max(...trail.map((t) => t.x1)) - Math.min(...trail.map((t) => t.x0))).toBeGreaterThan(2);
    const log = record(sim);
    const d = brainOf(sim, dot!);
    d.slippedAt = -1;
    d.mode = 'st_wander';
    d.targetX = PLAZA_X + 8;
    d.timer = 100000;
    sim.run(4 * 60);
    expect(find(log, 'bug_slipped').map((e) => e.id)).toContain(dot);
    g.mode = 'st_idle';
    g.timer = 100000;
    g.decideIn = 100000;
    sim.run(32 * 60);
    expect(sim.environment.state.slime.every((t) => t.until > sim.tick)).toBe(true);
  });

  it('Boing gets about in big hops and never gets dizzy from his own', () => {
    const { sim, ids } = stage('hops', [{ def: 'bug_grasshopper_boing', x: 3, needs: { need_fun: 80 } }]);
    const b = brainOf(sim, ids[0]!);
    b.mode = 'st_wander';
    b.targetX = PLAZA_X + 11;
    b.timer = 100000;
    const log = record(sim);
    sim.run(4 * 60);
    const hops = find(log, 'bug_hopped');
    expect(hops.length).toBeGreaterThan(0);
    const lands = find(log, 'bug_landed');
    const spans = hops.map((h, i) => Math.abs((lands[i]?.x ?? h.x) - h.x)).filter((d) => d > 0.5);
    expect(Math.max(...spans)).toBeGreaterThan(2);
    sim.run(3 * 60 * 60);
    expect(find(log, 'bug_dizzy')).toHaveLength(0);
  });

  it('Skeet drifts away from a crowd of four or more', () => {
    const { sim, ids } = stage('crowd', [
      { def: 'bug_waterstrider_skeet', x: 6 },
      { def: 'bug_ladybug_dot', x: 4.9 },
      { def: 'bug_pillbug_rollo', x: 7.1 },
      { def: 'bug_snail_glorp', x: 4.2 },
      { def: 'bug_grasshopper_boing', x: 7.9 },
    ]);
    for (const id of ids.slice(1)) {
      brainOf(sim, id).decideIn = 100000;
      brainOf(sim, id).timer = 100000;
    }
    const start = sim.view(ids[0]!)!.x;
    brainOf(sim, ids[0]!).timer = 1;
    sim.run(8 * 60);
    expect(Math.abs(sim.view(ids[0]!)!.x - start)).toBeGreaterThan(1.2);
  });
});
