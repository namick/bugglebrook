// A set's backdrop: the sky's colors, the tone map for the code-drawn world,
// and the painted parallax strips. The file shapes, their checks, and the
// color math, shared by the game and the Node scripts in scripts/art/.
// No imports, so Node can load it directly. docs/06-art-guide.md, B14.

/** The importer's message shape (the same as `ArtMessage` in rigFile.ts). */
export interface BackdropMessage {
  level: 'error' | 'warning' | 'info';
  layer?: string;
  text: string;
}

// Colors

/** `#rrggbb` to 0xRRGGBB, or null when it is anything else. */
export function parseColor(v: unknown): number | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? parseInt(v.slice(1), 16) : null;
}

export function hexColor(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Brightness the way the sky code weighs it, 0 to 255. */
export function luma(c: number): number {
  return ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15;
}

/** Hue in degrees, saturation and lightness 0 to 1, and chroma (the spread between channels, 0 to 1). */
export function toHsl(c: number): { h: number; s: number; l: number; chroma: number } {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const l = (max + min) / 2;
  if (chroma === 0) return { h: 0, s: 0, l, chroma };
  const s = chroma / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / chroma) % 6;
  else if (max === g) h = (b - r) / chroma + 2;
  else h = (r - g) / chroma + 4;
  return { h: (h * 60 + 360) % 360, s: Math.min(1, s), l, chroma };
}

export function fromHsl(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  const ch = (v: number): number => Math.min(255, Math.max(0, Math.round((v + m) * 255)));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

// The sky

/**
 * The moments of the day a sky palette has colors for. The hours are the
 * game's (the sim decides when night falls), so a set gives colors only.
 */
export const SKY_MOMENTS = [
  'night',
  'late_night',
  'dawn',
  'morning',
  'day',
  'afternoon',
  'dusk',
  'sunset',
  'twilight',
] as const;
export type SkyMomentName = (typeof SKY_MOMENTS)[number];

/** When each moment is at full strength, in hours. Night and day hold from one entry to the next. */
export const SKY_HOURS: readonly (readonly [number, SkyMomentName])[] = [
  [0, 'night'],
  [4.4, 'late_night'],
  [5.3, 'dawn'],
  [6.2, 'morning'],
  [7.2, 'day'],
  [15, 'day'],
  [16.6, 'afternoon'],
  [18.1, 'dusk'],
  [19.1, 'sunset'],
  [19.85, 'twilight'],
  [20.6, 'night'],
];

/** One moment's colors. The four layer tints multiply the art (white leaves it as painted). */
export interface SkyMoment {
  skyTop: number;
  skyBottom: number;
  horizon: number;
  horizonAlpha: number;
  far: number;
  mid: number;
  near: number;
  front: number;
  cloud: number;
  stars: number;
  warmth: number;
}

export const MOMENT_COLORS = [
  'skyTop',
  'skyBottom',
  'horizon',
  'far',
  'mid',
  'near',
  'front',
  'cloud',
] as const;
export const MOMENT_NUMBERS = ['horizonAlpha', 'stars', 'warmth'] as const;

export interface SkyPalette {
  moments: Record<SkyMomentName, SkyMoment>;
  /** The sun: its disc, rays, soft glow, cheeks, and the tint multiplied on as it nears the horizon. */
  sun: { disc: number; rays: number; glow: number; cheek: number; low: number };
  moon: { disc: number; crater: number; glow: number; cheek: number };
  /** Star colors; each star takes one. */
  stars: number[];
  /** A shooting star's tail. */
  shooting: number;
  /** The rainbow's bands, outside in. */
  rainbow: number[];
  /** The light inside the two hidden areas, which have no sky: the tint on everything there. */
  rooms: { depths: { day: number; night: number }; hollow: { day: number; night: number } };
}

const NIGHT: SkyMoment = {
  skyTop: 0x1c1f4a,
  skyBottom: 0x2c2f5e,
  horizon: 0x4a4f8e,
  horizonAlpha: 0.35,
  far: 0x3e4686,
  mid: 0x5a64a8,
  near: 0x7d86c4,
  front: 0x4d5694,
  cloud: 0x5d6399,
  stars: 1,
  warmth: 0,
};

const DAY: SkyMoment = {
  skyTop: 0x8fd3f0,
  skyBottom: 0xbfe7f5,
  horizon: 0xf2fbff,
  horizonAlpha: 0.35,
  far: 0xffffff,
  mid: 0xffffff,
  near: 0xffffff,
  front: 0xffffff,
  cloud: 0xffffff,
  stars: 0,
  warmth: 0.1,
};

/**
 * The game's own sky (game design doc, section 11). Day is #BFE7F5 fading to
 * #8FD3F0 at the top, dusk the orange #FF9F5A to violet, night #1C1F4A with
 * #2C2F5E low down: a deep, friendly blue-violet, never black, so bugs stay readable.
 */
export const DEFAULT_SKY: SkyPalette = {
  moments: {
    night: NIGHT,
    late_night: {
      skyTop: 0x181a48,
      skyBottom: 0x33366a,
      horizon: 0x5a5a9a,
      horizonAlpha: 0.4,
      far: 0x434b8c,
      mid: 0x5e68ac,
      near: 0x8089c6,
      front: 0x505a98,
      cloud: 0x61679e,
      stars: 1,
      warmth: 0,
    },
    // Pink to pale blue.
    dawn: {
      skyTop: 0x3c3f86,
      skyBottom: 0xe89ab8,
      horizon: 0xffc3a3,
      horizonAlpha: 0.65,
      far: 0x8a7fb8,
      mid: 0xa396c8,
      near: 0xc0b4dc,
      front: 0x8f86b8,
      cloud: 0xf2a9c2,
      stars: 0.45,
      warmth: 0.5,
    },
    morning: {
      skyTop: 0x86b4ea,
      skyBottom: 0xffcfd8,
      horizon: 0xffe0b0,
      horizonAlpha: 0.55,
      far: 0xd8c8e6,
      mid: 0xe8dcee,
      near: 0xf6ecf0,
      front: 0xd6cce0,
      cloud: 0xffe0ea,
      stars: 0,
      warmth: 0.45,
    },
    day: DAY,
    afternoon: {
      skyTop: 0x8fd0ee,
      skyBottom: 0xcdebef,
      horizon: 0xfff4dc,
      horizonAlpha: 0.4,
      far: 0xfff6e8,
      mid: 0xfff8ee,
      near: 0xfffaf2,
      front: 0xf6f0e6,
      cloud: 0xfffaf0,
      stars: 0,
      warmth: 0.25,
    },
    // Orange low down, violet above; long warm light.
    dusk: {
      skyTop: 0x8c8ad0,
      skyBottom: 0xff9f5a,
      horizon: 0xffd27a,
      horizonAlpha: 0.75,
      far: 0xffb898,
      mid: 0xffc8a0,
      near: 0xffdcbc,
      front: 0xd9a488,
      cloud: 0xffc08a,
      stars: 0,
      warmth: 1,
    },
    sunset: {
      skyTop: 0x4a3f94,
      skyBottom: 0xff7f6e,
      horizon: 0xffae6e,
      horizonAlpha: 0.7,
      far: 0xb88ab8,
      mid: 0xd4a0bc,
      near: 0xe0b6c6,
      front: 0x9c7ea6,
      cloud: 0xf29a9a,
      stars: 0.2,
      warmth: 0.8,
    },
    twilight: {
      skyTop: 0x282a6a,
      skyBottom: 0x7a5aa0,
      horizon: 0xb97aa8,
      horizonAlpha: 0.5,
      far: 0x5c5a9c,
      mid: 0x7c78b8,
      near: 0x9c98cc,
      front: 0x6a68a4,
      cloud: 0x8a78b0,
      stars: 0.7,
      warmth: 0.2,
    },
  },
  sun: { disc: 0xffd84d, rays: 0xffe066, glow: 0xfff6c2, cheek: 0xff9f6b, low: 0xff9a5a },
  moon: { disc: 0xfff4cc, crater: 0xe8d6a0, glow: 0xe8ecff, cheek: 0xffa8b8 },
  stars: [0xffffff, 0xfff4c2, 0xdfe6ff],
  shooting: 0xfff4c2,
  rainbow: [0xff6b6b, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0x9775fa],
  rooms: { depths: { day: 0xf2d6bc, night: 0xc9b0a4 }, hollow: { day: 0xf0ecfa, night: 0xf0ecfa } },
};

/**
 * What night and day must keep so the game still reads right, whatever the
 * colors: the `near` tint lights everything the player touches, and the night
 * lights switch on by how dark it is.
 */
export const SKY_RULES = {
  /** Day's `near` tint is at least this bright: daylight, no night lights. */
  dayNear: 225,
  /** Night's `near` tint lies in this range: dark enough to be night, bright enough to see the bugs. */
  nightNear: [105, 170] as const,
  /** The night sky is at most this share of the day sky's brightness. */
  nightSky: 0.6,
  /** A layer tint darker than this goes nearly black. */
  dim: 45,
} as const;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const err = (text: string): BackdropMessage => ({ level: 'error', text });
const warn = (text: string): BackdropMessage => ({ level: 'warning', text });
const oneOf = (names: readonly string[]): string => names.join(', ');

/** Read a group of named colors over their defaults. */
function readColors<K extends string>(
  raw: unknown,
  base: Readonly<Record<K, number>>,
  where: string,
  out: BackdropMessage[],
): Record<K, number> {
  const result = { ...base } as Record<K, number>;
  if (raw === undefined) return result;
  if (!isObject(raw)) {
    out.push(err(`${where} must be an object of colors (${oneOf(Object.keys(base))}).`));
    return result;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in base)) {
      out.push(err(`${where} has no "${key}". It has: ${oneOf(Object.keys(base))}.`));
      continue;
    }
    const c = parseColor(value);
    if (c === null) out.push(err(`${where}.${key} must be a color like "#8fd3f0".`));
    else result[key as K] = c;
  }
  return result;
}

function readColorList(
  raw: unknown,
  base: number[],
  where: string,
  min: number,
  max: number,
  out: BackdropMessage[],
): number[] {
  if (raw === undefined) return [...base];
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) {
    out.push(err(`${where} must be a list of ${min} to ${max} colors.`));
    return [...base];
  }
  const colors = raw.map((v) => parseColor(v));
  if (colors.some((c) => c === null)) {
    out.push(err(`${where} must hold only colors like "#8fd3f0".`));
    return [...base];
  }
  return colors as number[];
}

/**
 * Read a set's `sky.json` over the game's own sky: anything left out keeps
 * the game's color. Returns null when the file has an error, so the game
 * falls back to its own sky.
 */
export function parseSky(raw: unknown): { sky: SkyPalette | null; messages: BackdropMessage[] } {
  const out: BackdropMessage[] = [];
  if (!isObject(raw)) return { sky: null, messages: [err('sky.json must hold one JSON object.')] };
  const known = ['moments', 'sun', 'moon', 'stars', 'shooting', 'rainbow', 'rooms'];
  for (const key of Object.keys(raw))
    if (!known.includes(key)) out.push(err(`sky.json has no "${key}". It has: ${oneOf(known)}.`));
  const moments = {} as Record<SkyMomentName, SkyMoment>;
  for (const name of SKY_MOMENTS) moments[name] = { ...DEFAULT_SKY.moments[name] };
  if (raw.moments !== undefined) {
    if (!isObject(raw.moments)) out.push(err(`moments must be an object (${oneOf(SKY_MOMENTS)}).`));
    else
      for (const [name, value] of Object.entries(raw.moments)) {
        if (!(SKY_MOMENTS as readonly string[]).includes(name)) {
          out.push(err(`moments has no "${name}". The moments are: ${oneOf(SKY_MOMENTS)}.`));
          continue;
        }
        if (!isObject(value)) {
          out.push(err(`moments.${name} must be an object.`));
          continue;
        }
        const m = moments[name as SkyMomentName];
        for (const [key, v] of Object.entries(value)) {
          if ((MOMENT_COLORS as readonly string[]).includes(key)) {
            const c = parseColor(v);
            if (c === null) out.push(err(`moments.${name}.${key} must be a color like "#8fd3f0".`));
            else m[key as (typeof MOMENT_COLORS)[number]] = c;
          } else if ((MOMENT_NUMBERS as readonly string[]).includes(key)) {
            if (typeof v !== 'number' || !(v >= 0 && v <= 1))
              out.push(err(`moments.${name}.${key} must be a number from 0 to 1.`));
            else m[key as (typeof MOMENT_NUMBERS)[number]] = v;
          } else
            out.push(
              err(
                `moments.${name} has no "${key}". It has: ${oneOf([...MOMENT_COLORS, ...MOMENT_NUMBERS])}.`,
              ),
            );
        }
      }
  }
  const sun = readColors(raw.sun, DEFAULT_SKY.sun, 'sun', out);
  const moon = readColors(raw.moon, DEFAULT_SKY.moon, 'moon', out);
  const stars = readColorList(raw.stars, DEFAULT_SKY.stars, 'stars', 1, 6, out);
  const rainbow = readColorList(raw.rainbow, DEFAULT_SKY.rainbow, 'rainbow', 3, 8, out);
  let shooting = DEFAULT_SKY.shooting;
  if (raw.shooting !== undefined) {
    const c = parseColor(raw.shooting);
    if (c === null) out.push(err('shooting must be a color like "#fff4c2".'));
    else shooting = c;
  }
  const rooms = {
    depths: { ...DEFAULT_SKY.rooms.depths },
    hollow: { ...DEFAULT_SKY.rooms.hollow },
  };
  if (raw.rooms !== undefined) {
    if (!isObject(raw.rooms)) out.push(err('rooms must be an object (depths, hollow).'));
    else
      for (const [name, value] of Object.entries(raw.rooms)) {
        if (name !== 'depths' && name !== 'hollow') {
          out.push(err(`rooms has no "${name}". It has: depths, hollow.`));
          continue;
        }
        rooms[name] = readColors(value, rooms[name], `rooms.${name}`, out);
      }
  }
  const sky: SkyPalette = { moments, sun, moon, stars, shooting, rainbow, rooms };
  out.push(...skyRules(sky));
  return { sky: out.some((m) => m.level === 'error') ? null : sky, messages: out };
}

/** Night must read as night and day as day (`SKY_RULES`). */
export function skyRules(sky: SkyPalette): BackdropMessage[] {
  const out: BackdropMessage[] = [];
  const R = SKY_RULES;
  const m = sky.moments;
  const pct = (v: number): string => `${Math.round((v / 255) * 100)}%`;
  if (luma(m.day.near) < R.dayNear)
    out.push(
      err(
        `moments.day.near is ${pct(luma(m.day.near))} bright. Keep it at ${pct(R.dayNear)} or more: it tints every bug and toy, and darker than that the night lights come on at noon.`,
      ),
    );
  for (const name of ['night', 'late_night'] as const) {
    const l = luma(m[name].near);
    if (l > R.nightNear[1])
      out.push(
        err(
          `moments.${name}.near is ${pct(l)} bright. Keep it at ${pct(R.nightNear[1])} or less, or night does not read as night and its lights stay off.`,
        ),
      );
    if (l < R.nightNear[0])
      out.push(
        err(
          `moments.${name}.near is ${pct(l)} bright. Keep it at ${pct(R.nightNear[0])} or more, or the bugs are too dark to see.`,
        ),
      );
  }
  const skyOf = (k: SkyMoment): number => (luma(k.skyTop) + luma(k.skyBottom)) / 2;
  for (const name of ['night', 'late_night'] as const)
    if (skyOf(m[name]) > skyOf(m.day) * R.nightSky)
      out.push(
        err(
          `The ${name} sky is ${pct(skyOf(m[name]))} bright and the day sky ${pct(skyOf(m.day))}. Night must be clearly darker: at most ${Math.round(R.nightSky * 100)}% of day.`,
        ),
      );
  for (const name of SKY_MOMENTS)
    for (const layer of ['far', 'mid', 'near', 'front'] as const)
      if (luma(m[name][layer]) < R.dim)
        out.push(
          warn(
            `moments.${name}.${layer} is ${pct(luma(m[name][layer]))} bright: that layer goes nearly black.`,
          ),
        );
  if (m.day.stars > 0.4)
    out.push(warn('moments.day.stars is over 0.4: stars at noon make day look like night.'));
  return out;
}

/** A sky palette as the JSON a set writes: every color a `#rrggbb` string. */
export function skyJson(sky: SkyPalette): Record<string, unknown> {
  const colors = (o: Record<string, number>): Record<string, string> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hexColor(v)]));
  const moments: Record<string, Record<string, unknown>> = {};
  for (const name of SKY_MOMENTS) {
    const m = sky.moments[name];
    const out: Record<string, unknown> = {};
    for (const key of MOMENT_COLORS) out[key] = hexColor(m[key]);
    for (const key of MOMENT_NUMBERS) out[key] = m[key];
    moments[name] = out;
  }
  return {
    moments,
    sun: colors(sky.sun),
    moon: colors(sky.moon),
    stars: sky.stars.map(hexColor),
    shooting: hexColor(sky.shooting),
    rainbow: sky.rainbow.map(hexColor),
    rooms: { depths: colors(sky.rooms.depths), hollow: colors(sky.rooms.hollow) },
  };
}

// The tone map

/**
 * One rule of a tone map: colors with `from`'s hue become `to`'s, keeping
 * their shading. `spread` is how far from that hue the rule reaches, in
 * degrees: full strength out to half of it, then easing off.
 */
export interface ToneAnchor {
  from: number;
  to: number;
  spread: number;
}

export const TONE_SPREAD = { default: 40, min: 10, max: 90 } as const;
export const TONE_MAX = 12;
/** An anchor's `from` needs at least this much chroma, or it has no hue to match. */
export const TONE_MIN_CHROMA = 0.1;

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Signed shortest way round the hue circle from a to b, in degrees. */
const hueDelta = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Map one color through a tone map. Each anchor pulls colors near its `from`
 * hue: the hue turns by the same angle, saturation scales by the same ratio,
 * and lightness bends so `from` lands exactly on `to`. Dark and light shades
 * of a hue follow together, so shading survives. Greys have no hue and stay.
 */
export function toneColor(c: number, anchors: readonly ToneAnchor[]): number {
  if (!anchors.length) return c & 0xffffff;
  const hsl = toHsl(c);
  // Greys and near-greys (the outline, pebbles, white) keep their color.
  const gate = smoothstep(0.02, TONE_MIN_CHROMA, hsl.chroma);
  if (gate <= 0) return c & 0xffffff;
  let total = 0;
  const weights: number[] = [];
  for (const a of anchors) {
    const d = Math.abs(hueDelta(toHsl(a.from).h, hsl.h));
    // Full strength out to half the spread, then easing off to nothing at the spread.
    const w = 1 - smoothstep(a.spread / 2, a.spread, d);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return c & 0xffffff;
  const norm = gate / Math.max(1, total);
  let turn = 0;
  let sat = 1;
  let gamma = 1;
  anchors.forEach((a, i) => {
    const w = weights[i]! * norm;
    if (w <= 0) return;
    const from = toHsl(a.from);
    const to = toHsl(a.to);
    // A grey target has no hue: only fade the color out.
    turn += w * (to.chroma > 0 ? hueDelta(from.h, to.h) : 0);
    sat += w * (to.s / Math.max(0.01, from.s) - 1);
    const lf = Math.min(0.98, Math.max(0.02, from.l));
    const lt = Math.min(0.98, Math.max(0.02, to.l));
    gamma += w * (Math.log(lt) / Math.log(lf) - 1);
  });
  const l = Math.pow(hsl.l, Math.max(0.05, gamma));
  return fromHsl(hsl.h + turn, Math.min(1, Math.max(0, hsl.s * sat)), Math.min(1, Math.max(0, l)));
}

// The world's style

/** The pond's water. `surface` and `deep` are the water itself; `dusk` and `night` tint it by the hour. */
export interface WaterStyle {
  surface: number;
  deep: number;
  dusk: number;
  night: number;
}

export const DEFAULT_WATER: WaterStyle = {
  surface: 0x5cc3e6,
  deep: 0x2f7fb0,
  dusk: 0xffc8a0,
  night: 0x5f8fb0,
};

/** How a set restyles the code-drawn world (`world.json`). */
export interface WorldStyle {
  tone: ToneAnchor[];
  water: WaterStyle;
}

export const DEFAULT_WORLD: WorldStyle = { tone: [], water: DEFAULT_WATER };

/** Read a set's `world.json`. Returns null when the file has an error. */
export function parseWorld(raw: unknown): { world: WorldStyle | null; messages: BackdropMessage[] } {
  const out: BackdropMessage[] = [];
  if (!isObject(raw)) return { world: null, messages: [err('world.json must hold one JSON object.')] };
  const known = ['tone', 'water'];
  for (const key of Object.keys(raw))
    if (!known.includes(key)) out.push(err(`world.json has no "${key}". It has: ${oneOf(known)}.`));
  const tone: ToneAnchor[] = [];
  if (raw.tone !== undefined) {
    if (!Array.isArray(raw.tone) || raw.tone.length > TONE_MAX)
      out.push(
        err(`tone must be a list of at most ${TONE_MAX} rules like {"from": "#5aa845", "to": "#8a5fe0"}.`),
      );
    else
      raw.tone.forEach((rule: unknown, i) => {
        const at = `tone[${i}]`;
        if (!isObject(rule)) return void out.push(err(`${at} must be an object with "from" and "to".`));
        for (const key of Object.keys(rule))
          if (!['from', 'to', 'spread'].includes(key))
            out.push(err(`${at} has no "${key}". It has: from, to, spread.`));
        const from = parseColor(rule.from);
        const to = parseColor(rule.to);
        if (from === null || to === null)
          return void out.push(err(`${at} needs "from" and "to" colors like "#5aa845".`));
        if (toHsl(from).chroma < TONE_MIN_CHROMA)
          return void out.push(
            err(
              `${at}.from (${hexColor(from)}) is too grey to have a hue. Pick the colorful shade to change.`,
            ),
          );
        let spread: number = TONE_SPREAD.default;
        if (rule.spread !== undefined) {
          if (
            typeof rule.spread !== 'number' ||
            rule.spread < TONE_SPREAD.min ||
            rule.spread > TONE_SPREAD.max
          )
            return void out.push(
              err(`${at}.spread must be a number of degrees from ${TONE_SPREAD.min} to ${TONE_SPREAD.max}.`),
            );
          spread = rule.spread;
        }
        tone.push({ from, to, spread });
      });
  }
  // Rules that overlap pull against each other: say where a `from` no longer lands on its `to`.
  for (const a of tone) {
    const got = toneColor(a.from, tone);
    if (colorDistance(got, a.to) > 24)
      out.push(
        warn(
          `tone sends ${hexColor(a.from)} to ${hexColor(got)}, not ${hexColor(a.to)}: another rule's hue is too close. Narrow a "spread" or drop a rule.`,
        ),
      );
  }
  const water = readColors(raw.water, DEFAULT_WATER, 'water', out);
  if (luma(water.surface) <= luma(water.deep))
    out.push(err('water.surface must be lighter than water.deep, or the pond stops reading as water.'));
  const world: WorldStyle = { tone, water };
  return { world: out.some((m) => m.level === 'error') ? null : world, messages: out };
}

/** A world style as the JSON a set writes. */
export function worldJson(world: WorldStyle): Record<string, unknown> {
  return {
    tone: world.tone.map((a) => ({ from: hexColor(a.from), to: hexColor(a.to), spread: a.spread })),
    water: Object.fromEntries(Object.entries(world.water).map(([k, v]) => [k, hexColor(v as number)])),
  };
}

/** The biggest difference in any one channel, 0 to 255. */
export function colorDistance(a: number, b: number): number {
  return Math.max(
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
    Math.abs((a & 255) - (b & 255)),
  );
}

/**
 * The main colors of the code-drawn world, by what they paint: what a tone
 * map is chosen against, and what `checkBackdrop.ts` prints a map's result for.
 */
export const WORLD_SWATCHES: readonly (readonly [string, number])[] = [
  ['far hills', 0xb6e3c4],
  ['near hills', 0x98d59a],
  ['mid grass', 0x78c160],
  ['mid clover', 0x8fd16f],
  ['mid stems', 0x5ea24a],
  ['watering can', 0x7fb3a8],
  ['grass tufts', 0x5aa845],
  ['front grass', 0x3f8a35],
  ['front grass, dark', 0x2e6b28],
  ['front rocks', 0x8f8aa0],
  ['plaza moss', 0x6fbf4a],
  ['moss shade', 0x4e9a3a],
  ['plaza soil and stump bark', 0xa8744f],
  ['plaza soil, deep', 0x7a4e32],
  ['stump top', 0xe8c08e],
  ['ant hill', 0xc49464],
  ['mushroom caps', 0xe8453c],
  ['signpost', 0xff9f1c],
  ['pond bank', 0x7cc452],
  ['pond soil and mud', 0x8a6a4a],
  ['pond sand', 0xcdb487],
  ['reeds', 0x8cbf3f],
  ['lily pads', 0x3fa34d],
  ['lily bloom', 0xf28ab2],
  ['cattails', 0x7a4e32],
  ['flowerbed mulch', 0x7a5238],
  ['flowerbed soil', 0x5a3b2b],
  ['flowerpot', 0xd46b3e],
  ['porch dust', 0x94796a],
  ['porch soil', 0x4a3540],
  ['porch boards', 0x9c8068],
  ['porch shadow', 0x2a2438],
  ['house siding', 0x9fb4c8],
  ['bricks', 0xc0674a],
  ['compost sludge', 0x7fa33a],
  ['compost soil', 0x6b4a2b],
  ['treehouse planks', 0xd98e4a],
  ['treehouse canopy', 0x5faf3f],
  ['depths earth', 0x8b5a3c],
  ['depths tunnels', 0x4a2e1f],
  ['hollow walls', 0xf4efe6],
  ['hollow wood', 0xb5773e],
  ['hollow dome', 0x1b2350],
  ['outline', 0x2b1d2e],
];

// Strips

/** The parallax layers a set can paint. `far` is the hills; `mid` the big grass. */
export const STRIP_LAYERS = ['far', 'mid'] as const;
export type StripLayer = (typeof STRIP_LAYERS)[number];

/** `<area>_<layer>.strip.json`, written by the template generator next to each strip. Never edited by hand. */
export interface StripFile {
  schema: 1;
  /** `<area id>_<layer>`. */
  id: string;
  kind: 'strip';
  area: string;
  layer: StripLayer;
  title: string;
  /** Template pixels per game pixel. */
  scale: 1 | 2;
  /** The canvas, in template pixels. */
  canvas: { w: number; h: number };
  /** Where the canvas's left edge is in the layer, in game pixels. */
  x: number;
  /** The stretch of the layer this strip owns, in game pixels. Inside it the code-drawn art is gone. */
  span: { x0: number; x1: number };
  /** How far past each end of the span the canvas goes, in game pixels: the game fades the strip out there. */
  blend: { left: number; right: number };
  /** The ground line's y, in game pixels. */
  ground: number;
  /** Nothing at or below this y (game pixels) is ever on screen. */
  cover: number;
  /** Stretches of the layer (game pixels) that are never on screen: always behind a room. */
  hidden: [number, number][];
  /** A hash of the canvas and where it sits; a template made for another hash is out of date. */
  stripHash: string;
}

/** One picture a built strip has, placed in its layer in game pixels. */
export interface StripImage {
  /** The PNG, as a path next to the manifest. */
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StripEntry {
  id: string;
  area: string;
  layer: StripLayer;
  /** drawn: usable. empty: nothing painted yet. broken: has errors; the game draws that stretch in code. */
  status: 'drawn' | 'empty' | 'broken';
  sourceHash: string;
  stripHash: string;
  /** The stretch of the layer the strip replaces, in game pixels. */
  span: [number, number];
  /** The painting, graded with the time of day. */
  paint: StripImage | null;
  /** What glows at night: added on top, outside the grading. */
  glow: StripImage | null;
  report: BackdropMessage[];
}

/** `backdrop.json`, written by `pnpm art:build` for each set that has a backdrop. */
export interface BackdropManifest {
  schema: 1;
  /** The set's `sky.json` as written, or null when it has none or it has an error. */
  sky: unknown;
  /** The set's `world.json` as written, or null. */
  world: unknown;
  strips: Record<string, StripEntry>;
  /** The importer's messages for the two JSON files. */
  report: { sky: BackdropMessage[]; world: BackdropMessage[] };
}

/** A built backdrop to install at run time (tests, the review tour): the manifest and each picture as a data URL. */
export interface BackdropPack {
  manifest: BackdropManifest;
  images: Record<string, string>;
}

/** The name of the layer that holds a strip's night glow. */
export const GLOW_LAYER = 'glow';
