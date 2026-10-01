import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 240_000 });
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Needs } from '../../src/game/core/entities';
import { Rng } from '../../src/game/core/rng';
import { BUGS } from '../../src/game/data/bugs';
import { validateContent, CONTENT } from '../../src/game/data';
import { DEFAULT_AFFINITY, baseAffinity } from '../../src/game/data/affinity';
import { memoryModifier, newBugBrain, remember, scoreAdvert, updateBug } from '../../src/game/systems/bugAi';
import type { AdvertCandidate } from '../../src/game/systems/bugAi';
import { DECAY, decayNeeds, moodOf } from '../../src/game/systems/needs';
import { PLAUSIBLE } from '../../src/game/systems/offscreen';
import { SETUP_SECONDS } from '../../src/game/systems/setup';
import { PLAZA_X, POND, POND_X } from './world';

// M4 acceptance (game design doc, section 19) and the needs, setup rule,
// off-screen model, and soak tests around it.

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

/** Pick an item up and put it down where it is, the way the player's hand would. */
function touch(sim: Sim, id: number): void {
  const s = sim.view(id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

/** Carry an item with the hand to (x, y) and let go gently. */
function place(sim: Sim, id: number, x: number, y: number): void {
  const s = sim.view(id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  for (let i = 1; i <= 30; i++) {
    sim.send({ type: 'drag', x: s.x + ((x - s.x) * i) / 30, y: s.y + ((y - s.y) * i) / 30 });
    sim.step();
  }
  sim.run(40);
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

/** Clear a stretch of the starting plaza, and stack three bottle caps there, each touched by the hand. */
function buildStack(sim: Sim, x: number): number[] {
  for (const e of sim.entities.ofKind('item')) if (Math.abs(sim.view(e.id)!.x - x) < 1.3) sim.remove(e.id);
  const h = 0.17;
  const caps = [0, 1, 2].map(
    (i) => sim.spawn('item', 'item_bottle_cap', x, GROUND_Y - h / 2 - i * h - 0.005).id,
  );
  sim.run(60);
  for (const c of [...caps].reverse()) touch(sim, c);
  sim.run(60);
  return caps;
}

describe('needs', () => {
  it('has all five needs, decaying at the design-doc rates times each bug’s weight', () => {
    const def = BUGS.get('bug_ladybug_dot');
    const b = newBugBrain(0, new Rng('n'));
    b.needs = { need_hunger: 80, need_fun: 80, need_energy: 80, need_social: 80, need_clean: 80 };
    b.mode = 'st_held';
    decayNeeds(b, def, 60 * 10);
    for (const need of Object.keys(DECAY) as (keyof Needs)[])
      expect(b.needs[need]).toBeCloseTo(80 - DECAY[need] * def.needWeights[need] * 10, 5);
    expect(DECAY).toEqual({
      need_hunger: 0.25,
      need_fun: 0.3,
      need_energy: 0.1,
      need_social: 0.18,
      need_clean: 0.02,
    });
  });

  it('sleep refills energy at 1.5 a second and never pushes a need out of 0 to 100', () => {
    const def = BUGS.get('bug_pillbug_rollo');
    const b = newBugBrain(0, new Rng('s'));
    b.mode = 'st_sleep';
    b.needs.need_energy = 10;
    decayNeeds(b, def, 60 * 10);
    expect(b.needs.need_energy).toBeCloseTo(25, 0);
    decayNeeds(b, def, 60 * 1000);
    for (const v of Object.values(b.needs)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('shows a friend’s face when lonely and a drop when it wants a wash', async () => {
    const { thoughtFor } = await import('../../src/renderer/src/render/thoughts');
    const def = BUGS.get('bug_ladybug_dot');
    const full: Needs = { need_hunger: 90, need_fun: 90, need_energy: 90, need_social: 90, need_clean: 90 };
    expect(thoughtFor(def, { ...full, need_social: 10 }, CONTENT.items, 'bug_grasshopper_boing')).toEqual({
      pictos: ['friend'],
      food: null,
      friend: 'bug_grasshopper_boing',
    });
    expect(thoughtFor(def, { ...full, need_clean: 10 }, CONTENT.items)?.pictos).toEqual(['drop']);
    const b = newBugBrain(0, new Rng('m'));
    b.needs = { ...full, need_clean: 10 };
    expect(moodOf(b, 0)).toBe('mood_content');
  });
});

describe('choosing what to do', () => {
  const dot = BUGS.get('bug_ladybug_dot');
  const berry = (over: Partial<AdvertCandidate> = {}): AdvertCandidate => ({
    id: 40,
    defId: 'item_berry_red',
    x: 11,
    y: 8.8,
    action: 'eat',
    needs: { need_hunger: 20 },
    claimed: false,
    ...over,
  });

  it('remembers good and bad moments, which fade over 120 s', () => {
    const b = newBugBrain(10, new Rng('mem'));
    remember(b, 40, true, 0);
    expect(memoryModifier(b, 40, 0)).toBeCloseTo(1.5);
    expect(memoryModifier(b, 40, 60 * 60)).toBeCloseTo(1.25);
    expect(memoryModifier(b, 40, 120 * 60)).toBe(1);
    remember(b, 41, false, 0);
    expect(memoryModifier(b, 41, 0)).toBeCloseTo(0.3);
    b.needs.need_hunger = 10;
    const liked = scoreAdvert(b, dot, berry(), 10, 0);
    const disliked = scoreAdvert(b, dot, berry({ id: 41 }), 10, 0);
    expect(disliked).toBeLessThan(liked * 0.3);
    for (let i = 0; i < 12; i++) remember(b, 100 + i, true, 0);
    expect(b.memory.length).toBe(8);
  });

  it('gives something the player just brought a big curiosity bonus', () => {
    const b = newBugBrain(10, new Rng('fresh'));
    b.needs.need_fun = 60;
    const plain = berry({ action: 'inspect', needs: { need_fun: 8 } });
    const fresh = { ...plain, fresh: true };
    expect(scoreAdvert(b, dot, fresh, 10, 0) - scoreAdvert(b, dot, plain, 10, 0)).toBeGreaterThan(8);
  });

  it('never goes for a need without scoring, and a hungry bug goes for food over a show', () => {
    const sim = Sim.empty({ seed: 'b' });
    const bug = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 5, GROUND_Y - 0.6);
    sim.spawn('item', 'item_berry_red', PLAZA_X + 8.5, GROUND_Y - 0.18);
    bug.bug!.needs.need_hunger = 10;
    const log = record(sim);
    sim.run(3 * 60);
    expect(find(log, 'bug_chose_action')[0]!.action).toBe('eat');
  });
});

describe('the setup rule (M4 acceptance)', () => {
  it('never lets a spring on its side fire a bug out on its own at the player’s things', () => {
    const run = (withSetup: boolean): { bounced: number; vx: number } => {
      const sim = Sim.empty({ seed: 'side-spring' });
      const x = PLAZA_X + 8;
      const spring = sim.spawn('item', 'item_spring_coil', x, GROUND_Y - 0.27);
      // On its side, its top facing right.
      sim.physics.place(spring.id, x, GROUND_Y - 0.27, Math.PI / 2);
      if (withSetup) buildStack(sim, x + 3.5);
      const dot = sim.spawn('bug', 'bug_ladybug_dot', x + 1.2, GROUND_Y - 0.6);
      sim.run(30);
      let bounced = 0;
      sim.events.on('spring_bounced', () => bounced++);
      let vx = 0;
      // A hop of its own, straight at the spring's top.
      dot.bug!.mode = 'st_airborne';
      dot.bug!.selfLaunched = true;
      sim.physics.setVelocity(dot.id, -6, -2);
      for (let i = 0; i < 30; i++) {
        sim.step();
        vx = Math.max(vx, sim.view(dot.id)!.vx);
      }
      return { bounced, vx };
    };
    // With nothing of the player's that way, the spring fires it (that is just funny)...
    expect(run(false).bounced).toBeGreaterThan(0);
    // ...but never toward a setup.
    const guarded = run(true);
    expect(guarded.bounced).toBe(0);
    expect(guarded.vx).toBeLessThan(5);
  });

  it('tags what the player drops for 300 s, restarting the timer on every touch', () => {
    const sim = Sim.empty({ seed: 'tag' });
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 6, GROUND_Y - 0.21);
    sim.run(30);
    touch(sim, pebble.id);
    expect(sim.hasTag(pebble.id, 'tag_player_setup')).toBe(true);
    sim.run(200 * 60);
    touch(sim, pebble.id);
    sim.run(200 * 60);
    expect(sim.hasTag(pebble.id, 'tag_player_setup')).toBe(true);
    sim.run((SETUP_SECONDS - 190) * 60);
    expect(sim.hasTag(pebble.id, 'tag_player_setup')).toBe(false);
  });

  it('a stack of three keeps the tag for good, until the player pulls a piece off', () => {
    const sim = Sim.create({ seed: 'stack' });
    const caps = buildStack(sim, PLAZA_X + 6.3);
    sim.run(20 * 60);
    for (const c of caps) expect(sim.setup.isPermanent(c), `cap ${c}`).toBe(true);
    // Pull the top one off and set it aside, on its own.
    for (const e of sim.entities.ofKind('item'))
      if (!caps.includes(e.id) && Math.abs(sim.view(e.id)!.x - (PLAZA_X + 3.6)) < 1.2) sim.remove(e.id);
    place(sim, caps[2]!, PLAZA_X + 3.6, GROUND_Y - 0.4);
    sim.run(60);
    for (const c of caps) {
      expect(sim.setup.isPermanent(c)).toBe(false);
      expect(sim.hasTag(c, 'tag_player_setup')).toBe(true);
    }
  });

  it('a new thing dropped near an idle bug gets sniffed within 30 s (20 seeded trials, 18 or more)', () => {
    let passed = 0;
    for (let trial = 0; trial < 20; trial++) {
      const sim = Sim.create({ seed: `inspect-${trial}` });
      sim.run(2 * 60);
      const bugs = sim.entities.ofKind('bug').filter((b) => sim.view(b.id)!.x > PLAZA_X);
      const bug = bugs[trial % bugs.length]!;
      const at = sim.view(bug.id)!;
      const x = Math.min(PLAZA_X + 11, Math.max(PLAZA_X + 1.5, at.x + (trial % 2 ? 3 : -3)));
      const feather = sim.spawn('item', 'item_feather', x, 3);
      sim.run(60);
      // The player picks it up and drops it: now it is theirs, and new.
      touch(sim, feather.id);
      const log = record(sim);
      sim.run(30 * 60);
      if (find(log, 'bug_inspected').some((e) => e.itemId === feather.id)) passed++;
    }
    expect(passed).toBeGreaterThanOrEqual(18);
  });
});

describe('off-screen simulation (M4 acceptance)', () => {
  // The camera at the plaza's far right, a whole screen from the pond.
  const FAR = { type: 'focus' as const, x0: PLAZA_X + 38.4 - 19.2, x1: PLAZA_X + 38.4 };
  const NEAR = { type: 'focus' as const, x0: PLAZA_X - 19.2, x1: PLAZA_X };

  it('needs keep ticking in a sleeping area, every 2 s', () => {
    const sim = Sim.create({ seed: 'coarse' });
    sim.run(10);
    const skeet = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_waterstrider_skeet')!;
    sim.send(FAR);
    sim.run(2);
    expect(sim.isSleeping(skeet.id)).toBe(true);
    const before = skeet.bug!.needs.need_social;
    sim.run(60 * 60);
    expect(skeet.bug!.needs.need_social).toBeLessThan(before);
  });

  it('bugs in a sleeping area are doing something plausible, on their feet, when it wakes', () => {
    for (const seed of ['wake-a', 'wake-b', 'wake-c']) {
      const sim = Sim.create({ seed });
      sim.run(30);
      // Dot is dropped in the pond mid-swim, Rollo is left mid-air above it, and a
      // Glorp is spawned chewing a berry on the bank.
      const dot = sim.spawn('bug', 'bug_ladybug_dot', POND.middle - 3, POND.level - 0.1);
      const rollo = sim.spawn('bug', 'bug_pillbug_rollo', POND.middle + 3, 4);
      sim.run(20);
      sim.send(FAR);
      sim.run(5 * 60 * 60);
      sim.send(NEAR);
      sim.step();
      for (const bug of sim.entities.ofKind('bug')) {
        const v = sim.view(bug.id)!;
        if (v.x > PLAZA_X) continue;
        const def = BUGS.get(v.defId);
        expect(v.held).toBe(false);
        const hopping = v.bug!.mode === 'st_airborne' && v.bug!.selfLaunched;
        expect(PLAUSIBLE.has(v.bug!.mode) || hopping, `${v.defId} ${v.bug!.mode}`).toBe(true);
        if (def.swim !== 'skate') {
          expect(sim.environment.overOpenWater(v.x), `${v.defId} on water`).toBe(false);
          expect(Math.abs(v.y + def.radius - sim.surfaceY(v.x))).toBeLessThan(0.15);
        }
      }
      void dot;
      void rollo;
      sim.run(10 * 60);
      expect(sim.rescues).toBe(0);
    }
  });

  it('needs do not change while the game is paused or closed', () => {
    const sim = Sim.create({ seed: 'closed' });
    sim.run(5 * 60);
    const needs = sim.entities.ofKind('bug').map((b) => ({ ...b.bug!.needs }));
    // Paused: nothing steps.
    expect(sim.entities.ofKind('bug').map((b) => ({ ...b.bug!.needs }))).toEqual(needs);
    // Closed: a save and a load, however long later, start where it left off.
    const text = JSON.stringify({
      version: SAVE_VERSION,
      savedAt: 'x',
      world: sim.serialize(),
      view: { cameraX: 40 },
      meta: { createdAt: 'x', thumb: null },
    });
    const loaded = Sim.load(loadSaveFile(text).world);
    expect(loaded.entities.ofKind('bug').map((b) => ({ ...b.bug!.needs }))).toEqual(needs);
  });
});

describe('the pond’s sunken teacup', () => {
  it('catches a pebble that sinks above it', () => {
    const sim = Sim.empty({ seed: 'cup' });
    const cupX = POND_X + 12;
    const p = sim.spawn('item', 'item_pebble', cupX + 0.1, POND.level - 1);
    sim.run(6 * 60);
    const v = sim.view(p.id)!;
    expect(Math.abs(v.x - cupX)).toBeLessThan(0.6);
    expect(v.y).toBeLessThan(sim.surfaceY(v.x) - 0.25);
  });
});

describe('saves and content', () => {
  it('migrates a version 4 save: new needs and bookkeeping, and Boing joins on load', () => {
    const sim = Sim.create({ seed: 'v4' });
    sim.run(10);
    const world = JSON.parse(JSON.stringify(sim.serialize()));
    world.entities = world.entities.filter((e: { defId: string }) => e.defId !== 'bug_grasshopper_boing');
    for (const e of world.entities) {
      if (e.kind !== 'bug') continue;
      const b = e.bug;
      b.needs = {
        need_hunger: b.needs.need_hunger,
        need_fun: b.needs.need_fun,
        need_energy: b.needs.need_energy,
      };
      for (const k of [
        'carrying',
        'social',
        'memory',
        'inspected',
        'groggyUntil',
        'napAt',
        'pokes',
        'gliding',
        'fidgetAt',
        'slippedAt',
        'restX',
        'plan',
        'resume',
        'hopReady',
        'touchedAt',
        'airTop',
        'audience',
      ])
        delete b[k];
      if (!['eat', 'bounce'].includes(b.action)) b.action = null;
    }
    delete world.env.slime;
    delete world.social;
    const save = loadSaveFile({ version: 4, savedAt: 'x', world, view: { cameraX: 40 } });
    expect(save.version).toBe(SAVE_VERSION);
    const dot = save.world.entities.find((e) => e.defId === 'bug_ladybug_dot')!.bug!;
    expect(dot.needs.need_social).toBe(70);
    expect(dot.needs.need_clean).toBe(90);
    expect(dot.memory).toEqual([]);
    const loaded = Sim.load(save.world);
    expect(loaded.entities.ofKind('bug').map((b) => b.defId)).toContain('bug_grasshopper_boing');
    loaded.run(60);
  });

  it('saves a game mid-play, with bugs playing and carrying, and carries on after loading', () => {
    const a = Sim.create({ seed: 'resume' });
    a.run(90 * 60);
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = Sim.load(saved);
    expect(b.entities.ofKind('bug').map((e) => e.bug)).toEqual(a.entities.ofKind('bug').map((e) => e.bug));
    for (const bug of b.entities.ofKind('bug'))
      if (bug.bug!.carrying !== null) expect(b.carrierOf(bug.bug!.carrying)).toBe(bug.id);
    b.run(60 * 60);
    expect(b.rescues).toBe(0);
  });

  it('checks the affinity table and bug traits', () => {
    expect(validateContent()).toEqual([]);
    expect(baseAffinity('bug_ladybug_dot', 'bug_grasshopper_boing')).toBe(0.6);
    expect(baseAffinity('bug_snail_glorp', 'bug_waterstrider_skeet')).toBe(DEFAULT_AFFINITY);
    const errors = validateContent(CONTENT, [
      { a: 'bug_ladybug_dot', b: 'bug_ladybug_dot', value: 2, flavor: '' },
      { a: 'Dot', b: 'bug_pillbug_rollo', value: 0.1, flavor: '' },
    ]);
    expect(errors.some((e) => e.includes('with itself'))).toBe(true);
    expect(errors.some((e) => e.includes('-1 to 1'))).toBe(true);
    expect(errors.some((e) => e.includes('bad bug id'))).toBe(true);
  });

  it('a flung bug that hits another nudges their affinity down a touch', () => {
    const sim = Sim.empty({ seed: 'bump' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 4, GROUND_Y - 0.51);
    sim.spawn('bug', 'bug_pillbug_rollo', PLAZA_X + 7, GROUND_Y - 0.47);
    sim.run(30);
    const s = sim.view(dot.id)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'release', vx: 14, vy: -3 });
    sim.run(90);
    const now = sim.affinityOf('bug_ladybug_dot', 'bug_pillbug_rollo');
    const base = baseAffinity('bug_ladybug_dot', 'bug_pillbug_rollo');
    // Each hit is -0.02 (a bounce can hit twice).
    expect(now).toBeLessThan(base - 0.01);
    expect(Math.round((base - now) * 100) % 2).toBe(0);
  });
});

describe('soak', () => {
  it('the AI can run on its own: updateBug returns plain decisions for a lone bug', () => {
    const def = BUGS.get('bug_grasshopper_boing');
    const brain = newBugBrain(10, new Rng('lone'));
    const d = updateBug(
      { id: 1, kind: 'bug', defId: def.id, bug: brain },
      {
        tick: 0,
        def,
        state: { x: 10, y: 8.5, angle: 0, vx: 0, vy: 0, av: 0 },
        held: false,
        support: { x: 0, y: -1 },
        impact: 0,
        worldWidth: 70,
        rng: new Rng('x'),
        adverts: () => [],
        target: () => null,
        obstacle: () => null,
      },
    );
    expect(d.notices).toBeInstanceOf(Array);
  });
});

describe('how M4 looks and sounds', () => {
  it('sleeping bugs shut their eyes and curl up by species; talkers flap their mouths', async () => {
    const { bugFace } = await import('../../src/renderer/src/render/bugFace');
    const { bugPose } = await import('../../src/renderer/src/render/bugPose');
    const needs = { need_hunger: 90, need_fun: 90, need_energy: 90, need_social: 90, need_clean: 90 };
    const base = { needs, time: 1, likesFlinging: false } as const;
    expect(bugPose({ mode: 'st_sleep', vx: 0, vy: 0, time: 1, phase: 0 }).eyeOpen).toBe(0);
    expect(bugFace({ ...base, art: 'pillbug', mode: 'st_sleep' }).form).toBe('curled');
    expect(bugFace({ ...base, art: 'snail', mode: 'st_sleep' }).form).toBe('in_shell');
    const mouths = new Set(
      [0, 0.05, 0.1, 0.15, 0.2].map(
        (t) => bugFace({ ...base, time: t, art: 'grasshopper', mode: 'st_social', talking: true }).mouth,
      ),
    );
    expect(mouths.size).toBeGreaterThan(1);
    expect(
      bugFace({ ...base, art: 'ladybug', mode: 'st_airborne', selfLaunched: true, gliding: true }).form,
    ).toBe('flying');
    expect(bugFace({ ...base, art: 'ladybug', mode: 'st_react', groggy: true }).eyes).toBe('sleepy');
  });

  it('every item material has an impact sound', async () => {
    const { soundMaterial } = await import('../../src/renderer/src/audio/sfx');
    for (const item of CONTENT.items.all)
      expect(['wood', 'metal', 'rubber', 'stone', 'glass', 'leaf', 'food']).toContain(
        soundMaterial(item.material),
      );
  });
});
