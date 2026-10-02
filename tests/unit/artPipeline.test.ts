import { createCanvas } from '@napi-rs/canvas';
import { strFromU8, unzipSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildAsset, formatReport, stableJson } from '../../scripts/art/build.ts';
import { alphaBounds, bleed, composite, halve, rimOf, rotateCw } from '../../scripts/art/image.ts';
import { mimetypeProblem, readOra, walk, writeOra, zipOrder } from '../../scripts/art/ora.ts';
import { pack } from '../../scripts/art/pack.ts';
import { PNG_SIGNATURE, blank, decodePng, encodePng, pngChunk } from '../../scripts/art/png.ts';
import { analyze, didYouMean } from '../../scripts/art/validate.ts';
import type { AtlasJson } from '../../src/renderer/src/art/rigFile';
import { EMPTY, goodParts, layer, oraOf, rect, testRig } from './artFixtures';

const px = (img: { w: number; data: Uint8Array }, x: number, y: number): number[] => [
  ...img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4),
];

const texts = (bytes: Uint8Array, rig = testRig()) =>
  analyze(bytes, rig).messages.map((m) => `${m.level}: ${m.text}`);

describe('PNG', () => {
  it('round-trips RGBA exactly and encodes the same bytes every time', () => {
    const img = blank(37, 23);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 73 + (i >> 5) * 11) & 0xff;
    const a = encodePng(img);
    expect(decodePng(a).data).toEqual(img.data);
    expect(encodePng(img)).toEqual(a);
  });

  it('reads PNGs written by another encoder (Skia)', () => {
    const c = createCanvas(8, 4);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(255, 0, 0)';
    g.fillRect(0, 0, 4, 4);
    g.fillStyle = 'rgb(0, 0, 255)';
    g.fillRect(4, 0, 4, 4);
    const d = decodePng(new Uint8Array(c.toBuffer('image/png')));
    expect([d.w, d.h]).toEqual([8, 4]);
    expect(px(d, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(px(d, 6, 2)).toEqual([0, 0, 255, 255]);
  });

  it('tells a 16-bit PNG from an 8-bit one', () => {
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, 2);
    v.setUint32(4, 1);
    ihdr[8] = 16;
    ihdr[9] = 0;
    const raw = new Uint8Array([0, 0xff, 0xff, 0x80, 0x00]);
    const parts = [
      new Uint8Array(PNG_SIGNATURE),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', zlibSync(raw)),
      pngChunk('IEND', new Uint8Array()),
    ];
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) bytes.set(p, (o += p.length) - p.length);
    const d = decodePng(bytes);
    expect(d.info.bitDepth).toBe(16);
    expect(px(d, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(d, 1, 0)).toEqual([128, 128, 128, 255]);
  });
});

describe('ORA files', () => {
  it('follows the OpenRaster layout: mimetype first and stored, stack.xml, layers, merged image, thumbnail', () => {
    const bytes = oraOf(goodParts());
    expect(mimetypeProblem(bytes)).toBeNull();
    const order = zipOrder(bytes);
    expect(order[0]).toBe('mimetype');
    expect(order).toContain('stack.xml');
    expect(order).toContain('mergedimage.png');
    expect(order).toContain('Thumbnails/thumbnail.png');
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype!)).toBe('image/openraster');
    const xml = strFromU8(files['stack.xml']!);
    expect(xml).toMatch(/<image version="0.0.6" w="64" h="64" xres="300" yres="300">/);
    expect(xml).toMatch(
      /<stack name="guides" visibility="visible" opacity="1" composite-op="svg:src-over" edit-locked="true">/,
    );
    const thumb = decodePng(files['Thumbnails/thumbnail.png']!);
    expect(Math.max(thumb.w, thumb.h)).toBeLessThanOrEqual(256);
    // Every layer's src is in the zip.
    for (const m of xml.matchAll(/src="([^"]+)"/g)) expect(files[m[1]!], m[1]).toBeDefined();
  });

  it('reads back what it wrote: names, order, offsets, opacity, visibility, blend modes', () => {
    const bytes = writeOra({
      w: 32,
      h: 16,
      stack: [
        { name: 'top', png: encodePng(rect(4, 4, 0, 0, 4, 4, [1, 2, 3, 255])), x: 5, y: 6, opacity: 0.5 },
        {
          name: 'grp',
          children: [
            { name: 'inner', png: EMPTY(), visible: false, compositeOp: 'svg:multiply' },
            { name: 'under', png: EMPTY(), compositeOp: 'svg:src-atop' },
          ],
        },
      ],
      merged: encodePng(blank(32, 16)),
      thumbnail: encodePng(blank(32, 16)),
    });
    const doc = readOra(bytes);
    expect([doc.w, doc.h, doc.xres]).toEqual([32, 16, 300]);
    const all = walk(doc.root).map(({ node, path }) => [path.join('/'), node.name, node.kind]);
    expect(all).toEqual([
      ['', 'top', 'layer'],
      ['', 'grp', 'stack'],
      ['grp', 'inner', 'layer'],
      ['grp', 'under', 'layer'],
    ]);
    const top = doc.root.children[0]!;
    expect(top).toMatchObject({ x: 5, y: 6, opacity: 0.5, visible: true });
    const grp = doc.root.children[1]!;
    expect(grp.kind === 'stack' && grp.children[0]).toMatchObject({
      visible: false,
      compositeOp: 'svg:multiply',
    });
    expect(writeOra({ ...doc, stack: [], merged: EMPTY(), thumbnail: EMPTY() })).toEqual(
      writeOra({ ...doc, stack: [], merged: EMPTY(), thumbnail: EMPTY() }),
    );
  });

  it('says what is wrong with a file that is not an ORA', () => {
    expect(texts(new Uint8Array([1, 2, 3]))).toEqual([
      "error: This isn't a working ORA file: it is not a zip file, so it is not an ORA. Save it again from Krita with File > Save As and pick OpenRaster (.ora).",
    ]);
  });
});

describe('pixel work', () => {
  it('composites normal, multiply, and inherit alpha to known values', () => {
    const base = rect(2, 1, 0, 0, 1, 1, [0, 0, 255, 255]);
    const red = rect(2, 1, 0, 0, 2, 1, [255, 0, 0, 255]);
    const over = { ...base, data: base.data.slice() };
    composite(over, red, 0, 0, 0.5);
    expect(px(over, 0, 0)).toEqual([128, 0, 128, 255]);
    expect(px(over, 1, 0)).toEqual([255, 0, 0, 128]);
    const grey = rect(2, 1, 0, 0, 2, 1, [128, 128, 128, 255]);
    const mul = { ...base, data: base.data.slice() };
    composite(mul, grey, 0, 0, 1, 'svg:multiply');
    expect(px(mul, 0, 0)).toEqual([0, 0, 128, 255]);
    expect(px(mul, 1, 0)).toEqual([128, 128, 128, 255]);
    const atop = { ...base, data: base.data.slice() };
    composite(atop, red, 0, 0, 1, 'svg:src-atop');
    expect(px(atop, 0, 0)).toEqual([255, 0, 0, 255]);
    // Inherit alpha paints only where the layer below has pixels.
    expect(px(atop, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it('halves in premultiplied alpha, so a half-transparent edge keeps its color', () => {
    const img = rect(2, 2, 0, 0, 1, 2, [200, 100, 0, 255]);
    const h = halve(img);
    expect([h.w, h.h]).toEqual([1, 1]);
    expect(px(h, 0, 0)).toEqual([200, 100, 0, 128]);
  });

  it('bleeds color into the transparent pixels next to the drawing', () => {
    const img = rect(4, 1, 0, 0, 1, 1, [10, 20, 30, 255]);
    bleed(img, 2);
    expect(px(img, 1, 0)).toEqual([10, 20, 30, 0]);
    expect(px(img, 2, 0)).toEqual([10, 20, 30, 0]);
    expect(px(img, 3, 0)).toEqual([0, 0, 0, 0]);
  });

  it('grows a white rim around the silhouette', () => {
    const rim = rimOf(rect(4, 4, 0, 0, 4, 4, [0, 0, 0, 255]), 3);
    expect([rim.w, rim.h]).toEqual([4 + 8, 4 + 8]);
    expect(px(rim, 6, 6)).toEqual([255, 255, 255, 255]);
    expect(px(rim, 1, 6)[3]).toBeGreaterThan(0);
    expect(px(rim, 0, 0)[3]).toBe(0);
  });

  it('turns feelers a quarter clockwise, base to the left', () => {
    const img = rect(1, 3, 0, 2, 1, 1, [9, 9, 9, 255]);
    const r = rotateCw(img);
    expect([r.w, r.h]).toEqual([3, 1]);
    expect(px(r, 0, 0)).toEqual([9, 9, 9, 255]);
  });
});

describe('atlas packing', () => {
  it('fits boxes without overlaps, the same way every time', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `p${i}`,
      w: 10 + ((i * 37) % 90),
      h: 8 + ((i * 53) % 70),
    }));
    const a = pack(items, 512, 2);
    expect(pack([...items].reverse(), 512, 2)).toEqual(a);
    for (const p of a.placed) {
      const page = a.pages[p.page]!;
      expect(p.x + p.w).toBeLessThanOrEqual(page.w);
      expect(p.y + p.h).toBeLessThanOrEqual(page.h);
      for (const q of a.placed)
        if (q !== p && q.page === p.page)
          expect(
            p.x + p.w + 2 <= q.x || q.x + q.w + 2 <= p.x || p.y + p.h + 2 <= q.y || q.y + q.h + 2 <= p.y,
          ).toBe(true);
    }
  });

  it('spills onto a second page, and refuses a box bigger than a page', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ name: `b${i}`, w: 120, h: 120 }));
    expect(pack(items, 256, 2).pages.length).toBeGreaterThan(1);
    expect(() => pack([{ name: 'huge', w: 300, h: 10 }], 256, 2)).toThrow(/too big/);
  });
});

describe('validation', () => {
  it('passes a good file, quietly', () => {
    expect(texts(oraOf(goodParts()))).toEqual([]);
  });

  it('treats a fresh template as not started, not broken', () => {
    const fresh = oraOf(testRig().parts.map((p) => ({ name: p.name, png: EMPTY() })));
    const a = analyze(fresh, testRig());
    expect(a.untouched).toBe(true);
    expect(texts(fresh)).toEqual(['info: Nothing is drawn yet. The game keeps drawing this one in code.']);
  });

  it('catches a resized canvas', () => {
    expect(texts(oraOf(goodParts(), { w: 80 }))[0]).toBe(
      'error: The canvas is 80 x 64 but should be 64 x 64. Did Image > Resize Canvas or Scale Image get used? Undo it, or start again from a fresh template.',
    );
  });

  it('catches missing and empty parts, required or not', () => {
    const parts = goodParts().filter((p) => p.name !== 'body' && p.name !== 'shine');
    parts.push({ name: 'shine', png: EMPTY() });
    expect(texts(oraOf(parts))).toEqual([
      'error: "body" is missing. Make a layer named exactly "body" in the "parts" group and draw the body.',
      'warning: "shine" is empty. Draw shine.',
    ]);
  });

  it('suggests the right name for a renamed layer, and ignores guide layers', () => {
    const parts = goodParts().map((p) => (p.name === 'body' ? { ...p, name: 'Body' } : p));
    parts.push(
      { name: 'guide_sketch', png: EMPTY() },
      layer('sketch 2', rect(64, 64, 30, 30, 2, 2, [0, 0, 0, 255])),
    );
    expect(texts(oraOf(parts))).toEqual([
      'warning: "Body" (in "parts") is not a part name. Did you mean "body"? Rename it exactly, or start the name with "guide" if it\'s a sketch.',
      'warning: "sketch 2" (in "parts") is not a part name. Rename it to start with "guide" (like "guide_sketch") to hide this message.',
      'error: "body" is missing. Make a layer named exactly "body" in the "parts" group and draw the body.',
    ]);
    expect(didYouMean('leg upper', ['leg_upper', 'leg_lower'])).toBe('leg_upper');
    expect(didYouMean('antena', ['antenna', 'head'])).toBe('antenna');
    expect(didYouMean('zebra', ['antenna', 'head'])).toBeNull();
  });

  it('catches duplicate names', () => {
    const parts = [...goodParts(), layer('body', rect(64, 64, 10, 10, 2, 2, [0, 0, 0, 255]))];
    expect(texts(oraOf(parts))).toContain(
      'error: There are two layers named "body". Merge them or rename one, so the game knows which is the real one.',
    );
  });

  it('flattens a part made of a group, and rejects blend modes it cannot copy', () => {
    const body = goodParts().find((p) => p.name === 'body')!;
    const grouped = goodParts().map((p) =>
      p.name === 'body'
        ? {
            name: 'body',
            children: [
              layer('shade', rect(64, 64, 22, 26, 20, 4, [128, 128, 128, 255]), {
                compositeOp: 'svg:multiply',
              }),
              { ...body, name: 'color', visible: false },
            ],
          }
        : p,
    );
    const a = analyze(oraOf(grouped), testRig());
    expect(a.messages).toEqual([]);
    // Hidden layers count: the color layer is in, multiplied by the shade.
    const b = a.parts.get('body')!;
    expect(px(b.img, 1, 1)).toEqual([115, 35, 30, 255]);
    expect(px(b.img, 1, 10)).toEqual([230, 70, 60, 255]);
    const dodge = goodParts().map((p) =>
      p.name === 'body'
        ? { name: 'body', children: [{ ...body, name: 'x', compositeOp: 'svg:color-dodge' }] }
        : p,
    );
    expect(texts(oraOf(dodge))).toContain(
      'error: "x" in "body" uses the blend mode "color dodge". The game only understands Normal, Multiply, and Inherit Alpha. Merge it into a Normal layer first.',
    );
  });

  it('warns about opacity, the safe box, a limb off its dot, and a colorful tint layer', () => {
    const parts = goodParts().map((p) => {
      if (p.name === 'shine') return { ...p, opacity: 0.5 };
      if (p.name === 'leg_upper') return layer('leg_upper', rect(64, 64, 1, 1, 3, 3, [0, 0, 0, 255]));
      if (p.name === 'shell_tint')
        return layer('shell_tint', rect(64, 64, 20, 20, 16, 12, [220, 40, 40, 255]));
      return p;
    });
    expect(texts(oraOf(parts))).toEqual([
      'warning: "shine" is at 50% opacity. The game uses it at that strength. Set it to 100% unless you mean it.',
      'warning: "leg_upper" goes outside the safe box. Keep it inside the box on the guide, or it may get cut off.',
      'warning: "leg_upper" doesn\'t start at its dot ("leg_upper" on the pivots guide). Start the drawing right on the dot, or it will float away from the body when it moves.',
      'warning: "shell_tint" is a tint layer but is quite colorful. Draw it in light greys: the game adds the color.',
    ]);
  });

  it('rejects a filled background', () => {
    const parts = goodParts().map((p) =>
      p.name === 'body' ? layer('body', rect(64, 64, 0, 0, 64, 64, [255, 255, 255, 255])) : p,
    );
    expect(texts(oraOf(parts))).toContain(
      'error: "body" covers almost the whole canvas. Is there a filled background on this layer? Erase it, so only the piece is left.',
    );
  });

  it('says when the template is out of date', () => {
    expect(texts(oraOf(goodParts(), { rigHash: 'beef' }))).toEqual([
      'error: This template is out of date: the game\'s joints moved since it was made. Ask for "pnpm art:templates --refresh-guides" to update the guides. Your drawings are kept.',
    ]);
  });

  it('moves a pivot to the artist’s dot, and says so', () => {
    const a = analyze(
      oraOf(goodParts(), {
        top: [
          { name: 'pivots', children: [layer('pivot_body', rect(64, 64, 30, 34, 2, 2, [0, 0, 0, 255]))] },
        ],
      }),
      testRig(),
    );
    expect(a.pivots.get('body')).toEqual({ x: 30.5, y: 34.5 });
    expect(a.messages.map((m) => m.text)).toEqual([
      '"body" now turns around your dot at 31, 35 instead of 32, 32.',
    ]);
  });

  it('formats the report the way the art guide shows it', () => {
    expect(
      formatReport('bug_test', [
        { level: 'error', text: 'Bad.' },
        { level: 'warning', text: 'Hmm.' },
      ]),
    ).toBe('bug_test.ora\n  x Bad.\n  ! Hmm.');
  });
});

describe('atlas build', () => {
  it('trims each part, keeps its pivot in place, and writes 1x and 2x pages and a rim', () => {
    const built = buildAsset(
      oraOf(goodParts(), { face: [layer('mouth_smile', rect(64, 64, 40, 35, 8, 2, [255, 180, 200, 255]))] }),
      testRig(),
    );
    expect(built.entry.status).toBe('drawn');
    expect(built.entry.pages).toEqual({ '1': ['bugs/bug_test@1x'], '2': ['bugs/bug_test@2x'] });
    expect(built.entry.face).toEqual(['mouth_smile']);
    expect(built.entry.parts.body).toEqual({ kind: 'static', pivot: { x: 0, y: 0 } });
    expect(built.entry.parts.leg_upper).toEqual({ kind: 'limb_upper', pivot: { x: 2, y: 2 }, length: 2 });
    for (const scale of [1, 2]) {
      const json = JSON.parse(
        new TextDecoder().decode(built.files[`bugs/bug_test@${scale}x.json`]!),
      ) as AtlasJson;
      expect(json.meta.scale).toBe(scale);
      const body = json.frames.body!;
      // The body was drawn from (22, 26) to (42, 42) at 4x: trimmed with 2 px and aligned to 4, from (20, 24) to (44, 44).
      expect(body.frame.w).toBe(24 / (4 / scale));
      expect(body.frame.h).toBe(20 / (4 / scale));
      // The pivot (32, 32) stays put: its anchor is the same fraction at every scale.
      expect(body.anchor).toEqual({ x: 0.5, y: 0.4 });
      expect(json.frames['body@rim']!.frame.w).toBe(body.frame.w + 2 * (8 * scale + 1));
      // Feelers lie along +x with the base at the left.
      expect(json.frames.antenna!.anchor.x).toBe(0);
      expect(json.frames.antenna!.frame.w).toBe(12 / (4 / scale));
      const page = decodePng(built.files[`bugs/bug_test@${scale}x.png`]!);
      expect([page.w, page.h]).toEqual([json.meta.size.w, json.meta.size.h]);
      const center = px(page, body.frame.x + (body.frame.w >> 1), body.frame.y + (body.frame.h >> 1));
      expect(center).toEqual([230, 70, 60, 255]);
    }
  });

  it('makes the same bytes from the same file', () => {
    const a = buildAsset(oraOf(goodParts()), testRig());
    const b = buildAsset(oraOf(goodParts()), testRig());
    expect(Object.keys(a.files).sort()).toEqual(Object.keys(b.files).sort());
    for (const k of Object.keys(a.files)) expect(a.files[k], k).toEqual(b.files[k]);
    expect(stableJson(a.entry)).toBe(stableJson(b.entry));
  });

  it('writes no pages for a broken or untouched file', () => {
    const broken = buildAsset(oraOf(goodParts().slice(1)), testRig());
    expect(broken.entry.status).toBe('broken');
    expect(broken.files).toEqual({});
    const fresh = buildAsset(oraOf([]), testRig());
    expect(fresh.entry.status).toBe('empty');
  });

  it('finds the drawing in a layer saved with an offset, like Krita does', () => {
    const a = analyze(oraOf(goodParts()), testRig());
    const body = a.parts.get('body')!;
    expect([body.x, body.y, body.img.w, body.img.h]).toEqual([22, 26, 20, 16]);
    expect(alphaBounds(body.img)).toEqual({ x: 0, y: 0, w: 20, h: 16 });
  });
});
