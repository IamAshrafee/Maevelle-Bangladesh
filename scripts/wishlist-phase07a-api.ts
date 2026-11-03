import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { buildApi } from '../apps/api/src/app.ts';
import { createDatabase } from '../packages/database/src/index.ts';
import { phase07aConfig as config, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const database = createDatabase({ connectionString: config.databaseUrl, maxConnections: 12 });
const app = buildApi({
  database,
  config,
  logger: false,
  shopperAuthEmailSender: async (message) => {
    if (!message.to.endsWith('@example.test')) throw new Error('Synthetic mailbox only');
    appendFileSync('/tmp/maevelle-phase07a/mailbox.jsonl', JSON.stringify(message) + '\n', {
      mode: 0o600,
    });
  },
});
app.addHook('preHandler', async (request, reply) => {
  const route = request.routeOptions.url ?? '';
  if (route === '/storefront/v1/analytics/events') {
    const body = request.body as { name?: string };
    if (body?.name?.startsWith('WISHLIST_'))
      appendFileSync('/tmp/maevelle-phase07a/observations.jsonl', JSON.stringify(body) + '\n', {
        mode: 0o600,
      });
  }
  if (!existsSync('/tmp/maevelle-phase07a/fault.json')) return;
  const fault = JSON.parse(readFileSync('/tmp/maevelle-phase07a/fault.json', 'utf8')) as {
    route: string;
    from?: string;
    delayMs?: number;
    status?: number;
  };
  const query = request.query as { from?: string };
  if (route !== fault.route || (fault.from && fault.from !== query.from)) return;
  if (fault.delayMs)
    await new Promise((resolve) => setTimeout(resolve, Math.min(fault.delayMs!, 5000)));
  if (fault.status && [401, 403, 409, 422, 429, 503, 500].includes(fault.status))
    return reply.code(fault.status).send({
      error: { code: 'LOCAL_INJECTED_FAILURE', message: 'Synthetic local failure; retry.' },
    });
});
app.addHook('onResponse', async (request, reply) => {
  appendFileSync(
    '/tmp/maevelle-phase07a/requests.jsonl',
    JSON.stringify({
      method: request.method,
      route: request.routeOptions.url,
      status: reply.statusCode,
      ms: reply.elapsedTime,
      ...(request.routeOptions.url?.startsWith('/admin/analytics/wishlist/')
        ? { period: request.query }
        : {}),
    }) + '\n',
    { mode: 0o600 },
  );
});
await app.listen({ host: '127.0.0.1', port: 3002 });
const close = () =>
  void app
    .close()
    .then(() => database.close())
    .then(() => process.exit());
process.once('SIGINT', close);
process.once('SIGTERM', close);
