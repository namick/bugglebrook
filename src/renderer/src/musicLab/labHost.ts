import { VIEW_WIDTH_M } from '../../../game/constants';
import { CONTENT } from '../../../game/data';
import type { Game } from '../app/game';
import type { MusicLabHost } from './musicLab';

/** The instrument the "playing along" demo plays. */
const DEMO_INSTRUMENT = 'item_inst_leaf_xylophone';

/**
 * The Music Lab's hands on the game. It stages scenes the way a test does:
 * the sim hears only commands (`unlock`, `set_time`, `set_weather`), the
 * camera is the renderer's own, and the mutes, cuts, and jumps along the
 * loop live in the music engine, which no save ever sees.
 */
export function labHost(game: Game): MusicLabHost {
  const engine = game.music.engine;
  return {
    scene: () => (game.switchingScene ? 'busy' : game.scene === 'boot' ? 'busy' : game.scene),
    openWorld: () => void game.openSlot(0),
    openMenu: () => void game.showMenu(),
    stage: (hour, rain) => {
      const sim = game.session?.sim;
      if (!sim) return;
      for (const a of sim.content.areas.all)
        if (!a.hidden && !sim.barriers.isOpen(a.id)) sim.send({ type: 'unlock', area: a.id });
      sim.send({ type: 'set_time', hour });
      sim.send({ type: 'set_weather', wind: 0, rain });
    },
    rain: (on) => game.session?.sim.send({ type: 'set_weather', wind: 0, rain: on }),
    camera: (centerX, seconds) => {
      const s = game.session;
      if (!s) return;
      const cam = s.camera;
      // A hidden area's sealed stretch becomes the camera's limits first, as on the way through a door.
      const open = s.sim.barriers.view(centerX);
      cam.setLimits(open.x0, open.x1, s.sim.barriers.region(centerX));
      const x = centerX - VIEW_WIDTH_M / 2;
      if (seconds > 0) return cam.glideTo(x, seconds);
      cam.stopGlide();
      cam.velocity = 0;
      cam.set(Math.min(cam.restMax, Math.max(cam.restMin, x)));
    },
    report: () => engine.report(),
    cutting: (on) => engine.setCutting(on),
    seek: (bars) => engine.seekBeforeLoop(bars),
    note: () => game.music.playerNote(DEMO_INSTRUMENT),
    library: () => engine.library,
    areas: () => CONTENT.areas.all,
    override: (mute, solo) => engine.setOverride({ mute, solo }),
    awake: () => game.music.input(),
  };
}
