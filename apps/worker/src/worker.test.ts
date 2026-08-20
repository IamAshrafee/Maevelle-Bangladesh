import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@maevelle/database';

import { createWorker } from './worker.js';

describe('worker lifecycle', () => {
  it('checks PostgreSQL on startup and closes its shared database resource', async () => {
    const database: DatabaseClient = {
      db: {} as DatabaseClient['db'],
      ping: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
    };
    const worker = createWorker({
      database,
      heartbeatIntervalMs: 1_000,
      logger,
    });

    await worker.start();
    await worker.close();
    await worker.close();

    expect(database.ping).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith({}, 'Worker started.');
    expect(logger.info).toHaveBeenCalledWith({}, 'Worker stopped.');
  });
});
