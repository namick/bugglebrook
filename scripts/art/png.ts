// PNG decode and encode, in plain TypeScript on top of fflate's zlib. The art
// importer needs exact pixels (no premultiply round trips through a canvas),
// deterministic output (same pixels, same bytes), and no display, so it runs
// in CI's lint job.

import { unzlibSync, zlibSync } from 'fflate';

/** Straight-alpha RGBA, 8 bits a channel, rows top to bottom. */
export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array;
}

/** What the file said about itself, for the importer's warnings. */
export interface PngInfo {
  bitDepth: number;
  colorType: number;
  /** An embedded ICC profile's name, if any (iCCP). */
  iccName: string | null;
  /** True when the file says it is sRGB (sRGB chunk), or says nothing (PNG's default). */
  srgb: boolean;
}

export const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class PngError extends Error {}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Decode any non-interlaced PNG (grey, RGB, palette, with or without alpha, 1 to 16 bits) to RGBA8. */
export function decodePng(bytes: Uint8Array): Rgba & { info: PngInfo } {
  if (!isPng(bytes)) throw new PngError('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  let iccName: string | null = null;
  let srgb = true;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const kind = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (body.length < len) throw new PngError('the file is cut short');
    if (kind === 'IHDR') {
      w = view.getUint32(pos + 8);
      h = view.getUint32(pos + 12);
      depth = body[8]!;
      type = body[9]!;
      interlace = body[12]!;
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'iCCP') {
      const nul = body.indexOf(0);
      iccName = new TextDecoder('latin1').decode(body.subarray(0, nul < 0 ? body.length : nul));
      srgb = /srgb/i.test(iccName);
    } else if (kind === 'sRGB') srgb = true;
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h) throw new PngError('no image header');
  if (interlace) throw new PngError('interlaced PNGs are not supported');
  const total = idat.reduce((n, c) => n + c.length, 0);
  const packed = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    packed.set(c, o);
    o += c.length;
  }
  const raw = unzlibSync(packed);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new PngError(`unknown color type ${type}`);
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  if (raw.length < h * (stride + 1)) throw new PngError('the pixel data is cut short');
  const cur = new Uint8Array(stride);
  let prev = new Uint8Array(stride);
  const out = new Uint8Array(w * h * 4);
  const sample = (row: Uint8Array, i: number): number => {
    if (depth === 8) return row[i]!;
    if (depth === 16) return row[i * 2]!; // high byte
    const per = 8 / depth;
    const byte = row[Math.floor(i / per)]!;
    const shift = (per - 1 - (i % per)) * depth;
    const v = (byte >> shift) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1);
    const filter = raw[at]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[at + 1 + i]!;
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new PngError(`bad filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      if (type === 6) {
        out[d] = sample(cur, x * 4);
        out[d + 1] = sample(cur, x * 4 + 1);
        out[d + 2] = sample(cur, x * 4 + 2);
        out[d + 3] = sample(cur, x * 4 + 3);
      } else if (type === 2) {
        out[d] = sample(cur, x * 3);
        out[d + 1] = sample(cur, x * 3 + 1);
        out[d + 2] = sample(cur, x * 3 + 2);
        out[d + 3] = 255;
        if (trns && depth === 8 && trns.length >= 6) {
          if (out[d] === trns[1] && out[d + 1] === trns[3] && out[d + 2] === trns[5]) out[d + 3] = 0;
        }
      } else if (type === 0 || type === 4) {
        const g = sample(cur, type === 4 ? x * 2 : x);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = type === 4 ? sample(cur, x * 2 + 1) : 255;
      } else {
        const idx = sample(cur, x);
        if (!palette || idx * 3 + 2 >= palette.length) throw new PngError('palette index out of range');
        out[d] = palette[idx * 3]!;
        out[d + 1] = palette[idx * 3 + 1]!;
        out[d + 2] = palette[idx * 3 + 2]!;
        out[d + 3] = trns && idx < trns.length ? trns[idx]! : 255;
      }
    }
    const t = prev;
    prev = cur.slice();
    cur.set(t);
  }
  return { w, h, data: out, info: { bitDepth: depth, colorType: type, iccName, srgb } };
}

/** One PNG chunk: length, type, body, CRC. */
export function pngChunk(kind: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = kind.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
  return out;
}

/**
 * Encode RGBA8 as a PNG: always color type 6, each row filtered with
 * whichever of the five filters gives the smallest sum (the usual
 * heuristic), compressed at zlib level 9. Same pixels, same bytes.
 */
export function encodePng(img: Rgba): Uint8Array {
  const { w, h, data } = img;
  const stride = w * 4;
  const filtered = new Uint8Array(h * (stride + 1));
  const zero = new Uint8Array(stride);
  const trial = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : zero;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4]! : 0;
        const b = prev[i]!;
        const c = i >= 4 ? prev[i - 4]! : 0;
        let p: number;
        if (f === 0) p = 0;
        else if (f === 1) p = a;
        else if (f === 2) p = b;
        else if (f === 3) p = (a + b) >> 1;
        else {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (row[i]! - p) & 0xff;
        trial[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        filtered[y * (stride + 1)] = f;
        filtered.set(trial, y * (stride + 1) + 1);
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(filtered, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A blank transparent image. */
export function blank(w: number, h: number): Rgba {
  return { w, h, data: new Uint8Array(w * h * 4) };
}
