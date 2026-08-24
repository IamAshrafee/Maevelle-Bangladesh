import { pathToFileURL } from 'node:url';

import { loadConfig, type RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createLogger } from '@maevelle/observability';

import { createWorker, type WorkerRuntime } from './worker.js';

export async function startWorker(config: RuntimeConfig = loadConfig()): Promise<WorkerRuntime> {
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const worker = createWorker({
    database,
    heartbeatIntervalMs: config.workerHeartbeatIntervalMs,
    logger: createLogger({ component: 'worker', level: config.logLevel }),
    encryptionKey: {
      id: 'runtime-auth-key',
      value: Buffer.from(config.authEncryptionKey, 'base64'),
    },
  });

  try {
    await worker.start();
    return worker;
  } catch (error) {
    await worker.close();
    throw error;
  }
}

export function installWorkerShutdownHandlers(worker: WorkerRuntime): void {
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await worker.close();
    } catch {
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void startWorker()
    .then((worker) => {
      installWorkerShutdownHandlers(worker);
    })
    .catch(() => {
      console.error('Worker startup failed. Check configuration and PostgreSQL availability.');
      process.exitCode = 1;
    });
}
