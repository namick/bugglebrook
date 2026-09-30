import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';

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

  it('blips on grab and drop', () => {
    const { sim, backend, sfx } = setup();
    const pebble = sim.spawn('item', 'pebble', 5, GROUND_Y - 0.29);
    const v = sim.view(pebble.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    sim.send({ type: 'release' });
    sim.step();
    expect(sfx.log).toEqual(['grab', 'drop']);
    expect(backend.played.length).toBe(2);
    // Grab rises in pitch, drop falls.
    expect(backend.played[0]!.to!).toBeGreaterThan(backend.played[0]!.freq);
    expect(backend.played[1]!.to!).toBeLessThan(backend.played[1]!.freq);
  });

  it('uses a different voice for picking up a bug', () => {
    const { sim, sfx } = setup();
    const bug = sim.spawn('bug', 'bip', 5, GROUND_Y - 0.43);
    const v = sim.view(bug.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sfx.log).toEqual(['grab_bug']);
  });

  it('throttles bursts of bonks', () => {
    const { sim, sfx, clock } = setup();
    for (let i = 0; i < 5; i++)
      sim.events.emit('bonked', { id: 1, kind: 'item', defId: 'pebble', speed: 10, x: 0, y: 0 });
    expect(sfx.log.filter((n) => n === 'bonk')).toHaveLength(1);
    clock.t = 1000;
    sim.events.emit('bonked', { id: 1, kind: 'item', defId: 'pebble', speed: 10, x: 0, y: 0 });
    expect(sfx.log.filter((n) => n === 'bonk')).toHaveLength(2);
  });

  it('stops listening after detach and stays silent when muted', () => {
    const { sim, backend, sfx } = setup();
    sfx.detach();
    sim.events.emit('bug_dizzy', { id: 1, defId: 'bip' });
    expect(sfx.log).toEqual([]);
    backend.setMuted(true);
    sfx.play('ui_pop');
    expect(backend.played).toEqual([]);
  });
});
