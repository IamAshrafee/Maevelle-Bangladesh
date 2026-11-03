/** Two independent loopback API processes share PostgreSQL abuse counters. */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildApi } from '../apps/api/src/app.ts';
import { createDatabase } from '../packages/database/src/index.ts';
import { phase07aConfig as config, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
if (process.argv.includes('--child')) {
  const db = createDatabase({ connectionString: config.databaseUrl });
  const app = buildApi({
    database: db,
    config,
    logger: false,
    shopperAuthEmailSender: async () => {
      throw new Error('No email delivery in abuse rehearsal.');
    },
  });
  await app.listen({ host: '127.0.0.1', port: 3006 });
  process.send?.('ready');
  process.on(
    'SIGTERM',
    () =>
      void app
        .close()
        .then(() => db.close())
        .then(() => process.exit(0)),
  );
} else {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/wishlist-phase07a1-multi-api.ts', '--child'],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('message', () => resolve());
      child.once('exit', () => reject(new Error('Second API failed to start.')));
    });
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const results: { port: number; status: number }[] = [];
    for (let n = 0; n < 35; n++) {
      const port = n % 2 === 0 ? 3002 : 3006;
      const response = await fetch(
        `http://127.0.0.1:${port}/storefront/v1/wishlist/shares/manage`,
        {
          method: 'POST',
          headers: {
            origin: 'http://wishlist-07a.localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ token, action: 'inspect' }),
        },
      );
      results.push({ port, status: response.status });
      await response.arrayBuffer();
      if (![404, 429].includes(response.status)) throw new Error('Unexpected limiter response.');
    }
    for (const port of [3002, 3006]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/storefront/v1/wishlist/shares/manage`,
        {
          method: 'POST',
          headers: {
            origin: 'http://wishlist-07a.localhost:3000',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ token, action: 'inspect' }),
        },
      );
      if (response.status !== 429) throw new Error('Shared limiter did not block both instances.');
    }
    writeFileSync(
      'docs/architecture/wishlist/phase07a1-evidence/multi-api.json',
      JSON.stringify(
        {
          results,
          bothInstancesBlocked: true,
          scope:
            'Guest management limiter only; email/observation multi-instance paths remain unmeasured.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}
