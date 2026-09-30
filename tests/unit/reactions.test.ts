import { describe, expect, it } from 'vitest';
import { GROUND_Y, Rng, Sim } from '../../src/game';
import { BUGS } from '../../src/game/data/bugs';
import { ITEMS } from '../../src/game/data/items';
import { REACTION_TYPES } from '../../src/game/events';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import type { Material } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { BugVoices, EMOTIONS, moodVoice, voiceLine } from '../../src/renderer/src/audio/voices';
import { ShakeDetector } from '../../src/renderer/src/input/pointerController';
import { bubbleScale } from '../../src/renderer/src/render/bubbles';
import { bugFace } from '../../src/renderer/src/render/bugFace';
import type { BugFaceInput } from '../../src/renderer/src/render/bugFace';
import { FACES, movePose, reactionLook, reactionShowing } from '../../src/renderer/src/render/reactions';
import type { Move } from '../../src/renderer/src/render/reactions';
import { thoughtFor } from '../../src/renderer/src/render/thoughts';
import { cursorPose } from '../../src/renderer/src/ui/cursor';

const ARTS = ['ladybug', 'pillbug', 'snail'] as const;

describe('reaction table', () => {
  it('has three different variants for every reaction and every bug', () => {
    for (const art of ARTS)
      for (const type of REACTION_TYPES) {
        const looks = [0, 1, 2].map((v) => reactionLook(art, type, v));
        const keys = looks.map((l) => JSON.stringify([l.eyes, l.mouth, l.pictos, l.move]));
        expect(new Set(keys).size, `${art} ${type}`).toBe(3);
        for (const l of looks) {
          expect(l.pictos.length).toBeGreaterThanOrEqual(1);
          expect(l.pictos.length).toBeLessThanOrEqual(2);
          expect(EMOTIONS).toContain(l.emotion);
          expect(l.seconds).toBeGreaterThan(0);
        }
      }
  });

  it('keeps the love, yum, yuck, and hate faces distinct', () => {
    const faces = Object.values(FACES).map((f) => `${f.eyes}/${f.mouth}`);
    expect(new Set(faces).size).toBe(4);
    expect(reactionLook('ladybug', 'fed_loved', 0).eyes).toBe('heart');
    expect(reactionLook('ladybug', 'fed_liked', 0).mouth).toBe('lick');
    expect(reactionLook('pillbug', 'fed_disliked', 1)).toMatchObject({ eyes: 'angry', mouth: 'teeth' });
    // Chewing disliked food is the yuck face: green, squeezed shut.
    const chew = bugFace({ ...base, mode: 'st_eat', chewing: 'disliked' });
    expect(chew).toMatchObject({ eyes: 'x', tint: 'green' });
  });

  it('gives each bug its own flavor: Dot giggles, Rollo gasps, Glorp says ooh', () => {
    expect(reactionLook('ladybug', 'grab', 0).emotion).toBe('giggle');
    expect(reactionLook('pillbug', 'grab', 0).emotion).toBe('gasp');
    expect(reactionLook('snail', 'grab', 0).emotion).toBe('ooh');
    // Dot's "again!" with a spring after landing.
    expect(reactionLook('ladybug', 'land', 0).pictos).toContain('spring');
    // Glorp's hard landing happens in his shell.
    for (const v of [0, 1, 2])
      expect(reactionLook('snail', 'land_hard', v)).toMatchObject({ form: 'in_shell', move: 'shell_spin' });
  });

  it('only shows a reaction in its own modes and for its length', () => {
    expect(reactionShowing('grab', 1.2, 'st_held', 0.5)).toBe(true);
    expect(reactionShowing('grab', 1.2, 'st_airborne', 0.5)).toBe(false);
    expect(reactionShowing('fed_loved', 1.9, 'st_react', 2)).toBe(false);
    expect(reactionShowing('fed_loved', 1.9, 'st_idle', 1)).toBe(true);
  });

  it('moves start and end at rest', () => {
    const moves: Move[] = [
      'hop',
      'wiggle',
      'shiver',
      'nod',
      'shrug',
      'stomp',
      'shake_head',
      'spin',
      'shell_spin',
      'pose',
      'cower',
    ];
    for (const m of moves) {
      const end = movePose(m, 2, 2);
      expect(end).toEqual({ bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 });
      const near = movePose(m, 1.999, 2);
      expect(Math.abs(near.tilt)).toBeLessThan(0.05);
      expect(Math.abs(near.flip - 1)).toBeLessThan(0.05);
      let moved = false;
      for (let t = 0; t < 1.5; t += 0.05) {
        const p = movePose(m, t, 2);
        if (p.bob !== 0 || p.tilt !== 0 || p.sx !== 1 || p.sy !== 1 || p.flip !== 1) moved = true;
      }
      expect(moved, m).toBe(true);
    }
  });
});

const base: BugFaceInput = {
  art: 'ladybug',
  mode: 'st_idle',
  needs: { need_hunger: 70, need_fun: 70, need_energy: 70 },
  time: 0,
  likesFlinging: true,
};

describe('bugFace for M2', () => {
  it('opens wide for liked food on offer and clams up for disliked food', () => {
    expect(bugFace({ ...base, offered: 'liked' }).mouth).toBe('aah');
    expect(bugFace({ ...base, offered: 'loved' }).eyes).toBe('heart');
    expect(bugFace({ ...base, offered: 'disliked' })).toMatchObject({ eyes: 'worried', mouth: 'flat' });
  });

  it('shows heart eyes while chewing loved food', () => {
    expect(bugFace({ ...base, mode: 'st_eat', chewing: 'loved' }).eyes).toBe('heart');
  });

  it('laughs harder the longer it is tickled', () => {
    expect(bugFace({ ...base, mode: 'st_held', tickle: 0.1 }).eyes).toBe('happy');
    expect(bugFace({ ...base, mode: 'st_held', tickle: 0.9 })).toMatchObject({
      eyes: 'x',
      mouth: 'whee',
      blush: true,
    });
  });

  it('is woozy when shaken, except Glorp, who hides in his shell', () => {
    expect(bugFace({ ...base, mode: 'st_held', woozy: true }).eyes).toBe('spiral');
    expect(bugFace({ ...base, art: 'snail', mode: 'st_held', woozy: true, dizzyProof: true }).form).toBe(
      'in_shell',
    );
  });

  it('frowns with steam when grumpy', () => {
    expect(bugFace({ ...base, mood: 'mood_grumpy' })).toMatchObject({ eyes: 'angry', steam: true });
    expect(bugFace({ ...base, mood: 'mood_sleepy' }).eyes).toBe('sleepy');
  });

  it('lets a reaction face win over the plain state face', () => {
    const f = bugFace({
      ...base,
      mode: 'st_react',
      reaction: { eyes: 'heart', mouth: 'grin', blush: true, tint: null, form: null },
    });
    expect(f.eyes).toBe('heart');
  });
});

describe('thought bubbles', () => {
  const full = { need_hunger: 90, need_fun: 90, need_energy: 90 };
  it('thinks about a favorite food when hungry, a toy when bored, and sleep when tired', () => {
    const dot = BUGS.get('bug_ladybug_dot');
    expect(thoughtFor(dot, full, ITEMS)).toBeNull();
    expect(thoughtFor(dot, { ...full, need_hunger: 10 }, ITEMS)).toEqual({
      pictos: ['food'],
      food: 'item_pepper_hot',
    });
    expect(thoughtFor(dot, { ...full, need_fun: 10 }, ITEMS)!.pictos).toEqual(['spring']);
    expect(thoughtFor(dot, { ...full, need_energy: 5, need_hunger: 10 }, ITEMS)!.pictos).toEqual(['zzz']);
    expect(thoughtFor(BUGS.get('bug_snail_glorp'), { ...full, need_hunger: 3 }, ITEMS)!.food).toBe(
      'item_moss_tuft',
    );
  });
});

describe('bubbles', () => {
  it('pop in with an overshoot, hold, and shrink away', () => {
    expect(bubbleScale(0, 2)).toBeLessThan(0.1);
    expect(Math.max(...[0.08, 0.1, 0.12, 0.15].map((t) => bubbleScale(t, 2)))).toBeGreaterThan(1);
    expect(bubbleScale(1, 2)).toBe(1);
    expect(bubbleScale(1.95, 2)).toBeLessThan(0.5);
    expect(bubbleScale(2, 2)).toBe(0);
  });
});

describe('hand cursor', () => {
  const s = { mode: 'none' as const, holding: false, overGrabbable: false, overButton: false };
  it('picks a pose from what the pointer is doing', () => {
    expect(cursorPose(s)).toBe('open');
    expect(cursorPose({ ...s, overGrabbable: true })).toBe('hover_grab');
    expect(cursorPose({ ...s, overButton: true })).toBe('hover_poke');
    expect(cursorPose({ ...s, mode: 'hold', holding: true })).toBe('grab');
    expect(cursorPose({ ...s, mode: 'hold', holding: false })).toBe('open');
    expect(cursorPose({ ...s, mode: 'pan' })).toBe('pan');
  });
});

describe('shake detection', () => {
  it('needs three strokes of 80 px within 0.8 s', () => {
    const d = new ShakeDetector();
    const path = [0, 50, 100, 60, 0, -10, 40, 100];
    const hits = path.map((x, i) => d.push(i * 50, x));
    expect(hits.lastIndexOf(true)).toBeGreaterThan(0);
    expect(hits.filter(Boolean)).toHaveLength(1);
  });

  it('ignores small wiggles and slow strokes', () => {
    const small = new ShakeDetector();
    expect([0, 40, 0, 40, 0, 40, 0].some((x, i) => small.push(i * 40, x))).toBe(false);
    const slow = new ShakeDetector();
    expect([0, 100, 0, 100].some((x, i) => slow.push(i * 600, x))).toBe(false);
  });
});

describe('M2 audio', () => {
  it('gives every emotion 1 to 6 syllables, and colors the voice by mood', () => {
    const dot = BUGS.get('bug_ladybug_dot').voice;
    for (const emotion of EMOTIONS) {
      const n = voiceLine(dot, emotion, new Rng(emotion)).filter((t) => t.wave !== 'noise').length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
    const plain = voiceLine(dot, 'happy', new Rng('m')).filter((t) => t.wave !== 'noise');
    const grumpy = voiceLine(dot, 'happy', new Rng('m'), 'mood_grumpy').filter((t) => t.wave !== 'noise');
    const happy = voiceLine(dot, 'happy', new Rng('m'), 'mood_happy').filter((t) => t.wave !== 'noise');
    expect(grumpy[0]!.freq).toBeLessThan(plain[0]!.freq);
    expect(happy[0]!.freq).toBeGreaterThan(plain[0]!.freq);
    expect(grumpy[0]!.dur).toBeGreaterThan(plain[0]!.dur);
    expect(moodVoice('mood_sleepy').rate).toBeLessThan(1);
    // Yuck falls, love rises.
    const yuck = voiceLine(dot, 'yuck', new Rng('y')).filter((t) => t.wave !== 'noise');
    expect(yuck[yuck.length - 1]!.freq).toBeLessThan(yuck[0]!.freq);
    const love = voiceLine(dot, 'love', new Rng('l')).filter((t) => t.wave !== 'noise');
    expect(love[love.length - 1]!.freq).toBeGreaterThan(love[0]!.freq);
  });

  it('speaks each reaction in its own emotion', () => {
    const sim = Sim.empty();
    const voices = new BugVoices(new NullAudioBackend(), BUGS, () => 0);
    voices.attach(sim.events, () => 'mood_happy');
    sim.events.emit('bug_reacted', { id: 1, defId: 'bug_ladybug_dot', reaction: 'fed_loved', variant: 0 });
    sim.events.emit('bug_reacted', {
      id: 2,
      defId: 'bug_pillbug_rollo',
      reaction: 'fed_disliked',
      variant: 0,
    });
    sim.events.emit('bug_tickled', { id: 3, defId: 'bug_snail_glorp', level: 2 });
    expect(voices.log.map((l) => l.emotion)).toEqual(['love', 'yuck', 'giggle']);
  });

  it('plays impacts by material, and food sounds for every step of a meal', () => {
    const sim = Sim.empty();
    const sfx = new Sfx(
      new NullAudioBackend(),
      () => 0.5,
      () => 0,
    );
    const materials: Record<string, Material> = { item_marble_blue: 'glass', item_leaf: 'leaf' };
    sfx.attach(
      sim.events,
      (kind, defId) => (kind === 'bug' ? 'bug' : (materials[defId] ?? 'wood')),
      (defId) => ITEMS.get(defId).tags,
    );
    const bonk = (defId: string, kind: 'bug' | 'item' = 'item', t = 0): void => {
      void t;
      sim.events.emit('bonked', { id: 1, kind, defId, speed: 10, x: 0, y: 0 });
    };
    bonk('item_marble_blue');
    expect(sfx.log).toEqual(['impact_glass']);
    const base = { id: 1, defId: 'bug_ladybug_dot', itemId: 2 };
    sim.events.emit('bug_fed', { ...base, itemDefId: 'item_berry_red', liking: 'liked', byPlayer: true });
    sim.events.emit('bug_fed', { ...base, itemDefId: 'item_mint_leaf', liking: 'disliked', byPlayer: true });
    sim.events.emit('bug_ate', { ...base, itemDefId: 'item_pepper_hot', liking: 'loved', x: 0, y: 0 });
    sim.events.emit('bug_spat', { ...base, itemDefId: 'item_mint_leaf', x: 0, y: 0, vx: 1, vy: -1 });
    sim.events.emit('bug_spat', { ...base, itemDefId: 'item_pepper_hot', x: 0, y: 0, vx: 1, vy: -1 });
    sim.events.emit('bug_burped', { id: 1, defId: 'bug_ladybug_dot', x: 0, y: 0 });
    sim.events.emit('item_shaken', { id: 1, kind: 'item', defId: 'item_pebble', x: 0, y: 0 });
    sim.events.emit('bug_tickled', { id: 1, defId: 'bug_ladybug_dot', level: 1 });
    expect(sfx.log.slice(1)).toEqual([
      'nom',
      'gag',
      'chomp',
      'flame',
      'sneeze',
      'ptoo',
      'burp',
      'shake',
      'tickle',
    ]);
  });

  it('has a sound for every input gesture', () => {
    const sfx = new Sfx(new NullAudioBackend());
    for (const g of ['hover', 'swish', 'pan', 'scroll', 'edge'] as const) sfx.play(g);
    expect(sfx.log).toEqual(['hover', 'swish', 'pan', 'scroll', 'edge']);
  });
});

describe('feeding end to end in the sim, heard', () => {
  it('a player feeding makes the right noises', () => {
    const sim = Sim.empty({ seed: 's' });
    const sfx = new Sfx(
      new NullAudioBackend(),
      () => 0.5,
      () => 0,
    );
    sfx.attach(sim.events);
    const bug = sim.spawn('bug', 'bug_pillbug_rollo', 7, GROUND_Y - 0.48);
    sim.run(30);
    const b = sim.entities.get(bug.id)!.bug!;
    b.decideIn = 1e6;
    b.timer = 1e6;
    const m = sim.mouthAnchor(bug.id)!;
    const berry = sim.spawn('item', 'item_berry_red', m.x, m.y - 0.3);
    sim.send({ type: 'grab', x: m.x, y: m.y - 0.3 });
    for (let i = 0; i < 40; i++) {
      const mm = sim.mouthAnchor(bug.id)!;
      sim.send({ type: 'drag', x: mm.x, y: mm.y - 0.2 });
      sim.step();
    }
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(150);
    expect(sim.entities.has(berry.id)).toBe(false);
    expect(sfx.log).toEqual(expect.arrayContaining(['grab', 'drop', 'nom', 'chomp']));
  });
});
