// What the world view does when the sim announces something: particles,
// squash, bubbles, and screen shake. Split out of worldView.ts to keep it
// readable; each takes the view, and `WorldView` keeps a one-line method.

import { VIEW_WIDTH_PX } from '../../../game/constants';
import type { ChatTopic, Fidget } from '../../../game/events';
import { CRAFT_POP } from './areaArt/benchLive';
import { ItemSprite } from './draw/item';
import type { Move, Picto } from './reactions';
import { weatherTarget } from './skyLook';
import type { WorldView } from './worldView';
import { PPM } from './worldView';

export function listen(view: WorldView): void {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  view.offs.push(...view.listenPotions());
  view.offs.push(
    ev.on('item_grabbed', (e) => {
      view.juiceFor(e.id).squash.grab();
      view.particles.dust(px(e.x), px(e.y) + 20, 2);
    }),
    ev.on('item_dropped', (e) => {
      if (e.flung) view.juiceFor(e.id).flying = 3;
    }),
    // A forced change (tests, debugging) shows at once: no rain left falling from before.
    ev.on('weather_changed', (e) => {
      if (e.forced) view.weatherMix = weatherTarget(e.weather);
    }),
    // Something lost out of the world drops back in from the sky: a puff where it appears.
    ev.on('entity_returned', (e) => {
      const y = px(Math.max(e.y, 0.4));
      view.particles.puff(px(e.x), y, 0xffffff, 7, 0, 30, 22);
      view.particles.sparkles(px(e.x), y, 5);
    }),
    // Playtest F1 and F2: things coming home, the whistle, and litter in the weather.
    ev.on('item_came_home', (e) => {
      const y = px(Math.max(e.y, 0.4));
      view.particles.puff(px(e.x), y, 0xffffff, 6, 0, 30, 20);
      view.particles.sparkles(px(e.x), y, 4);
    }),
    ev.on('item_tidied', (e) => {
      const def = view.sim.content.items.tryGet(e.defId);
      if (e.cause === 'drift' || !def) {
        // Nobody saw it go: it just turns up at home.
        view.particles.puff(px(e.x), px(Math.max(e.y, 0.4)), 0xffffff, 5, 0, 30, 18);
        return;
      }
      view.swooshes.add(def, { x: px(e.fromX), y: px(e.fromY) }, { x: px(e.x), y: px(e.y) });
    }),
    ev.on('whistle_blown', (e) => {
      view.juiceFor(e.id).squash.poke();
      view.particles.ring(px(e.x), px(e.y), 40);
      view.particles.ring(px(e.x), px(e.y), 80);
      view.particles.burst(px(e.x), px(e.y) - 20, 8, 0xffd23f, Math.PI, -Math.PI);
      if (e.count > 0) view.particles.sparkles(px(e.x), px(e.y) - 40, 6);
    }),
    ev.on('litter_nudged', (e) => {
      if (e.cause === 'rain') view.particles.drops(px(e.x), px(e.y), e.dir * 60, -120, 0x9fd8ff, 3);
      else view.particles.puff(px(e.x) - e.dir * 20, px(e.y), 0xffffff, 2, e.dir * 60, -20, 10);
    }),
    ev.on('bonked', (e) => {
      const j = view.juiceFor(e.id);
      if (e.kind === 'item') j.squash.land(e.speed * 0.6);
      const size = view.sizeOf(e.id);
      // No dust in or on the water (lily pads, ice).
      if (!view.sim.environment.waterAt(e.x)) view.particles.dust(px(e.x), px(e.y) + size, e.speed);
      if (e.kind === 'bug' && e.speed >= 14) view.shake(3, 0.12);
    }),
    ev.on('bug_landed', (e) => {
      view.juiceFor(e.id).squash.land(Math.max(6, e.speed));
    }),
    ev.on('bug_dizzy', (e) => {
      const v = view.sim.view(e.id);
      if (v) view.particles.stars(px(v.x), px(v.y) - view.sizeOf(e.id));
      if (e.speed >= 16) view.shake(4, 0.16);
      view.say(e.id, ['swirl', 'star'], Math.min(3, e.durationTicks / 60));
    }),
    ev.on('bug_poked', (e) => {
      view.juiceFor(e.id).squash.poke();
      view.particles.ring(px(e.x), px(e.y), 36);
      view.particles.sparkles(px(e.x), px(e.y) - 30, 3);
    }),
    ev.on('item_poked', (e) => {
      view.juiceFor(e.id).squash.poke();
      view.particles.ring(px(e.x), px(e.y), 24);
    }),
    ev.on('bug_hopped', (e) => {
      view.juiceFor(e.id).squash.kick(0.85, 1.18);
      view.particles.dust(px(e.x), px(e.y) + view.sizeOf(e.id), 1);
    }),
    ev.on('spring_bounced', (e) => {
      const sprite = view.sprites.get(e.id);
      if (sprite instanceof ItemSprite) sprite.squish(0.7);
      view.juiceFor(e.targetId).squash.kick(0.75, 1.3);
      view.juiceFor(e.targetId).flying = 2;
      view.particles.burst(px(e.x), px(e.y) - 30, 5, 0xffffff, Math.PI * 0.9, -Math.PI / 2);
    }),
    ev.on('bug_chose_action', (e) => view.intent(e.id, e.action, e.targetId)),
    ev.on('bug_reacted', (e) => view.react(e.id, e.defId, e.reaction, e.variant)),
    ev.on('bug_fed', (e) => {
      const j = view.juiceFor(e.id);
      j.chewing = 0;
      j.food = e.itemDefId;
      j.squash.kick(1.12, 0.9);
      const m = view.mouthPx(e.id);
      if (!m) return;
      view.particles.crumbs(m.x, m.y, view.itemColor(e.itemDefId));
      if (e.liking === 'disliked') {
        view.particles.puff(m.x, m.y - 10, 0xb8e986, 3, 0, -40, 10);
        view.say(e.id, ['exclaim', 'sweat'], 0.9);
      } else if (e.liking === 'loved') view.particles.hearts(m.x, m.y - 30, 2);
    }),
    ev.on('bug_ate', (e) => {
      const j = view.juiceFor(e.id);
      j.chewing = -1;
      j.squash.kick(1.15, 0.9);
      const m = view.mouthPx(e.id) ?? { x: px(e.x), y: px(e.y) };
      view.particles.crumbs(m.x, m.y, view.itemColor(e.itemDefId));
      const dir = view.facingOf(e.id);
      if (view.hasTag(e.itemDefId, 'tag_hot')) {
        // Dot's weird favorite: she breathes a flame puff.
        view.particles.flame(m.x + dir * 10, m.y, dir);
        view.particles.puff(m.x + dir * 30, m.y - 20, 0x9a9aa6, 4, dir * 60, -80, 14);
        j.hot = 1.8;
      }
      if (view.hasTag(e.itemDefId, 'tag_cold')) {
        view.particles.snow(m.x + dir * 8, m.y, dir);
        view.particles.puff(m.x + dir * 20, m.y, 0xd6f0ff, 4, dir * 90, -20, 12);
      }
    }),
    ev.on('bug_spat', (e) => {
      const j = view.juiceFor(e.id);
      j.chewing = -1;
      const sneeze = view.hasTag(e.itemDefId, 'tag_cold');
      j.squash.kick(sneeze ? 0.8 : 1.2, sneeze ? 1.25 : 0.85);
      const vx = px(e.vx);
      const vy = px(e.vy);
      view.particles.drops(
        px(e.x),
        px(e.y),
        vx * 0.6,
        vy * 0.5,
        sneeze ? 0xd6f0ff : 0xc9f0a0,
        sneeze ? 14 : 7,
      );
      view.particles.ring(px(e.x), px(e.y), 22);
      view.particles.burst(px(e.x), px(e.y), 4, 0xffffff, 0.9, Math.atan2(vy, vx));
      if (sneeze) view.particles.puff(px(e.x), px(e.y), 0xffffff, 5, vx * 0.3, -30, 14);
    }),
    ev.on('bug_burped', (e) => {
      const dir = view.facingOf(e.id);
      view.juiceFor(e.id).squash.kick(1.2, 0.85);
      // BRAAP: a big yellow-green cloud rolling out of the mouth, a shock ring, bubbles.
      view.particles.ring(px(e.x) + dir * 12, px(e.y), 40);
      view.particles.puff(px(e.x) + dir * 18, px(e.y) - 4, 0xd4e38a, 9, dir * 120, -45, 22);
      view.particles.bubbles(px(e.x) + dir * 14, px(e.y) - 10, 5);
      // Soap comes back up as real soap bubbles.
      const food = view.juiceFor(e.id).food;
      if (food && view.hasTag(food, 'tag_soapy')) view.soapBubbles.blow(px(e.x) + dir * 20, px(e.y) - 10, 7);
      view.say(e.id, ['dots', 'sweat'], 1.1);
    }),
    ev.on('bug_tickled', (e) => {
      const v = view.sim.view(e.id);
      if (v) view.particles.sparkles(px(v.x), px(v.y) - view.sizeOf(e.id), 2 + e.level * 2);
      view.juiceFor(e.id).squash.kick(1.1, 0.92);
      view.say(
        e.id,
        e.level >= 3 ? ['laugh', 'laugh', 'laugh'] : e.level === 2 ? ['laugh', 'laugh'] : ['laugh'],
        1.1,
      );
    }),
    ev.on('bug_wriggled_free', (e) => {
      view.juiceFor(e.id).squash.kick(0.8, 1.25);
      view.particles.burst(px(e.x), px(e.y), 8, 0xffffff);
    }),
    ev.on('item_shaken', (e) => {
      view.juiceFor(e.id).squash.kick(1.2, 0.85);
      view.particles.burst(px(e.x), px(e.y), 6, 0xffffff);
      if (e.kind === 'bug') {
        const r = view.sim.content.bugs.get(e.defId);
        view.say(e.id, r.dizzyProof ? ['dots'] : ['swirl'], 1.2);
      }
    }),
    ev.on('entity_removed', (e) => view.drop(e.id)),
    ...view.listenWater(),
    ...view.listenSocial(),
  );
}

/** Bugs together: chats, boops, tag, catch, snacks shared and snatched, pats, naps, and rides. */
export function listenSocial(view: WorldView): Array<() => void> {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  const TOPIC: Readonly<Record<ChatTopic, Picto>> = {
    food: 'food',
    friend: 'friend',
    star: 'star',
    question: 'question',
    heart: 'heart',
    note: 'note',
    spring: 'spring',
    drop: 'drop',
    zzz: 'zzz',
    laugh: 'laugh',
    sun: 'sun',
  };
  const FIDGET: Readonly<Record<Fidget, [Move, number]>> = {
    look: ['none', 1.2],
    hum: ['nod', 1.4],
    yawn: ['yawn', 1.6],
    scratch: ['shiver', 0.8],
    groom: ['wiggle', 1.1],
    stretch: ['yawn', 1],
    kick: ['stomp', 0.7],
    twirl: ['spin', 0.6],
    pose: ['pose', 1.8],
    freeze: ['none', 1.5],
  };
  return [
    ev.on('bug_chatted', (e) => {
      const j = view.juiceFor(e.id);
      j.talk = 0.9;
      const topic = TOPIC[e.topic];
      const extra: Picto | null =
        e.topic === 'friend'
          ? (['laugh', 'heart', 'question'] as const)[Math.floor(Math.random() * 3)]!
          : null;
      const pictos = extra ? [topic, extra] : [topic];
      view.say(
        e.id,
        pictos,
        1.15,
        e.topic === 'food' ? e.about : null,
        e.topic === 'friend' ? e.about : null,
      );
      const partner = view.sim.view(e.partnerId);
      const me = view.sim.view(e.id);
      if (partner && me) view.juiceFor(e.partnerId).look = { x: me.x > partner.x ? 0.6 : -0.6, y: 0 };
    }),
    ev.on('bug_bumped', (e) => {
      view.particles.boop(px(e.x), px(e.y) - 20);
      view.juiceFor(e.id).squash.kick(1.15, 0.88);
      view.juiceFor(e.partnerId).squash.kick(1.15, 0.88);
    }),
    ev.on('bug_tagged', (e) => {
      view.say(e.id, ['exclaim'], 0.8);
      view.say(e.partnerId, ['laugh'], 0.9);
      view.particles.burst(px(e.x), px(e.y) - 20, 5, 0xffffff);
      view.juiceFor(e.partnerId).squash.kick(0.85, 1.15);
    }),
    ev.on('bug_threw', (e) => {
      view.juiceFor(e.itemId).flying = 1.5;
      view.juiceFor(e.id).squash.kick(0.9, 1.1);
    }),
    ev.on('bug_caught', (e) => {
      view.particles.sparkles(px(e.x), px(e.y), 3);
      view.juiceFor(e.id).squash.kick(1.12, 0.9);
    }),
    ev.on('bug_shared', (e) => {
      const v = view.sim.view(e.partnerId);
      if (v) view.particles.hearts(px(v.x), px(v.y) - view.sizeOf(e.partnerId) * 1.4, 3);
      view.say(e.id, ['heart'], 1.2);
    }),
    ev.on('bug_snatched', (e) => {
      const v = view.sim.view(e.id);
      if (v) view.particles.burst(px(v.x), px(v.y) - 20, 6, 0xffd23f);
      view.juiceFor(e.partnerId).food = e.itemDefId;
      view.say(e.id, ['food', 'laugh'], 1.2, e.itemDefId);
    }),
    ev.on('bug_comforted', (e) => {
      view.moveBug(e.id, 'pat', 1.2);
      const v = view.sim.view(e.partnerId);
      if (v) view.particles.hearts(px(v.x), px(v.y) - view.sizeOf(e.partnerId) * 1.5, 3);
      view.say(e.id, ['heart'], 1.2);
    }),
    ev.on('bug_rode', (e) => {
      if (!e.on) return;
      view.say(e.id, ['up', 'star'], 1.2);
      const mount = view.sim.view(e.mountId);
      if (mount?.bug && mount.bug.mode !== 'st_sleep') view.say(e.mountId, ['question'], 1.1);
    }),
    ev.on('bug_slept', (e) => {
      view.juiceFor(e.id).snore = 0.8;
      view.bubbles.hide(e.id);
    }),
    ev.on('bug_posed', (e) => {
      view.particles.sparkles(px(e.x), px(e.y) - 60, 8);
    }),
    ev.on('bug_fidgeted', (e) => {
      const [move, seconds] = FIDGET[e.fidget];
      view.moveBug(e.id, move, seconds);
      const j = view.juiceFor(e.id);
      if (e.fidget === 'look') j.glance = 1.2;
      if (e.fidget === 'hum') view.bubbles.show(e.id, 'speech', ['note'], 1.2);
      if (e.fidget === 'groom') {
        const v = view.sim.view(e.id);
        if (v) view.particles.sparkles(px(v.x), px(v.y) - 20, 3);
      }
      if (e.fidget === 'kick') {
        const v = view.sim.view(e.id);
        if (v) view.particles.dust(px(v.x) + view.facingOf(e.id) * 30, px(v.y) + view.sizeOf(e.id), 1);
      }
    }),
    ev.on('bug_slipped', (e) => {
      view.particles.drops(px(e.x), px(e.y) + view.sizeOf(e.id), -view.facingOf(e.id) * 80, -60, 0xb8e986, 4);
    }),
    ev.on('bug_curled', (e) => view.juiceFor(e.id).squash.kick(e.on ? 0.8 : 1.15, e.on ? 1.2 : 0.9)),
    ev.on('bug_inspected', (e) => {
      view.juiceFor(e.id).food = e.itemDefId;
    }),
    ev.on('bug_picked_up', (e) => view.juiceFor(e.itemId).squash.kick(1.2, 0.85)),
    ev.on('stack_fell', (e) => {
      view.particles.dust(px(e.x), px(e.y), 10);
      view.shake(3, 0.15);
    }),
    // The first scene's "again!": a spring in the bubble and a hopeful hop.
    ev.on('bug_beckoned', (e) => {
      view.say(e.id, ['spring', 'up'], 3.2);
      view.moveBug(e.id, 'hop', 0.8);
      view.particles.sparkles(px(e.x), px(e.y) - view.sizeOf(e.id) * 2, 4);
    }),
    // Out of the pocket: a puff where it appears. Into it: a little swirl where it was.
    ev.on('unpocketed', (e) => {
      view.juiceFor(e.id).squash.kick(0.8, 1.25);
      view.particles.ring(px(e.x), px(e.y), 30);
      view.particles.sparkles(px(e.x), px(e.y), 3);
    }),
    ev.on('pocketed', (e) => view.particles.ring(px(e.x), px(e.y), 26)),
    ev.on('pocket_swapped', (e) => {
      view.juiceFor(e.id).squash.kick(0.8, 1.25);
      view.particles.ring(px(e.x), px(e.y), 26);
    }),
  ];
}

/** Water and property events: splashes, steam, ice, goo, bubbles, stink. */
export function listenWater(view: WorldView): Array<() => void> {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  return [
    ev.on('splashed', (e) => {
      const big = e.speed > 1.5 || e.kind === 'bug';
      view.water.splash(px(e.x), e.speed, e.size);
      if (big) view.particles.splash(px(e.x), px(e.y), e.speed, e.size);
      else view.particles.drops(px(e.x), px(e.y), 0, -120, 0x5cc3e6, 3);
      view.juiceFor(e.id).squash.land(Math.min(12, 3 + e.speed));
    }),
    ev.on('skipped', (e) => {
      view.water.splash(px(e.x), 3, 0.08);
      view.particles.drops(px(e.x), px(e.y), 60, -160, 0x5cc3e6, 5);
      view.particles.ring(px(e.x), px(e.y), 18);
    }),
    ev.on('left_water', (e) => {
      view.particles.drops(px(e.x), px(e.y), 0, -60, 0x5cc3e6, 4);
    }),
    ev.on('steamed', (e) => {
      view.particles.steam(px(e.x), px(e.y) - 10, 10);
      view.particles.sparkles(px(e.x), px(e.y) - 20, 3);
      view.juiceFor(e.id).squash.kick(1.15, 0.88);
    }),
    ev.on('froze', (e) => {
      view.particles.shards(px(e.x), px(e.y), 12);
      view.particles.snow(px(e.x), px(e.y) - 20, 1);
      view.juiceFor(e.id).squash.kick(0.9, 1.1);
    }),
    ev.on('thawed', (e) => {
      view.particles.drops(px(e.x), px(e.y), 0, -80, 0x9fd8ff, 6);
      view.particles.shards(px(e.x), px(e.y), 4);
    }),
    ev.on('ice_formed', (e) => {
      for (let x = px(e.x0); x < px(e.x1); x += 40) view.particles.shards(x, px(e.y), 2);
      view.particles.sparkles(px((e.x0 + e.x1) / 2), px(e.y) - 20, 8);
    }),
    ev.on('ice_melted', (e) => {
      view.water.splash(px((e.x0 + e.x1) / 2), 2, 0.4);
      view.particles.drops(px((e.x0 + e.x1) / 2), px(e.y), 0, -100, 0x9fd8ff, 6);
    }),
    ev.on('stuck', (e) => {
      view.particles.drops(px(e.x), px(e.y), 0, -90, 0xff8fc8, 5);
      view.particles.ring(px(e.x), px(e.y), 16);
      view.juiceFor(e.a).squash.kick(1.2, 0.85);
      view.juiceFor(e.b).squash.kick(1.1, 0.9);
    }),
    ev.on('unstuck', (e) => {
      view.welds.delete(`${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`);
      view.particles.drops(px(e.x), px(e.y), 0, -140, 0xff8fc8, 6);
      view.particles.burst(px(e.x), px(e.y), 5, 0xffd1e8);
    }),
    ev.on('bubbles_blown', (e) => view.soapBubbles.blow(px(e.x), px(e.y) - 10, e.count)),
    ev.on('bug_smelled', (e) => {
      const src = view.sim.view(e.sourceId);
      if (src) view.particles.puff(px(src.x), px(src.y) - 20, 0xb8d86a, 5, 0, -50, 16);
    }),
    ev.on('water_zapped', (e) => {
      for (const w of view.sim.environment.surfaces())
        if (e.x >= w.left - 1 && e.x <= w.right + 1) view.particles.zap(px(w.left), px(w.right), px(w.level));
      view.shake(3, 0.15);
    }),
    ev.on('magnet_snapped', (e) => {
      view.particles.burst(px(e.x), px(e.y), 6, 0xffe066);
      view.particles.sparkles(px(e.x), px(e.y), 2);
      view.juiceFor(e.id).squash.kick(0.85, 1.15);
    }),
    ev.on('bug_shook_dry', (e) => {
      // A wet-dog shake: droplets flung out all round, then a clean sparkle.
      const r = view.sizeOf(e.id);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI + (i / 5) * Math.PI;
        view.particles.drops(
          px(e.x),
          px(e.y) - r * 0.4,
          Math.cos(a) * 320,
          Math.sin(a) * 260 - 80,
          0x5cc3e6,
          3,
        );
      }
      view.particles.sparkles(px(e.x), px(e.y) - r, 5);
    }),
    ev.on('wrung_out', (e) => {
      const color = e.tag === 'tag_soapy' ? 0xffffff : 0x5cc3e6;
      for (let i = 0; i < 4; i++) view.particles.drops(px(e.x), px(e.y) + 10, 0, 60 + i * 60, color, 5);
      view.juiceFor(e.id).squash.kick(0.7, 1.25);
      if (e.tag === 'tag_soapy') view.soapBubbles.blow(px(e.x), px(e.y), 4);
    }),
    ev.on('hose_toggled', (e) => {
      view.particles.ring(px(e.x), px(e.y), 30);
      view.particles.burst(px(e.x), px(e.y), 6, e.on ? 0x9fd8ff : 0xffffff);
    }),
    ev.on('boot_bubbled', (e) => {
      view.particles.bubbles(px(e.x) + 40, px(e.y) - 40, 12);
      view.water.splash(px(e.x) + 40, 2, 0.3);
    }),
    ev.on('tag_lost', (e) => {
      // Washed or soaped clean: a little sparkle says "clean!".
      if ((e.cause === 'water' || e.cause === 'soap') && e.tag !== 'tag_hot')
        view.particles.sparkles(px(e.x), px(e.y) - 20, 3);
    }),
    ev.on('tag_gained', (e) => {
      if (e.cause === 'hose' && e.tag === 'tag_wet')
        view.particles.drops(px(e.x), px(e.y), 0, -80, 0x5cc3e6, 3);
    }),
  ];
}

/** Day, night, and weather events: the vane, the knothole, shooting stars, fireflies, secrets. */
export function listenSky(view: WorldView): void {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  view.offs.push(
    ev.on('vane_spun', () => view.fixtures.spin()),
    ev.on('gust_started', (e) => {
      view.particles.puff(px(e.x), px(e.y), 0xffffff, 8, e.dir * 160, -10, 18);
    }),
    ev.on('knothole_peeked', (e) => {
      if (e.night) view.fixtures.peek();
      view.particles.dust(px(e.x), px(e.y), 4);
    }),
    ev.on('sun_clicked', (e) => view.particles.sparkles(px(e.x), px(e.y), 3 + e.count)),
    ev.on('shooting_star', (e) => {
      view.shooting.push({
        x: 300 + Math.random() * (VIEW_WIDTH_PX - 600),
        y: px(e.y) * 0.4 + 40,
        dir: e.dir,
        age: 0,
      });
    }),
    ev.on('fireflies_blinked', (e) => view.weather.blinkBack(e.answer)),
    ev.on('light_toggled', (e) => view.particles.sparkles(px(e.x), px(e.y), e.on ? 6 : 2)),
    ev.on('bug_joined', (e) => {
      view.particles.sparkles(px(e.x), px(e.y), 14);
      view.particles.stars(px(e.x), px(e.y));
    }),
    ev.on('item_transformed', (e) => {
      view.particles.sparkles(px(e.x), px(e.y), 12);
      view.particles.ring(px(e.x), px(e.y), 40);
    }),
    ev.on('secret_found', (e) => {
      view.particles.sparkles(px(e.x), px(e.y), 18);
      view.particles.hearts(px(e.x), px(e.y) - 30, 3);
    }),
    ev.on('bug_umbrella', (e) => {
      const v = view.sim.view(e.id);
      if (v) view.particles.sparkles(px(v.x), px(v.y) - 50, 3);
    }),
  );
}

/** M11: hats and accessories going on and coming off, Prim's verdicts, and the hats' tricks. */
export function listenWear(view: WorldView): Array<() => void> {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  return [
    ev.on('wearable_worn', (e) => {
      view.juiceFor(e.bugId).squash.kick(1.2, 0.85);
      view.particles.sparkles(px(e.x), px(e.y), e.thrown ? 12 : 6);
      // A hat thrown onto a head: the great shot gets a ring and stars.
      if (e.thrown) {
        view.particles.ring(px(e.x), px(e.y), 34);
        view.particles.stars(px(e.x), px(e.y) - 10);
      }
      if (e.liking === 'loved') view.particles.hearts(px(e.x), px(e.y) - 20, 3);
    }),
    ev.on('wearable_removed', (e) => {
      if (e.how === 'broke') view.particles.shards(px(e.x), px(e.y), 6);
      else view.particles.puff(px(e.x), px(e.y), 0xffffff, 4, 0, -40, 12);
    }),
    ev.on('hat_flipped', (e) => view.flipHat(e.id)),
    ev.on('hat_tooted', (e) => {
      const v = view.sim.view(e.id);
      const y = v ? px(v.y) - view.sizeOf(e.id) * 1.6 : px(e.y);
      for (const color of [0xff5fa2, 0xffd23f, 0x4fb6ff])
        view.particles.burst(px(e.x), y, 3, color, Math.PI, -Math.PI);
    }),
    ev.on('hat_judged', (e) => {
      if (e.approve) view.particles.sparkles(px(e.x), px(e.y) - 40, 10);
    }),
    ev.on('hats_swapped', (e) => view.particles.sparkles(px(e.x), px(e.y) - 40, 8)),
    ev.on('headbutted', (e) => view.particles.boop(px(e.x), px(e.y))),
    ev.on('food_chopped', (e) => {
      view.particles.burst(px(e.x), px(e.y), 6, 0xffffff);
      view.shake(3, 0.12);
    }),
    ev.on('monocle_peered', (e) => {
      if (e.tag) view.peek(e.id, e.tag);
    }),
    ev.on('pollen_delivered', (e) => view.particles.puff(px(e.x), px(e.y) - 10, 0xffe066, 4, 0, -30, 8)),
    ev.on('honey_made', (e) => {
      view.particles.sparkles(px(e.x), px(e.y), 10);
      view.particles.hearts(px(e.x), px(e.y) - 20, 2);
    }),
    ev.on('bug_fiddled', (e) => view.particles.sparkles(px(e.x), px(e.y) - 40, 3)),
    ev.on('parade_started', (e) => {
      view.particles.sparkles(px(e.x), px(e.y) - 40, 24);
      view.particles.hearts(px(e.x), px(e.y) - 60, 5);
    }),
  ];
}

/** M8: potions, crafting, and toys as particles, bubbles, squash, and shake. */
export function listenPotions(view: WorldView): Array<() => void> {
  const ev = view.sim.events;
  const px = (m: number): number => m * PPM;
  const colorOfPotion = (potion: string | null, fallback = 0xb36bff): number =>
    potion && view.sim.content.potions.has(potion) ? view.sim.content.potions.get(potion).color : fallback;
  return [
    ev.on('potion_started', (e) => {
      const j = view.juiceFor(e.id);
      // The "bwoomp": a big squash, a burst in the potion's color, sparkles.
      j.squash.kick(e.effect === 'tiny' ? 1.25 : 0.7, e.effect === 'tiny' ? 0.8 : 1.35);
      view.particles.burst(px(e.x), px(e.y), 10, colorOfPotion(e.potion));
      view.particles.sparkles(px(e.x), px(e.y) - 30, 8);
    }),
    ev.on('potion_ended', (e) => {
      view.particles.sparkles(px(e.x), px(e.y) - 20, 6);
      if (e.cause === 'dunk') view.particles.bubbles(px(e.x), px(e.y), 6);
      view.juiceFor(e.id).squash.kick(1.15, 0.88);
    }),
    ev.on('potion_drunk', (e) => {
      const m = view.mouthPx(e.id);
      if (m) view.particles.sparkles(m.x, m.y, 6);
    }),
    ev.on('potion_shattered', (e) => {
      view.particles.shards(px(e.x), px(e.y), 10);
      view.particles.drops(px(e.x), px(e.y), 0, -240, e.color, 12);
      view.particles.splash(px(e.x), px(e.y), 4, 0.3);
    }),
    ev.on('potion_fizzled', (e) => {
      view.particles.puff(px(e.x), px(e.y), 0xffffff, 6, 0, -40, 18);
      view.particles.sparkles(px(e.x), px(e.y) - 20, 5);
    }),
    ev.on('potion_burped', (e) => {
      const m = view.mouthPx(e.id) ?? { x: px(e.x), y: px(e.y) };
      view.juiceFor(e.id).squash.kick(1.2, 0.85);
      if (e.kind === 'burp') view.particles.ring(m.x, m.y, 60);
      if (e.kind === 'fire') {
        view.particles.flame(m.x, m.y, e.dir);
        view.particles.flame(m.x + e.dir * 40, m.y, e.dir);
      }
      if (e.kind === 'bubble') view.particles.bubbles(m.x + e.dir * 30, m.y, 8);
      if (e.kind === 'sludge') {
        view.particles.puff(m.x, m.y, 0x9ccc4a, 14, e.dir * 60, -40, 30);
        view.particles.ring(m.x, m.y, 90);
      }
    }),
    ev.on('giant_stomped', (e) => {
      view.particles.dust(px(e.x), px(e.y) + view.sizeOf(e.id), e.heavy ? 3 : 5);
      view.shake(e.heavy ? 1 : 2, 0.08);
    }),
    ev.on('frost_sneezed', (e) => {
      const m = view.mouthPx(e.id) ?? { x: px(e.x), y: px(e.y) };
      view.particles.snow(m.x, m.y, view.facingOf(e.id));
    }),
    ev.on('balloon_deflated', (e) => {
      view.particles.puff(px(e.x), px(e.y), 0xffffff, 8, 0, 0, 16);
      view.say(e.id, ['exclaim', 'swirl'], 1.6);
    }),
    ev.on('shattered', (e) => view.particles.shards(px(e.x), px(e.y), 12)),
    ev.on('petal_shed', (e) => view.particles.puff(px(e.x), px(e.y), 0xffc2d8, 3, 0, -10, 10)),
    ev.on('balloon_popped', (e) => {
      // Bang: a ring, a burst in the balloon's color, and a few bits of rubber.
      const color = e.defId === 'item_balloon_blue' ? 0x4fb6ff : 0xff4f5e;
      view.particles.ring(px(e.x), px(e.y), 70);
      view.particles.burst(px(e.x), px(e.y), 10, color);
      view.particles.burst(px(e.x), px(e.y), 6, 0xffffff);
    }),
    ev.on('toasted', (e) => view.particles.steam(px(e.x), px(e.y), 5)),
    ev.on('note_played', (e) => {
      view.juiceFor(e.id).squash.poke();
      view.particles.sparkles(px(e.x), px(e.y) - 20, 2);
    }),
    ev.on('blob_squeaked', (e) => view.juiceFor(e.id).squash.kick(1.3, 0.75)),
    // The bench's pop (R09): the new thing grows out of a puff with a stretch and a bounce.
    ev.on('crafted', (e) => {
      const j = view.juiceFor(e.id);
      j.size = { value: CRAFT_POP.from, v: CRAFT_POP.speed };
      j.squash.kick(CRAFT_POP.sx, CRAFT_POP.sy);
      view.particles.puff(px(e.x), px(e.y) + 20, 0xfff6e0, 14, 0, -40, 30);
      view.shake(3, 0.14);
    }),
    ev.on('bench_failed', (e) => {
      if (e.blobId === null) return;
      const j = view.juiceFor(e.blobId);
      j.size = { value: CRAFT_POP.from, v: CRAFT_POP.speed };
      j.squash.kick(CRAFT_POP.sy, CRAFT_POP.sx);
    }),
    ev.on('blob_split', (e) => {
      view.particles.puff(px(e.x), px(e.y), 0xd6cce8, 10, 0, -30, 22);
      view.particles.sparkles(px(e.x), px(e.y), 8);
    }),
    ev.on('toy_used', (e) => {
      const j = view.juiceFor(e.id);
      switch (e.action) {
        case 'fire':
          j.squash.kick(0.7, 1.3);
          view.particles.ring(px(e.x), px(e.y), 50);
          break;
        case 'launch':
          view.particles.puff(px(e.x), px(e.y) + 30, 0xffffff, 10, 0, 60, 22);
          break;
        case 'boing':
          j.squash.kick(1.25, 0.75);
          break;
        case 'hang':
        case 'attach':
        case 'inflate':
        case 'deflate':
          view.particles.sparkles(px(e.x), px(e.y), 5);
          break;
        case 'fling':
          view.particles.dust(px(e.x), px(e.y), 1);
          break;
      }
    }),
    ev.on('bug_wished', (e) => {
      const out = view.sim.content.items.tryGet(e.output);
      if (!out) return;
      view.wishes.set(e.id, { recipe: e.recipe, until: view.time + 4 });
      view.bubbles.show(e.id, 'thought', ['food'], 4, out);
    }),
  ];
}
