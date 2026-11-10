import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import {
  commerceOutcome,
  recordCommerceOperation,
  type CommerceOperation,
} from '@maevelle/database/analytics';
import { resolveStorefrontContext } from '@maevelle/database/storefront';

function operation(request: FastifyRequest): CommerceOperation | undefined {
  const path = request.routeOptions.url;
  if (path === '/storefront/v1/checkouts/:id/quotes' && request.method === 'POST') return 'QUOTE';
  if (path === '/storefront/v1/checkouts/:id/final-terms' && request.method === 'POST')
    return 'FINAL_TERMS';
  if (path === '/storefront/v1/checkouts/:id/placement' && request.method === 'POST')
    return 'PLACEMENT';
  if (path === '/storefront/v1/checkouts/:id/order-payment' && request.method === 'GET')
    return 'PAYMENT_READ';
  if (path === '/storefront/v1/checkouts/:id/order-payment/claims' && request.method === 'POST')
    return 'CLAIM_SUBMIT';
}

/** Low-cardinality diagnostics only. No IDs, URLs, bodies or error messages leave this boundary. */
export function registerCommerceObservability(
  app: FastifyInstance,
  database: DatabaseClient,
  organizationCode: string,
) {
  const codes = new WeakMap<FastifyRequest, string>();
  app.addHook('onSend', async (request, _reply, payload) => {
    if (!operation(request) || typeof payload !== 'string' || payload.length > 16384)
      return payload;
    try {
      const parsed = JSON.parse(payload) as {
        error?: { code?: unknown };
        data?: { kind?: unknown };
      };
      const code = parsed.data?.kind === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : parsed.error?.code;
      if (
        typeof code === 'string' &&
        [
          'POLICY_BLOCKED',
          'REVIEW_REQUIRED',
          'SOURCE_CHANGED',
          'DESTINATION_UNAVAILABLE',
          'SOURCE_CONFLICT',
          'STALE_SOURCE',
          'STALE_VERSION',
          'STALE_REVISION',
          'PAYMENT_METHOD_UNAVAILABLE',
        ].includes(code)
      )
        codes.set(request, code);
    } catch {
      /* A non-JSON response still has a status category. */
    }
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    const label = operation(request);
    if (!label) return;
    try {
      const context = await resolveStorefrontContext(database.db, organizationCode);
      if (context)
        await recordCommerceOperation(
          database.db,
          context.organizationId,
          label,
          commerceOutcome(reply.statusCode, codes.get(request)),
          reply.elapsedTime,
        );
    } catch {
      request.log.warn({ operation: label }, 'Commerce diagnostic counter unavailable.');
    }
  });
}
