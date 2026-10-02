import type { BugMode } from '../../../game/core/entities';
import type { BugArt, BugDef } from '../../../game/data/types';
import type { BodyForm, BugFace, EyeShape, MouthShape } from '../render/bugFace';
import { bugPose } from '../render/bugPose';
import type { BugFrame } from '../render/draw/bug';

/**
 * Named states that drive a bug through everything it can do, with real
 * `BugFrame` inputs: the Art Lab shows them, the template generator measures
 * the canvas over them, and tests use them. Pure.
 */
export interface PoseState {
  id: string;
  label: string;
  mode: BugMode;
  vx?: number;
  vy?: number;
  face: Partial<BugFace>;
  extra?: Partial<BugFrame>;
  /** Only for these arts. */
  arts?: readonly BugArt[];
}

const ALL: readonly PoseState[] = [
  { id: 'idle', label: 'idle', mode: 'st_idle', face: {} },
  { id: 'walk', label: 'walk', mode: 'st_wander', vx: 1, face: {} },
  { id: 'run', label: 'run', mode: 'st_seek', vx: 3, face: { mouth: 'grin' } },
  {
    id: 'hop',
    label: 'hop',
    mode: 'st_airborne',
    vx: 2,
    vy: -3,
    face: { eyes: 'happy', mouth: 'whee' },
    extra: { hopping: true },
  },
  {
    id: 'fly',
    label: 'fly',
    mode: 'st_airborne',
    vx: 2,
    vy: -1,
    face: { eyes: 'happy', mouth: 'grin', form: 'flying' },
    arts: ['ladybug', 'firefly'],
  },
  { id: 'held', label: 'held', mode: 'st_held', face: { eyes: 'wide', mouth: 'o' } },
  {
    id: 'thrown',
    label: 'thrown',
    mode: 'st_airborne',
    vx: 4,
    vy: 2,
    face: { eyes: 'happy', mouth: 'whee' },
    extra: { chute: true },
  },
  {
    id: 'dizzy',
    label: 'dizzy',
    mode: 'st_dizzy',
    face: { eyes: 'spiral', mouth: 'wobble' },
    extra: { stars: 3 },
  },
  { id: 'asleep', label: 'asleep', mode: 'st_sleep', face: { eyes: 'sleepy', mouth: 'o' } },
  { id: 'eat', label: 'eat', mode: 'st_eat', face: { eyes: 'heart', mouth: 'chew', blush: true } },
  { id: 'carry', label: 'carry', mode: 'st_wander', vx: 1, face: {}, extra: { carrying: true } },
  {
    id: 'curled',
    label: 'ball',
    mode: 'st_rolled',
    face: { eyes: 'squint', mouth: 'o', form: 'curled' },
    arts: ['pillbug', 'dungbeetle'],
  },
  {
    id: 'in_shell',
    label: 'in shell',
    mode: 'st_idle',
    face: { eyes: 'wide', form: 'in_shell' },
    arts: ['snail'],
  },
  {
    id: 'karate',
    label: 'karate',
    mode: 'st_react',
    face: { eyes: 'angry', mouth: 'teeth' },
    extra: { karate: { k: 1, t: 0.3, chop: true } },
    arts: ['mantis'],
  },
  {
    id: 'stuck',
    label: 'on his back',
    mode: 'st_idle',
    face: { eyes: 'worried', mouth: 'wobble' },
    extra: { pending: 'stuck' },
    arts: ['stagbeetle'],
  },
  {
    id: 'overhead',
    label: 'lift',
    mode: 'st_wander',
    vx: 1,
    face: {},
    extra: { carrying: true, overhead: true },
    arts: ['stagbeetle'],
  },
  {
    id: 'rolling',
    label: 'rolling',
    mode: 'st_wander',
    vx: -1,
    face: {},
    extra: { carrying: true, rolling: true },
    arts: ['dungbeetle'],
  },
  {
    id: 'aloof',
    label: 'aloof',
    mode: 'st_idle',
    face: { mouth: 'flat' },
    extra: { pending: 'aloof' },
    arts: ['dungbeetle'],
  },
  {
    id: 'disguised',
    label: 'disguised',
    mode: 'st_idle',
    face: {},
    extra: { pending: 'disguised' },
    arts: ['stickinsect'],
  },
  {
    id: 'peek',
    label: 'peeking',
    mode: 'st_idle',
    face: {},
    extra: { pending: 'disguised', peeking: true },
    arts: ['stickinsect'],
  },
  {
    id: 'cocoon',
    label: 'cocoon',
    mode: 'st_sleep',
    face: { eyes: 'sleepy' },
    extra: { morph: 'cocoon' },
    arts: ['caterpillar'],
  },
  {
    id: 'butterfly',
    label: 'butterfly',
    mode: 'st_wander',
    vx: 1,
    face: {},
    extra: { morph: 'butterfly' },
    arts: ['caterpillar'],
  },
];

/** The states that apply to a bug. */
export function posesFor(def: BugDef): PoseState[] {
  return ALL.filter((s) => !s.arts || s.arts.includes(def.art));
}

/** Every expression the face kit covers: each eye shape, then each mouth. */
export const EXPRESSIONS: readonly {
  id: string;
  eyes: EyeShape;
  mouth: MouthShape;
  blush?: boolean;
  tint?: 'green' | 'red';
}[] = [
  { id: 'content', eyes: 'open', mouth: 'smile' },
  { id: 'happy', eyes: 'happy', mouth: 'grin', blush: true },
  { id: 'wide', eyes: 'wide', mouth: 'o' },
  { id: 'squint', eyes: 'squint', mouth: 'flat' },
  { id: 'dizzy', eyes: 'spiral', mouth: 'wobble' },
  { id: 'sleepy', eyes: 'sleepy', mouth: 'smile' },
  { id: 'worried', eyes: 'worried', mouth: 'frown' },
  { id: 'love', eyes: 'heart', mouth: 'chew', blush: true },
  { id: 'hate', eyes: 'angry', mouth: 'teeth', tint: 'red' },
  { id: 'yuck', eyes: 'x', mouth: 'tongue', tint: 'green' },
  { id: 'whee', eyes: 'happy', mouth: 'whee' },
  { id: 'aah', eyes: 'open', mouth: 'aah' },
  { id: 'yum', eyes: 'happy', mouth: 'lick' },
  { id: 'puff', eyes: 'squint', mouth: 'puff', tint: 'green' },
];

/** A frame for a state at time `t`, facing right. */
export function poseFrame(state: PoseState, t: number, dt = 1 / 60): BugFrame {
  const pose = bugPose({
    mode: state.mode,
    vx: state.vx ?? 0,
    vy: state.vy ?? 0,
    time: t,
    phase: 0.7,
    walkSpeed: 1,
  });
  const form: BodyForm = state.face.form ?? 'normal';
  return {
    pose,
    face: {
      eyes: state.face.eyes ?? 'open',
      mouth: state.face.mouth ?? 'smile',
      form,
      blush: state.face.blush ?? false,
      tint: state.face.tint ?? null,
      steam: state.face.eyes === 'angry',
    },
    facing: 1,
    time: t,
    dt,
    look: { x: 0.4 * Math.sin(t * 0.9), y: 0.15 },
    vx: state.vx ?? 0,
    vy: state.vy ?? 0,
    angle: form === 'curled' ? t * 2 : 0,
    squashX: 1,
    squashY: 1,
    stretchAngle: Math.atan2(state.vy ?? 0, state.vx ?? 0),
    stretch: 1,
    spin: 0,
    stars: 0,
    mode: state.mode,
    ...state.extra,
  };
}

/** A frame showing one expression while standing. */
export function expressionFrame(e: (typeof EXPRESSIONS)[number], t: number): BugFrame {
  return poseFrame(
    {
      id: e.id,
      label: e.id,
      mode: 'st_idle',
      face: { eyes: e.eyes, mouth: e.mouth, blush: e.blush ?? false, tint: e.tint ?? null },
    },
    t,
  );
}
