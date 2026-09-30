import type { BugMode, Needs } from '../../../game/core/entities';
import type { BugArt } from '../../../game/data/types';
import type { Liking, Mood } from '../../../game/events';

export type EyeShape =
  'open' | 'happy' | 'wide' | 'squint' | 'spiral' | 'sleepy' | 'worried' | 'heart' | 'angry' | 'x';
export type MouthShape =
  | 'smile'
  | 'grin'
  | 'o'
  | 'chew'
  | 'wobble'
  | 'flat'
  | 'frown'
  | 'whee'
  | 'aah'
  | 'lick'
  | 'tongue'
  | 'teeth'
  | 'puff';

/** A color wash over the face: green when grossed out, red when hot. */
export type FaceTint = 'green' | 'red' | null;

/** What the bug's whole body is doing, beyond its face. */
export type BodyForm = 'normal' | 'curled' | 'in_shell' | 'flying';

export interface BugFace {
  eyes: EyeShape;
  mouth: MouthShape;
  form: BodyForm;
  /** Pink blush, for giggles and delight. */
  blush: boolean;
  tint: FaceTint;
  /** Little steam puffs over the head (grumpy). */
  steam: boolean;
}

/** A face the current reaction wants to show (from the reaction table). */
export interface FaceOverride {
  eyes: EyeShape;
  mouth: MouthShape;
  blush: boolean;
  tint: FaceTint;
  form: BodyForm | null;
}

export interface BugFaceInput {
  art: BugArt;
  mode: BugMode;
  needs: Needs;
  /** Seconds, for chewing. */
  time: number;
  /** Does this bug enjoy being flung? */
  likesFlinging: boolean;
  /** Airborne by its own hop rather than thrown. */
  selfLaunched?: boolean;
  mood?: Mood;
  /** A reaction that is showing right now. */
  reaction?: FaceOverride | null;
  /** How the bug feels about what it is chewing. */
  chewing?: Liking | null;
  /** Food held near its mouth, and how it feels about it. */
  offered?: Liking | null;
  /** Being tickled (0 to 1, how hard it is laughing). */
  tickle?: number;
  /** Shaken and woozy. */
  woozy?: boolean;
  /** Startled by the cursor whooshing past. */
  flinch?: boolean;
  /** Never dizzy: hides in its shell instead (Glorp). */
  dizzyProof?: boolean;
  /** Frozen solid in a block of ice. */
  frozen?: boolean;
  /** Just woken and still groggy. */
  groggy?: boolean;
  /** Gliding down on open wings (Dot). */
  gliding?: boolean;
  /** Saying a line in a chat right now. */
  talking?: boolean;
  /** Sniffing something new (`st_use` with `inspect`). */
  sniffing?: boolean;
}

/**
 * Pick an expression and body form from what the bug is doing. Every state
 * gets a readable face within one frame (game design doc, pillar 1). Pure.
 * Order matters: dizziness and tickles beat reactions, reactions beat
 * chewing, chewing beats the plain state face, and mood fills in the rest.
 */
export function bugFace(input: BugFaceInput): BugFace {
  const { mode } = input;
  const face = (
    eyes: EyeShape,
    mouth: MouthShape,
    form: BodyForm = 'normal',
    blush = false,
    tint: FaceTint = null,
    steam = false,
  ): BugFace => ({ eyes, mouth, form, blush, tint, steam });

  if (input.frozen) return face('wide', 'o', input.art === 'snail' ? 'in_shell' : 'normal', true);
  if (mode === 'st_dizzy') return face('spiral', 'wobble');
  if (mode === 'st_sleep') {
    // Snoozing: eyes shut (the pose closes them), a little open mouth for snores.
    const snore = Math.sin(input.time * 1.4) > 0.3;
    const form = input.art === 'snail' ? 'in_shell' : input.art === 'pillbug' ? 'curled' : 'normal';
    return face('sleepy', snore ? 'o' : 'smile', form);
  }
  if (mode === 'st_rolled') return face('squint', 'o', input.art === 'pillbug' ? 'curled' : 'normal');
  if (input.woozy)
    return input.dizzyProof ? face('wide', 'o', 'in_shell') : face('spiral', 'wobble', 'normal', true);
  if (mode === 'st_held' && (input.tickle ?? 0) > 0) {
    const t = input.tickle ?? 0;
    return face(t > 0.66 ? 'x' : 'happy', t > 0.33 ? 'whee' : 'grin', 'normal', true);
  }
  const base = stateFace(input, face);
  const r = input.reaction;
  if (r) {
    // Curled balls and shells keep their shape; the face shows through where it can.
    const form = r.form ?? (base.form === 'normal' ? 'normal' : base.form);
    return face(r.eyes, r.mouth, form, r.blush, r.tint, r.eyes === 'angry');
  }
  if (mode === 'st_eat' && input.chewing) {
    const chomp = Math.sin(input.time * 12) > 0;
    switch (input.chewing) {
      case 'loved':
        return face('heart', chomp ? 'chew' : 'grin', 'normal', true);
      case 'liked':
        return face('happy', chomp ? 'chew' : 'lick', 'normal', true);
      case 'neutral':
        return face('open', chomp ? 'chew' : 'flat');
      case 'disliked':
        // One horrified chew, then cheeks full and turning green.
        return face('x', chomp ? 'tongue' : 'puff', 'normal', false, 'green');
    }
  }
  if (input.flinch && (mode === 'st_idle' || mode === 'st_wander' || mode === 'st_seek'))
    return face('wide', 'o', base.form);
  if (input.talking && (mode === 'st_social' || mode === 'st_idle')) {
    // Gibber-jabber: the mouth flaps while the line lasts.
    const flap = Math.sin(input.time * 22) > 0;
    return face(
      base.eyes === 'sleepy' && input.art !== 'strider' ? 'open' : base.eyes,
      flap ? 'o' : 'smile',
      base.form,
      base.blush,
    );
  }
  if (input.groggy && (mode === 'st_react' || mode === 'st_idle')) return face('sleepy', 'flat');
  if (
    input.offered &&
    (mode === 'st_idle' || mode === 'st_wander' || mode === 'st_seek' || mode === 'st_react')
  ) {
    switch (input.offered) {
      case 'loved':
        return face('heart', 'aah', 'normal', true);
      case 'liked':
        return face('happy', 'aah', 'normal', true);
      case 'neutral':
        return face('open', 'o');
      case 'disliked':
        return face('worried', 'flat');
    }
  }
  return base;
}

type Make = (
  eyes: EyeShape,
  mouth: MouthShape,
  form?: BodyForm,
  blush?: boolean,
  tint?: FaceTint,
  steam?: boolean,
) => BugFace;

function stateFace(input: BugFaceInput, face: Make): BugFace {
  const { art, mode, needs } = input;
  // Skeet is cool: half-closed eyes, even when happy.
  const cool = art === 'strider';
  switch (mode) {
    case 'st_swim':
      // Rollo holds his breath, Glorp floats shell-up, Dot sputters.
      if (art === 'pillbug') return face('squint', 'puff');
      if (art === 'snail') return face('sleepy', 'smile', 'in_shell');
      return Math.sin(input.time * 5) > 0.3 ? face('squint', 'wobble') : face('wide', 'o');
    case 'st_held':
      if (input.likesFlinging) return face('happy', 'grin', 'normal', true);
      if (art === 'snail') return face('wide', 'o');
      if (cool) return face('sleepy', 'flat');
      return face('worried', 'o');
    case 'st_airborne':
      if (input.gliding) return face('happy', 'whee', 'flying', true);
      if (input.selfLaunched)
        return face(art === 'grasshopper' ? 'happy' : 'open', art === 'grasshopper' ? 'whee' : 'o');
      if (art === 'pillbug') return face('squint', 'o', 'curled');
      if (art === 'snail') return face('wide', 'o', 'in_shell');
      if (cool) return face('wide', 'whee', 'normal', true);
      return face('wide', 'whee', input.likesFlinging ? 'flying' : 'normal', input.likesFlinging);
    case 'st_use':
      // Sniffing something new is curious; otherwise it is a spring hop.
      if (input.sniffing) return face(art === 'strider' ? 'sleepy' : 'wide', 'o');
      return face('happy', 'whee', art === 'ladybug' ? 'flying' : 'normal', true);
    case 'st_landing':
      return face('squint', 'o');
    case 'st_perform':
      return face('happy', 'grin', 'normal', true);
    case 'st_hide':
      // Peeking out from behind cover.
      return face('worried', 'o', input.art === 'snail' ? 'in_shell' : 'normal');
    case 'st_ride':
      return face('happy', 'whee', 'normal', true);
    case 'st_social':
      if (input.mood === 'mood_grumpy') break;
      return art === 'pillbug'
        ? face('worried', 'smile', 'normal', true)
        : face(cool ? 'sleepy' : 'happy', 'grin', 'normal', true);
    case 'st_recover':
      return face('open', 'smile');
    case 'st_react':
      if (art === 'ladybug') return face('happy', 'grin', 'normal', true);
      if (art === 'pillbug') return face('squint', 'frown');
      return face('sleepy', 'flat');
    case 'st_eat': {
      const chewing = Math.sin(input.time * 12) > 0;
      return face('happy', chewing ? 'chew' : 'smile', 'normal', true);
    }
    default:
      break;
  }
  switch (input.mood) {
    case 'mood_grumpy':
      return face('angry', 'frown', 'normal', false, null, true);
    case 'mood_sleepy':
      return face('sleepy', 'flat');
    case 'mood_hungry':
      return face(art === 'pillbug' ? 'worried' : 'open', 'frown');
    case 'mood_bored':
      return face('sleepy', 'flat');
    case 'mood_happy':
      if (cool) return face('sleepy', 'grin');
      return art === 'pillbug' ? face('worried', 'smile') : face('open', 'grin');
    case 'mood_content':
      if (cool) return face('sleepy', 'smile');
      return art === 'pillbug' ? face('worried', 'flat') : face('open', 'smile');
    default:
      break;
  }
  // No mood given (menus, old callers): read the needs directly.
  if (needs.need_energy < 20) return face('sleepy', 'flat');
  if (needs.need_hunger < 25) return face(art === 'pillbug' ? 'worried' : 'open', 'frown');
  if (needs.need_fun < 25) return face('sleepy', 'flat');
  const happy = (needs.need_hunger + needs.need_fun + needs.need_energy) / 3 >= 65;
  if (art === 'pillbug') return face('worried', happy ? 'smile' : 'flat');
  return face('open', happy ? 'grin' : 'smile');
}
