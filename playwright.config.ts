import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Every test should finish in about a minute even on CI's software renderer. The hard
  // limit leaves room for a slow runner; the slow-test report names any test past 60 s.
  timeout: 120_000,
  reportSlowTests: { max: 0, threshold: 60_000 },
  expect: { timeout: 10_000 },
  // One Electron app at a time: they share the display and GPU. Tests are
  // independent (each launches its own app), so CI shards split them by test.
  workers: 1,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
