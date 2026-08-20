import { pathToFileURL } from 'node:url';

import { loadConfig, type RuntimeConfig } from '@maevelle/config';
import { createDatabase, type DatabaseClient } from '@maevelle/database';
import { createLogger } from '@maevelle/observability';

import { buildApi } from './app.js';

export interface ApiRuntime {
  readonly database: DatabaseClient;
  readonly app: ReturnType<typeof buildApi>;
  close(): Promise<void>;
}

export async function startApiServer(config: RuntimeConfig = loadConfig()): Promise<ApiRuntime> {
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const app = buildApi({
    database,
    logger: createLogger({ component: 'api', level: config.logLevel }),
  });
  let closePromise: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      await app.close();
      await database.close();
    })();
    return closePromise;
  };

  try {
    await app.listen({
      host: config.apiHost,
      port: config.apiPort,
    });
  } catch (error) {
    await close();
    throw error;
  }

  return { app, database, close };
}

export function installApiShutdownHandlers(runtime: ApiRuntime): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    runtime.app.log.info({ signal }, 'API shutdown started.');

    try {
      await runtime.close();
      runtime.app.log.info('API shutdown completed.');
    } catch (error) {
      runtime.app.log.error({ err: error }, 'API shutdown failed.');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void startApiServer()
    .then((runtime) => {
      installApiShutdownHandlers(runtime);
      runtime.app.log.info('API listening.');
    })
    .catch(() => {
      console.error('API startup failed. Check configuration and PostgreSQL availability.');
      process.exitCode = 1;
    });
}
