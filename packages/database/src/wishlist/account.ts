import { recordWishlistOutcome } from '../analytics/wishlist/events.js';
import { sql, type Kysely, type Transaction } from 'kysely';
import { createHash } from 'node:crypto';
import type { DatabaseSchema } from '../index.js';
import type {
  WishlistItemDto,
  WishlistPageDto,
  WishlistSavedStateDto,
  WishlistMergeRequestDto,
  WishlistMergeReceiptDto,
} from '@maevelle/contracts';

/** Must be constructed only after a customer-controlled storefront session is verified. */
export interface WishlistOwner {
  readonly organizationId: string;
  readonly accountId: string;
}

export class AccountWishlistError extends Error {
  constructor(
    readonly code:
      'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT',
    message: string,
  ) {
    super(message);
  }
}

/** A merge is exact-version only; callers must never automatically rebase rejected snapshots. */
export async function mergeGuestWishlist(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  input: WishlistMergeRequestDto,
): Promise<WishlistMergeReceiptDto> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(input.mergeId) ||
    !Number.isSafeInteger(input.baseVersion) ||
    input.baseVersion < 1 ||
    input.items.length > 100 ||
    input.items.some(
      (item) =>
        !uuid.test(item.productId) ||
        (item.preferredVariantId !== null && !uuid.test(item.preferredVariantId)) ||
        !Number.isFinite(Date.parse(item.savedAt)),
    )
  )
    throw new AccountWishlistError('VALIDATION_FAILED', 'Invalid Wishlist merge.');
  const unique = new Map<string, WishlistMergeRequestDto['items'][number]>();
  for (const item of input.items)
    if (!unique.has(item.productId.toLowerCase()))
      unique.set(item.productId.toLowerCase(), {
        productId: item.productId.toLowerCase(),
        preferredVariantId: item.preferredVariantId?.toLowerCase() ?? null,
        savedAt: new Date(item.savedAt).toISOString(),
      });
  const items = [...unique.values()].sort((a, b) => a.productId.localeCompare(b.productId));
  const digest = createHash('sha256')
    .update(JSON.stringify({ baseVersion: input.baseVersion, items }))
    .digest();

  return db.transaction().execute(async (tx) => {
    const list = await getList(tx, owner, true);
    const locked = await sql<{ version: string }>`
      select version::text from wishlist.account_lists
      where organization_id=${owner.organizationId} and id=${list.id}::uuid for update
    `.execute(tx);
    const previous = await sql<{ request_digest: Buffer; result: WishlistMergeReceiptDto }>`
      select request_digest,result from wishlist.merge_receipts
      where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
        and merge_id=${input.mergeId}::uuid
    `.execute(tx);
    if (previous.rows[0]) {
      if (!previous.rows[0].request_digest.equals(digest))
        throw new AccountWishlistError(
          'IDEMPOTENCY_CONFLICT',
          'Merge ID was used for another request.',
        );
      return { ...previous.rows[0].result, previouslyApplied: true };
    }
    const currentVersion = Number(locked.rows[0]!.version);
    if (currentVersion !== input.baseVersion)
      throw new AccountWishlistError(
        'VERSION_CONFLICT',
        'Wishlist changed. Review it before merging again.',
      );

    const acceptedProductIds: string[] = [];
    const alreadyPresentProductIds: string[] = [];
    const rejectedItems: {
      productId: string;
      reason: 'UNAVAILABLE_PRODUCT' | 'UNAVAILABLE_VARIANT';
    }[] = [];
    const variantResults: { productId: string; preferredVariantId: string | null }[] = [];
    for (const item of items) {
      const existing = await sql<{ preferred_variant_id: string | null }>`
        select preferred_variant_id::text from wishlist.account_items
        where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
          and product_id=${item.productId}::uuid
      `.execute(tx);
      const eligible = await sql<{ id: string }>`
        select id::text from catalog.products
        where organization_id=${owner.organizationId} and id=${item.productId}::uuid
          and status='ACTIVE' and publication_status='PUBLISHED' for share
      `.execute(tx);
      if (!eligible.rows.length) {
        rejectedItems.push({ productId: item.productId, reason: 'UNAVAILABLE_PRODUCT' });
        continue;
      }
      if (existing.rows[0]?.preferred_variant_id) {
        alreadyPresentProductIds.push(item.productId);
        variantResults.push({
          productId: item.productId,
          preferredVariantId: existing.rows[0].preferred_variant_id,
        });
        continue;
      }
      if (item.preferredVariantId) {
        const variant = await sql<{ id: string }>`
          select id::text from catalog.product_variants
          where organization_id=${owner.organizationId} and product_id=${item.productId}::uuid
            and id=${item.preferredVariantId}::uuid and status='ACTIVE' for share
        `.execute(tx);
        if (!variant.rows.length) {
          rejectedItems.push({ productId: item.productId, reason: 'UNAVAILABLE_VARIANT' });
          continue;
        }
      }
      if (existing.rows[0]) {
        alreadyPresentProductIds.push(item.productId);
        if (item.preferredVariantId) {
          await sql`
            update wishlist.account_items set preferred_variant_id=${item.preferredVariantId}::uuid,
              updated_at=now(),version=version+1
            where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
              and product_id=${item.productId}::uuid
          `.execute(tx);
          acceptedProductIds.push(item.productId);
        }
      } else {
        await sql`
          insert into wishlist.account_items
            (organization_id,wishlist_id,product_id,preferred_variant_id)
          values (${owner.organizationId},${list.id}::uuid,${item.productId}::uuid,
            ${item.preferredVariantId}::uuid)
        `.execute(tx);
        acceptedProductIds.push(item.productId);
        await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.item.saved', productId: item.productId, source: 'MERGE' });
      }
      variantResults.push({
        productId: item.productId,
        preferredVariantId: item.preferredVariantId,
      });
    }
    let version = currentVersion;
    if (acceptedProductIds.length) {
      const updated = await sql<{ version: string }>`
        update wishlist.account_lists set version=version+1,updated_at=now()
        where organization_id=${owner.organizationId} and id=${list.id}::uuid
        returning version::text
      `.execute(tx);
      version = Number(updated.rows[0]!.version);
    }
    const result: WishlistMergeReceiptDto = {
      mergeId: input.mergeId,
      previouslyApplied: false,
      acceptedProductIds,
      alreadyPresentProductIds,
      rejectedProductIds: rejectedItems.map((entry) => entry.productId),
      rejectedItems,
      variantResults,
      version,
    };
    await sql`
      insert into wishlist.merge_receipts
        (organization_id,wishlist_id,merge_id,request_digest,account_version,result,expires_at)
      values (${owner.organizationId},${list.id}::uuid,${input.mergeId}::uuid,
        ${digest},${version},${JSON.stringify(result)}::jsonb,now()+interval '90 days')
    `.execute(tx);
    await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.merge.completed' });
    return result;
  });
}

interface ListRow {
  id: string;
  version: string;
}

/** Account status is rechecked for every operation, including after a session was issued. */
async function getList(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  create: boolean,
): Promise<ListRow> {
  const account = await sql<{ id: string }>`
    select account.id::text
    from customers.customer_accounts account
    join customers.customers customer
      on customer.organization_id=account.organization_id and customer.id=account.customer_id
    join iam.users user_identity on user_identity.id=account.user_id
    where account.organization_id=${owner.organizationId} and account.id=${owner.accountId}::uuid
      and account.status='ACTIVE' and customer.status='ACTIVE'
      and user_identity.status='ACTIVE' and user_identity.email_verified=true
    for share of account,customer,user_identity
  `.execute(db);
  if (!account.rows.length)
    throw new AccountWishlistError('FORBIDDEN', 'Shopper account is unavailable.');

  if (create) {
    await sql`
      insert into wishlist.account_lists (organization_id,owner_account_id)
      values (${owner.organizationId},${owner.accountId}::uuid)
      on conflict (organization_id,owner_account_id) do nothing
    `.execute(db);
  }
  const list = await sql<ListRow>`
    select id::text,version::text from wishlist.account_lists
    where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid
  `.execute(db);
  const row = list.rows[0];
  if (!row) throw new AccountWishlistError('NOT_FOUND', 'Wishlist not found.');
  return row;
}

function decodeCursor(cursor: string): { savedAt: string; id: string } {
  if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor))
    throw new AccountWishlistError('VALIDATION_FAILED', 'Invalid Wishlist cursor.');
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') throw new Error('Invalid cursor');
    const record = value as Record<string, unknown>;
    if (
      typeof record.savedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{3})?Z$/.test(record.savedAt) ||
      !Number.isFinite(Date.parse(record.savedAt)) ||
      typeof record.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id)
    )
      throw new Error('Invalid cursor');
    return { savedAt: record.savedAt, id: record.id };
  } catch {
    throw new AccountWishlistError('VALIDATION_FAILED', 'Invalid Wishlist cursor.');
  }
}

function encodeCursor(savedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ savedAt, id })).toString('base64url');
}

/** Existing items preserve saved_at and preference when PUT omits preferredVariantId. */
export async function saveWishlistProduct(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  productId: string,
  input: { preferredVariantId?: string | null; expectedVersion?: number } = {},
): Promise<{ productId: string; preferredVariantId: string | null; version: number }> {
  return db.transaction().execute(async (tx) => {
    const list = await getList(tx, owner, true);
    const locked = await sql<{ version: string }>`
      select version::text from wishlist.account_lists
      where organization_id=${owner.organizationId} and id=${list.id}::uuid for update
    `.execute(tx);
    const version = Number(locked.rows[0]!.version);
    if (input.expectedVersion !== undefined && input.expectedVersion !== version)
      throw new AccountWishlistError('VERSION_CONFLICT', 'Wishlist changed. Refresh and retry.');
    const hasPreference = Object.prototype.hasOwnProperty.call(input, 'preferredVariantId');
    const existing = await sql<{ preferred_variant_id: string | null }>`
      select preferred_variant_id::text from wishlist.account_items
      where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
        and product_id=${productId}::uuid
    `.execute(tx);
    if (
      existing.rows[0] &&
      (!hasPreference ||
        existing.rows[0].preferred_variant_id === (input.preferredVariantId ?? null))
    )
      return { productId, preferredVariantId: existing.rows[0].preferred_variant_id, version };
    const eligible = await sql<{ id: string }>`
      select id::text from catalog.products
      where organization_id=${owner.organizationId} and id=${productId}::uuid
        and status='ACTIVE' and publication_status='PUBLISHED'
      for share
    `.execute(tx);
    if (!eligible.rows.length)
      throw new AccountWishlistError('NOT_FOUND', 'Product is unavailable.');
    if (input.preferredVariantId) {
      const variant = await sql<{ id: string }>`
        select id::text from catalog.product_variants
        where organization_id=${owner.organizationId} and product_id=${productId}::uuid
          and id=${input.preferredVariantId}::uuid and status='ACTIVE'
        for share
      `.execute(tx);
      if (!variant.rows.length)
        throw new AccountWishlistError('VALIDATION_FAILED', 'Preferred variant is unavailable.');
    }
    const result = await sql<{ preferred_variant_id: string | null }>`
      insert into wishlist.account_items (organization_id,wishlist_id,product_id,preferred_variant_id)
      values (${owner.organizationId},${list.id}::uuid,${productId}::uuid,
        ${input.preferredVariantId ?? null}::uuid)
      on conflict (organization_id,wishlist_id,product_id) do update
      set preferred_variant_id=case when ${hasPreference} then excluded.preferred_variant_id
        else wishlist.account_items.preferred_variant_id end,
        updated_at=case when ${hasPreference} and wishlist.account_items.preferred_variant_id
          is distinct from excluded.preferred_variant_id then now() else wishlist.account_items.updated_at end,
        version=case when ${hasPreference} and wishlist.account_items.preferred_variant_id
          is distinct from excluded.preferred_variant_id then wishlist.account_items.version+1
          else wishlist.account_items.version end
      returning preferred_variant_id::text
    `.execute(tx);
    if (!existing.rows[0]) await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.item.saved', productId, source: 'MANUAL' });
    // The list version is a reconciliation marker, advanced for each successful command.
    const updated = await sql<{ version: string }>`
      update wishlist.account_lists set version=version+1,updated_at=now()
      where organization_id=${owner.organizationId} and id=${list.id}::uuid
      returning version::text
    `.execute(tx);
    return {
      productId,
      preferredVariantId: result.rows[0]!.preferred_variant_id,
      version: Number(updated.rows[0]!.version),
    };
  });
}

export async function removeWishlistProduct(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  productId: string,
  expectedVersion?: number,
): Promise<{ version: number }> {
  return db.transaction().execute(async (tx) => {
    const list = await getList(tx, owner, true);
    const locked = await sql<{ version: string }>`
      select version::text from wishlist.account_lists
      where organization_id=${owner.organizationId} and id=${list.id}::uuid for update
    `.execute(tx);
    const version = Number(locked.rows[0]!.version);
    if (expectedVersion !== undefined && expectedVersion !== version)
      throw new AccountWishlistError('VERSION_CONFLICT', 'Wishlist changed. Refresh and retry.');
    return removeLockedWishlistProduct(tx, owner, list.id, productId, version);
  });
}

/** Caller holds the owned list row lock and has checked its revision. */
export async function removeLockedWishlistProduct(
  tx: Transaction<DatabaseSchema>,
  owner: WishlistOwner,
  listId: string,
  productId: string,
  version: number,
): Promise<{ version: number }> {
  const deleted = await sql<{ id: string }>`
    delete from wishlist.account_items
    where organization_id=${owner.organizationId} and wishlist_id=${listId}::uuid
      and product_id=${productId}::uuid returning id::text
  `.execute(tx);
  if (!deleted.rows.length) return { version };
  await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.item.removed', productId });
  const updated = await sql<{ version: string }>`
    update wishlist.account_lists set version=version+1,updated_at=now()
    where organization_id=${owner.organizationId} and id=${listId}::uuid
    returning version::text
  `.execute(tx);
  return { version: Number(updated.rows[0]!.version) };
}

export async function getWishlistSavedState(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  productIds: readonly string[],
): Promise<WishlistSavedStateDto> {
  if (productIds.length > 100)
    throw new AccountWishlistError('VALIDATION_FAILED', 'Too many products.');
  return db.transaction().execute(async (tx) => {
    const list = await getList(tx, owner, true);
    const locked = await sql<{ version: string }>`
    select version::text from wishlist.account_lists
    where organization_id=${owner.organizationId} and id=${list.id}::uuid for share
  `.execute(tx);
    const result = await sql<{ product_id: string }>`
    select product_id::text from wishlist.account_items
    where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
      and product_id=any(${productIds}::uuid[])
  `.execute(tx);
    const count = await sql<{ count: string }>`
    select count(*)::text as count from wishlist.account_items
    where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
  `.execute(tx);
    return {
      savedProductIds: result.rows.map((row) => row.product_id),
      count: Number(count.rows[0]!.count),
      version: Number(locked.rows[0]!.version),
    };
  });
}

export async function getWishlistPage(
  db: Kysely<DatabaseSchema>,
  owner: WishlistOwner,
  input: { cursor?: string; limit?: number } = {},
): Promise<WishlistPageDto> {
  const limit = input.limit ?? 24;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new AccountWishlistError('VALIDATION_FAILED', 'Invalid page size.');
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  return db.transaction().execute(async (tx) => {
    const list = await getList(tx, owner, true);
    const locked = await sql<{ version: string }>`
    select version::text from wishlist.account_lists
    where organization_id=${owner.organizationId} and id=${list.id}::uuid for share
  `.execute(tx);
    const rows = await sql<{
      id: string;
      product_id: string;
      preferred_variant_id: string | null;
      saved_at: Date;
      cursor_saved_at: string;
      version: string;
      handle: string | null;
      title: string | null;
      minimum_price: string | null;
      available: boolean | null;
      primary_media_asset_id: string | null;
      preferred_variant_available: boolean;
    }>`
    select item.id::text,item.product_id::text,item.preferred_variant_id::text,
      item.saved_at,item.version::text,product.handle,product.title,
      to_char(item.saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_saved_at,
      document.minimum_price::text,document.available,
      coalesce(variant.status='ACTIVE',false) as preferred_variant_available,
      (select media_link.asset_id::text from catalog.product_media media_link
        join media.media_assets asset on asset.id=media_link.asset_id
          and asset.organization_id=media_link.organization_id
        where media_link.organization_id=item.organization_id
          and media_link.product_id=item.product_id
          and asset.status in ('READY','ARCHIVED') and asset.visibility_class='PUBLIC'
          and media_link.role in ('GALLERY','THUMBNAIL','COLOR_GALLERY')
        order by media_link.is_primary desc,media_link.position,media_link.id limit 1
      ) as primary_media_asset_id
    from wishlist.account_items item
    left join catalog.products product on product.organization_id=item.organization_id
      and product.id=item.product_id and product.status='ACTIVE'
      and product.publication_status='PUBLISHED'
    left join search.catalog_documents document on document.organization_id=product.organization_id
      and document.product_id=product.id
    left join catalog.product_variants variant on variant.organization_id=item.organization_id
      and variant.product_id=item.product_id and variant.id=item.preferred_variant_id
    where item.organization_id=${owner.organizationId} and item.wishlist_id=${list.id}::uuid
      and (${cursor?.savedAt ?? null}::timestamptz is null
        or (item.saved_at,item.id)<(${cursor?.savedAt ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
    order by item.saved_at desc,item.id desc limit ${limit + 1}
  `.execute(tx);
    const countResult = await sql<{ count: string }>`
    select count(*)::text as count from wishlist.account_items
    where organization_id=${owner.organizationId} and wishlist_id=${list.id}::uuid
  `.execute(tx);
    const pageRows = rows.rows.slice(0, limit);
    const items: WishlistItemDto[] = pageRows.map((row) => ({
      productId: row.product_id,
      preferredVariantId: row.preferred_variant_id,
      preferredVariantAvailable: row.preferred_variant_available,
      savedAt: row.saved_at.toISOString(),
      version: Number(row.version),
      product:
        row.handle && row.title
          ? {
              handle: row.handle,
              title: row.title,
              minimumPrice: row.minimum_price,
              available: row.available ?? false,
              primaryMediaAssetId: row.primary_media_asset_id,
            }
          : null,
    }));
    const last = pageRows.at(-1);
    return {
      items,
      count: Number(countResult.rows[0]!.count),
      version: Number(locked.rows[0]!.version),
      nextCursor: rows.rows.length > limit && last ? encodeCursor(last.cursor_saved_at, last.id) : null,
    };
  });
}
