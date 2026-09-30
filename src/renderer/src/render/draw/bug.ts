import { Container, Graphics } from 'pixi.js';
import type { BugDef } from '../../../../game/data/types';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BugPose } from '../bugPose';
import { CHEEK, EYE_WHITE, OUTLINE, stroke } from '../palette';

/**
 * A procedurally drawn bug. Static parts are drawn once; legs, eyes, and
 * antennae are redrawn per frame from the pose. The root sits at the body
 * center; squash and stretch pivot on the feet so the bug stays grounded.
 */
export class BugSprite extends Container {
  readonly r: number;
  private readonly squashLayer = new Container();
  private readonly flip = new Container();
  private readonly legs = new Graphics();
  private readonly body = new Graphics();
  private readonly antennae = new Graphics();
  private readonly eyes = new Graphics();
  private readonly stars = new Graphics();

  constructor(readonly def: BugDef) {
    super();
    this.r = def.radius * PIXELS_PER_METER;
    const r = this.r;
    // Pivot at the feet: the squash layer sits at the bottom of the body.
    this.squashLayer.position.set(0, r);
    this.flip.position.set(0, -r);
    this.squashLayer.addChild(this.flip);
    this.flip.addChild(this.legs, this.antennae, this.body, this.eyes);
    this.addChild(this.squashLayer, this.stars);
    this.drawBody();
  }

  private drawBody(): void {
    const { r, def } = this;
    const g = this.body;
    g.ellipse(0, 0, r * 1.12, r)
      .fill(def.body)
      .stroke(stroke());
    // Belly on the lower half.
    g.ellipse(0, r * 0.45, r * 0.8, r * 0.42).fill(def.belly);
    if (def.spots !== null) {
      g.circle(-r * 0.45, -r * 0.45, r * 0.18).fill(def.spots);
      g.circle(-r * 0.05, -r * 0.62, r * 0.13).fill(def.spots);
      g.circle(-r * 0.7, -r * 0.05, r * 0.12).fill(def.spots);
    }
    // Shine.
    g.ellipse(-r * 0.35, -r * 0.62, r * 0.22, r * 0.1).fill({ color: 0xffffff, alpha: 0.55 });
    // Cheek and smile toward the front (+x).
    g.circle(r * 0.72, r * 0.2, r * 0.13).fill({ color: CHEEK, alpha: 0.8 });
    g.moveTo(r * 0.45, r * 0.3)
      .quadraticCurveTo(r * 0.62, r * 0.48, r * 0.85, r * 0.28)
      .stroke(stroke(4));
  }

  setPose(pose: BugPose, facing: 1 | -1, time: number): void {
    const { r } = this;
    this.squashLayer.scale.set(pose.sx, pose.sy);
    this.squashLayer.rotation = pose.tilt;
    this.squashLayer.y = r + pose.bob;
    this.flip.scale.x = facing;

    // Legs: three pairs of little sticks with round feet.
    const legs = this.legs.clear();
    for (let i = 0; i < 3; i++) {
      const baseX = (i - 1) * r * 0.55;
      const swing = Math.sin(pose.legPhase + i * 2.1) * r * 0.22;
      const footX = baseX + swing;
      const footY = r * 1.12 - Math.max(0, Math.cos(pose.legPhase + i * 2.1)) * r * 0.1;
      legs
        .moveTo(baseX, r * 0.6)
        .lineTo(footX, footY)
        .stroke(stroke(7));
      legs.circle(footX, footY, r * 0.1).fill(OUTLINE);
    }

    // Antennae wobble a little.
    const ant = this.antennae.clear();
    if (this.def.antenna !== 'none') {
      const wob = Math.sin(time * 5 + pose.legPhase * 0.2) * r * 0.08;
      for (const side of [0, 1]) {
        const bx = r * (0.25 + side * 0.3);
        const by = -r * 0.8;
        const tx = bx + r * 0.35 + wob;
        const ty = -r * (1.55 - side * 0.1);
        if (this.def.antenna === 'curly') {
          ant.moveTo(bx, by).bezierCurveTo(bx - r * 0.2, by - r * 0.5, tx + r * 0.3, ty - r * 0.1, tx, ty);
        } else {
          ant.moveTo(bx, by).lineTo(tx, ty);
        }
        ant.stroke(stroke(5));
        ant
          .circle(tx, ty, r * 0.12)
          .fill(this.def.body)
          .stroke(stroke(4));
      }
    }

    // Eyes: big whites, pupils looking forward; swirls when dizzy.
    const eyes = this.eyes.clear();
    for (const [ex, ey, er] of [
      [r * 0.28, -r * 0.2, r * 0.3],
      [r * 0.72, -r * 0.25, r * 0.26],
    ] as const) {
      const open = Math.max(0.08, pose.eyeOpen);
      eyes
        .ellipse(ex, ey, er, er * open)
        .fill(EYE_WHITE)
        .stroke(stroke(4));
      if (open < 0.5) continue;
      if (pose.dizzy) {
        const a = time * 10;
        eyes
          .moveTo(ex, ey)
          .arc(ex, ey, er * 0.55, a, a + Math.PI * 1.5)
          .stroke(stroke(3));
      } else {
        eyes.circle(ex + er * 0.3, ey + er * 0.1, er * 0.48).fill(OUTLINE);
        eyes.circle(ex + er * 0.42, ey - er * 0.08, er * 0.16).fill(EYE_WHITE);
      }
    }

    // Dizzy stars orbit the head.
    const stars = this.stars.clear();
    if (pose.dizzy) {
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + (i * Math.PI * 2) / 3;
        stars
          .star(Math.cos(a) * r * 0.9, -r * 1.3 + Math.sin(a) * r * 0.25, 5, r * 0.16, r * 0.07)
          .fill(0xffd23f)
          .stroke(stroke(3));
      }
    }
  }
}
