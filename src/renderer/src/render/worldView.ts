import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_WIDTH_PX } from '../../../game/constants';
import type { EntityId } from '../../../game/core/entities';
import type { EntityView, Sim } from '../../../game/sim';
import { Background } from './background';
import { bugFace } from './bugFace';
import { bugPose } from './bugPose';
import type { Camera, Point } from './camera';
import { BugSprite } from './draw/bug';
import type { Look } from './draw/face';
import { ItemSprite } from './draw/item';
import { SquashSpring, approach, stretchFor } from './juice';
import { OUTLINE } from './palette';
import { Particles } from './particles';

const PPM = PIXELS_PER_METER;

/** Render-side state for one entity: springs, spin, and trails. */
interface Juice {
  squash: SquashSpring;
  /** Cosmetic tumble while flying, radians. */
  spin: number;
  /** Leaves a trail until it slows down. */
  flying: number;
  look: Look;
}

/** Where the cursor is, in world meters, or null when it is off the canvas. */
export interface PointerSource {
  readonly hoverWorld: Point | null;
}

/**
 * Draws a Sim. Reads entity views every frame and keeps one sprite per
 * entity, creating and destroying sprites as entities come and go. Game
 * events drive squash, particles, and shake. Never writes to the sim.
 */
export class WorldView extends Container {
  private readonly background: Background;
  /** Everything that scrolls with the world at full speed. */
  private readonly world = new Container();
  private readonly shadows = new Graphics();
  private readonly entityLayer = new Container();
  readonly particles = new Particles();
  /** Fling trails sit behind the things that leave them. */
  private readonly trails = new Particles();
  private readonly sprites = new Map<EntityId, BugSprite | ItemSprite>();
  private readonly juice = new Map<EntityId, Juice>();
  private readonly offs: Array<() => void> = [];
  private time = 0;
  private shakeLeft = 0;
  private shakePower = 0;

  constructor(
    private readonly sim: Sim,
    private readonly pointer: PointerSource | null = null,
  ) {
    super();
    this.background = new Background(sim.content.areas.all, sim.terrain, sim.worldWidth);
    const bg = this.background;
    this.entityLayer.sortableChildren = true;
    this.world.addChild(bg.near, this.shadows, this.trails, this.entityLayer, this.particles);
    this.addChild(bg.sky, bg.clouds, bg.hills, bg.mid, this.world, bg.front);
    this.listen();
  }

  private juiceFor(id: EntityId): Juice {
    let j = this.juice.get(id);
    if (!j) {
      j = { squash: new SquashSpring(), spin: 0, flying: 0, look: { x: 0.3, y: 0 } };
      this.juice.set(id, j);
    }
    return j;
  }

  private listen(): void {
    const ev = this.sim.events;
    const px = (m: number): number => m * PPM;
    this.offs.push(
      ev.on('item_grabbed', (e) => {
        this.juiceFor(e.id).squash.grab();
        this.particles.dust(px(e.x), px(e.y) + 20, 2);
      }),
      ev.on('item_dropped', (e) => {
        if (e.flung) this.juiceFor(e.id).flying = 3;
      }),
      ev.on('bonked', (e) => {
        const j = this.juiceFor(e.id);
        if (e.kind === 'item') j.squash.land(e.speed * 0.6);
        const size = this.sizeOf(e.id);
        this.particles.dust(px(e.x), px(e.y) + size, e.speed);
        if (e.kind === 'bug' && e.speed >= 14) this.shake(3, 0.12);
      }),
      ev.on('bug_landed', (e) => {
        this.juiceFor(e.id).squash.land(Math.max(6, e.speed));
      }),
      ev.on('bug_dizzy', (e) => {
        const v = this.sim.view(e.id);
        if (v) this.particles.stars(px(v.x), px(v.y) - this.sizeOf(e.id));
        if (e.speed >= 16) this.shake(4, 0.16);
      }),
      ev.on('bug_poked', (e) => {
        this.juiceFor(e.id).squash.poke();
        this.particles.ring(px(e.x), px(e.y), 36);
        this.particles.sparkles(px(e.x), px(e.y) - 30, 3);
      }),
      ev.on('item_poked', (e) => {
        this.juiceFor(e.id).squash.poke();
        this.particles.ring(px(e.x), px(e.y), 24);
      }),
      ev.on('bug_hopped', (e) => {
        this.juiceFor(e.id).squash.kick(0.85, 1.18);
        this.particles.dust(px(e.x), px(e.y) + this.sizeOf(e.id), 1);
      }),
      ev.on('spring_bounced', (e) => {
        const sprite = this.sprites.get(e.id);
        if (sprite instanceof ItemSprite) sprite.squish(0.7);
        this.juiceFor(e.targetId).squash.kick(0.75, 1.3);
        this.juiceFor(e.targetId).flying = 2;
        this.particles.burst(px(e.x), px(e.y) - 30, 5, 0xffffff, Math.PI * 0.9, -Math.PI / 2);
      }),
      ev.on('bug_ate', (e) => {
        this.particles.crumbs(px(e.x), px(e.y), 0xe8334a);
        const v = this.sim.view(e.id);
        if (v && e.liking !== 'disliked') this.particles.sparkles(px(v.x), px(v.y) - this.sizeOf(e.id), 6);
        this.juiceFor(e.id).squash.kick(1.15, 0.9);
      }),
      ev.on('entity_removed', (e) => this.drop(e.id)),
    );
  }

  /** Half height in pixels, roughly. */
  private sizeOf(id: EntityId): number {
    const e = this.sim.entities.get(id);
    if (!e) return 20;
    if (e.kind === 'bug') return this.sim.content.bugs.get(e.defId).radius * PPM;
    const s = this.sim.content.items.get(e.defId).shape;
    return (s.type === 'circle' ? s.radius : s.height / 2) * PPM;
  }

  shake(px: number, seconds: number): void {
    this.shakePower = Math.max(this.shakePower, Math.min(6, px));
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    this.background.update(camera, this.time);
    let sx = 0;
    let sy = 0;
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft) / 0.16;
      sx = (Math.random() * 2 - 1) * this.shakePower * k;
      sy = (Math.random() * 2 - 1) * this.shakePower * k;
      if (this.shakeLeft <= 0) this.shakePower = 0;
    }
    // The background scrolls its own near layer; entities, shadows, and
    // particles follow it. The world container carries the screen shake.
    this.world.position.set(sx, sy);
    this.entityLayer.x = this.shadows.x = this.particles.x = this.trails.x = -camera.x * PPM;
    this.particles.update(dt);
    this.trails.update(dt);

    const shadows = this.shadows.clear();
    const left = camera.x - 2;
    const right = camera.x + VIEW_WIDTH_PX / PPM + 2;
    const hover = this.pointer?.hoverWorld ?? null;
    const seen = new Set<EntityId>();
    for (const view of this.sim.views()) {
      seen.add(view.id);
      const sprite = this.sprites.get(view.id) ?? this.createSprite(view);
      const onScreen = view.x > left && view.x < right;
      sprite.visible = onScreen;
      if (!onScreen) continue;
      const j = this.juiceFor(view.id);
      j.squash.update(dt);
      sprite.position.set(view.x * PPM, view.y * PPM);
      this.drawShadow(shadows, view);
      const speed = Math.hypot(view.vx, view.vy);
      if (j.flying > 0) {
        j.flying -= dt;
        if (speed < 4 && j.flying < 2.6) j.flying = 0;
        else this.trails.trail(view.x * PPM, view.y * PPM, this.colorOf(sprite), this.sizeOf(view.id) * 0.7);
      }
      if (sprite instanceof BugSprite && view.bug) this.updateBug(sprite, view, j, dt, hover);
      else if (sprite instanceof ItemSprite) {
        const moving = view.held || j.flying > 0;
        const stretch = moving ? stretchFor(speed, 1.2, 0.5) : 1;
        sprite.pose(view.angle, Math.atan2(view.vy, view.vx), stretch, j.squash.sx, j.squash.sy);
        sprite.update(dt);
      }
    }
    for (const id of [...this.sprites.keys()]) if (!seen.has(id)) this.drop(id);
  }

  private colorOf(sprite: BugSprite | ItemSprite): number {
    return sprite instanceof BugSprite ? sprite.def.body : sprite.def.color;
  }

  private updateBug(sprite: BugSprite, view: EntityView, j: Juice, dt: number, hover: Point | null): void {
    const bug = view.bug!;
    const def = sprite.def;
    const r = def.radius;
    const pose = bugPose({
      mode: bug.mode,
      vx: view.vx,
      vy: view.vy,
      time: this.time,
      phase: view.id * 1.37,
      walkSpeed: def.speed,
    });
    const face = bugFace({
      art: def.art,
      mode: bug.mode,
      needs: bug.needs,
      time: this.time,
      likesFlinging: def.likesFlinging,
    });
    const speed = Math.hypot(view.vx, view.vy);
    const flying = bug.mode === 'st_airborne' || bug.mode === 'st_use';
    const held = bug.mode === 'st_held';

    // Where to look: the cursor when it is close, otherwise ahead.
    let target: Look = { x: bug.facing * 0.5, y: 0.1 };
    if (bug.mode === 'st_eat') target = { x: bug.facing * 0.7, y: 0.6 };
    if (hover && !flying) {
      const hx = view.x + bug.facing * r * 0.8;
      const hy = view.y - r * 0.4;
      const dx = hover.x - hx;
      const dy = hover.y - hy;
      const d = Math.hypot(dx, dy);
      if (d < 3 && d > 1e-3) {
        const k = Math.min(1, d / 0.6);
        target = { x: (dx / d) * k, y: (dy / d) * k };
      }
    }
    j.look.x = approach(j.look.x, target.x, 12, dt);
    j.look.y = approach(j.look.y, target.y, 12, dt);

    // Tumble while flying (Rollo rolls for real; the others spin for show).
    if (flying && face.form !== 'curled' && face.form !== 'flying') {
      j.spin += Math.max(-9, Math.min(9, view.vx * 0.9)) * dt;
    } else {
      const wrapped = Math.atan2(Math.sin(j.spin), Math.cos(j.spin));
      j.spin = approach(wrapped, 0, 14, dt);
    }
    const stretchMax = flying ? 1.4 : 1.3;
    const stretch = flying || held ? stretchFor(speed, stretchMax) : 1;
    sprite.zIndex = view.id + (held ? 10000 : 0);
    sprite.update({
      pose,
      face,
      facing: bug.facing,
      time: this.time,
      dt,
      look: j.look,
      vx: view.vx,
      vy: view.vy,
      angle: view.angle,
      squashX: j.squash.sx,
      squashY: j.squash.sy,
      stretchAngle: Math.atan2(view.vy, view.vx),
      stretch,
      spin: j.spin,
      stars: bug.mode === 'st_dizzy' ? (bug.dizzyTicks >= 240 ? 5 : 3) : 0,
    });
  }

  /** A soft oval on the ground under each thing, smaller and fainter as it rises. */
  private drawShadow(g: Graphics, view: EntityView): void {
    const ground = this.sim.surfaceY(view.x);
    const size = this.sizeOf(view.id);
    const width =
      view.kind === 'bug' ? this.sim.content.bugs.get(view.defId).radius * PPM * 1.3 : size * 1.6 + 8;
    const height = ground - view.y - size / PPM;
    const k = Math.max(0, 1 - height / 5);
    if (k <= 0) return;
    g.ellipse(
      view.x * PPM,
      ground * PPM + 2,
      Math.max(10, width) * (0.5 + 0.5 * k),
      7 * (0.5 + 0.5 * k),
    ).fill({
      color: OUTLINE,
      alpha: 0.2 * k,
    });
  }

  private createSprite(view: EntityView): BugSprite | ItemSprite {
    const sprite =
      view.kind === 'bug'
        ? new BugSprite(this.sim.content.bugs.get(view.defId))
        : new ItemSprite(this.sim.content.items.get(view.defId), view.id);
    // Keep draw order equal to ID order so hit testing (highest ID) matches.
    sprite.zIndex = view.id;
    this.entityLayer.addChild(sprite);
    this.sprites.set(view.id, sprite);
    return sprite;
  }

  private drop(id: EntityId): void {
    const sprite = this.sprites.get(id);
    if (sprite) sprite.destroy({ children: true });
    this.sprites.delete(id);
    this.juice.delete(id);
  }

  /** Number of entity sprites currently alive (test hook). */
  get spriteCount(): number {
    return this.sprites.size;
  }

  override destroy(): void {
    this.offs.forEach((off) => off());
    super.destroy({ children: true });
  }
}
