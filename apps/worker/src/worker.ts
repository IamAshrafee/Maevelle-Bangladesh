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
import { processAnalyticsOutbox } from '@maevelle/database/analytics';
import { processCatalogImports } from '@maevelle/database/admin-operations';
import { processStorefrontSearchOutbox } from '@maevelle/database/storefront';
import { processExpiredPaymentOrders, processOrderOutbox } from '@maevelle/database/orders';
import { expireInventoryReservations } from '@maevelle/database/inventory';
import { processCourierBookings, type CourierProviderResolver } from './courier-bookings.js';
import type { ObjectStoragePort } from '@maevelle/media';
import { cleanupExpiredMediaUploads, processMediaBatch, purgeOneMediaAsset } from './media-jobs.js';

export interface WorkerLogger {
  info(bindings: object, message?: string): void;
  debug(bindings: object, message?: string): void;
}

export interface WorkerOptions {
  readonly database: DatabaseClient;
  readonly heartbeatIntervalMs: number;
  readonly logger?: WorkerLogger;
  readonly encryptionKey?: EncryptionKey;
  readonly courierProviderResolver?: CourierProviderResolver;
  readonly mediaStorage?: ObjectStoragePort;
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
  let tickRunning = false;

  const runTick = async (): Promise<void> => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const [
        reclaimed,
        notifications,
        emailDeliveries,
        webhookEvents,
        analytics,
        imports,
        search,
        orders,
        expiredReservations,
        expiredPaymentOrders,
        courierBookings,
        mediaProcessed,
        expiredMediaUploads,
        mediaPurged,
        webhookDeliveries,
      ] = await Promise.all([
        reclaimExpiredJobs(options.database.db),
        processNotificationOutbox(options.database.db),
        deliverPendingEmails(options.database.db, createLocalEmailAdapter()),
        createWebhookEventsFromOutbox(options.database.db),
        processAnalyticsOutbox(options.database.db),
        processCatalogImports(options.database.db),
        processStorefrontSearchOutbox(options.database.db),
        processOrderOutbox(options.database.db),
        expireInventoryReservations(options.database.db),
        processExpiredPaymentOrders(options.database.db),
        processCourierBookings(options.database, options.courierProviderResolver),
        options.mediaStorage
          ? processMediaBatch(options.database, options.mediaStorage)
          : Promise.resolve(0),
        options.mediaStorage
          ? cleanupExpiredMediaUploads(options.database, options.mediaStorage)
          : Promise.resolve(0),
        options.mediaStorage
          ? purgeOneMediaAsset(options.database, options.mediaStorage)
          : Promise.resolve(0),
        options.encryptionKey
          ? deliverPendingWebhooks(options.database.db, options.encryptionKey)
          : Promise.resolve(0),
      ]);
      logger?.debug(
        {
          reclaimed,
          notifications,
          emailDeliveries,
          webhookEvents,
          analytics,
          imports,
          search,
          orders,
          expiredReservations,
          expiredPaymentOrders,
          courierBookings,
          mediaProcessed,
          expiredMediaUploads,
          mediaPurged,
          webhookDeliveries,
        },
        'Worker recovery tick.',
      );
    } catch (error: unknown) {
      logger?.info({ error }, 'Worker recovery tick failed.');
    } finally {
      tickRunning = false;
    }
  };

  return {
    async start(): Promise<void> {
      if (started) {
        return;
      }

      await options.database.ping();
      started = true;
      logger?.info({}, 'Worker started.');
      await runTick();
      heartbeat = setInterval(() => {
        void runTick();
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
