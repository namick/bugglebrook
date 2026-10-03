# Start here

Hi! This is how you get from a blank file to Dot running around the game in your style. It's about an hour of setup, once, and then it's just drawing.

The long version, with brush tips, every bug's part list, and why things work the way they do, is `docs/06-art-guide.md`, Part A. You don't need to read it first. Dip in when something here isn't enough.

## 1. Install Krita

Get Krita 5.3 (5.3.4 or newer) from krita.org. 6.0 works too if it already runs well on your computer.

## 2. Get the game onto your computer

Dad sets this part up with you the first time:

1. Install Git, Node.js 26, and pnpm.
2. Clone the project: `git clone https://github.com/namick/bugglebrook.git`
3. In the `bugglebrook` folder, run `pnpm install`.

After that, each time you sit down to draw, open a terminal in the folder and run `git pull` to get the latest version. If you'd rather skip Git, Dad can send you a zip of the folder instead.

## 3. Start your own set and open Dot

The game includes an agent-created reference set. Start a separate set for your drawings by running this once:

```sh
pnpm art:templates --set garden_drawings
```

In `art/src/sets/garden_drawings/set.json`, give the set a name and put your name in the credit. Dad can help with that part.

In Krita, open `art/src/sets/garden_drawings/bugs/bug_ladybug_dot.ora`.

The Layers panel has three groups:

- **guides** (locked): Dot as the game draws her now, faint, plus pink dots at every joint and a few notes. Trace it, ignore it, or redesign her. These layers never show up in the game.
- **parts**: one empty layer per piece. This is where you draw.
- **face**: Dot's own mouths. Her head is dark, so she gets light pink line mouths instead of the shared ones.

The eyes, and every other bug's mouths, come from your set's `faces/face_kit.ora`. Draw those once and all sixteen bugs in your set use them.

## 4. Draw

- One piece per layer, in the layer with its name: `head` on `head`, `shell` on `shell`, and so on.
- Draw each piece whole, even the bits another piece covers. When the shell flies open, the hidden part shows.
- Legs start on their pink dot and go straight down. Feelers start on their dot and go straight up. Make each about as long as its guide line. The game bends them.
- Keep everything inside the dashed blue box. The green line is the ground.
- Don't rename, merge, or delete the part layers, and don't resize the canvas. Hiding layers is fine.
- Want extra layers for sketches? Name them starting with `guide` (like `guide_sketch`) and the game ignores them.
- Want lines and color on separate layers? Make a group with the part's exact name (`head`) and put anything inside. Normal, Multiply, and Inherit Alpha all work in there.

## 5. Save

Press Ctrl+S. Krita asks if you're sure about saving as ORA. Say yes. That's the whole save step.

## 6. See it in the game

In a terminal in the game's folder, run:

```
pnpm art:build
pnpm art:watch --set garden_drawings
```

The game opens on the Art Lab. It shows Dot doing everything she does: walking, flying, being held, asleep, every face. The code version is on the left and yours is on the right. Click a pose to see it big, and try "look" to check paint, potions, and night time.

Leave it open. Each time you press Ctrl+S in Krita, Dot updates within a second or two. Close the Art Lab to watch her play with the others in the real world.

## 7. What the messages mean

The Art Lab lists problems in the top right. The terminal shows the same list after every save:

```
bug_ladybug_dot.ora
  ! "Head" (in "parts") is not a part name. Did you mean "head"? Rename it exactly, or start the name with "guide" if it's a sketch.
  x "head" is missing. Make a layer named exactly "head" in the "parts" group and draw the head, with no face. The game draws the face on top.
```

- `x` is a problem. The game can't use your drawing yet and keeps showing the code version. The message says how to fix it.
- `!` is a warning. Your drawing works, but have a look.
- `-` is just information, like "Nothing is drawn yet."

Your Dot shows up once every part has a drawing and there are no `x` lines. Until then the game quietly keeps using the code version, so nothing breaks while you work.

## 8. When she's done (or at a good checkpoint)

Tell Dad. He'll run `pnpm art:build` and commit your files, the set's name and credit, and the pictures the game makes from them. Commit at checkpoints, not every save: every save rewrites the whole file.

In the game's settings, use the arrows beside **Art** to choose your set. **Original bugs** shows the code-drawn characters; **Krita reference** shows the agent's examples. Your choice stays selected after restarting. Any bug you haven't finished yet uses its original drawing.

## 9. The other bugs

Every bug works the same way as Dot. Open its file in `art/src/sets/garden_drawings/bugs/`, draw the layers in `parts`, save, and use "bug >" in the Art Lab to get to it. A bug shows up drawn once all its layers have a drawing, so the special shapes below count too.

Some pieces get used in more than one way. Check these poses in the Art Lab before you call a bug done:

| Bug    | File                     | Layers | Special shapes and poses to check                                                                                                                                                                                                             |
| ------ | ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dot    | `bug_ladybug_dot`        | 8      | `shell` swings up and `wing` flaps to fly. Her `face` group has pink mouths.                                                                                                                                                                  |
| Rollo  | `bug_pillbug_rollo`      | 9      | `ball`: curled up, no face. It rolls, so it should look right upside down.                                                                                                                                                                    |
| Glorp  | `bug_snail_glorp`        | 4      | `shell_closed`: hiding. Leave the opening dark; the game puts his eyes in it. `stalk` is one eye stalk, used twice.                                                                                                                           |
| Skeet  | `bug_waterstrider_skeet` | 7      | No extra shapes. His long legs row ("skate") and spread out ("thrown"), so they have to look good at every angle.                                                                                                                             |
| Boing  | `bug_grasshopper_boing`  | 7      | No extra shapes. The big back legs fold standing and kick straight out on "hop".                                                                                                                                                              |
| Flick  | `bug_firefly_flick`      | 10     | Like Dot: `shell` and `wing` to fly. Draw `tail` in daylight colors; the game adds the glow at night.                                                                                                                                         |
| Whiff  | `bug_stinkbug_whiff`     | 8      | No extra shapes. The game gives him the polite brows from the face kit.                                                                                                                                                                       |
| Moose  | `bug_stagbeetle_moose`   | 9      | "on his back": the game flips `belly`, `shell`, and `thorax` upside down and keeps `head` up. Draw `antler` once; the game draws a smaller, darker one behind the head.                                                                       |
| Barty  | `bug_dungbeetle_barty`   | 11     | `shell_tint`, `thorax_tint`, `head_tint`, and `ball_tint` in light greys: the game slides teal and violet over them. `shine` stays white. `ball_tint` is him tucked in, with shut eyes drawn in.                                              |
| Munch  | `bug_caterpillar_munch`  | 15     | Six segments from `segment_a` and `segment_b`, so draw them the same size. "eat" makes one swell. `cocoon` needs a plain light green window: the game draws his sleeping face on it. The butterfly (`bf_...`) uses his `head`, a bit smaller. |
| Prim   | `bug_mantis_prim`        | 10     | `arm_thigh` and `arm_blade` fold, punch ("karate"), and chop. `wing_open` shows twice when she flies, and `wing_folded` hides then.                                                                                                           |
| Twig   | `bug_stickinsect_twig`   | 4      | `stick` is also the plaza's twig. Disguised, he is just `stick`, so it must look like an ordinary twig from both sides.                                                                                                                       |
| Buzzby | `bug_bee_buzzby`         | 8      | `wing` is one tiny wing, used twice: folded back at rest, a fast blur on "fly". Keep her round and fuzzy.                                                                                                                                     |
| Fiddle | `bug_cricket_fiddle`     | 9      | `hindleg_shin` is a violin bow. On "fiddling" the game lifts the near back leg and saws it across the far one. `head` has his beret spot drawn in.                                                                                            |
| Luma   | `bug_moth_luma`          | 8      | `wing_hind` and `wing_fore` show twice (the far pair darker), swept back at rest and beating slowly on "fly". Her eyes are the kit's sleepy ones.                                                                                             |

If a leg or feeler is drawn sideways, or a lot longer or shorter than its guide, the Art Lab warns you (`!`). It still works, but it bends in the wrong place.

## 10. Your name in the game

The heart on the main menu shows who made the game. Your name comes from `art/CREDITS.json`. Change `"Artist name here"` to the name you want, keep the quotes, and save.

Your art is yours. See `LICENSE` in this folder.
