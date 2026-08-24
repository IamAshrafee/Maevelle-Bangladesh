import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export interface PublicCategory {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly path: string;
  readonly parentId: string | null;
  readonly depth: number;
}

export interface StorefrontSearchItem {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly minimumPrice: string | null;
  readonly currency: string | null;
  readonly available: boolean;
  readonly rank: number;
}

export interface StorefrontSearchResult {
  readonly items: readonly StorefrontSearchItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly filters: {
    readonly minimumPrice: string | null;
    readonly maximumPrice: string | null;
    readonly availability: readonly ('IN_STOCK' | 'OUT_OF_STOCK')[];
  };
}

/** Rebuild is deterministic and safe to repeat; source domains are never modified. */
export async function rebuildStorefrontSearch(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<number> {
  return db.transaction().execute(async (transaction) => {
    await sql`delete from search.catalog_documents where organization_id=${organizationId}`.execute(
      transaction,
    );
    const inserted = await sql<{ product_id: string }>`
      insert into search.catalog_documents(
        organization_id,product_id,handle,title,description,search_text,category_ids,
        minimum_price,currency_code,available,published_at,projection_version
      )
      select p.organization_id,p.id,p.handle,p.title,p.description,
        concat_ws(' ',p.title,p.description,string_agg(distinct v.sku,' '),string_agg(distinct c.name,' ')),
        coalesce(array_agg(distinct pc.category_id) filter(where pc.category_id is not null),'{}'),
        min(pd.amount),min(pd.currency_code),
        coalesce(bool_or(level.sellable_quantity-level.reserved_quantity>0),false),p.published_at,1
      from catalog.products p
      left join catalog.product_variants v on v.product_id=p.id and v.status='ACTIVE'
      left join catalog.product_categories pc on pc.product_id=p.id
      left join catalog.categories c on c.id=pc.category_id and c.status='ACTIVE'
      left join pricing.price_definitions pd on pd.variant_id=v.id and pd.organization_id=p.organization_id
        and pd.status='ACTIVE' and pd.effective_from<=now() and (pd.effective_to is null or pd.effective_to>now())
      left join inventory.inventory_items item on item.variant_id=v.id and item.organization_id=p.organization_id
      left join inventory.inventory_levels level on level.inventory_item_id=item.id and level.organization_id=p.organization_id
      where p.organization_id=${organizationId} and p.status='ACTIVE' and p.publication_status='PUBLISHED'
      group by p.organization_id,p.id,p.handle,p.title,p.description,p.published_at
      returning product_id
    `.execute(transaction);
    return inserted.rows.length;
  });
}

export async function listPublicCategories(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PublicCategory[]> {
  const result = await sql<{
    id: string;
    name: string;
    handle: string;
    path: string;
    parent_id: string | null;
    depth: number;
  }>`
    with recursive tree as (
      select id,name,handle,parent_category_id,handle::text path,0 depth,position
      from catalog.categories
      where organization_id=${organizationId} and parent_category_id is null and status='ACTIVE'
      union all
      select child.id,child.name,child.handle,child.parent_category_id,
        tree.path||'/'||child.handle,tree.depth+1,child.position
      from catalog.categories child join tree on tree.id=child.parent_category_id
      where child.organization_id=${organizationId} and child.status='ACTIVE'
    )
    select id::text,name,handle,path,parent_category_id::text parent_id,depth
    from tree order by path,id
  `.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    path: row.path,
    parentId: row.parent_id,
    depth: row.depth,
  }));
}

export async function searchStorefront(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    query?: string;
    categoryId?: string;
    minimumPrice?: string;
    maximumPrice?: string;
    availability?: 'IN_STOCK' | 'OUT_OF_STOCK';
    sort?: 'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC';
    page?: number;
    pageSize?: number;
  },
): Promise<StorefrontSearchResult> {
  const query = input.query?.trim() || null;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, input.pageSize ?? 24));
  const offset = (page - 1) * pageSize;
  const sort = input.sort ?? (query ? 'RELEVANCE' : 'NEWEST');
  const result = await sql<{
    id: string;
    handle: string;
    title: string;
    description: string | null;
    minimum_price: string | null;
    currency_code: string | null;
    available: boolean;
    rank: number;
    total: string;
    facet_min: string | null;
    facet_max: string | null;
    in_stock_count: string;
    out_of_stock_count: string;
  }>`
    with matched as (
      select document.*,
        case when ${query}::text is null then 0::real else
          ts_rank_cd(document.document,websearch_to_tsquery('simple',${query}))+
          greatest(similarity(document.title,${query}),similarity(document.search_text,${query}))*0.35
        end rank
      from search.catalog_documents document
      where document.organization_id=${input.organizationId}
        and (${query}::text is null or document.document @@ websearch_to_tsquery('simple',${query})
          or similarity(document.title,${query})>0.2 or similarity(document.search_text,${query})>0.12)
        and (${input.categoryId ?? null}::uuid is null or ${input.categoryId ?? null}::uuid=any(document.category_ids))
        and (${input.minimumPrice ?? null}::numeric is null or document.minimum_price>=${input.minimumPrice ?? null}::numeric)
        and (${input.maximumPrice ?? null}::numeric is null or document.minimum_price<=${input.maximumPrice ?? null}::numeric)
        and (${input.availability ?? null}::text is null
          or (${input.availability ?? null}='IN_STOCK' and document.available)
          or (${input.availability ?? null}='OUT_OF_STOCK' and not document.available))
    ), facets as (
      select count(*) total,min(minimum_price) facet_min,max(minimum_price) facet_max,
        count(*) filter(where available) in_stock_count,count(*) filter(where not available) out_of_stock_count
      from matched
    )
    select matched.product_id::text id,matched.handle,matched.title,matched.description,
      matched.minimum_price::text,matched.currency_code,matched.available,matched.rank,
      facets.total::text,facets.facet_min::text,facets.facet_max::text,
      facets.in_stock_count::text,facets.out_of_stock_count::text
    from matched cross join facets
    order by
      case when ${sort}='RELEVANCE' then matched.rank end desc,
      case when ${sort}='PRICE_ASC' then matched.minimum_price end asc nulls last,
      case when ${sort}='PRICE_DESC' then matched.minimum_price end desc nulls last,
      matched.published_at desc,matched.product_id
    limit ${pageSize} offset ${offset}
  `.execute(db);
  const first = result.rows[0];
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      title: row.title,
      description: row.description,
      minimumPrice: row.minimum_price,
      currency: row.currency_code,
      available: row.available,
      rank: Number(row.rank),
    })),
    total: Number(first?.total ?? 0),
    page,
    pageSize,
    filters: {
      minimumPrice: first?.facet_min ?? null,
      maximumPrice: first?.facet_max ?? null,
      availability: [
        ...(Number(first?.in_stock_count ?? 0) > 0 ? (['IN_STOCK'] as const) : []),
        ...(Number(first?.out_of_stock_count ?? 0) > 0 ? (['OUT_OF_STOCK'] as const) : []),
      ],
    },
  };
}

export async function resolveProductRedirect(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  oldHandle: string,
): Promise<string | undefined> {
  const result = await sql<{ handle: string }>`
    select product.handle from catalog.product_handle_history history
    join catalog.products product on product.id=history.product_id and product.organization_id=history.organization_id
    where history.organization_id=${organizationId} and history.old_handle=${oldHandle}
      and product.status='ACTIVE' and product.publication_status='PUBLISHED'
    limit 1
  `.execute(db);
  return result.rows[0]?.handle;
}

/** Incremental worker consumption is idempotent; rebuilding remains the recovery path. */
export async function processStorefrontSearchOutbox(
  db: Kysely<DatabaseSchema>,
  limit = 25,
): Promise<number> {
  const pending = await sql<{ id: string; organization_id: string }>`
    select event.id::text,event.organization_id::text
    from platform.outbox_events event
    left join search.projection_receipts receipt on receipt.source_event_id=event.id
    where receipt.source_event_id is null and event.event_type like 'catalog.product.%'
    order by event.occurred_at,event.id limit ${limit}
  `.execute(db);
  let processed = 0;
  for (const event of pending.rows) {
    await rebuildStorefrontSearch(db, event.organization_id);
    const receipt = await sql`
      insert into search.projection_receipts(source_event_id,organization_id)
      values(${event.id}::bigint,${event.organization_id}::uuid) on conflict do nothing
    `.execute(db);
    if (Number(receipt.numAffectedRows ?? 0) > 0) processed += 1;
  }
  return processed;
}
