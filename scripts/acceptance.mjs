import { spawnSync } from 'node:child_process';

const suites = [
  ['COD / Orders', 'packages/database/src/orders.test.ts'],
  ['Manual bKash / Payments', 'packages/database/src/payments.test.ts'],
  ['Procurement / Receiving', 'packages/database/src/procurement.test.ts'],
  ['Fulfillment / Delivery', 'packages/database/src/fulfillment-delivery.test.ts'],
  ['RTO / Customer Return / Refund', 'packages/database/src/returns.test.ts'],
  ['Finance', 'packages/database/src/finance.test.ts'],
  ['Reviews', 'packages/database/src/reviews.test.ts'],
  ['Notifications / Webhooks', 'packages/database/src/notifications.test.ts'],
  ['Analytics', 'packages/database/src/analytics.test.ts'],
  [
    'Storefront / Search / SEO',
    'packages/database/src/storefront.test.ts',
    'apps/storefront/src/seo.test.ts',
  ],
];
const files = suites.flatMap((suite) => suite.slice(1));
const environment = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_dev',
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_test',
};
const packageManager = process.env.npm_execpath;
if (!packageManager) throw new Error('Run the acceptance harness through pnpm.');
const packageManagerIsScript = /\.(?:c?js|mjs)$/iu.test(packageManager);
const command = packageManagerIsScript ? process.execPath : packageManager;
const args = packageManagerIsScript
  ? [packageManager, 'exec', 'vitest', 'run', ...files]
  : ['exec', 'vitest', 'run', ...files];
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: false,
  env: environment,
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('\nMaevelle repository acceptance evidence:');
for (const suite of suites) console.log(`PASS ${suite[0]}`);
