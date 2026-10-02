// The ambience beds' mix (docs/08-sound-brief.md, part 6.6): from where the
// camera is, the time of day, and the weather, the gain every bed should
// have. Pure, so Vitest checks each rule; `AmbiencePlayer` makes it so.

import { AREA_BEDS } from './sfxCatalog';

export interface AmbienceArea {
  /** The area's mood (`garden`, `pond`, `plaza`, ...), which names its beds. */
  mood: string;
  x0: number;
  x1: number;
  /** Open, or still locked behind its barrier (the camera's preview). */
  open: boolean;
  /** A sealed hidden area (M10): no neighbors, no weather. */
  hidden: boolean;
}

export interface AmbienceInput {
  areas: readonly AmbienceArea[];
  /** The camera's middle, world meters. */
  x: number;
  /** How far into night the beds are: 0 day, 1 night (see `nightMix`, eased by the player). */
  night: number;
  rain: number;
  wind: number;
}

/** Within this many meters of a border, the neighbor's bed fades in. */
export const BORDER_FADE = 4;
/** A locked area heard from its preview. */
export const LOCKED_GAIN = 0.35;

/** Dusk runs 18:00 to 20:00 and dawn 05:00 to 07:00: the night share by clock time, 0 to 1. */
export function nightMix(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 20 || h < 5) return 1;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18) return (h - 18) / 2;
  return 1 - (h - 5) / 2;
}

/** Equal-power crossfade: the two gains for a mix of `t` (0 all `a`, 1 all `b`). */
export function equalPower(t: number): [number, number] {
  const c = Math.max(0, Math.min(1, t));
  return [Math.cos((c * Math.PI) / 2), Math.sin((c * Math.PI) / 2)];
}

/** The areas heard at `x`, with their equal-power weights (one, or two near a border). */
export function areaWeights(areas: readonly AmbienceArea[], x: number): { area: AmbienceArea; w: number }[] {
  if (areas.length === 0) return [];
  const here =
    areas.find((a) => x >= a.x0 && x < a.x1) ??
    areas.reduce((best, a) =>
      Math.abs(x - (a.x0 + a.x1) / 2) < Math.abs(x - (best.x0 + best.x1) / 2) ? a : best,
    );
  if (here.hidden) return [{ area: here, w: 1 }];
  const left = x - here.x0;
  const right = here.x1 - x;
  const near = left < right ? areas.find((a) => a.x1 === here.x0) : areas.find((a) => a.x0 === here.x1);
  const d = Math.min(left, right);
  if (!near || near.hidden || d >= BORDER_FADE) return [{ area: here, w: 1 }];
  // At the border itself, half and half.
  const [mine, theirs] = equalPower(0.5 - d / (2 * BORDER_FADE));
  return [
    { area: here, w: mine },
    { area: near, w: theirs },
  ];
}

/** Every bed's target gain, 0 to about 1. Beds not in the result are silent. */
export function bedTargets(input: AmbienceInput): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, g: number): void => {
    if (g > 0.001) out[id] = Math.min(1.5, (out[id] ?? 0) + g);
  };
  const [day, night] = equalPower(input.night);
  const rain = Math.max(0, Math.min(1, input.rain));
  const wind = Math.max(0, Math.min(1, input.wind));
  for (const { area, w } of areaWeights(input.areas, input.x)) {
    const beds = AREA_BEDS[area.mood];
    const porch = area.mood === 'porch';
    const outdoors = !area.hidden && !porch;
    let g = w * (area.open ? 1 : LOCKED_GAIN);
    if (outdoors) g *= 1 - 0.6 * rain;
    else if (porch) g *= 1 - 0.2 * rain;
    if (beds) {
      if (beds.day === beds.night) add(beds.day, g);
      else {
        add(beds.day, g * day);
        add(beds.night, g * night);
      }
    }
    if (area.hidden) continue;
    const weather = w * (area.open ? 1 : LOCKED_GAIN);
    add(porch ? 'board_patter' : 'rain_bed', rain * weather);
    add('wind_bed', wind * 0.8 * weather * (porch ? 0.3 : area.mood === 'arcade' ? 1.2 : 1));
  }
  return out;
}

export interface BusState {
  /** A bug is talking. */
  voice: boolean;
  /** `secret`, `unlock`, or the unlock stinger is playing. */
  stinger: boolean;
  paused: boolean;
}

/** Ducking (part 6.5): the ambience bus's gain (dB) and low-pass. */
export function ambienceBus(s: BusState): { gainDb: number; lowpass: number | null } {
  const duck = s.stinger ? -8 : s.voice ? -4 : 0;
  return s.paused ? { gainDb: duck - 10, lowpass: 900 } : { gainDb: duck, lowpass: null };
}
