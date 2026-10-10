import type { WeatherId } from '../../../game/systems/sky';
import type { SkyMoment, SkyPalette } from '../art/backdropData';
import { DEFAULT_SKY, SKY_HOURS } from '../art/backdropData';
import { mix } from './palette';

/**
 * How the whole scene looks at a time of day and in some weather (game
 * design doc, section 11). Pure, so tests can check that it changes
 * smoothly and hits the doc's colors. The renderer grades every layer by
 * multiplying it with these tints (no dark overlay): far layers lean to the
 * sky's color, near ones keep their own. Lights add on top at night.
 */
export interface SkyLook {
  /** Sky gradient: top, bottom, and a glow along the horizon. */
  skyTop: number;
  skyBottom: number;
  horizon: number;
  horizonAlpha: number;
  /** Multiply tints per depth: hills, the mid grass, the near world (ground, bugs, props), front grass. */
  far: number;
  mid: number;
  near: number;
  front: number;
  /** Clouds' tint and how much of them there is (0 to 1 extra cover for gloomy weather). */
  cloud: number;
  cover: number;
  /** Stars and night lights, 0 to 1. */
  stars: number;
  glow: number;
  /** The sun and the moon: where on their arc (0 rising, 1 setting), and how much they show. */
  sun: { t: number; alpha: number; color: number };
  moon: { t: number; alpha: number };
  /** Sunlight warmth for rim light and dappled spots, 0 to 1. */
  warmth: number;
  /** Dappled day light on the ground, 0 to 1. */
  dapple: number;
}

/** A key moment in the day: hour, then colors. */
interface Key extends SkyMoment {
  h: number;
}

// The day's keys come from a sky palette: the game's own (`DEFAULT_SKY`: day
// is the doc's #BFE7F5 fading to #8FD3F0 at the top, dusk the orange #FF9F5A
// to violet, night #1C1F4A with #2C2F5E low down) or an art set's. Night is a
// deep, friendly blue-violet, never black: bugs stay readable.
const keysByPalette = new WeakMap<SkyPalette, readonly Key[]>();

/** A palette's moments laid out through the day. */
function keysOf(palette: SkyPalette): readonly Key[] {
  let keys = keysByPalette.get(palette);
  if (!keys) {
    keys = SKY_HOURS.map(([h, name]) => ({ h, ...palette.moments[name] }));
    keysByPalette.set(palette, keys);
  }
  return keys;
}

/** The sun is up from 05:15 to 19:45, and the moon from 19:30 to 05:30. */
const SUNRISE = 5.25;
const SUNSET = 19.75;
const MOONRISE = 19.5;
const MOONSET = 5.5;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Grey with the same brightness. */
function grey(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const l = Math.round(r * 0.3 + g * 0.55 + b * 0.15);
  return (l << 16) | (l << 8) | l;
}

/** Multiply two colors channel by channel. */
export function multiply(a: number, b: number): number {
  const ch = (s: number): number => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** How the weather shifts the look, each 0 to 1 (the renderer eases these). */
export interface WeatherMix {
  cloudy: number;
  rain: number;
  wind: number;
  rainbow: number;
}

export const NO_WEATHER: WeatherMix = { cloudy: 0, rain: 0, wind: 0, rainbow: 0 };

/** What a weather state asks for, before easing. */
export function weatherTarget(weather: WeatherId): WeatherMix {
  switch (weather) {
    case 'weather_cloudy':
      return { cloudy: 1, rain: 0, wind: 0, rainbow: 0 };
    case 'weather_rain':
      return { cloudy: 1, rain: 1, wind: 0, rainbow: 0 };
    case 'weather_wind':
      return { cloudy: 0.25, rain: 0, wind: 1, rainbow: 0 };
    case 'weather_rainbow':
      return { cloudy: 0.15, rain: 0, wind: 0, rainbow: 1 };
    default:
      return NO_WEATHER;
  }
}

/** Ease the current mix toward a target over about `seconds`. */
export function easeWeather(mixNow: WeatherMix, target: WeatherMix, dt: number, seconds = 3): WeatherMix {
  const k = 1 - Math.exp(-dt / Math.max(0.01, seconds / 3));
  const step = (a: number, b: number): number => {
    const v = a + (b - a) * k;
    return Math.abs(v - b) < 0.001 ? b : v;
  };
  return {
    cloudy: step(mixNow.cloudy, target.cloudy),
    rain: step(mixNow.rain, target.rain),
    wind: step(mixNow.wind, target.wind),
    rainbow: step(mixNow.rainbow, target.rainbow),
  };
}

/** Where on its arc the sun or moon is (0 to 1) between rise and set, and how visible. */
function arc(hour: number, rise: number, set: number): { t: number; alpha: number } {
  const len = (set - rise + 24) % 24;
  const t = ((hour - rise + 24) % 24) / len;
  if (t < 0 || t > 1) return { t: t > 1 ? 1 : 0, alpha: 0 };
  // Fade in and out near the horizon.
  const alpha = smooth(clamp01(t / 0.06)) * smooth(clamp01((1 - t) / 0.06));
  return { t, alpha };
}

/** The look at `hour` (0 to 24) in weather `w`, in the game's own sky or an art set's. */
export function skyLook(
  hour: number,
  w: WeatherMix = NO_WEATHER,
  palette: SkyPalette = DEFAULT_SKY,
): SkyLook {
  const KEYS = keysOf(palette);
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[KEYS.length - 1]!;
  let b: Key = { ...KEYS[0]!, h: 24 };
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i]!;
    const next = KEYS[i + 1] ?? { ...KEYS[0]!, h: 24 };
    if (h >= k.h && h < next.h) {
      a = k;
      b = next;
      break;
    }
  }
  const t = smooth(clamp01((h - a.h) / Math.max(0.001, b.h - a.h)));
  const c = (x: number, y: number): number => mix(x, y, t);
  const n = (x: number, y: number): number => x + (y - x) * t;
  let look: SkyLook = {
    skyTop: c(a.skyTop, b.skyTop),
    skyBottom: c(a.skyBottom, b.skyBottom),
    horizon: c(a.horizon, b.horizon),
    horizonAlpha: n(a.horizonAlpha, b.horizonAlpha),
    far: c(a.far, b.far),
    mid: c(a.mid, b.mid),
    near: c(a.near, b.near),
    front: c(a.front, b.front),
    cloud: c(a.cloud, b.cloud),
    cover: 0,
    stars: n(a.stars, b.stars),
    glow: 0,
    warmth: n(a.warmth, b.warmth),
    dapple: 0,
    sun: { ...arc(h, SUNRISE, SUNSET), color: palette.sun.disc },
    moon: arc(h, MOONRISE, MOONSET),
  };
  // Lights matter as it gets dark: how far the near tint is from daylight.
  const nearL = ((look.near >> 16) & 255) * 0.3 + ((look.near >> 8) & 255) * 0.55 + (look.near & 255) * 0.15;
  look.glow = clamp01((235 - nearL) / 110);
  // The sun grows warm and orange near the horizon.
  const low = 1 - Math.sin(Math.PI * look.sun.t);
  look.sun.color = mix(palette.sun.disc, multiply(palette.sun.disc, 0xffa3ca), clamp01(low * 1.3 - 0.2));
  look.dapple = clamp01(1 - look.glow * 2) * look.sun.alpha;
  look = applyWeather(look, w);
  return look;
}

/** Cloud, rain, and rainbow shift the colors: greyer, softer, darker for rain. */
function applyWeather(look: SkyLook, w: WeatherMix): SkyLook {
  const cloudy = clamp01(w.cloudy);
  const rain = clamp01(w.rain);
  if (cloudy <= 0 && rain <= 0) return look;
  // Cloudy: 30 percent less saturated, softer light.
  const desat = (c: number, k: number): number => mix(c, grey(c), k);
  const dim = (c: number, k: number): number => mix(c, 0x000000, k);
  const soft = (c: number): number => desat(c, 0.3 * cloudy + 0.25 * rain);
  // Rain: slate skies, cool and a little darker (never gloomy).
  const slate = (c: number, k: number): number => mix(c, multiply(c, 0xaab8cc), k);
  const skyRain = (c: number): number => mix(c, multiply(0x8796ad, mix(0xffffff, c, 0.6)), 0.65 * rain);
  return {
    ...look,
    skyTop: dim(skyRain(soft(look.skyTop)), 0.08 * rain),
    skyBottom: skyRain(soft(look.skyBottom)),
    horizon: skyRain(soft(look.horizon)),
    horizonAlpha: look.horizonAlpha * (1 - 0.5 * rain),
    far: slate(soft(look.far), 0.5 * rain),
    mid: slate(soft(look.mid), 0.45 * rain),
    near: slate(soft(look.near), 0.35 * rain),
    front: slate(soft(look.front), 0.45 * rain),
    cloud: mix(soft(look.cloud), multiply(look.cloud, 0x9aa6ba), 0.7 * rain),
    cover: clamp01(cloudy * 0.6 + rain * 0.4),
    stars: look.stars * (1 - 0.7 * cloudy),
    warmth: look.warmth * (1 - 0.6 * cloudy),
    dapple: look.dapple * (1 - cloudy),
    sun: { ...look.sun, alpha: look.sun.alpha * (1 - 0.6 * cloudy) * (1 - 0.95 * rain) },
    moon: { ...look.moon, alpha: look.moon.alpha * (1 - 0.6 * cloudy) },
  };
}

/**
 * Under the ground and inside the gnome (M10's hidden areas) there is no
 * sky: the scene is graded by its own light, whatever the hour. The depths
 * are warm and lamp-lit; the hollow is a cosy, starry blue. Lights count as
 * in the dark (`glow`), so lamps and stars shine. At night the depths dim a little. Pure.
 */
export function roomLook(
  base: SkyLook,
  mood: 'depths' | 'hollow',
  night = false,
  palette: SkyPalette = DEFAULT_SKY,
): SkyLook {
  const depths = mood === 'depths';
  const room = palette.rooms[mood];
  return {
    ...base,
    // The colony dims its lamps when it sleeps.
    near: night ? room.night : room.day,
    mid: room.day,
    far: room.day,
    front: room.day,
    stars: 0,
    glow: depths ? 0.72 : 0.62,
    warmth: depths ? 0.5 : 0.2,
    dapple: 0,
  };
}
