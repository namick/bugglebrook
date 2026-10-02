# Post-merge playtest

Played at commit 384d33a (main) on 2026-10-02, after the sound samples, sim performance, save robustness, and gameplay fixes landed. I fixed nothing.

## How I tested

I wrote a scripted session (`tests/shots/playtest.spec.ts`) that plays one slot from a new game the way a curious 12-year-old would. It runs the first scene with the intro on, feeds Dot with the real mouse, flings a pebble and Rollo, and drops 20 mixed things into a heap by the trash can. Then it pokes the heap, pulls a thing out from under it, and sets a hungry Rollo on it with his favorite food on the far side. It also loads a seesaw, drops a hat over a napping Glorp's shell, feeds the can a pebble and then the whistle, and blows the whistle over clutter. After that come the pond, the flowerbed from day to 23:00, a bench craft, a cauldron brew, and the journal. It ends with a save, a trip to the menu, `app.quit()`, a relaunch, and a comparison of the world. A second spec (`tests/shots/playtest2.spec.ts`) repeats the first feed in three fresh worlds and runs night in the plaza, a wake, and the journal tabs.

When something looked off, I reproduced it headless in Vitest on main and on ab6f5ad, the commit just before settling landed, to tell new behavior from old. Those probes were throwaway files. Their setups are described under each finding so they can become tests.

Screens and logs are in `/tmp/bb-playtest/`. Contact sheets are `sheet-1.png` (menu to hat), `sheet-2.png` (can to reload), `sheet-walk.png` (Rollo on the heap), and `sheet-feed.png` (three first feeds). `pt-log.txt` and `pt2-log.txt` hold what `__bb` reported at each beat. The window is 1280x720 at 2x, so frames are 2560x1440.

The machine was at a load average of 5 to 7 on 6 cores throughout.

## Verdict

Main is close to release-ready apart from the music. Nothing crashed, nothing logged a console error, no entity went NaN, and the save round trip was exact. Two physics problems from the settling change are worth fixing first, because a kid will hit both within minutes of play. One is a seesaw that won't tip. The other is bugs standing inside piles. Each looks like a small change in `physics.ts`. The rest is polish.

## Findings

| ID | Sev | Problem | Status |
|---|---|---|---|
| PM-01 | P2 | A seesaw jams once a light thing has settled on its low end | Fixed: nothing settles on a body with a joint, or on something loose because of one (`keepOnHinges`). Test in `m8.test.ts`. |
| PM-02 | P2 | Bugs end up standing inside settled things | Fixed: a slip lasts only while the bug keeps moving along (`striding`); stopped, it is pushed out. Tests in `settle.test.ts`. |
| PM-03 | P2 | The first feed in the first scene gets a "later" bubble, and sometimes no meal | Fixed: the berry in the hand made the bottle cap count as a setup, so Dot hopped off it. The held thing now links nothing (`setupLinked`). Tests in `feeding.test.ts` and `m5.spec.ts`. |
| PM-04 | P3 | A settled heap slumps and twitches when a slot is reopened | Fixed without a save change: what was at rest settles again as the world loads (`settleLoaded`). Test in `settle.test.ts`. |
| PM-05 | P3 | A brand-new world opens with a red "1" on the journal button | Fixed: the plaza is never a new find. Tests in `journal.test.ts` and `m5.spec.ts`. |

### PM-01 (P2): a seesaw jams once a light thing has settled on its low end

What I did: put a crafted seesaw on flat plaza ground, set a cork on its right end, waited 5 seconds, then laid a pebble on the high end.

What happened: the seesaw didn't move. The pebble rolled down the plank and off the low end. On ab6f5ad the same pebble tips the seesaw all the way over. Rollo dropped on the high end doesn't tip it either. Headless numbers (plank angle before, then lowest angle in the next 3 s):

| Load on the low end | Weight on the high end | main | ab6f5ad |
|---|---|---|---|
| cork | pebble | 0.307, then 0.303 (stuck) | 0.307, then -0.328 (tips) |
| cork | Rollo | 0.307, then 0.301 (stuck) | 0.307, then -0.346 (tips) |
| pebble | pebble | 0.317, then -0.324 | 0.317, then -0.324 |

In the app the seesaw stayed at 0.235 rad after the drop (`pt-log.txt`, beat 07). My staging there was messy, since the seesaw came down across Dot and a snail (`pt-16`, `pt-17`), so the headless table is the better evidence.

Why: the seesaw has a pivot joint, so it never settles, but the cork on it can. `restsFree` stops a thing from settling on kinematic bodies, platforms, and bugs, not on a dynamic body with a joint. Once the cork is static the plank can't lift it. `wakeAhead` doesn't help. The falling pebble only wakes settled things near itself, and the plank never gets moving because the static cork holds it. A heavy load (a pebble) gets woken by the plank's own push, which is why pebble on pebble still works.

Where: `src/game/physics/physics.ts`, `restsFree` and `canSettle`. Something resting on a body with a joint probably shouldn't settle. The spoon catapult and anything welded have the same shape of problem, though the catapult is pulled by hand, and the hand wakes what it touches. The m8 seesaw test (`tests/unit/m8.test.ts:204`) waits only 60 ticks after placing the cork and drops the weight at 12 m/s, so it misses this. Waiting 300 ticks and laying the weight down gently would catch it.

### PM-02 (P2): bugs end up standing inside settled things

What I did: carried a hungry Rollo by hand to the left edge of the heap, with a rotten banana bit (his favorite) on the far side.

What happened: Rollo sank into the heap over about 3 seconds. He went from y 7.59 to 8.52 at the same x, and ended up drawn among a cork, a blueberry, and a red berry (`sheet-walk.png`, from `pt-15-walk-00`, `-04`, `-08`). He never reached the banana. None of the 20 heap things moved.

Headless, I dropped bugs onto a settled heap of 24 small things and tracked how many heap things had their middle within 0.75 of the bug's radius from the bug's middle. On main, Dot stood idle with a settled sugar cube 0.37 m and a cork 0.28 m from her middle (her radius is 0.5). On ab6f5ad no bug ever got that close to a heap thing.

Why: walking bugs slip past small things at rest (`slipsPast`), and the slipping contact stays switched off until the pair parts. A bug that slides off the side of a heap, or stops while slipping, is left overlapping the things. Nothing pushes it out, and they never part. Sliding down the side of a heap counts as walking past, because the side contacts are fresh and mostly horizontal.

Where: `src/game/physics/physics.ts`, `slipsPast` and the `slipping` set. A slip could end once the bug's middle comes within some fraction of its radius of the thing, or once the bug stops walking. A walking bug brushing past a pebble looks fine. A bug parked inside a cork looks broken, especially in a screenshot or photo mode.

### PM-03 (P2): the first feed in the first scene gets a "later" bubble

What I did: in three fresh worlds with the intro on, waited 4 to 7 seconds, then carried the red berry from beside Dot to her mouth and let go, as the guided start asks.

What happened: all three times Dot answered with the "later" reaction while the berry was at her mouth, and Rollo said "later" too in two of them. After the drop she ate it in two runs (`fed_liked`) and didn't eat it within 2.5 s in the third (`pt2-log.txt`; `sheet-feed.png`). In the main session she said "later" twice and didn't eat (`pt-06-fed.png`).

Why: the hand coming near wakes Dot (the first scene's `wake` command), which puts her in `st_react` for 70 ticks. `sayLater` treats that as busy, so the berry gets a "later". The 7890b3b change (food held at a sleeping bug's nose wakes it) doesn't cause this. A headless sniff-wake ate cleanly with no "later". So this is probably older than today's merges, but it sits in the first ten seconds of the game.

Where: `src/game/systems/bugAi.ts`, `sayLater`. A bug that just woke shouldn't count as busy for food at its mouth, or the first scene's wake could hand over straight to eating.

Fix note: `st_react` isn't in `BUSY`, so the waking moment wasn't the cause. Picking up the berry stamps it as the player's for 300 s, and `setupLinked` then counted the bottle cap under Dot as part of a setup once the berry came within 30 cm of it. The setup guard hopped her off the cap, and `sayLater` fired because she was in the air. The thing in the hand now links nothing until it is let go.

### PM-04 (P3): a settled heap slumps when a slot is reopened

What I did: let the heap of 20 things settle, saved, quit, relaunched, reopened the slot, and stepped 2 seconds.

What happened: nothing went missing, nothing was added, and no item moved more than 0.5 m (203 entities before and after). But only 1 of the 20 heap things was exactly still after 2 s, where all 20 were before the save. Headless, with a world saved and loaded with `serialize` and `Sim.load`, 5 heap things moved more than 3 cm in the first 30 steps and 9 by 120 steps, up to 13 cm. On ab6f5ad nothing moved more than 3 cm in the first 60 steps.

Why: settled things are static, so planck keeps no contacts between them and small overlaps stay as they are. Settling isn't saved, so on load every body is dynamic again, the solver pushes the overlaps apart, and the heap shuffles. A player who builds a careful stack and reloads may see it twitch or a top piece slide off.

Where: `src/game/physics/physics.ts` (settling) and `Sim.load`. One option is to save which bodies were settled and settle them again on load. Another is to let the loaded world run a few quiet steps before the first frame shows.

### PM-05 (P3): a new world opens with a red "1" on the journal button

What I did: started a new game with the intro on.

What happened: the journal button shows a red badge of 1 in the first frame of the first scene, before the player has done anything (`pt-02-intro-fade.png`). `__bb.stamps()` reports badge 1. It is the plaza counting as a found area. The P-17 fix keeps items off the badge, but a badge on an empty book in the very first shot reads as a to-do. A kid who opens it finds nothing new to look at but the map.

Where: the journal's area finds (`src/game/systems/journal.ts`). The starting area could count as already seen.

## Found while fixing

A bug landing on the end of a twig could press the twig's middle past the ground's line, and the ground's edge then pulled it under until the sim's rescue popped it out. It happens on ab6f5ad too: the plaza's spring sits beside a twig, and Rollo and Dot coming down from it set it off. Thin one-piece things pushed past the line are now put back on top in the same step (`liftThin`, tested in `bounds.test.ts`).

## What I checked and found healthy

- No console errors or page errors across both specs (about 6 minutes of app time and 11,700 sim ticks in the main session).
- Save, quit, and reload. `saveNow`, then the pause board to the menu (slot picture present, no locks, no save problems), then back in, then `app.quit()`. The quit save landed at the last tick (11,539), and the slot folder held `slot-1.json`, `slot-1.bak.json`, and `slot-1.old.json`. The relaunch brought back all 203 entities with nothing missing or added. Glorp still wore his top hat, and the time of day carried over.
- The save-failure badge stayed hidden all session (`saveTrouble().failures` 0).
- P-24 holds. A top hat let go over Glorp's shell, well away from his head, went on his head (`pt-19`).
- P-26 holds. The can ate a pebble with a chomp and burp, then spat the whistle back out (`trash_spat`). The whistle stayed in the world, and blowing it tidied the clutter (`item_tidied` 2). All 20 heap things were still there afterwards.
- P-14 holds. In the plaza, all five day bugs were up and idle at 20:30 and asleep by 21:30. A click woke Dot, groggy. She was up at 20 and 40 s and back asleep by 60 s.
- P-16 holds. The flowerbed at 23:00 reads fine: the moon on the gnome, glowing bluebells, the stage glow, and 20 light sprites (`pt-28`).
- P-17 holds. Item finds marked only their own tab (10 items, badge 13 without them). Visiting each tab cleared its mark, and the badge went to 0.
- The bench made a slingshot from a twig and a rubber band, and the cauldron brewed a giant potion. Both found their secrets and stamps.
- Settling in general. A heap of 20 settled completely within 5 s. A poke made the top cork hop (`item_poked`). Pulling the bottom thing out left nothing hanging in the air. Coming back to the plaza after its area had slept left the heap intact. Headless, pokes and a domino chain behave exactly as they did on ab6f5ad.
- Sound through the hooks only. Every play in `sfxSamples()` reports `source: "synth"`, as expected with no recordings yet. Ambience targets switch with the area and phase (`amb_plaza_day`, `amb_pond_day`, `amb_flowerbed_night`, `amb_plaza_night`), and `playing` stays empty because there are no beds to play. At night the plaza plays `stump_plaza_day` (P-03).
- The first scene opens zoomed to 1.6 and is back at 1.0 by about 3.9 s into the intro (`viewZoom()`).

## Perf

`pnpm test:perf`, run twice under a load average of 5 to 7: avg 5.49 ms and p99 17.59 ms, then avg 5.02 ms and p99 20.25 ms. Both runs go over the 4.5 ms and 14 ms bars, which is expected on this shared machine. Judge it on CI.

## Not covered

Photo mode, the sequencer, the hidden areas, rain, and weather weren't played this time. The pre-release review covered them, and today's merges don't touch them. The locked-slot and save-failure paths ran only as far as checking that nothing went wrong in normal play. `saves.spec.ts` drives the failure cases.

## About the specs

`tests/shots/playtest.spec.ts` and `tests/shots/playtest2.spec.ts` are uncommitted. The first is worth keeping as a post-merge smoke session (`pnpm shots -g "post-merge playtest"`, about 5 minutes). It logs every beat through `__bb` and keeps going when a beat fails. Its seesaw staging should move clear of the bugs before it's trusted. The second was a follow-up for this pass and can go.

Update: `tests/shots/playtest.spec.ts` is committed as the post-merge session tour, with its seesaw on open ground right of the stump and any bugs near it carried clear first. `playtest2.spec.ts` is gone; `m5.spec.ts` now covers the first feed.
