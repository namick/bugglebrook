import { describe, expect, it } from 'vitest';
import {
  PartCache,
  antennaeKey,
  faceKey,
  fxKey,
  legsKey,
  paintedKey,
  q,
  wingsKey,
} from '../../src/renderer/src/render/bugCache';
import type { RedrawStats } from '../../src/renderer/src/render/bugCache';
import { bugFace } from '../../src/renderer/src/render/bugFace';
import { bugPose } from '../../src/renderer/src/render/bugPose';
import type { BugMode } from '../../src/game/core/entities';
import type { BugFrame } from '../../src/renderer/src/render/draw/bug';

const NEEDS = { need_hunger: 90, need_fun: 90, need_energy: 90, need_social: 80, need_clean: 90 };
const STILL = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];

function frame(mode: BugMode, time: number, extra: Partial<BugFrame> = {}): BugFrame {
  const vx = mode === 'st_wander' ? 1 : 0;
  return {
    pose: bugPose({ mode, vx, vy: 0, time, phase: 1.3, walkSpeed: 1 }),
    face: bugFace({ art: 'ladybug', mode, needs: NEEDS, time, likesFlinging: true }),
    facing: 1,
    time,
    dt: 1 / 60,
    look: { x: 0.5, y: 0.1 },
    vx,
    vy: 0,
    angle: 0,
    squashX: 1,
    squashY: 1,
    stretchAngle: 0,
    stretch: 1,
    spin: 0,
    stars: 0,
    mode,
    ...extra,
  };
}

const frames = (mode: BugMode, seconds: number, extra: Partial<BugFrame> = {}): BugFrame[] =>
  Array.from({ length: seconds * 60 }, (_, i) => frame(mode, 10 + i / 60, extra));

const distinct = (keys: (string | null)[]): number => new Set(keys).size;

describe('bug redraw keys (R36)', () => {
  it('rounds to steps', () => {
    expect(q(1.04, 0.25)).toBe(4);
    expect(q(1.2, 0.25)).toBe(5);
  });

  it('keeps an idle bug’s legs as they are while it breathes', () => {
    const idle = frames('st_idle', 5);
    // Breathing changes the pose's scale every frame, but not the legs' drawing.
    expect(distinct(idle.map((f) => `${f.pose.sx},${f.pose.sy}`))).toBeGreaterThan(100);
    expect(distinct(idle.map((f) => legsKey(f, 'normal')))).toBe(1);
    expect(distinct(idle.map((f) => wingsKey(f, 'normal')))).toBe(1);
    expect(distinct(idle.map((f) => fxKey(f)))).toBe(1);
  });

  it('redraws walking legs every frame', () => {
    const walk = frames('st_wander', 2);
    expect(distinct(walk.map((f) => legsKey(f, 'normal')))).toBeGreaterThan(walk.length * 0.9);
  });

  it('redraws an idle face only for blinks and glances', () => {
    const idle = frames('st_idle', 10);
    const keys = idle.map((f) => faceKey(f, 'normal', 'ladybug', 40, STILL));
    let changes = 0;
    for (let i = 1; i < keys.length; i++) if (keys[i] !== keys[i - 1]) changes++;
    // A blink is a handful of frames every few seconds.
    expect(changes).toBeGreaterThan(0);
    expect(changes).toBeLessThan(keys.length * 0.1);
    // The pupils following the hand do redraw it.
    const a = faceKey(frame('st_idle', 1), 'normal', 'ladybug', 40, STILL);
    const b = faceKey(frame('st_idle', 1, { look: { x: -0.5, y: 0.1 } }), 'normal', 'ladybug', 40, STILL);
    expect(a).not.toBe(b);
  });

  it('redraws faces that animate on the clock every frame', () => {
    const f1 = frame('st_idle', 1);
    const spiral = (t: number): string =>
      faceKey({ ...f1, time: t, face: { ...f1.face, eyes: 'spiral' } }, 'normal', 'ladybug', 40, STILL);
    expect(spiral(1)).not.toBe(spiral(1 + 1 / 60));
    const chew = (t: number): string =>
      faceKey({ ...f1, time: t, face: { ...f1.face, mouth: 'chew' } }, 'normal', 'ladybug', 40, STILL);
    expect(chew(1)).not.toBe(chew(1 + 1 / 60));
  });

  it('lets feelers sway slowly but follow their springs at once', () => {
    const idle = frames('st_idle', 6);
    const keys = idle.map((f) => antennaeKey(f, 'normal', 'ladybug', 40, STILL));
    expect(distinct(keys)).toBeLessThan(idle.length / 3);
    expect(distinct(keys)).toBeGreaterThan(3);
    const f = frame('st_idle', 1);
    expect(antennaeKey(f, 'normal', 'ladybug', 40, STILL)).not.toBe(
      antennaeKey(f, 'normal', 'ladybug', 40, [
        { x: 3, y: 0 },
        { x: 0, y: 0 },
      ]),
    );
  });

  it('changes every key with the body form', () => {
    const f = frame('st_idle', 1);
    expect(legsKey(f, 'normal')).not.toBe(legsKey(f, 'curled'));
    expect(faceKey(f, 'normal', 'snail', 40, STILL)).not.toBe(faceKey(f, 'in_shell', 'snail', 40, STILL));
    expect(wingsKey(f, 'flying')).not.toBe(wingsKey({ ...f, time: 2 }, 'flying'));
  });

  it('caches a calm painted bug at 15 Hz and a busy one not at all', () => {
    const idle = frames('st_idle', 4);
    const keys = idle.map((f) => paintedKey(f, STILL));
    expect(keys.every((k) => k !== null)).toBe(true);
    expect(distinct(keys)).toBeLessThan(idle.length / 3);
    expect(frames('st_wander', 1).every((f) => paintedKey(f, STILL) === null)).toBe(true);
    expect(paintedKey(frame('st_held', 1), STILL)).toBeNull();
    expect(paintedKey(frame('st_idle', 1, { pending: 'stuck' }), STILL)).toBeNull();
    expect(paintedKey(frame('st_idle', 1, { stars: 3 }), STILL)).toBeNull();
  });

  it('counts skips: an idle bug skips most of its redraws', () => {
    const stats: RedrawStats = { drawn: 0, skipped: 0 };
    const parts = {
      legs: new PartCache(stats),
      wings: new PartCache(stats),
      antennae: new PartCache(stats),
      face: new PartCache(stats),
      fx: new PartCache(stats),
    };
    for (const f of frames('st_idle', 10)) {
      parts.legs.stale(legsKey(f, 'normal'));
      parts.wings.stale(wingsKey(f, 'normal'));
      parts.antennae.stale(antennaeKey(f, 'normal', 'ladybug', 40, STILL));
      parts.face.stale(faceKey(f, 'normal', 'ladybug', 40, STILL));
      parts.fx.stale(fxKey(f));
    }
    expect(stats.skipped / (stats.drawn + stats.skipped)).toBeGreaterThan(0.85);
    const c = new PartCache();
    expect(c.stale('a')).toBe(true);
    expect(c.stale('a')).toBe(false);
    expect(c.stale(null)).toBe(true);
    expect(c.stale(null)).toBe(true);
    c.reset();
    expect(c.stale('a')).toBe(true);
  });
});
