# Bugglebrook

Bugglebrook is a sandbox game about tiny bugs in a backyard. The bugs wander around on their own, and everything in the world can be picked up, stacked, and flung. You can't lose, and nothing is timed. There are secrets to find. It's aimed at players around 13. Every picture and sound is generated in code, so the repo has no image or audio assets.

It's an Electron app for Windows, macOS, and Linux. `docs/00-decisions.md` holds the product decisions, and `docs/04-architecture.md` explains how the code fits together.

## Develop

You need Node 22 or newer and pnpm.

```sh
pnpm install
pnpm dev          # run the app with hot reload
```

## Test

```sh
pnpm typecheck    # four tsconfigs: sim core, main/preload, renderer, E2E
pnpm lint         # ESLint and Prettier
pnpm test         # Vitest, headless
pnpm test:e2e     # builds, then drives the real app with Playwright
```

The E2E tests open real windows, so run them in a desktop session. On a headless Linux box, use `xvfb-run -a pnpm test:e2e`.

## Build

```sh
pnpm dist:linux      # AppImage and .deb in dist/
pnpm dist:appimage   # AppImage only
pnpm dist:win        # NSIS installer
pnpm dist:mac        # dmg and zip
pnpm icon            # regenerate build/icon.png
```

On Arch, the .deb step needs `libxcrypt-compat`, because electron-builder's bundled fpm links against `libcrypt.so.1`. `dist:appimage` doesn't need it.

CI builds unsigned installers for all three platforms on every push. Pushing a `v*` tag that matches `package.json` uploads installers to a draft GitHub release. Nothing reaches players until someone publishes the draft by hand. Installed copies then pick up the update through electron-updater.
