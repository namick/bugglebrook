import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { FixedStepper, Sim, VIEW_WIDTH_M } from '../../../game';
import { CONTENT } from '../../../game/data';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { SlotLock, SlotSummary } from '../app/saveService';
import { Camera } from '../render/camera';
import { WorldView } from '../render/worldView';
import { stroke } from '../render/palette';
import { HOLD } from './holdArm';
import { PictureButton, markUi } from './button';
import { CompostBin, binProgress } from './compostBin';
import { doorIcon, gearIcon, heartIcon, pauseIcon, stumpIcon, token } from './icons';
import { Logo } from './logo';
import { SIGN_H, SlotSign, slotPicture } from './slotSign';

export type MenuSound = 'ui_pop' | 'hover' | 'pick' | 'crash' | 'sparkle' | 'swish';

export interface MenuHooks {
  open(slot: number): void;
  /** Delete a slot (a locked one is moved aside, never deleted). Resolves when it is gone. */
  remove(slot: number, locked: SlotLock | null): Promise<void>;
  settings(): void;
  /** The heart: who made the game. */
  credits(): void;
  quit(): void;
  sound(name: MenuSound, strength?: number): void;
}

/** Where the menu's camera looks: the stump in the middle of the plaza. */
const PLAZA = CONTENT.areas.get('area_stump_plaza');
export const MENU_CAMERA_X = PLAZA.xStart + 19.5 - VIEW_WIDTH_M / 2;
const SIGN_Y = 640;
const SIGN_XS = [540, 960, 1380];
const BIN_AT = { x: 1760, y: 930 };

/** A warm sunset wash over the live plaza, drawn once. */
function sunset(): Container {
  const c = new Container();
  const wash = new Graphics();
  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0xff8e6e },
      { offset: 0.55, color: 0xffc08a },
      { offset: 1, color: 0xffe9c8 },
    ],
    textureSpace: 'local',
  });
  wash.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(gradient);
  wash.blendMode = 'multiply';
  // A warm glow around the low sun.
  const glow = new Graphics();
  for (let r = 460; r > 40; r -= 40) glow.circle(1540, 170, r).fill({ color: 0xffb35c, alpha: 0.045 });
  glow.blendMode = 'add';
  c.addChild(wash, glow);
  return c;
}

/**
 * The main menu (game design doc, section 17): the plaza at sunset, live,
 * with its bugs wandering; the twig-and-shell logo; three wooden signs, one
 * per save slot; a compost bin for deleting slots; a settings gear; a door
 * that quits; and a heart for the credits. No words anywhere but the makers'
 * names on the credits board.
 */
export class MenuScene extends Container {
  readonly signs: SlotSign[] = [];
  readonly bin = new CompostBin();
  readonly gear: PictureButton;
  readonly door: PictureButton;
  readonly heart: PictureButton;
  readonly logo = new Logo();
  private readonly gearArt: Graphics;
  private readonly doorArt = new Graphics();
  private readonly sim: Sim;
  /** The live plaza. Built a moment after the menu opens, so the signs are ready at once. */
  view: WorldView | null = null;
  private reduced = false;
  private readonly backdrop = new Graphics();
  private readonly camera: Camera;
  private readonly stepper = new FixedStepper();
  private readonly ui = new Container();
  private time = 0;
  /** A sign resting in the bin (dropped there), waiting for the lid. */
  private inBin: SlotSign | null = null;
  private deleting = false;
  private closedFor = 0;

  constructor(
    private readonly renderer: Renderer | null,
    slots: readonly SlotSummary[],
    private readonly hooks: MenuHooks,
  ) {
    super();
    // The live plaza behind everything. Its own little world, never saved.
    this.sim = Sim.create({ seed: 'menu' });
    this.camera = new Camera(this.sim.worldWidth, VIEW_WIDTH_M);
    this.camera.set(MENU_CAMERA_X);
    this.sim.send({ type: 'focus', x0: this.camera.x, x1: this.camera.x + VIEW_WIDTH_M });
    // A plain sunset sky until the live plaza is drawn.
    this.backdrop.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(0xf4b58a);
    this.backdrop.rect(0, 930, VIEW_WIDTH_PX, 150).fill(0x8a6a4a);
    this.addChild(this.backdrop, sunset(), this.ui);

    this.logo.position.set(VIEW_WIDTH_PX / 2, 205);
    this.logo.eventMode = 'static';
    this.logo.on('pointertap', () => {
      this.logo.hop();
      this.hooks.sound('sparkle');
    });
    markUi(this.logo);
    this.ui.addChild(this.logo);

    slots.forEach((slot, i) => {
      const sign = new SlotSign(slot.slot, slot.save ? slotPicture(slot.save) : null, slot.locked);
      sign.home = { x: SIGN_XS[i] ?? 960, y: SIGN_Y };
      // Signs pop up from the ground one after another.
      sign.position.set(sign.home.x, sign.home.y);
      sign.rise = 420 + i * 120;
      sign.label = `slot-${slot.slot}`;
      sign.onClick = () => {
        if (this.deleting) return;
        if (sign.locked) {
          sign.refuse();
          this.hooks.sound('crash', 0.3);
          return;
        }
        this.hooks.open(slot.slot);
      };
      sign.onDragStart = () => {
        this.hooks.sound('pick');
        if (this.inBin === sign) this.inBin = null;
      };
      sign.onDrop = () => {
        if (this.bin.catches(sign.x, sign.y + SIGN_H * 0.2)) {
          this.inBin = sign;
          this.hooks.sound('swish');
        }
      };
      this.signs.push(sign);
      this.ui.addChild(sign);
    });

    this.bin.position.set(BIN_AT.x, BIN_AT.y);
    this.ui.addChildAt(this.bin, 1);

    const gearBase = token(new Graphics(), 52);
    this.gearArt = gearIcon(new Graphics(), 90);
    const gearHolder = new Container();
    gearHolder.addChild(gearBase, this.gearArt);
    this.gear = new PictureButton(gearHolder, 120, 120, () => this.hooks.settings());
    this.gear.position.set(VIEW_WIDTH_PX - 90, 90);
    this.gear.label = 'gear';
    this.gear.onHover = () => this.hooks.sound('hover');

    const doorBase = token(new Graphics(), 52);
    const doorHolder = new Container();
    doorHolder.addChild(doorBase, this.doorArt);
    doorIcon(this.doorArt, 90, 0);
    this.door = new PictureButton(doorHolder, 120, 120, () => this.hooks.quit());
    this.door.position.set(90, 90);
    this.door.label = 'door';
    this.door.onHover = () => this.hooks.sound('hover');
    // The heart, bottom left: the credits board.
    const heartArt = heartIcon(token(new Graphics(), 46), 70);
    this.heart = new PictureButton(heartArt, 110, 110, () => this.hooks.credits());
    this.heart.position.set(90, VIEW_HEIGHT_PX - 90);
    this.heart.label = 'credits';
    this.heart.onHover = () => this.hooks.sound('hover');
    this.ui.addChild(this.gear, this.door, this.heart);
  }

  /** Reduce motion for the live plaza (a setting). */
  set reduceMotion(on: boolean) {
    this.reduced = on;
    if (this.view) this.view.reduceMotion = on;
  }

  /** Every sign is standing at its spot and nothing is being dragged (tests wait for this). */
  get settled(): boolean {
    return this.signs.every(
      (s) => !s.dragging && s.rise === 0 && Math.hypot(s.x - s.home.x, s.y - s.home.y) < 1,
    );
  }

  /** The sign for a slot. */
  sign(slot: number): SlotSign | undefined {
    return this.signs.find((s) => s.slot === slot);
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.view && this.time >= 0.6) {
      this.view = new WorldView(this.sim, null, this.renderer);
      this.view.eventMode = 'none';
      this.view.reduceMotion = this.reduced;
      this.view.alpha = 0;
      this.addChildAt(this.view, 1);
    }
    if (this.view) {
      this.stepper.advance(dt, () => this.sim.step());
      this.view.alpha = Math.min(1, this.view.alpha + dt * 3);
      this.view.update(dt, this.camera);
    }
    this.logo.update(dt);
    this.gear.update(dt);
    this.door.update(dt);
    this.heart.update(dt);
    this.gearArt.rotation = this.time * 0.25 + (this.gear.isHovered ? this.time * 2 : 0);
    doorIcon(this.doorArt.clear(), 90, this.door.isHovered ? 0.8 : 0.1 + Math.sin(this.time * 1.5) * 0.05);

    const dragged = this.signs.find((s) => s.dragging) ?? null;
    const candidate = dragged ?? this.inBin;
    const over = !!candidate && this.bin.catches(candidate.x, candidate.y + SIGN_H * 0.2);
    if (dragged && !over && this.inBin === dragged) this.inBin = null;
    this.bin.inviting = dragged !== null;
    const before = this.bin.progress;
    if (!this.deleting) this.bin.progress = binProgress(this.bin.progress, over, dt);
    if (over && before === 0 && this.bin.progress > 0) this.hooks.sound('hover');
    this.bin.update(dt);

    for (const sign of this.signs) {
      const inside = over && sign === candidate;
      sign.update(dt, inside && !sign.dragging);
      // Into the bin it shrinks down into the mouth.
      const target = inside ? 0.45 : 1;
      const k = sign.scale.x + (target - sign.scale.x) * Math.min(1, dt * 10);
      sign.scale.set(k);
      if (inside && !sign.dragging) {
        sign.x += (this.bin.x - sign.x) * Math.min(1, dt * 10);
        sign.y += (this.bin.y - 150 - sign.y) * Math.min(1, dt * 10);
      }
    }

    if (!this.deleting && this.bin.progress >= 1 && candidate) this.shut(candidate);
    if (this.deleting) {
      this.closedFor += dt;
      this.bin.progress = 1;
    }
  }

  /** The lid shut on a slot: it is gone. The sign comes back up empty. */
  private shut(sign: SlotSign): void {
    this.deleting = true;
    this.closedFor = 0;
    this.hooks.sound('crash');
    void this.hooks.remove(sign.slot, sign.locked).then(() => {
      sign.setPicture(null);
      sign.letGo();
      this.inBin = null;
      sign.scale.set(1);
      sign.position.set(sign.home.x, sign.home.y);
      sign.rise = 500;
      this.deleting = false;
      this.bin.progress = 0;
      this.hooks.sound('sparkle');
    });
  }
}

/** The pause button (top left): a leaf with two lines. */
export function pauseButton(onPress: () => void): PictureButton {
  const art = token(new Graphics(), 48);
  pauseIcon(art, 80);
  const button = new PictureButton(art, 110, 110, onPress);
  button.position.set(80, 80);
  button.label = 'pause';
  return button;
}

/** How long the home stump must be held before the camera goes home. */
export const HOME_HOLD_SECONDS = HOLD.seconds;

/** The home button (bottom right, only away from the plaza): a little stump. */
export function homeButton(onPress: () => void): PictureButton {
  const art = token(new Graphics(), 48);
  stumpIcon(art, 80);
  art.circle(0, 0, 48).stroke(stroke(6));
  // Press and hold: it sits where flung things fly, so a stray click never leaves the place (R35).
  const button = new PictureButton(art, 110, 110, onPress, HOME_HOLD_SECONDS);
  button.position.set(VIEW_WIDTH_PX - 90, VIEW_HEIGHT_PX - 90);
  button.label = 'home';
  return button;
}
