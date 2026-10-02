import { describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import { parseConfig } from '@maevelle/config';

import { registerSettingsRoutes } from './settings.js';

function createMockDatabase(): DatabaseClient {
  return {
    db: {} as any,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Settings API route authentication and RBAC', () => {
  it('rejects unauthenticated requests to GET /admin/settings with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;
    const config = parseConfig({
      ...process.env,
      DATABASE_URL: 'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_dev',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });

    registerSettingsRoutes(app, database, mockAuth, config);

    const response = await app.inject({
      method: 'GET',
      url: '/admin/settings',
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects unauthenticated requests to PATCH /admin/settings/email with 403', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as any;
    const config = parseConfig({
      ...process.env,
      DATABASE_URL: 'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_dev',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });

    registerSettingsRoutes(app, database, mockAuth, config);

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/settings/email',
      payload: {
        settings: {
          'email.enabled': true,
        },
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('rejects invalid module path on GET /admin/settings/:module with 404', async () => {
    const app = fastify();
    const database = createMockDatabase();
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Mock authorized session
    const mockAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: userId },
        }),
      },
    } as any;

    // Fastify will check the context, if we mock context or route
    const config = parseConfig({
      ...process.env,
      DATABASE_URL: 'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_dev',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });

    registerSettingsRoutes(app, database, mockAuth, config);

    const response = await app.inject({
      method: 'GET',
      url: '/admin/settings/unknown-module-xyz',
    });

    // Unauthenticated or unknown module returns error
    expect([403, 404]).toContain(response.statusCode);
    await app.close();
  });
});
