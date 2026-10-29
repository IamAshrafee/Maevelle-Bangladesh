import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { withMediaTransaction } from './transaction.js';
import { MediaDomainError, type MediaRenditionKey } from './types.js';

export async function queueMissingPublicMediaRenditions(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<void> {
  await withMediaTransaction(db, async (transaction) => {
    const result = await sql`update media.media_assets asset set status='UPLOADED',
      restore_archived_after_processing=(asset.status='ARCHIVED'),archived_at=null,
      processing_error_code=null,processing_error_message=null,updated_at=now(),version=version+1
      where asset.organization_id=${input.organizationId} and asset.id=${input.assetId}::uuid
        and asset.asset_type='IMAGE' and asset.visibility_class='PUBLIC'
        and asset.status in ('READY','ARCHIVED') and exists(
          select 1 from media.media_objects original
          where original.organization_id=asset.organization_id and original.id=asset.current_object_id
            and original.storage_provider<>'url')
        and (select count(distinct rendition.rendition_key)
          from media.media_renditions rendition
          where rendition.organization_id=asset.organization_id and rendition.asset_id=asset.id
            and rendition.source_object_id=asset.current_object_id
            and rendition.storage_provider<>'url'
            and rendition.mime_type in ('image/webp','image/avif')
            and (asset.upload_source<>'MESSAGING_ATTACHMENT' or
              rendition.rendition_key in ('thumbnail','card')))
          < case when asset.upload_source='MESSAGING_ATTACHMENT' then 2 else 4 end`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError('CONFLICT', 'This public image has no missing rendition to repair.');
    if (input.actorId) await appendAuditEvent(transaction, {
      organizationId: input.organizationId,actorType: 'USER',actorId: input.actorId,
      action: 'media.asset.rendition_repair_queued',targetType: 'media.asset',targetId: input.assetId,
    });
  });
}

export interface ClaimedMediaAsset {
  readonly assetId: string;
  readonly organizationId: string;
  readonly assetType: 'IMAGE' | 'DOCUMENT';
  readonly uploadSource: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly attempt: number;
  readonly original: {
    readonly id: string;
    readonly provider: string;
    readonly bucket: string;
    readonly objectKey: string;
    readonly mimeType: string;
    readonly byteSize: number;
  };
}

export async function claimMediaAssetForProcessing(
  db: Kysely<DatabaseSchema>,
  processorVersion: string,
): Promise<ClaimedMediaAsset | undefined> {
  return withMediaTransaction(db, async (transaction) => {
    const candidate = await sql<{
      asset_id: string;
      organization_id: string;
      asset_type: 'IMAGE' | 'DOCUMENT';
      upload_source: string;
      visibility_class: 'PUBLIC' | 'PRIVATE';
      object_id: string;
      storage_provider: string;
      bucket_name: string;
      object_key: string;
      mime_type: string;
      byte_size: string;
    }>`select asset.id::text asset_id,asset.organization_id::text,asset.asset_type,asset.upload_source,
      asset.visibility_class,
      object.id::text object_id,object.storage_provider,object.bucket_name,object.object_key,
      object.mime_type,object.byte_size::text
      from media.media_assets asset join media.media_objects object
        on object.organization_id=asset.organization_id and object.id=asset.current_object_id
      where asset.status='UPLOADED'
        or (asset.status='PROCESSING' and asset.updated_at < now()-interval '10 minutes')
      order by asset.updated_at,asset.id for update of asset skip locked limit 1`.execute(
      transaction,
    );
    const row = candidate.rows[0];
    if (!row) return undefined;
    const attemptResult = await sql<{ attempt: number }>`select coalesce(max(attempt),0)+1 attempt
      from media.media_processing_records where organization_id=${row.organization_id}
        and asset_id=${row.asset_id}::uuid`.execute(transaction);
    const attempt = attemptResult.rows[0]?.attempt ?? 1;
    await sql`update media.media_assets set status='PROCESSING',updated_at=now(),
      processing_error_code=null,processing_error_message=null where id=${row.asset_id}::uuid`.execute(
      transaction,
    );
    await sql`insert into media.media_processing_records(
      organization_id,asset_id,attempt,status,processor_version
    ) values (${row.organization_id},${row.asset_id},${attempt},'RUNNING',${processorVersion})`.execute(
      transaction,
    );
    return {
      assetId: row.asset_id,
      organizationId: row.organization_id,
      assetType: row.asset_type,
      uploadSource: row.upload_source,
      visibility: row.visibility_class,
      attempt,
      original: {
        id: row.object_id,
        provider: row.storage_provider,
        bucket: row.bucket_name,
        objectKey: row.object_key,
        mimeType: row.mime_type,
        byteSize: Number(row.byte_size),
      },
    };
  });
}

export async function completeMediaProcessing(
  db: Kysely<DatabaseSchema>,
  input: {
    asset: ClaimedMediaAsset;
    processorVersion: string;
    checksumSha256: string;
    widthPx?: number;
    heightPx?: number;
    fileFormat: string;
    renditions: readonly {
      key: MediaRenditionKey;
      provider: string;
      bucket: string;
      objectKey: string;
      mimeType: string;
      byteSize: number;
      checksumSha256: string;
      widthPx: number;
      heightPx: number;
    }[];
  },
): Promise<void> {
  await withMediaTransaction(db, async (transaction) => {
    const locked = await sql<{ status: string }>`select status from media.media_assets
      where organization_id=${input.asset.organizationId} and id=${input.asset.assetId}::uuid
      for update`.execute(transaction);
    if (locked.rows[0]?.status !== 'PROCESSING') return;
    await sql`update media.media_objects set checksum_sha256=${input.checksumSha256},
      width_px=${input.widthPx ?? null},height_px=${input.heightPx ?? null},
      file_format=${input.fileFormat}
      where organization_id=${input.asset.organizationId} and id=${input.asset.original.id}::uuid`.execute(
      transaction,
    );
    for (const rendition of input.renditions) {
      await sql`insert into media.media_renditions(
        organization_id,asset_id,source_object_id,rendition_key,storage_provider,bucket_name,
        object_key,mime_type,byte_size,checksum_sha256,width_px,height_px,processor_version
      ) values (${input.asset.organizationId},${input.asset.assetId},${input.asset.original.id},
        ${rendition.key},${rendition.provider},${rendition.bucket},${rendition.objectKey},
        ${rendition.mimeType},${rendition.byteSize},${rendition.checksumSha256},${rendition.widthPx},
        ${rendition.heightPx},${input.processorVersion})
      on conflict (organization_id,asset_id,rendition_key,processor_version) do update set
        storage_provider=excluded.storage_provider,bucket_name=excluded.bucket_name,
        object_key=excluded.object_key,mime_type=excluded.mime_type,byte_size=excluded.byte_size,
        checksum_sha256=excluded.checksum_sha256,width_px=excluded.width_px,
        height_px=excluded.height_px,created_at=now()`.execute(transaction);
    }
    await sql`update media.media_assets set
      status=case when restore_archived_after_processing or exists(select 1 from media.external_image_imports job
        where job.organization_id=${input.asset.organizationId}
          and job.asset_id=${input.asset.assetId}::uuid and job.restore_archived)
        then 'ARCHIVED' else 'READY' end,
      archived_at=case when restore_archived_after_processing or exists(select 1 from media.external_image_imports job
        where job.organization_id=${input.asset.organizationId}
          and job.asset_id=${input.asset.assetId}::uuid and job.restore_archived)
        then now() else null end,
      restore_archived_after_processing=false,updated_at=now(),version=version+1,
      processing_error_code=null,processing_error_message=null
      where organization_id=${input.asset.organizationId} and id=${input.asset.assetId}::uuid`.execute(
      transaction,
    );
    await sql`update media.media_processing_records set status='SUCCEEDED',finished_at=now()
      where organization_id=${input.asset.organizationId} and asset_id=${input.asset.assetId}::uuid
        and attempt=${input.asset.attempt}`.execute(transaction);
  });
}

export async function failMediaProcessing(
  db: Kysely<DatabaseSchema>,
  input: {
    asset: ClaimedMediaAsset;
    errorCode: string;
    errorMessage: string;
    quarantine?: boolean;
  },
): Promise<void> {
  const safeMessage = input.errorMessage.slice(0, 500);
  await withMediaTransaction(db, async (transaction) => {
    await sql`update media.media_assets set status=${input.quarantine ? 'QUARANTINED' : 'FAILED'},
      processing_error_code=${input.errorCode},processing_error_message=${safeMessage},
      updated_at=now(),version=version+1 where organization_id=${input.asset.organizationId}
      and id=${input.asset.assetId}::uuid and status='PROCESSING'`.execute(transaction);
    await sql`update media.media_processing_records set status='FAILED',error_code=${input.errorCode},
      error_message=${safeMessage},finished_at=now()
      where organization_id=${input.asset.organizationId} and asset_id=${input.asset.assetId}::uuid
        and attempt=${input.asset.attempt}`.execute(transaction);
  });
}

export async function expireMediaUploadSessions(db: Kysely<DatabaseSchema>): Promise<
  readonly {
    provider: string;
    bucket: string;
    objectKey: string;
  }[]
> {
  return withMediaTransaction(db, async (transaction) => {
    const expired = await sql<{
      asset_id: string;
      storage_provider: string;
      bucket_name: string;
      object_key: string;
    }>`update media.media_upload_sessions set status='EXPIRED',failure_code='UPLOAD_EXPIRED'
      where status='PENDING' and expires_at<now()
      returning asset_id::text,storage_provider,bucket_name,object_key`.execute(transaction);
    if (expired.rows.length)
      await sql`update media.media_assets set status='FAILED',processing_error_code='UPLOAD_EXPIRED',
        processing_error_message='Upload authorization expired before completion.',updated_at=now(),
        version=version+1 where id in (${sql.join(expired.rows.map((row) => sql`${row.asset_id}::uuid`))})
        and status='PENDING_UPLOAD'`.execute(transaction);
    return expired.rows.map((row) => ({
      provider: row.storage_provider,
      bucket: row.bucket_name,
      objectKey: row.object_key,
    }));
  });
}

export async function claimDueMediaPurge(db: Kysely<DatabaseSchema>) {
  return withMediaTransaction(db, async (transaction) => {
    const result = await sql<{
      asset_id: string;
      organization_id: string;
      storage_provider: string;
      bucket_name: string;
      object_key: string;
    }>`select asset.id::text asset_id,asset.organization_id::text,object.storage_provider,
      object.bucket_name,object.object_key from media.media_assets asset
      join media.media_objects object on object.organization_id=asset.organization_id
        and object.asset_id=asset.id
      where ((asset.status='TRASHED' and asset.purge_after<=now())
        or (asset.status='PURGING' and
          ((asset.purge_claim_token is null and coalesce(asset.purge_retry_after,asset.updated_at)<=now())
            or asset.purge_lease_until<=now())))
        and not exists(select 1 from catalog.product_media usage where usage.organization_id=asset.organization_id and usage.asset_id=asset.id)
        and not exists(select 1 from reviews.review_media usage where usage.organization_id=asset.organization_id and usage.media_asset_id=asset.id)
        and not exists(select 1 from messaging.message_attachments usage where usage.organization_id=asset.organization_id and usage.media_asset_id=asset.id)
        and not exists(select 1 from assets.media_links usage where usage.organization_id=asset.organization_id and usage.media_asset_id=asset.id)
        and not exists(select 1 from customers.customers usage where usage.organization_id=asset.organization_id and usage.profile_image_asset_id=asset.id)
      order by asset.purge_after,asset.id for update of asset skip locked limit 1`.execute(
      transaction,
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const claim = await sql<{ token: string; attempts: number }>`
      update media.media_assets set status='PURGING',purge_claim_token=uuidv7(),
        purge_lease_until=now()+interval '15 minutes',purge_retry_after=null,
        purge_last_error=null,purge_attempts=purge_attempts+1,updated_at=now(),version=version+1
      where organization_id=${row.organization_id} and id=${row.asset_id}::uuid
      returning purge_claim_token::text token,purge_attempts attempts
    `.execute(transaction);
    const renditions = await sql<{
      storage_provider: string;
      bucket_name: string;
      object_key: string;
    }>`
      select storage_provider,bucket_name,object_key from media.media_renditions
      where organization_id=${row.organization_id} and asset_id=${row.asset_id}::uuid`.execute(
      transaction,
    );
    return {
      assetId: row.asset_id,
      organizationId: row.organization_id,
      claimToken: claim.rows[0]!.token,
      attempt: claim.rows[0]!.attempts,
      objects: [
        { provider: row.storage_provider, bucket: row.bucket_name, objectKey: row.object_key },
        ...renditions.rows.map((item) => ({
          provider: item.storage_provider,
          bucket: item.bucket_name,
          objectKey: item.object_key,
        })),
      ],
    };
  });
}

export async function completeMediaPurge(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; claimToken: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const ownership = await sql<{ id: string }>`select id::text from media.media_assets
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status='PURGING' and purge_claim_token=${input.claimToken}::uuid
      for update`.execute(transaction);
    if (!ownership.rows[0]) throw new Error('Media purge claim is no longer current.');
    await sql`delete from media.media_renditions where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`update media.media_assets set current_object_id=null where organization_id=${input.organizationId}
      and id=${input.assetId}::uuid and status='PURGING'`.execute(transaction);
    await sql`delete from media.media_objects where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_asset_tags where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_usage_projection where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_usage_history where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_processing_records where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from messaging.website_attachment_uploads where organization_id=${input.organizationId}
      and media_asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from messaging.staff_attachment_uploads where organization_id=${input.organizationId}
      and media_asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_upload_sessions where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    await sql`delete from media.media_assets where organization_id=${input.organizationId}
      and id=${input.assetId}::uuid and status='PURGING'
        and purge_claim_token=${input.claimToken}::uuid`.execute(transaction);
  });
}

export async function failMediaPurge(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; claimToken: string; attempt: number; error: string },
): Promise<void> {
  const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(input.attempt - 1, 7));
  await sql`update media.media_assets set purge_claim_token=null,purge_lease_until=null,
    purge_retry_after=now()+(${delaySeconds}::text || ' seconds')::interval,
    purge_last_error=${input.error.slice(0, 500)},updated_at=now(),version=version+1
    where organization_id=${input.organizationId} and id=${input.assetId}::uuid
      and status='PURGING' and purge_claim_token=${input.claimToken}::uuid`.execute(db);
}

export async function retryFailedMediaPurge(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; assetId: string; actorId?: string },
): Promise<boolean> {
  return db.transaction().execute(async (transaction) => {
    const result = await sql`update media.media_assets set purge_retry_after=now(),
      updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and status='PURGING' and purge_claim_token is null and purge_last_error is not null`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1) return false;
    if (input.actorId) await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'media.asset.purge_retry_requested',
      targetType: 'media.asset',
      targetId: input.assetId,
    });
    return true;
  });
}
