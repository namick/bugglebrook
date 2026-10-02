import { WORLD_CEILING_Y } from '../constants';
import type { Entity } from '../core/entities';
import type { Sim } from '../sim';

/**
 * Nothing is ever lost (R01 of the post-M8 review). Physics keeps bodies
 * under a speed limit inside a closed box, but a sweep checks anyway: a
 * thing that ends up outside the world, above its lid, or fallen through
 * the ground drops back in from the sky over the nearest open area, with a
 * puff (`entity_returned`). Shallow sinking is `Sim.rescueBuried`'s job.
 */

/** Below the ground by more than this (m), a thing has fallen out of the world. */
export const FELL_THROUGH_DEPTH = 1.2;
/** The sweep runs this often (ticks). */
export const SWEEP_TICKS = 15;
/** Returned things drop in from here: just above the top of the screen. */
export const RETURN_Y = -0.5;
/** Keep returned things this far inside the open stretch (m). */
const EDGE_MARGIN = 1.5;
/** Candidate drop spots are this far apart (m). */
const TRY_STEP = 1.1;
const TRIES = 16;
/** Keep this far clear of the player's setups (m). */
const SETUP_CLEARANCE = 1.5;

/** Is (x, y) outside the world: past an end wall, above the lid, or under the ground? */
export function outOfBounds(x: number, y: number, width: number, floor: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return x < 0 || x > width || y < WORLD_CEILING_Y || y > floor + FELL_THROUGH_DEPTH;
}

/**
 * Where to try dropping something lost near x: x clamped into [lo, hi],
 * then spots further out on alternating sides, nearest first, all inside.
 */
export function dropSpots(x: number, lo: number, hi: number, step = TRY_STEP, tries = TRIES): number[] {
  if (hi < lo) return [(lo + hi) / 2];
  const start = Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : (lo + hi) / 2;
  const out = [start];
  for (let i = 1; out.length < tries && i <= tries; i++)
    for (const dir of [1, -1]) {
      const c = start + dir * i * step;
      if (c >= lo && c <= hi && out.length < tries) out.push(c);
    }
  return out;
}

export class Bounds {
  /** How many things the sweep has brought back. Tests expect zero after ordinary play. */
  returned = 0;

  constructor(private readonly sim: Sim) {}

  update(): void {
    if (this.sim.tick % SWEEP_TICKS === 0) this.sweep();
  }

  /** Bring back everything outside the world. Returns how many came back. */
  sweep(): number {
    const sim = this.sim;
    let n = 0;
    for (const e of sim.entities.all()) {
      if (!sim.physics.has(e.id) || sim.isPocketed(e.id) || sim.physics.grabbed === e.id) continue;
      // Things in a mouth or in front legs go where their bug puts them.
      if (!sim.physics.isActive(e.id) && !sim.isSleeping(e.id)) continue;
      const p = sim.physics.position(e.id);
      const floor = Number.isFinite(p.x) ? sim.surfaceY(Math.min(sim.worldWidth, Math.max(0, p.x))) : 0;
      if (!outOfBounds(p.x, p.y, sim.worldWidth, floor)) continue;
      this.bringBack(e, p.x);
      n++;
    }
    this.returned += n;
    return n;
  }

  /** Drop a lost thing in from the sky over the open stretch nearest to `fromX`. */
  private bringBack(e: Entity, fromX: number): void {
    const sim = this.sim;
    const half = sim.halfHeight(e);
    // One-of-a-kind things go home, where they first appeared (M10).
    if (e.home) {
      const x = e.home.x;
      const y = Math.min(e.home.y, sim.surfaceY(x) - half - 0.05);
      sim.bringBack(e, x, y);
      sim.events.emit('entity_returned', {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        fromX: Number.isFinite(fromX) ? fromX : x,
        x,
        y,
      });
      return;
    }
    const span = sim.barriers.span();
    const setups = sim.bugWorld().setups;
    let spot: { x: number; y: number } | null = null;
    for (const x of dropSpots(fromX, span.x0 + EDGE_MARGIN, span.x1 - EDGE_MARGIN)) {
      if (setups.some((s) => x > s.x0 - SETUP_CLEARANCE && x < s.x1 + SETUP_CLEARANCE)) continue;
      const y = this.dropY(x, half);
      if (sim.physics.solidNear(x, y, half + 0.1)) continue;
      spot = { x, y };
      break;
    }
    if (!spot) {
      const x = dropSpots(fromX, span.x0 + EDGE_MARGIN, span.x1 - EDGE_MARGIN)[0]!;
      spot = { x, y: this.dropY(x, half) };
    }
    sim.bringBack(e, spot.x, spot.y);
    sim.events.emit('entity_returned', {
      id: e.id,
      kind: e.kind,
      defId: e.defId,
      fromX: Number.isFinite(fromX) ? fromX : spot.x,
      x: spot.x,
      y: spot.y,
    });
  }

  /** Under a roof, just below it; out in the open, from above the screen. */
  private dropY(x: number, half: number): number {
    const area = this.sim.areaOf(x);
    const roof = area.roof;
    const local = x - area.xStart;
    if (roof && local >= roof.x0 && local <= roof.x1) return roof.y + half + 0.3;
    return RETURN_Y - half;
  }
}
