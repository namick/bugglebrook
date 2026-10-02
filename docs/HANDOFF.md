# Bugglebrook handoff

Start here when you pick this project up in a new session. This file covers where the project stands, what's in flight, how the work has been run, and what to do next. The detail lives in the docs it links to.

Last updated: 2026-10-02.

## The project in one paragraph

Bugglebrook is a wordless, weird-and-silly physics sandbox about cute bugs and their toys, in the spirit of Toca Boca but deeper: secrets, crafting, potions, music toys, a journal, day/night and weather, photo mode, hats. The audience is about 13 and under, though it's never marketed as a kids' game. It's an Electron + PixiJS + TypeScript app for Windows, macOS, and Linux. The code is in the public GitHub repo `namick/bugglebrook` (local checkout: `~/Projects/tocabocaclone`). The owner's daughter (17, turning 18 soon) is the artist: she will hand-draw the art in Krita, and the long-term plan is for her to sell the game on Steam.

## Read these, in this order

1. `AGENTS.md`: the engineering rules and commands. Every agent must follow it.
2. `docs/00-decisions.md`: locked product decisions. Only the owner changes this file.
3. `docs/04-architecture.md`: how the code works.
4. `docs/03-game-design.md`: the design bible (about 26k words). Grep it; don't read it whole.
5. `docs/reviews/pre-release-review.md`: the current punch list (P-01 to P-35).
6. `docs/reviews/playtest-feedback.md`: real-player feedback (F1 to F5) and its status.

Other docs, as needed:

| Doc | What it is |
|---|---|
| `docs/research/01-toca-boca-essence.md`, `02-what-makes-play-fun.md` | Design research, including the principles and anti-patterns |
| `docs/05-music-brief.md` | Suno track list, prompts, stems, the folder rules, the music importer spec |
| `docs/06-art-guide.md`, `art/START-HERE.md` | The artist's Krita guide and the art pipeline spec |
| `docs/07-steam-market-research.md` | Steam, market, comparables, business setup for the daughter |
| `docs/08-sound-brief.md` | Recorded sound effects plan, sources, and licenses |
| `docs/09-steam-readiness.md` | What a Steam build still needs |
| `RELEASING.md`, `CHANGELOG.md` | How to cut a release; the 1.0.0 notes |
| `docs/reviews/post-m8-review.md` | The earlier review (R01 to R38), mostly fixed |

## Where things stand

All twelve design milestones (M1 to M12 in `docs/03-game-design.md` section 19) have been built except the final pieces of M12. Main is green on CI (latest: run 37018893500 at `7540359`). About 1,400 unit tests and about 100 E2E tests.

On main:
- The full game: 8 areas (2 hidden), all 16 bugs, about 170 items, 32 recipes, 33 potions, 67 secrets (all with triggers) and 4 mysteries, the journal, photo mode, 29 wearables, music toys and the mushroom sequencer, trash can and tidy whistle, day/night/weather, 3 save slots (save version 16).
- The art pipeline: Krita `.ora` templates for every bug, importer, cutout renderer, `pnpm art:watch`, Art Lab, credits board.
- Music: adaptive player built from Suno stems. Two real tracks exist (`main_menu`, `stump_plaza_day`); everything else plays a procedural pad.
- Release engineering: app hardening, updater (off for Steam builds), installers at version 1.0.0 (not tagged), draft-release workflow tested.

## In flight: unmerged branches on GitHub

The last session ended while four agents were mid-task. Their work is pushed to these branches. None of it is on main yet.

| Branch | State | What it holds | What's left |
|---|---|---|---|
| `m12-sfx-perf` (draft PR #7) | 2 commits, CI was green on part A | The recorded sound-effect system (`pnpm sfx:import`, sample player with variation and synth fallback, ambience beds) | Part B, sim performance, was being done on `m12-perf`. Merge that in or land A on its own, then rebase onto main, get CI green, fast-forward main. |
| `m12-perf` | 3 commits ("Settle things at rest...", "Share the sorted entity lists...", "WIP docs"), based on an older main (`4f479ce`) | Sim performance work (R12 / P-08, P-28) | Measure against the target (crowded plaza under 3 ms avg / 8 ms p99 on CI; it regressed to 5.07 / 11.25). Tighten the perf test thresholds (P-28). Merge into `m12-sfx-perf` or land separately. |
| `final-fixes-robustness` | One WIP commit `9f2e2d8`, **untested** | Saves and robustness items P-01, P-02, P-10 to P-13, P-20 to P-22, P-25, P-27, P-29 to P-31, P-33, plus the macOS soak finding (below). New files: `src/main/quitFlow.ts`, `saveVerdict.ts`, `renderer/.../saveTrouble.ts`, `ui/saveIcons.ts`, `tests/unit/saveSafety.test.ts` | Review what's done, finish, test, and merge. |
| `final-fixes-gameplay` | One WIP commit `8270dd7`, **untested** | Gameplay items P-04 to P-06 (unobtainable items, jars), P-14 to P-19, P-23, P-24, P-26, P-32, P-34, P-35. Includes a new `tests/unit/obtainable.test.ts` | Review what's done, finish, test, and merge. |

The WIP commits were made by the coordinator to save the work; they may not compile. Check each branch's diff against its scope before continuing.

The macOS soak finding: on the release dry run, the 30-minute soak unit test (`m4soak`) reported `sim.rescues = 1` on macOS and 0 on Linux, which points to cross-platform physics nondeterminism (likely transcendental `Math` functions). Nothing was lost, since the rescue system worked, but it needs a decision: make the sim deterministic across platforms, or relax the test's guarantee to "nothing is permanently lost" and document why. Saves are snapshots, not replays.

Stale things to clean up: the `pre-release-review` remote branch (already on main), and the local worktrees under `.claude/worktrees/`. Remove a worktree only after its branch is pushed (all four are). Don't touch `~/.t3/worktrees/tocabocaclone/t3code-476538b7` (branch `t3code/create-dot-character-art`): it belongs to a separate thread, probably the artist's Dot work.

## Owner decisions made on 2026-10-02

- **Credits:** leave the placeholder in `art/CREDITS.json` for now. The daughter will decide her credit later. (The music and code entries currently say "Nathan Amick"; revisit with her.)
- **macOS:** ship unsigned for v1.0. Document the right-click → Open workaround in the release notes and turn off auto-update on Mac (unsigned Mac apps can't auto-update). Signing is P-09; revisit later.
- **Music:** the owner will make more Suno tracks, and v1.0 waits for them. Follow `docs/05-music-brief.md` (the track list is section 2.1). He drops each track's zip contents into `assets/music/<track_id>/` with the full mix renamed to `full.wav`; then run `pnpm music:import`. Suno ran 1–2% fast on tempo, and silent and vocal stems are dropped automatically.
- **Repo visibility:** stays public until the first pass is finished, then goes private. **Ask the owner before making it private.** When it does: Actions minutes stop being free, Sonniss/Pixabay/Zapsplat sound effects become allowed (`docs/08-sound-brief.md`), and the GitHub updater needs rethinking (Steam handles updates for a Steam build).

## What's left before v1.0

1. Land the four branches above. Get main green.
2. Re-check the review doc's Status column: every P0/P1 fixed or explicitly deferred by the owner. P-03 (music) waits on the owner's tracks. P-07 (credits) is deferred. P-09 (Mac signing) is deferred, with the workaround documented and Mac auto-update off.
3. Import the owner's new Suno tracks as they arrive.
4. A last quick playtest pass (scripted plus screenshots) on the merged main.
5. Cut the draft: follow `RELEASING.md` (tag `v1.0.0`, CI builds a **draft** release). **Never publish a release.** The owner reviews and publishes.

Later, not v1.0: the daughter's hand-drawn art (pipeline ready; she starts with Dot, see `art/START-HERE.md`), background art pipeline (sketched in `docs/06`), recorded sound effects from the owner (`docs/08`), Steam integration (`docs/09`), making the repo private.

## How the work has been run

The owner asked for a coordinator that delegates everything to subagents to keep the main context small. What worked:

- **One agent per milestone or fix batch**, each in its own git worktree (`isolation: "worktree"`), on its own branch with a draft PR. When the PR's CI is green, the agent rebases (or merges main if rebasing is too conflict-heavy), waits for green again, fast-forwards main (`git push origin HEAD:main`), closes the PR, and deletes the branch. The coordinator then removes the worktree (`git worktree remove -f -f`) and local branches.
- **Prompts that work** include: read AGENTS.md first; the exact scope (milestone section, review item IDs); a quality bar with screenshot contact sheets; "every fix gets a test"; context hygiene (grep and `sed -n`, pipe output through `tail`, contact sheets instead of many images); and the anti-loop rule: if a test fails on CI twice, restructure it (freeze and step, stage via debug commands, move long chains into Vitest) instead of tweaking timings.
- **Save versions are claimed at merge time.** Parallel branches each bump `SAVE_VERSION`; whoever merges first takes the next number and the other renumbers after rebasing. Main is at 16.
- **The machine is the bottleneck,** not tokens: 6 cores and 15 GB, shared with the owner's other projects. Run at most 2–3 agents at once. Locally, agents run typecheck, lint, unit tests, and only the E2E specs they touched (`--workers=1`). CI runs the full E2E suite, sharded 8 ways, free while the repo is public.
- **Electron never runs on the owner's desktop.** `pnpm test:e2e` and `pnpm shots` use `xvfb-run` automatically (Xvfb is installed). Unset `ELECTRON_RUN_AS_NODE` before running Electron any other way.
- **`isolation: "remote"` silently falls back to a local worktree** on this setup, so it doesn't save load.
- **Agents die mid-task** on session restarts and account usage caps. Check their worktree state before resuming (`git status`, `git log origin/main..HEAD`) and resume with SendMessage, or commit and push WIP to save it.
- **Helper agents sometimes message the coordinator instead of their lead.** Forward the message to the lead.
- **Fable** (a separate usage cap, not extra capacity) did good engineering on photo mode, but its visual design needed a review pass. Default to Opus.
- **Prose for docs, commits, and PRs** follows the owner's `unslop` skill: plain, direct, no hype. Commit messages are imperative and plain.

## People and preferences

- The owner (namick on GitHub) isn't a game developer and wants honest progress reports, no hype. He cares about real progress over token savings, and about not hogging his machine.
- The artist (his daughter, 17) playtests and likes the game. Her feedback goes in `docs/reviews/playtest-feedback.md`.
- Outward-facing actions (making the repo private, publishing releases, anything on Steam) need the owner's OK first.
