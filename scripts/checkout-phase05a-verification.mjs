import { spawnSync } from 'node:child_process';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';

// Use the dedicated Phase 05A loopback cluster. Never read the repository .env.
const base = 'postgresql://checkout_fixture@127.0.0.1:55445/maevelle_test';
if (process.env.TEST_DATABASE_URL !== base)
  throw new Error('Set the dedicated Phase 05A disposable TEST_DATABASE_URL.');
const isolated = await isolatedCartDatabase();
function run(url, files) {
  const child = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', ...files, '--disableConsoleIntercept'],
    { env: { ...process.env, TEST_DATABASE_URL: url }, stdio: 'inherit' },
  );
  if (child.error) throw child.error;
  return child.status ?? 1;
}
try {
  const identity =
    await sql`select current_database(),inet_server_addr(),inet_server_port(),version()`.execute(
      isolated.database.db,
    );
  console.log('Disposable PostgreSQL target', identity.rows);
  console.log('Migration tail', (await runMigrations(isolated.database.db)).executed.slice(-5));
  const regression = run(isolated.url, [
    'packages/database/src/checkout',
    'apps/api/src/checkout-foundation.test.ts',
    'apps/api/src/checkout-delivery.test.ts',
    'packages/database/src/payments/manual-payment.test.ts',
    'apps/api/src/payment-operations.test.ts',
    'packages/database/src/fulfillment-delivery.test.ts',
    'packages/database/src/notifications.test.ts',
    'apps/api/src/routes/pricing.test.ts',
    'apps/api/src/routes/promotions.test.ts',
    'packages/database/src/cart-foundation.test.ts',
    'packages/database/src/cart-reassessment.test.ts',
    'packages/database/src/orders.test.ts',
    'packages/database/src/payments.test.ts',
    'packages/database/src/finance.test.ts',
    'packages/database/src/inventory.test.ts',
    'apps/api/src/account.test.ts',
    'apps/storefront/features/checkout',
    'apps/admin/lib/payments/transport.test.ts',
    'apps/admin/src/payment-permissions.test.tsx',
  ]);
  // This suite validates the base database name and creates its own random database.
  const worker = run(base, ['apps/worker/src/worker.test.ts', '--testTimeout=20000']);
  process.exitCode = regression || worker;
} finally {
  await isolated.close();
}
