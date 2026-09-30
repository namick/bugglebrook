import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { Rng } from '../../src/game/core/rng';
import { REACTION_TYPES } from '../../src/game/events';
import { BUGS } from '../../src/game/data/bugs';
import {
  FULL_BELLY,
  SHELL_TICKS,
  TICKLE_FREE_TICKS,
  WOOZY_TICKS,
  moodOf,
  newBugBrain,
  pickVariant,
} from '../../src/game/systems/bugAi';
import { DROP_RULES, pickDropTarget } from '../../src/game/systems/dropTargets';
import { validateContent } from '../../src/game/data';
import { PLAZA_X } from './world';

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

/**
 * An empty world with one calm bug on flat ground, facing right, that will
 * not wander off during the test.
 */
function world(defId = 'bug_pillbug_rollo', x = PLAZA_X + 7): { sim: Sim; bug: number } {
  const sim = Sim.empty({ seed: 'feed' });
  const r = BUGS.get(defId).radius;
  const bug = sim.spawn('bug', defId, x, GROUND_Y - r - 0.01);
  sim.run(30);
  calm(sim, bug.id);
  return { sim, bug: bug.id };
}

/** Keep a bug standing still, facing right, with nothing to do. */
function calm(sim: Sim, id: number): void {
  const b = sim.entities.get(id)!.bug!;
  b.mode = 'st_idle';
  b.timer = 100000;
  b.decideIn = 100000;
  b.facing = 1;
  b.needs = { need_hunger: 60, need_fun: 90, need_energy: 90 };
}

/** Spawn a food, pick it up, and hold it at an offset from the bug's mouth, then let go gently. */
function dropNearMouth(sim: Sim, bug: number, food: string, dx: number, dy: number): number {
  const item = sim.spawn('item', food, PLAZA_X + 3, GROUND_Y - 0.4);
  sim.run(40);
  const s = sim.view(item.id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  for (let i = 0; i < 90; i++) {
    const m = sim.mouthAnchor(bug)!;
    sim.send({ type: 'drag', x: m.x + dx, y: m.y + dy });
    sim.step();
  }
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
  return item.id;
}

describe('drop targets', () => {
  it('picks the matching target with the best priority, then the nearest', () => {
    const cands = [
      { kind: 'mouth' as const, entityId: 1, x: 0.4, y: 0 },
      { kind: 'mouth' as const, entityId: 2, x: 0.2, y: 0 },
      { kind: 'mouth' as const, entityId: 3, x: 0.9, y: 0 },
    ];
    expect(pickDropTarget(['tag_edible'], 0, 0, cands)?.entityId).toBe(2);
    expect(pickDropTarget(['tag_heavy'], 0, 0, cands)).toBeNull();
    expect(pickDropTarget(['tag_edible'], 5, 0, cands)).toBeNull();
    // The mouth rule snaps within 50 px (0.5 m), at the doc's priority 4.
    expect(DROP_RULES.find((r) => r.kind === 'mouth')).toMatchObject({ radius: 0.5, priority: 4 });
  });
});

describe('feeding', () => {
  it('a berry dropped within 50 px of a mouth goes in, and the bug chews (st_eat)', () => {
    const { sim, bug } = world();
    const log = record(sim);
    const berry = dropNearMouth(sim, bug, 'item_berry_red', 0, -0.3);
    const fed = find(log, 'bug_fed');
    expect(fed).toHaveLength(1);
    expect(fed[0]).toMatchObject({ id: bug, itemId: berry, liking: 'liked', byPlayer: true });
    expect(sim.view(bug)!.bug!.mode).toBe('st_eat');
    expect(sim.view(berry)!.inMouthOf).toBe(bug);
    // Chewed and swallowed.
    sim.run(120);
    expect(find(log, 'bug_ate')).toMatchObject([{ id: bug, itemId: berry, liking: 'liked' }]);
    expect(sim.entities.has(berry)).toBe(false);
    expect(find(log, 'bug_reacted').some((r) => r.reaction === 'fed_liked')).toBe(true);
  });

  it('a berry dropped more than 50 px from the mouth just falls', () => {
    const { sim, bug } = world();
    const log = record(sim);
    const berry = dropNearMouth(sim, bug, 'item_berry_red', 0.35, -0.55);
    expect(find(log, 'bug_fed')).toEqual([]);
    expect(sim.view(bug)!.bug!.mode).not.toBe('st_eat');
    sim.run(60);
    expect(sim.entities.has(berry)).toBe(true);
    expect(sim.view(berry)!.inMouthOf).toBeUndefined();
  });

  it('disliked food gets spat out, stays in the world, and makes the bug grumpy', () => {
    const { sim, bug } = world('bug_pillbug_rollo');
    const log = record(sim);
    const pepper = dropNearMouth(sim, bug, 'item_pepper_hot', 0, -0.25);
    expect(find(log, 'bug_fed')[0]!.liking).toBe('disliked');
    const hunger = sim.view(bug)!.bug!.needs.need_hunger;
    sim.run(60);
    const spat = find(log, 'bug_spat');
    expect(spat).toHaveLength(1);
    expect(spat[0]).toMatchObject({ id: bug, itemId: pepper, itemDefId: 'item_pepper_hot' });
    const facing = sim.view(bug)!.bug!.facing;
    expect(Math.sign(spat[0]!.vx)).toBe(facing); // forward, the way it faces
    expect(spat[0]!.vy).toBeLessThan(0);
    expect(find(log, 'bug_ate')).toEqual([]);
    expect(sim.entities.has(pepper)).toBe(true);
    expect(sim.physics.isActive(pepper)).toBe(true);
    expect(sim.view(bug)!.bug!.mood).toBe('mood_grumpy');
    expect(sim.view(bug)!.bug!.needs.need_hunger).toBeLessThanOrEqual(hunger);
    expect(find(log, 'bug_reacted').some((r) => r.reaction === 'fed_disliked')).toBe(true);
    sim.run(40);
    expect((sim.view(pepper)!.x - sim.view(bug)!.x) * facing).toBeGreaterThan(0.8);
    // Grumpiness wears off after 8 s.
    sim.run(8 * 60);
    expect(sim.view(bug)!.bug!.mood).not.toBe('mood_grumpy');
  });

  it('loved food fills hunger by 60 and plays the loved reaction', () => {
    const { sim, bug } = world('bug_pillbug_rollo');
    sim.entities.get(bug)!.bug!.needs.need_hunger = 20;
    const log = record(sim);
    dropNearMouth(sim, bug, 'item_rotten_banana_bit', 0, -0.3);
    sim.run(120);
    expect(find(log, 'bug_ate')[0]!.liking).toBe('loved');
    expect(sim.view(bug)!.bug!.needs.need_hunger).toBeGreaterThan(75);
    expect(find(log, 'bug_reacted').map((r) => r.reaction)).toContain('fed_loved');
  });

  it('burps after a big meal, and not after a small one', () => {
    const full = world('bug_ladybug_dot');
    full.sim.entities.get(full.bug)!.bug!.needs.need_hunger = 80;
    const log = record(full.sim);
    dropNearMouth(full.sim, full.bug, 'item_berry_red', 0, -0.3);
    full.sim.run(260);
    expect(full.sim.view(full.bug)!.bug!.needs.need_hunger).toBeGreaterThanOrEqual(FULL_BELLY - 1);
    expect(find(log, 'bug_burped')).toHaveLength(1);

    const hungry = world('bug_ladybug_dot');
    hungry.sim.entities.get(hungry.bug)!.bug!.needs.need_hunger = 10;
    const log2 = record(hungry.sim);
    dropNearMouth(hungry.sim, hungry.bug, 'item_berry_red', 0, -0.3);
    hungry.sim.run(260);
    expect(find(log2, 'bug_ate')).toHaveLength(1);
    expect(find(log2, 'bug_burped')).toEqual([]);
  });

  it('catches food thrown at its mouth', () => {
    const { sim, bug } = world('bug_pillbug_rollo');
    const log = record(sim);
    const m = sim.mouthAnchor(bug)!;
    const berry = sim.spawn('item', 'item_berry_red', m.x + 1.2, m.y - 0.3);
    sim.send({ type: 'grab', x: m.x + 1.2, y: m.y - 0.3 });
    sim.step();
    sim.send({ type: 'release', vx: -7, vy: 0.5 });
    sim.run(30);
    expect(find(log, 'bug_fed')).toMatchObject([{ id: bug, itemId: berry.id, byPlayer: true }]);
  });

  it('drops its food when grabbed mid-chew', () => {
    const { sim, bug } = world();
    const berry = dropNearMouth(sim, bug, 'item_berry_red', 0, -0.3);
    expect(sim.physics.isActive(berry)).toBe(false);
    const v = sim.view(bug)!;
    sim.send({ type: 'grab', x: v.x - 0.2, y: v.y });
    sim.step();
    expect(sim.view(bug)!.bug!.mode).toBe('st_held');
    expect(sim.physics.isActive(berry)).toBe(true);
    expect(sim.view(berry)!.inMouthOf).toBeUndefined();
  });

  it('keeps chewing after a save and load', () => {
    const { sim, bug } = world();
    const berry = dropNearMouth(sim, bug, 'item_berry_red', 0, -0.3);
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const loaded = Sim.load(save);
    expect(loaded.physics.isActive(berry)).toBe(false);
    expect(loaded.view(berry)!.inMouthOf).toBe(bug);
    const log = record(loaded);
    loaded.run(120);
    expect(find(log, 'bug_ate')).toHaveLength(1);
  });

  it('bugs that go and eat on their own take the food in their mouth first', () => {
    const { sim, bug } = world('bug_ladybug_dot');
    const b = sim.entities.get(bug)!.bug!;
    b.needs.need_hunger = 5;
    b.decideIn = 1;
    b.timer = 10;
    const log = record(sim);
    sim.spawn('item', 'item_berry_red', PLAZA_X + 8.6, GROUND_Y - 0.2);
    sim.run(20 * 60);
    expect(find(log, 'bug_fed')[0]).toMatchObject({ id: bug, byPlayer: false });
    expect(find(log, 'bug_ate')).toHaveLength(1);
  });

  it('never offers a mouth that is busy, held, or flying', () => {
    const { sim, bug } = world();
    const berry = dropNearMouth(sim, bug, 'item_berry_red', 0, -0.3);
    expect(sim.dropTargetFor(berry)).toBeNull(); // it is the mouthful
    const other = sim.spawn('item', 'item_berry_red', PLAZA_X + 3, GROUND_Y - 0.2);
    sim.run(10);
    const m = sim.mouthAnchor(bug)!;
    sim.physics.place(other.id, m.x, m.y - 0.2, 0);
    expect(sim.dropTargetFor(other.id)).toBeNull(); // already chewing
  });
});

describe('reactions', () => {
  it('never picks the same variant twice in a row for one reaction type', () => {
    const brain = newBugBrain(0, new Rng('v'));
    const rng = new Rng('variants');
    for (const type of REACTION_TYPES) {
      let last = -1;
      for (let i = 0; i < 60; i++) {
        const v = pickVariant(brain, type, rng);
        expect(v).not.toBe(last);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        last = v;
      }
    }
  });

  it('pokes fired three times in a row use a fresh variant each time', () => {
    const { sim, bug } = world('bug_ladybug_dot');
    const log = record(sim);
    for (let i = 0; i < 6; i++) {
      const v = sim.view(bug)!;
      sim.send({ type: 'poke', x: v.x, y: v.y });
      sim.run(100);
    }
    const pokes = find(log, 'bug_reacted').filter((r) => r.reaction === 'poke');
    expect(pokes.length).toBe(6);
    for (let i = 1; i < pokes.length; i++) expect(pokes[i]!.variant).not.toBe(pokes[i - 1]!.variant);
  });

  it('reacts to grabs, flings, and landings', () => {
    const { sim, bug } = world('bug_ladybug_dot');
    const log = record(sim);
    const v = sim.view(bug)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.run(20);
    sim.send({ type: 'release', vx: 3, vy: -4 });
    sim.run(200);
    const types = find(log, 'bug_reacted').map((r) => r.reaction);
    expect(types).toEqual(['grab', 'fling', 'land']);
    expect(sim.view(bug)!.bug!.reaction!.type).toBe('land');
  });

  it('Glorp never gets dizzy: a hard landing sends him into his shell to spin', () => {
    for (const [defId, dizzy] of [
      ['bug_snail_glorp', false],
      ['bug_ladybug_dot', true],
    ] as const) {
      const { sim, bug } = world(defId);
      const log = record(sim);
      const v = sim.view(bug)!;
      sim.send({ type: 'grab', x: v.x, y: v.y });
      for (let i = 0; i < 60; i++) {
        sim.send({ type: 'drag', x: v.x, y: 2 });
        sim.step();
      }
      sim.send({ type: 'release', vx: 0, vy: 20 });
      sim.run(60);
      expect(find(log, 'bug_dizzy').length > 0).toBe(dizzy);
      if (!dizzy) {
        expect(find(log, 'bug_reacted').map((r) => r.reaction)).toContain('land_hard');
        expect(sim.view(bug)!.bug!.mode).toBe('st_react');
        sim.run(SHELL_TICKS);
        expect(['st_idle', 'st_wander', 'st_seek']).toContain(sim.view(bug)!.bug!.mode);
      }
    }
  });
});

describe('tickles and shakes', () => {
  const grabbed = (): { sim: Sim; bug: number; log: Logged[] } => {
    const { sim, bug } = world('bug_ladybug_dot');
    const log = record(sim);
    const v = sim.view(bug)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    return { sim, bug, log };
  };

  it('a held-still bug laughs harder each second, then wriggles free at 3 s', () => {
    const { sim, bug, log } = grabbed();
    sim.send({ type: 'tickle', on: true });
    sim.step();
    expect(sim.view(bug)!.bug!.tickle).toBeGreaterThan(0);
    sim.run(TICKLE_FREE_TICKS - 10);
    expect(sim.view(bug)!.held).toBe(true);
    expect(find(log, 'bug_tickled').map((t) => t.level)).toEqual([1, 2, 3]);
    sim.run(20);
    expect(find(log, 'bug_wriggled_free')).toHaveLength(1);
    expect(sim.view(bug)!.held).toBe(false);
    expect(find(log, 'bug_reacted').map((r) => r.reaction)).toContain('tickle');
  });

  it('stops tickling when the hand moves', () => {
    const { sim, bug, log } = grabbed();
    sim.send({ type: 'tickle', on: true });
    sim.run(30);
    sim.send({ type: 'tickle', on: false });
    sim.run(TICKLE_FREE_TICKS);
    expect(find(log, 'bug_wriggled_free')).toEqual([]);
    expect(sim.view(bug)!.held).toBe(true);
  });

  it('shaking a held bug makes it woozy for 1 s', () => {
    const { sim, bug, log } = grabbed();
    sim.send({ type: 'shake' });
    sim.step();
    expect(find(log, 'item_shaken')).toMatchObject([{ id: bug, kind: 'bug' }]);
    expect(sim.view(bug)!.bug!.woozy).toBe(true);
    sim.run(WOOZY_TICKS);
    expect(sim.view(bug)!.bug!.woozy).toBe(false);
  });

  it('shaking an item emits item_shaken; shaking nothing does nothing', () => {
    const sim = Sim.empty();
    const log = record(sim);
    sim.send({ type: 'shake' });
    sim.step();
    expect(find(log, 'item_shaken')).toEqual([]);
    const p = sim.spawn('item', 'item_pebble', PLAZA_X + 7, GROUND_Y - 0.21);
    sim.send({ type: 'grab', x: PLAZA_X + 7, y: GROUND_Y - 0.21 });
    sim.send({ type: 'shake' });
    sim.step();
    expect(find(log, 'item_shaken')).toMatchObject([{ id: p.id, kind: 'item' }]);
  });
});

describe('moods', () => {
  it('follows needs and recent annoyances', () => {
    const b = newBugBrain(0, new Rng('m'));
    b.needs = { need_hunger: 90, need_fun: 90, need_energy: 90 };
    expect(moodOf(b, 0)).toBe('mood_happy');
    b.needs.need_hunger = 50;
    b.needs.need_fun = 50;
    expect(moodOf(b, 0)).toBe('mood_content');
    b.needs.need_fun = 10;
    expect(moodOf(b, 0)).toBe('mood_bored');
    b.needs.need_hunger = 10;
    expect(moodOf(b, 0)).toBe('mood_hungry');
    b.needs.need_energy = 10;
    expect(moodOf(b, 0)).toBe('mood_sleepy');
    b.grumpyUntil = 100;
    expect(moodOf(b, 50)).toBe('mood_grumpy');
    expect(moodOf(b, 100)).toBe('mood_sleepy');
  });

  it('set_need changes a need, clamped, and ignores nonsense', () => {
    const { sim, bug } = world();
    sim.send({ type: 'set_need', id: bug, need: 'need_hunger', value: 150 });
    sim.send({ type: 'set_need', id: bug, need: 'need_bogus' as 'need_fun', value: 5 });
    sim.step();
    const needs = sim.view(bug)!.bug!.needs as unknown as Record<string, number>;
    expect(needs.need_hunger).toBeLessThanOrEqual(100);
    expect(needs.need_hunger).toBeGreaterThan(99);
    expect(needs.need_bogus).toBeUndefined();
  });
});

describe('content for M2', () => {
  it('is valid, and every bug has a loved, liked, neutral, and disliked food in the plaza', () => {
    expect(validateContent()).toEqual([]);
    const sim = Sim.create({ seed: 'plaza' });
    const foods = [
      ...new Set(
        sim.entities
          .ofKind('item')
          .map((e) => e.defId)
          .filter((id) => sim.content.items.get(id).tags.includes('tag_edible')),
      ),
    ];
    for (const bug of BUGS.all) {
      const kinds = new Set(
        foods.map((f) =>
          bug.loves.includes(f)
            ? 'loved'
            : bug.likes.includes(f)
              ? 'liked'
              : bug.dislikes.includes(f)
                ? 'disliked'
                : 'neutral',
        ),
      );
      expect([...kinds].sort(), bug.id).toEqual(['disliked', 'liked', 'loved', 'neutral']);
    }
  });
});

describe('save version 3', () => {
  it('migrates a version 2 save: bugs gain mouths and reaction memory; a mid-meal bug stops', () => {
    const v2 = {
      version: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      view: { cameraX: 2 },
      world: {
        seed: 'old',
        tick: 50,
        rng: [1, 2, 3, 4],
        nextId: 3,
        entities: [
          {
            id: 1,
            kind: 'bug',
            defId: 'bug_ladybug_dot',
            body: { x: 7, y: 8.4, angle: 0, vx: 0, vy: 0, av: 0 },
            bug: {
              ...newBugBrain(7, new Rng('x')),
              mode: 'st_eat',
              targetId: 2,
              action: 'eat',
              mouthful: undefined,
              reaction: undefined,
              variants: undefined,
              grumpyUntil: undefined,
              burpAt: undefined,
              tickle: undefined,
              woozyUntil: undefined,
            },
          },
          {
            id: 2,
            kind: 'item',
            defId: 'item_berry_red',
            body: { x: 7.7, y: 8.8, angle: 0, vx: 0, vy: 0, av: 0 },
          },
        ],
      },
    };
    const save = loadSaveFile(JSON.stringify(v2));
    // Later migrations run too.
    expect(save.version).toBe(SAVE_VERSION);
    const b = save.world.entities[0]!.bug!;
    expect(b).toMatchObject({ mode: 'st_idle', targetId: null, mouthful: null, reaction: null, burpAt: -1 });
    expect(b.variants).toEqual({});
    Sim.load(save.world).run(60);
  });
});

describe('offering food', () => {
  it('an idle bug turns to face food the player holds nearby, and waits for it', () => {
    const { sim, bug } = world('bug_pillbug_rollo');
    const b = sim.entities.get(bug)!.bug!;
    b.timer = 5; // about to wander off
    const x = sim.view(bug)!.x;
    const berry = sim.spawn('item', 'item_berry_red', x - 1.5, GROUND_Y - 0.2);
    sim.run(20);
    sim.send({ type: 'grab', x: x - 1.5, y: sim.view(berry.id)!.y });
    for (let i = 0; i < 120; i++) {
      sim.send({ type: 'drag', x: x - 1.2, y: GROUND_Y - 1.2 });
      sim.step();
    }
    expect(sim.view(bug)!.bug!.facing).toBe(-1);
    expect(sim.view(bug)!.bug!.mode).toBe('st_idle');
    // Once the food is gone, it gets on with its day.
    sim.send({ type: 'release', vx: 20, vy: -5 });
    sim.run(20);
    expect(sim.dropTargetFor(berry.id)).toBeNull();
  });
});

describe('offering food mid-reaction', () => {
  it('a bug still reacting turns to face offered food too', () => {
    const { sim, bug } = world('bug_ladybug_dot');
    const x = sim.view(bug)!.x;
    const berry = sim.spawn('item', 'item_berry_red', x - 1.5, GROUND_Y - 0.2);
    sim.run(20);
    sim.send({ type: 'poke', x, y: sim.view(bug)!.y });
    sim.step();
    expect(sim.view(bug)!.bug!.mode).toBe('st_react');
    sim.send({ type: 'grab', x: x - 1.5, y: sim.view(berry.id)!.y });
    for (let i = 0; i < 10; i++) {
      sim.send({ type: 'drag', x: x - 1.2, y: GROUND_Y - 1.2 });
      sim.step();
    }
    expect(sim.view(bug)!.bug!.facing).toBe(-1);
  });
});
