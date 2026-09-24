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
  mergeCustomers,
  anonymizeCustomer,
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
        : ['CONFLICT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT'].includes(error.code)
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
          status: Type.Optional(
            Type.Union([
              Type.Literal('ACTIVE'),
              Type.Literal('INACTIVE'),
              Type.Literal('BLOCKED'),
              Type.Literal('MERGED'),
              Type.Literal('ANONYMIZED'),
            ]),
          ),
          source: Type.Optional(
            Type.Union([
              Type.Literal('STOREFRONT'),
              Type.Literal('MANUAL_ORDER'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
              Type.Literal('WHATSAPP'),
              Type.Literal('PHONE'),
              Type.Literal('IMPORT'),
              Type.Literal('ADMIN_CREATED'),
              Type.Literal('EXTERNAL_API'),
            ]),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as NonNullable<Parameters<typeof listCustomers>[2]>;
      const result = await listCustomers(database.db, active.organizationId, query);
      return {
        data: {
          items: result.data,
          totalCount: result.pagination.totalItems,
          pagination: result.pagination,
        },
      };
    },
  );

  app.post(
    '/admin/customers',
    {
      schema: {
        body: Type.Object({
          displayName: Type.String({ minLength: 1 }),
          phone: Type.Optional(Type.String({ minLength: 7 })),
          email: Type.Optional(Type.String({ minLength: 3 })),
          source: Type.Optional(
            Type.Union([
              Type.Literal('ADMIN_CREATED'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
              Type.Literal('WHATSAPP'),
              Type.Literal('PHONE'),
              Type.Literal('IMPORT'),
              Type.Literal('EXTERNAL_API'),
            ]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await createCustomer(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as Omit<
              Parameters<typeof createCustomer>[1],
              'organizationId' | 'actorId' | 'actorType'
            >),
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

  app.get(
    '/admin/customers/:customerId/orders',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      return {
        data: await listCustomerOrders(
          database.db,
          active.organizationId,
          (request.params as { customerId: string }).customerId,
          (request.query as { limit?: number }).limit,
        ),
      };
    },
  );

  app.get(
    '/admin/customers/:customerId/returns',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      return {
        data: await listCustomerReturns(
          database.db,
          active.organizationId,
          (request.params as { customerId: string }).customerId,
          (request.query as { limit?: number }).limit,
        ),
      };
    },
  );

  app.get(
    '/admin/customers/:customerId/refunds',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      return {
        data: await listCustomerRefunds(
          database.db,
          active.organizationId,
          (request.params as { customerId: string }).customerId,
          (request.query as { limit?: number }).limit,
        ),
      };
    },
  );

  app.put(
    '/admin/customers/:customerId',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Number(),
          displayName: Type.Optional(Type.String({ minLength: 1 })),
          status: Type.Optional(
            Type.Union([Type.Literal('ACTIVE'), Type.Literal('INACTIVE'), Type.Literal('BLOCKED')]),
          ),
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
            ...(request.body as {
              expectedVersion: number;
              displayName?: string;
              status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
            }),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/merge',
    {
      schema: {
        body: Type.Object({
          sourceExpectedVersion: Type.Integer({ minimum: 1 }),
          targetCustomerId: Type.String({ minLength: 1 }),
          targetExpectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 1, maxLength: 1000 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.merge');
      const key = request.headers['idempotency-key'];
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        const body = request.body as {
          sourceExpectedVersion: number;
          targetCustomerId: string;
          targetExpectedVersion: number;
          reason: string;
        };
        return {
          data: await mergeCustomers(database.db, {
            ...active,
            sourceCustomerId: (request.params as { customerId: string }).customerId,
            ...body,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/anonymize',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          reasonCode: Type.String({ minLength: 1, maxLength: 100 }),
          reasonText: Type.Optional(Type.String({ maxLength: 1000 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.anonymize');
      const key = request.headers['idempotency-key'];
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      if (typeof key !== 'string' || !key.trim())
        return reply
          .code(422)
          .send({ error: { code: 'VALIDATION_FAILED', message: 'Idempotency-Key is required.' } });
      try {
        return {
          data: await anonymizeCustomer(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as {
              expectedVersion: number;
              reasonCode: string;
              reasonText?: string;
            }),
            idempotencyKey: key,
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
      await removeCustomerPhone(database.db, {
        ...active,
        customerId: params.customerId,
        phoneId: params.phoneId,
      });
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
      await removeCustomerEmail(database.db, {
        ...active,
        customerId: params.customerId,
        emailId: params.emailId,
      });
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
      await removeCustomerAddress(database.db, {
        ...active,
        customerId: params.customerId,
        addressId: params.addressId,
      });
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
    {
      schema: {
        body: Type.Object({
          label: Type.String({ minLength: 1 }),
          color: Type.Optional(Type.String()),
        }),
      },
    },
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
      await assignTagToCustomer(database.db, {
        ...active,
        customerId: params.customerId,
        tagId: params.tagId,
      });
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
      await removeTagFromCustomer(database.db, {
        ...active,
        customerId: params.customerId,
        tagId: params.tagId,
      });
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
