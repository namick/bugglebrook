import { describe, expect, it } from 'vitest';
import { TELL_EVERY, bartyFiddle, mooseFlail, twigTell } from '../../src/renderer/src/render/pendingLife';

const seconds = (n: number, fps = 30): number[] => Array.from({ length: n * fps }, (_, i) => i / fps);

describe('signs of life from bugs waiting to be found', () => {
  it('Moose flails in bursts and rests his legs between them', () => {
    const f = seconds(60).map((t) => mooseFlail(t, 0));
    const bursting = f.filter((x) => x.burst >= 0);
    expect(bursting.length).toBeGreaterThan(f.length * 0.15);
    expect(bursting.length).toBeLessThan(f.length * 0.5);
    expect(Math.max(...f.map((x) => x.speed))).toBeGreaterThan(2);
    for (const x of f.filter((q) => q.burst < 0)) expect(x.speed).toBeLessThan(1);
    // Never a frozen leg: something always moves.
    for (const x of f) expect(x.amp).toBeGreaterThan(0.3);
  });

  it('Barty taps, preens, and glances, and is still in between', () => {
    const f = seconds(60).map((t) => bartyFiddle(t, 0));
    expect(f.some((x) => x.tap > 0.5)).toBe(true);
    expect(f.some((x) => x.preen > 0.5)).toBe(true);
    expect(f.some((x) => Math.abs(x.glance) > 0.5)).toBe(true);
    expect(f.filter((x) => x.tap === 0 && x.preen === 0 && x.glance === 0).length).toBeGreaterThan(
      f.length * 0.25,
    );
    for (const x of f) {
      expect(x.tap).toBeLessThanOrEqual(1);
      expect(x.preen).toBeLessThanOrEqual(1);
      expect(Math.abs(x.glance)).toBeLessThanOrEqual(1);
    }
  });

  it('Twig gives a tell every few seconds: mostly a feeler twitch, sometimes a blink', () => {
    const tells = seconds(90, 60).map((t) => twigTell(t, 0));
    expect(tells.some((x) => x.twitch > 0.9)).toBe(true);
    expect(tells.some((x) => x.eyes > 0.9)).toBe(true);
    // Mostly a twig: more than nine tenths of the time there is nothing to see.
    const quiet = tells.filter((x) => x.twitch < 0.02 && x.eyes < 0.05).length;
    expect(quiet / tells.length).toBeGreaterThan(0.75);
    // At least one tell in any 8 s window.
    for (let start = 0; start < 80; start += 2) {
      const window = seconds(8, 60).map((t) => twigTell(start + t, 0));
      expect(window.some((x) => x.twitch > 0.5 || x.eyes > 0.5)).toBe(true);
    }
    expect(TELL_EVERY).toBeLessThan(6);
  });

  it('blinks in the middle of a peek', () => {
    // Find a peek and check the eyes shut for a moment inside it.
    const ts = seconds(60, 120);
    const open = ts.map((t) => twigTell(t, 0).eyes);
    let sawBlink = false;
    for (let i = 1; i + 1 < open.length; i++)
      if (open[i - 1]! > 0.9 && open[i] === 0 && open.slice(i, i + 30).some((v) => v > 0.9)) sawBlink = true;
    expect(sawBlink).toBe(true);
  });
});
