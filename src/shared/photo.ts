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

/** The most text main will accept for one photo: a 1920x1080 PNG, base64, with room to spare. */
export const MAX_PHOTO_CHARS = 24_000_000;

export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

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
 * The base64 payload of a PNG data URL, or null if `raw` is not a string
 * with the PNG prefix, is too long, or holds anything but base64.
 */
export function pngBase64(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_PHOTO_CHARS) return null;
  if (!raw.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const data = raw.slice(PNG_DATA_URL_PREFIX.length);
  if (data.length < 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  return data;
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
