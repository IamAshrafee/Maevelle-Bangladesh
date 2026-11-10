import { createDatabase } from '../../packages/database/dist/src/index.js';
import { processCommerceAnalyticsOutbox } from '../../packages/database/dist/src/analytics.js';
const target = new URL(process.env.PHASE08_CHILD_DATABASE ?? 'invalid:');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  !/^\/maevelle_cart01a_[a-z0-9_]+$/.test(target.pathname) ||
  !process.send
)
  throw new Error('Isolated consumer child requires a disposable database and IPC.');
const database = createDatabase({ connectionString: target.href, maxConnections: 1 });
const hold = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
await processCommerceAnalyticsOutbox(
  database.db,
  100,
  process.env.PHASE08_CHILD_STAGE === 'CLAIMED'
    ? () => {
        process.send('CLAIMED');
        hold();
      }
    : undefined,
);
process.send('COMMITTED');
hold();
