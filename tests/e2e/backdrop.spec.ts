import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { join } from 'node:path';
import { buildBackdrop, toBackdropPack } from '../../scripts/art/backdrop.ts';
import type { BackdropPack } from '../../src/renderer/src/art/backdropData';
import { clickUi, frames, jumpTo, launchApp as launch, openFrozen, waitForScene } from './app';

// An art set's backdrop end to end: the crude test backdrop
// (tests/e2e/fixtures/art/backdrop, made by make.ts) goes through the real
// importer and into the running game. It has a sky, a tone map, and strips
// for the pond and the flowerbed only, so every other area must fall back to
// the code-drawn layers.

const FIXTURE = join(import.meta.dirname, 'fixtures/art');
const SET = 'test_backdrop';
/** World x (meters) that puts the pond, then the compost lab, in the middle of the 19.2 m view. */
const POND_VIEW = 32 + 16 - 9.6;
const COMPOST_VIEW = 134.4 + 14.4 - 9.6;

let pack: BackdropPack | null = null;
function fixturePack(): BackdropPack {
  pack ??= toBackdropPack(buildBackdrop(FIXTURE))!;
  return pack;
}

async function launchApp(): ReturnType<typeof launch> {
  const app = await launch();
  await waitForScene(app.page, 'menu');
  await app.page.evaluate(
    ([p, id]) => window.__bb!.loadBackdrop(p as BackdropPack, id as string, 'Test backdrop'),
    [fixturePack(), SET] as const,
  );
  return app;
}

const backdrop = (page: Page) => page.evaluate(() => window.__bb!.backdrop());
const look = (page: Page) => page.evaluate(() => window.__bb!.look());
const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

/** Set the hour and clear the weather, and let the look settle. */
async function at(page: Page, hour: number, rain = false): Promise<void> {
  await send(page, { type: 'set_time', hour });
  await send(page, { type: 'set_weather', wind: 0, rain, weather: rain ? 'weather_rain' : 'weather_clear' });
  // The weather eases in over a few seconds of frames.
  await frames(page, rain ? 600 : 300);
}

const bright = (c: number): number => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15;

test("an art set's sky, strips, and tone map are drawn, and an area it has no strip for falls back to code", async () => {
  const { page, close, errors } = await launchApp();
  try {
    await openFrozen(page, 0);
    // The game's own look first: no set, the doc's day sky, nothing painted.
    await at(page, 12);
    expect(await backdrop(page)).toEqual({
      ready: true,
      set: null,
      sky: false,
      tone: 0,
      toned: 0,
      strips: { far: { has: [], drawn: [] }, mid: { has: [], drawn: [] } },
    });
    expect((await look(page)).skyTop).toBe(0x8fd3f0);
    expect((await look(page)).near).toBe(0xffffff);

    await page.evaluate((id) => window.__bb!.artSelect(id), SET);
    await expect.poll(async () => (await backdrop(page))?.ready && (await backdrop(page))?.set).toBe(SET);
    const on = (await backdrop(page))!;
    expect(on.sky).toBe(true);
    expect(on.tone).toBe(2);
    // The tone map reached the code-drawn world: thousands of greens and browns changed.
    expect(on.toned).toBeGreaterThan(1000);
    expect(on.strips.far.has).toEqual(['area_flowerbed_stage_far', 'area_puddle_pond_far']);
    expect(on.strips.mid.has).toEqual(['area_puddle_pond_mid']);

    // At the pond, the painted strips are what the backdrop on screen is drawn from.
    await jumpTo(page, POND_VIEW);
    await expect.poll(async () => (await backdrop(page))!.strips.far.drawn).toContain('area_puddle_pond_far');
    expect((await backdrop(page))!.strips.mid.drawn).toEqual(['area_puddle_pond_mid']);

    // The set's sky: lime by day with a light violet cast on the world.
    await at(page, 12);
    const noon = await look(page);
    expect(noon.skyTop).toBe(0x3fd07a);
    expect(noon.skyBottom).toBe(0xd8ff9a);
    expect(noon.near).toBe(0xf6ecff);
    expect(noon.far).toBe(0xffe8f0);
    expect(noon.glow).toBeLessThan(0.1);
    expect(noon.stars).toBe(0);
    // Night still reads as night: plum, dark, stars and lights on.
    await at(page, 23);
    const night = await look(page);
    expect(night.skyTop).toBe(0x2a0a3a);
    expect(night.near).toBe(0x9a7ac8);
    expect(night.glow).toBeGreaterThan(0.6);
    expect(night.stars).toBe(1);
    expect(bright(night.skyTop)).toBeLessThan(bright(noon.skyTop) * 0.5);
    // Rain still reads as rain: greyer and dimmer than the same noon.
    await at(page, 12, true);
    const rain = await look(page);
    expect(rain.rain).toBeGreaterThan(0.9);
    expect(bright(rain.near)).toBeLessThan(bright(noon.near));
    expect(bright(rain.skyBottom)).toBeLessThan(bright(noon.skyBottom));
    await at(page, 12);

    // The compost lab has no strip in this set: its far and mid layers are the code-drawn ones.
    for (const area of ['area_compost_lab', 'area_under_porch', 'area_stump_plaza'])
      await send(page, { type: 'unlock', area });
    await frames(page, 2);
    await jumpTo(page, COMPOST_VIEW);
    await expect.poll(async () => (await backdrop(page))!.strips.far.drawn).toEqual([]);
    const lab = (await backdrop(page))!;
    expect(lab.strips.mid.drawn).toEqual([]);
    // The set is still on there: its sky and its tone map apply everywhere.
    expect(lab.set).toBe(SET);
    expect((await look(page)).skyTop).toBe(0x3fd07a);

    // Back to the original art: the game's own backdrop again.
    await page.evaluate(() => window.__bb!.artSelect('procedural'));
    await expect.poll(async () => (await backdrop(page))?.set).toBeNull();
    const off = (await backdrop(page))!;
    expect(off).toMatchObject({ ready: true, sky: false, tone: 0, toned: 0 });
    expect(off.strips.far.has).toEqual([]);
    await at(page, 12);
    expect((await look(page)).skyTop).toBe(0x8fd3f0);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('choosing a set with a backdrop on the settings board redraws the world in it', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await openFrozen(page, 0);
    await jumpTo(page, POND_VIEW);
    expect((await backdrop(page))!.set).toBeNull();
    await clickUi(page, 'pause');
    // The arrows step through the sets; the test set is the last one.
    for (let i = 0; i < 12; i++) {
      if ((await page.evaluate(() => window.__bb!.settings().artSet)) === SET) break;
      await clickUi(page, 'art_next');
    }
    expect(await page.evaluate(() => window.__bb!.settings().artSet)).toBe(SET);
    expect((await page.evaluate(() => window.__bb!.artChoice()))?.name).toBe('Test backdrop');
    // The world behind the board is redrawn at once, strips and all.
    await expect.poll(async () => (await backdrop(page))?.ready && (await backdrop(page))?.set).toBe(SET);
    await expect.poll(async () => (await backdrop(page))!.strips.far.drawn).toContain('area_puddle_pond_far');
    expect((await backdrop(page))!.toned).toBeGreaterThan(1000);
    // One more click wraps round to the original art, and the game's own backdrop comes back.
    await clickUi(page, 'art_next');
    expect(await page.evaluate(() => window.__bb!.settings().artSet)).toBe('procedural');
    await expect.poll(async () => (await backdrop(page))?.set).toBeNull();
    expect((await backdrop(page))!.strips.far.has).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
