import { Container, Graphics } from 'pixi.js';
import { CONTENT } from '../../../game/data';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { bugPose } from '../render/bugPose';
import { BugSprite } from '../render/draw/bug';
import { stroke } from '../render/palette';
import type { SlotSummary } from '../app/saveService';
import { PictureButton } from './button';

/** Each slot has its own bug color so players can tell them apart without words. */
export const SLOT_COLORS = [0xff4d5e, 0x7bd84a, 0x4d9bff] as const;
const CARD_W = 360;
const CARD_H = 420;

/**
 * Title screen: a big bug logo and three picture cards, one per save slot.
 * An empty slot shows a sprout; a used slot shows a little scene with a
 * count of things in that world.
 */
export class MenuScene extends Container {
  readonly buttons: PictureButton[] = [];
  private readonly logo: BugSprite;
  private time = 0;
  private cardBugs: BugSprite[] = [];

  constructor(slots: readonly SlotSummary[], onChoose: (slot: number) => void) {
    super();
    const bg = new Graphics();
    for (let i = 0; i < 10; i++) {
      bg.rect(0, (i * VIEW_HEIGHT_PX) / 10, VIEW_WIDTH_PX, VIEW_HEIGHT_PX / 10 + 1).fill(
        [0x7ec8ff, 0x86ccff, 0x8fd0ff, 0x99d5ff, 0xa3d9ff, 0xaddeff, 0xb7e2ff, 0xc1e7ff, 0xcbebff, 0xd6f0ff][
          i
        ]!,
      );
    }
    bg.rect(0, 930, VIEW_WIDTH_PX, 150).fill(0x6cc24a);
    bg.moveTo(0, 930).lineTo(VIEW_WIDTH_PX, 930).stroke(stroke());
    this.addChild(bg);

    const bip = CONTENT.bugs.get('bip');
    this.logo = new BugSprite({ ...bip, radius: 1.1 });
    this.logo.position.set(VIEW_WIDTH_PX / 2, 230);
    this.addChild(this.logo);

    slots.forEach((slot, i) => {
      const art = this.cardArt(slot, i);
      const button = new PictureButton(art, CARD_W, CARD_H, () => onChoose(slot.slot));
      button.position.set(VIEW_WIDTH_PX / 2 + (i - 1) * (CARD_W + 80), 640);
      button.label = `slot-${slot.slot}`;
      this.buttons.push(button);
      this.addChild(button);
    });
  }

  private cardArt(slot: SlotSummary, index: number): Container {
    const c = new Container();
    const color = SLOT_COLORS[index % SLOT_COLORS.length]!;
    const card = new Graphics()
      .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 40)
      .fill(0xfffbef)
      .stroke(stroke(8));
    // Window onto the slot's world.
    card
      .roundRect(-CARD_W / 2 + 30, -CARD_H / 2 + 30, CARD_W - 60, CARD_H - 150, 26)
      .fill(slot.save ? 0xbfe6ff : 0xe9e4d8);
    card.rect(-CARD_W / 2 + 30, 20, CARD_W - 60, 50).fill(slot.save ? 0x6cc24a : 0xc9b79c);
    card.roundRect(-CARD_W / 2 + 30, -CARD_H / 2 + 30, CARD_W - 60, CARD_H - 150, 26).stroke(stroke(5));
    c.addChild(card);

    const bug = new BugSprite({ ...CONTENT.bugs.get('bip'), body: color, spots: null, radius: 0.5 });
    bug.position.set(0, 140);
    this.cardBugs.push(bug);
    c.addChild(bug);

    const scene = new Graphics();
    if (slot.save) {
      // One pip per thing in the world, so fuller worlds look fuller.
      const count = Math.min(12, slot.save.world.entities.length);
      for (let k = 0; k < count; k++) {
        const x = -CARD_W / 2 + 60 + (k % 6) * 48;
        const y = -40 - Math.floor(k / 6) * 48;
        scene
          .circle(x, y, 16)
          .fill(k % 2 ? 0xffd23f : 0xff9f1c)
          .stroke(stroke(4));
      }
    } else {
      // A sprout: this slot is new.
      scene
        .moveTo(0, 20)
        .quadraticCurveTo(-6, -40, 0, -70)
        .stroke({ width: 10, color: 0x2e7d32, cap: 'round' });
      scene.ellipse(-34, -70, 34, 18).fill(0x7bd84a).stroke(stroke(5));
      scene.ellipse(34, -82, 34, 18).fill(0x7bd84a).stroke(stroke(5));
    }
    c.addChild(scene);
    return c;
  }

  update(dt: number): void {
    this.time += dt;
    this.logo.setPose(
      bugPose({ mode: 'idle', vx: 0, vy: 0, time: this.time, squash: 0, phase: 0 }),
      1,
      this.time,
    );
    this.cardBugs.forEach((b, i) =>
      b.setPose(
        bugPose({ mode: 'walk', vx: 0, vy: 0, time: this.time * 0.5, squash: 0, phase: i }),
        1,
        this.time,
      ),
    );
    for (const b of this.buttons) b.update(dt);
  }
}

/** A round house icon that returns to the menu. */
export function homeButton(onPress: () => void): PictureButton {
  const art = new Graphics();
  art.circle(0, 0, 48).fill(0xfffbef).stroke(stroke(6));
  art.poly([-24, -2, 0, -24, 24, -2]).fill(0xff4d5e).stroke(stroke(5));
  art.rect(-17, -2, 34, 26).fill(0xffd23f).stroke(stroke(5));
  art.rect(-6, 8, 12, 16).fill(0x8d5a3b);
  const button = new PictureButton(art, 100, 100, onPress);
  button.position.set(80, 80);
  button.label = 'home';
  return button;
}
