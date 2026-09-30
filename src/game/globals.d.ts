// The sim core compiles without DOM or Node typings on purpose, so it cannot
// reach for window, document, fs, and so on. `console` is the one host
// global it may use; both Node and browsers provide it.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
