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

## 3. Open Dot

In Krita, open `art/src/bugs/bug_ladybug_dot.ora`.

The Layers panel has three groups:

- **guides** (locked): Dot as the game draws her now, faint, plus pink dots at every joint and a few notes. Trace it, ignore it, or redesign her. These layers never show up in the game.
- **parts**: one empty layer per piece. This is where you draw.
- **face**: Dot's own mouths. Her head is dark, so she gets light pink line mouths instead of the shared ones.

The eyes, and every other bug's mouths, come from `art/src/faces/face_kit.ora`. Draw those once and all twelve bugs use them.

## 4. Draw

- One piece per layer, in the layer with its name: `head` on `head`, `shell` on `shell`, and so on.
- Draw each piece whole, even the bits another piece covers. When the shell flies open, the hidden part shows.
- Legs start on their pink dot and go straight down. Feelers start on their dot and go straight up. The game bends them.
- Keep everything inside the dashed blue box. The green line is the ground.
- Don't rename, merge, or delete the part layers, and don't resize the canvas. Hiding layers is fine.
- Want extra layers for sketches? Name them starting with `guide` (like `guide_sketch`) and the game ignores them.
- Want lines and color on separate layers? Make a group with the part's exact name (`head`) and put anything inside. Normal, Multiply, and Inherit Alpha all work in there.

## 5. Save

Press Ctrl+S. Krita asks if you're sure about saving as ORA. Say yes. That's the whole save step.

## 6. See it in the game

In a terminal in the game's folder, run:

```
pnpm art:watch
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

Tell Dad. He'll run `pnpm art:build` and commit your file and the pictures the game makes from it. Commit at checkpoints, not every save: every save rewrites the whole file.

Your art is yours. See `LICENSE` in this folder.
