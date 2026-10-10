# Alien planet set

Alien planet is a third agent-made art set. Its ID is `xeno`. It redraws all sixteen bugs as creatures from another planet, and it is the first set to go past the bugs. It paints 147 of the game's items, a sky, and the hills and plants behind six areas, and it recolors the ground the game draws. Claude painted it in Krita 6.0.4 on 10 October 2026 at the owner's request. It is not the owner's daughter's artwork, and it doesn't replace her drawings.

Pick it in Settings with the Art arrows. The order is **Original bugs**, **Krita reference**, **Storybook**, **Alien planet**, then any other installed sets. The one choice switches everything the set has.

## The planet

Every painter worked from one story. The Lantern Reef is a small moon where the air is as thick and still as water. Its meadow grew the way a coral reef grows, and everything that crawls on it descends from sea slugs and jellyfish that learned to walk. Nothing there has bones or bark. Things are jelly, glass, or glossy shell.

Two suns light it. Mama is big and peach-gold, and she is the light everything is painted by. Pip is small and cyan and sits behind everything, so every creature has a thin cyan edge along its back. At night Pip is the moon and the world turns indigo.

Everything alive keeps a small light inside it, called its glim. Each bug owns one glow color out of eight. Dot's spots are glims, and Glorp carries a spiral of them in a glass flask.

The mood is a tide pool at golden hour. It is bright, wet, and a little strange, and never dark or gross. Nothing has claws, fangs, or slime.

## How it differs from the other sets

The reference cast is flat color with one shade and one shine per part. Storybook shades each part in three hard bands, gives each bug a line in its own hue, and stays close to the reference silhouettes. Alien planet departs from both.

- **New silhouettes.** A part keeps its pivot, its length, and whatever the rig needs of it. The rest of its outline is redrawn. Dot's shell is a jellyfish bell, Glorp's is a glass flask, and Moose's antlers are staghorn coral.
- **Materials.** Each part is jelly, hard shell, glass, fluff, a see-through membrane, or a light, and each of those is shaded its own way. The style guide asked every bug to mix at least two.
- **Two suns.** A warm light sits on the top front of every part and a hard cyan rim on its back edge. Shade turns violet instead of grey.
- **A stepped ramp with hard shapes on top.** A part is filled with about eight thin bands from shade to light, which read as a smooth gradient at game size. Over them go the rim, one reflection, and the glims.
- **One thin indigo line.** The outer line is `#1b1440` on bugs and items alike. It is 2 to 4 px wide on a 1080p screen, thinner on the lit side. The reference cast's is 6 px and Storybook's is 4.
- **Bead tips.** Feelers, stalks, horns, and tails end in a round bead of the bug's glow color.
- **Moon eyes.** The eye is a tall pale oval with a ring of the glow color and a dark pupil with a crescent of that color in it. Brows and closed mouths are single strokes with a bead on each end. An open mouth has a tongue in the glow color, and a smile shows one small rounded tooth, except on the smallest faces.
- **No brown or black.** Neutrals lean violet, and the only greys are on layers the game tints. Yellow shades to marigold and mustard to olive.

Some things stayed on purpose. Every bug file carries all 28 of its own face pieces. Twig's `stick` stays within the twig item's outline, because the game draws that layer as every loose twig. Barty's four tinted parts and every sleepy eyelid are greys. The forms are all drawn: Rollo's ball, Glorp's closed shell, Barty's ball, Munch's cocoon and butterfly, and Prim's open wings.

## The cast

- **Dot, the bell-back.** A ladybug whose wing case is a red jellyfish bell on a milky scalloped hem. Her spots are lights inside the jelly.
- **Rollo, the moon roller.** Six overlapping plates like a pangolin's, with gold light in every gap. Curled up, he is a small planet.
- **Glorp, the bubble-shell slug.** A lime jelly sea slug who carries a small galaxy in a glass flask and a lure on the end of his tail.
- **Skeet, the pond skimmer.** A navy dart with his head in a bubble, skating on six floats of light.
- **Boing, the spring-tail hopper.** A grasshopper crossed with a prawn. He has a plated back, a tail fan, hind thighs like coil springs, and a lantern on each knee.
- **Flick, the lantern-tail.** His tail is a glass flame full of lime light with a star in the middle, under a deep violet case hemmed in orange.
- **Whiff, the vent-back.** A shy mustard mound with three lit chimneys on his back, a dumpling jelly head, and two lantern feelers.
- **Moose, the coral stag.** Staghorn coral antlers with a lantern on every tip, over a dome like a night sky.
- **Barty, the oil-pearl roller.** A fan-shell clam on legs. His back is a fluted scallop shell with a pearl at the end of each rib. The game still colors his shell, so those parts are painted in greys.
- **Munch, the bead-chain grub.** A string of jelly beads with lights down its back. It sleeps in a glass pod and wakes as a sea angel.
- **Prim, the orchid blade.** A fan dancer with a folded pink fan along her back, which she throws open when she is flung. Her arms end in pink glass blades.
- **Twig, the reed-walker.** A jointed violet reed with a light at each joint and a pale bud for a head, on six glass stilts. Lying down, he is only the reed.
- **Wubbo, the moon bear.** A see-through pink jelly water bear. You can see his blue heart, and his mouth is a little horn.
- **Buzzby, the hover bumble.** A cloud of yellow fluff with two violet belts, a harmless pom of light for a stinger, and fan fins for wings.
- **Fiddle, the string-back.** A cricket whose folded wings grew into a lyre strung with light, which he plays with the shin of his hind leg.
- **Luma, the moon veil.** A moth whose wings together make one pale crescent moon with lit craters in it. Her feelers are plumes.

## What it covers beyond the bugs

The sources are in `src/sets/xeno/`.

| Folder or file              | What is in it                                                             |
| --------------------------- | ------------------------------------------------------------------------- |
| `bugs/`, `faces/`           | The sixteen bugs and a face kit, each ORA beside an unchanged `.rig.json` |
| `bugs/<bug_id>.lights.json` | Each bug's night lights                                                   |
| `colors.json`               | The colors the game still lays on a bug or draws beside it                |
| `items/`                    | 23 sheets with 147 painted items                                          |
| `backdrop/sky.json`         | The sky through the day and night                                         |
| `backdrop/world.json`       | A tone map for the world the game draws, and the pond's water             |
| `backdrop/*.ora`            | Twelve painted strips, a far and a mid layer for six areas                |

**Night lights.** A bug's lights file lists the points the game lights after dark. There are between 3 and 11 on a bug and 115 in all, each on one of its painted lights and in its glow color. The game adds them over the night tint, so a glim does not have to be painted brighter to show at night.

**Colors.** `colors.json` gives each bug its sleepy eyelid color and the main color the game uses for ripples, the puffs behind a flung bug, and the journal's portrait frame. It also holds Barty's two sheen colors, and the color and place of Flick's lantern, so the game's firefly glow lands on his painted star.

**Items.** Every item keeps the outline of the code-drawn one, because paint, bite marks, hats, and physics all follow that shape. What changes is what the thing is made of. Food is alive, so it is jelly or glass with one light in it. Junk and tools are dead shell with no light. Glass things are glass, and the marbles are small planets. Toys and instruments carry one light, at the part that does the work. Gold, a halo, and sparkles appear together only on the eleven treasures. Items have no night lights, because the game has none for items. After dark the bugs glow and the items do not.

**The sky.** The day sky is mint, `#6fd6cc` down to `#c6f6de`, and the night is indigo with an aqua glow along the horizon. The sun is Mama, peach-gold, and the moon is Pip, pale cyan. Clouds are pale pink, a few stars show all day, and the rainbow runs through seven of the glow colors. The two hidden areas get their own light: lilac in the Ant Hill Depths and mint in Gnome Hollow.

**The world's colors.** `world.json` has four tone rules. Greens become rose moss (`#5aa845` turns into `#cf6fa0`) and browns become violet (`#a8744f` turns into `#6a58b0`). Two smaller rules turn a teal to peach-gold and a pale blue-grey to lilac. Three shade rules restyle the greys under the porch, its soil and its shadows, which a rule that works by hue cannot reach. The pond is aqua at the surface and blue-violet below. The ground is pink for a practical reason too. The set's line is indigo, and an indigo or violet ground would swallow every outline.

**Strips.** The strips have no ink line. They are flat shapes in two or three tones, paler with distance and calmer than the bugs. Each has a `glow` layer of lights that come on after dark.

| Area              | Far                                                                                         | Mid                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Flowerbed Stage   | Glass dunes under the planet this moon circles, with three glass flowers the size of towers | A fan-coral hedge where the picket fence stood                  |
| Puddle Pond       | A cliff of tide pools spilling into each other, and a coral arch with a lantern hung in it  | Float kelp and sea whips along the far shore                    |
| Mossy Stump Plaza | Big round rose hills, coral towers, and one small lander far off                            | Tall bell flowers and jelly bulbs on stems                      |
| Under the Porch   | Humps of dead reef with cave mouths                                                         | Weeping whips with bead-tipped tendrils at the two ways in      |
| Compost Lab       | A stair of pools down a hill, with squirt pots puffing steam at its foot                    | Vent worms and bubbling flask pods                              |
| Treehouse Arcade  | A grove of giant tree coral with lantern pods                                               | Weeping whips and lilac kelp, most of it hidden behind the room |

## What stays as the game draws it

The set does not repaint everything. With it on, these still come from the game's code.

- 39 of the 186 items. The 34 potion bottles, the spring, the pinwheel, the paper boat, and the lattice have parts that move or change, so no set can paint them. The twig has no painting on a sheet either. The game draws it from Twig's `stick` layer.
- Every fixture, such as the sundial, the cauldron, the trash can, and the gnome. Fixtures keep the game's colors, because they share them with things that carry meaning, like potions and paint.
- Flower petals, rain, and the other weather particles.
- The UI, which is the menu, the journal, the pocket, the settings board, and the hand.
- The near and front layers, which are the ground, the soil, the grass, and the rooms. These are still the game's drawings. The tone map changes their colors and nothing else.
- The backgrounds of the two hidden areas. The Ant Hill Depths and Gnome Hollow have no strips. They get the tone map and their own light.

So a jelly bug with an indigo line can stand beside a code-drawn fixture with a plum line. Look at the tours below before deciding whether that seam bothers you.

## Rules it bends

All four are in `docs/06-art-guide.md`. Check the screenshots before copying any of this for a set of your own.

- **Flat colors (A2).** The guide asks for at most one shade and one highlight per color and no gradients. Storybook broke that with three hard bands. This set breaks it further with a ramp of thin bands, because jelly and glass cannot be drawn flat. The hard shapes over the ramp are what keep it from turning to mud at game size.
- **The outline (A2).** The guide's line is dark plum, `#2B1D2E`, about 24 px wide on the template. This set's is indigo and 7 to 11 px wide on the lit side, 1.55 times that on the shade side. Parts that are lights have no ink at all. Their edge is a deep tone of their own color.
- **The item outline (A9).** The guide suggests 16 to 20 px on the sheet. Items here take 7 to 9.
- **No glow on items (A9).** Food, toys, and treasures here have small painted lights. The night tint dims them with the rest of the item.

## How it was made

The method is Storybook's, at a larger scale. Python scripts worked out every shape, band of shading, and light from a description, turned them into painting commands, and sent those in batches to Krita through the `krita-cli` bridge (`~/.local/share/krita-cli/README.md`). Krita wrote every pixel and saved the layered ORA files itself. No image model was involved, and nothing was pasted in from outside Krita.

This is scripting, not drawing by hand, and most of it is not brush strokes either. The bridge's plugin runs inside Krita and has two painting commands. One fills a rectangle with solid color. The other draws a round soft stroke by stamping a soft dot along a line. Neither uses Krita's brush presets. The scripts cut each filled shape into rows of rectangles and use strokes for lines, dots, see-through washes, and halos.

The specs plan about 429,000 commands for the whole set: 111,000 for the bugs and the face kit, 111,000 for the item sheets, and 207,000 for the strips. About 404,000 of them are rectangles and 9,000 are strokes. The rest pick a layer or a color.

Some things were new this time.

- **One style guide and one shared paint library.** A painter described a part as a shape, a material, and some marks. The library gave it the set's shading, line, and glow, and showed a preview that repeats the bridge's arithmetic, so a painter could look before Krita painted anything.
- **Many agents in parallel.** Eight painters shared the bugs, six the item sheets, and three the strips. Each worked from the style guide and wrote one spec per bug, sheet, or strip.
- **Several Kritas on virtual displays.** Up to four ran at once, each with its own display, home folder, and bridge port, apart from the owner's Krita and desktop.
- **A private copy of the bridge plugin.** The stock plugin redraws the screen after every stroke, and that is where nearly all the time went. The copy redraws once per batch and skips the undo snapshot. The pixels are the same, and a bug paints in seconds. The owner's installed plugin was not changed.
- **Review passes.** One agent toured the cast in the game as art director, repainted Dot and Glorp as the reference, and wrote fixes that four more agents applied to the other fourteen bugs. A second reviewed all 147 items and changed 43 of them.

Each bug ORA started as a blank template, as Storybook's did: the same canvas, guides, rig stamp, and layer names, with every part and face layer empty. Item sheets and strips started from the templates that `pnpm art:item-templates` and `pnpm art:backdrop-templates` write. The layers are ordinary paint layers, so open the files in Krita and edit them like any other set. `pnpm art:build` turns them into the atlases in `src/renderer/art/sets/xeno/`.

The sources are large. They come to 38 MB, about seven times Storybook's, and the strips (21 MB) and item sheets (11 MB) are most of it. The built files are 6 MB.

The game could not draw items or a backdrop from art before this set. That part of the pipeline was built alongside it, and `docs/06-art-guide.md` (A7, A9, B14, B19 to B21) describes it.

## Checking it

These unit tests hold the set to its claims.

- `tests/unit/referenceArt.test.ts` checks every agent-made cast. Each bug must build with no report messages, carry all 28 of its own face pieces, and show only drawn parts and faces in every pose and expression at both atlas sizes.
- `tests/unit/itemPlan.test.ts` lists `xeno` as a finished item set. Every item a set may paint is painted, and the importer has nothing to say about any sheet.
- `tests/unit/backdropBuild.test.ts` builds every committed backdrop and fails on an error.
- `tests/unit/twigShape.test.ts` holds Twig's stick to the twig item's outline.
- `tests/unit/setLights.test.ts` and `tests/unit/setColors.test.ts` check that lights and colors name only parts and bugs that have them.

To check one file in a second or two:

```sh
pnpm art:check-one art/src/sets/xeno/bugs/bug_ladybug_dot.ora --strict
pnpm art:check-one art/src/sets/xeno/items/items_food_1.ora --strict
pnpm art:check-backdrop art/src/sets/xeno/backdrop --strict
```

For screenshots on a virtual display:

```sh
export BB_SHOTS_DIR=/tmp/bb-xeno
pnpm shots -g 'Alien planet cast'
pnpm shots -g 'Alien planet night'
BB_ART_SET=xeno pnpm shots -g 'item art'
BB_BACKDROP_SET=xeno pnpm shots -g 'backdrop tour'
BB_SHOTS_SET=xeno pnpm shots -g 'areas.spec'
```

- The cast tour saves each bug's pose and expression grid at 1x and 2x, the poses the game draws large, and the paint and night looks, as `xeno-*.png`.
- The night tour puts each bug on the plaza after dark, held and then left alone, with its lights on (`xeno-*-night-held.png`, `-night-world.png`).
- The item tour lines up every sheet beside the code-drawn items, with paint on them, bitten, and at night (`itemart-*.png`).
- The backdrop tour shows every area by day, at dusk, at night, and in rain, and every seam (`backdrop-*.png`).
- The last line runs the areas tour with the whole set on: bugs, items, sky, strips, and tone map together (`130-` to `179-`). `BB_SHOTS_SET` works with any other tour that does not pick its own art.

On the virtual display the game draws at half resolution and scales it up, so these screenshots are softer than the game on a real graphics card.

## The tooling

The paint library, the spec for every bug, sheet, and strip, the style guide, the painters' briefs, and the review notes are not in the repo. They are on the owner's machine in `~/.local/share/bugglebrook-art-tooling/xeno-2026-10/`, with a README that says what each file is. A spec is the real source of its painting. Seeds come from the names of the bug and the part, so running a spec again gives the same brush commands.
