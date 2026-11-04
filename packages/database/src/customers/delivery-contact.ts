import type { CheckoutDeliveryInput, CheckoutDeliverySnapshot } from '@maevelle/contracts';
import { normalizeCustomerPhone } from '../customer-identities.js';
import { CustomerIdentityValidationError } from '../customer-identities.js';

/** Preserve Bangla shaping/joiners; reject control characters, bidi overrides and lone surrogates. */
export function contactText(value: unknown, maximum: number, required = true): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string')
    throw new CustomerIdentityValidationError('Invalid delivery text.');
  const normalized = value.normalize('NFC').trim();
  if (
    (required && !normalized) ||
    [...normalized].length > maximum ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069\p{Cs}]/u.test(normalized)
  )
    throw new CustomerIdentityValidationError('Invalid delivery text.');
  return normalized || null;
}
export function normalizeDeliveryContact(input: CheckoutDeliveryInput): CheckoutDeliverySnapshot {
  const mobileInput = contactText(input.mobile, 40)!;
  // libphonenumber is the existing identity authority; Checkout additionally requires BD mobile.
  const mobile = normalizeCustomerPhone(
    mobileInput.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)),
  );
  if (!/^\+8801[3-9][0-9]{8}$/.test(mobile))
    throw new CustomerIdentityValidationError('A valid Bangladesh mobile is required.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.geographyNodeId,
    )
  )
    throw new CustomerIdentityValidationError('Select a delivery area.');
  return {
    recipientName: contactText(input.recipientName, 120)!,
    mobile,
    geographyNodeId: input.geographyNodeId.toLowerCase(),
    countryCode: 'BD',
    addressLine1: contactText(input.addressLine1, 500)!,
    addressLine2: contactText(input.addressLine2, 300, false),
    instructions: contactText(input.instructions, 500, false),
  };
}
