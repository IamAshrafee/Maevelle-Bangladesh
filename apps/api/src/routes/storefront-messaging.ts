import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import * as messaging from '@maevelle/database/messaging';
import {
  completeMediaUploadSession,
  createMediaUploadSession,
  getMediaUploadSession,
  MediaDomainError,
} from '@maevelle/database/media';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import {
  createMediaObjectKey,
  type ObjectStoragePort,
} from '@maevelle/media';

import type { createAuth } from '../auth/auth.js';
import { storeLocalMediaUpload } from './media-upload-stream.js';

type Auth = ReturnType<typeof createAuth>;
const UUID = Type.String({ format: 'uuid' });
const COOKIE_NAME = 'maevelle_chat';
const contextSchema = Type.Object({
  pageType: Type.Union(
    ['HOME', 'PRODUCT', 'CATEGORY', 'CART', 'CHECKOUT', 'OTHER'].map((value) =>
      Type.Literal(value),
    ),
  ),
  path: Type.String({ minLength: 1, maxLength: 500, pattern: '^/' }),
  productId: Type.Optional(UUID),
  variantId: Type.Optional(UUID),
});

function toHeaders(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

function cookieValue(request: FastifyRequest): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const segment of cookie.split(';')) {
    const [name, ...value] = segment.trim().split('=');
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(value.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function setVisitorCookie(
  reply: FastifyReply,
  config: RuntimeConfig,
  credential: string,
  expiresAt: string,
): void {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `${COOKIE_NAME}=${encodeURIComponent(credential)}; Path=/api/storefront/v1/chat; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(expiresAt).toUTCString()}`,
  );
}

function clearVisitorCookie(reply: FastifyReply, config: RuntimeConfig): void {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `${COOKIE_NAME}=; Path=/api/storefront/v1/chat; HttpOnly; SameSite=Lax${secure}; Max-Age=0`,
  );
}

function fail(reply: FastifyReply, error: unknown, requestId: string) {
  if (error instanceof MediaDomainError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422;
    return reply.code(status).send({
      error: { code: error.code, message: error.message, requestId },
    });
  }
  if (!(error instanceof messaging.MessagingDomainError)) throw error;
  const status =
    error.code === 'UNAUTHENTICATED'
      ? 401
      : error.code === 'SESSION_EXPIRED'
        ? 401
        : error.code === 'CONVERSATION_NOT_FOUND'
          ? 404
          : error.code === 'EVENT_CURSOR_EXPIRED'
            ? 410
            : [
                  'CONVERSATION_CLOSED',
                  'IDEMPOTENCY_IN_PROGRESS',
                  'IDEMPOTENCY_KEY_REUSED',
                ].includes(error.code)
              ? 409
              : error.code === 'CONNECTION_UNAVAILABLE'
                ? 503
                : error.code === 'VALIDATION_FAILED'
                  ? 400
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

export function registerStorefrontMessagingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
  storage: ObjectStoragePort,
): void {
  const digestKey = Buffer.from(config.authEncryptionKey, 'base64');
  const activeStreams = new Map<string, number>();
  const streamControllers = new Set<AbortController>();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/storefront/v1/chat/'))
      reply.header('cache-control', 'private, no-store');
  });
  app.addHook('onClose', async () => {
    for (const controller of streamControllers) controller.abort();
  });

  const storefront = async () => {
    const result = await resolveStorefrontContext(database.db, config.storefrontOrganizationCode);
    if (!result)
      throw new messaging.MessagingDomainError(
        'CONNECTION_UNAVAILABLE',
        'Storefront chat is unavailable.',
      );
    return result;
  };
  const visitor = async (request: FastifyRequest, touch = true) => {
    const context = await storefront();
    return messaging.authenticateVisitorCredential(database.db, {
      organizationId: context.organizationId,
      ...(cookieValue(request) ? { credential: cookieValue(request)! } : {}),
      digestKey,
      touch,
    });
  };
  const limited = (
    reply: FastifyReply,
    key: string,
    maximum: number,
    windowMs: number,
    requestId: string,
  ): boolean => {
    const now = Date.now();
    if (attempts.size > 10_000)
      for (const [attemptKey, attempt] of attempts)
        if (attempt.resetAt <= now) attempts.delete(attemptKey);
    const previous = attempts.get(key);
    const state = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs } : previous;
    state.count++;
    attempts.set(key, state);
    if (state.count <= maximum) return false;
    reply.header('retry-after', String(Math.max(1, Math.ceil((state.resetAt - now) / 1000))));
    reply.code(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many chat requests.', requestId },
    });
    return true;
  };

  app.get('/storefront/v1/chat/config', async (_request, reply) => {
    try {
      const context = await storefront();
      return { data: await messaging.getStorefrontChatConfig(database.db, context.organizationId) };
    } catch (error) {
      return fail(reply, error, _request.id);
    }
  });

  app.post(
    '/storefront/v1/chat/session',
    { schema: { body: Type.Optional(Type.Object({ context: Type.Optional(contextSchema) })) } },
    async (request, reply) => {
      if (limited(reply, `session:${request.ip}`, 10, 60 * 60_000, request.id)) return;
      try {
        const context = await storefront();
        const result = await messaging.createOrResumeVisitorSession(database.db, {
          organizationId: context.organizationId,
          ...(cookieValue(request) ? { credential: cookieValue(request)! } : {}),
          digestKey,
          ...((request.body as { context?: messaging.StorefrontContextInput } | undefined)?.context
            ? { context: (request.body as { context: messaging.StorefrontContextInput }).context }
            : {}),
        });
        let credential = result.credential;
        let session = result.session;
        const authenticated = await auth.api.getSession({ headers: toHeaders(request.headers) });
        if (authenticated?.user?.id) {
          const current = await messaging.authenticateVisitorCredential(database.db, {
            organizationId: context.organizationId,
            credential,
            digestKey,
            touch: false,
          });
          const linked = await messaging.linkVisitorToAuthenticatedUser(database.db, {
            visitor: current,
            userId: authenticated.user.id,
            digestKey,
          });
          if (linked.credential) {
            credential = linked.credential;
            session = linked.session;
          }
        }
        setVisitorCookie(reply, config, credential, session.expiresAt);
        return reply.code(result.created ? 201 : 200).send({
          data: {
            config: await messaging.getStorefrontChatConfig(database.db, context.organizationId),
            session,
            conversation: result.conversation,
          },
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.delete('/storefront/v1/chat/session', async (request, reply) => {
    try {
      await messaging.revokeVisitorSession(database.db, await visitor(request));
      clearVisitorCookie(reply, config);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error, request.id);
    }
  });

  app.get('/storefront/v1/chat/conversations/current', async (request, reply) => {
    try {
      const principal = await visitor(request);
      return { data: await messaging.getVisitorConversation(database.db, principal) };
    } catch (error) {
      return fail(reply, error, request.id);
    }
  });

  app.post(
    '/storefront/v1/chat/conversations',
    { schema: { body: Type.Optional(Type.Object({ context: Type.Optional(contextSchema) })) } },
    async (request, reply) => {
      try {
        const principal = await visitor(request);
        const conversation = await messaging.startVisitorConversation(
          database.db,
          principal,
          (request.body as { context?: messaging.StorefrontContextInput } | undefined)?.context,
        );
        return reply.code(200).send({ data: conversation });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.get(
    '/storefront/v1/chat/conversations/:conversationId/messages',
    {
      schema: {
        params: Type.Object({ conversationId: UUID }),
        querystring: Type.Object({
          before: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      try {
        const principal = await visitor(request);
        const query = request.query as { before?: string; limit?: number };
        return await messaging.listVisitorMessages(database.db, {
          visitor: principal,
          conversationId: (request.params as { conversationId: string }).conversationId,
          ...query,
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/storefront/v1/chat/conversations/:conversationId/messages',
    {
      schema: {
        params: Type.Object({ conversationId: UUID }),
        body: Type.Object({
          clientMessageId: Type.String({ minLength: 1, maxLength: 160 }),
          text: Type.Optional(Type.String({ maxLength: 10_000 })),
          attachmentIds: Type.Optional(Type.Array(UUID, { maxItems: 5, uniqueItems: true })),
          context: Type.Optional(contextSchema),
        }),
      },
    },
    async (request, reply) => {
      try {
        const principal = await visitor(request);
        if (limited(reply, `message:${principal.sessionId}`, 30, 60_000, request.id)) return;
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || key.length < 8 || key.length > 200)
          throw new messaging.MessagingDomainError(
            'VALIDATION_FAILED',
            'A valid Idempotency-Key header is required.',
          );
        const body = request.body as {
          clientMessageId: string;
          text?: string;
          attachmentIds?: string[];
          context?: messaging.StorefrontContextInput;
        };
        const result = await messaging.sendVisitorMessage(database.db, {
          visitor: principal,
          conversationId: (request.params as { conversationId: string }).conversationId,
          idempotencyKey: key,
          ...body,
        });
        return reply.code(result.replayed ? 200 : 202).send({ data: result.message });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/storefront/v1/chat/conversations/:conversationId/read',
    {
      schema: {
        params: Type.Object({ conversationId: UUID }),
        body: Type.Object({ lastReadSequence: Type.String({ pattern: '^[0-9]+$' }) }),
      },
    },
    async (request, reply) => {
      try {
        return {
          data: await messaging.markVisitorConversationRead(database.db, {
            visitor: await visitor(request),
            conversationId: (request.params as { conversationId: string }).conversationId,
            lastReadSequence: (request.body as { lastReadSequence: string }).lastReadSequence,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/storefront/v1/chat/conversations/:conversationId/reopen',
    { schema: { params: Type.Object({ conversationId: UUID }) } },
    async (request, reply) => {
      try {
        return {
          data: await messaging.reopenVisitorConversation(database.db, {
            visitor: await visitor(request),
            conversationId: (request.params as { conversationId: string }).conversationId,
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.patch(
    '/storefront/v1/chat/contact',
    {
      schema: {
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
          email: Type.Optional(Type.String({ maxLength: 254 })),
          phone: Type.Optional(Type.String({ maxLength: 16 })),
          emailConsent: Type.Optional(Type.Boolean()),
          phoneConsent: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      try {
        return {
          data: await messaging.updateVisitorContact(database.db, {
            visitor: await visitor(request),
            ...(request.body as Omit<Parameters<typeof messaging.updateVisitorContact>[1], 'visitor'>),
          }),
        };
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/storefront/v1/chat/uploads',
    {
      schema: {
        body: Type.Object({
          conversationId: UUID,
          fileName: Type.String({ minLength: 1, maxLength: 255 }),
          mimeType: Type.Union(messaging.WEBSITE_ATTACHMENT_MIME_TYPES.map((value) => Type.Literal(value))),
          byteSize: Type.Integer({ minimum: 1, maximum: messaging.WEBSITE_ATTACHMENT_MAX_BYTES }),
          sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const principal = await visitor(request);
        if (limited(reply, `upload:${principal.sessionId}`, 10, 60 * 60_000, request.id)) return;
        const body = request.body as {
          conversationId: string;
          fileName: string;
          mimeType: (typeof messaging.WEBSITE_ATTACHMENT_MIME_TYPES)[number];
          byteSize: number;
          sha256: string;
        };
        await messaging.getVisitorConversation(database.db, principal, body.conversationId);
        const expiresAt = new Date(Date.now() + config.mediaUploadExpirySeconds * 1000);
        const ownerHash = messaging.visitorMediaOwnerHash(digestKey, principal.contactIdentityId);
        const mediaSession = await createMediaUploadSession(database.db, {
          organizationId: principal.organizationId,
          uploadSource: 'MESSAGING_ATTACHMENT',
          guestOwnerHash: ownerHash,
          originalFilename: body.fileName,
          declaredMimeType: body.mimeType,
          declaredByteSize: body.byteSize,
          visibility: 'PRIVATE',
          storageProvider: storage.provider,
          bucket: storage.privateBucket,
          objectKey: (assetId, extension) =>
            createMediaObjectKey({
              organizationId: principal.organizationId,
              assetId,
              extension,
              purpose: 'original',
            }),
          expiresAt,
          maximumBytes: messaging.WEBSITE_ATTACHMENT_MAX_BYTES,
        });
        const uploadId = await messaging.registerWebsiteAttachmentUpload(database.db, {
          visitor: principal,
          ...body,
          mediaAssetId: mediaSession.assetId,
          mediaUploadSessionId: mediaSession.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        });
        const authorization = await storage.createSignedUpload(
          { provider: mediaSession.provider, bucket: mediaSession.bucket, key: mediaSession.objectKey },
          {
            contentType: mediaSession.mimeType,
            expiresInSeconds: config.mediaUploadExpirySeconds,
            checksumSha256: body.sha256,
          },
        );
        return reply.code(201).send({
          data: {
            id: uploadId,
            assetId: mediaSession.assetId,
            upload: {
              ...authorization,
              ...(authorization.strategy === 'API_PROXY'
                ? { url: `/api/storefront/v1/chat/uploads/${uploadId}/content`,
                    headers: { 'content-type': 'application/x-maevelle-media-upload' } }
                : {}),
            },
          },
        });
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.put(
    '/storefront/v1/chat/uploads/:uploadId/content',
    {
      bodyLimit: messaging.WEBSITE_ATTACHMENT_MAX_BYTES,
      schema: { params: Type.Object({ uploadId: UUID }) },
    },
    async (request, reply) => {
      if (storage.provider !== 'local')
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
      try {
        const principal = await visitor(request);
        const ownerHash = messaging.visitorMediaOwnerHash(digestKey, principal.contactIdentityId);
        const upload = await messaging.getWebsiteAttachmentUploadAuthorization(database.db, {
          visitor: principal,
          uploadId: (request.params as { uploadId: string }).uploadId,
        });
        if (!upload) throw new messaging.MessagingDomainError('CONVERSATION_NOT_FOUND', 'Upload was not found.');
        const session = await getMediaUploadSession(database.db, {
          organizationId: principal.organizationId,
          sessionId: upload.mediaUploadSessionId,
          guestOwnerHash: ownerHash,
        });
        if (!session || session.status !== 'PENDING')
          throw new MediaDomainError('CONFLICT', 'Upload session is not open.');
        await storeLocalMediaUpload(storage, request.body, session, upload.expectedSha256);
        return reply.code(204).send();
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );

  app.post(
    '/storefront/v1/chat/uploads/:uploadId/complete',
    { schema: { params: Type.Object({ uploadId: UUID }) } },
    async (request, reply) => {
    try {
      const principal = await visitor(request);
      const ownerHash = messaging.visitorMediaOwnerHash(digestKey, principal.contactIdentityId);
      const uploadId = (request.params as { uploadId: string }).uploadId;
      const upload = await messaging.getWebsiteAttachmentUploadAuthorization(database.db, {
        visitor: principal,
        uploadId,
      });
      if (!upload) throw new messaging.MessagingDomainError('CONVERSATION_NOT_FOUND', 'Upload was not found.');
      const session = await getMediaUploadSession(database.db, {
        organizationId: principal.organizationId,
        sessionId: upload.mediaUploadSessionId,
        guestOwnerHash: ownerHash,
      });
      if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
      const object = await storage.head({
        provider: session.provider,
        bucket: session.bucket,
        key: session.objectKey,
      });
      if (!object || object.byteSize !== session.declaredByteSize ||
        (storage.provider !== 'local' && object.checksumSha256 !== upload.expectedSha256) ||
        (storage.provider === 'local' && object.checksumSha256 !== null &&
          object.checksumSha256 !== upload.expectedSha256))
        throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Uploaded object is incomplete.');
      await completeMediaUploadSession(database.db, {
        organizationId: principal.organizationId,
        sessionId: session.id,
        actualByteSize: object.byteSize,
        actualContentType: object.contentType,
        checksumSha256: object.checksumSha256 ?? upload.expectedSha256,
        guestOwnerHash: ownerHash,
      });
      await messaging.markWebsiteAttachmentProcessing(database.db, { visitor: principal, uploadId });
      return reply.code(202).send({
        data: await messaging.refreshWebsiteAttachmentUploadStatus(database.db, {
          visitor: principal,
          uploadId,
        }),
      });
    } catch (error) {
      return fail(reply, error, request.id);
    }
    },
  );

  app.get(
    '/storefront/v1/chat/uploads/:uploadId',
    { schema: { params: Type.Object({ uploadId: UUID }) } },
    async (request, reply) => {
    try {
      return {
        data: await messaging.refreshWebsiteAttachmentUploadStatus(database.db, {
          visitor: await visitor(request),
          uploadId: (request.params as { uploadId: string }).uploadId,
        }),
      };
    } catch (error) {
      return fail(reply, error, request.id);
    }
    },
  );

  app.get(
    '/storefront/v1/chat/attachments/:attachmentId',
    { schema: { params: Type.Object({ attachmentId: UUID }) } },
    async (request, reply) => {
    try {
      const attachment = await messaging.authorizeVisitorAttachment(database.db, {
        visitor: await visitor(request),
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
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment was not found.' } });
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

  app.get(
    '/storefront/v1/chat/events',
    { schema: { querystring: Type.Object({ cursor: Type.Optional(Type.String({ pattern: '^[0-9]+$' })) }) } },
    async (request, reply) => {
      try {
        let principal = await visitor(request, false);
        const active = activeStreams.get(principal.sessionId) ?? 0;
        if (active >= 1)
          return reply.code(429).send({
            error: { code: 'RATE_LIMITED', message: 'A chat event stream is already active.', requestId: request.id },
          });
        const query = request.query as { cursor?: string };
        let cursor =
          query.cursor ??
          (typeof request.headers['last-event-id'] === 'string' ? request.headers['last-event-id'] : '0');
        await messaging.listVisitorRealtimeEvents(database.db, { visitor: principal, after: cursor, limit: 1 });
        const controller = new AbortController();
        streamControllers.add(controller);
        activeStreams.set(principal.sessionId, active + 1);
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
              principal = await visitor(request, false);
              revalidate = Date.now() + 30_000;
            }
            const events = await messaging.listVisitorRealtimeEvents(database.db, {
              visitor: principal,
              after: cursor,
              limit: 100,
            });
            for (const event of events) {
              if (!reply.raw.write(`id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) {
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
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              }, { once: true });
            });
          }
        } finally {
          streamControllers.delete(controller);
          activeStreams.set(principal.sessionId, Math.max(0, (activeStreams.get(principal.sessionId) ?? 1) - 1));
          if (!reply.raw.destroyed) reply.raw.end();
        }
      } catch (error) {
        return fail(reply, error, request.id);
      }
    },
  );
}
