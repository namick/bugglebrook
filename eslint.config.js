import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['out/**', 'dist/**', 'build/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // The sim core is pure and deterministic: no DOM, no Node, no Pixi, no
    // Electron, no wall clock, no unseeded randomness.
    files: ['src/game/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'pixi.js/*'], message: 'The sim core must not depend on rendering.' },
            { group: ['electron', 'node:*', 'fs', 'path'], message: 'The sim core must run anywhere.' },
            {
              group: ['**/renderer/**', '**/main/**', '**/preload/**'],
              message: 'The sim core cannot import app layers.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from core/rng.' },
        { object: 'Date', property: 'now', message: 'The sim has no clock; use sim.tick.' },
        { object: 'performance', property: 'now', message: 'The sim has no clock; use sim.tick.' },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The sim has no clock.' },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'node:*'], message: 'The renderer is sandboxed; use window.bugglebrook.' },
            { group: ['**/main/**', '**/preload/index*'], message: 'Talk to main through the preload API.' },
          ],
        },
      ],
    },
  },
  prettier,
);
