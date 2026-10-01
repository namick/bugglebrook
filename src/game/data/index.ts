import { AREAS } from './areas';
import { BUGS } from './bugs';
import { ITEMS } from './items';
import { POTIONS } from './potions';
import { RECIPES } from './recipes';
import { SECRETS } from './secrets';
import type { Registry } from './registry';
import { ID_PATTERN } from './registry';
import type { AreaDef, BugDef, ItemDef, PotionDef, RecipeDef, SecretDef } from './types';
import { NEED_IDS, PAINT_IDS } from './types';
import { MATERIALS } from './materials';
import { VIEW_HEIGHT_M } from '../constants';
import { TAG_IDS } from '../systems/tags';
import { AFFINITY, EVERYONE_AFFINITY } from './affinity';
import { ESSENCE_IDS, ESSENCE_ITEMS, ESSENCE_PAINT, MOON_ITEMS } from './essences';
import type { AffinityDef } from './affinity';

export * from './types';
export { AREAS, BUGS, ITEMS, MATERIALS, POTIONS, RECIPES, SECRETS };

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
export function validateContent(
  content: Content = CONTENT,
  affinity: readonly AffinityDef[] = AFFINITY,
): string[] {
  const errors: string[] = [];
  // Affinity may name bugs from later milestones, so check the shape, not the registry.
  const pairs = new Set<string>();
  for (const a of affinity) {
    const where = `affinity ${a.a}/${a.b}`;
    for (const id of [a.a, a.b])
      if (!id.startsWith('bug_') || !ID_PATTERN.test(id)) errors.push(`${where} names a bad bug id "${id}"`);
    if (a.a === a.b) errors.push(`${where} pairs a bug with itself`);
    if (!(a.value >= -1 && a.value <= 1)) errors.push(`${where} must be -1 to 1`);
    const key = [a.a, a.b].sort().join('|');
    if (pairs.has(key)) errors.push(`${where} is listed twice`);
    pairs.add(key);
  }
  for (const [id, v] of Object.entries(EVERYONE_AFFINITY))
    if (!(v >= -1 && v <= 1) || !id.startsWith('bug_')) errors.push(`everyone-affinity ${id} is invalid`);
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
    const w = area.water;
    if (w) {
      if (!(w.x0 >= 0 && w.x1 <= width && w.x1 > w.x0))
        errors.push(`${where} water must lie inside the area`);
      if (!(w.maxRise >= 0)) errors.push(`${where} water maxRise must not be negative`);
    }
    for (const s of area.start)
      if (s.onWater && !(w && s.x > w.x0 && s.x < w.x1))
        errors.push(`${where} start ${s.defId} is not on water`);
    const fixtureIds = new Set<string>();
    for (const f of area.fixtures ?? []) {
      if (!f.id.startsWith('fix_') || !ID_PATTERN.test(f.id))
        errors.push(`${where} fixture id is invalid: "${f.id}"`);
      if (fixtureIds.has(f.id)) errors.push(`${where} duplicate fixture id: ${f.id}`);
      fixtureIds.add(f.id);
      if (f.x < 0 || f.x > width) errors.push(`${where} fixture ${f.id} is outside the area`);
      if (!(f.radius > 0)) errors.push(`${where} fixture ${f.id} radius must be positive`);
      if (f.kind === 'lily_pad' && !(w && f.x > w.x0 && f.x < w.x1))
        errors.push(`${where} lily pad ${f.id} is not on water`);
      if ((f.opens === undefined) !== (f.wall === undefined))
        errors.push(`${where} barrier ${f.id} needs both the area it opens and a wall`);
      if (f.opens !== undefined) {
        ref(content.areas, f.opens, `${where} barrier ${f.id}`);
        if (content.areas.tryGet(f.opens)?.unlockedByDefault)
          errors.push(`${where} barrier ${f.id} opens an area that is open from the start`);
      }
      if (f.wall !== undefined && (f.wall < 0 || f.wall > width))
        errors.push(`${where} barrier ${f.id} has its wall outside the area`);
      if (f.kind === 'paint_puddle' && !(f.paint && PAINT_IDS.includes(f.paint)))
        errors.push(`${where} paint puddle ${f.id} has no paint color`);
      if (f.kind === 'shelf_jar') {
        if (!f.item) errors.push(`${where} shelf jar ${f.id} holds nothing`);
        else ref(content.items, f.item, `${where} shelf jar ${f.id}`);
      }
      if (f.w !== undefined && !(f.w > 0)) errors.push(`${where} fixture ${f.id} width must be positive`);
      if (f.h !== undefined && !(f.h > 0)) errors.push(`${where} fixture ${f.id} height must be positive`);
    }
    const solidIds = new Set<string>();
    for (const solid of area.solids ?? []) {
      if (solidIds.has(solid.id)) errors.push(`${where} duplicate solid id: ${solid.id}`);
      solidIds.add(solid.id);
      if (!solid.box === !solid.chain) errors.push(`${where} solid ${solid.id} needs a box or a chain`);
      const xs = solid.box ? [solid.box[0], solid.box[2]] : (solid.chain ?? []).map((p) => p[0]);
      if (xs.some((x) => x < -0.01 || x > width + 0.01))
        errors.push(`${where} solid ${solid.id} is outside the area`);
      if (solid.box && !(solid.box[2] > solid.box[0] && solid.box[3] > solid.box[1]))
        errors.push(`${where} solid ${solid.id} has a non-positive size`);
      if (solid.until !== undefined) ref(content.areas, solid.until, `${where} solid ${solid.id}`);
    }
    for (const s of area.start) {
      if (s.pending) {
        if (s.kind !== 'bug') errors.push(`${where} start ${s.defId} is pending but not a bug`);
        else if (content.bugs.has(s.defId) && !content.bugs.get(s.defId).hidden)
          errors.push(`${where} start ${s.defId} is pending but not a hidden bug`);
      }
      if (s.pin !== undefined && !(content.items.has(s.defId) && content.items.get(s.defId).track))
        errors.push(`${where} start ${s.defId} is pinned but not a track piece`);
      if (s.pin !== undefined && s.y === undefined)
        errors.push(`${where} start ${s.defId} is pinned without a y`);
      if (s.y !== undefined && !(s.y > 0 && s.y < VIEW_HEIGHT_M))
        errors.push(`${where} start ${s.defId} y is off screen`);
    }
  }
  // Every locked area has exactly one barrier that opens it.
  for (const area of content.areas.all) {
    if (area.unlockedByDefault) continue;
    const barriers = content.areas.all.flatMap((a) => (a.fixtures ?? []).filter((f) => f.opens === area.id));
    if (barriers.length !== 1)
      errors.push(`area ${area.id} is locked and needs exactly one barrier to open it`);
  }

  for (const bug of content.bugs.all) {
    const where = `bug ${bug.id}`;
    if (bug.radius <= 0) errors.push(`${where} radius must be positive`);
    if (bug.speed <= 0) errors.push(`${where} speed must be positive`);
    ref(content.areas, bug.home, where);
    const tastes = [...bug.loves, ...bug.likes, ...bug.dislikes];
    for (const id of tastes) ref(content.items, id, where);
    if (new Set(tastes).size !== tastes.length) errors.push(`${where} lists an item under two tastes`);
    const [mx, my] = bug.mouth;
    if (!(mx > 0 && Math.hypot(mx, my) <= bug.radius * 2))
      errors.push(`${where} mouth anchor must be in front of the bug and near its body`);
    for (const need of NEED_IDS) {
      const w = bug.needWeights[need];
      if (!(w >= 0.5 && w <= 1.5)) errors.push(`${where} ${need} weight must be 0.5 to 1.5`);
    }
    const t = bug.traits;
    for (const [k, val] of Object.entries(t))
      if (!(val >= 0 && val <= 1)) errors.push(`${where} trait ${k} must be 0 to 1`);
    const v = bug.voice;
    if (!(v.low > 0 && v.high >= v.low && v.syllablesPerSecond > 0))
      errors.push(`${where} voice needs a positive pitch range and syllable rate`);
    if (bug.hidden && !bug.foundBy) errors.push(`${where} is hidden but no secret finds it`);
    if (bug.foundBy) ref(content.secrets, bug.foundBy, where);
    if (bug.collider && !(bug.collider.width > 0 && bug.collider.height > 0))
      errors.push(`${where} collider has a non-positive size`);
  }

  const tags: ReadonlySet<string> = new Set(TAG_IDS);
  for (const item of content.items.all) {
    if (item.density <= 0) errors.push(`item ${item.id} density must be positive`);
    if (!MATERIALS[item.material]) errors.push(`item ${item.id} has an unknown material "${item.material}"`);
    for (const t of item.tags) if (!tags.has(t)) errors.push(`item ${item.id} has an unknown tag "${t}"`);
    if (item.hull !== undefined && !(item.hull >= 1)) errors.push(`item ${item.id} hull must be at least 1`);
    if (item.magnet !== undefined && !(item.magnet > 0))
      errors.push(`item ${item.id} magnet must be positive`);
    const s = item.shape;
    if (s.type === 'circle' ? s.radius <= 0 : s.width <= 0 || s.height <= 0)
      errors.push(`item ${item.id} has a non-positive size`);
    if (item.launchSpeed !== undefined && !(item.launchSpeed > 0))
      errors.push(`item ${item.id} launchSpeed must be positive`);
    if (item.drag !== undefined && !(item.drag > 0 && item.drag <= 1))
      errors.push(`item ${item.id} drag must be above 0 and at most 1`);
    if (s.type === 'box' && s.parts?.some((p) => !(p.width > 0 && p.height > 0)))
      errors.push(`item ${item.id} has a part with a non-positive size`);
  }

  const recipeKeys = new Set<string>();
  const outputs = new Set<string>();
  for (const recipe of content.recipes.all) {
    const where = `recipe ${recipe.id}`;
    if (recipe.inputs.length < 2 || recipe.inputs.length > 3) errors.push(`${where} needs 2 or 3 inputs`);
    for (const input of recipe.inputs) {
      if (typeof input === 'string') ref(content.items, input, where);
      else if ('tag' in input) {
        if (!tags.has(input.tag)) errors.push(`${where} needs an unknown tag "${input.tag}"`);
      } else {
        if (input.anyOf.length < 2) errors.push(`${where} has a group of fewer than two items`);
        input.anyOf.forEach((id) => ref(content.items, id, where));
      }
    }
    ref(content.items, recipe.output, where);
    if (outputs.has(recipe.output)) errors.push(`${where} makes the same thing as another recipe`);
    outputs.add(recipe.output);
    const key = recipe.inputs
      .map((i) => (typeof i === 'string' ? i : 'tag' in i ? `#${i.tag}` : `*${i.label}`))
      .sort()
      .join('+');
    if (recipeKeys.has(key)) errors.push(`${where} duplicates the inputs of another recipe`);
    recipeKeys.add(key);
  }

  const essences: ReadonlySet<string> = new Set(ESSENCE_IDS);
  const brews = new Set<string>();
  for (const potion of content.potions.all) {
    const where = `potion ${potion.id}`;
    if (potion.durationTicks <= 0) errors.push(`${where} duration must be positive`);
    if (potion.recipe.length > 3) errors.push(`${where} has more than three essences`);
    for (const e of potion.recipe)
      if (!essences.has(e)) errors.push(`${where} uses an unknown essence "${e}"`);
    if (new Set(potion.recipe).size !== potion.recipe.length) errors.push(`${where} repeats an essence`);
    if (potion.recipe.length > 0) {
      const key = [...potion.recipe].sort().join('+');
      if (brews.has(key)) errors.push(`${where} has the same essences as another potion`);
      brews.add(key);
    }
    ref(content.items, potion.bottle, where);
    if (content.items.has(potion.bottle) && content.items.get(potion.bottle).potion !== potion.id)
      errors.push(`${where} bottle ${potion.bottle} does not hold it`);
  }
  // Every essence brews a base potion of its own.
  for (const e of ESSENCE_IDS)
    if (content.potions.all.length > 0 && !brews.has(e)) errors.push(`essence ${e} has no base potion`);
  const essenceItems = [...Object.keys(ESSENCE_ITEMS), ...MOON_ITEMS, ...Object.keys(ESSENCE_PAINT)];
  if (content.potions.all.length > 0) for (const id of essenceItems) ref(content.items, id, 'essence table');

  for (const item of content.items.all) {
    const where = `item ${item.id}`;
    if (item.potion !== undefined) ref(content.potions, item.potion, where);
    if (item.blueprint !== undefined) ref(content.recipes, item.blueprint, where);
    if (item.shatters) {
      ref(content.items, item.shatters.into, where);
      if (!(item.shatters.count > 0 && item.shatters.speed > 0))
        errors.push(`${where} shatters needs a positive count and speed`);
    }
    if (item.lift !== undefined && !(item.lift > 0)) errors.push(`${where} lift must be positive`);
  }

  for (const secret of content.secrets.all) {
    const where = `secret ${secret.id}`;
    const t = secret.trigger;
    switch (t.type) {
      case 'scripted':
        ref(content.areas, t.area, where);
        break;
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
