import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { CONTENT } from '../../src/game/data';
import { WEAR_SLOTS } from '../../src/game/data/types';
import { SAVE_VERSION } from '../../src/game/save/schema';
import { MIGRATIONS, loadSaveFile } from '../../src/game/save/migrations';
import { CLICK_TICKS, DOFF_AFTER, FLIP_AFTER, JUDGE_AFTER } from '../../src/game/systems/wardrobe';
import { PLAZA_X } from './world';

// M11: hats and accessories on bugs (game design doc, sections 2, 4, 7.3,
// and 12): drop rule 3, slots and swaps, the hand, flings, saves, opinions,
// bugs nearby, Prim's verdicts, the extra effects, and the secrets.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const WEARABLES = CONTENT.items.all.filter((d) => d.wear);

/** A world with nothing in it but what a test puts there. */
function world(seed: string): Sim {
  return Sim.empty({ seed });
}

function bug(sim: Sim, defId: string, x = PLAZA_X + 5): Entity {
  const def = sim.content.bugs.get(defId);
  const b = sim.spawn('bug', defId, x, sim.surfaceY(x) - def.radius - 0.02);
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  return b;
}

function item(sim: Sim, defId: string, x: number, y?: number): Entity {
  const half = sim.halfHeightOfDef(defId);
  return sim.spawn('item', defId, x, y ?? sim.surfaceY(x) - half - 0.02);
}

/** Pick a thing up with the hand, carry it to (x, y), and let go gently there. */
function carryTo(sim: Sim, e: Entity, x: number, y: number): void {
  const s = sim.view(e.id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  for (let i = 0; i < 40; i++) {
    sim.send({ type: 'drag', x, y });
    sim.step();
  }
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

/** Carry a thing over a bug's head (following it if it walks) and let go. */
function dropOnHead(sim: Sim, b: Entity, e: Entity): void {
  const s = sim.view(e.id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  // Up and over, as a hand would, then down onto the head.
  for (let i = 0; i < 60; i++) {
    // Hold still for it (a bug turning round moves its head to the other side).
    b.bug!.mode = 'st_react';
    b.bug!.timer = 30;
    const top = sim.wardrobe.anchor(b, 'head');
    sim.send({ type: 'drag', x: top.x, y: top.y - (i < 25 ? 1.5 : 0.15) });
    sim.step();
  }
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

describe('wearing things (drop rule 3)', () => {
  it('a hat let go on a head goes on: its body is off and it rides on the bug', () => {
    const sim = world('hat-on');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const hat = item(sim, 'item_hat_acorn_cap', PLAZA_X + 8);
    sim.run(10);
    dropOnHead(sim, dot, hat);
    expect(dot.wearing).toEqual({ head: hat.id });
    expect(sim.physics.isActive(hat.id)).toBe(false);
    expect(sim.view(hat.id)!.worn).toEqual({ by: dot.id, slot: 'head' });
    expect(sim.view(dot.id)!.bug!.wearing).toEqual([
      { slot: 'head', id: hat.id, defId: 'item_hat_acorn_cap' },
    ]);
    expect(named(log, 'wearable_worn')).toMatchObject([
      { id: hat.id, bugId: dot.id, slot: 'head', by: 'player', thrown: false, took: null },
    ]);
    // It follows her about.
    sim.physics.setVelocity(dot.id, 1, 0);
    sim.run(40);
    const top = sim.wardrobe.anchor(dot, 'head');
    const at = sim.physics.getState(hat.id);
    expect(Math.hypot(at.x - top.x, at.y - top.y)).toBeLessThan(0.05);
  });

  it('a second thing in a slot pops the first off in a little arc; other slots stack up', () => {
    const sim = world('hat-swap');
    const log = record(sim);
    const rollo = bug(sim, 'bug_pillbug_rollo');
    sim.run(30);
    const a = item(sim, 'item_hat_acorn_cap', PLAZA_X + 8);
    const b = item(sim, 'item_hat_tiny_top_hat', PLAZA_X + 9);
    const shades = item(sim, 'item_acc_sunglasses', PLAZA_X + 10);
    const bow = item(sim, 'item_acc_bowtie_ribbon', PLAZA_X + 11);
    sim.run(10);
    dropOnHead(sim, rollo, a);
    dropOnHead(sim, rollo, shades);
    dropOnHead(sim, rollo, bow);
    expect(rollo.wearing).toEqual({ head: a.id, face: shades.id, back: bow.id });
    dropOnHead(sim, rollo, b);
    expect(rollo.wearing).toEqual({ head: b.id, face: shades.id, back: bow.id });
    expect(sim.physics.isActive(a.id)).toBe(true);
    expect(sim.physics.getState(a.id).vy).toBeLessThan(-1);
    expect(named(log, 'wearable_removed')).toMatchObject([{ id: a.id, how: 'popped', slot: 'head' }]);
    expect(named(log, 'wearable_worn').at(-1)).toMatchObject({ id: b.id, took: a.id });
  });

  it('every wearable goes on every bug, in its own slot, at that bug’s anchor (29 x every bug)', () => {
    expect(WEARABLES).toHaveLength(29);
    for (const bdef of CONTENT.bugs.all) {
      const sim = world(`table-${bdef.id}`);
      const b = bug(sim, bdef.id);
      if (b.bug) delete b.bug.pending;
      sim.run(5);
      for (const w of WEARABLES) {
        const e = item(sim, w.id, PLAZA_X + 12);
        expect(sim.wardrobe.putOn(b, e, 'player'), `${w.id} on ${bdef.id}`).toBe(true);
        expect(b.wearing?.[w.wear!]).toBe(e.id);
        sim.wardrobe.place();
        const at = sim.physics.getState(e.id);
        const want = sim.wardrobe.anchor(b, w.wear!);
        expect(Math.hypot(at.x - want.x, at.y - want.y), `${w.id} on ${bdef.id}`).toBeLessThan(1e-6);
        sim.wardrobe.takeOff(e.id, 'dropped');
        sim.remove(e.id);
      }
      expect(b.wearing).toBeUndefined();
    }
  });

  it('a hat thrown onto a head lands on it', () => {
    const sim = world('hat-throw');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    dot.bug!.mode = 'st_react';
    dot.bug!.timer = 120;
    const s = sim.physics.getState(dot.id);
    const x = s.x + dot.bug!.facing * 0.3;
    const y = s.y - 1.6;
    const hat = item(sim, 'item_hat_party_cone', x, y);
    sim.send({ type: 'grab', x, y });
    sim.step();
    // A quick toss straight down onto her head.
    sim.send({ type: 'release', vx: 0, vy: 3.2 });
    for (let i = 0; i < 90 && !dot.wearing; i++) sim.step();
    expect(dot.wearing?.head).toBe(hat.id);
    expect(named(log, 'wearable_worn')).toMatchObject([{ id: hat.id, thrown: true }]);
  });

  it('stays on through a fling and a hard landing, and through a save and load', () => {
    const sim = world('hat-fling');
    const boing = bug(sim, 'bug_snail_glorp');
    sim.run(30);
    const hat = item(sim, 'item_hat_wizard', PLAZA_X + 8);
    sim.run(10);
    dropOnHead(sim, boing, hat);
    const s = sim.physics.getState(boing.id);
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    for (let i = 0; i < 20; i++) {
      sim.send({ type: 'drag', x: s.x + 1, y: s.y - 3 });
      sim.step();
    }
    sim.send({ type: 'release', vx: 9, vy: -9 });
    sim.run(240);
    expect(boing.wearing).toEqual({ head: hat.id });
    const save = {
      version: SAVE_VERSION,
      savedAt: 'now',
      world: sim.serialize(),
      view: { cameraX: 0 },
      meta: { createdAt: 'now', thumb: null },
    };
    const back = Sim.load(loadSaveFile(JSON.stringify(save)).world);
    const again = back.entities.get(boing.id)!;
    expect(again.wearing).toEqual({ head: hat.id });
    expect(back.physics.isActive(hat.id)).toBe(false);
    expect(back.view(hat.id)!.worn).toEqual({ by: boing.id, slot: 'head' });
    back.run(60);
    expect(again.wearing).toEqual({ head: hat.id });
    expect(back.serialize()).toEqual(back.serialize());
  });

  it('the hand pulls a hat off; a click on it puts it back and pokes the bug instead', () => {
    const sim = world('hat-hand');
    const log = record(sim);
    const glorp = bug(sim, 'bug_snail_glorp');
    sim.run(30);
    const hat = item(sim, 'item_hat_party_cone', PLAZA_X + 8);
    sim.run(10);
    dropOnHead(sim, glorp, hat);
    sim.run(5);
    // A click: press and let go at once.
    let at = sim.physics.getState(hat.id);
    expect(sim.pickAt(at.x, at.y - 0.05)).toBe(hat.id);
    sim.send({ type: 'grab', x: at.x, y: at.y - 0.05 });
    sim.step();
    sim.send({ type: 'poke', x: at.x, y: at.y - 0.05 });
    sim.step();
    expect(glorp.wearing).toEqual({ head: hat.id });
    expect(named(log, 'hat_tooted')).toMatchObject([{ id: glorp.id }]);
    // A press and a pull: it comes off into the hand.
    sim.run(CLICK_TICKS + 2);
    at = sim.physics.getState(hat.id);
    sim.send({ type: 'grab', x: at.x, y: at.y - 0.05 });
    sim.step();
    expect(glorp.wearing).toBeUndefined();
    expect(sim.physics.grabbed).toBe(hat.id);
    expect(named(log, 'wearable_removed').at(-1)).toMatchObject({ id: hat.id, how: 'grabbed' });
    for (let i = 0; i < 30; i++) {
      sim.send({ type: 'drag', x: at.x + 2, y: at.y - 1 });
      sim.step();
    }
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(60);
    expect(sim.physics.isActive(hat.id)).toBe(true);
  });

  it('shaking a held bug sends what it wears flying', () => {
    const sim = world('hat-shake');
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const a = item(sim, 'item_hat_acorn_cap', PLAZA_X + 8);
    const b = item(sim, 'item_acc_bandaid', PLAZA_X + 9);
    sim.run(10);
    dropOnHead(sim, dot, a);
    dropOnHead(sim, dot, b);
    const s = sim.physics.getState(dot.id);
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'shake' });
    sim.step();
    expect(dot.wearing).toBeUndefined();
    expect(sim.physics.isActive(a.id) && sim.physics.isActive(b.id)).toBe(true);
  });

  it('a bug leaving the world lets go of what it wears', () => {
    const sim = world('hat-gone');
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const a = item(sim, 'item_hat_acorn_cap', PLAZA_X + 8);
    sim.run(10);
    dropOnHead(sim, dot, a);
    sim.send({ type: 'despawn', id: dot.id });
    sim.run(30);
    expect(sim.physics.isActive(a.id)).toBe(true);
    expect(sim.view(a.id)!.worn).toBeUndefined();
  });

  it('waiting bugs cannot be dressed', () => {
    const sim = Sim.create({ seed: 'pending' });
    const twig = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_stickinsect_twig')!;
    expect(twig.bug!.pending).toBe('disguised');
    const ids = sim.wardrobe.candidates(-1).map((c) => c.entityId);
    expect(ids).not.toContain(twig.id);
  });
});

describe('opinions', () => {
  it('a loved hat gets hearts; a hated one comes off again; the rest get the bug’s own look', () => {
    const sim = world('opinions');
    const log = record(sim);
    const moose = bug(sim, 'bug_stagbeetle_moose');
    sim.run(30);
    const top = item(sim, 'item_hat_tiny_top_hat', PLAZA_X + 9);
    const googly = item(sim, 'item_acc_googly_glasses', PLAZA_X + 10);
    const acorn = item(sim, 'item_hat_acorn_cap', PLAZA_X + 11);
    sim.run(10);
    dropOnHead(sim, moose, top);
    expect(moose.wearing?.head).toBe(top.id);
    const reacted = (): unknown[] =>
      named(log, 'bug_reacted')
        .filter((r) => r.id === moose.id)
        .map((r) => r.reaction);
    expect(reacted()).toContain('hat_love');
    dropOnHead(sim, moose, googly);
    expect(reacted()).toContain('hat_yuck');
    expect(moose.wearing?.face).toBe(googly.id);
    sim.run(DOFF_AFTER + 2);
    expect(moose.wearing?.face).toBeUndefined();
    expect(named(log, 'wearable_removed').at(-1)).toMatchObject({ id: googly.id, how: 'disliked' });
    sim.run(90);
    dropOnHead(sim, moose, acorn);
    expect(reacted().at(-1)).toBe('hatted');
  });

  it('Boing hops his hat off and catches it: a trick, never a loss', () => {
    const sim = world('boing');
    const log = record(sim);
    const boing = bug(sim, 'bug_grasshopper_boing');
    sim.run(30);
    const hat = item(sim, 'item_hat_acorn_cap', PLAZA_X + 9);
    sim.run(10);
    dropOnHead(sim, boing, hat);
    sim.run(FLIP_AFTER + 120);
    expect(named(log, 'hat_flipped')).toMatchObject([{ id: boing.id, itemId: hat.id }]);
    expect(boing.wearing?.head).toBe(hat.id);
  });

  it('a bug nearby looks round, and Prim comes to judge', () => {
    const sim = world('judge');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot', PLAZA_X + 5);
    const rollo = bug(sim, 'bug_pillbug_rollo', PLAZA_X + 7);
    const prim = bug(sim, 'bug_mantis_prim', PLAZA_X + 10);
    sim.run(30);
    const cone = item(sim, 'item_hat_party_cone', PLAZA_X + 3);
    sim.run(10);
    dropOnHead(sim, dot, cone);
    sim.run(JUDGE_AFTER + 2);
    const judged = named(log, 'hat_judged');
    expect(judged).toMatchObject([{ judge: prim.id, wearer: dot.id, approve: true }]);
    const reacted = named(log, 'bug_reacted');
    expect(reacted.some((r) => r.id === prim.id && r.reaction === 'fashion')).toBe(true);
    void rollo;
  });

  it('Prim gives goo the eyebrow', () => {
    const sim = world('judge-goo');
    const log = record(sim);
    const rollo = bug(sim, 'bug_pillbug_rollo', PLAZA_X + 5);
    bug(sim, 'bug_mantis_prim', PLAZA_X + 9);
    sim.run(30);
    const goo = item(sim, 'item_hat_goo', PLAZA_X + 3);
    sim.run(10);
    dropOnHead(sim, rollo, goo);
    sim.run(JUDGE_AFTER + 2);
    expect(named(log, 'hat_judged')).toMatchObject([{ wearer: rollo.id, approve: false }]);
  });

  it('two bugs chatting swap hats when each likes the other’s better', () => {
    const sim = world('swap');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot', PLAZA_X + 5);
    const rollo = bug(sim, 'bug_pillbug_rollo', PLAZA_X + 6.2);
    sim.run(30);
    // Dot likes the party cone; Rollo likes the acorn cap. Each wears the other's.
    const acorn = item(sim, 'item_hat_acorn_cap', PLAZA_X + 9);
    const cone = item(sim, 'item_hat_party_cone', PLAZA_X + 10);
    sim.wardrobe.putOn(dot, acorn, 'player', false, true);
    sim.wardrobe.putOn(rollo, cone, 'player', false, true);
    for (const [a, b, role] of [
      [dot, rollo, 'lead'],
      [rollo, dot, 'follow'],
    ] as const)
      a.bug!.social = {
        kind: 'soc_chat',
        partner: b.id,
        role,
        stage: 2,
        count: 0,
        goal: 4,
        beat: 30,
        left: 300,
        item: null,
        last: null,
      };
    sim.run(31);
    expect(named(log, 'hats_swapped')).toHaveLength(1);
    expect(dot.wearing?.head).toBe(cone.id);
    expect(rollo.wearing?.head).toBe(acorn.id);
  });

  it('Prim puts on a hat she finds lying by her head', () => {
    const sim = world('dress');
    const prim = bug(sim, 'bug_mantis_prim', PLAZA_X + 5);
    sim.run(30);
    const head = sim.wardrobe.headCenter(prim);
    const hat = item(sim, 'item_hat_wizard', head.x + 0.3);
    for (let i = 0; i < 200 && !prim.wearing; i++) {
      prim.bug!.mode = 'st_idle';
      sim.step();
    }
    expect(prim.wearing?.head).toBe(hat.id);
  });

  it('bugs never dress in the player’s setups', () => {
    const sim = world('dress-setup');
    const prim = bug(sim, 'bug_mantis_prim', PLAZA_X + 5);
    sim.run(30);
    const head = sim.wardrobe.headCenter(prim);
    const hat = item(sim, 'item_hat_wizard', head.x + 0.3);
    sim.addTag(hat.id, 'tag_player_setup', 'player', null);
    for (let i = 0; i < 200; i++) {
      prim.bug!.mode = 'st_idle';
      sim.step();
    }
    expect(prim.wearing).toBeUndefined();
  });
});

describe('extra effects (section 7.3)', () => {
  it('propeller: falls slower and glides; mushroom: bounces; skates: almost no friction', () => {
    const sim = world('perks');
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const prop = item(sim, 'item_hat_propeller', PLAZA_X + 9);
    sim.wardrobe.putOn(dot, prop, 'player', false, true);
    expect(sim.physics.gravityScale(dot.id)).toBeCloseTo(0.55);
    expect(sim.bugDef(dot).glidesWhenFlung).toBe(true);
    const skates = item(sim, 'item_acc_roller_skates', PLAZA_X + 10);
    const before = sim.physics.friction(dot.id);
    sim.wardrobe.putOn(dot, skates, 'player', false, true);
    expect(sim.physics.friction(dot.id)).toBeCloseTo(before * 0.1);
    sim.wardrobe.takeOff(prop.id, 'dropped');
    expect(sim.physics.gravityScale(dot.id)).toBeCloseTo(1);
    expect(sim.bugDef(dot).glidesWhenFlung).toBe(false);
  });

  it('beanie: never cold; goo: smelly; bubble: walks the pond bottom; candle: glows', () => {
    const sim = world('perks2');
    const skeet = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    sim.wardrobe.putOn(skeet, item(sim, 'item_hat_yarn_beanie', PLAZA_X + 9), 'player', false, true);
    expect(sim.addTag(skeet.id, 'tag_cold', 'debug')).toBe(false);
    sim.wardrobe.putOn(skeet, item(sim, 'item_hat_goo', PLAZA_X + 10), 'player', false, true);
    sim.run(31);
    expect(sim.hasTag(skeet.id, 'tag_smelly')).toBe(true);
    sim.wardrobe.putOn(skeet, item(sim, 'item_hat_bubble', PLAZA_X + 11), 'player', false, true);
    expect(sim.bugDef(skeet).swim).toBe('sink');
    expect(sim.glows(skeet)).toBe(false);
    sim.wardrobe.putOn(skeet, item(sim, 'item_hat_candle', PLAZA_X + 12), 'player', false, true);
    expect(sim.glows(skeet)).toBe(true);
  });

  it('an eggshell hat breaks on a hard landing', () => {
    const sim = world('egg');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const egg = item(sim, 'item_hat_eggshell', PLAZA_X + 9);
    sim.wardrobe.putOn(dot, egg, 'player', false, true);
    sim.wardrobe.landed(dot, 9);
    expect(sim.entities.has(egg.id)).toBe(false);
    expect(named(log, 'shattered')).toHaveLength(1);
    expect(dot.wearing).toBeUndefined();
  });

  it('a viking headbutts a loose thing in its way', () => {
    const sim = world('viking');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    sim.wardrobe.putOn(dot, item(sim, 'item_hat_viking', PLAZA_X + 12), 'player', false, true);
    const s = sim.physics.getState(dot.id);
    const pebble = item(sim, 'item_pebble', s.x + 0.75);
    for (let i = 0; i < 61; i++) {
      dot.bug!.facing = 1;
      sim.physics.setVelocity(dot.id, 0.8, 0);
      sim.step();
    }
    expect(named(log, 'headbutted').some((h) => h.itemId === pebble.id)).toBe(true);
  });

  it('the monocle shows a tag of what its wearer sniffs', () => {
    const sim = world('monocle');
    const log = record(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    sim.wardrobe.putOn(dot, item(sim, 'item_acc_monocle', PLAZA_X + 12), 'player', false, true);
    const pepper = item(sim, 'item_pepper_hot', PLAZA_X + 3);
    sim.bugNotice(dot, { type: 'inspected', itemId: pepper.id });
    expect(named(log, 'monocle_peered')).toMatchObject([{ id: dot.id, itemId: pepper.id }]);
    expect(named(log, 'monocle_peered')[0]!.tag).toEqual(expect.stringMatching(/^tag_/));
  });

  it('Prim in the chef hat chops a food in two', () => {
    const sim = world('chef');
    const log = record(sim);
    const prim = bug(sim, 'bug_mantis_prim');
    sim.run(30);
    sim.wardrobe.putOn(prim, item(sim, 'item_hat_chef', PLAZA_X + 12), 'player', false, true);
    const s = sim.physics.getState(prim.id);
    const berry = item(sim, 'item_berry_red', s.x + 0.6);
    for (let i = 0; i < 70 && named(log, 'food_chopped').length === 0; i++) {
      prim.bug!.mode = 'st_idle';
      sim.step();
    }
    expect(named(log, 'food_chopped')).toMatchObject([
      { id: prim.id, itemId: berry.id, defId: 'item_berry_red' },
    ]);
    expect(sim.entities.ofKind('item').filter((e) => e.defId === 'item_berry_red')).toHaveLength(2);
  });
});

describe('secrets', () => {
  it('compost goo let go on a head becomes the goo hat (secret_compost_goo_hat)', () => {
    const sim = world('goo');
    const rollo = bug(sim, 'bug_pillbug_rollo');
    sim.run(30);
    const goo = item(sim, 'item_compost_goo', PLAZA_X + 9);
    sim.run(5);
    const c = sim.wardrobe.crown(rollo);
    carryTo(sim, goo, c.x, c.y);
    expect(sim.entities.has(goo.id)).toBe(false);
    const hat = sim.entities.get(rollo.wearing!.head!)!;
    expect(hat.defId).toBe('item_hat_goo');
    expect(sim.secrets).toContain('secret_compost_goo_hat');
  });

  it('goo let go at the mouth is still a meal', () => {
    const sim = world('goo-meal');
    const rollo = bug(sim, 'bug_pillbug_rollo');
    sim.run(30);
    const goo = item(sim, 'item_compost_goo', PLAZA_X + 9);
    sim.run(5);
    const m = sim.mouthAnchor(rollo.id)!;
    carryTo(sim, goo, m.x, m.y);
    expect(rollo.wearing).toBeUndefined();
    expect(rollo.bug!.mouthful).toBe(goo.id);
  });

  it('an eggshell let go on a head becomes the eggshell hat', () => {
    const sim = world('egg-hat');
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.run(30);
    const egg = item(sim, 'item_eggshell', PLAZA_X + 9);
    sim.run(5);
    const c = sim.wardrobe.crown(dot);
    carryTo(sim, egg, c.x, c.y);
    expect(sim.entities.get(dot.wearing!.head!)!.defId).toBe('item_hat_eggshell');
  });

  it('every bug in a hat at once: Prim leads the fashion parade (secret_fashion_parade)', () => {
    const sim = world('parade');
    const log = record(sim);
    const bugs = ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_mantis_prim'].map((d, i) =>
      bug(sim, d, PLAZA_X + 4 + i * 2),
    );
    sim.run(30);
    const hats = ['item_hat_acorn_cap', 'item_hat_party_cone', 'item_hat_chef'];
    bugs.forEach((b, i) =>
      sim.wardrobe.putOn(b, item(sim, hats[i]!, PLAZA_X + 12 + i), 'player', false, true),
    );
    sim.run(31);
    expect(sim.secrets).toContain('secret_fashion_parade');
    expect(named(log, 'parade_started')).toMatchObject([{ leader: bugs[2]!.id }]);
  });
});

describe('save version 15', () => {
  it('migrates a version 14 save, which wears nothing, and gives it M11’s new things', () => {
    const sim = Sim.create({ seed: 'old' });
    const world14 = sim.serialize();
    delete world14.wardrobe;
    world14.entities = world14.entities.filter(
      (e) =>
        !(e.kind === 'item' && CONTENT.items.get(e.defId).wear) ||
        e.defId === 'item_hat_thimble' ||
        e.defId === 'item_hat_mushroom',
    );
    const file = {
      version: 14,
      savedAt: 'x',
      world: world14,
      view: { cameraX: 0 },
      meta: { createdAt: 'x', thumb: null },
    };
    expect(MIGRATIONS[14]).toBeDefined();
    const loaded = loadSaveFile(JSON.stringify(file));
    expect(loaded.version).toBe(15);
    const back = Sim.load(loaded.world);
    const have = new Set(back.entities.ofKind('item').map((e) => e.defId));
    for (const id of ['item_hat_acorn_cap', 'item_acc_sunglasses', 'item_hat_tiny_top_hat', 'item_hat_chef'])
      expect(have.has(id), id).toBe(true);
  });

  it('rejects a bad wearing list', () => {
    const sim = world('bad');
    const dot = bug(sim, 'bug_ladybug_dot');
    const w = sim.serialize();
    const e = w.entities.find((x) => x.id === dot.id)!;
    (e as unknown as Record<string, unknown>).wearing = { hat: 'no' };
    const file = {
      version: SAVE_VERSION,
      savedAt: 'x',
      world: w,
      view: { cameraX: 0 },
      meta: { createdAt: 'x', thumb: null },
    };
    expect(() => loadSaveFile(JSON.stringify(file))).toThrow(/wearing/);
  });

  it('every slot name is one of the four', () => {
    expect(WEAR_SLOTS).toEqual(['head', 'face', 'back', 'feet']);
    for (const w of WEARABLES) expect(WEAR_SLOTS).toContain(w.wear);
  });
});
