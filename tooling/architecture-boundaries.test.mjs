import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { validateManifest, validateWorkspaceManifests } from '../scripts/check-architecture.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

describe('architecture manifest policy', () => {
  it('accepts the current workspace manifests', async () => {
    await expect(validateWorkspaceManifests(repositoryRoot)).resolves.toEqual([]);
  });

  it('rejects a storefront database dependency', () => {
    expect(
      validateManifest('apps/storefront', {
        dependencies: { '@maevelle/database': 'workspace:*' },
      }),
    ).toContainEqual(
      expect.stringContaining('apps/storefront must not declare @maevelle/database'),
    );
  });

  it('rejects a core UI dependency', () => {
    expect(
      validateManifest('packages/core', {
        devDependencies: { '@maevelle/ui-admin': 'workspace:*' },
      }),
    ).toContainEqual(expect.stringContaining('packages/core must not declare @maevelle/ui-admin'));
  });

  it('rejects a production runtime testkit dependency', () => {
    expect(
      validateManifest('apps/api', {
        dependencies: { '@maevelle/testkit': 'workspace:*' },
      }),
    ).toContainEqual(expect.stringContaining('apps/api must not declare @maevelle/testkit'));
  });

  it('allows testkit as a test-only devDependency', () => {
    expect(
      validateManifest('apps/api', {
        devDependencies: { '@maevelle/testkit': 'workspace:*' },
      }),
    ).toEqual([]);
  });
});

describe('architecture import policy', () => {
  it('rejects an Admin database import without creating a fixture file', async () => {
    const eslint = new ESLint({ cwd: repositoryRoot });
    const [result] = await eslint.lintText("import '@maevelle/database';\n", {
      filePath: 'apps/admin/src/architecture-fixture.ts',
    });

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
          message: expect.stringContaining(
            'Admin accesses backend functionality through API contracts.',
          ),
        }),
      ]),
    );
  });
});
