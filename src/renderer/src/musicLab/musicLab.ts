import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { Container, Graphics, Text } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { MusicLayer } from '../../../shared/music';
import { MUSIC_LAYERS } from '../../../shared/music';
import type { MusicLibrary } from '../audio/musicManifest';
import { OUTLINE } from '../render/palette';
import { markUi } from '../ui/button';
import type { LabArea, LabDemo, LabTab } from './labPlan';
import { LAB_TABS, buildDemos } from './labPlan';
import { LAYER_WORDS, percent, readoutLines } from './labReadout';
import type { LabHost } from './labRunner';
import { LabRunner } from './labRunner';

/** What the panel needs besides the runner's host: the library, to build its list, and the mutes. */
export interface MusicLabHost extends LabHost {
  library(): MusicLibrary;
  areas(): readonly LabArea[];
  override(mute: readonly MusicLayer[], solo: readonly MusicLayer[]): void;
  /** Called every frame the lab is open: the lab counts as the player being there (no idle hush). */
  awake(): void;
}

const WIDTH = 700;
const HEIGHT = VIEW_HEIGHT_PX - 40;
const PAD = 18;
const ROW = 30;
/** Rows on a page of the list. */
export const LAB_PAGE = 20;
const LIST_Y = 380;
const PAPER = 0xf6efe0;
const ON = 0xffd75e;
const GREY = 0x6b5a6e;

const font = (size: number, bold = false, fill = OUTLINE) => ({
  fontFamily: 'sans-serif',
  fontSize: size,
  fontWeight: bold ? ('bold' as const) : ('normal' as const),
  fill,
});

/** A plain button that can be lit. */
class LabButton extends Container {
  private readonly bg = new Graphics();
  private lit = false;

  constructor(
    text: string,
    private readonly w: number,
    private readonly h: number,
    act: () => void,
  ) {
    super();
    markUi(this);
    const t = new Text({ text, style: font(Math.min(16, h - 10), true) });
    this.addChild(this.bg, t);
    t.position.set(Math.round((w - t.width) / 2), Math.round((h - t.height) / 2));
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      act();
    });
    this.draw();
  }

  setLit(v: boolean): void {
    if (v === this.lit) return;
    this.lit = v;
    this.draw();
  }

  private draw(): void {
    this.bg
      .clear()
      .roundRect(0, 0, this.w, this.h, 8)
      .fill(this.lit ? ON : 0xffffff)
      .stroke({ width: 2, color: OUTLINE });
  }
}

/**
 * The Music Lab: a panel for judging the music by ear (docs/04-architecture.md,
 * "The Music Lab"). A list of changes to hear, each with a Play button; a
 * readout of what is playing; mute and solo for the four layers; and Stop.
 * Dev builds open it with `pnpm music:lab`; tests with `__bb.musicLab(true)`.
 * It stages scenes with sim commands and changes nothing else in the sim.
 */
export class MusicLab extends Container {
  readonly runner: LabRunner;
  demos: LabDemo[] = [];
  tab: LabTab = 'borders';
  page = 0;
  readonly mute = new Set<MusicLayer>();
  readonly solo = new Set<MusicLayer>();
  /** Named buttons, for tests: `stop`, `tab:<id>`, `page:prev`, `page:next`, `mute:<layer>`, `solo:<layer>`, and `play:<demo id>` for the rows showing. */
  readonly buttons = new Map<string, LabButton>();
  private readonly status = new Text({
    text: '',
    style: { ...font(17, true), wordWrap: true, wordWrapWidth: WIDTH - 2 * PAD },
  });
  private readonly readout = new Text({
    text: '',
    style: { ...font(16), wordWrap: true, wordWrapWidth: WIDTH - 2 * PAD, lineHeight: 21 },
  });
  private readonly gains = new Map<MusicLayer, Text>();
  private readonly list = new Container();
  private readonly pageText = new Text({ text: '', style: font(15) });
  private readonly rowButtons = new Map<string, LabButton>();
  private library: MusicLibrary | null = null;

  constructor(private readonly host: MusicLabHost) {
    super();
    this.label = 'music lab';
    this.runner = new LabRunner(host);
    markUi(this);
    this.eventMode = 'static';
    // Clicks and the wheel stop here: the world behind keeps still.
    this.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.on('wheel', (e: FederatedWheelEvent) => e.stopPropagation());
    this.position.set(VIEW_WIDTH_PX - WIDTH - 20, 20);
    this.addChild(
      new Graphics()
        .roundRect(0, 0, WIDTH, HEIGHT, 18)
        .fill({ color: PAPER, alpha: 0.95 })
        .stroke({ width: 4, color: OUTLINE }),
    );
    const title = new Text({ text: 'Music Lab', style: font(28, true) });
    title.position.set(PAD, 12);
    this.status.position.set(PAD, 52);
    this.readout.position.set(PAD, 124);
    this.addChild(title, this.status, this.readout);
    this.place('stop', new LabButton('Stop and reset', 180, 34, () => this.reset()), WIDTH - PAD - 180, 12);

    // The four layers: how loud each is now, with Mute and Solo.
    const colW = (WIDTH - 2 * PAD) / MUSIC_LAYERS.length;
    MUSIC_LAYERS.forEach((layer, i) => {
      const x = PAD + i * colW;
      const name = new Text({ text: LAYER_WORDS[layer], style: font(16, true) });
      name.position.set(x, 264);
      const gain = new Text({ text: '', style: font(16) });
      gain.position.set(x + colW - 62, 264);
      this.gains.set(layer, gain);
      this.addChild(name, gain);
      this.place(`mute:${layer}`, new LabButton('Mute', 74, 30, () => this.toggle(this.mute, layer)), x, 290);
      this.place(
        `solo:${layer}`,
        new LabButton('Solo', 74, 30, () => this.toggle(this.solo, layer)),
        x + 80,
        290,
      );
    });

    const tabW = (WIDTH - 2 * PAD - 4 * 6) / LAB_TABS.length;
    LAB_TABS.forEach((t, i) => {
      this.place(
        `tab:${t.id}`,
        new LabButton(t.label, tabW, 32, () => this.show(t.id)),
        PAD + i * (tabW + 6),
        336,
      );
    });
    this.list.position.set(PAD, LIST_Y);
    this.addChild(this.list);
    const pagerY = LIST_Y + LAB_PAGE * ROW + 8;
    this.place('page:prev', new LabButton('Previous', 110, 30, () => this.turn(-1)), PAD, pagerY);
    this.place('page:next', new LabButton('Next', 110, 30, () => this.turn(1)), PAD + 118, pagerY);
    this.pageText.position.set(PAD + 244, pagerY + 6);
    this.addChild(this.pageText);
    this.rebuild();
  }

  private place(name: string, b: LabButton, x: number, y: number): void {
    b.position.set(x, y);
    this.buttons.set(name, b);
    this.addChild(b);
  }

  /** The demos on a tab, in order. */
  onTab(tab: LabTab): LabDemo[] {
    return this.demos.filter((d) => d.tab === tab);
  }

  get pages(): number {
    return Math.max(1, Math.ceil(this.onTab(this.tab).length / LAB_PAGE));
  }

  show(tab: LabTab, page = 0): void {
    this.tab = tab;
    this.page = Math.max(0, Math.min(page, this.pages - 1));
    this.layout();
  }

  private turn(d: number): void {
    this.show(this.tab, this.page + d);
  }

  private toggle(set: Set<MusicLayer>, layer: MusicLayer): void {
    if (set.has(layer)) set.delete(layer);
    else set.add(layer);
    this.sendOverride();
  }

  private sendOverride(): void {
    this.host.override([...this.mute], [...this.solo]);
    for (const l of MUSIC_LAYERS) {
      this.buttons.get(`mute:${l}`)!.setLit(this.mute.has(l));
      this.buttons.get(`solo:${l}`)!.setLit(this.solo.has(l));
    }
  }

  play(id: string): boolean {
    const demo = this.demos.find((d) => d.id === id);
    if (!demo) return false;
    this.runner.play(demo);
    return true;
  }

  /** Stop the demo and clear the mutes and solos: the music is the game's own again. */
  reset(): void {
    this.runner.stop('Stopped. The music follows the game again.');
    this.mute.clear();
    this.solo.clear();
    this.sendOverride();
  }

  /** The list again from the manifest (it arrives a moment after the game starts). */
  private rebuild(): void {
    this.library = this.host.library();
    this.demos = buildDemos(this.library, this.host.areas());
    this.show(this.tab, this.page);
  }

  private layout(): void {
    for (const id of this.rowButtons.keys()) this.buttons.delete(`play:${id}`);
    this.rowButtons.clear();
    for (const c of this.list.removeChildren()) c.destroy({ children: true });
    const all = this.onTab(this.tab);
    all.slice(this.page * LAB_PAGE, (this.page + 1) * LAB_PAGE).forEach((demo, i) => {
      const y = i * ROW;
      const b = new LabButton('Play', 62, ROW - 4, () => this.runner.play(demo));
      b.position.set(0, y);
      const label = new Text({ text: demo.label, style: font(16) });
      label.position.set(74, y + 3);
      const detail = new Text({ text: demo.detail, style: font(13, false, GREY) });
      detail.position.set(WIDTH - 2 * PAD - detail.width, y + 6);
      this.list.addChild(b, label, detail);
      this.rowButtons.set(demo.id, b);
      this.buttons.set(`play:${demo.id}`, b);
    });
    for (const t of LAB_TABS) this.buttons.get(`tab:${t.id}`)!.setLit(t.id === this.tab);
    const many = this.pages > 1;
    this.buttons.get('page:prev')!.visible = many;
    this.buttons.get('page:next')!.visible = many;
    this.pageText.text = many ? `Page ${this.page + 1} of ${this.pages}` : '';
  }

  update(dt: number): void {
    if (this.library !== this.host.library()) this.rebuild();
    this.host.awake();
    this.runner.update(dt);
    const r = this.host.report();
    const running = this.runner.running;
    for (const [id, b] of this.rowButtons) b.setLit(id === running);
    this.setText(this.status, this.runner.status);
    this.setText(this.readout, readoutLines(r, this.library!, this.host.areas()).join('\n'));
    for (const l of MUSIC_LAYERS) this.setText(this.gains.get(l)!, percent(r.heard[l]));
  }

  private setText(t: Text, text: string): void {
    if (t.text !== text) t.text = text;
  }

  override destroy(): void {
    this.runner.stop();
    this.host.override([], []);
    super.destroy({ children: true });
  }
}
