import type { Container } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { Command, EntityView } from '../../../game';
import type { ReactionType } from '../../../game/events';
import type { SlotInfo } from '../../../shared/ipc';
import type { Settings } from '../../../shared/settings';
import type { Game, SceneName } from '../app/game';
import type { Point } from '../render/camera';
import { LEVER_LENGTH, LEVER_PIVOT, LEVER_REST } from '../render/areaArt/benchLive';
import type { BubbleInfo } from '../render/bubbles';
import type { CursorPose } from '../ui/cursor';
import type { ToggleKey, VolumeKey } from '../ui/settingsPanel';

/** Named UI controls the tests can find: buttons, sliders' tracks, toggles, the bin. */
export type UiName =
  'pause' | 'home' | 'resume' | 'to_menu' | 'gear' | 'door' | 'bin' | `toggle_${ToggleKey}`;

/**
 * Test-only API on window.__bb. Installed only when the app is launched with
 * BUGGLEBROOK_TEST=1, so E2E tests can assert on game state instead of pixels.
 */
export interface TestHook {
  scene(): SceneName;
  tick(): number;
  entities(): EntityView[];
  entity(id: number): EntityView | null;
  /**
   * The camera's left edge, the furthest left and right it rests at (it may
   * peek past those, then springs back), and the screen frame it was read on.
   */
  camera(): { x: number; min: number; max: number; frame: number };
  /**
   * Put the camera's left edge at world x at once (staging for tests that
   * are not about scrolling), within the stretch it may rest in.
   */
  cameraTo(x: number): void;
  /** Client (CSS pixel) position of a world point, for page.mouse. */
  worldToClient(x: number, y: number): Point;
  /** Client position of the centre of a menu slot sign. */
  slotButtonClient(slot: number): Point | null;
  homeButtonClient(): Point | null;
  /** Client position of a named UI control, or null if it is not showing. */
  uiClient(name: UiName): Point | null;
  /** Client position of a settings slider at `value` (0 to 100), or null if the board is closed. */
  sliderClient(key: VolumeKey, value: number): Point | null;
  /** Client position of the centre of pocket slot `i`, as the tray sits now. */
  pocketSlotClient(i: number): Point | null;
  /** The pocket's slots: entity IDs, bottom of the stack first. */
  pocket(): number[][];
  /** How far up the pocket tray is, 0 to 1. */
  pocketOpen(): number;
  /** The menu's compost bin: how far its lid has closed on a sign (0 to 1). */
  binProgress(): number;
  /** Is the settings board open (over the world or the menu)? */
  panelOpen(): boolean;
  /** The settings as the game has them now. */
  settings(): Settings;
  /** How far the screen shake moves the world this frame, in pixels. */
  shakeOffset(): Point;
  /** Screen shakes asked for, and the biggest shake offset drawn since the last reset. */
  shakeStats(): { requests: number; max: number };
  resetShakeStats(): void;
  /** Stop the menu's clock (signs, the bin's lid), or start it again. */
  freezeMenu(on: boolean): void;
  /** Run the menu for `n` frames at 60 Hz right now. */
  menuFrames(n: number): void;
  /** Every menu sign has popped up and stands at its spot. */
  menuSettled(): boolean;
  /** A menu sign's state, for tests that drag it. */
  sign(slot: number): { x: number; y: number; pressed: boolean; dragging: boolean; picture: boolean } | null;
  /** Is reduce motion on in the world view? */
  reduceMotion(): boolean;
  /** Does each menu sign show a world picture (true), a saved world without one (false), or a sprout (null)? */
  slotPictures(): (boolean | null)[];
  /** Why recent slot loads failed. */
  saveProblems(): string[];
  /** Slots whose save would not load and came back from the backup. */
  recoveries(): number[];
  /** Play the first scene in new worlds (off by default in tests). */
  enableIntro(on: boolean): void;
  /** The first scene's clock and fade, or null when it is not running. */
  intro(): { t: number; cover: number } | null;
  send(command: Command): void;
  step(n: number): void;
  /** Run `n` frames of input and sim at 60 Hz right now, whatever the screen's speed. */
  frames(n: number): void;
  setPaused(paused: boolean): void;
  /** Open the next world already frozen (as `setPaused(true)`), before its first step. */
  freezeNextWorld(on: boolean): void;
  isPaused(): boolean;
  sfxLog(): string[];
  /** Recent gibberish lines: which bug and in what mood. */
  voiceLog(): { defId: string; emotion: string }[];
  /** Recent sim events, newest last. */
  events(): { name: string; tick: number; payload: unknown }[];
  /** The cursor velocity (m/s) sent with the last release, or null after a poke. */
  lastRelease(): Point | null;
  /** Update-plus-render time (ms) of the last `n` frames in the world. */
  frameTimes(n: number): number[];
  /** Update-only time (ms) of the last `n` frames in the world. */
  updateTimes(n: number): number[];
  /** True when WebGL is running in software, where render time says nothing about the game. */
  softwareRenderer(): boolean;
  /** On a software renderer, draw the screen at a tiny resolution (E2E tests do; tours do not). */
  liteRender(on: boolean): void;
  /** Live particles and entity sprites. */
  renderStats(): { particles: number; sprites: number };
  saveNow(): Promise<void>;
  listSlots(): Promise<SlotInfo[]>;
  /**
   * The drawn hand: its pose, the frame the pose last changed on, and the
   * frame of the last pointer move, to check hover feedback takes at most a frame.
   */
  cursor(): { pose: CursorPose; visible: boolean; poseFrame: number; moveFrame: number };
  /** Speech and thought bubbles showing now. */
  bubbles(): BubbleInfo[];
  /** Mouths glowing while food is held, and in which liking color. */
  glowing(): { id: number; liking: string }[];
  /** A bug's mouth anchor in world meters. */
  mouthOf(id: number): Point | null;
  /** The bug whose mouth would take this item if let go now. */
  dropTarget(itemId: number): number | null;
  /** Empty the sound, voice, and event logs, so a test can check one action at a time. */
  clearLogs(): void;
  /** The ponds' surfaces, the hose, ice sheets, lily pads, and welds right now. */
  water(): {
    surfaces: { areaId: string; level: number; left: number; right: number }[];
    hoseOn: boolean;
    ice: { x0: number; x1: number }[];
    pads: { id: string; x: number; y: number }[];
    sticks: { a: number; b: number }[];
  };
  /** Where a fixture (like `fix_hose_tap`) is, in world meters. */
  fixture(id: string): Point | null;
  /** Is an area asleep (no physics) because the camera is far away? */
  areaAsleep(areaId: string): boolean;
  /** Which area a world x is in. */
  areaAt(x: number): string;
  /** Soap bubbles floating right now. */
  soapBubbles(): number;
  /** How much two bug defs like each other now, -1 to 1. */
  affinity(a: string, b: string): number;
  /**
   * The clock and the weather: game time in clock ticks (60 a game minute),
   * the hour as a fraction, the phase, the weather, wind (m/s), whether it
   * rains, is dark, or the sundial is sweeping, and rain puddles.
   */
  sky(): {
    clock: number;
    hour: number;
    phase: string;
    weather: string;
    wind: number;
    rain: boolean;
    dark: boolean;
    fastForward: boolean;
    shades: boolean;
    vaneFacing: number;
    puddles: { id: string; fill: number }[];
  };
  /** Secrets found in this world, in order. */
  secrets(): string[];
  /** M7: the areas that are open, the walkable span, and the camera's open stretch. */
  unlocked(): { open: string[]; span: { x0: number; x1: number } };
  /** M7: the bugs that have joined the cast (hidden ones waiting to be found are not in it). */
  cast(): string[];
  /** M7: the new areas' fixtures: stage lights mode, the porch lamp, quiet speakers, the bucket lift. */
  places(): { stageLights: number; lampOn: boolean; muted: string[]; lift: string; liftY: number };
  /** How the scene is graded right now: tints per depth, stars, glow, and how much weather shows. */
  look(): {
    near: number;
    far: number;
    skyTop: number;
    skyBottom: number;
    stars: number;
    glow: number;
    rain: number;
  };
  /** M8: the Tinker Bench's trays (entity IDs), whether it is shaking, and recipes made and hinted. */
  bench(): { trays: (number | null)[]; busy: boolean; made: string[]; hinted: string[]; nudged: string[] };
  /** M8 (R09, R10): how the bench looks: each tray's glow (0 to 1), its phase, and its cork board's cards. */
  benchLook(): { trays: number[]; phase: string; cards: string[] } | null;
  /** M8: what is in the cauldron, how far it is stirred (0 to 1), and whether it is bubbling. */
  cauldron(): { contents: string[]; progress: number; bubbling: boolean; brewed: number };
  /**
   * M8: world points to aim the mouse at: the bench's lever knob, its trays, the
   * cauldron's middle (stir round it), and the bug scope's eyepiece.
   */
  m8Points(): {
    lever: { x: number; y: number };
    trays: { x: number; y: number }[];
    cauldron: { x: number; y: number };
    scope: { x: number; y: number };
  } | null;
  /** Set an entity's bites or paint directly, to show those looks (test mode only). */
  debugEntity(id: number, fields: { bites?: number; paint?: string[] }): void;
  /** Rain drops, leaves, and light sprites being drawn now (particle budgets). */
  weatherStats(): { drops: number; leaves: number; lights: number };
  /**
   * Screenshots only: patch a bug's brain and paint directly, to stage a look
   * the AI would take a long time to reach. `null` clears a field;
   * `peekTicks` opens Twig's eyes for that many ticks; `carrying` with
   * `overhead` or `rolling` makes it hold an item.
   */
  debugBug(id: number, patch: DebugBugPatch): void;
}

export interface DebugBugPatch {
  pending?: 'stuck' | 'aloof' | 'disguised' | null;
  form?: 'cocoon' | 'butterfly' | null;
  carrying?: number | null;
  overhead?: boolean;
  rolling?: boolean;
  peekTicks?: number;
  paint?: string[] | null;
  /** Start a reaction now (and stand still in `st_react` while it shows). */
  reaction?: { type: ReactionType; variant: number };
}

declare global {
  interface Window {
    __bb?: TestHook;
  }
}

export function installTestHook(game: Game): void {
  const logicalToClient = (p: Point): Point => {
    const rect = game.app.canvas.getBoundingClientRect();
    const k = rect.width / VIEW_WIDTH_PX;
    return { x: rect.left + p.x * k, y: rect.top + p.y * k };
  };
  const centerOf = (c: Container | undefined | null): Point | null => {
    if (!c || c.destroyed || !c.visible || !c.parent) return null;
    const g = c.getGlobalPosition();
    return logicalToClient({ x: g.x, y: g.y });
  };
  const uiControl = (name: UiName): Container | null => {
    const s = game.session;
    const panel = game.panel;
    switch (name) {
      case 'pause':
        return s?.pause ?? null;
      case 'home':
        return s?.home ?? null;
      case 'resume':
        return panel?.buttons.get('resume') ?? null;
      case 'to_menu':
        return panel?.buttons.get('menu') ?? null;
      case 'gear':
        return game.menu?.gear ?? null;
      case 'door':
        return game.menu?.door ?? null;
      case 'bin':
        return game.menu?.bin ?? null;
      default: {
        const key = name.slice('toggle_'.length) as ToggleKey;
        return panel?.toggles.get(key) ?? null;
      }
    }
  };

  window.__bb = {
    scene: () => game.scene,
    tick: () => game.session?.sim.tick ?? 0,
    entities: () => game.session?.sim.views() ?? [],
    entity: (id) => game.session?.sim.view(id) ?? null,
    camera: () => {
      const cam = game.session?.camera;
      return { x: cam?.x ?? 0, min: cam?.restMin ?? 0, max: cam?.restMax ?? 0, frame: game.frameCount };
    },
    cameraTo: (x) => {
      const cam = game.session?.camera;
      if (!cam) return;
      cam.stopGlide();
      cam.velocity = 0;
      cam.set(Math.min(cam.restMax, Math.max(cam.restMin, x)));
    },
    worldToClient: (x, y) => {
      const cam = game.session?.camera;
      if (!cam) throw new Error('No world open');
      return logicalToClient(cam.worldToView({ x, y }));
    },
    slotButtonClient: (slot) => centerOf(game.menu?.sign(slot)),
    homeButtonClient: () => centerOf(game.session?.home),
    uiClient: (name) => centerOf(uiControl(name)),
    sliderClient: (key, value) => {
      const slider = game.panel?.sliders.get(key);
      if (!slider) return null;
      const g = slider.toGlobal({ x: slider.xFor(value), y: 0 });
      return logicalToClient({ x: g.x, y: g.y });
    },
    pocketSlotClient: (i) => {
      const tray = game.session?.pocket;
      return tray ? logicalToClient(tray.slotCenter(i)) : null;
    },
    pocket: () => game.session?.sim.pocket.slots.map((s) => [...s]) ?? [],
    pocketOpen: () => game.session?.pocket.open ?? 0,
    binProgress: () => game.menu?.bin.progress ?? 0,
    panelOpen: () => game.panel !== null,
    settings: () => game.settings.get(),
    shakeOffset: () => game.session?.view.shakeOffset ?? { x: 0, y: 0 },
    reduceMotion: () => game.session?.view.reduceMotion ?? false,
    shakeStats: () => ({ ...(game.session?.view.shakeStats ?? { requests: 0, max: 0 }) }),
    resetShakeStats: () => {
      const s = game.session?.view.shakeStats;
      if (s) s.requests = s.max = 0;
    },
    menuSettled: () => game.menu?.settled ?? false,
    freezeMenu: (on) => {
      game.menuFrozen = on;
    },
    menuFrames: (n) => game.menuFrames(n),
    sign: (slot) => {
      const s = game.menu?.sign(slot);
      return s
        ? { x: s.x, y: s.y, pressed: s.pressed, dragging: s.dragging, picture: s.picture !== null }
        : null;
    },
    slotPictures: () => game.menu?.signs.map((s) => (s.picture ? s.picture.thumb !== null : null)) ?? [],
    recoveries: () => [...game.recoveries],
    saveProblems: () => [...game.saves.problems],
    enableIntro: (on) => {
      game.introEnabled = on;
    },
    intro: () => {
      const i = game.session?.intro;
      return i ? { t: i.t, cover: i.cover } : null;
    },
    send: (command) => game.session?.sim.send(command),
    step: (n) => game.stepSim(n),
    frames: (n) => game.stepFrames(n),
    setPaused: (p) => game.setPaused(p),
    freezeNextWorld: (on) => {
      game.freezeNextWorld = on;
    },
    isPaused: () => game.paused,
    sfxLog: () => [...game.sfx.log],
    voiceLog: () => game.voices.log.map((l) => ({ ...l })),
    events: () => game.eventLog.map((e) => ({ ...e })),
    lastRelease: () => game.session?.input.lastRelease ?? null,
    frameTimes: (n) => game.frameTimes.slice(-n),
    updateTimes: (n) => game.updateTimes.slice(-n),
    softwareRenderer: () => game.softwareRenderer,
    liteRender: (on) => game.setLiteRender?.(on),
    renderStats: () => ({
      particles: game.session?.view.particles.count ?? 0,
      sprites: game.session?.view.spriteCount ?? 0,
    }),
    saveNow: () => game.saveNow(),
    listSlots: () => game.api.saves.list(),
    cursor: () => ({
      pose: game.cursor.pose,
      visible: game.cursor.visible,
      poseFrame: game.cursorPoseFrame,
      moveFrame: game.pointerMoveFrame,
    }),
    bubbles: () => game.session?.view.bubbleList() ?? [],
    glowing: () =>
      [...(game.session?.view.glowing ?? new Map<number, string>())].map(([id, liking]) => ({ id, liking })),
    mouthOf: (id) => game.session?.sim.mouthAnchor(id) ?? null,
    dropTarget: (itemId) => game.session?.sim.dropTargetFor(itemId)?.entityId ?? null,
    water: () => {
      const sim = game.session?.sim;
      if (!sim) return { surfaces: [], hoseOn: false, ice: [], pads: [], sticks: [] };
      const env = sim.environment;
      return {
        surfaces: env.surfaces().map((w) => ({ ...w })),
        hoseOn: env.state.hoseOn,
        ice: env.state.ice.map((i) => ({ x0: i.x0, x1: i.x1 })),
        pads: env.pads(),
        sticks: env.state.sticks.map((t) => ({ a: t.a, b: t.b })),
      };
    },
    fixture: (id) => {
      const sim = game.session?.sim;
      if (!sim) return null;
      for (const area of sim.content.areas.all)
        for (const f of area.fixtures ?? []) if (f.id === id) return { x: area.xStart + f.x, y: f.y };
      return null;
    },
    areaAsleep: (areaId) => game.session?.sim.isAreaAsleep(areaId) ?? false,
    areaAt: (x) => game.session?.sim.areaOf(x).id ?? '',
    soapBubbles: () => game.session?.view.soapBubbleCount ?? 0,
    affinity: (a, b) => game.session?.sim.affinityOf(a, b) ?? 0,
    sky: () => {
      const sim = game.session?.sim;
      if (!sim)
        return {
          clock: 0,
          hour: 0,
          phase: '',
          weather: '',
          wind: 0,
          rain: false,
          dark: false,
          fastForward: false,
          shades: false,
          vaneFacing: 1,
          puddles: [],
        };
      const w = sim.weather;
      return {
        clock: w.clock,
        hour: (w.clock % 86400) / 3600,
        phase: w.phase,
        weather: w.weather,
        wind: sim.environment.state.wind,
        rain: sim.environment.state.rain,
        dark: w.dark,
        fastForward: w.fastForward,
        shades: w.state.shades === Math.floor(w.clock / 86400),
        vaneFacing: w.state.vane.facing,
        puddles: w.puddles().map((p) => ({ id: p.id, fill: p.fill })),
      };
    },
    secrets: () => [...(game.session?.sim.secrets ?? [])],
    unlocked: () => {
      const sim = game.session?.sim;
      if (!sim) return { open: [], span: { x0: 0, x1: 0 } };
      return {
        open: sim.content.areas.all.filter((a) => sim.barriers.isOpen(a.id)).map((a) => a.id),
        span: sim.barriers.span(),
      };
    },
    cast: () => game.session?.sim.cast.members().sort() ?? [],
    places: () => {
      const sim = game.session?.sim;
      if (!sim) return { stageLights: 0, lampOn: false, muted: [], lift: '', liftY: 0 };
      const p = sim.places.state;
      return {
        stageLights: p.stageLights,
        lampOn: p.lampOn,
        muted: [...p.muted],
        lift: sim.barriers.state.lift.phase,
        liftY: sim.barriers.state.lift.y,
      };
    },
    look: () => {
      const view = game.session?.view;
      const l = view?.look;
      return {
        near: l?.near ?? 0xffffff,
        far: l?.far ?? 0xffffff,
        skyTop: l?.skyTop ?? 0,
        skyBottom: l?.skyBottom ?? 0,
        stars: l?.stars ?? 0,
        glow: l?.glow ?? 0,
        rain: view?.weatherAmount.rain ?? 0,
      };
    },
    weatherStats: () => game.session?.view.weather.stats() ?? { drops: 0, leaves: 0, lights: 0 },
    bench: () => {
      const b = game.session?.sim.bench;
      if (!b) return { trays: [null, null, null], busy: false, made: [], hinted: [], nudged: [] };
      return {
        trays: [...b.state.trays],
        busy: b.busy,
        made: [...b.state.made],
        hinted: [...b.state.hinted],
        nudged: [...b.state.nudged],
      };
    },
    benchLook: () => game.session?.view.benchLook() ?? null,
    cauldron: () => {
      const c = game.session?.sim.cauldron;
      if (!c) return { contents: [], progress: 0, bubbling: false, brewed: 0 };
      return {
        contents: c.state.contents.map((p) => p.defId),
        progress: c.progress(),
        bubbling: c.bubbling,
        brewed: c.state.brewed,
      };
    },
    m8Points: () => {
      const sim = game.session?.sim;
      if (!sim) return null;
      const lever = sim.places.fixtures('bench_lever')[0];
      const bench = sim.places.fixtures('tinker_bench')[0];
      const pot = sim.places.fixtures('cauldron')[0];
      const scope = sim.places.fixtures('bug_scope')[0];
      if (!lever || !bench || !pot || !scope) return null;
      return {
        // The lever's red knob, up at rest.
        lever: {
          x: bench.x + LEVER_PIVOT + Math.sin(LEVER_REST) * LEVER_LENGTH,
          y: bench.fixture.y + 0.04 - Math.cos(LEVER_REST) * LEVER_LENGTH,
        },
        trays: [0, 1, 2].map((i) => sim.bench.trayAt(i)),
        cauldron: { x: pot.x, y: pot.fixture.y },
        scope: { x: scope.x, y: scope.fixture.y },
      };
    },
    debugEntity: (id, fields) => {
      const e = game.session?.sim.entities.get(id);
      if (!e) return;
      if (fields.bites !== undefined) e.bites = fields.bites;
      if (fields.paint !== undefined) e.paint = [...fields.paint];
    },
    debugBug: (id, patch) => {
      const sim = game.session?.sim;
      const e = sim?.entities.get(id);
      if (!sim || !e?.bug) return;
      const b = e.bug;
      if (patch.pending !== undefined) {
        if (patch.pending === null) delete b.pending;
        else b.pending = patch.pending;
      }
      if (patch.form !== undefined) {
        if (patch.form === null) delete b.form;
        else b.form = patch.form;
      }
      if (patch.carrying !== undefined) b.carrying = patch.carrying;
      if (patch.overhead !== undefined) b.overhead = patch.overhead;
      if (patch.rolling !== undefined) b.rolling = patch.rolling;
      if (patch.carrying && (patch.overhead || patch.rolling)) {
        // Stand ready to set off with it (things held up stay held only in everyday modes).
        b.mode = 'st_idle';
        b.timer = 1;
        b.action = null;
      }
      if (patch.peekTicks !== undefined) b.eyesUntil = sim.tick + patch.peekTicks;
      if (patch.paint !== undefined) {
        if (patch.paint === null) delete e.paint;
        else e.paint = [...patch.paint];
      }
      if (patch.reaction) {
        b.reaction = { ...patch.reaction, tick: sim.tick };
        b.mode = 'st_react';
        b.timer = 150;
      }
    },
    clearLogs: () => {
      game.sfx.log.length = 0;
      game.voices.log.length = 0;
      game.eventLog.length = 0;
    },
  };
}
