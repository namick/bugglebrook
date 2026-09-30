import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BugDef } from '../../../../game/data/types';
import type { BugMode } from '../../../../game/core/entities';
import type { BugFace } from '../bugFace';
import { bugFace } from '../bugFace';
import type { BugPose } from '../bugPose';
import { bugPose } from '../bugPose';
import { CHEEK, OUTLINE, STAR, darken, lighten, stroke } from '../palette';
import type { MovePose } from '../reactions';
import type { Look } from './face';
import { drawEye, drawMouth, spiral } from './face';

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
}

const TINTS = { green: { color: 0x8fd14f, alpha: 0.6 }, red: { color: 0xff3b2f, alpha: 0.45 } } as const;

interface Hip {
  x: number;
  y: number;
  far: boolean;
}

/** Wobbly antenna tip: a damped spring kicked by the body's acceleration. */
class AntennaSpring {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;

  update(ax: number, ay: number, dt: number): void {
    const k = 160;
    const d = 9;
    const h = Math.min(dt, 1 / 30);
    this.vx += (-k * this.x - d * this.vx - ax * 2.2) * h;
    this.vy += (-k * this.y - d * this.vy - ay * 2.2) * h;
    this.x = Math.max(-18, Math.min(18, this.x + this.vx * h));
    this.y = Math.max(-18, Math.min(18, this.y + this.vy * h));
  }
}

/**
 * A procedurally drawn bug. Static parts are drawn once per body form;
 * legs, face, antennae, and effects are redrawn every frame. The root sits
 * at the collider center; squash pivots on the feet.
 */
export class BugSprite extends Container {
  readonly r: number;
  private readonly stretchA = new Container();
  private readonly stretchB = new Container();
  private readonly stretchC = new Container();
  private readonly spinLayer = new Container();
  private readonly squash = new Container();
  private readonly rig = new Container();
  private readonly rim = new Graphics();
  private readonly legsBack = new Graphics();
  private readonly wings = new Graphics();
  private readonly body = new Graphics();
  private readonly shell = new Graphics();
  private readonly legsFront = new Graphics();
  private readonly faceG = new Graphics();
  private readonly antennae = new Graphics();
  private readonly ball = new Graphics();
  private readonly fx = new Graphics();
  private readonly springs = [new AntennaSpring(), new AntennaSpring()];
  private lastV = { x: 0, y: 0 };
  private form: BugFace['form'] | null = null;

  constructor(readonly def: BugDef) {
    super();
    this.r = def.radius * PIXELS_PER_METER;
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
      this.antennae,
      this.faceG,
    );
    this.squash.position.set(0, this.r);
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
    }
    this.drawRim(form);
  }

  /** A white silhouette stroke behind the body: the hover rim light. */
  private drawRim(form: BugFace['form']): void {
    const { r } = this;
    const g = this.rim.clear();
    const white = { width: 16, color: 0xffffff, join: 'round' as const, cap: 'round' as const };
    if (form === 'curled') return;
    if (this.def.art === 'snail') {
      if (form === 'in_shell') {
        g.circle(0, 0, r * 0.98).stroke(white);
        return;
      }
      g.circle(-r * 0.35, -r * 0.08, r * 0.86).stroke(white);
      g.moveTo(-r * 1.6, r * 0.93)
        .lineTo(r * 0.9, r * 1.0)
        .bezierCurveTo(r * 1.35, r * 1.0, r * 1.5, r * 0.6, r * 1.46, r * 0.12)
        .bezierCurveTo(r * 1.43, -r * 0.42, r * 0.98, -r * 0.62, r * 0.66, -r * 0.42)
        .stroke(white);
      return;
    }
    if (this.def.art === 'strider') {
      g.poly(this.striderBody()).stroke(white);
      g.circle(r * 0.88, -r * 0.3, r * 0.3).stroke(white);
      return;
    }
    if (this.def.art === 'ladybug') {
      g.poly(this.dome(-r * 0.15, r * 0.34, r * 1.02, r * 1.14)).stroke(white);
      g.circle(r * 0.8, r * 0.12, r * 0.55).stroke(white);
      g.ellipse(-r * 0.1, r * 0.42, r * 0.95, r * 0.34).stroke(white);
      return;
    }
    g.poly(this.dome(-r * 0.05, r * 0.52, r * 1.28, r * 1.08)).stroke(white);
    g.circle(r * 1.14, r * 0.36, r * 0.5).stroke(white);
    g.ellipse(-r * 0.05, r * 0.6, r * 1.2, r * 0.2).stroke(white);
  }

  /** Wash the face green (grossed out) or red (hot), over the head. */
  private drawTint(g: Graphics, tint: BugFace['tint']): void {
    if (!tint || this.form === 'curled' || this.form === 'in_shell') return;
    const { r } = this;
    const t = TINTS[tint];
    if (this.def.art === 'ladybug') g.circle(r * 0.8, r * 0.12, r * 0.52).fill(t);
    else if (this.def.art === 'strider') g.circle(r * 0.88, -r * 0.3, r * 0.28).fill(t);
    else if (this.def.art === 'pillbug') g.circle(r * 1.14, r * 0.36, r * 0.47).fill(t);
    else g.ellipse(r * 1.08, r * 0.2, r * 0.36, r * 0.42).fill(t);
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

  /**
   * Skeet's legs: two short front legs, and the long middle and hind legs
   * splayed wide. They row when he skates, walk stiffly on land, spread
   * like a parachute when he is flung, and dangle when held.
   */
  private drawStriderLegs(pose: BugPose, frame: BugFrame): void {
    const { r, def } = this;
    const back = this.legsBack;
    const front = this.legsFront;
    const leg = (
      g: Graphics,
      hip: [number, number],
      knee: [number, number],
      foot: [number, number],
      far: boolean,
    ): void => {
      const color = far ? darken(def.body, 0.25) : OUTLINE;
      g.moveTo(hip[0], hip[1])
        .quadraticCurveTo(knee[0], knee[1] - r * 0.1, knee[0], knee[1])
        .lineTo(foot[0], foot[1])
        .stroke({ width: far ? 4 : 5.5, color, alpha: far ? 0.8 : 1, cap: 'round', join: 'round' });
      g.ellipse(foot[0], foot[1], r * 0.12, r * 0.045).fill({ color, alpha: far ? 0.8 : 1 });
      if (frame.skate) {
        // A dimple in the water under each foot.
        g.ellipse(foot[0], foot[1] + 3, r * 0.3, r * 0.07).stroke({
          width: 2.5,
          color: 0xffffff,
          alpha: 0.8,
        });
      }
    };
    const ph = pose.legPhase;
    for (const far of [true, false]) {
      const g = far ? back : front;
      const off = far ? r * 0.14 : 0;
      const side = far ? Math.PI : 0;
      if (frame.chute) {
        // Legs spread wide and high, floating down.
        const flutter = Math.sin(frame.time * 8 + side) * r * 0.08;
        leg(g, [off, -r * 0.1], [r * 0.9 + off, -r * 0.95], [r * 2.1 + off, r * 0.05 + flutter], far);
        leg(
          g,
          [-r * 0.3 + off, -r * 0.1],
          [-r * 1.0 + off, -r * 0.85],
          [-r * 2.2 + off, r * 0.1 - flutter],
          far,
        );
        leg(g, [r * 0.62, -r * 0.14], [r * 1.05, -r * 0.35], [r * 1.35, -r * 0.55], far);
        continue;
      }
      if (pose.flail) {
        // Dangling from the hand: loose legs swinging.
        const w = Math.sin(ph + side) * r * 0.25;
        leg(g, [off, -r * 0.1], [r * 0.5 + off, r * 0.3], [r * 0.9 + off + w, r * 1.1], far);
        leg(g, [-r * 0.3 + off, -r * 0.1], [-r * 0.8 + off, r * 0.3], [-r * 1.1 + off - w, r * 1.15], far);
        leg(g, [r * 0.62, -r * 0.14], [r * 0.9, r * 0.2], [r * 1.0 + w * 0.5, r * 0.6], far);
        continue;
      }
      // Rowing on water, or a stiff, careful walk on land.
      const row = frame.skate ? Math.sin(ph + side) * pose.stride : 0;
      const lift = frame.skate ? 0 : Math.max(0, Math.sin(ph + side)) * pose.stride * r * 0.35;
      leg(
        g,
        [off, -r * 0.1],
        [r * 0.55 + off + row * r * 0.15, -r * 0.78 - lift * 0.5],
        [r * 1.85 + off + row * r * 0.3, r - lift],
        far,
      );
      const lift2 = frame.skate ? 0 : Math.max(0, Math.sin(ph + side + Math.PI)) * pose.stride * r * 0.35;
      leg(
        g,
        [-r * 0.3 + off, -r * 0.1],
        [-r * 0.88 + off - row * r * 0.1, -r * 0.62 - lift2 * 0.5],
        [-r * 2.1 + off - row * r * 0.2, r - lift2],
        far,
      );
      leg(g, [r * 0.62, -r * 0.14], [r * 0.98, r * 0.15], [r * 1.22, r * 0.34], far);
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
    const hingeX = r * 0.45;
    const hingeY = -r * 0.1;
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

  private hips(): Hip[] {
    const { r } = this;
    if (this.def.art === 'ladybug') {
      const near = [-0.5, -0.05, 0.38].map((x) => ({ x: r * x, y: r * 0.5, far: false }));
      const far = [-0.36, 0.1, 0.52].map((x) => ({ x: r * x, y: r * 0.45, far: true }));
      return [...far, ...near];
    }
    if (this.def.art === 'pillbug') {
      const near = Array.from({ length: 7 }, (_, i) => ({
        x: r * (-0.95 + i * 0.3),
        y: r * 0.66,
        far: false,
      }));
      const far = near.map((h) => ({ ...h, x: h.x + r * 0.12, y: h.y - r * 0.04, far: true }));
      return [...far, ...near];
    }
    return [];
  }

  private drawLegs(pose: BugPose, frame: BugFrame): void {
    const { r, def } = this;
    const back = this.legsBack.clear();
    const front = this.legsFront.clear();
    if (def.art === 'strider') {
      this.drawStriderLegs(pose, frame);
      return;
    }
    if (def.art === 'snail') {
      this.drawFootRipple(pose);
      return;
    }
    const pill = def.art === 'pillbug';
    const hips = this.hips();
    const n = hips.length / 2;
    hips.forEach((hip, idx) => {
      const i = idx % n;
      const phase = pose.legPhase + (pill ? i * 0.9 : i * 2.1) + (hip.far ? Math.PI : 0);
      let fx: number;
      let fy: number;
      if (pose.flail) {
        fx = hip.x + Math.sin(phase * 1.1) * r * 0.26;
        fy = r * 0.82 + Math.cos(phase) * r * 0.18;
      } else {
        fx = hip.x + Math.sin(phase) * pose.stride * r * (pill ? 0.12 : 0.22);
        fy = r - Math.max(0, Math.cos(phase)) * pose.stride * r * 0.14;
      }
      const frontLeg = hip.x > 0;
      const kx = (hip.x + fx) / 2 + (frontLeg ? 1 : -1) * r * (pill ? 0.06 : 0.14);
      const ky = hip.y + (fy - hip.y) * 0.3 - r * (pill ? 0.02 : 0.08);
      const g = hip.far ? back : front;
      const color = hip.far ? darken(OUTLINE, 0) : OUTLINE;
      const width = pill ? 4.5 : 6;
      g.moveTo(hip.x, hip.y)
        .lineTo(kx, ky)
        .lineTo(fx, fy)
        .stroke({ width, color, cap: 'round', join: 'round', alpha: hip.far ? 0.75 : 1 });
      if (!pill) g.circle(fx + r * 0.03, fy - 1, r * 0.08).fill(color);
    });
  }

  private drawFootRipple(pose: BugPose): void {
    const { r, def } = this;
    const g = this.legsFront;
    if (this.form === 'in_shell') return;
    // Waves travelling along the sole while it slides.
    const moving = pose.stride;
    for (let i = 0; i < 4; i++) {
      const t = (((pose.legPhase * 0.25 + i / 4) % 1) + 1) % 1;
      const x = -r * 1.3 + t * r * 2.2;
      const a = moving * 0.9;
      if (a < 0.05) continue;
      g.moveTo(x - r * 0.14, r * 0.97)
        .quadraticCurveTo(x, r * (0.97 - 0.12 * a), x + r * 0.14, r * 0.97)
        .stroke({ width: 3, color: darken(def.body, 0.35), alpha: a, cap: 'round' });
    }
  }

  private drawAntennae(frame: BugFrame): void {
    const { r, def } = this;
    const g = this.antennae.clear();
    if (this.form === 'in_shell' || this.form === 'curled') return;
    const [a, b] = this.springs;
    const sway = Math.sin(frame.time * 2.1 + this.r) * r * 0.04;
    if (def.art === 'ladybug') {
      const bases: [number, number][] = [
        [r * 0.72, -r * 0.3],
        [r * 0.95, -r * 0.28],
      ];
      bases.forEach(([bx, by], i) => {
        const s = i === 0 ? a! : b!;
        const tx = bx + r * (0.02 + i * 0.28) + s.x * frame.facing + sway;
        const ty = by - r * 0.62 + s.y;
        g.moveTo(bx, by)
          .quadraticCurveTo(bx + r * 0.05, by - r * 0.45, tx, ty)
          .stroke({ width: 5, color: OUTLINE, cap: 'round' });
        g.circle(tx, ty, r * 0.11).fill(OUTLINE);
      });
      return;
    }
    if (def.art === 'strider') {
      // Two long feelers sweeping forward.
      const bases: [number, number][] = [
        [r * 0.95, -r * 0.52],
        [r * 1.08, -r * 0.48],
      ];
      bases.forEach(([bx, by], i) => {
        const s = i === 0 ? a! : b!;
        const tx = bx + r * (0.75 + i * 0.12) + s.x * frame.facing + sway;
        const ty = by - r * (0.55 - i * 0.1) + s.y;
        g.moveTo(bx, by)
          .quadraticCurveTo(bx + r * 0.25, by - r * 0.55, tx, ty)
          .stroke({ width: 4, color: OUTLINE, cap: 'round' });
      });
      return;
    }
    if (def.art === 'pillbug') {
      const bases: [number, number][] = [
        [r * 1.12, r * 0.02],
        [r * 1.3, r * 0.06],
      ];
      bases.forEach(([bx, by], i) => {
        const s = i === 0 ? a! : b!;
        const ex = bx + r * 0.22;
        const ey = by - r * 0.32 + s.y * 0.4;
        const tx = ex + r * (0.28 + i * 0.05) + s.x * frame.facing * 0.6 + sway;
        const ty = ey + r * 0.08 + s.y;
        g.moveTo(bx, by)
          .lineTo(ex, ey)
          .lineTo(tx, ty)
          .stroke({ width: 4.5, color: darken(def.body, 0.4), cap: 'round', join: 'round' });
      });
      return;
    }
    // Snail: eye stalks, which droop when sleepy or hungry and perk up otherwise.
    const droop = frame.face.eyes === 'sleepy' || frame.face.mouth === 'frown' ? 0.35 : 0;
    const perk = frame.face.eyes === 'wide' ? -0.15 : 0;
    const stalks: [number, number, number][] = [
      [r * 0.82, -r * 0.42, -0.25],
      [r * 1.12, -r * 0.4, 0.25],
    ];
    stalks.forEach(([bx, by, lean], i) => {
      const s = i === 0 ? a! : b!;
      const ang = -Math.PI / 2 + lean + droop + perk + Math.sin(frame.time * 1.6 + i) * 0.06;
      const len = r * 0.95;
      const tx = bx + Math.cos(ang) * len + s.x * frame.facing * 0.7;
      const ty = by + Math.sin(ang) * len + s.y * 0.7;
      g.moveTo(bx, by)
        .quadraticCurveTo(bx + (tx - bx) * 0.2, by + (ty - by) * 0.6, tx, ty)
        .stroke({ width: r * 0.2, color: OUTLINE, cap: 'round' });
      g.moveTo(bx, by)
        .quadraticCurveTo(bx + (tx - bx) * 0.2, by + (ty - by) * 0.6, tx, ty)
        .stroke({ width: r * 0.2 - 8, color: def.body, cap: 'round' });
    });
  }

  private drawFace(frame: BugFrame): void {
    const { r, def } = this;
    const g = this.faceG.clear();
    const f = frame.face;
    // Pupils look in screen space; flip x into the rig's space.
    const look = { x: frame.look.x * frame.facing, y: frame.look.y };
    const open = frame.pose.eyeOpen;
    if (this.form === 'curled') return;
    this.drawTint(g, f.tint);
    if (this.form === 'in_shell') {
      drawEye(
        g,
        r * 0.5,
        r * 0.33,
        r * 0.14,
        f.eyes === 'spiral' ? 'spiral' : 'open',
        look,
        open,
        OUTLINE,
        frame.time,
        3,
      );
      drawEye(
        g,
        r * 0.76,
        r * 0.33,
        r * 0.14,
        f.eyes === 'spiral' ? 'spiral' : 'open',
        look,
        open,
        OUTLINE,
        frame.time,
        3,
      );
      return;
    }
    if (def.art === 'ladybug') {
      drawEye(g, r * 0.6, -r * 0.02, r * 0.25, f.eyes, look, open, 0x3a2a40, frame.time, 4);
      drawEye(g, r * 0.98, r * 0.0, r * 0.3, f.eyes, look, open, 0x3a2a40, frame.time, 4);
      if (f.blush || f.mouth === 'grin')
        g.circle(r * 1.2, r * 0.3, r * 0.1).fill({ color: CHEEK, alpha: 0.8 });
      drawMouth(g, r * 0.97, r * 0.38, r * 0.34, f.mouth, frame.time, 0xffb3c6, 4);
      return;
    }
    if (def.art === 'strider') {
      const lid = lighten(def.body, 0.18);
      drawEye(g, r * 0.78, -r * 0.4, r * 0.17, f.eyes, look, open, lid, frame.time, 3.5);
      drawEye(g, r * 1.04, -r * 0.38, r * 0.19, f.eyes, look, open, lid, frame.time, 3.5);
      g.circle(r * 1.1, -r * 0.14, r * 0.07).fill({ color: CHEEK, alpha: f.blush ? 0.9 : 0.5 });
      drawMouth(g, r * 1.0, -r * 0.15, r * 0.26, f.mouth, frame.time, OUTLINE, 3.5);
      return;
    }
    if (def.art === 'pillbug') {
      drawEye(g, r * 0.98, r * 0.24, r * 0.19, f.eyes, look, open, lighten(def.body, 0.35), frame.time, 3.5);
      drawEye(g, r * 1.3, r * 0.24, r * 0.22, f.eyes, look, open, lighten(def.body, 0.35), frame.time, 4);
      g.circle(r * 1.44, r * 0.5, r * 0.09).fill({ color: CHEEK, alpha: f.blush ? 0.9 : 0.6 });
      drawMouth(g, r * 1.2, r * 0.6, r * 0.34, f.mouth, frame.time, OUTLINE, 3.5);
      return;
    }
    // Snail: eyes at the ends of the stalks, mouth on the head.
    const droop = f.eyes === 'sleepy' || f.mouth === 'frown' ? 0.35 : 0;
    const perk = f.eyes === 'wide' ? -0.15 : 0;
    const [a, b] = this.springs;
    const tips: [number, number, number][] = [
      [r * 0.82, -r * 0.42, -0.25],
      [r * 1.12, -r * 0.4, 0.25],
    ];
    tips.forEach(([bx, by, lean], i) => {
      const s = i === 0 ? a! : b!;
      const ang = -Math.PI / 2 + lean + droop + perk + Math.sin(frame.time * 1.6 + i) * 0.06;
      const len = r * 0.95;
      const tx = bx + Math.cos(ang) * len + s.x * frame.facing * 0.7;
      const ty = by + Math.sin(ang) * len + s.y * 0.7;
      drawEye(g, tx, ty, r * (i === 0 ? 0.22 : 0.25), f.eyes, look, open, def.body, frame.time, 4);
    });
    g.circle(r * 1.3, r * 0.2, r * 0.1).fill({ color: CHEEK, alpha: f.blush ? 0.9 : 0.6 });
    drawMouth(g, r * 1.2, r * 0.36, r * 0.34, f.mouth, frame.time, OUTLINE, 4);
  }

  private drawWings(frame: BugFrame): void {
    const g = this.wings.clear();
    const { r } = this;
    if (this.form !== 'flying') {
      this.shell.rotation = 0;
      return;
    }
    this.shell.rotation = -0.55;
    const flap = Math.sin(frame.time * 48);
    for (const [ox, k] of [
      [-0.1, 1],
      [0.1, 0.8],
    ] as const) {
      const h = r * (0.55 + 0.35 * flap * k);
      g.ellipse(r * ox - r * 0.2, -r * 0.15 - h * 0.6, r * 0.32, h)
        .fill({ color: 0xffffff, alpha: 0.7 })
        .stroke({ width: 3, color: OUTLINE, alpha: 0.6 });
    }
  }

  private drawStars(frame: BugFrame): void {
    const g = this.fx.clear();
    const { r } = this;
    if (frame.face.steam) {
      // Two puffs of steam rising off an annoyed head.
      for (let i = 0; i < 2; i++) {
        const u = (frame.time * 0.9 + i * 0.5) % 1;
        const x = frame.facing * r * (0.5 + i * 0.5) + Math.sin(u * 8 + i) * 4;
        const y = -r * 1.1 - u * r * 0.9;
        const pr = r * (0.12 + u * 0.14);
        g.circle(x, y, pr)
          .fill({ color: 0xffffff, alpha: 0.9 * (1 - u) })
          .stroke({ width: 2.5, color: OUTLINE, alpha: 0.35 * (1 - u) });
      }
    }
    if (frame.stars <= 0) return;
    const cy = -r * 1.35;
    for (let i = 0; i < frame.stars; i++) {
      const a = frame.time * 4.2 + (i * Math.PI * 2) / frame.stars;
      const depth = Math.sin(a);
      const x = Math.cos(a) * r * 1.25;
      const y = cy + depth * r * 0.3;
      const size = Math.max(12, r * 0.24) * (1 + depth * 0.2);
      g.star(x, y, 5, size, size * 0.48, a * 0.5)
        .fill(STAR)
        .stroke(stroke(4));
    }
  }

  update(frame: BugFrame): void {
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

    this.drawLegs(pose, frame);
    this.drawWings(frame);
    this.drawAntennae(frame);
    this.drawFace(frame);
    this.drawStars(frame);
  }
}

/** A frame for a bug shown outside the world (menus): happy, facing right. */
export function standaloneFrame(mode: BugMode, time: number, dt: number, phase: number): BugFrame {
  const needs = { need_hunger: 90, need_fun: 90, need_energy: 90 };
  return {
    pose: bugPose({ mode, vx: mode === 'st_wander' ? 1 : 0, vy: 0, time, phase, walkSpeed: 1 }),
    face: { ...bugFace({ art: 'ladybug', mode, needs, time, likesFlinging: true }), form: 'normal' },
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
