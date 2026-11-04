import type {
  CheckoutAreaPageDto,
  CheckoutDeliveryInput,
  CheckoutDeliveryStateDto,
  ShopperAddressDto,
  ShopperAddressInput,
} from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { ownerHeaders } from './foundation-api';
import type { ReviewOwner } from './foundation-types';
import type { PrivateDeliveryIntent } from './delivery-types';

const base = '/api/storefront/v1';
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown) => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value);
const text = (value: unknown, max: number) => typeof value === 'string' && [...value].length <= max;
const optionalText = (value: unknown, max: number) => value == null || text(value, max);
function invalid(): never {
  throw new StorefrontClientApiError(
    502,
    'INVALID_RESPONSE',
    'Delivery information could not be checked.',
  );
}
export function deliveryInput(value: CheckoutDeliveryInput): CheckoutDeliveryInput {
  return {
    recipientName: value.recipientName,
    mobile: value.mobile,
    geographyNodeId: value.geographyNodeId,
    addressLine1: value.addressLine1,
    addressLine2: value.addressLine2 ?? null,
    instructions: value.instructions ?? null,
  };
}
export function addressInput(value: ShopperAddressInput): ShopperAddressInput {
  return {
    ...deliveryInput(value),
    label: value.label ?? null,
    ...(value.isDefault === undefined ? {} : { isDefault: value.isDefault }),
  };
}
function contact(value: CheckoutDeliveryInput) {
  return (
    value &&
    text(value.recipientName, 120) &&
    text(value.mobile, 40) &&
    uuid(value.geographyNodeId) &&
    text(value.addressLine1, 500) &&
    optionalText(value.addressLine2, 300) &&
    optionalText(value.instructions, 500)
  );
}
function state(value: CheckoutDeliveryStateDto, id: string) {
  if (
    !value ||
    value.draftId !== id ||
    !revision(value.revision) ||
    !['ACTIVE', 'ABANDONED', 'EXPIRED'].includes(value.draftStatus) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    value.purchaseAvailable !== false ||
    value.quoteAvailable !== false ||
    typeof value.reviewRequired !== 'boolean' ||
    typeof value.configurationChanged !== 'boolean'
  )
    invalid();
  if (!('delivery' in value) || !('savedAddress' in value) || !('eligibility' in value)) invalid();
  if (value.delivery && (!contact(value.delivery) || value.delivery.countryCode !== 'BD'))
    invalid();
  if (
    value.savedAddress &&
    (!uuid(value.savedAddress.id) ||
      !revision(value.savedAddress.selectedRevision) ||
      !['CURRENT', 'CHANGED', 'REMOVED'].includes(value.savedAddress.status))
  )
    invalid();
  const eligible = value.eligibility;
  if (
    eligible &&
    (!['ELIGIBLE', 'UNSUPPORTED_AREA', 'DELIVERY_UNAVAILABLE'].includes(eligible.status) ||
      typeof eligible.configurationRevision !== 'string' ||
      eligible.courierCompatibility !== 'NOT_EVALUATED')
  )
    invalid();
  if (
    eligible?.tariff &&
    (eligible.tariff.final !== false ||
      !uuid(eligible.tariff.ruleId) ||
      !revision(eligible.tariff.revision) ||
      !/^[0-9]+(?:\.[0-9]{1,4})?$/.test(eligible.tariff.amount) ||
      !/^[A-Z]{3}$/.test(eligible.tariff.currency))
  )
    invalid();
  return value;
}
export interface AddressPage {
  readonly items: readonly ShopperAddressDto[];
  readonly nextOffset: number | null;
}
function pageOffset(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) > 0 && Number(value) <= 10000);
}
export const deliveryApi = {
  async read(id: string, owner: ReviewOwner, signal: AbortSignal) {
    return state(
      await requestWithDeadline<CheckoutDeliveryStateDto>(
        `${base}/checkouts/${encodeURIComponent(id)}/delivery`,
        { signal, cache: 'no-store', headers: ownerHeaders(owner) },
      ),
      id,
    );
  },
  async addresses(owner: ReviewOwner, offset: number, signal: AbortSignal) {
    if (owner.kind !== 'ACCOUNT')
      throw new StorefrontClientApiError(
        401,
        'SHOPPER_SESSION_REQUIRED',
        'Sign in to use saved addresses.',
      );
    const value = await requestWithDeadline<AddressPage>(
      `${base}/checkout/addresses?offset=${offset}`,
      { signal, cache: 'no-store', headers: ownerHeaders(owner) },
    );
    if (
      !value ||
      !Array.isArray(value.items) ||
      value.items.length > 20 ||
      !pageOffset(value.nextOffset) ||
      value.items.some(
        (a) =>
          !a ||
          !uuid(a.id) ||
          !revision(a.revision) ||
          !text(a.recipientName, 120) ||
          !optionalText(a.mobile, 40) ||
          !text(a.addressLine1, 500) ||
          !optionalText(a.addressLine2, 300) ||
          !optionalText(a.instructions, 500) ||
          !optionalText(a.label, 60) ||
          typeof a.countryCode !== 'string' ||
          (a.geographyNodeId !== null && !uuid(a.geographyNodeId)) ||
          typeof a.isDefault !== 'boolean',
      )
    )
      invalid();
    return value;
  },
  async mutate(intent: PrivateDeliveryIntent, signal: AbortSignal) {
    const value = await requestWithDeadline<CheckoutDeliveryStateDto | { id: string }>(
      intent.path,
      {
        method: intent.method,
        body: intent.body,
        signal,
        cache: 'no-store',
        headers: {
          ...ownerHeaders(intent.owner),
          'content-type': 'application/json',
          'idempotency-key': intent.key,
        },
      },
    );
    if (intent.kind === 'delivery') return state(value as CheckoutDeliveryStateDto, intent.draftId);
    if (!value || !('id' in value) || !uuid(value.id)) invalid();
    return value;
  },
  async search(query: string, offset: number, signal: AbortSignal) {
    const value = await requestWithDeadline<CheckoutAreaPageDto>(
      `${base}/checkout/delivery-areas?${new URLSearchParams({ query, offset: String(offset) })}`,
      { signal, cache: 'no-store' },
    );
    if (
      !value ||
      !Array.isArray(value.items) ||
      value.items.length > 20 ||
      !pageOffset(value.nextOffset) ||
      value.items.some(
        (a) =>
          !a ||
          !uuid(a.id) ||
          !text(a.name, 300) ||
          !optionalText(a.localName, 300) ||
          !optionalText(a.parentName, 300) ||
          typeof a.nodeType !== 'string',
      )
    )
      invalid();
    return value;
  },
};
