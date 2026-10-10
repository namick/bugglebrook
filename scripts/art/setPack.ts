// A whole art set built from its sources, as packs a running game can
// install: its bugs with their colors and night lights, its item sheets, and
// its backdrop. Tours use it to show a set as it is on disk right now, with
// no `pnpm art:build` and no rebuild of the app (tests/e2e/app.ts,
// `showArtSet`).

import type { BackdropPack } from '../../src/renderer/src/art/backdropData.ts';
import type { ItemPack } from '../../src/renderer/src/art/itemSheet.ts';
import type { ArtPack } from '../../src/renderer/src/art/rigFile.ts';
import { BACKDROP_DIR, buildBackdrop, toBackdropPack } from './backdrop.ts';
import { SRC_DIR, findSources, formatReport } from './build.ts';
import { buildItems, toItemPack } from './items.ts';
import { setSource, sourceSets } from './sets.ts';
import { rebuild } from './vitePlugin.ts';

export interface SetPack {
  set: { id: string; name: string; credit: string };
  /** Its bugs and face kit. Colors and lights ride in each bug's manifest entry. */
  art: ArtPack;
  /** Its item sheets, or null when it has none. */
  items: ItemPack | null;
  /** Its sky, world style, and strips, or null when it has no `backdrop/` folder. */
  backdrop: BackdropPack | null;
  /** The importer's report for every file, as `pnpm art:build` prints it. */
  report: string;
  /** How many files had an error. Those are left out, and the game falls back to code for them. */
  errors: number;
}

/**
 * Build every source of one set (`reference`, or a folder in `art/src/sets`).
 * Writes nothing. Throws when the set does not exist or its `colors.json` is wrong.
 */
export function buildSetPack(id: string, root = SRC_DIR): SetPack {
  const set = sourceSets(root).find((s) => s.id === id);
  if (!set) throw new Error(`There is no art set "${id}" in ${root}.`);
  const dir = setSource(root, id);
  const bugs = rebuild(
    dir,
    findSources(dir).map((s) => s.id),
  );
  const items = buildItems(dir);
  const backdrop = buildBackdrop(dir);
  const extra = [
    ...[...items.messages].map(([file, messages]) => ({ file: `items/${file}`, messages })),
    ...[...backdrop.messages].map(([file, messages]) => ({ file: `${BACKDROP_DIR}/${file}`, messages })),
  ];
  const report = [bugs.report, ...extra.map((e) => formatReport(e.file, e.messages))]
    .filter(Boolean)
    .join('\n');
  return {
    set: { id: set.id, name: set.name, credit: set.credit },
    art: bugs.pack,
    items: items.built.length ? toItemPack(items.built) : null,
    backdrop: toBackdropPack(backdrop),
    report,
    errors:
      bugs.pack.assets.filter((a) => a.status === 'broken').length +
      extra.filter((e) => e.messages.some((m) => m.level === 'error')).length,
  };
}
