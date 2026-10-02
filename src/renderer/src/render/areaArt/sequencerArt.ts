import type { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { SeqLayout, SequencerState } from '../../../../game/systems/sequencer';
import { SEQ_COLS, SEQ_ROWS, THEME, isEmpty, isOn, playingRows } from '../../../../game/systems/sequencer';
import { darken, lighten, stroke } from '../palette';
import { soft } from './common';

/**
 * The mushroom sequencer (M9, game design doc section 10): a bank of soil
 * with eight columns and six rows of mushrooms, a little glowing beetle
 * hopping along the top as the playhead, a mute tuft at the start of each
 * row, the clear stone on the left, the snail-shell speed knob on the right,
 * and the A/B seed on top.
 */

const PPM = PIXELS_PER_METER;

/** Each row's cap color, top to bottom: four melody rows, the bass, the drum. */
export const ROW_COLORS: readonly number[] = [0xff5a6e, 0xff9f43, 0xffd23f, 0x7bd66b, 0x4d9cff, 0xa77bff];

const SOIL = 0x6b4a33;
const SOIL_DARK = 0x4a3324;

/**
 * How a cap looks: its radius as a share of a cell, and its squash (1 is
 * round). An active cap is big and bright; it bounces with a squash when
 * its step plays (`hit` runs 1 to 0 over the step).
 */
export function capLook(on: boolean, hit: number): { r: number; squash: number; bright: number } {
  if (!on) return { r: 0.2, squash: 1, bright: 0.55 };
  const k = Math.max(0, Math.min(1, hit));
  return { r: 0.4 + k * 0.06, squash: 1 - k * 0.3, bright: 0 };
}

export interface SequencerLook {
  layout: SeqLayout;
  state: SequencerState;
  /** The playhead column, or -1 when silent. */
  column: number;
  /** How far through the current step, 0 to 1 (for the bounce). */
  stepPhase: number;
  /** World time, seconds. */
  time: number;
  /** The ground's y under the bank, world pixels. */
  groundY: number;
  /** The clear stone was clicked once: how much it still wobbles, 0 to 1. */
  wobble: number;
  /** Night: the caps glow a little. */
  dark: boolean;
}

export function drawSequencer(g: Graphics, look: SequencerLook): void {
  const { layout: l, state } = look;
  const c = l.cell * PPM;
  const x0 = l.x0 * PPM;
  const y0 = l.y0 * PPM;
  const w = SEQ_COLS * c;
  const left = l.stone.x * PPM - c * 0.9;
  const right = l.knob.x * PPM + c * 0.9;
  // The soil bank, in terraces.
  g.moveTo(left, look.groundY)
    .lineTo(left + c * 0.4, y0 - c * 0.15)
    .quadraticCurveTo((left + right) / 2, y0 - c * 0.55, right - c * 0.4, y0 - c * 0.15)
    .lineTo(right, look.groundY)
    .closePath()
    .fill(SOIL)
    .stroke(stroke(4));
  for (let r = 1; r <= SEQ_ROWS; r++) {
    const y = y0 + r * c - c * 0.1;
    g.moveTo(x0 - c * 1.1, y)
      .lineTo(x0 + w + c * 0.2, y)
      .stroke({ width: 3, color: SOIL_DARK, alpha: 0.7, cap: 'round' });
  }
  const rows = playingRows(state);
  const mine = !isEmpty(state.patterns[state.current]);
  for (let row = 0; row < SEQ_ROWS; row++) {
    const muted = state.mutes[row] ?? false;
    const color = ROW_COLORS[row]!;
    // The mute tuft: upright and green, or wilted and brown when the row is muted.
    const tx = l.tuftX * PPM;
    const ty = y0 + (row + 1) * c - c * 0.12;
    for (let k = -1; k <= 1; k++) {
      const lean = muted ? 0.9 + k * 0.3 : k * 0.35;
      g.moveTo(tx + k * 4, ty)
        .quadraticCurveTo(
          tx + k * 6 + lean * c * 0.2,
          ty - c * 0.35,
          tx + k * 4 + lean * c * 0.45,
          ty - c * (muted ? 0.3 : 0.62),
        )
        .stroke({ width: 4, color: muted ? 0x9a7a4a : 0x5fae4a, cap: 'round' });
    }
    for (let col = 0; col < SEQ_COLS; col++) {
      const on = isOn(rows, row, col);
      const playing = look.column === col && on && !muted;
      const cap = capLook(on, playing ? 1 - look.stepPhase : 0);
      const cx = x0 + (col + 0.5) * c;
      const base = y0 + (row + 1) * c - c * 0.12;
      const stemH = c * (on ? 0.42 : 0.3);
      // Stem.
      g.roundRect(cx - c * 0.07, base - stemH, c * 0.14, stemH, 3)
        .fill(0xfff1dc)
        .stroke(soft(2, 0.6));
      // Cap.
      const r = cap.r * c;
      const capColor = muted ? mixGray(color) : on ? color : lighten(color, cap.bright);
      const cy = base - stemH;
      g.ellipse(cx, cy, r, r * 0.62 * cap.squash)
        .fill(on && look.dark ? lighten(capColor, 0.2) : capColor)
        .stroke(stroke(on ? 3 : 2));
      if (on) {
        // Spots, and a shine.
        g.circle(cx - r * 0.35, cy - r * 0.15 * cap.squash, r * 0.14).fill({ color: 0xffffff, alpha: 0.85 });
        g.circle(cx + r * 0.3, cy - r * 0.25 * cap.squash, r * 0.1).fill({ color: 0xffffff, alpha: 0.85 });
        // A bug's pattern on an empty grid shows a little paler: it is not the player's.
        if (!mine) g.ellipse(cx, cy, r, r * 0.62 * cap.squash).fill({ color: 0xffffff, alpha: 0.25 });
      }
    }
  }
  // The beetle playhead, hopping from column to column along the top.
  if (look.column >= 0) {
    const bx = x0 + (look.column + 0.5) * c;
    const hop = Math.sin(Math.min(1, look.stepPhase) * Math.PI) * c * 0.25;
    const by = y0 - c * 0.28 - hop;
    g.ellipse(bx, by, c * 0.2, c * 0.15)
      .fill(0x2fd0a0)
      .stroke(stroke(2.5));
    g.moveTo(bx, by - c * 0.15)
      .lineTo(bx, by + c * 0.15)
      .stroke({ width: 1.5, color: darken(0x2fd0a0, 0.5) });
    g.circle(bx + c * 0.2, by - c * 0.02, c * 0.07).fill(0x203040);
    g.circle(bx, by, c * 0.32).fill({ color: 0xbfffe8, alpha: 0.18 });
  }
  // The clear stone: wobbles after its first click as a warning.
  const st = l.stone;
  const wob = Math.sin(look.time * 30) * look.wobble * 0.25;
  g.ellipse(st.x * PPM + wob * 20, st.y * PPM, st.r * PPM, st.r * PPM * 0.72)
    .fill(0x9ea3ad)
    .stroke(stroke(3));
  g.ellipse(
    st.x * PPM - st.r * PPM * 0.3 + wob * 20,
    st.y * PPM - st.r * PPM * 0.3,
    st.r * PPM * 0.3,
    st.r * PPM * 0.15,
  ).fill({
    color: 0xffffff,
    alpha: 0.5,
  });
  // The snail-shell knob: a spiral, turned round and glowing when fast.
  const kn = l.knob;
  const kx = kn.x * PPM;
  const ky = kn.y * PPM;
  const kr = kn.r * PPM;
  g.circle(kx, ky, kr)
    .fill(state.fast ? 0xffc46b : 0xe0a96d)
    .stroke(stroke(3));
  const turn = state.fast ? look.time * 3 : 0;
  g.moveTo(kx, ky);
  for (let i = 0; i <= 24; i++) {
    const a = turn + i * 0.45;
    const rr = (i / 24) * kr * 0.85;
    g.lineTo(kx + Math.cos(a) * rr, ky + Math.sin(a) * rr);
  }
  g.stroke({ width: 2.5, color: darken(0xe0a96d, 0.45), cap: 'round' });
  // The seed on top: one dot for pattern A, two for B.
  const sd = l.seed;
  const sx = sd.x * PPM;
  const sy = sd.y * PPM;
  g.ellipse(sx, sy, sd.r * PPM * 0.8, sd.r * PPM * 1.05)
    .fill(0xc98a3a)
    .stroke(stroke(3));
  for (let i = 0; i <= state.current; i++)
    g.circle(sx + (state.current === 0 ? 0 : (i - 0.5) * sd.r * PPM * 0.6), sy, sd.r * PPM * 0.18).fill(
      0xfff1dc,
    );
}

function mixGray(c: number): number {
  return lighten(darken(c, 0.35), 0.35);
}

/**
 * The theme, chalked as dots on the flowerpot stage's front (the hint for
 * `secret_sequencer_song`): eight columns, four rows, the theme's notes big.
 */
export function drawThemeChalk(g: Graphics, cx: number, cy: number, spacing: number): void {
  for (let row = 0; row < THEME.length; row++)
    for (let col = 0; col < SEQ_COLS; col++) {
      const lit = THEME[row]!.includes(col);
      g.circle(
        cx + (col - 3.5) * spacing,
        cy + (row - 1.5) * spacing,
        lit ? spacing * 0.28 : spacing * 0.1,
      ).fill({
        color: 0xfffaf0,
        alpha: lit ? 0.75 : 0.35,
      });
    }
}
