import type { Container } from 'pixi.js';
import type { MusicReport } from '../audio/musicEngine';
import type { SequencerReport } from '../audio/musicDirector';
import { WebAudioMusicSink, fetchBytes } from '../audio/musicPlayer';
import type { NoteLog } from '../audio/musicToys';
import { SEQ_COLS, SEQ_ROWS, cellCenter } from '../../../game/systems/sequencer';
import { PIXELS_PER_METER as PPM, VIEW_WIDTH_PX } from '../../../game/constants';
import type { Command, EntityView } from '../../../game';
import type { ReactionType } from '../../../game/events';
import type { SlotInfo } from '../../../shared/ipc';
import type { Settings } from '../../../shared/settings';
import type { Game, SceneName } from '../app/game';
import type { ArtHook } from '../art/artHook';
import { artHook } from '../art/artHook';
import type { DemoKind } from '../app/ghost';
import type { PhotoRecord } from '../../../game';
import type { Point } from '../render/camera';
import type { StickerPlacement } from '../photo/photoMath';
import type { TrayKind } from '../photo/photoMode';
import { stickerHandle } from '../photo/photoMath';
import { LEVER_LENGTH, LEVER_PIVOT, LEVER_REST } from '../render/areaArt/benchLive';
import type { CritterInfo } from '../render/areaArt/critterLive';
import type { BubbleInfo } from '../render/bubbles';
import { BugSprite } from '../render/draw/bug';
import type { CursorPose } from '../ui/cursor';
import type { ToggleKey, VolumeKey } from '../ui/settingsPanel';

/**
 * Named UI controls the tests can find: buttons, sliders' tracks, toggles,
 * the bin, and photo mode's camera, shutter, album, tray arrows, frame
 * thumbnails (`frame_leaf`), filter tokens (`filter_warm`), and tray
 * stickers (`sticker_crown`, on the tray's current page).
 */
export type UiName =
  | 'pause'
  | 'home'
  | 'guide_skip'
  | 'resume'
  | 'to_menu'
  | 'gear'
  | 'door'
  | 'credits'
  | 'credits_close'
  | 'bin'
  | 'stamps'
  | `toggle_${ToggleKey}`
  | 'camera'
  | 'shutter'
  | 'album'
  | 'album_prev'
  | 'album_next'
  | 'tray_prev'
  | 'tray_next'
  | `frame_${string}`
  | `filter_${string}`
  | `sticker_${string}`
  | `tab_${TrayKind}`;

/** Photo mode as the tests see it. */
export interface PhotoInfo {
  /** The camera is out. */
  open: boolean;
  /** The sim says the world holds still. */
  frozen: boolean;
  zoom: number;
  cx: number;
  cy: number;
  frame: string;
  filter: string;
  stickers: StickerPlacement[];
  selected: number;
  /** The open tray, or null. */
  tray: TrayKind | null;
  trayPage: number;
  trayPages: number;
  /** How bright the flash got for the last photo (0 with reduce motion's fade). */
  flashPeak: number;
  /** Photos taken this visit. */
  taken: number;
  /** The newest photo's record, if any (its `file` fills in when the write finishes). */
  last: PhotoRecord | null;
  /** Photos kept in the session (what the save gets). */
  photos: number;
  albumOpen: boolean;
  /** Bugs in the frame right now, nearest the middle first. */
  bugs: string[];
}

/**
 * Test-only API on window.__bb. Installed only when the app is launched with
 * BUGGLEBROOK_TEST=1, so E2E tests can assert on game state instead of pixels.
 */
export interface TestHook extends ArtHook {
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
  /** The credits board's lines (role and name), or null when it is closed. */
  credits(): { role: string; name: string }[] | null;
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
  /** Ambient critters drawn this frame (world meters), and whether each is dodging the hand or a bug. */
  critters(): CritterInfo[];
  /** Bugs waiting to be found on screen, and the strength of their sign of life this frame (0 to 1). */
  pendingLife(): { id: number; defId: string; pending: string; life: number }[];
  /** Bug sprites' moving parts redrawn and skipped since launch (R36's pose cache). */
  bugRedraws(): { drawn: number; skipped: number };
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
  /**
   * M10's hidden areas: the iris wipe, where the camera is, doorways gone
   * through, the telescope's view, the doorways, the depths (the ants'
   * sugar, the queen, the conga, the root), the hollow (the gnome's nose,
   * the finale), the lost-toy pictures, and fireworks in the air.
   */
  hidden(): {
    wiping: boolean;
    inside: boolean;
    area: string;
    trips: number;
    telescope: { open: boolean; lit: string[]; dark: string[] };
    doors: { id: string; open: boolean; x: number; y: number }[];
    depths: { sugar: number | null; queenFed: number; dancing: boolean; conga: boolean; rootStuck: boolean };
    hollow: { noseOn: boolean; finale: number };
    /** Clues the journal noted (the gnome's sniffle, the nose carried home). */
    noticed: string[];
    pictures: number;
    fireworks: number;
  } | null;
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
  /**
   * M9: what the music is doing: the target and playing track, the layer
   * gains and why, the tempo, key, and scale, and the beat on the music
   * clock (the null sink's clock in test mode).
   */
  music(): MusicReport;
  /** M9: the toy notes scheduled lately (newest last): time, beat, MIDI note, key, and source. */
  musicNotes(): NoteLog[];
  /**
   * M9: the mushroom sequencer: the pattern playing, the playhead column,
   * and world points for each cap (row, col) and its controls.
   */
  sequencer():
    | (SequencerReport & {
        caps: { x: number; y: number }[][];
        tufts: { x: number; y: number }[];
        stone: { x: number; y: number };
        knob: { x: number; y: number };
        seed: { x: number; y: number };
      })
    | null;
  /**
   * M9: fetch one of the shipped music files and decode it offline, to check
   * the packaged path works: its byte size and decoded length in samples.
   */
  musicProbe(
    file: string,
  ): Promise<{ bytes: number; samples: number; channels: number; rate: number } | { error: string }>;
  /**
   * M9: play a track through the real WebAudio music player into an offline
   * context for `seconds`, starting `beforeSeam` seconds before its loop
   * wraps, and measure the mix: peak, RMS, and whether the loop wrapped.
   */
  musicRender(
    track: string,
    seconds: number,
    beforeSeam: number,
  ): Promise<{ peak: number; rms: number; wrapped: boolean } | { error: string }>;
  /** Set an entity's bites or paint directly, to show those looks (test mode only). */
  debugEntity(id: number, fields: { bites?: number; paint?: string[] }): void;
  /** Shots (M10): start the finale's fireworks without the golden marble's long chain. */
  debugFinale(): void;
  /** Rain drops, leaves, and light sprites being drawn now (particle budgets). */
  weatherStats(): { drops: number; leaves: number; lights: number };
  /** M11: photo mode's state. `open` false means the camera is away. */
  photo(): PhotoInfo;
  /** Where a placed sticker's middle is, in client pixels, or null. */
  stickerClient(i: number): Point | null;
  /** Where a placed sticker's corner handle is, in client pixels, or null. */
  stickerHandleClient(i: number): Point | null;
  /** Staging: stick a sticker on at view pixels (x, y). Returns its index, or -1. */
  placeSticker(id: string, x: number, y: number, scale?: number, rotation?: number): number;
  /** Staging: open the album board (its button only shows once there is a photo). */
  openAlbum(): void;
  /**
   * Screenshots only: patch a bug's brain and paint directly, to stage a look
   * the AI would take a long time to reach. `null` clears a field;
   * `peekTicks` opens Twig's eyes for that many ticks; `carrying` with
   * `overhead` or `rolling` makes it hold an item.
   */
  debugBug(id: number, patch: DebugBugPatch): void;
  /**
   * The teaching hints: the ghost-hand demo (what runs, how long the hand
   * has idled, what was shown, what the player has done, how many were cut
   * short, and the ghost's frame in client pixels), each affordance's glint
   * now and its wobble count, the cauldron ladle's stir invitation, and the
   * home button's hold ring.
   */
  hints(): {
    ghost: {
      active: string | null;
      idle: number;
      shown: Record<string, number>;
      done: string[];
      stopped: number;
      /** The guided start's demos still to come (F3), or null. */
      guide: string[] | null;
      frame: {
        x: number;
        y: number;
        pose: string;
        alpha: number;
        tray: boolean;
        carry: string | null;
      } | null;
    };
    glints: Record<string, number>;
    wobbles: Record<string, number>;
    ladleInviting: boolean;
    home: { progress: number; shake: number };
  } | null;
  /** Start ghost demos after `seconds` of idling instead of the usual 25, and optionally wait `cooldown` between them (tests only). */
  setGhostIdle(seconds: number, cooldown?: number): void;
  /** Screenshots only: show the ghost's demo of `kind` held still `t` seconds in (null hides it). False if it cannot be staged here. */
  pinGhost(kind: string | null, t?: number): boolean;
  /** Screenshots only: how long the home stump must be held. */
  setHomeHold(seconds: number): void;
  /** The discovery stamps: those on the strip (newest last), how many in all, how many landed, its opacity. */
  stamps(): {
    stamps: { kind: string; ref: string }[];
    total: number;
    landed: number;
    alpha: number;
    visible: boolean;
  } | null;
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
  const shown = (c: Container): boolean => {
    for (let t: Container | null = c; t; t = t.parent) if (!t.visible) return false;
    return true;
  };
  const centerOf = (c: Container | undefined | null): Point | null => {
    if (!c || c.destroyed || !c.parent || !shown(c)) return null;
    const g = c.getGlobalPosition();
    return logicalToClient({ x: g.x, y: g.y });
  };
  const uiControl = (name: UiName): Container | null => {
    const s = game.session;
    const panel = game.panel;
    const photo = game.photo;
    if (name.startsWith('frame_')) return photo?.frameButtons.get(name) ?? null;
    if (name.startsWith('filter_')) return photo?.filterButtons.get(name) ?? null;
    if (name.startsWith('sticker_')) return photo?.trayButtons.get(name) ?? null;
    if (name.startsWith('tab_')) return photo?.tabs.get(name.slice('tab_'.length) as TrayKind) ?? null;
    switch (name) {
      case 'pause':
        return s?.pause ?? null;
      case 'home':
        return s?.home ?? null;
      case 'guide_skip':
        return s?.guideSkip ?? null;
      case 'camera':
        return s?.cameraButton ?? null;
      case 'album':
        return s?.album ?? null;
      case 'album_prev':
        return game.album?.prev ?? null;
      case 'album_next':
        return game.album?.next ?? null;
      case 'shutter':
        return photo?.shutter ?? null;
      case 'tray_prev':
        return photo?.trayPrev ?? null;
      case 'tray_next':
        return photo?.trayNext ?? null;
      case 'resume':
        return panel?.buttons.get('resume') ?? null;
      case 'to_menu':
        return panel?.buttons.get('menu') ?? null;
      case 'gear':
        return game.menu?.gear ?? null;
      case 'door':
        return game.menu?.door ?? null;
      case 'credits':
        return game.menu?.heart ?? null;
      case 'credits_close':
        return game.credits?.close ?? null;
      case 'bin':
        return game.menu?.bin ?? null;
      case 'stamps':
        return s?.stamps.book ?? null;
      default: {
        const key = name.slice('toggle_'.length) as ToggleKey;
        return panel?.toggles.get(key) ?? null;
      }
    }
  };

  window.__bb = {
    ...artHook(game),
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
      // Into a hidden area (M10) too: its sealed stretch becomes the camera's limits first.
      const sim = game.session!.sim;
      const c = x + VIEW_WIDTH_PX / PPM / 2;
      const open = sim.barriers.view(c);
      cam.setLimits(open.x0, open.x1, sim.barriers.region(c));
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
    credits: () => (game.credits ? game.credits.lines.map((l) => ({ ...l })) : null),
    photo: () => {
      const p = game.photo;
      const s = game.session;
      return {
        open: p !== null,
        frozen: s?.sim.photo?.frozen ?? false,
        zoom: p?.view.zoom ?? 1,
        cx: p?.view.cx ?? VIEW_WIDTH_PX / 2,
        cy: p?.view.cy ?? 540,
        frame: p?.frame.id ?? 'frame_none',
        filter: p?.filter.id ?? 'filter_none',
        stickers: p ? p.stickers.map((st) => ({ ...st })) : [],
        selected: p?.selected ?? -1,
        tray: p?.open ?? null,
        trayPage: p?.trayPage ?? 0,
        trayPages: p?.trayPages ?? 0,
        flashPeak: p?.flashPeak ?? 0,
        taken: p?.taken ?? 0,
        last: p?.last ? { ...p.last } : (s?.photos.at(-1) ?? null),
        photos: s?.photos.length ?? 0,
        albumOpen: game.album !== null,
        bugs: p?.bugsInFrame() ?? [],
      };
    },
    stickerClient: (i) => {
      const st = game.photo?.stickers[i];
      return st ? logicalToClient({ x: st.x, y: st.y }) : null;
    },
    stickerHandleClient: (i) => {
      const st = game.photo?.stickers[i];
      return st ? logicalToClient(stickerHandle(st)) : null;
    },
    placeSticker: (id, x, y, scale, rotation) => game.photo?.place(id, x, y, scale, rotation) ?? -1,
    openAlbum: () => game.openAlbum(),
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
    critters: () => game.session?.view.critters ?? [],
    pendingLife: () => game.session?.view.pendingLife() ?? [],
    bugRedraws: () => ({ ...BugSprite.redraws }),
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
    hidden: () => {
      const s = game.session;
      if (!s) return null;
      const h = s.sim.hidden;
      const d = h.depths;
      return {
        ...s.hidden.report(),
        doors: h.doors().map((q) => ({ id: q.id, open: h.doorOpen(q.id), x: q.x, y: q.y })),
        depths: {
          sugar: d.state.sugar?.id ?? null,
          queenFed: d.state.queenFed,
          dancing: d.queenDancing,
          conga: d.state.conga,
          rootStuck: d.rootStuck,
        },
        hollow: { noseOn: h.hollow.noseOn, finale: h.hollow.state.finale },
        noticed: [...s.sim.journal.state.noticed],
        ...s.view.hiddenLook,
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
    hints: () => {
      const s = game.session;
      if (!s) return null;
      const info = s.hints.info();
      const f = s.ghost.frame;
      const at = f ? logicalToClient({ x: f.x, y: f.y }) : null;
      return {
        ghost: {
          active: info.active,
          idle: info.idle,
          shown: info.shown,
          done: info.done,
          stopped: info.stopped,
          guide: info.guide,
          frame:
            f && at ? { x: at.x, y: at.y, pose: f.pose, alpha: f.alpha, tray: f.tray, carry: f.carry } : null,
        },
        glints: info.glints,
        wobbles: info.wobbles,
        ladleInviting: s.view.ladleInviting,
        home: { progress: s.home.arm?.progress ?? 0, shake: s.home.arm?.shake ?? 0 },
      };
    },
    setGhostIdle: (seconds, cooldown) => {
      const s = game.session;
      if (!s) return;
      s.hints.ghost.idleStart = seconds;
      if (cooldown !== undefined) s.hints.ghost.cooldown = cooldown;
    },
    stamps: () => game.session?.stamps.info() ?? null,
    setHomeHold: (seconds) => {
      const arm = game.session?.home.arm;
      if (arm) arm.seconds = seconds;
    },
    pinGhost: (kind, t) => game.session?.hints.pin(kind as DemoKind | null, t) ?? false,
    debugFinale: () => game.session?.sim.hidden.hollow.startFinale(),
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
    music: () => game.music.report(),
    musicNotes: () => game.music.notes(),
    sequencer: () => {
      const sim = game.session?.sim;
      const report = game.music.sequencerReport();
      const l = sim?.places.sequencerLayout();
      if (!sim || !report || !l) return null;
      const caps = Array.from({ length: SEQ_ROWS }, (_r, row) =>
        Array.from({ length: SEQ_COLS }, (_c, col) => cellCenter(l, row, col)),
      );
      const tufts = Array.from({ length: SEQ_ROWS }, (_r, row) => ({
        x: l.tuftX,
        y: cellCenter(l, row, 0).y,
      }));
      const at = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x, y: p.y });
      return { ...report, caps, tufts, stone: at(l.stone), knob: at(l.knob), seed: at(l.seed) };
    },
    musicProbe: async (file) => {
      try {
        const bytes = await fetchBytes(`music/${file}`);
        const ctx = new OfflineAudioContext(2, 48000, 48000);
        const buf = await ctx.decodeAudioData(bytes.slice(0));
        return {
          bytes: bytes.byteLength,
          samples: buf.length,
          channels: buf.numberOfChannels,
          rate: buf.sampleRate,
        };
      } catch (err) {
        return { error: String(err) };
      }
    },
    musicRender: async (id, seconds, beforeSeam) => {
      try {
        const t = game.music.engine.library.track(id);
        if (!t) return { error: `no track ${id}` };
        const offset = t.loop.samples / 48000 - beforeSeam;
        const ctx = new OfflineAudioContext(2, Math.round(48000 * seconds), 48000);
        const sink = new WebAudioMusicSink(ctx, ctx.destination);
        await sink.load(id, t.layers);
        const gains = Object.fromEntries(Object.keys(t.layers).map((k) => [k, 1]));
        sink.start(id, { start: t.loop.start, samples: t.loop.samples }, 0, offset, gains, 1);
        const out = await ctx.startRendering();
        let peak = 0;
        let sum = 0;
        const n = out.length;
        for (let c = 0; c < out.numberOfChannels; c++) {
          const d = out.getChannelData(c);
          for (let i = 0; i < n; i++) {
            peak = Math.max(peak, Math.abs(d[i]!));
            sum += d[i]! * d[i]!;
          }
        }
        return {
          peak,
          rms: Math.sqrt(sum / (n * out.numberOfChannels)),
          wrapped: offset + seconds > t.loop.samples / 48000,
        };
      } catch (err) {
        return { error: String(err) };
      }
    },
    clearLogs: () => {
      game.sfx.log.length = 0;
      game.voices.log.length = 0;
      game.eventLog.length = 0;
    },
  };
}
