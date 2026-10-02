# Bugglebrook: locked decisions

These were set by the project owner before the unattended build. Do not change them.

| Topic | Decision |
|---|---|
| Name | **Bugglebrook**. Public GitHub repo `namick/bugglebrook` |
| Audience | About 13 years old. No playing house, no dating, no teen-drama themes. |
| Premise | Tiny cute bug characters living in a backyard world, with lots of toys to play with. Bugs move around on their own (autonomous AI). Everything can be moved and manipulated. |
| Art | Flat vector, Toca-like: bold shapes, thick outlines, bright colors, squash-and-stretch. All art is drawn in code (PixiJS) by default. Hand-drawn art from the owner's daughter (Krita, `.ora` files, see `docs/06-art-guide.md`) can replace any bug, item, or background, one asset at a time. The code still animates her art, and the code-drawn version remains the fallback for anything she hasn't drawn. Her art keeps its own license, separate from the code. *(Amended by the owner on 2026-10-01. Originally: all art in code, no external assets.)* |
| World | One connected, side-scrolling garden world with several areas (e.g., backyard → pond → under the porch → treehouse → compost lab). Bugs and toys can be carried between areas. |
| Structure | Sandbox + secrets. No failing, no timers. Hidden secrets, a collection journal, discoverable combos ("mix X with Y"), unlockable areas and bugs. |
| Tone | Weird and silly: absurd humor, mild gross-out (burps, slime, stink clouds), slapstick flinging where bugs bounce back dizzy. Never mean. |
| Characters | A fixed cast of about 12–16 named bugs with personalities. Some are hidden until found. Hats and accessories fit any bug. Paint and potions change bugs. |
| Physics | Real 2D physics engine. Objects stack, roll, bounce, and float. Ramps, springs, and marble runs work. |
| Text | Nearly wordless. Icons, gibberish bug voices, emoji/pictogram speech bubbles. The journal is pictures plus short labels. |
| Audio | Background music is owner-supplied: tracks made in Suno, with stems, in `assets/music/` (see `docs/05-music-brief.md`). It is layered and adaptive, built from the stems. Sound effects are a hybrid (see `docs/08-sound-brief.md`): recorded samples from CC0/CC-BY libraries, self-recordings, or Suno, in `assets/sfx/`, for the sounds where real recordings beat the synth. Code adds variation to the samples, and any sound without a sample falls back to the WebAudio synth. Bug voices stay synthesized and mood-driven, optionally built from the artist's own recorded gibberish. The music toys stay synthesized and lock to the current track's key and tempo. *(Amended by the owner on 2026-10-01 and 2026-10-02. Originally: all procedural, no sample assets.)* |
| Input | Mouse / trackpad only (drag, drop, fling, click, scroll). |
| Saves | Autosave with 3 slots. The world persists exactly as it was left. |
| Performance | Mid-range PC at 60fps. |
| Extras | Photo mode (stickers and frames, saved to Pictures), day/night + weather (which change behavior and reveal secrets), music toys (instruments and a sequencer), building/crafting (combine junk into new toys and contraptions). |
| Platforms | Electron app. Builds for Windows, macOS, and Linux. |
| CI/CD | GitHub Actions: tests plus unsigned builds on native runners (Win .exe NSIS, Mac .dmg, Linux AppImage + .deb). CI creates a **draft** GitHub Release. Never publish a release. |
| Updates | Auto-update via electron-updater from GitHub Releases. |
| Testing | Comprehensive automated tests (unit + integration + Electron end-to-end) so new features don't break old ones. Tests must pass before each milestone is committed. |
| Process | The coordinator delegates to subagents, one or two at a time (no mass fan-out workflows). |
