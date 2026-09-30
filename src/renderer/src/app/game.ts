import type { Application, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { Container } from 'pixi.js';
import { FixedStepper, Sim, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../../game';
import type { BugglebrookApi } from '../../../shared/ipc';
import type { AudioBackend } from '../audio/synth';
import { Sfx } from '../audio/sfx';
import { PointerController } from '../input/pointerController';
import { Camera } from '../render/camera';
import { WorldView } from '../render/worldView';
import type { PictureButton } from '../ui/button';
import { MenuScene, homeButton } from '../ui/menu';
import { SaveService } from './saveService';

export type SceneName = 'boot' | 'menu' | 'world';

const AUTOSAVE_SECONDS = 20;

interface WorldSession {
  slot: number;
  sim: Sim;
  camera: Camera;
  view: WorldView;
  input: PointerController;
  root: Container;
  home: PictureButton;
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
    this.wireInput();
    api.onFlushRequest(() => this.saveNow());
    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    app.ticker.add((ticker) => this.frame(Math.min(0.1, ticker.deltaMS / 1000)));
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
      this.session?.input.down({ x: e.global.x, y: e.global.y });
    });
    stage.on('globalpointermove', (e: FederatedPointerEvent) =>
      this.session?.input.move({ x: e.global.x, y: e.global.y }, this.app.ticker.deltaMS / 1000),
    );
    const up = (): void => this.session?.input.up();
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
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
    this.scene = 'menu';
  }

  async openSlot(slot: number): Promise<void> {
    if (this.scene === 'world') return;
    const save = await this.saves.load(slot);
    const sim = save ? Sim.load(save.world) : Sim.create({ seed: `slot-${slot}-${Date.now()}` });
    const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    camera.set(save ? save.view.cameraX : 0);
    const view = new WorldView(sim);
    const input = new PointerController(sim, camera, VIEW_WIDTH_PX);
    const root = new Container();
    const home = homeButton(() => {
      this.sfx.play('ui_pop');
      void this.showMenu();
    });
    root.addChild(view, home);

    this.menu?.destroy({ children: true });
    this.menu = null;
    this.app.stage.addChild(root);
    this.sfx.attach(sim.events);
    this.session = { slot, sim, camera, view, input, root, home };
    this.stepper.reset();
    this.sinceSave = 0;
    this.scene = 'world';
    if (!save) await this.saveNow();
  }

  private closeWorld(): void {
    if (!this.session) return;
    this.sfx.detach();
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

  private frame(dt: number): void {
    if (this.menu) this.menu.update(dt);
    const s = this.session;
    if (!s) return;
    if (!this.paused) {
      s.input.frame(dt);
      this.stepper.advance(dt, () => s.sim.step());
      this.sinceSave += dt;
      if (this.sinceSave >= AUTOSAVE_SECONDS) void this.saveNow();
    }
    s.camera.update(dt);
    s.view.update(dt, s.camera);
    s.home.update(dt);
  }
}
