import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

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

/** A springy, wordless button. Hover grows it; press squashes it; release bounces. */
export class PictureButton extends Container {
  private readonly bounce = new Bounce();
  private hovered = false;
  /** Called when the pointer comes over it (a soft tick sound). */
  onHover: (() => void) | null = null;
  enabled = true;

  constructor(
    readonly art: Container,
    readonly hitWidth: number,
    readonly hitHeight: number,
    onPress: () => void,
  ) {
    super();
    markUi(this);
    this.addChild(art);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = new Graphics()
      .rect(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight)
      .fill({ color: 0, alpha: 0 });
    this.addChildAt(hit, 0);
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
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this.enabled) return;
      this.bounce.kick(1.2);
      onPress();
    });
  }

  get isHovered(): boolean {
    return this.hovered;
  }

  update(dt: number): void {
    this.scale.set(this.bounce.update(dt));
  }
}
