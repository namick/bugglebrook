import { Container, Graphics } from 'pixi.js';
import { stroke } from '../render/palette';

/**
 * The hand's five poses (game design doc, section 2), and a sixth: `stir`,
 * a fist round a ladle handle with a swirl, over a cauldron with something
 * in it (and while stirring), so the hand says "go round".
 */
export type CursorPose = 'open' | 'hover_grab' | 'hover_poke' | 'grab' | 'pan' | 'stir';

export interface CursorState {
  /** What the pointer controller is doing. */
  mode: 'none' | 'hold' | 'pan' | 'dial' | 'lever' | 'stir' | 'seq';
  /** Actually holding something (a wriggling bug can get away). */
  holding: boolean;
  /** Over a grabbable item or bug. */
  overGrabbable: boolean;
  /** Over a button or other clickable thing. */
  overButton: boolean;
  /** Over a clickable fixture, like the hose tap. */
  overFixture?: boolean;
  /** Over the cauldron's rim with something in the brew: it wants stirring. */
  overStir?: boolean;
}

/** Pick the hand pose. Pure. */
export function cursorPose(s: CursorState): CursorPose {
  if (s.mode === 'hold') return s.holding ? 'grab' : 'open';
  if (s.mode === 'stir') return 'stir';
  // Turning the sundial's rim, pulling the bench's lever: a firm grip.
  if (s.mode === 'dial' || s.mode === 'lever') return 'grab';
  if (s.mode === 'pan') return 'pan';
  // Painting the sequencer's caps: the pointing finger.
  if (s.mode === 'seq') return 'hover_poke';
  if (s.overStir && !s.overButton) return 'stir';
  if (s.overButton || s.overFixture) return 'hover_poke';
  if (s.overGrabbable) return 'hover_grab';
  return 'open';
}

const GLOVE = 0xffd9b8;
const GLOVE_SHADE = 0xf2b98f;
const LINE = 5;
/** The hand is drawn at about 70 px and shown a little smaller. */
const HAND_SCALE = 0.8;

/** A finger: a rounded bar from (x, y) going up `len` pixels, tilted by `angle`. */
function finger(g: Graphics, x: number, y: number, len: number, w: number, angle = 0): void {
  const dx = Math.sin(angle) * len;
  const dy = -Math.cos(angle) * len;
  g.moveTo(x, y)
    .lineTo(x + dx, y + dy)
    .stroke({ width: w + LINE * 2, color: 0x2b1d2e, cap: 'round' });
  g.moveTo(x, y)
    .lineTo(x + dx, y + dy)
    .stroke({ width: w, color: GLOVE, cap: 'round' });
}

/** Draws each pose once; the cursor swaps between them. Hotspot is (0, 0). */
function drawPose(pose: CursorPose): Graphics {
  const g = new Graphics();
  switch (pose) {
    case 'open':
    case 'hover_grab': {
      // Fingers spread (open) or curled halfway (hover_grab).
      const curl = pose === 'hover_grab' ? 0.55 : 1;
      const tips: [number, number, number][] = [
        [10, 30, -0.28],
        [22, 34, -0.08],
        [34, 32, 0.12],
        [44, 26, 0.32],
      ];
      for (const [x, len, a] of tips) finger(g, x, 34, len * curl, 12, a);
      finger(g, 4, 50, 22, 13, -1.05);
      g.roundRect(0, 30, 50, 36, 16).fill(GLOVE).stroke(stroke(LINE));
      // Paint over the finger roots so the palm reads as one shape.
      g.roundRect(4, 32, 42, 18, 10).fill(GLOVE);
      if (pose === 'hover_grab')
        for (const x of [12, 24, 36])
          g.moveTo(x, 36).lineTo(x, 44).stroke({ width: 3, color: GLOVE_SHADE, cap: 'round' });
      g.moveTo(10, 58).lineTo(38, 58).stroke({ width: 3, color: GLOVE_SHADE, cap: 'round' });
      break;
    }
    case 'hover_poke': {
      // Pointing finger; the others tucked in.
      finger(g, 14, 30, 30, 12, 0);
      g.roundRect(4, 26, 46, 38, 16).fill(GLOVE).stroke(stroke(LINE));
      g.roundRect(8, 29, 12, 10, 5).fill(GLOVE);
      for (const x of [26, 36, 44]) g.circle(x, 30, 6).fill(GLOVE).stroke(stroke(3));
      g.roundRect(22, 30, 26, 10, 5).fill(GLOVE);
      g.moveTo(0, 50).quadraticCurveTo(10, 44, 20, 50).stroke({ width: 3, color: GLOVE_SHADE, cap: 'round' });
      break;
    }
    case 'grab': {
      // A closed fist with knuckles on top and the thumb across.
      g.roundRect(-24, -20, 48, 40, 16).fill(GLOVE).stroke(stroke(LINE));
      for (const x of [-15, -5, 5, 15]) g.circle(x, -18, 7).fill(GLOVE).stroke(stroke(3.5));
      g.roundRect(-22, -18, 44, 12, 6).fill(GLOVE);
      g.roundRect(-20, -2, 30, 12, 6).fill(GLOVE_SHADE).stroke(stroke(3.5));
      break;
    }
    case 'stir': {
      // A fist round a ladle handle, a swirl going round it.
      g.moveTo(-6, 14)
        .lineTo(-30, 52)
        .stroke({ width: 13 + LINE * 2, color: 0x2b1d2e, cap: 'round' });
      g.moveTo(-6, 14).lineTo(-30, 52).stroke({ width: 13, color: 0xc7d3e3, cap: 'round' });
      g.ellipse(-34, 58, 14, 8).fill(0xc7d3e3).stroke(stroke(3.5));
      g.roundRect(-22, -20, 44, 38, 15).fill(GLOVE).stroke(stroke(LINE));
      for (const x of [-13, -4, 5, 14]) g.circle(x, -18, 6.5).fill(GLOVE).stroke(stroke(3.5));
      g.roundRect(-20, -18, 40, 11, 6).fill(GLOVE);
      g.roundRect(-18, -2, 28, 11, 6).fill(GLOVE_SHADE).stroke(stroke(3.5));
      // The swirl: most of a squashed circle, thick and fading at its tail.
      const steps = 22;
      for (let k = 0; k < steps; k++) {
        const a0 = -0.4 + (k / steps) * Math.PI * 1.6;
        const a1 = -0.4 + ((k + 1) / steps) * Math.PI * 1.6;
        const p0 = { x: Math.cos(a0) * 40 - 8, y: Math.sin(a0) * 16 + 46 };
        const p1 = { x: Math.cos(a1) * 40 - 8, y: Math.sin(a1) * 16 + 46 };
        const u = k / steps;
        // An outlined motion line, so it reads over pale brews and bright skies alike.
        g.moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: 7 + u * 6, color: 0x2b1d2e, alpha: 0.3 + u * 0.5, cap: 'round' });
        g.moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: 3 + u * 4, color: 0xfff6c2, alpha: 0.5 + u * 0.5, cap: 'round' });
      }
      break;
    }
    case 'pan': {
      // A flat palm, fingers together.
      for (const [x, len] of [
        [-15, 30],
        [-5, 34],
        [5, 33],
        [15, 28],
      ] as const)
        finger(g, x, -8, len, 11, 0);
      finger(g, -22, 8, 20, 12, -1.1);
      g.roundRect(-22, -12, 44, 34, 14).fill(GLOVE).stroke(stroke(LINE));
      g.roundRect(-18, -12, 36, 14, 8).fill(GLOVE);
      break;
    }
  }
  return g;
}

/**
 * The on-screen hand. The system cursor is hidden; this follows the pointer
 * in logical pixels. hover_grab scales to 1.1 with a 120 ms ease.
 */
export class HandCursor extends Container {
  pose: CursorPose = 'open';
  private readonly poses: Record<CursorPose, Graphics>;
  private scaleNow = 1;
  private tilt = 0;
  private lastX = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.poses = {
      open: drawPose('open'),
      hover_grab: drawPose('hover_grab'),
      hover_poke: drawPose('hover_poke'),
      grab: drawPose('grab'),
      pan: drawPose('pan'),
      stir: drawPose('stir'),
    };
    // Open hands point with the index fingertip; fists and palms center on the pointer.
    for (const p of ['open', 'hover_grab', 'hover_poke'] as const) this.poses[p].position.set(-12, -4);
    // The fist pinches from above, so the held thing shows below it.
    this.poses.grab.position.set(0, -26);
    this.poses.stir.position.set(0, -20);
    for (const g of Object.values(this.poses)) this.addChild(g);
    this.setPose('open');
  }

  setPose(pose: CursorPose): void {
    this.pose = pose;
    for (const [name, g] of Object.entries(this.poses)) g.visible = name === pose;
  }

  /** Move to (x, y) in logical pixels and animate. */
  update(dt: number, x: number, y: number): void {
    // The fist is small and see-through so the face of whatever it holds stays readable.
    const target =
      this.pose === 'hover_grab' ? 1.1 : this.pose === 'grab' ? 0.75 : this.pose === 'stir' ? 1.05 : 1;
    this.poses.grab.alpha = 0.8;
    // Reaches the target in about 120 ms.
    this.scaleNow += (target - this.scaleNow) * Math.min(1, dt / 0.04);
    this.scale.set(this.scaleNow * HAND_SCALE);
    // The panning palm leans into the drag.
    const vx = dt > 0 ? (x - this.lastX) / dt : 0;
    const lean = this.pose === 'pan' ? Math.max(-0.35, Math.min(0.35, vx / 3000)) : 0;
    this.tilt += (lean - this.tilt) * Math.min(1, dt * 12);
    this.rotation = this.tilt;
    this.lastX = x;
    this.position.set(x, y);
  }
}
