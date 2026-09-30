import { describe, expect, it } from 'vitest';
import { GROUND_Y, Rng, Sim } from '../../src/game';
import { BUGS } from '../../src/game/data/bugs';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { BugVoices, voiceLine } from '../../src/renderer/src/audio/voices';

describe('Sfx', () => {
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

  it('plays grab and drop sounds', () => {
    const { sim, backend, sfx } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    const v = sim.view(pebble.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sfx.log).toEqual(['grab', 'drop']);
    const drop = backend.played[backend.played.length - 1]!;
    expect(drop.to!).toBeLessThan(drop.freq);
  });

  it('whooshes on a fling, boops on a poke, and boings on a spring', () => {
    const { sim, backend, sfx } = setup();
    const pebble = sim.spawn('item', 'item_pebble', 7, GROUND_Y - 0.21);
    sim.send({ type: 'grab', x: 7, y: GROUND_Y - 0.21 });
    sim.send({ type: 'release', vx: 12, vy: -8 });
    sim.step();
    expect(sfx.log).toContain('fling');
    expect(backend.played.some((t) => t.wave === 'noise')).toBe(true);
    sim.send({ type: 'poke', x: sim.view(pebble.id)!.x, y: sim.view(pebble.id)!.y });
    sim.step();
    expect(sfx.log).toContain('poke');
    sim.events.emit('spring_bounced', { id: 1, targetId: 2, x: 0, y: 0 });
    expect(sfx.log).toContain('spring');
  });

  it('uses a different sound for picking up a bug', () => {
    const { sim, sfx } = setup();
    const bug = sim.spawn('bug', 'bug_ladybug_dot', 7, GROUND_Y - 0.51);
    const v = sim.view(bug.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sfx.log).toEqual(['grab_bug']);
  });

  it('tweets for as long as a bug is dizzy', () => {
    const { sim, backend } = setup();
    sim.events.emit('bug_dizzy', { id: 1, defId: 'bug_ladybug_dot', speed: 20, durationTicks: 360 });
    const last = Math.max(...backend.played.map((t) => (t.delay ?? 0) + t.dur));
    expect(last).toBeGreaterThan(4);
    expect(last).toBeLessThan(7);
  });

  it('throttles bursts of bonks', () => {
    const { sim, sfx, clock } = setup();
    for (let i = 0; i < 5; i++)
      sim.events.emit('bonked', { id: 1, kind: 'item', defId: 'item_pebble', speed: 10, x: 0, y: 0 });
    expect(sfx.log.filter((n) => n === 'bonk')).toHaveLength(1);
    clock.t = 1000;
    sim.events.emit('bonked', { id: 1, kind: 'item', defId: 'item_pebble', speed: 10, x: 0, y: 0 });
    expect(sfx.log.filter((n) => n === 'bonk')).toHaveLength(2);
  });

  it('stops listening after detach and stays silent when muted', () => {
    const { sim, backend, sfx } = setup();
    sfx.detach();
    sim.events.emit('bug_poked', { id: 1, defId: 'bug_ladybug_dot', x: 0, y: 0 });
    expect(sfx.log).toEqual([]);
    backend.setMuted(true);
    sfx.play('ui_pop');
    expect(backend.played).toEqual([]);
  });
});

describe('bug voices', () => {
  const dot = BUGS.get('bug_ladybug_dot').voice;
  const glorp = BUGS.get('bug_snail_glorp').voice;

  it('makes 1 to 6 formant syllables in the bug range', () => {
    for (const emotion of [
      'happy',
      'question',
      'grumpy',
      'scared',
      'dizzy',
      'sleepy',
      'whee',
      'ooh',
    ] as const) {
      const line = voiceLine(dot, emotion, new Rng(emotion)).filter((t) => t.wave !== 'noise');
      expect(line.length).toBeGreaterThanOrEqual(1);
      expect(line.length).toBeLessThanOrEqual(6);
      for (const t of line) {
        expect(t.wave).toBe('square');
        expect(t.formants).toHaveLength(2);
        expect(t.freq).toBeGreaterThanOrEqual(dot.low);
        expect(t.freq).toBeLessThanOrEqual(dot.high * 1.11);
        expect(t.bus).toBe('voice');
      }
    }
  });

  it('rises when happy and falls when sleepy', () => {
    const happy = voiceLine(dot, 'happy', new Rng('h')).filter((t) => t.wave !== 'noise');
    expect(happy[happy.length - 1]!.freq).toBeGreaterThan(happy[0]!.freq);
    const sleepy = voiceLine(dot, 'sleepy', new Rng('s')).filter((t) => t.wave !== 'noise');
    expect(sleepy[sleepy.length - 1]!.freq).toBeLessThan(sleepy[0]!.freq);
  });

  it('gives Glorp slow, low, wobbly syllables', () => {
    const line = voiceLine(glorp, 'ooh', new Rng('g')).filter((t) => t.wave !== 'noise');
    expect(line[0]!.wave).toBe('sine');
    expect(line[0]!.dur).toBeGreaterThan(0.4);
    expect(line[0]!.vibrato).toEqual({ rate: 3, depth: 15 });
    expect(line[0]!.freq).toBeLessThan(250);
  });

  it('speaks on grabs, flings, and dizzy spells, and never more than three at once', () => {
    const sim = Sim.empty();
    const backend = new NullAudioBackend();
    const clock = { t: 0 };
    const voices = new BugVoices(backend, BUGS, () => clock.t);
    voices.attach(sim.events);
    const bug = sim.spawn('bug', 'bug_pillbug_rollo', 7, GROUND_Y - 0.47);
    sim.send({ type: 'grab', x: 7, y: GROUND_Y - 0.35 });
    sim.step();
    expect(voices.log[0]).toEqual({ defId: 'bug_pillbug_rollo', emotion: 'scared' });
    sim.send({ type: 'release', vx: 10, vy: -5 });
    sim.step();
    expect(voices.log[1]!.emotion).toBe('scared');
    sim.events.emit('bug_dizzy', { id: bug.id, defId: 'bug_pillbug_rollo', speed: 12, durationTicks: 200 });
    expect(voices.log[2]!.emotion).toBe('dizzy');
    clock.t = 10_000;
    expect(voices.say(10, 'bug_ladybug_dot', 'happy')).toBe(true);
    expect(voices.say(11, 'bug_ladybug_dot', 'happy')).toBe(true);
    expect(voices.say(12, 'bug_ladybug_dot', 'happy')).toBe(true);
    expect(voices.say(13, 'bug_ladybug_dot', 'happy')).toBe(false);
    expect(voices.say(10, 'bug_ladybug_dot', 'happy')).toBe(false);
    voices.detach();
  });
});
