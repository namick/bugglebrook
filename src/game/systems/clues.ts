import type { Sim } from '../sim';
import type { Entity, EntityId } from '../core/entities';
import type { GameEvents } from '../events';
import type { AreaDef, FixtureDef } from '../data/types';
import type { Impact } from '../physics/physics';
import { SIM_HZ } from '../core/loop';
import { HOUR, DAY } from './sky';

/**
 * M10's clues and secrets in the open areas (game design doc, section 12):
 * the sunken boot's key and the stump's little door, the frog king, five
 * skips, the big ribbit, the regatta, the ring mushrooms' chord, the rain
 * dance, the rainbow's end, the porch's shadow puppet and moth spiral, the
 * marble tune, the claw champ, the slide's souvenir, the window telescope,
 * the cloud jar, the treasure map and the golden marble, the orbit, and
 * Twig's bridge.
 *
 * Saved as `world.clues`. It listens to events only to write them down;
 * `update` acts on them once a step, so no handler changes the world.
 */

export interface ClueState {
  /** Recent clicks on the sunken boot (ticks), and whether it has tipped out its key. */
  boot: number[];
  bootTipped: boolean;
  /** The stump's little door is open. */
  nook: boolean;
  /** Recent pokes at the frog eyes (ticks). */
  frog: number[];
  /** When each ring mushroom last rang (ticks), and what rang it. */
  mushrooms: number[];
  ringers: number[];
  chordAt: number;
  /** Things the player let go of lately (id: tick): only those bounce on the mushrooms. */
  thrown: Record<string, number>;
  /** Ticks four bugs have danced on the stage without rain. */
  dance: number;
  /** Prizes the claw has won in a row. */
  clawStreak: number;
  /** Rides down the leaf slide, and the things now on their way down (id: tick they started). */
  slides: number;
  riding: Record<string, number>;
  /** Marble hits on the leaf xylophone in a row, and the last one's tick. */
  tune: number;
  tuneAt: number;
  /** Recent clicks on the treehouse window (ticks). */
  window: number[];
  /** The bug flung into orbit, waiting to land, or -1. */
  orbit: number;
  /** Bugs that walked across Twig while he bridged a gap. */
  crossed: number[];
  /** When the shadow puppet last showed, and ticks the flashlight has shone on the wall. */
  shadowAt: number;
  shine: number;
  /** When the moths last swirled round the lamp. */
  mothsAt: number;
  /** When the cloud jar last made rain. */
  cloudAt: number;
}

export function newClueState(): ClueState {
  return {
    boot: [],
    bootTipped: false,
    nook: false,
    frog: [],
    mushrooms: [-9999, -9999, -9999],
    ringers: [-1, -1, -1],
    chordAt: -9999,
    thrown: {},
    dance: 0,
    clawStreak: 0,
    slides: 0,
    riding: {},
    tune: 0,
    tuneAt: -9999,
    window: [],
    orbit: -1,
    crossed: [],
    shadowAt: -9999,
    shine: 0,
    mothsAt: -9999,
    cloudAt: -9999,
  };
}

// --- Tuning ---------------------------------------------------------------

/** Three clicks on the boot within this long tip it over. */
export const BOOT_CLICKS = 3;
export const BOOT_WINDOW = 3 * SIM_HZ;
/** The key opens the stump's door when it rests this close to the knothole (m). */
export const KEYHOLE_REACH = 0.9;
/** Coins the frog king wants. */
export const COINS = 3;
/** Pokes at the frog eyes within this long make the big ribbit. */
export const FROG_POKES = 5;
export const FROG_WINDOW = 4 * SIM_HZ;
/** Skips in one throw that log a secret. */
export const SKIPS = 5;
/** Bugs on one raft for the regatta, and how near the far bank counts (m). */
export const REGATTA_BUGS = 3;
export const FAR_BANK = 2.4;
/** The three ring mushrooms ring as a chord within about one beat. */
export const CHORD_WINDOW = 45;
/** A thing falling at least this fast (m/s) onto a cap bounces. */
export const BOUNCE_SPEED = 2.5;
/** A cap gives back this share of the fall, so bounces die away. */
export const BOUNCE_KEEP = 0.75;
/** A throw counts for the mushrooms this long after it leaves the hand (and after each bounce). */
export const THROWN_TICKS = 4 * SIM_HZ;
/** Dancers on stage, and how long they dance (16 beats at the plaza's 96 BPM). */
export const DANCERS = 4;
export const DANCE_TICKS = 10 * SIM_HZ;
/** The flashlight shines on the porch's back wall this long for the shadow puppet. */
export const SHINE_TICKS = 2 * SIM_HZ;
/** Glowing things within this distance of the porch lamp (m) bring the moths. */
export const LAMP_REACH = 2;
export const LAMP_GLOWS = 3;
/** Marble hits in a row on the xylophone, each within this long of the last. */
export const TUNE_HITS = 8;
export const TUNE_GAP = 4 * SIM_HZ;
/** Claw prizes in a row. */
export const CLAW_STREAK = 3;
/** Slide rides for the souvenir, and how long a ride may take. */
export const SLIDE_RIDES = 10;
export const RIDE_TICKS = 5 * SIM_HZ;
/** Clicks on the treehouse window. */
export const WINDOW_CLICKS = 3;
export const WINDOW_WINDOW = 3 * SIM_HZ;
/** A jar above this height (world y, m) in the rain has reached the cloud line. */
export const CLOUD_LINE = 0.6;
/** The cloud jar's rain lasts this long. */
export const CLOUD_RAIN = 60 * SIM_HZ;
/** Map scraps touch when their centers are this close (m). */
export const SCRAPS_TOUCH = 0.75;
/** A bug flung up at night faster than this (m/s) goes into orbit (2400 px/s). */
export const ORBIT_SPEED = 24;
/** Twig's bridge: bugs that walk across him. */
export const BRIDGE_BUGS = 3;

const SCRAPS = ['item_map_scrap_1', 'item_map_scrap_2', 'item_map_scrap_3', 'item_map_scrap_4'];

type Noted =
  | { k: 'boot'; x: number; y: number }
  | { k: 'skip'; x: number; y: number; count: number }
  | { k: 'claw'; phase: string; x: number; y: number }
  | { k: 'poked'; id: EntityId; defId: string }
  | { k: 'flung'; id: EntityId; vx: number; vy: number }
  | { k: 'landed'; id: EntityId; x: number; y: number }
  | { k: 'key'; id: EntityId }
  | { k: 'thrown'; id: EntityId };

interface Spot {
  area: AreaDef;
  fixture: FixtureDef;
  x: number;
  y: number;
}

export class Clues {
  state: ClueState = newClueState();
  private noted: Noted[] = [];

  constructor(private readonly sim: Sim) {
    const on = <K extends keyof GameEvents>(name: K, fn: (e: GameEvents[K]) => void): void => {
      sim.events.on(name, fn);
    };
    on('boot_bubbled', (e) => this.noted.push({ k: 'boot', x: e.x, y: e.y }));
    on('skipped', (e) => this.noted.push({ k: 'skip', x: e.x, y: e.y, count: e.count }));
    on('claw_moved', (e) => this.noted.push({ k: 'claw', phase: e.phase, x: e.x, y: e.y }));
    on('item_poked', (e) => this.noted.push({ k: 'poked', id: e.id, defId: e.defId }));
    on('item_dropped', (e) => {
      if (e.kind === 'bug') this.noted.push({ k: 'flung', id: e.id, vx: e.vx, vy: e.vy });
      if (e.defId === 'item_key_tiny') this.noted.push({ k: 'key', id: e.id });
      this.noted.push({ k: 'thrown', id: e.id });
    });
    on('bug_landed', (e) => this.noted.push({ k: 'landed', id: e.id, x: e.x, y: e.y }));
  }

  restore(state: ClueState): void {
    this.state = { ...newClueState(), ...state };
  }

  serialize(): ClueState {
    return JSON.parse(JSON.stringify(this.state)) as ClueState;
  }

  /** Fixtures of a kind, with world x. */
  spots(kind: FixtureDef['kind']): Spot[] {
    const out: Spot[] = [];
    for (const area of this.sim.content.areas.all)
      for (const fixture of area.fixtures ?? [])
        if (fixture.kind === kind) out.push({ area, fixture, x: area.xStart + fixture.x, y: fixture.y });
    return out;
  }

  private awake(area: AreaDef): boolean {
    return this.sim.barriers.isOpen(area.id) && !this.sim.isAreaAsleep(area.id);
  }

  /** Something loose, still, in the world (not held, not pocketed, not asleep). */
  private resting(e: Entity, maxSpeed = 0.5): boolean {
    const sim = this.sim;
    if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id || !sim.physics.has(e.id)) return false;
    const s = sim.physics.getState(e.id);
    return Math.hypot(s.vx, s.vy) <= maxSpeed;
  }

  private items(defId: string): Entity[] {
    return this.sim.entities.ofKind('item').filter((e) => e.defId === defId);
  }

  /** The clock's hour (0 to 24). */
  private hour(): number {
    return (this.sim.weather.clock % DAY) / HOUR;
  }

  // --- Clicks ---------------------------------------------------------------

  /** A click on one of M10's clickable fixtures. True if it was one. */
  poke(f: { id: string; kind: FixtureDef['kind']; x: number; y: number }): boolean {
    const sim = this.sim;
    const s = this.state;
    switch (f.kind) {
      case 'frog_eyes': {
        s.frog = [...s.frog.filter((t) => sim.tick - t < FROG_WINDOW), sim.tick];
        sim.events.emit('frog_blinked', { x: f.x, y: f.y, count: s.frog.length });
        if (s.frog.length >= FROG_POKES) {
          s.frog = [];
          this.ribbit(f.x, f.y);
        }
        return true;
      }
      case 'window': {
        s.window = [...s.window.filter((t) => sim.tick - t < WINDOW_WINDOW), sim.tick];
        sim.events.emit('window_tapped', { x: f.x, y: f.y, count: s.window.length });
        if (s.window.length >= WINDOW_CLICKS) {
          s.window = [];
          this.telescope(f.x, f.y);
        }
        return true;
      }
      case 'clover':
        this.dig(f.x, f.y);
        return true;
      default:
        return false;
    }
  }

  /** The big ribbit: the pond ripples and every bug nearby jumps. */
  private ribbit(x: number, y: number): void {
    const sim = this.sim;
    sim.events.emit('frog_ribbited', { x, y });
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id)) continue;
      const b = sim.physics.getState(bug.id);
      if (Math.abs(b.x - x) > 20 || !sim.physics.isSupported(bug.id)) continue;
      sim.physics.setVelocity(bug.id, b.vx, -5.5);
      sim.reactBug(bug, 'huh');
    }
    sim.findSecret('secret_frog_blink', x, y);
  }

  /**
   * The window telescope (`secret_window_telescope`): it zooms in on a spot
   * where a T2 secret the player has not found waits, a different one each
   * game day, and the journal marks that secret hinted.
   */
  private telescope(x: number, y: number): void {
    const sim = this.sim;
    const open = (a: string): boolean => sim.content.areas.has(a) && sim.barriers.isOpen(a);
    const ready = sim.content.secrets.all.filter(
      (d) =>
        d.tier === 2 &&
        !d.blocked &&
        !sim.secrets.includes(d.id) &&
        (d.requires ?? []).every((r) => sim.secrets.includes(r)) &&
        d.trigger.type === 'scripted' &&
        open(d.trigger.area),
    );
    const day = Math.floor(sim.weather.clock / DAY);
    const pick = ready.length > 0 ? ready[day % ready.length]! : null;
    if (pick) sim.journal.hint(`secret:${pick.id}`);
    sim.events.emit('telescope_peeked', {
      secret: pick?.id ?? null,
      area: pick && pick.trigger.type === 'scripted' ? pick.trigger.area : null,
      hint: pick ? [...pick.hint] : [],
      x,
      y,
    });
    sim.findSecret('secret_window_telescope', x, y);
  }

  /**
   * The clover patch at midnight, with the treasure map read and the
   * sundial's moonlit shadow seen: bugs gather and dig up the golden marble.
   */
  private dig(x: number, y: number): void {
    const sim = this.sim;
    const h = this.hour();
    const midnight = h >= 23.5 || h < 1;
    const ready = midnight && sim.canFind('secret_golden_marble');
    sim.events.emit('clover_dug', { x, y, found: ready });
    if (!ready) return;
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id)) continue;
      const b = sim.physics.getState(bug.id);
      if (Math.abs(b.x - x) < 8) sim.reactBug(bug, 'wow');
    }
    const marble = sim.spawn('item', 'item_marble_gold', x, sim.surfaceY(x) - 0.4);
    sim.physics.setVelocity(marble.id, 0.6, -6);
    sim.findSecret('secret_golden_marble', x, y);
  }

  // --- Every step -----------------------------------------------------------

  update(): void {
    const sim = this.sim;
    const noted = this.noted;
    if (noted.length > 0) {
      this.noted = [];
      for (const n of noted) this.handle(n);
    }
    this.orbiting();
    if (sim.tick % 15 !== 0) return;
    this.teacup();
    this.regatta();
    this.rainDance();
    this.rainbowEnd();
    this.flashlight();
    this.lampMoths();
    this.slideRides();
    this.cloudLine();
    this.scraps();
    this.bridge();
  }

  private handle(n: Noted): void {
    const sim = this.sim;
    const s = this.state;
    switch (n.k) {
      case 'boot': {
        if (s.bootTipped) return;
        s.boot = [...s.boot.filter((t) => sim.tick - t < BOOT_WINDOW), sim.tick];
        if (s.boot.length < BOOT_CLICKS) return;
        s.boot = [];
        s.bootTipped = true;
        // The boot tips and a tiny key on a cork keychain floats up.
        const key = sim.spawn('item', 'item_key_tiny', n.x + 0.2, n.y - 0.7);
        sim.physics.setVelocity(key.id, 0.3, -2.5);
        sim.events.emit('boot_tipped', { id: key.id, x: n.x, y: n.y });
        sim.findSecret('secret_boot_key', n.x, n.y);
        return;
      }
      case 'skip':
        if (n.count >= SKIPS) sim.findSecret('secret_skip_stone', n.x, n.y);
        return;
      case 'claw':
        if (n.phase === 'miss') s.clawStreak = 0;
        if (n.phase !== 'prize') return;
        s.clawStreak++;
        if (s.clawStreak < CLAW_STREAK) return;
        s.clawStreak = 0;
        // The claw does a victory spin and drops a candle hat down the chute.
        if (sim.canFind('secret_claw_triple')) {
          const hat = sim.spawn('item', 'item_hat_candle', n.x, n.y - 0.6);
          sim.physics.setVelocity(hat.id, 0, -2);
          sim.events.emit('claw_spun', { id: hat.id, x: n.x, y: n.y });
          sim.findSecret('secret_claw_triple', n.x, n.y);
        }
        return;
      case 'poked': {
        if (n.defId !== 'item_cloud_jar') return;
        const e = sim.entities.get(n.id);
        if (!e || sim.tick - s.cloudAt < 10 * SIM_HZ) return;
        const p = sim.physics.getState(e.id);
        s.cloudAt = sim.tick;
        sim.events.emit('cloud_jar_opened', { id: e.id, x: p.x, y: p.y });
        if (!sim.weather.raining) sim.weather.startRain(CLOUD_RAIN);
        sim.journal.notice('cloud_jar_used');
        return;
      }
      case 'flung': {
        if (!sim.weather.dark || s.orbit >= 0) return;
        if (-n.vy < ORBIT_SPEED || Math.abs(n.vx) > -n.vy * 0.5) return;
        s.orbit = n.id;
        return;
      }
      case 'thrown':
        s.thrown[String(n.id)] = sim.tick;
        return;
      case 'key': {
        // Let go right at the knothole: the key goes in the lock.
        const key = sim.entities.get(n.id);
        if (key) this.keyhole(key);
        return;
      }
      case 'landed': {
        if (n.id !== s.orbit) return;
        s.orbit = -1;
        if (!sim.secrets.includes('secret_fling_orbit')) return;
        const bug = sim.entities.get(n.id);
        if (!bug) return;
        // Back from the moon, holding a moon crumb and glowing a while.
        const crumb = sim.spawn('item', 'item_moon_pebble', n.x + 0.4, n.y - 0.6);
        sim.physics.setVelocity(crumb.id, 1, -2);
        sim.addTag(bug.id, 'tag_glowing', 'potion', 20);
        sim.events.emit('orbit_returned', { id: n.id, crumb: crumb.id, x: n.x, y: n.y });
        return;
      }
    }
  }

  /** A bug flung into orbit at night: once it is high off the top of the screen, it is in space. */
  private orbiting(): void {
    const sim = this.sim;
    const id = this.state.orbit;
    if (id < 0) return;
    const e = sim.entities.get(id);
    if (!e || !sim.physics.has(id) || sim.physics.grabbed === id) {
      this.state.orbit = -1;
      return;
    }
    const s = sim.physics.getState(id);
    if (s.y < -3 && !sim.secrets.includes('secret_fling_orbit')) {
      sim.events.emit('orbit_launched', { id, x: s.x, y: s.y });
      sim.findSecret('secret_fling_orbit', s.x, s.y);
    } else if (s.vy > 0 && s.y > -3 && !sim.secrets.includes('secret_fling_orbit')) this.state.orbit = -1;
  }

  /**
   * The tiny key let go at the stump's knothole opens a little door: a nook
   * with a map scrap and a coin. The knothole is drawn on the stump's face,
   * inside the ground, so a key let go with the hand over it, or anywhere up
   * the stump straight above it, counts.
   */
  private keyhole(key: Entity): void {
    const sim = this.sim;
    if (this.state.nook) return;
    const hole = this.spots('knothole')[0];
    if (!hole || !this.awake(hole.area)) return;
    {
      if (sim.isSleeping(key.id)) return;
      const k = sim.physics.getState(key.id);
      const hand = sim.hand;
      const atHand = !!hand && Math.hypot(hand.x - hole.x, hand.y - hole.y) <= KEYHOLE_REACH;
      const above = Math.abs(k.x - hole.x) <= KEYHOLE_REACH && k.y < hole.y + 0.3;
      if (!atHand && !above) return;
      if (!sim.canFind('secret_knothole_door')) return;
      this.state.nook = true;
      sim.remove(key.id);
      // They pop out over the stump's rim (the knothole itself is drawn on its face).
      const top = sim.surfaceY(hole.x) - 0.35;
      const scrap = sim.spawn('item', 'item_map_scrap_1', hole.x - 0.3, top);
      const coin = sim.spawn('item', 'item_old_coin', hole.x + 0.3, top);
      sim.physics.setVelocity(scrap.id, -1.5, -3);
      sim.physics.setVelocity(coin.id, 1.5, -3.5);
      sim.events.emit('nook_opened', { x: hole.x, y: hole.y });
      sim.findSecret('secret_knothole_door', hole.x, hole.y);
      return;
    }
  }

  /** Things resting in the sunken teacup. */
  private inTeacup(defId: string): Entity[] {
    const sim = this.sim;
    const cup = this.spots('teacup')[0];
    if (!cup || !this.awake(cup.area)) return [];
    const bottom = sim.surfaceY(cup.x);
    return this.items(defId).filter((e) => {
      if (!this.resting(e)) return false;
      const s = sim.physics.getState(e.id);
      return Math.abs(s.x - cup.x) <= cup.fixture.radius && s.y >= bottom - 0.8 && s.y <= bottom + 0.1;
    });
  }

  /** Three old coins in the teacup: the frog king surfaces, ribbits, and spits out a bubble hat. */
  private teacup(): void {
    const sim = this.sim;
    const coins = this.inTeacup('item_old_coin');
    if (coins.length < COINS || !sim.canFind('secret_teacup_coins')) return;
    const cup = this.spots('teacup')[0]!;
    for (const c of coins.slice(0, COINS)) sim.remove(c.id);
    const hat = sim.spawn(
      'item',
      'item_hat_bubble',
      cup.x,
      (sim.environment.waterAt(cup.x)?.level ?? cup.y) - 0.6,
    );
    sim.physics.setVelocity(hat.id, -2.5, -6);
    sim.events.emit('frog_king', { id: hat.id, x: cup.x, y: cup.y });
    sim.findSecret('secret_teacup_coins', cup.x, cup.y);
  }

  /** Three bugs on one raft reach the pond's far bank: Skeet blows a reed horn and they cheer. */
  private regatta(): void {
    const sim = this.sim;
    if (sim.secrets.includes('secret_raft_regatta')) return;
    const pond = sim.content.areas.all.find((a) => a.water);
    if (!pond?.water || !this.awake(pond)) return;
    const far = pond.xStart + pond.water.x1 - FAR_BANK;
    for (const raft of sim.entities.ofKind('item')) {
      const def = sim.content.items.get(raft.defId);
      if (def.hull === undefined || sim.isSleeping(raft.id)) continue;
      const r = sim.physics.getState(raft.id);
      if (r.x < far || !sim.environment.submerged.has(raft.id)) continue;
      const riders = this.ridersOn(raft);
      if (riders.length < REGATTA_BUGS) continue;
      for (const id of riders) {
        const bug = sim.entities.get(id);
        if (bug) sim.reactBug(bug, 'cheer');
      }
      sim.events.emit('regatta_won', { id: raft.id, riders, x: r.x, y: r.y });
      sim.findSecret('secret_raft_regatta', r.x, r.y);
      return;
    }
  }

  /** Bugs standing on something (touching its top). */
  private ridersOn(e: Entity): EntityId[] {
    const sim = this.sim;
    const out: EntityId[] = [];
    for (const c of sim.physics.contactsOf(e.id)) {
      const o = sim.entities.get(c.other);
      if (!o?.bug || o.bug.pending || out.includes(o.id)) continue;
      const a = sim.physics.getState(o.id);
      const b = sim.physics.getState(e.id);
      if (a.y < b.y) out.push(o.id);
    }
    return out;
  }

  /**
   * The ring mushrooms (checked every step): something falling onto a cap
   * bounces off it with a note, and all three ringing within about a beat
   * plays a chord (`secret_mushroom_chord`).
   */
  impacts(_impacts: readonly Impact[]): void {
    const sim = this.sim;
    const caps = this.spots('ring_mushroom');
    if (caps.length === 0 || !this.awake(caps[0]!.area)) return;
    const s = this.state;
    // Only what the player threw or dropped in the last few seconds (and what it bounced on to) rings them.
    for (const [id, t] of Object.entries(s.thrown)) if (sim.tick - t > THROWN_TICKS) delete s.thrown[id];
    const live = Object.keys(s.thrown);
    if (live.length === 0) return this.tuneImpacts(_impacts);
    caps.forEach((cap, i) => {
      const r = cap.fixture.radius;
      for (const key of live) {
        const e = sim.entities.get(Number(key));
        if (!e || sim.isSleeping(e.id) || sim.physics.grabbed === e.id || !sim.physics.has(e.id)) continue;
        const p = sim.physics.getState(e.id);
        if (p.vy < BOUNCE_SPEED || Math.abs(p.x - cap.x) > r + 0.15) continue;
        const half = sim.halfHeight(e);
        const bottom = p.y + half;
        if (bottom < cap.y - 0.25 || bottom > cap.y + 0.12) continue;
        sim.physics.setVelocity(e.id, p.vx + (p.x - cap.x) * 0.6, -p.vy * BOUNCE_KEEP);
        s.thrown[key] = sim.tick;
        if (sim.tick - (s.mushrooms[i] ?? -9999) < 6) continue;
        s.mushrooms[i] = sim.tick;
        s.ringers[i] = e.id;
        sim.events.emit('mushroom_bounced', {
          fixture: cap.fixture.id,
          index: i,
          id: e.id,
          x: cap.x,
          y: cap.y,
        });
        // A chord is three things at once: one thing hopping along the caps is a tune, not a chord.
        const fresh = s.mushrooms.every((t) => sim.tick - t <= CHORD_WINDOW);
        if (fresh && new Set(s.ringers).size === caps.length && sim.tick - s.chordAt > 2 * SIM_HZ) {
          s.chordAt = sim.tick;
          s.mushrooms = s.mushrooms.map(() => -9999);
          const mid = caps[1] ?? cap;
          sim.events.emit('mushroom_chord', { x: mid.x, y: mid.y });
          sim.findSecret('secret_mushroom_chord', mid.x, mid.y);
        }
      }
    });
    this.tuneImpacts(_impacts);
  }

  /** Marbles hitting the leaf xylophone: eight in a row play the tune back. */
  private tuneImpacts(impacts: readonly Impact[]): void {
    const sim = this.sim;
    const s = this.state;
    for (const im of impacts) {
      if (im.a === null || im.b === null || im.speed < 0.8) continue;
      const a = sim.entities.get(im.a);
      const b = sim.entities.get(im.b);
      if (!a || !b) continue;
      const pair =
        (a.defId.startsWith('item_marble') && b.defId === 'item_inst_leaf_xylophone') ||
        (b.defId.startsWith('item_marble') && a.defId === 'item_inst_leaf_xylophone');
      if (!pair) continue;
      if (sim.tick - s.tuneAt < 4) continue;
      s.tune = sim.tick - s.tuneAt <= TUNE_GAP ? s.tune + 1 : 1;
      s.tuneAt = sim.tick;
      if (s.tune < TUNE_HITS) continue;
      s.tune = 0;
      sim.events.emit('marble_tune', { x: im.px, y: im.py });
      sim.findSecret('secret_marble_tune', im.px, im.py);
    }
  }

  /** Four bugs dancing on the stage for sixteen beats while it is dry: it starts to rain. */
  private rainDance(): void {
    const sim = this.sim;
    const stage = sim.places.stage();
    if (!stage || sim.weather.raining) {
      this.state.dance = 0;
      return;
    }
    const dancers = sim.entities.ofKind('bug').filter((b) => {
      if (!b.bug || sim.isSleeping(b.id)) return false;
      if (b.bug.mode !== 'st_perform' || b.bug.action !== 'dance') return false;
      const x = sim.physics.getState(b.id).x;
      return x > stage.x0 && x < stage.x1;
    });
    this.state.dance = dancers.length >= DANCERS ? this.state.dance + 15 : 0;
    if (this.state.dance < DANCE_TICKS) return;
    this.state.dance = 0;
    const x = (stage.x0 + stage.x1) / 2;
    sim.weather.startRain(3 * 60 * SIM_HZ);
    sim.events.emit('rain_danced', { x, y: stage.y });
    sim.findSecret('secret_rain_dance', x, stage.y);
  }

  /** While a rainbow is up, a glass jar resting in a flowerbed paint puddle fills with rainbow paint. */
  private rainbowEnd(): void {
    const sim = this.sim;
    if (sim.weather.weather !== 'weather_rainbow') return;
    for (const puddle of this.spots('paint_puddle')) {
      if (!this.awake(puddle.area)) continue;
      for (const jar of this.items('item_jar_glass')) {
        if (!this.resting(jar)) continue;
        const j = sim.physics.getState(jar.id);
        if (Math.abs(j.x - puddle.x) > puddle.fixture.radius + 0.2 || Math.abs(j.y - puddle.y) > 1) continue;
        // The jar fills to the brim: it is a jar of rainbow paint now.
        sim.remove(jar.id);
        const paint = sim.spawn('item', 'item_paint_rainbow', j.x, j.y - 0.3);
        sim.physics.setVelocity(paint.id, 0, -2);
        sim.events.emit('rainbow_caught', { id: paint.id, jar: jar.id, x: j.x, y: j.y });
        sim.findSecret('secret_rainbow_end', j.x, j.y);
        return;
      }
    }
  }

  /** The flashlight pen shining in the porch at night: a shadow puppet of an unknown eight-legged bug. */
  private flashlight(): void {
    const sim = this.sim;
    const s = this.state;
    const porch = sim.content.areas.tryGet('area_under_porch');
    if (!porch || !this.awake(porch) || !sim.weather.dark) {
      s.shine = 0;
      return;
    }
    const lit = this.items('item_flashlight_pen').find((e) => {
      if (sim.isSleeping(e.id) || !sim.hasTag(e.id, 'tag_glowing')) return false;
      const x = sim.physics.getState(e.id).x;
      return x > porch.xStart + 1 && x < porch.xEnd - 1;
    });
    s.shine = lit ? s.shine + 15 : 0;
    if (!lit || s.shine < SHINE_TICKS || sim.tick - s.shadowAt < 12 * SIM_HZ) return;
    s.shadowAt = sim.tick;
    const p = sim.physics.getState(lit.id);
    sim.events.emit('shadow_puppet', { x: p.x, y: 3.6 });
    sim.findSecret('secret_flashlight_shadow', p.x, p.y);
  }

  /** Three glowing things by the porch lamp at night: moths swirl into a big spiral. */
  private lampMoths(): void {
    const sim = this.sim;
    const lamp = this.spots('porch_lamp')[0];
    if (!lamp || !this.awake(lamp.area) || !sim.weather.dark) return;
    if (sim.tick - this.state.mothsAt < 30 * SIM_HZ) return;
    let glowing = 0;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.glows(e)) continue;
      const p = sim.physics.getState(e.id);
      if (Math.hypot(p.x - lamp.x, p.y - lamp.y) <= LAMP_REACH) glowing++;
    }
    if (sim.places.state.lampOn) glowing++;
    if (glowing < LAMP_GLOWS) return;
    this.state.mothsAt = sim.tick;
    sim.events.emit('moths_swirled', { x: lamp.x, y: lamp.y });
    sim.findSecret('secret_lamp_moths', lamp.x, lamp.y);
  }

  /** Rides down the leaf slide: from its top perch to the floor. The tenth brings back a map scrap. */
  private slideRides(): void {
    const sim = this.sim;
    const slide = this.spots('leaf_slide')[0];
    if (!slide || !this.awake(slide.area)) return;
    const s = this.state;
    const topX = slide.x;
    const bottomX = slide.x - (slide.fixture.w ?? 4.6);
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id) continue;
      const p = sim.physics.getState(e.id);
      const key = String(e.id);
      const started = s.riding[key];
      if (Math.abs(p.x - topX) < 1 && p.y < slide.y + 0.9 && p.y > slide.y - 1.2) {
        if (started === undefined) s.riding[key] = sim.tick;
        continue;
      }
      if (started === undefined) continue;
      if (sim.tick - started > RIDE_TICKS) {
        delete s.riding[key];
        continue;
      }
      if (Math.abs(p.x - bottomX) > 1.2 || p.y < slide.y + 2.4) continue;
      delete s.riding[key];
      s.slides++;
      sim.events.emit('slide_ridden', { id: e.id, count: s.slides, x: p.x, y: p.y });
      if (s.slides < SLIDE_RIDES || !sim.canFind('secret_zipline_souvenir')) continue;
      const scrap = sim.spawn('item', 'item_map_scrap_3', p.x - 0.4, p.y - 0.6);
      sim.physics.setVelocity(scrap.id, -1, -2.5);
      if (e.kind === 'bug') sim.reactBug(e, 'wow');
      sim.events.emit('slide_souvenir', { id: scrap.id, x: p.x, y: p.y });
      sim.findSecret('secret_zipline_souvenir', p.x, p.y);
    }
  }

  /** In the rain, an open glass jar carried up to the cloud line comes back a cloud jar. */
  private cloudLine(): void {
    const sim = this.sim;
    if (!sim.weather.raining) return;
    for (const jar of this.items('item_jar_glass')) {
      if (sim.isSleeping(jar.id) || sim.physics.grabbed === jar.id) continue;
      const j = sim.physics.getState(jar.id);
      if (j.y > CLOUD_LINE || !sim.outdoors(j.x, j.y)) continue;
      sim.remove(jar.id);
      const cloud = sim.spawn('item', 'item_cloud_jar', j.x, j.y);
      sim.physics.setVelocity(cloud.id, j.vx, j.vy);
      sim.events.emit('item_transformed', {
        id: jar.id,
        newId: cloud.id,
        from: 'item_jar_glass',
        to: 'item_cloud_jar',
        x: j.x,
        y: j.y,
      });
      sim.events.emit('cloud_caught', { id: cloud.id, x: j.x, y: j.y });
      sim.findSecret('secret_catch_cloud', j.x, j.y);
      return;
    }
  }

  /** All four map scraps touching: they snap together into the treasure map. */
  private scraps(): void {
    const sim = this.sim;
    const found: Entity[] = [];
    for (const id of SCRAPS) {
      const e = this.items(id).find((x) => this.resting(x, 1));
      if (!e) return;
      found.push(e);
    }
    const pos = found.map((e) => sim.physics.getState(e.id));
    // Touching as a group: every scrap reaches the first one through scraps that touch.
    const linked = new Set([0]);
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < pos.length; i++) {
        if (linked.has(i)) continue;
        if (
          [...linked].some((j) => Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y) <= SCRAPS_TOUCH)
        ) {
          linked.add(i);
          grew = true;
        }
      }
    }
    if (linked.size < SCRAPS.length) return;
    const x = pos.reduce((a, p) => a + p.x, 0) / pos.length;
    const y = Math.min(...pos.map((p) => p.y));
    for (const e of found) sim.remove(e.id);
    const map = sim.spawn('item', 'item_treasure_map', x, y - 0.3);
    sim.physics.setVelocity(map.id, 0, -2);
    sim.events.emit('map_assembled', { id: map.id, x, y });
    sim.findSecret('secret_treasure_map', x, y);
  }

  /**
   * Twig lying across a gap (resting on things at both ends, with nothing
   * under his middle): three bugs that walk across him make him sigh proudly.
   */
  private bridge(): void {
    const sim = this.sim;
    if (sim.secrets.includes('secret_twig_bridge') || !sim.secrets.includes('secret_twig_blinks')) return;
    const twig = sim.entities
      .ofKind('bug')
      .find((b) => b.defId === 'bug_stickinsect_twig' && !b.bug?.pending);
    if (!twig || sim.isSleeping(twig.id)) return;
    const t = sim.physics.getState(twig.id);
    const half = sim.bugDef(twig).radius;
    // A gap under his middle: the ground is well below him there.
    if (sim.surfaceY(t.x) - t.y < half + 0.35 || Math.hypot(t.vx, t.vy) > 0.5) {
      return;
    }
    for (const id of this.ridersOn(twig)) {
      if (id !== twig.id && !this.state.crossed.includes(id)) this.state.crossed.push(id);
    }
    if (this.state.crossed.length < BRIDGE_BUGS) return;
    this.state.crossed = [];
    sim.reactBug(twig, 'show_off');
    sim.events.emit('twig_bridged', { id: twig.id, x: t.x, y: t.y });
    sim.findSecret('secret_twig_bridge', t.x, t.y);
  }
}
