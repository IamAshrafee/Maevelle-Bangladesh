import { createHash } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export type SmsProviderCapability =
  | 'SEND'
  | 'DELIVERY_CALLBACK'
  | 'DELIVERY_STATUS_POLLING'
  | 'MASKING_SENDER'
  | 'NON_MASKING_SENDER'
  | 'UNICODE'
  | 'BULK_SEND'
  | 'BALANCE_QUERY'
  | 'COST_REPORTING'
  | 'PROVIDER_IDEMPOTENCY';

export type SmsSenderType = 'MASKING' | 'NON_MASKING' | 'PROVIDER_DEFAULT';

export interface SmsSendRequest {
  readonly notificationId: string;
  readonly recipient: string;
  readonly text: string;
  readonly encoding: 'GSM_7' | 'UNICODE';
  readonly estimatedSegments: number;
  readonly senderType: SmsSenderType;
  readonly senderId?: string;
  readonly idempotencyKey: string;
}

export type SmsSendResult =
  | {
      readonly outcome: 'ACCEPTED';
      readonly providerMessageId: string;
      readonly providerReportedSegments?: number;
      readonly providerReportedCost?: string;
      readonly providerCostCurrency?: string;
      readonly safeMetadata?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly outcome: 'FAILED';
      readonly category: 'TRANSIENT' | 'PERMANENT' | 'CONFIGURATION' | 'RATE_LIMITED';
      readonly errorCode: string;
      readonly retryable: boolean;
      readonly safeMetadata?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly outcome: 'UNKNOWN';
      readonly errorCode: string;
      readonly providerMessageId?: string;
      readonly safeMetadata?: Readonly<Record<string, unknown>>;
    };

export type NormalizedSmsDeliveryStatus =
  | 'ACCEPTED'
  | 'DELIVERY_DELAYED'
  | 'DELIVERED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNDELIVERABLE';

export interface NormalizedSmsDeliveryEvent {
  readonly providerEventId: string;
  readonly providerMessageId: string;
  readonly providerStatus: string;
  readonly status: NormalizedSmsDeliveryStatus;
  readonly occurredAt?: string;
  readonly providerReportedSegments?: number;
  readonly providerReportedCost?: string;
  readonly providerCostCurrency?: string;
  readonly safeMetadata?: Readonly<Record<string, unknown>>;
}

export interface SmsProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<SmsProviderCapability>;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
  getMessageStatus?(providerMessageId: string): Promise<NormalizedSmsDeliveryEvent | null>;
  getBalance?(): Promise<{ readonly amount: string; readonly currency: string }>;
  verifyAndParseWebhook?(input: {
    readonly rawBody: string;
    readonly headers: Readonly<Record<string, string | undefined>>;
  }): Promise<readonly NormalizedSmsDeliveryEvent[]>;
}

export class SmsProviderRegistry {
  readonly #providers = new Map<string, SmsProvider>();

  public register(provider: SmsProvider): this {
    if (this.#providers.has(provider.name))
      throw new Error(`SMS provider ${provider.name} is already registered.`);
    this.#providers.set(provider.name, provider);
    return this;
  }

  public get(name: string): SmsProvider | undefined {
    return this.#providers.get(name);
  }

  public list() {
    return [...this.#providers.values()].map((provider) => ({
      name: provider.name,
      capabilities: [...provider.capabilities].sort(),
    }));
  }
}

export type MockSmsMode =
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'DELAYED'
  | 'TRANSIENT_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'RATE_LIMITED'
  | 'UNKNOWN_OUTCOME'
  | 'UNDELIVERABLE';

export function createMockSmsProvider(
  options: { readonly mode?: MockSmsMode; readonly webhookToken?: string } = {},
): SmsProvider {
  const sent = new Map<string, { id: string; status: NormalizedSmsDeliveryStatus }>();
  const mode = options.mode ?? 'ACCEPTED';
  return {
    name: 'mock',
    capabilities: new Set<SmsProviderCapability>([
      'SEND',
      'DELIVERY_CALLBACK',
      'DELIVERY_STATUS_POLLING',
      'MASKING_SENDER',
      'NON_MASKING_SENDER',
      'UNICODE',
      'PROVIDER_IDEMPOTENCY',
    ]),
    async send(request) {
      const existing = sent.get(request.idempotencyKey);
      if (existing) return { outcome: 'ACCEPTED', providerMessageId: existing.id };
      const id = `mock_${createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 24)}`;
      if (mode === 'TRANSIENT_FAILURE')
        return {
          outcome: 'FAILED',
          category: 'TRANSIENT',
          errorCode: 'MOCK_TEMPORARY_FAILURE',
          retryable: true,
        };
      if (mode === 'PERMANENT_FAILURE')
        return {
          outcome: 'FAILED',
          category: 'PERMANENT',
          errorCode: 'MOCK_PERMANENT_FAILURE',
          retryable: false,
        };
      if (mode === 'RATE_LIMITED')
        return {
          outcome: 'FAILED',
          category: 'RATE_LIMITED',
          errorCode: 'MOCK_RATE_LIMITED',
          retryable: true,
        };
      if (mode === 'UNKNOWN_OUTCOME')
        return {
          outcome: 'UNKNOWN',
          errorCode: 'MOCK_TIMEOUT_AFTER_REQUEST',
          providerMessageId: id,
        };
      const status =
        mode === 'DELIVERED'
          ? 'DELIVERED'
          : mode === 'DELAYED'
            ? 'DELIVERY_DELAYED'
            : mode === 'UNDELIVERABLE'
              ? 'UNDELIVERABLE'
              : 'ACCEPTED';
      sent.set(request.idempotencyKey, { id, status });
      return {
        outcome: 'ACCEPTED',
        providerMessageId: id,
        providerReportedSegments: request.estimatedSegments,
      };
    },
    async getMessageStatus(providerMessageId) {
      const entry = [...sent.values()].find((candidate) => candidate.id === providerMessageId);
      return entry
        ? {
            providerEventId: `mock_poll_${providerMessageId}_${entry.status}`,
            providerMessageId,
            providerStatus: entry.status,
            status: entry.status,
          }
        : null;
    },
    async verifyAndParseWebhook(input) {
      if (input.headers['x-mock-sms-token'] !== (options.webhookToken ?? 'mock-webhook-secret'))
        throw new Error('Invalid mock SMS webhook token.');
      const value = JSON.parse(input.rawBody) as Partial<NormalizedSmsDeliveryEvent>;
      if (
        !value.providerEventId ||
        !value.providerMessageId ||
        !value.providerStatus ||
        !value.status
      )
        throw new Error('Invalid mock SMS webhook payload.');
      if (
        ![
          'ACCEPTED',
          'DELIVERY_DELAYED',
          'DELIVERED',
          'FAILED',
          'REJECTED',
          'EXPIRED',
          'UNDELIVERABLE',
        ].includes(value.status)
      )
        throw new Error('Invalid mock SMS delivery status.');
      return [value as NormalizedSmsDeliveryEvent];
    },
  };
}

export type PhoneNormalizationResult =
  | { readonly valid: true; readonly raw: string; readonly normalized: string }
  | {
      readonly valid: false;
      readonly raw: string;
      readonly reason: 'MISSING' | 'MALFORMED' | 'NOT_BANGLADESH_MOBILE';
    };

export function normalizeBangladeshPhone(
  value: string | null | undefined,
): PhoneNormalizationResult {
  const raw = value?.trim() ?? '';
  if (!raw) return { valid: false, raw, reason: 'MISSING' };
  if (!/^[+\d\s().-]+$/.test(raw)) return { valid: false, raw, reason: 'MALFORMED' };
  const compact = raw.replace(/[\s().-]/g, '');
  const candidate = compact.startsWith('880') ? `+${compact}` : compact;
  const parsed = parsePhoneNumberFromString(candidate, 'BD');
  if (!parsed || !parsed.isValid() || parsed.country !== 'BD' || parsed.getType() !== 'MOBILE')
    return { valid: false, raw, reason: 'NOT_BANGLADESH_MOBILE' };
  return { valid: true, raw, normalized: parsed.number };
}

const GSM_BASIC = new Set([
  ...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
]);
const GSM_EXTENDED = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€']);

export interface SmsLengthEstimate {
  readonly encoding: 'GSM_7' | 'UNICODE';
  readonly characterCount: number;
  readonly encodingUnitCount: number;
  readonly segmentCount: number;
  readonly perSegmentLimit: number;
  readonly warnings: readonly string[];
  readonly unicodeTriggerCharacters?: readonly string[];
}

export function estimateSmsLength(text: string): SmsLengthEstimate {
  const characters = [...text];
  let gsmUnits = 0;
  const nonGsmCharacters: string[] = [];
  for (const character of characters) {
    if (GSM_BASIC.has(character)) {
      gsmUnits += 1;
    } else if (GSM_EXTENDED.has(character)) {
      gsmUnits += 2;
    } else {
      nonGsmCharacters.push(character);
    }
  }
  const gsmCompatible = nonGsmCharacters.length === 0;
  const encoding = gsmCompatible ? 'GSM_7' : 'UNICODE';
  const encodingUnitCount = gsmCompatible ? gsmUnits : text.length;
  const singleLimit = gsmCompatible ? 160 : 70;
  const concatenatedLimit = gsmCompatible ? 153 : 67;
  const segmentCount =
    encodingUnitCount === 0
      ? 0
      : encodingUnitCount <= singleLimit
        ? 1
        : Math.ceil(encodingUnitCount / concatenatedLimit);

  const warnings: string[] = [];
  if (segmentCount > 1) {
    warnings.push(`This message is estimated to use ${segmentCount} billable SMS segments.`);
  }

  const uniqueNonGsm = [...new Set(nonGsmCharacters)];
  if (uniqueNonGsm.length > 0) {
    const sample = uniqueNonGsm.slice(0, 3).map((c) => `“${c}”`).join(', ');
    warnings.push(
      `Unicode triggered by character: ${sample}${uniqueNonGsm.length > 3 ? '…' : ''}. Capacity is reduced to 70 characters per segment.`,
    );
  }

  const capacity = segmentCount <= 1 ? singleLimit : concatenatedLimit * segmentCount;
  const remainingInSegment = capacity - encodingUnitCount;
  if (remainingInSegment <= 10 && remainingInSegment > 0 && encodingUnitCount > 0) {
    warnings.push(
      `${remainingInSegment} character${remainingInSegment === 1 ? '' : 's'} remaining before an additional segment may be required.`,
    );
  }

  return {
    encoding,
    characterCount: characters.length,
    encodingUnitCount,
    segmentCount,
    perSegmentLimit: segmentCount <= 1 ? singleLimit : concatenatedLimit,
    warnings,
    ...(uniqueNonGsm.length > 0 ? { unicodeTriggerCharacters: uniqueNonGsm.slice(0, 5) } : {}),
  };
}
