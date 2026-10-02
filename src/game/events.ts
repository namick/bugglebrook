import type { BugAction, EntityId, EntityKind, SocialKind } from './core/entities';
import type { AdvertAction, PotionEffect, ToyKind, WearSlot } from './data/types';
import type { BlobKind } from './systems/crafting';
import type { PhaseId, WeatherId } from './systems/sky';

/**
 * Every game event and its payload. Audio, particles, and the journal
 * subscribe to these; the sim never depends on who is listening.
 * Names are snake_case, past tense. Positions are world meters.
 */
export interface GameEvents {
  entity_spawned: { id: EntityId; kind: EntityKind; defId: string };
  entity_removed: { id: EntityId };
  item_grabbed: { id: EntityId; kind: EntityKind; defId: string; x: number; y: number };
  /** Let go. `flung` is true at or above FLING_SPEED. Velocity is the release velocity. */
  item_dropped: {
    id: EntityId;
    kind: EntityKind;
    defId: string;
    speed: number;
    vx: number;
    vy: number;
    flung: boolean;
  };
  /** A quick click on an item made it hop. */
  item_poked: { id: EntityId; defId: string; x: number; y: number };
  /**
   * Something got out of the world (past an end wall, over the lid, or
   * through the ground) and dropped back in from the sky at (x, y), over the
   * open stretch nearest to `fromX`.
   */
  entity_returned: { id: EntityId; kind: EntityKind; defId: string; fromX: number; x: number; y: number };
  /** A consumable dropped back into the area. */
  item_respawned: { id: EntityId; defId: string; x: number; y: number };
  /** Something hit something hard. `id` is the entity that got bonked. */
  bonked: { id: EntityId; kind: EntityKind; defId: string; speed: number; x: number; y: number };
  /** A spring launched something off its top. */
  spring_bounced: { id: EntityId; targetId: EntityId; x: number; y: number };
  bug_poked: { id: EntityId; defId: string; x: number; y: number };
  /** Back on its feet after being airborne. `speed` is the hardest impact. */
  bug_landed: { id: EntityId; defId: string; speed: number; x: number; y: number };
  bug_dizzy: { id: EntityId; defId: string; speed: number; durationTicks: number };
  bug_recovered: { id: EntityId; defId: string };
  /** A bug picked something to go and do. `targetId` is null for a spot (the water, the stump top). */
  bug_chose_action: { id: EntityId; defId: string; action: BugAction; targetId: EntityId | null };
  bug_hopped: { id: EntityId; defId: string; x: number; y: number };
  bug_ate: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    liking: Liking;
    x: number;
    y: number;
  };
  /** A bug finished using something: bounced on the spring, sniffed a new thing, splashed. */
  bug_used: { id: EntityId; defId: string; targetId: EntityId | null; action: AdvertAction };
  /**
   * Food went into a bug's mouth and it started chewing. `byPlayer` is true
   * when the player dropped or threw it there.
   */
  bug_fed: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    liking: Liking;
    byPlayer: boolean;
  };
  /** A bug spat out food it dislikes. The item stays in the world. */
  bug_spat: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  /** A big meal came back up as a burp. */
  bug_burped: { id: EntityId; defId: string; x: number; y: number };
  /**
   * A bug played a reaction. `variant` picks one of the reaction's animation
   * and voice variants; the same type never repeats a variant back to back.
   */
  bug_reacted: { id: EntityId; defId: string; reaction: ReactionType; variant: number };
  /** Held still and tickled. `level` rises 1, 2, 3 as the laughs escalate. */
  bug_tickled: { id: EntityId; defId: string; level: number };
  /** Tickled too long: the bug wriggled out of the player's hand. */
  bug_wriggled_free: { id: EntityId; defId: string; x: number; y: number };
  /** The player shook whatever they are holding. */
  item_shaken: { id: EntityId; kind: EntityKind; defId: string; x: number; y: number };

  // --- Properties and water (M3) ---------------------------------------
  /** A tag came on. `cause` names the rule or effect, for sounds and particles. */
  tag_gained: { id: EntityId; tag: string; cause: TagCause; x: number; y: number };
  /** A tag went off: washed, dried, melted, or worn off. */
  tag_lost: { id: EntityId; tag: string; cause: TagCause; x: number; y: number };
  /** Something hit the water. `speed` is how fast it went in; `size` its half height. */
  splashed: {
    id: EntityId;
    kind: EntityKind;
    defId: string;
    x: number;
    y: number;
    speed: number;
    size: number;
  };
  /** Climbed or floated out of the water. */
  left_water: { id: EntityId; kind: EntityKind; x: number; y: number };
  /** A low, fast throw bounced off the water. `count` is the skip number in this throw. */
  skipped: { id: EntityId; x: number; y: number; count: number };
  /** Hot met wet: "tsss" and a big steam puff (R2), or hot went into water (R1). */
  steamed: { id: EntityId; otherId: EntityId | null; x: number; y: number };
  /** Wet met cold and froze (R3). */
  froze: { id: EntityId; x: number; y: number };
  /** Frozen met hot, or the ice wore off: back to wet (R4). */
  thawed: { id: EntityId; x: number; y: number };
  /** A cold thing touched the water and froze a patch of it (R5). */
  ice_formed: { x0: number; x1: number; y: number };
  ice_melted: { x0: number; x1: number; y: number };
  /** Sticky contact welded two things together (R6). */
  stuck: { a: EntityId; b: EntityId; x: number; y: number };
  /** A weld pulled apart, or soap loosened it. */
  unstuck: { a: EntityId; b: EntityId; x: number; y: number };
  /** Soap and water blew bubbles (R7), or a wet wand was waved. */
  bubbles_blown: { id: EntityId; x: number; y: number; count: number };
  /** A bug caught a whiff of something smelly (R8). `liked` if it enjoys stink. */
  bug_smelled: { id: EntityId; defId: string; sourceId: EntityId; liked: boolean };
  /** Sparky met water: the pond fizzes for a moment (R9). */
  water_zapped: { x: number; y: number };
  /** A magnet pulled something onto itself with a clink (R10). */
  magnet_snapped: { id: EntityId; magnetId: EntityId; x: number; y: number };
  /** A bug fell in the water and started swimming. */
  bug_swam: { id: EntityId; defId: string; x: number; y: number };
  /** Back on land, a bug shook itself dry. */
  bug_shook_dry: { id: EntityId; defId: string; x: number; y: number };
  /** A shaken sponge squeezed its water (or soap) out onto what is below (R18). */
  wrung_out: { id: EntityId; tag: string; x: number; y: number };
  /** The hose tap was clicked on or off. */
  hose_toggled: { on: boolean; x: number; y: number };
  /** The sunken boot was clicked: a burst of bubbles. */
  boot_bubbled: { x: number; y: number };
  /** An area went to sleep (no physics) or woke up, as the camera moved. */
  area_slept: { areaId: string };
  area_woke: { areaId: string };

  // --- Needs, social play, and the setup rule (M4) ------------------------
  /** Sniffing a thing it has not met before. */
  bug_inspected: { id: EntityId; defId: string; itemId: EntityId; itemDefId: string };
  /** Picked something up in its front legs. */
  bug_picked_up: { id: EntityId; defId: string; itemId: EntityId; itemDefId: string };
  /** Set down what it was carrying. */
  bug_put_down: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number };
  /** Two bugs started doing something together. */
  bug_socialized: { id: EntityId; defId: string; partnerId: EntityId; kind: SocialKind };
  /** An interaction ended. `happy` is false if it fizzled (a partner was grabbed away). */
  bug_social_ended: { id: EntityId; defId: string; partnerId: EntityId; kind: SocialKind; happy: boolean };
  /** One line of a chat: a pictogram topic, and the food or bug it is about. */
  bug_chatted: {
    id: EntityId;
    defId: string;
    partnerId: EntityId;
    topic: ChatTopic;
    about: string | null;
  };
  /** A head-bump greeting: boop. */
  bug_bumped: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Tag! `id` tapped `partnerId`, who is now it. */
  bug_tagged: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Threw something to a friend. */
  bug_threw: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number; vx: number; vy: number };
  /** Caught something a friend threw. */
  bug_caught: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number };
  /** Gave a friend a snack. */
  bug_shared: { id: EntityId; defId: string; partnerId: EntityId; itemId: EntityId; itemDefId: string };
  /** Snatched a snack out of another bug's hands. */
  bug_snatched: { id: EntityId; defId: string; partnerId: EntityId; itemId: EntityId; itemDefId: string };
  /** Patted a dizzy friend, who gets better faster. */
  bug_comforted: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Turned to look at something loud nearby (a crash, a hard landing). The `gawk` reaction says how. */
  bug_gawked: { id: EntityId; defId: string; x: number; y: number };
  /** Hopped onto another bug's head for a ride, or off it. */
  bug_rode: { id: EntityId; defId: string; mountId: EntityId; on: boolean };
  bug_slept: { id: EntityId; defId: string; x: number; y: number };
  /** Woke up. `early` if something woke it before it was rested. */
  bug_woke: { id: EntityId; defId: string; early: boolean };
  /** Striking a pose at the top of the world (Dot), or for the camera. */
  bug_posed: { id: EntityId; defId: string; x: number; y: number };
  /** A small idle animation: a hum, a yawn, a look around. */
  bug_fidgeted: { id: EntityId; defId: string; fidget: Fidget };
  /** Slid on a slime trail. */
  bug_slipped: { id: EntityId; defId: string; x: number; y: number };
  /** Curled into a ball, or uncurled and peeked out. */
  bug_curled: { id: EntityId; defId: string; on: boolean };
  /** Ducked behind something, or came out. */
  bug_hid: { id: EntityId; defId: string; coverId: EntityId | null; on: boolean };
  /** A stack the player built came crashing down. */
  stack_fell: { x: number; y: number; count: number };
  /** The player tucked something into pocket slot `slot`. `x`, `y` is where it left the world. */
  pocketed: { id: EntityId; kind: EntityKind; defId: string; slot: number; x: number; y: number };
  /** The player pulled something out of pocket slot `slot`, into the hand at `x`, `y`. */
  unpocketed: { id: EntityId; kind: EntityKind; defId: string; slot: number; x: number; y: number };
  /** Dropped on a slot that could not take it, this came back out at the hand. */
  pocket_swapped: { id: EntityId; defId: string; slot: number; x: number; y: number };
  /** In the first scene, a bug came over to ask to be flung ("again!"). */
  bug_beckoned: { id: EntityId; defId: string; x: number; y: number };

  // --- Day, night, and weather (M6) --------------------------------------
  /** The clock passed into dawn, day, dusk, or night. `clock` is game time in clock ticks. */
  phase_changed: { phase: PhaseId; clock: number };
  /** `forced` is a debug or test change (`set_weather`), not the sky's own. */
  weather_changed: { weather: WeatherId; from: WeatherId; forced: boolean };
  /** The sundial finished fast-forwarding, from one clock to another. */
  time_skipped: { from: number; to: number };
  /** The weather vane was clicked and spun round; its rooster now faces `facing`. */
  vane_spun: { facing: 1 | -1; x: number; y: number };
  /** Three quick spins of the vane: a gust of wind blows `dir` for `seconds`. */
  gust_started: { dir: 1 | -1; x: number; y: number; seconds: number };
  /** The sun painted on the sundial was clicked (`count` quick clicks so far). */
  sun_clicked: { count: number; x: number; y: number };
  /** The stump's knothole was clicked: at night eyes blink back. `itemId` is what popped out, if anything. */
  knothole_peeked: { x: number; y: number; night: boolean; itemId: EntityId | null };
  /** A shooting star streaked across the sky above world x. */
  shooting_star: { x: number; y: number; dir: 1 | -1 };
  /** A light was switched on or off with a click (the flashlight pen). */
  light_toggled: { id: EntityId; on: boolean; x: number; y: number };
  /** The fireflies over the reeds blinked back at a light. `answer` is the big blink that brings Flick. */
  fireflies_blinked: { x: number; y: number; answer: boolean };
  /** A hidden bug was found and joined the world. */
  bug_joined: { id: EntityId; defId: string; x: number; y: number };
  /** A bug put something up over its head against the rain, or put it down. */
  bug_umbrella: { id: EntityId; defId: string; itemId: EntityId; on: boolean };
  /** Something turned into something else (a pebble in the moonlit teacup). */
  item_transformed: { id: EntityId; newId: EntityId; from: string; to: string; x: number; y: number };
  /** A secret was found for the first time in this world. */
  secret_found: { id: string; x: number; y: number };

  // --- M10 clues ------------------------------------------------------------
  /** Three clicks tipped the sunken boot: a tiny key on a cork floats up. */
  boot_tipped: { id: EntityId; x: number; y: number };
  /** The tiny key opened the stump's little door: a map scrap and a coin pop out. */
  nook_opened: { x: number; y: number };
  /** Three coins in the teacup: the frog king surfaces and spits out a bubble hat. */
  frog_king: { id: EntityId; x: number; y: number };
  /** The frog eyes were poked (`count` in a row). */
  frog_blinked: { x: number; y: number; count: number };
  /** Five pokes: a huge ribbit ripples the pond and every bug jumps. */
  frog_ribbited: { x: number; y: number };
  /** Three bugs on one raft reached the far bank: a reed horn, cheering. */
  regatta_won: { id: EntityId; riders: EntityId[]; x: number; y: number };
  /** Something bounced on a ring mushroom (`index` 0 to 2 is its note). */
  mushroom_bounced: { fixture: string; index: number; id: EntityId; x: number; y: number };
  /** All three ring mushrooms rang within a beat: a chord and rainbow spores. */
  mushroom_chord: { x: number; y: number };
  /** Four dancers for sixteen beats: it starts to rain. */
  rain_danced: { x: number; y: number };
  /** A jar at the rainbow's end filled with rainbow paint. */
  rainbow_caught: { id: EntityId; jar: EntityId; x: number; y: number };
  /** The flashlight on the porch's back wall at night: a shadow puppet of something with eight legs. */
  shadow_puppet: { x: number; y: number };
  /** Three lights by the porch lamp at night: moths swirl into a spiral. */
  moths_swirled: { x: number; y: number };
  /** Eight marble hits in a row on the xylophone: it plays them back as a tune. */
  marble_tune: { x: number; y: number };
  /** Three claw prizes in a row: a victory spin and a candle hat. */
  claw_spun: { id: EntityId; x: number; y: number };
  /** Something rode the leaf slide to the bottom (`count` rides in all). */
  slide_ridden: { id: EntityId; count: number; x: number; y: number };
  /** The tenth slide ride brought back a map scrap. */
  slide_souvenir: { id: EntityId; x: number; y: number };
  /** The treehouse window was tapped (`count` in a row). */
  window_tapped: { x: number; y: number; count: number };
  /** The window telescope zoomed in on where a secret waits (or on nothing left to find). */
  telescope_peeked: { secret: string | null; area: string | null; hint: string[]; x: number; y: number };
  /** A jar carried up to the rain cloud caught a bit of it. */
  cloud_caught: { id: EntityId; x: number; y: number };
  /** The cloud jar was opened: rain. */
  cloud_jar_opened: { id: EntityId; x: number; y: number };
  /** The four map scraps snapped together into the treasure map. */
  map_assembled: { id: EntityId; x: number; y: number };
  /** The clover patch was clicked; `found` when the golden marble came up. */
  clover_dug: { x: number; y: number; found: boolean };
  /** A bug flung up at night left the sky, and came back with a moon crumb. */
  orbit_launched: { id: EntityId; x: number; y: number };
  orbit_returned: { id: EntityId; crumb: EntityId; x: number; y: number };
  /** At night the moss jar squeaked at the hand: something tiny lives in there. */
  moss_squeaked: { x: number; y: number };
  /** The giant potion on the moss tuft grew Wubbo to bug size. */
  wubbo_grew: { id: EntityId; x: number; y: number };
  /** Wubbo patted a dizzy bug, who gets over it faster. */
  bug_patted: { id: EntityId; targetId: EntityId; x: number; y: number };
  /** Three bugs walked across Twig lying over a gap. */
  twig_bridged: { id: EntityId; x: number; y: number };

  // --- Photo mode (M11) --------------------------------------------------
  /** The camera came out: bugs in view (x0 to x1) react, then the world freezes. */
  photo_mode_opened: { x0: number; x1: number };
  photo_mode_closed: Record<string, never>;
  /** The shutter fired. `bugs` are the def IDs in the frame, `stickers` how many were stuck on. */
  photo_taken: { frame: string; filter: string; stickers: number; zoom: number; bugs: string[] };
  /** The photo's file landed on disk, or did not (`ok` false: the polaroid shows a red x). */
  photo_saved: { ok: boolean };
  /** Four bugs stood stacked and still for two seconds: a bug totem. */
  totem_made: { ids: EntityId[]; x: number; y: number };

  // --- Hats and accessories (M11) -----------------------------------------
  /**
   * A bug put something on. `by` says how: the player let it go on the bug's
   * head (`thrown` if it was a throw that landed there), the bug picked it up
   * itself, or two bugs swapped. `took` is what it popped off that slot.
   */
  wearable_worn: {
    id: EntityId;
    defId: string;
    bugId: EntityId;
    bugDefId: string;
    slot: WearSlot;
    by: 'player' | 'bug' | 'swap';
    thrown: boolean;
    liking: Liking;
    took: EntityId | null;
    x: number;
    y: number;
  };
  /**
   * Something came off a bug: popped off by the next thing in its slot,
   * pulled off by the hand, shaken off, taken off because the bug hates it,
   * broken, or let go when the bug left the world.
   */
  wearable_removed: {
    id: EntityId;
    defId: string;
    bugId: EntityId;
    bugDefId: string;
    slot: WearSlot;
    how: 'popped' | 'grabbed' | 'shaken' | 'disliked' | 'broke' | 'dropped' | 'swapped';
    x: number;
    y: number;
  };
  /** The plaza's earthworm took a hat down its hole (`secret_worm_hat`). */
  worm_hatted: { itemId: EntityId; defId: string; x: number; y: number };
  /** Two minutes later it came up on the pond's bank, still wearing it. */
  worm_resurfaced: { itemId: EntityId; defId: string; x: number; y: number };
  /** And went back down, leaving the hat on the bank. */
  worm_left_hat: { itemId: EntityId; defId: string; x: number; y: number };
  /** Prim looked a hat over: a sparkle (`approve`) or a raised eyebrow. */
  hat_judged: {
    judge: EntityId;
    wearer: EntityId;
    itemDefId: string;
    approve: boolean;
    x: number;
    y: number;
  };
  /** Two bugs chatting swapped hats, each liking the other's better. */
  hats_swapped: { a: EntityId; b: EntityId; x: number; y: number };
  /** Boing hopped his hat off and caught it again: a trick, not a loss. */
  hat_flipped: { id: EntityId; itemId: EntityId; x: number; y: number };
  /** A poke on a bug in the party cone toots it. */
  hat_tooted: { id: EntityId; x: number; y: number };
  /** A bug in the viking helmet headbutted a loose thing out of its way. */
  headbutted: { id: EntityId; itemId: EntityId; x: number; y: number };
  /** Prim, in the chef hat, karate-chopped a food in two. */
  food_chopped: { id: EntityId; itemId: EntityId; newId: EntityId; defId: string; x: number; y: number };
  /** A bug in the monocle peered at something: one of its tags, like the bug scope. */
  monocle_peered: { id: EntityId; itemId: EntityId; tag: string | null; x: number; y: number };
  /** Buzzby brought a load of pollen to a thimble (`count` since the last honey). */
  pollen_delivered: { id: EntityId; itemId: EntityId; count: number; x: number; y: number };
  /** The fifth load: the thimble filled with a new honey drop. */
  honey_made: { id: EntityId; itemId: EntityId; x: number; y: number };
  /** Fiddle started playing his own legs for this many beats. */
  bug_fiddled: { id: EntityId; defId: string; beats: number; x: number; y: number };
  /** Luma danced in the stage's spotlight at night, moths swirling round her. */
  moth_spotlit: { id: EntityId; x: number; y: number };
  /** Luma looped round a light (`own`: her own headlamp, round and round). */
  moth_circled: { id: EntityId; x: number; y: number; own: boolean };
  /** Every found bug wears a hat at once: Prim leads a parade (`secret_fashion_parade`). */
  parade_started: { leader: EntityId; ids: EntityId[]; x: number; y: number };

  // --- More areas and unlocks (M7) ----------------------------------------
  /** A barrier opened for good: `areaId` is open to bugs and the camera now. */
  area_unlocked: { areaId: string; barrierId: string; x: number; y: number };
  /** The sunflower drank from its wet soil and stood up. */
  sunflower_drank: { x: number; y: number };
  /** Something round rolled into the can tunnel. `fits` if it bumped the latch; a marble clinks under it. */
  tunnel_rolled: { id: EntityId; fits: boolean; x: number; y: number };
  /** The bucket lift started up or down, or reached the top and tipped out what it carried. */
  lift_moved: { phase: 'up' | 'top' | 'back' | 'down'; x: number; y: number; count: number; first: boolean };
  /** The stage lights were clicked to their next mode (0 off, 1 warm, 2 disco, 3 spotlight). */
  stage_lights_changed: { mode: number; x: number; y: number };
  /** A bluebell speaker was clicked quiet or loud. */
  speaker_toggled: { id: string; muted: boolean; x: number; y: number };
  /** Dipped in a paint puddle, or painted by a paint drop or potion (M8). */
  painted: { id: EntityId; paint: string; x: number; y: number };
  /** A knock on the gnome. `count` quick knocks so far. */
  gnome_knocked: { x: number; y: number; count: number };
  /** Something inside the gnome knocked back, three times. */
  gnome_answered: { x: number; y: number };
  /** A hint that something is hiding: the nibbled leaf rustles, the tulip hums, eyes peek from the pot. */
  hideout_stirred: { fixture: string; x: number; y: number };
  /** Three or more bugs danced or played instruments on the stage together: the band layer joins the music. */
  band_played: { count: number; x: number; y: number };
  /** The porch lamp was clicked on or off. */
  lamp_toggled: { on: boolean; x: number; y: number };
  /** Something dropped through a gap in the porch floorboards. */
  floor_dropped: { id: EntityId; defId: string; x: number; y: number };
  /** The cobweb hammock caught something, or let it through. */
  web_caught: { id: EntityId; on: boolean; x: number; y: number };
  /** The dangling spider waved back at the hand. */
  spider_waved: { x: number; y: number };
  /** A shelf jar filled up with its ingredient again. */
  jar_refilled: { id: EntityId; defId: string; x: number; y: number };
  /** A track piece snapped onto the pegboard, or came off it. */
  track_snapped: { id: EntityId; on: boolean; x: number; y: number; angle: number };
  /** The claw machine: the claw went down, grabbed something (or nothing), or dropped a prize down the chute. */
  claw_moved: { phase: 'drop' | 'grab' | 'miss' | 'prize'; x: number; y: number; id: EntityId | null };
  /** Dominoes toppled in a chain. */
  dominoes_fell: { count: number; x: number; y: number };
  /** Startled, a stink bug let off a green cloud. */
  stink_cloud: { id: EntityId; x: number; y: number };
  /** A strong bug pulled a friend free of something sticky. */
  bug_freed: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** A leaf got nibbled: `bites` holes so far. */
  bug_nibbled: { id: EntityId; defId: string; itemId: EntityId; bites: number; x: number; y: number };
  /** A caterpillar spun a cocoon, or came out as a butterfly (or back again). */
  bug_changed: {
    id: EntityId;
    defId: string;
    form: 'cocoon' | 'butterfly' | 'caterpillar';
    x: number;
    y: number;
  };
  /** A karate chop at something floating past. */
  bug_chopped: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number };
  /** A hidden bug gave itself away for a moment (Twig's eyes opened). */
  bug_blinked: { id: EntityId; defId: string; x: number; y: number };

  // --- Crafting and potions (M8) -------------------------------------
  /** Something went into one of the Tinker Bench's three trays, or came out. */
  tray_filled: { tray: number; id: EntityId; defId: string; x: number; y: number };
  tray_emptied: { tray: number; id: EntityId; x: number; y: number };
  /** The bench's lever came down. Bugs close by hammer along; a strong one shakes it harder. */
  bench_pulled: { empty: boolean; helpers: EntityId[]; strong: boolean; x: number; y: number };
  /** Ta-da: a recipe came out of the bench. `first` the first time this recipe was made. */
  crafted: { recipe: string; id: EntityId; defId: string; x: number; y: number; first: boolean };
  /** A crafted thing went back into its parts, into the trays. */
  uncrafted: { from: string; parts: EntityId[]; x: number; y: number };
  /** Not a recipe: a junk blob (or a chomp, if it was all food). */
  bench_failed: { kind: BlobKind; blobId: EntityId | null; ate: string[]; x: number; y: number };
  /** One plain thing alone in a tray: nothing to pull apart. It hops back out. */
  bench_shrugged: { id: EntityId; x: number; y: number };
  /** A bug was dropped on a tray. It hops out with a suspicious look. */
  bench_refused: { id: EntityId; x: number; y: number };
  /** A near miss: the crank wiggles and the missing thing's ghost flickers in the empty tray. */
  bench_hinted: { recipe: string; tray: number; missing: string; x: number; y: number };
  /** A tag nudge: the cork board shows the tag a recipe wants. */
  bench_nudged: { recipe: string; tag: string; x: number; y: number };
  /** A blueprint scroll was picked up: its card goes on the cork board. */
  blueprint_found: { id: EntityId; recipe: string; x: number; y: number };
  /** A bored bug near the bench wishes for something craftable. */
  bug_wished: { id: EntityId; defId: string; recipe: string; output: string };
  /** A bored bug pushed the sundial's rim a notch: the world fast-forwards `minutes`. */
  bug_turned_dial: { id: EntityId; defId: string; minutes: number; x: number; y: number };
  /** A junk blob was shaken back into its parts. */
  blob_split: { id: EntityId; parts: EntityId[]; x: number; y: number };
  /** A poked junk blob squeaks. */
  blob_squeaked: { id: EntityId; x: number; y: number };
  /** Something splashed into the cauldron and tinted the brew. */
  cauldron_added: {
    defId: string;
    essence: string | null;
    color: number;
    count: number;
    x: number;
    y: number;
  };
  /** The cauldron already holds three things: this one bounced back out. */
  cauldron_full: { id: EntityId; x: number; y: number };
  /** Half a turn of stirring. `turns` counts toward the two that brew. */
  cauldron_stirred: { turns: number; x: number; y: number };
  /** Two full turns: it bubbles hard. Bugs close by cheer. */
  cauldron_bubbled: { color: number; cheer: EntityId[]; x: number; y: number };
  /** Pop: a corked bottle came out. */
  potion_brewed: {
    id: EntityId;
    potion: string | null;
    color: number;
    triple: boolean;
    x: number;
    y: number;
  };
  /** A click tipped the cauldron: what was in it came back out. */
  cauldron_tipped: { count: number; x: number; y: number };
  /** A bug drank a potion. */
  potion_drunk: { id: EntityId; defId: string; potion: string | null; x: number; y: number };
  /** A potion bottle broke on something: a splash version at half the time. */
  potion_shattered: {
    id: EntityId;
    targetId: EntityId | null;
    potion: string | null;
    color: number;
    applied: boolean;
    x: number;
    y: number;
  };
  /** A potion effect began on a bug or a thing. */
  potion_started: { id: EntityId; effect: PotionEffect; potion: string | null; x: number; y: number };
  /** A potion effect ran out, washed off in water, was replaced by a third, or was popped. */
  potion_ended: {
    id: EntityId;
    effect: PotionEffect;
    cause: 'timeout' | 'dunk' | 'replaced' | 'popped';
    x: number;
    y: number;
  };
  /** A potion that does nothing to things: a puff and a sparkle. */
  potion_fizzled: { id: EntityId; x: number; y: number };
  /** A potion's burp: a plain one, a giant bubble, a flame puff, or a sludge cloud. */
  potion_burped: {
    id: EntityId;
    kind: 'burp' | 'bubble' | 'fire' | 'sludge';
    x: number;
    y: number;
    dir: 1 | -1;
  };
  /** A giant or heavy bug's step shook the ground. */
  giant_stomped: { id: EntityId; heavy: boolean; x: number; y: number };
  /** A frosty bug sneezed snowflakes. */
  frost_sneezed: { id: EntityId; x: number; y: number };
  /** A balloon bug was poked: it zips about letting its air out. */
  balloon_deflated: { id: EntityId; x: number; y: number };
  /** Something fragile broke into pieces (rule R11). */
  shattered: { id: EntityId; defId: string; into: string; pieces: EntityId[]; x: number; y: number };
  /** Food toasted by heat (rule R12). */
  toasted: { id: EntityId; defId: string; x: number; y: number };
  /**
   * A musical thing was struck or poked and played its note (rule R20).
   * `poked`: the player's poke, which plays the next note of a motif (M9);
   * otherwise a physics hit, which plays the thing's own scale degree `note`.
   */
  note_played: { id: EntityId; defId: string; note: number; x: number; y: number; poked: boolean };
  // --- Music (M9) ------------------------------------------------------------
  /** A bug started playing an instrument where it lies, for about this many beats. */
  instrument_played: { id: EntityId; itemId: EntityId; defId: string; beats: number; x: number; y: number };
  /**
   * The mushroom sequencer changed: a cap, a row's mute tuft, the clear
   * stone (`wobbled` on the first click, `cleared` on the second), the speed
   * knob, or the A/B seed. `by` is the bug hopping on an empty grid's caps.
   */
  sequencer_changed: {
    action: 'cap' | 'mute' | 'wobbled' | 'cleared' | 'speed' | 'pattern';
    row: number;
    col: number;
    on: boolean;
    x: number;
    y: number;
    by: EntityId | null;
  };
  /** A crafted toy did its thing. */
  toy_used: {
    id: EntityId;
    toy: ToyKind;
    action: 'fire' | 'launch' | 'inflate' | 'deflate' | 'hang' | 'attach' | 'fling' | 'boing';
    x: number;
    y: number;
  };
  /** The bug scope showed a thing's hidden tag (or nothing on the dish). */
  scope_viewed: { defId: string | null; tag: string | null; x: number; y: number };
  // --- M10 hidden areas --------------------------------------------------------
  /**
   * The player went through a doorway (`travel`): from fixture `from` at
   * (x, y) to fixture `to` in `area`, coming out at (toX, toY). `carried` is
   * what the hand brought along.
   */
  doorway_used: {
    from: string;
    to: string;
    area: string;
    x: number;
    y: number;
    toX: number;
    toY: number;
    carried: EntityId | null;
  };
  /** Ants found the player's sugar cube by their hill and started carrying it in. */
  ants_took_sugar: { id: EntityId; x: number; y: number };
  /** The sugar went in and the ant hill's hole crumbled wide into a doorway. */
  ant_hill_opened: { x: number; y: number };
  /** A click on the ant hill (ants scatter; once open, it is a doorway). */
  ant_hill_poked: { x: number; y: number; open: boolean };
  /** Something small landed on the depths' ant line and is being passed to the pantry. */
  conveyor_took: { id: EntityId; defId: string; x: number; y: number };
  /** The ant queen ate something sweet and danced. `first`: the first time (her gift follows). */
  queen_fed: { defId: string; x: number; y: number; first: boolean };
  /** The queen gave the player a present (her monocle). */
  queen_gave: { id: EntityId; defId: string; x: number; y: number };
  queen_poked: { x: number; y: number };
  /** A big bug pulled the root knot free in the depths' dead end. */
  root_pulled: { id: EntityId; defId: string; x: number; y: number };
  /** A click on the root knot: it creaks (`stuck`) or just sways. */
  root_poked: { x: number; y: number; stuck: boolean };
  /** A sleeping larva in the nursery wiggled at a poke. */
  larva_wiggled: { fixture: string; x: number; y: number };
  /** Music reached the depths through the bluebell speakers: the ants started a conga. */
  ants_conga: { x: number; y: number };
  /** At night, with the ants asleep, the map scrap showed on the pantry's pile. */
  pantry_scrap_found: { x: number; y: number };
  /** The gnome got his nose back and sneezed; his hat flips open. */
  gnome_sneezed: { x: number; y: number };
  /** The player looked through Gnome Hollow's telescope. */
  telescope_viewed: { x: number; y: number };
  pedestal_poked: { x: number; y: number };
  /** The golden marble settled in the moon pedestal's cup. */
  marble_seated: { id: EntityId; x: number; y: number };
  /** The finale began: the telescope opens and every bug heads for the plaza. (x, y) is over the stump. */
  finale_started: { x: number; y: number };
  /** A bug-shaped firework burst over the stump (the `n`th of the finale). */
  firework_burst: { defId: string; x: number; y: number; n: number };
  finale_ended: Record<string, never>;

  // Playtest F1: the trash can. F2: tidying up.
  /**
   * The trash can ate something. `fate`: it goes home in a while (`home`),
   * it came apart into its parts, which go home (`recycled`), or it is gone
   * for good (`gone`: a potion bottle, or a crafted thing with no parts).
   * `by`: dropped or tossed in, or sent there by tidying.
   */
  trash_chomped: {
    id: EntityId;
    defId: string;
    fate: 'home' | 'recycled' | 'gone';
    parts: number;
    by: 'player' | 'tidy';
    x: number;
    y: number;
  };
  /** The trash can burped after a meal. `size` grows with the things it ate in a row. */
  trash_burped: { size: number; x: number; y: number };
  /**
   * The trash can spat something back out: a bug (never trashed), a thing too
   * big or part of the player's build, or, on a click, the last thing it ate.
   */
  trash_spat: {
    id: EntityId;
    kind: EntityKind;
    defId: string;
    why: 'bug' | 'big' | 'setup' | 'hiccup';
    x: number;
    y: number;
  };
  /** A click on the empty trash can: its lid clacks. */
  trash_poked: { x: number; y: number };
  /** A bug dived into the trash can and came up with something, or with nothing. */
  trash_rummaged: { bugId: EntityId; itemId: EntityId | null; defId: string | null; x: number; y: number };
  /** Something the trash can ate came home: it drops in from the sky over its home spot. */
  item_came_home: { id: EntityId; defId: string; x: number; y: number };
  /** The tidy whistle blew. `count` things are about to swoosh home. */
  whistle_blown: { id: EntityId; count: number; x: number; y: number };
  /**
   * A loose thing went home: swooshed by the whistle (`whistle`), sent by
   * the junk cap (`cap`, into the trash can), or drifted home while nobody
   * was looking (`drift`). It left (fromX, fromY) and lands at (x, y), or in
   * the trash can (`to` is `can`).
   */
  item_tidied: {
    id: EntityId;
    defId: string;
    to: 'home' | 'can';
    cause: 'whistle' | 'cap' | 'drift';
    fromX: number;
    fromY: number;
    x: number;
    y: number;
  };
  /** Rain or wind nudged a bit of litter a hop toward home. */
  litter_nudged: { id: EntityId; dir: 1 | -1; cause: 'rain' | 'wind'; x: number; y: number };
}

/** What a chat line is about. The renderer draws it as a pictogram. */
export type ChatTopic =
  'food' | 'friend' | 'star' | 'question' | 'heart' | 'note' | 'spring' | 'drop' | 'zzz' | 'laugh' | 'sun';

export const CHAT_TOPICS: readonly ChatTopic[] = [
  'food',
  'friend',
  'star',
  'question',
  'heart',
  'note',
  'spring',
  'drop',
  'zzz',
  'laugh',
  'sun',
];

/** Idle fidgets (game design doc, section 5, `st_idle`). */
export type Fidget =
  'look' | 'hum' | 'yawn' | 'scratch' | 'groom' | 'stretch' | 'kick' | 'twirl' | 'pose' | 'freeze';

/** What changed a tag, so listeners can pick the right effect. */
export type TagCause =
  | 'water'
  | 'rain'
  | 'hose'
  | 'steam'
  | 'freeze'
  | 'thaw'
  | 'contact'
  | 'soap'
  | 'stink'
  | 'zap'
  | 'food'
  | 'shake'
  | 'wring'
  | 'wore_off'
  | 'returned'
  | 'debug'
  | 'player'
  | 'stack'
  | 'slime'
  | 'dew'
  | 'puddle'
  | 'heap'
  | 'paint'
  | 'potion'
  | 'mud'
  | 'fire'
  | 'hat';

export type Liking = 'loved' | 'liked' | 'neutral' | 'disliked';

/**
 * Reactions (game design doc, section 5). Each has at least three variants.
 * `land_hard` is for bugs that never get dizzy (Glorp). `splash` plays on
 * falling in water, `shake_dry` on climbing out, and `stink` on smelling
 * something (a happy sniff for stink lovers). M4 adds `inspect` (sniffing
 * something new), `wake`, `gawk` (looking at a crash), `robbed` (a snack
 * snatched away), `slip` (on slime), `show_off` (a pose), `play` (the happy
 * end of a game together), and `peek` (uncurling, or peeking out of cover).
 * M6 adds `rain_joy` (rain lovers splashing about), `rain_gloom` (the rest,
 * caught in it), and `wonder` (looking up at a shooting star). M7 adds
 * `join` (a found bug joining the cast), `dance` (on the stage), `puff`
 * (Whiff's embarrassed stink cloud), and `chop` (Prim's karate chop).
 * M8 adds `drink` (a gulp from a potion bottle), `cheer` (at a bubbling
 * cauldron or a ta-da at the bench), `huh` (a potion fizzling on a thing, or
 * a bug put in a tray), `blegh` (sludge), and `wow` (a potion taking hold).
 * After M8: `later` (a busy bug glancing at food held out to it: "in a
 * minute") and `whee` (riding the leaf slide, wading in the bead pit).
 * M11 adds `camera` (the camera comes out: posing, photobombing, hiding).
 * The playtest's F1 adds `trashed` (spat out of the trash can, smelly and
 * indignant). M11's hats add `hatted` (each bug's own way of wearing a hat),
 * `hat_love` and `hat_yuck` (a loved or a hated thing put on), `hat_look`
 * (a bug nearby noticing), and `fashion` (Prim's verdict).
 */
export type ReactionType =
  | 'grab'
  | 'poke'
  | 'fling'
  | 'land'
  | 'land_hard'
  | 'tickle'
  | 'fed_loved'
  | 'fed_liked'
  | 'fed_neutral'
  | 'fed_disliked'
  | 'splash'
  | 'shake_dry'
  | 'stink'
  | 'inspect'
  | 'wake'
  | 'gawk'
  | 'robbed'
  | 'slip'
  | 'show_off'
  | 'play'
  | 'peek'
  | 'rain_joy'
  | 'rain_gloom'
  | 'wonder'
  | 'join'
  | 'dance'
  | 'puff'
  | 'chop'
  | 'drink'
  | 'cheer'
  | 'huh'
  | 'blegh'
  | 'wow'
  | 'later'
  | 'whee'
  | 'camera'
  | 'trashed'
  | 'hatted'
  | 'hat_love'
  | 'hat_yuck'
  | 'hat_look'
  | 'fashion';

export const REACTION_TYPES: readonly ReactionType[] = [
  'grab',
  'poke',
  'fling',
  'land',
  'land_hard',
  'tickle',
  'fed_loved',
  'fed_liked',
  'fed_neutral',
  'fed_disliked',
  'splash',
  'shake_dry',
  'stink',
  'inspect',
  'wake',
  'gawk',
  'robbed',
  'slip',
  'show_off',
  'play',
  'peek',
  'rain_joy',
  'rain_gloom',
  'wonder',
  'join',
  'dance',
  'puff',
  'chop',
  'drink',
  'cheer',
  'huh',
  'blegh',
  'wow',
  'later',
  'whee',
  'camera',
  'trashed',
  'hatted',
  'hat_love',
  'hat_yuck',
  'hat_look',
  'fashion',
];

/** Variants per reaction type. */
export const REACTION_VARIANTS = 3;

/** Mood, derived from needs and recent events (game design doc, section 5). */
export type Mood =
  'mood_happy' | 'mood_content' | 'mood_bored' | 'mood_hungry' | 'mood_sleepy' | 'mood_grumpy';

export type GameEventName = keyof GameEvents;
