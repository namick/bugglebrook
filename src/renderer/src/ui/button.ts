import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

/** A springy, wordless button. Hover grows it; press squashes it. */
export class PictureButton extends Container {
  private target = 1;
  private current = 1;

  constructor(
    readonly art: Container,
    readonly hitWidth: number,
    readonly hitHeight: number,
    onPress: () => void,
  ) {
    super();
    this.addChild(art);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = new Graphics()
      .rect(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight)
      .fill({ color: 0, alpha: 0 });
    this.addChildAt(hit, 0);
    this.on('pointerover', () => (this.target = 1.06));
    this.on('pointerout', () => (this.target = 1));
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.current = 0.9;
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      onPress();
    });
  }

  update(dt: number): void {
    this.current += (this.target - this.current) * Math.min(1, dt * 14);
    this.scale.set(this.current);
  }
}
