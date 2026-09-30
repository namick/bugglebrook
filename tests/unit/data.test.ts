import { describe, expect, it } from 'vitest';
import { CONTENT, areaAt, validateContent, worldWidth } from '../../src/game/data';
import type { Content } from '../../src/game/data';
import { createRegistry } from '../../src/game/data/registry';

describe('content registries', () => {
  it('are valid: unique snake_case IDs, resolvable references, sane numbers', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });

  it('every registry has at least one entry', () => {
    for (const reg of Object.values(CONTENT)) expect(reg.all.length, reg.kind).toBeGreaterThan(0);
  });

  it('look up by ID and throw on unknown IDs', () => {
    expect(CONTENT.items.get('pebble').id).toBe('pebble');
    expect(CONTENT.items.has('nope')).toBe(false);
    expect(CONTENT.items.tryGet('nope')).toBeUndefined();
    expect(() => CONTENT.items.get('nope')).toThrow(/Unknown item/);
  });

  it('areas tile the world', () => {
    expect(worldWidth()).toBe(48);
    expect(areaAt(1).id).toBe('backyard');
    expect(areaAt(30).id).toBe('pond');
    expect(areaAt(-5).id).toBe('backyard');
    expect(areaAt(999).id).toBe('pond');
  });
});

describe('validateContent', () => {
  const broken = (patch: Partial<Content>): string[] => validateContent({ ...CONTENT, ...patch });

  it('reports duplicate and badly formed IDs', () => {
    const pebble = CONTENT.items.get('pebble');
    const errors = broken({
      items: createRegistry('item', [pebble, pebble, { ...pebble, id: 'BadId' }]),
    });
    expect(errors).toContain('duplicate item id: pebble');
    expect(errors.some((e) => e.includes('not snake_case'))).toBe(true);
  });

  it('reports dangling references', () => {
    const errors = broken({
      recipes: createRegistry('recipe', [{ id: 'r', inputs: ['pebble', 'ghost'], output: 'void' }]),
      secrets: createRegistry('secret', [
        {
          id: 's',
          name: 'S',
          trigger: { type: 'bug_holds_item', bug: 'nobody', item: 'pebble', area: 'moon' },
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
    const [a, b] = CONTENT.areas.all;
    const errors = broken({ areas: createRegistry('area', [a!, { ...b!, xStart: b!.xStart + 1 }]) });
    expect(errors.some((e) => e.includes('does not start where'))).toBe(true);
  });
});
