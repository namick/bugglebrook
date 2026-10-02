import { expect, test } from '@playwright/test';
import { PLAZA_X, jumpTo, launchApp, openFrozen } from './app';

// R12 and P-08: M12 asks for 16 bugs and 150 items at 60 fps. This is the
// crowded plaza of tests/unit/perf.test.ts in the real app, where each
// frame also updates the view. Drawing is left out: CI draws in software.

const ITEMS = [
  'item_pebble',
  'item_berry_red',
  'item_sugar_cube',
  'item_leaf',
  'item_bottle_cap',
  'item_cork',
  'item_petal',
  'item_feather',
  'item_matchbox',
  'item_jelly_bean',
  'item_seed_sunflower',
  'item_ice_cube',
];
const BUGS = [
  'bug_ladybug_dot',
  'bug_pillbug_rollo',
  'bug_snail_glorp',
  'bug_grasshopper_boing',
  'bug_waterstrider_skeet',
  'bug_firefly_flick',
  'bug_stinkbug_whiff',
  'bug_caterpillar_munch',
  'bug_mantis_prim',
  'bug_tardigrade_wubbo',
  'bug_bee_buzzby',
  'bug_cricket_fiddle',
  'bug_moth_luma',
  'bug_dungbeetle_barty',
  'bug_stagbeetle_moose',
  'bug_stickinsect_twig',
];

test('a crowded plaza of 150 more things and 16 more bugs updates well inside a frame', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await openFrozen(page, 0);
    await jumpTo(page, PLAZA_X + 14);
    await page.evaluate(
      ([items, bugs, x0]) => {
        // A fixed scatter, so every run times the same scene.
        let seed = 7;
        const next = (): number => {
          seed = (seed * 16807) % 2147483647;
          return seed / 2147483647;
        };
        for (let i = 0; i < 150; i++)
          window.__bb!.send({
            type: 'spawn',
            kind: 'item',
            defId: items[i % items.length]!,
            x: x0 + 2 + next() * 34,
            y: 1 + next() * 3,
          });
        for (const defId of bugs)
          window.__bb!.send({ type: 'spawn', kind: 'bug', defId, x: x0 + 2 + next() * 34, y: 2 });
      },
      [ITEMS, BUGS, PLAZA_X] as const,
    );
    await page.evaluate(() => window.__bb!.frames(300));
    const times = await page.evaluate(() => window.__bb!.timeFrames(600));
    expect(times).toHaveLength(600);
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = sorted[Math.floor(times.length * 0.99)]!;
    console.log(`crowded plaza frame update: mean ${mean.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms`);
    // CI's runner: 3.3 to 5.7 ms mean, 10 to 14 ms p99 (October 2026).
    expect(mean).toBeLessThan(9);
    expect(p99).toBeLessThan(25);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
