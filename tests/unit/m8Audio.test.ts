import { describe, expect, it } from 'vitest';
import { Rng, SIM_HZ, Sim } from '../../src/game';
import { BENCH_SHAKE } from '../../src/game/systems/bench';
import { HIT_STOP } from '../../src/renderer/src/render/areaArt/benchLive';
import type { GameEvents } from '../../src/game';
import { BUGS } from '../../src/game/data/bugs';
import { noteFreq, noteTones, timbreOf } from '../../src/renderer/src/audio/craftSfx';
import { Sfx, startSound } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend, type Tone } from '../../src/renderer/src/audio/synth';
import { BugVoices, onScale, potionVoice, voiceLine } from '../../src/renderer/src/audio/voices';

// M8's sounds and potion voices.

const setup = (): { sim: Sim; backend: NullAudioBackend; sfx: Sfx; clock: { t: number } } => {
  const sim = Sim.empty();
  const backend = new NullAudioBackend();
  const clock = { t: 0 };
  const sfx = new Sfx(
    backend,
    () => 0.5,
    () => clock.t,
  );
  sfx.attach(sim.events);
  return { sim, backend, sfx, clock };
};

const p = { x: 0, y: 0 };

const EMITS: [keyof GameEvents, unknown][] = [
  ['tray_filled', { tray: 0, id: 1, defId: 'item_bottle_cap', ...p }],
  ['tray_emptied', { tray: 0, id: 1, ...p }],
  ['bench_pulled', { empty: false, helpers: [], strong: false, ...p }],
  ['bench_pulled', { empty: false, helpers: [2], strong: true, ...p }],
  ['bench_pulled', { empty: true, helpers: [], strong: false, ...p }],
  ['crafted', { recipe: 'r', id: 1, defId: 'd', first: true, ...p }],
  ['crafted', { recipe: 'r', id: 1, defId: 'd', first: false, ...p }],
  ['uncrafted', { from: 'd', parts: [1, 2], ...p }],
  ['bench_failed', { kind: 'sticky', blobId: 1, ate: [], ...p }],
  ['bench_failed', { kind: 'smelly', blobId: 1, ate: [], ...p }],
  ['bench_failed', { kind: 'bouncy', blobId: 1, ate: [], ...p }],
  ['bench_failed', { kind: 'food', blobId: null, ate: ['item_berry'], ...p }],
  ['bench_failed', { kind: 'plain', blobId: 1, ate: [], ...p }],
  ['bench_shrugged', { id: 1, ...p }],
  ['bench_refused', { id: 1, ...p }],
  ['bench_hinted', { recipe: 'r', tray: 2, missing: 'm', ...p }],
  ['bench_nudged', { recipe: 'r', tag: 'tag_bouncy', ...p }],
  ['blueprint_found', { id: 1, recipe: 'r', ...p }],
  ['bug_wished', { id: 1, defId: 'bug_ladybug_dot', recipe: 'r', output: 'o' }],
  ['blob_split', { id: 1, parts: [2, 3], ...p }],
  ['blob_squeaked', { id: 1, ...p }],
  ['cauldron_added', { defId: 'd', essence: 'ess_grow', color: 0, count: 1, ...p }],
  ['cauldron_added', { defId: 'd', essence: null, color: 0, count: 3, ...p }],
  ['cauldron_full', { id: 1, ...p }],
  ['cauldron_stirred', { turns: 0.5, ...p }],
  ['cauldron_bubbled', { color: 0, cheer: [], ...p }],
  ['potion_brewed', { id: 1, potion: 'pot_giant', color: 0, triple: false, ...p }],
  ['potion_brewed', { id: 1, potion: null, color: 0, triple: true, ...p }],
  ['cauldron_tipped', { count: 2, ...p }],
  ['potion_drunk', { id: 1, defId: 'bug_ladybug_dot', potion: 'pot_giant', ...p }],
  ['potion_shattered', { id: 1, targetId: null, potion: null, color: 0, applied: false, ...p }],
  ['potion_started', { id: 1, effect: 'giant', potion: null, ...p }],
  ['potion_started', { id: 2, effect: 'tiny', potion: null, ...p }],
  ['potion_started', { id: 3, effect: 'floaty', potion: null, ...p }],
  ['potion_started', { id: 4, effect: 'glow', potion: null, ...p }],
  ['potion_started', { id: 5, effect: 'speedy', potion: null, ...p }],
  ['potion_ended', { id: 1, effect: 'giant', cause: 'timeout', ...p }],
  ['potion_fizzled', { id: 1, ...p }],
  ['potion_burped', { id: 1, kind: 'burp', dir: 1, ...p }],
  ['potion_burped', { id: 1, kind: 'fire', dir: 1, ...p }],
  ['potion_burped', { id: 1, kind: 'bubble', dir: -1, ...p }],
  ['potion_burped', { id: 1, kind: 'sludge', dir: 1, ...p }],
  ['giant_stomped', { id: 1, heavy: false, ...p }],
  ['frost_sneezed', { id: 1, ...p }],
  ['balloon_deflated', { id: 1, ...p }],
  ['shattered', { id: 1, defId: 'd', into: 'i', pieces: [2], ...p }],
  ['toasted', { id: 1, defId: 'item_bread', ...p }],
  ['note_played', { id: 1, defId: 'item_inst_comb_kazoo', note: 4, ...p }],
  ['note_played', { id: 2, defId: 'item_inst_rubber_band_harp', note: 2, ...p }],
  ['note_played', { id: 3, defId: 'item_inst_can_bass', note: 0, ...p }],
  ['note_played', { id: 4, defId: 'item_inst_thimble_drum', note: 0, ...p }],
  ['toy_used', { id: 1, toy: 'slingshot', action: 'fire', ...p }],
  ['toy_used', { id: 1, toy: 'launcher', action: 'launch', ...p }],
  ['toy_used', { id: 1, toy: 'trampoline', action: 'boing', ...p }],
  ['toy_used', { id: 1, toy: 'basket', action: 'inflate', ...p }],
  ['toy_used', { id: 1, toy: 'basket', action: 'deflate', ...p }],
  ['toy_used', { id: 1, toy: 'disco', action: 'hang', ...p }],
  ['toy_used', { id: 1, toy: 'parachute', action: 'attach', ...p }],
  ['toy_used', { id: 1, toy: 'catapult', action: 'fling', ...p }],
  ['scope_viewed', { defId: 'd', tag: 'tag_sticky', ...p }],
];

describe('M8 sounds', () => {
  it('every crafting and potion event makes a sound', () => {
    const { sim, backend, sfx, clock } = setup();
    for (const [name, payload] of EMITS) {
      // Far enough apart that no rate limit drops one.
      clock.t += 5000;
      const tones = backend.played.length;
      sfx.log.length = 0;
      sim.events.emit(name, payload as never);
      expect(backend.played.length, name).toBeGreaterThan(tones);
      expect(sfx.log.length, name).toBeGreaterThan(0);
    }
  });

  it('picks the sound by kind, effect, and action', () => {
    const { sim, sfx, clock } = setup();
    const last = (name: keyof GameEvents, payload: unknown): string => {
      clock.t += 5000;
      sim.events.emit(name, payload as never);
      return sfx.log[sfx.log.length - 1]!;
    };
    expect(last('bench_failed', { kind: 'sticky', blobId: 1, ate: [], ...p })).toBe('slurp');
    expect(last('bench_failed', { kind: 'bouncy', blobId: 1, ate: [], ...p })).toBe('fail_boing');
    expect(last('bench_pulled', { empty: true, helpers: [], strong: false, ...p })).toBe('bench_clunk');
    expect(last('potion_burped', { id: 1, kind: 'fire', dir: 1, ...p })).toBe('flame');
    expect(last('potion_brewed', { id: 1, potion: null, color: 0, triple: true, ...p })).toBe('fanfare');
    expect(last('toy_used', { id: 1, toy: 'catapult', action: 'fling', ...p })).toBe('thwack');
    expect(startSound('giant')).toBe('grow');
    expect(startSound('balloon')).toBe('float_up');
    expect(startSound('stinky')).toBe('potion_whoosh');
  });

  it('hammers harder for a strong pull, and sparkles on a first craft', () => {
    const { sim, backend, clock } = setup();
    const count = (name: keyof GameEvents, payload: unknown): number => {
      clock.t += 5000;
      const before = backend.played.length;
      sim.events.emit(name, payload as never);
      return backend.played.length - before;
    };
    const weak = count('bench_pulled', { empty: false, helpers: [], strong: false, ...p });
    const strong = count('bench_pulled', { empty: false, helpers: [], strong: true, ...p });
    expect(strong).toBeGreaterThan(weak);
    const again = count('crafted', { recipe: 'r', id: 1, defId: 'd', first: false, ...p });
    const first = count('crafted', { recipe: 'r', id: 1, defId: 'd', first: true, ...p });
    expect(first).toBeGreaterThan(again);
  });

  it('the hammering lasts about a second and a bit', () => {
    const { sim, backend } = setup();
    sim.events.emit('bench_pulled', { empty: false, helpers: [], strong: true, ...p });
    const end = Math.max(...backend.played.map((t) => (t.delay ?? 0) + t.dur));
    expect(end).toBeGreaterThan(1);
    expect(end).toBeLessThan(1.5);
  });

  it('rattles and steams up to the pop, then goes quiet for the hit-stop before it (R09)', () => {
    const { sim, backend, sfx } = setup();
    sim.events.emit('bench_pulled', { empty: false, helpers: [], strong: false, ...p });
    expect(sfx.log).toContain('bench_rattle');
    expect(backend.played.some((t) => t.wave === 'noise' && (t.to ?? 0) > t.freq)).toBe(true);
    const end = Math.max(...backend.played.map((t) => (t.delay ?? 0) + t.dur));
    expect(end).toBeLessThan((BENCH_SHAKE - HIT_STOP) / SIM_HZ + 0.02);
    sfx.log.length = 0;
    sim.events.emit('crafted', { recipe: 'r', id: 1, defId: 'd', first: false, ...p });
    expect(sfx.log).toEqual(['craft_pop', 'craft_tada']);
  });

  it('floods of the same sound are limited', () => {
    const { sim, sfx } = setup();
    for (let i = 0; i < 10; i++) sim.events.emit('cauldron_stirred', { turns: i / 2, ...p });
    expect(sfx.log.filter((n) => n === 'slosh')).toHaveLength(1);
  });

  it('notes play on a pentatonic scale around C5, each instrument in its own voice', () => {
    expect(noteFreq(0)).toBeCloseTo(523.25, 1);
    expect(noteFreq(5)).toBeCloseTo(1046.5, 1);
    expect(noteFreq(-5)).toBeCloseTo(261.63, 1);
    expect(noteFreq(2)).toBeCloseTo(659.26, 1);
    for (let s = -6; s < 10; s++) expect(noteFreq(s + 1)).toBeGreaterThan(noteFreq(s));
    expect(timbreOf('item_inst_comb_kazoo')).toBe('kazoo');
    expect(timbreOf('item_inst_rubber_band_harp')).toBe('harp');
    expect(timbreOf('item_inst_can_bass')).toBe('bass');
    expect(timbreOf('item_inst_thimble_drum')).toBe('drum');
    expect(noteTones('item_inst_comb_kazoo', 0)[0]!.wave).toBe('square');
    expect(noteTones('item_inst_rubber_band_harp', 0)[0]!.wave).toBe('triangle');
    expect(noteTones('item_inst_can_bass', 0)[0]!.freq).toBeLessThan(200);
    expect(noteTones('item_inst_thimble_drum', 0).some((t) => t.wave === 'noise')).toBe(true);
    const { sim, backend } = setup();
    sim.events.emit('note_played', { id: 1, defId: 'item_comb_tooth', note: 4, poked: true, ...p });
    expect(backend.played[0]!.freq).toBeCloseTo(noteFreq(4), -1);
  });
});

describe('potion voices', () => {
  const dot = BUGS.get('bug_ladybug_dot').voice;
  const voiced = (tones: Tone[]): Tone[] => tones.filter((t) => t.wave !== 'noise' && t.wave !== 'sine');
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const line = (effects: string[]): Tone[] =>
    voiced(
      voiceLine(
        dot,
        'happy',
        new Rng('pv'),
        undefined,
        undefined,
        potionVoice(effects.map((effect) => ({ effect }))),
      ),
    );

  it('no effects leaves the voice alone', () => {
    expect(potionVoice(undefined)).toEqual({ pitch: 1, rate: 1, sung: false });
    expect(potionVoice([{ effect: 'glow' }])).toEqual({ pitch: 1, rate: 1, sung: false });
    expect(line([])).toEqual(voiced(voiceLine(dot, 'happy', new Rng('pv'))));
  });

  it('giant is an octave down and slower; tiny an octave up; squeaky higher still', () => {
    expect(potionVoice([{ effect: 'giant' }]).pitch).toBe(0.5);
    expect(potionVoice([{ effect: 'giant' }]).rate).toBeLessThan(1);
    expect(potionVoice([{ effect: 'tiny' }]).pitch).toBe(2);
    expect(potionVoice([{ effect: 'squeaky' }]).pitch).toBeCloseTo(2 ** 1.5);
    const plain = mean(line([]).map((t) => t.freq));
    expect(mean(line(['giant']).map((t) => t.freq))).toBeCloseTo(plain / 2);
    expect(mean(line(['tiny']).map((t) => t.freq))).toBeCloseTo(plain * 2);
    expect(mean(line(['giant']).map((t) => t.dur))).toBeGreaterThan(mean(line([]).map((t) => t.dur)));
  });

  it('slowmo is very slow and deep; speedy is fast', () => {
    const slow = potionVoice([{ effect: 'slowmo' }]);
    expect(slow.pitch).toBeLessThan(1);
    expect(slow.rate).toBeLessThan(0.5);
    expect(potionVoice([{ effect: 'speedy' }]).rate).toBeGreaterThan(1.5);
    const plainDur = mean(line([]).map((t) => t.dur));
    expect(mean(line(['slowmo']).map((t) => t.dur))).toBeGreaterThan(plainDur * 2);
    expect(mean(line(['speedy']).map((t) => t.dur))).toBeLessThan(plainDur);
  });

  it('effects stack and stay in a sane range', () => {
    const v = potionVoice([{ effect: 'tiny' }, { effect: 'squeaky' }, { effect: 'speedy' }]);
    expect(v.pitch).toBeLessThanOrEqual(4);
    expect(v.rate).toBeCloseTo(1.8);
    expect(potionVoice([{ effect: 'giant' }, { effect: 'slowmo' }]).pitch).toBeGreaterThanOrEqual(0.25);
  });

  it('opera sings: long held syllables on scale notes with strong vibrato', () => {
    expect(potionVoice([{ effect: 'opera' }]).sung).toBe(true);
    const sung = line(['opera']);
    const plain = line([]);
    expect(mean(sung.map((t) => t.dur))).toBeGreaterThan(mean(plain.map((t) => t.dur)) * 1.8);
    for (const t of sung) {
      expect(t.to).toBe(t.freq);
      expect(onScale(t.freq)).toBeCloseTo(t.freq, 6);
      expect(t.vibrato!.depth).toBeGreaterThan(t.freq * 0.03);
    }
    expect(onScale(261.63)).toBeCloseTo(261.63);
    expect(onScale(270)).toBeCloseTo(261.63, 1);
    expect(onScale(285)).toBeCloseTo(293.66, 1);
  });

  it('BugVoices asks for the bug’s effects when it speaks', () => {
    const sim = Sim.empty();
    const backend = new NullAudioBackend();
    const voices = new BugVoices(backend, sim.content.bugs, () => 0);
    voices.attach(
      sim.events,
      () => undefined,
      (id) => (id === 1 ? [{ effect: 'giant' }] : undefined),
    );
    voices.say(1, 'bug_ladybug_dot', 'happy');
    const giant = voiced(backend.played.splice(0));
    voices.say(2, 'bug_ladybug_dot', 'happy');
    const plain = voiced(backend.played.splice(0));
    expect(Math.max(...giant.map((t) => t.freq))).toBeLessThan(Math.min(...plain.map((t) => t.freq)));
  });
});
