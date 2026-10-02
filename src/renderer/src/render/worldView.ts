import { Container, Graphics } from 'pixi.js';
import type { AreaMusic } from './areaArt/live';
import type { Renderer } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_WIDTH_PX } from '../../../game/constants';
import type { EntityId } from '../../../game/core/entities';
import type { Liking } from '../../../game/events';
import type { EntityView, Sim } from '../../../game/sim';
import { likingOf } from '../../../game/systems/bugAi';
import { Background } from './background';
import { clueLives } from './areaArt/cluesLive';
import { ArcadeLive } from './areaArt/arcadeLive';
import { AntHillLive } from './areaArt/antHillLive';
import { DepthsLive } from './areaArt/depthsLive';
import { FinaleLive } from './areaArt/finaleLive';
import { GnomeLive } from './areaArt/gnomeLive';
import { HollowLive } from './areaArt/hollowLive';
import { CanWallLive, LockView, SunflowerLive } from './areaArt/barrierLive';
import { CompostLive } from './areaArt/compostLive';
import { CritterLive } from './areaArt/critterLive';
import type { CritterInfo } from './areaArt/critterLive';
import { FlowerbedLive } from './areaArt/flowerbedLive';
import type { AreaLive } from './areaArt/live';
import { BenchLive } from './areaArt/benchLive';
import type { BenchLook } from './areaArt/benchLive';
import { CauldronLive } from './areaArt/cauldronLive';
import type { AreaFrame, AreaSound } from './areaArt/live';
import { PorchLive } from './areaArt/porchLive';
import type { AreaDef, FixtureDef } from '../../../game/data/types';
import { Bubbles } from './bubbles';
import type { BubbleInfo } from './bubbles';
import type { FaceOverride } from './bugFace';
import { bugFace } from './bugFace';
import { bugPose } from './bugPose';
import type { Camera, Point } from './camera';
import { BugSprite } from './draw/bug';
import { artStore } from '../art/artStore';
import { itemArt, makeBugView } from '../art/bugViews';
import type { BugFrame } from './draw/bug';
import type { Look } from './draw/face';
import { ItemSprite } from './draw/item';
import { SquashSpring, approach, hoverLift, rimPulse as pulseAt, shakeOffset, stretchFor } from './juice';
import { OUTLINE, mix } from './palette';
import { Particles } from './particles';
import type { Move, Picto, ReactionLook } from './reactions';
import { movePose, reactionLook, reactionShowing } from './reactions';
import { thoughtFor } from './thoughts';
import { HINT_CHANCE, hintThought } from './hintThoughts';
import { SoapBubbles } from './soapBubbles';
import type { Obstacle } from './soapBubbles';
import { tagLook } from './tagLooks';
import type { TagLook } from './tagLooks';
import { WaterView } from './water';
import { FixtureArt } from './fixtureArt';
import { NO_WEATHER, easeWeather, roomLook, skyLook, weatherTarget } from './skyLook';
import type { SkyLook, WeatherMix } from './skyLook';
import { WeatherView } from './weatherView';
import { RAINBOW, easeScale, potionLook } from './potionLooks';
import { PAINT_HEX } from '../../../game/systems/paint';
import type { PotionLook } from './potionLooks';
import { drawPotionBehind, drawPotionOver } from './potionView';
import { hourOf } from '../../../game/systems/sky';
import type { HintLook } from './hints';
import { NO_HINTS } from './hints';
import type { SkyExtras } from './background';
import {
  listen as _listen,
  listenSocial as _listenSocial,
  listenWater as _listenWater,
  listenSky as _listenSky,
  listenPotions as _listenPotions,
} from './worldViewEvents';

export const PPM = PIXELS_PER_METER;

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
  /** Seconds left of a chat line being said. */
  talk: number;
  /** An idle fidget or a social move playing, and how far along it is. */
  move: { move: Move; t: number; seconds: number } | null;
  /** Seconds until the next snore "Z". */
  snore: number;
  /** The size potions have it drawn at, springing toward the sim's (M8). */
  size: { value: number; v: number };
  /** Its own animation clock: slow-mo runs it slow, speedy fast. */
  clock: number;
  /** Seconds until the next potion trail puff. */
  trailIn: number;
  /** How far a hovered loose thing has lifted toward the hand (0 to `HOVER_LIFT`). */
  lift: number;
  /** Glancing around (a fidget): seconds left. */
  glance: number;
}

/** Where the cursor is, in world meters, or null when it is off the canvas. */
/** Squash kicks keep this share of their size with reduce motion on. */
const SQUASH_REDUCED = 0.4;

export interface PointerSource {
  readonly hoverWorld: Point | null;
  /** The grabbable thing under the cursor, if any. */
  readonly hoverId?: EntityId | null;
  /** A fixture the hand is working: the bench's lever, or the cauldron's ladle (M8). */
  readonly fixtureDrag?: { kind: 'lever' | 'stir'; amount: number; angle: number } | null;
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
  /** The part of the world graded by the time of day (all but lights, glows, and bubbles). */
  private readonly graded = new Container();
  /** Day, night, and weather: rain, puddles, leaves, mist, and lights. */
  readonly weather: WeatherView;
  /** The sundial, the weather vane, and the knothole's eyes. */
  readonly fixtures: FixtureArt;
  /** The weather's look right now, eased so changes roll in. */
  weatherMix: WeatherMix = NO_WEATHER;

  /** How much of each weather shows right now (eased), for tests. */
  get weatherAmount(): WeatherMix {
    return this.weatherMix;
  }
  /** The current look, for tests and the thumbnail. */
  look: SkyLook = skyLook(9);
  shooting: { x: number; y: number; dir: 1 | -1; age: number }[] = [];
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
  onSound: ((name: 'pop' | 'trickle' | 'snore', strength: number) => void) | null = null;
  private trickleIn = 0;
  /** Where each weld sits on its two bodies, so the goo blob follows them. */
  readonly welds = new Map<string, { la: Point; lb: Point }>();
  readonly sprites = new Map<EntityId, BugSprite | ItemSprite>();
  /** The art store's version the bug views were built for. */
  private artVersion = artStore.version;
  private readonly juice = new Map<EntityId, Juice>();
  readonly offs: Array<() => void> = [];
  time = 0;
  private shakeLeft = 0;
  private shakePower = 0;
  private reduced = false;
  /** Affordance wobbles and glints, set by the game (`render/hints.ts`). */
  hints: HintLook = NO_HINTS;
  /** The music's beat and the sequencer's playhead, set by the game (M9). */
  music: (() => AreaMusic | null) | null = null;
  /** Shakes asked for, and the biggest shake offset drawn, since `resetShakeStats` (test hook). */
  readonly shakeStats = { requests: 0, max: 0 };
  private lastHover: Point | null = null;
  /** Bugs whose mouth glows right now, and in what color (test hook). */
  readonly glowing = new Map<EntityId, Liking>();

  constructor(
    readonly sim: Sim,
    private readonly pointer: PointerSource | null = null,
    renderer: Renderer | null = null,
  ) {
    super();
    this.background = new Background(sim.content.areas.all, sim.terrain, sim.worldWidth, renderer);
    const bg = this.background;
    this.water = new WaterView(sim, this.particles);
    this.weather = new WeatherView(sim, this.water);
    this.fixtures = new FixtureArt(sim);
    this.entityLayer.sortableChildren = true;
    this.lives = makeLives(sim, (x) => this.water.surfaceAt(x));
    for (const live of this.lives) live.glow.blendMode = 'add';
    this.graded.addChild(
      bg.near,
      this.fixtures,
      ...this.lives.map((l) => l.back),
      this.weather.puddles,
      this.water.back,
      this.behind,
      this.shadows,
      this.trails,
      this.entityLayer,
      ...this.lives.filter((l) => !(l instanceof LockView)).map((l) => l.front),
      this.over,
      this.water.front,
      this.weather.splashLayer,
      this.soapBubbles,
      this.particles,
    );
    this.world.addChild(
      this.graded,
      ...this.lives.filter((l) => l instanceof LockView).map((l) => l.front),
      ...this.lives.map((l) => l.glow),
      this.weather.lights,
      this.fixtures.eyes,
      this.glows,
      this.bubbles,
      this.wishHint,
    );
    this.weather.extraLights = (light) => {
      if (!this.areaFrame) return;
      for (const live of this.lives) {
        // Locked areas show only their hints, not their full lights.
        if (!(live instanceof LockView) && this.lockedAt((live.x0 + live.x1) / 2)) continue;
        live.lights(this.areaFrame, light);
      }
    };
    this.weatherMix = weatherTarget(sim.weather.weather);
    this.soapBubbles.onPop = (x, y) => {
      this.particles.ring(x, y, 14);
      this.onSound?.('pop', 0.5);
    };
    this.addChild(
      bg.sky,
      bg.rainbow,
      bg.clouds,
      bg.hills,
      this.weather.back,
      bg.mid,
      this.world,
      bg.front,
      this.weather.front,
    );
    this.listen();
    this.listenSky();
    for (const live of this.lives) this.offs.push(...live.listen(sim, this.particles));
  }

  /** The areas' live views: flowers, the porch, the compost lab, the arcade, the barriers, locked previews. */
  private readonly lives: AreaLive[];

  /** What the Tinker Bench shows (tray glows, its phase, its cork board), for tests. */
  benchLook(): BenchLook | null {
    const bench = this.lives.find((l): l is BenchLive => l instanceof BenchLive);
    return bench ? bench.look() : null;
  }
  private areaFrame: AreaFrame | null = null;
  /** Ambient sounds from the areas (bees, drips, steam, arcade blips). */
  onAmbient: ((name: AreaSound, strength: number) => void) | null = null;

  private ambientIn = 2;

  /**
   * Each area sounds like itself (game design doc, section 16): bees and
   * birds over the flowerbed, creaks and drips under the porch, blorps and
   * hisses in the compost lab, blips in the arcade. Quiet, and only now and then.
   */
  private ambience(dt: number, camera: Camera): void {
    this.ambientIn -= dt;
    if (this.ambientIn > 0 || !this.onAmbient) return;
    this.ambientIn = 2.5 + Math.random() * 4;
    const area = this.sim.areaOf(camera.centerX);
    const open = this.sim.barriers.isOpen(area.id);
    const night = this.look.glow > 0.5;
    const s = open ? 0.8 : 0.35;
    switch (area.mood) {
      case 'garden':
        this.onAmbient(night ? 'tulip_hum' : Math.random() < 0.5 ? 'bee_hum' : 'birdsong', s);
        break;
      case 'porch':
        this.onAmbient(Math.random() < 0.5 ? 'creak' : 'drip', s);
        break;
      case 'compost':
        this.onAmbient(Math.random() < 0.6 ? 'bubble_blorp' : 'steam_hiss', s);
        break;
      case 'arcade':
        this.onAmbient(Math.random() < 0.6 ? 'arcade_blip' : 'leaf_rustle', s);
        break;
      case 'depths':
        this.onAmbient(this.sim.weather.night ? 'ant_snore' : 'ant_march', s);
        break;
      case 'hollow':
        this.onAmbient('hollow_tick', s * 0.7);
        break;
      default:
        if (!night && Math.random() < 0.3) this.onAmbient('birdsong', 0.4);
    }
  }

  /** Is world pixel x in a locked area? */
  private lockedAt(xPx: number): boolean {
    return !this.sim.barriers.isOpen(this.sim.areaOf(xPx / PPM).id);
  }

  /**
   * Reduce motion (settings): no screen shake at all, gentler squash, and
   * half the particles.
   */
  set reduceMotion(on: boolean) {
    this.reduced = on;
    this.particles.density = on ? 0.5 : 1;
    for (const j of this.juice.values()) j.squash.amount = on ? SQUASH_REDUCED : 1;
    if (on) this.shakeLeft = this.shakePower = 0;
  }

  get reduceMotion(): boolean {
    return this.reduced;
  }

  /** The cauldron's ladle is going round by itself, inviting a stir (test hook). */
  get ladleInviting(): boolean {
    return this.lives.some((l) => l instanceof CauldronLive && l.inviting);
  }

  /** How far the screen shake moves the world this frame, in pixels (test hook). */
  get shakeOffset(): { x: number; y: number } {
    return { x: this.world.position.x, y: this.world.position.y };
  }

  juiceFor(id: EntityId): Juice {
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
        talk: 0,
        move: null,
        snore: 0.5 + Math.random(),
        glance: 0,
        size: { value: 1, v: 0 },
        clock: Math.random() * 10,
        trailIn: 0,
        lift: 0,
      };
      j.squash.amount = this.reduced ? SQUASH_REDUCED : 1;
      this.juice.set(id, j);
    }
    return j;
  }

  /** A bug's mouth in world pixels. */
  mouthPx(id: EntityId): Point | null {
    const m = this.sim.mouthAnchor(id);
    return m ? { x: m.x * PPM, y: m.y * PPM } : null;
  }

  facingOf(id: EntityId): 1 | -1 {
    return this.sim.entities.get(id)?.bug?.facing ?? 1;
  }

  itemColor(defId: string): number {
    return this.sim.content.items.has(defId) ? this.sim.content.items.get(defId).color : 0xe8334a;
  }

  hasTag(defId: string, tag: string): boolean {
    return this.sim.content.items.has(defId) && this.sim.content.items.get(defId).tags.includes(tag);
  }

  /** Show a speech bubble for a bug. `friend` is a bug def to picture. */
  say(
    id: EntityId,
    pictos: readonly Picto[],
    seconds: number,
    food: string | null = null,
    friend: string | null = null,
  ): void {
    const def = food && this.sim.content.items.has(food) ? this.sim.content.items.get(food) : null;
    const pal = friend && this.sim.content.bugs.has(friend) ? this.sim.content.bugs.get(friend) : null;
    this.bubbles.show(id, 'speech', pictos, seconds, def, pal);
  }

  /** Play a body move on a bug for a while (a fidget or a pat). */
  moveBug(id: EntityId, move: Move, seconds: number): void {
    this.juiceFor(id).move = { move, t: 0, seconds };
  }

  private defOf(id: EntityId): string | null {
    return this.sim.entities.get(id)?.defId ?? null;
  }

  listen(): void {
    _listen(this);
  }

  /** What a bug is off to do, shown as a quick bubble so players can read its plan. */
  intent(id: EntityId, action: string, targetId: EntityId | null): void {
    const target = targetId === null ? null : this.defOf(targetId);
    const brain = this.sim.entities.get(id)?.bug;
    const item = brain?.social?.item ?? null;
    const toy = item === null ? null : this.defOf(item);
    switch (action) {
      case 'eat':
        if (target) this.say(id, ['food', 'exclaim'], 1.3, target);
        return;
      case 'bounce':
        this.say(id, ['spring', 'exclaim'], 1.3);
        return;
      case 'inspect':
        if (target) this.say(id, ['question', 'food'], 1.1, target);
        return;
      case 'sleep':
        this.say(id, ['zzz'], 1.2);
        return;
      case 'splash':
        this.say(id, ['drop', 'exclaim'], 1.2);
        return;
      case 'perform':
        this.say(id, ['star', 'up'], 1.2);
        return;
      case 'soc_chat':
        this.say(id, ['friend', 'heart'], 1.1, null, target);
        return;
      case 'soc_bump':
        this.say(id, ['friend', 'star'], 1.1, null, target);
        return;
      case 'soc_tag':
        this.say(id, ['friend', 'exclaim'], 1.1, null, target);
        return;
      case 'soc_catch':
        this.say(id, ['food', 'friend'], 1.3, toy, target);
        return;
      case 'soc_share_food':
        this.say(id, ['food', 'heart'], 1.3, toy);
        return;
      case 'soc_comfort':
        this.say(id, ['friend', 'sweat'], 1.2, null, target);
        return;
      case 'soc_steal':
        // A sneaky grin at someone's snack.
        {
          const snack = targetId === null ? null : (this.sim.entities.get(targetId)?.bug?.carrying ?? null);
          this.say(id, ['food', 'laugh'], 1.1, snack === null ? null : this.defOf(snack));
        }
        return;
      case 'soc_ride':
        this.say(id, ['up', 'friend'], 1.1, null, target);
        return;
      default:
        return;
    }
  }

  /** Bugs together: chats, boops, tag, catch, snacks shared and snatched, pats, naps, and rides. */
  listenSocial(): Array<() => void> {
    return _listenSocial(this);
  }

  /** Water and property events: splashes, steam, ice, goo, bubbles, stink. */
  listenWater(): Array<() => void> {
    return _listenWater(this);
  }

  /** Play a reaction: its bubble and its one-off particles. The face comes from the view each frame. */
  react(id: EntityId, defId: string, type: Parameters<typeof reactionLook>[1], variant: number): void {
    const def = this.sim.content.bugs.get(defId);
    const look = reactionLook(def.art, type, variant);
    const j = this.juiceFor(id);
    // Under an opera or squeaky potion, everything it says comes out sung.
    const sung = this.sim.view(id)?.effects?.some((e) => e.effect === 'opera' || e.effect === 'squeaky');
    // A busy bug's "later" shows the food held out to it.
    const grabbed = this.sim.physics.grabbed;
    const held = type === 'later' && grabbed !== null ? this.sim.entities.get(grabbed) : undefined;
    this.say(
      id,
      sung ? ['note', look.pictos[0] ?? 'note'] : look.pictos,
      Math.max(1.2, look.seconds) + 0.4,
      held?.kind === 'item' ? held.defId : j.food,
    );
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
  sizeOf(id: EntityId): number {
    const e = this.sim.entities.get(id);
    if (!e) return 20;
    if (e.kind === 'bug') {
      // A box-shaped bug (Twig) is as tall as its box, like the item it pretends to be.
      const def = this.sim.content.bugs.get(e.defId);
      return def.collider ? (def.collider.height / 2) * PPM : def.radius * PPM;
    }
    const s = this.sim.content.items.get(e.defId).shape;
    return (s.type === 'circle' ? s.radius : s.height / 2) * PPM;
  }

  shake(px: number, seconds: number): void {
    this.shakeStats.requests++;
    if (this.reduced) return;
    this.shakePower = Math.max(this.shakePower, Math.min(6, px));
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
  }

  /** Day, night, and weather events: the vane, the knothole, shooting stars, fireflies, secrets. */
  listenSky(): void {
    _listenSky(this);
  }

  /** What the sky looks like right now, eased toward the weather. */
  private updateLook(dt: number, camera: Camera): SkyExtras {
    const sky = this.sim.weather;
    this.weatherMix = easeWeather(this.weatherMix, weatherTarget(sky.weather), dt, 4);
    this.look = skyLook(hourOf(sky.clock), this.weatherMix);
    // M10's hidden areas have their own light, not the sky's.
    const room = this.sim.hidden.hiddenAt(camera.centerX);
    if (room) this.look = roomLook(this.look, room.mood === 'hollow' ? 'hollow' : 'depths', sky.night);
    this.shooting = this.shooting.filter((s) => (s.age += dt) < 1.2);
    return {
      shades:
        sky.state.shades >= 0 &&
        sky.state.shades === Math.floor(sky.clock / 86400) &&
        sky.phase !== 'phase_night',
      rainbow: this.weatherMix.rainbow,
      wind: this.sim.environment.state.wind,
      shooting: this.shooting,
    };
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    const extras = this.updateLook(dt, camera);
    this.background.update(camera, this.time, this.look, extras);
    this.graded.tint = this.look.near;
    // Water reads the sky too: orange at dusk, deep teal at night.
    const water = mix(mix(0xffffff, 0xffc8a0, this.look.warmth * 0.5), 0x5f8fb0, this.look.glow * 0.7);
    this.water.back.tint = this.water.front.tint = water;
    this.fixtures.hints = this.hints;
    this.fixtures.reduced = this.reduced;
    this.fixtures.update(dt, this.time, this.look.glow);
    if (this.shakeLeft > 0) this.shakeLeft -= dt;
    const shake = shakeOffset(this.shakePower, this.shakeLeft, this.reduced);
    if (this.shakeLeft <= 0) this.shakePower = 0;
    // The background scrolls its own near layer; entities, shadows, and
    // particles follow it. The world container carries the screen shake.
    this.world.position.set(shake.x, shake.y);
    this.shakeStats.max = Math.max(this.shakeStats.max, Math.abs(shake.x), Math.abs(shake.y));
    const scroll = -camera.x * PPM;
    this.entityLayer.x = this.shadows.x = this.particles.x = this.trails.x = scroll;
    this.glows.x = this.bubbles.x = scroll;
    this.water.back.x = this.water.front.x = this.behind.x = this.over.x = this.soapBubbles.x = scroll;
    this.fixtures.x = this.fixtures.eyes.x = this.weather.puddles.x = this.weather.lights.x = scroll;
    this.weather.splashLayer.x = scroll;
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
    // Pocketed things are drawn by the pocket tray, not the world.
    const views = this.sim.views().filter((v) => v.pocket === undefined);
    this.areaFrame = {
      sim: this.sim,
      dt,
      time: this.time,
      left: camera.x * PPM,
      right: camera.x * PPM + VIEW_WIDTH_PX,
      look: this.look,
      weather: this.weatherMix,
      views,
      hand: hover ? { x: hover.x * PPM, y: hover.y * PPM } : null,
      particles: this.particles,
      sound: (name, strength) => this.onAmbient?.(name, strength),
      drag: this.pointer?.fixtureDrag ?? null,
      hints: this.hints,
      reduced: this.reduced,
      music: this.music?.() ?? null,
    };
    for (const live of this.lives) {
      live.update(this.areaFrame);
      live.back.x = live.front.x = live.glow.x = scroll;
    }
    this.ambience(dt, camera);
    this.water.update(dt, camera, views);
    this.weather.update(dt, camera, this.look, this.weatherMix, views);
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
    const rimPulse = pulseAt(this.time);
    const seen = new Set<EntityId>();
    // New art (hot reload, or the art switched on or off): rebuild every bug's view.
    if (this.artVersion !== artStore.version) {
      this.artVersion = artStore.version;
      for (const [id, sprite] of this.sprites) {
        const drawnItem = sprite instanceof ItemSprite && sprite.def.art === 'twig';
        if (!(sprite instanceof BugSprite) && !drawnItem) continue;
        sprite.destroy({ children: true });
        this.sprites.delete(id);
      }
    }
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
      sprite.position.set(view.x * PPM, view.y * PPM + bob.dy + this.footDrop(view));
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
        if (view.carriedBy !== undefined) {
          // Held out in front in the bug's front legs.
          sprite.zIndex = view.carriedBy + 0.5;
        } else if (view.inMouthOf !== undefined) {
          // Held in the mouth, in front of the face, shrinking with each bite.
          const bug = this.juice.get(view.inMouthOf);
          const liking = this.sim.view(view.inMouthOf)?.bug?.mouthful?.liking;
          const t = bug ? Math.max(0, bug.chewing) : 0;
          k = liking === 'disliked' ? 0.62 : Math.max(0.2, 0.62 - 0.13 * Math.floor(t * 2));
          sprite.zIndex = view.inMouthOf + 0.5;
        } else sprite.zIndex = view.id + (view.held ? 10000 : 0);
        // Potions on things: giant marbles, tiny springs, heavy pebbles look the part.
        const potion = view.effects ? potionLook(view.effects, view.scale ?? 1, this.time) : null;
        j.size = easeScale(j.size, view.scale ?? 1, dt);
        k *= Math.max(0.2, j.size.value);
        // Hovered, it lifts a little toward the hand.
        j.lift = hoverLift(j.lift, rim > 0, dt);
        k *= 1 + j.lift;
        if (potion?.tint) sprite.tint = potion.tint;
        // Toasted food (rule R12): browned, and it steams a little.
        if (view.toasted) {
          sprite.tint = mix(sprite.tint === 0xffffff ? 0xffffff : (sprite.tint as number), 0xc08a5a, 0.55);
          j.puff -= dt;
          if (j.puff <= 0) {
            j.puff = 0.9 + Math.random() * 0.8;
            this.particles.steam(view.x * PPM, view.y * PPM - 10, 1);
          }
        }
        if (view.brew) sprite.setLiquid(view.brew.color);
        // The lattice leans and rattles a little when the hand rests near or hovers it (section 2).
        const lean =
          view.defId === 'item_lattice_panel' && !view.held
            ? this.hints.wobble('barrier_lattice') * (this.reduced ? 0.012 : 0.035)
            : 0;
        sprite.pose(
          view.angle + bob.angle + lean,
          Math.atan2(view.vy, view.vx),
          stretch,
          j.squash.sx * k,
          j.squash.sy * k,
        );
        sprite.setRim(rim > 0, rim);
        sprite.setStink(look.stink);
        sprite.setSoggy(view.soggy ?? 0);
        sprite.setBites(view.bites ?? 0);
        sprite.setPaint(view.paint);
        sprite.update(dt);
      }
    }
    for (const id of [...this.sprites.keys()]) if (!seen.has(id)) this.drop(id);
    this.drawSlime(behind, left, right);
    this.drawWelds(over);
    this.drawMagnets(over, views, left, right);
    this.updateWish(hoverId ?? null, dt);
    this.bubbles.update(dt, (id) => {
      const v = this.sim.view(id);
      if (!v || !v.bug || v.pocket !== undefined) return null;
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
    this.drawTargets(g);
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

  /**
   * While the player holds a thing (M8): the cauldron's mouth glows softly
   * nearby, and brightly when it would go in (the bench's trays light up in
   * `BenchLive`). A potion lights up mouths; a paint drop the bug it would paint.
   */
  private drawTargets(g: Graphics): void {
    const held = this.sim.physics.grabbed;
    const e = held === null ? undefined : this.sim.entities.get(held);
    if (!e || e.kind !== 'item') return;
    const v = this.sim.view(e.id);
    if (!v) return;
    const target = this.sim.dropTargetFor(e.id);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 4);
    const ring = (x: number, y: number, r: number, color: number, hot: boolean): void => {
      g.circle(x, y, r * 1.5).fill({ color, alpha: hot ? 0.16 : 0.06 });
      g.circle(x, y, r + pulse * (hot ? 6 : 2)).stroke({
        width: hot ? 4 : 2.5,
        color,
        alpha: hot ? 0.95 : 0.45,
      });
      if (hot)
        g.circle(x, y, r + 10 + pulse * 6).stroke({
          width: 2.5,
          color: 0xffffff,
          alpha: 0.5 * (1 - pulse) + 0.2,
        });
    };
    // The cauldron, when the held thing is close. The bench's trays light up themselves (BenchLive).
    for (const c of this.sim.cauldron.candidates()) {
      if (Math.hypot(c.x - v.x, c.y - v.y) > 3.5) continue;
      const hot = target?.kind === c.kind && target.entityId === c.entityId;
      ring(c.x * PPM, c.y * PPM, 70, 0x9be86b, hot);
    }
    if (!target) return;
    if (target.kind === 'mouth' && this.sim.isPotion(e)) {
      const m = this.mouthPx(target.entityId);
      if (m) ring(m.x, m.y, 20, 0x5ee06a, true);
    }
    if (target.kind === 'body') {
      const b = this.sim.view(target.entityId);
      const paint = this.sim.content.items.get(e.defId).paint;
      if (b && paint) ring(b.x * PPM, b.y * PPM, this.sizeOf(b.id) + 10, PAINT_HEX[paint] ?? 0xffffff, true);
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
    j.talk = Math.max(0, j.talk - dt);
    j.glance = Math.max(0, j.glance - dt);
    if (j.move) {
      j.move.t += dt;
      if (j.move.t >= j.move.seconds) j.move = null;
    }
    // Potions: size, tint, extras, and the pace it moves at (slow-mo runs its clock slow).
    const potion = potionLook(view.effects, view.scale ?? 1, this.time);
    j.clock += dt * potion.pace;
    j.size = easeScale(j.size, potion.scale, dt);
    const pose = bugPose({
      // Sniffing something is standing still; `st_use` on its own is a spring hop.
      mode: bug.mode === 'st_use' && bug.action !== 'bounce' ? 'st_idle' : bug.mode,
      vx: view.vx / j.size.value,
      vy: view.vy,
      time: j.clock,
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
      groggy: bug.groggy,
      gliding: bug.gliding,
      talking: j.talk > 0,
      sniffing: bug.mode === 'st_use' && bug.action === 'inspect',
      pending: bug.pending,
      morph: bug.form,
    });
    if (j.hot > 0 && face.form === 'normal') face.tint = 'red';
    // Disliked food offered: shake the head no.
    let move = look ? movePose(look.move, age, look.seconds) : undefined;
    if (!look && offered === 'disliked') move = movePose('shake_head', this.time % 1, 2);
    if (!look && bug.tickle > 0) move = movePose('wiggle', this.time % 1, 2);
    if (!look && !move && j.move) move = movePose(j.move.move, j.move.t, j.move.seconds);

    const speed = Math.hypot(view.vx, view.vy);
    // On the spring or riding the slide; other machine use is standing still.
    const flying =
      bug.mode === 'st_airborne' ||
      (bug.mode === 'st_use' && (bug.action === 'bounce' || bug.action === 'slide'));
    const held = bug.mode === 'st_held';

    // Where to look: the cursor when it is close, food on offer, a friend, or ahead.
    let target: Look = { x: bug.facing * 0.5, y: 0.1 };
    if (bug.mode === 'st_eat') target = { x: bug.facing * 0.7, y: 0.6 };
    if (j.glance > 0) target = { x: Math.sin(j.glance * 5) * 0.9, y: -0.2 };
    const buddy = bug.social ? this.sim.view(bug.social.partner) : null;
    if (buddy) target = { x: buddy.x > view.x ? 0.7 : -0.7, y: (buddy.y - view.y) * 0.3 };
    if (bug.mode === 'st_use' && bug.targetId !== null) {
      const thing = this.sim.view(bug.targetId);
      if (thing) target = { x: thing.x > view.x ? 0.8 : -0.8, y: 0.5 };
    }
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
    // Striking a pose or chopping (Prim's karate): eases in, holds, and eases out with the reaction.
    let karate: BugFrame['karate'];
    if (look && bug.reaction && (look.move === 'pose' || bug.reaction.type === 'chop')) {
      const k = Math.min(1, age / 0.18, (look.seconds - age) / (look.seconds * 0.25));
      if (k > 0) karate = { k, t: age, chop: bug.reaction.type === 'chop' };
    }
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
      carrying: bug.carrying !== null,
      hopping: bug.mode === 'st_airborne' && bug.selfLaunched,
      mode: bug.mode,
      pending: bug.pending,
      peeking: bug.peeking,
      morph: bug.form,
      overhead: bug.overhead,
      rolling: bug.rolling,
      paint: view.paint ?? bug.paint,
      karate,
    });
    this.potionBug(sprite, view, j, potion, dt);
    // Snoring: a "Z" drifts up every second and a half.
    if (bug.mode === 'st_sleep') {
      j.snore -= dt;
      if (j.snore <= 0) {
        j.snore = 1.4 + Math.random() * 0.5;
        const headX = view.x * PPM + bug.facing * r * PPM * 0.7;
        this.particles.zzz(headX, view.y * PPM - r * PPM * 1.1, bug.facing);
        this.onSound?.('snore', 1);
      }
    }
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

  /** Bugs' wishes for something craftable (M8): what, and until when the hover hint may show. */
  readonly wishes = new Map<EntityId, { recipe: string; until: number }>();
  /** The hint shown while hovering a wishing bug: its ingredients as faint outlines. */
  private readonly wishHint = new Container();
  private wishFor: EntityId | null = null;
  private wishHintT = 0;

  /** M8: potions, crafting, and toys as particles, bubbles, squash, and shake. */
  listenPotions(): Array<() => void> {
    return _listenPotions(this);
  }

  /**
   * Hovering a bug that is wishing for something: its ingredients show as
   * faint outlines by its bubble for 2 s (section 8, "Bug wishes").
   */
  private updateWish(hoverId: EntityId | null, dt: number): void {
    const wish = hoverId === null ? undefined : this.wishes.get(hoverId);
    if (wish && wish.until > this.time && this.wishFor !== hoverId) {
      this.wishFor = hoverId;
      this.wishHintT = 2;
      this.wishHint.removeChildren().forEach((c) => c.destroy());
      const recipe = this.sim.content.recipes.tryGet(wish.recipe);
      recipe?.inputs.forEach((input) => {
        const id =
          typeof input === 'string' ? input : 'anyOf' in input ? input.anyOf[0]! : 'item_moon_pebble';
        if (!this.sim.content.items.has(id)) return;
        const s = new ItemSprite(this.sim.content.items.get(id), 5);
        s.alpha = 0.45;
        s.scale.set(0.6);
        this.wishHint.addChild(s);
      });
    }
    if (this.wishFor === null) return;
    this.wishHintT -= dt;
    const v = this.sim.view(this.wishFor);
    if (this.wishHintT <= 0 || !v) {
      this.wishFor = hoverId !== null && this.wishes.has(hoverId) ? this.wishFor : null;
      this.wishHint.removeChildren().forEach((c) => c.destroy());
      if (this.wishHintT <= 0) this.wishFor = null;
      return;
    }
    const r = this.sim.content.bugs.get(v.defId).radius * PPM;
    const n = this.wishHint.children.length;
    this.wishHint.children.forEach((c, i) => {
      c.position.set(v.x * PPM + (i - (n - 1) / 2) * 70, v.y * PPM - r * 2.1 - 150);
    });
  }

  /** A potion at work on a bug: its size, color, see-through-ness, extras, and trail. */
  private potionBug(sprite: BugSprite, view: EntityView, j: Juice, look: PotionLook, dt: number): void {
    const size = Math.max(0.2, j.size.value);
    const wob = look.wobble > 0 ? Math.sin(this.time * 16) * 0.07 * look.wobble : 0;
    // Heavy squashes flat (feet kept on the ground); bouncy boings on the spot.
    const boing = look.boing > 0 ? Math.max(0, Math.sin(this.time * 9)) * 0.1 * look.boing : 0;
    const flat = look.squash - boing;
    sprite.scale.set(
      size * (1 + 0.35 * look.round + wob) * (1 + flat),
      size * (1 + 0.5 * look.round - wob) * (1 - flat) * (look.flipY ? -1 : 1),
    );
    const radius = this.sim.content.bugs.get(view.defId).radius * PPM * size;
    if (flat !== 0) sprite.position.y += radius * flat * (look.flipY ? -1 : 1);
    sprite.alpha = look.alpha;
    if (look.tint !== null)
      sprite.tint = sprite.tint === 0xffffff ? look.tint : mix(sprite.tint as number, look.tint, 0.5);
    if (look.extras.size === 0 && !look.trail && !look.glow && look.notes === null) return;
    const r = radius;
    const d = {
      x: view.x * PPM,
      y: view.y * PPM,
      r,
      facing: view.bug!.facing,
      time: this.time,
      body: sprite.def.body,
      speed: Math.hypot(view.vx, view.vy),
      seed: view.id,
    };
    drawPotionBehind(this.behind, look, d);
    drawPotionOver(this.over, look, d);
    j.trailIn -= dt;
    if (!look.trail || j.trailIn > 0) return;
    const moving = d.speed > 0.6;
    switch (look.trail) {
      case 'rainbow':
        if (!moving) return;
        j.trailIn = 0.05;
        this.trails.trail(
          d.x,
          d.y + r * 0.6,
          RAINBOW[Math.floor(this.time * 20) % RAINBOW.length]!,
          r * 0.35,
        );
        return;
      case 'smoke':
        if (!moving) return;
        j.trailIn = 0.06;
        this.particles.puff(d.x, d.y + r * 0.8, 0xd8d8e0, 2, 0, 40, 14);
        return;
      case 'speed':
        if (!moving) return;
        j.trailIn = 0.05;
        this.trails.trail(d.x - Math.sign(view.vx) * r, d.y, 0xffffff, r * 0.25);
        return;
      case 'sparkle':
        j.trailIn = 0.35;
        this.particles.sparkles(d.x, d.y + r * (look.flipY ? -1 : 1), 2);
        return;
    }
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
    const mode = view.bug!.mode;
    if (mode === 'st_sleep' || mode === 'st_social' || mode === 'st_ride') return;
    const thought = thoughtFor(def, view.bug!.needs, this.sim.content.items, this.bestFriend(view.defId));
    j.thinkIn = THOUGHT_EVERY;
    if (j.hovered >= HOVER_THOUGHT) j.hovered = -60; // once per hover
    if (!thought) {
      // Bugs hint too: idle near a secret still waiting, now and then it thinks of its pictogram.
      if ((mode !== 'st_idle' && mode !== 'st_wander') || Math.random() >= HINT_CHANCE) return;
      const sim = this.sim;
      const hint = hintThought(
        sim.content,
        view.x,
        sim.secrets,
        (a) => sim.content.areas.has(a) && sim.barriers.isOpen(a),
        (id) => this.fixtureSpot(id),
      );
      if (!hint) return;
      const food = hint.food ? sim.content.items.get(hint.food) : null;
      this.bubbles.show(view.id, 'thought', hint.pictos, 2.6, food, null);
      this.hintsShown.push(hint.secret);
      if (this.hintsShown.length > 20) this.hintsShown.shift();
      return;
    }
    const food = thought.food ? this.sim.content.items.get(thought.food) : null;
    const friend = thought.friend ? this.sim.content.bugs.get(thought.friend) : null;
    this.bubbles.show(view.id, 'thought', thought.pictos, 2.6, food, friend);
  }

  /** Secrets bugs have hinted at in thought bubbles, newest last (test hook). */
  readonly hintsShown: string[] = [];
  private fixtureSpots: Map<string, { x: number }> | null = null;

  /** A fixture's world x, by ID. */
  private fixtureSpot(id: string): { x: number } | null {
    if (!this.fixtureSpots) {
      this.fixtureSpots = new Map();
      for (const a of this.sim.content.areas.all)
        for (const f of a.fixtures ?? []) this.fixtureSpots.set(f.id, { x: a.xStart + f.x });
    }
    return this.fixtureSpots.get(id) ?? null;
  }

  /** The bug this one likes best, among bugs in the world. */
  private bestFriend(defId: string): string | null {
    let best: string | null = null;
    let score = -Infinity;
    for (const other of this.sim.entities.ofKind('bug')) {
      if (other.defId === defId) continue;
      const a = this.sim.affinityOf(defId, other.defId);
      if (a > score) {
        score = a;
        best = other.defId;
      }
    }
    return best;
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

  /**
   * A round collider on a steep root rests on its side, so its feet would
   * float. Drop the drawing onto the ground under its middle.
   */
  private footDrop(view: EntityView): number {
    const mode = view.bug?.mode;
    if (!mode || view.held || mode === 'st_airborne' || mode === 'st_swim' || mode === 'st_ride') return 0;
    const r = this.sim.content.bugs.get(view.defId).radius;
    const gap = this.sim.surfaceY(view.x) - (view.y + r);
    return gap > 0.005 && gap < r * 0.6 ? gap * PPM : 0;
  }

  /** Glorp's slime trail: a glossy green smear on the ground that fades out. */
  private drawSlime(g: Graphics, left: number, right: number): void {
    const tick = this.sim.tick;
    for (const strip of this.sim.environment.state.slime) {
      if (strip.x1 < left || strip.x0 > right) continue;
      const k = Math.min(1, (strip.until - tick) / (8 * 60));
      if (k <= 0) continue;
      const x0 = strip.x0 * PPM;
      const x1 = strip.x1 * PPM;
      const ground = (x: number): number => this.sim.surfaceY(x / PPM) * PPM - 3;
      const steps = Math.max(2, Math.round((x1 - x0) / 20));
      g.moveTo(x0, ground(x0));
      for (let i = 1; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps;
        g.lineTo(x, ground(x));
      }
      g.stroke({ width: 11, color: 0xb8e986, alpha: 0.55 * k, cap: 'round', join: 'round' });
      for (let x = x0 + 12; x < x1 - 6; x += 46)
        g.ellipse(x, ground(x) - 3, 7, 2.5).fill({ color: 0xffffff, alpha: 0.6 * k });
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
    const bugDef = view.kind === 'bug' ? this.sim.content.bugs.get(view.defId) : null;
    const width = bugDef && !bugDef.collider ? bugDef.radius * PPM * 1.3 : size * 1.6 + 8;
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
    let sprite: BugSprite | ItemSprite;
    if (view.kind === 'bug') sprite = makeBugView(this.sim.content.bugs.get(view.defId));
    else {
      const def = this.sim.content.items.get(view.defId);
      const item = new ItemSprite(def, view.id);
      const art = itemArt(def);
      if (art) item.useArt(art);
      sprite = item;
    }
    // Keep draw order equal to ID order so hit testing (highest ID) matches.
    sprite.zIndex = view.id;
    this.entityLayer.addChild(sprite);
    this.sprites.set(view.id, sprite);
    return sprite;
  }

  drop(id: EntityId): void {
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

  /** Bugs waiting to be found, and how strong their sign of life is this frame (test hook). */
  pendingLife(): { id: number; defId: string; pending: string; life: number }[] {
    const out: { id: number; defId: string; pending: string; life: number }[] = [];
    for (const [id, sprite] of this.sprites) {
      if (!(sprite instanceof BugSprite) || !sprite.visible) continue;
      const v = this.sim.view(id);
      if (v?.bug?.pending) out.push({ id, defId: v.defId, pending: v.bug.pending, life: sprite.life });
    }
    return out;
  }

  /** The ambient critters drawn this frame, in every area on screen (test hook). */
  /** M10 (test hook): pictures on Gnome Hollow's lost-toy shelf, and fireworks in the air. */
  get hiddenLook(): { pictures: number; fireworks: number } {
    let pictures = 0;
    let fireworks = 0;
    for (const l of this.lives) {
      if (l instanceof HollowLive) pictures = l.pictureCount;
      if (l instanceof FinaleLive) fireworks = l.live;
    }
    return { pictures, fireworks };
  }

  get critters(): CritterInfo[] {
    return this.lives.flatMap((l) => (l instanceof CritterLive ? l.drawn : []));
  }

  /** Floating soap bubbles alive now (test hook). */
  get soapBubbleCount(): number {
    return this.soapBubbles.count;
  }
}

/** The live views for whatever areas and barriers the world has. */
function makeLives(sim: Sim, surface: (xPx: number) => number | null): AreaLive[] {
  const out: AreaLive[] = [];
  const area = (id: string): AreaDef | undefined => sim.content.areas.tryGet(id);
  const flowerbed = area('area_flowerbed_stage');
  const porch = area('area_under_porch');
  const compost = area('area_compost_lab');
  const arcade = area('area_treehouse_arcade');
  if (flowerbed) out.push(new FlowerbedLive(flowerbed));
  if (porch) out.push(new PorchLive(porch));
  if (compost) out.push(new CompostLive(compost));
  if (arcade) out.push(new ArcadeLive(arcade));
  const fixture = (kind: FixtureDef['kind']): FixtureDef | undefined =>
    sim.content.areas.all.flatMap((a) => a.fixtures ?? []).find((f) => f.kind === kind);
  const bench = fixture('tinker_bench');
  const lever = fixture('bench_lever');
  if (porch && bench && lever) out.push(new BenchLive(porch, bench, lever));
  const cauldron = fixture('cauldron');
  if (compost && cauldron) out.push(new CauldronLive(compost, cauldron, fixture('bug_scope') ?? null));
  const sunflower = sim.barriers.barrier('sunflower');
  if (sunflower) out.push(new SunflowerLive(sunflower));
  const tunnel = sim.barriers.barrier('can_tunnel');
  if (tunnel && porch) out.push(new CanWallLive(tunnel, porch));
  // M10: the ant hill and the gnome's hat (the doorways), the depths, the hollow, and the finale.
  const plaza = area('area_stump_plaza');
  const depths = area('area_ant_hill_depths');
  const hollow = area('area_gnome_hollow');
  if (plaza) out.push(new AntHillLive(plaza, sim.content.items.tryGet('item_sugar_cube') ?? null));
  if (flowerbed) out.push(new GnomeLive(flowerbed));
  if (depths) {
    const pile = depths.solids?.find((s) => s.id === 'solid_pantry_pile')?.chain ?? [];
    out.push(new DepthsLive(depths, pile));
  }
  if (hollow) out.push(new HollowLive(hollow, (id) => sim.content.items.tryGet(id)));
  if (plaza) out.push(new FinaleLive(plaza, (id) => sim.content.bugs.tryGet(id)));
  // Ambient critters in every area but the porch (which keeps its own in `PorchLive`) and the hidden ones.
  for (const a of sim.content.areas.all)
    if (a.id !== 'area_under_porch' && !a.hidden) out.push(new CritterLive(a, sim, surface));
  out.push(...clueLives(sim, surface));
  out.push(new LockView(sim.content.areas.all));
  return out;
}
