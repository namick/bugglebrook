// Draws the app icon (a round ladybug on a leaf-green tile) with Canvas 2D
// and writes build/icon.png at 1024x1024. electron-builder derives the
// Windows .ico and macOS .icns from this file.
//
// Usage: pnpm icon
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SIZE = 1024;
const OUTLINE = '#2b1b2e';
const out = resolve(import.meta.dirname, '../build/icon.png');

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
ctx.lineJoin = 'round';
ctx.lineCap = 'round';

const shape = (draw, fill, width = 28) => {
  ctx.beginPath();
  draw();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (width > 0) {
    ctx.lineWidth = width;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
};
const circle = (x, y, r) => () => ctx.arc(x, y, r, 0, Math.PI * 2);
const ellipse = (x, y, rx, ry) => () => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

// Rounded tile with a soft sky-to-grass background.
const pad = 64;
const tile = () => ctx.roundRect(pad, pad, SIZE - pad * 2, SIZE - pad * 2, 200);
const bg = ctx.createLinearGradient(0, pad, 0, SIZE - pad);
bg.addColorStop(0, '#8fd3ff');
bg.addColorStop(0.68, '#d6f0ff');
bg.addColorStop(0.68, '#6cc24a');
bg.addColorStop(1, '#3f8f2c');
shape(tile, bg, 32);

const cx = 512;
const cy = 560;
const r = 250;

// Legs.
for (const dx of [-150, 0, 150]) {
  shape(
    () => {
      ctx.moveTo(cx + dx, cy + r * 0.55);
      ctx.lineTo(cx + dx + 20, cy + r * 1.12);
    },
    null,
    34,
  );
  shape(circle(cx + dx + 20, cy + r * 1.12, 26), OUTLINE, 0);
}

// Antennae with round tips.
for (const [bx, tx, ty] of [
  [cx + 40, cx + 120, cy - r * 1.55],
  [cx + 120, cx + 230, cy - r * 1.4],
]) {
  shape(
    () => {
      ctx.moveTo(bx, cy - r * 0.8);
      ctx.bezierCurveTo(bx - 40, cy - r * 1.3, tx + 70, ty - 20, tx, ty);
    },
    null,
    24,
  );
  shape(circle(tx, ty, 34), '#ff4d5e', 20);
}

// Body, belly, spots, shine.
shape(ellipse(cx, cy, r * 1.12, r), '#ff4d5e', 32);
shape(ellipse(cx, cy + r * 0.45, r * 0.8, r * 0.42), '#ffe0b3', 0);
for (const [sx, sy, sr] of [
  [-0.45, -0.45, 0.18],
  [-0.05, -0.64, 0.13],
  [-0.72, -0.05, 0.12],
]) {
  shape(circle(cx + r * sx, cy + r * sy, r * sr), OUTLINE, 0);
}
ctx.globalAlpha = 0.55;
shape(ellipse(cx - r * 0.35, cy - r * 0.64, r * 0.22, r * 0.09), '#ffffff', 0);
ctx.globalAlpha = 1;

// Face: cheek, eyes, smile.
ctx.globalAlpha = 0.8;
shape(circle(cx + r * 0.72, cy + r * 0.2, r * 0.13), '#ff8fab', 0);
ctx.globalAlpha = 1;
for (const [ex, ey, er] of [
  [0.28, -0.2, 0.3],
  [0.72, -0.25, 0.26],
]) {
  const x = cx + r * ex;
  const y = cy + r * ey;
  const rr = r * er;
  shape(circle(x, y, rr), '#ffffff', 20);
  shape(circle(x + rr * 0.3, y + rr * 0.1, rr * 0.48), OUTLINE, 0);
  shape(circle(x + rr * 0.42, y - rr * 0.08, rr * 0.16), '#ffffff', 0);
}
shape(
  () => {
    ctx.moveTo(cx + r * 0.45, cy + r * 0.3);
    ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.5, cx + r * 0.85, cy + r * 0.28);
  },
  null,
  20,
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`Wrote ${out}`);
