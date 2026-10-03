# Bugglebrook art guide

This is two documents in one. Part A is for the artist who will hand-draw the bugs, and later the backgrounds, in Krita. Part B is the spec engineers build the art pipeline milestone against.

The game draws bugs in code by default. The owner approved hand-drawn replacements in `00-decisions.md`. Players can choose a named art set in Settings, and each incomplete set falls back to the original bugs for anything not yet drawn.

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

Open the pause board or the main menu's gear. Use the arrows beside **Art** to choose **Original bugs**, **Krita reference**, or another installed set. The selected artist credit appears below the set name. The choice applies at once, including bugs and twigs in the pocket, and stays selected after restarting. It is a machine setting, shared by all save slots. Changing it does not change the bugs or their saved game state.

The Krita reference set is agent-created reference artwork, separate from the daughter's drawings. Its sources stay in `art/src/bugs/` and `art/src/faces/`.

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

Draw in those templates using the same layer names, canvas and pivots described below. Save each ORA next to its `.rig.json`. You can finish one bug at a time. The set uses its own face kit and per-bug faces; it never borrows another artist's drawings. Missing, empty or broken bug art uses the original code-drawn bug. Missing face pieces use the code-drawn face.

```sh
pnpm art:build
pnpm art:check
pnpm art:watch --set garden_drawings bug_ladybug_dot
```

Build and check process every set. Watch opens the Art Lab for the chosen set and updates it when you save in Krita. Commit the sources, `set.json`, and the generated `src/renderer/art/` files together. The built game offers all sets in its catalog; copying an ORA into an already installed game does not add a set until the game is rebuilt.

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
- `stick`: his body. **He must look exactly like the plaza's twig item.** He hides by lying among real twigs. The game uses your `stick` drawing for the twig item too, so the disguise keeps working.
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

## A6. Suggested order

1. **Draw the face kit first, roughly.** Even quick faces help, because every bug uses them.
2. **Dot.** Draw her completely, check her in the Art Lab, and fix whatever looks off. Expect to redo things. This is where you learn how pieces bend and how much overlap a joint needs. Tell us what was annoying, so we can fix the template before the next bug.
3. **The starting cast:** Rollo, Glorp, Skeet, Boing. Players see these first.
4. **Polish the face kit**, now that you've seen it on five bugs.
5. **The found bugs:** Flick, Whiff, Moose, Barty, Munch, Prim, Twig, in any order.
6. **Backgrounds, later** (section A7). Then maybe items.

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

## A7. Backgrounds (later)

Backgrounds come after the bugs. This is a preview so you know what's coming.

### How the world is laid out

The world is one long strip, six areas side by side, and the camera slides left and right. It never moves up or down: the screen always shows the full height.

| Area | Width in the game | Near layer canvas (2x) |
|---|---|---|
| Flowerbed Stage | 32 m | 6400 x 2160 |
| Puddle Pond | 32 m | 6400 x 2160 |
| Mossy Stump Plaza | 38.4 m | 7680 x 2160 |
| Under the Porch | 32 m | 6400 x 2160 |
| Compost Lab | 28.8 m | 5760 x 2160 |
| Treehouse Arcade | 32 m | 6400 x 2160 |

Backgrounds are drawn at **2 times** game size, not 4. They don't get as big as bugs can, and they're huge already.

### Parallax layers

**Parallax** is the trick where far things slide by slower than near things, which makes the world feel deep. Each area has these layers, back to front:

| Layer | Speed | What goes there | Canvas width |
|---|---|---|---|
| Sky | | Stays code: its colors change with time of day and weather. Sun, moon, stars, rainbow too. | none |
| Clouds | 0.12 | Optional: a few loose cloud drawings the game drifts around | small, separate |
| `far` | 0.28 | Hills, far fence, the house far away | about 28% of the area's width |
| `mid` | 0.55 | Big grass, dandelions, far plants | about 55% of the area's width |
| `near` | 1.0 | The ground, soil, roots, props behind the bugs. Bugs walk here. | the full width (table above) |
| `front` | 1.22 | Dark grass blades and leaves in front of the bugs | about 122% of the area's width |

Each area's file has all its layers. The templates show where the next area's art starts at each end, so the edges join up.

Huge canvases are slow. If Krita struggles, the template can be split into segments (left, middle, right). The game cuts everything into 1024 px pieces anyway.

### What must stay clear

- **The ground line.** The bugs walk on an invisible line that bumps over roots and dips into puddles. The template shows it. Your ground's top edge must follow it, or bugs will float or sink.
- **Fixtures.** The stage, the gnome, the cauldron, the sundial, the vane, and the other things you can click are drawn by the game for now. The template marks them with boxes. Keep those boxes plain.
- **The pond water** is the game's (it ripples and splashes). Draw the basin around it, not the water.
- **Behind the bugs, keep it calm.** Busy patterns behind the play area make bugs hard to see. Lower contrast, thinner and lighter outlines than the bugs, and less saturated colors than the bugs. Save the bright stuff for things you can touch.

### Day and night

Draw everything in **daylight**. The game tints the whole scene for dawn, dusk, night, and rain. Don't paint shadows of the sun or glows into the background. Anything that should glow at night (a lamp, a window) goes on its own layer named `glow`, and the game lights it up after dark.

## A8. Your art is yours

- **You own your drawings.** Putting them in the game doesn't change that.
- Your art sits in its own part of the project, `art/`, with its own `art/LICENSE`. That file says the art is yours and isn't covered by anything that covers the code. Nobody may copy it or use it outside Bugglebrook without your written permission.
- You'll most likely publish Bugglebrook yourself once you turn 18. Then you need no license from yourself: the art is already yours, and your dad licenses the code to you. Any real agreements get signed after your birthday, by you, with no co-signer (`docs/07-steam-market-research.md`, section 8).
- If the game's code is ever shared publicly, your art doesn't come along. It stays under your license.
- **Credits.** The game gets a credits board with your name, written the way you want it (real name, artist name, or both). You decide.
- Keep your files. The `.ora` and `.kra` files are your originals. Back them up somewhere besides the game's folder.

---

# Part B: Art pipeline spec (for engineers)

This is the milestone that makes hand-drawn bugs work. Backgrounds and items are follow-up milestones. The code-drawn art stays as the fallback, so the game never breaks for lack of art.

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
    backgrounds/               later milestone; not committed (see B13)
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
src/renderer/src/art/
  artStore.ts                  loads the manifest and textures, answers hasArt(id)
  spriteBug.ts                 SpriteBugView, the cutout rig renderer
  faceKit.ts                   places face sprites
src/renderer/src/render/rig/
  bugRig.ts                    pure: part anchors and joint positions per species
```

`package.json` scripts: `art:templates`, `art:build`, `art:check`, `art:watch`.

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
- **Effects stay as they are.** Dizzy stars and steam (`drawStars` with `crown`), Flick's night glow (the `WeatherView` light at the lantern anchor), Whiff's cloud, Glorp's slime, foot ripples, water dimples.

Budget: about 20 to 45 sprites per bug, 16 bugs, one or two texture pages each. That's well under what Pixi batches cheaply. Add a perf check to `tests/unit/perf.test.ts` style or an E2E frame-time check with all bugs drawn.

### Twig and the twig item

`draw/item.ts` draws `item_twig` with the same shape Twig copies. When Twig has art, the item renders from his `stick` sprite too (scaled to the item's 1.3 m by 0.11 m), so his disguise holds. Test it: with art on, the item twig and disguised Twig use the same texture.

## B8. Tint layers

Tinting multiplies, so the rules for the artist (A4) are: light greys for color, darker grey for shade, white for highlights, dark outline. The importer checks that a `_tint` layer has low saturation: mean saturation of opaque pixels under 0.12, as a warning. Required now: Barty's `shell_tint`, `thorax_tint`, `head_tint`, `ball_tint`, and the kit's `eye_sleepy_lid`. Later uses: paint-colored potion wings (a shared extras file), and color variants if the game ever wants them.

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
| File over 8 MB | warning |

## B11. Tests

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
- **Don't commit background sources.** Keep them in a backed-up folder outside the repo and point `BB_ART_SRC` at it. Commit only their generated tiles. Revisit Git LFS when backgrounds start. CI runners would need LFS checkout, which costs bandwidth quota, so avoid it until the size forces it.
- Never commit `.kra` files or `art/templates/`. Add both to `.gitignore`.

## B13. Licensing in the repo

- `art/LICENSE`: the artist owns the copyright in her art outright, all rights reserved. It isn't covered by the code's license, and nothing in the repo grants anyone else rights to it. The game's builds include it with her permission. She will most likely be the publisher herself once she's 18, which needs no license to herself; the owner licenses the code to her. If someone else publishes instead, that publisher needs a written license from her, with a royalty (`07-steam-market-research.md`, 8.2). Sign real agreements after her 18th birthday. This doc isn't legal advice; get the wording checked.
- The generated atlases in `src/renderer/art/` are derived from her art and fall under the same license. Say so in `art/LICENSE` and in a short `README` in that folder.
- `package.json` stays `UNLICENSED`. If the code is ever released under an open-source license, state in writing that `art/` and `src/renderer/art/` are excluded, as the music brief already does for the music.
- **Credits board.** Add a small credits board to the menu (the same plank board style as settings, with `markUi`), reachable from the main menu, listing art, music, and code. The artist's credit name comes from `art/CREDITS.json` so she controls the text. Give it an E2E test that opens it with the real mouse.

## B14. Backgrounds (follow-up milestone, sketch)

Background art uses the same `.ora` route: one file per area, layers `far`, `mid`, `near`, `front`, and optional `glow`, at 2x.

- Canvas widths: `near` is the area width at 200 px per meter. Layer `f` is `f` times that, for `f` in 0.28, 0.55, 1.22. The last area's `far` and `mid` extend by `(1 - f) * 1920` px at 1x so the layer covers the screen at the far end of the world. `front` overhangs too. The generator computes all of it from `PARALLAX` in `background.ts` and the area table.
- Guides: the terrain polyline (from the area's `terrain`), fixture boxes (from `fixtures`, keep-clear), the pond's water region, the porch's and treehouse's opaque backdrop zones, and 256 px strips of the neighbors' art at each end.
- Import cuts each layer into 1024 px wide tiles, which `LazyLayer` already bakes and frees on the fly. The art tiles replace the baked procedural tiles one for one.
- `glow` goes into `WeatherView`'s additive light layer at night, outside the graded container, like other lights.
- Sky, sun, moon, stars, rain, water, and every live fixture stay code until a later milestone gives them parts.

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
