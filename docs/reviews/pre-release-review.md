# Pre-release quality review

Reviewed at commit 3355cac (main, with M11's hats and Buzzby, Fiddle, and Luma) on 2026-10-02. The sound-sample system and the sim perf work were still landing on their own branches, so this review doesn't judge them. Where they bear on an item, the item says so. I fixed nothing.

## How I tested

- **Played in the real app.** I ran one scripted "curious 12-year-old" session in the built Electron app under Xvfb, 24 simulated minutes long. It covered:
  - a new game from the menu with the first scene and the guided start
  - feeding, flinging, the tickle, and the shake
  - a hat on a bug, the trash can, and the pond
  - rain opening the sunflower, then every area unlocked and played in
  - a bench craft, a failed combo, and a cauldron brew
  - the sequencer, photo mode with the shutter, and the journal tabs
  - night, rain, and the trip down into the Ant Hill Depths and back
  - 20 rounds of flings across all six areas while the clock ran
  - a save, quitting, relaunching, and comparing the world
- **Ran shot tours.** The "first minutes" audit ran in full. The areas tour got through the locked previews, the flowerbed, and the pond before I stopped it to keep load off the shared machine.
- **Ran a headless idle soak:** 30 simulated minutes, all areas open, the focus cycling through them.
- **Read the code.** I did a static review of saves, IPC, the updater, error handling, and render hot paths. I also did a content audit of secrets, items, foods, and the journal. The unit suite wasn't run locally. Its CI run on main (37013077633) is green: 74 files, plus every E2E shard and all three builds.

The machine was shared and running at a load average of 25 to 50 on 6 cores. Every frame time I measured locally is inflated, so I count none of them as evidence. Perf items rest on the CI benchmark and on reading the code.

## Verdict

**Not ready to ship today. It's close.** It could be ready after the nine P1 items below. Three of them are hours of work: the credits placeholder, the two missing items, and the jars. Two depend on the owner: the music and macOS signing.

The core toy is strong, and the earlier review's fixes held. In the 24-minute session nothing crashed and nothing logged a console error. Nothing went NaN or left the world, and no state got stuck. The relaunch brought back all 231 entities. The guided start teaches feed, fling, and the tickle in the first 90 seconds without a word. The art is consistent across areas, times of day, and UI, and the content is deep: 8 areas, 16 bugs, 67 secrets, 32 recipes, 32 potions, and 29 wearables. A Steam reviewer won't call it "too short".

What they could call it:

- **"Tech demo."** Most of the world plays a synth pad instead of music, because 14 of the 16 tracks don't exist yet.
- **"Buggy / unfinished."** Three journal entries can never be completed, so 100 percent is impossible. A credits line reads "Artist name here". Two secrets can be locked out for good.
- **Lost progress.** The save code throws away a save it can't read, and that is a real data-loss path after a bad update.

Counts: 0 P0, 9 P1, 15 P2, 11 P3. That's 35 items.

## Punch list

| ID | Sev | Area | Problem | Evidence / repro | Suggested fix |
|---|---|---|---|---|---|
| P-01 | P1 | Saves | A save that won't load gets destroyed in a few menu visits. That covers a save from a newer build (a rollback or reinstall) and one a buggy migration throws on. `loadWithRecovery` calls `recover` on any parse failure. `recover` renames the save to `slot-N.corrupt.json` and copies the backup in, but the backup fails the same way, so the slot shows empty. The next menu build runs it again, and the copy overwrites `.corrupt.json`. Starting a new game in the "empty" slot then rotates the backup away. | `saveService.ts:45-51`, `saveStore.ts:118-131`, `migrations.ts:371` ("newer than this game") | Treat "newer version" and "both copies unreadable" as a locked slot (a padlock sign) and never recover. Never overwrite an existing `.corrupt` file; number them. Recover only when the backup actually loads. |
| P-02 | P1 | Saves | Failed writes are silent. Disk full, EACCES, or a save over `MAX_SAVE_CHARS` fails every 30 s with only `console.error('Autosave failed')`. The player keeps playing and loses everything since the last good save. | `game.ts:925-927`, `ipc.ts:113` | Show a wordless warning: a red cloud over the home stump that stays until a save works. Log the reason. Keep trying, with backoff. |
| P-03 | P1 | Music | Only 2 of the brief's 16 tracks ship (`main_menu`, `stump_plaza_day`). Every other area by day, every area at night, and both hidden areas fall back to the plaza track or a pad. In the play session the flowerbed played `pad:flowerbed_stage_day`. The music is the game's biggest "made by people" signal, and right now it reads as a prototype. | `src/renderer/public/music/manifest.json`; `__bb.music()` in the flowerbed: `"playing":"pad:flowerbed_stage_day"` | The owner should make at least the six day tracks and a shared night track before release. Until then, prefer the plaza day track over the pad for every day area so nothing sounds unfinished. |
| P-04 | P1 | Content | `item_balloon_scrap` never spawns. No start list, pool, or pop rule makes it, though the design doc says popped balloons leave one. It is the only source of `ess_inflate`. The thimble drum recipe, `potion_balloon`, and `potion_squeaky` can never be made, and the journal can't reach 100 percent. | `items8.ts:103`, `recipes.ts:49`, `essences.ts:45`, design doc line 894. No `spawn(...'item_balloon_scrap'` anywhere. | Pop a balloon (on a pin, a thorn, heat, or an over-fill) into a scrap with a bang. Add a test that every recipe input and essence source can be obtained. |
| P-05 | P1 | Content | `item_petal` never spawns, though its def says wind blows petals off the flowers. Munch and Prim like it, so that liking can never show, and its journal entry can't be completed. | `items.ts:530`; only `bugs.ts` refers to it | Let wind shed petals from the flowerbed flowers (capped, and tidied like other litter), or put a few in the flowerbed's start list. |
| P-06 | P1 | Secrets | Only two glass jars exist, and nothing brings them back. The rainbow end and the cloud catch each turn a jar into something else every time, even after their secret is found. A jar flung above y 0.6 m in the rain becomes a cloud jar by accident. With two of those, `secret_rainbow_end`, `secret_catch_cloud`, and the "Catch a cloud" mystery are lost for good. That breaks the "nothing is ever lost" rule. | `areas.ts:534,550`; `clues.ts:704-718` and `801-821` (no `canFind` check); `CLOUD_LINE = 0.6` | Respawn a jar on the compost shelf whenever fewer than two exist. Or make the cloud jar turn back into a jar once its cloud is let out, and the rainbow paint leave its jar behind. Add a trash/test check for "consumed by a secret". |
| P-07 | P1 | Polish | The credits board on the main menu shows "Artist name here". | `art/CREDITS.json` `"art"`; `credits.ts` shows any non-empty string | Put in the artist's name, or `""`. Add a unit test that fails on "name here". |
| P-08 | P1 | Perf | The sim step has slowed since R12. In CI's benchmark (150 extra items and 16 bugs in the plaza) it now takes 5.07 ms on average and 11.25 ms at p99, against 3.0 and 9.2 when R12 closed. That leaves too little of a 16.7 ms frame for drawing. The renderer adds costs found in the code: `sim.views()` snapshots every entity twice a frame, `mouthOwners()` rescans all bugs per mouthful and per bubble, sprites exist for every entity, and the shadow, glow, water, and weather Graphics are rebuilt every frame. M12's 60 fps acceptance test hasn't been shown to pass. | CI run 37013077633, "crowded plaza step: avg 5.07 ms, p99 11.25 ms"; `sim.ts:2274-2380`, `worldView.ts:632-807`, `hintDirector.ts:280` | This belongs to the perf branch now landing. Before release, run M12's 16-bug, 150-item, night-lighting scene on a mid-range PC and record avg and p99. Snapshot once per frame and share it. Cache mouth owners per step. Skip sprite creation off screen. |
| P-09 | P1 | Release | macOS builds are unsigned (`identity: null`). Squirrel.Mac refuses unsigned updates, so auto-update never works on Mac, and downloaded arm64 apps usually show Gatekeeper's "damaged" dialog. | `electron-builder.yml`, `updater.ts` | Sign and notarize (an Apple developer ID), or ship Mac through Steam only and turn the updater off on darwin. At minimum, document the `xattr` workaround in the release notes. |
| P-10 | P2 | Saves | Fixtures are missing for shipped save versions 11, 15, and 16. The migration test loops over a hard-coded list `[1..10, 12]`, so even the v13 and v14 fixtures are never run through it. AGENTS.md says every fixture is loaded. | `tests/unit/fixtures/`, `m5.test.ts:394`, `SAVE_VERSION = 16` | Make the test read the folder. Add real v15 and v16 saves now, and v11 if an old build can still write one. |
| P-11 | P2 | Saves | The quit flush gives the final save 2 s. In that time it waits for any save already running and then extracts a GPU thumbnail, so on a slow machine the last 30 s of play may not be saved. | `index.ts:279-294`, `game.ts:913` | Skip the thumbnail on quit (keep the last one) and raise the deadline to 5 s. |
| P-12 | P2 | Saves | On macOS, Cmd+Q likely doesn't quit on the first press. The close handler's `preventDefault` cancels `app.quit()`, and `window-all-closed` doesn't quit on darwin. | `index.ts:281`, `index.ts:325` | Handle `before-quit`: flush, then quit for real. Add a Mac CI smoke test. |
| P-13 | P2 | Stability | There is no `window.onerror`, `unhandledrejection`, or `render-process-gone` handler. If `boot()` throws, the player gets a blank window. If a ticker callback throws, the game freezes with no sign. If the renderer dies, the window stays dead and there's no save. | `main.ts:79-81`; grep finds no handlers | Catch errors at the top level. Try a save, then show a wordless "oops" card with a restart button. Reload the renderer on `render-process-gone`. Log to a file in userData. |
| P-14 | P2 | Fun | A day lasts 24 real minutes, and night runs 19:00 to 06:00, which is 11 real minutes. For most of that time most of the cast sleeps. In the play session, 6 of the 9 bugs met were asleep at four checks running (rounds 11 to 19, about 8 real minutes). A kid who starts playing at dusk finds a still world. | Play log, `[health long round 11/15/19]` modes | Shorten deep sleep to the middle of the night. Let napping day bugs wake for a poke or food and stay up a while. Make sure Luma, Flick, and Fiddle visibly carry the night. |
| P-15 | P2 | First look | In the first two minutes, about 60 percent of the screen is sky. Bugs, food, and props sit in a strip along the bottom quarter, with Dot about 70 px wide at 1080p. The guided start's ghost hand is a faint grey hand that is easy to miss against the ant hill. | `first-01-dot-asleep.png`, `first-02-guide-feed.png` (first-minutes tour) | Frame the first scene closer: zoom in or lower the horizon so the ground fills the lower half. Give the ghost hand a light outline and a soft glow. |
| P-16 | P2 | Art | At night the flowerbed's foreground is nearly black. The fallen gnome, the stage, and the loose items are hard to read, while the pond at night stays readable. | `140-flowerbed-night-0.png` (areas tour) | Lift the near-layer floor for this area, as the porch got, or add stage-light spill and fireflies to the additive layer. |
| P-17 | P2 | Journal | The journal button's badge reached 46 after 20 minutes. 33 of those were items, because picking up any new kind counts as a find. A big red counter that keeps climbing reads like a to-do list (the anti-patterns "never nag" and "no counters"), and it buries the finds that matter. | `__bb.stamps()` badge 46; `journal().fresh.page_items` 33 | Leave item pickups out of the badge, so they mark only their own tab. Badge only bugs, secrets, recipes, potions, and areas. |
| P-18 | P2 | Bugs | Some home areas lack the foods a bug cares about, so feeding there gets flat reactions. Prim (treehouse) has no opinion on anything there. Whiff (porch) has nothing he loves or dislikes. Munch (flowerbed) has nothing he dislikes. In the pond, Skeet and Flick have no loved or disliked food. | `bugs.ts` likes against each area's start list | Add one loved and one disliked food to each bug's home area. Change the feeding test to check home areas, not the whole world. |
| P-19 | P2 | Clutter | During active play the world grew from 158 entities to 231 in 24 simulated minutes. Left alone it stays flat: a headless 30-minute soak went from 162 items to 162. So the growth comes from play: pool spawns, junk, crafts, crumbs, and bottles. Playtest F2 asked for less clutter. | Play log `[health ...]` lines; headless soak | Log spawns by source in a long scripted session and cap whichever pool runs away. Count entities per area in the soak test. |
| P-20 | P2 | Perf | Taking a photo calls `canvas.toDataURL` on a 1920x1080 picture on the main thread, which is a visible hitch. Each 30 s autosave rewrites up to 60 photo thumbnails into the slot and fsyncs twice. | `photoMode.ts:763`, the save path | Encode with `OffscreenCanvas.convertToBlob` in a worker. Store thumbnails in their own file, written once. |
| P-21 | P2 | Release | Updating a Linux .deb asks for a pkexec or sudo password on quit, and `checkForUpdatesAndNotify` posts an OS notification. Both are odd in a kids' game. | `updater.ts` | Update only the AppImage on Linux and leave .deb to the package manager. Use `checkForUpdates` without the notification. |
| P-22 | P2 | Saves | There is one backup, and it's never more than 30 s old. Main checks only that a save is valid JSON, so a schema-broken but valid-JSON save rotates the good backup out on the next autosave. | `saveStore.ts:104-110` | Keep a second, older backup (rotate it daily or per session). Only rotate a backup that passes `loadSaveFile`. |
| P-23 | P2 | Secrets | Seven secrets have no visible tell in the world or in a bug's hint thought, only a journal pictogram: `bug_totem`, `fling_orbit`, `giant_launch`, `ghost_lattice`, `upside_tea`, `sludge_burp`, and `twig_bridge`. That goes against principle 9, "hint everything". | `hintThoughts.ts:11-51` | Give each a hint thought near its spot, or a small idle tell (a bug staring up at a stack of bugs, for example). |
| P-24 | P2 | Hats | A kid who drags a hat over the middle of a bug and lets go doesn't get it worn. The head target is 0.6 m around the head anchor. On Glorp, letting go above his shell missed, and the hat just fell. The head ring does glow, but only the head counts, though the rule's comment says "head (or body)". | Play session: `glorp wearing undefined`; `dropTargets.ts:32-33` | Count a let-go over the body as the head too, or snap the hat toward the nearest head within 1 m. |
| P-25 | P3 | Docs | Docs have drifted. The README says "every picture and sound is generated in code ... no image or audio assets" and "four tsconfigs" (there are five). AGENTS.md says sound effects are synthesized, but the Audio decision now allows recorded samples. The comment at `bugs.ts:7-9` says plaza foods, while the test checks the whole world. | grep | Update them with the sample-system merge. |
| P-26 | P3 | Tidy | The trash can will happily eat the tidy whistle, which then disappears for 40 s. A kid dragging the nearest thing into the can did exactly that. | Play session: `dropped item_tidy_whistle over the can` | Have the can spit the whistle back out with a "nope" clang. |
| P-27 | P3 | Tests | `secretAudit.test.ts` counts a secret as triggered if its ID string appears anywhere in the code. It doesn't check that prerequisite chains can be finished or that trigger items can be obtained, which is how P-04 to P-06 got through. `findSecret` quietly accepts unknown IDs. | `secretAudit.test.ts`, `sim.ts:1712-1717` | Add a reachability check: every recipe input, essence, and secret trigger item has a source. Make `findSecret` throw in tests on an unknown ID. |
| P-28 | P3 | Perf | The perf test allows a 9 ms average and a 30 ms p99, so it wouldn't catch the regression in P-08. Rendering has no perf test at all. | `perf.test.ts:48-49` | Tighten it to about 1.5x the current CI numbers. Add an E2E update-time check for the crowded scene on CI. |
| P-29 | P3 | Security | IPC handlers don't check `senderFrame`. Photo dimensions go unchecked even though `pngSize` exists. `enable-unsafe-swiftshader` is on for every player. | `index.ts`, `photo.ts:203-215`, `index.ts:209` | Check the sender's origin and the PNG size. Turn on SwiftShader only as a fallback. |
| P-30 | P3 | Saves | The save directory isn't fsynced after a rename, and `recover`'s `copyFile` isn't fsynced. | `saveStore.ts:12-27,128` | fsync the directory after a rename on Linux and macOS. |
| P-31 | P3 | Packaging | The .deb declares no `depends`, and the icon is only `build/icon.png`. | `electron-builder.yml` | Add an explicit deb dependency list and the .icns and .ico icons. |
| P-32 | P3 | Art | The flowerbed stage lays its props in one row on the stage top (popcorn, cup, seeds, and the paint drops along the floor). It echoes the porch's old "inventory row" (R02). | `140-flowerbed-day-1.png` | Group them into little scenes, as R02 did for the porch. |
| P-33 | P3 | Stability | `void this.ctx.resume()` can raise an unhandled rejection when the audio device is missing. | `synth.ts:203` | Catch it and retry on the next click. |
| P-34 | P3 | First look | In the first-minutes tour, the guided start's last demo (the shake) wasn't on screen when the tour looked, and no ordinary ghost demo had appeared at the 3-minute mark. The machine was heavily loaded, so this may be timing. | `first-log.txt`, lines `10-guide-shake` and `12-later-demo` show "Ghost: -" | Rerun the tour on an idle machine or CI. If it still happens, check that the shake demo can be staged with a light item on screen. |
| P-35 | P3 | Journal | 100 percent means 308 entries, about 170 of them items. Completion is mostly a pickup checklist rather than discoveries. | `journal().completion.total` 308 | Weight the big jar toward secrets, bugs, recipes, and potions, and show items as a side shelf. |

## The earlier review's items

I checked the 38 post-M8 items where the play session or the shots could show them.

- **Held: R01 (escapes).** 24 minutes of flings in all areas, the depths included, left no entity outside the world and none below the ground.
- **Held: R02 and R05 (grab targets and item size).** All my grabs landed, and loose items read clearly in the full-resolution flowerbed and pond shots.
- **Held: R04 (life).** Critters, pending signs, and bugs moving between areas all showed.
- **Held: R07 (the sunflower clue).** The clue sits inside the resting view.
- **Held: R08 (wearing).** It works now. Hats go on in `wear.spec.ts`, and heads glow while a hat is held; see P-24 for the loose aim.
- **Held: R09 to R11 (bench and cauldron).** A slingshot crafted, and a brew finished on the second stir.
- **Held: R13 (flaky E2E).** The last 10 CI runs on main and the feature branches are green. The one recent red was `life.spec.ts`'s ant line on 2026-10-02 06:47, since fixed.
- **Held: R22 (the journal).** It's the full journal now.
- **Held: R27 (tours).** The first-minutes tour passes.
- **Held: R33 (bad spawns).** The session logged no console errors at all.
- **Regressed: R12 (perf).** The step got slower again; see P-08.
- **Partly held: R29 (docs).** They have drifted again; see P-25.
- **Not rechecked:** the porch art (R03, R19), the treehouse (R16), the potion looks (R17), and the toy art (R18). I stopped the areas tour before the porch to keep load off the shared machine. They match the post-M8 fix notes in code.

## What I checked and found healthy

- No crash, exception, or console error in 24 simulated minutes of mixed play, or in the relaunch.
- Save and relaunch kept all 231 entities. Four had moved more than 0.5 m, which fits the world running a moment between the save and the quit.
- Rain opened the sunflower on its own within about 3 simulated minutes.
- Doorways to the depths and back worked with the real mouse.
- Photos wrote a PNG to the test Pictures folder.
- The sequencer took clicks and played 11 notes in key.
- IPC validation is solid: slot range, size and JSON checks, the PNG signature, and names generated in main. The window is sandboxed with `contextIsolation`, no node integration, and a CSP without `unsafe-eval`.
- Atomic writes are correct: temp file, fsync, and rename.
- Left alone with all areas open, the world doesn't grow.
- 9 secrets were found in the session without aiming for them, including the domino chain and the fling orbit. The early-secret principle works.

## What was static

I didn't drive the following in the app: the save-recovery path (P-01), write failures (P-02), quitting on macOS (P-12), crash handling (P-13), the updater (P-09, P-21), the renderer perf claims (P-08, P-20), food coverage (P-18), and secret reachability (P-04 to P-06, P-23). Each comes from reading the code at the lines cited.
