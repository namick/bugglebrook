// The sound sample catalog (docs/08-sound-brief.md, part 6.2): every folder
// the owner may fill in assets/sfx/, its category, loudness target, length,
// and how the game varies it; the aliases that borrow a folder; the license
// allowlist; and the shape of the built manifest. Shared by the importer
// (scripts/sfx/) and the renderer (audio/sfxCatalog.ts). Pure data and checks.

export type SfxCategory =
  'impact' | 'water' | 'gross' | 'eat' | 'machine' | 'paper' | 'spot' | 'weather' | 'bed' | 'voice';

export type SfxKind = 'oneshot' | 'bed';

export interface CatalogEntry {
  category: SfxCategory;
  kind: SfxKind;
  /** Longest a one-shot take may be, seconds (longer ones fade out there). Beds: the longest loop. */
  maxSec: number;
  /** Takes the brief asks for. */
  takes: number;
  /** Random pitch, semitones either way. */
  pitch: number;
  /** Most takes of this folder sounding at once. */
  limit: number;
  /** Encode bitrate, kb/s. */
  kbps: number;
  /** Beds: loudness target offset (night beds sit 2 LU under day). */
  lufsOffset?: number;
}

/** Loudness targets per category (part 6.3, step 8): max momentary LUFS, or integrated for beds. */
export const CATEGORY_LUFS: Readonly<Record<SfxCategory, number>> = {
  impact: -16,
  water: -17,
  gross: -17,
  eat: -18,
  machine: -17,
  paper: -20,
  spot: -24,
  weather: -26,
  bed: -32,
  voice: -18,
};

const shot = (
  category: SfxCategory,
  maxSec: number,
  takes: number,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  category,
  kind: 'oneshot',
  maxSec,
  takes,
  pitch: 1.5,
  limit: category === 'impact' ? 4 : category === 'spot' ? 1 : 3,
  kbps: 48,
  ...extra,
});

const bed = (category: 'weather' | 'bed', lufsOffset = 0): CatalogEntry => ({
  category,
  kind: 'bed',
  maxSec: 90,
  takes: 1,
  pitch: 0,
  limit: 1,
  kbps: 64,
  lufsOffset,
});

/** The areas' ambience beds, by area mood: day and night, or one for both. */
export const AREA_BEDS: Readonly<Record<string, { day: string; night: string }>> = {
  garden: { day: 'amb_flowerbed_day', night: 'amb_flowerbed_night' },
  pond: { day: 'amb_pond_day', night: 'amb_pond_night' },
  plaza: { day: 'amb_plaza_day', night: 'amb_plaza_night' },
  porch: { day: 'amb_porch_day', night: 'amb_porch_night' },
  compost: { day: 'amb_compost_day', night: 'amb_compost_night' },
  arcade: { day: 'amb_treehouse_day', night: 'amb_treehouse_night' },
  depths: { day: 'amb_ant_hill', night: 'amb_ant_hill' },
  hollow: { day: 'amb_gnome_hollow', night: 'amb_gnome_hollow' },
};

export const WEATHER_BEDS = ['rain_bed', 'board_patter', 'wind_bed'] as const;
export type WeatherBed = (typeof WEATHER_BEDS)[number];

function areaBeds(): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {};
  for (const { day, night } of Object.values(AREA_BEDS)) {
    out[day] = bed('bed');
    if (night !== day) out[night] = bed('bed', -2);
  }
  return out;
}

/** Every folder in part 2 of the brief. The folder name is the game's sound name (or a bed). */
export const SFX_CATALOG: Readonly<Record<string, CatalogEntry>> = {
  // 2.1 Water.
  splash: shot('water', 0.9, 6),
  plop: shot('water', 0.4, 6),
  drip: shot('water', 0.4, 6, { limit: 1 }),
  pour: shot('water', 1.5, 3),
  shake_dry: shot('water', 0.8, 4),
  // 2.2 Goo and gross.
  squelch: shot('gross', 0.6, 6),
  pop: shot('gross', 0.3, 6),
  blob_squeak: shot('gross', 0.5, 6),
  burp: shot('gross', 1, 8),
  // 2.3 Eating.
  nom: shot('eat', 0.5, 6),
  chomp: shot('eat', 0.4, 6),
  slurp: shot('eat', 1, 4),
  // 2.4 Impacts by material.
  impact_wood: shot('impact', 0.4, 8),
  impact_metal: shot('impact', 0.6, 8),
  impact_rubber: shot('impact', 0.3, 6),
  impact_stone: shot('impact', 0.3, 6),
  impact_glass: shot('impact', 0.5, 6, { kbps: 64 }),
  impact_leaf: shot('impact', 0.4, 6),
  impact_food: shot('impact', 0.3, 6),
  shatter: shot('impact', 1, 4, { kbps: 64, limit: 3 }),
  // 2.5 Machines and fixtures.
  trash_clack: shot('machine', 0.5, 5),
  trash_chomp: shot('machine', 0.6, 5),
  trash_rummage: shot('machine', 2, 3, { limit: 1 }),
  whistle_toot: shot('machine', 1, 4, { limit: 1, pitch: 0.5 }),
  brew_bubble: shot('machine', 2, 5),
  cauldron_plop: shot('machine', 0.5, 6),
  cork_pop: shot('machine', 0.4, 4),
  hammer: shot('machine', 0.8, 5),
  bench_rattle: shot('machine', 1, 4),
  dial: shot('machine', 1.2, 3),
  // 2.8 Spot sounds and critters.
  birdsong: shot('spot', 2, 8),
  bee_hum: shot('spot', 3, 4),
  cricket: shot('spot', 1.5, 6),
  creak: shot('spot', 1.2, 6),
  // 2.9 Photo mode and the journal.
  shutter: shot('paper', 0.6, 3, { pitch: 0.5 }),
  page_turn: shot('paper', 0.7, 6, { pitch: 0.5 }),
  // 2.6 Weather beds, and 2.7 the areas' beds.
  rain_bed: bed('weather'),
  board_patter: bed('weather'),
  wind_bed: bed('weather'),
  ...areaBeds(),
};

/** How an alias changes the folder it borrows (part 2.10). */
export interface SfxAlias {
  /** The folder, or `impact_*` for the material's impact (`drop`). */
  folder: string;
  semis?: number;
  gainDb?: number;
  /** Several takes in a row: how many, the gap, and how much quieter each one is. */
  repeat?: { count: number; gapMs: number; fallDb?: number };
  /** A low-pass, Hz. */
  lowpass?: number;
  /** A band-pass, Hz (the trash can's tinny burp). */
  bandpass?: number;
  /** Always the shortest take. */
  shortest?: boolean;
  /** Play only the last part of the take: the fraction kept. */
  tail?: number;
}

export const SFX_ALIASES: Readonly<Record<string, SfxAlias>> = {
  plip: { folder: 'plop', semis: 7, gainDb: -6 },
  trickle: { folder: 'pour', gainDb: -6 },
  squish: { folder: 'squelch', semis: -3 },
  blob_split: { folder: 'blob_squeak', repeat: { count: 2, gapMs: 60 } },
  bubble_burp: { folder: 'burp', semis: 4 },
  chomp_burp: { folder: 'burp', semis: 4 },
  sludge_burp: { folder: 'burp', semis: -5 },
  trash_burp: { folder: 'burp', semis: -7, bandpass: 1200 },
  trash_hiccup: { folder: 'burp', semis: 9, shortest: true },
  nibble: { folder: 'chomp', semis: 5, gainDb: -9 },
  gulp: { folder: 'slurp', tail: 0.4 },
  smash: { folder: 'shatter', gainDb: 2 },
  crash: { folder: 'impact_wood', repeat: { count: 3, gapMs: 70, fallDb: 4 } },
  knock: { folder: 'impact_wood', repeat: { count: 2, gapMs: 140 } },
  knock_back: { folder: 'impact_wood', repeat: { count: 2, gapMs: 140 } },
  stomp: { folder: 'impact_wood', semis: -12, lowpass: 900 },
  bench_clunk: { folder: 'impact_wood', semis: -5 },
  tray_clink: { folder: 'impact_metal', semis: 5, gainDb: -6 },
  cauldron_full: { folder: 'brew_bubble', gainDb: -6 },
  drop: { folder: 'impact_*' },
  // The journal's page sound is `page_flip` in the game; the brief's folder is `page_turn`.
  page_flip: { folder: 'page_turn' },
};

/**
 * Sounds that stay synthesized on purpose (part 1.3), and the rest that no
 * folder covers yet. Every sound name is a folder, an alias, or on this
 * list, so a new sound has to choose (a unit test checks it).
 */
export const SYNTH_ONLY: readonly string[] = [
  // Bug-sized comedy that follows the voices.
  'dizzy',
  'boop',
  'tag',
  'impact_bug',
  'tickle',
  'wriggle',
  'sniff',
  'snore',
  'achoo',
  'sneeze',
  'gag',
  'ptoo',
  // Rewards and magic: tonal, in the music's key.
  'sparkle',
  'twinkle',
  'ta_da',
  'secret',
  'unlock',
  'craft_tada',
  'fanfare',
  'blueprint',
  'shimmer',
  'wish',
  'bell',
  'stage',
  'grow',
  'shrink',
  'float_up',
  'potion_twinkle',
  'potion_whoosh',
  'poof',
  // Hand and UI feedback.
  'grab',
  'grab_bug',
  'fling',
  'hover',
  'pan',
  'scroll',
  'edge',
  'ui_pop',
  'ui_tick',
  'ui_open',
  'ui_close',
  'toggle_on',
  'toggle_off',
  'pick',
  'stamp',
  'bin_shut',
  'whoosh_in',
  'camera_open',
  'camera_close',
  'book_open',
  'book_close',
  'reveal',
  'lever',
  'stir',
  'dial_done',
  // Music toys and chiptune.
  'note',
  'band',
  'arcade_blip',
  'twang',
  'tinkle',
  'xylo_tune',
  'mushroom_chord',
  'reed_horn',
  // Weather ticks: the beds replace them when they load (part 6.6).
  'rain',
  'wind',
  // Not in the first batch (part 2.11 and the rest).
  'poke',
  'spring',
  'flame',
  'chill',
  'shake',
  'swish',
  'hop',
  'whistle',
  'tsss',
  'freeze',
  'thaw',
  'clink',
  'bubble',
  'stink',
  'click_on',
  'click_off',
  'blub',
  'bzzt',
  'toss',
  'catch',
  'pat',
  'slide',
  'curl',
  'pocket_in',
  'pocket_out',
  'vane',
  'gust',
  'blink',
  'light_on',
  'light_off',
  'latch',
  'lift',
  'paint',
  'rustle',
  'hum',
  'web',
  'jar',
  'sticker_peel',
  'sticker_stick',
  'snap',
  'claw',
  'domino',
  'stink_puff',
  'chop',
  'cocoon',
  'freed',
  'bubble_blorp',
  'steam_hiss',
  'leaf_rustle',
  'scratch',
  'tulip_hum',
  'peek_twig',
  'tray_out',
  'craft_pop',
  'uncraft',
  'fail_raspberry',
  'fail_boing',
  'sad_squeak',
  'shrug',
  'refuse',
  'nudge',
  'slosh',
  'fizzle',
  'deflate',
  'sizzle',
  'toy_whoosh',
  'boing',
  'air_hiss',
  'tie_zip',
  'thwack',
  'scope',
  'trash_spit',
  'tidy_swoosh',
  'came_home',
  'litter_skitter',
  // M10's clues and hidden areas.
  'boot_glug',
  'door_creak',
  'frog_croak',
  'frog_ribbit',
  'frog_king',
  'mushroom_boing',
  'rain_rumble',
  'rainbow_fill',
  'shadow_boo',
  'moth_flutter',
  'claw_spin',
  'souvenir',
  'window_tap',
  'telescope_zoom',
  'cloud_catch',
  'cloud_open',
  'map_snap',
  'dig',
  'orbit_whoosh',
  'orbit_return',
  'proud_sigh',
  'tiny_squeak',
  'wubbo_pop',
  'iris',
  'crumble',
  'ant_march',
  'ant_cheer',
  'ant_snore',
  'queen_munch',
  'conveyor',
  'root_creak',
  'root_pop',
  'larva_squeak',
  'sniffle',
  'gnome_sneeze',
  'telescope',
  'marble_seat',
  'firework_whistle',
  'firework_pop',
  'hollow_tick',
  // M11's hats and the music bugs, which came after the brief.
  'hat_on',
  'hat_ding',
  'hat_off',
  'hat_pop',
  'party_horn',
  'hat_judge',
  'hat_swap',
  'headbutt',
  'chef_chop',
  'monocle',
  'pollen',
  'honey',
  'flutter',
];

/** The game's word for a sound folder that isn't on the list: the nearest name, for "did you mean". */
export function nearestFolder(name: string): string {
  let best = '';
  let bestD = Infinity;
  for (const f of Object.keys(SFX_CATALOG)) {
    const d = editDistance(name, f);
    if (d < bestD) [best, bestD] = [f, d];
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length]!;
}

// --- Licenses (part 5) -------------------------------------------------------------

export const LICENSES = [
  'cc0',
  'cc-by-4.0',
  'cc-by-3.0',
  'oga-by',
  'sonniss-gdc',
  'pixabay',
  'zapsplat',
  'suno',
  'own',
] as const;
export type SfxLicense = (typeof LICENSES)[number];

/** Licenses whose files may sit in a public repo (part 5.3). */
export const REPO_SAFE: readonly SfxLicense[] = ['cc0', 'cc-by-4.0', 'cc-by-3.0', 'oga-by', 'suno', 'own'];

/** Licenses that need the sound named in the credits. */
export const NEEDS_CREDIT: readonly SfxLicense[] = ['cc-by-4.0', 'cc-by-3.0', 'oga-by', 'zapsplat'];

/** Licenses that need a title on the credit (part 3.2). */
export const NEEDS_TITLE: readonly SfxLicense[] = ['cc-by-4.0', 'cc-by-3.0', 'oga-by'];

// --- The voice bank (part 4) ---------------------------------------------------------

/** Her recordings: one file per game emotion, plus the extras. */
export const VOICE_FILES = [
  'happy',
  'question',
  'ooh',
  'whee',
  'giggle',
  'love',
  'yum',
  'yuck',
  'grumpy',
  'scared',
  'gasp',
  'dizzy',
  'sleepy',
  'meh',
  'burp',
  'sneeze',
  'snore',
  'extras',
  'babble',
] as const;

// --- The manifest (part 6.3) -----------------------------------------------------------

export interface SfxTake {
  /** Path under the sfx folder, e.g. `splash/0.ogg`. */
  file: string;
  /** Seconds. Beds: the loop's body. */
  dur: number;
  /** Beds: where the loop starts in the file, seconds (codec padding before it). */
  loopStart?: number;
}

export interface SfxSound {
  kind: SfxKind;
  category: SfxCategory;
  takes: SfxTake[];
  /** Hash of the inputs, so an unchanged folder isn't imported again. */
  hash?: string;
}

export interface VoiceClip {
  file: string;
  dur: number;
  /** Median pitch, Hz (0 when unvoiced). */
  pitchHz: number;
}

export interface SfxManifest {
  version: 1;
  sounds: Record<string, SfxSound>;
  voices: Record<string, VoiceClip[]>;
}

export const emptySfxManifest = (): SfxManifest => ({ version: 1, sounds: {}, voices: {} });

/** Everything wrong with a manifest, or nothing. */
export function sfxManifestErrors(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') return ['not an object'];
  const m = data as Partial<SfxManifest>;
  if (m.version !== 1) errors.push(`version ${String(m.version)}`);
  if (!m.sounds || typeof m.sounds !== 'object') errors.push('no sounds');
  if (!m.voices || typeof m.voices !== 'object') errors.push('no voices');
  const takeOk = (t: unknown): boolean => {
    const x = t as Partial<SfxTake> | null;
    return (
      !!x && typeof x.file === 'string' && !x.file.includes('..') && typeof x.dur === 'number' && x.dur > 0
    );
  };
  for (const [name, s] of Object.entries(m.sounds ?? {})) {
    const entry = SFX_CATALOG[name];
    if (!entry) {
      errors.push(`${name}: not in the catalog`);
      continue;
    }
    if (s.kind !== entry.kind) errors.push(`${name}: kind ${s.kind}, catalog says ${entry.kind}`);
    if (!Array.isArray(s.takes) || s.takes.length === 0) errors.push(`${name}: no takes`);
    else if (!s.takes.every(takeOk)) errors.push(`${name}: a bad take`);
  }
  for (const [emotion, clips] of Object.entries(m.voices ?? {})) {
    if (!(VOICE_FILES as readonly string[]).includes(emotion)) errors.push(`voices.${emotion}: unknown`);
    if (!Array.isArray(clips) || !clips.every((c) => takeOk(c) && typeof c.pitchHz === 'number'))
      errors.push(`voices.${emotion}: a bad clip`);
  }
  return errors;
}

// --- Credits (part 5.2) --------------------------------------------------------------

export interface SoundCredit {
  /** The sound's title on its page. */
  title: string;
  author: string;
  url: string;
  license: SfxLicense;
  /** The folder it's in. */
  folder: string;
}

export interface SoundCredits {
  /** Attributed sounds, grouped by license in this order. */
  credits: SoundCredit[];
  /** Everyone whose CC0 or own sounds are used, thanked by name. */
  thanks: string[];
}

export function soundCreditErrors(data: unknown): string[] {
  if (!data || typeof data !== 'object') return ['not an object'];
  const c = data as Partial<SoundCredits>;
  const errors: string[] = [];
  if (!Array.isArray(c.credits)) errors.push('no credits');
  if (!Array.isArray(c.thanks)) errors.push('no thanks');
  for (const x of c.credits ?? [])
    if (typeof x.title !== 'string' || typeof x.author !== 'string' || typeof x.url !== 'string')
      errors.push('a bad credit');
  return errors;
}

/** One line per attributed sound, as the credits page and THIRD-PARTY-SOUNDS.txt show it. */
export function creditText(c: SoundCredit): string {
  const lic = c.license.startsWith('cc-by')
    ? `CC BY ${c.license.slice(6)}`
    : c.license === 'oga-by'
      ? 'OGA-BY 3.0'
      : c.license;
  return `"${c.title}" by ${c.author} (${lic}) ${c.url}`;
}
