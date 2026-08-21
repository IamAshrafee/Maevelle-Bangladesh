import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addCustomerAddress,
  addCustomerEmail,
  addCustomerPhone,
  createCustomer,
  CustomerDomainError,
  findCustomerDuplicateCandidates,
  listCustomers,
} from '@maevelle/database/customers';
import { searchGeography } from '@maevelle/database/geography';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function context(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof CustomerDomainError)) throw error;
  return reply
    .code(
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT' || error.code === 'STALE_VERSION'
          ? 409
          : 422,
    )
    .send({ error: { code: error.code, message: error.message } });
}

export function registerCustomerRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/geography/search',
    { schema: { querystring: Type.Object({ q: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      if (!(await context(database, auth, request.headers, 'customers.view')))
        return reply.code(403).send({ error: 'FORBIDDEN' });
      return { data: await searchGeography(database.db, (request.query as { q: string }).q) };
    },
  );

  app.get(
    '/admin/customers',
    { schema: { querystring: Type.Object({ q: Type.Optional(Type.String()) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listCustomers(
          database.db,
          active.organizationId,
          (request.query as { q?: string }).q,
        ),
      };
    },
  );

  app.post(
    '/admin/customers',
    { schema: { body: Type.Object({ displayName: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCustomer(database.db, {
            ...active,
            ...(request.body as { displayName: string }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/phones',
    {
      schema: {
        body: Type.Object({
          phone: Type.String({ minLength: 1 }),
          isPrimary: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await addCustomerPhone(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as { phone: string; isPrimary?: boolean }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/emails',
    {
      schema: {
        body: Type.Object({
          email: Type.String({ minLength: 3 }),
          isPrimary: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await addCustomerEmail(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as { email: string; isPrimary?: boolean }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/addresses',
    {
      schema: {
        body: Type.Object({
          recipientName: Type.String({ minLength: 1 }),
          addressLine1: Type.String({ minLength: 1 }),
          countryCode: Type.String({ pattern: '^[A-Z]{2}$' }),
          label: Type.Optional(Type.String()),
          phone: Type.Optional(Type.String()),
          addressLine2: Type.Optional(Type.String()),
          geographyNodeId: Type.Optional(Type.String()),
          area: Type.Optional(Type.String()),
          city: Type.Optional(Type.String()),
          district: Type.Optional(Type.String()),
          postalCode: Type.Optional(Type.String()),
          isDefault: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await addCustomerAddress(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof addCustomerAddress>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/customers/:customerId/duplicate-candidates', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await findCustomerDuplicateCandidates(database.db, {
        organizationId: active.organizationId,
        customerId: (request.params as { customerId: string }).customerId,
      }),
    };
  });
}
