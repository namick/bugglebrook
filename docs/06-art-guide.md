# Bugglebrook art guide

This is two documents in one. Part A is for the artist who hand-draws the bugs, the items, and the world behind them in Krita. Part B is the spec engineers build the art pipeline against.

The game draws everything in code by default. The owner approved hand-drawn replacements in `00-decisions.md`. Players choose a named art set in Settings. A set can supply bugs and their faces (A3 to A6), its own colors and night lights for those bugs (A3), items (A9), and a backdrop: a sky, painted hills and big plants, and new colors for the ground (A7). Every piece is optional. Whatever a set has not drawn stays as the game draws it, one bug, one item, and one stretch of background at a time.

Krita facts below were checked on 2026-10-01 against the Krita site, the Krita manual, and Krita's own source code. Where a detail could not be confirmed, the guide says so and gives an instruction that works either way.

---

# Part A: For the artist

Hi! This part is for you. It explains how your drawings become living bugs, how to set up Krita, and exactly what to draw. You don't need to know any code. Where a word sounds technical, it's explained the first time it shows up.

## A1. How your drawing becomes a living bug

The bugs in Bugglebrook move with **cutout animation**. Think of a paper puppet: you cut the body, the head, and each leg out of paper, pin them together at the joints, and wiggle the pins. The game does the same thing with your drawings. You draw each piece on its own layer, and the game moves the pieces every frame.

Each piece turns around a **pivot**, which is the pin. A leg's pivot is at the hip, so the leg swings from the hip. The shell's pivot is at its hinge, so it flips open from there.

Here's how the work splits:

| You decide | The code animates |
|---|---|
| What every piece looks like: shape, colors, line, shading, spots, fuzz | Walking, running, hopping, flying, swimming, being thrown, landing |
| What each face looks like: every eye shape and every mouth shape | Squash and stretch (bugs flatten when they land and stretch when they fly) |
| The bug's personality in its proportions and details | Blinking, eyes following the hand, mouths chewing, antennae wobbling on springs |
| How the special forms look: Rollo's ball, Glorp in his shell, Munch's cocoon and butterfly | Which face and form to show, and when |
| | Colors added on top: paint splotches, potions, wet, frozen, night time |

So you never draw a walk cycle or animation frames (with two small exceptions, the chewing and wobbly mouths, which have two drawings each). You draw one good still version of every piece, and the game brings it to life.

Every bug faces **right** in your drawing. The game flips it when it walks left.

## A2. Setting up Krita

### Which Krita

Use **Krita 5.3** (5.3.4 or newer). Krita 5.3.0 and 6.0.0 came out together on March 24, 2026, with the same features. 6.0 is the new version built on a newer toolkit, and Krita's team called it more experimental at launch. 5.3.4 and 6.0.4 came out on September 15, 2026. Either one saves files the same way, so if 6.0 already works well on your computer, that's fine too.

### Canvas, resolution, and color

You won't make a canvas yourself. Each bug comes as a ready-made **template file** with the canvas set up (section A3). For the record, here's what's in it, so you know not to change it:

- **Size.** The template is drawn at **4 times game size**. In the game, 1 meter is 100 pixels on a 1080p screen, and Dot is 1 meter across, so she's about 100 pixels wide on screen. On your template, she's about 400 pixels wide. Drawing big lets the game shrink your art down for normal screens and keep it crisp on 4K screens and when a bug drinks the giant potion.
- **Don't resize the canvas or the image.** Image > Scale Image and Image > Resize Canvas will break where the pieces line up. If you need more room, ask.
- **Resolution (DPI or PPI).** This only matters for printing. The template says 300 ppi. Ignore it. Only the pixel size matters.
- **Color.** RGB/Alpha, 8-bit integer, sRGB (Krita's default profile is `sRGB-elle-V2-srgbtrc.icc`). That's what the template is set to. Don't switch to 16-bit or a wide-gamut profile. The game shows sRGB colors, so anything else would look different in the game than in Krita.

**Seeing game size.** Zoom Krita to **25%** to see your bug at its real size on a 1080p screen. At 50% you see it as a 4K screen shows it. Check at 25% often. If a detail disappears at 25%, it's too small.

### Brushes

Start with Krita's built-in brushes. They're good, and you can change later.

- **Lines:** `d) Ink-2 Fineliner` or `d) Ink-3 Gpen`. Both make clean ink lines that thin a bit with less pressure.
- **Flat color:** the Fill tool (`F`) on the layer under or with your lines, or `b) Basic-5 Size` to paint fills by hand. In the Fill tool's options, set **Grow selection** to 2 or 3 pixels so the color tucks under the line and leaves no white gap.
- **Shading and highlights:** `b) Basic-5 Size` with hard edges. Keep shading as flat shapes, not soft airbrush.
- **Erasing:** press `E` to make any brush erase.

If brush names look different in your version, pick any hard, round ink brush. Hard edges matter more than which brush you use.

### Stabilizer (for smooth lines)

The stabilizer smooths out the wobble in your hand. Find it in **Tool Options** while the Freehand Brush tool (`B`) is selected, under **Brush Smoothing**. Krita's manual describes four modes: None, Basic, Weighted, and Stabilizer.

Good starting settings for line art:

| Setting | Start at | What it does |
|---|---|---|
| Brush Smoothing | Stabilizer | Averages your movement. The line trails behind your pen a little. |
| Distance | 30 to 50 | Higher is smoother but slower to follow. Go higher for long curves, lower for small details like eyes. |
| Delay | On, about 20 to 40 | A small "dead zone" around the pen. Lets you make sharp corners on purpose. |
| Finish line | On | Finishes the line to where your pen lifted, so the end doesn't fall short. |
| Stabilize Sensors | On | Smooths pressure too, so line thickness doesn't jump. |
| Scalable distance | On | Keeps the smoothing feeling the same when you zoom. |

For sketching, switch to **Weighted** smoothing or **None**. Sketch fast, ink slow.

Another trick: draw long curves zoomed out and with your whole arm, then zoom in to clean up.

### Line weight and style

Bugglebrook looks like flat cut-paper toys: chunky dark outlines, round friendly shapes, bright colors. Here's how to match it on the template (which is 4 times game size):

| Line | On the template | In the game (1080p) |
|---|---|---|
| Main outline around every piece | about 24 px | 6 px |
| Legs, if you draw them as thick lines | 18 to 24 px | 4.5 to 6 px |
| Inner lines: plate seams, mouth lines, eyelashes | 12 to 16 px | 3 to 4 px |
| Tiny details: hairs, spots' edges | at least 8 px | 2 px |

- **Outline color** is a dark plum, `#2B1D2E`, not pure black. The whole game uses it. Make it a color swatch.
- **Round shapes.** Round the corners. Round the ends of lines. Even pointy things (Prim's head, Whiff's shield) have softened tips.
- **Flat colors, at most one shade and one highlight per color.** A shade is a darker, slightly cooler version of the color in a flat shape on the lower or back side. A highlight is a white or very light shape near the top front, like the shine streaks the game draws now. No gradients, no textures, no soft airbrush. Those turn to mud when the game shrinks your art.
- **Light comes from the top front** (top right, since bugs face right). Put highlights there.
- **Readable at small size.** Every bug must be recognizable as a silhouette at 25% zoom. Big head, clear body shape, a few bold details beat many small ones.
- **Cute but weird, not babyish.** The players are about 13. Think funny and a little strange, not cuddly-baby. Odd proportions, a bit of attitude, a weird detail (Moose's gentle eyes under enormous antlers, Whiff's permanent apologetic eyebrows). No pastel-soft-everything, no giant shiny anime sparkles.
- **Use each bug's colors.** The per-bug table in A4 gives the colors the game uses now. You can change them, but tell us, because other parts of the game (thought bubbles, the bug scope) use the same colors.

## A3. The template workflow

### Choosing and adding an art set

Open the pause board or the main menu's gear. Use the arrows beside **Art** to choose **Original bugs**, **Krita reference**, **Storybook**, or another installed set. The selected artist credit appears below the set name. The choice applies at once to everything the set has: the bugs, the items (the ones in the pocket too), and the sky and world behind them. It stays selected after restarting. It is a machine setting, shared by all save slots. Changing it does not change the bugs or their saved game state.

The Krita reference set is agent-created reference artwork, separate from the daughter's drawings. Its sources stay in `art/src/bugs/` and `art/src/faces/`. Storybook is a second agent-created set in a shaded style, kept in `art/src/sets/storybook/` and described in `art/STORYBOOK-SET.md`.

To start a separate set, choose a lowercase ID with underscores, for example `garden_drawings`:

```sh
pnpm art:templates --set garden_drawings
```

This creates empty templates under `art/src/sets/garden_drawings/bugs/` and `faces/`, plus `set.json`. Edit that small file to name the set and credit its artist:

```json
{
  "name": "Garden drawings",
  "credit": "Drawn by the artist's name"
}
```

A set's folder can hold all of this. Only `set.json` is required, and you can add the rest in any order:

| In `art/src/sets/garden_drawings/` | What it is | Where to read |
|---|---|---|
| `set.json` | The set's name and its artist's credit | above |
| `bugs/<bug_id>.ora`, `faces/face_kit.ora` | The bugs and their faces | the rest of A3, A4 to A6 |
| `colors.json` | Your colors for the few things the game tints on a bug | just below |
| `bugs/<bug_id>.lights.json` | Spots on a bug that glow after dark | just below |
| `items/items_<group>_<n>.ora` | Painted items, a few to a sheet | A9 |
| `backdrop/` | The sky, the far and mid strips, and the world's colors | A7 |

If your bugs are different colors from the originals, add a `colors.json` beside `set.json`. The game tints the sleepy eyelid and Barty's shell itself, and draws a few things beside a bug in its main color. Without the file it uses the original bugs' colors for those. With it, you choose them:

```json
{
  "bugs": {
    "bug_ladybug_dot": { "lid": "#2a3a60", "body": "#3c8fe8" }
  }
}
```

The keys are `lid` (the sleepy eyelid), `body` (the bug's main color), `sheen` (two colors Barty's shell shimmers between), and `glow` (Flick's light at night). Leave out any you don't need. Section B19 has the details.

The game shines Flick's light on the tip of his tail, where the original lantern is. If you paint his lantern somewhere else, say where with `lantern`, using the spot's place on his template: `"bug_firefly_flick": { "glow": "#d8ff4f", "lantern": { "x": 232, "y": 540 } }`.

If parts of your bugs should glow in the dark, don't paint the glow brighter. The game darkens the whole bug at night. Instead, list the glowing spots in a file beside the bug's drawing, `bug_ladybug_dot.lights.json`, and the game lights them after dark. Section B20 shows how.

Draw in those templates using the same layer names, canvas and pivots described below. Save each ORA next to its `.rig.json`. You can finish one bug at a time. The set uses its own face kit and per-bug faces; it never borrows another artist's drawings. Missing, empty or broken bug art uses the original code-drawn bug. Missing face pieces use the code-drawn face. Items and the backdrop fall back the same way, one item and one strip at a time.

```sh
pnpm art:build
pnpm art:check
pnpm art:watch --set garden_drawings bug_ladybug_dot
```

Build and check process every set, and everything in it: bugs, colors, lights, items, and the backdrop. Watch opens the Art Lab for the chosen set and updates it when you save a bug in Krita. Commit the sources, `set.json`, and the generated `src/renderer/art/` files together. The built game offers all sets in its catalog; copying an ORA into an already installed game does not add a set until the game is rebuilt.

`pnpm art:templates --set garden_drawings --refresh-guides` refreshes that set's guides while keeping its drawings. Without `--refresh-guides`, existing drawings are kept and fresh comparison templates go to `art/templates/sets/garden_drawings/`.

If a selected set is removed in a later build, the game uses the original bugs and Settings displays "Unavailable set". Use either arrow to choose an installed set. The saved ID is retained so the selection works again if the set returns.

### What you get

For each bug, you get one template file, for example `bug_ladybug_dot.ora`. **ORA** (OpenRaster) is an open file format for layered pictures. Krita opens and saves it like its own `.kra` files. It's a zip of PNG pictures plus a list of the layers, which is easy for our tools to read.

When you open a template, the Layers docker looks like this (top of the list is in front):

```
guides                    (group, locked)
  guide_notes             what this bug needs, written on the canvas
  guide_safe              the safe box and the ground line
  guide_pivots            a dot and a label at every joint
  guide_current           the bug as the code draws it now, faint
parts                     (group)
  antenna_tip             empty, for you
  antenna                 empty
  shell                   empty
  head                    empty
  belly                   empty
  leg_lower               empty
  leg_upper               empty
  wing                    empty
face                      (group, often empty: see "The face kit")
```

- **`guide_current`** is the bug as the game draws it today, at low opacity. Trace it, ignore it, or change the design. It shows where the pieces sit.
- **`guide_pivots`** shows every joint as a dot with a name. A leg drawing must start at its hip dot. An antenna must start at its base dot.
- **`guide_safe`** shows a box. Keep everything inside it. The horizontal line is the ground: the bug's feet touch it.
- **`guide_notes`** lists what that bug needs, in plain words.
- The **part layers** are empty and already named and in the right front-to-back order. Draw each piece on its own layer.

### Drawing in the template

1. Pick a part layer, for example `head`.
2. Draw the head there, lines and color together.
3. Draw the next part on the next layer.
4. Save with `Ctrl+S`. Krita asks if you're sure you want to save as ORA. Say yes.

**Draw pieces whole, as if the piece in front weren't there.** If the head is partly hidden behind the shell, still draw the whole head. When the shell lifts to fly, the hidden part shows.

**Overlap at joints.** Where two pieces meet, let the back piece run past the joint, about a quarter of its width, and round its end. When the joint bends, the overlap hides the gap. The leg's top end should be a rounded nub that sits under the body. Same for the knee: the top of `leg_lower` is a round end that tucks under `leg_upper`.

**One leg, many legs.** You draw one upper leg and one lower leg. The game uses them for every leg, and draws the far side's legs a bit darker and behind the body. Draw the leg straight down, hip at the top, as the template shows.

**Antennae and eye stalks are drawn straight.** Draw `antenna` as a straight strip pointing up from its base dot. The game bends it into a curve and wobbles it. Put any ball, club, or fan on the end in `antenna_tip`.

### Layer name rules

The game finds your pieces by their layer names, so the names matter more than anything else.

- **Keep every name exactly as it is in the template.** Lowercase, underscores, no spaces. `leg_upper`, not `Leg Upper` or `leg upper`.
- **Don't rename, delete, or merge part layers.** Merging two layers (Merge Down, `Ctrl+E`) turns two pieces into one, and the game can't move them separately anymore.
- **Hiding a layer is fine.** The game uses hidden part layers too. Hide whatever you like while you work.
- **You can turn any part into a group.** If you like lines and colors on separate layers, make a group with the part's exact name (`head`) and put any layers you like inside: `lines`, `color`, `shade`, anything. The game flattens the group into one piece. Inside a group you can use **Normal** and **Multiply** blend modes and **Inherit Alpha** (Krita's "only paint inside the layer below" trick, the little alpha icon on the layer). Other blend modes won't come through. If you need one, merge it into a plain layer first.
- **Anything named `guide...` is ignored.** Make your own sketch layers and name them `guide_sketch`, `guide_ideas`, and so on. They're safe and never show up in the game.
- **Layers with unknown names make a warning** (section A5 tells you where you see it). Rename sketches to `guide_something` and the warning goes away.

### What ORA keeps and what it loses

ORA is simpler than Krita's own `.kra` format. Here's what happens when you save to ORA, checked in Krita's source code:

| Thing | Kept in ORA? |
|---|---|
| Paint layers, their names, order, and pixels | Yes |
| Groups, with names | Yes |
| Hidden layers (stay hidden) | Yes |
| Layer opacity | Yes. Keep part layers at 100% unless you mean it. |
| Blend modes | Mostly yes, saved by name. The game only understands Normal, Multiply, and Inherit Alpha (see above). |
| Inherit Alpha | Yes, saved as a blend mode the game understands. |
| Canvas size | Yes |
| Masks (transparency, filter, colorize) | **Baked in.** The layer is saved as it looks with the mask applied, and the mask itself is gone when you reopen the file. |
| Vector layers | **Turned into pixels.** They come back as normal paint layers. |
| Filter layers (adjustment layers) | **Lost.** Krita's ORA saver does not put them in the file. |
| Fill layers, clone layers, file layers | Saved as plain pixels. |
| Layer styles (drop shadow, stroke) | Don't count on them. Not confirmed either way. |
| Locks, color labels, and other Krita extras | Lost or not used. |

So the simple rule is: **draw on plain paint layers**, and the ORA file is all you need. Save straight to `.ora` with `Ctrl+S`.

If you love masks, vector layers, or filter layers, keep a `.kra` working copy too. Work in `bug_ladybug_dot.kra`, and when you want to see it in the game, use **File > Export** and save over `bug_ladybug_dot.ora`. Krita bakes everything into the ORA for you. Just remember the `.kra` is your real file then, and don't open the `.ora` to keep working.

### The face kit

Faces are drawn once and shared. There's one extra template, `face_kit.ora`, with every eye shape and every mouth shape. The game uses the kit on every bug, sizing the eyes and mouth to fit each head. Draw the kit once, and all sixteen bugs get your faces.

If a bug needs its own version of a face piece (Twig's tiny sleepy eyes, Dot's mouth drawn in light pink on her dark head), put a layer with the same name in that bug's `face` group. A face piece in a bug's own file wins over the kit.

## A4. The part list

### Words used below

- **Near and far.** Bugs are seen from the side. The near legs, antenna, and eye are on our side. The far ones are behind the body. You draw one of each. The game makes the far one smaller and darker.
- **Form.** A whole different body shape the bug turns into, like Rollo's ball. Forms get their own layers.
- **Tintable.** A piece drawn in light greys instead of colors, so the game can color it while the game runs. The game multiplies your greys by a color: white becomes the color, mid grey becomes a darker version of it, and the dark outline stays dark. Use light greys (about `#C8C8C8` to `#FFFFFF`) for the colored areas, a slightly darker grey for shade, white for highlights, and the usual dark outline. Tintable layers end in `_tint`.

Most color changes don't need tintable art. Paint splotches, potions (rainbow, frosty, ghost), wet, frozen, hot, and the night-time blue are all laid over your full-color drawing by the game. Only parts that change their main color all the time need `_tint` versions. Right now that's Barty's shimmery shell and the sleepy eyelid in the face kit.

### General part names

| Layer name | What it is | Pivot (the pin) |
|---|---|---|
| `body` | The main body. For most bugs this is the big shape the paint lands on. | Center of the bug |
| `belly` | The underside, drawn behind the body | Center |
| `head` | The head, without eyes or mouth. Leave the face area plain. The game draws the face on top. | Neck |
| `shell` | Wing covers or a hard back that can open or move on its own | Hinge |
| `wing` | One see-through flying wing. The game draws it twice and flaps it. | Wing root |
| `leg_upper` | Hip to knee. Round nub at the hip end. | Hip |
| `leg_lower` | Knee to foot, with the foot. Round nub at the knee end. | Knee |
| `antenna` | One feeler, drawn straight, pointing up from the base | Base |
| `antenna_tip` | A ball, club, comb, or fan at the end of the feeler | Tip of the feeler |
| `antenna_base`, `antenna_end` | For feelers with an elbow: the part before the bend and the part after | Base, elbow |
| `tail` | Tail pieces that stick out (prongs, horns, a lantern) | Where it joins |

Parts that only one bug has are listed with that bug below.

### The face kit layers (`face_kit.ora`)

The game has 10 eye shapes plus blinking, and 13 mouth shapes. The kit has 28 layers. Each eye is drawn once, as the near eye. The game makes the far eye from it.

**Eyes and brows (13 layers)**

| Layer | Used for | Notes |
|---|---|---|
| `eye_white` | The open eye, also wide-eyed and dizzy | A round or oval white with outline. The game squashes it to half-close and blink. For "wide", it draws it 12% bigger. |
| `eye_pupil` | The pupil, with its little shine | The game slides it around inside `eye_white` to follow the hand. Keep it a separate round shape. |
| `eye_closed` | Blinks and sleeping | A curved lash line |
| `eye_happy` | Happy, giggling | An upside-down U arc |
| `eye_squint` | Concentrating, giggling hard | A sideways `>` |
| `eye_squeezed` | Grossed out, yuck | Squeezed shut like `> <` in one eye |
| `eye_spiral` | Dizzy | Just the spiral, drawn inside a circle the size of `eye_white`. The game puts it over `eye_white` and spins it. |
| `eye_heart` | In love, loves a food | A heart that replaces the eye. The game makes it beat. |
| `eye_sleepy_lid` | Sleepy, groggy | **Tintable.** The heavy upper eyelid that covers the top half of the eye. The game colors it to match each bug's head. |
| `brow_angry` | Angry, hates something | A heavy brow slanting down toward the front of the face |
| `brow_worried` | Worried, scared, sad | A brow slanting up toward the front |
| `brow_polite` | Whiff's apologetic brows | Inner ends raised. Whiff wears these nearly all the time. |
| `cheek` | Blushing | A pink oval. The game shows it soft most of the time and strong when a bug blushes. |

**Mouths (15 layers for 13 shapes)**

| Layer | Used for |
|---|---|
| `mouth_smile` | Content, the everyday face |
| `mouth_grin` | Big happy grin, open, with a bit of tongue |
| `mouth_o` | Surprised "oh" |
| `mouth_whee` | Thrown and loving it, a big open shout |
| `mouth_aah` | Wide open, waiting to be fed. The game pulses it. |
| `mouth_chew_1`, `mouth_chew_2` | Chewing. Two drawings, the game flips between them. |
| `mouth_wobble_1`, `mouth_wobble_2` | Wobbly, nervous, woozy. Two drawings. |
| `mouth_flat` | Unimpressed, deadpan |
| `mouth_frown` | Sad, hungry, grumpy |
| `mouth_lick` | Yum: a smile with the tongue licking one corner |
| `mouth_tongue` | Bleh: a wavy mouth with the tongue sticking out |
| `mouth_teeth` | Gritted teeth, hates it |
| `mouth_puff` | Cheeks puffed, holding something awful in |

Keep **yum** (lick), **love** (heart eyes), **yuck** (squeezed eyes, tongue out, green face), and **hate** (angry brows, gritted teeth, steam) clearly different. The game relies on players telling them apart without words.

The green "grossed out" and red "too hot" washes over the face, the steam puffs, and the dizzy stars are added by the game. You don't draw those.

### Per-bug table

Size on screen is how wide the body is on a 1080p screen. The template canvas is 4 times bigger and has room for legs, antennae, and every form. The template generator measures the exact canvas, so these numbers are close, not final.

| ID | Name | What | On screen | Template canvas (about) | Part layers | Special forms |
|---|---|---|---|---|---|---|
| `bug_ladybug_dot` | Dot | Ladybug | 100 px | 1280 x 1280 | 8 | Shell opens and wings come out to fly and glide |
| `bug_pillbug_rollo` | Rollo | Pill bug | 92 px | 1152 x 1152 | 9 | Curls into a ball (also when asleep) |
| `bug_snail_glorp` | Glorp | Snail | 112 px | 1408 x 1408 | 4 | Hides in his shell |
| `bug_waterstrider_skeet` | Skeet | Water strider | 100 px | 1280 x 1280 | 7 | None (legs pose for skating and parachuting) |
| `bug_grasshopper_boing` | Boing | Grasshopper | 100 px | 1280 x 1280 | 7 | None (hind legs fold and kick) |
| `bug_firefly_flick` | Flick | Firefly | 80 px | 1024 x 1024 | 10 | Shell opens to fly; tail glows at night |
| `bug_stinkbug_whiff` | Whiff | Stink bug | 88 px | 1152 x 1152 | 8 | None (the stink cloud is the game's) |
| `bug_stagbeetle_moose` | Moose | Stag beetle | 160 px | 1920 x 1920 | 9 | Stuck on his back; lifts things overhead |
| `bug_dungbeetle_barty` | Barty | Dung beetle | 104 px | 1280 x 1280 | 11 | Tucks into a ball; walks backward rolling things |
| `bug_caterpillar_munch` | Munch | Caterpillar | 92 px | 1408 x 1408 | 15 | Cocoon; butterfly |
| `bug_mantis_prim` | Prim | Praying mantis | 120 px | 1536 x 1536 | 10 | Karate poses; wings open when thrown |
| `bug_stickinsect_twig` | Twig | Stick insect | 130 x 14 px | 768 x 512 | 4 | Disguised as a twig |
| `bug_bee_buzzby` | Buzzby | Bumblebee | 84 px | 896 x 768 | 8 | Wings blur when she flies |
| `bug_cricket_fiddle` | Fiddle | Cricket | 92 px | 1152 x 1408 | 9 | Bows one back leg across the other to play |
| `bug_moth_luma` | Luma | Moth | 92 px | 1152 x 896 | 8 | Wings beat slowly when she flies |

The first five are the **starting cast**. The other ten are found during play.

Below, the layers are listed back to front, the order they're in on the template.

#### Dot the ladybug (`bug_ladybug_dot`)

Colors now: shell `#E8453C`, spots and belly `#2B1D2E`, head `#3A2A40`.

- `wing`: see-through flying wing. Light and a bit translucent is good (ORA keeps transparency).
- `leg_upper`, `leg_lower`: six thin dark legs with little round feet.
- `belly`: the dark underside.
- `head`: round, dark.
- `shell`: the red dome with black spots and a shine. Pivot at the hinge at the front. It swings up and back to fly.
- `antenna`, `antenna_tip`: two thin feelers with round knobs.

Face: her head is dark, so line-only mouths need a light pink line (`#FFB3C6`). Put these in her `face` group: `mouth_smile`, `mouth_chew_1`, `mouth_chew_2`, `mouth_wobble_1`, `mouth_wobble_2`, `mouth_flat`, `mouth_frown`. Her eyelids are her head color.

#### Rollo the pill bug (`bug_pillbug_rollo`)

Colors now: body `#8E95A3`, belly `#C3C8D1`, plate seams `#6C7282`.

- `tail`: the little tail prongs.
- `belly`: pale underside.
- `body`: the domed back with seven plates.
- `head`: round, pale face poking out at the front.
- `leg_upper`, `leg_lower`: tiny legs. He has fourteen, seven on each side.
- `antenna_base`, `antenna_end`: bent feelers.
- `ball`: **form.** Rollo curled into a ball, plates wrapping round. No face showing. Pivot in the middle: the game rolls it.

#### Glorp the snail (`bug_snail_glorp`)

Colors now: body `#C8E07A`, shell `#9B6BD6` with a white spiral.

- `body`: the whole soft body, foot and head in one piece.
- `shell`: the round shell on his back.
- `stalk`: one eye stalk, drawn straight up. The game uses it twice, bends it, and puts the eyes at the tips. Stalks droop when he's sleepy.
- `shell_closed`: **form.** Just the shell, with a dark opening at the front. The game puts two small eyes in the opening.

He has no legs. The ripples along his foot and his slime trail are the game's.

#### Skeet the water strider (`bug_waterstrider_skeet`)

Colors now: body `#3B4A5C`, underside `#55708F`, sheen `#7FD3FF`.

- `leg_long_upper`, `leg_long_lower`: the long middle and hind legs.
- `leg_upper`, `leg_lower`: the two short front legs.
- `body`: long, slim, fatter at the front.
- `head`: small and round.
- `antenna`: long feelers sweeping forward.

His legs spread like a parachute when thrown and row on the water. The game poses the same pieces for all of it, so make the long leg pieces look good at many angles. The little dimples on the water under his feet are the game's.

#### Boing the grasshopper (`bug_grasshopper_boing`)

Colors now: body `#8BD13F`, belly `#FFD84D`, wing `#5F9E2A`.

- `hindleg_thigh`: the big, thick back thigh.
- `hindleg_shin`: the thin shin and foot. Folded under him standing, kicked straight out mid-hop, dangling when held.
- `leg_upper`, `leg_lower`: four small front legs.
- `body`: long, with a yellow belly stripe, segment lines, and a folded wing along the back.
- `head`: big and round.
- `antenna`: very long, springy feelers.

Boing's grin is wide and low on his head. The game sizes the kit's mouths bigger for him.

#### Flick the firefly (`bug_firefly_flick`)

Colors now: body `#2B2438`, cap `#E85A2E`, lantern `#D8FF4F`.

- `tail`: the big tail lantern. Draw it in daylight colors. At night the game adds the glow.
- `wing`: see-through flying wing.
- `leg_upper`, `leg_lower`: six legs, like Dot's.
- `belly`: dark underside.
- `head`: dark head.
- `cap`: the red-orange cap over the head.
- `shell`: dark wing covers, hinged at the front, open to fly.
- `antenna`, `antenna_tip`: feelers with knobs.

Face: dark head, so the same pink line-only mouths as Dot go in his `face` group.

#### Whiff the stink bug (`bug_stinkbug_whiff`)

Colors now: shield `#8A8F3C`, belly `#C9C98A`, dots `#E88A2E`.

- `belly`: pale underside.
- `head`: small, tucked under the shield's shoulder.
- `shield`: the shield-shaped back with the row of orange dots and freckles.
- `leg_upper`, `leg_lower`: six legs.
- `antenna_base`, `antenna_end`, `antenna_tip`: jointed feelers drooping politely forward.

He always wears `brow_polite` and a light blush. If you want brows only he has, draw `brow_polite` in his `face` group. His green stink cloud is the game's.

#### Moose the stag beetle (`bug_stagbeetle_moose`)

Colors now: shell `#5A2A1E`, belly `#7A3A26`, shine white.

- `antler`: one antler mandible: the big crescent beam, a forward tine, and a small inner tooth. The game draws it twice: the far one smaller and darker, behind the head.
- `belly`: the underside.
- `shell`: big and glossy, with the white shine stripe.
- `thorax`: the plate between shell and head.
- `head`: the head between the antlers.
- `leg_upper`, `leg_lower`: six sturdy legs.
- `antenna_base`, `antenna_end`: elbowed feelers. Put the little comb on `antenna_end`.

On his back, the game flips his body over and keeps his head upright, and his legs wave. You don't draw a separate upside-down Moose. Small, kind eyes: the game draws the kit eyes small on him.

#### Barty the dung beetle (`bug_dungbeetle_barty`)

His shell shimmers from teal to violet as he moves, so three parts are tintable. The game slides the colors over them while he walks.

- `belly`: violet underside, full color.
- `hindleg_thigh`: thick back thigh with little spikes and a metallic stripe.
- `leg_upper`, `leg_lower`: the thinner legs.
- `shell_tint`: **tintable.** The round shell with its grooves, in greys. Keep the grooves and the shading.
- `thorax_tint`: **tintable.** The plate between shell and head.
- `head_tint`: **tintable.** The broad, flat shovel head with three teeth at the front.
- `shine`: optional, full color. Highlights that should stay white when the shell is tinted.
- `antenna`, `antenna_tip`: short feelers with fan-shaped clubs (three little leaves).
- `ball_tint`: **form, tintable.** Barty tucked into a shiny ball, shovel tucked in, eyes squeezed shut. Draw the shut eyes into it.

His dung ball is an item, not part of him. It comes later with the items.

#### Munch the caterpillar (`bug_caterpillar_munch`)

Colors now: body `#7CCB4A`, spots `#FFE066`, tail horn `#FF9F1C`. Butterfly wings orange and teal.

Caterpillar:

- `tail_horn`: the little orange horn at the back.
- `foot`: one stub foot. The game puts them under every segment.
- `true_leg`: one tiny dark front leg.
- `segment_a`, `segment_b`: one round body segment each, with yellow spots. The game lines up six, alternating a and b, and shrinks the last two. Draw them the same size and shape so they line up in a row.
- `head`: the round head.
- `antenna`, `antenna_tip`: short feelers.

Paint lands on each segment separately, so keep the segments' lower halves fairly plain.

Cocoon (**form**):

- `cocoon`: an upright, silk-wrapped teardrop with a window near the top. Fill the window with his light green skin and leave it plain: the game draws his sleeping face (shut eyes and a small smile, from the face kit) on it. The thread it hangs from is the game's.

Butterfly (**form**), still clearly Munch:

- `bf_wing_hind`: the back wing, teal with an orange eye-spot.
- `bf_wing_fore`: the big front wing, orange with a teal edge and white dots.
- `bf_leg`: one thin leg.
- `bf_body`: slim striped abdomen and fuzzy thorax.
- `bf_antenna`, `bf_antenna_tip`: long feelers with clubbed tips.

The butterfly uses his caterpillar `head` and face. The game draws each wing twice (near and far) and flaps them.

#### Prim the praying mantis (`bug_mantis_prim`)

Colors now: body `#6FE36F`, belly `#C6F7A8`, darker green `#3FAE4A`.

- `wing_open`: **form piece.** Wings spread, shown when she's thrown.
- `leg_upper`, `leg_lower`: four long walking legs, knees high like stilts.
- `abdomen`: the long, leaf-shaped body with a pale belly and segment lines.
- `wing_folded`: folded wings along her back.
- `neck`: the long neck up to the head.
- `head`: the triangle head. Eyes go at the two top corners (huge), mouth at the point (tiny).
- `arm_thigh`: the thick front arm with spines on the inside edge.
- `arm_blade`: the slim blade with a hooked tip.
- `antenna`: long feelers sweeping back.

Her arms fold like praying hands, punch out for karate, and swing loose when held. The game does all of those with the two arm pieces. The swoosh on a chop is the game's.

#### Twig the stick insect (`bug_stickinsect_twig`)

Colors now: stick `#8B6A45`, lighter `#B08A5C`.

- `leg_upper`, `leg_lower`: six very thin legs.
- `stick`: his body. **He must look exactly like the plaza's twig item.** He hides by lying among real twigs. The game uses your `stick` drawing for the twig item too, so the disguise keeps working. Keep the twig's shape from the guide: the bar and its two nubs, to within 16 pixels. A twig's paint and what it touches follow that shape whatever you draw, so a curl or a knob past it hangs in the air. The importer warns when the drawing leaves the shape.
- `antenna`: two thin feelers off the front end.

Face: tiny, heavy-lidded eyes and a very small, flat mouth. If the kit's eyes look too big even when shrunk, draw `eye_white`, `eye_pupil`, and `eye_closed` in his `face` group.

#### Buzzby the bumblebee (`bug_bee_buzzby`)

Colors now: body `#FFD23F`, stripes, legs, and stinger `#2B2438`, head a creamy yellow.

- `wing`: one tiny see-through wing, pointing up from its root dot. The game draws it twice, folded back at rest and beating fast (a blur) when she flies.
- `leg_upper`, `leg_lower`: six short dark legs. They tuck up when she flies.
- `stinger`: the blunt little nub at the back. Not pointy: she's a friendly bee.
- `body`: round and fuzzy (a tufted outline), with three black stripes across the back half.
- `head`: round and creamy yellow.
- `antenna`, `antenna_tip`: short feelers with round knobs.

She's small and busy, so keep her round: she should read as a fuzzy ball with a face.

#### Fiddle the cricket (`bug_cricket_fiddle`)

Colors now: body `#6B4226`, head and belly stripe `#9A6A44`, beret and wing veins `#2B1D14`.

- `hindleg_thigh`: the thick, drumstick-shaped back thigh, rising to a high knee.
- `hindleg_shin`: the long, straight shin, drawn like a violin bow: a dark stick with a pale line of "hair" beside it and a little knob (the frog) by the knee.
- `leg_upper`, `leg_lower`: four small front legs.
- `abdomen`: the long, low body with two little tail prongs.
- `wing_folded`: folded wings along his back, a shade lighter, with dark veins.
- `thorax`: the shoulder plate between body and head.
- `head`: the round head, with the dark beret-shaped spot on top drawn in.
- `antenna`: one very long feeler sweeping up and back. The game uses it twice.

When he plays, the game lifts the near back leg and saws its shin across the far one, so the bow has to look right lying across his body.

#### Luma the moth (`bug_moth_luma`)

Colors now: body `#CFC3E8`, ruff `#EEE8F8`, eye-spots `#6B5BA6`.

- `wing_hind`: the rounder back wing with the smaller eye-spot, root at the dot, pointing up and back.
- `wing_fore`: the broad front wing with the big eye-spot, root at the dot, pointing up.
- `leg_upper`, `leg_lower`: six thin legs.
- `abdomen`: the fuzzy lavender body with faint segment lines.
- `thorax`: the fluffy thorax with the pale ruff at the collar.
- `head`: the round head.
- `antenna`: one feathery feeler (a shaft with little barbs), drawn straight up.

The game draws each wing twice (the far pair darker), swept back over her at rest and beating slowly when she flies. Her open eyes show as the kit's sleepy eyes, so she always looks half asleep.

### Counts

| Bug | Part layers | Forms | Face overrides needed |
|---|---|---|---|
| Dot | 8 | flying (uses `shell` and `wing`) | 7 pink mouths |
| Rollo | 9 | ball | none |
| Glorp | 4 | in shell | none |
| Skeet | 7 | none | none |
| Boing | 7 | none | none |
| Flick | 10 | flying | 7 pink mouths |
| Whiff | 8 | none | none (optional brows) |
| Moose | 9 | on his back (no extra art) | none |
| Barty | 11 (one optional, `shine`) | ball | none |
| Munch | 15 | cocoon, butterfly | none |
| Prim | 10 | wings open | none |
| Twig | 4 | disguised (no extra art) | optional tiny eyes |
| Buzzby | 8 | flying (no extra art) | none |
| Fiddle | 9 | fiddling (no extra art) | none |
| Luma | 8 | flying (no extra art) | none (uses the sleepy eyes) |
| Face kit | 28 | | |

## A5. Seeing your art in the game

While you work, the game can run on your computer in **developer mode** and reload your art every time you save. Someone sets this up once. After that, you run one command in a terminal from the game's folder:

```
pnpm art:watch
```

(`art/START-HERE.md` walks through it step by step.)

It opens the game with an **Art Lab** screen. Pick a bug, and it shows your drawing doing everything: idle, walking, hopping, flying, being held, every eye and mouth, every form. Press `Ctrl+S` in Krita, and within a second or two the bug in the Art Lab updates. You can also jump into the real world to watch your bug play with the others.

If something is wrong with the file (a misspelled layer name, an empty part, the canvas size changed), the Art Lab shows a short list of problems in plain words, like:

```
bug_ladybug_dot.ora
  ✗ "Head" is not a part name. Did you mean "head"?
  ✗ "leg_lower" is empty.
  ! "sketch 2" is not a part name. Rename it to start with "guide" to hide this.
```

✗ means the game can't use the bug yet and keeps showing the code-drawn version. ! is a warning: the game works, but have a look.

The Art Lab shows bugs. Items and the backdrop have their own quick checks and screenshot tours (A9 and A7). To see the whole set together in the real game, ask for any screenshot tour with your set on:

```sh
BB_SHOTS_SET=garden_drawings BB_ART_SOURCE=1 pnpm shots -g "areas.spec"
```

That one walks every area by day, at dusk, at night, and in rain, with your bugs, items, sky, strips, and colors all showing, and saves the pictures to `/tmp/bb-shots`. `BB_ART_SOURCE=1` reads your files as they are right now, so you don't need `pnpm art:build` first.

## A6. Suggested order

1. **Draw the face kit first, roughly.** Even quick faces help, because every bug uses them.
2. **Dot.** Draw her completely, check her in the Art Lab, and fix whatever looks off. Expect to redo things. This is where you learn how pieces bend and how much overlap a joint needs. Tell us what was annoying, so we can fix the template before the next bug.
3. **The starting cast:** Rollo, Glorp, Skeet, Boing. Players see these first.
4. **Polish the face kit**, now that you've seen it on five bugs.
5. **The found bugs:** Flick, Whiff, Moose, Barty, Munch, Prim, Twig, in any order.
6. **Items, whenever you like** (section A9). One at a time is fine.
7. **The backdrop, when the bugs feel right** (section A7). Start with `sky.json` and `world.json`. They are two small text files and change the whole world.

Checklist for each bug:

- [ ] Every part layer has a drawing, and no names changed.
- [ ] Each piece is drawn whole, even where something covers it.
- [ ] Joints overlap, with rounded ends.
- [ ] Legs and antennae start on their pivot dots.
- [ ] Everything is inside the safe box, feet on the ground line.
- [ ] Outlines are about 24 px on the template, color `#2B1D2E`.
- [ ] At most one shade and one highlight per color.
- [ ] Looks right at 25% zoom.
- [ ] Tintable layers (`_tint`) are light grey with the dark outline.
- [ ] No problems listed in the Art Lab.
- [ ] Watched it in the Art Lab: walk, fly or hop, held, thrown, asleep, every form.
- [ ] Seen next to the other bugs in the real world. Does it fit?

## A7. Backgrounds

A set can change the world behind the bugs too. There are three pieces, and each one is optional. Whatever a set leaves out stays as the game draws it now, area by area and layer by layer.

| Piece | File in your set's `backdrop/` folder | What it changes |
|---|---|---|
| The sky | `sky.json` | The sky's colors through the day, the color of the light on everything, the sun, the moon, the stars, and the rainbow |
| Painted strips | `<area_id>_far.ora` and `<area_id>_mid.ora` | The hills far away and the big plants in the middle distance, behind one area |
| The world's colors | `world.json` | A tone map that recolors the ground, the soil, the plants, the stump, and the rooms the game draws, and the pond's water |

The ground the bugs walk on, the fixtures, and the grass in front of the screen stay drawn by the game. The tone map is how a set recolors them.

### How the world is laid out

The world is one long strip, six areas side by side, and the camera slides left and right. It never moves up or down: the screen always shows the full height. Two more areas (the Ant Hill Depths and Gnome Hollow) are sealed rooms with no sky, so they take no strips.

One screen is 1920 x 1080 game pixels. Strips are painted at **2 times** game size, so a screen is 3840 x 2160 on your canvas.

### The two layers you can paint

**Parallax** is the trick where far things slide by slower than near things, which makes the world feel deep. Back to front, the game stacks: the sky, the sun and moon, the stars, the clouds, the **far** layer, the **mid** layer, then the world the bugs live in, then dark grass in front.

| Layer | Speed | What the game draws there now | What to know |
|---|---|---|---|
| `far` | 0.28 | Two rows of pale hills | It never leans. Hard things (rocks, towers, a planet on the horizon) belong here. |
| `mid` | 0.55 | Tall grass, clover, dandelions, a huge watering can, the fence behind the flowerbed | The wind leans this whole layer, so paint things that bend. |

Each area has its own canvas for each layer:

| Area | ID | `far` canvas | `mid` canvas |
|---|---|---|---|
| Flowerbed Stage | `area_flowerbed_stage` | 3430 x 2160 | 4640 x 2160 |
| Puddle Pond | `area_puddle_pond` | 2304 x 2160 | 4032 x 2160 |
| Mossy Stump Plaza | `area_stump_plaza` | 2662 x 2160 | 4736 x 2160 |
| Under the Porch | `area_under_porch` | 2304 x 2160 | 4032 x 2160 |
| Compost Lab | `area_compost_lab` | 2126 x 2160 | 3680 x 2160 |
| Treehouse Arcade | `area_treehouse_arcade` | 3430 x 2160 | 4640 x 2160 |

The porch and the treehouse are rooms that hide the sky. Their strips show only on the way in, so paint them last.

### Getting templates

```sh
pnpm art:backdrop-templates --set garden_drawings
```

This writes a template for every strip into `art/src/sets/garden_drawings/backdrop/`, with a `.strip.json` next to each one (don't edit or rename those), plus a starter `sky.json` and `world.json` that change nothing until you edit them. Name one strip (`area_puddle_pond_far`) or one area (`area_puddle_pond`) to make only those. Like the bug templates, it never overwrites a file you have painted in: add `--refresh-guides` to update only the guides.

In Krita a template looks like this, top to bottom:

```
guides            (locked)   notes, pink lines, and grey hatching
glow              empty      paint here what should light up at night
paint             empty      paint here, or add layers of your own
guides_under      (locked)   the game's own drawing of this layer, and the noon sky
```

### Painting a strip

- **Every layer not named `guide...` or `glow` is the picture.** Add as many as you like, with any names.
- **Hidden layers still count**, as they do for bugs. Name a sketch `guide_sketch` to keep it out.
- Only the blend modes Normal, Multiply, and Inherit Alpha work.
- **See-through means sky.** Don't paint a sky. Leave open whatever should show the game's sky, sun, moon, and clouds. Keep the top half mostly open, or they vanish behind your paint.
- **Pink lines are seams**, where your area's strip meets the next one. The pink hatching round a seam is a **blend zone**: the game fades your strip out there, over its neighbour. Paint right through it to the edge of the canvas. Two strips don't have to match exactly at a seam, only roughly: the same horizon height and the same light.
- **Grey hatching is never on screen.** The ground or a room always covers it. Leave it empty.
- **Keep it calmer than the bugs.** Softer edges, less contrast, and less saturated colors than anything the player can touch.

### Day and night

Paint **noon daylight**. The game tints each layer for dawn, dusk, night, and rain by multiplying your colors with the color of the light. Don't paint the sun's shadows or glows into the picture.

Multiplying can only darken. At night the far layer keeps about a third of its brightness, so very dark paint goes black. Keep things that must show at night at 40 percent lightness or more.

Anything that should glow at night (a lamp, a window, a glowing plant) goes on the layer named `glow`. Paint the light itself on a see-through layer. The game adds it on top after dark. You can set that layer to Addition in Krita to preview it; the game ignores its blend mode.

### The sky and the world's colors

`sky.json` and `world.json` are small text files of colors written like `"#8fd3f0"`. The starter files list everything; change what you want and delete the rest.

- In `sky.json` each moment of the day (`night`, `late_night`, `dawn`, `morning`, `day`, `afternoon`, `dusk`, `sunset`, `twilight`) has a sky color for the top and the bottom, a glow along the horizon, and the color of the light on each layer. `near` is the light on the bugs and everything they touch.
- The game checks that night still reads as night and day as day. It refuses a sky whose day light is too dark or whose night is too bright, and tells you which number to change.
- In `world.json`, `tone` is a list of rules like `{ "from": "#5aa845", "to": "#8a5fe0" }`. That one turns every grass green in the code-drawn world violet, keeping the light and dark shades. `water` sets the pond's colors.

B14 has every key and every rule.

### Checking and looking

```sh
pnpm art:check-backdrop art/src/sets/garden_drawings/backdrop/ --out /tmp/look
```

This checks every file in the folder in a few seconds and tells you what to fix. With `--out` it also saves a picture of each strip over the noon sky and the night sky, tinted the way the game tints it. Give it one file to check only that one.

To see the whole world with your backdrop on:

```sh
BB_BACKDROP_SRC=art/src/sets/garden_drawings pnpm shots -g "backdrop tour"
```

That saves screenshots of every area by day, at dusk, at night, and in rain, and of every seam, to `/tmp/bb-shots`. It shows the backdrop with the game's own bugs and items. A5 has the command that shows your whole set together. When you are happy, `pnpm art:build` puts the backdrop in the game with the rest of your set.

## A8. Your art is yours

- **You own your drawings.** Putting them in the game doesn't change that.
- Your art sits in its own part of the project, `art/`, with its own `art/LICENSE`. That file says the art is yours and isn't covered by anything that covers the code. Nobody may copy it or use it outside Bugglebrook without your written permission.
- You'll most likely publish Bugglebrook yourself once you turn 18. Then you need no license from yourself: the art is already yours, and your dad licenses the code to you. Any real agreements get signed after your birthday, by you, with no co-signer (`docs/07-steam-market-research.md`, section 8).
- If the game's code is ever shared publicly, your art doesn't come along. It stays under your license.
- **Credits.** The game gets a credits board with your name, written the way you want it (real name, artist name, or both). You decide.
- Keep your files. The `.ora` and `.kra` files are your originals. Back them up somewhere besides the game's folder.

## A9. Items

You can paint the things in the world too: the pebble, the berries, the hats, the toys. An item is much less work than a bug. It is one flat picture on one layer, and the game does the rest. Paint one or paint a hundred. Whatever you leave blank stays the way the code draws it.

### Getting the sheets

Items come on **sheets**, a few items to a file, grouped by kind: `things`, `food`, `toys`, `music`, `hats`, and `worn` (glasses, capes, skates). Ask for them once:

```sh
pnpm art:item-templates --set garden_drawings
```

That puts 23 sheets in `art/src/sets/garden_drawings/items/`, like `items_food_1.ora`. Each has a `.rig.json` next to it. Leave that file alone, the same as for a bug.

### What a sheet looks like

Open one. Every item has:

- a **dashed blue box**. All your paint for that item stays inside it.
- the item as the code draws it, faint. This is your guide.
- a **green outline**, the solid shape the game bumps into, and a **pink dot** at its middle.
- its own layer in the `items` group, named exactly like the item (`item_berry_red`). Paint there.

The sheet is 4 times game size, like the bug templates. Most items are only 40 to 70 pixels across in the game, so paint bold. An outline about 16 to 20 px wide on the sheet matches the bugs.

### The one rule: keep the shape

Change anything inside the outline. Change the colors, the material, what the thing is. A berry can be a glowing seed pod. But keep it the same shape and size as the faint guide, and the same way up.

The game puts things on top of your painting and it places them from the guide's shape, not from your pixels:

- **Paint.** A dipped item gets a wash of color in the guide's shape, with a dark line around it. If your item is fatter or thinner than the guide, you see two outlines.
- **Bites.** Munch nibbles notches out of the guide's top and bottom edge. If your edge is somewhere else, the bite misses.
- **The ground.** The green shape is what rests on the ground and stacks. If your painting stops short of it, the item floats.
- **Hats.** A hat sits on a bug's head by its green box. Keep the brim on the box's bottom edge and fill its width.

A good guide is 4 game pixels, which is 16 on the sheet. Stay that close to the guide's edge and everything lines up. Thin extras past the edge are fine: a curl, a feeler, a sparkle.

A few more things:

- Paint in daylight. No shadows on the ground, no glow. The game adds night, wet, and frost.
- Every pebble in the game gets your one pebble. The code-drawn ones differ a little from each other. Yours do not, and that is fine.
- The three marbles, the two balloons, and the six paint drops each have a layer of their own, so you can keep them different colors. Keep each paint drop the color of its paint.
- Hats are flipped when a bug faces left. No letters.
- In the journal, a thing you have not found yet shows as a dark shape of your painting. Make sure the shape alone says what it is.

### Things you cannot paint

Six things stay code-drawn because part of them moves or changes: potion bottles (the liquid changes color), the spring, the pinwheel, the paper boat, the big lattice, and the twig. The twig comes from the `stick` layer in Twig's own file, so paint it there.

### Checking your work

```sh
pnpm art:check-one art/src/sets/garden_drawings/items/items_food_1.ora --preview /tmp/my-preview
```

It answers in a second or two. It lists each item as `painted` or `blank`, tells you about anything wrong in plain words, and with `--preview` it saves a picture of your items at game size on grass. Look at that picture. Small things read differently small.

`x` means the game cannot use that item yet and keeps the code drawing. `!` is a warning, and the two you will meet are "strays from the guide's shape" and "leaves part of the guide's shape empty". Both mean the outline moved.

To see a whole sheet in the game beside the code-drawn items, with paint and bites on them, ask for the item tour (`pnpm shots -g "item art"`, section B21).

When a sheet is done: `pnpm art:build`, then pick your set in Settings.

---

# Part B: Art pipeline spec (for engineers)

B1 to B18 are the milestone that made hand-drawn bugs work. Four follow-ups are built on top of it: a set's own colors (B19), its night lights (B20), item art (B21), and the backdrop (B14). The code-drawn art stays as the fallback for every piece, so the game never breaks for lack of art.

## B1. Decisions this milestone needs

1. **The owner amends the Art row** in `00-decisions.md` (owner only). Suggested text: "Characters, and later backgrounds and items, may use hand-drawn art from Krita, imported through the art pipeline (`docs/06-art-guide.md`). Code-drawn art stays as the fallback and for everything not yet drawn." Don't start the milestone before that.
2. **AGENTS.md changes with it.** "All art is drawn in code ... Don't add image or audio files" becomes: art files go only through the pipeline (`art/src/` sources, generated atlases in `src/renderer/art/`). No hand-placed images anywhere else.
3. **Licensing.** The artist owns her art outright and will most likely publish the game herself once she turns 18, with the code licensed to her by the owner (`07-steam-market-research.md`, section 8). `art/LICENSE` records that the art is hers and separate from the code. The real agreements (the code license, and an art license only if someone else ends up publishing) get signed after her 18th birthday.

## B2. Overview

```
template generator          Krita                     importer                       runtime
(pnpm art:template)  ->  artist draws  ->  art/src/*.ora  ->  (pnpm art:build)  ->  atlases + manifest  ->  SpriteBugView
  renders guides from                                       validates, flattens,       src/renderer/art/   (falls back to BugSprite)
  the procedural bug                                        trims, pivots, packs
```

- One template `.ora` per bug, plus `face_kit.ora`.
- `rig.json` per bug, written by the generator: canvas size, origin, pivots, part list. Krita drops unknown attributes in `stack.xml` when it saves (its ORA loader only reads the attributes it knows), so this metadata can't live inside the `.ora`.
- The importer reads the `.ora`, checks it against `rig.json`, and writes one atlas page per bug at 1x and 2x, plus `manifest.json`.
- At runtime, `ArtStore` loads the manifest. `WorldView` gives each bug a `SpriteBugView` if its art is complete, else the current `BugSprite`.

## B3. Folder layout

```
art/
  LICENSE                      the art license, separate from the code
  README.md                    a pointer to this guide
  src/
    bugs/<bug_id>.ora          the artist's sources (committed)
    bugs/<bug_id>.rig.json     generated by art:template, committed, not hand-edited
    faces/face_kit.ora
    faces/face_kit.rig.json
    sets/<set_id>/             another artist's set, laid out like art/src itself:
      set.json                   its name and credit
      bugs/, faces/              its bugs and face kit
      colors.json                its own colors for what the game tints (B19)
      bugs/<bug_id>.lights.json  a bug's night lights (B20)
      items/                     item sheets, items_<group>_<n>.ora with a .rig.json each (B21)
      backdrop/                  sky.json, world.json, and far and mid strips (B14)
  templates/                   fresh templates from art:template, git-ignored
scripts/art/
  template.mjs                 the template generator
  build.mjs                    the importer
  ora.mjs                      ORA read and write (pure, unit-tested)
  validate.mjs                 the validation rules (pure, unit-tested)
  pack.mjs                     atlas packing (pure, unit-tested)
  watch.mjs                    art:watch
src/renderer/art/
  manifest.json
  bugs/<bug_id>@1x.png, <bug_id>@1x.json, <bug_id>@2x.png, <bug_id>@2x.json
  faces/face_kit@1x.png, ... (and per-bug face overrides go in the bug's own atlas)
  sets.json                    every set's ID, name, credit, and folder
  sets/<set_id>/               one set's build: the same manifest.json, bugs/, and faces/, plus
    items/manifest.json, items/<sheet>@1x.png, ...   its item pages (B21)
    backdrop.json, backdrop/<strip>.png, <strip>.glow.png   its backdrop (B14)
src/renderer/src/art/
  artStore.ts                  loads the manifest and textures, answers hasArt(id)
  spriteBug.ts                 SpriteBugView, the cutout rig renderer
  faceKit.ts                   places face sprites
src/renderer/src/render/rig/
  bugRig.ts                    pure: part anchors and joint positions per species
```

`package.json` scripts: `art:templates`, `art:build`, `art:check`, `art:watch`, and since the follow-ups `art:check-one`, `art:item-templates`, `art:backdrop-templates`, and `art:check-backdrop`.

New dev dependencies: `fflate` (zip read and write, pure JS) and `fast-xml-parser` (stack.xml). Image work uses `@napi-rs/canvas`, which is already a dev dependency: PNG decode and encode, compositing, and resampling. A maxrects packer is about 150 lines. Write it instead of adding a dependency, so packing is deterministic and tested.

## B4. The rig refactor (do this first)

Today the joint positions live inside the drawing code: hips in `BugSprite.hips()`, knees computed inline in `drawLegs`, antenna bases in `drawAntennae`, eye and mouth positions in `drawFace`, and the same again in each `species/*.ts` painter. The sprite renderer needs the same numbers, and the template generator needs them for pivots.

Move them into `render/rig/bugRig.ts`, pure, no Pixi:

- `rigFor(def): BugRig` gives the static anchors in rig space (facing right, origin at the collider center, ground at `foot`), in multiples of `r`: body, head, hinge, hips per leg with near/far, antenna bases, eye centers and radii (far, near), mouth center and width, cheek, crown, paint box, lantern.
- `legJoints(rig, pose, frame): Joint[]` gives hip, knee, and foot for every leg this frame. It wraps the existing math (walk cycle, flail, carrying, hopping, chute, karate, on his back, rolling, folded along the stick).
- `antennaPath(rig, frame, springs): Point[][]` gives each feeler as a polyline (the current bezier, sampled), with the elbow for jointed ones.
- `facePlacement(rig, frame)` gives eye and mouth positions, scales, and which states.
- `wingState(frame)`: shell hinge angle, wing flap scale.
- `segments(frame)` for Munch, and the other species-specific pieces.

Then make `BugSprite` and the painters draw from these functions. That refactor changes no pixels. Prove it with the shots tour (`pnpm shots`, before and after, compare the PNGs) and unit tests that pin a few joint positions per species.

## B5. Template generator (`pnpm art:templates [bug_id|face_kit ...]`)

Rendering the guide needs Pixi, so the generator runs the real app like `pnpm shots` does: a Playwright spec (`tests/art/template.spec.ts`, run by a dedicated config) launches the built app in test mode and calls a new hook, `__bb.artTemplate(bugId)`. The hook:

1. Builds a `BugSprite` off-screen in its rest pose (idle, facing right, eyes open, no reaction).
2. Measures bounds over a pose sweep: walk cycle, flail, every form, chute, hop, karate, overhead carry, on his back. Adds 10% margin and rounds each side up to a multiple of 128 px at 4x.
3. Extracts PNGs at resolution 4 with `renderer.extract`: the whole bug (for `guide_current`), and each procedural layer on its own (`body`, `shell`, `legsFront`, ...), which helps the artist see what moves together.
4. Returns `rigFor(def)` with pivots converted to template pixels.

Node then writes the `.ora`:

- `mimetype` first, stored uncompressed, containing exactly `image/openraster` (the OpenRaster spec requires it).
- `stack.xml` with `<image w h xres="300" yres="300">`, the groups and layers from section A3, and `x`, `y` on each layer.
- `data/*.png`: guides filled, part layers as 1 x 1 transparent PNGs (Krita does the same for empty layers).
- `guide_current` at 35% opacity, `guides` group `edit-locked`.
- `guide_pivots`: a dot and a text label per pivot. Draw labels with `@napi-rs/canvas`.
- `guide_safe`: the safe box (canvas minus a 32 px border), the ground line, the origin cross.
- `guide_notes`: the bug's notes from A4, rendered as text in a corner.
- `mergedimage.png` and `Thumbnails/thumbnail.png` (at most 256 px), both required by the spec.
- `<bug_id>.rig.json` next to it: schema version, canvas size, scale (4), origin, pivots by name, part list with required/optional, form membership, tintable flags, hash of the rig data.

Rules:

- **Never overwrite a source.** New templates go to `art/templates/`. To update guides in a file she's already drawing in, `--refresh-guides art/src/bugs/<id>.ora` rewrites only the `guides` group and `rig.json`, keeping every other layer byte for byte.
- If the rig changes after she has drawn (a new part, a moved pivot), bump the rig hash. The importer then reports "template out of date" with what changed.
- `face_kit.ora` uses a fixed 2048 x 1152 canvas: one 292 x 256 cell per face piece in four rows, and a band for notes. Each cell has a reference circle (the eye white at radius 72 px) or a mouth width guide (160 px), labeled. Smaller references than first planned, so brows and open mouths fit in their cells.

## B6. Importer (`pnpm art:build`, `pnpm art:check`)

For each `.ora` in `art/src/bugs/` and `art/src/faces/`:

1. **Read.** Unzip with `fflate`. Parse `stack.xml`. Ignore `mergedimage.png` and thumbnails. Krita writes each layer cropped to its pixels, with `x` and `y` offsets, so place every layer on a canvas-sized buffer.
2. **Map names.** Walk the tree. Skip anything whose name starts with `guide`. Top-level names in `parts` and `face` must match `rig.json`. A group named like a part is that part.
3. **Composite groups.** Children back to front, with layer `opacity` and `composite-op`. Support `svg:src-over`, `svg:multiply`, and `svg:src-atop`. Krita saves Inherit Alpha on a Normal layer as `svg:src-atop`, from `alphaChannelDisabled()` in its ORA save visitor. Anything else is an error that names the layer and the mode. A `<filter>` element is an error too (Krita doesn't write these today, but other apps do).
4. **Visibility.** Import hidden part layers. Artists hide layers while working. Hidden is never "off".
5. **Validate** (B10). Errors stop that bug. The game keeps its procedural art and the report says why.
6. **Pivots.** From `rig.json`. If the file has a `pivots` group with `pivot_<name>` layers, the centroid of each dot's alpha overrides that pivot. That's the escape hatch if the artist wants a joint somewhere else. Report every override.
7. **Trim** each part to its alpha bounds plus 2 px. Store the trim offset so the pivot stays put.
8. **Downscale** 4x to 2x and 1x with a high-quality filter (`@napi-rs/canvas` with `imageSmoothingQuality = 'high'`, in halving steps). Work in premultiplied alpha so edges don't go dark, then write straight-alpha PNG with color bled into fully transparent pixels next to edges (2 px). Pixi premultiplies on upload.
9. **Rim textures.** For each part, bake a white silhouette dilated by 8 px at 1x (16 at 2x) as `<part>@rim`. That replaces the hover rim that `drawRim` strokes today.
10. **Pack** each bug into one page per scale with maxrects, 2 px padding, max 2048 x 2048 at 2x. If it doesn't fit, use a second page. Output Pixi's spritesheet JSON format, with `anchor` set to the pivot.
11. **Manifest.** `manifest.json`: schema version, and per asset ID the source hash (SHA-256 of the `.ora`), rig hash, pages per scale, parts, pivots in 1x pixels relative to the rig origin, tintable flags, and per-bug face overrides.

`art:check` does steps 1 to 6 and compares hashes against the manifest. It writes nothing. CI runs it in the lint job: it fails if a source changed without a rebuild or a validation error exists. It has to run fast (seconds) and must not need a display.

Output is deterministic: same input, same bytes. Sort everything, fix PNG compression settings, no timestamps. A test checks it.

## B7. Runtime

### ArtStore

- `src/renderer/src/art/artStore.ts` loads `manifest.json` at startup, before a world opens, and loads pages lazily per bug when its first sprite is made. The scale is 2x when `renderer.resolution * potionScale > 1.25`, else 1x. Giant bugs swap to 2x.
- `hasArt(bugId)` is true only when every required part (from the rig) is present and validated. Missing parts mean the whole bug falls back to `BugSprite`. Don't mix code-drawn and hand-drawn parts on one body: it looks broken.
- Face kit fallback is per piece: a missing kit piece is drawn by `face.ts` at the same spot. Mixed faces look fine and let the artist work through the kit gradually.
- Test hook: `__bb.artMode('drawn' | 'code')` switches every bug, and `__bb.bugArt(id)` returns `'drawn' | 'code'` and the reason. In test mode the default is `'code'` unless a test turns it on, so existing E2E tests don't change.

### SpriteBugView, the cutout rig renderer

`SpriteBugView` has the same public shape as `BugSprite`: constructor takes the `BugDef`, `update(frame: BugFrame)`, `r`, `foot`. `WorldView` picks one or the other. It reuses the container stack exactly: `stretchA/B/C`, `spinLayer`, `squash` (pivot on the feet), `rig` (facing flip, reaction moves). Every effect `WorldView` applies to the sprite as a whole keeps working unchanged: potion size, tint, alpha, upside-down flip, sky grading through the graded container, the wet and hot tints.

Per frame:

- **Static parts** (`body`, `belly`, `head`, `shell`, `shield`, `thorax`, ...): one `Sprite` each, at its anchor from `rigFor`. Static parts only move with the containers.
- **Legs.** For each joint from `legJoints`: `leg_upper` at the hip, rotated to the knee. `leg_lower` at the knee, rotated to the foot. Scale each along its length to fit the distance, clamped to 0.8 to 1.25. Beyond that, keep the length and let the foot fall short, which reads better than a rubber leg. Far legs: `tint = darken(0xffffff, 0.25)` and `alpha = 0.75`, matching today. Back layer and front layer containers as now.
- **Antennae and stalks.** `MeshRope` along the polyline from `antennaPath`, textured with `antenna`, which is drawn straight. Jointed feelers use two ropes, or two rigid sprites when the pieces are short. `antenna_tip` sits on the last point, rotated to the last segment.
- **Shell and wings.** `shell` rotates on its hinge by `wingState`. `wing` twice, behind the shell, flapped by `scale.y` like `drawWings`.
- **Forms.** Show and hide sets by `frame.face.form`, `frame.morph`, and `frame.pending`: `ball`, `ball_tint`, `shell_closed`, `cocoon`, the butterfly set, and Twig flat (the `stick` with legs hidden). The ball rotates with `frame.angle`, as today.
- **Moose on his back.** Mirror the body sprites on the line `stagbeetle.ts` mirrors about. Head stays upright.
- **Faces.** `faceKit.ts` places the near eye at its anchor and the far eye at the far anchor, scaled by each eye's radius over the kit's reference radius. `eye_white` gets `scale.y = eyeOpen`. `eye_pupil` is offset by `look`, using the same reach as `drawEye`. Eye openness under 0.35 shows `eye_closed`. `eye_spiral` rotates at `time * 9`. `eye_heart` scales with the beat in `drawEye`. `eye_sleepy_lid` is tinted with the bug's lid color. Mouths are scaled by mouth width over the kit's 160 px reference. `chew` and `wobble` swap frames at 8 Hz. `aah` pulses with the current formula. Per-bug overrides from the bug's own atlas win.
- **Face tint.** Green and red washes: set the head sprite's tint toward `TINTS[tint]` (mix by alpha). No mask needed.
- **Paint.** Patches drawn as now into `paintG`, masked by a sprite of `body` (or `shield`, `abdomen`, segments for Munch). `paintBox` comes from the rig.
- **Tintable parts.** `_tint` sprites get `tint` every frame from the existing color function (Barty's `sheenColors`). `shine` sits above them untinted.
- **Hover rim.** A rim container behind the rig mirrors every visible part's transform with its `@rim` texture, at the current rim alpha.
- **Effects stay as they are.** Dizzy stars and steam (`drawStars` with `crown`), Flick's night glow (the `WeatherView` light on his tail, or where the set's `colors.json` puts his lantern), Whiff's cloud, Glorp's slime, foot ripples, water dimples.

Budget: about 20 to 45 sprites per bug, 16 bugs, one or two texture pages each. That's well under what Pixi batches cheaply. Add a perf check to `tests/unit/perf.test.ts` style or an E2E frame-time check with all bugs drawn.

### Twig and the twig item

`draw/item.ts` draws `item_twig` with the same shape Twig copies. When Twig has art, the item renders from his `stick` sprite too (scaled to the item's 1.3 m by 0.11 m), so his disguise holds. Test it: with art on, the item twig and disguised Twig use the same texture. The importer holds his `stick` to the twig's outline (B10), because the item's paint and body do not follow the drawing.

## B8. Tint layers

Tinting multiplies, so the rules for the artist (A4) are: light greys for color, darker grey for shade, white for highlights, dark outline. The importer checks that a `_tint` layer has low saturation: mean saturation of opaque pixels under 0.12, as a warning. Required now: Barty's `shell_tint`, `thorax_tint`, `head_tint`, `ball_tint`, and the kit's `eye_sleepy_lid`. Later uses: paint-colored potion wings (a shared extras file), and color variants if the game ever wants them. A set chooses the colors these layers take in its `colors.json` (B19).

## B9. Hot reload

- `pnpm art:watch` runs `electron-vite dev` with `BB_ART_LAB=1` and a watcher (`fs.watch`, debounced 300 ms, waiting until the file size is stable, since Krita writes the zip in steps).
- On change: rebuild that one asset, write to `src/renderer/art/`, update the manifest, print the report.
- A small Vite plugin in `electron.vite.config.ts` (dev only) sends `bb:art-changed` with the asset ID over the HMR socket. `ArtStore` listens via `import.meta.hot`, reloads that bug's pages with a cache-busting query, and rebuilds its views in place. The sim is untouched, so bugs keep doing what they were doing.
- Production builds contain none of this. A test checks that `import.meta.hot` code is stripped.
- `BB_ART_SRC` can point the watcher at another folder, for example a synced folder on the artist's laptop. The build reads `art/src/` only.

### Art Lab

A dev-only scene, opened by `BB_ART_LAB=1` or `__bb.artLab(bugId)`:

- One bug on a plain ground, large (zoom 2x and 4x buttons), next to its code-drawn self for comparison.
- A strip of buttons that drive it through states with the real `BugFrame` inputs: idle, walk, run, hop, fly or glide, held (flail), thrown (chute for Skeet), landed dizzy, asleep, every form, karate (Prim), on his back (Moose), rolling (Barty), disguised and peeking (Twig).
- A face grid: every eye shape and every mouth on that bug at once.
- The validation report for that file, live.
- A toggle for the paint, rainbow, ghost, wet, frozen, and night looks, to check tinting.

Build it on the real renderer classes, with no separate code path for drawing.

## B10. Validation

Every message names the file and the layer, says what's wrong in plain words, and says how to fix it. Same text in the terminal, the Art Lab, and CI.

| Check | Level |
|---|---|
| Not an ORA, can't unzip, no `stack.xml` | error |
| Canvas `w`/`h` differs from `rig.json` | error: "The canvas is 1300 x 1280 but should be 1280 x 1280. Did Image > Resize Canvas get used?" |
| Required part missing | error |
| Part layer empty (1 x 1 or all transparent) | error if required, warning if optional |
| Duplicate part names | error |
| Unknown layer name (not a part, not `guide*`) | warning, with a "did you mean" from edit distance (case and spaces first) |
| Unsupported blend mode or a filter element in a part | error |
| Part opacity under 100% | warning |
| PNG is 16-bit, or the color profile is not sRGB | warning; convert |
| Pixels outside the safe box | warning |
| A part covers more than 90% of the canvas with opaque pixels | error ("a filled background on this layer?") |
| A leg, antenna, or arm doesn't reach its pivot (no opaque pixel within 24 px of it) | warning |
| A leg or arm doesn't go straight down from its pivot, or a feeler straight up (drawn sideways or backward) | warning |
| A leg, arm, or feeler is under 0.6 or over 1.6 times its guide length | warning |
| A `_tint` layer is too colorful | warning |
| `rig.json` hash differs from the current rig | error: "This template is out of date. Run `pnpm art:templates --refresh-guides`." |
| Twig's `stick` goes more than 16 px outside the twig item's outline, or leaves any of that outline more than 16 px from paint | warning, with the distance |
| File over 8 MB | warning |

## B11. Tests
The `stick` check exists because the layer is also every loose twig (B7), and a twig's paint, bite marks, and physics body follow the code-drawn twig. It works as the item sheets' outline check does (B21). The painting and the twig's outline both become shapes at game size, with the outline's middle on the part's pivot or on the `pivot_stick` dot. Then no pixel of either may lie more than 16 template pixels from the other, counting a diagonal step as one. It is stricter than the item check, which lets 3% of a painting stray, because a thin curl 53 pixels long is under 3% of a twig. The outline is written out in `art/twigShape.ts`, since the importer has no Pixi to draw the item with, and `tests/unit/twigShape.test.ts` reads the item's real drawing and fails if the two differ. `pnpm art:check-one` on Twig's file prints how far the stick is off each way.


Every rule here gets a test. The pipeline is engineering like everything else.

Unit (Vitest):

- ORA read and write round trip. Plus a **real Krita-saved fixture**: a tiny `.ora` (a few layers, a group, Inherit Alpha, a hidden layer, an empty layer) made in Krita 5.3, committed under `tests/unit/fixtures/art/`. Catches Krita quirks that our own writer wouldn't make. Never hand-edit it.
- Name mapping, group compositing (all three modes against known pixel values), pivot override, trimming keeps pivots in place.
- Every validation rule, one fixture each, and the message text.
- Packing is deterministic and fits. Manifest schema.
- `bugRig` joint positions match what the procedural painters draw today (pinned values per species).
- `faceKit` placement and state selection for every eye and mouth shape. Every `EyeShape` and `MouthShape` maps to kit layers, and a test fails when one is added to `bugFace.ts` without a layer.
- Every `BugArt` has a `rigFor`, a template part list, and a form list.

E2E (Playwright, real mouse, asserting through `__bb`):

- With a test art pack (`tests/e2e/fixtures/art/`, a deliberately crude Dot), `__bb.artMode('drawn')`: Dot reports `drawn`, the others report `code`. Pick her up, fling her, feed her. Her face states through `__bb` match the code path.
- Remove a required part from the pack: Dot falls back to `code` with the reason.
- Twig disguised next to an item twig: both use the same texture.
- Shots: `pnpm shots -g "art"` takes the Art Lab through every state for each bug with art, at 1x and 2x, into `BB_SHOTS_DIR`. Look at them after every art drop.

CI: `pnpm art:check` in the lint job. The E2E shard runs the art test pack.

## B12. Repo size and where files live

Estimates: a bug `.ora` is mostly small cropped PNGs of flat art. About 25 layers at 4x is likely 1 to 4 MB. Twelve bugs plus the kit come to about 15 to 50 MB of source. Generated atlases are about 0.3 to 1 MB per bug for both scales. Backgrounds are much bigger: a near layer at 2x is up to 7680 x 2160, with several layers per area, so 10 to 40 MB per area file.

Decision:

- **Commit bug and face sources** (`art/src/bugs/`, `art/src/faces/`). They're the record of what shipped, and the importer and CI need them. Commit when a bug is finished or reaches a checkpoint, not on every save. Every save rewrites the whole zip, and git keeps every version.
- **Commit generated atlases and the manifest.** Builds then don't depend on the importer, and `art:check` proves they match the sources.
- **Commit backdrop strips** (2026-10-10). The plan was to keep background sources out of the repo, because whole painted areas would have been 10 to 40 MB a file. What got built is the far and mid strips only (B14), which are a few megabytes each, and `art:check` needs the sources to prove the built strips match. Commit them like bugs, at checkpoints.
- Never commit `.kra` files or `art/templates/`. Add both to `.gitignore`.

## B13. Licensing in the repo

- `art/LICENSE`: the artist owns the copyright in her art outright, all rights reserved. It isn't covered by the code's license, and nothing in the repo grants anyone else rights to it. The game's builds include it with her permission. She will most likely be the publisher herself once she's 18, which needs no license to herself; the owner licenses the code to her. If someone else publishes instead, that publisher needs a written license from her, with a royalty (`07-steam-market-research.md`, 8.2). Sign real agreements after her 18th birthday. This doc isn't legal advice; get the wording checked.
- The generated atlases in `src/renderer/art/` are derived from her art and fall under the same license. Say so in `art/LICENSE` and in a short `README` in that folder.
- `package.json` stays `UNLICENSED`. If the code is ever released under an open-source license, state in writing that `art/` and `src/renderer/art/` are excluded, as the music brief already does for the music.
- **Credits board.** Add a small credits board to the menu (the same plank board style as settings, with `markUi`), reachable from the main menu, listing art, music, and code. The artist's credit name comes from `art/CREDITS.json` so she controls the text. Give it an E2E test that opens it with the real mouse.

## B14. Backdrops: the sky, the far and mid strips, and the world's tone

Built on 2026-10-10. A set's backdrop lives in `art/src/sets/<id>/backdrop/` (`art/src/backdrop/` for the reference set) and has three optional parts: `sky.json`, `world.json`, and one `.ora` per area and layer for the far and mid parallax layers. Anything missing, empty, or broken falls back to the code-drawn look for that area and layer.

Painting whole areas was the first plan here. It did not survive the numbers: the near layer alone is about 107 megapixels at 2x, follows the terrain, and has every fixture standing on it. So the near and front layers stay code-drawn, and a set restyles them with a tone map.

### Strips

- Layers: `far` (the hills, parallax 0.28) and `mid` (the big grass, 0.55). `render/stripLayout.ts` (pure) works out the geometry from the area table. Each area under the sky owns the stretch of a layer that passes the middle of the screen while the camera is in that area: from `(xStart * 100 - 960) * f + 960` to the same for `xEnd`. The first area's stretch starts at the layer's left edge and the last one's ends at what the screen shows with the camera at the far end of the surface. The two hidden areas have no sky and no strips.
- A canvas is its area's stretch plus a 128 px blend zone past each seam (none at the ends of the world), 1080 px tall, at 2 template px per game px. `--scale 1` makes 1x canvases.
- `<id>.strip.json` (type `StripFile` in `art/backdropData.ts`) holds the canvas, where it sits in the layer, the stretch, the blend zones, `cover` (the y below which nothing is ever on screen), `hidden` (stretches always behind a room), and `stripHash`. The hash covers the geometry only. A hidden `guide_strip_<hash>` layer stamps the template, as `guide_rig_<hash>` does for bugs, and a unit test checks the test fixture's hashes against the area table.
- Every top-level layer or group not named `guide...` or `glow` is flattened into the painting, with opacity and the three blend modes bugs allow. Hidden layers count and get a warning. A layer or group named `glow` is built on its own; its own blend mode, opacity, and visibility are ignored.
- The importer (`scripts/art/backdrop.ts`, `buildStrip`) halves a 2x canvas, empties the rows from `cover` down and the `hidden` columns, fades the alpha across each blend zone with a smoothstep, trims to the alpha bounds plus 2 px, bleeds color into the edge, and writes `backdrop/<id>.png` (and `<id>.glow.png`). Placement goes in `backdrop.json`.
- Strips ship at 1x. The far and mid layers bake at resolution 1 on every screen today, so a painted strip is as sharp as the code-drawn layer it replaces: exact on a 1080p screen, soft on a HiDPI one. A set's twelve strips come to about 8128 px of far and 12880 px of mid at 1x. With flat cartoon art in every strip the build is 1.4 MB of PNG and 36 MB decoded; the worst case (every strip painted solid from the top of the screen to the ground) is about 80 MB decoded. A built strip over 3 MB and a source over 8 MB get warnings.

### What is never on screen

The template generator works it out by looking, so it stays right when an area's art changes. `art/backdropTemplate.ts` renders the code-drawn near layer at a quarter size and marks where it is opaque (plus each pond's water below its surface, which is drawn live). A spot of a layer at x `L` sits behind the world from `L + (L - 1920) / f * (1 - f)` to `L + L / f * (1 - f)` as the camera pans (`frontRange`). The spot is never seen when that whole stretch is opaque at its height (`neverSeen`, with slack for the wind's lean). The template shades those pixels, and `seenSummary` turns them into `cover` and `hidden` with safety margins.

For the far layer one spot passes behind 4937 px of world, more than any room is wide, so only the ground hides it. For the mid layer it is 1571 px, and the porch (3200 px) always covers the middle of its own mid strip.

### Seams

A strip that is drawn replaces the code-drawn art across its whole stretch, transparent parts and all. Strips are drawn left to right, each over the last, and each fades out across its blend zones. Where two painted strips meet, the right one fades in over the left one's solid end, so nothing of the code-drawn layer shows through and silhouettes that differ cross-fade over 256 px. Where a painted strip meets a code-drawn stretch, the code-drawn art starts hard at the seam and the strip fades out over it.

### The sky

`sky.json` is read over `DEFAULT_SKY` by `parseSky` (`art/backdropData.ts`): nine named moments with fixed hours (`SKY_HOURS`; the sim owns the clock), each with the sky's top, bottom, and horizon colors, the multiply tint for each layer, the clouds' tint, the stars, and the warmth; then the colors of the sun, moon, stars, shooting stars, rainbow, and the light in the two hidden rooms. `skyLook(hour, weather, palette)` eases between the palette's moments as it always did between its own keys.

`skyRules` keeps the game readable whatever the colors (brightness is 0.30 R + 0.55 G + 0.15 B):

- `day.near` is at least 225. It tints every bug and item, and the night lights come on by how dark `near` is (`glow = (235 - brightness) / 110`), so a darker day would light the fireflies at noon.
- `night.near` and `late_night.near` are between 105 and 170: dark enough for the night lights, bright enough to see the bugs.
- The night sky is at most 60 percent as bright as the day sky.

A sky that breaks a rule is an error and the set falls back to the game's own sky. Rain and cloud are not in the file: `applyWeather` greys, cools, and dims whatever the palette gives, so rain reads as rain in any sky.

### The world's tone

`world.json` has `tone`, a list of up to 12 rules `{from, to, spread}`, and `water`.

- `toneColor` (pure) maps one color. A rule pulls colors near `from`'s hue: full strength within half of `spread` degrees (default 40), easing off to nothing at `spread`. The hue turns by the angle from `from` to `to`, saturation scales by their ratio, and lightness bends by a power that sends `from`'s lightness to `to`'s. So `from` lands on `to` exactly and the rest of its hue family follows with its shading intact. Colors with less than 0.1 chroma (greys, the outline) fade out of the map. The parser warns when overlapping rules stop a `from` from landing on its `to`.
- The tone map is applied to shapes, not pixels. `toneGraphics` (`render/worldTone.ts`) walks the code-drawn hills, mid, near, and front layers once, before they are baked, and maps each fill and stroke color and each gradient's stops. Mapping pixels after antialiasing would leave fringes of in-between hues where two colors meet.
- Live plants take it at draw time through a cached function (`makeTone`): the pond's lily pads, blooms, and weed, the stems and leaves of the flowerbed's flowers and the sunflower, and the leaves the wind blows. The mushrooms' night glow takes the color their caps became.
- It leaves alone: painted strips, the water itself (which `water.surface` and `water.deep` set on purpose, and the parser checks the surface is the lighter one), petals, every fixture, bugs, items, particles, rain, and the UI. Fixtures share colors with things that mean something (potions, paint, the sequencer's caps), so a blanket recolor would break those matches.
- `WORLD_SWATCHES` lists the code-drawn world's main colors. The validator prints what a map does to each.

### Tools

- `pnpm art:backdrop-templates --set <id> [strip ...] [--scale 1|2] [--refresh-guides] [--out dir] [--no-build]` (`scripts/art/backdropTemplates.ts`) builds the app and runs `tests/art/backdropTemplate.spec.ts` on the virtual display. `__bb.backdropTemplate(id, scale)` draws the guides; `scripts/art/backdropTemplate.ts` writes the `.ora`.
- `pnpm art:check-backdrop <file or folder ...> [--out dir] [--strict]` (`scripts/art/checkBackdrop.ts`) checks a strip, a `sky.json`, or a `world.json` on its own in a second or two, and with `--out` writes the built strip and a noon and a night preview. It reads only what it is given, so painters can run many at once. `pnpm art:build` rebuilds every set and is not safe to run concurrently.
- `pnpm art:build` and `pnpm art:check` call `buildBackdrop` for every set and write `backdrop.json` and `backdrop/*.png` beside the set's atlases. A set with no `backdrop/` folder gets no new files.
- `pnpm shots -g "backdrop tour"` (`tests/shots/backdrop.spec.ts`) shows every area and every seam. `BB_BACKDROP_SRC` builds a set's backdrop from its sources on the spot.

### Not built

Painted near and front layers, cloud drawings, and art for fixtures. The glow layer covers the far and mid strips only.

## B15. Milestone scope and acceptance

In scope:

1. Owner amends `00-decisions.md`. AGENTS.md updated.
2. `bugRig.ts` refactor, no visual change.
3. ORA read and write library, template generator, `rig.json`, face kit template.
4. Importer, validation, atlases, manifest, `art:check` in CI.
5. `ArtStore`, `SpriteBugView`, face kit renderer, tint layers, rim, paint mask, Twig and twig item sharing.
6. `art:watch`, hot reload, Art Lab.
7. A crude test art pack, unit and E2E tests, the art shots tour.
8. `art/LICENSE`, `art/CREDITS.json`, the credits board.
9. Templates generated for all twelve bugs and the face kit, handed to the artist.
10. Docs: `04-architecture.md` gets an "Art pipeline" section. Agents keep this guide current.

Out of scope: backgrounds, items, fixtures, UI art, the cursor.

Done when: the crude test Dot plays through every state in the Art Lab and in the world without a visual glitch at 1x and 2x, every other bug falls back cleanly, all four standard commands plus `art:check` pass on all three CI platforms, and the artist has run `pnpm art:watch` on her own machine and seen a save show up in the game.

## B16. What the first build of the pipeline does

Built on 2026-10-01. Where it differs from the plan above:

- Generated atlases and the manifest live in `src/renderer/art/`, bundled with `import.meta.glob` (PNG pages inlined as data URLs, since the sandboxed renderer loads from `file://`). `pnpm art:check` is part of `pnpm lint`. It rebuilds everything in memory and compares bytes, so a stale or hand-edited atlas fails.
- PNG and zip work is plain TypeScript on `fflate` (`scripts/art/png.ts`, `ora.ts`), not `@napi-rs/canvas`, so output is byte-for-byte deterministic and `art:check` needs no native code. Downscaling is a premultiplied 2x2 box filter in halving steps. Templates are trimmed to 4-pixel boundaries so 1x and 2x pivots stay exact.
- The scripts are TypeScript run directly by Node 26 (type stripping). `rig.json` and the manifest types are shared with the game through `src/renderer/src/art/rigFile.ts` and `kit.ts`, which have no imports.
- A template's rig hash is stored as a hidden `guide_rig_<hash>` layer, because Krita keeps layer names but drops unknown `stack.xml` attributes. A unit test fails when the game's rig no longer matches a committed `rig.json`.
- New bugs' templates go straight into `art/src/` (nothing to lose); an existing source gets a fresh copy in `art/templates/`, or its guides swapped in place with `--refresh-guides`.
- `SpriteBugView` animates Dot and Flick (the beetle rig) so far. Every bug has a template, a part list, and pivots, but the other ten fall back to code with the reason "the cutout renderer can't animate <name> yet" until their joints are wired up. The species painters (M7 bugs) share the tripod walk through `walkJoints`; the rest of their joint math is still inside each painter, and their template pivots come from a table in `bugRig.ts`.
- Not built yet: the Krita-saved fixture (needs Krita 5.3 to make), Twig and the twig item sharing a texture, Barty's sheen on tint layers, the credits board and `art/CREDITS.json`, and a frame-time check with all bugs drawn. B18 covers the first four of those.

## B18. The second build: every bug

Built on 2026-10-02.

- **Skeletons.** `render/rig/skeleton.ts` describes a bug's pose for one frame as a list of items: rigid pieces (`at`, rotation, scale), limbs (hip, knee, foot, with an upper and lower part), ropes (9 points along a feeler), plus the face, a ball form, paint masks, and effects the game draws itself. `codeSkeleton` builds it for the bugs `BugSprite` draws (Dot, Rollo, Glorp, Skeet, Boing, Flick). Each species painter has a `skeleton(frame, springs)` method next to `update`, built from the same private joint methods, so the code-drawn and drawn bugs bend in the same places. The golden draw-call record (`bugDraw.test.ts`) proves the painters still draw the same calls.
- **SpriteBugView** draws any skeleton. Pieces go to their slot (back legs, wings, body, shell, front legs, top), in order. A piece's rig pivot goes to `at`; if the artist moved the pivot with a `pivot_` dot, the art keeps its drawn offset. Limbs stretch between 0.8 and 1.25. Feelers stored as ropes lie along +x in the atlas, so a rope-kind part used as a rigid piece (the elbowed feelers of Rollo, Whiff, and Moose) turns without the quarter turn legs get.
- **Forms.** Rollo's `ball` and Barty's `ball_tint` replace the body in a container that rolls with `frame.angle`. Glorp in his shell shows `shell_closed` with kit eyes in the opening. Moose on his back mirrors `belly`, `shell`, and `thorax` about his flip line (`sy = -1`) and keeps the head upright. Munch shows six segments (alternating `segment_a`, `segment_b`, scaled by the eating lump), the cocoon with the game's thread, or the butterfly with both wing pairs (the far pair mirrored) and his caterpillar `head` scaled to the butterfly head. Prim's arms are limbs (`arm_thigh` to `arm_blade`), the far one behind, the near one in the top slot; the chop swoosh is the game's. Twig disguised is only `stick`, with `sx = facing` to cancel the facing flip.
- **Tints and faces.** Barty's `_tint` parts get `sheenColors()` every frame. The face wash tints the skeleton's `headPart`. Whiff's polite brows come from the kit's `brow_polite`. Munch's second blush and Barty's aloof glance ride on the skeleton's face.
- **Paint** clips to one piece per patch: the body (or shell, shield, abdomen, stick), or each painted segment of Munch.
- **The twig item.** When Twig is drawn from art, `itemArt` gives the twig item (in the world and the pocket) his `stick` texture and rim, at game size. The item twig's sprites rebuild when art changes.
- **Credits.** The heart at the bottom left of the main menu opens a plank board with a picture and a name per line (art, music, code). The names come from `art/CREDITS.json`; an empty name leaves its line off.
- **Tests.** The crude test pack (`tests/e2e/fixtures/art/make.ts`) now has every bug, drawn from its rig as flat shapes. `tests/unit/artBugs.test.ts` draws every bug in every pose and expression, checks that each skeleton part has a drawing, that every rig part is used, that the rest pose puts each part on its template pivot, and each special form. `pnpm shots -g "art every bug"` saves the Art Lab grid and each pose for all sixteen bugs (`art-bug-*`).
- **Art Lab poses added:** skate (Skeet), fly with wings open (Prim), karate pose without the chop (Prim), fluttering and floating (Munch).
- Still not built: the Krita-saved fixture and a frame-time check with all bugs drawn.
- **M11's music bugs.** Buzzby, Fiddle, and Luma have painters (`species/bee.ts`, `cricket.ts`, `moth.ts`), rigs, templates, and crude test art like the rest. Buzzby's and Luma's wings flap in flight (`fly` in the Art Lab); Fiddle's `fiddle` pose bows his near back leg across the far one (`frame.fiddling`, or while performing or playing).

## B19. A set's own colors

Built on 2026-10-10.

The game colors a few things itself, from the original bugs' palette. A set that paints a bug in other colors can name its own in `colors.json`, next to `set.json`. The reference set's file would be `art/src/colors.json`.

```json
{
  "bugs": {
    "bug_ladybug_dot": { "lid": "#3a2a40", "body": "#e8453c" },
    "bug_dungbeetle_barty": { "sheen": ["#2e8b7a", "#6a4fa3"] },
    "bug_firefly_flick": { "glow": "#d8ff4f", "lantern": { "x": 272, "y": 528 } }
  }
}
```

Every key is optional, for each bug. A key left out keeps the game's value, so a set with no file looks as it always has. The example above lists the game's own values for those three bugs.

| Key | What it colors | Without it |
|---|---|---|
| `lid` | The tint multiplied over `eye_sleepy_lid`. | A color the rig picks from the original palette: plum `#3a2a40` for Dot and Flick, the body color lightened for most others. |
| `sheen` | Two colors. Barty's `shell_tint`, `thorax_tint`, and `ball_tint` shimmer between them, and `head_tint` is the shell's color mixed a quarter of the way to the outline plum. His eyelid is the first color darkened the same way, unless `lid` is given. The same color twice holds the shell still. | Teal `#2e8b7a` and violet `#6a4fa3`. |
| `body` | The bug's main color, for what the game draws beside the bug: Glorp's foot ripples, the puffs behind a flung bug, the fur of the hairy potion, and the frame behind the bug's portrait in the journal. | `BugDef.body`. |
| `glow` | The light a glowing bug casts at night. Only Flick glows. The light's core is the same color mixed 65% of the way to white. | Yellow-green `#d8ff4f` with a `#f4ffc0` core. |
| `lantern` | Where that light sits: `{ "x": 272, "y": 528 }`, the middle of the painted lantern in template pixels on the bug's canvas. These are the coordinates `.lights.json` uses (B20). | The tip of the code-drawn tail, 0.7 of the bug's radius behind its middle and 0.1 below it. On Flick's template that is (272, 528). |

Colors are six-digit hex strings. `pnpm art:build` stops, naming the file and every problem in it, if a key is unknown, a color is malformed, a `lantern` is not a spot on the bug's canvas, or the file names a bug the set has no `.ora` for. The build copies each bug's colors into its manifest entry (`ManifestAsset.colors`, as numbers), so the packs that hot reload and the tests install carry them too. It reads `lantern` against the bug's `.rig.json` and writes it in game pixels from the rig's origin. `tests/unit/setColors.test.ts` fails a shipped set that gives `glow` or `lantern` to a bug that does not glow, or `sheen` to one with no tint layers.

The lantern's light is not one of the bug's night lights (B20). It follows the bug's middle and the way it faces, and it does not tilt with a held bug or grow with a potion, as before. A star painted far from the bug's middle will drift off its light when the bug tilts, so keep the lantern near the body.

The colors apply only while the selected set draws that bug. `SpriteBugView` reads them from its manifest entry. `ArtStore.colors(def)` serves the two places outside the sprite: the night light in `WeatherView` and the journal's frame. The file's checks, the glow rule (`glowColors`), and the lantern's place (`lanternAt`) are in `art/setColors.ts`. `__bb.weatherLightSpots()` lists where each light is drawn.

Some colors are left out on purpose. Paint, potion tints, wet, frozen, hot, the red and green face washes, the far side's darkening, and the white hover rim are the game's own signals and mean the same thing in every set. Pictograms in thought bubbles, the journal's small friend faces, and the face stickers are code-drawn pictures of the original bugs, so they keep the original colors.

## B20. A set's night lights

Built on 2026-10-10.

Set art sits in the container the sky grades, so anything painted to glow goes dark at night with the rest of the bug. A set can list points on a bug that the game lights after dark. The game draws each as a soft additive glow in `WeatherView`'s light layer, outside the graded container, riding the part it was painted on.

The points are data, one file for each bug that has any, beside its `.ora`: `art/src/sets/<id>/bugs/<bug_id>.lights.json`.

```json
{
  "lights": [
    { "part": "shell", "x": 350, "y": 634, "r": 60, "color": "#7dffe0" },
    { "part": "wing", "x": 420, "y": 250, "r": 50, "color": "#bff8ff", "forms": ["flying"] }
  ]
}
```

| Key | Meaning |
|---|---|
| `part` | The rig part the light sits on: the layer the glowing spot is painted on. Face pieces cannot carry lights. |
| `x`, `y` | The spot's center in template pixels on the bug's canvas, the coordinates the layer is painted in and the pivots in `.rig.json` use. |
| `r` | How far the glow reaches, in template pixels, 1 to 400. The glow is brightest in the middle and gone at `r`, so about three times the painted spot's radius is a good start. |
| `color` | Six-digit hex. It is added as light, so a dark color barely shows. |
| `forms` | Optional. Limits the light to some of `normal`, `curled`, `in_shell`, `flying`. |

A bug may list 16 lights.

How a light follows its part:

- It shows only while its part is drawn. A light on `shell` is off when Rollo is a ball. The ball, the closed shell, the cocoon, and the butterfly parts get lights of their own. `forms` is for a part that is drawn in a form where its light should be off, such as a belly spot the shell covers unless the bug is flying. The glow is added over everything, so a light under another part shines through it.
- A part drawn several times shows its light on each near-side copy: one light on `leg_lower` is three lights. Far-side copies, which the game draws darker behind the body, get none.
- On a feeler (a `rope` part) the light sits as far along the feeler as it was painted above the base dot, and follows the bend. Its sideways offset is ignored.

When they show:

- Their brightness follows `SkyLook.glow`, the curve the mushrooms and Flick's lantern use, so they rise at dusk and fall at dawn. At or below 0.1 they are off and cost nothing. The glow is read from the light on the near layer, so under a set's own sky (B14) the lights follow that sky. Its rules leave at most 0.09 of glow at noon, which keeps the lights off by day, and at least 0.59 at night.
- A sleeping bug's lights are half as bright. They go out under water, as the lantern does. They fade with a see-through bug and scale with potion size.
- A bug in the pocket or off screen has none. Neither has Twig while he is disguised: plain twigs do not glow, and lights would give him away. A light under a worn thing on the front of the bug is hidden.
- The world draws at most 150 at once (`BUG_LIGHTS` in `weatherView.ts`). They are sprites of one texture in one layer, so they draw as one batch. Placing 166 lights on sixteen walking bugs added about 0.15 ms a frame, and 345 lights about 0.8 ms, measured in Node on a desktop that was heavily loaded at the time. The frame-time bars are judged on CI.

The importer checks the file against the bug's rig. A light that is wrong is left out and reported as a warning in that bug's report, and the bug still draws. The build writes each light into the manifest (`ManifestAsset.lights`) in game pixels from its part's pivot. `art/setLights.ts` has the checks, the form rule, the brightness rule, and the feeler math. `SpriteBugView.nightLights` places the lights by asking each part's sprite where the point is. `WorldView` gathers them as it poses each bug, after the bug has moved, so they do not trail a frame behind.

To see them: the Art Lab's night look draws them, so the cast tour's `<set>-<bug>-night.png` shows them, and `pnpm shots -g '<set name> night'` photographs each bug on the plaza after dark, held up and then left alone (`<set>-<bug>-night-held.png`, `-night-world.png`). `__bb.bugLights()` lists the lights drawn in the world.

## B21. Item art

Built on 2026-10-10. A set can paint items. Each painted item replaces the code drawing of that one item, everywhere an item is shown. Everything else stays code-drawn.

### What a set may paint

147 of the 186 items. Six art keys stay code-drawn, listed with their reasons in `CODE_DRAWN` (`src/renderer/src/art/itemSheets.ts`):

| Art key | Items | Why |
|---|---|---|
| `potion` | 34 | `setLiquid` recolors the liquid for the brew inside, and every bottle shares one drawing. |
| `spring` | 1 | The coil is a second `Graphics`, redrawn every frame as it squashes. |
| `pinwheel` | 1 | The wheel is a second `Graphics` that turns on the stick. |
| `paper_boat` | 1 | `setSoggy` redraws it as it soaks. |
| `twig` | 1 | It uses Twig's `stick` (B7), so his disguise holds. |
| `lattice` | 1 | With its vines it is 7 m across. Its picture would need more texture than every other item together. |

A new item with a part that moves or redraws belongs in that table. Anything else is paintable as soon as it exists.

### Sources

```
art/src/sets/<id>/items/items_<group>_<n>.ora        one paint layer per item, named by item ID
art/src/sets/<id>/items/items_<group>_<n>.rig.json   the layout, written by the generator
```

The reference set's would sit in `art/src/items/`. It has none.

Layers are named by item ID, not by art key. Marbles, balloons, paint drops, blueprints, and map scraps share a key and differ by color or mark, and item IDs are the names saves and the journal already use.

`planSheets` (pure) splits the paintable items into sheets: by group (`things`, `food`, `toys`, `music`, `hats`, `worn`), then in registry order, up to 8 to a sheet and fewer when the bodies are big. A new item lands at the end of its group, so earlier sheets keep their items. Today that makes 23 sheets.

`layoutSheet` (pure) gives each item a box: the code-drawn item's bounds and its body, plus 32 px, snapped to 8. Boxes go left to right in rows on a canvas 1600 px wide or wider. The scale is 4 template pixels to a game pixel, as for bugs. The anchor is the center of the physics body. Since the painter paints in place over the guide, and the importer measures each frame's anchor from that point, a painted item lands where the code-drawn one does.

`rig.json` (`ItemSheetFile` in `art/itemSheet.ts`) holds the canvas, `sheetHash`, and per item its `cell`, `anchor`, `body`, `guide` bounds, and `mask`. The mask is the code-drawn item's shape at game size, run-length coded. The hash covers the boxes, anchors, and bodies, not the masks, which depend on the rasterizer. The sheet carries the hash as a hidden `guide_sheet_<hash>` layer, like a bug's `guide_rig_<hash>`.

### Templates

```sh
pnpm art:item-templates [--set <id>] [--out <dir>] [--refresh-guides] [sheet_id ...]
```

`scripts/art/itemTemplates.ts` builds the app and runs `tests/art/itemTemplate.spec.ts` on the virtual display. The game draws each sheet's guides (`art/itemTemplate.ts`, `__bb.artItemTemplate`): `guide_current` (the items as the code draws them, seed 0, at 35%), `guide_boxes` (boxes, bodies, anchors), `guide_notes`. `scripts/art/itemTemplate.ts` writes the `.ora` with an empty layer per item.

It never overwrites a sheet. `--refresh-guides` swaps the guides and the rig.json, keeps every painting, and moves a painted layer by however far its anchor moved. `--out` writes to any folder, so templates can be made without creating a set in the repo. `pnpm art:templates` passes the item spec by, and the other way round.

### Importer

`scripts/art/items.ts`. `buildAll` calls `buildItems` for each set, so `pnpm art:build` and `pnpm art:check` cover item sheets with no extra step.

- Each item's layer (or group of that name, flattened) is trimmed and cut around its anchor with the bugs' `cut`, halved to 2x and again to 1x, and bled.
- Pages go to `src/renderer/art/sets/<id>/items/<sheet>@1x|2x.png` and `.json`, one or more per sheet. Pages are only as big as their frames, not rounded up to a power of two.
- `items/manifest.json` (`ItemManifest`) lists each sheet's status, pages, painted items, and report. It is separate from the set's bug manifest, which does not change. A set with no item sheets writes nothing.
- No rim frames. The hover rim is the code-drawn outline, which the painting keeps to. That halves the pages.

Each item stands alone. One with an error is left out and the rest of the sheet builds.

| Check | Level |
|---|---|
| Not a readable ORA, wrong canvas size, stamp does not match rig.json | error, whole sheet |
| Paint outside the item's box | error, that item |
| Layer covers more than 95% of its box | error, that item |
| Two layers with one item's name, a filter, an unsupported blend mode in a group | error, that item |
| More than 3% of the painting lies over 4 game px outside the guide's shape | warning |
| More than 3% of the guide's shape has no paint within 4 game px | warning |
| Unknown layer name, opacity under 100%, blend mode on the item layer, 16-bit or non-sRGB, file over 8 MB | warning |
| Items not painted yet | info, one line |

The two outline checks (`outlineFit`) compare the painting with the rig's mask on a grid of game pixels, with a square brush for the tolerance. Thin extras pass. A different shape does not.

`pnpm art:check-one <file.ora> [--preview <dir>] [--strict]` (`scripts/art/checkOne.ts`) checks one item sheet, bug, or kit against the rig.json next to it and touches nothing else. It takes a second or two and is safe to run many at once, which `pnpm art:build` is not. `--preview` writes the pages and the paintings on grass at 2x and 1x. `--strict` passes only a finished file with an empty report.

### What follows the code-drawn shape

The painting replaces the drawing and nothing else. These still come from the code:

| Thing | Placed from | Tolerance |
|---|---|---|
| Collider, shadow, stacking, hit testing | `def.shape` | Reach the body's edges where the guide does |
| Paint (`setPaint`) | `outline()`: a 62% wash, a 4 px line, drips at the guide's bottom edge | About 4 game px |
| Bites (`setBites`) | `g.containsPoint` on the code drawing, at 66% and 32% across | About 4 game px at those edges |
| Hover rim | `outline()` | Loose |
| Wear seats (`wearLook.ts`) | The body's width and half height | Keep the lower edge and the width |
| Tag looks, toasting, potions on items, sky grading | Tint, alpha, and scale on the whole view | None |

For an item whose `outline()` returns false, paint and the rim use the body's rounded box, as they do for the code drawing.

### Runtime

- `art/itemArt.ts`: `ItemArtBook` holds each set's painted items by item ID. `Game.start` loads the bundled ones after the bug art. Installing a sheet bumps `artStore.version`.
- `art/itemSheets.ts`: `chooseItemArt` is the pure choice. Art off gives code. The twig follows Twig. A `CODE_DRAWN` key gives code whatever the set holds. Otherwise the painting if the selected set has one.
- `art/itemViews.ts`: `makeItemView(def, seed)` builds an `ItemSprite` and gives it the art. Every place that shows an item calls it: the world and the hand, worn things, the pocket, the journal, thought bubbles, wish hints, the bench, the cauldron, the hollow's shelf, the clues window, the ant hill, the ghost hand, the whistle's swoosh. It keeps a weak list of live views. `syncItemViews`, called from `WorldView.update`, swaps each one's drawing in place when the art version changes, so a set switch reaches cached icons too.
- `ItemSprite.useArt(art | null)` hides the code drawing and its heavy outline, puts the sprite just above them, and leaves paint, bite edges, and the code rim where they were. The frame's scale follows the screen as for bugs: 2x pages above a resolution of 1.25.

### Tests and review

- `tests/unit/itemSheets.test.ts`: the importer, every check, the outline measure, templates and refresh, a set built through `buildSets`, `checkOne`.
- `tests/unit/itemArt.test.ts`: the plan and layout over every real item, the choice, the book, views swapping on a set change, paint and bites over a painting, the board. It also checks every committed item sheet: its rig.json must match the game's layout now, and it must build without errors. `pnpm art:check` cannot see the first of those, because a sheet and its own rig.json still agree after an item changes size in the game. Add a finished set's ID to `COMPLETE_ITEM_SETS` there and the test holds it to all 147 items and an empty report.
- `tests/e2e/items.spec.ts`: the crude item sheets go through the importer into the game. A painted item is drawn from its sheet in the world, in the hand, in the pocket, and on a bug's head. A blank one and a spring fall back. The set is chosen with the real mouse.
- `tests/e2e/fixtures/art/items/` holds three crude sheets. `makeItems.ts` paints each item as its own guide shape in a loud flat color, and leaves the cork and the leaf raft blank on purpose. A unit test fails when an item on those sheets changes shape, and names the two commands to rerun.
- `pnpm shots -g "item art"` (`tests/shots/itemArt.spec.ts`) opens the item board (`art/itemBoard.ts`, `__bb.itemBoard`) on every sheet: each item as code, painting, painting with paint, with bites, and under the night tint. Then the plaza by day and night. `BB_ITEMS_SRC=<set folder>` builds that folder's sheets on the spot, with no `pnpm art:build`. `BB_ART_SET=<id>` shows a built set. `BB_ITEMS_ONLY` picks sheets. Files are `itemart-*` in `BB_SHOTS_DIR`.

### Size

A full set, all 147 items, built from the code-drawn guides as paint: 509 KB at 1x and 941 KB at 2x in 23 pages each, plus 111 KB of JSON. That is 1.1 and 4.3 megapixels of texture. Flat color compresses well, so expect painted art to be two or three times the bytes. A unit test keeps the boxes' total under 6 megapixels at 2x.

### Not built

- `pnpm art:watch` rebuilds the committed pages when an item sheet is saved, but does not send them to the running game. Use the tour.
- Fixtures, water, and UI. Each fixture is an animated view with sim state, not one picture.

## B17. What we're unsure about

| Question | What we know | What the spec does about it |
|---|---|---|
| Layer styles in ORA | Krita saves each layer's `projection()`. Whether layer styles are baked into it wasn't confirmed. | Part A tells the artist not to rely on them. The real-Krita fixture test can settle it. |
| Krita 6 vs 5.3 ORA output | Same features. Both share the ORA plugin code as far as we could see. | Make the Krita fixture in 5.3. Add a 6.0 one if she uses 6.0. |
| Built-in brush names | Krita's default bundle names have changed between versions before. | Part A says to pick any hard round ink brush if the names differ. |
| Is cutout good enough for Munch's inching and Glorp's soft body? | They squash and wave a lot. | Segments and the soft body are rigid sprites with squash from the containers. If Glorp looks stiff, a later step can use `MeshPlane` deformation. Not in this milestone. |
| Will she want to animate frames herself? | Possibly, later. | The `_1`, `_2` frame convention (used by the chewing mouth) extends to any part if needed. |
| Krita's Batch Exporter instead of ORA | It ships with Krita (since 4.4) and exports layers by name tags (`e=png`, `s=50,100`, `m=` margin, `t=false` no trim), with groups as folders. Trimmed exports lose each layer's position. | Not used. ORA keeps positions and the whole file in one place. Batch Exporter with `t=false` is the fallback if ORA ever breaks. |

## Sources

- Krita 5.3.0 and 6.0.0 released together, March 24, 2026: https://krita.org/en/posts/2026/krita-5.3.0-released/
- Krita official releases (5.3.4 and 6.0.4 on September 15, 2026): https://krita.org/en/categories/officialrelease/
- Krita 2026 roadmap: https://krita.org/en/posts/2026/roadmap-2026/
- Krita manual, OpenRaster: https://docs.krita.org/en/general_concepts/file_formats/file_ora.html
- Krita ORA save visitor (what is written: `projection()` per layer cropped to its bounds, name, opacity, visibility, x, y, composite-op, Inherit Alpha as `svg:src-atop`, groups as stacks; filter layers not inserted): https://invent.kde.org/graphics/krita/-/raw/master/plugins/impex/ora/kis_open_raster_stack_save_visitor.cpp
- Krita ORA load visitor (known attributes only; stacks become groups, layers become paint layers): https://invent.kde.org/graphics/krita/-/raw/master/plugins/impex/ora/kis_open_raster_stack_load_visitor.cpp
- OpenRaster file layout 0.0.6 (mimetype first and stored, stack.xml, data/, thumbnail, mergedimage.png): https://www.openraster.org/baseline/file-layout-spec.html
- Krita manual, Freehand Brush Tool and brush smoothing: https://docs.krita.org/en/reference_manual/tools/freehand_brush.html
- Krita Batch Exporter manual: https://github.com/GDquest/krita-batch-exporter/blob/master/batch_exporter/Manual.md
- Batch Exporter in Krita since 4.4: https://www.gdquest.com/library/plugin_krita_batch_exporter/
- Godot docs, cutout animation (separate pieces, pivots at joints, rest pose): https://docs.godotengine.org/en/stable/tutorials/animation/cutout_animation.html
- Spine texture packer (whitespace stripping with stored offsets, premultiplied alpha, color bleed, per-scale atlases): http://esotericsoftware.com/spine-texture-packer
