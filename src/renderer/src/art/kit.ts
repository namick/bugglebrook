// The face kit: every eye and mouth piece, drawn once in face_kit.ora and used
// on every bug (docs/06-art-guide.md, A3 and A4). No imports, so the Node
// scripts in scripts/art/ can load it directly.

export const FACE_KIT_ID = 'face_kit';

/** Eyes and brows, then mouths, in the kit's order. */
export const KIT_EYES = [
  'eye_white',
  'eye_pupil',
  'eye_closed',
  'eye_happy',
  'eye_squint',
  'eye_squeezed',
  'eye_spiral',
  'eye_heart',
  'eye_sleepy_lid',
  'brow_angry',
  'brow_worried',
  'brow_polite',
  'cheek',
] as const;

export const KIT_MOUTHS = [
  'mouth_smile',
  'mouth_grin',
  'mouth_o',
  'mouth_whee',
  'mouth_aah',
  'mouth_chew_1',
  'mouth_chew_2',
  'mouth_wobble_1',
  'mouth_wobble_2',
  'mouth_flat',
  'mouth_frown',
  'mouth_lick',
  'mouth_tongue',
  'mouth_teeth',
  'mouth_puff',
] as const;

export type KitPiece = (typeof KIT_EYES)[number] | (typeof KIT_MOUTHS)[number];

export const FACE_KIT: readonly KitPiece[] = [...KIT_EYES, ...KIT_MOUTHS];

/** Tintable kit pieces: drawn in greys and colored by the game. */
export const KIT_TINTABLE: ReadonlySet<string> = new Set(['eye_sleepy_lid']);

/** The kit's canvas, in template pixels (4 times game size). */
export const KIT_CANVAS = { w: 2048, h: 1024 } as const;
export const KIT_COLS = 7;
export const KIT_CELL = { w: 292, h: 256 } as const;

/** The eye white's radius in the kit, in template pixels. The game scales each eye by its radius over this. */
export const KIT_EYE_R = 96;
/** A mouth's width in the kit, in template pixels. The game scales each mouth by its width over this. */
export const KIT_MOUTH_W = 256;

/** The center of a kit piece's cell, in template pixels: the piece's pivot. */
export function kitCell(name: string): { x: number; y: number; col: number; row: number } {
  const i = FACE_KIT.indexOf(name as KitPiece);
  if (i < 0) throw new Error(`not a face kit piece: ${name}`);
  const col = i % KIT_COLS;
  const row = Math.floor(i / KIT_COLS);
  return { x: col * KIT_CELL.w + KIT_CELL.w / 2, y: row * KIT_CELL.h + KIT_CELL.h / 2, col, row };
}
