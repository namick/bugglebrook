import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS } from '../../src/game/data/areas';
import type { MusicManifest } from '../../src/shared/music';
import { MUSIC_SAMPLE_RATE } from '../../src/shared/music';
import { MusicEngine } from '../../src/renderer/src/audio/musicEngine';
import { MusicLibrary } from '../../src/renderer/src/audio/musicManifest';
import { NO_OVERRIDE, QUIET_MIX, mixTargets, overrideLayers } from '../../src/renderer/src/audio/musicMix';
import type { LayerName, MusicSink } from '../../src/renderer/src/audio/musicPlayer';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import type { LabDemo } from '../../src/renderer/src/musicLab/labPlan';
import {
  BORDER_STEP,
  DEMO_NOTES,
  LAB_TABS,
  buildDemos,
  trackTitle,
} from '../../src/renderer/src/musicLab/labPlan';
import { mixReasons, percent, readoutLines } from '../../src/renderer/src/musicLab/labReadout';
import type { LabHost } from '../../src/renderer/src/musicLab/labRunner';
import { LabRunner } from '../../src/renderer/src/musicLab/labRunner';

// The Music Lab's pure parts (docs/04-architecture.md, "The Music Lab"): the
// mute and solo rule, the list built from the manifest and the areas, the
// readout, and the runner, played against the real engine on a fake sink.

const MUSIC_DIR = join(import.meta.dirname, '../../src/renderer/public/music');
const committed = JSON.parse(readFileSync(join(MUSIC_DIR, 'manifest.json'), 'utf8')) as MusicManifest;
const HOUR = 3600;
const areas = AREAS.all;
const strip = areas.filter((a) => !a.hidden);
const PLAZA = AREAS.get('area_stump_plaza');
const POND = AREAS.get('area_puddle_pond');
const PORCH = AREAS.get('area_under_porch');

describe('mute and solo on top of the mix rules', () => {
  const day = mixTargets(QUIET_MIX).gains;

  it('changes nothing with no mutes or solos', () => {
    expect(overrideLayers(day, NO_OVERRIDE)).toEqual(day);
  });

  it('silences a muted layer and leaves the others at their rule gains', () => {
    const g = overrideLayers(day, { mute: ['drums'], solo: [] });
    expect(g).toEqual({ ...day, drums: 0 });
    expect(day.drums).toBe(1);
  });

  it('plays only the soloed layers, at their rule gains', () => {
    expect(overrideLayers(day, { mute: [], solo: ['lead'] })).toEqual({
      drums: 0,
      bass: 0,
      harmony: 0,
      lead: 0.85,
    });
    const two = overrideLayers(day, { mute: [], solo: ['lead', 'bass'] });
    expect([two.drums, two.bass, two.harmony, two.lead]).toEqual([0, 1, 0, 0.85]);
  });

  it('lets a mute win over a solo', () => {
    const g = overrideLayers(day, { mute: ['lead'], solo: ['lead', 'bass'] });
    expect([g.drums, g.bass, g.harmony, g.lead]).toEqual([0, 1, 0, 0]);
  });

  it('never raises a layer the rules have silenced', () => {
    const rain = mixTargets({ ...QUIET_MIX, raining: true }).gains;
    expect(overrideLayers(rain, { mute: [], solo: ['drums'] }).drums).toBe(0);
  });
});

describe('the list of demos', () => {
  const library = new MusicLibrary(committed);
  const demos = buildDemos(library, areas);
  const byId = (id: string): LabDemo => {
    const d = demos.find((x) => x.id === id);
    if (!d) throw new Error(`no demo ${id}`);
    return d;
  };
  const count = (tab: string): number => demos.filter((d) => d.tab === tab).length;

  it('has every border of the strip both ways, by day and by night', () => {
    expect(strip).toHaveLength(6);
    expect(count('borders')).toBe((strip.length - 1) * 2 * 2);
    for (const phase of ['day', 'night'])
      for (let i = 0; i + 1 < strip.length; i++) {
        byId(`border:${strip[i]!.id}>${strip[i + 1]!.id}:${phase}`);
        byId(`border:${strip[i + 1]!.id}>${strip[i]!.id}:${phase}`);
      }
    // Hidden areas have doors, not borders.
    expect(demos.some((d) => d.tab === 'borders' && /ant_hill|gnome/.test(d.id))).toBe(false);
  });

  it('names a border in plain words and says the keys', () => {
    const d = byId('border:area_stump_plaza>area_puddle_pond:day');
    expect(d.label).toBe('Mossy Stump Plaza to Puddle Pond, daytime');
    expect(d.detail).toBe('C major to E major');
    expect(byId('border:area_puddle_pond>area_flowerbed_stage:night').label).toBe(
      'Puddle Pond to Flowerbed Stage, at night',
    );
  });

  it('stages a border on the outgoing side, waits, then slides across', () => {
    const d = byId('border:area_stump_plaza>area_puddle_pond:day');
    expect(d.steps.map((s) => s.do)).toEqual(['stage', 'playing', 'bars', 'camera', 'playing', 'bars']);
    const [stage, from, , camera, to] = d.steps;
    expect(stage).toMatchObject({ area: PLAZA.id, x: PLAZA.xStart + BORDER_STEP, hour: 12, rain: false });
    expect(from).toMatchObject({ id: 'stump_plaza_day', phase: 'day' });
    expect(camera).toMatchObject({ x: PLAZA.xStart - BORDER_STEP });
    expect(to).toMatchObject({ id: 'puddle_pond_day' });
    // The other way starts in the pond and ends in the plaza.
    const back = byId('border:area_puddle_pond>area_stump_plaza:night').steps;
    expect(back[0]).toMatchObject({ area: POND.id, x: POND.xEnd - BORDER_STEP, hour: 22 });
    expect(back[3]).toMatchObject({ x: POND.xEnd + BORDER_STEP });
  });

  it('has dusk and dawn in every area of the strip', () => {
    expect(count('phases')).toBe(strip.length * 2);
    const dusk = byId('phase:area_flowerbed_stage:dusk');
    expect(dusk.label).toBe('Dusk in Flowerbed Stage (day to night)');
    expect(dusk.detail).toBe('C major to B minor');
    expect(dusk.steps[0]).toMatchObject({ do: 'stage', hour: 19 - 8 / 60 });
    expect(dusk.steps[1]).toMatchObject({ id: 'flowerbed_stage_day', phase: 'day' });
    expect(dusk.steps[2]).toMatchObject({ id: 'flowerbed_stage_night', phase: 'night' });
    const dawn = byId('phase:area_flowerbed_stage:dawn');
    expect(dawn.steps[0]).toMatchObject({ hour: 6 - 8 / 60 });
    expect(dawn.steps[2]).toMatchObject({ id: 'flowerbed_stage_day', phase: 'day' });
  });

  it('has the loop point of every track the manifest has', () => {
    const tracks = library.ids().filter((id) => library.track(id));
    expect(demos.filter((d) => d.tab === 'loops').map((d) => d.id)).toEqual([
      'loop:main_menu',
      'loop:flowerbed_stage_day',
      'loop:flowerbed_stage_night',
      'loop:puddle_pond_day',
      'loop:puddle_pond_night',
      'loop:stump_plaza_day',
      'loop:stump_plaza_night',
    ]);
    expect(count('loops')).toBe(tracks.length);
    const pond = byId('loop:puddle_pond_night');
    expect(pond.label).toBe('Puddle Pond, at night tune: the loop point');
    expect(pond.detail).toBe('24 bars, 1:20');
    expect(pond.steps.map((s) => s.do)).toEqual(['stage', 'playing', 'seek', 'wrap', 'bars']);
    expect(pond.steps[0]).toMatchObject({ area: POND.id, hour: 22 });
    expect(byId('loop:main_menu').steps[0]!.do).toBe('menu');
  });

  it('has rain starting and stopping, and a player’s notes, everywhere', () => {
    expect(count('rain')).toBe(strip.length * 2 * 2);
    expect(count('notes')).toBe(strip.length * 2);
    const on = byId('rain:area_stump_plaza:day:on');
    expect(on.label).toBe('Rain starts in Mossy Stump Plaza, daytime');
    expect(on.steps[0]).toMatchObject({ do: 'stage', rain: false });
    expect(on.steps[3]).toMatchObject({ do: 'rain', on: true });
    const off = byId('rain:area_stump_plaza:night:off');
    expect(off.steps[0]).toMatchObject({ do: 'stage', rain: true, hour: 22 });
    expect(off.steps[3]).toMatchObject({ do: 'rain', on: false });
    expect(byId('rain:area_under_porch:day:on').detail).toBe('under cover');
    expect(byId('notes:area_puddle_pond:day').steps[3]).toMatchObject({ do: 'notes', count: DEMO_NOTES });
  });

  it('shows an area with no track yet as the pad', () => {
    const d = byId('border:area_stump_plaza>area_under_porch:day');
    expect(d.detail).toBe('C major to pad (A minor)');
    expect(d.steps[4]).toMatchObject({ do: 'playing', id: 'pad:under_porch_day' });
    expect(byId('phase:area_under_porch:dusk').steps[2]).toMatchObject({ id: 'pad:under_porch_night' });
    expect(demos.some((x) => x.id.startsWith('loop:under_porch'))).toBe(false);
  });

  it('grows when a track arrives', () => {
    const more: MusicManifest = {
      ...committed,
      tracks: {
        ...committed.tracks,
        under_porch_day: { ...library.track('stump_plaza_day')!, area: PORCH.id, phase: 'day' },
        ant_hill_depths: {
          ...library.track('stump_plaza_day')!,
          area: 'area_ant_hill_depths',
          phase: 'always',
        },
      },
    };
    const lib = new MusicLibrary(more);
    expect(lib.errors).toEqual([]);
    const next = buildDemos(lib, areas);
    const border = next.find((d) => d.id === 'border:area_stump_plaza>area_under_porch:day')!;
    expect(border.detail).toBe('C major to C major');
    expect(border.steps[4]).toMatchObject({ id: 'under_porch_day' });
    // One track for day and night: the same tune, the night mix.
    expect(next.find((d) => d.id === 'phase:area_under_porch:dusk')!.detail).toBe('one track for both');
    const loops = next.filter((d) => d.tab === 'loops').map((d) => d.id);
    expect(loops).toContain('loop:under_porch_day');
    // A hidden area's track is staged inside it.
    const depths = next.find((d) => d.id === 'loop:ant_hill_depths')!;
    expect(depths.label).toBe('Ant Hill Depths tune: the loop point');
    expect(depths.steps[0]).toMatchObject({ do: 'stage', area: 'area_ant_hill_depths' });
    expect(next.length).toBe(demos.length + 2);
  });

  it('still builds with no manifest at all: every row is the pad', () => {
    const none = buildDemos(MusicLibrary.empty(), areas);
    expect(none.filter((d) => d.tab === 'loops')).toEqual([]);
    expect(none.filter((d) => d.tab === 'borders')).toHaveLength(20);
    expect(none.filter((d) => d.tab === 'borders').every((d) => d.detail.includes('pad'))).toBe(true);
  });

  it('gives every demo a tab, a label, and a line to say at each step', () => {
    const tabs = new Set(LAB_TABS.map((t) => t.id));
    expect(new Set(demos.map((d) => d.id)).size).toBe(demos.length);
    for (const d of demos) {
      expect(tabs.has(d.tab)).toBe(true);
      expect(d.label.length).toBeGreaterThan(8);
      // Plain words: no IDs in what the owner reads.
      expect(d.label).not.toMatch(/area_|_day|_night/);
      for (const s of d.steps) expect(s.say.length).toBeGreaterThan(4);
    }
  });

  it('names tracks in plain words', () => {
    expect(trackTitle('puddle_pond_day', library, areas)).toBe('Puddle Pond, daytime tune');
    expect(trackTitle('main_menu', library, areas)).toBe('Menu tune');
    expect(trackTitle('pad:under_porch_day', library, areas)).toContain('pad');
  });
});

/** A sink that records what it was told, on a clock the test moves. */
class FakeSink implements MusicSink {
  t = 0;
  readonly starts: { id: string; when: number; offset: number }[] = [];
  readonly layers: { layer: LayerName; gain: number; at: number; seconds: number }[] = [];
  readonly tracks: { gain: number; seconds: number }[] = [];
  private readonly loaded = new Set<string>();
  private voices = 0;
  now(): number {
    return this.t;
  }
  load(id: string): Promise<void> {
    this.loaded.add(id);
    return Promise.resolve();
  }
  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }
  unload(id: string): void {
    this.loaded.delete(id);
  }
  start(id: string, _loop: unknown, when: number, offset: number): number {
    this.starts.push({ id, when, offset });
    return ++this.voices;
  }
  setLayer(_voice: number, layer: LayerName, gain: number, at: number, seconds: number): void {
    this.layers.push({ layer, gain, at, seconds });
  }
  setTrack(_voice: number, gain: number, _at: number, seconds: number): void {
    this.tracks.push({ gain, seconds });
  }
  stop(): void {}
  setLowpass(): void {}
}

const spans = areas.map((a) => ({ id: a.id, x0: a.xStart, x1: a.xEnd }));

/** A stand-in for the game: a scene, a camera, a clock, and the real music engine. */
class Stage implements LabHost {
  readonly sink = new FakeSink();
  readonly engine = new MusicEngine(this.sink, new NullAudioBackend());
  where: 'menu' | 'world' = 'menu';
  x = (PLAZA.xStart + PLAZA.xEnd) / 2;
  /** The sky clock, sim ticks. */
  clock = 9 * HOUR;
  raining = false;
  notes = 0;
  stages = 0;
  cuts: boolean[] = [];
  private glide: { to: number; speed: number } | null = null;

  constructor(manifest: MusicManifest | null = committed) {
    this.engine.setLibrary(new MusicLibrary(manifest));
  }
  scene(): 'menu' | 'world' {
    return this.where;
  }
  openWorld(): void {
    this.where = 'world';
  }
  openMenu(): void {
    this.where = 'menu';
  }
  stage(hour: number, rain: boolean): void {
    this.stages++;
    this.clock = Math.round(hour * HOUR);
    this.raining = rain;
  }
  rain(on: boolean): void {
    this.raining = on;
  }
  camera(x: number, seconds: number): void {
    if (seconds > 0) this.glide = { to: x, speed: Math.abs(x - this.x) / seconds };
    else {
      this.glide = null;
      this.x = x;
    }
  }
  report(): ReturnType<MusicEngine['report']> {
    return this.engine.report();
  }
  cutting(on: boolean): void {
    this.cuts.push(on);
    this.engine.setCutting(on);
  }
  seek(bars: number): boolean {
    return this.engine.seekBeforeLoop(bars);
  }
  note(): void {
    this.notes++;
    this.engine.playerNote();
  }
  frame(dt: number): void {
    this.sink.t += dt;
    if (this.where === 'world') this.clock += dt * 60;
    if (this.glide) {
      const d = this.glide.to - this.x;
      const step = this.glide.speed * dt;
      if (Math.abs(d) <= step) {
        this.x = this.glide.to;
        this.glide = null;
      } else this.x += Math.sign(d) * step;
    }
    this.engine.update(
      {
        menu: this.where === 'menu',
        centerX: this.x,
        areas: spans,
        clock: this.clock,
        raining: this.raining,
        idle: 0,
        busy: false,
        bugPlaying: false,
        paused: false,
      },
      dt,
    );
  }
}

const DT = 1 / 30;
const loopSeconds = (id: string): number =>
  new MusicLibrary(committed).track(id)!.loop.samples / MUSIC_SAMPLE_RATE;

/** Run frames until `until` is true or `seconds` pass. Returns whether it came true. */
async function run(
  stage: Stage,
  runner: LabRunner | null,
  seconds: number,
  until: () => boolean = () => false,
): Promise<boolean> {
  for (let i = 0; i < seconds / DT; i++) {
    runner?.update(DT);
    stage.frame(DT);
    await Promise.resolve();
    if (until()) return true;
  }
  return false;
}

const demo = (id: string, manifest: MusicManifest | null = committed): LabDemo => {
  const d = buildDemos(new MusicLibrary(manifest), areas).find((x) => x.id === id);
  if (!d) throw new Error(`no demo ${id}`);
  return d;
};

describe('the lab’s hooks in the music engine', () => {
  const world = async (): Promise<Stage> => {
    const s = new Stage();
    s.where = 'world';
    s.clock = 12 * HOUR;
    await run(s, null, 1);
    expect(s.report().playing).toBe('stump_plaza_day');
    return s;
  };

  it('reports a muted layer at 0 and sends it at once, then brings it back', async () => {
    const s = await world();
    expect(s.report().layers).toEqual({ drums: 1, bass: 1, harmony: 1, lead: 0.85 });
    expect(s.report().override).toEqual({ mute: [], solo: [] });
    s.engine.setOverride({ mute: ['drums'], solo: [] });
    const before = s.sink.t;
    s.frame(DT);
    expect(s.report().layers.drums).toBe(0);
    expect(s.report().override.mute).toEqual(['drums']);
    const sent = s.sink.layers.at(-1)!;
    expect(sent).toMatchObject({ layer: 'drums', gain: 0 });
    // Not on the next bar line: now, and quick.
    expect(sent.at).toBeCloseTo(before + DT, 5);
    expect(sent.seconds).toBeLessThan(0.2);
    await run(s, null, 0.5);
    expect(s.report().heard.drums).toBe(0);
    expect(s.report().heard.lead).toBeCloseTo(0.85, 5);
    s.engine.setOverride(NO_OVERRIDE);
    await run(s, null, 0.5);
    expect(s.report().layers.drums).toBe(1);
    expect(s.report().heard.drums).toBe(1);
  });

  it('plays only a soloed layer', async () => {
    const s = await world();
    s.engine.setOverride({ mute: [], solo: ['lead'] });
    await run(s, null, 0.5);
    expect(s.report().heard).toEqual({ drums: 0, bass: 0, harmony: 0, lead: 0.85 });
  });

  it('reports a rule’s gain part way along its ramp', async () => {
    const s = await world();
    s.raining = true;
    s.frame(DT);
    const ramp = s.sink.layers.find((l) => l.layer === 'drums')!;
    // Rain takes the drums out over a bar, from the next bar line.
    expect(ramp.gain).toBe(0);
    expect(ramp.seconds).toBeCloseTo(2.5, 5);
    await run(s, null, 20, () => s.sink.t >= ramp.at + ramp.seconds / 2);
    const mid = s.report();
    expect(mid.layers.drums).toBe(0);
    expect(mid.heard.drums).toBeGreaterThan(0.3);
    expect(mid.heard.drums).toBeLessThan(0.7);
    await run(s, null, 3);
    expect(s.report().heard.drums).toBe(0);
  });

  it('reports where the loop is, and jumps to just before the loop point', async () => {
    const s = await world();
    const loop = loopSeconds('stump_plaza_day');
    const r = s.report();
    expect(r.loopSeconds).toBe(loop);
    expect(r.position).toBeGreaterThan(0.5);
    expect(r.position).toBeLessThan(1.5);
    expect(s.engine.seekBeforeLoop(2)).toBe(true);
    expect(s.sink.starts.at(-1)).toMatchObject({ id: 'stump_plaza_day', offset: loop - 5 });
    // A quick cut, not a crossfade.
    expect(s.sink.tracks.at(-1)!.seconds).toBeLessThan(0.5);
    await run(s, null, 1);
    expect(s.report().position).toBeGreaterThan(loop - 5);
    expect(s.report().playing).toBe('stump_plaza_day');
    await run(s, null, 5);
    expect(s.report().position).toBeLessThan(2);
    // Still on the bar: the loop point is a bar line of the music clock.
    const again = s.report();
    expect(again.position! % 2.5).toBeCloseTo(again.beatInBar * 0.625, 3);
  });

  it('cuts to a new track while staging, and crossfades as usual after', async () => {
    const s = await world();
    s.engine.setCutting(true);
    s.x = (POND.xStart + POND.xEnd) / 2;
    await run(s, null, 1);
    expect(s.report().playing).toBe('puddle_pond_day');
    expect(s.report().fading).toBe(false);
    s.engine.setCutting(false);
    s.x = (PLAZA.xStart + PLAZA.xEnd) / 2;
    await run(s, null, 1);
    // Two bars at 96 BPM.
    expect(s.sink.tracks.at(-1)!.seconds).toBeCloseTo(5, 5);
    expect(s.report().fading).toBe(true);
  });

  it('has no loop to report or jump along on the pad', async () => {
    const s = new Stage(null);
    s.where = 'world';
    await run(s, null, 1);
    expect(s.report().playing.startsWith('pad:')).toBe(true);
    expect(s.report().position).toBeNull();
    expect(s.engine.seekBeforeLoop(2)).toBe(false);
  });
});

describe('the lab’s runner', () => {
  it('plays a border: opens a world, stages the plaza, waits two bars, and crosses into the pond', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    await run(s, null, 1);
    expect(s.report().playing).toBe('main_menu');
    runner.play(demo('border:area_stump_plaza>area_puddle_pond:day'));
    expect(runner.running).toBe('border:area_stump_plaza>area_puddle_pond:day');
    expect(await run(s, runner, 10, () => runner.progress?.step === 3)).toBe(true);
    expect(s.where).toBe('world');
    expect(s.stages).toBe(1);
    expect(s.x).toBe(PLAZA.xStart + BORDER_STEP);
    expect(s.report()).toMatchObject({ playing: 'stump_plaza_day', fading: false, phase: 'day' });
    // The staging cut is over before the change, so the change is the real crossfade.
    expect(s.cuts.at(-1)).toBe(false);
    const waited = s.sink.t;
    expect(await run(s, runner, 10, () => s.report().target === 'puddle_pond_day')).toBe(true);
    // Two bars of the plaza at 96 BPM, then about a second for the camera to cross.
    expect(s.sink.t - waited).toBeGreaterThan(5);
    expect(s.sink.t - waited).toBeLessThan(7);
    expect(runner.status).toContain('Crossing into Puddle Pond');
    await run(s, runner, 0.2);
    expect(s.sink.tracks.at(-1)!.seconds).toBeCloseTo(5, 5);
    expect(await run(s, runner, 20, () => runner.running === null)).toBe(true);
    expect(s.report()).toMatchObject({ playing: 'puddle_pond_day', fading: false, key: 'E major' });
    expect(runner.status).toContain('Finished');
    expect(s.x).toBe(PLAZA.xStart - BORDER_STEP);
  });

  it('plays dusk: the day track thins, then the night track fades in over 12 seconds', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('phase:area_flowerbed_stage:dusk'));
    expect(await run(s, runner, 10, () => runner.progress?.step === 3)).toBe(true);
    expect(s.report()).toMatchObject({ playing: 'flowerbed_stage_day', key: 'C major', phase: 'day' });
    expect(s.report().state.thinning).toBe(true);
    const from = s.sink.t;
    expect(await run(s, runner, 15, () => s.report().target === 'flowerbed_stage_night')).toBe(true);
    expect(s.sink.t - from).toBeGreaterThan(6);
    expect(s.sink.t - from).toBeLessThan(9);
    await run(s, runner, 0.2);
    expect(s.sink.tracks.at(-1)!.seconds).toBe(12);
    expect(await run(s, runner, 30, () => runner.running === null)).toBe(true);
    expect(s.report()).toMatchObject({ playing: 'flowerbed_stage_night', key: 'B minor', bpm: 72 });
  });

  it('plays a loop point: jumps to two bars before it and waits for the tune to come round', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('loop:puddle_pond_night'));
    expect(await run(s, runner, 10, () => runner.progress?.step === 4)).toBe(true);
    const loop = loopSeconds('puddle_pond_night');
    const bar = 240 / 72;
    await run(s, runner, 0.1);
    expect(s.report().playing).toBe('puddle_pond_night');
    expect(s.report().position).toBeGreaterThan(loop - 2 * bar - 0.5);
    expect(runner.status).toMatch(/The loop point is coming: \d+ seconds to go\./);
    const from = s.sink.t;
    expect(await run(s, runner, 10, () => runner.progress?.step === 5)).toBe(true);
    expect(s.sink.t - from).toBeGreaterThan(2 * bar - 1);
    expect(s.report().position).toBeLessThan(1);
    expect(await run(s, runner, 10, () => runner.running === null)).toBe(true);
  });

  it('plays the menu’s loop point from a world', async () => {
    const s = new Stage();
    s.where = 'world';
    const runner = new LabRunner(s);
    await run(s, null, 1);
    runner.play(demo('loop:main_menu'));
    expect(await run(s, runner, 30, () => runner.running === null)).toBe(true);
    expect(s.where).toBe('menu');
    expect(s.report().playing).toBe('main_menu');
    expect(runner.status).toContain('Finished');
  });

  it('plays rain starting and stopping: the drums go and come back', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('rain:area_stump_plaza:day:on'));
    expect(await run(s, runner, 10, () => runner.progress?.step === 3)).toBe(true);
    expect(s.raining).toBe(false);
    expect(s.report().layers.drums).toBe(1);
    expect(await run(s, runner, 40, () => runner.running === null)).toBe(true);
    expect(s.raining).toBe(true);
    expect(s.report().layers).toMatchObject({ drums: 0, lead: 0.85 * 0.6 });
    expect(s.report().heard.drums).toBe(0);
    runner.play(demo('rain:area_stump_plaza:day:off'));
    expect(await run(s, runner, 10, () => runner.progress?.step === 3)).toBe(true);
    expect(s.raining).toBe(true);
    expect(await run(s, runner, 40, () => runner.running === null)).toBe(true);
    expect(s.raining).toBe(false);
    expect(s.report().heard.drums).toBeGreaterThan(0.5);
  });

  it('plays a player’s notes: four of them, and the lead dips and comes back', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('notes:area_stump_plaza:day'));
    expect(await run(s, runner, 20, () => s.notes === 1)).toBe(true);
    await run(s, runner, 0.1);
    expect(s.report().state.playerMusic).toBe(true);
    expect(s.report().layers.lead).toBeCloseTo(0.85 * 0.25, 5);
    expect(await run(s, runner, 5, () => s.notes === DEMO_NOTES)).toBe(true);
    expect(await run(s, runner, 40, () => runner.running === null)).toBe(true);
    expect(s.notes).toBe(DEMO_NOTES);
    expect(s.report().state.playerMusic).toBe(false);
    expect(s.report().layers.lead).toBe(0.85);
  });

  it('plays a border into an area with no track: the pad', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('border:area_stump_plaza>area_under_porch:night'));
    expect(await run(s, runner, 40, () => runner.running === null)).toBe(true);
    expect(runner.status).toContain('Finished');
    expect(s.report().playing).toBe('pad:under_porch_night');
    expect(s.report().position).toBeNull();
  });

  it('stops when asked, and the next change is a crossfade again', async () => {
    const s = new Stage();
    const runner = new LabRunner(s);
    runner.play(demo('border:area_stump_plaza>area_puddle_pond:day'));
    runner.update(DT);
    expect(s.cuts.at(-1)).toBe(true);
    runner.stop();
    expect(runner.running).toBeNull();
    expect(runner.progress).toBeNull();
    expect(s.cuts.at(-1)).toBe(false);
    const x = s.x;
    await run(s, runner, 3);
    expect(s.x).toBe(x);
  });

  it('says why and stops when a step cannot happen', async () => {
    const s = new Stage();
    // A world that never opens.
    s.openWorld = () => undefined;
    const runner = new LabRunner(s);
    runner.play(demo('border:area_stump_plaza>area_puddle_pond:day'));
    expect(await run(s, runner, 30, () => runner.running === null)).toBe(true);
    expect(runner.status).toBe('Stopped: could not open the world or reach that place.');
  });
});

describe('the readout', () => {
  const library = new MusicLibrary(committed);

  it('says what plays, its key and speed, and where the loop is', async () => {
    const s = new Stage();
    s.where = 'world';
    s.clock = 12 * HOUR;
    s.x = (POND.xStart + POND.xEnd) / 2;
    await run(s, null, 4);
    const lines = readoutLines(s.report(), library, areas);
    expect(lines[0]).toBe('Playing: Puddle Pond, daytime tune (puddle_pond_day)');
    expect(lines[1]).toBe('Key: E major.  Speed: 96 beats a minute.  Mix: day rules.');
    expect(lines[2]).toBe('Loop: 0:03 of 1:00, bar 2 of 24.');
    expect(lines.at(-1)).toBe('Mix notes: the plain mix.');
    s.raining = true;
    s.x = (PORCH.xStart + PORCH.xEnd) / 2;
    s.frame(DT);
    expect(readoutLines(s.report(), library, areas)).toContain('Crossfading into this now.');
    // A mute pressed during a crossfade reaches the track on its way out as well.
    const sent = s.sink.layers.length;
    s.engine.setOverride({ mute: ['bass'], solo: [] });
    s.frame(DT);
    expect(s.sink.layers.slice(sent).filter((l) => l.layer === 'bass' && l.gain === 0)).toHaveLength(1);
    s.engine.setOverride(NO_OVERRIDE);
    await run(s, null, 8);
    const pad = readoutLines(s.report(), library, areas);
    expect(pad[0]).toBe('Playing: pad, standing in for under_porch_day');
    expect(pad[2]).toBe('The pad has no loop and no layers to mute.');
    expect(pad.at(-1)).toBe('Mix notes: rain outside, tune a little softer.');
  });

  it('says nothing is playing before the music loads', () => {
    const e = new MusicEngine(new FakeSink(), new NullAudioBackend());
    expect(readoutLines(e.report(), library, areas)).toEqual([
      'Playing: nothing yet (the music is loading).',
    ]);
  });

  it('explains the mix', () => {
    expect(mixReasons(QUIET_MIX)).toEqual([]);
    expect(mixReasons({ ...QUIET_MIX, raining: true })).toEqual(['rain: drums off, tune softer']);
    expect(mixReasons({ ...QUIET_MIX, playerMusic: true, thinning: true })).toHaveLength(2);
    expect(percent(0.85)).toBe('85%');
    expect(percent(0)).toBe('0%');
  });
});
