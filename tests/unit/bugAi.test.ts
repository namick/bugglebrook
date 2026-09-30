import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/game/core/rng';
import { BUGS } from '../../src/game/data/bugs';
import { newBugBrain, updateBug } from '../../src/game/systems/bugAi';
import type { BugContext } from '../../src/game/systems/bugAi';
import type { Entity } from '../../src/game/core/entities';

const ctx = (over: Partial<BugContext> = {}): BugContext => ({
  def: BUGS.get('bip'),
  state: { x: 10, y: 8, angle: 0, vx: 0, vy: 0, av: 0 },
  held: false,
  supported: true,
  worldWidth: 48,
  rng: new Rng('ai'),
  ...over,
});

const bug = (): Entity => ({ id: 1, kind: 'bug', defId: 'bip', bug: newBugBrain(10) });

describe('updateBug', () => {
  it('rests, then picks a target within wander range and walks toward it', () => {
    const e = bug();
    const c = ctx();
    updateBug(e, c);
    while (e.bug!.mode === 'idle') updateBug(e, c);
    expect(e.bug!.mode).toBe('walk');
    expect(Math.abs(e.bug!.targetX - 10)).toBeLessThanOrEqual(5);
    const decision = updateBug(e, c);
    expect(Math.sign(decision.vx!)).toBe(e.bug!.facing);
    expect(Math.abs(decision.vx!)).toBeCloseTo(BUGS.get('bip').speed);
  });

  it('stops when it arrives', () => {
    const e = bug();
    e.bug = { mode: 'walk', timer: 0, targetX: 10.05, facing: 1 };
    const decision = updateBug(e, ctx());
    expect(e.bug.mode).toBe('idle');
    expect(decision.vx).toBe(0);
  });

  it('never targets outside the world', () => {
    const e = bug();
    const c = ctx({ state: { x: 0.8, y: 8, angle: 0, vx: 0, vy: 0, av: 0 } });
    for (let i = 0; i < 2000; i++) {
      e.bug!.mode = 'idle';
      e.bug!.timer = 0;
      updateBug(e, c);
      expect(e.bug!.targetX).toBeGreaterThan(0);
    }
  });

  it('lets physics take over while held or airborne', () => {
    const e = bug();
    expect(updateBug(e, ctx({ held: true })).vx).toBeNull();
    expect(e.bug!.mode).toBe('held');
    const airborne = ctx({ supported: false, state: { x: 10, y: 3, angle: 0, vx: 5, vy: -5, av: 0 } });
    expect(updateBug(e, airborne).vx).toBeNull();
    expect(e.bug!.mode).toBe('tumble');
  });
});
