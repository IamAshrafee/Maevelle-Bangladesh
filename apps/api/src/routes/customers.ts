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
  getCustomerDetail,
  updateCustomer,
  removeCustomerPhone,
  removeCustomerEmail,
  removeCustomerAddress,
  addCustomerNote,
  listCustomerOrders,
  listCustomerReturns,
  listCustomerRefunds,
  listOrgTags,
  createTag,
  assignTagToCustomer,
  removeTagFromCustomer,
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
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as { q?: string; page?: number; pageSize?: number };
      const filters: { q?: string; page?: number; pageSize?: number } = {};
      if (query.q) filters.q = query.q;
      if (query.page) filters.page = query.page;
      if (query.pageSize) filters.pageSize = query.pageSize;
      
      const result = await listCustomers(database.db, active.organizationId, filters);
      return { data: { items: result.data, totalCount: result.pagination.totalItems } };
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

  app.get('/admin/customers/:customerId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getCustomerDetail(
          database.db,
          active.organizationId,
          (request.params as { customerId: string }).customerId,
        ),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put(
    '/admin/customers/:customerId',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Number(),
          displayName: Type.Optional(Type.String({ minLength: 1 })),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE'), Type.Literal('BLOCKED')])),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await updateCustomer(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as { expectedVersion: number; displayName?: string; status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' }),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete('/admin/customers/:customerId/phones/:phoneId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; phoneId: string };
    try {
      await removeCustomerPhone(database.db, { ...active, customerId: params.customerId, phoneId: params.phoneId });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/admin/customers/:customerId/emails/:emailId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; emailId: string };
    try {
      await removeCustomerEmail(database.db, { ...active, customerId: params.customerId, emailId: params.emailId });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/admin/customers/:customerId/addresses/:addressId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; addressId: string };
    try {
      await removeCustomerAddress(database.db, { ...active, customerId: params.customerId, addressId: params.addressId });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/admin/customers/:customerId/notes',
    { schema: { body: Type.Object({ body: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await addCustomerNote(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as { body: string }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/tags', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listOrgTags(database.db, active.organizationId) };
  });

  app.post(
    '/admin/tags',
    { schema: { body: Type.Object({ label: Type.String({ minLength: 1 }), color: Type.Optional(Type.String()) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createTag(database.db, {
            organizationId: active.organizationId,
            ...(request.body as { label: string; color?: string }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post('/admin/customers/:customerId/tags/:tagId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; tagId: string };
    try {
      await assignTagToCustomer(database.db, { ...active, customerId: params.customerId, tagId: params.tagId });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/admin/customers/:customerId/tags/:tagId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; tagId: string };
    try {
      await removeTagFromCustomer(database.db, { ...active, customerId: params.customerId, tagId: params.tagId });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

}
