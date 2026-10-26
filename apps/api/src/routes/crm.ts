import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  applyCustomerBulkAction,
  assignCustomerRelationship,
  completeCustomerFollowUp,
  createCustomerCustomFieldDefinition,
  createCustomerFollowUp,
  createCustomerPrivacyRequest,
  createCustomerSavedView,
  createCustomerSegment,
  createOrResolveCustomerIdentityLink,
  getCrmAnalytics,
  dismissDuplicateReviewCandidate,
  exportCustomerDataSubjectBundle,
  getCustomerCrmProfile,
  listCustomerCustomFieldDefinitions,
  listCustomerIdentityEvents,
  listCustomerIdentityLinks,
  listCustomerMergeHistory,
  listCustomerSavedViews,
  listCustomerSegmentMembers,
  listCustomerSegments,
  listDuplicateReviewCandidates,
  listCustomerPrivacyRequests,
  listCustomers,
  recordCustomerConsent,
  reconcileLegacyMessagingCustomerLinks,
  revokeCustomerIdentityLink,
  setCustomerCustomFieldValue,
  setStaticSegmentMembership,
  transitionCustomerLifecycle,
  updateCustomerCrmProfile,
  upsertCustomerPreference,
  updateCustomerPrivacyRequest,
} from '@maevelle/database/customers';
import { appendAuditEvent } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';
import { customerRouteContext as context, sendCustomerError as sendError } from './customers.js';

type Auth = ReturnType<typeof createAuth>;
const uuid = Type.String({ format: 'uuid' });
const lifecycle = Type.Union(
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
);
const relationshipStatus = Type.Union(
  ['UNASSIGNED', 'ACTIVE', 'FOLLOW_UP', 'AT_RISK', 'DORMANT'].map((value) => Type.Literal(value)),
);

function forbidden(reply: { code(status: number): { send(value: unknown): unknown } }) {
  return reply
    .code(403)
    .send({ error: { code: 'FORBIDDEN', message: 'Required CRM permission is missing.' } });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function registerCrmRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.post(
    '/admin/crm/customers/export',
    {
      schema: {
        body: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 160 })),
          status: Type.Optional(Type.String()),
          source: Type.Optional(Type.String()),
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          lifecycleStage: Type.Optional(lifecycle),
          linkedChannel: Type.Optional(
            Type.Union([
              Type.Literal('WEBSITE'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
            ]),
          ),
          minSpend: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          maxSpend: Type.Optional(Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' })),
          minOrders: Type.Optional(Type.Integer({ minimum: 0 })),
          sortBy: Type.Optional(Type.String()),
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.export');
      if (!active) return forbidden(reply);
      const { reason, ...filters } = request.body as { reason: string } & NonNullable<
        Parameters<typeof listCustomers>[2]
      >;
      const canViewSensitive = active.capabilities.includes('customers.sensitive.view');
      const rows: Awaited<ReturnType<typeof listCustomers>>['data'][number][] = [];
      for (let page = 1; page <= 100; page += 1) {
        const result = await listCustomers(database.db, active.organizationId, {
          ...filters,
          searchSensitive: canViewSensitive,
          page,
          pageSize: 100,
        });
        rows.push(...result.data);
        if (rows.length >= result.pagination.totalItems) break;
      }
      const header = [
        'Customer ID',
        'Customer Number',
        'Name',
        'Phone',
        'Email',
        'Status',
        'Lifecycle',
        'Source',
        'Linked Channels',
        'Orders',
        'Total Spend BDT',
        'Last Order',
        'Last Activity',
        'Relationship Owner',
        'Created At',
      ];
      const content = [
        header,
        ...rows.map((customer) => [
          customer.id,
          customer.customerNumber,
          customer.displayName,
          canViewSensitive ? customer.primaryPhone : '',
          canViewSensitive ? customer.primaryEmail : '',
          customer.status,
          customer.lifecycleStage,
          customer.firstSource,
          customer.linkedChannels?.join('|'),
          customer.orderCount,
          customer.totalSpend,
          customer.lastOrderAt,
          customer.lastActivityAt,
          customer.relationshipOwnerName,
          customer.createdAt,
        ]),
      ]
        .map((row) => row.map(csvCell).join(','))
        .join('\n');
      await appendAuditEvent(database.db, {
        organizationId: active.organizationId,
        actorType: 'USER',
        actorId: active.actorId,
        action: 'customers.export.completed',
        targetType: 'customers.export',
        reason,
        metadata: { rowCount: rows.length, sensitiveFieldsIncluded: canViewSensitive },
      });
      return {
        data: {
          fileName: `maevelle-customers-${new Date().toISOString().slice(0, 10)}.csv`,
          content,
          rowCount: rows.length,
        },
      };
    },
  );
  app.get(
    '/admin/customers/:customerId/crm',
    { schema: { params: Type.Object({ customerId: uuid }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      try {
        return {
          data: await getCustomerCrmProfile(
            database.db,
            active.organizationId,
            (request.params as { customerId: string }).customerId,
          ),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/customers/:customerId/crm',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          firstName: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
          lastName: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
          preferredLanguage: Type.Optional(
            Type.Union([Type.String({ pattern: '^[a-z]{2,3}(-[A-Z]{2})?$' }), Type.Null()]),
          ),
          relationshipStatus: Type.Optional(relationshipStatus),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return forbidden(reply);
      try {
        return {
          data: await updateCustomerCrmProfile(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof updateCustomerCrmProfile>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/admin/customers/:customerId/preferences/:key',
    {
      schema: {
        params: Type.Object({
          customerId: uuid,
          key: Type.String({ minLength: 2, maxLength: 64 }),
        }),
        body: Type.Object({
          value: Type.Unknown(),
          source: Type.Union(
            ['CUSTOMER_CONFIRMED', 'AGENT_RECORDED', 'COMMERCE_OBSERVED', 'IMPORTED'].map((value) =>
              Type.Literal(value),
            ),
          ),
          confidence: Type.Union(
            ['INFERRED', 'REPORTED', 'CONFIRMED'].map((value) => Type.Literal(value)),
          ),
          evidenceReference: Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return forbidden(reply);
      const params = request.params as { customerId: string; key: string };
      try {
        return {
          data: await upsertCustomerPreference(database.db, {
            ...active,
            customerId: params.customerId,
            key: params.key,
            ...(request.body as Omit<
              Parameters<typeof upsertCustomerPreference>[1],
              'organizationId' | 'actorId' | 'customerId' | 'key'
            >),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/lifecycle-transitions',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          stage: lifecycle,
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return forbidden(reply);
      try {
        return {
          data: await transitionCustomerLifecycle(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof transitionCustomerLifecycle>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/customers/:customerId/relationship',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          ownerMembershipId: Type.Optional(Type.Union([uuid, Type.Null()])),
          relationshipStatus,
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(
        database,
        auth,
        request.headers,
        'customers.relationship.manage',
      );
      if (!active) return forbidden(reply);
      try {
        return {
          data: await assignCustomerRelationship(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof assignCustomerRelationship>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
            ownerMembershipId:
              (request.body as { ownerMembershipId?: string | null }).ownerMembershipId ===
              undefined
                ? active.membershipId
                : (request.body as { ownerMembershipId: string | null }).ownerMembershipId,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/follow-ups',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          assignedMembershipId: Type.Optional(uuid),
          title: Type.String({ minLength: 1, maxLength: 160 }),
          details: Type.Optional(Type.String({ maxLength: 2000 })),
          dueAt: Type.String({ format: 'date-time' }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(
        database,
        auth,
        request.headers,
        'customers.relationship.manage',
      );
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await createCustomerFollowUp(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof createCustomerFollowUp>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
            assignedMembershipId:
              (request.body as { assignedMembershipId?: string }).assignedMembershipId ??
              active.membershipId,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/follow-ups/:followUpId/completion',
    {
      schema: {
        params: Type.Object({ customerId: uuid, followUpId: uuid }),
        body: Type.Object({ expectedVersion: Type.Integer({ minimum: 1 }) }),
      },
    },
    async (request, reply) => {
      const active = await context(
        database,
        auth,
        request.headers,
        'customers.relationship.manage',
      );
      if (!active) return forbidden(reply);
      const params = request.params as { customerId: string; followUpId: string };
      try {
        await completeCustomerFollowUp(database.db, {
          ...active,
          ...params,
          ...(request.body as { expectedVersion: number }),
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/admin/customers/:customerId/identities',
    { schema: { params: Type.Object({ customerId: uuid }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      return {
        data: await listCustomerIdentityLinks(database.db, {
          organizationId: active.organizationId,
          customerId: (request.params as { customerId: string }).customerId,
        }),
      };
    },
  );

  app.get(
    '/admin/crm/identity-links',
    {
      schema: {
        querystring: Type.Object({
          status: Type.Optional(
            Type.Union(
              ['CANDIDATE', 'LINKED', 'REJECTED', 'REVOKED', 'DISPUTED'].map((value) =>
                Type.Literal(value),
              ),
            ),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.identity.manage');
      if (!active) return forbidden(reply);
      const query = request.query as {
        status?: Parameters<typeof listCustomerIdentityLinks>[1]['status'];
        page?: number;
        pageSize?: number;
      };
      return {
        data: await listCustomerIdentityLinks(database.db, {
          organizationId: active.organizationId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.pageSize ? { limit: query.pageSize } : {}),
          offset: ((query.page ?? 1) - 1) * (query.pageSize ?? 50),
        }),
      };
    },
  );

  app.post('/admin/crm/identity-links/reconciliation', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.identity.manage');
    if (!active) return forbidden(reply);
    try {
      return {
        data: await reconcileLegacyMessagingCustomerLinks(database.db, active),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/admin/customers/:customerId/identities',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          contactIdentityId: uuid,
          targetStatus: Type.Union(
            ['CANDIDATE', 'LINKED', 'REJECTED'].map((value) => Type.Literal(value)),
          ),
          assurance: Type.Union(
            ['UNVERIFIED', 'LOW', 'MEDIUM', 'HIGH'].map((value) => Type.Literal(value)),
          ),
          evidenceMethod: Type.Union(
            [
              'AUTHENTICATED_ACCOUNT',
              'VERIFIED_EMAIL',
              'VERIFIED_PHONE',
              'CHANNEL_ASSERTED',
              'STAFF_REVIEW',
              'CUSTOMER_REQUEST',
            ].map((value) => Type.Literal(value)),
          ),
          evidenceReference: Type.Optional(Type.String({ maxLength: 500 })),
          evidenceSummary: Type.String({ minLength: 1, maxLength: 500 }),
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.identity.manage');
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await createOrResolveCustomerIdentityLink(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof createOrResolveCustomerIdentityLink>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/crm/identity-links/:linkId/revocation',
    {
      schema: {
        params: Type.Object({ linkId: uuid }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.identity.manage');
      if (!active) return forbidden(reply);
      try {
        return {
          data: await revokeCustomerIdentityLink(database.db, {
            ...active,
            linkId: (request.params as { linkId: string }).linkId,
            ...(request.body as { expectedVersion: number; reason: string }),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/admin/crm/identity-links/:linkId/events',
    { schema: { params: Type.Object({ linkId: uuid }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.identity.manage');
      if (!active) return forbidden(reply);
      return {
        data: await listCustomerIdentityEvents(
          database.db,
          active.organizationId,
          (request.params as { linkId: string }).linkId,
        ),
      };
    },
  );

  app.get('/admin/crm/segments', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return forbidden(reply);
    return { data: await listCustomerSegments(database.db, active.organizationId) };
  });

  app.post(
    '/admin/crm/segments',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          description: Type.Optional(Type.String({ maxLength: 1000 })),
          segmentType: Type.Union([Type.Literal('STATIC'), Type.Literal('DYNAMIC')]),
          ruleDefinition: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.segments.manage');
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await createCustomerSegment(database.db, {
            ...active,
            ...(request.body as Omit<
              Parameters<typeof createCustomerSegment>[1],
              'organizationId' | 'actorId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/admin/crm/segments/:segmentId/members',
    {
      schema: {
        params: Type.Object({ segmentId: uuid }),
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      try {
        return {
          data: await listCustomerSegmentMembers(database.db, {
            organizationId: active.organizationId,
            segmentId: (request.params as { segmentId: string }).segmentId,
            ...(request.query as { page?: number; pageSize?: number }),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/admin/crm/segments/:segmentId/members/:customerId',
    {
      schema: {
        params: Type.Object({ segmentId: uuid, customerId: uuid }),
        body: Type.Object({ included: Type.Boolean() }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.segments.manage');
      if (!active) return forbidden(reply);
      try {
        await setStaticSegmentMembership(database.db, {
          ...active,
          ...(request.params as { segmentId: string; customerId: string }),
          ...(request.body as { included: boolean }),
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/admin/crm/analytics',
    {
      schema: {
        querystring: Type.Object({
          from: Type.Optional(Type.String({ format: 'date-time' })),
          to: Type.Optional(Type.String({ format: 'date-time' })),
          lifecycleStage: Type.Optional(lifecycle),
          source: Type.Optional(Type.String({ maxLength: 64 })),
          segmentId: Type.Optional(uuid),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      const query = request.query as {
        from?: string;
        to?: string;
        lifecycleStage?: string;
        source?: string;
        segmentId?: string;
      };
      return {
        data: await getCrmAnalytics(database.db, active.organizationId, {
          ...(query.from ? { from: new Date(query.from) } : {}),
          ...(query.to ? { to: new Date(query.to) } : {}),
          ...(query.lifecycleStage ? { lifecycleStage: query.lifecycleStage } : {}),
          ...(query.source ? { source: query.source } : {}),
          ...(query.segmentId ? { segmentId: query.segmentId } : {}),
        }),
      };
    },
  );

  app.get(
    '/admin/crm/duplicates',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      return {
        data: await listDuplicateReviewCandidates(database.db, {
          organizationId: active.organizationId,
          ...(request.query as { page?: number; pageSize?: number }),
        }),
      };
    },
  );

  app.get(
    '/admin/crm/merges',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.view');
      if (!active) return forbidden(reply);
      return {
        data: await listCustomerMergeHistory(database.db, {
          organizationId: active.organizationId,
          ...(request.query as { page?: number; pageSize?: number }),
        }),
      };
    },
  );

  app.post(
    '/admin/crm/duplicates/:candidateId/dismissal',
    {
      schema: {
        params: Type.Object({ candidateId: uuid }),
        body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.merge');
      if (!active) return forbidden(reply);
      try {
        await dismissDuplicateReviewCandidate(database.db, {
          ...active,
          candidateId: (request.params as { candidateId: string }).candidateId,
          reason: (request.body as { reason: string }).reason,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/crm/custom-fields', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return forbidden(reply);
    return { data: await listCustomerCustomFieldDefinitions(database.db, active.organizationId) };
  });

  app.post(
    '/admin/crm/custom-fields',
    {
      schema: {
        body: Type.Object({
          key: Type.String({ minLength: 2, maxLength: 64 }),
          label: Type.String({ minLength: 1, maxLength: 120 }),
          description: Type.Optional(Type.String({ maxLength: 1000 })),
          valueType: Type.Union(
            ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE'].map((value) =>
              Type.Literal(value),
            ),
          ),
          choices: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { maxItems: 100 }),
          ),
          validation: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          isRequired: Type.Optional(Type.Boolean()),
          isSearchable: Type.Optional(Type.Boolean()),
          editCapability: Type.Optional(Type.String({ maxLength: 120 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.settings.manage');
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await createCustomerCustomFieldDefinition(database.db, {
            ...active,
            ...(request.body as Omit<
              Parameters<typeof createCustomerCustomFieldDefinition>[1],
              'organizationId' | 'actorId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/admin/customers/:customerId/custom-fields/:fieldDefinitionId',
    {
      schema: {
        params: Type.Object({ customerId: uuid, fieldDefinitionId: uuid }),
        body: Type.Object({ value: Type.Unknown() }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.manage');
      if (!active) return forbidden(reply);
      try {
        await setCustomerCustomFieldValue(database.db, {
          ...active,
          capabilities: active.capabilities,
          ...(request.params as { customerId: string; fieldDefinitionId: string }),
          value: (request.body as { value: unknown }).value,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/consents',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          purpose: Type.String({ minLength: 1, maxLength: 80 }),
          channel: Type.Union(
            ['EMAIL', 'SMS', 'PHONE', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'ANY'].map((value) =>
              Type.Literal(value),
            ),
          ),
          status: Type.Union(
            ['GRANTED', 'DENIED', 'WITHDRAWN', 'SUPPRESSED'].map((value) => Type.Literal(value)),
          ),
          lawfulBasis: Type.Optional(
            Type.Union(
              ['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'LEGITIMATE_INTEREST'].map((value) =>
                Type.Literal(value),
              ),
            ),
          ),
          source: Type.String({ minLength: 1, maxLength: 160 }),
          evidenceReference: Type.Optional(Type.String({ maxLength: 500 })),
          effectiveAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.privacy.manage');
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await recordCustomerConsent(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof recordCustomerConsent>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/customers/:customerId/privacy-requests',
    {
      schema: {
        params: Type.Object({ customerId: uuid }),
        body: Type.Object({
          requestType: Type.Union(
            ['ACCESS', 'EXPORT', 'CORRECTION', 'ANONYMIZATION', 'RESTRICTION'].map((value) =>
              Type.Literal(value),
            ),
          ),
          reason: Type.String({ minLength: 1, maxLength: 1000 }),
          requesterReference: Type.Optional(Type.String({ maxLength: 500 })),
          assignedMembershipId: Type.Optional(uuid),
          dueAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.privacy.manage');
      if (!active) return forbidden(reply);
      try {
        return reply.code(201).send({
          data: await createCustomerPrivacyRequest(database.db, {
            ...active,
            customerId: (request.params as { customerId: string }).customerId,
            ...(request.body as Omit<
              Parameters<typeof createCustomerPrivacyRequest>[1],
              'organizationId' | 'actorId' | 'customerId'
            >),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/admin/crm/privacy-requests',
    {
      schema: {
        querystring: Type.Object({
          status: Type.Optional(
            Type.Union(
              [
                'OPEN',
                'IDENTITY_VERIFICATION_REQUIRED',
                'IN_PROGRESS',
                'COMPLETED',
                'REJECTED',
                'CANCELLED',
              ].map((value) => Type.Literal(value)),
            ),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.privacy.manage');
      if (!active) return forbidden(reply);
      const query = request.query as {
        status?: Parameters<typeof listCustomerPrivacyRequests>[1]['status'];
        page?: number;
        pageSize?: number;
      };
      return {
        data: await listCustomerPrivacyRequests(database.db, {
          organizationId: active.organizationId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.page ? { page: query.page } : {}),
          ...(query.pageSize ? { pageSize: query.pageSize } : {}),
        }),
      };
    },
  );

  app.patch(
    '/admin/crm/privacy-requests/:requestId',
    {
      schema: {
        params: Type.Object({ requestId: uuid }),
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          status: Type.Union(
            [
              'IDENTITY_VERIFICATION_REQUIRED',
              'IN_PROGRESS',
              'COMPLETED',
              'REJECTED',
              'CANCELLED',
            ].map((value) => Type.Literal(value)),
          ),
          resolutionNotes: Type.String({ minLength: 1, maxLength: 2000 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.privacy.manage');
      if (!active) return forbidden(reply);
      try {
        await updateCustomerPrivacyRequest(database.db, {
          ...active,
          requestId: (request.params as { requestId: string }).requestId,
          ...(request.body as {
            expectedVersion: number;
            status: Parameters<typeof updateCustomerPrivacyRequest>[1]['status'];
            resolutionNotes: string;
          }),
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/crm/privacy-requests/:requestId/export',
    {
      schema: {
        params: Type.Object({ requestId: uuid }),
        body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'customers.privacy.manage');
      if (!active || !active.capabilities.includes('customers.export')) return forbidden(reply);
      try {
        return {
          data: await exportCustomerDataSubjectBundle(database.db, {
            ...active,
            requestId: (request.params as { requestId: string }).requestId,
            reason: (request.body as { reason: string }).reason,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/crm/saved-views', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'customers.view');
    if (!active) return forbidden(reply);
    return { data: await listCustomerSavedViews(database.db, active) };
  });

  app.post(
    '/admin/crm/saved-views',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          visibility: Type.Union([Type.Literal('PERSONAL'), Type.Literal('ORGANIZATION')]),
          filters: Type.Record(Type.String(), Type.Unknown()),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as Omit<
        Parameters<typeof createCustomerSavedView>[1],
        'organizationId' | 'actorId' | 'membershipId'
      >;
      const active = await context(
        database,
        auth,
        request.headers,
        body.visibility === 'ORGANIZATION' ? 'customers.segments.manage' : 'customers.view',
      );
      if (!active) return forbidden(reply);
      try {
        return reply
          .code(201)
          .send({ data: await createCustomerSavedView(database.db, { ...active, ...body }) });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/crm/customers/bulk-actions',
    {
      schema: {
        body: Type.Object({
          customerIds: Type.Array(uuid, { minItems: 1, maxItems: 250 }),
          action: Type.Union(
            ['ADD_TAG', 'REMOVE_TAG', 'ASSIGN_OWNER'].map((value) => Type.Literal(value)),
          ),
          tagId: Type.Optional(uuid),
          ownerMembershipId: Type.Optional(Type.Union([uuid, Type.Null()])),
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as Omit<
        Parameters<typeof applyCustomerBulkAction>[1],
        'organizationId' | 'actorId'
      >;
      const active = await context(
        database,
        auth,
        request.headers,
        body.action === 'ASSIGN_OWNER' ? 'customers.relationship.manage' : 'customers.manage',
      );
      if (!active) return forbidden(reply);
      try {
        return {
          data: await applyCustomerBulkAction(database.db, {
            ...active,
            ...body,
            ...(body.action === 'ASSIGN_OWNER' && body.ownerMembershipId === undefined
              ? { ownerMembershipId: active.membershipId }
              : {}),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
