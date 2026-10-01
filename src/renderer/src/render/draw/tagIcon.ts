import type { Graphics } from 'pixi.js';
import { OUTLINE } from '../palette';

/**
 * A pictogram for a tag (game design doc, section 6), for the bug scope's
 * zoomed view and the Tinker Bench's tag nudges. Wordless: each is a little
 * picture of what the tag does. Drawn centered on (x, y) about `s` across.
 */
export function drawTagIcon(g: Graphics, tag: string, x: number, y: number, s: number): void {
  const u = s / 40;
  const line = { width: 3 * u, color: OUTLINE, cap: 'round' as const, join: 'round' as const };
  switch (tag) {
    case 'tag_glowing': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * 11 * u, y + Math.sin(a) * 11 * u)
          .lineTo(x + Math.cos(a) * 18 * u, y + Math.sin(a) * 18 * u)
          .stroke({ ...line, color: 0xffb627 });
      }
      g.circle(x, y, 9 * u)
        .fill(0xfff27a)
        .stroke(line);
      return;
    }
    case 'tag_magnetic': {
      g.moveTo(x - 9 * u, y - 12 * u)
        .lineTo(x - 9 * u, y + 2 * u)
        .arc(x, y + 2 * u, 9 * u, Math.PI, 0, true)
        .lineTo(x + 9 * u, y - 12 * u)
        .stroke({ width: 9 * u, color: OUTLINE, cap: 'butt' });
      g.moveTo(x - 9 * u, y - 12 * u)
        .lineTo(x - 9 * u, y + 2 * u)
        .arc(x, y + 2 * u, 9 * u, Math.PI, 0, true)
        .lineTo(x + 9 * u, y - 12 * u)
        .stroke({ width: 5 * u, color: 0xe34f4f, cap: 'butt' });
      g.rect(x - 12 * u, y - 15 * u, 6 * u, 5 * u).fill(0xdfe6f0);
      g.rect(x + 6 * u, y - 15 * u, 6 * u, 5 * u).fill(0x4d7cff);
      return;
    }
    case 'tag_sticky': {
      g.ellipse(x, y - 6 * u, 13 * u, 7 * u)
        .fill(0xf0a530)
        .stroke(line);
      g.moveTo(x - 4 * u, y - 1 * u)
        .bezierCurveTo(x - 4 * u, y + 8 * u, x + 1 * u, y + 6 * u, x + 1 * u, y + 13 * u)
        .stroke({ ...line, width: 5 * u, color: 0xf0a530 });
      g.circle(x + 1 * u, y + 14 * u, 3 * u)
        .fill(0xf0a530)
        .stroke({ ...line, width: 2 * u });
      g.ellipse(x - 4 * u, y - 8 * u, 4 * u, 2 * u).fill({ color: 0xffffff, alpha: 0.7 });
      return;
    }
    case 'tag_smelly': {
      for (const dx of [-8, 0, 8])
        g.moveTo(x + dx * u, y + 14 * u)
          .bezierCurveTo(x + (dx - 7) * u, y + 5 * u, x + (dx + 7) * u, y - 3 * u, x + dx * u, y - 14 * u)
          .stroke({ ...line, color: 0x7fa33a, width: 4 * u });
      return;
    }
    case 'tag_hot': {
      g.moveTo(x, y - 16 * u)
        .bezierCurveTo(x + 14 * u, y - 2 * u, x + 12 * u, y + 14 * u, x, y + 14 * u)
        .bezierCurveTo(x - 12 * u, y + 14 * u, x - 14 * u, y - 2 * u, x, y - 16 * u)
        .fill(0xff7a1f)
        .stroke(line);
      g.ellipse(x, y + 6 * u, 5 * u, 7 * u).fill(0xffd23f);
      return;
    }
    case 'tag_cold':
    case 'tag_frozen': {
      if (tag === 'tag_frozen')
        g.roundRect(x - 15 * u, y - 15 * u, 30 * u, 30 * u, 5 * u)
          .fill(0xd6f3ff)
          .stroke(line);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        g.moveTo(x - Math.cos(a) * 13 * u, y - Math.sin(a) * 13 * u)
          .lineTo(x + Math.cos(a) * 13 * u, y + Math.sin(a) * 13 * u)
          .stroke({ ...line, color: 0x4fb6ff, width: 4 * u });
      }
      g.circle(x, y, 3.5 * u)
        .fill(0xffffff)
        .stroke({ ...line, width: 2 * u });
      return;
    }
    case 'tag_fizzy':
    case 'tag_soapy': {
      const foam = tag === 'tag_soapy' ? 0xffffff : 0xbfefff;
      for (const [dx, dy, r] of [
        [-6, 6, 7],
        [6, 0, 6],
        [-2, -9, 5],
        [8, -12, 3],
      ] as const)
        g.circle(x + dx * u, y + dy * u, r * u)
          .fill(foam)
          .stroke({ ...line, width: 2.5 * u });
      return;
    }
    case 'tag_sparky': {
      g.poly([
        x + 4 * u,
        y - 16 * u,
        x - 8 * u,
        y + 2 * u,
        x,
        y + 2 * u,
        x - 4 * u,
        y + 16 * u,
        x + 9 * u,
        y - 4 * u,
        x + 1 * u,
        y - 4 * u,
      ])
        .fill(0xffd23f)
        .stroke(line);
      return;
    }
    case 'tag_slimy': {
      g.moveTo(x - 14 * u, y - 8 * u)
        .lineTo(x + 14 * u, y - 8 * u)
        .stroke({ ...line, width: 8 * u, color: 0x9ccc4a });
      for (const dx of [-7, 5])
        g.moveTo(x + dx * u, y - 8 * u)
          .lineTo(x + dx * u, y + (dx < 0 ? 10 : 4) * u)
          .stroke({ ...line, width: 5 * u, color: 0x9ccc4a });
      return;
    }
    case 'tag_fragile': {
      g.circle(x, y, 14 * u)
        .fill(0xe8f6ff)
        .stroke(line);
      g.moveTo(x - 4 * u, y - 14 * u)
        .lineTo(x + 2 * u, y - 4 * u)
        .lineTo(x - 3 * u, y + 2 * u)
        .lineTo(x + 4 * u, y + 13 * u)
        .stroke({ ...line, width: 2.5 * u });
      return;
    }
    case 'tag_musical': {
      g.moveTo(x + 4 * u, y + 9 * u)
        .lineTo(x + 4 * u, y - 14 * u)
        .lineTo(x + 13 * u, y - 9 * u)
        .stroke({ ...line, width: 4 * u });
      g.ellipse(x - 2 * u, y + 10 * u, 7 * u, 5 * u).fill(OUTLINE);
      return;
    }
    case 'tag_bouncy': {
      for (let i = 0; i < 4; i++)
        g.ellipse(x, y + 10 * u - i * 7 * u, 12 * u, 3.5 * u).stroke({
          ...line,
          color: 0xff5fa2,
          width: 3 * u,
        });
      g.moveTo(x - 6 * u, y - 18 * u)
        .lineTo(x, y - 24 * u)
        .lineTo(x + 6 * u, y - 18 * u)
        .stroke(line);
      return;
    }
    case 'tag_lifty': {
      g.ellipse(x, y - 4 * u, 10 * u, 12 * u)
        .fill(0xff4f5e)
        .stroke(line);
      g.moveTo(x, y + 8 * u)
        .bezierCurveTo(x - 4 * u, y + 12 * u, x + 4 * u, y + 14 * u, x, y + 18 * u)
        .stroke({ ...line, width: 2 * u });
      return;
    }
    case 'tag_seed': {
      g.ellipse(x, y, 8 * u, 13 * u)
        .fill(0x8a6a4a)
        .stroke(line);
      g.moveTo(x, y - 10 * u)
        .lineTo(x, y + 10 * u)
        .stroke({ ...line, width: 2 * u, color: 0xf4ead2 });
      return;
    }
    case 'tag_absorbent': {
      g.roundRect(x - 14 * u, y - 10 * u, 28 * u, 20 * u, 4 * u)
        .fill(0xffe066)
        .stroke(line);
      for (const [dx, dy] of [
        [-7, -3],
        [3, 2],
        [8, -5],
        [-2, 5],
      ] as const)
        g.circle(x + dx * u, y + dy * u, 2.5 * u).fill(0xd4a516);
      return;
    }
    case 'tag_wet': {
      g.moveTo(x, y - 15 * u)
        .bezierCurveTo(x + 12 * u, y, x + 10 * u, y + 13 * u, x, y + 13 * u)
        .bezierCurveTo(x - 10 * u, y + 13 * u, x - 12 * u, y, x, y - 15 * u)
        .fill(0x4fb6ff)
        .stroke(line);
      return;
    }
    case 'tag_floaty': {
      g.moveTo(x - 16 * u, y + 8 * u)
        .bezierCurveTo(x - 8 * u, y + 3 * u, x - 4 * u, y + 13 * u, x + 4 * u, y + 8 * u)
        .bezierCurveTo(x + 10 * u, y + 4 * u, x + 12 * u, y + 11 * u, x + 16 * u, y + 8 * u)
        .stroke({ ...line, color: 0x4fb6ff, width: 4 * u });
      g.roundRect(x - 7 * u, y - 8 * u, 14 * u, 12 * u, 3 * u)
        .fill(0xd9a066)
        .stroke(line);
      return;
    }
    case 'tag_heavy': {
      g.poly([x - 8 * u, y - 8 * u, x + 8 * u, y - 8 * u, x + 14 * u, y + 13 * u, x - 14 * u, y + 13 * u])
        .fill(0x6b6f8a)
        .stroke(line);
      g.circle(x, y - 12 * u, 5 * u).stroke(line);
      return;
    }
    case 'tag_light': {
      g.moveTo(x - 12 * u, y + 12 * u)
        .bezierCurveTo(x - 6 * u, y - 4 * u, x + 4 * u, y - 12 * u, x + 13 * u, y - 13 * u)
        .bezierCurveTo(x + 8 * u, y - 2 * u, x + 2 * u, y + 8 * u, x - 12 * u, y + 12 * u)
        .fill(0xf4f6fb)
        .stroke(line);
      return;
    }
    case 'tag_leafy': {
      g.moveTo(x - 13 * u, y + 13 * u)
        .bezierCurveTo(x - 13 * u, y - 6 * u, x + 2 * u, y - 13 * u, x + 13 * u, y - 13 * u)
        .bezierCurveTo(x + 13 * u, y + 2 * u, x + 4 * u, y + 13 * u, x - 13 * u, y + 13 * u)
        .fill(0x6fbf4a)
        .stroke(line);
      g.moveTo(x - 10 * u, y + 10 * u)
        .lineTo(x + 8 * u, y - 8 * u)
        .stroke({ ...line, width: 2 * u });
      return;
    }
    case 'tag_edible': {
      g.circle(x, y + 2 * u, 13 * u)
        .fill(0xe8453c)
        .stroke(line);
      g.circle(x + 11 * u, y - 6 * u, 6 * u).fill(0xfff8f0);
      g.moveTo(x, y - 11 * u)
        .lineTo(x + 2 * u, y - 17 * u)
        .stroke({ ...line, width: 3 * u, color: 0x6b4a2b });
      return;
    }
    case 'tag_painted': {
      g.roundRect(x - 4 * u, y - 4 * u, 8 * u, 20 * u, 3 * u)
        .fill(0xd9a066)
        .stroke(line);
      g.roundRect(x - 8 * u, y - 16 * u, 16 * u, 13 * u, 4 * u)
        .fill(0x9b5de5)
        .stroke(line);
      return;
    }
    case 'tag_muddy': {
      g.ellipse(x, y + 4 * u, 15 * u, 9 * u)
        .fill(0x8a5a3a)
        .stroke(line);
      g.circle(x - 5 * u, y + 1 * u, 3 * u).fill(0x6b4428);
      return;
    }
    case 'tag_fuzzy': {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        g.moveTo(x + Math.cos(a) * 6 * u, y + Math.sin(a) * 6 * u + 6 * u)
          .lineTo(x + Math.cos(a) * 16 * u, y + Math.sin(a) * 16 * u + 6 * u)
          .stroke({ ...line, width: 2.5 * u, color: 0xa0704a });
      }
      g.circle(x, y + 6 * u, 7 * u)
        .fill(0xa0704a)
        .stroke(line);
      return;
    }
    default:
      g.circle(x, y, 12 * u).stroke(line);
      g.circle(x, y, 3 * u).fill(OUTLINE);
  }
}
