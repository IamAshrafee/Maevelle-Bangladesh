import type { DatabaseClient } from '@maevelle/database';

export interface WorkerLogger {
  info(bindings: object, message?: string): void;
  debug(bindings: object, message?: string): void;
}

export interface WorkerOptions {
  readonly database: DatabaseClient;
  readonly heartbeatIntervalMs: number;
  readonly logger?: WorkerLogger;
}

export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Long-running process lifecycle only. Durable job registration and claiming
 * begin after the migration-controlled jobs infrastructure exists.
 */
export function createWorker(options: WorkerOptions): WorkerRuntime {
  const logger = options.logger;
  let heartbeat: NodeJS.Timeout | undefined;
  let started = false;
  let closePromise: Promise<void> | undefined;

  return {
    async start(): Promise<void> {
      if (started) {
        return;
      }

      await options.database.ping();
      started = true;
      logger?.info({}, 'Worker started.');
      heartbeat = setInterval(() => {
        logger?.debug({}, 'Worker heartbeat.');
      }, options.heartbeatIntervalMs);
    },
    close(): Promise<void> {
      closePromise ??= (async () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = undefined;
        }

        await options.database.close();
        logger?.info({}, 'Worker stopped.');
      })();
      return closePromise;
    },
  };
}
