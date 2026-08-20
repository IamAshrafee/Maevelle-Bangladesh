import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export class MediaDomainError extends Error {
  public readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT';

  public constructor(code: MediaDomainError['code'], message: string) {
    super(message);
    this.name = 'MediaDomainError';
    this.code = code;
  }
}

export interface MediaAsset {
  readonly id: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status: 'READY' | 'ARCHIVED';
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
  readonly objectKey: string;
  readonly altText: string | null;
}

function asAsset(row: {
  id: string;
  visibility_class: 'PUBLIC' | 'PRIVATE';
  status: 'READY' | 'ARCHIVED';
  mime_type: MediaAsset['mimeType'];
  byte_size: string;
  object_key: string;
  alt_text: string | null;
}): MediaAsset {
  return {
    id: row.id,
    visibility: row.visibility_class,
    status: row.status,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    objectKey: row.object_key,
    altText: row.alt_text,
  };
}

/** Metadata is committed only after the object has been written successfully. */
export async function registerUploadedMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    objectKey: string;
    mimeType: MediaAsset['mimeType'];
    byteSize: number;
    checksumSha256: string;
    visibility: MediaAsset['visibility'];
    title?: string;
    altText?: string;
    widthPx?: number;
    heightPx?: number;
  },
): Promise<MediaAsset> {
  return db.transaction().execute(async (transaction) => {
    const asset = await sql<{ id: string }>`
      insert into media.media_assets (organization_id, asset_type, visibility_class, status, title, alt_text)
      values (${input.organizationId}, 'IMAGE', ${input.visibility}, 'UPLOADING', ${input.title ?? null}, ${input.altText ?? null})
      returning id
    `.execute(transaction);
    const assetId = asset.rows[0]?.id;
    if (!assetId) throw new Error('Media asset registration did not return an id.');
    const object = await sql<{ id: string }>`
      insert into media.media_objects (
        organization_id, asset_id, storage_provider, object_key, mime_type, byte_size, checksum_sha256, width_px, height_px
      ) values (
        ${input.organizationId}, ${assetId}, 'local', ${input.objectKey}, ${input.mimeType}, ${input.byteSize}, ${input.checksumSha256}, ${input.widthPx ?? null}, ${input.heightPx ?? null}
      ) returning id
    `.execute(transaction);
    const objectId = object.rows[0]?.id;
    if (!objectId) throw new Error('Media object registration did not return an id.');
    const result = await sql<{
      id: string;
      visibility_class: 'PUBLIC' | 'PRIVATE';
      status: 'READY' | 'ARCHIVED';
      mime_type: MediaAsset['mimeType'];
      byte_size: string;
      object_key: string;
      alt_text: string | null;
    }>`
      update media.media_assets set current_object_id = ${objectId}, status = 'READY', updated_at = now()
      where id = ${assetId}
      returning id, visibility_class, status,
        (select mime_type from media.media_objects where id = ${objectId}) as mime_type,
        (select byte_size::text from media.media_objects where id = ${objectId}) as byte_size,
        (select object_key from media.media_objects where id = ${objectId}) as object_key, alt_text
    `.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new Error('Media asset finalization did not return an asset.');
    return asAsset(row);
  });
}

export async function findMediaAsset(
  db: Kysely<DatabaseSchema>,
  assetId: string,
  organizationId?: string,
): Promise<MediaAsset | undefined> {
  const result = await sql<{
    id: string;
    visibility_class: 'PUBLIC' | 'PRIVATE';
    status: 'READY' | 'ARCHIVED';
    mime_type: MediaAsset['mimeType'];
    byte_size: string;
    object_key: string;
    alt_text: string | null;
  }>`
    select asset.id, asset.visibility_class, asset.status, object.mime_type, object.byte_size::text, object.object_key, asset.alt_text
    from media.media_assets asset join media.media_objects object on object.id = asset.current_object_id
    where asset.id = ${assetId} and asset.status = 'READY' ${organizationId ? sql`and asset.organization_id = ${organizationId}` : sql``}
  `.execute(db);
  return result.rows[0] ? asAsset(result.rows[0]) : undefined;
}

export async function attachMediaToProduct(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    assetId: string;
    role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
    position?: number;
    variantId?: string;
  },
): Promise<void> {
  const asset = await findMediaAsset(db, input.assetId, input.organizationId);
  if (!asset) throw new MediaDomainError('NOT_FOUND', 'Media asset was not found.');
  const product = await sql<{
    id: string;
  }>`select id from catalog.products where id = ${input.productId} and organization_id = ${input.organizationId}`.execute(
    db,
  );
  if (!product.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Product was not found.');
  await sql`
    insert into catalog.product_media (organization_id, product_id, variant_id, asset_id, role, position)
    values (${input.organizationId}, ${input.productId}, ${input.variantId ?? null}, ${input.assetId}, ${input.role}, ${input.position ?? 0})
    on conflict (product_id, variant_id, asset_id, role) do update set position = excluded.position
  `.execute(db);
}
