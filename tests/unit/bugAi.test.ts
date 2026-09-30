import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/game/core/rng';
import type { Entity } from '../../src/game/core/entities';
import { BUGS } from '../../src/game/data/bugs';
import type { AdvertCandidate, BugContext } from '../../src/game/systems/bugAi';
import {
  dizzySeconds,
  hopVelocity,
  likingOf,
  makeDizzy,
  newBugBrain,
  pokeBug,
  releaseBug,
  scoreAdvert,
  springLaunched,
  updateBug,
  urgency,
} from '../../src/game/systems/bugAi';

const DOT = BUGS.get('bug_ladybug_dot');
const GLORP = BUGS.get('bug_snail_glorp');
const FLAT = { x: 0, y: -1 };

const berry = (x: number, over: Partial<AdvertCandidate> = {}): AdvertCandidate => ({
  id: 50,
  defId: 'item_berry_red',
  x,
  y: 8.8,
  action: 'eat',
  needs: { need_hunger: 20 },
  claimed: false,
  ...over,
});

const ctx = (over: Partial<BugContext> = {}): BugContext => ({
  tick: 100,
  def: DOT,
  state: { x: 10, y: 8.6, angle: 0, vx: 0, vy: 0, av: 0 },
  held: false,
  support: FLAT,
  impact: 0,
  worldWidth: 38.4,
  rng: new Rng('ai'),
  adverts: () => [],
  target: () => null,
  obstacle: () => null,
  ...over,
});

const bug = (): Entity => ({ id: 1, kind: 'bug', defId: DOT.id, bug: newBugBrain(10, new Rng('b')) });

describe('need math', () => {
  it('urgency grows with the square of what is missing', () => {
    expect(urgency(100)).toBe(0);
    expect(urgency(0)).toBe(100);
    expect(urgency(50)).toBe(25);
    expect(urgency(10)).toBeCloseTo(81);
  });

  it('dizzy time follows clamp((v - 9) / 2.5, 0, 4) + 2, plus repeats, capped at 8', () => {
    expect(dizzySeconds(9)).toBe(2);
    expect(dizzySeconds(14)).toBe(4);
    expect(dizzySeconds(30)).toBe(6);
    expect(dizzySeconds(30, 1)).toBe(7);
    expect(dizzySeconds(30, 5)).toBe(8);
  });

  it('knows what each bug likes', () => {
    expect(likingOf(DOT, 'item_berry_red')).toBe('liked');
    expect(likingOf(GLORP, 'item_leaf')).toBe('liked');
    expect(likingOf(GLORP, 'item_berry_red')).toBe('neutral');
  });

  it('scores hungry bugs toward nearby food, liked food higher, far food lower', () => {
    const e = bug();
    e.bug!.needs.need_hunger = 10;
    const near = scoreAdvert(e.bug!, DOT, berry(11), 10, 0);
    const far = scoreAdvert(e.bug!, DOT, berry(18), 10, 0);
    const neutral = scoreAdvert(e.bug!, GLORP, berry(11), 10, 0);
    expect(near).toBeGreaterThan(8);
    expect(far).toBeLessThan(near);
    expect(near).toBeGreaterThan(neutral);
    e.bug!.needs.need_hunger = 95;
    expect(scoreAdvert(e.bug!, DOT, berry(11), 10, 0)).toBeLessThan(1);
  });

  it('prefers things it has not used lately', () => {
    const e = bug();
    e.bug!.needs.need_hunger = 20;
    const fresh = scoreAdvert(e.bug!, DOT, berry(11), 10, 1000);
    e.bug!.used.push({ id: 50, tick: 900 });
    expect(scoreAdvert(e.bug!, DOT, berry(11), 10, 1000)).toBeCloseTo((fresh / 1.6) * 0.4);
  });
});

describe('updateBug', () => {
  it('decays needs every tick, weighted by personality', () => {
    const e = bug();
    const before = { ...e.bug!.needs };
    for (let i = 0; i < 60; i++) updateBug(e, ctx({ held: true }));
    expect(before.need_hunger - e.bug!.needs.need_hunger).toBeCloseTo(0.25);
    expect(before.need_fun - e.bug!.needs.need_fun).toBeCloseTo(0.3 * 1.4);
  });

  it('rests, then wanders within range, walking along the ground', () => {
    const e = bug();
    const c = ctx();
    while (e.bug!.mode === 'st_idle') updateBug(e, c);
    expect(e.bug!.mode).toBe('st_wander');
    expect(Math.abs(e.bug!.targetX - 10)).toBeLessThanOrEqual(6);
    const d = updateBug(e, c);
    expect(Math.sign(d.velocity!.x)).toBe(e.bug!.facing);
    expect(Math.abs(d.velocity!.x)).toBeCloseTo(DOT.speed);
  });

  it('walks along slopes and holds still on them', () => {
    const e = bug();
    e.bug!.mode = 'st_wander';
    e.bug!.timer = 999;
    e.bug!.targetX = 15;
    e.bug!.decideIn = 999;
    const slope = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }; // rising to the right
    const d = updateBug(e, ctx({ support: slope }));
    expect(d.velocity!.x).toBeGreaterThan(0);
    expect(d.velocity!.y).toBeLessThan(0);
    e.bug!.mode = 'st_idle';
    e.bug!.timer = 999;
    const still = updateBug(e, ctx({ support: slope }));
    // Pre-cancels one tick of gravity along the slope, so it does not slide.
    expect(still.velocity!.x).toBeGreaterThan(0);
    expect(Math.hypot(still.velocity!.x, still.velocity!.y)).toBeLessThan(0.5);
  });

  it('never wanders outside the world', () => {
    const e = bug();
    const c = ctx({ state: { x: 0.8, y: 8.6, angle: 0, vx: 0, vy: 0, av: 0 } });
    for (let i = 0; i < 2000; i++) {
      e.bug!.mode = 'st_idle';
      e.bug!.timer = 0;
      e.bug!.decideIn = 99;
      updateBug(e, c);
      expect(e.bug!.targetX).toBeGreaterThan(0.5);
    }
  });

  it('goes for food when hungry, then eats it', () => {
    const e = bug();
    e.bug!.needs.need_hunger = 10;
    e.bug!.decideIn = 1;
    const target = { x: 10.6, y: 8.8, halfWidth: 0.17, halfHeight: 0.17, angle: 0, held: false };
    const c = ctx({ adverts: () => [berry(10.6)], target: () => target });
    const first = updateBug(e, c);
    expect(e.bug!.mode).toBe('st_seek');
    expect(first.notices).toContainEqual({ type: 'chose', action: 'eat', targetId: 50 });
    updateBug(e, c);
    expect(e.bug!.mode).toBe('st_eat');
    let ate = null;
    for (let i = 0; i < 200 && !ate; i++) ate = updateBug(e, c).eat;
    expect(ate).toEqual({ itemId: 50, liking: 'liked' });
    // Liked food fills 40.
    expect(e.bug!.needs.need_hunger).toBeGreaterThan(45);
  });

  it('skips food another bug is already going for', () => {
    const e = bug();
    e.bug!.needs.need_hunger = 5;
    e.bug!.decideIn = 1;
    updateBug(e, ctx({ adverts: () => [berry(10.6, { claimed: true })] }));
    expect(e.bug!.mode).not.toBe('st_seek');
  });

  it('gives up when the food is picked up by the player', () => {
    const e = bug();
    e.bug!.needs.need_hunger = 5;
    e.bug!.decideIn = 1;
    const target = { x: 14, y: 8.8, halfWidth: 0.17, halfHeight: 0.17, angle: 0, held: false };
    const c = ctx({ adverts: () => [berry(14)], target: () => target });
    updateBug(e, c);
    expect(e.bug!.mode).toBe('st_seek');
    target.held = true;
    updateBug(e, c);
    expect(e.bug!.mode).toBe('st_idle');
  });

  it('hops onto a spring and counts the bounce only when the spring launches it', () => {
    const e = bug();
    e.bug!.needs.need_fun = 0;
    e.bug!.decideIn = 1;
    const spring: AdvertCandidate = {
      id: 7,
      defId: 'item_spring_coil',
      x: 11.2,
      y: 8.7,
      action: 'bounce',
      needs: { need_fun: 30, need_energy: -5 },
      claimed: false,
    };
    const target = { x: 11.2, y: 8.7, halfWidth: 0.26, halfHeight: 0.3, angle: 0, held: false };
    const state = { x: 10.2, y: 8.64, angle: 0, vx: 0, vy: 0, av: 0 };
    const c = ctx({ state, adverts: () => [spring], target: () => target });
    updateBug(e, c);
    expect(e.bug!.action).toBe('bounce');
    const hop = updateBug(e, c);
    expect(e.bug!.mode).toBe('st_use');
    expect(hop.velocity!.y).toBeLessThan(-3);
    expect(hop.notices).toContainEqual({ type: 'hopped' });
    expect(springLaunched(e.bug!, 99, 0)).toBe(false);
    expect(springLaunched(e.bug!, 7, 0)).toBe(true);
    expect(e.bug!.needs.need_fun).toBe(30);
    expect(springLaunched(e.bug!, 7, 0)).toBe(false);
  });

  it('is held while held, airborne once let go, and dizzy after a hard landing', () => {
    const e = bug();
    updateBug(e, ctx({ held: true }));
    expect(e.bug!.mode).toBe('st_held');
    const flying = ctx({ support: null, state: { x: 10, y: 3, angle: 0, vx: 5, vy: -5, av: 0 } });
    expect(updateBug(e, flying).velocity).toBeNull();
    expect(e.bug!.mode).toBe('st_airborne');
    const d = updateBug(e, ctx({ impact: 14, tick: 500 }));
    expect(d.notices).toContainEqual({ type: 'landed', speed: 14 });
    expect(d.notices).toContainEqual({ type: 'dizzy', speed: 14, durationTicks: 240 });
    expect(e.bug!.mode).toBe('st_dizzy');
    expect(e.bug!.timer).toBe(240);
  });

  it('stacks dizzy time for repeat hard landings within 10 s', () => {
    const e = bug();
    expect(makeDizzy(e.bug!, 9, 0)).toBe(120);
    expect(makeDizzy(e.bug!, 9, 300)).toBe(180);
    expect(makeDizzy(e.bug!, 9, 500)).toBe(240);
    expect(makeDizzy(e.bug!, 9, 2000)).toBe(120);
  });

  it('gets knocked airborne by a hit, and lands softly without getting dizzy', () => {
    const e = bug();
    updateBug(e, ctx({ support: null, state: { x: 10, y: 7, angle: 0, vx: 6, vy: -2, av: 0 } }));
    expect(e.bug!.mode).toBe('st_airborne');
    const d = updateBug(e, ctx({ impact: 4 }));
    expect(d.notices).toEqual([{ type: 'landed', speed: 4 }]);
    expect(e.bug!.mode).toBe('st_landing');
  });

  it('Dot has fun being flung; poking makes bugs react unless they are dizzy', () => {
    const e = bug();
    e.bug!.needs.need_fun = 50;
    releaseBug(e.bug!, DOT, true);
    expect(e.bug!.needs.need_fun).toBe(65);
    expect(e.bug!.mode).toBe('st_airborne');
    e.bug!.mode = 'st_idle';
    expect(pokeBug(e.bug!)).toBe(true);
    expect(e.bug!.mode).toBe('st_react');
    makeDizzy(e.bug!, 10, 0);
    expect(pokeBug(e.bug!)).toBe(false);
  });

  it('computes a hop that lands on its target', () => {
    const v = hopVelocity(0, 0, 1, -0.5, 0.5);
    const t = 0.5;
    expect(v.x * t).toBeCloseTo(1);
    expect(v.y * t + 0.5 * 20 * t * t).toBeCloseTo(-0.5);
  });
});
