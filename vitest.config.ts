import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultTestDatabaseUrl =
  'postgresql://maevelle_dev:maevelle_dev_password@127.0.0.1:5434/maevelle_test';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: '$1',
        customResolver(source, importer) {
          if (importer && importer.includes('apps/storefront')) {
            return path.resolve(__dirname, 'apps/storefront', source);
          }
          return path.resolve(__dirname, 'apps/admin', source);
        },
      },
    ],
  },
  test: {
    environment: 'node',
    // Integration files share one disposable PostgreSQL database. Run files serially;
    // tests that prove concurrency still open independent connections explicitly.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl,
    },
    include: [
      'apps/**/src/**/*.{test,spec}.ts',
      'apps/**/src/**/*.{test,spec}.tsx',
      'apps/**/lib/**/*.{test,spec}.ts',
      'apps/**/lib/**/*.{test,spec}.tsx',
      'apps/**/features/**/*.{test,spec}.ts',
      'apps/**/features/**/*.{test,spec}.tsx',
      'packages/**/src/**/*.{test,spec}.ts',
      'packages/**/src/**/*.{test,spec}.tsx',
      'tooling/**/*.test.ts',
      'tooling/**/*.test.mjs',
    ],
  },
});
