import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import { sql, type DatabaseClient } from '@maevelle/database';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { WishlistShareError } from '@maevelle/database/wishlist-sharing';
import { createShare, manageGuestShare, openPublicShare, ShareError } from '@maevelle/database/wishlist-share-lifecycle';
import { type ShareEncryptionKey, ShareRecoveryError, shareKey } from '@maevelle/database/wishlist-share-crypto';

const secret = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });

function shareError(reply: { code(status: number): { send(value: unknown): unknown } }, caught: unknown) {
  if (caught instanceof ShareRecoveryError) return reply.code(503).send({ error: { code: 'RECOVERY_UNAVAILABLE', message: 'Creation recovery is unavailable. Keep the pending request and retry later.' } });
  if (!(caught instanceof WishlistShareError) && !(caught instanceof ShareError)) throw caught;
  return reply.code(caught.code === 'NOT_FOUND' ? 404 : caught.code === 'CONFLICT' ? 409 : 422).send({ error: { code: caught.code, message: caught.message } });
}

/** Public, bounded hydration for browser-owned guest wishlists. Only published catalog data escapes. */
export function registerWishlistRoutes(app: FastifyInstance, database: DatabaseClient, storefrontOrganizationCode = 'maevelle', encryptionKey?: string | ShareEncryptionKey): void {
  app.post('/storefront/v1/wishlist/products', {
    schema: { body: Type.Object({ productIds: Type.Array(Type.String({ format: 'uuid' }), { maxItems: 100, uniqueItems: true }) }) },
  }, async (request, reply) => {
    const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
    if (!context) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storefront not found.' } });
    const { productIds } = request.body as { productIds: string[] };
    if (productIds.length === 0) return { data: [] };
    const result = await sql<{
      id: string; handle: string; title: string; description: string | null; minimum_price: string | null;
      available: boolean; primary_media_asset_id: string | null; category_name: string | null;
    }>`
      select product.id::text,product.handle,product.title,product.description,
        category.name as category_name,
        document.minimum_price::text,document.available,
        (select media_link.asset_id::text from catalog.product_media media_link
          join media.media_assets asset on asset.id=media_link.asset_id and asset.organization_id=media_link.organization_id
          where media_link.organization_id=product.organization_id and media_link.product_id=product.id
            and asset.status in ('READY','ARCHIVED') and asset.visibility_class='PUBLIC'
            and media_link.role in ('GALLERY','THUMBNAIL','COLOR_GALLERY')
          order by media_link.is_primary desc,media_link.position,media_link.id limit 1
        ) primary_media_asset_id
      from catalog.products product
      join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
      left join catalog.categories category on category.organization_id=product.organization_id and category.id=product.primary_category_id
      where product.organization_id=${context.organizationId} and product.id=any(${productIds}::uuid[])
        and product.status='ACTIVE' and product.publication_status='PUBLISHED'
    `.execute(database.db);
    return { data: result.rows.map((row) => ({
      id: row.id, handle: row.handle, title: row.title, description: row.description,
      price: row.minimum_price, available: row.available, primaryMediaAssetId: row.primary_media_asset_id,
      categoryName: row.category_name,
    })) };
  });

  app.post('/storefront/v1/wishlist/shares', {
    bodyLimit: 16_384,
    schema: { body: Type.Union([
      Type.Object({ productIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1, maxItems: 100, uniqueItems: true }),
        operationId: secret, expiresAt: Type.String({ format: 'date-time' }), creationScope: Type.Optional(Type.Union([Type.Literal('ALL'),Type.Literal('SELECTED')])) }, { additionalProperties: false }),
      Type.Object({ items: Type.Array(Type.Object({ productId: Type.String({ format: 'uuid' }),
        preferredVariantId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])) }, { additionalProperties: false }),
        { minItems: 1, maxItems: 100 }), operationId: secret, expiresAt: Type.String({ format: 'date-time' }), creationScope: Type.Optional(Type.Union([Type.Literal('ALL'),Type.Literal('SELECTED')])) }, { additionalProperties: false }),
    ]) },
  }, async (request, reply) => {
    const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
    if (!context) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storefront not found.' } });
    reply.header('cache-control', 'no-store');
    try {
      const body = request.body as { productIds?: string[]; items?: { productId: string; preferredVariantId?: string | null }[]; operationId: string; expiresAt: string; creationScope?: 'ALL' | 'SELECTED' };
      if (!encryptionKey) return reply.code(503).send({ error: { code: 'UNAVAILABLE', message: 'Sharing is unavailable.' } });
      return { data: await createShare(database.db, context.organizationId, body.items ?? body.productIds!.map((productId) => ({ productId })), {
        operationId: body.operationId, ...(body.creationScope ? { creationScope: body.creationScope } : {}), key: typeof encryptionKey === 'string' ? shareKey(encryptionKey) : encryptionKey, expiresAt: body.expiresAt,
      }) };
    } catch (caught) { return shareError(reply, caught); }
  });

  app.post('/storefront/v1/wishlist/shares/open', {
    bodyLimit: 1024,
    schema: { body: Type.Object({ token: secret }) },
  }, async (request, reply) => {
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
    if (!context) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storefront not found.' } });
    try { return { data: await openPublicShare(database.db, context.organizationId, (request.body as { token: string }).token) }; }
    catch (caught) { return shareError(reply, caught); }
  });

  app.post('/storefront/v1/wishlist/shares/manage', {
    bodyLimit: 1024,
    schema: { body: Type.Object({ token: secret, action: Type.Union([Type.Literal('inspect'), Type.Literal('revoke'), Type.Literal('renew')]), expiresAt: Type.Optional(Type.String({ maxLength: 40 })) }, { additionalProperties: false }) },
  }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = request.body as { token: string; action: 'inspect' | 'revoke' | 'renew'; expiresAt?: string };
    const context = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
    if (!context) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storefront not found.' } });
    try { return { data: await manageGuestShare(database.db, context.organizationId, body.token, body.action === 'renew' ? 'set-expiry' : body.action, body.expiresAt) }; }
    catch (caught) { return shareError(reply, caught); }
  });
}
