import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly databaseUrl: string;
  readonly testDatabaseUrl?: string;
  readonly databasePoolMax: number;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly logLevel: LogLevel;
  readonly workerHeartbeatIntervalMs: number;
  readonly betterAuthSecret: string;
  readonly authEncryptionKey: string;
  readonly authBaseUrl: string;
  readonly authTrustedOrigins: readonly string[];
  readonly authTotpIssuer: string;
  readonly authTotpChallengeSeconds: number;
  readonly authTotpMaxFailedAttempts: number;
  readonly authTotpLockSeconds: number;
  readonly mediaStorageProvider: 'local' | 's3';
  readonly mediaStoragePath: string;
  readonly mediaStorageEndpoint?: string;
  readonly mediaStorageRegion: string;
  readonly mediaStorageAccessKeyId?: string;
  readonly mediaStorageSecretAccessKey?: string;
  readonly mediaPrivateBucket: string;
  readonly mediaPublicBucket: string;
  readonly mediaStorageForcePathStyle: boolean;
  readonly mediaMaxUploadBytes: number;
  readonly mediaUploadExpirySeconds: number;
  /** Public Storefront tenant resolved by the API; customers never enter an organization UUID. */
  readonly storefrontOrganizationCode: string;
  readonly storefrontBaseUrl: string;
  readonly storefrontInternalApiUrl: string;
  readonly emailEnabled: boolean;
  readonly emailProvider: 'local' | 'resend';
  readonly emailEnvironment: 'development' | 'test' | 'production';
  readonly emailFromName: string;
  readonly emailFromAddress: string;
  readonly emailReplyTo: string;
  readonly emailTestRecipientOverride?: string;
  readonly emailAllowedTestRecipients: readonly string[];
  readonly resendApiKey?: string;
  readonly resendWebhookSecret?: string;
  readonly smsEnabled: boolean;
  readonly smsProvider: 'none' | 'mock';
  readonly smsEnvironment: 'development' | 'test' | 'production';
  readonly smsTestMode: boolean;
  readonly smsRecipientOverride?: string;
  readonly smsAllowedTestRecipients: readonly string[];
  readonly smsSenderType: 'MASKING' | 'NON_MASKING' | 'PROVIDER_DEFAULT';
  readonly smsSenderId?: string;
  readonly smsMaxPerTick: number;
}

type Environment = Record<string, string | undefined>;

const nodeEnvironments = new Set<NodeEnvironment>(['development', 'test', 'production']);
const logLevels = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function requiredPostgresUrl(environment: Environment, variableName: string): string {
  const value = environment[variableName];

  if (!value) {
    throw new ConfigurationError(`${variableName} is required.`);
  }

  return validatePostgresUrl(value, variableName);
}

function optionalPostgresUrl(environment: Environment, variableName: string): string | undefined {
  const value = environment[variableName];
  return value ? validatePostgresUrl(value, variableName) : undefined;
}

function validatePostgresUrl(value: string, variableName: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('Unsupported protocol.');
    }
  } catch {
    throw new ConfigurationError(`${variableName} must be a valid PostgreSQL connection URL.`);
  }

  return value;
}

function integer(
  environment: Environment,
  variableName: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const value = environment[variableName];

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigurationError(
      `${variableName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function requiredSecret(
  environment: Environment,
  variableName: string,
  minimumLength: number,
): string {
  const value = environment[variableName];
  if (!value || value.length < minimumLength) {
    throw new ConfigurationError(
      `${variableName} is required and must be at least ${minimumLength} characters.`,
    );
  }
  return value;
}

function requiredBase64Key(environment: Environment, variableName: string): string {
  const value = environment[variableName];
  if (!value) throw new ConfigurationError(`${variableName} is required.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) {
    throw new ConfigurationError(`${variableName} must decode to a 32-byte base64 key.`);
  }
  return value;
}

function boolean(environment: Environment, variableName: string, defaultValue: boolean): boolean {
  const value = environment[variableName];
  if (!value) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError(`${variableName} must be true or false.`);
}

function emailAddress(value: string, variableName: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new ConfigurationError(`${variableName} must be a valid email address.`);
  return normalized;
}

function smsPhone(value: string, variableName: string): string {
  const normalized = value.trim();
  if (!/^\+8801\d{9}$/.test(normalized))
    throw new ConfigurationError(`${variableName} entries must be normalized Bangladesh mobile numbers such as +8801712345678.`);
  return normalized;
}

function httpUrl(value: string, variableName: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol.');
    return url.origin;
  } catch {
    throw new ConfigurationError(`${variableName} must be a valid HTTP(S) URL.`);
  }
}

function shortLabel(
  environment: Environment,
  variableName: string,
  defaultValue: string,
  maximumLength: number,
): string {
  const value = environment[variableName]?.trim() || defaultValue;
  if (!value || value.length > maximumLength || /[\r\n\0]/.test(value))
    throw new ConfigurationError(
      `${variableName} must be a non-empty label no longer than ${maximumLength} characters.`,
    );
  return value;
}

/**
 * Parses only runtime configuration needed by the current foundation. Error
 * messages deliberately name variables without echoing their values.
 */
export function parseConfig(environment: Environment): RuntimeConfig {
  const nodeEnvValue = environment.NODE_ENV ?? 'development';

  if (!nodeEnvironments.has(nodeEnvValue as NodeEnvironment)) {
    throw new ConfigurationError('NODE_ENV must be development, test, or production.');
  }

  const nodeEnv = nodeEnvValue as NodeEnvironment;
  const primaryDatabaseUrl = requiredPostgresUrl(environment, 'DATABASE_URL');
  const testDatabaseUrl = optionalPostgresUrl(environment, 'TEST_DATABASE_URL');

  let databaseUrl = primaryDatabaseUrl;

  if (nodeEnv === 'test') {
    if (!testDatabaseUrl) {
      throw new ConfigurationError('TEST_DATABASE_URL is required when NODE_ENV is test.');
    }

    databaseUrl = testDatabaseUrl;
  }

  const logLevelValue = environment.LOG_LEVEL ?? 'info';

  if (!logLevels.has(logLevelValue as LogLevel)) {
    throw new ConfigurationError('LOG_LEVEL must be debug, info, warn, or error.');
  }

  const apiHost = environment.API_HOST ?? '127.0.0.1';

  if (!apiHost.trim()) {
    throw new ConfigurationError('API_HOST must not be empty.');
  }

  const mediaStorageProvider = environment.MEDIA_STORAGE_PROVIDER ?? 'local';
  if (mediaStorageProvider !== 'local' && mediaStorageProvider !== 's3')
    throw new ConfigurationError('MEDIA_STORAGE_PROVIDER must be local or s3.');
  const mediaStorageEndpoint = environment.MEDIA_STORAGE_ENDPOINT?.trim();
  const mediaStorageAccessKeyId = environment.MEDIA_STORAGE_ACCESS_KEY_ID?.trim();
  const mediaStorageSecretAccessKey = environment.MEDIA_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (
    mediaStorageProvider === 's3' &&
    (!mediaStorageEndpoint || !mediaStorageAccessKeyId || !mediaStorageSecretAccessKey)
  )
    throw new ConfigurationError(
      'S3 media storage requires MEDIA_STORAGE_ENDPOINT, MEDIA_STORAGE_ACCESS_KEY_ID, and MEDIA_STORAGE_SECRET_ACCESS_KEY.',
    );

  const emailProvider = environment.EMAIL_PROVIDER?.trim().toLowerCase() || 'local';
  if (emailProvider !== 'local' && emailProvider !== 'resend')
    throw new ConfigurationError('EMAIL_PROVIDER must be local or resend.');
  const emailEnabled = boolean(environment, 'EMAIL_ENABLED', false);
  const emailEnvironment = (environment.EMAIL_ENVIRONMENT?.trim().toLowerCase() || nodeEnv) as
    | 'development'
    | 'test'
    | 'production';
  if (!nodeEnvironments.has(emailEnvironment))
    throw new ConfigurationError('EMAIL_ENVIRONMENT must be development, test, or production.');
  const emailTestRecipientOverride = environment.EMAIL_TEST_RECIPIENT_OVERRIDE?.trim();
  const emailAllowedTestRecipients = (environment.EMAIL_ALLOWED_TEST_RECIPIENTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => emailAddress(value, 'EMAIL_ALLOWED_TEST_RECIPIENTS'));
  if (emailEnvironment === 'production' && emailTestRecipientOverride)
    throw new ConfigurationError(
      'EMAIL_TEST_RECIPIENT_OVERRIDE must not be configured when EMAIL_ENVIRONMENT is production.',
    );
  if (emailTestRecipientOverride) {
    const override = emailAddress(emailTestRecipientOverride, 'EMAIL_TEST_RECIPIENT_OVERRIDE');
    if (!emailAllowedTestRecipients.includes(override))
      throw new ConfigurationError(
        'EMAIL_TEST_RECIPIENT_OVERRIDE must also appear in EMAIL_ALLOWED_TEST_RECIPIENTS.',
      );
  }
  const resendApiKey = environment.RESEND_API_KEY?.trim();
  const resendWebhookSecret = environment.RESEND_WEBHOOK_SECRET?.trim();
  if (emailEnabled && emailProvider === 'resend' && !resendApiKey)
    throw new ConfigurationError('RESEND_API_KEY is required when Resend email is enabled.');
  if (nodeEnv === 'production' && emailEnabled && emailProvider === 'resend') {
    if (!resendWebhookSecret)
      throw new ConfigurationError('RESEND_WEBHOOK_SECRET is required for production email.');
    if (emailEnvironment !== 'production')
      throw new ConfigurationError('EMAIL_ENVIRONMENT must be production in NODE_ENV=production.');
  }
  if (nodeEnv === 'production' && emailEnabled && emailProvider !== 'resend')
    throw new ConfigurationError('EMAIL_PROVIDER must be resend when production email is enabled.');
  const configuredFromAddress = emailAddress(
    environment.EMAIL_FROM_ADDRESS ?? 'orders@example.invalid',
    'EMAIL_FROM_ADDRESS',
  );
  if (nodeEnv === 'production' && emailEnabled && configuredFromAddress.endsWith('.invalid'))
    throw new ConfigurationError('EMAIL_FROM_ADDRESS must use a verified production domain.');

  const smsProvider = environment.SMS_PROVIDER?.trim().toLowerCase() || 'none';
  if (smsProvider !== 'none' && smsProvider !== 'mock')
    throw new ConfigurationError('SMS_PROVIDER must be none or mock until a production adapter is installed.');
  const smsEnabled = boolean(environment, 'SMS_ENABLED', false);
  const smsEnvironment = (environment.SMS_ENVIRONMENT?.trim().toLowerCase() || nodeEnv) as NodeEnvironment;
  if (!nodeEnvironments.has(smsEnvironment))
    throw new ConfigurationError('SMS_ENVIRONMENT must be development, test, or production.');
  const smsTestMode = boolean(environment, 'SMS_TEST_MODE', smsEnvironment !== 'production');
  const smsRecipientOverride = environment.SMS_RECIPIENT_OVERRIDE?.trim();
  const smsAllowedTestRecipients = (environment.SMS_ALLOWED_TEST_RECIPIENTS ?? '').split(',').map((v) => v.trim()).filter(Boolean).map((v) => smsPhone(v, 'SMS_ALLOWED_TEST_RECIPIENTS'));
  if (smsEnvironment === 'production' && (smsRecipientOverride || smsTestMode))
    throw new ConfigurationError('SMS_RECIPIENT_OVERRIDE and SMS_TEST_MODE are not allowed in the production SMS environment.');
  if (smsRecipientOverride) {
    const normalizedOverride = smsPhone(smsRecipientOverride, 'SMS_RECIPIENT_OVERRIDE');
    if (!smsAllowedTestRecipients.includes(normalizedOverride))
      throw new ConfigurationError('SMS_RECIPIENT_OVERRIDE must also appear in SMS_ALLOWED_TEST_RECIPIENTS.');
  }
  if (nodeEnv === 'production' && smsEnabled)
    throw new ConfigurationError('Production SMS cannot be enabled until a real SMS provider adapter is installed.');
  if (smsEnabled && smsProvider === 'none')
    throw new ConfigurationError('SMS_PROVIDER must be configured when SMS_ENABLED is true.');
  const smsSenderType = (environment.SMS_SENDER_TYPE?.trim().toUpperCase() || 'PROVIDER_DEFAULT') as RuntimeConfig['smsSenderType'];
  if (!['MASKING', 'NON_MASKING', 'PROVIDER_DEFAULT'].includes(smsSenderType))
    throw new ConfigurationError('SMS_SENDER_TYPE must be MASKING, NON_MASKING, or PROVIDER_DEFAULT.');
  const smsSenderId = environment.SMS_SENDER_ID?.trim();
  if (smsSenderId && smsSenderId.length > 32) throw new ConfigurationError('SMS_SENDER_ID must not exceed 32 characters.');

  return Object.freeze({
    nodeEnv,
    databaseUrl,
    ...(testDatabaseUrl ? { testDatabaseUrl } : {}),
    databasePoolMax: integer(environment, 'DATABASE_POOL_MAX', 10, 1, 50),
    apiHost,
    apiPort: integer(environment, 'API_PORT', 3000, 1, 65_535),
    logLevel: logLevelValue as LogLevel,
    workerHeartbeatIntervalMs: integer(
      environment,
      'WORKER_HEARTBEAT_INTERVAL_MS',
      30_000,
      1_000,
      3_600_000,
    ),
    betterAuthSecret: requiredSecret(environment, 'BETTER_AUTH_SECRET', 32),
    authEncryptionKey: requiredBase64Key(environment, 'AUTH_ENCRYPTION_KEY'),
    authBaseUrl: environment.BETTER_AUTH_URL ?? 'http://localhost:8080/api',
    authTrustedOrigins: environment.AUTH_TRUSTED_ORIGINS
      ? environment.AUTH_TRUSTED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:3001'],
    authTotpIssuer: shortLabel(environment, 'AUTH_TOTP_ISSUER', 'Maevelle', 64),
    authTotpChallengeSeconds: integer(
      environment,
      'AUTH_TOTP_CHALLENGE_SECONDS',
      600,
      120,
      1_800,
    ),
    authTotpMaxFailedAttempts: integer(
      environment,
      'AUTH_TOTP_MAX_FAILED_ATTEMPTS',
      10,
      3,
      20,
    ),
    authTotpLockSeconds: integer(
      environment,
      'AUTH_TOTP_LOCK_SECONDS',
      900,
      60,
      86_400,
    ),
    mediaStorageProvider,
    mediaStoragePath: environment.MEDIA_STORAGE_PATH ?? 'var/media',
    ...(mediaStorageEndpoint ? { mediaStorageEndpoint } : {}),
    mediaStorageRegion: environment.MEDIA_STORAGE_REGION?.trim() || 'auto',
    ...(mediaStorageAccessKeyId ? { mediaStorageAccessKeyId } : {}),
    ...(mediaStorageSecretAccessKey ? { mediaStorageSecretAccessKey } : {}),
    mediaPrivateBucket: environment.MEDIA_PRIVATE_BUCKET?.trim() || 'maevelle-media-private',
    mediaPublicBucket: environment.MEDIA_PUBLIC_BUCKET?.trim() || 'maevelle-media-public',
    mediaStorageForcePathStyle: boolean(
      environment,
      'MEDIA_STORAGE_FORCE_PATH_STYLE',
      mediaStorageProvider === 'local',
    ),
    mediaMaxUploadBytes: integer(
      environment,
      'MEDIA_MAX_UPLOAD_BYTES',
      10 * 1024 * 1024,
      1,
      50 * 1024 * 1024,
    ),
    mediaUploadExpirySeconds: integer(environment, 'MEDIA_UPLOAD_EXPIRY_SECONDS', 900, 60, 3_600),
    storefrontOrganizationCode: environment.STOREFRONT_ORGANIZATION_CODE?.trim() || 'maevelle',
    storefrontBaseUrl: httpUrl(
      environment.STOREFRONT_BASE_URL ?? 'http://localhost:3000',
      'STOREFRONT_BASE_URL',
    ),
    storefrontInternalApiUrl: environment.STOREFRONT_INTERNAL_API_URL?.trim() || 'http://127.0.0.1:3002',
    emailEnabled,
    emailProvider,
    emailEnvironment,
    emailFromName: environment.EMAIL_FROM_NAME?.trim() || 'Maevelle',
    emailFromAddress: configuredFromAddress,
    emailReplyTo: emailAddress(
      environment.EMAIL_REPLY_TO ?? 'maevelleBangladesh@gmail.com',
      'EMAIL_REPLY_TO',
    ),
    ...(emailTestRecipientOverride
      ? {
          emailTestRecipientOverride: emailAddress(
            emailTestRecipientOverride,
            'EMAIL_TEST_RECIPIENT_OVERRIDE',
          ),
        }
      : {}),
    emailAllowedTestRecipients,
    ...(resendApiKey ? { resendApiKey } : {}),
    ...(resendWebhookSecret ? { resendWebhookSecret } : {}),
    smsEnabled,
    smsProvider,
    smsEnvironment,
    smsTestMode,
    ...(smsRecipientOverride ? { smsRecipientOverride: smsPhone(smsRecipientOverride, 'SMS_RECIPIENT_OVERRIDE') } : {}),
    smsAllowedTestRecipients,
    smsSenderType,
    ...(smsSenderId ? { smsSenderId } : {}),
    smsMaxPerTick: integer(environment, 'SMS_MAX_PER_TICK', 20, 1, 500),
  });
}

export function loadConfig(): RuntimeConfig {
  const config = parseConfig(process.env);

  if (config.mediaStorageProvider !== 'local' || isAbsolute(config.mediaStoragePath)) return config;

  const runtimeDirectory = resolve(process.cwd());
  let workspaceRoot = runtimeDirectory;
  while (!existsSync(join(workspaceRoot, 'pnpm-workspace.yaml'))) {
    const parent = dirname(workspaceRoot);
    if (parent === workspaceRoot) {
      workspaceRoot = runtimeDirectory;
      break;
    }
    workspaceRoot = parent;
  }

  return Object.freeze({
    ...config,
    mediaStoragePath: resolve(workspaceRoot, config.mediaStoragePath),
  });
}
