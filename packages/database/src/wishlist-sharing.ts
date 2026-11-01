import { createHash, randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';

function digest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
function token(): string { return randomBytes(32).toString('base64url'); }

export class WishlistShareError extends Error {
  constructor(public readonly code: 'INVALID_SELECTION' | 'NOT_FOUND', message: string) { super(message); }
}

export async function createGuestWishlistShare(db: Kysely<DatabaseSchema>, organizationId: string, productIds: readonly string[]) {
  if (!productIds.length || productIds.length > 100 || new Set(productIds).size !== productIds.length)
    throw new WishlistShareError('INVALID_SELECTION', 'Select between 1 and 100 distinct products.');
  const viewToken = token();
  const manageToken = token();
  const created = await db.transaction().execute(async (trx) => {
    const eligible = await sql<{ id: string }>`
      select product.id::text from catalog.products product
      join search.catalog_documents document on document.organization_id=product.organization_id and document.product_id=product.id
      where product.organization_id=${organizationId} and product.id=any(${productIds}::uuid[])
        and product.status='ACTIVE' and product.publication_status='PUBLISHED'
      for share of product
    `.execute(trx);
    if (eligible.rows.length !== productIds.length)
      throw new WishlistShareError('INVALID_SELECTION', 'One or more selected products are no longer public.');
    const share = await sql<{ id: string; expires_at: Date }>`
      insert into wishlist.shares (organization_id,view_token_digest,manage_token_digest,expires_at)
      values (${organizationId},${digest(viewToken)},${digest(manageToken)},now()+interval '30 days')
      returning id::text,expires_at
    `.execute(trx);
    const id = share.rows[0]!.id;
    for (const [index, productId] of productIds.entries()) {
      await sql`insert into wishlist.share_items (organization_id,share_id,product_id,position)
        values (${organizationId},${id},${productId},${index + 1})`.execute(trx);
    }
    return share.rows[0]!;
  });
  return { id: created.id, viewToken, manageToken, expiresAt: created.expires_at.toISOString(), itemCount: productIds.length };
}

export async function openWishlistShare(db: Kysely<DatabaseSchema>, tokenValue: string) {
  const result = await sql<{ id: string; expires_at: Date; product_id: string }>`
    select share.id::text,share.expires_at,item.product_id::text
    from wishlist.shares share join wishlist.share_items item on item.share_id=share.id
    where share.view_token_digest=${digest(tokenValue)} and share.revoked_at is null and share.expires_at>now()
    order by item.position
  `.execute(db);
  if (!result.rows.length) throw new WishlistShareError('NOT_FOUND', 'This wishlist is no longer available.');
  return { id: result.rows[0]!.id, expiresAt: result.rows[0]!.expires_at.toISOString(), productIds: result.rows.map((row) => row.product_id) };
}

/** Legacy helper retained for non-route callers; renewal requires a desired expiry. */
export async function manageWishlistShare(db: Kysely<DatabaseSchema>, tokenValue: string, action: 'inspect' | 'revoke' | 'renew', expiresAt?: string) {
  const desired = expiresAt ? new Date(expiresAt) : null;
  if (action === 'renew' && (!desired || !Number.isFinite(desired.getTime())
    || desired.getTime() - Date.now() < 86400_000 || desired.getTime() - Date.now() > 90 * 86400_000))
    throw new WishlistShareError('INVALID_SELECTION', 'Provide an expiration between one and 90 days.');
  const result = action === 'inspect'
    ? await sql<{ id: string; expires_at: Date; revoked_at: Date | null }>`
      select id::text,expires_at,revoked_at from wishlist.shares where manage_token_digest=${digest(tokenValue)}
    `.execute(db)
    : action === 'revoke'
      ? await sql<{ id: string; expires_at: Date; revoked_at: Date | null }>`
        update wishlist.shares set revoked_at=coalesce(revoked_at,now()) where manage_token_digest=${digest(tokenValue)}
        returning id::text,expires_at,revoked_at
      `.execute(db)
      : await sql<{ id: string; expires_at: Date; revoked_at: Date | null }>`
        update wishlist.shares set expires_at=${desired!.toISOString()}::timestamptz
        where manage_token_digest=${digest(tokenValue)} and revoked_at is null and expires_at>now()
        returning id::text,expires_at,revoked_at
      `.execute(db);
  const row = result.rows[0];
  if (!row) throw new WishlistShareError('NOT_FOUND', 'Shared wishlist not found.');
  return { id: row.id, expiresAt: row.expires_at.toISOString(), revoked: row.revoked_at !== null };
}
