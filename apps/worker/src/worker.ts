import type { DatabaseClient } from '@maevelle/database';
import { reclaimExpiredJobs } from '@maevelle/database/platform';
import {
  createLocalEmailAdapter,
  deliverPendingSms,
  pollSmsDeliveryStatuses,
  createWebhookEventsFromOutbox,
  deliverPendingEmails,
  type EmailAdapter,
  type SmsProvider,
  type SmsRuntimeOptions,
  deliverPendingWebhooks,
  processNotificationOutbox,
} from '@maevelle/database/notifications';
import type { EncryptionKey } from '@maevelle/security';
import { processAnalyticsOutbox } from '@maevelle/database/analytics';
import { processCatalogImports } from '@maevelle/database/admin-operations';
import { deliverPendingInvitationEmails } from '@maevelle/database/iam';
import { processStorefrontSearchOutbox } from '@maevelle/database/storefront';
import { processExpiredPaymentOrders, processOrderOutbox } from '@maevelle/database/orders';
import { expireInventoryReservations } from '@maevelle/database/inventory';
import { dispatchPostDeliveryReviewInvitations } from '@maevelle/database/reviews';
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
  readonly adminBaseUrl?: string;
  readonly courierProviderResolver?: CourierProviderResolver;
  readonly mediaStorage?: ObjectStoragePort;
  readonly emailEnabled?: boolean;
  readonly emailAdapter?: EmailAdapter;
  readonly emailStorefrontBaseUrl?: string;
  readonly emailSupportAddress?: string;
  readonly emailSenderFrom?: string;
  readonly emailEnvironmentLabel?: string;
  readonly smsProvider?: SmsProvider;
  readonly smsRuntime?: SmsRuntimeOptions;
  readonly smsMaxPerTick?: number;
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
  const emailAdapter = options.emailAdapter ?? createLocalEmailAdapter();
  const invitationEmailAdapter = {
    name: emailAdapter.name,
    send: (request: {
      notificationId: string;
      recipient: string;
      subject: string;
      body: string;
      idempotencyKey: string;
    }) =>
      emailAdapter.send({
        notificationId: request.notificationId,
        recipient: emailAdapter.effectiveRecipient(request.recipient),
        subject: request.subject,
        html: `<pre>${request.body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>`,
        text: request.body,
        idempotencyKey: request.idempotencyKey,
      }),
  };

  const runTick = async (): Promise<void> => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const [
        reclaimed,
        notifications,
        emailDeliveries,
        smsDeliveries,
        smsPolls,
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
        invitationEmails,
      ] = await Promise.all([
        reclaimExpiredJobs(options.database.db),
        processNotificationOutbox(options.database.db, 20, {
          ...(options.emailStorefrontBaseUrl
            ? { storefrontBaseUrl: options.emailStorefrontBaseUrl }
            : {}),
          ...(options.emailSupportAddress ? { supportEmail: options.emailSupportAddress } : {}),
          ...(options.emailSenderFrom ? { senderFrom: options.emailSenderFrom } : {}),
          ...(options.emailEnvironmentLabel
            ? { environmentLabel: options.emailEnvironmentLabel }
            : {}),
          smsEnabled: options.smsRuntime?.enabled ?? false,
          smsProviderConfigured: options.smsRuntime?.providerConfigured ?? false,
          smsProviderName: options.smsRuntime?.providerName ?? 'none',
          ...(options.smsRuntime?.recipientOverride ? { smsRecipientOverride: options.smsRuntime.recipientOverride } : {}),
          smsSenderType: options.smsRuntime?.senderType ?? 'PROVIDER_DEFAULT',
          ...(options.smsRuntime?.senderId ? { smsSenderId: options.smsRuntime.senderId } : {}),
        }),
        options.emailEnabled !== false
          ? deliverPendingEmails(options.database.db, emailAdapter)
          : Promise.resolve(0),
        options.smsProvider && options.smsRuntime
          ? deliverPendingSms(options.database.db, options.smsProvider, options.smsRuntime, options.smsMaxPerTick ?? 20)
          : Promise.resolve(0),
        options.smsProvider
          ? pollSmsDeliveryStatuses(options.database.db, options.smsProvider, options.smsMaxPerTick ?? 20)
          : Promise.resolve(0),
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
        options.emailEnabled !== false && options.encryptionKey && options.adminBaseUrl
          ? deliverPendingInvitationEmails(
              options.database.db,
              invitationEmailAdapter,
              options.encryptionKey,
              options.adminBaseUrl,
            )
          : Promise.resolve(0),
        dispatchPostDeliveryReviewInvitations(options.database.db),
      ]);
      logger?.debug(
        {
          reclaimed,
          notifications,
          emailDeliveries,
          smsDeliveries,
          smsPolls,
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
          invitationEmails,
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

      let lastError: unknown;
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
          await options.database.ping();
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 10) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      if (lastError) throw lastError;
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
