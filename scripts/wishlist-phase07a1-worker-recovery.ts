/** OS-level interruption against the assignment-owned tmpfs database only. */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createDatabase, sql } from '../packages/database/src/index.ts';
import { recordWishlistOutcome } from '../packages/database/src/analytics/wishlist/events.ts';
import { phase07aConfig, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const db = createDatabase({ connectionString: phase07aConfig.databaseUrl, maxConnections: 3 });
const children: ChildProcess[] = [];
const evidence: Record<string, unknown> = {};
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
}
function start() {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/wishlist-phase07a-worker.ts'],
    { stdio: 'ignore', env: { ...process.env, EMAIL_ENABLED: 'false' } },
  );
  children.push(child);
  return child;
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGKILL');
  await ended;
}
try {
  const org = (
    await sql<{
      id: string;
    }>`select id::text from platform.organizations where code='other-07a'`.execute(db.db)
  ).rows[0]!.id;
  // Trigger pauses only a synthetic organization and only inside the projection transaction.
  await sql
    .raw(
      `create function analytics.phase07a1_pause() returns trigger language plpgsql as $$ begin if NEW.organization_id='${org}'::uuid then perform pg_sleep(30); end if; return NEW; end $$`,
    )
    .execute(db.db);
  await sql
    .raw(
      'create trigger phase07a1_pause before insert on analytics.wishlist_outcomes for each row execute function analytics.phase07a1_pause()',
    )
    .execute(db.db);
  await recordWishlistOutcome(db.db, org, { name: 'wishlist.share.link_rotated' });
  const event = (
    await sql<{
      id: string;
    }>`select max(id)::text id from platform.outbox_events where organization_id=${org}::uuid and aggregate_type='wishlist.analytics'`.execute(
      db.db,
    )
  ).rows[0]!.id;
  const worker = start();
  await until(
    async () =>
      (
        await sql<{
          count: number;
        }>`select count(*)::int count from pg_stat_activity where datname=current_database() and wait_event='PgSleep'`.execute(
          db.db,
        )
      ).rows[0]!.count > 0,
    'Worker inside projection transaction',
  );
  await kill(worker);
  // PostgreSQL can continue a long statement after the client dies. Force detection of this
  // assignment's paused connection so the test need not wait for every synthetic row sleep.
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database()
    and wait_event='PgSleep' and query like 'insert into analytics.wishlist_outcomes%'`.execute(
    db.db,
  );
  const state = async () =>
    (
      await sql<{ facts: number; receipts: number }>`select
    (select count(*)::int from analytics.wishlist_outcomes where outbox_event_id=${event}::bigint) facts,
    (select count(*)::int from analytics.projection_event_receipts where outbox_event_id=${event}::bigint and projection_name='wishlist_v1') receipts`.execute(
        db.db,
      )
    ).rows[0]!;
  const interrupted = await state();
  if (interrupted.facts !== 0 || interrupted.receipts !== 0)
    throw new Error('Interrupted transaction was not rolled back.');
  evidence.beforeCommitKill = interrupted;
  await sql.raw('drop trigger phase07a1_pause on analytics.wishlist_outcomes').execute(db.db);
  await sql.raw('drop function analytics.phase07a1_pause()').execute(db.db);
  const restarted = start();
  await until(async () => (await state()).receipts === 1, 'restart processing');
  await kill(restarted);
  evidence.afterCommitKill = await state();
  const concurrent = [start(), start()];
  // Add a healthy and a poison event; all consumers use actual Worker scheduling.
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${org}::uuid,'wishlist.share.created',1,'wishlist.analytics',${crypto.randomUUID()}::uuid,1,'{"unexpected":true}'::jsonb,now())`.execute(
    db.db,
  );
  await recordWishlistOutcome(db.db, org, { name: 'wishlist.share.revoked' });
  const healthy = (
    await sql<{
      id: string;
    }>`select max(id)::text id from platform.outbox_events where organization_id=${org}::uuid and aggregate_type='wishlist.analytics'`.execute(
      db.db,
    )
  ).rows[0]!.id;
  await until(
    async () =>
      (
        await sql<{
          n: number;
        }>`select count(*)::int n from analytics.projection_event_receipts where outbox_event_id=${healthy}::bigint and projection_name='wishlist_v1'`.execute(
          db.db,
        )
      ).rows[0]!.n === 1,
    'healthy progress past poison event',
  );
  await Promise.all(concurrent.map(kill));
  const duplicate = await state();
  if (duplicate.facts !== 1 || duplicate.receipts !== 1)
    throw new Error('Duplicate projection after restart.');
  evidence.concurrentRestartAndRedelivery = duplicate;
  evidence.poison = (
    await sql<{
      attempts: number;
    }>`select attempts from analytics.wishlist_processing_failures where organization_id=${org}::uuid`.execute(
      db.db,
    )
  ).rows;
  if (!(evidence.poison as unknown[]).length) throw new Error('Poison event not recorded.');
  evidence.note =
    'Actual Worker processes killed with SIGKILL; the paused PostgreSQL backend was then terminated to force immediate disconnect detection. Facts and receipts acknowledge atomically; there is no separate queue acknowledgment step. Cleanup interruption and large-backlog memory remain separate gates.';
  writeFileSync(
    'docs/architecture/wishlist/phase07a1-evidence/worker-recovery.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log('Worker interruption/restart/duplicate/concurrent/poison checks passed.');
} finally {
  await Promise.all(children.map(kill));
  await sql
    .raw('drop trigger if exists phase07a1_pause on analytics.wishlist_outcomes')
    .execute(db.db);
  await sql.raw('drop function if exists analytics.phase07a1_pause()').execute(db.db);
  await db.close();
}
