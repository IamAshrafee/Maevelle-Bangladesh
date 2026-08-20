import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/**/src/**/*.{test,spec}.ts',
      'apps/**/src/**/*.{test,spec}.tsx',
      'packages/**/src/**/*.{test,spec}.ts',
      'packages/**/src/**/*.{test,spec}.tsx',
      'tooling/**/*.test.ts',
      'tooling/**/*.test.mjs',
    ],
  },
});
