import type { ShapeSpec } from '../physics/physics';

/**
 * Laying out an area's start list as piles (pure). Start things can sit on
 * top of the ones placed before them (`stack`) or lean against the one just
 * before (`lean`). Both work from the shapes at load time, so a pile still
 * fits together when item sizes change.
 */

/** A start thing already placed: its bounding box's sides and top (world m). */
export interface Placed {
  x0: number;
  x1: number;
  top: number;
}

/** The top of the highest placed thing under the span [x - halfW, x + halfW], or null if nothing is. */
export function stackTop(placed: readonly Placed[], x: number, halfW: number): number | null {
  let top: number | null = null;
  for (const p of placed)
    if (p.x1 > x - halfW && p.x0 < x + halfW) top = top === null ? p.top : Math.min(top, p.top);
  return top;
}

/** How far along a leaning stick the corner it rests on touches it. */
const TOUCH = 0.8;

/**
 * A stick leaning against `prev`: its foot on the ground at `ground`, its
 * side resting on prev's top corner (the left corner when `dir` is 1, so it
 * leans right). Returns its center and angle. Steep things are capped so
 * they never stand up straight.
 */
export function leanAgainst(
  prev: Placed,
  shape: ShapeSpec,
  dir: 1 | -1,
  ground: number,
): { x: number; y: number; angle: number } {
  const length = shape.type === 'box' ? shape.width : shape.radius * 2;
  const thick = shape.type === 'box' ? shape.height : shape.radius * 2;
  const cornerX = dir === 1 ? prev.x0 : prev.x1;
  const rise = Math.max(0.05, ground - prev.top);
  const theta = Math.asin(Math.min(0.9, rise / (TOUCH * length)));
  const footX = cornerX - dir * TOUCH * length * Math.cos(theta) - dir * 0.02;
  const half = length / 2;
  // The middle of its bottom face, then up off that face by half its thickness.
  const bx = footX + dir * half * Math.cos(theta);
  const by = ground - half * Math.sin(theta);
  const off = thick / 2 + 0.01;
  return {
    x: bx - dir * Math.sin(theta) * off,
    y: by - Math.cos(theta) * off,
    angle: -dir * theta,
  };
}
