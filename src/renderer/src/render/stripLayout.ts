import { PIXELS_PER_METER, VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { AreaDef } from '../../../game/data/types';
import type { StripEntry, StripFile, StripLayer } from '../art/backdropData';
import { hashString } from '../art/rigData';

/**
 * Where a set's painted parallax strips sit (docs/06-art-guide.md, B14).
 * Each surface area owns the stretch of a layer that passes the middle of the
 * screen while the camera is in that area. Pure: the template generator, the
 * chunk baker, and the tests share it.
 */

const PPM = PIXELS_PER_METER;

/** How fast each painted layer scrolls (`PARALLAX.hills` and `PARALLAX.mid` in background.ts). */
export const STRIP_PARALLAX: Record<StripLayer, number> = { far: 0.28, mid: 0.55 };

/** How far a strip runs past each end of its span, in game pixels: it fades out there, over its neighbour. */
export const STRIP_BLEND = 128;

/** The ground line in game pixels: the near layer's soil starts about here. */
export const STRIP_GROUND = 900;

type Area = Pick<AreaDef, 'id' | 'name' | 'xStart' | 'xEnd' | 'hidden'>;

/** Where a layer shows world pixel `worldPx` when the camera is centered on it. */
const centered = (worldPx: number, factor: number): number =>
  (worldPx - VIEW_WIDTH_PX / 2) * factor + VIEW_WIDTH_PX / 2;

/** The areas under the sky, left to right. The hidden areas are sealed rooms with no sky. */
export function surfaceAreas<T extends Area>(areas: readonly T[]): T[] {
  return areas.filter((a) => !a.hidden).sort((a, b) => a.xStart - b.xStart);
}

/** The furthest right the camera's left edge goes on the surface, in world pixels. */
export function cameraMax(areas: readonly Area[]): number {
  const surface = surfaceAreas(areas);
  return Math.max(0, (surface[surface.length - 1]?.xEnd ?? 0) * PPM - VIEW_WIDTH_PX);
}

export interface StripSpan {
  area: string;
  layer: StripLayer;
  /** The stretch of the layer the area owns, in game pixels. */
  x0: number;
  x1: number;
  /** The blend zone past each end (none at the ends of the world). */
  left: number;
  right: number;
}

/**
 * Each surface area's stretch of a layer. The first area's runs from the
 * layer's left edge and the last one's to what the screen shows at the far
 * end of the world, so together they cover everything the camera can see.
 */
export function stripSpans(areas: readonly Area[], layer: StripLayer): StripSpan[] {
  const f = STRIP_PARALLAX[layer];
  const surface = surfaceAreas(areas);
  const end = Math.round(cameraMax(areas) * f + VIEW_WIDTH_PX);
  return surface.map((a, i) => {
    const first = i === 0;
    const last = i === surface.length - 1;
    return {
      area: a.id,
      layer,
      x0: first ? 0 : Math.round(centered(a.xStart * PPM, f)),
      x1: last ? end : Math.round(centered(a.xEnd * PPM, f)),
      left: first ? 0 : STRIP_BLEND,
      right: last ? 0 : STRIP_BLEND,
    };
  });
}

export const stripId = (area: string, layer: StripLayer): string => `${area}_${layer}`;

/** What is never on screen in a strip (`neverSeen`), for its strip.json. */
export interface StripSeen {
  cover: number;
  hidden: [number, number][];
}

/** The strip.json for one area's layer at a template scale, or null for an area with no sky. */
export function stripFileFor(
  areas: readonly Area[],
  areaId: string,
  layer: StripLayer,
  scale: 1 | 2 = 2,
  seen: StripSeen = { cover: VIEW_HEIGHT_PX, hidden: [] },
): StripFile | null {
  const span = stripSpans(areas, layer).find((s) => s.area === areaId);
  const area = areas.find((a) => a.id === areaId);
  if (!span || !area) return null;
  const canvas = { w: (span.x1 - span.x0 + span.left + span.right) * scale, h: VIEW_HEIGHT_PX * scale };
  const x = span.x0 - span.left;
  const core = {
    id: stripId(areaId, layer),
    scale,
    canvas,
    x,
    span: { x0: span.x0, x1: span.x1 },
    blend: { left: span.left, right: span.right },
  };
  return {
    schema: 1,
    kind: 'strip',
    area: areaId,
    layer,
    title: `${area.name}, ${layer} layer`,
    ...core,
    ground: STRIP_GROUND,
    cover: seen.cover,
    hidden: seen.hidden,
    stripHash: hashString(JSON.stringify(core)),
  };
}

/** What to draw into one baked chunk of a layer. */
export interface ChunkPlan {
  /** Stretches of the chunk the code-drawn art fills, in layer pixels: everything no drawn strip owns. */
  code: [number, number][];
  /** The strips to draw over them, left to right, so each one's blend zone lies over its neighbour. */
  strips: StripEntry[];
}

/**
 * Plan the chunk from `x` to `x + w` (layer pixels). A strip that is drawn
 * replaces the code-drawn art across its whole span, transparent parts and
 * all; an area the set has no strip for keeps the code-drawn art.
 */
export function chunkPlan(x: number, w: number, strips: readonly StripEntry[]): ChunkPlan {
  const drawn = strips
    .filter((s) => s.status === 'drawn' && s.paint)
    .sort((a, b) => a.span[0] - b.span[0] || (a.id < b.id ? -1 : 1));
  const code: [number, number][] = [];
  let at = x;
  for (const s of drawn) {
    const [a, b] = s.span;
    if (b <= at || a >= x + w) continue;
    if (a > at) code.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < x + w) code.push([at, x + w]);
  return {
    code,
    strips: drawn.filter((s) => s.paint!.x < x + w && s.paint!.x + s.paint!.w > x),
  };
}

/**
 * The world columns that can be in front of layer column `layerX`: as the
 * camera pans, a far layer slides under the near one, so one spot of it can
 * sit behind a long stretch of the world. In world pixels, or null when that
 * column is never on screen.
 */
export function frontRange(layerX: number, layer: StripLayer, maxCamera: number): [number, number] | null {
  const f = STRIP_PARALLAX[layer];
  const lo = Math.max(0, (layerX - VIEW_WIDTH_PX) / f);
  const hi = Math.min(maxCamera, layerX / f);
  if (lo > hi) return null;
  return [layerX + lo * (1 - f), layerX + hi * (1 - f)];
}

/**
 * Which pixels of a strip are never on screen, from a grid of where the near
 * layer is opaque. `opaque(col, row)` reads the grid, whose cells are `cell`
 * world pixels wide and tall. Returns one flag per cell of the strip, row by
 * row, with `cols` cells per row starting at layer pixel `x`. `slack` widens
 * the stretch that must be covered (the wind leans the mid layer).
 */
export function neverSeen(
  opaque: (col: number, row: number) => boolean,
  grid: { cols: number; rows: number; cell: number },
  strip: { x: number; cols: number; layer: StripLayer },
  maxCamera: number,
  slack = 0,
): Uint8Array {
  const { cols, rows, cell } = grid;
  const out = new Uint8Array(strip.cols * rows);
  // Gaps so far along each row, so any stretch can be asked in one step.
  const gaps = new Int32Array(cols + 1);
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) gaps[c + 1] = gaps[c]! + (opaque(c, row) ? 0 : 1);
    for (let i = 0; i < strip.cols; i++) {
      const range = frontRange(strip.x + (i + 0.5) * cell, strip.layer, maxCamera);
      if (!range) {
        out[row * strip.cols + i] = 1;
        continue;
      }
      // The screen never shows anything past the ends of the grid (the ends of the world).
      const a = Math.max(0, Math.floor((range[0] - slack) / cell));
      const b = Math.min(cols, Math.ceil((range[1] + slack) / cell));
      if (b > a && gaps[b]! - gaps[a]! === 0) out[row * strip.cols + i] = 1;
    }
  }
  return out;
}

/** The lowest row that still shows somewhere, and the stretches hidden top to bottom, from `neverSeen`'s flags. */
export function seenSummary(
  flags: Uint8Array,
  strip: { x: number; cols: number },
  rows: number,
  cell: number,
  margin = { cover: 24, hidden: 96 },
): StripSeen {
  let lastSeenRow = -1;
  const colSeen = new Uint8Array(strip.cols);
  for (let row = 0; row < rows; row++)
    for (let i = 0; i < strip.cols; i++)
      if (!flags[row * strip.cols + i]) {
        lastSeenRow = Math.max(lastSeenRow, row);
        colSeen[i] = 1;
      }
  const cover = Math.min(VIEW_HEIGHT_PX, (lastSeenRow + 1) * cell + margin.cover);
  const hidden: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= strip.cols; i++) {
    const seen = i === strip.cols || colSeen[i] === 1;
    if (!seen && start < 0) start = i;
    if (seen && start >= 0) {
      const a = strip.x + start * cell + (start === 0 ? 0 : margin.hidden);
      const b = strip.x + i * cell - (i === strip.cols ? 0 : margin.hidden);
      if (b > a) hidden.push([a, b]);
      start = -1;
    }
  }
  return { cover, hidden };
}
