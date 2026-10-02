// The shapes of the art pipeline's files, shared by the renderer and the Node
// scripts in scripts/art/. No imports, so Node can load it directly.

export interface XY {
  x: number;
  y: number;
}

/** One art layer in a template, in template pixels. */
export interface RigPart {
  name: string;
  kind: 'static' | 'limb_upper' | 'limb_lower' | 'rope' | 'tip' | 'hinged' | 'wing' | 'form' | 'face';
  pivot: XY;
  /** Limbs and feelers: drawn straight from the pivot for this many pixels. */
  length?: number;
  required: boolean;
  tintable?: boolean;
  form?: string;
  note: string;
}

/** `<id>.rig.json`, written by `pnpm art:templates` next to each template. Never edited by hand. */
export interface RigFile {
  schema: 1;
  id: string;
  kind: 'bug' | 'face_kit';
  /** The bug's name, for messages. */
  title: string;
  canvas: { w: number; h: number };
  /** Template pixels per game pixel. */
  scale: number;
  /** Where the rig's origin (the collider center) is, in template pixels. */
  origin: XY;
  /** Keep drawings inside this box. */
  safe: { x0: number; y0: number; x1: number; y1: number };
  /** The ground line's y. */
  ground: number;
  /** A hash of the rig's joints and parts; templates made for another hash are out of date. */
  rigHash: string;
  /** Back to front. */
  parts: RigPart[];
  /** Face pieces this file may hold in its `face` group (overrides of the face kit). */
  face: string[];
  /** For a bug: where its near eye and mouth sit at rest, in template pixels, to place face overrides. */
  faceAnchors?: { eye: XY & { r: number }; mouth: XY & { s: number } };
}

/** One atlas frame, in Pixi's spritesheet format plus our anchor. */
export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: true;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  /** The pivot, as a fraction of the frame. */
  anchor: XY;
}

export interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number }; scale: number; format: 'RGBA8888' };
}

export interface ManifestPart {
  kind: RigPart['kind'];
  /** The pivot in game pixels from the rig origin (for face pieces: from the face anchor). */
  pivot: XY;
  /** Limbs and feelers: rest length in game pixels. */
  length?: number;
  tintable?: boolean;
  form?: string;
}

export interface ManifestAsset {
  id: string;
  kind: 'bug' | 'face_kit';
  /** SHA-256 of the .ora, so `art:check` can tell when a source changed without a rebuild. */
  sourceHash: string;
  rigHash: string;
  /** drawn: usable. empty: nothing drawn yet. broken: has errors, the game draws it in code. */
  status: 'drawn' | 'empty' | 'broken';
  /** Atlas pages per scale, as file names next to the manifest. */
  pages: Record<'1' | '2', string[]>;
  parts: Record<string, ManifestPart>;
  /** Face pieces drawn in this file. */
  face: string[];
  faceAnchors?: { eye: XY & { r: number }; mouth: XY & { s: number } };
  /** The importer's messages, for the Art Lab. */
  report: ArtMessage[];
}

export interface Manifest {
  schema: 1;
  assets: Record<string, ManifestAsset>;
}

export interface ArtMessage {
  level: 'error' | 'warning' | 'info';
  /** The layer it is about, if any. */
  layer?: string;
  text: string;
}
