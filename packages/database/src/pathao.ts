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

export const PATHAO_PROVIDER_CODE = 'PATHAO';

export type PathaoEnvironment = 'SANDBOX' | 'PRODUCTION';
export type PathaoDeliveryService = 'NORMAL' | 'ON_DEMAND';
export type PathaoItemType = 'DOCUMENT' | 'PARCEL';

export interface PathaoCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly username: string;
  readonly password: string;
}

export interface PathaoSafeConfiguration {
  readonly accountId: string;
  readonly name: string;
  readonly environment: PathaoEnvironment;
  readonly status: string;
  readonly connectionStatus: 'NOT_CHECKED' | 'CONNECTED' | 'ERROR';
  readonly lastValidatedAt?: string;
  readonly lastErrorCode?: string;
  readonly defaultDeliveryService: PathaoDeliveryService;
  readonly defaultItemType: PathaoItemType;
  readonly hasCredentials: boolean;
  readonly capabilities: CourierCapabilities;
}

export interface PathaoStoreView {
  readonly id: string;
  readonly externalStoreId: string;
  readonly name: string;
  readonly address?: string;
  readonly contactName?: string;
  readonly contactPhone?: string;
  readonly externalCityId?: string;
  readonly externalZoneId?: string;
  readonly externalAreaId?: string;
  readonly isActive: boolean;
  readonly isDefault: boolean;
  readonly isDefaultReturn: boolean;
  readonly lastSyncedAt: string;
}

export interface PathaoLocationMappingView {
  readonly locationId: string;
  readonly locationName: string;
  readonly locationCode: string;
  readonly providerStoreId?: string;
  readonly externalStoreId?: string;
  readonly providerStoreName?: string;
}

interface PathaoAccountConfig {
  readonly environment: PathaoEnvironment;
  readonly defaultDeliveryService: PathaoDeliveryService;
  readonly defaultItemType: PathaoItemType;
  readonly capabilities: CourierCapabilities;
  readonly connectionStatus?: 'NOT_CHECKED' | 'CONNECTED' | 'ERROR';
  readonly lastValidatedAt?: string;
  readonly lastErrorCode?: string;
}

interface PathaoAccountRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly config: PathaoAccountConfig;
}

interface PathaoTokenResponse {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
}

const PATHAO_BASE_URLS: Readonly<Record<PathaoEnvironment, string>> = {
  SANDBOX: 'https://courier-api-sandbox.pathao.com',
  PRODUCTION: 'https://api-hermes.pathao.com',
};

// These numeric values are confined to the adapter. They are the values shown
// in Pathao's Merchant Developer API contract; Maevelle stores semantic names.
const PATHAO_DELIVERY_TYPES: Readonly<Record<PathaoDeliveryService, number>> = {
  NORMAL: 48,
  ON_DEMAND: 12,
};
const PATHAO_ITEM_TYPES: Readonly<Record<PathaoItemType, number>> = {
  DOCUMENT: 1,
  PARCEL: 2,
};

const PATHAO_CAPABILITIES: CourierCapabilities = {
  booking: true,
  cancellation: false,
  tracking: true,
  webhooks: false,
  cod: true,
  codUpdate: false,
  returnTracking: true,
  serviceability: false,
  quoting: true,
};

export class PathaoIntegrationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = 'PathaoIntegrationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function providerStoreId(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new PathaoIntegrationError(
      'INVALID_STORE_MAPPING',
      'The mapped Pathao Store identifier is invalid.',
    );
  return parsed;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return undefined;
}

function responseData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return value.data ?? value;
}

function safeProviderMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const message = stringValue(payload.message);
  return message ? message.slice(0, 240) : fallback;
}

function parseAccountConfig(value: unknown): PathaoAccountConfig {
  if (!isRecord(value))
    throw new PathaoIntegrationError('INVALID_CONFIGURATION', 'Pathao configuration is invalid.');
  const environment = value.environment;
  const defaultDeliveryService = value.defaultDeliveryService;
  const defaultItemType = value.defaultItemType;
  if (environment !== 'SANDBOX' && environment !== 'PRODUCTION')
    throw new PathaoIntegrationError('INVALID_CONFIGURATION', 'Pathao environment is invalid.');
  if (defaultDeliveryService !== 'NORMAL' && defaultDeliveryService !== 'ON_DEMAND')
    throw new PathaoIntegrationError(
      'INVALID_CONFIGURATION',
      'Pathao delivery service is invalid.',
    );
  if (defaultItemType !== 'DOCUMENT' && defaultItemType !== 'PARCEL')
    throw new PathaoIntegrationError('INVALID_CONFIGURATION', 'Pathao item type is invalid.');
  return {
    environment,
    defaultDeliveryService,
    defaultItemType,
    capabilities: PATHAO_CAPABILITIES,
    ...(value.connectionStatus === 'CONNECTED' ||
    value.connectionStatus === 'ERROR' ||
    value.connectionStatus === 'NOT_CHECKED'
      ? { connectionStatus: value.connectionStatus }
      : {}),
    ...(stringValue(value.lastValidatedAt)
      ? { lastValidatedAt: stringValue(value.lastValidatedAt)! }
      : {}),
    ...(stringValue(value.lastErrorCode)
      ? { lastErrorCode: stringValue(value.lastErrorCode)! }
      : {}),
  };
}

function parseCredentials(value: string): PathaoCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PathaoIntegrationError(
      'INVALID_CREDENTIALS',
      'Stored Pathao credentials are invalid.',
    );
  }
  if (!isRecord(parsed))
    throw new PathaoIntegrationError(
      'INVALID_CREDENTIALS',
      'Stored Pathao credentials are invalid.',
    );
  const clientId = stringValue(parsed.clientId);
  const clientSecret = stringValue(parsed.clientSecret);
  const username = stringValue(parsed.username);
  const password = stringValue(parsed.password);
  if (!clientId || !clientSecret || !username || !password)
    throw new PathaoIntegrationError(
      'INVALID_CREDENTIALS',
      'Stored Pathao credentials are incomplete.',
    );
  return { clientId, clientSecret, username, password };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PathaoIntegrationError(
      'INVALID_PROVIDER_RESPONSE',
      'Pathao returned an invalid response.',
      response.status >= 500,
    );
  }
}

function providerError(
  status: number,
  payload: unknown,
  operation: string,
): PathaoIntegrationError {
  const message = safeProviderMessage(payload, `Pathao ${operation} failed.`);
  if (status === 401 || status === 403)
    return new PathaoIntegrationError('AUTHENTICATION_FAILED', message);
  if (status === 429) return new PathaoIntegrationError('RATE_LIMITED', message, true);
  if (status >= 500) return new PathaoIntegrationError('PROVIDER_UNAVAILABLE', message, true);
  if (status === 409)
    return new PathaoIntegrationError('DUPLICATE_OR_UNKNOWN', message, false, true);
  if (status === 404) return new PathaoIntegrationError('NOT_FOUND', message);
  return new PathaoIntegrationError('PROVIDER_REJECTED', message);
}

function normalizePhoneForPathao(phone: string): string {
  const compact = phone.trim().replace(/[\s().-]+/g, '');
  if (/^\+8801\d{9}$/.test(compact)) return `0${compact.slice(4)}`;
  if (/^8801\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^01\d{9}$/.test(compact)) return compact;
  throw new PathaoIntegrationError(
    'INVALID_RECIPIENT_PHONE',
    'Recipient phone is not a valid Bangladesh mobile number.',
  );
}

function totalWeightKg(request: CourierBookingRequest): number {
  if (!request.packages.length)
    throw new PathaoIntegrationError(
      'WEIGHT_REQUIRED',
      'A positive operational parcel weight is required before Pathao booking.',
    );
  let total = 0;
  for (const parcel of request.packages) {
    const weight = numberValue(parcel.weight?.value);
    if (weight === undefined || weight <= 0)
      throw new PathaoIntegrationError(
        'WEIGHT_REQUIRED',
        'A positive operational parcel weight is required before Pathao booking.',
      );
    total += weight;
  }
  return total;
}

function money(value: unknown): string | undefined {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : parsed.toFixed(4);
}

export function normalizePathaoStatus(status: string): NormalizedCourierStatus | undefined {
  const key = status
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
  const statuses: Readonly<Record<string, NormalizedCourierStatus>> = {
    PENDING: 'BOOKED',
    PICKUP_REQUESTED: 'BOOKED',
    ASSIGNED_FOR_PICKUP: 'BOOKED',
    PICKED: 'HANDED_OVER',
    PICKED_UP: 'HANDED_OVER',
    AT_THE_SORTING_HUB: 'IN_TRANSIT',
    IN_TRANSIT: 'IN_TRANSIT',
    RECEIVED_AT_LAST_MILE_HUB: 'IN_TRANSIT',
    ASSIGNED_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    DELIVERY_FAILED: 'ATTEMPT_FAILED',
    RETURN: 'RTO_INITIATED',
    RETURN_INITIATED: 'RTO_INITIATED',
    RETURN_IN_TRANSIT: 'RETURNING',
    RETURNING: 'RETURNING',
    RETURNED_TO_MERCHANT: 'RETURNED_TO_ORIGIN',
    RETURNED_TO_ORIGIN: 'RETURNED_TO_ORIGIN',
    LOST: 'LOST',
    DAMAGED: 'DAMAGED',
    PICKUP_CANCELLED: 'CANCELLED',
    CANCELLED: 'CANCELLED',
  };
  return statuses[key];
}

async function loadAccount(
  db: Kysely<DatabaseSchema>,
  accountId: string,
  organizationId?: string,
): Promise<PathaoAccountRecord> {
  const result = await sql<{
    id: string;
    organization_id: string;
    non_secret_config: unknown;
  }>`select account.id,account.organization_id,account.non_secret_config
      from integrations.integration_accounts account
      join integrations.integrations integration on integration.id=account.integration_id
        and integration.organization_id=account.organization_id
      where account.id=${accountId}::uuid
        and (${organizationId ?? null}::uuid is null or account.organization_id=${organizationId ?? null}::uuid)
        and account.status='ACTIVE' and integration.status='ACTIVE'
        and integration.provider_code=${PATHAO_PROVIDER_CODE} and integration.integration_type='COURIER'`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row)
    throw new PathaoIntegrationError('ACCOUNT_NOT_FOUND', 'Active Pathao account was not found.');
  return {
    id: row.id,
    organizationId: row.organization_id,
    config: parseAccountConfig(row.non_secret_config),
  };
}

async function loadCredentials(
  db: Kysely<DatabaseSchema>,
  account: PathaoAccountRecord,
  encryptionKey: EncryptionKey,
): Promise<PathaoCredentials> {
  const result = await sql<{ secret_ciphertext: string; secret_key_id: string }>`
    select secret_ciphertext,secret_key_id from integrations.provider_credentials
    where organization_id=${account.organizationId} and integration_account_id=${account.id}::uuid
  `.execute(db);
  const row = result.rows[0];
  if (!row || row.secret_key_id !== encryptionKey.id)
    throw new PathaoIntegrationError(
      'CREDENTIALS_MISSING',
      'Pathao credentials are not configured.',
    );
  return parseCredentials(decryptSecret(row.secret_ciphertext, encryptionKey));
}

async function issueToken(
  account: PathaoAccountRecord,
  credentials: PathaoCredentials,
  refreshToken: string | undefined,
  fetcher: typeof fetch,
): Promise<PathaoTokenResponse> {
  const body = refreshToken
    ? {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }
    : {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'password',
        username: credentials.username,
        password: credentials.password,
      };
  let response: Response;
  try {
    response = await fetcher(
      `${PATHAO_BASE_URLS[account.config.environment]}/aladdin/api/v1/issue-token`,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new PathaoIntegrationError(
      'AUTHENTICATION_UNAVAILABLE',
      'Pathao authentication is temporarily unavailable.',
      true,
    );
  }
  const responsePayload = await readJson(response);
  if (!response.ok) throw providerError(response.status, responsePayload, 'authentication');
  const payload = responseData(responsePayload);
  if (!isRecord(payload))
    throw new PathaoIntegrationError(
      'INVALID_PROVIDER_RESPONSE',
      'Pathao token response is invalid.',
    );
  const accessToken = stringValue(payload.access_token);
  const nextRefreshToken = stringValue(payload.refresh_token);
  const expiresInSeconds = numberValue(payload.expires_in);
  const tokenType = stringValue(payload.token_type) ?? 'Bearer';
  if (!accessToken || !expiresInSeconds || expiresInSeconds <= 0)
    throw new PathaoIntegrationError(
      'INVALID_PROVIDER_RESPONSE',
      'Pathao token response is incomplete.',
    );
  return {
    accessToken,
    ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
    tokenType,
    expiresInSeconds,
  };
}

async function accessToken(
  db: Kysely<DatabaseSchema>,
  account: PathaoAccountRecord,
  encryptionKey: EncryptionKey,
  fetcher: typeof fetch,
  forceRefresh = false,
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    // One account-specific transaction advisory lock is the smallest reliable
    // cross-process guard against concurrent refresh storms.
    await sql`select pg_advisory_xact_lock(hashtextextended(${`pathao-token:${account.id}`},0))`.execute(
      tx,
    );
    const current = await sql<{
      access_token_ciphertext: string;
      refresh_token_ciphertext: string | null;
      secret_key_id: string;
      expires_at: Date;
    }>`select access_token_ciphertext,refresh_token_ciphertext,secret_key_id,expires_at
        from integrations.oauth_token_states
        where organization_id=${account.organizationId} and integration_account_id=${account.id}::uuid
        for update`.execute(tx);
    const token = current.rows[0];
    if (
      !forceRefresh &&
      token &&
      token.secret_key_id === encryptionKey.id &&
      token.expires_at.getTime() > Date.now() + 60_000
    )
      return decryptSecret(token.access_token_ciphertext, encryptionKey);

    const credentials = await loadCredentials(tx, account, encryptionKey);
    const storedRefresh =
      token?.refresh_token_ciphertext && token.secret_key_id === encryptionKey.id
        ? decryptSecret(token.refresh_token_ciphertext, encryptionKey)
        : undefined;
    let issued: PathaoTokenResponse;
    try {
      issued = await issueToken(account, credentials, storedRefresh, fetcher);
    } catch (error) {
      if (!storedRefresh || !(error instanceof PathaoIntegrationError) || error.retryable)
        throw error;
      // A revoked/expired refresh token may recover through the configured
      // password grant. This is not used on every request.
      issued = await issueToken(account, credentials, undefined, fetcher);
    }
    const effectiveRefresh = issued.refreshToken ?? storedRefresh;
    const expiresAt = new Date(Date.now() + issued.expiresInSeconds * 1000);
    await sql`insert into integrations.oauth_token_states
      (integration_account_id,organization_id,access_token_ciphertext,refresh_token_ciphertext,secret_key_id,token_type,expires_at)
      values (${account.id},${account.organizationId},${encryptSecret(issued.accessToken, encryptionKey)},${effectiveRefresh ? encryptSecret(effectiveRefresh, encryptionKey) : null},${encryptionKey.id},${issued.tokenType},${expiresAt})
      on conflict(integration_account_id) do update set
        access_token_ciphertext=excluded.access_token_ciphertext,
        refresh_token_ciphertext=excluded.refresh_token_ciphertext,
        secret_key_id=excluded.secret_key_id,token_type=excluded.token_type,
        expires_at=excluded.expires_at,updated_at=now(),version=integrations.oauth_token_states.version+1`.execute(
      tx,
    );
    return issued.accessToken;
  });
}

class PathaoCourierProvider implements CourierProviderPort {
  public readonly providerCode = PATHAO_PROVIDER_CODE;

  public constructor(
    private readonly account: PathaoAccountRecord,
    private readonly token: (forceRefresh?: boolean) => Promise<string>,
    private readonly fetcher: typeof fetch,
  ) {}

  public getCapabilities(): CourierCapabilities {
    return PATHAO_CAPABILITIES;
  }

  private async request(
    path: string,
    init: RequestInit,
    retryAuthentication = true,
  ): Promise<unknown> {
    const bearer = await this.token(false);
    let response: Response;
    try {
      response = await this.fetcher(`${PATHAO_BASE_URLS[this.account.config.environment]}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${bearer}`,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new PathaoIntegrationError(
        'NETWORK_ERROR',
        'Pathao could not be reached.',
        true,
        init.method === 'POST',
      );
    }
    const payload = await readJson(response);
    if (response.status === 401 && retryAuthentication) {
      await this.token(true);
      return this.request(path, init, false);
    }
    if (!response.ok) throw providerError(response.status, payload, path);
    return payload;
  }

  public async listStores(): Promise<readonly Record<string, unknown>[]> {
    const payload = responseData(await this.request('/aladdin/api/v1/stores', { method: 'GET' }));
    const candidate = isRecord(payload) && Array.isArray(payload.data) ? payload.data : payload;
    if (!Array.isArray(candidate) || !candidate.every(isRecord))
      throw new PathaoIntegrationError(
        'INVALID_PROVIDER_RESPONSE',
        'Pathao store response is invalid.',
      );
    return candidate;
  }

  public async quote(request: CourierBookingRequest) {
    const storeId = request.pickup.providerLocationId;
    if (!storeId)
      throw new PathaoIntegrationError(
        'STORE_MAPPING_REQUIRED',
        'A Pathao pickup Store mapping is required.',
      );
    if (request.cod.currency !== 'BDT')
      throw new PathaoIntegrationError(
        'UNSUPPORTED_CURRENCY',
        'Pathao courier booking requires BDT.',
      );
    const payload = responseData(
      await this.request('/aladdin/api/v1/merchant/price-plan', {
        method: 'POST',
        body: JSON.stringify({
          store_id: providerStoreId(storeId),
          item_type: PATHAO_ITEM_TYPES[this.account.config.defaultItemType],
          delivery_type: PATHAO_DELIVERY_TYPES[this.account.config.defaultDeliveryService],
          item_weight: totalWeightKg(request),
          recipient_address: request.recipient.address,
          amount_to_collect: Number(request.cod.expectedAmount),
        }),
      }),
    );
    if (!isRecord(payload))
      throw new PathaoIntegrationError(
        'INVALID_PROVIDER_RESPONSE',
        'Pathao quote response is invalid.',
      );
    const amount = money(payload.final_price ?? payload.price);
    if (!amount)
      throw new PathaoIntegrationError(
        'INVALID_PROVIDER_RESPONSE',
        'Pathao quote did not include a final price.',
      );
    return {
      amount,
      currency: 'BDT',
      ...(money(payload.price) ? { baseAmount: money(payload.price)! } : {}),
      ...(money(payload.discount ?? payload.promo_discount)
        ? { discountAmount: money(payload.discount ?? payload.promo_discount)! }
        : {}),
      ...(money(payload.cod_fee) ? { codFeeAmount: money(payload.cod_fee)! } : {}),
      ...(money(payload.additional_charge)
        ? { additionalChargeAmount: money(payload.additional_charge)! }
        : {}),
    };
  }

  public async createBooking(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const storeId = request.pickup.providerLocationId;
    if (!storeId) return { kind: 'REJECTED', reasonCode: 'STORE_MAPPING_REQUIRED' };
    if (request.cod.currency !== 'BDT')
      return { kind: 'REJECTED', reasonCode: 'UNSUPPORTED_CURRENCY' };
    let weight: number;
    let phone: string;
    let numericStoreId: number;
    try {
      weight = totalWeightKg(request);
      phone = normalizePhoneForPathao(request.recipient.phone);
      numericStoreId = providerStoreId(storeId);
    } catch (error) {
      return {
        kind: 'REJECTED',
        reasonCode: error instanceof PathaoIntegrationError ? error.code : 'VALIDATION_FAILED',
      };
    }
    try {
      const payload = responseData(
        await this.request('/aladdin/api/v1/orders', {
          method: 'POST',
          body: JSON.stringify({
            store_id: numericStoreId,
            merchant_order_id: request.merchantReference,
            recipient_name: request.recipient.name.slice(0, 100),
            recipient_phone: phone,
            recipient_address: request.recipient.address.slice(0, 220),
            delivery_type: PATHAO_DELIVERY_TYPES[this.account.config.defaultDeliveryService],
            item_type: PATHAO_ITEM_TYPES[this.account.config.defaultItemType],
            special_instruction: `Maevelle delivery ${request.merchantReference}`.slice(0, 120),
            item_quantity: request.contents.quantity,
            item_weight: weight,
            item_description: request.contents.description.slice(0, 120),
            amount_to_collect: Number(request.cod.expectedAmount),
          }),
        }),
      );
      if (!isRecord(payload))
        return { kind: 'UNKNOWN_OUTCOME', providerStatus: 'INVALID_RESPONSE' };
      const providerBookingId = stringValue(payload.consignment_id);
      if (!providerBookingId)
        return {
          kind: 'UNKNOWN_OUTCOME',
          ...(stringValue(payload.order_status)
            ? { providerStatus: stringValue(payload.order_status)! }
            : {}),
        };
      return {
        kind: 'BOOKED',
        providerBookingId,
        trackingReference: providerBookingId,
        ...(stringValue(payload.order_status)
          ? { providerStatus: stringValue(payload.order_status)! }
          : {}),
        ...(money(payload.delivery_fee)
          ? {
              charge: {
                amount: money(payload.delivery_fee)!,
                currency: 'BDT',
                basis: 'ACTUAL' as const,
                providerReference: `${providerBookingId}:delivery-fee`,
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof PathaoIntegrationError) {
        if (error.outcomeUnknown || error.retryable)
          return { kind: 'UNKNOWN_OUTCOME', providerStatus: error.code };
        return { kind: 'REJECTED', reasonCode: error.code };
      }
      return { kind: 'UNKNOWN_OUTCOME' };
    }
  }

  public async getBooking(providerBookingId: string): Promise<CourierTrackingResult> {
    const payload = responseData(
      await this.request(`/aladdin/api/v1/orders/${encodeURIComponent(providerBookingId)}/info`, {
        method: 'GET',
      }),
    );
    if (!isRecord(payload))
      throw new PathaoIntegrationError(
        'INVALID_PROVIDER_RESPONSE',
        'Pathao order response is invalid.',
      );
    const providerStatus = stringValue(payload.order_status ?? payload.status);
    const normalizedStatus = providerStatus ? normalizePathaoStatus(providerStatus) : undefined;
    const occurredAtRaw = stringValue(payload.updated_at ?? payload.updatedAt);
    const occurredAt =
      occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw))
        ? occurredAtRaw
        : new Date().toISOString();
    return {
      providerBookingId,
      ...(providerStatus ? { providerStatus } : {}),
      events:
        providerStatus && normalizedStatus
          ? [
              {
                providerEventId: `${providerBookingId}:${providerStatus.trim().toUpperCase()}`,
                providerStatus,
                normalizedStatus,
                occurredAt,
              },
            ]
          : [],
    };
  }
}

export async function createPathaoProvider(
  db: Kysely<DatabaseSchema>,
  input: {
    accountId: string;
    encryptionKey: EncryptionKey;
    organizationId?: string;
    fetcher?: typeof fetch;
  },
): Promise<CourierProviderPort & { listStores(): Promise<readonly Record<string, unknown>[]> }> {
  const account = await loadAccount(db, input.accountId, input.organizationId);
  const fetcher = input.fetcher ?? fetch;
  return new PathaoCourierProvider(
    account,
    (forceRefresh) => accessToken(db, account, input.encryptionKey, fetcher, forceRefresh),
    fetcher,
  );
}

export async function configurePathaoAccount(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId?: string;
    name: string;
    environment: PathaoEnvironment;
    defaultDeliveryService: PathaoDeliveryService;
    defaultItemType: PathaoItemType;
    credentials: PathaoCredentials;
    encryptionKey: EncryptionKey;
  },
): Promise<{ accountId: string }> {
  for (const [name, value] of Object.entries(input.credentials))
    if (!value.trim())
      throw new PathaoIntegrationError('VALIDATION_FAILED', `${name} is required.`);
  if (!input.name.trim())
    throw new PathaoIntegrationError('VALIDATION_FAILED', 'Account name is required.');
  return db.transaction().execute(async (tx) => {
    const integration = await sql<{ id: string }>`insert into integrations.integrations
      (organization_id,provider_code,integration_type,name,status)
      values (${input.organizationId},${PATHAO_PROVIDER_CODE},'COURIER','Pathao Courier','ACTIVE')
      on conflict(organization_id,provider_code,integration_type) do update set
        name=excluded.name,status='ACTIVE',updated_at=now(),version=integrations.integrations.version+1
      returning id`.execute(tx);
    const config: PathaoAccountConfig = {
      environment: input.environment,
      defaultDeliveryService: input.defaultDeliveryService,
      defaultItemType: input.defaultItemType,
      capabilities: PATHAO_CAPABILITIES,
      connectionStatus: 'NOT_CHECKED',
    };
    let accountId = input.accountId;
    if (accountId) {
      const previous = await sql<{ non_secret_config: unknown }>`select non_secret_config
        from integrations.integration_accounts where id=${accountId}::uuid
          and organization_id=${input.organizationId} for update`.execute(tx);
      if (!previous.rows[0])
        throw new PathaoIntegrationError('ACCOUNT_NOT_FOUND', 'Pathao account was not found.');
      const previousConfig = parseAccountConfig(previous.rows[0].non_secret_config);
      if (previousConfig.environment !== input.environment) {
        // Provider identifiers are environment-owned. Never carry a sandbox
        // Store mapping into Production (or the inverse).
        await sql`delete from integrations.courier_pickup_store_mappings
          where organization_id=${input.organizationId} and integration_account_id=${accountId}::uuid`.execute(
          tx,
        );
        await sql`delete from integrations.courier_provider_stores
          where organization_id=${input.organizationId} and integration_account_id=${accountId}::uuid`.execute(
          tx,
        );
      }
      const updated = await sql<{ id: string }>`update integrations.integration_accounts set
        name=${input.name.trim()},status='ACTIVE',non_secret_config=${JSON.stringify(config)}::jsonb,
        secret_reference='DATABASE_ENCRYPTED',updated_at=now(),version=version+1
        where id=${accountId}::uuid and organization_id=${input.organizationId}
          and integration_id=${integration.rows[0]!.id}::uuid returning id`.execute(tx);
      if (!updated.rows[0])
        throw new PathaoIntegrationError('ACCOUNT_NOT_FOUND', 'Pathao account was not found.');
    } else {
      const created = await sql<{ id: string }>`insert into integrations.integration_accounts
        (organization_id,integration_id,name,status,non_secret_config,secret_reference)
        values (${input.organizationId},${integration.rows[0]!.id},${input.name.trim()},'ACTIVE',${JSON.stringify(config)}::jsonb,'DATABASE_ENCRYPTED') returning id`.execute(
        tx,
      );
      accountId = created.rows[0]!.id;
    }
    await sql`insert into integrations.provider_credentials
      (integration_account_id,organization_id,secret_ciphertext,secret_key_id)
      values (${accountId!},${input.organizationId},${encryptSecret(JSON.stringify(input.credentials), input.encryptionKey)},${input.encryptionKey.id})
      on conflict(integration_account_id) do update set secret_ciphertext=excluded.secret_ciphertext,
        secret_key_id=excluded.secret_key_id,credential_version=integrations.provider_credentials.credential_version+1,updated_at=now()`.execute(
      tx,
    );
    await sql`delete from integrations.oauth_token_states where organization_id=${input.organizationId} and integration_account_id=${accountId!}::uuid`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: 'integrations.pathao.configured',
      targetType: 'integrations.integration_account',
      targetId: accountId!,
      metadata: { environment: input.environment },
    });
    return { accountId: accountId! };
  });
}

export async function setPathaoAccountStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    status: 'ACTIVE' | 'DISABLED';
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    if (input.status === 'DISABLED') {
      const open = await sql<{ exists: boolean }>`select exists(
        select 1 from integrations.integration_operations operation
        where operation.organization_id=${input.organizationId}
          and operation.integration_account_id=${input.accountId}::uuid
          and operation.status in ('PENDING','SENT')
      ) as exists`.execute(tx);
      if (open.rows[0]?.exists)
        throw new PathaoIntegrationError(
          'CONFLICT',
          'Pathao cannot be disabled while a provider operation is in progress.',
        );
    }
    const updated = await sql<{ id: string }>`update integrations.integration_accounts account
      set status=${input.status},updated_at=now(),version=account.version+1
      from integrations.integrations integration
      where account.organization_id=${input.organizationId} and account.id=${input.accountId}::uuid
        and integration.id=account.integration_id and integration.organization_id=account.organization_id
        and integration.provider_code=${PATHAO_PROVIDER_CODE} and integration.integration_type='COURIER'
      returning account.id`.execute(tx);
    if (!updated.rows[0])
      throw new PathaoIntegrationError('ACCOUNT_NOT_FOUND', 'Pathao account was not found.');
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: 'USER',
      action: 'integrations.pathao.status_changed',
      targetType: 'integrations.integration_account',
      targetId: input.accountId,
      metadata: { status: input.status },
    });
  });
}

export async function getPathaoConfigurations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly PathaoSafeConfiguration[]> {
  const result = await sql<{
    id: string;
    name: string;
    status: string;
    non_secret_config: unknown;
    has_credentials: boolean;
  }>`select account.id,account.name,account.status,account.non_secret_config,
      exists(select 1 from integrations.provider_credentials credential where credential.integration_account_id=account.id) as has_credentials
    from integrations.integration_accounts account
    join integrations.integrations integration on integration.id=account.integration_id and integration.organization_id=account.organization_id
    where account.organization_id=${organizationId} and integration.provider_code=${PATHAO_PROVIDER_CODE}
      and integration.integration_type='COURIER'
    order by account.created_at`.execute(db);
  return result.rows.map((row) => {
    const config = parseAccountConfig(row.non_secret_config);
    return {
      accountId: row.id,
      name: row.name,
      environment: config.environment,
      status: row.status,
      connectionStatus: config.connectionStatus ?? 'NOT_CHECKED',
      ...(config.lastValidatedAt ? { lastValidatedAt: config.lastValidatedAt } : {}),
      ...(config.lastErrorCode ? { lastErrorCode: config.lastErrorCode } : {}),
      defaultDeliveryService: config.defaultDeliveryService,
      defaultItemType: config.defaultItemType,
      hasCredentials: row.has_credentials,
      capabilities: PATHAO_CAPABILITIES,
    };
  });
}

async function setConnectionState(
  db: Kysely<DatabaseSchema>,
  account: PathaoAccountRecord,
  state: 'CONNECTED' | 'ERROR',
  errorCode?: string,
): Promise<void> {
  await sql`update integrations.integration_accounts set non_secret_config=jsonb_set(
      jsonb_set(non_secret_config,'{connectionStatus}',to_jsonb(${state}::text),true),
      '{lastValidatedAt}',to_jsonb(now()::text),true
    ) || ${JSON.stringify(errorCode ? { lastErrorCode: errorCode } : { lastErrorCode: null })}::jsonb,
    updated_at=now(),version=version+1
    where organization_id=${account.organizationId} and id=${account.id}::uuid`.execute(db);
}

export async function checkPathaoConnection(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accountId: string;
    encryptionKey: EncryptionKey;
    fetcher?: typeof fetch;
  },
): Promise<{ connected: true; storeCount: number }> {
  const account = await loadAccount(db, input.accountId, input.organizationId);
  try {
    const provider = await createPathaoProvider(db, input);
    const stores = await provider.listStores();
    await setConnectionState(db, account, 'CONNECTED');
    return { connected: true, storeCount: stores.length };
  } catch (error) {
    await setConnectionState(
      db,
      account,
      'ERROR',
      error instanceof PathaoIntegrationError ? error.code : 'CONNECTION_FAILED',
    );
    throw error;
  }
}

export async function syncPathaoStores(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    accountId: string;
    encryptionKey: EncryptionKey;
    fetcher?: typeof fetch;
  },
): Promise<readonly PathaoStoreView[]> {
  const account = await loadAccount(db, input.accountId, input.organizationId);
  const provider = await createPathaoProvider(db, input);
  const stores = await provider.listStores();
  await db.transaction().execute(async (tx) => {
    const seen: string[] = [];
    let defaultAssigned = false;
    // Clear the prior default first so a provider-side default change cannot
    // violate the account's partial unique index during this sync.
    await sql`update integrations.courier_provider_stores set is_default=false,updated_at=now()
      where organization_id=${input.organizationId} and integration_account_id=${input.accountId}::uuid
        and is_default`.execute(tx);
    for (const store of stores) {
      const externalStoreId = stringValue(store.store_id ?? store.id);
      const name = stringValue(store.store_name ?? store.name);
      if (!externalStoreId || !name) continue;
      seen.push(externalStoreId);
      const reportedDefault = booleanValue(store.is_default_store ?? store.is_default) ?? false;
      const isDefault: boolean = reportedDefault && !defaultAssigned;
      defaultAssigned ||= isDefault;
      await sql`insert into integrations.courier_provider_stores
        (organization_id,integration_account_id,provider_code,external_store_id,name,contact_name,contact_phone,address,
          external_city_id,external_zone_id,external_area_id,is_active,is_default,is_default_return,provider_metadata,last_synced_at)
        values (${input.organizationId},${input.accountId},${PATHAO_PROVIDER_CODE},${externalStoreId},${name},
          ${stringValue(store.contact_name ?? store.store_contact_name) ?? null},${stringValue(store.contact_number ?? store.store_phone) ?? null},
          ${stringValue(store.store_address ?? store.address) ?? null},${stringValue(store.city_id) ?? null},
          ${stringValue(store.zone_id) ?? null},${stringValue(store.area_id) ?? null},
          ${booleanValue(store.is_active) ?? true},${isDefault},${booleanValue(store.is_default_return_store) ?? false},
          ${JSON.stringify({ hubId: stringValue(store.hub_id) ?? null })}::jsonb,now())
        on conflict(integration_account_id,external_store_id) do update set
          name=excluded.name,contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,address=excluded.address,
          external_city_id=excluded.external_city_id,external_zone_id=excluded.external_zone_id,external_area_id=excluded.external_area_id,
          is_active=excluded.is_active,is_default=excluded.is_default,is_default_return=excluded.is_default_return,
          provider_metadata=excluded.provider_metadata,last_synced_at=now(),updated_at=now()`.execute(
        tx,
      );
    }
    if (seen.length)
      await sql`update integrations.courier_provider_stores set is_active=false,is_default=false,updated_at=now()
        where organization_id=${input.organizationId} and integration_account_id=${input.accountId}::uuid
          and not(external_store_id=any(${seen}::text[]))`.execute(tx);
    else
      await sql`update integrations.courier_provider_stores set is_active=false,is_default=false,updated_at=now()
        where organization_id=${input.organizationId} and integration_account_id=${input.accountId}::uuid`.execute(
        tx,
      );
  });
  await setConnectionState(db, account, 'CONNECTED');
  return listPathaoStores(db, input.organizationId, input.accountId);
}

export async function listPathaoStores(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  accountId: string,
): Promise<readonly PathaoStoreView[]> {
  const result = await sql<{
    id: string;
    external_store_id: string;
    name: string;
    address: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    external_city_id: string | null;
    external_zone_id: string | null;
    external_area_id: string | null;
    is_active: boolean;
    is_default: boolean;
    is_default_return: boolean;
    last_synced_at: Date;
  }>`select id,external_store_id,name,address,contact_name,contact_phone,external_city_id,external_zone_id,
      external_area_id,is_active,is_default,is_default_return,last_synced_at
    from integrations.courier_provider_stores
    where organization_id=${organizationId} and integration_account_id=${accountId}::uuid
    order by is_default desc,is_active desc,name`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    externalStoreId: row.external_store_id,
    name: row.name,
    ...(row.address ? { address: row.address } : {}),
    ...(row.contact_name ? { contactName: row.contact_name } : {}),
    ...(row.contact_phone ? { contactPhone: row.contact_phone } : {}),
    ...(row.external_city_id ? { externalCityId: row.external_city_id } : {}),
    ...(row.external_zone_id ? { externalZoneId: row.external_zone_id } : {}),
    ...(row.external_area_id ? { externalAreaId: row.external_area_id } : {}),
    isActive: row.is_active,
    isDefault: row.is_default,
    isDefaultReturn: row.is_default_return,
    lastSyncedAt: row.last_synced_at.toISOString(),
  }));
}

export async function listPathaoLocationMappings(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  accountId: string,
): Promise<readonly PathaoLocationMappingView[]> {
  const result = await sql<{
    location_id: string;
    location_name: string;
    location_code: string;
    provider_store_id: string | null;
    external_store_id: string | null;
    provider_store_name: string | null;
  }>`select location.id as location_id,location.name as location_name,location.code as location_code,
      mapping.provider_store_id,store.external_store_id,store.name as provider_store_name
    from warehouse.locations location
    left join integrations.courier_pickup_store_mappings mapping
      on mapping.organization_id=location.organization_id and mapping.location_id=location.id
      and mapping.integration_account_id=${accountId}::uuid
    left join integrations.courier_provider_stores store on store.id=mapping.provider_store_id
      and store.organization_id=mapping.organization_id
    where location.organization_id=${organizationId} and location.status='ACTIVE'
      and exists(select 1 from warehouse.location_capabilities capability where capability.organization_id=location.organization_id
        and capability.location_id=location.id and capability.capability_code='ORDER_FULFILLMENT')
    order by location.name`.execute(db);
  return result.rows.map((row) => ({
    locationId: row.location_id,
    locationName: row.location_name,
    locationCode: row.location_code,
    ...(row.provider_store_id ? { providerStoreId: row.provider_store_id } : {}),
    ...(row.external_store_id ? { externalStoreId: row.external_store_id } : {}),
    ...(row.provider_store_name ? { providerStoreName: row.provider_store_name } : {}),
  }));
}

export async function mapPathaoStore(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    accountId: string;
    locationId: string;
    providerStoreId: string;
  },
): Promise<void> {
  const inserted = await sql<{ id: string }>`insert into integrations.courier_pickup_store_mappings
    (organization_id,integration_account_id,location_id,provider_store_id)
    select ${input.organizationId},account.id,location.id,store.id
    from integrations.integration_accounts account
    join integrations.integrations integration on integration.id=account.integration_id
      and integration.organization_id=account.organization_id
      and integration.provider_code=${PATHAO_PROVIDER_CODE} and integration.integration_type='COURIER'
    join warehouse.locations location on location.organization_id=account.organization_id and location.id=${input.locationId}::uuid
    join integrations.courier_provider_stores store on store.organization_id=account.organization_id
      and store.integration_account_id=account.id and store.id=${input.providerStoreId}::uuid and store.is_active
    where account.organization_id=${input.organizationId} and account.id=${input.accountId}::uuid
    on conflict(integration_account_id,location_id) do update set provider_store_id=excluded.provider_store_id,updated_at=now()
    returning id`.execute(db);
  if (!inserted.rows[0])
    throw new PathaoIntegrationError(
      'VALIDATION_FAILED',
      'The location or active Pathao Store was not found.',
    );
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorType: 'USER',
    action: 'integrations.pathao.store_mapped',
    targetType: 'integrations.integration_account',
    targetId: input.accountId,
    metadata: { locationId: input.locationId, providerStoreId: input.providerStoreId },
  });
}

export async function pathaoProviderResolver(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  input: { accountId: string; providerCode: string },
): Promise<CourierProviderPort | undefined> {
  if (input.providerCode !== PATHAO_PROVIDER_CODE) return undefined;
  return createPathaoProvider(db, { accountId: input.accountId, encryptionKey });
}
