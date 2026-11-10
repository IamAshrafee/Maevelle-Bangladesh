import { it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { parseConfig } from '@maevelle/config';
import { createLogger } from '@maevelle/observability';
import { isolatedCartDatabase, cartFixture } from '@maevelle/database/testing/cart';
import { runMigrations } from '@maevelle/database/migrate';
import { buildApi } from './app.js';

it('issues the production private preference cookie contract without granting optional tracking', async () => {
  const isolated = await isolatedCartDatabase();
  try {
    await runMigrations(isolated.database.db);
    const f = await cartFixture(isolated.database);
    const testConfig = parseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: isolated.url,
      TEST_DATABASE_URL: isolated.url,
      BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 22).toString('base64'),
      BETTER_AUTH_URL: 'https://admin.example.test',
      STOREFRONT_BASE_URL: 'https://shop.example.test',
      STOREFRONT_ORGANIZATION_CODE: f.code,
    });
    const app = buildApi({
      database: isolated.database,
      config: { ...testConfig, nodeEnv: 'production' },
      logger: false,
    });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/storefront/v1/analytics/consent',
        headers: { 'x-privacy-request': '1', origin: 'https://shop.example.test' },
      });
      expect(response.statusCode).toBe(200);
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toMatch(
        /^__Host-maevelle_privacy=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
      );
      expect(cookie).not.toContain('Domain=');
      expect(Number(cookie.match(/Max-Age=(\d+)/)![1])).toBeLessThanOrEqual(30 * 86400);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json().data.observationToken).toBeNull();
    } finally {
      await app.close();
    }
  } finally {
    await isolated.close();
  }
}, 30000);

it('does not derive Admin/chat Origin trust from forged Host/forwarded headers and keeps private canaries out of request logs', async () => {
  const isolated = await isolatedCartDatabase();
  try {
    await runMigrations(isolated.database.db);
    const f = await cartFixture(isolated.database);
    let logs = '';
    const sink = new Writable({
      write(chunk, _encoding, done) {
        logs += chunk.toString();
        done();
      },
    });
    const config = parseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: isolated.url,
      TEST_DATABASE_URL: isolated.url,
      BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString('base64'),
      BETTER_AUTH_URL: 'https://admin.example.test',
      STOREFRONT_BASE_URL: 'https://shop.example.test',
      STOREFRONT_ORGANIZATION_CODE: f.code,
    });
    const app = buildApi({
      database: isolated.database,
      config,
      logger: createLogger({ level: 'info' }, sink),
    });
    try {
      for (const path of ['/admin/orders', '/storefront/v1/chat/sessions']) {
        const response = await app.inject({
          method: 'POST',
          url: path,
          payload: {},
          headers: {
            origin: 'https://attacker.example.test',
            host: 'attacker.example.test',
            'x-forwarded-host': 'attacker.example.test',
            'x-forwarded-proto': 'https',
          },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('ORIGIN_REJECTED');
      }
      const canary = 'SYNTHETIC-PRIVATE-CANARY-' + crypto.randomUUID();
      for (const path of [
        '/storefront/v1/checkouts/' + canary,
        '/storefront/v1/orders/confirmation?token=' + canary,
        '/storefront/v1/analytics/consent?subject=' + canary,
        '/storefront/v1/analytics?token=' + canary,
        '/auth/reset-password/' + canary,
        '/shopper-auth?token=' + canary,
        '/invitations/accept?token=' + canary,
      ]) {
        await app.inject({
          method: 'GET',
          url: path,
          headers: {
            cookie: 'maevelle_privacy=' + canary,
            'x-privacy-context': canary,
            'x-privacy-observation': canary,
            authorization: 'Bearer ' + canary,
          },
        });
      }
      expect(logs).not.toContain(canary);
    } finally {
      await app.close();
    }
  } finally {
    await isolated.close();
  }
}, 30000);
