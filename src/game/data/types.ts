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
  /**
   * A hidden bug that is in the world before it joins the cast (game design
   * doc, section 4, "Found"): Moose stuck on his back, Barty ignoring
   * everyone, Twig pretending to be a twig. Found through its secret.
   */
  pending?: PendingState;
  /**
   * Start resting on a surface at this world y (a shelf) instead of on the
   * ground; with `pin`, this is the center's y.
   */
  y?: number;
  /** Start pinned to the pegboard at this angle (radians). */
  pin?: number;
}

/** How a hidden bug waits to be found: see `StartEntity.pending`. */
export type PendingState = 'stuck' | 'aloof' | 'disguised';

/**
 * A fixed solid part of an area that is not ground: the porch floorboards
 * overhead, shelves, the tin can wall, a slide. Static; things rest on it,
 * bump into it, and shelter under it. Area-local x, world y, in meters.
 */
export interface SolidDef {
  id: string;
  /** A box: [x0, y0, x1, y1]. */
  box?: readonly [number, number, number, number];
  /** Or an open polyline. */
  chain?: readonly Point2[];
  friction?: number;
  /** Removed when this area opens (the tin can wall swings open). */
  until?: string;
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
  /** Fixed solids: roofs, shelves, walls, slides. */
  solids?: readonly SolidDef[];
  /** A roof overhead (the porch boards, the treehouse): the sky and sun do not reach under it. */
  roof?: { x0: number; x1: number; y: number };
  /** Music and ambience hints for the renderer: how the area sounds. */
  mood: AreaMood;
}

/** The feel of an area, for its ambient sounds (game design doc, section 16). */
export type AreaMood = 'garden' | 'pond' | 'plaza' | 'porch' | 'compost' | 'arcade';

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

/**
 * Built-in parts of an area. `sundial`, `weather_vane`, and `knothole` are
 * clicked (and the sundial dragged); `puddle` is a dip rain fills; `reeds`
 * is where fireflies gather at night.
 */
export type FixtureKind =
  | 'hose_tap'
  | 'lily_pad'
  | 'rubber_boot'
  | 'teacup'
  | 'sundial'
  | 'weather_vane'
  | 'knothole'
  | 'puddle'
  | 'reeds'
  // M7 barriers: each one `opens` an area and holds an invisible `wall` until then.
  | 'sunflower'
  | 'lattice'
  | 'can_tunnel'
  | 'bucket_lift'
  // Flowerbed Stage.
  | 'stage'
  | 'stage_lights'
  | 'bluebell'
  | 'paint_puddle'
  | 'gnome'
  | 'munch_leaf'
  | 'tulip'
  // Under the Porch.
  | 'whiff_pot'
  | 'porch_lamp'
  | 'floor_gap'
  | 'cobweb'
  | 'spider'
  // Compost Lab.
  | 'compost_heap'
  | 'shelf_jar'
  // Treehouse Arcade.
  | 'pegboard'
  | 'bead_pit'
  | 'jar_claw'
  | 'claw_button'
  | 'leaf_slide'
  | 'window';

/** A fixed part of an area. Positions are area-local x and world y, in meters. */
export interface FixtureDef {
  id: string;
  kind: FixtureKind;
  x: number;
  y: number;
  /** Click radius in meters, for clickable fixtures. For the teacup, half its width. */
  radius: number;
  /** A barrier: the area it opens. */
  opens?: string;
  /** A barrier: area-local x of the invisible wall that blocks bugs and the camera until it opens. */
  wall?: number;
  /** A region's size in meters (the pegboard, the bead pit, the compost heap, the cobweb). */
  w?: number;
  h?: number;
  /** A paint puddle's color. */
  paint?: PaintId;
  /** What a shelf jar holds and refills. */
  item?: string;
}

/** The five paint puddle colors (game design doc, section 3, `fix_paint_puddles`). */
export type PaintId = 'paint_red' | 'paint_blue' | 'paint_yellow' | 'paint_white' | 'paint_black';
export const PAINT_IDS: readonly PaintId[] = [
  'paint_red',
  'paint_blue',
  'paint_yellow',
  'paint_white',
  'paint_black',
];

export type NeedId = 'need_hunger' | 'need_fun' | 'need_energy' | 'need_social' | 'need_clean';
export const NEED_IDS: readonly NeedId[] = [
  'need_hunger',
  'need_fun',
  'need_energy',
  'need_social',
  'need_clean',
];

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

export type BugArt =
  | 'ladybug'
  | 'pillbug'
  | 'snail'
  | 'strider'
  | 'grasshopper'
  | 'firefly'
  | 'stinkbug'
  | 'stagbeetle'
  | 'dungbeetle'
  | 'caterpillar'
  | 'mantis'
  | 'stickinsect';

/**
 * Personality knobs that the AI reads, 0 to 1. `curious` sniffs new things,
 * `sociable` seeks company, `cheeky` plays tag and snatches snacks,
 * `generous` shares food, `nervous` curls up or hides when startled.
 */
export interface BugTraits {
  restless: number;
  bouncy: number;
  curious: number;
  sociable: number;
  cheeky: number;
  generous: number;
  nervous: number;
}

/**
 * Signature behaviors (game design doc, section 4). Each one switches on a
 * piece of AI that only some bugs have.
 */
export interface BugHabits {
  /** Gets around by hopping in big arcs instead of walking (Boing). */
  hops?: boolean;
  /** Sometimes hops onto another bug's head and sits there (Boing). */
  ridesHeads?: boolean;
  /** Leaves a slime trail that makes other bugs slide (Glorp). */
  slimeTrail?: boolean;
  /** Lines up loose pebbles in a neat row near where he rests (Rollo). */
  rowsPebbles?: boolean;
  /** Climbs to the highest point, poses, and glides down; poses for the camera when ignored (Dot). */
  showsOff?: boolean;
  /** Drifts away from crowds of four or more (Skeet). */
  crowdShy?: boolean;
  /** Startled, he lets off a green stink cloud, then fans it away, embarrassed (Whiff). */
  stinkCloud?: boolean;
  /** Lifts heavy things over his head and frees bugs stuck in gum (Moose). */
  strong?: boolean;
  /** Rolls round things along, walking backward (Barty). */
  rollsBalls?: boolean;
  /** Nibbles leaves full of holes; after five leafy meals, a cocoon at night and a butterfly at dawn (Munch). */
  metamorphosis?: boolean;
  /** Strikes slow poses and karate-chops things floating down past her (Prim). */
  chops?: boolean;
  /** Freezes whenever the hand is near, and only moves when nobody is looking (Twig). */
  shy?: boolean;
}

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
  traits: BugTraits;
  habits: BugHabits;
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
  /** Awake by day and asleep at night, or the other way round (game design doc, section 11). */
  active: 'day' | 'night';
  /** How it feels about rain: lovers go out and splash, the rest take shelter. */
  rain: 'likes' | 'dislikes' | 'neutral';
  /** Its body glows in the dark and lights things up (Flick's tail). */
  glows?: boolean;
  /**
   * A collider other than the usual circle (Twig is a long stick). `radius`
   * stays the bug's rough half height for the AI.
   */
  collider?: { width: number; height: number };
  /** The secret that finds it, for hidden bugs. */
  foundBy?: string;
  voice: VoiceProfile;
}

/**
 * A box may be built from `parts` (a curved track, a funnel): each part is a
 * box at an offset and angle from the center. `width` and `height` are then
 * the bounds, which everything but the physics uses.
 */
export type ItemShape =
  | { type: 'circle'; radius: number }
  | { type: 'box'; width: number; height: number; parts?: readonly BoxPart[] };

export interface BoxPart {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

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
  | 'magnet'
  | 'flashlight'
  | 'moon_pebble'
  // M7: the flowerbed.
  | 'pollen_puff'
  | 'seed'
  | 'lavender'
  | 'honey_drop'
  | 'bluebell'
  | 'petal'
  // Under the porch.
  | 'lattice'
  | 'paperclip'
  | 'rubber_band'
  | 'popsicle_stick'
  | 'spool'
  | 'button'
  | 'matchbox'
  | 'straw'
  | 'toothpick'
  | 'foil_ball'
  | 'tissue'
  | 'paper_scrap'
  | 'eggshell'
  | 'battery'
  | 'tin_can'
  | 'cheese_puff'
  | 'cookie_crumb'
  | 'coin'
  // The compost lab.
  | 'apple_core'
  | 'dung_ball'
  | 'jar'
  | 'mushroom_cap'
  | 'ice_cube'
  | 'coffee_bean'
  | 'onion_ring'
  | 'fizz_candy'
  | 'compost_goo'
  // The treehouse.
  | 'track_straight'
  | 'track_curve'
  | 'funnel'
  | 'domino'
  | 'spinning_top'
  | 'yo_yo';

/**
 * What a bug can do with an advert (game design doc, section 5). Items offer
 * eat, bounce, sleep, and carry; any item a bug has not met offers inspect;
 * spots in the world offer splash and perform.
 */
export type AdvertAction =
  | 'eat'
  | 'bounce'
  | 'inspect'
  | 'sleep'
  | 'splash'
  | 'carry'
  | 'perform'
  | 'shelter'
  | 'lift'
  | 'roll'
  | 'dance';

export const ADVERT_ACTIONS: readonly AdvertAction[] = [
  'eat',
  'bounce',
  'inspect',
  'sleep',
  'splash',
  'carry',
  'perform',
  'shelter',
  'lift',
  'roll',
  'dance',
];

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
  /** Small and round enough for two bugs to play catch with. */
  catchable?: boolean;
  /** A light: a click switches it on and off (`tag_glowing`) instead of making it hop. */
  lamp?: boolean;
  /** Too big for the pocket (the lattice panel). */
  unpocketable?: boolean;
  /** Heavy to drag: the hand pulls it this much as hard as usual, 0 to 1 (the lattice panel). */
  drag?: number;
  /** A marble track piece: it snaps onto the pegboard. */
  track?: boolean;
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
  /** Found by a system in the sim (the sundial, the knothole, the fireflies), in `area`. */
  | { type: 'scripted'; area: string }
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
