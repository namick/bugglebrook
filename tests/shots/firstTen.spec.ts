import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp, toClient } from '../e2e/app';
import { sharpShots } from './clip';

// Playtest F3's audit: a scripted new player's first minutes, with the
// first scene and the guided start on, in real time. `pnpm shots -g "first
// minutes"` writes /tmp/bb-shots/first-*.png and first-log.txt, which lists
// each moment, what the ghost hand showed, and which core verbs the player
// had done by then.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const VERBS: Record<string, string> = {
  item_grabbed: 'grab',
  item_dropped: 'drop or fling',
  item_poked: 'poke',
  bug_poked: 'poke',
  bug_fed: 'feed',
  bug_tickled: 'tickle',
  item_shaken: 'shake',
  pocketed: 'pocket',
  time_skipped: 'sundial',
};

test('first minutes audit', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { page } = bb;
  sharpShots(page);
  const log: string[] = [];
  const started = Date.now();
  const stamp = (): string => `${((Date.now() - started) / 1000).toFixed(1).padStart(6)} s`;
  const shot = async (name: string, note: string): Promise<void> => {
    await page.screenshot({ path: join(DIR, `first-${name}.png`) });
    const h = await page.evaluate(() => window.__bb!.hints());
    const evs = await page.evaluate(() => window.__bb!.events().map((e) => e.name));
    const verbs = [...new Set(evs.map((n) => VERBS[n]).filter(Boolean))].join(', ');
    log.push(
      `${stamp()}  ${name}: ${note}. Ghost: ${h?.ghost.active ?? '-'}; shown: ${JSON.stringify(h?.ghost.shown ?? {})}; guide left: ${h?.ghost.guide?.join(' ') ?? 'none'}; verbs so far: ${verbs || '-'}`,
    );
  };
  const idle = async (seconds: number): Promise<void> => page.waitForTimeout(seconds * 1000);
  const waitGhost = async (kind: string, max = 30): Promise<boolean> => {
    for (let i = 0; i < max * 4; i++) {
      const h = await page.evaluate(() => window.__bb!.hints());
      if (h?.ghost.active === kind && (h.ghost.frame?.pose === 'grab' || i > 8)) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };
  try {
    await page.evaluate(() => window.__bb!.enableIntro(true));
    await clickSlot(page, 0);
    await page.mouse.move(640, 60);
    await idle(0.6);
    await shot('00-fade-in', 'The world fades in, the camera slides toward Dot asleep');
    await idle(3.5);
    await shot('01-dot-asleep', 'Dot asleep on the bottle cap, a berry beside her');
    await waitGhost('feed');
    await idle(1.6);
    await shot('02-guide-feed', 'The ghost hand carries food to a mouth');
    // The player wakes Dot and feeds her the berry.
    const dot = await page.evaluate(() => window.__bb!.entities().find((e) => e.defId === 'bug_ladybug_dot'));
    if (dot) {
      const at = await toClient(page, dot.x, dot.y - 0.4);
      await page.mouse.move(at.x, at.y, { steps: 6 });
      await idle(1.2);
      await shot('03-dot-wakes', 'The hand comes near; Dot wakes and looks');
      const berry = await page.evaluate(() =>
        window.__bb!.entities().find((e) => e.defId === 'item_berry_red' && !e.held),
      );
      if (berry) {
        const b = await toClient(page, berry.x, berry.y);
        await page.mouse.move(b.x, b.y, { steps: 5 });
        await page.mouse.down();
        const mouth = await page.evaluate((id) => window.__bb!.mouthOf(id), dot.id);
        if (mouth) {
          const m = await toClient(page, mouth.x, mouth.y);
          await page.mouse.move(m.x, m.y - 10, { steps: 12 });
          await idle(0.4);
          await shot('04-holding-berry', 'Holding the berry: Dot’s mouth glows');
          await page.mouse.up();
        } else await page.mouse.up();
        await idle(1.2);
        await shot('05-fed', 'Chomp, and a stamp lands by the journal');
      }
    }
    await page.mouse.move(640, 60, { steps: 4 });
    await waitGhost('fling');
    await idle(1.8);
    await shot('06-guide-fling', 'The ghost hand flings something');
    // The player flings a pebble.
    const pebble = await page.evaluate(() =>
      window.__bb!.entities().find((e) => e.defId === 'item_pebble' && !e.held),
    );
    if (pebble) {
      const p = await toClient(page, pebble.x, pebble.y);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      await page.mouse.down();
      await page.mouse.move(p.x + 40, p.y - 40, { steps: 2 });
      await page.mouse.move(p.x + 300, p.y - 260, { steps: 3 });
      await page.mouse.up();
      await idle(1);
      await shot('07-flung', 'A pebble flies');
    }
    await page.mouse.move(640, 60, { steps: 4 });
    await waitGhost('tickle');
    await idle(1.6);
    await shot('08-guide-tickle', 'The ghost hand holds still on a bug: the tickle');
    // The player tickles Glorp.
    const glorp = await page.evaluate(() =>
      window.__bb!.entities().find((e) => e.defId === 'bug_snail_glorp'),
    );
    if (glorp) {
      const g = await toClient(page, glorp.x, glorp.y);
      await page.mouse.move(g.x, g.y, { steps: 4 });
      await page.mouse.down();
      await idle(1.6);
      await shot('09-tickled', 'Holding still on Glorp: giggles');
      await page.mouse.up();
    }
    await page.mouse.move(640, 60, { steps: 4 });
    await waitGhost('shake', 60);
    await idle(1.8);
    await shot('10-guide-shake', 'The ghost hand shakes something');
    // Pan by dragging the sky.
    await page.mouse.move(900, 120);
    await page.mouse.down();
    await page.mouse.move(400, 130, { steps: 10 });
    await page.mouse.up();
    await idle(1.5);
    await shot('11-panned', 'Dragging the sky pans toward the pond');
    // Then the player rests, and the ordinary demos take over.
    // (Ordinary demos wait out a 90 s cooldown after the last guided one.)
    await page.mouse.move(640, 60, { steps: 2 });
    for (let i = 0; i < 160; i++) {
      const h = await page.evaluate(() => window.__bb!.hints());
      if (h?.ghost.active && h.ghost.frame && h.ghost.frame.alpha > 0.5) break;
      await page.waitForTimeout(1000);
    }
    await shot('12-later-demo', 'After a longer rest: an ordinary ghost demo');
    writeFileSync(join(DIR, 'first-log.txt'), `${log.join('\n')}\n`);
  } finally {
    await bb.app.close();
  }
});
