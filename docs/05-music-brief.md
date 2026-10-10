# Bugglebrook music brief

This is two documents in one. Parts 1 to 6 are for the owner, who makes the background music in Suno. Part 7 is the spec engineers build M9 against. Part 8 covers licensing.

The decision behind it is the Audio row in `00-decisions.md`: background music comes from Suno tracks with stems, it is layered and adaptive, and everything else (sound effects, bug voices, music toys) stays synthesized. Where this brief disagrees with sections 10 and 16 of `03-game-design.md` about music, this brief wins, because those sections were written when the music was going to be procedural.

Suno facts below were checked on 2026-10-01. Suno changes often. Where a detail could not be confirmed, the brief says so and gives an instruction that works either way.

---

## 1. How the music works in the game

**One track per area, with a day and a night version.** The track that plays is the one for the area at the center of the camera. Hidden areas (Ant Hill Depths, Gnome Hollow) have one track each. The main menu has its own track.

**Crossfades.**

| When | What happens |
|---|---|
| The camera crosses an area border | Equal-power crossfade over 2 bars. Both tracks share a tempo family, so the incoming track starts on the same beat of the bar. A small dead zone stops it flapping when the camera sits on the border. |
| Dusk (18:00 to 20:00) | The day track thins out during the first game hour (drums fade, lead drops). At 19:00 it crossfades to the night track over about 12 seconds. The night track starts sparse and fills in. |
| Dawn (05:00 to 07:00) | The same in reverse, crossing at 06:00. |
| The sundial skips time | A 4 second crossfade straight to the right track. |
| Entering a hidden area | The crossfade runs under the 600 ms iris wipe and finishes about a second later. |

**Layers from stems.** Each track is split into four game layers, built from Suno's stems:

| Game layer | What it holds |
|---|---|
| `drums` | Drum kit and percussion |
| `bass` | Bass line |
| `harmony` | Chords, pads, keys, rhythm guitar, strings, effects |
| `lead` | The melody: whatever carries the tune |

The game turns each layer up and down on bar lines. The rules are in section 7.8. In short:

- A music toy dips the melody. When the player pokes an instrument or the mushroom sequencer runs, the `lead` layer drops to about a quarter so the player's notes are the tune. It comes back two bars after they stop.
- Night and idle time are sparse. Night tracks are quiet to begin with, and after a minute or two with no input the lead and drums ease back.
- Lots of bug activity brings every layer up to full.
- Rain drops the drums and puts a soft low-pass on the music, except in sheltered places (the porch, the ant hill, the gnome).

**Music toys follow the track.** The import script detects each track's tempo and key and writes them to a manifest. The music clock reads them, so player and bug notes quantize to the track's real beat and pick from its pentatonic scale. That is why the keys in the track list matter, and why the owner doesn't need Suno to hit them exactly: the game uses whatever Suno actually made.

**Keys chosen for smooth crossfades.** Neighbors on the strip are one step apart on the circle of fifths or share the same notes, and every night track is the relative minor of its day track, so day and night use the same five pentatonic notes. A crossfade never sounds like two songs fighting.

```
 Flowerbed     Pond        Plaza       Porch       Compost     Treehouse
 D  / Bm   -   G  / Em  -  C  / Am  -  Am / Am  -  Em / Em  -  D  / Bm
 |                            |
 Gnome Hollow: G          Ant Hill Depths: Dm
```

This changes five keys from section 10 of the design doc (flowerbed, pond, treehouse, ant hill, gnome hollow), which put pond D next to plaza C and treehouse F next to compost E minor.

**Tempo.** Day tracks target 96 BPM and night tracks 72, as in the design doc. Suno treats BPM as a suggestion, so the importer measures the real tempo and nudges it onto the target when it is close (section 7.5).

---

## 2. Track list

Sixteen cues: twelve area tracks (six areas, day and night), two hidden-area tracks, the main menu, and one optional unlock fanfare.

I left out a separate rain version. Rain is handled by the mix (drums out, low-pass on), and a rain track per area would double the work for something players hear about 18 percent of the time. Dawn and dusk have no tracks of their own for the same reason: they are crossfades. The discovery chime stays synthesized so it can always match the current key.

### 2.1 Overview

| # | Folder (track ID) | Plays in | Key | BPM | Length to ask for | Mood |
|---|---|---|---|---|---|---|
| 1 | `main_menu` | Menu and settings over the menu | C major | 96 | 2:00 to 2:30 | The Bugglebrook theme. Catchy, cheeky, a little odd |
| 2 | `stump_plaza_day` | `area_stump_plaza`, day | C major | 96 | 2:30 to 3:00 | Sunny hub, bouncy, the home groove |
| 3 | `stump_plaza_night` | `area_stump_plaza`, night | A minor | 72 | 2:30 to 3:00 | Glowing mushrooms, mellow, a bit mysterious |
| 4 | `puddle_pond_day` | `area_puddle_pond`, day | G major | 96 | 2:30 to 3:00 | Floaty, splashy, carefree |
| 5 | `puddle_pond_night` | `area_puddle_pond`, night | E minor | 72 | 2:30 to 3:00 | Moonlit water, calm, slightly eerie |
| 6 | `flowerbed_stage_day` | `area_flowerbed_stage`, day | D major | 96 | 2:30 to 3:00 | Showy garden-party band, the music area |
| 7 | `flowerbed_stage_night` | `area_flowerbed_stage`, night | B minor | 72 | 2:30 to 3:00 | Late-night lounge under stage lights |
| 8 | `under_porch_day` | `area_under_porch`, day | A minor | 96 | 2:30 to 3:00 | Dusty, sneaky tinkering. The banjo area |
| 9 | `under_porch_night` | `area_under_porch`, night | A minor | 72 | 2:30 to 3:00 | Creepy-cute crawlspace, cozy-spooky |
| 10 | `compost_lab_day` | `area_compost_lab`, day | E minor | 96 | 2:30 to 3:00 | Bubbly mad science, gross and gleeful |
| 11 | `compost_lab_night` | `area_compost_lab`, night | E minor | 72 | 2:30 to 3:00 | Glowing jars, curious and spooky-cute |
| 12 | `treehouse_arcade_day` | `area_treehouse_arcade`, day | D major | 96 | 2:30 to 3:00 | Chiptune playground, playful and cool |
| 13 | `treehouse_arcade_night` | `area_treehouse_arcade`, night | B minor | 72 | 2:30 to 3:00 | Neon arcade at night, chill |
| 14 | `ant_hill_depths` | `area_ant_hill_depths`, always | D minor | 96 | 2:30 to 3:00 | Underground march, busy and determined |
| 15 | `gnome_hollow` | `area_gnome_hollow`, always | G major | 72 | 2:30 to 3:00 | Secret observatory, starry wonder |
| 16 | `stinger_unlock` | Over any area when a new area opens (optional) | C major | 96 | Shortest Suno allows; you crop it | A short "ta-da" |

The folder name is the track ID. For an area track it is the area ID without `area_`, plus `_day` or `_night`. Type it exactly, in lowercase, with underscores.

### 2.2 Instrumentation

| Track ID | Lead (the tune) | Harmony | Bass | Drums and percussion |
|---|---|---|---|---|
| `main_menu` | Toy piano and marimba hook, kazoo answers | Ukulele strums, glockenspiel | Bouncy tuba | Lo-fi kit, handclaps |
| `stump_plaza_day` | Marimba | Ukulele, toy piano sparkles | Round upright bass | Boom-bap kit, shaker, claps |
| `stump_plaza_night` | Muted marimba | Soft vibraphone chords, glockenspiel | Warm round bass | Brushed kit, vinyl crackle |
| `puddle_pond_day` | Steel drum and glassy vibraphone | Nylon guitar, wobbly Rhodes | Bubbly synth bass | Rimshot kit, water-drop percussion |
| `puddle_pond_night` | Theremin-like sine lead | Glassy Rhodes with chorus | Fretless bass | Brushed kit, drips, low clarinet pops |
| `flowerbed_stage_day` | Muted trumpet hooks, kazoo section | Pizzicato strings, glockenspiel | Tuba | Marching snare and tight kit, claps |
| `flowerbed_stage_night` | Smoky muted trumpet | Electric piano, celesta | Walking upright bass | Brushed jazz kit |
| `under_porch_day` | Banjo riff, tiptoeing bassoon | Washboard rhythm, plucked strings | Double bass | Dusty kit, tin cans, spoons, woodblock |
| `under_porch_night` | Low bassoon and bass clarinet | Muted banjo plucks, bottle tones | Soft upright bass | Brushed snare, soft kick |
| `compost_lab_day` | Bouncy bassoon and tuba | Detuned organ, toy piano stabs | Wobbly analog synth bass | Funky kit, squelches, fizzy shakers |
| `compost_lab_night` | Musical saw | Bubbling synth arpeggio | Low tuba | Soft trip-hop kit, jar clinks |
| `treehouse_arcade_day` | Square-wave lead, ukulele doubling | 8-bit arpeggios, xylophone runs | Bouncy synth bass | Live kit mixed with 8-bit noise hits |
| `treehouse_arcade_night` | Soft pulse-wave lead | Lush synth pads, sparkly arpeggios | Round sub bass | Gated snare, light kit |
| `ant_hill_depths` | Bassoon | Pizzicato strings march | Tuba | Snare rolls, woodblock ticks, low taiko |
| `gnome_hollow` | Celesta and glockenspiel | Harp arpeggios, warm analog pad | Gentle sub bass | Light brushes, shaker |
| `stinger_unlock` | Muted trumpet and kazoo flourish | Glockenspiel sparkle | Tuba hit | Snare roll, cymbal |

A few instruments repeat on purpose (marimba, tuba, kazoo, glockenspiel), so the game sounds like one place. Each area still owns one signature sound: banjo for the porch, musical saw for the lab at night, theremin for the pond at night, square waves for the treehouse.

### 2.3 Suno style prompts

Paste each one into the Style field as is. They put the important words first, in case Suno trims long prompts. None of them name an artist.

**Exclude styles (same for every track).** If Suno shows an Exclude field, paste this:

```
vocals, singing, choir, humming, oohs, spoken word, lyrics, fade out, tempo change, rubato, long intro, cinematic, orchestral swell, EDM drop, heavy distortion
```

**1. `main_menu`**

```
instrumental, catchy quirky title theme, 96 BPM, C major, steady tempo, bright toy piano and marimba hook, kazoo answering phrases, strummed ukulele, bouncy tuba bass, lo-fi drums with crunchy snare and handclaps, glockenspiel sparkles, cheeky and confident, weird backyard adventure, memorable melody, same groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**2. `stump_plaza_day`**

```
instrumental, playful indie-funk groove, 96 BPM, C major, steady tempo, bright marimba melody, plucky ukulele chords, round upright bass, lo-fi boom-bap drums with crunchy snare, shaker and handclaps, toy piano sparkles, short kazoo answers, sunny and cheeky, quirky but cool, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**3. `stump_plaza_night`**

```
instrumental, mellow lo-fi night groove, 72 BPM, A minor, steady tempo, muted marimba melody, soft vibraphone chords, warm round bass, brushed lo-fi drums, gentle vinyl crackle, faint glockenspiel twinkles, shaker like crickets, glowing mushrooms at night, cozy and a little mysterious, not sleepy, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**4. `puddle_pond_day`**

```
instrumental, floaty tropical pop groove, 96 BPM, G major, steady tempo, steel drum and glassy vibraphone melody, plucked nylon guitar, wobbly Rhodes chords with tremolo, bubbly synth bass, soft rimshot drums, water-drop percussion, splashy and carefree, sunny pond, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**5. `puddle_pond_night`**

```
instrumental, slow moonlit water groove, 72 BPM, E minor, steady tempo, theremin-like sine lead gliding between notes, glassy Rhodes chords with chorus, deep fretless bass, soft brushed drums, dripping water percussion, low clarinet pops like frogs, calm and slightly eerie, starry pond, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**6. `flowerbed_stage_day`**

```
instrumental, upbeat garden-party brass funk, 96 BPM, D major, steady tempo, punchy muted trumpet hooks, kazoo section answering the horns, tuba bass line, snappy marching snare with tight funk drums, pizzicato strings, glockenspiel, handclaps, showy stage energy, goofy and fun, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**7. `flowerbed_stage_night`**

```
instrumental, late-night lounge groove, 72 BPM, B minor, steady tempo, smoky muted trumpet melody, walking upright bass, brushed jazz drums, soft electric piano chords, celesta sparkles, moths around stage lights, cool and sly, a little weird, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**8. `under_porch_day`**

```
instrumental, sneaky junkyard bluegrass funk, 96 BPM, A minor, steady tempo, plucky banjo riff, tiptoeing bassoon melody, double bass, dusty lo-fi drums, tin can and spoon percussion, washboard, ticking woodblock, mischievous tinkering mood, dusty crawlspace, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**9. `under_porch_night`**

```
instrumental, slow creepy-cute crawlspace groove, 72 BPM, A minor, steady tempo, low bassoon and bass clarinet melody, muted banjo plucks, soft upright bass, brushed snare and soft kick, blown glass bottle tones, warm lamp-light shimmer, cozy and spooky, not scary, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**10. `compost_lab_day`**

```
instrumental, bubbly mad-scientist funk, 96 BPM, E minor, steady tempo, bouncy bassoon and tuba melody, wobbly analog synth bass, detuned organ chords, toy piano stabs, bubbling synth blips, squelchy percussion, fizzy shakers, tight funky drums, gross and gleeful, weird lab, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**11. `compost_lab_night`**

```
instrumental, slow glowing laboratory groove, 72 BPM, E minor, steady tempo, eerie musical saw melody, bubbling arpeggiated synth, low tuba bass, soft trip-hop drums, glass jar clinks, warm tape hiss, curious and spooky-cute, potions glowing in the dark, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**12. `treehouse_arcade_day`**

```
instrumental, chiptune indie-pop groove, 96 BPM, D major, steady tempo, square-wave lead melody doubled by plucked ukulele, arpeggiated 8-bit chords, xylophone runs, bouncy synth bass, punchy live drums mixed with 8-bit noise hits, arcade energy, playful and cool, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**13. `treehouse_arcade_night`**

```
instrumental, neon night chillwave, 72 BPM, B minor, steady tempo, soft pulse-wave lead, lush warm synth pads, sparkly arpeggios, round sub bass, gated reverb snare, light drum machine, glowing arcade at night, chill and cool, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**14. `ant_hill_depths`**

```
instrumental, underground marching groove, 96 BPM, D minor, steady tempo, bassoon melody, pizzicato string march, tuba bass, tight military snare rolls, clicking woodblock like tiny feet, low taiko hits, quirky and determined, busy ant colony, consistent groove throughout, loop-friendly, no intro, no fade-out, no vocals
```

**15. `gnome_hollow`**

```
instrumental, starry secret observatory theme, 72 BPM, G major, steady tempo, celesta and glockenspiel melody, soft harp arpeggios, warm analog pad, gentle sub bass, light brushed percussion and shaker, sense of wonder, slightly mysterious, not a lullaby, consistent groove, loop-friendly, no intro, no fade-out, no vocals
```

**16. `stinger_unlock` (optional)**

```
instrumental, short triumphant fanfare, C major, muted trumpet and kazoo flourish, glockenspiel sparkle, snare roll into a cymbal crash, tuba hit, ends on one bright held chord, goofy and proud, no vocals
```

---

## 3. Suno setup

### 3.1 Plan

| Plan | Price (Sept 2026) | Credits a month | Downloads a month | Stems |
|---|---|---|---|---|
| Free | $0 | | 7 lifetime, personal use only | No |
| Pro | $10 ($8 yearly) | 2,500 | 20 | Auto Split, Split from Mix |
| Premier | $30 ($24 yearly) | 10,000 | 60, unlimited when exporting from Suno Studio | Also Advanced Split, and Studio |

**Pro is enough.** Sixteen tracks need sixteen downloads, and every stem of a song counts as part of that song's single download. A rough credit budget: about 5 generations per track at 10 credits each (each generation gives 2 takes), plus 50 credits for Auto Split, is about 100 credits per track and 1,600 for all sixteen. That fits in one Pro month. Premier is worth it if you want more takes or want to export from Studio without counting downloads.

**Never download a take you might not keep.** Since September 3, 2026, every song you download counts against the month's limit. Listening in the browser is free. Pick the winner first, then download only that one.

You must be on a paid plan when you download. The commercial rights come with the download (section 8).

### 3.2 Model and settings

Use **Create**, then **Custom** mode.

| Setting | Use | Why |
|---|---|---|
| Model | `v6` | The current flagship (launched Sept 9, 2026; older models are retired). Try `v6-wild` only if `v6` keeps coming out too plain. |
| Instrumental | On | No vocals. If you can't find the toggle, see below. |
| Style | The prompt from section 2.3 | |
| Exclude styles | The exclude list from section 2.3 | |
| Title | The track ID, e.g. `stump_plaza_day` | Keeps your library sorted and the stems named sensibly. |
| Weirdness | About 55 to 60 percent | A touch odd suits the game. Go higher for the compost lab if you like. |
| Style Influence | Strong, about 75 percent | Keeps it close to the prompt. |
| Variety (v6) | 0 | Uses your style text as typed. |
| Max Mode (v6) | On for the final round | Costs more. Suno recommends it for songs over two minutes. |
| Length | 2:30 to 3:00 if Suno offers a length control | Suno can make up to 8 minutes. The game only needs about 75 seconds of steady groove, so more is a safety margin, not a goal. |

**If there's no Instrumental toggle.** Third-party guides disagree on whether v6 shows one. If you don't see it, leave the prompt as written (it already says `instrumental` and `no vocals`), and put only this in the Lyrics box:

```
[Instrumental]
[Main Groove]
[Variation]
[Main Groove]
[Variation]
[Main Groove]
[Variation]
```

**BPM and key are requests, not settings.** Suno has no tempo or key control that we could confirm. It reads `96 BPM` and `C major` from the prompt and usually gets close. The importer measures the real values, so a miss of a few BPM or a different key is fine. A track that drifts in tempo or changes key halfway is not.

---

## 4. Making each track

Work through the list in order. The menu and the plaza come first because they set the game's sound, and the plaza is what players hear most.

1. **Generate.** Paste the settings from section 3.2 and the track's prompt. Press Create three times. That's six takes.
2. **Listen to every take for at least 90 seconds.** Use the checklist below. Throw out any take that fails a "must".
3. **Shortlist two.** Listen to them back to back with the previous track you kept (for neighbors, like plaza and pond). Pick the one that sits better next to it.
4. **Nothing good?** Change one thing and generate again. Usually it's one of: lower Weirdness, a simpler instrument list (fewer instruments give cleaner stems), or moving the lead instrument to the front of the prompt.
5. **Fix small problems instead of rerolling.** If a take is great except for one bad moment (a stray "ooh", a drum fill that falls apart), use Suno's section edit or replace-section tool on just that part. If the steady part is shorter than about 75 seconds, use Extend from the end of the good part, then **Get Whole Song** so it becomes one song before you take stems.
6. **Make the night version as a Cover (recommended).** Open the day track you kept, choose **Cover Song**, and paste the night prompt and the same settings. A cover keeps the melody and changes the style, so day and night sound like the same tune at two times of day. Covers are Pro and Premier only. If the cover keeps the day tempo or sounds wrong after two or three tries, generate the night track from scratch instead.
7. **Get stems** (section 5.1).
8. **Download** (section 5.2) and check the folder (section 5.4).

### Listening checklist

| | Check | How |
|---|---|---|
| Must | No vocals of any kind | No words, no "oohs", no humming, no choir pads that sound like voices. |
| Must | Steady tempo | Tap your foot or a key for a minute. If you drift off the beat, it drifts. No slow-downs, no half-time breakdowns. |
| Must | No key change | It should feel like the same chord loop the whole way. |
| Must | At least 75 seconds of steady groove in a row | Intros and endings are fine as long as the middle has this. |
| Want | Short intro | Under about 8 seconds. Long intros waste length. |
| Want | No fade-out, no big ending | Same reason. The game loops a stretch from the middle, so the ending is never heard. |
| Want | A clear tune | Hum it after one listen. The lead layer carries the area's identity. |
| Want | Clear parts | You can pick out drums, bass, chords, and melody. Mushy arrangements split into mushy stems. |
| Want | Fits the area | Imagine the bugs in it. Cute and weird, but cool, not babyish. |

For `stinger_unlock`, only "no vocals" matters. Crop it to the fanfare (3 to 6 seconds) with Suno's crop tool before you download, or write the times in `notes.txt` (section 5.3) and the importer will cut it. It needs no stems.

---

## 5. Stems, downloads, and folders

### 5.1 Getting stems

1. In your Library, open the **More Actions (...)** menu on the take you kept.
2. Choose **Get Stems**.
3. Choose **Auto Split** (up to 12 stems, 50 credits). Don't use Split from Mix or Advanced Split unless an engineer asks.
4. Choose **Extract** and wait. It takes a few minutes.

Suno's Auto Split categories are vocals, backing vocals, drums, bass, guitar, keys, strings, brass, woodwinds, percussion, synth, and FX. You will usually get fewer than twelve, because Suno only gives stems for parts that are in the song. Different songs give different sets. That is expected and fine. The importer handles any set.

On Premier you can do the same in Suno Studio: drag the take onto the timeline, right-click it, choose **Split Stems**, then export **Multitrack** as WAV. Studio exports don't count against Premier's download limit.

### 5.2 Downloading

1. Download the full song: **More Actions (...)**, **Download**, **WAV**.
2. Download the stems from the same take, as WAV if offered.

What we could not confirm: whether Suno gives stems as one ZIP or as separate files, and exactly how it names them. Reports from 2026 mention a ZIP of WAV files, and names like `Drums.wav`, `Drums [a1b2c3d4].wav`, or the song title plus the stem name. Whatever you get, the rules below work.

### 5.3 The folder rules

```
assets/music/
  stump_plaza_day/
    full.wav                     <- the full mix, renamed by you
    Drums.wav                    <- stems, exactly as Suno named them
    Bass.wav
    Keys.wav
    Woodwinds.wav
    ...
    notes.txt                    <- optional
  stump_plaza_night/
    ...
```

1. **Make one folder per track** at `assets/music/<track_id>/`, named exactly as in the track list. Lowercase, underscores, no spaces.
2. **Rename the full mix to `full.wav`.** This is the only file you rename.
3. **Put every stem file in the same folder, with Suno's names.** Don't rename stems. The importer reads the instrument name out of the filename.
4. **If the stems came as a ZIP, unzip it into the track folder.** If unzipping makes a subfolder, that's fine. The importer looks one level down. Delete the ZIP afterwards, or leave it. The importer ignores ZIPs.
5. **Every file in a folder must come from the same take.** This is the one rule that breaks things silently. If you change your mind about a take, empty the folder and start it again.
6. **WAV if you can, MP3 if you must.** The importer accepts `.wav`, `.mp3`, and `.flac`. If Suno only offers stems as MP3, take MP3. Don't convert anything yourself.
7. **No stems at all?** Put just `full.wav` in the folder. The track will still play. It just won't layer.
8. **Optional `notes.txt`.** Plain text, one item per line. The importer reads the lines that start with these words and ignores the rest:

   ```
   link: https://suno.com/song/...
   downloaded: 2026-10-04
   plan: Pro
   trim: 0:01.2-0:05.8
   ```

   `link` is the chosen take's Suno page. `trim` is only for `stinger_unlock`, if you didn't crop it in Suno. Anything else you write, such as what you liked about the take, is fine.

### 5.4 Check before you move on

| Look for | If wrong |
|---|---|
| The folder name matches the track list exactly | Rename the folder. |
| `full.wav` is there | Rename the full mix. |
| There are stem files with instrument names in them | Download the stems again from the same take. |
| No file is named `Vocals` or `Backing Vocals` | Not fatal. The importer drops vocal stems with a warning. Listen to that stem: if it has real singing in it, pick another take. |

If you can run the importer (`pnpm music:import <track_id>`, once M9 lands), run it after each track. It prints a short report: which stem went to which layer, the tempo and key it found, and any warnings. Send the report to an engineer if anything looks odd.

### 5.5 Back up the raw files

The raw WAVs are large (about 3 to 7 GB for all sixteen tracks) and are not committed to git (section 7.10). Keep a copy of `assets/music/` in a cloud folder or on a backup drive. Suno also lets you re-download a song you've already downloaded without using another download, so the Suno library is a second backup.

---

## 6. Order of work and time

| Step | Tracks | Notes |
|---|---|---|
| 1 | `main_menu`, `stump_plaza_day` | Sets the sound. Spend the most time here. |
| 2 | `stump_plaza_night` (cover of plaza day) | First test of the cover workflow. |
| 3 | `puddle_pond_day`, `puddle_pond_night` | The other area open at start. |
| 4 | Flowerbed, porch, compost, treehouse, day then night | In strip order, so you can check each against its neighbor. |
| 5 | `ant_hill_depths`, `gnome_hollow` | |
| 6 | `stinger_unlock` | Optional. |

Hand the first two folders to an engineer as soon as they're done, so the importer and the in-game mix can be tested before you make the rest.

---

## 7. Import pipeline and runtime (M9 engineering spec)

### 7.1 Overview

```
assets/music/<track_id>/         scripts/import-music.mjs          src/renderer/public/music/
  full.wav + Suno stems   --->   map, check, analyze, loop,  --->   <track_id>/drums.ogg ...
  notes.txt                      normalize, encode                  manifest.json
assets/music/overrides.json                                         (committed)
```

- `pnpm music:import [track_id ...]` runs the script. With no arguments it imports every folder whose source changed (it compares a hash of the source files with the hash in the manifest). `--force` reimports everything.
- It is a developer tool. It does not run in CI. Its outputs are committed, so CI and players never need the raw files.
- Output goes to `src/renderer/public/music/`. Vite copies `public/` into `out/renderer/` as is, so the files ship inside the app with no builder change. The renderer fetches them by relative URL.
- Every run writes `assets/music/import-report.txt` (gitignored) with one section per track.

### 7.2 Tools

| Job | Tool | Notes |
|---|---|---|
| Decode, resample, filters, encode | ffmpeg 6 or newer with `libopus` and, ideally, `librubberband` | Use `ffmpeg-static` as a dev dependency so every machine has the same build, or the system ffmpeg if it has both libraries. Check with `ffmpeg -encoders \| grep opus` and `ffmpeg -filters \| grep rubberband`. |
| Loudness | ffmpeg `ebur128` (measure) or `loudnorm` in measure mode | Measure only. Apply gain ourselves so every layer gets the same gain. |
| BPM and beats | `essentia.js` (WASM, runs in Node): `RhythmExtractor2013` (multifeature) | Run on the drums layer if present, else the full mix. |
| Key | `essentia.js`: `KeyExtractor` | Run on bass plus harmony (no drums). Try the `bgate` and `edma` profiles and keep the more confident result. |
| Loop search | Our own code over essentia's `HPCP` (chroma) and an RMS envelope | See 7.6. |
| Raw PCM math (summing, crossfades, alignment) | Plain `Float32Array` in Node | Decode with `ffmpeg -f f32le -ac 2 -ar 48000 pipe:1`. |

Keep the analysis logic (mapping, loop scoring, crossfade baking, key-to-scale) in a pure module, `scripts/music/analysis.mjs` or a TypeScript equivalent, so Vitest can test it on synthetic signals without ffmpeg.

### 7.3 Steps per track

1. **Discover.** List audio files (`.wav`, `.mp3`, `.flac`) in the folder and one level of subfolders. Skip `.zip`, `notes.txt`, and hidden files.
2. **Find the full mix.** `full.wav` (or `full.*`). If missing, take a file whose name, with the song title and any `[id]` suffix stripped, is empty or matches `mix|master|full|original|instrumental` and is not a stem. If there is still none, sum the stems and warn.
3. **Decode** everything to 48 kHz stereo float. Trim leading digital silence (below -70 dBFS) by the same amount from every file, using the full mix to find it.
4. **Map stems to layers** with the keyword table (7.4) and `overrides.json`.
5. **Align.** Cross-correlate the sum of stems with the full mix over the first 30 seconds, within ±200 ms. Shift stems if the offset is more than 1 ms. Warn above 20 ms.
6. **Sum check** (7.4).
7. **Sum each layer.** All stems mapped to `harmony` become one harmony buffer, and so on. A track has at most four layer files. A layer with no stems is absent.
8. **Analyze tempo and key** (7.5).
9. **Find the loop** (7.6).
10. **Normalize** (7.7).
11. **Bake and encode** (7.8 and 7.9).
12. **Write** the manifest entry and the report.

`stinger_unlock` takes a short path: full mix only, `trim` from `notes.txt` if present, trim silence at both ends (below -60 dBFS), a 50 ms fade-out, normalize, encode. No loop, no layers.

### 7.4 Stem mapping

Normalize each stem's filename first: drop the extension, drop any `[...]` or `(...)` that holds only an ID, drop the song title if the name starts with it, lowercase, and turn `_`, `-`, and spaces into single spaces. Then find every keyword that matches. The longest matching keyword wins, so `bass clarinet` beats `bass` and `bassoon` beats `bass`. If two keywords of the same length match, the earlier row wins.

| Order | Layer | Keywords (whole words or word starts) | Notes |
|---|---|---|---|
| 1 | ignore, as full mix | `full`, `mix`, `master`, `original`, `instrumental` | Only when no other keyword matches. |
| 2 | dropped | `backing vocal`, `vocal`, `voice`, `choir`, `vox` | Warn. Report its loudness so a human can decide whether the take is usable. |
| 3 | `drums` | `drum`, `percussion`, `perc`, `kick`, `snare`, `hat`, `hihat`, `cymbal`, `beat`, `tom` | |
| 4 | `bass` | `bass`, `sub`, `808`, `tuba` | `bass clarinet` and `bassoon` go to row 5, because they are longer matches. |
| 5 | `lead` | `melody`, `lead`, `woodwind`, `brass`, `bassoon`, `bass clarinet`, `trumpet`, `kazoo`, `whistle`, `flute`, `clarinet`, `musical saw`, `theremin` | |
| 6 | `harmony` | `key`, `keyboard`, `piano`, `guitar`, `string`, `synth`, `pad`, `organ`, `chord`, `fx`, `effect`, `ambience`, `other`, `banjo`, `ukulele`, `harp` | |
| 7 | `harmony` | anything else | Warn, so someone checks it. |

`synth` defaults to `harmony`, which is wrong for the treehouse (square-wave lead) and maybe the pond at night (theremin-like synth). Those cases go in overrides.

**Overrides.** `assets/music/overrides.json` is committed and edited by engineers after listening:

```json
{
  "treehouse_arcade_day": { "layers": { "synth": "lead", "keys": "harmony" } },
  "stump_plaza_day": { "layers": { "percussion": "lead" }, "key": "C major" }
}
```

Keys in `layers` are normalized stem names (as above). Values are a layer name or `"drop"`. `key` and `bpm` override detection.

**Mallet leads are a known risk.** Marimba, xylophone, glockenspiel, and steel drum may come out of Suno inside `percussion` or `keys`. The importer flags any stem mapped to `drums` that is strongly pitched (mean HPCP peak-to-mean ratio above a threshold, tuned on the first tracks) with "pitched percussion, check whether this is the melody". It also flags a track with no `lead` layer.

**Sum check.** Sum all non-dropped stems and compare with the full mix over the whole song:

- Residual (mix minus sum) RMS relative to the mix: below -12 dB is fine. Between -12 and -6 dB, warn. Above -6 dB, warn loudly: a stem is probably missing or from another take.
- Also compare 1-second RMS envelopes (correlation should be above 0.95). A low value with a good overall residual means a stem is from a different take.
- Never fail the import on the sum check. Suno's separation regenerates parts and won't null perfectly, especially Advanced Split. The report is for a human.
- Stems that differ in length from the full mix by more than 50 ms get a warning and are padded or cut to the mix's length.

### 7.5 Tempo and key

**Tempo.**

1. Run `RhythmExtractor2013` to get the BPM and beat times.
2. Correct octave errors against the target from the track list: if the detected BPM is near half or double the target, use the matching multiple.
3. **Conform.** If the detected BPM is within 4 percent of the target (96 or 72), time-stretch every layer to the exact target with `rubberband` (ffmpeg filter `rubberband=tempo=<target/detected>`, high quality, formant preserved off). Then all day tracks share 96 BPM and all night tracks 72, so area crossfades can be beat-locked. Without `librubberband`, use `atempo` and warn. If the miss is bigger than 4 percent, keep the detected tempo and warn: crossfades from that track won't be beat-locked, and the owner might want another take.
4. Re-run beat tracking after the stretch to get the final beat grid.
5. **Downbeat.** Pick the bar phase (0 to 3) whose beats line up with the strongest kick-band (40 to 120 Hz) onsets in the drums layer. Without drums, use the bass layer's onsets. `overrides.json` can set `"downbeat": <seconds>` when this guesses wrong.
6. Check for drift: fit a straight line to the beat times. If any beat is more than 30 ms off the line in the steady region, warn "tempo drift".

**Key.**

1. Run `KeyExtractor` on bass plus harmony.
2. If the result is the target key or its relative (for example `A minor` for target `C major`), accept it. They share the same pentatonic notes.
3. If it differs and confidence is below 0.6, use the target key and warn. If confidence is 0.6 or more, trust the detection and warn that neighbors may clash.
4. Store the tonic, the mode, and the pentatonic pitch classes: major uses `[0, 2, 4, 7, 9]` from the tonic, minor uses `[0, 3, 5, 7, 10]`.

### 7.6 Loop points

The game plays a loop body taken from the middle of the song, never the intro or the ending.

1. Candidate starts: downbeats from 4 bars after the first beat up to 60 seconds in.
2. Candidate lengths: multiples of 4 bars, as long as possible within 48 to 96 seconds of audio (at 96 BPM that's 20 to 36 bars, at 72 BPM 16 to 28 bars), and the end must sit before the last 10 seconds of the song.
3. Score each (start S, end E) pair by how alike the one bar after E is to the one bar after S, over the full mix. Use the mean cosine similarity of 12-bin HPCP frames (weight 0.5), the correlation of RMS envelopes in 20 ms frames (0.3), and the correlation of onset strength (0.2).
4. Prefer the longest candidate whose score is within 0.05 of the best.
5. Reject a candidate if the RMS of any bar inside it is more than 9 dB below the median bar (that's a breakdown or a fade). If nothing passes, take the best anyway and warn.
6. `overrides.json` can pin `"loop": [startSeconds, endSeconds]`.

### 7.7 Loudness

1. Measure the integrated loudness of the full mix over the loop region with `ebur128`.
2. Compute one gain that brings it to **-18 LUFS**.
3. Apply that same gain to every layer. Never normalize layers one by one, or the balance between them is lost.
4. Sum the gained layers and measure the true peak. If it is above -1.5 dBTP, lower the shared gain until it isn't. Don't limit.
5. `stinger_unlock` targets -16 LUFS, since it plays over ducked music.

-18 LUFS leaves room for sound effects and voices on the master bus. The music slider and the master limiter do the rest.

### 7.8 Baking the loop

Bake the loop into each layer file so the runtime can loop the whole buffer with no seams:

1. Cut each layer to [S, E + X), where X is one beat.
2. Crossfade the tail [E, E + X) into the head [S, S + X): head gets a fade-in, tail a fade-out, then add them. Use equal-power curves for the drums and lead layers and linear curves for bass and harmony (sustained, highly correlated material sums better linearly). The crossfade uses the same sample positions in every layer, so layers stay locked.
3. The result is exactly E - S samples long and starts on a downbeat.

### 7.9 Encoding and output

Encode with `libopus` at 48 kHz, VBR, `-application audio`:

| Layer | Channels | Bitrate |
|---|---|---|
| `drums` | stereo | 80 kb/s |
| `bass` | mono | 48 kb/s |
| `harmony` | stereo | 96 kb/s |
| `lead` | stereo | 96 kb/s |
| `full` (only when a track has no stems) | stereo | 128 kb/s |
| stinger | stereo | 128 kb/s |

Files go to `src/renderer/public/music/<track_id>/<layer>.ogg`.

Opus files carry a pre-skip and may pad the last frame, so the decoded length can differ by a few samples. The manifest stores the exact loop length in samples. The runtime sets `loopEnd` from it and doesn't trust the buffer length.

**Manifest.** `src/renderer/public/music/manifest.json`:

```json
{
  "version": 1,
  "sampleRate": 48000,
  "lufs": -18,
  "tracks": {
    "stump_plaza_day": {
      "area": "area_stump_plaza",
      "phase": "day",
      "bpm": 96,
      "bpmDetected": 95.4,
      "beatsPerBar": 4,
      "key": { "tonic": "C", "mode": "major", "confidence": 0.81, "source": "detected" },
      "scale": [0, 2, 4, 7, 9],
      "loop": { "samples": 2880000, "bars": 24, "sourceStart": 31.25, "score": 0.93 },
      "layers": {
        "drums": "stump_plaza_day/drums.ogg",
        "bass": "stump_plaza_day/bass.ogg",
        "harmony": "stump_plaza_day/harmony.ogg",
        "lead": "stump_plaza_day/lead.ogg"
      },
      "stems": { "Drums.wav": "drums", "Percussion.wav": "drums", "Bass.wav": "bass", "Keys.wav": "harmony", "Woodwinds.wav": "lead" },
      "warnings": [],
      "source": { "hash": "sha1:...", "link": "https://suno.com/song/...", "importedAt": "2026-10-05" }
    },
    "stinger_unlock": {
      "kind": "stinger",
      "file": "stinger_unlock/full.ogg",
      "samples": 240000
    }
  }
}
```

`scale` holds pitch classes relative to the tonic. `phase` is `day`, `night`, or `always`. `area` is absent for `main_menu` and the stinger. Add a schema check (a small hand-written validator is enough) that the renderer runs on load and a unit test runs on the committed manifest.

### 7.10 Repo and installer size

| What | Where | In git? | Size |
|---|---|---|---|
| Raw Suno files | `assets/music/<track_id>/` | No. Ignore `assets/music/**/*.wav`, `*.mp3`, `*.flac`, `*.zip`. Keep `notes.txt` and `overrides.json` committed. | About 3 to 7 GB for all tracks (a 3 minute 48 kHz 16-bit stereo WAV is about 35 MB, times the full mix plus 4 to 12 stems) |
| Built music | `src/renderer/public/music/` | Yes, plain git | About 40 MB (see below) |
| Report | `assets/music/import-report.txt` | No | |

Estimate for the built files: the four layers together run 80 + 48 + 96 + 96 = 320 kb/s, about 40 KB per second. A typical 64 second loop is about 2.6 MB per track. Fifteen looping tracks come to about 38 MB, plus a tiny stinger. The range is 30 to 55 MB depending on loop lengths. That adds the same amount to each installer, since Opus doesn't compress further.

**No Git LFS for now.** Each file is under 1.5 MB, the total is about 40 MB, and LFS would add a fetch step and bandwidth quota to all three CI platforms for no real gain. Revisit if the built music passes about 150 MB or tracks get re-imported often enough to bloat history. Re-import a track only when its take changes.

The raw files can't go in git at all. GitHub rejects files over 100 MB and the total would be gigabytes. They live in the owner's backup (section 5.5).

**Memory.** A decoded layer is 32-bit float at 48 kHz: about 384 KB per second in stereo. A 64 second track with three stereo layers and a mono bass layer is about 86 MB decoded. Keep at most two tracks decoded at once (the playing one and the one fading in), and keep the compressed bytes of the next area's track in memory so decoding starts early. `decodeAudioData` decodes off the main thread.

### 7.11 Runtime

Put the logic in pure modules so Vitest can test it without WebAudio, as with the rest of the renderer:

| Module | Job |
|---|---|
| `audio/musicManifest.ts` | Load and validate the manifest. Answer "which track for this area and phase", with fallbacks. |
| `audio/musicPick.ts` | From camera x, the area map, the sky phase and clock, and the menu state, pick the target track and the crossfade type. Holds the border dead zone (the camera center must be 0.5 m past a border, or stay past it for 1 s). |
| `audio/musicMix.ts` | From a `MusicState` snapshot (section 7.12), compute the target gain of each layer. |
| `audio/musicClock.ts` | Tempo, key, scale, and beat phase from the playing track and `AudioContext.currentTime`. Music toys and the sequencer quantize to this. During a crossfade it switches tracks at the midpoint. When tempo changes it glides over 8 beats. |
| `audio/musicPlayer.ts` | The WebAudio side: fetch, decode, one `AudioBufferSourceNode` per layer with `loop = true` and `loopEnd = samples / 48000`, all started with the same `when`. Layer gain nodes feed a track gain node, which feeds `bus_music`. Layer gain changes ramp to bar lines. |

Area crossfades between tracks with the same BPM start the incoming track at the same beat-in-bar as the outgoing one. Each track remembers where it was when it faded out and resumes from the nearest bar to that spot, so walking back and forth doesn't restart the tune every time.

The synthesized music features stay on top of the tracks: the mushroom sequencer, instruments, the band layer when three bugs perform on the stage, and Fiddle's dusk chorus. They read the key and tempo from `musicClock`. The bluebell speakers still send the stage's sound to other areas at 25 percent, transposed into that area's key.

### 7.12 Layer rules

Each rule gives a factor per layer. Multiply the factors that apply, then clamp to 0 to 1. Gains ramp over one bar unless the table says otherwise.

| Condition | drums | bass | harmony | lead | Notes |
|---|---|---|---|---|---|
| Base, day | 1.0 | 1.0 | 1.0 | 0.85 | |
| Base, night | 0.6 | 0.9 | 1.0 | 0.7 | Night tracks are sparse already. |
| First game hour of dusk or dawn, on the outgoing track | 0.3 | 1.0 | 1.0 | 0.6 | Thins out before the crossfade. |
| Idle (no player input) 45 s | 1.0 | 1.0 | 1.0 | 0.6 | |
| Idle 120 s | 0.6 | 1.0 | 1.0 | 0.4 | Replaces the 45 s row. Any input restores over 2 bars. |
| Busy: 5 or more awake bugs on screen doing something, or the player dragged or flung in the last 4 bars | 1.0 | 1.0 | 1.0 | 1.0 | Replaces the base lead factor with 1.0 and cancels the idle rows. |
| Player music: a player note or the sequencer playing in this area in the last 2 bars | 1.0 | 1.0 | 0.85 | 0.25 | Dips within one beat. Comes back over 2 bars after 4 quiet bars. |
| The sequencer's drum row has active steps | 0.5 | 1.0 | 1.0 | 1.0 | |
| A bug plays an instrument in view | 1.0 | 1.0 | 1.0 | 0.5 | |
| Rain, outdoor areas | 0.0 | 1.0 | 1.0 | 0.6 | Plus a 2 kHz low-pass on the music bus. |
| Rain, porch, ant hill, gnome hollow | 1.0 | 1.0 | 1.0 | 0.8 | Sheltered. The synthesized rain patter does the work. |
| Ant Hill Depths at night (the ants sleep) | 0.3 | 1.0 | 1.0 | 0.6 | |
| Pause board open | 1.0 | 1.0 | 1.0 | 1.0 | Track gain -6 dB plus a 900 Hz low-pass, over 300 ms. |
| `stinger_unlock` playing | | | | | Track gain -9 dB from 100 ms before the stinger to 500 ms after it. |

A track with only a `full` layer follows the same rules through its track gain: it uses the mean of the four factors, and rain applies the low-pass.

### 7.13 Fallbacks

Missing music must never break the game or the tests.

| Missing | What plays |
|---|---|
| A night track | That area's day track, with the night rules. |
| A day track | That area's night track, with the day rules. |
| Both tracks for an area | A soft procedural pad (the existing synth's `syn_pad`) playing the target key's I, vi, IV, V chords at the target tempo, at about -24 LUFS. Music toys lock to the target key and tempo from a built-in table that copies section 2.1. |
| `main_menu` | `stump_plaza_day`, else the pad. |
| `stinger_unlock` | The synthesized unlock fanfare from section 16 of the design doc. |
| The whole manifest, or a fetch or decode fails | The pad everywhere, and one warning in the console. |
| A layer | Nothing for that layer. Rules that touch it do nothing. |

In test mode the audio backend is `NullAudioBackend`, so nothing decodes. The music modules still run and report what they would play.

### 7.14 Tests

- Unit (Vitest): stem-name normalization and the keyword table, including `bass clarinet`, `Bassoon`, `Drums [a1b2c3d4]`, and a title prefix. Override handling. Loop scoring and crossfade baking on synthetic signals (a looped sine with a known period must come back with zero seam error). Key-to-scale. `musicPick` (borders, the dead zone, phases, the sundial, hidden areas, fallbacks). `musicMix` for every row of 7.12. `musicClock` quantization against a track's BPM. The committed manifest passes the schema check, and every area in `src/game/data/areas.ts` has a track or a fallback.
- E2E (real mouse, assertions through `window.__bb`): add `__bb.music()` returning the target track ID, the layer gains, the BPM, and the key. Pan from the plaza to the pond and see the track change. Poke an instrument and see the lead gain dip, then recover. Set rain with `set_weather` and see drums go to zero. Set the time with `set_time` across dusk and see the night track.

### 7.15 As built in M9

The importer and the runtime follow this section, with these differences, each for a reason found on the first two tracks:

- **No essentia.js.** The analysis is our own TypeScript in `scripts/music/analysis.ts`: a comb fit of one steady beat grid to the drums' onsets (Suno keeps a steady tempo, and a per-beat tracker kept slipping onto off-beats), key detection from chroma against two key profiles, and the loop search of 7.6. Both tracks came out within 4 ms of a straight grid.
- **Silence.** A stem is dropped when its loudest 1 percent of 400 ms blocks sits more than 40 dB under the mix's, or under -60 dBFS, or less than 1 percent of it is within 30 dB of the mix. The 1 percent keeps sparse parts (a kazoo answer, an effect) that a 95th-percentile measure dropped.
- **Vocals in the mix.** The importer compares the full mix with the instrumental stems, with and without the vocal stems added. If the vocals explain part of the difference and are within 30 dB of the mix, the mix sings, and loudness and the loop are measured on the instrumental stems instead.
- **No lead stem.** When no stem is named for the tune, the importer makes the busiest, highest harmony stem the lead and warns. The plaza's marimba came out in `Keyboard`.
- **Loudness** is measured on the layers summed, not the full mix: Suno's stems add up 2 to 3 dB quieter than its master, by a different amount per track. The true-peak check leaves 0.5 dB for the codec, and a track that cannot reach -18 LUFS without passing -1.5 dBTP stays quieter, with a warning.
- **Loop length.** Among candidates scoring within 0.05 of the best, the importer takes the one nearest 64 s rather than the longest, to keep the build small.
- **Padding.** Each layer file holds 100 ms of the loop's own end before the body and of its start after it. The manifest's `loop.start` says where the body begins; the player loops from there.
- **Tempo changes.** Real tracks can't glide, so the music clock switches to the incoming track's grid at the crossfade's midpoint, on that track's bar line.

What the first two tracks taught, for the remaining fourteen:

- Suno ran fast: 97 BPM for the menu and 98 for the plaza, against 96. The importer stretched both onto 96, which is fine, but closer is better. Keep asking for the tempo in the style prompt.
- Both came out in C major as asked, with high confidence.
- Suno made 12 stems for each and 3 to 6 were silent, including both vocal stems. That is expected (playtest F5).
- The tune hides in `Keyboard` when it is a marimba. If a track's lead is a mallet or a synth, say which stem it landed in after listening and pin it in `overrides.json`.

What the next five taught (plaza night, both pond tracks, both flowerbed tracks):

- Suno Studio can change a track's BPM before export, and it changes the stems with it. Use it when a take is more than 4 percent off: the importer leaves those alone. Studio's slow-down kept the drum hits sharp at 7 percent (flowerbed day, 206 to 192), where rubberband smeared them.
- A cover follows its source's tempo. When a night cover won't slow down without losing the tune, set the day track to the night tempo in Studio first (144 for a track Suno counts in double time), then cover that slowed version with Audio Influence left high. The flowerbed night came out at exactly 72 this way.
- Suno counts some tracks in double time. 192 is 96 and 144 is 72; the importer treats them the same.
- Stem labels are loose. Pond night's sliding lead landed in `Backing_Vocals` and `Vocals`, with nobody singing; both are pinned to `lead` in `overrides.json`. A few piano notes can leak into `Percussion`. They play in place with every layer on and drop out with the drums in rain.
- Studio's zip names the full mix `0 <track_id>.wav`. The importer takes that as the full mix, so nothing needs renaming.
- The importer stretches the drums layer with rubberband's `transients=crisp`. The default softened each hit even at 2 percent (22 ms to 30 ms rise on pond day's drums). Crisp keeps the peaks, so a stretched track can sit a little further under -18 LUFS: plaza day went from 2.4 dB under to 2.9.
- Keys: four of seven matched the prompt. Pond day came out in E major (asked G major) and its night cover followed it; flowerbed day reads C major (asked D major). The importer misread flowerbed night as E major when its brass and keyboard stems are plainly B minor, so that key is pinned. Check a low-confidence key against single stems before trusting it.

---

## 8. Licensing

What Suno's terms and help pages said on 2026-10-01, from the Terms of Service that took effect on September 3, 2026:

- On Pro and Premier, Suno assigns you its rights in the output you generate, and you may use it commercially. A game sold or given away counts as ordinary commercial use. The terms have no carve-out for games either way.
- Commercial use only covers songs you **downloaded through Suno's own download options**, within your plan's download allowance. A song you only listened to, or one captured another way, isn't covered.
- Free-plan and trial downloads are personal use only. Don't use anything made or downloaded on the free plan.
- Rights in songs you downloaded on a paid plan are perpetual. They survive cancelling or downgrading the subscription and later changes to the download limits.
- You may not use the output to train AI models or to build a competing music generator, and you may not remove or alter Suno's watermarks or fingerprints. Neither affects shipping it in a game.
- Suno doesn't promise that the music can be copyrighted. AI-generated audio may not be protectable, so others might be able to reuse it. That doesn't stop you from using it.

Terms change, and Suno changed them twice in 2026. Keep proof of how and when you got each track:

1. Put the Suno link and download date in each track's `notes.txt`.
2. Keep your payment receipts for every month you generated or downloaded music.
3. Save a PDF of the Terms of Service page on the day you download, in a `licenses/` folder next to your backup of `assets/music/` (not in the repo).
4. Download while subscribed, and don't let the subscription lapse between generating a song and downloading it.

The repo's `package.json` says `UNLICENSED`. If the code is ever released under an open-source license, say in writing that `src/renderer/public/music/` and `assets/music/` are not covered by it. Putting AI-generated music under an open license is a separate decision.

---

## 9. What we're unsure about

| Question | What we know | What the brief does about it |
|---|---|---|
| How stems arrive (ZIP or separate files) | Reports disagree. | Section 5.3 works either way. |
| Exact stem filenames | Reports show `Drums.wav`, `Drums [id].mp3`, and title-plus-stem forms. Suno doesn't document them. | The importer matches keywords anywhere in the name and strips IDs and titles. |
| Whether stems download as WAV | Pro and Premier get WAV for songs. One third-party downloader only saw MP3 stems. | Take WAV if offered, else MP3. The importer accepts both. |
| Whether v6 has an Instrumental toggle | Guides disagree. | The prompt and Lyrics box fallback in 3.2. |
| BPM and key control | Prompt text only. No confirmed setting. | The importer detects, corrects octave errors, and conforms tempo. |
| How extends and covers count against downloads | Suno's FAQ says one song is one download, stems included. It doesn't say how extends and covers count. | You only download the one final song per track, so it doesn't matter. |
| Whether Auto Split always gives the same categories | It gives only the parts present, so sets vary per song. | The importer maps any set to four layers and reports gaps. |

## Sources

- Suno release notes (v6 family on Sept 9, 2026; stem modes on June 11, 2026; Studio 2.0): https://suno.com/release-notes
- How do I get stems? (Auto Split up to 12 stems for 50 credits, Split from Mix, Advanced Split, Pro or Premier): https://help.suno.com/en/articles/13925185
- Advanced Stem Separation (Premier only, about 100 instruments, absent instruments still cost credits): https://help.suno.com/en/articles/12702337
- Stem Splitter (the twelve categories): https://suno.com/products/stem-splitter
- What counts as one download? (stems included, re-downloads free): https://help.suno.com/en/articles/13926145
- Upcoming Changes FAQ (download limits, model retirement): https://help.suno.com/en/articles/13614785
- What types of files can I download? (WAV on Pro and Premier, MIDI on Premier in Studio): https://help.suno.com/en/articles/13926081
- How do I download songs? (multiple songs come as a ZIP): https://help.suno.com/en/articles/2409921
- What is a Cover?: https://help.suno.com/en/articles/2872257
- How long will my song be? (up to 8 minutes, Extend): https://help.suno.com/en/articles/13924929
- v6 FAQ (Max Mode, Variety): https://help.suno.com/en/articles/13924481
- Creative Sliders (Weirdness, Style Influence): https://help.suno.com/en/articles/6141377
- Exporting from Studio (Multitrack WAV export): https://help.suno.com/en/articles/8128193
- Suno's announcement of the September 2026 terms and download limits: https://suno.com/blog/suno-updates-tos
- Suno Terms of Service, September 2026: https://suno.com/terms-september-2026
- Third-party, for prices and credits: https://lumimusic.ai/blog/suno-pricing
- Third-party, for WAV exports at 48 kHz 16-bit and stem counts varying per song: https://undetectr.com/blog/suno-stems-daw-workflow
- Third-party, for stem filenames seen in downloads: https://github.com/radialmonster/suno-downloader
