import { ColorMatrixFilter, Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../game/constants';
import type { ItemDef } from '../../../game/data/types';
import type { GhostFrame } from '../app/ghost';
import { solidMatrix } from '../journal/entryArt';
import { HandCursor } from '../ui/cursor';
import { ItemSprite } from './draw/item';
import { twinkle } from './fixtureArt';
import type { HintKey, HintLook } from './hints';

const PPM = PIXELS_PER_METER;
/** The ghost hand's pale, cool tint. */
const GHOST_TINT = 0xdde8ff;
/** The ghost's warm glow, and how far its light outline reaches, in pixels. */
const GHOST_GLOW = 0xfff1b8;
const RIM_PX = 4;

/** Where a hint glints, in world meters, and whether it needs drawn shake marks (its art does not wobble itself). */
export interface HintSpot {
  key: HintKey;
  x: number;
  y: number;
  /** Rough size of the thing, in meters: the glints sit round it. */
  size: number;
  /** Draw shake marks beside it (for art that does not wobble on its own). */
  marks: boolean;
}

/**
 * The world-side half of the hints: little twinkles round a thing that
 * hints, and cartoon shake marks beside things whose own art does not
 * wobble (the bench's lever). Drawn over the world, under the UI.
 */
export class HintMarks extends Container {
  private readonly g = new Graphics();

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.g);
  }

  update(cameraX: number, time: number, spots: readonly HintSpot[], hints: HintLook, reduced: boolean): void {
    this.x = -cameraX * PPM;
    const g = this.g.clear();
    for (const s of spots) {
      const glint = hints.glint(s.key);
      if (glint < 0.02) continue;
      const x = s.x * PPM;
      const y = s.y * PPM;
      const r = s.size * PPM;
      // Three twinkles that take turns round the thing.
      for (let k = 0; k < 3; k++) {
        const phase = (time * 1.6 + k / 3) % 1;
        const a = k * 2.1 + Math.floor(time * 1.6 + k / 3) * 1.3;
        const tw = Math.sin(phase * Math.PI) * glint;
        twinkle(g, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.55 - r * 0.2, 7 + 4 * tw, tw);
      }
      if (!s.marks) continue;
      const w = hints.wobble(s.key) * (reduced ? 0.4 : 1);
      if (Math.abs(w) < 0.05) continue;
      // Shake marks: two short arcs on each side, jumping with the wobble.
      for (const side of [-1, 1]) {
        const mx = x + side * (r * 0.75 + 10 + w * side * 8);
        for (const dy of [-12, 12]) {
          g.moveTo(mx, y + dy - 10)
            .quadraticCurveTo(mx + side * 7, y + dy, mx, y + dy + 10)
            .stroke({ width: 4, color: 0xfffbe0, alpha: Math.abs(w), cap: 'round' });
        }
      }
    }
  }
}

/**
 * The ghost hand: a pale, see-through copy of the player's hand that acts
 * out a gesture (`app/ghost.ts`), carrying a ghost of what it picked up.
 * In view pixels, above the UI so it can reach the pocket. Pure show: it
 * never touches the sim.
 */
export class GhostHand extends Container {
  private readonly hand = new HandCursor();
  /** Copies of the hand nudged out in eight directions, in white: a light outline around the ghost (P-15). */
  private readonly rim = Array.from({ length: 8 }, () => new HandCursor());
  /** A soft warm glow, so the ghost reads as a ghost and not as a second cursor, even against the ant hill. */
  private readonly halo = new Graphics();
  private carried: ItemSprite | null = null;
  private carriedDef: string | null = null;
  /** The last frame drawn, for the test hook. */
  frame: GhostFrame | null = null;

  constructor(private readonly itemDef: (defId: string) => ItemDef | undefined) {
    super();
    this.eventMode = 'none';
    this.hand.tint = GHOST_TINT;
    this.halo.circle(0, 0, 78).fill({ color: GHOST_GLOW, alpha: 0.14 });
    this.halo.circle(0, 0, 60).fill({ color: GHOST_GLOW, alpha: 0.2 });
    this.halo.circle(0, 0, 42).fill({ color: 0xffffff, alpha: 0.26 });
    // The copies drawn solid white: a light outline the size of RIM_PX.
    const rimLayer = new Container();
    rimLayer.addChild(...this.rim);
    const solid = new ColorMatrixFilter();
    solid.matrix = solidMatrix(0xffffff, 0) as typeof solid.matrix;
    rimLayer.filters = [solid];
    this.addChild(this.halo, rimLayer, this.hand);
    this.visible = false;
  }

  update(dt: number, frame: GhostFrame | null): void {
    this.frame = frame;
    if (!frame || frame.alpha <= 0.001) {
      this.visible = false;
      return;
    }
    this.visible = true;
    this.alpha = frame.alpha;
    if (this.hand.pose !== frame.pose) this.hand.setPose(frame.pose);
    this.hand.update(dt, frame.x, frame.y);
    // A size up from the real hand, so it is easy to see from across the screen.
    this.hand.scale.set(this.hand.scale.x * 1.3);
    this.rim.forEach((r, i) => {
      if (r.pose !== frame.pose) r.setPose(frame.pose);
      const a = (i / this.rim.length) * Math.PI * 2;
      r.update(dt, frame.x + Math.cos(a) * RIM_PX, frame.y + Math.sin(a) * RIM_PX);
      r.scale.copyFrom(this.hand.scale);
      r.rotation = this.hand.rotation;
    });
    const fist = frame.pose === 'grab';
    this.halo.position.set(frame.x + (fist ? 0 : 14), frame.y + (fist ? -20 : 18));
    this.halo.scale.set(1 + 0.06 * Math.sin(frame.progress * 40));
    if (frame.carry !== this.carriedDef) {
      this.carried?.destroy({ children: true });
      this.carried = null;
      this.carriedDef = frame.carry;
      const def = frame.carry ? this.itemDef(frame.carry) : undefined;
      if (def) {
        this.carried = new ItemSprite(def, 7);
        this.carried.tint = GHOST_TINT;
        this.addChildAt(this.carried, 0);
      }
    }
    if (this.carried) {
      this.carried.position.set(frame.x, frame.y + 6);
      this.carried.update(dt);
    }
  }
}
