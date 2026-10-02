import type { BugArt } from '../../../game/data/types';
import type { ReactionLook } from './reactions';

/**
 * M11's reactions (game design doc, sections 4 and 7.3): each bug's own way
 * of wearing a hat (`hatted`), the shared faces for a loved or a hated
 * thing put on, a bug nearby noticing, and Prim's verdict; and the three
 * music bugs' personal tables (Buzzby, Fiddle, Luma). Pure data, joined
 * into `reactions.ts`.
 */

type Spec = Partial<ReactionLook> & Pick<ReactionLook, 'eyes' | 'mouth' | 'pictos' | 'emotion'>;
type Triple = readonly [ReactionLook, ReactionLook, ReactionLook];
type Classic = 'grab' | 'poke' | 'fling' | 'land' | 'splash' | 'shake_dry' | 'stink';
type Everyday = 'inspect' | 'gawk' | 'play' | 'show_off';
export type NewArt = 'bee' | 'cricket' | 'moth';

const look = (s: Spec): ReactionLook => ({
  blush: false,
  tint: null,
  form: null,
  move: 'none',
  fx: null,
  seconds: 1.2,
  ...s,
});
const three = (a: Spec, b: Spec, c: Spec): Triple => [look(a), look(b), look(c)];

/** Something loved put on: hearts and a twirl (everyone). */
export const HAT_LOVE: Triple = three(
  {
    eyes: 'heart',
    mouth: 'grin',
    blush: true,
    pictos: ['hat', 'heart'],
    emotion: 'love',
    move: 'spin',
    fx: 'hearts',
    seconds: 1.8,
  },
  {
    eyes: 'happy',
    mouth: 'grin',
    blush: true,
    pictos: ['heart', 'star'],
    emotion: 'love',
    move: 'pose',
    fx: 'sparkles',
    seconds: 1.8,
  },
  {
    eyes: 'heart',
    mouth: 'smile',
    blush: true,
    pictos: ['hat', 'star'],
    emotion: 'love',
    move: 'hop',
    seconds: 1.8,
  },
);

/** Something hated put on: a squint, a head shake, and off it comes (everyone). */
export const HAT_YUCK: Triple = three(
  {
    eyes: 'squint',
    mouth: 'frown',
    pictos: ['hat', 'thumbs_down'],
    emotion: 'grumpy',
    move: 'shake_head',
    seconds: 1.3,
  },
  {
    eyes: 'x',
    mouth: 'tongue',
    tint: 'green',
    pictos: ['hat', 'yuck'],
    emotion: 'yuck',
    move: 'shake_off',
    seconds: 1.3,
  },
  { eyes: 'angry', mouth: 'flat', pictos: ['hat', 'cross'], emotion: 'grumpy', move: 'stomp', seconds: 1.3 },
);

/** A bug nearby notices a new hat: a laugh, an "ooh", or a nod (everyone). */
export const HAT_LOOK: Triple = three(
  { eyes: 'happy', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'wiggle', seconds: 1.3 },
  { eyes: 'wide', mouth: 'o', pictos: ['hat', 'exclaim'], emotion: 'ooh', move: 'none', seconds: 1.3 },
  { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.3 },
);

/** Prim's verdict: a sparkle, a bow, or the raised eyebrow (variant 2, "hmm"). */
export const FASHION: Triple = three(
  {
    eyes: 'squint',
    mouth: 'smile',
    pictos: ['hat', 'star'],
    emotion: 'ooh',
    move: 'pose',
    fx: 'sparkles',
    seconds: 1.8,
  },
  {
    eyes: 'happy',
    mouth: 'grin',
    pictos: ['thumbs_up', 'star'],
    emotion: 'happy',
    move: 'bow',
    fx: 'sparkles',
    seconds: 1.8,
  },
  {
    eyes: 'squint',
    mouth: 'flat',
    pictos: ['hat', 'question'],
    emotion: 'meh',
    move: 'shake_head',
    seconds: 1.8,
  },
);

/** Each bug's own way of wearing a hat (section 4, "Hatted"). */
export const HATTED: Readonly<Record<BugArt, Triple>> = {
  // Struts in a small circle.
  ladybug: three(
    { eyes: 'happy', mouth: 'grin', pictos: ['hat', 'star'], emotion: 'happy', move: 'spin', seconds: 1.6 },
    { eyes: 'squint', mouth: 'smile', pictos: ['hat'], emotion: 'happy', move: 'pose', seconds: 1.6 },
    { eyes: 'open', mouth: 'grin', pictos: ['star'], emotion: 'whee', move: 'hop', seconds: 1.6 },
  ),
  // Peeks up at it nervously, then smiles.
  pillbug: three(
    {
      eyes: 'worried',
      mouth: 'wobble',
      pictos: ['hat', 'question'],
      emotion: 'scared',
      move: 'cower',
      seconds: 1.6,
    },
    { eyes: 'wide', mouth: 'o', pictos: ['hat'], emotion: 'ooh', move: 'none', seconds: 1.6 },
    {
      eyes: 'happy',
      mouth: 'smile',
      blush: true,
      pictos: ['hat', 'heart'],
      emotion: 'happy',
      move: 'nod',
      seconds: 1.6,
    },
  ),
  // A long, deadpan "ooooh".
  snail: three(
    { eyes: 'sleepy', mouth: 'o', pictos: ['hat', 'dots'], emotion: 'ooh', move: 'none', seconds: 2 },
    { eyes: 'open', mouth: 'flat', pictos: ['hat'], emotion: 'meh', move: 'nod', seconds: 2 },
    { eyes: 'squint', mouth: 'smile', pictos: ['star'], emotion: 'ooh', move: 'none', seconds: 2 },
  ),
  // Skates a proud little loop.
  strider: three(
    { eyes: 'squint', mouth: 'grin', pictos: ['hat', 'star'], emotion: 'happy', move: 'spin', seconds: 1.5 },
    { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'pose', seconds: 1.5 },
    { eyes: 'happy', mouth: 'grin', pictos: ['hat'], emotion: 'whee', move: 'wiggle', seconds: 1.5 },
  ),
  // Hops to make it fall off, then catches it: a trick.
  grasshopper: three(
    { eyes: 'happy', mouth: 'grin', pictos: ['hat', 'up'], emotion: 'whee', move: 'hop', seconds: 1.4 },
    { eyes: 'squint', mouth: 'grin', pictos: ['hat', 'star'], emotion: 'happy', move: 'hop', seconds: 1.4 },
    { eyes: 'open', mouth: 'whee', pictos: ['up'], emotion: 'whee', move: 'spin', seconds: 1.4 },
  ),
  // His glow shines through it.
  firefly: three(
    {
      eyes: 'happy',
      mouth: 'grin',
      pictos: ['hat', 'star'],
      emotion: 'happy',
      move: 'wiggle',
      fx: 'sparkles',
      seconds: 1.5,
    },
    { eyes: 'wide', mouth: 'o', pictos: ['hat'], emotion: 'ooh', move: 'none', seconds: 1.5 },
    { eyes: 'squint', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'hop', seconds: 1.5 },
  ),
  // Tips it politely.
  stinkbug: three(
    { eyes: 'open', mouth: 'smile', pictos: ['hat'], emotion: 'happy', move: 'bow', seconds: 1.6 },
    {
      eyes: 'happy',
      mouth: 'smile',
      blush: true,
      pictos: ['hat', 'heart'],
      emotion: 'happy',
      move: 'bow',
      seconds: 1.6,
    },
    { eyes: 'worried', mouth: 'smile', pictos: ['hat', 'sweat'], emotion: 'meh', move: 'nod', seconds: 1.6 },
  ),
  // Sits very still so it does not fall.
  stagbeetle: three(
    { eyes: 'wide', mouth: 'flat', pictos: ['hat', 'sweat'], emotion: 'scared', move: 'none', seconds: 2 },
    {
      eyes: 'squint',
      mouth: 'smile',
      blush: true,
      pictos: ['hat'],
      emotion: 'happy',
      move: 'none',
      seconds: 2,
    },
    { eyes: 'open', mouth: 'o', pictos: ['hat', 'dots'], emotion: 'ooh', move: 'none', seconds: 2 },
  ),
  // Gives it a polish and a proud roll of the shoulders.
  dungbeetle: three(
    { eyes: 'squint', mouth: 'grin', pictos: ['hat', 'star'], emotion: 'happy', move: 'pose', seconds: 1.5 },
    { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.5 },
    { eyes: 'happy', mouth: 'grin', pictos: ['hat'], emotion: 'happy', move: 'wiggle', seconds: 1.5 },
  ),
  // Tries to see it, going cross-eyed, and giggles.
  caterpillar: three(
    {
      eyes: 'spiral',
      mouth: 'grin',
      pictos: ['hat', 'question'],
      emotion: 'giggle',
      move: 'wiggle',
      seconds: 1.6,
    },
    {
      eyes: 'happy',
      mouth: 'grin',
      blush: true,
      pictos: ['hat', 'heart'],
      emotion: 'happy',
      move: 'nod',
      seconds: 1.6,
    },
    { eyes: 'wide', mouth: 'o', pictos: ['hat', 'star'], emotion: 'ooh', move: 'hop', seconds: 1.6 },
  ),
  // Strikes a pose for the cameras that are not there.
  mantis: three(
    {
      eyes: 'squint',
      mouth: 'smile',
      pictos: ['hat', 'star'],
      emotion: 'ooh',
      move: 'pose',
      fx: 'sparkles',
      seconds: 2,
    },
    { eyes: 'happy', mouth: 'grin', pictos: ['star', 'star'], emotion: 'happy', move: 'bow', seconds: 2 },
    {
      eyes: 'open',
      mouth: 'smile',
      pictos: ['hat', 'thumbs_up'],
      emotion: 'happy',
      move: 'pose',
      seconds: 2,
    },
  ),
  // Looks absurd and does not move.
  stickinsect: three(
    { eyes: 'open', mouth: 'flat', pictos: ['hat'], emotion: 'meh', move: 'none', seconds: 2.4 },
    { eyes: 'squint', mouth: 'flat', pictos: ['hat', 'dots'], emotion: 'meh', move: 'none', seconds: 2.4 },
    { eyes: 'wide', mouth: 'o', pictos: ['dots'], emotion: 'gasp', move: 'none', seconds: 2.4 },
  ),
  // Buzzes a businesslike lap and gets back to work.
  bee: three(
    {
      eyes: 'open',
      mouth: 'smile',
      pictos: ['hat', 'thumbs_up'],
      emotion: 'happy',
      move: 'nod',
      seconds: 1.4,
    },
    { eyes: 'squint', mouth: 'grin', pictos: ['hat', 'note'], emotion: 'happy', move: 'spin', seconds: 1.4 },
    { eyes: 'happy', mouth: 'smile', pictos: ['star'], emotion: 'happy', move: 'wiggle', seconds: 1.4 },
  ),
  // Adjusts it with a leg.
  cricket: three(
    { eyes: 'squint', mouth: 'flat', pictos: ['hat'], emotion: 'meh', move: 'nod', seconds: 1.6 },
    { eyes: 'open', mouth: 'smile', pictos: ['hat', 'note'], emotion: 'happy', move: 'bow', seconds: 1.6 },
    { eyes: 'sleepy', mouth: 'smile', pictos: ['hat', 'star'], emotion: 'ooh', move: 'pose', seconds: 1.6 },
  ),
  // Dreamily tries to look up at it and drifts in a circle.
  moth: three(
    { eyes: 'sleepy', mouth: 'o', pictos: ['hat', 'question'], emotion: 'ooh', move: 'spin', seconds: 1.8 },
    {
      eyes: 'happy',
      mouth: 'smile',
      blush: true,
      pictos: ['hat'],
      emotion: 'happy',
      move: 'wiggle',
      seconds: 1.8,
    },
    { eyes: 'wide', mouth: 'o', pictos: ['star'], emotion: 'ooh', move: 'none', seconds: 1.8 },
  ),
};

/** The camera comes out (M11 photo mode): Buzzby poses briskly, Fiddle sulks, Luma drifts in. */
export const CAMERA_NEW: Readonly<Record<NewArt, Triple>> = {
  bee: three(
    { eyes: 'open', mouth: 'grin', pictos: ['star'], emotion: 'happy', move: 'pose', seconds: 2.6 },
    { eyes: 'squint', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 2.6 },
    {
      eyes: 'happy',
      mouth: 'grin',
      pictos: ['star', 'note'],
      emotion: 'happy',
      move: 'wiggle',
      seconds: 2.6,
    },
  ),
  cricket: three(
    { eyes: 'squint', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'pose', seconds: 2.6 },
    { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'bow', seconds: 2.6 },
    { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', move: 'none', seconds: 2.6 },
  ),
  moth: three(
    { eyes: 'sleepy', mouth: 'smile', pictos: ['star'], emotion: 'ooh', move: 'pose', seconds: 2.6 },
    { eyes: 'wide', mouth: 'o', pictos: ['sun'], emotion: 'ooh', move: 'none', seconds: 2.6 },
    {
      eyes: 'happy',
      mouth: 'grin',
      blush: true,
      pictos: ['heart'],
      emotion: 'happy',
      move: 'spin',
      seconds: 2.6,
    },
  ),
};

/** Grab, poke, fling, landing, water, and stink, for the music bugs (section 4, their profiles). */
export const PERSONAL_NEW: Readonly<Record<NewArt, Record<Classic, Triple>>> = {
  // Buzzby: busy, bossy, organized.
  bee: {
    grab: three(
      { eyes: 'angry', mouth: 'teeth', pictos: ['exclaim', 'grr'], emotion: 'grumpy', move: 'shake_head' },
      { eyes: 'open', mouth: 'flat', pictos: ['dots'], emotion: 'meh' },
      { eyes: 'worried', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'wiggle' },
    ),
    poke: three(
      { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', move: 'stomp', seconds: 1 },
      {
        eyes: 'squint',
        mouth: 'flat',
        pictos: ['exclaim'],
        emotion: 'grumpy',
        move: 'shake_head',
        seconds: 1,
      },
      { eyes: 'open', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'nod', seconds: 1 },
    ),
    // Buzzes crossly and flies back on her own.
    fling: three(
      { eyes: 'angry', mouth: 'teeth', pictos: ['grr', 'exclaim'], emotion: 'grumpy' },
      { eyes: 'wide', mouth: 'whee', pictos: ['exclaim'], emotion: 'whee' },
      { eyes: 'squint', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', move: 'shake_head' },
    ),
    land: three(
      { eyes: 'squint', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'shake_off', seconds: 1.4 },
      { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.4 },
      { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', move: 'stomp', seconds: 1.4 },
    ),
    // Sputters, shakes, and her fuzz frizzes.
    splash: three(
      {
        eyes: 'x',
        mouth: 'wobble',
        pictos: ['drop', 'exclaim'],
        emotion: 'scared',
        fx: 'splash',
        seconds: 1.6,
      },
      { eyes: 'worried', mouth: 'o', pictos: ['drop'], emotion: 'scared', fx: 'splash', seconds: 1.6 },
      {
        eyes: 'angry',
        mouth: 'teeth',
        pictos: ['drop', 'grr'],
        emotion: 'grumpy',
        fx: 'splash',
        seconds: 1.6,
      },
    ),
    shake_dry: three(
      { eyes: 'squint', mouth: 'flat', pictos: ['drop'], emotion: 'meh', move: 'shake_off', fx: 'spray' },
      { eyes: 'x', mouth: 'wobble', pictos: ['swirl'], emotion: 'dizzy', move: 'shake_off', fx: 'spray' },
      { eyes: 'open', mouth: 'smile', pictos: ['star'], emotion: 'happy', move: 'shake_off', fx: 'spray' },
    ),
    stink: three(
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink', 'cross'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
      },
      {
        eyes: 'angry',
        mouth: 'teeth',
        pictos: ['stink', 'grr'],
        emotion: 'grumpy',
        move: 'stomp',
        fx: 'stink',
      },
      {
        eyes: 'squint',
        mouth: 'puff',
        tint: 'green',
        pictos: ['stink'],
        emotion: 'yuck',
        move: 'cower',
        fx: 'stink',
      },
    ),
  },
  // Fiddle: a moody musician.
  cricket: {
    grab: three(
      { eyes: 'squint', mouth: 'frown', pictos: ['dots'], emotion: 'grumpy' },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', move: 'shiver' },
      { eyes: 'angry', mouth: 'flat', pictos: ['grr'], emotion: 'grumpy', move: 'shake_head' },
    ),
    // Interrupted: he stops and stares at the hand.
    poke: three(
      { eyes: 'angry', mouth: 'flat', pictos: ['dots'], emotion: 'grumpy', move: 'none', seconds: 1.4 },
      {
        eyes: 'squint',
        mouth: 'frown',
        pictos: ['exclaim'],
        emotion: 'grumpy',
        move: 'shake_head',
        seconds: 1.2,
      },
      { eyes: 'open', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'none', seconds: 1.2 },
    ),
    // Holds a long note all the way down.
    fling: three(
      { eyes: 'squint', mouth: 'o', pictos: ['note'], emotion: 'ooh' },
      { eyes: 'wide', mouth: 'aah', pictos: ['note', 'exclaim'], emotion: 'whee' },
      { eyes: 'sleepy', mouth: 'o', pictos: ['note', 'note'], emotion: 'ooh' },
    ),
    land: three(
      { eyes: 'squint', mouth: 'flat', pictos: ['dots'], emotion: 'meh', move: 'bow', seconds: 1.4 },
      { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'nod', seconds: 1.4 },
      { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', seconds: 1.4 },
    ),
    // A sad violin slide.
    splash: three(
      {
        eyes: 'worried',
        mouth: 'frown',
        pictos: ['drop', 'note'],
        emotion: 'meh',
        fx: 'splash',
        seconds: 1.8,
      },
      { eyes: 'sleepy', mouth: 'wobble', pictos: ['drop'], emotion: 'meh', fx: 'splash', seconds: 1.8 },
      { eyes: 'x', mouth: 'o', pictos: ['drop', 'note'], emotion: 'scared', fx: 'splash', seconds: 1.8 },
    ),
    shake_dry: three(
      { eyes: 'squint', mouth: 'flat', pictos: ['drop'], emotion: 'meh', move: 'shake_off', fx: 'spray' },
      { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', move: 'shake_off', fx: 'spray' },
      { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'shake_off', fx: 'spray' },
    ),
    stink: three(
      {
        eyes: 'squint',
        mouth: 'frown',
        tint: 'green',
        pictos: ['stink'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
      },
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
        eyes: 'angry',
        mouth: 'flat',
        pictos: ['stink', 'grr'],
        emotion: 'grumpy',
        move: 'none',
        fx: 'stink',
      },
    ),
  },
  // Luma: dreamy and easily distracted.
  moth: {
    grab: three(
      { eyes: 'sleepy', mouth: 'o', pictos: ['question'], emotion: 'sleepy' },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', move: 'shiver' },
      { eyes: 'happy', mouth: 'smile', pictos: ['heart'], emotion: 'happy' },
    ),
    poke: three(
      {
        eyes: 'sleepy',
        mouth: 'o',
        pictos: ['zzz', 'exclaim'],
        emotion: 'sleepy',
        move: 'shiver',
        seconds: 1.2,
      },
      { eyes: 'wide', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'none', seconds: 1.2 },
      { eyes: 'happy', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', move: 'wiggle', seconds: 1.2 },
    ),
    // Flutters and recovers in the air.
    fling: three(
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'ooh' },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['star'], emotion: 'whee' },
      { eyes: 'happy', mouth: 'whee', pictos: ['heart'], emotion: 'whee' },
    ),
    land: three(
      { eyes: 'sleepy', mouth: 'smile', pictos: ['dots'], emotion: 'sleepy', seconds: 1.4 },
      { eyes: 'open', mouth: 'o', pictos: ['question'], emotion: 'question', seconds: 1.4 },
      { eyes: 'happy', mouth: 'smile', pictos: ['star'], emotion: 'happy', move: 'wiggle', seconds: 1.4 },
    ),
    // Wings get soggy; she walks about dripping.
    splash: three(
      { eyes: 'worried', mouth: 'wobble', pictos: ['drop'], emotion: 'meh', fx: 'splash', seconds: 1.8 },
      {
        eyes: 'sleepy',
        mouth: 'frown',
        pictos: ['drop', 'dots'],
        emotion: 'meh',
        fx: 'splash',
        seconds: 1.8,
      },
      {
        eyes: 'wide',
        mouth: 'o',
        pictos: ['drop', 'exclaim'],
        emotion: 'scared',
        fx: 'splash',
        seconds: 1.8,
      },
    ),
    // Shakes like a dog.
    shake_dry: three(
      { eyes: 'squint', mouth: 'grin', pictos: ['drop'], emotion: 'giggle', move: 'shake_off', fx: 'spray' },
      { eyes: 'x', mouth: 'wobble', pictos: ['swirl'], emotion: 'dizzy', move: 'shake_off', fx: 'spray' },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['drop'], emotion: 'sleepy', move: 'shake_off', fx: 'spray' },
    ),
    stink: three(
      {
        eyes: 'x',
        mouth: 'tongue',
        tint: 'green',
        pictos: ['stink'],
        emotion: 'yuck',
        move: 'cower',
        fx: 'stink',
      },
      {
        eyes: 'worried',
        mouth: 'puff',
        tint: 'green',
        pictos: ['stink', 'sweat'],
        emotion: 'yuck',
        move: 'shake_head',
        fx: 'stink',
      },
      { eyes: 'sleepy', mouth: 'frown', pictos: ['stink', 'zzz'], emotion: 'sleepy', fx: 'stink' },
    ),
  },
};

/** Sniffing, gawking, playing, and showing off, for the music bugs. */
export const EVERYDAY_NEW: Readonly<Record<NewArt, Record<Everyday, Triple>>> = {
  bee: {
    inspect: three(
      { eyes: 'open', mouth: 'flat', pictos: ['question'], emotion: 'question', move: 'sniff', seconds: 1.3 },
      { eyes: 'squint', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.3 },
      {
        eyes: 'squint',
        mouth: 'frown',
        pictos: ['thumbs_down'],
        emotion: 'grumpy',
        move: 'shake_head',
        seconds: 1.3,
      },
    ),
    gawk: three(
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', seconds: 1.2 },
      { eyes: 'angry', mouth: 'flat', pictos: ['grr'], emotion: 'grumpy', move: 'shake_head', seconds: 1.2 },
      { eyes: 'happy', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', seconds: 1.2 },
    ),
    play: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['note', 'star'],
        emotion: 'happy',
        move: 'spin',
        seconds: 1.2,
      },
      { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.2 },
      { eyes: 'squint', mouth: 'grin', pictos: ['note'], emotion: 'happy', move: 'wiggle', seconds: 1.2 },
    ),
    show_off: three(
      { eyes: 'squint', mouth: 'grin', pictos: ['star'], emotion: 'happy', move: 'pose', seconds: 2 },
      { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'spin', seconds: 2 },
      { eyes: 'happy', mouth: 'grin', pictos: ['star', 'note'], emotion: 'happy', move: 'bow', seconds: 2 },
    ),
  },
  cricket: {
    inspect: three(
      {
        eyes: 'squint',
        mouth: 'flat',
        pictos: ['question'],
        emotion: 'question',
        move: 'sniff',
        seconds: 1.5,
      },
      { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'nod', seconds: 1.5 },
      {
        eyes: 'squint',
        mouth: 'frown',
        pictos: ['thumbs_down'],
        emotion: 'grumpy',
        move: 'shake_head',
        seconds: 1.5,
      },
    ),
    gawk: three(
      { eyes: 'squint', mouth: 'flat', pictos: ['dots'], emotion: 'meh', seconds: 1.3 },
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', seconds: 1.3 },
      { eyes: 'angry', mouth: 'frown', pictos: ['grr'], emotion: 'grumpy', seconds: 1.3 },
    ),
    play: three(
      {
        eyes: 'sleepy',
        mouth: 'smile',
        pictos: ['note', 'note'],
        emotion: 'happy',
        move: 'bow',
        seconds: 1.4,
      },
      { eyes: 'open', mouth: 'smile', pictos: ['note'], emotion: 'happy', move: 'nod', seconds: 1.4 },
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['star', 'note'],
        emotion: 'happy',
        move: 'pose',
        seconds: 1.4,
      },
    ),
    show_off: three(
      { eyes: 'sleepy', mouth: 'smile', pictos: ['note'], emotion: 'ooh', move: 'bow', seconds: 2.2 },
      { eyes: 'squint', mouth: 'flat', pictos: ['star'], emotion: 'meh', move: 'pose', seconds: 2.2 },
      { eyes: 'open', mouth: 'grin', pictos: ['note', 'star'], emotion: 'happy', move: 'bow', seconds: 2.2 },
    ),
  },
  moth: {
    inspect: three(
      { eyes: 'sleepy', mouth: 'o', pictos: ['question'], emotion: 'question', move: 'sniff', seconds: 1.6 },
      { eyes: 'happy', mouth: 'smile', pictos: ['heart'], emotion: 'happy', move: 'nod', seconds: 1.6 },
      {
        eyes: 'worried',
        mouth: 'frown',
        pictos: ['thumbs_down'],
        emotion: 'meh',
        move: 'shake_head',
        seconds: 1.6,
      },
    ),
    gawk: three(
      { eyes: 'wide', mouth: 'o', pictos: ['exclaim'], emotion: 'gasp', seconds: 1.4 },
      { eyes: 'sleepy', mouth: 'o', pictos: ['dots'], emotion: 'ooh', seconds: 1.4 },
      { eyes: 'happy', mouth: 'grin', pictos: ['laugh'], emotion: 'giggle', seconds: 1.4 },
    ),
    play: three(
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['heart', 'star'],
        emotion: 'happy',
        move: 'spin',
        seconds: 1.4,
      },
      { eyes: 'sleepy', mouth: 'smile', pictos: ['star'], emotion: 'happy', move: 'wiggle', seconds: 1.4 },
      { eyes: 'open', mouth: 'smile', pictos: ['thumbs_up'], emotion: 'happy', move: 'nod', seconds: 1.4 },
    ),
    show_off: three(
      { eyes: 'sleepy', mouth: 'smile', pictos: ['star'], emotion: 'ooh', move: 'spin', seconds: 2.2 },
      {
        eyes: 'happy',
        mouth: 'grin',
        pictos: ['heart', 'star'],
        emotion: 'happy',
        move: 'pose',
        seconds: 2.2,
      },
      { eyes: 'open', mouth: 'smile', pictos: ['moon'], emotion: 'ooh', move: 'bow', seconds: 2.2 },
    ),
  },
};
