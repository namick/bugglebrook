// Small values and helpers shared by `Sim` and the modules split out of it
// (sim*.ts), kept here so those modules never import sim.ts at run time.
import type { ShapeSpec } from './physics/physics';
import { TAG_IDS } from './systems/tags';

/** Bugs bounce a little (a curled-up Rollo bounces like a marble: `ROLLED_RESTITUTION` in sim.ts). */
export const BUG_RESTITUTION = 0.15;

/** A thrown thing can land in a mouth for this long after it leaves the hand. */
export const THROWN_TICKS = 90;

/** Every tag there is, for checking debug commands. */
export const TAG_SET: ReadonlySet<string> = new Set(TAG_IDS);

/** A heavy bug cannot be flung faster than 900 px/s. */
export const HEAVY_FLING = 9;

/** Half the width and height of a shape's bounds, turned by `angle`. */
export const halfExtents = (shape: ShapeSpec, angle: number): { w: number; h: number } => {
  if (shape.type === 'circle') return { w: shape.radius, h: shape.radius };
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return {
    w: (shape.width / 2) * c + (shape.height / 2) * s,
    h: (shape.width / 2) * s + (shape.height / 2) * c,
  };
};
