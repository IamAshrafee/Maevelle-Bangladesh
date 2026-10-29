import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { MediaDomainError } from './types.js';

export interface ClaimedExternalImageImport {
  readonly organizationId: string;
  readonly assetId: string;
  readonly sourceUrl: string;
  readonly claimToken: string;
  readonly attempt: number;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
}

export async function claimExternalImageImport(
  db: Kysely<DatabaseSchema>,
): Promise<ClaimedExternalImageImport | undefined> {
  return db.transaction().execute(async (transaction) => {
    const found = await sql<{
      organization_id: string;
      asset_id: string;
      source_url: string;
      visibility_class: 'PUBLIC' | 'PRIVATE';
    }>`select job.organization_id::text,job.asset_id::text,job.source_url,asset.visibility_class
      from media.external_image_imports job join media.media_assets asset
        on asset.organization_id=job.organization_id and asset.id=job.asset_id
      where asset.status='PENDING_UPLOAD' and (
        job.status='PENDING' or
        (job.status='RETRY_WAIT' and job.next_attempt_at<=now()) or
        (job.status='PROCESSING' and job.lease_until<=now()))
      order by job.created_at,job.asset_id
      for update of job skip locked limit 1`.execute(transaction);
    const row = found.rows[0];
    if (!row) return undefined;
    const claimed = await sql<{ claim_token: string; attempt_count: number }>`
      update media.external_image_imports set status='PROCESSING',claim_token=uuidv7(),
        lease_until=now()+interval '15 minutes',next_attempt_at=null,
        attempt_count=attempt_count+1,updated_at=now()
      where organization_id=${row.organization_id} and asset_id=${row.asset_id}::uuid
      returning claim_token::text,attempt_count`.execute(transaction);
    return {
      organizationId: row.organization_id,
      assetId: row.asset_id,
      sourceUrl: row.source_url,
      visibility: row.visibility_class,
      claimToken: claimed.rows[0]!.claim_token,
      attempt: claimed.rows[0]!.attempt_count,
    };
  });
}

export async function completeExternalImageImport(
  db: Kysely<DatabaseSchema>,
  input: ClaimedExternalImageImport & {
    provider: string;
    bucket: string;
    objectKey: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    byteSize: number;
    checksumSha256: string;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const job = await sql<{ old_object_id: string | null }>`select old_object_id::text
      from media.external_image_imports
      where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid
        and status='PROCESSING' and claim_token=${input.claimToken}::uuid
      for update`.execute(transaction);
    if (!job.rows[0]) throw new MediaDomainError('CONFLICT', 'External import claim is no longer current.');
    const object = await sql<{ id: string }>`insert into media.media_objects
      (organization_id,asset_id,object_role,storage_provider,bucket_name,object_key,mime_type,
        byte_size,checksum_sha256,file_format)
      values(${input.organizationId},${input.assetId},'ORIGINAL',${input.provider},
        ${input.bucket},${input.objectKey},${input.mimeType},${input.byteSize},
        ${input.checksumSha256},${input.mimeType.split('/')[1]}) returning id::text`.execute(transaction);
    const assetUpdate = await sql`update media.media_assets set current_object_id=${object.rows[0]!.id}::uuid,
      status='UPLOADED',normalized_extension=${input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType.split('/')[1]},
      processing_error_code=null,processing_error_message=null,updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status='PENDING_UPLOAD'`.execute(transaction);
    if (Number(assetUpdate.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'External import asset is no longer pending.');
    if (job.rows[0].old_object_id) {
      await sql`delete from media.media_renditions where organization_id=${input.organizationId}
        and asset_id=${input.assetId}::uuid and source_object_id=${job.rows[0].old_object_id}::uuid`
        .execute(transaction);
      await sql`delete from media.media_objects where organization_id=${input.organizationId}
        and id=${job.rows[0].old_object_id}::uuid and storage_provider='url'`.execute(transaction);
    }
    await sql`update media.external_image_imports set status='COMPLETE',claim_token=null,
      lease_until=null,completed_at=now(),updated_at=now(),old_object_id=null
      where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid`.execute(transaction);
  });
}

export async function failExternalImageImport(
  db: Kysely<DatabaseSchema>,
  input: ClaimedExternalImageImport & { code: string; retryable: boolean },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const final = !input.retryable || input.attempt >= 5;
    const delaySeconds = Math.min(3600, 60 * 2 ** Math.min(input.attempt - 1, 6));
    const result = await sql`update media.external_image_imports set
      status=${final ? 'FAILED' : 'RETRY_WAIT'},claim_token=null,lease_until=null,
      next_attempt_at=${final ? null : new Date(Date.now() + delaySeconds * 1000)},
      last_error_code=${input.code},last_error_message=${input.code},updated_at=now()
      where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid
        and claim_token=${input.claimToken}::uuid and status='PROCESSING'`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1) return;
    if (final) {
      await sql`update media.media_assets set status='FAILED',
        processing_error_code='EXTERNAL_IMPORT_FAILED',
        processing_error_message=${`External image import failed: ${input.code}`},
        current_object_id=null,
        updated_at=now(),version=version+1
        where organization_id=${input.organizationId} and id=${input.assetId}::uuid
          and status='PENDING_UPLOAD'`.execute(transaction);
      await sql`delete from media.media_renditions where organization_id=${input.organizationId}
        and asset_id=${input.assetId}::uuid and source_object_id in (
          select old_object_id from media.external_image_imports
          where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid
        )`.execute(transaction);
      await sql`delete from media.media_objects where organization_id=${input.organizationId}
        and id in (select old_object_id from media.external_image_imports
          where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid)
        and storage_provider='url'`.execute(transaction);
      await sql`update media.external_image_imports set old_object_id=null
        where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid`.execute(transaction);
    }
  });
}

export async function retryExternalImageImport(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const job = await sql`update media.external_image_imports set status='PENDING',
      attempt_count=0,next_attempt_at=null,last_error_code=null,last_error_message=null,
      updated_at=now()
      where organization_id=${input.organizationId} and asset_id=${input.assetId}::uuid
        and status='FAILED' returning asset_id`.execute(transaction);
    if (Number(job.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'Only failed external imports can be retried.');
    const assetUpdate = await sql`update media.media_assets set status='PENDING_UPLOAD',
      processing_error_code=null,processing_error_message=null,updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status='FAILED'`.execute(transaction);
    if (Number(assetUpdate.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'External import asset is no longer failed.');
    if (input.actorId) await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',actorId: input.actorId,
      action: 'media.asset.external_import_retried',targetType: 'media.asset',targetId: input.assetId,
    });
  });
}
