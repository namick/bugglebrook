# Agent instructions for Bugglebrook

Read `docs/00-decisions.md` (locked product decisions) and `docs/04-architecture.md` (how the code works) before you change anything.

## Architecture rules

- `src/game/` is the simulation core. It is pure TypeScript and deterministic. It must not import Pixi, Electron, Node modules, or anything in `src/renderer`, `src/main`, or `src/preload`. It must not use `Math.random`, `Date`, `performance.now`, timers, `window`, or `document`. ESLint and `tsconfig.game.json` enforce this. Don't loosen those rules.
- Randomness in the sim comes from `sim.rng`. Time is `sim.tick`. The sim changes only inside `sim.step()`, through commands (`sim.send`) and systems.
- The renderer (`src/renderer/`) reads sim state and draws it. It never mutates the sim directly; input becomes commands.
- Game events go on `sim.events` (typed in `src/game/events.ts`, snake_case, past tense). Audio, particles, and future features like the journal subscribe to them. Handlers must not change sim state.
- Content lives in typed registries in `src/game/data/*.ts`, keyed by snake_case IDs. Never rename an ID that a save could reference. Add a check to `validateContent` for every new kind of cross-reference.
- Save format changes need a `SAVE_VERSION` bump and a new entry in `MIGRATIONS`, plus a test. Never edit a shipped migration.
- The renderer is sandboxed. It reaches main only through `window.bugglebrook` (`src/shared/ipc.ts`). Keep that API narrow and validate every IPC argument in main.
- All art is drawn in code with Pixi `Graphics` using the shared outline from `render/palette.ts`. All sound is synthesized. Don't add image or audio files.
- Put logic in pure modules (like `camera.ts`, `bugPose.ts`, `bugFace.ts`, `juice.ts`, `bugAi.ts`) so Vitest can test it without Pixi.
- Bug states use the design doc's names (`st_idle`, `st_dizzy`, ...). Content IDs use its prefixes (`area_`, `bug_`, `item_`).

## Commands

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

- `pnpm test` runs Vitest (`tests/unit/`).
- `pnpm test:e2e` builds, then runs Playwright against the real Electron app (`tests/e2e/`). It needs a display. Use `xvfb-run -a pnpm test:e2e` when there is none.
- `pnpm format` runs Prettier and ESLint with `--fix`.
- `pnpm shots` saves a screenshot tour to `/tmp/bb-shots`. Look at the PNGs after any art change.
- Some shells set `ELECTRON_RUN_AS_NODE=1`. The E2E launcher clears it, but unset it yourself before running Electron any other way.

## Rules

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
