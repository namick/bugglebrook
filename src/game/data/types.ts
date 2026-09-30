/**
 * Content definition types. All content lives in typed registries keyed by
 * snake_case IDs. Definitions are plain data: no functions, no classes.
 */

/** 0xRRGGBB color. */
export type Color = number;

/** A point [x, y] in meters. */
export type Point2 = readonly [number, number];

/** Something placed in an area when a new world starts. */
export interface StartEntity {
  kind: 'bug' | 'item';
  defId: string;
  /** Area-local x in meters. */
  x: number;
  /** Height of the object's bottom above the terrain surface, in meters. Default 0. */
  lift?: number;
}

export interface AreaDef {
  id: string;
  name: string;
  /** Left edge in world meters. Areas tile the world left to right. */
  xStart: number;
  /** Right edge in world meters. */
  xEnd: number;
  /**
   * The walkable surface as a polyline of [area-local x, world y] points,
   * left to right, from x = 0 to the area's width. Everything below it is
   * solid ground. Bugs walk along it, so it must be a height field.
   */
  terrain: readonly Point2[];
  /** What a new world puts here. */
  start: readonly StartEntity[];
  /**
   * Consumable items that drop back in when the area runs low, so the
   * player never runs out of basics. Counts are the target amount.
   */
  respawn: readonly { item: string; count: number }[];
  skyTop: Color;
  skyBottom: Color;
  /** Moss or grass on top of the ground. */
  ground: Color;
  groundDark: Color;
  /** Soil under the moss. */
  dirt: Color;
  dirtDark: Color;
  unlockedByDefault: boolean;
}

export type NeedId = 'need_hunger' | 'need_fun' | 'need_energy';
export const NEED_IDS: readonly NeedId[] = ['need_hunger', 'need_fun', 'need_energy'];

export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** How a bug's gibberish sounds (see the game design doc, section 16). */
export interface VoiceProfile {
  wave: Wave;
  /** Pitch range in Hz. */
  low: number;
  high: number;
  syllablesPerSecond: number;
  vibratoHz: number;
  vibratoDepth: number;
  /** Multiplier on vowel formants. Bigger bugs sound lower. */
  formantShift: number;
}

export type BugArt = 'ladybug' | 'pillbug' | 'snail';

export interface BugDef {
  id: string;
  name: string;
  species: string;
  art: BugArt;
  size: 'small' | 'medium' | 'large';
  /** Collision radius in meters. */
  radius: number;
  /** Walking speed in meters per second. */
  speed: number;
  /** Main body or shell color. */
  body: Color;
  /** Secondary color: belly, head, or foot. */
  belly: Color;
  /** Accent: spots, bands, or the shell swirl. */
  accent: Color;
  /** Hidden bugs start locked and are found through secrets. */
  hidden: boolean;
  home: string;
  /** Personality knobs that the AI reads. 0 to 1. */
  traits: { restless: number; bouncy: number };
  /** Multiplies need decay and urgency. 0.5 to 1.5. */
  needWeights: Readonly<Record<NeedId, number>>;
  /** Item IDs this bug loves, likes, or dislikes. Anything else is neutral. */
  loves: readonly string[];
  likes: readonly string[];
  dislikes: readonly string[];
  /** Enjoys being flung: gains fun from it. */
  likesFlinging: boolean;
  /** Curls into a rolling ball while airborne (Rollo). */
  curlsWhenFlung: boolean;
  voice: VoiceProfile;
}

export type ItemShape = { type: 'circle'; radius: number } | { type: 'box'; width: number; height: number };

export type MaterialId =
  'mat_wood' | 'mat_stone' | 'mat_metal' | 'mat_rubber' | 'mat_glass' | 'mat_leaf' | 'mat_food';

/** How the renderer draws an item. */
export type ItemArt =
  'bottle_cap' | 'marble' | 'pebble' | 'ruler' | 'spring' | 'ball' | 'berry' | 'twig' | 'leaf';

export type AdvertAction = 'eat' | 'bounce';

/** What an object offers a bug (game design doc, section 5). */
export interface Advert {
  action: AdvertAction;
  /** Expected need change per use. */
  needs: Readonly<Partial<Record<NeedId, number>>>;
}

export interface ItemDef {
  id: string;
  name: string;
  shape: ItemShape;
  material: MaterialId;
  density: number;
  friction: number;
  restitution: number;
  /** Air drag. Leaves flutter down slowly. */
  linearDamping?: number;
  /** Spin drag. Lumpy pebbles stop rolling quickly; marbles do not. */
  angularDamping?: number;
  art: ItemArt;
  color: Color;
  accent: Color;
  tags: readonly string[];
  adverts: readonly Advert[];
  /** Springs launch whatever lands on their top at this speed (m/s). */
  launchSpeed?: number;
}

export interface RecipeDef {
  id: string;
  /** Two item IDs, order-insensitive. */
  inputs: readonly [string, string];
  output: string;
}

export interface PotionDef {
  id: string;
  name: string;
  color: Color;
  effect: 'float' | 'grow' | 'shrink' | 'stink' | 'paint';
  /** Duration in sim ticks. */
  durationTicks: number;
}

export type SecretTrigger =
  | { type: 'bug_holds_item'; bug: string; item: string; area: string }
  | { type: 'recipe'; recipe: string }
  | { type: 'potion_on_bug'; potion: string; bug: string };

export interface SecretDef {
  id: string;
  name: string;
  trigger: SecretTrigger;
  /** Content unlocked when found. */
  unlocks: readonly { kind: 'bug' | 'area' | 'item'; id: string }[];
}
