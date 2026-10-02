// Which music should play: the area at the camera's center, the time of day,
// or the menu, and how to get there (docs/05-music-brief.md sections 1 and
// 7.11). Pure, so the borders, the dead zone, and the phase changes are unit
// tested.

import type { RulesPhase } from './musicManifest';

/** Game minutes are 60 sim ticks (sky.ts). */
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The camera center must be this far past a border before the music follows... */
export const DEAD_ZONE = 0.5;
/** ...or have stayed past it this long. */
export const DEAD_ZONE_SECONDS = 1;
/** A clock jump bigger than this between frames is the sundial skipping time. */
const SKIP_MINUTES = 20;

/** How a change of track sounds. */
export type FadeKind = 'area' | 'phase' | 'skip' | 'menu';

/** Crossfade lengths: an area change takes 2 bars, the others fixed seconds. */
export function fadeSeconds(kind: FadeKind, bpm: number, beatsPerBar = 4): number {
  switch (kind) {
    case 'area':
      return (2 * beatsPerBar * 60) / bpm;
    case 'phase':
      return 12;
    case 'skip':
      return 4;
    case 'menu':
      return 1.5;
  }
}

/**
 * Day or night music for a clock (ticks): night from 19:00, day from 06:00,
 * the middle of dusk and dawn (section 1).
 */
export function musicPhase(clock: number): RulesPhase {
  const t = ((clock % DAY) + DAY) % DAY;
  return t >= 19 * HOUR || t < 6 * HOUR ? 'night' : 'day';
}

/**
 * The first game hour of dusk (18:00 to 19:00) or dawn (05:00 to 06:00):
 * the outgoing track thins out before the crossfade.
 */
export function thinning(clock: number): boolean {
  const t = ((clock % DAY) + DAY) % DAY;
  return (t >= 18 * HOUR && t < 19 * HOUR) || (t >= 5 * HOUR && t < 6 * HOUR);
}

export interface AreaSpan {
  id: string;
  x0: number;
  x1: number;
}

export interface PickInput {
  /** On the menu (no world). */
  menu: boolean;
  /** The camera's center, world meters. */
  centerX: number;
  areas: readonly AreaSpan[];
  /** The sky clock, sim ticks. */
  clock: number;
}

export interface Pick {
  /** The area the music follows, or null on the menu. */
  area: string | null;
  phase: RulesPhase;
  thinning: boolean;
  /** Set on the frame the target changed: how to fade to it. */
  fade: FadeKind | null;
}

function areaAt(areas: readonly AreaSpan[], x: number): AreaSpan | null {
  for (const a of areas) if (x >= a.x0 && x < a.x1) return a;
  if (areas.length === 0) return null;
  return x < areas[0]!.x0 ? areas[0]! : areas[areas.length - 1]!;
}

/** Follows the camera and the clock with a dead zone at borders. */
export class MusicPicker {
  private area: string | null = null;
  private phase: RulesPhase | null = null;
  private clock: number | null = null;
  private menu: boolean | null = null;
  /** How long the camera has sat in another area than the music's. */
  private away = 0;

  update(input: PickInput, dt: number): Pick {
    let fade: FadeKind | null = null;
    if (input.menu) {
      if (this.menu !== true) fade = 'menu';
      this.menu = true;
      this.area = null;
      this.clock = null;
      this.phase = 'day';
      return { area: null, phase: 'day', thinning: false, fade };
    }
    const fromMenu = this.menu !== false;
    this.menu = false;
    const here = areaAt(input.areas, input.centerX);
    if (this.area === null || fromMenu) {
      this.area = here?.id ?? null;
      this.away = 0;
      fade = 'menu';
    } else if (here && here.id !== this.area) {
      const current = input.areas.find((a) => a.id === this.area);
      // Distance past the music's area's edge.
      const past = current
        ? Math.max(current.x0 - input.centerX, input.centerX - current.x1)
        : Number.POSITIVE_INFINITY;
      this.away += dt;
      if (past >= DEAD_ZONE || this.away >= DEAD_ZONE_SECONDS) {
        this.area = here.id;
        this.away = 0;
        fade = 'area';
      }
    } else this.away = 0;
    const phase = musicPhase(input.clock);
    const jumped = this.clock !== null && Math.abs(input.clock - this.clock) > SKIP_MINUTES * MINUTE;
    if (this.phase !== null && phase !== this.phase && fade === null) fade = jumped ? 'skip' : 'phase';
    this.phase = phase;
    this.clock = input.clock;
    return { area: this.area, phase, thinning: thinning(input.clock), fade };
  }
}
