import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import { recordWishlistOperation, type WishlistOperation } from '@maevelle/database/analytics';
import { resolveStorefrontContext } from '@maevelle/database/storefront';

function operation(path: string, method: string): WishlistOperation | undefined {
  if (!path.startsWith('/storefront/v1/wishlist')) return;
  if (path.endsWith('/merges')) return 'MERGE';
  if (path.includes('/items/'))
    return method === 'DELETE' ? 'REMOVE' : method === 'PUT' ? 'SAVE' : undefined;
  if (path.endsWith('/open')) return 'SHARE_OPEN';
  if (path.endsWith('/rotate-link')) return 'SHARE_ROTATE';
  if (path.endsWith('/link')) return 'SHARE_RECOVER';
  if (path.endsWith('/claim')) return 'SHARE_CLAIM';
  if (method === 'POST' && (path.endsWith('/shares') || path.endsWith('/account-shares')))
    return 'SHARE_CREATE';
  if (path.includes('/shares/manage') || path.includes('/account-shares/')) return 'SHARE_MANAGE';
}

/** Runs after sending the response; failure never changes the customer command result. */
export function registerWishlistObservability(
  app: FastifyInstance,
  database: DatabaseClient,
  organizationCode: string,
) {
  app.addHook('onResponse', async (request, reply) => {
    const label = operation(request.routeOptions.url ?? '', request.method);
    if (!label) return;
    try {
      const context = await resolveStorefrontContext(database.db, organizationCode);
      if (context)
        await recordWishlistOperation(
          database.db,
          context.organizationId,
          label,
          reply.statusCode,
          reply.elapsedTime,
        );
    } catch {
      request.log.warn({ operation: label }, 'Wishlist operational counter unavailable');
    }
  });
}
