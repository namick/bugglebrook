import { describe, expect, it } from 'vitest';
import {
  GHOST,
  GUIDE,
  GhostScheduler,
  demoDoneBy,
  feedDemo,
  flingDemo,
  ghostAt,
  scriptLength,
  shakeDemo,
  tickleDemo,
} from '../../src/renderer/src/app/ghost';
import type { DemoKind, GhostScript } from '../../src/renderer/src/app/ghost';

// Playtest F3: the guided start. In a new world the ghost hand demos the
// core verbs nobody can see (feed, fling, tickle, shake) one after another
// whenever the player pauses, and a skip button ends it.

const stageAny = (allowed: DemoKind[]): GhostScript | null => {
  const k = allowed[0];
  if (!k) return null;
  const p = { x: 900, y: 600 };
  switch (k) {
    case 'feed':
      return feedDemo(p, { x: 1000, y: 620 }, 'item_berry_red');
    case 'fling':
      return flingDemo(p, 'item_pebble');
    case 'tickle':
      return tickleDemo(p);
    case 'shake':
      return shakeDemo(p, 'item_sponge');
    default:
      return null;
  }
};

function run(s: GhostScheduler, seconds: number, onFrame?: (k: DemoKind | null) => void): void {
  for (let t = 0; t < seconds; t += 0.1) {
    const f = s.update(0.1, false, stageAny);
    onFrame?.(f?.kind ?? null);
  }
}

describe('the guided start (F3)', () => {
  it('demos the core verbs in order, soon after the player pauses, each once', () => {
    const s = new GhostScheduler();
    s.startGuide();
    expect(s.guide).toEqual([...GUIDE.order]);
    const seen: DemoKind[] = [];
    run(s, 60, (k) => {
      if (k && seen[seen.length - 1] !== k) seen.push(k);
    });
    expect(seen).toEqual(['feed', 'fling', 'tickle', 'shake']);
    expect(s.guide).toBeNull();
    expect(s.guiding).toBe(false);
    // Afterwards only the ordinary demos remain, never the guide's again.
    expect(s.allowed().some((k) => GUIDE.order.includes(k))).toBe(false);
  });

  it('waits for a short pause, and any input stops a demo', () => {
    const s = new GhostScheduler();
    s.startGuide();
    run(s, GUIDE.idleSeconds - 0.5);
    expect(s.active).toBeNull();
    run(s, 1);
    expect(s.active?.script.kind).toBe('feed');
    s.input();
    expect(s.active).toBeNull();
    expect(GUIDE.idleSeconds).toBeLessThan(GHOST.idleSeconds);
  });

  it('skips what the player already did, and the skip button ends it', () => {
    const s = new GhostScheduler();
    s.markDone('feed');
    s.startGuide();
    expect(s.guide).toEqual(['fling', 'tickle', 'shake']);
    s.markDone(demoDoneBy('bug_tickled', {})!);
    expect(s.guide).toEqual(['fling', 'shake']);
    run(s, GUIDE.idleSeconds + 0.5);
    expect(s.active?.script.kind).toBe('fling');
    s.skipGuide();
    expect(s.active).toBeNull();
    expect(s.guiding).toBe(false);
  });

  it('knows the gestures by their events', () => {
    expect(demoDoneBy('bug_fed', { byPlayer: true })).toBe('feed');
    expect(demoDoneBy('bug_fed', { byPlayer: false })).toBeNull();
    expect(demoDoneBy('item_dropped', { flung: true })).toBe('fling');
    expect(demoDoneBy('item_dropped', { flung: false })).toBeNull();
    expect(demoDoneBy('bug_tickled', {})).toBe('tickle');
    expect(demoDoneBy('item_shaken', {})).toBe('shake');
  });

  it('scripts move forward in time and act out each gesture', () => {
    for (const k of GUIDE.order) {
      const s = stageAny([k])!;
      const times = s.keys.map((key) => key.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(scriptLength(s)).toBeGreaterThan(2);
      expect(s.keys.some((key) => key.pose === 'grab')).toBe(true);
    }
    // The shake swings back and forth at least three times, far enough to count (80 px strokes).
    const shake = shakeDemo({ x: 900, y: 600 }, 'item_sponge');
    const xs = shake.keys.filter((key) => key.carry).map((key) => key.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(120);
    // The fling lets go mid-swoop, moving fast.
    const fling = flingDemo({ x: 900, y: 600 }, 'item_pebble');
    const a = ghostAt(fling, 1.8)!;
    const b = ghostAt(fling, 1.95)!;
    expect(Math.hypot(b.x - a.x, b.y - a.y) / 0.15).toBeGreaterThan(800);
    // The tickle holds still on the bug.
    const tickle = tickleDemo({ x: 900, y: 600 });
    const held = tickle.keys.filter((key) => key.pose === 'grab');
    expect(held.every((key) => Math.abs(key.x - 900) <= 4)).toBe(true);
  });
});
