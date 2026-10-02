import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { Sim } from '../../../game/sim';
import { drawFriend } from '../render/draw/pictogram';
import { drawNumber } from '../render/draw/digits';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';
import { drawGoldLadybug, glowDot } from '../journal/entryArt';
import { badgeText, jarDotCount, jarDots } from '../journal/layout';
import { Bounce, markUi } from './button';
import { CREAM, LEAF, LEAF_DARK } from './icons';
import { STAMP_UI, freshStamps, iconAlpha, stampSlam, stampsOf } from './stamps';
import type { Stamp, StampKind } from './stamps';

/** Where the journal button sits: top right (section 17). */
export const JOURNAL_AT = { x: VIEW_WIDTH_PX - 90, y: 80 } as const;
const STAMP_R = 25;

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

/**
 * The journal's front cover, centered on (0, 0), `w` by `h`: a chunky
 * leaf-green notebook with a ladybug bookmark and a glass jar of glowing
 * dots that fills as the player finds things, and a gold ladybug stamp
 * once everything is found. `big` adds detail for the book's own cover.
 */
export function drawCover(
  g: Graphics,
  w: number,
  h: number,
  completion: { found: number; total: number },
  big: boolean,
  dots = true,
): void {
  const k = w / 84;
  const line = big ? 8 : 5;
  g.roundRect(-w / 2 + 4 * k, -h / 2 + 7 * k, w, h, 13 * k).fill({ color: OUTLINE, alpha: 0.22 });
  // Pages peeking out on the right.
  g.roundRect(-w / 2 + 6 * k, -h / 2 + 4 * k, w - 2 * k, h - 8 * k, 10 * k)
    .fill(0xfff6df)
    .stroke(stroke(line * 0.6));
  g.roundRect(-w / 2, -h / 2, w - 6 * k, h, 13 * k)
    .fill(LEAF)
    .stroke(stroke(line));
  // A leaf vein pressed into the cover.
  g.moveTo(-w / 2 + 18 * k, h / 2 - 12 * k)
    .quadraticCurveTo(0, -h * 0.1, w / 2 - 14 * k, -h / 2 + 12 * k)
    .stroke({ width: 2.5 * k, color: darken(LEAF, 0.15), alpha: 0.5, cap: 'round' });
  // The spine.
  g.roundRect(-w / 2, -h / 2, 15 * k, h, 7 * k)
    .fill(LEAF_DARK)
    .stroke(stroke(line * 0.7));
  for (let i = 0; i < 4; i++)
    g.circle(-w / 2 + 7.5 * k, -h / 2 + (16 + i * 22) * (h / 100), 2.6 * k).fill(CREAM);
  // The jar on the cover.
  const jx = 6 * k;
  const jy = 4 * k;
  const jw = 40 * k;
  const jh = 46 * k;
  g.roundRect(jx - jw / 2, jy - jh / 2, jw, jh, 10 * k).fill({ color: 0xe8f6ff, alpha: 0.95 });
  if (dots) {
    const n = jarDotCount(completion.found, completion.total, 18);
    for (const p of jarDots(n, jw - 6 * k, jh - 6 * k, 4 * k)) glowDot(g, jx + p.x, jy + p.y, 3.4 * k);
  }
  g.roundRect(jx - jw / 2, jy - jh / 2, jw, jh, 10 * k).stroke(stroke(line * 0.6));
  g.roundRect(jx - jw / 2 - 3 * k, jy - jh / 2 - 8 * k, jw + 6 * k, 10 * k, 3 * k)
    .fill(0xff9f1c)
    .stroke(stroke(line * 0.5));
  g.moveTo(jx - jw / 2 + 7 * k, jy - jh / 2 + 9 * k)
    .lineTo(jx - jw / 2 + 7 * k, jy + jh / 2 - 12 * k)
    .stroke({ width: 3 * k, color: 0xffffff, alpha: 0.7, cap: 'round' });
  // The ladybug bookmark: a red ribbon hanging out of the pages.
  g.moveTo(w / 2 - 22 * k, h / 2 - 4 * k)
    .lineTo(w / 2 - 22 * k, h / 2 + 14 * k)
    .stroke({ width: 7 * k, color: 0xe8453c, cap: 'round' });
  g.circle(w / 2 - 22 * k, h / 2 + 19 * k, 8 * k)
    .fill(0xe8453c)
    .stroke(stroke(line * 0.5));
  g.circle(w / 2 - 22 * k, h / 2 + 12.5 * k, 4.2 * k).fill(OUTLINE);
  for (const [dx, dy] of [
    [-3.5, 19],
    [3.5, 21],
  ] as const)
    g.circle(w / 2 - 22 * k + dx * k, h / 2 + dy * k, 1.9 * k).fill(OUTLINE);
  if (completion.total > 0 && completion.found >= completion.total) {
    g.translateTransform(-w / 2 + 30 * k, h / 2 - 22 * k);
    drawGoldLadybug(g, 15 * k);
    g.resetTransform();
  }
}

/** One stamp: an inked ring with a pictogram for what was found. */
export function drawStamp(g: Graphics, s: Stamp, sim: Sim): void {
  const ink = INK[s.kind];
  const r = STAMP_R;
  g.circle(0, 0, r).fill(lighten(ink, 0.72)).stroke({ width: 4.5, color: ink });
  g.circle(0, 0, r - 6).stroke({ width: 1.5, color: ink, alpha: 0.6 });
  switch (s.kind) {
    case 'secret': {
      g.circle(0, -4, 7).fill(darken(ink, 0.45));
      g.poly([-5, -1, 5, -1, 7, 12, -7, 12]).fill(darken(ink, 0.45));
      break;
    }
    case 'bug': {
      const def = sim.content.bugs.tryGet(s.ref);
      if (def) drawFriend(g, def, 0, 1, 30);
      else g.star(0, 0, 5, 12, 5).fill(ink);
      break;
    }
    case 'area': {
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
  /** Seconds since it began to land, or -1 while it waits its turn. */
  t: number;
  wait: number;
}

/** How long a landed stamp sits on the cover before it tucks into the book. */
const STAMP_HOLD = 1.1;
const STAMP_TUCK = 0.35;

/**
 * The journal button (section 17), top right. Its cover's jar fills with
 * glowing dots as the player finds things; a red badge counts entries not
 * yet looked at and bounces when that changes. Each discovery's ink stamp
 * slams down on the cover half a second after the find's own chime, with a
 * thump, then tucks into the book (R22). Like every icon it fades to 40
 * percent when the hand has been away for 5 seconds. Reads the sim; it
 * saves nothing of its own.
 */
export class JournalButton extends Container {
  /** The book itself (the test hook finds the button by it). */
  readonly book = new Container();
  private readonly cover = new Graphics();
  private readonly glow = new Graphics();
  private readonly badge = new Container();
  private readonly badgeArt = new Graphics();
  private readonly stampLayer = new Container();
  /** Stamps still landing or waiting, oldest first. */
  private readonly queue: StampView[] = [];
  /** The newest stamps, for the test hook. */
  private readonly history: Stamp[] = [];
  private readonly seen = new Set<string>();
  private readonly wiggle = new Bounce(260, 9);
  private readonly hover = new Bounce(420, 16);
  private readonly badgeBounce = new Bounce(380, 10);
  private away = 0;
  private time = 0;
  private hovered = false;
  private nudge = 0;
  private count = -1;
  private completion = { found: -1, total: 0 };
  /** Called when a stamp lands (the stamp sound). */
  onStamp: (() => void) | null = null;
  onPress: (() => void) | null = null;
  onHover: (() => void) | null = null;
  /** Stamps landed since the world opened, for the test hook. */
  landed = 0;
  /** The badge's number now (0 hides it). */
  newCount = 0;

  constructor(private readonly sim: Sim) {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.position.set(JOURNAL_AT.x, JOURNAL_AT.y);
    this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= 58 && y >= -62 && y <= 72 };
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hover.kick(0.82);
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hover.kick(1.25);
      this.onPress?.();
    });
    this.on('pointerover', () => {
      this.hovered = true;
      this.hover.target = 1.1;
      this.wiggle.kick(1.08);
      this.onHover?.();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.hover.target = 1;
    });
    this.badge.addChild(this.badgeArt);
    this.badge.position.set(38, -44);
    this.book.addChild(this.cover, this.glow, this.badge);
    this.addChild(this.book, this.stampLayer);
    // What the world already has shows at once, without a fuss.
    for (const s of this.current()) this.remember(s);
  }

  private current(): Stamp[] {
    return stampsOf({
      secrets: this.sim.secrets,
      unlocks: (id) => this.sim.content.secrets.tryGet(id)?.unlocks ?? [],
      hinted: this.sim.bench.state.hinted,
      made: this.sim.bench.state.made,
    });
  }

  private remember(s: Stamp): void {
    this.seen.add(s.key);
    this.history.push(s);
    while (this.history.length > STAMP_UI.shown) this.history.shift();
  }

  /** A photo landed on it: wiggle. */
  bump(): void {
    this.wiggle.kick(1.3);
  }

  /** The book's state for the cover and the badge. */
  setBook(completion: { found: number; total: number }, newCount: number): void {
    if (completion.found !== this.completion.found || completion.total !== this.completion.total) {
      this.completion = { ...completion };
      this.cover.clear();
      drawCover(this.cover, 84, 100, completion, false, false);
    }
    if (newCount !== this.count) {
      const grew = newCount > this.count && this.count >= 0;
      this.count = newCount;
      this.newCount = newCount;
      const text = badgeText(newCount);
      this.badge.visible = text !== null;
      const g = this.badgeArt.clear();
      if (text) {
        const w = Math.max(40, 16 + text.length * 17);
        g.roundRect(-w / 2, -20, w, 40, 20)
          .fill(0xff3b4a)
          .stroke(stroke(4.5));
        g.roundRect(-w / 2 + 6, -15, w - 12, 10, 5).fill({ color: 0xffffff, alpha: 0.35 });
        drawNumber(g, text, 0, 1, 22, 0xffffff);
      }
      this.badgeBounce.kick(grew ? 1.6 : 1.2);
      if (grew) this.wiggle.kick(1.3);
    }
  }

  /** `wall` is wall-clock seconds since the last frame: the fade counts real time, however slow the frames. */
  update(dt: number, pointer: { x: number; y: number } | null, wall = dt): void {
    this.time += dt;
    for (const s of freshStamps(this.seen, this.current())) {
      this.remember(s);
      const g = new Graphics();
      drawStamp(g, s, this.sim);
      g.visible = false;
      this.stampLayer.addChild(g);
      this.queue.push({ stamp: s, g, t: -1, wait: STAMP_UI.landDelay });
    }
    let landing = false;
    // One stamp at a time: each waits for the one before it to tuck away.
    const v = this.queue[0];
    if (v) {
      landing = true;
      if (v.t < 0) {
        v.wait -= dt;
        if (v.wait <= 0) v.t = 0;
      }
      if (v.t >= 0) {
        const before = v.t;
        // With a pile of stamps waiting (a big find), they go faster.
        v.t += dt * (this.queue.length > 3 ? 3 : 1);
        v.g.visible = true;
        if (v.t < STAMP_HOLD) {
          // It slams onto the cover, a bit big, tilted.
          const slam = stampSlam(v.t);
          v.g.scale.set(slam.scale * 1.5);
          v.g.alpha = slam.alpha;
          v.g.position.set(-6, 6);
          v.g.rotation = -0.18;
        } else {
          // Then it shrinks into the pages.
          const u = Math.min(1, (v.t - STAMP_HOLD) / STAMP_TUCK);
          v.g.scale.set(1.5 * (1 - u));
          v.g.position.set(-6 + 30 * u, 6 + 10 * u);
          v.g.rotation = -0.18 + u * 0.8;
          v.g.alpha = 1 - u * 0.5;
        }
        if (before < 0.16 && v.t >= 0.16) {
          this.landed++;
          this.wiggle.kick(1.3);
          this.onStamp?.();
        }
        if (v.t >= STAMP_HOLD + STAMP_TUCK) {
          this.queue.shift();
          v.g.destroy();
          this.wiggle.kick(1.15);
          this.badgeBounce.kick(1.4);
        }
      }
    }
    // Things not yet looked at: a little nudge every few seconds.
    if (this.newCount > 0 && !landing) {
      this.nudge += dt;
      if (this.nudge > 6) {
        this.nudge = 0;
        this.wiggle.kick(1.12);
      }
    } else this.nudge = 0;
    // The jar's dots glow and twinkle.
    const glow = this.glow.clear();
    if (this.completion.found > 0) {
      const n = jarDotCount(this.completion.found, this.completion.total, 18);
      const k = 84 / 84;
      jarDots(n, 34 * k, 40 * k, 4 * k).forEach((p, i) => {
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 2.4 + i * 1.7);
        glowDot(glow, 6 + p.x, 4 + p.y, 3.4 * pulse);
      });
    }
    const near = pointer !== null && Math.hypot(pointer.x - this.x, pointer.y - this.y) < STAMP_UI.nearPx;
    this.away = near || this.hovered ? 0 : this.away + wall;
    const target = landing ? 1 : iconAlpha(this.away);
    this.alpha += (target - this.alpha) * Math.min(1, dt * 8);
    const w = this.wiggle.update(dt);
    const h = this.hover.update(dt);
    this.book.scale.set(w * h);
    this.book.rotation = (w - 1) * 0.6;
    this.badge.scale.set(this.badgeBounce.update(dt));
  }

  /** For the test hook. */
  info(): {
    stamps: { kind: StampKind; ref: string }[];
    total: number;
    landed: number;
    alpha: number;
    visible: boolean;
    badge: number;
  } {
    return {
      stamps: this.history.map((s) => ({ kind: s.kind, ref: s.ref })),
      total: this.seen.size,
      landed: this.landed,
      alpha: this.alpha,
      visible: this.visible,
      badge: this.badge.visible ? this.newCount : 0,
    };
  }
}
