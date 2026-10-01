import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { Sim } from '../../../game/sim';
import { drawFriend } from '../render/draw/pictogram';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';
import { Bounce, markUi } from './button';
import { CREAM, LEAF, LEAF_DARK } from './icons';
import { STAMP_UI, freshStamps, iconAlpha, stampSlam, stampsOf } from './stamps';
import type { Stamp, StampKind } from './stamps';

/** The notebook's middle, top right where the journal will live (section 17). */
const BOOK = { x: VIEW_WIDTH_PX - 80, y: 80 } as const;
const STAMP_R = 25;
const STEP = 60;

/** Ink colors for each kind of stamp. */
const INK: Record<StampKind, number> = {
  // Teal, not gold: a gold disc would read as a coin, and there is no currency here.
  secret: 0x1f9e93,
  bug: 0xe8453c,
  area: 0x3f9a34,
  blueprint: 0x3c6fd6,
  recipe: 0x9a6436,
  potion: 0x9b6bd6,
};

/** The little notebook: a leaf-green cover with a ladybug bookmark. */
function drawBook(g: Graphics, filled: boolean): void {
  g.roundRect(-34, -38 + 6, 68, 80, 12).fill({ color: OUTLINE, alpha: 0.18 });
  g.roundRect(-34, -40, 68, 80, 12).fill(LEAF).stroke(stroke(6));
  g.roundRect(-34, -40, 14, 80, 7).fill(LEAF_DARK).stroke(stroke(4));
  for (const y of [-26, -6, 14]) g.circle(-27, y, 3.5).fill(CREAM);
  // A stamped star on the cover once anything is in it.
  if (filled) {
    g.circle(8, -6, 18).fill(lighten(LEAF, 0.35)).stroke({ width: 3, color: LEAF_DARK });
    star(g, 8, -6, 11, 0xffd23f);
  }
  // The ladybug bookmark hanging out of the bottom.
  g.moveTo(14, 38).lineTo(14, 56).stroke({ width: 6, color: 0xe8453c, cap: 'round' });
  g.circle(14, 60, 7).fill(0xe8453c).stroke(stroke(3));
  g.circle(14, 60, 2).fill(OUTLINE);
}

function star(g: Graphics, x: number, y: number, r: number, color: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(color).stroke(stroke(2.5));
}

/** One stamp: an inked ring with a pictogram for what was found. */
export function drawStamp(g: Graphics, s: Stamp, sim: Sim): void {
  const ink = INK[s.kind];
  const r = STAMP_R;
  g.circle(0, 0, r).fill(lighten(ink, 0.72)).stroke({ width: 4.5, color: ink });
  g.circle(0, 0, r - 6).stroke({ width: 1.5, color: ink, alpha: 0.6 });
  switch (s.kind) {
    case 'secret': {
      // A keyhole.
      g.circle(0, -4, 7).fill(darken(ink, 0.45));
      g.poly([-5, -1, 5, -1, 7, 12, -7, 12]).fill(darken(ink, 0.45));
      break;
    }
    case 'bug': {
      const def = sim.content.bugs.tryGet(s.ref);
      if (def) drawFriend(g, def, 0, 1, 30);
      else star(g, 0, 0, 12, ink);
      break;
    }
    case 'area': {
      // A little flag on a hill.
      g.ellipse(0, 12, 15, 6).fill(lighten(ink, 0.2));
      g.moveTo(-4, 12).lineTo(-4, -14).stroke({ width: 3, color: OUTLINE, cap: 'round' });
      g.poly([-4, -14, 12, -8, -4, -2]).fill(0xffd23f).stroke(stroke(2));
      break;
    }
    case 'blueprint': {
      g.roundRect(-13, -11, 26, 22, 3).fill(ink).stroke(stroke(2.5));
      for (const y of [-4, 3])
        g.moveTo(-8, y).lineTo(8, y).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
      g.circle(5, -6, 2).fill(0xffffff);
      break;
    }
    case 'recipe': {
      // A hammer.
      g.moveTo(-8, 12).lineTo(5, -3).stroke({ width: 5, color: 0xc98d52, cap: 'round' });
      g.roundRect(-2, -14, 18, 10, 3).fill(0x9aa3b5).stroke(stroke(2.5));
      break;
    }
    case 'potion': {
      g.roundRect(-4, -15, 8, 7, 2).fill(0xc9a07a).stroke(stroke(2));
      g.circle(0, 4, 11).fill(ink).stroke(stroke(2.5));
      g.circle(-4, 1, 3).fill({ color: 0xffffff, alpha: 0.7 });
      break;
    }
  }
}

interface StampView {
  stamp: Stamp;
  g: Graphics;
  /** Seconds since it began to land, or -1 while it waits for the discovery's chime. */
  t: number;
  /** When it may start landing. */
  wait: number;
}

/**
 * The discovery strip (R22): until the journal comes in M10, a little
 * notebook in the top-right corner with a row of ink stamps beside it, one
 * for each secret, bug, area, blueprint, recipe, and potion discovery. A
 * new one slams down with a thump and the notebook wiggles. Like every
 * icon, it fades to 40 percent when the cursor has not been near it for
 * 5 seconds. Reads the sim; it saves nothing of its own (everything comes
 * from saved secrets and the bench).
 */
export class StampStrip extends Container {
  /** The notebook (the test hook finds the strip by it). */
  readonly book = new Container();
  private readonly bookArt = new Graphics();
  private readonly row = new Container();
  private readonly views: StampView[] = [];
  private readonly seen = new Set<string>();
  private readonly wiggle = new Bounce(260, 9);
  private away = 0;
  private filled = false;
  /** Called when a stamp lands (the stamp sound). */
  onStamp: (() => void) | null = null;
  /** Stamps landed since the world opened, for the test hook. */
  landed = 0;

  constructor(private readonly sim: Sim) {
    super();
    markUi(this);
    this.eventMode = 'static';
    // Stop presses on the strip from reaching the world.
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.wiggle.kick(1.25);
    });
    this.book.position.set(BOOK.x, BOOK.y);
    this.book.addChild(this.bookArt);
    this.addChild(this.row, this.book);
    // What the world already has shows at once, without a fuss.
    const now = this.current();
    for (const s of now) this.add(s, false);
    this.drawBook();
    this.layout();
  }

  private current(): Stamp[] {
    return stampsOf({
      secrets: this.sim.secrets,
      unlocks: (id) => this.sim.content.secrets.tryGet(id)?.unlocks ?? [],
      hinted: this.sim.bench.state.hinted,
      made: this.sim.bench.state.made,
    });
  }

  private add(s: Stamp, fresh: boolean): void {
    this.seen.add(s.key);
    const g = new Graphics();
    drawStamp(g, s, this.sim);
    this.row.addChild(g);
    this.views.push({ stamp: s, g, t: fresh ? -1 : 10, wait: fresh ? STAMP_UI.landDelay : 0 });
    // Only the newest few stay on the strip; older ones are tucked into the notebook.
    while (this.views.length > STAMP_UI.shown) this.views.shift()!.g.destroy();
  }

  private drawBook(): void {
    this.bookArt.clear();
    drawBook(this.bookArt, this.filled);
  }

  private layout(): void {
    const n = this.views.length;
    this.views.forEach((v, i) => {
      v.g.position.set(BOOK.x - 70 - (n - 1 - i) * STEP, BOOK.y + 2);
    });
    // A hit area round the whole strip (for the near check and to keep presses off the world).
    const left = BOOK.x - 70 - Math.max(0, n - 1) * STEP - STAMP_R - 10;
    this.hitArea = {
      contains: (x: number, y: number) => x >= left && x <= BOOK.x + 50 && y >= 20 && y <= 150,
    };
  }

  /** The strip's left edge and the notebook, for the near check (view px). */
  private near(p: { x: number; y: number }): boolean {
    const n = this.views.length;
    const left = BOOK.x - 70 - Math.max(0, n - 1) * STEP - STAMP_R;
    return p.x >= left - STAMP_UI.nearPx && p.y <= BOOK.y + 60 + STAMP_UI.nearPx;
  }

  /** `wall` is wall-clock seconds since the last frame: the fade counts real time, however slow the frames. */
  update(dt: number, pointer: { x: number; y: number } | null, wall = dt): void {
    for (const s of freshStamps(this.seen, this.current())) {
      this.add(s, true);
      this.layout();
    }
    let landing = false;
    for (const v of this.views) {
      if (v.t < 0) {
        v.wait -= dt;
        v.g.visible = false;
        if (v.wait > 0) continue;
        v.t = 0;
      }
      const before = v.t;
      v.t += dt;
      v.g.visible = true;
      const slam = stampSlam(v.t);
      v.g.scale.set(slam.scale);
      v.g.alpha = slam.alpha;
      if (v.t < 1) landing = true;
      // It hits the paper: thump, the notebook wiggles.
      if (before < 0.16 && v.t >= 0.16) {
        this.landed++;
        this.wiggle.kick(1.3);
        this.onStamp?.();
        if (!this.filled) {
          this.filled = true;
          this.drawBook();
        }
      }
    }
    if (!this.filled && this.views.length > 0 && !landing) {
      this.filled = true;
      this.drawBook();
    }
    this.away = pointer && this.near(pointer) ? 0 : this.away + wall;
    const target = landing ? 1 : iconAlpha(this.away);
    this.alpha += (target - this.alpha) * Math.min(1, dt * 8);
    const w = this.wiggle.update(dt);
    this.book.scale.set(w);
    this.book.rotation = (w - 1) * 0.6;
    this.visible = this.views.length > 0;
  }

  /** For the test hook. */
  info(): {
    stamps: { kind: StampKind; ref: string }[];
    total: number;
    landed: number;
    alpha: number;
    visible: boolean;
  } {
    return {
      stamps: this.views.map((v) => ({ kind: v.stamp.kind, ref: v.stamp.ref })),
      total: this.seen.size,
      landed: this.landed,
      alpha: this.alpha,
      visible: this.visible,
    };
  }
}
