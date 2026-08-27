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
  it('validates Product overview updates and protects valid requests', async () => {
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
        storefrontOrganizationCode: 'maevelle',
      },
    });
    const productId = '018f1f77-6b10-7cc0-9b11-4fefab124000';
    const empty = await app.inject({
      method: 'PATCH',
      url: `/admin/catalog/products/${productId}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const invalidType = await app.inject({
      method: 'PATCH',
      url: `/admin/catalog/products/${productId}`,
      payload: { productTypeId: 'not-a-product-type' },
    });
    expect(invalidType.statusCode).toBe(400);

    const protectedRequest = await app.inject({
      method: 'PATCH',
      url: `/admin/catalog/products/${productId}`,
      headers: { 'if-match': '"1"' },
      payload: { title: 'Updated Product' },
    });
    expect(protectedRequest.statusCode).toBe(403);

    const invalidCategories = await app.inject({
      method: 'PUT',
      url: `/admin/catalog/products/${productId}/categories`,
      headers: { 'if-match': '"1"' },
      payload: { categoryIds: ['not-a-category'] },
    });
    expect(invalidCategories.statusCode).toBe(400);

    const invalidAttributes = await app.inject({
      method: 'PUT',
      url: `/admin/catalog/products/${productId}/attributes`,
      headers: { 'if-match': '"1"' },
      payload: {
        values: [
          {
            attributeDefinitionId: '018f1f77-6b10-7cc0-9b11-4fefab124001',
            value: { unsafe: true },
          },
        ],
      },
    });
    expect(invalidAttributes.statusCode).toBe(400);

    const protectedCategories = await app.inject({
      method: 'PUT',
      url: `/admin/catalog/products/${productId}/categories`,
      headers: { 'if-match': '"1"' },
      payload: { categoryIds: [] },
    });
    expect(protectedCategories.statusCode).toBe(403);
    await app.close();
  });

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
        storefrontOrganizationCode: 'maevelle',
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
