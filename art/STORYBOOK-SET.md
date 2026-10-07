# Storybook set

Storybook is a second agent-made cast: all sixteen bugs, every face piece for each of them, and its own face kit. Claude painted it in Krita 6.0.4 on 6 October 2026 at the owner's request. It's meant as a worked example of what a finished art set can look like. It is not the owner's daughter's artwork, and it doesn't replace her drawings.

Pick it in Settings with the Art arrows. The order is **Original bugs**, **Krita reference**, **Storybook**, then any other installed sets.

## How it differs from the reference cast

The reference cast is flat color with one shade and one shine per part. Storybook paints each part as a rounded form instead:

- Three shading bands per color, computed from a light at the top front (top right, since bugs face right). The band edges are softened with low-opacity brush strokes.
- A colored rim light along the lower back edge of most parts, like bounce light from the ground. Each bug has its own rim color.
- Line art in a dark shade of each bug's own hue instead of one shared plum, about 16 px wide on the template.
- Glossy highlights and small sparkle dots on hard shells; fur flicks on Buzzby, Luma and Munch's butterfly; speckles, seams, veins and segment lines elsewhere.
- Faces with a colored iris, a dark pupil and two catchlights. The iris color differs per bug: amber for Dot, violet for Glorp, pink for Prim, and so on.

Some designs changed too. Glorp's shell has two-tone spiral stripes. Fiddle's folded wing has f-holes like a violin. Boing's and Fiddle's thighs carry herringbone marks. Skeet has a row of water beads along his side, and Flick's lantern has a hot white core. Dot's head has a cream patch.

Some things stayed on purpose. Every silhouette follows the template's rig, so joints line up and nothing floats when the game animates the parts. Twig still matches the plaza twig item, Barty's tintable parts are greys (`shell_tint`, `thorax_tint`, `head_tint`, `ball_tint`, and the sleepy eyelid in every face set), and the forms (Rollo's ball, Glorp's closed shell, Barty's ball, Munch's cocoon and butterfly, Prim's open wings) are all drawn.

The style breaks one rule from `docs/06-art-guide.md`, A2: it uses more than one shade per color. The bands are hard-edged, which holds up at game size better than airbrushing. Check the screenshots below before copying the approach for a set of your own.

## How it was made

Krita painted every pixel in these files, driven through the `krita-cli` MCP bridge (`~/.local/share/krita-cli/README.md`), on a Krita running on its own virtual display. The bridge has three painting commands: filled rectangles, round soft brush strokes, and colors. Python scripts planned the strokes from shape and lighting descriptions, about 45,000 of them for the whole set, and sent them to Krita in batches. Krita then saved the layered ORA files itself. This is brush scripting, the same method as the reference cast. It is not mouse drawing, and no image model was involved.

Each ORA started as a blank copy of the reference template: the same canvas, guides, rig stamp and layer names, with every part and face layer emptied. The silhouettes came from the reference cast's layers, smoothed and sometimes changed (Buzzby's fur, for one). The shading, line, patterns, faces and colors are new.

The sources are in `src/sets/storybook/bugs/` and `src/sets/storybook/faces/`, each ORA next to an unchanged `.rig.json`. Open them in Krita and edit them like any other set; the layers are ordinary paint layers. `pnpm art:build` turns them into the atlases in `src/renderer/art/sets/storybook/`.

## Checking it

`tests/unit/referenceArt.test.ts` checks both agent-made casts: every bug must build with no report messages, carry all 28 of its own face pieces, and show only drawn parts and faces in every pose and expression at both atlas sizes.

For screenshots on a virtual display:

```sh
BB_SHOTS_DIR=/tmp/bb-storybook pnpm shots -g 'Storybook cast'
```

The tour saves each bug's pose and expression grid at 1x and 2x, the poses the game draws large, and the paint and night looks, as `storybook-*.png`.
