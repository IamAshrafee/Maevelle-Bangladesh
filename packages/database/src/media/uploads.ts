import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { withMediaTransaction } from './transaction.js';
import {
  MediaDomainError,
  type MediaStatus,
  type MediaVisibility,
  type SupportedMediaMime,
} from './types.js';

const MIME_POLICY: Record<SupportedMediaMime, { type: 'IMAGE' | 'DOCUMENT'; extension: string }> = {
  'image/jpeg': { type: 'IMAGE', extension: 'jpg' },
  'image/png': { type: 'IMAGE', extension: 'png' },
  'image/webp': { type: 'IMAGE', extension: 'webp' },
  'application/pdf': { type: 'DOCUMENT', extension: 'pdf' },
};

export const SUPPORTED_MEDIA_UPLOAD_MIME_TYPES = Object.freeze(Object.keys(MIME_POLICY) as SupportedMediaMime[]);

function safeFilename(value: string): string {
  // This intentionally strips ASCII control characters from untrusted filenames.
  const normalized = value
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
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
    uploadSource?:
      'ADMIN_UPLOAD' | 'CUSTOMER_REVIEW' | 'MESSAGING_ATTACHMENT' | 'SUPPLIER_IMPORT' | 'API';
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
  if (
    (input.uploadSource === 'CUSTOMER_REVIEW' || input.uploadSource === 'MESSAGING_ATTACHMENT') &&
    !input.guestOwnerHash
  )
    throw new MediaDomainError('VALIDATION_FAILED', 'Guest uploads require ownership.');
  return withMediaTransaction(db, async (transaction) => {
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
  input: {
    organizationId: string;
    sessionId: string;
    guestOwnerHash?: string;
    actorId?: string;
  },
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
      ${input.actorId ? sql`and session.created_by=${input.actorId}::uuid` : sql``}
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

export async function findStaffMediaAssetStatus(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId: string },
): Promise<{ status: MediaStatus; errorMessage: string | null } | undefined> {
  const result = await sql<{
    status: MediaStatus;
    processing_error_message: string | null;
  }>`select status,processing_error_message from media.media_assets
    where organization_id=${input.organizationId} and id=${input.assetId}::uuid
      and uploaded_by=${input.actorId}::uuid and upload_source='ADMIN_UPLOAD'
      and visibility_class='PRIVATE' and asset_type='IMAGE'`.execute(db);
  const row = result.rows[0];
  return row ? { status: row.status, errorMessage: row.processing_error_message } : undefined;
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
  return withMediaTransaction(db, async (transaction) => {
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
  return withMediaTransaction(db, async (transaction) => {
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
    uploadSource?: 'MIGRATION' | 'SUPPLIER_IMPORT';
  },
) {
  let location: URL;
  try {
    location = new URL(input.url);
  } catch {
    throw new MediaDomainError('VALIDATION_FAILED', 'External image URL is invalid.');
  }
  if (input.url.length > 2048 || location.protocol !== 'https:' || location.port ||
    location.username || location.password ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(location.hostname.toLowerCase()))
    throw new MediaDomainError('VALIDATION_FAILED', 'External image URL must use standard HTTPS.');
  const originalFilename = safeFilename(
    location.pathname.split('/').at(-1)?.slice(0, 255) || 'imported-image.jpg',
  );
  const extension = originalFilename.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1] ?? 'jpg';
  const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
  return withMediaTransaction(db, async (transaction) => {
    const existing = await sql<{ id: string; status: string; import_status: string }>`
      select asset.id::text,asset.status,job.status import_status
      from media.external_image_imports job join media.media_assets asset
        on asset.organization_id=job.organization_id and asset.id=job.asset_id
      where job.organization_id=${input.organizationId} and job.source_url=${input.url}
        and asset.status not in ('TRASHED','PURGING')
      order by job.created_at desc limit 1`.execute(transaction);
    if (existing.rows[0]) {
      if (existing.rows[0].status === 'FAILED' && existing.rows[0].import_status === 'FAILED') {
        await sql`update media.external_image_imports set status='PENDING',attempt_count=0,
          next_attempt_at=null,last_error_code=null,last_error_message=null,updated_at=now()
          where organization_id=${input.organizationId} and asset_id=${existing.rows[0].id}::uuid`
          .execute(transaction);
        await sql`update media.media_assets set status='PENDING_UPLOAD',
          processing_error_code=null,processing_error_message=null,updated_at=now(),version=version+1
          where organization_id=${input.organizationId} and id=${existing.rows[0].id}::uuid`
          .execute(transaction);
      }
      return { id: existing.rows[0].id };
    }
    const asset = await sql<{ id: string }>`insert into media.media_assets(
      organization_id,asset_type,visibility_class,status,original_filename,normalized_extension,
      title,alt_text,upload_source
    ) values (${input.organizationId},'IMAGE',${input.visibility ?? 'PUBLIC'},'PENDING_UPLOAD',
      ${originalFilename},${normalizedExtension},
      ${input.title ?? null},${input.altText ?? null},${input.uploadSource ?? 'MIGRATION'}) returning id::text`.execute(
      transaction,
    );
    const assetId = asset.rows[0]!.id;
    await sql`insert into media.external_image_imports(organization_id,asset_id,source_url)
      values(${input.organizationId},${assetId},${input.url})`.execute(transaction);
    return { id: assetId };
  });
}
