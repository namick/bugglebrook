import { Container, Graphics } from 'pixi.js';
import type { Sim } from '../../../game';
import { POCKET_SLOTS } from '../../../game/systems/pocket';
import { BugSprite, standaloneFrame } from '../render/draw/bug';
import { bugSpan } from '../render/draw/species';
import { ItemSprite } from '../render/draw/item';
import { OUTLINE, lighten, stroke } from '../render/palette';
import { markUi } from './button';
import {
  POCKET,
  POCKET_WIDTH,
  POCKET_X,
  pipCount,
  slideTray,
  slotAt,
  slotRect,
  trayTop,
  trayWantsOpen,
} from './pocketLayout';

const DENIM = 0x3e5c8a;
const DENIM_DARK = 0x2c4468;
const STITCH = 0xf2c14e;
/** The biggest a pocketed thing is drawn, in pixels. */
const FIT = 78;

interface SlotView {
  key: string;
  content: Container;
  sprite: BugSprite | ItemSprite | null;
  pips: Graphics;
  front: Graphics;
  lift: number;
  pop: number;
}

/** A dashed line of stitches from (x0, y0) to (x1, y1). */
function stitches(g: Graphics, x0: number, y0: number, x1: number, y1: number, dash = 11, gap = 8): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e);
  }
  g.stroke({ width: 3.5, color: STITCH, cap: 'round' });
}

/**
 * The pocket tray (game design doc, section 2): a denim strip with yellow
 * stitching at the bottom center, six pockets. It slides up in 150 ms while
 * the player holds something or hovers the bottom 60 px, and keeps a slim
 * tab showing once it holds anything. Pocketed things peek over the pocket
 * fronts (bugs blink); stacks show pips. While holding something over a
 * pocket, that pocket lifts and glows, orange if dropping there will swap.
 * Reads the sim; never writes to it.
 */
export class PocketTray extends Container {
  /** 0 hidden, 1 fully up. */
  open = 0;
  private readonly back = new Graphics();
  private readonly glow = new Graphics();
  private readonly slotLayer = new Container();
  private readonly slots: SlotView[] = [];
  private time = 0;
  private hasContents = false;
  /** 0 to 1: the hidden tray's flap peeking up as an affordance hint (the hand rests near the bottom). */
  private peek = 0;

  constructor(private readonly sim: Sim) {
    super();
    markUi(this);
    this.addChild(this.back, this.slotLayer, this.glow);
    this.drawBack();
    for (let i = 0; i < POCKET_SLOTS; i++) {
      const content = new Container();
      const pips = new Graphics();
      const front = new Graphics();
      this.drawFront(front);
      const holder = new Container();
      holder.addChild(this.drawInside(), content, front, pips);
      this.slotLayer.addChild(holder);
      this.slots.push({ key: '', content, sprite: null, pips, front, lift: 0, pop: 0 });
    }
    this.layout();
  }

  private drawBack(): void {
    const g = this.back;
    const w = POCKET_WIDTH;
    const h = POCKET.height + 40;
    g.roundRect(4, 10, w, h, 28).fill({ color: OUTLINE, alpha: 0.25 });
    g.roundRect(0, 0, w, h, 28).fill(DENIM).stroke(stroke(6));
    // Denim weave.
    for (let x = 18; x < w - 10; x += 14)
      g.moveTo(x, 8)
        .lineTo(x - 8, h - 8)
        .stroke({ width: 1.5, color: lighten(DENIM, 0.08), alpha: 0.6 });
    stitches(this.back, 14, 12, w - 14, 12);
    stitches(this.back, 14, 12, 14, h - 10);
    stitches(this.back, w - 14, 12, w - 14, h - 10);
    // The tab's little loop, so a closed pocket still says "pocket".
    g.roundRect(w / 2 - 34, -8, 68, 22, 10)
      .fill(DENIM_DARK)
      .stroke(stroke(4));
    g.circle(w / 2, 3, 5)
      .fill(0xc9a227)
      .stroke(stroke(2.5));
  }

  private drawInside(): Graphics {
    const g = new Graphics();
    const r = { w: POCKET.slotW, h: POCKET.slotH };
    g.roundRect(0, 0, r.w, r.h, 18).fill(DENIM_DARK).stroke(stroke(4));
    return g;
  }

  private drawFront(g: Graphics): void {
    const w = POCKET.slotW;
    const h = POCKET.slotH;
    const top = h * 0.48;
    g.moveTo(-4, top)
      .quadraticCurveTo(w / 2, top + 16, w + 4, top)
      .lineTo(w + 4, h - 10)
      .quadraticCurveTo(w + 4, h + 2, w - 12, h + 2)
      .lineTo(-4 + 16, h + 2)
      .quadraticCurveTo(-4, h + 2, -4, h - 10)
      .closePath()
      .fill(lighten(DENIM, 0.12))
      .stroke(stroke(4.5));
    g.moveTo(6, top + 9)
      .quadraticCurveTo(w / 2, top + 24, w - 6, top + 9)
      .stroke({ width: 3, color: STITCH, cap: 'round' });
    g.circle(w / 2, top + 30, 6)
      .fill(0xc9a227)
      .stroke(stroke(2.5));
  }

  private layout(): void {
    const top = trayTop(this.open, this.hasContents) - this.peek * 36 * (1 - this.open);
    this.back.position.set(POCKET_X, top);
    this.slots.forEach((s, i) => {
      const r = slotRect(i, top);
      const holder = s.content.parent!;
      holder.position.set(r.x, r.y - s.lift * 12);
    });
  }

  /** The slot under a view point, or null (only while the tray is open enough). */
  slotAt(x: number, y: number): number | null {
    return slotAt(x, y, this.open, this.hasContents);
  }

  /** Center of slot `i` in view pixels, as it sits now. */
  slotCenter(i: number): { x: number; y: number } {
    const r = slotRect(i, trayTop(this.open, this.hasContents));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** Pop a slot's art (something went in or came out). */
  bump(slot: number): void {
    const s = this.slots[slot];
    if (s) s.pop = 1;
  }

  private refresh(): void {
    const all = this.sim.pocketSlots();
    this.hasContents = all.some((s) => s.ids.length > 0);
    all.forEach((slot, i) => {
      const view = this.slots[i]!;
      const key = `${slot.defId ?? ''}:${slot.ids.length}`;
      if (key === view.key) return;
      view.key = key;
      view.content.removeChildren().forEach((c) => c.destroy({ children: true }));
      view.sprite = null;
      if (slot.defId && slot.kind) {
        let sprite: BugSprite | ItemSprite;
        let size: number;
        if (slot.kind === 'bug') {
          const def = this.sim.content.bugs.get(slot.defId);
          sprite = new BugSprite(def);
          size = bugSpan(def);
        } else {
          const def = this.sim.content.items.get(slot.defId);
          sprite = new ItemSprite(def, slot.ids[slot.ids.length - 1]!);
          const s = def.shape;
          size = (s.type === 'circle' ? s.radius * 2 : Math.max(s.width, s.height)) * 100;
        }
        const k = Math.min(1.25, FIT / Math.max(1, size));
        sprite.scale.set(k);
        // Bugs peek: eyes over the pocket's lip. Items sit a little lower.
        sprite.position.set(
          POCKET.slotW / 2,
          slot.kind === 'bug' ? POCKET.slotH * 0.34 : POCKET.slotH * 0.42,
        );
        view.content.addChild(sprite);
        view.sprite = sprite;
      }
      const pips = view.pips.clear();
      const n = pipCount(slot.ids.length);
      for (let p = 0; p < n; p++) {
        const x = POCKET.slotW / 2 + (p - (n - 1) / 2) * 11;
        pips
          .circle(x, POCKET.slotH - 10, 4)
          .fill(STITCH)
          .stroke(stroke(2));
      }
    });
  }

  /**
   * `holding` is the thing in the hand (or null); `pointer` is the cursor in
   * view pixels (or null when it left the window).
   */
  update(
    dt: number,
    holding: number | null,
    pointer: { x: number; y: number } | null,
    hint: { demo: boolean; glint: number; wobble: number } = { demo: false, glint: 0, wobble: 0 },
  ): void {
    this.time += dt;
    this.refresh();
    // It stays up while the hand is over the tray itself.
    const overTray =
      !!pointer &&
      this.open > 0 &&
      pointer.y >= trayTop(this.open, this.hasContents) - 10 &&
      pointer.x >= POCKET_X - 20 &&
      pointer.x <= POCKET_X + POCKET_WIDTH + 20;
    // The ghost hand's pocket demo slides it up too (it shows; nothing goes in).
    this.open = slideTray(
      this.open,
      overTray || hint.demo || trayWantsOpen(holding !== null, pointer?.y ?? null),
      dt,
    );
    this.peek += (hint.glint - this.peek) * Math.min(1, dt * 10);
    this.x = hint.wobble * 7 * (1 - this.open);
    this.visible = this.open > 0 || this.hasContents || this.peek > 0.02;
    const over = holding !== null && pointer ? this.slotAt(pointer.x, pointer.y) : null;
    const glow = this.glow.clear();
    const contents = this.sim.pocketSlots();
    this.slots.forEach((s, i) => {
      s.lift += ((over === i ? 1 : 0) - s.lift) * Math.min(1, dt * 16);
      s.pop = Math.max(0, s.pop - dt * 3);
      const holder = s.content.parent!;
      const k = 1 + s.pop * 0.18 * Math.sin(s.pop * Math.PI);
      holder.scale.set(k);
      if (s.sprite instanceof BugSprite) {
        const art = s.sprite.def.art;
        // Munch keeps his form in the pocket: a cocoon or a butterfly.
        const top = contents[i]?.ids.at(-1);
        const morph = top === undefined ? undefined : this.sim.view(top)?.bug?.form;
        s.sprite.update(standaloneFrame('st_idle', this.time + i * 1.7, dt, i * 2.3, art, morph));
      } else if (s.sprite) {
        s.sprite.rotation = Math.sin(this.time * 1.5 + i) * 0.06;
        s.sprite.update(dt);
      }
    });
    this.layout();
    if (over !== null && holding !== null) {
      const r = slotRect(over, trayTop(this.open, this.hasContents));
      const swap = !this.sim.pocketFits(over, holding);
      const pulse = 0.55 + 0.25 * Math.sin(this.time * 12);
      glow
        .roundRect(r.x - 8, r.y - 20, r.w + 16, r.h + 20, 22)
        .stroke({ width: 8, color: swap ? 0xffa94d : 0xfff3b0, alpha: pulse + 0.2 });
    }
  }

  /** Is the tray showing enough to catch a drop? */
  get isOpen(): boolean {
    return this.open >= 0.5;
  }
}
