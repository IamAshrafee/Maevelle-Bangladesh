import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import { ProcurementDomainError } from '@maevelle/database/procurement';

import type { createAuth } from '../../auth/auth.js';

export type Auth = ReturnType<typeof createAuth>;

export const quantitySchema = Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' });

export const conditionSchema = Type.Union([
  Type.Literal('SELLABLE'),
  Type.Literal('DAMAGED'),
  Type.Literal('QUARANTINE'),
  Type.Literal('INSPECTION'),
]);

export const currencySchema = Type.Union([
  Type.Literal('BDT'),
  Type.Literal('CNY'),
  Type.Literal('USD'),
]);

export const supplierTypeSchema = Type.Union([
  Type.Literal('MANUFACTURER'),
  Type.Literal('WHOLESALER'),
  Type.Literal('DISTRIBUTOR'),
  Type.Literal('AGENT'),
  Type.Literal('LOCAL_VENDOR'),
  Type.Literal('OTHER'),
]);

export function requestHeaders(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, header]) =>
      typeof header === 'string' ? [[name, header]] : [],
    ),
  );
}

export async function requireAdmin(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

export function idempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  return key && /^[\x21-\x7e]{1,128}$/.test(key) ? key : undefined;
}

export function requireKey(
  reply: { code(status: number): { send(value: unknown): unknown } },
  key: string | undefined,
): string | undefined {
  if (key) return key;
  reply.code(400).send({
    error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' },
  });
  return undefined;
}

export function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof ProcurementDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : ['CONFLICT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'OVER_RECEIPT'].includes(error.code)
          ? 409
          : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return reply
      .code(409)
      .send({ error: { code: 'CONFLICT', message: 'That record already exists.' } });
  }
  throw error;
}
