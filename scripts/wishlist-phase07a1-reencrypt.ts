/** Deliberately local-only rehearsal command. Never loads .env or production secrets. */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../packages/database/src/index.ts';
import { shareKeyRing } from '../packages/database/src/wishlist/share-crypto.ts';
import {
  reencryptShareRecoveryBatch,
  assertShareRecoveryKeysAvailable,
} from '../packages/database/src/wishlist/share-key-migration.ts';
import { phase07aConfig as config, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const path = '/tmp/maevelle-phase07a1-share-key.json';
if (!existsSync(path))
  writeFileSync(path, JSON.stringify({ key: randomBytes(32).toString('base64') }), { mode: 0o600 });
const { key } = JSON.parse(readFileSync(path, 'utf8')) as { key: string };
const db = createDatabase({ connectionString: config.databaseUrl });
try {
  const ring = shareKeyRing('rehearsal-2026', { 'rehearsal-2026': key }, config.authEncryptionKey);
  await assertShareRecoveryKeysAvailable(db.db, ring);
  const batch = Number(process.argv[2] ?? '100');
  const migrated = await reencryptShareRecoveryBatch(db.db, ring, batch);
  console.log(
    JSON.stringify({
      migrated,
      note: 'One bounded batch only. Repeat until empty; quiesce writers before retirement validation.',
    }),
  );
  if (process.argv.includes('--check-retirement')) {
    await assertShareRecoveryKeysAvailable(
      db.db,
      shareKeyRing('rehearsal-2026', { 'rehearsal-2026': key }),
    );
    console.log(
      'No retained recovery record requires the legacy key. AUTH_ENCRYPTION_KEY is still required by other domains.',
    );
  }
} finally {
  await db.close();
}
