// What the bug AI may read about the world (`BugWorld`), built once a step by the sim.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { EntityId } from './core/entities';
import type { BugWorld, LooseItem, OtherBug } from './systems/bugAi';
import type { Sim } from './sim';
import { halfExtents } from './simShared';

/** What the bug AI can ask about the world, built once per step. */
export function bugWorld(
  sim: Sim,
): BugWorld & { setups: { id: EntityId; x0: number; x1: number; y0: number; y1: number }[] } {
  const cached = sim.worldCache as (BugWorld & { setups: never[] }) | null;
  if (cached) return cached;
  const physics = sim.physics;
  const bugs: OtherBug[] = [];
  for (const e of sim.entities.ofKind('bug')) {
    // Bugs waiting to be found are not part of anyone's day yet.
    if (sim.isSleeping(e.id) || !e.bug || e.bug.pending) continue;
    const st = physics.getState(e.id);
    bugs.push({
      id: e.id,
      defId: e.defId,
      def: sim.bugDef(e),
      brain: e.bug,
      x: st.x,
      y: st.y,
      vx: st.vx,
      vy: st.vy,
      supported: physics.supportNormal(e.id) !== null || sim.environment.skating.has(e.id),
      held: physics.grabbed === e.id,
    });
  }
  const byId = new Map(bugs.map((b) => [b.id, b]));
  const setups: { id: EntityId; x0: number; x1: number; y0: number; y1: number }[] = [];
  // The player's things, and anything leaning on them: pushing one pushes the setup.
  for (const id of [...sim.setupLinked()].sort((a, b) => a - b)) {
    const e = sim.entities.get(id);
    if (!e || sim.isSleeping(id)) continue;
    const st = physics.getState(id);
    const ext = halfExtents(sim.content.items.get(e.defId).shape, st.angle);
    setups.push({ id, x0: st.x - ext.w, x1: st.x + ext.w, y0: st.y - ext.h, y1: st.y + ext.h });
  }
  // Loose things are worked out the first time a bug asks sim step.
  let loose: LooseItem[] | null = null;
  const looseItems = (): LooseItem[] => {
    if (loose) return loose;
    loose = [];
    const linked = sim.setupLinked();
    const owners = sim.mouthOwners();
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || linked.has(e.id)) continue;
      if (physics.grabbed === e.id || sim.carried.has(e.id) || owners.has(e.id) || !physics.isActive(e.id))
        continue;
      const def = sim.content.items.get(e.defId);
      const st = physics.getState(e.id);
      const ext = halfExtents(def.shape, st.angle);
      if (sim.environment.overOpenWater(st.x)) continue;
      // Right beside the player's things: leave it be.
      if (
        setups.some(
          (b) =>
            st.x + ext.w > b.x0 - 0.9 &&
            st.x - ext.w < b.x1 + 0.9 &&
            Math.abs(st.y - (b.y0 + b.y1) / 2) < 1.5,
        )
      )
        continue;
      loose.push({
        id: e.id,
        defId: e.defId,
        x: st.x,
        y: st.y,
        speed: Math.hypot(st.vx, st.vy),
        edible: def.tags.includes('tag_edible'),
        catchable: !!def.catchable,
        halfWidth: ext.w,
        top: st.y - ext.h,
      });
    }
    return loose;
  };
  const slime = sim.environment.state.slime;
  const world = {
    setups,
    bugs: () => bugs,
    bug: (id: EntityId) => byId.get(id) ?? null,
    setupNear: (x: number, y: number, reach: number, except: EntityId | null = null) =>
      setups.some(
        (b) => b.id !== except && b.x1 > x - reach && b.x0 < x + reach && b.y1 > y - 1.1 && b.y0 < y + 1.1,
      ),
    setupBetween: (x0: number, x1: number) => setups.some((b) => b.x1 > x0 && b.x0 < x1),
    loose: looseItems,
    isSetup: (id: EntityId) => sim.setup.has(id),
    edible: (defId: string) =>
      sim.content.items.has(defId) && sim.content.items.get(defId).tags.includes('tag_edible'),
    affinity: (a: string, b: string) => sim.affinityOf(a, b),
    slimeAt: (x: number, y: number) =>
      slime.some((t) => x >= t.x0 && x <= t.x1 && Math.abs(y - t.y) < 0.5 && t.until > sim.tick),
    surfaceY: (x: number) => sim.terrain.surfaceY(x),
    view: sim.focus,
    summit: (x: number) => sim.summitOf(x),
    waterEdge: (x: number) => sim.waterEdge(x),
    stage: () => sim.places.stage(),
    isLight: (id: EntityId) => sim.hasTag(id, 'tag_light'),
    cover: (x: number, fromX: number) => {
      let best: { id: EntityId; x: number } | null = null;
      for (const e of sim.entities.ofKind('item')) {
        if (sim.isSleeping(e.id) || !physics.isActive(e.id) || physics.grabbed === e.id) continue;
        const def = sim.content.items.get(e.defId);
        const st = physics.getState(e.id);
        const ext = halfExtents(def.shape, st.angle);
        if (ext.w < 0.2 || ext.h < 0.07 || Math.abs(st.x - x) > 3.5 || sim.environment.waterAt(st.x))
          continue;
        if (Math.abs(st.x - fromX) < 0.5) continue;
        if (!best || Math.abs(st.x - x) < Math.abs(best.x - x)) best = { id: e.id, x: st.x };
      }
      return best;
    },
  };
  sim.worldCache = world;
  return world;
}

/** The flat top of the highest ground in the area around x, at least 1.5 m up. */
export function summitOf(sim: Sim, x: number): { x0: number; x1: number; y: number } | null {
  if (!sim.summits) {
    sim.summits = new Map();
    for (const area of sim.content.areas.all) {
      const pts = area.terrain.map(([px, py]) => [area.xStart + px, py] as const);
      const top = Math.min(...pts.map((p) => p[1]));
      const ground = [...pts.map((p) => p[1])].sort((a, b) => a - b)[Math.floor(pts.length / 2)]!;
      const flat = pts.filter((p) => p[1] - top < 0.02);
      const x0 = Math.min(...flat.map((p) => p[0])) + 0.4;
      const x1 = Math.max(...flat.map((p) => p[0])) - 0.4;
      sim.summits.set(area.id, ground - top >= 1.5 && x1 - x0 >= 0.8 ? { x0, x1, y: top } : null);
    }
  }
  return sim.summits.get(sim.areaOf(x).id) ?? null;
}

/** The dry spot nearest x from which a bug can hop into water, and which way the water lies. */
export function waterEdge(sim: Sim, x: number): { x: number; dir: 1 | -1 } | null {
  let best: { x: number; dir: 1 | -1 } | null = null;
  for (const w of sim.environment.surfaces()) {
    for (const edge of [
      { x: w.left - 0.45, dir: 1 as const },
      { x: w.right + 0.45, dir: -1 as const },
    ])
      if (!best || Math.abs(edge.x - x) < Math.abs(best.x - x)) best = edge;
  }
  return best;
}
