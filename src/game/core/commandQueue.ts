/**
 * FIFO of commands waiting for the next sim step. Input code pushes; the sim
 * drains at the start of each step, so commands always take effect on a
 * step boundary and replays are deterministic.
 */
export class CommandQueue<C> {
  private items: C[] = [];

  push(command: C): void {
    this.items.push(command);
  }

  drain(): C[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  get size(): number {
    return this.items.length;
  }
}
