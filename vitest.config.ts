import { defineConfig } from 'vitest/config';

const defaultTestDatabaseUrl =
  'postgresql://maevelle_dev:maevelle_dev_password@127.0.0.1:5434/maevelle_test';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl,
    },
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
