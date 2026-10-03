import { pathToFileURL } from 'node:url';

import { loadConfig, type RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createLogger } from '@maevelle/observability';
import { resolveCourierProvider } from '@maevelle/database/courier-resolver';
import { createObjectStorage } from '@maevelle/media';
import { createMockSmsProvider } from '@maevelle/database/notifications';

import { createWorker, type WorkerRuntime } from './worker.js';
import { createResendEmailProvider } from './resend-email-provider.js';

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
    adminBaseUrl: config.authTrustedOrigins[0] ?? new URL(config.authBaseUrl).origin,
    courierProviderResolver: (input) =>
      resolveCourierProvider(
        database.db,
        {
          id: 'runtime-auth-key',
          value: Buffer.from(config.authEncryptionKey, 'base64'),
        },
        {
          accountId: input.integrationAccountId,
          providerCode: input.providerCode,
        },
      ),
    mediaStorage: createObjectStorage(
      config.mediaStorageProvider === 'local'
        ? { provider: 'local', rootDirectory: config.mediaStoragePath }
        : {
            provider: 's3',
            endpoint: config.mediaStorageEndpoint!,
            region: config.mediaStorageRegion,
            accessKeyId: config.mediaStorageAccessKeyId!,
            secretAccessKey: config.mediaStorageSecretAccessKey!,
            privateBucket: config.mediaPrivateBucket,
            publicBucket: config.mediaPublicBucket,
            forcePathStyle: config.mediaStorageForcePathStyle,
          },
    ),
    ...(process.env.EMAIL_ENABLED !== undefined ? { emailEnabled: config.emailEnabled } : {}),
    ...(config.emailProvider === 'resend' && config.resendApiKey
      ? {
          emailAdapter: createResendEmailProvider({
            apiKey: config.resendApiKey,
            fromName: config.emailFromName,
            fromAddress: config.emailFromAddress,
            replyTo: config.emailReplyTo,
            ...(config.emailTestRecipientOverride
              ? { testRecipientOverride: config.emailTestRecipientOverride }
              : {}),
          }),
        }
      : {}),
    emailStorefrontBaseUrl: config.storefrontBaseUrl,
    emailSupportAddress: config.emailReplyTo,
    emailSenderFrom: `${config.emailFromName} <${config.emailFromAddress}>`,
    ...(config.emailEnvironment !== 'production'
      ? { emailEnvironmentLabel: config.emailEnvironment.toUpperCase() }
      : {}),
    ...(config.smsProvider === 'mock' ? { smsProvider: createMockSmsProvider() } : {}),
    smsRuntime: {
      enabled: config.smsEnabled,
      providerConfigured: config.smsProvider !== 'none',
      providerName: config.smsProvider,
      storefrontBaseUrl: config.storefrontBaseUrl,
      senderType: config.smsSenderType,
      ...(config.smsSenderId ? { senderId: config.smsSenderId } : {}),
      ...(config.smsRecipientOverride ? { recipientOverride: config.smsRecipientOverride } : {}),
      environment: config.smsEnvironment,
    },
    smsMaxPerTick: config.smsMaxPerTick,
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
