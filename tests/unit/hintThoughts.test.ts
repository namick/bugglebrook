import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/game';
import { HINT_REACH, SECRET_SPOTS, hintThought } from '../../src/renderer/src/render/hintThoughts';

// Bugs hint too (game design doc, section 12): a bug idle near a waiting
// secret's spot may think of its hint pictogram.

const spots = new Map<string, { x: number }>();
for (const a of CONTENT.areas.all) for (const f of a.fixtures ?? []) spots.set(f.id, { x: a.xStart + f.x });
const spotOf = (id: string): { x: number } | null => spots.get(id) ?? null;
const all = (): boolean => true;

describe('hint thoughts', () => {
  it('every spot names a secret that exists', () => {
    for (const id of Object.keys(SECRET_SPOTS)) expect(CONTENT.secrets.has(id), id).toBe(true);
  });

  it('thinks of the nearest waiting secret, pictured by its hint', () => {
    const cup = spotOf('fix_sunken_teacup')!;
    const t = hintThought(CONTENT, cup.x - 0.5, [], all, spotOf);
    expect(t?.secret).toBe('secret_moon_pebble');
    expect(t!.pictos).toEqual(['moon', 'food']);
    expect(t!.food).toBe('item_pebble');
  });

  it('pictures an item hint as the item', () => {
    const hole = spotOf('fix_stump_knothole')!;
    const t = hintThought(CONTENT, hole.x, ['secret_stump_eyes', 'secret_boot_key'], all, spotOf);
    expect(t?.secret).toBe('secret_knothole_door');
    expect(t?.food).toBe('item_key_tiny');
    expect(t?.pictos).toContain('food');
  });

  it('never hints at a found secret, one whose prerequisites are missing, or one far away', () => {
    const hole = spotOf('fix_stump_knothole')!;
    // The stump door needs the boot's key first; the eyes are found.
    expect(hintThought(CONTENT, hole.x, ['secret_stump_eyes'], all, spotOf)).toBeNull();
    expect(hintThought(CONTENT, hole.x + HINT_REACH + 3, [], all, spotOf)?.secret ?? null).not.toBe(
      'secret_stump_eyes',
    );
    // Not in a locked area.
    const reeds = spotOf('fix_reeds')!;
    expect(hintThought(CONTENT, reeds.x, [], (a) => a !== 'area_puddle_pond', spotOf)).toBeNull();
  });
});
