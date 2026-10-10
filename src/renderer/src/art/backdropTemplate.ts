import type { Container, Renderer } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { CONTENT, worldWidth } from '../../../game/data';
import { Terrain } from '../../../game/world/terrain';
import { Background } from '../render/background';
import {
  STRIP_BLEND,
  cameraMax,
  neverSeen,
  seenSummary,
  stripFileFor,
  stripSpans,
  surfaceAreas,
} from '../render/stripLayout';
import type { StripFile, StripLayer } from './backdropData';

/**
 * Builds a strip template's guide pictures in the running game: the
 * code-drawn layer the strip replaces, what is never on screen, and the
 * lines a painter needs. `scripts/art/backdropTemplate.ts` turns them into an
 * .ora. docs/06-art-guide.md, B14.
 */
export interface StripGuides {
  strip: StripFile;
  /** The code-drawn layer across the canvas, in tiles side by side: each one's x in template pixels and its PNG. */
  current: { x: number; png: string }[];
  lines: string;
  unseen: string;
  notes: string;
}

/** The near layer is sampled this coarsely to find what it hides, in game pixels. */
const CELL = 4;
const PINK = '#e0207a';
const INK = '#2b1d2e';

function canvas2d(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** Render part of a container (its own pixels `x`, `y`, `w`, `h`) to a canvas at a resolution. */
function shot(
  renderer: Renderer,
  target: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  resolution: number,
  antialias = true,
): HTMLCanvasElement {
  return renderer.extract.canvas({
    target,
    frame: new Rectangle(x, y, w, h),
    resolution,
    clearColor: [0, 0, 0, 0],
    antialias,
  }) as HTMLCanvasElement;
}

/** The code-drawn world, off stage, and where its near layer is opaque. Built once per run. */
interface Scene {
  bg: Background;
  cols: number;
  rows: number;
  opaque: Uint8Array;
}

let scene: Scene | null = null;

function sceneFor(renderer: Renderer): Scene {
  if (scene) return scene;
  const areas = CONTENT.areas.all;
  const terrain = Terrain.fromAreas(areas);
  const bg = new Background(areas, terrain, worldWidth(CONTENT), null);
  const surface = surfaceAreas(areas);
  const endPx = (surface[surface.length - 1]?.xEnd ?? 0) * PIXELS_PER_METER;
  const cols = Math.ceil(endPx / CELL);
  const rows = VIEW_HEIGHT_PX / CELL;
  const opaque = new Uint8Array(cols * rows);
  const TILE = 4096;
  for (let x0 = 0; x0 < endPx; x0 += TILE) {
    const w = Math.min(TILE, endPx - x0);
    const c = shot(renderer, bg.near, x0, 0, w, VIEW_HEIGHT_PX, 1 / CELL, false);
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let row = 0; row < Math.min(rows, c.height); row++)
      for (let col = 0; col < c.width; col++) {
        const at = x0 / CELL + col;
        if (at < cols && data[(row * c.width + col) * 4 + 3]! >= 250) opaque[row * cols + at] = 1;
      }
  }
  // A pond's water is drawn live, not in the near layer, and it is opaque: nothing shows through
  // the basin below the surface (which never drops, and whose waves stay within about 30 px).
  for (const area of areas) {
    const w = area.water;
    if (!w || area.hidden) continue;
    const top = Math.ceil((w.level * PIXELS_PER_METER + 40) / CELL);
    const c0 = Math.max(0, Math.floor(((area.xStart + w.x0) * PIXELS_PER_METER) / CELL));
    const c1 = Math.min(cols, Math.ceil(((area.xStart + w.x1) * PIXELS_PER_METER) / CELL));
    for (let col = c0; col < c1; col++) {
      if (terrain.surfaceY(((col + 0.5) * CELL) / PIXELS_PER_METER) <= w.level) continue;
      for (let row = top; row < rows; row++) opaque[row * cols + col] = 1;
    }
  }
  scene = { bg, cols, rows, opaque };
  return scene;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  g.font = `bold ${size}px sans-serif`;
  g.lineJoin = 'round';
  g.lineWidth = size * 0.28;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.strokeText(text, x, y);
  g.fillStyle = INK;
  g.fillText(text, x, y);
}

function line(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  dash: number[] = [],
): void {
  g.save();
  g.setLineDash(dash);
  g.lineWidth = width;
  g.strokeStyle = PINK;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.restore();
}

/** Seams, blend zones, the ground line, the horizon, and a screen's width. */
function linesGuide(strip: StripFile, neighbours: { left: string | null; right: string | null }): string {
  const s = strip.scale;
  const { c, g } = canvas2d(strip.canvas.w, strip.canvas.h);
  const X = (layerX: number): number => (layerX - strip.x) * s;
  const font = 15 * s;
  // Blend zones: pink wash with diagonal hatching.
  const zone = (a: number, b: number): void => {
    g.save();
    g.beginPath();
    g.rect(X(a), 0, X(b) - X(a), strip.canvas.h);
    g.clip();
    g.fillStyle = 'rgba(224,32,122,0.07)';
    g.fillRect(X(a), 0, X(b) - X(a), strip.canvas.h);
    g.strokeStyle = 'rgba(224,32,122,0.22)';
    g.lineWidth = s;
    for (let d = -strip.canvas.h; d < X(b) - X(a) + strip.canvas.h; d += 24 * s) {
      g.beginPath();
      g.moveTo(X(a) + d, 0);
      g.lineTo(X(a) + d + strip.canvas.h, strip.canvas.h);
      g.stroke();
    }
    g.restore();
  };
  const seam = (at: number, name: string | null, side: 'left' | 'right'): void => {
    line(g, X(at), 0, X(at), strip.canvas.h, 2 * s);
    const text = name ? `seam: ${name} ${side === 'left' ? 'ends' : 'starts'} here` : 'seam';
    g.save();
    g.translate(X(at) + (side === 'left' ? 8 * s : -8 * s), 300 * s);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = side === 'left' ? 'top' : 'bottom';
    label(g, text, 0, 0, font);
    g.restore();
  };
  if (strip.blend.left > 0) {
    zone(strip.span.x0 - strip.blend.left, strip.span.x0 + STRIP_BLEND);
    seam(strip.span.x0, neighbours.left, 'left');
  }
  if (strip.blend.right > 0) {
    zone(strip.span.x1 - STRIP_BLEND, strip.span.x1 + strip.blend.right);
    seam(strip.span.x1, neighbours.right, 'right');
  }
  // The horizon: where the sky's glow is brightest.
  const horizon = Math.round(VIEW_HEIGHT_PX * 0.72);
  line(g, 0, horizon * s, strip.canvas.w, horizon * s, s, [10 * s, 10 * s]);
  // The ground line.
  line(g, 0, strip.ground * s, strip.canvas.w, strip.ground * s, 2 * s, [16 * s, 8 * s]);
  // Nothing below the cover line is ever seen.
  if (strip.cover < VIEW_HEIGHT_PX) line(g, 0, strip.cover * s, strip.canvas.w, strip.cover * s, 2 * s);
  g.textBaseline = 'bottom';
  const lx = Math.max(X(strip.span.x0) + 16 * s, 16 * s);
  label(g, `horizon, y ${horizon * s}: the sky glows brightest here`, lx, (horizon - 4) * s, font);
  label(
    g,
    `ground line, y ${strip.ground * s}: bugs walk here, and the ground covers what is below`,
    lx,
    (strip.ground - 4) * s,
    font,
  );
  if (strip.cover < VIEW_HEIGHT_PX) {
    g.textBaseline = 'top';
    label(
      g,
      `y ${strip.cover * s}: nothing below this line is ever on screen`,
      lx,
      (strip.cover + 4) * s,
      font,
    );
  }
  // One screen's width, for scale.
  const w = Math.min(VIEW_WIDTH_PX * s, strip.canvas.w - 32 * s);
  const bx = (strip.canvas.w - w) / 2;
  const by = 30 * s;
  line(g, bx, by, bx + w, by, 2 * s);
  line(g, bx, by - 10 * s, bx, by + 10 * s, 2 * s);
  line(g, bx + w, by - 10 * s, bx + w, by + 10 * s, 2 * s);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  label(
    g,
    w === VIEW_WIDTH_PX * s
      ? `one screen is this wide (${w} px) and the whole canvas tall`
      : `${w} px of one screen's ${VIEW_WIDTH_PX * s} px width; a screen is the whole canvas tall`,
    bx + w / 2,
    by + 14 * s,
    font,
  );
  return c.toDataURL('image/png');
}

/** Grey hatching over every pixel that is never on screen. */
function unseenGuide(strip: StripFile, flags: Uint8Array, cols: number, rows: number): string {
  const s = strip.scale;
  const { c, g } = canvas2d(strip.canvas.w, strip.canvas.h);
  const k = CELL * s;
  g.fillStyle = 'rgba(43,29,46,0.5)';
  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let i = 0; i <= cols; i++) {
      const on = i < cols && flags[row * cols + i] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        g.fillRect(start * k, row * k, (i - start) * k, k);
        start = -1;
      }
    }
  }
  // Light stripes, cut to the shaded part, so it reads as "not here" over any color.
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 3 * s;
  for (let d = -strip.canvas.h; d < strip.canvas.w; d += 28 * s) {
    g.beginPath();
    g.moveTo(d, strip.canvas.h);
    g.lineTo(d + strip.canvas.h, 0);
    g.stroke();
  }
  return c.toDataURL('image/png');
}

function notesGuide(strip: StripFile, lines: readonly string[]): string {
  const s = strip.scale;
  const { c, g } = canvas2d(strip.canvas.w, strip.canvas.h);
  const size = 14 * s;
  const lh = size * 1.45;
  const x = (strip.blend.left > 0 ? strip.blend.left + STRIP_BLEND + 20 : 20) * s;
  const y = 84 * s;
  g.font = `bold ${size}px sans-serif`;
  const w = Math.max(...lines.map((t) => g.measureText(t).width)) + 24 * s;
  g.fillStyle = 'rgba(255,255,255,0.86)';
  g.fillRect(x - 12 * s, y - 12 * s, w, lines.length * lh + 20 * s);
  g.textBaseline = 'top';
  g.fillStyle = INK;
  lines.forEach((t, i) => g.fillText(t, x, y + i * lh));
  return c.toDataURL('image/png');
}

/** Every strip a template can be made for: `<area>_<layer>` for each area under the sky. */
export function stripIds(): string[] {
  return surfaceAreas(CONTENT.areas.all).flatMap((a) => [`${a.id}_far`, `${a.id}_mid`]);
}

/** One strip's template guides. */
export function stripTemplate(
  renderer: Renderer,
  areaId: string,
  layer: StripLayer,
  scale: 1 | 2,
): StripGuides {
  const areas = CONTENT.areas.all;
  const { bg, cols, rows, opaque } = sceneFor(renderer);
  const plain = stripFileFor(areas, areaId, layer, scale);
  if (!plain) throw new Error(`${areaId} has no sky, so it has no ${layer} strip.`);
  const w1 = plain.canvas.w / scale;
  const stripCols = Math.ceil(w1 / CELL);
  const flags = neverSeen(
    (col, row) => opaque[row * cols + col] === 1,
    { cols, rows, cell: CELL },
    { x: plain.x, cols: stripCols, layer },
    cameraMax(areas),
    // The wind leans the mid layer by up to about 60 px at the top of the screen.
    layer === 'mid' ? 80 : 12,
  );
  const strip = stripFileFor(
    areas,
    areaId,
    layer,
    scale,
    seenSummary(flags, { x: plain.x, cols: stripCols }, rows, CELL),
  )!;
  const source = layer === 'far' ? bg.hills : bg.mid;
  const current: StripGuides['current'] = [];
  const TILE = 2048 / scale;
  for (let x = 0; x < w1; x += TILE) {
    const w = Math.min(TILE, w1 - x);
    const c = shot(renderer, source, strip.x + x, 0, w, VIEW_HEIGHT_PX, scale);
    current.push({ x: x * scale, png: c.toDataURL('image/png') });
  }
  const spans = stripSpans(areas, layer);
  const i = spans.findIndex((sp) => sp.area === areaId);
  const nameOf = (id: string | undefined): string | null => areas.find((a) => a.id === id)?.name ?? null;
  const hidden = strip.hidden.map(([a, b]) => `x ${(a - strip.x) * scale} to ${(b - strip.x) * scale}`);
  const notes = [
    `${strip.title} (${strip.id}), ${strip.canvas.w} x ${strip.canvas.h} px, ${scale} px per game pixel`,
    'Paint on any layers of your own. Every layer not named guide... is the picture.',
    'A layer or group named "glow" is not graded: it is added as light after dark.',
    'Paint daylight. The game tints the layer for dawn, dusk, night, and rain.',
    'Leave see-through whatever should show the sky (which the game draws).',
    'Pink hatching: a blend zone. Paint through it; the game fades it over the neighbour.',
    'Grey hatching: never on screen. Leave it empty.',
    ...(hidden.length ? [`Always behind a room: ${hidden.join(', ')}.`] : []),
    ...(layer === 'mid'
      ? ['The wind leans this whole layer, pinned at the bottom. Paint things that bend.']
      : ['This layer never leans. Hard, rigid things (rocks, towers) belong here.']),
    'guide_current, underneath, is the code-drawn layer this replaces.',
  ];
  return {
    strip,
    current,
    lines: linesGuide(strip, { left: nameOf(spans[i - 1]?.area), right: nameOf(spans[i + 1]?.area) }),
    unseen: unseenGuide(strip, flags, stripCols, rows),
    notes: notesGuide(strip, notes),
  };
}
