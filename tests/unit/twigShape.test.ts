import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SRC_DIR } from '../../scripts/art/build.ts';
import { checkOne } from '../../scripts/art/checkOne.ts';
import type { OraNode, WriteNode } from '../../scripts/art/ora.ts';
import { readOra, writeOra } from '../../scripts/art/ora.ts';
import type { Rgba } from '../../scripts/art/png.ts';
import { blank, encodePng } from '../../scripts/art/png.ts';
import { setSource, sourceSets } from '../../scripts/art/sets.ts';
import { keep } from '../../scripts/art/template.ts';
import type { PartPixels } from '../../scripts/art/validate.ts';
import { analyze, stickFit } from '../../scripts/art/validate.ts';
import { PIXELS_PER_METER } from '../../src/game/constants';
import { CONTENT } from '../../src/game/data';
import type { RigFile } from '../../src/renderer/src/art/rigFile';
import type { Capsule } from '../../src/renderer/src/art/twigShape';
import {
  STICK_TOLERANCE,
  TWIG_SIZE,
  TWIG_STICK,
  outlineBox,
  outlineMask,
  twigOutline,
} from '../../src/renderer/src/art/twigShape';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import { OUTLINE } from '../../src/renderer/src/render/palette';
import { layer } from './artFixtures';

// Twig's `stick` is drawn as every loose twig in the world, so the importer
// holds it to the twig item's outline (art/twigShape.ts). Checked on the
// crude test Twig (tests/e2e/fixtures/art) with his stick repainted.

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const RIG = JSON.parse(readFileSync(join(FIX, `${TWIG_STICK.bug}.rig.json`), 'utf8')) as RigFile;
const CRUDE = new Uint8Array(readFileSync(join(FIX, `${TWIG_STICK.bug}.ora`)));
const PIVOT = RIG.parts.find((p) => p.name === TWIG_STICK.part)!.pivot;
const S = RIG.scale;
const WOOD = [139, 106, 69, 255];

/** A canvas-sized picture with every template pixel inside `shape` painted. `shape` is in game pixels from (cx, cy). */
function painted(shape: readonly Capsule[], cx = PIVOT.x, cy = PIVOT.y): Rgba {
  const { w, h } = RIG.canvas;
  const img = blank(w, h);
  const box = outlineBox(shape);
  // One bit per template pixel: the outline's own test, at `S` times the detail.
  const fine = shape.map((c) => ({ x0: c.x0 * S, y0: c.y0 * S, x1: c.x1 * S, y1: c.y1 * S, r: c.r * S }));
  const left = Math.floor(box.x0 * S);
  const top = Math.floor(box.y0 * S);
  const bw = Math.ceil(box.x1 * S) - left;
  const bh = Math.ceil(box.y1 * S) - top;
  const bits = outlineMask(fine, left, top, bw, bh);
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++)
      if (bits[j * bw + i]) img.data.set(WOOD, ((cy + top + j) * w + cx + left + i) * 4);
  return img;
}

/** A painting as the importer holds a part: trimmed, with where it sits. Whole-canvas here, which is as good. */
const pixels = (img: Rgba): PartPixels => ({ img, x: 0, y: 0 });

/** The twig with every capsule `by` game pixels fatter (or thinner). */
const grown = (by: number): Capsule[] => twigOutline().map((c) => ({ ...c, r: c.r + by }));

/** The crude Twig with another picture on his `stick` layer, and maybe a `pivots` group. */
function twigWith(stick: Rgba, top: WriteNode[] = []): Uint8Array {
  const doc = readOra(CRUDE);
  const swap = (n: OraNode): WriteNode =>
    n.name === TWIG_STICK.part
      ? layer(n.name, stick)
      : n.kind === 'stack'
        ? { ...keep(n, doc.files), children: n.children.map(swap) }
        : keep(n, doc.files);
  const { w, h } = RIG.canvas;
  return writeOra({
    w,
    h,
    stack: [...top, ...doc.root.children.map(swap)],
    merged: encodePng(blank(8, 8)),
    thumbnail: encodePng(blank(8, 8)),
  });
}

describe('the twig’s outline', () => {
  it('is the twig the game draws', () => {
    // Every dark line of the item's own drawing, as the capsule it covers.
    const drawn: Capsule[] = [];
    const walk = (c: Container): void => {
      if (c instanceof Graphics)
        for (const ins of c.context.instructions) {
          if (ins.action !== 'stroke') continue;
          const { style, path } = ins.data as {
            style: { color: number; width: number };
            path: { instructions: { action: string; data: number[] }[] };
          };
          if (style.color !== OUTLINE) continue;
          const steps = path.instructions;
          const box = steps.find((s) => s.action === 'roundRect');
          if (box) {
            const [x, y, w, h, r] = box.data as [number, number, number, number, number];
            // Ends rounded all the way: a stadium, which is a capsule along its middle.
            expect(r).toBe(h / 2);
            drawn.push({ x0: x + r, y0: y + h / 2, x1: x + w - r, y1: y + h / 2, r: r + style.width / 2 });
          } else {
            expect(steps.map((s) => s.action)).toEqual(['moveTo', 'lineTo']);
            const [a, b] = steps as [(typeof steps)[number], (typeof steps)[number]];
            drawn.push({
              x0: a.data[0]!,
              y0: a.data[1]!,
              x1: b.data[0]!,
              y1: b.data[1]!,
              r: style.width / 2,
            });
          }
        }
      c.children.forEach((ch) => walk(ch as Container));
    };
    const item = new ItemSprite(CONTENT.items.get('item_twig'), 0);
    walk(item);
    item.destroy({ children: true });
    const ours = twigOutline();
    // If this fails, the twig's drawing changed: bring art/twigShape.ts back in line with it.
    expect(drawn.length).toBe(ours.length);
    drawn.forEach((c, i) =>
      (Object.keys(c) as (keyof Capsule)[]).forEach((k) =>
        expect(c[k], `${i}.${k}`).toBeCloseTo(ours[i]![k], 6),
      ),
    );
  });

  it('is sized and named after the twig item and Twig’s stick', () => {
    const shape = CONTENT.items.get('item_twig').shape;
    expect(shape.type).toBe('box');
    if (shape.type !== 'box') return;
    expect(TWIG_SIZE.w).toBeCloseTo(shape.width * PIXELS_PER_METER, 9);
    expect(TWIG_SIZE.h).toBeCloseTo(shape.height * PIXELS_PER_METER, 9);
    expect(CONTENT.bugs.all.filter((b) => b.art === 'stickinsect').map((b) => b.id)).toEqual([
      TWIG_STICK.bug,
    ]);
    expect(RIG.parts.map((p) => p.name)).toContain(TWIG_STICK.part);
  });

  it('turns into a bitmap, one bit a game pixel', () => {
    const box = outlineBox(twigOutline());
    // The stick with half its line outside, and the taller of the two nubs.
    expect(box.x0).toBeCloseTo(-TWIG_SIZE.w / 2 - 2.25, 9);
    expect(box.x1).toBeCloseTo(TWIG_SIZE.w / 2 + 2.25, 9);
    expect(box.y1).toBeCloseTo(TWIG_SIZE.h / 2 + 2.25, 9);
    expect(box.y0).toBeCloseTo(-TWIG_SIZE.h * 1.3 - (TWIG_SIZE.h * 0.55) / 2, 9);
    const bits = outlineMask([{ x0: 2, y0: 2, x1: 5, y1: 2, r: 1 }], 0, 0, 8, 4);
    const rows = [0, 1, 2, 3].map((j) => [...bits.subarray(j * 8, j * 8 + 8)].join(''));
    expect(rows).toEqual(['00000000', '01111100', '01111100', '00000000']);
  });
});

describe('Twig’s stick against the twig', () => {
  it('fits when it is the twig’s own shape, and says how far off it is when it is not', () => {
    expect(stickFit(pixels(painted(twigOutline())), PIVOT, S)).toEqual({ outside: 0, empty: 0 });
    // Three game pixels fatter all round, or thinner: inside the tolerance.
    expect(stickFit(pixels(painted(grown(3))), PIVOT, S)).toEqual({ outside: 12, empty: 0 });
    expect(stickFit(pixels(painted(grown(-2.5))), PIVOT, S)).toEqual({ outside: 0, empty: 12 });
    // Six fatter: past it.
    expect(stickFit(pixels(painted(grown(6))), PIVOT, S).outside).toBe(24);
    // The whole picture 40 template pixels to one side: off both ways by as much.
    expect(stickFit(pixels(painted(twigOutline(), PIVOT.x + 40, PIVOT.y)), PIVOT, S)).toEqual({
      outside: 40,
      empty: 40,
    });
    // Nothing solid enough to count as drawn leaves the whole twig empty.
    const faint = painted(twigOutline());
    for (let i = 3; i < faint.data.length; i += 4) if (faint.data[i]) faint.data[i] = 20;
    expect(stickFit(pixels(faint), PIVOT, S)).toEqual({ outside: 0, empty: Infinity });
    expect(analyze(twigWith(faint), RIG).messages.map((m) => m.text)).toEqual([
      '"stick" has only faint marks on it, so the twig\'s shape is empty. Paint the twig on the guide at full strength: every loose twig in the world is drawn with this layer.',
    ]);
  });

  it('measures from the pivot the artist moved', () => {
    const moved = { x: PIVOT.x + 40, y: PIVOT.y - 24 };
    const stick = painted(twigOutline(), moved.x, moved.y);
    expect(stickFit(pixels(stick), moved, S)).toEqual({ outside: 0, empty: 0 });
    // In a file, the dot on `pivot_stick` moves it.
    const dot = blank(RIG.canvas.w, RIG.canvas.h);
    for (let y = -2; y < 2; y++)
      for (let x = -2; x < 2; x++) dot.data.set([255, 0, 0, 255], ((moved.y + y) * dot.w + moved.x + x) * 4);
    const plain = analyze(twigWith(stick), RIG);
    expect(plain.stick).toEqual({ outside: 40, empty: 40 });
    const a = analyze(twigWith(stick, [{ name: 'pivots', children: [layer('pivot_stick', dot)] }]), RIG);
    expect(a.stick).toEqual({ outside: 0, empty: 0 });
    expect(a.messages.filter((m) => m.level !== 'info')).toEqual([]);
  });

  it('warns about a curl that leaves the twig’s shape, which nothing used to catch', () => {
    // A thin curl rising 13 game pixels (52 on the template) over the top of the stick.
    const top = -TWIG_SIZE.h / 2 - 2.25;
    const curl: Capsule = { x0: 10, y0: top, x1: 14, y1: top - 13 + 1.5, r: 1.5 };
    const bytes = twigWith(painted([...twigOutline(), curl]));
    const a = analyze(bytes, RIG);
    expect(a.stick).toEqual({ outside: 52, empty: 0 });
    expect(a.messages).toEqual([
      {
        level: 'warning',
        layer: 'stick',
        text: `"stick" goes 52 pixels outside the twig's shape, and ${STICK_TOLERANCE} pixels is the most it may. Every loose twig in the world is drawn with this layer, and its rim, paint, and what it touches follow the twig on the guide. Keep to that outline.`,
      },
    ]);
    // The single-file checker says so too, and does not pass the file.
    const one = checkOne(TWIG_STICK.bug, bytes, RIG);
    expect(one.ok).toBe(false);
    expect(one.text).toContain('! "stick" goes 52 pixels outside the twig\'s shape');
    expect(one.text).toContain(
      "stick against the twig's shape: 52 pixels outside at most, 0 left empty at most (the limit is 16 each way)",
    );
  });

  it('warns about a stick that leaves part of the twig empty', () => {
    // No nubs, and the right end cut short by 12 game pixels.
    const body = twigOutline()[0]!;
    const a = analyze(twigWith(painted([{ ...body, x1: body.x1 - 12 }])), RIG);
    expect(a.stick!.outside).toBe(0);
    expect(a.stick!.empty).toBeGreaterThan(STICK_TOLERANCE);
    expect(a.messages.map((m) => [m.level, m.layer, m.text.slice(0, 56)])).toEqual([
      ['warning', 'stick', '"stick" leaves part of the twig\'s shape empty: 48 pixels'],
    ]);
  });

  it('passes the crude test Twig, and leaves every other bug alone', () => {
    const crude = checkOne(TWIG_STICK.bug, CRUDE, RIG);
    expect(crude.ok).toBe(true);
    expect(crude.text).toContain("stick against the twig's shape");
    const dot = 'bug_ladybug_dot';
    const other = checkOne(
      dot,
      new Uint8Array(readFileSync(join(FIX, `${dot}.ora`))),
      JSON.parse(readFileSync(join(FIX, `${dot}.rig.json`), 'utf8')) as RigFile,
    );
    expect(other.text).not.toContain('twig');
  });
});

describe('art sets in art/src', () => {
  const twigs = sourceSets(SRC_DIR)
    .map((set) => ({
      name: set.name,
      ora: join(setSource(SRC_DIR, set.id), 'bugs', `${TWIG_STICK.bug}.ora`),
    }))
    .filter((t) => existsSync(t.ora));

  it('has at least the reference cast’s Twig to check', () => {
    expect(twigs.length).toBeGreaterThan(0);
  });

  it.each(twigs)('$name keeps Twig’s stick inside the twig’s outline', ({ ora }) => {
    const rig = JSON.parse(readFileSync(ora.replace(/\.ora$/, '.rig.json'), 'utf8')) as RigFile;
    const fit = analyze(new Uint8Array(readFileSync(ora)), rig).stick;
    // A Twig nobody has started has no stick to measure.
    if (!fit) return;
    expect(fit.outside).toBeLessThanOrEqual(STICK_TOLERANCE);
    expect(fit.empty).toBeLessThanOrEqual(STICK_TOLERANCE);
  });
});
