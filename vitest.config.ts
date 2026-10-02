import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // The step benchmark runs on its own: `pnpm test:perf` (vitest.bench.config.ts).
    exclude: [...configDefaults.exclude, 'tests/unit/stepBench.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'node',
    restoreMocks: true,
    // Long seeded runs share the CPU with every other file; give them room.
    testTimeout: 30_000,
  },
});
