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

export interface MediaLibraryAsset {
  readonly id: string;
  readonly visibility: MediaAsset['visibility'];
  readonly status: MediaAsset['status'];
  readonly mimeType: MediaAsset['mimeType'];
  readonly byteSize: number;
  readonly altText: string | null;
  readonly title: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly usages: readonly {
    readonly id: string;
    readonly productId: string;
    readonly productTitle: string;
    readonly variantId: string | null;
    readonly variantSku: string | null;
    readonly optionValueId: string | null;
    readonly optionValueLabel: string | null;
    readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
    readonly isPrimary: boolean;
    readonly position: number;
  }[];
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

/** Tenant-scoped Admin read model; object keys are intentionally not exposed to the browser. */
export async function listMediaLibrary(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly MediaLibraryAsset[]> {
  const [assets, usages] = await Promise.all([
    sql<{
      id: string;
      visibility_class: MediaAsset['visibility'];
      status: MediaAsset['status'];
      mime_type: MediaAsset['mimeType'];
      byte_size: string;
      title: string | null;
      alt_text: string | null;
      width_px: number | null;
      height_px: number | null;
      created_at: string;
      updated_at: string;
    }>`
      select asset.id::text,asset.visibility_class,asset.status,object.mime_type,
        object.byte_size::text,asset.title,asset.alt_text,
        object.width_px,object.height_px,asset.created_at::text,asset.updated_at::text
      from media.media_assets asset
      join media.media_objects object
        on object.id=asset.current_object_id and object.organization_id=asset.organization_id
      where asset.organization_id=${organizationId} and asset.status in ('READY','ARCHIVED')
      order by asset.created_at desc,asset.id desc
    `.execute(db),
    sql<{
      id: string;
      asset_id: string;
      product_id: string;
      product_title: string;
      variant_id: string | null;
      variant_sku: string | null;
      option_value_id: string | null;
      option_value_label: string | null;
      role: MediaLibraryAsset['usages'][number]['role'];
      is_primary: boolean;
      position: number;
    }>`
      select link.id::text,link.asset_id::text,link.product_id::text,
        product.title as product_title,link.variant_id::text,variant.sku as variant_sku,
        link.option_value_id::text,value.display_value option_value_label,
        link.role,link.is_primary,link.position
      from catalog.product_media link
      join catalog.products product
        on product.id=link.product_id and product.organization_id=link.organization_id
      left join catalog.product_variants variant
        on variant.id=link.variant_id and variant.organization_id=link.organization_id
      left join catalog.product_option_values value
        on value.id=link.option_value_id and value.organization_id=link.organization_id
      where link.organization_id=${organizationId}
      order by link.position,link.id
    `.execute(db),
  ]);
  return assets.rows.map((asset) => ({
    id: asset.id,
    visibility: asset.visibility_class,
    status: asset.status,
    mimeType: asset.mime_type,
    byteSize: Number(asset.byte_size),
    altText: asset.alt_text,
    title: asset.title,
    widthPx: asset.width_px,
    heightPx: asset.height_px,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
    usages: usages.rows
      .filter((usage) => usage.asset_id === asset.id)
      .map((usage) => ({
        id: usage.id,
        productId: usage.product_id,
        productTitle: usage.product_title,
        variantId: usage.variant_id,
        variantSku: usage.variant_sku,
        optionValueId: usage.option_value_id,
        optionValueLabel: usage.option_value_label,
        role: usage.role,
        isPrimary: usage.is_primary,
        position: usage.position,
      })),
  }));
}

export async function updateMediaAssetMetadata(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    assetId: string;
    title?: string | null;
    altText?: string | null;
    visibility?: MediaAsset['visibility'];
  },
): Promise<void> {
  const result = await sql`
    update media.media_assets
    set title=case when ${input.title === undefined} then title else ${input.title ?? null} end,
      alt_text=case when ${input.altText === undefined} then alt_text else ${input.altText ?? null} end,
      visibility_class=coalesce(${input.visibility ?? null},visibility_class),
      updated_at=now(),version=version+1
    where id=${input.assetId} and organization_id=${input.organizationId} and status='READY'
  `.execute(db);
  if (Number(result.numAffectedRows) !== 1)
    throw new MediaDomainError('NOT_FOUND', 'Media asset was not found.');
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
    optionValueId?: string;
    isPrimary?: boolean;
  },
): Promise<void> {
  if (input.variantId && input.optionValueId)
    throw new MediaDomainError(
      'VALIDATION_FAILED',
      'Choose either a Variant gallery or an option-value gallery, not both.',
    );
  const asset = await findMediaAsset(db, input.assetId, input.organizationId);
  if (!asset) throw new MediaDomainError('NOT_FOUND', 'Media asset was not found.');
  const product = await sql<{
    id: string;
  }>`select id from catalog.products where id = ${input.productId} and organization_id = ${input.organizationId}`.execute(
    db,
  );
  if (!product.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Product was not found.');
  if (input.variantId) {
    const variant = await sql<{ id: string }>`
      select id from catalog.product_variants
      where id=${input.variantId} and product_id=${input.productId}
        and organization_id=${input.organizationId}
    `.execute(db);
    if (!variant.rows[0])
      throw new MediaDomainError('VALIDATION_FAILED', 'Variant is not available for this Product.');
  }
  if (input.optionValueId) {
    const value = await sql<{ id: string }>`select value.id::text from catalog.product_option_values value
      join catalog.product_option_axes axis
        on axis.organization_id=value.organization_id and axis.id=value.option_axis_id
      where value.organization_id=${input.organizationId} and value.id=${input.optionValueId}::uuid
        and axis.product_id=${input.productId}::uuid`.execute(db);
    if (!value.rows[0])
      throw new MediaDomainError(
        'VALIDATION_FAILED',
        'Option value is not available for this Product.',
      );
  }
  await db.transaction().execute(async (transaction) => {
    if (input.isPrimary)
      await sql`update catalog.product_media set is_primary=false
        where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
          and variant_id is not distinct from ${input.variantId ?? null}::uuid
          and option_value_id is not distinct from ${input.optionValueId ?? null}::uuid`.execute(
        transaction,
      );
    await sql`insert into catalog.product_media
      (organization_id,product_id,variant_id,option_value_id,asset_id,role,is_primary,position)
      values (${input.organizationId},${input.productId},${input.variantId ?? null},
        ${input.optionValueId ?? null},${input.assetId},${input.role},${input.isPrimary ?? false},
        ${input.position ?? 0}) on conflict do nothing`.execute(transaction);
    await sql`update catalog.product_media set position=${input.position ?? 0},
        is_primary=${input.isPrimary ?? false}
      where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
        and variant_id is not distinct from ${input.variantId ?? null}::uuid
        and option_value_id is not distinct from ${input.optionValueId ?? null}::uuid
        and asset_id=${input.assetId}::uuid and role=${input.role}`.execute(transaction);
  });
}

export async function detachMediaFromProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; productId: string; productMediaId: string },
): Promise<void> {
  const result = await sql`
    delete from catalog.product_media
    where id=${input.productMediaId} and product_id=${input.productId}
      and organization_id=${input.organizationId}
  `.execute(db);
  if (Number(result.numAffectedRows) !== 1)
    throw new MediaDomainError('NOT_FOUND', 'Product media placement was not found.');
}
