import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { setAuthStorageValue } from './platform.js';

/** Same fence for refresh, revocation and Checkout. Hash collisions only serialize work. */
export async function lockShopperSession(
  tx: Kysely<DatabaseSchema>,
  keyHash: string,
  exclusive = false,
): Promise<void> {
  if (!tx.isTransaction) throw new Error('Shopper authority requires a transaction.');
  if (exclusive)
    await sql`select pg_advisory_xact_lock(hashtextextended(${`shopper-session:${keyHash}`},0))`.execute(
      tx,
    );
  else
    await sql`select pg_advisory_xact_lock_shared(hashtextextended(${`shopper-session:${keyHash}`},0))`.execute(
      tx,
    );
}

/** A refresh started before logout must never resurrect its revoked capability. */
export async function setShopperStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
  encrypted: Buffer,
  expiresAt: Date | null,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout='2s'`.execute(tx);
    await sql`set local statement_timeout='5s'`.execute(tx);
    await lockShopperSession(tx, keyHash, true);
    const revoked =
      await sql`select 1 from iam.shopper_revoked_storage_keys where key_hash=${keyHash}`.execute(
        tx,
      );
    if (!revoked.rows.length) await setAuthStorageValue(tx, keyHash, encrypted, expiresAt);
  });
}

export async function revokeShopperStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
): Promise<Buffer | undefined> {
  return db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout='2s'`.execute(tx);
    await sql`set local statement_timeout='5s'`.execute(tx);
    await lockShopperSession(tx, keyHash, true);
    await sql`insert into iam.shopper_revoked_storage_keys(key_hash) values(${keyHash}) on conflict do nothing`.execute(
      tx,
    );
    const result = await sql<{
      encrypted_value: Buffer;
    }>`delete from iam.auth_kv_store where key_hash=${keyHash} returning case when expires_at is null or expires_at>clock_timestamp() then encrypted_value else null end as encrypted_value`.execute(
      tx,
    );
    return result.rows[0]?.encrypted_value;
  });
}
