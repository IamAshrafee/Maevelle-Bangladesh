import type { FastifyInstance } from 'fastify';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';

import { createAuth } from '../auth/auth.js';
import { registerAdminContextRoute } from './admin-context.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerMediaRoutes } from './media.js';
import { registerSizingRoutes } from './sizing.js';
import { registerInventoryRoutes } from './inventory.js';
import { LocalMediaStorage } from '../media/local-media-storage.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
  database: DatabaseClient,
): void {
  const auth = createAuth(config, database);

  app.all('/auth/*', async (request, reply) => {
    const host = request.headers.host ?? 'localhost';
    const body =
      request.body === undefined
        ? undefined
        : typeof request.body === 'string'
          ? request.body
          : Buffer.isBuffer(request.body)
            ? request.body.toString('utf8')
            : JSON.stringify(request.body);
    const response = await auth.handler(
      new Request(`${request.protocol}://${host}${request.raw.url}`, {
        method: request.method,
        headers: new Headers(
          Object.entries(request.headers).flatMap(([name, value]) =>
            typeof value === 'string' ? [[name, value]] : [],
          ),
        ),
        ...(body ? { body } : {}),
      }),
    );
    for (const [name, value] of response.headers) reply.header(name, value);
    return reply.code(response.status).send(await response.text());
  });
  registerAdminContextRoute(app, database, auth);
  registerCatalogRoutes(app, database, auth);
  registerMediaRoutes(
    app,
    database,
    auth,
    new LocalMediaStorage(config.mediaStoragePath),
    config.mediaMaxUploadBytes,
  );
  registerSizingRoutes(app, database, auth);
  registerInventoryRoutes(app, database, auth);
}
