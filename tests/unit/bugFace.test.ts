import { describe, expect, it } from 'vitest';
import { BUG_MODES } from '../../src/game';
import { bugFace } from '../../src/renderer/src/render/bugFace';
import type { BugFaceInput } from '../../src/renderer/src/render/bugFace';

const content = { need_hunger: 70, need_fun: 70, need_energy: 70 };
const base: BugFaceInput = { art: 'ladybug', mode: 'st_idle', needs: content, time: 0, likesFlinging: true };

describe('bugFace', () => {
  it('has a face for every state', () => {
    for (const art of ['ladybug', 'pillbug', 'snail'] as const)
      for (const mode of BUG_MODES) {
        const f = bugFace({ ...base, art, mode });
        expect(f.eyes).toBeTruthy();
        expect(f.mouth).toBeTruthy();
      }
  });

  it('shows dizzy spirals and a wobbly mouth when dizzy', () => {
    expect(bugFace({ ...base, mode: 'st_dizzy' })).toMatchObject({ eyes: 'spiral', mouth: 'wobble' });
  });

  it('gives each bug its own reaction to being grabbed and flung', () => {
    expect(bugFace({ ...base, mode: 'st_held' })).toMatchObject({ eyes: 'happy', blush: true });
    expect(bugFace({ ...base, art: 'pillbug', likesFlinging: false, mode: 'st_held' }).eyes).toBe('worried');
    expect(bugFace({ ...base, mode: 'st_airborne' }).form).toBe('flying');
    expect(bugFace({ ...base, art: 'pillbug', likesFlinging: false, mode: 'st_airborne' }).form).toBe(
      'curled',
    );
    expect(bugFace({ ...base, art: 'snail', likesFlinging: false, mode: 'st_airborne' }).form).toBe(
      'in_shell',
    );
  });

  it('stays uncurled for its own little hops', () => {
    const hop = bugFace({ ...base, art: 'pillbug', mode: 'st_airborne', selfLaunched: true });
    expect(hop.form).toBe('normal');
  });

  it('chews while eating and looks glum when hungry', () => {
    const mouths = new Set(
      [0, 0.1, 0.2, 0.3].map((time) => bugFace({ ...base, mode: 'st_eat', time }).mouth),
    );
    expect(mouths).toContain('chew');
    expect(bugFace({ ...base, needs: { ...content, need_hunger: 10 } }).mouth).toBe('frown');
    expect(bugFace({ ...base, needs: { ...content, need_energy: 5 } }).eyes).toBe('sleepy');
    expect(bugFace({ ...base, needs: { need_hunger: 90, need_fun: 90, need_energy: 90 } }).mouth).toBe(
      'grin',
    );
  });
});
