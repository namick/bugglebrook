# Agent instructions for Bugglebrook

Read `docs/00-decisions.md` (locked product decisions) and `docs/04-architecture.md` (how the code works) before you change anything.

## Architecture rules

- `src/game/` is the simulation core. It is pure TypeScript and deterministic. It must not import Pixi, Electron, Node modules, or anything in `src/renderer`, `src/main`, or `src/preload`. It must not use `Math.random`, `Date`, `performance.now`, timers, `window`, or `document`. ESLint and `tsconfig.game.json` enforce this. Don't loosen those rules.
- Randomness in the sim comes from `sim.rng` (the weather has its own stream in `SkyState`, so it never shifts the bugs' dice). Time is `sim.tick`; the time of day is `sim.weather.clock` (60 clock ticks to a game minute, one per sim tick). The sim changes only inside `sim.step()`, through commands (`sim.send`) and systems.
- The renderer (`src/renderer/`) reads sim state and draws it. It never mutates the sim directly; input becomes commands.
- Game events go on `sim.events` (typed in `src/game/events.ts`, snake_case, past tense). Audio, particles, and future features like the journal subscribe to them. Handlers must not change sim state.
- Content lives in typed registries in `src/game/data/*.ts`, keyed by snake_case IDs. Never rename an ID that a save could reference. Add a check to `validateContent` for every new kind of cross-reference.
- Save format changes need a `SAVE_VERSION` bump and a new entry in `MIGRATIONS`, plus a test. Never edit a shipped migration. When a version ships, add a real save it wrote as `tests/unit/fixtures/save-vN.json` (`m5.test.ts` loads every fixture). Never hand-edit fixtures.
- Saves go through `SaveStore` in main: atomic writes, one backup (`slot-N.bak.json`), and `recover` for a save that will not load. Settings live in `settings.json` via `SettingsStore`, never in a slot.
- The renderer is sandboxed. It reaches main only through `window.bugglebrook` (`src/shared/ipc.ts`). Keep that API narrow and validate every IPC argument in main.
- All art is drawn in code with Pixi `Graphics` using the shared outline from `render/palette.ts`. All sound is synthesized. Don't add image or audio files.
- Put logic in pure modules (like `camera.ts`, `bugPose.ts`, `bugFace.ts`, `juice.ts`, `reactions.ts`, `thoughts.ts`, `bugAi.ts`, `bugMove.ts`, `bugSocial.ts`, `needs.ts`, `dropTargets.ts`, `tags.ts`, `water.ts`, `tagLooks.ts`, `waveSurface.ts`, `sky.ts`, `skyLook.ts`) so Vitest can test it without Pixi.
- The bug AI never reaches into the sim. It reads a `BugContext` and its `world` (`BugWorld` in `systems/bugTypes.ts`), changes brains, and returns a `BugDecision`. Social play is run by the bug that started it (`lead`), which may change its partner's brain and speaks for it with `by` in its notices.
- Pocketed things are out of the world: `sim.isSleeping(id)` is true for them (use `isPocketed` to tell them from sleeping areas). New systems that loop over entities must skip `isSleeping` ones, or pocketed things will act from where they were picked up. Anything with absolute-tick timers must be shifted on the way out (`shiftTags`, `shiftBrain`).
- The setup rule is a hard rule: bugs never eat, carry, pack, or shove anything with `tag_player_setup` (or anything touching it). New AI that moves bugs or items must keep it: check `world.setupNear`, `setupBetween`, and `clearLanding` before walking, hopping, or throwing. `tests/unit/m4.test.ts` has the 10-minute and 30-minute checks.
- The sim picks reactions and their variants (`bug_reacted`); `render/reactions.ts` says how each variant looks and sounds. Add a reaction type in `events.ts` and give every bug three variants in the table. A test checks both.
- New foods and toys are item defs with `adverts`. When a food goes in, update each bug's `loves`, `likes`, and `dislikes` and keep a loved, liked, neutral, and disliked food for every bug in the plaza (a test checks this).
- Tags go through `sim.addTag`, `sim.removeTag`, and `sim.hasTag`, never by editing `entity.tags` directly: they emit events and update friction. A new tag goes in `TAG_IDS` (`systems/tags.ts`). Property rules live in `systems/environment.ts`; give each rule a unit test and a look in `render/tagLooks.ts` so players can see it.
- A new bug needs a `BugDef` with `traits` and `habits`, an entry in every personal table in `render/reactions.ts` (the table test covers all arts), art in `draw/bug.ts` (body, legs, antennae, face, rim, tint), and affinity entries in `data/affinity.ts` if it has friends. Starting bugs that a save predates are added on load.
- The world strip is six areas: flowerbed (0 to 32 m), pond (32 to 64), plaza (64 to 102.4), porch (102.4 to 134.4), compost lab (134.4 to 163.2), treehouse (163.2 to 195.2). Area data uses area-local x. Tests use `PLAZA_X` and `POND_X` from `tests/unit/world.ts` or `tests/e2e/app.ts`, never literal world x.
- Four areas start locked behind a barrier fixture (`opens`, `wall`) run by `systems/barriers.ts`. A locked area's wall stops everything, and the camera may look 4 m past it. Bug AI reads `ctx.reach` for the open stretch; new movement code must clamp to it. Use the `unlock` command in tests to open areas without solving the barrier.
- Hidden bugs that wait in the world (`brain.pending`: Moose stuck, Barty aloof, Twig disguised) belong to nobody yet: `bugWorld().bugs()`, drop targets, and the off-screen model skip them. New systems that pick bugs to interact with must skip them too. Bugs join through `sim.cast` (`find`, `join`), which logs their `foundBy` secret.
- The new areas' fixtures live in `systems/places.ts` (saved as `world.places`, with its own dice). A new fixture kind goes in `FixtureKind`, `CLICKABLE` in `environment.ts` if a click works it, `Places.poke`/`update`, and a live view in `render/areaArt/`.
- Areas added later are built on load: `world.built` lists the areas whose start lists are in the world, and `Sim.load` populates the rest.
- Day, night, and weather live in `systems/sky.ts` (pure) and `systems/weather.ts`. New AI that reacts to them reads `ctx.sky` (`BugSky`). A new bug needs `active` (`day` or `night`) and `rain` in its def. Time-of-day secrets go through `sim.findSecret`, with an entry in `data/secrets.ts`.
- The renderer grades the scene by tinting layers with `skyLook` (no dark overlay). Anything that should glow at night goes in `WeatherView`'s additive light layer, outside the graded container. Keep weather particles within the budgets in `weatherView.ts`.
- Bug states use the design doc's names (`st_idle`, `st_dizzy`, ...). Content IDs use its prefixes (`area_`, `bug_`, `item_`).

## Commands

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

- `pnpm test` runs Vitest (`tests/unit/`).
- `pnpm test:e2e` builds, then runs Playwright against the real Electron app (`tests/e2e/`). It needs a display. Use `xvfb-run -a pnpm test:e2e` when there is none.
- `pnpm format` runs Prettier and ESLint with `--fix`.
- `pnpm shots` saves a screenshot tour to `/tmp/bb-shots`. Look at the PNGs after any art change. Faces are small at 1080p, so zoom in (`magick in.png -crop WxH+X+Y -scale 400% out.png`) before judging an expression. Move the hand out of the way before a close-up; it draws over whatever it hovers.
- E2E tests that stage bugs should call `content()` from `tests/e2e/app.ts` first, or bugs walk off to eat the food you spawn. Dot and Rollo start close together, so use Glorp (alone on the stump) when only one mouth may be in range. Content bugs still come to sniff anything the player just dropped (that is an M4 acceptance rule), and Dot starts on the plaza's bottle cap.
- For long stretches of bug life in E2E tests, fast-forward with `__bb.step(n)` rather than waiting. When a test depends on timing (a yank, a fall, a weld, a staged scene), freeze the clock with `freeze(page, true)` and drive it with `frames(page, n)`, which runs input and sim for n frames at 60 Hz regardless of the screen. `pressFrozen`, `glideFrames`, `framesUntil`, `spawnFrozen`, and `lookAt` (wheel the camera there and wait for it to settle, without unfreezing) in `tests/e2e/app.ts` help. While frozen, pointer events are timed on the frame clock, so fling speed and poke timing follow `frames`, not the machine's speed. The camera still moves on the screen's clock, so poll it rather than stepping frames. The M1, M3, M4, and M6 tests work this way so they stay steady on CI's software renderer. Set the time of day with `set_time {hour}` and the weather with `set_weather` (it takes a `weather` ID too); new worlds start at 09:00 in clear weather, and the first natural change is at least 6 minutes away.
- UI controls are found with `__bb.uiClient(name)` (and `sliderClient`, `pocketSlotClient`, `slotButtonClient`); `clickUi` in `tests/e2e/app.ts` waits for a board to stop bouncing before it clicks. Mark new UI containers with `markUi` so the hand shows its pointing pose, and stop `pointerdown` from reaching the stage.
- The first scene (Dot asleep, the camera slide) is off in test mode. Call `__bb.enableIntro(true)` before opening a slot to test it. Tests run windowed; players default to fullscreen. The event log keeps only the last 400 events, so check it as you go.
- In the pond, floaters drift with the current and Skeet roams the surface, so a fixed drop spot can land on the raft or on him. Pick one at run time (`openWater()` in `tests/e2e/m3.spec.ts`), and keep carried things well inside the screen or the camera edge-scrolls. The camera starts in the plaza; wheel it left (`scrollTo`) to reach the pond.
- `pnpm shots` has a pond tour (files `40-` to `55-`). It spawns extra bugs and sets tags with `set_tag` to show every look.
- `pnpm shots -g "areas"` runs the M7 tour (`tests/shots/areas.spec.ts`, files `130-` to `179-`): the locked previews, then every area at day, dusk, and night, and in rain. `tests/shots/items.spec.ts` and `tests/shots/bugs.spec.ts` line up the M7 items and bugs (files `items-*` and `bugs-*`).
- `pnpm shots -g "day, night"` runs only the M6 tour (files `100-` to `120-`): dawn, noon, sunset, night, the pond at night, Flick, rain, a rainbow, wind, cloud, a shooting star, the sundial, and the vane.
- `pnpm shots -g "menu, pause"` runs only the M5 tour (files `90-` to `99g-`): the menu, settings, the first scene, pause, the pocket, and the compost bin. Screenshots come out at the window's device pixels, so they are larger than 1920x1080 on a HiDPI desktop.
- `pnpm shots -g "idle watch"` runs only the idle watch (files `60-` to `87-`): five simulated minutes of the plaza left alone, with `idle-log.txt` listing what the bugs did. Read the log next to the frames when tuning the AI.
- Outside CI, `launchApp` sets the window to 1280x720 (what CI's virtual screen gives it), since a tiling window manager may stretch it. Other agents running E2E or shots on the same desktop at the same time will break each other's runs; wait for them. Set `BB_SHOTS_DIR` to keep your screenshots apart.
- Some shells set `ELECTRON_RUN_AS_NODE=1`. The E2E launcher clears it, but unset it yourself before running Electron any other way.

## Rules

- CI runs typecheck, lint, and unit tests in one job and E2E as a four-way Playwright shard (`--shard=n/4`, tests split one by one since `fullyParallel` is on). Each E2E test launches its own app, so tests must not depend on each other.
- All four commands above must pass before every commit. Don't commit with failing or skipped tests.
- Every feature and every bug fix comes with tests. Sim behavior gets Vitest tests. Anything a player does gets at least one E2E test that uses the real mouse and asserts through `window.__bb`, not pixels. If the hook lacks a query you need, add it to `src/renderer/src/debug/testHook.ts`.
- Keep commits small and logical. Write messages in the imperative, plainly ("Add seesaw toy", not "Added awesome seesaw!").
- CI must stay green on all three platforms. Release workflows create draft releases only. Never publish a release or change `releaseType`.
- Don't edit `docs/00-decisions.md`.

## Conventions

- snake_case for content IDs, event names, and command types. camelCase file names. PascalCase classes.
- Sim data (entities, saves) is plain JSON-compatible objects: no classes, Maps, or functions.
- Units are meters with y pointing down. Convert to pixels only in the renderer (`PIXELS_PER_METER`).
- Prettier: single quotes, width 110, trailing commas. `docs/` is not auto-formatted.
