// The bug AI's tuning: timings, ranges, and weights from the design doc
// (section 5), shared by bugAi.ts, bugChoose.ts, and bugStates.ts.
import type { NeedId } from '../data/types';
import type { Liking } from '../events';
import type { SocialKind } from '../core/entities';
import { SOCIAL_KINDS } from '../core/entities';
import { SIM_HZ } from '../core/loop';

/** Chewing time before swallowing, or before spitting out disliked food. */
export const CHEW_TICKS: Readonly<Record<Liking, number>> = {
  loved: 100,
  liked: 90,
  neutral: 90,
  disliked: 50,
};
/** How long the reaction after a meal lasts. */
export const FED_REACT_TICKS: Readonly<Record<Liking, number>> = {
  loved: 120,
  liked: 84,
  neutral: 66,
  disliked: 110,
};
/** Glorp spinning in his shell after a hard landing. */
export const SHELL_TICKS = 150;
export const GRUMPY_TICKS = 8 * SIM_HZ;
/** Hold-poke: laughs escalate every second, and at 3 s the bug wriggles free. */
export const TICKLE_LEVEL_TICKS = SIM_HZ;
export const TICKLE_FREE_TICKS = 3 * SIM_HZ;
/** A shaken bug is woozy for 1 s. */
export const WOOZY_TICKS = SIM_HZ;
/** A full belly burps a moment after the last bite. */
export const BURP_DELAY = 70;
/** Hunger at or above this after a meal means a burp. */
export const FULL_BELLY = 95;
export const LANDING_TICKS = 10;
export const RECOVER_TICKS = 40;
export const REACT_TICKS = 36;
export const HOP_TRIES = 3;
export const REPEAT_WINDOW = 10 * SIM_HZ;
export const RECENT_USE = 60 * SIM_HZ;
export const RECENT_KIND = 90 * SIM_HZ;

export const WANDER_RANGE = 6;
/** Deeper than this in water, a bug that cannot skate starts swimming. */
export const SWIM_DEPTH = 0.35;
/** Shaking itself dry takes this long. */
export const SHAKE_DRY_TICKS = 72;
/** A bug reacts to a smell at most this often. */
export const SMELL_EVERY = 10 * SIM_HZ;
export const STINK_REACT_TICKS = 84;
/** Walks this far away from a stink it dislikes. */
export const STINK_FLEE = 4;
/** How far a bug notices adverts: 900 px (game design doc, section 5). */
export const PERCEPTION = 9;
export const TUMBLE_SPEED = 3.5;
export const SCORE_FLOOR = 8;
/** Food held within this range (m) gets a bug's attention. */
export const OFFER_RANGE = 2.5;
/** Something the player just brought stays new and interesting this long. */
export const FRESH_TICKS = 60 * SIM_HZ;
/** How much extra a fresh thing scores, scaled by curiosity. */
export const FRESH_BONUS = 20;
/** Sniffing something new takes 1.3 to 2.2 s. */
export const INSPECT_TICKS: readonly [number, number] = [80, 130];
/** Asleep, a bump this hard (m/s) wakes a bug up. */
export const WAKE_IMPACT = 6;
/** Woken early, a bug is groggy for 3 s and nods off again 20 s later if still tired. */
export const GROGGY_TICKS = 3 * SIM_HZ;
export const RENAP_TICKS = 20 * SIM_HZ;
/** Woken by the player (a poke, a grab, food at its nose), a bug stays up this long before it may nod off (P-14). */
export const STAY_UP_TICKS = 60 * SIM_HZ;
/** Food held this close (m) to a sleeping bug's middle wakes it. */
export const SNIFF_WAKE = 1.2;
/** Rested enough to wake up on its own. */
export const RESTED = 99.5;
/** Dot poses this long at the top before she leaps. */
export const POSE_TICKS = 120;
/** Dot comes into view to pose after being ignored this long. */
export const IGNORED_TICKS = 90 * SIM_HZ;
/** Rollo curls up after three pokes this close together, or a fall this far (m). */
export const POKE_WINDOW = 90;
export const CURL_FALL = 3;
/** Where Rollo lines up pebbles: slots this far apart, starting at his resting spot. */
export const ROW_GAP = 0.55;
export const ROW_SLOTS = 6;
/** Crowd-shy bugs drift away from this many bugs this close. */
export const CROWD = 4;
export const CROWD_RANGE = 2.5;
/** Loud things this close make idle bugs turn and look. */
export const GAWK_RANGE = 7;
/** Spots for pebbles on their way to the row. */
export const SPOT_ROW = -5;
/** Beside a friend, where a snack gets carried to be eaten in company. */
export const SPOT_PICNIC = -6;
/** A dance on the stage lasts 6 to 10 s. */
export const DANCE_TICKS: readonly [number, number] = [6 * SIM_HZ, 10 * SIM_HZ];
/** Barty rolls a ball this far before leaving it be. */
export const ROLL_WALK: readonly [number, number] = [3, 6];
/** The hand this near makes a shy bug (Twig) freeze. */
export const SHY_RANGE = 2.5;
/** Prim chops at floating things this close in front of her. */
export const CHOP_REACH = 1.4;
/** How often a sociable bug takes its snack over to a friend. */
export const PICNIC_CHANCE = 0.3;

export const FOOD_DELTA: Readonly<Record<Liking, number>> = {
  loved: 60,
  liked: 40,
  neutral: 20,
  disliked: 0,
};
export const LIKE_MULTIPLIER: Readonly<Record<Liking, number>> = {
  loved: 2,
  liked: 1.5,
  neutral: 1,
  disliked: 0.2,
};
/** What each social interaction offers, before affinity (section 5: social +15 to +30). */
export const SOCIAL_NEEDS: Readonly<Record<SocialKind, Readonly<Partial<Record<NeedId, number>>>>> = {
  soc_chat: { need_social: 25, need_fun: 4 },
  soc_bump: { need_social: 16, need_fun: 8 },
  soc_tag: { need_social: 18, need_fun: 26 },
  soc_share_food: { need_social: 26 },
  soc_catch: { need_social: 18, need_fun: 30 },
  soc_comfort: { need_social: 22 },
  soc_steal: { need_hunger: 25, need_fun: 18 },
  soc_ride: { need_social: 12, need_fun: 22 },
};
export const SOCIAL_SET: ReadonlySet<string> = new Set(SOCIAL_KINDS);
