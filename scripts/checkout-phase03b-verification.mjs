import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';

// This harness never migrates the base database or reads the repository .env.
if (process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55445/maevelle_test')
  throw new Error('Phase 03B verification requires its explicit disposable loopback cluster.');
const isolated = await isolatedCartDatabase();
try {
  const identity =
    await sql`select current_database(),current_user,inet_server_addr(),inet_server_port(),version()`.execute(
      isolated.database.db,
    );
  console.log('Disposable regression target', JSON.stringify(identity.rows));
  const ledger = await runMigrations(isolated.database.db);
  console.log('Fresh migration ledger', JSON.stringify(ledger));
  const files = [
    'packages/database/src/checkout/quotes.test.ts',
    'packages/database/src/checkout/foundation.test.ts',
    'apps/api/src/checkout-foundation.test.ts',
    'apps/api/src/checkout-delivery.test.ts',
    'packages/database/src/orders.test.ts',
    'apps/storefront/features/checkout',
    'apps/storefront/features/cart',
    'apps/storefront/features/wishlist',
    'apps/storefront/features/pdp/pdp-product-details.test.tsx',
    'apps/storefront/components/commerce/wishlist-button.test.tsx',
  ];
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve('node_modules/vitest/vitest.mjs'), 'run', ...files],
      {
        stdio: 'inherit',
        env: { ...process.env, TEST_DATABASE_URL: isolated.url },
      },
    );
    child.once('error', reject);
    child.once('exit', done);
  });
  if (code !== 0) process.exitCode = typeof code === 'number' ? code : 1;
} finally {
  await isolated.close();
}
