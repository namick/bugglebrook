/// <reference types="vite/client" />
import type { BugglebrookApi } from '../../shared/ipc';

declare global {
  interface Window {
    /** Provided by the preload script. Missing when running in a plain browser. */
    bugglebrook?: BugglebrookApi;
  }
}
