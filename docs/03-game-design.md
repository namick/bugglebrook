# Bugglebrook game design document

This is the build bible. Engineers implement from it, testers write acceptance checks from it, and anyone adding content follows its IDs and rules. It sits under `docs/00-decisions.md`, which wins any conflict. The research behind it is in `docs/research/01-toca-boca-essence.md` and `docs/research/02-what-makes-play-fun.md`.

Conventions used throughout:

- Every piece of content has a stable snake_case ID with a prefix: `area_`, `bug_`, `item_`, `fix_` (fixtures that can't be picked up), `recipe_`, `potion_`, `secret_`, `mystery_`, `tag_`, `sfx_`, `page_`. IDs are data keys. Never rename one after it ships in a save file.
- Distances are in world pixels at a 1920×1080 logical viewport. The play field is 1080 px tall. Speeds are px/s. Times are real seconds unless marked "game minutes".
- "Bug" means a character. "Item" means a loose physics prop. "Fixture" means a thing attached to the world that you can click or drop things into but can't carry.
- Colors are given as hex. Every drawn shape has a 4 px dark outline (`#2B1D2E`) unless noted. Outlines scale with the object, with a 2 px minimum.

---

## 1. Pitch, pillars and core loop

### Pitch

Bugglebrook is a backyard seen from bug height. A dozen-plus weird little bugs live there, wander around on their own, and will eat, wear, ride or play whatever you hand them. You can grab everything, including the bugs, and fling it. The garden runs on real physics and a small set of material rules, so a spring, a honey drop and a snail can turn into a contraption nobody planned. Under the toybox are secrets: hidden bugs, potion combos, crafting recipes, night-only events and a few mysteries that run across the whole garden. There's no score and no way to lose. The reward is what the bugs do.

### Pillars

1. **Everything is a toy.** If it looks loose, you can grab it, fling it and drop it on something. Bugs count. Every action gets motion, sound and a face within one frame.
2. **The bugs have their own lives.** Bugs pick what to do from needs, personality and what the objects around them offer. They notice your stuff, use it, react to each other, and never wreck what you built.
3. **Rules, not scripts.** Materials carry tags like wet, sticky and hot, and the tags interact the same way everywhere. Most combos are emergent. Hand-made secrets sit on top and still follow the rules.
4. **Always a mystery in view.** Every area has something visible but unexplained: a glow, a locked hatch, a sound, a silhouette in the journal. Every secret has a clue somewhere.
5. **Weird, never mean.** Burps, stink clouds, slime and slapstick. Every bug that gets flung, dunked or slimed bounces back within seconds, a bit dizzy or grumpy but fine.

### Core loop at three scales

**10 seconds.** Grab a thing, drop it on or near a bug, watch the reaction. Examples: fling Boing off the spring and watch him bounce back dizzy; drop a hot pepper on Rollo and watch him puff smoke and roll to the pond; put a thimble on Moose and watch him strut. The loop is poke, react, poke again with a variation.

**5 minutes.** Set something up and watch the bugs run with it. Build a ramp-and-spring launcher and watch bugs line up to ride it. Cook three potions and try each on a different bug. Dress the whole cast in hats and take a photo. Follow a bug's thought bubble to find what it wants, give it, and see what it does next. Usually one discovery happens in this window: a journal stamp, a new recipe, a new bug.

**1 hour.** Open areas, grow the cast and chase mysteries. The first hour typically unlocks 3 to 4 areas, finds 4 to 6 new bugs, fills 25 to 35 percent of the journal, and starts at least one multi-area mystery, like the gnome's missing nose. By the end of the hour the player is making their own goals, such as a marble run that plays a tune or a stage band of painted bugs at night.

---

## 2. Controls and interaction verbs

Mouse or trackpad only. No keyboard is required for anything. Escape opens pause as a convenience, and the pause button is always on screen too.

### The cursor

The cursor is a drawn hand in the game's style, a flat peach glove (`#FFD9B8`) with a thick outline. It has five poses:

| Pose | When | Shape |
|---|---|---|
| `open` | Default | Open hand, fingers spread |
| `hover_grab` | Over any grabbable item or bug | Fingers curl halfway, hand scales to 1.1 with a 120 ms ease |
| `hover_poke` | Over a clickable fixture or toggle | Pointing finger |
| `grab` | Holding something | Closed fist over the object's grab point |
| `pan` | Dragging empty background | Flat palm, slightly tilted in the drag direction |

### Verbs

| Verb | Input | Result |
|---|---|---|
| Grab | Press on an item or bug | Object attaches to the cursor through a spring joint at the exact press point (stiffness 0.35, damping 0.2). It dangles and swings. Bugs flail their legs and play a grab reaction. |
| Drag | Move while holding | Object follows through the spring. Heavy things lag more. Items that collide with world geometry get pushed, so you can bulldoze a pile with a held beetle. |
| Drop | Release with speed under 250 px/s | Object falls. If released within a snap radius of a target, the target's drop rule runs (see below). |
| Fling | Release with speed of 250 px/s or more | Object leaves with the cursor velocity averaged over the last 80 ms, capped at 2600 px/s. Bugs play the airborne reaction. |
| Poke | Click without dragging (press and release within 200 ms and 6 px) | On a bug: a poke reaction, which is a giggle, a flinch or a grumpy look depending on personality. On an item: a small hop (impulse 120 px/s up) and its tap sound. On a fixture: toggles or uses it. |
| Hold-poke | Press and hold on a bug for 600 ms without moving | The bug gets tickled. Laughs escalate over 3 seconds, then it wriggles free. |
| Shake | While holding, drag back and forth 3 times within 0.8 s, each stroke at least 80 px | Shakes the held object. Wrings out soaked sponges and tissues, launches fizzy items, rattles maracas, splits junk blobs, and makes a held bug dizzy for 1 s with a wobbly giggle |
| Pan | Drag empty background | Camera moves opposite the drag with 1:1 tracking, then keeps sliding with inertia (friction 0.9 per frame). |
| Scroll | Mouse wheel or two-finger swipe | Pans horizontally. Vertical wheel maps to horizontal pan at 1.5 px per wheel pixel. |
| Edge scroll | While holding an object, cursor within 80 px of the left or right edge | Camera pans toward that edge at up to 900 px/s, ramping with depth into the edge zone. Only active while holding something, so it never fires by accident. |
| Pocket | Drop an item or bug on the pocket tray | Stores it. Drag it back out anywhere, in any area. |

### Drop targets

When an object is released, the game checks targets inside a snap radius in priority order. The first match wins. If nothing matches, it's a plain physics drop.

| Priority | Target | Snap radius | Rule |
|---|---|---|---|
| 1 | Pocket tray slot | Slot bounds + 20 px | Store the object |
| 2 | Container fixture opening (cauldron, workbench slot, jar, bucket) | 60 px from opening center | Object goes in with a plop |
| 3 | Bug's head, if the object has `tag_wearable` | 50 px from head anchor | Bug wears it. If already wearing one in that slot, the old one pops off with a small arc |
| 4 | Bug's mouth, if the object has `tag_edible` or is a potion | 50 px from mouth anchor | Bug eats or drinks it, or refuses it (see bug likes) |
| 5 | Bug's body, if the object is a paint | 70 px from body center | Paint applies. Slow drop makes a dot, a drop above 600 px/s makes a splat, and dragging the paint across the bug before release makes a stripe |
| 6 | Bug's hand, for any other item under 40 px across | 60 px from body center | Bug holds it and carries it |
| 7 | Seat or ride fixture (seesaw end, car, swing, boat) | 60 px | Bug snaps into the seat |

Flung objects also trigger rules 3 to 6 on contact if they hit the right anchor. A hat thrown onto a bug's head lands on it. That shot should feel great and play a "ding" (`sfx_hat_land_ding`).

### Hover affordances

- Grabbable things get a 3 px white rim light on hover, pulsing between 60 and 100 percent opacity at 2 Hz. Nothing is outlined when not hovered.
- Bugs look at the cursor when it's within 300 px. Eyes track it smoothly. If the cursor moves faster than 1500 px/s nearby, bugs flinch.
- Hovering a bug for 1 second shows its current thought bubble if it has one.
- Hovering a fixture shows a small pictogram above it for its verb: a pointing finger for toggles, a down arrow into a bowl for containers.
- While holding an item, valid drop targets glow softly: a bug's mouth glows green for food it likes, yellow for neutral, and grey for food it dislikes. It still lets you feed it. A head glows when holding a hat. This is the main way players learn preferences without text.
- Hovering the edge of a locked area shows the barrier wobbling slightly, a hint that it can be interacted with.

### The pocket tray

- A strip at the bottom center of the screen, drawn as a denim pocket with stitched edges (`#3E5C8A` with `#F2C14E` stitching). Six slots.
- Hidden until the player is holding something or hovers the bottom 60 px. Then it slides up in 150 ms. Once it holds anything, a slim tab stays visible.
- Bugs in the pocket show their eyes peeking over the edge and blink. They don't need anything while pocketed, and time is frozen for them.
- Dropping onto a full slot swaps. The swapped object pops out at the cursor.
- Stacking: identical items with `tag_stackable` (marbles, pebbles, seeds, buttons) stack up to 9 per slot, shown with a pip count, not a number.
- The pocket persists across areas and in the save.

---

## 3. The world

### Layout

The garden is one horizontal strip of six surface areas plus two hidden areas off the strip. The camera shows one screen (1920 px) at a time and pans continuously. There's no loading between areas. Each area is its own physics island that sleeps when the camera is more than one area away. Bugs in sleeping areas still run a cheap off-screen simulation (section 5).

```
 [Flowerbed Stage] [Puddle Pond] [Mossy Stump Plaza] [Under the Porch] [Compost Lab] [Treehouse Arcade]
                                          |                                                  
                                  [Ant Hill Depths]            [Gnome Hollow] (inside the gnome in the Flowerbed)
```

| ID | Name | Width | x start | Opens by |
|---|---|---|---|---|
| `area_stump_plaza` | Mossy Stump Plaza | 3840 | 6400 | Open at start |
| `area_puddle_pond` | Puddle Pond | 3200 | 3200 | Open at start |
| `area_flowerbed_stage` | Flowerbed Stage | 3200 | 0 | Watering the droopy sunflower |
| `area_under_porch` | Under the Porch | 3200 | 10240 | Moving the loose lattice panel |
| `area_compost_lab` | Compost Lab | 2880 | 13440 | Rolling Rollo through the can tunnel |
| `area_treehouse_arcade` | Treehouse Arcade | 3200 | 16320 | Balancing the bucket lift |
| `area_ant_hill_depths` | Ant Hill Depths | 2560 | below plaza | Giving the ants a sugar cube |
| `area_gnome_hollow` | Gnome Hollow | 1920 | inside gnome | Fixing the gnome's nose (mystery) |

Locked areas are visible past their barrier as a dim, desaturated preview at 40 percent brightness, with a few animated hints: shapes moving, a light, a sound. The camera can pan 400 px past a barrier so the player can look, then springs back. Bugs never cross a locked barrier.

Hidden areas are entered through a doorway fixture. Entering plays a 600 ms iris wipe shaped like the doorway, and the camera moves to that area's strip. Exiting is the same doorway on the other side.

Every area has a ground line at y = 900 with local hills and dips, a back layer (parallax 0.5), a far layer (parallax 0.2), and a sky that changes with time and weather.

### Area 1: Mossy Stump Plaza (`area_stump_plaza`), the hub

A flat mossy clearing around a huge old tree stump. It's where the game starts and where most toys first appear. The stump's top is a flat stage for stacking things.

**Palette.** Moss greens `#6FBF4A`, `#4E9A3A`; stump browns `#A8744F`, `#7A4E32`; warm sky `#BFE7F5`. Accent: mushroom red `#E8453C` with white spots.

**Landmarks.** The stump: a squat cylinder 900 px wide and 500 px tall, with ring lines on top and a doorway-shaped knothole. A huge rusty watering can lying on its side in the far layer. Clover patches drawn as three-circle clusters.

**Layout, left to right.**
1. x 0–600: path from the pond. Pebble border, a patch of clover, `fix_weather_vane` on a twig pole.
2. x 600–1400: the ant hill (a brown cone 260 px tall with a dark hole and a line of ants), `fix_sundial` beside it.
3. x 1400–2500: the stump. Top surface at y 400 is a flat platform. A rope of root forms a ramp up the left side. The knothole at the front is `fix_stump_knothole`.
4. x 2500–3200: the toy pile: a heap of loose junk and toys that seeds the early game. Behind it, a mushroom ring with 5 red mushrooms.
5. x 3200–3840: path toward the porch. A leaning bottle-cap signpost with arrow pictograms only.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_sundial` | A flat stone disc with a stick gnomon and a sun and moon painted on it. Drag the rim to turn time forward. See section 11. |
| `fix_weather_vane` | A rooster-shaped vane made of a bent spoon. Click to spin it. Spinning it fast (3 clicks in 2 s) starts a gust of wind for 20 s. |
| `fix_stump_knothole` | A dark hole in the stump. Click to peek: a random item from its pool pops out once per 10 game minutes. At night two eyes glow inside. |
| `fix_mushroom_ring` | Five red mushrooms. Each is a bouncy pad (restitution 1.1, capped launch 1400 px/s). Landing on one plays a note from the plaza scale. |
| `fix_ant_hill` | The ant hill entrance. Accepts food. See unlock. |
| `fix_toy_pile` | Not a container. It's a loose heap of real items placed at game start. |

**Loose props at start.** `item_bottle_cap` ×3, `item_marble_blue`, `item_marble_red`, `item_ruler_ramp`, `item_spring_coil`, `item_popsicle_seesaw`, `item_rubber_ball`, `item_berry_red` ×3, `item_sugar_cube` ×2, `item_hat_thimble`, `item_hat_acorn_cap`, `item_acc_sunglasses`, `item_pebble` ×4, `item_twig` ×2, `item_leaf` ×3, `item_balloon_red`, `item_button` ×2, `item_bottlecap_car`.

**Ambient critters.** A trail of 6–10 ants walking from the ant hill to whatever crumb-sized food is nearest, carrying it back. Ants are not characters. They're 12 px dots with legs and can't be grabbed. Grabbing at them makes them scatter and reform. A slow earthworm pokes out of the ground every few minutes, looks around and goes back down.

**Time and weather.** Day: bright, dappled light spots drift across the ground. Night: blue-violet `#2C2F5E` sky, mushrooms glow faintly, the knothole eyes appear. Rain: puddles form in two ground dips at x 500 and x 3000 and act like tiny ponds. Wind: leaves blow right to left; loose light items (`tag_light`) slide.

**Secrets here.** `secret_stump_eyes`, `secret_ant_sugar`, `secret_mushroom_chord`, `secret_twig_blinks`, `secret_sundial_midnight`, `secret_worm_hat`, `secret_sun_shades`, `secret_knothole_door`, `secret_golden_marble`. See section 12.

**Unlock.** Open at start.

### Area 2: Puddle Pond (`area_puddle_pond`)

A wide, shallow pond in a dip, fed by a leaky garden hose. The pond is the game's big physics toy: things float, sink, splash and drift.

**Palette.** Water `#5CC3E6` surface, `#2F7FB0` depth; reeds `#8CBF3F`; mud bank `#8A6A4A`. Accent: lily pad green `#3FA34D` with a pink bloom `#F28AB2`.

**Landmarks.** The pond itself, 1800 px wide and up to 260 px deep. A coiled green garden hose on the right bank that drips. A tall cattail cluster. A sunken rubber boot visible in the depth.

**Layout.**
1. x 0–500: bank toward the flowerbed. The droopy sunflower barrier stands here, head bent across the path.
2. x 500–2300: the pond. Three lily pads float and bob. A half-sunk teacup sits on the bottom at x 1200. The rubber boot at x 1900.
3. x 2300–2800: reeds and the hose. `fix_hose_tap` sticks out of the bank.
4. x 2800–3200: mud bank toward the plaza, with a flat stone for sitting.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_pond_water` | Water volume with buoyancy. Each item has a density. Items with density under 1.0 float, with bobbing. Anything entering it gets `tag_wet` and washes off paint, mud, slime and smell. Splash particles scale with entry speed. Gentle current drifts floaters 12 px/s to the right. |
| `fix_hose_tap` | Click to toggle. On, the hose sprays an arc of water droplets that push light items and wet everything they hit. Rain or the tap raise the pond level up to 80 px. The level drains back 1 px per 2 s when neither is on. |
| `fix_lily_pads` | Three floating platforms. A bug standing on one rides it. They're anchored by stems, so they bob but stay in place. |
| `fix_sunken_teacup` | A container on the pond bottom. Items dropped into the water above it can land inside. Holds a secret at night. |
| `fix_rubber_boot` | A sunken boot. Click it to release a burst of bubbles. Something rattles inside. |

**Loose props.** `item_leaf_raft`, `item_cork` ×2, `item_paper_boat`, `item_sponge`, `item_feather`, `item_blueberry` ×2, `item_mint_leaf`, `item_hat_flower_petal`, `item_bubble_wand`, `item_soap_sliver`, `item_inst_bottle_flute` (half-sunk near the reeds).

**Ambient critters.** Tadpoles, small black commas that wiggle underwater and scatter from anything that splashes. A dragonfly that zips across every 40–70 s and lands on a cattail. Pond skaters in the distance. Frog eyes on the far layer that blink and never do anything else.

**Time and weather.** Day: sparkles on the water surface. Dusk: water turns orange. Night: dark teal water with reflected stars, fireflies appear over the reeds if Flick is unlocked or about to be found. Rain: rings on the water, the level rises, the lily pads climb, and the sunflower perks up. After rain there's a chance of a rainbow over the pond. Wind: ripples, and floaters drift 3× faster.

**Secrets here.** `secret_boot_key`, `secret_moon_pebble`, `secret_teacup_coins`, `secret_skip_stone`, `secret_frog_blink`, `secret_raft_regatta`, `secret_firefly_flick`, `secret_pond_freeze`, `secret_sunflower_drink`. See section 12.

**Unlock.** Open at start. The pond is part of the first screenful the player can pan to, which makes it the second place most players see.

### Area 3: Flowerbed Stage (`area_flowerbed_stage`)

A flowerbed with a performance stage made from an overturned flowerpot. This is the music area.

**Palette.** Petal pinks `#F28AB2`, violets `#9B6BD6`, yellows `#FFD23F`; soil `#5A3B2B`; stage terracotta `#D46B3E`. Stage lights in saturated primaries.

**Landmarks.** The flowerpot stage: an upside-down terracotta pot, 700 px wide, with a lip that forms the stage floor. Tall flowers of different heights, drawn as circles of petals on stalks, sway. A garden gnome lying on its back at the far left, 500 px long: red cone hat, white beard, blue coat, rosy cheeks, and a clear hole where its nose should be.

**Layout.**
1. x 0–700: the gnome lies here. Its hat points left.
2. x 700–1400: `fix_mushroom_sequencer`, an 8-by-6 grid of small mushrooms in soil.
3. x 1400–2300: the flowerpot stage with `fix_bluebell_speaker` on each side and `fix_stage_lights` hung on a twig truss above.
4. x 2300–2800: `fix_paint_puddles`, five berry-juice puddles in a row.
5. x 2800–3200: the sunflower barrier toward the pond.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_mushroom_sequencer` | The step sequencer. Section 10. |
| `fix_flowerpot_stage` | A platform. Bugs on it with an instrument play it. Bugs on it without one dance. Three or more bugs on stage at once form a band and the area music gains a layer. |
| `fix_stage_lights` | Click to cycle: off, warm, disco (colors rotate per beat), spotlight (follows the bug nearest center). |
| `fix_bluebell_speaker` | Two bluebell horns. Whatever plays on the stage is broadcast to other areas at 25 percent volume. Click to mute or unmute. |
| `fix_paint_puddles` | Five puddles: red, blue, yellow, white and black. Dip an item in to make it a paint item of that color (dipping a sponge makes a paint sponge). Drop a bug in to paint its lower half. Colors don't mix in the puddles, they stay pure. |
| `fix_gnome` | The gnome. Click it for a hollow knock. The nose hole is a drop target. Section 12, `mystery_gnome_nose`. |
| `fix_sunflower_gate` | The barrier on the pond side. Drooping blocks the path. See unlock. |

**Loose props.** `item_inst_seedpod_maraca`, `item_inst_acorn_castanets`, `item_inst_thimble_drum`, `item_hat_party_cone`, `item_acc_bowtie_ribbon`, `item_pollen_puff` ×2, `item_seed_sunflower` ×4, `item_leaf` ×2, `item_lavender_sprig`, `item_honey_drop`, `item_balloon_blue`, `item_bluebell_bloom` ×2, `item_blueprint_disco_ball`.

**Ambient critters.** Aphids like little green beads on stems that bob with the wind. A distant bird silhouette on the far layer that tilts its head when music plays.

**Time and weather.** Day: flowers open. Night: flowers close into buds, the stage lights (if on) become the main light source, and moths gather at them. Rain: flowers droop and drip, and raindrops hitting the upturned sequencer caps play random notes in key. Wind: flowers sway in a wave, and petals blow off as loose `item_petal` props that despawn after 60 s if untouched.

**Secrets here.** `secret_band_of_three`, `secret_sequencer_song`, `secret_gnome_knock`, `secret_paint_all_five`, `secret_moth_spotlight`, `secret_rain_dance`, `secret_buzzby_found`, `secret_munch_found`, `secret_fiddle_found`, `secret_rainbow_end`, `secret_fashion_parade`.

**Unlock.** The sunflower gate droops across the path. The flower head is visibly thirsty: cracked soil at its base with a dry-droplet pictogram floating over it every few seconds. Any wet thing touching the soil patch opens it: a wet sponge, the hose spray if aimed there (it reaches with the tap on full wind), a bug with `tag_wet` walking onto it, or rain. The sunflower slurps, straightens with a big stretch animation, and stays upright forever. Most players find this within the first 10 minutes because the sponge sits by the pond.

### Area 4: Under the Porch (`area_under_porch`)

A dim crawlspace under the back porch, full of dropped junk. It's the junk supply and home of the Tinker Bench, the crafting station.

**Palette.** Deep shadows `#2A2438`, dusty planks `#8C7A6B` above, a single warm light shaft `#FFE3A3` through a gap in the boards. Cobwebs as thin white lines at 40 percent opacity.

**Landmarks.** The porch floorboards form a ceiling at y 250, striped with light gaps. A spool table (a big wooden thread spool) with a clothespin vise is the Tinker Bench. A dropped flashlight. Stacks of flowerpots.

**Layout.**
1. x 0–500: the lattice panel barrier, a diamond-pattern wooden grid.
2. x 500–1300: the junk drift. Dozens of loose junk items half-buried in dust.
3. x 1300–2100: `fix_tinker_bench` under the light shaft.
4. x 2100–2700: a stack of old flowerpots forming steps up to the underside of the boards, and `fix_porch_lamp`, a string of bulbs hanging from above.
5. x 2700–3200: an old tin can wall with a tiny tunnel at the bottom, toward the compost lab.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_tinker_bench` | Crafting. Section 8. |
| `fix_porch_lamp` | A string of 5 bulbs. Click to toggle. When on, light radius 400 px, and moths and Luma come to it at night. |
| `fix_floor_gaps` | The gaps between floorboards. Every 30–90 s, something drops through a gap: a crumb, a button, a coin. The pool depends on time of day. |
| `fix_can_tunnel` | The barrier to the compost lab. See unlock. |
| `fix_cobweb_hammock` | A cobweb strung between two pots. Items and bugs dropped on it stick briefly, then drop through slowly (it acts like a sticky net). Bugs love napping in it. |

**Loose props.** Junk drift contents: `item_paperclip` ×3, `item_rubber_band` ×3, `item_popsicle_stick` ×3, `item_thread_spool`, `item_button` ×4, `item_matchbox`, `item_straw` ×2, `item_toothpick` ×3, `item_foil_ball`, `item_gum_blob`, `item_tissue`, `item_paper_scrap` ×2, `item_bottle_cap` ×2, `item_eggshell`, `item_magnet`, `item_battery_toy`, `item_comb_tooth`, `item_string`, `item_tin_can` ×2, `item_acc_bandaid`. Also `item_flashlight_pen`, `item_cheese_puff`, `item_crumb_cookie` ×2, `item_hat_tiny_top_hat`, `item_acc_mustache`, `item_blueprint_slingshot`.

**Ambient critters.** Silverfish that dart between shadows. Dust motes in the light shaft that swirl when anything moves through it. A spider that lowers on a thread from the boards, looks at the player's cursor, and goes back up. It's scenery, not scary: round, fuzzy, with big eyes.

**Time and weather.** Day: the light shaft is bright and moves slowly across the floor. Night: the shaft is gone and the only light is the lamp and anything glowing. Rain: drips fall through the gaps and form a line of little puddles. Rain also drums on the boards, a pleasant background patter.

**Secrets here.** `secret_lamp_moths`, `secret_luma_found`, `secret_whiff_found`, `secret_floor_coin`, `secret_spider_wave`, `secret_rollo_tunnel`, `secret_flashlight_shadow`, `secret_upside_tea`, `secret_ghost_lattice`, `secret_first_blob`.

**Unlock.** The lattice panel is a big loose prop, 480 by 600 px, leaning in the way. Behind it, two eyes blink in the dark (Whiff). It looks like a wall but has the hover rim light and grab cursor. It's heavy (mass 8× a bug) and drags slowly. Pulling it aside or flinging it opens the path. Once opened, the lattice stays a normal prop. It never blocks the path again because its barrier status clears.

### Area 5: Compost Lab (`area_compost_lab`)

A compost heap that a colony of bugs turned into a mad science lab. Bubbling, steaming, and a bit gross.

**Palette.** Sludge greens `#7FA33A`, `#556B2F`; rot browns `#6B4A2B`; potion glows in cyan `#4FE3E3`, magenta `#E34FC6` and lime `#B6FF3B`. Steam in white at 50 percent.

**Landmarks.** A giant eggshell-half cauldron over a warm heap. Glass jars on shelves made of popsicle sticks. A bent-spoon ladle. An old microscope made from a magnifying glass and tin can.

**Layout.**
1. x 0–400: the tin can wall from the porch side.
2. x 400–1200: `fix_compost_cauldron` on the steaming heap.
3. x 1200–1800: `fix_ingredient_shelves`, three tiers of jars.
4. x 1800–2400: `fix_bug_scope`, the microscope, over a mossy dish.
5. x 2400–2880: `fix_bucket_lift` at the base of the tree trunk that leads up to the treehouse.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_compost_cauldron` | Potions. Section 9. |
| `fix_ingredient_shelves` | 9 jars. Each jar is a container that respawns one ingredient every 5 game minutes up to 1 on the shelf. Jars start holding: mushroom cap, feather, pepper, ice cube, honey drop, coffee bean, onion ring, moss tuft, fizz candy. |
| `fix_bug_scope` | Put any item on the dish and click the eyepiece. The screen shows a round zoomed view, 2 seconds, of the item's hidden detail: a pictogram of one of its tags. This is the tag inspector, the game's main hint tool for chemistry. Put the moss tuft under it at night to find Wubbo. |
| `fix_compost_heap` | The warm ground under the cauldron. Items resting on it slowly get `tag_hot` (after 10 s). Food left on it for 60 s turns into `item_compost_goo`. |
| `fix_bucket_lift` | The barrier to the treehouse. A rope over a branch with a bucket on each end. See unlock. |

**Loose props.** `item_spoon_catapult`, `item_jar_glass` ×2, `item_rotten_banana_bit`, `item_apple_core`, `item_dung_ball`, `item_hat_chef`, `item_acc_googly_glasses`, `item_pepper_hot`, `item_moss_tuft`, `item_blueprint_magnet_crane`.

**Ambient critters.** Fruit flies that orbit rotten food in little clouds. Worms that surface in the heap when it's warm. Mold puffs that bloom on rotten items and pop into tiny spore clouds, purely cosmetic.

**Time and weather.** Day: steam rises in soft columns. Night: potion jars glow and light the lab; the compost heap gives off a warm orange shimmer. Rain: the heap steams harder and the cauldron overflows with harmless foam if left bubbling. Wind: steam and smells blow sideways, so a stink cloud can drift into the porch.

**Secrets here.** `secret_first_potion`, `secret_sludge_burp`, `secret_scope_wubbo`, `secret_wubbo_found`, `secret_barty_found`, `secret_moose_found`, `secret_compost_goo_hat`, `secret_triple_potion`.

**Unlock.** The tin can wall on the porch side has a tunnel at floor level exactly the size of a rolled-up pill bug (48 px). A faint scratching sound and a latch silhouette are visible through it. Rollo curls into a ball when scared or poked 3 times fast. A rolling Rollo that enters the tunnel pops out the other side, bumps the latch, and the can wall swings open like a door. The rule is shape-based, so alternatives work too. Anything round and between 36 and 52 px across that rolls through bumps the latch: Rollo balled up, a tiny-potioned bug, or `item_rubber_ball`. A marble is too small and rolls straight under the latch with a sad clink, which is a good hint.

### Area 6: Treehouse Arcade (`area_treehouse_arcade`)

A kid's old treehouse, reached by the bucket lift, now a bug arcade built from dropped toys. This is the physics-playground area: marble runs, a pinball-ish slope, a crane game.

**Palette.** Plank oranges `#D98E4A`, `#B56A2E`; leafy canopy `#5FAF3F`; arcade neon pinks and blues `#FF5FA2`, `#4FB6FF` on dark panels `#2D2B4A`.

**Landmarks.** The treehouse floor is a wide plank platform with walls you can see into. A tall marble run pegboard on the back wall. A claw machine made from a jam jar. A ball pit made of beads.

**Layout.**
1. x 0–600: the lift platform arriving from below, and a window with a view of the whole garden in the far layer.
2. x 600–1500: `fix_pegboard`, a big vertical board with holes where marble track pieces snap in.
3. x 1500–2200: `fix_bead_pit`, a sunken box of 200 small bouncy beads.
4. x 2200–2800: `fix_jar_claw`, the claw machine.
5. x 2800–3200: `fix_leaf_slide`, a curling leaf slide back down to the compost lab, and `fix_zipline` from a window to the far right that leads out over the garden.

**Fixtures.**

| ID | What it does |
|---|---|
| `fix_pegboard` | Track pieces dragged near it snap to a 40 px grid at 0, 45 or 90 degrees. Snapped pieces stay put against gravity. Marbles dropped in the top hopper run the track. Bugs love riding it inside a bottle cap. |
| `fix_bead_pit` | 200 small bouncy beads. Anything dropped in sinks and bobs. Bugs swim through it. Beads are real bodies but pooled and sleep when still. |
| `fix_jar_claw` | Click the red button to drop the claw, which grabs whatever is under it. The prize chute returns the item to the player. Items inside restock from a pool of hats and accessories every game day. Always succeeds on the third try in a row if two missed. No randomness in whether you eventually win. |
| `fix_leaf_slide` | A slide. Anything placed at the top rides it down. |
| `fix_zipline` | A string with a bottle cap trolley. Put a bug in it and it zips across, off-screen in the far layer, and returns 4 s later. Every 10th ride returns with a random souvenir from another area. |
| `fix_arcade_scoreboard` | A blinking board with pictogram icons, not numbers. It shows a gallery of the player's funniest flings: the longest airtime so far, drawn as a bug icon and a streak. It's decoration, not a score, and has no rewards. |

**Loose props.** `item_marble_track_straight` ×4, `item_marble_track_curve` ×4, `item_marble_funnel`, `item_marble_green`, `item_marble_gold` (secret), `item_domino` ×12, `item_spinning_top`, `item_hat_propeller`, `item_acc_cape_leaf`, `item_yo_yo`, `item_jelly_bean` ×3, `item_inst_leaf_xylophone` (leaning on the pegboard), `item_blueprint_balloon_basket`. `item_maple_seed` falls from the canopy during wind.

**Ambient critters.** A squirrel tail that flicks through the canopy in the far layer. Birds on a branch outside the window. A pill-bug-shaped spot of sunlight.

**Time and weather.** Day: sunbeams through the canopy. Night: the arcade neon glows and bugs gather, making it the brightest area. Rain: drips on the roof make a steady patter; the window shows rain over the garden. Wind: the whole treehouse sways 1–2 degrees and loose items on the floor slide slowly with it.

**Secrets here.** `secret_marble_tune`, `secret_domino_chain`, `secret_prim_found`, `secret_claw_triple`, `secret_zipline_souvenir`, `secret_window_telescope`, `secret_catch_cloud` (starts here).

**Unlock.** At the right end of the compost lab, a rope runs over a branch with a bucket at each end. The bottom bucket is empty and the top bucket, hanging near the treehouse, holds a heavy acorn. Put enough weight in the bottom bucket (total mass more than the acorn's, about 3 bugs, or Moose alone, or a bug under `potion_heavy`) and the bottom bucket rises past the top one. Anything in it gets carried up. The first time, the camera follows the bucket up and the treehouse opens. After that, the lift works both ways and a counterweight pebble stays in the top bucket so one bug is enough.

### Area 7: Ant Hill Depths (`area_ant_hill_depths`), hidden

A cross-section of the ant colony under the plaza. Tunnels, chambers, and an ant queen who is a big fan of sugar.

**Palette.** Warm earth `#8B5A3C`, tunnel dark `#4A2E1F`, amber lamps `#FFB347`. Ants are dark red `#7A1F1F`.

**Layout.** A single wide cross-section 2560 px long with tunnels on three levels. The entrance shaft comes down from the plaza at x 400. Chambers: the pantry (x 700), the nursery with ant eggs like white beans (x 1300), the throne room with the queen (x 1900), and a dead-end tunnel with a stuck root and something shiny (x 2400).

**Fixtures.** `fix_ant_queen`: a large ant sitting on a thimble throne, wearing a bottle-cap crown. Feed her something sweet and she does a tiny happy dance and the colony cheers. `fix_ant_conveyor`: a line of ants passing items from hand to hand along a tunnel. Drop any small item on the line and they pass it to the pantry. `fix_root_knot`: a root blocking the dead end. Moose or a giant bug can pull it.

**Loose props.** `item_ant_crumb` ×6 (a tiny-potion ingredient), `item_gnome_nose` (behind the root), `item_acc_crown_foil`, `item_map_scrap_2`.

**Ambient critters.** Worker ants everywhere, carrying things. Beetle larvae sleeping in side pockets that wiggle when poked.

**Time and weather.** Always dark and lamp-lit. At night the ants are asleep in rows and snore in unison. When it rains above, water trickles down the entrance shaft and the ants carry tiny leaf umbrellas.

**Secrets here.** `secret_queen_sweet`, `secret_root_pull`, `secret_ant_conga`, `secret_map_scrap_2`.

**Unlock.** Drop a `item_sugar_cube` on the ant hill in the plaza (or let the ants find one nearby: a sugar cube within 300 px of the hill gets carried in). The ants swarm it, carry it down, and the hole widens with a crumbling animation into a doorway. Clue: the ant trail always heads toward sugar, and the ant hill has a thought bubble showing a sugar cube when the cursor hovers it.

### Area 8: Gnome Hollow (`area_gnome_hollow`), hidden

The inside of the fallen garden gnome. It's hollow and has been secretly furnished as a tiny observatory and lost-toy museum by someone nobody has met.

**Palette.** Deep blue night `#1B2350`, gold `#F2C14E`, ceramic white `#F4EFE6`. Stars painted on the inside of the head.

**Layout.** One screen. A spiral stair up into the hat, which opens as a telescope. Shelves of "lost toys" the player has flung off-screen over the game (every item that fell out of bounds and got returned is also logged here as a picture). A pedestal in the middle that holds `item_marble_gold` if the player brings it.

**Fixtures.** `fix_gnome_telescope`: click to look through; shows the night sky with constellations shaped like each bug in the cast, lit for bugs found and dark for bugs not found. `fix_lost_shelf`: a display of the player's out-of-bounds items. `fix_moon_pedestal`: holds the golden marble and triggers the finale secret.

**Secrets here.** `secret_gnome_inside`, `secret_constellations`, `secret_golden_marble_home`. The telescope also shows a dark, chubby, eight-legged constellation until Wubbo is found, a clue for `mystery_tiny_squeak`.

**Unlock.** `mystery_gnome_nose`. See section 12.

---

## 4. The bug cast

Sixteen bugs. Five are there when the game starts. Ten are found through curiosity. One is the hidden 16th.

### Shared body plan

Every bug is built from the same parts so hats, paint and animations work on all of them:

- **Body:** 1 to 6 ellipses or rounded polygons. Paint applies to the body shapes only.
- **Head:** a circle or ellipse with a `head_anchor` point on top for hats and a `face_anchor` for glasses and mustaches.
- **Eyes:** two white circles with black pupils. Pupils track targets. Blinks every 2–6 s. Eye shapes change per emotion (see reactions).
- **Mouth:** a curve or small shape with a `mouth_anchor`. Opens for eating and talking.
- **Legs:** 4, 6 or 8 two-segment lines animated procedurally with a step cycle.
- **Antennae:** optional. Spring-simulated so they wobble after motion.
- **Hand anchor:** where held items attach. Bugs "hold" with their front legs.
- **Collider:** one capsule or circle per bug for physics. Bugs are dynamic bodies that keep upright with a torque spring unless dizzy, rolled or airborne.

Size classes: `small` (collider 40–50 px), `medium` (60–75 px), `large` (90–120 px). Hats scale by the head radius, so one hat asset fits every bug.

### Cast table

| # | ID | Name | Species | Size | Home area | Starts |
|---|---|---|---|---|---|---|
| 1 | `bug_ladybug_dot` | Dot | Ladybug | small | `area_stump_plaza` | Yes |
| 2 | `bug_pillbug_rollo` | Rollo | Pill bug | small | `area_stump_plaza` | Yes |
| 3 | `bug_snail_glorp` | Glorp | Snail | medium | `area_stump_plaza` | Yes |
| 4 | `bug_grasshopper_boing` | Boing | Grasshopper | medium | `area_stump_plaza` | Yes |
| 5 | `bug_waterstrider_skeet` | Skeet | Water strider | medium | `area_puddle_pond` | Yes |
| 6 | `bug_stinkbug_whiff` | Whiff | Stink bug | small | `area_under_porch` | Found |
| 7 | `bug_moth_luma` | Luma | Moth | medium | `area_under_porch` | Found, night |
| 8 | `bug_firefly_flick` | Flick | Firefly | small | `area_puddle_pond` | Found, night |
| 9 | `bug_stagbeetle_moose` | Moose | Stag beetle | large | `area_compost_lab` | Found |
| 10 | `bug_dungbeetle_barty` | Barty | Dung beetle | medium | `area_compost_lab` | Found |
| 11 | `bug_caterpillar_munch` | Munch | Caterpillar, later butterfly | medium | `area_flowerbed_stage` | Found |
| 12 | `bug_bee_buzzby` | Buzzby | Bumblebee | small | `area_flowerbed_stage` | Found |
| 13 | `bug_cricket_fiddle` | Fiddle | Cricket | medium | `area_flowerbed_stage` | Found, night |
| 14 | `bug_mantis_prim` | Prim | Praying mantis | large | `area_treehouse_arcade` | Found |
| 15 | `bug_stickinsect_twig` | Twig | Stick insect | medium | `area_stump_plaza` | Found, hidden in plain sight |
| 16 | `bug_tardigrade_wubbo` | Wubbo | Tardigrade | small, can grow | `area_compost_lab` | Hidden 16th |

"Home area" is where the bug drifts back to when nothing else attracts it. Bugs go anywhere that's unlocked.

### Bug profiles

Likes and dislikes use item IDs or tags. "Loves" gives the biggest reaction and the biggest need boost. Dislikes are refused with a funny reaction, never distress. Each bug has one "weird favorite", something odd that they love, which players find by experiment.

#### Dot (`bug_ladybug_dot`)
- **Look:** Red dome shell `#E8453C` with seven black dots, black round head, large white eyes with a shine. Shell splits open to show tiny wings when she flies.
- **Personality:** Show-off and thrill-seeker. Loves an audience. Always first to try a new toy.
- **Likes:** `item_berry_red`, `item_jelly_bean`, `item_hat_party_cone`, springs, the stage spotlight, being flung. **Weird favorite:** `item_pepper_hot`. She breathes a flame puff and asks for more.
- **Dislikes:** `item_mint_leaf` (sneezes), being ignored for long (she'll walk into view and pose).
- **Signature behavior:** Climbs to the highest reachable point in the area, poses for 2 s, then leaps off and glides down with her wings open.
- **Reactions:** Flung: whoops, spins, lands, and does a "again!" gesture with the pictogram of a spring. Dunked: sputters, then floats on her back like she meant to. Hatted: struts in a small circle.
- **Voice:** Square wave, 520–900 Hz. Fast syllables (9 per second), rising contours, clipped exclamations.
- **Found:** Starts in the plaza, asleep on a bottle cap. She's the first bug the player meets.

#### Rollo (`bug_pillbug_rollo`)
- **Look:** Grey oval `#8E95A3` built from 7 curved bands, lighter belly `#C3C8D1`, 14 tiny legs, small worried eyes.
- **Personality:** Nervous, gentle, gets attached to things. Brave when a friend is nearby.
- **Likes:** `item_rotten_banana_bit`, `item_leaf`, damp dark places, `fix_cobweb_hammock`, Moose. **Weird favorite:** `item_compost_goo`.
- **Dislikes:** `item_pepper_hot`, loud crashes, being high up.
- **Signature behavior:** Curls into a ball when startled, poked 3 times within 1.5 s, or dropped from more than 300 px. As a ball he's a real rolling physics circle (radius 24, restitution 0.6) for 4–8 s, then unrolls and peeks. He also lines up loose pebbles in a neat row near wherever he's resting.
- **Reactions:** Flung: rolls into a ball mid-air and bounces like a marble, then unrolls dizzy. Dunked: sinks and walks along the pond bottom holding his breath with puffed cheeks, then climbs out. Hatted: peeks up at the hat nervously, then smiles.
- **Voice:** Triangle wave, 180–320 Hz, soft, 5 syllables per second, contours that trail off downward.
- **Found:** Starts in the plaza.

#### Glorp (`bug_snail_glorp`)
- **Look:** Soft yellow-green body `#C8E07A`, violet spiral shell `#9B6BD6` with a white swirl line, eyes on long stalks that droop and perk.
- **Personality:** Slow, calm and deadpan. Reacts to chaos with a long "ooooh." Weirdly wise.
- **Likes:** `item_leaf`, `item_moss_tuft`, `item_mint_leaf`, rain, being on top of things. **Weird favorite:** `item_soap_sliver`. He eats it and burps bubbles.
- **Dislikes:** `item_pepper_hot`, speed. `potion_speedy` makes him visibly alarmed, eyes flat out behind him.
- **Signature behavior:** Leaves a slime trail (`tag_slimy` strip, 30 s lifetime) that makes bugs slide and makes light items stick briefly. Climbs any surface, including walls and the underside of the porch. Carries one small item on top of his shell if it lands there.
- **Reactions:** Flung: pulls into his shell and spins like a top on landing. Never dizzy, just "ooooh." Dunked: floats with shell up like a little boat. Painted: stares at his shell for 3 s, then approves.
- **Voice:** Sine with slow vibrato (3 Hz, ±15 Hz), 120–220 Hz, 2 long syllables per second, open vowels.
- **Found:** Starts in the plaza, on top of the stump.

#### Boing (`bug_grasshopper_boing`)
- **Look:** Lime green `#8BD13F` long body, big hinged back legs, long antennae, yellow belly, wide grin.
- **Personality:** Hyper. Can't sit still. Picks playful fights with Moose.
- **Likes:** `item_leaf`, `item_spring_coil`, `item_trampoline`, `item_inst_thimble_drum`, anything bouncy. **Weird favorite:** `item_coffee_bean`. He vibrates in place and then does 10 hops in a row.
- **Dislikes:** `tag_sticky` on his feet (he hops in place, stuck and annoyed), sleep. He's the last to fall asleep at night.
- **Signature behavior:** Moves by hopping (arcs 250–700 px). Sometimes hops onto another bug's head and sits there for a few seconds.
- **Reactions:** Flung: loves it, uses the landing to hop again. Dunked: kicks furiously and shoots out of the water in one hop. Hatted: hops to make the hat fall off and catches it. He never loses it, it's a trick.
- **Voice:** Sawtooth, 400–1200 Hz, very fast staccato chirps (12 per second), with a hard attack.
- **Found:** Starts in the plaza.

#### Skeet (`bug_waterstrider_skeet`)
- **Look:** Slim dark blue-grey body `#3B4A5C` with a blue sheen stripe, four very long thin legs, cool half-closed eyes.
- **Personality:** Laid back. A skater. Unbothered, then suddenly very impressed by physics stunts.
- **Likes:** The pond, wind, `item_acc_sunglasses`, `item_bottlecap_car`, `item_leaf_raft`. **Weird favorite:** `item_ice_cube`. He skates on the ice it makes.
- **Dislikes:** Mud, crowds (4 or more bugs within 200 px make him drift away).
- **Signature behavior:** Walks on water. Skates figure-eights on the pond. On land he walks stiffly on his long legs, which looks awkward and is funny.
- **Reactions:** Flung: spreads his legs like a parachute and floats down. Dropped in water: lands standing on it with a nod. Painted: poses to show it off.
- **Voice:** Sine with a downward glide on every syllable, 250–600 Hz, mixed with soft filtered noise. Slow, drawled (4 per second).
- **Found:** Starts on the pond.

#### Whiff (`bug_stinkbug_whiff`)
- **Look:** Shield-shaped olive body `#8A8F3C` with a row of orange dots along the edge `#E88A2E`, small head, apologetic eyebrows.
- **Personality:** Shy, polite, always embarrassed about his smell. Very kind.
- **Likes:** `item_onion_ring`, `item_compost_goo`, quiet dark spots, Barty. **Weird favorite:** `item_mint_leaf`. He eats it hoping to smell nice. He doesn't, and a green cloud comes out anyway.
- **Dislikes:** Being grabbed without a hover first (he stinks), loud music, the spotlight.
- **Signature behavior:** When startled he releases a green stink cloud (`tag_smelly` area, radius 150 px, 6 s). Then he looks embarrassed and fans it away with his legs. Other bugs react to the cloud by personality.
- **Reactions:** Flung: stink trail behind him like a comet. Dunked: comes out clean, sparkling, and proud for 20 s, then the smell comes back. Hatted: tips the hat politely.
- **Voice:** Square wave through a low-pass filter at 900 Hz, 150–300 Hz, a nervous 7 Hz tremolo, short apologetic phrases.
- **Found:** `secret_whiff_found`. When the lattice panel moves, a pair of eyes rushes behind a flowerpot. Hovering the pot shows eyes peeking out. Poke the pot and Whiff pops out with a stink puff and joins.

#### Luma (`bug_moth_luma`)
- **Look:** Fuzzy pale lavender `#CFC3E8` body, broad wings with two big eye-spots `#6B5BA6`, feathery antennae, sleepy eyes.
- **Personality:** Dreamy and easily distracted. Drifts toward anything bright.
- **Likes:** `fix_porch_lamp`, anything with `tag_glowing`, `item_honey_drop`, `item_petal`. **Weird favorite:** `item_acc_headlamp`. Wearing it, she tries to fly toward her own head and spins in circles.
- **Dislikes:** Daylight (she naps through most of the day), wind.
- **Signature behavior:** Flies in slow loops. At night she orbits the brightest light within 800 px. Two moths plus Luma circling the lamp is a common sight.
- **Reactions:** Flung: flutters and recovers in the air, never hits the ground unless heavy. Dunked: wings get soggy, she walks around dripping and shakes like a dog. Painted: wing spots change color with the paint.
- **Voice:** Breathy filtered noise plus sine at 300–500 Hz, slow sighing syllables (3 per second), soft attack.
- **Found:** `secret_luma_found`. At night, with `fix_porch_lamp` on, Luma flies in within 20 s and stays.

#### Flick (`bug_firefly_flick`)
- **Look:** Small black body, red-orange head cap `#E85A2E`, big glowing tail `#D8FF4F` that lights a 180 px radius at night.
- **Personality:** Excitable and a bit of a prankster. Talks in blinks as much as noises.
- **Likes:** Night, `item_flashlight_pen`, `item_jar_glass` (he sits in open jars like a lantern), music. **Weird favorite:** `item_battery_toy`. He sits on it and glows three times brighter.
- **Dislikes:** Daylight (sleeps inside a closed flower), stink clouds.
- **Signature behavior:** Blinks in time with the music's beat. At night other bugs gather near him. He sneaks up behind bugs and flashes, and they jump.
- **Reactions:** Flung: leaves a light streak. Dunked: his glow fizzes out with a "pfft" and relights 3 s later. Hatted: glow shines through the hat.
- **Voice:** Sine blips, 800–1600 Hz, with a short echo (120 ms delay). Rhythmic, often in groups of three.
- **Found:** `secret_firefly_flick`. At night at the pond, ambient fireflies blink over the reeds. Any light toggled within 300 px of the reeds makes them blink back. Toggle a light 3 times in a row there (the flashlight pen, or a glowing bug dropped and grabbed 3 times) and one firefly answers with a bigger blink, flies to the cursor, and becomes Flick.

#### Moose (`bug_stagbeetle_moose`)
- **Look:** Big glossy red-brown `#5A2A1E` body with a white highlight stripe, huge antler mandibles `#7A3A26`, small kind eyes.
- **Personality:** Gentle giant. Helpful. Secretly ticklish.
- **Likes:** `item_apple_core`, heavy things, Rollo, tiny hats on his huge head (especially `item_hat_tiny_top_hat`). **Weird favorite:** Being tickled (hold-poke). He tries to stay serious and fails.
- **Dislikes:** Tight spaces, `potion_tiny` (he becomes very small and very loud).
- **Signature behavior:** Lifts and carries heavy items over his head. Helps bugs that are stuck: pushes a bug off its back, pulls a bug out of a sticky trap. Counts as "heavy" for the bucket lift on his own.
- **Reactions:** Flung: heavy thud, small screen nudge, he gets up and dusts off. Dunked: sinks, walks out along the bottom, and emerges covered in pond weed. Hatted: sits very still so it doesn't fall.
- **Voice:** Sawtooth through a 500 Hz low-pass, 80–160 Hz, slow (3 per second), rumbling.
- **Found:** `secret_moose_found`. In the compost lab, behind the shelves, Moose is stuck on his back with his legs waving. Grab him and drop him upright, or let him get knocked over by anything. He does a happy stomp and joins.

#### Barty (`bug_dungbeetle_barty`)
- **Look:** Round iridescent shell that shifts between teal `#2E8B7A` and violet `#6A4FA3` as he moves, shovel-shaped head, strong back legs.
- **Personality:** Proud collector. Pompous about his ball.
- **Likes:** `item_dung_ball`, `item_compost_goo`, marbles, anything round. **Weird favorite:** `item_marble_gold`. He refuses to give it up for 30 s.
- **Dislikes:** Baths. He gets washed and looks outraged for 10 s.
- **Signature behavior:** Rolls round items backward with his hind legs. Packs loose small items that nobody set up (see the setup rule in section 5) into a "junk ball" that he then rolls. The player can grab the junk ball and shake it, which scatters the items.
- **Reactions:** Flung: tucks into a ball shape mid-air. Dunked: floats, grumbling. Fed something he dislikes: rolls it away from him instead of spitting.
- **Voice:** Square wave, 110–260 Hz, pompous with huffs (noise bursts) between phrases.
- **Found:** `secret_barty_found`. He's in the compost heap, rolling a dung ball back and forth and ignoring everyone. Roll any marble or ball to him. He's thrilled, rolls both at once, and joins.

#### Munch (`bug_caterpillar_munch`)
- **Look:** Six green segments `#7CCB4A` with yellow spots, a round head, tiny stub feet, and a massive smile. Butterfly form: slim body with big orange and teal wings `#FF9F1C`, `#2EC4B6` in a mirrored pattern.
- **Personality:** Always hungry. Cheerful. Eats first, thinks later.
- **Likes:** Every food with `tag_leafy`, `item_mint_leaf`, `item_petal`. **Weird favorite:** `item_paper_scrap`. He eats it and burps confetti.
- **Dislikes:** `item_pepper_hot`, `item_onion_ring`.
- **Signature behavior:** Inches along with a wave through his segments. Nibbles leaves, which leaves visible bite holes in them. Metamorphosis: after eating 5 `tag_leafy` foods, the next time night falls he climbs something and hangs as a cocoon until dawn, then emerges as a butterfly. The butterfly version flies and has its own animations and reactions. If butterfly Munch eats 5 leafy foods again and sleeps a night, he goes back to caterpillar, because he misses munching. Both forms are journal entries.
- **Reactions:** Fed: chews with a visible lump traveling down his segments. Flung: stretches like a spring and snaps back. Dunked: floats in a U shape.
- **Voice:** Triangle wave, 300–600 Hz, mouth-full muffled filter, lots of "nom" syllables.
- **Found:** `secret_munch_found`. A curled-up leaf in the flowerbed has fresh bite holes and rustles every few seconds. Click it and it unrolls, dropping Munch out mid-bite.

#### Buzzby (`bug_bee_buzzby`)
- **Look:** Round fuzzy yellow `#FFD23F` with three black stripes, tiny fast-blurring wings, a blunt nub stinger (never used).
- **Personality:** Busy, bossy, organized. Hums to herself.
- **Likes:** `item_pollen_puff`, `item_honey_drop`, flowers, music. **Weird favorite:** `item_acc_mustache`. She wears it with total seriousness and hums lower.
- **Dislikes:** Rain, stink, bugs that are being lazy (she buzzes at sleeping bugs).
- **Signature behavior:** Collects pollen from open flowers and flies it to the nearest thimble on the ground. Every 5 deliveries she fills it with a new `item_honey_drop`. She's the renewable honey source.
- **Reactions:** Flung: buzzes angrily and flies back on her own before landing. Dunked: sputters, shakes, and her fuzz frizzes for 10 s. Painted: her stripes stay black, only the yellow changes.
- **Voice:** Sawtooth with heavy 25 Hz vibrato to make a buzz, 250–450 Hz, fast (8 per second).
- **Found:** `secret_buzzby_found`. A closed tulip on the stage-left side vibrates and hums. Play any instrument on the stage during the day. The tulip opens and Buzzby comes out dancing.

#### Fiddle (`bug_cricket_fiddle`)
- **Look:** Dark brown `#6B4226` body, very long antennae, back legs shaped like violin bows, a small beret-shaped dark spot on the head.
- **Personality:** Moody musician. Takes music seriously and gets offended when interrupted.
- **Likes:** Instruments, `fix_flowerpot_stage`, night, `item_seed_sunflower`. **Weird favorite:** `item_inst_comb_kazoo`, which he plays with great dignity.
- **Dislikes:** Bright light, being interrupted while playing (he stops and stares at the player's cursor).
- **Signature behavior:** Plays his legs at dusk and night. Starts the evening chorus. Picks up any instrument and plays a phrase that fits the key.
- **Reactions:** Flung: holds a long note all the way down. Dunked: sad violin slide. Hatted: adjusts it with a leg.
- **Voice:** Band-passed sawtooth with a bowed attack, 600–1400 Hz, legato phrases.
- **Found:** `secret_fiddle_found`. At night, chirping comes from under the flowerpot stage. Make the sequencer play a pattern with at least 4 active mushrooms while it's night. Fiddle climbs out and plays along.

#### Prim (`bug_mantis_prim`)
- **Look:** Tall, slim, bright green `#6FE36F`, triangular head, huge eyes, folded front arms.
- **Personality:** Dramatic and stylish. A fashion judge and a martial-arts poser.
- **Likes:** Hats and accessories of any kind, the spotlight, `item_honey_drop`, tidy stacks. **Weird favorite:** `item_hat_chef`. Wearing it she "karate chops" food, splitting it in two.
- **Dislikes:** Slime, stink, mess.
- **Signature behavior:** Strikes slow poses. Karate-chops floating things like bubbles and balloons, which pops them. When a bug near her wears a hat, she inspects it and gives a pictogram verdict: a sparkle for approve, a raised eyebrow for "hmm."
- **Reactions:** Flung: does a slow-motion spin and lands in a pose. Dunked: rises out dripping, perfectly still, eyes narrowed. Painted: poses for the camera if photo mode is open.
- **Voice:** Sine plus a light FM wobble, 350–700 Hz, precise, clipped, with dramatic pauses.
- **Found:** `secret_prim_found`. The first time the player uses `fix_jar_claw`, it grabs Prim, who was hiding in the prize heap. She's outraged, then joins.

#### Twig (`bug_stickinsect_twig`)
- **Look:** Identical to `item_twig`: a brown stick `#8B6A45` with two nubs. When revealed, six thin legs unfold and two tiny eyes open near one end.
- **Personality:** Deadpan, extremely still, convinced nobody can see him.
- **Likes:** Being stacked on things, bridging gaps, `item_leaf`, the dark. **Weird favorite:** Being used as a prop. He's happy when put in a bucket or used as a seesaw plank.
- **Dislikes:** Being looked at. He freezes whenever the cursor is within 250 px.
- **Signature behavior:** Moves only when the cursor is far away. When two surfaces have a gap smaller than 160 px, he may lie across it as a bridge, and other bugs walk over him.
- **Reactions:** Flung: stays rigid like a thrown stick, lands, then one eye opens to check. Dunked: floats like a stick. Hatted: looks absurd and doesn't move.
- **Voice:** Very quiet. Dry clicks (noise bursts through a 3 kHz band-pass) with an occasional low "hm" at 140 Hz.
- **Found:** `secret_twig_blinks`. One of the plaza twigs isn't an item. Every 20–40 s it opens two tiny eyes for 400 ms when the cursor is at least 250 px away. Poke it while the eyes are open, or grab it and notice it has legs. It sighs and joins.

#### Wubbo (`bug_tardigrade_wubbo`), the hidden 16th
- **Look:** A chubby eight-legged water bear, translucent peach `#F5B7A1` with a soft outline, tiny claws, a round tube mouth, beady eyes. Drawn with a slight inner glow.
- **Personality:** Unbothered by anything. Laughs at everything. Indestructible and happy about it.
- **Likes:** `item_moss_tuft`, water, extremes of all kinds. **Weird favorite:** Being frozen. He freezes into an ice cube, and when thawed he laughs and asks for more.
- **Dislikes:** Nothing. Dislike reactions play as laughter.
- **Signature behavior:** Never gets dizzy. Walks slowly on all eight legs. When other bugs are dizzy, he goes over and pats them, and they recover 50 percent faster.
- **Reactions:** Every reaction is a delighted version of the normal one.
- **Voice:** Soft sine, 200–350 Hz, bubbly (fast amplitude wobble at 12 Hz), giggly.
- **Found:** `mystery_tiny_squeak`. See section 12.

### Social relationships

Each pair of bugs has an affinity from −1 to 1, set by the table below and nudged by events (sharing food +0.05, bumped while flung −0.02, both at a band +0.03). Affinity changes how often they interact. It never produces rivalry drama. The lowest value means "ignores," not "hates."

| Pair | Start affinity | Flavor |
|---|---|---|
| Dot and Boing | 0.6 | Dare each other on springs |
| Rollo and Moose | 0.8 | Moose protects Rollo, Rollo rides on Moose |
| Glorp and Twig | 0.5 | Both enjoy standing still together |
| Whiff and Barty | 0.7 | Barty likes the smell |
| Buzzby and Fiddle | 0.4 | Both music bugs, Buzzby keeps time |
| Luma and Flick | 0.6 | Luma follows Flick's glow |
| Prim and anyone wearing a hat | +0.3 bonus | Fashion inspections |
| Skeet and Dot | 0.3 | Skeet is impressed by Dot's stunts |
| Munch and everyone | 0.4 | Tries to share food, then eats it himself |
| Wubbo and everyone | 0.5 | Pats everyone |
| Default | 0.1 | |

---

## 5. Bug AI

### Needs

Each bug has five needs, 0 to 100, where 100 is fully satisfied. They drive behavior only. Nothing bad happens at 0. A bug at 0 just shows a thought bubble for that need and weights it heavily. Needs don't change while the game is closed or while the bug is in the pocket.

| Need | ID | Base decay per second | Refilled by | Low-need thought bubble |
|---|---|---|---|---|
| Hunger | `need_hunger` | 0.25 | Eating food. Liked food +40, loved +60, neutral +20 | Picture of a liked food |
| Fun | `need_fun` | 0.30 | Using toys, being flung (if they like it), dancing, playing music | Picture of a liked toy |
| Energy | `need_energy` | 0.10 day, 0.25 night | Sleeping (+1.5/s), sitting (+0.3/s) | "Zzz" pictogram |
| Social | `need_social` | 0.18 | Social interactions (+15 to +30) | Picture of their highest-affinity friend's face |
| Cleanliness | `need_clean` | 0.02, plus events: mud −30, slime −20, compost −25, stink cloud −10 | Pond +100, rain +2/s, grooming +20 | Water droplet pictogram |

Each bug has a personality weight per need from 0.5 to 1.5 (for example Munch has hunger 1.5, Barty has cleanliness 0.5, Boing has fun 1.4 and energy 0.6). The weight multiplies both decay and the urgency score.

**Mood** is derived each second and drives face, voice contour and animation speed:

| Mood | Condition | Face |
|---|---|---|
| `mood_happy` | Average need ≥ 65 and no need under 25 | Big smile, bouncy idle |
| `mood_content` | Default | Small smile |
| `mood_bored` | Fun under 25 | Half-lidded eyes, sighs, kicks pebbles |
| `mood_hungry` | Hunger under 25 | Rubs belly, stomach rumble sfx |
| `mood_sleepy` | Energy under 20 | Yawns, droopy antennae |
| `mood_grumpy` | Recently annoyed (disliked food, flung by a bug that dislikes it) for 8 s | Furrowed brows, puff of steam |
| `mood_silly` | Under a potion effect | Wobbly eyes |

### Smart objects and advertisements

Every item and fixture carries a list of advertisements. An advertisement says what need it helps, by how much, and what action the bug performs.

```
advert = {
  action: "eat" | "ride" | "bounce" | "play_instrument" | "sit" | "sleep" | "splash" | "roll" | "wear" | "inspect" | "dance" | "hide" | "carry" | "climb",
  needs: { need_fun: 25, need_energy: -5 },   // expected change per use
  duration: [3, 8],                            // seconds, random in range
  slots: 1,                                    // how many bugs at once
  requires: { tags_absent: ["tag_player_setup"] } // optional conditions
}
```

Examples:

| Object | Action | Need deltas |
|---|---|---|
| `item_spring_coil` | bounce | fun +30, energy −5 |
| `fix_pond_water` | splash | clean +100, fun +10 |
| `item_berry_red` | eat | hunger +20 base, modified by likes |
| `fix_cobweb_hammock` | sleep | energy +1.5/s |
| `item_inst_thimble_drum` | play_instrument | fun +20, social +5 per nearby listener |
| `fix_flowerpot_stage` | dance | fun +15, social +10 |
| Another bug | chat, bump, play tag, share food | social +15 to +30 |
| Any new item the bug hasn't touched | inspect | fun +8, one time per item instance |

New items the player brings into an area advertise `inspect` with a novelty bonus for 60 s. That's how bugs "notice your thing" and walk over to sniff it.

### Action selection

Every 1.5 s (staggered per bug so they don't sync), an idle or wandering bug scores every advertisement within its perception radius (900 px, or the whole area for strong needs under 15):

```
score = Σ over needs ( urgency(need) × personality_weight × advert_delta )
        × like_multiplier          // loved 2.0, liked 1.5, neutral 1.0, disliked 0.2
        × distance_falloff         // 1 / (1 + distance / 600)
        × novelty                  // 1.6 if never used this object instance, else 1.0
        × recent_use_penalty       // 0.4 if used in last 60 s
        × memory_modifier          // see below
        + random(0, 6)

urgency(n) = ((100 - n) / 100) ^ 2 × 100
```

The bug takes the top 3 scores and picks one with weights 60/30/10. If nothing beats 8, it wanders or runs an idle animation. Commitment: once a bug picks an action, it doesn't re-score until the action ends or is interrupted, unless another need falls under 10.

**Memory.** Each bug remembers the last 8 notable events with an object or bug, decaying over 120 s. A bug that got flung from the spring and dislikes flinging gets memory_modifier 0.3 for that spring. A bug that loves it gets 1.5 and runs back for another go.

### States

| State | What the bug does | Exits to |
|---|---|---|
| `st_idle` | Plays idle animations: blink, look around, scratch, hum, yawn, look at cursor | `st_seek` when an action is chosen; `st_wander` after 2–5 s |
| `st_wander` | Walks to a random point within 600 px, prefers home area | `st_idle`, `st_seek` |
| `st_seek` | Pathfinds to the target along the ground, climbing ramps and hopping small gaps per species | `st_use` on arrival, `st_idle` if target gone or unreachable after 10 s |
| `st_use` | Runs the advertisement's action animation for its duration, applies need deltas | `st_idle` |
| `st_social` | Faces another bug, speech bubbles with pictograms, runs a pair animation | `st_idle` |
| `st_eat` | Chews, swallows, reaction | `st_idle` |
| `st_sleep` | Curls up, snore bubbles "Zzz". Wakes when energy reaches 100 at dawn, or when poked, grabbed or hit hard | `st_idle`, `st_held`, `st_airborne` |
| `st_held` | Dangles from the cursor, legs flail, grab reaction | `st_airborne` on fling, `st_landing` on drop, `st_pocketed` |
| `st_airborne` | Ragdoll-lite: body rotates freely, stretched by velocity | `st_landing` on contact, `st_swim` on entering water |
| `st_landing` | Squash on contact. Measures impact speed | `st_dizzy` if over threshold, else `st_recover` |
| `st_dizzy` | Stars orbit head, eyes become spirals, wobbly walk in a small circle | `st_recover` after duration |
| `st_recover` | Shakes it off, personality reaction (again gesture, grumpy steam, dust-off) | `st_idle` |
| `st_swim` | Floats or sinks per species. Paddles toward nearest shore | `st_idle` on shore, then a shake-dry animation |
| `st_rolled` | Rollo-style ball, or any bug under `potion_bouncy` | `st_idle` |
| `st_hide` | Hides behind the nearest large object, eyes peeking | `st_idle` after 3–8 s |
| `st_ride` | Seated in a ride fixture or vehicle | `st_idle` when ride ends |
| `st_perform` | On the stage, plays an instrument or dances to the beat | `st_idle` |
| `st_react` | Short one-shot reaction (fed, hatted, painted, poked, stink nearby) | Returns to the state before |
| `st_pocketed` | Frozen in the pocket, eyes peeking | `st_held` when dragged out |

Any state except `st_pocketed` can jump to `st_held` when grabbed. Grabbing always wins.

### Reactions to the player

Every reaction type has at least 3 animation variants and 3 voice lines per bug, picked without immediate repeats. Personality chooses the flavor.

| Event | Detection | Base reaction | Personality flavor examples |
|---|---|---|---|
| Grabbed | Press on bug | Startle squash, legs flail, gasp | Dot giggles; Whiff stinks; Twig stays rigid |
| Poked | Click | Flinch or giggle | 3 fast pokes: Rollo balls up, Boing hops away, Moose pretends not to notice |
| Tickled | Hold-poke | Escalating laughs | Moose tries not to laugh |
| Flung | Release ≥ 250 px/s | "Whee" or yelp, spin | Dot loves it; Rollo balls up; Skeet parachutes |
| Dropped gently | Release < 250 px/s | Lands on feet, small bounce | Glorp "ooooh" |
| Hard landing | Impact ≥ 900 px/s | Dizzy for 2–4 s | Wubbo laughs instead |
| Very hard landing | Impact ≥ 1600 px/s | Dizzy 4–6 s, 5 stars, eyes spiral | Moose shakes the ground slightly |
| Dropped in water | Enters `fix_pond_water` | Splash, sputter, swim to shore, shake off | Skeet stands on it; Glorp floats like a boat |
| Fed a loved food | Mouth drop | Happy chew, sparkles, voice rising | Dot: flame puff for pepper |
| Fed a liked food | Mouth drop | Chew, nod | |
| Fed neutral | Mouth drop | Chew, shrug | |
| Fed disliked | Mouth drop | Chews once, face goes green, spits it out with a "ptoo" arc, or burps a small cloud | Barty rolls it away |
| Hatted | Head drop | Looks up at the hat, reaction | Prim approves or raises an eyebrow |
| Painted | Paint drop | Looks at itself, surprised, then spins to see | Whiff embarrassed; Skeet poses |
| Stink cloud nearby | Inside a `tag_smelly` area | Holds nose, fans, walks away | Barty and Whiff sniff happily |
| Gets hit by a flung item | Contact with item at ≥ 400 px/s | "Oof", looks at the cursor with narrowed eyes | Moose barely notices |
| Cursor fast nearby | Cursor speed > 1500 px/s within 300 px | Flinch | Twig freezes harder |

**Dizzy rules.** Dizzy duration is `clamp((impact_speed − 900) / 250, 0, 4) + 2` seconds. Repeated hard landings within 10 s add 1 s each, capped at 8 s. Dizzy bugs can still be grabbed and flung. While dizzy, a bug walks in a small wobbly circle and bumps into things softly. After recovery, a bug with fling-dislike walks away from the cursor for 5 s. A fling-lover walks toward the nearest launcher.

### Bug to bug interactions

Social actions are advertisements that bugs offer each other. A bug picks one when its social need scores highest, weighted by affinity.

| ID | Interaction | What happens |
|---|---|---|
| `soc_chat` | Chat | Two bugs face each other and trade pictogram speech bubbles (a food, a hat, a star, a question mark) with gibberish. 3–6 exchanges. |
| `soc_share_food` | Share | A bug holding food walks to a friend and offers it. The friend eats half. Munch offers, then eats it himself 50 percent of the time. |
| `soc_tag` | Tag | One bug taps another and runs. They chase for 5–10 s. |
| `soc_bump` | Bump | Head bump greeting, small bounce, "boop" sound. |
| `soc_copy` | Copy | A bug mimics another's current animation for 4 s. |
| `soc_show_off` | Show off | A hatted or painted bug walks up to a friend and poses. The friend reacts. |
| `soc_gawk` | Gawk | Any loud event (hard landing, potion effect, crash of a stack) within 700 px makes idle bugs turn and look. Some point and laugh (a pictogram of a laughing face), some cheer. Never mocking. The victim often laughs too. |
| `soc_comfort` | Comfort | A bug near a dizzy friend pats it. Dizzy time −25 percent. |
| `soc_band` | Band | Two or more bugs with instruments within 300 px play together on beat. |
| `soc_carry_friend` | Carry | Moose may carry a small bug on his back for a walk. |
| `soc_wrestle` | Wrestle | Boing and Moose push against each other, both grinning, 4 s, no winner. |

### Day, night and weather behavior

- At dusk, bugs with night preference wake (Luma, Flick, Fiddle). Day bugs look for a sleep spot when energy is under 50 or it's full night. Sleep spots are fixtures and items advertising `sleep`: flower cups, the cobweb hammock, leaves, matchboxes, the bead pit. A bug with no sleep spot within reach sleeps where it stands.
- A sleeping bug is never forced awake by the AI. The player can wake it. A woken bug is groggy for 3 s, then either stays awake or goes back to sleep after 20 s if energy is still low.
- Rain: bugs that dislike rain seek cover under leaves, the porch or the stump overhang. Bugs that like it (Glorp, Wubbo, Skeet) go out and splash. Anything under the sky gets `tag_wet` over time.
- Wind: small bugs lean into it. Flying bugs drift. Light items blow around.

### The setup rule: bugs never undo the player

This is a hard rule and has tests.

1. Any item the player has grabbed and released gets `tag_player_setup` for 300 s. The timer resets whenever the player touches it again.
2. Items joined into a structure (glued by `tag_sticky`, snapped to the pegboard, stacked with 3 or more resting contacts, or crafted into a contraption) keep `tag_player_setup` permanently until the player pulls them apart.
3. Hats, accessories and paint the player puts on a bug stay until the player removes them, the bug is washed (paint only), or a potion ends. Bugs never take off their own hats. Grooming removes mud, slime and dust, never paint.
4. Bugs may **use** a player setup in place: ride the seesaw, bounce on the spring, play the drum, walk over the bridge. They may not **carry, roll, pack or eat** it. Barty's junk-ball and Rollo's pebble rows only take items without the tag. Food with the tag is still offered as an advertisement but only eaten when the player drops it on a mouth or when it's been untouched for 300 s.
5. Bugs may bump player setups by accident while walking. Their walk forces are capped at 30 percent of a light item's mass × gravity so they can nudge but not topple a stable stack. Physics from flung bugs is the player's doing, so that's allowed to wreck anything.
6. Bugs never walk into the cauldron, the workbench or a sequencer grid.

### Off-screen simulation

Areas outside the camera's area and its neighbors sleep. Bugs in sleeping areas skip physics and run a cheap tick every 2 s: needs decay, and a bug picks a coarse action ("go to area X", "sleep here", "play at fixture Y") and teleports to a plausible spot near that target when its area wakes. Bugs travel between areas on foot at 60 px/s in the coarse model. Returning to an area always shows bugs doing something, not frozen in their last pose.

Cap: 16 bugs active with full AI at 60 fps is the target. If frame time goes over 14 ms, bugs more than 1.5 screens from the camera drop to a 4 Hz AI tick.

---

## 6. Object and property system

Everything physical has one **material** and any number of **tags**. Materials set default physics. Tags are states that come and go and interact by rule. Following BotW's chemistry, tags change other tags and materials react to tags, but materials never change materials directly.

### Materials

| Material | Density (water = 1) | Restitution | Friction | Impact sound | Default tags |
|---|---|---|---|---|---|
| `mat_wood` | 0.6 | 0.3 | 0.6 | Hollow knock | `tag_floaty` |
| `mat_stone` | 2.5 | 0.15 | 0.7 | Clack | `tag_heavy` |
| `mat_metal` | 3.0 | 0.25 | 0.4 | Clink | `tag_magnetic`, `tag_heavy` |
| `mat_rubber` | 1.1 | 0.85 | 0.9 | Boing | `tag_bouncy` |
| `mat_glass` | 2.2 | 0.3 | 0.2 | Tink | `tag_fragile` |
| `mat_leaf` | 0.4 | 0.1 | 0.8 | Soft rustle | `tag_floaty`, `tag_light`, `tag_leafy` |
| `mat_cloth` | 0.5 | 0.05 | 0.9 | Muffled flump | `tag_light`, `tag_absorbent` |
| `mat_paper` | 0.5 | 0.1 | 0.7 | Crinkle | `tag_light`, `tag_floaty` |
| `mat_plastic` | 0.9 | 0.5 | 0.5 | Plick | `tag_floaty` |
| `mat_food` | 0.9–1.2 | 0.2 | 0.6 | Squish | `tag_edible` |
| `mat_jelly` | 1.0 | 0.6 | 0.95 | Splort | `tag_sticky` |
| `mat_shell` | 1.2 | 0.35 | 0.5 | Crack | `tag_fragile` |
| `mat_bug` | 1.0 | 0.4 | 0.7 | Per bug voice + thud | none |

### Tags

| Tag | Look | Physics or behavior | Wears off |
|---|---|---|---|
| `tag_wet` | Blue drip particles, darker tint 15% | Friction ×0.7, heavier ×1.1 | 30 s in air, instantly by heat |
| `tag_sticky` | Glossy highlight, stringy strands when pulled | On contact, creates a weld joint (breaks at 900 px/s pull). Bugs with sticky feet can walk on walls | Water or soap removes it |
| `tag_slimy` | Green sheen, drips | Friction ×0.1 for bugs walking on it, light items stick for 2 s | 30 s, water |
| `tag_bouncy` | Faint spring lines on impact | Restitution 0.9 | Material default |
| `tag_hot` | Orange glow edge, heat shimmer, steam when wet | Melts `tag_frozen`, dries `tag_wet`, pops `item_popcorn_kernel`, cooks raw food into toasted versions | 20 s |
| `tag_frozen` | Pale blue tint, frost sparkle, icy outline | Friction ×0.05 (slides), bugs frozen solid in a block for 4 s then thaw | 15 s or heat |
| `tag_cold` | Blue puff breath | Turns `tag_wet` into `tag_frozen` on contact | 10 s |
| `tag_smelly` | Wavy green lines, cloud particles | Aura radius 150 px. Bugs react by personality. Wind carries the cloud | 20 s, or water |
| `tag_glowing` | Additive glow, light radius 160 px | Lights the night, attracts Luma and moths | 60 s from potions, permanent on glow items |
| `tag_magnetic` | Tiny red-blue horseshoe icon on scope | Magnets pull `tag_magnetic` items within 250 px (force falls off with distance squared) | Permanent |
| `tag_floaty` | None | Floats in water | Material default. Wet paper sinks after 20 s |
| `tag_lifty` | Upward drift lines | Negative gravity 0.3 g. Rises in air until a ceiling | Balloons: until popped. Potions: 60 s |
| `tag_fragile` | Crack lines on scope view | Breaks into 2–4 pieces on impact over 700 px/s. Pieces are new items (see catalog) | Permanent |
| `tag_edible` | None | Can be eaten | Permanent |
| `tag_heavy` | None | Mass ×3. Sinks. Counts for weight puzzles | Material default |
| `tag_light` | None | Blown by wind, carried by bubbles | Material default |
| `tag_sparky` | Little zigzag sparks | Touching water electrifies the water for 2 s: every bug in it gets `tag_fuzzy` hair | 10 s |
| `tag_fuzzy` | Hair sticks out in spikes | Cosmetic, bugs find it funny | 20 s |
| `tag_soapy` | White foam bits | With `tag_wet` makes bubbles every 0.5 s. Removes `tag_sticky`, `tag_slimy`, `tag_smelly`, paint | 20 s |
| `tag_fizzy` | Rising bubble particles | Shaken (dragged fast back and forth 3 times) it launches itself upward like a rocket at 1500 px/s | Once per item |
| `tag_muddy` | Brown splotches | Stains other things it touches with `tag_muddy` | Water |
| `tag_leafy` | None | Food for leaf eaters, counts for Munch's metamorphosis | Permanent |
| `tag_absorbent` | None | Soaks up liquid: in water or paint it becomes a soaked version that drips. Shake it while held (3 fast back-and-forth drags) to wring it out onto whatever is below | Permanent |
| `tag_musical` | Note icon on scope | Plays a pitched note in key when struck | Permanent |
| `tag_seed` | None | Wet + in sun (daytime, not raining, outdoors) for 30 s on soil → sprouts into a small plant prop | Consumed |
| `tag_painted` | Paint color layer | Color on bugs and items | Water or soap |
| `tag_player_setup` | None (invisible) | See section 5 | Timer or pulled apart |

### Interaction rules

Rules run when two things touch, or when a thing is inside an area effect (water volume, stink cloud, heat source, rain). Each rule is short and always applies the same way everywhere.

| # | When | Result | Guessable because |
|---|---|---|---|
| R1 | Anything enters water | Gets `tag_wet`. Loses `tag_muddy`, `tag_smelly`, `tag_slimy`, `tag_painted`, `tag_sticky`, `tag_hot` (with a steam puff) | Water cleans |
| R2 | `tag_wet` + `tag_hot` | Both removed, big steam puff, "tsss" | Water on a hot pan |
| R3 | `tag_wet` + `tag_cold` | Becomes `tag_frozen` | Water freezes |
| R4 | `tag_frozen` + `tag_hot` | Becomes `tag_wet`, drip sound | Ice melts |
| R5 | `tag_cold` item touches water surface | That 200 px of the surface freezes into a slippery ice sheet for 30 s. Bugs can walk on it, items slide | Pond freezes |
| R6 | `tag_sticky` + anything | Weld joint on contact | Honey and gum stick |
| R7 | `tag_soapy` + `tag_wet` | Bubble emitter. Bubbles are 20–60 px, drift up, carry `tag_light` items under 20 px, pop on contact with anything sharp or Prim | Soap and water make bubbles |
| R8 | `tag_smelly` near bugs | Each bug in the aura reacts per personality. Stink spreads to `tag_absorbent` items it touches | Smells spread |
| R9 | `tag_sparky` + water | Water fizzes, bugs inside get `tag_fuzzy` hair and a "bzzt" sound | Batteries and water |
| R10 | `tag_magnetic` magnet near `tag_magnetic` metal | Attraction, "clink" snap at contact | Magnets |
| R11 | `tag_fragile` hits something hard | Shatters into pieces with a crunch. Eggshell → `item_eggshell_bit` ×3. Glass jar → never shatters from bug impacts, only from ≥ 1200 px/s, into `item_glass_bead` ×4 (rounded, safe-looking) | Eggshells crack |
| R12 | `tag_hot` + `tag_edible` food for 3 s | Toasted variant (darker, steam, "cooked" pictogram). Toasted foods count as a distinct food with their own likes | Cooking |
| R13 | `tag_hot` + `item_popcorn_kernel` | Pops into `item_popcorn` with a jump | Popcorn |
| R14 | Wind + `tag_light` | Pushed along wind direction, 60–200 px/s | Things blow away |
| R15 | Rain + outdoors | `tag_wet` builds on anything under open sky over 5 s | Rain |
| R16 | `tag_glowing` near a bug at night | Bugs gather in its radius, social +5/s | Campfire |
| R17 | `tag_lifty` item attached to something | Lifts it if total mass is low enough. A balloon can lift a small bug, three balloons lift a medium bug | Balloons |
| R18 | `tag_absorbent` wrung out (shaken while held) | Releases its liquid tag onto what's below: wet, paint, honey, soapy | Squeezing a sponge |
| R19 | `tag_muddy` touches anything | Spreads `tag_muddy` | Mud gets everywhere |
| R20 | `tag_musical` struck at ≥ 150 px/s | Plays its note, quantized to the next 16th note | Things make sounds |
| R21 | Food on `fix_compost_heap` for 60 s | Becomes `item_compost_goo` | Compost |
| R22 | `tag_seed` + `tag_wet` + sun on soil | Sprouts after 30 s | Plants grow |
| R23 | Paint on paint | Colors mix: red + yellow = orange, red + blue = purple, blue + yellow = green, any + white = lighter, any + black = darker. 3+ primaries = brown | Paint mixing |
| R24 | `tag_hot` bug breath (pepper or fire potion) hits `tag_frozen` or ice sheet | Melts it | Fire melts ice |

Implementation note: rules live in one data table keyed by tag pair, with a handler per rule. Each contact pair is checked at most once per 250 ms to keep costs down. Area effects tick at 4 Hz.

---

## 7. Content catalog

Every item below is a physics body drawn from simple shapes. "Area" is where it first appears; most respawn there (see respawn rule). Sizes are the longest dimension in px. Crafted-only items are marked "crafted" and their recipe is in section 8.

**Respawn rule.** Each area has a spawn list. If a spawn-list item has been gone from its area for 10 game minutes (because it was eaten, broken, crafted or carried off), a new one appears at a spawn point: dropped through the porch gaps, falling from a tree, washed up at the pond edge, or popped out of the stump knothole. The player can never run out of basics. Unique items (keys, map scraps, the golden marble, the gnome nose) never respawn and can't be destroyed; if one falls out of bounds it returns to its spawn point.

**Out of bounds.** Anything flung past the top of the sky or off the world's ends reappears at the nearest area edge by falling back down from the sky 3 s later with a whistle, and gets logged on the Gnome Hollow lost shelf.

### 7.1 Physics toys

| ID | Name | Area | Material / tags | Size | What it does |
|---|---|---|---|---|---|
| `item_ruler_ramp` | Ruler ramp | Plaza | wood | 400 | A flat plank with tick marks. Leans on things to make ramps. Bugs slide down it on bottle caps |
| `item_spring_coil` | Spring | Plaza | metal, bouncy, magnetic | 60 | Compressed on contact, launches whatever lands on its top at 1200 px/s along its axis. Can be tilted |
| `item_bottlecap_car` | Bottle-cap car | Plaza | plastic | 70 | A cap on two button wheels. A bug seated in it rolls it. Push it to drive |
| `item_marble_blue` | Blue marble | Plaza | glass, musical | 24 | Rolls fast. Plays notes on musical things. Two more colors below |
| `item_marble_red` | Red marble | Plaza | glass, musical | 24 | Same |
| `item_marble_green` | Green marble | Treehouse | glass, musical | 24 | Same |
| `item_marble_gold` | Golden marble | Hidden (see secrets) | metal, glowing, musical | 28 | Unique. Glows. Barty's obsession. Finale item |
| `item_popsicle_seesaw` | Seesaw | Plaza | wood | 300 | A plank on a cork pivot. Drop something on one end to launch what's on the other |
| `item_spoon_catapult` | Spoon catapult | Compost Lab | metal | 180 | A spoon on a pencil-eraser pivot. Pull the bowl down and let go to launch what's in it |
| `item_rubber_ball` | Rubber ball | Plaza | rubber | 48 | Very bouncy. Fits the can tunnel |
| `item_balloon_red` | Red balloon | Plaza | rubber, lifty | 90 | Floats up on a string. Tie to anything by dropping the string end on it. Pops on sharp things and on Prim. Leaves `item_balloon_scrap` |
| `item_balloon_blue` | Blue balloon | Flowerbed | rubber, lifty | 90 | Same |
| `item_bubble_wand` | Bubble wand | Pond | plastic | 80 | Drag it through the air after dipping it in water (or when soapy) to blow a trail of bubbles |
| `item_marble_track_straight` | Straight track | Treehouse | plastic | 160 | Snaps to the pegboard. Also a mini-ramp anywhere |
| `item_marble_track_curve` | Curve track | Treehouse | plastic | 120 | Quarter-circle piece |
| `item_marble_funnel` | Funnel | Treehouse | plastic | 100 | Spins marbles around before dropping them through |
| `item_domino` | Domino | Treehouse | wood | 50 | Stand them up in a row, knock one over. Each falling domino clicks a rising note |
| `item_spinning_top` | Spinning top | Treehouse | wood | 50 | Drag in a circle then release to spin it for 20 s. Bugs that touch it spin too |
| `item_yo_yo` | Yo-yo | Treehouse | wood | 40 | Drop it from height and it climbs back up its string once |
| `item_leaf_raft` | Leaf raft | Pond | leaf, floaty | 200 | Floats. Holds up to 3 small bugs |
| `item_paper_boat` | Paper boat | Pond | paper, floaty | 120 | Floats, then gets soggy and sinks after 40 s unless dried |
| `item_trampoline` | Tissue trampoline | crafted | cloth, bouncy | 220 | A bouncy platform. Restitution 1.05, capped at 1400 px/s |
| `item_slingshot_twig` | Twig slingshot | crafted | wood, bouncy | 140 | Stands upright. Drag back the band with anything in it and release |
| `item_spring_launcher` | Spring launcher | crafted | metal | 120 | A spring in a cap. Click to fire whatever sits on it, 1600 px/s |
| `item_matchbox_racer` | Matchbox racer | crafted | paper | 120 | Holds 2 bugs. Rolls downhill fast |
| `item_parachute` | Parachute | crafted | cloth, light | 140 | Attach to a bug or item. Falls at 80 px/s max |
| `item_balloon_basket` | Balloon basket | crafted | paper, lifty | 160 | A matchbox under a balloon. Rises slowly with up to 2 bugs, drifts with wind, click to let air out and descend |
| `item_tin_can_phone` | Can phone | crafted | metal | 200 | Two cans on a string. Bug speech at one can appears as a bubble at the other, even across areas |
| `item_magnet_crane` | Magnet crane | crafted | wood, magnetic | 220 | A fishing rod with a magnet. Fish metal items out of the pond |
| `item_pinwheel` | Pinwheel | crafted | paper | 100 | Spins in wind or when fanned by fast cursor motion. Stuck in the ground it plays a whirr |
| `item_disco_ball` | Foil disco ball | crafted | metal | 60 | Hang it (drop near any overhang). Near a light it throws moving sparkle spots. Bugs within 400 px dance |
| `item_straw_rocket` | Straw rocket | crafted | paper, fizzy | 120 | Click to launch once, flies 2 screens up, parachutes down |

### 7.2 Foods

| ID | Name | Area | Tags | Does |
|---|---|---|---|---|
| `item_berry_red` | Red berry | Plaza | edible | Sweet. Most bugs like it. Squished at high speed, it becomes red paint splat |
| `item_blueberry` | Blueberry | Pond | edible | Same, blue |
| `item_sugar_cube` | Sugar cube | Plaza | edible | Very sweet. Ants carry it off if within 300 px of the hill. Opens the Ant Hill |
| `item_leaf` | Leaf | Everywhere | leaf, leafy, edible | Munch food. Also a crafting material. Bitten leaves show holes |
| `item_mint_leaf` | Mint leaf | Pond | leafy, edible, cold | Makes bugs exhale a cold puff. Glorp loves it, Dot sneezes |
| `item_crumb_cookie` | Cookie crumb | Porch | edible | Ants go for it. Neutral for most |
| `item_cheese_puff` | Cheese puff | Porch | edible, light | Leaves orange dust (`tag_muddy`, orange) on the eater's face |
| `item_honey_drop` | Honey drop | Flowerbed | edible, sticky | Sticky. A potion ingredient. Buzzby makes more |
| `item_pollen_puff` | Pollen puff | Flowerbed | edible, light | Makes bugs sneeze a yellow cloud. Buzzby loves it |
| `item_pepper_hot` | Hot pepper flake | Compost Lab | edible, hot | Eater breathes one fire puff (`tag_hot` cone), face goes red, runs to water. Dot loves it |
| `item_ice_cube` | Ice cube | Compost Lab | cold, frozen | Melts in 60 s outside. Eater shivers and says "brrr" |
| `item_coffee_bean` | Coffee bean | Compost Lab | edible | Eater vibrates, moves ×2 speed for 15 s |
| `item_onion_ring` | Onion ring | Compost Lab | edible, smelly | Eater burps a stink cloud. Whiff loves it |
| `item_rotten_banana_bit` | Banana mush | Compost Lab | edible, smelly, slimy | Rollo loves it. Most bugs gag |
| `item_apple_core` | Apple core | Compost Lab | edible, heavy | Moose loves it. Takes 3 bites to finish, visibly shrinks |
| `item_dung_ball` | Dung ball | Compost Lab | edible, smelly, heavy | Barty's treasure. Everyone else refuses it with a big "ew" |
| `item_compost_goo` | Compost goo | Made on the compost heap | edible, slimy, smelly | Rollo, Whiff, Barty love it. Others gag and turn green for 3 s |
| `item_jelly_bean` | Jelly bean | Treehouse | edible, bouncy | Bouncy food. Eater hops once involuntarily |
| `item_seed_sunflower` | Sunflower seed | Flowerbed | edible, seed | Fiddle likes it. Plant it: wet + sun on soil = small sunflower sprout |
| `item_fizz_candy` | Fizz candy | Compost Lab | edible, fizzy | Eater burps bubbles for 5 s. Shake it to launch it |
| `item_popcorn_kernel` | Popcorn kernel | Porch (floor gaps) | edible, seed | Heat it to pop it |
| `item_popcorn` | Popcorn | Made by heat | edible, light, floaty | Everyone likes it. Blows around in wind |
| `item_petal` | Flower petal | Flowerbed (wind) | leafy, edible, light | Luma and Munch like it |
| `item_moss_tuft` | Moss tuft | Compost Lab | leafy, edible, absorbent | Glorp and Wubbo love it. Hides Wubbo |
| `item_ant_crumb` | Ant crumb | Ant Hill Depths | edible, light | A tiny crumb. The `potion_tiny` ingredient |
| `item_lavender_sprig` | Lavender sprig | Flowerbed | leafy, edible | Eater yawns and gets energy −30. Sleep potion ingredient |
| `item_mushroom_cap` | Mushroom cap | Compost Lab shelf | edible, bouncy | Small red cap. Eater's head swells for 3 s. The giant potion ingredient |

### 7.3 Hats and accessories

Four wear slots: `head`, `face`, `back`, `feet`. One item per slot. Every item scales to the bug's anchor.

| ID | Name | Slot | Area | Look and extra effect |
|---|---|---|---|---|
| `item_hat_thimble` | Thimble helmet | head | Plaza | Silver dimpled cup. Metal, magnetic. Bugs wearing it get pulled by magnets |
| `item_hat_acorn_cap` | Acorn cap | head | Plaza | Brown textured cup with a stem |
| `item_hat_party_cone` | Party cone | head | Flowerbed | Striped cone with a pom-pom. Tooting it (poke the bug) plays a party horn |
| `item_hat_flower_petal` | Petal bonnet | head | Pond | Pink petals ring. Attracts Buzzby |
| `item_hat_tiny_top_hat` | Tiny top hat | head | Porch | Black cylinder with a red band. Moose's favorite |
| `item_hat_chef` | Chef hat | head | Compost Lab | Puffy white. Prim chops food with it on |
| `item_hat_propeller` | Propeller cap | head | Treehouse, or crafted | Spins when the bug moves. Wearer falls at half speed and glides |
| `item_hat_viking` | Thimble viking helmet | head | crafted | Thimble with two seed horns. Wearer headbutts things lightly |
| `item_hat_mushroom` | Mushroom cap | head | Plaza mushroom ring (rare drop) | Red with white spots. Bouncy, the wearer bounces off ceilings |
| `item_hat_pirate` | Paper pirate hat | head | crafted | Folded black paper with a white skull-ish button face |
| `item_hat_wizard` | Wizard hat | head | Gnome Hollow | Deep blue cone with gold stars. Glows faintly at night |
| `item_hat_candle` | Birthday candle hat | head | Jar claw prize | Stubby candle with a flame. Glowing, hot. Lights the night, melts ice it touches |
| `item_hat_eggshell` | Eggshell hat | head | Porch (from eggshell) | Cracked half-shell. Wearer looks freshly hatched. Fragile |
| `item_hat_goo` | Goo hat | head | Secret | A green blob of compost goo that wobbles and drips. Smelly |
| `item_hat_bubble` | Bubble helmet | head | Secret | A clear bubble. Wearer breathes underwater and walks on the pond bottom |
| `item_hat_yarn_beanie` | Yarn beanie | head | crafted | Knit texture lines, pom-pom. Wearer is immune to `tag_cold` |
| `item_acc_sunglasses` | Sunglasses | face | Plaza | Black lenses. Wearer doesn't squint in daylight. Luma stays awake in them |
| `item_acc_googly_glasses` | Googly glasses | face | Compost Lab, or crafted | Two googly eyes that jiggle with physics |
| `item_acc_mustache` | Mustache | face | Porch | Curly black. Wearer's voice drops 20 percent |
| `item_acc_monocle` | Monocle | face | Ant Hill (queen's gift) | A bead lens on a string. Wearer inspects items like the scope, showing one tag pictogram |
| `item_acc_snorkel` | Straw snorkel | face | crafted | Wearer can sit underwater with bubbles rising |
| `item_acc_headlamp` | Headlamp | face | crafted | A glow bead on a band. Glowing. Luma chases it |
| `item_acc_bowtie_ribbon` | Ribbon bow tie | back | Flowerbed | Red bow. Prim approves |
| `item_acc_cape_leaf` | Leaf cape | back | Treehouse, or crafted | Flutters when moving. Wearer glides slightly when flung |
| `item_acc_crown_foil` | Foil crown | head | Ant Hill, or crafted | Crumpled foil points. Ants bow when the wearer walks by |
| `item_acc_scarf_yarn` | Yarn scarf | back | crafted | Long trailing scarf with physics |
| `item_acc_backpack_matchbox` | Matchbox backpack | back | crafted | Holds one small item. The bug carries it everywhere |
| `item_acc_bandaid` | Bandage patch | back | Porch | A little pink bandage. Purely cosmetic, bugs show it off |
| `item_acc_roller_skates` | Bottle-cap skates | feet | crafted | Friction ×0.1, the wearer glides and zips down ramps |

### 7.4 Paints and potions

| ID | Name | Area | Does |
|---|---|---|---|
| `item_paint_red` | Red paint drop | Flowerbed puddle | Paints what it's dropped on. Dot, splat, stripe by drop style |
| `item_paint_blue` | Blue paint drop | Flowerbed puddle | Same |
| `item_paint_yellow` | Yellow paint drop | Flowerbed puddle | Same |
| `item_paint_white` | White paint drop | Flowerbed puddle | Lightens mixed colors |
| `item_paint_black` | Black paint drop | Flowerbed puddle | Darkens, and draws spots when dotted |
| `item_paint_glow` | Glow paint | Crafted from paint + glow item on the bench | Paint that glows at night |
| `item_paint_rainbow` | Rainbow paint | Secret (after-rain rainbow) | Paints cycling rainbow stripes |
| `item_potion_<name>` | Potion bottle | Cauldron output | A small round bottle with a cork, filled with the potion's color and a pictogram on the label. Drop on a bug's mouth to drink, or shatter it on a bug for a splash version at half duration. One per potion ID in section 9 |

### 7.5 Junk and crafting materials

| ID | Name | Area | Tags | Notes |
|---|---|---|---|---|
| `item_bottle_cap` | Bottle cap | Plaza, Porch | metal, magnetic | Wheels, crowns, skates, sled for ramps |
| `item_paperclip` | Paperclip | Porch | metal, magnetic | Bends into wands and hooks |
| `item_rubber_band` | Rubber band | Porch | rubber, bouncy, musical | Stretchy. Twanged by poking |
| `item_popsicle_stick` | Popsicle stick | Porch | wood | Planks and levers |
| `item_cork` | Cork | Pond | wood, floaty | Pivots and floats |
| `item_thread_spool` | Thread spool | Porch | wood | Rolls. Produces `item_string` when dragged away from it |
| `item_string` | String | Porch | cloth, light | Ties things together: drop one end on each item |
| `item_button` | Button | Plaza, Porch | plastic, stackable | Wheels and eyes |
| `item_pebble` | Pebble | Everywhere | stone, heavy, stackable | Weights, skipping stones, Rollo's row |
| `item_twig` | Twig | Plaza | wood | Levers, bridges, slingshot frames |
| `item_feather` | Feather | Pond | light, lifty (weak) | Drifts slowly. Tickles bugs on contact. Floaty potion ingredient |
| `item_tin_can` | Tin can | Porch | metal, musical | Drums, phones, containers |
| `item_straw` | Straw | Porch | plastic | Tubes, snorkels, rockets, masts |
| `item_toothpick` | Toothpick | Porch | wood | Axles and pins. Pops balloons |
| `item_matchbox` | Matchbox | Porch | paper | Drawer slides open on click. A container for one item. Baskets, backpacks, harps |
| `item_eggshell` | Eggshell half | Porch | shell, fragile | Breaks into bits. Becomes a hat |
| `item_eggshell_bit` | Eggshell bit | From breaking | shell | Crunchy confetti. Neutral food for Barty |
| `item_gum_blob` | Gum blob | Porch | jelly, sticky | The universal glue. Stick any two things together in the world |
| `item_magnet` | Horseshoe magnet | Porch | metal, magnetic | Pulls metal items within 250 px |
| `item_battery_toy` | Toy battery | Porch | metal, sparky | Sparky. Powers the disco ball's spin. Flick loves it |
| `item_foil_ball` | Foil ball | Porch | metal, magnetic | Crowns, disco balls, mirror potion |
| `item_tissue` | Tissue | Porch | cloth, absorbent, light | Parachutes, trampolines |
| `item_paper_scrap` | Paper scrap | Porch | paper, light | Boats, hats, kazoos |
| `item_comb_tooth` | Comb piece | Porch | plastic, musical | Kazoo base. Scraping it with a twig makes a zip sound |
| `item_sponge` | Sponge | Pond | cloth, absorbent | Soaks up water or paint, squeeze to apply |
| `item_soap_sliver` | Soap sliver | Pond | soapy | Makes bubbles when wet. Cleans everything |
| `item_maple_seed` | Maple seed | Treehouse (falls in wind) | leaf, light | Helicopters down when dropped. Propeller part |
| `item_balloon_scrap` | Balloon scrap | From popped balloons | rubber | Drum skins, balloon potion |
| `item_glass_bead` | Glass bead | Treehouse bead pit, from jars | glass, bouncy | Headlamp part |
| `item_jar_glass` | Glass jar | Compost Lab | glass | Container with a lid. Click to open or close. Flick loves sitting in open ones |
| `item_moon_pebble` | Moon pebble | Pond, night only (see secrets) | stone, glowing | Pale glowing pebble. Upside-down potion ingredient |
| `item_bluebell_bloom` | Bluebell bloom | Flowerbed | leaf, musical | Rings like a tiny bell. Opera potion ingredient |

### 7.6 Instruments

All instruments play notes in the current area's key and snap to the music clock (section 10).

| ID | Name | Area | How the player plays it | How bugs play it |
|---|---|---|---|---|
| `item_inst_thimble_drum` | Thimble drum | Flowerbed, or crafted | Poke it for a hit. Drop things on it | Boing drums on beats 1 and 3, fills on 4 |
| `item_inst_seedpod_maraca` | Seedpod maraca | Flowerbed | Shake it by dragging back and forth | Shakes on 8th notes |
| `item_inst_acorn_castanets` | Acorn castanets | Flowerbed | Poke for a clack | Clacks on off-beats |
| `item_inst_rubber_band_harp` | Matchbox harp | crafted | Drag across its 5 bands to strum | Arpeggiates the current chord |
| `item_inst_comb_kazoo` | Comb kazoo | crafted | Poke to toot, hold-poke for a long note | Fiddle plays melodies, others toot randomly on scale notes |
| `item_inst_bottle_flute` | Bottle flute | Pond (half-sunk, fish it out) | Poke: plays the next note of a 4-note motif | Luma and Glorp play long soft tones |
| `item_inst_can_bass` | Tin can bass | crafted from tin can + rubber band | Poke to thump the root note, hold for fifth | Moose plays root notes on beat 1 |
| `item_inst_leaf_xylophone` | Leaf xylophone | Treehouse | Poke keys, or roll marbles down it | Buzzby taps ascending runs |
| `fix_mushroom_sequencer` | Mushroom sequencer | Flowerbed | Section 10 | Bugs hop on caps to toggle steps (only when the grid is empty; they never change the player's pattern) |

### 7.7 Tools, keys and oddities

| ID | Name | Area | Does |
|---|---|---|---|
| `item_flashlight_pen` | Flashlight pen | Porch | Click to toggle. A cone of light 500 px long. Reveals hidden things in the dark, calls Flick |
| `item_cloud_jar` | Cloud in a jar | Secret | Open it to start rain in the current area for 60 s. Close it to stop. Reusable |
| `item_key_tiny` | Tiny brass key | Pond boot (secret) | Opens `fix_stump_knothole`'s locked back door |
| `item_map_scrap_1` | Map scrap 1 | Stump knothole back room | Part of the treasure map |
| `item_map_scrap_2` | Map scrap 2 | Ant Hill Depths | Part of the treasure map |
| `item_map_scrap_3` | Map scrap 3 | Treehouse zipline souvenir | Part of the treasure map |
| `item_map_scrap_4` | Map scrap 4 | Gnome Hollow | Part of the treasure map |
| `item_treasure_map` | Treasure map | Made from 4 scraps | Shows the sundial, a moon and an X in the clover. Unique |
| `item_gnome_nose` | Gnome nose | Ant Hill Depths | A red ceramic cone. Fits the gnome |
| `item_blueprint_slingshot` | Slingshot blueprint | Porch | A pictogram scroll. Picking it up logs the recipe as "hinted" in the journal |
| `item_blueprint_magnet_crane` | Crane blueprint | Compost Lab | Same, for the crane |
| `item_blueprint_balloon_basket` | Balloon basket blueprint | Treehouse | Same |
| `item_blueprint_disco_ball` | Disco ball blueprint | Flowerbed | Same |
| `item_old_coin` | Old coin | Porch floor gaps (rare) | Shiny and useless. Ants and Barty want it. Put 3 in the teacup for a secret |
| `item_junk_blob` | Junk blob | Failed crafting | A lumpy blob with googly eyes that squeaks when poked. Has the tags of its ingredients. Shake it while held and it splits back into its parts |

Catalog count: 32 physics toys, 27 foods, 29 wearables, 8 paints and potion bottles, 32 junk materials, 9 instruments and 15 tools and oddities. Implementation can start with the spawn lists for areas 1 and 2 and grow from there.

---

## 8. Crafting

### Two ways to build

1. **Free building in the world.** Anything with `tag_sticky` (gum, honey, slime) welds things together on contact. String ties two things. The pegboard snaps track pieces. Players can build any contraption this way, and it works in the physics right away. Free builds aren't recipes and don't go in the journal, except a few special shapes that the game detects (see secrets).
2. **The Tinker Bench (`fix_tinker_bench`)** in Under the Porch turns specific junk combinations into new named items.

### The Tinker Bench

- **Look.** A big wooden thread spool on its side as a table, with three bottle-cap trays on top, a clothespin "vise" lever on the right, and a little crank on the left. Above it, a cork board with pinned pictogram blueprints the player has found.
- **Use.** Drop 2 or 3 items into the trays. Pull the clothespin lever down (drag it). The bench shakes for 1.2 s with hammering sounds, sawdust and a stars particle burst, then the result pops out onto the table with a "ta-da" chime.
- **Order doesn't matter.** Recipes are sets of item IDs or tags. Where a recipe says a tag (for example "any `tag_sticky`"), any item with that tag works, so honey and gum are interchangeable.
- **Bugs help.** If a bug stands next to the bench when the lever is pulled, it hammers along. Moose makes it shake harder. It's flavor, the result is the same.
- **Pull it back apart.** Crafted items can be put alone in a tray and the lever pulled to break them back into their parts. Nothing is ever lost.

### Recipes

| ID | Inputs | Output | Why it's guessable |
|---|---|---|---|
| `recipe_slingshot` | `item_twig` + `item_rubber_band` | `item_slingshot_twig` | Y-stick and band |
| `recipe_spring_launcher` | `item_spring_coil` + `item_bottle_cap` | `item_spring_launcher` | A spring in a cup |
| `recipe_matchbox_racer` | `item_matchbox` + `item_button` + `item_button` | `item_matchbox_racer` | Box with wheels |
| `recipe_leaf_raft` | `item_leaf` + `item_popsicle_stick` | `item_leaf_raft` | Leaf on a plank |
| `recipe_paper_boat` | `item_paper_scrap` + `item_straw` | `item_paper_boat` | Paper hull, straw mast |
| `recipe_parachute` | `item_tissue` + `item_string` | `item_parachute` | Canopy and lines |
| `recipe_balloon_basket` | any balloon + `item_string` + `item_matchbox` | `item_balloon_basket` | Hot-air balloon |
| `recipe_propeller_hat` | `item_maple_seed` + `item_bottle_cap` | `item_hat_propeller` | Helicopter seed on a cap |
| `recipe_viking_helmet` | `item_hat_thimble` + `item_seed_sunflower` + `item_seed_sunflower` | `item_hat_viking` | Horns on a helmet |
| `recipe_googly_glasses` | `item_button` + `item_button` + `item_paperclip` | `item_acc_googly_glasses` | Two lenses and a frame |
| `recipe_kazoo` | `item_comb_tooth` + `item_paper_scrap` | `item_inst_comb_kazoo` | Comb-and-paper kazoo |
| `recipe_harp` | `item_matchbox` + `item_rubber_band` | `item_inst_rubber_band_harp` | Box guitar |
| `recipe_can_bass` | `item_tin_can` + `item_rubber_band` | `item_inst_can_bass` | Washtub bass |
| `recipe_thimble_drum` | `item_hat_thimble` + `item_balloon_scrap` | `item_inst_thimble_drum` | Drum skin |
| `recipe_can_phone` | `item_tin_can` + `item_string` + `item_tin_can` | `item_tin_can_phone` | Classic can phone |
| `recipe_catapult` | `item_popsicle_stick` + `item_cork` + `item_bottle_cap` | `item_spoon_catapult` | Lever, pivot, cup |
| `recipe_seesaw` | `item_popsicle_stick` + `item_cork` | `item_popsicle_seesaw` | Plank on a pivot |
| `recipe_bubble_wand` | `item_paperclip` + `item_soap_sliver` | `item_bubble_wand` | Loop and soap |
| `recipe_pinwheel` | `item_paper_scrap` + `item_toothpick` | `item_pinwheel` | Paper on a pin |
| `recipe_disco_ball` | `item_foil_ball` + `item_string` | `item_disco_ball` | Shiny ball on a string |
| `recipe_magnet_crane` | `item_magnet` + `item_string` + `item_popsicle_stick` | `item_magnet_crane` | Fishing rod |
| `recipe_snorkel` | `item_straw` + `item_cork` | `item_acc_snorkel` | Tube and mouthpiece |
| `recipe_roller_skates` | `item_bottle_cap` + `item_bottle_cap` + `item_rubber_band` | `item_acc_roller_skates` | Caps strapped on |
| `recipe_leaf_cape` | `item_leaf` + `item_string` | `item_acc_cape_leaf` | Leaf tied at the neck |
| `recipe_foil_crown` | `item_foil_ball` + `item_bottle_cap` | `item_acc_crown_foil` | A crown cap |
| `recipe_straw_rocket` | `item_straw` + `item_paper_scrap` + `item_fizz_candy` | `item_straw_rocket` | Soda-powered rocket |
| `recipe_trampoline` | `item_tissue` + `item_rubber_band` + `item_popsicle_stick` | `item_trampoline` | Stretched fabric on a frame |
| `recipe_headlamp` | `item_glass_bead` + `item_rubber_band` + any `tag_glowing` | `item_acc_headlamp` | Light on a band |
| `recipe_beanie` | `item_thread_spool` + `item_toothpick` + `item_toothpick` | `item_hat_yarn_beanie` | Knitting needles and yarn |
| `recipe_backpack` | `item_matchbox` + `item_string` | `item_acc_backpack_matchbox` | Box with straps |
| `recipe_pirate_hat` | `item_paper_scrap` + `item_paint_black` | `item_hat_pirate` | Folded black paper |
| `recipe_glow_paint` | any paint + any `tag_glowing` | `item_paint_glow` | Glowing paint |

32 recipes. Each is a journal entry on the recipes page.

### Discovery rules

- **Blueprints.** Four blueprint scrolls sit in the world. Picking one up pins a pictogram card on the bench's cork board and adds a "hinted" entry in the journal: the output's silhouette with the inputs drawn as outlines.
- **Bug wishes.** A bug near the bench with fun under 50 sometimes shows a thought bubble of a craftable item it wants, for example Skeet thinking about roller skates. Hovering the bubble shows the ingredients as faint outlines for 2 s. These wishes only show recipes the player hasn't made yet.
- **Near misses.** If the trays hold 2 of a 3-item recipe, the bench's crank wiggles and a ghost outline of the third ingredient's silhouette flickers once in the empty tray. This fires for at most one candidate recipe, the first undiscovered one in table order.
- **Tag nudges.** If the inputs share a tag with a recipe's tag requirement but not its items, the cork board shows the tag pictogram. This is rare and mostly helps with the headlamp and glow paint.

### Failed combos

Nothing is ever a blank "no." A failed pull always produces one of these, chosen by the inputs' tags:

| Inputs include | Result |
|---|---|
| Anything sticky | `item_junk_blob` that sticks to the next thing it touches, with a slurp |
| Anything smelly | A junk blob plus a stink cloud. Nearby bugs fan the air |
| Anything bouncy | A junk blob that boings around the room for 3 s |
| Food | The bench "eats" it with a chomp and burps. The junk blob comes out with a bite mark. The food is gone but respawns |
| A bug | Bugs can't go in trays. The bug hops out and gives the bench a suspicious look |
| Anything else | A junk blob with googly eyes and a random squeak, plus a sad slide-whistle |

The junk blob holds its ingredients and splits back into them when shaken, so nothing is lost. The first failed combo logs `secret_first_blob`.

---

## 9. Potions and the Compost Lab

### The cauldron

- **Look.** Half an eggshell, 300 px wide, sitting in the steaming compost heap. The liquid starts clear green. A bent spoon ladle leans on the rim.
- **Use.** Drop 1 to 3 ingredients in. Each one splashes, sinks and tints the liquid. Grab the ladle and stir by dragging in circles. After 2 full circles the cauldron bubbles hard, the liquid flashes the potion's color, and a corked bottle (`item_potion_<name>`) pops out onto the ground. Stirring with no ingredients makes clear water that does nothing but make the drinker say "ahh."
- **Bugs help.** A bug near the cauldron cheers as it bubbles. Bugs never put things in.
- **Emptying.** Clicking the cauldron tips it and dumps what's inside back out as items.

### Essences

Every ingredient has one essence. The potion is decided by essences, not items, so players can reason about it.

| Essence | Ingredients | Base potion (1 ingredient, or 2 of the same) |
|---|---|---|
| `ess_grow` | `item_mushroom_cap`, `item_hat_mushroom`, `item_apple_core` | `potion_giant` |
| `ess_shrink` | `item_ant_crumb`, `item_seed_sunflower` | `potion_tiny` |
| `ess_float` | `item_feather`, `item_maple_seed`, `item_popcorn` | `potion_floaty` |
| `ess_inflate` | `item_balloon_scrap` | `potion_balloon` |
| `ess_glow` | `item_moon_pebble` (at day), any glow item, `item_glass_bead` | `potion_glow` |
| `ess_color` | Any paint, `item_berry_red`, `item_blueberry` | `potion_paint` in that color |
| `ess_sticky` | `item_honey_drop`, `item_gum_blob` | `potion_sticky_feet` |
| `ess_fizz` | `item_fizz_candy` | `potion_burp` |
| `ess_soap` | `item_soap_sliver` | `potion_bubble` |
| `ess_hot` | `item_pepper_hot` | `potion_fire_breath` |
| `ess_cold` | `item_ice_cube`, `item_mint_leaf` | `potion_frosty` |
| `ess_heavy` | `item_pebble`, `item_old_coin` | `potion_heavy` |
| `ess_bounce` | `item_rubber_band`, `item_jelly_bean` | `potion_bouncy` |
| `ess_speed` | `item_coffee_bean` | `potion_speedy` |
| `ess_slow` | `item_moss_tuft`, snail slime (a `tag_slimy` item) | `potion_slowmo` |
| `ess_stink` | `item_onion_ring`, `item_dung_ball`, `item_rotten_banana_bit`, `item_compost_goo` | `potion_stinky` |
| `ess_sleep` | `item_lavender_sprig` | `potion_sleepy` |
| `ess_sound` | `item_bluebell_bloom` | `potion_opera` |
| `ess_moon` | `item_moon_pebble` (at night) | `potion_upside_down` |
| `ess_mirror` | `item_foil_ball` | `potion_copycat` |
| `ess_hair` | `item_tissue`, any item carrying `tag_fuzzy` | `potion_hairy` |
| `ess_magnet` | `item_magnet` | `potion_magnet` |

### Combination logic

1. **One essence type** (1, 2 or 3 of the same). Base potion. Each extra copy adds 50 percent to duration and 25 percent to strength, so a double giant potion makes a bigger bug.
2. **Two different essences.** Check the special pair table. If the pair is listed, make that. If the essences are opposites (grow/shrink, hot/cold, float/heavy, speed/slow, sleep/speed), make a "wobble" potion that flips between the two effects every 2 s. If neither, the potion combines both base effects at 70 percent strength each. This is how "floaty + glow" becomes a glowing floating bug with no special code.
3. **Three different essences.** Check the triple table. If not listed, it's `potion_sludge`.
4. **Sludge.** A brown-green bottle with a fly buzzing around it. The drinker turns green, burps a huge cloud, says "blegh", and gets a random harmless cosmetic for 10 s (fuzzy hair, crossed eyes, hiccups). It's the funny fail, and the first one logs `secret_sludge_burp`.

### Potion outcomes

Default duration is 60 s. Effects persist in the save. Dunking a bug in the pond ends any potion early, except `potion_paint` which washes off like paint. A bug can have up to 2 potion effects at once; a third replaces the oldest.

| ID | Recipe | Effect on the bug | Visual |
|---|---|---|---|
| `potion_giant` | `ess_grow` | Scale ×2, mass ×4, voice −1 octave, steps shake small items. Counts as heavy | Grows with a stretchy "bwoomp" over 0.6 s |
| `potion_tiny` | `ess_shrink` | Scale ×0.5, voice +1 octave, fits the can tunnel and small gaps, other bugs can carry it | Shrinks with a slide whistle down |
| `potion_floaty` | `ess_float` | Gravity 0.15, drifts, bobs, wind pushes it around | Soft rising sparkles under the feet |
| `potion_balloon` | `ess_inflate` | Body inflates into a round ball and rises to the ceiling. Poke it and it deflates, zipping around with a raspberry sound for 2 s | Round, stretched tight, tiny feet paddling |
| `potion_glow` | `ess_glow` | `tag_glowing`, light radius 220. Luma follows | Pulsing glow in the potion's color |
| `potion_paint` | `ess_color` | Whole body painted that color | Color spreads from the mouth outward |
| `potion_rainbow` | Three different `ess_color` in one brew | Hue cycles over 3 s, leaves a rainbow trail when moving | Trail of 6 colored dots |
| `potion_sticky_feet` | `ess_sticky` | Walks on walls and ceilings. Items it touches stick to it | Glossy feet, "shlup" footsteps |
| `potion_burp` | `ess_fizz` | Burps every 3–5 s, each burp a small shockwave that nudges light items. Burps are pitched to the music key | Burp ring particle |
| `potion_bubble` | `ess_soap` | Emits bubbles from its back. Bubbles carry small items up | Bubble stream |
| `potion_bubble_burp` | `ess_soap` + `ess_fizz` | Burps giant bubbles that can carry a small bug for 5 s | Big iridescent bubbles |
| `potion_fire_breath` | `ess_hot` | Every burp is a harmless flame puff: a `tag_hot` cone 150 px long. Toasts food, melts ice, pops popcorn | Orange cone, red cheeks |
| `potion_frosty` | `ess_cold` | `tag_cold` aura. Freezes water it walks on, making ice paths. Sneezes snowflakes | Pale blue tint, frost on antennae |
| `potion_heavy` | `ess_heavy` | Mass ×5, sinks, can't be flung past 900 px/s, stomps shake the camera 1 px | Darker tint, heavy footsteps |
| `potion_bouncy` | `ess_bounce` | Restitution 0.95. Moves by bouncing | Boing on every step |
| `potion_speedy` | `ess_speed` | Speed ×2.5, fast voice, can't stop quickly | Speed lines, blur trail |
| `potion_slowmo` | `ess_slow` | Bug runs at 0.3× time: moves, blinks, talks slow and deep | Slight motion blur, low voice |
| `potion_stinky` | `ess_stink` | Permanent stink aura for the duration. Most bugs keep a 200 px distance. Whiff and Barty follow | Green clouds and flies |
| `potion_sleepy` | `ess_sleep` | Falls asleep instantly for 20 s, snoring in key | Floating "Zzz" pictograms |
| `potion_opera` | `ess_sound` | Every voice line becomes a sung melody in the area's key, with vibrato | Musical notes |
| `potion_squeaky` | `ess_inflate` + `ess_sound` | Helium voice, +1.5 octaves | Tiny notes |
| `potion_upside_down` | `ess_moon` | Gravity reversed for this bug. It falls up to the nearest ceiling (porch boards, treehouse roof, stump overhang, or the sky edge at y 40 outdoors, where it walks along the top of the screen) | Stars around the feet |
| `potion_copycat` | `ess_mirror` | Copies the nearest bug's animation and voice, mirrored | Shiny outline |
| `potion_hairy` | `ess_hair` | Grows long shaggy fur that bounces with physics | Fur strands |
| `potion_magnet` | `ess_magnet` | Metal items within 250 px fly to the bug and stick | Red-blue shimmer |
| `potion_ghost` | `ess_glow` + `ess_float` + `ess_mirror` | Semi-transparent (35 percent), floats, passes through thin barriers (lattice, cobweb, tin can wall) | Wavy bottom edge like a sheet |
| `potion_rocket` | `ess_fizz` + `ess_speed` | Launches upward once like a rocket, then parachutes down on its own | Smoke trail |
| `potion_snowball` | `ess_cold` + `ess_bounce` | Becomes a round snowball that rolls and bounces. Gets bigger as it rolls on the ground (to ×1.5) | White sphere with the bug's face |
| `potion_wings` | `ess_float` + `ess_color` + `ess_sticky` | Any bug grows butterfly wings in the potion's color and flutters | Wings from the back anchor |
| `potion_jelly` | `ess_sticky` + `ess_bounce` | Body turns to wobbly jelly that jiggles for every movement | Translucent, wobble shader |
| `potion_wobble` | Any two opposite essences | Flips between the two effects every 2 s | Flicker between both |
| `potion_sludge` | Unlisted three-essence brews | Green face, giant burp, random cosmetic for 10 s | Flies |

Potions on items: shattering a potion on an item applies what makes sense (giant, tiny, glow, floaty, sticky, heavy, bouncy, magnet, paint). Other potions on items make a puff and a sparkle and do nothing, with a "huh" from a nearby bug. Giant items are a big deal: a giant marble is a boulder, a giant spring launches Moose.

---

## 10. Music toys

### The music clock

One global clock drives all music. Everything that makes a pitched sound goes through it.

- Tempo: 96 BPM by day, 84 at dusk and dawn, 72 at night. Tempo changes glide over 8 beats.
- Grid: player and bug notes are quantized to the next 16th note. Delay is at most 156 ms at 96 BPM, which still feels immediate because the attack animation plays at once and only the sound waits. Percussive one-shots from physics impacts (not `tag_musical` items) are not quantized.
- Key: each area has a key and a pentatonic scale. Every pitched sound picks from that scale, so nothing clashes. The key follows the camera's area, crossfading over one bar at area borders.
- Chords: a 4-bar progression per area loops under everything. Instruments that play chords use it.

| Area | Key | Scale | Progression (1 bar each) | Character |
|---|---|---|---|---|
| `area_stump_plaza` | C | C major pentatonic | C, Am, F, G | Bright, bouncy |
| `area_puddle_pond` | D | D major pentatonic | D, Bm, G, A | Floaty, wet |
| `area_flowerbed_stage` | G | G major pentatonic | G, Em, C, D | Showy, the band key |
| `area_under_porch` | A | A minor pentatonic | Am, F, C, G | Dusty, sneaky |
| `area_compost_lab` | E | E minor pentatonic | Em, C, D, B7 treated as Bm | Bubbly, mad-science |
| `area_treehouse_arcade` | F | F major pentatonic | F, Dm, Bb, C | Chiptune, playful |
| `area_ant_hill_depths` | B♭ | B♭ minor pentatonic | B♭m, G♭, D♭, A♭ | Marching, underground |
| `area_gnome_hollow` | E♭ | E♭ major pentatonic | E♭, Cm, A♭, B♭ | Starry, still |

### Instruments

Instruments are in section 7.6. Rules:

- Poking or striking a pitched instrument plays the next note of a short motif that walks the scale, so repeated pokes make a melody instead of one note.
- Physics hits on `tag_musical` items play their assigned scale degree. A marble run over the leaf xylophone plays a tune based on which keys it hits.
- Raindrops on tin cans, caps and the upturned sequencer mushrooms play random scale notes at low velocity.

### How bugs play

- An instrument advertises `play_instrument` (fun +20). A bug that picks it holds the instrument and plays a pattern based on its personality until the duration ends (8–24 beats).
- Patterns are simple rhythm templates filled with scale notes. Examples: Boing's drum template is "hit on 1 and 3, fill on 4"; Moose's bass is "root on 1, fifth on 3"; Fiddle's melody walks up or down the scale by one or two steps with a long note at the end of each bar; Buzzby plays ascending runs on the 8ths.
- Bugs within 300 px of a playing bug bob on the beat. Two or more bugs playing within 300 px form a band: they sync their patterns to bar starts.
- Three or more bugs performing on `fix_flowerpot_stage` add a "band layer" to the area music and log `secret_band_of_three` the first time.
- Bugs never touch a sequencer pattern the player made. They only hop on the caps when the grid is fully empty, and their pattern clears itself when they leave.

### Mushroom sequencer (`fix_mushroom_sequencer`)

- **Look.** An 8-column, 6-row grid of small mushrooms growing in soil. Each row has a different cap color. Inactive caps are small and pale; active caps are big and bright. A small glowing beetle-shaped marker hops from column to column on each 8th note, showing the playhead.
- **Rows, top to bottom.** Rows 1 to 4 are melody notes: scale degrees 5, 3, 2 and 1 of the current key's pentatonic, one octave up. Row 5 is bass: the root of the current chord. Row 6 is a drum: a noise-burst snare on even steps and a kick on odd steps.
- **Use.** Click a cap to toggle it. Drag across caps to paint several on or off (the first cap's new state sets the paint mode). A mushroom bounces with squash when its step plays.
- **Timing.** 8 steps of 8th notes = one bar. Loops forever.
- **Controls.** A stone at the left end clears the grid when clicked twice (first click wobbles it as a warning). A snail-shell knob at the right end toggles double speed. A seed at the top switches between two stored patterns, A and B.
- **Muting per voice.** Clicking a row's leftmost soil tuft mutes that row. The tuft wilts to show it's muted.
- **Reach.** The sequencer plays in the flowerbed at full volume, and through the bluebell speakers in every other area at 25 percent, transposed to that area's key so it still fits.
- **Bugs.** Bugs nearby dance. If the grid has 4 or more active caps at night, Fiddle comes out (`secret_fiddle_found`). A specific pattern plays the "Bugglebrook theme" and triggers `secret_sequencer_song` (see secrets).

---

## 11. Day, night and weather

### Clock

One real second is one game minute, so a full day is 24 real minutes. New saves start at 09:00.

| Phase | Game time | Real length | Sky | Light |
|---|---|---|---|---|
| Dawn | 05:00–07:00 | 2 min | Pink to pale blue gradient | Warm, soft |
| Day | 07:00–18:00 | 11 min | `#BFE7F5` fading to `#8FD3F0` at the top | Full brightness, dappled spots |
| Dusk | 18:00–20:00 | 2 min | Orange `#FF9F5A` to violet | Long shadows, warm rim light |
| Night | 20:00–05:00 | 9 min | `#1C1F4A` with stars and a moon | Ambient 35 percent, lights and glow items matter |

The sun and moon move in an arc across the far layer. Night lighting is done with a dark multiply overlay plus additive light sprites for every `tag_glowing` item, lamp and firefly.

### Player control: the sundial

`fix_sundial` in the plaza is the time control. Drag its rim clockwise to jump forward. The world fast-forwards visually at 60× (sky sweeps, shadows swing, bugs speed up) while dragging, and stops when released. It can only go forward, which keeps the rules simple. It snaps to the start of each phase when released within 15 game minutes of one. Dragging it to exactly 00:00 at night triggers `secret_sundial_midnight`.

### Weather

Weather is per world, not per area. It changes at random intervals of 6 to 12 real minutes. Each state has a minimum run of 3 minutes.

| Weather | Chance | Effects |
|---|---|---|
| `weather_clear` | 50% | Default |
| `weather_cloudy` | 20% | Sky desaturated 30 percent, softer light, cloud shapes drift |
| `weather_rain` | 18% | Rain streaks, rings on water, pond rises, puddles form, outdoor items get wet (R15), drips under the porch, flowers droop. Bugs that dislike rain shelter |
| `weather_wind` | 12% | Leaves and petals blow, light items slide (R14), grass bends, pinwheels spin, flying bugs drift |
| `weather_rainbow` | Follows rain 60% of the time, 90 s | A rainbow arcs over the pond. See `secret_rainbow_end` |

Night plus clear weather has a 10 percent chance each night of `weather_shooting_stars`: a shooting star every 20 s. Bugs point at them.

### Player-triggered weather

- `fix_weather_vane`: 3 clicks within 2 s starts a 20 s wind gust in the direction the rooster faces.
- `item_cloud_jar`: open it anywhere to make it rain in the current area for 60 s. Close it to stop.
- Rain dance: 4 or more bugs dancing on the stage at once for 16 beats makes it rain, if it isn't already. Logs `secret_rain_dance`.
- Sun from the sundial: dragging the dial also skips past weather. Rain ends when the dial is released after a skip of 2+ game hours.

### Behavior and secret hooks by time and weather

| Condition | What changes |
|---|---|
| Night | Luma, Flick and Fiddle are active. Day bugs sleep. Mushrooms and potion jars glow. Knothole eyes appear. Ant colony snores. Frog eyes glow |
| Night, pond | Fireflies over the reeds. Moon reflection over the sunken teacup |
| Night, porch | Only lamp and glow light. Moths gather at the lamp |
| Dusk | Fiddle starts the evening chorus |
| Rain | Pond rises (lily pads rise), sunflower gate opens if still closed, snails and Wubbo go out, raindrops play the sequencer caps, ants carry leaf umbrellas |
| After rain | Rainbow chance, puddles last 3 min, worms surface |
| Wind | Maple seeds fall in the treehouse, petals blow in the flowerbed, smells travel |
| Dawn | Munch's cocoon hatches, dew drops (`tag_wet`) on leaves |

---

## 12. Secrets and discovery

### Principles

- Every secret follows the world's rules and has a visible clue.
- Every secret is deterministic. If the conditions are met, it fires. Randomness only affects flavor.
- Every secret logs automatically the moment it fires, with a stamp sound and a 0.6 s stamp animation in the corner. No modal.
- Secrets are tiered: **T1** found in the first 10 minutes by poking around, **T2** needs a combination or a time or weather condition, **T3** needs a chain of steps or knowledge from another area.
- "Hint" is the pictogram shown on the journal silhouette before discovery (section 13).

### Secret list

| ID | Tier | Area | Trigger | Result | Hint | Requires |
|---|---|---|---|---|---|---|
| `secret_stump_eyes` | T1 | Plaza | Click the knothole at night | The eyes blink, a tiny voice giggles, and a random item pops out | Moon + eye | |
| `secret_ant_sugar` | T1 | Plaza | Sugar cube within 300 px of the ant hill | Ants carry it in, hole widens, Ant Hill Depths opens | Sugar cube | |
| `secret_mushroom_chord` | T1 | Plaza | Bounce things on 3 ring mushrooms within 1 beat | A chord rings out and the mushrooms puff spores in rainbow colors | Three notes | |
| `secret_twig_blinks` | T2 | Plaza | Poke the blinking twig while its eyes are open | Twig joins the cast | Stick with an eye | |
| `secret_sundial_midnight` | T2 | Plaza | Drag the sundial to exactly 00:00 | The moonlit gnomon shadow glows and points at a patch of clover | Moon + dial | |
| `secret_worm_hat` | T2 | Plaza | Drop a hat on the earthworm while it's peeking out | It wears it, sinks, and resurfaces in another area 2 min later still wearing it | Worm | |
| `secret_sun_shades` | T1 | Plaza | Click the sun on the sundial 5 times | The sky's sun puts on sunglasses for the rest of the day | Sun | |
| `secret_bug_totem` | T2 | Any | Stack 4 bugs vertically, resting, for 2 s | They all strike a pose and a fanfare plays. Photo mode gets the "totem" frame | Stacked circles | |
| `secret_boot_key` | T1 | Pond | Click the sunken boot 3 times | It tips and a tiny key on a cork keychain floats up | Boot | |
| `secret_knothole_door` | T2 | Plaza | Drop the tiny key on the stump knothole | A small door inside the stump opens: a nook with `item_map_scrap_1` and `item_old_coin` | Key | `secret_boot_key` |
| `secret_moon_pebble` | T2 | Pond | At night, drop a pebble into the pond where the moon reflects over the teacup | It lands in the teacup and comes out as `item_moon_pebble` | Moon + pebble | |
| `secret_teacup_coins` | T3 | Pond | Put 3 old coins in the sunken teacup | The frog eyes rise: a giant frog head surfaces, says "ribbit" in a deep voice, and spits out `item_hat_bubble` | Coins | `secret_knothole_door` |
| `secret_skip_stone` | T2 | Pond | Fling a pebble low (under 15 degrees) and fast (over 1200 px/s) across the water | It skips. 5 skips in one throw logs it | Pebble + arcs | |
| `secret_frog_blink` | T1 | Pond | Poke the frog eyes 5 times | A huge "ribbit" ripples the pond and every bug jumps | Frog eyes | |
| `secret_raft_regatta` | T2 | Pond | 3 bugs on one floating raft or boat reach the far side of the pond | Skeet blows a reed horn and the bugs cheer | Raft | |
| `secret_firefly_flick` | T2 | Pond | At night, toggle a light 3 times within 300 px of the reeds | Flick joins | Firefly + blinks | |
| `secret_pond_freeze` | T2 | Pond | Freeze 3 or more surface sections at once (frosty potion or ice cubes) | The pond becomes an ice rink for 60 s. Skeet does a spin routine | Snowflake | |
| `secret_sunflower_drink` | T1 | Pond | Water the droopy sunflower | It stands up, opens the Flowerbed | Droplet | |
| `secret_band_of_three` | T1 | Flowerbed | 3 bugs performing on the stage at once | A band layer joins the music and the stage lights flash | Three notes + stage | |
| `secret_sequencer_song` | T2 | Flowerbed | Enter the Bugglebrook theme on the sequencer (pattern drawn on the stage backdrop as dots) | Every bug in the world stops and sings the theme together once | Mushroom grid | |
| `secret_gnome_knock` | T2 | Flowerbed | Knock on the gnome 3 times at night | Something knocks back 3 times from inside | Moon + knock | |
| `secret_paint_all_five` | T2 | Flowerbed | One bug carrying all 5 puddle colors at once | It turns into a patchwork bug and Prim applauds. Unlocks the "patchwork" sticker | Five drops | |
| `secret_moth_spotlight` | T2 | Flowerbed | At night, stage lights on spotlight mode with Luma on stage | Luma dances in the spotlight and moths swirl around her | Moth + light | `secret_luma_found` |
| `secret_rain_dance` | T2 | Flowerbed | 4 bugs dancing on the stage for 16 beats while not raining | It starts to rain | Cloud + feet | |
| `secret_buzzby_found` | T1 | Flowerbed | Play any instrument on stage during the day | Buzzby joins | Bee | |
| `secret_munch_found` | T1 | Flowerbed | Click the rustling bitten leaf | Munch joins | Leaf with bites | |
| `secret_fiddle_found` | T2 | Flowerbed | Sequencer with 4+ active caps at night | Fiddle joins | Cricket + moon | |
| `secret_munch_butterfly` | T2 | Any | Munch eats 5 leafy foods, then night falls | Cocoon overnight, butterfly at dawn | Cocoon | `secret_munch_found` |
| `secret_rainbow_end` | T3 | Flowerbed | While a rainbow is up, put an open jar where its end touches the ground (it lands on the flowerbed's paint puddles) | The jar fills with `item_paint_rainbow` | Rainbow + jar | |
| `secret_whiff_found` | T1 | Porch | Poke the flowerpot Whiff hides behind | Whiff joins with a stink puff | Eyes behind a pot | |
| `secret_luma_found` | T2 | Porch | Porch lamp on at night | Luma flies in and joins | Moth + bulb | |
| `secret_lamp_moths` | T2 | Porch | Put 3 glowing things within 200 px of the lamp at night | Dozens of moths swirl into a big spiral, then settle | Three lights | |
| `secret_floor_coin` | T1 | Porch | Catch something falling through the floor gaps before it lands | It's an old coin, and a "yoink" sound plays | Coin + gap | |
| `secret_spider_wave` | T1 | Porch | Move the cursor side to side under the dangling spider | It waves back with all 8 legs | Spider | |
| `secret_rollo_tunnel` | T1 | Porch | Roll Rollo (or anything 36–52 px round) through the can tunnel | The latch opens and the Compost Lab unlocks | Ball + tunnel | |
| `secret_flashlight_shadow` | T2 | Porch | Shine the flashlight pen at the back wall at night | Shadow puppets appear: a shadow of a big unknown bug with 8 legs (Wubbo's hint) | Flashlight | |
| `secret_upside_tea` | T3 | Porch | A bug under `potion_upside_down` walks along the porch boards to the spider | They hang side by side and share a crumb | Flipped bug | `secret_moon_pebble` |
| `secret_first_blob` | T1 | Porch | Any failed craft | Junk blob, journal notes it | Blob | |
| `secret_first_potion` | T1 | Compost | Brew any potion | Journal opens the potions page | Bottle | |
| `secret_sludge_burp` | T1 | Compost | Brew sludge and give it to a bug | Giant green burp | Fly | |
| `secret_triple_potion` | T3 | Compost | Brew any listed three-essence potion | The cauldron erupts in a foam fountain | Three drops | |
| `secret_moose_found` | T1 | Compost | Flip Moose upright | Moose joins | Beetle on its back | |
| `secret_barty_found` | T1 | Compost | Roll a marble or ball to Barty | Barty joins | Ball | |
| `secret_compost_goo_hat` | T2 | Compost | Drop compost goo on a bug's head | It becomes `item_hat_goo` instead of being eaten | Goo + hat | |
| `secret_scope_wubbo` | T2 | Compost | Put the moss tuft on the bug scope at night | The scope shows a tiny water bear waving, with a mushroom thought bubble | Moss + eye | |
| `secret_wubbo_found` | T3 | Compost | Shatter `potion_giant` on the moss tuft (after seeing it under the scope) | Wubbo grows to bug size, pops out and joins as the 16th bug | Unknown chubby shape | `secret_scope_wubbo` |
| `secret_giant_launch` | T2 | Any | Launch a giant bug with a giant spring | The bug flies off-screen and lands 3 s later with a huge thud, dust ring and a crater that fills back in | Big spring | |
| `secret_marble_tune` | T2 | Treehouse | A marble run that hits the leaf xylophone 8 times in a row | The xylophone plays the notes back as a tune and the arcade lights flash | Marble + notes | |
| `secret_domino_chain` | T2 | Treehouse | 12 dominoes fall in one chain | The last one rings a bell and confetti drops | Dominoes | |
| `secret_prim_found` | T1 | Treehouse | Use the jar claw once | Prim joins | Claw | |
| `secret_claw_triple` | T2 | Treehouse | Win 3 prizes from the claw in a row without a miss | The claw does a victory spin and drops `item_hat_candle` | Three prizes | |
| `secret_zipline_souvenir` | T2 | Treehouse | 10 zipline rides total | The bug returns with `item_map_scrap_3` in its hand | Zipline | |
| `secret_window_telescope` | T1 | Treehouse | Click the treehouse window 3 times | The view zooms in and shows a spot in the garden where something is hidden this day (rotates between clues for T2 secrets not yet found) | Window | |
| `secret_catch_cloud` | T3 | Any | During rain, ride a balloon basket carrying an open jar up to the cloud line | The jar becomes `item_cloud_jar` | Cloud + jar | |
| `secret_queen_sweet` | T1 | Ant Hill | Feed the queen something sweet | She dances, the colony cheers, and she gives `item_acc_monocle` | Crown | `secret_ant_sugar` |
| `secret_root_pull` | T2 | Ant Hill | Moose, or any giant bug, grabs the root knot (drop it touching the knot) | The root pulls free and reveals `item_gnome_nose` | Root | `secret_ant_sugar` |
| `secret_ant_conga` | T2 | Ant Hill | Play music through the bluebell speakers while in the depths | The ants form a conga line through the tunnels | Ants + notes | |
| `secret_map_scrap_2` | T2 | Ant Hill | Look in the pantry at night when the ants sleep | The scrap is lying on top of the pile, reachable | Map scrap | |
| `secret_gnome_inside` | T3 | Gnome | Drop the gnome nose into the gnome's nose hole | The gnome sneezes, its hat flips open, and Gnome Hollow opens | Gnome | `secret_root_pull` |
| `secret_constellations` | T2 | Gnome | Look through the gnome telescope | Constellations of every found bug light up. Unfound bugs show as dark outlines | Stars | `secret_gnome_inside` |
| `secret_treasure_map` | T3 | Any | Drop all 4 map scraps touching each other | They snap together into `item_treasure_map`, which shows the sundial, a moon, and an X in the clover | Map | 4 scraps |
| `secret_golden_marble` | T3 | Plaza | At midnight, click the clover spot the sundial shadow points at | Bugs gather and dig. `item_marble_gold` pops out | X mark | `secret_treasure_map`, `secret_sundial_midnight` |
| `secret_golden_marble_home` | T3 | Gnome | Place the golden marble on the moon pedestal | Finale: the telescope opens, every bug in the world walks to the plaza, and a night of bug-shaped fireworks plays over the stump. Afterward, the "starry" frame and filter unlock | Pedestal | `secret_golden_marble` |
| `secret_fling_orbit` | T2 | Any | Fling a bug straight up at night faster than 2400 px/s | It leaves the screen, comes back 3 s later wearing a tiny astronaut-style bubble and holding a moon crumb | Rocket bug | |
| `secret_twig_bridge` | T2 | Any | Twig bridges a gap and 3 bugs walk across him | He sighs proudly | Stick bridge | `secret_twig_blinks` |
| `secret_ghost_lattice` | T3 | Porch | A bug under `potion_ghost` walks through the lattice | It spooks Whiff, who spooks everyone with a stink cloud | Ghost | |
| `secret_fashion_parade` | T3 | Flowerbed | Every found bug wears a hat at the same time | Prim leads a parade across the stage while the lights go disco | Hats in a row | |

That's 67 secrets. Every found-bug event is also a secret so the "secrets" count and the bug page stay in sync.

### Mysteries

Mysteries are chains of secrets that cross areas. Each has a mystery page in the journal that fills in step by step with pictures, like a comic strip. Unfound steps show as blank panels with the step's hint pictogram, but only for the next step, never the whole chain.

**`mystery_gnome_nose`** (Flowerbed, Ant Hill, Gnome Hollow)
1. Notice the gnome is missing its nose. Hover it and a sniffle sound plays.
2. `secret_gnome_knock`: at night, something knocks back.
3. `secret_ant_sugar`: open the Ant Hill.
4. `secret_root_pull`: find Moose, bring him to the depths, pull the root.
5. Carry the nose (pocket or drag) back across the plaza and pond to the flowerbed.
6. `secret_gnome_inside`: fix the nose. Gnome Hollow opens.

**`mystery_treasure_map`** (Plaza, Pond, Ant Hill, Treehouse, Gnome Hollow)
1. `secret_boot_key` then `secret_knothole_door` for scrap 1.
2. `secret_map_scrap_2` in the ant pantry.
3. `secret_zipline_souvenir` for scrap 3.
4. Scrap 4 sits on a shelf in Gnome Hollow.
5. `secret_treasure_map`: put the scraps together.
6. `secret_sundial_midnight` + `secret_golden_marble`: dig up the golden marble.
7. `secret_golden_marble_home`: the finale.

**`mystery_tiny_squeak`** (Porch, Compost Lab), the hidden 16th bug
1. At night in the compost lab, a tiny squeak comes from the moss tuft's jar. Hovering the jar makes it wobble.
2. `secret_flashlight_shadow`: a shadow puppet of an unknown 8-legged bug under the porch.
3. `secret_scope_wubbo`: the moss under the scope at night shows a tiny water bear thinking about a mushroom.
4. Brew `potion_giant` (mushroom cap).
5. `secret_wubbo_found`: shatter it on the moss. Wubbo appears.

**`mystery_catch_a_cloud`** (Porch, Compost, Treehouse, any outdoor area)
1. Find the balloon basket blueprint in the treehouse.
2. Craft `item_balloon_basket` at the Tinker Bench.
3. Wait for rain, or start a rain dance.
4. `secret_catch_cloud`: ride up with an open jar aboard.
5. Use `item_cloud_jar` to make rain anywhere, any time. It helps with `secret_rainbow_end`.

### Clue placement

- Each area has at least one "visible but unexplained" thing at all times: knothole eyes, the gnome's missing nose, a latch through the tunnel, the bucket with the acorn, the moss squeak, the frog eyes.
- `secret_window_telescope` acts as a hint machine: each game day it points at one T2 secret the player hasn't found.
- Bugs hint too. When a bug is idle near an unfound secret's trigger location, 10 percent of the time it shows a thought bubble with that secret's hint pictogram.

---

## 13. Journal

### Object and opening

The journal is a chunky notebook with a leaf-green cover and a ladybug bookmark, sitting in the top-right corner of the screen. Click it to open. It opens as a two-page spread over a dimmed world with a page-flip sound. The world simulation pauses while it's open. Click outside the book or the closed-book icon to close.

### Pages

Tabs are pictogram bookmarks down the right edge of the book.

| ID | Tab icon | Contents | Entries |
|---|---|---|---|
| `page_bugs` | Ladybug | One card per bug, 4 per spread | 16 bugs + Munch's butterfly form = 17 |
| `page_items` | Acorn | Grid of every item, 12 per spread, grouped by category | All catalog items |
| `page_recipes` | Hammer | Crafting recipes as picture equations: A + B = C | 32 |
| `page_potions` | Bottle | Essence chart plus every potion as a picture equation and an effect drawing | 32 |
| `page_secrets` | Keyhole | Secrets grouped by area, with area counts | 67 |
| `page_mysteries` | Magnifier | One comic-strip page per mystery | 4 |
| `page_photos` | Camera | The player's last 60 photos as polaroids | Not counted |
| `page_map` | Folded map | The garden strip with areas drawn in as they're found. Click an area to jump the camera there | 8 |

### Entry states

| State | Look | When |
|---|---|---|
| `unknown` | Solid dark silhouette with a "?" and one condition pictogram (moon, raindrop, area icon, or the hint from the secret table) | Default |
| `hinted` | Silhouette with a colored outline. Recipes show the ingredient outlines. Potions show the essences as colored drops | From a blueprint, a bug wish, a near miss, or the window telescope |
| `discovered` | Full-color drawing, a stamp with a date pictogram (sun or moon plus a day count), and a 1–3 word label | The moment it happens |

Bug cards have extra slots that fill as the player observes: 3 liked-food slots, 2 disliked, 1 weird favorite, favorite toy, favorite place, and the bug's photo. Each fills when the player sees it happen (feeding a loved food fills a liked slot with that food's picture). Munch's card shows both forms.

Labels are short names only: "Dot", "Spring", "Giant potion". No descriptions, no sentences.

### Completion

- A glass jar on the cover fills with glowing dots as entries are discovered. Inside the book, the first page shows the jar big with the percentage as a number.
- Completion % = discovered entries ÷ total countable entries (bugs + items + recipes + potions + secrets + areas). Photos don't count.
- Each area on the map page shows a small count like "7/12" for secrets found there.
- Reaching 100 percent logs nothing extra and doesn't pop anything up. The cover gets a gold ladybug stamp. That's it.

### Hints without spoilers

- The hint pictogram on a silhouette says where or when, never how.
- After 15 minutes of play without any discovery, one `unknown` entry the player is closest to (by area and prerequisites met) gets a soft sparkle. Opening it adds one extra pictogram: the area, or the time, or the bug involved. Never more than one extra pictogram per entry.
- Nothing nags. No arrows, no popups outside the journal. The only in-world nudge is bugs' thought bubbles.

---

## 14. Photo mode

- **Enter.** Click the camera icon in the top-right corner. The screen border gains a viewfinder frame and the UI slides away.
- **The camera moment.** For 0.8 s after entering, bugs react to the camera by personality: Dot, Prim and Skeet pose; Boing photobombs by jumping into frame; Whiff and Twig hide or freeze; Glorp slowly turns to look. Then the world freezes. Physics, particles and animations hold in place.
- **Framing.** Drag to pan within the current area. Scroll to zoom from 1× to 3×. Zoom centers on the cursor.
- **Frames.** A strip of frame thumbnails on the left.

| ID | Frame |
|---|---|
| `frame_none` | No frame |
| `frame_polaroid` | White border with a thick bottom |
| `frame_leaf` | Leaves around the edge |
| `frame_stamp` | Postage stamp with perforated edge |
| `frame_comic` | Black comic panel with a jagged action burst corner |
| `frame_wanted` | Old paper poster with a blank space, no words |
| `frame_bottle_cap` | Round photo inside a big bottle cap |
| `frame_slime` | Dripping green goo border |
| `frame_totem` | Unlocked by `secret_bug_totem`, a carved wooden border |
| `frame_starry` | Unlocked by the finale, a night sky with bug constellations |

- **Stickers.** A tray along the bottom. Drag a sticker onto the photo, drag its corner handle to scale and rotate, drag it off the photo to remove. Stickers: googly eyes, mustache, speech bubble with each of 8 pictograms (food, star, question mark, exclamation, music note, dizzy spiral, stink cloud, zzz), stink lines, motion lines, sparkle, star burst, crown, sunglasses, party hat, arrow, "!" burst, sweat drop, steam puff, chomp teeth, rainbow, lightning bolt, the patchwork bug (unlocked by `secret_paint_all_five`), one sticker of each found bug's face. At least 24 at start.
- **Filters.** Buttons in the top strip: `filter_none`, `filter_warm`, `filter_cool`, `filter_night_vision` (green tint and scanlines), `filter_old_photo` (sepia and grain), `filter_comic` (posterize and thick edges), `filter_bug_eye` (a hex-grid mosaic, unlocked by `secret_scope_wubbo`).
- **Shutter.** A big round button, bottom right. On click: white flash (skipped in reduce-motion, replaced by a quick fade), a shutter click sound, and the photo slides into a mini polaroid that flies to the journal icon.
- **Saving.** The image renders at 1920×1080 (or the zoomed region upscaled to that size) and saves as PNG to `<Pictures>/Bugglebrook/bugglebrook-YYYYMMDD-HHMMSS.png`, using Electron's `app.getPath('pictures')`. A 320×180 thumbnail goes into the save for the photos page. If the save to disk fails, the thumbnail still saves and a small red "x" appears on the polaroid.
- **Journal photos.** If a bug is at least 15 percent of the frame, its journal card uses the photo as its portrait from then on (the player can switch back by clicking the card's portrait).
- **Exit.** Click the camera icon again or Escape. The world unfreezes.

---

## 15. Game feel and juice

### Squash and stretch

All values are scale multipliers on the object's local axes, applied by a spring (stiffness 300, damping 18) toward 1.0. Volume stays roughly constant: when one axis is s, the other is 1/s.

| Event | Values | Notes |
|---|---|---|
| Grab | Instant squash to 1.15 wide × 0.87 tall, spring back over ~200 ms | Plays on frame 1 |
| Dragging | Stretch along velocity: s = 1 + min(speed / 2500, 0.3) | Bugs only. Items stretch at half that |
| Airborne | Same formula, max 1.4 | Rotates with angular velocity |
| Landing | Squash along the contact normal: s = 1 − min(impact / 3000, 0.4) | Then overshoot to 1.1 and settle |
| Poke | 0.9 × 1.1 then settle | |
| Eat | Mouth-anchored squash 1.1 × 0.95 on each chew, 3 chews | Lump travels down long bugs |
| Anticipation | Before hops and jumps: crouch to 1.2 × 0.8 over 120 ms | |
| Follow-through | Antennae, wings, hats and scarves are springs. They keep swinging after motion stops | Hats have max tilt 25 degrees |
| Idle breathing | 1.0 to 1.03 vertical at 0.3 Hz | |
| Reduce motion | All squash amplitudes ×0.4, no rotation from airborne spin beyond 90 degrees per second | |

### Particles

| ID | Look | Used for |
|---|---|---|
| `fx_dust_puff` | 4–8 grey-brown circles expanding and fading, 300 ms | Landings, hops, drag start |
| `fx_splash` | 8–20 blue droplets in an arc, plus a ring on the surface | Water entry, count scales with speed |
| `fx_stars` | 3–5 yellow five-point stars orbiting the head | Dizzy |
| `fx_sparkle` | 4-point white stars, twinkling | Discoveries, loved food, clean bug |
| `fx_stink` | Green wobbly cloud blobs with 2 flies | Smelly |
| `fx_bubbles` | Clear circles with a white highlight, drifting up | Soap, potions, underwater |
| `fx_steam` | White soft puffs rising | Hot + wet |
| `fx_confetti` | Colored rectangles tumbling | Secrets, dominoes, finale |
| `fx_notes` | Music note shapes in the area palette, rising | Music playing |
| `fx_crumbs` | Tiny food-colored bits | Eating |
| `fx_paint_splat` | Irregular blob with drips, in paint color | Paint drops |
| `fx_snowflake` | Small white six-line flakes | Cold |
| `fx_fire_puff` | Orange and yellow teardrop blobs | Fire breath |
| `fx_zzz` | "Z" pictogram shapes rising | Sleep |
| `fx_glow_motes` | Small additive dots drifting | Night glow items, fireflies |
| `fx_sawdust` | Tan specks | Tinker Bench |
| `fx_stamp` | A rubber stamp slamming in the corner | Journal discovery |

Budget: at most 400 live particles. When over budget, the oldest cosmetic particles go first.

### Screen shake

Shake is rare. It only happens for:

- A bug or item of mass ≥ a medium bug landing at ≥ 1400 px/s: 3 px, 120 ms.
- A giant bug landing at ≥ 900 px/s: 5 px, 180 ms.
- The frog's ribbit, the finale fireworks, a cauldron eruption: 4 px, 250 ms, low frequency.

Shake is a random offset each frame, decaying linearly. Maximum 6 px ever. Reduce-motion turns shake off completely.

### Hit-stop

On very hard landings (≥ 1600 px/s), freeze the landing object for 60 ms before the squash plays. Nothing else stops.

### Sound cues per interaction

All sounds are synthesized (section 16). Every sound gets ±8 percent random pitch and ±2 dB random volume so repeats don't sound canned.

| Interaction | Sound ID | Recipe |
|---|---|---|
| Hover grabbable | `sfx_hover_tick` | 2 kHz sine blip, 20 ms, very quiet |
| Grab item | `sfx_grab` | Short noise pop through a band-pass tuned to the item's material |
| Grab bug | `sfx_grab_bug` + bug gasp | Pop plus the bug's voice "eep" |
| Drop | `sfx_drop` | Material impact at low volume |
| Fling | `sfx_whoosh` | Filtered noise with a falling band-pass sweep, length scaled by speed |
| Impact | `sfx_impact_<material>` | Material-specific: wood knock (triangle 300 Hz with fast decay + noise), metal clink (FM bell), rubber boing (sine with pitch drop), stone clack (noise burst high-passed), glass tink (sine 3 kHz + 4.5 kHz), leaf rustle (noise, 80 ms), food squish (low-pass noise + pitch wobble) |
| Splash | `sfx_splash` | Noise burst through a low-pass that opens, plus 3 bubble blips |
| Eat | `sfx_chomp` ×3 | Low-passed noise clicks + bug "nom" |
| Burp | `sfx_burp` | Sawtooth 80–120 Hz with a formant wobble, 400 ms. Pitched to the key |
| Spit | `sfx_ptoo` | Short noise + pitch-up blip |
| Hat lands | `sfx_hat_land_ding` | Two-note bell, root and fifth |
| Paint | `sfx_splat` | Wet noise burst with a low-pass drop |
| Dizzy | `sfx_dizzy_loop` | Tiny bird-tweet sine glides circling, as long as dizzy lasts |
| Poke | `sfx_boop` | Sine 600 Hz with a quick pitch bend up |
| Toggle on/off | `sfx_click_on`, `sfx_click_off` | Two-tone clicks, higher for on |
| Pocket in/out | `sfx_pocket_in`, `sfx_pocket_out` | Cloth rustle + zipper-ish noise sweep |
| Craft | `sfx_hammer` ×4 + `sfx_tada` | Wood knocks then a major arpeggio |
| Craft fail | `sfx_slide_whistle_down` | Sine glide 1200 to 300 Hz |
| Cauldron stir | `sfx_bubble_loop` | Random blips 200–600 Hz |
| Potion done | `sfx_potion_pop` | Cork pop (noise burst) + fizz |
| Discovery | `sfx_stamp` + `sfx_discovery_chime` | Thump then a 3-note rising chime in key |
| Area unlock | `sfx_unlock_fanfare` | 1-bar fanfare in the new area's key |
| Journal open/page | `sfx_page_flip` | Filtered noise sweep |
| Photo | `sfx_shutter` | Two clicks with a spring noise between |

---

## 16. Audio design

All audio is WebAudio, synthesized at runtime. No samples. One `AudioContext`, with a master bus split into three groups, each with its own volume setting: `bus_music`, `bus_sfx`, `bus_voices`. A soft limiter (a compressor at ratio 12, threshold −6 dB) sits on the master.

### Synth building blocks

A small library of voices that everything else uses:

| Block | Made of | Used for |
|---|---|---|
| `syn_pluck` | Sawtooth or square through a low-pass with a fast filter envelope | Harp, xylophone, bass |
| `syn_bell` | 2-operator FM, ratio 3.5, decaying index | Bell flowers, hat ding, chimes |
| `syn_pad` | 3 detuned sawtooths through a slow low-pass, long attack | Area beds |
| `syn_marimba` | Sine + sine at 4×, fast decay | Mushrooms, leaf xylophone |
| `syn_noise_hit` | White noise through a band-pass with a short envelope | Drums, impacts, rustles |
| `syn_kick` | Sine with fast pitch drop 150 to 45 Hz | Sequencer drum, heavy thuds |
| `syn_voice` | Oscillator + two band-pass formant filters + vibrato | Bug gibberish |

Synth nodes are pooled. At most 32 simultaneous voices. When over, the quietest oldest voice is stolen.

### Area palettes

| Area | Bed | Lead | Percussion | Texture |
|---|---|---|---|---|
| Stump Plaza | Warm `syn_pad` | `syn_marimba` | Soft `syn_noise_hit` shakers | Bird chirps (sine glides) at random |
| Puddle Pond | Airy pad with a slow chorus | `syn_bell` at low index, like glass | Water drips (sine blips with pitch drop) | Frog croaks (square through formant) at night |
| Flowerbed Stage | Brighter pad | `syn_pluck` guitar-ish | Full kit: kick, snare noise, hat | Buzzing of wings (sawtooth tremolo) |
| Under the Porch | Low hollow pad, a bit detuned | Muted `syn_pluck` bass walk | Brushed noise | Creaks (filtered noise sweeps), distant rain on boards |
| Compost Lab | Wobbly pad with LFO on the filter | `syn_bell` with high FM index, a little weird | Bubble blips | Fizzes and gloops |
| Treehouse Arcade | Square-wave arpeggio bed | Pulse-wave chiptune lead | 8-bit noise drums | Arcade blips |
| Ant Hill Depths | Low drone | Marching `syn_pluck` bass | Tiny snare rolls | Ant footsteps as a quiet tick carpet |
| Gnome Hollow | Very soft pad | `syn_bell`, high, sparse | None | Twinkles |

### Generative music

Each area's music is built live from layers that follow the music clock and the area's key and progression.

1. **Bed.** The pad plays the current chord's root, third and fifth, changing each bar. Always on at low volume.
2. **Bass.** Root on beat 1, fifth or octave on beat 3, with a 30 percent chance of a passing scale tone on beat 4.
3. **Melody.** A generator picks notes from the pentatonic scale with a random walk: 60 percent chance of a step of ±1 scale degree, 25 percent ±2, 15 percent repeat. It favors chord tones on beat 1. Phrases are 2 bars long, followed by 2 bars of rest, so the melody breathes. A phrase is repeated once 50 percent of the time, which makes it feel composed.
4. **Percussion.** A per-area pattern template with 20 percent random ghost notes.
5. **Band layer.** Added when `secret_band_of_three` conditions hold: a counter-melody an octave up.

Time of day changes the mix:

| Phase | Changes |
|---|---|
| Dawn | Bed and a sparse melody only. Tempo 84 |
| Day | All layers. Tempo 96 |
| Dusk | Percussion drops out, melody moves down an octave. Fiddle's chorus joins if found |
| Night | Tempo 72. Bed, bass at half density, melody at 30 percent density, an extra high twinkle layer (`syn_bell` notes every 2–4 bars). Crickets as a quiet noise-and-sine texture |
| Rain | Low-pass on the whole music bus at 2 kHz, rain noise layer, melody density ×0.5 |

Crossfade between areas over one bar when the camera crosses an area border. The world's music never gets louder or faster to create tension. There are no stingers except the discovery chime and unlock fanfare.

### Bug voices

Every bug speaks gibberish made from syllables. A voice line is 1 to 6 syllables.

- **Syllable.** One oscillator note with an attack-decay envelope, 60–250 ms long depending on the bug's syllable rate. It runs through two band-pass filters set to vowel formants picked at random from five vowels (a: 800/1200 Hz, e: 400/2000, i: 300/2300, o: 450/800, u: 325/700). Consonants are a 10–20 ms noise burst at the start of 50 percent of syllables.
- **Per-bug settings.** Waveform, pitch range, syllable rate, vibrato rate and depth, formant shift (bigger bugs shift formants down 20 percent), grit (a waveshaper amount), and echo, all from the profiles in section 4.
- **Contours by emotion.** Happy: rising, ends high. Question: flat then a big rise on the last syllable. Grumpy: flat and low, short. Scared: fast, high, shaky. Dizzy: pitch wanders in a slow sine. Sleepy: falling, long. Singing (opera potion or instruments): pitches snapped to the area scale.
- **Seeded.** Each line is seeded from the bug ID and a line counter, so the same bug sounds consistent, but lines don't repeat back to back.
- **Speech bubbles.** Every voice line shows a speech bubble with 1–2 pictograms that match the emotion or the topic. The bubble lasts as long as the line plus 400 ms.
- **Volume rules.** At most 3 bugs talk at once. Others wait up to 1 s or skip the line. Bugs more than a screen away are silent.

---

## 17. UI and UX

### Wordless UI

The only text anywhere is bug names and short item names in the journal, and they're optional flavor. Every control is an icon drawn in the game's style with a thick outline.

On-screen during play:

| Position | Control | Behavior |
|---|---|---|
| Top-left | Pause (a leaf with two vertical lines) | Opens pause |
| Top-right | Journal (notebook) | Opens journal. Wiggles once when something new is logged |
| Top-right, left of journal | Camera | Photo mode |
| Bottom-center | Pocket tray | See section 2 |
| Bottom-right, only when not at home | Home (the stump icon) | Pans the camera to the plaza in 1 s |

Icons fade to 40 percent opacity when the cursor hasn't been near them for 5 s.

### Main menu

- Background: the plaza at sunset, live, with a few bugs wandering. The logo "Bugglebrook" is drawn as letters made of twigs, leaves and a snail shell for the "o". It's the only large text in the game, and it's art, not UI.
- Three save slots sit on the stump as three big wooden signs.
  - An empty slot shows a sprout in a pot with a "+" leaf. Click it to start a new game in that slot.
  - A used slot shows a live thumbnail of the world from the last autosave (taken from the camera view at last save, 320×180), plus a badge: a round token showing the face of the bug the player has fed most. The badge is how players tell slots apart without names. Below it, pictogram stats: a jar with fill level for completion, and small icons for how many bugs are found.
  - Click a used slot to continue.
  - To delete a slot, drag it onto a compost bin icon at the right. The bin lid closes slowly over 1.5 s. Dragging it back out before the lid closes cancels. When the lid shuts, the slot is gone.
- A settings gear on the menu opens the same settings panel as pause.
- A quit door icon on the menu closes the app.

### Pause and settings

Pause dims the world and freezes simulation. It shows a board with:

| Control | Look | Values |
|---|---|---|
| Music volume | A music note icon with a vine slider | 0–100, default 70 |
| Sound volume | A speaker-shaped snail shell with a slider | 0–100, default 80 |
| Voices volume | A bug mouth icon with a slider | 0–100, default 80 |
| Fullscreen | A square with four corner arrows, toggle | Default on |
| Reduce motion | A spiral with a slash, toggle | Default off. Reduces squash, disables shake and flash, halves particle counts, slows camera inertia |
| Edge scroll | Cursor with side arrows, toggle | Default on |
| Back to menu | A stump sign | Saves, then goes to the main menu |
| Resume | A play triangle | Closes pause |

Settings are stored per machine, not per slot.

### The first two minutes, with no text

The first session starts with a camera move and then gives full control. Nothing is locked or gated. The steps below describe what the scene is set up to invite, not a script the player must follow.

| Time | What's on screen | What it teaches |
|---|---|---|
| 0:00 | Fade in on the plaza at 09:00. The camera slides from the pond side to the stump, 3 s. Dot is asleep on a bottle cap in the middle of the screen, snoring bubbles. A red berry sits next to her | The world is alive and wide |
| 0:03 | Control is live. When the cursor moves, every bug on screen glances at it. When it gets near Dot, she wakes up and looks at it | The cursor is noticed |
| 0:05 | Hovering Dot changes the cursor to a grab hand and adds the rim light. Dot shows a thought bubble with a berry | Things can be grabbed. Bugs want things |
| 0:10 | Most players click Dot or the berry. Grabbing the berry makes Dot's mouth glow green | Holding food shows who wants it |
| 0:15 | Feeding Dot: chomp, sparkle, happy voice, and the journal icon wiggles once with a stamp sound | Feeding works. The journal notices |
| 0:20–0:60 | Dot wanders to the spring in the toy pile, bounces on it, and whoops. Boing hops over to try it too. Rollo curls up when something lands near him | Bugs use toys on their own |
| ~0:40 | If the player hasn't grabbed a bug yet, Dot walks up to the cursor and does her "again!" gesture with a spring pictogram | Bugs can be grabbed and flung |
| 1:00–2:00 | The player flings things. First hard landing plays the dizzy stars and recovery. The pond is visible at the left edge with Skeet skating, and the lattice with blinking eyes at the right edge | Flinging is fine, bugs recover. There's more to find both ways |
| Any time | If the player hasn't panned after 60 s, the camera drifts 200 px toward the pond and back once, as if it noticed Skeet | The world scrolls |

No arrows, no hand-pointer tutorials, no messages. If a player skips all of this and starts panning, nothing is lost.

### Readability rules

- Loose items always have a thick outline and saturated fill. Background art is flatter, lower-contrast and has thinner outlines. Players must be able to tell grabbable from scenery at a glance.
- Minimum grab target is 36×36 px, even for small items: the hit area extends beyond the drawn shape.
- Thought bubbles and speech bubbles always render above everything except UI.

---

## 18. Save data

Autosave every 30 s of play, on area change, on any discovery, on pause, on quitting and on window close. Saves are JSON, written atomically (write to a temp file, then rename), in the app's user-data folder as `slot1.json`, `slot2.json`, `slot3.json`, with one previous version kept as `slotN.bak.json`. Each file has a `version` number and a migration function per version bump.

What persists, per slot:

| Group | Fields |
|---|---|
| Meta | `version`, `created_at`, `last_saved_at`, `play_time_s`, `badge_bug_id`, thumbnail PNG as base64 (320×180) |
| Clock | Game time of day, day count, current weather and its remaining time, music clock phase |
| Camera | Camera x, current area |
| Areas | For each area: unlocked flag, barrier states (lattice moved, sunflower upright, tunnel latch open, bucket lift state, gnome nose placed), pond level, fixture states (lamp on, hose on, stage light mode, sequencer patterns A and B, mute rows, speakers muted, jar claw stock, knothole cooldowns, ingredient shelf stock) |
| Items | Every item instance: unique instance ID, item ID, area, position, rotation, linear and angular velocity (zeroed if under a small threshold), tags with remaining timers, paint layers, `tag_player_setup` timer, contents (for containers), joints (sticky welds, strings, pegboard snaps) as pairs of instance IDs plus anchor points |
| Bugs | For each bug: found flag, area, position, facing, state (saved as a restorable state; transient states like airborne save as idle at the landing point), needs, mood, affinities, memory list, worn items per slot, held item, paint layers, active potion effects with remaining time, Munch's form and leaf counter, sleeping flag |
| Pocket | Six slots with instance IDs and stack counts |
| Journal | Discovered and hinted entries per page with discovery timestamps, bug observation slots (likes and dislikes seen), mystery step progress, sparkle hint target, photo portrait choices |
| Photos | The last 60 thumbnails with their file paths and which journal entries they're linked to |
| Counters | Zipline ride count, claw win streak, lost-shelf items, times each bug was fed (for the badge), respawn timers per area spawn list |

Not saved per slot: settings (volume, fullscreen, reduce motion, edge scroll), which live in `settings.json`.

Loading must restore the world exactly: every item and bug in place, joints intact, potions still running. Physics bodies are recreated from saved state and settled for 3 frames with gravity off, then released, so stacks don't explode on load.

---

## 19. Build milestones

Each milestone is a vertical slice that runs, ships as a build, and has automated tests. Tests must pass before the milestone is committed. Acceptance criteria are written so a test can check them directly: unit tests on data and systems, integration tests on the simulation with a fixed timestep and seeded randomness, and Electron end-to-end tests driving the mouse.

### M1. Core toy: one area, three bugs, grab and fling
**Features.** Electron app boots into `area_stump_plaza` (art simplified to its layout shapes). Physics world with ground, the stump and the toy pile. Items: bottle cap, marble ×2, pebble ×4, ruler ramp, spring, rubber ball, berry ×3, twig, leaf. Bugs: Dot, Rollo, Glorp with body plan, eyes that track the cursor, walking. Verbs: grab, drag, drop, fling, poke. Basic AI: needs (hunger, fun, energy), wander, seek and use for eating and bouncing. Squash and stretch on grab, fly and land. Dizzy state. Camera pan by drag and scroll within the area.
**Acceptance.**
- App launches and renders the plaza within 5 s; frame time stays under 16.7 ms with 3 bugs and 20 items (measured over 600 frames in e2e).
- A mouse press on a bug puts it in `st_held`; releasing at ≥ 250 px/s puts it in `st_airborne` with velocity within 10 percent of the cursor's average over the last 80 ms.
- A landing at ≥ 900 px/s puts the bug in `st_dizzy` for the duration formula in section 5 (±0.1 s).
- With hunger set to 10 and a berry in range, a bug eats a berry within 20 s of simulated time (seeded).
- Items don't tunnel through the ground at 2600 px/s (1000 seeded flings).
- Scroll and background drag move the camera and never move items.

### M2. Feeding, likes and reactions
**Features.** Drop target system with snap radii and priority. Mouth glow by preference. Like and dislike tables for the 3 bugs. Reaction sets (grab, poke, fling, land, fed loved/liked/neutral/disliked) with 3 variants each. Bug voice synthesis v1 and speech bubbles with pictograms. Thought bubbles for low needs. Sound effects for grab, drop, fling, impact per material. Hover affordances and cursor poses.
**Acceptance.**
- Dropping a berry within 50 px of a bug's mouth anchor triggers `st_eat`; outside 50 px it falls.
- A disliked food results in a spit event and the food item remains in the world.
- The same reaction type fired 3 times in a row never picks the same variant twice in a row.
- Every interaction in the verb table produces at least one audio event (checked through an audio event log).
- Hovering a grabbable object switches the cursor to `hover_grab` within 1 frame.

### M3. Properties and the pond
**Features.** Material and tag system with rules R1–R10 and R14–R15. `area_puddle_pond` with buoyancy, splash, current, hose tap, lily pads. Skeet walks on water. Continuous world strip with the plaza and pond, area sleeping, and edge scroll while holding. Sponge, cork, leaf raft, paper boat, soap, bubble wand. Swimming state and shake-dry.
**Acceptance.**
- Items with density < 1 float and come to rest at the surface within 5 s; density > 1 items reach the pond bottom.
- Any item entering water gains `tag_wet` and loses `tag_painted`, `tag_smelly`, `tag_sticky`.
- `tag_wet` + `tag_hot` contact removes both within 250 ms.
- Sticky contact creates a joint that breaks when pulled at > 900 px/s.
- Carrying an item to the screen edge pans the camera and the item arrives in the pond area with its tags intact.
- The pond area sleeps (no physics steps) when the camera is two areas away.

### M4. Full needs AI, social play and the setup rule
**Features.** All five needs, moods, advertisement scoring with top-3 weighted choice, memory, all states from the table, social interactions (chat, bump, share, tag, gawk, comfort), Boing added. Setup rule with `tag_player_setup`. Off-screen coarse simulation.
**Acceptance.**
- Given a seeded world, over 10 minutes of simulated time no bug moves, carries, packs or eats an item whose `tag_player_setup` timer is active.
- A stack of 3 player-placed items stays standing through 10 minutes with 4 bugs wandering nearby (bug walk forces capped).
- A new item dropped within 900 px of an idle bug gets inspected by at least one bug within 30 s (seeded, 20 trials, ≥ 18 pass).
- Needs don't change while the game is paused or closed.
- Bugs in a sleeping area are in a plausible non-held state when the area wakes.

### M5. Save, load, menu and pocket
**Features.** Autosave rules, 3 slots, atomic writes, backups, versioning. Main menu with slot thumbnails, badges and delete-by-bin. Pause and settings (volumes, fullscreen, reduce motion, edge scroll). Pocket tray with stacking and swap.
**Acceptance.**
- Save then load reproduces every item and bug position within 1 px and all tags and timers within 0.1 s.
- Killing the process mid-save leaves either the new or the previous save loadable (simulated by aborting between temp write and rename).
- Three slots are independent: changes in slot 2 never affect slots 1 and 3.
- Items and bugs stored in the pocket survive save and load and can be dragged out in another area.
- Settings persist across app restarts and aren't stored in slot files.
- Reduce motion disables screen shake entirely (shake offset always 0).

### M6. Day, night and weather
**Features.** 24-minute clock, sky and lighting passes, glow lighting at night, sundial with fast-forward, weather state machine (clear, cloudy, rain, wind, rainbow), rain effects (wet, pond level, puddles), wind effects, sleep behavior, night bugs framework. Weather vane.
**Acceptance.**
- Game time advances 1 game minute per real second and phases start at the listed times.
- Dragging the sundial forward advances time and never backward.
- During rain, an outdoor item gets `tag_wet` within 5 s; an item under the porch doesn't.
- At night, day bugs with energy < 50 enter `st_sleep` within 60 s and aren't woken by AI.
- Pond level rises during rain and drains after, within the stated rates.

### M7. More areas and unlocks
**Features.** `area_flowerbed_stage` (without the sequencer), `area_under_porch`, `area_compost_lab` (without the cauldron), `area_treehouse_arcade` (pegboard, bead pit, slide, claw), with their barriers and unlock rules: sunflower, lattice, can tunnel, bucket lift. Locked-area previews. Bugs Whiff, Moose, Barty, Munch, Prim, Twig with their find secrets.
**Acceptance.**
- Each barrier blocks bugs and the camera (with 400 px look-ahead) until its condition is met, then stays open after save and load.
- Wetting the sunflower's soil patch with any `tag_wet` item opens the flowerbed.
- A 48 px rolling ball through the can tunnel opens the latch; a 24 px marble does not.
- The bucket lift raises the bottom bucket when its contents' mass exceeds the acorn's.
- Each find secret adds the bug to the cast and the journal.

### M8. Crafting and potions
**Features.** Tinker Bench with all 32 recipes, near-miss hints, blueprints, bug wishes, failed-combo junk blobs that split back apart, un-crafting. Compost cauldron with essences, stirring, all 32 potion outcomes, sludge, shattering potions on bugs and items. Bug scope. Remaining tag rules R11–R24.
**Acceptance.**
- Every recipe in the table produces its output regardless of input order (data-driven test over all recipes and all permutations).
- Every failed combo produces a junk blob whose parts can be recovered, so the total item count is unchanged (food excepted).
- Every essence and pair rule in section 9 produces the specified potion ID (table-driven test).
- Potion effects apply, persist through save and load, and end when their timer runs out or the bug is dunked.
- A giant bug's mass is 4× its base.

### M9. Music
**Features.** Music clock, per-area keys and progressions, generative music with time-of-day and rain mixes, instruments, bugs playing instruments and forming bands, mushroom sequencer with row mutes, A and B patterns, clear and double speed, bluebell speakers. Buzzby and Fiddle, plus Luma and Flick via night triggers.
**Acceptance.**
- Every pitched note emitted in an area is a member of that area's scale (audio event log check over 5 minutes of play with random instrument use).
- Player notes start on a 16th-note boundary of the music clock.
- A sequencer pattern persists through save and load and plays the same notes.
- Bugs never modify a non-empty sequencer grid (10 minutes simulated with bugs nearby).
- 3 bugs performing on stage adds the band layer and logs `secret_band_of_three`.

### M10. Journal, secrets and hidden areas
**Features.** Journal with all pages, entry states, observation slots, completion jar and area counts, sparkle hints, map-page travel. All 67 secrets and 4 mysteries. `area_ant_hill_depths` and `area_gnome_hollow`. Wubbo. The finale. Window telescope hints and bug hint bubbles.
**Acceptance.**
- Each secret has an integration test that sets up its prerequisites, performs its trigger, and asserts the result and the journal entry.
- Secrets with prerequisites cannot fire before their prerequisites (tested for every row with a "Requires" value).
- Completion percent equals discovered ÷ total countable entries.
- Unique items return to their spawn point when flung out of bounds and cannot be destroyed.
- Discovery feedback never blocks input for more than 1 frame.

### M11. Photo mode and the full cast of hats
**Features.** Photo mode with the camera moment, pan and zoom, 10 frames, all stickers, 7 filters, PNG saving to Pictures, thumbnails in the save, journal portraits. All 29 wearables with slot logic and extra effects.
**Acceptance.**
- Taking a photo writes a valid 1920×1080 PNG to `<Pictures>/Bugglebrook/` with the timestamp name.
- The simulation is frozen while photo mode is open (positions unchanged over 120 frames).
- Every wearable attaches to every bug's correct anchor and scales to its head radius (table test over 29 × 16 combinations).
- Wearing a second item in a slot pops the first off.

### M12. Polish, performance and release readiness
**Features.** Full juice pass (particles, hit-stop, shake rules, follow-through), full reaction variant sets, all voice contours, area art detail pass, particle and voice budgets, AI tick throttling, accessibility pass for reduce motion, auto-update wiring, CI builds for all platforms creating a draft release.
**Acceptance.**
- 16 bugs, 150 items and night lighting in one area hold 60 fps on the reference mid-range PC (average frame ≤ 16.7 ms, 99th percentile ≤ 22 ms over 60 s).
- Particle count never exceeds 400; simultaneous synth voices never exceed 32.
- With reduce motion on: no shake, no flash, squash amplitude ≤ 40 percent of normal.
- A 30-minute scripted soak test (random grabs, flings, crafts, potions, area changes, saves and loads) finishes with no errors, no NaN positions and no item below the ground line.
- All earlier milestone tests still pass.
