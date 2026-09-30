import { describe, expect, it } from 'vitest';
import { CONTENT, areaAt, validateContent, worldWidth } from '../../src/game/data';
import type { Content } from '../../src/game/data';
import { createRegistry } from '../../src/game/data/registry';

describe('content registries', () => {
  it('are valid: unique snake_case IDs, resolvable references, sane numbers', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });

  it('has the M1 plaza, its three starting bugs, and its props', () => {
    expect(CONTENT.areas.all.map((a) => a.id)).toEqual(['area_stump_plaza']);
    expect(CONTENT.bugs.all.map((b) => b.id)).toEqual([
      'bug_ladybug_dot',
      'bug_pillbug_rollo',
      'bug_snail_glorp',
    ]);
    const start = CONTENT.areas.get('area_stump_plaza').start;
    const count = (id: string): number => start.filter((s) => s.defId === id).length;
    expect(count('item_bottle_cap')).toBe(1);
    expect(count('item_marble_blue') + count('item_marble_red')).toBe(2);
    expect(count('item_pebble')).toBe(4);
    expect(count('item_berry_red')).toBe(3);
    for (const id of ['item_ruler_ramp', 'item_spring_coil', 'item_rubber_ball', 'item_twig', 'item_leaf'])
      expect(count(id), id).toBe(1);
    expect(start.filter((s) => s.kind === 'bug')).toHaveLength(3);
  });

  it('look up by ID and throw on unknown IDs', () => {
    expect(CONTENT.items.get('item_pebble').id).toBe('item_pebble');
    expect(CONTENT.items.has('nope')).toBe(false);
    expect(CONTENT.items.tryGet('nope')).toBeUndefined();
    expect(() => CONTENT.items.get('nope')).toThrow(/Unknown item/);
  });

  it('areas tile the world', () => {
    expect(worldWidth()).toBe(38.4);
    expect(areaAt(1).id).toBe('area_stump_plaza');
    expect(areaAt(-5).id).toBe('area_stump_plaza');
    expect(areaAt(999).id).toBe('area_stump_plaza');
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
    const [a] = CONTENT.areas.all;
    const b = { ...a!, id: 'area_next', xStart: a!.xEnd + 1, xEnd: a!.xEnd + 10 };
    const errors = broken({ areas: createRegistry('area', [a!, b]) });
    expect(errors.some((e) => e.includes('does not start where'))).toBe(true);
  });

  it('reports bad terrain, start lists, and bug preferences', () => {
    const [a] = CONTENT.areas.all;
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
