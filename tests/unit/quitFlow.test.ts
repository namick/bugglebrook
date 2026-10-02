import { describe, expect, it } from 'vitest';
import { FLUSH_DEADLINE_MS, QuitFlow } from '../../src/main/quitFlow';
import type { QuitEffects } from '../../src/main/quitFlow';

// P-11 and P-12 of the pre-release review: the last save before the app
// closes. The flow is driven here the way Electron drives it: `before-quit`
// on the app (Cmd+Q, the dock, `app.quit()`), then `close` on the window.

interface Fake extends QuitEffects {
  calls: string[];
  /** Pending timers. */
  timers: { fn: () => void; ms: number }[];
  /** Is there a live renderer to ask? */
  alive: boolean;
}

function fake(): Fake {
  const f: Fake = {
    calls: [],
    timers: [],
    alive: true,
    requestFlush() {
      f.calls.push('flush');
      return f.alive;
    },
    closeWindow() {
      f.calls.push('close');
    },
    quit() {
      f.calls.push('quit');
    },
    later(fn, ms) {
      f.timers.push({ fn, ms });
    },
  };
  return f;
}

describe('saving before the app closes', () => {
  it('waits up to 5 s for the last save (P-11)', () => {
    expect(FLUSH_DEADLINE_MS).toBe(5000);
  });

  it('Cmd+Q holds the quit, saves, then quits for real on the first press (P-12)', () => {
    const fx = fake();
    const flow = new QuitFlow(fx);
    // before-quit: held back while the game saves.
    expect(flow.beforeQuit()).toBe(true);
    expect(fx.calls).toEqual(['flush']);
    // The window's close that a quit would bring is held too, without asking twice.
    expect(flow.close()).toBe(true);
    expect(fx.calls).toEqual(['flush']);
    flow.flushed();
    // It quits again by itself: the player never presses twice.
    expect(fx.calls).toEqual(['flush', 'quit']);
    // That second quit, and the window's close, now go through.
    expect(flow.beforeQuit()).toBe(false);
    expect(flow.close()).toBe(false);
    expect(fx.calls).toEqual(['flush', 'quit']);
  });

  it('closing the window saves, then closes it', () => {
    const fx = fake();
    const flow = new QuitFlow(fx);
    expect(flow.close()).toBe(true);
    flow.flushed();
    expect(fx.calls).toEqual(['flush', 'close']);
    expect(flow.close()).toBe(false);
  });

  it('a quit during a window close is remembered: it quits, not just closes', () => {
    const fx = fake();
    const flow = new QuitFlow(fx);
    expect(flow.close()).toBe(true);
    expect(flow.beforeQuit()).toBe(true);
    flow.flushed();
    expect(fx.calls).toEqual(['flush', 'quit']);
  });

  it('gives up waiting at the deadline and closes anyway', () => {
    const fx = fake();
    const flow = new QuitFlow(fx);
    flow.beforeQuit();
    expect(fx.timers.map((t) => t.ms)).toEqual([FLUSH_DEADLINE_MS]);
    fx.timers[0]!.fn();
    expect(fx.calls).toEqual(['flush', 'quit']);
    // A save that finishes late changes nothing.
    flow.flushed();
    expect(fx.calls).toEqual(['flush', 'quit']);
  });

  it('lets the close through at once when there is no live page to save', () => {
    const fx = fake();
    fx.alive = false;
    const flow = new QuitFlow(fx);
    expect(flow.beforeQuit()).toBe(false);
    expect(flow.phase).toBe('done');
    expect(fx.timers).toEqual([]);
  });

  it('an update restart skips the wait: the game saved before asking', () => {
    const fx = fake();
    const flow = new QuitFlow(fx);
    flow.skip();
    expect(flow.beforeQuit()).toBe(false);
    expect(flow.close()).toBe(false);
    expect(fx.calls).toEqual([]);
  });
});
