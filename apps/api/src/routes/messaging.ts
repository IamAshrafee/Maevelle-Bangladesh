import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  completeMediaUploadSession,
  createMediaUploadSession,
  findStaffMediaAssetStatus,
  getMediaUploadSession,
  MediaDomainError,
} from '@maevelle/database/media';
import * as messaging from '@maevelle/database/messaging';
import {
  createMediaObjectKey,
  type ObjectStoragePort,
} from '@maevelle/media';

import { storeLocalMediaUpload } from './media-upload-stream.js';
import { registerOperationalMessagingRoutes } from './messaging-operations.js';
import {
  authenticateMessagingAdmin as requireCapability,
  hasMessagingInboxAccess as hasInboxAccess,
  messagingAccess as access,
  messagingActor as actor,
  messagingRequestHeaders as requestHeaders,
  parseExpectedVersion as expectedVersion,
  sendMessagingError as fail,
  type MessagingAuth as Auth,
} from './messaging-route-support.js';

const authenticate = requireCapability;

const conversationStatuses = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
const STAFF_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const staffAttachmentMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

function sendUploadError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof MediaDomainError)) throw error;
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  storage?: ObjectStoragePort,
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

  registerOperationalMessagingRoutes(app, database, auth);

  if (storage) {
    app.post(
      '/admin/messaging/conversations/:conversationId/uploads',
      {
        schema: {
          params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
          body: Type.Object({
            fileName: Type.String({ minLength: 1, maxLength: 255 }),
            mimeType: Type.Union(staffAttachmentMimeTypes.map((value) => Type.Literal(value))),
            byteSize: Type.Integer({ minimum: 1, maximum: STAFF_ATTACHMENT_MAX_BYTES }),
          }),
        },
      },
      async (request, reply) => {
        const context = await authenticate(database, auth, request.headers, 'messaging.reply');
        if (!context || !hasInboxAccess(context))
          return reply.code(403).send({
            error: { code: 'FORBIDDEN', message: 'Messaging reply access is required.' },
          });
        try {
          const conversationId = (request.params as { conversationId: string }).conversationId;
          const conversation = await messaging.getConversation(database.db, {
            organizationId: context.organizationId,
            conversationId,
            membershipId: context.membershipId,
            access: access(context),
          });
          if (!conversation.capabilities.attachments)
            throw new messaging.MessagingDomainError(
              'VALIDATION_FAILED',
              'This channel does not support image attachments.',
            );
          const body = request.body as {
            fileName: string;
            mimeType: (typeof staffAttachmentMimeTypes)[number];
            byteSize: number;
          };
          const expiresAt = new Date(Date.now() + 15 * 60_000);
          const session = await createMediaUploadSession(database.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            uploadSource: 'ADMIN_UPLOAD',
            originalFilename: body.fileName,
            declaredMimeType: body.mimeType,
            declaredByteSize: body.byteSize,
            visibility: 'PRIVATE',
            storageProvider: storage.provider,
            bucket: storage.privateBucket,
            objectKey: (assetId, extension) =>
              createMediaObjectKey({
                organizationId: context.organizationId,
                assetId,
                extension,
                purpose: 'original',
              }),
            expiresAt,
            maximumBytes: STAFF_ATTACHMENT_MAX_BYTES,
          });
          await messaging.registerStaffAttachmentUpload(database.db, {
            organizationId: context.organizationId,
            conversationId,
            actorId: context.actorId,
            mediaAssetId: session.assetId,
            mediaUploadSessionId: session.id,
            expiresAt,
          });
          const authorization = await storage.createSignedUpload(
            { provider: session.provider, bucket: session.bucket, key: session.objectKey },
            { contentType: session.mimeType, expiresInSeconds: 15 * 60 },
          );
          return reply.code(201).send({
            data: {
              assetId: session.assetId,
              sessionId: session.id,
              status: 'PENDING_UPLOAD',
              upload: {
                ...authorization,
                ...(authorization.strategy === 'API_PROXY'
                  ? {
                      url: `/api/admin/messaging/conversations/${conversationId}/uploads/${session.id}/content`,
                      headers: { 'content-type': 'application/x-maevelle-media-upload' },
                    }
                  : {}),
              },
            },
          });
        } catch (error) {
          if (error instanceof messaging.MessagingDomainError)
            return fail(reply, error, request.id);
          return sendUploadError(reply, error);
        }
      },
    );

    app.put(
      '/admin/messaging/conversations/:conversationId/uploads/:sessionId/content',
      {
        bodyLimit: STAFF_ATTACHMENT_MAX_BYTES,
        schema: {
          params: Type.Object({
            conversationId: Type.String({ format: 'uuid' }),
            sessionId: Type.String({ format: 'uuid' }),
          }),
        },
      },
      async (request, reply) => {
        const context = await authenticate(database, auth, request.headers, 'messaging.reply');
        if (!context || !hasInboxAccess(context))
          return reply.code(403).send({
            error: { code: 'FORBIDDEN', message: 'Messaging reply access is required.' },
          });
        if (storage.provider !== 'local')
          return reply
            .code(404)
            .send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
        try {
          const params = request.params as { conversationId: string; sessionId: string };
          await messaging.getConversation(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            membershipId: context.membershipId,
            access: access(context),
          });
          const session = await getMediaUploadSession(database.db, {
            organizationId: context.organizationId,
            sessionId: params.sessionId,
            actorId: context.actorId,
          });
          if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
          await messaging.assertStaffAttachmentUploadAccess(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            actorId: context.actorId,
            mediaUploadSessionId: session.id,
          });
          if (session.status !== 'PENDING')
            throw new MediaDomainError('CONFLICT', 'Upload session is not open.');
          await storeLocalMediaUpload(storage, request.body, session);
          return reply.code(204).send();
        } catch (error) {
          if (error instanceof messaging.MessagingDomainError)
            return fail(reply, error, request.id);
          return sendUploadError(reply, error);
        }
      },
    );

    app.post(
      '/admin/messaging/conversations/:conversationId/uploads/:sessionId/complete',
      {
        schema: {
          params: Type.Object({
            conversationId: Type.String({ format: 'uuid' }),
            sessionId: Type.String({ format: 'uuid' }),
          }),
        },
      },
      async (request, reply) => {
        const context = await authenticate(database, auth, request.headers, 'messaging.reply');
        if (!context || !hasInboxAccess(context))
          return reply.code(403).send({
            error: { code: 'FORBIDDEN', message: 'Messaging reply access is required.' },
          });
        try {
          const params = request.params as { conversationId: string; sessionId: string };
          await messaging.getConversation(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            membershipId: context.membershipId,
            access: access(context),
          });
          const session = await getMediaUploadSession(database.db, {
            organizationId: context.organizationId,
            sessionId: params.sessionId,
            actorId: context.actorId,
          });
          if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
          await messaging.assertStaffAttachmentUploadAccess(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            actorId: context.actorId,
            mediaUploadSessionId: session.id,
          });
          const object = await storage.head({
            provider: session.provider,
            bucket: session.bucket,
            key: session.objectKey,
          });
          if (!object)
            throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Uploaded object does not exist.');
          const result = await completeMediaUploadSession(database.db, {
            organizationId: context.organizationId,
            sessionId: session.id,
            actualByteSize: object.byteSize,
            actualContentType: object.contentType,
            checksumSha256: object.checksumSha256,
          });
          return reply.code(202).send({
            data: {
              assetId: result.assetId,
              sessionId: session.id,
              status: 'PROCESSING',
            },
          });
        } catch (error) {
          if (error instanceof messaging.MessagingDomainError)
            return fail(reply, error, request.id);
          return sendUploadError(reply, error);
        }
      },
    );

    app.get(
      '/admin/messaging/conversations/:conversationId/uploads/:assetId',
      {
        schema: {
          params: Type.Object({
            conversationId: Type.String({ format: 'uuid' }),
            assetId: Type.String({ format: 'uuid' }),
          }),
        },
      },
      async (request, reply) => {
        const context = await authenticate(database, auth, request.headers, 'messaging.reply');
        if (!context || !hasInboxAccess(context))
          return reply.code(403).send({
            error: { code: 'FORBIDDEN', message: 'Messaging reply access is required.' },
          });
        try {
          const params = request.params as { conversationId: string; assetId: string };
          await messaging.getConversation(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            membershipId: context.membershipId,
            access: access(context),
          });
          const asset = await findStaffMediaAssetStatus(database.db, {
            organizationId: context.organizationId,
            assetId: params.assetId,
            actorId: context.actorId,
          });
          if (!asset) throw new MediaDomainError('NOT_FOUND', 'Attachment was not found.');
          await messaging.assertStaffAttachmentUploadAccess(database.db, {
            organizationId: context.organizationId,
            conversationId: params.conversationId,
            actorId: context.actorId,
            mediaAssetId: params.assetId,
          });
          const status =
            asset.status === 'READY'
              ? 'AVAILABLE'
              : ['FAILED', 'QUARANTINED', 'TRASHED', 'PURGING'].includes(asset.status)
                ? 'REJECTED'
                : 'PROCESSING';
          return {
            data: {
              assetId: params.assetId,
              sessionId: '',
              status,
              errorMessage: asset.errorMessage,
            },
          };
        } catch (error) {
          if (error instanceof messaging.MessagingDomainError)
            return fail(reply, error, request.id);
          return sendUploadError(reply, error);
        }
      },
    );
  }

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
          priority: Type.Optional(
            Type.Union(['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => Type.Literal(value))),
          ),
          assignedMembershipId: Type.Optional(Type.String({ format: 'uuid' })),
          tagId: Type.Optional(Type.String({ format: 'uuid' })),
          unread: Type.Optional(Type.Boolean()),
          starred: Type.Optional(Type.Boolean()),
          needsReply: Type.Optional(Type.Boolean()),
          followUp: Type.Optional(
            Type.Union([Type.Literal('pending'), Type.Literal('overdue'), Type.Literal('none')]),
          ),
          createdFrom: Type.Optional(Type.String({ format: 'date-time' })),
          createdTo: Type.Optional(Type.String({ format: 'date-time' })),
          activityFrom: Type.Optional(Type.String({ format: 'date-time' })),
          activityTo: Type.Optional(Type.String({ format: 'date-time' })),
          search: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          sort: Type.Optional(
            Type.Union(
              ['newest', 'oldest', 'created_newest', 'created_oldest', 'priority', 'follow_up'].map(
                (value) => Type.Literal(value),
              ),
            ),
          ),
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
        priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
        assignedMembershipId?: string;
        tagId?: string;
        unread?: boolean;
        starred?: boolean;
        needsReply?: boolean;
        followUp?: 'pending' | 'overdue' | 'none';
        createdFrom?: string;
        createdTo?: string;
        activityFrom?: string;
        activityTo?: string;
        search?: string;
        sort?: 'newest' | 'oldest' | 'created_newest' | 'created_oldest' | 'priority' | 'follow_up';
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
          text: Type.Optional(Type.String({ minLength: 1, maxLength: 10_000 })),
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
        text?: string;
        attachmentIds?: string[];
        replyToMessageId?: string;
      };
      try {
        const result = await messaging.prepareOutboundMessage(database.db, {
          actor: actor(context),
          access: access(context),
          conversationId: params.conversationId,
          idempotencyKey: key,
          clientMessageId: body.clientMessageId,
          ...(body.text !== undefined ? { text: body.text } : {}),
          ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
          ...(body.replyToMessageId ? { replyToMessageId: body.replyToMessageId } : {}),
          requestId: request.id,
        });
        return reply.code(result.replayed ? 200 : 202).send({ data: result.message });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  if (storage)
    app.get(
      '/admin/messaging/attachments/:attachmentId',
      { schema: { params: Type.Object({ attachmentId: Type.String({ format: 'uuid' }) }) } },
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
          const attachment = await messaging.authorizeStaffMessagingAttachment(database.db, {
            organizationId: context.organizationId,
            membershipId: context.membershipId,
            access: access(context),
            attachmentId: (request.params as { attachmentId: string }).attachmentId,
          });
          const locator = {
            provider: attachment.provider,
            bucket: attachment.bucket,
            key: attachment.objectKey,
          };
          if (storage.provider !== 'local') {
            const url = await storage.createSignedRead(locator, { expiresInSeconds: 300 });
            if (url) return reply.redirect(url, 302);
          }
          const content = await storage.get(locator);
          if (!content)
            return reply.code(404).send({
              error: {
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Attachment was not found.',
                requestId: request.id,
              },
            });
          return reply
            .header('content-type', attachment.mimeType)
            .header('content-length', String(content.length))
            .header('cache-control', 'private, no-store')
            .header('content-disposition', 'inline')
            .send(content);
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
