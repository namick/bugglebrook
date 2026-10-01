import type { Registry } from '../data/registry';
import type { ItemDef, RecipeDef, RecipeInput } from '../data/types';

/**
 * The Tinker Bench's rules (game design doc, section 8), pure so every
 * recipe can be tested in every order. The sim hands in what is in the
 * trays as `Ingredient`s: each one's item and the tags it has right now.
 */
export interface Ingredient {
  defId: string;
  tags: readonly string[];
}

/** Does this thing fit this slot of a recipe? */
export function inputMatches(input: RecipeInput, ing: Ingredient): boolean {
  if (typeof input === 'string') return input === ing.defId;
  if ('tag' in input) return ing.tags.includes(input.tag);
  return input.anyOf.includes(ing.defId);
}

/**
 * Can these things fill these inputs, one each? Order never matters: every
 * assignment is tried (there are at most three of each, so at most six).
 */
export function fills(inputs: readonly RecipeInput[], ings: readonly Ingredient[]): boolean {
  if (inputs.length !== ings.length) return false;
  // Exact items first: "any glowing thing" should not steal the bead the headlamp needs.
  const slots = [...inputs].sort((a, b) => rank(a) - rank(b));
  const used = new Array<boolean>(ings.length).fill(false);
  const place = (i: number): boolean => {
    if (i === slots.length) return true;
    for (let j = 0; j < ings.length; j++) {
      if (used[j] || !inputMatches(slots[i]!, ings[j]!)) continue;
      used[j] = true;
      if (place(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return place(0);
}

function rank(input: RecipeInput): number {
  return typeof input === 'string' ? 0 : 'tag' in input ? 2 : 1;
}

/** The recipe these things make, or null. The first in table order wins. */
export function matchRecipe(recipes: readonly RecipeDef[], ings: readonly Ingredient[]): RecipeDef | null {
  return recipes.find((r) => fills(r.inputs, ings)) ?? null;
}

/**
 * A near miss (section 8, "Discovery rules"): two things in the trays that
 * are two thirds of a three-thing recipe the player has not made yet. Only
 * the first such recipe in table order counts. `missing` is the input that
 * would finish it.
 */
export function nearMiss(
  recipes: readonly RecipeDef[],
  ings: readonly Ingredient[],
  made: readonly string[],
): { recipe: RecipeDef; missing: RecipeInput } | null {
  if (ings.length !== 2) return null;
  for (const r of recipes) {
    if (r.inputs.length !== 3 || made.includes(r.id)) continue;
    for (let k = 0; k < 3; k++) {
      const rest = r.inputs.filter((_, i) => i !== k);
      if (fills(rest, ings)) return { recipe: r, missing: r.inputs[k]! };
    }
  }
  return null;
}

/**
 * A tag nudge: the things share a tag that some recipe asks for by tag, but
 * they are not that recipe's other items. The cork board shows the tag.
 */
export function tagNudge(
  recipes: readonly RecipeDef[],
  ings: readonly Ingredient[],
): { recipe: RecipeDef; tag: string } | null {
  for (const r of recipes)
    for (const input of r.inputs) {
      if (typeof input === 'string' || !('tag' in input)) continue;
      if (ings.some((i) => i.tags.includes(input.tag)) && !fills(r.inputs, ings))
        return { recipe: r, tag: input.tag };
    }
  return null;
}

/** What a failed pull makes, by the inputs' tags (section 8, "Failed combos"). */
export type BlobKind = 'sticky' | 'smelly' | 'bouncy' | 'food' | 'plain';

export function blobKind(ings: readonly Ingredient[]): BlobKind {
  const any = (tag: string): boolean => ings.some((i) => i.tags.includes(tag));
  if (any('tag_sticky')) return 'sticky';
  if (any('tag_smelly')) return 'smelly';
  if (any('tag_bouncy')) return 'bouncy';
  if (any('tag_edible')) return 'food';
  return 'plain';
}

/** Food goes in the bench's mouth on a failed pull: it is eaten, not kept in the blob. */
export function isFood(ing: Ingredient): boolean {
  return ing.tags.includes('tag_edible');
}

/**
 * The parts a crafted thing breaks back into when it has no record of what
 * went in (it started in the world, like the leaf raft): each input's own
 * item, the first of a group, or the first item with the tag.
 */
export function defaultParts(recipe: RecipeDef, items: Registry<ItemDef>): string[] {
  return recipe.inputs.map((input) => {
    if (typeof input === 'string') return input;
    if ('anyOf' in input) return input.anyOf[0]!;
    const found = items.all.find((d) => d.tags.includes(input.tag) && !d.potion && !d.toy);
    return found ? found.id : 'item_pebble';
  });
}

/** The recipe whose output this is, if any (crafted things can be pulled back apart). */
export function recipeFor(recipes: readonly RecipeDef[], defId: string): RecipeDef | null {
  return recipes.find((r) => r.output === defId) ?? null;
}
