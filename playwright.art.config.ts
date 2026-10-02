import { defineConfig } from '@playwright/test';

// Art pipeline jobs that need the real game to draw: `pnpm art:templates`.
// Not part of the test suite.
export default defineConfig({
  testDir: './tests/art',
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
});
