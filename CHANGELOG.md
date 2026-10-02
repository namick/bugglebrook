# Changelog

## 1.0.0 (not yet released)

The first public version of Bugglebrook. It's a sandbox about tiny bugs in a backyard. There are no goals and no fail states, and the game uses almost no words.

### The world

- One side-scrolling garden in six areas: the Flowerbed, Puddle Pond, Stump Plaza, Under the Porch, the Compost Lab, and the Treehouse. Four start locked behind a barrier that you solve by playing, such as watering the sunflower or rolling a ball through the can tunnel.
- Two hidden areas, the Ant Hill Depths and Gnome Hollow, reached through doorways you have to find.
- Real 2D physics. Things stack, roll, bounce, float, and sink. Springs, ramps, seesaws, and marble runs work.
- Material tags and property rules: wet, soggy, sticky, frozen, hot, and more. Gum sticks, ice melts, and paper goes soggy in the pond.
- Day and night on a game clock, with rain, wind, cloud, rainbows, and shooting stars. Bugs sleep at night, some come out only after dark, and some secrets only show at a certain hour or in certain weather.

### The bugs

- Sixteen named bugs, each with likes, dislikes, habits, and a voice made of gibberish. Some wait to be found: Moose is stuck, Barty keeps to himself, and Twig looks like a twig.
- The bugs run on their own needs AI. They eat, nap, chat, play tag, share, snatch, comfort each other, and gawk at whatever you build.
- The setup rule: bugs never eat, carry, or knock over anything you set up.
- Fling a bug and it bounces back dizzy. Poke it, tickle it, or feed it, and it reacts with faces, speech bubbles, and sounds, with three variants for each reaction.

### Toys and making things

- Grab, drag, fling, poke, and click. The hand cursor changes pose to show what you can do.
- The Tinker Bench combines junk into new toys. A failed combo makes a junk blob that you can shake back into its parts.
- The cauldron brews potions from essences. There are 32 potion outcomes. They make bugs giant, tiny, floaty, glowing, painted, or burpy, and dunking a bug washes the effect off.
- 29 hats and accessories that fit any bug, some with small extra effects.
- A trash can and a tidy whistle for clearing clutter. Anything that matters comes back.

### Music

- Adaptive background music built from the owner's Suno tracks and their stems. The mix follows the area, the time of day, and the rain.
- Instruments and a mushroom sequencer. Every note lands on the beat and stays in the track's key. Bugs play instruments too, and three bugs on the stage form a band.

### Journal, secrets, and photos

- A picture journal of every bug, item, area, and secret you have found, with a completion jar and sparkle hints.
- 67 secrets and 4 mysteries to discover, ending in a finale.
- Photo mode with pan and zoom, 10 frames, 7 filters, and stickers. Photos save as PNG files to `Pictures/Bugglebrook`.

### Saves and settings

- Autosave into three slots, each with a picture of its world. Every save keeps one backup, and a slot that won't load comes back from it.
- A pocket for carrying things between areas.
- Settings for volume, fullscreen, reduce motion, and edge scrolling. They live outside the save slots.
- Wordless teaching hints. A ghost hand demonstrates a toy if you leave it alone for a while.

### The app

- Builds for Windows (a one-click installer), macOS (dmg and zip, unsigned), and Linux (AppImage and deb).
- Updates itself from GitHub Releases on Windows and on Linux (AppImage). When an update has downloaded, a small toast with a restart button appears. Otherwise it installs the next time you quit. The macOS build is unsigned and can't update itself, so Mac players download each new version.
- macOS: the first time you open the game, right-click the app in Applications and choose Open, then Open again in the dialog. On recent macOS you may need System Settings, Privacy & Security, "Open Anyway". If macOS says the app is damaged, run `xattr -dr com.apple.quarantine /Applications/Bugglebrook.app` in Terminal.
- Opens fullscreen. In a window, it remembers its size and position, and recenters if that monitor is gone.
- A crash shows an "oops, bugs got loose" screen with a reload button instead of a frozen game. A crashed renderer reloads on its own.
- Writes a local log to the app's data folder (`logs/main.log`) for bug reports. Nothing is sent anywhere.
