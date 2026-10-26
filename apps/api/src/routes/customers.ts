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
  updateCustomerAddress,
  setPrimaryCustomerPhone,
  setPrimaryCustomerEmail,
  setDefaultCustomerAddress,
  addCustomerNote,
  updateCustomerNote,
  listCustomerOrders,
  listCustomerReturns,
  listCustomerRefunds,
  listOrgTags,
  createTag,
  assignTagToCustomer,
  removeTagFromCustomer,
  mergeCustomers,
  anonymizeCustomer,
  applyCustomerRestriction,
  liftCustomerRestriction,
  listCustomerRestrictions,
  getCustomerMergePreview,
  listCustomerCommunications,
  getCustomerTimeline,
  getCustomerAccount,
  linkCustomerAccount,
  unlinkCustomerAccount,
  verifyCustomerPhone,
  verifyCustomerEmail,
} from '@maevelle/database/customers';
import { searchGeography } from '@maevelle/database/geography';
import { getCustomerDeliveryHistory } from '@maevelle/database/delivery-intelligence';
import { getCustomerReviewHistory } from '@maevelle/database/reviews';
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

export async function customerRouteContext(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof requestHeaders['x-organization-id'] === 'string'
      ? { organizationId: requestHeaders['x-organization-id'] }
      : {}),
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

export function sendCustomerError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof CustomerDomainError)) throw error;
  return reply
    .code(
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : ['CONFLICT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT'].includes(error.code)
            ? 409
            : 422,
    )
    .send({ error: { code: error.code, message: error.message } });
}

const context = customerRouteContext;
const sendError = sendCustomerError;

function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${'•'.repeat(Math.max(4, value.length - visible.length))}${visible}`;
}

function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const [local = '', domain = ''] = value.split('@');
  return `${local.slice(0, 1) || '•'}•••@${domain || '•••'}`;
}

function maskCustomerDetail<
  T extends {
    phones: readonly { phone: string }[];
    emails: readonly { email: string }[];
    addresses: readonly { phone: string | null }[];
  },
>(detail: T): T {
  return {
    ...detail,
    phones: detail.phones.map((phone) => ({ ...phone, phone: maskPhone(phone.phone) ?? '' })),
    emails: detail.emails.map((email) => ({ ...email, email: maskEmail(email.email) ?? '' })),
    addresses: detail.addresses.map((address) => ({ ...address, phone: maskPhone(address.phone) })),
  };
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
      if (!(await customerRouteContext(database, auth, request.headers, 'customers.view')))
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
          sortBy: Type.Optional(
            Type.Union([
              Type.Literal('CREATED_DESC'),
              Type.Literal('CREATED_ASC'),
              Type.Literal('ORDERS_DESC'),
              Type.Literal('SPEND_DESC'),
              Type.Literal('RECENT_ORDER'),
            ]),
          ),
          minOrders: Type.Optional(Type.Integer({ minimum: 0 })),
          maxOrders: Type.Optional(Type.Integer({ minimum: 0 })),
          minSpend: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          maxSpend: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          lifecycleStage: Type.Optional(
            Type.Union(
              [
                'NEW_CONTACT',
                'PROSPECT',
                'ENGAGED_PROSPECT',
                'FIRST_TIME_BUYER',
                'REPEAT_CUSTOMER',
                'LOYAL_CUSTOMER',
                'INACTIVE_CUSTOMER',
                'RE_ENGAGED_CUSTOMER',
              ].map((value) => Type.Literal(value)),
            ),
          ),
          relationshipOwnerMembershipId: Type.Optional(Type.String({ format: 'uuid' })),
          tagId: Type.Optional(Type.String({ format: 'uuid' })),
          segmentId: Type.Optional(Type.String({ format: 'uuid' })),
          linkedChannel: Type.Optional(
            Type.Union([
              Type.Literal('WEBSITE'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
            ]),
          ),
          lastActivityFrom: Type.Optional(Type.String({ format: 'date-time' })),
          lastActivityTo: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const query = request.query as NonNullable<Parameters<typeof listCustomers>[2]>;
      const canViewSensitive = active.capabilities.includes('customers.sensitive.view');
      const result = await listCustomers(database.db, active.organizationId, {
        ...query,
        searchSensitive: canViewSensitive,
      });
      return {
        data: {
          items: canViewSensitive
            ? result.data
            : result.data.map((customer) => ({
                ...customer,
                primaryPhone: maskPhone(customer.primaryPhone),
                primaryEmail: maskEmail(customer.primaryEmail),
              })),
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

  app.patch(
    '/admin/customers/:customerId/notes/:noteId',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String({ format: 'uuid' }),
          noteId: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          body: Type.String({ minLength: 1 }),
          isPinned: Type.Boolean(),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await updateCustomerNote(database.db, {
          ...active,
          ...(request.params as { customerId: string; noteId: string }),
          ...(request.body as { body: string; isPinned: boolean; expectedVersion: number }),
        });
        return reply.code(204).send();
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
      const detail = await getCustomerDetail(
        database.db,
        active.organizationId,
        (request.params as { customerId: string }).customerId,
      );
      return {
        data: active.capabilities.includes('customers.sensitive.view')
          ? detail
          : maskCustomerDetail(detail),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/admin/customers/:customerId/delivery-history', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await getCustomerDeliveryHistory(database.db, {
        organizationId: active.organizationId,
        customerId: (request.params as { customerId: string }).customerId,
      }),
    };
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

  app.get(
    '/admin/customers/:customerId/reviews',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as { page?: number; pageSize?: number };
      return {
        data: await getCustomerReviewHistory(
          database.db,
          active.organizationId,
          (request.params as { customerId: string }).customerId,
          {
            page: query.page ? Number(query.page) : undefined,
            pageSize: query.pageSize ? Number(query.pageSize) : undefined,
          },
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

  app.put(
    '/admin/customers/:customerId/addresses/:addressId',
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
      const params = request.params as { customerId: string; addressId: string };
      try {
        await updateCustomerAddress(database.db, {
          ...active,
          customerId: params.customerId,
          addressId: params.addressId,
          ...(request.body as {
            recipientName: string;
            addressLine1: string;
            countryCode: string;
            label?: string | null;
            phone?: string | null;
            addressLine2?: string | null;
            geographyNodeId?: string | null;
            area?: string | null;
            city?: string | null;
            district?: string | null;
            postalCode?: string | null;
            isDefault?: boolean;
          }),
        });
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post('/admin/customers/:customerId/phones/:phoneId/primary', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; phoneId: string };
    try {
      await setPrimaryCustomerPhone(database.db, {
        ...active,
        customerId: params.customerId,
        phoneId: params.phoneId,
      });
      return reply.code(200).send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/customers/:customerId/emails/:emailId/primary', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; emailId: string };
    try {
      await setPrimaryCustomerEmail(database.db, {
        ...active,
        customerId: params.customerId,
        emailId: params.emailId,
      });
      return reply.code(200).send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/admin/customers/:customerId/addresses/:addressId/default', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string; addressId: string };
    try {
      await setDefaultCustomerAddress(database.db, {
        ...active,
        customerId: params.customerId,
        addressId: params.addressId,
      });
      return reply.code(200).send({ success: true });
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

  // ---- Restrictions --------------------------------------------------------
  app.get('/admin/customers/:customerId/restrictions', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string };
    return {
      data: await listCustomerRestrictions(database.db, active.organizationId, params.customerId),
    };
  });

  app.post(
    '/admin/customers/:customerId/restrictions',
    {
      schema: {
        body: Type.Object({
          restrictionType: Type.Union([
            Type.Literal('ORDERING_BLOCKED'),
            Type.Literal('COD_RESTRICTED'),
            Type.Literal('ORDER_REVIEW_REQUIRED'),
          ]),
          reason: Type.String({ minLength: 1 }),
          notes: Type.Optional(Type.String()),
          expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.restrict');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const body = request.body as {
        restrictionType: 'ORDERING_BLOCKED' | 'COD_RESTRICTED' | 'ORDER_REVIEW_REQUIRED';
        reason: string;
        notes?: string;
        expiresAt?: string;
      };
      try {
        return reply.code(201).send({
          data: await applyCustomerRestriction(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            restrictionType: body.restrictionType,
            reason: body.reason,
            ...(body.notes ? { notes: body.notes } : {}),
            ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/restrictions/:restrictionId/lift',
    {
      schema: {
        body: Type.Object({
          liftReason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.restrict');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string; restrictionId: string };
      const body = request.body as { liftReason: string };
      try {
        return reply.code(200).send({
          data: await liftCustomerRestriction(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            restrictionId: params.restrictionId,
            liftReason: body.liftReason,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // ---- Merge Preview -------------------------------------------------------
  app.get(
    '/admin/customers/:customerId/merge-preview',
    {
      schema: {
        querystring: Type.Object({
          targetCustomerId: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.merge');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const query = request.query as { targetCustomerId: string };
      try {
        return {
          data: await getCustomerMergePreview(
            database.db,
            active.organizationId,
            params.customerId,
            query.targetCustomerId,
          ),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // ---- Communications ------------------------------------------------------
  app.get(
    '/admin/customers/:customerId/communications',
    {
      schema: {
        querystring: Type.Object({
          channel: Type.Optional(Type.Union([Type.Literal('EMAIL'), Type.Literal('SMS')])),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const query = request.query as {
        channel?: 'EMAIL' | 'SMS';
        page?: number;
        pageSize?: number;
      };
      const pageSize = query.pageSize ?? 25;
      const offset = ((query.page ?? 1) - 1) * pageSize;
      return {
        data: await listCustomerCommunications(
          database.db,
          active.organizationId,
          params.customerId,
          {
            ...(query.channel ? { channel: query.channel } : {}),
            limit: pageSize,
            offset,
          },
        ),
      };
    },
  );

  // ---- Timeline ------------------------------------------------------------
  app.get(
    '/admin/customers/:customerId/timeline',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
          eventTypes: Type.Optional(Type.String({ maxLength: 1000 })),
          channel: Type.Optional(
            Type.Union(
              ['FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'EMAIL', 'SMS'].map((value) =>
                Type.Literal(value),
              ),
            ),
          ),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          search: Type.Optional(Type.String({ maxLength: 200 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const query = request.query as {
        page?: number;
        pageSize?: number;
        cursor?: string;
        eventTypes?: string;
        channel?: 'FACEBOOK' | 'INSTAGRAM' | 'WEBSITE' | 'EMAIL' | 'SMS';
        from?: string;
        to?: string;
        search?: string;
      };
      const pageSize = query.pageSize ?? 30;
      const offset = ((query.page ?? 1) - 1) * pageSize;
      const allowedEventTypes = new Set([
        'CUSTOMER_CREATED',
        'CUSTOMER_UPDATED',
        'ORDER_PLACED',
        'ORDER_CONFIRMED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
        'RETURN_REQUESTED',
        'RETURN_COMPLETED',
        'REFUND_COMPLETED',
        'RESTRICTION_APPLIED',
        'RESTRICTION_LIFTED',
        'NOTE_ADDED',
        'TAG_ASSIGNED',
        'ACCOUNT_LINKED',
        'ACCOUNT_UNLINKED',
        'CUSTOMER_MERGED',
        'COMMUNICATION_SENT',
        'IDENTITY_LINKED',
        'IDENTITY_REVOKED',
        'LIFECYCLE_CHANGED',
        'OWNER_CHANGED',
        'FOLLOW_UP_CREATED',
        'FOLLOW_UP_COMPLETED',
        'CONVERSATION_STARTED',
      ] as const);
      const eventTypes = query.eventTypes
        ?.split(',')
        .filter((value): value is typeof allowedEventTypes extends Set<infer T> ? T : never =>
          allowedEventTypes.has(value as never),
        );
      if (query.eventTypes && eventTypes?.length !== query.eventTypes.split(',').length) {
        return reply.code(400).send({ error: 'INVALID_TIMELINE_EVENT_TYPE' });
      }
      try {
        const data = await getCustomerTimeline(
          database.db,
          active.organizationId,
          params.customerId,
          {
            limit: pageSize,
            offset,
            ...(query.cursor ? { cursor: query.cursor } : {}),
            ...(eventTypes?.length ? { eventTypes } : {}),
            ...(query.channel ? { channel: query.channel } : {}),
            ...(query.from ? { from: new Date(query.from) } : {}),
            ...(query.to ? { to: new Date(query.to) } : {}),
            ...(query.search ? { search: query.search } : {}),
          },
        );
        return { data };
      } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_TIMELINE_CURSOR') {
          return reply.code(400).send({ error: 'INVALID_TIMELINE_CURSOR' });
        }
        throw error;
      }
    },
  );

  // ---- Accounts ------------------------------------------------------------
  app.get('/admin/customers/:customerId/account', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const params = request.params as { customerId: string };
    return {
      data: await getCustomerAccount(database.db, active.organizationId, params.customerId),
    };
  });

  app.post(
    '/admin/customers/:customerId/account/link',
    {
      schema: {
        body: Type.Object({
          userId: Type.String({ minLength: 1 }),
          linkType: Type.Optional(
            Type.Union([
              Type.Literal('VERIFIED_PHONE'),
              Type.Literal('VERIFIED_EMAIL'),
              Type.Literal('MANUAL_CLAIM'),
              Type.Literal('INVITATION'),
              Type.Literal('GUEST_CONVERSION'),
            ]),
          ),
          verifiedAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const body = request.body as {
        userId: string;
        linkType?:
          'VERIFIED_PHONE' | 'VERIFIED_EMAIL' | 'MANUAL_CLAIM' | 'INVITATION' | 'GUEST_CONVERSION';
        verifiedAt?: string;
      };
      try {
        return reply.code(200).send({
          data: await linkCustomerAccount(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            userId: body.userId,
            linkType: body.linkType ?? 'MANUAL_CLAIM',
            ...(body.verifiedAt ? { verifiedAt: body.verifiedAt } : {}),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/account/unlink',
    {
      schema: {
        body: Type.Object({
          reason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string };
      const body = request.body as { reason: string };
      try {
        return reply.code(200).send({
          data: await unlinkCustomerAccount(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            reason: body.reason,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // ---- Contact Verification ------------------------------------------------
  app.post(
    '/admin/customers/:customerId/phones/:phoneId/verify',
    {
      schema: {
        body: Type.Optional(
          Type.Object({
            verificationSource: Type.Optional(
              Type.Union(
                ['OTP_SMS', 'MANUAL_STAFF', 'CALL_VERIFIED', 'IMPORT', 'ORDER_DELIVERED'].map(
                  (value) => Type.Literal(value),
                ),
              ),
            ),
          }),
        ),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string; phoneId: string };
      const body = request.body as { verificationSource?: string } | undefined;
      try {
        return reply.code(200).send({
          data: await verifyCustomerPhone(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            phoneId: params.phoneId,
            ...(body?.verificationSource ? { verificationSource: body.verificationSource } : {}),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/emails/:emailId/verify',
    {
      schema: {
        body: Type.Optional(
          Type.Object({
            verificationSource: Type.Optional(
              Type.Union(
                ['MAGIC_LINK', 'OTP_EMAIL', 'MANUAL_STAFF', 'IMPORT'].map((value) =>
                  Type.Literal(value),
                ),
              ),
            ),
          }),
        ),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const params = request.params as { customerId: string; emailId: string };
      const body = request.body as { verificationSource?: string } | undefined;
      try {
        return reply.code(200).send({
          data: await verifyCustomerEmail(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            customerId: params.customerId,
            emailId: params.emailId,
            ...(body?.verificationSource ? { verificationSource: body.verificationSource } : {}),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
