import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  POND_X,
  clickSlot,
  clickUi,
  frames,
  freeze,
  jumpTo,
  launchApp,
  openFrozen,
  scrollTo,
  settleCamera,
  spawnFrozen,
  toClient,
  waitForScene,
  entity,
} from './app';
import type { TestHook } from './app';

// M9 (game design doc, sections 10 and 19; docs/05-music-brief.md): the
// adaptive music and the music toys, with the real mouse. Test mode plays
// through the null music sink: nothing decodes, but the engine picks
// tracks, sets layer gains, and keeps the music clock, and the hook reports
// it. The toys' notes are logged with their time on that clock.

type Command = Parameters<TestHook['send']>[0];
type Music = ReturnType<TestHook['music']>;
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const music = (page: Page): Promise<Music> => page.evaluate(() => window.__bb!.music());
const notes = (page: Page): Promise<ReturnType<TestHook['musicNotes']>> =>
  page.evaluate(() => window.__bb!.musicNotes());
const FLOWERBED_X = 0;

/** Pentatonic pitch classes of a key named like `C major`. */
function scaleOf(key: string): number[] {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const [tonic, mode] = key.split(' ');
  const t = names.indexOf(tonic!);
  return (mode === 'major' ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10]).map((s) => (t + s) % 12);
}

const onGrid = (beat: number): boolean => Math.abs(beat * 4 - Math.round(beat * 4)) < 1e-6;

test('the music follows the camera from the plaza to the pond, and the clock into the night and the rain', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    // The menu plays its own theme.
    await expect.poll(async () => (await music(page)).target, { timeout: 15_000 }).toBe('main_menu');
    expect((await music(page)).manifest).toBe(true);
    await openFrozen(page, 0);
    await expect.poll(async () => (await music(page)).target).toBe('stump_plaza_day');
    let m = await music(page);
    expect(m.bpm).toBe(96);
    expect(m.key).toBe('C major');
    expect(m.area).toBe('area_stump_plaza');
    expect(m.layers.drums).toBe(1);
    // Wheel over to the pond: it has no track yet, so the pad plays in its key.
    await scrollTo(page, POND_X + 6);
    await expect.poll(async () => (await music(page)).target).toBe('pad:puddle_pond_day');
    await expect.poll(async () => (await music(page)).key).toBe('G major');
    // Back to the plaza, then dusk and night: no night track, so the day track plays by the night rules.
    await scrollTo(page, PLAZA_X + 3);
    await expect.poll(async () => (await music(page)).target).toBe('stump_plaza_day');
    await send(page, { type: 'set_time', hour: 20 });
    await frames(page, 2);
    await expect.poll(async () => (await music(page)).phase).toBe('night');
    m = await music(page);
    expect(m.state.rules).toBe('night');
    expect(m.layers.drums).toBeCloseTo(0.6, 5);
    // Rain outdoors: the drums drop out and the low-pass closes in.
    await send(page, { type: 'set_weather', wind: 0, rain: true });
    await frames(page, 2);
    await expect.poll(async () => (await music(page)).layers.drums).toBe(0);
    expect((await music(page)).lowpass).toBe(2000);
    // The pause board: the music ducks behind a low-pass.
    await clickUi(page, 'pause');
    await expect.poll(async () => (await music(page)).lowpass).toBe(900);
    expect((await music(page)).track).toBeLessThan(0.6);
    await clickUi(page, 'resume');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('poking an instrument plays a note on the next 16th, in key, and the melody dips', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    await expect.poll(async () => (await music(page)).target).toBe('stump_plaza_day');
    // Out past the stump, where no bug wanders over to sniff it and takes the clicks.
    await jumpTo(page, PLAZA_X + 19);
    const kazoo = await spawnFrozen(page, 'item_inst_comb_kazoo', PLAZA_X + 29.5);
    await page.evaluate(() => window.__bb!.clearLogs());
    const before = (await notes(page)).length;
    // Three quick clicks with the real mouse: a little tune.
    for (let i = 0; i < 3; i++) {
      const e = (await entity(page, kazoo))!;
      const at = await toClient(page, e.x, e.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await frames(page, 2);
      await page.mouse.up();
      await frames(page, 8);
    }
    await expect.poll(async () => (await notes(page)).length - before).toBeGreaterThanOrEqual(3);
    const played = (await notes(page)).slice(before).filter((n) => n.source === 'player');
    expect(played.length).toBeGreaterThanOrEqual(3);
    const m = await music(page);
    const scale = scaleOf(m.key);
    for (const n of played) {
      expect(onGrid(n.beat)).toBe(true);
      expect(n.time).toBeGreaterThanOrEqual(n.asked);
      // At most a 16th late (156 ms at 96 BPM).
      expect(n.time - n.asked).toBeLessThanOrEqual(60 / 96 / 4 + 0.01);
      expect(scale).toContain(((n.midi! % 12) + 12) % 12);
    }
    // Repeated pokes walk a motif, not one note.
    expect(new Set(played.map((n) => n.midi)).size).toBeGreaterThan(1);
    // The lead dips under the player's notes, by a quarter.
    expect(m.state.playerMusic).toBe(true);
    expect(m.layers.lead).toBeLessThan(0.3);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the mushroom sequencer takes clicks and drags, plays in key on the beat, and keeps its pattern', async () => {
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    let page = bb.page;
    await openFrozen(page, 1);
    await send(page, { type: 'unlock', area: 'area_flowerbed_stage' });
    await frames(page, 2);
    await jumpTo(page, FLOWERBED_X + 19);
    await settleCamera(page);
    const seq = (await page.evaluate(() => window.__bb!.sequencer()))!;
    expect(seq.rows.every((r) => r === 0)).toBe(true);
    // A click on a cap of the top row, then a drag across the third row paints four caps on.
    const click = async (p: { x: number; y: number }): Promise<void> => {
      const at = await toClient(page, p.x, p.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await frames(page, 2);
      await page.mouse.up();
      await frames(page, 2);
    };
    await click(seq.caps[0]![0]!);
    const from = await toClient(page, seq.caps[2]![2]!.x, seq.caps[2]![2]!.y);
    const to = await toClient(page, seq.caps[2]![5]!.x, seq.caps[2]![5]!.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await frames(page, 2);
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y);
      await frames(page, 1);
    }
    await page.mouse.up();
    await frames(page, 2);
    // The drum row too.
    await click(seq.caps[5]![0]!);
    const now = (await page.evaluate(() => window.__bb!.sequencer()))!;
    expect(now.rows[0]).toBe(0b1);
    expect(now.rows[2]).toBe(0b111100);
    expect(now.rows[5]).toBe(0b1);
    expect(now.mine).toBe(true);
    // It plays: notes on the 8th-note grid, every pitched one in the flowerbed's key.
    await expect
      .poll(async () => (await notes(page)).filter((n) => n.source === 'seq').length, { timeout: 15_000 })
      .toBeGreaterThan(6);
    const m = await music(page);
    expect(m.area).toBe('area_flowerbed_stage');
    const scale = scaleOf(m.key);
    for (const n of (await notes(page)).filter((q) => q.source === 'seq')) {
      expect(Math.abs(n.beat * 2 - Math.round(n.beat * 2))).toBeLessThan(1e-6);
      if (n.midi !== null) expect(scale).toContain(((n.midi % 12) + 12) % 12);
    }
    // The sequencer counts as the player's music: the melody dips.
    expect(m.state.playerMusic).toBe(true);
    // Saved with the world, and back after a relaunch.
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await waitForScene(page, 'menu');
    await bb.close({ keepUserData: true });
    bb = await launchApp(userData);
    page = bb.page;
    await clickSlot(page, 1);
    await freeze(page, true);
    const back = (await page.evaluate(() => window.__bb!.sequencer()))!;
    expect(back.rows).toEqual(now.rows);
    await freeze(page, false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close().catch(() => undefined);
  }
});

test('the shipped music files load and decode from the packaged app', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await expect.poll(async () => (await music(page)).manifest, { timeout: 15_000 }).toBe(true);
    const probe = await page.evaluate(() => window.__bb!.musicProbe('stump_plaza_day/drums.ogg'));
    expect('error' in probe ? probe.error : '').toBe('');
    if ('samples' in probe) {
      expect(probe.bytes).toBeGreaterThan(100_000);
      expect(probe.rate).toBe(48000);
      // The loop body plus its padding on both sides, give or take the codec's frames.
      expect(probe.samples).toBeGreaterThan(48000 * 40);
    }
    // Through the real player, across the loop's seam: sound, and no clipping.
    const r = await page.evaluate(() => window.__bb!.musicRender('stump_plaza_day', 4, 2));
    expect('error' in r ? r.error : '').toBe('');
    if ('rms' in r) {
      expect(r.wrapped).toBe(true);
      expect(r.rms).toBeGreaterThan(0.02);
      expect(r.peak).toBeLessThan(1);
    }
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
