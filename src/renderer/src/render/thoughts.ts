import type { Needs } from '../../../game/core/entities';
import type { BugDef, ItemDef } from '../../../game/data/types';
import type { Picto } from './reactions';

/** Needs below this show a thought bubble (game design doc, section 5). */
export const THOUGHT_BELOW = 25;

export interface Thought {
  pictos: Picto[];
  /** The food to picture, for a `food` pictogram. */
  food: string | null;
}

/**
 * What a bug is thinking about, from its lowest need under the threshold:
 * a food it loves or likes when hungry, a toy it likes when bored, and
 * "Zzz" when sleepy. Null when nothing is low. Pure.
 */
export function thoughtFor(
  def: BugDef,
  needs: Needs,
  items: { has(id: string): boolean; get(id: string): ItemDef },
): Thought | null {
  const low = (
    [
      ['need_energy', 20],
      ['need_hunger', THOUGHT_BELOW],
      ['need_fun', THOUGHT_BELOW],
    ] as const
  )
    .filter(([need, below]) => needs[need] < below)
    .sort((a, b) => needs[a[0]] - needs[b[0]]);
  const first = low[0];
  if (!first) return null;
  const favorites = [...def.loves, ...def.likes].filter((id) => items.has(id));
  switch (first[0]) {
    case 'need_energy':
      return { pictos: ['zzz'], food: null };
    case 'need_hunger': {
      const food = favorites.find((id) => items.get(id).tags.includes('tag_edible')) ?? null;
      return food ? { pictos: ['food'], food } : { pictos: ['question'], food: null };
    }
    case 'need_fun': {
      const toy = favorites.find((id) => !items.get(id).tags.includes('tag_edible'));
      if (toy === 'item_spring_coil') return { pictos: ['spring'], food: null };
      return { pictos: ['note'], food: null };
    }
  }
}
