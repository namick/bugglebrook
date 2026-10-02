import { describe, expect, it } from 'vitest';
import { BUGS } from '../../src/game/data/bugs';
import { FILTERS } from '../../src/renderer/src/photo/filters';
import { FRAMES } from '../../src/renderer/src/photo/frames';
import {
  DEFAULT_VIEW,
  H,
  STICKER_SCALE,
  STICKER_SIZE,
  W,
  ZOOM_MAX,
  bugsInFrame,
  clampView,
  dragHandle,
  offPhoto,
  panView,
  pointInSticker,
  screenToView,
  settleSticker,
  stickerAt,
  stickerHandle,
  viewToScreen,
  viewTransform,
  wheelZoom,
  zoomAt,
} from '../../src/renderer/src/photo/photoMath';
import { STICKERS, lockedStickers, trayStickers } from '../../src/renderer/src/photo/stickers';

// M11, photo mode (game design doc, section 14): the pure geometry of the
// viewfinder (zoom and pan), stickers (move, scale, turn, throw away), and
// the catalogs of frames, filters, and stickers.

describe('zoom and pan', () => {
  it('starts at 1x on the whole view and never leaves it', () => {
    expect(clampView(DEFAULT_VIEW)).toEqual(DEFAULT_VIEW);
    // At 1x the window is the view: it cannot move.
    expect(clampView({ zoom: 1, cx: 100, cy: 900 })).toEqual(DEFAULT_VIEW);
    // Zoomed, it stops at the edges.
    expect(clampView({ zoom: 2, cx: 0, cy: 0 })).toEqual({ zoom: 2, cx: W / 4, cy: H / 4 });
    expect(clampView({ zoom: 2, cx: W, cy: H })).toEqual({ zoom: 2, cx: (3 * W) / 4, cy: (3 * H) / 4 });
    expect(clampView({ zoom: 9, cx: W / 2, cy: H / 2 }).zoom).toBe(ZOOM_MAX);
    expect(clampView({ zoom: 0.2, cx: W / 2, cy: H / 2 }).zoom).toBe(1);
    expect(clampView({ zoom: NaN, cx: W / 2, cy: H / 2 }).zoom).toBe(1);
  });

  it('zooms on the cursor: the point under it stays put', () => {
    const cursor = { x: 1400, y: 300 };
    const under = screenToView(DEFAULT_VIEW, cursor);
    const v = zoomAt(DEFAULT_VIEW, 1.5, cursor);
    expect(v.zoom).toBeCloseTo(1.5);
    expect(viewToScreen(v, under).x).toBeCloseTo(cursor.x);
    expect(viewToScreen(v, under).y).toBeCloseTo(cursor.y);
    // Keep going and it stops at 3x, still inside the view.
    let z = v;
    for (let i = 0; i < 20; i++) z = zoomAt(z, wheelZoom(-100), cursor);
    expect(z.zoom).toBe(ZOOM_MAX);
    expect(z.cx + W / 2 / z.zoom).toBeLessThanOrEqual(W + 1e-6);
    // Wheel down zooms out again.
    expect(wheelZoom(100)).toBeLessThan(1);
    expect(wheelZoom(-100)).toBeGreaterThan(1);
    expect(zoomAt(z, wheelZoom(100), cursor).zoom).toBeLessThan(ZOOM_MAX);
  });

  it('pans the window inside the view and reports what wanted to go past the edge', () => {
    const v = clampView({ zoom: 2, cx: W / 2, cy: H / 2 });
    const r = panView(v, -200, 0);
    expect(r.view.cx).toBeCloseTo(W / 2 + 100);
    expect(r.overX).toBe(0);
    // Dragging left past the right edge: the extra is handed back for the camera.
    const edge = panView(v, -2000, 0);
    expect(edge.view.cx).toBeCloseTo((3 * W) / 4);
    expect(edge.overX).toBeGreaterThan(0);
    // At 1x the whole drag goes to the camera.
    const flat = panView(DEFAULT_VIEW, -300, 50);
    expect(flat.view).toEqual(DEFAULT_VIEW);
    expect(flat.overX).toBe(300);
  });

  it('turns a view into a container transform that fills the screen', () => {
    expect(viewTransform(DEFAULT_VIEW)).toEqual({ scale: 1, x: 0, y: 0 });
    const t = viewTransform({ zoom: 2, cx: W / 4, cy: H / 4 });
    expect(t).toEqual({ scale: 2, x: 0, y: 0 });
    const t2 = viewTransform({ zoom: 2, cx: (3 * W) / 4, cy: (3 * H) / 4 });
    expect(t2.x).toBeCloseTo(-W);
    expect(t2.y).toBeCloseTo(-H);
  });
});

describe('stickers', () => {
  const s = { id: 'sticker_crown', x: 800, y: 500, scale: 1, rotation: 0 };

  it('has a corner handle that scales and turns it when dragged', () => {
    const h = stickerHandle(s);
    expect(h.x).toBeCloseTo(800 + STICKER_SIZE / 2);
    expect(h.y).toBeCloseTo(500 + STICKER_SIZE / 2);
    // Dragging the handle straight out doubles the size and keeps it level.
    const big = dragHandle(s, { x: 800 + STICKER_SIZE, y: 500 + STICKER_SIZE });
    expect(big.scale).toBeCloseTo(2);
    expect(big.rotation).toBeCloseTo(0);
    // Dragging it round turns the sticker.
    const turned = dragHandle(s, { x: 800 - STICKER_SIZE / 2, y: 500 + STICKER_SIZE / 2 });
    expect(turned.scale).toBeCloseTo(1);
    expect(turned.rotation).toBeCloseTo(Math.PI / 2);
    // The handle follows the finger.
    const hh = stickerHandle(turned);
    expect(hh.x).toBeCloseTo(800 - STICKER_SIZE / 2);
    expect(hh.y).toBeCloseTo(500 + STICKER_SIZE / 2);
    // Within limits.
    expect(dragHandle(s, { x: 800 + 5000, y: 500 }).scale).toBe(STICKER_SCALE.max);
    expect(dragHandle(s, { x: 801, y: 500 }).scale).toBe(STICKER_SCALE.min);
    expect(dragHandle(s, { x: 800, y: 500 })).toBe(s);
  });

  it('knows what is under a point, topmost first', () => {
    expect(pointInSticker(s, { x: 800, y: 500 })).toBe(true);
    expect(pointInSticker(s, { x: 800 + STICKER_SIZE, y: 500 })).toBe(false);
    const turned = { ...s, rotation: Math.PI / 4 };
    // A corner of the unturned square is outside the turned one.
    expect(pointInSticker(turned, { x: 800 + 70, y: 500 + 70 }, STICKER_SIZE, 0)).toBe(false);
    expect(pointInSticker(turned, { x: 800 + 100, y: 500 }, STICKER_SIZE, 0)).toBe(true);
    const over = { ...s, id: 'sticker_mustache', x: 820 };
    expect(stickerAt([s, over], { x: 810, y: 500 })).toBe(1);
    expect(stickerAt([s, over], { x: 10, y: 10 })).toBe(-1);
  });

  it('is thrown away over the tray or off the screen, and lands inside the photo', () => {
    expect(offPhoto({ x: 800, y: 500 })).toBe(false);
    expect(offPhoto({ x: 800, y: H - 20 })).toBe(true);
    expect(offPhoto({ x: -5, y: 500 })).toBe(true);
    expect(offPhoto({ x: W + 5, y: 500 })).toBe(true);
    const settled = settleSticker({ ...s, x: -40, y: H });
    expect(settled.x).toBeGreaterThanOrEqual(0);
    expect(settled.y).toBeLessThan(H - 100);
  });

  it('offers at least 24 stickers at the start, plus a face per bug met, and keeps secrets back', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(STICKERS.map((st) => st.id)).size).toBe(STICKERS.length);
    const found = BUGS.all.slice(0, 3);
    const tray = trayStickers(found, []);
    expect(tray.map((st) => st.id)).not.toContain('sticker_patchwork_bug');
    expect(tray.filter((st) => st.id.startsWith('sticker_face_'))).toHaveLength(3);
    expect(lockedStickers([]).map((st) => st.id)).toEqual(['sticker_patchwork_bug']);
    expect(trayStickers(found, ['secret_paint_all_five']).map((st) => st.id)).toContain(
      'sticker_patchwork_bug',
    );
    expect(lockedStickers(['secret_paint_all_five'])).toEqual([]);
    for (const picto of ['food', 'star', 'question', 'exclaim', 'note', 'dizzy', 'stink', 'zzz'])
      expect(STICKERS.map((st) => st.id)).toContain(`sticker_bubble_${picto}`);
  });
});

describe('frames and filters', () => {
  it('lists the ten frames and seven filters of the design doc, with the locked ones marked', () => {
    expect(FRAMES.map((f) => f.id)).toEqual([
      'frame_none',
      'frame_polaroid',
      'frame_leaf',
      'frame_stamp',
      'frame_comic',
      'frame_wanted',
      'frame_bottle_cap',
      'frame_slime',
      'frame_totem',
      'frame_starry',
    ]);
    expect(FRAMES.find((f) => f.id === 'frame_totem')?.unlock).toBe('secret_bug_totem');
    expect(FRAMES.find((f) => f.id === 'frame_starry')?.unlock).toBeDefined();
    expect(FILTERS.map((f) => f.id)).toEqual([
      'filter_none',
      'filter_warm',
      'filter_cool',
      'filter_night_vision',
      'filter_old_photo',
      'filter_comic',
      'filter_bug_eye',
    ]);
    expect(FILTERS.find((f) => f.id === 'filter_bug_eye')?.unlock).toBe('secret_scope_wubbo');
    expect(new Set(FILTERS.map((f) => f.mode)).size).toBe(FILTERS.length);
  });
});

describe('what is in the frame', () => {
  it('lists the bugs inside the zoomed window, nearest the middle first', () => {
    const bugs = [
      { defId: 'bug_a', x: W / 2 + 10, y: H / 2, r: 30 },
      { defId: 'bug_b', x: 100, y: 100, r: 30 },
      { defId: 'bug_c', x: W / 2 - 300, y: H / 2, r: 30 },
    ];
    expect(bugsInFrame(DEFAULT_VIEW, bugs)).toEqual(['bug_a', 'bug_c', 'bug_b']);
    // Zoomed in twice on the middle, the corner bug is out of the shot.
    expect(bugsInFrame({ zoom: 2, cx: W / 2, cy: H / 2 }, bugs)).toEqual(['bug_a', 'bug_c']);
    expect(bugsInFrame({ zoom: 3, cx: W / 2, cy: H / 2 }, bugs)).toEqual(['bug_a', 'bug_c']);
    expect(bugsInFrame({ zoom: 3, cx: W / 2 + 500, cy: H / 2 }, bugs)).toEqual([]);
  });
});
