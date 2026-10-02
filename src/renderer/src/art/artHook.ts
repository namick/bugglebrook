import { CONTENT } from '../../../game/data';
import type { Game } from '../app/game';
import { BugSprite } from '../render/draw/bug';
import type { LabLook } from './artLab';
import type { ArtMode, ArtPack } from './artStore';
import { artStore } from './artStore';
import { FACE_KIT_ID } from './kit';
import type { ArtMessage } from './rigFile';
import type { SpriteShown } from './spriteBug';
import { SpriteBugView } from './spriteBug';
import type { TemplateGuides } from './template';
import { bugTemplate, kitTemplate } from './template';

/** The art pipeline's part of the test hook (window.__bb). */
export interface ArtHook {
  /** Every asset an art template can be made for: the bugs and the face kit. */
  artIds(): string[];
  /** Draw a template's guides (the generator, `pnpm art:templates`). `keep` reuses a canvas being drawn on. */
  artTemplate(
    id: string,
    keep?: { canvas: { w: number; h: number }; origin: { x: number; y: number } } | null,
  ): TemplateGuides;
  /** Draw bugs from their art where it's complete ('drawn'), or always by code. Tests start in 'code'. */
  artMode(mode: ArtMode): void;
  /** Install built art (what `pnpm art:build` writes), as the hot reload does. */
  loadArtPack(pack: ArtPack): Promise<void>;
  /** How a bug entity is drawn right now, and why. */
  bugArt(id: number): { art: 'drawn' | 'code'; reason: string; shown: SpriteShown | null } | null;
  /** The importer's report for an asset. */
  artReport(id: string): ArtMessage[];
  /** Open the Art Lab on a bug, or close it with null. */
  artLab(bugId: string | null): void;
  /** The Art Lab's state, or null when it is closed. */
  artLabState(): {
    bugId: string;
    drawn: boolean;
    reason: string;
    cells: number;
    drawnCells: number;
    zoom: number;
    look: LabLook;
  } | null;
  /** Client position of an Art Lab button. */
  artLabButton(name: string): { x: number; y: number } | null;
  /** Set the Art Lab's zoom, look, and the pose shown big when zoomed. */
  artLabSet(opts: { zoom?: 1 | 2 | 4; look?: LabLook; focus?: number }): void;
  /** Draw art from its 1x or 2x pages whatever the resolution, or null to choose by resolution. */
  artScale(scale: 1 | 2 | null): void;
  /** Run the Art Lab `n` frames at 60 Hz right now. */
  artLabFrames(n: number): void;
}

export function artHook(game: Game): ArtHook {
  const toClient = (x: number, y: number): { x: number; y: number } => {
    const rect = game.app.canvas.getBoundingClientRect();
    const k = rect.width / 1920;
    return { x: rect.left + x * k, y: rect.top + y * k };
  };
  return {
    artIds: () => [...CONTENT.bugs.all.map((d) => d.id), FACE_KIT_ID],
    artTemplate: (id, keep = null) =>
      id === FACE_KIT_ID
        ? kitTemplate(game.app.renderer)
        : bugTemplate(game.app.renderer, CONTENT.bugs.get(id), keep),
    artMode: (mode) => artStore.setMode(mode),
    loadArtPack: (pack) => artStore.install(pack),
    bugArt: (id) => {
      const s = game.session;
      const view = s?.sim.view(id);
      if (!s || !view?.bug) return null;
      const sprite = s.view.sprites.get(id);
      const def = CONTENT.bugs.get(view.defId);
      const status = artStore.status(def);
      if (sprite instanceof SpriteBugView)
        return { art: 'drawn', reason: status.reason, shown: sprite.shown };
      if (sprite instanceof BugSprite) return { art: 'code', reason: status.reason, shown: null };
      // Not drawn yet this frame: report what it will be.
      return { art: status.drawn ? 'drawn' : 'code', reason: status.reason, shown: null };
    },
    artReport: (id) => artStore.get(id)?.entry.report ?? [],
    artLab: (bugId) => (bugId ? game.openArtLab(bugId) : game.closeArtLab()),
    artLabState: () => {
      const lab = game.artLab;
      return lab ? { ...lab.state(), drawnCells: lab.drawnCells() } : null;
    },
    artLabButton: (name) => {
      const b = game.artLab?.buttons.get(name);
      if (!b) return null;
      const p = b.getGlobalPosition();
      return toClient(p.x + 54, p.y + 17);
    },
    artLabSet: ({ zoom, look, focus }) => {
      const lab = game.artLab;
      if (!lab) return;
      if (focus !== undefined) lab.focus = focus;
      if (look) lab.setLook(look);
      if (zoom) lab.setZoom(zoom);
      else if (focus !== undefined) lab.setZoom(lab.zoom);
    },
    artScale: (scale) => {
      SpriteBugView.forceScale = scale;
    },
    artLabFrames: (n) => {
      for (let i = 0; i < n; i++) game.artLab?.update(1 / 60);
    },
  };
}
