/** Nonpublishing candidate checks. Explicit disposable target required even in CI. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const checkoutRegressionPaths = [
  'packages/contracts/src/money-presentation.test.ts',
  'packages/database/src/pricing.test.ts',
  'packages/database/src/migrate.test.ts',
  'packages/database/src/checkout',
  'packages/database/src/payments.test.ts',
  'packages/database/src/payments/manual-payment.test.ts',
  'packages/database/src/payments/release-integrity.test.ts',
  'packages/database/src/payments/cash-shortfall',
  'packages/database/src/commerce',
  'packages/database/src/finance.test.ts',
  'packages/database/src/analytics/commerce',
  'packages/database/src/testing/pool-timeout.test.ts',
  'packages/database/src/cart-foundation.test.ts',
  'apps/api/src/checkout-foundation.test.ts',
  'apps/api/src/checkout-delivery.test.ts',
  'apps/api/src/payment-operations.test.ts',
  'apps/api/src/cash-shortfall.test.ts',
  'apps/api/src/checkout-public-money.test.ts',
  'apps/api/src/shopper-auth.test.ts',
  'apps/api/src/privacy-preferences.test.ts',
  'apps/api/src/phase08-ingress.test.ts',
  'apps/api/src/wishlist-analytics.test.ts',
  'apps/worker/src/worker.test.ts',
  'apps/storefront/features/checkout',
  'apps/storefront/features/orders/retail-tracking.test.tsx',
  'apps/storefront/features/wishlist',
  'apps/storefront/lib/format',
  'apps/admin/src/cash-presentation.test.tsx',
  'apps/admin/src/payment-permissions.test.tsx',
  'apps/storefront/lib/analytics',
  'apps/admin/src/commerce-analytics.test.tsx',
  'packages/observability/src/index.test.ts',
  'apps/api/src/admin-access.test.ts',
  'apps/admin/lib/auth/access.test.ts',
  'apps/admin/src/admin-proxy.test.ts',
  'apps/admin/src/account-ui.test.tsx',
  'apps/admin/lib/payments/transport.test.ts',
  'apps/api/src/account-cart.test.ts',
  'apps/storefront/features/cart',
  'packages/database/src/wishlist/account.test.ts',
  'packages/database/src/wishlist-sharing.test.ts',
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
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--list') {
    console.log(checkoutRegressionPaths.join('\n'));
  } else {
    const url = new URL(process.env.TEST_DATABASE_URL ?? 'invalid:');
    if (
      process.env.CHECKOUT_RC_LOCAL_ALLOW !== '1' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/maevelle_test'
    )
      throw new Error(
        'Explicit local disposable maevelle_test target and CHECKOUT_RC_LOCAL_ALLOW=1 required.',
      );
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url.href,
      UPGRADE_TEST_ALLOW: '1',
    };
    const node = (args) => {
      const result = spawnSync(process.execPath, args, { stdio: 'inherit', env, shell: false });
      if (result.status !== 0) process.exit(result.status ?? 1);
    };
    node(['scripts/check-migration-history.mjs']);
    node(['scripts/check-formatting.mjs']);
    node(['node_modules/eslint/bin/eslint.js', '.', '--max-warnings=0']);
    node([
      '--test',
      'scripts/check-migration-history.test.mjs',
      'scripts/check-secrets.test.mjs',
      'scripts/check-formatting.test.mjs',
      'scripts/format-safety.test.mjs',
      'scripts/release/credentials.test.mjs',
      'scripts/release/manifest.test.mjs',
      'scripts/release/registry.test.mjs',
      'scripts/staging/operator.test.mjs',
    ]);
    node(['scripts/check-secrets.mjs']);
    node(['scripts/check-architecture.mjs']);
    node(['scripts/check-hardening.mjs']);
    node([
      'node_modules/typescript/bin/tsc',
      '--build',
      'tsconfig.build.json',
      '--pretty',
      'false',
    ]);
    node(['node_modules/typescript/bin/tsc', '--build', '--pretty', 'false']);
    node(['packages/database/dist/src/migrate-cli.js']);
    node(['packages/database/dist/src/upgrade-test-cli.js']);
    node(['node_modules/vitest/vitest.mjs', 'run', ...checkoutRegressionPaths]);
    // next build must observe production semantics, including its hard public Checkout gate.
    for (const app of ['storefront', 'admin']) {
      const built = spawnSync(
        process.execPath,
        [resolve(`apps/${app}/node_modules/next/dist/bin/next`), 'build'],
        {
          cwd: `apps/${app}`,
          env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW: 'false' },
          stdio: 'inherit',
          shell: false,
        },
      );
      if (built.status !== 0) process.exit(built.status ?? 1);
    }
  }
}
