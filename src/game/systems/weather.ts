import type { EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { Rng } from '../core/rng';
import type { BugDef, FixtureDef } from '../data/types';
import type { Sim } from '../sim';
import type { PhaseId, SkyState, WeatherId } from './sky';
import {
  CHANGE_MAX,
  CHANGE_MIN,
  DAY,
  FAST_FORWARD,
  GUST_TICKS,
  HOUR,
  MINUTE,
  MIN_RUN,
  PUDDLE_DRY,
  PUDDLE_FILL,
  RAINBOW_CHANCE,
  RAINBOW_TICKS,
  RAIN_SKIP,
  STARS_CHANCE,
  STAR_EVERY,
  SUN_CLICKS,
  SUN_WINDOW,
  VANE_CLICKS,
  VANE_WINDOW,
  WEATHER_IDS,
  WIND_SPEED,
  dayOf,
  isDaylight,
  newSkyState,
  phaseAt,
  rollWeather,
  snapDial,
  timeOfDay,
  windOf,
} from './sky';

/** The knothole gives something at most once per 10 game minutes. */
export const KNOTHOLE_EVERY = 10 * MINUTE;
/** The knothole tosses out no kind that already has this many lying about the plaza (P-19). */
export const KNOTHOLE_CAP = 3;
/** What can pop out of the knothole. */
export const KNOTHOLE_POOL: readonly string[] = [
  'item_pebble',
  'item_berry_red',
  'item_sugar_cube',
  'item_feather',
  'item_jelly_bean',
];
/** Lights toggled within this far (m) of the reeds count for the fireflies. */
export const REED_REACH = 3;
/** Three toggles within 8 s call Flick. */
export const FLASHES = 3;
export const FLASH_WINDOW = 8 * SIM_HZ;
/** Day bugs wake at dawn once rested, spread over this long so they don't all pop up at once. */
const WAKE_SPREAD = 50 * MINUTE;
/**
 * Day bugs' deep sleep: from 21:00 to 04:30 (plus the spread). The first
 * hour of the night only tired bugs turn in, so a kid who starts playing at
 * dusk still finds the world awake (P-14).
 */
export const DAY_BEDTIME = 21 * HOUR;
export const DAY_WAKE = 4.5 * HOUR;

/**
 * Day, night, and weather in the world (game design doc, section 11): runs
 * the clock and the weather state machine, the sundial and the weather
 * vane, puddles, shooting stars, and the time-and-weather secrets. It sets
 * the wind and rain that `Environment` applies. The math is in sky.ts.
 */
export class Weather {
  state: SkyState;
  private rng: Rng;
  private lastPhase: PhaseId;

  constructor(private readonly sim: Sim) {
    this.state = newSkyState(sim.seed);
    this.rng = Rng.fromState(this.state.rng);
    this.lastPhase = phaseAt(this.state.clock);
  }

  restore(state: SkyState): void {
    this.state = state;
    this.rng = Rng.fromState(state.rng);
    this.lastPhase = phaseAt(state.clock);
    this.syncEnv();
  }

  /** Plain JSON for the save. */
  serialize(): SkyState {
    this.state.rng = this.rng.getState();
    return JSON.parse(JSON.stringify(this.state)) as SkyState;
  }

  // --- Queries -------------------------------------------------------------

  get clock(): number {
    return this.state.clock;
  }

  get phase(): PhaseId {
    return phaseAt(this.state.clock);
  }

  get weather(): WeatherId {
    return this.state.weather;
  }

  get raining(): boolean {
    return this.state.weather === 'weather_rain';
  }

  get night(): boolean {
    return this.phase === 'phase_night';
  }

  /** Dark enough for lights to matter: night, and the dim ends of dawn and dusk. */
  get dark(): boolean {
    const h = timeOfDay(this.state.clock) / HOUR;
    return h >= 19.25 || h < 5.75;
  }

  /** Is the dial still fast-forwarding? */
  get fastForward(): boolean {
    const d = this.state.dial;
    return !!d && (d.held || d.target > this.state.clock);
  }

  /**
   * Is it this bug's time to sleep? Day bugs sleep through the night (and at
   * dusk when tired, which the AI decides), and wake at dawn once rested,
   * each at its own moment. Night bugs sleep through the day.
   */
  bedtime(def: BugDef, id: EntityId): boolean {
    if (def.sleepless) return false;
    const t = timeOfDay(this.state.clock);
    const spread = ((id * 7919) % 97) / 97;
    if (def.active === 'night') return t >= 7 * HOUR + spread * WAKE_SPREAD * 0.4 && t < 18 * HOUR;
    return t >= DAY_BEDTIME || t < DAY_WAKE + spread * WAKE_SPREAD;
  }

  /**
   * Dusk and the evening before bedtime (or the last of the night for night
   * bugs): tired bugs head to bed early.
   */
  eveningFor(def: BugDef): boolean {
    if (def.active === 'night') return this.phase === 'phase_dawn';
    const t = timeOfDay(this.state.clock);
    return this.phase === 'phase_dusk' || (t >= 18 * HOUR && t < DAY_BEDTIME);
  }

  // --- Commands -----------------------------------------------------------

  /** Debug and tests: set the weather (and its wind). The next change is a fresh 6 to 12 minutes away. */
  force(weather: WeatherId, wind: number): void {
    const s = this.state;
    if (!WEATHER_IDS.includes(weather)) return;
    s.wind = Number.isFinite(wind) ? Math.max(-6, Math.min(6, wind)) : 0;
    this.change(weather, false);
    s.next = this.sim.tick + this.rng.int(CHANGE_MIN, CHANGE_MAX);
    // A debug wind is the wind right now, gust or not.
    s.gust = null;
    this.syncEnv();
  }

  /**
   * Start rain now, as if the sky decided to (a rain dance, the cloud jar),
   * for `ticks`. It ends the usual way, maybe in a rainbow.
   */
  startRain(ticks: number): void {
    this.change('weather_rain', true);
    this.state.next = this.sim.tick + Math.max(1, Math.round(ticks));
  }

  /** Debug and tests: jump to `hour` (0 to 24) on the current day. May go backward. */
  setTime(hour: number): void {
    if (!Number.isFinite(hour)) return;
    const s = this.state;
    const h = ((hour % 24) + 24) % 24;
    s.clock = dayOf(s.clock) * DAY + Math.round(h * HOUR);
    s.dial = null;
    this.checkPhase();
  }

  /** The player turned the sundial's rim forward by `minutes` of game time. */
  turnDial(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const s = this.state;
    const add = Math.min(24 * HOUR, Math.round(minutes * MINUTE));
    if (!s.dial) s.dial = { target: s.clock, from: s.clock, held: true };
    s.dial.target = Math.max(s.dial.target, s.clock) + add;
    s.dial.held = true;
  }

  /** The player let go of the sundial: it snaps to a phase start nearby and finishes its sweep. */
  releaseDial(): void {
    const d = this.state.dial;
    if (!d) return;
    d.held = false;
    d.target = snapDial(d.target, this.state.clock);
  }

  /** A click on the weather vane: it spins. Three quick clicks start a gust of wind. */
  clickVane(x: number, y: number): void {
    const s = this.state;
    const tick = this.sim.tick;
    const vane = s.vane;
    vane.clicks = [...vane.clicks.filter((t) => tick - t < VANE_WINDOW), tick];
    // The rooster swings round and settles into the wind, or turns about if there is none.
    const wind = windOf(s, tick);
    vane.facing = wind !== 0 ? (wind > 0 ? 1 : -1) : vane.facing === 1 ? -1 : 1;
    vane.spinUntil = tick + 50;
    this.sim.events.emit('vane_spun', { facing: vane.facing, x, y });
    if (vane.clicks.length >= VANE_CLICKS) {
      vane.clicks = [];
      s.gust = { dir: vane.facing, until: tick + GUST_TICKS };
      this.syncEnv();
      this.sim.events.emit('gust_started', { dir: vane.facing, x, y, seconds: GUST_TICKS / SIM_HZ });
    }
  }

  /** A click on the sun painted on the sundial. Five quick ones: the sun puts on sunglasses. */
  clickSun(x: number, y: number): void {
    const s = this.state;
    const tick = this.sim.tick;
    s.sunClicks = [...s.sunClicks.filter((t) => tick - t < SUN_WINDOW), tick];
    this.sim.events.emit('sun_clicked', { count: s.sunClicks.length, x, y });
    if (s.sunClicks.length >= SUN_CLICKS && s.shades !== dayOf(s.clock)) {
      s.sunClicks = [];
      s.shades = dayOf(s.clock);
      this.sim.findSecret('secret_sun_shades', x, y);
    }
  }

  /**
   * A click on the stump's knothole. Something from its pool pops out, at
   * most once per 10 game minutes. At night two eyes blink back from inside.
   */
  pokeKnothole(f: { x: number; y: number }): void {
    const s = this.state;
    const sim = this.sim;
    const night = this.dark;
    let itemId: EntityId | null = null;
    if (s.knotholeAt < 0 || s.clock - s.knotholeAt >= KNOTHOLE_EVERY) {
      s.knotholeAt = s.clock;
      // Only kinds the plaza is not already full of.
      const area = sim.areaOf(f.x);
      const pool = KNOTHOLE_POOL.filter(
        (id) => sim.content.items.has(id) && sim.looseIn(id, area) < KNOTHOLE_CAP,
      );
      const defId = pool.length > 0 ? this.rng.pick(pool) : null;
      if (defId) {
        // Out over the stump's rim, tossed toward the player.
        const top = sim.surfaceY(f.x);
        const item = sim.spawn('item', defId, f.x, top - 0.45);
        sim.physics.setVelocity(item.id, this.rng.range(-1.6, 1.6), -5.5);
        itemId = item.id;
      }
    }
    sim.events.emit('knothole_peeked', { x: f.x, y: f.y, night, itemId });
    if (night) sim.findSecret('secret_stump_eyes', f.x, f.y);
  }

  /**
   * A light went on or off (the flashlight pen, or a glowing thing picked
   * up). Near the reeds at night the fireflies blink back, and three in a
   * row call Flick (`secret_firefly_flick`).
   */
  noteLight(x: number, y: number): void {
    const sim = this.sim;
    if (!this.dark) return;
    const reeds = this.fixture('reeds');
    if (!reeds) return;
    const rx = reeds.area + reeds.fixture.x;
    if (Math.abs(x - rx) > reeds.fixture.radius + REED_REACH) return;
    const s = this.state;
    const tick = sim.tick;
    s.flashes = [...s.flashes.filter((t) => tick - t < FLASH_WINDOW), tick];
    const flick = sim.entities.ofKind('bug').some((b) => b.defId === 'bug_firefly_flick');
    const answer = s.flashes.length >= FLASHES && !flick && sim.content.bugs.has('bug_firefly_flick');
    sim.events.emit('fireflies_blinked', { x: rx, y: reeds.fixture.y, answer });
    if (!answer) return;
    s.flashes = [];
    // One firefly answers with a big blink, flies over to the light, and stays.
    const bug = sim.spawn('bug', 'bug_firefly_flick', rx, reeds.fixture.y - 1.2);
    sim.physics.setVelocity(bug.id, Math.sign(x - rx) * 2, -2);
    sim.findSecret('secret_firefly_flick', x, y);
    sim.events.emit('bug_joined', { id: bug.id, defId: bug.defId, x: rx, y: reeds.fixture.y - 1.2 });
  }

  // --- Per step -----------------------------------------------------------

  update(): void {
    const s = this.state;
    const sim = this.sim;
    const tick = sim.tick;
    const before = s.clock;
    const d = s.dial;
    if (d && (d.held || d.target > s.clock)) {
      // Fast-forward: the sky sweeps toward the dial's time at 60x.
      s.clock += Math.max(1, Math.min(FAST_FORWARD, d.target - s.clock));
      if (!d.held && s.clock >= d.target) this.finishDial(d.from);
    } else {
      if (d) s.dial = null;
      s.clock += 1;
    }
    if (s.clock !== before) this.checkPhase();

    if (s.gust && tick >= s.gust.until) {
      s.gust = null;
      this.syncEnv();
    }
    // Weather changes on its own every 6 to 12 minutes; a rainbow fades after 90 s.
    if (tick >= s.next) this.change(this.nextWeather(), true);
    // Shooting stars go when the sky gets light.
    if (s.weather === 'weather_shooting_stars' && !this.night) this.change('weather_clear', true);
    if (s.weather === 'weather_shooting_stars' && tick >= s.starAt) {
      s.starAt = tick + STAR_EVERY;
      this.shootingStar();
    }
    this.updatePuddles();
  }

  /** The sundial reached its time: skipped weather is gone, and midnight holds a secret. */
  private finishDial(from: number): void {
    const s = this.state;
    s.dial = null;
    const to = s.clock;
    this.sim.events.emit('time_skipped', { from, to });
    if (to - from >= RAIN_SKIP && s.weather === 'weather_rain') this.change(this.afterRain(), true);
    if (timeOfDay(to) === 0 && to > from) {
      const dial = this.fixture('sundial');
      const x = dial ? dial.area + dial.fixture.x : 0;
      this.sim.findSecret('secret_sundial_midnight', x, dial?.fixture.y ?? 0);
    }
  }

  private checkPhase(): void {
    const phase = this.phase;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    const s = this.state;
    this.sim.events.emit('phase_changed', { phase, clock: s.clock });
    if (phase === 'phase_dawn') this.dew();
    if (phase === 'phase_night' && s.starsRolled !== dayOf(s.clock)) {
      // Each clear night has a small chance of shooting stars.
      s.starsRolled = dayOf(s.clock);
      if (s.weather === 'weather_clear' && this.rng.chance(STARS_CHANCE)) {
        this.change('weather_shooting_stars', true);
        s.starAt = this.sim.tick + STAR_EVERY / 2;
      }
    }
  }

  /** What comes next when the timer runs out. */
  private nextWeather(): WeatherId {
    const s = this.state;
    if (s.weather === 'weather_rain') return this.afterRain();
    let next = rollWeather(this.rng);
    if (next === s.weather) next = rollWeather(this.rng);
    return next;
  }

  /** After rain: a rainbow 60 percent of the time, in daylight; otherwise clear. */
  private afterRain(): WeatherId {
    return isDaylight(this.state.clock) && this.rng.chance(RAINBOW_CHANCE)
      ? 'weather_rainbow'
      : 'weather_clear';
  }

  private change(weather: WeatherId, natural: boolean): void {
    const s = this.state;
    const from = s.weather;
    const tick = this.sim.tick;
    if (from === 'weather_rain' && weather !== 'weather_rain') s.rainEnded = tick;
    s.weather = weather;
    s.since = tick;
    if (natural) {
      if (weather === 'weather_wind')
        s.wind = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(WIND_SPEED[0], WIND_SPEED[1]);
      else s.wind = 0;
      s.next =
        weather === 'weather_rainbow'
          ? tick + RAINBOW_TICKS
          : tick + Math.max(MIN_RUN, this.rng.int(CHANGE_MIN, CHANGE_MAX));
    }
    this.syncEnv();
    if (from !== weather) this.sim.events.emit('weather_changed', { weather, from, forced: !natural });
  }

  /** Tell the environment how hard the wind blows and whether it rains. */
  private syncEnv(): void {
    const env = this.sim.environment.state;
    const rain = this.raining;
    if (rain && !env.rain) env.rainSince = this.sim.tick;
    env.rain = rain;
    env.wind = windOf(this.state, this.sim.tick);
  }

  /** A shooting star streaks across the sky; bugs that are up point at it. */
  private shootingStar(): void {
    const sim = this.sim;
    const view = sim.view0();
    const x = view.x0 + this.rng.range(0.2, 0.8) * (view.x1 - view.x0);
    const dir = this.rng.chance(0.5) ? 1 : -1;
    sim.events.emit('shooting_star', { x, y: this.rng.range(0.8, 2.6), dir });
    sim.lookUp(x, 1.5);
  }

  /** Dawn: dew on leaves out under the sky. */
  private dew(): void {
    const sim = this.sim;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || !sim.hasTag(e.id, 'tag_leafy') || sim.sheltered(e)) continue;
      sim.addTag(e.id, 'tag_wet', 'dew');
    }
  }

  /** Rain fills the plaza's dips; after the rain they dry up over 3 minutes. */
  private updatePuddles(): void {
    const s = this.state;
    const rain = this.raining;
    for (const { fixture } of this.fixtures('puddle')) {
      const was = s.puddles[fixture.id] ?? 0;
      const next = rain ? Math.min(1, was + PUDDLE_FILL / SIM_HZ) : Math.max(0, was - PUDDLE_DRY / SIM_HZ);
      if (next <= 0) delete s.puddles[fixture.id];
      else s.puddles[fixture.id] = Math.round(next * 1e6) / 1e6;
    }
  }

  /** Puddles with water in them now: world x, surface y, half width. */
  puddles(): { id: string; x: number; y: number; half: number; fill: number }[] {
    const out: { id: string; x: number; y: number; half: number; fill: number }[] = [];
    for (const { area, fixture } of this.fixtures('puddle')) {
      const fill = this.state.puddles[fixture.id] ?? 0;
      if (fill <= 0) continue;
      const x = area + fixture.x;
      out.push({
        id: fixture.id,
        x,
        y: this.sim.surfaceY(x),
        half: fixture.radius * (0.4 + 0.6 * fill),
        fill,
      });
    }
    return out;
  }

  /** The puddle under world x, if it has water. */
  puddleAt(x: number): { id: string; x: number; y: number; half: number; fill: number } | null {
    for (const p of this.puddles()) if (Math.abs(x - p.x) <= p.half) return p;
    return null;
  }

  private fixtures(kind: FixtureDef['kind']): { area: number; fixture: FixtureDef }[] {
    const out: { area: number; fixture: FixtureDef }[] = [];
    for (const area of this.sim.content.areas.all)
      for (const fixture of area.fixtures ?? [])
        if (fixture.kind === kind) out.push({ area: area.xStart, fixture });
    return out;
  }

  private fixture(kind: FixtureDef['kind']): { area: number; fixture: FixtureDef } | null {
    return this.fixtures(kind)[0] ?? null;
  }
}
