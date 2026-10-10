// Ties the music to a world: what the camera sees and the sky feed the
// engine; sim events and bug states feed the toys; the sequencer plays from
// the sim's pattern on the music clock. Reads the sim, never changes it.

import type { Sim } from '../../../game/sim';
import type { SeqRows } from '../../../game/systems/sequencer';
import {
  SEQ_BASS_ROW,
  SEQ_COLS,
  SEQ_DRUM_ROW,
  SEQ_MELODY,
  isEmpty,
  isOn,
  playingRows,
} from '../../../game/systems/sequencer';
import { STEPS_PER_BEAT } from './musicClock';
import type { MusicInput, MusicReport } from './musicEngine';
import { MusicEngine } from './musicEngine';
import { MusicLibrary } from './musicManifest';
import type { AreaSpan } from './musicPick';
import type { MusicSink } from './musicPlayer';
import { fetchJson } from './musicPlayer';
import type { NoteLog, PlayStyle } from './musicToys';
import { FIDDLE_LEGS, MusicToys } from './musicToys';
import type { AudioBackend } from './synth';

/** Through the bluebell speakers, the sequencer reaches every other area at a quarter volume. */
export const SPEAKER_VOLUME = 0.25;
/** Bugs on screen doing something: this many make the music busy. */
const BUSY_BUGS = 5;
const QUIET_MODES = new Set(['st_idle', 'st_sleep', 'st_pocketed', 'st_held']);

export interface WorldFrame {
  sim: Sim;
  /** The camera's view, world meters. */
  x0: number;
  x1: number;
  /** The player is holding something or dragging (counts as busy for 4 bars). */
  handBusy: boolean;
  paused: boolean;
}

export interface SequencerReport {
  /** The pattern that plays (the player's, or a bug's on an empty grid). */
  rows: SeqRows;
  /** Is it the player's pattern? */
  mine: boolean;
  column: number;
  volume: number;
  fast: boolean;
  current: 0 | 1;
  mutes: boolean[];
}

export class MusicDirector {
  readonly engine: MusicEngine;
  readonly toys: MusicToys;
  private sim: Sim | null = null;
  private areas: AreaSpan[] = [];
  private unsubscribe: (() => void)[] = [];
  private lastHand = -Infinity;
  private lastInput: number;
  private seqColumn = -1;
  private seqVolume = 0;

  constructor(
    backend: AudioBackend,
    private readonly sink: MusicSink,
    private readonly wallClock: () => number = () => performance.now() / 1000,
  ) {
    this.engine = new MusicEngine(sink, backend);
    this.toys = new MusicToys(
      backend,
      this.engine.clock,
      () => sink.now(),
      () => this.engine.area,
    );
    this.lastInput = wallClock();
  }

  /** Fetch the manifest; on failure the pad plays everywhere. */
  async load(url = 'music/manifest.json'): Promise<void> {
    try {
      this.engine.setLibrary(new MusicLibrary(await fetchJson(url)));
    } catch (err) {
      console.warn('No music manifest', err);
      this.engine.setLibrary(new MusicLibrary(null));
    }
  }

  /** The player did something (for the idle rows). */
  input(): void {
    this.lastInput = this.wallClock();
  }

  /**
   * A note as if the player poked this instrument, without a world (the
   * Music Lab's demo): it sounds on the next 16th and dips the melody.
   */
  playerNote(defId: string): void {
    this.toys.note({ id: -1, defId, note: 0, x: 0, y: 0, poked: true });
    this.engine.playerNote();
  }

  attach(sim: Sim): void {
    this.detach();
    this.sim = sim;
    this.areas = sim.content.areas.all.map((a) => ({ id: a.id, x0: a.xStart, x1: a.xEnd }));
    const ev = sim.events;
    this.unsubscribe = [
      ev.on('note_played', (e) => {
        const view = this.view;
        // Things out of sight and earshot stay quiet.
        if (view && (e.x < view.x0 - 3 || e.x > view.x1 + 3)) return;
        this.toys.note(e);
        if (e.poked) this.engine.playerNote();
      }),
      ev.on('band_played', () => this.toys.band()),
      ev.on('secret_found', (e) => {
        if (e.id === 'secret_sequencer_song') this.toys.theme();
      }),
      ev.on('area_unlocked', () => void this.engine.stinger()),
    ];
  }

  detach(): void {
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
    this.sim = null;
  }

  private view: { x0: number; x1: number } | null = null;

  /** One frame on the menu. */
  menuFrame(dt: number): void {
    this.view = null;
    this.engine.update(
      {
        menu: true,
        centerX: 0,
        areas: this.areas,
        clock: 0,
        raining: false,
        idle: 0,
        busy: false,
        bugPlaying: false,
        paused: false,
      },
      dt,
    );
  }

  /** One frame in a world. */
  worldFrame(dt: number, f: WorldFrame): void {
    const sim = f.sim;
    this.view = { x0: f.x0, x1: f.x1 };
    const wall = this.wallClock();
    if (f.handBusy) this.lastHand = this.sink.now();
    const bar = this.engine.clock.period * this.engine.clock.beatsPerBar;
    let active = 0;
    const players: { bug: number; defId: string; x: number; style: PlayStyle }[] = [];
    // Straight from the entities: building every view twice a frame costs too much.
    for (const e of sim.entities.ofKind('bug')) {
      const b = e.bug;
      if (!b || b.pending || sim.isSleeping(e.id)) continue;
      const x = sim.physics.getState(e.id).x;
      if (x < f.x0 || x > f.x1) continue;
      if (!QUIET_MODES.has(b.mode)) active++;
      const habits = sim.content.bugs.get(e.defId).habits;
      const style: PlayStyle = habits.fiddles ? 'fiddle' : habits.pollen ? 'buzz' : null;
      if (b.mode === 'st_use' && b.action === 'play' && b.targetId !== null) {
        const item = sim.entities.get(b.targetId);
        if (item) players.push({ bug: e.id, defId: item.defId, x, style });
      }
      // Fiddle playing his own legs (M11).
      if (b.mode === 'st_perform' && b.action === 'play' && b.targetId === null)
        players.push({ bug: e.id, defId: FIDDLE_LEGS, x, style: 'fiddle' });
    }
    const input: MusicInput = {
      menu: false,
      centerX: (f.x0 + f.x1) / 2,
      areas: this.areas,
      clock: sim.weather.clock,
      raining: sim.weather.raining,
      idle: wall - this.lastInput,
      busy: active >= BUSY_BUGS || this.sink.now() - this.lastHand < 4 * bar,
      bugPlaying: players.length > 0,
      paused: f.paused,
    };
    this.engine.update(input, dt);
    if (f.paused) return;
    // Bugs playing instruments in view, each on its own part, all on the same bars (a band).
    const live = new Set<string>();
    for (const p of players) {
      const key = `bug:${p.bug}`;
      live.add(key);
      this.toys.part(key, 0.15, (step, time) => this.toys.bugStep(p.bug, p.defId, step, time, 0.8, p.style));
    }
    this.sequencer(sim, live);
    if (this.toys.bandActive) {
      live.add('band');
      this.toys.updateBand(
        this.engine.area === 'area_flowerbed_stage' ? 1 : this.speakersOn(sim) ? SPEAKER_VOLUME : 0,
      );
    }
    this.toys.endPartsExcept(live);
  }

  private speakersOn(sim: Sim): boolean {
    const bells = sim.places.fixtures('bluebell');
    return bells.some((b) => !sim.places.state.muted.includes(b.fixture.id));
  }

  /** The mushroom sequencer plays its pattern on the 8ths (16ths fast), in the music's key. */
  private sequencer(sim: Sim, live: Set<string>): void {
    const layout = sim.places.sequencerLayout();
    const s = sim.places.sequencer;
    const rows = playingRows(s);
    const here = this.engine.area === 'area_flowerbed_stage';
    const volume = !layout || isEmpty(rows) ? 0 : here ? 1 : this.speakersOn(sim) ? SPEAKER_VOLUME : 0;
    this.seqVolume = volume;
    const mine = !isEmpty(s.patterns[s.current]);
    const drums = !s.mutes[SEQ_DRUM_ROW] && rows[SEQ_DRUM_ROW] !== 0;
    this.engine.setSequencer(volume >= 1 && mine, volume >= 1 && drums);
    const perStep = s.fast ? 1 : 2;
    const now = this.sink.now();
    this.seqColumn = Math.floor((this.engine.clock.beatAt(now) * STEPS_PER_BEAT) / perStep) % SEQ_COLS;
    if (volume <= 0) return;
    live.add('seq');
    this.toys.part('seq', 0.15, (step, time) => {
      if (step % perStep !== 0) return;
      const col = (((step / perStep) % SEQ_COLS) + SEQ_COLS) % SEQ_COLS;
      SEQ_MELODY.forEach((degree, row) => {
        if (s.mutes[row] || !isOn(rows, row, col)) return;
        this.toys.play({
          time,
          timbre: 'mushroom',
          degree,
          semis: 0,
          velocity: 0.8 * volume,
          source: 'seq',
          defId: 'fix_mushroom_sequencer',
          asked: time,
          octave: 5,
        });
      });
      if (!s.mutes[SEQ_BASS_ROW] && isOn(rows, SEQ_BASS_ROW, col))
        this.toys.play({
          time,
          timbre: 'bass',
          degree: this.toys.chordDegree(step),
          semis: 0,
          velocity: 0.8 * volume,
          source: 'seq',
          defId: 'fix_mushroom_sequencer',
          asked: time,
          octave: 2,
        });
      // Odd steps (counting from 1) are kicks, even ones snares.
      if (!s.mutes[SEQ_DRUM_ROW] && isOn(rows, SEQ_DRUM_ROW, col))
        this.toys.drum(col % 2 === 0, time, 0.8 * volume);
    });
  }

  /** For the sequencer's art: the column the playhead is on, and the volume it plays at. */
  sequencerReport(): SequencerReport | null {
    const sim = this.sim;
    if (!sim) return null;
    const s = sim.places.sequencer;
    return {
      rows: [...playingRows(s)],
      mine: !isEmpty(s.patterns[s.current]),
      column: this.seqColumn,
      volume: this.seqVolume,
      fast: s.fast,
      current: s.current,
      mutes: [...s.mutes],
    };
  }

  report(): MusicReport {
    return this.engine.report();
  }

  /** Beats on the music clock now (for drawing things on the beat). */
  beat(): number {
    return this.engine.clock.beatAt(this.sink.now());
  }

  notes(): NoteLog[] {
    return [...this.toys.log];
  }
}
