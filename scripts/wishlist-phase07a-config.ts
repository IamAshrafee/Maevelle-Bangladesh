/** Isolated local acceptance configuration. Never loads the developer's .env or provider keys. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseConfig } from '../packages/config/src/index.ts';
mkdirSync('/tmp/maevelle-phase07a', { recursive: true, mode: 0o700 });
const path = '/tmp/maevelle-phase07a/runtime.json';
if (!existsSync(path))
  writeFileSync(
    path,
    JSON.stringify({
      secret: randomBytes(48).toString('base64url'),
      key: randomBytes(32).toString('base64'),
      fixturePassword: randomBytes(24).toString('base64url'),
    }),
    { mode: 0o600 },
  );
const keys = JSON.parse(readFileSync(path, 'utf8')) as {
  secret: string;
  key: string;
  fixturePassword: string;
};
export const phase07aFixturePassword = keys.fixturePassword;
export const phase07aConfig = parseConfig({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://wishlist_07a@127.0.0.1:55442/maevelle_ui_07a',
  TEST_DATABASE_URL: 'postgresql://wishlist_07a@127.0.0.1:55442/maevelle_test',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
  BETTER_AUTH_SECRET: keys.secret,
  AUTH_ENCRYPTION_KEY: keys.key,
  BETTER_AUTH_URL: 'http://wishlist-07a.localhost:3000',
  AUTH_TRUSTED_ORIGINS: 'http://wishlist-07a.localhost:3000,http://wishlist-07a.localhost:3001',
  STOREFRONT_BASE_URL: 'http://wishlist-07a.localhost:3000',
  STOREFRONT_INTERNAL_API_URL: 'http://127.0.0.1:3002',
  MEDIA_STORAGE_PATH: '/tmp/maevelle-phase07a/media',
  EMAIL_ENABLED: 'false',
  SMS_ENABLED: 'false',
  WORKER_HEARTBEAT_INTERVAL_MS: '5000',
  LOG_LEVEL: 'warn',
});
export function assertPhase07aTarget() {
  const url = new URL(phase07aConfig.databaseUrl);
  if (url.hostname !== '127.0.0.1' || url.port !== '55442' || url.pathname !== '/maevelle_ui_07a')
    throw new Error('Disposable Phase 07A target required');
}
