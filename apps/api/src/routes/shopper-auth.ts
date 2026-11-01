import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac } from 'node:crypto';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { resolveOrEnrollShopper, type ShopperPrincipal } from '@maevelle/database/shopper';
import { createShopperAuth, type ShopperAuthEmailSender } from '../auth/shopper-auth.js';

function headers(request: FastifyRequest): Headers {
  return new Headers(
    Object.entries(request.headers).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

const allowed = new Set([
  'POST /sign-up/email',
  'POST /sign-in/email',
  'POST /sign-out',
  'GET /get-session',
  'POST /send-verification-email',
  'GET /verify-email',
  'POST /request-password-reset',
  'POST /reset-password',
  'GET /reset-password/:token',
]);

export function registerShopperAuthRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
  database: DatabaseClient,
  sendEmail: ShopperAuthEmailSender | null,
): (request: FastifyRequest) => Promise<ShopperPrincipal | null> {
  if (!sendEmail) {
    app.all('/shopper-auth/*', async (_request, reply) =>
      reply.code(503).send({
        error: { code: 'AUTH_UNAVAILABLE', message: 'Customer accounts are not available yet.' },
      }),
    );
    return async () => null;
  }
  const auth = createShopperAuth(config, database, sendEmail);
  const resolveSession = async (request: FastifyRequest) => {
    const session = await auth.api.getSession({ headers: headers(request) }).catch(() => null);
    if (!session?.user?.id || !session.user.emailVerified) return null;
    const context = await resolveStorefrontContext(database.db, config.storefrontOrganizationCode);
    if (!context) return null;
    const principal = await resolveOrEnrollShopper(
      database.db,
      context.organizationId,
      session.user.id,
    );
    if (!principal) return null;
    const partition = createHmac('sha256', config.betterAuthSecret)
      .update(`shopper-client-partition:v1:${principal.organizationId}:${principal.accountId}`)
      .digest('base64url');
    return { principal, partition };
  };
  const resolve = async (request: FastifyRequest): Promise<ShopperPrincipal | null> =>
    (await resolveSession(request))?.principal ?? null;

  app.all('/shopper-auth/*', async (request, reply) => {
    const path = (request.raw.url?.split('?', 1)[0] ?? '').slice('/shopper-auth'.length);
    const route =
      request.method === 'GET' && path.startsWith('/reset-password/')
        ? 'GET /reset-password/:token'
        : `${request.method} ${path}`;
    if (!allowed.has(route))
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Authentication route not found.' },
      });
    const host = request.headers.host ?? new URL(config.authBaseUrl).host;
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    const response = await auth.handler(
      new Request(`${request.protocol}://${host}${request.raw.url}`, {
        method: request.method,
        headers: headers(request),
        ...(body ? { body } : {}),
      }),
    );
    for (const [name, value] of response.headers) {
      if (name !== 'set-cookie') reply.header(name, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header('set-cookie', cookies);
    reply.header('cache-control', 'private, no-store');
    return reply.code(response.status).send(await response.text());
  });

  app.get('/storefront/v1/shopper/session', async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const session = await resolveSession(request);
    if (!session)
      return reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to your Maevelle account.' },
      });
    return { data: { authenticated: true, partition: session.partition } };
  });
  return resolve;
}
