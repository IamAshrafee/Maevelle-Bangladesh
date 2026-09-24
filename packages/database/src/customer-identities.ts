import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export class CustomerIdentityValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CustomerIdentityValidationError';
  }
}

/**
 * Produces an E.164 comparison key while retaining the caller's raw value elsewhere.
 * Bangladesh is the storefront default, not a permanent assumption: explicit
 * international numbers continue to parse against their own country calling code.
 */
export function normalizeCustomerPhone(value: string, defaultCountry: CountryCode = 'BD'): string {
  const raw = value.trim();
  const compact = raw.replace(/[\s().-]+/g, '');
  const explicitInternational = /^880\d+$/.test(compact) ? `+${compact}` : compact;
  const parsed = parsePhoneNumberFromString(explicitInternational, defaultCountry);
  if (!parsed?.isValid()) {
    throw new CustomerIdentityValidationError('Phone number is not valid.');
  }
  return parsed.number;
}

export function normalizeCustomerEmail(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CustomerIdentityValidationError('Email address is not valid.');
  }
  return normalized;
}

export function normalizeCustomerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
