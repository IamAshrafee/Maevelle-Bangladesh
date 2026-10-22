import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import * as messaging from '@maevelle/database/messaging';
import {
  listNotificationPreferences,
  setNotificationPreference,
} from '@maevelle/database/notifications';

import {
  authenticateMessagingAdmin as requireCapability,
  hasMessagingInboxAccess as hasInboxAccess,
  messagingAccess as access,
  messagingActor as actor,
  parseExpectedVersion as expectedVersion,
  sendMessagingError as fail,
  type MessagingAuth as Auth,
} from './messaging-route-support.js';

const authenticate = requireCapability;

const conversationStatuses = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
type BusinessHoursBody = {
  connectionId?: string | null;
  timezone: string;
  weeklySchedule: Record<string, { start: string; end: string }[]>;
  offlineAcceptsMessages: boolean;
  manualClosureUntil?: string | null;
  exceptions?: {
    localDate: string;
    intervals: { start: string; end: string }[];
    isClosed: boolean;
    label?: string | null;
  }[];
};
type CreateAssignmentRuleBody = {
  name: string;
  position: number;
  isEnabled?: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
};
type UpdateAssignmentRuleBody = {
  name?: string;
  position?: number;
  isEnabled?: boolean;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
};

export function registerOperationalMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  const forbidden = (
    reply: FastifyReply,
    requestId: string,
    message = 'Messaging permission is required.',
  ) => reply.code(403).send({ error: { code: 'FORBIDDEN', message, requestId } });

  app.get('/admin/messaging/inbox/counts', async (request, reply) => {
    const context = await authenticate(database, auth, request.headers);
    if (!context || !hasInboxAccess(context))
      return forbidden(reply, request.id, 'Messaging inbox access is required.');
    return {
      data: await messaging.getInboxCounts(database.db, {
        organizationId: context.organizationId,
        membershipId: context.membershipId,
        access: access(context),
      }),
    };
  });

  app.get('/admin/messaging/agents/eligible', async (request, reply) => {
    const context = await authenticate(
      database,
      auth,
      request.headers,
      'messaging.availability.view',
    );
    if (!context) return forbidden(reply, request.id);
    return { data: await messaging.listEligibleAgents(database.db, context.organizationId) };
  });

  app.get('/admin/messaging/availability/me', async (request, reply) => {
    const context = await authenticate(database, auth, request.headers);
    if (!context) return forbidden(reply, request.id);
    const agents = await messaging.listEligibleAgents(database.db, context.organizationId);
    return { data: agents.find((item) => item.membershipId === context.membershipId) ?? null };
  });

  app.patch(
    '/admin/messaging/availability/me',
    {
      schema: {
        body: Type.Object({
          status: Type.Union(
            ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE'].map((value) => Type.Literal(value)),
          ),
          capacity: Type.Integer({ minimum: 0, maximum: 100 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.setAgentAvailability(database.db, {
            actor: actor(context),
            ...(request.body as {
              status: 'ONLINE' | 'BUSY' | 'AWAY' | 'OFFLINE';
              capacity: number;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post('/admin/messaging/availability/me/heartbeat', async (request, reply) => {
    const context = await authenticate(database, auth, request.headers);
    if (!context) return forbidden(reply, request.id);
    await messaging.heartbeatAgentAvailability(database.db, actor(context));
    return reply.code(204).send();
  });

  app.patch(
    '/admin/messaging/conversations/:conversationId/assignment',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          assigneeMembershipId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
          reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.assign');
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      const params = request.params as { conversationId: string };
      const body = request.body as { assigneeMembershipId: string | null; reason?: string };
      try {
        return {
          data: await messaging.assignConversation(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: params.conversationId,
            assigneeMembershipId: body.assigneeMembershipId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(body.reason ? { reason: body.reason } : {}),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/assignment-history',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.listAssignmentHistory(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.patch(
    '/admin/messaging/conversations/:conversationId/priority',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          priority: Type.Union(
            ['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => Type.Literal(value)),
          ),
          isStarred: Type.Optional(Type.Boolean()),
          reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.priority.manage',
      );
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      const body = request.body as {
        priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
        isStarred?: boolean;
        reason?: string;
      };
      try {
        return {
          data: await messaging.setConversationPriority(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...body,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/notes',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.listInternalNotes(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/conversations/:conversationId/notes',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ body: Type.String({ minLength: 1, maxLength: 10000 }) }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.notes.create');
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return reply.code(201).send({
          data: await messaging.createInternalNote(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            body: (request.body as { body: string }).body,
          }),
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.patch(
    '/admin/messaging/notes/:noteId',
    {
      schema: {
        params: Type.Object({ noteId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          body: Type.String({ minLength: 1, maxLength: 10000 }),
          revision: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.notes.create');
      if (!context) return forbidden(reply, request.id);
      const body = request.body as { body: string; revision: number };
      try {
        return {
          data: await messaging.updateInternalNote(database.db, {
            actor: actor(context),
            noteId: (request.params as { noteId: string }).noteId,
            body: body.body,
            expectedRevision: body.revision,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.delete(
    '/admin/messaging/notes/:noteId',
    {
      schema: {
        params: Type.Object({ noteId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.notes.create');
      if (!context) return forbidden(reply, request.id);
      try {
        await messaging.deleteInternalNote(database.db, {
          actor: actor(context),
          noteId: (request.params as { noteId: string }).noteId,
          reason: (request.body as { reason: string }).reason,
        });
        return reply.code(204).send();
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get('/admin/messaging/tags', async (request, reply) => {
    const context = await authenticate(database, auth, request.headers);
    if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
    return {
      data: await messaging.listMessagingTags(
        database.db,
        context.organizationId,
        (request.query as { includeArchived?: boolean }).includeArchived ?? false,
      ),
    };
  });
  app.post(
    '/admin/messaging/tags',
    {
      schema: {
        body: Type.Object({
          label: Type.String({ minLength: 1, maxLength: 80 }),
          colorToken: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.tags.manage');
      if (!context) return forbidden(reply, request.id);
      try {
        return reply.code(201).send({
          data: await messaging.createMessagingTag(database.db, {
            actor: actor(context),
            ...(request.body as { label: string; colorToken?: string }),
          }),
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/tags/:tagId',
    {
      schema: {
        params: Type.Object({ tagId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          label: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
          colorToken: Type.Optional(
            Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
          ),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.tags.manage');
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.updateMessagingTag(database.db, {
            actor: actor(context),
            tagId: (request.params as { tagId: string }).tagId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(request.body as object),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  const tagAssignment = async (request: FastifyRequest, reply: FastifyReply, assigned: boolean) => {
    const context = await authenticate(database, auth, request.headers, 'messaging.tags.manage');
    if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
    try {
      await messaging.setConversationTag(database.db, {
        actor: actor(context),
        access: access(context),
        conversationId: (request.params as { conversationId: string; tagId: string })
          .conversationId,
        tagId: (request.params as { conversationId: string; tagId: string }).tagId,
        assigned,
      });
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error, request.id);
    }
  };
  app.post(
    '/admin/messaging/conversations/:conversationId/tags/:tagId',
    {
      schema: {
        params: Type.Object({
          conversationId: Type.String({ format: 'uuid' }),
          tagId: Type.String({ format: 'uuid' }),
        }),
      },
    },
    (request, reply) => tagAssignment(request, reply, true),
  );
  app.delete(
    '/admin/messaging/conversations/:conversationId/tags/:tagId',
    {
      schema: {
        params: Type.Object({
          conversationId: Type.String({ format: 'uuid' }),
          tagId: Type.String({ format: 'uuid' }),
        }),
      },
    },
    (request, reply) => tagAssignment(request, reply, false),
  );

  app.get(
    '/admin/messaging/saved-replies',
    {
      schema: {
        querystring: Type.Object({
          query: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          includeArchived: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.saved_replies.use',
      );
      if (!context) return forbidden(reply, request.id);
      return {
        data: await messaging.listSavedReplies(database.db, {
          organizationId: context.organizationId,
          ...(request.query as { query?: string; includeArchived?: boolean; limit?: number }),
        }),
      };
    },
  );
  app.post(
    '/admin/messaging/saved-replies',
    {
      schema: {
        body: Type.Object({
          title: Type.String({ minLength: 1, maxLength: 160 }),
          body: Type.String({ minLength: 1, maxLength: 10000 }),
          shortcut: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
          category: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.saved_replies.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return reply.code(201).send({
          data: await messaging.createSavedReply(database.db, {
            actor: actor(context),
            ...(request.body as {
              title: string;
              body: string;
              shortcut?: string;
              category?: string;
            }),
          }),
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/saved-replies/:savedReplyId',
    {
      schema: {
        params: Type.Object({ savedReplyId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          title: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
          body: Type.Optional(Type.String({ minLength: 1, maxLength: 10000 })),
          shortcut: Type.Optional(
            Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
          ),
          category: Type.Optional(
            Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
          ),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.saved_replies.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.updateSavedReply(database.db, {
            actor: actor(context),
            savedReplyId: (request.params as { savedReplyId: string }).savedReplyId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(request.body as object),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/follow-ups',
    {
      schema: {
        querystring: Type.Object({
          conversationId: Type.Optional(Type.String({ format: 'uuid' })),
          status: Type.Optional(
            Type.Union(['PENDING', 'COMPLETED', 'CANCELLED'].map((value) => Type.Literal(value))),
          ),
          mine: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.follow_ups.manage',
      );
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.listFollowUps(database.db, {
            actor: actor(context),
            access: access(context),
            ...(request.query as {
              conversationId?: string;
              status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
              mine?: boolean;
              limit?: number;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.post(
    '/admin/messaging/conversations/:conversationId/follow-ups',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          responsibleMembershipId: Type.String({ format: 'uuid' }),
          dueAt: Type.String({ format: 'date-time' }),
          note: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.follow_ups.manage',
      );
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return reply.code(201).send({
          data: await messaging.createFollowUp(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            ...(request.body as {
              responsibleMembershipId: string;
              dueAt: string;
              note?: string;
            }),
          }),
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/follow-ups/:followUpId/status',
    {
      schema: {
        params: Type.Object({ followUpId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          status: Type.Union([Type.Literal('COMPLETED'), Type.Literal('CANCELLED')]),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.follow_ups.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.transitionFollowUp(database.db, {
            actor: actor(context),
            followUpId: (request.params as { followUpId: string }).followUpId,
            status: (request.body as { status: 'COMPLETED' | 'CANCELLED' }).status,
            expectedVersion: expectedVersion(request.headers['if-match']),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/follow-ups/:followUpId',
    {
      schema: {
        params: Type.Object({ followUpId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          responsibleMembershipId: Type.String({ format: 'uuid' }),
          dueAt: Type.String({ format: 'date-time' }),
          note: Type.Optional(
            Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.follow_ups.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.updateFollowUp(database.db, {
            actor: actor(context),
            followUpId: (request.params as { followUpId: string }).followUpId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(request.body as {
              responsibleMembershipId: string;
              dueAt: string;
              note?: string | null;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/conversations/bulk',
    {
      schema: {
        body: Type.Object({
          items: Type.Array(
            Type.Object({
              conversationId: Type.String({ format: 'uuid' }),
              version: Type.String({ pattern: '^[0-9]+$' }),
            }),
            { minItems: 1, maxItems: 100 },
          ),
          action: Type.Union([
            Type.Object({
              type: Type.Literal('ASSIGN'),
              assigneeMembershipId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
              reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
            }),
            Type.Object({
              type: Type.Literal('PRIORITY'),
              priority: Type.Union(
                ['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => Type.Literal(value)),
              ),
              isStarred: Type.Optional(Type.Boolean()),
            }),
            Type.Object({
              type: Type.Literal('STATUS'),
              status: Type.Union(conversationStatuses.map((value) => Type.Literal(value))),
              reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
            }),
            Type.Object({
              type: Type.Literal('TAG'),
              tagId: Type.String({ format: 'uuid' }),
              assigned: Type.Boolean(),
            }),
          ]),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      const body = request.body as Parameters<typeof messaging.bulkUpdateConversations>[1];
      const needed =
        body.action.type === 'ASSIGN'
          ? 'messaging.assign'
          : body.action.type === 'PRIORITY'
            ? 'messaging.priority.manage'
            : body.action.type === 'STATUS'
              ? 'messaging.status.manage'
              : 'messaging.tags.manage';
      if (!context.capabilities.includes(needed))
        return forbidden(reply, request.id, `${needed} permission is required.`);
      try {
        return {
          data: await messaging.bulkUpdateConversations(database.db, {
            actor: actor(context),
            access: access(context),
            items: body.items,
            action: body.action,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/timeline',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      const limit = (request.query as { limit?: number }).limit;
      try {
        return {
          data: await messaging.listConversationActivity(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            ...(limit ? { limit } : {}),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get(
    '/admin/messaging/conversations/:conversationId/customer-context',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.customer_context.view',
      );
      if (!context || !hasInboxAccess(context)) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.getConversationCustomerContext(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get(
    '/admin/messaging/contacts',
    {
      schema: {
        querystring: Type.Object({
          query: Type.String({ minLength: 2, maxLength: 120 }),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.contacts.search',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.searchMessagingContacts(database.db, {
            organizationId: context.organizationId,
            ...(request.query as { query: string; limit?: number }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.post(
    '/admin/messaging/contacts/:contactId/customer-link',
    {
      schema: {
        params: Type.Object({ contactId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          customerId: Type.String({ format: 'uuid' }),
          method: Type.Union(
            ['VERIFIED_EMAIL', 'VERIFIED_PHONE', 'STAFF_REVIEW'].map((value) =>
              Type.Literal(value),
            ),
          ),
          evidenceReference: Type.Optional(Type.String({ maxLength: 500 })),
          reason: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.customer_link.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.linkMessagingContactToCustomer(database.db, {
            actor: actor(context),
            contactId: (request.params as { contactId: string }).contactId,
            ...(request.body as {
              customerId: string;
              method: 'VERIFIED_EMAIL' | 'VERIFIED_PHONE' | 'STAFF_REVIEW';
              evidenceReference?: string;
              reason: string;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.delete(
    '/admin/messaging/contacts/:contactId/customer-link',
    {
      schema: {
        params: Type.Object({ contactId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.customer_link.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.unlinkMessagingContactFromCustomer(database.db, {
            actor: actor(context),
            contactId: (request.params as { contactId: string }).contactId,
            reason: (request.body as { reason: string }).reason,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/settings/business-hours',
    {
      schema: {
        querystring: Type.Object({ connectionId: Type.Optional(Type.String({ format: 'uuid' })) }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      return {
        data: await messaging.getBusinessHours(database.db, {
          organizationId: context.organizationId,
          connectionId: (request.query as { connectionId?: string }).connectionId ?? null,
        }),
      };
    },
  );
  app.get(
    '/admin/messaging/settings/channel',
    { schema: { querystring: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.getChannelSettings(database.db, {
            organizationId: context.organizationId,
            connectionId: (request.query as { connectionId: string }).connectionId,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get('/admin/messaging/settings/channels', async (request, reply) => {
    const context = await authenticate(
      database,
      auth,
      request.headers,
      'messaging.settings.manage',
    );
    if (!context) return forbidden(reply, request.id);
    return {
      data: await messaging.listChannelSettings(database.db, context.organizationId),
    };
  });
  app.patch(
    '/admin/messaging/settings/channel/:connectionId',
    {
      schema: {
        params: Type.Object({ connectionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          enabled: Type.Boolean(),
          acceptsOfflineMessages: Type.Boolean(),
          greeting: Type.String({ minLength: 1, maxLength: 240 }),
          offlineMessage: Type.String({ minLength: 1, maxLength: 500 }),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.updateChannelSettings(database.db, {
            actor: actor(context),
            connectionId: (request.params as { connectionId: string }).connectionId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(request.body as {
              enabled: boolean;
              acceptsOfflineMessages: boolean;
              greeting: string;
              offlineMessage: string;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/settings/business-hours',
    {
      schema: {
        body: Type.Object({
          connectionId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
          timezone: Type.String({ minLength: 1, maxLength: 100 }),
          weeklySchedule: Type.Record(
            Type.String(),
            Type.Array(Type.Object({ start: Type.String(), end: Type.String() }), { maxItems: 4 }),
          ),
          offlineAcceptsMessages: Type.Boolean(),
          manualClosureUntil: Type.Optional(
            Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
          ),
          exceptions: Type.Optional(
            Type.Array(
              Type.Object({
                localDate: Type.String({ format: 'date' }),
                intervals: Type.Array(Type.Object({ start: Type.String(), end: Type.String() }), {
                  maxItems: 4,
                }),
                isClosed: Type.Boolean(),
                label: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
              }),
              { maxItems: 366 },
            ),
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        const version =
          typeof request.headers['if-match'] === 'string'
            ? expectedVersion(request.headers['if-match'])
            : undefined;
        return {
          data: await messaging.upsertBusinessHours(database.db, {
            actor: actor(context),
            ...(version ? { expectedVersion: version } : {}),
            ...(request.body as BusinessHoursBody),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get('/admin/messaging/settings/assignment-rules', async (request, reply) => {
    const context = await authenticate(
      database,
      auth,
      request.headers,
      'messaging.settings.manage',
    );
    if (!context) return forbidden(reply, request.id);
    return { data: await messaging.listAssignmentRules(database.db, context.organizationId) };
  });
  app.post(
    '/admin/messaging/settings/assignment-rules',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 160 }),
          position: Type.Integer({ minimum: 0 }),
          isEnabled: Type.Optional(Type.Boolean()),
          conditions: Type.Record(Type.String(), Type.Unknown()),
          actions: Type.Record(Type.String(), Type.Unknown()),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return reply.code(201).send({
          data: await messaging.createAssignmentRule(database.db, {
            actor: actor(context),
            ...(request.body as CreateAssignmentRuleBody),
          }),
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.patch(
    '/admin/messaging/settings/assignment-rules/:ruleId',
    {
      schema: {
        params: Type.Object({ ruleId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          isEnabled: Type.Optional(Type.Boolean()),
          conditions: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          actions: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.settings.manage',
      );
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.updateAssignmentRule(database.db, {
            actor: actor(context),
            ruleId: (request.params as { ruleId: string }).ruleId,
            expectedVersion: expectedVersion(request.headers['if-match']),
            ...(request.body as UpdateAssignmentRuleBody),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get(
    '/admin/messaging/reports/summary',
    {
      schema: {
        querystring: Type.Object({
          from: Type.String({ format: 'date-time' }),
          to: Type.String({ format: 'date-time' }),
          channelKind: Type.Optional(
            Type.Union(['WEBSITE', 'FACEBOOK', 'INSTAGRAM'].map((value) => Type.Literal(value))),
          ),
          assigneeMembershipId: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.reports.view');
      if (!context) return forbidden(reply, request.id);
      try {
        return {
          data: await messaging.getMessagingReportSummary(database.db, {
            organizationId: context.organizationId,
            ...(request.query as {
              from: string;
              to: string;
              channelKind?: 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';
              assigneeMembershipId?: string;
            }),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
  app.get('/admin/messaging/notification-preferences', async (request, reply) => {
    const context = await authenticate(database, auth, request.headers);
    if (!context) return forbidden(reply, request.id);
    const rows = await listNotificationPreferences(database.db, {
      organizationId: context.organizationId,
      recipientType: 'MEMBERSHIP',
      recipientId: context.membershipId,
    });
    return { data: rows.filter((item) => item.notification_type.startsWith('MESSAGING_')) };
  });
  app.patch(
    '/admin/messaging/notification-preferences',
    {
      schema: {
        body: Type.Object({
          notificationType: Type.Union([
            Type.Literal('MESSAGING_ASSIGNMENT'),
            Type.Literal('MESSAGING_FOLLOW_UP_DUE'),
          ]),
          enabled: Type.Boolean(),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context) return forbidden(reply, request.id);
      const body = request.body as {
        notificationType: 'MESSAGING_ASSIGNMENT' | 'MESSAGING_FOLLOW_UP_DUE';
        enabled: boolean;
      };
      try {
        await setNotificationPreference(database.db, {
          organizationId: context.organizationId,
          recipientType: 'MEMBERSHIP',
          recipientId: context.membershipId,
          notificationType: body.notificationType,
          channel: 'IN_APP',
          enabled: body.enabled,
        });
        return reply.code(204).send();
      } catch {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Messaging notification preference could not be updated.',
            requestId: request.id,
          },
        });
      }
    },
  );
}
