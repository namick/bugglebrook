// What the bug AI may read about the world (`BugWorld`), built once a step by the sim.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { EntityId } from './core/entities';
import type { BugWorld, LooseItem, OtherBug } from './systems/bugAi';
import type { Machines } from './systems/bugTypes';
import { hourOf } from './systems/sky';
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
  let machines: Machines | null = null;
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
    machines: () => (machines ??= machinesOf(sim)),
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

/** A bug pushes the sundial only between these hours: never into the evening, so bedtime stays put. */
export const DIAL_HOURS: readonly [number, number] = [7, 14.5];

/** The machines of the newer areas, for the bug AI (R20). */
export function machinesOf(sim: Sim): Machines {
  const awake = (areaId: string): boolean => sim.barriers.isOpen(areaId) && !sim.isAreaAsleep(areaId);
  const one = (kind: Parameters<Sim['places']['fixtures']>[0]) => {
    const f = sim.places.fixtures(kind)[0];
    return f && awake(f.area.id) ? f : null;
  };
  const dialFix = one('sundial');
  let dial: Machines['dial'] = null;
  if (dialFix) {
    const hour = hourOf(sim.weather.state.clock);
    const view = sim.focus;
    // Only where somebody can see it, and only in the day's middle.
    const seen = !view || (dialFix.x > view.x0 && dialFix.x < view.x1);
    dial = {
      x: dialFix.x,
      y: dialFix.fixture.y,
      turnable: seen && !sim.weather.fastForward && hour >= DIAL_HOURS[0] && hour <= DIAL_HOURS[1],
    };
  }
  const slideFix = one('leaf_slide');
  const pit = one('bead_pit');
  const pitHalf = (pit?.fixture.w ?? 4) / 2;
  const jar = one('jar_claw') ? sim.places.jar() : null;
  return {
    dial,
    bench: sim.bench.bugView(),
    cauldron: sim.cauldron.bugView(),
    // The top is a step down from the perch, where a bug standing up there fits.
    slide: slideFix
      ? {
          topX: slideFix.x - 1,
          topY: slideFix.fixture.y + 0.3,
          bottomX: slideFix.x - (slideFix.fixture.w ?? 4.6),
        }
      : null,
    beads: pit ? { x0: pit.x - pitHalf + 0.7, x1: pit.x + pitHalf - 0.7, y: pit.fixture.y } : null,
    trash: sim.trash.bugView(),
    walls: jar ? [{ x0: jar.x0, x1: jar.x1 }] : [],
    sequencer: sequencerView(sim, awake),
  };
}

/** The mushroom sequencer's bank for the bug AI (M9). */
function sequencerView(sim: Sim, awake: (areaId: string) => boolean): Machines['sequencer'] {
  const f = sim.places.fixtures('sequencer')[0];
  const layout = sim.places.sequencerLayout();
  if (!f || !layout || !awake(f.area.id)) return null;
  const s = sim.places.sequencer;
  const x0 = layout.x0;
  const x1 = layout.x0 + 8 * layout.cell;
  return {
    x0,
    x1,
    y: sim.surfaceY((x0 + x1) / 2),
    free: s.bug === null && s.patterns[s.current].every((r) => r === 0),
    tapper: s.bug?.id ?? null,
  };
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
