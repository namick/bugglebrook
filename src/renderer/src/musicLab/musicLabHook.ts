import type { Game } from '../app/game';
import type { LabTab } from './labPlan';
import { LAB_PAGE } from './musicLab';

/** The Music Lab's part of `window.__bb` (test mode only). */
export interface MusicLabHook {
  /** Open or close the Music Lab panel (dev builds open it with `pnpm music:lab`). */
  musicLab(open: boolean): void;
  /**
   * What the lab shows: every demo with its tab and the page of that tab it
   * is on, the tab and page showing, the demo running and its step, the
   * status line, and the mutes and solos. Null when the lab is closed.
   */
  musicLabState(): {
    tab: LabTab;
    page: number;
    pages: number;
    demos: { id: string; tab: LabTab; page: number; label: string; detail: string }[];
    running: string | null;
    step: { step: number; of: number } | null;
    status: string;
    mute: string[];
    solo: string[];
  } | null;
  /**
   * The center of one of the lab's buttons in client pixels, or null if it
   * is not showing: `stop`, `tab:<id>`, `page:prev`, `page:next`,
   * `mute:<layer>`, `solo:<layer>`, and `play:<demo id>` for a row on the
   * open tab and page.
   */
  musicLabButton(name: string): { x: number; y: number } | null;
}

export function musicLabHook(game: Game): MusicLabHook {
  return {
    musicLab: (open) => (open ? game.openMusicLab() : game.closeMusicLab()),
    musicLabState: () => {
      const lab = game.musicLab;
      if (!lab) return null;
      const seen = new Map<LabTab, number>();
      return {
        tab: lab.tab,
        page: lab.page,
        pages: lab.pages,
        demos: lab.demos.map((d) => {
          const n = seen.get(d.tab) ?? 0;
          seen.set(d.tab, n + 1);
          return { id: d.id, tab: d.tab, page: Math.floor(n / LAB_PAGE), label: d.label, detail: d.detail };
        }),
        running: lab.runner.running,
        step: lab.runner.progress,
        status: lab.runner.status,
        mute: [...lab.mute],
        solo: [...lab.solo],
      };
    },
    musicLabButton: (name) => {
      const b = game.musicLab?.buttons.get(name);
      if (!b || !b.visible) return null;
      const bounds = b.getBounds();
      const rect = game.app.canvas.getBoundingClientRect();
      const k = rect.width / 1920;
      return {
        x: rect.left + (bounds.x + bounds.width / 2) * k,
        y: rect.top + (bounds.y + bounds.height / 2) * k,
      };
    },
  };
}
