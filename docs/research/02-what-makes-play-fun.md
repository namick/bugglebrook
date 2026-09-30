# What makes play fun and replayable for 10 to 14 year olds

This note collects what play theory, designer interviews, and well-loved toy-like games say about why kids keep coming back to a sandbox. It ends with rules for Bugglebrook. The locked decisions in `docs/00-decisions.md` still win any conflict: no failing, no timers, nearly wordless, mouse only, weird and silly but never mean.

## 1. Play theory in one page

### MDA and the eight kinds of fun

Hunicke, LeBlanc and Zubek split a game into Mechanics (the rules we code), Dynamics (what happens when those rules run while someone plays) and Aesthetics (what the player feels). Designers build in that order. Players experience it backwards. They feel something first and only later, if ever, notice the rule that caused it. This matters for Bugglebrook because every system we build has to be judged by the feeling it produces, not by how clever the rule is.

LeBlanc's list of eight aesthetics is a useful checklist. Bugglebrook should aim hard at four of them:

- Sensation. Squishy bugs, bouncy physics, good sounds.
- Discovery. Secrets, combos, hidden bugs, new areas.
- Expression. Hats, paint, building contraptions, photos, music.
- Fantasy. Being a giant kid in a tiny bug world.

Fellowship shows up outside the game, when kids compare secrets and share photos. Challenge and Narrative should stay light. Submission, the "zone out and fiddle" aesthetic, is more important than it sounds. A lot of sandbox time is idle poking.

### Lazzaro's four keys

Nicole Lazzaro's player research found four clusters of emotion: Hard Fun (triumph after struggle, which she calls fiero), Easy Fun (curiosity, wonder, messing about), Serious Fun (play that changes your mood or produces something real) and People Fun (social). She argues the best games offer at least three.

Bugglebrook lives mostly on Easy Fun, which is the emotion of "what happens if I...". But a game that is only Easy Fun gets thin for a 13-year-old. We add small doses of the others:

- Hard Fun in optional form: building a marble run that actually works, or figuring out a combo from a cryptic hint. The player picks the challenge. The game never demands it.
- Serious Fun as relaxation and making things: photos saved to disk and music loops they made.
- People Fun at a distance: things worth screenshotting and telling a friend about.

### Paidia and ludus

Roger Caillois described play as a spectrum. Paidia is free, noisy, improvised play, like flinging things around. Ludus is play bound by rules and goals. Caillois also noted that paidia keeps turning into ludus on its own. Kids invent goals ("can I get the ladybug onto the roof?") and rules ("you can only use springs").

Bugglebrook is a paidia game that should make self-invented ludus easy. The physics sandbox is the paidia. The journal, combos and secrets offer optional ludus. The player should never be pushed from one to the other.

### Self-determination theory

Ryan, Rigby and Przybylski tested games against three psychological needs: autonomy, competence and relatedness. Each one independently predicted enjoyment and wanting to play again. For a toy:

- Autonomy means real choice. The player picks what to do next, and the world honors it. Anything we force (tutorial gates, mandatory tasks) costs autonomy.
- Competence means feeling capable. In a sandbox this comes from mastery of the physics, from understanding bugs' habits, and from the journal filling up. It does not come from beating a level.
- Relatedness in a single-player toy comes from characters who seem to notice and like you, and from sharing discoveries with other people.

A related warning from the same research group: Deci, Koestner and Ryan's meta-analysis of 128 studies found that expected, tangible rewards for an activity people already enjoy reduce their intrinsic interest in it. Rewards that tell you "you're good at this" help. Rewards that feel like payment for doing a chore hurt. So Bugglebrook should never pay kids to play. A new journal page should say "you found something", not "task complete, here's 50 coins".

## 2. The toy, not the game

Toca Boca built a company on one idea. Co-founder Emil Overmar said traditional games were all about "the more you play, the better you are", and Toca chose to make digital toys instead: no scores, no time limits, no losing. In Toca Kitchen you cook whatever you like and a character eats it. Kill Screen's summary puts it well: "Their pleasure, or disgust, is your reward." The reaction is the feedback loop. There is no score.

Oskar Stålberg describes Townscaper the same way, as more of a toy than a game. You click, a building grows, and the system adds arches, stairs and gardens you did not explicitly ask for. That surprise is the fun. The player does something simple and the world answers with something richer than the input.

Two lessons for Bugglebrook follow. First, every interaction must produce a reaction worth watching. A bug dropped into the pond should splash, sputter, paddle and climb out shaking itself dry. Second, the world should give back more than the player put in. Placing a mushroom should make it wobble and pop a spore puff, and maybe a bug wanders over to sniff it.

Hidden Folks adds a warning. Adriaan de Jongh found that once players meet one interactive thing, they expect everything that looks like it to be interactive too. His team spent about a year learning to manage that. Their fix was a consistent visual language so players could tell what was interactive. For us: if one leaf is draggable, every leaf of that type must be. Consistency is a promise. Hidden Folks also cut timed challenges because they frustrated players, and cut multi-step puzzles because they were too opaque. Both cuts line up with our no-timer decision.

## 3. Discovery and secrets

### Why secrets feel good

Secrets deliver three separate pleasures:

1. **The moment of surprise.** Something happened that the player did not expect.
2. **The feeling of being clever.** They caused it on purpose, or they now know how to cause it again.
3. **Social currency.** They know something other people do not. Club Penguin's secret rooms, Minecraft recipes and Terraria's secret world seeds all spread by word of mouth. Terraria hashes its secret seed codes so no one can read them from the files, and the community found new ones by trial and error within days of an update. Kids treat that kind of hunt as a group project.

### What good secrets have in common

Looking across Animal Crossing, Club Penguin, Terraria, Chicory, Hidden Folks, Untitled Goose Game and Viva Piñata:

- **They follow the world's logic.** The best secrets feel inevitable in hindsight. The Untitled Goose Game team said their whole game "relies on people believing that their silly ideas might just work", so they filled every edge case they could. If the goose could steal slippers when a character's feet were up, then similar items had to be stealable in similar situations. When a kid thinks "what if I put the firefly in the jar at night?" and it works, they feel the world is real.
- **They come in layers.** Some secrets are near the surface and some are deep. Chicory's developer published a thread of details "most players won't notice", such as the tent decoration you can actually walk into and decorate. Layering means a first-hour player finds a few and a fiftieth-hour player still finds more.
- **They are hinted, not hidden.** A secret nobody can find does not exist. New Pokémon Snap leaves visual clues in the environment and uses side characters to hint at special behaviors. The hint gets curiosity going and the player does the rest.
- **They change conditions, not just locations.** Viva Piñata gives each creature requirements to visit, to become a resident and to become romantic. The romance part is off-limits for us, but the pattern is great. Neko Atsume's rare cats only show up for particular toys. Our weather and day/night cycle are secret multipliers: the same spot behaves differently at night or in the rain.
- **They reward returning.** Animal Crossing ties discovery to time of day and season. We should do the same with our own cycle.

### Combination discovery

Little Alchemy and Doodle God grow a few starting elements into hundreds by combination, and each discovery opens new pairs to try. BotW's chemistry engine formalized this: elements change materials, elements change other elements, but materials do not change materials. That tiny rule set produces a huge number of believable outcomes.

For Bugglebrook, combos should come from properties, not a hand-made list of pairs. Slime is sticky. Fire makes things warm. Water makes things wet and floaty. Potions change bug properties. A hand-authored combo table runs out, while properties that multiply keep producing surprises. Hand-authored special combos can sit on top of that as the secrets.

Minecraft's experience is a warning, though. Some of its recipes cannot be guessed, so most players look them up. When a combo is arbitrary, discovery turns into a wiki visit. Every Bugglebrook combo should be guessable from what the ingredients look like and do.

## 4. Game feel and juice

Steve Swink defines game feel as "real-time control of virtual objects in a simulated space, with interactions emphasized by polish." All three parts matter here. Input must respond immediately. The physics space must be consistent. Polish sells both.

Jonasson and Purho's "Juice it or lose it" talk took a plain Breakout clone and turned it into something delightful without changing the rules. They added tweening, squash and stretch, particles, screen shake, sound, and faces on the blocks. Jan Willem Nijman's "The art of screenshake" did the same for a platformer with thirty small tricks. What they teach:

- **Respond on the first frame.** When the player grabs a bug, it should react at once: a squish, a squeak, a startled face. A delay of even a few frames reads as mush.
- **Squash and stretch everything that moves.** It sells weight and softness, and it already sits in our art direction. Stretch along the direction of velocity, squash on impact, and keep the volume roughly constant.
- **Anticipation and follow-through.** A bug about to hop crouches first. After a landing, antennae keep wobbling. Borrowed from Disney animation principles, these make motion read as alive.
- **Layer the feedback.** An impact can produce a squash, a dust puff, a small sound tuned to the object's material and size, and, for big impacts only, a tiny camera nudge. Each layer is cheap. Together they add up.
- **Scale feedback to the event.** A pebble tap gets a tick. A bug hitting the ground at speed gets a thud, a star burst and a dizzy spin. If everything shakes the screen, nothing does.
- **Faces carry the most feeling.** Juicy Breakout got its biggest laugh from blocks with eyes. Bug eyes tracking the cursor are cheap and make the world feel aware of the player.

Be careful with juice. It can wear people out. Screen shake should be rare and small in a relaxing toy. Plan a setting to reduce motion. Kids with motion sensitivity exist, and parents notice.

## 5. Emergent play from simple systems

Breath of the Wild's team called their approach "multiplicative gameplay": a small number of consistent rules that combine, so players solve problems in ways the designers never scripted. Noita goes further. Every pixel follows simple falling-sand rules, and together they produce what its developers describe as "surprising and unexpected results". Scribblenauts gets emergence from a huge object list plus adjectives that change properties.

Our version is a physics engine plus a small set of properties and states. Keep each rule simple and make all of them apply everywhere:

- Materials: wood floats, stone sinks, rubber bounces, slime sticks, leaf drifts.
- States: wet, sticky, burning or warm, frozen, smelly, glowing, painted, dizzy.
- Rules about how states spread and change. Wet puts out warm. Smelly spreads to nearby things and makes bugs flee or approach depending on who they are. Glowing lights up the night.

Test emergence by asking one question: "Can a player invent a use for this that we did not plan?" If the answer is no, it is a prop, not a system.

Human Fall Flat and Goat Simulator show that physics comedy is its own reward. Goat Simulator's team shipped with non-breaking bugs on purpose because they were funny. Human Fall Flat's wobbly characters make failure itself entertaining. For Bugglebrook, "physics went weird" should usually be funny, not broken. A bug stuck in a stack of cups should look stuck and embarrassed, and the stack should eventually topple. It should never jitter forever.

## 6. Characters that feel alive

### Needs plus smart objects

The Sims gives each Sim a set of needs that decay over time. Objects advertise what they offer ("the fridge fixes hunger"), and the Sim picks among the best-scoring options. Will Wright borrowed the idea from SimAnt's pheromones. The intelligence lives in the environment, which means every new object automatically gives characters new behavior. Two details from Mark Brown's analysis matter a lot:

- Sims pick randomly among the top options rather than always choosing the best one. Perfect optimizers are boring and predictable.
- Autonomy never undoes what the player just did. Brown compares it to the improv rule of "yes, and". The game builds on the player's actions and does not reverse them.

For Bugglebrook this is the right architecture. Each bug has a few simple drives, such as hunger, curiosity, sleepiness, playfulness and sociability, weighted by personality. Toys and objects advertise to those drives. A new toy should make bugs notice it and come over to try it. That moment of "they found my thing" is a big reward in itself.

### Presence without demands

Tamagotchi made kids care by making the pet depend on them, and it was criticized for exactly that. Neglect meant death, kids grieved, and Bandai eventually added a pause. Neko Atsume took the opposite approach. If you forget the cats, nothing bad happens. They just come and go. Our "no failing" decision puts us firmly on Neko Atsume's side. Bugs have needs, but those needs drive behavior. They are never a to-do list for the player, and nothing suffers when the game is closed.

### Small signs of life

Pikmin's team says the creatures are "at their most charming when they're moving", and put huge effort into their sounds. Idle Pikmin wave their stems at you. Desktop pets such as Shimeji have lasted for years on very little: they walk, climb, fall, and react when you pick them up and drop them. Things that make a creature feel alive:

- Idle variety. Scratching, yawning, sniffing, looking around, humming.
- Reacting to the cursor. Glancing at it, following it, flinching if it moves fast.
- Reacting to each other. Waving, bumping, copying, chasing, sharing food.
- Reacting to the world. Sheltering from rain, gathering at a lamp at night, gawking at a big crash.
- Remembering a little. A bug that got flung from the spring avoids it for a minute, or asks for another go, depending on personality.

### Reacting to player interference

Untitled Goose Game is the best model here. Villagers respond to the goose believably. They chase after stolen items, show thought bubbles, then tidy up and go back to their routine, which lets the goose pull the same trick again. The developers stress that no one really gets hurt, which is why the mischief feels safe.

Bugglebrook bugs should behave the same way:

- Flinging is slapstick. The bug bounces, gets dizzy stars, wobbles, then recovers and carries on, maybe with a grumpy puff of steam or a "again!" gesture, depending on personality.
- Interrupting a bug should get a readable reaction, then the bug returns to what it was doing or chooses something new.
- The world recovers. Bugs rebuild a knocked-over pile or carry things back home, so mischief can be repeated.
- Reactions should vary by personality. The show-off loves being flung. The nervous one hides for a bit. The grump shakes its fist. Personality shown through reaction is how 12 to 16 bugs become a cast instead of reskins.

## 7. Cute that teens still like

### The babyish problem

Twelve to fourteen year olds are highly sensitive to anything that signals "for little kids". UX writers who work with this age group say tweens reject childish signals fast: overly simple UI, primary-color everything, patronizing voice, and constant praise. They want to feel competent and clever.

Yet teens openly play Toca Boca World, Animal Crossing, Slime Rancher and Stardew Valley. What those games share:

- **No condescension.** They never explain what you can obviously see. They never cheer you for doing something trivial. Toca Boca World has almost no text and no mascot telling you what a good job you did.
- **Real freedom.** Teens who defend Toca Boca talk about freedom and storytelling, not about the cute art.
- **Depth under the cute.** Slime Rancher looks like candy but has real systems: diets, hybrid "largo" slimes, and ecosystems that can go wrong. Stardew and Animal Crossing hide a lot of optimization depth under cozy art.
- **A little weirdness or edge.** Toca Boca has a strange, slightly anarchic tone. Goat Simulator is openly absurd. Pikmin's designers deliberately aim for creatures that are "both cute and creepy". A cute game with a weird streak reads as knowing, not babyish.

### Humor that lands at 13

- **Absurd.** Katamari's creator Keita Takahashi aimed for something "funny" and new. Kids this age love non sequiturs, deadpan reactions to chaos, and things played seriously that are obviously silly.
- **Slapstick.** House House called Untitled Goose Game slapstick in the silent-film tradition. Physical comedy crosses ages and needs no words, which suits our nearly wordless design.
- **Mild gross-out.** Burps, farts suggested by green clouds, slime, and a bug that eats something gross and turns green. This is one of the most reliable laughs at this age. Keep it cartoon-level, and let the bugs react ("ew") as much as the player does.
- **Subversion.** The cute thing does something un-cute. A tiny bug lets out an enormous burp. A serious-looking beetle wears a party hat.

Humor that misses at this age: jokes that explain themselves, puns aimed at parents, anything that punches down, and humiliation of a character that does not recover or bounce back. "Never mean" is both a values call and a comedy call. The victim of slapstick has to get back up.

### Visual and tonal notes

Our art direction is already Toca-like: bold shapes, thick outlines, bright colors. That works for teens when the palette has some range. Night scenes, muted compost-lab greens and moody pond blues keep it from looking like a toddler app. UI chrome should be minimal and confident. Bug voices should be gibberish with attitude, not squeaky baby talk.

## 8. Collection, journals and pacing

### Why collecting works

Pokédex-style completion hits competence and a clear sense of progress without needing a fail state. The Animal Crossing museum does two smart things. Every donation gets a small reaction from Blathers, and the museum physically fills up so progress is visible in the world. Neko Atsume's Catbook records visitors automatically and stores the player's favorite photos, so the collection is also a scrapbook.

### Journal design for Bugglebrook

- **Record automatically.** The player discovers, the journal notices. No manual logging.
- **Show silhouettes of what's missing.** A blank space shaped like a bug or a combo tells players something exists without spoiling it. Add a tiny pictogram hint: a moon, a raindrop, a slime drop.
- **Use the player's own photos.** When a player takes a photo of a discovery, it can become that entry's picture. The journal becomes theirs.
- **Celebrate briefly.** A stamp, a sound, and a page turn. Then get out of the way. No modal that blocks play for seconds.
- **Show counts per area.** "Pond: 7 of 12" gives completionists a target without nagging everyone else.

### Pacing unlocks without grind

The overjustification research and the loot-box research both point the same way. Do not pay kids for repetition, and do not use random rewards to keep them clicking. Research on adolescents finds that variable-ratio rewards and flashy reveals raise the urge to keep going, and that this age group is especially responsive to reward cues. We have no monetization, but the same patterns can creep into unlock design.

Good unlock pacing for us:

- **Unlock by discovery, not by count.** A new area opens because the player figured something out, like floating a leaf raft across the pond or luring the right bug with the right snack. It does not open because they clicked 100 times.
- **Give lots early.** The first 10 minutes should hand over a big toybox. Early generosity earns trust.
- **Stagger complexity, not permission.** Deeper areas can hold stranger toys and harder combos, but the starting area should already be fun on its own.
- **Keep every step deterministic.** If a secret needs a condition, meeting the condition should always work. Randomness belongs in flavor, never in whether progress happens.
- **Always have a next thing in view.** Something visible but unexplained, such as a locked hatch, a sound behind the porch or a strange glow at night, keeps curiosity going without a quest log.

## 9. Photo mode, music toys and crafting

### Photo mode

Photo modes work when the world is worth photographing and when the player can shape the moment. New Pokémon Snap's appeal is catching creatures mid-behavior, and it rewards rare poses. Neko Atsume's favorites album shows that kids want to keep and share pictures of creatures they are fond of. For Bugglebrook:

- Pause time on entry so the moment holds, and allow framing and zoom.
- Stickers and frames should be as silly as the game: googly eyes, speech bubbles with pictograms, stink lines.
- Bugs should notice the camera. Some pose, some photobomb, and the shy one hides. That turns the camera into a toy with its own discoveries.
- Saving to Pictures is the social layer. Photos are how kids show friends what they found.

### Music toys

Incredibox's success comes from one rule: no sound is wrong. Every loop fits the others, so beginners get good-sounding results right away. Our instruments and sequencer should be locked to the current area's key and tempo so anything a player does sounds musical. Other points:

- Instruments should be physical objects in the world. Dropping a pebble on a mushroom plays a note. Marble runs that hit xylophone leaves become music machines.
- Bugs should respond to music. They dance, bob or sing along in gibberish, and a certain tune might attract a hidden bug.
- The sequencer should be visual and grid-based, with loops that keep playing while the player does other things.

### Crafting and building

Crafting works for kids when it is physical and forgiving. Scribblenauts and Little Alchemy prove that "try it and see" is fun in itself. Rules for our junk-crafting:

- Build by dragging things together in the world, not by picking from a menu recipe.
- Anything the player makes should work in the physics sandbox straight away: a spring-bottle-cap launcher should launch bugs.
- Failed combinations should produce something funny rather than nothing: a puff of smoke, a sad trombone, a bug laughing. An empty "no" kills experimentation.
- Some combos should turn into named contraptions that go into the journal, which ties crafting back into collection.

## 10. Principles for Bugglebrook

1. **Every action gets a reaction.** Nothing the player can touch should respond silently. At minimum each interaction gets motion, sound and a face.
2. **Respond within one frame.** Grabbing, dropping and clicking must show visible feedback immediately.
3. **Squash, stretch, anticipate and follow through.** Every living thing and soft object uses these. Scale the size of feedback to the size of the event.
4. **The reaction is the reward.** No points, coins or scores. Bugs' delight, disgust, dizziness and surprise are the payoff.
5. **Never fail, never nag.** No timers, no death, no decaying needs that punish absence, and no messages telling the player what they should be doing.
6. **Build systems, not props.** Objects get material properties and states that interact under shared rules. Before adding an object, ask whether a player could invent a use for it that we did not plan.
7. **Consistency is a promise.** If one thing of a kind is interactive, every thing of that kind behaves the same way. Rules apply everywhere, in every area.
8. **Secrets follow the world's logic.** Every secret should make sense in hindsight. If a kid has a silly idea that ought to work, it should work.
9. **Hint everything, explain nothing.** Every secret needs a visible clue in the world or journal. No tutorial text, and no explaining what the player can already see.
10. **Layer the secrets.** Some should be found in the first five minutes, some in the first hour, and some only by dedicated players. Use night and weather to multiply them.
11. **Combos must be guessable.** Base them on what the ingredients look like and do. If a combo can only be found by brute force, cut it or add a hint.
12. **Failed experiments are funny.** A wrong combo produces a gag, not a blank.
13. **Bugs choose, the player interferes.** Bugs run on personality-weighted drives. Objects advertise to them, and bugs pick among top options with some randomness.
14. **Yes, and.** Bug autonomy never undoes what the player just set up. Bugs react to what the player did and build on it.
15. **Slapstick always recovers.** Flung, dunked or slimed bugs bounce back within seconds, dizzy or grumpy but fine. The world tidies itself enough that mischief can be repeated.
16. **Personality shows in reaction.** Each bug reacts differently to the same thing: being flung, rain, music, a new toy, the camera. If two bugs react identically, one of them isn't finished.
17. **Bugs notice the player and each other.** They glance at the cursor, gather around new toys, gawk at crashes and interact with each other when left alone.
18. **Cute with a weird streak.** Every area needs at least one thing that is a bit strange, gross or deadpan. Never baby talk, never praise for trivial actions, never condescension.
19. **Gross is cartoon gross.** Burps, slime and stink clouds are welcome. Bugs react to them too. Nothing realistic, nothing aimed at a character's dignity.
20. **Unlock by discovery, not by grind.** Areas and bugs open because the player figured something out. No counters to fill, no random drops gating progress.
21. **Be generous early.** The first ten minutes hand over a full toybox. A new player should find at least one secret before they think to look for one.
22. **The journal notices and remembers.** Discoveries record automatically, show silhouettes for missing entries, use the player's own photos, and celebrate in under a second.
23. **Keep something visible but unexplained.** At every point in play there should be a mystery on screen that pulls the player forward.
24. **Music can't sound wrong.** Every music toy is locked to the area's key and tempo. Bugs dance or sing along.
25. **Make photo-worthy moments.** Bugs pose, photobomb or hide from the camera. Stickers and frames match the game's humor.

### Anti-patterns to avoid

- Scores, coins, stars, streaks, daily login rewards and any currency that pays the player for playing.
- Random reward reveals, spinning wheels, blind boxes or anything that uses a variable-ratio schedule to gate progress.
- Needs that decay while the game is closed, or any "your bug is sad because you left" guilt mechanic.
- Pop-up praise for trivial actions ("Great job dragging!"). Condescending tutorial text and arrows pointing at obvious things.
- Baby talk voices, nursery-rhyme music everywhere, or UI that looks like a toddler app.
- Arbitrary combos that can only be solved by looking them up.
- Interactions that work in one place and silently fail somewhere similar.
- Constant screen shake or particle spam that makes big moments indistinguishable from small ones. No motion-reduction option.
- Physics that jitters, tunnels or traps objects forever. Funny-weird is fine, broken is not.
- Bugs that ignore the player, or that undo the player's setup the moment they look away.
- Humiliation that sticks. A character left crying, hurt or permanently changed against its will.
- Modal celebrations that block play for more than a second.
- Blank "nothing happens" responses to experiments.
- Locking fun behind long unlock chains so the starting area feels empty.
- Anything tied to romance, dating, playing house or teen drama, per the locked decisions.

## Sources

- Hunicke, LeBlanc, Zubek, "MDA: A Formal Approach to Game Design and Game Research": https://users.cs.northwestern.edu/~hunicke/MDA.pdf
- MDA framework overview: https://en.wikipedia.org/wiki/MDA_framework
- Nicole Lazzaro, The 4 Keys 2 Fun: https://www.nicolelazzaro.com/the4-keys-to-fun/
- Yu-kai Chou on Lazzaro's four keys: https://yukaichou.com/behavioral-design/4-keys-2-fun-part-1-4/
- Roger Caillois, Man, Play and Games: https://en.wikipedia.org/wiki/Man,_Play_and_Games
- "Making Sense of Play in Video Games: Ludus, Paidia, and Possibility Spaces", Eludamos: https://septentrio.uit.no/index.php/eludamos/article/download/vol7no1-4/7-1-4-html?inline=1
- Ryan, Rigby, Przybylski, "The Motivational Pull of Video Games: A Self-Determination Theory Approach" (2006): https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf
- Deci, Koestner, Ryan, meta-analysis of extrinsic rewards and intrinsic motivation: https://pubmed.ncbi.nlm.nih.gov/10589297
- Overjustification effect: https://en.wikipedia.org/wiki/Overjustification_effect
- Kill Screen, "The secret to smart kids entertainment? Give them a toy, not a game": https://www.killscreen.com/secret-smart-kids-entertainment-give-them-toy-not-game/
- Motionographer, "The design process behind Toca Boca's infectious apps": https://motionographer.com/2016/04/27/the-design-process-behind-toca-bocas-infectious-apps/
- Toca Boca: https://en.wikipedia.org/wiki/Toca_Boca
- PC Gamer, Townscaper's "radically casual" design: https://www.pcgamer.com/townscapers-developer-on-how-its-radically-casual-design-is-inspiring-a-new-wave-of-low-stress-builders-to-adapt-the-blueprint/
- Townscaper: https://en.wikipedia.org/wiki/Townscaper
- Game Developer, "Building thousands of tiny interactions into Hidden Folks": https://www.gamedeveloper.com/design/building-thousands-of-tiny-interactions-into-i-hidden-folks-i-
- Behind the Game: Hidden Folks: https://medium.com/@stefanlesser/behind-the-game-hidden-folks-e6198dfa885a
- NME, Chicory developer reveals hidden details: https://www.nme.com/news/chicory-a-colourful-tale-dev-reveals-thread-of-hidden-details-and-secrets-2973432
- Game Developer, "Behind the HONK: An Untitled Goose Game Q&A": https://www.gamedeveloper.com/design/behind-the-honk-an-i-untitled-goose-game-i-q-a
- Untitled Goose Game: https://en.wikipedia.org/wiki/Untitled_Goose_Game
- Club Penguin secret rooms: https://clubpenguin.fandom.com/wiki/Secret_Rooms
- Terraria secret world seeds: https://terraria.wiki.gg/wiki/Secret_world_seeds
- Minecraft Forum, crafting discovery vs. internet recipes: https://www.minecraftforum.net/forums/minecraft-java-edition/discussion/2301579-crafing-items-discovery-vs-internet-recipes
- Viva Piñata romance and requirements: https://vivapinata.fandom.com/wiki/Romance
- Animal Crossing museum: https://nookipedia.com/wiki/Museum
- Neko Atsume design breakdown: https://alexiamandeville.medium.com/game-design-breakdown-the-simplicity-of-neko-atsume-a8616a937a47
- GeekWire on Neko Atsume: https://www.geekwire.com/2016/app-of-the-week-tame-your-cat-craving-with-neko-atsume-aka-kitty-collector/
- Little Alchemy 2 and combination games: https://www.criticalhit.net/gaming/little-alchemy-2-and-the-games-built-on-combining-elements
- Engadget, Breath of the Wild GDC talk: https://www.engadget.com/2017-03-12-breath-of-the-wild-gdc-talk.html
- Thumbsticks, BotW chemistry and "clever little lies": https://www.thumbsticks.com/gdc-17-breath-of-the-wild-science-lies/
- Road to the IGF: Noita: https://www.gamedeveloper.com/game-platforms/road-to-the-igf-nolla-games-i-noita-i-
- 80.lv, Noita falling-sand simulation: https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation
- Scribblenauts: https://en.wikipedia.org/wiki/Scribblenauts
- Super Scribblenauts adjectives: https://en.wikipedia.org/wiki/Super_Scribblenauts
- Jonasson and Purho, "Juice it or lose it" (GDC Europe 2012): https://www.youtube.com/watch?v=Fy0aCDmgnxg
- GDC Vault, Juice It or Lose It: https://www.gdcvault.com/play/1016487/juice-it-or-lose
- Jan Willem Nijman, "The art of screenshake": https://www.youtube.com/watch?v=AJdEqssNZ-U
- Steve Swink, Game Feel, chapter 1: http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf
- Game feel: https://en.wikipedia.org/wiki/Game_feel
- Mark Brown, "The Genius AI Behind The Sims": https://gmtk.substack.com/p/the-genius-ai-behind-the-sims
- PC Gamer, Will Wright on the original Sims AI: https://www.pcgamer.com/games/the-sims/will-wright-says-the-original-sims-ai-was-actually-too-good-almost-anything-the-player-did-was-worse-than-the-sims-running-on-autopilot/
- Nintendo, Ask the Developer Vol. 10, Pikmin 4: https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-10-pikmin-4-part-3/
- Tamagotchi effect: https://en.wikipedia.org/wiki/Tamagotchi_effect
- Mental Floss, history of the Tamagotchi: https://www.mentalfloss.com/fun/toys/tamagotchi-history
- Shimeji-ee desktop pet: https://kilkakon.com/shimeji/
- Goat Simulator: https://en.wikipedia.org/wiki/Goat_Simulator
- TheGamer, Human Fall Flat interview with Tomas Sakalauskas: https://www.thegamer.com/human-fall-flat-interview-tomas-sakalauskas/
- Katamari Damacy: https://en.wikipedia.org/wiki/Katamari_Damacy
- Keita Takahashi: https://en.wikipedia.org/wiki/Keita_Takahashi
- Slime Rancher: https://en.wikipedia.org/wiki/Slime_Rancher
- Gapsy, UX design for kids, on tweens: https://gapsystudio.com/blog/ux-design-for-kids/
- Toca Boca age suitability: https://playgama.com/blog/game-faqs/what-age-group-is-toca-boca-suitable-for/
- Quora, teens who still play Toca Boca: https://www.quora.com/Is-it-normal-to-be-a-teenager-and-still-be-interested-in-kids-games-movies-shows-I-m-16-but-I-still-really-like-playing-games-like-toca-boca-and-roblox-and-movies-and-cartoons-for-kids-I-feel-kinda-weird-having
- Incredibox FAQ: https://www.incredibox.com/info/faq
- Incredibox makes beatmaking feel like play: https://webiano.digital/incredibox-makes-beatmaking-feel-like-play/
- GameSpot, New Pokémon Snap review: https://www.gamespot.com/reviews/new-pokemon-snap-review-nintendo-switch/1900-6417668/
- Systematic review, dark patterns and random reward mechanisms in youth: https://www.sciencedirect.com/science/article/pii/S1875952126000443
- Rare loot box rewards and arousal: https://pmc.ncbi.nlm.nih.gov/articles/PMC7882574/
