/**
 * Photo files (game design doc, section 14). Main and the renderer both use
 * this module, so it stays free of Node and DOM: the renderer names and
 * checks a photo before sending it, and main checks it again on arrival.
 */

/** Photos are 1920x1080 (the zoomed region is upscaled to that size). */
export const PHOTO_WIDTH = 1920;
export const PHOTO_HEIGHT = 1080;

/** Photo thumbnails in the save are 320x180. */
export const PHOTO_THUMB_WIDTH = 320;

/** The most bytes main will accept for one photo's PNG. */
export const MAX_PHOTO_BYTES = 18_000_000;

/** The eight bytes every PNG starts with. */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * `bugglebrook-YYYYMMDD-HHMMSS.png`, in the machine's local time, so the
 * files sort by when they were taken in the player's Pictures folder.
 */
export function photoFileName(when: Date): string {
  const d = `${when.getFullYear()}${two(when.getMonth() + 1)}${two(when.getDate())}`;
  const t = `${two(when.getHours())}${two(when.getMinutes())}${two(when.getSeconds())}`;
  return `bugglebrook-${d}-${t}.png`;
}

/**
 * The next free name when `taken` already has this one: the second photo in
 * a second is `...-HHMMSS-2.png`, then `-3`, and so on.
 */
export function uniquePhotoName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const stem = name.replace(/\.png$/, '');
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}.png`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * A photo's PNG bytes as main accepts them over IPC: a byte array of a sane
 * length that starts like a PNG and says it is 1920x1080. Null otherwise.
 */
export function photoPng(raw: unknown): Uint8Array | null {
  if (!(raw instanceof Uint8Array) || raw.length < 24 || raw.length > MAX_PHOTO_BYTES) return null;
  const size = pngSize(raw);
  if (!size || size.width !== PHOTO_WIDTH || size.height !== PHOTO_HEIGHT) return null;
  return raw;
}

/** Do these bytes start like a PNG? */
export function isPng(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** The size written in a PNG's first chunk (IHDR), or null if the bytes are not a PNG. */
export function pngSize(bytes: ArrayLike<number>): { width: number; height: number } | null {
  if (!isPng(bytes) || bytes.length < 24) return null;
  const be = (i: number): number =>
    ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
  return { width: be(16), height: be(20) };
}
