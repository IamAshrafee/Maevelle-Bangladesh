import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  attachMediaToProduct,
  detachMediaFromProduct,
  findMediaAsset,
  listMediaLibrary,
  MediaDomainError,
  registerUploadedMedia,
  updateMediaAssetMetadata,
} from '@maevelle/database/media';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';
import type { LocalMediaStorage } from '../media/local-media-storage.js';
import {
  detectImageMime,
  imageDimensions,
  InvalidMediaUploadError,
} from '../media/local-media-storage.js';

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

function mediaError(
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
  error: unknown,
) {
  if (!(error instanceof MediaDomainError) && !(error instanceof InvalidMediaUploadError))
    throw error;
  const status =
    error instanceof MediaDomainError && error.code === 'NOT_FOUND'
      ? 404
      : error instanceof MediaDomainError && error.code === 'CONFLICT'
        ? 409
        : 422;
  return reply.code(status).send({
    error: {
      code: error instanceof MediaDomainError ? error.code : 'VALIDATION_FAILED',
      message: error.message,
    },
  });
}

export function registerMediaRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  storage: LocalMediaStorage,
  maxUploadBytes: number,
): void {
  app.get('/admin/media', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listMediaLibrary(database.db, context.organizationId) };
  });

  app.post('/admin/media/images', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.manage');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      if (!Buffer.isBuffer(request.body))
        throw new InvalidMediaUploadError('Image upload body is required.');
      if (request.body.length === 0 || request.body.length > maxUploadBytes)
        throw new InvalidMediaUploadError(`Image must be between 1 and ${maxUploadBytes} bytes.`);
      const mimeType = detectImageMime(request.body);
      if (!mimeType)
        throw new InvalidMediaUploadError('Only JPEG, PNG, and WebP image uploads are accepted.');
      const { objectKey, checksumSha256 } = await storage.put(request.body, mimeType);
      try {
        const dimensions = imageDimensions(request.body, mimeType);
        const asset = await registerUploadedMedia(database.db, {
          organizationId: context.organizationId,
          objectKey,
          mimeType,
          checksumSha256,
          byteSize: request.body.length,
          visibility: request.headers['x-media-visibility'] === 'public' ? 'PUBLIC' : 'PRIVATE',
          ...(dimensions.width ? { widthPx: dimensions.width } : {}),
          ...(dimensions.height ? { heightPx: dimensions.height } : {}),
        });
        return reply.code(201).send({ data: asset });
      } catch (error) {
        await storage.remove(objectKey);
        throw error;
      }
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.post(
    '/admin/catalog/products/:productId/media',
    {
      schema: {
        body: Type.Object({
          assetId: Type.String(),
          role: Type.Union([
            Type.Literal('GALLERY'),
            Type.Literal('THUMBNAIL'),
            Type.Literal('COLOR_GALLERY'),
            Type.Literal('SIZE_DIAGRAM'),
          ]),
          position: Type.Optional(Type.Integer({ minimum: 0 })),
          variantId: Type.Optional(Type.String()),
          optionValueId: Type.Optional(Type.String()),
          isPrimary: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          assetId: string;
          role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
          position?: number;
          variantId?: string;
          optionValueId?: string;
          isPrimary?: boolean;
        };
        await attachMediaToProduct(database.db, {
          organizationId: context.organizationId,
          productId: (request.params as { productId: string }).productId,
          ...body,
        });
        return reply.code(204).send();
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/media/:assetId',
    {
      schema: {
        body: Type.Object({
          title: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
          altText: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
          visibility: Type.Optional(Type.Union([Type.Literal('PUBLIC'), Type.Literal('PRIVATE')])),
        }),
      },
    },
    async (request, reply) => {
      const context = await requireCapability(database, auth, request.headers, 'media.manage');
      if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await updateMediaAssetMetadata(database.db, {
          organizationId: context.organizationId,
          assetId: (request.params as { assetId: string }).assetId,
          ...(request.body as {
            title?: string | null;
            altText?: string | null;
            visibility?: 'PUBLIC' | 'PRIVATE';
          }),
        });
        return reply.code(204).send();
      } catch (error) {
        return mediaError(reply, error);
      }
    },
  );

  app.delete('/admin/catalog/products/:productId/media/:productMediaId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'catalog.manage');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      const params = request.params as { productId: string; productMediaId: string };
      await detachMediaFromProduct(database.db, {
        organizationId: context.organizationId,
        productId: params.productId,
        productMediaId: params.productMediaId,
      });
      return reply.code(204).send();
    } catch (error) {
      return mediaError(reply, error);
    }
  });

  app.get('/media/public/:assetId', async (request, reply) => {
    const asset = await findMediaAsset(
      database.db,
      (request.params as { assetId: string }).assetId,
    );
    if (!asset || asset.visibility !== 'PUBLIC')
      return reply.code(404).send({ error: 'NOT_FOUND' });
    const content = await storage.read(asset.objectKey);
    if (!content) return reply.code(404).send({ error: 'NOT_FOUND' });
    reply
      .header('content-type', asset.mimeType)
      .header('cache-control', 'public, max-age=31536000, immutable');
    return reply.send(content);
  });

  app.get('/admin/media/:assetId', async (request, reply) => {
    const context = await requireCapability(database, auth, request.headers, 'media.view');
    if (!context) return reply.code(403).send({ error: 'FORBIDDEN' });
    const asset = await findMediaAsset(
      database.db,
      (request.params as { assetId: string }).assetId,
      context.organizationId,
    );
    if (!asset) return reply.code(404).send({ error: 'NOT_FOUND' });
    const content = await storage.read(asset.objectKey);
    if (!content) return reply.code(404).send({ error: 'NOT_FOUND' });
    reply.header('content-type', asset.mimeType).header('cache-control', 'private, no-store');
    return reply.send(content);
  });
}
