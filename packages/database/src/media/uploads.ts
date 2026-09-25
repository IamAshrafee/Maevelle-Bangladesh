import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { MediaDomainError, type MediaVisibility, type SupportedMediaMime } from './types.js';

const MIME_POLICY: Record<SupportedMediaMime, { type: 'IMAGE' | 'DOCUMENT'; extension: string }> = {
  'image/jpeg': { type: 'IMAGE', extension: 'jpg' },
  'image/png': { type: 'IMAGE', extension: 'png' },
  'image/webp': { type: 'IMAGE', extension: 'webp' },
  'application/pdf': { type: 'DOCUMENT', extension: 'pdf' },
};

function safeFilename(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!normalized || normalized.length > 255)
    throw new MediaDomainError('VALIDATION_FAILED', 'Original filename is invalid.');
  return normalized;
}

export function mediaTypePolicy(mimeType: string) {
  const policy = MIME_POLICY[mimeType as SupportedMediaMime];
  if (!policy)
    throw new MediaDomainError(
      'VALIDATION_FAILED',
      'Only JPEG, PNG, WebP, and PDF uploads are accepted.',
    );
  return policy;
}

export async function createMediaUploadSession(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    uploadSource?: 'ADMIN_UPLOAD' | 'CUSTOMER_REVIEW' | 'SUPPLIER_IMPORT' | 'API';
    guestOwnerHash?: string;
    originalFilename: string;
    declaredMimeType: string;
    declaredByteSize: number;
    visibility: MediaVisibility;
    title?: string | null;
    altText?: string | null;
    storageProvider: string;
    bucket: string;
    objectKey: (assetId: string, extension: string) => string;
    expiresAt: Date;
    maximumBytes: number;
  },
) {
  const policy = mediaTypePolicy(input.declaredMimeType);
  if (
    !Number.isSafeInteger(input.declaredByteSize) ||
    input.declaredByteSize < 1 ||
    input.declaredByteSize > input.maximumBytes
  )
    throw new MediaDomainError(
      'VALIDATION_FAILED',
      `File must be between 1 and ${input.maximumBytes} bytes.`,
    );
  const originalFilename = safeFilename(input.originalFilename);
  if (input.guestOwnerHash && !/^[0-9a-f]{64}$/.test(input.guestOwnerHash))
    throw new MediaDomainError('VALIDATION_FAILED', 'Guest upload ownership is invalid.');
  if (input.uploadSource === 'CUSTOMER_REVIEW' && !input.guestOwnerHash)
    throw new MediaDomainError('VALIDATION_FAILED', 'Customer Review uploads require ownership.');
  return db.transaction().execute(async (transaction) => {
    const asset = await sql<{ id: string }>`
      insert into media.media_assets(
        organization_id,asset_type,visibility_class,status,original_filename,
        normalized_extension,title,alt_text,uploaded_by,upload_source,guest_owner_hash
      ) values (
        ${input.organizationId},${policy.type},${input.visibility},'PENDING_UPLOAD',
        ${originalFilename},${policy.extension},${input.title ?? null},${input.altText ?? null},
        ${input.actorId ?? null},${input.uploadSource ?? 'ADMIN_UPLOAD'},${input.guestOwnerHash ?? null}
      ) returning id::text
    `.execute(transaction);
    const assetId = asset.rows[0]?.id;
    if (!assetId) throw new Error('Media asset creation did not return an id.');
    const objectKey = input.objectKey(assetId, policy.extension);
    const session = await sql<{ id: string; expires_at: string }>`
      insert into media.media_upload_sessions(
        organization_id,asset_id,declared_mime_type,declared_byte_size,storage_provider,
        bucket_name,object_key,expires_at,created_by
      ) values (
        ${input.organizationId},${assetId},${input.declaredMimeType},${input.declaredByteSize},
        ${input.storageProvider},${input.bucket},${objectKey},${input.expiresAt},${input.actorId ?? null}
      ) returning id::text,expires_at::text
    `.execute(transaction);
    const row = session.rows[0];
    if (!row) throw new Error('Media upload session creation did not return an id.');
    return {
      id: row.id,
      assetId,
      provider: input.storageProvider,
      bucket: input.bucket,
      objectKey,
      mimeType: input.declaredMimeType as SupportedMediaMime,
      expiresAt: row.expires_at,
    };
  });
}

export async function getMediaUploadSession(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; sessionId: string; guestOwnerHash?: string },
) {
  const result = await sql<{
    id: string;
    asset_id: string;
    status: 'PENDING' | 'UPLOADED' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
    declared_mime_type: string;
    declared_byte_size: string;
    storage_provider: string;
    bucket_name: string;
    object_key: string;
    expires_at: string;
  }>`
    select id::text,asset_id::text,status,declared_mime_type,declared_byte_size::text,
      storage_provider,bucket_name,object_key,expires_at::text
    from media.media_upload_sessions session
    where session.id=${input.sessionId}::uuid and session.organization_id=${input.organizationId}
      ${
        input.guestOwnerHash
          ? sql`and exists (
        select 1 from media.media_assets asset where asset.organization_id=session.organization_id
          and asset.id=session.asset_id and asset.guest_owner_hash=${input.guestOwnerHash}
      )`
          : sql``
      }
  `.execute(db);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        assetId: row.asset_id,
        status: row.status,
        declaredMimeType: row.declared_mime_type,
        declaredByteSize: Number(row.declared_byte_size),
        provider: row.storage_provider,
        bucket: row.bucket_name,
        objectKey: row.object_key,
        expiresAt: row.expires_at,
      }
    : undefined;
}

export async function completeMediaUploadSession(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    sessionId: string;
    actualByteSize: number;
    actualContentType: string | null;
    checksumSha256: string | null;
    guestOwnerHash?: string;
  },
) {
  return db.transaction().execute(async (transaction) => {
    const locked = await sql<{
      asset_id: string;
      status: 'PENDING' | 'UPLOADED' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
      declared_mime_type: string;
      declared_byte_size: string;
      storage_provider: string;
      bucket_name: string;
      object_key: string;
      expires_at: Date;
    }>`
      select asset_id::text,status,declared_mime_type,declared_byte_size::text,
        storage_provider,bucket_name,object_key,expires_at
      from media.media_upload_sessions session
      where session.id=${input.sessionId}::uuid and session.organization_id=${input.organizationId}
        ${
          input.guestOwnerHash
            ? sql`and exists (
          select 1 from media.media_assets asset where asset.organization_id=session.organization_id
            and asset.id=session.asset_id and asset.guest_owner_hash=${input.guestOwnerHash}
        )`
            : sql``
        }
      for update
    `.execute(transaction);
    const session = locked.rows[0];
    if (!session) throw new MediaDomainError('NOT_FOUND', 'Upload session was not found.');
    if (session.status === 'COMPLETED' || session.status === 'UPLOADED')
      return { assetId: session.asset_id, status: 'UPLOADED' as const };
    if (session.status !== 'PENDING')
      throw new MediaDomainError('CONFLICT', 'Upload session is not open.');
    if (session.expires_at.getTime() <= Date.now()) {
      await sql`update media.media_upload_sessions set status='EXPIRED',failure_code='UPLOAD_EXPIRED'
        where id=${input.sessionId}::uuid`.execute(transaction);
      throw new MediaDomainError('UPLOAD_EXPIRED', 'Upload session has expired.');
    }
    if (input.actualByteSize !== Number(session.declared_byte_size))
      throw new MediaDomainError(
        'UPLOAD_INCOMPLETE',
        'Stored object size does not match the authorized upload.',
      );
    if (input.actualContentType && input.actualContentType !== session.declared_mime_type)
      throw new MediaDomainError(
        'UPLOAD_INCOMPLETE',
        'Stored object content type does not match the authorized upload.',
      );
    const object = await sql<{ id: string }>`
      insert into media.media_objects(
        organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,
        mime_type,byte_size,checksum_sha256
      ) values (
        ${input.organizationId},${session.asset_id},'ORIGINAL',${session.storage_provider},
        ${session.bucket_name},${session.object_key},${session.declared_mime_type},
        ${input.actualByteSize},${input.checksumSha256}
      ) returning id::text
    `.execute(transaction);
    const objectId = object.rows[0]?.id;
    if (!objectId) throw new Error('Media object creation did not return an id.');
    await sql`update media.media_assets set current_object_id=${objectId}::uuid,status='UPLOADED',
      updated_at=now(),version=version+1 where id=${session.asset_id}::uuid
      and organization_id=${input.organizationId}`.execute(transaction);
    await sql`update media.media_upload_sessions set status='COMPLETED',uploaded_at=now(),completed_at=now()
      where id=${input.sessionId}::uuid`.execute(transaction);
    return { assetId: session.asset_id, status: 'UPLOADED' as const };
  });
}

export async function findGuestMediaAssetStatus(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; guestOwnerHash: string },
): Promise<{ status: string; errorMessage: string | null } | undefined> {
  const result = await sql<{ status: string; processing_error_message: string | null }>`
    select status,processing_error_message from media.media_assets
    where organization_id=${input.organizationId} and id=${input.assetId}::uuid
      and guest_owner_hash=${input.guestOwnerHash} and upload_source='CUSTOMER_REVIEW'
  `.execute(db);
  const row = result.rows[0];
  return row ? { status: row.status, errorMessage: row.processing_error_message } : undefined;
}

/** Test/migration bridge for already-owned bytes; interactive uploads use upload sessions. */
export async function registerUploadedMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    objectKey: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    byteSize: number;
    checksumSha256: string;
    visibility: MediaVisibility;
    title?: string;
    altText?: string;
    widthPx?: number;
    heightPx?: number;
  },
) {
  const policy = mediaTypePolicy(input.mimeType);
  return db.transaction().execute(async (transaction) => {
    const asset = await sql<{ id: string }>`insert into media.media_assets(
      organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,
      title,alt_text,upload_source
    ) values (${input.organizationId},'IMAGE',${input.visibility},'READY',
      ${`uploaded.${policy.extension}`},${policy.extension},${input.title ?? null},
      ${input.altText ?? null},'MIGRATION') returning id::text`.execute(transaction);
    const assetId = asset.rows[0]!.id;
    const object = await sql<{ id: string }>`insert into media.media_objects(
      organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,
      byte_size,checksum_sha256,width_px,height_px,file_format
    ) values (${input.organizationId},${assetId},'ORIGINAL','local','private',${input.objectKey},
      ${input.mimeType},${input.byteSize},${input.checksumSha256},${input.widthPx ?? null},
      ${input.heightPx ?? null},${policy.extension}) returning id::text`.execute(transaction);
    await sql`update media.media_assets set current_object_id=${object.rows[0]!.id}::uuid
      where id=${assetId}::uuid`.execute(transaction);
    return {
      id: assetId,
      visibility: input.visibility,
      status: 'READY' as const,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      objectKey: input.objectKey,
      altText: input.altText ?? null,
    };
  });
}

/** Migration/seed bridge only: runtime remote imports must download, validate, and own bytes. */
export async function registerUrlMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    url: string;
    title?: string | null;
    altText?: string | null;
    visibility?: MediaVisibility;
    widthPx?: number | null;
    heightPx?: number | null;
  },
) {
  const existing = await sql<{ id: string }>`select asset.id::text from media.media_assets asset
    join media.media_objects object on object.id=asset.current_object_id
    where asset.organization_id=${input.organizationId} and object.storage_provider='url'
      and object.object_key=${input.url} and asset.status='READY' limit 1`.execute(db);
  if (existing.rows[0]) return { id: existing.rows[0].id };
  const extension = input.url.toLowerCase().includes('.png')
    ? 'png'
    : input.url.toLowerCase().includes('.webp')
      ? 'webp'
      : 'jpg';
  const mimeType =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  return db.transaction().execute(async (transaction) => {
    const asset = await sql<{ id: string }>`insert into media.media_assets(
      organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,
      title,alt_text,upload_source
    ) values (${input.organizationId},'IMAGE',${input.visibility ?? 'PUBLIC'},'READY',
      ${new URL(input.url).pathname.split('/').at(-1) || `imported.${extension}`},${extension},
      ${input.title ?? null},${input.altText ?? null},'MIGRATION') returning id::text`.execute(
      transaction,
    );
    const assetId = asset.rows[0]!.id;
    const object = await sql<{ id: string }>`insert into media.media_objects(
      organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,
      byte_size,checksum_sha256,width_px,height_px,file_format
    ) values (${input.organizationId},${assetId},'ORIGINAL','url','external',${input.url},${mimeType},
      102400,${createHash('sha256').update(input.url).digest('hex')},${input.widthPx ?? null},
      ${input.heightPx ?? null},${extension}) returning id::text`.execute(transaction);
    await sql`update media.media_assets set current_object_id=${object.rows[0]!.id}::uuid where id=${assetId}::uuid`.execute(
      transaction,
    );
    return { id: assetId };
  });
}
