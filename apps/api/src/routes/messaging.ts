import type { FastifyInstance, FastifyReply } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import * as messaging from '@maevelle/database/messaging';
import { findActiveAdminContext, type AdminContextRecord } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const conversationStatuses = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

function requestHeaders(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function authenticate(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  required?: string,
): Promise<(AdminContextRecord & { actorId: string }) | undefined> {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return;
  const selected = headers['x-organization-id'];
  const context = await findActiveAdminContext(database.db, session.user.id, {
    ...(typeof selected === 'string' ? { organizationId: selected } : {}),
    ...(required ? { requiredCapability: required } : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function access(context: AdminContextRecord): messaging.ConversationAccess {
  return context.capabilities.includes('messaging.inbox.view_all') ? 'ALL' : 'ASSIGNED';
}

function hasInboxAccess(context: AdminContextRecord): boolean {
  return context.capabilities.some(
    (capability) =>
      capability === 'messaging.inbox.view_assigned' || capability === 'messaging.inbox.view_all',
  );
}

function fail(reply: FastifyReply, error: unknown, requestId: string) {
  if (!(error instanceof messaging.MessagingDomainError)) throw error;
  const status =
    error.code === 'CONVERSATION_NOT_FOUND'
      ? 404
      : error.code === 'EVENT_CURSOR_EXPIRED'
        ? 410
        : error.code === 'VALIDATION_FAILED'
          ? 400
          : [
                'STALE_VERSION',
                'ASSIGNMENT_CONFLICT',
                'CONVERSATION_CLOSED',
                'IDEMPOTENCY_IN_PROGRESS',
              ].includes(error.code)
            ? 409
            : error.code === 'CONNECTION_UNAVAILABLE'
              ? 503
              : 422;
  return reply.code(status).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  });
}

function expectedVersion(value: string | string[] | undefined): string {
  if (typeof value !== 'string')
    throw new messaging.MessagingDomainError('VALIDATION_FAILED', 'If-Match is required.');
  const version = value.replace(/^W\//, '').replaceAll('"', '');
  if (!/^\d+$/.test(version))
    throw new messaging.MessagingDomainError(
      'VALIDATION_FAILED',
      'If-Match must contain a quoted numeric version.',
    );
  return version;
}

function actor(context: AdminContextRecord & { actorId: string }): messaging.MessagingActorContext {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    membershipId: context.membershipId,
    capabilities: context.capabilities,
  };
}

export function registerMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  const activeByMembership = new Map<string, number>();
  const controllers = new Set<AbortController>();
  app.addHook('onClose', async () => {
    for (const controller of controllers) controller.abort();
  });
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/admin/messaging/')) return;
    const session = await auth.api.getSession({ headers: requestHeaders(request.headers) });
    if (!session?.user?.id)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required.',
          requestId: request.id,
        },
      });
  });

  app.get(
    '/admin/messaging/conversations',
    {
      schema: {
        querystring: Type.Object({
          scope: Type.Optional(
            Type.Union([Type.Literal('mine'), Type.Literal('unassigned'), Type.Literal('all')]),
          ),
          status: Type.Optional(
            Type.Union(conversationStatuses.map((value) => Type.Literal(value))),
          ),
          channelKind: Type.Optional(
            Type.Union([
              Type.Literal('WEBSITE'),
              Type.Literal('FACEBOOK'),
              Type.Literal('INSTAGRAM'),
            ]),
          ),
          search: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          sort: Type.Optional(Type.Union([Type.Literal('newest'), Type.Literal('oldest')])),
          cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging inbox access is required.',
            requestId: request.id,
          },
        });
      const query = request.query as {
        scope?: 'mine' | 'unassigned' | 'all';
        status?: (typeof conversationStatuses)[number];
        channelKind?: 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';
        search?: string;
        sort?: 'newest' | 'oldest';
        cursor?: string;
        limit?: number;
      };
      if (query.scope === 'all' && access(context) !== 'ALL')
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'All-conversation access is required.',
            requestId: request.id,
          },
        });
      try {
        return await messaging.listConversations(database.db, {
          organizationId: context.organizationId,
          membershipId: context.membershipId,
          access: access(context),
          ...query,
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging inbox access is required.',
            requestId: request.id,
          },
        });
      try {
        return {
          data: await messaging.getConversation(database.db, {
            organizationId: context.organizationId,
            conversationId: (request.params as { conversationId: string }).conversationId,
            membershipId: context.membershipId,
            access: access(context),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/admin/messaging/conversations/:conversationId/messages',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({
          before: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging inbox access is required.',
            requestId: request.id,
          },
        });
      const params = request.params as { conversationId: string };
      const query = request.query as { before?: string; limit?: number };
      try {
        return await messaging.listMessages(database.db, {
          organizationId: context.organizationId,
          conversationId: params.conversationId,
          membershipId: context.membershipId,
          access: access(context),
          ...query,
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/conversations/:conversationId/messages',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          clientMessageId: Type.String({ minLength: 1, maxLength: 160 }),
          text: Type.String({ minLength: 1, maxLength: 10_000 }),
          attachmentIds: Type.Optional(
            Type.Array(Type.String({ format: 'uuid' }), { maxItems: 10 }),
          ),
          replyToMessageId: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.reply');
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging reply access is required.',
            requestId: request.id,
          },
        });
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 200)
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'A valid Idempotency-Key header is required.',
            requestId: request.id,
          },
        });
      const params = request.params as { conversationId: string };
      const body = request.body as {
        clientMessageId: string;
        text: string;
        attachmentIds?: string[];
        replyToMessageId?: string;
      };
      if (body.attachmentIds?.length)
        return reply.code(422).send({
          error: {
            code: 'ATTACHMENT_REJECTED',
            message: 'Website attachment processing is introduced in Phase 02.',
            requestId: request.id,
          },
        });
      try {
        const result = await messaging.prepareOutboundMessage(database.db, {
          actor: actor(context),
          access: access(context),
          conversationId: params.conversationId,
          idempotencyKey: key,
          clientMessageId: body.clientMessageId,
          text: body.text,
          ...(body.replyToMessageId ? { replyToMessageId: body.replyToMessageId } : {}),
          requestId: request.id,
        });
        return reply.code(result.replayed ? 200 : 202).send({ data: result.message });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/conversations/:conversationId/read',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ lastReadSequence: Type.String({ pattern: '^[0-9]+$' }) }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging inbox access is required.',
            requestId: request.id,
          },
        });
      try {
        return {
          data: await messaging.markConversationRead(database.db, {
            organizationId: context.organizationId,
            conversationId: (request.params as { conversationId: string }).conversationId,
            membershipId: context.membershipId,
            access: access(context),
            lastReadSequence: (request.body as { lastReadSequence: string }).lastReadSequence,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/admin/messaging/conversations/:conversationId/claim',
    { schema: { params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const context = await authenticate(database, auth, request.headers, 'messaging.claim');
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging claim access is required.',
            requestId: request.id,
          },
        });
      try {
        return {
          data: await messaging.claimConversation(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            expectedVersion: expectedVersion(request.headers['if-match']),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.patch(
    '/admin/messaging/conversations/:conversationId/status',
    {
      schema: {
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          status: Type.Union(conversationStatuses.map((value) => Type.Literal(value))),
          reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const context = await authenticate(
        database,
        auth,
        request.headers,
        'messaging.status.manage',
      );
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging status access is required.',
            requestId: request.id,
          },
        });
      const body = request.body as {
        status: (typeof conversationStatuses)[number];
        reason?: string;
      };
      try {
        return {
          data: await messaging.transitionConversation(database.db, {
            actor: actor(context),
            access: access(context),
            conversationId: (request.params as { conversationId: string }).conversationId,
            status: body.status,
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
    '/admin/messaging/events',
    {
      schema: {
        querystring: Type.Object({ cursor: Type.Optional(Type.String({ pattern: '^[0-9]+$' })) }),
      },
    },
    async (request, reply) => {
      let context = await authenticate(database, auth, request.headers);
      if (!context || !hasInboxAccess(context))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Messaging inbox access is required.',
            requestId: request.id,
          },
        });
      const current = activeByMembership.get(context.membershipId) ?? 0;
      if (current >= 3)
        return reply.code(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many active messaging event streams.',
            requestId: request.id,
          },
        });
      const query = request.query as { cursor?: string };
      let cursor =
        query.cursor ??
        (typeof request.headers['last-event-id'] === 'string'
          ? request.headers['last-event-id']
          : '0');
      try {
        await messaging.listRealtimeEvents(database.db, {
          organizationId: context.organizationId,
          membershipId: context.membershipId,
          access: access(context),
          after: cursor,
          limit: 1,
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
      const controller = new AbortController();
      controllers.add(controller);
      activeByMembership.set(context.membershipId, current + 1);
      request.raw.once('close', () => controller.abort());
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      reply.raw.write('retry: 3000\n\n');
      const started = Date.now();
      let heartbeat = 0;
      let revalidate = Date.now() + 30_000;
      try {
        while (!controller.signal.aborted && Date.now() - started < 30 * 60_000) {
          if (Date.now() >= revalidate) {
            const refreshed = await authenticate(database, auth, request.headers);
            if (
              !refreshed ||
              refreshed.organizationId !== context.organizationId ||
              !hasInboxAccess(refreshed)
            )
              break;
            context = refreshed;
            revalidate = Date.now() + 30_000;
          }
          const events = await messaging.listRealtimeEvents(database.db, {
            organizationId: context.organizationId,
            membershipId: context.membershipId,
            access: access(context),
            after: cursor,
            limit: 100,
          });
          for (const event of events) {
            if (
              !reply.raw.write(
                `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
              )
            ) {
              controller.abort();
              break;
            }
            cursor = event.cursor;
          }
          if (Date.now() - heartbeat >= 15_000) {
            reply.raw.write(': keepalive\n\n');
            heartbeat = Date.now();
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1000);
            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }
      } catch (error) {
        request.log.warn(
          {
            err: error,
            organizationId: context.organizationId,
            membershipId: context.membershipId,
          },
          'Messaging event stream closed after an error.',
        );
      } finally {
        controllers.delete(controller);
        activeByMembership.set(
          context.membershipId,
          Math.max(0, (activeByMembership.get(context.membershipId) ?? 1) - 1),
        );
        if (!reply.raw.destroyed) reply.raw.end();
      }
    },
  );
}
