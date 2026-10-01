import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/game/core/rng';
import { BUGS } from '../../src/game/data/bugs';
import { accentFor, voiceLine } from '../../src/renderer/src/audio/voices';
import { bugFace } from '../../src/renderer/src/render/bugFace';
import type { BugFaceInput } from '../../src/renderer/src/render/bugFace';
import { PAINT_COLORS, paintColors } from '../../src/renderer/src/render/draw/paint';

const needs = { need_hunger: 70, need_fun: 70, need_energy: 70, need_social: 80, need_clean: 90 };
const base: BugFaceInput = { art: 'stagbeetle', mode: 'st_idle', needs, time: 0, likesFlinging: false };

describe('M7 bug faces', () => {
  it('worries when Moose is stuck on his back, and looks like himself in the hand', () => {
    const stuck = bugFace({ ...base, mode: 'st_react', pending: 'stuck' });
    expect(stuck.eyes).toBe('worried');
    expect(['o', 'wobble']).toContain(stuck.mouth);
    expect(bugFace({ ...base, mode: 'st_held', pending: 'stuck', time: 1 })).toEqual(
      bugFace({ ...base, mode: 'st_held', time: 1 }),
    );
  });

  it('keeps Barty smug while he is aloof', () => {
    expect(bugFace({ ...base, art: 'dungbeetle', mode: 'st_wander', pending: 'aloof' })).toMatchObject({
      eyes: 'sleepy',
      mouth: 'smile',
    });
  });

  it('curls Barty into a ball when flung, but not for his own hops', () => {
    expect(bugFace({ ...base, art: 'dungbeetle', mode: 'st_airborne' }).form).toBe('curled');
    expect(bugFace({ ...base, art: 'dungbeetle', mode: 'st_rolled' }).form).toBe('curled');
    expect(bugFace({ ...base, art: 'dungbeetle', mode: 'st_airborne', selfLaunched: true }).form).toBe(
      'normal',
    );
    // Sleeping curled up is Rollo's thing.
    expect(bugFace({ ...base, art: 'dungbeetle', mode: 'st_sleep' }).form).toBe('normal');
  });

  it('keeps a cocoon asleep whatever happens to it', () => {
    for (const mode of ['st_held', 'st_airborne', 'st_idle', 'st_dizzy'] as const)
      expect(bugFace({ ...base, art: 'caterpillar', mode, morph: 'cocoon' }).eyes).toBe('sleepy');
    expect(bugFace({ ...base, art: 'caterpillar', morph: 'butterfly' }).eyes).toBe('open');
  });

  it('keeps Twig deadpan', () => {
    const twig = { ...base, art: 'stickinsect' as const };
    expect(bugFace({ ...twig, mood: 'mood_content' })).toMatchObject({ eyes: 'sleepy', mouth: 'flat' });
    expect(bugFace({ ...twig, mood: 'mood_happy' })).toMatchObject({ eyes: 'sleepy', mouth: 'smile' });
    expect(bugFace({ ...twig, mode: 'st_held' }).mouth).toBe('flat');
    expect(bugFace({ ...twig, mode: 'st_airborne' })).toMatchObject({ eyes: 'sleepy', mouth: 'flat' });
  });
});

describe('paint on bugs', () => {
  it('keeps known colors in order, without repeats, at most five', () => {
    expect(paintColors(undefined)).toEqual([]);
    expect(paintColors(['paint_blue', 'paint_blue', 'paint_nope', 'paint_red'])).toEqual([
      PAINT_COLORS.paint_blue,
      PAINT_COLORS.paint_red,
    ]);
    expect(paintColors(Object.keys(PAINT_COLORS))).toHaveLength(5);
  });
});

describe('M7 voices', () => {
  it('gives Barty huffs, Twig dry clicks, and Whiff a muffled tremble', () => {
    expect(accentFor('dungbeetle')).toBe('huff');
    expect(accentFor('stickinsect')).toBe('click');
    expect(accentFor('stinkbug')).toBe('tremble');
    expect(accentFor('ladybug')).toBeUndefined();

    const barty = BUGS.get('bug_dungbeetle_barty').voice;
    const huffy = voiceLine(barty, 'happy', new Rng('b'), undefined, 'huff');
    const last = huffy.reduce((a, t) => ((t.delay ?? 0) > (a.delay ?? 0) ? t : a));
    expect(last.wave).toBe('noise');

    const twig = BUGS.get('bug_stickinsect_twig').voice;
    const plain = voiceLine(twig, 'happy', new Rng('t')).filter((t) => t.wave !== 'noise');
    const dry = voiceLine(twig, 'happy', new Rng('t'), undefined, 'click').filter(
      (t) => t.wave !== 'noise' && t.wave !== 'sine',
    );
    expect(dry[0]!.gain!).toBeLessThan(plain[0]!.gain!);

    const whiff = BUGS.get('bug_stinkbug_whiff').voice;
    const calm = voiceLine(whiff, 'scared', new Rng('w')).filter((t) => t.wave !== 'noise');
    const shaky = voiceLine(whiff, 'scared', new Rng('w'), undefined, 'tremble').filter(
      (t) => t.wave !== 'noise',
    );
    expect(shaky[0]!.vibrato!.depth).toBeGreaterThan(calm[0]!.vibrato!.depth);
    expect(shaky[0]!.formants![1]).toBeLessThan(calm[0]!.formants![1]);
  });
});
