import type { ItemDef, ItemShape } from './types';

// Loose items are grown from the design doc's sizes so they read at a
// glance next to the bugs (post-M8 review, R05). The defs keep the sizes
// they were written with; `growItem` turns them into the size the world
// uses, for the collider and the art alike, and keeps their weight.

/** Small things (up to `GROW_FULL` m across) grow this much. */
export const GROW = 1.5;
/** Things up to this size grow by the full `GROW`... */
export const GROW_FULL = 0.4;
/** ...and the growth tapers off to nothing at this size. */
export const GROW_NONE = 0.7;
/** Every grown thing is at least this long (m): 40 px at 1080p. */
export const MIN_LOOSE = 0.4;
/** And at least this thick, so flat things (petals, toothpicks) have a little height... */
export const MIN_THICK = 0.12;
/** ...where flat means thinner than this. Sticks and twigs are thick enough already. */
export const FLAT = 0.1;

/** The longest side of a shape (m). */
export function shapeSpan(shape: ItemShape): number {
  return shape.type === 'circle' ? shape.radius * 2 : Math.max(shape.width, shape.height);
}

/** A shape's area (m²), as the physics weighs it: a box with parts is the sum of its parts. */
export function shapeArea(shape: ItemShape): number {
  if (shape.type === 'circle') return Math.PI * shape.radius * shape.radius;
  if (shape.parts) return shape.parts.reduce((a, p) => a + p.width * p.height, 0);
  return shape.width * shape.height;
}

/**
 * How long something `span` m long becomes: half again as big when small,
 * less as it gets bigger, and unchanged from `GROW_NONE` up. Never shorter
 * than `MIN_LOOSE`, and it only ever grows.
 */
export function grownSpan(span: number): number {
  let grown: number;
  if (span <= GROW_FULL) grown = span * GROW;
  else if (span < GROW_NONE)
    grown = span + GROW_FULL * (GROW - 1) * ((GROW_NONE - span) / (GROW_NONE - GROW_FULL));
  else grown = span;
  return Math.max(grown, MIN_LOOSE);
}

/**
 * Things whose size is a rule, track pieces, big props, and crafted toys
 * (sized by hand, review R18) keep the size they were given.
 */
export function keepsSize(def: ItemDef): boolean {
  return !!def.fixedSize || (!!def.toy && def.toy !== 'instrument') || !!def.track || !!def.unpocketable;
}

/**
 * A def at the size the world uses. The shape grows by `grownSpan` on both
 * axes (and flat things, grown or not, get `MIN_THICK`), and `mass` keeps the weight it had, so
 * lifts, seesaws, and lily pads weigh things as before. `density` is left
 * alone: it is what floats or sinks a thing.
 */
export function growItem(def: ItemDef): ItemDef {
  if (keepsSize(def)) return def;
  const span = shapeSpan(def.shape);
  const k = grownSpan(span) / span;
  const s = def.shape;
  if (k <= 1 && (s.type === 'circle' || Math.min(s.width, s.height) >= FLAT)) return def;
  const mass = def.mass ?? def.density * shapeArea(def.shape);
  const shape: ItemShape =
    s.type === 'circle'
      ? { type: 'circle', radius: round(s.radius * k) }
      : grownBox(s.width * k, s.height * k);
  return { ...def, shape, mass };
}

function grownBox(width: number, height: number): ItemShape {
  if (width >= height)
    return { type: 'box', width: round(width), height: round(Math.max(height, MIN_THICK)) };
  return { type: 'box', width: round(Math.max(width, MIN_THICK)), height: round(height) };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The density the body is built with: a set `mass` spread over the shape, or the material's density. */
export function bodyDensity(def: ItemDef): number {
  return def.mass !== undefined ? def.mass / shapeArea(def.shape) : def.density;
}
