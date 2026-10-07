# Art

Editable artwork for Bugglebrook. The current `src/bugs/` and `src/faces/` files are the agent-created Krita reference set, described in `REFERENCE-SET.md`. They are not the daughter's drawings. Her future artwork belongs in its own named set and keeps its own artist credit. See `LICENSE` for the separation from the code license.

- New here? Read `START-HERE.md`.
- `src/bugs/<bug_id>.ora` and `src/faces/face_kit.ora` are the Krita files. Each has a `.rig.json` next to it. Don't edit those; `pnpm art:templates` writes them.
- `templates/` (not in git) gets fresh templates when a source already exists.
- `src/sets/storybook/` is a second agent-painted cast in a shaded style, described in `STORYBOOK-SET.md`.
- `src/sets/<set_id>/` holds another artist's set. Run `pnpm art:templates --set <set_id>` to start one, add its name and credit in `set.json`, and run `pnpm art:build` after drawing. See the named-set instructions in `docs/06-art-guide.md`.

The settings board switches between **Original bugs**, **Krita reference**, **Storybook**, and other installed named sets. Original bugs is the default. A missing drawing uses the procedural version of that bug.

The full guide, and the spec for the code that reads these files, is `docs/06-art-guide.md`.
