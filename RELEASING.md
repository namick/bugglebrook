# Releasing Bugglebrook

CI never publishes a release. Pushing a version tag builds every installer and uploads them to a **draft** GitHub release. A person checks the draft and publishes it by hand. Players' copies update only after that, because electron-updater can't see drafts.

## What a release contains

`.github/workflows/release.yml` runs on any `v*` tag. The draft it makes holds:

| File                                                 | Platform                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bugglebrook-Setup-X.Y.Z.exe` and its `.blockmap`    | Windows 10 and 11, x64. A one-click installer that needs no admin rights. It installs for the current user, adds desktop and Start menu shortcuts, and starts the game. |
| `Bugglebrook-X.Y.Z-mac-arm64.dmg`, `...-mac-x64.dmg` | macOS on Apple silicon and on Intel. Unsigned.                                                                                                                          |
| `Bugglebrook-X.Y.Z-mac-arm64.zip`, `...-mac-x64.zip` | What the macOS updater downloads.                                                                                                                                       |
| `Bugglebrook-X.Y.Z-linux-x86_64.AppImage`            | Linux, any distro.                                                                                                                                                      |
| `bugglebrook_X.Y.Z_amd64.deb`                        | Debian and Ubuntu.                                                                                                                                                      |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml`   | Update metadata. The installed game reads these to find new versions.                                                                                                   |

The workflow's last job, "Check the draft", fails if any of these is missing or if the release is no longer a draft. Its summary page lists every file with its size.

## Cutting v1.0.0

1. Make sure `main` is green on CI, including the three `Build` jobs.
2. Check that `package.json` says `"version": "1.0.0"` and that `CHANGELOG.md` describes this release. For later releases, bump the version and add a changelog section in one commit on `main`.
3. Tag the commit and push the tag:

   ```sh
   git checkout main && git pull
   git tag -a v1.0.0 -m "Bugglebrook 1.0.0"
   git push origin v1.0.0
   ```

   The workflow refuses a tag that doesn't match `package.json`.

4. Wait for the "Release (draft)" run under Actions to finish, about 20 minutes. All five jobs should be green.
5. Open the draft under Releases (`gh release view v1.0.0` works too). Check the files against the table above, then test the installers as described below.
6. Edit the draft's notes. The workflow fills them from merged PRs, so paste in the `CHANGELOG.md` section instead.
7. Click **Publish release**. From then on, installed copies find the update within a few hours, or at their next launch.

If a build fails, fix it on `main`, delete the draft and the tag, and tag again:

```sh
gh release delete v1.0.0 --yes
git push origin :refs/tags/v1.0.0 && git tag -d v1.0.0
```

Never delete or retag a release that has been published. Ship a new version instead.

## Testing the installers

Download the files from the draft, or from the `bugglebrook-*` artifacts of any CI run on `main`.

**Windows.** Run the Setup .exe. SmartScreen warns about an unknown publisher because the build is unsigned, so choose "More info", then "Run anyway". The game should install without asking anything and start fullscreen. Check the desktop shortcut, the Start menu entry, and that "Apps & features" can uninstall it. After an uninstall, saves in `%APPDATA%\Bugglebrook` should still be there.

**macOS.** Open the .dmg and drag the app to Applications. Gatekeeper blocks unsigned apps, so right-click the app and choose Open the first time. On recent macOS you may need System Settings, Privacy & Security, "Open Anyway". Unsigned Mac builds can't update themselves, because Squirrel.Mac checks the signature. Mac players reinstall each version until the build is signed and notarized.

**Linux.** `chmod +x Bugglebrook-*.AppImage` and run it. Or install the deb with `sudo apt install ./bugglebrook_*_amd64.deb` and start it from the Games menu. Only the AppImage updates itself.

On each platform, check that:

- The game opens fullscreen on the menu, with music.
- You can make a world, play a minute, quit through the door, relaunch, and find the world as you left it.
- Photo mode saves a PNG to `Pictures/Bugglebrook`.
- `logs/main.log` exists in the data folder and names the right version. The data folder is `%APPDATA%\Bugglebrook` on Windows, `~/Library/Application Support/Bugglebrook` on macOS, and `~/.config/Bugglebrook` on Linux.
- With fullscreen off in the settings, the window comes back at the same size and spot after a relaunch.

## Testing the updater

The updater only sees published releases, so test it with an older installed version:

1. Install the previous release on a test machine. Before the first public release, a published prerelease made for the test does the job.
2. Publish the new release.
3. Launch the old copy and leave it on the menu. Within a minute or so, the gift toast slides in from the left. Its log says `Update X.Y.Z downloaded`.
4. Press the green button. The game saves, restarts, and the log names the new version.

## Testing the release workflow without releasing

Use a prerelease tag on a throwaway commit whose `package.json` version matches the tag:

```sh
git checkout -b release-dry-run origin/main
npm pkg set version=0.9.0-rc.1 && git commit -am "Dry run 0.9.0-rc.1"
git tag v0.9.0-rc.1 && git push origin v0.9.0-rc.1
# wait for "Release (draft)" to finish, then:
gh release view v0.9.0-rc.1 --json isDraft,assets
gh release delete v0.9.0-rc.1 --yes
git push origin :refs/tags/v0.9.0-rc.1 && git tag -d v0.9.0-rc.1
```

Never publish the dry-run draft.

## Builds without the updater (Steam)

Steam updates games itself. `pnpm build:steam` builds the app with the auto-updater compiled out. Package it with `electron-builder --publish never`. See `docs/09-steam-readiness.md`.
