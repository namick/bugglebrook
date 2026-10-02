import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { CONTENT } from '../../../game/data';
import type { SaveFile } from '../../../game';
import { drawFriend } from '../render/draw/pictogram';
import { OUTLINE, darken, stroke } from '../render/palette';
import { Bounce, markUi } from './button';
import { drawDotJar } from '../journal/entryArt';
import { secretJar } from '../journal/layout';
import { drawBoard } from './controls';
import { CREAM, LEAF, LEAF_DARK, sproutIcon } from './icons';
import { padlockIcon } from './saveIcons';
import type { SlotLock } from '../app/saveService';

export const SIGN_W = 380;
export const SIGN_H = 340;
const THUMB_W = 320;
const THUMB_H = 180;
/** A press that moves farther than this is a drag, not a click. */
const DRAG_PX = 14;

/** What a used slot's sign shows. Pure, so the badge rule is unit-tested. */
export interface SlotPicture {
  thumb: string | null;
  /** The bug the player fed most (the badge), or null if nobody was fed yet. */
  badge: string | null;
  /** Bug defs living in the world, for the row of little faces. */
  bugs: string[];
  /** 0 to 1: the share of the world's findable secrets it has found (playtest F4). */
  fill: number;
}

export function slotPicture(save: SaveFile): SlotPicture {
  const fed = save.world.counters?.fed ?? {};
  let badge: string | null = null;
  let most = 0;
  for (const [defId, n] of Object.entries(fed).sort(([a], [b]) => a.localeCompare(b)))
    if (n > most && CONTENT.bugs.has(defId)) {
      most = n;
      badge = defId;
    }
  const bugs = [
    ...new Set(
      // Bugs still waiting to be found are not in the cast yet.
      save.world.entities
        .filter((e) => e.kind === 'bug' && CONTENT.bugs.has(e.defId) && !e.bug?.pending)
        .map((e) => e.defId),
    ),
  ].sort();
  // A bad picture never costs the slot: it just shows no picture.
  const thumb =
    save.meta.thumb && /^data:image\/(png|jpeg|webp);base64,/.test(save.meta.thumb) ? save.meta.thumb : null;
  return { thumb, badge, bugs, fill: secretJar(CONTENT, save.world.secrets).fill };
}

/** A data URL as a texture, once the image has decoded. */
export async function textureFromDataUrl(url: string): Promise<Texture | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Texture.from(img);
  } catch {
    return null;
  }
}

/**
 * One save slot on the menu (game design doc, section 17): a big wooden sign
 * on a post. Empty, it shows a sprout in a pot with a plus leaf. Used, it
 * shows a picture of the world from the last save, a round badge with the
 * face of the bug the player fed most, a jar of glowing dots that fills as
 * the world's secrets are found, and a little face for each bug that lives
 * there.
 *
 * Click to play. A used sign can be dragged: drop it on the compost bin to
 * delete the slot (the bin's lid is the confirm).
 *
 * A slot whose save will not open (from a newer game, or broken with no
 * backup that loads) shows a padlock. Clicking it only shakes the sign. It
 * can go in the bin, which moves its files aside rather than deleting them.
 */
export class SlotSign extends Container {
  readonly board = new Container();
  private readonly face = new Container();
  private readonly bounce = new Bounce(380, 13);
  private time = Math.random() * 10;
  private sprout: Graphics | null = null;
  private press: { x: number; y: number; ox: number; oy: number } | null = null;
  /** Being dragged by the pointer. */
  dragging = false;
  /** Where the sign stands when nobody moves it. */
  home = { x: 0, y: 0 };
  private tilt = 0;
  /**
   * How far below its spot the art still is while it pops up. Only the art
   * moves: the sign's hit area stands at its spot from the start, so it can
   * be clicked at once.
   */
  rise = 0;
  private readonly post: Graphics;
  private lastX = 0;
  /** Seconds left of the "can't open" shake. */
  private shake = 0;
  picture: SlotPicture | null = null;
  /** Why the slot will not open, or null. */
  locked: SlotLock | null = null;
  onClick: (() => void) | null = null;
  onDragStart: (() => void) | null = null;
  onDrop: (() => void) | null = null;

  constructor(
    readonly slot: number,
    picture: SlotPicture | null,
    locked: SlotLock | null = null,
  ) {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const post = new Graphics();
    this.post = post;
    post
      .rect(-14, SIGN_H / 2 - 20, 28, 260)
      .fill(0x9a6436)
      .stroke(stroke(6));
    post
      .moveTo(-6, SIGN_H / 2 + 20)
      .lineTo(-6, SIGN_H / 2 + 200)
      .stroke({ width: 3, color: darken(0x9a6436, 0.3) });
    this.addChild(post, this.board);
    this.board.addChild(drawBoard(new Graphics(), SIGN_W, SIGN_H, 0xd49a5e), this.face);
    const hit = new Graphics().rect(-SIGN_W / 2, -SIGN_H / 2, SIGN_W, SIGN_H).fill({ color: 0, alpha: 0 });
    this.addChild(hit);
    this.setPicture(picture, locked);

    this.on('pointerover', () => {
      if (!this.dragging) this.bounce.target = 1.05;
    });
    this.on('pointerout', () => (this.bounce.target = 1));
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const p = this.parent!.toLocal(e.global);
      this.press = { x: p.x, y: p.y, ox: this.x, oy: this.y };
      this.bounce.kick(0.9);
    });
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.press) return;
      const p = this.parent!.toLocal(e.global);
      const dx = p.x - this.press.x;
      const dy = p.y - this.press.y;
      if (!this.dragging && Math.hypot(dx, dy) > DRAG_PX && (this.picture || this.locked)) {
        this.dragging = true;
        this.bounce.target = 0.8;
        this.onDragStart?.();
      }
      if (this.dragging) this.position.set(this.press.ox + dx, this.press.oy + dy);
    });
    const up = (e: FederatedPointerEvent): void => {
      if (!this.press) return;
      e.stopPropagation();
      this.press = null;
      if (this.dragging) {
        this.dragging = false;
        this.bounce.target = 1;
        this.onDrop?.();
      } else {
        this.bounce.kick(1.15);
        this.onClick?.();
      }
    };
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
  }

  /** The pointer is down on this sign. */
  get pressed(): boolean {
    return this.press !== null;
  }

  /** Forget any press or drag in progress (the slot was deleted under the hand). */
  letGo(): void {
    this.press = null;
    this.dragging = false;
    this.bounce.target = 1;
  }

  /** Times the sign said no, for the test hook. */
  refusals = 0;

  /** Can't open: a quick side-to-side shake. */
  refuse(): void {
    this.shake = 0.45;
    this.refusals++;
  }

  /** Show a slot's picture, a padlock for a locked slot, or the sprout for an empty one. */
  setPicture(picture: SlotPicture | null, locked: SlotLock | null = null): void {
    this.picture = picture;
    this.locked = picture ? null : locked;
    this.face.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.sprout = null;
    if (!picture && this.locked) {
      const halo = new Graphics().circle(0, -6, 118).fill({ color: 0x5b4a5e, alpha: 0.18 });
      const lock = padlockIcon(new Graphics(), 190, this.locked === 'newer');
      lock.position.set(0, -10);
      this.face.addChild(halo, lock);
      return;
    }
    if (!picture) {
      const halo = new Graphics().circle(0, -6, 118).fill({ color: CREAM, alpha: 0.35 });
      const sprout = sproutIcon(new Graphics(), 190);
      sprout.position.set(0, -24);
      this.sprout = sprout;
      this.face.addChild(halo, sprout);
      return;
    }
    // The picture of the world, in a frame.
    const frame = new Graphics();
    const fx = -THUMB_W / 2;
    const fy = -SIGN_H / 2 + 26;
    frame
      .roundRect(fx - 8, fy - 8, THUMB_W + 16, THUMB_H + 16, 16)
      .fill(0x7a4e32)
      .stroke(stroke(5));
    frame.roundRect(fx, fy, THUMB_W, THUMB_H, 10).fill(0xbfe6ff);
    this.face.addChild(frame);
    if (picture.thumb) {
      const url = picture.thumb;
      void textureFromDataUrl(url).then((tex) => {
        if (!tex || this.picture?.thumb !== url || this.destroyed) return;
        const img = new Sprite(tex);
        img.width = THUMB_W;
        img.height = THUMB_H;
        img.position.set(fx, fy);
        const mask = new Graphics().roundRect(fx, fy, THUMB_W, THUMB_H, 10).fill(0xffffff);
        img.mask = mask;
        this.face.addChildAt(mask, 1);
        this.face.addChildAt(img, 2);
      });
    }
    // The badge: the face of the bug fed most.
    const badge = new Graphics();
    const bx = fx + 20;
    const by = fy + 12;
    badge.circle(bx, by + 4, 40).fill({ color: OUTLINE, alpha: 0.25 });
    badge.circle(bx, by, 40).fill(0xffe28a).stroke(stroke(6));
    badge.circle(bx, by, 31).stroke({ width: 3, color: 0xe0a82e });
    if (picture.badge) drawFriend(badge, CONTENT.bugs.get(picture.badge), bx, by, 50);
    else {
      // Nobody fed yet: a little leaf.
      badge.ellipse(bx, by, 13, 21).fill(LEAF).stroke(stroke(4));
      badge
        .moveTo(bx, by - 14)
        .lineTo(bx, by + 16)
        .stroke({ width: 2.5, color: LEAF_DARK });
    }
    this.face.addChild(badge);
    // The jar and the row of bug faces.
    const stats = new Graphics();
    drawDotJar(stats, 76, picture.fill);
    stats.position.set(-SIGN_W / 2 + 62, SIGN_H / 2 - 64);
    this.face.addChild(stats);
    const faces = new Graphics();
    const n = picture.bugs.length;
    picture.bugs.forEach((defId, i) => {
      const x = -SIGN_W / 2 + 128 + i * Math.min(50, 220 / Math.max(1, n - 1));
      faces
        .circle(x, SIGN_H / 2 - 62, 22)
        .fill(CREAM)
        .stroke(stroke(4));
      drawFriend(faces, CONTENT.bugs.get(defId), x, SIGN_H / 2 - 62, 34);
    });
    this.face.addChild(faces);
  }

  update(dt: number, overBin = false): void {
    this.time += dt;
    const k = this.bounce.update(dt);
    this.board.scale.set(k);
    this.rise = this.rise < 0.5 ? 0 : this.rise * Math.exp(-12 * dt);
    this.board.y = this.post.y = this.rise;
    if (this.sprout) this.sprout.rotation = Math.sin(this.time * 1.7 + this.slot) * 0.05;
    if (!this.dragging && !overBin && !this.press) {
      // Spring home.
      this.x += (this.home.x - this.x) * Math.min(1, dt * 12);
      this.y += (this.home.y - this.y) * Math.min(1, dt * 12);
      if (Math.hypot(this.home.x - this.x, this.home.y - this.y) < 0.5)
        this.position.set(this.home.x, this.home.y);
    }
    // Swing a little as it moves.
    const vx = dt > 0 ? (this.x - this.lastX) / dt : 0;
    this.lastX = this.x;
    this.tilt += (Math.max(-0.35, Math.min(0.35, vx / 3000)) - this.tilt) * Math.min(1, dt * 8);
    this.shake = Math.max(0, this.shake - dt);
    const no = this.shake > 0 ? Math.sin(this.shake * 60) * 0.06 * (this.shake / 0.45) : 0;
    this.board.rotation = this.tilt + no + Math.sin(this.time * 1.1 + this.slot * 2) * 0.012;
    // The post stays behind while dragged.
    this.post.visible =
      !this.dragging && !overBin && Math.hypot(this.x - this.home.x, this.y - this.home.y) < 40;
  }
}
