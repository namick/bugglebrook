// OpenRaster (.ora) read and write. An ORA file is a zip: `mimetype` first and
// stored, `stack.xml` listing the layers top to bottom, a PNG per layer in
// `data/`, plus `mergedimage.png` and `Thumbnails/thumbnail.png`.
// Spec: https://www.openraster.org/baseline/file-layout-spec.html

import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { unzipSync, zipSync } from 'fflate';
import type { Zippable } from 'fflate';

export const ORA_MIMETYPE = 'image/openraster';

/** Zip entries get this date, so the same layers make the same bytes. */
const ZIP_TIME = new Date(Date.UTC(2026, 0, 1));

interface NodeBase {
  name: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  compositeOp: string;
  /** Every attribute as written, for checks on things this reader does not use. */
  attrs: Record<string, string>;
}

export interface OraLayer extends NodeBase {
  kind: 'layer';
  src: string;
  png: Uint8Array | null;
  /** Has a `<filter>` child (some apps write these; Krita does not). */
  filtered: boolean;
}

export interface OraStack extends NodeBase {
  kind: 'stack';
  /** Children top (front) first, as in stack.xml. */
  children: OraNode[];
  filtered: boolean;
}

export type OraNode = OraLayer | OraStack;

export interface OraDoc {
  w: number;
  h: number;
  xres: number;
  yres: number;
  root: OraStack;
  /** Every file in the zip, raw. */
  files: Record<string, Uint8Array>;
  /** The zip's entries in the order they are stored. */
  order: string[];
}

export class OraError extends Error {}

/** The names of a zip's entries, in stored order, read from its central directory. */
export function zipOrder(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new OraError('not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: { name: string; offset: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new OraError('the zip directory is damaged');
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    entries.push({ name, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries.sort((a, b) => a.offset - b.offset).map((e) => e.name);
}

/**
 * The OpenRaster rule for the first entry: named `mimetype`, stored
 * uncompressed with no extra field, holding exactly `image/openraster`.
 * Returns a problem in words, or null.
 */
export function mimetypeProblem(bytes: Uint8Array): string | null {
  if (bytes.length < 30 + 8 + ORA_MIMETYPE.length) return 'the file is too short to be an ORA';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return 'it is not a zip file';
  const method = view.getUint16(8, true);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLen));
  if (name !== 'mimetype') return `the first entry is "${name}", not "mimetype"`;
  if (method !== 0) return 'the mimetype entry is compressed';
  if (extraLen !== 0) return 'the mimetype entry has an extra field';
  const size = view.getUint32(18, true);
  const body = new TextDecoder().decode(bytes.subarray(30 + nameLen, 30 + nameLen + size));
  if (body !== ORA_MIMETYPE) return `the mimetype says "${body}"`;
  return null;
}

type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const num = (v: string | undefined, d: number): number => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};

function readNode(tag: 'stack' | 'layer', node: XmlNode, files: Record<string, Uint8Array>): OraNode {
  const a = node[':@'] ?? {};
  const kids = (node[tag] as XmlNode[] | undefined) ?? [];
  const base: NodeBase = {
    name: a.name ?? '',
    x: num(a.x, 0),
    y: num(a.y, 0),
    opacity: num(a.opacity, 1),
    visible: (a.visibility ?? 'visible') !== 'hidden',
    compositeOp: a['composite-op'] ?? 'svg:src-over',
    attrs: { ...a },
  };
  const filtered = kids.some((k) => 'filter' in k);
  if (tag === 'layer') {
    const src = a.src ?? '';
    return { ...base, kind: 'layer', src, png: files[src] ?? null, filtered };
  }
  const children: OraNode[] = [];
  for (const k of kids) {
    if ('stack' in k) children.push(readNode('stack', k, files));
    else if ('layer' in k) children.push(readNode('layer', k, files));
  }
  return { ...base, kind: 'stack', children, filtered };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  parseAttributeValue: false,
  trimValues: true,
});

/** Read an .ora file. Throws `OraError` with a plain-words reason when it can't. */
export function readOra(bytes: Uint8Array): OraDoc {
  let files: Record<string, Uint8Array>;
  let order: string[];
  try {
    files = unzipSync(bytes);
    order = zipOrder(bytes);
  } catch (e) {
    throw new OraError(e instanceof OraError ? e.message : 'it is not a zip file, so it is not an ORA');
  }
  const xml = files['stack.xml'];
  if (!xml) throw new OraError('it has no stack.xml, the list of layers');
  let tree: XmlNode[];
  try {
    tree = parser.parse(new TextDecoder().decode(xml)) as XmlNode[];
  } catch {
    throw new OraError('its stack.xml is not readable XML');
  }
  const image = tree.find((n) => 'image' in n);
  if (!image) throw new OraError('its stack.xml has no <image>');
  const ia = image[':@'] ?? {};
  const top = ((image.image as XmlNode[]) ?? []).find((n) => 'stack' in n);
  if (!top) throw new OraError('its stack.xml has no root stack');
  return {
    w: num(ia.w, 0),
    h: num(ia.h, 0),
    xres: num(ia.xres, 72),
    yres: num(ia.yres, 72),
    root: readNode('stack', top, files) as OraStack,
    files,
    order,
  };
}

/** A layer or group to write. Children are listed top (front) first. */
export type WriteNode =
  | {
      name: string;
      png: Uint8Array;
      x?: number;
      y?: number;
      opacity?: number;
      visible?: boolean;
      compositeOp?: string;
      locked?: boolean;
      /** Keep this data path (refreshing a file keeps every untouched layer where it was). */
      src?: string;
    }
  | {
      name: string;
      children: WriteNode[];
      opacity?: number;
      visible?: boolean;
      locked?: boolean;
      compositeOp?: string;
    };

export interface WriteDoc {
  w: number;
  h: number;
  /** Pixels per inch for print; templates say 300. */
  dpi?: number;
  /** Top first. */
  stack: WriteNode[];
  merged: Uint8Array;
  thumbnail: Uint8Array;
}

const slug = (s: string): string => s.replace(/[^a-z0-9_]+/gi, '_').toLowerCase() || 'layer';

/** Write an .ora file: mimetype first and stored, then stack.xml, the layers, the merged image, the thumbnail. */
export function writeOra(doc: WriteDoc): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  let n = 0;
  const attrsOf = (node: WriteNode): Record<string, string> => {
    const a: Record<string, string> = { ':name': node.name };
    a[':visibility'] = node.visible === false ? 'hidden' : 'visible';
    a[':opacity'] = String(node.opacity ?? 1);
    a[':composite-op'] = node.compositeOp ?? 'svg:src-over';
    if (node.locked) a[':edit-locked'] = 'true';
    return a;
  };
  const build = (node: WriteNode): XmlNode => {
    if ('children' in node) return { stack: node.children.map(build), ':@': attrsOf(node) };
    let src = node.src ?? `data/${String(n++).padStart(3, '0')}_${slug(node.name)}.png`;
    while (used.has(src)) src = `data/${String(n++).padStart(3, '0')}_${slug(node.name)}.png`;
    used.add(src);
    data[src] = node.png;
    return {
      layer: [],
      ':@': {
        ...attrsOf(node),
        ':src': src,
        ':x': String(Math.round(node.x ?? 0)),
        ':y': String(Math.round(node.y ?? 0)),
      },
    };
  };
  const dpi = String(doc.dpi ?? 300);
  const tree: XmlNode[] = [
    { '?xml': [{ '#text': '' }], ':@': { ':version': '1.0', ':encoding': 'UTF-8' } },
    {
      image: [{ stack: doc.stack.map(build), ':@': { ':name': 'root' } }],
      ':@': { ':version': '0.0.6', ':w': String(doc.w), ':h': String(doc.h), ':xres': dpi, ':yres': dpi },
    },
  ];
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: ':',
    preserveOrder: true,
    format: true,
    indentBy: ' ',
    suppressEmptyNode: true,
  });
  const xml = new TextEncoder().encode((builder.build(tree) as string).trim() + '\n');
  const opts = { mtime: ZIP_TIME };
  const zip: Zippable = {
    mimetype: [new TextEncoder().encode(ORA_MIMETYPE), { level: 0, mtime: ZIP_TIME }],
    'stack.xml': [xml, { level: 6, ...opts }],
  };
  for (const src of Object.keys(data).sort()) zip[src] = [data[src]!, { level: 0, ...opts }];
  zip['mergedimage.png'] = [doc.merged, { level: 0, ...opts }];
  zip['Thumbnails/thumbnail.png'] = [doc.thumbnail, { level: 0, ...opts }];
  return zipSync(zip);
}

/** Every layer in the tree with its path of group names, top first. */
export function walk(stack: OraStack, path: string[] = []): { node: OraNode; path: string[] }[] {
  const out: { node: OraNode; path: string[] }[] = [];
  for (const c of stack.children) {
    out.push({ node: c, path });
    if (c.kind === 'stack') out.push(...walk(c, [...path, c.name]));
  }
  return out;
}
