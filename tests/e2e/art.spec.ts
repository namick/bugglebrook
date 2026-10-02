import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BuiltAsset } from '../../scripts/art/build.ts';
import { buildAsset, toArtPack } from '../../scripts/art/build.ts';
import { readOra, writeOra } from '../../scripts/art/ora.ts';
import { keep } from '../../scripts/art/template.ts';
import { EYE_PIECES, MOUTH_PIECES } from '../../src/renderer/src/art/faceKit';
import type { ArtPack, RigFile } from '../../src/renderer/src/art/rigFile';
import type { EyeShape, MouthShape } from '../../src/renderer/src/render/bugFace';
import {
  bugNamed,
  content,
  entity,
  frames,
  freeze,
  glideFrames,
  launchApp,
  lookAt,
  openFrozen,
  pressFrozen,
} from './app';

// The art pipeline end to end: the crude test art pack (tests/e2e/fixtures/art,
// made by make.ts) goes through the real importer, into the running game, and
// Dot is drawn from its sprites while every other bug stays code-drawn.

const FIXTURES = join(import.meta.dirname, 'fixtures/art');
const ROOT = resolve(import.meta.dirname, '../..');

const rigOf = (id: string): RigFile =>
  JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as RigFile;
const oraOf = (id: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`)));

function pack(dot: Uint8Array = oraOf('bug_ladybug_dot')): { pack: ArtPack; built: BuiltAsset[] } {
  const built = [buildAsset(dot, rigOf('bug_ladybug_dot')), buildAsset(oraOf('face_kit'), rigOf('face_kit'))];
  return { pack: toArtPack(built), built };
}

const install = (page: Page, p: ArtPack): Promise<void> =>
  page.evaluate((x) => window.__bb!.loadArtPack(x as ArtPack), p as never);

const art = (page: Page, id: number) => page.evaluate((i) => window.__bb!.bugArt(i), id);

test('Dot is drawn from the test art pack, the others stay code-drawn, and she still plays', async () => {
  const { page, close, errors } = await launchApp();
  try {
    const { pack: p, built } = pack();
    expect(built.map((b) => b.entry.status)).toEqual(['drawn', 'drawn']);
    await install(page, p);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    await content(page, dot.id);
    await frames(page, 2);
    await expect.poll(async () => (await art(page, dot.id))?.art).toBe('drawn');
    const shown = (await art(page, dot.id))!.shown!;
    expect(shown.parts).toEqual(
      expect.arrayContaining(['belly', 'head', 'shell', 'leg_upper', 'leg_lower', 'antenna']),
    );
    // Her face comes from the kit and her own pink mouths, none of it from code.
    expect(shown.codeFace).toBe(0);
    expect(shown.face.length).toBeGreaterThan(1);
    const other = (await art(page, rollo.id))!;
    expect(other.art).toBe('code');
    expect(other.reason).toBe('nothing drawn yet');

    // Pick her up with the real mouse and fling her.
    const at = await pressFrozen(page, dot.id);
    expect((await entity(page, dot.id))?.bug?.mode).toBe('st_held');
    const to = await glideFrames(page, at, 0, -120, 6, 2);
    await glideFrames(page, to, 220, -60, 3, 1);
    await page.mouse.up();
    await frames(page, 3);
    expect((await entity(page, dot.id))?.bug?.mode).toBe('st_airborne');
    // Whatever face the game picks, the sprites show exactly its kit pieces.
    await expect
      .poll(async () => {
        const s = (await art(page, dot.id))!.shown!;
        const eyes = EYE_PIECES[s.eyes as EyeShape];
        const mouth = MOUTH_PIECES[s.mouth as MouthShape];
        const closed = s.face.includes('eye_closed');
        const ok =
          s.codeFace === 0 &&
          (closed || eyes.every((n) => s.face.includes(n))) &&
          mouth.some((n) => s.face.includes(n));
        return ok;
      })
      .toBe(true);
    await freeze(page, false);
    await expect.poll(async () => (await art(page, dot.id))?.art).toBe('drawn');
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

/** Every bug in the crude pack, and the kit. */
function fullPack(): ArtPack {
  const ids = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.ora'))
    .map((f) => f.replace('.ora', ''));
  return toArtPack(ids.map((id) => buildAsset(oraOf(id), rigOf(id))));
}

test('with the whole pack every bug is drawn, and Twig shares his stick with the plaza twigs', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await install(page, fullPack());
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await openFrozen(page, 0);
    await frames(page, 2);
    const bugs = (await page.evaluate(() => window.__bb!.entities())).filter((e) => e.kind === 'bug');
    for (const b of bugs) await expect.poll(async () => (await art(page, b.id))?.art, b.defId).toBe('drawn');
    // Disguised, Twig is only his stick, and the item twigs show the very same drawing.
    const twig = bugs.find((e) => e.defId === 'bug_stickinsect_twig')!;
    const items = (await page.evaluate(() => window.__bb!.entities())).filter((e) => e.defId === 'item_twig');
    expect(items.length).toBeGreaterThan(0);
    // (Bugs off screen aren't drawn: look at him first.)
    await lookAt(page, twig.x - 9.6);
    await frames(page, 2);
    await expect.poll(async () => (await art(page, twig.id))!.shown?.parts).toEqual(['stick']);
    const tex = (id: number, part: string) =>
      page.evaluate(([i, p]) => window.__bb!.partTexture(i as number, p as string), [id, part]);
    const stick = await tex(twig.id, 'stick');
    expect(stick).not.toBeNull();
    for (const it of items) expect(await tex(it.id, 'stick')).toBe(stick);
    // Pick him up with the real mouse: found, his legs come out.
    await pressFrozen(page, twig.id);
    await frames(page, 4);
    expect((await art(page, twig.id))!.shown!.parts).toEqual(expect.arrayContaining(['stick', 'leg_upper']));
    await page.mouse.up();
    await frames(page, 30);
    expect(await page.evaluate(() => window.__bb!.cast())).toContain('bug_stickinsect_twig');
    // Art off: the twigs go back to code with him.
    await page.evaluate(() => window.__bb!.artMode('code'));
    await frames(page, 2);
    await expect.poll(() => tex(items[0]!.id, 'stick')).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('a Dot missing a required part falls back to code and says why', async () => {
  const { page, close } = await launchApp();
  try {
    const doc = readOra(oraOf('bug_ladybug_dot'));
    const stack = doc.root.children.map((n) => {
      const w = keep(n, doc.files);
      return 'children' in w && n.name === 'parts'
        ? { ...w, children: w.children.filter((c) => c.name !== 'head') }
        : w;
    });
    const broken = writeOra({
      w: doc.w,
      h: doc.h,
      stack,
      merged: doc.files['mergedimage.png']!,
      thumbnail: doc.files['Thumbnails/thumbnail.png']!,
    });
    const { pack: p, built } = pack(broken);
    expect(built[0]!.entry.status).toBe('broken');
    await install(page, p);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    await frames(page, 2);
    await expect.poll(async () => (await art(page, dot.id))?.art).toBe('code');
    expect((await art(page, dot.id))!.reason).toContain('"head" is missing');
    expect(
      await page.evaluate(() => window.__bb!.artReport('bug_ladybug_dot').map((m) => m.level)),
    ).toContain('error');
  } finally {
    await close();
  }
});

test('the Art Lab shows the drawn Dot beside the code one, and its buttons work with the mouse', async () => {
  const { page, close } = await launchApp();
  try {
    await install(page, pack().pack);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await page.evaluate(() => window.__bb!.artLab('bug_ladybug_dot'));
    await page.evaluate(() => window.__bb!.artLabFrames(2));
    const state = (await page.evaluate(() => window.__bb!.artLabState()))!;
    expect(state).toMatchObject({ bugId: 'bug_ladybug_dot', drawn: true, look: 'plain', zoom: 1 });
    expect(state.drawnCells).toBe(state.cells);
    const click = async (name: string): Promise<void> => {
      const at = (await page.evaluate((n) => window.__bb!.artLabButton(n), name))!;
      await page.mouse.click(at.x, at.y);
    };
    await click('look');
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.artLabState()))?.look)
      .toBe('paint');
    await click('zoom');
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.artLabState()))?.zoom).toBe(2);
    await click('next');
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.artLabState()))?.bugId)
      .toBe('bug_pillbug_rollo');
    expect((await page.evaluate(() => window.__bb!.artLabState()))!.drawnCells).toBe(0);
    await click('close');
    await expect.poll(() => page.evaluate(() => window.__bb!.artLabState())).toBeNull();
  } finally {
    await close();
  }
});

test('the production build carries no hot reload code', () => {
  const dir = join(ROOT, 'out/renderer/assets');
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const f of js) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('bb:art-changed');
});
