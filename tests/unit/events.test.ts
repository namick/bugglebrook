import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/game/core/events';
import { CommandQueue } from '../../src/game/core/commandQueue';

interface TestEvents {
  ping: { n: number };
  pong: { s: string };
}

describe('EventBus', () => {
  it('delivers payloads to subscribers of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);
    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('calls handlers in subscription order', () => {
    const bus = new EventBus<TestEvents>();
    const order: number[] = [];
    bus.on('ping', () => order.push(1));
    bus.on('ping', () => order.push(2));
    bus.emit('ping', { n: 0 });
    expect(order).toEqual([1, 2]);
  });

  it('unsubscribes through the returned function and off()', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('ping', a);
    bus.on('ping', b);
    offA();
    bus.off('ping', b);
    bus.emit('ping', { n: 0 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('once() fires a single time', () => {
    const bus = new EventBus<TestEvents>();
    const h = vi.fn();
    bus.once('ping', h);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler from the others', () => {
    const errors: unknown[] = [];
    const bus = new EventBus<TestEvents>((e) => errors.push(e));
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', after);
    bus.emit('ping', { n: 1 });
    expect(after).toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it('onAny sees every event with its name', () => {
    const bus = new EventBus<TestEvents>();
    const seen: string[] = [];
    bus.onAny((name) => seen.push(String(name)));
    bus.emit('ping', { n: 1 });
    bus.emit('pong', { s: 'x' });
    expect(seen).toEqual(['ping', 'pong']);
  });

  it('tolerates handlers that unsubscribe during emit', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('CommandQueue', () => {
  it('drains in FIFO order and empties', () => {
    const q = new CommandQueue<number>();
    q.push(1);
    q.push(2);
    expect(q.size).toBe(2);
    expect(q.drain()).toEqual([1, 2]);
    expect(q.size).toBe(0);
    expect(q.drain()).toEqual([]);
  });
});
