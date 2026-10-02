import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  POND_X,
  entities,
  entity,
  frames,
  framesUntil,
  glideFrames,
  launchApp,
  lookAt,
  openFrozen,
  pressFrozen,
  spawnFrozen,
  toClient,
} from './app';

// M12's sound samples (docs/08-sound-brief.md, part 6.8). CI has none of the
// owner's recordings, so each test installs a stand-in manifest of generated
// tones (`__bb.sfxFixture`); in test mode nothing really decodes, and
// `__bb.sfxSamples()` says how each sound played.

const PLAZA_X = 64;

const samples = (page: Page) => page.evaluate(() => window.__bb!.sfxSamples());
const ambience = (page: Page) => page.evaluate(() => window.__bb!.ambience());
const camera = async (page: Page): Promise<number> => (await page.evaluate(() => window.__bb!.camera())).x;

/** A clear spot of open water on the left of the screen, away from pads and floaters. */
async function leftWater(page: Page): Promise<number> {
  const water = await page.evaluate(() => window.__bb!.water());
  const level = water.surfaces[0]!.level;
  const things = (await entities(page)).filter((e) => Math.abs(e.y - level) < 1.3);
  const blockers = [
    ...water.pads.map((p) => ({ x: p.x, r: 1.1 })),
    ...things.map((e) => ({ x: e.x, r: 0.8 })),
  ];
  const cam = await camera(page);
  let best = POND_X + 7;
  let bestGap = -Infinity;
  for (let x = Math.max(POND_X + 6.5, cam + 2.5); x <= cam + 8.5; x += 0.1) {
    const gap = Math.min(...blockers.map((b) => Math.abs(b.x - x) - b.r));
    if (gap > bestGap) [best, bestGap] = [x, gap];
  }
  return best;
}

/** Carry a thing with the real mouse to world (x, y) and let go. */
async function dropAt(page: Page, id: number, x: number, y: number): Promise<void> {
  const at = await pressFrozen(page, id);
  const to = await toClient(page, x, y);
  await glideFrames(page, at, to.x - at.x, to.y - at.y, 16, 2);
  await frames(page, 20);
  await page.mouse.up();
  await frames(page, 2);
}

test('a pebble dropped in the pond on the left splashes from a sample panned left, and from the synth without one', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await page.evaluate(() => window.__bb!.sfxFixture(['splash', 'plop']));
    await lookAt(page, POND_X);
    const level = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!.level;
    const splashes = async (source: string) =>
      (await samples(page)).filter((p) => (p.name === 'splash' || p.name === 'plop') && p.source === source);

    const splashedBy = async (id: number) =>
      (await page.evaluate(() => window.__bb!.events())).some(
        (e) => e.name === 'splashed' && (e.payload as { id: number }).id === id,
      );
    const pebble = await spawnFrozen(page, 'item_pebble', POND_X + 2.5);
    // Skeet splashes about the pond too, wherever he is, and the carried pebble may nudge a
    // floater: wait for the pebble's own splash, then look for a sample panned left.
    await dropAt(page, pebble, await leftWater(page), level - 1);
    expect(await framesUntil(page, () => splashedBy(pebble), 240, 2)).toBe(true);
    // Its sound is among the latest splashes (the log keeps only the last few dozen plays).
    const left = (await splashes('sample')).slice(-3).filter((p) => p.pan < -0.05);
    expect(left.length).toBeGreaterThan(0);
    const hit = left[left.length - 1]!;
    expect(hit.folder === 'splash' || hit.folder === 'plop').toBe(true);
    expect(hit.take).toBeGreaterThanOrEqual(0);

    // Take the folders away: the same drop plays the synth.
    await page.evaluate(() => window.__bb!.sfxFixture(['impact_wood']));
    const sampled = (await splashes('sample')).length;
    const second = await spawnFrozen(page, 'item_pebble', POND_X + 2.5);
    await dropAt(page, second, await leftWater(page), level - 1);
    expect(await framesUntil(page, () => splashedBy(second), 240, 10)).toBe(true);
    expect((await splashes('synth')).some((p) => p.pan === 0 && p.folder === null)).toBe(true);
    expect((await splashes('sample')).length).toBe(sampled);
  } finally {
    await bb.close();
  }
});

test('dropping a cork twice plays two different takes', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await page.evaluate(() => window.__bb!.sfxFixture(['impact_wood', 'impact_rubber', 'impact_stone']));
    const cam = await camera(page);
    const block = await spawnFrozen(page, 'item_cork', cam + 6);
    const takes: number[] = [];
    for (let i = 0; i < 2; i++) {
      const e = (await entity(page, block))!;
      const before = (await samples(page)).length;
      await dropAt(page, block, e.x + 0.5, e.y - 1.5);
      expect(
        await framesUntil(
          page,
          async () => (await samples(page)).slice(before).some((p) => p.name === 'drop'),
          120,
          5,
        ),
      ).toBe(true);
      const drop = (await samples(page)).slice(before).find((p) => p.name === 'drop')!;
      expect(drop.source).toBe('sample');
      expect(drop.folder).toMatch(/^impact_/);
      takes.push(drop.take);
      await frames(page, 60);
    }
    expect(takes[0]).not.toBe(takes[1]);
  } finally {
    await bb.close();
  }
});

test('the ambience beds follow the camera, the clock, and the weather', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await page.evaluate(() => window.__bb!.sfxFixture('all'));
    // The plaza at 09:00.
    await expect.poll(async () => (await ambience(page)).playing.amb_plaza_day ?? 0).toBeGreaterThan(0.9);
    // Wheel to the pond: its bed takes over.
    await lookAt(page, POND_X + 5);
    await expect.poll(async () => (await ambience(page)).playing.amb_pond_day ?? 0).toBeGreaterThan(0.9);
    expect((await ambience(page)).playing.amb_plaza_day).toBeUndefined();
    // 19:00, the middle of dusk: day and night beds half and half.
    await page.evaluate(() => window.__bb!.send({ type: 'set_time', hour: 19 }));
    await frames(page, 2);
    await expect
      .poll(
        async () => {
          const a = await ambience(page);
          return Math.abs((a.targets.amb_pond_day ?? 0) - (a.targets.amb_pond_night ?? 0));
        },
        { timeout: 15_000 },
      )
      .toBeLessThan(0.08);
    // Rain: the rain bed rises outdoors.
    await page.evaluate(() => window.__bb!.send({ type: 'set_weather', wind: 0, rain: true }));
    await frames(page, 2);
    await expect
      .poll(async () => (await ambience(page)).playing.rain_bed ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0.5);
    // Under the porch, the patter on the boards instead.
    await page.evaluate(() => window.__bb!.send({ type: 'unlock', area: 'area_under_porch' }));
    await frames(page, 2);
    await page.evaluate((x) => window.__bb!.cameraTo(x), PLAZA_X + 38.4 + 6);
    await frames(page, 2);
    await expect.poll(async () => (await ambience(page)).playing.board_patter ?? 0).toBeGreaterThan(0.5);
    expect((await ambience(page)).playing.rain_bed).toBeUndefined();
    // The synth's rain ticks stop while the bed plays.
    const before = (await samples(page)).filter((p) => p.name === 'rain').length;
    await page.waitForTimeout(600);
    expect((await samples(page)).filter((p) => p.name === 'rain').length).toBe(before);
  } finally {
    await bb.close();
  }
});

test('the real sample player pans a one-shot and loops a bed', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    const r = await page.evaluate(() => window.__bb!.sampleRender());
    expect(r.shot[0]).toBeGreaterThan(0.05);
    expect(r.shot[1]).toBeLessThan(r.shot[0] * 0.05);
    expect(r.bed[0]).toBeGreaterThan(0.01);
    expect(r.bed[1]).toBeGreaterThan(0.01);
  } finally {
    await bb.close();
  }
});
