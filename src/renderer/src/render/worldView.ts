import { Container, Graphics } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_WIDTH_PX } from '../../../game/constants';
import type { EntityId } from '../../../game/core/entities';
import type { Liking } from '../../../game/events';
import type { EntityView, Sim } from '../../../game/sim';
import { likingOf } from '../../../game/systems/bugAi';
import { Background } from './background';
import { Bubbles } from './bubbles';
import type { BubbleInfo } from './bubbles';
import type { FaceOverride } from './bugFace';
import { bugFace } from './bugFace';
import { bugPose } from './bugPose';
import type { Camera, Point } from './camera';
import { BugSprite } from './draw/bug';
import type { Look } from './draw/face';
import { ItemSprite } from './draw/item';
import { SquashSpring, approach, stretchFor } from './juice';
import { OUTLINE } from './palette';
import { Particles } from './particles';
import type { Picto, ReactionLook } from './reactions';
import { movePose, reactionLook, reactionShowing } from './reactions';
import { thoughtFor } from './thoughts';
import { SoapBubbles } from './soapBubbles';
import type { Obstacle } from './soapBubbles';
import { tagLook } from './tagLooks';
import type { TagLook } from './tagLooks';
import { WaterView } from './water';

const PPM = PIXELS_PER_METER;

/** Mouth glow colors while the player holds food (game design doc, section 2). */
export const GLOW: Readonly<Record<Liking, number>> = {
  loved: 0x5ee06a,
  liked: 0x5ee06a,
  neutral: 0xffd23f,
  disliked: 0x9aa0aa,
};

/** Food held within this many meters of a bug makes it open up (or clam up). */
const OFFER_RANGE = 2.2;
/** Seconds between thought bubbles for a bug with a low need. */
const THOUGHT_EVERY = 9;
/** Hovering a bug this long shows its thought bubble. */
const HOVER_THOUGHT = 1;

/** Render-side state for one entity: springs, spin, and trails. */
interface Juice {
  squash: SquashSpring;
  /** Cosmetic tumble while flying, radians. */
  spin: number;
  /** Leaves a trail until it slows down. */
  flying: number;
  look: Look;
  /** Seconds until the next thought bubble may show. */
  thinkIn: number;
  /** Seconds the cursor has hovered this bug. */
  hovered: number;
  /** Seconds left of a flinch or a hot red face. */
  flinch: number;
  hot: number;
  /** Seconds since food went in its mouth. */
  chewing: number;
  /** The last food it was fed, for bubbles. */
  food: string | null;
  /** Seconds until the next drip, stink puff, or underwater bubble. */
  drip: number;
  puff: number;
}

/** Where the cursor is, in world meters, or null when it is off the canvas. */
export interface PointerSource {
  readonly hoverWorld: Point | null;
  /** The grabbable thing under the cursor, if any. */
  readonly hoverId?: EntityId | null;
}

/**
 * Draws a Sim. Reads entity views every frame and keeps one sprite per
 * entity, creating and destroying sprites as entities come and go. Game
 * events drive squash, particles, bubbles, and shake. Never writes to the sim.
 */
export class WorldView extends Container {
  private readonly background: Background;
  /** Everything that scrolls with the world at full speed. */
  private readonly world = new Container();
  private readonly shadows = new Graphics();
  private readonly entityLayer = new Container();
  /** Mouth glows, over the bugs. */
  private readonly glows = new Graphics();
  readonly particles = new Particles();
  /** Fling trails sit behind the things that leave them. */
  private readonly trails = new Particles();
  readonly bubbles = new Bubbles();
  readonly water: WaterView;
  /** Floating soap bubbles (rule R7 and the bubble wand). */
  readonly soapBubbles = new SoapBubbles();
  /** Behind entities: warm glows and fuzzy hair. */
  private readonly behind = new Graphics();
  /** Over entities: ice blocks, foam, gloss, goo, frost. */
  private readonly over = new Graphics();
  /** Sounds that come from the view itself (bubble pops, the running hose). */
  onSound: ((name: 'pop' | 'trickle', strength: number) => void) | null = null;
  private trickleIn = 0;
  /** Where each weld sits on its two bodies, so the goo blob follows them. */
  private readonly welds = new Map<string, { la: Point; lb: Point }>();
  private readonly sprites = new Map<EntityId, BugSprite | ItemSprite>();
  private readonly juice = new Map<EntityId, Juice>();
  private readonly offs: Array<() => void> = [];
  private time = 0;
  private shakeLeft = 0;
  private shakePower = 0;
  private lastHover: Point | null = null;
  /** Bugs whose mouth glows right now, and in what color (test hook). */
  readonly glowing = new Map<EntityId, Liking>();

  constructor(
    private readonly sim: Sim,
    private readonly pointer: PointerSource | null = null,
    renderer: Renderer | null = null,
  ) {
    super();
    this.background = new Background(sim.content.areas.all, sim.terrain, sim.worldWidth, renderer);
    const bg = this.background;
    this.water = new WaterView(sim, this.particles);
    this.entityLayer.sortableChildren = true;
    this.world.addChild(
      bg.near,
      this.water.back,
      this.behind,
      this.shadows,
      this.trails,
      this.entityLayer,
      this.over,
      this.water.front,
      this.soapBubbles,
      this.glows,
      this.particles,
      this.bubbles,
    );
    this.soapBubbles.onPop = (x, y) => {
      this.particles.ring(x, y, 14);
      this.onSound?.('pop', 0.5);
    };
    this.addChild(bg.sky, bg.clouds, bg.hills, bg.mid, this.world, bg.front);
    this.listen();
  }

  private juiceFor(id: EntityId): Juice {
    let j = this.juice.get(id);
    if (!j) {
      j = {
        squash: new SquashSpring(),
        spin: 0,
        flying: 0,
        look: { x: 0.3, y: 0 },
        thinkIn: 3 + (id % 5),
        hovered: 0,
        flinch: 0,
        hot: 0,
        chewing: -1,
        food: null,
        drip: Math.random() * 0.3,
        puff: Math.random(),
      };
      this.juice.set(id, j);
    }
    return j;
  }

  /** A bug's mouth in world pixels. */
  private mouthPx(id: EntityId): Point | null {
    const m = this.sim.mouthAnchor(id);
    return m ? { x: m.x * PPM, y: m.y * PPM } : null;
  }

  private facingOf(id: EntityId): 1 | -1 {
    return this.sim.entities.get(id)?.bug?.facing ?? 1;
  }

  private itemColor(defId: string): number {
    return this.sim.content.items.has(defId) ? this.sim.content.items.get(defId).color : 0xe8334a;
  }

  private hasTag(defId: string, tag: string): boolean {
    return this.sim.content.items.has(defId) && this.sim.content.items.get(defId).tags.includes(tag);
  }

  /** Show a speech bubble for a bug. */
  private say(id: EntityId, pictos: readonly Picto[], seconds: number, food: string | null = null): void {
    const def = food && this.sim.content.items.has(food) ? this.sim.content.items.get(food) : null;
    this.bubbles.show(id, 'speech', pictos, seconds, def);
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
        // No dust in or on the water (lily pads, ice).
        if (!this.sim.environment.waterAt(e.x)) this.particles.dust(px(e.x), px(e.y) + size, e.speed);
        if (e.kind === 'bug' && e.speed >= 14) this.shake(3, 0.12);
      }),
      ev.on('bug_landed', (e) => {
        this.juiceFor(e.id).squash.land(Math.max(6, e.speed));
      }),
      ev.on('bug_dizzy', (e) => {
        const v = this.sim.view(e.id);
        if (v) this.particles.stars(px(v.x), px(v.y) - this.sizeOf(e.id));
        if (e.speed >= 16) this.shake(4, 0.16);
        this.say(e.id, ['swirl', 'star'], Math.min(3, e.durationTicks / 60));
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
      ev.on('bug_chose_action', (e) => {
        const target = this.sim.entities.get(e.targetId);
        if (!target) return;
        if (e.action === 'eat') this.say(e.id, ['food', 'exclaim'], 1.3, target.defId);
        else this.say(e.id, ['spring', 'exclaim'], 1.3);
      }),
      ev.on('bug_reacted', (e) => this.react(e.id, e.defId, e.reaction, e.variant)),
      ev.on('bug_fed', (e) => {
        const j = this.juiceFor(e.id);
        j.chewing = 0;
        j.food = e.itemDefId;
        j.squash.kick(1.12, 0.9);
        const m = this.mouthPx(e.id);
        if (!m) return;
        this.particles.crumbs(m.x, m.y, this.itemColor(e.itemDefId));
        if (e.liking === 'disliked') {
          this.particles.puff(m.x, m.y - 10, 0xb8e986, 3, 0, -40, 10);
          this.say(e.id, ['exclaim', 'sweat'], 0.9);
        } else if (e.liking === 'loved') this.particles.hearts(m.x, m.y - 30, 2);
      }),
      ev.on('bug_ate', (e) => {
        const j = this.juiceFor(e.id);
        j.chewing = -1;
        j.squash.kick(1.15, 0.9);
        const m = this.mouthPx(e.id) ?? { x: px(e.x), y: px(e.y) };
        this.particles.crumbs(m.x, m.y, this.itemColor(e.itemDefId));
        const dir = this.facingOf(e.id);
        if (this.hasTag(e.itemDefId, 'tag_hot')) {
          // Dot's weird favorite: she breathes a flame puff.
          this.particles.flame(m.x + dir * 10, m.y, dir);
          this.particles.puff(m.x + dir * 30, m.y - 20, 0x9a9aa6, 4, dir * 60, -80, 14);
          j.hot = 1.8;
        }
        if (this.hasTag(e.itemDefId, 'tag_cold')) {
          this.particles.snow(m.x + dir * 8, m.y, dir);
          this.particles.puff(m.x + dir * 20, m.y, 0xd6f0ff, 4, dir * 90, -20, 12);
        }
      }),
      ev.on('bug_spat', (e) => {
        const j = this.juiceFor(e.id);
        j.chewing = -1;
        const sneeze = this.hasTag(e.itemDefId, 'tag_cold');
        j.squash.kick(sneeze ? 0.8 : 1.2, sneeze ? 1.25 : 0.85);
        const vx = px(e.vx);
        const vy = px(e.vy);
        this.particles.drops(
          px(e.x),
          px(e.y),
          vx * 0.6,
          vy * 0.5,
          sneeze ? 0xd6f0ff : 0xc9f0a0,
          sneeze ? 14 : 7,
        );
        this.particles.ring(px(e.x), px(e.y), 22);
        this.particles.burst(px(e.x), px(e.y), 4, 0xffffff, 0.9, Math.atan2(vy, vx));
        if (sneeze) this.particles.puff(px(e.x), px(e.y), 0xffffff, 5, vx * 0.3, -30, 14);
      }),
      ev.on('bug_burped', (e) => {
        const dir = this.facingOf(e.id);
        this.juiceFor(e.id).squash.kick(1.2, 0.85);
        // BRAAP: a big yellow-green cloud rolling out of the mouth, a shock ring, bubbles.
        this.particles.ring(px(e.x) + dir * 12, px(e.y), 40);
        this.particles.puff(px(e.x) + dir * 18, px(e.y) - 4, 0xd4e38a, 9, dir * 120, -45, 22);
        this.particles.bubbles(px(e.x) + dir * 14, px(e.y) - 10, 5);
        // Soap comes back up as real soap bubbles.
        const food = this.juiceFor(e.id).food;
        if (food && this.hasTag(food, 'tag_soapy'))
          this.soapBubbles.blow(px(e.x) + dir * 20, px(e.y) - 10, 7);
        this.say(e.id, ['dots', 'sweat'], 1.1);
      }),
      ev.on('bug_tickled', (e) => {
        const v = this.sim.view(e.id);
        if (v) this.particles.sparkles(px(v.x), px(v.y) - this.sizeOf(e.id), 2 + e.level * 2);
        this.juiceFor(e.id).squash.kick(1.1, 0.92);
        this.say(
          e.id,
          e.level >= 3 ? ['laugh', 'laugh', 'laugh'] : e.level === 2 ? ['laugh', 'laugh'] : ['laugh'],
          1.1,
        );
      }),
      ev.on('bug_wriggled_free', (e) => {
        this.juiceFor(e.id).squash.kick(0.8, 1.25);
        this.particles.burst(px(e.x), px(e.y), 8, 0xffffff);
      }),
      ev.on('item_shaken', (e) => {
        this.juiceFor(e.id).squash.kick(1.2, 0.85);
        this.particles.burst(px(e.x), px(e.y), 6, 0xffffff);
        if (e.kind === 'bug') {
          const r = this.sim.content.bugs.get(e.defId);
          this.say(e.id, r.dizzyProof ? ['dots'] : ['swirl'], 1.2);
        }
      }),
      ev.on('entity_removed', (e) => this.drop(e.id)),
      ...this.listenWater(),
    );
  }

  /** Water and property events: splashes, steam, ice, goo, bubbles, stink. */
  private listenWater(): Array<() => void> {
    const ev = this.sim.events;
    const px = (m: number): number => m * PPM;
    return [
      ev.on('splashed', (e) => {
        const big = e.speed > 1.5 || e.kind === 'bug';
        this.water.splash(px(e.x), e.speed, e.size);
        if (big) this.particles.splash(px(e.x), px(e.y), e.speed, e.size);
        else this.particles.drops(px(e.x), px(e.y), 0, -120, 0x5cc3e6, 3);
        this.juiceFor(e.id).squash.land(Math.min(12, 3 + e.speed));
      }),
      ev.on('skipped', (e) => {
        this.water.splash(px(e.x), 3, 0.08);
        this.particles.drops(px(e.x), px(e.y), 60, -160, 0x5cc3e6, 5);
        this.particles.ring(px(e.x), px(e.y), 18);
      }),
      ev.on('left_water', (e) => {
        this.particles.drops(px(e.x), px(e.y), 0, -60, 0x5cc3e6, 4);
      }),
      ev.on('steamed', (e) => {
        this.particles.steam(px(e.x), px(e.y) - 10, 10);
        this.particles.sparkles(px(e.x), px(e.y) - 20, 3);
        this.juiceFor(e.id).squash.kick(1.15, 0.88);
      }),
      ev.on('froze', (e) => {
        this.particles.shards(px(e.x), px(e.y), 12);
        this.particles.snow(px(e.x), px(e.y) - 20, 1);
        this.juiceFor(e.id).squash.kick(0.9, 1.1);
      }),
      ev.on('thawed', (e) => {
        this.particles.drops(px(e.x), px(e.y), 0, -80, 0x9fd8ff, 6);
        this.particles.shards(px(e.x), px(e.y), 4);
      }),
      ev.on('ice_formed', (e) => {
        for (let x = px(e.x0); x < px(e.x1); x += 40) this.particles.shards(x, px(e.y), 2);
        this.particles.sparkles(px((e.x0 + e.x1) / 2), px(e.y) - 20, 8);
      }),
      ev.on('ice_melted', (e) => {
        this.water.splash(px((e.x0 + e.x1) / 2), 2, 0.4);
        this.particles.drops(px((e.x0 + e.x1) / 2), px(e.y), 0, -100, 0x9fd8ff, 6);
      }),
      ev.on('stuck', (e) => {
        this.particles.drops(px(e.x), px(e.y), 0, -90, 0xff8fc8, 5);
        this.particles.ring(px(e.x), px(e.y), 16);
        this.juiceFor(e.a).squash.kick(1.2, 0.85);
        this.juiceFor(e.b).squash.kick(1.1, 0.9);
      }),
      ev.on('unstuck', (e) => {
        this.welds.delete(`${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`);
        this.particles.drops(px(e.x), px(e.y), 0, -140, 0xff8fc8, 6);
        this.particles.burst(px(e.x), px(e.y), 5, 0xffd1e8);
      }),
      ev.on('bubbles_blown', (e) => this.soapBubbles.blow(px(e.x), px(e.y) - 10, e.count)),
      ev.on('bug_smelled', (e) => {
        const src = this.sim.view(e.sourceId);
        if (src) this.particles.puff(px(src.x), px(src.y) - 20, 0xb8d86a, 5, 0, -50, 16);
      }),
      ev.on('water_zapped', (e) => {
        for (const w of this.sim.environment.surfaces())
          if (e.x >= w.left - 1 && e.x <= w.right + 1)
            this.particles.zap(px(w.left), px(w.right), px(w.level));
        this.shake(3, 0.15);
      }),
      ev.on('magnet_snapped', (e) => {
        this.particles.burst(px(e.x), px(e.y), 6, 0xffe066);
        this.particles.sparkles(px(e.x), px(e.y), 2);
        this.juiceFor(e.id).squash.kick(0.85, 1.15);
      }),
      ev.on('bug_shook_dry', (e) => {
        // A wet-dog shake: droplets flung out all round, then a clean sparkle.
        const r = this.sizeOf(e.id);
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI + (i / 5) * Math.PI;
          this.particles.drops(
            px(e.x),
            px(e.y) - r * 0.4,
            Math.cos(a) * 320,
            Math.sin(a) * 260 - 80,
            0x5cc3e6,
            3,
          );
        }
        this.particles.sparkles(px(e.x), px(e.y) - r, 5);
      }),
      ev.on('wrung_out', (e) => {
        const color = e.tag === 'tag_soapy' ? 0xffffff : 0x5cc3e6;
        for (let i = 0; i < 4; i++) this.particles.drops(px(e.x), px(e.y) + 10, 0, 60 + i * 60, color, 5);
        this.juiceFor(e.id).squash.kick(0.7, 1.25);
        if (e.tag === 'tag_soapy') this.soapBubbles.blow(px(e.x), px(e.y), 4);
      }),
      ev.on('hose_toggled', (e) => {
        this.particles.ring(px(e.x), px(e.y), 30);
        this.particles.burst(px(e.x), px(e.y), 6, e.on ? 0x9fd8ff : 0xffffff);
      }),
      ev.on('boot_bubbled', (e) => {
        this.particles.bubbles(px(e.x) + 40, px(e.y) - 40, 12);
        this.water.splash(px(e.x) + 40, 2, 0.3);
      }),
      ev.on('tag_lost', (e) => {
        // Washed or soaped clean: a little sparkle says "clean!".
        if ((e.cause === 'water' || e.cause === 'soap') && e.tag !== 'tag_hot')
          this.particles.sparkles(px(e.x), px(e.y) - 20, 3);
      }),
      ev.on('tag_gained', (e) => {
        if (e.cause === 'hose' && e.tag === 'tag_wet')
          this.particles.drops(px(e.x), px(e.y), 0, -80, 0x5cc3e6, 3);
      }),
    ];
  }

  /** Play a reaction: its bubble and its one-off particles. The face comes from the view each frame. */
  private react(
    id: EntityId,
    defId: string,
    type: Parameters<typeof reactionLook>[1],
    variant: number,
  ): void {
    const def = this.sim.content.bugs.get(defId);
    const look = reactionLook(def.art, type, variant);
    const j = this.juiceFor(id);
    this.say(id, look.pictos, Math.max(1.2, look.seconds) + 0.4, j.food);
    const v = this.sim.view(id);
    if (!v) return;
    const headX = v.x * PPM + this.facingOf(id) * def.radius * PPM * 0.6;
    const headY = v.y * PPM - def.radius * PPM;
    switch (look.fx) {
      case 'hearts':
        this.particles.hearts(headX, headY, 6);
        break;
      case 'sparkles':
        this.particles.sparkles(headX, headY, 7);
        break;
      case 'steam':
        this.particles.puff(headX, headY - 10, 0xffffff, 5, 0, -90, 12);
        break;
      case 'sweat':
        this.particles.drops(headX, headY, -this.facingOf(id) * 120, -160, 0x9fd8ff, 3);
        break;
      case 'splash':
        this.particles.drops(headX, headY, 0, -220, 0x5cc3e6, 6);
        break;
      case 'spray':
        this.particles.drops(v.x * PPM, v.y * PPM, 0, -120, 0x9fd8ff, 4);
        break;
      case 'stink':
        this.particles.puff(headX, headY - 10, 0xb8d86a, 4, this.facingOf(id) * -40, -50, 12);
        break;
      default:
        break;
    }
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
    const scroll = -camera.x * PPM;
    this.entityLayer.x = this.shadows.x = this.particles.x = this.trails.x = scroll;
    this.glows.x = this.bubbles.x = scroll;
    this.water.back.x = this.water.front.x = this.behind.x = this.over.x = this.soapBubbles.x = scroll;
    this.particles.update(dt);
    this.trails.update(dt);
    const behind = this.behind.clear();
    const over = this.over.clear();

    const shadows = this.shadows.clear();
    const left = camera.x - 2;
    const right = camera.x + VIEW_WIDTH_PX / PPM + 2;
    const hover = this.pointer?.hoverWorld ?? null;
    const hoverId = this.pointer?.hoverId ?? null;
    // Cursor speed, for flinches.
    const cursorSpeed =
      hover && this.lastHover && dt > 0
        ? Math.hypot(hover.x - this.lastHover.x, hover.y - this.lastHover.y) / dt
        : 0;
    this.lastHover = hover;
    const views = this.sim.views();
    this.water.update(dt, camera, views);
    this.soapBubbles.update(dt, this.obstacles(views, left, right));
    if (this.sim.environment.state.hoseOn) {
      this.trickleIn -= dt;
      if (this.trickleIn <= 0) {
        this.trickleIn = 0.28 + Math.random() * 0.2;
        this.onSound?.('trickle', 0.5);
      }
    }
    const offer = this.offering(views);
    this.drawGlows(offer);
    const rimPulse = 0.8 + 0.2 * Math.sin(this.time * Math.PI * 4);
    const seen = new Set<EntityId>();
    for (const view of views) {
      seen.add(view.id);
      const sprite = this.sprites.get(view.id) ?? this.createSprite(view);
      const onScreen = view.x > left && view.x < right;
      sprite.visible = onScreen;
      if (!onScreen) continue;
      const j = this.juiceFor(view.id);
      j.squash.update(dt);
      // Floaters ride the ripples.
      const bob = this.water.bob(view);
      sprite.position.set(view.x * PPM, view.y * PPM + bob.dy);
      const rim = hoverId === view.id && !view.held ? rimPulse : 0;
      if (view.inMouthOf === undefined && view.submerged === 0 && !this.sim.environment.waterAt(view.x))
        this.drawShadow(shadows, view);
      const look = view.inMouthOf === undefined ? tagLook(view.tags, view.submerged) : tagLook([]);
      sprite.tint = look.tint ?? 0xffffff;
      this.tagEffects(view, look, j, dt, behind, over, bob.dy);
      const speed = Math.hypot(view.vx, view.vy);
      if (j.flying > 0) {
        j.flying -= dt;
        if (speed < 4 && j.flying < 2.6) j.flying = 0;
        else this.trails.trail(view.x * PPM, view.y * PPM, this.colorOf(sprite), this.sizeOf(view.id) * 0.7);
      }
      if (sprite instanceof BugSprite && view.bug) {
        this.updateBug(sprite, view, j, dt, hover, rim, offer, cursorSpeed);
      } else if (sprite instanceof ItemSprite) {
        const moving = view.held || j.flying > 0;
        const stretch = moving ? stretchFor(speed, 1.2, 0.5) : 1;
        let k = 1;
        if (view.inMouthOf !== undefined) {
          // Held in the mouth, in front of the face, shrinking with each bite.
          const bug = this.juice.get(view.inMouthOf);
          const liking = this.sim.view(view.inMouthOf)?.bug?.mouthful?.liking;
          const t = bug ? Math.max(0, bug.chewing) : 0;
          k = liking === 'disliked' ? 0.62 : Math.max(0.2, 0.62 - 0.13 * Math.floor(t * 2));
          sprite.zIndex = view.inMouthOf + 0.5;
        } else sprite.zIndex = view.id + (view.held ? 10000 : 0);
        sprite.pose(
          view.angle + bob.angle,
          Math.atan2(view.vy, view.vx),
          stretch,
          j.squash.sx * k,
          j.squash.sy * k,
        );
        sprite.setRim(rim > 0, rim);
        sprite.setStink(look.stink);
        sprite.setSoggy(view.soggy ?? 0);
        sprite.update(dt);
      }
    }
    for (const id of [...this.sprites.keys()]) if (!seen.has(id)) this.drop(id);
    this.drawWelds(over);
    this.drawMagnets(over, views, left, right);
    this.bubbles.update(dt, (id) => {
      const v = this.sim.view(id);
      if (!v || !v.bug) return null;
      const r = this.sim.content.bugs.get(v.defId).radius * PPM;
      return { x: v.x * PPM + v.bug.facing * r * 0.4, y: v.y * PPM - r * 2.1 - 14 };
    });
  }

  /** While the player holds food: which bugs would like it, and which one it would go to. */
  private offering(
    views: EntityView[],
  ): { defId: string; x: number; y: number; target: EntityId | null } | null {
    const held = views.find((v) => v.held && v.kind === 'item');
    if (!held || !this.sim.content.items.get(held.defId).tags.includes('tag_edible')) return null;
    return {
      defId: held.defId,
      x: held.x,
      y: held.y,
      target: this.sim.dropTargetFor(held.id)?.entityId ?? null,
    };
  }

  /**
   * Mouths glow while food is held: green for liked, yellow for neutral,
   * grey for disliked. The mouth that would get it glows brightest.
   */
  private drawGlows(offer: ReturnType<WorldView['offering']>): void {
    const g = this.glows.clear();
    this.glowing.clear();
    if (!offer) return;
    for (const bug of this.sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.mouthful !== null || this.sim.physics.grabbed === bug.id) continue;
      const m = this.mouthPx(bug.id);
      if (!m) continue;
      const liking = likingOf(this.sim.content.bugs.get(bug.defId), offer.defId);
      this.glowing.set(bug.id, liking);
      const color = GLOW[liking];
      const target = offer.target === bug.id;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 4 + bug.id);
      const r = (target ? 20 : 13) + pulse * (target ? 5 : 2);
      g.circle(m.x, m.y, r * 1.7).fill({ color, alpha: target ? 0.16 : 0.08 });
      g.circle(m.x, m.y, r * 1.25).fill({ color, alpha: target ? 0.22 : 0.12 });
      g.circle(m.x, m.y, r).stroke({ width: target ? 4 : 2.5, color, alpha: target ? 0.95 : 0.55 });
      if (target)
        g.circle(m.x, m.y, r + 7 + pulse * 5).stroke({
          width: 2.5,
          color: 0xffffff,
          alpha: 0.6 * (1 - pulse) + 0.2,
        });
    }
  }

  private colorOf(sprite: BugSprite | ItemSprite): number {
    return sprite instanceof BugSprite ? sprite.def.body : sprite.def.color;
  }

  private updateBug(
    sprite: BugSprite,
    view: EntityView,
    j: Juice,
    dt: number,
    hover: Point | null,
    rim: number,
    offer: ReturnType<WorldView['offering']>,
    cursorSpeed: number,
  ): void {
    const bug = view.bug!;
    const def = sprite.def;
    const r = def.radius;
    if (j.chewing >= 0) j.chewing += dt;
    j.flinch = Math.max(0, j.flinch - dt);
    j.hot = Math.max(0, j.hot - dt);
    const pose = bugPose({
      mode: bug.mode,
      vx: view.vx,
      vy: view.vy,
      time: this.time,
      phase: view.id * 1.37,
      walkSpeed: def.speed,
    });

    // The current reaction, if it is still showing.
    let look: ReactionLook | null = null;
    let age = 0;
    if (bug.reaction) {
      const l = reactionLook(def.art, bug.reaction.type, bug.reaction.variant);
      age = bug.reaction.age / 60;
      if (reactionShowing(bug.reaction.type, l.seconds, bug.mode, age)) look = l;
    }
    const override: FaceOverride | null = look
      ? { eyes: look.eyes, mouth: look.mouth, blush: look.blush, tint: look.tint, form: look.form }
      : null;

    // Food held nearby: open wide for favorites, clam up for the rest.
    let offered: Liking | null = null;
    if (offer && !view.held) {
      const near = Math.hypot(offer.x - view.x, offer.y - view.y) < OFFER_RANGE || offer.target === view.id;
      if (near) offered = likingOf(def, offer.defId);
    }
    // Flinch when the cursor whooshes past (faster than 1500 px/s within 300 px).
    if (hover && cursorSpeed > 15 && Math.hypot(hover.x - view.x, hover.y - view.y) < 3 && j.flinch <= 0) {
      j.flinch = 0.4;
      j.squash.kick(0.9, 1.08);
    }
    const frozen = view.tags.includes('tag_frozen');
    const face = bugFace({
      frozen,
      art: def.art,
      mode: bug.mode,
      needs: bug.needs,
      time: this.time,
      likesFlinging: def.likesFlinging,
      selfLaunched: bug.selfLaunched,
      mood: bug.mood,
      reaction: override,
      chewing: bug.mouthful?.liking ?? null,
      offered,
      tickle: Math.min(1, bug.tickle / 180),
      woozy: bug.woozy,
      flinch: j.flinch > 0,
      dizzyProof: def.dizzyProof,
    });
    if (j.hot > 0 && face.form === 'normal') face.tint = 'red';
    // Disliked food offered: shake the head no.
    let move = look ? movePose(look.move, age, look.seconds) : undefined;
    if (!look && offered === 'disliked') move = movePose('shake_head', this.time % 1, 2);
    if (!look && bug.tickle > 0) move = movePose('wiggle', this.time % 1, 2);

    const speed = Math.hypot(view.vx, view.vy);
    const flying = bug.mode === 'st_airborne' || bug.mode === 'st_use';
    const held = bug.mode === 'st_held';

    // Where to look: the cursor when it is close, food on offer, or ahead.
    let target: Look = { x: bug.facing * 0.5, y: 0.1 };
    if (bug.mode === 'st_eat') target = { x: bug.facing * 0.7, y: 0.6 };
    const focus = offer && offered ? { x: offer.x, y: offer.y } : hover;
    if (focus && !flying) {
      const hx = view.x + bug.facing * r * 0.8;
      const hy = view.y - r * 0.4;
      const dx = focus.x - hx;
      const dy = focus.y - hy;
      const d = Math.hypot(dx, dy);
      if (d < 3 && d > 1e-3) {
        const k = Math.min(1, d / 0.6);
        target = { x: (dx / d) * k, y: (dy / d) * k };
      }
    }
    j.look.x = approach(j.look.x, target.x, 12, dt);
    j.look.y = approach(j.look.y, target.y, 12, dt);

    // Tumble while flying (Rollo rolls for real; the others spin for show).
    if (flying && !bug.selfLaunched && face.form !== 'curled' && face.form !== 'flying') {
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
      move: frozen ? undefined : move,
      rim,
      skate: this.sim.environment.skating.has(view.id),
      chute: def.glidesWhenFlung && bug.mode === 'st_airborne' && !bug.selfLaunched && view.vy > 0.5,
    });
    // Rollo holding his breath on the bottom lets out the odd bubble.
    if (bug.mode === 'st_swim' && view.submerged > 0.9) {
      j.puff -= dt;
      if (j.puff <= 0) {
        j.puff = 0.5 + Math.random() * 0.6;
        const m = this.mouthPx(view.id);
        if (m) this.particles.bubbles(m.x, m.y - 6, 2);
      }
    }
    this.think(view, j, dt, rim > 0);
  }

  /**
   * Thought bubbles for low needs: every few seconds on their own, and
   * after the cursor rests on the bug for a second.
   */
  private think(view: EntityView, j: Juice, dt: number, hovered: boolean): void {
    j.thinkIn -= dt;
    j.hovered = hovered ? j.hovered + dt : 0;
    const busy = this.bubbles.kindOf(view.id) !== null;
    const due = j.thinkIn <= 0 || j.hovered >= HOVER_THOUGHT;
    if (busy || !due || view.bug!.mode === 'st_held') return;
    const def = this.sim.content.bugs.get(view.defId);
    const thought = thoughtFor(def, view.bug!.needs, this.sim.content.items);
    j.thinkIn = THOUGHT_EVERY;
    if (j.hovered >= HOVER_THOUGHT) j.hovered = -60; // once per hover
    if (!thought) return;
    const food = thought.food ? this.sim.content.items.get(thought.food) : null;
    this.bubbles.show(view.id, 'thought', thought.pictos, 2.6, food);
  }

  /** Things soap bubbles pop against: every entity on screen, as a circle. */
  private obstacles(views: readonly EntityView[], left: number, right: number): Obstacle[] {
    const out: Obstacle[] = [];
    for (const v of views) {
      if (v.x < left || v.x > right || v.inMouthOf !== undefined) continue;
      out.push({ x: v.x * PPM, y: v.y * PPM, r: this.sizeOf(v.id) * 0.9 });
    }
    return out;
  }

  /**
   * Show an entity's tags (game design doc, section 6): drips, stink puffs,
   * glows, shimmer, ice, foam, gloss, frost, and fuzzy hair.
   */
  private tagEffects(
    view: EntityView,
    look: TagLook,
    j: Juice,
    dt: number,
    behind: Graphics,
    over: Graphics,
    dy: number,
  ): void {
    const x = view.x * PPM;
    const y = view.y * PPM + dy;
    const half = this.sizeOf(view.id);
    const wide = this.widthOf(view.id);
    const t = this.time + view.id;
    if (look.drip !== null && !view.held) {
      j.drip -= dt;
      if (j.drip <= 0) {
        j.drip = look.dripEvery * (0.7 + Math.random() * 0.6);
        this.particles.drip(x + (Math.random() - 0.5) * wide, y + half * 0.8, look.drip);
      }
    } else if (look.drip !== null && view.held) {
      // Held wet things drip faster, straight down from the hand.
      j.drip -= dt * 1.5;
      if (j.drip <= 0) {
        j.drip = look.dripEvery;
        this.particles.drip(x + (Math.random() - 0.5) * wide * 0.6, y + half, look.drip);
      }
    }
    if (look.drip !== null && look.drip !== 0x9bd14a && !view.held) {
      // Beads of water sitting on top, catching the light.
      for (let k = 0; k < 3; k++) {
        const bx = x + (k - 1) * wide * 0.45;
        const by = y - half * 0.55 + (k % 2) * 5;
        over
          .circle(bx, by, 4.5)
          .fill({ color: 0x9fdcf5, alpha: 0.9 })
          .stroke({ width: 1.5, color: 0x2f7fb0, alpha: 0.6 });
        over.circle(bx - 1.5, by - 1.5, 1.5).fill(0xffffff);
      }
    }
    if (look.stink && view.kind === 'bug') {
      for (let i = 0; i < 2; i++) {
        const rise = (t * 0.6 + i * 0.5) % 1;
        const x0 = x - 12 + i * 24;
        const y0 = y - half - 8 - rise * 30;
        over.moveTo(x0, y0);
        for (let k = 1; k <= 4; k++) over.lineTo(x0 + Math.sin(k * 1.7 + t * 4) * 5, y0 - k * 6);
        over.stroke({ width: 3.5, color: 0x9bbf4a, alpha: 1 - rise, cap: 'round', join: 'round' });
      }
    }
    if (look.stink) {
      j.puff -= dt;
      if (j.puff <= 0) {
        j.puff = 1.1 + Math.random() * 0.8;
        this.particles.puff(x, y - half - 6, 0xb8d86a, 1, 0, -30, 10);
      }
    }
    if (look.hot) {
      // A warm glow behind, and heat shimmer rising above.
      const pulse = 0.8 + 0.2 * Math.sin(t * 6);
      const rr = Math.max(half, wide);
      behind.circle(x, y, (rr + 22) * pulse).fill({ color: 0xff7a1f, alpha: 0.22 });
      behind.circle(x, y, rr + 12).fill({ color: 0xffa23a, alpha: 0.35 });
      behind.circle(x, y, rr + 5).fill({ color: 0xffd23f, alpha: 0.45 });
      for (let i = 0; i < 3; i++) {
        const rise = (t * 0.8 + i / 3) % 1;
        const sx = x - wide * 0.5 + (i / 2) * wide;
        const sy = y - half - 4 - rise * 34;
        over.moveTo(sx, sy);
        for (let k = 1; k <= 3; k++) over.lineTo(sx + Math.sin(k * 2 + t * 9 + i) * 4, sy - k * 7);
        over.stroke({ width: 3, color: 0xff9a3c, alpha: 0.7 * (1 - rise), cap: 'round' });
      }
    }
    if (look.ice) {
      const w = wide + 14;
      const h = half + 14;
      over
        .roundRect(x - w, y - h, w * 2, h * 2, 14)
        .fill({ color: 0xdff4ff, alpha: 0.42 })
        .stroke({ width: 4, color: 0x9fd0ee, alpha: 0.95 });
      over
        .moveTo(x - w + 10, y - h + 10)
        .lineTo(x - w + 34, y - h + 10)
        .stroke({ width: 4, color: 0xffffff, alpha: 0.9, cap: 'round' });
      over
        .moveTo(x - w + 10, y - h + 20)
        .lineTo(x - w + 18, y - h + 20)
        .stroke({ width: 4, color: 0xffffff, alpha: 0.9, cap: 'round' });
      over
        .moveTo(x + w * 0.3, y + h * 0.2)
        .lineTo(x + w * 0.5, y + h * 0.5)
        .lineTo(x + w * 0.7, y + h * 0.4)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
    }
    if (look.frost) {
      for (let k = 0; k < 3; k++) {
        const tw = Math.sin(t * 4 + k * 2.3);
        if (tw < 0.3) continue;
        const a = k * 2.1 + t * 0.3;
        over
          .star(x + Math.cos(a) * (wide + 8), y + Math.sin(a) * (half + 8), 4, 8 * tw, 3 * tw)
          .fill(0xffffff);
      }
    }
    if (look.foam) {
      for (let k = 0; k < 5; k++) {
        const fx = x + (k - 2) * wide * 0.35;
        const fy = y - half * 0.8 - Math.abs(Math.sin(k * 1.9)) * 6;
        over.circle(fx, fy, 5 + (k % 2) * 3 + Math.sin(t * 3 + k) * 1).fill({ color: 0xffffff, alpha: 0.95 });
        over.circle(fx, fy, 5 + (k % 2) * 3).stroke({ width: 1.5, color: 0x9fd8f0, alpha: 0.8 });
      }
    }
    if (look.gloss && view.kind === 'bug')
      over.ellipse(x - wide * 0.3, y - half * 0.5, 8, 4).fill({ color: 0xffd1e8, alpha: 0.9 });
    if (look.fuzz) {
      // Static hair standing on end.
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI + (k / 10) * Math.PI;
        const r0 = Math.max(half, wide) * 0.8;
        const r1 = r0 + 18 + (k % 3) * 6 + Math.sin(t * 20 + k) * 2;
        behind
          .moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
          .lineTo(x + Math.cos(a + 0.08) * (r0 + r1) * 0.5, y + Math.sin(a + 0.08) * (r0 + r1) * 0.5)
          .lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
          .stroke({ width: 4, color: OUTLINE, cap: 'round', join: 'round' });
      }
    }
  }

  /** Pink goo where sticky things hold on to each other. */
  private drawWelds(g: Graphics): void {
    const live = new Set<string>();
    for (const s of this.sim.environment.state.sticks) {
      const a = this.sim.view(s.a);
      const b = this.sim.view(s.b);
      if (!a || !b) continue;
      const key = `${Math.min(s.a, s.b)}:${Math.max(s.a, s.b)}`;
      live.add(key);
      let w = this.welds.get(key);
      if (!w) {
        // Remember where the weld sits on each body, in that body's own frame.
        const local = (v: EntityView): Point => {
          const dx = s.x - v.x;
          const dy = s.y - v.y;
          const c = Math.cos(-v.angle);
          const sn = Math.sin(-v.angle);
          return { x: dx * c - dy * sn, y: dx * sn + dy * c };
        };
        w = { la: local(a), lb: local(b) };
        this.welds.set(key, w);
      }
      const world = (v: EntityView, p: Point): Point => ({
        x: (v.x + p.x * Math.cos(v.angle) - p.y * Math.sin(v.angle)) * PPM,
        y: (v.y + p.x * Math.sin(v.angle) + p.y * Math.cos(v.angle)) * PPM,
      });
      const pa = world(a, s.a === a.id ? w.la : w.lb);
      const pb = world(b, s.b === b.id ? w.lb : w.la);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      g.moveTo(pa.x, pa.y)
        .lineTo(pb.x, pb.y)
        .stroke({ width: Math.max(4, 12 - len * 0.2) + 5, color: OUTLINE, alpha: 0.7, cap: 'round' });
      g.moveTo(pa.x, pa.y)
        .lineTo(pb.x, pb.y)
        .stroke({ width: Math.max(4, 12 - len * 0.2), color: 0xff8fc8, cap: 'round' });
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      g.circle(mx, my, 9).fill(0xff8fc8).stroke({ width: 3, color: OUTLINE, alpha: 0.7 });
      g.circle(mx - 3, my - 3, 3).fill({ color: 0xffffff, alpha: 0.9 });
    }
    for (const key of [...this.welds.keys()]) if (!live.has(key)) this.welds.delete(key);
  }

  /** Red and blue field lines between a magnet and metal it is pulling. */
  private drawMagnets(g: Graphics, views: readonly EntityView[], left: number, right: number): void {
    for (const m of views) {
      if (m.kind !== 'item' || m.x < left || m.x > right) continue;
      if (!this.sim.content.items.get(m.defId).magnet) continue;
      for (const o of views) {
        if (o.id === m.id || !o.tags.includes('tag_magnetic')) continue;
        const d = Math.hypot(o.x - m.x, o.y - m.y);
        if (d > 2.5 || d < 0.45) continue;
        const k = 1 - d / 2.5;
        for (const [side, color] of [
          [1, 0xff4f5e],
          [-1, 0x4d9bff],
        ] as const) {
          const mx = ((m.x + o.x) / 2) * PPM - (o.y - m.y) * 18 * side;
          const my = ((m.y + o.y) / 2) * PPM + (o.x - m.x) * 18 * side;
          const dash = (this.time * 3) % 1;
          g.moveTo(m.x * PPM, m.y * PPM)
            .quadraticCurveTo(mx, my, o.x * PPM, o.y * PPM)
            .stroke({
              width: 3,
              color,
              alpha: 0.35 + 0.35 * k * (0.6 + 0.4 * Math.sin(dash * Math.PI * 2)),
              cap: 'round',
            });
        }
      }
    }
  }

  /** Half width in pixels, roughly. */
  private widthOf(id: EntityId): number {
    const e = this.sim.entities.get(id);
    if (!e) return 20;
    if (e.kind === 'bug') return this.sim.content.bugs.get(e.defId).radius * PPM;
    const s = this.sim.content.items.get(e.defId).shape;
    return (s.type === 'circle' ? s.radius : s.width / 2) * PPM;
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
    this.bubbles.hide(id);
  }

  /** Number of entity sprites currently alive (test hook). */
  get spriteCount(): number {
    return this.sprites.size;
  }

  /** Bubbles showing now (test hook). */
  bubbleList(): BubbleInfo[] {
    return this.bubbles.list();
  }

  override destroy(): void {
    this.offs.forEach((off) => off());
    super.destroy({ children: true });
  }

  /** Floating soap bubbles alive now (test hook). */
  get soapBubbleCount(): number {
    return this.soapBubbles.count;
  }
}
