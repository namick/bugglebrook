import type { BugMode } from '../../../game/core/entities';
import type { BugArt } from '../../../game/data/types';
import type { ReactionType } from '../../../game/events';
import type { Emotion } from '../audio/voices';
import type { BodyForm, EyeShape, FaceTint, MouthShape } from './bugFace';

/**
 * How bugs act out reactions (game design doc, section 5). The sim picks the
 * reaction and its variant; this table says what each variant looks and
 * sounds like for each bug. Pure data plus small pure helpers.
 */

/** Wordless pictograms for speech and thought bubbles. `food` shows the food involved. */
export type Picto =
  | 'heart'
  | 'star'
  | 'exclaim'
  | 'question'
  | 'laugh'
  | 'sweat'
  | 'swirl'
  | 'dots'
  | 'spring'
  | 'up'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'cross'
  | 'yuck'
  | 'grr'
  | 'yum'
  | 'zzz'
  | 'note'
  | 'fire'
  | 'snow'
  | 'food';

/** A short body move that plays with the reaction. */
export type Move =
  | 'none'
  | 'hop'
  | 'wiggle'
  | 'shiver'
  | 'nod'
  | 'shrug'
  | 'stomp'
  | 'shake_head'
  | 'spin'
  | 'shell_spin'
  | 'pose'
  | 'cower';

/** One-off particles at the start of a reaction. */
export type ReactionFx = 'hearts' | 'sparkles' | 'steam' | 'sweat' | 'confetti' | null;

export interface ReactionLook {
  eyes: EyeShape;
  mouth: MouthShape;
  blush: boolean;
  tint: FaceTint;
  /** Overrides the body form (Glorp's shell). */
  form: BodyForm | null;
  pictos: readonly Picto[];
  emotion: Emotion;
  move: Move;
  fx: ReactionFx;
  /** How long the face and move last, in seconds. */
  seconds: number;
}

type Spec = Partial<ReactionLook> & Pick<ReactionLook, 'eyes' | 'mouth' | 'pictos' | 'emotion'>;

const look = (s: Spec): ReactionLook => ({
  blush: false,
  tint: null,
  form: null,
  move: 'none',
  fx: null,
  seconds: 1.2,
  ...s,
});

type Triple = readonly [ReactionLook, ReactionLook, ReactionLook];
const three = (a: Spec, b: Spec, c: Spec): Triple => [look(a), look(b), look(c)];

/**
 * The four faces owners asked for, kept distinct on purpose:
 * love (heart eyes), yum (licking lips), yuck (green, squeezed shut, tongue
 * out) and hate (angry brows, gritted teeth, steam).
 */
export const FACES = {
  love: { eyes: 'heart', mouth: 'grin', blush: true, tint: null },
  yum: { eyes: 'happy', mouth: 'lick', blush: true, tint: null },
  yuck: { eyes: 'x', mouth: 'tongue', blush: false, tint: 'green' },
  hate: { eyes: 'angry', mouth: 'teeth', blush: false, tint: null },
} as const satisfies Record<string, Pick<ReactionLook, 'eyes' | 'mouth' | 'blush' | 'tint'>>;

// Food reactions are shared by everyone; personality shows in the grab,
// poke, fling, and landing reactions below.
const FED: Record<'fed_loved' | 'fed_liked' | 'fed_neutral' | 'fed_disliked', Triple> = {
  fed_loved: three(
    { ...FACES.love, pictos: ['heart', 'heart'], emotion: 'love', move: 'hop', fx: 'hearts', seconds: 1.9 },
    { ...FACES.love, pictos: ['food', 'heart'], emotion: 'love', move: 'spin', fx: 'hearts', seconds: 1.9 },
    {
      ...FACES.love,
      pictos: ['star', 'heart'],
      emotion: 'love',
      move: 'wiggle',
      fx: 'sparkles',
      seconds: 1.9,
    },
  ),
  fed_liked: three(
    { ...FACES.yum, pictos: ['yum'], emotion: 'yum', move: 'nod', fx: 'sparkles', seconds: 1.4 },
    { ...FACES.yum, pictos: ['food', 'thumbs_up'], emotion: 'yum', move: 'nod', seconds: 1.4 },
    { ...FACES.yum, pictos: ['heart'], emotion: 'yum', move: 'hop', seconds: 1.4 },
  ),
  fed_neutral: three(
    { eyes: 'sleepy', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'shrug', seconds: 1.1 },
    {
      eyes: 'open',
      mouth: 'flat',
      pictos: ['food', 'question'],
      emotion: 'meh',
      move: 'shrug',
      seconds: 1.1,
    },
    { eyes: 'sleepy', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'meh', move: 'nod', seconds: 1.1 },
  ),
  fed_disliked: three(
    { ...FACES.hate, pictos: ['yuck'], emotion: 'yuck', move: 'stomp', fx: 'steam', seconds: 1.8 },
    {
      ...FACES.hate,
      pictos: ['food', 'cross'],
      emotion: 'grumpy',
      move: 'shake_head',
      fx: 'steam',
      seconds: 1.8,
    },
    {
      ...FACES.hate,
      pictos: ['grr', 'thumbs_down'],
      emotion: 'yuck',
      move: 'stomp',
      fx: 'steam',
      seconds: 1.8,
    },
  ),
};

const TICKLE: Triple = three(
  {
    eyes: 'happy',
    mouth: 'grin',
    blush: true,
    pictos: ['laugh'],
    emotion: 'giggle',
    move: 'wiggle',
    seconds: 3,
  },
  {
    eyes: 'happy',
    mouth: 'whee',
    blush: true,
    pictos: ['laugh', 'laugh'],
    emotion: 'giggle',
    move: 'wiggle',
    seconds: 3,
  },
  {
    eyes: 'x',
    mouth: 'grin',
    blush: true,
    pictos: ['laugh', 'heart'],
    emotion: 'giggle',
    move: 'wiggle',
    seconds: 3,
  },
);

// Never dizzy: into the shell, spin like a top, then peek out.
const SHELL: Triple = three(
  {
    eyes: 'open',
    mouth: 'o',
    form: 'in_shell',
    pictos: ['swirl'],
    emotion: 'ooh',
    move: 'shell_spin',
    seconds: 2.5,
  },
  {
    eyes: 'wide',
    mouth: 'o',
    form: 'in_shell',
    pictos: ['dots'],
    emotion: 'ooh',
    move: 'shell_spin',
    seconds: 2.5,
  },
  {
    eyes: 'sleepy',
    mouth: 'o',
    form: 'in_shell',
    pictos: ['question'],
    emotion: 'ooh',
    move: 'shell_spin',
    seconds: 2.5,
  },
);

type Personal = 'grab' | 'poke' | 'fling' | 'land';

const PERSONAL: Record<BugArt, Record<Personal, Triple>> = {
  // Dot: a show-off who loves being handled and thrown.
  ladybug: {
    grab: three(
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['laugh'], emotion: 'giggle', move: 'wiggle' },
      { eyes: 'wide', mouth: 'whee', blush: true, pictos: ['exclaim', 'star'], emotion: 'happy' },
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['heart'], emotion: 'happy', move: 'wiggle' },
    ),
    poke: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'wiggle',
        seconds: 0.7,
      },
      { eyes: 'wide', mouth: 'whee', pictos: ['star'], emotion: 'happy', move: 'hop', seconds: 0.7 },
      {
        eyes: 'happy',
        mouth: 'lick',
        blush: true,
        pictos: ['heart'],
        emotion: 'happy',
        move: 'pose',
        seconds: 0.7,
      },
    ),
    fling: three(
      { eyes: 'wide', mouth: 'whee', blush: true, pictos: ['star'], emotion: 'whee' },
      { eyes: 'happy', mouth: 'whee', blush: true, pictos: ['exclaim', 'exclaim'], emotion: 'whee' },
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['heart', 'star'], emotion: 'whee' },
    ),
    // "Again!" with the pictogram of a spring.
    land: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['spring', 'up'],
        emotion: 'happy',
        move: 'hop',
        seconds: 1.4,
      },
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['star', 'star'],
        emotion: 'happy',
        move: 'pose',
        seconds: 1.4,
      },
      { eyes: 'open', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'spin', seconds: 1.4 },
    ),
  },
  // Rollo: nervous and gentle.
  pillbug: {
    grab: three(
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', move: 'shiver', fx: 'sweat' },
      { eyes: 'worried', mouth: 'teeth', pictos: ['sweat', 'question'], emotion: 'scared', move: 'shiver' },
      {
        eyes: 'squint',
        mouth: 'o',
        pictos: ['exclaim', 'exclaim'],
        emotion: 'scared',
        move: 'shiver',
        fx: 'sweat',
      },
    ),
    poke: three(
      { eyes: 'squint', mouth: 'frown', pictos: ['exclaim'], emotion: 'gasp', move: 'cower', seconds: 0.7 },
      {
        eyes: 'worried',
        mouth: 'o',
        pictos: ['sweat'],
        emotion: 'scared',
        move: 'cower',
        fx: 'sweat',
        seconds: 0.7,
      },
      {
        eyes: 'squint',
        mouth: 'teeth',
        pictos: ['question'],
        emotion: 'scared',
        move: 'shiver',
        seconds: 0.7,
      },
    ),
    fling: three(
      { eyes: 'squint', mouth: 'o', pictos: ['exclaim'], emotion: 'scared' },
      { eyes: 'squint', mouth: 'o', pictos: ['sweat', 'exclaim'], emotion: 'scared' },
      { eyes: 'squint', mouth: 'o', pictos: ['swirl'], emotion: 'scared' },
    ),
    land: three(
      {
        eyes: 'worried',
        mouth: 'smile',
        pictos: ['sweat'],
        emotion: 'sleepy',
        move: 'shiver',
        fx: 'sweat',
        seconds: 1.4,
      },
      { eyes: 'squint', mouth: 'flat', pictos: ['swirl'], emotion: 'sleepy', move: 'cower', seconds: 1.4 },
      {
        eyes: 'worried',
        mouth: 'smile',
        blush: true,
        pictos: ['heart'],
        emotion: 'happy',
        move: 'nod',
        seconds: 1.4,
      },
    ),
  },
  // Glorp: slow, calm, and deadpan. Reacts to chaos with a long "ooooh".
  snail: {
    grab: three(
      { eyes: 'wide', mouth: 'o', pictos: ['question'], emotion: 'ooh' },
      { eyes: 'sleepy', mouth: 'flat', pictos: ['dots'], emotion: 'ooh' },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'ooh' },
    ),
    poke: three(
      { eyes: 'sleepy', mouth: 'flat', pictos: ['question'], emotion: 'grumpy', seconds: 0.9 },
      { eyes: 'open', mouth: 'flat', pictos: ['dots'], emotion: 'ooh', move: 'nod', seconds: 0.9 },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['note'], emotion: 'ooh', seconds: 0.9 },
    ),
    fling: three(
      { eyes: 'wide', mouth: 'o', pictos: ['question'], emotion: 'ooh' },
      { eyes: 'open', mouth: 'o', pictos: ['swirl'], emotion: 'ooh' },
      { eyes: 'wide', mouth: 'o', pictos: ['dots'], emotion: 'ooh' },
    ),
    land: three(
      { eyes: 'open', mouth: 'o', pictos: ['dots'], emotion: 'ooh', seconds: 1.6 },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'ooh', move: 'nod', seconds: 1.6 },
      { eyes: 'wide', mouth: 'o', pictos: ['question'], emotion: 'ooh', seconds: 1.6 },
    ),
  },
};

/** What reaction `type`, variant `variant`, looks like on a bug drawn as `art`. */
export function reactionLook(art: BugArt, type: ReactionType, variant: number): ReactionLook {
  const set: Triple =
    type === 'tickle'
      ? TICKLE
      : type === 'land_hard'
        ? SHELL
        : type === 'grab' || type === 'poke' || type === 'fling' || type === 'land'
          ? PERSONAL[art][type]
          : FED[type];
  return set[((variant % 3) + 3) % 3]!;
}

/** Which bug modes each reaction may show in. It ends early if the mode moves on. */
const SHOWS_IN: Readonly<Record<ReactionType, readonly BugMode[]>> = {
  grab: ['st_held'],
  fling: ['st_airborne'],
  tickle: ['st_held'],
  land: ['st_landing', 'st_idle', 'st_wander'],
  land_hard: ['st_react'],
  poke: ['st_react'],
  fed_loved: ['st_react', 'st_idle'],
  fed_liked: ['st_react', 'st_idle'],
  fed_neutral: ['st_react', 'st_idle'],
  fed_disliked: ['st_react', 'st_idle', 'st_wander'],
};

/** Is a reaction that started `ageSeconds` ago still showing in `mode`? */
export function reactionShowing(
  type: ReactionType,
  lookSeconds: number,
  mode: BugMode,
  ageSeconds: number,
): boolean {
  return ageSeconds >= 0 && ageSeconds < lookSeconds && SHOWS_IN[type].includes(mode);
}

export interface MovePose {
  bob: number;
  tilt: number;
  sx: number;
  sy: number;
  /** Multiplies the facing flip: -1..1 turns the bug around (spins). */
  flip: number;
}

/**
 * The body offset for a move, `t` seconds in. Pure, so tests can check
 * that moves start and end at rest.
 */
export function movePose(move: Move, t: number, seconds: number): MovePose {
  const rest: MovePose = { bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 };
  if (t < 0 || t >= seconds) return rest;
  // Fade everything out over the last quarter so the bug settles smoothly.
  const fade = Math.min(1, (seconds - t) / (seconds * 0.25));
  switch (move) {
    case 'none':
      return rest;
    case 'hop': {
      const h = t < 0.9 ? Math.abs(Math.sin(t * Math.PI * 3.3)) * 22 * (1 - t / 0.9) : 0;
      return { ...rest, bob: -h, sy: 1 + h * 0.004, sx: 1 - h * 0.003 };
    }
    case 'wiggle':
      return {
        ...rest,
        tilt: Math.sin(t * 30) * 0.14 * fade,
        sy: 1 + Math.abs(Math.sin(t * 15)) * 0.05 * fade,
      };
    case 'shiver':
      return { ...rest, tilt: Math.sin(t * 70) * 0.05 * fade, sx: 1 - 0.05 * fade, sy: 1 - 0.03 * fade };
    case 'nod':
      return { ...rest, tilt: Math.max(0, Math.sin(t * 11)) * 0.16 * fade };
    case 'shrug': {
      const k = t < 0.5 ? Math.sin((t / 0.5) * Math.PI) : 0;
      return { ...rest, sy: 1 + 0.1 * k, sx: 1 - 0.06 * k, bob: -4 * k };
    }
    case 'stomp': {
      const k = Math.max(0, Math.sin(t * 16)) * fade;
      return { ...rest, sy: 1 - 0.1 * k, sx: 1 + 0.1 * k, tilt: Math.sin(t * 8) * 0.06 * fade };
    }
    case 'shake_head':
      return { ...rest, tilt: Math.sin(t * 22) * 0.16 * fade };
    case 'spin':
      // One full turn in the first half second.
      return { ...rest, flip: t < 0.5 ? Math.cos((t / 0.5) * Math.PI * 2) : 1, bob: t < 0.5 ? -8 : 0 };
    case 'shell_spin': {
      // A top: fast at first, slowing, with a wobble as it winds down.
      // Six turns, easing out, so it stops facing forward.
      const u = Math.min(1, t / (seconds * 0.8));
      const angle = Math.PI * 2 * 6 * (1 - (1 - u) * (1 - u));
      return { ...rest, flip: Math.cos(angle), tilt: Math.sin(t * 9) * 0.12 * u * fade };
    }
    case 'pose':
      return { ...rest, tilt: -0.14 * fade, sy: 1 + 0.05 * fade };
    case 'cower':
      return { ...rest, sy: 1 - 0.14 * fade, sx: 1 + 0.08 * fade, bob: 2 * fade };
  }
}
