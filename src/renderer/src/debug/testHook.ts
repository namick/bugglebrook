import type { Container } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { Command, EntityView } from '../../../game';
import type { SlotInfo } from '../../../shared/ipc';
import type { Settings } from '../../../shared/settings';
import type { Game, SceneName } from '../app/game';
import type { Point } from '../render/camera';
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
  camera(): { x: number };
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
  /** Every menu sign has popped up and stands at its spot. */
  menuSettled(): boolean;
  /** A menu sign's state, for tests that drag it. */
  sign(slot: number): { x: number; y: number; pressed: boolean; dragging: boolean; picture: boolean } | null;
  /** Is reduce motion on in the world view? */
  reduceMotion(): boolean;
  /** Does each menu sign show a world picture (true), a saved world without one (false), or a sprout (null)? */
  slotPictures(): (boolean | null)[];
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
    camera: () => ({ x: game.session?.camera.x ?? 0 }),
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
    sign: (slot) => {
      const s = game.menu?.sign(slot);
      return s
        ? { x: s.x, y: s.y, pressed: s.pressed, dragging: s.dragging, picture: s.picture !== null }
        : null;
    },
    slotPictures: () => game.menu?.signs.map((s) => (s.picture ? s.picture.thumb !== null : null)) ?? [],
    recoveries: () => [...game.recoveries],
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
    isPaused: () => game.paused,
    sfxLog: () => [...game.sfx.log],
    voiceLog: () => game.voices.log.map((l) => ({ ...l })),
    events: () => game.eventLog.map((e) => ({ ...e })),
    lastRelease: () => game.session?.input.lastRelease ?? null,
    frameTimes: (n) => game.frameTimes.slice(-n),
    updateTimes: (n) => game.updateTimes.slice(-n),
    softwareRenderer: () => game.softwareRenderer,
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
    clearLogs: () => {
      game.sfx.log.length = 0;
      game.voices.log.length = 0;
      game.eventLog.length = 0;
    },
  };
}
