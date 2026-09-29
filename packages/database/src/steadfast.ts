import { sql, type Kysely } from 'kysely';

import type {
  CourierBookingRequest,
  CourierBookingResult,
  CourierCapabilities,
  CourierProviderPort,
  CourierTrackingResult,
  NormalizedCourierStatus,
} from '@maevelle/core';
import { decryptSecret, encryptSecret, type EncryptionKey } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export const STEADFAST_PROVIDER_CODE = 'STEADFAST';

export type SteadfastEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface SteadfastCredentials {
  readonly apiKey: string;
  readonly secretKey: string;
}

export interface SteadfastSafeConfiguration {
  readonly accountId: string;
  readonly name: string;
  readonly environment: SteadfastEnvironment;
  readonly status: string;
  readonly connectionStatus: 'NOT_CHECKED' | 'CONNECTED' | 'ERROR';
  readonly lastValidatedAt?: string;
  readonly lastErrorCode?: string;
  readonly hasCredentials: boolean;
  readonly capabilities: CourierCapabilities;
}

interface SteadfastAccountConfig {
  readonly environment: SteadfastEnvironment;
  readonly capabilities: CourierCapabilities;
  readonly connectionStatus?: 'NOT_CHECKED' | 'CONNECTED' | 'ERROR';
  readonly lastValidatedAt?: string;
  readonly lastErrorCode?: string;
}

interface SteadfastAccountRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly config: SteadfastAccountConfig;
}

const STEADFAST_BASE_URLS: Readonly<Record<SteadfastEnvironment, string>> = {
  SANDBOX: 'https://portal.steadfast.com.bd/api/v1',
  PRODUCTION: 'https://portal.steadfast.com.bd/api/v1',
};

const STEADFAST_CAPABILITIES: CourierCapabilities = {
  booking: true,
  cancellation: false,
  tracking: true,
  webhooks: true,
  cod: true,
  codUpdate: false,
  returnTracking: true,
  serviceability: true,
  quoting: false,
};

export class SteadfastIntegrationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = 'SteadfastIntegrationError';
  }
}

export function normalizeSteadfastStatus(status: string): NormalizedCourierStatus | undefined {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case 'in_review':
    case 'pending':
      return 'BOOKED';
    case 'picked':
      return 'HANDED_OVER';
    case 'in_transit':
      return 'IN_TRANSIT';
    case 'delivered':
    case 'partial_delivered':
      return 'DELIVERED';
    case 'cancelled':
    case 'cancelled_approval_pending':
      return 'CANCELLED';
    case 'hold':
      return 'ATTEMPT_FAILED';
    case 'return':
    case 'returning':
      return 'RETURNING';
    case 'returned':
      return 'RETURNED_TO_ORIGIN';
    case 'unknown':
    default:
      return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function createSteadfastProvider(
  config: SteadfastAccountConfig,
  credentials: SteadfastCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<CourierProviderPort> {
  const baseUrl = STEADFAST_BASE_URLS[config.environment];

  async function postJson(endpoint: string, body: unknown): Promise<{ status: number; data: unknown }> {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Api-Key': credentials.apiKey,
        'Secret-Key': credentials.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }

  async function getJson(endpoint: string): Promise<{ status: number; data: unknown }> {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Api-Key': credentials.apiKey,
        'Secret-Key': credentials.secretKey,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }

  return {
    providerCode: STEADFAST_PROVIDER_CODE,
    getCapabilities(): CourierCapabilities {
      return STEADFAST_CAPABILITIES;
    },
    async checkServiceability(_input?: {
      readonly district?: string;
      readonly city?: string;
      readonly area?: string;
      readonly postalCode?: string;
    }): Promise<{ readonly serviceable: boolean; readonly reasonCode?: string }> {
      // Steadfast covers all 64 districts in Bangladesh nationwide
      return { serviceable: true };
    },
    async createBooking(request: CourierBookingRequest): Promise<CourierBookingResult> {
      try {
        const codAmount = request.cod.required ? Number(request.cod.expectedAmount) : 0;
        const payload = {
          invoice: request.merchantReference,
          recipient_name: request.recipient.name,
          recipient_phone: request.recipient.phone,
          recipient_address: request.recipient.address,
          cod_amount: Math.max(0, codAmount),
          note: request.contents.description?.slice(0, 150) ?? '',
        };

        const res = await postJson('/create_order', payload);

        if (res.status === 200 && isRecord(res.data) && res.data.status === 200) {
          const consignment = isRecord(res.data.consignment) ? res.data.consignment : undefined;
          const consignmentId = consignment ? stringValue(consignment.consignment_id) : undefined;
          const trackingCode = consignment ? stringValue(consignment.tracking_code) : undefined;
          const rawStatus = consignment ? stringValue(consignment.status) : 'in_review';

          if (!consignmentId && !trackingCode) {
            return { kind: 'UNKNOWN_OUTCOME', providerStatus: 'NO_CONSIGNMENT_IN_RESPONSE' };
          }

          const providerBookingId = consignmentId ?? trackingCode!;
          return {
            kind: 'BOOKED',
            providerBookingId,
            ...(trackingCode ? { trackingReference: trackingCode } : {}),
            ...(rawStatus ? { providerStatus: rawStatus } : {}),
          };
        }

        if (isRecord(res.data) && res.data.status && res.data.status !== 200) {
          const errorMsg = stringValue(res.data.message) ?? 'STEADFAST_CREATION_REJECTED';
          return { kind: 'REJECTED', reasonCode: errorMsg };
        }

        return { kind: 'UNKNOWN_OUTCOME', providerStatus: `HTTP_${res.status}` };
      } catch (err) {
        return { kind: 'UNKNOWN_OUTCOME', providerStatus: err instanceof Error ? err.message : 'NETWORK_ERROR' };
      }
    },
    async getBooking(providerBookingId: string): Promise<CourierTrackingResult> {
      const res = await getJson(`/status_by_cid/${encodeURIComponent(providerBookingId)}`);
      if (res.status === 200 && isRecord(res.data)) {
        const rawStatus = stringValue(res.data.delivery_status);
        const normalized = rawStatus ? normalizeSteadfastStatus(rawStatus) : undefined;
        return {
          providerBookingId,
          ...(rawStatus ? { providerStatus: rawStatus } : {}),
          events: normalized
            ? [
                {
                  providerStatus: rawStatus!,
                  normalizedStatus: normalized,
                  occurredAt: new Date().toISOString(),
                },
              ]
            : [],
        };
      }
      throw new SteadfastIntegrationError('STATUS_CHECK_FAILED', `Unable to query Steadfast consignment ${providerBookingId}`);
    },
  };
}

export async function configureSteadfastAccount(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly accountId?: string;
    readonly name?: string;
    readonly environment: SteadfastEnvironment;
    readonly credentials?: SteadfastCredentials;
  },
): Promise<SteadfastSafeConfiguration> {
  return db.transaction().execute(async (tx) => {
    const integration = await sql<{ id: string }>`
      insert into integrations.integrations (organization_id, provider_code, integration_type, name, status)
      values (${input.organizationId}, ${STEADFAST_PROVIDER_CODE}, 'COURIER', 'Steadfast Courier', 'ACTIVE')
      on conflict (organization_id, provider_code, integration_type) do update set
        name = excluded.name, status = 'ACTIVE', updated_at = now(), version = integrations.integrations.version + 1
      returning id
    `.execute(tx);

    const config: SteadfastAccountConfig = {
      environment: input.environment,
      capabilities: STEADFAST_CAPABILITIES,
    };

    let encryptedSecretCiphertext: string | undefined;
    if (input.credentials) {
      if (!input.credentials.apiKey.trim() || !input.credentials.secretKey.trim()) {
        throw new SteadfastIntegrationError('VALIDATION_FAILED', 'Steadfast API Key and Secret Key are required.');
      }
      encryptedSecretCiphertext = encryptSecret(
        JSON.stringify(input.credentials),
        encryptionKey,
      );
    }

    let accountId = input.accountId;
    if (accountId) {
      const existing = await sql<{ id: string }>`
        select id from integrations.integration_accounts
        where organization_id = ${input.organizationId} and id = ${accountId} for update
      `.execute(tx);
      if (!existing.rows[0]) {
        throw new SteadfastIntegrationError('NOT_FOUND', 'Steadfast account was not found.');
      }

      await sql`
        update integrations.integration_accounts
        set name = coalesce(${input.name ?? null}, name),
          non_secret_config = ${JSON.stringify(config)}::jsonb,
          secret_reference = 'DATABASE_ENCRYPTED',
          version = version + 1,
          updated_at = now()
        where id = ${accountId}
      `.execute(tx);

      if (encryptedSecretCiphertext) {
        await sql`
          insert into integrations.provider_credentials
            (integration_account_id, organization_id, secret_ciphertext, secret_key_id)
          values (${accountId}, ${input.organizationId}, ${encryptedSecretCiphertext}, ${encryptionKey.id})
          on conflict (integration_account_id) do update set
            secret_ciphertext = excluded.secret_ciphertext,
            secret_key_id = excluded.secret_key_id,
            credential_version = integrations.provider_credentials.credential_version + 1,
            updated_at = now()
        `.execute(tx);
      }
    } else {
      if (!encryptedSecretCiphertext) {
        throw new SteadfastIntegrationError('VALIDATION_FAILED', 'Credentials are required when creating a new Steadfast account.');
      }
      const inserted = await sql<{ id: string }>`
        insert into integrations.integration_accounts (
          organization_id, integration_id, name, status, non_secret_config, secret_reference
        ) values (
          ${input.organizationId}, ${integration.rows[0]!.id}, ${input.name ?? 'Steadfast Courier'}, 'ACTIVE',
          ${JSON.stringify(config)}::jsonb, 'DATABASE_ENCRYPTED'
        ) returning id
      `.execute(tx);
      accountId = inserted.rows[0]!.id;

      await sql`
        insert into integrations.provider_credentials
          (integration_account_id, organization_id, secret_ciphertext, secret_key_id)
        values (${accountId}, ${input.organizationId}, ${encryptedSecretCiphertext}, ${encryptionKey.id})
      `.execute(tx);
    }

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'integrations.steadfast.configured',
      targetType: 'integrations.integration_account',
      targetId: accountId,
      metadata: { environment: input.environment, hasCredentials: Boolean(encryptedSecretCiphertext) },
    });

    const configs = await getSteadfastConfigurations(tx, input.organizationId);
    const result = configs.find((item) => item.accountId === accountId);
    if (!result) throw new SteadfastIntegrationError('NOT_FOUND', 'Saved Steadfast configuration could not be read.');
    return result;
  });
}

export async function setSteadfastAccountStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    readonly organizationId: string;
    readonly actorId: string;
    readonly accountId: string;
    readonly status: 'ACTIVE' | 'DISABLED';
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const updated = await sql<{ id: string }>`
      update integrations.integration_accounts
      set status = ${input.status}, version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.accountId}
      returning id
    `.execute(tx);
    if (!updated.rows[0]) throw new SteadfastIntegrationError('NOT_FOUND', 'Steadfast account was not found.');

    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'integrations.steadfast.status_changed',
      targetType: 'integrations.integration_account',
      targetId: input.accountId,
      metadata: { status: input.status },
    });
  });
}

export async function getSteadfastConfigurations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly SteadfastSafeConfiguration[]> {
  const result = await sql<{
    id: string;
    name: string;
    status: string;
    non_secret_config: SteadfastAccountConfig;
    has_credentials: boolean;
  }>`
    select a.id, a.name, a.status, a.non_secret_config,
      exists(
        select 1 from integrations.provider_credentials pc
        where pc.integration_account_id = a.id and pc.organization_id = a.organization_id
      ) as has_credentials
    from integrations.integration_accounts a
    join integrations.integrations i on i.id = a.integration_id and i.organization_id = a.organization_id
    where a.organization_id = ${organizationId} and i.provider_code = ${STEADFAST_PROVIDER_CODE}
    order by a.created_at asc
  `.execute(db);

  return result.rows.map((row) => ({
    accountId: row.id,
    name: row.name,
    environment: row.non_secret_config.environment ?? 'PRODUCTION',
    status: row.status,
    connectionStatus: row.non_secret_config.connectionStatus ?? 'NOT_CHECKED',
    ...(row.non_secret_config.lastValidatedAt ? { lastValidatedAt: row.non_secret_config.lastValidatedAt } : {}),
    ...(row.non_secret_config.lastErrorCode ? { lastErrorCode: row.non_secret_config.lastErrorCode } : {}),
    hasCredentials: row.has_credentials,
    capabilities: STEADFAST_CAPABILITIES,
  }));
}

export async function checkSteadfastConnection(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  input: { readonly organizationId: string; readonly accountId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string; balance?: number }> {
  const account = await loadSteadfastAccountRecord(db, input.organizationId, input.accountId);
  if (!account) throw new SteadfastIntegrationError('NOT_FOUND', 'Steadfast account was not found.');

  const credentials = await loadSteadfastCredentials(db, encryptionKey, input.organizationId, input.accountId);
  if (!credentials) throw new SteadfastIntegrationError('MISSING_CREDENTIALS', 'Steadfast account has no credentials configured.');

  const baseUrl = STEADFAST_BASE_URLS[account.config.environment];
  try {
    const response = await fetchImpl(`${baseUrl}/get_balance`, {
      method: 'GET',
      headers: {
        'Api-Key': credentials.apiKey,
        'Secret-Key': credentials.secretKey,
        'Content-Type': 'application/json',
      },
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = response.status === 200 && isRecord(body) && body.status === 200;
    const balance = ok && typeof body.current_balance === 'number' ? body.current_balance : undefined;

    const nextConfig: SteadfastAccountConfig = {
      ...account.config,
      connectionStatus: ok ? 'CONNECTED' : 'ERROR',
      lastValidatedAt: new Date().toISOString(),
      ...(ok ? {} : { lastErrorCode: `HTTP_${response.status}` }),
    };

    await sql`
      update integrations.integration_accounts
      set non_secret_config = ${JSON.stringify(nextConfig)}::jsonb, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.accountId}
    `.execute(db);

    return {
      ok,
      message: ok ? 'Connection verified successfully.' : (stringValue(body.message) ?? `Failed with HTTP ${response.status}`),
      ...(balance !== undefined ? { balance } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    const nextConfig: SteadfastAccountConfig = {
      ...account.config,
      connectionStatus: 'ERROR',
      lastValidatedAt: new Date().toISOString(),
      lastErrorCode: 'NETWORK_ERROR',
    };
    await sql`
      update integrations.integration_accounts
      set non_secret_config = ${JSON.stringify(nextConfig)}::jsonb, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.accountId}
    `.execute(db);
    return { ok: false, message };
  }
}

async function loadSteadfastAccountRecord(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  accountId: string,
): Promise<SteadfastAccountRecord | undefined> {
  const result = await sql<{
    id: string;
    organization_id: string;
    non_secret_config: SteadfastAccountConfig;
  }>`
    select a.id, a.organization_id, a.non_secret_config
    from integrations.integration_accounts a
    join integrations.integrations i on i.id = a.integration_id and i.organization_id = a.organization_id
    where a.organization_id = ${organizationId} and a.id = ${accountId} and i.provider_code = ${STEADFAST_PROVIDER_CODE}
  `.execute(db);

  const row = result.rows[0];
  if (!row) return undefined;
  return { id: row.id, organizationId: row.organization_id, config: row.non_secret_config };
}

async function loadSteadfastCredentials(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  organizationId: string,
  accountId: string,
): Promise<SteadfastCredentials | undefined> {
  const result = await sql<{
    secret_ciphertext: string;
    secret_key_id: string;
  }>`
    select secret_ciphertext, secret_key_id
    from integrations.provider_credentials
    where organization_id = ${organizationId} and integration_account_id = ${accountId}::uuid
  `.execute(db);

  const row = result.rows[0];
  if (!row || row.secret_key_id !== encryptionKey.id) {
    return undefined;
  }

  const decrypted = decryptSecret(row.secret_ciphertext, encryptionKey);
  return JSON.parse(decrypted) as SteadfastCredentials;
}

export async function steadfastProviderResolver(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  input: { readonly accountId: string; readonly providerCode: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CourierProviderPort | undefined> {
  if (input.providerCode !== STEADFAST_PROVIDER_CODE) return undefined;

  const result = await sql<{
    id: string;
    organization_id: string;
    non_secret_config: SteadfastAccountConfig;
  }>`
    select a.id, a.organization_id, a.non_secret_config
    from integrations.integration_accounts a
    where a.id = ${input.accountId} and a.status = 'ACTIVE'
  `.execute(db);

  const row = result.rows[0];
  if (!row) return undefined;

  const credentials = await loadSteadfastCredentials(db, encryptionKey, row.organization_id, row.id);
  if (!credentials) return undefined;

  return createSteadfastProvider(row.non_secret_config, credentials, fetchImpl);
}
