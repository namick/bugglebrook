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
  | 'drop'
  | 'stink'
  | 'food'
  | 'friend'
  | 'sun'
  | 'rain'
  | 'moon';

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
  | 'cower'
  | 'shake_off'
  | 'sniff'
  | 'pat'
  | 'yawn'
  | 'bow';

/** One-off particles at the start of a reaction. */
export type ReactionFx =
  'hearts' | 'sparkles' | 'steam' | 'sweat' | 'confetti' | 'splash' | 'spray' | 'stink' | null;

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

type Classic = 'grab' | 'poke' | 'fling' | 'land' | 'splash' | 'shake_dry' | 'stink';
type Everyday = 'inspect' | 'gawk' | 'play' | 'show_off';

const CLASSIC: ReadonlySet<string> = new Set<Classic>([
  'grab',
  'poke',
  'fling',
  'land',
  'splash',
  'shake_dry',
  'stink',
]);
const EVERYDAY: ReadonlySet<string> = new Set<Everyday>(['inspect', 'gawk', 'play', 'show_off']);

// Reactions everyone shares: waking up, a snack snatched, slipping on slime, peeking out.
const WAKE: Triple = three(
  { eyes: 'wide', mouth: 'o', pictos: ['zzz', 'exclaim'], emotion: 'gasp', move: 'shiver', seconds: 1.4 },
  { eyes: 'sleepy', mouth: 'aah', pictos: ['zzz'], emotion: 'sleepy', move: 'yawn', seconds: 1.8 },
  { eyes: 'sleepy', mouth: 'smile', pictos: ['sun'], emotion: 'sleepy', move: 'yawn', seconds: 1.6 },
);
// "Hey!" A snatched snack is a game, never a fight.
const ROBBED: Triple = three(
  { eyes: 'wide', mouth: 'o', pictos: ['exclaim', 'food'], emotion: 'gasp', move: 'hop', seconds: 1.2 },
  {
    eyes: 'open',
    mouth: 'o',
    pictos: ['question', 'food'],
    emotion: 'question',
    move: 'shrug',
    seconds: 1.2,
  },
  {
    eyes: 'wide',
    mouth: 'whee',
    pictos: ['exclaim', 'laugh'],
    emotion: 'giggle',
    move: 'stomp',
    seconds: 1.2,
  },
);
const SLIP: Triple = three(
  { eyes: 'wide', mouth: 'whee', pictos: ['exclaim', 'sweat'], emotion: 'whee', move: 'wiggle', seconds: 1 },
  { eyes: 'x', mouth: 'wobble', pictos: ['swirl'], emotion: 'gasp', move: 'shiver', seconds: 1 },
  { eyes: 'happy', mouth: 'whee', pictos: ['laugh'], emotion: 'giggle', move: 'none', seconds: 1 },
);
const PEEK: Triple = three(
  { eyes: 'worried', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'none', seconds: 1 },
  { eyes: 'open', mouth: 'smile', pictos: ['dots'], emotion: 'meh', move: 'nod', seconds: 1 },
  { eyes: 'worried', mouth: 'smile', pictos: ['sweat'], emotion: 'scared', move: 'shiver', seconds: 1 },
);

// Weather (M6), shared by everyone: joy in the rain for those who love it,
// a soggy grumble for the rest, and wonder at a shooting star.
const RAIN_JOY: Triple = three(
  {
    eyes: 'happy',
    mouth: 'whee',
    blush: true,
    pictos: ['rain', 'heart'],
    emotion: 'whee',
    move: 'hop',
    fx: 'splash',
    seconds: 1.3,
  },
  {
    eyes: 'happy',
    mouth: 'grin',
    pictos: ['drop', 'laugh'],
    emotion: 'giggle',
    move: 'wiggle',
    seconds: 1.3,
  },
  { eyes: 'wide', mouth: 'whee', pictos: ['rain', 'star'], emotion: 'whee', move: 'spin', seconds: 1.4 },
);
const RAIN_GLOOM: Triple = three(
  { eyes: 'worried', mouth: 'wobble', pictos: ['rain'], emotion: 'sleepy', move: 'shiver', seconds: 1.3 },
  {
    eyes: 'squint',
    mouth: 'frown',
    pictos: ['drop', 'cross'],
    emotion: 'grumpy',
    move: 'shake_off',
    fx: 'spray',
  },
  {
    eyes: 'worried',
    mouth: 'o',
    pictos: ['rain', 'question'],
    emotion: 'question',
    move: 'cower',
    seconds: 1.2,
  },
);
const WONDER: Triple = three(
  { eyes: 'wide', mouth: 'o', pictos: ['star', 'exclaim'], emotion: 'ooh', move: 'none', seconds: 1.6 },
  {
    eyes: 'heart',
    mouth: 'o',
    blush: true,
    pictos: ['star', 'heart'],
    emotion: 'ooh',
    move: 'nod',
    seconds: 1.6,
  },
  { eyes: 'wide', mouth: 'whee', pictos: ['star', 'star'], emotion: 'whee', move: 'hop', seconds: 1.6 },
);

/** Show-off poses for bugs that are not Dot: a little star turn. */
const POSE: Triple = three(
  { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['star'], emotion: 'happy', move: 'pose', seconds: 2 },
  { eyes: 'open', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'bow', seconds: 2 },
  { eyes: 'happy', mouth: 'lick', pictos: ['star', 'heart'], emotion: 'happy', move: 'pose', seconds: 2 },
);

const PERSONAL: Record<BugArt, Record<Classic, Triple>> = {
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
    splash: three(
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim', 'drop'], emotion: 'gasp', fx: 'splash', seconds: 1.6 },
      { eyes: 'happy', mouth: 'whee', blush: true, pictos: ['drop', 'star'], emotion: 'whee', seconds: 1.6 },
      {
        eyes: 'x',
        mouth: 'wobble',
        pictos: ['drop', 'sweat'],
        emotion: 'scared',
        fx: 'splash',
        seconds: 1.6,
      },
    ),
    shake_dry: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['drop', 'star'],
        emotion: 'giggle',
        move: 'shake_off',
        fx: 'spray',
      },
      { eyes: 'squint', mouth: 'teeth', pictos: ['drop'], emotion: 'happy', move: 'shake_off', fx: 'spray' },
      {
        eyes: 'happy',
        mouth: 'whee',
        blush: true,
        pictos: ['star', 'star'],
        emotion: 'whee',
        move: 'shake_off',
        fx: 'spray',
      },
    ),
    stink: three(
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink', 'yuck'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
      },
      {
        eyes: 'squint',
        mouth: 'puff',
        tint: 'green',
        pictos: ['stink', 'cross'],
        emotion: 'yuck',
        move: 'cower',
        fx: 'stink',
      },
      { eyes: 'angry', mouth: 'frown', pictos: ['stink'], emotion: 'grumpy', move: 'stomp', fx: 'stink' },
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
    // Dunked, he sinks and holds his breath.
    splash: three(
      {
        eyes: 'squint',
        mouth: 'puff',
        pictos: ['drop', 'exclaim'],
        emotion: 'scared',
        fx: 'splash',
        seconds: 2,
      },
      { eyes: 'wide', mouth: 'puff', pictos: ['drop', 'sweat'], emotion: 'gasp', fx: 'splash', seconds: 2 },
      { eyes: 'worried', mouth: 'puff', pictos: ['drop'], emotion: 'scared', move: 'shiver', seconds: 2 },
    ),
    shake_dry: three(
      {
        eyes: 'squint',
        mouth: 'teeth',
        pictos: ['drop', 'sweat'],
        emotion: 'sleepy',
        move: 'shake_off',
        fx: 'spray',
      },
      {
        eyes: 'worried',
        mouth: 'smile',
        blush: true,
        pictos: ['drop', 'heart'],
        emotion: 'happy',
        move: 'shake_off',
        fx: 'spray',
      },
      { eyes: 'squint', mouth: 'o', pictos: ['drop'], emotion: 'gasp', move: 'shake_off', fx: 'spray' },
    ),
    // Rotten banana is his favorite smell.
    stink: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['stink', 'heart'],
        emotion: 'love',
        move: 'nod',
        seconds: 1.4,
      },
      {
        eyes: 'heart',
        mouth: 'lick',
        blush: true,
        pictos: ['stink', 'yum'],
        emotion: 'yum',
        move: 'wiggle',
        seconds: 1.4,
      },
      {
        eyes: 'happy',
        mouth: 'o',
        blush: true,
        pictos: ['stink', 'star'],
        emotion: 'ooh',
        move: 'hop',
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
    // Dunked, he floats shell-up like a little boat.
    splash: three(
      {
        eyes: 'open',
        mouth: 'o',
        form: 'in_shell',
        pictos: ['drop', 'dots'],
        emotion: 'ooh',
        fx: 'splash',
        seconds: 1.8,
      },
      { eyes: 'sleepy', mouth: 'o', form: 'in_shell', pictos: ['drop'], emotion: 'ooh', seconds: 1.8 },
      {
        eyes: 'wide',
        mouth: 'o',
        form: 'in_shell',
        pictos: ['drop', 'question'],
        emotion: 'ooh',
        fx: 'splash',
        seconds: 1.8,
      },
    ),
    shake_dry: three(
      {
        eyes: 'sleepy',
        mouth: 'smile',
        pictos: ['drop', 'thumbs_up'],
        emotion: 'ooh',
        move: 'shake_off',
        fx: 'spray',
        seconds: 1.4,
      },
      {
        eyes: 'open',
        mouth: 'o',
        pictos: ['drop', 'dots'],
        emotion: 'ooh',
        move: 'shake_off',
        fx: 'spray',
        seconds: 1.4,
      },
      {
        eyes: 'sleepy',
        mouth: 'flat',
        pictos: ['drop'],
        emotion: 'sleepy',
        move: 'shake_off',
        fx: 'spray',
        seconds: 1.4,
      },
    ),
    stink: three(
      {
        eyes: 'sleepy',
        mouth: 'frown',
        tint: 'green',
        pictos: ['stink', 'dots'],
        emotion: 'grumpy',
        fx: 'stink',
        seconds: 1.6,
      },
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
        seconds: 1.6,
      },
      {
        eyes: 'squint',
        mouth: 'flat',
        pictos: ['stink', 'question'],
        emotion: 'ooh',
        fx: 'stink',
        seconds: 1.6,
      },
    ),
  },
  // Skeet: laid back and unbothered, then suddenly very impressed by stunts.
  strider: {
    grab: three(
      { eyes: 'sleepy', mouth: 'flat', pictos: ['dots'], emotion: 'meh' },
      { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy' },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['question'], emotion: 'ooh' },
    ),
    poke: three(
      { eyes: 'sleepy', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'nod', seconds: 0.8 },
      {
        eyes: 'squint',
        mouth: 'smile',
        pictos: ['question'],
        emotion: 'question',
        move: 'shrug',
        seconds: 0.8,
      },
      { eyes: 'open', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'pose', seconds: 0.8 },
    ),
    // Parachuting down on his long legs.
    fling: three(
      { eyes: 'wide', mouth: 'whee', pictos: ['star', 'exclaim'], emotion: 'whee' },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'ooh' },
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['star'], emotion: 'whee' },
    ),
    // Lands with a cool nod.
    land: three(
      { eyes: 'sleepy', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.4 },
      { eyes: 'wide', mouth: 'grin', pictos: ['star', 'star'], emotion: 'whee', move: 'pose', seconds: 1.4 },
      { eyes: 'sleepy', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'shrug', seconds: 1.4 },
    ),
    // He skates on water, so these only show if he ever goes under.
    splash: three(
      { eyes: 'wide', mouth: 'o', pictos: ['drop', 'question'], emotion: 'gasp', fx: 'splash', seconds: 1.4 },
      { eyes: 'squint', mouth: 'flat', pictos: ['drop'], emotion: 'meh', seconds: 1.4 },
      { eyes: 'sleepy', mouth: 'o', pictos: ['drop', 'dots'], emotion: 'ooh', fx: 'splash', seconds: 1.4 },
    ),
    shake_dry: three(
      {
        eyes: 'sleepy',
        mouth: 'smile',
        pictos: ['drop', 'thumbs_up'],
        emotion: 'happy',
        move: 'shake_off',
        fx: 'spray',
      },
      { eyes: 'happy', mouth: 'grin', pictos: ['star'], emotion: 'whee', move: 'shake_off', fx: 'spray' },
      { eyes: 'squint', mouth: 'flat', pictos: ['drop'], emotion: 'meh', move: 'shake_off', fx: 'spray' },
    ),
    stink: three(
      {
        eyes: 'squint',
        mouth: 'flat',
        tint: 'green',
        pictos: ['stink', 'cross'],
        emotion: 'meh',
        move: 'shake_head',
        fx: 'stink',
      },
      { eyes: 'x', mouth: 'tongue', tint: 'green', pictos: ['stink', 'yuck'], emotion: 'yuck', fx: 'stink' },
      { eyes: 'angry', mouth: 'teeth', pictos: ['stink'], emotion: 'grumpy', move: 'cower', fx: 'stink' },
    ),
  },
  // Boing: hyper, can't sit still, loves being flung.
  grasshopper: {
    grab: three(
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['laugh'], emotion: 'giggle', move: 'wiggle' },
      { eyes: 'wide', mouth: 'whee', pictos: ['up', 'exclaim'], emotion: 'whee', move: 'wiggle' },
      { eyes: 'x', mouth: 'grin', blush: true, pictos: ['star'], emotion: 'giggle', move: 'shiver' },
    ),
    poke: three(
      { eyes: 'wide', mouth: 'whee', pictos: ['exclaim'], emotion: 'whee', move: 'hop', seconds: 0.7 },
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 0.7,
      },
      { eyes: 'open', mouth: 'grin', pictos: ['up'], emotion: 'happy', move: 'spin', seconds: 0.7 },
    ),
    fling: three(
      { eyes: 'happy', mouth: 'whee', blush: true, pictos: ['star', 'exclaim'], emotion: 'whee' },
      { eyes: 'x', mouth: 'whee', blush: true, pictos: ['laugh'], emotion: 'whee' },
      { eyes: 'wide', mouth: 'grin', pictos: ['up', 'up'], emotion: 'whee' },
    ),
    // Uses the landing to hop again.
    land: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['up', 'star'],
        emotion: 'happy',
        move: 'hop',
        seconds: 1.2,
      },
      { eyes: 'wide', mouth: 'whee', pictos: ['spring'], emotion: 'whee', move: 'hop', seconds: 1.2 },
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['thumbs_up', 'up'],
        emotion: 'happy',
        move: 'spin',
        seconds: 1.2,
      },
    ),
    // Kicks furiously and shoots out in one hop.
    splash: three(
      {
        eyes: 'wide',
        mouth: 'o',
        pictos: ['drop', 'exclaim'],
        emotion: 'gasp',
        fx: 'splash',
        move: 'shiver',
        seconds: 1.4,
      },
      { eyes: 'x', mouth: 'wobble', pictos: ['drop', 'up'], emotion: 'scared', fx: 'splash', seconds: 1.4 },
      {
        eyes: 'squint',
        mouth: 'teeth',
        pictos: ['exclaim', 'exclaim'],
        emotion: 'scared',
        move: 'wiggle',
        seconds: 1.4,
      },
    ),
    shake_dry: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['drop', 'up'],
        emotion: 'giggle',
        move: 'shake_off',
        fx: 'spray',
      },
      {
        eyes: 'squint',
        mouth: 'whee',
        pictos: ['drop', 'star'],
        emotion: 'whee',
        move: 'shake_off',
        fx: 'spray',
      },
      { eyes: 'x', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'shake_off', fx: 'spray' },
    ),
    stink: three(
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink', 'yuck'],
        emotion: 'yuck',
        move: 'hop',
        fx: 'stink',
      },
      {
        eyes: 'squint',
        mouth: 'puff',
        tint: 'green',
        pictos: ['stink', 'up'],
        emotion: 'yuck',
        move: 'shiver',
        fx: 'stink',
      },
      {
        eyes: 'wide',
        mouth: 'teeth',
        pictos: ['stink', 'exclaim'],
        emotion: 'gasp',
        move: 'shake_head',
        fx: 'stink',
      },
    ),
  },
  // Flick: an excitable prankster who talks in blinks.
  firefly: {
    grab: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['star', 'laugh'],
        emotion: 'giggle',
        move: 'wiggle',
      },
      { eyes: 'wide', mouth: 'whee', pictos: ['exclaim', 'star'], emotion: 'whee', move: 'wiggle' },
      { eyes: 'happy', mouth: 'lick', pictos: ['laugh'], emotion: 'giggle', move: 'wiggle' },
    ),
    poke: three(
      { eyes: 'happy', mouth: 'grin', pictos: ['star'], emotion: 'giggle', move: 'hop', seconds: 0.7 },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', move: 'hop', seconds: 0.7 },
      {
        eyes: 'happy',
        mouth: 'teeth',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'spin',
        seconds: 0.7,
      },
    ),
    fling: three(
      { eyes: 'wide', mouth: 'whee', blush: true, pictos: ['star', 'star'], emotion: 'whee' },
      { eyes: 'happy', mouth: 'whee', pictos: ['exclaim'], emotion: 'whee' },
      { eyes: 'happy', mouth: 'grin', blush: true, pictos: ['star', 'up'], emotion: 'whee' },
    ),
    land: three(
      { eyes: 'happy', mouth: 'grin', pictos: ['star', 'up'], emotion: 'happy', move: 'hop', seconds: 1.3 },
      {
        eyes: 'happy',
        mouth: 'whee',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'spin',
        seconds: 1.3,
      },
      {
        eyes: 'open',
        mouth: 'grin',
        pictos: ['thumbs_up', 'star'],
        emotion: 'happy',
        move: 'pose',
        seconds: 1.3,
      },
    ),
    // Dunked: his glow fizzes out with a "pfft".
    splash: three(
      { eyes: 'wide', mouth: 'o', pictos: ['drop', 'exclaim'], emotion: 'gasp', fx: 'splash', seconds: 1.6 },
      {
        eyes: 'x',
        mouth: 'wobble',
        pictos: ['drop', 'sweat'],
        emotion: 'scared',
        fx: 'splash',
        seconds: 1.6,
      },
      { eyes: 'worried', mouth: 'o', pictos: ['drop', 'question'], emotion: 'question', seconds: 1.6 },
    ),
    shake_dry: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['drop', 'star'],
        emotion: 'giggle',
        move: 'shake_off',
        fx: 'spray',
      },
      { eyes: 'squint', mouth: 'teeth', pictos: ['star'], emotion: 'happy', move: 'shake_off', fx: 'spray' },
      {
        eyes: 'happy',
        mouth: 'whee',
        pictos: ['star', 'star'],
        emotion: 'whee',
        move: 'shake_off',
        fx: 'spray',
      },
    ),
    // Stink clouds put his light out.
    stink: three(
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink', 'cross'],
        emotion: 'yuck',
        move: 'cower',
        fx: 'stink',
      },
      {
        eyes: 'squint',
        mouth: 'puff',
        tint: 'green',
        pictos: ['stink'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
      },
      {
        eyes: 'angry',
        mouth: 'frown',
        pictos: ['stink', 'grr'],
        emotion: 'grumpy',
        move: 'stomp',
        fx: 'stink',
      },
    ),
  },
};

/**
 * Everyday reactions, by personality: sniffing something new, turning to
 * look at a crash, the happy end of a game, and striking a pose.
 */
const EVERYDAY_LOOKS: Record<BugArt, Record<Everyday, Triple>> = {
  // Dot: always first to try a new thing; cheers at stunts; poses like a star.
  ladybug: {
    inspect: three(
      {
        eyes: 'wide',
        mouth: 'whee',
        pictos: ['food', 'exclaim'],
        emotion: 'whee',
        move: 'hop',
        seconds: 1.2,
      },
      {
        eyes: 'open',
        mouth: 'o',
        pictos: ['food', 'question'],
        emotion: 'question',
        move: 'sniff',
        seconds: 1.2,
      },
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['food', 'star'],
        emotion: 'happy',
        move: 'sniff',
        seconds: 1.2,
      },
    ),
    gawk: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 1.3,
      },
      { eyes: 'wide', mouth: 'whee', pictos: ['star', 'star'], emotion: 'whee', move: 'hop', seconds: 1.3 },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', move: 'none', seconds: 1.3 },
    ),
    play: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 1.2,
      },
      {
        eyes: 'happy',
        mouth: 'whee',
        pictos: ['star', 'heart'],
        emotion: 'whee',
        move: 'spin',
        seconds: 1.2,
      },
      { eyes: 'open', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'pose', seconds: 1.2 },
    ),
    show_off: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['star', 'star'],
        emotion: 'happy',
        move: 'pose',
        seconds: 2,
      },
      {
        eyes: 'happy',
        mouth: 'lick',
        blush: true,
        pictos: ['heart', 'star'],
        emotion: 'love',
        move: 'pose',
        seconds: 2,
      },
      { eyes: 'wide', mouth: 'whee', pictos: ['up', 'star'], emotion: 'whee', move: 'bow', seconds: 2 },
    ),
  },
  // Rollo: careful sniffs, jumpy at crashes, shy smiles after games.
  pillbug: {
    inspect: three(
      {
        eyes: 'worried',
        mouth: 'o',
        pictos: ['food', 'question'],
        emotion: 'question',
        move: 'sniff',
        seconds: 1.3,
      },
      {
        eyes: 'squint',
        mouth: 'flat',
        pictos: ['food', 'dots'],
        emotion: 'meh',
        move: 'sniff',
        seconds: 1.3,
      },
      {
        eyes: 'worried',
        mouth: 'smile',
        blush: true,
        pictos: ['food', 'heart'],
        emotion: 'happy',
        move: 'nod',
        seconds: 1.3,
      },
    ),
    gawk: three(
      {
        eyes: 'wide',
        mouth: 'o',
        pictos: ['exclaim', 'sweat'],
        emotion: 'gasp',
        move: 'shiver',
        seconds: 1.3,
      },
      { eyes: 'worried', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'cower', seconds: 1.3 },
      {
        eyes: 'happy',
        mouth: 'smile',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'none',
        seconds: 1.3,
      },
    ),
    play: three(
      {
        eyes: 'happy',
        mouth: 'smile',
        blush: true,
        pictos: ['laugh'],
        emotion: 'giggle',
        move: 'wiggle',
        seconds: 1.2,
      },
      {
        eyes: 'worried',
        mouth: 'smile',
        blush: true,
        pictos: ['heart'],
        emotion: 'happy',
        move: 'nod',
        seconds: 1.2,
      },
      {
        eyes: 'squint',
        mouth: 'grin',
        pictos: ['sweat', 'laugh'],
        emotion: 'giggle',
        move: 'shiver',
        seconds: 1.2,
      },
    ),
    show_off: POSE,
  },
  // Glorp: deadpan. Everything gets a long "ooooh".
  snail: {
    inspect: three(
      { eyes: 'sleepy', mouth: 'o', pictos: ['food', 'dots'], emotion: 'ooh', move: 'sniff', seconds: 1.6 },
      { eyes: 'open', mouth: 'o', pictos: ['food', 'question'], emotion: 'ooh', move: 'none', seconds: 1.6 },
      {
        eyes: 'sleepy',
        mouth: 'smile',
        pictos: ['food', 'thumbs_up'],
        emotion: 'ooh',
        move: 'nod',
        seconds: 1.6,
      },
    ),
    gawk: three(
      { eyes: 'open', mouth: 'o', pictos: ['dots'], emotion: 'ooh', move: 'none', seconds: 1.6 },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'ooh', move: 'nod', seconds: 1.6 },
      { eyes: 'sleepy', mouth: 'grin', pictos: ['laugh'], emotion: 'ooh', move: 'none', seconds: 1.6 },
    ),
    play: three(
      { eyes: 'sleepy', mouth: 'grin', pictos: ['laugh'], emotion: 'ooh', move: 'nod', seconds: 1.4 },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['heart'], emotion: 'happy', move: 'none', seconds: 1.4 },
      { eyes: 'open', mouth: 'o', pictos: ['dots', 'laugh'], emotion: 'ooh', move: 'none', seconds: 1.4 },
    ),
    show_off: POSE,
  },
  // Skeet: unbothered, then suddenly very impressed.
  strider: {
    inspect: three(
      {
        eyes: 'sleepy',
        mouth: 'flat',
        pictos: ['food', 'question'],
        emotion: 'meh',
        move: 'sniff',
        seconds: 1.2,
      },
      {
        eyes: 'sleepy',
        mouth: 'smile',
        pictos: ['food', 'thumbs_up'],
        emotion: 'happy',
        move: 'nod',
        seconds: 1.2,
      },
      { eyes: 'wide', mouth: 'o', pictos: ['food', 'star'], emotion: 'ooh', move: 'none', seconds: 1.2 },
    ),
    gawk: three(
      {
        eyes: 'wide',
        mouth: 'grin',
        pictos: ['star', 'exclaim'],
        emotion: 'whee',
        move: 'pose',
        seconds: 1.4,
      },
      { eyes: 'wide', mouth: 'o', pictos: ['thumbs_up'], emotion: 'ooh', move: 'nod', seconds: 1.4 },
      { eyes: 'happy', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'none', seconds: 1.4 },
    ),
    play: three(
      { eyes: 'sleepy', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.2 },
      { eyes: 'happy', mouth: 'grin', pictos: ['star'], emotion: 'whee', move: 'none', seconds: 1.2 },
      { eyes: 'squint', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'shrug', seconds: 1.2 },
    ),
    show_off: POSE,
  },
  // Boing: everything is exciting.
  grasshopper: {
    inspect: three(
      { eyes: 'wide', mouth: 'whee', pictos: ['food', 'exclaim'], emotion: 'whee', move: 'hop', seconds: 1 },
      {
        eyes: 'open',
        mouth: 'grin',
        pictos: ['food', 'question'],
        emotion: 'question',
        move: 'sniff',
        seconds: 1,
      },
      {
        eyes: 'happy',
        mouth: 'grin',
        blush: true,
        pictos: ['food', 'star'],
        emotion: 'happy',
        move: 'wiggle',
        seconds: 1,
      },
    ),
    gawk: three(
      {
        eyes: 'happy',
        mouth: 'whee',
        blush: true,
        pictos: ['laugh', 'laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 1.2,
      },
      { eyes: 'wide', mouth: 'grin', pictos: ['star', 'up'], emotion: 'whee', move: 'hop', seconds: 1.2 },
      {
        eyes: 'x',
        mouth: 'grin',
        pictos: ['exclaim', 'laugh'],
        emotion: 'giggle',
        move: 'wiggle',
        seconds: 1.2,
      },
    ),
    play: three(
      {
        eyes: 'x',
        mouth: 'whee',
        blush: true,
        pictos: ['laugh', 'laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 1.2,
      },
      { eyes: 'happy', mouth: 'grin', pictos: ['star', 'up'], emotion: 'whee', move: 'spin', seconds: 1.2 },
      {
        eyes: 'happy',
        mouth: 'whee',
        pictos: ['heart', 'laugh'],
        emotion: 'giggle',
        move: 'wiggle',
        seconds: 1.2,
      },
    ),
    show_off: POSE,
  },
  // Flick: first to any light show, laughs at every stunt.
  firefly: {
    inspect: three(
      { eyes: 'wide', mouth: 'whee', pictos: ['food', 'star'], emotion: 'whee', move: 'hop', seconds: 1.1 },
      {
        eyes: 'open',
        mouth: 'o',
        pictos: ['food', 'question'],
        emotion: 'question',
        move: 'sniff',
        seconds: 1.1,
      },
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['food', 'exclaim'],
        emotion: 'happy',
        move: 'sniff',
        seconds: 1.1,
      },
    ),
    gawk: three(
      {
        eyes: 'happy',
        mouth: 'whee',
        blush: true,
        pictos: ['laugh', 'laugh'],
        emotion: 'giggle',
        move: 'hop',
        seconds: 1.2,
      },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim', 'star'], emotion: 'gasp', move: 'none', seconds: 1.2 },
      { eyes: 'happy', mouth: 'grin', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.2 },
    ),
    play: three(
      {
        eyes: 'happy',
        mouth: 'whee',
        blush: true,
        pictos: ['star', 'laugh'],
        emotion: 'giggle',
        move: 'spin',
        seconds: 1.2,
      },
      { eyes: 'happy', mouth: 'grin', pictos: ['heart', 'star'], emotion: 'whee', move: 'hop', seconds: 1.2 },
      { eyes: 'x', mouth: 'whee', pictos: ['laugh'], emotion: 'giggle', move: 'wiggle', seconds: 1.2 },
    ),
    show_off: POSE,
  },
};

/** What reaction `type`, variant `variant`, looks like on a bug drawn as `art`. */
export function reactionLook(art: BugArt, type: ReactionType, variant: number): ReactionLook {
  const set: Triple =
    type === 'tickle'
      ? TICKLE
      : type === 'land_hard'
        ? SHELL
        : type === 'wake'
          ? WAKE
          : type === 'robbed'
            ? ROBBED
            : type === 'slip'
              ? SLIP
              : type === 'peek'
                ? PEEK
                : type === 'rain_joy'
                  ? RAIN_JOY
                  : type === 'rain_gloom'
                    ? RAIN_GLOOM
                    : type === 'wonder'
                      ? WONDER
                      : CLASSIC.has(type)
                        ? PERSONAL[art][type as Classic]
                        : EVERYDAY.has(type)
                          ? EVERYDAY_LOOKS[art][type as Everyday]
                          : FED[type as keyof typeof FED];
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
  splash: ['st_swim'],
  shake_dry: ['st_react'],
  stink: ['st_react', 'st_wander', 'st_idle'],
  inspect: ['st_react', 'st_idle'],
  wake: ['st_react', 'st_idle'],
  gawk: ['st_react', 'st_idle', 'st_wander', 'st_seek'],
  robbed: ['st_idle', 'st_social', 'st_react'],
  slip: ['st_wander', 'st_seek', 'st_social', 'st_idle'],
  show_off: ['st_perform'],
  play: ['st_react', 'st_idle', 'st_wander'],
  peek: ['st_react', 'st_idle'],
  rain_joy: ['st_react', 'st_idle', 'st_wander'],
  rain_gloom: ['st_react', 'st_idle', 'st_wander'],
  wonder: ['st_react', 'st_idle'],
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
    case 'sniff': {
      // Leaning in for little sniffs.
      const k = Math.min(1, t / 0.2) * fade;
      return {
        ...rest,
        tilt: (0.12 + Math.max(0, Math.sin(t * 16)) * 0.05) * k,
        bob: 2 * k,
        sx: 1 + 0.03 * k,
      };
    }
    case 'pat':
      return {
        ...rest,
        tilt: Math.max(0, Math.sin(t * 9)) * 0.14 * fade,
        bob: Math.max(0, Math.sin(t * 9)) * 3 * fade,
      };
    case 'yawn': {
      const k = Math.sin(Math.min(1, t / (seconds * 0.8)) * Math.PI);
      return { ...rest, sy: 1 + 0.1 * k, sx: 1 - 0.05 * k, tilt: -0.08 * k };
    }
    case 'bow': {
      const k = t < seconds * 0.6 ? Math.sin((t / (seconds * 0.6)) * Math.PI) : 0;
      return { ...rest, tilt: 0.3 * k, bob: 3 * k };
    }
    case 'shake_off': {
      // A wet dog: fast side-to-side twists that wind down, with a little crouch first.
      const k = t < 0.15 ? t / 0.15 : fade;
      return {
        ...rest,
        tilt: Math.sin(t * 38) * 0.22 * k,
        sx: 1 + Math.abs(Math.sin(t * 38)) * 0.06 * k,
        sy: 1 - 0.06 * k,
        bob: 2 * k,
      };
    }
  }
}
