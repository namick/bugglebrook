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

All twelve design milestones (M1 to M12 in `docs/03-game-design.md` section 19) have been built. The four branches that were in flight at the last handoff (sound samples, sim performance, save robustness, gameplay fixes) all landed on main on 2026-10-02, each through a PR that was green on CI. Every pre-release review item now has a status, and the save version is still 16. About 1,400 unit tests and about 115 E2E tests.

On main:
- The full game: 8 areas (2 hidden), all 16 bugs, about 170 items, 32 recipes, 33 potions, 67 secrets (all with triggers) and 4 mysteries, the journal, photo mode, 29 wearables, music toys and the mushroom sequencer, trash can and tidy whistle, day/night/weather, 3 save slots (save version 16).
- The art pipeline: Krita `.ora` templates for every bug, importer, cutout renderer, `pnpm art:watch`, Art Lab, credits board.
- Music: adaptive player built from Suno stems. Two real tracks exist (`main_menu`, `stump_plaza_day`); everything else plays a procedural pad.
- Sound: synthesized effects, plus a recorded-sample system (`pnpm sfx:import`) that falls back to the synth for any sound without a recording, and ambience beds. No recordings exist yet.
- Saves: locked slots for saves that won't open (never deleted), a badge and retries when a save fails, a save before every quit, two backups per slot, real fixtures for versions 11, 15, and 16.
- Release engineering: app hardening, updater (off for Steam builds and on macOS), installers at version 1.0.0 (not tagged), draft-release workflow tested, a macOS smoke job on CI.

## Open questions for the owner

These came out of the 2026-10-02 merges. None blocks the others.

- **Save-failure badge (P-02).** The review asked for a red cloud over the home stump. The agent made a rain cloud in a red ring by the pause button, because a plain cloud read as weather. Screens: `pnpm shots -g "save trouble"`.
- **Photo thumbnails (P-20).** Moving them out of the save into their own file would make saves smaller, but it changes the save format. Deferred unless he wants it.
- **Completion jar (P-35).** Each item now counts as a quarter of an entry, not a whole one. The design doc was updated to match.
- **Night sleep (P-14).** Day bugs now sleep from 21:00 to 04:30, and a bug the player wakes stays up a minute.
- **Closer camera (P-15).** Only the first scene opens zoomed in. A closer camera during all play needs a real camera zoom across input and rendering.

## Known loose ends

- **Renderer performance (P-08).** The sim step is about 38% faster, but drawing has had no perf work and has no perf check: views snapshotted twice a frame, `mouthOwners` rescans, sprites for off-screen things, Graphics rebuilt every frame.
- **Local flakes under load.** On this machine when it's busy, the m2 "disliked food is spat out" E2E fails about half the time, and the m6 puddles and m4 soak unit tests can time out. All pass on CI. `pnpm test:perf` goes over its CI bars here under load; that's expected.
- **Cross-platform physics.** The 30-minute soak saw one rescue on macOS and none on Linux. The test now allows a few rescues and checks that nothing is lost; `docs/04-architecture.md` explains why bit-identical physics across platforms isn't required.
- **An Xvfb display on this machine (:109) is broken.** If `pnpm test:e2e` fails with "Missing X server or $DISPLAY", run through `xvfb-run -n <free number>`.
- Don't touch `~/.t3/worktrees/tocabocaclone/t3code-476538b7` (branch `t3code/create-dot-character-art`): it belongs to a separate thread, probably the artist's Dot work.

## Owner decisions made on 2026-10-02

- **Credits:** leave the placeholder in `art/CREDITS.json` for now. The daughter will decide her credit later. (The music and code entries currently say "Nathan Amick"; revisit with her.)
- **macOS:** ship unsigned for v1.0. Document the right-click → Open workaround in the release notes and turn off auto-update on Mac (unsigned Mac apps can't auto-update). Signing is P-09; revisit later.
- **Music:** the owner will make more Suno tracks, and v1.0 waits for them. Follow `docs/05-music-brief.md` (the track list is section 2.1). He drops each track's zip contents into `assets/music/<track_id>/` with the full mix renamed to `full.wav`; then run `pnpm music:import`. Suno ran 1–2% fast on tempo, and silent and vocal stems are dropped automatically.
- **Repo visibility:** stays public until the first pass is finished, then goes private. **Ask the owner before making it private.** When it does: Actions minutes stop being free, Sonniss/Pixabay/Zapsplat sound effects become allowed (`docs/08-sound-brief.md`), and the GitHub updater needs rethinking (Steam handles updates for a Steam build).

## What's left before v1.0

1. Answer or defer the open questions above.
2. P-03 (music) waits on the owner's tracks. P-07 (credits) and P-09 (Mac signing) are deferred; the Mac workaround is in `CHANGELOG.md` and Mac auto-update is off.
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
