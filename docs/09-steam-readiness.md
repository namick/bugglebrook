# Steam readiness

Bugglebrook 1.0 ships on GitHub Releases. This note covers what is already in place for a later Steam build and what that build still needs. The background (fees, Deck review, which Steamworks library to use) is in `07-steam-market-research.md`, sections 1.5 and 1.6. Nothing here integrates Steamworks yet.

## Already done

- **A build without the updater.** `pnpm build:steam` (`electron-vite build --mode steam`) sets `__BB_UPDATER__` to false, and `updateBlock` in `src/main/policy.ts` then keeps electron-updater from running. Setting `BUGGLEBROOK_UPDATER=off` while building does the same. The log says `Auto-update off (build)`. The update toast never appears, because main never announces an update.
- **Save files Steam can sync as they are.** Everything lives in Electron's userData folder, and every save write is atomic with one backup.
- **A local log.** `logs/main.log` (rotated at 1 MB, three old files kept) helps with Steam support questions. Nothing is sent anywhere.
- **Crash handling.** An uncaught renderer error shows the "oops, bugs got loose" screen with a reload button. A crashed renderer reloads on its own, up to three times a minute.
- **Single instance, fullscreen by default, no menu bar, window placement that survives monitor changes.** Valve's review looks for each of these, and the Deck runs the game fullscreen anyway.
- **A wordless game.** Deck Verified asks for readable text at 1280x800 and matching controller glyphs. There is almost no text, and no on-screen button prompts, so most of that check doesn't apply.

## Still to do

### Packaging and depots

- Build with `pnpm build:steam`, then `electron-builder --win dir --publish never` (and `--linux dir` for a native depot). Steam wants a folder, not an installer, so use the `dir` target and upload `dist/win-unpacked` with SteamPipe.
- `app-update.yml` still lands in the resources folder. It does no harm with the updater compiled out, but a Steam build can drop the `publish` block to leave it out.
- Start with the Windows depot only and let the Deck run it through Proton, as section 1.5 of the research recommends. Add a native Linux depot only after it runs under the Steam Linux Runtime. Chromium wants libraries the runtime lacks, and Wayland GPU crashes have been reported.

### Steamworks library

- Try `steamworks-ffi-node` first and keep `steamworks.js` as the fallback (section 1.6). The library loads in the main process only, behind a new module such as `src/main/steam.ts`. Import it only when the build is a Steam build, the same way `__BB_UPDATER__` gates the updater, so the GitHub builds never ship the native module.
- Add `steam_appid.txt` for local testing only. Never ship it in the depot.

### Achievements from the journal's secrets

- The 67 secrets in `src/game/data/secrets.ts` map one to one to achievements. Use the secret ID as the achievement's API name (`secret_band_of_three`, and so on). The icons can come from the journal's entry art.
- The sim already emits `secret_found` (`src/game/events.ts`) the moment a secret is found. The renderer would forward it through one new, narrow bridge call such as `bugglebrook.steam.unlock(id)`. Main checks the ID against the secret list before calling the library, as it validates every IPC argument now.
- Secrets live in each world (`world.journal`), while achievements belong to the Steam account. Unlock an achievement the first time its secret is found in any slot. On launch, the renderer can replay the found secrets of every slot so achievements earned before Steam arrived still unlock.
- Steam can also count progress, so the completion jar could map to a stat such as "secrets found" with achievements at 10, 33, and all 67.
- The four mysteries and the finale can be achievements too, or hidden ones.

### Cloud saves

- Use Steam Auto-Cloud. It needs no code. In Steamworks, add root-relative paths for each OS:
  - Windows: `%APPDATA%/Bugglebrook/saves/` and `%APPDATA%/Bugglebrook/settings.json`
  - Linux and the Deck: `~/.config/Bugglebrook/saves/` and the same `settings.json`
  - macOS, if it ever ships there: `~/Library/Application Support/Bugglebrook/`
- Sync `slot-0.json` to `slot-2.json` and their `.bak.json` backups. Leave out `*.corrupt.json`, `*.tmp`, `window-state.json` (it describes this machine's monitors), and `logs/`.
- Photos go to the player's Pictures folder, not userData, so cloud saves never carry them. The slot pictures and journal thumbnails inside the saves do sync.
- A conflict (played on two machines while offline) is resolved by Steam's own dialog, per file. The atomic writes mean Steam never sees a half-written slot.

### Steam Deck controls

The game takes mouse and trackpad input only (locked decision), and the Deck can supply both without code changes:

- **Touchscreen.** Taps and drags arrive as mouse events, so grab, drag, fling, poke, and click work by touch. Drags can't hover, so a touch shows no hover highlight and no hover pose on the hand. Check that nothing important depends on hovering first: the teaching hints and the stir invitation do use hover.
- **Trackpads.** Ship an official Steam Input layout. Right trackpad as a mouse moves the hand. Right trigger, or a click of the right pad, is the left mouse button, and holding it grabs. Left trigger scrolls the camera, as the wheel does. The left stick can scroll the camera too. Bind A to left click and B to Escape, which opens pause and closes boards.
- **Edge scrolling.** Edge scrolling is a setting already. With a trackpad near the screen edge it may fight the player, so test whether the Deck layout should default it off.
- **Performance.** Section 1.5 asks for 30 fps at 800p. The M12 frame budget targets 60 fps on a mid-range PC. Measure on a Deck with 16 bugs, 150 items, and night lighting, the M12 stress scene.
- **Suspend and resume.** The game pauses the sim when the window is hidden (`visibilitychange`). Check that the Deck's suspend fires it and that audio resumes after waking.
- **Text size.** The few labels (journal names, credits) need a check at 1280x800.

### Store and review checklist

- Content survey: no violence, no purchases, no online features, no data collection.
- Write the store page from the wordless angle and lead with the artist's hand-drawn bugs (section 7.1 of the research).
- Steam Deck review: request it once the Steam Input layout ships.
