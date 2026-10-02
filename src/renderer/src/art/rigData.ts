import type { BugDef } from '../../../game/data/types';
import { faceRest, rigFor } from '../render/rig/bugRig';
import { FACE_KIT, FACE_KIT_ID, KIT_CANVAS, KIT_CELL, KIT_COLS, KIT_EYE_R, KIT_MOUTH_W } from './kit';
import type { RigFile, RigPart } from './rigFile';

/** Template pixels per game pixel: templates are drawn at 4 times game size. */
export const TEMPLATE_SCALE = 4;
/** The safe box sits this far inside the canvas edge, in template pixels. */
export const SAFE_INSET = 32;

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A short, stable hash (two FNV-1a style passes), the same in the game and in Node. */
export function hashString(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * The hash of a bug's rig: its parts, pivots, and lengths, and its face
 * anchors. When the joints move, the hash changes and templates made for the
 * old one are out of date.
 */
export function rigHashFor(def: BugDef): string {
  const rig = rigFor(def);
  const face = faceRest(rig, def);
  const data = {
    art: rig.art,
    r: r3(rig.r),
    foot: r3(rig.foot),
    parts: rig.parts.map((p) => [
      p.name,
      p.kind,
      r3(p.pivot.x),
      r3(p.pivot.y),
      r3(p.length ?? 0),
      p.required,
      !!p.tintable,
      p.form ?? '',
    ]),
    face: [face.eye.x, face.eye.y, face.eye.r, face.mouth.x, face.mouth.y, face.mouth.s].map(r3),
  };
  return hashString(JSON.stringify(data));
}

/** A bug's rig.json for a template with this canvas and origin (template pixels). */
export function rigFileFor(
  def: BugDef,
  title: string,
  canvas: { w: number; h: number },
  origin: { x: number; y: number },
): RigFile {
  const rig = rigFor(def);
  const s = TEMPLATE_SCALE;
  const at = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: r3(origin.x + p.x * s),
    y: r3(origin.y + p.y * s),
  });
  const parts: RigPart[] = rig.parts.map((p) => ({
    name: p.name,
    kind: p.kind,
    pivot: at(p.pivot),
    ...(p.length !== undefined ? { length: r3(p.length * s) } : {}),
    required: p.required,
    ...(p.tintable ? { tintable: true } : {}),
    ...(p.form ? { form: p.form } : {}),
    note: p.note,
  }));
  const face = faceRest(rig, def);
  return {
    schema: 1,
    id: def.id,
    kind: 'bug',
    title,
    canvas,
    scale: s,
    origin,
    safe: { x0: SAFE_INSET, y0: SAFE_INSET, x1: canvas.w - SAFE_INSET, y1: canvas.h - SAFE_INSET },
    ground: r3(origin.y + rig.foot * s),
    rigHash: rigHashFor(def),
    parts,
    face: [...FACE_KIT],
    faceAnchors: {
      eye: { ...at(face.eye), r: r3(face.eye.r * s) },
      mouth: { ...at(face.mouth), s: r3(face.mouth.s * s) },
    },
  };
}

/** The face kit's hash: its pieces and layout. */
export function kitHash(): string {
  return hashString(JSON.stringify([FACE_KIT, KIT_CANVAS, KIT_CELL, KIT_COLS, KIT_EYE_R, KIT_MOUTH_W]));
}

/** face_kit.rig.json. */
export function kitRigFile(): RigFile {
  return {
    schema: 1,
    id: FACE_KIT_ID,
    kind: 'face_kit',
    title: 'The face kit',
    canvas: { ...KIT_CANVAS },
    scale: TEMPLATE_SCALE,
    origin: { x: 0, y: 0 },
    safe: { x0: 0, y0: 0, x1: KIT_CANVAS.w, y1: KIT_CANVAS.h },
    ground: KIT_CANVAS.h,
    rigHash: kitHash(),
    parts: [],
    face: [...FACE_KIT],
  };
}
