import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function checkSetId(id: string): string {
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(id) || id === 'procedural')
    throw new Error(
      'Art set IDs must use lowercase letters, numbers and underscores, and cannot be procedural.',
    );
  return id;
}

export function setSource(root: string, id: string): string {
  checkSetId(id);
  return id === 'reference' ? root : join(root, 'sets', id);
}

export function setArgs(args: string[]): { id: string; rest: string[] } {
  const i = args.indexOf('--set');
  if (i < 0) return { id: 'reference', rest: args };
  if (!args[i + 1]) throw new Error('--set needs an art set ID.');
  const id = checkSetId(args[i + 1]!);
  return { id, rest: args.filter((_a, j) => j !== i && j !== i + 1) };
}

export function sourceSets(root: string): { id: string; name: string; credit: string; path: string }[] {
  const sets = [
    {
      id: 'reference',
      name: 'Krita reference',
      credit: 'Agent-created reference artwork in Krita',
      path: '',
    },
  ];
  const dir = join(root, 'sets');
  if (!existsSync(dir)) return sets;
  for (const d of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    if (!d.isDirectory()) continue;
    const id = checkSetId(d.name);
    if (id === 'reference') throw new Error('The reference set lives directly in art/src.');
    const file = join(dir, id, 'set.json');
    if (!existsSync(file)) throw new Error(`Missing ${file}. Add a name and credit for this art set.`);
    const meta = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (
      typeof meta.name !== 'string' ||
      !meta.name.trim() ||
      meta.name.length > 40 ||
      typeof meta.credit !== 'string' ||
      !meta.credit.trim() ||
      meta.credit.length > 200
    )
      throw new Error(`${file} needs a name of 1–40 characters and a credit of 1–200 characters.`);
    sets.push({ id, name: meta.name.trim(), credit: meta.credit.trim(), path: `sets/${id}` });
  }
  return sets;
}
