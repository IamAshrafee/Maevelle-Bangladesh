import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

import {
  architecturePolicy,
  privateWorkspaceImportPatterns,
  productionWorkspacePaths,
  workspacePaths,
} from './scripts/architecture-policy.mjs';

const sourceFiles = (workspacePathsToLint) =>
  workspacePathsToLint.map((workspacePath) => `${workspacePath}/src/**/*.{ts,tsx}`);

const restrictedImports = (patterns, message) => [
  'error',
  {
    patterns: [
      {
        group: patterns,
        message,
      },
    ],
  },
];

const policyImportPatterns = (workspacePath) => [
  ...privateWorkspaceImportPatterns,
  ...(architecturePolicy[workspacePath].restrictedImportPatterns ?? []),
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'docs/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['scripts/**/*.mjs', 'tooling/**/*.mjs', '*.config.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
    },
  },
  ...workspacePaths.map((workspacePath) => ({
    files: sourceFiles([workspacePath]),
    rules: {
      'no-restricted-imports': restrictedImports(
        policyImportPatterns(workspacePath),
        architecturePolicy[workspacePath].reason ??
          'Import public package entrypoints instead of another workspace package’s private source path.',
      ),
    },
  })),
  ...productionWorkspacePaths.map((workspacePath) => ({
    files: sourceFiles([workspacePath]),
    ignores: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports(
        [...policyImportPatterns(workspacePath), '@maevelle/testkit', '@maevelle/testkit/**'],
        architecturePolicy[workspacePath].reason ??
          'Production code must not import testkit. Tests may import it through a devDependency.',
      ),
    },
  })),
);
