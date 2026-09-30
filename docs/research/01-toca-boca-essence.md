# Research 01: the essence of Toca Boca

This document looks at what Toca Boca makes, why it works, where it falls short, and what Bugglebrook should take from it. It's meant to be read next to `docs/00-decisions.md`. Where the decisions file and Toca's habits disagree, the decisions file wins. The biggest gap is audience. Toca designs for roughly ages 4 to 9, and Bugglebrook is for 13-year-olds.

Sources are listed at the end. Claims that come from a specific interview or review are attributed in the text. A few observations about how Toca Life games behave come from general familiarity with the apps and are marked as such.

## 1. What Toca Boca is and what it believes

### The company

Emil Ovemar and Björn Jeffery founded Toca Boca in Stockholm in July 2010. Both came from an innovation group inside the Swedish media company Bonnier, which owned the studio at first. The first app, Helicopter Taxi, shipped in March 2011. Toca Kitchen, Toca Hair Salon, Toca Train, Toca Builders and many others followed over the next few years, each a small paid app built around one play idea. Bonnier sold Toca Boca and its sister studio Sago Sago to Spin Master in 2016.

The line splits into three eras.

1. **Single-toy apps, 2011 to about 2015.** Toca Kitchen, Hair Salon, Band, Builders, Lab, Nature, Tea Party, Store, Doctor and more. Each cost a few dollars and did one thing.
2. **Toca Life, 2014 to 2018.** Location-based dollhouse apps such as Town, City, School, Hospital and Vacation. Each held a small set of rooms, characters and props.
3. **Toca Life World, later renamed Toca Boca World, from 2018.** A free app that merged all the Toca Life locations into one map, sold new locations as in-app purchases, and added a Character Creator, a Home Designer and weekly gifts. The company says it has more than 90 locations, 500 characters and 60 million players. In 2023 the older single-toy apps moved into a subscription bundle, and in 2024 Toca announced a multiplayer 3D game, Toca Boca Days.

Across all three eras, Toca's apps have been downloaded more than a billion times.

### "We make toys, not games"

This is the idea every interview comes back to. Ovemar told PocketGamer.biz: "We don't make games: we make toys. We also design for kids, not girls or boys." In a Vice profile the team described it this way: "you tap it, touch it, and it will reveal itself, and just like all good toys you don't need instructions."

In practice a Toca "toy" has:

- No win state, score, levels, lives, leaderboard or game-over screen.
- No timers or pressure loops. Jeffery has spoken about deliberately avoiding "artificial timers, pressure loops, and mechanics that demand children's attention," and a Gulf News profile quotes the team: "We wanted no stress and especially no stressy music."
- No required order of actions. The kid supplies the goal.
- No instructions. You learn it by poking at it.

Jeffery's argument for the age range is developmental: "before the age of nine, children are much less concerned with objectives and are content to simply play for the sake of playing" (EdSurge), and "After the age of nine children react differently to games and take on the mindset we're familiar with as adults" (Gulf News). **This matters for Bugglebrook.** Toca itself thinks its pure-toy formula weakens with older kids. A 13-year-old will want some goals to chase, which is why the decisions file adds secrets, a journal, combos and unlocks on top of the sandbox.

### A frame for play

A developer who watched his daughters play Toca Town put it well. The app is "a frame for play, a playground that is filled with toys," and the player has to "create the reasons and the meaning in your imagination." His kids started with a shopping trip, which became a picnic, then a beach trip, then an overnight camping trip with moonlight swimming. The app didn't suggest any of that. It gave them a shop, a park, food, a campfire and characters who would go anywhere.

Toca's job, then, is to provide good props and rooms and characters who respond. The story belongs to the player.

### Other stated principles

- **Weird and a little imperfect.** "Not everything should be like Disney and Apple. Those are too perfect; we want our things to have flaws, and to be a bit weird, while also referencing the everyday" (Vice). Motionographer describes worlds "grounded in everyday realities... there is still dirt in the corners," with "a weird, quirky element" added on purpose.
- **Safe but not sterile.** Art director Karin Hagen described the goal as an "authentic representation of the real world," one that is "not as chaotic as the real world, but safe in a way" (Crossplay). They avoid generic "teddy bears and unicorns" kid imagery.
- **Gender neutral.** "All the apps are unisex... All the characters can wear dresses." Jeffery: "we make toys for kids, and let them choose."
- **A small, polished core.** Ovemar: "Have confidence in the core of your product. Don't worry about features... It's hard to relax and believe in the small but polished core but it is always the right decision."
- **Kids in the loop.** Toca employs "play designers" instead of game designers, meaning someone on each team whose job is the kid's perspective. It tests paper prototypes with children early and again three or four times during development, and it watches reactions instead of asking questions. "Kids have all the answers. Just put your product in their hands and observe." Toca Tea Party started as paper cutouts on an iPad.
- **Trust.** For years the studio refused third-party ads and in-app purchases in kids' apps, on the argument that the business model shapes the mechanics.

## 2. Core mechanics and interaction patterns

Toca's mechanical vocabulary is small. What makes it feel rich is how many objects respond to the same few gestures. The patterns below are grouped by what they do.

### Direct manipulation

- **Everything that looks loose can be picked up.** Food, tools, clothes, furniture in the Toca Life apps, and the characters themselves are all draggable. Anything that looks like a background is actually background, and the difference is clear from the art.
- **Characters are toys too.** You drag them by the body and they dangle, then drop into place. In Toca Life they snap into chairs, beds, car seats and bathtubs when released near them (general observation).
- **Anything can go in a character's hand.** In Toca Life, dragging an object onto either hand makes the character hold it. The character keeps holding it when you move them, including to another location. This one rule does a lot of work, because every object becomes a story prop.
- **Drag to the mouth to feed.** Food and drink dragged to a character's face get eaten or drunk with a chewing animation. In Toca Kitchen, feeding is the central loop.
- **Tools act on contact.** In Hair Salon you drag scissors, clippers, a grow tool, curling and straightening irons, sprays, a shower head and a blow-dryer across the hair. Whatever the tool touches changes right away. The blow-dryer ripples the character's cheeks.
- **Tools transform objects.** Toca Kitchen offers a knife, food processor, pot of water, frying pan and microwave. Drag food onto one and you see it change: it browns in the pan and steams in the pot. Toca Lab uses the same pattern for science. A centrifuge, Bunsen burner, oscilloscope, test tubes and cooling agents are each worked by swiping, tapping or holding, and each one turns an element into another element.
- **Place things in slots.** In Toca Band you drag any of 16 musicians onto a stage with tiers. A higher tier makes that musician play a busier part, and a special "star" spot plays that character's solo. Placing a character is the whole interface.
- **Paint and terrain tools.** Toca Nature lets you raise mountains, dig lakes and plant forests of oak, pine or birch. Toca Builders has six robots, each doing one job: one lays blocks, one crushes them, one lifts blocks up high, one paints, one rolls paint on the ground, one places blocks in midair.

### Response and feedback

- **Characters react with faces and sounds.** This is the most important pattern. Hair Salon characters grimace, giggle and make noises while you work, and they show displeasure when shaved bald. Toca Lab's element blobs change expression as you heat, cool or spin them.
- **Characters have preferences.** In Toca Kitchen the four eaters are a boy, a girl, a cat and a bull, and each likes and dislikes different things. The bull eats hay that the others refuse. The cat loves raw meat, which the others won't touch. Rejected food gets spat out or dropped. Kids find these rules by trying things, and working them out is a quiet goal without any text.
- **Extreme inputs get extreme reactions.** Kitchen characters sneeze, cough smoke, or faint if you feed them something extreme. Pushing a system to its limit always pays off with a bigger, funnier reaction.
- **Thought bubbles hint at wants.** Toca Nature's animals show a picture of the food they want, such as berries or acorns, in a thought balloon. That tells the player what to do without any words.
- **The world responds to changes.** In Toca Nature, planting enough of one kind of tree makes the matching animal move in, and cutting the trees down can drive it away. Cause and effect play out over a few seconds.
- **Toggles everywhere.** In the Toca Life apps, taps turn on TVs, lamps, faucets, toilets, stoves and vending machines, and open doors, drawers, fridges and cupboards (general observation, confirmed in part by the Toca Town writeup that mentions the TV, laptop and toilet).

### Discovery and secrets

- **Hidden spots in plain sight.** The Toca Life World tips guides list things like tapping bushes in one location to reveal a hiding spot, tapping tree branches in the park to find hidden eggs, a sloth costume behind a "No Sloth" poster, and flowers inside a mall cupboard.
- **Secret compartments, puzzles and codes.** The fan wiki sorts secrets into hidden compartments, small puzzles and number codes found on walls and posters. One example is a hospital compartment that opens with a three-digit code found elsewhere.
- **Combination secrets.** Bringing a specific character to a specific place with a specific item triggers something. The guides describe putting a sponge from a kitchen cupboard together with a character named Zeke to make a "spa crumpet," and "secret pets" that appear only for certain combinations of character and held item. The Gift Machine combines a pet and a robot into a robot pet.
- **Collectible series.** Crumpets and gems are recurring hidden collectibles, which gives completionists something to hunt.
- **Timed gifts.** Toca Boca World hands out a free gift at the Post Office every week, with better gifts on Fridays. Players found they could get extra gifts by restarting the app, and the community shares that trick widely.

### Output and sharing

- **Photo mode.** Hair Salon lets you pick a backdrop and take a photo of your finished character. Toca Nature has an in-world camera that saves wildlife photos to the device's camera roll.
- **Recording.** Toca Life World can record a narrated video of a scene as you play it. Toca Dance records a performance so you can play it back.
- **Custom content.** The Character Creator and Home Designer let players make their own characters and spaces, which kids then share on TikTok and YouTube.

## 3. Anatomy of a Toca playset

Put a Toca Life location and a single-toy app side by side and the same parts show up. A Bugglebrook "area" should have all of them.

1. **A place.** One or a few side-by-side rooms, drawn as a cutaway, scrolled horizontally. Every place has a clear everyday theme: salon, kitchen, hospital, school, park. The theme tells the player what kinds of stories fit without any text.
2. **A cast.** A handful of characters with distinct looks and a bit of personality. In the single-toy apps personality comes through reactions, like Kitchen's picky bull or Builders' robots. In Toca Life it mostly comes through looks. The cast is the audience for everything the player does.
3. **Props.** Dozens of loose objects that fit the theme, plus a few that don't, for comedy. Each prop needs a way to be picked up, a way to be held, and ideally at least one special behavior: edible, wearable, usable as a tool, able to switch on, or able to combine with something.
4. **Containers.** Drawers, fridges, closets, boxes and bags that hold props. They double as hiding places for secrets and make the room feel bigger than it looks.
5. **Stations.** Objects that do something to whatever you put in them, such as a pan, blender, shower, salon chair, centrifuge or bed. These drive most of the cause and effect.
6. **Toggles.** Lights, TVs, taps and switches. Cheap to build and they make the place feel alive.
7. **A reaction system.** Faces, sounds and small animations that play whenever a character is fed, touched, dropped, changed or handed something. The reactions need variety, because the same grunt every time gets old fast.
8. **Preference rules.** Hidden likes and dislikes, one per character or per object pair, that the player can work out by testing.
9. **Secrets.** Hidden spots, combinations, codes and rare collectibles. Several per location, at different levels of difficulty.
10. **Customization.** Clothes, hair, colors and accessories, so the player can put their own mark on the cast.
11. **Persistence and travel.** In Toca Life World, objects and characters stay where you left them, and you can carry them from place to place. That's what turns separate rooms into a world.
12. **Capture.** A photo or recording button so the player can keep and share what they made.

The single-toy apps (Kitchen, Hair Salon, Lab) use a narrow slice of this list: one station-heavy room, a small cast and a strong reaction system. The Toca Life apps use the whole list but spread each part thinner.

## 4. Depth, replayability, and where Toca is shallow

### What brings kids back

- **Self-authored stories.** The Toca Town example shows the main engine. The toys stay the same but the stories are new every session. Replay value comes from the player's imagination, which only works if there are enough props and places for stories to use.
- **Combinatorial variety.** Twelve foods, five cooking methods and four eaters give hundreds of outcomes from a small amount of content. Hair Salon's tools stack on each other in the same way. The design lesson is to build a few systems that multiply, not lots of one-off content.
- **Rules you can learn.** Working out what the bull likes, or which tree brings which animal, gives a light sense of mastery with no failure attached.
- **Secrets and collectibles.** Hidden items, crumpets, secret pets and the gift machine give older and more goal-driven players something to hunt. Toca added these as the audience grew up with Toca Life World.
- **Comfort through repetition.** EdSurge compares Toca's appeal to kids rewatching a favorite movie. Predictable responses are part of the pleasure.
- **Social creation.** Tweens and teens now use Toca Boca World as a stage for roleplay videos on TikTok. That's the main way the brand has held on to kids past Toca's own target age.

### Where it's shallow, according to critics and parents

- **Short shelf life for single toys.** A teacher reviewing Toca Lab said it "lacks the depth needed to make students want to come back to it again and again": once students "have figured out all the different ways to alter the element," they move on. Toca Band has one four-bar, four-chord loop, and a reviewer wanted recording, per-character volume and tap-to-mute. The one-idea apps run out once the idea is fully explored.
- **Same interactions everywhere.** Common Sense Media says of Toca Life World that "the essence of what's available in the school isn't all that different than what's available in the city." New locations are often new art over the same verbs.
- **Monosyllabic reactions.** A 148Apps reviewer found Toca Kitchen's characters odd at first, "an impression not helped by their monosyllabic grunts and gasps," though they grew on him. Thin reaction sets wear out.
- **Interface friction when it gets complicated.** Toca Builders' trackball camera and robot juggling were hard enough that a reviewer had to help a seven-year-old, and the six-block height limit frustrated players. Toca Kitchen's sequence of steps is "a bit complicated, especially for young kids." When Toca adds a layer of control, it loses the no-instructions promise.
- **Monetization in Toca Boca World.** The free app shows a shopping cart icon on screen at all times. Many locations and the full Character Creator are paid, with purchases ranging from $0.99 to over $50 for bundles. Parents on Trustpilot and Apple's forums report lost purchases and purchases that can't move between accounts. Defenders point out there are no energy systems or timers and purchases sit behind parent gates. Either way, it's a sharp change from Jeffery's 2014 line that the company had "strict policies against third-party ads and in-app purchases."
- **Weekly gift exploits.** The restart trick for Post Office gifts shows that a timed reward system invites gaming the clock. Bugglebrook has no timers or storefront, so it can skip this entirely.
- **Teen content drift.** Much of the older-kid roleplay on TikTok is about dating, school drama and romance. The Bugglebrook decisions file rules those themes out, so the design shouldn't lean on dollhouse props (beds, bathrooms, family roles) that invite them. Bugs, toys and experiments point the play toward slapstick and invention.

## 5. Visual, audio, and UX principles

### Visual

- **Bold, flat, readable shapes.** Toca's art uses bright flat color, simple shapes and a stylized low-detail look. The early apps are 2D. The later ones use flat-shaded low-poly 3D so they run on older devices.
- **Loose things look loose.** Pickable props are drawn as distinct objects against a calmer background, so a kid can tell at a glance what can be touched.
- **Faces are big and expressive.** The eyes and mouth carry most of the emotion. Toca plans animation early, starting at the character-concept stage with rough thumbnails and animation mood boards.
- **Everyday but a bit odd.** Real-world settings with small absurd touches, like a pizza costume or a dancer who turns into poop in Toca Dance.
- **Inclusive character design.** Toca Life World offers 16 skin tones, several body types, ages and wheelchairs. Bugglebrook's cast is bugs, so the equivalent is variety in shape, size and color, plus hats and accessories that fit every body.

### Audio

- **No stressful music.** Toca Nature's music is described as calm and "ethereal." The studio rules out "stressy music" entirely.
- **Every action makes a sound.** Chopping, sizzling, hair clipping, the blow-dryer, and the characters' grunts, gasps and "yums." Sound is half the feedback.
- **Voices without words.** Characters make noises that everyone understands without language, which keeps the apps usable in any country.
- **Music as a toy.** Toca Band shows that layering loops by placing characters is a complete toy. Each musician "fits with others like pieces of a musical puzzle," so any combination sounds good.

### UX

- **No text.** EdSurge notes that all the apps drop written instructions and rely on visual cues and trying things out.
- **No tutorial.** The first screen should make the first action obvious, such as a character standing next to a pile of food.
- **Instant feedback.** Every touch produces a sound, a movement or a face within a frame or two.
- **Undo instead of failure.** Hair Salon's grow tool undoes a bad haircut. Nothing is permanent enough to feel like a mistake.
- **Big targets and forgiving drops.** Objects snap to hands, seats and mouths when dropped roughly nearby.
- **Few modes.** When Builders asked players to manage several robots with a special camera control, kids got confused. Keep one tool per job and avoid hidden modes.
- **Hints through pictures.** Thought bubbles showing a wanted item do the work of a quest log.
- **Playful details for their own sake.** Toca's old website had a big yellow balloon that floated you back to the top of the page, a feature added "for no other reason than because it can be added."

## 6. Takeaways for Bugglebrook

Bugglebrook differs from Toca in three ways that shape everything below. The player is about 13, not 6. The game uses a mouse, not a touchscreen. And the world runs on real physics, so objects roll, stack, bounce and float instead of snapping to a floor. The checklist keeps what makes Toca work and adjusts for those differences.

### Must-have toy qualities

- [ ] **Everything loose is grabbable.** Every prop and every bug can be dragged, dropped and flung. If something looks loose and can't be moved, that's a bug.
- [ ] **Bugs hold things.** Drop any small object on a bug and it holds it, keeps it while walking around on its own, and carries it between areas.
- [ ] **Bugs eat things.** Drag something to a bug's mouth and it tries to eat it. Every bug has likes and dislikes. Dislikes produce a spit, a gag, a stink cloud or a burp, and never anything cruel.
- [ ] **Every bug reacts to everything.** Being picked up, dropped, flung, fed, painted, dressed, soaked, heated or handed a toy all get a face, a voice line and a body animation. Build at least three variants per reaction type so repeats don't feel canned.
- [ ] **Extremes pay off.** Fling harder and the bug bounces back dizzier. Feed it three hot peppers and it breathes fire and runs to the pond. Pushing a system further always gets a bigger, sillier result.
- [ ] **Stations transform things.** Each area needs several places that change what you put in them, like a compost lab cauldron, a pond splash zone, a paint puddle or a sunbeam. These are Bugglebrook's pan and microwave.
- [ ] **Toggles everywhere.** Lamps, faucets, radios, fans and trapdoors. Cheap to build and they make an area feel alive.
- [ ] **Containers hide things.** Flowerpots, drawers, tin cans, matchboxes and knotholes open when clicked. Some hold props and some hold secrets.
- [ ] **Undo, never fail.** Paint washes off in the pond. A bug stuck on the roof eventually climbs down. A broken contraption can be pulled apart. There's no bad ending anywhere.

### Systems that multiply

- [ ] **Few verbs, many objects.** Aim for a small set of shared interactions (hold, eat, wear, use on, put in, combine, toggle) that every object in the game plugs into. Toca Life World's weakest point is new locations that add art but no new verbs. Each Bugglebrook area should add at least one new station or verb, not just a new backdrop.
- [ ] **Physics as a toy.** Toca never had real physics. It's Bugglebrook's biggest advantage over the source material, and it answers the "shallow" criticism directly, because ramps, springs, marble runs and stacking produce endless new situations from fixed content.
- [ ] **Autonomous bugs.** Toca characters stand still until you touch them. Bugglebrook bugs wander, get curious about objects, use toys, bump into each other and react to weather. That gives a 13-year-old something to watch and mess with, and it makes the world feel lived in when they come back to a save.
- [ ] **Music that always sounds good.** Follow Toca Band's approach. Every instrument toy and sequencer step should fit the area's key and tempo, so any arrangement works. Include the per-voice mute and recording that reviewers asked Toca Band for.

### Secrets and goals for an older player

Jeffery's own view is that pure goal-free play fades after about age nine. A 13-year-old needs things to chase, but without timers, scores or failure.

- [ ] **Layered secrets per area.** A few easy ones that are hidden but visible, such as a cupboard with something inside. A few medium ones that are combinations, like a specific bug plus a specific item at a specific station. At least one hard one per area that needs night, rain, a code found in another area, or a chain of steps.
- [ ] **Discoverable combos.** "Mix X with Y" recipes at stations are the main goal system. Hints come as pictures. For example, a bug might think about an item it wants, the way Toca Nature's animals do.
- [ ] **A journal that fills in.** Silhouettes for undiscovered bugs, items, combos and secrets, filled in with pictures when found. That gives completionists a target, the way crumpets and secret pets do in Toca Boca World, without any store attached.
- [ ] **Unlockable areas and bugs.** Hidden cast members appear when their secret is found. That's more exciting for a 13-year-old than a free weekly gift and doesn't encourage cheating the clock.
- [ ] **No storefront, no gift timers.** Bugglebrook has no reason to copy Toca Boca World's monetization or its exploitable weekly gifts.

### Tone: weird and silly, never mean

- [ ] **Everyday setting, absurd details.** A backyard is ordinary. A beetle wearing a thimble as a helmet while drinking pond water through a straw is not. Toca's "dirt in the corners" fits a garden naturally.
- [ ] **Gross-out that stays friendly.** Burps, slime, stink clouds and spitting out food are straight from Toca Kitchen's playbook, pushed a bit further for an older audience.
- [ ] **Slapstick with a quick recovery.** A flung bug bounces, looks dizzy with stars circling, shakes it off and goes back to what it was doing. It never shows real hurt, sadness or fear that lingers.
- [ ] **Stay away from dollhouse drama.** Pick props and places that lead to experiments, contraptions and pranks, and leave out bedrooms, family roles and anything that invites romance plots.

### Visual, audio, and UX rules adapted for mouse and age 13

- [ ] **Nearly wordless.** Icons, pictures in speech bubbles and gibberish voices. The journal gets short labels only.
- [ ] **Hover feedback.** The mouse gives Bugglebrook something a touchscreen can't: the cursor can change over grabbable things, and bugs can glance at the cursor as it moves. Use that to show what's interactive without text.
- [ ] **Forgiving drops.** Snap held items to hands and food to mouths within a generous radius, even though the rest of the world runs on physics.
- [ ] **Instant, layered feedback.** Every click or drop gets a sound, a squash-and-stretch and a face within a frame or two.
- [ ] **Bold flat art with big faces.** Thick outlines, bright colors, and eyes and mouths large enough to read at a distance. Loose props should stand out from the background.
- [ ] **Calm music, loud reactions.** Generative background music stays relaxed and never builds tension. Comedy lives in the sound effects and voices.
- [ ] **Photo mode as the capture tool.** Toca's photo and recording features are how kids keep and share what they made. Bugglebrook's photo mode with stickers and frames fills the same role, and older kids will use it more.
- [ ] **One tool per job.** Avoid the Toca Builders problem. No modes and no camera controls that need explaining. Scroll moves between areas, drag moves things, click toggles things.
- [ ] **Test with real 13-year-olds if possible.** Toca's rule was to watch kids play and not ask them questions. Any reaction that gets no laugh on the third try needs another variant or should be cut.

## Sources

- [Toca Boca, Wikipedia](https://en.wikipedia.org/wiki/Toca_Boca)
- [Toca Boca World, official site](https://www.tocaboca.com/toca-boca-world)
- [Child's play: How Toca Boca is leading the kid app revolution, PocketGamer.biz](https://www.pocketgamer.biz/childs-play-how-toca-boca-is-leading-the-kid-app-revolution/)
- [Child's play: Free-to-play is a no-no when it comes to apps for kids, says Toca Boca's Emil Ovemar, PocketGamer.biz](https://www.pocketgamer.biz/childs-play-free-to-play-is-a-no-no-when-it-comes-to-apps-for-kids-says-toca-bocas-emil-ovemar/)
- [Meet Toca Boca, the 'Toy' Developer Dominating the App Store, Vice](https://www.vice.com/en/article/meet-toca-boca-the-disney-destroyers-of-the-app-store-831/)
- [The design process behind Toca Boca's infectious apps, Motionographer](https://motionographer.com/2016/04/27/the-design-process-behind-toca-bocas-infectious-apps/)
- [Toca Boca makes the kind of games kids can't possibly beat, Tech.eu](https://tech.eu/2014/05/20/toca-boca-kids-apps-profile-video-interview/)
- [Interview with Björn Jeffrey, CEO of Toca Boca, funambulism](https://funambulism.com/2014/02/28/interview-with-bjorn-jeffrey-ceo-of-toca-boca/)
- [#Kidtech Episode 14: Bjorn Jeffery, SuperAwesome](https://www.superawesome.com/blog/kidtech-episode-14-bjorn-jeffery-former-ceo-of-toca-boca/)
- [#25: Björn Jeffery on Toca Boca, Casino Capitalism, And Changing Perspectives, podcast](https://podcasts.apple.com/us/podcast/25-bj%C3%B6rn-jeffery-on-toca-boca-casino-capitalism-and/id1818525189?i=1000752839256)
- [Toca Boca glory: game apps children love even though they can't win, Gulf News](https://gulfnews.com/technology/consumer-electronics/toca-boca-glory-game-apps-children-love-even-though-they-cant-win-1.1328450)
- [What's Driving Toca Boca's 100 Million Downloads?, EdSurge](https://www.edsurge.com/news/2015-09-18-understanding-the-toca-boca-phenomenon)
- [Learning about playfulness from Toca Boca and my kids, Game Developer](https://www.gamedeveloper.com/design/learning-about-playfulness-from-toca-boca-and-my-kids)
- [Toca Boca, Gender Norms, and the Rise of the Digital Dollhouse, Crossplay](https://www.crossplay.news/p/toca-boca-gender-norms-and-the-rise)
- [Toca Kitchen app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-kitchen)
- [Toca Kitchen review, 148Apps](https://www.148apps.com/toca-kitchen/toca-kitchen-review/)
- [Toca Hair Salon 4 app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-hair-salon-4)
- [Toca Lab: Elements app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-lab-elements)
- [Toca Lab: Elements review for teachers, Common Sense Education](https://www.commonsense.org/education/reviews/toca-lab-elements)
- [Toca Nature app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-nature)
- [Toca Nature review, 148Apps](https://www.148apps.com/toca-nature/toca-nature-review/)
- [Toca Builders review, Gamezebo](https://www.gamezebo.com/reviews/toca-builders-review/)
- [Toca Builders app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-builders)
- [Toca Band review, 148Apps](https://www.148apps.com/toca-band/toca-band-review/)
- [Toca Band app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-band)
- [Toca Life World app review, Common Sense Media](https://www.commonsensemedia.org/app-reviews/toca-life-world)
- [Secrets, Toca Life: World Wiki](https://toca-life-world.fandom.com/wiki/Secrets)
- [Toca Life World secrets, 9meters](https://9meters.com/entertainment/games/toca-life-world-secrets)
- [Toca Life World tips and tricks, BlueStacks](https://www.bluestacks.com/blog/game-guides/toca-life-world/tlw-tips-tricks-en.html)
- [Toca Life World beginner's guide, BlueStacks](https://www.bluestacks.com/blog/game-guides/toca-life-world/tlw-beginner-guide-en.html)
- [Is your child playing Toca Boca World?, Bitdefender](https://www.bitdefender.com/en-us/blog/hotforsecurity/is-your-child-playing-toca-boca-world-heres-what-you-should-know)
- [tocaboca.com reviews, Trustpilot](https://www.trustpilot.com/review/tocaboca.com?page=2)
- [Toca Boca stories and roleplay, thetocabocalife.com](https://thetocabocalife.com/toca-boca-stories)
