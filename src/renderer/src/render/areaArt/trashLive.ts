import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, FixtureDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { CAN, LidSpring, lidTarget, pupil } from '../trashLook';
import { AreaLive } from './live';
import type { AreaFrame } from './live';

const PPM = PIXELS_PER_METER;
const TIN = 0xb4c0cc;
const LABEL = 0xff7a5c;
const LABEL_DARK = 0xd9553a;
const INSIDE = 0x3a2e3f;
const BURP = 0xa8e07a;

/** Little bits of rubbish that fly out when something rummages or it spits. */
const BITS = [0xfff4c8, 0xffd23f, 0x9bd770, 0xff8fab, 0xc9a07a];

/**
 * The trash can (playtest F1), alive: a dented tin can with a torn label and
 * a pair of googly eyes, and a hinged lid that is its mouth. The lid lifts
 * and chatters as the hand brings something over, gapes wide when a let-go
 * would drop it in, slams shut on a chomp (the can squashes and wobbles),
 * pops up for a green burp, flips open to spit out a bug or a hiccup, and
 * bangs about while a bug rummages inside. The eyes follow whatever is held.
 */
export class TrashLive extends AreaLive {
  private readonly root = new Container();
  private readonly g = new Graphics();
  private readonly cx: number;
  private readonly ground: number;
  private readonly lid = new LidSpring();
  /** The can's wobble (radians) and its spring. */
  private wob = 0;
  private wobV = 0;
  /** Squash: 1 is rest. */
  private squash = 1;
  private squashV = 0;
  /** Seconds left of a squint after a chomp, and of a happy face after a burp. */
  private chomp = 0;
  private burp = 0;
  /** Seconds left of wide, startled eyes (a bug popped out). */
  private startle = 0;
  /** The lid's open amount last frame, for the test hook and the clang. */
  clangs = 0;
  /** What the eyes watch, in world pixels. */
  private watch: { x: number; y: number } | null = null;

  constructor(area: AreaDef, can: FixtureDef) {
    const cx = (area.xStart + can.x) * PPM;
    super(cx - 400, cx + 400);
    this.cx = cx;
    this.ground = (can.y + (can.h ?? 1.8) / 2) * PPM;
    this.root.position.set(this.cx, this.ground);
    this.root.addChild(this.g);
    this.back.addChild(this.root);
  }

  /** How open the lid is now, 0 to 1 (test hook). */
  get openness(): number {
    return this.lid.open;
  }

  private kickWobble(v: number): void {
    this.wobV += v;
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    const mouth = (): { x: number; y: number } => ({ x: this.cx, y: this.ground - CAN.h });
    return [
      ev.on('trash_chomped', (e) => {
        this.lid.open = Math.max(this.lid.open, 0.85);
        this.lid.vel = -16;
        this.chomp = 0.45;
        this.squashV -= 4.5;
        this.kickWobble((e.id % 2 === 0 ? 1 : -1) * 2.4);
        const m = mouth();
        const color = sim.content.items.tryGet(e.defId)?.color ?? 0xffffff;
        particles.crumbs(m.x, m.y - 6, color);
        particles.burst(m.x, m.y - 10, 7, 0xffffff, Math.PI, -Math.PI);
        if (e.fate === 'recycled') particles.sparkles(m.x, m.y - 40, 6);
      }),
      ev.on('trash_burped', (e) => {
        this.lid.kick(7 + Math.min(4, e.size));
        this.burp = 1;
        this.squashV += 3;
        const m = mouth();
        const n = 6 + Math.min(10, e.size * 3);
        particles.puff(m.x + 20, m.y - 20, BURP, n, 40, -110, 26 + Math.min(14, e.size * 4));
      }),
      ev.on('trash_spat', (e) => {
        this.lid.kick(14);
        this.startle = e.kind === 'bug' ? 1.2 : 0.6;
        this.kickWobble(e.x > this.cx / PPM ? -2 : 2);
        this.squashV += 4;
        const m = mouth();
        if (e.kind === 'bug') particles.puff(m.x, m.y - 30, BURP, 8, 0, -80, 22);
        for (let i = 0; i < 3; i++) particles.crumbs(m.x, m.y - 10, BITS[i % BITS.length]!);
      }),
      ev.on('trash_poked', () => {
        this.lid.kick(6);
        this.kickWobble(1.2);
        this.startle = 0.4;
      }),
      ev.on('trash_rummaged', (e) => {
        this.lid.kick(12);
        this.squashV += 3;
        const m = mouth();
        particles.burst(m.x, m.y - 20, 9, e.itemId === null ? BURP : 0xffffff, Math.PI, -Math.PI);
        for (const c of BITS) particles.crumbs(m.x, m.y - 10, c);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const dt = Math.min(0.05, f.dt);
    const sim = f.sim;
    const can = sim.trash.cans()[0];
    const rim = can ? sim.trash.rim(can) : null;
    // What is held, and would it go in?
    let held: number | null = null;
    let over = false;
    this.watch = f.hand;
    const holding = f.views.find((v) => v.held);
    if (holding && rim) {
      const fits = holding.kind === 'item' && sim.trash.candidates(holding.id).length > 0;
      if (fits) {
        held = Math.hypot(holding.x - rim.x, holding.y - rim.y);
        over = sim.dropTargetFor(holding.id)?.kind === 'trash';
      }
      this.watch = { x: holding.x * PPM, y: holding.y * PPM };
    }
    const rummaging = f.views.some(
      (v) => v.bug?.mode === 'st_use' && v.bug.action === 'rummage' && Math.abs(v.x * PPM - this.cx) < 250,
    );
    const hint = f.hints?.wobble('trash') ?? 0;
    const target = lidTarget({ held, over, rummaging, hint: hint * (f.reduced ? 0.5 : 1), time: f.time });
    if (this.lid.update(dt, target)) {
      this.clangs++;
      this.kickWobble(0.6);
    }
    // The can's springs: a wobble about its foot and a squash.
    this.wobV += (-this.wob * 160 - this.wobV * 9) * dt;
    this.wob += this.wobV * dt;
    this.squashV += ((1 - this.squash) * 220 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    if (rummaging) {
      this.wob += Math.sin(f.time * 31) * 0.01;
      if (Math.random() < dt * 5)
        f.particles.crumbs(
          this.cx + (Math.random() - 0.5) * 60,
          this.ground - CAN.h - 10,
          BITS[Math.floor(Math.random() * BITS.length)]!,
        );
    }
    this.chomp = Math.max(0, this.chomp - dt);
    this.burp = Math.max(0, this.burp - dt * 0.9);
    this.startle = Math.max(0, this.startle - dt);
    if (!this.shows(f)) return;
    this.draw(f, sim.trash.state.inside.length, over);
  }

  private draw(f: AreaFrame, inside: number, hungry: boolean): void {
    const g = this.g.clear();
    const s = Math.max(0.7, Math.min(1.3, this.squash));
    this.root.rotation = this.wob * (f.reduced ? 0.4 : 1);
    this.root.scale.set(1 / Math.sqrt(s), s);
    const w = CAN.w;
    const h = CAN.h;
    const x0 = -w / 2;
    const top = -h;
    // A shadow on the ground.
    g.ellipse(0, 2, w * 0.62, 12).fill({ color: OUTLINE, alpha: 0.18 });
    // The tin: a rounded cylinder, lit from the left.
    g.roundRect(x0, top, w, h, 14).fill(TIN).stroke(stroke(6));
    g.roundRect(x0 + 12, top + 10, 18, h - 22, 9).fill({ color: 0xffffff, alpha: 0.35 });
    g.roundRect(x0 + w - 30, top + 10, 18, h - 22, 9).fill({ color: darken(TIN, 0.18), alpha: 0.5 });
    // Ridges round the tin, above and below the label.
    for (const y of [top + 22, top + h - 26]) {
      g.moveTo(x0 + 6, y)
        .quadraticCurveTo(0, y + 8, w / 2 - 6, y)
        .stroke({ width: 4, color: darken(TIN, 0.3) });
      g.moveTo(x0 + 8, y - 4)
        .quadraticCurveTo(0, y + 4, w / 2 - 8, y - 4)
        .stroke({ width: 2, color: lighten(TIN, 0.5) });
    }
    // A dent, low on the right.
    g.ellipse(x0 + w * 0.72, top + h - 46, 14, 9).fill({ color: darken(TIN, 0.25), alpha: 0.5 });
    // The label, torn at one corner.
    const ly = top + 36;
    const lh = 92;
    g.poly([
      x0 + 3,
      ly,
      x0 + w - 3,
      ly,
      x0 + w - 3,
      ly + lh - 22,
      x0 + w - 18,
      ly + lh - 8,
      x0 + w - 30,
      ly + lh,
      x0 + 3,
      ly + lh,
    ])
      .fill(LABEL)
      .stroke(stroke(4));
    g.rect(x0 + 3, ly + lh - 18, w - 34, 8).fill(LABEL_DARK);
    // A fish skeleton printed on the label: what the can is for, without a word.
    const fy = ly + lh - 34;
    g.moveTo(-26, fy).lineTo(22, fy).stroke({ width: 4, color: 0xfff4e0, cap: 'round' });
    for (let i = 0; i < 4; i++) {
      const bx = -16 + i * 10;
      g.moveTo(bx, fy - 8)
        .lineTo(bx + 4, fy)
        .lineTo(bx, fy + 8)
        .stroke({ width: 3, color: 0xfff4e0, cap: 'round' });
    }
    g.poly([22, fy, 34, fy - 9, 34, fy + 9]).fill(0xfff4e0);
    g.circle(-32, fy, 6).fill(0xfff4e0);
    // Googly eyes on the label.
    const big = hungry ? 1.15 : this.startle > 0 ? 1.12 : 1;
    const eyeY = ly + 26;
    for (const ex of [-27, 27]) {
      const r = 19 * big;
      g.circle(ex, eyeY, r).fill(0xffffff).stroke(stroke(4));
      if (this.chomp > 0) {
        // Squeezed shut on the chomp.
        g.moveTo(ex - r * 0.6, eyeY)
          .lineTo(ex + r * 0.6, eyeY)
          .stroke({ width: 5, color: OUTLINE, cap: 'round' });
      } else if (this.burp > 0.3) {
        // Pleased with itself.
        g.moveTo(ex - r * 0.55, eyeY + 4)
          .quadraticCurveTo(ex, eyeY - r * 0.6, ex + r * 0.55, eyeY + 4)
          .stroke({
            width: 5,
            color: OUTLINE,
            cap: 'round',
          });
      } else {
        // The pupil rattles about a little as the can moves: googly.
        const world = { x: this.cx + ex, y: this.ground + eyeY };
        const at = this.watch ? { x: this.watch.x - world.x + ex, y: this.watch.y - world.y + eyeY } : null;
        const p = pupil({ x: ex, y: eyeY }, at, r * 0.45, f.time + ex);
        g.circle(p.x + this.wob * 30, p.y, r * 0.48).fill(OUTLINE);
        g.circle(p.x + this.wob * 30 - 3, p.y - 3, r * 0.14).fill(0xffffff);
      }
    }
    // The mouth: a dark opening with a jagged, toothy rim, and a tongue when it gapes.
    const open = Math.max(0, this.lid.open);
    g.ellipse(0, top, w / 2 - 3, 15)
      .fill(INSIDE)
      .stroke(stroke(5));
    if (inside > 0) {
      // Rubbish poking out: a crumpled paper ball and a peel.
      g.circle(-22, top - 2, 11)
        .fill(0xfff4c8)
        .stroke(stroke(3));
      g.moveTo(14, top + 2)
        .quadraticCurveTo(26, top - 16, 38, top - 4)
        .stroke({ width: 9, color: OUTLINE, cap: 'round' });
      g.moveTo(14, top + 2)
        .quadraticCurveTo(26, top - 16, 38, top - 4)
        .stroke({ width: 5, color: 0xffd23f, cap: 'round' });
    }
    if (open > 0.15) {
      const k = Math.min(1, (open - 0.15) / 0.4);
      for (let i = 0; i < 9; i++) {
        const tx = -w / 2 + 12 + i * ((w - 24) / 8);
        g.poly([tx - 6, top + 2, tx, top + 2 - 9 * k, tx + 6, top + 2])
          .fill(0xe8eef4)
          .stroke({ width: 2, color: OUTLINE });
      }
      if (open > 0.6)
        g.ellipse(6, top + 4, 22 * k, 7 * k)
          .fill(0xff8fab)
          .stroke({ width: 2.5, color: OUTLINE });
    }
    // The lid, hinged at the back left: a tin disc with a knob, swinging up.
    const hinge = { x: -w / 2 + 4, y: top - 4 };
    const a = -open * 1.75;
    const pts: number[] = [];
    const lrx = CAN.lid;
    const lry = 17;
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const lx = lrx - 4 + Math.cos(t) * lrx;
      const ly2 = Math.sin(t) * lry;
      pts.push(
        hinge.x + lx * Math.cos(a) - ly2 * Math.sin(a),
        hinge.y + lx * Math.sin(a) + ly2 * Math.cos(a),
      );
    }
    g.poly(pts).fill(lighten(TIN, 0.15)).stroke(stroke(5));
    // Its rim ring and its knob.
    const mid = { x: hinge.x + (lrx - 4) * Math.cos(a), y: hinge.y + (lrx - 4) * Math.sin(a) };
    g.ellipse(mid.x, mid.y, lrx * 0.62 * Math.max(0.4, Math.abs(Math.cos(a))) + 6, 9).stroke({
      width: 3,
      color: darken(TIN, 0.2),
    });
    const knob = { x: mid.x - Math.sin(a) * -12, y: mid.y - 12 * Math.cos(a) };
    g.roundRect(knob.x - 16, knob.y - 8, 32, 14, 7)
      .fill(lighten(TIN, 0.3))
      .stroke(stroke(4));
  }
}
