// The sim applies each command here at the start of a step: grabs, drags, releases, pokes, the
// pocket, and the debug commands.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { Command } from './commands';
import { SIM_HZ } from './core/loop';
import { FLING_SPEED, MAX_FLING_SPEED } from './constants';
import { NEED_IDS } from './data/types';
import {
  beckonBug,
  napBug,
  pokedBug,
  react,
  releaseBug,
  shakeBug,
  tickleBug,
  wakeBug,
} from './systems/bugAi';
import type { WeatherId } from './systems/sky';
import { isPocketSlot } from './systems/pocket';
import type { Sim } from './sim';
import { HEAVY_FLING, TAG_SET } from './simShared';

export function apply(sim: Sim, command: Command): void {
  switch (command.type) {
    case 'grab': {
      const id = sim.physics.bodyAt(command.x, command.y, 0.2);
      let entity = id === null ? undefined : sim.entities.get(id);
      if (!entity) return;
      // Things in the bench's trays stay put while it shakes.
      if (sim.bench.locked(entity.id)) return;
      const def = entity.kind === 'item' ? sim.content.items.get(entity.defId) : null;
      sim.physics.grab(entity.id, command.x, command.y, def?.drag ?? 1);
      sim.bench.taken(entity.id);
      entity = sim.places.grabbed(entity, command.x, command.y);
      sim.bench.pickedUp(entity);
      sim.toys.grabbed(entity, command.x, command.y);
      if (entity.bug?.pending) sim.cast.grabbed(entity);
      // Grabbed without warning, Whiff lets off a stink cloud.
      sim.puff(entity, false);
      sim.setup.touch(entity.id);
      sim.events.emit('item_grabbed', {
        id: entity.id,
        kind: entity.kind,
        defId: entity.defId,
        x: command.x,
        y: command.y,
      });
      // Picking up something that glows flashes its light about: the fireflies notice.
      // (A lamp counts when its click switches it, not when it is picked up.)
      if (sim.glows(entity) && !(entity.kind === 'item' && sim.content.items.get(entity.defId).lamp))
        sim.weather.noteLight(command.x, command.y);
      return;
    }
    case 'drag': {
      // The hand cannot push what it holds through a locked area's wall.
      const held = sim.physics.grabbed;
      let x = command.x;
      if (held !== null) {
        const span = sim.barriers.span();
        const at = sim.physics.position(held).x;
        if (at >= span.x0 && at <= span.x1) x = Math.min(span.x1 - 0.05, Math.max(span.x0 + 0.05, x));
      }
      sim.physics.moveGrab(x, command.y);
      return;
    }
    case 'release': {
      const cursor =
        command.vx !== undefined && command.vy !== undefined ? { x: command.vx, y: command.vy } : undefined;
      const heldNow = sim.physics.grabbed === null ? undefined : sim.entities.get(sim.physics.grabbed);
      // A heavy bug cannot be flung hard.
      const cap = heldNow && sim.potions.has(heldNow, 'heavy') ? HEAVY_FLING : MAX_FLING_SPEED;
      const id = sim.physics.release(cap, cursor);
      const entity = id === null ? undefined : sim.entities.get(id);
      if (!entity) return;
      // A slingshot pulled back fires instead.
      const fired = sim.toys.released(entity);
      const s = sim.physics.getState(entity.id);
      const speed = Math.hypot(s.vx, s.vy);
      const flung = speed >= FLING_SPEED;
      if (entity.bug) releaseBug(entity.bug, sim.content.bugs.get(entity.defId), flung, s.y);
      if (entity.bug?.pending) sim.cast.released(entity);
      sim.places.released(entity);
      sim.setup.touch(entity.id);
      sim.events.emit('item_dropped', {
        id: entity.id,
        kind: entity.kind,
        defId: entity.defId,
        speed,
        vx: s.vx,
        vy: s.vy,
        flung,
      });
      if (entity.bug && flung) sim.emitNotice(entity, react(entity.bug, 'fling', sim.rng, sim.tick), s);
      if (flung || fired) sim.thrown.set(entity.id, sim.tick);
      else {
        // A gentle drop: the first matching drop target takes it.
        const target = sim.dropTargetFor(entity.id);
        if (target) sim.dropInto(target, entity);
        else if (entity.bug && sim.bench.nearTray(s.x, s.y)) sim.bench.refuse(entity);
      }
      return;
    }
    case 'tickle': {
      const held = sim.physics.grabbed;
      const entity = held === null ? undefined : sim.entities.get(held);
      if (!entity?.bug) return;
      const s = sim.physics.getState(entity.id);
      for (const notice of tickleBug(entity.bug, command.on, sim.rng, sim.tick))
        sim.emitNotice(entity, notice, s);
      return;
    }
    case 'shake': {
      const held = sim.physics.grabbed;
      const entity = held === null ? undefined : sim.entities.get(held);
      if (!entity) return;
      const s = sim.physics.getState(entity.id);
      if (entity.bug) shakeBug(entity.bug, sim.tick);
      else sim.environment.wring(entity);
      sim.events.emit('item_shaken', {
        id: entity.id,
        kind: entity.kind,
        defId: entity.defId,
        x: s.x,
        y: s.y,
      });
      // A junk blob shaken in the hand splits back into what went in.
      if (entity.defId === 'item_junk_blob') sim.bench.split(entity);
      // A maraca (or any instrument) shaken in the hand plays, like a poke.
      if (entity.kind === 'item' && sim.content.items.get(entity.defId).toy === 'instrument')
        sim.toys.poked(entity);
      // Something fizzy shaken up launches itself like a rocket, once (section 6, `tag_fizzy`).
      else if (entity.kind === 'item' && sim.hasTag(entity.id, 'tag_fizzy')) sim.fizz(entity);
      return;
    }
    case 'set_need': {
      const brain = sim.entities.get(command.id)?.bug;
      if (brain && NEED_IDS.includes(command.need) && Number.isFinite(command.value))
        brain.needs[command.need] = Math.min(100, Math.max(0, command.value));
      return;
    }
    case 'poke':
      sim.poke(command.x, command.y);
      return;
    case 'spawn':
      // A debug command: an unknown def or a bad spot is dropped, like a bad `set_tag`.
      if (!sim.defExists(command.kind, command.defId)) return;
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return;
      sim.spawn(command.kind, command.defId, command.x, command.y);
      return;
    case 'focus':
      if (Number.isFinite(command.x0) && Number.isFinite(command.x1)) {
        sim.focus = { x0: command.x0, x1: command.x1 };
        sim.updateSleep();
      }
      return;
    case 'set_tag': {
      if (!sim.entities.has(command.id) || !TAG_SET.has(command.tag)) return;
      if (command.on) sim.addTag(command.id, command.tag, 'debug', command.seconds);
      else sim.removeTag(command.id, command.tag, 'debug');
      return;
    }
    case 'set_weather': {
      const wind = Number.isFinite(command.wind) ? command.wind : 0;
      const weather: WeatherId =
        command.weather ?? (command.rain ? 'weather_rain' : wind !== 0 ? 'weather_wind' : 'weather_clear');
      sim.weather.force(weather, wind);
      return;
    }
    case 'set_time':
      sim.weather.setTime(command.hour);
      return;
    case 'dial_turn':
      sim.weather.turnDial(command.minutes);
      return;
    case 'dial_release':
      sim.weather.releaseDial();
      return;
    case 'pocket_put': {
      const held = sim.physics.grabbed;
      const entity = held === null ? undefined : sim.entities.get(held);
      if (!entity || !isPocketSlot(command.slot)) return;
      // Too big for the pocket (the lattice panel): it is just let go.
      if (entity.kind === 'item' && sim.content.items.get(entity.defId).unpocketable) {
        sim.apply({ type: 'release' });
        return;
      }
      sim.putInPocket(entity, command.slot);
      return;
    }
    case 'pocket_take':
      if (isPocketSlot(command.slot) && Number.isFinite(command.x) && Number.isFinite(command.y))
        sim.takeFromPocket(command.slot, command.x, command.y);
      return;
    case 'stage_intro':
      sim.stageIntro();
      return;
    case 'wake': {
      const bug = sim.entities.get(command.id);
      if (!bug?.bug || sim.isSleeping(bug.id) || bug.bug.mode !== 'st_sleep') return;
      const s = sim.physics.getState(bug.id);
      for (const n of wakeBug(bug.bug, false, sim.rng, sim.tick)) sim.emitNotice(bug, n, s);
      // Wide awake and curious: watch the hand for a while before wandering off.
      bug.bug.decideIn = Math.max(bug.bug.decideIn, 8 * SIM_HZ);
      return;
    }
    case 'hand':
      sim.hand =
        command.x !== null && command.y !== null && Number.isFinite(command.x) && Number.isFinite(command.y)
          ? { x: command.x, y: command.y }
          : null;
      return;
    case 'unlock':
      if (sim.content.areas.has(command.area)) sim.barriers.unlock(command.area, sim.view0().x0, 5);
      return;
    case 'pull_lever':
      sim.bench.pull();
      return;
    case 'stir':
      sim.cauldron.stir(command.radians);
      return;
    case 'seq_touch':
      sim.places.touchSequencer(command.x, command.y, command.start);
      return;
    case 'despawn':
      if (sim.entities.has(command.id) && sim.physics.grabbed !== command.id) sim.remove(command.id);
      return;
    case 'give_potion': {
      const e = sim.entities.get(command.id);
      if (!e || !sim.content.potions.has(command.potion)) return;
      sim.potions.give(e, sim.brewOf(command.potion), 'debug');
      return;
    }
    case 'photo_mode':
      sim.setPhotoMode(command.open === true);
      return;
    case 'photo_taken':
      sim.events.emit('photo_taken', {
        frame: String(command.frame),
        filter: String(command.filter),
        stickers: Math.max(0, Math.floor(Number(command.stickers) || 0)),
        zoom: Number.isFinite(command.zoom) ? command.zoom : 1,
        bugs: Array.isArray(command.bugs) ? command.bugs.map(String) : [],
      });
      return;
    case 'photo_saved':
      sim.events.emit('photo_saved', { ok: command.ok === true });
      return;
    case 'beckon': {
      const bug = sim.entities.get(command.id);
      if (!bug?.bug || sim.isSleeping(bug.id) || !Number.isFinite(command.x)) return;
      const s = sim.physics.getState(bug.id);
      const def = sim.content.bugs.get(bug.defId);
      const x = Math.max(1, Math.min(sim.worldWidth - 1, command.x));
      if (!beckonBug(bug.bug, def, s.x, x)) return;
      sim.events.emit('bug_beckoned', { id: bug.id, defId: bug.defId, x: s.x, y: s.y });
      return;
    }
  }
}

export function poke(sim: Sim, x: number, y: number): void {
  const id = sim.physics.bodyAt(x, y, 0.2);
  const entity = id === null ? undefined : sim.entities.get(id);
  // A poke is a click, so whatever the press picked up is let go in place.
  const held = sim.physics.release(MAX_FLING_SPEED, { x: 0, y: 0 });
  const heldEntity = held === null ? undefined : sim.entities.get(held);
  if (heldEntity?.bug && heldEntity !== entity)
    releaseBug(
      heldEntity.bug,
      sim.content.bugs.get(heldEntity.defId),
      false,
      sim.physics.getState(heldEntity.id).y,
    );
  if (!entity) {
    // Nothing there: maybe a fixture, like the hose tap.
    sim.environment.pokeFixture(x, y);
    return;
  }
  const s = sim.physics.getState(entity.id);
  if (entity.bug?.pending) {
    // A bug waiting to be found stays in character (Twig stays a twig) unless the poke finds it.
    sim.setup.touch(entity.id);
    if (sim.cast.poked(entity) && entity.bug.pending) {
      sim.physics.setVelocity(entity.id, s.vx, -1.5);
      sim.events.emit('item_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
    }
    return;
  }
  if (entity.bug && sim.potions.poked(entity)) {
    // A balloon bug lets its air out, zipping about.
    sim.events.emit('bug_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
    return;
  }
  if (entity.bug) {
    const notices = pokedBug(entity.bug, sim.bugDef(entity), sim.rng, sim.tick);
    if (!notices) return;
    sim.physics.setVelocity(entity.id, 0, -2.2);
    sim.events.emit('bug_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
    for (const notice of notices) sim.emitNotice(entity, notice, s);
    sim.puff(entity);
  } else if (sim.content.items.get(entity.defId).lamp) {
    // A light: the click switches it on or off.
    sim.setup.touch(entity.id);
    const on = !sim.hasTag(entity.id, 'tag_glowing');
    if (on) sim.addTag(entity.id, 'tag_glowing', 'player');
    else sim.removeTag(entity.id, 'tag_glowing', 'player');
    sim.events.emit('light_toggled', { id: entity.id, on, x: s.x, y: s.y });
    sim.weather.noteLight(s.x, s.y);
  } else if (sim.content.items.get(entity.defId).whistle) {
    // The tidy whistle: a toot, and loose things in view head home.
    sim.setup.touch(entity.id);
    sim.physics.setVelocity(entity.id, s.vx, -1.6);
    sim.tidy.blow(entity);
  } else if (sim.toys.poked(entity)) {
    // A toy did its thing: fired, launched, let its air out.
    sim.setup.touch(entity.id);
  } else {
    if (entity.defId === 'item_junk_blob')
      sim.events.emit('blob_squeaked', { id: entity.id, x: s.x, y: s.y });
    // A poke is a touch: it stays the player's.
    sim.setup.touch(entity.id);
    sim.physics.setVelocity(entity.id, s.vx + sim.rng.range(-0.6, 0.6), -3.2);
    sim.events.emit('item_poked', { id: entity.id, defId: entity.defId, x: s.x, y: s.y });
  }
}

/**
 * The first scene of a new world (game design doc, section 17): Dot
 * asleep on the bottle cap with a red berry beside her, a little peckish,
 * so hovering her shows a berry thought.
 */
export function stageIntro(sim: Sim): void {
  const dot = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_ladybug_dot');
  if (!dot?.bug) return;
  const s = sim.physics.getState(dot.id);
  const def = sim.content.bugs.get(dot.defId);
  dot.bug.needs.need_hunger = 22;
  dot.bug.needs.need_energy = 72;
  for (const n of napBug(dot.bug, def, s.x)) sim.emitNotice(dot, n, s);
  const berry = sim.entities
    .ofKind('item')
    .filter((e) => e.defId === 'item_berry_red')
    .map((e) => ({ e, d: Math.abs(sim.physics.getState(e.id).x - s.x) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!berry || berry.d > 2) {
    const x = s.x + 1.1;
    sim.spawn('item', 'item_berry_red', x, sim.surfaceY(x) - 0.4);
  }
}
