import { sql, type Kysely } from 'kysely';

import { decryptSecret, encryptSecret, type EncryptionKey } from '@maevelle/security';

import type { DatabaseSchema, MaevelleTransaction } from './index.js';
import { appendAuditEvent } from './platform.js';

// ---------------------------------------------------------------------------
// Domain Types & Contracts
// ---------------------------------------------------------------------------

export type SettingScope = 'ORGANIZATION' | 'SYSTEM';
export type SettingDataType = 'string' | 'number' | 'boolean' | 'json' | 'string_list';
export type SettingSource = 'DEFAULT' | 'DATABASE' | 'DEPLOYMENT_OVERRIDE';

export type SettingsReadinessStatus =
  | 'ready'
  | 'needs_configuration'
  | 'disabled'
  | 'restricted'
  | 'error';

export interface SettingMetadataDto {
  readonly key: string;
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingDataType;
  readonly defaultValue: unknown;
  readonly sensitive: boolean;
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly allowedValues?: readonly string[];
}

export interface SettingEntryDto {
  readonly key: string;
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingDataType;
  readonly value: unknown;
  readonly effectiveValue: unknown;
  readonly defaultValue: unknown;
  readonly source: SettingSource;
  readonly sensitive: boolean;
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly updatedAt?: string | null;
  readonly updatedBy?: string | null;
}

export interface EmailSettingsDto {
  readonly enabled: boolean;
  readonly provider: 'local' | 'resend';
  readonly fromName: string;
  readonly fromAddress: string;
  readonly replyTo: string;
  readonly testRecipientOverride: string | null;
  readonly allowedTestRecipients: readonly string[];
}

export interface EmailReadinessDto {
  readonly status: SettingsReadinessStatus;
  readonly provider: 'local' | 'resend';
  readonly environment: 'development' | 'test' | 'production';
  readonly enabled: boolean;
  readonly effectiveEnabled: boolean;
  readonly providerConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly reasons: readonly string[];
}

export interface MediaSettingsDto {
  readonly maxUploadBytes: number;
  readonly uploadExpirySeconds: number;
}

export interface StorefrontSettingsDto {
  readonly publicBaseUrl: string;
  readonly storeName: string;
  readonly supportEmail: string;
  readonly supportPhone: string;
}

export interface GeneralSettingsDto {
  readonly storeName: string;
  readonly supportEmail: string;
  readonly timezone: string;
  readonly defaultCurrency: string;
  readonly lowStockThreshold: number;
  readonly sessionTimeoutMinutes: number;
}

export interface ModuleSettingsSummaryDto {
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly settingCount: number;
  readonly readinessStatus?: SettingsReadinessStatus;
}

export interface SettingsListResponseDto {
  readonly modules: readonly ModuleSettingsSummaryDto[];
  readonly settings: readonly SettingEntryDto[];
}

export interface ModuleSettingsResponseDto<T = Record<string, unknown>> {
  readonly module: string;
  readonly settings: T;
  readonly effective: T;
  readonly readiness?: {
    readonly status: SettingsReadinessStatus;
    readonly reasons: readonly string[];
  };
  readonly schema: readonly SettingMetadataDto[];
  readonly version: number;
  readonly updatedAt?: string | null;
}

export interface IntegrationSecretStatusDto {
  readonly providerCode: string;
  readonly keyName: string;
  readonly configured: boolean;
  readonly updatedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export type SettingsErrorCode =
  | 'SETTING_NOT_FOUND'
  | 'SETTING_NOT_EDITABLE'
  | 'SETTING_INVALID'
  | 'SETTING_DEPENDENCY_MISSING'
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'SECRET_NOT_CONFIGURED'
  | 'CONFIGURATION_CONFLICT'
  | 'VERSION_CONFLICT';

export class SettingsDomainError extends Error {
  public constructor(
    public readonly code: SettingsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SettingsDomainError';
  }
}

// ---------------------------------------------------------------------------
// Setting Definition Model
// ---------------------------------------------------------------------------

export interface SettingValidationContext {
  readonly environment?: 'development' | 'test' | 'production';
  readonly allSettings?: Readonly<Record<string, unknown>>;
  readonly hasResendCredentials?: boolean;
}

export interface SettingDefinition<T = unknown> {
  readonly key: string;
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingDataType;
  readonly defaultValue: T;
  readonly sensitive: boolean;
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly allowedValues?: readonly string[];
  validate(value: unknown, context?: SettingValidationContext): { readonly valid: boolean; readonly error?: string };
  coerce?(raw: unknown): T;
}

function emailAddressValid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function httpUrlValid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Central Registry of All Supported Maevelle Settings
// ---------------------------------------------------------------------------

export const SETTING_DEFINITIONS: Readonly<Record<string, SettingDefinition<any>>> = Object.freeze({
  // --- Transactional Email Settings ---
  'email.enabled': {
    key: 'email.enabled',
    module: 'email',
    label: 'Transactional Email Enabled',
    description: 'Master switch controlling whether customer notifications are dispatched by background email workers.',
    type: 'boolean',
    defaultValue: false,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({ valid: typeof val === 'boolean', error: 'email.enabled must be a boolean.' }),
    coerce: (val) => Boolean(val),
  },
  'email.provider': {
    key: 'email.provider',
    module: 'email',
    label: 'Email Provider',
    description: 'Active transactional email dispatch adapter. Resend requires deployment or database API credentials.',
    type: 'string',
    defaultValue: 'local',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    allowedValues: ['local', 'resend'],
    validate: (val) => {
      const ok = val === 'local' || val === 'resend';
      return { valid: ok, error: "email.provider must be either 'local' or 'resend'." };
    },
    coerce: (val) => String(val).toLowerCase(),
  },
  'email.fromName': {
    key: 'email.fromName',
    module: 'email',
    label: 'Sender Display Name',
    description: 'Human-friendly brand name displayed in customer email inboxes (e.g. Maevelle).',
    type: 'string',
    defaultValue: 'Maevelle',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const ok = typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= 100;
      return { valid: ok, error: 'email.fromName must be between 1 and 100 characters.' };
    },
    coerce: (val) => String(val).trim(),
  },
  'email.fromAddress': {
    key: 'email.fromAddress',
    module: 'email',
    label: 'Sender Email Address',
    description: 'Automated notification sender mailbox. In production, this domain must match your verified DNS records.',
    type: 'string',
    defaultValue: 'orders@example.invalid',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val, ctx) => {
      if (!emailAddressValid(val)) return { valid: false, error: 'email.fromAddress must be a valid email address.' };
      const normalized = String(val).trim().toLowerCase();
      if (ctx?.environment === 'production' && normalized.endsWith('.invalid')) {
        return { valid: false, error: 'email.fromAddress cannot use .invalid domain in production environment.' };
      }
      return { valid: true };
    },
    coerce: (val) => String(val).trim().toLowerCase(),
  },
  'email.replyTo': {
    key: 'email.replyTo',
    module: 'email',
    label: 'Reply-To Email Address',
    description: 'Human support mailbox where customer email replies are routed.',
    type: 'string',
    defaultValue: 'maevelleBangladesh@gmail.com',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: emailAddressValid(val),
      error: 'email.replyTo must be a valid email address.',
    }),
    coerce: (val) => String(val).trim().toLowerCase(),
  },
  'email.testRecipientOverride': {
    key: 'email.testRecipientOverride',
    module: 'email',
    label: 'Test Recipient Override',
    description: 'When configured in non-production environments, all outbound transactional emails redirect to this mailbox for testing.',
    type: 'string',
    defaultValue: null,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val, ctx) => {
      if (val === null || val === undefined || val === '') return { valid: true };
      if (ctx?.environment === 'production') {
        return { valid: false, error: 'Test recipient override is strictly forbidden in production.' };
      }
      if (!emailAddressValid(val)) return { valid: false, error: 'email.testRecipientOverride must be a valid email.' };
      return { valid: true };
    },
    coerce: (val) => (val ? String(val).trim().toLowerCase() : null),
  },
  'email.allowedTestRecipients': {
    key: 'email.allowedTestRecipients',
    module: 'email',
    label: 'Allowed Test Recipients',
    description: 'List of authorized mailboxes allowed to receive test or redirected emails in non-production environments.',
    type: 'string_list',
    defaultValue: [],
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      if (!Array.isArray(val)) return { valid: false, error: 'email.allowedTestRecipients must be an array of emails.' };
      for (const item of val) {
        if (!emailAddressValid(item)) return { valid: false, error: `Invalid test email recipient: ${item}` };
      }
      return { valid: true };
    },
    coerce: (val) => (Array.isArray(val) ? val.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : []),
  },

  // --- Media & Storage Policies ---
  'media.maxUploadBytes': {
    key: 'media.maxUploadBytes',
    module: 'media',
    label: 'Maximum Upload Size (Bytes)',
    description: 'Maximum allowable file byte size for media asset uploads (default: 10MB, limit: 50MB).',
    type: 'number',
    defaultValue: 10485760,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      const ok = Number.isInteger(num) && num >= 1024 && num <= 52428800;
      return { valid: ok, error: 'media.maxUploadBytes must be an integer between 1KB and 50MB.' };
    },
    coerce: (val) => Number(val),
  },
  'media.uploadExpirySeconds': {
    key: 'media.uploadExpirySeconds',
    module: 'media',
    label: 'Upload Session Expiry (Seconds)',
    description: 'Duration before an initiated, uncompleted upload session expires and becomes invalid.',
    type: 'number',
    defaultValue: 900,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      const ok = Number.isInteger(num) && num >= 60 && num <= 3600;
      return { valid: ok, error: 'media.uploadExpirySeconds must be an integer between 60 and 3600 seconds.' };
    },
    coerce: (val) => Number(val),
  },

  // --- Storefront Public Configuration ---
  'storefront.publicBaseUrl': {
    key: 'storefront.publicBaseUrl',
    module: 'storefront',
    label: 'Public Storefront URL',
    description: 'Fully qualified public origin URL for customer browsing and transactional email links.',
    type: 'string',
    defaultValue: 'http://localhost:8080',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: httpUrlValid(val),
      error: 'storefront.publicBaseUrl must be a valid HTTP or HTTPS URL origin.',
    }),
    coerce: (val) => {
      try {
        return new URL(String(val)).origin;
      } catch {
        return String(val).trim();
      }
    },
  },
  'storefront.storeName': {
    key: 'storefront.storeName',
    module: 'storefront',
    label: 'Public Store Name',
    description: 'Display name presented on storefront headers, customer receipts, and email communications.',
    type: 'string',
    defaultValue: 'Maevelle Bangladesh',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= 120,
      error: 'storefront.storeName must be between 1 and 120 characters.',
    }),
    coerce: (val) => String(val).trim(),
  },
  'storefront.supportEmail': {
    key: 'storefront.supportEmail',
    module: 'storefront',
    label: 'Customer Support Email',
    description: 'Public contact email displayed in storefront footer and policy pages.',
    type: 'string',
    defaultValue: 'support@maevelle.com',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: emailAddressValid(val),
      error: 'storefront.supportEmail must be a valid email address.',
    }),
    coerce: (val) => String(val).trim().toLowerCase(),
  },
  'storefront.supportPhone': {
    key: 'storefront.supportPhone',
    module: 'storefront',
    label: 'Customer Support Phone',
    description: 'Public customer helpline telephone number.',
    type: 'string',
    defaultValue: '+8801700000000',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: typeof val === 'string' && val.trim().length >= 6 && val.trim().length <= 25,
      error: 'storefront.supportPhone must be a valid phone number between 6 and 25 characters.',
    }),
    coerce: (val) => String(val).trim(),
  },

  // --- General & Operational Settings ---
  'general.storeName': {
    key: 'general.storeName',
    module: 'general',
    label: 'Organization Name',
    description: 'Primary legal and operational organization business name.',
    type: 'string',
    defaultValue: 'Maevelle Bangladesh',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= 120,
      error: 'general.storeName must be between 1 and 120 characters.',
    }),
    coerce: (val) => String(val).trim(),
  },
  'general.supportEmail': {
    key: 'general.supportEmail',
    module: 'general',
    label: 'Primary Support Email',
    description: 'Primary support and operations contact address.',
    type: 'string',
    defaultValue: 'support@maevelle.com',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => ({
      valid: emailAddressValid(val),
      error: 'general.supportEmail must be a valid email address.',
    }),
    coerce: (val) => String(val).trim().toLowerCase(),
  },
  'general.timezone': {
    key: 'general.timezone',
    module: 'general',
    label: 'Default Business Timezone',
    description: 'Timezone used for order scheduling, analytics grouping, and operational reports.',
    type: 'string',
    defaultValue: 'Asia/Dhaka',
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: String(val) });
        return { valid: true };
      } catch {
        return { valid: false, error: 'general.timezone must be a valid IANA timezone identifier.' };
      }
    },
    coerce: (val) => String(val).trim(),
  },
  'general.defaultCurrency': {
    key: 'general.defaultCurrency',
    module: 'general',
    label: 'Primary Operational Currency',
    description: 'Three-letter ISO currency code used across pricing and accounting.',
    type: 'string',
    defaultValue: 'BDT',
    sensitive: false,
    runtimeMutable: false,
    requiresRestart: true,
    validate: (val) => ({
      valid: typeof val === 'string' && /^[A-Z]{3}$/.test(val.trim()),
      error: 'general.defaultCurrency must be a 3-letter uppercase ISO currency code.',
    }),
    coerce: (val) => String(val).trim().toUpperCase(),
  },
  'general.lowStockThreshold': {
    key: 'general.lowStockThreshold',
    module: 'general',
    label: 'Low Stock Alert Threshold',
    description: 'Inventory quantity at or below which variants trigger low stock warnings.',
    type: 'number',
    defaultValue: 5,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      const ok = Number.isInteger(num) && num >= 0 && num <= 1000;
      return { valid: ok, error: 'general.lowStockThreshold must be an integer between 0 and 1000.' };
    },
    coerce: (val) => Number(val),
  },
  'general.sessionTimeoutMinutes': {
    key: 'general.sessionTimeoutMinutes',
    module: 'general',
    label: 'Admin Session Inactivity Timeout',
    description: 'Inactivity duration before administrative operator sessions require re-authentication.',
    type: 'number',
    defaultValue: 1440,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      const ok = Number.isInteger(num) && num >= 15 && num <= 43200;
      return { valid: ok, error: 'general.sessionTimeoutMinutes must be between 15 and 43200 minutes (30 days).' };
    },
    coerce: (val) => Number(val),
  },

  // --- Inventory Module Alias ---
  'inventory.lowStockThreshold': {
    key: 'inventory.lowStockThreshold',
    module: 'inventory',
    label: 'Low Stock Warning Threshold',
    description: 'Inventory quantity at or below which variants trigger operational low-stock alarms.',
    type: 'number',
    defaultValue: 5,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      return { valid: Number.isInteger(num) && num >= 0 && num <= 1000, error: 'Threshold must be 0 to 1000.' };
    },
    coerce: (val) => Number(val),
  },

  // --- Security Module ---
  'security.sessionTimeoutMinutes': {
    key: 'security.sessionTimeoutMinutes',
    module: 'security',
    label: 'Operator Session Timeout (Minutes)',
    description: 'Idle minutes before operator session renewal is enforced.',
    type: 'number',
    defaultValue: 1440,
    sensitive: false,
    runtimeMutable: true,
    requiresRestart: false,
    validate: (val) => {
      const num = Number(val);
      return { valid: Number.isInteger(num) && num >= 15 && num <= 43200, error: 'Timeout must be 15 to 43200.' };
    },
    coerce: (val) => Number(val),
  },
});

export const MODULE_METADATA: Readonly<Record<string, { readonly label: string; readonly description: string }>> = Object.freeze({
  general: { label: 'General & Organization', description: 'Core business profile, timezone, operational thresholds, and session security.' },
  email: { label: 'Transactional Email', description: 'Outbound customer order communications, Resend provider integration, sender credentials, and testing safeguards.' },
  media: { label: 'Media & Storage', description: 'Asset upload limits, signed URL expiration, and storage lifecycle policies.' },
  storefront: { label: 'Storefront & Branding', description: 'Public storefront origin, contact information, customer helplines, and sitemap settings.' },
  inventory: { label: 'Inventory Policies', description: 'Stock thresholds, reserve timeout duration, and reorder alerts.' },
  security: { label: 'Security & Access', description: 'Operator session policies, password requirements, and isolation enforcement.' },
});

// ---------------------------------------------------------------------------
// In-Memory Fast Cache with Short TTL
// ---------------------------------------------------------------------------

interface CachedSettingsEntry {
  readonly fetchedAt: number;
  readonly rows: ReadonlyMap<string, { readonly value: unknown; readonly version: number; readonly updatedAt: string; readonly updatedBy: string | null }>;
}

const settingsCache = new Map<string, CachedSettingsEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export function invalidateSettingsCache(organizationId?: string): void {
  if (organizationId) {
    settingsCache.delete(organizationId);
  } else {
    settingsCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Database Row Retrieval
// ---------------------------------------------------------------------------

interface RawSettingRow {
  readonly setting_key: string;
  readonly module: string;
  readonly value_json: unknown;
  readonly is_secret: boolean;
  readonly version: string | number;
  readonly updated_at: string;
  readonly updated_by: string | null;
}

async function loadOrganizationSettingsRows(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<ReadonlyMap<string, { readonly value: unknown; readonly version: number; readonly updatedAt: string; readonly updatedBy: string | null }>> {
  const cached = settingsCache.get(organizationId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows;
  }

  const result = await sql<RawSettingRow>`
    select setting_key, module, value_json, is_secret, version, updated_at::text, updated_by::text
    from settings.runtime_settings
    where organization_id = ${organizationId}::uuid
  `.execute(db);

  const map = new Map<string, { readonly value: unknown; readonly version: number; readonly updatedAt: string; readonly updatedBy: string | null }>();
  for (const row of result.rows) {
    map.set(row.setting_key, {
      value: row.value_json,
      version: Number(row.version),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  }

  settingsCache.set(organizationId, { fetchedAt: now, rows: map });
  return map;
}

// ---------------------------------------------------------------------------
// Setting Resolution Engine
// ---------------------------------------------------------------------------

export interface DeploymentSettingsFallback {
  readonly nodeEnv?: string;
  readonly emailEnvironment?: 'development' | 'test' | 'production';
  readonly emailAllowedTestRecipients?: readonly string[];
  readonly resendApiKey?: string;
  readonly resendWebhookSecret?: string;
  readonly emailDefaultFromName?: string;
  readonly emailDefaultFromAddress?: string;
  readonly emailDefaultReplyTo?: string;
  readonly storefrontBaseUrl?: string;
  readonly mediaDefaultMaxUploadBytes?: number;
  readonly mediaDefaultUploadExpirySeconds?: number;
}

export function resolveSettingEntry<T>(
  key: string,
  dbRows: ReadonlyMap<string, { readonly value: unknown; readonly version: number; readonly updatedAt: string; readonly updatedBy: string | null }>,
  deployment?: DeploymentSettingsFallback,
): SettingEntryDto {
  const def = SETTING_DEFINITIONS[key];
  if (!def) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Unknown setting key: ${key}`);
  }

  const dbRow = dbRows.get(key);
  let value = dbRow !== undefined ? dbRow.value : def.defaultValue;
  let source: SettingSource = dbRow !== undefined ? 'DATABASE' : 'DEFAULT';

  // Apply deployment fallbacks if no database override exists
  if (dbRow === undefined && deployment) {
    if (key === 'storefront.publicBaseUrl' && deployment.storefrontBaseUrl) {
      value = deployment.storefrontBaseUrl;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'email.fromName' && deployment.emailDefaultFromName) {
      value = deployment.emailDefaultFromName;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'email.fromAddress' && deployment.emailDefaultFromAddress) {
      value = deployment.emailDefaultFromAddress;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'email.replyTo' && deployment.emailDefaultReplyTo) {
      value = deployment.emailDefaultReplyTo;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'media.maxUploadBytes' && deployment.mediaDefaultMaxUploadBytes) {
      value = deployment.mediaDefaultMaxUploadBytes;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'media.uploadExpirySeconds' && deployment.mediaDefaultUploadExpirySeconds) {
      value = deployment.mediaDefaultUploadExpirySeconds;
      source = 'DEPLOYMENT_OVERRIDE';
    } else if (key === 'email.allowedTestRecipients' && deployment.emailAllowedTestRecipients && deployment.emailAllowedTestRecipients.length > 0) {
      value = deployment.emailAllowedTestRecipients;
      source = 'DEPLOYMENT_OVERRIDE';
    }
  }

  // Calculate effective value respecting hard deployment safety policies
  let effectiveValue = value;
  const env = deployment?.emailEnvironment ?? (deployment?.nodeEnv as 'development' | 'test' | 'production') ?? 'development';

  if (key === 'email.testRecipientOverride' && env === 'production') {
    // Production strictly prohibits test recipient overrides
    effectiveValue = null;
  }

  // Coerce if defined
  if (def.coerce) {
    effectiveValue = def.coerce(effectiveValue);
    value = def.coerce(value);
  }

  return {
    key: def.key,
    module: def.module,
    label: def.label,
    description: def.description,
    type: def.type,
    value: def.sensitive ? (value ? '[CONFIGURED]' : null) : value,
    effectiveValue: def.sensitive ? (effectiveValue ? '[CONFIGURED]' : null) : effectiveValue,
    defaultValue: def.defaultValue,
    source,
    sensitive: def.sensitive,
    runtimeMutable: def.runtimeMutable,
    requiresRestart: def.requiresRestart,
    updatedAt: dbRow?.updatedAt ?? null,
    updatedBy: dbRow?.updatedBy ?? null,
  };
}

export function toSettingMetadataDto(def: SettingDefinition<any>): SettingMetadataDto {
  return {
    key: def.key,
    module: def.module,
    label: def.label,
    description: def.description,
    type: def.type,
    defaultValue: def.defaultValue,
    sensitive: def.sensitive,
    runtimeMutable: def.runtimeMutable,
    requiresRestart: def.requiresRestart,
    ...(def.allowedValues ? { allowedValues: def.allowedValues } : {}),
  };
}

export function getSettingMetadataList(): readonly SettingMetadataDto[] {
  return Object.values(SETTING_DEFINITIONS).map(toSettingMetadataDto);
}

// ---------------------------------------------------------------------------
// Module Readiness Calculation
// ---------------------------------------------------------------------------

export async function calculateEmailReadiness(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  emailSettings: EmailSettingsDto,
  deployment?: DeploymentSettingsFallback,
): Promise<EmailReadinessDto> {
  const env = deployment?.emailEnvironment ?? (deployment?.nodeEnv as 'development' | 'test' | 'production') ?? 'development';
  const hasResendSecret = Boolean(deployment?.resendApiKey) || (await hasIntegrationSecret(db, { organizationId, providerCode: 'RESEND', keyName: 'api_key' }));
  const hasWebhookSecret = Boolean(deployment?.resendWebhookSecret) || (await hasIntegrationSecret(db, { organizationId, providerCode: 'RESEND', keyName: 'webhook_secret' }));

  const reasons: string[] = [];
  let status: SettingsReadinessStatus = 'ready';

  if (!emailSettings.enabled) {
    status = 'disabled';
    reasons.push('Transactional email dispatch is currently disabled in runtime settings.');
  }

  if (emailSettings.provider === 'resend') {
    if (!hasResendSecret) {
      status = 'needs_configuration';
      reasons.push('Resend provider is selected but no Resend API key is configured (deployment or integration secret).');
    }
    if (env === 'production' && !hasWebhookSecret) {
      status = 'needs_configuration';
      reasons.push('Production environment requires a Resend webhook verification signing secret.');
    }
  }

  if (env === 'production') {
    if (emailSettings.fromAddress.endsWith('.invalid')) {
      status = 'needs_configuration';
      reasons.push('Production sender address cannot use an unverified .invalid domain.');
    }
  } else {
    if (emailSettings.testRecipientOverride) {
      reasons.push(`Non-production safety: all outgoing email is redirected to ${emailSettings.testRecipientOverride}.`);
    } else {
      reasons.push('Non-production notice: recipients must belong to the allowed test recipients list.');
    }
  }

  return {
    status,
    provider: emailSettings.provider,
    environment: env,
    enabled: emailSettings.enabled,
    effectiveEnabled: emailSettings.enabled && (emailSettings.provider === 'local' || hasResendSecret),
    providerConfigured: emailSettings.provider === 'local' || hasResendSecret,
    webhookConfigured: hasWebhookSecret,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// High-Level Domain Facades
// ---------------------------------------------------------------------------

export async function resolveEmailSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deployment?: DeploymentSettingsFallback,
): Promise<{ readonly settings: EmailSettingsDto; readonly readiness: EmailReadinessDto }> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const get = (k: string) => resolveSettingEntry(k, rows, deployment).effectiveValue;

  const settings: EmailSettingsDto = {
    enabled: Boolean(get('email.enabled')),
    provider: (get('email.provider') as 'local' | 'resend') || 'local',
    fromName: String(get('email.fromName') || 'Maevelle'),
    fromAddress: String(get('email.fromAddress') || 'orders@example.invalid'),
    replyTo: String(get('email.replyTo') || 'maevelleBangladesh@gmail.com'),
    testRecipientOverride: (get('email.testRecipientOverride') as string | null) ?? null,
    allowedTestRecipients: (get('email.allowedTestRecipients') as readonly string[]) || [],
  };

  const readiness = await calculateEmailReadiness(db, organizationId, settings, deployment);
  return { settings, readiness };
}

export async function resolveMediaSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deployment?: DeploymentSettingsFallback,
): Promise<MediaSettingsDto> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const get = (k: string) => resolveSettingEntry(k, rows, deployment).effectiveValue;

  return {
    maxUploadBytes: Number(get('media.maxUploadBytes') || 10485760),
    uploadExpirySeconds: Number(get('media.uploadExpirySeconds') || 900),
  };
}

export async function resolveStorefrontSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deployment?: DeploymentSettingsFallback,
): Promise<StorefrontSettingsDto> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const get = (k: string) => resolveSettingEntry(k, rows, deployment).effectiveValue;

  return {
    publicBaseUrl: String(get('storefront.publicBaseUrl') || 'http://localhost:8080'),
    storeName: String(get('storefront.storeName') || 'Maevelle Bangladesh'),
    supportEmail: String(get('storefront.supportEmail') || 'support@maevelle.com'),
    supportPhone: String(get('storefront.supportPhone') || '+8801700000000'),
  };
}

export async function resolveGeneralSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deployment?: DeploymentSettingsFallback,
): Promise<GeneralSettingsDto> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const get = (k: string) => resolveSettingEntry(k, rows, deployment).effectiveValue;

  return {
    storeName: String(get('general.storeName') || 'Maevelle Bangladesh'),
    supportEmail: String(get('general.supportEmail') || 'support@maevelle.com'),
    timezone: String(get('general.timezone') || 'Asia/Dhaka'),
    defaultCurrency: String(get('general.defaultCurrency') || 'BDT'),
    lowStockThreshold: Number(get('general.lowStockThreshold') || 5),
    sessionTimeoutMinutes: Number(get('general.sessionTimeoutMinutes') || 1440),
  };
}

// ---------------------------------------------------------------------------
// All-Settings List and Module-Specific Responses
// ---------------------------------------------------------------------------

export async function listAllSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  deployment?: DeploymentSettingsFallback,
): Promise<SettingsListResponseDto> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const entries: SettingEntryDto[] = [];
  const moduleCounts = new Map<string, number>();

  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    entries.push(resolveSettingEntry(key, rows, deployment));
    moduleCounts.set(def.module, (moduleCounts.get(def.module) ?? 0) + 1);
  }

  const emailRes = await resolveEmailSettings(db, organizationId, deployment);

  const modules: ModuleSettingsSummaryDto[] = Object.entries(MODULE_METADATA).map(([mod, meta]) => ({
    module: mod,
    label: meta.label,
    description: meta.description,
    settingCount: moduleCounts.get(mod) ?? 0,
    ...(mod === 'email' ? { readinessStatus: emailRes.readiness.status } : {}),
  }));

  return { modules, settings: entries };
}

export async function getModuleSettings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  module: string,
  deployment?: DeploymentSettingsFallback,
): Promise<ModuleSettingsResponseDto> {
  const rows = await loadOrganizationSettingsRows(db, organizationId);
  const defs = Object.values(SETTING_DEFINITIONS).filter((d) => d.module === module);
  if (defs.length === 0) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Module not found: ${module}`);
  }

  const settings: Record<string, unknown> = {};
  const effective: Record<string, unknown> = {};
  let maxVersion = 1;
  let latestUpdatedAt: string | null = null;

  for (const def of defs) {
    const entry = resolveSettingEntry(def.key, rows, deployment);
    settings[def.key] = entry.value;
    effective[def.key] = entry.effectiveValue;
    const dbRow = rows.get(def.key);
    if (dbRow) {
      if (dbRow.version > maxVersion) maxVersion = dbRow.version;
      if (!latestUpdatedAt || dbRow.updatedAt > latestUpdatedAt) latestUpdatedAt = dbRow.updatedAt;
    }
  }

  let readiness: { readonly status: SettingsReadinessStatus; readonly reasons: readonly string[] } | undefined;
  if (module === 'email') {
    const emailRes = await resolveEmailSettings(db, organizationId, deployment);
    readiness = emailRes.readiness;
  }

  return {
    module,
    settings,
    effective,
    ...(readiness ? { readiness } : {}),
    schema: defs.map(toSettingMetadataDto),
    version: maxVersion,
    updatedAt: latestUpdatedAt,
  };
}

// ---------------------------------------------------------------------------
// Updating Settings & Resetting Defaults
// ---------------------------------------------------------------------------

export interface UpdateSettingInput {
  readonly organizationId: string;
  readonly actorId: string;
  readonly key: string;
  readonly value: unknown;
  readonly reason?: string;
  readonly expectedVersion?: number;
  readonly deployment?: DeploymentSettingsFallback;
}

export interface UpdateModuleSettingsInput {
  readonly organizationId: string;
  readonly actorId: string;
  readonly module: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly reason?: string;
  readonly expectedVersion?: number;
  readonly deployment?: DeploymentSettingsFallback;
}

export async function updateSingleSetting(
  db: Kysely<DatabaseSchema>,
  input: UpdateSettingInput,
): Promise<SettingEntryDto> {
  const def = SETTING_DEFINITIONS[input.key];
  if (!def) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Unknown setting: ${input.key}`);
  }
  if (!def.runtimeMutable) {
    throw new SettingsDomainError('SETTING_NOT_EDITABLE', `Setting ${input.key} cannot be modified at runtime.`);
  }

  const validation = def.validate(input.value, {
    environment: input.deployment?.emailEnvironment ?? (input.deployment?.nodeEnv as any) ?? 'development',
  });
  if (!validation.valid) {
    throw new SettingsDomainError('SETTING_INVALID', validation.error ?? `Invalid value for ${input.key}`);
  }

  const finalValue = def.coerce ? def.coerce(input.value) : input.value;

  const updatedRow = await db.transaction().execute(async (tx: MaevelleTransaction) => {
    const existing = await sql<{ version: string; value_json: unknown }>`
      select version, value_json from settings.runtime_settings
      where organization_id = ${input.organizationId}::uuid and setting_key = ${input.key}
      for update
    `.execute(tx);

    const oldRow = existing.rows[0];
    if (input.expectedVersion !== undefined && oldRow && Number(oldRow.version) !== input.expectedVersion) {
      throw new SettingsDomainError('VERSION_CONFLICT', 'Setting has been modified by another administrator.');
    }

    const nextVersion = oldRow ? Number(oldRow.version) + 1 : 1;

    await sql`
      insert into settings.runtime_settings (
        organization_id, module, setting_key, scope_type, value_json, is_secret, version, updated_by, updated_at
      ) values (
        ${input.organizationId}::uuid, ${def.module}, ${def.key}, 'ORGANIZATION',
        ${JSON.stringify(finalValue)}::jsonb, ${def.sensitive}, ${nextVersion}, ${input.actorId}::uuid, now()
      )
      on conflict (organization_id, setting_key) do update set
        value_json = excluded.value_json,
        version = excluded.version,
        updated_by = excluded.updated_by,
        updated_at = now()
    `.execute(tx);

    // Write audit event
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.updated',
      targetType: 'setting',
      targetId: input.key,
      reason: input.reason ?? `Updated setting ${input.key}`,
      beforeDiff: def.sensitive ? { [input.key]: '[REDACTED]' } : { [input.key]: oldRow?.value_json ?? def.defaultValue },
      afterDiff: def.sensitive ? { [input.key]: '[REDACTED]' } : { [input.key]: finalValue },
      metadata: { key: input.key, module: def.module, version: nextVersion },
    });

    // Write outbox event for inter-service and worker synchronization
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, payload
      ) values (
        ${input.organizationId}::uuid, 'settings.changed',
        ${JSON.stringify({ key: input.key, module: def.module, version: nextVersion })}::jsonb
      )
    `.execute(tx);

    return { nextVersion };
  });

  invalidateSettingsCache(input.organizationId);

  const freshRows = await loadOrganizationSettingsRows(db, input.organizationId);
  return resolveSettingEntry(input.key, freshRows, input.deployment);
}

export async function updateModuleSettings(
  db: Kysely<DatabaseSchema>,
  input: UpdateModuleSettingsInput,
): Promise<ModuleSettingsResponseDto> {
  const defs = Object.values(SETTING_DEFINITIONS).filter((d) => d.module === input.module);
  if (defs.length === 0) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Module not found: ${input.module}`);
  }

  // Validate each provided setting
  const updates: Array<{ readonly def: SettingDefinition<any>; readonly value: unknown }> = [];
  for (const [key, val] of Object.entries(input.settings)) {
    const def = SETTING_DEFINITIONS[key];
    if (!def || def.module !== input.module) {
      throw new SettingsDomainError('SETTING_NOT_FOUND', `Setting ${key} does not belong to module ${input.module}`);
    }
    if (!def.runtimeMutable) {
      throw new SettingsDomainError('SETTING_NOT_EDITABLE', `Setting ${key} cannot be modified at runtime.`);
    }
    const validation = def.validate(val, {
      environment: input.deployment?.emailEnvironment ?? (input.deployment?.nodeEnv as any) ?? 'development',
      allSettings: input.settings,
    });
    if (!validation.valid) {
      throw new SettingsDomainError('SETTING_INVALID', validation.error ?? `Invalid value for ${key}`);
    }
    const finalVal = def.coerce ? def.coerce(val) : val;
    updates.push({ def, value: finalVal });
  }

  if (updates.length === 0) {
    return getModuleSettings(db, input.organizationId, input.module, input.deployment);
  }

  await db.transaction().execute(async (tx: MaevelleTransaction) => {
    const beforeDiff: Record<string, unknown> = {};
    const afterDiff: Record<string, unknown> = {};

    for (const update of updates) {
      const existing = await sql<{ version: string; value_json: unknown }>`
        select version, value_json from settings.runtime_settings
        where organization_id = ${input.organizationId}::uuid and setting_key = ${update.def.key}
        for update
      `.execute(tx);

      const oldRow = existing.rows[0];
      const nextVersion = oldRow ? Number(oldRow.version) + 1 : 1;

      await sql`
        insert into settings.runtime_settings (
          organization_id, module, setting_key, scope_type, value_json, is_secret, version, updated_by, updated_at
        ) values (
          ${input.organizationId}::uuid, ${update.def.module}, ${update.def.key}, 'ORGANIZATION',
          ${JSON.stringify(update.value)}::jsonb, ${update.def.sensitive}, ${nextVersion}, ${input.actorId}::uuid, now()
        )
        on conflict (organization_id, setting_key) do update set
          value_json = excluded.value_json,
          version = excluded.version,
          updated_by = excluded.updated_by,
          updated_at = now()
      `.execute(tx);

      beforeDiff[update.def.key] = update.def.sensitive ? '[REDACTED]' : (oldRow?.value_json ?? update.def.defaultValue);
      afterDiff[update.def.key] = update.def.sensitive ? '[REDACTED]' : update.value;
    }

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.module_updated',
      targetType: 'module_settings',
      targetId: input.module,
      reason: input.reason ?? `Updated ${input.module} module settings`,
      beforeDiff,
      afterDiff,
      metadata: { module: input.module, keys: updates.map((u) => u.def.key) },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, payload
      ) values (
        ${input.organizationId}::uuid, 'settings.changed',
        ${JSON.stringify({ module: input.module, keys: updates.map((u) => u.def.key) })}::jsonb
      )
    `.execute(tx);
  });

  invalidateSettingsCache(input.organizationId);
  return getModuleSettings(db, input.organizationId, input.module, input.deployment);
}

export async function resetSingleSetting(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly key: string;
    readonly reason?: string;
    readonly deployment?: DeploymentSettingsFallback;
  },
): Promise<SettingEntryDto> {
  const def = SETTING_DEFINITIONS[input.key];
  if (!def) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Unknown setting: ${input.key}`);
  }

  await db.transaction().execute(async (tx: MaevelleTransaction) => {
    const existing = await sql<{ value_json: unknown }>`
      select value_json from settings.runtime_settings
      where organization_id = ${input.organizationId}::uuid and setting_key = ${input.key}
    `.execute(tx);

    await sql`
      delete from settings.runtime_settings
      where organization_id = ${input.organizationId}::uuid and setting_key = ${input.key}
    `.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.reset',
      targetType: 'setting',
      targetId: input.key,
      reason: input.reason ?? `Reset setting ${input.key} to default`,
      beforeDiff: existing.rows[0]?.value_json ? { [input.key]: existing.rows[0].value_json } : null,
      afterDiff: { [input.key]: def.defaultValue },
      metadata: { key: input.key, module: def.module },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, payload
      ) values (
        ${input.organizationId}::uuid, 'settings.changed',
        ${JSON.stringify({ key: input.key, module: def.module, action: 'reset' })}::jsonb
      )
    `.execute(tx);
  });

  invalidateSettingsCache(input.organizationId);
  const rows = await loadOrganizationSettingsRows(db, input.organizationId);
  return resolveSettingEntry(input.key, rows, input.deployment);
}

export async function resetModuleSettings(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly module: string;
    readonly reason?: string;
    readonly deployment?: DeploymentSettingsFallback;
  },
): Promise<ModuleSettingsResponseDto> {
  const defs = Object.values(SETTING_DEFINITIONS).filter((d) => d.module === input.module);
  if (defs.length === 0) {
    throw new SettingsDomainError('SETTING_NOT_FOUND', `Module not found: ${input.module}`);
  }

  await db.transaction().execute(async (tx: MaevelleTransaction) => {
    await sql`
      delete from settings.runtime_settings
      where organization_id = ${input.organizationId}::uuid and module = ${input.module}
    `.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.module_reset',
      targetType: 'module_settings',
      targetId: input.module,
      reason: input.reason ?? `Reset all settings for module ${input.module} to defaults`,
      metadata: { module: input.module },
    });

    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, payload
      ) values (
        ${input.organizationId}::uuid, 'settings.changed',
        ${JSON.stringify({ module: input.module, action: 'reset_module' })}::jsonb
      )
    `.execute(tx);
  });

  invalidateSettingsCache(input.organizationId);
  return getModuleSettings(db, input.organizationId, input.module, input.deployment);
}

// ---------------------------------------------------------------------------
// Encrypted Integration Secrets Architecture
// ---------------------------------------------------------------------------

export async function saveIntegrationSecret(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly providerCode: string;
    readonly keyName: string;
    readonly plaintextSecret: string;
    readonly encryptionKey: EncryptionKey;
    readonly reason?: string;
  },
): Promise<IntegrationSecretStatusDto> {
  if (!input.plaintextSecret || !input.plaintextSecret.trim()) {
    throw new SettingsDomainError('SECRET_NOT_CONFIGURED', 'Secret value cannot be empty.');
  }

  const ciphertext = encryptSecret(input.plaintextSecret.trim(), input.encryptionKey);
  const normalizedProvider = input.providerCode.toUpperCase().trim();
  const normalizedKey = input.keyName.toLowerCase().trim();

  await db.transaction().execute(async (tx: MaevelleTransaction) => {
    const existing = await sql<{ version: string }>`
      select version from settings.integration_secrets
      where organization_id = ${input.organizationId}::uuid
        and provider_code = ${normalizedProvider}
        and secret_key_name = ${normalizedKey}
    `.execute(tx);

    const nextVersion = existing.rows[0] ? Number(existing.rows[0].version) + 1 : 1;

    await sql`
      insert into settings.integration_secrets (
        organization_id, provider_code, secret_key_name, secret_ciphertext, secret_key_id, version, updated_by, updated_at
      ) values (
        ${input.organizationId}::uuid, ${normalizedProvider}, ${normalizedKey},
        ${ciphertext}, ${input.encryptionKey.id}, ${nextVersion}, ${input.actorId}::uuid, now()
      )
      on conflict (organization_id, provider_code, secret_key_name) do update set
        secret_ciphertext = excluded.secret_ciphertext,
        secret_key_id = excluded.secret_key_id,
        version = excluded.version,
        updated_by = excluded.updated_by,
        updated_at = now()
    `.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.secret_stored',
      targetType: 'integration_secret',
      targetId: `${normalizedProvider}.${normalizedKey}`,
      reason: input.reason ?? `Configured secret ${normalizedKey} for provider ${normalizedProvider}`,
      beforeDiff: existing.rows[0] ? { status: 'configured' } : { status: 'unconfigured' },
      afterDiff: { status: 'configured' },
      metadata: { provider: normalizedProvider, key: normalizedKey, version: nextVersion },
    });
  });

  invalidateSettingsCache(input.organizationId);

  return {
    providerCode: normalizedProvider,
    keyName: normalizedKey,
    configured: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function getIntegrationSecret(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly providerCode: string;
    readonly keyName: string;
    readonly encryptionKey: EncryptionKey;
  },
): Promise<string | undefined> {
  const result = await sql<{ secret_ciphertext: string }>`
    select secret_ciphertext from settings.integration_secrets
    where organization_id = ${input.organizationId}::uuid
      and provider_code = ${input.providerCode.toUpperCase().trim()}
      and secret_key_name = ${input.keyName.toLowerCase().trim()}
  `.execute(db);

  const row = result.rows[0];
  if (!row) return undefined;

  try {
    return decryptSecret(row.secret_ciphertext, input.encryptionKey);
  } catch {
    throw new SettingsDomainError('SECRET_NOT_CONFIGURED', 'Unable to decrypt integration secret with the active key.');
  }
}

export async function hasIntegrationSecret(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly providerCode: string;
    readonly keyName: string;
  },
): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    select exists (
      select 1 from settings.integration_secrets
      where organization_id = ${input.organizationId}::uuid
        and provider_code = ${input.providerCode.toUpperCase().trim()}
        and secret_key_name = ${input.keyName.toLowerCase().trim()}
    ) as "exists"
  `.execute(db);

  return Boolean(result.rows[0]?.exists);
}

export async function deleteIntegrationSecret(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly providerCode: string;
    readonly keyName: string;
    readonly reason?: string;
  },
): Promise<void> {
  const normalizedProvider = input.providerCode.toUpperCase().trim();
  const normalizedKey = input.keyName.toLowerCase().trim();

  await db.transaction().execute(async (tx: MaevelleTransaction) => {
    await sql`
      delete from settings.integration_secrets
      where organization_id = ${input.organizationId}::uuid
        and provider_code = ${normalizedProvider}
        and secret_key_name = ${normalizedKey}
    `.execute(tx);

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'settings.secret_revoked',
      targetType: 'integration_secret',
      targetId: `${normalizedProvider}.${normalizedKey}`,
      reason: input.reason ?? `Revoked secret ${normalizedKey} for provider ${normalizedProvider}`,
      metadata: { provider: normalizedProvider, key: normalizedKey },
    });
  });

  invalidateSettingsCache(input.organizationId);
}
