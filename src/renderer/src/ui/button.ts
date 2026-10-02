import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { HoldArm } from './holdArm';

/** Marks a container as UI, so the hand shows its pointing pose over it. */
export function markUi<T extends Container>(c: T): T {
  (c as unknown as { bbUi: boolean }).bbUi = true;
  return c;
}

/** Is this display object (or any parent) UI? */
export function isUi(target: unknown): boolean {
  let t = target;
  while (t) {
    if ((t as { bbUi?: boolean }).bbUi) return true;
    t = (t as { parent?: unknown }).parent;
  }
  return false;
}

/**
 * A bouncy scale: a damped spring toward `target`, so presses squash and
 * releases overshoot like the rest of the game.
 */
export class Bounce {
  value = 1;
  target = 1;
  private v = 0;

  constructor(
    private readonly stiffness = 420,
    private readonly damping = 16,
  ) {}

  kick(value: number): void {
    this.value = value;
  }

  update(dt: number): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (-this.stiffness * (this.value - this.target) - this.damping * this.v) * h;
      this.value += this.v * h;
    }
    return this.value;
  }
}

/**
 * A springy, wordless button. Hover grows it; press squashes it; release
 * bounces. With `hold` (seconds) it acts only after being held that long:
 * a ring fills round it while held, and a quick tap just shakes it.
 */
export class PictureButton extends Container {
  private readonly bounce = new Bounce();
  private hovered = false;
  /** Press-and-hold, for buttons that leave where the player is (the home stump). */
  readonly arm: HoldArm | null;
  private readonly ring: Graphics | null = null;
  /** Called when the pointer comes over it (a soft tick sound). */
  onHover: (() => void) | null = null;
  enabled = true;

  constructor(
    readonly art: Container,
    readonly hitWidth: number,
    readonly hitHeight: number,
    private readonly onPress: () => void,
    hold = 0,
  ) {
    super();
    this.arm = hold > 0 ? new HoldArm(hold) : null;
    markUi(this);
    this.addChild(art);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = new Graphics()
      .rect(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight)
      .fill({ color: 0, alpha: 0 });
    this.addChildAt(hit, 0);
    if (this.arm) {
      this.ring = new Graphics();
      this.addChild(this.ring);
    }
    this.on('pointerover', () => {
      this.hovered = true;
      this.bounce.target = 1.08;
      this.onHover?.();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.bounce.target = 1;
    });
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.bounce.kick(0.86);
      if (this.arm && this.enabled) {
        this.arm.press();
        // It rises a little as it arms.
        this.bounce.target = 1.14;
      }
    });
    const letGo = (): void => {
      if (!this.arm) return;
      this.arm.release();
      this.bounce.target = this.hovered ? 1.08 : 1;
    };
    this.on('pointerup', letGo);
    this.on('pointerupoutside', letGo);
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this.enabled || this.arm) return;
      this.bounce.kick(1.2);
      onPress();
    });
  }

  get isHovered(): boolean {
    return this.hovered;
  }

  update(dt: number): void {
    const arm = this.arm;
    if (arm && arm.update(dt) && this.enabled) {
      this.bounce.kick(1.25);
      this.bounce.target = this.hovered ? 1.08 : 1;
      this.onPress();
    }
    this.scale.set(this.bounce.update(dt));
    if (arm && this.ring) {
      // The ring fills clockwise from the top while held; a quick tap shakes "not yet".
      this.art.x = arm.shake > 0 ? Math.sin(arm.shake * 55) * 7 * (arm.shake / 0.35) : 0;
      const g = this.ring.clear();
      if (arm.progress > 0.01) {
        const r = Math.min(this.hitWidth, this.hitHeight) * 0.5 - 2;
        const a0 = -Math.PI / 2;
        g.circle(0, 0, r).stroke({ width: 10, color: 0x2b1d2e, alpha: 0.35 });
        g.arc(0, 0, r, a0, a0 + arm.progress * Math.PI * 2).stroke({
          width: 8,
          color: 0xffd23f,
          cap: 'round',
        });
      }
    }
  }
}
