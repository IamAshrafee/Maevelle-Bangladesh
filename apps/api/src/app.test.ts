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
    expect(database.ping).not.toHaveBeenCalled();
    await app.close();
  });

  it('reports readiness when PostgreSQL is available', async () => {
    const database = createDatabaseStub(vi.fn().mockResolvedValue(undefined));
    const app = buildApi({ database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
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
