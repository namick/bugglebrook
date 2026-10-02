import { defineConfig } from 'vitest/config';

// The step benchmark (`pnpm test:perf`) runs alone, so no other test file shares the CPU with it.
export default defineConfig({
  test: {
    include: ['tests/unit/stepBench.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'node',
    testTimeout: 60_000,
    // Print the timings even when the test passes.
    silent: false,
  },
});
