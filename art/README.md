# Art

Editable artwork for Bugglebrook. The current `src/bugs/` and `src/faces/` files are the agent-created Krita reference set, described in `REFERENCE-SET.md`. They are not the daughter's drawings. Her future artwork belongs in its own named set and keeps its own artist credit. See `LICENSE` for the separation from the code license.

- New here? Read `START-HERE.md`.
- `src/bugs/<bug_id>.ora` and `src/faces/face_kit.ora` are the Krita files. Each has a `.rig.json` next to it. Don't edit those; `pnpm art:templates` writes them.
- `templates/` (not in git) gets fresh templates when a source already exists.
- `src/sets/storybook/` is a second agent-painted cast in a shaded style, described in `STORYBOOK-SET.md`.
- `src/sets/xeno/` is a third agent-painted set, the bugs as creatures from another planet, with its own items and backdrop. Settings calls it **Alien planet**. It is described in `XENO-SET.md`.
- `src/sets/<set_id>/` holds another artist's set. Run `pnpm art:templates --set <set_id>` to start one, add its name and credit in `set.json`, and run `pnpm art:build` after drawing. See the named-set instructions in `docs/06-art-guide.md`.

A set can hold more than bugs. Each of these is optional, and whatever a set leaves out stays as the game draws it:

- `colors.json` names the set's own colors for what the game tints on a bug or draws beside it, and `bugs/<bug_id>.lights.json` lists spots on a bug that glow after dark. See A3 in the guide.
- `items/` holds item sheets, one paint layer per item. `pnpm art:item-templates --set <set_id>` makes them, and `pnpm art:check-one <file.ora>` checks one in a second. See A9.
- `backdrop/` holds `sky.json` (the sky's colors), `world.json` (a tone map for the code-drawn world, and the pond's water), and painted far and mid strips, one `<area_id>_far.ora` or `<area_id>_mid.ora` per area with its `.strip.json`. `pnpm art:backdrop-templates --set <set_id>` makes the templates, and `pnpm art:check-backdrop <file or folder>` checks one piece in a couple of seconds. See A7.

The settings board switches between **Original bugs**, **Krita reference**, **Storybook**, **Alien planet**, and other installed named sets. Original bugs is the default. A missing drawing uses the procedural version of that bug or item, and a set without a backdrop, or without a strip for some area, keeps the game's own sky, hills, and colors there.

To see a whole set in the game before it is built in, run any screenshot tour with it: `BB_SHOTS_SET=<set_id> BB_ART_SOURCE=1 pnpm shots -g "areas.spec"`.

The full guide, and the spec for the code that reads these files, is `docs/06-art-guide.md`.
