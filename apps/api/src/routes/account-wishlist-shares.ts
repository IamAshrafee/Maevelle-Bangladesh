import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import { createShare, getAccountShares, getAccountShareLink, rotateAccountShareLink, manageAccountShare, claimGuestShare, ShareError } from '@maevelle/database/wishlist-share-lifecycle';
import { type ShareEncryptionKey, ShareRecoveryError, shareKey } from '@maevelle/database/wishlist-share-crypto';
import type { WishlistOwner } from '@maevelle/database/wishlist-account';

const uuid = Type.String({ format: 'uuid' });
const token = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const expiry = Type.String({ format: 'date-time' });
const body = Type.Object({
  operationId: token,
  expiresAt: expiry,
  selection: Type.Union([Type.Literal('all'), Type.Literal('selected')]),
  items: Type.Array(Type.Object({ productId: uuid, preferredVariantId: Type.Optional(Type.Union([uuid, Type.Null()])) }, { additionalProperties: false }), { maxItems: 100 }),
}, { additionalProperties: false });

export function registerAccountWishlistShareRoutes(app: FastifyInstance, database: DatabaseClient,
  resolveShopper: (request: FastifyRequest) => Promise<WishlistOwner | null>, encryptionKey: string | ShareEncryptionKey): void {
  const key = typeof encryptionKey === 'string' ? shareKey(encryptionKey) : encryptionKey;
  async function owner(request: FastifyRequest, reply: { code(status: number): { send(value: unknown): unknown } }) {
    const principal = await resolveShopper(request);
    if (!principal) reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage shares.' } });
    return principal;
  }
  function fail(reply: { code(status: number): { send(value: unknown): unknown } }, error: unknown) {
    if (error instanceof ShareRecoveryError) return reply.code(503).send({ error: { code: 'RECOVERY_UNAVAILABLE', message: 'Link recovery is unavailable. Retry later or explicitly rotate the link.' } });
    if (!(error instanceof ShareError)) throw error;
    return reply.code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  }
  app.post('/storefront/v1/wishlist/account-shares', { bodyLimit: 16_384, schema: { body } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    const input = request.body as { operationId: string; expiresAt: string; selection: 'all' | 'selected'; items: { productId: string; preferredVariantId?: string | null }[] };
    try { return { data: await createShare(database.db, principal.organizationId, input.items, {
      operationId: input.operationId, expiresAt: input.expiresAt, selection: input.selection, owner: principal, key,
    }) }; } catch (error) { return fail(reply, error); }
  });
  app.get('/storefront/v1/wishlist/account-shares', { schema: { querystring: Type.Object({
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })), cursor: Type.Optional(uuid),
  }, { additionalProperties: false }) } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    const query = request.query as { limit?: number; cursor?: string };
    return { data: await getAccountShares(database.db, principal, query.limit ?? 30, query.cursor) };
  });
  app.get('/storefront/v1/wishlist/account-shares/:id', { schema: { params } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await manageAccountShare(database.db, principal, (request.params as { id: string }).id, 'inspect') }; }
    catch (error) { return fail(reply, error); }
  });
  app.post('/storefront/v1/wishlist/account-shares/:id/link', { schema: { params, body: Type.Object({}, { additionalProperties: false }) } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store').header('referrer-policy', 'no-referrer');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await getAccountShareLink(database.db, principal, (request.params as { id: string }).id, key) }; }
    catch (error) { return fail(reply, error); }
  });
  app.post('/storefront/v1/wishlist/account-shares/:id/rotate-link', { schema: { params, body: Type.Object({ expectedVersion: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }) } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store').header('referrer-policy', 'no-referrer');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await rotateAccountShareLink(database.db, principal, (request.params as { id: string }).id, key, (request.body as { expectedVersion: number }).expectedVersion) }; }
    catch (error) { return fail(reply, error); }
  });
  app.patch('/storefront/v1/wishlist/account-shares/:id', { schema: { params, body: Type.Object({ expiresAt: expiry }, { additionalProperties: false }) } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await manageAccountShare(database.db, principal, (request.params as { id: string }).id, 'set-expiry', (request.body as { expiresAt: string }).expiresAt) }; }
    catch (error) { return fail(reply, error); }
  });
  app.delete('/storefront/v1/wishlist/account-shares/:id', { schema: { params } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await manageAccountShare(database.db, principal, (request.params as { id: string }).id, 'revoke') }; }
    catch (error) { return fail(reply, error); }
  });
  app.post('/storefront/v1/wishlist/account-shares/:id/claim', { schema: { params, body: Type.Object({ manageToken: token }, { additionalProperties: false }) } }, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    const principal = await owner(request, reply); if (!principal) return;
    try { return { data: await claimGuestShare(database.db, principal, (request.params as { id: string }).id, (request.body as { manageToken: string }).manageToken) }; }
    catch (error) { return fail(reply, error); }
  });
}
