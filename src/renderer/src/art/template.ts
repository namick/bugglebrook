import type { Renderer } from 'pixi.js';
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { BugDef } from '../../../game/data/types';
import type { EyeShape, MouthShape } from '../render/bugFace';
import { BugSprite } from '../render/draw/bug';
import { drawEye, drawMouth } from '../render/draw/face';
import { CHEEK, OUTLINE } from '../render/palette';
import { REST_FRAME, rigFor } from '../render/rig/bugRig';
import { FACE_KIT, KIT_CANVAS, KIT_CELL, KIT_EYE_R, KIT_MOUTH_W, kitCell } from './kit';
import { poseFrame, posesFor } from './poses';
import { TEMPLATE_SCALE, kitRigFile, rigFileFor } from './rigData';
import type { RigFile } from './rigFile';

/**
 * Builds an art template's guide pictures in the running game (the generator
 * needs Pixi to draw the code-drawn bug). `scripts/art/template.ts` turns them
 * into an .ora. Each picture is a PNG data URL the size of the canvas.
 */
export interface TemplateGuides {
  rig: RigFile;
  /** The bug as the code draws it now, at rest (the file shows it faint). */
  current: string;
  pivots: string;
  safe: string;
  notes: string;
}

const S = TEMPLATE_SCALE;
const DOT = '#e0207a';
const INK = '#2b1d2e';

/** Each side's reach in template pixels: 10% more plus room for the safe box, rounded up to 128. */
const side = (v: number): number => Math.max(128, Math.ceil((Math.max(0, v) * S * 1.1 + 64) / 128) * 128);

/** The canvas for a bug: its bounds over every pose, and its drawing slots for limbs and feelers. */
export function measureBug(def: BugDef): {
  canvas: { w: number; h: number };
  origin: { x: number; y: number };
} {
  const sprite = new BugSprite(def);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (ax: number, ay: number, bx: number, by: number): void => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  for (const state of posesFor(def)) {
    for (let i = 0; i < 8; i++) {
      sprite.update(poseFrame(state, i * 0.13));
      const b = sprite.getLocalBounds();
      grow(b.x, b.y, b.x + b.width, b.y + b.height);
    }
  }
  // Limbs are drawn straight down from their pivots, feelers straight up: keep room for both.
  for (const p of rigFor(def).parts) {
    const len = p.length ?? 0;
    if (p.kind === 'limb_upper' || p.kind === 'limb_lower')
      grow(p.pivot.x, p.pivot.y, p.pivot.x, p.pivot.y + len);
    if (p.kind === 'rope') grow(p.pivot.x, p.pivot.y - len, p.pivot.x, p.pivot.y);
  }
  sprite.destroy({ children: true });
  const left = side(-x0);
  const top = side(-y0);
  return { canvas: { w: left + side(x1), h: top + side(y1) }, origin: { x: left, y: top } };
}

function canvas2d(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 22): void {
  g.font = `bold ${size}px sans-serif`;
  g.lineJoin = 'round';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.strokeText(text, x, y);
  g.fillStyle = INK;
  g.fillText(text, x, y);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r = 9): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = DOT;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.stroke();
}

function dashed(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  g.save();
  g.setLineDash([14, 10]);
  g.lineWidth = 4;
  g.strokeStyle = DOT;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.restore();
}

/** Dots and labels at every joint, with straight guides where limbs and feelers are drawn. */
function pivotGuide(rig: RigFile): string {
  const { c, g } = canvas2d(rig.canvas.w, rig.canvas.h);
  const used: { x: number; y: number }[] = [];
  // Nudge a label down until it doesn't sit on another one.
  const place = (x: number, y: number): number => {
    let ly = y;
    while (used.some((u) => Math.abs(u.x - x) < 150 && Math.abs(u.y - ly) < 24)) ly += 24;
    used.push({ x, y: ly });
    return ly;
  };
  for (const p of rig.parts) {
    const { x, y } = p.pivot;
    const len = p.length ?? 0;
    if (p.kind === 'limb_upper' || p.kind === 'limb_lower') {
      dashed(g, x, y, x, y + len);
      dot(g, x, y + len, 6);
    } else if (p.kind === 'rope') {
      dashed(g, x, y, x, y - len);
      dot(g, x, y - len, 6);
    }
    dot(g, x, y);
    const arrow = p.kind === 'rope' ? ' (draw up)' : p.kind.startsWith('limb') ? ' (draw down)' : '';
    label(g, `${p.name}${arrow}`, x + 14, place(x + 14, y - 10));
  }
  const f = rig.faceAnchors;
  if (f) {
    g.save();
    g.setLineDash([8, 8]);
    g.lineWidth = 3;
    g.strokeStyle = '#3a7bd5';
    g.beginPath();
    g.arc(f.eye.x, f.eye.y, f.eye.r, 0, Math.PI * 2);
    g.moveTo(f.mouth.x - f.mouth.s / 2, f.mouth.y);
    g.lineTo(f.mouth.x + f.mouth.s / 2, f.mouth.y);
    g.stroke();
    g.restore();
    label(g, 'face', f.mouth.x + f.mouth.s / 2 + 8, f.mouth.y + 8, 18);
  }
  return c.toDataURL('image/png');
}

/** The safe box, the ground line, and a cross at the origin. */
function safeGuide(rig: RigFile): string {
  const { c, g } = canvas2d(rig.canvas.w, rig.canvas.h);
  const s = rig.safe;
  g.lineWidth = 4;
  g.strokeStyle = '#3a7bd5';
  g.setLineDash([24, 12]);
  g.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
  g.setLineDash([]);
  g.strokeStyle = '#3e9e3e';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, rig.ground);
  g.lineTo(rig.canvas.w, rig.ground);
  g.stroke();
  label(g, 'ground', s.x0 + 8, rig.ground - 10, 20);
  label(g, 'safe box: keep everything inside', s.x0 + 8, s.y1 - 12, 20);
  g.strokeStyle = '#3a7bd5';
  g.lineWidth = 3;
  const { x, y } = rig.origin;
  g.beginPath();
  g.moveTo(x - 20, y);
  g.lineTo(x + 20, y);
  g.moveTo(x, y - 20);
  g.lineTo(x, y + 20);
  g.stroke();
  return c.toDataURL('image/png');
}

/** The bug's notes, in the top-left corner. */
function notesGuide(rig: RigFile, lines: string[]): string {
  const { c, g } = canvas2d(rig.canvas.w, rig.canvas.h);
  const size = rig.canvas.w >= 1024 ? 20 : 14;
  const x = rig.safe.x0 + 8;
  let y = rig.safe.y0 + size + 6;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  const width = Math.min(rig.canvas.w - x * 2, size * 34);
  g.fillRect(x - 8, rig.safe.y0, width, (lines.length + 0.6) * (size + 6));
  for (const [i, line] of lines.entries()) {
    g.font = `${i === 0 ? 'bold ' : ''}${size}px sans-serif`;
    g.fillStyle = INK;
    g.fillText(line, x, y, width - 12);
    y += size + 6;
  }
  return c.toDataURL('image/png');
}

/** Render a container to a PNG data URL, `w` x `h` template pixels, its local (`ox`, `oy`) at the top left. */
function snapshot(
  renderer: Renderer,
  target: Container,
  ox: number,
  oy: number,
  w: number,
  h: number,
  resolution: number,
): string {
  const holder = new Container();
  holder.addChild(target);
  const c = renderer.extract.canvas({
    target: holder,
    frame: new Rectangle(ox, oy, w / resolution, h / resolution),
    resolution,
    clearColor: [0, 0, 0, 0],
    antialias: true,
  }) as HTMLCanvasElement;
  const url = c.toDataURL('image/png');
  holder.destroy({ children: true });
  return url;
}

/** A bug template's guides and rig. */
export function bugTemplate(
  renderer: Renderer,
  def: BugDef,
  keep: { canvas: { w: number; h: number }; origin: { x: number; y: number } } | null = null,
): TemplateGuides {
  // Refreshing a file keeps the canvas the artist is drawing on.
  const { canvas, origin } = keep ?? measureBug(def);
  const title = `${def.name} the ${def.species.toLowerCase()} (${def.id})`;
  const rig = rigFileFor(def, title, canvas, origin);
  const sprite = new BugSprite(def);
  sprite.update(REST_FRAME);
  const current = snapshot(renderer, sprite, -origin.x / S, -origin.y / S, canvas.w, canvas.h, S);
  const lines = [
    title,
    'Draw each piece on its own layer in the "parts" group. Faces come from face_kit.ora.',
    'Pink dots are joints. Limbs start on their dot and go straight down; feelers go straight up.',
    ...[...rig.parts].reverse().map((p) => `${p.name}: ${p.note}`),
  ];
  return { rig, current, pivots: pivotGuide(rig), safe: safeGuide(rig), notes: notesGuide(rig, lines) };
}

const KIT_EYE_SHAPE: Partial<Record<string, EyeShape>> = {
  eye_white: 'open',
  eye_happy: 'happy',
  eye_squint: 'squint',
  eye_squeezed: 'x',
  eye_spiral: 'spiral',
  eye_heart: 'heart',
  eye_sleepy_lid: 'sleepy',
  brow_angry: 'angry',
  brow_worried: 'worried',
};

const KIT_MOUTH_SHAPE: Partial<Record<string, [MouthShape, number]>> = {
  mouth_smile: ['smile', 0],
  mouth_grin: ['grin', 0],
  mouth_o: ['o', 0],
  mouth_whee: ['whee', 0],
  mouth_aah: ['aah', 0],
  mouth_chew_1: ['chew', 0.06],
  mouth_chew_2: ['chew', 0.2],
  mouth_wobble_1: ['wobble', 0],
  mouth_wobble_2: ['wobble', 0.1],
  mouth_flat: ['flat', 0],
  mouth_frown: ['frown', 0],
  mouth_lick: ['lick', 0],
  mouth_tongue: ['tongue', 0],
  mouth_teeth: ['teeth', 0],
  mouth_puff: ['puff', 0],
};

/** The face kit template: every piece in its own cell, drawn the way the code draws it now. */
export function kitTemplate(renderer: Renderer): TemplateGuides {
  const rig = kitRigFile();
  const art = new Container();
  const g = new Graphics();
  art.addChild(g);
  for (const name of FACE_KIT) {
    const { x, y } = kitCell(name);
    const eye = KIT_EYE_SHAPE[name];
    const mouth = KIT_MOUTH_SHAPE[name];
    if (eye) drawEye(g, x, y, KIT_EYE_R, eye, { x: 0, y: 0 }, 1, 0x9aa0a6, 0.05, 4 * S);
    else if (name === 'eye_closed')
      drawEye(g, x, y, KIT_EYE_R, 'open', { x: 0, y: 0 }, 0, 0x9aa0a6, 0, 4 * S);
    else if (name === 'eye_pupil') g.circle(x, y, KIT_EYE_R * 0.52).fill(OUTLINE);
    else if (name === 'cheek')
      g.ellipse(x, y, KIT_EYE_R * 0.5, KIT_EYE_R * 0.35).fill({ color: CHEEK, alpha: 0.8 });
    else if (mouth) drawMouth(g, x, y, KIT_MOUTH_W, mouth[0], mouth[1], OUTLINE, 4 * S);
  }
  const current = snapshot(renderer, art, 0, 0, KIT_CANVAS.w, KIT_CANVAS.h, 1);
  const { c: pc, g: pg } = canvas2d(KIT_CANVAS.w, KIT_CANVAS.h);
  for (const name of FACE_KIT) {
    const { x, y } = kitCell(name);
    pg.save();
    pg.setLineDash([10, 8]);
    pg.lineWidth = 3;
    pg.strokeStyle = '#3a7bd5';
    pg.beginPath();
    if (name.startsWith('mouth_')) {
      pg.moveTo(x - KIT_MOUTH_W / 2, y);
      pg.lineTo(x + KIT_MOUTH_W / 2, y);
    } else pg.arc(x, y, KIT_EYE_R, 0, Math.PI * 2);
    pg.stroke();
    pg.restore();
    dot(pg, x, y, 6);
    label(pg, name, x - KIT_CELL.w / 2 + 10, kitCell(name).row * KIT_CELL.h + 26, 20);
  }
  const { c: sc, g: sg } = canvas2d(KIT_CANVAS.w, KIT_CANVAS.h);
  sg.strokeStyle = 'rgba(58,123,213,0.6)';
  sg.lineWidth = 2;
  for (let x = KIT_CELL.w; x < KIT_CANVAS.w; x += KIT_CELL.w) sg.strokeRect(x, 0, 0, KIT_CELL.h * 4);
  for (let y = KIT_CELL.h; y < KIT_CANVAS.h; y += KIT_CELL.h) sg.strokeRect(0, y, KIT_CANVAS.w, 0);
  const rows = Math.ceil(FACE_KIT.length / 7);
  const { c: nc, g: ng } = canvas2d(KIT_CANVAS.w, KIT_CANVAS.h);
  const tips = [
    'The face kit: every bug uses these eyes and mouths.',
    'Draw each piece in its own cell, on its layer in "face", centered on the dot.',
    'Eyes: the white fills the blue circle. Mouths: as wide as the blue line.',
    'eye_sleepy_lid is tintable: light greys only.',
  ];
  ng.font = '22px sans-serif';
  ng.fillStyle = INK;
  tips.forEach((t, i) => ng.fillText(t, 24, rows * KIT_CELL.h + 30 + i * 26));
  return {
    rig,
    current,
    pivots: pc.toDataURL('image/png'),
    safe: sc.toDataURL('image/png'),
    notes: nc.toDataURL('image/png'),
  };
}
