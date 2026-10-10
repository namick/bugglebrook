import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_DIR } from '../../scripts/art/build.ts';
import { setSource, sourceSets } from '../../scripts/art/sets.ts';
import { rebuild } from '../../scripts/art/vitePlugin.ts';
import { BUGS } from '../../src/game/data';
import { FACE_KIT_ID } from '../../src/renderer/src/art/kit';
import {
  PLAZA_X,
  clickSlot,
  clickUi,
  content,
  entities,
  entity,
  frames,
  framesUntil,
  jumpTo,
  launchApp,
  openFrozen,
  waitForScene,
} from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The cast tour: every bug of an art set in the Art Lab, for looking at.
// There is one tour per set in art/src (the reference cast and each folder in
// art/src/sets), named after the set: `pnpm shots -g 'Storybook cast'`.
// Writes <set id>-*.png to /tmp/bb-shots (or $BB_SHOTS_DIR).
//
// BB_ART_ONLY=bug_ladybug_dot,bug_snail_glorp tours only those bugs.
// BB_ART_SOURCE=1 draws the set from its .ora files as they are on disk now,
// instead of the atlases built into the app: no `pnpm art:build`, and the set
// need not be in the build at all. The importer's report is printed first.
//
// A set still being painted is fine: a bug it has not drawn yet is skipped,
// unless BB_ART_ONLY asked for it by name.
//
// Each set also has a night tour, `pnpm shots -g 'Storybook night'`: every
// bug on the plaza after dark, held up in the hand (<set id>-<bug>-night-held.png)
// and then left alone (-night-world.png). It is where a set's night lights
// (a bug's .lights.json) show against the real dark.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const ONLY = (process.env.BB_ART_ONLY ?? '').split(',').filter(Boolean);
const FROM_SOURCE = process.env.BB_ART_SOURCE === '1';
const COMMON = new Set(['run', 'hop', 'thrown', 'dizzy', 'asleep', 'eat', 'carry']);

type ArtSet = ReturnType<typeof sourceSets>[number];

test('Krita reference settings selector', async () => {
  mkdirSync(DIR, { recursive: true });
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.sfxFixture('all', true));
    await clickSlot(page, 0);
    await clickUi(page, 'pause');
    await clickUi(page, 'art_next');
    await expect.poll(() => page.evaluate(() => window.__bb!.settings().artSet)).toBe('reference');
    await page.mouse.move(5, 5);
    await page.screenshot({ path: join(DIR, 'reference-settings.png') });
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

/** Build some of a set's .ora files and put them in the running game, as `pnpm art:watch` does. */
async function installSource(page: Page, set: ArtSet, ids: readonly string[]): Promise<void> {
  const { pack, report } = rebuild(setSource(SRC_DIR, set.id), [...ids, FACE_KIT_ID]);
  console.log(report);
  await page.evaluate(([p, s]) => window.__bb!.loadArtSet(p, s.id, s.name, s.credit), [pack, set] as const);
}

async function castTour(set: ArtSet): Promise<void> {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });
  const defs = ONLY.length ? ONLY.map((id) => BUGS.get(id)) : BUGS.all;
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.mouse.move(5, 5);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    if (FROM_SOURCE)
      await installSource(
        page,
        set,
        defs.map((d) => d.id),
      );
    await page.evaluate((id) => window.__bb!.artSelect(id), set.id);
    const skipped: string[] = [];
    for (const def of defs) {
      const name = def.id.split('_').at(-1)!;
      await page.evaluate((id) => window.__bb!.artLab(id), def.id);
      const lab = await page.evaluate(() => window.__bb!.artLabState());
      if (!lab?.drawn) {
        const why = `${def.name} is not drawn in ${set.name}: ${lab?.reason}.`;
        if (ONLY.length) throw new Error(why);
        console.log(`Skipped. ${why}`);
        skipped.push(def.name);
        continue;
      }
      for (const scale of [1, 2] as const) {
        await page.evaluate((s) => window.__bb!.artScale(s), scale);
        await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
        await page.evaluate(() => window.__bb!.artLabFrames(24));
        const state = await page.evaluate(() => window.__bb!.artLabState());
        expect(state?.drawnCells, def.id).toBe(state?.cells);
        await page.screenshot({ path: join(DIR, `${set.id}-${name}-${scale}x-grid.png`) });
      }
      const poses = await page.evaluate(() => window.__bb!.artLabPoses());
      for (const [focus, pose] of poses.entries()) {
        if (COMMON.has(pose)) continue;
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), focus);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        await page.screenshot({ path: join(DIR, `${set.id}-${name}-${pose}.png`) });
      }
      for (const look of ['paint', 'night'] as const) {
        await page.evaluate((l) => window.__bb!.artLabSet({ zoom: 4, focus: 0, look: l }), look);
        await page.evaluate(() => window.__bb!.artLabFrames(10));
        await page.screenshot({ path: join(DIR, `${set.id}-${name}-${look}.png`) });
      }
      console.log(`Reviewed ${def.name}: both atlases, expressions, poses, paint, and night.`);
    }
    if (skipped.length) console.log(`Not drawn yet in ${set.name}: ${skipped.join(', ')}.`);
    expect(skipped.length, `no bug in ${set.name} is drawn yet`).toBeLessThan(defs.length);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
}

/** A set's bugs in the world at night, one at a time: held up in the hand, then left to themselves. */
async function nightTour(set: ArtSet): Promise<void> {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });
  const defs = ONLY.length ? ONLY.map((id) => BUGS.get(id)) : BUGS.all;
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    if (FROM_SOURCE)
      await installSource(
        page,
        set,
        defs.map((d) => d.id),
      );
    await page.evaluate((id) => window.__bb!.artSelect(id), set.id);
    await openFrozen(page, 0);
    const send = (c: Parameters<NonNullable<typeof window.__bb>['send']>[0]): Promise<void> =>
      page.evaluate((cmd) => window.__bb!.send(cmd), c);
    await send({ type: 'set_time', hour: 23 });
    // A flat stretch of the plaza, away from the stump.
    const at = PLAZA_X + 29.5;
    await jumpTo(page, at - 9.6);
    await page.mouse.move(960, 40);
    const skipped: string[] = [];
    for (const def of defs) {
      const name = def.id.split('_').at(-1)!;
      const before = new Set((await entities(page)).map((e) => e.id));
      await send({ type: 'spawn', kind: 'bug', defId: def.id, x: at, y: 7 });
      await frames(page, 2);
      const id = (await entities(page)).find((e) => !before.has(e.id) && e.defId === def.id)!.id;
      await content(page, id);
      await frames(page, 60);
      const art = await page.evaluate((i) => window.__bb!.bugArt(i), id);
      if (art?.art !== 'drawn') {
        const why = `${def.name} is not drawn in ${set.name}: ${art?.reason}.`;
        if (ONLY.length) throw new Error(why);
        console.log(`Skipped. ${why}`);
        skipped.push(def.name);
      } else {
        /** A close-up of the bug, and how many night lights are on it. */
        const shoot = async (tag: string): Promise<number> => {
          const e = (await entity(page, id))!;
          const clip = await worldClip(page, e.x - 2.2, e.y - 2, e.x + 2.2, e.y + 1.2);
          await page.screenshot({ path: join(DIR, `${set.id}-${name}-night-${tag}.png`), clip });
          const lights = await page.evaluate(() => window.__bb!.bugLights());
          return lights.filter((l) => Math.hypot(l.x - e.x, l.y - e.y) < 2).length;
        };
        // Held up, it is awake: its lights at full strength.
        const e = (await entity(page, id))!;
        await send({ type: 'grab', x: e.x, y: e.y });
        for (let i = 1; i <= 10; i++) {
          await send({ type: 'drag', x: e.x, y: e.y - 0.12 * i });
          await frames(page, 1);
        }
        await frames(page, 12);
        const held = await shoot('held');
        // Put down and left alone. A day bug beds down, and its lights dim to half.
        await send({ type: 'release', vx: 0, vy: 0 });
        await framesUntil(page, async () => (await entity(page, id))?.bug?.mode === 'st_sleep', 600);
        await frames(page, 30);
        const mode = (await entity(page, id))?.bug?.mode;
        const left = await shoot('world');
        console.log(
          `Reviewed ${def.name} at night: ${held} lights held, ${left} left alone (${mode === 'st_sleep' ? 'asleep' : 'awake'}).`,
        );
      }
      await send({ type: 'despawn', id });
      await frames(page, 2);
    }
    if (skipped.length) console.log(`Not drawn yet in ${set.name}: ${skipped.join(', ')}.`);
    expect(skipped.length, `no bug in ${set.name} is drawn yet`).toBeLessThan(defs.length);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
}

for (const set of sourceSets(SRC_DIR)) {
  test(`${set.name} cast poses and expressions`, () => castTour(set));
  test(`${set.name} night in the world`, () => nightTour(set));
}
