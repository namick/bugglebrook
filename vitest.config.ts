import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'node',
    restoreMocks: true,
    // Long seeded runs share the CPU with every other file; give them room.
    testTimeout: 30_000,
  },
});
