import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BufferImageSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/art/png.ts';
import { BUGS } from '../../src/game/data';
import { atlasSet } from '../../src/renderer/src/art/artStore';
import type { LoadedArt } from '../../src/renderer/src/art/artStore';
import { FACE_KIT } from '../../src/renderer/src/art/kit';
import { EXPRESSIONS, expressionFrame, poseFrame, posesFor } from '../../src/renderer/src/art/poses';
import type { AtlasJson, Manifest } from '../../src/renderer/src/art/rigFile';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';

const ART = resolve(import.meta.dirname, '../../src/renderer/art');

/** The shipped sets whose every bug must be fully drawn: the reference cast and the Storybook showcase. */
const SETS = [
  { name: 'Krita reference cast', dir: ART },
  { name: 'Storybook set', dir: join(ART, 'sets/storybook') },
];

function load(DIR: string, id: string): LoadedArt {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Manifest;
  const entry = manifest.assets[id]!;
  const art: LoadedArt = { entry, scales: {} };
  for (const scale of [1, 2] as const)
    for (const page of entry.pages[String(scale) as '1' | '2']) {
      const png = decodePng(new Uint8Array(readFileSync(join(DIR, `${page}.png`))));
      const source = new BufferImageSource({ resource: png.data, width: png.w, height: png.h });
      const json = JSON.parse(readFileSync(join(DIR, `${page}.json`), 'utf8')) as AtlasJson;
      art.scales[scale] = atlasSet(source, json, art.scales[scale]);
    }
  return art;
}

describe.each(SETS)('$name', ({ dir }) => {
  it.each(BUGS.all)(
    '$name has complete shipped parts and faces through every pose at both resolutions',
    (def) => {
      const art = load(dir, def.id);
      expect(art.entry.status).toBe('drawn');
      expect(art.entry.report).toEqual([]);
      expect([...art.entry.face].sort()).toEqual([...FACE_KIT].sort());
      for (const scale of [1, 2] as const) {
        SpriteBugView.forceScale = scale;
        const view = new SpriteBugView(def, art, null);
        try {
          for (const pose of posesFor(def))
            for (const time of [0, 0.3, 0.7]) {
              view.update(poseFrame(pose, time));
              expect(view.shown.parts.length, pose.id).toBeGreaterThan(0);
              expect(view.shown.codeFace, pose.id).toBe(0);
              expect(view.shown.scale, pose.id).toBe(scale);
            }
          for (const expression of EXPRESSIONS) {
            view.update(expressionFrame(expression, 0.5));
            expect(view.shown.codeFace, expression.id).toBe(0);
          }
        } finally {
          view.destroy({ children: true });
          SpriteBugView.forceScale = null;
        }
      }
    },
  );
});
