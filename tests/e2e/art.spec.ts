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
  clickUi,
  entity,
  frames,
  freeze,
  glideFrames,
  launchApp as launch,
  lookAt,
  openFrozen,
  pressFrozen,
  waitForScene,
} from './app';

async function launchApp(...args: Parameters<typeof launch>): ReturnType<typeof launch> {
  const app = await launch(...args);
  await waitForScene(app.page, 'menu');
  return app;
}

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

test('the shipped Krita Dot uses her own faces while held and flung', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    await content(page, dot.id);
    await frames(page, 2);
    await expect.poll(async () => (await art(page, dot.id))?.art).toBe('drawn');
    expect(await page.evaluate(() => window.__bb!.artReport('bug_ladybug_dot'))).toEqual([]);
    for (const scale of [1, 2] as const) {
      await page.evaluate((s) => window.__bb!.artScale(s), scale);
      await frames(page, 2);
      await expect.poll(async () => (await art(page, dot.id))?.shown?.scale).toBe(scale);
      expect((await art(page, dot.id))!.shown!.codeFace).toBe(0);
    }
    const at = await pressFrozen(page, dot.id);
    expect((await entity(page, dot.id))?.bug?.mode).toBe('st_held');
    expect((await art(page, dot.id))!.shown!.codeFace).toBe(0);
    const raised = await glideFrames(page, at, 0, -120, 6, 2);
    await glideFrames(page, raised, 220, -60, 3, 1);
    await page.mouse.up();
    await frames(page, 3);
    expect((await entity(page, dot.id))?.bug?.mode).toBe('st_airborne');
    expect((await art(page, dot.id))!.shown!.codeFace).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

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
    expect(other.reason).toBe('no art file');

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

test('players switch named art sets with the mouse and keep their choice after restarting', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    const { page } = bb;
    await page.evaluate(() => window.__bb!.sfxFixture('all', true));
    await page.evaluate((p) => window.__bb!.loadArtSet(p, 'family_drawing', 'Family drawing'), pack().pack);
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    await frames(page, 2);
    expect((await art(page, dot.id))?.art).toBe('code');
    await clickUi(page, 'pause');
    await clickUi(page, 'art_next');
    expect(await page.evaluate(() => window.__bb!.settings().artSet)).toBe('reference');
    expect(await page.evaluate(() => window.__bb!.artChoice())).toEqual({
      name: 'Krita reference',
      credit: 'Agent-created reference artwork in Krita',
    });
    await clickUi(page, 'toggle_recordedVoices');
    expect(await page.evaluate(() => window.__bb!.settings().recordedVoices)).toBe(true);
    expect(await page.evaluate(() => window.__bb!.settings().artSet)).toBe('reference');
    await frames(page, 2);
    expect((await art(page, dot.id))?.art).toBe('drawn');
    await clickUi(page, 'art_next');
    expect(await page.evaluate(() => window.__bb!.settings().artSet)).toBe('family_drawing');
    await frames(page, 2);
    expect((await art(page, dot.id))?.art).toBe('drawn');
    expect((await art(page, rollo.id))?.reason).toBe('no art file');
    await clickUi(page, 'art_next');
    await frames(page, 2);
    expect((await art(page, dot.id))?.art).toBe('code');
    await clickUi(page, 'art_next');
    await page.evaluate(() => window.__bb!.saveNow());
    await bb.close({ keepUserData: true });
    expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).artSet).toBe('reference');
    bb = await launchApp(userData);
    expect(await bb.page.evaluate(() => window.__bb!.settings().artSet)).toBe('reference');
    expect(await bb.page.evaluate(() => window.__bb!.settings().recordedVoices)).toBe(true);
    await openFrozen(bb.page, 0);
    const restored = await bugNamed(bb.page, 'bug_ladybug_dot');
    await frames(bb.page, 2);
    expect((await art(bb.page, restored.id))?.art).toBe('drawn');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('switching sets refreshes pocketed bugs and twigs and shows the selected artist credit', async () => {
  const { page, close, errors } = await launchApp();
  try {
    const built = [...pack().built, buildAsset(oraOf('bug_stickinsect_twig'), rigOf('bug_stickinsect_twig'))];
    await page.evaluate(
      (p) => window.__bb!.loadArtSet(p, 'family', 'Family drawing', 'Drawn by Juniper'),
      toArtPack(built),
    );
    await openFrozen(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const twig = (await page.evaluate(() => window.__bb!.entities())).find((e) => e.defId === 'item_twig')!;
    for (const [slot, e] of [dot, twig].entries()) {
      await page.evaluate(({ x, y }) => window.__bb!.send({ type: 'grab', x, y }), e);
      await frames(page, 2);
      expect((await entity(page, e.id))?.held).toBe(true);
      await page.evaluate((slot) => window.__bb!.send({ type: 'pocket_put', slot }), slot);
      await frames(page, 2);
    }
    const contents = await page.evaluate(() => window.__bb!.pocket());
    expect(contents.slice(0, 2)).toEqual([[dot.id], [twig.id]]);
    const pocketArt = () => page.evaluate(() => [window.__bb!.pocketArt(0), window.__bb!.pocketArt(1)]);
    expect(await pocketArt()).toEqual(['code', 'code']);
    await clickUi(page, 'pause');
    await clickUi(page, 'art_next');
    await clickUi(page, 'art_next');
    expect(await page.evaluate(() => window.__bb!.artChoice())).toEqual({
      name: 'Family drawing',
      credit: 'Drawn by Juniper',
    });
    await frames(page, 2);
    expect(await pocketArt()).toEqual(['drawn', 'drawn']);
    await clickUi(page, 'art_next');
    await frames(page, 2);
    expect(await pocketArt()).toEqual(['code', 'code']);
    expect(await page.evaluate(() => window.__bb!.pocket())).toEqual(contents);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
