import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  architecturePolicy,
  dependencyFields,
  runtimeDependencyFields,
  workspacePaths,
} from './architecture-policy.mjs';

function matchesDependencyPattern(dependencyName, pattern) {
  const expression = new RegExp(
    `^${pattern
      .split('*')
      .map((segment) => segment.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
      .join('.*')}$`,
  );

  return expression.test(dependencyName);
}

function createViolation(workspacePath, dependencyName, dependencyField, reason) {
  return [
    'ARCHITECTURE VIOLATION',
    `${workspacePath} must not declare ${dependencyName} in ${dependencyField}.`,
    reason,
  ].join('\n');
}

/**
 * Validates one workspace manifest. Test-only consumers may declare testkit in
 * devDependencies, but production runtime dependency fields must never do so.
 */
export function validateManifest(workspacePath, manifest) {
  const policy = architecturePolicy[workspacePath];

  if (!policy) {
    return [`ARCHITECTURE VIOLATION\nNo architecture policy exists for ${workspacePath}.`];
  }

  const violations = [];

  for (const dependencyField of dependencyFields) {
    const dependencies = manifest[dependencyField] ?? {};

    for (const dependencyName of Object.keys(dependencies)) {
      const forbiddenPattern = policy.forbiddenDependencies?.find((pattern) =>
        matchesDependencyPattern(dependencyName, pattern),
      );

      if (forbiddenPattern) {
        violations.push(
          createViolation(
            workspacePath,
            dependencyName,
            dependencyField,
            policy.reason ?? `This dependency is forbidden by the ${workspacePath} policy.`,
          ),
        );
      }

      if (
        workspacePath !== 'packages/testkit' &&
        runtimeDependencyFields.includes(dependencyField) &&
        dependencyName === '@maevelle/testkit'
      ) {
        violations.push(
          createViolation(
            workspacePath,
            dependencyName,
            dependencyField,
            'Production code may use testkit only from test files via a devDependency.',
          ),
        );
      }
    }
  }

  return violations;
}

export async function validateWorkspaceManifests(repositoryRoot) {
  const violations = [];

  for (const workspacePath of workspacePaths) {
    const manifestPath = resolve(repositoryRoot, workspacePath, 'package.json');

    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      violations.push(...validateManifest(workspacePath, manifest));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      violations.push(
        `ARCHITECTURE VIOLATION\nCould not read ${workspacePath}/package.json.\n${detail}`,
      );
    }
  }

  return violations;
}

async function main() {
  const violations = await validateWorkspaceManifests(process.cwd());

  if (violations.length > 0) {
    console.error(violations.join('\n\n'));
    process.exitCode = 1;
    return;
  }

  console.log(`Architecture check passed for ${workspacePaths.length} workspace packages.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
