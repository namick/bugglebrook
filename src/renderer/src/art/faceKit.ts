import type { EyeShape, MouthShape } from '../render/bugFace';
import type { Look } from '../render/draw/face';
import type { EyeSpot, FacePlacement } from '../render/rig/bugRig';
import type { KitPiece } from './kit';

/**
 * Which face kit pieces show for each eye and mouth shape, and where: the
 * same choices and motion as `drawEye` and `drawMouth`, as sprites. Pure.
 */

/** One kit piece to show, in rig pixels. */
export interface FacePiece {
  name: KitPiece;
  x: number;
  y: number;
  /** What it should match: an eye's radius, or a mouth's width. The kit's own size maps to this. */
  size: number;
  /** Extra scale on top of `size`. */
  sx: number;
  sy: number;
  rotation: number;
  /** Color the piece (tint layers), or null. */
  tint: number | null;
  alpha: number;
}

/** The kit pieces each eye shape is made of (open eyes add a pupil). */
export const EYE_PIECES: Record<EyeShape, readonly KitPiece[]> = {
  open: ['eye_white', 'eye_pupil'],
  wide: ['eye_white', 'eye_pupil'],
  sleepy: ['eye_white', 'eye_pupil', 'eye_sleepy_lid'],
  angry: ['eye_white', 'eye_pupil', 'brow_angry'],
  worried: ['eye_white', 'eye_pupil', 'brow_worried'],
  happy: ['eye_happy'],
  squint: ['eye_squint'],
  x: ['eye_squeezed'],
  spiral: ['eye_white', 'eye_spiral'],
  heart: ['eye_heart'],
};

/** The kit layers each mouth shape is drawn from (two for the ones that animate). */
export const MOUTH_PIECES: Record<MouthShape, readonly KitPiece[]> = {
  smile: ['mouth_smile'],
  grin: ['mouth_grin'],
  o: ['mouth_o'],
  whee: ['mouth_whee'],
  aah: ['mouth_aah'],
  chew: ['mouth_chew_1', 'mouth_chew_2'],
  wobble: ['mouth_wobble_1', 'mouth_wobble_2'],
  flat: ['mouth_flat'],
  frown: ['mouth_frown'],
  lick: ['mouth_lick'],
  tongue: ['mouth_tongue'],
  teeth: ['mouth_teeth'],
  puff: ['mouth_puff'],
};

const piece = (
  name: KitPiece,
  x: number,
  y: number,
  size: number,
  extra: Partial<FacePiece> = {},
): FacePiece => ({
  name,
  x,
  y,
  size,
  sx: 1,
  sy: 1,
  rotation: 0,
  tint: null,
  alpha: 1,
  ...extra,
});

/** Eyes that stay as they are even when the bug blinks. */
const NO_BLINK: ReadonlySet<EyeShape> = new Set(['spiral', 'heart', 'x']);

/** An eye's pieces this frame: blinking shuts it, open eyes follow `look`, hearts beat, spirals spin. */
export function eyePieces(e: EyeSpot, look: Look, open: number, time: number): FacePiece[] {
  const { x, y, r } = e;
  if (open < 0.35 && !NO_BLINK.has(e.shape)) return [piece('eye_closed', x, y, r)];
  switch (e.shape) {
    case 'happy':
      return [piece('eye_happy', x, y, r)];
    case 'squint':
      return [piece('eye_squint', x, y, r)];
    case 'x':
      return [piece('eye_squeezed', x, y, r)];
    case 'spiral':
      return [piece('eye_white', x, y, r), piece('eye_spiral', x, y, r, { rotation: time * 9 })];
    case 'heart': {
      const beat = 1 + 0.12 * Math.max(0, Math.sin(time * 14));
      return [piece('eye_heart', x, y, r, { sx: beat, sy: beat })];
    }
    default:
      break;
  }
  const er = e.shape === 'wide' ? r * 1.12 : r;
  const lid = Math.min(1, open);
  const pr = e.shape === 'wide' ? er * 0.36 : er * 0.52;
  const reach = er - pr - er * 0.08;
  const out = [
    piece('eye_white', x, y, er, { sy: lid }),
    piece('eye_pupil', x + look.x * reach, y + look.y * reach * lid, er, {
      sx: pr / (er * 0.52),
      sy: pr / (er * 0.52),
    }),
  ];
  if (e.shape === 'sleepy') out.push(piece('eye_sleepy_lid', x, y, er, { tint: e.lid }));
  if (e.shape === 'angry') out.push(piece('brow_angry', x, y, er));
  if (e.shape === 'worried') out.push(piece('brow_worried', x, y, er));
  return out;
}

/** A mouth's piece this frame: chewing and wobbling swap drawings at 8 Hz, an open "aah" pulses. */
export function mouthPiece(m: NonNullable<FacePlacement['mouth']>, time: number): FacePiece {
  const pieces = MOUTH_PIECES[m.shape];
  const name = pieces[pieces.length > 1 ? Math.floor(time * 8) % 2 : 0]!;
  const k = m.shape === 'aah' ? 1 + 0.08 * Math.sin(time * 10) : 1;
  return piece(name, m.x, m.y, m.s, { sx: k, sy: k });
}

/** The cheek blush: the kit's cheek is drawn half an eye wide. */
export function cheekPiece(c: NonNullable<FacePlacement['cheek']>): FacePiece {
  return piece('cheek', c.x, c.y, c.r * 2, { alpha: c.alpha });
}

/** Whether a piece is sized like an eye (radius) or like a mouth (width). */
export const isMouth = (name: string): boolean => name.startsWith('mouth_');
