import type { BugMode, Needs } from '../../../game/core/entities';
import type { BugArt } from '../../../game/data/types';

export type EyeShape = 'open' | 'happy' | 'wide' | 'squint' | 'spiral' | 'sleepy' | 'worried';
export type MouthShape = 'smile' | 'grin' | 'o' | 'chew' | 'wobble' | 'flat' | 'frown' | 'whee';

/** What the bug's whole body is doing, beyond its face. */
export type BodyForm = 'normal' | 'curled' | 'in_shell' | 'flying';

export interface BugFace {
  eyes: EyeShape;
  mouth: MouthShape;
  form: BodyForm;
  /** Pink blush, for giggles and delight. */
  blush: boolean;
}

export interface BugFaceInput {
  art: BugArt;
  mode: BugMode;
  needs: Needs;
  /** Seconds, for chewing. */
  time: number;
  /** Does this bug enjoy being flung? */
  likesFlinging: boolean;
}

/**
 * Pick an expression and body form from what the bug is doing. Every state
 * gets a readable face within one frame (game design doc, pillar 1). Pure.
 */
export function bugFace(input: BugFaceInput): BugFace {
  const { art, mode, needs } = input;
  const face = (eyes: EyeShape, mouth: MouthShape, form: BodyForm = 'normal', blush = false): BugFace => ({
    eyes,
    mouth,
    form,
    blush,
  });

  switch (mode) {
    case 'st_held':
      if (input.likesFlinging) return face('happy', 'grin', 'normal', true);
      if (art === 'snail') return face('wide', 'o');
      return face('worried', 'o');
    case 'st_airborne':
      if (art === 'pillbug') return face('squint', 'o', 'curled');
      if (art === 'snail') return face('wide', 'o', 'in_shell');
      return face('wide', 'whee', input.likesFlinging ? 'flying' : 'normal', input.likesFlinging);
    case 'st_use':
      return face('happy', 'whee', art === 'ladybug' ? 'flying' : 'normal', true);
    case 'st_landing':
      return face('squint', 'o');
    case 'st_dizzy':
      return face('spiral', 'wobble');
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
  if (needs.need_energy < 20) return face('sleepy', 'flat');
  if (needs.need_hunger < 25) return face(art === 'pillbug' ? 'worried' : 'open', 'frown');
  if (needs.need_fun < 25) return face('sleepy', 'flat');
  const happy = (needs.need_hunger + needs.need_fun + needs.need_energy) / 3 >= 65;
  if (art === 'pillbug') return face('worried', happy ? 'smile' : 'flat');
  return face('open', happy ? 'grin' : 'smile');
}
