/**
 * The renderer's global error boundary. An uncaught error (in a frame, an
 * event handler, or while starting) is written to the log file through
 * `bugglebrook.logError` and replaces the game with a wordless "oops, bugs
 * got loose" screen: an open jar, three bugs running off, and one big
 * reload button. The autosave has the world, so reloading loses little.
 *
 * The screen is plain DOM and inline SVG, not Pixi, because Pixi may be what
 * broke. Promise rejections nobody handled are logged but do not take the
 * game down: most are a failed load the game already copes with.
 */

export interface OopsState {
  shown: boolean;
  /** The reload button's center in client pixels, while shown. */
  reload: { x: number; y: number } | null;
  /** Errors reported to the log so far. */
  logged: number;
}

/** Turn whatever was thrown into a line (and stack) for the log. */
export function describeThrown(err: unknown, where?: string): string {
  let text: string;
  if (err instanceof Error) text = err.stack ?? `${err.name}: ${err.message}`;
  else if (typeof err === 'string') text = err;
  else {
    try {
      text = JSON.stringify(err) ?? String(err);
    } catch {
      text = String(err);
    }
  }
  return where ? `${text}\n  at ${where}` : text;
}

const OUTLINE = '#2b1d2e';

/** The picture: a tipped-over jar and three little bugs making a run for it. */
const ART = `
<svg viewBox="0 0 640 360" width="640" height="360" aria-hidden="true">
  <g stroke="${OUTLINE}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="320" cy="300" rx="260" ry="26" fill="#3f8f2c" stroke="none" opacity="0.5"/>
    <g transform="rotate(-78 230 240)">
      <rect x="170" y="150" width="120" height="150" rx="26" fill="#d6f0ff" fill-opacity="0.85"/>
      <rect x="160" y="128" width="140" height="30" rx="10" fill="#c98d52"/>
    </g>
    <g class="bb-run" style="animation-delay:0s">
      <ellipse cx="400" cy="262" rx="34" ry="28" fill="#ff4d5e"/>
      <circle cx="390" cy="252" r="6" fill="${OUTLINE}" stroke="none"/>
      <circle cx="420" cy="254" r="9" fill="#fff"/><circle cx="423" cy="255" r="4" fill="${OUTLINE}" stroke="none"/>
      <path d="M380 288 l-8 12 M400 290 v14 M420 288 l8 12" fill="none"/>
    </g>
    <g class="bb-run" style="animation-delay:0.15s">
      <ellipse cx="488" cy="214" rx="28" ry="22" fill="#7bd84a"/>
      <circle cx="504" cy="208" r="8" fill="#fff"/><circle cx="507" cy="209" r="3.5" fill="${OUTLINE}" stroke="none"/>
      <path d="M502 192 q8 -22 22 -26 M492 192 q0 -24 10 -32" fill="none"/>
      <path d="M476 234 l-6 10 M496 236 l6 10" fill="none"/>
    </g>
    <g class="bb-run" style="animation-delay:0.3s">
      <ellipse cx="566" cy="270" rx="26" ry="18" fill="#ffd23f"/>
      <circle cx="582" cy="264" r="7" fill="#fff"/><circle cx="584" cy="265" r="3" fill="${OUTLINE}" stroke="none"/>
      <path d="M556 286 l-6 8 M574 286 l6 8" fill="none"/>
    </g>
  </g>
</svg>`;

/** The reload button's face: a round arrow on a green token. */
const RELOAD = `
<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
  <circle cx="60" cy="66" r="52" fill="${OUTLINE}" opacity="0.18"/>
  <circle cx="60" cy="60" r="52" fill="#7bd84a" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M82 44 A28 28 0 1 0 88 66" fill="none" stroke="${OUTLINE}" stroke-width="18" stroke-linecap="round"/>
  <path d="M82 44 A28 28 0 1 0 88 66" fill="none" stroke="#fffbef" stroke-width="10" stroke-linecap="round"/>
  <path d="M70 28 L96 34 L86 58 Z" fill="#fffbef" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

const STYLE = `
#bb-oops { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 24px; background: #8fd3ff; cursor: default; }
#bb-oops svg { max-width: 80vw; height: auto; }
#bb-oops button { border: 0; padding: 0; background: none; cursor: pointer; transition: transform 0.12s; }
#bb-oops button:hover { transform: scale(1.08); }
#bb-oops button:active { transform: scale(0.9); }
#bb-oops .bb-run { animation: bb-hop 0.5s ease-in-out infinite alternate; }
@keyframes bb-hop { from { transform: translateY(0); } to { transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) { #bb-oops .bb-run { animation: none; } }
`;

export interface ErrorBoundary {
  state(): OopsState;
  /** Report an error by hand (a failed start). Shows the screen. */
  crash(err: unknown, where?: string): void;
  /** Called once, when the screen first shows (stop the frame loop, hush the audio). */
  onCrash: (() => void) | null;
}

/**
 * Listen for uncaught errors on `win`. `log` writes a line to the log file;
 * `reload` restarts the page (the reload button).
 */
export function installErrorBoundary(
  win: Window,
  log: (text: string) => void,
  reload: () => void = () => win.location.reload(),
): ErrorBoundary {
  let screen: HTMLElement | null = null;
  let logged = 0;
  const report = (text: string): void => {
    logged++;
    try {
      log(text);
    } catch {
      // The log is best effort.
    }
  };
  const show = (): void => {
    if (screen) return;
    const doc = win.document;
    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);
    screen = doc.createElement('div');
    screen.id = 'bb-oops';
    screen.innerHTML = ART;
    const button = doc.createElement('button');
    button.id = 'bb-oops-reload';
    button.type = 'button';
    button.innerHTML = RELOAD;
    button.addEventListener('click', () => reload());
    screen.appendChild(button);
    doc.body.appendChild(screen);
    try {
      boundary.onCrash?.();
    } catch {
      // Already down; nothing more to stop.
    }
  };
  const boundary: ErrorBoundary = {
    onCrash: null,
    crash(err, where) {
      report(describeThrown(err, where));
      show();
    },
    state() {
      const button = screen?.querySelector('button');
      const r = button?.getBoundingClientRect();
      return {
        shown: screen !== null,
        reload: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null,
        logged,
      };
    },
  };
  win.addEventListener('error', (e: ErrorEvent) => {
    boundary.crash(e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined);
  });
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    report(`Unhandled promise rejection: ${describeThrown(e.reason)}`);
  });
  return boundary;
}
