import { Container } from 'pixi.js';
import type { Sim, EntityView } from '../../../game/sim';
import type { EntityId } from '../../../game/core/entities';
import { PIXELS_PER_METER } from '../../../game/constants';
import { Background } from './background';
import { bugPose } from './bugPose';
import type { Camera } from './camera';
import { BugSprite } from './draw/bug';
import { ItemSprite } from './draw/item';
import { Particles } from './particles';

/**
 * Draws a Sim. Reads entity views every frame and keeps one sprite per
 * entity, creating and destroying sprites as entities come and go. Never
 * writes to the sim.
 */
export class WorldView extends Container {
  private readonly background: Background;
  private readonly entityLayer = new Container();
  readonly particles = new Particles();
  private readonly sprites = new Map<EntityId, BugSprite | ItemSprite>();
  private readonly squash = new Map<EntityId, number>();
  private readonly offs: Array<() => void> = [];
  private time = 0;

  constructor(private readonly sim: Sim) {
    super();
    this.background = new Background(sim.content.areas.all, sim.worldWidth);
    this.addChild(this.background.sky, this.background.far, this.background.mid, this.background.near);
    const worldLayer = new Container();
    worldLayer.addChild(this.entityLayer, this.particles);
    this.background.near.addChild(worldLayer);
    this.particles.attach(sim.events);
    this.offs.push(
      sim.events.on('bonked', (e) => {
        if (e.kind === 'bug') this.squash.set(e.id, Math.min(1, e.speed / 10));
      }),
    );
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    this.background.update(camera);
    this.particles.update(dt);

    const seen = new Set<EntityId>();
    for (const view of this.sim.views()) {
      seen.add(view.id);
      const sprite = this.sprites.get(view.id) ?? this.createSprite(view);
      sprite.position.set(view.x * PIXELS_PER_METER, view.y * PIXELS_PER_METER);
      if (sprite instanceof BugSprite && view.bug) {
        const squash = Math.max(0, (this.squash.get(view.id) ?? 0) - dt * 4);
        this.squash.set(view.id, squash);
        const pose = bugPose({
          mode: view.bug.mode as never,
          vx: view.vx,
          vy: view.vy,
          time: this.time,
          squash,
          phase: view.id * 1.37,
        });
        sprite.setPose(pose, view.bug.facing, this.time);
      } else {
        sprite.rotation = view.angle;
        const s = view.held ? 1.08 : 1;
        sprite.scale.set(s);
      }
    }
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy({ children: true });
        this.sprites.delete(id);
        this.squash.delete(id);
      }
    }
  }

  private createSprite(view: EntityView): BugSprite | ItemSprite {
    const sprite =
      view.kind === 'bug'
        ? new BugSprite(this.sim.content.bugs.get(view.defId))
        : new ItemSprite(this.sim.content.items.get(view.defId));
    // Keep draw order equal to ID order so hit testing (highest ID) matches.
    sprite.zIndex = view.id;
    this.entityLayer.sortableChildren = true;
    this.entityLayer.addChild(sprite);
    this.sprites.set(view.id, sprite);
    return sprite;
  }

  override destroy(): void {
    this.offs.forEach((off) => off());
    this.particles.detach();
    super.destroy({ children: true });
  }
}
