import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawEffect, drawGroupIcon, drawTabIcon, potionDrops } from '../../src/renderer/src/journal/entryArt';
import { CONTENT } from '../../src/game/data';
import { MAP_AREAS, PAGE_IDS } from '../../src/game';
import type { JournalBook } from '../../src/game';
import { Sim } from '../../src/game/sim';
import type { SaveFile } from '../../src/game';
import { SAVE_VERSION } from '../../src/game';
import {
  BUGS_PER_SIDE,
  ITEMS_PER_SIDE,
  PHOTO_PAGE_KEEP,
  POTIONS_PER_SIDE,
  badgeText,
  firstSpreadOf,
  jarDotCount,
  jarDots,
  mapLayout,
  pageCounts,
  percentText,
  secretAreas,
  secretJar,
  sidesOf,
  spreadEntries,
  spreadsOf,
  withSeen,
} from '../../src/renderer/src/journal/layout';
import { slotPicture } from '../../src/renderer/src/ui/slotSign';
import { predictExtra } from '../../src/renderer/src/journal/sides';

/** A sim with a few finds, stepped so the journal writes them down. */
function foundSome(): Sim {
  const sim = Sim.create();
  sim.findSecret('secret_sun_shades', 70, 5);
  const berry = sim.views().find((v) => v.kind === 'item');
  if (berry) sim.send({ type: 'grab', x: berry.x, y: berry.y });
  sim.step();
  sim.step();
  return sim;
}

function drawn(g: Graphics): boolean {
  const b = g.getLocalBounds();
  return g.context.instructions.length > 0 && b.width > 1 && b.height > 1;
}

describe('journal art', () => {
  it('draws every tab, item group, and potion effect', () => {
    for (const page of [...PAGE_IDS, 'home' as const]) {
      const g = new Graphics();
      drawTabIcon(g, page, 60);
      expect(drawn(g), page).toBe(true);
    }
    for (const group of ['food', 'toys', 'music', 'hats', 'paints', 'treasures', 'stuff']) {
      const g = new Graphics();
      drawGroupIcon(g, group, 60);
      expect(drawn(g), group).toBe(true);
    }
    const dot = CONTENT.bugs.get('bug_ladybug_dot');
    for (const p of CONTENT.potions.all) {
      const g = new Graphics();
      drawEffect(g, p.effect, 100, dot);
      expect(drawn(g), p.id).toBe(true);
      expect(potionDrops(p.recipe, p.effect).length).toBeGreaterThan(0);
    }
  });
});

describe('journal pages', () => {
  const book = (): JournalBook => Sim.create().book();

  it('puts 4 bug cards and 12 items on a spread, and never mixes item groups', () => {
    const b = book();
    const bugs = sidesOf(b, 'page_bugs', 0);
    expect(bugs.length).toBe(Math.ceil(b.bugs.length / BUGS_PER_SIDE));
    const items = sidesOf(b, 'page_items', 0);
    const shown = items.flatMap((s) => (s.kind === 'items' ? s.entries : []));
    expect(shown.sort((x, y) => x - y)).toEqual(b.items.map((_, i) => i));
    for (let i = 0; i < items.length; i += 2) {
      const pair = [items[i], items[i + 1]].filter((s) => s?.kind === 'items');
      expect(new Set(pair.map((s) => (s?.kind === 'items' ? s.group : ''))).size).toBe(1);
      for (const s of pair)
        if (s?.kind === 'items') expect(s.entries.length).toBeLessThanOrEqual(ITEMS_PER_SIDE);
    }
    // Each group starts on a left page.
    items.forEach((s, i) => {
      if (s.kind === 'items' && s.first) expect(i % 2).toBe(0);
    });
  });

  it('starts the potions with the essence chart, then every potion once', () => {
    const b = book();
    const sides = sidesOf(b, 'page_potions', 0);
    expect(sides[0]!.kind).toBe('essences');
    const shown = sides.flatMap((s) => (s.kind === 'potions' ? s.entries : []));
    expect(shown).toEqual(b.potions.map((_, i) => i));
    for (const s of sides)
      if (s.kind === 'potions') expect(s.entries.length).toBeLessThanOrEqual(POTIONS_PER_SIDE);
  });

  it('groups secrets by area in map order, one mystery a page, and the map across a spread', () => {
    const b = book();
    const areas = secretAreas(b);
    expect(areas).toEqual(MAP_AREAS.filter((a) => b.secrets.some((e) => e.group === a)));
    const sides = sidesOf(b, 'page_secrets', 0);
    const shown = sides.flatMap((s) => (s.kind === 'secrets' ? s.entries.map((i) => b.secrets[i]!) : []));
    expect(shown.length).toBe(b.secrets.length);
    for (const s of sides)
      if (s.kind === 'secrets') for (const i of s.entries) expect(b.secrets[i]!.group).toBe(s.area);
    expect(sidesOf(b, 'page_mysteries', 0).length).toBe(b.mysteries.length);
    expect(sidesOf(b, 'page_map', 0).map((s) => s.kind)).toEqual(['map', 'map']);
  });

  it('keeps the last 60 photos, three to a page, and an empty page before the first', () => {
    const b = book();
    expect(sidesOf(b, 'page_photos', 0)).toEqual([{ kind: 'photos', photos: [] }]);
    const sides = sidesOf(b, 'page_photos', 75);
    const shown = sides.flatMap((s) => (s.kind === 'photos' ? s.photos : []));
    expect(shown.length).toBe(PHOTO_PAGE_KEEP);
    expect(shown[0]).toBe(0);
  });

  it('opens on the jar, and every tab has a first spread in order', () => {
    const b = book();
    const spreads = spreadsOf(b, 4);
    expect(spreads[0]!.page).toBeNull();
    expect(spreads[0]!.left.kind).toBe('jar');
    let last = 0;
    for (const page of PAGE_IDS) {
      const i = firstSpreadOf(spreads, page);
      expect(i, page).toBeGreaterThan(last);
      expect(spreads[i]!.page).toBe(page);
      expect(spreads[i]!.index).toBe(0);
      last = i;
    }
    for (const s of spreads) expect(s.index).toBeLessThan(s.count);
  });

  it('shows a find as new until it is seen, and the badge counts down with what was looked at', () => {
    const sim = foundSome();
    const b = sim.book();
    expect(b.newCount).toBeGreaterThan(0);
    const secret = b.secrets.find((e) => e.id === 'secret_sun_shades')!;
    expect(secret.state).toBe('discovered');
    expect(secret.isNew).toBe(true);
    const spreads = spreadsOf(b, 0);
    const on = spreads.find((s) => spreadEntries(b, s).some((e) => e.key === secret.key))!;
    expect(on.page).toBe('page_secrets');
    const seen = withSeen(b, new Set([secret.key]));
    expect(seen.newCount).toBe(b.newCount - 1);
    expect(seen.fresh.page_secrets).toBe(b.fresh.page_secrets - 1);
    expect(seen.secrets.find((e) => e.key === secret.key)!.isNew).toBe(false);
    // Once the sim takes the command, its own book agrees.
    sim.send({ type: 'journal_seen', keys: [secret.key] });
    sim.step();
    expect(sim.book().fresh.page_secrets).toBe(seen.fresh.page_secrets);
    const all = withSeen(
      b,
      new Set([...b.secrets, ...b.items, ...b.areas, ...b.bugs.map((c) => c.entry)].map((e) => e.key)),
    );
    expect(all.newCount).toBe(0);
    expect(badgeText(all.newCount)).toBeNull();
  });

  it('counts each tab, and says the badge and percentage plainly', () => {
    const b = book();
    const c = pageCounts(b, 3);
    expect(c.page_items.total).toBe(b.items.length);
    expect(c.page_photos.found).toBe(3);
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe('7');
    expect(badgeText(150)).toBe('99+');
    expect(percentText(0, 253)).toBe('0%');
    expect(percentText(1, 253)).toBe('0%');
    expect(percentText(252, 253)).toBe('99%');
    expect(percentText(253, 253)).toBe('100%');
  });
});

describe('the jar', () => {
  it('shows one dot for the first find and fills only when everything is found', () => {
    expect(jarDotCount(0, 200, 60)).toBe(0);
    expect(jarDotCount(1, 200, 60)).toBe(1);
    expect(jarDotCount(100, 200, 60)).toBe(30);
    expect(jarDotCount(199, 200, 60)).toBe(59);
    expect(jarDotCount(200, 200, 60)).toBe(60);
  });

  it('packs dots inside the jar from the bottom up, the same every time', () => {
    const dots = jarDots(40, 200, 260, 10);
    expect(dots).toEqual(jarDots(40, 200, 260, 10));
    expect(dots.length).toBe(40);
    for (const d of dots) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(130);
    }
    expect(dots[0]!.y).toBeGreaterThan(dots[39]!.y);
    // A jar can only hold so many.
    expect(jarDots(10000, 60, 60, 10).length).toBeLessThan(100);
  });

  it("fills the menu sign's jar with the share of findable secrets found", () => {
    const sim = Sim.create();
    const countable = CONTENT.secrets.all.filter((d) => !d.blocked);
    expect(secretJar(CONTENT, []).fill).toBe(0);
    expect(secretJar(CONTENT, undefined).total).toBe(countable.length);
    const one = secretJar(CONTENT, [countable[0]!.id, countable[0]!.id, 'secret_made_up']);
    expect(one.found).toBe(1);
    const blocked = CONTENT.secrets.all.find((d) => d.blocked);
    if (blocked) expect(secretJar(CONTENT, [blocked.id]).found).toBe(0);
    expect(
      secretJar(
        CONTENT,
        countable.map((d) => d.id),
      ).fill,
    ).toBe(1);
    sim.findSecret('secret_sun_shades', 70, 5);
    sim.step();
    const save: SaveFile = {
      version: SAVE_VERSION,
      savedAt: '2026-10-01T00:00:00.000Z',
      world: sim.serialize(),
      view: { cameraX: 40 },
      meta: { createdAt: '2026-10-01T00:00:00.000Z', thumb: null },
    };
    expect(slotPicture(save).fill).toBeCloseTo(1 / countable.length);
    // An old save without a journal still fills from its secrets.
    const old = { ...save, world: { ...save.world, journal: undefined } };
    expect(slotPicture(old).fill).toBeCloseTo(1 / countable.length);
  });
});

describe('the map', () => {
  it('lays the strip out in proportion, left to right, with the hidden places below', () => {
    const span = (id: string): { x0: number; x1: number } | null => {
      const d = CONTENT.areas.tryGet(id);
      return d ? { x0: d.xStart, x1: d.xEnd } : null;
    };
    const areas = mapLayout(span, 1300, 250, 170, 90);
    expect(areas.map((a) => a.id)).toEqual([...MAP_AREAS]);
    const strip = areas.filter((a) => !a.hidden);
    expect(strip[0]!.x).toBeCloseTo(0);
    expect(strip[strip.length - 1]!.x + strip[strip.length - 1]!.w).toBeCloseTo(1300);
    for (let i = 1; i < strip.length; i++) expect(strip[i]!.x).toBeCloseTo(strip[i - 1]!.x + strip[i - 1]!.w);
    // The plaza is wider than the pond, as in the world.
    const w = (id: string): number => areas.find((a) => a.id === id)!.w;
    expect(w('area_stump_plaza')).toBeGreaterThan(w('area_puddle_pond'));
    for (const h of areas.filter((a) => a.hidden)) {
      expect(h.y).toBeGreaterThanOrEqual(250);
      expect(h.x).toBeGreaterThanOrEqual(-1);
      expect(h.x + h.w).toBeLessThanOrEqual(1301);
    }
    // The ant hill sits under the plaza.
    const ant = areas.find((a) => a.id === 'area_ant_hill_depths')!;
    const plaza = areas.find((a) => a.id === 'area_stump_plaza')!;
    expect(ant.x + ant.w / 2).toBeCloseTo(plaza.x + plaza.w / 2);
  });

  it("predicts a sparkling secret's extra pictogram as its area", () => {
    const b = Sim.create().book();
    const e = b.secrets.find((s) => !s.hint.includes(s.group))!;
    expect(predictExtra(e)).toBe(e.group);
    expect(predictExtra(b.items[0]!)).toBeNull();
  });
});
