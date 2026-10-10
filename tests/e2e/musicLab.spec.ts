import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAZA_X, POND_X, launchApp, waitForScene } from './app';
import type { TestHook } from './app';

// The Music Lab (docs/04-architecture.md, "The Music Lab"): the developer
// panel for judging the music by ear, driven with the real mouse. Test mode
// plays through the null music sink, so nothing sounds: the tests read what
// the engine reports. Dev builds open the panel with `pnpm music:lab`; here
// the hook opens it.

type Music = ReturnType<TestHook['music']>;
type Lab = NonNullable<ReturnType<TestHook['musicLabState']>>;
const music = (page: Page): Promise<Music> => page.evaluate(() => window.__bb!.music());
const lab = async (page: Page): Promise<Lab> => {
  const state = await page.evaluate(() => window.__bb!.musicLabState());
  expect(state).not.toBeNull();
  return state!;
};

/** Click one of the lab's buttons with the real mouse. */
async function press(page: Page, name: string): Promise<void> {
  await expect.poll(() => page.evaluate((n) => window.__bb!.musicLabButton(n), name)).not.toBeNull();
  const p = (await page.evaluate((n) => window.__bb!.musicLabButton(n), name))!;
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
}

/** Open the tab and page a demo's row is on, then press its Play button. */
async function play(page: Page, id: string): Promise<void> {
  const demo = (await lab(page)).demos.find((d) => d.id === id);
  expect(demo, `the lab lists ${id}`).toBeDefined();
  if ((await lab(page)).tab !== demo!.tab) await press(page, `tab:${demo!.tab}`);
  await expect.poll(async () => (await lab(page)).tab).toBe(demo!.tab);
  for (let i = 0; i < demo!.page; i++) await press(page, 'page:next');
  await expect.poll(async () => (await lab(page)).page).toBe(demo!.page);
  await press(page, `play:${id}`);
  await expect.poll(async () => (await lab(page)).running).toBe(id);
}

const BORDER = 'border:area_stump_plaza>area_puddle_pond:day';

test('Play on a border opens a world, stages the plaza, and crosses into the pond; mute, solo, and reset work', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await waitForScene(page, 'menu');
    await expect.poll(async () => (await music(page)).target, { timeout: 15_000 }).toBe('main_menu');
    expect(await page.evaluate(() => window.__bb!.musicLabState())).toBeNull();
    await page.evaluate(() => window.__bb!.musicLab(true));

    // The list comes from the manifest and the areas: every border both ways by day and night,
    // dusk and dawn everywhere, a loop point for each of the seven tracks, rain, and a player's notes.
    const start = await lab(page);
    const on = (tab: string): number => start.demos.filter((d) => d.tab === tab).length;
    expect([on('borders'), on('phases'), on('loops'), on('rain'), on('notes')]).toEqual([20, 12, 7, 24, 12]);
    const row = start.demos.find((d) => d.id === BORDER)!;
    expect(row.label).toBe('Mossy Stump Plaza to Puddle Pond, daytime');
    expect(row.detail).toBe('C major to E major');
    // An area with no track yet is the pad, not a gap.
    expect(start.demos.find((d) => d.id === 'border:area_stump_plaza>area_under_porch:day')!.detail).toBe(
      'C major to pad (A minor)',
    );
    expect(start.running).toBeNull();

    // Play, from the menu: the lab opens a world, opens the areas, and stages the plaza side of the border.
    await play(page, BORDER);
    await waitForScene(page, 'world');
    await expect.poll(async () => (await music(page)).playing, { timeout: 20_000 }).toBe('stump_plaza_day');
    const open = await page.evaluate(() => window.__bb!.unlocked());
    expect(open.open).toEqual(
      expect.arrayContaining(['area_flowerbed_stage', 'area_under_porch', 'area_treehouse_arcade']),
    );
    const cam = await page.evaluate(() => window.__bb!.camera());
    expect(cam.x + 9.6).toBeGreaterThan(PLAZA_X);
    expect(cam.x + 9.6).toBeLessThan(PLAZA_X + 6);
    let m = await music(page);
    expect(m).toMatchObject({ area: 'area_stump_plaza', phase: 'day', key: 'C major', bpm: 96 });
    expect(m.state.raining).toBe(false);

    // After two bars it crosses the border, and the music follows as it does for a player.
    await expect.poll(async () => (await music(page)).target, { timeout: 20_000 }).toBe('puddle_pond_day');
    await expect.poll(async () => (await lab(page)).running, { timeout: 30_000 }).toBeNull();
    m = await music(page);
    expect(m).toMatchObject({ playing: 'puddle_pond_day', fading: false, key: 'E major' });
    expect(m.area).toBe('area_puddle_pond');
    expect((await page.evaluate(() => window.__bb!.camera())).x + 9.6).toBeLessThan(POND_X + 32);
    expect((await lab(page)).status).toContain('Finished: Mossy Stump Plaza to Puddle Pond, daytime');
    expect(m.position).not.toBeNull();
    expect(m.loopSeconds).toBe(60);

    // Mute the drums: the engine reports the layer at 0, and the others where the rules put them.
    expect(m.layers).toMatchObject({ drums: 1, bass: 1, harmony: 1 });
    await press(page, 'mute:drums');
    await expect.poll(async () => (await music(page)).layers.drums).toBe(0);
    await expect.poll(async () => (await music(page)).heard.drums).toBe(0);
    m = await music(page);
    expect(m.layers).toMatchObject({ bass: 1, harmony: 1 });
    expect(m.layers.lead).toBeGreaterThan(0);
    expect(m.override.mute).toEqual(['drums']);
    expect((await lab(page)).mute).toEqual(['drums']);

    // Solo the lead: only the lead plays.
    await press(page, 'solo:lead');
    await expect.poll(async () => (await music(page)).layers.bass).toBe(0);
    m = await music(page);
    expect(m.layers).toMatchObject({ drums: 0, bass: 0, harmony: 0 });
    expect(m.layers.lead).toBeGreaterThan(0);

    // The panel takes its own clicks: nothing in the world was picked up or scrolled.
    const before = await page.evaluate(() => window.__bb!.camera());
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect((await page.evaluate(() => window.__bb!.camera())).x).toBeCloseTo(before.x, 1);
    expect(await page.evaluate(() => window.__bb!.cursor().pose)).not.toBe('grab');

    // Stop and reset: the mix is the game's own again.
    await press(page, 'stop');
    await expect.poll(async () => (await music(page)).layers.drums).toBe(1);
    m = await music(page);
    expect(m.layers).toMatchObject({ drums: 1, bass: 1, harmony: 1 });
    expect(m.override).toEqual({ mute: [], solo: [] });
    expect(await lab(page)).toMatchObject({ mute: [], solo: [], running: null });

    // Closing the lab leaves the game as it was.
    await page.evaluate(() => window.__bb!.musicLab(false));
    expect(await page.evaluate(() => window.__bb!.musicLabState())).toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the other tabs: rain takes the drums out, a loop point comes round, and Stop ends a demo', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.musicLab(true));
    await expect.poll(async () => (await lab(page)).demos.length, { timeout: 15_000 }).toBe(75);

    // Rain starts in the plaza by day.
    await play(page, 'rain:area_stump_plaza:day:on');
    expect((await lab(page)).tab).toBe('rain');
    await waitForScene(page, 'world');
    await expect.poll(async () => (await music(page)).playing, { timeout: 20_000 }).toBe('stump_plaza_day');
    expect((await music(page)).state.raining).toBe(false);
    await expect.poll(async () => (await music(page)).state.raining, { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => (await music(page)).layers.drums).toBe(0);
    await expect.poll(async () => (await music(page)).heard.drums, { timeout: 20_000 }).toBe(0);
    expect((await music(page)).lowpass).toBe(2000);
    expect((await lab(page)).status).toContain('The drums drop out');

    // Stop ends the demo where it is.
    await press(page, 'stop');
    await expect.poll(async () => (await lab(page)).running).toBeNull();
    expect((await lab(page)).status).toContain('Stopped');

    // The pond's night track, from two bars before its loop point.
    await play(page, 'loop:puddle_pond_night');
    await expect.poll(async () => (await music(page)).playing, { timeout: 20_000 }).toBe('puddle_pond_night');
    // The music clock takes the new track's tempo half way through the cut.
    await expect.poll(async () => (await music(page)).bpm).toBe(72);
    let m = await music(page);
    expect(m).toMatchObject({ phase: 'night', loopSeconds: 80 });
    expect(m.state.raining).toBe(false);
    await expect.poll(async () => (await music(page)).position!, { timeout: 20_000 }).toBeGreaterThan(72);
    expect((await lab(page)).status).toContain('The loop point is coming');
    await expect.poll(async () => (await lab(page)).running, { timeout: 40_000 }).toBeNull();
    m = await music(page);
    expect(m.playing).toBe('puddle_pond_night');
    expect(m.position!).toBeLessThan(20);
    expect((await lab(page)).status).toContain('Finished');

    // A player's notes: four on the 16th grid, in the track's key, and the lead dips.
    await play(page, 'notes:area_puddle_pond:night');
    await expect.poll(async () => (await music(page)).state.playerMusic, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await music(page)).layers.lead).toBeLessThan(0.3);
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.musicNotes())).length, { timeout: 15_000 })
      .toBe(4);
    const notes = await page.evaluate(() => window.__bb!.musicNotes());
    for (const n of notes) {
      expect(n.source).toBe('player');
      expect(Math.abs(n.beat * 4 - Math.round(n.beat * 4))).toBeLessThan(1e-6);
    }
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
