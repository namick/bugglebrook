import type { Texture } from 'pixi.js';
import { Container, MeshRope, Point, Sprite } from 'pixi.js';
import type { BugDef } from '../../../game/data/types';
import type { BugFrame } from '../render/draw/bug';
import { BugSprite } from '../render/draw/bug';
import { drawEye, drawMouth } from '../render/draw/face';
import { drawPaintPatches, paintColors } from '../render/draw/paint';
import { TINTS } from '../render/draw/species/common';
import { CHEEK, darken, mix } from '../render/palette';
import type { Pt } from '../render/rig/bugRig';
import {
  antennaPaths,
  facePlacement,
  legJoints,
  paintBox,
  sampleFeeler,
  wingState,
} from '../render/rig/bugRig';
import type { AtlasSet, LoadedArt } from './artStore';
import type { FacePiece } from './faceKit';
import { cheekPiece, eyePieces, isMouth, mouthPiece } from './faceKit';
import { KIT_EYE_R, KIT_MOUTH_W } from './kit';
import type { ManifestPart } from './rigFile';

/** Leg pieces stretch at most this much before the foot falls short instead. */
const STRETCH = [0.8, 1.25] as const;
/** Far legs: darker and a little see-through, like the code-drawn ones. */
const FAR_TINT = darken(0xffffff, 0.25);
const FAR_ALPHA = 0.75;

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
}

/**
 * A bug drawn from the artist's cutout parts (docs/06-art-guide.md, B7). It
 * is a `BugSprite` with the same container stack (stretch, spin, squash, the
 * facing flip), so everything `WorldView` does to a bug keeps working: potion
 * size, tints, alpha, sky grading. The parts move with the shared rig: legs
 * from `legJoints`, feelers along `antennaPaths`, the shell and wings from
 * `wingState`, and the face from `facePlacement` and the face kit. Dizzy
 * stars and steam are still drawn by code.
 */
export class SpriteBugView extends BugSprite {
  /** The resolution the game renders at, to pick 1x or 2x pages (main.ts keeps it current). */
  static resolution = 1;
  /** Use these pages whatever the resolution (the Art Lab's 1x and 2x checks), or null to choose. */
  static forceScale: 1 | 2 | null = null;
  readonly shown: SpriteShown = { parts: [], face: [], codeFace: 0, scale: 1, eyes: '', mouth: '' };
  private readonly parts: Record<string, ManifestPart>;
  private pageScale: 1 | 2 = 1;
  private readonly sRim = new Container();
  private readonly sLegsBack = new Container();
  private readonly sWings = new Container();
  private readonly sBody = new Container();
  private readonly sShell = new Container();
  private readonly sLegsFront = new Container();
  private readonly sAntennae = new Container();
  private readonly sFace = new Container();
  private readonly statics = new Map<string, Sprite>();
  private readonly legs: { back: Sprite[]; front: Sprite[] } = { back: [], front: [] };
  private readonly wingSprites: Sprite[] = [];
  private ropes: MeshRope[] = [];
  private readonly ropePoints: Point[][] = [];
  private readonly tips: Sprite[] = [];
  private readonly faceSprites: Sprite[] = [];
  private readonly rimTwins = new Map<Sprite, Sprite>();
  private paintMaskSprite: Sprite | null = null;
  private paintKeyS = '';

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
    const after = (g: Container, c: Container, label: string): void => {
      c.label = label;
      this.rigLayer.addChildAt(c, this.rigLayer.getChildIndex(g) + 1);
    };
    after(this.rim, this.sRim, 'art rim');
    after(this.legsBack, this.sLegsBack, 'art legs back');
    after(this.wings, this.sWings, 'art wings');
    after(this.body, this.sBody, 'art body');
    after(this.shell, this.sShell, 'art shell');
    after(this.legsFront, this.sLegsFront, 'art legs front');
    after(this.antennae, this.sAntennae, 'art antennae');
    this.rigLayer.addChildAt(this.sFace, this.rigLayer.getChildIndex(this.faceG));
    this.sFace.label = 'art face';
    this.pageScale = this.pickScale();
    this.build();
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

  private sprite(name: string, parent: Container): Sprite {
    const s = new Sprite();
    s.label = name;
    this.dress(s, name);
    parent.addChild(s);
    return s;
  }

  /** Put a part's texture on a sprite (and remember its scale for the art's pixels). */
  private dress(s: Sprite, name: string, asset: LoadedArt | null = this.art): number {
    const t = this.tex(name, asset);
    if (!t) {
      s.visible = false;
      return 1;
    }
    s.texture = t.texture;
    s.anchor.set(t.anchor.x, t.anchor.y);
    return t.k;
  }

  /** Make the sprites for every part. Run again when the page scale changes. */
  private build(): void {
    for (const c of [
      this.sRim,
      this.sLegsBack,
      this.sWings,
      this.sBody,
      this.sShell,
      this.sLegsFront,
      this.sAntennae,
    ])
      c.removeChildren().forEach((ch) => ch.destroy());
    this.statics.clear();
    this.legs.back.length = 0;
    this.legs.front.length = 0;
    this.wingSprites.length = 0;
    this.ropes = [];
    this.ropePoints.length = 0;
    this.tips.length = 0;
    this.rimTwins.clear();
    for (const [name, p] of Object.entries(this.parts)) {
      if (p.kind === 'static' || p.kind === 'form') this.statics.set(name, this.sprite(name, this.sBody));
      if (p.kind === 'hinged') this.statics.set(name, this.sprite(name, this.sShell));
    }
    // Keep the artist's back-to-front order within the body.
    const order = Object.keys(this.parts);
    this.sBody.children.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    const wing = Object.entries(this.parts).find(([, p]) => p.kind === 'wing');
    if (wing) for (let i = 0; i < 2; i++) this.wingSprites.push(this.sprite(wing[0], this.sWings));
    const rope = this.tex('antenna');
    if (rope) {
      for (let i = 0; i < 2; i++) {
        const pts = Array.from({ length: 9 }, () => new Point());
        this.ropePoints.push(pts);
        const width = rope.texture.height * rope.k;
        const m = new MeshRope({ texture: rope.texture, points: pts, textureScale: 0, width });
        // MeshRope resets its width to the texture's height every frame; a 2x page is twice as tall.
        m.onRender = () => {
          const geo = m.geometry as unknown as { _width: number; update(): void };
          geo._width = width;
          geo.update();
        };
        m.label = 'antenna';
        this.ropes.push(m);
        this.sAntennae.addChild(m);
      }
      if (this.parts.antenna_tip)
        for (let i = 0; i < 2; i++) this.tips.push(this.sprite('antenna_tip', this.sAntennae));
    }
    this.paintMaskSprite = null;
  }

  private place(s: Sprite, x: number, y: number, k: number, rotation = 0, sx = 1, sy = 1): void {
    s.visible = true;
    s.position.set(x, y);
    s.rotation = rotation;
    s.scale.set(k * sx, k * sy);
  }

  /** One limb piece from `a` toward `b`: drawn straight down, turned and stretched to fit. Returns where it ends. */
  private limb(s: Sprite, name: string, a: Pt, b: Pt, far: boolean): Pt {
    s.label = name;
    const k = this.dress(s, name);
    const rest = this.parts[name]?.length ?? 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const stretch = Math.min(STRETCH[1], Math.max(STRETCH[0], d / rest));
    this.place(s, a.x, a.y, k, Math.atan2(dy, dx) - Math.PI / 2, 1, stretch);
    s.tint = far ? FAR_TINT : 0xffffff;
    s.alpha = far ? FAR_ALPHA : 1;
    const len = rest * stretch;
    return { x: a.x + (dx / d) * len, y: a.y + (dy / d) * len };
  }

  override update(frame: BugFrame): void {
    const { r } = this;
    const bones = this.bones;
    this.form = frame.face.form;
    const scale = this.pickScale();
    if (scale !== this.pageScale) {
      this.pageScale = scale;
      this.build();
    }
    this.shown.scale = this.pageScale;
    this.shown.parts = [];

    // The same container motion as the code-drawn bug.
    const dt = Math.max(1e-3, frame.dt);
    const ax = ((frame.vx - this.lastV.x) / dt) * frame.facing;
    const ay = (frame.vy - this.lastV.y) / dt;
    this.lastV = { x: frame.vx, y: frame.vy };
    for (const s of this.springs)
      s.update(Math.max(-60, Math.min(60, ax)), Math.max(-60, Math.min(60, ay)), frame.dt);
    this.stretchA.rotation = frame.stretchAngle;
    this.stretchB.scale.set(frame.stretch, 1 / frame.stretch);
    this.stretchC.rotation = -frame.stretchAngle;
    this.spinLayer.rotation = frame.spin;
    const { pose } = frame;
    const move = frame.move ?? { bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 };
    this.squash.scale.set(pose.sx * frame.squashX * move.sx, pose.sy * frame.squashY * move.sy);
    this.squash.rotation = pose.tilt + move.tilt * frame.facing;
    this.rigLayer.position.set(0, -this.foot + pose.bob + move.bob);
    this.rigLayer.scale.x =
      frame.facing * (Math.abs(move.flip) < 0.08 ? Math.sign(move.flip || 1) * 0.08 : move.flip);

    // Body parts and the shell on its hinge.
    const wings = wingState(bones, frame, this.form ?? 'normal');
    for (const [name, s] of this.statics) {
      const p = this.parts[name]!;
      const k = this.dress(s, name);
      if (p.form) {
        s.visible = false;
        continue;
      }
      this.place(s, p.pivot.x, p.pivot.y, k, p.kind === 'hinged' ? wings.shellAngle : 0);
      if (p.tintable) s.tint = this.def.body;
      this.shown.parts.push(name);
    }
    // Flapping wings, behind the shell, root at their dot.
    const wingPart = Object.entries(this.parts).find(([, p]) => p.kind === 'wing');
    this.wingSprites.forEach((s, i) => {
      const w = wings.wings[i];
      if (!w || !wingPart) {
        s.visible = false;
        return;
      }
      const k = this.dress(s, wingPart[0]);
      const rest = r * 0.55;
      this.place(s, w.x, wingPart[1].pivot.y, k, 0, 1, w.ry / rest);
      if (i === 0) this.shown.parts.push(wingPart[0]);
    });

    // Legs: the upper piece from hip to knee, the lower from there to the foot.
    const used = { back: 0, front: 0 };
    if (this.parts.leg_upper && this.parts.leg_lower) {
      for (const j of legJoints(bones, pose, frame)) {
        const side = j.far ? 'back' : 'front';
        const pool = this.legs[side];
        const parent = j.far ? this.sLegsBack : this.sLegsFront;
        while (pool.length < used[side] + 2) pool.push(this.sprite('leg_upper', parent));
        const upper = pool[used[side]++]!;
        const lower = pool[used[side]++]!;
        const knee = this.limb(upper, 'leg_upper', j.hip, j.knee, j.far);
        this.limb(lower, 'leg_lower', knee, j.foot, j.far);
      }
      this.shown.parts.push('leg_upper', 'leg_lower');
    }
    for (const side of ['back', 'front'] as const)
      for (let i = used[side]; i < this.legs[side].length; i++) this.legs[side][i]!.visible = false;

    // Feelers bend along the code's curves; the knob sits on the end.
    const feelers = antennaPaths(bones, frame, this.springs, this.form ?? 'normal');
    this.ropes.forEach((m, i) => {
      const f = feelers[i];
      m.visible = !!f;
      const tip = this.tips[i];
      if (!f) {
        if (tip) tip.visible = false;
        return;
      }
      const pts = sampleFeeler(f, 8);
      const into = this.ropePoints[i]!;
      pts.forEach((q, n) => into[n]!.set(q.x, q.y));
      if (tip) {
        const a = pts[pts.length - 2]!;
        const b = pts[pts.length - 1]!;
        this.place(
          tip,
          b.x,
          b.y,
          this.dress(tip, 'antenna_tip'),
          Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2,
        );
      }
    });
    if (feelers.length && this.ropes.length)
      this.shown.parts.push('antenna', ...(this.tips.length ? ['antenna_tip'] : []));

    this.drawFaceArt(frame);
    this.syncRim(frame.rim ?? 0);
    this.paintArt(frame);
    this.drawStars(frame);
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

  private drawFaceArt(frame: BugFrame): void {
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
    const head = this.statics.get('head');
    const spot = facePlacement(this.bones, this.def, frame, this.springs, this.form ?? 'normal');
    if (head) head.tint = 0xffffff;
    if (spot) {
      const tint = frame.face.tint;
      if (tint && spot.tint && head) head.tint = mix(0xffffff, TINTS[tint].color, TINTS[tint].alpha);
      const look = { x: frame.look.x * frame.facing, y: frame.look.y };
      const open = frame.pose.eyeOpen;
      for (const e of spot.eyes) {
        if (tryArt(eyePieces(e, look, open, frame.time))) continue;
        drawEye(g, e.x, e.y, e.r, e.shape, look, open, e.lid, frame.time, e.line);
        this.shown.codeFace++;
      }
      const c = spot.cheek;
      if (c && !tryArt([cheekPiece(c)])) g.circle(c.x, c.y, c.r).fill({ color: CHEEK, alpha: c.alpha });
      const m = spot.mouth;
      if (m && !tryArt([mouthPiece(m, frame.time)])) {
        drawMouth(g, m.x, m.y, m.s, m.shape, frame.time, m.color, m.line);
        this.shown.codeFace++;
      }
    }
    for (let i = n; i < this.faceSprites.length; i++) this.faceSprites[i]!.visible = false;
  }

  /** The hover rim: a white silhouette behind every visible part, in the same place. */
  private syncRim(alpha: number): void {
    this.sRim.visible = alpha > 0;
    if (alpha <= 0) return;
    this.sRim.alpha = alpha;
    const all = [...this.statics.values(), ...this.wingSprites, ...this.legs.back, ...this.legs.front];
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

  /** Paint patches over the body, masked by the shell (or body) drawing. */
  private paintArt(frame: BugFrame): void {
    const colors = paintColors(frame.paint);
    const name = ['shell', 'body', 'shield', 'abdomen'].find((n) => this.statics.has(n));
    const box = paintBox(this.bones, this.form ?? 'normal');
    const on = colors.length > 0 && !!name && !!box && this.form !== 'curled';
    if (!on) {
      if (this.paintG.visible) {
        this.paintG.visible = false;
        this.paintG.mask = null;
        this.paintKeyS = '';
      }
      return;
    }
    const src = this.statics.get(name)!;
    if (!this.paintMaskSprite) {
      this.paintMaskSprite = new Sprite();
      this.paintMaskSprite.label = 'art paint mask';
      this.rigLayer.addChildAt(this.paintMaskSprite, this.rigLayer.getChildIndex(this.paintG));
    }
    const mask = this.paintMaskSprite;
    mask.texture = src.texture;
    mask.anchor.copyFrom(src.anchor);
    mask.position.copyFrom(src.position);
    mask.rotation = src.rotation;
    mask.scale.copyFrom(src.scale);
    const key = `${colors.join(',')}|${this.pageScale}`;
    if (key !== this.paintKeyS) {
      this.paintKeyS = key;
      this.paintG.clear();
      drawPaintPatches(this.paintG, colors, box, Math.round(this.r) + this.def.id.length);
    }
    this.paintG.visible = true;
    this.paintG.mask = mask;
  }
}
