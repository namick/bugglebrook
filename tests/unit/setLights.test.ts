import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Container } from 'pixi.js';
import { BufferImageSource, MeshRope, Point, Sprite } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAsset, buildSets } from '../../scripts/art/build.ts';
import { decodePng } from '../../scripts/art/png.ts';
import { rebuild } from '../../scripts/art/vitePlugin.ts';
import { BUGS, CONTENT } from '../../src/game/data';
import type { BugDef } from '../../src/game/data/types';
import type { LoadedArt } from '../../src/renderer/src/art/artStore';
import { atlasSet } from '../../src/renderer/src/art/artStore';
import { DEFAULT_SKY, SKY_RULES, luma } from '../../src/renderer/src/art/backdropData';
import type { SkyPalette } from '../../src/renderer/src/art/backdropData';
import { poseFrame, posesFor } from '../../src/renderer/src/art/poses';
import type { AtlasJson, BugLight, Manifest, RigFile } from '../../src/renderer/src/art/rigFile';
import {
  LIGHTS_PER_BUG,
  LIGHT_FORMS,
  LIGHT_MAX_R,
  LIGHT_NIGHT,
  alongRope,
  lightInForm,
  nightLightAlpha,
  parseBugLights,
} from '../../src/renderer/src/art/setLights';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';
import type { BugFrame, LightSpot } from '../../src/renderer/src/render/draw/bug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import { NO_WEATHER, skyLook } from '../../src/renderer/src/render/skyLook';
import { BUG_LIGHTS } from '../../src/renderer/src/render/weatherView';

// An art set's night lights (a bug's .lights.json): the file's checks, the
// build that turns them into offsets from each part's pivot, and the cutout
// bug placing them on its parts. Drawn with the crude test art pack.

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const ART = join(ROOT, 'src/renderer/art');

const DOT = BUGS.get('bug_ladybug_dot');
const ROLLO = BUGS.get('bug_pillbug_rollo');
const BOING = BUGS.get('bug_grasshopper_boing');
const TEAL = '#40e0d0';

const rigOf = (id: string): RigFile =>
  JSON.parse(readFileSync(join(FIX, `${id}.rig.json`), 'utf8')) as RigFile;
const pivotOf = (rig: RigFile, part: string) => rig.parts.find((p) => p.name === part)!.pivot;

/** A light in a lights file: `dx`, `dy` template pixels from its part's pivot. */
function at(rig: RigFile, part: string, dx = 0, dy = 0, more: object = {}): object {
  const p = pivotOf(rig, part);
  return { part, x: p.x + dx, y: p.y + dy, r: 40, color: TEAL, ...more };
}

/** A fixture bug built with a lights file and turned into textures, as the game loads it. */
function loaded(id: string, lights?: object[]): LoadedArt {
  const text = lights ? JSON.stringify({ lights }) : undefined;
  const built = buildAsset(new Uint8Array(readFileSync(join(FIX, `${id}.ora`))), rigOf(id), { lights: text });
  expect(built.messages, id).toEqual([]);
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

const view = (def: BugDef, lights?: object[]): SpriteBugView =>
  new SpriteBugView(def, loaded(def.id, lights), kit);
const frame = (def: BugDef, pose: string, t = 0.3, more: Partial<BugFrame> = {}): BugFrame => ({
  ...poseFrame(
    posesFor(def).find((p) => p.id === pose)!,
    t,
  ),
  ...more,
});
/** The lights as they sit, in the bug sprite's own coordinates. */
function spots(v: SpriteBugView, space: Container = v): LightSpot[] {
  const out: LightSpot[] = [];
  v.nightLights(space, out);
  return out;
}
/** Every visible sprite or feeler showing a part, near side only. */
function shown(v: SpriteBugView, part: string): (Sprite | MeshRope)[] {
  const out: (Sprite | MeshRope)[] = [];
  const walk = (c: Container): void => {
    if (!c.visible) return;
    if ((c instanceof Sprite || c instanceof MeshRope) && c.label === part && c.alpha === 1) out.push(c);
    c.children.forEach((ch) => walk(ch as Container));
  };
  walk(v);
  return out;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('a bug’s lights file', () => {
  const rig = rigOf(DOT.id);
  const shell = pivotOf(rig, 'shell');

  it('turns template pixels into game pixels from the part’s pivot', () => {
    const { lights, problems } = parseBugLights(
      JSON.stringify({
        lights: [
          { part: 'shell', x: shell.x + 40, y: shell.y - 20, r: 60, color: '#40E0D0' },
          { part: 'antenna_tip', x: 700, y: 300, r: 1, color: TEAL, forms: ['normal', 'flying'] },
        ],
      }),
      rig,
    );
    expect(problems).toEqual([]);
    const tip = pivotOf(rig, 'antenna_tip');
    expect(lights).toEqual([
      { part: 'shell', x: 10, y: -5, r: 15, color: 0x40e0d0 },
      {
        part: 'antenna_tip',
        x: Math.round((700 - tip.x) * 250) / 1000,
        y: Math.round((300 - tip.y) * 250) / 1000,
        r: 0.25,
        color: 0x40e0d0,
        forms: ['normal', 'flying'],
      },
    ]);
    // A pivot the artist moved with a `pivot_` dot is the one the part was cut on.
    const moved = parseBugLights(
      JSON.stringify({ lights: [{ part: 'shell', x: shell.x, y: shell.y, r: 60, color: TEAL }] }),
      rig,
      new Map([['shell', { x: shell.x - 8, y: shell.y + 4 }]]),
    );
    expect(moved.lights[0]).toMatchObject({ x: 2, y: -1 });
  });

  it('says what is wrong with a file it cannot read at all', () => {
    expect(parseBugLights('{ "lights": [', rig).problems[0]).toMatch(/^The lights file is not valid JSON: /);
    const shape =
      'The lights file must look like { "lights": [ { "part": "shell", "x": 350, "y": 634, "r": 60, "color": "#7dffe0" } ] }.';
    for (const raw of [null, [], 7, {}, { lights: {} }, { lights: 'all' }])
      expect(parseBugLights(JSON.stringify(raw), rig)).toEqual({ lights: [], problems: [shape] });
  });

  it('leaves out each wrong light, says why, and keeps the right ones', () => {
    const good = { part: 'shell', x: shell.x, y: shell.y, r: 60, color: TEAL };
    const { lights, problems } = parseBugLights(
      JSON.stringify({
        set: 'xeno',
        lights: [
          good,
          { ...good, part: 'eye_white' },
          { ...good, x: -1 },
          { ...good, y: rig.canvas.h + 1 },
          { ...good, x: '350' },
          { ...good, r: 0 },
          { ...good, r: LIGHT_MAX_R + 1 },
          { ...good, color: 'teal' },
          { ...good, forms: [] },
          { ...good, forms: ['cocoon'] },
          { ...good, glow: 2 },
          'shell',
          { ...good, forms: ['curled'] },
        ],
      }),
      rig,
    );
    const parts = rig.parts.map((p) => p.name).join(', ');
    const canvas = `"x" and "y" must be numbers inside the canvas (${rig.canvas.w} x ${rig.canvas.h}).`;
    expect(problems).toEqual([
      '"set" is not a key the lights file can have. Only "lights" is.',
      `Light 2: "part" must be one of this bug's parts: ${parts}.`,
      `Light 3: ${canvas}`,
      `Light 4: ${canvas}`,
      `Light 5: ${canvas}`,
      'Light 6: "r" must be a number from 1 to 400.',
      'Light 7: "r" must be a number from 1 to 400.',
      'Light 8: "color" must be a color like "#7dffe0".',
      'Light 9: "forms" must list one or more of normal, curled, in_shell, flying.',
      'Light 10: "forms" must list one or more of normal, curled, in_shell, flying.',
      'Light 11: "glow" is not a key a light has. The keys are part, x, y, r, color, forms.',
      'Light 12 must be an object, like { "part": "shell", "x": 350, "y": 634, "r": 60, "color": "#7dffe0" }.',
    ]);
    expect(lights).toEqual([
      { part: 'shell', x: 0, y: 0, r: 15, color: 0x40e0d0 },
      { part: 'shell', x: 0, y: 0, r: 15, color: 0x40e0d0, forms: ['curled'] },
    ]);
  });

  it('takes at most sixteen lights', () => {
    const good = { part: 'shell', x: shell.x, y: shell.y, r: 60, color: TEAL };
    const { lights, problems } = parseBugLights(
      JSON.stringify({ lights: Array.from({ length: LIGHTS_PER_BUG + 3 }, () => good) }),
      rig,
    );
    expect(lights).toHaveLength(LIGHTS_PER_BUG);
    expect(problems).toEqual(['There are 19 lights. A bug can have at most 16; the rest are left out.']);
    // A cast of sixteen with ten lights each is about what the world draws at once.
    expect(BUG_LIGHTS).toBeGreaterThanOrEqual(150);
  });
});

describe('when the lights show', () => {
  const awake = { asleep: false, submerged: 0, alpha: 1 };

  it('follows the sky’s night glow: off by day, rising at dusk, never past full', () => {
    expect(nightLightAlpha(0, awake)).toBe(0);
    expect(nightLightAlpha(LIGHT_NIGHT, awake)).toBe(0);
    const steps = [0.15, 0.3, 0.6, 1].map((glow) => nightLightAlpha(glow, awake));
    expect(steps[0]).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]!);
    // In step with the glow: half the glow, half the light.
    expect(nightLightAlpha(0.5, awake)).toBeCloseTo(nightLightAlpha(1, awake) / 2);
    expect(nightLightAlpha(1, awake, 5)).toBe(1);
  });

  it('stays off at noon under the dimmest day a set’s sky may have, and comes on in its brightest night', () => {
    // Greys right on the sky rules' edges: the darkest `near` a day may have, the brightest a night may.
    const grey = (l: number): number => (l << 16) | (l << 8) | l;
    const edge: SkyPalette = structuredClone(DEFAULT_SKY);
    edge.moments.day.near = grey(SKY_RULES.dayNear);
    edge.moments.night.near = edge.moments.late_night.near = grey(SKY_RULES.nightNear[1]);
    expect(luma(edge.moments.day.near)).toBeCloseTo(SKY_RULES.dayNear);
    const noon = skyLook(12, NO_WEATHER, edge).glow;
    expect(noon).toBeGreaterThan(0);
    expect(noon).toBeLessThan(LIGHT_NIGHT);
    expect(nightLightAlpha(noon, awake)).toBe(0);
    const midnight = skyLook(0, NO_WEATHER, edge).glow;
    expect(nightLightAlpha(midnight, awake)).toBeGreaterThan(0.4);
    expect(nightLightAlpha(midnight, { ...awake, asleep: true })).toBeGreaterThan(0.2);
  });

  it('is dimmer on a sleeping bug, out under water and on a disguised bug, and fades with a ghost', () => {
    const full = nightLightAlpha(1, awake);
    expect(nightLightAlpha(1, { ...awake, asleep: true })).toBeCloseTo(full / 2);
    expect(nightLightAlpha(1, { ...awake, submerged: 0.31 })).toBe(0);
    expect(nightLightAlpha(1, { ...awake, submerged: 0.3 })).toBe(full);
    expect(nightLightAlpha(1, { ...awake, disguised: true })).toBe(0);
    expect(nightLightAlpha(1, { ...awake, alpha: 0.35 })).toBeCloseTo(full * 0.35);
    expect(nightLightAlpha(1, awake, 0.9)).toBeCloseTo(full * 0.9);
  });

  it('keeps a light to its forms', () => {
    const light: BugLight = { part: 'belly', x: 0, y: 0, r: 10, color: 0xffffff };
    for (const form of LIGHT_FORMS) expect(lightInForm(light, form)).toBe(true);
    const flying = { ...light, forms: ['flying'] };
    expect(LIGHT_FORMS.filter((f) => lightInForm(flying, f))).toEqual(['flying']);
  });

  it('finds a point along a feeler by its points, as the drawing is stretched over them', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: -10 },
      { x: 30, y: -10 },
    ];
    expect(alongRope(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(alongRope(pts, 0.25)).toEqual({ x: 0, y: -5 });
    expect(alongRope(pts, 0.5)).toEqual({ x: 0, y: -10 });
    expect(alongRope(pts, 0.75)).toEqual({ x: 15, y: -10 });
    expect(alongRope(pts, 1)).toEqual({ x: 30, y: -10 });
    expect(alongRope(pts, 4)).toEqual({ x: 30, y: -10 });
    expect(alongRope(pts, -1)).toEqual({ x: 0, y: 0 });
    expect(alongRope([], 0.5)).toEqual({ x: 0, y: 0 });
  });
});

describe('the cutout bug’s night lights', () => {
  const rig = rigOf(DOT.id);

  it('has none without a lights file, and the code-drawn bug has none', () => {
    const v = view(DOT);
    v.update(frame(DOT, 'idle'));
    expect(spots(v)).toEqual([]);
    const code = new BugSprite(DOT);
    code.update(frame(DOT, 'idle'));
    const out: LightSpot[] = [];
    code.nightLights(code, out);
    expect(out).toEqual([]);
  });

  it('puts a light on its part’s sprite, the same at 1x and 2x, and flips it with the bug', () => {
    const lights = [at(rig, 'shell'), at(rig, 'shell', 80, 0)];
    const places: LightSpot[][] = [];
    for (const scale of [1, 2] as const) {
      SpriteBugView.forceScale = scale;
      try {
        const v = view(DOT, lights);
        v.update(frame(DOT, 'idle'));
        const [pivot, off] = spots(v);
        const shell = shown(v, 'shell')[0] as Sprite;
        // On the pivot the importer cut the shell around, and 80 template px (20 game px) along it.
        expect(dist(pivot!, v.toLocal(new Point(0, 0), shell))).toBeLessThan(0.01);
        expect(dist(pivot!, off!)).toBeCloseTo(20, 0);
        expect(pivot).toMatchObject({ r: 10, color: 0x40e0d0 });
        places.push([pivot!, off!]);
      } finally {
        SpriteBugView.forceScale = null;
      }
    }
    for (const i of [0, 1]) expect(dist(places[0]![i]!, places[1]![i]!)).toBeLessThan(0.01);

    const v = view(DOT, lights);
    v.update(frame(DOT, 'idle', 0.3, { facing: 1 }));
    const right = spots(v);
    v.update(frame(DOT, 'idle', 0.3, { facing: -1 }));
    const left = spots(v);
    right.forEach((r, i) => expect(dist({ x: -r.x, y: r.y }, left[i]!)).toBeLessThan(0.01));
    expect(left[1]!.x).toBeLessThan(left[0]!.x);
  });

  it('turns with a hinged part and grows with the bug', () => {
    const v = view(DOT, [at(rig, 'shell'), at(rig, 'shell', 80, 0)]);
    const arm = (): number => {
      const [a, b] = spots(v);
      return Math.atan2(b!.y - a!.y, b!.x - a!.x);
    };
    v.update(frame(DOT, 'idle'));
    const closed = arm();
    v.update(frame(DOT, 'fly'));
    // Her shell swings up on its hinge to fly, and the light swings with it.
    expect(Math.abs(arm() - closed)).toBeGreaterThan(0.3);

    v.update(frame(DOT, 'idle'));
    const [small] = spots(v);
    v.scale.set(2);
    const [big] = spots(v, v.parent ?? v);
    expect(big!.r).toBe(small!.r * 2);
  });

  it('shows a light on each near copy of a part drawn many times, and none on the far side', () => {
    const v = view(DOT, [at(rig, 'leg_lower', 0, 40)]);
    v.update(frame(DOT, 'walk'));
    const legs = v.lastSkeleton!.items.filter((i) => i.kind === 'limb');
    const near = legs.filter((i) => !i.far).length;
    expect(near).toBeGreaterThan(1);
    expect(legs.length).toBeGreaterThan(near);
    const lit = spots(v);
    expect(lit).toHaveLength(near);
    // One on each near shin, 10 game px down from the knee, give or take the shin's stretch (0.8 to 1.25).
    const shins = shown(v, 'leg_lower') as Sprite[];
    expect(shins).toHaveLength(near);
    for (const spot of lit) {
      const down = Math.min(...shins.map((s) => dist(spot, v.toLocal(new Point(0, 0), s))));
      expect(down).toBeGreaterThan(7.9);
      expect(down).toBeLessThan(12.6);
    }
  });

  it('keeps a light to its part: the ball has its own, and the rest are off while he is curled', () => {
    const rollo = rigOf(ROLLO.id);
    const v = view(ROLLO, [at(rollo, 'body'), at(rollo, 'ball', 80, 0, { color: '#ff00ff' })]);
    v.update(frame(ROLLO, 'idle'));
    expect(spots(v).map((s) => s.color)).toEqual([0x40e0d0]);
    v.update(frame(ROLLO, 'curled', 0.3, { angle: 0 }));
    const [flat] = spots(v);
    expect(spots(v).map((s) => s.color)).toEqual([0xff00ff]);
    // The ball rolls with the body, and its light goes round with it.
    v.update(frame(ROLLO, 'curled', 0.3, { angle: Math.PI / 2 }));
    const [turned] = spots(v);
    expect(dist(flat!, turned!)).toBeGreaterThan(15);
  });

  it('keeps a light to its forms', () => {
    const v = view(DOT, [at(rig, 'belly', 0, 0, { forms: ['flying'] }), at(rig, 'head')]);
    v.update(frame(DOT, 'idle'));
    expect(spots(v)).toHaveLength(1);
    v.update(frame(DOT, 'fly'));
    expect(spots(v)).toHaveLength(2);
  });

  it('rides a feeler to its tip as it bends', () => {
    const boing = rigOf(BOING.id);
    const antenna = boing.parts.find((p) => p.name === 'antenna')!;
    expect(antenna.kind).toBe('rope');
    const v = view(BOING, [at(boing, 'antenna', 0, -antenna.length!), at(boing, 'antenna')]);
    v.update(frame(BOING, 'idle'));
    const ropes = shown(v, 'antenna') as MeshRope[];
    expect(ropes.length).toBeGreaterThan(0);
    const lit = spots(v);
    expect(lit).toHaveLength(ropes.length * 2);
    const feeler = v.lastSkeleton!.items.find((i) => i.kind === 'rope' && !i.far);
    if (feeler?.kind !== 'rope') throw new Error('no feeler');
    const ends = [feeler.pts.at(-1)!, feeler.pts[0]!].map((p) => v.toLocal(new Point(p.x, p.y), ropes[0]!));
    expect(dist(lit[0]!, ends[0]!)).toBeLessThan(0.01);
    expect(dist(lit[1]!, ends[1]!)).toBeLessThan(0.01);
    // The tip is well away from the base, and moves when he hops.
    expect(dist(lit[0]!, lit[1]!)).toBeGreaterThan(antenna.length! / 4 / 2);
    v.update(frame(BOING, 'hop'));
    expect(dist(spots(v)[0]!, lit[0]!)).toBeGreaterThan(0.5);
  });

  it('hides the lights a hat covers, and shows none on a bug that is not drawn', () => {
    // A grid of lights over her head and shell.
    const grid: object[] = [];
    for (const dx of [-120, -40, 40, 120])
      for (const dy of [-160, -80, 0]) grid.push(at(rig, 'head', dx, dy));
    const bare = view(DOT, grid);
    bare.update(frame(DOT, 'idle'));
    expect(spots(bare)).toHaveLength(grid.length);

    const hatted = view(DOT, grid);
    hatted.setWorn([{ id: 1, def: CONTENT.items.get('item_hat_acorn_cap') }], (d) => new ItemSprite(d, 0));
    hatted.update(frame(DOT, 'idle'));
    const left = spots(hatted);
    expect(left.length).toBeGreaterThan(0);
    expect(left.length).toBeLessThan(grid.length);
    // The ones left are the ones the hat is not over.
    const hat = hatted.wornAt.get(1)!;
    expect(hat.hidden).toBe(false);

    hatted.visible = false;
    expect(spots(hatted)).toEqual([]);
  });
});

describe('lights in the build', () => {
  const src = mkdtempSync(join(tmpdir(), 'bb-art-lights-'));
  const dir = join(src, 'sets/family');
  const file = join(dir, 'bugs', `${DOT.id}.lights.json`);
  const rig = rigOf(DOT.id);
  beforeAll(() => {
    mkdirSync(join(dir, 'bugs'), { recursive: true });
    writeFileSync(join(dir, 'set.json'), JSON.stringify({ name: 'Family drawing', credit: 'Test artist' }));
    for (const ext of ['ora', 'rig.json'])
      copyFileSync(join(FIX, `${DOT.id}.${ext}`), join(dir, 'bugs', `${DOT.id}.${ext}`));
  });
  afterAll(() => rmSync(src, { recursive: true, force: true }));

  const entry = () =>
    (JSON.parse(new TextDecoder().decode(buildSets(src).files['sets/family/manifest.json']!)) as Manifest)
      .assets[DOT.id]!;

  it('leaves the manifest as it was for a bug with no lights file', () => {
    rmSync(file, { force: true });
    expect('lights' in entry()).toBe(false);
  });

  it('reads the file beside the .ora into the manifest, and hot reload carries it too', () => {
    writeFileSync(file, JSON.stringify({ lights: [at(rig, 'shell', 40, -20)] }));
    const e = entry();
    expect(e.lights).toEqual([{ part: 'shell', x: 10, y: -5, r: 10, color: 0x40e0d0 }]);
    expect(e.report).toEqual([]);
    expect(rebuild(dir, [DOT.id]).pack.assets[0]!.lights).toEqual(e.lights);
  });

  it('reports a wrong light as a warning on that bug and still draws the bug', () => {
    writeFileSync(
      file,
      JSON.stringify({ lights: [at(rig, 'shell'), { ...at(rig, 'shell'), part: 'nose' }] }),
    );
    const e = entry();
    expect(e.status).toBe('drawn');
    expect(e.lights).toHaveLength(1);
    expect(e.report.map((m) => m.level)).toEqual(['warning']);
    expect(e.report[0]!.text).toMatch(/^Light 2: "part" must be one of this bug's parts: /);
    writeFileSync(file, 'not json');
    expect(entry().report[0]).toMatchObject({ level: 'warning' });
    expect(entry().report[0]!.text).toMatch(/^The lights file is not valid JSON/);
    expect('lights' in entry()).toBe(false);
  });
});

describe('shipped art sets', () => {
  const catalog = JSON.parse(readFileSync(join(ART, 'sets.json'), 'utf8')) as {
    sets: { name: string; path: string }[];
  };

  it.each(catalog.sets)('$name puts its lights on parts its bugs have', ({ path }) => {
    const manifest = JSON.parse(readFileSync(join(ART, path, 'manifest.json'), 'utf8')) as Manifest;
    for (const e of Object.values(manifest.assets)) {
      expect((e.lights ?? []).length, e.id).toBeLessThanOrEqual(LIGHTS_PER_BUG);
      for (const light of e.lights ?? [])
        expect(Object.keys(e.parts), `${e.id} ${light.part}`).toContain(light.part);
    }
  });
});
