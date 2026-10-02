import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BugArt, BugDef } from '../../../../game/data/types';
import type { BodyForm, EyeShape, MouthShape } from '../bugFace';
import type { BugPose } from '../bugPose';
import type { BugFrame } from '../draw/bug';
import { OUTLINE, darken, lighten } from '../palette';

/**
 * The bug's skeleton, without any drawing: where the joints sit and how they
 * move. The procedural painter (`draw/bug.ts`), the cutout renderer
 * (`art/spriteBug.ts`), and the art template generator all read it, so the
 * code-drawn bug and the hand-drawn one bend in the same places.
 *
 * Rig space: facing right, the collider center at the origin, y down, the
 * ground at `foot`, in game pixels.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A wobbly feeler tip's offset from rest (an `AntennaSpring`). */
export interface Tip {
  readonly x: number;
  readonly y: number;
}

/** Beetles built the same way: Dot, and Flick the firefly. */
export const BEETLES: ReadonlySet<BugArt> = new Set(['ladybug', 'firefly']);

/** One leg this frame. `part` names the upper piece's art layer. */
export interface Joint {
  hip: Pt;
  knee: Pt;
  foot: Pt;
  far: boolean;
  part: 'leg' | 'leg_long' | 'hindleg';
}

/** One feeler or eye stalk this frame, as the curve the code draws. */
export interface Feeler {
  kind: 'quad' | 'cubic' | 'jointed';
  /** quad: base, control, tip. cubic: base, c1, c2, tip. jointed: base, elbow, tip. */
  pts: Pt[];
}

export interface EyeSpot {
  x: number;
  y: number;
  r: number;
  shape: EyeShape;
  /** The skin color around the eye, for sleepy lids. */
  lid: number;
  /** Outline width. */
  line: number;
  far: boolean;
}

export interface FacePlacement {
  /** The green or red wash over the head: a circle, or an ellipse when `ry` differs. */
  tint: { x: number; y: number; rx: number; ry: number; circle: boolean } | null;
  /** Far eye first. */
  eyes: EyeSpot[];
  cheek: { x: number; y: number; r: number; alpha: number } | null;
  mouth: { x: number; y: number; s: number; shape: MouthShape; color: number; line: number } | null;
}

export interface WingState {
  /** The wing covers' angle about their hinge (0 shut). */
  shellAngle: number;
  /** Flapping wings as ellipses (back one first), or none. */
  wings: { x: number; y: number; rx: number; ry: number }[];
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** How a part moves, for the template and the cutout renderer. */
export type PartKind =
  /** Fixed to the body; turns only with it. */
  | 'static'
  /** Hip to knee: drawn straight down from its pivot, rotated and stretched to the knee. */
  | 'limb_upper'
  /** Knee to foot: drawn straight down from its pivot. */
  | 'limb_lower'
  /** A feeler or stalk, drawn straight up from its base, bent along a curve. */
  | 'rope'
  /** Something that sits on the end of a rope part. */
  | 'tip'
  /** Wing covers that swing up on a hinge. */
  | 'hinged'
  /** A flapping wing, drawn twice. */
  | 'wing'
  /** A whole other body shape, shown instead of the rest. */
  | 'form';

export interface PartSpec {
  name: string;
  kind: PartKind;
  /** The pivot in rig space (game pixels), where the template puts its dot. */
  pivot: Pt;
  /** For limbs and ropes: the rest length in game pixels, drawn straight from the pivot. */
  length?: number;
  required: boolean;
  /** Drawn in greys and colored by the game. */
  tintable?: boolean;
  /** Only shown in this form. */
  form?: string;
  /** What to draw, in plain words, for the template's notes. */
  note: string;
}

export interface BugRig {
  art: BugArt;
  /** Collider radius in game pixels. */
  r: number;
  /** Pixels from the origin down to the ground. */
  foot: number;
  /** Walking-leg hips (beetles and the pill bug), far side first. */
  hips: (Pt & { far: boolean })[];
  /** The wing covers' hinge, or null. */
  hinge: Pt | null;
  /** The head's circle, for face washes and the template. */
  head: { x: number; y: number; r: number } | null;
  /** Where dizzy stars and steam circle. */
  crown: Pt;
  /** Flick's tail lantern. */
  lantern: Pt | null;
  /** Art layers back to front. */
  parts: PartSpec[];
}

const p = (x: number, y: number): Pt => ({ x, y });

/** Beetle and pill bug hips: far side first, back to front. */
function hipsFor(art: BugArt, r: number): (Pt & { far: boolean })[] {
  if (BEETLES.has(art)) {
    const near = [-0.5, -0.05, 0.38].map((x) => ({ x: r * x, y: r * 0.5, far: false }));
    const far = [-0.36, 0.1, 0.52].map((x) => ({ x: r * x, y: r * 0.45, far: true }));
    return [...far, ...near];
  }
  if (art === 'pillbug') {
    const near = Array.from({ length: 7 }, (_, i) => ({
      x: r * (-0.95 + i * 0.3),
      y: r * 0.66,
      far: false,
    }));
    const far = near.map((h) => ({ ...h, x: h.x + r * 0.12, y: h.y - r * 0.04, far: true }));
    return [...far, ...near];
  }
  return [];
}

/** The rig for a bug drawn by `BugSprite` itself (the first five and Flick), or a static one for the rest. */
export function rigFor(def: BugDef): BugRig {
  const r = def.radius * PIXELS_PER_METER;
  const art = def.art;
  const hinge = art === 'ladybug' ? p(r * 0.45, -r * 0.1) : art === 'firefly' ? p(r * 0.4, -r * 0.1) : null;
  const head = BEETLES.has(art)
    ? { x: r * 0.8, y: r * 0.12, r: art === 'firefly' ? r * 0.52 : r * 0.55 }
    : art === 'pillbug'
      ? { x: r * 1.14, y: r * 0.36, r: r * 0.5 }
      : art === 'strider'
        ? { x: r * 0.88, y: -r * 0.3, r: r * 0.3 }
        : art === 'grasshopper'
          ? { x: r * 0.78, y: -r * 0.18, r: r * 0.48 }
          : art === 'snail'
            ? { x: r * 1.08, y: r * 0.2, r: r * 0.4 }
            : null;
  const rig: BugRig = {
    art,
    r,
    // A box collider (Twig) stands on half its height; round ones on their radius.
    foot: def.collider ? (def.collider.height * PIXELS_PER_METER) / 2 : r,
    hips: hipsFor(art, r),
    hinge,
    head,
    crown: p(0, -r * 1.35),
    lantern: art === 'firefly' ? p(-r * 0.95, r * 0.28) : null,
    parts: [],
  };
  rig.parts = partsFor(rig);
  return rig;
}

/** The near leg of a kind at rest (the front-most one). Templates draw the leg pieces from its lengths. */
function restJoint(rig: BugRig, part: Joint['part']): Joint | null {
  const near = legJoints(rig, REST_POSE, REST_FRAME).filter((j) => !j.far && j.part === part);
  if (part === 'leg_long') return near[0] ?? null;
  return near[near.length - 1] ?? null;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** A feeler's length along its curve. */
export function feelerLength(f: Feeler): number {
  const pts = sampleFeeler(f, 16);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1]!, pts[i]!);
  return len;
}

type V = readonly [number, number];

/** A part in the per-bug tables below, in radii. */
type Entry =
  | {
      name: string;
      kind: 'static' | 'hinged' | 'wing' | 'form' | 'tip';
      at: V;
      note: string;
      form?: string;
      tintable?: boolean;
      optional?: boolean;
    }
  /** Two jointed pieces, hip to knee and knee to foot. `lower` null: one rigid piece from hip to foot. */
  | {
      name: string;
      kind: 'limb';
      lower: string | null;
      joint: readonly [V, V, V];
      note: string;
      form?: string;
    }
  /** A feeler: base, (elbow,) tip. With an elbow, `end` names the piece after it. */
  | {
      name: string;
      kind: 'rope';
      pts: readonly V[];
      length?: number;
      end?: string;
      tip?: string;
      note: string;
      form?: string;
    };

const NOTE = {
  legUpper: 'Hip to knee, drawn straight down from the hip dot. Round nub at the top.',
  legLower: 'Knee to foot, straight down from the knee dot, with the foot.',
  feeler: 'One feeler, drawn straight up from its base dot. The game bends it.',
  feelerTip: 'The knob on the end of the feeler, centered on its dot.',
  head: 'The head, with no face. The game draws the face on top.',
};

const legs = (joint: readonly [V, V, V], upper = 'leg_upper', lower = 'leg_lower'): Entry => ({
  name: upper,
  kind: 'limb',
  lower,
  joint,
  note: NOTE.legUpper,
});

/** The parts of the bugs drawn by species painters, in radii, back to front (docs/06-art-guide.md, A4). */
const PAINTED: Partial<Record<BugArt, readonly Entry[]>> = {
  stinkbug: [
    { name: 'belly', kind: 'static', at: [-0.38, 0.52], note: 'Pale underside.' },
    { name: 'head', kind: 'static', at: [1.02, 0.12], note: 'Small head, tucked under the shield. No face.' },
    { name: 'shield', kind: 'static', at: [-0.27, -0.15], note: 'The shield back with the orange dots.' },
    legs([
      [0.3, 0.5],
      [0.48, 0.57],
      [0.38, 1.0],
    ]),
    {
      name: 'antenna_base',
      kind: 'rope',
      pts: [
        [1.089, -0.294],
        [1.329, -0.714],
        [1.649, -0.614],
      ],
      end: 'antenna_end',
      tip: 'antenna_tip',
      note: 'Feeler up to the elbow, drawn straight up from its base dot.',
    },
  ],
  stagbeetle: [
    { name: 'antler', kind: 'static', at: [1.16, 0.16], note: 'One antler mandible, base on the dot.' },
    { name: 'belly', kind: 'static', at: [-0.3, 0.5], note: 'The underside.' },
    { name: 'shell', kind: 'static', at: [-0.35, 0.0], note: 'Big glossy shell with the white shine.' },
    { name: 'thorax', kind: 'static', at: [0.46, 0.1], note: 'The plate between shell and head.' },
    { name: 'head', kind: 'static', at: [0.92, 0.14], note: NOTE.head },
    legs([
      [0.32, 0.48],
      [0.5, 0.556],
      [0.4, 1.0],
    ]),
    {
      name: 'antenna_base',
      kind: 'rope',
      pts: [
        [0.992, -0.133],
        [1.042, -0.453],
        [1.352, -0.433],
      ],
      end: 'antenna_end',
      note: 'Feeler up to the elbow. Put the comb on antenna_end.',
    },
  ],
  dungbeetle: [
    { name: 'belly', kind: 'static', at: [-0.25, 0.52], note: 'Violet underside, full color.' },
    {
      name: 'hindleg_thigh',
      kind: 'limb',
      lower: null,
      joint: [
        [-0.62, 0.48],
        [-1.0, 0.12],
        [-1.0, 0.12],
      ],
      note: 'Thick back thigh, hip at the dot, drawn straight down to the knee.',
    },
    legs([
      [0.28, 0.5],
      [0.46, 0.57],
      [0.36, 1.0],
    ]),
    {
      name: 'shell_tint',
      kind: 'static',
      at: [-0.25, -0.1],
      tintable: true,
      note: 'Tintable: the round shell in light greys.',
    },
    { name: 'thorax_tint', kind: 'static', at: [0.42, 0.12], tintable: true, note: 'Tintable: the plate.' },
    {
      name: 'head_tint',
      kind: 'static',
      at: [0.98, 0.16],
      tintable: true,
      note: 'Tintable: the shovel head.',
    },
    { name: 'shine', kind: 'static', at: [-0.6, -0.4], optional: true, note: 'Optional: white highlights.' },
    {
      name: 'antenna',
      kind: 'rope',
      pts: [
        [0.9, -0.2],
        [1.2, -0.56],
      ],
      tip: 'antenna_tip',
      note: NOTE.feeler,
    },
    {
      name: 'ball_tint',
      kind: 'form',
      at: [0, 0],
      form: 'curled',
      tintable: true,
      note: 'Form, tintable: Barty tucked into a ball, eyes shut.',
    },
  ],
  caterpillar: [
    { name: 'tail_horn', kind: 'static', at: [-1.646, 0.382], note: 'The little orange horn at the back.' },
    { name: 'foot', kind: 'static', at: [-0.44, 0.884], note: 'One stub foot.' },
    {
      name: 'true_leg',
      kind: 'limb',
      lower: null,
      joint: [
        [0.34, 0.774],
        [0.36, 0.994],
        [0.36, 0.994],
      ],
      note: 'One tiny dark front leg, straight down from the dot.',
    },
    { name: 'segment_a', kind: 'static', at: [0.36, 0.52], note: 'A round body segment with yellow spots.' },
    { name: 'segment_b', kind: 'static', at: [-0.03, 0.52], note: 'The next segment, same size.' },
    { name: 'head', kind: 'static', at: [0.92, 0.1], note: NOTE.head },
    {
      name: 'antenna',
      kind: 'rope',
      pts: [
        [1.02, -0.36],
        [1.14, -0.7],
      ],
      tip: 'antenna_tip',
      note: NOTE.feeler,
    },
    {
      name: 'cocoon',
      kind: 'form',
      at: [0, -0.3],
      form: 'cocoon',
      note: 'Form: the silk cocoon with a window.',
    },
    {
      name: 'bf_wing_hind',
      kind: 'wing',
      at: [0.28, 0.05],
      form: 'butterfly',
      note: 'Butterfly: the back wing, root at the dot.',
    },
    {
      name: 'bf_wing_fore',
      kind: 'wing',
      at: [0.28, 0.05],
      form: 'butterfly',
      note: 'Butterfly: the big front wing, root at the dot.',
    },
    {
      name: 'bf_leg',
      kind: 'limb',
      lower: null,
      joint: [
        [0.48, 0.32],
        [0.83, 1.0],
        [0.83, 1.0],
      ],
      form: 'butterfly',
      note: 'Butterfly: one thin leg, straight down.',
    },
    { name: 'bf_body', kind: 'static', at: [-0.2, 0.25], form: 'butterfly', note: 'Butterfly: body.' },
    {
      name: 'bf_antenna',
      kind: 'rope',
      pts: [
        [0.925, -0.338],
        [1.345, -1.038],
      ],
      tip: 'bf_antenna_tip',
      form: 'butterfly',
      note: 'Butterfly: a long feeler, straight up.',
    },
  ],
  mantis: [
    {
      name: 'wing_open',
      kind: 'form',
      at: [-0.46, -0.6],
      form: 'thrown',
      note: 'Wings spread, shown when thrown.',
    },
    legs([
      [-0.02, 0.3],
      [0.38, -0.18],
      [0.76, 1.0],
    ]),
    { name: 'abdomen', kind: 'static', at: [-0.68, 0.26], note: 'The long leaf-shaped body.' },
    { name: 'wing_folded', kind: 'static', at: [0.02, 0.17], note: 'Folded wings along her back.' },
    { name: 'neck', kind: 'static', at: [0, 0.22], note: 'The long neck, base on the dot.' },
    { name: 'head', kind: 'static', at: [0.88, -0.7], note: 'The triangle head. No face.' },
    legs(
      [
        [0.5, -0.3],
        [1.12, -0.36],
        [0.86, 0.04],
      ],
      'arm_thigh',
      'arm_blade',
    ),
    {
      name: 'antenna',
      kind: 'rope',
      pts: [
        [1.1, -1.18],
        [0.85, -1.98],
      ],
      note: NOTE.feeler,
    },
  ],
  stickinsect: [
    legs([
      [1.192, -0.44],
      [1.798, -1.35],
      [2.665, 0.233],
    ]),
    {
      name: 'stick',
      kind: 'static',
      at: [0, -0.55],
      note: 'His body. Must look exactly like the twig item.',
    },
    {
      name: 'antenna',
      kind: 'rope',
      pts: [
        [2.033, -0.65],
        [3.367, -1.083],
      ],
      note: NOTE.feeler,
    },
  ],
};

/** The parts of the bugs `BugSprite` draws itself, from the live rig, in radii. */
function codeEntries(rig: BugRig): Entry[] {
  const { r, art } = rig;
  const v = (q: Pt): V => [q.x / r, q.y / r];
  const joint = (part: Joint['part']): readonly [V, V, V] => {
    const j = restJoint(rig, part)!;
    return [v(j.hip), v(j.knee), v(j.foot)];
  };
  const feelers = antennaPaths(rig, REST_FRAME, [ZERO_TIP, ZERO_TIP], 'normal');
  const near = feelers[feelers.length - 1]!;
  const feeler = (name: string, tip?: string): Entry => {
    const base = near.pts[0]!;
    const end = near.pts[near.pts.length - 1]!;
    return near.kind === 'jointed'
      ? { name, kind: 'rope', pts: near.pts.map(v), end: 'antenna_end', note: NOTE.feeler }
      : {
          name,
          kind: 'rope',
          pts: [v(base), v(end)],
          length: feelerLength(near) / r,
          ...(tip ? { tip } : {}),
          note: name === 'stalk' ? 'One eye stalk, drawn straight up. The eyes go on the tip.' : NOTE.feeler,
        };
  };
  switch (art) {
    case 'ladybug':
    case 'firefly': {
      const firefly = art === 'firefly';
      const out: Entry[] = [];
      if (firefly)
        out.push({
          name: 'tail',
          kind: 'static',
          at: [-0.95, 0.28],
          note: 'The tail lantern, in daylight colors.',
        });
      out.push(
        {
          name: 'wing',
          kind: 'wing',
          at: [-0.2, -0.15],
          note: 'One see-through flying wing, root at the dot, pointing up.',
        },
        legs(joint('leg')),
        { name: 'belly', kind: 'static', at: [-0.1, 0.42], note: 'The dark underside.' },
        { name: 'head', kind: 'static', at: [0.8, 0.12], note: NOTE.head },
      );
      if (firefly)
        out.push({
          name: 'cap',
          kind: 'static',
          at: [0.75, -0.2],
          note: 'The red-orange cap over the head.',
        });
      out.push(
        {
          name: 'shell',
          kind: 'hinged',
          at: v(rig.hinge!),
          note: 'The wing covers. They swing up on the hinge dot to fly.',
        },
        feeler('antenna', 'antenna_tip'),
      );
      return out;
    }
    case 'pillbug':
      return [
        { name: 'tail', kind: 'static', at: [-1.2, 0.55], note: 'The little tail prongs.' },
        { name: 'belly', kind: 'static', at: [-0.05, 0.6], note: 'Pale underside.' },
        { name: 'body', kind: 'static', at: [-0.05, 0.0], note: 'The domed back with seven plates.' },
        { name: 'head', kind: 'static', at: [1.14, 0.36], note: 'Round, pale face. No eyes or mouth.' },
        legs(joint('leg')),
        feeler('antenna_base'),
        {
          name: 'ball',
          kind: 'form',
          at: [0, 0],
          form: 'curled',
          note: 'Form: Rollo curled into a ball. No face.',
        },
      ];
    case 'snail':
      return [
        {
          name: 'body',
          kind: 'static',
          at: [0, 0.4],
          note: 'The whole soft body, foot and head in one piece.',
        },
        { name: 'shell', kind: 'static', at: [-0.35, -0.08], note: 'The round shell on his back.' },
        feeler('stalk'),
        {
          name: 'shell_closed',
          kind: 'form',
          at: [0, 0],
          form: 'in_shell',
          note: 'Form: just the shell, with a dark opening at the front.',
        },
      ];
    case 'strider':
      return [
        legs(joint('leg_long'), 'leg_long_upper', 'leg_long_lower'),
        legs(joint('leg')),
        { name: 'body', kind: 'static', at: [-0.25, -0.2], note: 'Long and slim, fatter at the front.' },
        { name: 'head', kind: 'static', at: [0.88, -0.3], note: NOTE.head },
        feeler('antenna'),
      ];
    case 'grasshopper':
      return [
        legs(joint('hindleg'), 'hindleg_thigh', 'hindleg_shin'),
        legs(joint('leg')),
        {
          name: 'body',
          kind: 'static',
          at: [-0.3, 0.18],
          note: 'Long body with the belly stripe and folded wing.',
        },
        { name: 'head', kind: 'static', at: [0.78, -0.18], note: NOTE.head },
        feeler('antenna'),
      ];
    default:
      return [...(PAINTED[art] ?? [])];
  }
}

/** Turn the table into part specs in game pixels. */
function partsFor(rig: BugRig): PartSpec[] {
  const { r } = rig;
  const P = (q: V): Pt => p(q[0] * r, q[1] * r);
  const parts: PartSpec[] = [];
  for (const e of codeEntries(rig)) {
    const form = e.form ? { form: e.form } : {};
    if (e.kind === 'limb') {
      const [hip, knee, foot] = e.joint.map(P) as [Pt, Pt, Pt];
      const upper = e.lower === null ? dist(hip, foot) : dist(hip, knee);
      parts.push({
        name: e.name,
        kind: 'limb_upper',
        pivot: hip,
        length: upper,
        required: true,
        ...form,
        note: e.note,
      });
      if (e.lower)
        parts.push({
          name: e.lower,
          kind: 'limb_lower',
          pivot: p(hip.x, hip.y + upper),
          length: dist(knee, foot),
          required: true,
          ...form,
          note: NOTE.legLower,
        });
      continue;
    }
    if (e.kind === 'rope') {
      const pts = e.pts.map(P);
      const base = pts[0]!;
      const first = e.end ? dist(base, pts[1]!) : (e.length ?? 0) * r || dist(base, pts[pts.length - 1]!);
      parts.push({
        name: e.name,
        kind: 'rope',
        pivot: base,
        length: first,
        required: true,
        ...form,
        note: e.note,
      });
      let top = p(base.x, base.y - first);
      if (e.end) {
        const second = dist(pts[1]!, pts[2]!);
        parts.push({
          name: e.end,
          kind: 'rope',
          pivot: top,
          length: second,
          required: true,
          ...form,
          note: 'The feeler from the elbow to the tip, straight up from the elbow dot.',
        });
        top = p(top.x, top.y - second);
      }
      if (e.tip)
        parts.push({ name: e.tip, kind: 'tip', pivot: top, required: true, ...form, note: NOTE.feelerTip });
      continue;
    }
    parts.push({
      name: e.name,
      kind: e.kind,
      pivot: P(e.at),
      required: !e.optional,
      ...(e.tintable ? { tintable: true } : {}),
      ...form,
      note: e.note,
    });
  }
  return parts;
}
/** A pose with nothing moving: legs at rest, eyes open. */
export const REST_POSE: BugPose = {
  sx: 1,
  sy: 1,
  tilt: 0,
  bob: 0,
  legPhase: 0,
  stride: 0,
  eyeOpen: 1,
  dizzy: false,
  flail: false,
};

const ZERO_TIP: Tip = { x: 0, y: 0 };

/** A frame with the bug standing still, facing right. */
export const REST_FRAME: BugFrame = {
  pose: REST_POSE,
  face: { eyes: 'open', mouth: 'smile', form: 'normal', blush: false, tint: null, steam: false },
  facing: 1,
  time: 0,
  dt: 1 / 60,
  look: { x: 0, y: 0 },
  vx: 0,
  vy: 0,
  angle: 0,
  squashX: 1,
  squashY: 1,
  stretchAngle: 0,
  stretch: 1,
  spin: 0,
  stars: 0,
};

/**
 * Every leg's hip, knee, and foot this frame, in drawing order (far legs
 * first). The walk cycle, the dangle when held, Skeet's rowing and
 * parachute, and Boing's folded and kicking hind legs.
 */
export function legJoints(rig: BugRig, pose: BugPose, frame: BugFrame): Joint[] {
  if (rig.art === 'strider') return striderJoints(rig, pose, frame);
  if (rig.art === 'grasshopper') return hopperJoints(rig, pose, frame);
  const { r } = rig;
  const pill = rig.art === 'pillbug';
  const hips = rig.hips;
  const n = hips.length / 2;
  return hips.map((hip, idx) => {
    const i = idx % n;
    const phase = pose.legPhase + (pill ? i * 0.9 : i * 2.1) + (hip.far ? Math.PI : 0);
    let fx: number;
    let fy: number;
    if (pose.flail) {
      fx = hip.x + Math.sin(phase * 1.1) * r * 0.26;
      fy = r * 0.82 + Math.cos(phase) * r * 0.18;
    } else {
      fx = hip.x + Math.sin(phase) * pose.stride * r * (pill ? 0.12 : 0.22);
      fy = r - Math.max(0, Math.cos(phase)) * pose.stride * r * 0.14;
    }
    const frontLeg = hip.x > 0;
    const kx = (hip.x + fx) / 2 + (frontLeg ? 1 : -1) * r * (pill ? 0.06 : 0.14);
    const ky = hip.y + (fy - hip.y) * 0.3 - r * (pill ? 0.02 : 0.08);
    return { hip: p(hip.x, hip.y), knee: p(kx, ky), foot: p(fx, fy), far: hip.far, part: 'leg' as const };
  });
}

/**
 * Skeet's legs: two long legs and a short front leg a side. They row when he
 * skates, walk stiffly on land, spread like a parachute when he is flung,
 * and dangle when held.
 */
function striderJoints(rig: BugRig, pose: BugPose, frame: BugFrame): Joint[] {
  const { r } = rig;
  const out: Joint[] = [];
  const leg = (
    hip: [number, number],
    knee: [number, number],
    foot: [number, number],
    far: boolean,
    part: Joint['part'],
  ): void => {
    out.push({ hip: p(hip[0], hip[1]), knee: p(knee[0], knee[1]), foot: p(foot[0], foot[1]), far, part });
  };
  const ph = pose.legPhase;
  for (const far of [true, false]) {
    const off = far ? r * 0.14 : 0;
    const side = far ? Math.PI : 0;
    if (frame.chute) {
      const flutter = Math.sin(frame.time * 8 + side) * r * 0.08;
      leg([off, -r * 0.1], [r * 0.9 + off, -r * 0.95], [r * 2.1 + off, r * 0.05 + flutter], far, 'leg_long');
      leg(
        [-r * 0.3 + off, -r * 0.1],
        [-r * 1.0 + off, -r * 0.85],
        [-r * 2.2 + off, r * 0.1 - flutter],
        far,
        'leg_long',
      );
      leg([r * 0.62, -r * 0.14], [r * 1.05, -r * 0.35], [r * 1.35, -r * 0.55], far, 'leg');
      continue;
    }
    if (pose.flail) {
      const w = Math.sin(ph + side) * r * 0.25;
      leg([off, -r * 0.1], [r * 0.5 + off, r * 0.3], [r * 0.9 + off + w, r * 1.1], far, 'leg_long');
      leg(
        [-r * 0.3 + off, -r * 0.1],
        [-r * 0.8 + off, r * 0.3],
        [-r * 1.1 + off - w, r * 1.15],
        far,
        'leg_long',
      );
      leg([r * 0.62, -r * 0.14], [r * 0.9, r * 0.2], [r * 1.0 + w * 0.5, r * 0.6], far, 'leg');
      continue;
    }
    const row = frame.skate ? Math.sin(ph + side) * pose.stride : 0;
    const lift = frame.skate ? 0 : Math.max(0, Math.sin(ph + side)) * pose.stride * r * 0.35;
    leg(
      [off, -r * 0.1],
      [r * 0.55 + off + row * r * 0.15, -r * 0.78 - lift * 0.5],
      [r * 1.85 + off + row * r * 0.3, r - lift],
      far,
      'leg_long',
    );
    const lift2 = frame.skate ? 0 : Math.max(0, Math.sin(ph + side + Math.PI)) * pose.stride * r * 0.35;
    leg(
      [-r * 0.3 + off, -r * 0.1],
      [-r * 0.88 + off - row * r * 0.1, -r * 0.62 - lift2 * 0.5],
      [-r * 2.1 + off - row * r * 0.2, r - lift2],
      far,
      'leg_long',
    );
    leg([r * 0.62, -r * 0.14], [r * 0.98, r * 0.15], [r * 1.22, r * 0.34], far, 'leg');
  }
  return out;
}

/**
 * Boing's legs: two small pairs in front, and the big hinged back legs.
 * Folded standing, crouched deeper between hops, kicked straight out while
 * hopping, and dangling when held. Per side: two front legs, then the hind leg.
 */
function hopperJoints(rig: BugRig, pose: BugPose, frame: BugFrame): Joint[] {
  const { r } = rig;
  const out: Joint[] = [];
  const ph = pose.legPhase;
  for (const far of [true, false]) {
    const off = far ? r * 0.12 : 0;
    for (const [hx, k] of [
      [r * 0.25, 0],
      [-r * 0.05, Math.PI],
    ] as const) {
      const phase = ph + k + (far ? Math.PI : 0);
      const reach = frame.carrying && hx > 0 ? r * 0.45 : 0;
      const fx = pose.flail
        ? hx + off + Math.sin(phase * 1.2) * r * 0.2
        : hx + off + reach + Math.sin(phase) * pose.stride * r * 0.18;
      const fy = pose.flail
        ? r * 0.85
        : frame.carrying && hx > 0
          ? r * 0.15
          : r - Math.max(0, Math.cos(phase)) * pose.stride * r * 0.12;
      out.push({
        hip: p(hx + off, r * 0.4),
        knee: p((hx + off + fx) / 2 + r * 0.1, (r * 0.4 + fy) / 2 - r * 0.05),
        foot: p(fx, fy),
        far,
        part: 'leg',
      });
    }
    const hip = p(-r * 0.45 + off, r * 0.22);
    let knee: Pt;
    let foot: Pt;
    if (frame.hopping) {
      knee = p(-r * 1.25 + off, r * 0.3);
      foot = p(-r * 2.0 + off, r * 0.55);
    } else if (pose.flail) {
      const w = Math.sin(ph + (far ? 1 : 0)) * r * 0.2;
      knee = p(-r * 1.05 + off, -r * 0.2 + w * 0.5);
      foot = p(-r * 1.2 + off + w, r * 0.95);
    } else {
      const crouch = pose.sy < 0.97 ? 0.15 : 0;
      const step = Math.sin(ph + (far ? Math.PI : 0)) * pose.stride * r * 0.08;
      knee = p(-r * 1.02 + off, -r * (0.62 - crouch));
      foot = p(-r * 1.18 + off + step, r);
    }
    out.push({ hip, knee, foot, far, part: 'hindleg' });
  }
  return out;
}

/** The feelers' gentle idle sway. */
const swayOf = (rig: BugRig, frame: BugFrame): number => Math.sin(frame.time * 2.1 + rig.r) * rig.r * 0.04;

/** The snail's eye stalks droop when sleepy or hungry and perk up when wide-eyed. */
function stalkTips(rig: BugRig, frame: BugFrame, springs: readonly Tip[]): { base: Pt; tip: Pt }[] {
  const { r } = rig;
  const f = frame.face;
  const droop = f.eyes === 'sleepy' || f.mouth === 'frown' ? 0.35 : 0;
  const perk = f.eyes === 'wide' ? -0.15 : 0;
  const stalks: [number, number, number][] = [
    [r * 0.82, -r * 0.42, -0.25],
    [r * 1.12, -r * 0.4, 0.25],
  ];
  return stalks.map(([bx, by, lean], i) => {
    const s = springs[i]!;
    const ang = -Math.PI / 2 + lean + droop + perk + Math.sin(frame.time * 1.6 + i) * 0.06;
    const len = r * 0.95;
    const tx = bx + Math.cos(ang) * len + s.x * frame.facing * 0.7;
    const ty = by + Math.sin(ang) * len + s.y * 0.7;
    return { base: p(bx, by), tip: p(tx, ty) };
  });
}

/**
 * Each feeler (or eye stalk) as the curve the code draws this frame, far one
 * first. None while curled up or hidden in a shell.
 */
export function antennaPaths(
  rig: BugRig,
  frame: BugFrame,
  springs: readonly Tip[],
  form: BodyForm,
): Feeler[] {
  const { r, art } = rig;
  if (form === 'in_shell' || form === 'curled') return [];
  const [a, b] = springs;
  const sway = swayOf(rig, frame);
  if (BEETLES.has(art)) {
    const bases: [number, number][] = [
      [r * 0.72, -r * 0.3],
      [r * 0.95, -r * 0.28],
    ];
    return bases.map(([bx, by], i) => {
      const s = i === 0 ? a! : b!;
      const tx = bx + r * (0.02 + i * 0.28) + s.x * frame.facing + sway;
      const ty = by - r * 0.62 + s.y;
      return { kind: 'quad', pts: [p(bx, by), p(bx + r * 0.05, by - r * 0.45), p(tx, ty)] };
    });
  }
  if (art === 'strider') {
    const bases: [number, number][] = [
      [r * 0.95, -r * 0.52],
      [r * 1.08, -r * 0.48],
    ];
    return bases.map(([bx, by], i) => {
      const s = i === 0 ? a! : b!;
      const tx = bx + r * (0.75 + i * 0.12) + s.x * frame.facing + sway;
      const ty = by - r * (0.55 - i * 0.1) + s.y;
      return { kind: 'quad', pts: [p(bx, by), p(bx + r * 0.25, by - r * 0.55), p(tx, ty)] };
    });
  }
  if (art === 'grasshopper') {
    const bases: [number, number][] = [
      [r * 0.72, -r * 0.6],
      [r * 0.92, -r * 0.58],
    ];
    return bases.map(([bx, by], i) => {
      const s = i === 0 ? a! : b!;
      const tx = bx - r * (0.55 - i * 0.2) + s.x * frame.facing * 1.4 + sway;
      const ty = by - r * (1.25 - i * 0.12) + s.y * 1.4;
      return {
        kind: 'cubic',
        pts: [p(bx, by), p(bx + r * 0.1, by - r * 0.6), p(tx + r * 0.5, ty + r * 0.1), p(tx, ty)],
      };
    });
  }
  if (art === 'pillbug') {
    const bases: [number, number][] = [
      [r * 1.12, r * 0.02],
      [r * 1.3, r * 0.06],
    ];
    return bases.map(([bx, by], i) => {
      const s = i === 0 ? a! : b!;
      const ex = bx + r * 0.22;
      const ey = by - r * 0.32 + s.y * 0.4;
      const tx = ex + r * (0.28 + i * 0.05) + s.x * frame.facing * 0.6 + sway;
      const ty = ey + r * 0.08 + s.y;
      return { kind: 'jointed', pts: [p(bx, by), p(ex, ey), p(tx, ty)] };
    });
  }
  if (art === 'snail') {
    return stalkTips(rig, frame, springs).map(({ base, tip }) => ({
      kind: 'quad',
      pts: [base, p(base.x + (tip.x - base.x) * 0.2, base.y + (tip.y - base.y) * 0.6), tip],
    }));
  }
  return [];
}

/** Points along a feeler, base to tip (`n` steps for curves; a jointed feeler is its three points). */
export function sampleFeeler(f: Feeler, n = 12): Pt[] {
  if (f.kind === 'jointed') return f.pts.map((q) => p(q.x, q.y));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    if (f.kind === 'quad') {
      const [a, c, b] = f.pts as [Pt, Pt, Pt];
      out.push(p(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
    } else {
      const [a, c1, c2, b] = f.pts as [Pt, Pt, Pt, Pt];
      const k0 = u * u * u;
      const k1 = 3 * u * u * t;
      const k2 = 3 * u * t * t;
      const k3 = t * t * t;
      out.push(p(k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x, k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y));
    }
  }
  return out;
}

/**
 * Where the eyes, cheek, mouth, and face wash go this frame, and which
 * shapes they show. Eyes far first.
 */
export function facePlacement(
  rig: BugRig,
  def: BugDef,
  frame: BugFrame,
  springs: readonly Tip[],
  form: BodyForm,
): FacePlacement | null {
  const { r, art } = rig;
  const f = frame.face;
  if (form === 'curled') return null;
  const eye = (x: number, y: number, er: number, lid: number, line: number, far: boolean): EyeSpot => ({
    x,
    y,
    r: er,
    shape: f.eyes,
    lid,
    line,
    far,
  });
  const noTint = form === 'in_shell';
  const tint = (x: number, y: number, rx: number, ry?: number): FacePlacement['tint'] =>
    f.tint && !noTint ? { x, y, rx, ry: ry ?? rx, circle: ry === undefined } : null;
  if (form === 'in_shell') {
    const shape: EyeShape = f.eyes === 'spiral' ? 'spiral' : 'open';
    return {
      tint: null,
      eyes: [
        { ...eye(r * 0.5, r * 0.33, r * 0.14, OUTLINE, 3, true), shape },
        { ...eye(r * 0.76, r * 0.33, r * 0.14, OUTLINE, 3, false), shape },
      ],
      cheek: null,
      mouth: null,
    };
  }
  const mouth = (x: number, y: number, s: number, color: number, line: number): FacePlacement['mouth'] => ({
    x,
    y,
    s,
    shape: f.mouth,
    color,
    line,
  });
  if (BEETLES.has(art)) {
    return {
      tint: tint(r * 0.8, r * 0.12, r * 0.52),
      eyes: [
        eye(r * 0.6, -r * 0.02, r * 0.25, 0x3a2a40, 4, true),
        eye(r * 0.98, r * 0.0, r * 0.3, 0x3a2a40, 4, false),
      ],
      cheek: f.blush || f.mouth === 'grin' ? { x: r * 1.2, y: r * 0.3, r: r * 0.1, alpha: 0.8 } : null,
      mouth: mouth(r * 0.97, r * 0.38, r * 0.34, 0xffb3c6, 4),
    };
  }
  if (art === 'strider') {
    const lid = lighten(def.body, 0.18);
    return {
      tint: tint(r * 0.88, -r * 0.3, r * 0.28),
      eyes: [
        eye(r * 0.78, -r * 0.4, r * 0.17, lid, 3.5, true),
        eye(r * 1.04, -r * 0.38, r * 0.19, lid, 3.5, false),
      ],
      cheek: { x: r * 1.1, y: -r * 0.14, r: r * 0.07, alpha: f.blush ? 0.9 : 0.5 },
      mouth: mouth(r * 1.0, -r * 0.15, r * 0.26, OUTLINE, 3.5),
    };
  }
  if (art === 'grasshopper') {
    const lid = lighten(def.body, 0.12);
    return {
      tint: tint(r * 0.8, -r * 0.18, r * 0.46, r * 0.42),
      eyes: [
        eye(r * 0.62, -r * 0.3, r * 0.2, lid, 3.5, true),
        eye(r * 0.95, -r * 0.3, r * 0.23, lid, 4, false),
      ],
      cheek: { x: r * 1.1, y: -r * 0.02, r: r * 0.09, alpha: f.blush ? 0.9 : 0.55 },
      mouth: mouth(r * 0.9, r * 0.06, r * 0.42, OUTLINE, 4),
    };
  }
  if (art === 'pillbug') {
    const lid = lighten(def.body, 0.35);
    return {
      tint: tint(r * 1.14, r * 0.36, r * 0.47),
      eyes: [
        eye(r * 0.98, r * 0.24, r * 0.19, lid, 3.5, true),
        eye(r * 1.3, r * 0.24, r * 0.22, lid, 4, false),
      ],
      cheek: { x: r * 1.44, y: r * 0.5, r: r * 0.09, alpha: f.blush ? 0.9 : 0.6 },
      mouth: mouth(r * 1.2, r * 0.6, r * 0.34, OUTLINE, 3.5),
    };
  }
  if (art === 'snail') {
    const tips = stalkTips(rig, frame, springs);
    return {
      tint: tint(r * 1.08, r * 0.2, r * 0.36, r * 0.42),
      eyes: tips.map(({ tip }, i) => eye(tip.x, tip.y, r * (i === 0 ? 0.22 : 0.25), def.body, 4, i === 0)),
      cheek: { x: r * 1.3, y: r * 0.2, r: r * 0.1, alpha: f.blush ? 0.9 : 0.6 },
      mouth: mouth(r * 1.2, r * 0.36, r * 0.34, OUTLINE, 4),
    };
  }
  return null;
}

/** Wing covers up and wings flapping while flying (Dot and Flick). */
export function wingState(rig: BugRig, frame: BugFrame, form: BodyForm): WingState {
  const { r } = rig;
  if (form !== 'flying') return { shellAngle: 0, wings: [] };
  const flap = Math.sin(frame.time * 48);
  return {
    shellAngle: -0.55,
    wings: (
      [
        [-0.1, 1],
        [0.1, 0.8],
      ] as const
    ).map(([ox, k]) => {
      const h = r * (0.55 + 0.35 * flap * k);
      return { x: r * ox - r * 0.2, y: -r * 0.15 - h * 0.6, rx: r * 0.32, ry: h };
    }),
  };
}

/** The lower half of the first five bugs' (and Flick's) bodies, where paint goes. */
export function paintBox(rig: BugRig, form: BodyForm): Box | null {
  const { r } = rig;
  switch (rig.art) {
    case 'ladybug':
      return { x0: -r * 1.17, x1: r * 0.87, y0: -r * 0.2, y1: r * 0.76 };
    case 'firefly':
      return { x0: -r * 1.45, x1: r * 0.66, y0: -r * 0.15, y1: r * 0.74 };
    case 'pillbug':
      return { x0: -r * 1.33, x1: r * 1.23, y0: -r * 0.02, y1: r * 0.8 };
    case 'snail':
      return form === 'in_shell'
        ? { x0: -r, x1: r, y0: 0, y1: r }
        : { x0: -r * 1.6, x1: r * 1.2, y0: r * 0.15, y1: r * 1.0 };
    case 'strider':
      return { x0: -r * 1.17, x1: r * 0.67, y0: -r * 0.22, y1: r * 0.1 };
    case 'grasshopper':
      return { x0: -r * 1.35, x1: r * 0.75, y0: r * 0.12, y1: r * 0.56 };
    default:
      return null;
  }
}

/** The far legs' color in the code-drawn bug (kept for the cutout's far-leg tint). */
export const farLegTint = (): number => darken(0xffffff, 0.25);

/** A walking-leg layout for the species painters (Whiff, Moose, Barty): see `walkJoints`. */
export interface WalkSpec {
  r: number;
  /** Near-side hips, back to front, as [x, y]. The far side copies them, shifted by `farShift`. */
  hips: readonly (readonly [number, number])[];
  farShift: readonly [number, number];
  /** Where feet rest. */
  ground: number;
  /** Stride length and step height, in radii. */
  reach?: number;
  lift?: number;
  /** Walking backward: the step cycle runs the other way. */
  reverse?: boolean;
}

/** One walking leg: which pair from the back, which side, its step phase, and its joints. */
export interface WalkJoint {
  i: number;
  far: boolean;
  phase: number;
  hip: [number, number];
  knee: [number, number];
  foot: [number, number];
}

/**
 * Six walking legs, beetle style, far side first: a tripod gait, a dangle
 * and paddle when held or flying.
 */
export function walkJoints(pose: BugPose, o: WalkSpec): WalkJoint[] {
  const { r } = o;
  const reach = o.reach ?? 0.22;
  const lift = o.lift ?? 0.14;
  const n = o.hips.length;
  const out: WalkJoint[] = [];
  for (const far of [true, false]) {
    for (let i = 0; i < n; i++) {
      const base = o.hips[i]!;
      const hip: [number, number] = far
        ? [base[0] + o.farShift[0], base[1] + o.farShift[1]]
        : [base[0], base[1]];
      const phase = (o.reverse ? -1 : 1) * pose.legPhase + i * 2.1 + (far ? Math.PI : 0);
      let fx: number;
      let fy: number;
      if (pose.flail) {
        fx = hip[0] + Math.sin(phase * 1.1) * r * 0.26;
        fy = o.ground * 0.82 + Math.cos(phase) * r * 0.18;
      } else {
        fx = hip[0] + (i - (n - 1) / 2) * r * 0.08 + Math.sin(phase) * pose.stride * r * reach;
        fy = o.ground - Math.max(0, Math.cos(phase)) * pose.stride * r * lift;
      }
      const side = i >= n / 2 ? 1 : -1;
      const kx = (hip[0] + fx) / 2 + side * r * 0.14;
      const ky = hip[1] + (fy - hip[1]) * 0.3 - r * 0.08;
      out.push({ i, far, phase, hip, knee: [kx, ky], foot: [fx, fy] });
    }
  }
  return out;
}

/** Near eye and mouth at rest for the painted species, in radii (from their painters). */
const PAINTED_FACE: Partial<
  Record<BugArt, { eye: [number, number, number]; mouth: [number, number, number] }>
> = {
  stinkbug: { eye: [1.158, 0.092, 0.166], mouth: [1.121, 0.35, 0.285] },
  stagbeetle: { eye: [1.028, 0.094, 0.1], mouth: [0.985, 0.27, 0.24] },
  dungbeetle: { eye: [0.98, 0.04, 0.17], mouth: [0.98, 0.32, 0.28] },
  caterpillar: { eye: [1.06, 0.02, 0.19], mouth: [0.96, 0.29, 0.4] },
  mantis: { eye: [1.36, -0.98, 0.26], mouth: [1.1, -0.56, 0.24] },
  stickinsect: { eye: [1.6, -0.6, 0.173], mouth: [1.7, -0.467, 0.333] },
};

/** Where the near eye and the mouth sit at rest, in rig pixels: face pieces drawn for one bug are placed from here. */
export function faceRest(rig: BugRig, def: BugDef): { eye: Pt & { r: number }; mouth: Pt & { s: number } } {
  const spot = facePlacement(rig, def, REST_FRAME, [ZERO_TIP, ZERO_TIP], 'normal');
  if (spot && spot.mouth) {
    const e = spot.eyes[spot.eyes.length - 1]!;
    return { eye: { x: e.x, y: e.y, r: e.r }, mouth: { x: spot.mouth.x, y: spot.mouth.y, s: spot.mouth.s } };
  }
  const t = PAINTED_FACE[rig.art] ?? { eye: [0.8, 0, 0.2], mouth: [0.9, 0.3, 0.3] };
  const { r } = rig;
  return {
    eye: { x: t.eye[0] * r, y: t.eye[1] * r, r: t.eye[2] * r },
    mouth: { x: t.mouth[0] * r, y: t.mouth[1] * r, s: t.mouth[2] * r },
  };
}
