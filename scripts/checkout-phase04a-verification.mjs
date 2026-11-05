import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';

// This harness never migrates the base database or reads the repository .env.
if (process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55444/maevelle_test')
  throw new Error('Phase 04A verification requires its explicit disposable loopback cluster.');
const isolated = await isolatedCartDatabase();
const reportDirectory = await mkdtemp(resolve(tmpdir(), 'maevelle04a-report-'));
const reportPath = resolve(reportDirectory, 'vitest.json');
try {
  const identity =
    await sql`select current_database(),current_user,inet_server_addr(),inet_server_port(),version()`.execute(
      isolated.database.db,
    );
  console.log('Disposable regression target', JSON.stringify(identity.rows));
  const ledger = await runMigrations(isolated.database.db);
  console.log('Fresh migration ledger', JSON.stringify(ledger));
  const files = [
    'packages/database/src/payments/manual-payment.test.ts',
    'apps/api/src/payment-operations.test.ts',
    'packages/database/src/fulfillment-delivery.test.ts',
    'packages/database/src/notifications.test.ts',
    'packages/database/src/checkout/quotes.test.ts',
    'packages/database/src/checkout/foundation.test.ts',
    'packages/database/src/checkout/delivery-migration.test.ts',
    'packages/database/src/checkout/delivery-performance.test.ts',
    'apps/api/src/checkout-foundation.test.ts',
    'apps/api/src/checkout-delivery.test.ts',
    'apps/api/src/routes/pricing.test.ts',
    'apps/api/src/routes/promotions.test.ts',
    'packages/database/src/cart-foundation.test.ts',
    'packages/database/src/cart-reassessment.test.ts',
    'packages/database/src/orders.test.ts',
    'packages/database/src/payments.test.ts',
    'packages/database/src/finance.test.ts',
    'packages/database/src/inventory.test.ts',
    'apps/storefront/features/checkout',
  ];
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve('node_modules/vitest/vitest.mjs'),
        'run',
        ...files,
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${reportPath}`,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, TEST_DATABASE_URL: isolated.url },
      },
    );
    child.once('error', reject);
    child.once('exit', done);
  });
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  await writeFile(
    resolve('docs/architecture/checkout/PHASE_04A_VERIFICATION.json'),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        target: identity.rows[0],
        migrations: ledger.executed,
        success: report.success,
        totalTests: report.numTotalTests,
        passedTests: report.numPassedTests,
        failedTests: report.numFailedTests,
        files: report.testResults.map((file) => ({
          file: file.name.replaceAll('\\', '/').split('Maevelle-Bangladesh/')[1],
          status: file.status,
          passed: file.assertionResults.filter((t) => t.status === 'passed').length,
          failed: file.assertionResults.filter((t) => t.status === 'failed').length,
        })),
        purchasesEnabled: false,
        publicPaymentCollectionEnabled: false,
        realProviderApproval: false,
      },
      null,
      2,
    ) + '\n',
  );
  if (code !== 0) process.exitCode = typeof code === 'number' ? code : 1;
} finally {
  await isolated.close();
  await unlink(reportPath).catch(() => {});
  await rmdir(reportDirectory);
}
