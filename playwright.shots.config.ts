import { defineConfig } from '@playwright/test';

// Screenshot tour for reviewing the art by eye: `pnpm shots`. Writes PNGs to
// /tmp/bb-shots (or $BB_SHOTS_DIR). Not part of the test suite.
export default defineConfig({
  testDir: './tests/shots',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
});
