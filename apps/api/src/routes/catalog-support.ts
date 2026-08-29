import type { DatabaseClient } from '@maevelle/database';
import { CatalogDomainError } from '@maevelle/database/catalog';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

export type CatalogAuth = ReturnType<typeof createAuth>;

function toHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

export async function requireCatalogCapability(
  database: DatabaseClient,
  auth: CatalogAuth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: toHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

export function sendCatalogDomainError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof CatalogDomainError)) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      return reply
        .code(409)
        .send({ error: { code: 'CONFLICT', message: 'That slug is already in use.' } });
    throw error;
  }
  const statusCode =
    error.code === 'NOT_FOUND'
      ? 404
      : error.code === 'STALE_VERSION' || error.code === 'CONFLICT'
        ? 409
        : 422;
  return reply.code(statusCode).send({ error: { code: error.code, message: error.message } });
}
