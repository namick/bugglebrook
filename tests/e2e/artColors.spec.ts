import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuiltAsset } from '../../scripts/art/build.ts';
import { buildAsset, toArtPack } from '../../scripts/art/build.ts';
import type { BugColors, RigFile } from '../../src/renderer/src/art/rigFile';
import { darken, lighten } from '../../src/renderer/src/render/palette';
import {
  PLAZA_X,
  clickUi,
  content,
  entities,
  frames,
  framesUntil,
  jumpTo,
  launchApp,
  openFrozen,
  waitForScene,
} from './app';
import type { TestHook } from './app';

// An art set's own colors (its colors.json) on the bugs a player sees. The
// crude test art pack stands in for a set, with colors of its own for Barty's
// shimmer, Luma's eyelids, and Flick's light.

const FIXTURES = join(import.meta.dirname, 'fixtures/art');
const BARTY = 'bug_dungbeetle_barty';
const LUMA = 'bug_moth_luma';
const FLICK = 'bug_firefly_flick';
const PINK = 0xd04090;
const NAVY = 0x204060;
const TURQUOISE = 0x40e0d0;
/** Flick's light as the game colors it: the halo and the core. */
const FLICK_GLOW = [0xd8ff4f, 0xf4ffc0];
/** Luma's eyelid as the game colors it, from her own body color. */
const LUMA_LID = lighten(0xcfc3e8, 0.2);

const built = (id: string, colors?: BugColors): BuiltAsset =>
  buildAsset(
    new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`))),
    JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as RigFile,
    colors,
  );

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const shown = async (page: Page, id: number) =>
  (await page.evaluate((i) => window.__bb!.bugArt(i), id))?.shown;

/** Click the Art arrow until the board shows this set. */
async function chooseSet(page: Page, id: string): Promise<void> {
  const chosen = (): Promise<string> => page.evaluate(() => window.__bb!.settings().artSet);
  for (let i = 0; i < 12 && (await chosen()) !== id; i++) await clickUi(page, 'art_next');
  expect(await chosen()).toBe(id);
}

test('a set chosen with the Art arrows brings its own shimmer, eyelid, and glow colors, and another set does not', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.sfxFixture('all', true));
    // Both ends of the shimmer are the same pink, so the color holds still and can be read.
    const pack = toArtPack([
      built(BARTY, { sheen: [PINK, PINK] }),
      built(LUMA, { lid: NAVY }),
      built(FLICK, { glow: TURQUOISE }),
      built('face_kit'),
    ]);
    await page.evaluate((p) => window.__bb!.loadArtSet(p, 'family', 'Family drawing'), pack);
    await openFrozen(page, 0);
    // A Barty, a Luma, and a Flick of our own on flat ground, at night so she is up and he shines.
    const at = PLAZA_X + 20;
    await send(page, { type: 'set_time', hour: 22 });
    await send(page, { type: 'spawn', kind: 'bug', defId: BARTY, x: at, y: 7 });
    await send(page, { type: 'spawn', kind: 'bug', defId: LUMA, x: at + 3, y: 7 });
    await send(page, { type: 'spawn', kind: 'bug', defId: FLICK, x: at - 3, y: 7 });
    await frames(page, 2);
    const mine = async (defId: string): Promise<number> =>
      (await entities(page)).find((e) => e.defId === defId && !e.bug?.pending && Math.abs(e.x - at) < 6)!.id;
    const barty = await mine(BARTY);
    const luma = await mine(LUMA);
    const flick = await mine(FLICK);
    for (const id of [barty, luma, flick]) await content(page, id);
    const lights = (): Promise<number[]> => page.evaluate(() => window.__bb!.weatherLights());
    await jumpTo(page, at - 8);
    await frames(page, 60);
    // Tests start with the original bugs: nothing is drawn from art yet, and Flick's light is the game's.
    expect(await shown(page, barty)).toBeNull();
    expect(await lights()).toEqual(expect.arrayContaining(FLICK_GLOW));

    await clickUi(page, 'pause');
    await chooseSet(page, 'family');
    await clickUi(page, 'resume');
    await frames(page, 2);
    expect((await shown(page, barty))!.tints).toMatchObject({
      shell_tint: PINK,
      thorax_tint: PINK,
      head_tint: darken(PINK, 0.25),
    });
    // Luma's open eyes always carry the sleepy lid; wait out a blink or a face she is pulling.
    const lid = async (): Promise<number | undefined> => (await shown(page, luma))?.tints.eye_sleepy_lid;
    expect(await framesUntil(page, async () => (await lid()) !== undefined, 600, 10)).toBe(true);
    expect(await lid()).toBe(NAVY);
    // Flick's light is the set's color, with a paler core. (The wild fireflies keep the game's halo.)
    expect(await lights()).toEqual(expect.arrayContaining([TURQUOISE, lighten(TURQUOISE, 0.65)]));
    expect(await lights()).not.toContain(FLICK_GLOW[1]);

    // The reference set names no colors: the game's own come back.
    await clickUi(page, 'pause');
    await chooseSet(page, 'reference');
    await clickUi(page, 'resume');
    await frames(page, 2);
    // His shell keeps shimmering while the sim is frozen, so read one frame's tints together.
    const own = (await shown(page, barty))!.tints;
    expect(own.shell_tint).not.toBe(PINK);
    expect(own.head_tint).toBe(darken(own.shell_tint!, 0.25));
    expect(await framesUntil(page, async () => (await lid()) !== undefined, 600, 10)).toBe(true);
    expect(await lid()).toBe(LUMA_LID);
    expect(await lights()).toEqual(expect.arrayContaining(FLICK_GLOW));
    expect(await lights()).not.toContain(TURQUOISE);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
