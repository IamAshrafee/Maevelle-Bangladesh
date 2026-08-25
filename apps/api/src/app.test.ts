import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@maevelle/database';

import { buildApi } from './app.js';

function createDatabaseStub(ping: DatabaseClient['ping']): DatabaseClient {
  return {
    db: {} as DatabaseClient['db'],
    ping,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('API health endpoints', () => {
  it('reports liveness without calling PostgreSQL', async () => {
    const database = createDatabaseStub(vi.fn().mockResolvedValue(undefined));
    const app = buildApi({ database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeDefined();
    expect(database.ping).not.toHaveBeenCalled();
    await app.close();
  });

  it('reports readiness when PostgreSQL is available', async () => {
    const database = createDatabaseStub(vi.fn().mockResolvedValue(undefined));
    const app = buildApi({ database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeDefined();
    expect(database.ping).toHaveBeenCalledOnce();
    await app.close();
  });

  it('sanitizes PostgreSQL readiness failures', async () => {
    const database = createDatabaseStub(
      vi.fn().mockRejectedValue(new Error('password authentication failed for secret user')),
    );
    const app = buildApi({ database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('password authentication failed');
    await app.close();
  });
});

describe('API hardening foundation', () => {
  it('sets browser hardening headers and rejects an untrusted Admin mutation origin', async () => {
    const database = createDatabaseStub(vi.fn().mockResolvedValue(undefined));
    const app = buildApi({
      database,
      logger: false,
      config: {
        nodeEnv: 'test',
        databaseUrl: 'postgresql://test',
        testDatabaseUrl: 'postgresql://test',
        databasePoolMax: 1,
        apiHost: '127.0.0.1',
        apiPort: 3000,
        logLevel: 'error',
        workerHeartbeatIntervalMs: 1000,
        betterAuthSecret: 'x'.repeat(32),
        authEncryptionKey: Buffer.alloc(32).toString('base64'),
        authBaseUrl: 'https://admin.maevelle.example/api',
        authTrustedOrigins: ['http://localhost:3000'],
        mediaStoragePath: 'var/media',
        mediaMaxUploadBytes: 1024,
      },
    });
    const publicResponse = await app.inject({ method: 'GET', url: '/health/live' });
    expect(publicResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(publicResponse.headers['x-frame-options']).toBe('DENY');
    const hostile = await app.inject({
      method: 'POST',
      url: '/admin/catalog/products',
      headers: { origin: 'https://attacker.example' },
      payload: {},
    });
    expect(hostile.statusCode).toBe(403);
    expect(hostile.json()).toMatchObject({ error: { code: 'ORIGIN_REJECTED' } });
    const malformed = await app.inject({
      method: 'GET',
      url: '/storefront/v1/categories?organizationId=',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    await app.close();
  });

  it('bounds abuse-sensitive authentication traffic', async () => {
    const database = createDatabaseStub(vi.fn().mockResolvedValue(undefined));
    const app = buildApi({ database, logger: false });
    let response;
    for (let index = 0; index < 21; index += 1)
      response = await app.inject({ method: 'POST', url: '/auth/sign-in/email', payload: {} });
    expect(response?.statusCode).toBe(429);
    expect(response?.headers['retry-after']).toBeDefined();
    await app.close();
  });
});
