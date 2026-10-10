import type { Game } from '../app/game';
import { artStore } from './artStore';
import { STRIP_LAYERS } from './backdropData';
import type { BackdropPack, StripLayer } from './backdropData';
import { backdropStore } from './backdropStore';
import type { StripGuides } from './backdropTemplate';
import { stripIds, stripTemplate } from './backdropTemplate';

/** What the backdrop is drawn from right now. */
export interface BackdropLook {
  /** Is the selected set's backdrop the one showing? False while its pictures load. */
  ready: boolean;
  /** The art set whose backdrop shows, or null for the game's own look. */
  set: string | null;
  /** The set has its own sky. */
  sky: boolean;
  /** How many rules its tone map has, and how many of the code-drawn world's colors they changed. */
  tone: number;
  toned: number;
  /** Per layer: the strips the set has, and the ones drawn into the backdrop on screen now. */
  strips: Record<StripLayer, { has: string[]; drawn: string[] }>;
}

/** The backdrop's part of the test hook (window.__bb). */
export interface BackdropHook {
  /** Every strip a template can be made for: `<area>_far` and `<area>_mid` for each area under the sky. */
  backdropIds(): string[];
  /** Draw a strip template's guides (the generator, `scripts/art/backdropTemplates.ts`). */
  backdropTemplate(id: string, scale: 1 | 2): StripGuides;
  /** What the open world's backdrop is drawn from, or null with no world open. */
  backdrop(): BackdropLook | null;
  /**
   * Install a built backdrop (what `pnpm art:build` writes) for an art set and
   * wait until it is ready to show. A set the game does not know is added to
   * the settings board's list. Select it with `artSelect`.
   */
  loadBackdrop(pack: BackdropPack, id: string, name?: string): Promise<void>;
}

export function backdropHook(game: Game): BackdropHook {
  return {
    backdropIds: () => stripIds(),
    backdropTemplate: (id, scale) => {
      const layer = STRIP_LAYERS.find((l) => id.endsWith(`_${l}`)) as StripLayer | undefined;
      if (!layer) throw new Error(`${id} is not a strip: it must end in _far or _mid.`);
      return stripTemplate(game.app.renderer, id.slice(0, -layer.length - 1), layer, scale);
    },
    backdrop: () => {
      const view = game.session?.view;
      if (!view) return null;
      backdropStore.sync();
      const look = view.backdropLook();
      // Ready once the store has the set's pictures and the view has redrawn with them.
      const ready = backdropStore.ready && look.set === (backdropStore.current?.id ?? null);
      return { ready, ...look };
    },
    loadBackdrop: async (pack, id, name = id) => {
      backdropStore.install(id, pack);
      artStore.registerSet({ id, name, credit: 'Test artwork' });
      await backdropStore.whenReady();
    },
  };
}
