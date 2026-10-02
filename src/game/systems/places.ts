import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { Rng } from '../core/rng';
import type { RngState } from '../core/rng';
import type { AreaDef, FixtureDef } from '../data/types';
import { PAINT_IDS } from '../data/types';
import type { Sim } from '../sim';
import { DAY, MINUTE, isDaylight } from './sky';
import { mixPaint } from './paint';
import type { SeqLayout, SequencerState } from './sequencer';
import {
  CLEAR_WINDOW,
  emptyRows,
  isEmpty,
  isOn,
  isTheme,
  newSequencerState,
  seqHit,
  seqLayout,
  setCell,
} from './sequencer';

/**
 * The fixtures of M7's areas (game design doc, section 3): the flowerbed's
 * stage, lights, speakers, paint puddles, gnome, and hideouts; the porch's
 * lamp, floor gaps, cobweb, and spider; the compost lab's warm heap and
 * shelf jars; the treehouse's pegboard, bead pit, jar claw, and dominoes.
 * State that must survive a save lives in `PlaceState`. It has its own dice
 * (like the weather), so the world's bugs roll the same whatever happens here.
 */

export type ClawPhase = 'idle' | 'down' | 'up' | 'carry' | 'drop';

export interface ClawState {
  phase: ClawPhase;
  /** Where the claw hangs, in world x, and how far down it is (0 top, 1 bottom). */
  x: number;
  depth: number;
  /** What it holds, or null. */
  holding: EntityId | null;
  /** Misses in a row: after two, the third try always wins. */
  misses: number;
  /** Has the claw ever been used? The first time, it pulls up Prim. */
  used: boolean;
  /** Game day the prizes were last restocked. */
  stocked: number;
}

/** Plain JSON, saved as `world.places`. */
export interface PlaceState {
  /** 0 off, 1 warm, 2 disco, 3 spotlight. */
  stageLights: number;
  /** Bluebell speakers clicked quiet. */
  muted: string[];
  lampOn: boolean;
  /** Recent knocks on the gnome (ticks), and when the knock back is due (or -1). */
  knocks: number[];
  knockBack: number;
  /** Tick of the next thing to drop through the porch floor. */
  gapNext: number;
  /** Things falling from the floor gaps that have not landed yet: caught mid-air, they are a coin. */
  falling: EntityId[];
  /** The spider watching the hand: its last x, which way it moved, and recent turns (ticks). */
  spider: { x: number; dir: number; turns: number[]; waved: number };
  /** Ticks each thing has rested on the warm compost heap. */
  heap: Record<string, number>;
  /** Clock ticks when each shelf jar last refilled. */
  jars: Record<string, number>;
  /** Things caught in the cobweb, and since when. */
  web: Record<string, number>;
  claw: ClawState;
  /** Dominoes standing (true) or down (false), and the ticks recent ones fell. */
  dominoes: Record<string, boolean>;
  falls: number[];
  /** When the band last played. */
  band: number;
  /** Clicks on the bug scope's eyepiece, to show the next tag each time (M8). */
  scope?: number;
  /** The mushroom sequencer (M9). Worlds saved before it get an empty one. */
  sequencer?: SequencerState;
  rng: RngState;
}

/** Paint colors on things: items keep the last color, bugs collect up to five patches. */
export const PAINT_SLOTS = 5;
/** A thing rests this long on the heap to get warm, and food this long to turn into goo. */
export const HEAP_WARM = 10 * SIM_HZ;
export const HEAP_GOO = 60 * SIM_HZ;
/** Shelf jars refill every 5 game minutes. */
export const JAR_REFILL = 5 * MINUTE;
/** Floor gaps drop something every 30 to 90 s, while the porch is open and awake. */
export const GAP_EVERY: readonly [number, number] = [30 * SIM_HZ, 90 * SIM_HZ];
const GAP_CAP = 10;
const GAP_POOL_DAY: readonly string[] = [
  'item_crumb_cookie',
  'item_button',
  'item_cheese_puff',
  'item_popcorn_kernel',
  'item_ant_crumb',
];
const GAP_POOL_NIGHT: readonly string[] = [
  'item_crumb_cookie',
  'item_button',
  'item_seed_sunflower',
  'item_popcorn_kernel',
];
/** Knock on the gnome three times within 3 s at night, and it knocks back 1 s later. */
export const KNOCKS = 3;
const KNOCK_WINDOW = 3 * SIM_HZ;
/** The cobweb lets go of things after this long (bugs nap there instead). */
export const WEB_HOLD = 2.5 * SIM_HZ;
/** The pegboard's grid, in meters. */
export const PEG_GRID = 0.4;
/** Dominoes: this many falling within a short chain. */
export const DOMINO_CHAIN = 12;
const DOMINO_GAP = 1.5 * SIM_HZ;
/** The claw sweeps its jar, drops at 3 m/s, and grabs what is within this reach of it. */
export const CLAW_REACH = 0.35;
const CLAW_SPEED = 3;
const CLAW_POOL: readonly string[] = [
  'item_jelly_bean',
  'item_button',
  'item_foil_ball',
  'item_yo_yo',
  'item_marble_green',
  'item_pollen_puff',
];
/** How many beads in the bead pit. */
export const BEADS = 96;
export const BEAD_RADIUS = 0.12;
/** Three bugs dancing or playing on the stage make a band, at most every 20 s. */
export const BAND = 3;
const BAND_GAP = 20 * SIM_HZ;

export function newPlaceState(seed: string): PlaceState {
  return {
    stageLights: 0,
    muted: [],
    lampOn: false,
    knocks: [],
    knockBack: -1,
    gapNext: 45 * SIM_HZ,
    falling: [],
    spider: { x: 0, dir: 0, turns: [], waved: -1 },
    heap: {},
    jars: {},
    web: {},
    claw: { phase: 'idle', x: 0, depth: 0, holding: null, misses: 0, used: false, stocked: 0 },
    dominoes: {},
    falls: [],
    band: -1,
    sequencer: newSequencerState(),
    rng: new Rng(`places-${seed}`).getState(),
  };
}

type Placed = { area: AreaDef; fixture: FixtureDef; x: number };

export class Places {
  state: PlaceState;
  private rng: Rng;
  private readonly byKind = new Map<FixtureDef['kind'], Placed[]>();
  /** The bead pit's beads, world keys and where each sits. Not saved: they settle again on load. */
  readonly beads: string[] = [];

  constructor(private readonly sim: Sim) {
    this.state = newPlaceState(sim.seed);
    this.rng = Rng.fromState(this.state.rng);
    for (const area of sim.content.areas.all)
      for (const fixture of area.fixtures ?? []) {
        const list = this.byKind.get(fixture.kind) ?? [];
        list.push({ area, fixture, x: area.xStart + fixture.x });
        this.byKind.set(fixture.kind, list);
      }
  }

  /** Fixtures of one kind, with their world x. */
  fixtures(kind: FixtureDef['kind']): readonly Placed[] {
    return this.byKind.get(kind) ?? [];
  }

  restore(state: PlaceState): void {
    this.state = state;
    state.sequencer ??= newSequencerState();
    this.rng = Rng.fromState(state.rng);
  }

  serialize(): PlaceState {
    this.state.rng = this.rng.getState();
    return JSON.parse(JSON.stringify(this.state)) as PlaceState;
  }

  /**
   * Beads for the bead pit, settled in rows, once its area is open (a locked
   * area only shows a painted pile). Call once physics exists, and again
   * when an area opens.
   */
  build(): void {
    const physics = this.sim.physics;
    for (const pit of this.fixtures('bead_pit')) {
      if (!this.sim.barriers.isOpen(pit.area.id) || this.beads.length > 0) continue;
      const w = pit.fixture.w ?? 4;
      const x0 = pit.x - w / 2 + 0.75;
      const x1 = pit.x + w / 2 - 0.75;
      const per = Math.floor((x1 - x0) / (BEAD_RADIUS * 2.05));
      for (let i = 0; i < BEADS; i++) {
        const row = Math.floor(i / per);
        const col = i % per;
        const x = x0 + col * BEAD_RADIUS * 2.05 + (row % 2) * BEAD_RADIUS;
        const y = pit.fixture.y - BEAD_RADIUS - row * BEAD_RADIUS * 1.8;
        const key = `bead_${pit.fixture.id}_${i}`;
        physics.addBead(key, x, y, BEAD_RADIUS, 0.35);
        this.beads.push(key);
      }
    }
  }

  /** Beads sleep and wake with their area. */
  setAreaAsleep(areaId: string, asleep: boolean): void {
    if (!this.fixtures('bead_pit').some((p) => p.area.id === areaId)) return;
    for (const key of this.beads) this.sim.physics.setPlatformActive(key, !asleep);
  }

  // --- Queries -------------------------------------------------------------

  private awake(area: AreaDef): boolean {
    return !this.sim.isAreaAsleep(area.id) && this.sim.barriers.isOpen(area.id);
  }

  /** The stage's top, in world x and y, for dancers. */
  stage(): { x0: number; x1: number; y: number } | null {
    const s = this.fixtures('stage')[0];
    if (!s || !this.sim.barriers.isOpen(s.area.id)) return null;
    const half = (s.fixture.w ?? 4) / 2;
    return { x0: s.x - half, x1: s.x + half, y: s.fixture.y };
  }

  /** Lights that are on (the porch lamp, the stage lights): world x, y, and reach. */
  lights(): { x: number; y: number; reach: number }[] {
    const out: { x: number; y: number; reach: number }[] = [];
    if (this.state.lampOn)
      for (const f of this.fixtures('porch_lamp')) out.push({ x: f.x, y: f.fixture.y + 1, reach: 4 });
    if (this.state.stageLights > 0)
      for (const f of this.fixtures('stage_lights')) out.push({ x: f.x, y: f.fixture.y + 3.5, reach: 3.5 });
    return out;
  }

  /** The claw machine's jar, in world meters: inside walls and floor. */
  jar(): { x0: number; x1: number; floor: number; top: number; chute: number } | null {
    const claw = this.fixtures('jar_claw')[0];
    if (!claw) return null;
    const half = (claw.fixture.w ?? 2.8) / 2;
    return {
      x0: claw.x - half - 0.15,
      x1: claw.x + half + 0.15,
      floor: this.sim.surfaceY(claw.x),
      top: claw.fixture.y,
      chute: claw.x + half + 0.75,
    };
  }

  /** Where the claw hangs right now: world x and the y of its tip. */
  clawTip(): { x: number; y: number } | null {
    const jar = this.jar();
    if (!jar) return null;
    const c = this.state.claw;
    const x = c.phase === 'idle' ? this.sweepX() : c.x;
    return { x, y: jar.top + 0.2 + c.depth * (jar.floor - jar.top - 0.5) };
  }

  /** The idle claw sweeps back and forth across its jar. */
  private sweepX(): number {
    const claw = this.fixtures('jar_claw')[0];
    if (!claw) return 0;
    const half = (claw.fixture.w ?? 2.8) / 2 - 0.2;
    return claw.x + half * Math.sin(this.sim.tick * 0.018);
  }

  // --- Clicks --------------------------------------------------------------

  /** A click on one of M7's fixtures. True if it did something. */
  poke(f: { id: string; kind: FixtureDef['kind']; x: number; y: number }): boolean {
    const sim = this.sim;
    const s = this.state;
    switch (f.kind) {
      case 'stage_lights':
        s.stageLights = (s.stageLights + 1) % 4;
        sim.events.emit('stage_lights_changed', { mode: s.stageLights, x: f.x, y: f.y });
        return true;
      case 'bluebell': {
        const muted = !s.muted.includes(f.id);
        s.muted = muted ? [...s.muted, f.id] : s.muted.filter((m) => m !== f.id);
        sim.events.emit('speaker_toggled', { id: f.id, muted, x: f.x, y: f.y });
        return true;
      }
      case 'gnome':
        this.knock(f.x, f.y);
        return true;
      case 'porch_lamp':
        s.lampOn = !s.lampOn;
        sim.events.emit('lamp_toggled', { on: s.lampOn, x: f.x, y: f.y });
        return true;
      case 'claw_button':
        return this.pressClaw();
      case 'bench_lever':
        sim.bench.pull();
        return true;
      case 'cauldron':
        sim.cauldron.tip();
        return true;
      case 'bug_scope':
        this.scope(f.x, f.y);
        return true;
      case 'munch_leaf':
        sim.events.emit('hideout_stirred', { fixture: f.id, x: f.x, y: f.y });
        sim.cast.find('bug_caterpillar_munch', f.x, f.y - 0.3);
        return true;
      case 'whiff_pot':
        sim.events.emit('hideout_stirred', { fixture: f.id, x: f.x, y: f.y });
        if (sim.barriers.isOpen('area_under_porch'))
          sim.cast.find('bug_stinkbug_whiff', f.x + 0.5, f.y - 0.4);
        return true;
      case 'tulip':
      case 'sunflower':
      case 'can_tunnel':
      case 'spider':
        sim.events.emit('hideout_stirred', { fixture: f.id, x: f.x, y: f.y });
        return true;
      default:
        return false;
    }
  }

  /**
   * The bug scope (section 3, `fix_bug_scope`): a click on the eyepiece shows
   * a zoomed view of whatever sits on the dish, and one of its tags as a
   * pictogram. Each click shows the next tag. The moss tuft at night shows
   * something else entirely.
   */
  private scope(x: number, y: number): void {
    const sim = this.sim;
    const dish = { x: x + 1.1, y: sim.surfaceY(x + 1.1) };
    let found: Entity | null = null;
    let best = Infinity;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id) continue;
      const s = sim.physics.getState(e.id);
      const d = Math.abs(s.x - dish.x);
      if (d <= 1 && s.y > dish.y - 1.2 && s.y < dish.y + 0.2 && d < best) {
        found = e;
        best = d;
      }
    }
    if (!found) {
      sim.events.emit('scope_viewed', { defId: null, tag: null, x, y });
      return;
    }
    if (found.defId === 'item_moss_tuft' && sim.weather.dark) {
      sim.events.emit('scope_viewed', { defId: found.defId, tag: 'wubbo', x, y });
      sim.findSecret('secret_scope_wubbo', x, y);
      return;
    }
    const tags = scopeTags(sim.tagsOf(found.id));
    const i = (this.state.scope ?? 0) % Math.max(1, tags.length);
    this.state.scope = (this.state.scope ?? 0) + 1;
    sim.events.emit('scope_viewed', { defId: found.defId, tag: tags[i] ?? null, x, y });
  }

  /** Knock, knock. Three quick knocks at night, and something inside knocks back. */
  private knock(x: number, y: number): void {
    const sim = this.sim;
    const s = this.state;
    s.knocks = [...s.knocks.filter((t) => sim.tick - t < KNOCK_WINDOW), sim.tick];
    sim.events.emit('gnome_knocked', { x, y, count: s.knocks.length });
    if (s.knocks.length >= KNOCKS && sim.weather.dark && s.knockBack < 0) {
      s.knocks = [];
      s.knockBack = sim.tick + SIM_HZ;
    }
  }

  // --- The mushroom sequencer (M9) -------------------------------------------

  /** Its state; worlds from before M9 get an empty one. */
  get sequencer(): SequencerState {
    return (this.state.sequencer ??= newSequencerState());
  }

  /** Where its caps and controls are, in world meters, or null when its area is shut. */
  sequencerLayout(): SeqLayout | null {
    const f = this.fixtures('sequencer')[0];
    if (!f || !this.sim.barriers.isOpen(f.area.id)) return null;
    return seqLayout(f.x, f.fixture.y);
  }

  /** The cap state a drag paints, set by the press that started it. Not saved. */
  private seqPaint: boolean | null = null;

  /**
   * The player's hand on the sequencer: `start` for a press, otherwise a drag.
   * A press on a cap toggles it and sets what the drag paints; the tufts mute
   * rows, the stone clears on a second click, the knob doubles the speed, and
   * the seed switches between patterns A and B. True if it did something.
   */
  touchSequencer(x: number, y: number, start: boolean): boolean {
    const sim = this.sim;
    const f = this.fixtures('sequencer')[0];
    const layout = this.sequencerLayout();
    if (!f || !layout || sim.isAreaAsleep(f.area.id)) return false;
    const hit = seqHit(layout, x, y);
    const s = this.sequencer;
    const emit = (
      action: 'cap' | 'mute' | 'wobbled' | 'cleared' | 'speed' | 'pattern',
      row: number,
      col: number,
      on: boolean,
    ): void => sim.events.emit('sequencer_changed', { action, row, col, on, x, y, by: null });
    if (!start) {
      if (this.seqPaint === null || hit?.kind !== 'cap') return false;
      const rows = s.patterns[s.current];
      if (isOn(rows, hit.row, hit.col) === this.seqPaint) return false;
      this.playerSet(hit.row, hit.col, this.seqPaint);
      emit('cap', hit.row, hit.col, this.seqPaint);
      return true;
    }
    this.seqPaint = null;
    if (!hit) return false;
    switch (hit.kind) {
      case 'cap': {
        const on = !isOn(s.patterns[s.current], hit.row, hit.col);
        this.seqPaint = on;
        this.playerSet(hit.row, hit.col, on);
        emit('cap', hit.row, hit.col, on);
        return true;
      }
      case 'tuft':
        s.mutes[hit.row] = !s.mutes[hit.row];
        emit('mute', hit.row, -1, s.mutes[hit.row]!);
        return true;
      case 'stone':
        if (s.clearArmed >= 0 && sim.tick - s.clearArmed <= CLEAR_WINDOW) {
          s.patterns[s.current] = emptyRows();
          s.bug = null;
          s.clearArmed = -1;
          emit('cleared', -1, -1, false);
        } else {
          s.clearArmed = sim.tick;
          emit('wobbled', -1, -1, true);
        }
        return true;
      case 'knob':
        s.fast = !s.fast;
        emit('speed', -1, -1, s.fast);
        return true;
      case 'seed':
        s.current = s.current === 0 ? 1 : 0;
        emit('pattern', -1, -1, s.current === 1);
        return true;
    }
  }

  /** The player sets a cap: a bug's pattern on the empty grid gives way, and the theme may be in. */
  private playerSet(row: number, col: number, on: boolean): void {
    const s = this.sequencer;
    setCell(s.patterns[s.current], row, col, on);
    s.bug = null;
    if (!isTheme(s.patterns[s.current])) return;
    const layout = this.sequencerLayout();
    if (!layout || this.sim.secrets.includes('secret_sequencer_song')) return;
    this.sim.findSecret('secret_sequencer_song', layout.x0, layout.y0);
    // Every bug in the world stops and sings it together.
    for (const b of this.sim.entities.ofKind('bug'))
      if (b.bug && !b.bug.pending && !this.sim.isSleeping(b.id) && b.bug.mode !== 'st_sleep')
        this.sim.reactBug(b, 'cheer');
  }

  /** A bug hopped on a cap of the empty grid: its own pattern, never the player's. */
  bugTapped(bugId: EntityId, row: number, col: number): void {
    const s = this.sequencer;
    const layout = this.sequencerLayout();
    if (!layout || !isEmpty(s.patterns[s.current])) return;
    if (s.bug && s.bug.id !== bugId) return;
    s.bug ??= { id: bugId, rows: emptyRows() };
    const on = !isOn(s.bug.rows, row, col);
    setCell(s.bug.rows, row, col, on);
    const p = { x: layout.x0 + (col + 0.5) * layout.cell, y: layout.y0 + (row + 0.5) * layout.cell };
    this.sim.events.emit('sequencer_changed', { action: 'cap', row, col, on, ...p, by: bugId });
  }

  /** The bug hopped off: its pattern goes. */
  bugLeft(bugId: EntityId): void {
    const s = this.sequencer;
    if (s.bug?.id !== bugId) return;
    s.bug = null;
    const layout = this.sequencerLayout();
    this.sim.events.emit('sequencer_changed', {
      action: 'cleared',
      row: -1,
      col: -1,
      on: false,
      x: layout?.x0 ?? 0,
      y: layout?.y0 ?? 0,
      by: bugId,
    });
  }

  /** A bug pattern whose bug is gone, asleep, or doing something else goes too. */
  private sequencerRule(): void {
    const bug = this.sequencer.bug;
    if (!bug) return;
    const e = this.sim.entities.get(bug.id);
    if (!e?.bug || this.sim.isSleeping(bug.id) || e.bug.action !== 'tap') this.bugLeft(bug.id);
  }

  // --- Hooks from the sim ----------------------------------------------------

  /** The player grabbed something. Caught mid-fall from the porch floor, it turns into an old coin. */
  grabbed(e: Entity, x: number, y: number): Entity {
    const sim = this.sim;
    if (e.pinned) {
      delete e.pinned;
      const s = sim.physics.getState(e.id);
      sim.events.emit('track_snapped', { id: e.id, on: false, x: s.x, y: s.y, angle: s.angle });
    }
    const i = this.state.falling.indexOf(e.id);
    if (i < 0) return e;
    this.state.falling.splice(i, 1);
    if (!sim.content.items.has('item_old_coin')) return e;
    const s = sim.physics.getState(e.id);
    sim.remove(e.id);
    const coin = sim.spawn('item', 'item_old_coin', s.x, s.y);
    sim.physics.grab(coin.id, x, y);
    sim.events.emit('item_transformed', {
      id: e.id,
      newId: coin.id,
      from: e.defId,
      to: coin.defId,
      x: s.x,
      y: s.y,
    });
    sim.findSecret('secret_floor_coin', s.x, s.y);
    return coin;
  }

  /** The player let go of something. A track piece near the pegboard snaps onto it. */
  released(e: Entity): void {
    const sim = this.sim;
    if (e.kind !== 'item' || !sim.content.items.get(e.defId).track) return;
    const board = this.fixtures('pegboard')[0];
    if (!board || !sim.barriers.isOpen(board.area.id)) return;
    const s = sim.physics.getState(e.id);
    const w = board.fixture.w ?? 6;
    const h = board.fixture.h ?? 4;
    const left = board.x - w / 2;
    const top = board.fixture.y - h / 2;
    if (s.x < left - 0.3 || s.x > left + w + 0.3 || s.y < top - 0.3 || s.y > top + h + 0.1) return;
    const x = left + Math.round((s.x - left) / PEG_GRID) * PEG_GRID;
    const y = top + Math.round((s.y - top) / PEG_GRID) * PEG_GRID;
    const angle = snapAngle(s.angle);
    sim.physics.place(
      e.id,
      Math.min(left + w, Math.max(left, x)),
      Math.min(top + h, Math.max(top, y)),
      angle,
    );
    sim.physics.setPinned(e.id, true);
    e.pinned = true;
    sim.events.emit('track_snapped', { id: e.id, on: true, x, y, angle });
  }

  /**
   * Paint from a puddle, a paint drop, or a potion: a thing mixes the new
   * color into what it had (rule R23), a bug collects patches of each.
   * `patches` paints that many of a bug's patches at once (a paint potion
   * covers it all over).
   */
  paint(e: Entity, paint: string, x: number, y: number, patches = 1): void {
    const sim = this.sim;
    const had = e.paint ?? [];
    let next: string[];
    if (e.kind === 'bug')
      next =
        patches > 1
          ? new Array<string>(Math.min(PAINT_SLOTS, patches)).fill(paint)
          : had.includes(paint)
            ? had
            : [...had, paint].slice(-PAINT_SLOTS);
    else next = [had.length > 0 ? mixPaint(had[had.length - 1]!, paint) : paint];
    const changed = next.length !== had.length || next.some((p, i) => p !== had[i]);
    e.paint = next;
    sim.addTag(e.id, 'tag_painted', 'paint');
    if (!changed) return;
    sim.events.emit('painted', { id: e.id, paint: next[next.length - 1]!, x, y });
    if (e.kind === 'bug' && PAINT_IDS.every((p) => next.includes(p)))
      sim.findSecret('secret_paint_all_five', x, y);
  }

  // --- Per step ------------------------------------------------------------

  update(): void {
    const sim = this.sim;
    const tick = sim.tick;
    const s = this.state;
    if (s.knockBack >= 0 && tick >= s.knockBack) {
      s.knockBack = -1;
      const g = this.fixtures('gnome')[0];
      if (g) {
        sim.events.emit('gnome_answered', { x: g.x, y: g.fixture.y });
        sim.findSecret('secret_gnome_knock', g.x, g.fixture.y);
      }
    }
    this.updateClaw();
    if (tick % 15 === 0) {
      this.paintRule();
      this.heapRule();
      this.webRule();
      this.dominoRule();
      this.bandRule();
      this.sequencerRule();
      this.spiderRule();
      this.fallingRule();
    }
    if (tick % 60 === 0) {
      this.jarRule();
      this.hints();
    }
    this.gapRule();
  }

  /** Things standing in a paint puddle take its color. */
  private paintRule(): void {
    const sim = this.sim;
    const puddles = this.fixtures('paint_puddle');
    if (puddles.length === 0 || !this.awake(puddles[0]!.area)) return;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
      const st = sim.physics.getState(e.id);
      const p = puddles.find((q) => Math.abs(st.x - q.x) <= q.fixture.radius);
      if (!p?.fixture.paint) continue;
      const bottom = st.y + sim.halfHeight(e);
      if (Math.abs(bottom - sim.surfaceY(st.x)) > 0.18) continue;
      this.paint(e, p.fixture.paint, st.x, sim.surfaceY(st.x));
    }
  }

  /**
   * The warm compost heap: things resting on it for 10 s get hot, and food
   * left there for a minute turns into compost goo (rule R21).
   */
  private heapRule(): void {
    const sim = this.sim;
    const heaps = this.fixtures('compost_heap');
    const s = this.state;
    const seen = new Set<string>();
    for (const heap of heaps) {
      if (!this.awake(heap.area)) continue;
      const half = (heap.fixture.w ?? 4) / 2;
      for (const e of sim.entities.ofKind('item')) {
        if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
        const st = sim.physics.getState(e.id);
        if (Math.abs(st.x - heap.x) > half || Math.hypot(st.vx, st.vy) > 0.5) continue;
        const bottom = st.y + sim.halfHeight(e);
        if (bottom < sim.surfaceY(st.x) - 0.25) continue;
        const key = String(e.id);
        seen.add(key);
        const t = (s.heap[key] ?? 0) + 15;
        s.heap[key] = t;
        if (t >= HEAP_WARM) sim.addTag(e.id, 'tag_hot', 'heap');
        const def = sim.content.items.get(e.defId);
        // R21: food left on the heap for a minute becomes compost goo.
        if (t >= HEAP_GOO && def.tags.includes('tag_edible') && e.defId !== 'item_compost_goo') {
          sim.remove(e.id);
          delete s.heap[key];
          if (!sim.content.items.has('item_compost_goo')) continue;
          const goo = sim.spawn('item', 'item_compost_goo', st.x, st.y);
          sim.events.emit('item_transformed', {
            id: e.id,
            newId: goo.id,
            from: e.defId,
            to: goo.defId,
            x: st.x,
            y: st.y,
          });
        }
      }
    }
    for (const key of Object.keys(s.heap)) if (!seen.has(key)) delete s.heap[key];
  }

  /**
   * The cobweb hammock: things caught in it hang there a moment, then drop
   * through slowly. A bug put in it curls up for a nap instead.
   */
  private webRule(): void {
    const sim = this.sim;
    const s = this.state;
    for (const web of this.fixtures('cobweb')) {
      const half = (web.fixture.w ?? 2) / 2;
      const on = new Set<string>();
      for (const e of sim.entities.all()) {
        if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
        const st = sim.physics.getState(e.id);
        if (Math.abs(st.x - web.x) > half) continue;
        const bottom = st.y + sim.halfHeight(e);
        if (bottom < web.fixture.y - 0.4 || bottom > web.fixture.y + 0.45) continue;
        // A bug still dropping in is caught once it has settled in the web, so it naps there.
        if (e.bug && Math.hypot(st.vx, st.vy) > 1.5 && this.state.web[String(e.id)] === undefined) continue;
        const key = String(e.id);
        on.add(key);
        // Letting go: nudge it awake so it starts to sink through, slowly.
        if (this.webLetsGo(e.id)) sim.physics.setVelocity(e.id, st.vx * 0.5, Math.max(st.vy, 0.6));
        if (s.web[key] === undefined) {
          s.web[key] = sim.tick;
          sim.events.emit('web_caught', { id: e.id, on: true, x: st.x, y: st.y });
          if (e.bug) sim.napHere(e);
        }
      }
      for (const key of Object.keys(s.web))
        if (!on.has(key)) {
          delete s.web[key];
          const e = sim.entities.get(Number(key));
          if (e) {
            const st = sim.physics.getState(e.id);
            sim.events.emit('web_caught', { id: e.id, on: false, x: st.x, y: st.y });
          }
        }
    }
  }

  /** Is this thing sinking through the cobweb now (the web lets it pass)? */
  webLetsGo(id: EntityId): boolean {
    const since = this.state.web[String(id)];
    if (since === undefined) return false;
    const e = this.sim.entities.get(id);
    if (e?.bug && e.bug.mode === 'st_sleep') return false;
    return this.sim.tick - since >= WEB_HOLD;
  }

  /** Dominoes toppling one after another: twelve in a chain rings the bell. */
  private dominoRule(): void {
    const sim = this.sim;
    const s = this.state;
    let last: { x: number; y: number } | null = null;
    for (const e of sim.entities.ofKind('item')) {
      if (e.defId !== 'item_domino' || sim.isSleeping(e.id)) continue;
      const st = sim.physics.getState(e.id);
      const key = String(e.id);
      // Standing on end, or knocked over (leaning on the next one counts: that is how a chain ends up).
      const tilt = Math.min(Math.abs(st.angle), Math.abs(Math.abs(st.angle) - Math.PI));
      const up = tilt < 0.12;
      const down = tilt > 0.3 && sim.physics.grabbed !== e.id;
      if (up) s.dominoes[key] = true;
      else if (down && s.dominoes[key]) {
        s.dominoes[key] = false;
        s.falls.push(sim.tick);
        last = { x: st.x, y: st.y };
      }
    }
    // Keep the current chain: falls no more than 1.5 s apart.
    let start = s.falls.length - 1;
    while (start > 0 && s.falls[start]! - s.falls[start - 1]! <= DOMINO_GAP) start--;
    s.falls = s.falls.slice(start).filter((t) => sim.tick - t <= DOMINO_GAP * DOMINO_CHAIN);
    if (last && s.falls.length >= DOMINO_CHAIN) {
      sim.events.emit('dominoes_fell', { count: s.falls.length, x: last.x, y: last.y });
      sim.findSecret('secret_domino_chain', last.x, last.y);
      s.falls = [];
    }
  }

  /** Three or more bugs dancing on the stage together: a band. */
  private bandRule(): void {
    const sim = this.sim;
    const stage = this.stage();
    if (!stage || (this.state.band >= 0 && sim.tick - this.state.band < BAND_GAP)) return;
    const dancers = sim.entities.ofKind('bug').filter((b) => {
      if (!b.bug || sim.isSleeping(b.id)) return false;
      const dancing = b.bug.mode === 'st_perform' && b.bug.action === 'dance';
      const playing = b.bug.mode === 'st_use' && b.bug.action === 'play';
      if (!dancing && !playing) return false;
      const x = sim.physics.getState(b.id).x;
      return x > stage.x0 && x < stage.x1;
    });
    if (dancers.length < BAND) return;
    this.state.band = sim.tick;
    const x = (stage.x0 + stage.x1) / 2;
    sim.events.emit('band_played', { count: dancers.length, x, y: stage.y });
    sim.findSecret('secret_band_of_three', x, stage.y);
  }

  /** The dangling spider waves back at a hand swaying to and fro beneath it. */
  private spiderRule(): void {
    const sim = this.sim;
    const spider = this.fixtures('spider')[0];
    const hand = sim.hand;
    const sp = this.state.spider;
    if (!spider || !hand || !this.awake(spider.area)) return;
    if (Math.abs(hand.x - spider.x) > 1.8 || hand.y < spider.fixture.y || hand.y > 8.8) return;
    const d = hand.x - sp.x;
    if (Math.abs(d) < 0.25) return;
    const dir = Math.sign(d);
    if (sp.dir !== 0 && dir !== sp.dir)
      sp.turns = [...sp.turns.filter((t) => sim.tick - t < 3 * SIM_HZ), sim.tick];
    sp.dir = dir;
    sp.x = hand.x;
    if (sp.turns.length >= 3 && (sp.waved < 0 || sim.tick - sp.waved > 5 * SIM_HZ)) {
      sp.turns = [];
      sp.waved = sim.tick;
      sim.events.emit('spider_waved', { x: spider.x, y: spider.fixture.y });
      sim.findSecret('secret_spider_wave', spider.x, spider.fixture.y);
    }
  }

  /** Things falling from the floor gaps land, and are no longer catchable. */
  private fallingRule(): void {
    const sim = this.sim;
    this.state.falling = this.state.falling.filter((id) => {
      if (!sim.entities.has(id) || sim.isSleeping(id)) return false;
      const st = sim.physics.getState(id);
      return st.vy > 0.3 || sim.physics.supportNormal(id) === null;
    });
  }

  /** Every 30 to 90 s something drops through a gap in the porch floorboards. */
  private gapRule(): void {
    const sim = this.sim;
    const s = this.state;
    if (sim.tick < s.gapNext) return;
    s.gapNext = sim.tick + this.rng.int(GAP_EVERY[0], GAP_EVERY[1]);
    const gaps = this.fixtures('floor_gap');
    if (gaps.length === 0 || !this.awake(gaps[0]!.area)) return;
    const area = gaps[0]!.area;
    const pool = isDaylight(sim.weather.clock) ? GAP_POOL_DAY : GAP_POOL_NIGHT;
    const here = sim.entities
      .ofKind('item')
      .filter(
        (e) => pool.includes(e.defId) && sim.areaOf(sim.physics.getState(e.id).x).id === area.id,
      ).length;
    if (here >= GAP_CAP) return;
    const gap = this.rng.pick(gaps);
    const defId = this.rng.pick(pool);
    if (!sim.content.items.has(defId)) return;
    const e = sim.spawn('item', defId, gap.x, gap.fixture.y + 0.3);
    sim.physics.setVelocity(e.id, this.rng.range(-0.3, 0.3), 0.5);
    s.falling.push(e.id);
    sim.events.emit('floor_dropped', { id: e.id, defId, x: gap.x, y: gap.fixture.y });
  }

  /** Shelf jars refill their ingredient every 5 game minutes if it has gone. */
  private jarRule(): void {
    const sim = this.sim;
    const s = this.state;
    for (const jar of this.fixtures('shelf_jar')) {
      const item = jar.fixture.item;
      if (!item || !sim.content.items.has(item) || !this.awake(jar.area)) continue;
      const last = s.jars[jar.fixture.id] ?? 0;
      if (sim.weather.clock - last < JAR_REFILL) continue;
      const there = sim.entities.ofKind('item').some((e) => {
        if (e.defId !== item || sim.isPocketed(e.id)) return false;
        const st = sim.physics.getState(e.id);
        return Math.abs(st.x - jar.x) < 0.45 && Math.abs(st.y - jar.fixture.y) < 0.6;
      });
      s.jars[jar.fixture.id] = sim.weather.clock;
      if (there) continue;
      const half = sim.content.items.get(item).shape;
      const h = half.type === 'circle' ? half.radius : half.height / 2;
      const e = sim.spawn('item', item, jar.x, jar.fixture.y - h - 0.02);
      sim.events.emit('jar_refilled', { id: e.id, defId: item, x: jar.x, y: jar.fixture.y });
    }
  }

  /** Hints that something hides nearby: a rustle, a hum, eyes, a scratch. */
  private hints(): void {
    const sim = this.sim;
    if (!this.rng.chance(0.3)) return;
    const hint = (kind: FixtureDef['kind'], bug: string | null, open = true): void => {
      for (const f of this.fixtures(kind)) {
        if (sim.isAreaAsleep(f.area.id) || !open) continue;
        if (bug && sim.cast.joined(bug)) continue;
        sim.events.emit('hideout_stirred', { fixture: f.fixture.id, x: f.x, y: f.fixture.y });
      }
    };
    const pick = this.rng.int(0, 3);
    if (pick === 0) hint('munch_leaf', 'bug_caterpillar_munch', sim.barriers.isOpen('area_flowerbed_stage'));
    else if (pick === 1) hint('whiff_pot', 'bug_stinkbug_whiff', sim.barriers.isOpen('area_under_porch'));
    else if (pick === 2) hint('can_tunnel', null, !sim.barriers.isOpen('area_compost_lab'));
    else hint('tulip', null);
  }

  // --- The claw machine ------------------------------------------------------

  /** The claw's red button. Only while it waits. */
  private pressClaw(): boolean {
    const c = this.state.claw;
    const jar = this.jar();
    const claw = this.fixtures('jar_claw')[0];
    if (!jar || !claw || c.phase !== 'idle' || !this.sim.barriers.isOpen(claw.area.id)) return false;
    c.x = this.sweepX();
    c.phase = 'down';
    c.depth = 0;
    this.sim.events.emit('claw_moved', { phase: 'drop', x: c.x, y: jar.top, id: null });
    return true;
  }

  /** Prizes inside the jar. */
  private prizes(): Entity[] {
    const sim = this.sim;
    const jar = this.jar();
    if (!jar) return [];
    return sim.entities.ofKind('item').filter((e) => {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) return false;
      const st = sim.physics.getState(e.id);
      return st.x > jar.x0 && st.x < jar.x1 && st.y > jar.top && st.y < jar.floor + 0.1;
    });
  }

  private updateClaw(): void {
    const sim = this.sim;
    const c = this.state.claw;
    const jar = this.jar();
    const claw = this.fixtures('jar_claw')[0];
    if (!jar || !claw || sim.isAreaAsleep(claw.area.id)) return;
    const drop = jar.floor - jar.top - 0.5;
    const step = CLAW_SPEED / SIM_HZ / Math.max(0.5, drop);
    if (c.phase === 'idle' && sim.tick % (SIM_HZ * 10) === 0) this.restock(jar);
    switch (c.phase) {
      case 'idle':
        return;
      case 'down':
        c.depth = Math.min(1, c.depth + step);
        if (c.depth >= 1) this.clawGrab(jar);
        break;
      case 'up':
        c.depth = Math.max(0, c.depth - step * 0.7);
        // Empty-handed, it just goes back to sweeping.
        if (c.depth <= 0) c.phase = c.holding === null ? 'drop' : 'carry';
        break;
      case 'carry': {
        const to = jar.x1 - 0.35;
        c.x = Math.min(to, c.x + 1.2 / SIM_HZ);
        if (c.x >= to) this.clawRelease(jar);
        break;
      }
      case 'drop':
        c.x += (this.sweepX() - c.x) * 0.05;
        if (Math.abs(this.sweepX() - c.x) < 0.05) c.phase = 'idle';
        break;
    }
    this.carryPrize();
  }

  /** At the bottom: close on whatever is under the claw. Two misses in a row, and the third always wins. */
  private clawGrab(jar: NonNullable<ReturnType<Places['jar']>>): void {
    const sim = this.sim;
    const c = this.state.claw;
    const tip = this.clawTip()!;
    c.phase = 'up';
    if (!c.used && sim.content.bugs.has('bug_mantis_prim') && !sim.cast.present('bug_mantis_prim')) {
      // The first time: Prim was hiding in the prize heap.
      c.used = true;
      const prim = sim.cast.find('bug_mantis_prim', tip.x, tip.y + 0.4, false);
      if (prim) {
        c.holding = prim.id;
        sim.physics.setActive(prim.id, false);
        sim.events.emit('claw_moved', { phase: 'grab', x: tip.x, y: tip.y, id: prim.id });
        return;
      }
    }
    c.used = true;
    const prizes = this.prizes()
      .map((e) => ({ e, d: Math.abs(sim.physics.getState(e.id).x - c.x) }))
      .sort((a, b) => a.d - b.d || a.e.id - b.e.id);
    const best = prizes[0];
    const win = best && (best.d <= CLAW_REACH || c.misses >= 2);
    if (!win) {
      c.misses++;
      sim.events.emit('claw_moved', { phase: 'miss', x: tip.x, y: tip.y, id: null });
      return;
    }
    c.misses = 0;
    c.holding = best.e.id;
    if (best.d > CLAW_REACH) c.x = sim.physics.getState(best.e.id).x;
    sim.physics.setActive(best.e.id, false);
    sim.events.emit('claw_moved', { phase: 'grab', x: tip.x, y: jar.floor - 0.3, id: best.e.id });
  }

  /** Whatever the claw holds rides along under it. */
  private carryPrize(): void {
    const c = this.state.claw;
    if (c.holding === null) return;
    const sim = this.sim;
    const e = sim.entities.get(c.holding);
    const tip = this.clawTip();
    if (!e || !tip) {
      c.holding = null;
      return;
    }
    sim.physics.place(e.id, tip.x, tip.y + sim.halfHeight(e) + 0.05, 0);
  }

  /** Over the chute: the prize drops out onto the tray, for the player. */
  private clawRelease(jar: NonNullable<ReturnType<Places['jar']>>): void {
    const sim = this.sim;
    const c = this.state.claw;
    c.phase = 'drop';
    const id = c.holding;
    c.holding = null;
    if (id === null || !sim.entities.has(id)) return;
    const e = sim.entities.get(id)!;
    const y = sim.surfaceY(jar.chute) - sim.halfHeight(e) - 0.3;
    sim.physics.place(id, jar.chute, y, 0);
    sim.physics.setActive(id, true);
    sim.physics.setVelocity(id, 1.2, -2);
    sim.events.emit('claw_moved', { phase: 'prize', x: jar.chute, y, id });
    if (e.bug) sim.cast.join(e, jar.chute, y);
  }

  /** Once a game day the jar gets new prizes, if it is running low. */
  private restock(jar: NonNullable<ReturnType<Places['jar']>>): void {
    const sim = this.sim;
    const c = this.state.claw;
    const day = Math.floor(sim.weather.clock / DAY);
    if (day <= c.stocked) return;
    c.stocked = day;
    const have = this.prizes().length;
    for (let i = have; i < 4; i++) {
      const defId = this.rng.pick(CLAW_POOL);
      if (!sim.content.items.has(defId)) continue;
      const x = this.rng.range(jar.x0 + 0.4, jar.x1 - 0.4);
      sim.spawn('item', defId, x, jar.top + 0.5);
    }
  }
}

/** Snap an angle to the pegboard's 0, 45, and 90 degrees (either way). */
export function snapAngle(a: number): number {
  const step = Math.PI / 4;
  let s = Math.round(a / step) * step;
  if (s > Math.PI / 2) s -= Math.PI;
  if (s < -Math.PI / 2) s += Math.PI;
  return Math.abs(s) < 1e-9 ? 0 : s;
}

/** Tags worth showing under the bug scope, most telling first. */
const SCOPE_ORDER: readonly string[] = [
  'tag_glowing',
  'tag_magnetic',
  'tag_sticky',
  'tag_smelly',
  'tag_hot',
  'tag_cold',
  'tag_frozen',
  'tag_fizzy',
  'tag_sparky',
  'tag_soapy',
  'tag_slimy',
  'tag_fragile',
  'tag_musical',
  'tag_bouncy',
  'tag_lifty',
  'tag_seed',
  'tag_absorbent',
  'tag_wet',
  'tag_floaty',
  'tag_heavy',
  'tag_light',
  'tag_leafy',
  'tag_edible',
  'tag_painted',
];

/** A thing's tags in the order the scope shows them. */
export function scopeTags(tags: readonly string[]): string[] {
  return SCOPE_ORDER.filter((t) => tags.includes(t));
}
