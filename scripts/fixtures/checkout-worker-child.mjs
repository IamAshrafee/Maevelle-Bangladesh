import { createDatabase } from '../../packages/database/dist/src/index.js';
import { createWorker } from '../../apps/worker/dist/src/worker.js';
const raw = process.env.PHASE09A_WORKER_DATABASE,
  url = new URL(raw ?? 'invalid:');
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/^\/maevelle_cart01a_[a-z0-9_]+$/.test(url.pathname) ||
  !process.send
)
  throw new Error('Dedicated disposable database and parent IPC required.');
// No production config, external email/SMS, media or provider adapters are installed here.
const worker = createWorker({
  database: createDatabase({ connectionString: raw, maxConnections: 3 }),
  heartbeatIntervalMs: 100,
});
await worker.start();
process.send('STARTED');
process.on('message', async (message) => {
  if (message === 'STOP') {
    await worker.close();
    process.send('STOPPED');
    process.exit(0);
  }
});
