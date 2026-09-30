import { SIM_HZ } from '../core/loop';
import { Rng } from '../core/rng';
import type { RngState } from '../core/rng';

/**
 * Day, night, and weather (game design doc, section 11). One real second is
 * one game minute, so a day lasts 24 real minutes. The clock counts game
 * time in "clock ticks": one per sim tick at normal speed, so 60 make a game
 * minute and 86 400 a day. The sundial fast-forwards it at 60x.
 *
 * Everything here is pure: the sim owns a `SkyState` and calls these.
 */

/** Clock ticks per game minute, hour, and day. */
export const MINUTE = SIM_HZ;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** New worlds start at 09:00 on day 0. */
export const START_CLOCK = 9 * HOUR;
/** The sundial fast-forwards at 60x: a game hour per real second. */
export const FAST_FORWARD = 60;

export type PhaseId = 'phase_dawn' | 'phase_day' | 'phase_dusk' | 'phase_night';

/** When each phase starts, in clock ticks after midnight (section 11). */
export const PHASE_STARTS: readonly { phase: PhaseId; at: number }[] = [
  { phase: 'phase_dawn', at: 5 * HOUR },
  { phase: 'phase_day', at: 7 * HOUR },
  { phase: 'phase_dusk', at: 18 * HOUR },
  { phase: 'phase_night', at: 20 * HOUR },
];

/** The sundial snaps to these on release (phase starts, and midnight for the secret). */
export const SNAP_POINTS: readonly number[] = [0, ...PHASE_STARTS.map((p) => p.at)];
/** Released within this much of a snap point, the dial snaps to it: 15 game minutes. */
export const SNAP_WITHIN = 15 * MINUTE;

export type WeatherId =
  | 'weather_clear'
  | 'weather_cloudy'
  | 'weather_rain'
  | 'weather_wind'
  | 'weather_rainbow'
  | 'weather_shooting_stars';

export const WEATHER_IDS: readonly WeatherId[] = [
  'weather_clear',
  'weather_cloudy',
  'weather_rain',
  'weather_wind',
  'weather_rainbow',
  'weather_shooting_stars',
];

/** Chances when the weather changes (section 11). Rainbows follow rain; shooting stars come at night. */
export const WEATHER_CHANCES: readonly { weather: WeatherId; weight: number }[] = [
  { weather: 'weather_clear', weight: 50 },
  { weather: 'weather_cloudy', weight: 20 },
  { weather: 'weather_rain', weight: 18 },
  { weather: 'weather_wind', weight: 12 },
];

/** Weather changes every 6 to 12 real minutes. */
export const CHANGE_MIN = 6 * 60 * SIM_HZ;
export const CHANGE_MAX = 12 * 60 * SIM_HZ;
/** Each state runs at least 3 minutes before the next random change. */
export const MIN_RUN = 3 * 60 * SIM_HZ;
/** A rainbow follows rain 60 percent of the time and lasts 90 s. */
export const RAINBOW_CHANCE = 0.6;
export const RAINBOW_TICKS = 90 * SIM_HZ;
/** A clear night has a 10 percent chance of shooting stars, one every 20 s. */
export const STARS_CHANCE = 0.1;
export const STAR_EVERY = 20 * SIM_HZ;
/** A windy spell blows this hard (m/s), one way or the other. */
export const WIND_SPEED: readonly [number, number] = [1.4, 2.4];
/** The weather vane's gust: 20 s at this speed. */
export const GUST_TICKS = 20 * SIM_HZ;
export const GUST_SPEED = 3.6;
/** Three clicks on the vane within 2 s start a gust. */
export const VANE_CLICKS = 3;
export const VANE_WINDOW = 2 * SIM_HZ;
/** A sundial skip this long ends the rain. */
export const RAIN_SKIP = 2 * HOUR;
/** Clicking the sun on the sundial this many times within 4 s puts sunglasses on the sun. */
export const SUN_CLICKS = 5;
export const SUN_WINDOW = 4 * SIM_HZ;
/** Puddles fill in 30 s of rain and last 3 minutes after it. */
export const PUDDLE_FILL = 1 / 30;
export const PUDDLE_DRY = 1 / 180;

export interface SkyState {
  /** Game time in clock ticks since 00:00 on day 0. Only ever goes forward. */
  clock: number;
  weather: WeatherId;
  /** Sim tick the weather started, and the tick the next change is due. */
  since: number;
  next: number;
  /** Wind of the weather itself, m/s (positive blows right). */
  wind: number;
  /** A gust from the weather vane: which way, and until which sim tick. */
  gust: { dir: 1 | -1; until: number } | null;
  /** The vane's rooster: which way it points, recent clicks, and when its last spin ends. */
  vane: { facing: 1 | -1; clicks: number[]; spinUntil: number };
  /** The sundial is fast-forwarding toward this clock. `held` while the player still turns it. */
  dial: { target: number; from: number; held: boolean } | null;
  /** Recent clicks on the sun painted on the sundial. */
  sunClicks: number[];
  /** The day (clock / DAY) the sun wears sunglasses, or -1. */
  shades: number;
  /** The night whose shooting-star chance was rolled (day index), and when the next star falls. */
  starsRolled: number;
  starAt: number;
  /** Rain puddles by fixture ID, 0 (dry) to 1 (full). */
  puddles: Record<string, number>;
  /** Sim tick the rain last stopped, or -1. */
  rainEnded: number;
  /** The clock when the knothole last gave something, or -1. */
  knotholeAt: number;
  /** Recent lights toggled near the reeds at night: sim ticks. */
  flashes: number[];
  /** The weather's own random stream, so weather never shifts the bugs' dice. */
  rng: RngState;
}

export function newSkyState(seed: string, tick = 0): SkyState {
  const rng = new Rng(`${seed}-sky`);
  const next = tick + rng.int(CHANGE_MIN, CHANGE_MAX);
  return {
    clock: START_CLOCK,
    weather: 'weather_clear',
    since: tick,
    next,
    wind: 0,
    gust: null,
    vane: { facing: -1, clicks: [], spinUntil: -1 },
    dial: null,
    sunClicks: [],
    shades: -1,
    starsRolled: -1,
    starAt: -1,
    puddles: {},
    rainEnded: -1,
    knotholeAt: -1,
    flashes: [],
    rng: rng.getState(),
  };
}

/** Clock ticks since midnight. */
export function timeOfDay(clock: number): number {
  return ((clock % DAY) + DAY) % DAY;
}

/** Which day it is (0 is the first). */
export function dayOf(clock: number): number {
  return Math.floor(clock / DAY);
}

/** Hours since midnight, as a fraction: 13.5 is 13:30. */
export function hourOf(clock: number): number {
  return timeOfDay(clock) / HOUR;
}

/** The phase at a clock: dawn 05:00, day 07:00, dusk 18:00, night 20:00. */
export function phaseAt(clock: number): PhaseId {
  const t = timeOfDay(clock);
  let phase: PhaseId = 'phase_night';
  for (const p of PHASE_STARTS) if (t >= p.at) phase = p.phase;
  return phase;
}

/** "HH:MM", for debugging and tests. */
export function clockLabel(clock: number): string {
  const m = Math.floor(timeOfDay(clock) / MINUTE);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Where a released sundial lands: on the nearest snap point within 15
 * minutes of `target` (a phase start or midnight), never before `now`.
 */
export function snapDial(target: number, now: number): number {
  const day = dayOf(target);
  let best = target;
  let bestGap = SNAP_WITHIN + 1;
  for (const d of [day - 1, day, day + 1])
    for (const at of SNAP_POINTS) {
      const point = d * DAY + at;
      const gap = Math.abs(point - target);
      if (gap <= SNAP_WITHIN && gap < bestGap && point >= now) {
        best = point;
        bestGap = gap;
      }
    }
  return Math.max(now, best);
}

/** Pick the next weather from the chance table. */
export function rollWeather(rng: Rng): WeatherId {
  const total = WEATHER_CHANCES.reduce((a, c) => a + c.weight, 0);
  let roll = rng.range(0, total);
  for (const c of WEATHER_CHANCES) {
    roll -= c.weight;
    if (roll < 0) return c.weather;
  }
  return 'weather_clear';
}

/** Is it rain right now? */
export function isRaining(sky: SkyState): boolean {
  return sky.weather === 'weather_rain';
}

/** Wind right now, m/s: the vane's gust wins over the weather's. */
export function windOf(sky: SkyState, tick: number): number {
  if (sky.gust && tick < sky.gust.until) return sky.gust.dir * GUST_SPEED;
  return sky.weather === 'weather_wind' || sky.weather === 'weather_rain' ? sky.wind : 0;
}

/** Daylight for rainbows: from dawn to the end of dusk. */
export function isDaylight(clock: number): boolean {
  return phaseAt(clock) !== 'phase_night';
}
