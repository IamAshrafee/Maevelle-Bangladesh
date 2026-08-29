import { sql, type Kysely } from 'kysely';

import { CatalogDomainError } from './catalog.js';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export type CatalogClassificationStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CatalogVocabularyKind = 'TAG' | 'OCCASION' | 'COLLECTION';

export interface CatalogCategoryView {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly status: CatalogClassificationStatus;
  readonly effectiveStatus: 'ACTIVE' | 'INACTIVE';
  readonly effectiveStatusReason: 'ACTIVE' | 'SELF_INACTIVE' | 'ANCESTOR_INACTIVE';
  readonly parentCategoryId: string | null;
  readonly path: string;
  readonly depth: number;
  readonly position: number;
  readonly productCount: number;
  readonly childCount: number;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CatalogVocabularyView {
  readonly id: string;
  readonly kind: CatalogVocabularyKind;
  readonly name: string;
  readonly handle: string;
  readonly description: string | null;
  readonly status: CatalogClassificationStatus;
  readonly position: number;
  readonly productCount: number;
  readonly version: number;
  readonly updatedAt: string;
}

type ListInput = {
  organizationId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: CatalogClassificationStatus | 'ALL';
};

function page(input: ListInput): { page: number; pageSize: number; offset: number } {
  const current = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.floor(input.pageSize ?? 20)));
  return { page: current, pageSize, offset: (current - 1) * pageSize };
}

function validateIdentity(name: string, handle: string): { name: string; handle: string } {
  const normalizedName = name.trim();
  const normalizedHandle = handle.trim().toLowerCase();
  if (!normalizedName) throw new CatalogDomainError('VALIDATION_FAILED', 'Name is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedHandle))
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Slug must contain lowercase letters, numbers, and single hyphens only.',
    );
  return { name: normalizedName, handle: normalizedHandle };
}

async function emitClassificationEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
  await sql`
    insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values
      (${input.organizationId},${input.action},1,${input.targetType},${input.targetId},1,
       ${JSON.stringify({ id: input.targetId, ...input.metadata })}::jsonb,now())
  `.execute(db);
}

export async function listCatalogCategories(
  db: Kysely<DatabaseSchema>,
  input: ListInput,
): Promise<{
  items: readonly CatalogCategoryView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  summary: { total: number; active: number; inactive: number; archived: number };
}> {
  const paging = page(input);
  const query = input.query?.trim() || null;
  const status = input.status && input.status !== 'ALL' ? input.status : null;
  const result = await sql<{
    id: string;
    name: string;
    handle: string;
    status: CatalogClassificationStatus;
    effective_active: boolean;
    ancestor_inactive: boolean;
    parent_category_id: string | null;
    path: string;
    depth: number;
    position: number;
    product_count: number;
    child_count: number;
    version: string;
    updated_at: string;
    total_count: string;
  }>`
    with recursive tree as (
      select category.id,category.name,category.handle,category.status,category.parent_category_id,
        category.position,category.version,category.updated_at,category.name::text path,0::integer depth,
        (category.status='ACTIVE') effective_active,false ancestor_inactive,array[category.id] visited
      from catalog.categories category
      where category.organization_id=${input.organizationId} and category.parent_category_id is null
      union all
      select child.id,child.name,child.handle,child.status,child.parent_category_id,
        child.position,child.version,child.updated_at,(parent.path || ' / ' || child.name)::text,
        parent.depth+1,(parent.effective_active and child.status='ACTIVE'),
        (not parent.effective_active),parent.visited || child.id
      from catalog.categories child join tree parent on parent.id=child.parent_category_id
      where child.organization_id=${input.organizationId} and not child.id=any(parent.visited)
    ), filtered as (
      select tree.*,
        (select count(*)::integer from catalog.product_categories pc
         where pc.organization_id=${input.organizationId} and pc.category_id=tree.id) product_count,
        (select count(*)::integer from catalog.categories child
         where child.organization_id=${input.organizationId} and child.parent_category_id=tree.id) child_count
      from tree
      where (${status}::text is null or tree.status=${status})
        and (${query}::text is null or tree.name ilike ('%' || ${query} || '%')
          or tree.handle ilike ('%' || ${query} || '%') or tree.path ilike ('%' || ${query} || '%'))
    )
    select *,count(*) over()::text total_count from filtered
    order by path,id limit ${paging.pageSize} offset ${paging.offset}
  `.execute(db);
  const counts = await sql<{
    total: string;
    active: string;
    inactive: string;
    archived: string;
  }>`select count(*)::text total,count(*) filter(where status='ACTIVE')::text active,
      count(*) filter(where status='INACTIVE')::text inactive,
      count(*) filter(where status='ARCHIVED')::text archived
    from catalog.categories where organization_id=${input.organizationId}`.execute(db);
  const totalItems = Number(result.rows[0]?.total_count ?? 0);
  const summary = counts.rows[0] ?? { total: '0', active: '0', inactive: '0', archived: '0' };
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      handle: row.handle,
      status: row.status,
      effectiveStatus: row.effective_active ? 'ACTIVE' : 'INACTIVE',
      effectiveStatusReason:
        row.status !== 'ACTIVE'
          ? 'SELF_INACTIVE'
          : row.ancestor_inactive
            ? 'ANCESTOR_INACTIVE'
            : 'ACTIVE',
      parentCategoryId: row.parent_category_id,
      path: row.path,
      depth: row.depth,
      position: row.position,
      productCount: row.product_count,
      childCount: row.child_count,
      version: Number(row.version),
      updatedAt: row.updated_at,
    })),
    pagination: {
      page: paging.page,
      pageSize: paging.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / paging.pageSize)),
    },
    summary: {
      total: Number(summary.total),
      active: Number(summary.active),
      inactive: Number(summary.inactive),
      archived: Number(summary.archived),
    },
  };
}

export async function createManagedCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    handle: string;
    parentCategoryId?: string;
    status?: CatalogClassificationStatus;
    position?: number;
  },
): Promise<{ id: string }> {
  const identity = validateIdentity(input.name, input.handle);
  return db.transaction().execute(async (transaction) => {
    if (input.parentCategoryId) {
      const parent = await sql<{ id: string }>`select id from catalog.categories
        where organization_id=${input.organizationId} and id=${input.parentCategoryId}`.execute(
        transaction,
      );
      if (!parent.rows[0])
        throw new CatalogDomainError('NOT_FOUND', 'Parent category was not found.');
    }
    const created = await sql<{ id: string }>`insert into catalog.categories
      (organization_id,name,handle,parent_category_id,status,position)
      values (${input.organizationId},${identity.name},${identity.handle},${input.parentCategoryId ?? null},
        ${input.status ?? 'ACTIVE'},${input.position ?? 0}) returning id`.execute(transaction);
    const id = created.rows[0]!.id;
    await emitClassificationEvent(transaction, {
      ...input,
      action: 'catalog.category.created',
      targetType: 'catalog.category',
      targetId: id,
      metadata: { handle: identity.handle, parentCategoryId: input.parentCategoryId },
    });
    return { id };
  });
}

export async function updateManagedCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    categoryId: string;
    expectedVersion: number;
    name?: string;
    handle?: string;
    status?: CatalogClassificationStatus;
    parentCategoryId?: string | null;
    position?: number;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const existing = await sql<{ name: string; handle: string; version: string }>`
      select name,handle,version::text from catalog.categories
      where organization_id=${input.organizationId} and id=${input.categoryId} for update
    `.execute(transaction);
    const category = existing.rows[0];
    if (!category) throw new CatalogDomainError('NOT_FOUND', 'Category was not found.');
    if (Number(category.version) !== input.expectedVersion)
      throw new CatalogDomainError('STALE_VERSION', 'Category changed; reload before saving.');
    const identity = validateIdentity(input.name ?? category.name, input.handle ?? category.handle);
    if (input.parentCategoryId) {
      const invalid = await sql<{ found: boolean }>`with recursive descendants as (
        select id from catalog.categories where organization_id=${input.organizationId} and id=${input.categoryId}
        union all select child.id from catalog.categories child join descendants parent
          on child.parent_category_id=parent.id where child.organization_id=${input.organizationId}
      ) select exists(select 1 from descendants where id=${input.parentCategoryId}) found`.execute(
        transaction,
      );
      if (invalid.rows[0]?.found)
        throw new CatalogDomainError(
          'CATEGORY_CYCLE',
          'A category cannot be moved under itself or one of its children.',
        );
      const parent = await sql<{ id: string }>`select id from catalog.categories
        where organization_id=${input.organizationId} and id=${input.parentCategoryId}`.execute(
        transaction,
      );
      if (!parent.rows[0])
        throw new CatalogDomainError('NOT_FOUND', 'Parent category was not found.');
    }
    if (identity.handle !== category.handle)
      await sql`insert into catalog.category_handle_history
        (organization_id,category_id,old_handle) values
        (${input.organizationId},${input.categoryId},${category.handle})`.execute(transaction);
    const parentProvided = input.parentCategoryId !== undefined;
    const updated = await sql`update catalog.categories set
      name=${identity.name},handle=${identity.handle},status=coalesce(${input.status ?? null},status),
      parent_category_id=case when ${parentProvided} then ${input.parentCategoryId ?? null}::uuid else parent_category_id end,
      position=coalesce(${input.position ?? null},position),version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.categoryId}
        and version=${input.expectedVersion}`.execute(transaction);
    if (Number(updated.numAffectedRows) !== 1)
      throw new CatalogDomainError('STALE_VERSION', 'Category changed; reload before saving.');
    await emitClassificationEvent(transaction, {
      ...input,
      action: 'catalog.category.updated',
      targetType: 'catalog.category',
      targetId: input.categoryId,
      metadata: { status: input.status, parentCategoryId: input.parentCategoryId },
    });
  });
}

export async function listCatalogVocabulary(
  db: Kysely<DatabaseSchema>,
  input: ListInput & { kind: CatalogVocabularyKind },
): Promise<{
  items: readonly CatalogVocabularyView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  summary: { total: number; active: number; inactive: number; archived: number };
}> {
  const paging = page(input);
  const query = input.query?.trim() || null;
  const status = input.status && input.status !== 'ALL' ? input.status : null;
  const result = await sql<{
    id: string;
    kind: CatalogVocabularyKind;
    name: string;
    handle: string;
    description: string | null;
    status: CatalogClassificationStatus;
    position: number;
    product_count: number;
    version: string;
    updated_at: string;
    total_count: string;
  }>`with vocabulary as (
      select tag.id,'TAG'::text kind,tag.name,tag.handle,tag.description,tag.status,0 position,
        tag.version,tag.updated_at,(select count(*)::integer from catalog.product_tags item where item.organization_id=${input.organizationId} and item.tag_id=tag.id) product_count
      from catalog.tags tag where tag.organization_id=${input.organizationId}
      union all
      select occasion.id,'OCCASION',occasion.name,occasion.handle,occasion.description,occasion.status,0,
        occasion.version,occasion.updated_at,(select count(*)::integer from catalog.product_occasions item where item.organization_id=${input.organizationId} and item.occasion_id=occasion.id)
      from catalog.occasions occasion where occasion.organization_id=${input.organizationId}
      union all
      select collection.id,'COLLECTION',collection.name,collection.handle,collection.description,collection.status,collection.position,
        collection.version,collection.updated_at,(select count(*)::integer from catalog.product_collections item where item.organization_id=${input.organizationId} and item.collection_id=collection.id)
      from catalog.collections collection where collection.organization_id=${input.organizationId}
    ), filtered as (select * from vocabulary where kind=${input.kind}
      and (${status}::text is null or status=${status})
      and (${query}::text is null or name ilike ('%' || ${query} || '%') or handle ilike ('%' || ${query} || '%')))
    select *,count(*) over()::text total_count from filtered
    order by position,name,id limit ${paging.pageSize} offset ${paging.offset}`.execute(db);
  const counts = await sql<{ total: string; active: string; inactive: string; archived: string }>`
    with vocabulary as (
      select 'TAG'::text kind,status from catalog.tags where organization_id=${input.organizationId}
      union all select 'OCCASION',status from catalog.occasions where organization_id=${input.organizationId}
      union all select 'COLLECTION',status from catalog.collections where organization_id=${input.organizationId}
    ) select count(*)::text total,count(*) filter(where status='ACTIVE')::text active,
      count(*) filter(where status='INACTIVE')::text inactive,
      count(*) filter(where status='ARCHIVED')::text archived from vocabulary where kind=${input.kind}
  `.execute(db);
  const totalItems = Number(result.rows[0]?.total_count ?? 0);
  const summary = counts.rows[0] ?? { total: '0', active: '0', inactive: '0', archived: '0' };
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      handle: row.handle,
      description: row.description,
      status: row.status,
      position: row.position,
      productCount: row.product_count,
      version: Number(row.version),
      updatedAt: row.updated_at,
    })),
    pagination: {
      page: paging.page,
      pageSize: paging.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / paging.pageSize)),
    },
    summary: {
      total: Number(summary.total),
      active: Number(summary.active),
      inactive: Number(summary.inactive),
      archived: Number(summary.archived),
    },
  };
}

export async function createCatalogVocabularyItem(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    kind: CatalogVocabularyKind;
    name: string;
    handle: string;
    description?: string;
    status?: CatalogClassificationStatus;
    position?: number;
  },
): Promise<{ id: string }> {
  const identity = validateIdentity(input.name, input.handle);
  return db.transaction().execute(async (transaction) => {
    let created: { rows: readonly { id: string }[] };
    if (input.kind === 'TAG')
      created = await sql<{
        id: string;
      }>`insert into catalog.tags (organization_id,name,handle,description,status)
        values (${input.organizationId},${identity.name},${identity.handle},${input.description?.trim() || null},${input.status ?? 'ACTIVE'}) returning id`.execute(
        transaction,
      );
    else if (input.kind === 'OCCASION')
      created = await sql<{
        id: string;
      }>`insert into catalog.occasions (organization_id,name,handle,description,status)
        values (${input.organizationId},${identity.name},${identity.handle},${input.description?.trim() || null},${input.status ?? 'ACTIVE'}) returning id`.execute(
        transaction,
      );
    else
      created = await sql<{
        id: string;
      }>`insert into catalog.collections (organization_id,name,handle,description,status,position)
        values (${input.organizationId},${identity.name},${identity.handle},${input.description?.trim() || null},${input.status ?? 'ACTIVE'},${input.position ?? 0}) returning id`.execute(
        transaction,
      );
    const id = created.rows[0]!.id;
    await emitClassificationEvent(transaction, {
      ...input,
      action: `catalog.${input.kind.toLowerCase()}.created`,
      targetType: `catalog.${input.kind.toLowerCase()}`,
      targetId: id,
      metadata: { handle: identity.handle },
    });
    return { id };
  });
}

export async function updateCatalogVocabularyItem(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    kind: CatalogVocabularyKind;
    itemId: string;
    expectedVersion: number;
    name: string;
    handle: string;
    description?: string | null;
    status: CatalogClassificationStatus;
    position?: number;
  },
): Promise<void> {
  const identity = validateIdentity(input.name, input.handle);
  await db.transaction().execute(async (transaction) => {
    let updated: { numAffectedRows?: bigint };
    if (input.kind === 'TAG')
      updated = await sql`update catalog.tags set name=${identity.name},handle=${identity.handle},
        description=${input.description?.trim() || null},status=${input.status},version=version+1,updated_at=now()
        where organization_id=${input.organizationId} and id=${input.itemId} and version=${input.expectedVersion}`.execute(
        transaction,
      );
    else if (input.kind === 'OCCASION')
      updated =
        await sql`update catalog.occasions set name=${identity.name},handle=${identity.handle},
        description=${input.description?.trim() || null},status=${input.status},version=version+1,updated_at=now()
        where organization_id=${input.organizationId} and id=${input.itemId} and version=${input.expectedVersion}`.execute(
          transaction,
        );
    else
      updated =
        await sql`update catalog.collections set name=${identity.name},handle=${identity.handle},
        description=${input.description?.trim() || null},status=${input.status},position=${input.position ?? 0},version=version+1,updated_at=now()
        where organization_id=${input.organizationId} and id=${input.itemId} and version=${input.expectedVersion}`.execute(
          transaction,
        );
    if (Number(updated.numAffectedRows ?? 0) !== 1)
      throw new CatalogDomainError('STALE_VERSION', 'This item changed; reload before saving.');
    await emitClassificationEvent(transaction, {
      ...input,
      action: `catalog.${input.kind.toLowerCase()}.updated`,
      targetType: `catalog.${input.kind.toLowerCase()}`,
      targetId: input.itemId,
      metadata: { status: input.status },
    });
  });
}

export async function setCatalogProductVocabulary(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productId: string;
    expectedVersion: number;
    tagIds: readonly string[];
    occasionIds: readonly string[];
    collectionIds: readonly string[];
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    for (const [table, ids] of [
      ['tags', [...new Set(input.tagIds)]],
      ['occasions', [...new Set(input.occasionIds)]],
      ['collections', [...new Set(input.collectionIds)]],
    ] as const) {
      if (ids.length === 0) continue;
      const source =
        table === 'tags'
          ? sql`catalog.tags`
          : table === 'occasions'
            ? sql`catalog.occasions`
            : sql`catalog.collections`;
      const valid = await sql<{ id: string }>`select id from ${source}
        where organization_id=${input.organizationId} and status='ACTIVE' and id=any(${ids}::uuid[])`.execute(
        transaction,
      );
      if (valid.rows.length !== ids.length)
        throw new CatalogDomainError(
          'VALIDATION_FAILED',
          `Every selected ${table.slice(0, -1)} must be active.`,
        );
    }
    const updated = await sql`update catalog.products set version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.productId} and version=${input.expectedVersion}`.execute(
      transaction,
    );
    if (Number(updated.numAffectedRows) !== 1)
      throw new CatalogDomainError('STALE_VERSION', 'Product changed; reload classifications.');
    await sql`delete from catalog.product_tags where organization_id=${input.organizationId} and product_id=${input.productId}`.execute(
      transaction,
    );
    await sql`delete from catalog.product_occasions where organization_id=${input.organizationId} and product_id=${input.productId}`.execute(
      transaction,
    );
    await sql`delete from catalog.product_collections where organization_id=${input.organizationId} and product_id=${input.productId}`.execute(
      transaction,
    );
    for (const id of new Set(input.tagIds))
      await sql`insert into catalog.product_tags (organization_id,product_id,tag_id) values (${input.organizationId},${input.productId},${id})`.execute(
        transaction,
      );
    for (const id of new Set(input.occasionIds))
      await sql`insert into catalog.product_occasions (organization_id,product_id,occasion_id) values (${input.organizationId},${input.productId},${id})`.execute(
        transaction,
      );
    for (const id of new Set(input.collectionIds))
      await sql`insert into catalog.product_collections (organization_id,product_id,collection_id) values (${input.organizationId},${input.productId},${id})`.execute(
        transaction,
      );
    await emitClassificationEvent(transaction, {
      ...input,
      action: 'catalog.product.classifications_updated',
      targetType: 'catalog.product',
      targetId: input.productId,
      metadata: {
        tagIds: input.tagIds,
        occasionIds: input.occasionIds,
        collectionIds: input.collectionIds,
      },
    });
  });
}
