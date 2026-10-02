import type { EntityId } from '../core/entities';
import type { AreaDef, FixtureDef } from '../data/types';
import type { Sim } from '../sim';
import { Depths, newDepthsState } from './depths';
import type { DepthsState } from './depths';
import { Hollow, newHollowState } from './hollow';
import type { HollowState } from './hollow';

/**
 * M10's hidden areas (game design doc, section 3): the Ant Hill Depths and
 * Gnome Hollow. They lie past the surface strip in world x, each sealed by
 * solid walls and a ceiling (`AreaDef.hidden`), so nothing walks, rolls, or
 * is dragged in or out. The only ways through are the doorways, in pairs:
 * the ant hill in the plaza and the shaft's top in the depths; the gnome's
 * hat in the flowerbed and the round door in the hollow. The renderer plays
 * an iris wipe and moves the camera; at the wipe's middle it sends `travel`,
 * and whatever the hand holds comes along. The pocket works anywhere.
 *
 * `Depths` and `Hollow` run each area's fixtures and secrets. Their state is
 * saved as `world.hidden` (optional: older saves get a fresh one).
 */

/** A doorway: a fixture with a `door`, with its world position. */
export interface Door {
  id: string;
  kind: FixtureDef['kind'];
  area: AreaDef;
  /** The doorway on the other side. */
  to: string;
  x: number;
  y: number;
  radius: number;
}

export interface HiddenState {
  depths: DepthsState;
  hollow: HollowState;
}

export function newHiddenState(): HiddenState {
  return { depths: newDepthsState(), hollow: newHollowState() };
}

/** Problems with a saved `world.hidden` (an empty list if it is fine). */
export function hiddenProblems(h: unknown): string[] {
  if (typeof h !== 'object' || h === null) return ['not an object'];
  const s = h as Record<string, unknown>;
  const out: string[] = [];
  const d = s.depths as Record<string, unknown> | undefined;
  if (typeof d !== 'object' || d === null) out.push('depths missing');
  else {
    if (typeof d.queenFed !== 'number' || !Number.isFinite(d.queenFed)) out.push('depths.queenFed');
    if (
      d.sugar !== null &&
      (typeof d.sugar !== 'object' || typeof (d.sugar as { id?: unknown }).id !== 'number')
    )
      out.push('depths.sugar');
  }
  const o = s.hollow as Record<string, unknown> | undefined;
  if (typeof o !== 'object' || o === null) out.push('hollow missing');
  else if (typeof o.finale !== 'number' || !Number.isFinite(o.finale)) out.push('hollow.finale');
  return out;
}

export class Hidden {
  readonly depths: Depths;
  readonly hollow: Hollow;
  private readonly list: Door[] = [];

  constructor(private readonly sim: Sim) {
    for (const area of sim.content.areas.all)
      for (const f of area.fixtures ?? [])
        if (f.door)
          this.list.push({
            id: f.id,
            kind: f.kind,
            area,
            to: f.door,
            x: area.xStart + f.x,
            y: f.y,
            radius: f.radius,
          });
    this.depths = new Depths(sim);
    this.hollow = new Hollow(sim);
  }

  get state(): HiddenState {
    return { depths: this.depths.state, hollow: this.hollow.state };
  }

  restore(state: HiddenState): void {
    this.depths.restore({ ...newDepthsState(), ...state.depths });
    this.hollow.restore({ ...newHollowState(), ...state.hollow });
  }

  serialize(): HiddenState {
    return JSON.parse(JSON.stringify(this.state)) as HiddenState;
  }

  /** Once physics exists (and again after loading): the root comes out if it was pulled. */
  build(): void {
    this.depths.build();
  }

  // --- Areas ---------------------------------------------------------------

  /** The hidden area at world x, or null on the surface. */
  hiddenAt(x: number): AreaDef | null {
    const a = this.sim.areaOf(x);
    return a.hidden && x >= a.xStart && x < a.xEnd ? a : null;
  }

  /**
   * Which areas sleep, given the camera's view: inside a hidden area, only
   * that area is awake; out on the surface, no hidden area is. Null means
   * the usual rule (a screen's gap) decides.
   */
  asleepFor(area: AreaDef, view: { x0: number; x1: number }): boolean | null {
    const inside = this.hiddenAt((view.x0 + view.x1) / 2);
    if (inside) return area.id !== inside.id;
    return area.hidden ? true : null;
  }

  // --- Doorways ------------------------------------------------------------

  doors(): readonly Door[] {
    return this.list;
  }

  door(id: string): Door | null {
    return this.list.find((d) => d.id === id) ?? null;
  }

  /** A doorway works once both its sides are open (the hidden area was found). */
  doorOpen(id: string): boolean {
    const d = this.door(id);
    const to = d ? this.door(d.to) : null;
    if (!d || !to) return false;
    return this.sim.barriers.isOpen(d.area.id) && this.sim.barriers.isOpen(to.area.id);
  }

  /** The open doorway at (x, y), if any. */
  doorAt(x: number, y: number, pad = 0): Door | null {
    for (const d of this.list)
      if (Math.hypot(x - d.x, y - d.y) <= d.radius + pad && this.doorOpen(d.id)) return d;
    return null;
  }

  /** Where something comes out of a doorway: just inside it, below its middle. */
  exitPoint(d: Door): { x: number; y: number } {
    return { x: d.x, y: d.y + d.radius * 0.5 };
  }

  /**
   * Go through doorway `id` (the `travel` command, sent at the iris wipe's
   * middle): whatever the hand holds comes out at the other side, still held.
   * Returns the other side's doorway, or null if the way is shut.
   */
  travel(id: string): Door | null {
    const sim = this.sim;
    const from = this.door(id);
    const to = from ? this.door(from.to) : null;
    if (!from || !to || !this.doorOpen(id)) return null;
    const out = this.exitPoint(to);
    const held: EntityId | null = sim.physics.grabbed;
    if (held !== null && sim.entities.has(held)) {
      const angle = sim.physics.getState(held).angle;
      sim.physics.place(held, out.x, out.y, angle);
      sim.physics.moveGrab(out.x, out.y);
      sim.worldCache = null;
      sim.linkedCache = null;
    }
    // Look there now, so its area wakes before the next step's sleep check.
    sim.focus = { x0: out.x - 9.6, x1: out.x + 9.6 };
    sim.updateSleep();
    sim.events.emit('doorway_used', {
      from: from.id,
      to: to.id,
      area: to.area.id,
      x: from.x,
      y: from.y,
      toX: out.x,
      toY: out.y,
      carried: held,
    });
    return to;
  }

  // --- Per step and hooks ----------------------------------------------------

  update(): void {
    this.depths.update();
    this.hollow.update();
  }

  /** A click on one of M10's fixtures. True if it did something. */
  poke(f: { id: string; kind: FixtureDef['kind']; x: number; y: number }): boolean {
    return this.depths.poke(f) || this.hollow.poke(f);
  }

  /** The player let go of something gently: the gnome's nose hole and the moon pedestal take things. */
  released(id: EntityId): void {
    const e = this.sim.entities.get(id);
    if (!e) return;
    this.hollow.released(e);
  }
}
