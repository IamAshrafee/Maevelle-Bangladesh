import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  archiveMediaAsset,
  attachMediaToProduct,
  completeMediaUploadSession,
  createMediaFolder,
  createMediaTag,
  createMediaUploadSession,
  deleteMediaFolder,
  deleteMediaTag,
  detachMediaFromProduct,
  findGuestMediaAssetStatus,
  findMediaAsset,
  getMediaUploadSession,
  listMediaFolders,
  listMediaHealthIssues,
  listMediaLibrary,
  listMediaStorageInventory,
  listMediaTags,
  MediaDomainError,
  organizeMediaAsset,
  retryMediaProcessing,
  restoreTrashedMediaAsset,
  trashUnusedMediaAsset,
  updateMediaAssetMetadata,
  updateMediaFolder,
  type MediaRenditionKey,
  type MediaStatus,
} from '@maevelle/database/media';
import { authorizeReviewMediaUpload, ReviewDomainError } from '@maevelle/database/reviews';
import { findActiveAdminContext } from '@maevelle/database/platform';
import {
  createMediaObjectKey,
  sha256,
  type ObjectStoragePort,
  type StoredObjectLocator,
} from '@maevelle/media';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function requireCapability(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function sendForbidden(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
  return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access is denied.' } });
}

function mediaError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof MediaDomainError)) throw error;
  const status =
    error.code === 'NOT_FOUND'
      ? 404
      : ['CONFLICT', 'MEDIA_IN_USE', 'MEDIA_NOT_READY'].includes(error.code)
        ? 409
        : 422;
  return reply.code(status).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

function reviewMediaError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof MediaDomainError) return mediaError(reply, error);
  if (!(error instanceof ReviewDomainError)) throw error;
  const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

const UUID = Type.String({ format: 'uuid' });

export function registerMediaRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  storage: ObjectStoragePort,
  options: { readonly maxUploadBytes: number; readonly uploadExpirySeconds: number },
): void {
  app.post(
    '/reviews/media/uploads',
    {
      schema: {
        body: Type.Object({
          organizationId: UUID,
          accessToken: Type.String({ minLength: 20, maxLength: 200 }),
          filename: Type.String({ minLength: 1, maxLength: 255 }),
          mimeType: Type.Union([
            Type.Literal('image/jpeg'),
            Type.Literal('image/png'),
            Type.Literal('image/webp'),
          ]),
          byteSize: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as {
          organizationId: string;
          accessToken: string;
          filename: string;
          mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
          byteSize: number;
        };
        const owner = await authorizeReviewMediaUpload(database.db, {
          ...body,
          enforceUploadLimit: true,
        });
        const expiresAt = new Date(Date.now() + options.uploadExpirySeconds * 1_000);
        const session = await createMediaUploadSession(database.db, {
          organizationId: body.organizationId,
          uploadSource: 'CUSTOMER_REVIEW',
          guestOwnerHash: owner.guestOwnerHash,
          originalFilename: body.filename,
          declaredMimeType: body.mimeType,
          declaredByteSize: body.byteSize,
          visibility: 'PRIVATE',
          storageProvider: storage.provider,
          bucket: storage.privateBucket,
          objectKey: (assetId, extension) =>
            createMediaObjectKey({
              organizationId: body.organizationId,
              assetId,
              extension,
              purpose: 'original',
            }),
          expiresAt,
          maximumBytes: Math.min(options.maxUploadBytes, 5 * 1024 * 1024),
        });
        const authorization = await storage.createSignedUpload(
          { provider: session.provider, bucket: session.bucket, key: session.objectKey },
          { contentType: session.mimeType, expiresInSeconds: options.uploadExpirySeconds },
        );
        return reply.code(201).send({
          data: {
            sessionId: session.id,
            assetId: session.assetId,
            upload: {
              ...authorization,
              ...(authorization.strategy === 'API_PROXY'
                ? {
                    url: `/api/reviews/media/uploads/${session.id}/content?organizationId=${encodeURIComponent(body.organizationId)}`,
                  }
                : {}),
            },
          },
        });
      } catch (error) {
        return reviewMediaError(reply, error);
      }
    },
  );

  app.put(
    '/reviews/media/uploads/:sessionId/content',
    {
      bodyLimit: Math.min(options.maxUploadBytes, 5 * 1024 * 1024),
      schema: { querystring: Type.Object({ organizationId: UUID }) },
    },
    async (request, reply) => {
      if (storage.provider !== 'local')
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
      try {
        const organizationId = (request.query as { organizationId: string }).organizationId;
        const accessToken = request.headers['x-review-access-token'];
        if (typeof accessToken !== 'string')
          throw new ReviewDomainError('FORBIDDEN', 'Review access credential is required.');
        const owner = await authorizeReviewMediaUpload(database.db, {
          organizationId,
          accessToken,
        });
        const session = await getMediaUploadSession(database.db, {
          organizationId,
          sessionId: (request.params as { sessionId: string }).sessionId,
          guestOwnerHash: owner.guestOwnerHash,
        });
        if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
        if (session.status !== 'PENDING')
          throw new MediaDomainError('CONFLICT', 'Upload session is not open.');
        if (new Date(session.expiresAt).getTime() <= Date.now())
          throw new MediaDomainError('UPLOAD_EXPIRED', 'Upload session has expired.');
        if (!Buffer.isBuffer(request.body) || request.body.length !== session.declaredByteSize)
          throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Upload body size is not authorized.');
        await storage.put(
          { provider: session.provider, bucket: session.bucket, key: session.objectKey },
          request.body,
          { contentType: session.declaredMimeType, checksumSha256: sha256(request.body) },
        );
        return reply.code(204).send();
      } catch (error) {
        return reviewMediaError(reply, error);
      }
    },
  );

  app.post(
    '/reviews/media/uploads/:sessionId/complete',
    {
      schema: {
        body: Type.Object({
          organizationId: UUID,
          accessToken: Type.String({ minLength: 20, maxLength: 200 }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as { organizationId: string; accessToken: string };
        const owner = await authorizeReviewMediaUpload(database.db, body);
        const sessionId = (request.params as { sessionId: string }).sessionId;
        const session = await getMediaUploadSession(database.db, {
          organizationId: body.organizationId,
          sessionId,
          guestOwnerHash: owner.guestOwnerHash,
        });
        if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
        const object = await storage.head({
          provider: session.provider,
          bucket: session.bucket,
          key: session.objectKey,
        });
        if (!object)
          throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Uploaded object does not exist.');
        const completed = await completeMediaUploadSession(database.db, {
          organizationId: body.organizationId,
          sessionId,
          actualByteSize: object.byteSize,
          actualContentType: object.contentType,
          checksumSha256: object.checksumSha256,
          guestOwnerHash: owner.guestOwnerHash,
        });
        return reply.code(202).send({ data: completed });
      } catch (error) {
        return reviewMediaError(reply, error);
      }
    },
  );

  app.get(
    '/reviews/media/:assetId/status',
    { schema: { querystring: Type.Object({ organizationId: UUID }) } },
    async (request, reply) => {
      try {
        const organizationId = (request.query as { organizationId: string }).organizationId;
        const accessToken = request.headers['x-review-access-token'];
        if (typeof accessToken !== 'string')
          throw new ReviewDomainError('FORBIDDEN', 'Review access credential is required.');
        const owner = await authorizeReviewMediaUpload(database.db, {
          organizationId,
          accessToken,
        });
        const asset = await findGuestMediaAssetStatus(database.db, {
          organizationId,
          assetId: (request.params as { assetId: string }).assetId,
          guestOwnerHash: owner.guestOwnerHash,
        });
        if (!asset) throw new MediaDomainError('NOT_FOUND', 'Review media was not found.');
        return { data: asset };
      } catch (error) {
        return reviewMediaError(reply, error);
      }
    },
  );

  app.get(
    '/admin/media',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          query: Type.Optional(Type.String({ maxLength: 200 })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('PENDING_UPLOAD'),
              Type.Literal('UPLOADED'),
              Type.Literal('PROCESSING'),
              Type.Literal('READY'),
              Type.Literal('FAILED'),
              Type.Literal('QUARANTINED'),
              Type.Literal('ARCHIVED'),
              Type.Literal('TRASHED'),
              Type.Literal('PURGING'),
            ]),
          ),
          assetType: Type.Optional(Type.Union([Type.Literal('IMAGE'), Type.Literal('DOCUMENT')])),
          visibility: Type.Optional(Type.Union([Type.Literal('PUBLIC'), Type.Literal('PRIVATE')])),
          unused: Type.Optional(Type.Boolean()),
          folderId: Type.Optional(Type.Union([UUID, Type.Literal('unfiled')])),
          tagId: Type.Optional(UUID),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.view');
      if (!context) return sendForbidden(reply);
      const query = request.query as {
        page?: number;
        pageSize?: number;
        query?: string;
        status?: MediaStatus;
        assetType?: 'IMAGE' | 'DOCUMENT';
        visibility?: 'PUBLIC' | 'PRIVATE';
        unused?: boolean;
        folderId?: string;
        tagId?: string;
      };
      const result = await listMediaLibrary(database.db, {
        organizationId: context.organizationId,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 24,
        ...(query.query ? { query: query.query } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.assetType ? { assetType: query.assetType } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(query.unused !== undefined ? { unused: query.unused } : {}),
        ...(query.folderId
          ? { folderId: query.folderId === 'unfiled' ? null : query.folderId }
          : {}),
        ...(query.tagId ? { tagId: query.tagId } : {}),
      });
      return { data: result.items, pagination: result.pagination };
    },
  );

  app.get('/admin/media/folders', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return sendForbidden(reply);
    return { data: await listMediaFolders(database.db, context.organizationId) };
  });

  app.get('/admin/media/health', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return sendForbidden(reply);
    const [domainIssues, inventory] = await Promise.all([
      listMediaHealthIssues(database.db, context.organizationId),
      listMediaStorageInventory(database.db, context.organizationId),
    ]);
    const storageIssues: Array<{
      code: 'MISSING_STORED_OBJECT' | 'PROVIDER_NOT_CONFIGURED';
      assetId: string;
      detail: string;
    }> = [];
    for (let offset = 0; offset < inventory.length; offset += 20) {
      const batch = inventory.slice(offset, offset + 20);
      const inspected = await Promise.all(
        batch.map(async (object) => {
          if (object.provider === 'url') return undefined;
          if (object.provider !== storage.provider)
            return {
              code: 'PROVIDER_NOT_CONFIGURED' as const,
              assetId: object.assetId,
              detail: `${object.kind} uses unconfigured provider ${object.provider}.`,
            };
          const found = await storage.head({
            provider: object.provider,
            bucket: object.bucket,
            key: object.objectKey,
          });
          return found
            ? undefined
            : {
                code: 'MISSING_STORED_OBJECT' as const,
                assetId: object.assetId,
                detail: `${object.kind} object is missing from storage.`,
              };
        }),
      );
      storageIssues.push(...inspected.filter((issue) => issue !== undefined));
    }
    const issues = [...domainIssues, ...storageIssues];
    return {
      data: {
        status: issues.length ? 'DEGRADED' : 'HEALTHY',
        checkedObjectCount: inventory.length,
        issueCount: issues.length,
        issues,
      },
    };
  });

  app.post(
    '/admin/media/folders',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 120 }),
          parentId: Type.Optional(Type.Union([UUID, Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as { name: string; parentId?: string | null };
        return reply.code(201).send({
          data: await createMediaFolder(database.db, {
            organizationId: context.organizationId,
            name: body.name,
            ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
          }),
        });
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/media/folders/:folderId',
    {
      schema: {
        params: Type.Object({ folderId: UUID }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          parentId: Type.Optional(Type.Union([UUID, Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as { version: number; name: string; parentId?: string | null };
        return {
          data: await updateMediaFolder(database.db, {
            organizationId: context.organizationId,
            folderId: (request.params as { folderId: string }).folderId,
            expectedVersion: body.version,
            name: body.name,
            ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
          }),
        };
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.delete('/admin/media/folders/:folderId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await deleteMediaFolder(database.db, {
        organizationId: context.organizationId,
        folderId: (request.params as { folderId: string }).folderId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.get('/admin/media/tags', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return sendForbidden(reply);
    return { data: await listMediaTags(database.db, context.organizationId) };
  });

  app.post(
    '/admin/media/tags',
    { schema: { body: Type.Object({ name: Type.String({ minLength: 1, maxLength: 80 }) }) } },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        return reply.code(201).send({
          data: await createMediaTag(database.db, {
            organizationId: context.organizationId,
            name: (request.body as { name: string }).name,
          }),
        });
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.delete('/admin/media/tags/:tagId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await deleteMediaTag(database.db, {
        organizationId: context.organizationId,
        tagId: (request.params as { tagId: string }).tagId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.patch(
    '/admin/media/:assetId/organization',
    {
      schema: {
        params: Type.Object({ assetId: UUID }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          folderId: Type.Optional(Type.Union([UUID, Type.Null()])),
          tagIds: Type.Array(UUID, { maxItems: 50, uniqueItems: true }),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as {
          version: number;
          folderId?: string | null;
          tagIds: string[];
        };
        return {
          data: await organizeMediaAsset(database.db, {
            organizationId: context.organizationId,
            assetId: (request.params as { assetId: string }).assetId,
            expectedVersion: body.version,
            ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
            tagIds: body.tagIds,
          }),
        };
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.post(
    '/admin/media/uploads',
    {
      schema: {
        body: Type.Object({
          filename: Type.String({ minLength: 1, maxLength: 255 }),
          mimeType: Type.String({ minLength: 1, maxLength: 100 }),
          byteSize: Type.Integer({ minimum: 1 }),
          visibility: Type.Optional(Type.Union([Type.Literal('PUBLIC'), Type.Literal('PRIVATE')])),
          title: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
          altText: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as {
          filename: string;
          mimeType: string;
          byteSize: number;
          visibility?: 'PUBLIC' | 'PRIVATE';
          title?: string | null;
          altText?: string | null;
        };
        const expiresAt = new Date(Date.now() + options.uploadExpirySeconds * 1_000);
        const session = await createMediaUploadSession(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          originalFilename: body.filename,
          declaredMimeType: body.mimeType,
          declaredByteSize: body.byteSize,
          visibility: body.visibility ?? 'PRIVATE',
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.altText !== undefined ? { altText: body.altText } : {}),
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
          maximumBytes: options.maxUploadBytes,
        });
        const locator = {
          provider: session.provider,
          bucket: session.bucket,
          key: session.objectKey,
        };
        const authorization = await storage.createSignedUpload(locator, {
          contentType: session.mimeType,
          expiresInSeconds: options.uploadExpirySeconds,
        });
        return reply.code(201).send({
          data: {
            sessionId: session.id,
            assetId: session.assetId,
            status: 'PENDING_UPLOAD',
            upload: {
              ...authorization,
              ...(authorization.strategy === 'API_PROXY'
                ? { url: `/api/admin/media/uploads/${session.id}/content` }
                : {}),
            },
          },
        });
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.get('/admin/media/:assetId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return sendForbidden(reply);
    const assetId = (request.params as { assetId: string }).assetId;
    const result = await listMediaLibrary(database.db, {
      organizationId: context.organizationId,
      page: 1,
      pageSize: 10,
      query: assetId,
    });
    const asset = result.items.find((candidate) => candidate.id === assetId);
    if (!asset)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media was not found.' } });
    return { data: asset };
  });

  app.put(
    '/admin/media/uploads/:sessionId/content',
    { bodyLimit: options.maxUploadBytes },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      if (storage.provider !== 'local')
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
      try {
        const session = await getMediaUploadSession(database.db, {
          organizationId: context.organizationId,
          sessionId: (request.params as { sessionId: string }).sessionId,
        });
        if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
        if (session.status !== 'PENDING')
          throw new MediaDomainError('CONFLICT', 'Upload session is not open.');
        if (new Date(session.expiresAt).getTime() <= Date.now())
          throw new MediaDomainError('UPLOAD_EXPIRED', 'Upload session has expired.');
        if (!Buffer.isBuffer(request.body) || request.body.length !== session.declaredByteSize)
          throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Upload body size is not authorized.');
        await storage.put(
          { provider: session.provider, bucket: session.bucket, key: session.objectKey },
          request.body,
          { contentType: session.declaredMimeType, checksumSha256: sha256(request.body) },
        );
        return reply.code(204).send();
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.post('/admin/media/uploads/:sessionId/complete', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      const sessionId = (request.params as { sessionId: string }).sessionId;
      const session = await getMediaUploadSession(database.db, {
        organizationId: context.organizationId,
        sessionId,
      });
      if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
      const object = await storage.head({
        provider: session.provider,
        bucket: session.bucket,
        key: session.objectKey,
      });
      if (!object)
        throw new MediaDomainError('UPLOAD_INCOMPLETE', 'Uploaded object does not exist.');
      const result = await completeMediaUploadSession(database.db, {
        organizationId: context.organizationId,
        sessionId,
        actualByteSize: object.byteSize,
        actualContentType: object.contentType,
        checksumSha256: object.checksumSha256,
      });
      return reply.code(202).send({ data: result });
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.patch(
    '/admin/media/:assetId',
    {
      schema: {
        params: Type.Object({ assetId: UUID }),
        body: Type.Object({
          version: Type.Optional(Type.Integer({ minimum: 1 })),
          title: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
          altText: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
          caption: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
          internalDescription: Type.Optional(
            Type.Union([Type.String({ maxLength: 4000 }), Type.Null()]),
          ),
          visibility: Type.Optional(Type.Union([Type.Literal('PUBLIC'), Type.Literal('PRIVATE')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as {
          version?: number;
          title?: string | null;
          altText?: string | null;
          caption?: string | null;
          internalDescription?: string | null;
          visibility?: 'PUBLIC' | 'PRIVATE';
        };
        const result = await updateMediaAssetMetadata(database.db, {
          organizationId: context.organizationId,
          assetId: (request.params as { assetId: string }).assetId,
          actorId: context.actorId,
          ...(body.version !== undefined ? { expectedVersion: body.version } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.altText !== undefined ? { altText: body.altText } : {}),
          ...(body.caption !== undefined ? { caption: body.caption } : {}),
          ...(body.internalDescription !== undefined
            ? { internalDescription: body.internalDescription }
            : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        });
        return { data: result };
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.post('/admin/media/:assetId/retry', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await retryMediaProcessing(database.db, {
        organizationId: context.organizationId,
        assetId: (request.params as { assetId: string }).assetId,
        actorId: context.actorId,
      });
      return reply.code(202).send({ data: { status: 'UPLOADED' } });
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.post('/admin/media/:assetId/archive', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await archiveMediaAsset(database.db, {
        organizationId: context.organizationId,
        assetId: (request.params as { assetId: string }).assetId,
        actorId: context.actorId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.post('/admin/media/:assetId/restore', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await restoreTrashedMediaAsset(database.db, {
        organizationId: context.organizationId,
        assetId: (request.params as { assetId: string }).assetId,
        actorId: context.actorId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.delete('/admin/media/:assetId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return sendForbidden(reply);
    try {
      await trashUnusedMediaAsset(database.db, {
        organizationId: context.organizationId,
        assetId: (request.params as { assetId: string }).assetId,
        actorId: context.actorId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.post(
    '/admin/catalog/products/:productId/media',
    {
      schema: {
        body: Type.Object({
          assetId: UUID,
          role: Type.Union([
            Type.Literal('GALLERY'),
            Type.Literal('THUMBNAIL'),
            Type.Literal('COLOR_GALLERY'),
            Type.Literal('SIZE_DIAGRAM'),
          ]),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          variantId: Type.Optional(UUID),
          optionValueId: Type.Optional(UUID),
          isPrimary: Type.Optional(Type.Boolean()),
          altTextOverride: Type.Optional(
            Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return sendForbidden(reply);
      try {
        const body = request.body as {
          assetId: string;
          role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
          position?: number;
          variantId?: string;
          optionValueId?: string;
          isPrimary?: boolean;
          altTextOverride?: string | null;
        };
        await attachMediaToProduct(database.db, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          productId: (request.params as { productId: string }).productId,
          assetId: body.assetId,
          role: body.role,
          ...(body.position !== undefined ? { position: body.position } : {}),
          ...(body.variantId ? { variantId: body.variantId } : {}),
          ...(body.optionValueId ? { optionValueId: body.optionValueId } : {}),
          ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
          ...(body.altTextOverride !== undefined ? { altTextOverride: body.altTextOverride } : {}),
        });
        return reply.code(204).send();
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.delete('/admin/catalog/products/:productId/media/:productMediaId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
    if (!context) return sendForbidden(reply);
    try {
      const params = request.params as { productId: string; productMediaId: string };
      await detachMediaFromProduct(database.db, {
        organizationId: context.organizationId,
        actorId: context.actorId,
        productId: params.productId,
        productMediaId: params.productMediaId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.get('/media/public/:assetId', async (request, reply) => {
    const requested = (request.query as { rendition?: MediaRenditionKey }).rendition ?? 'pdp';
    const asset = await findMediaAsset(
      database.db,
      (request.params as { assetId: string }).assetId,
      undefined,
      requested,
    );
    if (!asset || asset.visibility !== 'PUBLIC')
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media was not found.' } });
    return deliverObject(reply, storage, asset, true);
  });

  app.get('/admin/media/:assetId/content', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return sendForbidden(reply);
    const asset = await findMediaAsset(
      database.db,
      (request.params as { assetId: string }).assetId,
      context.organizationId,
      'thumbnail',
    );
    if (!asset)
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media was not found.' } });
    return deliverObject(reply, storage, asset, false);
  });
}

async function deliverObject(
  reply: {
    redirect(url: string, statusCode: number): unknown;
    code(statusCode: number): { send(body: unknown): unknown };
    header(name: string, value: string): typeof reply;
    send(body: unknown): unknown;
  },
  storage: ObjectStoragePort,
  asset: Awaited<ReturnType<typeof findMediaAsset>> & {},
  isPublic: boolean,
) {
  if (asset.provider === 'url') return reply.redirect(asset.objectKey, 302);
  const locator: StoredObjectLocator = {
    provider: asset.provider,
    bucket: asset.bucket,
    key: asset.objectKey,
  };
  if (storage.provider !== 'local') {
    const url = await storage.createSignedRead(locator, {
      expiresInSeconds: isPublic ? 3_600 : 300,
    });
    if (url) {
      reply.header('cache-control', isPublic ? 'public, max-age=300' : 'private, no-store');
      return reply.redirect(url, 302);
    }
  }
  const content = await storage.get(locator);
  if (!content)
    return reply
      .code(404)
      .send({ error: { code: 'MEDIA_OBJECT_MISSING', message: 'Media file is unavailable.' } });
  reply
    .header('content-type', asset.mimeType)
    .header('content-length', String(content.length))
    .header(
      'cache-control',
      isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
    );
  return reply.send(content);
}
