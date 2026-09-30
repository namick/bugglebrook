import { Container, Graphics } from 'pixi.js';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';

/**
 * The "Bugglebrook" logo (game design doc, section 17): letters made of
 * twigs and leaves, with snail shells for the o's. It is the only big text
 * in the game, and it is art: every stroke is drawn here in code. Letters
 * drop in one by one, then bob.
 */

type Pt = [number, number];
/** A letter is strokes (polylines in em units: x right, y down, 0 at the x-height, 1 at the baseline). */
interface Glyph {
  width: number;
  strokes: Pt[][];
  /** Stroke ends that sprout a leaf: [stroke index, 0 for start or 1 for end, leaf angle]. */
  leaves?: [number, 0 | 1, number][];
  /** A snail shell instead of strokes. */
  shell?: boolean;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });

const PI = Math.PI;

const GLYPHS: Record<string, Glyph> = {
  B: {
    width: 0.78,
    strokes: [
      [
        [0.06, -0.62],
        [0.06, 1],
      ],
      [[0.06, -0.62], ...arc(0.3, -0.24, 0.3, 0.38, -PI / 2, PI / 2), [0.06, 0.14]],
      [[0.06, 0.14], ...arc(0.36, 0.57, 0.36, 0.43, -PI / 2, PI / 2), [0.06, 1]],
    ],
    leaves: [[0, 0, -2.3]],
  },
  u: {
    width: 0.66,
    strokes: [
      [[0.04, 0], [0.04, 0.62], ...arc(0.3, 0.62, 0.26, 0.38, PI, 0).slice(1), [0.56, 0]],
      [
        [0.56, 0],
        [0.6, 1.02],
      ],
    ],
  },
  g: {
    width: 0.68,
    strokes: [
      arc(0.3, 0.46, 0.28, 0.44, 0, PI * 2, 20),
      [[0.58, 0.02], [0.6, 1.22], ...arc(0.33, 1.22, 0.27, 0.3, 0, PI * 0.95)],
    ],
    leaves: [[1, 0, -0.9]],
  },
  l: {
    width: 0.3,
    strokes: [[[0.1, -0.64], [0.1, 0.82], ...arc(0.22, 0.82, 0.12, 0.18, PI, PI * 0.35)]],
    leaves: [[0, 0, -2.0]],
  },
  e: {
    width: 0.64,
    strokes: [[[0.04, 0.48], [0.6, 0.48], ...arc(0.32, 0.48, 0.28, 0.46, 0, -PI * 1.72, 20)]],
  },
  b: {
    width: 0.7,
    strokes: [
      [
        [0.06, -0.64],
        [0.06, 1],
      ],
      arc(0.36, 0.55, 0.3, 0.45, 0, PI * 2, 20),
    ],
    leaves: [[0, 0, -1.0]],
  },
  r: {
    width: 0.52,
    strokes: [
      [
        [0.06, 0],
        [0.06, 1],
      ],
      [[0.06, 0.42], ...arc(0.34, 0.42, 0.28, 0.4, PI, PI * 1.62)],
    ],
    leaves: [[1, 1, -0.5]],
  },
  o: { width: 0.74, strokes: [], shell: true },
  k: {
    width: 0.62,
    strokes: [
      [
        [0.06, -0.64],
        [0.06, 1],
      ],
      [
        [0.52, -0.02],
        [0.08, 0.56],
      ],
      [
        [0.24, 0.4],
        [0.58, 1],
      ],
    ],
    leaves: [
      [0, 0, -2.4],
      [1, 0, -0.7],
    ],
  },
};

const TWIG = 0xa8703e;
const LEAF = 0x7bd84a;
const SHELL = 0xffb36b;

function polyline(g: Graphics, pts: readonly Pt[], em: number): Graphics {
  g.moveTo(pts[0]![0] * em, pts[0]![1] * em);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0] * em, pts[i]![1] * em);
  return g;
}

function drawLeaf(g: Graphics, x: number, y: number, angle: number, size: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tip = { x: x + c * size * 2.2, y: y + s * size * 2.2 };
  const nx = -s * size;
  const ny = c * size;
  const mx = (x + tip.x) / 2;
  const my = (y + tip.y) / 2;
  g.moveTo(x, y)
    .quadraticCurveTo(mx + nx, my + ny, tip.x, tip.y)
    .quadraticCurveTo(mx - nx, my - ny, x, y)
    .fill(LEAF)
    .stroke(stroke(4));
  g.moveTo(x, y)
    .lineTo(mx + (tip.x - mx) * 0.6, my + (tip.y - my) * 0.6)
    .stroke({ width: 2, color: 0x3f9a34 });
}

function drawGlyph(g: Graphics, glyph: Glyph, em: number): void {
  if (glyph.shell) {
    // A snail shell: a round spiral, with a pale lip.
    const r = em * 0.4;
    const cx = em * 0.37;
    const cy = em * 0.5;
    g.circle(cx, cy, r).fill(SHELL).stroke(stroke(7));
    let first = true;
    for (let i = 0; i <= 50; i++) {
      const a = (i / 50) * PI * 3.4 - PI / 2;
      const rr = r * (0.12 + (i / 50) * 0.78);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (first) g.moveTo(x, y);
      else g.lineTo(x, y);
      first = false;
    }
    g.stroke({ width: 6, color: darken(SHELL, 0.45), cap: 'round' });
    g.arc(cx, cy, r * 0.8, -2.6, -1.6).stroke({ width: 5, color: lighten(SHELL, 0.6), cap: 'round' });
    return;
  }
  // Outline, then the twig, then a pale stripe along it: a stick with bark.
  for (const s of glyph.strokes)
    polyline(g, s, em).stroke({ width: em * 0.2 + 12, color: OUTLINE, cap: 'round', join: 'round' });
  for (const s of glyph.strokes)
    polyline(g, s, em).stroke({ width: em * 0.2, color: TWIG, cap: 'round', join: 'round' });
  for (const s of glyph.strokes)
    polyline(
      g,
      s.map(([x, y]) => [x - 0.035, y - 0.03] as Pt),
      em,
    ).stroke({ width: em * 0.05, color: lighten(TWIG, 0.35), cap: 'round', join: 'round' });
  for (const [si, end, angle] of glyph.leaves ?? []) {
    const s = glyph.strokes[si]!;
    const p = end === 0 ? s[0]! : s[s.length - 1]!;
    drawLeaf(g, p[0] * em, p[1] * em, angle, em * 0.16);
  }
}

export class Logo extends Container {
  private readonly letters: {
    c: Container;
    baseX: number;
    delay: number;
    vy: number;
    y: number;
    landed: boolean;
  }[] = [];
  private time = 0;
  /** Letters drop in from above one by one; `true` shows them in place at once. */
  constructor(text = 'Bugglebrook', em = 104, settled = false) {
    super();
    let x = 0;
    const gap = em * 0.08;
    const chars = [...text];
    chars.forEach((ch, i) => {
      const glyph = GLYPHS[ch] ?? GLYPHS['o']!;
      const scale = ch === 'B' ? 1.22 : 1;
      const c = new Container();
      const g = new Graphics();
      drawGlyph(g, glyph, em * scale);
      // The big B sits on the same baseline.
      g.position.set(0, em * (1 - scale));
      c.addChild(g);
      c.pivot.set((glyph.width * em * scale) / 2, em * 0.5);
      this.addChild(c);
      this.letters.push({
        c,
        baseX: x + (glyph.width * em * scale) / 2,
        delay: i * 0.07,
        vy: 0,
        y: settled ? 0 : -700,
        landed: settled,
      });
      x += glyph.width * em * scale + gap;
    });
    const width = x - gap;
    for (const l of this.letters) l.baseX -= width / 2;
    this.update(0);
  }

  /** Give the letters a little hop (a click on the logo). */
  hop(): void {
    this.letters.forEach((l, i) => {
      if (l.landed) l.vy = -600 - (i % 3) * 80;
      l.landed = false;
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.letters.forEach((l, i) => {
      if (!l.landed && this.time >= l.delay) {
        l.vy += 3600 * dt;
        l.y += l.vy * dt;
        if (l.y >= 0) {
          l.y = 0;
          l.vy = Math.abs(l.vy) > 260 ? -l.vy * 0.38 : 0;
          if (l.vy === 0) l.landed = true;
        }
      }
      const bob = l.landed ? Math.sin(this.time * 2.1 + i * 0.6) * 6 : 0;
      const squash = l.landed ? 1 + Math.sin(this.time * 2.1 + i * 0.6 + 1.2) * 0.025 : 1;
      l.c.position.set(l.baseX, l.y + bob);
      l.c.scale.set(1 / squash, squash);
      l.c.rotation = l.landed ? Math.sin(this.time * 1.3 + i * 1.1) * 0.035 : 0;
    });
  }
}
