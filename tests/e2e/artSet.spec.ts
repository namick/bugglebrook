import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SetPack } from '../../scripts/art/setPack.ts';
import { buildSetPack } from '../../scripts/art/setPack.ts';
import { parseWorld, toneColor } from '../../src/renderer/src/art/backdropData';
import type { RigFile } from '../../src/renderer/src/art/rigFile';
import { lighten } from '../../src/renderer/src/render/palette';
import {
  PLAZA_X,
  POND_X,
  backdropShows,
  chooseArtSet,
  clickUi,
  content,
  entities,
  entity,
  frames,
  glideFrames,
  installSetPack,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  spawnFrozen,
  waitForScene,
} from './app';
import type { TestHook } from './app';

// A whole art set at once: bugs, their colors and night lights, item sheets,
// and a backdrop, all in one set's folder. The crude fixtures stand in for
// the art. Each piece has its own spec (art, artColors, artLights, items,
// backdrop); this one checks that they load and show together.

const FIXTURES = join(import.meta.dirname, 'fixtures/art');
const SET = 'whole_set';
const DOT = 'bug_ladybug_dot';
const FLICK = 'bug_firefly_flick';
const TEAL = 0x40e0d0;
const PINK = 0xff66cc;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

let built: SetPack | null = null;

/** The set's source folder as an artist would keep it, built the way a tour builds one from disk. */
function wholeSet(): SetPack {
  if (built) return built;
  const root = mkdtempSync(join(tmpdir(), 'bugglebrook-set-'));
  try {
    const dir = join(root, 'sets', SET);
    mkdirSync(join(dir, 'bugs'), { recursive: true });
    mkdirSync(join(dir, 'faces'));
    mkdirSync(join(dir, 'backdrop'));
    writeFileSync(join(dir, 'set.json'), JSON.stringify({ name: 'Whole set', credit: 'Test fixture' }));
    for (const [id, sub] of [
      [DOT, 'bugs'],
      [FLICK, 'bugs'],
      ['face_kit', 'faces'],
    ] as const)
      for (const ext of ['ora', 'rig.json'])
        copyFileSync(join(FIXTURES, `${id}.${ext}`), join(dir, sub, `${id}.${ext}`));
    // A light on Dot's shell, and a light of the set's own color for Flick's lantern.
    const rig = JSON.parse(readFileSync(join(FIXTURES, `${DOT}.rig.json`), 'utf8')) as RigFile;
    const shell = rig.parts.find((p) => p.name === 'shell')!.pivot;
    writeFileSync(
      join(dir, 'bugs', `${DOT}.lights.json`),
      JSON.stringify({ lights: [{ part: 'shell', x: shell.x, y: shell.y, r: 80, color: hex(TEAL) }] }),
    );
    writeFileSync(join(dir, 'colors.json'), JSON.stringify({ bugs: { [FLICK]: { glow: hex(PINK) } } }));
    cpSync(join(FIXTURES, 'items'), join(dir, 'items'), { recursive: true });
    cpSync(join(FIXTURES, 'backdrop'), join(dir, 'backdrop'), {
      recursive: true,
      filter: (src) => !src.endsWith('.ts'),
    });
    built = buildSetPack(SET, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return built;
}

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const backdrop = (page: Page) => page.evaluate(() => window.__bb!.backdrop());
const itemArt = (page: Page, id: number) => page.evaluate((i) => window.__bb!.itemArt(i), id);
const bugArt = async (page: Page, id: number) =>
  (await page.evaluate((i) => window.__bb!.bugArt(i), id))?.art;
const colors = (page: Page, where: Parameters<TestHook['itemColors']>[0]) =>
  page.evaluate((w) => window.__bb!.itemColors(w), where);

/** Launch with the whole set installed, a world open and frozen, and a Dot of our own on flat ground. */
async function stage(): Promise<Awaited<ReturnType<typeof launchApp>> & { at: number; dot: number }> {
  const app = await launchApp();
  const { page } = app;
  await waitForScene(page, 'menu');
  await page.evaluate(() => window.__bb!.sfxFixture('all', true));
  await installSetPack(page, wholeSet());
  await openFrozen(page, 0);
  const at = PLAZA_X + 20;
  await send(page, { type: 'spawn', kind: 'bug', defId: DOT, x: at, y: 7 });
  await frames(page, 2);
  const dot = (await entities(page))
    .filter((e) => e.defId === DOT && !e.bug?.pending)
    .sort((a, b) => Math.abs(a.x - at) - Math.abs(b.x - at))[0]!.id;
  await content(page, dot);
  return { ...app, at, dot };
}

test('a set with bugs, items, and a backdrop shows all three when the player picks it, and its tone map leaves items alone', async () => {
  const pack = wholeSet();
  // Every piece built: three bug files, three item sheets, and a backdrop with a sky, a tone map, and strips.
  expect(pack.errors, pack.report).toBe(0);
  const asset = (id: string) => pack.art.assets.find((a) => a.id === id)!;
  expect(pack.art.assets.map((a) => a.status)).toEqual(['drawn', 'drawn', 'drawn']);
  expect(asset(DOT).lights).toHaveLength(1);
  expect(asset(FLICK).colors).toEqual({ glow: PINK });
  expect(pack.items!.sheets.map((s) => s.status)).toEqual(['drawn', 'drawn', 'drawn']);
  expect(Object.keys(pack.backdrop!.manifest.strips)).toHaveLength(3);
  const anchors = parseWorld(pack.backdrop!.manifest.world).world!.tone;
  /** The colors in a list that the set's tone map would change, if it reached them. */
  const tonable = (list: number[] | null): number[] =>
    [...new Set((list ?? []).filter((c) => toneColor(c, anchors) !== c))].sort();

  const { page, close, errors, at, dot } = await stage();
  try {
    const pebble = await spawnFrozen(page, 'item_pebble', at + 3);
    const cork = await spawnFrozen(page, 'item_cork', at + 5);
    const hat = await spawnFrozen(page, 'item_hat_thimble', at + 7);
    const acorn = await spawnFrozen(page, 'item_hat_acorn_cap', at + 9);
    await jumpTo(page, at - 8);
    await frames(page, 30);
    // The original art first: code-drawn bug and items, and the game's own backdrop.
    expect(await bugArt(page, dot)).toBe('code');
    expect(await itemArt(page, pebble)).toEqual({ art: 'code', texture: null });
    expect(await backdrop(page)).toMatchObject({ ready: true, set: null, sky: false, tone: 0, toned: 0 });
    // The cork is brown, a hue this set's tone map moves. So is the acorn cap. The set paints neither.
    const corkPlain = tonable(await colors(page, { id: cork }));
    const acornPlain = tonable(await colors(page, { id: acorn }));
    expect(corkPlain.length).toBeGreaterThan(0);
    expect(acornPlain.length).toBeGreaterThan(0);

    // The player picks the set with the Art arrows.
    await clickUi(page, 'pause');
    await chooseArtSet(page, SET);
    expect((await page.evaluate(() => window.__bb!.artChoice()))?.name).toBe('Whole set');
    await clickUi(page, 'resume');
    await backdropShows(page, SET);
    await frames(page, 2);
    // Its bug, its items, and its backdrop are all on.
    expect(await bugArt(page, dot)).toBe('drawn');
    const painted = (await itemArt(page, pebble))!;
    expect(painted.art).toBe('sheet');
    const on = (await backdrop(page))!;
    expect(on).toMatchObject({ sky: true, tone: 2 });
    expect(on.toned).toBeGreaterThan(1000);
    expect(on.strips.far.has).toEqual(['area_flowerbed_stage_far', 'area_puddle_pond_far']);
    expect((await page.evaluate(() => window.__bb!.look())).skyTop).not.toBe(0x8fd3f0);

    // The tone map recolored the ground. The things lying on it keep their colors,
    // whether the set painted them or left them to code.
    expect(await itemArt(page, cork)).toEqual({ art: 'code', texture: null });
    expect(tonable(await colors(page, { id: cork }))).toEqual(corkPlain);
    expect(tonable(await colors(page, { id: acorn }))).toEqual(acornPlain);

    // On the drawn bug's head, the painted hat is the same painting it was on the ground.
    const loose = (await itemArt(page, hat))!;
    expect(loose.art).toBe('sheet');
    const wornArt = () => page.evaluate((id) => window.__bb!.wornItemArt(id), dot);
    await send(page, { type: 'wear', bug: dot, item: hat });
    await frames(page, 2);
    expect(await wornArt()).toEqual([{ defId: 'item_hat_thimble', ...loose }]);
    // The acorn cap knocks it off. It is code-drawn up there too, in its own browns.
    await send(page, { type: 'wear', bug: dot, item: acorn });
    await frames(page, 2);
    expect(await wornArt()).toEqual([{ defId: 'item_hat_acorn_cap', art: 'code', texture: null }]);
    expect(tonable(await colors(page, { bug: dot, defId: 'item_hat_acorn_cap' }))).toEqual(acornPlain);
    expect(await itemArt(page, pebble)).toEqual(painted);

    // In the hand, with the real mouse, and then in the pocket.
    const from = await pressFrozen(page, cork);
    await glideFrames(page, from, 0, -120, 6, 2);
    expect((await entity(page, cork))?.held).toBe(true);
    expect(tonable(await colors(page, { id: cork }))).toEqual(corkPlain);
    await send(page, { type: 'pocket_put', slot: 0 });
    await frames(page, 3);
    await page.mouse.up();
    expect((await page.evaluate(() => window.__bb!.pocket()))[0]).toEqual([cork]);
    await frames(page, 2);
    expect(await page.evaluate(() => window.__bb!.pocketItemArt(0))).toEqual({ art: 'code', texture: null });
    expect(tonable(await colors(page, { slot: 0 }))).toEqual(corkPlain);
    // Wherever else an item is pictured (the journal, a thought bubble), the set's paintings show.
    expect(await page.evaluate(() => window.__bb!.itemArtFor('item_berry_red'))).toBe('sheet');
    expect(await page.evaluate(() => window.__bb!.itemArtFor('item_cork'))).toBe('code');

    // Back to the original art: all three go at once.
    await clickUi(page, 'pause');
    await chooseArtSet(page, 'procedural');
    await clickUi(page, 'resume');
    await backdropShows(page, null);
    await frames(page, 2);
    expect(await bugArt(page, dot)).toBe('code');
    expect(await itemArt(page, pebble)).toEqual({ art: 'code', texture: null });
    expect(await backdrop(page)).toMatchObject({ ready: true, sky: false, tone: 0, toned: 0 });
    expect(tonable(await colors(page, { slot: 0 }))).toEqual(corkPlain);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('a set’s night lights and its lantern color shine over its own sky and painted strips', async () => {
  const { page, close, errors, at, dot } = await stage();
  try {
    const lights = () => page.evaluate(() => window.__bb!.bugLights());
    /** A teal light on a bug: within its body of its middle. */
    const lit = async (id: number): Promise<number> => {
      const bug = (await entity(page, id))!;
      const near = (await lights()).filter(
        (l) => l.color === TEAL && Math.hypot(l.x - bug.x, l.y - bug.y) < 1.3,
      );
      expect(near.length, `lights on bug ${id}`).toBe(1);
      expect(near[0]!.r).toBeCloseTo(0.2);
      return near[0]!.alpha;
    };
    await send(page, { type: 'set_time', hour: 23 });
    await send(page, { type: 'spawn', kind: 'bug', defId: FLICK, x: at - 3, y: 7 });
    await frames(page, 2);
    const flick = (await entities(page)).find(
      (e) => e.defId === FLICK && !e.bug?.pending && Math.abs(e.x - at) < 6,
    )!.id;
    await content(page, flick);
    await jumpTo(page, at - 8);
    await page.evaluate((id) => window.__bb!.artSelect(id), SET);
    await backdropShows(page, SET);
    await frames(page, 60);
    // The set's own night: its sky, dark enough that the lights are on.
    const night = await page.evaluate(() => window.__bb!.look());
    expect(night.skyTop).toBe(0x2a0a3a);
    expect(night.glow).toBeGreaterThan(0.6);
    // Dot's light sits on Dot, in a world the tone map has recolored.
    expect((await backdrop(page))!.toned).toBeGreaterThan(1000);
    expect(await lit(dot)).toBeGreaterThan(0.2);
    // Flick's lantern is the set's pink, with a paler core.
    expect(await page.evaluate(() => window.__bb!.weatherLights())).toEqual(
      expect.arrayContaining([PINK, lighten(PINK, 0.65)]),
    );

    // Over at the pond the set has painted strips. A Dot dropped in there is lit the same way.
    await jumpTo(page, POND_X + 16 - 9.6);
    await expect.poll(async () => (await backdrop(page))!.strips.far.drawn).toContain('area_puddle_pond_far');
    expect((await backdrop(page))!.strips.mid.drawn).toEqual(['area_puddle_pond_mid']);
    const before = new Set((await entities(page)).map((e) => e.id));
    await send(page, { type: 'spawn', kind: 'bug', defId: DOT, x: POND_X + 16, y: 3 });
    await frames(page, 2);
    const other = (await entities(page)).find((e) => !before.has(e.id) && e.defId === DOT)!.id;
    expect(await bugArt(page, other)).toBe('drawn');
    expect(await lit(other)).toBeGreaterThan(0.2);

    // The original art has no lights, and the lantern is the game's yellow-green again.
    await page.evaluate(() => window.__bb!.artSelect('procedural'));
    await backdropShows(page, null);
    await jumpTo(page, at - 8);
    await frames(page, 30);
    expect(await lights()).toEqual([]);
    expect(await page.evaluate(() => window.__bb!.weatherLights())).not.toContain(PINK);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
