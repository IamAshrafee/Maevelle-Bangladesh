import { describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import { registerPricingRoutes } from './pricing.js';

function createMockDatabase(): DatabaseClient {
  return {
    db: {} as any,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Pricing API routes', () => {
  it('rejects unauthenticated requests to GET /admin/pricing/prices with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPricingRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'GET',
      url: '/admin/pricing/prices',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to POST /admin/pricing/prices with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPricingRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/pricing/prices',
      payload: {
        variantId: '88888888-4444-4444-4444-121212121212',
        currency: 'BDT',
        amount: '1500.0000',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to PUT /admin/pricing/variants/:variantId/current with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPricingRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'PUT',
      url: '/admin/pricing/variants/88888888-4444-4444-4444-121212121212/current',
      payload: {
        currency: 'BDT',
        amount: '1500',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to POST /admin/pricing/prices/:id/archive with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;

    registerPricingRoutes(app, database, mockAuth);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/pricing/prices/test-price-id/archive',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

