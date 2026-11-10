/** Actual dump/restore and Worker process rehearsal, exclusively on random local databases. */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from '../packages/database/dist/src/index.js';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { manualPaymentFixture } from '../packages/database/dist/src/testing/manual-payment-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { verifyManualPayment } from '../packages/database/dist/src/payments.js';
import {
  createCheckoutGuestSession,
  revokeCheckoutGuestSession,
  lockCheckoutAuthority,
} from '../packages/database/dist/src/checkout/index.js';
import {
  privacyBrowserSession,
  savePrivacyPreferences,
  readPrivacyPreferences,
} from '../packages/database/dist/src/analytics.js';
if (
  process.env.TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:5548/maevelle_test' ||
  !process.env.PHASE09A_RECOVERY_OUTPUT ||
  !process.env.PHASE09A_POSTGRES_BIN
)
  throw new Error(
    'Dedicated local target, explicit PostgreSQL tool directory and evidence output required.',
  );
const source = await isolatedCartDatabase(),
  restored = await isolatedCartDatabase();
const directory = await mkdtemp(join(tmpdir(), 'maevelle-phase09a-dump-'));
async function removeDisposableBackup() {
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('maevelle-phase09a-dump-')
  )
    throw new Error('Unexpected disposable backup directory; refusing cleanup.');
  await rm(directory, { recursive: true, force: true });
}
const evidence = {
  scope:
    'Local PostgreSQL 18 actual pg_dump/pg_restore; current source only, no deployed or old-image compatibility claim',
  cases: [],
};
try {
  const db = source.database.db;
  await runMigrations(db);
  const f = await manualPaymentFixture(db),
    c = await f.order();
  const payment = await verifyManualPayment(db, {
    organizationId: f.organizationId,
    actorId: f.reviewer,
    attemptId: c.attemptId,
    confirmedAmount: '100.0000',
    evidence: c.evidence,
    idempotencyKey: randomUUID(),
  });
  const guest = await createCheckoutGuestSession(db, {
    organizationId: f.organizationId,
    currency: 'BDT',
  });
  const authority = {
    kind: 'GUEST',
    organizationId: f.organizationId,
    currency: 'BDT',
    sessionId: guest.session.id,
    token: guest.token,
  };
  const owner = {
    organizationId: f.organizationId,
    binding: randomBytes(32).toString('base64url'),
    shopper: null,
  };
  const { session } = await db
    .transaction()
    .execute((tx) => privacyBrowserSession(tx, owner, undefined, true));
  const secret = randomBytes(48).toString('base64url');
  const choice = (decision, revision) => ({
    policyVersion: 'privacy-choices-v1',
    choices: Object.fromEntries(
      ['ANALYTICS', 'ADVERTISING'].map((p) => [
        p,
        { decision, expectedRevision: revision, expectedBrowserRevision: revision },
      ]),
    ),
  });
  await db
    .transaction()
    .execute((tx) => savePrivacyPreferences(tx, owner, session, choice('GRANTED', '0')));
  const tool = (name, args) => {
    const result = spawnSync(
      join(process.env.PHASE09A_POSTGRES_BIN, name + (process.platform === 'win32' ? '.exe' : '')),
      args,
      { encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error('Disposable ' + name + ' failed; inspect protected local diagnostics.');
  };
  tool('pg_dump', [
    '--dbname',
    source.url,
    '--format=custom',
    '--file',
    join(directory, 'snapshot.dump'),
  ]);
  await revokeCheckoutGuestSession(db, authority);
  await db
    .transaction()
    .execute((tx) => savePrivacyPreferences(tx, owner, session, choice('DENIED', '1')));
  tool('pg_restore', [
    '--dbname',
    restored.url,
    '--no-owner',
    '--exit-on-error',
    join(directory, 'snapshot.dump'),
  ]);
  const target = restored.database.db;
  const sum = async (d) =>
    (
      await sql`select
    (select count(*)::int from payments.payments) receipts,
    (select sum(amount_delta)::text from finance.financial_account_entries) balance,
    (select count(*)::int from platform.outbox_events) outbox`.execute(d)
    ).rows[0];
  assert.deepEqual(await sum(target), await sum(db));
  assert.equal(
    (await sql`select id from payments.payments where id=${payment.id}`.execute(target)).rows
      .length,
    1,
  );
  evidence.cases.push({
    name: 'dump/restore preserves receipt identity and financial/outbox conservation',
    status: 'PASS',
  });
  assert.equal(
    (await readPrivacyPreferences(target, owner, session, secret)).purposes.ANALYTICS
      .effectiveDecision,
    'GRANTED',
  );
  await target.transaction().execute((tx) => lockCheckoutAuthority(tx, authority));
  evidence.cases.push({
    name: 'old snapshot demonstrably predates withdrawal/revocation; reopening blocked until reconciliation',
    status: 'PASS',
  });
  await revokeCheckoutGuestSession(target, authority);
  await target
    .transaction()
    .execute((tx) => savePrivacyPreferences(tx, owner, session, choice('DENIED', '1')));
  assert.equal(
    (await readPrivacyPreferences(target, owner, session, secret)).observationToken,
    null,
  );
  await assert.rejects(target.transaction().execute((tx) => lockCheckoutAuthority(tx, authority)));
  assert.deepEqual(await sum(target), await sum(db));
  evidence.cases.push({
    name: 'scoped semantic revocation/withdrawal reconciliation preserves financial history',
    status: 'PASS',
  });
  async function startWorker() {
    const child = fork(resolve('scripts/fixtures/checkout-worker-child.mjs'), [], {
      env: { ...process.env, PHASE09A_WORKER_DATABASE: source.url },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
    });
    try {
      const [message] = await once(child, 'message', {
        signal: globalThis.AbortSignal.timeout(20000),
      });
      assert.equal(message, 'STARTED');
      return child;
    } catch (e) {
      child.kill('SIGKILL');
      throw e;
    }
  }
  let child = await startWorker();
  try {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  } finally {
    if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
  }
  child = await startWorker();
  try {
    const message = once(child, 'message', { signal: globalThis.AbortSignal.timeout(20000) }),
      exited = once(child, 'exit');
    child.send('STOP');
    assert.equal((await message)[0], 'STOPPED');
    assert.equal((await exited)[0], 0);
  } finally {
    if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
  }
  const facts = (
    await sql`select event_name,business_id,count(*)::int n from analytics.commerce_events group by event_name,business_id`.execute(
      db,
    )
  ).rows;
  assert.ok(facts.length > 0);
  assert.ok(facts.every((r) => r.n === 1));
  evidence.cases.push({
    name: 'actual Worker SIGKILL/restart then graceful IPC shutdown; unique commerce facts retained',
    status: 'PASS',
  });
  await writeFile(process.env.PHASE09A_RECOVERY_OUTPUT, JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    'Recovery rehearsal PASS: four scoped cases, actual dump/restore and actual Worker restart.',
  );
} finally {
  await source.close();
  await restored.close();
  await removeDisposableBackup();
}
