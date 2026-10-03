# Dot's Krita experiment

This Dot was authored by Codex in Krita 6.0.4 on 2026-10-02 at the owner's request. It is an AI art experiment, not artwork by the project's human artist. The artist credit in `CREDITS.json` has not changed.

Krita painted the shapes with its Basic-5 Size brush through its Python `paintPath` and `paintEllipse` interface. Codex supplied the curves, colors, and layer operations. This was brush scripting, not manual mouse drawing or an image-model generation. Krita saved the layered OpenRaster source.

## Files

- `src/bugs/bug_ladybug_dot.ora` is the editable source, on the original 1024 by 896 template at 4x game size.
- Its eight body layers are `shell`, `belly`, `head`, `wing`, `leg_upper`, `leg_lower`, `antenna`, and `antenna_tip`.
- The `face` group contains all 28 eye, brow, cheek, and mouth pieces. They belong to Dot alone; the shared face kit is unchanged.
- `../src/renderer/art/bugs/bug_ladybug_dot@1x.*` and `@2x.*` are generated atlases. Rebuild them with `pnpm art:build` after saving the ORA.

The source opens with the near eye and everyday smile visible. Other expressions and the wing are hidden so they do not pile on top of each other. Hidden parts still export. Toggle the `guides` group to see the original drawing, joint markers, and safe box. Legs point down and the antenna points up in the source; the game poses and repeats them.

The red shell, plum outline, dark head, and pink mouth retain Dot's original palette. Flat raspberry shell shading, a coral light band, irregular spots, cream eyes, jointed plum feet, and a pale blue wing membrane add detail. The rig, physics, animation code, and other characters are unchanged.

## Review

Open the ORA in Krita to edit it. `pnpm art:watch` opens the live Art Lab on your desktop. Dot's drawing appears beside the code version.

For a screenshot review without a desktop window:

```sh
BB_SHOTS_DIR=/tmp/bb-dot-shots pnpm shots -g 'Dot Krita'
```

This tour uses the shipped Dot, not the crude pipeline fixture. It captures every pose at both atlas resolutions, the expression grid, and the paint, rainbow, ghost, wet, frozen, and night looks. In each comparison the procedural Dot is on the left and the Krita Dot is on the right.

The unit test in `tests/unit/artRuntime.test.ts` checks every pose and expression with no shared face kit. The shipped-art test in `tests/e2e/art.spec.ts` picks Dot up and flings her with the real mouse, checking that her art and faces stay active.
