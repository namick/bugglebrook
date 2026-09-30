import type { Container } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { Command, EntityView } from '../../../game';
import type { SlotInfo } from '../../../shared/ipc';
import type { Game, SceneName } from '../app/game';
import type { Point } from '../render/camera';
import type { BubbleInfo } from '../render/bubbles';
import type { CursorPose } from '../ui/cursor';

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
  /** Client position of the centre of a menu slot button. */
  slotButtonClient(slot: number): Point | null;
  homeButtonClient(): Point | null;
  send(command: Command): void;
  step(n: number): void;
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
  const centerOf = (c: Container | undefined): Point | null => {
    if (!c) return null;
    const g = c.getGlobalPosition();
    return logicalToClient({ x: g.x, y: g.y });
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
    slotButtonClient: (slot) => centerOf(game.menu?.buttons[slot]),
    homeButtonClient: () => centerOf(game.session?.home),
    send: (command) => game.session?.sim.send(command),
    step: (n) => game.stepSim(n),
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
    clearLogs: () => {
      game.sfx.log.length = 0;
      game.voices.log.length = 0;
      game.eventLog.length = 0;
    },
  };
}
