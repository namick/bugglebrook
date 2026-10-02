import type { RigFile } from '../../src/renderer/src/art/rigFile';
import type { WriteNode } from '../../scripts/art/ora.ts';
import { writeOra } from '../../scripts/art/ora.ts';
import type { Rgba } from '../../scripts/art/png.ts';
import { blank, encodePng } from '../../scripts/art/png.ts';

/** A small rig for pipeline tests: 64 x 64 at 4x, origin in the middle. */
export function testRig(): RigFile {
  return {
    schema: 1,
    id: 'bug_test',
    kind: 'bug',
    title: 'Testy',
    canvas: { w: 64, h: 64 },
    scale: 4,
    origin: { x: 32, y: 32 },
    safe: { x0: 4, y0: 4, x1: 60, y1: 60 },
    ground: 48,
    rigHash: 'abc123',
    parts: [
      {
        name: 'leg_upper',
        kind: 'limb_upper',
        pivot: { x: 40, y: 40 },
        length: 8,
        required: true,
        note: 'A leg.',
      },
      { name: 'body', kind: 'static', pivot: { x: 32, y: 32 }, required: true, note: 'The body.' },
      {
        name: 'shell_tint',
        kind: 'static',
        pivot: { x: 28, y: 28 },
        required: true,
        tintable: true,
        note: 'Shell.',
      },
      {
        name: 'antenna',
        kind: 'rope',
        pivot: { x: 44, y: 24 },
        length: 12,
        required: true,
        note: 'A feeler.',
      },
      { name: 'shine', kind: 'static', pivot: { x: 30, y: 26 }, required: false, note: 'Shine.' },
    ],
    face: ['mouth_smile'],
    faceAnchors: { eye: { x: 44, y: 30, r: 4 }, mouth: { x: 44, y: 36, s: 8 } },
  };
}

/** A filled rectangle (straight alpha) on a transparent image. */
export function rect(
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  rgba: number[],
): Rgba {
  const img = blank(w, h);
  for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) img.data.set(rgba, (j * w + i) * 4);
  return img;
}

export const png = (img: Rgba): Uint8Array => encodePng(img);
export const EMPTY = (): Uint8Array => encodePng(blank(1, 1));

/** A layer from an image, cropped tight the way Krita saves it (x and y offsets). */
export function layer(name: string, img: Rgba, extra: Partial<WriteNode> = {}): WriteNode {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3]! > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { name, png: EMPTY(), x: 0, y: 0, ...extra } as WriteNode;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = blank(w, h);
  for (let y = 0; y < h; y++)
    out.data.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4), y * w * 4);
  return { name, png: encodePng(out), x: x0, y: y0, ...extra } as WriteNode;
}

/** An ORA with a guides group, a parts group, and a face group. */
export function oraOf(
  parts: WriteNode[],
  opts: { w?: number; h?: number; face?: WriteNode[]; top?: WriteNode[]; rigHash?: string } = {},
): Uint8Array {
  const w = opts.w ?? 64;
  const h = opts.h ?? 64;
  return writeOra({
    w,
    h,
    stack: [
      ...(opts.top ?? []),
      {
        name: 'guides',
        locked: true,
        children: [
          { name: 'guide_notes', png: EMPTY() },
          { name: `guide_rig_${opts.rigHash ?? 'abc123'}`, png: EMPTY(), visible: false },
        ],
      },
      { name: 'parts', children: parts },
      { name: 'face', children: opts.face ?? [] },
    ],
    merged: encodePng(blank(w, h)),
    thumbnail: encodePng(blank(Math.min(w, 256), Math.min(h, 256))),
  });
}

/** Every required part of the test rig, drawn simply and in the right places. */
export function goodParts(): WriteNode[] {
  return [
    layer('antenna', rect(64, 64, 42, 12, 4, 12, [40, 30, 50, 255])),
    layer('shine', rect(64, 64, 28, 24, 4, 4, [255, 255, 255, 255])),
    layer('shell_tint', rect(64, 64, 20, 20, 16, 12, [200, 200, 200, 255])),
    layer('body', rect(64, 64, 22, 26, 20, 16, [230, 70, 60, 255])),
    layer('leg_upper', rect(64, 64, 38, 40, 4, 8, [40, 30, 50, 255])),
  ];
}
