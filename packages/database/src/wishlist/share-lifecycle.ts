import { recordWishlistOutcome } from '../analytics/wishlist/events.js';
import { recordExpiredWishlistShares } from '../analytics/wishlist/processing.js';
import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { WishlistOwner } from './account.js';
import { type ShareEncryptionKey, openSealedShare, sealShare, shareToken, tokenDigest } from './share-crypto.js';
import { appendAuditEvent } from '../platform.js';

export class ShareError extends Error {
  constructor(readonly code: 'INVALID_SELECTION' | 'NOT_FOUND' | 'CONFLICT', message: string) { super(message); }
}
export type ShareItem = { productId: string; preferredVariantId?: string | null };
export type CreateOptions = { operationId: string; key: ShareEncryptionKey; expiresAt: string; owner?: WishlistOwner; selection?: 'all' | 'selected'; creationScope?: 'ALL' | 'SELECTED' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const capability = /^[A-Za-z0-9_-]{43}$/;
const fail = (message: string) => new ShareError('INVALID_SELECTION', message);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest();
const expiry = (value: string) => {
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  if (!Number.isFinite(delta) || delta < 86400_000 || delta > 90 * 86400_000) throw fail('Expiration must be between one and 90 days.');
  return date.toISOString();
};

/** The operation ID is a 256-bit browser-generated recovery capability, retained for 48 hours. */
export async function createShare(db: Kysely<DatabaseSchema>, organizationId: string, requested: readonly ShareItem[], options: CreateOptions) {
  const selection = options.selection ?? 'selected';
  if (!capability.test(options.operationId) || (Buffer.isBuffer(options.key) && options.key.length !== 32)) throw fail('Invalid creation recovery credential.');
  if (selection === 'all' && !options.owner) throw fail('Guest selection must be explicit.');
  if (requested.length > 100 || (selection === 'selected' && requested.length === 0)) throw fail('Select between 1 and 100 products.');
  const items = requested.map((item) => ({ productId: item.productId.toLowerCase(), preferredVariantId: item.preferredVariantId?.toLowerCase() ?? null }));
  if (items.some((item) => !uuid.test(item.productId) || (item.preferredVariantId && !uuid.test(item.preferredVariantId))) || new Set(items.map((item) => item.productId)).size !== items.length) throw fail('Products must be distinct valid identifiers.');
  const parsedExpiry = new Date(options.expiresAt);
  if (!Number.isFinite(parsedExpiry.getTime())) throw fail('Invalid expiration.');
  const expiresAt = parsedExpiry.toISOString();
  const scope = options.owner?.accountId ?? 'guest';
  const requestDigest = hash({ selection, items, expiresAt, ...(options.creationScope ? { creationScope: options.creationScope } : {}) });
  return db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${scope}:${options.operationId}`},0))`.execute(tx);
    const prior = await sql<{ request_digest: Buffer; response_ciphertext: Buffer | null; expires_at: Date }>`
      select request_digest,response_ciphertext,expires_at from wishlist.share_create_receipts
      where organization_id=${organizationId} and owner_scope=${scope} and operation_id=${options.operationId}
    `.execute(tx);
    if (prior.rows[0]) {
      if (!prior.rows[0].request_digest.equals(requestDigest)) throw new ShareError('CONFLICT', 'Creation credential was used for another request.');
      if (prior.rows[0].expires_at.getTime() <= Date.now()) throw new ShareError('CONFLICT', 'Creation recovery has expired.');
      if (!prior.rows[0].response_ciphertext) throw new ShareError('CONFLICT', 'Creation recovery is no longer available.');
      return openSealedShare<{ id: string; viewToken: string; manageToken?: string; expiresAt: string; itemCount: number }>(prior.rows[0].response_ciphertext, options.key, `share-create:${options.operationId}`);
    }
    expiry(expiresAt);
    let selected = items;
    if (options.owner) {
      const account = await sql<{ id: string }>`
        select account.id::text from customers.customer_accounts account
        join customers.customers customer on customer.organization_id=account.organization_id and customer.id=account.customer_id
        join iam.users identity on identity.id=account.user_id
        where account.organization_id=${organizationId} and account.id=${options.owner.accountId}::uuid
          and account.status='ACTIVE' and customer.status='ACTIVE' and identity.status='ACTIVE' and identity.email_verified=true
        for update of account
      `.execute(tx);
      if (!account.rows.length) throw new ShareError('NOT_FOUND', 'Account not found.');
      const active = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
        where organization_id=${organizationId} and owner_account_id=${options.owner.accountId}::uuid
          and revoked_at is null and expires_at>now()`.execute(tx);
      if (active.rows[0]!.count >= 50) throw fail('Revoke or let an existing share expire before creating another.');
      const list = await sql<{ id: string }>`select id::text from wishlist.account_lists
        where organization_id=${organizationId} and owner_account_id=${options.owner.accountId}::uuid for share`.execute(tx);
      if (!list.rows.length) throw fail('Wishlist is empty.');
      if (selection === 'all') {
        const eligibleSaved = await sql<{ product_id: string; preferred_variant_id: string | null }>`
          select item.product_id::text,variant.id::text as preferred_variant_id
          from wishlist.account_items item
          join catalog.products product on product.organization_id=item.organization_id and product.id=item.product_id
            and product.status='ACTIVE' and product.publication_status='PUBLISHED'
          join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
          left join catalog.product_variants variant on variant.organization_id=item.organization_id
            and variant.product_id=item.product_id and variant.id=item.preferred_variant_id and variant.status='ACTIVE'
          where item.organization_id=${organizationId} and item.wishlist_id=${list.rows[0]!.id}::uuid
          order by item.saved_at desc,item.id desc limit 101`.execute(tx);
        if (eligibleSaved.rows.length > 100) throw fail('Share all supports at most 100 public products. Select a smaller collection.');
        selected = eligibleSaved.rows.map((row) => ({ productId: row.product_id, preferredVariantId: row.preferred_variant_id }));
      } else {
        const saved = await sql<{ product_id: string }>`select product_id::text from wishlist.account_items
          where organization_id=${organizationId} and wishlist_id=${list.rows[0]!.id}::uuid
            and product_id=any(${selected.map((item) => item.productId)}::uuid[])`.execute(tx);
        const byId = new Set(saved.rows.map((row) => row.product_id));
        if (selected.some((item) => !byId.has(item.productId))) throw fail('Selection contains a product outside your wishlist.');
      }
    }
    if (!selected.length) throw fail('Select at least one product.');
    const eligible = await sql<{ id: string }>`select product.id::text from catalog.products product
      join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
      where product.organization_id=${organizationId} and product.id=any(${selected.map((item) => item.productId)}::uuid[])
        and product.status='ACTIVE' and product.publication_status='PUBLISHED' for share of product`.execute(tx);
    if (eligible.rows.length !== selected.length) throw fail('One or more products are no longer public.');
    for (const item of selected) if (item.preferredVariantId) {
      const variant = await sql<{ id: string }>`select id::text from catalog.product_variants
        where organization_id=${organizationId} and product_id=${item.productId}::uuid
          and id=${item.preferredVariantId}::uuid and status='ACTIVE' for share`.execute(tx);
      if (!variant.rows.length) throw fail('Preferred variant is unavailable.');
    }
    const viewToken = shareToken();
    const manageToken = options.owner ? null : shareToken();
    const created = await sql<{ id: string; expires_at: Date }>`insert into wishlist.shares
      (organization_id,owner_account_id,view_token_digest,manage_token_digest,expires_at,creation_scope)
      values (${organizationId},${options.owner?.accountId ?? null}::uuid,${tokenDigest(viewToken)},
        ${manageToken ? tokenDigest(manageToken) : null},${expiresAt}::timestamptz,${options.owner ? selection.toUpperCase() : options.creationScope ?? 'UNKNOWN'})
      returning id::text,expires_at`.execute(tx);
    const shareId = created.rows[0]!.id;
    await sql`update wishlist.shares set view_token_ciphertext=${sealShare(viewToken, options.key, `share-view:${shareId}`)}
      where organization_id=${organizationId} and id=${shareId}::uuid`.execute(tx);
    for (const [index, item] of selected.entries()) await sql`insert into wishlist.share_items
      (organization_id,share_id,product_id,preferred_variant_id,position)
      values (${organizationId},${shareId}::uuid,${item.productId}::uuid,${item.preferredVariantId}::uuid,${index + 1})`.execute(tx);
    await recordWishlistOutcome(tx, organizationId, { name: 'wishlist.share.created', origin: options.owner ? 'ACCOUNT' : 'GUEST', scope: options.owner ? (selection === 'all' ? 'ALL' : 'SELECTED') : options.creationScope ?? 'UNKNOWN', size: selected.length });
    const result = { id: shareId, viewToken, ...(manageToken ? { manageToken } : {}),
      expiresAt: created.rows[0]!.expires_at.toISOString(), itemCount: selected.length };
    await appendAuditEvent(tx, { organizationId, actorType: options.owner ? 'USER' : 'GUEST',
      action: 'wishlist.share.created', targetType: 'wishlist.share', targetId: shareId,
      metadata: { ownership: options.owner ? 'ACCOUNT' : 'GUEST', itemCount: selected.length } });
    await sql`insert into wishlist.share_create_receipts
      (organization_id,owner_scope,operation_id,request_digest,share_id,response_ciphertext,expires_at,request_expires_at)
      values (${organizationId},${scope},${options.operationId},${requestDigest},${shareId}::uuid,
        ${sealShare(result, options.key, `share-create:${options.operationId}`)},now()+interval '48 hours',${expiresAt}::timestamptz)`.execute(tx);
    return result;
  });
}

export async function getAccountShares(db: Kysely<DatabaseSchema>, owner: WishlistOwner, limit = 30, before?: string) {
  const rows = await sql<{ id: string; created_at: Date; expires_at: Date; revoked_at: Date | null; version: string; item_count: number }>`
    select share.id::text,share.created_at,share.expires_at,share.revoked_at,share.version::text,
      (select count(*)::int from wishlist.share_items item where item.organization_id=share.organization_id and item.share_id=share.id) item_count
    from wishlist.shares share where share.organization_id=${owner.organizationId}
      and share.owner_account_id=${owner.accountId}::uuid and (${before ?? null}::uuid is null or share.id<${before ?? null}::uuid)
    order by share.id desc limit ${Math.min(Math.max(limit, 1), 100) + 1}`.execute(db);
  const page = rows.rows.slice(0, limit);
  return { items: page.map((row) => ({ id: row.id, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(),
    revoked: row.revoked_at !== null, expired: row.expires_at.getTime() <= Date.now(), version: Number(row.version), itemCount: row.item_count })),
    nextCursor: rows.rows.length > limit ? page.at(-1)!.id : null };
}

export async function getAccountShareLink(db: Kysely<DatabaseSchema>, owner: WishlistOwner, id: string, key: ShareEncryptionKey) {
  const row = await sql<{ view_token_ciphertext: Buffer | null }>`select view_token_ciphertext from wishlist.shares
    where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid and id=${id}::uuid
      and revoked_at is null and expires_at>now()`.execute(db);
  if (!row.rows[0]) throw new ShareError('NOT_FOUND', 'Share not found.');
  if (!row.rows[0].view_token_ciphertext) throw new ShareError('CONFLICT', 'This legacy share has no recoverable link.');
  return { viewToken: openSealedShare<string>(row.rows[0].view_token_ciphertext, key, `share-view:${id}`) };
}

/** Explicit rotation invalidates the old viewing capability after commit. */
export async function rotateAccountShareLink(db: Kysely<DatabaseSchema>, owner: WishlistOwner, id: string, key: ShareEncryptionKey, expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw fail('Invalid share version.');
  return db.transaction().execute(async (tx) => {
    const current = await sql<{ id: string; version: string }>`select id::text,version::text from wishlist.shares
      where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid
        and id=${id}::uuid and revoked_at is null and expires_at>now() for update`.execute(tx);
    if (!current.rows[0]) throw new ShareError('NOT_FOUND', 'Share not found.');
    if (Number(current.rows[0].version) !== expectedVersion)
      throw new ShareError('CONFLICT', 'Share changed. Retrieve the current link before rotating again.');
    const viewToken = shareToken();
    await sql`update wishlist.shares set view_token_digest=${tokenDigest(viewToken)},
      view_token_ciphertext=${sealShare(viewToken, key, `share-view:${id}`)},version=version+1
      where organization_id=${owner.organizationId} and id=${id}::uuid`.execute(tx);
    await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.share.link_rotated' });
    await appendAuditEvent(tx, { organizationId: owner.organizationId, actorType: 'USER',
      action: 'wishlist.share.link_rotated', targetType: 'wishlist.share', targetId: id });
    return { id, viewToken, version: expectedVersion + 1 };
  });
}

export async function manageAccountShare(db: Kysely<DatabaseSchema>, owner: WishlistOwner, id: string,
  action: 'inspect' | 'revoke' | 'set-expiry', expiresAt?: string) {
  const desired = action === 'set-expiry' ? expiry(expiresAt ?? '') : null;
  return db.transaction().execute(async (tx) => {
  const before = await sql<{ version: string }>`select version::text from wishlist.shares where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid and id=${id}::uuid for update`.execute(tx);
  const result = await sql<{ id: string; expires_at: Date; revoked_at: Date | null; version: string }>`
    ${action === 'inspect' ? sql`select id::text,expires_at,revoked_at,version::text from wishlist.shares`
      : action === 'revoke' ? sql`update wishlist.shares set revoked_at=coalesce(revoked_at,now()),version=case when revoked_at is null then version+1 else version end`
      : sql`update wishlist.shares set expires_at=${desired}::timestamptz,version=case when expires_at=${desired}::timestamptz then version else version+1 end`}
    where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}::uuid and id=${id}::uuid
      ${action === 'set-expiry' ? sql`and revoked_at is null and expires_at>now()` : sql``}
    ${action === 'inspect' ? sql`` : sql`returning id::text,expires_at,revoked_at,version::text`}`.execute(tx);
  if (!result.rows[0]) throw new ShareError('NOT_FOUND', 'Share not found.');
  const row = result.rows[0];
  if (action !== 'inspect' && before.rows[0] && before.rows[0].version !== row.version)
    await recordWishlistOutcome(tx, owner.organizationId, { name: action === 'revoke' ? 'wishlist.share.revoked' : 'wishlist.share.expiry_changed' });
  return { id: row.id, expiresAt: row.expires_at.toISOString(), revoked: row.revoked_at !== null,
    expired: row.expires_at.getTime() <= Date.now(), version: Number(row.version) };
  });
}

export async function claimGuestShare(db: Kysely<DatabaseSchema>, owner: WishlistOwner, id: string, manageToken: string) {
  return db.transaction().execute(async (tx) => {
    const row = await sql<{ owner_account_id: string | null; manage_token_digest: Buffer | null; claim_token_digest: Buffer | null;
      revoked_at: Date | null; expires_at: Date }>`select owner_account_id::text,manage_token_digest,claim_token_digest,revoked_at,expires_at
      from wishlist.shares where organization_id=${owner.organizationId} and id=${id}::uuid for update`.execute(tx);
    const share = row.rows[0];
    if (share?.owner_account_id === owner.accountId && share.claim_token_digest?.equals(tokenDigest(manageToken)))
      return { id, claimed: true };
    if (!share || share.owner_account_id || !share.manage_token_digest?.equals(tokenDigest(manageToken))
      || share.revoked_at || share.expires_at.getTime() <= Date.now())
      throw new ShareError('NOT_FOUND', 'Share not found.');
    const account = await sql<{ id: string }>`select account.id::text from customers.customer_accounts account
      join customers.customers customer on customer.organization_id=account.organization_id and customer.id=account.customer_id
      join iam.users identity on identity.id=account.user_id
      where account.organization_id=${owner.organizationId} and account.id=${owner.accountId}::uuid
        and account.status='ACTIVE' and customer.status='ACTIVE' and identity.status='ACTIVE' and identity.email_verified=true for share of account`.execute(tx);
    if (!account.rows[0]) throw new ShareError('NOT_FOUND', 'Account not found.');
    await sql`update wishlist.shares set owner_account_id=${owner.accountId}::uuid,
      manage_token_digest=null,claim_token_digest=${tokenDigest(manageToken)},version=version+1
      where organization_id=${owner.organizationId} and id=${id}::uuid`.execute(tx);
    await recordWishlistOutcome(tx, owner.organizationId, { name: 'wishlist.share.claimed' });
    await appendAuditEvent(tx, { organizationId: owner.organizationId, actorType: 'USER',
      action: 'wishlist.share.claimed', targetType: 'wishlist.share', targetId: id,
      metadata: { accountId: owner.accountId } });
    return { id, claimed: true };
  });
}

export async function cleanupWishlistShares(db: Kysely<DatabaseSchema>, batch = 100) {
  await recordExpiredWishlistShares(db, batch);
  const receipts = await sql`update wishlist.share_create_receipts set response_ciphertext=null where ctid in
    (select ctid from wishlist.share_create_receipts where response_ciphertext is not null
      and expires_at<now() order by expires_at limit ${batch})`.execute(db);
  const shares = await sql`delete from wishlist.shares where (revoked_at<expires_at or expiration_reported_at is not null) and coalesce(revoked_at,expires_at)<now()-interval '30 days' and id in
    (select id from wishlist.shares where (revoked_at<expires_at or expiration_reported_at is not null) and coalesce(revoked_at,expires_at)<now()-interval '30 days'
      order by coalesce(revoked_at,expires_at) limit ${batch})`.execute(db);
  const mergeReceipts = await sql`delete from wishlist.merge_receipts where ctid in
    (select ctid from wishlist.merge_receipts where expires_at<now() order by expires_at limit ${batch})`.execute(db);
  const tombstones = await sql`delete from wishlist.share_create_receipts where ctid in
    (select ctid from wishlist.share_create_receipts where response_ciphertext is null
      and request_expires_at<now() order by request_expires_at limit ${batch})`.execute(db);
  return { receipts: Number(receipts.numAffectedRows ?? 0), shares: Number(shares.numAffectedRows ?? 0),
    mergeReceipts: Number(mergeReceipts.numAffectedRows ?? 0), tombstones: Number(tombstones.numAffectedRows ?? 0) };
}

/** Public response contains only currently published catalog data; the token never confers management. */
export async function openPublicShare(db: Kysely<DatabaseSchema>, organizationId: string, token: string) {
  return db.transaction().execute(async (tx) => {
  const share = await sql<{ id: string; organization_id: string; expires_at: Date }>`select id::text,organization_id::text,expires_at
    from wishlist.shares where organization_id=${organizationId} and view_token_digest=${tokenDigest(token)}
      and revoked_at is null and expires_at>now()
    for share`.execute(tx);
  const row = share.rows[0];
  if (!row || row.expires_at.getTime() <= Date.now())
    throw new ShareError('NOT_FOUND', 'This wishlist is no longer available.');
  const rows = await sql<{ id: string; handle: string; title: string; description: string | null;
    minimum_price: string | null; available: boolean; primary_media_asset_id: string | null; preferred_variant_id: string | null }>`
    select product.id::text,product.handle,product.title,product.description,document.minimum_price::text,
      document.available,variant.id::text as preferred_variant_id,
      (select link.asset_id::text from catalog.product_media link
        join media.media_assets asset on asset.organization_id=link.organization_id and asset.id=link.asset_id
        where link.organization_id=product.organization_id and link.product_id=product.id
          and asset.status in ('READY','ARCHIVED') and asset.visibility_class='PUBLIC'
          and link.role in ('GALLERY','THUMBNAIL','COLOR_GALLERY')
        order by link.is_primary desc,link.position,link.id limit 1) primary_media_asset_id
    from wishlist.share_items item
    join catalog.products product on product.organization_id=item.organization_id and product.id=item.product_id
      and product.status='ACTIVE' and product.publication_status='PUBLISHED'
    join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
    left join catalog.product_variants variant on variant.organization_id=item.organization_id
      and variant.product_id=item.product_id and variant.id=item.preferred_variant_id and variant.status='ACTIVE'
    where item.organization_id=${row.organization_id} and item.share_id=${row.id}::uuid
    order by item.position`.execute(tx);
  const count = await sql<{ count: number }>`select count(*)::int as count from wishlist.share_items
    where organization_id=${row.organization_id} and share_id=${row.id}::uuid`.execute(tx);
  return { id: row.id, expiresAt: row.expires_at.toISOString(),
    products: rows.rows.map((product) => ({ id: product.id, handle: product.handle, title: product.title,
      description: product.description, price: product.minimum_price, available: product.available,
      primaryMediaAssetId: product.primary_media_asset_id, preferredVariantId: product.preferred_variant_id })),
    unavailableCount: count.rows[0]!.count - rows.rows.length };
  });
}

export async function manageGuestShare(db: Kysely<DatabaseSchema>, organizationId: string, token: string,
  action: 'inspect' | 'revoke' | 'set-expiry', expiresAt?: string) {
  const desired = action === 'set-expiry' ? expiry(expiresAt ?? '') : null;
  return db.transaction().execute(async (tx) => {
  const before = await sql<{ version: string }>`select version::text from wishlist.shares where organization_id=${organizationId} and manage_token_digest=${tokenDigest(token)} and owner_account_id is null for update`.execute(tx);
  const rows = await sql<{ id: string; expires_at: Date; revoked_at: Date | null; version: string }>`
    ${action === 'inspect' ? sql`select id::text,expires_at,revoked_at,version::text from wishlist.shares`
      : action === 'revoke' ? sql`update wishlist.shares set revoked_at=coalesce(revoked_at,now()),version=case when revoked_at is null then version+1 else version end`
      : sql`update wishlist.shares set expires_at=${desired}::timestamptz,version=case when expires_at=${desired}::timestamptz then version else version+1 end`}
    where organization_id=${organizationId} and manage_token_digest=${tokenDigest(token)} and owner_account_id is null
      ${action === 'set-expiry' ? sql`and revoked_at is null and expires_at>now()` : sql``}
    ${action === 'inspect' ? sql`` : sql`returning id::text,expires_at,revoked_at,version::text`}`.execute(tx);
  const row = rows.rows[0];
  if (!row) throw new ShareError('NOT_FOUND', 'Share not found.');
  if (action !== 'inspect' && before.rows[0] && before.rows[0].version !== row.version)
    await recordWishlistOutcome(tx, organizationId, { name: action === 'revoke' ? 'wishlist.share.revoked' : 'wishlist.share.expiry_changed' });
  return { id: row.id, expiresAt: row.expires_at.toISOString(), revoked: row.revoked_at !== null,
    expired: row.expires_at.getTime() <= Date.now(), version: Number(row.version) };
  });
}

export { assertShareRecoveryKeysAvailable, reencryptShareRecoveryBatch } from './share-key-migration.js';
