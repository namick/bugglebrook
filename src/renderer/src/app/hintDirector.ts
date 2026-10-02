import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { EntityView, Sim } from '../../../game/sim';
import type { PointerController } from '../input/pointerController';
import { LEVER_LENGTH, LEVER_PIVOT, LEVER_REST } from '../render/areaArt/benchLive';
import type { Camera, Point } from '../render/camera';
import { DIAL } from '../render/fixtureArt';
import { AffordanceTracker } from '../render/hints';
import type { HintKey, HintTarget } from '../render/hints';
import type { HintSpot } from '../render/hintView';
import { POCKET, slotRect, trayTop } from '../ui/pocketLayout';
import {
  GhostScheduler,
  cauldronDemo,
  chooseDemo,
  demoDoneBy,
  demosDoneIn,
  dialDemo,
  dragDemo,
  feedDemo,
  flingDemo,
  ghostAt,
  shakeDemo,
  tickleDemo,
  leverDemo,
  pocketDemo,
  spongeDemo,
} from './ghost';
import type { DemoKind, GhostFrame, GhostScript } from './ghost';

/** Demos are staged only where the hand has room: this far inside the screen's sides. */
const MARGIN = 160;
/** Hovering this close to a locked area's wall counts as hovering its barrier (section 2). */
const EDGE_REACH = 1.4;
/** Pocket-sized things for the pocket demo: no bigger than this across, in meters. */
const SMALL = 0.7;

/** Barrier fixture kinds and their hint keys. */
const BARRIER_KEY: Record<string, HintKey> = {
  sunflower: 'barrier_sunflower',
  lattice: 'barrier_lattice',
  can_tunnel: 'barrier_can_tunnel',
  bucket_lift: 'barrier_bucket_lift',
};

/** Hovered fixture kinds and their hint keys. */
const FIXTURE_KEY: Record<string, HintKey> = {
  sundial: 'sundial',
  bench_lever: 'lever',
  cauldron: 'ladle',
  sunflower: 'barrier_sunflower',
  can_tunnel: 'barrier_can_tunnel',
  bucket_lift: 'barrier_bucket_lift',
};

/** What the director needs from the game each frame. */
export interface HintFrame {
  dt: number;
  /** Wall-clock seconds since the last frame (not clamped): idling is counted in real time. */
  wallDt?: number;
  /** No demo now: paused, the first scene, a scene switch, the hand busy. */
  blocked: boolean;
  /** The pointer in view pixels, or null when it is off the window. */
  pointer: Point | null;
  reduced: boolean;
}

/**
 * Runs the teaching hints for one world: the affordance wobbles and glints
 * (`render/hints.ts`) and the ghost-hand demos (`ghost.ts`). It reads the
 * sim, the camera, and the pointer, listens to sim events to learn what the
 * player has done, and never sends a command.
 */
export class HintDirector {
  readonly affordance = new AffordanceTracker();
  readonly ghost = new GhostScheduler();
  /** The world spots the twinkles and shake marks are drawn at. */
  spots: HintSpot[] = [];
  private targets: HintTarget[] = [];
  private lastWorld: Point | null = null;
  private lastView: Point | null = null;
  private worldSpeed = 0;
  private viewSpeed = 0;
  /** The camera's left edge when the running demo began: it stops if the view moves. */
  private demoCamera: number | null = null;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly input: PointerController,
  ) {
    for (const k of demosDoneIn({
      open: sim.barriers.state.open,
      pocketUsed: sim.pocket.slots.some((s) => s.length > 0),
      brewed: sim.cauldron.state.brewed,
      benchUsed: sim.bench.state.made.length > 0,
      secrets: sim.secrets,
    }))
      this.ghost.markDone(k);
    this.unsubscribe.push(
      sim.events.onAny((name, payload) => {
        const kind = demoDoneBy(name, payload);
        if (kind) this.ghost.markDone(kind);
      }),
    );
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
  }

  /** The skip button: the guided start ends. */
  skipGuide(): void {
    this.ghost.skipGuide();
    this.demoCamera = null;
  }

  /** An awake, found bug on screen nearest to `near`, with its mouth. */
  private bugOnScreen(views: readonly EntityView[], near: Point): EntityView | null {
    let best: EntityView | null = null;
    let bestD = Infinity;
    for (const v of views) {
      const b = v.bug;
      if (!b || b.pending || v.held || v.pocket !== undefined || !this.onScreen(v)) continue;
      if (b.mode === 'st_sleep' || b.mode === 'st_airborne' || b.mode === 'st_dizzy') continue;
      const d = Math.hypot(v.x - near.x, v.y - near.y);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  /** The player did something: any demo stops at once. */
  noteInput(): void {
    if (this.pinned) return;
    this.ghost.input();
    this.demoCamera = null;
  }

  private fixture(kind: string): { x: number; y: number; area: string } | null {
    for (const a of this.sim.content.areas.all)
      for (const f of a.fixtures ?? []) if (f.kind === kind) return { x: a.xStart + f.x, y: f.y, area: a.id };
    return null;
  }

  private lattice(views: readonly EntityView[]): EntityView | undefined {
    return views.find((v) => v.defId === 'item_lattice_panel' && !v.held && v.pocket === undefined);
  }

  /** Things that hint right now, and where the twinkles go. */
  private build(views: readonly EntityView[]): void {
    const sim = this.sim;
    const done = this.ghost.done;
    const targets: HintTarget[] = [];
    const spots: HintSpot[] = [];
    const dial = this.fixture('sundial');
    if (dial) {
      targets.push({ key: 'sundial', at: dial, reach: 2.6, done: done.has('dial') });
      spots.push({ key: 'sundial', x: dial.x, y: dial.y - 0.2, size: 1.1, marks: false });
    }
    const lever = this.fixture('bench_lever');
    if (lever && sim.barriers.isOpen(lever.area)) {
      const knob = this.leverKnob() ?? lever;
      targets.push({ key: 'lever', at: knob, reach: 2.2, done: done.has('lever') });
      spots.push({ key: 'lever', x: knob.x, y: knob.y, size: 0.6, marks: true });
    }
    const pot = this.fixture('cauldron');
    if (pot && sim.barriers.isOpen(pot.area)) {
      targets.push({ key: 'ladle', at: pot, reach: 2.8, done: done.has('cauldron') });
      spots.push({ key: 'ladle', x: pot.x + 0.6, y: pot.y - 1.2, size: 0.8, marks: false });
    }
    for (const b of sim.barriers.barriers()) {
      if (!sim.barriers.closed(b)) continue;
      const key = BARRIER_KEY[b.kind];
      if (!key) continue;
      let at: Point = { x: b.x, y: b.y };
      let size = 1;
      if (b.kind === 'lattice') {
        const l = this.lattice(views);
        if (!l) continue;
        at = { x: l.x, y: l.y };
        size = 2.4;
      } else if (b.kind === 'sunflower') {
        // The drooping head, out toward the pond.
        at = { x: b.x + 1.8, y: sim.surfaceY(b.x) - 2.8 };
      } else if (b.kind === 'bucket_lift') {
        const buckets = sim.barriers.buckets();
        if (buckets) at = { x: buckets.x, y: buckets.bottom - 0.5 };
        size = 1.3;
      }
      targets.push({ key, at, reach: 3, done: false });
      spots.push({ key, x: at.x, y: at.y, size, marks: false });
    }
    // The pocket's tab, in view pixels at the bottom middle.
    targets.push({
      key: 'pocket',
      at: { x: VIEW_WIDTH_PX / 2, y: POCKET.viewHeight - 30 },
      reach: 260,
      done: done.has('pocket'),
    });
    this.targets = targets;
    this.spots = spots;
  }

  /** The lever's knob at rest, in world meters. */
  private leverKnob(): Point | null {
    const bench = this.sim.places.fixtures('tinker_bench')[0];
    if (!bench) return null;
    return {
      x: bench.x + LEVER_PIVOT + Math.sin(LEVER_REST) * LEVER_LENGTH,
      y: bench.fixture.y + 0.04 - Math.cos(LEVER_REST) * LEVER_LENGTH,
    };
  }

  /** Which hint the hand is over right now, if any. */
  private hovered(views: readonly EntityView[]): HintKey | null {
    const input = this.input;
    const fk = input.hoverFixtureKind ? FIXTURE_KEY[input.hoverFixtureKind] : undefined;
    if (fk) return fk;
    if (input.hoverId !== null) {
      const v = views.find((q) => q.id === input.hoverId);
      if (v?.defId === 'item_lattice_panel') return 'barrier_lattice';
      return null;
    }
    const w = input.hoverWorld;
    if (!w) return null;
    // The edge of a locked area: its barrier wobbles.
    for (const b of this.sim.barriers.barriers()) {
      if (!this.sim.barriers.closed(b)) continue;
      if (Math.abs(w.x - b.wall) <= EDGE_REACH) return BARRIER_KEY[b.kind] ?? null;
    }
    return null;
  }

  /** One frame. Returns the ghost hand's frame, or null. */
  update(f: HintFrame): GhostFrame | null {
    const views = this.sim.views();
    this.build(views);
    if (this.pinned) {
      const a = this.ghost.active;
      return a ? ghostAt(a.script, a.t) : null;
    }
    const w = this.input.hoverWorld;
    const dt = Math.max(1e-3, f.dt);
    this.worldSpeed =
      w && this.lastWorld ? Math.hypot(w.x - this.lastWorld.x, w.y - this.lastWorld.y) / dt : 0;
    this.viewSpeed =
      f.pointer && this.lastView
        ? Math.hypot(f.pointer.x - this.lastView.x, f.pointer.y - this.lastView.y) / dt
        : 0;
    this.lastWorld = w ? { ...w } : null;
    this.lastView = f.pointer ? { ...f.pointer } : null;
    const busy = this.input.mode !== 'none';
    // Working a fixture by hand counts as found at once (the sim hears of a dial turn only once time has moved).
    if (this.input.mode === 'dial') this.ghost.markDone('dial');
    else if (this.input.mode === 'stir') this.ghost.markDone('cauldron');
    else if (this.input.mode === 'lever') this.ghost.markDone('lever');
    this.affordance.update(
      f.dt,
      this.targets,
      (t) => {
        if (busy) return null;
        if (t.key === 'pocket') return f.pointer ? { at: f.pointer, speed: this.viewSpeed } : null;
        return w ? { at: w, speed: this.worldSpeed } : null;
      },
      busy ? null : this.hovered(views),
    );
    // The view moved under a running demo (a glide, a coast): it no longer points at anything.
    if (this.ghost.active && this.demoCamera !== null && Math.abs(this.camera.x - this.demoCamera) > 0.3)
      this.noteInput();
    const frame = this.ghost.update(
      f.wallDt ?? f.dt,
      f.blocked || busy,
      (allowed) => this.stage(allowed, views),
      f.reduced ? 1.5 : 1,
    );
    if (frame && this.demoCamera === null) this.demoCamera = this.camera.x;
    if (!frame) this.demoCamera = null;
    return frame;
  }

  private toView(p: Point): Point {
    return this.camera.worldToView(p);
  }

  private onScreen(p: Point): boolean {
    const v = this.toView(p);
    return v.x >= MARGIN && v.x <= VIEW_WIDTH_PX - MARGIN && v.y > 80 && v.y < POCKET.viewHeight - 120;
  }

  /** A small loose item on screen, closest to `near` (world meters), for the hand to pretend to carry. */
  private smallItem(views: readonly EntityView[], near: Point, max = Infinity): EntityView | null {
    let best: EntityView | null = null;
    let bestD = max;
    for (const v of views) {
      if (v.kind !== 'item' || v.held || v.pocket !== undefined || !this.onScreen(v)) continue;
      const def = this.sim.content.items.tryGet(v.defId);
      if (!def) continue;
      const s = def.shape;
      const size = s.type === 'circle' ? s.radius * 2 : Math.max(s.width, s.height);
      if (size > SMALL) continue;
      const d = Math.hypot(v.x - near.x, v.y - near.y);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  /** Build a demo for one of the allowed kinds that fits on screen now. */
  private stage(allowed: DemoKind[], views: readonly EntityView[]): GhostScript | null {
    const scripts = new Map<DemoKind, () => GhostScript | null>();
    const sim = this.sim;
    const dial = this.fixture('sundial');
    if (dial && this.onScreen(dial)) scripts.set('dial', () => dialDemo(this.toView(dial), DIAL));
    const center = this.camera.viewToWorld({ x: VIEW_WIDTH_PX / 2, y: 700 });
    const small = this.smallItem(views, center);
    if (small) {
      const slots = sim.pocketSlots();
      const has = slots.some((s) => s.ids.length > 0);
      const free = Math.max(
        0,
        slots.findIndex((s) => s.ids.length === 0),
      );
      const r = slotRect(free, trayTop(1, has));
      scripts.set('pocket', () =>
        pocketDemo(this.toView(small), { x: r.x + r.w / 2, y: r.y + r.h / 2 }, small.defId),
      );
    }
    const pot = this.fixture('cauldron');
    if (pot && sim.barriers.isOpen(pot.area) && this.onScreen(pot) && !sim.cauldron.bubbling) {
      const item = sim.cauldron.state.contents.length === 0 ? this.smallItem(views, pot, 7) : null;
      scripts.set('cauldron', () =>
        cauldronDemo(
          this.toView({ x: pot.x, y: pot.y }),
          item ? { at: this.toView(item), defId: item.defId } : null,
        ),
      );
    }
    const knob = this.leverKnob();
    const lever = this.fixture('bench_lever');
    if (knob && lever && sim.barriers.isOpen(lever.area) && this.onScreen(knob))
      scripts.set('lever', () => leverDemo(this.toView(knob)));
    const flower = sim.barriers.barrier('sunflower');
    if (flower && sim.barriers.closed(flower)) {
      const soil = { x: flower.x, y: sim.surfaceY(flower.x) };
      const sponge = views.find((v) => v.defId === 'item_sponge' && !v.held && v.pocket === undefined);
      if (sponge && this.onScreen(sponge) && this.onScreen({ x: soil.x + 1, y: soil.y - 1 }))
        scripts.set('sunflower', () => spongeDemo(this.toView(sponge), this.toView(soil), sponge.defId));
    }
    const lat = this.lattice(views);
    const latBarrier = sim.barriers.barrier('lattice');
    if (lat && latBarrier && sim.barriers.closed(latBarrier) && this.onScreen(lat))
      scripts.set('lattice', () => dragDemo('lattice', this.toView(lat), -1));
    // The guided start's core verbs (F3): feed, fling, tickle, shake.
    const bug = this.bugOnScreen(views, center);
    if (bug) {
      const mouth = sim.mouthAnchor(bug.id);
      const food = views.find((v) => {
        if (v.kind !== 'item' || v.held || v.pocket !== undefined || !this.onScreen(v)) return false;
        const def = sim.content.items.tryGet(v.defId);
        return !!def?.tags.includes('tag_edible') && Math.abs(v.x - bug.x) < 6;
      });
      if (mouth && food && this.onScreen(mouth))
        scripts.set('feed', () => feedDemo(this.toView(food), this.toView(mouth), food.defId));
      scripts.set('tickle', () => tickleDemo(this.toView({ x: bug.x, y: bug.y })));
    }
    if (small) {
      const v = this.toView(small);
      scripts.set('fling', () => flingDemo(v, small.defId, v.x < VIEW_WIDTH_PX / 2 ? 1 : -1));
      scripts.set('shake', () => shakeDemo(v, small.defId));
    }
    const kind = chooseDemo(allowed, [...scripts.keys()], this.ghost.shown);
    return kind ? (scripts.get(kind)?.() ?? null) : null;
  }

  /** Screenshots only: a demo held still `t` seconds in, whatever the hand does (null lets go). */
  private pinned = false;

  pin(kind: DemoKind | null, t = 0): boolean {
    this.pinned = false;
    this.ghost.active = null;
    if (kind === null) return true;
    const script = this.stage([kind], this.sim.views());
    if (!script) return false;
    this.ghost.active = { script, t };
    this.pinned = true;
    return true;
  }

  /** For the test hook. */
  info(): {
    active: DemoKind | null;
    idle: number;
    shown: Record<string, number>;
    done: DemoKind[];
    stopped: number;
    /** The guided start's demos still to come (F3), or null when there is no guide. */
    guide: DemoKind[] | null;
    glints: Record<string, number>;
    wobbles: Record<string, number>;
  } {
    const glints: Record<string, number> = {};
    const wobbles: Record<string, number> = {};
    for (const t of this.targets) glints[t.key] = this.affordance.glint(t.key);
    for (const [k, n] of this.affordance.started) wobbles[k] = n;
    return {
      active: this.ghost.active?.script.kind ?? null,
      idle: this.ghost.idle,
      shown: Object.fromEntries(this.ghost.shown),
      done: [...this.ghost.done],
      stopped: this.ghost.stopped,
      guide: this.ghost.guide ? [...this.ghost.guide] : null,
      glints,
      wobbles,
    };
  }
}
