import type { Content } from '../../../game/data';
import { isGlyph } from '../../../game/data/glyphs';
import type { Glyph } from '../../../game/data/glyphs';
import type { Picto } from './reactions';

/**
 * Bugs hint too (game design doc, section 12, "Clue placement"): a bug idle
 * near where an unfound secret waits sometimes thinks of that secret's hint
 * pictogram. Only the hint, never how. Pure.
 */

/** Where each secret waits: the fixture its trigger is at. */
export const SECRET_SPOTS: Readonly<Record<string, string>> = {
  secret_stump_eyes: 'fix_stump_knothole',
  secret_ant_sugar: 'fix_ant_hill',
  secret_mushroom_chord: 'fix_ring_mushroom_2',
  secret_sundial_midnight: 'fix_sundial',
  secret_sun_shades: 'fix_sundial',
  secret_boot_key: 'fix_rubber_boot',
  secret_knothole_door: 'fix_stump_knothole',
  secret_moon_pebble: 'fix_sunken_teacup',
  secret_teacup_coins: 'fix_sunken_teacup',
  secret_skip_stone: 'fix_lily_pad_middle',
  secret_frog_blink: 'fix_frog_eyes',
  secret_raft_regatta: 'fix_lily_pad_east',
  secret_firefly_flick: 'fix_reeds',
  secret_pond_freeze: 'fix_lily_pad_west',
  secret_sunflower_drink: 'fix_sunflower_gate',
  secret_band_of_three: 'fix_flowerpot_stage',
  secret_sequencer_song: 'fix_mushroom_sequencer',
  secret_gnome_knock: 'fix_gnome',
  secret_paint_all_five: 'fix_paint_red',
  secret_rain_dance: 'fix_flowerpot_stage',
  secret_munch_found: 'fix_munch_leaf',
  secret_rainbow_end: 'fix_paint_blue',
  secret_whiff_found: 'fix_whiff_pot',
  secret_lamp_moths: 'fix_porch_lamp',
  secret_floor_coin: 'fix_floor_gap_2',
  secret_spider_wave: 'fix_spider',
  secret_flashlight_shadow: 'fix_porch_lamp',
  secret_first_blob: 'fix_tinker_bench',
  secret_first_potion: 'fix_compost_cauldron',
  secret_triple_potion: 'fix_compost_cauldron',
  secret_scope_wubbo: 'fix_bug_scope',
  secret_wubbo_found: 'fix_jar_moss',
  secret_marble_tune: 'fix_pegboard',
  secret_domino_chain: 'fix_pegboard',
  secret_prim_found: 'fix_jar_claw',
  secret_claw_triple: 'fix_jar_claw',
  secret_zipline_souvenir: 'fix_leaf_slide',
  secret_window_telescope: 'fix_treehouse_window',
  secret_golden_marble: 'fix_clover',
  // Secrets with nothing to see in the world until they happen (P-23): a
  // bug nearby thinks of them instead.
  secret_bug_totem: 'fix_ring_mushroom_1',
  secret_fling_orbit: 'fix_weather_vane',
  secret_giant_launch: 'fix_bucket_lift',
  secret_sludge_burp: 'fix_compost_heap',
  secret_ghost_lattice: 'fix_lattice',
  secret_upside_tea: 'fix_cobweb_hammock',
  secret_twig_bridge: 'fix_rubber_boot',
};

/** A bug this close (m) to a waiting secret's spot may think of it. */
export const HINT_REACH = 4;
/** How often an idle bug's thought is a hint instead of nothing (section 12: 10 percent). */
export const HINT_CHANCE = 0.1;

/** Hint glyphs a thought bubble can draw with the shared pictograms. */
const PICTO_OF: Readonly<Record<string, Picto>> = {
  moon: 'moon',
  sun: 'sun',
  cloud: 'rain',
  snow: 'snow',
  drop: 'drop',
  note: 'note',
  notes3: 'note',
  stack: 'up',
  arcs: 'up',
};

export interface HintThought {
  secret: string;
  pictos: Picto[];
  /** An item in the hint, pictured as a mini item. */
  food: string | null;
  /** A journal glyph no picto can show, drawn as the journal draws it. */
  glyph: Glyph | null;
}

/**
 * The hint thought for a bug at world x, or null: the nearest secret still
 * waiting (not found, not blocked, prerequisites found, area open) whose
 * spot is within reach, drawn with what the bubble can picture.
 */
export function hintThought(
  content: Content,
  x: number,
  found: readonly string[],
  open: (areaId: string) => boolean,
  spotOf: (fixtureId: string) => { x: number } | null,
): HintThought | null {
  let best: { secret: string; d: number } | null = null;
  for (const def of content.secrets.all) {
    if (def.blocked || found.includes(def.id)) continue;
    if (!(def.requires ?? []).every((r) => found.includes(r))) continue;
    if (def.trigger.type !== 'scripted' || !open(def.trigger.area)) continue;
    const fixture = SECRET_SPOTS[def.id];
    const spot = fixture ? spotOf(fixture) : null;
    if (!spot) continue;
    const d = Math.abs(spot.x - x);
    if (d <= HINT_REACH && (!best || d < best.d)) best = { secret: def.id, d };
  }
  if (!best) return null;
  const def = content.secrets.get(best.secret);
  const pictos: Picto[] = [];
  let food: string | null = null;
  let glyph: Glyph | null = null;
  for (const g of def.hint) {
    if (content.items.has(g) && !food) {
      food = g;
      pictos.push('food');
    } else if (PICTO_OF[g]) pictos.push(PICTO_OF[g]);
    else if (isGlyph(g) && !glyph) {
      glyph = g;
      pictos.push('glyph');
    }
  }
  if (pictos.length === 0) return null;
  return { secret: best.secret, pictos: pictos.slice(0, 2), food, glyph };
}
