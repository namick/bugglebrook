import { describe, expect, it } from 'vitest';
import { HOUR } from '../../src/game/systems/sky';
import {
  NO_WEATHER,
  easeWeather,
  multiply,
  skyLook,
  weatherTarget,
} from '../../src/renderer/src/render/skyLook';
import { dropCount, mistAt, RAIN_NEAR } from '../../src/renderer/src/render/weatherView';
import { dialAngle, dialMinutes, DIAL } from '../../src/renderer/src/render/fixtureArt';
import { arcPosition } from '../../src/renderer/src/render/background';

// M6's look: the day's palette, weather grading, and the sundial's math (pure).

const channels = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const gap = (a: number, b: number): number =>
  Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i]!)));
const light = (c: number): number => {
  const [r, g, b] = channels(c);
  return r! * 0.3 + g! * 0.55 + b! * 0.15;
};

describe('the day palette', () => {
  it('uses the doc colors: day sky #8FD3F0 over #BFE7F5, night #1C1F4A over #2C2F5E, dusk low #FF9F5A', () => {
    const noon = skyLook(12);
    expect(noon.skyTop).toBe(0x8fd3f0);
    expect(noon.skyBottom).toBe(0xbfe7f5);
    expect(noon.near).toBe(0xffffff);
    const night = skyLook(23);
    expect(night.skyTop).toBe(0x1c1f4a);
    expect(night.skyBottom).toBe(0x2c2f5e);
    expect(skyLook(18.1).skyBottom).toBe(0xff9f5a);
  });

  it('changes smoothly: no minute differs much from the one before', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const a = skyLook(m / 60);
      const b = skyLook((m + 1) / 60);
      for (const k of ['skyTop', 'skyBottom', 'near', 'far', 'mid', 'front'] as const)
        expect(gap(a[k], b[k]), `${k} at minute ${m}`).toBeLessThan(12);
      expect(Math.abs(a.stars - b.stars)).toBeLessThan(0.05);
    }
  });

  it('keeps night cozy: dimmer and bluer, but never dark enough to lose a bug', () => {
    const night = skyLook(1);
    expect(light(night.near)).toBeGreaterThan(110);
    const [r, , b] = channels(night.near);
    expect(b!).toBeGreaterThan(r!);
    expect(night.stars).toBe(1);
    expect(night.glow).toBeGreaterThan(0.8);
    expect(skyLook(12).glow).toBe(0);
  });

  it('warms the light at dusk and pinks the sky at dawn', () => {
    const [r, g, b] = channels(skyLook(18.2).near);
    expect(r!).toBeGreaterThan(b!);
    expect(r!).toBeGreaterThan(g!);
    const dawn = channels(skyLook(5.6).skyBottom);
    expect(dawn[0]!).toBeGreaterThan(dawn[1]!);
  });

  it('shows the sun by day and the moon by night, riding their arcs', () => {
    expect(skyLook(12).sun.alpha).toBe(1);
    expect(skyLook(12).moon.alpha).toBe(0);
    expect(skyLook(0).moon.alpha).toBe(1);
    expect(skyLook(0).sun.alpha).toBe(0);
    expect(skyLook(8).sun.t).toBeLessThan(skyLook(16).sun.t);
    const noon = arcPosition(0.5);
    const rise = arcPosition(0);
    expect(noon.y).toBeLessThan(rise.y);
  });
});

describe('weather grading', () => {
  it('cloudy is 30 percent less saturated; rain is greyer and a little darker', () => {
    const clear = skyLook(12);
    const cloudy = skyLook(12, weatherTarget('weather_cloudy'));
    const rain = skyLook(12, weatherTarget('weather_rain'));
    const sat = (c: number): number => Math.max(...channels(c)) - Math.min(...channels(c));
    expect(sat(cloudy.skyTop)).toBeLessThan(sat(clear.skyTop) * 0.8);
    expect(light(rain.near)).toBeLessThan(light(clear.near));
    expect(light(rain.near)).toBeGreaterThan(150);
    expect(rain.cover).toBeGreaterThan(0.9);
    expect(rain.sun.alpha).toBeLessThan(0.1);
  });

  it('eases toward the weather instead of snapping', () => {
    let mix = NO_WEATHER;
    const target = weatherTarget('weather_rain');
    mix = easeWeather(mix, target, 1 / 60, 4);
    expect(mix.rain).toBeGreaterThan(0);
    expect(mix.rain).toBeLessThan(0.05);
    for (let i = 0; i < 60 * 10; i++) mix = easeWeather(mix, target, 1 / 60, 4);
    expect(mix.rain).toBe(1);
  });

  it('multiplies colors channel by channel', () => {
    expect(multiply(0xffffff, 0x123456)).toBe(0x123456);
    expect(multiply(0x808080, 0xff0000)).toBe(0x800000);
  });

  it('mist gathers at dawn and is gone by mid-morning; rain drops stay within budget', () => {
    expect(mistAt(6.2, 0)).toBeGreaterThan(0.8);
    expect(mistAt(9, 0)).toBe(0);
    expect(mistAt(14, 1)).toBeGreaterThan(0);
    expect(dropCount(1, RAIN_NEAR)).toBe(RAIN_NEAR);
    expect(dropCount(2, RAIN_NEAR)).toBe(RAIN_NEAR);
    expect(dropCount(0, RAIN_NEAR)).toBe(0);
  });
});

describe('the sundial', () => {
  it('points its shadow at the painted sun at noon and the moon at midnight', () => {
    expect(Math.cos(dialAngle(12 * HOUR))).toBeCloseTo(-1);
    expect(Math.cos(dialAngle(0))).toBeCloseTo(1);
  });

  it('counts a clockwise quarter turn of the rim as six hours forward, and back as negative', () => {
    const c = { x: 0, y: 0 };
    const top = { x: 0, y: -DIAL.ry };
    const right = { x: DIAL.rx, y: 0 };
    expect(dialMinutes(c.x, c.y, top, right)).toBeCloseTo(6 * 60);
    expect(dialMinutes(c.x, c.y, right, top)).toBeCloseTo(-6 * 60);
  });
});
