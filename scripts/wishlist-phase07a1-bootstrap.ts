/** No .env loading; positively identified disposable target only. */
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { runMigrations } from '../packages/database/src/migrate.ts';
import { phase07aConfig, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const target = process.argv.includes('--test')
  ? phase07aConfig.testDatabaseUrl!
  : phase07aConfig.databaseUrl;
const url = new URL(target);
url.pathname = '/postgres';
const admin = createDatabase({ connectionString: url.toString(), maxConnections: 1 });
try {
  if (!process.argv.includes('--test'))
    await sql.raw('create database maevelle_ui_07a').execute(admin.db);
} finally {
  await admin.close();
}
const db = createDatabase({ connectionString: target });
try {
  const result = await runMigrations(db.db);
  console.log(JSON.stringify(result));
} finally {
  await db.close();
}
