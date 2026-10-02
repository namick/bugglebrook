import type { Application, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { Container, Graphics, Point, UPDATE_PRIORITY } from 'pixi.js';
import { CONTENT, FixedStepper, Sim, VIEW_HEIGHT_PX, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../../game';
import type { PageId, PhotoRecord } from '../../../game';
import type { BugglebrookApi } from '../../../shared/ipc';
import type { Settings } from '../../../shared/settings';
import type { AudioBackend } from '../audio/synth';
import { volumesFrom } from '../audio/synth';
import { Sfx } from '../audio/sfx';
import type { Material, SfxName } from '../audio/sfx';
import { soundMaterial } from '../audio/sfx';
import { BugVoices } from '../audio/voices';
import { MusicDirector } from '../audio/musicDirector';
import type { MusicSink } from '../audio/musicPlayer';
import { NullMusicSink } from '../audio/musicPlayer';
import { PointerController } from '../input/pointerController';
import { Camera } from '../render/camera';
import { GhostHand, HintMarks } from '../render/hintView';
import { ArtLab } from '../art/artLab';
import { artStore } from '../art/artStore';
import { WorldView } from '../render/worldView';
import type { PictureButton } from '../ui/button';
import { isUi } from '../ui/button';
import type { CursorPose } from '../ui/cursor';
import { HandCursor, cursorPose } from '../ui/cursor';
import { MenuScene, homeButton, pauseButton } from '../ui/menu';
import type { MenuSound } from '../ui/menu';
import { cameraButton } from '../ui/photoButtons';
import { PocketTray } from '../ui/pocketTray';
import { CreditsBoard } from '../ui/creditsBoard';
import { UpdateToast } from '../ui/updateToast';
import { CREDITS } from '../ui/credits';
import { SettingsPanel } from '../ui/settingsPanel';
import { HiddenDirector } from './hiddenDirector';
import { HintDirector } from './hintDirector';
import { GUIDE } from './ghost';
import { guideSkipButton } from '../ui/guideSkip';
import { JOURNAL_AT, JournalButton } from '../ui/journalButton';
import { JournalView } from '../journal/journalView';
import { withSeen } from '../journal/layout';
import { PhotoMode } from '../photo/photoMode';
import { INTRO, Intro } from './intro';
import { SaveService } from './saveService';
import { SettingsService } from './settingsService';
import { captureThumb } from './thumbnail';

export type SceneName = 'boot' | 'menu' | 'world';

/** Autosave this often while playing (game design doc, section 18). */
export const AUTOSAVE_SECONDS = 30;
/** Area changes save too, but not more often than this. */
const AREA_SAVE_GAP = 3;
const PLAZA = CONTENT.areas.get('area_stump_plaza');
/**
 * Where the camera starts in a new world: Dot, Rollo, and the stump in view,
 * with the pond a short pan to the left.
 */
export const START_CAMERA_X = PLAZA.xStart + 3;
/** How many recent frame times to keep for the performance check. */
const FRAME_HISTORY = 900;

interface WorldSession {
  slot: number;
  sim: Sim;
  camera: Camera;
  view: WorldView;
  input: PointerController;
  root: Container;
  ui: Container;
  pause: PictureButton;
  home: PictureButton;
  /** The camera (photo mode) and the journal, top right. They stay up while the rest of the UI hides. */
  cameraButton: PictureButton;
  journal: JournalButton;
  /** Journal entries looked at this visit, until the sim takes `journal_seen` on its next step. */
  seen: Set<string>;
  /** Seconds until the journal button rereads the book. */
  bookIn: number;
  /** The spread the journal was last left open on. */
  spread: number;
  topUi: Container;
  pocket: PocketTray;
  /** The player's photos, oldest first (saved in `meta.photos`). */
  photos: PhotoRecord[];
  /** Dark cover for the first scene's fade-in. */
  cover: Graphics;
  /** The camera x last sent to the sim as its focus. */
  focusX: number | null;
  /** When the slot was first saved. */
  createdAt: string | undefined;
  /** The area the camera was last over, for area-change saves. */
  area: string;
  intro: Intro | null;
  grabbedBug: boolean;
  panned: boolean;
  /** The last slot picture, kept if a new one cannot be taken. */
  thumb: string | null;
  /** Where the hand was last reported to the sim. */
  handSent: { x: number; y: number } | null;
  /** A camera glide asked for by the world (the lift's first trip), done once the limits catch up. */
  follow: number | null;
  /** Affordance hints and ghost-hand demos, and how they are drawn. */
  hints: HintDirector;
  marks: HintMarks;
  ghost: GhostHand;
  hintTime: number;
  /** Skips the guided start (F3), shown while it runs. */
  guideSkip: PictureButton;
  /** M10's hidden areas: the doorways' iris wipe, the telescope, the finale's camera. */
  hidden: HiddenDirector;
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
 * the fixed-step loop, wires input, audio, settings, the pocket, pause, the
 * first scene, and autosave.
 */
export class Game {
  scene: SceneName = 'boot';
  menu: MenuScene | null = null;
  session: WorldSession | null = null;
  /** The settings board, open over the world (pause) or the menu. */
  panel: SettingsPanel | null = null;
  /** The credits board, over the menu. */
  credits: CreditsBoard | null = null;
  private closingCredits: CreditsBoard[] = [];
  /** Photo mode, while the camera is out. */
  photo: PhotoMode | null = null;
  /** The journal, while it is open over the world. */
  journal: JournalView | null = null;
  readonly saves: SaveService;
  readonly settings: SettingsService;
  readonly sfx: Sfx;
  readonly voices: BugVoices;
  /** The background music and the music toys (M9). */
  readonly music: MusicDirector;
  /** Milliseconds of work (update and render) for recent frames, newest last. */
  readonly frameTimes: number[] = [];
  /** Milliseconds spent in the update half of recent frames (input, sim, drawing setup). */
  readonly updateTimes: number[] = [];
  /** True when WebGL runs in software (CI, VMs). Set by main.ts. */
  softwareRenderer = false;
  /**
   * Tests only: draw the screen at a tiny resolution on a software renderer
   * (`main.ts` sets this). Software GL is fill-rate bound and holds up the
   * page while it draws; tests read the game through the hook, not pixels.
   */
  setLiteRender: ((on: boolean) => void) | null = null;
  /** Recent sim events, newest last, for the test hook. */
  readonly eventLog: { name: string; tick: number; payload: unknown }[] = [];
  readonly cursor = new HandCursor();
  /** Play the first scene in new worlds. Tests turn it off unless they are about it. */
  introEnabled: boolean;
  /** Slot loads that fell back to the backup, for the test hook. */
  readonly recoveries: number[] = [];
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
  private sinceAreaSave = 0;
  private saving: Promise<void> = Promise.resolve();
  /** Why the sim is not stepping: the window is hidden, the test hook froze it. */
  private hidden = false;
  private frozen = false;
  /**
   * While a test has the sim frozen, pointer events are stamped with this
   * clock, which `stepFrames` moves on 1/60 s a frame. Fling speeds and
   * poke timing then depend on frames, not on how slow the machine is.
   */
  private frameClock: number | null = null;
  /** Covers scene switches with a quick fade. */
  private readonly curtain = new Graphics();
  private curtainAlpha = 0;
  private switching = false;
  /** The "update ready" toast, once an update has downloaded. */
  updateToast: UpdateToast | null = null;
  /** The toast's button was pressed (for the test hook). */
  updateRestartAsked = false;

  constructor(
    readonly app: Application,
    readonly api: BugglebrookApi,
    readonly audio: AudioBackend,
    musicSink: MusicSink = new NullMusicSink(),
  ) {
    this.saves = new SaveService(api.saves);
    this.settings = new SettingsService(api.settings);
    this.sfx = new Sfx(audio);
    this.music = new MusicDirector(audio, musicSink);
    this.voices = new BugVoices(audio, CONTENT.bugs);
    this.introEnabled = !api.testMode;
    this.settings.onChange((s) => this.applySettings(s));
    this.wireInput();
    this.wireCursor();
    api.onFlushRequest(() => this.saveNow().then(() => this.settings.flush()));
    api.updates.onReady((version) => this.showUpdateReady(version));
    document.addEventListener('visibilitychange', () => this.setHidden(document.hidden));
    window.addEventListener('keydown', (e) => {
      this.session?.hints.noteInput();
      this.music.input();
      // Escape opens pause as a convenience (the button is always on screen too).
      if (e.key === 'Escape') {
        if (this.photo) this.closePhoto();
        else if (this.journal) this.closeJournal();
        else if (this.panel) this.closePanel();
        else if (this.credits) this.closeCredits();
        else if (this.session) this.openPause();
      }
      // The arrow keys turn the journal's pages.
      if (this.journal && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'))
        this.journal.turn(e.key === 'ArrowRight' ? 1 : -1);
    });
    this.curtain.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(0x2b1b2e);
    this.curtain.alpha = 0;
    this.curtain.eventMode = 'none';
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

  /** Is the sim stopped? Hidden window, open pause board, or frozen by a test. */
  get paused(): boolean {
    return (
      this.hidden || this.frozen || ((this.panel !== null || this.journal !== null) && this.session !== null)
    );
  }

  /** Something is open over the world that takes the pointer: the pause board, the journal, or the camera. */
  private get overlaid(): boolean {
    return (
      this.panel !== null ||
      this.journal !== null ||
      this.photo !== null ||
      // M10: looking through Gnome Hollow's telescope.
      (this.session?.hidden.telescope.isOpen ?? false)
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

  /** An update has downloaded: show the toast whose button saves and restarts into it. */
  showUpdateReady(version: string): void {
    if (this.updateToast) return;
    this.updateToast = new UpdateToast(version, () => {
      if (this.updateRestartAsked) return;
      this.updateRestartAsked = true;
      void this.saveNow()
        .then(() => this.settings.flush())
        .finally(() => this.api.updates.restart());
    });
    this.updateToast.button.onHover = () => this.sfx.play('hover', 0.5);
    this.raiseOverlays();
  }

  /** Keep the update toast, the curtain, and the hand above everything else. */
  private raiseOverlays(): void {
    if (this.updateToast) this.app.stage.addChild(this.updateToast);
    this.app.stage.addChild(this.curtain);
    this.app.stage.addChild(this.cursor);
  }

  /** The hand pose for the current pointer state. */
  cursorPoseNow(): CursorPose {
    const input = this.session?.input;
    if (this.photo) {
      const drag = this.photo.dragging;
      if (drag === 'pan') return 'pan';
      if (drag === 'sticker') return 'grab';
      return this.overButton ? 'hover_poke' : 'open';
    }
    return cursorPose({
      mode: input?.mode ?? 'none',
      holding: input?.holding ?? false,
      overGrabbable: !this.overButton && (input?.hoverId ?? null) !== null,
      overButton: this.overButton,
      overFixture: !this.overButton && (input?.hoverFixture ?? null) !== null,
      overStir:
        !this.overButton &&
        input?.hoverFixtureKind === 'cauldron' &&
        (this.session?.sim.cauldron.state.contents.length ?? 0) > 0,
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
    await this.settings.load();
    // Hand-drawn art: tests start code-drawn and switch it on when they are about it.
    if (this.api.testMode) artStore.setMode('code');
    await artStore.loadBundled().catch((err: unknown) => console.error('Art failed to load', err));
    void this.music.load();
    await this.showMenu();
    const lab = import.meta.env.DEV ? import.meta.env.VITE_BB_ART_LAB : undefined;
    if (lab) this.openArtLab(lab === '1' ? 'bug_ladybug_dot' : lab);
  }

  /** The Art Lab, open over everything (dev builds and tests), or null. */
  artLab: ArtLab | null = null;

  openArtLab(bugId: string): void {
    this.closeArtLab();
    const lab = new ArtLab(bugId);
    lab.on('close', () => this.closeArtLab());
    this.app.stage.addChild(lab);
    this.artLab = lab;
    this.raiseOverlays();
  }

  closeArtLab(): void {
    this.artLab?.destroy();
    this.artLab = null;
  }

  /** Settings take effect at once: volumes, reduce motion, edge scroll. */
  private applySettings(s: Settings): void {
    this.audio.setVolumes(volumesFrom(s));
    const session = this.session;
    if (session) {
      session.view.reduceMotion = s.reduceMotion;
      session.camera.friction = s.reduceMotion ? 10 : 5;
      session.input.coastScale = s.reduceMotion ? 0.5 : 1;
      session.input.edgeScroll = s.edgeScroll;
    }
    if (this.menu) this.menu.reduceMotion = s.reduceMotion;
    this.panel?.sync(s);
  }

  private wireInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      this.audio.resume();
      this.session?.hints.noteInput();
      this.music.input();
      const s = this.session;
      if (s && !this.overlaid) {
        const view = { x: e.global.x, y: e.global.y };
        const slot = s.pocket.slotAt(view.x, view.y);
        if (slot !== null && s.sim.pocket.slots[slot]!.length > 0 && s.sim.physics.grabbed === null) {
          s.input.takeFromPocket(slot, view, this.eventTime(e));
          s.pocket.bump(slot);
        } else s.input.down(view, this.eventTime(e));
      }
      this.refreshCursor();
    });
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      // Pixi replays the last move on its ticker; only a real move counts as input for the hints.
      const was = this.pointer;
      if (!was || Math.hypot(e.global.x - was.x, e.global.y - was.y) > 0.5) {
        this.session?.hints.noteInput();
        this.music.input();
      }
      this.pointer = { x: e.global.x, y: e.global.y };
      this.pointerMoveFrame = this.frameCount;
      this.cursor.visible = true;
      this.overButton = isUi(e.target) && e.target !== this.session?.pocket;
      const input = this.overlaid ? undefined : this.session?.input;
      if (input) {
        // Chromium merges fast moves into one event per frame. Replay the
        // merged ones so quick shakes and flicks keep every stroke.
        const dt = this.app.ticker.deltaMS / 1000;
        const merged = coalesced(e);
        if (merged.length > 1) {
          for (const c of merged) {
            const p = new Point();
            this.app.renderer.events.mapPositionToPoint(p, c.clientX, c.clientY);
            input.move({ x: p.x, y: p.y }, dt, this.frameClock ?? c.timeStamp);
          }
        } else input.move({ x: e.global.x, y: e.global.y }, dt, this.eventTime(e));
      }
      this.refreshCursor();
    });
    const up = (e: FederatedPointerEvent): void => {
      const s = this.session;
      if (s && !this.photo) {
        const slot = s.input.mode === 'hold' ? s.pocket.slotAt(e.global.x, e.global.y) : null;
        s.input.up(this.eventTime(e), { x: e.global.x, y: e.global.y });
        if (slot !== null) s.pocket.bump(slot);
      }
      // A sticker let go over a button still lands (or goes back to the tray).
      this.photo?.release({ x: e.global.x, y: e.global.y });
      this.refreshCursor();
    };
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    stage.on('pointerleave', () => {
      this.session?.input.leave();
      this.pointer = null;
      this.cursor.visible = false;
    });
    stage.on('wheel', (e: FederatedWheelEvent) => {
      this.session?.hints.noteInput();
      this.music.input();
      if (!this.overlaid) this.session?.input.wheel(e.deltaX, e.deltaY);
    });
  }

  private menuSound(name: MenuSound, strength = 1): void {
    this.sfx.play(name as SfxName, strength);
  }

  /** Fade to the curtain, run `swap`, then fade back in. */
  /**
   * Cover the screen, run `swap`, then fade back in. Opening a world covers
   * at once (building it takes a moment anyway, and the first click should
   * reach the world fast); going to the menu fades out first.
   */
  private async transition(swap: () => Promise<void>, fadeOut = true): Promise<void> {
    this.switching = true;
    this.sfx.play('whoosh_in');
    if (!fadeOut) this.curtainAlpha = this.curtain.alpha = 1;
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        // A 0.15 s fade however slow the frames are.
        this.curtainAlpha = Math.min(1, this.curtainAlpha + Math.max(0.2, this.app.ticker.deltaMS / 150));
        this.curtain.alpha = this.curtainAlpha;
        if (this.curtainAlpha >= 1) {
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
    try {
      await swap();
    } finally {
      this.switching = false;
    }
  }

  async showMenu(): Promise<void> {
    if (this.scene !== 'boot') return this.transition(() => this.buildMenu());
    return this.buildMenu();
  }

  private async buildMenu(): Promise<void> {
    this.closePanel(true);
    this.closeCredits(true);
    if (this.session) {
      await this.saveNow();
      this.closeWorld();
    }
    const slots = await this.saves.list();
    this.menu?.destroy({ children: true });
    this.menu = new MenuScene(this.app.renderer, slots, {
      open: (slot) => {
        this.sfx.play('ui_pop');
        void this.openSlot(slot);
      },
      remove: async (slot, locked) => {
        this.sfx.play('bin_shut');
        await this.saves.remove(slot, locked);
      },
      settings: () => this.openSettings(),
      credits: () => this.openCredits(),
      quit: () => {
        this.sfx.play('ui_close');
        void this.settings.flush().then(() => this.api.quit());
      },
      sound: (name, strength) => this.menuSound(name, strength),
    });
    this.menu.reduceMotion = this.settings.get().reduceMotion;
    this.app.stage.addChild(this.menu);
    this.raiseOverlays();
    this.scene = 'menu';
  }

  async openSlot(slot: number): Promise<void> {
    if (this.scene === 'world' || this.switching) return;
    // A slot that will not open never becomes a new world: that would write over its save.
    if (this.menu?.sign(slot)?.locked) return this.menu.sign(slot)?.refuse();
    await this.transition(() => this.buildWorld(slot), false);
  }

  private async buildWorld(slot: number): Promise<void> {
    this.closeCredits(true);
    const loaded = await this.saves.loadWithRecovery(slot);
    // The save went bad since the menu looked: back to the menu, which shows its padlock.
    if (loaded.locked) return this.buildMenu();
    if (loaded.recovered) this.recoveries.push(slot);
    const save = loaded.save;
    // Test mode seeds new worlds by slot alone, so every test run starts from the same world.
    const seed = this.api.testMode ? `slot-${slot}-test` : `slot-${slot}-${Date.now()}`;
    const sim = save ? Sim.load(save.world) : Sim.create({ seed });
    const intro = !save && this.introEnabled ? new Intro() : null;
    if (intro) sim.send({ type: 'stage_intro' });
    const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    const startX = save ? save.view.cameraX : START_CAMERA_X;
    const at = startX + VIEW_WIDTH_M / 2;
    const open = sim.barriers.view(at);
    camera.setLimits(open.x0, open.x1, sim.barriers.region(at));
    camera.set(startX);
    if (intro) {
      // Slide in from the pond side and settle with sleeping Dot in the middle.
      const dot = sim.views().find((v) => v.defId === 'bug_ladybug_dot');
      const rest = dot ? dot.x - VIEW_WIDTH_M / 2 : START_CAMERA_X;
      camera.set(rest - INTRO.slideFrom);
      camera.glideTo(rest, INTRO.slideSeconds);
    }
    const input = new PointerController(
      sim,
      camera,
      VIEW_WIDTH_PX,
      () => this.frameClock ?? performance.now(),
    );
    const view = new WorldView(sim, input, this.app.renderer);
    const root = new Container();
    const ui = new Container();
    const pocket = new PocketTray(sim);
    input.pocketAt = (p) => pocket.slotAt(p.x, p.y);
    const pause = pauseButton(() => {
      this.sfx.play('ui_pop');
      this.openPause();
    });
    const home = homeButton(() => {
      this.sfx.play('ui_pop');
      // Inside a hidden area, home is back out through its doorway first.
      if (this.session?.hidden.leave()) return;
      this.session?.camera.glideTo(START_CAMERA_X, 1);
    });
    const camButton = cameraButton(() => this.togglePhoto());
    const journal = new JournalButton(sim);
    journal.onPress = () => this.openJournal();
    journal.onHover = () => this.sfx.play('hover', 0.5);
    journal.onStamp = () => this.sfx.play('stamp');
    for (const b of [pause, home, camButton]) b.onHover = () => this.sfx.play('hover', 0.5);
    const cover = new Graphics().rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(0x2b1b2e);
    cover.eventMode = 'none';
    cover.alpha = intro ? 1 : 0;
    const hints = new HintDirector(sim, camera, input);
    // A new world's first scene leads into the guided start (playtest F3).
    if (intro) hints.ghost.startGuide();
    const guideSkip = guideSkipButton(() => {
      this.sfx.play('ui_pop');
      this.session?.hints.skipGuide();
    });
    guideSkip.visible = false;
    view.hints = hints.affordance;
    view.music = () => {
      const seq = this.music.sequencerReport();
      return { seqColumn: seq?.column ?? -1, seqVolume: seq?.volume ?? 0, beat: this.music.beat() };
    };
    const marks = new HintMarks();
    const ghost = new GhostHand((defId) => sim.content.items.tryGet(defId));
    ui.addChild(pocket, pause, home, guideSkip);
    const topUi = new Container();
    topUi.addChild(camButton, journal);
    // The hint marks sit on the world; the ghost hand goes over the UI, so it can reach into the pocket.
    root.addChild(view, marks, cover, ui, topUi, ghost);
    const hidden = new HiddenDirector(sim, camera, input, (name, strength) => this.sfx.play(name, strength));
    root.addChildAt(hidden.iris, root.getChildIndex(view) + 1);
    root.addChild(hidden.telescope);

    this.menu?.destroy({ children: true });
    this.menu = null;
    this.app.stage.addChild(root);
    this.raiseOverlays();
    const materialOf = (kind: 'bug' | 'item', defId: string): Material =>
      kind === 'bug' || !sim.content.items.has(defId)
        ? 'bug'
        : soundMaterial(sim.content.items.get(defId).material);
    this.sfx.attach(sim.events, materialOf, (defId) =>
      sim.content.items.has(defId) ? sim.content.items.get(defId).tags : [],
    );
    this.sfx.toysPlayNotes = true;
    this.music.attach(sim);
    this.voices.attach(
      sim.events,
      (id) => sim.view(id)?.bug?.mood,
      (id) => {
        const v = sim.view(id);
        // The mustache (M11) works on the voice like a potion does.
        const stache = v?.bug?.wearing?.some((w) => w.defId === 'item_acc_mustache');
        return stache ? [...(v?.effects ?? []), { effect: 'mustache' }] : v?.effects;
      },
    );
    this.frameTimes.length = 0;
    this.updateTimes.length = 0;
    this.eventLog.length = 0;
    const session: WorldSession = {
      slot,
      sim,
      camera,
      view,
      input,
      root,
      ui,
      pause,
      home,
      cameraButton: camButton,
      journal,
      seen: new Set(),
      bookIn: 0,
      spread: 0,
      topUi,
      pocket,
      photos: [...(save?.meta.photos ?? [])],
      cover,
      focusX: null,
      createdAt: save?.meta.createdAt,
      area: sim.areaOf(camera.centerX).id,
      intro,
      grabbedBug: false,
      panned: false,
      thumb: save?.meta.thumb ?? null,
      handSent: null,
      follow: null,
      hints,
      marks,
      ghost,
      hintTime: 0,
      guideSkip,
      hidden,
    };
    input.onGesture = (gesture, strength) => {
      if (gesture === 'pan' || gesture === 'scroll' || gesture === 'edge') session.panned = true;
      this.sfx.play(gesture, strength);
    };
    view.onSound = (name, strength) => this.sfx.play(name, strength);
    view.weather.onSound = (name, strength) => this.sfx.ambient(name, strength);
    view.onAmbient = (name, strength) => this.sfx.ambient(name, strength);
    sim.events.onAny((name, payload) => {
      this.eventLog.push({ name, tick: sim.tick, payload });
      if (this.eventLog.length > 400) this.eventLog.shift();
    });
    sim.events.on('item_grabbed', (e) => {
      if (e.kind === 'bug') session.grabbedBug = true;
    });
    // The bucket lift's first trip: the camera follows it up into the treehouse.
    sim.events.on('lift_moved', (e) => {
      if (e.phase !== 'top' || !e.first) return;
      const house = sim.content.areas.tryGet('area_treehouse_arcade');
      if (house) session.follow = house.xStart - 6;
    });
    this.session = session;
    this.applySettings(this.settings.get());
    this.stepper.reset();
    this.sinceSave = 0;
    this.sinceAreaSave = 0;
    if (this.freezeNextWorld) {
      this.freezeNextWorld = false;
      this.frozen = true;
      this.frameClock = performance.now();
    }
    this.scene = 'world';
    // The first save runs in the background: the picture can take a moment on slow GPUs.
    if (!save) void this.saveNow();
  }

  private closeWorld(): void {
    if (!this.session) return;
    this.photo?.destroy({ children: true });
    this.photo = null;
    this.journal?.destroy({ children: true });
    this.journal = null;
    this.sfx.detach();
    this.music.detach();
    this.voices.detach();
    this.session.hints.dispose();
    this.session.hidden.dispose();
    this.session.sim.events.clear();
    this.session.root.destroy({ children: true });
    this.session = null;
  }

  /** Open the pause board: the world freezes and saves. */
  openPause(): void {
    if (!this.session || this.panel) return;
    if (this.photo) this.closePhoto();
    if (this.journal) this.closeJournal(true);
    this.openPanel(true);
    void this.saveNow();
  }

  /** The menu's heart: the credits board. */
  openCredits(): void {
    if (this.credits || this.panel || !this.menu) return;
    this.sfx.play('ui_open');
    this.credits = new CreditsBoard(CREDITS, () => this.closeCredits());
    this.app.stage.addChild(this.credits);
    this.raiseOverlays();
  }

  /** Put the credits board away. `now` skips the slide. */
  closeCredits(now = false): void {
    const board = this.credits;
    if (!board) return;
    this.credits = null;
    if (now) {
      board.destroy({ children: true });
      return;
    }
    this.sfx.play('ui_close');
    board.onClosed = () => board.destroy({ children: true });
    board.slideAway();
    this.closingCredits.push(board);
  }

  /** The menu's gear: the same board, without the way back to the menu. */
  openSettings(): void {
    if (this.panel || !this.menu) return;
    this.openPanel(false);
  }

  private openPanel(inWorld: boolean): void {
    const panel = new SettingsPanel({
      get: () => this.settings.get(),
      set: (change, done) => {
        // Sliders apply as they move; they are stored when the drag ends.
        if (done) void this.settings.set(change);
        else this.applySettings({ ...this.settings.get(), ...change });
      },
      sound: (kind, value = 1) => {
        if (kind === 'tick') this.sfx.play('ui_tick', value / 100);
        else if (kind === 'toggle') this.sfx.play(value ? 'toggle_on' : 'toggle_off');
        else this.sfx.play(kind === 'open' ? 'ui_open' : 'ui_close');
      },
      resume: () => this.closePanel(),
      toMenu: inWorld
        ? () => {
            this.sfx.play('ui_pop');
            void this.showMenu();
          }
        : undefined,
    });
    // Slider drags apply live but store on release; make sure a drag's last value lands.
    for (const [key, slider] of panel.sliders) {
      const inner = slider.onChange;
      slider.onChange = (v, done) => {
        inner?.(v, done);
        if (done) void this.settings.set({ [key]: v });
      };
    }
    this.panel = panel;
    this.stepper.reset();
    this.app.stage.addChild(panel);
    this.raiseOverlays();
  }

  /** Close the settings board (resume). `now` skips the slide-away. */
  closePanel(now = false): void {
    const panel = this.panel;
    if (!panel) return;
    const done = (): void => {
      if (this.panel === panel) this.panel = null;
      panel.destroy({ children: true });
      this.stepper.reset();
    };
    if (now) done();
    else {
      // The world resumes at once; the board slides away on its own.
      this.panel = null;
      this.stepper.reset();
      panel.onClosed = () => panel.destroy({ children: true });
      panel.close();
      this.closingPanels.push(panel);
    }
  }

  private closingPanels: SettingsPanel[] = [];
  private closingPhotos: PhotoMode[] = [];
  private closingJournals: JournalView[] = [];

  /** The camera button: out, or away again. */
  togglePhoto(): void {
    if (this.photo) this.closePhoto();
    else this.openPhoto();
  }

  /**
   * Photo mode (game design doc, section 14): the camera comes out, bugs in
   * frame react, then the world holds still (the sim does that itself on the
   * `photo_mode` command). The world view moves inside the photo's scene so
   * it can be zoomed, filtered, framed, and stuck with stickers.
   */
  openPhoto(): void {
    const s = this.session;
    if (!s || this.photo || this.switching) return;
    this.closePanel(true);
    this.closeJournal(true);
    s.input.leave();
    s.camera.stopGlide();
    s.camera.velocity = 0;
    this.sfx.play('camera_open');
    const photo = new PhotoMode(s.sim, s.camera, s.view, this.app.renderer, {
      sound: (name, strength) => this.sfx.play(name, strength),
      send: (command) => s.sim.send(command),
      save: (png) => this.api.photos.save(png),
      reduceMotion: () => this.settings.get().reduceMotion,
      onPhoto: (record) => {
        s.photos.push(record);
        if (s.photos.length > 60) s.photos.shift();
        void this.saveNow();
      },
      onLanded: () => {
        s.journal.bump();
        this.sfx.play('pick', 0.7);
      },
      journalAt: () => JOURNAL_AT,
      now: () => new Date().toISOString(),
    });
    this.photo = photo;
    s.root.addChildAt(photo, 1);
    s.sim.send({ type: 'photo_mode', open: true });
  }

  /** Put the camera away: the world view comes back to the root and the world runs on. */
  closePhoto(): void {
    const photo = this.photo;
    const s = this.session;
    if (!photo || !s) return;
    this.photo = null;
    this.sfx.play('camera_close');
    s.sim.send({ type: 'photo_mode', open: false });
    s.root.addChildAt(s.view, 0);
    photo.close();
    photo.onClosed = () => photo.destroy({ children: true });
    this.closingPhotos.push(photo);
    void this.saveNow();
  }

  /**
   * The journal (game design doc, section 13): the world pauses under it.
   * From photo mode, the camera goes away first. `page` opens at a tab;
   * otherwise it opens where it was left.
   */
  openJournal(page: PageId | null = null): void {
    const s = this.session;
    if (!s || this.journal || this.panel || this.switching) return;
    if (this.photo) this.closePhoto();
    s.input.leave();
    const sim = s.sim;
    const view = new JournalView(
      {
        content: sim.content,
        book: () => sim.book(),
        photos: s.photos,
        seen: s.seen,
        send: (command) => sim.send(command),
        sound: (name, strength) => this.sfx.play(name, strength),
        close: () => this.closeJournal(),
        travel: (areaId) => this.travelTo(areaId),
        // Only found areas the world has (the hidden ones may not be built yet).
        canTravel: (areaId) =>
          sim.content.areas.tryGet(areaId) !== undefined && sim.journal.state.areas.includes(areaId),
        cameraCenter: () => s.camera.centerX,
        reduceMotion: () => this.settings.get().reduceMotion,
        buttonAt: () => JOURNAL_AT,
      },
      page,
      s.spread,
    );
    this.journal = view;
    this.stepper.reset();
    this.app.stage.addChild(view);
    this.raiseOverlays();
  }

  /** Close the journal: the world runs on at once while the book flies home. `now` skips that. */
  closeJournal(now = false): void {
    const view = this.journal;
    if (!view) return;
    this.journal = null;
    this.stepper.reset();
    if (this.session) {
      this.session.spread = view.lastSpread;
      this.session.bookIn = 0;
    }
    if (now) {
      view.destroy({ children: true });
      return;
    }
    view.onClosed = () => view.destroy({ children: true });
    view.close();
    this.closingJournals.push(view);
  }

  /** The map page: close the book and glide the camera to an area. */
  travelTo(areaId: string): void {
    const s = this.session;
    const area = s?.sim.content.areas.tryGet(areaId);
    this.closeJournal();
    if (!s || !area) return;
    s.camera.glideTo((area.xStart + area.xEnd) / 2 - VIEW_WIDTH_M / 2, 1.2);
  }

  /** Save the current world, with a fresh picture for its sign. Saves never interleave. */
  saveNow(): Promise<void> {
    const session = this.session;
    if (!session) return this.saving;
    this.sinceSave = 0;
    this.saving = this.saving
      .then(async () => {
        const thumb = (await captureThumb(this.app.renderer, session.view)) ?? session.thumb;
        session.thumb = thumb;
        const file = await this.saves.save(
          session.slot,
          session.sim,
          { cameraX: session.camera.x },
          { createdAt: session.createdAt, thumb, photos: session.photos },
        );
        session.createdAt = file.meta.createdAt;
      })
      .then(
        () => undefined,
        (err: unknown) => console.error('Autosave failed', err),
      );
    return this.saving;
  }

  /** When a pointer event happened: on the frame clock while a test has the sim frozen. */
  private eventTime(e: FederatedPointerEvent): number {
    return this.frameClock ?? eventTime(e);
  }

  /** Freeze or unfreeze the sim (test hook). Freezing saves, like any pause. */
  setPaused(paused: boolean): void {
    if (paused === this.frozen) return;
    const was = this.paused;
    this.frozen = paused;
    this.frameClock = paused ? performance.now() : null;
    this.stepper.reset();
    if (!was && this.paused) void this.saveNow();
  }

  private setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    const was = this.paused;
    this.hidden = hidden;
    this.stepper.reset();
    if (!was && this.paused) void this.saveNow();
  }

  /** Advance the sim synchronously (test hook). */
  stepSim(n: number): void {
    const s = this.session;
    if (!s) return;
    for (let i = 0; i < n; i++) s.sim.step();
  }

  /**
   * Run `n` whole frames' worth of input and sim at 60 Hz without waiting
   * for the screen (test hook): pointer drags go out exactly as a frame
   * would send them, so tests stay deterministic on slow machines.
   */
  stepFrames(n: number): void {
    const s = this.session;
    if (!s) return;
    for (let i = 0; i < n; i++) {
      if (this.frameClock !== null) this.frameClock += 1000 / 60;
      s.hidden.update(1 / 60);
      s.input.frame(1 / 60);
      this.sendHand(s);
      s.sim.step();
    }
  }

  /** Tell the sim where the hand is (Twig freezes near it, the spider watches it), when it moves a bit. */
  private sendHand(s: WorldSession): void {
    const w = s.input.hoverWorld;
    const last = s.handSent;
    if (!w) {
      if (last === null) return;
      s.handSent = null;
      s.sim.send({ type: 'hand', x: null, y: null });
      return;
    }
    if (last && Math.hypot(w.x - last.x, w.y - last.y) < 0.1) return;
    s.handSent = { x: w.x, y: w.y };
    s.sim.send({ type: 'hand', x: w.x, y: w.y });
  }

  /** Tell the sim what the camera shows, so faraway areas can sleep. */
  private sendFocus(s: WorldSession): void {
    if (s.focusX !== null && Math.abs(s.camera.x - s.focusX) < 0.25) return;
    s.focusX = s.camera.x;
    s.sim.send({ type: 'focus', x0: s.camera.x, x1: s.camera.x + VIEW_WIDTH_M });
  }

  /** The first scene: fade in, wake Dot when the hand comes near, and the rest (see intro.ts). */
  private runIntro(s: WorldSession, dt: number): void {
    const intro = s.intro;
    if (!intro) return;
    const dot = s.sim.views().find((v) => v.defId === 'bug_ladybug_dot' && v.pocket === undefined);
    const actions = intro.update(dt, {
      cursor: s.input.hoverWorld,
      dot: dot?.bug ? { id: dot.id, x: dot.x, y: dot.y, asleep: dot.bug.mode === 'st_sleep' } : null,
      grabbedBug: s.grabbedBug,
      panned: s.panned,
      cameraX: s.camera.x,
    });
    s.cover.alpha = intro.cover;
    for (const a of actions) {
      if (a.type === 'wake') s.sim.send({ type: 'wake', id: a.id });
      else if (a.type === 'beckon') s.sim.send({ type: 'beckon', id: a.id, x: a.x });
      else if (a.type === 'drift') s.camera.glideTo(a.x, a.seconds);
      else s.intro = null;
    }
  }

  /** Tests can have the next world open frozen, so not one step runs before they say. */
  freezeNextWorld = false;

  /** Screenshots can slow the journal's animations down to catch them midway. */
  journalSpeed = 1;

  /** Tests can stop the menu's clock and step it with `menuFrames`. */
  menuFrozen = false;

  /** Run the menu for `n` frames at 60 Hz right now (test hook). */
  menuFrames(n: number): void {
    for (let i = 0; i < n; i++) this.menu?.update(1 / 60);
  }

  private frame(dt: number): void {
    this.frameCount++;
    this.artLab?.update(dt);
    if (this.menu && !this.menuFrozen) this.menu.update(dt);
    if (this.panel) this.panel.update(dt);
    this.credits?.update(dt);
    this.closingCredits = this.closingCredits.filter((b) => {
      if (b.destroyed) return false;
      b.update(dt);
      return !b.destroyed;
    });
    if (this.journal) this.journal.update(dt * this.journalSpeed);
    this.closingPanels = this.closingPanels.filter((p) => {
      if (p.destroyed) return false;
      p.update(dt);
      return !p.destroyed;
    });
    this.closingJournals = this.closingJournals.filter((a) => {
      if (a.destroyed) return false;
      a.update(dt * this.journalSpeed);
      return !a.destroyed;
    });
    this.closingPhotos = this.closingPhotos.filter((p) => {
      if (p.destroyed) return false;
      p.update(dt);
      return !p.destroyed;
    });
    if (!this.switching && this.curtainAlpha > 0) {
      this.curtainAlpha = Math.max(0, this.curtainAlpha - dt * 4);
      this.curtain.alpha = this.curtainAlpha;
    }
    this.updateToast?.update(dt);
    this.refreshCursor();
    if (this.pointer) this.cursor.update(dt, this.pointer.x, this.pointer.y);
    const s = this.session;
    if (!s) {
      if (this.menu) this.music.menuFrame(dt);
      return;
    }
    if (!this.paused) {
      s.hidden.update(dt);
      s.input.frame(dt);
      this.stepper.advance(dt, () => s.sim.step());
      this.sinceSave += dt;
      this.sinceAreaSave += dt;
      this.runIntro(s, dt);
    }
    // Locked areas: the camera may look past a barrier, and springs back when let go.
    // Inside a hidden area (M10), its sealed stretch is all there is.
    const open = s.sim.barriers.view(s.camera.centerX);
    s.camera.setLimits(open.x0, open.x1, s.sim.barriers.region(s.camera.centerX));
    if (s.follow !== null) {
      s.camera.glideTo(s.follow, 1.6);
      s.follow = null;
    }
    if (!this.photo) s.camera.holding = s.input.mode === 'pan' || s.input.mode === 'hold';
    s.camera.update(dt);
    this.sendFocus(s);
    this.sendHand(s);
    // In photo mode the world holds still once the camera moment is over: no animation runs either.
    const held = this.photo !== null && (s.sim.photo?.frozen ?? false);
    s.view.update(held ? 0 : dt, s.camera);
    if (this.photo) this.photo.update(dt);
    const hideUi = this.photo !== null || this.closingPhotos.length > 0;
    s.ui.visible = !hideUi;
    this.music.worldFrame(dt, {
      sim: s.sim,
      x0: s.camera.x,
      x1: s.camera.x + VIEW_WIDTH_M,
      handBusy: s.input.mode === 'hold',
      paused: this.panel !== null,
    });
    // Home shows only away from the plaza.
    const area = s.sim.areaOf(s.camera.centerX).id;
    s.home.visible = area !== PLAZA.id;
    if (!this.paused) {
      if (area !== s.area) {
        s.area = area;
        if (this.sinceAreaSave >= AREA_SAVE_GAP) {
          this.sinceAreaSave = 0;
          void this.saveNow();
        }
      }
      if (this.sinceSave >= AUTOSAVE_SECONDS) void this.saveNow();
    }
    s.pause.update(dt);
    s.home.update(dt);
    s.guideSkip.visible = s.hints.ghost.guiding && (s.intro === null || s.intro.t >= GUIDE.startAt);
    s.guideSkip.update(dt);
    // Hints: wobbles and glints where the hand rests, and now and then a ghost-hand demo.
    const reduced = this.settings.get().reduceMotion;
    const ghost = s.hints.update({
      dt,
      wallDt: Math.min(2, this.app.ticker.deltaMS / 1000),
      // The guided start may run during the first scene, once its camera slide is over.
      blocked:
        this.paused ||
        this.switching ||
        this.overlaid ||
        (s.intro !== null && !(s.hints.ghost.guiding && s.intro.t >= GUIDE.startAt)),
      pointer: this.pointer,
      reduced,
    });
    s.ghost.update(dt, ghost);
    s.hintTime += dt;
    s.marks.update(s.camera.x, s.hintTime, s.hints.spots, s.hints.affordance, reduced);
    const tab = s.hints.affordance;
    s.pocket.update(dt, this.overlaid ? null : s.sim.physics.grabbed, this.overlaid ? null : this.pointer, {
      demo: ghost?.tray ?? false,
      glint: tab.glint('pocket'),
      wobble: tab.wobble('pocket') * (reduced ? 0.4 : 1),
    });
    // The journal button rereads the book now and then (it is not free to work out).
    s.bookIn -= dt;
    if (s.bookIn <= 0) {
      s.bookIn = 0.5;
      const book = withSeen(s.sim.book(), s.seen);
      s.journal.setBook(book.completion, book.newCount);
    }
    s.journal.update(dt, this.overlaid ? null : this.pointer, Math.min(2, this.app.ticker.deltaMS / 1000));
    s.cameraButton.update(dt);
  }
}
