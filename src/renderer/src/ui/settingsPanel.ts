import { Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { Settings } from '../../../shared/settings';
import { artStore } from '../art/artStore';
import { OUTLINE } from '../render/palette';
import { Bounce, PictureButton, markUi } from './button';
import { Toggle, VineSlider, drawBoard } from './controls';
import {
  calmIcon,
  edgeIcon,
  fullscreenIcon,
  mouthIcon,
  noteIcon,
  playIcon,
  shellSpeakerIcon,
  signIcon,
  token,
} from './icons';

export type VolumeKey = 'music' | 'sfx' | 'voices';
export type ToggleKey = 'fullscreen' | 'reduceMotion' | 'edgeScroll' | 'recordedVoices';

const BOARD_W = 980;
const BOARD_H = 780;
const TRACK = 470;

export interface PanelHooks {
  get(): Settings;
  set(change: Partial<Settings>, done: boolean): void;
  /** A soft UI sound: a tick for a slider (pitched by value), a pop for a toggle. */
  sound(kind: 'tick' | 'toggle' | 'open' | 'close', value?: number): void;
  resume(): void;
  /** The artist recorded voices: show the toggle between them and the synth voices. */
  recordedVoices?: boolean;
  /** Back to the main menu. Absent on the menu's own settings board. */
  toMenu?: () => void;
}

/**
 * The pause and settings board (game design doc, section 17): dims what is
 * behind it and drops in a wooden board with three vine sliders (music,
 * sounds, voices) and three toggles (fullscreen, reduce motion, edge
 * scroll). In the world it also has the stump sign (save and go to the
 * menu) and the play triangle (resume). A named art selector sits below them.
 */
export class SettingsPanel extends Container {
  readonly sliders = new Map<VolumeKey, VineSlider>();
  readonly toggles = new Map<ToggleKey, Toggle>();
  readonly buttons = new Map<'resume' | 'menu' | 'art_prev' | 'art_next', PictureButton>();
  private readonly artLabel = new Text({
    text: '',
    style: { fontFamily: 'sans-serif', fontSize: 24, fill: OUTLINE },
  });
  private readonly artCredit = new Text({
    text: '',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 18,
      fill: OUTLINE,
      wordWrap: true,
      wordWrapWidth: 680,
      breakWords: true,
      align: 'center',
    },
  });
  private readonly dim = new Graphics();
  private readonly board = new Container();
  private readonly drop = new Bounce(260, 15);
  private time = 0;
  private closing = false;
  onClosed: (() => void) | null = null;

  constructor(private readonly hooks: PanelHooks) {
    super();
    markUi(this);
    this.eventMode = 'static';
    // The dim blocks the world behind; a click on it resumes.
    this.dim.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill({ color: 0x1d1430, alpha: 0.45 });
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.dim.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.resume();
    });
    this.addChild(this.dim, this.board);
    this.board.position.set(VIEW_WIDTH_PX / 2, VIEW_HEIGHT_PX / 2 - 30);
    this.board.eventMode = 'static';
    this.board.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.board.on('pointertap', (e: FederatedPointerEvent) => e.stopPropagation());
    this.build();
    this.drop.value = 0;
    this.drop.target = 1;
    this.hooks.sound('open');
  }

  private build(): void {
    const s = this.hooks.get();
    const back = drawBoard(new Graphics(), BOARD_W, BOARD_H);
    this.board.addChild(back);
    // A leafy vine draped over the top edge.
    const vine = new Graphics();
    vine.moveTo(-BOARD_W / 2 + 40, -BOARD_H / 2 + 4);
    for (let x = -BOARD_W / 2 + 40; x <= BOARD_W / 2 - 40; x += 20)
      vine.lineTo(x, -BOARD_H / 2 + 4 + Math.sin(x / 40) * 8);
    vine.stroke({ width: 9, color: 0x3f9a34, cap: 'round' });
    for (let x = -BOARD_W / 2 + 70; x < BOARD_W / 2 - 40; x += 70) {
      const y = -BOARD_H / 2 + 4 + Math.sin(x / 40) * 8;
      vine
        .ellipse(x, y + 12, 14, 8)
        .fill(0x7bd84a)
        .stroke({ width: 3, color: OUTLINE });
    }
    this.board.addChild(vine);

    const rows: [VolumeKey, (g: Graphics, size: number) => Graphics][] = [
      ['music', noteIcon],
      ['sfx', shellSpeakerIcon],
      ['voices', mouthIcon],
    ];
    rows.forEach(([key, icon], i) => {
      const y = -BOARD_H / 2 + 110 + i * 112;
      const plate = token(new Graphics(), 46);
      plate.position.set(-BOARD_W / 2 + 130, y);
      icon(plate, 72);
      const slider = new VineSlider(TRACK, s[key]);
      slider.position.set(-BOARD_W / 2 + 220, y);
      slider.onChange = (value, done) => {
        this.hooks.set({ [key]: value }, done);
        this.hooks.sound('tick', value);
      };
      slider.label = `slider_${key}`;
      this.sliders.set(key, slider);
      this.board.addChild(plate, slider);
    });

    const toggles: [ToggleKey, (g: Graphics, size: number) => Graphics][] = [
      ['fullscreen', fullscreenIcon],
      ['reduceMotion', calmIcon],
      ['edgeScroll', edgeIcon],
    ];
    // Her recorded voices (docs/08-sound-brief.md, part 4), only once there are some.
    if (this.hooks.recordedVoices) toggles.push(['recordedVoices', mouthIcon]);
    toggles.forEach(([key, icon], i) => {
      const t = new Toggle(icon(new Graphics(), 70), s[key]);
      t.position.set(-BOARD_W / 2 + 150 + i * 170, BOARD_H / 2 - 270);
      t.onToggle = (on) => {
        this.hooks.set({ [key]: on }, true);
        this.hooks.sound('toggle', on ? 1 : 0);
      };
      t.label = `toggle_${key}`;
      this.toggles.set(key, t);
      this.board.addChild(t);
    });

    const artCaption = new Text({
      text: 'Art',
      style: { fontFamily: 'sans-serif', fontSize: 22, fill: OUTLINE },
    });
    artCaption.anchor.set(0.5);
    artCaption.position.set(-350, 260);
    this.artLabel.anchor.set(0.5);
    this.artLabel.position.set(-65, 250);
    this.artCredit.anchor.set(0.5, 0);
    this.artCredit.position.set(-65, 289);
    this.board.addChild(artCaption, this.artLabel, this.artCredit);
    for (const [key, direction, x] of [
      ['art_prev', -1, -275],
      ['art_next', 1, 150],
    ] as const) {
      const g = token(new Graphics(), 27, 0xfff1c7);
      g.moveTo(-direction * 7, -12)
        .lineTo(direction * 9, 0)
        .lineTo(-direction * 7, 12)
        .stroke({ color: OUTLINE, width: 5, cap: 'round', join: 'round' });
      const button = new PictureButton(g, 62, 62, () => {
        const options = artStore.options;
        const current = options.findIndex((o) => o.id === this.hooks.get().artSet);
        const next = options[(Math.max(0, current) + direction + options.length) % options.length]!;
        this.hooks.set({ artSet: next.id }, true);
        this.hooks.sound('toggle');
      });
      button.position.set(x, 260);
      button.label = key;
      this.buttons.set(key, button);
      this.board.addChild(button);
    }
    this.sync(s);

    // Resume (and in the world, back to the menu), at the right.
    const resumeArt = token(new Graphics(), 62, 0xfff1c7);
    playIcon(resumeArt, 100);
    const resume = new PictureButton(resumeArt, 140, 140, () => this.hooks.resume());
    resume.position.set(BOARD_W / 2 - 110, BOARD_H / 2 - 140);
    resume.label = 'resume';
    this.buttons.set('resume', resume);
    this.board.addChild(resume);
    if (this.hooks.toMenu) {
      const menuArt = token(new Graphics(), 62, 0xe6f4d9);
      signIcon(menuArt, 100);
      const toMenu = new PictureButton(menuArt, 140, 140, () => this.hooks.toMenu?.());
      toMenu.position.set(BOARD_W / 2 - 110, -BOARD_H / 2 + 150);
      toMenu.label = 'to_menu';
      this.buttons.set('menu', toMenu);
      this.board.addChild(toMenu);
    }
  }

  /** Slide away, then call `onClosed`. */
  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.drop.target = 0;
    this.hooks.sound('close');
  }

  get isClosing(): boolean {
    return this.closing;
  }

  /** Show settings changed elsewhere (the other board, a restart). */
  sync(s: Settings): void {
    const selected = artStore.options.find((o) => o.id === s.artSet);
    this.artLabel.text = selected?.name ?? 'Unavailable set';
    this.artCredit.text = selected?.credit ?? '';
    this.artLabel.scale.set(Math.min(1, 330 / Math.max(1, this.artLabel.width / this.artLabel.scale.x)));
    for (const [k, sl] of this.sliders) if (sl.value !== s[k]) sl.set(s[k]);
    for (const [k, t] of this.toggles) t.set(s[k]);
  }

  get artChoice(): { name: string; credit: string } {
    return { name: this.artLabel.text, credit: this.artCredit.text };
  }

  update(dt: number): void {
    this.time += dt;
    const k = this.drop.update(dt);
    const shown = Math.max(0, Math.min(1.2, k));
    this.dim.alpha = Math.min(1, shown);
    this.board.y = VIEW_HEIGHT_PX / 2 - 30 - (1 - k) * 900;
    this.board.rotation = (1 - k) * 0.12 + Math.sin(this.time * 1.3) * 0.004;
    for (const sl of this.sliders.values()) sl.update(dt);
    for (const t of this.toggles.values()) t.update(dt);
    for (const b of this.buttons.values()) b.update(dt);
    if (this.closing && k < 0.05) {
      this.visible = false;
      this.onClosed?.();
      this.onClosed = null;
    }
  }
}
