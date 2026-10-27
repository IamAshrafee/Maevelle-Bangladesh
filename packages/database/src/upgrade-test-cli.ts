import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { createDatabase } from './index.js';
import { migrationStatus, runMigrations } from './migrate.js';
import { migrationProvider, migrations } from './migrations/index.js';
import { upgradeCases } from './upgrade-cases.js';

const baselineLast = '3202_messaging_performance';
const urlValue = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.UPGRADE_TEST_ALLOW !== '1' || !urlValue)
  throw new Error('UPGRADE_TEST_ALLOW=1 and TEST_DATABASE_URL or DATABASE_URL are required.');
const sourceUrl = new URL(urlValue);
const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
if (!['maevelle_test', 'maevelle_ci'].includes(sourceName))
  throw new Error('Upgrade test source must be a dedicated maevelle_test or maevelle_ci database.');
if (
  !['localhost', '127.0.0.1'].includes(sourceUrl.hostname) &&
  !/^maevelle-ci-pg-[a-f0-9]{12}$/u.test(sourceUrl.hostname)
)
  throw new Error('Upgrade test source host must be local or a Maevelle CI PostgreSQL container.');

const disposableName = `maevelle_upgrade_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const disposableUrl = new URL(sourceUrl);
disposableUrl.pathname = `/${disposableName}`;
const pool = new Pool({ connectionString: adminUrl.toString() });
let database: ReturnType<typeof createDatabase> | undefined;
let created = false;

try {
  await pool.query(`create database "${disposableName}"`);
  created = true;
  database = createDatabase({ connectionString: disposableUrl.toString(), maxConnections: 2 });
  const migrator = new Migrator({ db: database.db, provider: migrationProvider });
  const baseline = await migrator.migrateTo(baselineLast);
  if (baseline.error) throw baseline.error;
  const baselineStatus = await migrationStatus(database.db);
  assert.equal(baselineStatus.filter((entry) => entry.executedAt).length, 51);

  const organization = await sql<{ id: string }>`
    insert into platform.organizations
      (code, display_name, timezone, default_locale, default_currency, status)
    values ('upgrade-fixture', 'Upgrade Fixture', 'Asia/Dhaka', 'en-BD', 'BDT', 'ACTIVE')
    returning id
  `.execute(database.db);
  const organizationId = organization.rows[0]?.id;
  assert.ok(organizationId);
  await sql`
    insert into platform.number_sequences
      (organization_id, sequence_type, prefix, counter_value, reset_policy, padding)
    values (${organizationId}, 'ORDER', 'UP-', 7, 'NEVER', 6)
  `.execute(database.db);
  await sql`
    insert into platform.configuration_values
      (organization_id, configuration_key, scope_type, value_json, definition_version)
    values (${organizationId}, 'upgrade-fixture', 'ORGANIZATION', '{"enabled":true}'::jsonb, 1)
  `.execute(database.db);

  const pending = baselineStatus.filter((entry) => !entry.executedAt).map((entry) => entry.name);
  const expectedPending = Object.keys(migrations)
    .filter((name) => name > baselineLast)
    .sort();
  assert.deepEqual(pending, expectedPending);
  for (const name of pending) {
    const upgradeCase = upgradeCases[name];
    assert.ok(upgradeCase, `Missing upgrade fixture for ${name}`);
    await upgradeCase.before(database.db, organizationId);
  }
  for (const name of Object.keys(upgradeCases)) {
    assert.ok(pending.includes(name), `Upgrade fixture ${name} has no pending migration`);
  }

  const result = await runMigrations(database.db);
  assert.deepEqual(result.executed, pending);
  for (const name of pending) await upgradeCases[name]!.after(database.db, organizationId);
  const preserved = await sql<{ count: string }>`
    select count(*)::text as count from platform.organizations o
      join platform.number_sequences n on n.organization_id = o.id
      join platform.configuration_values c on c.organization_id = o.id
    where o.id = ${organizationId} and o.code = 'upgrade-fixture'
      and n.counter_value = 7 and n.prefix = 'UP-'
      and c.value_json ->> 'enabled' = 'true'
  `.execute(database.db);
  assert.equal(preserved.rows[0]?.count, '1');
  assert.equal((await migrationStatus(database.db)).filter((entry) => !entry.executedAt).length, 0);
  assert.deepEqual((await runMigrations(database.db)).executed, []);
  console.log(
    pending.length
      ? `Upgrade PASS: ${pending.length} post-baseline migrations and representative records verified.`
      : 'Upgrade harness PASS: 51-migration baseline, representative records and rerun verified; no post-baseline migration exists yet.',
  );
} finally {
  await database?.close();
  if (created) {
    await pool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [disposableName],
    );
    await pool.query(`drop database "${disposableName}"`);
  }
  await pool.end();
}
