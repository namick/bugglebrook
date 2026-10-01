import type { Registry } from '../data/registry';
import type { EssenceId, ItemDef, PotionDef, PotionEffect } from '../data/types';
import { ESSENCE_ITEMS, ESSENCE_PAINT, ESSENCE_TAGS, MOON_ITEMS, OPPOSITES } from '../data/essences';
import { PAINT_HEX, mixAll } from './paint';

/**
 * The cauldron's rules (game design doc, section 9), pure: which essence an
 * ingredient brings, and what a set of essences brews. The sim keeps what is
 * in the cauldron and stirs; this decides the potion.
 */

/** One ingredient's contribution: its essence (null for junk), and a color for `ess_color`. */
export interface EssenceDrop {
  essence: EssenceId | null;
  paint?: string;
}

/** What comes out of a brew. A potion bottle carries this as `entity.brew`. */
export interface Brew {
  /** The potion's ID, or null for a mix of two base effects (section 9, rule 2). */
  potion: string | null;
  /** The effects it gives: one, or two for a mix. */
  effects: PotionEffect[];
  /** 1 is normal. Extra copies of one essence add 25 percent each; a mix is 0.7. */
  strength: number;
  durationTicks: number;
  color: number;
  /** A paint potion's color, and the wings potion's. */
  paint?: string;
  /** A wobble potion flips between these two effects every 2 s. */
  flip?: [PotionEffect, PotionEffect];
  /** The essences that went in, for the journal. */
  essences: EssenceId[];
}

/** Which essence a thing brings. Moon pebbles are moonlight at night and plain glow by day. */
export function essenceOf(def: ItemDef, tags: readonly string[], night: boolean): EssenceDrop {
  if (MOON_ITEMS.includes(def.id)) return { essence: night ? 'ess_moon' : 'ess_glow' };
  if (def.paint) return { essence: 'ess_color', paint: def.paint };
  const listed = ESSENCE_ITEMS[def.id];
  if (listed)
    return listed === 'ess_color' ? { essence: listed, paint: ESSENCE_PAINT[def.id] } : { essence: listed };
  for (const [tag, essence] of ESSENCE_TAGS) if (tags.includes(tag)) return { essence };
  return { essence: null };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** The base potion for an essence. */
export function basePotion(potions: Registry<PotionDef>, essence: EssenceId): PotionDef {
  const p = potions.all.find((d) => d.recipe.length === 1 && d.recipe[0] === essence);
  if (!p) throw new Error(`No base potion for ${essence}`);
  return p;
}

function isOpposite(a: EssenceId, b: EssenceId): boolean {
  return OPPOSITES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function blend(a: number, b: number): number {
  const ch = (c: number, s: number): number => (c >> s) & 0xff;
  const m = (s: number): number => Math.round((ch(a, s) + ch(b, s)) / 2) << s;
  return m(16) | m(8) | m(0);
}

/**
 * Brew these drops (section 9, "Combination logic"):
 * 1. One essence (1 to 3 copies): its base potion, each extra copy adding
 *    50 percent to the time and 25 percent to the strength. Three different
 *    colors make a rainbow.
 * 2. Two essences: the special pair if listed, a wobble if they are
 *    opposites, or both base effects at 70 percent.
 * 3. Three essences: the special triple if listed, or sludge.
 * Nothing in it is clear water; anything without an essence makes sludge.
 */
export function brew(drops: readonly EssenceDrop[], potions: Registry<PotionDef>): Brew {
  const make = (p: PotionDef, strength = 1, scale = 1, extra: Partial<Brew> = {}): Brew => ({
    potion: p.id,
    effects: [p.effect],
    strength,
    durationTicks: Math.round(p.durationTicks * scale),
    color: p.color,
    essences: drops.flatMap((d) => (d.essence ? [d.essence] : [])),
    ...extra,
  });
  if (drops.length === 0) return make(potions.get('potion_water'));
  if (drops.some((d) => d.essence === null)) return make(potions.get('potion_sludge'));
  const essences = drops.map((d) => d.essence!);
  const unique = [...new Set(essences)];
  const paints = drops.flatMap((d) => (d.paint ? [d.paint] : []));
  const mixed = mixAll(paints);
  const extraCopies = drops.length - unique.length;
  const scale = 1 + 0.5 * extraCopies;
  const strength = 1 + 0.25 * extraCopies;

  if (unique.length === 1) {
    const e = unique[0]!;
    if (e === 'ess_color' && new Set(paints).size >= 3) return make(potions.get('potion_rainbow'));
    const p = basePotion(potions, e);
    if (e === 'ess_color' && mixed)
      return make(p, strength, scale, { paint: mixed, color: PAINT_HEX[mixed] ?? p.color });
    return make(p, strength, scale);
  }

  const listed = potions.all.find((d) => d.recipe.length === unique.length && sameSet(d.recipe, unique));
  if (listed) {
    const tint = mixed ? { paint: mixed } : {};
    return make(listed, strength, scale, tint);
  }
  if (unique.length === 2) {
    const [a, b] = unique as [EssenceId, EssenceId];
    const pa = basePotion(potions, a);
    const pb = basePotion(potions, b);
    if (isOpposite(a, b)) return make(potions.get('potion_wobble'), 1, 1, { flip: [pa.effect, pb.effect] });
    return {
      potion: null,
      effects: [pa.effect, pb.effect],
      strength: 0.7,
      durationTicks: Math.max(pa.durationTicks, pb.durationTicks),
      color: blend(pa.color, pb.color),
      essences,
      ...(mixed ? { paint: mixed } : {}),
    };
  }
  return make(potions.get('potion_sludge'));
}
