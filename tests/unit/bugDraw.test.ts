import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { BugMode } from '../../src/game/core/entities';
import { BUGS } from '../../src/game/data';
import type { BugDef } from '../../src/game/data/types';
import type { BodyForm, EyeShape, MouthShape } from '../../src/renderer/src/render/bugFace';
import { bugPose } from '../../src/renderer/src/render/bugPose';
import type { BugFrame } from '../../src/renderer/src/render/draw/bug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';

// Pins every bug's procedural drawing, call by call, over a sweep of poses, faces, and
// forms. The art pipeline's rig refactor moved the joint math out of the painters; this
// proves it drew the same thing before and after. Regenerate with UPDATE_GOLDEN=1 only
// when a drawing change is meant.

const GOLDEN = join(import.meta.dirname, 'golden', 'bugDraw.json');

interface Scene {
  name: string;
  mode: BugMode;
  vx?: number;
  vy?: number;
  form?: BodyForm;
  eyes?: EyeShape;
  mouth?: MouthShape;
  extra?: Partial<BugFrame>;
}

const SCENES: Scene[] = [
  { name: 'idle', mode: 'st_idle' },
  { name: 'walk', mode: 'st_wander', vx: 1.2 },
  { name: 'run', mode: 'st_seek', vx: 3 },
  { name: 'held', mode: 'st_held', eyes: 'wide', mouth: 'whee' },
  { name: 'flung', mode: 'st_airborne', vx: 4, vy: 2, eyes: 'happy', mouth: 'whee', extra: { chute: true } },
  { name: 'fly', mode: 'st_airborne', vx: 2, vy: -1, form: 'flying', mouth: 'grin' },
  { name: 'hop', mode: 'st_airborne', vx: 2, vy: -3, extra: { hopping: true } },
  { name: 'dizzy', mode: 'st_dizzy', eyes: 'spiral', mouth: 'wobble', extra: { stars: 3 } },
  { name: 'sleep', mode: 'st_sleep', eyes: 'sleepy', mouth: 'o' },
  { name: 'curled', mode: 'st_rolled', form: 'curled', eyes: 'squint' },
  { name: 'shell', mode: 'st_idle', form: 'in_shell', eyes: 'wide' },
  { name: 'eat', mode: 'st_eat', eyes: 'heart', mouth: 'chew' },
  { name: 'yuck', mode: 'st_react', eyes: 'x', mouth: 'tongue', extra: {} },
  { name: 'angry', mode: 'st_react', eyes: 'angry', mouth: 'teeth' },
  { name: 'worried', mode: 'st_react', eyes: 'worried', mouth: 'frown' },
  { name: 'aah', mode: 'st_idle', eyes: 'open', mouth: 'aah' },
  { name: 'lick', mode: 'st_idle', eyes: 'happy', mouth: 'lick' },
  { name: 'puff', mode: 'st_idle', eyes: 'squint', mouth: 'puff' },
  { name: 'flat', mode: 'st_idle', eyes: 'open', mouth: 'flat' },
  { name: 'carry', mode: 'st_wander', vx: 1, extra: { carrying: true } },
  { name: 'skate', mode: 'st_wander', vx: 1, extra: { skate: true } },
  { name: 'karate', mode: 'st_react', extra: { karate: { k: 1, t: 0.3, chop: true } } },
  { name: 'overhead', mode: 'st_wander', vx: 1, extra: { carrying: true, overhead: true } },
  { name: 'rolling', mode: 'st_wander', vx: -1, extra: { carrying: true, rolling: true } },
  { name: 'stuck', mode: 'st_idle', extra: { pending: 'stuck' } },
  { name: 'aloof', mode: 'st_idle', extra: { pending: 'aloof' } },
  { name: 'disguised', mode: 'st_idle', extra: { pending: 'disguised' } },
  { name: 'peek', mode: 'st_idle', extra: { pending: 'disguised', peeking: true } },
  { name: 'cocoon', mode: 'st_sleep', eyes: 'sleepy', extra: { morph: 'cocoon' } },
  { name: 'butterfly', mode: 'st_wander', vx: 1, extra: { morph: 'butterfly' } },
  { name: 'painted', mode: 'st_idle', extra: { paint: ['paint_blue', 'paint_red'] } },
  { name: 'rim', mode: 'st_idle', extra: { rim: 0.8, facing: -1 } },
  { name: 'tint', mode: 'st_react', eyes: 'x', mouth: 'puff' },
];

function frameAt(scene: Scene, t: number, dt: number): BugFrame {
  const pose = bugPose({
    mode: scene.mode,
    vx: scene.vx ?? 0,
    vy: scene.vy ?? 0,
    time: t,
    phase: 1.3,
    walkSpeed: 1,
  });
  return {
    pose,
    face: {
      eyes: scene.eyes ?? 'open',
      mouth: scene.mouth ?? 'smile',
      form: scene.form ?? 'normal',
      blush: scene.name === 'lick',
      tint: scene.name === 'tint' ? 'green' : scene.name === 'angry' ? 'red' : null,
      steam: scene.name === 'angry',
    },
    facing: 1,
    time: t,
    dt,
    look: { x: Math.sin(t * 1.7) * 0.6, y: 0.2 },
    vx: (scene.vx ?? 0) * Math.cos(t),
    vy: scene.vy ?? 0,
    angle: t * 0.7,
    squashX: 1 + Math.sin(t * 5) * 0.05,
    squashY: 1 - Math.sin(t * 5) * 0.05,
    stretchAngle: 0.3,
    stretch: scene.mode === 'st_airborne' ? 1.15 : 1,
    spin: scene.mode === 'st_airborne' ? 0.4 : 0,
    stars: 0,
    mode: scene.mode,
    ...scene.extra,
  };
}

const round = (v: number): number => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);

/** A JSON copy with every number rounded, so float noise in reordered math doesn't count. */
function rounded(v: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof v === 'number') return round(v);
  if (Array.isArray(v)) return v.map((x) => rounded(x, seen));
  if (v && typeof v === 'object') {
    if (seen.has(v)) return '[cycle]';
    seen.add(v);
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, round);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'function' || k.startsWith('_') || k === 'uid') continue;
      out[k] = rounded(x, seen);
    }
    return out;
  }
  return v;
}

/** Every drawing call and transform in the sprite's tree. */
function snapshot(node: Container, out: unknown[] = []): unknown[] {
  out.push([
    node.label,
    round(node.x),
    round(node.y),
    round(node.scale.x),
    round(node.scale.y),
    round(node.rotation),
    round(node.pivot.x),
    round(node.pivot.y),
    round(node.alpha),
    node.visible,
    node.tint,
  ]);
  if (node instanceof Graphics) {
    out.push(
      node.context.instructions.map((ins) => {
        const data = ins.data as unknown as Record<string, unknown>;
        const path = data.path as { instructions?: unknown } | undefined;
        return [ins.action, rounded(path?.instructions ?? null), rounded(data.style ?? null)];
      }),
    );
  }
  for (const c of node.children) snapshot(c as Container, out);
  return out;
}

function drawHash(def: BugDef): string {
  const h = createHash('sha256');
  const sprite = new BugSprite(def);
  for (const scene of SCENES) {
    for (let i = 0; i < 6; i++) {
      const t = 0.37 + i * 0.29;
      sprite.update(frameAt(scene, t, 1 / 60));
      h.update(scene.name);
      h.update(JSON.stringify(snapshot(sprite)));
    }
  }
  return h.digest('hex').slice(0, 24);
}

describe('procedural bug drawing', () => {
  it('draws the same calls as the golden record, for every bug', () => {
    const got: Record<string, string> = {};
    for (const def of BUGS.all) got[def.id] = drawHash(def);
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n');
    const want = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
    expect(got).toEqual(want);
  });
});
