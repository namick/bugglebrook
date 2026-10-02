import type { FederatedPointerEvent } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { CONTENT } from '../../../game/data';
import type { BugDef } from '../../../game/data/types';
import type { BugFrame } from '../render/draw/bug';
import { BugSprite } from '../render/draw/bug';
import { bugSpan } from '../render/draw/species';
import { OUTLINE } from '../render/palette';
import { markUi } from '../ui/button';
import type { ArtStore } from './artStore';
import { artStore } from './artStore';
import { makeBugView } from './bugViews';
import type { PoseState } from './poses';
import { EXPRESSIONS, expressionFrame, poseFrame, posesFor } from './poses';
import { SpriteBugView } from './spriteBug';

/** Looks laid over the drawn bug to check tinting: potions, tags, and night. */
export const LAB_LOOKS = ['plain', 'paint', 'rainbow', 'ghost', 'wet', 'frozen', 'night'] as const;
export type LabLook = (typeof LAB_LOOKS)[number];

const ZOOMS = [1, 2, 4] as const;
const PAPER = 0xf6efe0;
const GROUND = 0xd9c9a3;

interface Cell {
  state: PoseState | null;
  expression: (typeof EXPRESSIONS)[number] | null;
  code: BugSprite;
  drawn: BugSprite;
  box: Container;
}

const font = (size: number, bold = false) => ({
  fontFamily: 'sans-serif',
  fontSize: size,
  fontWeight: bold ? ('bold' as const) : ('normal' as const),
  fill: OUTLINE,
});

/**
 * The Art Lab (docs/06-art-guide.md, B9): one bug in every pose, expression,
 * and special form, the code-drawn bug beside the drawn one, with the
 * importer's report. Dev builds open it with `pnpm art:watch`; tests with
 * `__bb.artLab(id)`. Built on the real views: no separate drawing code.
 */
export class ArtLab extends Container {
  def: BugDef;
  zoom: (typeof ZOOMS)[number] = 1;
  look: LabLook = 'plain';
  /** The pose shown big when zoomed in. */
  focus = 0;
  private time = 0;
  private cells: Cell[] = [];
  private readonly grid = new Container();
  private readonly header = new Container();
  private readonly report = new Text({
    text: '',
    style: { ...font(18), wordWrap: true, wordWrapWidth: 820 },
  });
  private readonly title = new Text({ text: '', style: font(30, true) });
  private readonly status = new Text({ text: '', style: font(18) });
  private version = -1;
  private readonly unlisten: () => void;
  /** Named buttons, for tests: their centers in stage pixels. */
  readonly buttons = new Map<string, Container>();

  constructor(
    bugId: string,
    private readonly store: ArtStore = artStore,
  ) {
    super();
    this.label = 'art lab';
    this.def = CONTENT.bugs.get(bugId);
    markUi(this);
    this.eventMode = 'static';
    this.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    const bg = new Graphics().rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(PAPER);
    this.addChild(bg, this.grid, this.header);
    this.title.position.set(30, 18);
    this.status.position.set(30, 58);
    this.report.position.set(1060, 18);
    this.header.addChild(this.title, this.status, this.report);
    const buttons: [string, string, () => void][] = [
      ['prev', '< bug', () => this.step(-1)],
      ['next', 'bug >', () => this.step(1)],
      ['zoom', 'zoom', () => this.setZoom(ZOOMS[(ZOOMS.indexOf(this.zoom) + 1) % ZOOMS.length]!)],
      ['look', 'look', () => this.setLook(LAB_LOOKS[(LAB_LOOKS.indexOf(this.look) + 1) % LAB_LOOKS.length]!)],
      ['close', 'close', () => this.emit('close')],
    ];
    buttons.forEach(([name, text, act], i) => {
      const b = this.button(text, act);
      b.position.set(30 + i * 118, 92);
      this.buttons.set(name, b);
      this.header.addChild(b);
    });
    this.unlisten = this.store.onChange(() => (this.version = -1));
    this.rebuild();
  }

  private button(text: string, act: () => void): Container {
    const c = markUi(new Container());
    const t = new Text({ text, style: font(18, true) });
    const w = 108;
    c.addChild(
      new Graphics().roundRect(0, 0, w, 34, 10).fill(0xffffff).stroke({ width: 3, color: OUTLINE }),
      t,
    );
    t.position.set((w - t.width) / 2, 6);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      act();
    });
    return c;
  }

  private step(d: number): void {
    const all = CONTENT.bugs.all;
    const i = all.findIndex((b) => b.id === this.def.id);
    this.show(all[(i + d + all.length) % all.length]!.id);
  }

  show(bugId: string): void {
    this.def = CONTENT.bugs.get(bugId);
    this.focus = 0;
    this.version = -1;
  }

  setZoom(z: (typeof ZOOMS)[number]): void {
    this.zoom = z;
    this.version = -1;
  }

  setLook(l: LabLook): void {
    this.look = l;
  }

  /** Is the bug drawn from art in the lab right now, and why not if it isn't. */
  state(): { bugId: string; drawn: boolean; reason: string; cells: number; zoom: number; look: LabLook } {
    const st = this.store.status(this.def);
    return {
      bugId: this.def.id,
      drawn: st.drawn,
      reason: st.reason,
      cells: this.cells.length,
      zoom: this.zoom,
      look: this.look,
    };
  }

  private rebuild(): void {
    this.version = this.store.version;
    for (const c of this.cells) c.box.destroy({ children: true });
    this.cells = [];
    this.grid.removeChildren();
    const def = this.def;
    const st = this.store.status(def);
    this.title.text = `Art Lab: ${def.name} the ${def.species.toLowerCase()}`;
    this.status.text = st.drawn
      ? 'Left: drawn by code. Right: your drawing.'
      : `Your drawing isn't showing: ${st.reason}. Both sides are drawn by code.`;
    const report = this.store.get(def.id)?.entry.report ?? [];
    const marks = { error: 'x', warning: '!', info: '-' } as const;
    this.report.text = report.length
      ? report
          .slice(0, 8)
          .map((m) => `${marks[m.level]} ${m.text}`)
          .join('\n')
      : st.drawn
        ? 'No problems.'
        : '';
    const poses = posesFor(def);
    const r = def.radius * 100;
    if (this.zoom > 1) {
      const state = poses[this.focus % poses.length]!;
      this.addCell(
        state,
        null,
        20,
        150,
        VIEW_WIDTH_PX - 40,
        VIEW_HEIGHT_PX - 170,
        this.zoom * Math.min(1, 60 / r),
      );
      return;
    }
    const cellW = 372;
    const cellH = 200;
    // Fit the code-drawn and the drawn bug side by side in a cell, however wide the bug is.
    const k = Math.min(1.4, 115 / bugSpan(def));
    poses.forEach((state, i) => {
      this.addCell(
        state,
        null,
        20 + (i % 5) * (cellW + 6),
        140 + Math.floor(i / 5) * (cellH + 6),
        cellW,
        cellH,
        k,
      );
    });
    const top = 140 + Math.ceil(poses.length / 5) * (cellH + 6) + 4;
    EXPRESSIONS.forEach((e, i) => {
      this.addCell(null, e, 20 + (i % 7) * 266, top + Math.floor(i / 7) * 150, 260, 144, k * 0.8);
    });
  }

  private addCell(
    state: PoseState | null,
    expression: (typeof EXPRESSIONS)[number] | null,
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
  ): void {
    const box = new Container();
    box.position.set(x, y);
    box.addChild(
      new Graphics().roundRect(0, 0, w, h, 14).fill(0xfffaf0).stroke({ width: 2, color: 0xd8ccb0 }),
    );
    const ground = h - 26;
    box.addChild(new Graphics().rect(8, ground, w - 16, 6).fill(GROUND));
    const code = new BugSprite(this.def);
    const drawn = makeBugView(this.def, this.store);
    for (const [v, at] of [
      [code, w * 0.27],
      [drawn, w * 0.73],
    ] as const) {
      v.scale.set(k);
      v.position.set(at, ground - v.foot * k);
      box.addChild(v);
    }
    const name = new Text({ text: state?.label ?? expression!.id, style: font(16, true) });
    name.position.set(10, 6);
    box.addChild(name);
    if (state) {
      box.eventMode = 'static';
      box.on('pointerdown', () => {
        this.focus = this.cells.findIndex((c) => c.box === box);
        if (this.zoom === 1) this.setZoom(2);
      });
    }
    this.grid.addChild(box);
    this.cells.push({ state, expression, code, drawn, box });
  }

  /** The frame for a cell now, with the current look. */
  private frameFor(c: Cell, t: number): BugFrame {
    const f = c.state ? poseFrame(c.state, t) : expressionFrame(c.expression!, t);
    if (this.look === 'paint') f.paint = ['paint_blue', 'paint_yellow'];
    return f;
  }

  private lookTint(t: number): { tint: number; alpha: number } {
    switch (this.look) {
      case 'rainbow': {
        const h = (t * 0.5) % 1;
        const c = (o: number): number => Math.round(160 + 95 * Math.sin((h + o) * Math.PI * 2));
        return { tint: (c(0) << 16) | (c(1 / 3) << 8) | c(2 / 3), alpha: 1 };
      }
      case 'ghost':
        return { tint: 0xe8f4ff, alpha: 0.45 };
      case 'wet':
        return { tint: 0xa8c8ff, alpha: 1 };
      case 'frozen':
        return { tint: 0xc4ecff, alpha: 1 };
      case 'night':
        return { tint: 0x6a74b8, alpha: 1 };
      default:
        return { tint: 0xffffff, alpha: 1 };
    }
  }

  update(dt: number): void {
    if (this.version !== this.store.version) this.rebuild();
    this.time += dt;
    const look = this.lookTint(this.time);
    for (const c of this.cells) {
      const f = this.frameFor(c, this.time);
      c.code.update(f);
      c.drawn.update({ ...f });
      for (const v of [c.code, c.drawn]) {
        v.tint = look.tint;
        v.alpha = look.alpha;
      }
    }
  }

  /** How many cells show the drawn bug from sprites (test hook). */
  drawnCells(): number {
    return this.cells.filter((c) => c.drawn instanceof SpriteBugView).length;
  }

  override destroy(): void {
    this.unlisten();
    super.destroy({ children: true });
  }
}
