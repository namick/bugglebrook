import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildBackdrop,
  buildStrip,
  finishStrip,
  readStripFile,
  toBackdropPack,
} from '../../scripts/art/backdrop.ts';
import {
  buildStripTemplate,
  refreshStripGuides,
  skyGuide,
  stampName,
  starterJson,
} from '../../scripts/art/backdropTemplate.ts';
import type { StripGuidePngs } from '../../scripts/art/backdropTemplate.ts';
import { ROOT, buildSets, formatReport } from '../../scripts/art/build.ts';
import { checkFile, filesAt, stripPreviews } from '../../scripts/art/checkBackdrop.ts';
import type { WriteNode } from '../../scripts/art/ora.ts';
import { readOra, writeOra } from '../../scripts/art/ora.ts';
import type { Rgba } from '../../scripts/art/png.ts';
import { blank, decodePng, encodePng } from '../../scripts/art/png.ts';
import { sourceSets } from '../../scripts/art/sets.ts';
import { CONTENT } from '../../src/game/data';
import {
  DEFAULT_SKY,
  DEFAULT_WORLD,
  luma,
  parseSky,
  parseWorld,
} from '../../src/renderer/src/art/backdropData';
import type { StripFile } from '../../src/renderer/src/art/backdropData';
import { stripFileFor } from '../../src/renderer/src/render/stripLayout';

// The backdrop importer: strips in, pictures and a manifest out, with the
// messages a painter reads. And the crude test backdrop it is tried on.

const FIXTURE = join(ROOT, 'tests/e2e/fixtures/art');
const TMP = mkdtempSync(join(tmpdir(), 'bb-backdrop-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

/** A small strip for importer tests: 96 x 64 game pixels, with 16 px blend zones. */
function testStrip(over: Partial<StripFile> = {}): StripFile {
  const scale = over.scale ?? 2;
  return {
    schema: 1,
    id: 'area_test_far',
    kind: 'strip',
    area: 'area_test',
    layer: 'far',
    title: 'Test, far layer',
    scale,
    canvas: { w: 96 * scale, h: 64 * scale },
    x: 1000,
    span: { x0: 1016, x1: 1080 },
    blend: { left: 16, right: 16 },
    ground: 48,
    cover: 56,
    hidden: [],
    stripHash: 'abc123',
    ...over,
  };
}

const EMPTY = (): Uint8Array => encodePng(blank(1, 1));

/** A filled rectangle as a cropped layer, the way Krita saves one. */
function box(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: [number, number, number, number],
  more: Partial<WriteNode> = {},
): WriteNode {
  const img = blank(w, h);
  for (let i = 0; i < w * h; i++) img.data.set(rgba, i * 4);
  return { name, png: encodePng(img), x, y, ...more } as WriteNode;
}

/** An .ora for a strip: the stamp, then the layers given (top first). */
function ora(strip: StripFile, layers: WriteNode[], stamp = strip.stripHash): Uint8Array {
  return writeOra({
    w: strip.canvas.w,
    h: strip.canvas.h,
    stack: [
      { name: 'guides', locked: true, children: [{ name: stampName(stamp), png: EMPTY(), visible: false }] },
      ...layers,
    ],
    merged: EMPTY(),
    thumbnail: EMPTY(),
  });
}

const MAGENTA: [number, number, number, number] = [200, 40, 200, 255];
/** Paint across the whole canvas from game y 20 down. */
const fullPaint = (s: StripFile): WriteNode =>
  box('paint', 0, 20 * s.scale, s.canvas.w, s.canvas.h - 20 * s.scale, MAGENTA);
const texts = (m: { text: string }[]): string => m.map((x) => x.text).join(' | ');
const alphaAt = (img: Rgba, x: number, y: number): number => img.data[(y * img.w + x) * 4 + 3]!;

describe('importing a strip', () => {
  it('reports a fresh template as empty, so the game keeps the code-drawn layer', () => {
    const strip = testStrip();
    const built = buildStrip(
      ora(strip, [
        { name: 'glow', png: EMPTY() },
        { name: 'paint', png: EMPTY() },
      ]),
      strip,
    );
    expect(built.entry.status).toBe('empty');
    expect(built.entry.paint).toBeNull();
    expect(built.files).toEqual({});
    expect(built.messages).toEqual([
      { level: 'info', text: expect.stringContaining('Nothing is painted yet') },
    ]);
  });

  it('builds a painted strip at game size, placed in its layer', () => {
    const strip = testStrip();
    const built = buildStrip(ora(strip, [fullPaint(strip)]), strip);
    expect(built.messages).toEqual([]);
    expect(built.entry.status).toBe('drawn');
    expect(built.entry.span).toEqual([1016, 1080]);
    const p = built.entry.paint!;
    expect(p.image).toBe('backdrop/area_test_far.png');
    const img = decodePng(built.files[p.image]!);
    expect([img.w, img.h]).toEqual([p.w, p.h]);
    // Halved from the 2x canvas: 96 px wide, from y 20 to the cover line at 56, with a 2 px margin above and below.
    expect(p.x).toBe(1000);
    expect(p.w).toBe(96);
    expect(p.y).toBe(18);
    expect(p.y + p.h).toBe(58);
    expect(alphaAt(img, 48, 56 - p.y)).toBe(0);
    expect(alphaAt(img, 48, 55 - p.y)).toBe(255);
    // Its color is the paint's.
    const mid = (Math.floor(p.h / 2) * img.w + 48) * 4;
    expect([...img.data.subarray(mid, mid + 4)]).toEqual(MAGENTA);
    expect(built.entry.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(built.entry.stripHash).toBe('abc123');
  });

  it('takes a 1x template as it is', () => {
    const strip = testStrip({ scale: 1 });
    const built = buildStrip(ora(strip, [fullPaint(strip)]), strip);
    expect(built.messages).toEqual([]);
    expect(built.entry.paint!.w).toBe(96);
    expect(built.entry.paint!.y + built.entry.paint!.h).toBe(58);
  });

  it('fades the strip out across its blend zones and keeps it solid in its own stretch', () => {
    const strip = testStrip();
    const built = buildStrip(ora(strip, [fullPaint(strip)]), strip);
    const img = decodePng(built.files[built.entry.paint!.image]!);
    const row = 20;
    // Nearly gone at the canvas edges, rising across the 16 px zone, solid from the seam on.
    expect(alphaAt(img, 0, row)).toBeLessThan(8);
    expect(alphaAt(img, 8, row)).toBeGreaterThan(100);
    expect(alphaAt(img, 8, row)).toBeLessThan(160);
    for (let x = 16; x < 80; x++) expect(alphaAt(img, x, row)).toBe(255);
    expect(alphaAt(img, 87, row)).toBeGreaterThan(100);
    expect(alphaAt(img, 87, row)).toBeLessThan(160);
    expect(alphaAt(img, 95, row)).toBeLessThan(8);
    for (let x = 1; x < 16; x++)
      expect(alphaAt(img, x, row)).toBeGreaterThanOrEqual(alphaAt(img, x - 1, row));
    // No fade at an end of the world.
    const edge = testStrip({ blend: { left: 0, right: 16 }, span: { x0: 1000, x1: 1080 } });
    const end = decodePng(
      buildStrip(ora(edge, [fullPaint(edge)]), edge).files['backdrop/area_test_far.png']!,
    );
    expect(alphaAt(end, 0, row)).toBe(255);
  });

  it('throws away what is never on screen', () => {
    const strip = testStrip({ hidden: [[1040, 1056]] });
    const img: Rgba = { w: 96, h: 64, data: new Uint8Array(96 * 64 * 4).fill(255) };
    finishStrip(img, strip);
    // Rows from the cover line down, and the hidden columns, are empty.
    expect(alphaAt(img, 30, 55)).toBe(255);
    expect(alphaAt(img, 30, 56)).toBe(0);
    expect(alphaAt(img, 39, 10)).toBe(255);
    expect(alphaAt(img, 40, 10)).toBe(0);
    expect(alphaAt(img, 55, 10)).toBe(0);
    expect(alphaAt(img, 56, 10)).toBe(255);
    // Paint only where nothing shows builds nothing, and says so.
    const below = testStrip();
    const built = buildStrip(ora(below, [box('paint', 0, 60 * 2, 96 * 2, 4 * 2, MAGENTA)]), below);
    expect(built.entry.status).toBe('empty');
    expect(built.files).toEqual({});
    expect(texts(built.messages)).toMatch(/never on screen/);
  });

  it('flattens every layer that is not a guide, with opacity, Multiply, and groups', () => {
    const strip = testStrip({ scale: 1, blend: { left: 0, right: 0 }, span: { x0: 1000, x1: 1096 } });
    const layers: WriteNode[] = [
      // Top first: a sketch (skipped), a multiply shade, a half-see-through wash, and a group over the base.
      box('guide_sketch', 0, 0, 96, 64, [0, 255, 0, 255]),
      box('shade', 0, 30, 96, 10, [128, 128, 128, 255], { compositeOp: 'svg:multiply' }),
      box('wash', 0, 40, 96, 10, [255, 255, 255, 255], { opacity: 0.5 }),
      { name: 'rocks', children: [box('rock', 10, 22, 4, 4, [10, 20, 30, 255])] },
      box('base', 0, 20, 96, 36, MAGENTA),
    ];
    const built = buildStrip(ora(strip, layers), strip);
    expect(built.messages).toEqual([]);
    const p = built.entry.paint!;
    const img = decodePng(built.files[p.image]!);
    const px = (x: number, y: number): number[] => [
      ...img.data.subarray(((y - p.y) * img.w + x) * 4, ((y - p.y) * img.w + x) * 4 + 3),
    ];
    expect(px(50, 25)).toEqual([200, 40, 200]);
    expect(px(11, 23)).toEqual([10, 20, 30]);
    expect(px(50, 35)).toEqual([100, 20, 100]);
    // Half white over the base, to within a rounding step.
    px(50, 45).forEach((v, i) => expect(Math.abs(v - [228, 148, 228][i]!)).toBeLessThanOrEqual(1));
    // The sketch above everything left no green.
    expect(p.y).toBe(18);
  });

  it('builds the glow layer on its own, whatever its blend mode, opacity, and visibility', () => {
    const strip = testStrip();
    const glow = box('glow', 60, 60, 20, 20, [64, 240, 255, 255], {
      compositeOp: 'svg:plus',
      opacity: 0.3,
      visible: false,
    });
    const built = buildStrip(ora(strip, [glow, fullPaint(strip)]), strip);
    expect(built.messages).toEqual([]);
    const g = built.entry.glow!;
    expect(g.image).toBe('backdrop/area_test_far.glow.png');
    // The 20 px square at 2x is 10 px in the game, plus the 2 px margin.
    expect([g.x, g.y, g.w, g.h]).toEqual([1028, 28, 14, 14]);
    const img = decodePng(built.files[g.image]!);
    expect([...img.data.subarray((7 * img.w + 7) * 4, (7 * img.w + 7) * 4 + 4)]).toEqual([64, 240, 255, 255]);
    // The painting has no cyan in it.
    const paint = decodePng(built.files[built.entry.paint!.image]!);
    expect([...paint.data.subarray((20 * paint.w + 35) * 4, (20 * paint.w + 35) * 4 + 3)]).toEqual([
      200, 40, 200,
    ]);
    // A glow with no painting under it does not make a strip.
    const only = buildStrip(ora(strip, [glow]), strip);
    expect(only.entry.status).toBe('empty');
  });

  it('says what is wrong in words a painter can act on', () => {
    const strip = testStrip();
    const cases: [string, Uint8Array, RegExp, 'error' | 'warning'][] = [
      ['not an ora', new Uint8Array([1, 2, 3]), /isn't a working ORA/, 'error'],
      [
        'resized',
        writeOra({ w: 50, h: 50, stack: [fullPaint(strip)], merged: EMPTY(), thumbnail: EMPTY() }),
        /canvas is 50 x 50 but should be 192 x 128/,
        'error',
      ],
      ['stale', ora(strip, [fullPaint(strip)], 'beef'), /out of date/, 'error'],
      [
        'blend mode',
        ora(strip, [box('fx', 0, 40, 192, 20, MAGENTA, { compositeOp: 'svg:screen' }), fullPaint(strip)]),
        /"fx" uses the blend mode "screen"/,
        'error',
      ],
      [
        'two glows',
        ora(strip, [box('glow', 0, 40, 9, 9, MAGENTA), box('glow', 20, 40, 9, 9, MAGENTA), fullPaint(strip)]),
        /2 layers named "glow"/,
        'error',
      ],
      [
        'hidden layer',
        ora(strip, [box('old', 0, 40, 192, 20, MAGENTA, { visible: false }), fullPaint(strip)]),
        /"old" is hidden in Krita but still part of the picture/,
        'warning',
      ],
      [
        'stops short',
        ora(strip, [box('paint', 40, 40, 152, 60, MAGENTA)]),
        /stops short of the left edge/,
        'warning',
      ],
    ];
    for (const [name, bytes, text, level] of cases) {
      const built = buildStrip(bytes, strip);
      expect(texts(built.messages), name).toMatch(text);
      expect(
        built.messages.some((m) => m.level === level),
        name,
      ).toBe(true);
      expect(built.entry.status, name).toBe(level === 'error' ? 'broken' : 'drawn');
      if (level === 'error') expect(built.files, name).toEqual({});
    }
    expect(formatReport('area_test_far', buildStrip(cases[2]![1], strip).messages)).toMatch(
      /^area_test_far\.ora\n {2}x /,
    );
  });

  it('makes the same bytes every time', () => {
    const strip = testStrip();
    const bytes = ora(strip, [box('glow', 60, 60, 20, 20, [64, 240, 255, 255]), fullPaint(strip)]);
    const a = buildStrip(bytes, strip);
    const b = buildStrip(bytes, strip);
    expect(Object.keys(a.files).sort()).toEqual([
      'backdrop/area_test_far.glow.png',
      'backdrop/area_test_far.png',
    ]);
    for (const k of Object.keys(a.files)) expect(Buffer.compare(a.files[k]!, b.files[k]!)).toBe(0);
    expect(a.entry).toEqual(b.entry);
  });

  it('needs the strip.json that came with the template', () => {
    expect(readStripFile(join(TMP, 'nope.strip.json')).message!.text).toMatch(
      /no nope\.strip\.json next to the file/,
    );
    const bad = join(TMP, 'bad.strip.json');
    writeFileSync(bad, '{"id": "x"}');
    expect(readStripFile(bad).message!.text).toMatch(/isn't a strip file/);
    writeFileSync(bad, '{nope');
    expect(readStripFile(bad).message!.text).toMatch(/isn't valid JSON/);
    const good = join(TMP, 'good.strip.json');
    writeFileSync(good, JSON.stringify(testStrip()));
    expect(readStripFile(good)).toEqual({ strip: testStrip(), message: null });
  });
});

describe('strip templates', () => {
  const strip = testStrip();
  const solid = (rgba: [number, number, number, number]): Uint8Array => {
    const img = blank(strip.canvas.w, strip.canvas.h);
    for (let i = 0; i < img.w * img.h; i++) img.data.set(rgba, i * 4);
    return encodePng(img);
  };
  const guides = (current: [number, number, number, number] = [0, 200, 0, 255]): StripGuidePngs => ({
    strip,
    current: solid(current),
    lines: EMPTY(),
    unseen: EMPTY(),
    notes: EMPTY(),
  });

  it('has guides on top, an empty glow and paint layer, and the code-drawn layer underneath', () => {
    const doc = readOra(buildStripTemplate(guides()));
    expect([doc.w, doc.h]).toEqual([192, 128]);
    expect(doc.root.children.map((n) => n.name)).toEqual(['guides', 'glow', 'paint', 'guides_under']);
    const names = (i: number): string[] =>
      (doc.root.children[i] as { children: { name: string }[] }).children.map((n) => n.name);
    expect(names(0)).toEqual(['guide_notes', 'guide_lines', 'guide_unseen', 'guide_strip_abc123']);
    expect(names(3)).toEqual(['guide_current', 'guide_sky']);
    expect(doc.root.children[0]!.attrs['edit-locked']).toBe('true');
    // The importer reads it as a strip with nothing painted: guides never count, wherever they are.
    expect(buildStrip(buildStripTemplate(guides()), strip).entry.status).toBe('empty');
  });

  it('keeps the painting when its guides are refreshed', () => {
    const painted = ora(strip, [box('glow', 60, 60, 20, 20, [64, 240, 255, 255]), fullPaint(strip)]);
    const before = buildStrip(painted, strip);
    const refreshed = refreshStripGuides(painted, guides([0, 0, 200, 255]));
    const doc = readOra(refreshed);
    expect(doc.root.children.map((n) => n.name)).toEqual(['guides', 'glow', 'paint', 'guides_under']);
    const after = buildStrip(refreshed, strip);
    expect(after.messages).toEqual([]);
    for (const k of Object.keys(before.files))
      expect(Buffer.compare(before.files[k]!, after.files[k]!)).toBe(0);
  });

  it('draws the sky guide as the game stacks its sky', () => {
    const sky = skyGuide(4, 100);
    const at = (y: number): number =>
      (sky.data[y * 4 * 4]! << 16) | (sky.data[y * 4 * 4 + 1]! << 8) | sky.data[y * 4 * 4 + 2]!;
    // The top is the top color; low down it is the bottom color lifted by the horizon glow.
    expect(at(0)).toBe(DEFAULT_SKY.moments.day.skyTop);
    expect(luma(at(72))).toBeGreaterThan(luma(DEFAULT_SKY.moments.day.skyBottom));
    expect(luma(at(72))).toBeGreaterThan(luma(at(10)));
    const night = skyGuide(4, 100, DEFAULT_SKY.moments.night);
    expect(luma((night.data[0]! << 16) | (night.data[1]! << 8) | night.data[2]!)).toBeLessThan(
      luma(at(0)) / 3,
    );
  });

  it('starts a set off with the game own look written out in full', () => {
    const { sky, world } = starterJson();
    expect(parseSky(JSON.parse(sky))).toEqual({ sky: DEFAULT_SKY, messages: [] });
    expect(parseWorld(JSON.parse(world))).toEqual({ world: DEFAULT_WORLD, messages: [] });
  });
});

describe('the crude test backdrop', () => {
  const built = buildBackdrop(FIXTURE);

  it('is current: its strip files match the areas as they are now', () => {
    const dir = join(FIXTURE, 'backdrop');
    const files = readdirSync(dir).filter((f) => f.endsWith('.strip.json'));
    expect(files.sort()).toEqual([
      'area_flowerbed_stage_far.strip.json',
      'area_puddle_pond_far.strip.json',
      'area_puddle_pond_mid.strip.json',
    ]);
    for (const f of files) {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as StripFile;
      const now = stripFileFor(CONTENT.areas.all, s.area, s.layer, s.scale)!;
      expect(s.stripHash, `${f}: rerun backdropTemplates.ts and make.ts (see make.ts)`).toBe(now.stripHash);
      expect({ ...s, cover: 0, hidden: [] }).toEqual({ ...now, cover: 0, hidden: [] });
      // What the generator found: the ground covers everything from about y 940.
      expect(s.cover).toBeGreaterThan(900);
      expect(s.cover).toBeLessThan(1000);
    }
  });

  it('builds clean: a sky, a world style, and three drawn strips, with nothing to report', () => {
    for (const [id, messages] of built.messages) expect(messages, id).toEqual([]);
    const m = built.manifest!;
    expect(Object.keys(m.strips).sort()).toEqual([
      'area_flowerbed_stage_far',
      'area_puddle_pond_far',
      'area_puddle_pond_mid',
    ]);
    for (const s of Object.values(m.strips)) expect(s.status, s.id).toBe('drawn');
    expect(m.strips.area_puddle_pond_far!.glow).not.toBeNull();
    expect(m.strips.area_puddle_pond_mid!.glow).toBeNull();
    expect(parseSky(m.sky).sky!.moments.day.skyTop).toBe(0x3fd07a);
    expect(parseWorld(m.world).world!.tone).toHaveLength(2);
    expect(Object.keys(built.files).sort()).toEqual([
      'backdrop.json',
      'backdrop/area_flowerbed_stage_far.glow.png',
      'backdrop/area_flowerbed_stage_far.png',
      'backdrop/area_puddle_pond_far.glow.png',
      'backdrop/area_puddle_pond_far.png',
      'backdrop/area_puddle_pond_mid.png',
    ]);
    // The sketch layer in each file stayed out: no pure green anywhere.
    const far = decodePng(built.files['backdrop/area_puddle_pond_far.png']!);
    for (let i = 0; i < far.data.length; i += 4)
      if (far.data[i + 3]! > 0) expect(far.data[i + 1]!).toBeLessThan(200);
  });

  it('builds the same bytes again, and packs for the running game', () => {
    const dir = join(FIXTURE, 'backdrop');
    const strip = JSON.parse(readFileSync(join(dir, 'area_puddle_pond_mid.strip.json'), 'utf8')) as StripFile;
    const again = buildStrip(new Uint8Array(readFileSync(join(dir, 'area_puddle_pond_mid.ora'))), strip);
    for (const k of Object.keys(again.files))
      expect(Buffer.compare(built.files[k]!, again.files[k]!), k).toBe(0);
    expect(again.entry).toEqual(built.manifest!.strips.area_puddle_pond_mid);
    const pack = toBackdropPack(built)!;
    expect(pack.manifest).toBe(built.manifest);
    expect(Object.keys(pack.images)).toHaveLength(5);
    for (const [path, url] of Object.entries(pack.images)) {
      expect(path.startsWith('backdrop/')).toBe(true);
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('places each strip where its area is, at game size', () => {
    const pond = built.manifest!.strips.area_puddle_pond_far!;
    const span = stripFileFor(CONTENT.areas.all, 'area_puddle_pond', 'far')!;
    expect(pond.span).toEqual([span.span.x0, span.span.x1]);
    // Painted edge to edge: the picture is the whole canvas wide (less a pixel that faded to nothing).
    expect(pond.paint!.x).toBeLessThanOrEqual(span.x + 1);
    expect(pond.paint!.x + pond.paint!.w).toBeGreaterThanOrEqual(span.x + span.canvas.w / 2 - 1);
    // Nothing below the line the ground always covers (and the 2 px margin).
    expect(pond.paint!.y + pond.paint!.h).toBeLessThanOrEqual(942);
  });

  it('passes the single-file validator, which shows it by day and by night', () => {
    const files = filesAt(FIXTURE);
    expect(files.map((f) => basename(f))).toEqual([
      'area_flowerbed_stage_far.ora',
      'area_puddle_pond_far.ora',
      'area_puddle_pond_mid.ora',
      'sky.json',
      'world.json',
    ]);
    expect(filesAt(join(FIXTURE, 'backdrop'))).toEqual(files);
    const out = join(TMP, 'look');
    for (const f of files) {
      const r = checkFile(f, out);
      expect(r.messages, f).toEqual([]);
      expect(r.notes.length, f).toBeGreaterThan(0);
    }
    expect(readdirSync(out).sort()).toContain('area_puddle_pond_far.night.png');
    expect(checkFile(join(FIXTURE, 'backdrop/make.ts')).messages[0]!.level).toBe('error');
    // The previews: the night one is darker, and the glow shows only in it.
    const strip = JSON.parse(
      readFileSync(join(FIXTURE, 'backdrop/area_puddle_pond_far.strip.json'), 'utf8'),
    ) as StripFile;
    const one = buildStrip(
      new Uint8Array(readFileSync(join(FIXTURE, 'backdrop/area_puddle_pond_far.ora'))),
      strip,
    );
    const sky = parseSky(built.manifest!.sky).sky!;
    const { day, night } = stripPreviews(one, strip, sky)!;
    const mean = (img: Rgba): number => {
      let sum = 0;
      for (let i = 0; i < img.data.length; i += 4)
        sum += luma((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
      return sum / (img.data.length / 4);
    };
    expect(mean(night)).toBeLessThan(mean(day) * 0.5);
    const g = one.entry.glow!;
    const at = (img: Rgba, x: number, y: number): number[] => [
      ...img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 3),
    ];
    const lit = decodePng(one.files[g.image]!);
    // A lit pixel of the glow, on the canvas.
    let spot: [number, number] | null = null;
    for (let i = 0; i < lit.w * lit.h && !spot; i++)
      if (lit.data[i * 4 + 3] === 255) spot = [g.x - strip.x + (i % lit.w), g.y + Math.floor(i / lit.w)];
    const [gx, gy] = spot!;
    expect(
      luma((at(night, gx, gy)[0]! << 16) | (at(night, gx, gy)[1]! << 8) | at(night, gx, gy)[2]!),
    ).toBeGreaterThan(
      luma(
        (at(night, gx + 40, gy)[0]! << 16) | (at(night, gx + 40, gy)[1]! << 8) | at(night, gx + 40, gy)[2]!,
      ) + 60,
    );
  });
});

describe('a set with a backdrop in the whole build', () => {
  it('writes backdrop.json and its strips under the set, and nothing for a set without one', () => {
    const src = join(TMP, 'src');
    mkdirSync(join(src, 'sets/plain'), { recursive: true });
    mkdirSync(join(src, 'sets/painted/backdrop'), { recursive: true });
    writeFileSync(join(src, 'sets/plain/set.json'), '{"name": "Plain", "credit": "Nobody"}');
    writeFileSync(join(src, 'sets/painted/set.json'), '{"name": "Painted", "credit": "Somebody"}');
    for (const f of readdirSync(join(FIXTURE, 'backdrop')))
      if (f.startsWith('area_puddle_pond_mid') || f === 'world.json')
        writeFileSync(join(src, 'sets/painted/backdrop', f), readFileSync(join(FIXTURE, 'backdrop', f)));
    writeFileSync(join(src, 'sets/painted/backdrop/sky.json'), '{"moments": {"day": {"near": "#404040"}}}');
    const build = buildSets(src);
    const files = Object.keys(build.files).filter((f) => f.includes('backdrop'));
    expect(files.sort()).toEqual([
      'sets/painted/backdrop.json',
      'sets/painted/backdrop/area_puddle_pond_mid.png',
    ]);
    // A sky that breaks the rules is reported and left out; the rest of the backdrop still builds.
    const manifest = JSON.parse(new TextDecoder().decode(build.files['sets/painted/backdrop.json']!));
    expect(manifest.sky).toBeNull();
    expect(manifest.world).not.toBeNull();
    expect(manifest.report.sky[0].level).toBe('error');
    expect(build.messages.get('painted/backdrop/sky.json')![0]!.text).toMatch(/moments\.day\.near/);
    expect(build.messages.get('painted/backdrop/area_puddle_pond_mid')).toEqual([]);
    expect(
      formatReport('painted/backdrop/sky.json', build.messages.get('painted/backdrop/sky.json')!),
    ).toMatch(/^painted\/backdrop\/sky\.json\n {2}x /);
  });

  it('reads every committed set: each backdrop file in the repo builds without an error', () => {
    for (const set of sourceSets(join(ROOT, 'art/src'))) {
      const dir = set.id === 'reference' ? join(ROOT, 'art/src') : join(ROOT, 'art/src/sets', set.id);
      const one = buildBackdrop(dir);
      for (const [id, messages] of one.messages)
        expect(
          messages.filter((m) => m.level === 'error'),
          `${set.id}/${id}`,
        ).toEqual([]);
    }
  });
});
