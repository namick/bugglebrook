# Playtest feedback

Notes from real players. Each item says where it gets handled. Agents: check this file before starting a milestone and mark items done.

## 2026-10-01: the owner's daughter (17, the project's artist)

She likes the game so far.

| # | Feedback | Plan | Where | Status |
|---|---|---|---|---|
| F1 | Wants a trash can for getting rid of unneeded stuff, like Toca Boca has. | Add a trash can fixture (a tin can with a lid, or a hungry compost bin), with a funny chomp, burp, and lid clang. Nothing is truly destroyed, so recipes and secrets can't softlock: everything that belongs to the world goes back to its home spot a while later, and junk the player made (blobs, crafted copies) is recycled into its parts or removed. Bugs can rummage in it. | Feedback batch, after the world-fix merge | Open |
| F2 | The ground gets cluttered. | Tidy-up tools on top of F1: a "tidy" gesture or fixture (e.g., a leaf blower or broom toy, or a whistle that sends loose items home), rain or wind slowly washing small litter toward the edges, a per-area cap on loose crafted junk, and loose items drifting back to their home spots when off-screen for a long time. Never move anything tagged `tag_player_setup`. | Feedback batch | Open |
| F3 | Tutorial-style walkthroughs. | The wordless hints are in: idle wobbles and glints, the ghost-hand demo, bugs using machines. Check that the first 10 minutes teach every core verb. If they don't, add a short wordless guided intro that can be skipped. | Check in M10 / M12 | Partly done |
| F4 | A way to see how many secrets and hidden areas you've found. | The M10 journal gives completion percentage per page. Also make progress visible outside the journal: a counter on the journal button, a "new!" badge, and the slot sign's jar on the menu filling with found secrets. | M10 | Open |
| F5 | Suno makes stems even for instruments that aren't in the song. Many are silent. | The music importer drops stems below a loudness threshold (and vocal stems by default), and reports which it dropped. | M9 | Open |
