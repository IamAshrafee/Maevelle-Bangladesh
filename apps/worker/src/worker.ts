import type { DatabaseClient } from '@maevelle/database';
import { reclaimExpiredJobs } from '@maevelle/database/platform';
import {
  createLocalEmailAdapter,
  deliverPendingSms,
  pollSmsDeliveryStatuses,
  createWebhookEventsFromOutbox,
  deliverPendingEmails,
  purgeExpiredNotificationHistory,
  reconcileUnmatchedEmailProviderEvents,
  type EmailAdapter,
  type SmsProvider,
  type SmsRuntimeOptions,
  deliverPendingWebhooks,
  processNotificationOutbox,
} from '@maevelle/database/notifications';
import type { EncryptionKey } from '@maevelle/security';
import { processAnalyticsExports, processAnalyticsOutbox } from '@maevelle/database/analytics';
import { processCatalogImports } from '@maevelle/database/admin-operations';
import { processIntegrityRuns, scheduleDueIntegrityRuns } from '@maevelle/database/integrity';
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
  const smsProvider = options.smsProvider;
  const smsRuntime = options.smsRuntime;
  const invitationEmailAdapter = {
    name: emailAdapter.name,
    send: async (request: {
      notificationId: string;
      recipient: string;
      subject: string;
      body: string;
      idempotencyKey: string;
    }) => {
      const result = await emailAdapter.send({
        notificationId: request.notificationId,
        recipient: emailAdapter.effectiveRecipient(request.recipient),
        subject: request.subject,
        html: `<pre>${request.body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>`,
        text: request.body,
        idempotencyKey: request.idempotencyKey,
      });
      return result.status === 'UNKNOWN'
        ? {
            status: 'FAILED' as const,
            retryable: false,
            errorCode: 'PROVIDER_OUTCOME_UNKNOWN_REQUIRES_RECONCILIATION',
            ...(result.metadata ? { metadata: result.metadata } : {}),
          }
        : result;
    },
  };

  const runTick = async (): Promise<void> => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      // Some job functions begin work before returning a promise. Starting each
      // through an async boundary turns synchronous setup failures into owned
      // rejections, so one malformed dependency cannot orphan sibling jobs.
      const runJob = async <T>(job: () => Promise<T>): Promise<T> => job();
      const [
        reclaimed,
        notifications,
        emailDeliveries,
        emailWebhookReconciliations,
        smsDeliveries,
        smsPolls,
        webhookEvents,
        analytics,
        analyticsExports,
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
        reviewInvitations,
        purgedNotificationHistory,
        integrityScheduled,
        integrityRuns,
      ] = await Promise.all([
        runJob(() => reclaimExpiredJobs(options.database.db)),
        runJob(() =>
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
            ...(options.smsRuntime?.recipientOverride
              ? { smsRecipientOverride: options.smsRuntime.recipientOverride }
              : {}),
            smsSenderType: options.smsRuntime?.senderType ?? 'PROVIDER_DEFAULT',
            ...(options.smsRuntime?.senderId ? { smsSenderId: options.smsRuntime.senderId } : {}),
          }),
        ),
        options.emailEnabled !== false
          ? runJob(() => deliverPendingEmails(options.database.db, emailAdapter))
          : Promise.resolve(0),
        runJob(() => reconcileUnmatchedEmailProviderEvents(options.database.db)),
        smsProvider && smsRuntime
          ? runJob(() =>
              deliverPendingSms(
                options.database.db,
                smsProvider,
                smsRuntime,
                options.smsMaxPerTick ?? 20,
              ),
            )
          : Promise.resolve(0),
        smsProvider
          ? runJob(() =>
              pollSmsDeliveryStatuses(
                options.database.db,
                smsProvider,
                options.smsMaxPerTick ?? 20,
              ),
            )
          : Promise.resolve(0),
        runJob(() => createWebhookEventsFromOutbox(options.database.db)),
        runJob(() => processAnalyticsOutbox(options.database.db)),
        runJob(() => processAnalyticsExports(options.database.db, `worker:${process.pid}`, 1)),
        runJob(() => processCatalogImports(options.database.db)),
        runJob(() => processStorefrontSearchOutbox(options.database.db)),
        runJob(() => processOrderOutbox(options.database.db)),
        runJob(() => expireInventoryReservations(options.database.db)),
        runJob(() => processExpiredPaymentOrders(options.database.db)),
        runJob(() => processCourierBookings(options.database, options.courierProviderResolver)),
        options.mediaStorage
          ? runJob(() => processMediaBatch(options.database, options.mediaStorage!))
          : Promise.resolve(0),
        options.mediaStorage
          ? runJob(() => cleanupExpiredMediaUploads(options.database, options.mediaStorage!))
          : Promise.resolve(0),
        options.mediaStorage
          ? runJob(() => purgeOneMediaAsset(options.database, options.mediaStorage!))
          : Promise.resolve(0),
        options.encryptionKey
          ? runJob(() => deliverPendingWebhooks(options.database.db, options.encryptionKey!))
          : Promise.resolve(0),
        options.emailEnabled !== false && options.encryptionKey && options.adminBaseUrl
          ? runJob(() =>
              deliverPendingInvitationEmails(
                options.database.db,
                invitationEmailAdapter,
                options.encryptionKey!,
                options.adminBaseUrl!,
              ),
            )
          : Promise.resolve(0),
        runJob(() => dispatchPostDeliveryReviewInvitations(options.database.db)),
        runJob(() => purgeExpiredNotificationHistory(options.database.db)),
        runJob(() => scheduleDueIntegrityRuns(options.database.db)),
        runJob(() => processIntegrityRuns(options.database.db, `worker:${process.pid}`, 1)),
      ]);
      logger?.debug(
        {
          reclaimed,
          notifications,
          emailDeliveries,
          emailWebhookReconciliations,
          smsDeliveries,
          smsPolls,
          webhookEvents,
          analytics,
          analyticsExports,
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
          reviewInvitations,
          purgedNotificationHistory,
          integrityScheduled,
          integrityRuns,
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
