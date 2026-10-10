// The Music Lab's list of things to listen to, built from the music manifest
// and the areas (never typed out by hand), so it grows as tracks arrive. Each
// entry is a small script the lab's runner plays: stage a scene, let the
// outgoing music play, then make the change a player would hear. Pure.

import type { MusicKey } from '../../../shared/music';
import { MUSIC_SAMPLE_RATE, keyName } from '../../../shared/music';
import { PLAYER_QUIET_BARS, SHELTERED } from '../audio/musicEngine';
import type { MusicChoice, MusicLibrary, RulesPhase } from '../audio/musicManifest';
import { fadeSeconds } from '../audio/musicPick';

/** What the lab needs to know about an area (an `AreaDef` fits). */
export interface LabArea {
  id: string;
  name: string;
  xStart: number;
  xEnd: number;
  hidden?: boolean;
}

export type LabTab = 'borders' | 'phases' | 'loops' | 'rain' | 'notes';

export const LAB_TABS: readonly { id: LabTab; label: string }[] = [
  { id: 'borders', label: 'Between places' },
  { id: 'phases', label: 'Day and night' },
  { id: 'loops', label: 'Loop points' },
  { id: 'rain', label: 'Rain' },
  { id: 'notes', label: 'Playing along' },
];

/** The hours a scene is staged at. Night music runs from 19:00 to 06:00. */
export const DAY_HOUR = 12;
export const NIGHT_HOUR = 22;
export const DUSK_HOUR = 19;
export const DAWN_HOUR = 6;
/** Dusk and dawn demos start this many game minutes early (a game minute is a second). */
export const PHASE_LEAD_MINUTES = 8;
/** How far each side of a border the camera starts and ends, meters. */
export const BORDER_STEP = 4;
/** Bars of the outgoing music before a change. */
export const LEAD_BARS = 2;
/** A loop demo starts this many bars before the loop point. */
export const LOOP_LEAD_BARS = 2;
/** Notes the "playing along" demo plays, one a beat. */
export const DEMO_NOTES = 4;

export type LabStep = { say: string } & (
  | { do: 'menu' }
  /** Open a world if none is, open the strip's areas, set the clock and weather, and put the camera at `x`. */
  | { do: 'stage'; area: string; x: number; hour: number; rain: boolean }
  /** Wait until this track (or the pad) is playing with no crossfade under way. */
  | { do: 'playing'; id: string; phase?: RulesPhase }
  /** Wait this many bars at the playing tempo. */
  | { do: 'bars'; bars: number }
  /** Slide the camera's center to `x`. */
  | { do: 'camera'; x: number; seconds: number }
  | { do: 'rain'; on: boolean }
  /** Jump to `bars` bars before the loop point. */
  | { do: 'seek'; bars: number }
  /** Wait for the loop to come round. */
  | { do: 'wrap' }
  /** Play this many notes as the player would, one a beat. */
  | { do: 'notes'; count: number }
);

export interface LabDemo {
  id: string;
  tab: LabTab;
  /** The row's name: plain words. */
  label: string;
  /** A few words beside it: the keys, the loop's length. */
  detail: string;
  steps: LabStep[];
}

const phaseWords = (p: RulesPhase): string => (p === 'day' ? 'daytime' : 'at night');
const hourFor = (p: RulesPhase): number => (p === 'day' ? DAY_HOUR : NIGHT_HOUR);
const center = (a: LabArea): number => (a.xStart + a.xEnd) / 2;

/** `pad` for the stand-in, with its key, or the track's key. */
function keyWords(c: { track: unknown; key: MusicKey }): string {
  return c.track ? keyName(c.key) : `pad (${keyName(c.key)})`;
}

/** `1:20` for 80 seconds. */
export function clockWords(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A track's plain name: `Puddle Pond, daytime tune`, or `stand-in pad` for one not made yet. */
export function trackTitle(id: string, library: MusicLibrary, areas: readonly LabArea[]): string {
  if (id === '') return 'nothing yet';
  if (id.startsWith('pad:')) return 'a stand-in pad (no track here yet)';
  if (id === 'main_menu') return 'Menu tune';
  const t = library.track(id);
  const area = areas.find((a) => a.id === t?.area);
  if (!t || !area) return id;
  return t.phase === 'always' ? `${area.name} tune` : `${area.name}, ${phaseWords(t.phase)} tune`;
}

function stage(a: LabArea, hour: number, rain: boolean, x = center(a)): LabStep {
  return { do: 'stage', area: a.id, x, hour, rain, say: `Setting the scene: ${a.name}.` };
}

function settle(c: MusicChoice, phase: RulesPhase): LabStep {
  return { do: 'playing', id: c.id, phase, say: 'Starting the music here.' };
}

function lead(what: string): LabStep {
  return { do: 'bars', bars: LEAD_BARS, say: `${what} for ${LEAD_BARS} bars first.` };
}

function borderDemos(library: MusicLibrary, strip: readonly LabArea[]): LabDemo[] {
  const out: LabDemo[] = [];
  for (const phase of ['day', 'night'] as const)
    for (let i = 0; i + 1 < strip.length; i++)
      for (const [a, b] of [
        [strip[i]!, strip[i + 1]!],
        [strip[i + 1]!, strip[i]!],
      ] as const) {
        const from = library.forArea(a.id, phase);
        const to = library.forArea(b.id, phase);
        const border = a.xStart < b.xStart ? a.xEnd : a.xStart;
        const dir = a.xStart < b.xStart ? 1 : -1;
        const fade = fadeSeconds('area', to.bpm, to.beatsPerBar);
        out.push({
          id: `border:${a.id}>${b.id}:${phase}`,
          tab: 'borders',
          label: `${a.name} to ${b.name}, ${phaseWords(phase)}`,
          detail: `${keyWords(from)} to ${keyWords(to)}`,
          steps: [
            stage(a, hourFor(phase), false, border - dir * BORDER_STEP),
            settle(from, phase),
            lead(a.name),
            {
              do: 'camera',
              x: border + dir * BORDER_STEP,
              seconds: 2,
              say: `Crossing into ${b.name}.`,
            },
            {
              do: 'playing',
              id: to.id,
              phase,
              say: `Crossing into ${b.name}: a ${fade.toFixed(1)} second crossfade, ${keyWords(from)} to ${keyWords(to)}.`,
            },
            { do: 'bars', bars: LEAD_BARS, say: `Now in ${b.name}.` },
          ],
        });
      }
  return out;
}

function phaseDemos(library: MusicLibrary, strip: readonly LabArea[]): LabDemo[] {
  const out: LabDemo[] = [];
  for (const a of strip)
    for (const to of ['night', 'day'] as const) {
      const from = to === 'night' ? 'day' : 'night';
      const before = library.forArea(a.id, from);
      const after = library.forArea(a.id, to);
      const name = to === 'night' ? 'Dusk' : 'Dawn';
      const same = before.id === after.id;
      out.push({
        id: `phase:${a.id}:${to === 'night' ? 'dusk' : 'dawn'}`,
        tab: 'phases',
        label: `${name} in ${a.name} (${from} to ${to})`,
        detail: same ? 'one track for both' : `${keyWords(before)} to ${keyWords(after)}`,
        steps: [
          stage(a, (to === 'night' ? DUSK_HOUR : DAWN_HOUR) - PHASE_LEAD_MINUTES / 60, false),
          settle(before, from),
          {
            do: 'playing',
            id: after.id,
            phase: to,
            say: same
              ? `${name} comes in about ${PHASE_LEAD_MINUTES} seconds. There is one track for day and night here, so only the mix changes.`
              : `${name} comes in about ${PHASE_LEAD_MINUTES} seconds. The drums and the tune thin out first, then the ${to} music fades in over ${fadeSeconds('phase', after.bpm)} seconds.`,
          },
          { do: 'bars', bars: LEAD_BARS, say: `That was ${name.toLowerCase()} in ${a.name}.` },
        ],
      });
    }
  return out;
}

function loopDemos(library: MusicLibrary, areas: readonly LabArea[]): LabDemo[] {
  const out: { at: number; demo: LabDemo }[] = [];
  for (const id of library.ids()) {
    const t = library.track(id);
    if (!t) continue;
    const seconds = t.loop.samples / MUSIC_SAMPLE_RATE;
    const tail: LabStep[] = [
      {
        do: 'seek',
        bars: LOOP_LEAD_BARS,
        say: `Jumped to ${LOOP_LEAD_BARS} bars before the loop point.`,
      },
      { do: 'wrap', say: 'The loop point is coming' },
      { do: 'bars', bars: LEAD_BARS, say: 'That was the loop point. The tune has started again.' },
    ];
    const detail = `${t.loop.bars} bars, ${clockWords(seconds)}`;
    const label = `${trackTitle(id, library, areas)}: the loop point`;
    if (id === 'main_menu') {
      out.push({
        at: -1,
        demo: {
          id: `loop:${id}`,
          tab: 'loops',
          label,
          detail,
          steps: [
            { do: 'menu', say: 'Going back to the menu.' },
            { do: 'playing', id, say: 'Starting the menu music.' },
            ...tail,
          ],
        },
      });
      continue;
    }
    const area = areas.find((a) => a.id === t.area);
    if (!area) continue;
    const phase: RulesPhase = t.phase === 'night' ? 'night' : 'day';
    const here = library.forArea(area.id, phase);
    if (here.id !== id) continue;
    out.push({
      at: area.xStart + (phase === 'night' ? 0.5 : 0),
      demo: {
        id: `loop:${id}`,
        tab: 'loops',
        label,
        detail,
        steps: [stage(area, hourFor(phase), false), settle(here, phase), ...tail],
      },
    });
  }
  return out.sort((a, b) => a.at - b.at).map((o) => o.demo);
}

function rainDemos(library: MusicLibrary, strip: readonly LabArea[]): LabDemo[] {
  const out: LabDemo[] = [];
  for (const a of strip)
    for (const phase of ['day', 'night'] as const)
      for (const on of [true, false]) {
        const c = library.forArea(a.id, phase);
        const dry = SHELTERED.has(a.id);
        const change = dry
          ? on
            ? 'This place is under cover: only the tune gets a little softer.'
            : 'The tune comes back up.'
          : on
            ? 'The drums drop out, the tune gets softer, and the music is muffled.'
            : 'The drums and the tune come back over 2 bars.';
        out.push({
          id: `rain:${a.id}:${phase}:${on ? 'on' : 'off'}`,
          tab: 'rain',
          label: `Rain ${on ? 'starts' : 'stops'} in ${a.name}, ${phaseWords(phase)}`,
          detail: dry ? 'under cover' : c.track ? '' : 'pad',
          steps: [
            stage(a, hourFor(phase), !on),
            settle(c, phase),
            lead(on ? 'Dry weather' : 'Rain'),
            { do: 'rain', on, say: on ? 'It starts to rain.' : 'The rain stops.' },
            { do: 'bars', bars: 4, say: `${on ? 'It is raining.' : 'The rain has stopped.'} ${change}` },
          ],
        });
      }
  return out;
}

function noteDemos(library: MusicLibrary, strip: readonly LabArea[]): LabDemo[] {
  const out: LabDemo[] = [];
  for (const a of strip)
    for (const phase of ['day', 'night'] as const) {
      const c = library.forArea(a.id, phase);
      out.push({
        id: `notes:${a.id}:${phase}`,
        tab: 'notes',
        label: `Play a few notes in ${a.name}, ${phaseWords(phase)}`,
        detail: keyWords(c),
        steps: [
          stage(a, hourFor(phase), false),
          settle(c, phase),
          lead('The full tune'),
          {
            do: 'notes',
            count: DEMO_NOTES,
            say: `Playing ${DEMO_NOTES} notes on the leaf xylophone. The tune dips on the next beat.`,
          },
          {
            do: 'bars',
            bars: PLAYER_QUIET_BARS + 3,
            say: `The tune stays low for ${PLAYER_QUIET_BARS} bars after the last note, then comes back over 2 bars.`,
          },
        ],
      });
    }
  return out;
}

/**
 * Everything the lab can play. Borders and the day, night, rain, and note
 * demos cover the open strip (hidden areas have doors, not borders); loop
 * demos cover every looping track the manifest has. An area with no track
 * yet still gets its rows: the pad plays there.
 */
export function buildDemos(library: MusicLibrary, areas: readonly LabArea[]): LabDemo[] {
  const strip = areas.filter((a) => !a.hidden).sort((a, b) => a.xStart - b.xStart);
  return [
    ...borderDemos(library, strip),
    ...phaseDemos(library, strip),
    ...loopDemos(library, areas),
    ...rainDemos(library, strip),
    ...noteDemos(library, strip),
  ];
}
