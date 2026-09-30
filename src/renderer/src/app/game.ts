import type { Application, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { Container, Point, UPDATE_PRIORITY } from 'pixi.js';
import { CONTENT, FixedStepper, Sim, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../../game';
import type { BugglebrookApi } from '../../../shared/ipc';
import type { AudioBackend } from '../audio/synth';
import { Sfx } from '../audio/sfx';
import type { Material } from '../audio/sfx';
import { BugVoices } from '../audio/voices';
import { PointerController } from '../input/pointerController';
import { Camera } from '../render/camera';
import { WorldView } from '../render/worldView';
import { PictureButton } from '../ui/button';
import type { CursorPose } from '../ui/cursor';
import { HandCursor, cursorPose } from '../ui/cursor';
import { MenuScene, homeButton } from '../ui/menu';
import { SaveService } from './saveService';

export type SceneName = 'boot' | 'menu' | 'world';

const AUTOSAVE_SECONDS = 20;
/**
 * Where the camera starts in a new world: Dot, Rollo, and the stump in view,
 * with the pond a short pan to the left.
 */
export const START_CAMERA_X = CONTENT.areas.get('area_stump_plaza').xStart + 3;
/** How many recent frame times to keep for the performance check. */
const FRAME_HISTORY = 900;

interface WorldSession {
  slot: number;
  sim: Sim;
  camera: Camera;
  view: WorldView;
  input: PointerController;
  root: Container;
  home: PictureButton;
  /** The camera x last sent to the sim as its focus. */
  focusX: number | null;
}

/** The native moves the browser merged into this one, oldest first, if it can tell us. */
function coalesced(e: FederatedPointerEvent): PointerEvent[] {
  const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
  return typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
}

/** When the DOM event happened (Pixi stamps its own events with the handling time). */
function eventTime(e: FederatedPointerEvent): number {
  const t = (e.nativeEvent as { timeStamp?: number }).timeStamp;
  return typeof t === 'number' && t > 0 ? t : performance.now();
}

/**
 * Top-level game controller: switches between the menu and the world, runs
 * the fixed-step loop, wires input, audio, and autosave.
 */
export class Game {
  scene: SceneName = 'boot';
  paused = false;
  menu: MenuScene | null = null;
  session: WorldSession | null = null;
  readonly saves: SaveService;
  readonly sfx: Sfx;
  readonly voices: BugVoices;
  /** Milliseconds of work (update and render) for recent frames, newest last. */
  readonly frameTimes: number[] = [];
  /** Milliseconds spent in the update half of recent frames (input, sim, drawing setup). */
  readonly updateTimes: number[] = [];
  /** True when WebGL runs in software (CI, VMs). Set by main.ts. */
  softwareRenderer = false;
  /** Recent sim events, newest last, for the test hook. */
  readonly eventLog: { name: string; tick: number; payload: unknown }[] = [];
  readonly cursor = new HandCursor();
  /** Where the pointer is in logical pixels, or null when it left the window. */
  private pointer: { x: number; y: number } | null = null;
  private overButton = false;
  /** Frames drawn so far, for the cursor's one-frame check. */
  frameCount = 0;
  /** The frame the hand's pose last changed on, and the frame of the last pointer move. */
  cursorPoseFrame = 0;
  pointerMoveFrame = 0;
  private frameStart = 0;
  private readonly stepper = new FixedStepper();
  private sinceSave = 0;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly app: Application,
    readonly api: BugglebrookApi,
    readonly audio: AudioBackend,
  ) {
    this.saves = new SaveService(api.saves);
    this.sfx = new Sfx(audio);
    this.voices = new BugVoices(audio, CONTENT.bugs);
    this.wireInput();
    this.wireCursor();
    api.onFlushRequest(() => this.saveNow());
    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    app.ticker.add((ticker) => {
      this.frameStart = performance.now();
      this.frame(Math.min(0.1, ticker.deltaMS / 1000));
      if (this.session) {
        this.updateTimes.push(performance.now() - this.frameStart);
        if (this.updateTimes.length > FRAME_HISTORY) this.updateTimes.shift();
      }
    });
    // Runs after Pixi renders, so the time covers update and render.
    app.ticker.add(
      () => {
        if (!this.session) return;
        this.frameTimes.push(performance.now() - this.frameStart);
        if (this.frameTimes.length > FRAME_HISTORY) this.frameTimes.shift();
      },
      undefined,
      UPDATE_PRIORITY.UTILITY,
    );
  }

  /** Hide the system cursor and draw the hand on top of everything instead. */
  private wireCursor(): void {
    const styles = this.app.renderer.events.cursorStyles;
    styles.default = 'none';
    styles.pointer = 'none';
    this.app.canvas.style.cursor = 'none';
    this.cursor.visible = false;
    this.app.stage.addChild(this.cursor);
  }

  /** The hand pose for the current pointer state. */
  cursorPoseNow(): CursorPose {
    const input = this.session?.input;
    return cursorPose({
      mode: input?.mode ?? 'none',
      holding: input?.holding ?? false,
      overGrabbable: (input?.hoverId ?? null) !== null,
      overButton: this.overButton,
      overFixture: (input?.hoverFixture ?? null) !== null,
    });
  }

  /** Update the hand right away, so hover feedback never waits for the next frame. */
  private refreshCursor(): void {
    const pose = this.cursorPoseNow();
    if (pose === this.cursor.pose) return;
    this.cursor.setPose(pose);
    this.cursorPoseFrame = this.frameCount;
  }

  async start(): Promise<void> {
    await this.showMenu();
  }

  private wireInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      this.audio.resume();
      this.session?.input.down({ x: e.global.x, y: e.global.y }, eventTime(e));
      this.refreshCursor();
    });
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.pointer = { x: e.global.x, y: e.global.y };
      this.pointerMoveFrame = this.frameCount;
      this.cursor.visible = true;
      let t: unknown = e.target;
      this.overButton = false;
      while (t) {
        if (t instanceof PictureButton) this.overButton = true;
        t = (t as { parent?: unknown }).parent;
      }
      const input = this.session?.input;
      if (input) {
        // Chromium merges fast moves into one event per frame. Replay the
        // merged ones so quick shakes and flicks keep every stroke.
        const dt = this.app.ticker.deltaMS / 1000;
        const merged = coalesced(e);
        if (merged.length > 1) {
          for (const c of merged) {
            const p = new Point();
            this.app.renderer.events.mapPositionToPoint(p, c.clientX, c.clientY);
            input.move({ x: p.x, y: p.y }, dt, c.timeStamp);
          }
        } else input.move({ x: e.global.x, y: e.global.y }, dt, eventTime(e));
      }
      this.refreshCursor();
    });
    const up = (e: FederatedPointerEvent): void => {
      this.session?.input.up(eventTime(e), { x: e.global.x, y: e.global.y });
      this.refreshCursor();
    };
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    stage.on('pointerleave', () => {
      this.session?.input.leave();
      this.pointer = null;
      this.cursor.visible = false;
    });
    stage.on('wheel', (e: FederatedWheelEvent) => this.session?.input.wheel(e.deltaX, e.deltaY));
  }

  async showMenu(): Promise<void> {
    if (this.session) {
      await this.saveNow();
      this.closeWorld();
    }
    const slots = await this.saves.list();
    this.menu?.destroy({ children: true });
    this.menu = new MenuScene(slots, (slot) => {
      this.sfx.play('ui_pop');
      void this.openSlot(slot);
    });
    this.app.stage.addChild(this.menu);
    this.app.stage.addChild(this.cursor); // keep the hand on top
    this.scene = 'menu';
  }

  async openSlot(slot: number): Promise<void> {
    if (this.scene === 'world') return;
    const save = await this.saves.load(slot);
    const sim = save ? Sim.load(save.world) : Sim.create({ seed: `slot-${slot}-${Date.now()}` });
    const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    camera.set(save ? save.view.cameraX : START_CAMERA_X);
    const input = new PointerController(sim, camera, VIEW_WIDTH_PX);
    const view = new WorldView(sim, input, this.app.renderer);
    const root = new Container();
    const home = homeButton(() => {
      this.sfx.play('ui_pop');
      void this.showMenu();
    });
    root.addChild(view, home);

    this.menu?.destroy({ children: true });
    this.menu = null;
    this.app.stage.addChild(root);
    this.app.stage.addChild(this.cursor);
    const materialOf = (kind: 'bug' | 'item', defId: string): Material =>
      kind === 'bug' || !sim.content.items.has(defId)
        ? 'bug'
        : (sim.content.items.get(defId).material.slice(4) as Material);
    this.sfx.attach(sim.events, materialOf, (defId) =>
      sim.content.items.has(defId) ? sim.content.items.get(defId).tags : [],
    );
    this.voices.attach(sim.events, (id) => sim.view(id)?.bug?.mood);
    input.onGesture = (gesture, strength) => this.sfx.play(gesture, strength);
    view.onSound = (name, strength) => this.sfx.play(name, strength);
    this.frameTimes.length = 0;
    this.updateTimes.length = 0;
    this.eventLog.length = 0;
    sim.events.onAny((name, payload) => {
      this.eventLog.push({ name, tick: sim.tick, payload });
      if (this.eventLog.length > 400) this.eventLog.shift();
    });
    this.session = { slot, sim, camera, view, input, root, home, focusX: null };
    this.stepper.reset();
    this.sinceSave = 0;
    this.scene = 'world';
    if (!save) await this.saveNow();
  }

  private closeWorld(): void {
    if (!this.session) return;
    this.sfx.detach();
    this.voices.detach();
    this.session.sim.events.clear();
    this.session.root.destroy({ children: true });
    this.session = null;
  }

  /** Save the current world. Saves are serialized so they never interleave. */
  saveNow(): Promise<void> {
    const session = this.session;
    if (!session) return this.saving;
    this.sinceSave = 0;
    this.saving = this.saving
      .then(() => this.saves.save(session.slot, session.sim, { cameraX: session.camera.x }))
      .then(
        () => undefined,
        (err: unknown) => console.error('Autosave failed', err),
      );
    return this.saving;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.stepper.reset();
    if (paused) void this.saveNow();
  }

  /** Advance the sim synchronously (test hook). */
  stepSim(n: number): void {
    const s = this.session;
    if (!s) return;
    for (let i = 0; i < n; i++) s.sim.step();
  }

  /** Tell the sim what the camera shows, so faraway areas can sleep. */
  private sendFocus(s: WorldSession): void {
    if (s.focusX !== null && Math.abs(s.camera.x - s.focusX) < 0.25) return;
    s.focusX = s.camera.x;
    s.sim.send({ type: 'focus', x0: s.camera.x, x1: s.camera.x + VIEW_WIDTH_M });
  }

  private frame(dt: number): void {
    this.frameCount++;
    if (this.menu) this.menu.update(dt);
    this.refreshCursor();
    if (this.pointer) this.cursor.update(dt, this.pointer.x, this.pointer.y);
    const s = this.session;
    if (!s) return;
    if (!this.paused) {
      s.input.frame(dt);
      this.stepper.advance(dt, () => s.sim.step());
      this.sinceSave += dt;
      if (this.sinceSave >= AUTOSAVE_SECONDS) void this.saveNow();
    }
    s.camera.update(dt);
    this.sendFocus(s);
    s.view.update(dt, s.camera);
    s.home.update(dt);
  }
}
