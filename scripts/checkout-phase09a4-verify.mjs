/** Local, nonpublishing source-identified regression evidence. Never loads repository credentials. */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkoutRegressionPaths } from './checkout-release-checks.mjs';

const output = resolve('docs/architecture/checkout/phase09a4-evidence');
mkdirSync(output, { recursive: true });
const target = new URL(process.env.TEST_DATABASE_URL ?? 'invalid:');
if (
  process.env.CHECKOUT_RC_LOCAL_ALLOW !== '1' ||
  target.hostname !== '127.0.0.1' ||
  target.port !== '55440' ||
  target.pathname !== '/maevelle_test'
)
  throw Error('Requires explicitly authorized assignment-owned loopback disposable database.');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
export function sourceSnapshot() {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter((file) =>
      /^(apps|packages|scripts|tooling|\.circleci)\/|^(package.json|pnpm-lock.yaml|vitest.config.ts|tsconfig.*json|eslint.config.*|test-api.mjs)$/.test(
        file,
      ),
    )
    .filter((file) => !/next-env\.d\.ts$/.test(file))
    .sort();
  const hashes = Object.fromEntries(
    files.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
  );
  return {
    head: git('rev-parse', 'HEAD'),
    branch: git('branch', '--show-current'),
    digest: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
    hashes,
  };
}
const generatedFiles = ['apps/admin/next-env.d.ts', 'apps/storefront/next-env.d.ts'];
const generated = new Map(generatedFiles.map((file) => [file, readFileSync(file)]));
const before = sourceSnapshot();
const ledger = {
  before,
  database: {
    host: target.hostname,
    port: target.port,
    database: 'maevelle_test',
    container: 'maevelle-phase09a4-pg',
    postgres: '18.3',
  },
  node: process.version,
  vitest: JSON.parse(readFileSync('node_modules/vitest/package.json')).version,
  started: new Date().toISOString(),
  checks: [],
};
writeFileSync(`${output}/entry-status.txt`, git('status', '--short'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: target.href,
  UPGRADE_TEST_ALLOW: '1',
};
function run(name, args, options = {}) {
  const log = openSync(`${output}/${name}.log`, 'w');
  const start = Date.now();
  const result = spawnSync(process.execPath, args, {
    env,
    stdio: ['ignore', log, log],
    ...options,
  });
  closeSync(log);
  ledger.checks.push({
    name,
    command: ['node', ...args],
    exit: result.status,
    durationMs: Date.now() - start,
    ...(result.error ? { error: result.error.message } : {}),
  });
  writeFileSync(`${output}/verification.json`, JSON.stringify(ledger, null, 2));
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'} (${Date.now() - start}ms)`);
}
run('migration-history', ['scripts/check-migration-history.mjs']);
run('tooling', [
  '--test',
  'scripts/check-migration-history.test.mjs',
  'scripts/check-secrets.test.mjs',
  'scripts/release/credentials.test.mjs',
  'scripts/release/manifest.test.mjs',
  'scripts/release/registry.test.mjs',
  'scripts/staging/operator.test.mjs',
]);
for (const name of ['secrets', 'architecture', 'hardening'])
  run(name, [`scripts/check-${name}.mjs`]);
run('backend-types', [
  'node_modules/typescript/bin/tsc',
  '--build',
  'tsconfig.build.json',
  '--pretty',
  'false',
]);
run('all-types', ['node_modules/typescript/bin/tsc', '--build', '--pretty', 'false']);
run('fresh-migration', ['packages/database/dist/src/migrate-cli.js']);
run('populated-upgrades', ['packages/database/dist/src/upgrade-test-cli.js']);
run('broad', [
  'node_modules/vitest/vitest.mjs',
  'run',
  ...checkoutRegressionPaths,
  'apps/admin/src/refresh-button.test.tsx',
  'apps/admin/src/user-menu.test.tsx',
  'apps/api/src/routes/pricing.test.ts',
  'apps/api/src/routes/promotions.test.ts',
  'packages/database/src/reviews.test.ts',
  'packages/database/src/iam.test.ts',
  'packages/database/src/orders.test.ts',
  'packages/database/src/procurement.test.ts',
  'packages/database/src/inventory.test.ts',
  'packages/database/src/inventory-units.test.ts',
  'packages/database/src/seed/seed.test.ts',
  'packages/database/src/integrity.test.ts',
  'packages/database/src/catalog.test.ts',
  'packages/database/src/catalog-variants.test.ts',
  'apps/api/src/admin-access.test.ts',
  'apps/admin/lib/auth/access.test.ts',
  'apps/admin/src/admin-proxy.test.ts',
  'apps/admin/src/account-ui.test.tsx',
  'apps/admin/lib/payments/transport.test.ts',
  'apps/api/src/account-cart.test.ts',
  'apps/storefront/features/cart',
  'packages/database/src/wishlist/account.test.ts',
  'packages/database/src/wishlist-sharing.test.ts',
  '--reporter=json',
  `--outputFile=${output}/broad.json`,
]);
run('lint', ['node_modules/eslint/bin/eslint.js', '.']);
for (const app of ['storefront', 'admin'])
  run(`${app}-build`, [resolve(`apps/${app}/node_modules/next/dist/bin/next`), 'build'], {
    cwd: resolve(`apps/${app}`),
    env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW: 'false' },
  });
for (const [file, bytes] of generated) writeFileSync(file, bytes);
ledger.after = sourceSnapshot();
ledger.sourceUnchanged = before.digest === ledger.after.digest && before.head === ledger.after.head;
ledger.finished = new Date().toISOString();
writeFileSync(`${output}/verification.json`, JSON.stringify(ledger, null, 2));
console.log(`Source unchanged: ${ledger.sourceUnchanged}`);
process.exitCode =
  ledger.sourceUnchanged && ledger.checks.every((check) => check.exit === 0) ? 0 : 1;
