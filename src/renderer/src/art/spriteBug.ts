import type { Texture } from 'pixi.js';
import { Container, Graphics, MeshRope, Point, Sprite } from 'pixi.js';
import type { BugDef } from '../../../game/data/types';
import type { BugFrame } from '../render/draw/bug';
import { BugSprite, footRipple } from '../render/draw/bug';
import { drawEye, drawMouth } from '../render/draw/face';
import { drawPaintPatches, paintColors } from '../render/draw/paint';
import { drawThread } from '../render/draw/species/caterpillar';
import { TINTS, drawSwoosh } from '../render/draw/species/common';
import { CHEEK, darken, mix } from '../render/palette';
import type { Pt } from '../render/rig/bugRig';
import type { Extra, Skeleton, SkeletonFace, SkeletonItem, Slot } from '../render/rig/skeleton';
import { SLOTS, codeSkeleton, pivotOf } from '../render/rig/skeleton';
import type { AtlasSet, LoadedArt } from './artStore';
import type { FacePiece } from './faceKit';
import { cheekPiece, eyePieces, isMouth, mouthPiece, politePiece } from './faceKit';
import { KIT_EYE_R, KIT_MOUTH_W } from './kit';
import type { ManifestPart } from './rigFile';

/** Leg pieces stretch at most this much before the foot falls short instead. */
const STRETCH = [0.8, 1.25] as const;
/** Far legs: darker and a little see-through, like the code-drawn ones. */
const FAR_TINT = darken(0xffffff, 0.25);
const FAR_ALPHA = 0.75;
/** Points along a bendy feeler. */
const ROPE_POINTS = 9;

interface Tex {
  texture: Texture;
  anchor: { x: number; y: number };
  /** 1 for 1x pages, 0.5 for 2x (their pixels are half a game pixel). */
  k: number;
}

/** What the view showed last frame, for the test hook and the Art Lab. */
export interface SpriteShown {
  parts: string[];
  /** Face pieces drawn from art. */
  face: string[];
  /** Eyes and mouths drawn by code because a kit piece is missing. */
  codeFace: number;
  scale: 1 | 2;
  /** The face it was asked to show. */
  eyes: string;
  mouth: string;
  /** The rolled-up ball shown instead of the body, or null. */
  ball: string | null;
  /** How many paint patches are on. */
  paint: number;
  /** Effects the game draws over the art (ripples, the cocoon's thread, a chop's swoosh). */
  extras: string[];
}

/** A bendy feeler: the mesh, the points it follows, and the part it shows. */
interface Rope {
  mesh: MeshRope;
  pts: Point[];
  part: string;
}

type Node = Sprite | Rope;

const isRope = (n: Node | undefined): n is Rope => !!n && 'mesh' in n;

/**
 * A bug drawn from the artist's cutout parts (docs/06-art-guide.md, B7). It
 * is a `BugSprite` with the same container stack (stretch, spin, squash, the
 * facing flip), so everything `WorldView` does to a bug keeps working: potion
 * size, tints, alpha, sky grading. Each frame it asks for the bug's skeleton
 * (`codeSkeleton`, or the species painter's `skeleton`), which says where
 * every part goes: legs from hip to knee to foot, feelers along their
 * curves, shells on their hinges, segments, wings, and whole other forms.
 * The face comes from the face kit. Dizzy stars, steam, and a few effects
 * are still drawn by code.
 */
export class SpriteBugView extends BugSprite {
  /** The resolution the game renders at, to pick 1x or 2x pages (main.ts keeps it current). */
  static resolution = 1;
  /** Use these pages whatever the resolution (the Art Lab's 1x and 2x checks), or null to choose. */
  static forceScale: 1 | 2 | null = null;
  readonly shown: SpriteShown = {
    parts: [],
    face: [],
    codeFace: 0,
    scale: 1,
    eyes: '',
    mouth: '',
    ball: null,
    paint: 0,
    extras: [],
  };
  /** The last skeleton drawn (tests). */
  lastSkeleton: Skeleton | null = null;
  private readonly parts: Record<string, ManifestPart>;
  private pageScale: 1 | 2 = 1;
  private readonly sRim = new Container();
  private readonly slots: Record<Slot, Container>;
  private readonly nodes: Record<Slot, Node[]>;
  private readonly fxBack = new Graphics();
  private readonly fxTop = new Graphics();
  private readonly sPaint = new Container();
  private readonly paintPool: { g: Graphics; mask: Sprite; key: string }[] = [];
  private readonly sFace = new Container();
  private readonly sBall = new Container();
  private readonly ballSprite = new Sprite();
  private readonly faceSprites: Sprite[] = [];
  private readonly rimTwins = new Map<Sprite, Sprite>();

  constructor(
    def: BugDef,
    private readonly art: LoadedArt,
    private readonly kit: LoadedArt | null,
  ) {
    super(def);
    this.parts = art.entry.parts;
    for (const g of [
      this.legsBack,
      this.wings,
      this.body,
      this.shell,
      this.legsFront,
      this.antennae,
      this.rim,
      this.ball,
    ])
      g.visible = false;
    const make = (label: string): Container => {
      const c = new Container();
      c.label = label;
      return c;
    };
    this.slots = {
      back: make('art legs back'),
      wings: make('art wings'),
      body: make('art body'),
      shell: make('art shell'),
      front: make('art legs front'),
      top: make('art antennae'),
    };
    this.nodes = { back: [], wings: [], body: [], shell: [], front: [], top: [] };
    const after = (g: Container, c: Container): void => {
      this.rigLayer.addChildAt(c, this.rigLayer.getChildIndex(g) + 1);
    };
    this.sRim.label = 'art rim';
    after(this.rim, this.sRim);
    after(this.legsBack, this.slots.back);
    after(this.wings, this.slots.wings);
    after(this.body, this.slots.body);
    after(this.shell, this.fxBack);
    after(this.fxBack, this.slots.shell);
    after(this.legsFront, this.slots.front);
    after(this.antennae, this.slots.top);
    after(this.slots.top, this.fxTop);
    this.fxBack.label = 'art fx back';
    this.fxTop.label = 'art fx';
    this.sPaint.label = 'art paint';
    this.rigLayer.addChildAt(this.sPaint, this.rigLayer.getChildIndex(this.paintG));
    this.rigLayer.addChildAt(this.sFace, this.rigLayer.getChildIndex(this.faceG));
    this.sFace.label = 'art face';
    // The rolled-up ball turns with the body, outside the spin and squash.
    this.sBall.label = 'art ball';
    this.sBall.addChild(this.ballSprite);
    this.sBall.visible = false;
    const holder = this.ball.parent!;
    holder.addChildAt(this.sBall, holder.getChildIndex(this.ball) + 1);
    this.pageScale = this.pickScale();
  }

  /** The rig container (BugSprite's `rig`, named apart from the skeleton). */
  private get rigLayer(): Container {
    return this.rig;
  }

  private pickScale(): 1 | 2 {
    const wt = this.worldTransform;
    const k = Math.hypot(wt.a, wt.b) || 1;
    const want = SpriteBugView.forceScale ?? (SpriteBugView.resolution * Math.max(1, k) > 1.25 ? 2 : 1);
    return this.art.scales[want] ? want : this.art.scales[1] ? 1 : 2;
  }

  private setOf(asset: LoadedArt | null): AtlasSet | null {
    if (!asset) return null;
    return asset.scales[this.pageScale] ?? asset.scales[1] ?? asset.scales[2] ?? null;
  }

  /** A part's texture, or null if it isn't drawn. */
  private tex(name: string, asset: LoadedArt | null = this.art): Tex | null {
    const set = this.setOf(asset);
    const texture = set?.frames.get(name);
    if (!set || !texture) return null;
    return { texture, anchor: set.anchors.get(name)!, k: 1 / set.scale };
  }

  /** Put a part's texture on a sprite. Returns its scale for the art's pixels, or 0 if the part isn't drawn. */
  private dress(s: Sprite, name: string, asset: LoadedArt | null = this.art): number {
    s.label = name;
    const t = this.tex(name, asset);
    if (!t) {
      s.visible = false;
      return 0;
    }
    s.texture = t.texture;
    s.anchor.set(t.anchor.x, t.anchor.y);
    return t.k;
  }

  /** Drop every sprite (the page scale changed): they are made again on the next frame. */
  private clear(): void {
    for (const slot of SLOTS) {
      this.slots[slot].removeChildren().forEach((c) => c.destroy());
      this.nodes[slot].length = 0;
    }
    this.sRim.removeChildren().forEach((c) => c.destroy());
    this.rimTwins.clear();
  }

  /** The `n`th sprite in a slot, made or reused. */
  private spriteAt(slot: Slot, n: number): Sprite {
    const list = this.nodes[slot];
    const cur = list[n];
    if (cur && !isRope(cur)) return cur;
    const s = new Sprite();
    this.replace(slot, n, s);
    return s;
  }

  /** The `n`th rope in a slot, made (or remade for another part) or reused. */
  private ropeAt(slot: Slot, n: number, part: string): Rope | null {
    const list = this.nodes[slot];
    const cur = list[n];
    if (isRope(cur) && cur.part === part) return cur;
    const t = this.tex(part);
    if (!t) return null;
    const pts = Array.from({ length: ROPE_POINTS }, () => new Point());
    const width = t.texture.height * t.k;
    const mesh = new MeshRope({ texture: t.texture, points: pts, textureScale: 0, width });
    // MeshRope resets its width to the texture's height every frame; a 2x page is twice as tall.
    mesh.onRender = () => {
      const geo = mesh.geometry as unknown as { _width: number; update(): void };
      geo._width = width;
      geo.update();
    };
    mesh.label = part;
    const rope: Rope = { mesh, pts, part };
    this.replace(slot, n, rope);
    return rope;
  }

  private replace(slot: Slot, n: number, node: Node): void {
    const list = this.nodes[slot];
    const c = this.slots[slot];
    const old = list[n];
    if (old) {
      const o = isRope(old) ? old.mesh : old;
      c.removeChild(o);
      o.destroy();
    }
    list[n] = node;
    c.addChildAt(isRope(node) ? node.mesh : node, Math.min(n, c.children.length));
  }

  private place(s: Sprite, x: number, y: number, k: number, rotation = 0, sx = 1, sy = 1): void {
    s.visible = true;
    s.position.set(x, y);
    s.rotation = rotation;
    s.scale.set(k * sx, k * sy);
  }

  private color(s: Sprite, item: SkeletonItem): void {
    const tint = item.tint ?? (this.parts[s.label]?.tintable ? this.def.body : null);
    s.tint = tint ?? (item.far ? FAR_TINT : 0xffffff);
    s.alpha = item.alpha ?? (item.far ? FAR_ALPHA : 1);
  }

  /**
   * One limb or feeler piece from `a` toward `b`, stretched to fit (within
   * limits). Limbs are drawn straight down from their pivot; feelers are
   * stored lying along +x. Returns where it ends.
   */
  private bone(s: Sprite, name: string, a: Pt, b: Pt): Pt {
    const k = this.dress(s, name);
    if (!k) return b;
    const rest = this.parts[name]?.length ?? 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const stretch = Math.min(STRETCH[1], Math.max(STRETCH[0], d / rest));
    const angle = Math.atan2(dy, dx);
    if (this.parts[name]?.kind === 'rope') this.place(s, a.x, a.y, k, angle, stretch, 1);
    else this.place(s, a.x, a.y, k, angle - Math.PI / 2, 1, stretch);
    const len = rest * stretch;
    return { x: a.x + (dx / d) * len, y: a.y + (dy / d) * len };
  }

  /** A rigid part: its rig pivot goes to `at`; the art turns and scales about its own pivot. */
  private piece(s: Sprite, item: Extract<SkeletonItem, { kind: 'piece' }>): void {
    const k = this.dress(s, item.part);
    if (!k) return;
    const rot = item.rotation ?? 0;
    const sx = item.sx ?? 1;
    const sy = item.sy ?? 1;
    // The artist may have moved the pivot (a `pivot_` dot): keep the art where she drew it.
    const rigPivot = pivotOf(this.bones, item.part);
    const artPivot = this.parts[item.part]?.pivot ?? rigPivot;
    const ox = (artPivot.x - rigPivot.x) * sx;
    const oy = (artPivot.y - rigPivot.y) * sy;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    this.place(s, item.at.x + ox * c - oy * sn, item.at.y + ox * sn + oy * c, k, rot, sx, sy);
  }

  override update(frame: BugFrame): void {
    this.form = frame.face.form;
    const scale = this.pickScale();
    if (scale !== this.pageScale) {
      this.pageScale = scale;
      this.clear();
    }
    this.shown.scale = this.pageScale;

    // Feelers follow the body's acceleration, as on the code-drawn bug.
    const dt = Math.max(1e-3, frame.dt);
    const ax = ((frame.vx - this.lastV.x) / dt) * frame.facing;
    const ay = (frame.vy - this.lastV.y) / dt;
    this.lastV = { x: frame.vx, y: frame.vy };
    for (const s of this.springs)
      s.update(Math.max(-60, Math.min(60, ax)), Math.max(-60, Math.min(60, ay)), frame.dt);
    const sk = this.painter
      ? this.painter.skeleton(frame, this.springs)
      : codeSkeleton(this.bones, this.def, frame, this.springs, this.form ?? 'normal');
    this.lastSkeleton = sk;

    // The same container motion as the code-drawn bug.
    this.stretchA.rotation = frame.stretchAngle;
    this.stretchB.scale.set(frame.stretch, 1 / frame.stretch);
    this.stretchC.rotation = -frame.stretchAngle;
    this.spinLayer.rotation = frame.spin;
    const adj = sk.adjust;
    const still = { bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 };
    const move = adj.still ? still : (frame.move ?? still);
    const pose = adj.still ? { sx: 1, sy: 1, tilt: 0, bob: 0 } : frame.pose;
    this.squash.scale.set(pose.sx * frame.squashX * move.sx, pose.sy * frame.squashY * move.sy);
    this.squash.rotation = pose.tilt + (move.tilt + adj.tilt) * frame.facing;
    this.rigLayer.position.set(0, -this.foot + pose.bob + move.bob + adj.bob);
    this.rigLayer.scale.x =
      frame.facing * (Math.abs(move.flip) < 0.08 ? Math.sign(move.flip || 1) * 0.08 : move.flip);

    this.shown.ball = null;
    if (sk.ball) {
      this.showBall(frame, sk.ball);
      this.shown.parts = [sk.ball.part];
      this.shown.face = [];
      this.shown.codeFace = 0;
      this.shown.paint = 0;
      this.shown.extras = [];
      this.drawStars(frame, sk.crown ?? undefined);
      return;
    }
    this.spinLayer.visible = true;
    this.sBall.visible = false;

    const placed = this.drawItems(sk);
    this.washHead(sk, frame);
    this.drawFaceArt(frame, sk.face);
    this.drawExtras(frame, sk.extras);
    this.syncRim(frame.rim ?? 0);
    this.paintArt(frame, sk, placed);
    this.drawStars(frame, sk.crown ?? undefined);
  }

  /** Curled up: one part, rolling with the body's angle. */
  private showBall(frame: BugFrame, ball: NonNullable<Skeleton['ball']>): void {
    this.spinLayer.visible = false;
    this.sBall.visible = true;
    const s = this.ballSprite;
    const k = this.dress(s, ball.part);
    if (k) {
      const at = pivotOf(this.bones, ball.part);
      this.place(s, at.x, at.y, k);
      s.tint = ball.tint ?? 0xffffff;
    }
    this.sBall.rotation = frame.angle;
    this.sBall.scale.set(frame.squashX, frame.squashY);
    this.shown.ball = ball.part;
  }

  /** Every item in its slot, in order. Returns the sprite each item ended up on (pieces only). */
  private drawItems(sk: Skeleton): (Sprite | null)[] {
    const used: Record<Slot, number> = { back: 0, wings: 0, body: 0, shell: 0, front: 0, top: 0 };
    const placed: (Sprite | null)[] = [];
    const parts = new Set<string>();
    for (const item of sk.items) {
      const slot = item.slot;
      if (item.kind === 'rope') {
        const rope = this.ropeAt(slot, used[slot], item.part);
        placed.push(null);
        if (!rope) continue;
        used[slot]++;
        rope.mesh.visible = true;
        const pts = item.pts;
        rope.pts.forEach((q, i) => {
          const src = pts[Math.round((i / (ROPE_POINTS - 1)) * (pts.length - 1))]!;
          q.set(src.x, src.y);
        });
        rope.mesh.tint = item.tint ?? (item.far ? FAR_TINT : 0xffffff);
        rope.mesh.alpha = item.alpha ?? (item.far ? FAR_ALPHA : 1);
        parts.add(item.part);
        continue;
      }
      if (item.kind === 'limb') {
        const upper = this.spriteAt(slot, used[slot]++);
        if (item.lower) {
          const knee = this.bone(upper, item.part, item.hip, item.knee);
          const lower = this.spriteAt(slot, used[slot]++);
          this.bone(lower, item.lower, knee, item.foot);
          this.color(lower, item);
          if (lower.visible) parts.add(item.lower);
        } else this.bone(upper, item.part, item.hip, item.foot);
        this.color(upper, item);
        if (upper.visible) parts.add(item.part);
        placed.push(null);
        continue;
      }
      const s = this.spriteAt(slot, used[slot]++);
      this.piece(s, item);
      this.color(s, item);
      placed.push(s.visible ? s : null);
      if (s.visible) parts.add(item.part);
    }
    for (const slot of SLOTS)
      this.nodes[slot].forEach((n, i) => {
        if (i < used[slot]) return;
        if (isRope(n)) n.mesh.visible = false;
        else n.visible = false;
      });
    this.shown.parts = [...parts];
    return placed;
  }

  /** The green or red face wash: the head's drawing takes on the color. */
  private washHead(sk: Skeleton, frame: BugFrame): void {
    const tint = frame.face.tint;
    if (!tint || !sk.face?.tint || !sk.headPart) return;
    const t = TINTS[tint];
    for (const slot of SLOTS)
      for (const n of this.nodes[slot])
        if (!isRope(n) && n.visible && n.label === sk.headPart) n.tint = mix(n.tint, t.color, t.alpha);
  }

  /** A face piece's texture: the bug's own version first, then the kit's. */
  private faceTex(name: string): (Tex & { ref: number }) | null {
    const own = this.art.entry.face.includes(name) ? this.tex(name) : null;
    const anchors = this.art.entry.faceAnchors;
    if (own && anchors) return { ...own, ref: isMouth(name) ? anchors.mouth.s : anchors.eye.r };
    const kit = this.kit ? this.tex(name, this.kit) : null;
    if (kit) return { ...kit, ref: isMouth(name) ? KIT_MOUTH_W / 4 : KIT_EYE_R / 4 };
    return null;
  }

  private drawFaceArt(frame: BugFrame, spot: SkeletonFace | null): void {
    const g = this.faceG.clear();
    this.shown.face = [];
    this.shown.codeFace = 0;
    this.shown.eyes = frame.face.eyes;
    this.shown.mouth = frame.face.mouth;
    let n = 0;
    const show = (p: FacePiece, t: Tex & { ref: number }): void => {
      while (this.faceSprites.length <= n) {
        const s = new Sprite();
        this.faceSprites.push(s);
        this.sFace.addChild(s);
      }
      const s = this.faceSprites[n++]!;
      s.texture = t.texture;
      s.anchor.set(t.anchor.x, t.anchor.y);
      this.place(s, p.x, p.y, (p.size / t.ref) * t.k, p.rotation, p.sx, p.sy);
      s.tint = p.tint ?? 0xffffff;
      s.alpha = p.alpha;
      this.shown.face.push(p.name);
    };
    /** Show pieces from art if all of them are drawn; otherwise let the code draw this one. */
    const tryArt = (pieces: FacePiece[]): boolean => {
      const texs = pieces.map((p) => this.faceTex(p.name));
      if (texs.some((t) => !t)) return false;
      pieces.forEach((p, i) => show(p, texs[i]!));
      return true;
    };
    if (spot) {
      const look = spot.look ?? { x: frame.look.x * frame.facing, y: frame.look.y };
      for (const e of spot.eyes) {
        const open = e.open ?? frame.pose.eyeOpen;
        if (tryArt(eyePieces(e, look, open, frame.time))) {
          const brow = spot.polite ? politePiece(e) : null;
          if (brow) tryArt([brow]);
          continue;
        }
        drawEye(g, e.x, e.y, e.r, e.shape, look, open, e.lid, frame.time, e.line);
        this.shown.codeFace++;
      }
      for (const c of [...(spot.cheek ? [spot.cheek] : []), ...(spot.cheeks ?? [])])
        if (!tryArt([cheekPiece(c)])) g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
      const m = spot.mouth;
      if (m && !tryArt([mouthPiece(m, frame.time)])) {
        drawMouth(g, m.x, m.y, m.s, m.shape, frame.time, m.color, m.line);
        this.shown.codeFace++;
      }
    }
    for (let i = n; i < this.faceSprites.length; i++) this.faceSprites[i]!.visible = false;
  }

  /** Effects the game draws over the art. */
  private drawExtras(frame: BugFrame, extras: Extra[]): void {
    const back = this.fxBack.clear();
    const top = this.fxTop.clear();
    this.shown.extras = extras.map((e) => e.kind);
    for (const e of extras) {
      if (e.kind === 'thread') drawThread(back, this.r);
      else if (e.kind === 'swoosh') drawSwoosh(top, this.r, e.alpha);
      else footRipple(top, this.r, this.def.body, frame.pose);
    }
  }

  /** The hover rim: a white silhouette behind every visible part, in the same place. */
  private syncRim(alpha: number): void {
    this.sRim.visible = alpha > 0;
    if (alpha <= 0) return;
    this.sRim.alpha = alpha;
    const all: Sprite[] = [];
    for (const slot of SLOTS) for (const n of this.nodes[slot]) if (!isRope(n)) all.push(n);
    for (const s of all) {
      let twin = this.rimTwins.get(s);
      if (!twin) {
        twin = new Sprite();
        this.rimTwins.set(s, twin);
        this.sRim.addChild(twin);
      }
      const t = s.visible ? this.tex(`${s.label}@rim`) : null;
      twin.visible = !!t;
      if (!t) continue;
      twin.texture = t.texture;
      twin.anchor.set(t.anchor.x, t.anchor.y);
      twin.position.copyFrom(s.position);
      twin.rotation = s.rotation;
      twin.scale.copyFrom(s.scale);
    }
  }

  /** Paint patches over the body, each clipped to the drawing it lands on. */
  private paintArt(frame: BugFrame, sk: Skeleton, placed: (Sprite | null)[]): void {
    const colors = paintColors(frame.paint);
    let n = 0;
    for (const p of sk.paint) {
      const src = placed[p.mask];
      const cs = p.colors ?? colors;
      if (!src || cs.length === 0) continue;
      while (this.paintPool.length <= n) {
        const g = new Graphics();
        const mask = new Sprite();
        mask.label = 'art paint mask';
        g.label = 'art paint';
        this.sPaint.addChild(mask, g);
        this.paintPool.push({ g, mask, key: '' });
      }
      const idx = n++;
      const slot = this.paintPool[idx]!;
      const { mask, g } = slot;
      mask.texture = src.texture;
      mask.anchor.copyFrom(src.anchor);
      mask.position.copyFrom(src.position);
      mask.rotation = src.rotation;
      mask.scale.copyFrom(src.scale);
      mask.visible = true;
      const b = p.box;
      const key = `${cs.join(',')}|${[b.x0, b.x1, b.y0, b.y1].map((v) => Math.round(v)).join(',')}`;
      if (key !== slot.key) {
        slot.key = key;
        g.clear();
        drawPaintPatches(g, cs, b, Math.round(this.r) + this.def.id.length + idx);
      }
      g.visible = true;
      g.mask = mask;
    }
    for (let i = n; i < this.paintPool.length; i++) {
      const slot = this.paintPool[i]!;
      slot.g.visible = false;
      slot.g.mask = null;
      slot.mask.visible = false;
      slot.key = '';
    }
    this.shown.paint = n;
  }
}
