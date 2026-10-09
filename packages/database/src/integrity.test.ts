import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  executeIntegrityRun,
  getIntegrityFinding,
  getIntegrityRun,
  listIntegrityFindings,
  requestIntegrityRun,
} from './integrity.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function organization(label: string) {
  return createOrganization(database.db, {
    code: `integrity-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `Integrity ${label}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
}

describe('durable System Integrity orchestration', () => {
  it('executes every registered check against a clean Organization without failed coverage', async () => {
    const tenant = await organization('catalog');
    const run = await requestIntegrityRun(database.db, {
      organizationId: tenant.id,
      triggerType: 'MANUAL',
    });
    expect(await executeIntegrityRun(database.db, run.id)).toEqual(
      expect.objectContaining({ status: 'SUCCEEDED', checksFailed: 0 }),
    );
  });

  it('deduplicates recurrence, isolates tenants, and resolves only after a successful clean recheck', async () => {
    const [first, second] = await Promise.all([organization('first'), organization('second')]);
    const job = await sql<{ id: string }>`insert into platform.jobs
      (organization_id,queue_name,job_type,payload_version,payload,status,initiator_type,authorization_mode)
      values(${first.id},'default','test.integrity.dead-letter',1,'{}'::jsonb,'DEAD_LETTER','SYSTEM','SYSTEM') returning id::text`.execute(
      database.db,
    );

    const initial = await requestIntegrityRun(database.db, {
      organizationId: first.id,
      triggerType: 'MANUAL',
      checkIds: ['platform.recovery'],
    });
    expect((await executeIntegrityRun(database.db, initial.id))?.status).toBe('SUCCEEDED');

    const firstList = await listIntegrityFindings(database.db, {
      organizationId: first.id,
      page: 1,
      pageSize: 25,
      status: 'OPEN',
    });
    expect(firstList.items).toEqual([
      expect.objectContaining({ code: 'DEAD_LETTER_JOB', occurrence_count: 1 }),
    ]);
    expect(
      (
        await listIntegrityFindings(database.db, {
          organizationId: second.id,
          page: 1,
          pageSize: 25,
        })
      ).items,
    ).toEqual([]);

    const repeated = await requestIntegrityRun(database.db, {
      organizationId: first.id,
      triggerType: 'MANUAL',
      checkIds: ['platform.recovery'],
    });
    await executeIntegrityRun(database.db, repeated.id);
    const repeatedList = await listIntegrityFindings(database.db, {
      organizationId: first.id,
      page: 1,
      pageSize: 25,
      status: 'OPEN',
    });
    expect(repeatedList.items[0]).toEqual(expect.objectContaining({ occurrence_count: 2 }));

    const findingId = String((repeatedList.items[0] as { id: string }).id);
    await sql`delete from platform.jobs where id=${job.rows[0]!.id}::uuid`.execute(database.db);
    const clean = await requestIntegrityRun(database.db, {
      organizationId: first.id,
      triggerType: 'MANUAL',
      checkIds: ['platform.recovery'],
    });
    await executeIntegrityRun(database.db, clean.id);
    expect(await getIntegrityFinding(database.db, first.id, findingId)).toEqual(
      expect.objectContaining({ status: 'RESOLVED' }),
    );
  });

  it('rejects equivalent overlapping scans and records unavailable definitions as failed coverage', async () => {
    const tenant = await organization('concurrency');
    const first = await requestIntegrityRun(database.db, {
      organizationId: tenant.id,
      triggerType: 'MANUAL',
      checkIds: ['platform.recovery'],
    });
    await expect(
      requestIntegrityRun(database.db, {
        organizationId: tenant.id,
        triggerType: 'MANUAL',
        checkIds: ['platform.recovery'],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await executeIntegrityRun(database.db, first.id);

    const unavailable = await sql<{ id: string }>`insert into platform.integrity_runs
      (organization_id,trigger_type,scope_type,selected_check_ids,execution_key,status,checks_total)
      values(${tenant.id},'MANUAL','ORGANIZATION',array['removed.definition'],'test:removed','QUEUED',1)
      returning id::text`.execute(database.db);
    await executeIntegrityRun(database.db, unavailable.rows[0]!.id);
    expect(await getIntegrityRun(database.db, tenant.id, unavailable.rows[0]!.id)).toEqual(
      expect.objectContaining({ status: 'FAILED', checks_failed: 1 }),
    );
  });
});
