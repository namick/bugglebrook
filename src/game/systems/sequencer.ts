import type { EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';

/**
 * The mushroom sequencer (game design doc, section 10, `fix_mushroom_sequencer`):
 * an 8-column, 6-row grid of mushrooms in a bank of soil in the flowerbed.
 * Rows 1 to 4 are melody notes (scale degrees 5, 3, 2, and 1 of the current
 * key, an octave up), row 5 the bass (the current chord's root), row 6 a drum
 * (a kick on odd steps, a snare on even ones). Each column is an 8th note, so
 * the grid is one bar.
 *
 * The sim keeps the patterns, the mutes, and the controls; the renderer's
 * music toys play it on the music clock. Everything here is pure grid logic
 * and layout, shared by the sim (clicks) and the renderer (drawing).
 */

export const SEQ_COLS = 8;
export const SEQ_ROWS = 6;
/** The melody rows' pentatonic degrees, top to bottom (degrees 5, 3, 2, 1 of the design, counted from 0). */
export const SEQ_MELODY = [4, 2, 1, 0] as const;
export const SEQ_BASS_ROW = 4;
export const SEQ_DRUM_ROW = 5;
/** The stone clears the grid on a second click within this long. */
export const CLEAR_WINDOW = 2 * SIM_HZ;

/** Rows as bit masks, bit `c` for column `c`. */
export type SeqRows = number[];

/** Plain JSON, saved in `world.places.sequencer`. */
export interface SequencerState {
  /** Patterns A and B. */
  patterns: [SeqRows, SeqRows];
  /** Which pattern plays and shows: 0 is A, 1 is B. */
  current: 0 | 1;
  /** Rows muted with their soil tuft. */
  mutes: boolean[];
  /** The snail-shell knob: 16th notes instead of 8ths. */
  fast: boolean;
  /** When the clear stone was first clicked (it wobbles), or -1. */
  clearArmed: number;
  /**
   * A bug hopping on the caps of an empty grid makes its own pattern here.
   * The player's patterns are never touched; this clears when the bug leaves.
   */
  bug: { id: EntityId; rows: SeqRows } | null;
}

export function emptyRows(): SeqRows {
  return new Array<number>(SEQ_ROWS).fill(0);
}

export function newSequencerState(): SequencerState {
  return {
    patterns: [emptyRows(), emptyRows()],
    current: 0,
    mutes: new Array<boolean>(SEQ_ROWS).fill(false),
    fast: false,
    clearArmed: -1,
    bug: null,
  };
}

export const isOn = (rows: SeqRows, row: number, col: number): boolean => ((rows[row] ?? 0) >> col) % 2 === 1;

export function setCell(rows: SeqRows, row: number, col: number, on: boolean): void {
  const bit = 1 << col;
  rows[row] = on ? (rows[row] ?? 0) | bit : (rows[row] ?? 0) & ~bit;
}

export function activeCount(rows: SeqRows): number {
  let n = 0;
  for (const r of rows) for (let c = 0; c < SEQ_COLS; c++) if ((r >> c) % 2 === 1) n++;
  return n;
}

export const isEmpty = (rows: SeqRows): boolean => rows.every((r) => r === 0);

/** The pattern that plays: the player's current one, or a bug's on an empty grid. */
export function playingRows(s: SequencerState): SeqRows {
  const mine = s.patterns[s.current];
  return isEmpty(mine) && s.bug ? s.bug.rows : mine;
}

/**
 * The Bugglebrook theme on the melody rows (drawn as dots on the stage's
 * backdrop): G E D C / C D E G over one bar, with the bass on 1 and 5.
 * Enter it and every bug sings along (`secret_sequencer_song`).
 */
export const THEME: readonly (readonly number[])[] = [
  // Row 0 (degree 4), row 1 (2), row 2 (1), row 3 (0): which columns.
  [0, 7],
  [1, 6],
  [2, 5],
  [3, 4],
];

export function themeRows(): SeqRows {
  const rows = emptyRows();
  THEME.forEach((cols, row) => cols.forEach((c) => setCell(rows, row, c, true)));
  return rows;
}

/** Do the melody rows match the theme (bass and drums may do anything)? */
export function isTheme(rows: SeqRows): boolean {
  const want = themeRows();
  return SEQ_MELODY.every((_d, row) => rows[row] === want[row]);
}

// --- Layout --------------------------------------------------------------------

/** The size of one mushroom cell, in meters. */
export const SEQ_CELL = 0.36;

export interface SeqLayout {
  /** The grid's top-left corner, world meters. */
  x0: number;
  y0: number;
  cell: number;
  /** Each row's mute tuft, left of column 0. */
  tuftX: number;
  stone: { x: number; y: number; r: number };
  knob: { x: number; y: number; r: number };
  seed: { x: number; y: number; r: number };
}

/** Where everything is, from the fixture's center (world meters). */
export function seqLayout(cx: number, cy: number): SeqLayout {
  const c = SEQ_CELL;
  const x0 = cx - (SEQ_COLS * c) / 2;
  const y0 = cy - (SEQ_ROWS * c) / 2;
  return {
    x0,
    y0,
    cell: c,
    tuftX: x0 - c * 0.7,
    stone: { x: x0 - c * 1.9, y: y0 + SEQ_ROWS * c - c * 0.4, r: c * 0.75 },
    knob: { x: x0 + SEQ_COLS * c + c * 0.9, y: cy, r: c * 0.75 },
    seed: { x: cx, y: y0 - c * 0.75, r: c * 0.6 },
  };
}

/** The center of a cell, world meters. */
export function cellCenter(l: SeqLayout, row: number, col: number): { x: number; y: number } {
  return { x: l.x0 + (col + 0.5) * l.cell, y: l.y0 + (row + 0.5) * l.cell };
}

export type SeqHit =
  | { kind: 'cap'; row: number; col: number }
  | { kind: 'tuft'; row: number }
  | { kind: 'stone' }
  | { kind: 'knob' }
  | { kind: 'seed' };

/** What a world point touches on the sequencer, or null. */
export function seqHit(l: SeqLayout, x: number, y: number): SeqHit | null {
  const near = (p: { x: number; y: number; r: number }): boolean => Math.hypot(x - p.x, y - p.y) <= p.r;
  if (near(l.stone)) return { kind: 'stone' };
  if (near(l.knob)) return { kind: 'knob' };
  if (near(l.seed)) return { kind: 'seed' };
  const row = Math.floor((y - l.y0) / l.cell);
  if (row < 0 || row >= SEQ_ROWS) return null;
  if (Math.abs(x - l.tuftX) <= l.cell * 0.45) return { kind: 'tuft', row };
  const col = Math.floor((x - l.x0) / l.cell);
  if (col < 0 || col >= SEQ_COLS) return null;
  return { kind: 'cap', row, col };
}

/** Is a saved sequencer state well formed? (Used by save validation.) */
export function sequencerProblems(s: unknown): string[] {
  if (typeof s !== 'object' || s === null) return ['sequencer is not an object'];
  const q = s as Record<string, unknown>;
  const rowsOk = (r: unknown): boolean =>
    Array.isArray(r) &&
    r.length === SEQ_ROWS &&
    r.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1 << SEQ_COLS);
  const errors: string[] = [];
  if (!Array.isArray(q.patterns) || q.patterns.length !== 2 || !q.patterns.every(rowsOk))
    errors.push('sequencer patterns are invalid');
  if (q.current !== 0 && q.current !== 1) errors.push('sequencer current must be 0 or 1');
  if (!Array.isArray(q.mutes) || q.mutes.length !== SEQ_ROWS || !q.mutes.every((m) => typeof m === 'boolean'))
    errors.push('sequencer mutes are invalid');
  if (typeof q.fast !== 'boolean') errors.push('sequencer fast must be a boolean');
  if (typeof q.clearArmed !== 'number') errors.push('sequencer clearArmed must be a number');
  const bug = q.bug as Record<string, unknown> | null;
  if (bug !== null && (typeof bug !== 'object' || typeof bug.id !== 'number' || !rowsOk(bug.rows)))
    errors.push('sequencer bug is invalid');
  return errors;
}
