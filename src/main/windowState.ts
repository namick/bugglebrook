import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `window-state.json` holds: the windowed bounds, and the display they were on. */
export interface WindowState {
  bounds: Rect;
  maximized: boolean;
  displayId: number | null;
}

/** A display as the placement math sees it (Electron's `Display`, trimmed). */
export interface DisplayArea {
  id: number;
  workArea: Rect;
}

export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 720 } as const;
export const MIN_WINDOW_SIZE = { width: 800, height: 450 } as const;
/** How much of the window (each way, in px) must sit on a display for the saved spot to count. */
const MIN_VISIBLE = 120;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Read a stored state, or null if it is missing or malformed. */
export function normalizeWindowState(raw: unknown): WindowState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const b = r.bounds as Record<string, unknown> | undefined;
  if (!b || !finite(b.x) || !finite(b.y) || !finite(b.width) || !finite(b.height)) return null;
  if (b.width <= 0 || b.height <= 0) return null;
  return {
    bounds: {
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.round(b.width),
      height: Math.round(b.height),
    },
    maximized: r.maximized === true,
    displayId: finite(r.displayId) ? r.displayId : null,
  };
}

function overlap(a: Rect, b: Rect): { w: number; h: number } {
  return {
    w: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    h: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

/** Fit a size inside a work area, keeping the minimum unless the area itself is smaller. */
function fitSize(width: number, height: number, area: Rect): { width: number; height: number } {
  return {
    width: Math.min(Math.max(width, MIN_WINDOW_SIZE.width), area.width),
    height: Math.min(Math.max(height, MIN_WINDOW_SIZE.height), area.height),
  };
}

function centered(size: { width: number; height: number }, area: Rect): Rect {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    ...size,
  };
}

/**
 * Where to open the window. A saved spot that still sits on a display is kept
 * (shrunk and nudged to fit that display's work area). If its monitor is gone
 * or the window would be mostly off screen, it opens centered on the display
 * it was on (when that still exists) or on the primary display.
 */
export function placeWindow(
  saved: WindowState | null,
  displays: readonly DisplayArea[],
  primary: DisplayArea,
): { bounds: Rect; maximized: boolean; displayId: number } {
  if (!saved) {
    const size = fitSize(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height, primary.workArea);
    return { bounds: centered(size, primary.workArea), maximized: false, displayId: primary.id };
  }
  // The display holding most of the window.
  let best: DisplayArea | null = null;
  let bestArea = 0;
  for (const d of displays) {
    const o = overlap(saved.bounds, d.workArea);
    if (
      o.w >= Math.min(MIN_VISIBLE, saved.bounds.width) &&
      o.h >= Math.min(MIN_VISIBLE, saved.bounds.height)
    ) {
      if (o.w * o.h > bestArea) {
        best = d;
        bestArea = o.w * o.h;
      }
    }
  }
  if (!best) {
    const home = displays.find((d) => d.id === saved.displayId) ?? primary;
    const size = fitSize(saved.bounds.width, saved.bounds.height, home.workArea);
    return { bounds: centered(size, home.workArea), maximized: saved.maximized, displayId: home.id };
  }
  const area = best.workArea;
  const size = fitSize(saved.bounds.width, saved.bounds.height, area);
  const x = Math.min(Math.max(saved.bounds.x, area.x), area.x + area.width - size.width);
  const y = Math.min(Math.max(saved.bounds.y, area.y), area.y + area.height - size.height);
  return { bounds: { x, y, ...size }, maximized: saved.maximized, displayId: best.id };
}

/**
 * `window-state.json` in userData. Separate from `settings.json` because it
 * belongs to this machine's monitors, not to the player's choices. Reads and
 * writes are synchronous: the write happens while the window closes.
 */
export class WindowStateStore {
  constructor(readonly path: string) {}

  read(): WindowState | null {
    try {
      return normalizeWindowState(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch {
      return null;
    }
  }

  write(state: WindowState): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 2));
      renameSync(tmp, this.path);
    } catch {
      // Losing the window's spot is not worth an error.
    }
  }
}
