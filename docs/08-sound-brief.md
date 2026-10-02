# Bugglebrook sound brief

This is two documents in one. Parts 2 to 5 are for the owner (and the artist, for part 4), who gather the recorded sounds. Part 6 is the spec engineers build M12's sample system against. Part 5 covers licensing.

The idea: real recordings for the sounds where they beat the synth (wet, messy, organic, and ambient sounds), with variation added in code so nothing repeats, and the existing synth as the fallback for anything without a sample. Bug voices stay synthesized unless the artist records her own (part 4). Music is covered by `docs/05-music-brief.md`.

This changes the Audio row of `docs/00-decisions.md`, which says sound effects are synthesized. **The owner has to amend that row before M12 starts**, the way the art and music rows were amended. Agents don't edit that file.

Source terms below were checked on 2026-10-02. Where a detail could not be confirmed, the brief says so and gives an instruction that works either way.

---

## 1. How sound works now, and the plan

### 1.1 Today

- Every sound effect is synthesized on the fly with WebAudio (`src/renderer/src/audio/synth.ts`): oscillators and filtered noise, with a little random pitch. There are about 190 named sounds (`SfxName` in `audio/sfx.ts`, plus `CraftSfx` in `craftSfx.ts` and `TidySfx` in `tidySfx.ts`).
- `Sfx.attach` subscribes to game events on `sim.events` and maps each to a sound. Some calls are rate limited (`limited`) so floods don't machine-gun. The renderer calls `Sfx.play` directly for UI, gestures, and photo mode.
- Ambience is sparse spot sounds, not beds. Every 2.5 to 6.5 s, `WorldView.ambience` plays one sound for the area at the camera: `bee_hum` or `birdsong` in the flowerbed (`tulip_hum` at night), `creak` or `drip` under the porch, `bubble_blorp` or `steam_hiss` in the compost lab, `arcade_blip` or `leaf_rustle` in the treehouse, and the odd `birdsong` elsewhere in the day. The pond and the plaza have no ambience of their own.
- Weather is synthesized ticks: `WeatherView.sounds` fires a `rain` tick every 90 to 170 ms while it rains, a `wind` whoosh now and then, and `cricket` chirps at night. The porch adds `board_patter` in rain.
- Bug voices (`audio/voices.ts`) are gibberish syllables from an oscillator through two formant filters. Each bug has a `VoiceProfile` (wave, pitch range, syllable rate, vibrato, formant shift). Lines take an emotion (14 of them: `happy`, `question`, `grumpy`, `scared`, `dizzy`, `sleepy`, `whee`, `ooh`, `giggle`, `gasp`, `yum`, `love`, `yuck`, `meh`), and the bug's mood and potions bend the pitch and tempo.
- Nothing is panned. Three buses (`sfx`, `voice`, `music`), one slider each. The synth caps itself at 32 voices.
- Tests use `NullAudioBackend`, which records what would have played, and `__bb.sfxLog()` returns the names of recent sounds.

### 1.2 The hybrid plan

```
game event ──> Sfx.play(name, intensity, material, at)
                   │
                   ├─ manifest has a sample folder for `name` (or an alias)?  ──> sample player
                   │     pick a take (shuffle bag), random pitch and gain,
                   │     pan by screen x, voice limit, play on bus_sfx
                   │
                   └─ no sample, not loaded yet, or decode failed  ──> the existing synth, unchanged
```

1. **Samples where they help.** About 45 sounds (part 2). Each has 3 to 8 takes.
2. **Variation in code.** Every play picks a take from a shuffle bag (never the same take twice in a row), shifts pitch by a few semitones, and shifts gain by a dB or two. Intensity (how hard something hit) scales gain and darkens the sound with a low-pass. Five takes with variation sound like fifty.
3. **The synth stays as the fallback, per sound.** Delete a folder and that sound goes back to the synth. A build with no samples at all is the game as it is today. Nothing breaks.
4. **Ambience gets beds.** Each area gets a quiet looping bed for day and one for night, crossfading at dusk and dawn and between areas. The current spot sounds stay on top, played from samples where we have them.
5. **Weather gets beds too.** Rain and wind become loops whose gain follows `rain` and `wind`, replacing the tick-by-tick synth rain.

### 1.3 What stays synthesized, and why

| Sounds | Why they stay synth |
|---|---|
| Bug voices (unless part 4 happens) | They follow mood, potions, and personality per syllable. The synth does that for free. |
| Music toys, `note`, the sequencer, `band` | They lock to the current track's key and tempo (`musicClock`). |
| Rewards and magic: `sparkle`, `twinkle`, `ta_da`, `secret`, `unlock`, `craft_tada`, `fanfare`, `blueprint`, `shimmer`, `wish`, `bell`, `stage`, `grow`, `shrink`, `float_up`, `potion_twinkle`, `potion_whoosh`, `poof` | Tonal. They should sit in the music's key, and their synthetic sparkle is the game's sound for magic. |
| Hand and UI feedback: `grab`, `grab_bug`, `fling`, `hover`, `pan`, `scroll`, `edge`, `ui_*`, `toggle_*`, `pick`, `stamp` | Tiny, crisp, and tuned per material. A recording adds nothing and risks sounding cheap. |
| Character comedy: `dizzy`, `boop`, `tag`, `impact_bug`, `tickle`, `wriggle`, `sniff`, `snore`, `achoo`, `sneeze`, `gag`, `ptoo` | These are voices in all but name. They follow part 4 if she records. |
| `arcade_blip` | Chiptune is synthetic by nature. |

---

## 2. The sound list

Priority: **1** = do first (the most-heard sounds, where the synth is weakest), **2** = next, **3** = nice to have. If you only do the priority 1 rows, the game already sounds different.

Style for all of them: **cartoony-real**. A real recording, but small, soft, and bouncy, as if heard from a bug's size. Clean and close, with no room echo, no background voices or traffic, no music. Never gory, harsh, or scary: wet is fine, guts are not; a burp is funny, a retch is not. When in doubt, choose the one that makes you smile.

"Folder" is the folder name you create in `assets/sfx/` (part 3). It is the game's sound name, so the game finds it without anyone writing code.

### 2.1 Water

| P | Folder | Plays on (events) | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `splash` | `splashed` (fast or big things) | Something plump landing in a puddle: a round "sploosh" with a few droplets after. Not a cannonball in a pool. | 6 | 0.4 to 0.9 s | Freesound CC0: `small splash`, `pebble water splash`, `hand splash water`. Sonniss: files named with `WATER` and `Splash`. |
| 1 | `plop` | `splashed` (slow, small); also `skipped` and `floor_dropped` through an alias | A small "bloop" of a pebble or a drop falling in. Pitched and short. | 6 | 0.15 to 0.4 s | Freesound CC0: `water plop`, `drop in water`, `bloop`. Kenney has none. |
| 2 | `drip` | Porch ambience spot | Single drips into a puddle or a tin, with a little tone. | 6 | 0.1 to 0.4 s | Freesound CC0: `water drip`, `drip tin`, `cave drip`. |
| 2 | `pour` | `cauldron_tipped`; `trickle` (the hose) through an alias | A short glug of liquid poured from a bottle onto soil. | 3 | 1 to 1.5 s | Freesound CC0: `pour water`, `glug bottle pour`. |
| 2 | `shake_dry` | `bug_shook_dry` | A wet dog shake, scaled down: a quick flappy spray. | 4 | 0.4 to 0.8 s | Freesound CC0: `dog shake water`, `wet cloth flap`, `spray shake`. |

### 2.2 Goo and gross

| P | Folder | Plays on (events) | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `squelch` | `stuck`; `wrung_out` (`squish`) through an alias | Stepping into mud or squeezing slime: wet, sticky, short. | 6 | 0.2 to 0.6 s | Freesound CC0: `slime squelch`, `mud squelch`, `squish`. Sonniss: `GOO`, `SLIME`, `Squelch`. |
| 1 | `pop` | `unstuck`, `lift_moved` (top) | A suction cup coming off, or a finger pulled out of a cheek. Bright and clean. | 6 | 0.1 to 0.3 s | Freesound CC0: `mouth pop`, `suction cup pop`, `cork pop small`. |
| 1 | `blob_squeak` | `blob_squeaked`; `blob_split` through an alias | A squishy rubber toy, wet. Cute, never a fart. | 6 | 0.2 to 0.5 s | Freesound CC0: `squeaky toy`, `rubber squeak`, `slime squish squeak`. Suno prompt below. |
| 1 | `burp` | `bug_burped`; `potion_burped` and `trash_burp`, `trash_hiccup`, `chomp_burp` through aliases | Short, round, comic burps, from tiny to proud. Mouth sounds, not stomach noises. | 8 | 0.3 to 1.0 s | Freesound CC0: `burp`, `belch short`. Best source: part 4 (her own burps). |

### 2.3 Eating

| P | Folder | Plays on (events) | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `nom` | `bug_fed` (liked); `bug_nibbled` (`nibble`) through an alias | A soft, happy munch with closed lips: "mm-nom". | 6 | 0.2 to 0.5 s | Freesound CC0: `eating mouth`, `munch`, `chewing soft`. |
| 1 | `chomp` | `bug_ate` | One crisp bite of an apple or a cracker. | 6 | 0.15 to 0.4 s | Freesound CC0: `apple bite`, `crunch bite`, `carrot bite`. Sonniss: `FOOD`, `Bite`. |
| 2 | `slurp` | `sunflower_drank`; `potion_drunk` (`gulp`) through an alias | A slurp through a straw, then a gulp. | 4 | 0.4 to 1.0 s | Freesound CC0: `slurp`, `straw slurp`, `gulp drink`. |

### 2.4 Impacts by material

These play on `bonked` (things hitting things), `item_dropped`, and `item_poked`, through `impact_<material>`. The game's materials map onto these eight (`soundMaterial` in `sfx.ts`). Get light and medium hits; the game makes them softer for gentle bumps. No heavy crashes: everything in this world is small.

| P | Folder | Material | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `impact_wood` | Wood (blocks, sticks, the bench); also `crash`, `knock`, and `stomp` through aliases | A wooden block or spool knocked on a table. Hollow "tok". | 8 | 0.1 to 0.4 s | Kenney **Impact Sounds**: `impactWood_*`, `impactPlank_*`. Freesound CC0: `wood block hit`, `wooden toy drop`. |
| 1 | `impact_metal` | Metal (bottle caps, cans, keys); also `tray_clink` through an alias | A bottle cap or a tin lid dropped: a light "tink" with a short ring. | 8 | 0.15 to 0.6 s | Kenney **Impact Sounds**: `impactTin_*`, `impactMetal_light_*`, `impactPlate_light_*`. Freesound CC0: `bottle cap drop`, `tin can hit`. |
| 1 | `impact_rubber` | Rubber and plastic (balls, erasers) | A small rubber ball hitting a floor: dull "bup". | 6 | 0.1 to 0.3 s | Kenney **Impact Sounds**: `impactSoft_*`. Freesound CC0: `rubber ball bounce`, `plastic toy drop`. |
| 1 | `impact_stone` | Stone and shell (pebbles, snail shells) | A pebble on a pebble: hard click with a little crunch. | 6 | 0.1 to 0.3 s | Freesound CC0: `pebble hit`, `stone clack`, `pebbles drop`. Sonniss: `ROCKS`. |
| 1 | `impact_glass` | Glass (marbles, jars, potion bottles) | A marble on a jar: a bright "clink". | 6 | 0.1 to 0.5 s | Kenney **Impact Sounds**: `impactGlass_light_*`. Freesound CC0: `marble clink`, `glass jar tap`. |
| 2 | `impact_leaf` | Leaf, cloth, paper | A leaf or a crumpled paper landing: a soft papery "fff-tap". | 6 | 0.1 to 0.4 s | Freesound CC0: `paper drop`, `leaf crunch`, `cloth drop`. Kenney **RPG Audio**: `cloth*`. |
| 2 | `impact_food` | Food and jelly | A berry or grape landing: soft, a bit squishy. | 6 | 0.1 to 0.3 s | Freesound CC0: `grape drop`, `fruit drop`, `jelly splat small`. |
| 2 | `shatter` | `shattered` (ice), `potion_shattered` (`smash`) through an alias | A small glass or ice cube breaking: tinkly, light, short. Not a window. | 4 | 0.4 to 1.0 s | Freesound CC0: `glass break small`, `ice break`, `ornament break`. Sonniss: `GLASS`, `Break`. |

### 2.5 Machines and fixtures

| P | Folder | Plays on (events) | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `trash_clack` | `trash_poked` | A tin can's hinged lid flapping shut: tinny clang-clack. | 5 | 0.2 to 0.5 s | Freesound CC0: `tin can lid`, `trash can lid`, `metal lid clang`. Kenney **RPG Audio**: `metalPot*`, `metalLatch`. |
| 1 | `trash_chomp` | `trash_chomped` | The lid snapping on something, with a muffled crunch inside. | 5 | 0.3 to 0.6 s | Layer it yourself or take a lid slam plus a crunch: Freesound CC0 `lid slam tin`, `can crush small`. Suno prompt below. |
| 1 | `trash_rummage` | `trash_rummaged` | Cans and wrappers rattled about inside a bin. | 3 | 1.0 to 2.0 s | Freesound CC0: `rummaging trash`, `tin cans rattle`, `wrapper rustle`. |
| 1 | `whistle_toot` | `whistle_blown` | A toy pea whistle: a short trill, then a longer blast. Bright, friendly, not shrill. Turn it down 6 dB from a referee's. | 4 | 0.5 to 1.0 s | Freesound CC0: `pea whistle`, `toy whistle`, `referee whistle short`. |
| 1 | `brew_bubble` | `cauldron_bubbled`; `cauldron_full` through an alias | Thick porridge or bubbling mud: gloopy pops. | 5 | 0.8 to 2.0 s | Freesound CC0: `bubbling mud`, `boiling porridge`, `gloop bubbles`. Suno prompt below. |
| 1 | `cauldron_plop` | `cauldron_added` | Something dropped into a thick soup: a heavy "glop". | 6 | 0.2 to 0.5 s | Freesound CC0: `drop in mud`, `object in soup`, `glop`. |
| 2 | `cork_pop` | `potion_brewed` | A small cork popping out of a bottle. | 4 | 0.2 to 0.4 s | Freesound CC0: `cork pop`, `bottle cork`. |
| 2 | `hammer` | `bench_pulled` (with parts) | A small mallet tapping wood, twice or three times. Toy workshop, not construction. | 5 | 0.3 to 0.8 s | Freesound CC0: `small hammer wood`, `mallet tap`. Kenney **RPG Audio**: `chop`, `metalClick`. |
| 2 | `bench_rattle` | `bench_pulled` (with parts); also `bench_clunk` through an alias | Junk shaken in a wooden tray: bolts, buttons, a spring. | 4 | 0.5 to 1.0 s | Freesound CC0: `rattle box of bolts`, `junk rattle`. Kenney **Casino Audio**: chip rattles work in a pinch. |
| 2 | `dial` | Sundial turned (the `dial` gesture sound) | A stone or heavy plate turning: a short grind with clicks. | 3 | 0.5 to 1.2 s | Freesound CC0: `stone grind`, `ratchet click`, `combination dial`. |

### 2.6 Weather beds (loops)

| P | Folder | Plays when | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `rain_bed` | `weather.rain > 0` outdoors. Gain follows rain. | Steady rain on leaves and grass, close, no thunder, no cars. | 1 or 2 | 30 to 90 s | Freesound CC0: `rain on leaves`, `light rain garden`. Sonniss: `RAIN`. Check for thunder and traffic before you keep it. |
| 1 | `board_patter` | Rain while the camera is under the porch. Replaces `rain_bed` there. | Rain on wooden boards overhead: hollow drumming, with drips. | 1 or 2 | 30 to 90 s | Freesound CC0: `rain on roof wood`, `rain on porch`, `rain shed`. |
| 2 | `wind_bed` | `weather.wind > 0`. Gain follows wind. | Soft wind through grass and leaves, gusty but gentle. No howling. | 1 or 2 | 30 to 90 s | Freesound CC0: `wind in trees light`, `breeze grass`. Sonniss: `WIND`. |

### 2.7 Area ambience beds (loops)

One folder per area per time of day: `amb_<area>_day` and `amb_<area>_night`. These sit very quietly under everything (part 6.6). They should be nearly featureless: no single bird call that you'd notice repeating every 40 seconds. The spot sounds in 2.8 add the moments.

| P | Folders | Day sounds like | Night sounds like | Length | Where to look |
|---|---|---|---|---|---|
| 1 | `amb_plaza_day`, `amb_plaza_night` | A quiet backyard: distant birds, faint leaves, far-off summer air. | Crickets at a distance, a soft breeze. | 40 to 90 s each | Freesound CC0: `backyard ambience`, `garden birds distant`, `summer night crickets`. Sonniss: `AMBIENCE`, `Garden`, `Countryside`. |
| 1 | `amb_pond_day`, `amb_pond_night` | Lapping water, the odd insect buzz. | Water, frogs far off, crickets. | 40 to 90 s each | Freesound CC0: `pond ambience`, `pond frogs night`, `lake lapping`. |
| 1 | `amb_flowerbed_day`, `amb_flowerbed_night` | Bees and hoverflies among flowers, birds. | Crickets and a light breeze through stems. | 40 to 90 s each | Freesound CC0: `bees flowers`, `meadow summer`, `meadow night`. |
| 2 | `amb_porch_day`, `amb_porch_night` | Dry, enclosed, muffled outdoors heard through boards; the odd creak. | Quieter and closer: a single cricket, the house settling. | 40 to 90 s each | Freesound CC0: `under house`, `crawlspace ambience`, `barn interior quiet`. |
| 2 | `amb_compost_day`, `amb_compost_night` | Damp and busy: soft fizzing, distant drips, a faint gurgle. | Slower gurgles, drips. | 40 to 90 s each | Freesound CC0: `compost`, `bubbling swamp`, `fizz ambience`. Suno is a good fit here (prompt below). |
| 2 | `amb_treehouse_day`, `amb_treehouse_night` | High in the tree: wind in leaves, birds closer, wood creaking softly. | Leaves, an owl very far off, crickets below. | 40 to 90 s each | Freesound CC0: `tree canopy wind`, `forest birds`, `forest night owl distant`. |
| 3 | `amb_ant_hill`, `amb_gnome_hollow` | The hidden areas (M10), one bed each: underground ticking and shuffling for the ant hill, a warm hollow hush for the gnome. | Same file day and night. | 40 to 90 s each | Freesound CC0: `underground ambience`, `insects walking`, `cave room tone`. Suno prompt below. |

### 2.8 Spot sounds and critters

| P | Folder | Plays on | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `birdsong` | Flowerbed and plaza day spots | Short calls of small songbirds (robin, wren, sparrow), one call per take, a little distant. | 8 | 0.5 to 2.0 s | Freesound CC0: `robin call`, `wren song`, `sparrow chirp`. Cut long recordings into single calls (the importer can split, part 3). |
| 1 | `bee_hum` | Flowerbed day spots | A bee flying past: buzz rising and falling. | 4 | 1.5 to 3.0 s | Freesound CC0: `bee fly by`, `bumblebee buzz`. |
| 2 | `cricket` | Night (the weather view) | One cricket's chirp series. | 6 | 0.5 to 1.5 s | Freesound CC0: `cricket chirp`, `field cricket`. |
| 2 | `creak` | Porch spots | Old wood creaking, short and gentle. | 6 | 0.3 to 1.2 s | Kenney **RPG Audio**: `creak*`. Freesound CC0: `wood creak`, `floorboard creak`. |

### 2.9 Photo mode and the journal

| P | Folder | Plays on | Sounds like | Takes | Length | Where to look |
|---|---|---|---|---|---|---|
| 1 | `shutter` | Photo mode's shutter | An old film camera or a toy camera: click-whirr. | 3 | 0.2 to 0.6 s | Freesound CC0: `camera shutter film`, `toy camera click`. |
| 1 | `page_turn` | Turning a journal page (M10; event name follows the journal work, e.g. `journal_page_turned`) | A thick paper page flipping. | 6 | 0.3 to 0.7 s | Kenney **RPG Audio**: `bookFlip1` to `bookFlip3`, `bookOpen`, `bookClose`. Freesound CC0: `page turn`, `book page flip`. |

That's 46 rows and 53 folders (the ambience rows are pairs).

### 2.10 Aliases: sounds that borrow a folder

These game sounds play another folder's takes with a tweak, so they need no folder of their own. Engineers keep this table in code (part 6). If you later make a dedicated folder for one, it wins.

| Game sound | Borrows | Tweak |
|---|---|---|
| `plip`, `floor_dropped` | `plop` | Pitch up 7 semitones, gain -6 dB |
| `trickle` | `pour` | Gain -6 dB |
| `squish` | `squelch` | Pitch down 3 semitones |
| `blob_split` | `blob_squeak` | Two takes 60 ms apart |
| `bubble_burp`, `chomp_burp` | `burp` | Pitch up 4 semitones |
| `sludge_burp` | `burp` | Pitch down 5 semitones |
| `trash_burp` | `burp` | Pitch down 7 semitones, through a tinny band-pass (the can) |
| `trash_hiccup` | `burp` | Shortest take, pitch up 9 semitones |
| `nibble` | `chomp` | Pitch up 5 semitones, gain -9 dB |
| `gulp` | `slurp` | The last 40 percent of a take |
| `smash` | `shatter` | Gain +2 dB |
| `crash` | `impact_wood` | Three takes 70 ms apart, falling in gain |
| `knock`, `knock_back` | `impact_wood` | Two takes 140 ms apart |
| `stomp` | `impact_wood` | Pitch down 12 semitones, low-passed |
| `bench_clunk` | `impact_wood` | Pitch down 5 semitones |
| `tray_clink` | `impact_metal` | Pitch up 5 semitones, gain -6 dB |
| `cauldron_full` | `brew_bubble` | Gain -6 dB |
| `drop` | `impact_<material>` | Gain scaled by speed, as now |

### 2.11 Later, if they're fun

Not in the 46, but good candidates once the first batch is in: `stink_puff` (a soft comic air puff), a pond `frog` croak at night (needs a new spot), `gust`, `sticker_peel` and `sticker_stick`, `vane` (squeaky weathervane), `spring` (a real doink), `deflate`, `domino`, `freeze`, `sizzle`, `bubble_blorp`, `steam_hiss`, `pocket_in`, `paint`.

### 2.12 Suno sound prompts for the weird ones

Use these only if Freesound and Kenney have nothing good, and read part 5.4 first: anything from Suno counts as AI content on the Steam page. In Suno: **Create**, **Custom**, choose **Sounds** in the dropdown, then **One Shot** or **Loop**. It makes two candidates per prompt.

| Folder | Type | Prompt |
|---|---|---|
| `blob_squeak` | One Shot | `cute rubbery slime toy squeak, wet and squishy, short, close mic, cartoon, no voice, no music` |
| `trash_chomp` | One Shot | `tin can lid snapping shut on something crunchy, small metal clang with muffled crunch inside, cartoon foley, dry, no music` |
| `brew_bubble` | One Shot | `thick bubbling potion in a small cauldron, gloopy bubbles popping, cartoon, close, dry, no music` |
| `burp` | One Shot | `short funny cartoon burp, small creature, round and polite, no words, no music` |
| `amb_compost_day` | Loop | `damp compost heap ambience, soft fizzing, gentle bubbling, distant drips, calm, no music, no melody, seamless loop` |
| `amb_ant_hill` | Loop | `underground ant tunnel ambience, tiny footsteps ticking, soft earth shuffling, warm, calm, no music, seamless loop` |
| `amb_gnome_hollow` | Loop | `cozy hollow inside a garden gnome, warm room tone, faint wind outside, soft magical hush, no music, no melody, seamless loop` |
| `dial` | One Shot | `small stone sundial turning, short stone grind with ratchet clicks, cartoon foley, dry` |

Set no BPM or key: these aren't musical. Pick the candidate with the least "musical" sound and no reverb tail.

---

## 3. Downloading and naming: the rules

### 3.1 The folder

```
assets/sfx/
  splash/
    small-splash-01.wav        <- takes: any names you like
    small-splash-02.wav
    freesound_123456_pebble.flac
    source.txt                 <- required: where each file came from
  impact_wood/
    impactWood_light_000.ogg
    impactWood_light_001.ogg
    impactPlank_medium_002.ogg
    source.txt
  amb_plaza_day/
    backyard-morning.wav
    source.txt
```

1. **One folder per sound**, at `assets/sfx/<folder>/`, named exactly as in part 2. Lowercase, underscores, no spaces. The importer stops with a "did you mean" if a folder name isn't on the list.
2. **Put the takes in the folder.** File names don't matter. `.wav`, `.flac`, `.mp3`, and `.ogg` all work. Take the best format offered (WAV or FLAC beats MP3). Don't convert anything yourself.
3. **Several sounds in one file is fine.** If a download has six splashes with gaps between them, drop it in as is. The importer splits a file at every silence longer than 0.3 s and makes each piece a take. If you want a file kept whole (a bird call with a pause in the middle), add `split: no` to its block in `source.txt`.
4. **Don't trim, normalize, or fade.** The importer does all of that the same way every time. If a file has a lot of junk (talking, a phone ringing) around the part you want, write the part you want as `trim: 0:03.2-0:04.1` in `source.txt` rather than editing the file.
5. **Stereo or mono, either is fine.** The importer folds one-shots to mono (the game pans them itself) and keeps ambience beds and weather beds in stereo.
6. **Long files are fine.** A 10 minute rain recording is fine for `rain_bed`: the importer picks the cleanest 30 to 90 s and bakes the loop. For one-shots, anything past the length in part 2 gets faded out, and the report warns.
7. **More takes than asked is fine.** The importer keeps the first 12 per folder (after splitting) and warns about the rest.
8. **No ZIPs.** Unzip into the folder. The importer refuses a folder that holds only a ZIP, so you notice.

### 3.2 `source.txt`

Every folder needs one. Plain text. One block per source file, blocks separated by a blank line. The importer reads these lines and ignores anything else:

```
file: small-splash-01.wav
url: https://freesound.org/people/someone/sounds/123456/
license: cc0
author: someone
title: Small splash in a bucket

file: impactWood_*
url: https://kenney.nl/assets/impact-sounds
license: cc0
author: Kenney
```

| Line | Required | What to write |
|---|---|---|
| `file:` | Yes, unless one block covers every file in the folder | The file name. `*` matches anything, so `impactWood_*` covers a whole set. |
| `url:` | Yes | The page you downloaded it from (the sound's own page, not a search). For a bundle, the bundle's page and the path inside it. |
| `license:` | Yes | One word from the list in 5.1: `cc0`, `cc-by-4.0`, `cc-by-3.0`, `oga-by`, `sonniss-gdc`, `pixabay`, `zapsplat`, `suno`, `own`. |
| `author:` | Yes | The uploader's name or username exactly as shown. For your own recordings, your name. |
| `title:` | For `cc-by-*` and `oga-by` | The sound's title as shown on its page. Needed for the credits. |
| `trim:` | No | Keep only this part, `m:ss.s-m:ss.s`. |
| `split:` | No | `no` keeps the file as one take. |
| `downloaded:` | No | The date, e.g. `2026-10-04`. Good for audits. |

A file with no block, or a license not on the list, stops the import of that folder with a clear message. The folder keeps using the synth until it's fixed.

### 3.3 Step by step, per sound

1. Find the row in part 2. Open the suggested source with its search terms.
2. On Freesound, after searching, click **Creative Commons 0** under the license filter on the right. Only use CC0 or Attribution (`cc-by`). Never Attribution NonCommercial.
3. Listen on headphones. Reject anything with voices, music, traffic, long room echo, or clipping (crackly distortion at the loudest point).
4. Download the original-quality file (on Freesound, the download button, not the preview).
5. Move it into `assets/sfx/<folder>/`. Add its block to `source.txt` straight away, while the page is open. Copy the URL from the address bar.
6. Repeat until you have the number of takes in part 2. Mixing sources in one folder is fine.
7. Run `pnpm sfx:import <folder>` (once M12 lands) and listen in game. Or just commit the folder and an engineer runs it.

### 3.4 What goes in git

- **Committed:** every `source.txt`, and the built files in `src/renderer/public/sfx/`.
- **Not committed:** the raw downloads (`assets/sfx/**/*.wav`, `*.flac`, `*.mp3`, `*.ogg`, `*.zip`). Keep a backup of `assets/sfx/` next to the music backup. Raw files from bundles can't go in a public repo at all (5.3).

---

## 4. Optional: her own bug voices

This is optional and meant to be fun. The bugs already talk in synthesized gibberish, and that stays the default. If the artist wants to, she can record her own gibberish, and the game turns it into each bug's voice. Every bug would then be drawn and voiced by the same 17-year-old, which is a strong store-page and devlog story (see `07-steam-market-research.md` 6.4) and keeps the game fully human-made.

### 4.1 What to record

One file per mood. In each file, say about 8 to 10 short bursts of made-up bug talk in that mood, with a full second of quiet between them. Change them up: short and long, one "word" or three. No real words, no names, no language that can be recognized. Think Animal Crossing or Toca Boca: sounds, not speech.

| File name | Mood (game emotion) | Prompt to get into it |
|---|---|---|
| `happy.wav` | `happy` | You just found a crumb the size of your head. |
| `question.wav` | `question` (curious) | "Hm? What's that?" in bug. Rising at the end. |
| `ooh.wav` | `ooh` | Something shiny. Impressed. |
| `whee.wav` | `whee` | Being flung across the yard and loving it. |
| `giggle.wav` | `giggle` (laugh) | Being tickled. Little giggles, then a big laugh. |
| `love.wav` | `love` | Your best friend just walked in. |
| `yum.wav` | `yum` | The tastiest berry. |
| `yuck.wav` | `yuck` | Someone fed you a sock. |
| `grumpy.wav` | `grumpy` | Woken up for no reason. |
| `scared.wav` | `scared` | A shadow went over you. Small and quick. |
| `gasp.wav` | `gasp` | Surprise! Sharp intakes. |
| `dizzy.wav` | `dizzy` | Just spun twenty times. Wobbly and slurred. |
| `sleepy.wav` | `sleepy` | Yawns and mumbles. |
| `meh.wav` | `meh` | Not impressed. Sighs and shrugs. |
| `burp.wav` | Burps | As many as you can, small to proud. Fake ones are fine. |
| `sneeze.wav` | Sneezes | Cartoon sneezes: "ah-ah-ah-choo". |
| `snore.wav` | Snores | Little snores and whistly breaths. |
| `extras.wav` | Anything else | Spits ("ptoo"), sniffs, "hnngh" effort, raspberries, hiccups. |
| `babble.wav` | Plain babble | 30 to 60 seconds of nonstop gibberish in a neutral, chatty voice. The game cuts it into syllables. |

**Takes:** two passes of the whole list, on different days if possible, so the voice has more range. Throw away nothing: the importer picks.

### 4.2 Setup

It doesn't need gear. A phone works.

1. **Pick the room.** A small room with soft things: a walk-in closet full of clothes is ideal. A bedroom with the bed and curtains is fine. Avoid bathrooms, kitchens, and empty rooms (they echo). Turn off fans, the fridge if it's close, and notifications. Put the phone in airplane mode.
2. **Phone.** iPhone: Voice Memos, with **Settings > Apps > Voice Memos > Audio Quality** set to **Lossless**, and **Enhance Recording** off. Android: a recorder app that saves WAV, at 48 kHz if it offers it. Hold the phone 15 to 20 cm from the mouth (a hand-span), slightly to the side so breaths and "p" sounds don't hit it straight on. Keep it in the same spot the whole session; a stand or a pile of books helps.
3. **USB mic (if there is one).** 48 kHz, 24-bit (or 16-bit), WAV, mono. 15 to 20 cm away, with a pop filter or a sock over the mic. Set the gain so the loudest giggle peaks around -6 dB on the meter (the bar never hits red). Audacity is free and records straight to WAV.
4. **Headphones** for listening back, not speakers.
5. **Before the real takes,** record ten seconds of silence in the room and play it back loud. If you hear hum or hiss, move or turn something off.
6. **Performing.** Bigger is better: these get pitched way up and down, and small performances turn to mush. Smile while you do the happy ones; it really does change the sound. Water nearby; take breaks. 30 to 45 minutes is plenty.
7. **Saving.** One file per mood, named as in 4.1. Put them in `assets/voices/her/` (or send them to the owner). Add one `source.txt` with `license: own` and `author: <her name>`.

### 4.3 How her voice becomes twelve bugs

The game doesn't play her clips as they are. The importer (part 6) splits each mood file into bursts and the babble file into syllables, measures each one's pitch, and writes them to a voice bank. At runtime, a bug's line is built the way it is now (an emotion, a mood, the bug's `VoiceProfile`), but each syllable plays one of her clips instead of an oscillator:

| What the bug has | What happens to her clip |
|---|---|
| Pitch range (`low`, `high`) | The clip is sped up or slowed down so its pitch lands in the bug's range. Tiny bugs (Flick, Dot) come out squeaky; big ones (Moose, Barty) slow and low. Capped at one octave either way so it stays charming, not garbled. |
| `formantShift` | A formant filter (two peaking filters) shifts the vowel color, so a big bug sounds big, not just slow. |
| `wave` | A texture per bug: `sine` stays clean, `triangle` soft, `square` gets a little grit (a gentle waveshaper), `sawtooth` gets a buzzy band-pass. |
| Vibrato and accent | Vibrato wobbles the playback rate. `huff` adds a breath, `click` a clicky consonant from the synth, `tremble` a tremolo. |
| Mood and potions | `moodVoice` and `potionVoice` already give pitch and tempo factors. They multiply the playback rate and pick the take: sleepy picks from `sleepy.wav` and slows; a `tiny` potion turns it into a helium squeak. |

Emotions she didn't record fall back to the synth voice for that emotion. A settings toggle (Voices: Drawn-in-code / Recorded) lets players pick, and a mix of both is possible: the synth chirp underneath at low gain keeps each bug's identity.

**Her rights.** Like her art, her recordings stay hers, licensed to the game. Write it down in the same simple agreement that covers her art (`07-steam-market-research.md` 8.2), signed by a parent too while she's under 18. Note in it that the recordings may not be used to train AI or clone her voice.

---

## 5. Licensing

### 5.1 Sources and their terms

Checked 2026-10-02. "Repo-safe" means the built file may sit in a public GitHub repo. The repo `namick/bugglebrook` is public today.

| Source | `license:` word | Commercial game use | Attribution | Repo-safe | Notes |
|---|---|---|---|---|---|
| Freesound, CC0 | `cc0` | Yes | Not required (we credit anyway) | Yes | The best source. Use the license filter. |
| Freesound, Attribution (CC BY 4.0 or 3.0) | `cc-by-4.0`, `cc-by-3.0` | Yes | Required: title, author, link, license | Yes, with the credit | Freesound moved to 4.0 licenses; older uploads are still 3.0. |
| Freesound, Attribution NonCommercial | none | **No** | | | Rejected by the importer. |
| Kenney audio packs | `cc0` | Yes | Not required | Yes | Impact Sounds (130 files), RPG Audio (50), Interface Sounds, UI Audio, Casino Audio, Digital Audio, Sci-fi Sounds. All CC0. |
| OpenGameArt | `cc0`, `cc-by-*`, `oga-by` | Yes | For BY and OGA-BY | Yes | Only use CC0, CC-BY, or OGA-BY. Skip CC-BY-SA and GPL (share-alike and code-license tangles). Check the uploader made it. |
| Sonniss #GameAudioGDC bundles | `sonniss-gdc` | Yes | Not required | **No** | License v2.0 (Aug 27, 2026): royalty-free, no attribution, but you may not "supply the sound effects as sound effects to any other person". Inside a shipped game is fine; individual files in a public repo are not. |
| Pixabay sound effects | `pixabay` | Yes | Not required | **No** | No standalone redistribution. Some uploads are AI-generated and labeled as such: skip those (5.4). |
| Zapsplat | `zapsplat` | Yes | Free accounts must credit "zapsplat.com"; Gold (about £40 a year) removes it for sounds downloaded while subscribed | **No** | Their pages blocked automated checks, so the terms come from Zapsplat's own FAQ in search results. Read the license yourself before using it. |
| Suno Sounds (paid plan) | `suno` | Yes, if downloaded while on Pro or Premier | Not required | Yes | AI-generated: triggers Steam's AI disclosure (5.4). |
| Her own recordings, or yours | `own` | Yes | Credit as you like | Yes | Covered by the written agreement (4.3). |
| BBC Sound Effects (RemArc) | none | **No** | | | Personal, educational, and research use only. Commercial use means buying each sound through Pro Sound Effects (about $5 each). Rejected by the importer. |
| Sounds ripped from other games, YouTube, TV, or "free SFX" compilations | none | **No** | | | Never. |

### 5.2 Credits

- The importer writes `src/renderer/public/sfx/credits.json`: every `cc-by-*`, `oga-by`, and `zapsplat` file with title, author, URL, and license, grouped by license, plus a thank-you line for the CC0 sources (Kenney and the Freesound authors).
- The credits board on the menu reads `art/CREDITS.json`, which holds one name per role (`art`, `music`, `code`) at up to 40 characters. Add a `sound` role ("Sound: Nathan Amick, with sounds from Freesound and Kenney") and, if she records, `voices`. The full attribution list doesn't fit on that board: give the board a second page that scrolls `credits.json`, and ship the same list as `THIRD-PARTY-SOUNDS.txt` next to the app and on the Steam page's "about" section. Freesound's own guidance accepts a credits screen or a linked list.
- CC BY needs the credit somewhere a player can find it. The in-game page is the safe choice.

### 5.3 The public-repo problem

Sonniss, Pixabay, and Zapsplat let you ship sounds inside a game but not hand them out as sound files. A public repo with `src/renderer/public/sfx/splash/1.ogg` is handing them out. So, while the repo is public:

- Use only repo-safe sources (CC0, CC-BY, OGA-BY, Suno, `own`). The importer enforces it: it refuses `sonniss-gdc`, `pixabay`, and `zapsplat` while `assets/sfx/config.json` has `"publicRepo": true`.
- If the repo goes private (the market research leans that way, 8.4), set `publicRepo` to `false` and the bundles open up.

CC0 plus Kenney covers nearly every row in part 2, so this costs little.

### 5.4 AI disclosure

- Steam's content survey (rewritten January 2026) asks about AI-generated content that ships in the game and that players consume. Sound effects made with an audio generator are in scope. Suno SFX would need disclosing; CC0 recordings, Kenney, and her voice don't.
- The music already needs a disclosure while it's from Suno. But `07-steam-market-research.md` 1.7 notes that the cozy, art-focused players this game needs are the most hostile to generative AI, and suggests replacing the music. Suno SFX would keep the disclosure alive after that. **So use Suno SFX only as a last resort**, mark them `license: suno`, and keep them few. The importer lists every `suno` file in its report under "AI content", so swapping them later is one search.
- Pixabay and Freesound host some AI-generated sounds. Pixabay labels them; Freesound may not. Skip anything whose page says AI-generated or names a generator (ElevenLabs, Suno, Stable Audio, AudioGen).
- Synthesized sounds and voices are code, not generative AI, so they need no disclosure (unchanged from the market research).

---

## 6. Engineering spec (M12)

### 6.1 Overview

```
assets/sfx/<folder>/          scripts/sfx/import.ts               src/renderer/public/sfx/
  takes + source.txt   --->   check licenses, split, trim,  --->    <folder>/0.ogg, 1.ogg, ...
assets/voices/her/            mono, normalize, loop beds,           manifest.json
                              encode Ogg Opus                       credits.json
                                                                    voices/<emotion>/...
```

Reuse `scripts/music/ffmpeg.ts` (decode to float, `ebur128` loudness, libopus encode) and the loop baking from `scripts/music/analysis.ts`. Same tool needs as the music importer: ffmpeg with libopus on the PATH, or `FFMPEG` set.

### 6.2 The catalog

`scripts/sfx/catalog.ts` (shared with the renderer as `audio/sfxCatalog.ts`, pure) lists every folder in part 2: its category (6.3), `kind` (`oneshot` or `bed`), max length, take count wanted, and whether it pans. It also holds the alias table (2.10). A unit test checks that every catalog folder and alias is an `SfxName` (or a bed), so a rename in `sfx.ts` can't silently orphan a folder.

### 6.3 Importer: `pnpm sfx:import [folder...]`

With no arguments it imports every folder whose inputs changed (hash of the files and `source.txt`, stored in the manifest). Per folder:

1. **Check the name** against the catalog. Unknown: error, with the nearest name.
2. **Parse `source.txt`.** Every audio file must match a block. `license` must be on the allowlist (5.1), and repo-safe if `publicRepo` is true. `cc-by-*` and `oga-by` need `title`, `author`, `url`. Fail the folder (not the run) on any problem.
3. **Decode** to 48 kHz float. Apply `trim:`.
4. **Split** at silences of 300 ms or more below -45 dB relative to the file's peak, unless `split: no`. Drop pieces under 40 ms.
5. **Clean.** Remove DC, high-pass at 40 Hz (25 Hz for beds).
6. **Trim silence.** Start: 5 ms before the first sample above -50 dB relative to peak. End: where the 10 ms RMS stays below -60 dB relative to peak, then a 20 ms fade. One-shots longer than the catalog's max get a 50 ms fade at the max and a warning.
7. **Channels.** One-shots: fold to mono. If the mono sum is more than 3 dB quieter than the louder channel (phase cancellation), use the louder channel instead. Beds: keep stereo; a mono bed stays mono.
8. **Loudness.** One-shots are too short for integrated loudness, so normalize each take's **maximum momentary loudness** (400 ms window) to its category target. Beds use integrated loudness. True peak at most -1.5 dBTP after encoding headroom; if a take can't reach its target without passing that, it stays quieter and the report warns.

   | Category | Folders | Target |
   |---|---|---|
   | `impact` | `impact_*`, `shatter` | -16 LUFS max momentary |
   | `water` | `splash`, `plop`, `pour`, `shake_dry`, `drip` | -17 |
   | `gross` | `squelch`, `pop`, `blob_squeak`, `burp` | -17 |
   | `eat` | `nom`, `chomp`, `slurp` | -18 |
   | `machine` | the 2.5 rows | -17 |
   | `paper` | `shutter`, `page_turn` | -20 |
   | `spot` | the 2.8 rows | -24 |
   | `weather` | `rain_bed`, `board_patter`, `wind_bed` | -26 LUFS integrated |
   | `bed` | `amb_*` | -32 LUFS integrated (day), -34 (night) |
   | `voice` | her clips | -18 max momentary |

   The music sits at -18 LUFS integrated. These starting points put a hit a bit above the music, spots and beds well under it. Expect to tune them by ear once; they live in the catalog.

9. **Beds.** Pick the 30 to 90 s stretch with the steadiest loudness (lowest short-term loudness variance, no transient above +8 LU over the median) and bake a 2 s equal-power crossfade loop, as in music brief 7.8. Warn if the seam differs by more than 1.5 LU.
10. **Keep at most 12 takes**, preferring the ones closest to the median length.
11. **Encode** Ogg Opus, 48 kHz: one-shots mono 48 kb/s (64 for `impact_glass` and `shatter`, whose highs smear at 48), beds stereo 64 kb/s, voice clips mono 40 kb/s. Write `src/renderer/public/sfx/<folder>/<n>.ogg`.
12. **Voices** (`pnpm sfx:import --voices`): split each mood file into bursts and `babble.wav` into syllables (onset detection, 80 to 400 ms pieces), measure median pitch per clip (YIN), and store it in the manifest.
13. **Write** `manifest.json`, `credits.json`, and `assets/sfx/import-report.txt` (per folder: takes kept, lengths, loudness, warnings, licenses; a final "AI content" list and a "still synthesized" list of every `SfxName` with no folder or alias).

Manifest shape:

```json
{
  "version": 1,
  "sounds": {
    "splash": {
      "kind": "oneshot",
      "category": "water",
      "takes": [{ "file": "splash/0.ogg", "dur": 0.62 }, { "file": "splash/1.ogg", "dur": 0.48 }],
      "hash": "…"
    },
    "amb_plaza_day": { "kind": "bed", "category": "bed", "takes": [{ "file": "amb_plaza_day/0.ogg", "dur": 64.0 }] }
  },
  "voices": { "happy": [{ "file": "voices/happy/0.ogg", "dur": 0.71, "pitchHz": 312 }] }
}
```

### 6.4 Runtime modules

Same pattern as the music: pure logic for Vitest, a thin WebAudio layer.

| Module | Job |
|---|---|
| `audio/sfxCatalog.ts` (pure) | Folders, categories, aliases, voice limits, pitch and gain ranges. |
| `audio/sfxManifest.ts` (pure) | Load and validate the manifest. `resolve(name)` returns a folder plus alias tweaks, or `null` for synth. |
| `audio/samplePick.ts` (pure) | Shuffle bag per folder (no take twice in a row, all takes before a repeat). Pitch: uniform ±1.5 semitones (±0.5 for `page_turn`, `shutter`, `whistle_toot`; none for beds). Gain: ±1.5 dB. Intensity 0 to 1 maps to gain (-18 dB to 0) and a low-pass (1.5 kHz to open). Pan from screen x (6.5). Takes an injected `random` like `Sfx` does. |
| `audio/sampleVoices.ts` (pure) | Voice limits: per folder (3 by default; 4 for `impact_*`; 1 for spots, `trash_rummage`, `whistle_toot`) and 24 sample voices in total, separate from the synth's 32. Over a limit, steal the oldest voice of that folder with a 15 ms fade. |
| `audio/samplePlayer.ts` | WebAudio: fetch and `decodeAudioData`, an `AudioBufferSourceNode` per play, through gain, low-pass, and `StereoPannerNode`, into `bus_sfx`. |
| `audio/ambience.ts` (pure) | From the camera's area and position, sky phase, weather mix, and pause state, compute the target gain of every bed (6.6). |
| `audio/ambiencePlayer.ts` | Keeps the needed beds looping (`loop = true`) on a new `bus_ambience`, which feeds `bus_sfx` so the SFX slider covers it. Ramps gains. |

`Sfx.play` gains an optional `at: { x, y }` in world meters. `attach` passes it for every event that has a position (most do). `Sfx.play` asks `sfxManifest.resolve`; on a hit with the buffer decoded it calls `samplePlayer`, else the existing synth path, unchanged. `limited` and the bonk throttle stay in front of both. The `AudioBackend` interface gets `playSample(req)` and `setBed(id, gain, rampSec)`; `NullAudioBackend` records both.

### 6.5 Pan, ducking, loading

- **Pan.** `pan = clamp((screenX / screenWidth) * 2 - 1, -1, 1) * 0.6`. Off-screen sounds (beyond 1.2 screen widths) are skipped, as they are now for most events; between 1 and 1.2 widths they play at -9 dB, panned fully. No pan for UI, beds, or sounds with no position.
- **Ducking.** `bus_ambience` dips 4 dB under any bug voice line and 8 dB under `secret`, `unlock`, and the unlock stinger (the music already ducks for the stinger, music brief 7.12). Attack 50 ms, release 600 ms. The pause board takes `bus_ambience` down 10 dB with the same 900 Hz low-pass as the music.
- **Loading.** At slot open, fetch and decode every one-shot (about 21 MB decoded, 6.7). Until a buffer is ready that sound uses the synth. Beds decode on demand: the current area's beds for both phases, plus the neighbor the camera is moving toward. At most four beds decoded; evict the least recently heard.
- **Failure.** A missing manifest, a failed fetch, or a failed decode falls back to the synth for that sound, with one console warning per folder. Never an error.

### 6.6 Ambience rules

| Condition | What happens |
|---|---|
| Base | The camera's area bed for the current phase at gain 1. Within 4 m of a border, equal-power crossfade into the neighbor's bed by distance. |
| Dusk 18:00 to 20:00, dawn 05:00 to 07:00 | Crossfade day and night beds by clock time across the two hours (smooth, not at a bar like the music). |
| Sundial skip (`time_skipped`) | 3 s crossfade to the new phase. |
| Rain | `rain_bed` at `rain` x 1 outdoors, area beds x (1 - 0.6 x rain). Under the porch: `board_patter` instead of `rain_bed`, area bed x 0.8. Hidden areas: rain beds off. |
| Wind | `wind_bed` at `wind` x 0.8. Treehouse x 1.2 (high up). Porch x 0.3. |
| Locked area at the camera (the preview) | Area bed x 0.35, matching the spot sounds today. |
| Pause | 6.5 ducking. |
| Test mode (`NullAudioBackend`) | Nothing decodes; `ambience.ts` still runs and reports. |

The existing `WorldView.ambience` spots and `WeatherView.sounds` crickets stay, playing through `Sfx` so they pick up samples. `WeatherView`'s synth `rain` and `wind` ticks stop when the matching bed is loaded, and continue as the fallback when it isn't.

### 6.7 Size budget

| What | Estimate |
|---|---|
| One-shots: 36 folders x 5 takes x 0.6 s average, mono Opus 48 kb/s (6 KB/s) | about 0.7 MB |
| Area beds: 14 x 60 s, stereo 64 kb/s (8 KB/s) | about 6.7 MB |
| Weather beds: 3 x 60 s | about 1.4 MB |
| Her voice bank: 19 files, about 250 clips x 0.5 s at 40 kb/s | about 0.6 MB |
| **Total** | **about 9.5 MB. Hard cap 15 MB** (a test enforces it) |
| Memory: one-shots decoded (48 kHz float mono, 192 KB/s, about 110 s) | about 21 MB |
| Memory: up to 4 beds decoded (stereo, 384 KB/s, 60 s each) | about 92 MB worst case; keep beds at 60 s or under |

No Git LFS: the built files are small. The raw downloads stay out of git (3.4).

### 6.8 Tests

- **Unit (Vitest).** `source.txt` parsing (blocks, globs, missing fields, unknown license, NonCommercial, RemArc, the public-repo rule). Catalog: every folder and alias maps to a real `SfxName`, and every `SfxName` is a folder, an alias, or on the synth-only list (1.3), so a new sound has to choose. Manifest schema, and the committed manifest validates. Shuffle bag: no back-to-back repeat over 10,000 picks, every take used. Pitch and gain stay in range. Voice limits steal the oldest. Pan math at the screen edges. `ambience.ts`: every row of 6.6, border crossfades sum to equal power, dusk midpoint is 50/50. Fallback: `Sfx.play` with no manifest entry hits the synth; with one, `playSample`. Importer analysis on synthetic signals: silence trim, splitting three tone bursts into three takes, mono fold with an inverted channel, loudness within 0.5 LU of target, a bed's seam error under 1.5 LU. Size: `src/renderer/public/sfx/` under 15 MB.
- **E2E (real mouse, assertions through `window.__bb`).** Add `__bb.sfxSamples()` (recent plays: name, folder, take, rate, gain, pan, and `sample` or `synth`) and `__bb.ambience()` (each bed's target gain). Tests use a small fixture manifest built from generated tones, so they don't depend on the owner's files. Drop a pebble in the pond on the left of the screen: `splash` or `plop` plays from a sample with a negative pan. Drop a block twice: two different takes. Remove the fixture's `splash` entry: it plays from the synth. Pan from the plaza to the pond: the beds cross. `set_time` to 19:00: day and night beds near 50/50. `set_weather` rain: `rain_bed` rises; under the porch, `board_patter` instead.

### 6.9 Order of work

1. Catalog, manifest, `samplePick`, `sampleVoices`, the fallback in `Sfx`, and the fixture manifest, with tests. Ship with zero samples: nothing changes.
2. The importer, run on the first priority 1 folders.
3. Pan and position plumbing for events.
4. Beds and `ambience.ts`, then weather beds replacing the tick rain.
5. Credits page and `THIRD-PARTY-SOUNDS.txt`.
6. Her voice bank, if she records.

---

## 7. What we're unsure about

| Question | What we know | What the brief does |
|---|---|---|
| Whether a Suno Sounds download counts against the monthly song download cap (20 on Pro, 60 on Premier) | Suno's help page for Sounds doesn't say. The terms treat all output the same and need a permitted download for commercial use. | Download Suno sounds through Suno's download button while subscribed, and keep the receipt, as for the music. Use few. |
| Suno Sounds' plans, credit cost, and length limits | The help page calls it experimental and gives none of these. | Nothing depends on them. |
| Zapsplat's exact current wording | Their site blocked automated reads. Search results quoting Zapsplat's FAQ say games are allowed with a "zapsplat.com" credit on free accounts. | Not repo-safe anyway; read the license yourself before using it. |
| Whether a public repo of built Opus files counts as redistributing CC0/CC-BY sounds | It does, and those licenses allow it. | Only repo-safe licenses while public (5.3). |
| Whether Freesound labels AI-generated uploads | No confirmed policy found. | Skip anything whose page mentions a generator (5.4). |
| Whether Valve added per-asset AI tags in June 2026 | Reported by one trade site, unconfirmed (market research 1.7). | Read the survey when filling it in. Keep Suno SFX out if possible. |
| Loudness targets | Starting points from common practice; this game's mix hasn't been heard with samples yet. | Targets live in the catalog; tune once by ear in M12. |

## Sources

- Freesound FAQ (licenses, attribution wording, the license filter): https://freesound.org/help/faq/
- Freesound forum, moving to CC 4.0 licenses: https://freesound.org/forum/legal-help-and-attribution-questions/43637/?page=1
- Freesound forum, credits screen with a linked list: https://freesound.org/forum/legal-help-and-attribution-questions/41813/
- Freesound blog, 2024 in numbers (Attribution passed CC0): https://blog.freesound.org/?p=2141
- Kenney audio packs: https://kenney.nl/assets/category:Audio
- Kenney Impact Sounds (130 files, CC0): https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio (50 files, CC0): https://kenney.nl/assets/rpg-audio
- Sonniss GDC bundle license, v2.0, Aug 27, 2026: https://sonniss.com/gdc-bundle-license/
- Sonniss GDC 2026 bundle: https://gdc.sonniss.com/
- Bedroom Producers Blog on the GDC 2026 bundle: https://bedroomproducersblog.com/2026/03/16/sonniss-gdc-2026-bundle/
- OpenGameArt FAQ (accepted licenses): https://opengameart.org/content/faq
- Cinevva, game asset licenses explained (OpenGameArt license set, GPL caveat): https://app.cinevva.com/guides/game-asset-licenses
- Pixabay Content License summary: https://pixabay.com/service/license-summary/
- Pixabay Terms of Service (audio, AI-generated labeling): https://pixabay.com/service/terms/
- Zapsplat Standard License: https://www.zapsplat.com/license-type/standard-license/
- Zapsplat, can I use your sound effects: https://www.zapsplat.com/can-i-use-your-sound-effects-in-my-project/
- LicenseOrg, Zapsplat license guide: https://www.licenseorg.com/guide/music-audio/zapsplat
- BBC Sound Effects (RemArc licence): https://sound-effects.bbcrewind.co.uk/licensing
- MusicTech on the BBC archive and its non-commercial license: https://musictech.com/news/music/the-bbc-sound-effects-archive-over-33000-free-samples/
- Pro Sound Effects, licensing BBC sounds commercially: https://blog.prosoundeffects.com/how-to-license-bbc-sound-effects-to-use-in-your-commercial-productions
- Suno Sounds help article: https://help.suno.com/en/articles/10625537
- Suno Sounds guide (Create, Custom, Sounds, One Shot or Loop): https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-sounds-ai-sound-effects-guide
- Suno Terms of Service, effective Sept 3, 2026: https://suno.com/terms
- Suno's announcement of the 2026 terms and download limits: https://suno.com/blog/suno-updates-tos
- VGC on Steam's January 2026 AI disclosure rewrite: https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use/
- TechPowerUp on the disclosure clarification: https://www.techpowerup.com/345302/steam-ai-disclosure-gets-clarification-for-ai-in-dev-tools
- StraySpark, Steam AI disclosure examples (sound effects are in scope): https://www.strayspark.studio/blog/steam-ai-disclosure-examples-indie-developers-2026
- Voices.com, home studio setups for beginner voice actors: https://www.voices.com/blog/home-studio-setups-for-beginner-voice-actors
- Sonarworks, mic placement and room tips: https://www.sonarworks.com/blog/learn/recording-vocals-at-home-microphone-room-tips
- Audiokinetic, mastering a game with Wwise (loudness targets): https://www.audiokinetic.com/en/blog/mastering-a-game-with-wwise-part1/
- Loudness and metering in game audio: https://ansoaudio.com/2016/07/27/loudness-and-metering-in-game-audio/
