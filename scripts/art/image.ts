// Pixel work for the art importer, on straight-alpha RGBA8 buffers. All of it
// is integer math or rounds the same way every time, so the same drawing makes
// the same atlas bytes.

import type { Rgba } from './png.ts';
import { blank } from './png.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Blend modes the importer understands inside a part's group (Krita's names in ORA). */
export const BLEND_MODES = ['svg:src-over', 'svg:multiply', 'svg:src-atop'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/**
 * Draw `src` onto `dst` at (`dx`, `dy`) with an opacity and a blend mode.
 * src-over is normal painting, multiply darkens, src-atop paints only where
 * `dst` already has alpha (Krita's Inherit Alpha).
 */
export function composite(
  dst: Rgba,
  src: Rgba,
  dx: number,
  dy: number,
  opacity = 1,
  mode: BlendMode = 'svg:src-over',
): void {
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dst.w, dx + src.w);
  const y1 = Math.min(dst.h, dy + src.h);
  const d = dst.data;
  const s = src.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const si = ((y - dy) * src.w + (x - dx)) * 4;
      const di = (y * dst.w + x) * 4;
      const sa = (s[si + 3]! / 255) * opacity;
      if (sa <= 0) continue;
      const da = d[di + 3]! / 255;
      const sr = s[si]! / 255;
      const sg = s[si + 1]! / 255;
      const sb = s[si + 2]! / 255;
      const dr = d[di]! / 255;
      const dg = d[di + 1]! / 255;
      const db = d[di + 2]! / 255;
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      if (mode === 'svg:src-atop') {
        if (da <= 0) continue;
        // Color goes where the backdrop is; the backdrop keeps its alpha.
        a = da;
        r = sr * sa + dr * (1 - sa);
        g = sg * sa + dg * (1 - sa);
        b = sb * sa + db * (1 - sa);
      } else {
        a = sa + da * (1 - sa);
        // Multiply mixes the colors where both are present (W3C compositing).
        const mr = mode === 'svg:multiply' ? sr * (1 - da) + sr * dr * da : sr;
        const mg = mode === 'svg:multiply' ? sg * (1 - da) + sg * dg * da : sg;
        const mb = mode === 'svg:multiply' ? sb * (1 - da) + sb * db * da : sb;
        r = (mr * sa + dr * da * (1 - sa)) / a;
        g = (mg * sa + dg * da * (1 - sa)) / a;
        b = (mb * sa + db * da * (1 - sa)) / a;
      }
      d[di] = Math.round(r * 255);
      d[di + 1] = Math.round(g * 255);
      d[di + 2] = Math.round(b * 255);
      d[di + 3] = Math.round(a * 255);
    }
  }
}

/** The box around every pixel with alpha above `min`, or null when there are none. */
export function alphaBounds(img: Rgba, min = 0): Rect | null {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3]! > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A copy of a rectangle of `img`; pixels outside it come out transparent. */
export function crop(img: Rgba, r: Rect): Rgba {
  const out = blank(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= img.h) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x;
      if (sx < 0 || sx >= img.w) continue;
      const si = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * r.w + x) * 4);
    }
  }
  return out;
}

/** Turn a quarter clockwise: what pointed up points right. */
export function rotateCw(img: Rgba): Rgba {
  const out = blank(img.h, img.w);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const si = (y * img.w + x) * 4;
      const nx = img.h - 1 - y;
      const ny = x;
      out.data.set(img.data.subarray(si, si + 4), (ny * out.w + nx) * 4);
    }
  return out;
}

/**
 * Halve the size with a 2x2 box filter, averaging in premultiplied alpha so
 * edges don't darken. Odd sizes get a transparent pixel added first.
 */
export function halve(img: Rgba): Rgba {
  const w = Math.ceil(img.w / 2);
  const h = Math.ceil(img.h / 2);
  const out = blank(w, h);
  const px = (x: number, y: number): [number, number, number, number] => {
    if (x >= img.w || y >= img.h) return [0, 0, 0, 0];
    const i = (y * img.w + x) * 4;
    const a = img.data[i + 3]!;
    return [img.data[i]! * a, img.data[i + 1]! * a, img.data[i + 2]! * a, a];
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const q = px(x * 2 + ox, y * 2 + oy);
        r += q[0];
        g += q[1];
        b += q[2];
        a += q[3];
      }
      const o = (y * w + x) * 4;
      if (a === 0) continue;
      out.data[o] = Math.round(r / a);
      out.data[o + 1] = Math.round(g / a);
      out.data[o + 2] = Math.round(b / a);
      out.data[o + 3] = Math.round(a / 4);
    }
  return out;
}

/**
 * Fill the color of fully transparent pixels next to drawn ones (up to
 * `steps` pixels out) with their neighbors' average color, alpha left at 0.
 * Texture filtering then blends edges toward the drawing's own color, not black.
 */
export function bleed(img: Rgba, steps = 2): void {
  const { w, h, data } = img;
  const done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) done[i] = data[i * 4 + 3]! > 0 ? 1 : 0;
  for (let s = 0; s < steps; s++) {
    const next: [number, number, number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (done[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!done[j]) continue;
            r += data[j * 4]!;
            g += data[j * 4 + 1]!;
            b += data[j * 4 + 2]!;
            n++;
          }
        if (n) next.push([i, Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      }
    for (const [i, r, g, b] of next) {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      done[i] = 1;
    }
  }
}

/**
 * A white silhouette of `img` grown by `radius` pixels, with a soft one-pixel
 * edge, padded so it fits: the hover rim light. Returns the image and how far
 * it grew on each side.
 */
export function rimOf(img: Rgba, radius: number): Rgba {
  const pad = Math.ceil(radius) + 1;
  const w = img.w + pad * 2;
  const h = img.h + pad * 2;
  const INF = 1e9;
  // Distance (in pixels) to the nearest solid pixel: a two-pass chamfer transform.
  const d = new Float64Array(w * h).fill(INF);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3]! >= 128) d[(y + pad) * w + x + pad] = 0;
  const A = 1;
  const B = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + A);
      if (y > 0) {
        v = Math.min(v, d[i - w]! + A);
        if (x > 0) v = Math.min(v, d[i - w - 1]! + B);
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + B);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + A);
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + A);
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + B);
        if (x > 0) v = Math.min(v, d[i + w - 1]! + B);
      }
      d[i] = v;
    }
  const out = blank(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(1, radius + 1 - d[i]!));
    if (a <= 0) continue;
    out.data[i * 4] = 255;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
    out.data[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Mean HSV saturation of the mostly opaque pixels (for the tint-layer check). */
export function meanSaturation(img: Rgba): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3]! < 200) continue;
    const r = img.data[i * 4]!;
    const g = img.data[i * 4 + 1]!;
    const b = img.data[i * 4 + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sum += max === 0 ? 0 : (max - min) / max;
    n++;
  }
  return n ? sum / n : 0;
}

/** How many pixels have alpha above `min`. */
export function countOpaque(img: Rgba, min = 0): number {
  let n = 0;
  for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3]! > min) n++;
  return n;
}

/** A downscaled copy no bigger than `max` a side (for thumbnails). */
export function fitWithin(img: Rgba, max: number): Rgba {
  let out = img;
  while (out.w > max || out.h > max) out = halve(out);
  return out;
}
