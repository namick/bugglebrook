import { Container, Graphics } from 'pixi.js';
import type { EntityId } from '../../../game/core/entities';
import type { BugDef, ItemDef } from '../../../game/data/types';
import type { Glyph } from '../../../game/data/glyphs';
import { drawGlyph } from './draw/glyphs';
import { ItemSprite } from './draw/item';
import { drawFriend, drawPicto } from './draw/pictogram';
import { stroke } from './palette';
import type { Picto } from './reactions';

export type BubbleKind = 'speech' | 'thought';

/** Size of one pictogram slot in a bubble, in pixels. */
const SLOT = 52;
const PAD = 16;

/** The bubble a bug is showing, for the test hook. */
export interface BubbleInfo {
  bugId: EntityId;
  kind: BubbleKind;
  pictos: readonly Picto[];
}

/**
 * Pop-in scale for a bubble `t` seconds old that lives `life` seconds:
 * overshoots on the way in, shrinks away at the end. Pure.
 */
export function bubbleScale(t: number, life: number): number {
  if (t < 0 || t >= life) return 0;
  if (t < 0.25) {
    const u = t / 0.25;
    return 1 + Math.sin(u * Math.PI) * 0.25 - (1 - u) * (1 - u);
  }
  const out = life - t;
  return out < 0.15 ? out / 0.15 : 1;
}

class Bubble extends Container {
  age = 0;
  private readonly g = new Graphics();
  private readonly icons = new Graphics();
  private readonly w: number;
  private readonly h = SLOT + PAD;
  private readonly pictos: readonly Picto[];

  constructor(
    readonly info: BubbleInfo,
    readonly life: number,
    food: ItemDef | null,
    friend: BugDef | null = null,
    glyph: Glyph | null = null,
  ) {
    super();
    const pictos = info.pictos.filter(
      (p) => (p !== 'food' || food) && (p !== 'friend' || friend) && (p !== 'glyph' || glyph),
    );
    this.w = PAD + pictos.length * SLOT;
    this.addChild(this.g, this.icons);
    const { w, h } = this;
    if (info.kind === 'speech') {
      this.g
        .roundRect(-w / 2, -h, w, h, 22)
        .fill(0xffffff)
        .stroke(stroke(5));
      // The tail, pointing down at the speaker.
      this.g.poly([-12, -3, 12, -3, -2, 20]).fill(0xffffff).stroke(stroke(5));
      this.g.rect(-10, -8, 20, 7).fill(0xffffff);
    } else {
      // A thought: a lumpy cloud, then two little puffs trailing down.
      const bumps = Math.max(4, Math.round(w / 34));
      for (let i = 0; i < bumps; i++) {
        const bx = -w / 2 + 14 + (i / (bumps - 1)) * (w - 28);
        this.g
          .circle(bx, -h * 0.78, 22)
          .fill(0xffffff)
          .stroke(stroke(4.5));
        this.g
          .circle(bx, -h * 0.22, 22)
          .fill(0xffffff)
          .stroke(stroke(4.5));
      }
      this.g
        .roundRect(-w / 2 - 4, -h * 0.85, w + 8, h * 0.7, 26)
        .fill(0xffffff)
        .stroke(stroke(4.5));
      this.g.roundRect(-w / 2 + 2, -h * 0.84, w - 4, h * 0.68, 24).fill(0xffffff);
      this.g.circle(-6, 14, 9).fill(0xffffff).stroke(stroke(4));
      this.g.circle(-14, 32, 5).fill(0xffffff).stroke(stroke(3.5));
    }
    pictos.forEach((p, i) => {
      const x = -w / 2 + PAD / 2 + SLOT / 2 + i * SLOT;
      const y = -h / 2;
      if (p === 'food' && food) {
        const icon = new ItemSprite(food, 3);
        const s = food.shape;
        const size = s.type === 'circle' ? s.radius * 2 : Math.max(s.width, s.height);
        icon.scale.set(Math.min(1.4, 0.4 / size));
        icon.position.set(x, y + 2);
        this.addChild(icon);
      }
      if (p === 'friend' && friend) {
        const face = new Graphics();
        drawFriend(face, friend, x, y + 2, SLOT * 0.72);
        this.addChild(face);
      }
      if (p === 'glyph' && glyph) {
        const art = new Graphics();
        drawGlyph(art, glyph, x, y + 2, SLOT * 0.8);
        this.addChild(art);
      }
    });
    this.pictos = pictos;
  }

  update(dt: number): boolean {
    this.age += dt;
    const k = bubbleScale(this.age, this.life);
    this.scale.set(k);
    // A gentle bob so it feels alive.
    this.pivot.y = Math.sin(this.age * 3) * 2;
    this.icons.clear();
    this.pictos.forEach((p, i) => {
      if (p === 'food' || p === 'friend' || p === 'glyph') return;
      const x = -this.w / 2 + PAD / 2 + SLOT / 2 + i * SLOT;
      drawPicto(this.icons, p, x, -this.h / 2, SLOT * 0.72, this.age);
    });
    return this.age < this.life;
  }
}

/**
 * Speech and thought bubbles over bugs' heads, one per bug. A new bubble
 * replaces the old one. Positions are world pixels.
 */
export class Bubbles extends Container {
  private readonly bubbles = new Map<EntityId, Bubble>();

  show(
    bugId: EntityId,
    kind: BubbleKind,
    pictos: readonly Picto[],
    seconds: number,
    food: ItemDef | null = null,
    friend: BugDef | null = null,
    glyph: Glyph | null = null,
  ): void {
    if (pictos.length === 0) return;
    this.hide(bugId);
    const b = new Bubble({ bugId, kind, pictos }, seconds, food, friend, glyph);
    this.bubbles.set(bugId, b);
    this.addChild(b);
  }

  hide(bugId: EntityId): void {
    const old = this.bubbles.get(bugId);
    if (!old) return;
    old.destroy({ children: true });
    this.bubbles.delete(bugId);
  }

  kindOf(bugId: EntityId): BubbleKind | null {
    return this.bubbles.get(bugId)?.info.kind ?? null;
  }

  /** `anchor` gives the point above each bug's head, or null if it is gone. */
  update(dt: number, anchor: (id: EntityId) => { x: number; y: number } | null): void {
    const placed: Bubble[] = [];
    for (const [id, b] of [...this.bubbles]) {
      const at = anchor(id);
      if (!at || !b.update(dt)) {
        this.hide(id);
        continue;
      }
      // Stack bubbles that would overlap, newest on top.
      let y = at.y;
      for (const other of placed)
        if (Math.abs(other.x - at.x) < (other.width + b.width) / 2 && Math.abs(other.y - y) < b.height)
          y = other.y - b.height - 6;
      b.position.set(at.x, y);
      placed.push(b);
    }
  }

  list(): BubbleInfo[] {
    return [...this.bubbles.values()].map((b) => ({ ...b.info, pictos: [...b.info.pictos] }));
  }
}
