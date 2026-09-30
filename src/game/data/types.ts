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
  /** Start floating on the area's water instead of on the ground. */
  onWater?: boolean;
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
  /** A pond: a water volume in a dip of the terrain. */
  water?: WaterDef;
  /** Things built into the area that are not entities: taps, lily pads, the boot. */
  fixtures?: readonly FixtureDef[];
}

/**
 * Water in an area (game design doc, section 3, `fix_pond_water`). The
 * surface is flat at `level`; its left and right edges are where the
 * terrain rises above it, searched between `x0` and `x1`.
 */
export interface WaterDef {
  /** Area-local x range that holds the basin, in meters. */
  x0: number;
  x1: number;
  /** World y of the resting surface. */
  level: number;
  /** How far the hose can raise the level, in meters. */
  maxRise: number;
  /** Surface current in m/s (positive drifts floaters right). */
  current: number;
}

export type FixtureKind = 'hose_tap' | 'lily_pad' | 'rubber_boot';

/** A fixed part of an area. Positions are area-local x and world y, in meters. */
export interface FixtureDef {
  id: string;
  kind: FixtureKind;
  x: number;
  y: number;
  /** Click radius in meters, for clickable fixtures. */
  radius: number;
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

export type BugArt = 'ladybug' | 'pillbug' | 'snail' | 'strider';

/**
 * How a bug copes with water (game design doc, section 5, `st_swim`):
 * paddles at the surface, floats like a boat, sinks and walks the bottom,
 * or skates on top.
 */
export type SwimStyle = 'paddle' | 'boat' | 'sink' | 'skate';

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
  /**
   * Never gets dizzy. A hard landing sends it into its shell to spin like a
   * top instead (Glorp).
   */
  dizzyProof: boolean;
  /**
   * Where food goes in: the mouth anchor, in meters from the body center
   * while facing right. Drop targets and the mouth glow use it.
   */
  mouth: Point2;
  /** Curls into a rolling ball while airborne (Rollo). */
  curlsWhenFlung: boolean;
  /** Spreads out like a parachute and floats down when flung (Skeet). */
  glidesWhenFlung: boolean;
  swim: SwimStyle;
  /** Sniffs stink clouds happily instead of holding its nose. */
  likesStink: boolean;
  voice: VoiceProfile;
}

export type ItemShape = { type: 'circle'; radius: number } | { type: 'box'; width: number; height: number };

export type MaterialId =
  | 'mat_wood'
  | 'mat_stone'
  | 'mat_metal'
  | 'mat_rubber'
  | 'mat_glass'
  | 'mat_leaf'
  | 'mat_cloth'
  | 'mat_paper'
  | 'mat_plastic'
  | 'mat_food'
  | 'mat_jelly'
  | 'mat_shell';

/** Default physics and tags per material (game design doc, section 6). */
export interface MaterialDef {
  /** Water is 1. */
  density: number;
  restitution: number;
  friction: number;
  tags: readonly string[];
}

/** How the renderer draws an item. */
export type ItemArt =
  | 'bottle_cap'
  | 'marble'
  | 'pebble'
  | 'ruler'
  | 'spring'
  | 'ball'
  | 'berry'
  | 'twig'
  | 'leaf'
  | 'sugar_cube'
  | 'mint_leaf'
  | 'pepper'
  | 'banana_mush'
  | 'moss_tuft'
  | 'jelly_bean'
  | 'blueberry'
  | 'cork'
  | 'leaf_raft'
  | 'paper_boat'
  | 'sponge'
  | 'soap'
  | 'bubble_wand'
  | 'feather'
  | 'gum_blob'
  | 'magnet';

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
  /**
   * Water it pushes aside per unit of its own volume. Rafts and boats are
   * hollow, so they float far higher than their material alone. Default 1.
   */
  hull?: number;
  /** Seconds soaking in water before it gets soggy and sinks (paper). */
  soggyAfter?: number;
  /** A magnet: pulls `tag_magnetic` things within 2.5 m this hard (m/s² at 1 m). */
  magnet?: number;
  /** Waved through the air while wet or soapy, it blows a trail of bubbles. */
  blowsBubbles?: boolean;
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
