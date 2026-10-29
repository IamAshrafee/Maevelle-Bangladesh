import { describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import { registerPromotionRoutes } from './promotions.js';

function createMockDatabase(): DatabaseClient {
  return {
    db: {} as any,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Promotions API routes', () => {
  it('rejects unauthenticated requests to GET /admin/promotions with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPromotionRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'GET',
      url: '/admin/promotions',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to GET /admin/promotions/:id with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPromotionRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'GET',
      url: '/admin/promotions/test-promo-id',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to PATCH /admin/promotions/:id with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPromotionRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/promotions/test-promo-id',
      payload: { name: 'New Name' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to PATCH /admin/promotions/:id/status with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPromotionRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/promotions/test-promo-id/status',
      payload: { status: 'INACTIVE' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to POST /admin/promotions/:id/coupons with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPromotionRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promotions/test-promo-id/coupons',
      payload: { code: 'SAVE20' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

