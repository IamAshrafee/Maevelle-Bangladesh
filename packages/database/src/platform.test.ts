import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import * as platform from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

describe('durable PostgreSQL job leasing', () => {
  it('allows only one concurrent worker to claim a job and reclaims an expired lease', async () => {
    await sql`delete from platform.jobs where job_type like 'test.job.%'`.execute(database.db);
    const jobId = await platform.enqueueJob(database.db, {
      queueName: 'default',
      jobType: `test.job.${crypto.randomUUID()}`,
      payload: { test: true },
    });

    const [first, second] = await Promise.all([
      platform.claimNextJob(database.db, 'default', 'worker-one', 1),
      platform.claimNextJob(database.db, 'default', 'worker-two', 1),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(first?.id ?? second?.id).toBe(jobId);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await platform.reclaimExpiredJobs(database.db)).toBeGreaterThanOrEqual(1);
    const recovered = await platform.claimNextJob(database.db, 'default', 'worker-recovery', 60);
    expect(recovered?.id).toBe(jobId);
    await sql`delete from platform.jobs where job_type like 'test.job.%'`.execute(database.db);
  });
});

describe('operational rollout controls', () => {
  it('distinguishes kill switches from settings and disables only new side effects', async () => {
    const organizationId = await createTestOrganization('controls');
    expect(
      await platform.isOperationalControlEnabled(database.db, organizationId, 'checkout_enabled'),
    ).toBe(true);
    await platform.setOperationalControl(database.db, {
      organizationId,
      key: 'checkout_enabled',
      type: 'KILL_SWITCH',
      enabled: false,
      reason: 'Repository recovery drill',
    });
    expect(
      await platform.isOperationalControlEnabled(database.db, organizationId, 'checkout_enabled'),
    ).toBe(false);
    const outboxBefore = await sql<{
      count: string;
    }>`select count(*)::text count from platform.outbox_events where organization_id=${organizationId}`.execute(
      database.db,
    );
    expect(outboxBefore.rows[0]?.count).toBe('0');
  });
});

async function createTestOrganization(label: string): Promise<string> {
  const organization = await platform.createOrganization(database.db, {
    code: `test-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `Test ${label}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  return organization.id;
}

describe('platform audit, idempotency, and outbox foundations', () => {
  it('starts a fresh encrypted-auth rate-limit window after a prior window expires', async () => {
    const keyHash = `test-rate-limit-${crypto.randomUUID()}`;

    expect(await platform.incrementAuthStorageValue(database.db, keyHash, 60)).toBe(1);
    expect(await platform.incrementAuthStorageValue(database.db, keyHash, 60)).toBe(2);
    await sql`
      update iam.auth_kv_store
      set expires_at = now() - interval '1 second'
      where key_hash = ${keyHash}
    `.execute(database.db);

    expect(await platform.incrementAuthStorageValue(database.db, keyHash, 60)).toBe(1);
    const expiry = await sql<{ active: boolean }>`
      select expires_at > now() as active
      from iam.auth_kv_store
      where key_hash = ${keyHash}
    `.execute(database.db);
    expect(expiry.rows[0]?.active).toBe(true);

    await sql`delete from iam.auth_kv_store where key_hash = ${keyHash}`.execute(database.db);
  });

  it('appends historical audit evidence and redacts credential-shaped metadata', async () => {
    const organizationId = await createTestOrganization('audit');
    const password = 'do-not-persist-password';
    const sessionToken = 'do-not-persist-session-token';
    const totpSecret = 'do-not-persist-totp-secret';

    await platform.appendAuditEvent(database.db, {
      organizationId,
      actorType: 'USER',
      action: 'test.audit.append',
      targetType: 'test-audit',
      metadata: {
        safe: 'retained',
        password,
        nested: { sessionToken, totpSecret },
      },
    });
    const event = await sql<{
      metadata: { safe: string; password: string; nested: Record<string, string> };
    }>`
      select metadata from audit.audit_events
      where organization_id = ${organizationId} and action = 'test.audit.append'
      order by id desc limit 1
    `.execute(database.db);
    const metadata = event.rows[0]?.metadata;

    expect(metadata).toEqual({
      safe: 'retained',
      password: '[REDACTED]',
      nested: { sessionToken: '[REDACTED]', totpSecret: '[REDACTED]' },
    });
    expect(JSON.stringify(metadata)).not.toContain(password);
    expect(JSON.stringify(metadata)).not.toContain(sessionToken);
    expect(JSON.stringify(metadata)).not.toContain(totpSecret);
    expect(platform).not.toHaveProperty('updateAuditEvent');
    expect(platform).not.toHaveProperty('deleteAuditEvent');

    await sql`delete from audit.audit_events where organization_id = ${organizationId}`.execute(
      database.db,
    );
    await sql`delete from platform.organizations where id = ${organizationId}`.execute(database.db);
  });

  it('uses one canonical idempotency record per tenant request identity', async () => {
    const organizationA = await createTestOrganization('idempotency-a');
    const organizationB = await createTestOrganization('idempotency-b');
    const principalId = crypto.randomUUID();
    const input = {
      principalType: 'USER',
      principalId,
      operationType: 'test.operation',
      idempotencyKey: `test-key-${crypto.randomUUID()}`,
      requestFingerprint: 'fingerprint-a',
    };

    const first = await platform.claimIdempotencyRecord(database.db, {
      ...input,
      organizationId: organizationA,
    });
    const repeated = await platform.claimIdempotencyRecord(database.db, {
      ...input,
      organizationId: organizationA,
    });
    expect(first.created).toBe(true);
    expect(repeated).toMatchObject({
      id: first.id,
      created: false,
      requestFingerprint: 'fingerprint-a',
    });
    await expect(
      platform.claimIdempotencyRecord(database.db, {
        ...input,
        organizationId: organizationA,
        requestFingerprint: 'fingerprint-b',
      }),
    ).rejects.toBeInstanceOf(platform.IdempotencyKeyReuseError);

    const otherTenant = await platform.claimIdempotencyRecord(database.db, {
      ...input,
      organizationId: organizationB,
    });
    expect(otherTenant.id).not.toBe(first.id);

    const concurrentInput = {
      ...input,
      organizationId: organizationA,
      idempotencyKey: `concurrent-${crypto.randomUUID()}`,
    };
    const concurrent = await Promise.all(
      Array.from({ length: 2 }, () =>
        platform.claimIdempotencyRecord(database.db, concurrentInput),
      ),
    );
    expect(new Set(concurrent.map((record) => record.id))).toHaveLength(1);
    expect(concurrent.filter((record) => record.created)).toHaveLength(1);

    await sql`delete from platform.idempotency_records where organization_id in (${organizationA}, ${organizationB})`.execute(
      database.db,
    );
    await sql`delete from platform.organizations where id in (${organizationA}, ${organizationB})`.execute(
      database.db,
    );
  });

  it('keeps outbox consumer progress independent and prevents duplicate receipts', async () => {
    const organizationId = await createTestOrganization('outbox');
    const event = await sql<{ id: string }>`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, payload, occurred_at
      ) values (
        ${organizationId}, 'test.outbox.event', 1, 'test-aggregate', ${crypto.randomUUID()}, '{}'::jsonb, now()
      ) returning id::text
    `.execute(database.db);
    const eventId = Number(event.rows[0]?.id);
    expect(eventId).toBeGreaterThan(0);

    await sql`
      insert into platform.event_consumer_receipts (outbox_event_id, consumer_name, status, processed_at)
      values (${eventId}, 'consumer-a', 'COMPLETED', now())
    `.execute(database.db);
    const beforeB = await sql<{ count: string }>`
      select count(*)::text as count from platform.event_consumer_receipts
      where outbox_event_id = ${eventId} and consumer_name = 'consumer-b'
    `.execute(database.db);
    expect(beforeB.rows[0]?.count).toBe('0');

    await sql`
      insert into platform.event_consumer_receipts (outbox_event_id, consumer_name, status, processed_at)
      values (${eventId}, 'consumer-b', 'COMPLETED', now())
    `.execute(database.db);
    const receipts = await sql<{ consumer_name: string; status: string }>`
      select consumer_name, status from platform.event_consumer_receipts
      where outbox_event_id = ${eventId} order by consumer_name
    `.execute(database.db);
    expect(receipts.rows).toEqual([
      { consumer_name: 'consumer-a', status: 'COMPLETED' },
      { consumer_name: 'consumer-b', status: 'COMPLETED' },
    ]);
    await expect(
      sql`
        insert into platform.event_consumer_receipts (outbox_event_id, consumer_name, status)
        values (${eventId}, 'consumer-a', 'PENDING')
      `.execute(database.db),
    ).rejects.toThrow();

    await sql`delete from platform.event_consumer_receipts where outbox_event_id = ${eventId}`.execute(
      database.db,
    );
    await sql`delete from platform.outbox_events where id = ${eventId}`.execute(database.db);
    await sql`delete from platform.organizations where id = ${organizationId}`.execute(database.db);
  });
});
