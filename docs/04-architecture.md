# Bugglebrook architecture

This is the technical plan for Bugglebrook. It covers the stack, where code lives, how data moves through a frame, and the rules that keep the codebase testable. The locked product decisions are in `00-decisions.md`, and they win over anything here.

## Stack

| Layer | Choice | Version |
|---|---|---|
| Shell | Electron | 44 |
| Build | electron-vite on Vite 7 | 5.0 |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` | 6.0 |
| Rendering | PixiJS, everything drawn with `Graphics` | 8.21 |
| Physics | planck.js (a TypeScript port of Box2D) | 1.5 |
| Audio | WebAudio oscillators, behind an `AudioBackend` interface | |
| Unit and integration tests | Vitest, Node environment | 5.0 |
| End-to-end tests | Playwright `_electron` | 1.63 |
| Lint and format | ESLint 10 with typescript-eslint, Prettier | |
| Packaging | electron-builder (NSIS, dmg and zip, AppImage and deb) | 26 |
| Updates | electron-updater against GitHub Releases | 6.8 |
| Package manager | pnpm | 12 |

### Choices that needed a reason

**planck.js over Rapier.** Both are deterministic. planck is plain JavaScript, so it loads synchronously in Vitest, in the renderer, and in a packaged asar with no WASM file to locate and no async `init()`. It has Box2D's joints (revolute, prismatic, distance, weld, mouse, wheel), which cover springs, ramps, marble runs, and seesaws. Rapier is faster, but our scenes hold dozens of bodies, not thousands. If profiling ever shows physics as the bottleneck, `src/game/physics/physics.ts` is the only file that imports planck, so a swap stays contained.

**TypeScript 6.0, not 7.** TypeScript 7 (the Go port) is out, but typescript-eslint 8.71 supports only `<6.1`. We stay on 6.0 until the linter catches up.

**Vite 7, not 8.** electron-vite 5 declares support for Vite 5 through 7.

**No image assets.** Every sprite, the menu, and the app icon come from code. `scripts/make-icon.mjs` draws the icon with `@napi-rs/canvas`, which ships prebuilt binaries and needs no system Cairo.

## Process model and security

```
main process (Node)                 preload (sandboxed, CJS)          renderer (sandboxed, no Node)
src/main/index.ts   <-- IPC -->     src/preload/index.ts   -->        window.bugglebrook
src/main/saveStore.ts                exposes a narrow API               src/renderer/src/**
src/main/settingsStore.ts                                               src/game/** (bundled in)
src/main/updater.ts
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer has no `require` or `process`, and an E2E test asserts that.
- The preload exposes exactly six keys on `window.bugglebrook`: `saves`, `settings`, `quit`, `testMode`, `platform`, and `onFlushRequest`. The type is `BugglebrookApi` in `src/shared/ipc.ts`.
- Main validates every IPC argument. Slots must be integers 0 to 2. Save payloads must be strings under 5 MB that parse as JSON. Settings must be an object and are normalized by `normalizeSettings` (`src/shared/settings.ts`) before they are stored. Main does not understand the save format; it stores opaque text.
- The window denies popups and blocks navigation. `index.html` sets a Content Security Policy with no `unsafe-eval`. Pixi normally compiles shaders with `new Function`, so the renderer imports `pixi.js/unsafe-eval`, which swaps in a polyfill that does not need eval.
- Main appends `enable-unsafe-swiftshader` so WebGL still works on machines without a usable GPU, such as VMs and CI under xvfb. This is acceptable because the app only loads its own bundled files.

## Module layout

```
src/
  game/                 Simulation core. Pure TypeScript. No DOM, Node, Pixi, or Electron.
    core/               rng.ts, loop.ts (FixedStepper), events.ts (EventBus),
                        commandQueue.ts, entities.ts (EntityStore)
    physics/physics.ts  The only planck import. Bodies are addressed by entity ID.
    systems/            Per-tick behavior. bugAi.ts is the bug state machine, choosing, and
                        reactions; bugMove.ts walking, hopping, and memory; bugSocial.ts
                        play between bugs; bugTypes.ts the AI's inputs and outputs;
                        needs.ts the five needs and moods; setup.ts the setup rule;
                        offscreen.ts the coarse model for sleeping areas.
                        dropTargets.ts picks where a dropped thing goes.
                        tags.ts is tag state, water.ts is pure water math, and
                        environment.ts runs water, fixtures, the property rules, and
                        Glorp's slime trail. pocket.ts is the pocket tray's slot logic.
    world/terrain.ts    The ground surface as a height field built from area polylines.
    data/               Content registries: areas, bugs, items, recipes, potions, secrets.
                        materials.ts is the material table, affinity.ts the bug-pair table.
                        types.ts, registry.ts, and validateContent() in index.ts.
    save/               schema.ts (SAVE_VERSION, types), migrations.ts, validate.ts
    commands.ts         The Command union: grab, drag, release, poke, tickle, shake, spawn,
                        focus, set_need, set_tag, set_weather, pocket_put, pocket_take,
                        stage_intro, wake, beckon
    events.ts           GameEvents: every event name and payload
    constants.ts        Units, gravity, logical resolution
    sim.ts              The Sim class that ties it together
    index.ts            Public exports for the renderer
  shared/ipc.ts         IPC channel names, BugglebrookApi, SlotInfo. Types and constants only.
  shared/settings.ts    The Settings type, defaults, and normalizeSettings (pure, used by both sides)
  main/                 Electron main: window, IPC handlers, SaveStore (backups, recovery),
                        SettingsStore (settings.json), auto-updater
  preload/              contextBridge API
  renderer/
    index.html          CSP and the canvas host
    src/
      main.ts           Boot: Pixi app, letterboxing, Game, test hook
      app/              game.ts (scene switching, loop, autosave, pause, pocket input),
                        saveService.ts (loads with backup recovery), settingsService.ts,
                        intro.ts (the first two minutes, pure), thumbnail.ts, memorySaves.ts
      render/           camera.ts, viewport.ts, bugPose.ts, bugFace.ts, juice.ts,
                        reactions.ts, thoughts.ts, tagLooks.ts, waveSurface.ts (all pure),
                        background.ts, pondArt.ts, water.ts, worldView.ts, particles.ts,
                        soapBubbles.ts, bubbles.ts, palette.ts,
                        draw/bug.ts, draw/face.ts, draw/item.ts, draw/pictogram.ts
      input/            pointerController.ts: pointer gestures to commands, camera moves,
                        tickles, shakes, and gesture sounds
      audio/            synth.ts (AudioBackend, WebAudioBackend, NullAudioBackend), sfx.ts,
                        voices.ts (gibberish bug voices)
      ui/               menu.ts (the main menu), slotSign.ts, compostBin.ts, logo.ts,
                        settingsPanel.ts (pause and settings board), controls.ts (vine
                        slider, toggle, plank board), pocketTray.ts, pocketLayout.ts (pure),
                        icons.ts, button.ts (PictureButton, Bounce, markUi), cursor.ts
      debug/testHook.ts window.__bb, only in test mode
tests/
  unit/                 Vitest. Headless. Covers src/game, the pure renderer modules, and SaveStore.
  e2e/                  Playwright against the built app in out/
  shots/                Screenshot tour for reviewing art by eye (`pnpm shots`), not a test
scripts/make-icon.mjs   Generates build/icon.png
build/icon.png          App icon source for electron-builder
```

### Dependency rules

- `src/game` imports nothing outside itself. ESLint enforces this. Inside `src/game` it bans imports of `pixi.js`, `electron`, `node:*`, and the app layers. It also bans `Math.random`, `Date.now`, `new Date`, `performance.now`, `window`, `document`, and timers. `tsconfig.game.json` compiles the folder with `lib: ["ES2023"]` and no DOM or Node types, so a stray `document` fails the typecheck too.
- The renderer may import `src/game` and `src/shared`. It may not import `electron`, `node:*`, or `src/main`.
- Main and preload may import `src/shared`. They never import `src/game`.

## Units and coordinates

- The sim uses meters. The renderer multiplies by `PIXELS_PER_METER` (100).
- Y points down in both sim and screen space, so no flipping is needed. Gravity is +20 m/s², about twice Earth's, which makes flings feel snappy at this scale.
- Each area has a `terrain` polyline of [area-local x, y] points. `Terrain.fromAreas` joins them into one height field, and physics turns it into a static planck chain. The flat ground is at `GROUND_Y` = 9 m. The plaza's stump top is at 4 m, with root flares on both sides that are never steeper than about 60 degrees, so bugs can walk over it. Invisible walls sit at x = 0 and at the world's right edge.
- The world is as wide as its areas. Areas tile left to right with no gaps, and `validateContent` checks that. Puddle Pond runs from 0 to 32 m and Mossy Stump Plaza from 32 to 70.4 m. Save version 4 moved everything in older saves 32 m to the right. Area data keeps area-local x, so plaza layout numbers did not change. Tests add `PLAZA_X` (`tests/unit/world.ts`, `tests/e2e/app.ts`) to plaza-local positions.
- The pond is a dip in the terrain. Its rims sit at y 8.5, the bottom at 10.4, and the water rests at 8.72. The screen ends at 10.8, so the pond is 1.7 m deep, shallower than the doc's 2.6 m. The banks ease in at under 50 degrees so swimmers can walk out.
- The logical resolution is 1920x1080, so one screen is 19.2 m wide. `fitViewport` letterboxes that into any window. The renderer resolution tracks the real device pixels, capped at 2x, so outlines stay sharp.

## The simulation

`Sim` owns an `EntityStore`, a `Physics` world, an `Rng`, a `CommandQueue`, and an `EventBus<GameEvents>`. `sim.step()` advances exactly 1/60 s:

1. Drain the command queue and apply each command.
2. Every 15 ticks, and whenever a `focus` command arrives, put far-away areas to sleep and wake near ones.
3. Every 2 s, run the coarse off-screen tick for bugs in sleeping areas.
4. Run bug AI. Each bug reads its body state, what it stands on, how deep it is in water, last step's impacts, and the `BugWorld` (other bugs, loose things, player setups), and returns a velocity plus notices that become events. Then the setup rule's walk-force cap takes away any velocity into a player setup, things move into and out of bugs' front legs, and throws in a game of catch are caught.
5. `Environment.beforePhysics`: raise or drain the water, move lily pads and ice sheets, and apply buoyancy, water drag, the current, Skeet's surface stance, parachute drag, wind, magnet pulls, and the hose's push. Then tear any weld pulled too fast.
6. Step physics with 8 velocity and 3 position iterations.
7. Handle new contacts. Contacts above 6 m/s become `bonked` events. Anything landing on a spring's top gets launched along the spring's axis. Impacts on bugs are kept for the next AI tick.
8. `Environment.afterPhysics`: measure how submerged each thing is, announce splashes and skips, weld sticky contacts, and every 15 ticks run the property rules.
9. Every 15 ticks, find structures for the setup rule. Then idle bugs near anything loud this step (a crash, a hard landing, a stack falling) turn to look.
10. Lift anything that ended up inside the ground back out (`sim.rescues` counts these; tests expect zero). Things in a mouth or in front legs are skipped.
11. Every 45 s, drop consumables back in from the sky if an area has fewer than its `respawn` list asks for, never within 3 m of a player setup.
12. Increment `tick`.

Determinism rests on four things. The only randomness is the seeded sfc32 `Rng`. Entities iterate in ascending ID order. Time is the tick counter and never the clock. Commands only take effect at step boundaries. A test runs the same scripted commands on two sims and asserts that both serialize to identical saves.

### Entities

An entity is `{ id, kind: 'bug' | 'item', defId, bug?: BugBrain, tags?: TagState, soak?: number }`. A new world is built from each area's `start` list. Physics state (position, angle, velocities) lives in the planck body, and `sim.views()` joins the two into plain `EntityView` objects for the renderer and the test hook. Component data stays plain JSON so it serializes without adapters. Add optional fields to `Entity` for new components such as hats, paint, or potion effects, and extend the save schema and validator to match.

### Commands

Input never touches physics directly. `PointerController` sends `grab {x, y}`, `drag {x, y}`, `release {vx, vy}`, `poke {x, y}`, and the tests also send `spawn`. A quick click on empty space also sends `poke`, which is how the hose tap and the sunken boot get clicked; the hand shows `hover_poke` over them. `Game` sends `focus` as the camera moves. `set_tag` and `set_weather` are for tests and debugging. On `grab`, the sim picks the topmost body within 0.2 m of the point. That is the highest entity ID, and the renderer draws in ID order, so the thing you see on top is the thing you grab. A planck `MouseJoint` then pulls the body toward the pointer.

Holding a bug still for 600 ms (within 6 px of the press) sends `tickle {on: true}`, and moving the hand sends `tickle {on: false}`. Three back-and-forth strokes of 80 px or more within 0.8 s send `shake` (`ShakeDetector` is pure and tested). `set_need` is for tests and debugging.

On `release`, the controller sends the cursor's average velocity over the last 80 ms, measured in world space and interpolated to exactly 80 ms. The body leaves at that velocity, capped at 26 m/s (2600 px/s). At 2.5 m/s or more it counts as a fling. Pointer samples use each DOM event's own timestamp and the release event's position, because on a slow frame events arrive in a burst after they happened. Chromium also merges fast moves into one event per frame, so `Game` replays each move from `getCoalescedEvents()` through the controller. Without that, a quick shake loses its strokes. A press and release within 200 ms and 6 px sends `poke` instead: the sim lets go of whatever the press picked up, then makes an item hop or a bug react.

### Drop targets

When the player lets go gently, `pickDropTarget` in `systems/dropTargets.ts` checks every target within its snap radius and takes the one with the best priority, then the nearest. The rules come from section 2 of the design doc. Only priority 4 exists so far: a bug's mouth takes anything tagged `tag_edible` within 0.5 m (50 px) of the mouth anchor. Bugs that are held, flying, or already chewing offer no mouth. A thrown food that hits a bug within 1.5 s of leaving the hand also counts if it lands near the mouth. Later milestones add containers, heads, paint, hands, and seats to `DROP_RULES`. The pocket (priority 1) is handled by input, below.

Each bug def has a `mouth` anchor in meters from its center, facing right. `sim.mouthAnchor(id)` mirrors it for the bug's facing, and `sim.dropTargetFor(itemId)` answers "where would this go if dropped now". The renderer uses that to light up the mouth it would feed. M3 added no drop targets.

### The pocket

Section 2 of the design doc. `systems/pocket.ts` is the pure slot logic: six slots of entity IDs (bottom of the stack first), stacks of up to nine identical `tag_stackable` items (only pebbles have the tag so far), and `at`, the tick each thing went in. `Sim.pocket` holds it and it is saved as `world.pocket`.

- Drop rule 1 lives in input, not in `DROP_RULES`, because the pocket is in screen space. `PointerController.up` asks `pocketAt` (the tray's hit test: slot bounds plus 20 px, only while the tray is at least half open) and sends `pocket_put {slot}` instead of `release`. The sim lets go and takes the thing out of the world: body switched off, welds undone, carried things set down, bugs in `st_pocketed` with social play ended. A slot that cannot take it swaps: what was there pops out where the thing was (`pocket_swapped`).
- Pressing on a full slot sends `pocket_take {slot, x, y}`: the top thing comes back at the cursor (kept above the ground) straight into the hand, and counts as a player touch for the setup rule.
- Pocketed things are out of time. `sim.isSleeping(id)` is true for them, so every system that skips sleeping bodies skips them too (the AI, adverts, structures, water, drop targets); `isPocketed` tells the two apart, and area sleep and the off-screen model leave them alone. Needs do not decay. Coming out, `shiftTags` and `shiftBrain` move every timer on by the time spent inside, so a wet pebble is as wet as when it went in.
- The setup rule: a pocketed setup is not in `setupLinked()` or the AI's `setups`, so it leaves no phantom obstacle behind, and pocketed food is never eaten or carried.
- Views carry `pocket` (the slot) for pocketed things. `WorldView` skips them and `PocketTray` draws them: a denim strip with yellow stitching that slides up in 150 ms while the player holds something or hovers the bottom 60 px (and stays up while the hand is over it), keeps a slim tab once it holds anything, shows bugs peeking over the pocket fronts, stacks as pips, and lights the slot under a held thing (orange when it would swap).

### Tags and property rules

Section 6 of the design doc drives this. Each item has a material (`data/materials.ts`), and the material's tags join the item def's tags as its defaults. Bugs have no defaults. `entity.tags` stores only changes from the defaults, as a map from tag to tick (see `systems/tags.ts`): a tick above 0 means "on until then", -1 means on for good, 0 means a default switched off for good, and a negative tick means a default switched off until that tick. Water and soap switch defaults off for 20 to 30 s, so washed gum is sticky again once it dries and a rinsed banana starts to stink again. `validateContent` rejects tags that are not in `TAG_IDS`.

Use `sim.hasTag`, `sim.addTag(id, tag, cause, seconds?)`, `sim.removeTag`, and `sim.tagsOf`. They emit `tag_gained` and `tag_lost` with a cause, and update friction (wet 0.7x, frozen 0.05x). Adding wet to something hot, or hot to something wet, steams both off at once.

`Environment` in `systems/environment.ts` holds the rules. Contact rules run on every touching pair, plus pairs that touched briefly since the last check, every 15 ticks (4 Hz), in both orders:

- Soap cleans the other thing (sticky, slimy, smelly, painted, muddy) and soaks into absorbent things.
- R2: wet meets hot. Both go, with a `steamed` event.
- R4: frozen meets hot. It thaws to wet.
- R3: wet meets cold (and the cold thing is not also hot). The wet thing freezes: 15 s for items, 4 s in an ice block for bugs. It thaws to wet.
- R6: sticky welds to what it touches, also on first contact. Each sticky thing holds at most 3 welds. A weld tears when the hand pulls its target faster than 9 m/s (900 px/s), or when the two bodies move apart faster than that, which is how flings tear it. Hand speed spreads each move over the steps since the last move, because slow frames run several steps per drag. Bugs wriggle loose after 6 s. `env.sticks` saves welds, and loading rebuilds them.
- R8: stink soaks into absorbent things.

Area effects run at the same 4 Hz: water (R1: wet, and washes off muddy, smelly, slimy, painted, sticky, and hot with steam), rain after 5 s (R15), the hose spray, soap plus wet blowing bubbles every half second (R7), stink reaching bugs within 1.5 m (R8), and sparky things in water electrifying it for 2 s so swimming bugs get fuzzy hair (R9). Magnets (R10) and wind (R14) are forces applied every step. A cold thing that hits the water freezes a 2 m ice sheet for 30 s (R5), once per entry. Wringing a shaken sponge (R18) drips its water or soap onto everything below it.

Some things M3 can only reach through debug commands: `set_weather` sets wind and rain until M6 brings weather, and `set_tag` adds sparky or painted since no item has them yet.

Eating leaves tags too. Hot food makes the eater hot for 20 s, cold food cold for 10 s, bouncy food (the jelly bean) makes it hop once 50 ticks later, and soap comes back up as a bubbly burp.

### Water

`systems/water.ts` has the pure math: the submerged fraction of a circle or box, where a flat surface meets the terrain, buoyant acceleration, the stone-skip test, and the hose's spray arc. Each area may have a `water` def and `fixtures`.

- Buoyancy uses the def's density divided by `hull`. Rafts and boats are hollow, so they carry bugs. A floater settles where its submerged fraction equals that density. Vertical damping follows each floater's own bob frequency, so a cork settles as fast as a raft. Flat floaters get a righting torque, and boats right themselves to upright. Paper boats go soggy after 40 s soaking and sink.
- Floaters ride a 0.08 m/s current to the right.
- A low, fast throw (under 20 degrees, over 10 m/s) skips.
- The hose tap is a fixture. A click on empty space sends `poke`, and `pokeFixture` toggles the hose. While it runs, the water rises 0.02 m/s up to 0.18 m and drains at 0.005 m/s after. The spray wets what it passes and pushes light things along.
- Lily pads and ice sheets are kinematic platforms in `Physics` (`setPlatform`). They are part of the world, not entities, so they cannot be grabbed. Pads sink a little under weight and bob back.
- `overOpenWater(x)` is water with no pad or ice on it. Bugs that cannot skate never walk or wander onto open water, and never seek food floating there.

### Area sleep

The renderer sends `focus {x0, x1}` when the camera moves more than 0.25 m. An area sleeps when a whole screen (19.2 m) or more of space separates it from the view. Its bodies are switched off, and its water and fixtures pause. Held, mouthed, and carried things never sleep. With only two areas, the pond sleeps only when the camera is at the plaza's far right. Without a focus (tests, headless runs) nothing sleeps.

Bugs in a sleeping area run `OffScreen` (`systems/offscreen.ts`) every 2 s. Anything mid-air, mid-swim, mid-meal, or mid-game settles first: the meal is finished, what it carried is set down, and a swimmer is put on the nearest shore. Then needs decay for 2 s at once, and the bug picks a coarse plan the way the full AI would: sleep here (energy under 45), go and eat (hunger under 40), play at the spring, visit a friend, head home, or wander. It walks the plan at 0.6 m/s by moving its switched-off body. When the area wakes (`OffScreen.wake`), the bug is put on the ground at its plan's spot and carries on for real: it seeks the food or toy, walks to where it was going, or is still asleep. Returning never shows a bug frozen mid-fling. The doc's 4 Hz fallback for far bugs is not needed yet: a step with five bugs costs about 0.3 ms.

### Events

`GameEvents` in `src/game/events.ts` lists every event. Names are snake_case and past tense, for example `item_grabbed`, `item_dropped`, `item_poked`, `item_shaken`, `bonked`, `spring_bounced`, `bug_landed`, `bug_dizzy`, `bug_recovered`, `bug_fed`, `bug_ate`, `bug_spat`, `bug_burped`, `bug_reacted`, `bug_tickled`, `bug_wriggled_free`, `bug_used`, and `entity_removed`. M3 added `tag_gained`, `tag_lost`, `splashed`, `left_water`, `skipped`, `steamed`, `froze`, `thawed`, `ice_formed`, `ice_melted`, `stuck`, `unstuck`, `bubbles_blown`, `bug_smelled`, `water_zapped`, `magnet_snapped`, `bug_swam`, `bug_shook_dry`, `wrung_out`, `hose_toggled`, `boot_bubbled`, `area_slept`, and `area_woke`. Handlers run synchronously during `step()`. A throwing handler does not stop the others. Subscribers must not change sim state from a handler. If a reaction needs to change the world, it sends a command.

Current subscribers:

- `Sfx` plays grabs and impacts tuned to each material (wood, metal, rubber, stone, glass, leaf, food, bug), whooshes, pokes, springs, the three chomps of a bite, the gulp of a swallow, a gag, "ptoo", sneezes, burps, flame and chill puffs, a chime for loved food, tickles, rattles, hops, dizzy tweets, and the respawn whistle. For M3 it adds splashes and plops, skips, steam hisses, freezing crackles, thaw drips, the gum's squelch and pop, the magnet's clink, bubbles, stink, the shake-dry "brrr", the tap's clicks, the boot's blub, the sponge's squish, and the zap. `WorldView.onSound` adds bubble pops and the running hose's trickle.
- `BugVoices` speaks the voice of each `bug_reacted` (from the reaction table), plus giggles for tickles, gasps for disliked food, and lines for dizzy spells, recoveries, bounces, and choices.
- `WorldView` kicks squash springs, shows speech bubbles, and spawns dust, stars, sparkles, crumbs, hearts, flame puffs, snowflakes, spit droplets, burp clouds, bubbles, and fling trails. Very hard landings shake the screen a few pixels.

M4 added `bug_inspected`, `bug_picked_up`, `bug_put_down`, `bug_socialized`, `bug_social_ended`, `bug_chatted` (a pictogram topic and the food or bug it is about), `bug_bumped`, `bug_tagged`, `bug_threw`, `bug_caught`, `bug_shared`, `bug_snatched`, `bug_comforted`, `bug_gawked`, `bug_rode`, `bug_slept`, `bug_woke`, `bug_posed`, `bug_fidgeted`, `bug_slipped`, `bug_curled`, `bug_hid`, and `stack_fell`. `Sfx` gives them boops, pats, tosses, catches, a fanfare for a pose, snores (from the renderer, only for bugs on screen), and more; `BugVoices` speaks chat lines in the emotion of their topic; `WorldView` shows bubbles and particles.

M5 added `pocketed`, `unpocketed`, `pocket_swapped`, and `bug_beckoned`. `Sfx` gives the pocket a denim "fwup" and a pop, and has UI sounds (`ui_tick` pitched by a slider's value, `ui_open`, `ui_close`, `toggle_on`, `toggle_off`, `bin_shut`, `whoosh_in`).

The journal, secrets, and music will subscribe the same way.

### Bug AI

`systems/bugAi.ts` follows section 5 of the game design doc. Brain state is plain JSON on the entity. Modes use the doc's state names (the full list is under M4 below). The notes here start with what M1 to M3 built; M4's additions follow.

- Needs run 0 to 100 and decay every tick at the doc's rates times each bug's weight (all five since M4, below).
- Choosing. Every 1.5 s an idle or wandering bug scores every advert within 9 m with the doc's formula (urgency, like multiplier, distance falloff, novelty, recent-use penalty, plus a random 0 to 6). It picks among the top three with weights 60/30/10 if any scores above 8. Items another bug is already heading for are skipped. Adverts live on item defs: berries and leaves offer `eat`, the spring offers `bounce`.
- Walking. Bugs set their velocity along the ground's tangent and cancel the slope's pull, so they climb roots and stand still on slopes. Bug fixtures have low friction because friction would only fight this. A pebble or twig in the way gets a small hop instead of a shove; another bug or anything taller than 0.7 m ends the walk.
- Eating takes 1.5 s next to the item, then the sim removes it and emits `bug_ate`. Bouncing is a ballistic hop onto the spring's top; the spring's launch pays out the fun.
- Flying. Release, a hard knock, or a hop puts a bug in `st_airborne` (or `st_use` for a spring hop). It lands when it is supported again. If the hardest impact was 9 m/s or more and the bug did not launch itself, it goes `st_dizzy` for `clamp((v - 9) / 2.5, 0, 4) + 2` seconds, plus 1 s per repeat within 10 s, capped at 8 s. Otherwise it goes `st_landing` briefly. Rollo curls into a real rolling ball while airborne.

- Eating. A bug that reaches food it chose, or gets food dropped on its mouth, calls `feedBug`: the item's body goes inactive and sits at the mouth anchor (`bug.mouthful`), and the bug chews in `st_eat`. Loved food takes 100 ticks, liked and neutral 90. Then the sim removes it, emits `bug_ate`, and the bug plays a `fed_*` reaction in `st_react`. Hunger fills by 60, 40, or 20. If hunger ends at 95 or more, a `bug_burped` follows 70 ticks later. Disliked food gets one 50-tick chew, then the sim spits it forward and up (`bug_spat`), the item stays in the world, and the bug is `mood_grumpy` for 8 s. Anything that ends `st_eat` early (a grab, a poke, a knock) drops the food where it is. Saves keep a mouthful, and loading puts it back in the mouth.
- Food on offer. While the player holds food within 2.5 m, bugs that are idle, wandering, or reacting stop and turn to face it. That keeps them feedable instead of walking off or facing away.
- Reactions. `react(brain, type, rng, tick)` picks one of three variants for grab, poke, fling, land, land_hard, tickle, and fed_loved, fed_liked, fed_neutral, fed_disliked. It never repeats the variant this bug last played for that type. `brain.variants` remembers the last one, and `brain.reaction` holds the current one for the renderer. The sim decides which variant; the renderer's table decides what it looks and sounds like.
- Moods. `moodOf` follows section 5: grumpy (for 8 s after disliked food), then sleepy, hungry, bored, happy (all five needs), and content. The renderer uses mood for idle faces and for voice pitch and pace.
- Tickles and shakes. A tickled bug laughs a level harder each second (`bug_tickled` levels 1 to 3) and wriggles free of the hand at 3 s. A shaken bug is woozy for 1 s.
- Glorp is `dizzyProof`. A hard landing sends him into his shell for a `land_hard` reaction (2.5 s in `st_react`, spinning like a top) instead of `st_dizzy`.
- Swimming. A bug that cannot skate and is more than 35 percent under water enters `st_swim` and plays `splash`. Each bug def has a `swim` style that sets its float density: Dot paddles, Glorp floats shell-up like a boat, and Rollo sinks and walks the bottom holding his breath. A swimmer heads for the nearest shore, kicks up and over when stuck against a pad or bank, and climbs out. On land it plays `shake_dry` in `st_react`, which removes `tag_wet`. A bug stranded on a pad or ice with water all round jumps back in now and then.
- Skeet (`swim: 'skate'`) stands on open water. Before each step the environment snaps him to the surface and cancels gravity, and the sim hands his AI a flat support normal, so walking works unchanged. Touchdown counts as a gentle landing and never makes him dizzy. On a raft or pad he stands like anywhere else. `glidesWhenFlung` gives him parachute drag, so he falls at about 3 m/s.
- Home and water. Wandering keeps a bug inside its home area when it is there and drifts it back when it is not. Non-skaters stop at the water's edge.
- Stink (R8). `smellBug` makes a bug in `st_idle`, `st_wander`, `st_seek`, `st_landing`, or `st_recover` react at most every 10 s. Stink lovers (`likesStink`, Rollo) stop for a happy sniff. The rest pull a face and walk 4 m away. Held and mouthed things give off no smell, so feeding still works.
- A frozen bug does nothing until it thaws.

#### M4: the full needs AI

- Five needs (`systems/needs.ts`): hunger, fun, energy, social, and cleanliness, decaying at the doc's rates times each bug's weights. Energy refills at 1.5/s asleep and 0.05/s resting, and moving spends 0.08/s more; asleep, energy does not decay and hunger and fun decay slower. A nap next to a friend refills social. A dip in water resets cleanliness to 100, rain adds 2/s, the hose 5 per hit, skating keeps Skeet clean, grooming adds 20, and a stink costs 10. Mood averages all five.
- Adverts. Items offer eat, bounce, sleep (the bottle cap, leaf, and sponge), and carry (pebbles, for Rollo). Anything a bug has not sniffed offers `inspect`, and something the player touched in the last 60 s gets a big curiosity bonus, which is how bugs come to see what the player dropped. Spots offer a nap right here (energy under 55), a splash at the water's edge, the stump top (Dot), and the camera (Dot, ignored for 90 s). Other bugs offer chat, bump, tag, catch (with a ball or berry nearby), share (a snack a hungry friend likes), comfort (a dizzy friend), snatch (a snack being carried), ride (Boing), and a nap pile (a sleeping friend). Social adverts use affinity instead of liking.
- Choosing follows section 5: urgency times weight times delta, liking or affinity, distance falloff, novelty, a 60 s repeat penalty, memory, plus 0 to 6 at random; top three at 60/30/10 above 8. Two changes: a runner-up must score at least half the best (so a starving bug does not wander off to pose), and a kind of play done in the last 90 s scores 0.45x, so bugs mix it up. Memory keeps the last 8 moments per bug (good 1.5x, bad 0.3x, fading over 120 s). A bug that cannot reach its target remembers it as bad for a while.
- States: `st_idle`, `st_wander`, `st_seek`, `st_use` (bouncing or sniffing), `st_social`, `st_eat`, `st_sleep`, `st_react`, `st_held`, `st_airborne`, `st_landing`, `st_dizzy`, `st_recover`, `st_swim`, `st_rolled`, `st_hide`, `st_ride`, `st_perform`, and `st_pocketed` (in the pocket tray). A hop on the way somewhere sets `resume`, and the landing goes back to that mode.
- Playing together (`systems/bugSocial.ts`). The bug that starts it is `lead`; it keeps the beat and the count, ends it, and pays both sides (social +15 to +30 and an affinity nudge; sharing is +0.05). Chat trades 3 to 6 pictogram lines; replies answer the last line, and some lines are gossip about a third bug. Tag swaps who is it on a touch, for 5 to 10 s. Catch throws a ball or berry in an arc to the partner's front legs; the sim catches it when it comes within 0.62 m, and a miss gets fetched. At the end the holder may eat the berry. Share carries a snack over and puts it in the friend's mouth. A cheeky bug may snatch a snack someone is carrying and run; tagged, it hands it back. Comfort pats a dizzy friend (a quarter off the spell). Boing rides on a head for 3 to 6 s and falls off if the mount is grabbed or flung. Loud things make idle bugs within 7 m gawk; the one who crashed may laugh along, and nervous Rollo with no friend near hides behind something low or curls up. Sociable bugs sometimes carry a snack over to eat beside a friend, which is when snatching happens.
- Sleep. A tired bug naps on a bed item, next to a sleeping friend (a nap pile), or where it stands. It wakes at full energy, or early (groggy for 3 s) when poked, grabbed, or hit hard, and nods off again 20 s later if still tired. The AI never wakes a sleeper.
- Signatures (`habits` on each `BugDef`): Dot climbs to the stump top, poses, and glides down on open wings, and walks into view to pose when ignored. Rollo curls into a rolling ball after three pokes in 1.5 s or a fall of 3 m, and lines loose pebbles up in a row by his resting spot. Glorp leaves a slime trail (`env.slime`, 30 s) that makes others slide. Boing gets about in hops of 2.2 to 4.6 m, never hops down more than 1.2 m, hops again after a fling, bounces in place when idle, and shoots out of water in one kick. Skeet hops clear of four or more bugs within 2.5 m.
- Idle bugs fidget every few seconds: a hum, a yawn when tired, a groom when grubby, a kick when bored, a look around; Skeet twirls on the water.

#### The setup rule

`systems/setup.ts`. Grabbing, dropping, or poking an item gives it `tag_player_setup` for 300 s, restarted on every touch. Every 15 ticks the sim finds structures: three or more things resting on each other, or things glued by sticky welds, with at least one touched by the player. Their pieces keep the tag for good (`PERMANENT`), and go back to a 300 s timer when they leave the structure. A structure falling apart fast emits `stack_fell`.

Bugs keep the rule in several layers. Setups, and anything touching them or within 0.3 m of them (`sim.setupLinked()`), never offer eat, carry, or sleep, and are never loose for catch, share, or pebble rows. Walking stops 0.2 m short of them, obstacle hops and Boing's hops check that the whole arc is clear (`clearLanding`), springs next to a setup are not bounced on, catch throws never cross one, and Dot's glide needs a clear path. Physics backs this up: before each step, any bug velocity into a setup contact is removed, a walking bug's side contacts with setups are switched off for that step (`Physics.passThrough`), a self-launched bug falls past them, and a bug that ends up standing on one hops off to a clear side. Bugs flung or poked by the player within the last 5 s hit things for real: that is the player's doing. Using a setup in place (sniffing it, bouncing on the player's spring) is allowed.

Bug bodies use `fixedRotation`, so bugs stay upright. Tumbling, stretch, and squash are cosmetic and live in the renderer.

## Content registries

Each file in `src/game/data/` exports one registry built with `createRegistry(kind, defs)`. IDs are snake_case and never change once a save might reference them. Definitions are plain data. `validateContent()` returns every problem it finds:

- IDs that are malformed or duplicated
- recipe, secret, and unlock references that do not resolve
- two recipes with the same pair of inputs
- areas with gaps or overlaps
- non-positive sizes, densities, speeds, or durations

`tests/unit/data.test.ts` requires the list to be empty. When a new kind of reference appears, add a check there.

Content follows `03-game-design.md` and uses its IDs. There are two areas (`area_puddle_pond`, `area_stump_plaza`), five bugs (`bug_ladybug_dot`, `bug_pillbug_rollo`, `bug_snail_glorp`, Skeet, `bug_waterstrider_skeet`, and Boing, `bug_grasshopper_boing`, new in M4), and twenty-six item kinds. Each bug has `traits` (restless, bouncy, curious, sociable, cheeky, generous, nervous; 0 to 1) and `habits` (its signature behaviors). `data/affinity.ts` holds the doc's pair table (it may name bugs that arrive later) plus a few pairs for the starting cast; play nudges it, and the sim saves the changes. The pond has a sunken teacup (`fix_sunken_teacup`), a static cup-shaped body things can land in. M3 added the blueberry, cork, leaf raft, paper boat, sponge, soap sliver, bubble wand, and feather to the pond. The gum blob and horseshoe magnet come from the porch in the doc; they wait on the pond's banks until the porch exists. Glorp loves soap (his weird favorite) and Skeet loves blueberries. M2 added six foods to the plaza: sugar cube, mint leaf, hot pepper flake, banana mush, moss tuft, and jelly bean. Some of them live in other areas in the design doc; they sit in the plaza until those areas exist. Each bug's `loves`, `likes`, and `dislikes` follow its profile, limited to foods that exist, and every bug has a loved, liked, neutral, and disliked food in the plaza (a unit test checks this). `validateContent` also rejects an item listed under two tastes, a mouth anchor behind the bug or far from its body, unknown materials or tags, water outside its area, `onWater` starts or lily pads that are not on water, and bad fixture IDs or radii. The recipe, potion, and secret registries are empty until their milestones. Item and bug sizes run a bit larger than the doc's pixel sizes so they read at 1080p.

## Rendering

The renderer reads the sim and never writes to it.

- `WorldView` keeps one sprite per entity. Each frame it creates sprites for new entities, removes sprites for entities that are gone, skips anything off screen, and draws a soft shadow under everything. Per-entity juice (a `SquashSpring`, cosmetic spin, trail timer) lives here, not in the sim.
- `BugSprite` draws five species. Boing is a lime grasshopper with a folded wing, big hinged back legs (folded standing, kicked straight out mid-hop, dangling when held), long springy feelers, and a wide grin. The others are a ladybug whose shell opens for flying, a pill bug that curls into a ball, a snail that pulls into its shell, and a water strider with long rowing legs that leave dimples on the water, walk stiffly on land, spread like a parachute when flung, and dangle when held. Static parts are drawn once per body form. Legs, feet, antennae (spring-simulated), eyes, mouth, wings, and dizzy stars are redrawn each frame. Nested containers stretch along the velocity, squash on the feet, and flip for facing.
- `bugPose()` (breathing, gait, flail, blinks) and `bugFace()` (eye and mouth shapes and body form per state and needs) are pure and unit-tested. So is `juice.ts`: the squash spring (stiffness 300, damping 18) and the stretch formula from section 15.
- Pupils follow the cursor within 3 m, or food on offer. `PointerController.hoverWorld` and `hoverId` are the only input the view reads.
- Reactions. `render/reactions.ts` is the table of how each reaction variant looks and sounds per bug: eyes, mouth, blush, face tint, body form, one or two pictograms, a voice emotion, a body move, and one-off particles. Love (heart eyes), yum (a lick), yuck (green, squeezed shut, tongue out), and hate (angry brows, gritted teeth, steam) are kept distinct on purpose, and a test checks it. `reactionShowing` limits each reaction to its own modes, and `movePose` turns a move (hop, spin, shrug, stomp, shell spin, and so on) into pose offsets. All of it is pure and tested.
- `bugFace` picks, in order: frozen, dizzy, asleep (eyes shut, a snoring mouth; Rollo curls up and Glorp hides in his shell), curled, woozy, tickled, the current reaction, chewing (by taste), a flinch, talking (the mouth flaps while a chat line lasts), groggy, food on offer, the state face (posing, hiding, riding, sniffing, playing, gliding), then mood.
- M4 reactions: `inspect`, `gawk`, `play`, and `show_off` are personal per bug; `wake`, `robbed`, `slip`, and `peek` are shared. New moves: `sniff`, `pat`, `yawn`, `bow`. Fidgets play a move too.
- Social play shows as bubbles: an intent bubble when a bug picks something (the food, a friend's face, a spring), chat lines with pictograms (a friend's face drawn by `drawFriend`, food, sun, stars), boops, tags, a heart when sharing or patting, and a sneaky grin on a snack thief. Sleepers give off drifting "Z"s. Carried things are drawn in front of the carrier. Glorp's slime is a glossy green smear on the ground that fades. Thought bubbles now also show a best friend's face when lonely and a drop when grubby.
- A round bug on a steep root rests on its side, so `WorldView` drops the drawing onto the ground under its middle.
- Bubbles. `Bubbles` shows one speech or thought bubble per bug, with pictograms drawn by `draw/pictogram.ts` or a mini item for `food`. Bubbles pop in with an overshoot, bob, stack when they would overlap, and shrink away. `thoughts.ts` picks a thought for a need under 25 (energy under 20): a favorite food, a liked toy, or "Zzz". Thoughts show every 9 s and after hovering a bug for 1 s.
- Mouth glows. While the player holds food, `WorldView` draws a pulsing glow at every free mouth: green for loved or liked, yellow for neutral, grey for disliked. The mouth it would land in gets a bigger glow and a white ring.
- Hover rim. The hovered grabbable gets a white rim behind its outline, pulsing between 60 and 100 percent at 2 Hz. Items and bugs trace their silhouette into a `rim` Graphics once per body form.
- The cursor. `ui/cursor.ts` draws a peach glove with the five poses from section 2 (`open`, `hover_grab`, `hover_poke`, `grab`, `pan`). The system cursor is hidden (`cursor: none` and Pixi's cursor styles). `cursorPose` is pure. `Game` updates the pose inside the pointer handler, so hover feedback lands in the same frame, and the hand scales to 1.1 over about 120 ms. The fist is drawn small and translucent above the grab point, so the held thing's face stays readable.
- `Background` layers, back to front: sky gradient and a smiling sun, drifting clouds (0.12 parallax), hills (0.28), big grass and dandelions (0.55), then the near layer at 1.0 with back props (ant hill, sundial, mushroom ring, signpost), soil with pebbles and roots, the stump, moss, and tufts. A foreground of dark grass blades sits in front of entities at 1.22. Background art has thinner, fainter outlines than grabbable things.
- `Particles` draws every particle into one `Graphics` per frame, with a 400-particle budget. Fling trails use a second instance behind the entities.
- The static backdrop layers are baked once into 1024 px wide textures (`Background.bakeAll`), so a frame draws a few sprites instead of thousands of shapes.
- When WebGL runs in software (SwiftShader or llvmpipe, as on CI under xvfb), `main.ts` renders at half resolution. Software GL is fill-rate bound and otherwise runs at a few frames per second.
- Props use the shared 6 px outline from `palette.ts`.
- Reduce motion (a setting): `WorldView.reduceMotion` makes `shakeOffset` (in `juice.ts`, pure) always return 0, cuts squash kicks to 40 percent (`SquashSpring.amount`), and halves particles (`Particles.density`; fling trails are kept). The camera's coasting friction doubles and pan coasting speed halves.
- Water. `WaterView` (`render/water.ts`) draws the pond in two layers. The back layer, behind entities, has the deep gradient, sun shafts, caustics, pond weed, the sunken teacup and boot, tadpoles that flee splashes, frog eyes that blink, lily pads with a bloom, ice sheets, the hose tap's wheel, and a dragonfly. The front layer, over entities, is a clear tint over whatever is under the surface, a pale band, the surface line, ripples, glints, and the hose spray. The surface wobbles with a spring-column `WaveSurface` plus a gentle swell. Splashes, paddlers, Skeet, and the spray disturb it, and heights cap at 22 px so it never tears. Floating things ride the ripples (`WaterView.bob`) in the renderer only.
- The pond's static art lives in `pondArt.ts`: the sandy basin, muddy rims, reeds, cattails, boulders, the sitting stone and mud bank, the coiled hose, and a far glimpse of the pond in the mid layer. The front grass leaves a gap so it never hides the pond. The plaza's props are drawn relative to the plaza's `xStart`.
- Tag looks. `tagLook(tags, submerged)` in `tagLooks.ts` is the pure table. `WorldView.tagEffects` draws it: wet tints darker and drips (faster for sponges, not in water) with beads on top, hot glows and shimmers, frozen sits in an ice block, cold sparkles with frost, smelly gives off stink lines and green puffs, soapy foams, sticky shines, and fuzzy grows spiky hair. Goo blobs mark welds, and red and blue field lines show a magnet pulling. `SoapBubbles` floats bubbles that pop on anything they touch.

### Menu, pause, and the first scene

Section 17 of the design doc. All of it is wordless and drawn in code.

- The main menu (`MenuScene`) runs its own little `Sim` of the plaza behind everything, under a multiply-blended sunset wash. The live plaza is built 0.25 s after the menu opens and fades in, so its background baking stays off the path from launch to the first click. The logo (`logo.ts`) is letters made of twig strokes with leaves, and snail shells for the o's; they drop in one by one and bob, and hop when clicked. Three wooden signs on posts stand for the slots (`SlotSign`). An empty slot shows a sprout in a pot with a plus leaf. A used one shows the world's picture from its last save, a gold badge with the face of the bug the player fed most (`slotPicture`, from `world.counters.fed`), a jar filled by the share of bugs fed, and a face per bug. Click a sign to play. Drag a used sign into the compost bin to delete the slot: the lid closes over 1.5 s (`binProgress`), and pulling the sign out before it shuts cancels. The gear opens the settings board; the door quits.
- The pause button (a leaf, top left) and Escape open `SettingsPanel`: a plank board with vine sliders for music, sounds, and voices, toggles for fullscreen, reduce motion, and edge scroll, the stump sign (save and go to the menu), and the play triangle (resume). A click on the dim behind it resumes. The home button (a stump, bottom right) shows only away from the plaza and glides the camera home in 1 s.
- Scene switches fade through a curtain.
- The first two minutes (`app/intro.ts`, pure, driven by `Game.runIntro`). A new world sends `stage_intro` (Dot asleep on the bottle cap, peckish, a berry beside her), fades in while the camera slides from the pond side to settle on Dot (3 s), sends `wake` when the cursor comes within 3 m of her, sends `beckon` at 0:40 if no bug has been grabbed (she walks to the hand with a spring in her bubble), and drifts the camera toward the pond and back at 1:00 if the player has not panned. It is off in test mode unless a test calls `__bb.enableIntro(true)`, so older tests keep their awake Dot and still camera.
- Settings live in `SettingsService` in the renderer and `SettingsStore` (`settings.json`) in main. Changes apply at once: bus volumes (`AudioBackend.setVolumes`; a bus at 0 plays nothing), reduce motion, and edge scroll. Slider drags apply live and are stored when the drag ends. Main applies fullscreen. Defaults follow the doc (fullscreen on); in test mode main starts windowed. The music slider is stored and sets the music bus, which M9's generative music will play through.

### Camera

`Camera` is pure math and has unit tests. `x` is the world x at the left edge of the view, clamped to the world. Dragging empty space pans the camera, and it coasts after release. The mouse wheel pans too, 1.5 px per vertical wheel pixel. While the player carries something within 80 px of a screen edge, the camera scrolls at up to 9 m/s, which is how things will move between areas.

### Frame loop

Pixi's ticker calls `Game.frame(dt)`, with `dt` clamped to 0.1 s:

1. `PointerController.frame()` edge-scrolls and sends the latest `drag` target.
2. `FixedStepper.advance(dt)` runs zero or more `sim.step()` calls, at most 5 per frame.
3. The camera coasts, then `WorldView.update()` draws.

On `visibilitychange` to hidden, `Game.setPaused(true)` stops stepping, resets the accumulator, and autosaves. A minimized or hidden window uses no sim CPU.

Pause (the board, Escape, a hidden window, or the test hook's freeze) stops stepping and saves; `Game.paused` combines the reasons.

The renderer does not interpolate between sim steps yet. At 60 Hz that does not matter. On 120 Hz and faster displays, motion will judder slightly. `FixedStepper.alpha` is available when we fix it.

## Audio

`AudioBackend` has three methods: `play(tone)`, `resume()`, and `setMuted()`. A `Tone` is an oscillator or band-passed noise with a pitch or filter glide, and optionally two vowel formant filters and vibrato. `WebAudioBackend` builds one small node graph per tone and routes it to an sfx or voice bus, then a master gain and a limiter (ratio 12, threshold -6 dB). `NullAudioBackend` records tones instead of playing them, and unit tests use it.

`Sfx` maps events to named sounds with random pitch and volume jitter and rate-limits impacts. `Game` hands it a material lookup and item tags when a world opens. Input gestures that are not sim events (hover, fast drags, pans, scrolls, edge scrolls) come from `PointerController.onGesture`. `voices.ts` builds gibberish lines from each bug's `voice` profile: 1 to 6 formant syllables whose pitch contour depends on the emotion (happy rises, sleepy falls, yuck sours downward, love swoops up, giggles bounce between two notes). `moodVoice` then shifts pitch, pace, and glide by mood: grumpy is lower and slower, happy higher and quicker. Lines are seeded from the bug ID and a line counter. At most three bugs talk at once. Generative music will be another module on the same backend.

## Saves

- There are three slots. Main stores slot N at `userData/saves/slot-N.json`. Writes are atomic (`writeAtomic`: a `.tmp` file, flushed with fsync, then renamed), so a crash never leaves half a save. Before each write the current save, if it parses, is copied (atomically) to `slot-N.bak.json`. That keeps one previous version, and a corrupt file never pushes out a good backup. On startup main deletes leftover `.tmp` files. Deleting a slot removes all its files.
- If a save will not load (bad JSON, or it fails migration or validation), `SaveService.loadWithRecovery` asks main to `recover` the slot: the bad file is kept as `slot-N.corrupt.json` and the backup is put back in its place. With no backup the slot is empty. The menu's slot list recovers the same way.
- A `SaveFile` is `{ version, savedAt, world: WorldSave, view: { cameraX }, meta: { createdAt, thumb } }`. `WorldSave` holds the seed, tick, RNG state, next entity ID, every entity with its body state and component data, the pond and weather (`env`), affinity (`social`), the pocket, and `counters` (times the player fed each bug, for the badge). A held item is saved as if it had been dropped. `meta.thumb` is a 320x180 JPEG of the camera view as a data URL. `captureThumb` renders the world view alone, without the hand or UI.
- `loadSaveFile(raw)` parses the JSON, refuses versions newer than the game, runs migrations one version at a time, then validates the structure. Any failure throws `SaveError`.
- To change the format, bump `SAVE_VERSION` and add `MIGRATIONS[oldVersion]`. Never edit a migration that has shipped. `tests/unit/fixtures/save-v1.json` to `save-v5.json` are real saves written by the game at each shipped version, generated from the commits that shipped them; `m5.test.ts` loads every one, plays it, and saves it again. Add a fixture for each new version. Prettier skips the fixtures so they stay byte for byte.
- The format is at version 6. Version 6 adds `world.pocket`, `world.counters`, and the file's `meta` (its `createdAt` taken from the old `savedAt`, and no picture until the next save), and turns any bug marked `st_pocketed` (no pocket existed) into a falling one.
- Version 5 adds the social and cleanliness needs and each bug's `carrying`, `social`, `memory`, `inspected`, sleep and poke bookkeeping, `plan` (off-screen), and a few timers; `world.social.affinity`; and `env.slime`. Starting bugs a save predates (Boing) join it on load.
- Version 4 moves every saved x (bodies, bug targets, the camera) 32 m right for the pond, adds bug `smelledAt` and `hopAt`, and adds optional entity `tags` and `soak` and `world.env` (water rise, hose, ice, welds, pads, weather). Version 2 was M1's bug brains. Version 3 adds `mouthful`, `reaction`, `variants`, `grumpyUntil`, `burpAt`, `tickle`, and `woozyUntil` to each bug. Its migration stops a bug that was mid-meal under the old rules, because M1 bugs ate food where it lay.
- `Sim.load` skips entities whose definitions no longer exist, and drops them from the pocket. Removing content never bricks a save.
- The game autosaves every 30 seconds of play, when the camera moves into another area (at most every 3 s), when pause opens, when the player goes to the menu, when the window hides, and before quitting. On quit, main sends `app:flush-request`, waits up to 2 seconds for `app:flush-done`, then closes.
- Settings are per machine, in `userData/settings.json`, never in a slot.

## Test mode and the `window.__bb` hook

Launching with `BUGGLEBROOK_TEST=1` does three things:

- Main passes `--bb-test` to the preload, which sets `bugglebrook.testMode`, and the renderer installs `window.__bb`.
- Auto-update stays off.
- The single-instance lock is skipped, so tests can run apps back to back.

Setting `BUGGLEBROOK_USER_DATA=/some/dir` points userData at a throwaway directory, so tests never touch real saves.

`window.__bb` (type `TestHook` in `src/renderer/src/debug/testHook.ts`) offers:

- state queries: `affinity(a, b)`, `water()` (surfaces, hose, ice, pads, welds), `fixture(id)`, `areaAsleep(id)`, `areaAt(x)`, `soapBubbles()`, `scene()`, `tick()`, `entities()` (with `tags`, `submerged`, `soggy`, `asleep`), `entity(id)`, `camera()`, `isPaused()`, `sfxLog()`, `voiceLog()`, `events()` (recent sim events with their tick), `lastRelease()` (the fling velocity sent), `frameTimes(n)` (update plus render ms), `renderStats()`, `listSlots()`, `cursor()` (pose, and the frames of the last pose change and pointer move), `bubbles()`, `glowing()`, `mouthOf(id)`, `dropTarget(itemId)`
- M5 state: `pocket()`, `pocketOpen()`, `binProgress()`, `panelOpen()`, `settings()`, `shakeOffset()`, `shakeStats()` and `resetShakeStats()` (shakes asked for and the biggest offset drawn), `menuSettled()`, `reduceMotion()`, `slotPictures()`, `recoveries()`, `intro()`
- coordinate helpers for driving the real mouse: `worldToClient(x, y)`, `slotButtonClient(slot)`, `homeButtonClient()`, `uiClient(name)` (pause, home, resume, to_menu, gear, door, bin, `toggle_*`), `sliderClient(key, value)`, `pocketSlotClient(i)`
- control: `send(command)`, `step(n)`, `frames(n)` (n frames of input and sim at 60 Hz, right now), `setPaused()` (a freeze without the pause board), `enableIntro(on)`, `saveNow()`, `clearLogs()`

E2E tests move the real mouse with `page.mouse`, then assert on game state through the hook. They never compare pixels.

## Testing

- `pnpm test` runs Vitest in Node. It covers the sim (RNG, stepper, event bus, entities, terrain, physics grab and fling, 1000 full-speed flings with no tunneling, springs, pokes, respawn, bug AI and needs, eating, bouncing, dizzy timing, determinism), saves (round trip, migrations, validation, SaveStore on a temp dir), content validation, and the pure renderer modules (camera, viewport fit, bug pose and face, squash springs, pointer velocity and pokes, sfx and voices with the null backend).
- `tests/e2e/m1.spec.ts` checks the M1 acceptance criteria with the real mouse: launch time and frame time, hold and fling velocity, dizzy duration, pokes, and camera moves that leave items alone.
- `tests/e2e/m2.spec.ts` checks M2: a berry dropped within 50 px of a mouth is eaten and one dropped farther away falls; disliked food is spat out and stays; three pokes never repeat a variant back to back; every verb makes a sound; hovering switches the hand to `hover_grab` within a frame; tickling ends in a wriggle; Glorp never gets dizzy. `tests/e2e/app.ts` has helpers for staging these: `content()` fills a bug's needs so it stays put, `spawnItem()` drops an item on a clear flat spot, and `holdNearMouth()` holds an item at an offset from a mouth.
- `tests/unit/feeding.test.ts` and `tests/unit/reactions.test.ts` cover the M2 sim (drop targets, eating, spitting, burps, catches, saves mid-chew, variants, moods, tickles, shakes, Glorp) and the pure renderer modules (the reaction table, faces, moves, thoughts, bubbles, the cursor, shake detection, voices by mood, and sounds by material).
- `tests/unit/water.test.ts` and `tests/unit/properties.test.ts` cover M3's sim: buoyancy for every item, splashes, skips, the current, soggy paper, the hose, lily pads, Skeet, swimming, area sleep, each property rule, eating effects, saves, and the version 3 migration. `tests/unit/pondView.test.ts` covers the tag looks, the wave surface, swim faces, fixture clicks, and water sounds. `tests/e2e/m3.spec.ts` covers the M3 acceptance criteria with the real mouse: carrying something across the screen edge into the pond with its tags, floating and sinking, steam, the hose tap, a bug swimming out and shaking dry, gum sticking and tearing, and the pond sleeping. Pick drop spots on open water with its `openWater()`, because floaters drift and Skeet roams.
- `tests/unit/social.test.ts` covers playing together (chat, tag, catch, share, snatch, comfort, gawk, hide, ride), sleep and nap piles, and each signature behavior. `tests/unit/m4.test.ts` covers the needs, memory and scoring, the setup rule and its acceptance tests (10 minutes with player setups, a stack of three for 10 minutes, the 20-trial sniff test), off-screen simulation, the teacup, save version 5, and a 30-minute seeded soak (no NaN, needs in range, no bug stuck in one state for 3 minutes, the stack untouched). `tests/e2e/m4.spec.ts` checks with the real mouse that a dropped berry gets sniffed and not eaten, that a stack stays standing, that needs hold while paused, that a click wakes a napper, that lonely bugs chat in bubbles, and that the pond's bugs are fine when it wakes.
- `tests/unit/m5.test.ts` covers the pocket (stacks, swaps, frozen bugs and timers, saves, taking things out in another area), the setup rule with pocketed things, a full save round trip, three independent slots, every shipped save version, `SaveStore` backups, an aborted write, corrupt-file recovery, settings, reduce motion, the menu and pocket layout, the compost bin, slot badges, and the first scene. `tests/e2e/m5.spec.ts` checks with the real mouse that a slot saved with its picture comes back after quitting by the door and relaunching; that a corrupt save comes back from its backup; that dragging a sign into the bin deletes it and pulling it out keeps it; that the pause board freezes the world and settings survive a restart outside the slot files; that reduce motion keeps the shake offset at 0; that the pocket carries a sponge from the pond to the plaza; and that the first scene's Dot wakes when the hand comes near.
- Tests that need exact timing drive the sim with `__bb.setPaused(true)` and `__bb.frames(n)` instead of waiting on the clock. The M3 gum test does this, because on CI's software renderer its pebble was still rolling when the gum landed.
- `pnpm shots` builds and runs `tests/shots/`, which walks through the game and writes screenshots to `/tmp/bb-shots` (or `$BB_SHOTS_DIR`). The first tour covers M1. The third (files `40-` to `55-`) visits the pond: Skeet, a splash, floaters, the hose, swimmers, shaking dry, ice, tag looks on items and bugs, gum, and soap bubbles. The M5 tour (files `90-` to `99g-`) covers the menu, the settings board, the first scene, pause, the pocket, a slot with its picture, and the compost bin. The idle watch (files `60-` to `87-`, and `idle-log.txt`) leaves the plaza alone for five simulated minutes and follows the bugs. The second (files `20-` to `37-`) feeds Rollo and Dot, catches the yum, yuck, hate, and love faces, the flame puff, burp, sneeze, a tickle, a thought bubble, and Glorp's shell spin. Use it to check art changes by eye. It is not part of CI.
- The frame-time check always requires update time under 16.7 ms (mean and 95th percentile over 600 frames). It checks update plus render time only on a hardware GPU, since software GL rasterizes on the CPU.
- `BB_ELECTRON_ARGS` passes extra Chromium switches to the E2E launcher. `BB_ELECTRON_ARGS="--use-angle=swiftshader --use-gl=angle"` approximates CI's software renderer locally, though launches with it are flaky on Wayland.
- `pnpm test:e2e` builds the app, then runs Playwright against `out/`. Each test launches a fresh app with its own userData. Locally it opens real windows in your desktop session. CI runs it under `xvfb-run`. The launcher removes `ELECTRON_RUN_AS_NODE` from the environment, because some editors built on Electron set it and it turns Electron into plain Node.
- Every feature needs tests. Put logic in pure modules and test it in Vitest. Write at least one E2E test for each player-facing flow.

## Packaging, CI, and releases

- `electron-builder.yml` defines the targets: Windows NSIS x64, macOS dmg and zip for x64 and arm64 (zip is what the Mac auto-updater downloads), and Linux AppImage and deb for x64. Mac builds are unsigned (`identity: null`), and so are Windows builds.
- `.github/workflows/ci.yml` runs on every push to `main` and on every PR. The `check` job runs typecheck, lint, unit tests, and E2E under xvfb. The `build` matrix runs on native Ubuntu, Windows, and macOS runners, builds the installers, and uploads them as workflow artifacts.
- `.github/workflows/release.yml` runs when a `v*` tag is pushed. It fails if the tag does not match `package.json`, creates a draft release if none exists, and refuses to continue if the release is already published. Each platform then runs `electron-builder --publish always`, which uploads installers and the `latest*.yml` update metadata to the draft. `releaseType: draft` in the builder config keeps it a draft. A person publishes it by hand.
- electron-updater ignores drafts, so players only get an update after someone publishes the release. The updater runs only in packaged builds, and never when `BUGGLEBROOK_TEST=1` or `BUGGLEBROOK_NO_UPDATES=1` is set.

To cut a release, bump `version` in `package.json`, commit, tag `vX.Y.Z`, and push the tag. Then review the draft on GitHub and publish it.

## Conventions

- IDs for content, events, and commands use snake_case. Files use camelCase. Classes use PascalCase.
- Sim-side events are past tense (`item_dropped`). Commands are imperative (`grab`).
- Keep sim data plain JSON-compatible objects: no classes, Maps, or functions inside entities or saves.
- Every sim change goes through `sim.send()` or a system inside `step()`. The renderer only reads.
- Randomness in the sim comes from `sim.rng`. Cosmetic randomness in the renderer may use `Math.random`.
- Game text is nearly wordless. UI uses pictures. Labels in data (`name`) are for the journal and debugging.
- Prettier formats the code with single quotes, a width of 110, and trailing commas. It does not format `docs/`, because several people edit those files.
