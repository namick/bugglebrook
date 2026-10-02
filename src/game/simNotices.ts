// Turning the bug AI's notices into events and changes to the world.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { Entity, EntityId } from './core/entities';
import { SIM_HZ } from './core/loop';
import type { BodyState } from './physics/physics';
import type { BugNotice } from './systems/bugAi';
import { react } from './systems/bugAi';
import type { Sim } from './sim';

export function emitNotice(sim: Sim, self: Entity, notice: BugNotice, selfState: BodyState): void {
  // A notice about the partner in some shared moment speaks for that bug.
  const other = notice.by === undefined ? undefined : sim.entities.get(notice.by);
  const entity = other ?? self;
  const s = other ? sim.physics.getState(other.id) : selfState;
  const base = { id: entity.id, defId: entity.defId };
  const partnerDef = (id: EntityId): string => sim.entities.get(id)?.defId ?? '';
  switch (notice.type) {
    case 'landed':
      sim.events.emit('bug_landed', { ...base, speed: notice.speed, x: s.x, y: s.y });
      return;
    case 'dizzy':
      sim.events.emit('bug_dizzy', { ...base, speed: notice.speed, durationTicks: notice.durationTicks });
      sim.noteLoud(s.x, s.y, entity.id);
      return;
    case 'recovered':
      sim.events.emit('bug_recovered', base);
      return;
    case 'chose':
      sim.events.emit('bug_chose_action', { ...base, action: notice.action, targetId: notice.targetId });
      return;
    case 'hopped':
      sim.events.emit('bug_hopped', { ...base, x: s.x, y: s.y });
      return;
    case 'reacted':
      sim.events.emit('bug_reacted', { ...base, reaction: notice.reaction, variant: notice.variant });
      if (notice.reaction === 'land_hard') sim.noteLoud(s.x, s.y, entity.id);
      return;
    case 'burped': {
      const m = sim.mouthAnchor(entity.id);
      sim.events.emit('bug_burped', { ...base, x: m?.x ?? s.x, y: m?.y ?? s.y });
      return;
    }
    case 'tickled':
      sim.events.emit('bug_tickled', { ...base, level: notice.level });
      return;
    case 'swam':
      sim.events.emit('bug_swam', { ...base, x: s.x, y: s.y });
      return;
    case 'shook_dry':
      sim.removeTag(entity.id, 'tag_wet', 'shake');
      // Barty hates baths: outraged for 10 s.
      if (entity.bug && sim.content.bugs.get(entity.defId).habits.rollsBalls)
        entity.bug.grumpyUntil = sim.tick + 10 * SIM_HZ;
      sim.events.emit('bug_shook_dry', { ...base, x: s.x, y: s.y });
      return;
    case 'used':
      sim.events.emit('bug_used', { ...base, targetId: notice.targetId, action: notice.action });
      return;
    case 'inspected':
      sim.events.emit('bug_inspected', {
        ...base,
        itemId: notice.itemId,
        itemDefId: partnerDef(notice.itemId),
      });
      return;
    case 'social':
      sim.events.emit('bug_socialized', { ...base, partnerId: notice.partnerId, kind: notice.kind });
      return;
    case 'social_end':
      sim.events.emit('bug_social_ended', {
        ...base,
        partnerId: notice.partnerId,
        kind: notice.kind,
        happy: notice.happy,
      });
      return;
    case 'chatted':
      sim.events.emit('bug_chatted', {
        ...base,
        partnerId: notice.partnerId,
        topic: notice.topic,
        about: notice.about,
      });
      return;
    case 'bumped': {
      const p = sim.entities.has(notice.partnerId) ? sim.physics.getState(notice.partnerId) : s;
      sim.events.emit('bug_bumped', {
        ...base,
        partnerId: notice.partnerId,
        x: (s.x + p.x) / 2,
        y: (s.y + p.y) / 2,
      });
      return;
    }
    case 'tagged':
      sim.events.emit('bug_tagged', { ...base, partnerId: notice.partnerId, x: s.x, y: s.y });
      return;
    case 'shared': {
      const item = sim.entities.get(notice.itemId);
      const to = sim.entities.get(notice.partnerId);
      if (!item || !to?.bug) return;
      if (to.bug.carrying === item.id) to.bug.carrying = null;
      if (to.id !== entity.id)
        sim.events.emit('bug_shared', {
          ...base,
          partnerId: to.id,
          itemId: item.id,
          itemDefId: item.defId,
        });
      sim.feed(to.id, item.id, false);
      return;
    }
    case 'snatched':
      sim.events.emit('bug_snatched', {
        ...base,
        partnerId: notice.partnerId,
        itemId: notice.itemId,
        itemDefId: partnerDef(notice.itemId),
      });
      return;
    case 'comforted':
      sim.events.emit('bug_comforted', { ...base, partnerId: notice.partnerId, x: s.x, y: s.y });
      return;
    case 'gawked':
      sim.events.emit('bug_gawked', { ...base, x: notice.x, y: notice.y });
      return;
    case 'rode':
      sim.events.emit('bug_rode', { ...base, mountId: notice.mountId, on: notice.on });
      return;
    case 'slept':
      sim.events.emit('bug_slept', { ...base, x: s.x, y: s.y });
      return;
    case 'woke':
      sim.events.emit('bug_woke', { ...base, early: notice.early });
      return;
    case 'posed':
      sim.events.emit('bug_posed', { ...base, x: s.x, y: s.y });
      return;
    case 'fidgeted':
      sim.events.emit('bug_fidgeted', { ...base, fidget: notice.fidget });
      return;
    case 'slipped':
      if (entity.bug) entity.bug.needs.need_clean = Math.max(0, entity.bug.needs.need_clean - 5);
      sim.events.emit('bug_slipped', { ...base, x: s.x, y: s.y });
      if (entity.bug) sim.emitNotice(entity, react(entity.bug, 'slip', sim.rng, sim.tick), s);
      return;
    case 'curled':
      sim.events.emit('bug_curled', { ...base, on: notice.on });
      return;
    case 'hid':
      sim.events.emit('bug_hid', { ...base, coverId: notice.coverId, on: notice.on });
      return;
    case 'affinity':
      sim.nudgeAffinity(entity.defId, partnerDef(notice.partnerId), notice.delta);
      return;
    case 'umbrella':
      sim.events.emit('bug_umbrella', { ...base, itemId: notice.itemId, on: notice.on });
      return;
    case 'freed': {
      // Moose pulls his friend free of the gum.
      if (!sim.entities.has(notice.partnerId)) return;
      sim.environment.unstickAll(notice.partnerId);
      const p = sim.physics.getState(notice.partnerId);
      sim.physics.setVelocity(notice.partnerId, entity.bug ? entity.bug.facing * -1.2 : 0, -3);
      sim.events.emit('bug_freed', { ...base, partnerId: notice.partnerId, x: p.x, y: p.y });
      return;
    }
    case 'chopped': {
      // Hi-yah! Whatever floated by goes flying.
      const item = sim.entities.get(notice.itemId);
      if (!item) return;
      const p = sim.physics.getState(item.id);
      const dir = entity.bug?.facing ?? 1;
      sim.physics.setVelocity(item.id, dir * 3.5, -4.5);
      sim.events.emit('bug_chopped', { ...base, itemId: item.id, x: p.x, y: p.y });
      return;
    }
    case 'changed':
      sim.events.emit('bug_changed', { ...base, form: notice.form, x: s.x, y: s.y });
      if (notice.form === 'butterfly') sim.findSecret('secret_munch_butterfly', s.x, s.y);
      return;
    case 'turned_dial':
      // The same path as the player's hand on the rim: a turn, then let go.
      sim.weather.turnDial(notice.minutes);
      sim.weather.releaseDial();
      sim.events.emit('bug_turned_dial', { ...base, minutes: notice.minutes, x: s.x, y: s.y });
      return;
    case 'played': {
      const item = sim.entities.get(notice.itemId);
      if (!item) return;
      sim.events.emit('instrument_played', {
        id: entity.id,
        itemId: notice.itemId,
        defId: item.defId,
        beats: notice.beats,
        x: s.x,
        y: s.y,
      });
      return;
    }
    case 'tapped_cap':
      sim.places.bugTapped(entity.id, notice.row, notice.col);
      return;
    case 'left_caps':
      sim.places.bugLeft(entity.id);
      return;
    case 'tossed':
      if (notice.into === 'tray') sim.bench.expect(notice.itemId, notice.tray);
      return;
    case 'stirred':
      sim.cauldron.stir(notice.radians);
      return;
  }
}
