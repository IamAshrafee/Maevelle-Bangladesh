import type { DatabaseClient } from '@maevelle/database';
import { reclaimExpiredJobs } from '@maevelle/database/platform';
import {
  createLocalEmailAdapter,
  createWebhookEventsFromOutbox,
  deliverPendingEmails,
  deliverPendingWebhooks,
  processNotificationOutbox,
} from '@maevelle/database/notifications';
import type { EncryptionKey } from '@maevelle/security';

export interface WorkerLogger {
  info(bindings: object, message?: string): void;
  debug(bindings: object, message?: string): void;
}

export interface WorkerOptions {
  readonly database: DatabaseClient;
  readonly heartbeatIntervalMs: number;
  readonly logger?: WorkerLogger;
  readonly encryptionKey?: EncryptionKey;
}

export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The worker owns lease recovery. Job handlers remain intentionally absent
 * until a domain registers an explicit durable handler.
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
        void Promise.all([
          reclaimExpiredJobs(options.database.db),
          processNotificationOutbox(options.database.db),
          deliverPendingEmails(options.database.db, createLocalEmailAdapter()),
          createWebhookEventsFromOutbox(options.database.db),
          ...(options.encryptionKey
            ? [deliverPendingWebhooks(options.database.db, options.encryptionKey)]
            : []),
        ])
          .then(([reclaimed, notifications, emailDeliveries, webhookEvents, webhookDeliveries]) =>
            logger?.debug(
              { reclaimed, notifications, emailDeliveries, webhookEvents, webhookDeliveries },
              'Worker recovery tick.',
            ),
          )
          .catch((error: unknown) => logger?.info({ error }, 'Worker lease recovery failed.'));
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
