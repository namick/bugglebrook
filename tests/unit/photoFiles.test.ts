import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PhotoStore } from '../../src/main/photoStore';
import {
  MAX_PHOTO_BYTES,
  PNG_SIGNATURE,
  isPng,
  photoFileName,
  photoPng,
  pngSize,
  uniquePhotoName,
} from '../../src/shared/photo';

// M11, photo mode (game design doc, section 14): the photo's file. The
// name, what main accepts over IPC, and the store that writes it.

/** The first 40 bytes of a PNG: the signature and an IHDR chunk with a size. */
const png = (w = 1920, h = 1080): Buffer => {
  const b = Buffer.alloc(40);
  Buffer.from(PNG_SIGNATURE).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

describe('photo file names', () => {
  it('names photos by local time, with a counter for a second photo in the same second', () => {
    const when = new Date(2026, 9, 1, 14, 5, 9);
    expect(photoFileName(when)).toBe('bugglebrook-20261001-140509.png');
    expect(photoFileName(new Date(2026, 0, 31, 0, 0, 0))).toBe('bugglebrook-20260131-000000.png');
    const taken = new Set(['bugglebrook-20261001-140509.png', 'bugglebrook-20261001-140509-2.png']);
    expect(uniquePhotoName('bugglebrook-20261001-140509.png', (n) => taken.has(n))).toBe(
      'bugglebrook-20261001-140509-3.png',
    );
    expect(uniquePhotoName('bugglebrook-20261001-140510.png', (n) => taken.has(n))).toBe(
      'bugglebrook-20261001-140510.png',
    );
  });
});

describe('what main accepts over IPC', () => {
  it('accepts only the bytes of a 1920x1080 PNG of a sane length (P-29), and reads its size', () => {
    expect(photoPng(png())).toEqual(png());
    expect(photoPng(new Uint8Array(png()))).not.toBeNull();
    expect(photoPng(undefined)).toBeNull();
    expect(photoPng(42)).toBeNull();
    expect(photoPng('data:image/png;base64,AAAA')).toBeNull();
    expect(photoPng([...png()])).toBeNull();
    expect(photoPng(Buffer.from('GIF89a..........................'))).toBeNull();
    // A PNG of any other size is refused: a huge one could eat the disk or a viewer's memory.
    expect(photoPng(png(1920, 1081))).toBeNull();
    expect(photoPng(png(100_000, 100_000))).toBeNull();
    const huge = Buffer.alloc(MAX_PHOTO_BYTES + 1);
    png().copy(huge);
    expect(photoPng(huge)).toBeNull();
    expect(isPng(png())).toBe(true);
    expect(isPng(Buffer.from('GIF89a..........'))).toBe(false);
    expect(pngSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(pngSize(png(320, 180))).toEqual({ width: 320, height: 180 });
    expect(pngSize(Buffer.alloc(4))).toBeNull();
  });
});

describe('PhotoStore (main process)', () => {
  it('writes photos to the folder, never two with one name, and refuses anything else', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-photos-'));
    try {
      const store = new PhotoStore(join(dir, 'Bugglebrook'));
      const when = new Date(2026, 9, 1, 9, 30, 0);
      const first = await store.save(png(), when);
      const second = await store.save(png(), when);
      expect(first).toBe(join(dir, 'Bugglebrook', 'bugglebrook-20261001-093000.png'));
      expect(second).toBe(join(dir, 'Bugglebrook', 'bugglebrook-20261001-093000-2.png'));
      expect(pngSize(readFileSync(first))).toEqual({ width: 1920, height: 1080 });
      expect(readdirSync(join(dir, 'Bugglebrook')).sort()).toEqual([
        'bugglebrook-20261001-093000-2.png',
        'bugglebrook-20261001-093000.png',
      ]);
      await expect(store.save(Buffer.from('not a png at all, not even close'))).rejects.toThrow(
        /1920x1080 PNG/,
      );
      await expect(store.save({ png: png() })).rejects.toThrow(/1920x1080 PNG/);
      await expect(store.save(png(4000, 4000))).rejects.toThrow(/1920x1080 PNG/);
      // Nothing half-written is left behind.
      expect(readdirSync(join(dir, 'Bugglebrook')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
