export type Handler<P> = (payload: P) => void;

/**
 * Small typed pub/sub. `Events` maps event names to payload types.
 * Handlers run synchronously in subscription order. A handler that throws
 * does not stop the others; the error goes to `onError`.
 */
export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();
  private anyHandlers = new Set<(name: keyof Events, payload: unknown) => void>();

  constructor(private readonly onError: (err: unknown) => void = (err) => console.error(err)) {}

  on<K extends keyof Events>(name: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(name, handler);
  }

  once<K extends keyof Events>(name: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(name: K, handler: Handler<Events[K]>): void {
    this.handlers.get(name)?.delete(handler as Handler<never>);
  }

  /** Subscribe to every event. Useful for logging and test recording. */
  onAny(handler: (name: keyof Events, payload: unknown) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.handlers.get(name);
    if (set) {
      for (const handler of [...set]) {
        try {
          (handler as Handler<Events[K]>)(payload);
        } catch (err) {
          this.onError(err);
        }
      }
    }
    for (const handler of [...this.anyHandlers]) {
      try {
        handler(name, payload);
      } catch (err) {
        this.onError(err);
      }
    }
  }

  listenerCount<K extends keyof Events>(name: K): number {
    return this.handlers.get(name)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
