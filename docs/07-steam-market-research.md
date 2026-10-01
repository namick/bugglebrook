# Bugglebrook: Steam and market research

Researched on 2026-10-01. Review counts and prices come from Steam's public store API on that day. Third-party sales figures are estimates and are marked as such. None of this is legal or tax advice. Section 8 lists questions to take to a lawyer and an accountant.

## Executive summary

**The short answer.** Bugglebrook can go on Steam for $100. The artist is 17 and turns 18 within months, well before an autumn 2027 launch. At 18 she can sign Valve's distribution agreement herself and be the publisher, so the game, its income, and its track record can be hers. Until her birthday, a parent can hold the Steamworks account and move the game to her account later with Valve's transfer tool. Either way she owns her art and is credited and paid for it. Most small Steam games earn very little. This one has to beat the odds with her art, a clear hook, and about a year of steady posting.

| Key number | Figure |
|---|---|
| Steam Direct fee | $100 per game, paid back once the game earns $1,000 |
| Valve's cut | 30% up to $10M per game, 25% from $10M to $50M, 20% above |
| Lead time | 21 days from fee to release; Coming Soon page up at least 2 weeks; each review takes 3 to 5 business days |
| Games released on Steam in 2025 | About 20,000 |
| 2025 releases that earned under $1,000 | About 66%, by Gamalytic-based estimates |
| Median gross for games priced $10 or more | About $17,000, from Gamalytic's 2023 analysis |
| Wishlists to sales | 0.1 to 0.2 first-week sales per wishlist; year one is 2x to 5x the first week |
| Reviews to sales | About 30 copies per review, range 20 to 50 |
| Net per $9.99 copy, on average | About $3.50 after discounts, regional prices, refunds, taxes, and Valve's cut |

**Closest comparables.**

| Game | Price | Steam reviews | Est. copies | Lesson |
|---|---|---|---|---|
| Wobbledogs, 2022 | $19.99 | 15,389 | 300k to 770k | A weird physics creature toy can be a hit, with a publisher and a strong hook |
| Garden Galaxy, 2022 | $9.99 | 2,671 | 50k to 130k | What one developer's cute sandbox can do when it works |
| Bugaboo Pocket, 2025 | $19.99 | 341 | 7k to 17k | Cute bug game, good reviews, small reach. The common result. |
| Odd Dorable, 2025 | $4.99 | 72 | 1k to 4k | A dad's game made from his daughter's drawings. The story didn't sell it. |
| Battle Princess Madelyn, 2018 | $19.99 | 156 | 3k to 8k on Steam | Dad and daughter, wide press, a $212k CAD Kickstarter, modest Steam sales |

**Realistic expectation.** In year one, about $2,000 to $50,000 gross on Steam. The low end is the most likely single outcome. The middle is reachable if the whole game gets her hand-drawn look and someone posts clips every week for a year. A breakout near Garden Galaxy's is possible, at maybe 1 in 10 or worse.

**Recommendations.**

1. Launch on Steam first, for Windows, macOS, Linux, and Steam Deck, at $9.99. Put up a Coming Soon page once her first bugs are done, and enter one Next Fest with a demo.
2. Market to teens, adult cozy-game players, and parents, as a weird little bug toy hand-drawn by a young artist. Never call it a kids' game.
3. Settle the Suno question before launch. Steam requires a public AI disclosure for the music, and the cozy crowd this game needs is the most hostile to generative AI. Human-made music is the safe choice.
4. Put the family side in writing once she's 18: who publishes (she can), a license for whichever side's work the publisher doesn't own (her art or the parent's code), how money is split, a bank account in her name, and an hour each with a lawyer and a CPA.
5. Make the GitHub repo private before the store page goes up.
6. Plan for about 12 months and $500 to $4,500 in cash. Launch around autumn 2027.

---

## 1. Steam mechanics

### 1.1 Signing up, fees, and payouts

- **Account.** Sign up at partner.steamgames.com with a legal name that matches the bank account and tax records. An individual picks "Sole Proprietorship" and enters their own name as the company name.
- **Fee.** $100 per game, not refundable. Valve pays it back once the game passes $1,000 in adjusted gross revenue.
- **Tax interview.** A US person fills in a W-9 with an SSN or EIN. Valve says processing takes 10 to 15 business days.
- **Identity and bank.** Identity verification plus bank details in the same name.
- **Waiting period.** 21 days from paying the fee to release.
- **Payouts.** Monthly by ACH, about 30 days after the month of sales, once the balance passes $100.

### 1.2 Who can be the publisher?

Not a minor, in practice. Valve publishes no firm minimum age, but the account must belong to a legal entity that signs the Steam Distribution Agreement, completes the tax interview, and has a bank account in the same name. A 17-year-old can't make a binding contract. At 18 she can do all three herself: sign as a sole proprietor under her own name, or as her own LLC, with her SSN or the LLC's EIN on the W-9 and payouts to her own account.

She turns 18 within months, long before an autumn 2027 launch, so she can be the publisher. The question is whether she should.

| Option | Who signs with Valve | For | Against |
|---|---|---|---|
| She is a sole proprietor | She does, after 18, with her SSN or an EIN | Free and simple. The game, the income, and the Steam track record are hers. She owns her art outright and needs no license to herself. | The parent's code has to be licensed to her in writing. Liability is personal to her. She files a Schedule C and pays self-employment tax. |
| Her own single-member LLC | Her LLC | Same as above, plus a wall between the game's liabilities and her personal savings. A studio she can keep for later games. | About $50 to $500 to form, yearly fees in some states, more bookkeeping. Still needs the code license. An LLC protects little if she signs things personally or mixes money. |
| An LLC that she and the parent co-own | The LLC | Both contributions sit in one company, split by an operating agreement. A natural fit if this is the first of several games. | The most paperwork: an operating agreement, a partnership tax return each year, and decisions about votes, buyouts, and what happens if one of you leaves. Both must assign or license their work to the LLC. |
| The parent publishes and pays her a royalty | The parent, as sole proprietor or through the parent's LLC | The parent carries the liability and the admin. She doesn't have to deal with taxes, Valve, or support. | The business and its record are the parent's. Her income depends on a contract with a parent. Paying her wages no longer has the under-18 tax break once she's 18. |

The liability risk here is modest: an offline game that collects no data. The real exposure is an IP claim, most likely over the Suno music (section 8.5). Whoever publishes carries it, which is one more reason to settle the music first.

My recommendation: she publishes, as a sole proprietor at first, and forms her own LLC if the game starts earning real money or she plans more games. The parent licenses the code to her in writing, for a share of revenue or for nothing. That gives her the IP, the income, and a track record of her own. A co-owned LLC is the better choice if you both want a long-term studio. If she'd rather not run a business while finishing school, the parent publishes and pays her a royalty, which is still fair if it's in writing.

**Timing.** The roadmap puts the Steam fee and the Coming Soon page in January to March 2027.

- **Now, at 17.** Keep working, track who made what, and draft the agreements without signing them. If the store page needs to go up before her birthday, the parent can onboard, pay the $100, and build and publish the page.
- **After her birthday.** She opens a bank account in her name, gets an EIN if she wants one (free, and it keeps her SSN off forms), forms an LLC if that's the plan, and onboards to Steamworks herself. Then she signs the agreements.
- **Moving the game.** Steamworks has a Transfer Applications tool built for this ("if an individual forms a corporation and needs to move the game"). The current owner starts it, the recipient needs a fully onboarded partner account, which means paying her own $100 Steam Direct fee, and Valve approves it, usually within 2 to 7 business days. The store page, wishlists, followers, and reviews move with the game. The new owner sees sales data only from the transfer date, and payment rights move on a date the sender picks. Transfer before launch, so every sale and every tax form is in the publisher's name from the start.

If her birthday comes before you're ready to pay the fee, skip the transfer: she onboards and creates the app herself.

The store's "Developer" and "Publisher" fields are display names, so a studio name the two of you pick can stand in for the legal entity. Credit her by name or art handle in the credits, the store's About section, and the press kit. The art guide already plans `art/CREDITS.json` and a credits board.

### 1.3 Store page, release, wishlists, and Next Fest

The steps: pay the fee; build the page with exact-size capsules (920x430, 462x174, 1232x706, 748x896), five or more screenshots, a trailer, and tags; fill in the content survey; submit the page for a 3 to 5 business day review; keep it public as Coming Soon for at least two weeks, though 6 to 12 months is what actually builds wishlists; submit the build for its own review; release.

Steam emails wishlisters at launch and during sales, so wishlists predict launch sales. In June 2026 Valve raised the bar for the front page's "Popular Upcoming" list from about 7,000 wishlists to somewhere around 80,000 to 100,000, which shuts small games out of it. At the same time it added a personal calendar to the home page that recommends upcoming games to each user from their play history. Chris Zukowski of How to Market a Game calls the calendar good news for small games. For a game this size, visibility now comes from tags, Next Fest, and that calendar.

Steam Next Fest is a week-long demo festival held in February, June, and October. Entry needs a public store page, a playable demo by the start, and a release date after the fest. Each game gets one. Registration closes about seven weeks ahead: for October 2026 it closed August 31, with demos due September 28. The June 2026 fest had about 8,700 entries, so you only stand out with a good demo and wishlists already built.

### 1.4 Price, regional pricing, and refunds

Valve's 30% comes off sales after refunds, chargebacks, and VAT. Most copies sell at a discount or at a lower regional price, so plan on the average copy earning about half the US list price gross. At $9.99, that's about $5 gross and $3.50 to you.

Gamalytic found that 77% of Steam games sell under $10 and 5% over $20. Comparable toys sit at $5.99 to $19.99. With six areas, about 16 bugs, 67 secrets, crafting, potions, music toys, and photo mode, $9.99 is fair and leaves room for sale discounts. Accept Steam's suggested regional prices, which Valve updated in 2025.

Players can refund within 14 days if they've played under 2 hours, for any reason. That's the biggest business risk for a sandbox toy. Someone who has seen the main tricks in 90 minutes can get their money back, so new areas, bugs, and journal stamps should keep opening through the first two hours.

### 1.5 Steam Deck

Valve tests the Linux build if there is one and falls back to the Windows build under Proton. Reviews aim to finish within a week of a request. "Verified" needs a default controller setup that reaches everything, matching glyphs, legible text at 1280x800, and 30 fps at 800p. Bugglebrook does well on several of these. It's wordless, so glyphs and small text barely apply. Being mouse-only, it needs an official Steam Input layout, with the trackpad or right stick moving the hand and the triggers grabbing and panning. The touchscreen also works as a mouse. Frame rate needs measuring.

Electron has two known rough spots on Linux. Chromium needs libraries like CUPS that the Steam Linux Runtime lacks, and its GPU path has crashed under some Wayland setups. The simple route is to ship the Windows build and let the Deck run it through Proton, adding a native Linux depot only after testing it under the Steam runtime. Electron games have shipped this way: Vampire Survivors began as Phaser in Electron and is Deck Verified, and Cookie Clicker's Steam version runs on Electron.

### 1.6 Achievements and cloud saves from Electron

Cloud saves need no code. Steam Auto-Cloud syncs a folder you name in Steamworks, so point it at the save slots and `settings.json`.

Achievements need the Steamworks SDK through a Node library. steamworks.js is the best known, but its last release was August 2024 and users have reported overlay problems on Linux. steamworks-ffi-node is active, with a release on September 24, 2026, and is worth trying first. Greenworks is older but proven. Steam calls belong in the main process, behind the `window.bugglebrook` IPC bridge, which fits the existing architecture. The 67 journal secrets map neatly to achievements. The Steam overlay generally won't draw over a Chromium app, which this game can live without.

The Steam build should also turn off electron-updater, since Steam handles updates.

### 1.7 AI-generated content rules

Valve rewrote its AI disclosure rules on January 16, 2026. The content survey asks about two kinds of AI content. Pre-generated content is anything "created with the help of AI tools during development" that "ships with your game and is consumed by players", along with AI material in the store page and marketing. Live-generated content is made by AI while the game runs, and you must describe guardrails for it. Valve says efficiency gains from AI dev tools are "not the focus", and VGC reports that tools "such as code helpers do not require a disclosure". Answers appear publicly on the store page under "AI Generated Content Disclosure".

| Part of Bugglebrook | Disclose? |
|---|---|
| Suno background music | Yes. Players hear it. |
| AI-assisted code | No, under the current wording |
| Her hand-drawn art | No |
| Synthesized sound effects and voices | No. They're procedural code, not generative AI. |
| AI running in the game | None |

One trade report says Valve added required AI tags for each asset type in June 2026. It cites unnamed documents and I couldn't confirm it, so read the survey carefully when you fill it in.

The rules allow the Suno music. The audience is the bigger problem. A Quantic Foundry survey of about 1,800 gamers in late 2025 found 85% below neutral on generative AI in games, with 63% picking the most negative answer. Some games shrug it off: My Winter Car used AI heavily and has 11,000 reviews at 95% positive, but it sells to a very different crowd. About a fifth of June 2026 Next Fest entries disclosed AI. It costs the most with cozy, wholesome, and art-focused players, who are exactly the people a hand-drawn toy needs. Section 8.5 covers the licensing.

---

## 2. Content ratings and kids

**Steam.** The content survey generates regional ratings that show on the store page after release. With slapstick only, no chat, and no purchases in the game, Bugglebrook will rate at the bottom of every scale. Steam doesn't age-gate games like it.

**Other stores.** The Microsoft Store, Nintendo eShop, PlayStation Store, Google Play, and Epic use IARC, a free questionnaire that issues ESRB, PEGI, USK, and other ratings at once. Only a boxed retail release would need a paid ESRB rating.

**COPPA.** COPPA governs collecting personal information online from children under 13. The FTC's amended rule took effect June 23, 2025, with compliance due April 22, 2026. A game that collects nothing stays clear of it in practice. Keep it that way: no analytics, crash reporting, accounts, or uploads; photo mode saves only to the player's Pictures folder; electron-updater is off in the Steam build. Add a one-line privacy statement to the store page and press kit saying the game collects no data.

Steam requires users to be 13 or older. Younger children play through a parent's account or a Steam Families child account. So the buyers are teens and adults.

**Kids versus parents.** Under-13s don't buy on Steam, and advertising aimed at them brings extra rules: YouTube's "made for kids" setting turns off comments, and TikTok is 13+. Aim at teens, adult cozy-game fans, and parents. Keep "for kids" out of the store copy, because it invites "for little kids" reviews and puts off adult buyers.

---

## 3. Market and precedents

### 3.1 How the estimates work

Review counts and list prices come from Steam on 2026-10-01. Estimated copies use the Boxleiter method: reviews times about 30, range 20 to 50. Analysts' current consensus is about 30 for recent games, though GameDiscoverCo's own version averaged about 63 in 2025, which shows how loose it is. Estimated gross is copies times list price times 0.5, for discounts and regional prices. As a check, the method gives Tiny Glade about 745,000 copies, and its developers reported about 1 million. It undercounts older games and games sold on other platforms too. SteamSpy owner bands are shown where useful. SteamSpy has been unreliable since 2018.

### 3.2 Closest in scope and audience

Small, cute toys and sandboxes, mostly from one to three people.

| Game | Release on Steam | Price | Reviews, % positive | Est. copies | SteamSpy owners | Est. gross | Notes |
|---|---|---|---|---|---|---|---|
| Wobbledogs | Mar 2022 | $19.99 | 15,389, 98% | ~460k | 200k to 500k | ~$4.6M | Physics creature toy, one main developer plus publisher Secret Mode. Negatives: "not really a game, more a tech demo", "fun for about 6 hours". |
| Garden Galaxy | Dec 2022 | $9.99 | 2,671, 98% | ~80k | 50k to 100k | ~$0.4M | Solo developer. Other estimates say $500k to $660k gross. |
| Placid Plastic Duck Simulator | Jul 2022 | $1.99 | 20,291, 98% | ~610k | 200k to 500k | ~$0.6M | A pure toy that spread through memes and streamers. |
| Mosa Lina | Oct 2023 | $7.99 | 2,139, 96% | ~64k | 100k to 200k | ~$0.26M | Weird physics toy. |
| Bugaboo Pocket | Apr 2025 | $19.99 | 341, 85% to 90% | ~10k | under 20k | ~$0.1M | Cute bug pet. Covered by PC Gamer and GamesRadar. Negatives: "slow and boring", "tedious minigames". |
| Wattam | Dec 2020 | $19.99 | 600, 85% | ~18k | n/a | ~$0.18M | Keita Takahashi's weird toy, from Annapurna. Negatives: unfinished, performance, "the fun dries up fast". |
| Snail Simulator | Nov 2023 | $4.99 | 1,624, very high | ~49k | under 20k | ~$0.12M | Tiny, silly, cheap. |
| Garden Paws | Dec 2018 | $19.99 | 2,496, 90% | ~75k | 50k to 100k | ~$0.75M | Small team, cute animal life sim. |

### 3.3 Parent-and-child and teen projects

| Game | Release | Price | Reviews | Est. copies | Story |
|---|---|---|---|---|---|
| Battle Princess Madelyn | Dec 2018 | $19.99 | 156 | 3k to 8k on Steam | Designed with his young daughter. The Kickstarter raised $212,665 CAD from 3,402 backers, with coverage in PC Gamer and elsewhere. It also shipped on consoles, but the Steam numbers are small. |
| Odd Dorable | Sep 2025 | $4.99 | 72 | 1k to 4k | Made from a 4-year-old's drawings and covered by 80.lv. The top negative review says it "may only appeal to one target market: his daughter", cites frame rates under 10 fps and invisible walls, and praises only the art. |
| Answer The Question | Aug 2018 | $0.99 | 138 | ~4k | By 7-year-old Penny McDonald, with her developer dad. Kotaku covered it. |
| Alter Army | Aug 2018 | $4.99 | 33 | ~1k | Two developers who started at 14. PC Gamer covered it. |

The pattern holds across all four. The family story earns press, and press doesn't become sales unless the game stands up without it.

Bugglebrook's story is different from the first three. Those children were 4 to 7, and a parent did most of the making. Here a 17-year-old draws the whole game and will be an adult at launch, which is closer to Alter Army's teen developers. That story is easier to take seriously, but the lesson still holds.

### 3.4 The wider cozy and creative market

| Game | Release on Steam | Price | Reviews | Est. copies | Notes |
|---|---|---|---|---|---|
| Tiny Glade | Sep 2024 | $14.99 | 24,831 | ~745k; ~1M reported | Two developers. A goal-free building toy. Over 600k in its first month. |
| Townscaper | Aug 2021 | $5.99 | 21,652 | ~650k | Solo developer, goal-free toy. |
| Unpacking | Nov 2021 | $19.99 | 40,954 | ~1.2M | Negative reviews focus on length for the price. |
| Untitled Goose Game | Sep 2020 | $19.99 | 25,287 | ~760k | Silly sandbox. Sold most on Switch and Epic first. |
| Rusty's Retirement | Apr 2024 | $6.99 | 14,876 | ~450k; 550k reported by Jul 2025 | Solo desktop idle farm. 100k in 5 days. |
| Tiny Pasture | Feb 2025 | $5.99 | 8,636 | ~260k | Desktop pet toy. |
| Ropuka's Idle Island | Jan 2025 | $3.99 | 4,318 | ~130k | Desktop idle toy. |
| Bongo Cat; Desktop Mate | 2025 | Free | 111,600; 9,363 | n/a | Free desktop toys that earn from cosmetics or DLC. |
| Slime Rancher | Aug 2017 | $19.99 | 157,722 | millions | Cute creature sandbox, mid-size team. |
| Bugsnax | Apr 2022 | $24.99 | 9,552 | ~290k on Steam | Also on PlayStation and Epic. |
| Lil Gator Game | Dec 2022 | $19.99 | 6,154 | ~185k | Small team, playful. |
| Chicory | Jun 2021 | $19.99 | 4,005 | ~120k on Steam | Distinctive hand-drawn look. |
| A Short Hike | Jul 2019 | $7.99 | 22,772 | ~680k | Solo, short, loved. |
| Smushi Come Home | Jun 2023 | $19.99 | 2,806 | ~84k | Solo, tiny-creature adventure. 10k in week one. |
| APICO; Ooblets | 2022; 2023 | $19.99; $29.99 | 2,050; 1,557 | ~60k; ~47k | Small cozy teams. Ooblets was Epic-exclusive first. |
| Webbed | Sep 2021 | $9.99 | 15,318 | ~460k | Cute spider platformer. |
| Hollow Knight | Feb 2017 | $14.99 | 563,332 | millions | Hand-drawn bug world. Bugs drawn by hand can reach millions. |
| Grounded | Sep 2022 | $39.99 | 95,987 | millions | Backyard bugs from Obsidian. A different scale. |
| People Playground; Garry's Mod | 2019; 2006 | $9.99 | 320,370; 1,267,802 | millions | Physics sandboxes with large teen audiences. |

Toca Boca World is free on mobile with in-app purchases. Spin Master reported about 54 million monthly users in Q2 2025, Digital Games revenue of $46M to $53M a quarter through 2025, and over 1 billion Toca downloads. It shows the demand for the style and where the 8-to-14 audience plays, on phones and tablets. It isn't a sales comparison for a $9.99 PC game. Viva Piñata, My Time at Portia, Kitaria Fables, and Snake Pass are bigger, 3D, or a different genre.

### 3.5 Which matter most

Garden Galaxy, Wobbledogs, Bugaboo Pocket, and Wattam are the closest in scope, team size, and audience. Garden Galaxy shows what a one-person cute sandbox can do when it works: about 80,000 copies and half a million dollars gross. Wobbledogs shows the upside of a weird physics creature toy, and the "is this even a game?" complaint that comes with it. Bugaboo Pocket and Wattam show the more common result of good reviews and small sales. Odd Dorable and Battle Princess Madelyn are the warnings for the family-story angle.

---

## 4. Audience fit and platforms

### 4.1 Can Steam reach 13-year-olds?

Partly. Valve publishes no age data. Third-party summaries put under-18s at about 9% of Steam users, and that figure is soft. Pew's 2024 survey of US teens found 85% play games: 73% on consoles, 70% on phones, and 49% on a computer. So roughly half of teens are reachable on PC.

Steam Families helps. Up to six accounts share one library, a child account can send a purchase request for a parent to approve from their phone, and parents can set playtime limits. A parent who buys the game can share it with the kids. That means one sale per household, but it also means a teen can ask for it without a card.

Realistically, the Steam buyers for a game like this are adults in their 20s and 30s who like cozy, funny, or creative games, plus teens and parents buying for the family. The design already suits that mix: wordless, absurd, never mean. The marketing should aim at it too.

### 4.2 Platform comparison

| Platform | Fit | Work from today's build | Cost | Store cut | Verdict |
|---|---|---|---|---|---|
| Steam: Win, Mac, Linux, Deck | Good for PC teens and adults | Small: Steamworks wrapper, Auto-Cloud, Deck layout, auto-update off | $100 | 30% | First release |
| itch.io | Small, friendly to odd indies | None | Free | You pick; 10% default | Early free demo and feedback |
| Microsoft Store | Small for this genre | MSIX packaging. Electron is supported and Microsoft signs it. | Free for individuals since Sep 2025 | 12% for PC games, per Microsoft's 2021 change | Optional |
| iPad, iPhone, Android | Where Toca's audience is, but paid games sell poorly | Moderate. Wrap the Pixi renderer and pure-TS sim in Capacitor, replace the main-process stores and IPC, handle iOS audio unlock and lost WebGL contexts, tune for small screens. Touch suits a mouse-only design. Roughly 1 to 3 months part-time. | Apple $99 a year, Google $25 once | 15% under both small-business programs | Second release, iPad first |
| Switch and Switch 2 | Good family fit; Switch 2 Joy-Cons work as a mouse | Large. Electron and browser runtimes don't run on Switch, so it means an engine rewrite or a porting studio. Small 2D ports start around $5,000 to $25,000 or a revenue share. Switch 2 kits were still scarce in early 2026. | Free to register, kits a few hundred dollars | About 30% | Only after Steam proves demand |

Apple's Kids category bans outbound links and purchases without a parental gate. A paid, offline game can meet that, but it doesn't have to be in that category.

Recommendation: Steam first. It's cheap, the build is nearly ready, the Deck and Families features suit the game, and wishlists and Next Fest live there. Use itch.io for early feedback if you want it. Treat an iPad and phone version as a separate second project.

---

## 5. Realistic outcomes

### 5.1 The distribution

- About 20,000 games launched on Steam in 2025. About 66% earned under $1,000, about 40% never earned back the $100 fee, and about 8% grossed over $100,000. These are Gamalytic-based estimates.
- Gamalytic's 2023 study of the prior three years found 76.5% under $5,000 and 5.6% over $200,000. The median was about $700. Leaving out games under $5 raised it to about $4,000, and leaving out games under $10 raised it to about $17,000.
- Much of the bottom is asset flips and unfinished hobby projects, so a finished, polished game with a real page and a year of marketing starts well above the median. Being good isn't enough on its own, though: Bugaboo Pocket was well reviewed and sold about 10,000 copies.

### 5.2 Wishlists to sales

GameDiscoverCo's survey found a median of about 0.2 first-week sales per wishlist, ranging from under 0.05 to over 1. A later look at games with over 25,000 wishlists found about 0.15, and about 0.10 for games over $10. Year one usually brings 2x to 5x the first week. So 10,000 wishlists at launch suggests about 1,000 to 2,000 first-week sales and 3,000 to 8,000 in year one.

### 5.3 What success looks like

1. **It shipped and strangers liked it.** Ten or more reviews, mostly positive, and the $100 earned back. Most Steam games don't get here.
2. **It paid for itself.** A few thousand dollars, enough to cover costs and pay the artist something real.
3. **A hit at this scale.** Over 10,000 copies, 300+ reviews, $50,000 to $100,000 gross. Roughly the top 10% of releases.
4. **Breakout.** Garden Galaxy or better. It takes luck: a big streamer, a viral clip, a showcase slot.

### 5.4 Scenarios for Bugglebrook

Assumptions: $9.99 on Steam, about $5 gross and $3.50 net per copy, her art replacing most of the code art, launch about 12 months out, and part-time marketing kept up all year. Figures cover the first 12 months.

| Scenario | Wishlists at launch | Copies, year one | Gross | Net | Reviews | What it takes | Rough odds |
|---|---|---|---|---|---|---|---|
| Low | 1,000 to 3,000 | 400 to 1,500 | $2k to $8k | $1.5k to $5k | 10 to 50 | Posting fades, the art isn't finished, or the trailer doesn't show the fun | About 50% |
| Medium | 8,000 to 20,000 | 3,000 to 10,000 | $15k to $50k | $10k to $35k | 100 to 330 | All-hand-drawn art, a strong Next Fest demo, a few clips that travel, some press for the teen artist | About 40% |
| High | 40,000+ | 30,000 to 80,000 | $150k to $400k | $100k to $280k | 1,000 to 2,700 | Medium plus one big break: a large streamer, a viral TikTok, or a Wholesome Direct slot | 10% or less |

The odds are judgment, not math. I put the low case at even odds because a first game with part-time marketing usually lands there. Bugglebrook does start ahead of most: a tested, working sandbox with real depth and a creative hook. The difference between low and medium comes down mostly to how good the art is and how steady the posting is, and the family controls both.

A well-reviewed cozy game keeps selling in seasonal sales for years. Years two through five together might add another 50% to 100% of year one.

---

## 6. Marketing for a tiny team

### 6.1 Channels

- **Short video, the main channel.** TikTok, YouTube Shorts, and Reels. The best material is 5 to 15 seconds of something happening: a bug flung off a spring coming back dizzy, a potion making a bug giant, a stink cloud, a music toy jamming in time with the track. Post 2 to 4 a week for months. Most clips get a few hundred views. One or two may take off, and you can't predict which.
- **Her process.** A Krita timelapse of a bug going from sketch to finished, cut to the same bug moving in the game, is the clip only this team can make, and it shows honestly who made what.
- **Reddit.** r/IndieGaming, r/indiegames, r/CozyGamers, r/WholesomeGames, r/gamedev's Screenshot Saturday, and r/krita. Read each subreddit's self-promotion rules, and post stories, not ads.
- **Devlogs and a list.** A monthly Steam update and a small Discord or mailing list. Those people buy on day one and leave the first reviews.
- **Press, curators, and streamers.** Make a press kit with a trailer, GIFs, a fact sheet, and a short story about the team. Pitch cozy-game writers and local news, who like a "local teen artist" story. Send keys to cozy and family-friendly YouTubers and streamers through Keymailer or direct email.

### 6.2 Festivals and showcases

| Event | When | Notes |
|---|---|---|
| Steam Next Fest | Feb, Jun, Oct | One per game. Needs a demo and a public page. |
| Wholesome Direct | June. Submissions closed March 20 in 2026. | About 50 games picked from many hundreds. Free to submit, long odds, big payoff. |
| Cozy Games Celebration and Cozy Game Awards | Late May to early June in 2026 | Free to submit. Smaller audience. |
| Steam themed events | Year-round | Apply through Steamworks. |
| Other online showcases | Year-round | Zukowski keeps a list at howtomarketagame.com/festivals. |

### 6.3 Demo

Two areas, about five bugs, a few secrets, some crafting, and one potion: enough to show depth, not just the toy. End at a locked barrier that promises more bugs behind it. Release it for Next Fest and leave it up. Let demo saves carry into the full game.

### 6.4 The young-artist story

The angle is a teenage artist's first commercial game: she drew every bug and place, starting at 17, and ships it at 18 or 19, perhaps as its publisher. That's a stronger pitch than "a dad's game with his kid's drawings", because the art is the product and it's plainly her work. It suits local press, art and illustration outlets, Krita's community, Reddit, and human-interest pieces. It also invites reviewers to treat the game as a favor, as the Odd Dorable review did. Lead with the game, and tell the story second.

The game is also her portfolio. A shipped Steam game with her name on it, process clips, and press is strong material for an art school application or a first job in games or illustration. That argues for crediting her under the name she'll use professionally. Decide early whether that's her real name or an art handle, since changing it after launch scatters the credit.

How public she is becomes her call as she turns 18. Leave her school and town out regardless. Agree on who answers comments, and talk about what a mean comment on her art might feel like before one arrives. If the parent runs the studio accounts at first, hand them to her, or set up her own, once she's ready, so the following she builds stays hers.

### 6.5 Benchmarks

Have the page up 6 to 12 months before launch. If wishlists are still under about 5,000 by Next Fest, rework the hook or the art before launching. Launching harder won't fix it.

---

## 7. What makes it valuable and helps it stand out

### 7.1 Her art as the hook

Steam is full of cute pixel art and generic flat vector art. A personal, hand-drawn style still stands out, as Hollow Knight, Chicory, and Garden Galaxy show at very different scales. The art guide's setup suits a teen artist: she draws each piece once and the code animates it, so she never draws animation frames.

- **Consistency.** Mixed code-drawn and hand-drawn art looks unfinished. At launch, every bug, background, and common item should be hers. The code fallback is for development.
- **The capsule.** It's the most important image. Draw it specifically for the capsule, with a logo that reads when tiny.
- **Readability.** Bold outlines and clear silhouettes at 25% zoom, as the art guide says.

### 7.2 Scope and price

At $4.99 or less, players expect an afternoon toy. At $9.99, they expect 3 to 10 hours or a toy they come back to, which is where Bugglebrook fits. At $14.99 to $19.99, they expect 10+ hours or a known studio, which is risky for a first game. The design targets 3 to 4 areas and a quarter to a third of the journal in the first hour, so completionists may finish in a few hours. That's fine at $9.99 if the end of the journal pays off. Measure real playtime with outside testers before fixing the price.

### 7.3 Review risks

| Risk | Seen in | Fix |
|---|---|---|
| "Not a game, a tech demo"; "fun for a few hours" | Wobbledogs, Wattam | Show the goals early: the journal, secrets, mysteries, and areas to unlock, in the trailer and the first minutes. |
| "Too short for the price" | Unpacking, Smushi | $9.99 and an honest description of length. |
| "Only for little kids" | Many cute games | Show the weird and gross side in the trailer and copy. Never say "kids". |
| Poor performance, unfinished feel | Odd Dorable, Wattam | Test on low-end laptops and the Deck. The project's test suite is a real advantage. |
| AI backlash | Art-led indies with AI disclosures | Replace the Suno music, or disclose it plainly and expect comments. |
| Refunds at 90 minutes | The 2-hour window | Keep new things opening through hour two. |
| "I don't know what to do" | Wattam, Bugaboo Pocket | The pictogram hints and thought bubbles must lead to the first few secrets. Watch strangers play without helping. |

---

## 8. Practical and legal

Not legal or tax advice. Rules vary by state.

### 8.1 Business structure

See section 1.2 for the options and the timing. Whoever publishes does the same steps: register as a sole proprietor or form an LLC; get a free EIN so the SSN stays off forms; sign with Valve and any other store; and open a separate bank account in the same name. All of it can wait for her 18th birthday if she's the publisher.

The work comes from two people, so the publisher needs written rights to the other person's part:

- **She publishes.** The parent licenses or assigns the code to her or her LLC.
- **The parent publishes.** She licenses her art to the parent's business for a royalty.
- **Co-owned LLC.** Both license or assign their work to the LLC, and the operating agreement sets the split.

Also write down who decides about updates, ports, price, and pulling the game, and what happens to each person's work if you part ways.

### 8.2 Her art

- **She owns the copyright** in her drawings from the moment she makes them. A parent has no automatic right to control it. At 18 she can license it, sell it, or publish it herself with no co-signer.
- **If she publishes, she needs no license to herself.** Her art stays hers, and the code license from the parent is the only agreement the game needs between you. If she later forms an LLC, she can license the art to it rather than assign it, so she keeps the copyright if the company is ever sold or closed.
- **If someone else publishes, the planned license needs a change.** The art guide's `art/LICENSE` lets her keep copyright and grants the project a non-exclusive, royalty-free license, co-signed by a parent. For a paid game, replace "royalty-free" with a royalty, such as a set percentage of net Steam revenue paid quarterly with a statement she can read.
- **Sign after her birthday.** A minor can usually void a contract, during minority and for a reasonable time after turning 18. Since she'll be 18 before launch, the simplest fix is to sign the real agreements after her birthday, with no co-signer. Anything signed before then should be re-signed at 18.
- **Later uses.** Write down what happens to her art if the game is sold, pulled, ported, or turned into merchandise. The safe default is that anything beyond this game needs her written permission and a new deal.

### 8.3 Paying her and taxes

At 18 she is taxed like any adult with her own small business or job, though she may still be her parents' dependent.

| Method | How it works | Notes |
|---|---|---|
| She is the publisher | The game's profit is her self-employment income, reported on Schedule C | Income tax plus about 15.3% self-employment tax once net earnings pass $400. She can deduct real costs: the Steam fee, software, a tablet, and any money paid to the parent for the code. She makes quarterly estimated payments if the tax gets large. |
| Royalty from a parent's or co-owned business | Paid for licensing her art | Whether it's self-employment income or passive royalty income changes the tax. If it's passive and she's a full-time student under 24 and still a dependent, the kiddie tax can apply. Ask the CPA. |
| Wages from a parent's business | Normal payroll | The under-18 exemption from Social Security and Medicare tax ends at 18, so wages lose most of their appeal. Pay must still be reasonable for real work. |
| Where it goes | Her own bank and brokerage accounts, and a Roth IRA | She can open these herself at 18, with no custodian. A Roth can take up to her earned income or $7,500 in 2026, whichever is less. |

**Financial aid, briefly.** If she'll apply for college aid, her income counts. The FAFSA uses tax data from two years earlier, so 2027 income shows up on the 2029–30 form. Dependent students' income above an allowance (about $11,770 on the 2026–27 form) is assessed at 50%, and savings in her name at 20%. Retirement accounts like a Roth IRA aren't reported. From 2026–27, a family business with 100 or fewer employees is again left out of assets. Colleges that use the CSS Profile look more closely. Most likely outcomes are small enough not to matter, but a good year could cost some aid, so ask the CPA or a college aid office before deciding how and when she's paid.

### 8.4 The code and the GitHub repo

`github.com/namick/bugglebrook` is public, has no license file, and `package.json` says `UNLICENSED`. Legally that's "all rights reserved". In practice anyone can clone it, build it, and upload a copy to a store, and you'd be chasing takedowns.

Make the repo private before the store page goes live. It has no forks or stars yet, so it costs nothing now. GitHub Actions still runs on private repos within the free minutes. electron-updater's GitHub provider expects public releases, which is another reason to turn it off for Steam.

Keeping the code open is a legitimate choice, and some commercial games do it. If you go that way, choose an open-source license on purpose and keep the art and music under their own licenses, as the art guide and music brief plan.

On AI-assisted code: the Copyright Office's January 2025 report says AI-generated material isn't copyrightable without enough human authorship, judged case by case, and that human design, selection, and editing still count. This doesn't stop a sale. It means copyright on parts of the code may be thin, another point for a private repo.

### 8.5 Music: Suno terms

- Songs made on a paid Pro or Premier plan carry commercial use rights, including in a game. Free-plan songs don't, and subscribing later doesn't change that. Rights stay with songs made while subscribed after you cancel.
- After its November 2025 settlement with Warner Music Group, Suno rewrote its terms to say that even with commercial rights, "you generally are not considered the owner of the songs". It also announced licensed models, the retirement of current models, and download caps for 2026. Songs already downloaded keep their status.
- Purely AI-generated music likely can't be registered for US copyright, so others could reuse the tracks.
- Other labels' lawsuits against Suno were still reported active in 2026. Check before launch.
- Keep the subscription receipts and each track's creation date, as the music brief asks. Then decide whether to replace the music. A composer costs very roughly $500 to $3,000 for a small indie soundtrack. Library music and the original procedural music are cheaper options. The adaptive stem system works with any multitrack music, so a composer could deliver stems in the same format.

### 8.6 The name "Bugglebrook"

A web search on 2026-10-01 found only this project's repo and the unrelated English village of Bugbrooke. Steam's store search found nothing for "Bugglebrook" or "Buggle". That's a quick check, not clearance. Search USPTO for "Bugglebrook" and close variants like "Buggle" and "Bugbrook" in class 9, for game software, and class 41, for entertainment, and check EUIPO, WIPO, domains, and social handles. A US filing costs $350 per class at USPTO's 2025 base fee. You don't need to register before launch, but you do need to know nobody else owns the name.

### 8.7 Questions for the professionals

For a lawyer: should she publish as a sole proprietor or through her own LLC, or should we co-own one? What should the code license from the parent and her art license say, including ports, merchandise, and a sale of the game? Is anything we do before her 18th birthday worth signing, or should it all wait?

For a CPA: if she publishes, what does she owe in income and self-employment tax, and should she make estimated payments? If she's paid a royalty, is it earned or passive, and does the kiddie tax apply while she's a dependent student? Can she still be claimed as a dependent? How do we time her income around FAFSA years, and how much should go into a Roth IRA?

---

## 9. Recommended roadmap

This assumes launch around autumn 2027. Her schoolwork comes first, so the art sets the pace. Because her pieces drop into the running game one at a time, progress shows right away, which helps keep her going.

| When | Steps | Cash cost |
|---|---|---|
| Oct to Dec 2026 | Make the repo private. Choose the business structure and draft the agreements; sign them after her 18th birthday. Quick trademark search. Decide about the music. She draws Dot, Rollo, and Glorp. Start a studio account on TikTok or YouTube showing her process. Optional itch.io prototype. | $0 to $500 |
| Jan to Mar 2027 | Whoever publishes pays the Steam fee and does the tax interview: she does if she's 18 by then, otherwise the parent, with a transfer to her account later (section 1.2). She draws the plaza and pond and their bugs, plus the capsule. Cut a 30 to 60 second trailer. **Publish the Coming Soon page.** Add Auto-Cloud, achievements, and a Deck layout, and turn off auto-update. Submit to Wholesome Direct before its March deadline. Start a monthly devlog. | $100 Steam fee; $99 Apple Developer ID to notarize the Mac build |
| Apr to Jun 2027 | Build the demo in her art. Playtest with 5 to 10 strangers. Request a Deck review. **June 2027 Next Fest** if the demo is ready, registering about seven weeks ahead; otherwise October. Pitch press and streamers. | $0 to $300 |
| Jul to Sep 2027 | She finishes the remaining areas, bugs, and common items. Content lock, bug fixing, low-end and Deck performance, press kit. Pick a date away from Steam's big seasonal sales and major releases. | $500 to $3,000 if commissioning music |
| Oct to Nov 2027 | Launch at 10% to 20% off for week one. Email press and curators. Post daily for two weeks. Answer every review. Ship a fix-up update within a month. | $0 |
| 2028 | Seasonal sales. One content update she wants to draw, like a new bug or area. Decide on an iPad and phone port from Steam results. | $99 a year plus 1 to 3 months of work, if porting |

If the art runs late, move the dates instead of launching with mixed art. October 2027 Next Fest with an early-2028 launch is a fine fallback.

**Cash total.** About $500 to $1,500 if the Suno music stays, or $1,000 to $4,500 with a commissioned soundtrack. Add $350 or more per class for a trademark filing.

**What she gets, whatever it sells.** A shipped commercial game with her name on it, a portfolio piece for art school or a job, money in an account that's hers, and experience working to a real spec and deadline. That's worth planning for on its own terms.

---

## Sources

Steam and Steamworks

- [Steam Direct fee and recoup](https://partner.steamgames.com/steamdirect)
- [Steamworks onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)
- [Steamworks reporting and payments](https://partner.steamgames.com/doc/finance/payments_salesreporting)
- [Steamworks release process](https://partner.steamgames.com/doc/store/releasing)
- [Steamworks store graphical assets](https://partner.steamgames.com/doc/store/assets/standard)
- [Steamworks content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)
- [Steam Next Fest: October 2026](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october)
- [Steam Deck and Steam Machine compatibility review](https://partner.steamgames.com/doc/steamhardware/compat)
- [Getting your game ready for Steam Deck](https://partner.steamgames.com/doc/steamdeck/recommendations)
- [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/)
- [Steam Families announcement](https://steamcommunity.com/games/593110/announcements/detail/4605582245626919824)
- [SteamDB: Steam Family Sharing guide, 2026](https://steamdb.com/en/articles/steam-family-sharing-complete-guide)
- [Steam revenue share tiers explained](https://www.steampageanalyzer.com/blog/steam-revenue-share-explained)
- [Steam refund policy summary](https://indieforgames.com/steam-refund-policy/)
- [GameGrin: Steam updates regional pricing tools](https://www.gamegrin.com/news/steam-updates-regional-pricing-tools-in-steamworks-development-news/)
- [Steam community: minimum age to publish](https://steamcommunity.com/discussions/forum/1/3476233614750851767/)
- [Steamworks FAQ on W-9 and TIN](https://partner.steamgames.com/documentation/welcome)
- [Steamworks: transferring applications](https://partner.steamgames.com/doc/gettingstarted/managing_apps/transfer)

AI disclosure and AI sentiment

- [VGC: Valve has significantly rewritten Steam's AI disclosure rules, January 2026](https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use/)
- [PC Gamer: Steam updates AI disclosure form](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/)
- [Remio: report of mandatory AI tags, June 2026, unconfirmed](https://www.remio.ai/post/indie-game-studios-are-rejecting-steam-s-new-mandatory-ai-metadata-tags)
- [PCCentral: Next Fest June 2026 AI disclosure stats](https://pccentral.net/steam-next-fest-june-2026-generative-ai-disclosure-stats-reveal/)
- [PC Gamer: a touch of AI triggers backlash](https://www.pcgamer.com/gaming-industry/steam-week-in-review-a-touch-of-ai-is-all-it-takes-to-trigger-backlash-as-a-promising-new-indie-falls-afoul-of-slop-skeptics/)
- [GamesRadar: My Winter Car reviews despite AI](https://www.gamesradar.com/games/survival/despite-ai-generated-textures-audio-and-music-steam-users-shower-hotly-anticipated-survival-game-in-11-000-95-percent-positive-reviews-in-just-a-few-days/)
- [US Copyright Office: Copyright and AI](https://copyright.gov/ai/)
- [Crowell: Copyright Office AI report Part 2](https://www.crowell.com/en/insights/client-alerts/us-copyright-office-releases-part-2-of-artificial-intelligence-report-clarifying-copyrightability-of-generative-ai-outputs)

Suno

- [Suno: updates to terms of service](https://suno.com/blog/suno-updates-tos)
- [Music in Africa: Suno adjusts ownership terms after Warner deal](https://musicinafrica.net/magazine/suno-adjusts-ai-music-ownership-terms-after-warner-music-partnership/)
- [Digital Music News: Suno 2026 changes under Warner deal](https://www.digitalmusicnews.com/2025/12/22/suno-warner-music-deal-changes/)
- [Terms.law: Suno commercial rights guide](https://terms.law/ai-output-rights/suno/)
- [Undetectr: Suno licensed models 2026](https://undetectr.com/blog/suno-licensed-models-2026)

Market data and methods

- [Game-developers.org: 2025 Steam revenue distribution, Gamalytic-based](https://game-developers.org/2025-steam-game-revenue-distribution)
- [GameDevReports: Gamalytic, 67% of games earned under $5k](https://gamedevreports.substack.com/p/gamalytic-67-of-games-on-steam-earned)
- [GameDiscoverCo: wishlists to first-week sales](https://newsletter.gamediscover.co/p/steam-the-new-wishlists-to-first)
- [GameDevReports: GameDiscoverCo on wishlist conversions 2024 to 2025](https://gamedevreports.substack.com/p/gamediscoverco-the-state-of-steam)
- [Boxleiter method explained, 2026](https://www.steampageanalyzer.com/blog/boxleiter-method-explained)
- [How to Market a Game: Steam personal calendar, June 2026](https://howtomarketagame.com/2026/06/25/how-the-steam-personal-calendar-affects-your-launch/)
- [How to Market a Game: how many wishlists at launch](https://howtomarketagame.com/2022/09/26/how-many-wishlists-should-i-have-when-i-launch-my-game/)
- [How to Market a Game: festivals list](https://howtomarketagame.com/festivals/)
- [Tech Insider: Steam store redesign 2026](https://tech-insider.org/steam-store-redesign-2026/)
- [SteamSpy](https://steamspy.com/)
- [Gamalytic](https://gamalytic.com/)
- [VG Insights: Tiny Glade](https://vginsights.com/game/tiny-glade)
- [SteamDB](https://steamdb.info/)
- Steam store pages and the public review API, queried 2026-10-01, for every review count and price in section 3

Comparable games

- [GameDiscoverCo: how Tiny Glade sold over 600k in a month](https://newsletter.gamediscover.co/p/how-tiny-glade-built-its-way-to-600k)
- [GameDiscoverCo: Rusty's Retirement, 300k+ sales](https://newsletter.gamediscover.co/p/how-rustys-retirement-idle-farmed)
- [Wikipedia: Rusty's Retirement](https://en.wikipedia.org/wiki/Rusty's_Retirement)
- [Wobbledogs on Steam](https://store.steampowered.com/app/1424330/Wobbledogs/)
- [Garden Galaxy on Steam](https://store.steampowered.com/app/1970460/Garden_Galaxy/)
- [Garden Galaxy revenue estimate](https://steam-revenue-calculator.com/app/1970460/garden-galaxy)
- [PC Gamer: Bugaboo Pocket](https://www.pcgamer.com/thanks-to-this-tamagotchi-like-critter-care-game-i-now-believe-that-bugs-can-be-cute-too/)
- [Gamerant: Unpacking's negative reviews and length](https://gamerant.com/unpacking-steam-reviews-indie-game-length-hours-price/)
- [Smushi Come Home physical release news](https://nintendoeverything.com/smushi-come-home-will-have-a-switch-physical-release/)
- [Spin Master Q4 2025 results](https://www.newswire.ca/news-releases/spin-master-reports-q4-2025-financial-results-865384470.html)
- [Investing.com: Spin Master Q2 2025 digital games](https://www.investing.com/news/company-news/spin-master-q2-2025-slides-digital-games-shine-amid-overall-revenue-decline-93CH-4162781)
- [Forbes: Toca Boca tops 1 billion downloads](https://www.forbes.com/sites/dbloom/2024/11/20/toca-boca-tops-1-billion-downloads-of-its-games/)

Parent and child, and teen developers

- [DualShockers: Battle Princess Madelyn Kickstarter](https://www.dualshockers.com/battle-princess-madelyns-kickstarter-concludes-obliterates-funding-goal/)
- [PC Gamer: the developer whose boss is his 6-year-old daughter](https://www.pcgamer.com/meet-the-indie-developer-whose-boss-is-his-6-year-old-daughter/)
- [80.lv: developer turns his daughter's drawings into a game](https://80.lv/articles/indie-developer-turns-his-daughter-s-drawings-into-a-game)
- [Kotaku: 7-year-old releases her first Steam game](https://kotaku.com/inspired-by-her-game-dev-dad-7-year-old-releases-her-f-1828094688)
- [PC Gamer: the 16-year-olds who released their first game on Steam](https://www.pcgamer.com/the-16-year-olds-who-just-released-their-first-game-on-steam/)

Audience and platforms

- [Pew Research: Teens and video games today, May 2024](https://www.pewresearch.org/internet/2024/05/09/teens-and-video-games-today/)
- [Icon Era: Steam statistics 2026, third-party age estimate](https://icon-era.com/statistics/steam/)
- [Windows Developer Blog: free registration for individual developers, September 2025](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)
- [itch.io: open revenue sharing](https://itch.io/updates/introducing-open-revenue-sharing)
- [Capacitor: games guide](https://capacitorjs.com/docs/guides/games)
- [Apple: design for kids](https://developer.apple.com/kids/)
- [Generalist Programmer: Switch development guide, 2026](https://generalistprogrammer.com/tutorials/nintendo-switch-game-development-complete-guide)
- [Construct forum: Switch does not support HTML5](https://www.construct.net/en/forum/construct-3/general-discussion-7/nintendo-switch-not-support-136439)
- [Chowdren porting runtime](https://mp2.dk/chowdren/)
- [Game Developer Outsourcing: porting costs](https://www.gamedevoutsourcing.com/blog/game-porting-outsourcing-guide)

Electron on Steam

- [steamworks.js](https://github.com/ceifa/steamworks.js)
- [steamworks.js issue 195: overlay on Linux](https://github.com/ceifa/steamworks.js/issues/195)
- [steamworks-ffi-node](https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1)
- [steam-electron-build](https://github.com/alexanderthurn/steam-electron-build)
- [Steam runtime issue 579: Electron and libcups](https://github.com/ValveSoftware/steam-runtime/issues/579)
- [Steam runtime issue 830: Electron GPU under Wayland](https://github.com/ValveSoftware/steam-runtime/issues/830)
- [GamingOnLinux: how Valve tests native Linux versus Proton](https://www.gamingonlinux.com/2022/02/valve-clarifies-how-they-test-native-linux-or-proton-for-steam-deck/)
- [NativeCookie: Cookie Clicker on Electron](https://github.com/Kesefon/NativeCookie)
- [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)

Kids, ratings, and privacy

- [FTC: COPPA final rule, 2025](https://www.ftc.gov/system/files/ftc_gov/pdf/coppa_sbp_1.16_0.pdf)
- [Davis Polk: COPPA compliance obligations take effect](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect)
- [ESRB: IARC for digital storefronts](https://www.esrb.org/blog/iarc-rating-system-administers-esrb-ratings-in-north-america-for-windows-store-games-and-apps/)
- [Wikipedia: International Age Rating Coalition](https://en.wikipedia.org/wiki/International_Age_Rating_Coalition)

Showcases

- [Wholesome Games](https://wholesomegames.com/)
- [VGC: all 53 games in Wholesome Direct 2026](https://www.videogameschronicle.com/news/wholesome-direct-heres-all-53-games-featured-in-todays-cozy-showcase/)
- [Cozy Games Celebration](https://x.com/cozycelebration)

Business, tax, and copyright

- [Gusto: tax benefits of hiring your children](https://gusto.com/resources/articles/taxes/tax-benefits-hiring-children)
- [IRS: family employees](https://www.irs.gov/businesses/small-businesses-self-employed/family-employees)
- [Business Law, 8.2: minors and disaffirmance](https://rvcc.pressbooks.pub/businesslaw131interactive/chapter/8-2-minors-or-infants/)
- [Federal Student Aid: 2026–27 SAI and Pell Grant eligibility guide](https://fsapartners.ed.gov/sites/default/files/2025-06/202627StudentAidIndexSAIandPellGrantEligibilityGuide.pdf)
- [The College Investor: 2027–28 SAI chart and allowances](https://thecollegeinvestor.com/43805/student-aid-index-sai-chart/)
- [Saving for College: how assets affect the FAFSA](https://www.savingforcollege.com/article/how-7-different-assets-can-affect-your-financial-aid-eligibility)
- [Kid to College: savings and the 2026–27 FAFSA, small business exclusion](https://www.kidtocollege.com/blog/savings-assets-fafsa-aid-impact-2026)
- [2026 standard deduction, Rev. Proc. 2025-32](https://ustax.tools/standard-deduction-2026/)
- [Self-employment tax 2026](https://nationaltaxtools.com/guides/self-employment-tax/)
- [Schwab: Roth IRA for kids](https://www.schwab.com/learn/story/roth-ira-for-kids)
- [Owe.com: working with children's artwork](https://www.owe.com/resources/legalities/20-working-childrens-artwork/)
- [17 USC chapter 2: copyright ownership](https://uscode.house.gov/view.xhtml?path=%2Fprelim%40title17%2Fchapter2&edition=prelim)
- [Nolo: trademark class 28 and game classes](https://www.nolo.com/legal-encyclopedia/trademark-class-28-games-sporting-goods.html)
