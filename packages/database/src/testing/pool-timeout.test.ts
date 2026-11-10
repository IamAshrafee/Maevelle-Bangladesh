import { createServer, type Socket } from 'node:net';
import { it, expect } from 'vitest';
import { createDatabase, sql } from '../index.js';
import { isolatedCartDatabase } from './cart-fixture.js';
it('bounds exhausted pool acquisition and recovers after release without a hidden queued write', async () => {
  const isolated = await isolatedCartDatabase();
  const database = createDatabase({
    connectionString: isolated.url,
    maxConnections: 1,
    // pg uses one budget for both a cold TCP/auth handshake and queue acquisition.
    // 100ms made the first handshake fail on loaded Windows hosts before saturation.
    connectionTimeoutMs: 1000,
  });
  let release!: () => void, locked!: () => void;
  const held = new Promise<void>((r) => {
      release = r;
    }),
    acquired = new Promise<void>((r) => {
      locked = r;
    });
  let holding: Promise<void> | undefined;
  try {
    await sql`create table public.phase08_pool_marker(id integer primary key)`.execute(database.db);
    holding = database.db.transaction().execute(async (tx) => {
      await sql`select 1`.execute(tx);
      locked();
      await held;
    });
    await Promise.race([acquired, holding]);
    const started = performance.now();
    await expect(
      sql`insert into public.phase08_pool_marker values(1)`.execute(database.db),
    ).rejects.toThrow();
    expect(performance.now() - started).toBeGreaterThanOrEqual(900);
    expect(performance.now() - started).toBeLessThan(3000);
    release();
    await holding;
    expect(
      (await sql`select * from public.phase08_pool_marker`.execute(database.db)).rows,
    ).toHaveLength(0);
    await expect(database.ping()).resolves.toBeUndefined();
  } finally {
    release();
    await holding?.catch(() => {});
    await database.close();
    await isolated.close();
  }
}, 15000);

it('bounds failed cold connection creation and removes queued acquisitions without running SQL', async () => {
  // Accept TCP but never answer the PostgreSQL handshake. No external target or timing guess.
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local test port.');
  const database = createDatabase({
    connectionString: `postgresql://synthetic:synthetic@127.0.0.1:${address.port}/unused`,
    maxConnections: 1,
    connectionTimeoutMs: 100,
  });
  try {
    const started = performance.now();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => database.ping()));
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(performance.now() - started).toBeLessThan(3000);
    await expect(database.ping()).rejects.toThrow('PostgreSQL connectivity check failed.');
  } finally {
    await Promise.all([database.close(), database.close()]);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('releases a cancelled transaction and supports concurrent idempotent teardown', async () => {
  const isolated = await isolatedCartDatabase();
  const database = createDatabase({ connectionString: isolated.url, maxConnections: 1 });
  let started!: (pid: number) => void;
  const acquired = new Promise<number>((resolve) => {
    started = resolve;
  });
  const transaction = database.db.transaction().execute(async (tx) => {
    const result = await sql<{ pid: number }>`select pg_backend_pid() pid`.execute(tx);
    started(result.rows[0]!.pid);
    await sql`select pg_sleep(10)`.execute(tx);
  });
  // Attach rejection handling before cancelling the backend.
  const outcome = expect(transaction).rejects.toThrow(/canceling statement/);
  try {
    const pid = await acquired;
    // Wait until the statement actually starts, avoiding a cancel-before-query race.
    for (let attempt = 0; attempt < 100; attempt++) {
      const activity = await sql<{ waiting: boolean }>`select wait_event='PgSleep' waiting
        from pg_stat_activity where pid=${pid}`.execute(isolated.database.db);
      if (activity.rows[0]?.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await sql`select pg_cancel_backend(${pid})`.execute(isolated.database.db);
    await outcome;
    await expect(database.ping()).resolves.toBeUndefined();
    const activity = await sql<{ count: number }>`select count(*)::int count from pg_stat_activity
      where datname=current_database() and state='idle in transaction'`.execute(
      isolated.database.db,
    );
    expect(activity.rows[0]!.count).toBe(0);
  } finally {
    await transaction.catch(() => {});
    await Promise.all([database.close(), database.close()]);
    await isolated.close();
  }
}, 15000);
