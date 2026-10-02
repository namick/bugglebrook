import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { Point } from '../render/camera';

/**
 * Photo mode's geometry (game design doc, section 14), pure so Vitest can
 * check it without Pixi. The photo is the whole 1920x1080 view. Zooming
 * shows a window of it, `1/zoom` of the view wide, centered on (cx, cy) in
 * view pixels; the window never leaves the view. Stickers sit in photo
 * pixels with a scale and a rotation, and are worked by a corner handle.
 */
export interface PhotoView {
  /** 1 to 3. */
  zoom: number;
  /** The view point in the middle of the photo, in view pixels. */
  cx: number;
  cy: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
/** One wheel notch (100 px of delta) zooms by this factor. */
export const ZOOM_PER_NOTCH = 1.18;

export const W = VIEW_WIDTH_PX;
export const H = VIEW_HEIGHT_PX;

export const DEFAULT_VIEW: Readonly<PhotoView> = { zoom: 1, cx: W / 2, cy: H / 2 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Keep the window inside the view (at zoom 1 that pins it to the middle). */
export function clampView(v: PhotoView): PhotoView {
  const zoom = clamp(Number.isFinite(v.zoom) ? v.zoom : 1, ZOOM_MIN, ZOOM_MAX);
  const hw = W / 2 / zoom;
  const hh = H / 2 / zoom;
  return { zoom, cx: clamp(v.cx, hw, W - hw), cy: clamp(v.cy, hh, H - hh) };
}

/** The view point under a screen point. */
export function screenToView(v: PhotoView, p: Point): Point {
  return { x: v.cx + (p.x - W / 2) / v.zoom, y: v.cy + (p.y - H / 2) / v.zoom };
}

/** Where a view point lands on the screen. */
export function viewToScreen(v: PhotoView, p: Point): Point {
  return { x: W / 2 + (p.x - v.cx) * v.zoom, y: H / 2 + (p.y - v.cy) * v.zoom };
}

/**
 * Zoom by `factor` keeping the point under the cursor where it is (the doc:
 * zoom centers on the cursor). Clamped to 1x to 3x and inside the view.
 */
export function zoomAt(v: PhotoView, factor: number, cursor: Point): PhotoView {
  const zoom = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const under = screenToView(v, cursor);
  return clampView({
    zoom,
    cx: under.x - (cursor.x - W / 2) / zoom,
    cy: under.y - (cursor.y - H / 2) / zoom,
  });
}

/** Zoom for a wheel's vertical delta: up (negative) zooms in. */
export function wheelZoom(deltaY: number): number {
  return ZOOM_PER_NOTCH ** (-deltaY / 100);
}

/**
 * Drag the photo by a screen distance. Returns the view inside its limits
 * and how far the drag wanted to go past them, in view pixels: the caller
 * pans the camera by that so a drag at the edge keeps going into the world.
 */
export function panView(v: PhotoView, dx: number, dy: number): { view: PhotoView; overX: number } {
  const want = { zoom: v.zoom, cx: v.cx - dx / v.zoom, cy: v.cy - dy / v.zoom };
  const view = clampView(want);
  return { view, overX: want.cx - view.cx };
}

/** The scale and position for a container holding the view, so the window fills the screen. */
export function viewTransform(v: PhotoView): { scale: number; x: number; y: number } {
  return { scale: v.zoom, x: W / 2 - v.cx * v.zoom, y: H / 2 - v.cy * v.zoom };
}

// --- Stickers -------------------------------------------------------------

export interface StickerPlacement {
  id: string;
  /** Center, in photo pixels. */
  x: number;
  y: number;
  scale: number;
  /** Radians. */
  rotation: number;
}

export const STICKER_SCALE = { min: 0.35, max: 4 };
/** Stickers are drawn about this many pixels across at scale 1. */
export const STICKER_SIZE = 150;

/** The corner handle's spot (bottom right of the sticker, turned with it). */
export function stickerHandle(s: StickerPlacement, size = STICKER_SIZE): Point {
  const r = (size / 2) * s.scale * Math.SQRT2;
  const a = s.rotation + Math.PI / 4;
  return { x: s.x + r * Math.cos(a), y: s.y + r * Math.sin(a) };
}

/**
 * Dragging the handle to `p` scales and turns the sticker about its center:
 * the handle stays under the finger (within the scale limits).
 */
export function dragHandle(s: StickerPlacement, p: Point, size = STICKER_SIZE): StickerPlacement {
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  const r = Math.hypot(dx, dy);
  if (r < 1) return s;
  const scale = clamp(r / ((size / 2) * Math.SQRT2), STICKER_SCALE.min, STICKER_SCALE.max);
  return { ...s, scale, rotation: Math.atan2(dy, dx) - Math.PI / 4 };
}

/** Is a photo point on the sticker (its square, turned and scaled)? */
export function pointInSticker(s: StickerPlacement, p: Point, size = STICKER_SIZE, slack = 12): boolean {
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  const c = Math.cos(-s.rotation);
  const sn = Math.sin(-s.rotation);
  const lx = dx * c - dy * sn;
  const ly = dx * sn + dy * c;
  const half = (size / 2) * s.scale + slack;
  return Math.abs(lx) <= half && Math.abs(ly) <= half;
}

/** The topmost sticker under a point, or -1. */
export function stickerAt(stickers: readonly StickerPlacement[], p: Point, size = STICKER_SIZE): number {
  for (let i = stickers.length - 1; i >= 0; i--) if (pointInSticker(stickers[i]!, p, size)) return i;
  return -1;
}

/** The band along the bottom where the sticker tray lives: a sticker let go there is thrown away. */
export const TRAY_BAND = 150;

/**
 * Is a sticker let go here off the photo: outside the screen, or over the
 * tray band while a tray is open?
 */
export function offPhoto(p: Point, trayOpen = true): boolean {
  if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return true;
  return trayOpen && p.y > H - TRAY_BAND;
}

// --- What is in the frame -------------------------------------------------

export interface FramedBug {
  defId: string;
  /** View pixels. */
  x: number;
  y: number;
  /** Half its height in view pixels. */
  r: number;
}

/**
 * Bugs in the photo, nearest the middle first. A bug counts when its body
 * is inside the zoomed window (its middle within a radius of the edge).
 */
export function bugsInFrame(v: PhotoView, bugs: readonly FramedBug[]): string[] {
  const hw = W / 2 / v.zoom;
  const hh = H / 2 / v.zoom;
  return bugs
    .filter((b) => Math.abs(b.x - v.cx) <= hw + b.r && Math.abs(b.y - v.cy) <= hh + b.r)
    .sort((a, b) => Math.hypot(a.x - v.cx, a.y - v.cy) - Math.hypot(b.x - v.cx, b.y - v.cy))
    .map((b) => b.defId);
}

/** Where a sticker from the tray lands when dropped: snapped inside the photo (clear of an open tray). */
export function settleSticker(s: StickerPlacement, trayOpen = true): StickerPlacement {
  const bottom = trayOpen ? H - TRAY_BAND - 20 : H - 20;
  return { ...s, x: clamp(s.x, 20, W - 20), y: clamp(s.y, 20, bottom) };
}
