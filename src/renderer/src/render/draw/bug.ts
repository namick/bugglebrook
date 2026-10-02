import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BugDef, ItemDef, PendingState } from '../../../../game/data/types';
import type { ItemSprite } from './item';
import type { WearSpot } from '../wearLook';
import { placeWorn } from '../wearLook';
import type { BugMode } from '../../../../game/core/entities';
import type { RedrawStats } from '../bugCache';
import { PartCache, antennaeKey, faceKey, fxKey, legsKey, paintedKey, wingsKey } from '../bugCache';
import type { BugFace } from '../bugFace';
import { bugFace } from '../bugFace';
import type { BugPose } from '../bugPose';
import { bugPose } from '../bugPose';
import { CHEEK, OUTLINE, RIM_STYLES, STAR, darken, lighten, stroke } from '../palette';
import type { MovePose } from '../reactions';
import type { Look } from './face';
import { drawEye, drawMouth, spiral } from './face';
import { drawPaintPatches, paintColors } from './paint';
import type { Adjust, Box, SpeciesPainter } from './species/common';
import { AntennaSpring, TINTS } from './species/common';
import { makePainter } from './species';
import type { BugRig, FacePlacement, Pt } from '../rig/bugRig';
import { BEETLES, antennaPaths, facePlacement, legJoints, paintBox, rigFor, wingState } from '../rig/bugRig';

/** Everything a bug sprite needs to draw one frame. */
export interface BugFrame {
  pose: BugPose;
  face: BugFace;
  facing: 1 | -1;
  time: number;
  dt: number;
  /** Pupil direction in screen terms (x: right is +). */
  look: Look;
  /** Body velocity in m/s, for antenna follow-through. */
  vx: number;
  vy: number;
  /** Physics angle, used by the curled-up ball. */
  angle: number;
  /** Squash spring scale. */
  squashX: number;
  squashY: number;
  /** Stretch along the direction of travel. */
  stretchAngle: number;
  stretch: number;
  /** Cosmetic tumble while flying, radians. */
  spin: number;
  /** Dizzy stars to orbit the head. */
  stars: number;
  /** A reaction's body move (hops, spins, shrugs). */
  move?: MovePose;
  /** Hover rim light opacity, or 0 for none. */
  rim?: number;
  /** Standing on water (Skeet): little dimples under the feet. */
  skate?: boolean;
  /** Floating down with legs spread like a parachute (Skeet, flung). */
  chute?: boolean;
  /** Front legs held out, carrying something. */
  carrying?: boolean;
  /** Mid-hop on purpose (Boing): back legs kicked straight out. */
  hopping?: boolean;
  /** What the bug is doing in the sim, for poses the face does not cover. */
  mode?: BugMode;
  /** Waiting to be found: stuck on its back, aloof, or disguised as a twig. */
  pending?: PendingState;
  /** Twig's tiny eyes, open for a peek while disguised. */
  peeking?: boolean;
  /** Munch as a cocoon or a butterfly. */
  morph?: 'cocoon' | 'butterfly';
  /** Holding what it carries up over its head (Moose). */
  overhead?: boolean;
  /** Rolling what it carries behind it, walking backward (Barty). */
  rolling?: boolean;
  /** Paint IDs on it, oldest first. */
  paint?: readonly string[];
  /** A dramatic pose (Prim's karate): how far into it (0 to 1), seconds since it began, and whether it is a chop. */
  karate?: { k: number; t: number; chop: boolean };
  /** Fiddle playing his back legs like a violin (also shown while performing or playing). */
  fiddling?: boolean;
}

/** A worn thing as its bug draws it (M11). */
export interface WornLook {
  id: number;
  def: ItemDef;
}

/** How long a flipped hat (Boing's trick) is in the air, seconds. */
const FLIP_SECONDS = 0.7;

/**
 * A procedurally drawn bug. Static parts are drawn once per body form;
 * legs, face, antennae, and effects are redrawn every frame. The root sits
 * at the collider center; squash pivots on the feet.
 */
export class BugSprite extends Container {
  readonly r: number;
  /** The skeleton: joints and anchors, shared with the cutout renderer. */
  readonly bones: BugRig;
  protected readonly stretchA = new Container();
  protected readonly stretchB = new Container();
  protected readonly stretchC = new Container();
  protected readonly spinLayer = new Container();
  protected readonly squash = new Container();
  protected readonly rig = new Container();
  protected readonly rim = new Graphics();
  protected readonly legsBack = new Graphics();
  protected readonly wings = new Graphics();
  protected readonly body = new Graphics();
  protected readonly shell = new Graphics();
  protected readonly legsFront = new Graphics();
  protected readonly faceG = new Graphics();
  protected readonly antennae = new Graphics();
  protected readonly ball = new Graphics();
  protected readonly fx = new Graphics();
  /** Paint patches over the lower body, clipped to `paintMask`. */
  protected readonly paintG = new Graphics();
  protected readonly paintMask = new Graphics();
  protected readonly springs = [new AntennaSpring(), new AntennaSpring()];
  protected lastV = { x: 0, y: 0 };
  protected form: BugFace['form'] | null = null;
  /** The species painter for bugs drawn in their own module (M7 and later), or null. */
  protected readonly painter: SpeciesPainter | null;
  /** Pixels from the root down to the ground: the radius, or half a box collider's height. */
  readonly foot: number;
  private staticKey = '';
  private paintKey = '';
  /** Redraws and skips of the moving parts, over every bug sprite (R36; the test hook reads it). */
  static readonly redraws: RedrawStats = { drawn: 0, skipped: 0 };
  /** Each moving part's last key: a part is redrawn only when what it shows changed. */
  private readonly cache = {
    legs: new PartCache(BugSprite.redraws),
    wings: new PartCache(BugSprite.redraws),
    antennae: new PartCache(BugSprite.redraws),
    face: new PartCache(BugSprite.redraws),
    fx: new PartCache(BugSprite.redraws),
    painted: new PartCache(BugSprite.redraws),
  };
  /** What the painter asked for last time it drew, reused while its drawing is cached. */
  private lastAdjust: Adjust = { tilt: 0, bob: 0, still: false };
  /** Worn things (M11): behind the body (a cape) and in front of it (hats, glasses). */
  protected readonly wearBack = new Container();
  protected readonly wearFront = new Container();
  /** The worn things' sprites, by item ID. */
  private readonly worn = new Map<number, { def: ItemDef; sprite: ItemSprite }>();
  /** When a hat flip started (seconds of frame time), or null. */
  private flipAt: number | null = null;
  /** Where worn things sat last frame (tests): item ID to rig-space point, scale, and layer. */
  readonly wornAt = new Map<
    number,
    { x: number; y: number; scale: number; behind: boolean; hidden: boolean }
  >();

  constructor(readonly def: BugDef) {
    super();
    this.r = def.radius * PIXELS_PER_METER;
    this.bones = rigFor(def);
    this.painter = makePainter({
      def,
      r: this.r,
      layers: {
        rim: this.rim,
        legsBack: this.legsBack,
        wings: this.wings,
        body: this.body,
        shell: this.shell,
        legsFront: this.legsFront,
        antennae: this.antennae,
        face: this.faceG,
        ball: this.ball,
      },
    });
    this.foot = this.painter?.foot ?? this.r;
    this.addChild(this.stretchA, this.fx);
    this.stretchA.addChild(this.stretchB);
    this.stretchB.addChild(this.stretchC);
    this.stretchC.addChild(this.spinLayer, this.ball);
    this.spinLayer.addChild(this.squash);
    this.squash.addChild(this.rig);
    this.rig.addChild(
      this.rim,
      this.legsBack,
      this.wings,
      this.body,
      this.shell,
      this.legsFront,
      this.paintMask,
      this.paintG,
      this.antennae,
      this.faceG,
    );
    this.wearBack.label = 'worn behind';
    this.wearFront.label = 'worn';
    this.rig.addChildAt(this.wearBack, this.rig.getChildIndex(this.legsBack) + 1);
    this.rig.addChild(this.wearFront);
    this.paintG.label = 'paint';
    this.paintMask.label = 'paintMask';
    this.paintG.visible = false;
    this.paintMask.visible = false;
    this.squash.position.set(0, this.foot);
    if (this.painter) {
      this.faceG.context.batchMode = 'no-batch';
      this.spinLayer.visible = true;
      this.ball.visible = false;
      return;
    }
    this.drawBall();
    this.setForm('normal');
  }

  // --- Static art -------------------------------------------------------

  private setForm(form: BugFace['form']): void {
    if (form === this.form) return;
    this.form = form;
    this.body.clear();
    this.shell.clear();
    this.shell.rotation = 0;
    const curled = form === 'curled';
    this.spinLayer.visible = !curled;
    this.ball.visible = curled;
    switch (this.def.art) {
      case 'ladybug':
        this.drawLadybug();
        break;
      case 'pillbug':
        this.drawPillbug();
        break;
      case 'snail':
        if (form === 'in_shell') this.drawSnailInShell();
        else this.drawSnail();
        break;
      case 'strider':
        this.drawStrider();
        break;
      case 'grasshopper':
        this.drawGrasshopper();
        break;
      case 'firefly':
        this.drawFirefly();
        break;
    }
    this.drawRim(form);
  }

  /** A white silhouette stroke behind the body: the hover rim light. */
  private drawRim(form: BugFace['form']): void {
    const { r } = this;
    const g = this.rim.clear();
    // Each path is traced and stroked once per style: the soft glow, then the crisp rim.
    const rim = (trace: () => Graphics): void => {
      for (const style of RIM_STYLES) trace().stroke({ ...style });
    };
    if (form === 'curled') return;
    if (this.def.art === 'snail') {
      if (form === 'in_shell') {
        rim(() => g.circle(0, 0, r * 0.98));
        return;
      }
      rim(() => g.circle(-r * 0.35, -r * 0.08, r * 0.86));
      rim(() =>
        g
          .moveTo(-r * 1.6, r * 0.93)
          .lineTo(r * 0.9, r * 1.0)
          .bezierCurveTo(r * 1.35, r * 1.0, r * 1.5, r * 0.6, r * 1.46, r * 0.12)
          .bezierCurveTo(r * 1.43, -r * 0.42, r * 0.98, -r * 0.62, r * 0.66, -r * 0.42),
      );
      return;
    }
    if (this.def.art === 'strider') {
      rim(() => g.poly(this.striderBody()));
      rim(() => g.circle(r * 0.88, -r * 0.3, r * 0.3));
      return;
    }
    if (this.def.art === 'grasshopper') {
      rim(() => g.poly(this.hopperBody()));
      rim(() => g.ellipse(r * 0.78, -r * 0.18, r * 0.5, r * 0.46));
      rim(() => g.ellipse(-r * 0.62, -r * 0.3, r * 0.5, r * 0.32));
      return;
    }
    if (BEETLES.has(this.def.art)) {
      rim(() => g.poly(this.dome(-r * 0.15, r * 0.34, r * 1.02, r * 1.14)));
      rim(() => g.circle(r * 0.8, r * 0.12, r * 0.55));
      rim(() => g.ellipse(-r * 0.1, r * 0.42, r * 0.95, r * 0.34));
      return;
    }
    rim(() => g.poly(this.dome(-r * 0.05, r * 0.52, r * 1.28, r * 1.08)));
    rim(() => g.circle(r * 1.14, r * 0.36, r * 0.5));
    rim(() => g.ellipse(-r * 0.05, r * 0.6, r * 1.2, r * 0.2));
  }

  /** Wash the face green (grossed out) or red (hot), over the head. */
  private drawTint(g: Graphics, tint: BugFace['tint'], spot: FacePlacement['tint']): void {
    if (!tint || !spot) return;
    const t = TINTS[tint];
    if (spot.circle) g.circle(spot.x, spot.y, spot.rx).fill(t);
    else g.ellipse(spot.x, spot.y, spot.rx, spot.ry).fill(t);
  }

  /** Points along the top of an ellipse, from angle PI to 2 PI. */
  private dome(cx: number, cy: number, rx: number, ry: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = Math.PI + (i / 28) * Math.PI;
      pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    return pts;
  }

  /** Skeet's long, slim body: a tapering capsule, tail at the left. */
  private striderBody(): number[] {
    const { r } = this;
    const pts: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      // Fatter at the front, thin at the tail.
      const thick = 0.19 + 0.09 * (x + 1) * 0.5;
      pts.push(-r * 0.25 + x * r * 0.92, -r * 0.2 + y * r * thick - x * r * 0.04);
    }
    return pts;
  }

  private drawStrider(): void {
    const { r, def } = this;
    const b = this.body;
    b.poly(this.striderBody()).fill(def.body).stroke(stroke(5));
    // Pale underside and a blue sheen stripe along the back.
    b.moveTo(-r * 1.0, -r * 0.12)
      .quadraticCurveTo(-r * 0.2, r * 0.02, r * 0.55, -r * 0.1)
      .stroke({ width: r * 0.1, color: def.belly, cap: 'round' });
    b.moveTo(-r * 1.02, -r * 0.24)
      .quadraticCurveTo(-r * 0.3, -r * 0.48, r * 0.5, -r * 0.34)
      .stroke({ width: r * 0.1, color: def.accent, alpha: 0.85, cap: 'round' });
    b.moveTo(-r * 0.6, -r * 0.34)
      .quadraticCurveTo(-r * 0.2, -r * 0.44, r * 0.2, -r * 0.4)
      .stroke({ width: r * 0.04, color: 0xffffff, alpha: 0.7, cap: 'round' });
    // Head, slightly lighter, perched at the front.
    b.circle(r * 0.88, -r * 0.3, r * 0.3)
      .fill(lighten(def.body, 0.18))
      .stroke(stroke(5));
    b.circle(r * 0.78, -r * 0.44, r * 0.08).fill({ color: 0xffffff, alpha: 0.4 });
  }

  /** Skeet's legs, from the rig: long legs splayed wide, short front legs, dimples when skating. */
  private drawStriderLegs(pose: BugPose, frame: BugFrame): void {
    const { r, def } = this;
    for (const { hip, knee, foot, far } of legJoints(this.bones, pose, frame)) {
      const g = far ? this.legsBack : this.legsFront;
      const color = far ? darken(def.body, 0.25) : OUTLINE;
      g.moveTo(hip.x, hip.y)
        .quadraticCurveTo(knee.x, knee.y - r * 0.1, knee.x, knee.y)
        .lineTo(foot.x, foot.y)
        .stroke({ width: far ? 4 : 5.5, color, alpha: far ? 0.8 : 1, cap: 'round', join: 'round' });
      g.ellipse(foot.x, foot.y, r * 0.12, r * 0.045).fill({ color, alpha: far ? 0.8 : 1 });
      if (frame.skate) {
        // A dimple in the water under each foot.
        g.ellipse(foot.x, foot.y + 3, r * 0.3, r * 0.07).stroke({
          width: 2.5,
          color: 0xffffff,
          alpha: 0.8,
        });
      }
    }
  }

  /** Boing's long body: a tapering capsule, tail at the left, a touch higher at the front. */
  private hopperBody(): number[] {
    const { r } = this;
    const pts: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      // Thicker at the front, pointed tail.
      const thick = 0.28 + 0.14 * (x + 1) * 0.5;
      pts.push(-r * 0.3 + x * r * 1.05, r * 0.18 + y * r * thick - x * r * 0.08);
    }
    return pts;
  }

  private drawGrasshopper(): void {
    const { r, def } = this;
    const b = this.body;
    // Body with a yellow belly and three segment lines.
    b.poly(this.hopperBody()).fill(def.body).stroke(stroke());
    b.moveTo(-r * 1.2, r * 0.36)
      .quadraticCurveTo(-r * 0.4, r * 0.62, r * 0.55, r * 0.34)
      .stroke({ width: r * 0.16, color: def.belly, cap: 'round' });
    for (const k of [-0.95, -0.65, -0.35]) {
      b.moveTo(r * k, r * 0.0)
        .quadraticCurveTo(r * (k + 0.07), r * 0.2, r * k, r * 0.44)
        .stroke({ width: 3.5, color: darken(def.body, 0.3), cap: 'round' });
    }
    // A folded wing along the back.
    b.moveTo(-r * 1.15, -r * 0.08)
      .quadraticCurveTo(-r * 0.6, -r * 0.46, r * 0.25, -r * 0.2)
      .quadraticCurveTo(-r * 0.45, -r * 0.08, -r * 1.15, -r * 0.08)
      .fill(def.accent)
      .stroke(stroke(4.5));
    b.moveTo(-r * 0.9, -r * 0.14)
      .quadraticCurveTo(-r * 0.4, -r * 0.3, r * 0.1, -r * 0.2)
      .stroke({ width: 2.5, color: lighten(def.accent, 0.35), alpha: 0.8, cap: 'round' });
    // A big round head with a wide grin, lighter lime.
    b.ellipse(r * 0.78, -r * 0.18, r * 0.5, r * 0.46)
      .fill(lighten(def.body, 0.12))
      .stroke(stroke());
    b.moveTo(r * 0.5, -r * 0.5)
      .quadraticCurveTo(r * 0.72, -r * 0.62, r * 0.96, -r * 0.54)
      .stroke({ width: r * 0.08, color: 0xffffff, alpha: 0.55, cap: 'round' });
  }

  /** Boing's legs, from the rig: little stepping front legs and the big hinged hind legs. */
  private drawHopperLegs(pose: BugPose, frame: BugFrame): void {
    const { r, def } = this;
    for (const { hip, knee, foot, far, part } of legJoints(this.bones, pose, frame)) {
      const g = far ? this.legsBack : this.legsFront;
      if (part === 'leg') {
        g.moveTo(hip.x, hip.y)
          .lineTo(knee.x, knee.y)
          .lineTo(foot.x, foot.y)
          .stroke({ width: 5, color: OUTLINE, cap: 'round', join: 'round', alpha: far ? 0.75 : 1 });
        continue;
      }
      const color = far ? darken(def.body, 0.25) : def.body;
      // Thigh: a drumstick shape.
      const dx = knee.x - hip.x;
      const dy = knee.y - hip.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const w0 = r * 0.2;
      const w1 = r * 0.08;
      g.poly([
        hip.x + nx * w0,
        hip.y + ny * w0,
        knee.x + nx * w1,
        knee.y + ny * w1,
        knee.x - nx * w1,
        knee.y - ny * w1,
        hip.x - nx * w0,
        hip.y - ny * w0,
      ])
        .fill(color)
        .stroke(stroke(far ? 3.5 : 4.5));
      if (!far)
        g.moveTo(hip.x + dx * 0.25, hip.y + dy * 0.25)
          .lineTo(hip.x + dx * 0.75, hip.y + dy * 0.75)
          .stroke({ width: 2.5, color: darken(def.body, 0.3), cap: 'round' });
      g.moveTo(knee.x, knee.y)
        .lineTo(foot.x, foot.y)
        .stroke({ width: 5, color: OUTLINE, cap: 'round', alpha: far ? 0.75 : 1 });
      g.moveTo(foot.x, foot.y)
        .lineTo(foot.x + r * 0.22, foot.y)
        .stroke({ width: 5, color: OUTLINE, cap: 'round', alpha: far ? 0.75 : 1 });
    }
  }

  private drawLadybug(): void {
    const { r, def } = this;
    const b = this.body;
    // Dark underside.
    b.ellipse(-r * 0.1, r * 0.42, r * 0.95, r * 0.34)
      .fill(def.belly)
      .stroke(stroke());
    // Head: a round dark head at the front, drawn under the shell's edge.
    b.circle(r * 0.8, r * 0.12, r * 0.55)
      .fill(0x3a2a40)
      .stroke(stroke());
    // The shell lives on its own layer so it can open for flying. Pivot at the hinge.
    const { x: hingeX, y: hingeY } = this.bones.hinge!;
    const s = this.shell;
    s.pivot.set(hingeX, hingeY);
    s.position.set(hingeX, hingeY);
    s.poly(this.dome(-r * 0.15, r * 0.34, r * 1.02, r * 1.14))
      .fill(def.body)
      .stroke(stroke());
    // Lighter top, darker rim, for a bit of roundness.
    s.poly(this.dome(-r * 0.2, r * 0.2, r * 0.8, r * 0.92)).fill({
      color: lighten(def.body, 0.12),
      alpha: 0.6,
    });
    const spots: [number, number, number][] = [
      [-0.55, -0.38, 0.2],
      [-0.08, -0.6, 0.16],
      [0.3, -0.22, 0.15],
      [-0.78, 0.08, 0.14],
      [-0.25, 0.06, 0.17],
      [0.48, -0.55, 0.09],
      [-0.95, -0.28, 0.09],
    ];
    for (const [x, y, rad] of spots) s.circle(r * x, r * y, r * rad).fill(def.accent);
    // Shine.
    s.moveTo(-r * 0.78, -r * 0.3)
      .quadraticCurveTo(-r * 0.62, -r * 0.7, -r * 0.2, -r * 0.8)
      .stroke({ width: r * 0.13, color: 0xffffff, alpha: 0.75, cap: 'round' });
    s.circle(r * 0.05, -r * 0.84, r * 0.05).fill({ color: 0xffffff, alpha: 0.75 });
  }

  /**
   * Flick: a small dark beetle with a red-orange cap and a big glowing
   * tail. Built like Dot (her legs, feelers, and face), with wing covers
   * that open for flying.
   */
  private drawFirefly(): void {
    const { r, def } = this;
    const b = this.body;
    // The tail lantern sits behind the body; it glows at night (the light is drawn by the weather view).
    b.ellipse(-r * 0.95, r * 0.28, r * 0.5, r * 0.38)
      .fill(def.accent)
      .stroke(stroke());
    b.ellipse(-r * 1.0, r * 0.22, r * 0.3, r * 0.2).fill({ color: 0xf8ffd0, alpha: 0.9 });
    for (let k = 0; k < 2; k++)
      b.moveTo(-r * (0.72 + k * 0.2), r * 0.0)
        .quadraticCurveTo(-r * (0.78 + k * 0.2), r * 0.3, -r * (0.72 + k * 0.2), r * 0.6)
        .stroke({ width: 3, color: 0x9bc43a, alpha: 0.8, cap: 'round' });
    // Underside and head.
    b.ellipse(-r * 0.05, r * 0.44, r * 0.85, r * 0.3)
      .fill(0x3a3050)
      .stroke(stroke());
    b.circle(r * 0.8, r * 0.12, r * 0.52)
      .fill(0x3a2a40)
      .stroke(stroke());
    // The red-orange cap over the head.
    b.moveTo(r * 0.32, r * 0.02)
      .bezierCurveTo(r * 0.36, -r * 0.5, r * 0.98, -r * 0.62, r * 1.22, -r * 0.18)
      .quadraticCurveTo(r * 0.8, -r * 0.16, r * 0.32, r * 0.02)
      .closePath()
      .fill(def.belly)
      .stroke(stroke(4));
    b.ellipse(r * 0.7, -r * 0.32, r * 0.16, r * 0.06).fill({ color: 0xffffff, alpha: 0.5 });
    // Wing covers on their own layer, hinged at the front, like Dot's.
    const { x: hingeX, y: hingeY } = this.bones.hinge!;
    const s = this.shell;
    s.pivot.set(hingeX, hingeY);
    s.position.set(hingeX, hingeY);
    s.poly(this.dome(-r * 0.2, r * 0.36, r * 0.86, r * 0.98))
      .fill(def.body)
      .stroke(stroke());
    s.poly(this.dome(-r * 0.22, r * 0.2, r * 0.66, r * 0.78)).fill({
      color: lighten(def.body, 0.16),
      alpha: 0.7,
    });
    // A pale seam and edge, and a shine.
    s.moveTo(-r * 0.2, -r * 0.6)
      .lineTo(-r * 0.2, r * 0.3)
      .stroke({ width: 3, color: 0x8a7fa8, alpha: 0.6 });
    s.moveTo(-r * 0.7, -r * 0.3)
      .quadraticCurveTo(-r * 0.55, -r * 0.62, -r * 0.2, -r * 0.7)
      .stroke({ width: r * 0.12, color: 0xffffff, alpha: 0.45, cap: 'round' });
  }

  private drawPillbug(): void {
    const { r, def } = this;
    const b = this.body;
    // Tail prongs.
    b.moveTo(-r * 1.2, r * 0.55)
      .lineTo(-r * 1.5, r * 0.7)
      .stroke(stroke(7));
    b.ellipse(-r * 0.05, r * 0.6, r * 1.2, r * 0.2)
      .fill(def.belly)
      .stroke(stroke());
    const cx = -r * 0.05;
    const cy = r * 0.52;
    const rx = r * 1.28;
    const ry = r * 1.08;
    b.poly(this.dome(cx, cy, rx, ry))
      .fill(def.body)
      .stroke(stroke());
    // Seven plates: alternating tints, with dark seams.
    for (let i = 0; i < 7; i++) {
      const x0 = cx - rx + ((i + 0.5) / 7) * rx * 2;
      if (i % 2 === 1) {
        const w = (rx * 2) / 7;
        const pts: number[] = [];
        for (let k = 0; k <= 8; k++) {
          const x = x0 - w / 2 + (k / 8) * w;
          const tt = (x - cx) / rx;
          pts.push(x, cy - ry * Math.sqrt(Math.max(0, 1 - tt * tt)) + 3);
        }
        pts.push(x0 + w / 2, cy - 2, x0 - w / 2, cy - 2);
        b.poly(pts).fill({ color: lighten(def.body, 0.1), alpha: 0.9 });
      }
      if (i > 0) {
        const xs = cx - rx + (i / 7) * rx * 2;
        const ts = (xs - cx) / rx;
        const ys = cy - ry * Math.sqrt(Math.max(0, 1 - ts * ts));
        b.moveTo(xs, ys + 2)
          .quadraticCurveTo(xs + r * 0.1, (ys + cy) / 2, xs + r * 0.02, cy - 1)
          .stroke(stroke(3.5, def.accent));
      }
    }
    b.poly(this.dome(cx, cy, rx, ry)).stroke(stroke());
    // A round, pale face poking out in front of the first plate.
    b.circle(r * 1.14, r * 0.36, r * 0.5)
      .fill(lighten(def.body, 0.35))
      .stroke(stroke());
    // Shine along the back.
    b.moveTo(-r * 0.75, -r * 0.3)
      .quadraticCurveTo(-r * 0.2, -r * 0.62, r * 0.35, -r * 0.42)
      .stroke({ width: r * 0.1, color: 0xffffff, alpha: 0.45, cap: 'round' });
  }

  private snailShell(g: Graphics, x: number, y: number, rad: number): void {
    const { def } = this;
    g.circle(x, y, rad).fill(def.accent).stroke(stroke());
    g.circle(x - rad * 0.08, y - rad * 0.1, rad * 0.78).fill({
      color: lighten(def.accent, 0.12),
      alpha: 0.7,
    });
    spiral(g, x + rad * 0.05, y + rad * 0.05, rad * 0.78, 2.1, 0.6).stroke({
      width: Math.max(4, rad * 0.1),
      color: 0xffffff,
      cap: 'round',
      join: 'round',
    });
    g.moveTo(x - rad * 0.62, y - rad * 0.42)
      .quadraticCurveTo(x - rad * 0.35, y - rad * 0.78, x + rad * 0.05, y - rad * 0.82)
      .stroke({ width: rad * 0.12, color: 0xffffff, alpha: 0.6, cap: 'round' });
  }

  private drawSnail(): void {
    const { r, def } = this;
    const b = this.body;
    // One soft body: a long foot rising into a head at the front.
    b.moveTo(-r * 1.6, r * 0.93)
      .lineTo(r * 0.9, r * 1.0)
      .bezierCurveTo(r * 1.35, r * 1.0, r * 1.5, r * 0.6, r * 1.46, r * 0.12)
      .bezierCurveTo(r * 1.43, -r * 0.42, r * 0.98, -r * 0.62, r * 0.66, -r * 0.42)
      .bezierCurveTo(r * 0.42, -r * 0.25, r * 0.45, r * 0.2, r * 0.3, r * 0.5)
      .lineTo(-r * 1.0, r * 0.56)
      .bezierCurveTo(-r * 1.32, r * 0.6, -r * 1.52, r * 0.74, -r * 1.6, r * 0.93)
      .closePath()
      .fill(def.body)
      .stroke(stroke());
    // Paler belly edge along the sole.
    b.moveTo(-r * 1.35, r * 0.86)
      .lineTo(r * 0.95, r * 0.9)
      .stroke({ width: r * 0.1, color: lighten(def.body, 0.35), cap: 'round' });
    this.snailShell(this.shell, -r * 0.35, -r * 0.08, r * 0.86);
  }

  private drawSnailInShell(): void {
    const { r } = this;
    this.snailShell(this.shell, 0, 0, r * 0.98);
    // The opening, where two eyes peek out.
    this.shell
      .ellipse(r * 0.62, r * 0.35, r * 0.34, r * 0.3)
      .fill(OUTLINE)
      .stroke(stroke());
  }

  private drawBall(): void {
    const { r, def } = this;
    const g = this.ball;
    g.circle(0, 0, r).fill(def.body).stroke(stroke());
    // Plates wrapping around the ball.
    for (let i = -2; i <= 2; i++) {
      const off = i * r * 0.42;
      g.moveTo(off - r * 0.1, -Math.sqrt(Math.max(0, r * r - off * off)) + 3)
        .quadraticCurveTo(off + r * 0.35, 0, off - r * 0.1, Math.sqrt(Math.max(0, r * r - off * off)) - 3)
        .stroke(stroke(3.5, def.accent));
    }
    g.arc(0, 0, r * 0.72, Math.PI * 1.1, Math.PI * 1.45).stroke({
      width: r * 0.14,
      color: 0xffffff,
      alpha: 0.5,
      cap: 'round',
    });
    g.circle(0, 0, r).stroke(stroke());
  }

  // --- Per-frame art ----------------------------------------------------

  private drawLegs(pose: BugPose, frame: BugFrame): void {
    const { r, def } = this;
    this.legsBack.clear();
    this.legsFront.clear();
    if (def.art === 'strider') {
      this.drawStriderLegs(pose, frame);
      return;
    }
    if (def.art === 'grasshopper') {
      this.drawHopperLegs(pose, frame);
      return;
    }
    if (def.art === 'snail') {
      this.drawFootRipple(pose);
      return;
    }
    const pill = def.art === 'pillbug';
    for (const { hip, knee, foot, far } of legJoints(this.bones, pose, frame)) {
      const g = far ? this.legsBack : this.legsFront;
      const color = far ? darken(OUTLINE, 0) : OUTLINE;
      const width = pill ? 4.5 : 6;
      g.moveTo(hip.x, hip.y)
        .lineTo(knee.x, knee.y)
        .lineTo(foot.x, foot.y)
        .stroke({ width, color, cap: 'round', join: 'round', alpha: far ? 0.75 : 1 });
      if (!pill) g.circle(foot.x + r * 0.03, foot.y - 1, r * 0.08).fill(color);
    }
  }

  private drawFootRipple(pose: BugPose): void {
    if (this.form === 'in_shell') return;
    footRipple(this.legsFront, this.r, this.def.body, pose);
  }

  private drawAntennae(frame: BugFrame): void {
    const { r, def } = this;
    const g = this.antennae.clear();
    for (const { kind, pts } of antennaPaths(this.bones, frame, this.springs, this.form ?? 'normal')) {
      const [b, c, t] = pts as [Pt, Pt, Pt];
      if (BEETLES.has(def.art)) {
        g.moveTo(b.x, b.y)
          .quadraticCurveTo(c.x, c.y, t.x, t.y)
          .stroke({ width: 5, color: OUTLINE, cap: 'round' });
        g.circle(t.x, t.y, r * 0.11).fill(OUTLINE);
      } else if (def.art === 'strider') {
        g.moveTo(b.x, b.y)
          .quadraticCurveTo(c.x, c.y, t.x, t.y)
          .stroke({ width: 4, color: OUTLINE, cap: 'round' });
      } else if (kind === 'cubic') {
        const tip = pts[3]!;
        g.moveTo(b.x, b.y)
          .bezierCurveTo(c.x, c.y, t.x, t.y, tip.x, tip.y)
          .stroke({ width: 4, color: OUTLINE, cap: 'round' });
      } else if (kind === 'jointed') {
        g.moveTo(b.x, b.y)
          .lineTo(c.x, c.y)
          .lineTo(t.x, t.y)
          .stroke({ width: 4.5, color: darken(def.body, 0.4), cap: 'round', join: 'round' });
      } else {
        // Snail: thick eye stalks, an outline with the body color inside.
        g.moveTo(b.x, b.y)
          .quadraticCurveTo(c.x, c.y, t.x, t.y)
          .stroke({ width: r * 0.2, color: OUTLINE, cap: 'round' });
        g.moveTo(b.x, b.y)
          .quadraticCurveTo(c.x, c.y, t.x, t.y)
          .stroke({ width: r * 0.2 - 8, color: def.body, cap: 'round' });
      }
    }
  }

  private drawFace(frame: BugFrame): void {
    const g = this.faceG.clear();
    // Pupils look in screen space; flip x into the rig's space.
    const look = { x: frame.look.x * frame.facing, y: frame.look.y };
    const open = frame.pose.eyeOpen;
    const spot = facePlacement(this.bones, this.def, frame, this.springs, this.form ?? 'normal');
    if (!spot) return;
    this.drawTint(g, frame.face.tint, spot.tint);
    for (const e of spot.eyes) drawEye(g, e.x, e.y, e.r, e.shape, look, open, e.lid, frame.time, e.line);
    const c = spot.cheek;
    if (c) g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
    const m = spot.mouth;
    if (m) drawMouth(g, m.x, m.y, m.s, m.shape, frame.time, m.color, m.line);
  }

  private drawWings(frame: BugFrame): void {
    const g = this.wings.clear();
    const w = wingState(this.bones, frame, this.form ?? 'normal');
    this.shell.rotation = w.shellAngle;
    for (const wing of w.wings)
      g.ellipse(wing.x, wing.y, wing.rx, wing.ry)
        .fill({ color: 0xffffff, alpha: 0.7 })
        .stroke({ width: 3, color: OUTLINE, alpha: 0.6 });
  }

  /** Steam and dizzy stars; `crown` (rig space) is where they circle, for painted species. */
  protected drawStars(frame: BugFrame, crown?: { x: number; y: number }): void {
    const g = this.fx.clear();
    const { r } = this;
    if (frame.face.steam) {
      // Two puffs of steam rising off an annoyed head.
      for (let i = 0; i < 2; i++) {
        const u = (frame.time * 0.9 + i * 0.5) % 1;
        const x = crown
          ? frame.facing * (crown.x + (i - 0.5) * r * 0.5) + Math.sin(u * 8 + i) * 4
          : frame.facing * r * (0.5 + i * 0.5) + Math.sin(u * 8 + i) * 4;
        const y = crown ? crown.y + r * 0.25 - u * r * 0.9 : -r * 1.1 - u * r * 0.9;
        const pr = r * (0.12 + u * 0.14);
        g.circle(x, y, pr)
          .fill({ color: 0xffffff, alpha: 0.9 * (1 - u) })
          .stroke({ width: 2.5, color: OUTLINE, alpha: 0.35 * (1 - u) });
      }
    }
    if (frame.stars <= 0) return;
    const cy = crown ? crown.y : -r * 1.35;
    const cx = crown ? crown.x * frame.facing : 0;
    for (let i = 0; i < frame.stars; i++) {
      const a = frame.time * 4.2 + (i * Math.PI * 2) / frame.stars;
      const depth = Math.sin(a);
      const x = cx + Math.cos(a) * r * 1.25;
      const y = cy + depth * r * 0.3;
      const size = Math.max(12, r * 0.24) * (1 + depth * 0.2);
      g.star(x, y, 5, size, size * 0.48, a * 0.5)
        .fill(STAR)
        .stroke(stroke(4));
    }
  }

  update(frame: BugFrame): void {
    if (this.painter) {
      this.updatePainted(frame, this.painter);
      return;
    }
    const { r } = this;
    this.setForm(frame.face.form);
    const { pose } = frame;

    // Antennae react to acceleration (in rig space: flip x by facing).
    const dt = Math.max(1e-3, frame.dt);
    const ax = ((frame.vx - this.lastV.x) / dt) * frame.facing;
    const ay = (frame.vy - this.lastV.y) / dt;
    this.lastV = { x: frame.vx, y: frame.vy };
    for (const s of this.springs)
      s.update(Math.max(-60, Math.min(60, ax)), Math.max(-60, Math.min(60, ay)), frame.dt);

    this.stretchA.rotation = frame.stretchAngle;
    this.stretchB.scale.set(frame.stretch, 1 / frame.stretch);
    this.stretchC.rotation = -frame.stretchAngle;
    this.spinLayer.rotation = frame.spin;
    this.ball.rotation = frame.angle;
    this.ball.scale.set(frame.squashX, frame.squashY);

    const move = frame.move ?? { bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 };
    this.squash.scale.set(pose.sx * frame.squashX * move.sx, pose.sy * frame.squashY * move.sy);
    this.squash.rotation = pose.tilt + move.tilt * frame.facing;
    this.rig.position.set(0, -r + pose.bob + move.bob);
    this.rig.scale.x =
      frame.facing * (Math.abs(move.flip) < 0.08 ? Math.sign(move.flip || 1) * 0.08 : move.flip);
    this.rim.visible = (frame.rim ?? 0) > 0;
    this.rim.alpha = frame.rim ?? 0;

    // Breathing and bobbing are the containers' transforms above; the
    // Graphics are redrawn only when what they show changes.
    const form = `${this.form}`;
    const art = this.def.art;
    const c = this.cache;
    if (c.legs.stale(legsKey(frame, form))) this.drawLegs(pose, frame);
    if (c.wings.stale(wingsKey(frame, form))) this.drawWings(frame);
    if (c.antennae.stale(antennaeKey(frame, form, art, r, this.springs))) this.drawAntennae(frame);
    if (c.face.stale(faceKey(frame, form, art, r, this.springs))) this.drawFace(frame);
    if (c.fx.stale(fxKey(frame))) this.drawStars(frame);
    this.drawPaint(frame, frame.paint, () => `${this.form}`);
    this.updateWear(frame);
  }

  // --- Worn things (M11) ------------------------------------------------

  /** What the bug wears now: new things get sprites (from `make`), things gone lose theirs. */
  setWorn(list: readonly WornLook[], make: (def: ItemDef) => ItemSprite): void {
    const ids = new Set(list.map((w) => w.id));
    for (const [id, w] of this.worn)
      if (!ids.has(id)) {
        w.sprite.destroy({ children: true });
        this.worn.delete(id);
        this.wornAt.delete(id);
      }
    for (const w of list) {
      if (this.worn.has(w.id)) continue;
      const sprite = make(w.def);
      sprite.label = `worn ${w.def.id}`;
      this.worn.set(w.id, { def: w.def, sprite });
    }
  }

  /** Item IDs worn, for tests. */
  wornIds(): number[] {
    return [...this.worn.keys()];
  }

  /** Each worn thing's sprite (tests, the test hook). */
  wornSprites(): { id: number; def: ItemDef; sprite: ItemSprite }[] {
    return [...this.worn].map(([id, w]) => ({ id, def: w.def, sprite: w.sprite }));
  }

  /** Boing's trick: the hat hops off his head and lands back on it. */
  flipHat(time: number): void {
    this.flipAt = time;
  }

  /** Where a code-drawn bug's head is (its rig's head), and the top of a ball or a shell. */
  private codeSpot(frame: BugFrame): WearSpot {
    const { r } = this;
    const form = frame.face.form;
    const h = this.bones.head;
    const [bx, by] = this.def.wear.back;
    const ball = form === 'curled';
    const shell = form === 'in_shell';
    return {
      head: ball || shell || !h ? null : { x: h.x, y: h.y, rx: h.r, ry: h.r },
      top: ball ? { x: 0, y: -r } : shell ? { x: -r * 0.1, y: -r * 1.05 } : this.bones.crown,
      ball,
      back: { x: bx * PIXELS_PER_METER, y: by * PIXELS_PER_METER },
      feet: { x: 0, y: this.foot },
    };
  }

  /** Put each worn thing where it goes this frame: on the head, the face, the back, or the feet. */
  protected updateWear(frame: BugFrame): void {
    if (this.worn.size === 0) {
      this.wearBack.visible = this.wearFront.visible = false;
      return;
    }
    const spot = this.painter ? this.painter.wearSpot(frame) : this.codeSpot(frame);
    // Curled into a ball, the rig is hidden: worn things perch on the ball, upright.
    const holder = spot.ball ? this.stretchC : this.rig;
    if (this.wearFront.parent !== holder) {
      holder.addChild(this.wearFront);
      if (spot.ball) holder.addChildAt(this.wearBack, holder.getChildIndex(this.wearFront));
      else this.rig.addChildAt(this.wearBack, this.rig.getChildIndex(this.legsBack) + 1);
    }
    this.wearBack.visible = this.wearFront.visible = true;
    // A flipped hat goes up and comes down again.
    let lift = 0;
    let turn = 0;
    if (this.flipAt !== null) {
      const t = (frame.time - this.flipAt) / FLIP_SECONDS;
      if (t >= 1 || t < 0) this.flipAt = null;
      else {
        lift = Math.sin(t * Math.PI) * this.r * 1.6;
        turn = t * Math.PI * 2;
      }
    }
    for (const [id, w] of this.worn) {
      const p = placeWorn(this.def, w.def, spot);
      const s = w.sprite;
      const layer = p.behind ? this.wearBack : this.wearFront;
      if (s.parent !== layer) layer.addChild(s);
      const flips = w.def.wear === 'head' && lift > 0;
      s.position.set(p.x, p.y - (flips ? lift : 0));
      s.rotation = p.rotation + (flips ? turn : 0);
      s.scale.set(p.scale);
      s.visible = !p.hidden;
      s.update(frame.dt);
      this.wornAt.set(id, { x: p.x, y: p.y, scale: p.scale, behind: p.behind, hidden: p.hidden });
    }
  }

  /** A waiting bug's sign of life this frame, 0 to 1 (Moose's flailing, Barty's fiddling, Twig's tells). */
  get life(): number {
    return this.painter?.life ?? 0;
  }

  /** A bug drawn by its species painter: the same rig, with the painter filling in the art. */
  private updatePainted(frame: BugFrame, p: SpeciesPainter): void {
    const key = p.key(frame);
    if (key !== this.staticKey) {
      this.staticKey = key;
      for (const g of [this.rim, this.body, this.shell, this.wings, this.ball]) g.clear();
      this.shell.rotation = 0;
      this.shell.pivot.set(0, 0);
      this.shell.position.set(0, 0);
      p.drawStatic(frame);
    }
    this.form = frame.face.form;
    const curled = p.curls && frame.face.form === 'curled';
    this.spinLayer.visible = !curled;
    this.ball.visible = curled;

    const dt = Math.max(1e-3, frame.dt);
    const ax = ((frame.vx - this.lastV.x) / dt) * frame.facing;
    const ay = (frame.vy - this.lastV.y) / dt;
    this.lastV = { x: frame.vx, y: frame.vy };
    for (const s of this.springs)
      s.update(Math.max(-60, Math.min(60, ax)), Math.max(-60, Math.min(60, ay)), frame.dt);

    this.stretchA.rotation = frame.stretchAngle;
    this.stretchB.scale.set(frame.stretch, 1 / frame.stretch);
    this.stretchC.rotation = -frame.stretchAngle;
    this.spinLayer.rotation = frame.spin;
    this.ball.rotation = frame.angle;
    this.ball.scale.set(frame.squashX, frame.squashY);

    // Calm bugs redraw at `CALM_HZ` or when their face, look, or feelers change.
    const calm = paintedKey(frame, this.springs);
    if (this.cache.painted.stale(calm === null ? null : `${key}|${calm}`)) {
      this.legsBack.clear();
      this.legsFront.clear();
      this.antennae.clear();
      this.faceG.clear();
      this.lastAdjust = p.update(frame, this.springs);
    }
    const adj = this.lastAdjust;
    const rest = { bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 };
    const move = adj.still ? rest : (frame.move ?? rest);
    const pose = adj.still ? { sx: 1, sy: 1, tilt: 0, bob: 0 } : frame.pose;
    this.squash.scale.set(pose.sx * frame.squashX * move.sx, pose.sy * frame.squashY * move.sy);
    this.squash.rotation = pose.tilt + (move.tilt + adj.tilt) * frame.facing;
    this.rig.position.set(0, -this.foot + pose.bob + move.bob + adj.bob);
    this.rig.scale.x =
      frame.facing * (Math.abs(move.flip) < 0.08 ? Math.sign(move.flip || 1) * 0.08 : move.flip);
    this.rim.visible = (frame.rim ?? 0) > 0;
    this.rim.alpha = frame.rim ?? 0;
    if (this.cache.fx.stale(fxKey(frame))) this.drawStars(frame, p.crown(frame));
    this.updateWear(frame);
    if (p.paintsItself(frame)) this.drawPaint(frame, [], () => '');
    else
      this.drawPaint(
        frame,
        frame.paint,
        () => key,
        (g) => p.mask(g, frame),
        p.paintBox(frame),
      );
  }

  /**
   * Paint patches on the lower half of the body, clipped to its silhouette.
   * Redrawn only when the paint or the body's shape changes.
   */
  private drawPaint(
    frame: BugFrame,
    ids: readonly string[] | undefined,
    shapeKey: () => string,
    mask: (g: Graphics) => void = (g) => this.paintSilhouette(g),
    box: Box | null = this.paintBox(),
  ): void {
    const colors = paintColors(ids);
    const on = colors.length > 0 && box !== null && this.form !== 'curled';
    if (!on) {
      if (this.paintG.visible) {
        this.paintG.visible = false;
        this.paintMask.visible = false;
        this.paintG.mask = null;
        this.paintKey = '';
      }
      return;
    }
    const key = `${colors.join(',')}|${shapeKey()}|${frame.facing}`;
    if (key === this.paintKey) return;
    this.paintKey = key;
    this.paintG.clear();
    this.paintMask.clear();
    mask(this.paintMask);
    // Shrink the mask a few pixels toward its middle, so the body's outline stays on top of the paint.
    const bounds = this.paintMask.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    this.paintMask.pivot.set(cx, cy);
    this.paintMask.position.set(cx, cy);
    this.paintMask.scale.set(
      Math.max(0.5, 1 - 7 / Math.max(1, bounds.width)),
      Math.max(0.5, 1 - 7 / Math.max(1, bounds.height)),
    );
    drawPaintPatches(this.paintG, colors, box, Math.round(this.r) + this.def.id.length);
    this.paintMask.visible = true;
    this.paintG.visible = true;
    this.paintG.mask = this.paintMask;
  }

  /** The body (not the head) of the first five bugs, filled, to clip paint to. */
  private paintSilhouette(g: Graphics): void {
    const { r } = this;
    switch (this.def.art) {
      case 'ladybug':
        g.poly(this.dome(-r * 0.15, r * 0.34, r * 1.02, r * 1.14)).fill(0xffffff);
        g.ellipse(-r * 0.1, r * 0.42, r * 0.95, r * 0.34).fill(0xffffff);
        return;
      case 'firefly':
        g.poly(this.dome(-r * 0.2, r * 0.36, r * 0.86, r * 0.98)).fill(0xffffff);
        g.ellipse(-r * 0.05, r * 0.44, r * 0.85, r * 0.3).fill(0xffffff);
        g.ellipse(-r * 0.95, r * 0.28, r * 0.5, r * 0.38).fill(0xffffff);
        return;
      case 'pillbug':
        g.poly(this.dome(-r * 0.05, r * 0.52, r * 1.28, r * 1.08)).fill(0xffffff);
        g.ellipse(-r * 0.05, r * 0.6, r * 1.2, r * 0.2).fill(0xffffff);
        return;
      case 'snail':
        if (this.form === 'in_shell') {
          g.circle(0, 0, r * 0.98).fill(0xffffff);
          return;
        }
        g.circle(-r * 0.35, -r * 0.08, r * 0.86).fill(0xffffff);
        g.moveTo(-r * 1.6, r * 0.93)
          .lineTo(r * 0.9, r * 1.0)
          .bezierCurveTo(r * 1.35, r * 1.0, r * 1.5, r * 0.6, r * 1.46, r * 0.12)
          .lineTo(r * 0.3, r * 0.5)
          .lineTo(-r * 1.0, r * 0.56)
          .bezierCurveTo(-r * 1.32, r * 0.6, -r * 1.52, r * 0.74, -r * 1.6, r * 0.93)
          .closePath()
          .fill(0xffffff);
        return;
      case 'strider':
        g.poly(this.striderBody()).fill(0xffffff);
        return;
      case 'grasshopper':
        g.poly(this.hopperBody()).fill(0xffffff);
        return;
      default:
        return;
    }
  }

  /** The lower half of the first five bugs' bodies, where paint goes. */
  private paintBox(): Box | null {
    return paintBox(this.bones, this.form ?? 'normal');
  }
}

/** Glorp's foot ripples: waves travelling along the sole while it slides. */
export function footRipple(g: Graphics, r: number, body: number, pose: BugPose): void {
  const moving = pose.stride;
  for (let i = 0; i < 4; i++) {
    const t = (((pose.legPhase * 0.25 + i / 4) % 1) + 1) % 1;
    const x = -r * 1.3 + t * r * 2.2;
    const a = moving * 0.9;
    if (a < 0.05) continue;
    g.moveTo(x - r * 0.14, r * 0.97)
      .quadraticCurveTo(x, r * (0.97 - 0.12 * a), x + r * 0.14, r * 0.97)
      .stroke({ width: 3, color: darken(body, 0.35), alpha: a, cap: 'round' });
  }
}

/** A frame for a bug shown outside the world (menus): happy, facing right. */
export function standaloneFrame(
  mode: BugMode,
  time: number,
  dt: number,
  phase: number,
  art: BugDef['art'] = 'ladybug',
  morph?: 'cocoon' | 'butterfly',
): BugFrame {
  const needs = { need_hunger: 90, need_fun: 90, need_energy: 90, need_social: 80, need_clean: 90 };
  return {
    pose: bugPose({ mode, vx: mode === 'st_wander' ? 1 : 0, vy: 0, time, phase, walkSpeed: 1 }),
    face: { ...bugFace({ art, mode, needs, time, likesFlinging: true, morph }), form: 'normal' },
    ...(morph ? { morph } : {}),
    facing: 1,
    time,
    dt,
    look: { x: 0.35 * Math.sin(time * 0.7 + phase), y: 0.2 },
    vx: 0,
    vy: 0,
    angle: 0,
    squashX: 1,
    squashY: 1,
    stretchAngle: 0,
    stretch: 1,
    spin: 0,
    stars: 0,
  };
}
