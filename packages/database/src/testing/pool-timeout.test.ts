import { it, expect } from 'vitest';
import { createDatabase, sql } from '../index.js';
import { isolatedCartDatabase } from './cart-fixture.js';
it('bounds exhausted pool acquisition and recovers after release without a hidden queued write', async () => {
  const isolated = await isolatedCartDatabase();
  const database = createDatabase({
    connectionString: isolated.url,
    maxConnections: 1,
    connectionTimeoutMs: 100,
  });
  let release!: () => void, locked!: () => void;
  const held = new Promise<void>((r) => {
      release = r;
    }),
    acquired = new Promise<void>((r) => {
      locked = r;
    });
  try {
    await sql`create table public.phase08_pool_marker(id integer primary key)`.execute(database.db);
    const holding = database.db.transaction().execute(async (tx) => {
      await sql`select 1`.execute(tx);
      locked();
      await held;
    });
    await acquired;
    const started = performance.now();
    await expect(
      sql`insert into public.phase08_pool_marker values(1)`.execute(database.db),
    ).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(3000);
    release();
    await holding;
    expect(
      (await sql`select * from public.phase08_pool_marker`.execute(database.db)).rows,
    ).toHaveLength(0);
    await expect(database.ping()).resolves.toBeUndefined();
  } finally {
    release();
    await database.close();
    await isolated.close();
  }
}, 15000);
