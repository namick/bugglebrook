import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../src/game/constants';
import { CONTENT } from '../../src/game/data';
import {
  DEFAULT_SKY,
  DEFAULT_WORLD,
  SKY_MOMENTS,
  SKY_RULES,
  TONE_MAX,
  WORLD_SWATCHES,
  colorDistance,
  fromHsl,
  hexColor,
  luma,
  parseColor,
  parseSky,
  parseWorld,
  skyJson,
  toHsl,
  toneColor,
  worldJson,
} from '../../src/renderer/src/art/backdropData';
import type { StripEntry, ToneAnchor } from '../../src/renderer/src/art/backdropData';
import { setOfPath, skyOf, stripsOf, worldOf } from '../../src/renderer/src/art/backdropStore';
import type { LoadedBackdrop } from '../../src/renderer/src/art/backdropStore';
import { SunflowerLive } from '../../src/renderer/src/render/areaArt/barrierLive';
import { FLOWERBED } from '../../src/renderer/src/render/areaArt/flowerbed';
import { FlowerbedLive } from '../../src/renderer/src/render/areaArt/flowerbedLive';
import type { AreaLive } from '../../src/renderer/src/render/areaArt/live';
import { ARCADE } from '../../src/renderer/src/render/areaArt/treehouse';
import { PARALLAX } from '../../src/renderer/src/render/background';
import { OUTLINE } from '../../src/renderer/src/render/palette';
import { Particles } from '../../src/renderer/src/render/particles';
import { POND_COLORS } from '../../src/renderer/src/render/pondArt';
import { NO_WEATHER, roomLook, skyLook, weatherTarget } from '../../src/renderer/src/render/skyLook';
import {
  STRIP_BLEND,
  STRIP_PARALLAX,
  cameraMax,
  chunkPlan,
  frontRange,
  neverSeen,
  seenSummary,
  stripFileFor,
  stripSpans,
  surfaceAreas,
} from '../../src/renderer/src/render/stripLayout';
import { NO_TONE, makeTone, toneGraphics } from '../../src/renderer/src/render/worldTone';

// An art set's backdrop, the pure parts: reading its sky and world style,
// the tone map's color math, where its strips sit, and which art a stretch
// of a layer is drawn from.

const AREAS = CONTENT.areas.all;
const errors = (m: { level: string }[]): number => m.filter((x) => x.level === 'error').length;
const warnings = (m: { level: string }[]): number => m.filter((x) => x.level === 'warning').length;

describe('colors', () => {
  it('reads #rrggbb and nothing else', () => {
    expect(parseColor('#8fd3f0')).toBe(0x8fd3f0);
    expect(parseColor('#8FD3F0')).toBe(0x8fd3f0);
    expect(hexColor(0x00ff0a)).toBe('#00ff0a');
    for (const bad of ['8fd3f0', '#fff', 'red', 0x8fd3f0, null, undefined])
      expect(parseColor(bad)).toBeNull();
  });

  it('goes to hue, saturation, lightness and back', () => {
    for (const [, c] of WORLD_SWATCHES) {
      const { h, s, l } = toHsl(c);
      expect(colorDistance(fromHsl(h, s, l), c), hexColor(c)).toBeLessThanOrEqual(1);
    }
    expect(Math.round(toHsl(0x5aa845).h)).toBe(107);
    expect(toHsl(0x808080).chroma).toBe(0);
  });
});

describe("a set's sky", () => {
  it('is the game own sky when the file is empty, and keeps the colors the doc names', () => {
    const { sky, messages } = parseSky({});
    expect(messages).toEqual([]);
    expect(sky).toEqual(DEFAULT_SKY);
    expect(DEFAULT_SKY.moments.day.skyTop).toBe(0x8fd3f0);
    expect(DEFAULT_SKY.moments.night.skyBottom).toBe(0x2c2f5e);
    expect(DEFAULT_SKY.moments.dusk.skyBottom).toBe(0xff9f5a);
  });

  it('writes out and reads back unchanged, and the game own sky passes its own rules', () => {
    const { sky, messages } = parseSky(JSON.parse(JSON.stringify(skyJson(DEFAULT_SKY))));
    expect(messages).toEqual([]);
    expect(sky).toEqual(DEFAULT_SKY);
  });

  it('takes any part of a moment and leaves the rest', () => {
    const { sky, messages } = parseSky({
      moments: { day: { skyTop: '#3fd07a', stars: 0.2 } },
      sun: { disc: '#ff7ad0' },
      stars: ['#ffb0f0'],
      rainbow: ['#ff0000', '#00ff00', '#0000ff'],
      rooms: { depths: { night: '#804020' } },
    });
    expect(messages).toEqual([]);
    expect(sky!.moments.day.skyTop).toBe(0x3fd07a);
    expect(sky!.moments.day.stars).toBe(0.2);
    expect(sky!.moments.day.skyBottom).toBe(DEFAULT_SKY.moments.day.skyBottom);
    expect(sky!.moments.dusk).toEqual(DEFAULT_SKY.moments.dusk);
    expect(sky!.sun).toEqual({ ...DEFAULT_SKY.sun, disc: 0xff7ad0 });
    expect(sky!.stars).toEqual([0xffb0f0]);
    expect(sky!.rainbow).toHaveLength(3);
    expect(sky!.rooms.depths).toEqual({ day: DEFAULT_SKY.rooms.depths.day, night: 0x804020 });
    expect(sky!.rooms.hollow).toEqual(DEFAULT_SKY.rooms.hollow);
  });

  it('refuses names and values it does not know, and says which', () => {
    for (const [bad, word] of [
      [{ moment: {} }, 'moment'],
      [{ moments: { noon: {} } }, 'noon'],
      [{ moments: { day: { sky: '#ffffff' } } }, 'sky'],
      [{ moments: { day: { skyTop: 'blue' } } }, 'skyTop'],
      [{ moments: { day: { stars: 2 } } }, 'stars'],
      [{ sun: { face: '#ffffff' } }, 'face'],
      [{ stars: [] }, 'stars'],
      [{ rainbow: ['#ffffff'] }, 'rainbow'],
      [{ shooting: 5 }, 'shooting'],
      [{ rooms: { attic: {} } }, 'attic'],
      [[], 'object'],
    ] as const) {
      const { sky, messages } = parseSky(bad);
      expect(sky, JSON.stringify(bad)).toBeNull();
      expect(messages.map((m) => m.text).join(' '), JSON.stringify(bad)).toContain(word);
    }
  });

  it('keeps night reading as night and day as day', () => {
    // Daylight that dark would switch the night lights on at noon.
    expect(parseSky({ moments: { day: { near: '#a0a0a0' } } }).sky).toBeNull();
    // A light cast on the day is fine.
    expect(parseSky({ moments: { day: { near: '#f6ecff' } } }).sky).not.toBeNull();
    // Night too bright to be night, and too dark to see the bugs.
    expect(parseSky({ moments: { night: { near: '#e0e0e0' } } }).sky).toBeNull();
    expect(parseSky({ moments: { late_night: { near: '#303030' } } }).sky).toBeNull();
    // A night sky as bright as the day's.
    const bright = parseSky({ moments: { night: { skyTop: '#8fd3f0', skyBottom: '#bfe7f5' } } });
    expect(bright.sky).toBeNull();
    expect(bright.messages[0]!.text).toMatch(/clearly darker/);
    // A dark day sky is allowed while night is darker still.
    const alien = parseSky({
      moments: {
        day: { skyTop: '#5a3a9a', skyBottom: '#8a6ac0' },
        night: { skyTop: '#10081c', skyBottom: '#1c1030' },
        late_night: { skyTop: '#10081c', skyBottom: '#1c1030' },
      },
    });
    expect(errors(alien.messages)).toBe(0);
    // A layer that goes black, and stars at noon, only warn.
    const dim = parseSky({ moments: { night: { far: '#101010' }, day: { stars: 0.8 } } });
    expect(dim.sky).not.toBeNull();
    expect(warnings(dim.messages)).toBe(2);
    expect(luma(DEFAULT_SKY.moments.night.near)).toBeGreaterThan(SKY_RULES.nightNear[0]);
    expect(luma(DEFAULT_SKY.moments.night.near)).toBeLessThan(SKY_RULES.nightNear[1]);
  });
});

describe('the look in a set sky', () => {
  // The day's keys as they were before a sky could come from a set: [hour, skyTop, far, near, cloud, stars].
  const WAS: readonly (readonly [number, number, number, number, number, number])[] = [
    [0, 0x1c1f4a, 0x3e4686, 0x7d86c4, 0x5d6399, 1],
    [4.4, 0x181a48, 0x434b8c, 0x8089c6, 0x61679e, 1],
    [5.3, 0x3c3f86, 0x8a7fb8, 0xc0b4dc, 0xf2a9c2, 0.45],
    [6.2, 0x86b4ea, 0xd8c8e6, 0xf6ecf0, 0xffe0ea, 0],
    [7.2, 0x8fd3f0, 0xffffff, 0xffffff, 0xffffff, 0],
    [15, 0x8fd3f0, 0xffffff, 0xffffff, 0xffffff, 0],
    [16.6, 0x8fd0ee, 0xfff6e8, 0xfffaf2, 0xfffaf0, 0],
    [18.1, 0x8c8ad0, 0xffb898, 0xffdcbc, 0xffc08a, 0],
    [19.1, 0x4a3f94, 0xb88ab8, 0xe0b6c6, 0xf29a9a, 0.2],
    [19.85, 0x282a6a, 0x5c5a9c, 0x9c98cc, 0x8a78b0, 0.7],
    [20.6, 0x1c1f4a, 0x3e4686, 0x7d86c4, 0x5d6399, 1],
  ];

  it('is unchanged for the game own sky at every key hour', () => {
    for (const [h, skyTop, far, near, cloud, stars] of WAS) {
      const look = skyLook(h);
      expect([look.skyTop, look.far, look.near, look.cloud, look.stars], `hour ${h}`).toEqual([
        skyTop,
        far,
        near,
        cloud,
        stars,
      ]);
    }
    for (let h = 0; h < 24; h += 0.37) {
      expect(skyLook(h, NO_WEATHER, DEFAULT_SKY)).toEqual(skyLook(h));
      expect(skyLook(h, weatherTarget('weather_rain'), DEFAULT_SKY)).toEqual(
        skyLook(h, weatherTarget('weather_rain')),
      );
    }
    // The low sun's color is what it always was.
    expect(skyLook(5.4).sun.color).toBe(0xff8a3d);
    expect(skyLook(12).sun.color).toBe(0xffd84d);
  });

  const { sky } = parseSky({
    moments: {
      day: { skyTop: '#3fd07a', skyBottom: '#d8ff9a', near: '#f6ecff', far: '#ffe8f0', cloud: '#ffd0f0' },
      night: { skyTop: '#2a0a3a', skyBottom: '#4a1450', near: '#9a7ac8', far: '#5a3a8a' },
      late_night: { skyTop: '#2a0a3a', skyBottom: '#4a1450', near: '#9a7ac8' },
    },
    sun: { disc: '#ff7ad0' },
    rooms: { depths: { day: '#c0ffc0', night: '#80c080' }, hollow: { day: '#ffc0ff', night: '#c080c0' } },
  });

  it('takes its colors from the set', () => {
    const noon = skyLook(12, NO_WEATHER, sky!);
    expect(noon.skyTop).toBe(0x3fd07a);
    expect(noon.skyBottom).toBe(0xd8ff9a);
    expect(noon.near).toBe(0xf6ecff);
    expect(noon.far).toBe(0xffe8f0);
    expect(noon.cloud).toBe(0xffd0f0);
    expect(noon.sun.color).toBe(0xff7ad0);
    const night = skyLook(23, NO_WEATHER, sky!);
    expect(night.skyTop).toBe(0x2a0a3a);
    expect(night.near).toBe(0x9a7ac8);
    // Moments the set left alone are the game's.
    expect(skyLook(18.1, NO_WEATHER, sky!).skyBottom).toBe(0xff9f5a);
  });

  it('still reads as night after dark and as day at noon', () => {
    const noon = skyLook(12, NO_WEATHER, sky!);
    const night = skyLook(23, NO_WEATHER, sky!);
    // Night lights come on by how dark the near tint is: off at noon, on at night.
    expect(noon.glow).toBeLessThan(0.1);
    expect(noon.dapple).toBeGreaterThan(0.8);
    expect(night.glow).toBeGreaterThan(0.6);
    expect(night.stars).toBe(1);
    expect(night.moon.alpha).toBe(1);
    expect(night.sun.alpha).toBe(0);
    expect(luma(night.skyTop)).toBeLessThan(luma(noon.skyTop) * SKY_RULES.nightSky);
  });

  it('still reads as rain in the rain: greyer, darker, cloud cover, no sun', () => {
    const clear = skyLook(12, NO_WEATHER, sky!);
    const rain = skyLook(12, weatherTarget('weather_rain'), sky!);
    const sat = (c: number): number => toHsl(c).s;
    expect(sat(rain.skyTop)).toBeLessThan(sat(clear.skyTop));
    expect(luma(rain.near)).toBeLessThan(luma(clear.near));
    expect(luma(rain.far)).toBeLessThan(luma(clear.far));
    expect(rain.cover).toBeGreaterThan(0.9);
    expect(rain.sun.alpha).toBeLessThan(0.05);
    // Not gloomy: the near world keeps most of its light.
    expect(luma(rain.near)).toBeGreaterThan(luma(clear.near) * 0.7);
  });

  it('eases smoothly through the day in any sky', () => {
    const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (let m = 0; m < 24 * 60; m++) {
      const a = skyLook(m / 60, NO_WEATHER, sky!);
      const b = skyLook((m + 1) / 60, NO_WEATHER, sky!);
      for (const key of ['skyTop', 'skyBottom', 'near', 'far'] as const)
        channels(a[key]).forEach((v, i) => expect(Math.abs(v - channels(b[key])[i]!)).toBeLessThanOrEqual(8));
    }
  });

  it('lights the hidden rooms with the set own colors', () => {
    expect(roomLook(skyLook(12), 'depths').near).toBe(0xf2d6bc);
    expect(roomLook(skyLook(0), 'depths', true).near).toBe(0xc9b0a4);
    expect(roomLook(skyLook(12), 'hollow').near).toBe(0xf0ecfa);
    expect(roomLook(skyLook(12), 'depths', false, sky!).near).toBe(0xc0ffc0);
    expect(roomLook(skyLook(0), 'depths', true, sky!).near).toBe(0x80c080);
    expect(roomLook(skyLook(0), 'depths', true, sky!).far).toBe(0xc0ffc0);
    expect(roomLook(skyLook(0), 'hollow', true, sky!).near).toBe(0xc080c0);
  });

  it('names every moment once in the day', () => {
    expect(new Set(SKY_MOMENTS).size).toBe(9);
    expect(Object.keys(DEFAULT_SKY.moments).sort()).toEqual([...SKY_MOMENTS].sort());
  });
});

describe('the tone map', () => {
  const GREEN_TO_VIOLET: ToneAnchor = { from: 0x5aa845, to: 0x8a5fe0, spread: 40 };
  const BROWN_TO_NAVY: ToneAnchor = { from: 0xa8744f, to: 0x3d4a7a, spread: 30 };
  const MAP = [GREEN_TO_VIOLET, BROWN_TO_NAVY];

  it('does nothing without rules', () => {
    for (const [, c] of WORLD_SWATCHES) expect(toneColor(c, [])).toBe(c);
  });

  it('lands each rule from exactly on its to', () => {
    for (const a of MAP) expect(colorDistance(toneColor(a.from, MAP), a.to)).toBeLessThanOrEqual(1);
  });

  it('leaves greys, white, black, and the outline alone', () => {
    for (const c of [0x000000, 0xffffff, 0x808080, 0xc9c9c9, OUTLINE]) expect(toneColor(c, MAP)).toBe(c);
  });

  it('leaves hues no rule covers alone', () => {
    // The pond's blue water and a pink bloom are far from green and brown.
    for (const c of [0x5cc3e6, 0x2f7fb0, 0xf28ab2]) expect(toneColor(c, MAP)).toBe(c);
  });

  it('moves a whole hue family together and keeps its shading', () => {
    // Greens of every depth, all within 20 degrees of the rule's hue.
    const greens = [0x2e6b28, 0x3f8a35, 0x4e9a3a, 0x5aa845, 0x6fbf4a, 0x8fd16f];
    const out = greens.map((c) => toneColor(c, MAP));
    const target = toHsl(GREEN_TO_VIOLET.to).h;
    out.forEach((c, i) => {
      // Each lands as far from the target hue as it was from the rule's.
      const off = toHsl(greens[i]!).h - toHsl(GREEN_TO_VIOLET.from).h;
      expect(Math.abs(toHsl(c).h - (target + off)), hexColor(greens[i]!)).toBeLessThan(3);
    });
    // Darker stays darker.
    for (let i = 1; i < out.length; i++)
      expect(toHsl(out[i]!).l, hexColor(greens[i]!)).toBeGreaterThan(toHsl(out[i - 1]!).l);
  });

  it('eases off past half the spread', () => {
    const turned = (c: number): number => Math.abs(toHsl(toneColor(c, [GREEN_TO_VIOLET])).h - toHsl(c).h);
    const full = turned(0x5aa845);
    // 139 degrees: 32 from the rule, in its easing band.
    expect(turned(0xb6e3c4)).toBeGreaterThan(5);
    expect(turned(0xb6e3c4)).toBeLessThan(full - 5);
    // 167 degrees: past the spread.
    expect(toneColor(0x7fb3a8, [GREEN_TO_VIOLET])).toBe(0x7fb3a8);
    // A wider rule takes the whole family.
    const wide = [{ ...GREEN_TO_VIOLET, spread: 70 }];
    expect(Math.abs(Math.abs(toHsl(toneColor(0xb6e3c4, wide)).h - toHsl(0xb6e3c4).h) - full)).toBeLessThan(2);
  });

  it('can fade a hue to grey', () => {
    const grey = toneColor(0x5aa845, [{ from: 0x5aa845, to: 0x808080, spread: 40 }]);
    expect(toHsl(grey).s).toBeLessThan(0.02);
  });

  it('reads world.json, with defaults for what is left out', () => {
    expect(parseWorld({})).toEqual({ world: DEFAULT_WORLD, messages: [] });
    const { world, messages } = parseWorld({
      tone: [
        { from: '#5aa845', to: '#8a5fe0' },
        { from: '#a8744f', to: '#3d4a7a', spread: 30 },
      ],
      water: { surface: '#7af0c8', deep: '#1f8a7a' },
    });
    expect(messages).toEqual([]);
    expect(world!.tone).toEqual(MAP);
    expect(world!.water).toEqual({ ...DEFAULT_WORLD.water, surface: 0x7af0c8, deep: 0x1f8a7a });
    expect(parseWorld(JSON.parse(JSON.stringify(worldJson(world!)))).world).toEqual(world);
  });

  it('refuses what it cannot use', () => {
    for (const [bad, word] of [
      [{ tones: [] }, 'tones'],
      [{ tone: {} }, 'list'],
      [{ tone: [{ from: '#5aa845' }] }, 'from'],
      [{ tone: [{ from: '#808080', to: '#ff0000' }] }, 'grey'],
      [{ tone: [{ from: '#5aa845', to: '#8a5fe0', spread: 200 }] }, 'spread'],
      [{ tone: [{ from: '#5aa845', to: '#8a5fe0', width: 20 }] }, 'width'],
      [{ tone: Array.from({ length: TONE_MAX + 1 }, () => ({ from: '#5aa845', to: '#8a5fe0' })) }, 'at most'],
      [{ water: { surface: '#102030', deep: '#8090a0' } }, 'lighter'],
      [{ water: { top: '#ffffff' } }, 'top'],
    ] as const) {
      const { world, messages } = parseWorld(bad);
      expect(world, JSON.stringify(bad)).toBeNull();
      expect(messages.map((m) => m.text).join(' '), JSON.stringify(bad)).toContain(word);
    }
  });

  it('warns when two rules pull the same hue apart', () => {
    const { world, messages } = parseWorld({
      tone: [
        { from: '#5aa845', to: '#8a5fe0', spread: 60 },
        { from: '#6fbf4a', to: '#ff8800', spread: 60 },
      ],
    });
    expect(world).not.toBeNull();
    expect(warnings(messages)).toBeGreaterThan(0);
    expect(messages[0]!.text).toMatch(/too close/);
  });

  it('lists the world colors as the code draws them', () => {
    const swatch = (name: string): number => WORLD_SWATCHES.find(([n]) => n === name)![1];
    const area = (id: string) => CONTENT.areas.get(id);
    expect(swatch('plaza moss')).toBe(area('area_stump_plaza').ground);
    expect(swatch('plaza soil and stump bark')).toBe(area('area_stump_plaza').dirt);
    expect(swatch('pond bank')).toBe(area('area_puddle_pond').ground);
    expect(swatch('pond soil and mud')).toBe(area('area_puddle_pond').dirt);
    expect(swatch('flowerbed mulch')).toBe(area('area_flowerbed_stage').ground);
    expect(swatch('porch dust')).toBe(area('area_under_porch').ground);
    expect(swatch('compost sludge')).toBe(area('area_compost_lab').ground);
    expect(swatch('treehouse planks')).toBe(ARCADE.plank);
    expect(swatch('treehouse canopy')).toBe(ARCADE.canopy);
    expect(swatch('reeds')).toBe(POND_COLORS.reed);
    expect(swatch('lily pads')).toBe(POND_COLORS.lily);
    expect(swatch('outline')).toBe(OUTLINE);
    expect(DEFAULT_WORLD.water.surface).toBe(POND_COLORS.surface);
    expect(DEFAULT_WORLD.water.deep).toBe(POND_COLORS.deep);
  });
});

describe('toning the code-drawn shapes', () => {
  const tone = makeTone([{ from: 0x5aa845, to: 0x8a5fe0, spread: 40 }]);
  const colors = (g: Graphics): number[] =>
    g.context.instructions.map((i) => (i.data as { style: { color: number } }).style.color);

  it('maps each fill and stroke once, before anything is drawn', () => {
    const root = new Container();
    const g = new Graphics();
    g.rect(0, 0, 10, 10).fill(0x5aa845).stroke({ width: 2, color: OUTLINE });
    g.circle(5, 5, 3).fill({ color: 0x2e6b28, alpha: 0.5 });
    const inner = new Container();
    const h = new Graphics().rect(0, 0, 4, 4).fill(0xffffff);
    inner.addChild(h);
    inner.tint = 0x5aa845;
    root.addChild(g, inner);
    const changed = toneGraphics(root, tone);
    expect(colors(g)).toEqual([tone(0x5aa845), OUTLINE, tone(0x2e6b28)]);
    expect(colorDistance(colors(g)[0]!, 0x8a5fe0)).toBeLessThanOrEqual(1);
    expect(colors(h)).toEqual([0xffffff]);
    expect(changed).toBe(2);
    // Alpha is the shape's own; a container's tint is light, not paint.
    expect((g.context.instructions[2]!.data as { style: { alpha: number } }).style.alpha).toBe(0.5);
    expect(inner.tint).toBe(0x5aa845);
  });

  it('maps a style two shapes share only once', () => {
    const g = new Graphics();
    g.rect(0, 0, 4, 4).fill(0x5aa845);
    // No style given: the second shape reuses the first one's.
    g.rect(8, 0, 4, 4).fill();
    toneGraphics(g, tone);
    for (const c of colors(g)) expect(c).toBe(tone(0x5aa845));
  });

  it('changes nothing without a tone map', () => {
    const g = new Graphics().rect(0, 0, 4, 4).fill(0x5aa845);
    expect(makeTone([])).toBe(NO_TONE);
    expect(toneGraphics(g, NO_TONE)).toBe(0);
    expect(colors(g)).toEqual([0x5aa845]);
  });

  it('remembers what it mapped', () => {
    expect(tone(0x5aa845)).toBe(tone(0x5aa845));
    expect(tone(0x808080)).toBe(0x808080);
  });
});

describe('live plants', () => {
  const tone = makeTone([{ from: 0x5aa845, to: 0x8a5fe0, spread: 70 }]);
  /** Every color a live view drew with this frame. */
  function drawn(live: AreaLive, sim: Sim, withTone: boolean): Set<number> {
    live.update({
      sim,
      dt: 1 / 60,
      time: 1,
      left: live.x0,
      right: live.x0 + VIEW_WIDTH_PX,
      look: skyLook(12),
      weather: NO_WEATHER,
      views: sim.views(),
      hand: null,
      particles: new Particles(),
      sound: () => undefined,
      ...(withTone ? { tone } : {}),
    });
    const out = new Set<number>();
    const walk = (c: Container): void => {
      if (c instanceof Graphics)
        for (const i of c.context.instructions) out.add((i.data as { style: { color: number } }).style.color);
      c.children.forEach((ch) => walk(ch as Container));
    };
    walk(live.back);
    walk(live.front);
    return out;
  }

  it('take the tone map on their stems and leaves and keep their petals', () => {
    const sim = Sim.create({ seed: 'live-plants' });
    const bed = new FlowerbedLive(CONTENT.areas.get('area_flowerbed_stage'));
    const plain = drawn(bed, sim, false);
    expect(plain.has(FLOWERBED.stem)).toBe(true);
    expect(plain.has(FLOWERBED.leaf)).toBe(true);
    const toned = drawn(bed, sim, true);
    expect(toned.has(FLOWERBED.stem)).toBe(false);
    expect(toned.has(FLOWERBED.leaf)).toBe(false);
    expect(toned.has(tone(FLOWERBED.stem))).toBe(true);
    expect(toned.has(tone(FLOWERBED.leaf))).toBe(true);
    // Petals are picked by color: they stay.
    for (const petal of [FLOWERBED.pink, FLOWERBED.violet, FLOWERBED.yellow]) {
      expect(plain.has(petal)).toBe(true);
      expect(toned.has(petal)).toBe(true);
    }
  });

  it('include the sunflower at the gate', () => {
    const sim = Sim.create({ seed: 'live-sunflower' });
    const flower = new SunflowerLive(sim.barriers.barrier('sunflower')!);
    expect(drawn(flower, sim, false).has(0x5ea24a)).toBe(true);
    const toned = drawn(flower, sim, true);
    expect(toned.has(0x5ea24a)).toBe(false);
    expect(toned.has(tone(0x5ea24a))).toBe(true);
    expect(toned.has(tone(0x6fbf4a))).toBe(true);
  });
});

describe('where strips sit', () => {
  it('scrolls its layers as the background does', () => {
    expect(STRIP_PARALLAX.far).toBe(PARALLAX.hills);
    expect(STRIP_PARALLAX.mid).toBe(PARALLAX.mid);
  });

  it('gives each area under the sky a stretch, edge to edge, and none to the hidden rooms', () => {
    expect(surfaceAreas(AREAS).map((a) => a.id)).toEqual([
      'area_flowerbed_stage',
      'area_puddle_pond',
      'area_stump_plaza',
      'area_under_porch',
      'area_compost_lab',
      'area_treehouse_arcade',
    ]);
    for (const layer of ['far', 'mid'] as const) {
      const spans = stripSpans(AREAS, layer);
      expect(spans).toHaveLength(6);
      expect(spans[0]!.x0).toBe(0);
      for (let i = 1; i < spans.length; i++) expect(spans[i]!.x0).toBe(spans[i - 1]!.x1);
      // The last stretch reaches what the screen shows at the far end of the surface.
      expect(spans[5]!.x1).toBe(Math.round(cameraMax(AREAS) * STRIP_PARALLAX[layer] + VIEW_WIDTH_PX));
      // Blend zones everywhere but the ends of the world.
      expect(spans.map((s) => s.left)).toEqual([0, 128, 128, 128, 128, 128]);
      expect(spans.map((s) => s.right)).toEqual([128, 128, 128, 128, 128, 0]);
    }
    expect(stripFileFor(AREAS, 'area_ant_hill_depths', 'far')).toBeNull();
    expect(stripFileFor(AREAS, 'area_gnome_hollow', 'mid')).toBeNull();
  });

  it('centers each area stretch on what the screen shows while the camera is there', () => {
    // With the camera centered on the middle of the pond, the pond's stretch is in the middle of the screen.
    const pond = CONTENT.areas.get('area_puddle_pond');
    for (const layer of ['far', 'mid'] as const) {
      const f = STRIP_PARALLAX[layer];
      const span = stripSpans(AREAS, layer).find((s) => s.area === pond.id)!;
      const cameraLeft = ((pond.xStart + pond.xEnd) / 2) * 100 - VIEW_WIDTH_PX / 2;
      const middle = cameraLeft * f + VIEW_WIDTH_PX / 2;
      expect(Math.abs((span.x0 + span.x1) / 2 - middle)).toBeLessThan(1);
      expect(span.x1 - span.x0).toBe(Math.round((pond.xEnd - pond.xStart) * 100 * f));
    }
  });

  it('sizes the canvases the art guide lists', () => {
    const size = (id: string, layer: 'far' | 'mid', scale: 1 | 2 = 2): string => {
      const s = stripFileFor(AREAS, id, layer, scale)!;
      return `${s.canvas.w}x${s.canvas.h}`;
    };
    expect(size('area_flowerbed_stage', 'far')).toBe('3430x2160');
    expect(size('area_puddle_pond', 'far')).toBe('2304x2160');
    expect(size('area_stump_plaza', 'far')).toBe('2662x2160');
    expect(size('area_under_porch', 'far')).toBe('2304x2160');
    expect(size('area_compost_lab', 'far')).toBe('2126x2160');
    expect(size('area_treehouse_arcade', 'far')).toBe('3430x2160');
    expect(size('area_flowerbed_stage', 'mid')).toBe('4640x2160');
    expect(size('area_puddle_pond', 'mid')).toBe('4032x2160');
    expect(size('area_stump_plaza', 'mid')).toBe('4736x2160');
    expect(size('area_under_porch', 'mid')).toBe('4032x2160');
    expect(size('area_compost_lab', 'mid')).toBe('3680x2160');
    expect(size('area_treehouse_arcade', 'mid')).toBe('4640x2160');
    expect(size('area_puddle_pond', 'far', 1)).toBe('1152x1080');
    // Every strip fits one texture once it is built at game size.
    for (const layer of ['far', 'mid'] as const)
      for (const a of surfaceAreas(AREAS))
        expect(stripFileFor(AREAS, a.id, layer, 1)!.canvas.w).toBeLessThanOrEqual(4096);
  });

  it('stamps a template with its geometry', () => {
    const a = stripFileFor(AREAS, 'area_puddle_pond', 'far', 2)!;
    expect(a.id).toBe('area_puddle_pond_far');
    expect(a.x).toBe(a.span.x0 - STRIP_BLEND);
    expect(a.cover).toBe(VIEW_HEIGHT_PX);
    expect(stripFileFor(AREAS, 'area_puddle_pond', 'far', 2)!.stripHash).toBe(a.stripHash);
    expect(stripFileFor(AREAS, 'area_puddle_pond', 'far', 1)!.stripHash).not.toBe(a.stripHash);
    expect(stripFileFor(AREAS, 'area_puddle_pond', 'mid', 2)!.stripHash).not.toBe(a.stripHash);
    // What is seen is the generator's finding, not geometry: it does not change the stamp.
    expect(
      stripFileFor(AREAS, 'area_puddle_pond', 'far', 2, { cover: 940, hidden: [[1700, 1800]] })!.stripHash,
    ).toBe(a.stripHash);
    // A wider pond would change it.
    const wider = AREAS.map((x) => (x.id === 'area_puddle_pond' ? { ...x, xEnd: x.xEnd + 1 } : x));
    expect(stripFileFor(wider, 'area_puddle_pond', 'far', 2)!.stripHash).not.toBe(a.stripHash);
  });
});

describe('what a chunk is drawn from', () => {
  const entry = (id: string, x0: number, x1: number, status: StripEntry['status'] = 'drawn'): StripEntry => ({
    id,
    area: id,
    layer: 'far',
    status,
    sourceHash: '',
    stripHash: '',
    span: [x0, x1],
    paint: status === 'drawn' ? { image: `${id}.png`, x: x0 - 128, y: 400, w: x1 - x0 + 256, h: 500 } : null,
    glow: null,
    report: [],
  });

  it('is all code-drawn with no strips', () => {
    expect(chunkPlan(1024, 1028, [])).toEqual({ code: [[1024, 2052]], strips: [] });
  });

  it('is all painted inside a strip stretch', () => {
    const pond = entry('pond', 1000, 3000);
    expect(chunkPlan(1024, 1028, [pond])).toEqual({ code: [], strips: [pond] });
  });

  it('falls back to code where the set has no strip, cut at the seam', () => {
    const pond = entry('pond', 1587, 2483);
    // The chunk from 1024: code up to the pond's seam, the pond after it.
    expect(chunkPlan(1024, 1028, [pond])).toEqual({ code: [[1024, 1587]], strips: [pond] });
    // The chunk from 2048: the pond up to its far seam, then code again.
    expect(chunkPlan(2048, 1028, [pond])).toEqual({ code: [[2483, 3076]], strips: [pond] });
    // A chunk that only the strip's blend zone reaches is still all code, with the strip fading in over it.
    expect(chunkPlan(2560, 500, [pond])).toEqual({ code: [[2560, 3060]], strips: [pond] });
    // Past the blend zone the strip is not drawn at all.
    expect(chunkPlan(3072, 1028, [pond])).toEqual({ code: [[3072, 4100]], strips: [] });
  });

  it('draws neighbours left to right, each over the last, with no code between them', () => {
    const a = entry('flowerbed', 0, 1587);
    const b = entry('pond', 1587, 2483);
    const plan = chunkPlan(1024, 1028, [b, a]);
    expect(plan.code).toEqual([]);
    expect(plan.strips.map((s) => s.id)).toEqual(['flowerbed', 'pond']);
  });

  it('ignores a strip that is empty or broken: that stretch stays code-drawn', () => {
    const pond = entry('pond', 1587, 2483, 'empty');
    const plaza = entry('plaza', 2483, 3558, 'broken');
    expect(chunkPlan(1024, 2000, [pond, plaza])).toEqual({ code: [[1024, 3024]], strips: [] });
  });

  it('picks the backdrop own things, or the game own', () => {
    const drawn = (id: string, layer: 'far' | 'mid') => ({
      entry: { ...entry(id, 0, 100), layer },
      paint: null,
      glow: null,
    });
    const b: LoadedBackdrop = {
      id: 'x',
      sky: null,
      world: null,
      strips: [drawn('a', 'far'), drawn('b', 'mid')],
    };
    expect(skyOf(null)).toBe(DEFAULT_SKY);
    expect(skyOf(b)).toBe(DEFAULT_SKY);
    expect(worldOf(b)).toBe(DEFAULT_WORLD);
    expect(stripsOf(null, 'far')).toEqual([]);
    expect(stripsOf(b, 'far').map((s) => s.entry.id)).toEqual(['a']);
    expect(stripsOf(b, 'mid').map((s) => s.entry.id)).toEqual(['b']);
    const sky = parseSky({ sun: { disc: '#ff7ad0' } }).sky!;
    expect(skyOf({ ...b, sky })).toBe(sky);
    expect(setOfPath('../../art/backdrop.json')).toBe('reference');
    expect(setOfPath('../../art/sets/xeno/backdrop.json')).toBe('xeno');
    expect(setOfPath('../../art/sets/xeno/backdrop/area_puddle_pond_far.png')).toBe('xeno');
  });
});

describe('what is never on screen', () => {
  const MAX = cameraMax(AREAS);

  it('finds the world in front of a spot of a layer', () => {
    // The far layer's left edge sits behind the world's left edge and nothing else.
    expect(frontRange(0, 'far', MAX)).toEqual([0, 0]);
    // One spot of the far layer passes behind a long stretch of world as the camera pans.
    const [a, b] = frontRange(3000, 'far', MAX)!;
    expect(b - a).toBeCloseTo((VIEW_WIDTH_PX / 0.28) * 0.72, 0);
    // The nearer the layer, the shorter the stretch.
    const [c, d] = frontRange(3000, 'mid', MAX)!;
    expect(d - c).toBeCloseTo((VIEW_WIDTH_PX / 0.55) * 0.45, 0);
    // Past what the camera can reach, a spot is never on screen at all.
    expect(frontRange(MAX * 0.28 + VIEW_WIDTH_PX + 10, 'far', MAX)).toBeNull();
  });

  it('marks what the ground and a wide room always cover', () => {
    // A world 12000 px wide in 40 px cells: ground below row 20, and a room over columns 100 to 200.
    const grid = { cols: 300, rows: 27, cell: 40 };
    const opaque = (col: number, row: number): boolean => row >= 20 || (col >= 100 && col < 200);
    const strip = { x: 2000, cols: 100, layer: 'mid' as const };
    const flags = neverSeen(opaque, grid, strip, 12000 - VIEW_WIDTH_PX);
    const at = (i: number, row: number): number => flags[row * strip.cols + i]!;
    // Below the ground line everything is hidden; above it, open sky shows.
    expect(at(0, 25)).toBe(1);
    expect(at(0, 5)).toBe(0);
    // The room is 4000 px wide and a mid spot passes behind 1571 px of world: its middle never shows.
    const hidden = Array.from({ length: strip.cols }, (_v, i) => at(i, 5));
    expect(hidden.some((v) => v === 1)).toBe(true);
    expect(hidden[0]).toBe(0);
    const summary = seenSummary(flags, strip, grid.rows, grid.cell, { cover: 24, hidden: 0 });
    expect(summary.cover).toBe(20 * 40 + 24);
    expect(summary.hidden).toHaveLength(1);
    const [h0, h1] = summary.hidden[0]!;
    // Layer x L sits behind world x from L + (L - 1920) / 0.55 * 0.45 to L + L / 0.55 * 0.45.
    expect(h0).toBeGreaterThanOrEqual(2000);
    expect(h1).toBeLessThanOrEqual(6000);
    for (const L of [h0 + 20, h1 - 20]) {
      const [a, b] = frontRange(L, 'mid', 12000 - VIEW_WIDTH_PX)!;
      expect(a).toBeGreaterThanOrEqual(100 * 40);
      expect(b).toBeLessThanOrEqual(200 * 40);
    }
    // With a margin the hidden stretch shrinks from both ends.
    const safe = seenSummary(flags, strip, grid.rows, grid.cell, { cover: 24, hidden: 80 });
    expect(safe.hidden[0]![0]).toBe(h0 + 80);
    expect(safe.hidden[0]![1]).toBe(h1 - 80);
  });

  it('never calls a far spot hidden behind a room narrower than its sweep', () => {
    // The far layer passes behind 4937 px of world: a 4000 px room cannot always cover it.
    const grid = { cols: 300, rows: 27, cell: 40 };
    const opaque = (col: number): boolean => col >= 100 && col < 200;
    // (The far layer is only on screen up to x 4742 in a world this wide.)
    const flags = neverSeen(opaque, grid, { x: 0, cols: 110, layer: 'far' }, 12000 - VIEW_WIDTH_PX);
    expect(flags.every((v) => v === 0)).toBe(true);
  });
});
