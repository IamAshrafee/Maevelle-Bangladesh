import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import {
  MediaDomainError,
  type MediaAssetDelivery,
  type MediaAssetType,
  type MediaLibraryAsset,
  type MediaRenditionKey,
  type MediaStatus,
  type MediaUsage,
  type MediaVisibility,
} from './types.js';

export async function findMediaAsset(
  db: Kysely<DatabaseSchema>,
  assetId: string,
  organizationId?: string,
  renditionKey: MediaRenditionKey | 'original' = 'original',
): Promise<MediaAssetDelivery | undefined> {
  const result = await sql<{
    asset_id: string;
    visibility_class: MediaVisibility;
    status: MediaStatus;
    original_filename: string;
    alt_text: string | null;
    storage_provider: string;
    bucket_name: string;
    object_key: string;
    mime_type: string;
    byte_size: string;
    width_px: number | null;
    height_px: number | null;
    rendition_key: MediaRenditionKey | 'original';
  }>`
    select asset.id::text asset_id,asset.visibility_class,asset.status,asset.original_filename,
      asset.alt_text,coalesce(rendition.storage_provider,object.storage_provider) storage_provider,
      coalesce(rendition.bucket_name,object.bucket_name) bucket_name,
      coalesce(rendition.object_key,object.object_key) object_key,
      coalesce(rendition.mime_type,object.mime_type) mime_type,
      coalesce(rendition.byte_size,object.byte_size)::text byte_size,
      coalesce(rendition.width_px,object.width_px) width_px,
      coalesce(rendition.height_px,object.height_px) height_px,
      coalesce(rendition.rendition_key,'original') rendition_key
    from media.media_assets asset
    join media.media_objects object
      on object.id=asset.current_object_id and object.organization_id=asset.organization_id
    left join lateral (
      select candidate.* from media.media_renditions candidate
      where candidate.organization_id=asset.organization_id and candidate.asset_id=asset.id
        and ${renditionKey === 'original' ? false : true}
      order by (candidate.rendition_key=${renditionKey}) desc,candidate.width_px desc
      limit 1
    ) rendition on true
    where asset.id=${assetId}::uuid and asset.status in ('READY','ARCHIVED')
      ${organizationId ? sql`and asset.organization_id=${organizationId}` : sql``}
  `.execute(db);
  const row = result.rows[0];
  return row
    ? {
        id: row.asset_id,
        assetId: row.asset_id,
        visibility: row.visibility_class,
        status: row.status,
        originalFilename: row.original_filename,
        altText: row.alt_text,
        provider: row.storage_provider,
        bucket: row.bucket_name,
        objectKey: row.object_key,
        mimeType: row.mime_type,
        byteSize: Number(row.byte_size),
        widthPx: row.width_px,
        heightPx: row.height_px,
        renditionKey: row.rendition_key,
      }
    : undefined;
}

export function listMediaLibrary(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly MediaLibraryAsset[]>;
export function listMediaLibrary(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    query?: string;
    status?: MediaStatus;
    assetType?: MediaAssetType;
    visibility?: MediaVisibility;
    unused?: boolean;
    folderId?: string | null;
    tagId?: string;
  },
): Promise<{
  readonly items: readonly MediaLibraryAsset[];
  readonly pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}>;
export async function listMediaLibrary(
  db: Kysely<DatabaseSchema>,
  inputOrOrganizationId:
    | string
    | {
        organizationId: string;
        page: number;
        pageSize: number;
        query?: string;
        status?: MediaStatus;
        assetType?: MediaAssetType;
        visibility?: MediaVisibility;
        unused?: boolean;
        folderId?: string | null;
        tagId?: string;
      },
): Promise<
  | readonly MediaLibraryAsset[]
  | {
      readonly items: readonly MediaLibraryAsset[];
      readonly pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    }
> {
  const legacy = typeof inputOrOrganizationId === 'string';
  const input = legacy
    ? { organizationId: inputOrOrganizationId, page: 1, pageSize: 1000 }
    : inputOrOrganizationId;
  const offset = (input.page - 1) * input.pageSize;
  const query = input.query?.trim() ? `%${input.query.trim()}%` : undefined;
  const filter = sql`
    asset.organization_id=${input.organizationId}
    ${input.status ? sql`and asset.status=${input.status}` : sql`and asset.status not in ('TRASHED','PURGING')`}
    ${input.assetType ? sql`and asset.asset_type=${input.assetType}` : sql``}
    ${input.visibility ? sql`and asset.visibility_class=${input.visibility}` : sql``}
    ${input.folderId === undefined ? sql`` : input.folderId === null ? sql`and asset.folder_id is null` : sql`and asset.folder_id=${input.folderId}::uuid`}
    ${input.tagId ? sql`and exists(select 1 from media.media_asset_tags filter_tag where filter_tag.organization_id=asset.organization_id and filter_tag.asset_id=asset.id and filter_tag.tag_id=${input.tagId}::uuid)` : sql``}
    ${query ? sql`and (asset.title ilike ${query} or asset.alt_text ilike ${query} or asset.original_filename ilike ${query} or asset.id::text ilike ${query})` : sql``}
    ${
      input.unused
        ? sql`and not exists(select 1 from catalog.product_media product_usage where product_usage.organization_id=asset.organization_id and product_usage.asset_id=asset.id)
      and not exists(select 1 from reviews.review_media review_usage where review_usage.organization_id=asset.organization_id and review_usage.media_asset_id=asset.id)`
        : sql``
    }
  `;
  const [count, assets] = await Promise.all([
    sql<{
      count: string;
    }>`select count(*)::text count from media.media_assets asset where ${filter}`.execute(db),
    sql<{
      id: string;
      asset_type: MediaAssetType;
      visibility_class: MediaVisibility;
      status: MediaStatus;
      original_filename: string;
      upload_source: string;
      uploaded_by: string | null;
      uploader_name: string | null;
      folder_id: string | null;
      title: string | null;
      alt_text: string | null;
      caption: string | null;
      internal_description: string | null;
      mime_type: string | null;
      byte_size: string | null;
      width_px: number | null;
      height_px: number | null;
      processing_error_code: string | null;
      processing_error_message: string | null;
      created_at: string;
      updated_at: string;
      version: string;
    }>`
      select asset.id::text,asset.asset_type,asset.visibility_class,asset.status,
        asset.original_filename,asset.upload_source,asset.uploaded_by::text,uploader.name uploader_name,
        asset.folder_id::text,asset.title,asset.alt_text,asset.caption,asset.internal_description,
        object.mime_type,object.byte_size::text,object.width_px,object.height_px,
        asset.processing_error_code,asset.processing_error_message,
        asset.created_at::text,asset.updated_at::text,asset.version::text
      from media.media_assets asset
      left join media.media_objects object
        on object.id=asset.current_object_id and object.organization_id=asset.organization_id
      left join iam.users uploader on uploader.id=asset.uploaded_by
      where ${filter}
      order by asset.created_at desc,asset.id desc
      limit ${input.pageSize} offset ${offset}
    `.execute(db),
  ]);
  const ids = assets.rows.map((asset) => asset.id);
  const [usages, tags] = ids.length
    ? await Promise.all([
        loadUsages(db, input.organizationId, ids),
        loadAssetTags(db, input.organizationId, ids),
      ])
    : [[], []];
  const totalItems = Number(count.rows[0]?.count ?? 0);
  const result = {
    items: assets.rows.map((asset) => ({
      id: asset.id,
      assetType: asset.asset_type,
      visibility: asset.visibility_class,
      status: asset.status,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size === null ? null : Number(asset.byte_size),
      originalFilename: asset.original_filename,
      uploadSource: asset.upload_source,
      uploadedBy:
        asset.uploaded_by && asset.uploader_name
          ? { id: asset.uploaded_by, name: asset.uploader_name }
          : null,
      folderId: asset.folder_id,
      tags: tags.filter((tag) => tag.assetId === asset.id).map(({ id, name }) => ({ id, name })),
      altText: asset.alt_text,
      title: asset.title,
      caption: asset.caption,
      internalDescription: asset.internal_description,
      widthPx: asset.width_px,
      heightPx: asset.height_px,
      processingErrorCode: asset.processing_error_code,
      processingErrorMessage: asset.processing_error_message,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
      version: Number(asset.version),
      usages: usages.filter((usage) => usage.entityId === asset.id),
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  };
  return legacy ? result.items : result;
}

async function loadAssetTags(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  assetIds: readonly string[],
) {
  const idList = sql.join(assetIds.map((id) => sql`${id}::uuid`));
  const result = await sql<{ asset_id: string; id: string; name: string }>`
    select link.asset_id::text,tag.id::text,tag.name
    from media.media_asset_tags link join media.media_tags tag
      on tag.organization_id=link.organization_id and tag.id=link.tag_id
    where link.organization_id=${organizationId} and link.asset_id in (${idList})
    order by tag.name,tag.id
  `.execute(db);
  return result.rows.map((row) => ({ assetId: row.asset_id, id: row.id, name: row.name }));
}

async function loadUsages(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  assetIds: readonly string[],
): Promise<readonly MediaUsage[]> {
  const idList = sql.join(assetIds.map((id) => sql`${id}::uuid`));
  const [products, reviews] = await Promise.all([
    sql<{
      asset_id: string;
      id: string;
      product_id: string;
      product_title: string;
      variant_id: string | null;
      variant_sku: string | null;
      option_value_id: string | null;
      option_value_label: string | null;
      role: MediaUsage['role'];
      is_primary: boolean;
      position: number;
    }>`select link.asset_id::text,link.id::text,link.product_id::text,product.title product_title,
      link.variant_id::text,variant.sku variant_sku,link.option_value_id::text,
      value.display_value option_value_label,link.role,link.is_primary,link.position
      from catalog.product_media link join catalog.products product
        on product.organization_id=link.organization_id and product.id=link.product_id
      left join catalog.product_variants variant
        on variant.organization_id=link.organization_id and variant.id=link.variant_id
      left join catalog.product_option_values value
        on value.organization_id=link.organization_id and value.id=link.option_value_id
      where link.organization_id=${organizationId} and link.asset_id in (${idList})`.execute(db),
    sql<{ asset_id: string; id: string; review_id: string }>`
      select link.media_asset_id::text asset_id,link.id::text,review.id::text review_id
      from reviews.review_media link
      join reviews.review_revisions revision on revision.id=link.review_revision_id
      join reviews.reviews review on review.id=revision.review_id
      where link.organization_id=${organizationId} and link.media_asset_id in (${idList})
    `.execute(db),
  ]);
  return [
    ...products.rows.map((usage) => ({
      id: usage.id,
      domain: 'catalog',
      usageType: 'PRODUCT_MEDIA',
      entityId: usage.asset_id,
      label: usage.product_title,
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
    ...reviews.rows.map((usage) => ({
      id: usage.id,
      domain: 'reviews',
      usageType: 'REVIEW_MEDIA',
      entityId: usage.asset_id,
      label: `Review ${usage.review_id}`,
    })),
  ];
}

export async function updateMediaAssetMetadata(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    assetId: string;
    expectedVersion?: number;
    title?: string | null;
    altText?: string | null;
    caption?: string | null;
    internalDescription?: string | null;
    visibility?: MediaVisibility;
    actorId?: string;
  },
): Promise<{ version: number }> {
  return db.transaction().execute(async (transaction) => {
    const current = await sql<{
      visibility_class: MediaVisibility;
      status: MediaStatus;
    }>`select visibility_class,status
      from media.media_assets where id=${input.assetId}::uuid
        and organization_id=${input.organizationId} and status not in ('TRASHED','PURGING')
      for update`.execute(transaction);
    if (!current.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Media asset was not found.');
    if (input.visibility === 'PRIVATE' && current.rows[0].visibility_class === 'PUBLIC') {
      if (['PROCESSING', 'READY', 'ARCHIVED'].includes(current.rows[0].status))
        throw new MediaDomainError(
          'CONFLICT',
          'Processed public bytes cannot be made private. Replace usages with a new private asset, then trash this asset.',
        );
      const usage = await authoritativeMediaUsageCount(
        transaction,
        input.organizationId,
        input.assetId,
      );
      if (usage > 0)
        throw new MediaDomainError(
          'MEDIA_IN_USE',
          'Detach all active usages before making this asset private.',
          { usageCount: usage },
        );
    }
    const result = await sql<{ version: string }>`update media.media_assets set
      title=case when ${input.title === undefined} then title else ${input.title ?? null} end,
      alt_text=case when ${input.altText === undefined} then alt_text else ${input.altText ?? null} end,
      caption=case when ${input.caption === undefined} then caption else ${input.caption ?? null} end,
      internal_description=case when ${input.internalDescription === undefined} then internal_description else ${input.internalDescription ?? null} end,
      visibility_class=coalesce(${input.visibility ?? null},visibility_class),updated_at=now(),version=version+1
      where id=${input.assetId}::uuid and organization_id=${input.organizationId}
        ${input.expectedVersion === undefined ? sql`` : sql`and version=${input.expectedVersion}`}
      returning version::text`.execute(transaction);
    if (!result.rows[0])
      throw new MediaDomainError('CONFLICT', 'Media asset changed while you were editing it.');
    if (input.actorId)
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'media.asset.metadata_updated',
        targetType: 'media.asset',
        targetId: input.assetId,
        afterDiff: {
          title: input.title,
          altText: input.altText,
          caption: input.caption,
          visibility: input.visibility,
        },
      });
    return { version: Number(result.rows[0].version) };
  });
}

export async function retryMediaProcessing(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const result =
      await sql`update media.media_assets set status='UPLOADED',processing_error_code=null,
      processing_error_message=null,updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid and status='FAILED'`.execute(
        transaction,
      );
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'Only failed assets can be retried.');
    if (input.actorId)
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'media.asset.processing_retried',
        targetType: 'media.asset',
        targetId: input.assetId,
      });
  });
}

export async function archiveMediaAsset(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const result = await sql`update media.media_assets set status='ARCHIVED',archived_at=now(),
      updated_at=now(),version=version+1 where organization_id=${input.organizationId}
      and id=${input.assetId}::uuid and status='READY'`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'Only ready assets can be archived.');
    if (input.actorId)
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'media.asset.archived',
        targetType: 'media.asset',
        targetId: input.assetId,
      });
  });
}

export async function trashUnusedMediaAsset(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; retentionDays?: number; actorId?: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const usage = await authoritativeMediaUsageCount(
      transaction,
      input.organizationId,
      input.assetId,
    );
    if (usage > 0)
      throw new MediaDomainError('MEDIA_IN_USE', 'Media asset is still in use.', {
        usageCount: usage,
      });
    const result = await sql`update media.media_assets set status='TRASHED',trashed_at=now(),
      purge_after=now()+(${input.retentionDays ?? 30}::text || ' days')::interval,
      archived_at=null,updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status in ('READY','ARCHIVED','FAILED')`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError(
        'CONFLICT',
        'Asset cannot be moved to trash in its current state.',
      );
    if (input.actorId)
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'media.asset.trashed',
        targetType: 'media.asset',
        targetId: input.assetId,
        metadata: { retentionDays: input.retentionDays ?? 30 },
      });
  });
}

export async function restoreTrashedMediaAsset(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const result = await sql`update media.media_assets set status='ARCHIVED',archived_at=now(),
      trashed_at=null,purge_after=null,updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status='TRASHED' and purge_after>now()`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'Asset is not recoverable from trash.');
    if (input.actorId)
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'media.asset.restored',
        targetType: 'media.asset',
        targetId: input.assetId,
      });
  });
}

export async function authoritativeMediaUsageCount(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  assetId: string,
): Promise<number> {
  const result = await sql<{ count: string }>`select (
    (select count(*) from catalog.product_media where organization_id=${organizationId} and asset_id=${assetId}::uuid)
    + (select count(*) from reviews.review_media where organization_id=${organizationId} and media_asset_id=${assetId}::uuid)
  )::text count`.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}
