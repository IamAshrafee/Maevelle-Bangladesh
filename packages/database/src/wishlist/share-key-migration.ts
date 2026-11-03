import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import {
  openSealedShare,
  sealShare,
  shareEnvelopePrefix,
  tokenDigest,
  ShareRecoveryError,
  type ShareKeyRing,
} from './share-crypto.js';

/** One atomic, bounded batch. No cursor is required: migrated envelopes leave the candidate set.
 * Row locks serialize rotation/cleanup; an interrupted transaction rolls back the entire batch.
 * An old application writer must be stopped before declaring the migration complete.
 */
export async function reencryptShareRecoveryBatch(
  db: Kysely<DatabaseSchema>,
  ring: ShareKeyRing,
  batch = 100,
) {
  if (ring.writeLegacy) throw new Error('Re-encryption requires versioned writes.');
  if (!Number.isSafeInteger(batch) || batch < 1 || batch > 500)
    throw new Error('Batch must be between 1 and 500.');
  const prefix = shareEnvelopePrefix(ring.activeId);
  return db.transaction().execute(async (tx) => {
    const shares = await sql<{ id: string; ciphertext: Buffer; digest: Buffer }>`
      select id::text,view_token_ciphertext as ciphertext,view_token_digest as digest
      from wishlist.shares where view_token_ciphertext is not null
        and substring(view_token_ciphertext from 1 for ${prefix.length})<>${prefix}
      order by id limit ${batch} for update skip locked`.execute(tx);
    for (const row of shares.rows) {
      const context = `share-view:${row.id}`;
      const value = openSealedShare<unknown>(row.ciphertext, ring, context);
      if (
        typeof value !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(value) ||
        !tokenDigest(value).equals(row.digest)
      )
        throw new ShareRecoveryError();
      const encrypted = sealShare(value, ring, context);
      if (openSealedShare(encrypted, ring, context) !== value) throw new ShareRecoveryError();
      await sql`update wishlist.shares set view_token_ciphertext=${encrypted} where id=${row.id}::uuid`.execute(
        tx,
      );
    }
    const receipts = await sql<{
      organization_id: string;
      owner_scope: string;
      operation_id: string;
      share_id: string | null;
      ciphertext: Buffer;
    }>`
      select organization_id::text,owner_scope,operation_id,share_id::text,response_ciphertext as ciphertext
      from wishlist.share_create_receipts where response_ciphertext is not null
        and substring(response_ciphertext from 1 for ${prefix.length})<>${prefix}
      order by organization_id,owner_scope,operation_id limit ${batch - shares.rows.length} for update skip locked`.execute(
      tx,
    );
    for (const row of receipts.rows) {
      const context = `share-create:${row.operation_id}`;
      const value = openSealedShare<{
        id: string;
        viewToken: string;
        manageToken?: string;
        expiresAt: string;
        itemCount: number;
      }>(row.ciphertext, ring, context);
      if (
        !value ||
        value.id !== row.share_id ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.viewToken) ||
        (value.manageToken !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(value.manageToken)) ||
        !Number.isFinite(Date.parse(value.expiresAt)) ||
        !Number.isInteger(value.itemCount) ||
        value.itemCount < 1 ||
        value.itemCount > 100
      )
        throw new ShareRecoveryError();
      const encrypted = sealShare(value, ring, context);
      if (JSON.stringify(openSealedShare(encrypted, ring, context)) !== JSON.stringify(value))
        throw new ShareRecoveryError();
      await sql`update wishlist.share_create_receipts set response_ciphertext=${encrypted}
        where organization_id=${row.organization_id}::uuid and owner_scope=${row.owner_scope} and operation_id=${row.operation_id}`.execute(
        tx,
      );
    }
    return { shares: shares.rows.length, receipts: receipts.rows.length };
  });
}

/** Key retirement must be checked with writers quiesced. Includes expired/revoked ciphertext until purged. */
export async function assertShareRecoveryKeysAvailable(
  db: Kysely<DatabaseSchema>,
  ring: ShareKeyRing,
) {
  const groups = await sql<{ header: Buffer }>`
    select distinct case
      when substring(ciphertext from 1 for 18) = ${Buffer.from('maevelle:share:v2:')}
        and octet_length(ciphertext)>18
      then substring(ciphertext from 1 for 19+least(get_byte(ciphertext,18),64))
      else ${Buffer.from('legacy')} end as header
    from (
      select view_token_ciphertext as ciphertext from wishlist.shares where view_token_ciphertext is not null
      union all select response_ciphertext from wishlist.share_create_receipts where response_ciphertext is not null
    ) records`.execute(db);
  const { shareEnvelopeKeyId } = await import('./share-crypto.js');
  for (const row of groups.rows) {
    const id = shareEnvelopeKeyId(Buffer.concat([row.header, Buffer.alloc(100)]));
    if (id === 'legacy' ? !ring.legacyKey : !ring.keys.has(id)) throw new ShareRecoveryError();
  }
}
