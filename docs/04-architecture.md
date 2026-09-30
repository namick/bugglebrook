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
src/main/updater.ts                                                     src/game/** (bundled in)
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer has no `require` or `process`, and an E2E test asserts that.
- The preload exposes exactly four keys on `window.bugglebrook`: `saves`, `testMode`, `platform`, and `onFlushRequest`. The type is `BugglebrookApi` in `src/shared/ipc.ts`.
- Main validates every IPC argument. Slots must be integers 0 to 2. Save payloads must be strings under 5 MB that parse as JSON. Main does not understand the save format; it stores opaque text.
- The window denies popups and blocks navigation. `index.html` sets a Content Security Policy with no `unsafe-eval`. Pixi normally compiles shaders with `new Function`, so the renderer imports `pixi.js/unsafe-eval`, which swaps in a polyfill that does not need eval.
- Main appends `enable-unsafe-swiftshader` so WebGL still works on machines without a usable GPU, such as VMs and CI under xvfb. This is acceptable because the app only loads its own bundled files.

## Module layout

```
src/
  game/                 Simulation core. Pure TypeScript. No DOM, Node, Pixi, or Electron.
    core/               rng.ts, loop.ts (FixedStepper), events.ts (EventBus),
                        commandQueue.ts, entities.ts (EntityStore)
    physics/physics.ts  The only planck import. Bodies are addressed by entity ID.
    systems/            Per-tick behavior. bugAi.ts is the bug state machine.
    data/               Content registries: areas, bugs, items, recipes, potions, secrets.
                        types.ts, registry.ts, and validateContent() in index.ts.
    save/               schema.ts (SAVE_VERSION, types), migrations.ts, validate.ts
    commands.ts         The Command union: grab, drag, release, spawn
    events.ts           GameEvents: every event name and payload
    constants.ts        Units, gravity, logical resolution
    sim.ts              The Sim class that ties it together
    index.ts            Public exports for the renderer
  shared/ipc.ts         IPC channel names, BugglebrookApi, SlotInfo. Types and constants only.
  main/                 Electron main: window, IPC handlers, SaveStore, auto-updater
  preload/              contextBridge API
  renderer/
    index.html          CSP and the canvas host
    src/
      main.ts           Boot: Pixi app, letterboxing, Game, test hook
      app/              game.ts (scene switching, loop, autosave), saveService.ts, memorySaves.ts
      render/           camera.ts, viewport.ts, bugPose.ts (pure), background.ts,
                        worldView.ts, particles.ts, palette.ts, draw/bug.ts, draw/item.ts
      input/            pointerController.ts: pointer gestures to commands and camera moves
      audio/            synth.ts (AudioBackend, WebAudioBackend, NullAudioBackend), sfx.ts
      ui/               menu.ts (slot cards, home button), button.ts
      debug/testHook.ts window.__bb, only in test mode
tests/
  unit/                 Vitest. Headless. Covers src/game, the pure renderer modules, and SaveStore.
  e2e/                  Playwright against the built app in out/
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
- The ground surface is at `GROUND_Y` = 9 m. Invisible walls sit at x = 0 and at the world's right edge.
- The world is as wide as its areas. Areas tile left to right with no gaps, and `validateContent` checks that. The demo world is 48 m, which is 2.5 screens.
- The logical resolution is 1920x1080, so one screen is 19.2 m wide. `fitViewport` letterboxes that into any window. The renderer resolution tracks the real device pixels, capped at 2x, so outlines stay sharp.

## The simulation

`Sim` owns an `EntityStore`, a `Physics` world, an `Rng`, a `CommandQueue`, and an `EventBus<GameEvents>`. `sim.step()` advances exactly 1/60 s:

1. Drain the command queue and apply each command.
2. Run systems. Today that is bug AI, which reads body state and returns a velocity or a hop.
3. Step physics with 8 velocity and 3 position iterations.
4. Turn new contacts above 6 m/s into `bonked` events. Bugs that land above 9 m/s get dizzy.
5. Increment `tick`.

Determinism rests on four things. The only randomness is the seeded sfc32 `Rng`. Entities iterate in ascending ID order. Time is the tick counter and never the clock. Commands only take effect at step boundaries. A test runs the same scripted commands on two sims and asserts that both serialize to identical saves.

### Entities

An entity is `{ id, kind: 'bug' | 'item', defId, bug?: BugBrain }`. Physics state (position, angle, velocities) lives in the planck body, and `sim.views()` joins the two into plain `EntityView` objects for the renderer and the test hook. Component data stays plain JSON so it serializes without adapters. Add optional fields to `Entity` for new components such as hats, paint, or potion effects, and extend the save schema and validator to match.

### Commands

Input never touches physics directly. `PointerController` sends `grab {x, y}`, `drag {x, y}`, `release`, and `spawn`. On `grab`, the sim picks the topmost body under the point. That is the highest entity ID, and the renderer draws in ID order, so the thing you see on top is the thing you grab. A planck `MouseJoint` then pulls the body toward the pointer. On `release`, the body keeps the joint's velocity, capped at 30 m/s, and that is the whole fling.

### Events

`GameEvents` in `src/game/events.ts` lists every event. Names are snake_case and past tense: `item_grabbed`, `item_dropped`, `bonked`, `bug_dizzy`, `entity_spawned`, `entity_removed`. Handlers run synchronously during `step()`. A throwing handler does not stop the others. Subscribers must not change sim state from a handler. If a reaction needs to change the world, it sends a command.

Current subscribers:

- `Sfx` plays grab, drop, fling, bonk, and dizzy sounds.
- `Particles` makes dust puffs on bonks.
- `WorldView` triggers landing squash on bonked bugs.

The journal, secrets, and music will subscribe the same way.

### Bug AI

`systems/bugAi.ts` is a small state machine with the modes `idle`, `walk`, `held`, `tumble`, and `dizzy`. An idle bug waits a random number of ticks, shorter if its `restless` trait is high, then picks a target up to 5 m away and walks there. Bouncy bugs sometimes hop. A held bug goes limp. A bug flung faster than 3.5 m/s while airborne tumbles until it lands and slows down. A hard landing makes it dizzy for 2 seconds. Bug bodies use `fixedRotation`, so bugs never end up upside down, and the renderer adds tilt and squash for looks.

## Content registries

Each file in `src/game/data/` exports one registry built with `createRegistry(kind, defs)`. IDs are snake_case and never change once a save might reference them. Definitions are plain data. `validateContent()` returns every problem it finds:

- IDs that are malformed or duplicated
- recipe, secret, and unlock references that do not resolve
- two recipes with the same pair of inputs
- areas with gaps or overlaps
- non-positive sizes, densities, speeds, or durations

`tests/unit/data.test.ts` requires the list to be empty. When a new kind of reference appears, add a check there.

The current content is placeholder: two areas, two bugs, four items, one recipe, one potion, and one secret. The cast and world belong to `03-game-design.md`.

## Rendering

The renderer reads the sim and never writes to it.

- `WorldView` keeps one sprite per entity. Each frame it creates sprites for new entities, removes sprites for entities that are gone, and sets position and rotation from `sim.views()`.
- `BugSprite` draws the body, belly, spots, cheek, and smile once. It redraws the legs, antennae, eyes, and dizzy stars each frame from a `BugPose`. Squash and stretch pivot on the feet.
- `bugPose()` is a pure function from mode, velocity, time, and landing squash to scale, tilt, bob, leg phase, and eye openness. It has unit tests. Stretch keeps the volume roughly constant.
- `Background` has four layers: sky and ground at camera speed, clouds at 30%, hills at 60%. It draws each area in its own colors.
- All shapes share one outline color and a 6 px stroke from `palette.ts`.

### Camera

`Camera` is pure math and has unit tests. `x` is the world x at the left edge of the view, clamped to the world. Dragging empty space pans the camera, and it coasts after release. The mouse wheel pans too. While the player carries something within 140 px of a screen edge, the camera scrolls, which is how things move between areas.

### Frame loop

Pixi's ticker calls `Game.frame(dt)`, with `dt` clamped to 0.1 s:

1. `PointerController.frame()` edge-scrolls and sends the latest `drag` target.
2. `FixedStepper.advance(dt)` runs zero or more `sim.step()` calls, at most 5 per frame.
3. The camera coasts, then `WorldView.update()` draws.

On `visibilitychange` to hidden, `Game.setPaused(true)` stops stepping, resets the accumulator, and autosaves. A minimized or hidden window uses no sim CPU.

The renderer does not interpolate between sim steps yet. At 60 Hz that does not matter. On 120 Hz and faster displays, motion will judder slightly. `FixedStepper.alpha` is available when we fix it.

## Audio

`AudioBackend` has three methods: `play(tone)`, `resume()`, and `setMuted()`. `WebAudioBackend` creates one oscillator and one gain envelope per tone, then runs them through a master gain and a compressor. `NullAudioBackend` records tones instead of playing them, and unit tests use it. `Sfx` maps events to named sounds with small pitch jitter and rate-limits bonks. Generative music and bug voices will be new modules on the same backend.

## Saves

- There are three slots. Main stores slot N at `userData/saves/slot-N.json`. It writes to a `.tmp` file and renames it, so a crash never leaves half a save. On startup it deletes leftover `.tmp` files.
- A `SaveFile` is `{ version, savedAt, world: WorldSave, view: { cameraX } }`. `WorldSave` holds the seed, tick, RNG state, next entity ID, and every entity with its body state and component data. A held item is saved as if it had been dropped.
- `loadSaveFile(raw)` parses the JSON, refuses versions newer than the game, runs migrations one version at a time, then validates the structure. Any failure throws `SaveError`. The menu treats an unreadable slot as empty and does not overwrite it until the player picks that slot.
- To change the format, bump `SAVE_VERSION` and add `MIGRATIONS[oldVersion]`. Never edit a migration that has shipped. Tests cover chained migrations and the error cases.
- `Sim.load` skips entities whose definitions no longer exist. Removing content never bricks a save.
- The game autosaves every 20 seconds while in the world. It also saves when the player goes home, when the window hides, and before quitting. On quit, main sends `app:flush-request`, waits up to 2 seconds for `app:flush-done`, then closes.

## Test mode and the `window.__bb` hook

Launching with `BUGGLEBROOK_TEST=1` does three things:

- Main passes `--bb-test` to the preload, which sets `bugglebrook.testMode`, and the renderer installs `window.__bb`.
- Auto-update stays off.
- The single-instance lock is skipped, so tests can run apps back to back.

Setting `BUGGLEBROOK_USER_DATA=/some/dir` points userData at a throwaway directory, so tests never touch real saves.

`window.__bb` (type `TestHook` in `src/renderer/src/debug/testHook.ts`) offers:

- state queries: `scene()`, `tick()`, `entities()`, `entity(id)`, `camera()`, `isPaused()`, `sfxLog()`, `listSlots()`
- coordinate helpers for driving the real mouse: `worldToClient(x, y)`, `slotButtonClient(slot)`, `homeButtonClient()`
- control: `send(command)`, `step(n)`, `setPaused()`, `saveNow()`

E2E tests move the real mouse with `page.mouse`, then assert on game state through the hook. They never compare pixels.

## Testing

- `pnpm test` runs Vitest in Node. It covers the sim (RNG, stepper, event bus, entities, physics grab and fling, stacking, walls, bonks, bug AI, determinism), saves (round trip, migrations, validation, SaveStore on a temp dir), content validation, and the pure renderer modules (camera, viewport fit, bug pose, pointer controller, sfx with the null backend).
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
