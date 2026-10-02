import { describe, expect, it } from 'vitest';
import { CONTENT, areaAt, validateContent, worldWidth } from '../../src/game/data';
import type { Content } from '../../src/game/data';
import { createRegistry } from '../../src/game/data/registry';

describe('content registries', () => {
  it('are valid: unique snake_case IDs, resolvable references, sane numbers', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });

  it('has six areas, the starting bugs, and their props', () => {
    expect(CONTENT.areas.all.map((a) => a.id)).toEqual([
      'area_flowerbed_stage',
      'area_puddle_pond',
      'area_stump_plaza',
      'area_under_porch',
      'area_compost_lab',
      'area_treehouse_arcade',
    ]);
    // Only the pond and the plaza are open at the start.
    expect(CONTENT.areas.all.filter((a) => a.unlockedByDefault).map((a) => a.id)).toEqual([
      'area_puddle_pond',
      'area_stump_plaza',
    ]);
    expect(CONTENT.bugs.all.map((b) => b.id)).toEqual([
      'bug_ladybug_dot',
      'bug_pillbug_rollo',
      'bug_snail_glorp',
      'bug_waterstrider_skeet',
      'bug_grasshopper_boing',
      'bug_firefly_flick',
      'bug_stinkbug_whiff',
      'bug_stagbeetle_moose',
      'bug_dungbeetle_barty',
      'bug_caterpillar_munch',
      'bug_mantis_prim',
      'bug_stickinsect_twig',
      'bug_bee_buzzby',
      'bug_cricket_fiddle',
      'bug_moth_luma',
    ]);
    // Every hidden bug has a secret that finds it.
    for (const bug of CONTENT.bugs.all.filter((b) => b.hidden))
      expect(CONTENT.secrets.has(bug.foundBy ?? ''), bug.id).toBe(true);
    // Flick is hidden until found at night by the reeds.
    expect(CONTENT.bugs.get('bug_firefly_flick').hidden).toBe(true);
    expect(CONTENT.bugs.get('bug_firefly_flick').active).toBe('night');
    const pond = CONTENT.areas.get('area_puddle_pond').start.map((s) => s.defId);
    for (const id of [
      'item_sponge',
      'item_cork',
      'item_leaf_raft',
      'item_paper_boat',
      'item_soap_sliver',
      'item_bubble_wand',
      'bug_waterstrider_skeet',
    ])
      expect(pond, id).toContain(id);
    const start = CONTENT.areas.get('area_stump_plaza').start;
    const count = (id: string): number => start.filter((s) => s.defId === id).length;
    expect(count('item_bottle_cap')).toBe(1);
    expect(count('item_marble_blue') + count('item_marble_red')).toBe(2);
    expect(count('item_pebble')).toBe(4);
    expect(count('item_berry_red')).toBe(3);
    for (const id of ['item_ruler_ramp', 'item_spring_coil', 'item_rubber_ball', 'item_twig', 'item_leaf'])
      expect(count(id), id).toBe(1);
    // Four bugs, and Twig pretending to be the second twig.
    expect(start.filter((s) => s.kind === 'bug' && !s.pending)).toHaveLength(4);
    expect(start.filter((s) => s.pending).map((s) => s.defId)).toEqual(['bug_stickinsect_twig']);
  });

  it('gives every item a known material and only known tags', () => {
    expect(validateContent(CONTENT)).toEqual([]);
    const pebble = CONTENT.items.get('item_pebble');
    const errors = validateContent({
      ...CONTENT,
      items: createRegistry('item', [
        ...CONTENT.items.all.filter((i) => i.id !== 'item_pebble'),
        { ...pebble, tags: ['tag_wobbly'] },
      ]),
    });
    expect(errors).toContain('item item_pebble has an unknown tag "tag_wobbly"');
  });

  it('checks the pond: water inside its area, floaters on water, lily pads on water', () => {
    const pond = CONTENT.areas.get('area_puddle_pond');
    const plaza = CONTENT.areas.get('area_stump_plaza');
    const errors = validateContent({
      ...CONTENT,
      areas: createRegistry('area', [
        {
          ...pond,
          water: { ...pond.water!, x1: 99 },
          start: [{ kind: 'item', defId: 'item_cork', x: 1, onWater: true }],
          fixtures: [
            { id: 'fix_lily_pad_west', kind: 'lily_pad', x: 1, y: 8.7, radius: 0.6 },
            { id: 'bad', kind: 'hose_tap', x: 2, y: 8, radius: 0 },
          ],
        },
        plaza,
      ]),
    });
    expect(errors).toContain('area area_puddle_pond water must lie inside the area');
    expect(errors).toContain('area area_puddle_pond start item_cork is not on water');
    expect(errors).toContain('area area_puddle_pond lily pad fix_lily_pad_west is not on water');
    expect(errors).toContain('area area_puddle_pond fixture id is invalid: "bad"');
    expect(errors).toContain('area area_puddle_pond fixture bad radius must be positive');
  });

  it('look up by ID and throw on unknown IDs', () => {
    expect(CONTENT.items.get('item_pebble').id).toBe('item_pebble');
    expect(CONTENT.items.has('nope')).toBe(false);
    expect(CONTENT.items.tryGet('nope')).toBeUndefined();
    expect(() => CONTENT.items.get('nope')).toThrow(/Unknown item/);
  });

  it('areas tile the world: flowerbed, pond, plaza, porch, compost lab, treehouse', () => {
    expect(worldWidth()).toBeCloseTo(195.2);
    expect(areaAt(1).id).toBe('area_flowerbed_stage');
    expect(areaAt(33).id).toBe('area_puddle_pond');
    expect(areaAt(63.9).id).toBe('area_puddle_pond');
    expect(areaAt(64).id).toBe('area_stump_plaza');
    expect(areaAt(110).id).toBe('area_under_porch');
    expect(areaAt(150).id).toBe('area_compost_lab');
    expect(areaAt(170).id).toBe('area_treehouse_arcade');
    expect(areaAt(-5).id).toBe('area_flowerbed_stage');
    expect(areaAt(999).id).toBe('area_treehouse_arcade');
  });
});

describe('validateContent', () => {
  const broken = (patch: Partial<Content>): string[] => validateContent({ ...CONTENT, ...patch });

  it('reports duplicate and badly formed IDs', () => {
    const pebble = CONTENT.items.get('item_pebble');
    const errors = broken({
      items: createRegistry('item', [pebble, pebble, { ...pebble, id: 'BadId' }]),
    });
    expect(errors).toContain('duplicate item id: item_pebble');
    expect(errors.some((e) => e.includes('not snake_case'))).toBe(true);
  });

  it('reports dangling references', () => {
    const errors = broken({
      recipes: createRegistry('recipe', [{ id: 'r', inputs: ['item_pebble', 'ghost'], output: 'void' }]),
      secrets: createRegistry('secret', [
        {
          id: 's',
          name: 'S',
          trigger: { type: 'bug_holds_item', bug: 'nobody', item: 'item_pebble', area: 'moon' },
          unlocks: [{ kind: 'bug', id: 'nobody' }],
        },
      ]),
    });
    expect(errors).toContain('recipe r references unknown item "ghost"');
    expect(errors).toContain('recipe r references unknown item "void"');
    expect(errors).toContain('secret s references unknown bug "nobody"');
    expect(errors).toContain('secret s references unknown area "moon"');
  });

  it('reports gaps between areas', () => {
    const a = CONTENT.areas.get('area_puddle_pond');
    const b = { ...a!, id: 'area_next', xStart: a!.xEnd + 1, xEnd: a!.xEnd + 10 };
    const errors = broken({ areas: createRegistry('area', [a!, b]) });
    expect(errors.some((e) => e.includes('does not start where'))).toBe(true);
  });

  it('reports bad terrain, start lists, and bug preferences', () => {
    const a = CONTENT.areas.get('area_stump_plaza');
    const dot = CONTENT.bugs.get('bug_ladybug_dot');
    const errors = broken({
      areas: createRegistry('area', [
        {
          ...a!,
          terrain: [
            [0, 9],
            [5, 9],
            [5, 8],
            [30, 20],
          ],
          start: [{ kind: 'item', defId: 'item_ghost', x: 99 }],
          respawn: [{ item: 'item_berry_red', count: 0 }],
        },
      ]),
      bugs: createRegistry('bug', [
        {
          ...dot,
          likes: ['item_ghost'],
          home: 'area_moon',
          needWeights: { ...dot.needWeights, need_fun: 3 },
        },
      ]),
    });
    expect(errors).toContain('area area_stump_plaza terrain must end at the area width');
    expect(errors).toContain('area area_stump_plaza terrain x must increase (point 2)');
    expect(errors).toContain('area area_stump_plaza terrain y is off screen (point 3)');
    expect(errors).toContain('area area_stump_plaza start references unknown item "item_ghost"');
    expect(errors).toContain('area area_stump_plaza start item_ghost is outside the area');
    expect(errors).toContain('area area_stump_plaza respawn count must be positive');
    expect(errors).toContain('bug bug_ladybug_dot references unknown item "item_ghost"');
    expect(errors).toContain('bug bug_ladybug_dot references unknown area "area_moon"');
    expect(errors).toContain('bug bug_ladybug_dot need_fun weight must be 0.5 to 1.5');
  });
});

describe('M2 content checks', () => {
  it('catches a food listed under two tastes and a mouth anchor behind the bug', () => {
    const dot = CONTENT.bugs.get('bug_ladybug_dot');
    const bad = { ...dot, likes: [...dot.likes, 'item_mint_leaf'], mouth: [-0.4, 0] as const };
    const errors = validateContent({ ...CONTENT, bugs: createRegistry('bug', [bad]) });
    expect(errors.some((e) => e.includes('two tastes'))).toBe(true);
    expect(errors.some((e) => e.includes('mouth anchor'))).toBe(true);
  });
});
