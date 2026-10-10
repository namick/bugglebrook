import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Container } from 'pixi.js';
import { BufferImageSource, Graphics } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAsset, buildSets } from '../../scripts/art/build.ts';
import { readSetColors } from '../../scripts/art/colors.ts';
import { decodePng } from '../../scripts/art/png.ts';
import { rebuild } from '../../scripts/art/vitePlugin.ts';
import { BUGS } from '../../src/game/data';
import type { BugDef } from '../../src/game/data/types';
import type { ArtSetCatalog, LoadedArt } from '../../src/renderer/src/art/artStore';
import { ArtStore, atlasSet } from '../../src/renderer/src/art/artStore';
import { EXPRESSIONS, expressionFrame, poseFrame, posesFor } from '../../src/renderer/src/art/poses';
import type { AtlasJson, BugColors, Manifest, RigFile } from '../../src/renderer/src/art/rigFile';
import {
  BUG_COLOR_KEYS,
  glowColors,
  hexColor,
  lanternAt,
  parseSetColors,
} from '../../src/renderer/src/art/setColors';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';
import { darken, lighten, mix } from '../../src/renderer/src/render/palette';
import { PIXELS_PER_METER } from '../../src/game/constants';

// An art set's own colors (colors.json): the file's checks, the build that
// carries them into the manifest, and each place the game uses one. Drawn
// with the crude test art pack (tests/e2e/fixtures/art).

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const ART = join(ROOT, 'src/renderer/art');

const DOT = BUGS.get('bug_ladybug_dot');
const BARTY = BUGS.get('bug_dungbeetle_barty');
const GLORP = BUGS.get('bug_snail_glorp');
const FLICK = BUGS.get('bug_firefly_flick');
const TEAL = 0x2e8b7a;
const VIOLET = 0x6a4fa3;

const rigOf = (id: string): RigFile =>
  JSON.parse(readFileSync(join(FIX, `${id}.rig.json`), 'utf8')) as RigFile;

/** A fixture bug built with a set's colors and turned into textures, as the game loads it. */
function loaded(id: string, colors?: BugColors): LoadedArt {
  const rig = JSON.parse(readFileSync(join(FIX, `${id}.rig.json`), 'utf8')) as RigFile;
  const built = buildAsset(new Uint8Array(readFileSync(join(FIX, `${id}.ora`))), rig, { colors });
  const art: LoadedArt = { entry: built.entry, scales: {} };
  for (const scale of [1, 2] as const)
    for (const page of built.entry.pages[String(scale) as '1' | '2']) {
      const img = decodePng(built.files[`${page}.png`]!);
      const json = JSON.parse(new TextDecoder().decode(built.files[`${page}.json`]!)) as AtlasJson;
      const source = new BufferImageSource({
        resource: new Uint8Array(img.data),
        width: img.w,
        height: img.h,
      });
      art.scales[scale] = atlasSet(source, json, art.scales[scale]);
    }
  return art;
}

let kit: LoadedArt;
beforeAll(() => {
  kit = loaded('face_kit');
});

const view = (def: BugDef, colors?: BugColors): SpriteBugView =>
  new SpriteBugView(def, loaded(def.id, colors), kit);
const sleepy = EXPRESSIONS.find((e) => e.id === 'sleepy')!;
const pose = (def: BugDef, id: string) => posesFor(def).find((p) => p.id === id)!;

describe('colors.json', () => {
  it('reads every key as a number', () => {
    const { bugs, problems } = parseSetColors(
      {
        bugs: {
          bug_ladybug_dot: { lid: '#3A2a40', body: '#11aa77' },
          bug_dungbeetle_barty: { sheen: ['#102030', '#a0b0c0'] },
          bug_firefly_flick: { glow: '#ff00ff', lantern: { x: 232, y: 540 } },
          bug_snail_glorp: {},
        },
      },
      rigOf,
    );
    expect(problems).toEqual([]);
    // Flick's template is 4 pixels to the game's one, with his middle at (384, 512).
    expect(bugs).toEqual({
      bug_ladybug_dot: { lid: 0x3a2a40, body: 0x11aa77 },
      bug_dungbeetle_barty: { sheen: [0x102030, 0xa0b0c0] },
      bug_firefly_flick: { glow: 0xff00ff, lantern: { x: -38, y: 7 } },
    });
    const keys = new Set(Object.values(bugs).flatMap((b) => Object.keys(b)));
    expect([...keys].sort()).toEqual([...BUG_COLOR_KEYS].sort());
  });

  it('takes only six-digit hex colors', () => {
    expect(hexColor('#000000')).toBe(0);
    expect(hexColor('#FFffFF')).toBe(0xffffff);
    for (const bad of ['#fff', 'ffffff', '#fffffff', '#gggggg', 'red', 0xff0000, null, ['#ffffff']])
      expect(hexColor(bad), String(bad)).toBeNull();
  });

  it('says everything that is wrong, in words', () => {
    for (const raw of [null, [], 'x', {}, { bugs: [] }, { bugs: 'all' }]) {
      const { bugs, problems } = parseSetColors(raw);
      expect(bugs).toEqual({});
      expect(problems).toEqual([
        'It must look like { "bugs": { "bug_ladybug_dot": { "lid": "#3a2a40" } } }.',
      ]);
    }
    const { bugs, problems } = parseSetColors({
      name: 'Alien planet',
      bugs: {
        bug_ladybug_dot: { lid: 'purple', eyelid: '#3a2a40', body: '#11aa77' },
        bug_dungbeetle_barty: { sheen: ['#102030'] },
        bug_moth_luma: { sheen: ['#102030', '#a0b0c0', '#ffffff'] },
        bug_bee_buzzby: { sheen: '#102030' },
        bug_snail_glorp: '#c8e07a',
      },
    });
    expect(problems).toEqual([
      '"name" is not a key it can have. Only "bugs" is.',
      'bug_ladybug_dot: "lid" must be a color like "#3a2a40".',
      'bug_ladybug_dot: "eyelid" is not a key the game uses. The keys are lid, sheen, body, glow, lantern.',
      'bug_dungbeetle_barty: "sheen" must be two colors, like ["#2e8b7a", "#6a4fa3"].',
      'bug_moth_luma: "sheen" must be two colors, like ["#2e8b7a", "#6a4fa3"].',
      'bug_bee_buzzby: "sheen" must be two colors, like ["#2e8b7a", "#6a4fa3"].',
      'bug_snail_glorp must be an object of colors, like { "lid": "#3a2a40" }.',
    ]);
    // What was right is still read, so one message per mistake is the whole story.
    expect(bugs).toEqual({ bug_ladybug_dot: { body: 0x11aa77 } });
  });

  it('takes a lantern only as a spot on the bug’s own template', () => {
    const flick = (lantern: unknown, rigs: (id: string) => RigFile | undefined = rigOf) =>
      parseSetColors({ bugs: { [FLICK.id]: { lantern } } }, rigs);
    const shape = `${FLICK.id}: "lantern" must be a spot in template pixels, like { "x": 272, "y": 528 }.`;
    for (const bad of [
      [272, 528],
      '272,528',
      { x: 272 },
      { x: '272', y: 528 },
      { x: 272, y: 528, r: 40 },
      null,
    ])
      expect(flick(bad), JSON.stringify(bad)).toEqual({ bugs: {}, problems: [shape] });
    for (const off of [
      { x: -1, y: 528 },
      { x: 272, y: 897 },
      { x: 769, y: 0 },
    ])
      expect(flick(off).problems).toEqual([`${FLICK.id}: "lantern" must be inside the canvas (768 x 896).`]);
    // The corners are on the canvas.
    expect(flick({ x: 0, y: 896 }).bugs[FLICK.id]).toEqual({ lantern: { x: -96, y: 96 } });
    // With no template to measure on, the spot means nothing.
    expect(flick({ x: 272, y: 528 }, () => undefined).problems).toEqual([
      `${FLICK.id}: "lantern" is measured on the bug's template, and the bug has no .rig.json here.`,
    ]);
    expect(parseSetColors({ bugs: { [FLICK.id]: { lantern: { x: 272, y: 528 } } } }).bugs).toEqual({});
  });
});

describe("a set's colors in the build", () => {
  const src = mkdtempSync(join(tmpdir(), 'bb-art-colors-'));
  const dir = join(src, 'sets/family');
  const colorsFile = join(dir, 'colors.json');
  beforeAll(() => {
    mkdirSync(join(dir, 'bugs'), { recursive: true });
    writeFileSync(join(dir, 'set.json'), JSON.stringify({ name: 'Family drawing', credit: 'Test artist' }));
    for (const id of [DOT.id, BARTY.id, FLICK.id])
      for (const ext of ['ora', 'rig.json'])
        copyFileSync(join(FIX, `${id}.${ext}`), join(dir, 'bugs', `${id}.${ext}`));
  });
  afterAll(() => rmSync(src, { recursive: true, force: true }));

  const manifest = (): Manifest =>
    JSON.parse(new TextDecoder().decode(buildSets(src).files['sets/family/manifest.json']!)) as Manifest;

  it('leaves the manifest as it was for a set with no colors.json', () => {
    rmSync(colorsFile, { force: true });
    expect(readSetColors(dir)).toEqual({});
    for (const entry of Object.values(manifest().assets)) expect('colors' in entry, entry.id).toBe(false);
  });

  it('copies each bug its colors, and hot reload carries them too', () => {
    writeFileSync(
      colorsFile,
      JSON.stringify({
        bugs: {
          [DOT.id]: { lid: '#204060', body: '#11aa77' },
          [BARTY.id]: { sheen: ['#102030', '#a0b0c0'] },
          [FLICK.id]: { glow: '#40e0d0', lantern: { x: 504, y: 464 } },
        },
      }),
    );
    const assets = manifest().assets;
    expect(assets[DOT.id]!.colors).toEqual({ lid: 0x204060, body: 0x11aa77 });
    expect(assets[BARTY.id]!.colors).toEqual({ sheen: [0x102030, 0xa0b0c0] });
    // The lantern's spot goes in as game pixels from the middle of the bug, read against his rig.
    expect(assets[FLICK.id]!.colors).toEqual({ glow: 0x40e0d0, lantern: { x: 30, y: -12 } });
    expect(assets[DOT.id]!.status).toBe('drawn');
    expect(assets[DOT.id]!.report).toEqual([]);
    const { pack } = rebuild(dir, [DOT.id]);
    expect(pack.assets.map((a) => a.colors)).toEqual([{ lid: 0x204060, body: 0x11aa77 }]);
  });

  it('stops the build, naming the file, when it is wrong', () => {
    writeFileSync(colorsFile, JSON.stringify({ bugs: { bug_ladybug_dott: { lid: '#204060' } } }));
    expect(() => buildSets(src)).toThrow(
      `${colorsFile} has problems:\n  bug_ladybug_dott: this set has no bugs/bug_ladybug_dott.ora. Check the ID.`,
    );
    // A bug the game has, but this set has not started.
    writeFileSync(colorsFile, JSON.stringify({ bugs: { [GLORP.id]: { lid: '#204060' } } }));
    expect(() => buildSets(src)).toThrow(`this set has no bugs/${GLORP.id}.ora`);
    writeFileSync(colorsFile, JSON.stringify({ bugs: { [DOT.id]: { lid: 'blue' } } }));
    expect(() => buildSets(src)).toThrow(`${DOT.id}: "lid" must be a color like "#3a2a40".`);
    writeFileSync(colorsFile, JSON.stringify({ bugs: { [FLICK.id]: { lantern: { x: 900, y: 464 } } } }));
    expect(() => buildSets(src)).toThrow(`${FLICK.id}: "lantern" must be inside the canvas (768 x 896).`);
    writeFileSync(colorsFile, '{ "bugs": ');
    expect(() => buildSets(src)).toThrow(`${colorsFile} is not valid JSON`);
    expect(() => rebuild(dir, [DOT.id])).toThrow(`${colorsFile} is not valid JSON`);
  });
});

describe("the cutout bug with its set's colors", () => {
  it('tints the sleepy eyelid with the set’s color, and with the game’s own without one', () => {
    const own = view(DOT);
    own.update(expressionFrame(sleepy, 0.5));
    expect(own.shown.face).toContain('eye_sleepy_lid');
    expect(own.shown.tints).toEqual({ eye_sleepy_lid: 0x3a2a40 });
    const set = view(DOT, { lid: 0x204060 });
    set.update(expressionFrame(sleepy, 0.5));
    expect(set.shown.tints).toEqual({ eye_sleepy_lid: 0x204060 });
    // Other faces have no tint layer to color.
    set.update(expressionFrame(EXPRESSIONS[0]!, 0.5));
    expect(set.shown.tints).toEqual({});
  });

  it('shimmers Barty between the set’s two colors, in his ball too', () => {
    const own = view(BARTY);
    own.update(poseFrame(pose(BARTY, 'idle'), 0.3));
    const shell = own.shown.tints.shell_tint!;
    // The game's own: somewhere between teal and violet, the head a shade darker.
    const channels = (c: number): number[] => [c >> 16, (c >> 8) & 0xff, c & 0xff];
    const k = ((shell >> 16) - (TEAL >> 16)) / ((VIOLET >> 16) - (TEAL >> 16));
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThanOrEqual(1);
    const want = channels(mix(TEAL, VIOLET, k));
    channels(shell).forEach((ch, i) => expect(Math.abs(ch - want[i]!)).toBeLessThanOrEqual(2));
    expect(own.shown.tints.head_tint).toBe(darken(shell, 0.25));

    // Both ends the same, so the color holds still and can be read.
    const one = 0xd04090;
    const set = view(BARTY, { sheen: [one, one] });
    set.update(poseFrame(pose(BARTY, 'idle'), 0.3));
    expect(set.shown.tints).toMatchObject({
      shell_tint: one,
      thorax_tint: one,
      head_tint: darken(one, 0.25),
    });
    set.update(poseFrame(pose(BARTY, 'curled'), 0.3));
    expect(set.shown.tints).toEqual({ ball_tint: one });
    // His eyelid follows the shell unless the set names one.
    set.update(expressionFrame(sleepy, 0.5));
    expect(set.shown.tints.eye_sleepy_lid).toBe(darken(one, 0.25));
    const both = view(BARTY, { sheen: [one, one], lid: 0x204060 });
    both.update(expressionFrame(sleepy, 0.5));
    expect(both.shown.tints.eye_sleepy_lid).toBe(0x204060);

    // Two ends: every tint stays between them.
    const two = view(BARTY, { sheen: [0x000000, 0xffffff] });
    for (const t of [0, 0.3, 0.7, 1.4]) {
      two.update(poseFrame(pose(BARTY, 'walk'), t));
      const c = two.shown.tints.shell_tint!;
      expect(channels(c).every((ch) => ch === c >> 16)).toBe(true);
    }
  });

  it('names its main color for what the game draws beside it, and colors Glorp’s ripples with it', () => {
    expect(new BugSprite(GLORP).bodyColor).toBe(GLORP.body);
    expect(view(GLORP).bodyColor).toBe(GLORP.body);
    const strokes = (v: SpriteBugView): number[] => {
      v.update(poseFrame(pose(GLORP, 'walk'), 0.3));
      expect(v.shown.extras).toContain('ripple');
      const out: number[] = [];
      const walk = (c: Container): void => {
        if (c instanceof Graphics && c.label === 'art fx')
          for (const ins of c.context.instructions) {
            const style = (ins.data as { style?: { color?: number } }).style;
            if (style?.color !== undefined) out.push(style.color);
          }
        c.children.forEach((ch) => walk(ch as Container));
      };
      walk(v);
      return out;
    };
    const own = strokes(view(GLORP));
    expect(own.length).toBeGreaterThan(0);
    expect(new Set(own)).toEqual(new Set([darken(GLORP.body, 0.35)]));
    const set = view(GLORP, { body: 0x8040c0 });
    expect(set.bodyColor).toBe(0x8040c0);
    expect(new Set(strokes(set))).toEqual(new Set([darken(0x8040c0, 0.35)]));
  });
});

describe('the selected set', () => {
  it('gives its colors only for bugs it draws, and none when another set or the original bugs are chosen', () => {
    const store = new ArtStore();
    const colors = { lid: 0x204060, body: 0x11aa77 };
    store.put(loaded(DOT.id, colors), 'family');
    store.put(loaded(DOT.id), 'reference');
    const empty = loaded(DOT.id, colors);
    store.put({ ...empty, entry: { ...empty.entry, status: 'empty' } }, 'unfinished');
    store.select('family');
    expect(store.colors(DOT)).toEqual(colors);
    expect(store.colors(BARTY)).toEqual({});
    store.select('reference');
    expect(store.colors(DOT)).toEqual({});
    store.select('unfinished');
    expect(store.colors(DOT)).toEqual({});
    store.select('procedural');
    expect(store.colors(DOT)).toEqual({});
    store.select('family');
    store.setMode('code');
    expect(store.colors(DOT)).toEqual({});
  });

  it('colors a glowing bug’s light: the set’s color with a paler core, or the game’s own pair', () => {
    expect(glowColors(undefined)).toEqual({ halo: 0xd8ff4f, core: 0xf4ffc0 });
    expect(glowColors({ lid: 0x204060 })).toEqual({ halo: 0xd8ff4f, core: 0xf4ffc0 });
    for (const glow of [0xff00ff, 0x40e0d0, 0x000000, 0xffffff])
      expect(glowColors({ glow })).toEqual({ halo: glow, core: lighten(glow, 0.65) });
  });

  it('puts that light where the set painted the lantern, or on the code-drawn tail', () => {
    const r = FLICK.radius * PIXELS_PER_METER;
    // The game's own spot: behind his middle and a little below it.
    const own = lanternAt(undefined, r);
    expect(own.x).toBeCloseTo(-0.7 * r, 9);
    expect(own.y).toBeCloseTo(0.1 * r, 9);
    expect(lanternAt({ glow: 0x40e0d0 }, r)).toEqual(own);
    // That spot, named on his template, is the same place: a set that says nothing loses nothing.
    const rig = rigOf(FLICK.id);
    const spot = { x: rig.origin.x + own.x * rig.scale, y: rig.origin.y + own.y * rig.scale };
    expect(spot.x).toBeCloseTo(272, 6);
    expect(spot.y).toBeCloseTo(528, 6);
    const named = parseSetColors({ bugs: { [FLICK.id]: { lantern: { x: 272, y: 528 } } } }, rigOf);
    const same = lanternAt(named.bugs[FLICK.id], r);
    expect(same.x).toBeCloseTo(own.x, 9);
    expect(same.y).toBeCloseTo(own.y, 9);
    // A set's own spot is used as it is, whatever the bug's size.
    expect(lanternAt({ lantern: { x: 30, y: -12 } }, r)).toEqual({ x: 30, y: -12 });
    expect(lanternAt({ lantern: { x: 30, y: -12 } }, r * 2)).toEqual({ x: 30, y: -12 });
  });
});

describe('shipped art sets', () => {
  const catalog = JSON.parse(readFileSync(join(ART, 'sets.json'), 'utf8')) as ArtSetCatalog;

  it.each(catalog.sets)('$name names colors only for what each bug has', ({ path }) => {
    const manifest = JSON.parse(readFileSync(join(ART, path, 'manifest.json'), 'utf8')) as Manifest;
    for (const entry of Object.values(manifest.assets)) {
      if (!entry.colors) continue;
      expect(entry.kind, entry.id).toBe('bug');
      const def = BUGS.get(entry.id);
      // Only a bug that glows casts a light, and only tint layers shimmer.
      if (entry.colors.glow !== undefined) expect(def.glows, `${entry.id} glow`).toBe(true);
      if (entry.colors.lantern !== undefined) expect(def.glows, `${entry.id} lantern`).toBe(true);
      if (entry.colors.sheen)
        expect(
          Object.values(entry.parts).some((p) => p.tintable),
          `${entry.id} sheen`,
        ).toBe(true);
    }
  });

  it('knows which bugs those are', () => {
    expect(BUGS.all.filter((d) => d.glows).map((d) => d.id)).toEqual([FLICK.id]);
  });
});
