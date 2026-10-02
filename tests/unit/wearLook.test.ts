import { describe, expect, it } from 'vitest';
import { PIXELS_PER_METER } from '../../src/game/constants';
import { BUGS, CONTENT } from '../../src/game/data';
import type { BugDef, ItemDef } from '../../src/game/data/types';
import type { BugFrame } from '../../src/renderer/src/render/draw/bug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import { REST_FRAME } from '../../src/renderer/src/render/rig/bugRig';
import { FIT, placeWorn, restHead, seatOf, wearScale } from '../../src/renderer/src/render/wearLook';

// M11's acceptance (game design doc, section 19): every wearable attaches to
// every bug's correct anchor and scales to its head radius, drawn on the
// bug's live head (code-drawn here; the cutout bugs in artBugs.test.ts).

const WEARABLES: readonly ItemDef[] = CONTENT.items.all.filter((d) => d.wear);
const PPM = PIXELS_PER_METER;

function frame(extra: Partial<BugFrame> = {}): BugFrame {
  return { ...REST_FRAME, ...extra, face: { ...REST_FRAME.face, ...(extra.face ?? {}) } };
}

function dressed(def: BugDef, items: readonly ItemDef[], f: BugFrame = frame()): BugSprite {
  const s = new BugSprite(def);
  s.setWorn(
    items.map((d, i) => ({ id: i + 1, def: d })),
    (d) => new ItemSprite(d, 0),
  );
  s.update(f);
  return s;
}

describe('wear placement (pure)', () => {
  it('every wearable has a seat in its slot', () => {
    expect(WEARABLES).toHaveLength(29);
    for (const w of WEARABLES) {
      const seat = seatOf(w);
      const ok: Record<string, string[]> = {
        head: ['crown', 'brow'],
        face: ['eyes', 'eye', 'lip', 'brow'],
        back: ['back', 'neck'],
        feet: ['feet'],
      };
      expect(ok[w.wear!], w.id).toContain(seat);
    }
  });

  it('a hat scales with the head it sits on', () => {
    const dot = BUGS.get('bug_ladybug_dot');
    const hat = CONTENT.items.get('item_hat_acorn_cap');
    const head = restHead(dot);
    const w = hat.shape.type === 'box' ? hat.shape.width * PPM : 0;
    expect(wearScale(dot, hat, head) * w).toBeCloseTo(head.rx * 2 * FIT.crown, 5);
    const big = { ...head, rx: head.rx * 1.3, ry: head.ry * 1.3 };
    expect(wearScale(dot, hat, big)).toBeGreaterThan(wearScale(dot, hat, head));
  });
});

describe('every wearable on every bug (29 x every bug)', () => {
  it('sits at the right anchor on the drawn head, scaled to it', () => {
    for (const def of BUGS.all) {
      const s = dressed(def, WEARABLES);
      const head = restHead(def);
      const r = def.radius * PPM;
      WEARABLES.forEach((w, i) => {
        const at = s.wornAt.get(i + 1)!;
        const where = `${w.id} on ${def.id}`;
        expect(at, where).toBeDefined();
        expect(at.hidden, where).toBe(false);
        const seat = seatOf(w);
        if (w.wear === 'head' || w.wear === 'face') {
          // On the head: near its middle across, and hats above it.
          expect(Math.abs(at.x - head.x), where).toBeLessThan(head.rx * 1.3 + 4);
          if (seat === 'crown') expect(at.y, where).toBeLessThan(head.y - head.ry * 0.5);
          else expect(Math.abs(at.y - head.y), where).toBeLessThan(head.ry * 1.6 + 4);
          const box =
            w.shape.type === 'box' ? w.shape : { width: w.shape.radius * 2, height: w.shape.radius * 2 };
          const wide = (seat === 'crown' ? box.width : Math.max(box.width, box.height)) * PPM;
          const want = Math.max(0.3, Math.min(2.5, (head.rx * 2 * FIT[seat]) / wide));
          expect(Math.abs(at.scale / want - 1), where).toBeLessThan(0.15);
        } else if (seat === 'back') {
          expect(Math.abs(at.x - def.wear.back[0] * PPM), where).toBeLessThan(r);
          expect(at.y, where).toBeLessThan(r * 0.2);
        } else if (seat === 'feet') {
          expect(at.y, where).toBeGreaterThan(0);
        }
      });
      s.destroy({ children: true });
    }
  });

  it('the def’s head matches the drawn head, so drops and drawings agree', () => {
    for (const def of BUGS.all) {
      const s = dressed(def, [CONTENT.items.get('item_hat_acorn_cap')]);
      const hat = s.wornAt.get(1)!;
      const head = restHead(def);
      // The hat sits within the head's width of where the def puts the head.
      expect(Math.abs(hat.x - head.x), def.id).toBeLessThan(Math.max(head.rx, 10) * 1.2);
      s.destroy({ children: true });
    }
  });
});

describe('special forms', () => {
  it('Rollo curled: the hat perches on the ball, upright, outside the hidden rig', () => {
    const rollo = BUGS.get('bug_pillbug_rollo');
    const s = dressed(
      rollo,
      [CONTENT.items.get('item_hat_tiny_top_hat')],
      frame({ face: { ...REST_FRAME.face, form: 'curled' }, angle: 2 }),
    );
    const at = s.wornAt.get(1)!;
    expect(at.hidden).toBe(false);
    expect(at.x).toBeCloseTo(0, 5);
    expect(at.y).toBeLessThan(-rollo.radius * PPM);
    const sprite = s.wornSprites()[0]!.sprite;
    // Its layer is shown even though the rig (inside the spin layer) is not.
    expect(sprite.parent!.visible).toBe(true);
    expect(sprite.parent!.parent!.visible).toBe(true);
    s.destroy({ children: true });
  });

  it('Glorp in his shell: the hat sits on the shell, and glasses hide', () => {
    const glorp = BUGS.get('bug_snail_glorp');
    const items = [CONTENT.items.get('item_hat_wizard'), CONTENT.items.get('item_acc_sunglasses')];
    const s = dressed(glorp, items, frame({ face: { ...REST_FRAME.face, form: 'in_shell' } }));
    expect(s.wornAt.get(1)!.hidden).toBe(false);
    expect(s.wornAt.get(1)!.y).toBeLessThan(-glorp.radius * PPM);
    expect(s.wornAt.get(2)!.hidden).toBe(true);
    s.destroy({ children: true });
  });

  it('Munch as a cocoon wears it on top; as a butterfly, on his head', () => {
    const munch = BUGS.get('bug_caterpillar_munch');
    const hat = [CONTENT.items.get('item_hat_party_cone')];
    const cocoon = dressed(munch, hat, frame({ morph: 'cocoon' }));
    expect(cocoon.wornAt.get(1)!.y).toBeLessThan(-munch.radius * PPM * 1.5);
    const fly = dressed(munch, hat, frame({ morph: 'butterfly' }));
    expect(fly.wornAt.get(1)!.hidden).toBe(false);
    cocoon.destroy({ children: true });
    fly.destroy({ children: true });
  });

  it('a hat follows the head as it moves (Munch inching, Prim posing)', () => {
    const munch = BUGS.get('bug_caterpillar_munch');
    const hat = [CONTENT.items.get('item_hat_acorn_cap')];
    const a = dressed(
      munch,
      hat,
      frame({ mode: 'st_wander', pose: { ...REST_FRAME.pose, legPhase: 0, stride: 1 } }),
    );
    const b = dressed(
      munch,
      hat,
      frame({ mode: 'st_wander', pose: { ...REST_FRAME.pose, legPhase: 1.6, stride: 1 } }),
    );
    expect(a.wornAt.get(1)!.x).not.toBeCloseTo(b.wornAt.get(1)!.x, 1);
    a.destroy({ children: true });
    b.destroy({ children: true });
  });

  it('placement is pure: no head means the top', () => {
    const dot = BUGS.get('bug_ladybug_dot');
    const p = placeWorn(dot, CONTENT.items.get('item_hat_acorn_cap'), {
      head: null,
      top: { x: 3, y: -40 },
      ball: false,
      back: { x: 0, y: -30 },
      feet: { x: 0, y: 50 },
    });
    expect(p.x).toBe(3);
    expect(p.y).toBeLessThan(-40);
  });
});
