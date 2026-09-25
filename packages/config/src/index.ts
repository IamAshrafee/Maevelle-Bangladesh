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
  });
}

export function loadConfig(): RuntimeConfig {
  return parseConfig(process.env);
}
