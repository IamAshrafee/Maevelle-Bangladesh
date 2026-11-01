/** Browser-test API with a local-only mailbox. Never use with persistent data. */
import { appendFileSync } from 'node:fs';
import { loadConfig } from '../packages/config/src/index.ts';
import { createDatabase } from '../packages/database/src/index.ts';
import { buildApi } from '../apps/api/src/app.ts';

const config = loadConfig();
const target = new URL(config.databaseUrl);
if (config.nodeEnv !== 'development' || target.hostname !== '127.0.0.1' ||
  target.port !== '55440' || target.pathname !== '/maevelle_ui_test' ||
  config.apiHost !== '127.0.0.1' || config.apiPort !== 3002)
  throw new Error('Local Wishlist API requires the isolated development test target.');

const mailboxPath = '/tmp/codex_wishlist_phase04_mailbox.jsonl';
const database = createDatabase({ connectionString: config.databaseUrl });
const app = buildApi({
  database, config, logger: false,
  shopperAuthEmailSender: async (message) => {
    if (!message.to.endsWith('@example.test')) throw new Error('Only synthetic test mail is allowed.');
    appendFileSync(mailboxPath, JSON.stringify(message) + '\n', { mode: 0o600 });
  },
});
try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  await app.close();
  await database.close();
  throw error;
}
process.on('SIGINT', () => { void app.close().then(() => database.close()).then(() => process.exit(0)); });
process.on('SIGTERM', () => { void app.close().then(() => database.close()).then(() => process.exit(0)); });
