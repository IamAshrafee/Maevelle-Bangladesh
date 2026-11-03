/** Simulate natural database TTL cutoff for one disposable synthetic identity, without changing settings. */
import { readFileSync } from 'node:fs';
import { decryptSecret } from '../packages/security/src/index.ts';
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { phase07aConfig as config, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const fixture = JSON.parse(readFileSync('/tmp/maevelle-phase07a/fixture.json', 'utf8')) as {
  users: Record<string, string>;
};
const database = createDatabase({ connectionString: config.databaseUrl });
try {
  const rows = await sql<{
    key_hash: string;
    encrypted_value: Buffer;
  }>`select key_hash,encrypted_value from iam.auth_kv_store where encrypted_value is not null`.execute(
    database.db,
  );
  let expired = 0;
  for (const row of rows.rows) {
    try {
      const value = JSON.parse(
        decryptSecret(row.encrypted_value.toString('utf8'), {
          id: 'v1',
          value: Buffer.from(config.authEncryptionKey, 'base64'),
        }),
      ) as { session?: { userId?: string }; user?: { id?: string } };
      if (
        value.session &&
        (value.session.userId === fixture.users['shopper-a'] ||
          value.user?.id === fixture.users['shopper-a'])
      ) {
        await sql`update iam.auth_kv_store set expires_at=now()-interval '1 second' where key_hash=${row.key_hash}`.execute(
          database.db,
        );
        expired++;
      }
    } catch {
      /* Non-session values use independent encryption key identifiers. */
    }
  }
  if (!expired) throw new Error('No synthetic A session found.');
  console.log(
    JSON.stringify({ expiredSyntheticASessions: expired, configuredTTLUnchanged: '12 hours' }),
  );
} finally {
  await database.close();
}
