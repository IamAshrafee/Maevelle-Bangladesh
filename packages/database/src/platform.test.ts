import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { claimNextJob, enqueueJob, reclaimExpiredJobs } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

describe('durable PostgreSQL job leasing', () => {
  it('allows only one concurrent worker to claim a job and reclaims an expired lease', async () => {
    await sql`delete from platform.jobs where job_type like 'test.job.%'`.execute(database.db);
    const jobId = await enqueueJob(database.db, {
      queueName: 'default',
      jobType: `test.job.${crypto.randomUUID()}`,
      payload: { test: true },
    });

    const [first, second] = await Promise.all([
      claimNextJob(database.db, 'default', 'worker-one', 1),
      claimNextJob(database.db, 'default', 'worker-two', 1),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(first?.id ?? second?.id).toBe(jobId);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await reclaimExpiredJobs(database.db)).toBeGreaterThanOrEqual(1);
    const recovered = await claimNextJob(database.db, 'default', 'worker-recovery', 60);
    expect(recovered?.id).toBe(jobId);
    await sql`delete from platform.jobs where job_type like 'test.job.%'`.execute(database.db);
  });
});
