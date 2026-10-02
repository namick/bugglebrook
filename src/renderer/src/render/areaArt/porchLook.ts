/**
 * How the porch's light behaves (pure, for tests): where the gaps between
 * the boards are, how sunlight slants through them over the day, and how
 * far the lamp's warm pool reaches at night (R03, R19).
 */

/** Board widths in px, repeated along the porch. */
const WIDTHS = [182, 150, 212, 166, 196, 226, 172, 204] as const;

/**
 * The x of every gap between the porch boards (world px), left to right.
 * The floor gaps things drop through (`fixed`) are always among them.
 */
export function boardGaps(x0: number, x1: number, fixed: readonly number[] = []): number[] {
  const anchors = [x0, ...fixed.filter((p) => p > x0 && p < x1).sort((a, b) => a - b), x1];
  const out: number[] = [];
  let k = 0;
  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1]!;
    const to = anchors[i]!;
    // Boards of the usual widths, stretched a little to fit exactly between the anchors.
    const widths: number[] = [];
    let total = 0;
    while (total < to - from - 100) {
      const w = WIDTHS[k++ % WIDTHS.length]!;
      widths.push(w);
      total += w;
    }
    if (widths.length === 0) widths.push(to - from);
    const scale = (to - from) / widths.reduce((a, b) => a + b, 0);
    let x = from;
    for (const w of widths.slice(0, -1)) {
      x += w * scale;
      out.push(x);
    }
    if (i < anchors.length - 1) out.push(to);
  }
  return out;
}

/**
 * How far a sunbeam through the boards leans sideways for each px it falls,
 * by the hour: right in the morning (the sun in the east), straight at about
 * one, left in the evening.
 */
export function shaftSlant(hour: number): number {
  const t = Math.max(-1, Math.min(1, (13 - hour) / 6));
  return t * 0.42;
}

/**
 * How bright the beams are by the hour (0 to 1), before the weather dims
 * them: none at night, warming up after sunrise and fading at sunset.
 */
export function shaftStrength(hour: number): number {
  const up = Math.min(1, Math.max(0, (hour - 6) / 2));
  const down = Math.min(1, Math.max(0, (19.5 - hour) / 2));
  return Math.min(up, down);
}

/**
 * The lamp's pool of light for this much night (`glow`, 0 by day to 1 at
 * night): its radius in px and strength. By day it is a small warm glow; at
 * night it is the room's main light and reaches well past the bench.
 */
export function lampPool(glow: number): { radius: number; alpha: number } {
  const g = Math.max(0, Math.min(1, glow));
  return { radius: 380 + g * 520, alpha: 0.12 + g * 0.3 };
}
