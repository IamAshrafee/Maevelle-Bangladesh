export const runtimeDependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];

export const dependencyFields = [...runtimeDependencyFields, 'devDependencies'];

export const providerSdkPatterns = [
  '@aws-sdk/*',
  'aws-sdk',
  '@cloudflare/*',
  '@sendgrid/*',
  '@stripe/*',
  'stripe',
  '@twilio/*',
  'twilio',
];

const databaseImportPatterns = [
  '@maevelle/database',
  '@maevelle/database/*',
  '**/packages/database/**',
];

const uiPackageNames = ['@maevelle/ui-admin', '@maevelle/ui-storefront'];

const appPackageNames = [
  '@maevelle/storefront',
  '@maevelle/admin',
  '@maevelle/api',
  '@maevelle/worker',
];

const coreFrameworkDependencyPatterns = [
  'next',
  'next/*',
  'react',
  'react/*',
  'fastify',
  'fastify/*',
  ...providerSdkPatterns,
];

const coreFrameworkImportPatterns = [
  ...coreFrameworkDependencyPatterns,
  'node:http',
  'node:https',
  'http',
  'https',
];

/**
 * The repository's explicit, high-level dependency policy. Extend this map as
 * real domain modules are introduced; do not add speculative domain paths.
 */
export const architecturePolicy = {
  'apps/storefront': {
    forbiddenDependencies: ['@maevelle/database'],
    restrictedImportPatterns: databaseImportPatterns,
    reason: 'Storefront accesses backend functionality through API contracts.',
  },
  'apps/admin': {
    forbiddenDependencies: ['@maevelle/database'],
    restrictedImportPatterns: databaseImportPatterns,
    reason: 'Admin accesses backend functionality through API contracts.',
  },
  'apps/api': {},
  'apps/worker': {},
  'packages/core': {
    forbiddenDependencies: [
      ...coreFrameworkDependencyPatterns,
      ...uiPackageNames,
      ...appPackageNames,
    ],
    restrictedImportPatterns: [
      ...coreFrameworkImportPatterns,
      ...uiPackageNames,
      ...appPackageNames,
      '**/apps/**',
    ],
    reason: 'Core must remain framework-neutral and independent of application entry points.',
  },
  'packages/database': {
    forbiddenDependencies: [...uiPackageNames, ...appPackageNames],
    restrictedImportPatterns: [...uiPackageNames, ...appPackageNames, '**/apps/**'],
    reason: 'Database infrastructure must not depend on UI or application packages.',
  },
  'packages/contracts': {
    forbiddenDependencies: [
      '@maevelle/database',
      ...uiPackageNames,
      ...appPackageNames,
      ...providerSdkPatterns,
    ],
    restrictedImportPatterns: [
      ...databaseImportPatterns,
      ...uiPackageNames,
      ...appPackageNames,
      ...providerSdkPatterns,
      '**/apps/**',
    ],
    reason: 'Contracts remain transport-focused and independent of infrastructure and UI.',
  },
  'packages/config': {},
  'packages/observability': {},
  'packages/security': {},
  'packages/ui-admin': {
    forbiddenDependencies: ['@maevelle/database'],
    restrictedImportPatterns: databaseImportPatterns,
    reason: 'Shared UI packages must not access database infrastructure.',
  },
  'packages/ui-storefront': {
    forbiddenDependencies: ['@maevelle/database'],
    restrictedImportPatterns: databaseImportPatterns,
    reason: 'Shared UI packages must not access database infrastructure.',
  },
  'packages/testkit': {},
};

export const workspacePaths = Object.keys(architecturePolicy);

export const productionWorkspacePaths = workspacePaths.filter(
  (workspacePath) => workspacePath !== 'packages/testkit',
);

export const privateWorkspaceImportPatterns = ['@maevelle/*/src/**', '**/packages/*/src/**'];
