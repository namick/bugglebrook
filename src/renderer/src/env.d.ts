/// <reference types="vite/client" />
import type { BugglebrookApi } from '../../shared/ipc';

declare global {
  interface ImportMetaEnv {
    /** Set by `pnpm art:watch`: open the Art Lab at start (dev only). */
    readonly VITE_BB_ART_LAB?: string;
  }

  interface Window {
    /** Provided by the preload script. Missing when running in a plain browser. */
    bugglebrook?: BugglebrookApi;
  }
}
