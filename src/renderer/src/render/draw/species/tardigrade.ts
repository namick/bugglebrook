import type { Graphics } from 'pixi.js';
import { CHEEK, OUTLINE, darken, lighten, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import { drawMouth } from '../face';
import { BasePainter } from './base';
import type { Adjust, AntennaSpring, Box, Pt } from './common';
import { NO_ADJUST, RIM, eyePair, tintHead } from './common';
import { walkJoints } from '../../rig/bugRig';

/**
 * Wubbo the water bear (game design doc, section 4): a chubby, squishy,
 * translucent peach sausage on eight stubby legs with tiny claws, a round
 * tube mouth, and beady eyes, glowing softly from inside. Delighted by
 * everything.
 */
export class TardigradePainter extends BasePainter {
  /** The body: one soft bean, wider at the back, with the head end rounded. */
  private bean(g: Graphics): Graphics {
    const { r } = this;
    return g
      .moveTo(r * 0.95, r * 0.15)
      .bezierCurveTo(r * 1.05, -r * 0.45, r * 0.6, -r * 0.82, r * 0.05, -r * 0.82)
      .bezierCurveTo(-r * 0.7, -r * 0.84, -r * 1.25, -r * 0.5, -r * 1.22, r * 0.05)
      .bezierCurveTo(-r * 1.2, r * 0.5, -r * 0.8, r * 0.62, -r * 0.1, r * 0.6)
      .bezierCurveTo(r * 0.5, r * 0.6, r * 0.9, r * 0.52, r * 0.95, r * 0.15)
      .closePath();
  }

  private head: [number, number, number] = [0, 0, 0];

  drawStatic(_frame: BugFrame): void {
    const { r, def } = this;
    const b = this.L.body;
    this.head = [r * 0.62, -r * 0.08, r * 0.42];
    // The translucent body: a soft glow inside, then the shell.
    this.bean(b).fill({ color: def.body, alpha: 0.92 }).stroke(stroke());
    b.ellipse(-r * 0.15, -r * 0.1, r * 0.82, r * 0.46).fill({ color: lighten(def.body, 0.45), alpha: 0.55 });
    b.ellipse(-r * 0.25, -r * 0.05, r * 0.45, r * 0.24).fill({ color: 0xfff3ea, alpha: 0.5 });
    // Squishy segment creases.
    for (const x of [-0.75, -0.3, 0.15])
      b.moveTo(r * x, -r * 0.74 - (x === -0.3 ? r * 0.06 : 0))
        .quadraticCurveTo(r * (x + 0.12), -r * 0.1, r * x, r * 0.52)
        .stroke({ width: 3, color: darken(def.body, 0.18), alpha: 0.75, cap: 'round' });
    // Freckles of whatever he ate last, seen through his skin.
    for (const [x, y, rr] of [
      [-0.55, 0.1, 0.07],
      [-0.2, 0.25, 0.05],
      [-0.9, -0.15, 0.05],
    ] as const)
      b.circle(r * x, r * y, r * rr).fill({ color: 0x6b8f3a, alpha: 0.45 });
    // A shine along the back.
    b.moveTo(-r * 0.85, -r * 0.5)
      .quadraticCurveTo(-r * 0.3, -r * 0.82, r * 0.35, -r * 0.7)
      .stroke({ width: r * 0.1, color: 0xffffff, alpha: 0.6, cap: 'round' });
    // The tube mouth at the front: a round little snout.
    b.ellipse(r * 1.0, r * 0.16, r * 0.13, r * 0.16)
      .fill(lighten(def.body, 0.2))
      .stroke(stroke(3));
    // Hover rim.
    const g = this.L.rim;
    this.bean(g).stroke(RIM);
  }

  mask(g: Graphics): void {
    this.bean(g).fill(0xffffff);
  }

  paintBox(): Box {
    const { r } = this;
    return { x0: -r * 1.2, x1: r * 0.9, y0: -r * 0.8, y1: r * 0.55 };
  }

  override crown(): { x: number; y: number } {
    return { x: this.r * 0.3, y: -this.r * 1.0 };
  }

  update(frame: BugFrame, _springs: readonly AntennaSpring[]): Adjust {
    const { r, def } = this;
    const [hx, hy, hr] = this.head;
    // Four stubby legs a side, each with tiny claws.
    const hips: Pt[] = [
      [-r * 0.95, r * 0.48],
      [-r * 0.45, r * 0.56],
      [r * 0.05, r * 0.56],
      [r * 0.5, r * 0.5],
    ];
    // Stubby, squishy legs: fat peach stumps from hip to foot, with tiny claws.
    for (const leg of walkJoints(frame.pose, {
      r,
      hips,
      farShift: [r * 0.14, -r * 0.05],
      ground: r * 0.98,
    })) {
      const g = leg.far ? this.L.legsBack : this.L.legsFront;
      const color = leg.far ? darken(def.body, 0.15) : def.body;
      const [hx0, hy0] = leg.hip;
      const [fx, fy] = leg.foot;
      g.moveTo(hx0, hy0)
        .lineTo(fx, fy)
        .stroke({ width: r * 0.3, color: OUTLINE, cap: 'round' });
      g.moveTo(hx0, hy0)
        .lineTo(fx, fy)
        .stroke({ width: r * 0.3 - 6, color, cap: 'round' });
      for (const dx of [-0.07, 0, 0.07])
        g.moveTo(fx + r * dx, fy + r * 0.08)
          .lineTo(fx + r * dx + r * 0.04, fy + r * 0.15)
          .stroke({ width: 2, color: OUTLINE, cap: 'round' });
    }
    // Face: beady eyes, rosy cheeks, and a mouth that is nearly always laughing.
    const g = this.L.face;
    const f = frame.face;
    tintHead(g, f.tint, hx, hy, hr);
    const far: [number, number, number] = [hx - hr * 0.2, hy - hr * 0.35, hr * 0.2];
    const near: [number, number, number] = [hx + hr * 0.35, hy - hr * 0.3, hr * 0.24];
    eyePair(g, frame, far, near, lighten(def.body, 0.2), 3);
    g.circle(hx + hr * 0.15, hy + hr * 0.3, hr * 0.2).fill({ color: CHEEK, alpha: f.blush ? 0.95 : 0.7 });
    drawMouth(g, hx + hr * 0.55, hy + hr * 0.38, hr * 0.5, f.mouth, frame.time, OUTLINE, 3);
    return NO_ADJUST;
  }
}
