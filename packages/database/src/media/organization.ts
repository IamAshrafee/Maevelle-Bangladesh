import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { MediaDomainError } from './types.js';

export async function listMediaFolders(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{
    id: string;
    parent_id: string | null;
    name: string;
    version: string;
    asset_count: number;
  }>`select folder.id::text,folder.parent_id::text,folder.name,folder.version::text,
      count(asset.id)::int asset_count
    from media.media_folders folder
    left join media.media_assets asset on asset.organization_id=folder.organization_id
      and asset.folder_id=folder.id and asset.status <> 'TRASHED'
    where folder.organization_id=${organizationId}
    group by folder.id order by folder.name,folder.id`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    version: Number(row.version),
    assetCount: row.asset_count,
  }));
}

export async function createMediaFolder(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; name: string; parentId?: string | null },
) {
  const name = input.name.trim();
  if (!name || name.length > 120)
    throw new MediaDomainError('VALIDATION_FAILED', 'Folder name is invalid.');
  try {
    const result = await sql<{ id: string; version: string }>`insert into media.media_folders(
      organization_id,parent_id,name
    ) values (${input.organizationId},${input.parentId ?? null},${name})
    returning id::text,version::text`.execute(db);
    return { id: result.rows[0]!.id, version: Number(result.rows[0]!.version) };
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw new MediaDomainError('CONFLICT', 'A folder with this name already exists here.');
    if ((error as { code?: string }).code === '23503')
      throw new MediaDomainError('NOT_FOUND', 'Parent folder was not found.');
    throw error;
  }
}

export async function updateMediaFolder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    folderId: string;
    expectedVersion: number;
    name: string;
    parentId?: string | null;
  },
) {
  const name = input.name.trim();
  if (!name || name.length > 120 || input.parentId === input.folderId)
    throw new MediaDomainError('VALIDATION_FAILED', 'Folder name or parent is invalid.');
  if (input.parentId) {
    const descendant = await sql<{ found: boolean }>`with recursive descendants as (
        select id from media.media_folders where organization_id=${input.organizationId}
          and parent_id=${input.folderId}::uuid
        union all
        select child.id from media.media_folders child join descendants parent
          on child.parent_id=parent.id where child.organization_id=${input.organizationId}
      ) select exists(select 1 from descendants where id=${input.parentId}::uuid) found`.execute(
      db,
    );
    if (descendant.rows[0]?.found)
      throw new MediaDomainError(
        'VALIDATION_FAILED',
        'A folder cannot be moved into its descendant.',
      );
  }
  try {
    const result = await sql<{ version: string }>`update media.media_folders set
      name=${name},parent_id=${input.parentId ?? null},updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.folderId}::uuid
        and version=${input.expectedVersion} returning version::text`.execute(db);
    if (!result.rows[0])
      throw new MediaDomainError('CONFLICT', 'Folder changed while you were editing it.');
    return { version: Number(result.rows[0].version) };
  } catch (error) {
    if (error instanceof MediaDomainError) throw error;
    if ((error as { code?: string }).code === '23505')
      throw new MediaDomainError('CONFLICT', 'A folder with this name already exists here.');
    if ((error as { code?: string }).code === '23503')
      throw new MediaDomainError('NOT_FOUND', 'Parent folder was not found.');
    throw error;
  }
}

export async function deleteMediaFolder(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; folderId: string },
): Promise<void> {
  const result = await sql`delete from media.media_folders folder
    where folder.organization_id=${input.organizationId} and folder.id=${input.folderId}::uuid
      and not exists(select 1 from media.media_folders child
        where child.organization_id=folder.organization_id and child.parent_id=folder.id)
      and not exists(select 1 from media.media_assets asset
        where asset.organization_id=folder.organization_id and asset.folder_id=folder.id)`.execute(
    db,
  );
  if (Number(result.numAffectedRows) !== 1)
    throw new MediaDomainError(
      'CONFLICT',
      'Only an empty folder without child folders can be deleted.',
    );
}

export async function listMediaTags(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{ id: string; name: string; asset_count: number }>`
    select tag.id::text,tag.name,count(link.asset_id)::int asset_count
    from media.media_tags tag left join media.media_asset_tags link
      on link.organization_id=tag.organization_id and link.tag_id=tag.id
    where tag.organization_id=${organizationId}
    group by tag.id order by tag.name,tag.id
  `.execute(db);
  return result.rows.map((row) => ({ id: row.id, name: row.name, assetCount: row.asset_count }));
}

export async function createMediaTag(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; name: string },
) {
  const name = input.name.trim();
  if (!name || name.length > 80)
    throw new MediaDomainError('VALIDATION_FAILED', 'Tag name is invalid.');
  const result = await sql<{ id: string }>`insert into media.media_tags(organization_id,name)
    values (${input.organizationId},${name}) on conflict(organization_id,name)
    do update set name=excluded.name returning id::text`.execute(db);
  return { id: result.rows[0]!.id, name };
}

export async function deleteMediaTag(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; tagId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await sql`delete from media.media_asset_tags where organization_id=${input.organizationId}
      and tag_id=${input.tagId}::uuid`.execute(transaction);
    const result =
      await sql`delete from media.media_tags where organization_id=${input.organizationId}
      and id=${input.tagId}::uuid`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new MediaDomainError('NOT_FOUND', 'Media tag was not found.');
  });
}

export async function organizeMediaAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    assetId: string;
    expectedVersion: number;
    folderId?: string | null;
    tagIds: readonly string[];
  },
) {
  const tagIds = [...new Set(input.tagIds)];
  return db.transaction().execute(async (transaction) => {
    if (input.folderId) {
      const folder = await sql`select 1 from media.media_folders where
        organization_id=${input.organizationId} and id=${input.folderId}::uuid`.execute(
        transaction,
      );
      if (!folder.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Media folder was not found.');
    }
    if (tagIds.length) {
      const ids = sql.join(tagIds.map((id) => sql`${id}::uuid`));
      const tags = await sql<{ count: number }>`select count(*)::int count from media.media_tags
        where organization_id=${input.organizationId} and id in (${ids})`.execute(transaction);
      if (tags.rows[0]?.count !== tagIds.length)
        throw new MediaDomainError('NOT_FOUND', 'One or more Media tags were not found.');
    }
    const asset = await sql<{ version: string }>`update media.media_assets set
      folder_id=${input.folderId ?? null},updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.assetId}::uuid
        and version=${input.expectedVersion} and status not in ('TRASHED','PURGING')
      returning version::text`.execute(transaction);
    if (!asset.rows[0])
      throw new MediaDomainError('CONFLICT', 'Media asset changed while you were organizing it.');
    await sql`delete from media.media_asset_tags where organization_id=${input.organizationId}
      and asset_id=${input.assetId}::uuid`.execute(transaction);
    for (const tagId of tagIds)
      await sql`insert into media.media_asset_tags(organization_id,asset_id,tag_id)
        values (${input.organizationId},${input.assetId},${tagId})`.execute(transaction);
    return { version: Number(asset.rows[0].version) };
  });
}
