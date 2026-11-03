import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, sql, type DatabaseClient } from '../index.js';
import { runMigrations } from '../migrate.js';
import { createOrganization } from '../platform.js';
import { createShare, openPublicShare } from './share-lifecycle.js';
import { openSealedShare, shareKey, shareKeyRing, shareToken } from './share-crypto.js';
import {
  assertShareRecoveryKeysAvailable,
  reencryptShareRecoveryBatch,
} from './share-key-migration.js';

let admin: DatabaseClient;
let db: DatabaseClient;
let organizationId: string;
let productId: string;
const name = `maevelle_key_recovery_${crypto.randomUUID().replaceAll('-', '')}`;
const root = Buffer.alloc(32, 31).toString('base64');
const next = Buffer.alloc(32, 32).toString('base64');
const ring = shareKeyRing('current', { current: next }, root);
const retired = shareKeyRing('current', { current: next });
const options = () => ({
  key: shareKey(root),
  operationId: shareToken(),
  expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
});
beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (url.pathname !== '/maevelle_test') throw new Error('Disposable test target required.');
  url.pathname = '/postgres';
  admin = createDatabase({ connectionString: url.toString(), maxConnections: 1 });
  await sql.raw(`create database "${name}"`).execute(admin.db);
  url.pathname = `/${name}`;
  db = createDatabase({ connectionString: url.toString(), maxConnections: 4 });
  await runMigrations(db.db);
  organizationId = (
    await createOrganization(db.db, {
      code: 'recovery',
      displayName: 'Recovery test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
  const type = (
    await sql<{
      id: string;
    }>`insert into catalog.product_types(organization_id,code,name) values (${organizationId},'test','Test') returning id::text`.execute(
      db.db,
    )
  ).rows[0]!.id;
  productId = (
    await sql<{
      id: string;
    }>`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values (${organizationId},${type}::uuid,'test','Test','ACTIVE','PUBLISHED',now()) returning id::text`.execute(
      db.db,
    )
  ).rows[0]!.id;
  await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
    values (${organizationId},${productId}::uuid,'test','Test','Test',now())`.execute(db.db);
});
afterAll(async () => {
  await db?.close();
  if (admin) {
    await sql.raw(`drop database if exists "${name}"`).execute(admin.db);
    await admin.close();
  }
});

describe('versioned recovery migration', () => {
  it('resumes committed bounded batches, rejects early retirement and preserves recovery/public capabilities', async () => {
    const request = options();
    const share = await createShare(db.db, organizationId, [{ productId }], request);
    await expect(assertShareRecoveryKeysAvailable(db.db, retired)).rejects.toThrow();
    expect(await reencryptShareRecoveryBatch(db.db, ring, 1)).toEqual({ shares: 1, receipts: 0 });
    await expect(assertShareRecoveryKeysAvailable(db.db, retired)).rejects.toThrow();
    // Interruption between transactions requires no checkpoint: the committed envelope is the cursor.
    expect(await reencryptShareRecoveryBatch(db.db, ring, 1)).toEqual({ shares: 0, receipts: 1 });
    expect(await reencryptShareRecoveryBatch(db.db, ring, 1)).toEqual({ shares: 0, receipts: 0 });
    await assertShareRecoveryKeysAvailable(db.db, retired);
    expect(
      await createShare(db.db, organizationId, [{ productId }], { ...request, key: retired }),
    ).toEqual(share);
    expect((await openPublicShare(db.db, organizationId, share.viewToken)).id).toBe(share.id);
    const encrypted = (
      await sql<{
        value: Buffer;
      }>`select view_token_ciphertext as value from wishlist.shares where id=${share.id}::uuid`.execute(
        db.db,
      )
    ).rows[0]!.value;
    expect(openSealedShare(encrypted, retired, `share-view:${share.id}`)).toBe(share.viewToken);
  });
  it('rolls back the entire batch on corruption, preserves digests, then safely retries', async () => {
    const request = options();
    const share = await createShare(db.db, organizationId, [{ productId }], request);
    const original = (
      await sql<{
        value: Buffer;
      }>`select view_token_ciphertext as value from wishlist.shares where id=${share.id}::uuid`.execute(
        db.db,
      )
    ).rows[0]!.value;
    const receipt = (
      await sql<{
        value: Buffer;
      }>`select response_ciphertext as value from wishlist.share_create_receipts where operation_id=${request.operationId}`.execute(
        db.db,
      )
    ).rows[0]!.value;
    const corrupt = Buffer.from(receipt);
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
    await sql`update wishlist.share_create_receipts set response_ciphertext=${corrupt} where operation_id=${request.operationId}`.execute(
      db.db,
    );
    await expect(reencryptShareRecoveryBatch(db.db, ring, 100)).rejects.toThrow();
    const unchanged = (
      await sql<{
        value: Buffer;
      }>`select view_token_ciphertext as value from wishlist.shares where id=${share.id}::uuid`.execute(
        db.db,
      )
    ).rows[0]!.value;
    expect(unchanged.equals(original)).toBe(true);
    expect((await openPublicShare(db.db, organizationId, share.viewToken)).id).toBe(share.id);
    await sql`update wishlist.share_create_receipts set response_ciphertext=${receipt} where operation_id=${request.operationId}`.execute(
      db.db,
    );
    expect(await reencryptShareRecoveryBatch(db.db, ring, 100)).toEqual({ shares: 1, receipts: 1 });
    await assertShareRecoveryKeysAvailable(db.db, retired);
  });
  it('serializes competing re-encryption consumers without duplicate or destructive writes', async () => {
    await createShare(db.db, organizationId, [{ productId }], options());
    const results = await Promise.all([
      reencryptShareRecoveryBatch(db.db, ring, 1),
      reencryptShareRecoveryBatch(db.db, ring, 1),
    ]);
    expect(results.reduce((sum, value) => sum + value.shares + value.receipts, 0)).toBe(2);
    await assertShareRecoveryKeysAvailable(db.db, retired);
  });
});
