import { AREAS } from './areas';
import { BUGS } from './bugs';
import { ITEMS } from './items';
import { POTIONS } from './potions';
import { RECIPES } from './recipes';
import { SECRETS } from './secrets';
import type { Registry } from './registry';
import { ID_PATTERN } from './registry';
import type { AreaDef, BugDef, ItemDef, PotionDef, RecipeDef, SecretDef } from './types';
import { NEED_IDS } from './types';
import { VIEW_HEIGHT_M } from '../constants';

export * from './types';
export { AREAS, BUGS, ITEMS, POTIONS, RECIPES, SECRETS };

export interface Content {
  areas: Registry<AreaDef>;
  bugs: Registry<BugDef>;
  items: Registry<ItemDef>;
  recipes: Registry<RecipeDef>;
  potions: Registry<PotionDef>;
  secrets: Registry<SecretDef>;
}

export const CONTENT: Content = {
  areas: AREAS,
  bugs: BUGS,
  items: ITEMS,
  recipes: RECIPES,
  potions: POTIONS,
  secrets: SECRETS,
};

/** Width of the whole world in meters: the right edge of the last area. */
export function worldWidth(content: Content = CONTENT): number {
  return Math.max(...content.areas.all.map((a) => a.xEnd));
}

/** The area containing world x, clamped to the first and last area. */
export function areaAt(x: number, content: Content = CONTENT): AreaDef {
  const areas = content.areas.all;
  for (const area of areas) if (x >= area.xStart && x < area.xEnd) return area;
  const first = areas[0];
  const last = areas[areas.length - 1];
  if (!first || !last) throw new Error('No areas defined');
  return x < first.xStart ? first : last;
}

/**
 * Check every registry for problems: bad or duplicate IDs, dangling
 * references, and impossible numbers. Returns a list of messages; empty means
 * the content is valid.
 */
export function validateContent(content: Content = CONTENT): string[] {
  const errors: string[] = [];
  const registries = Object.values(content) as Registry<{ id: string }>[];

  for (const reg of registries) {
    const seen = new Set<string>();
    for (const def of reg.all) {
      if (!ID_PATTERN.test(def.id)) errors.push(`${reg.kind} id is not snake_case: "${def.id}"`);
      if (seen.has(def.id)) errors.push(`duplicate ${reg.kind} id: ${def.id}`);
      seen.add(def.id);
    }
  }

  const ref = (reg: Registry<{ id: string }>, id: string, where: string): void => {
    if (!reg.has(id)) errors.push(`${where} references unknown ${reg.kind} "${id}"`);
  };

  // Areas must tile the world left to right without gaps or overlaps.
  const sorted = [...content.areas.all].sort((a, b) => a.xStart - b.xStart);
  sorted.forEach((area, i) => {
    if (area.xEnd <= area.xStart) errors.push(`area ${area.id} has non-positive width`);
    const prev = sorted[i - 1];
    if (i === 0 && area.xStart !== 0) errors.push(`first area ${area.id} must start at x=0`);
    if (prev && prev.xEnd !== area.xStart)
      errors.push(`area ${area.id} does not start where ${prev.id} ends`);
  });
  if (!content.areas.all.some((a) => a.unlockedByDefault))
    errors.push('at least one area must be unlocked by default');

  for (const area of content.areas.all) {
    const where = `area ${area.id}`;
    const width = area.xEnd - area.xStart;
    const t = area.terrain;
    const first = t[0];
    const last = t[t.length - 1];
    if (!first || !last || t.length < 2) errors.push(`${where} terrain needs at least two points`);
    else {
      if (first[0] !== 0) errors.push(`${where} terrain must start at x=0`);
      if (Math.abs(last[0] - width) > 1e-9) errors.push(`${where} terrain must end at the area width`);
      t.forEach(([x, y], i) => {
        const prev = t[i - 1];
        if (prev && x - prev[0] < 0.01) errors.push(`${where} terrain x must increase (point ${i})`);
        if (!(y > 0 && y < VIEW_HEIGHT_M)) errors.push(`${where} terrain y is off screen (point ${i})`);
      });
    }
    for (const s of area.start) {
      const reg = s.kind === 'bug' ? content.bugs : content.items;
      ref(reg, s.defId, `${where} start`);
      if (s.x < 0 || s.x > width) errors.push(`${where} start ${s.defId} is outside the area`);
    }
    for (const r of area.respawn) {
      ref(content.items, r.item, `${where} respawn`);
      if (!(r.count > 0)) errors.push(`${where} respawn count must be positive`);
    }
  }

  for (const bug of content.bugs.all) {
    const where = `bug ${bug.id}`;
    if (bug.radius <= 0) errors.push(`${where} radius must be positive`);
    if (bug.speed <= 0) errors.push(`${where} speed must be positive`);
    ref(content.areas, bug.home, where);
    for (const id of [...bug.loves, ...bug.likes, ...bug.dislikes]) ref(content.items, id, where);
    for (const need of NEED_IDS) {
      const w = bug.needWeights[need];
      if (!(w >= 0.5 && w <= 1.5)) errors.push(`${where} ${need} weight must be 0.5 to 1.5`);
    }
    const v = bug.voice;
    if (!(v.low > 0 && v.high >= v.low && v.syllablesPerSecond > 0))
      errors.push(`${where} voice needs a positive pitch range and syllable rate`);
  }

  for (const item of content.items.all) {
    if (item.density <= 0) errors.push(`item ${item.id} density must be positive`);
    const s = item.shape;
    if (s.type === 'circle' ? s.radius <= 0 : s.width <= 0 || s.height <= 0)
      errors.push(`item ${item.id} has a non-positive size`);
    if (item.launchSpeed !== undefined && !(item.launchSpeed > 0))
      errors.push(`item ${item.id} launchSpeed must be positive`);
  }

  const recipeKeys = new Set<string>();
  for (const recipe of content.recipes.all) {
    const where = `recipe ${recipe.id}`;
    recipe.inputs.forEach((id) => ref(content.items, id, where));
    ref(content.items, recipe.output, where);
    const key = [...recipe.inputs].sort().join('+');
    if (recipeKeys.has(key)) errors.push(`${where} duplicates the inputs of another recipe`);
    recipeKeys.add(key);
  }

  for (const potion of content.potions.all) {
    if (potion.durationTicks <= 0) errors.push(`potion ${potion.id} duration must be positive`);
  }

  for (const secret of content.secrets.all) {
    const where = `secret ${secret.id}`;
    const t = secret.trigger;
    switch (t.type) {
      case 'bug_holds_item':
        ref(content.bugs, t.bug, where);
        ref(content.items, t.item, where);
        ref(content.areas, t.area, where);
        break;
      case 'recipe':
        ref(content.recipes, t.recipe, where);
        break;
      case 'potion_on_bug':
        ref(content.potions, t.potion, where);
        ref(content.bugs, t.bug, where);
        break;
    }
    for (const unlock of secret.unlocks) {
      const reg = { bug: content.bugs, area: content.areas, item: content.items }[unlock.kind];
      ref(reg, unlock.id, where);
    }
  }

  return errors;
}
