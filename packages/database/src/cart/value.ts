import { hashToken } from '@maevelle/security';
import { CartDomainError } from './errors.js';
const moneyScale = 10_000n;
export function parseMoney(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * moneyScale + BigInt(((fraction ?? '') + '0000').slice(0, 4));
}

export function money(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${(absolute / moneyScale).toString()}.${(absolute % moneyScale).toString().padStart(4, '0')}`;
}

export function quantity(value: string): bigint {
  const match = /^([1-9]\d{0,1})(?:\.0{1,6})?$/.exec(value);
  if (!match) {
    throw new CartDomainError(
      'VALIDATION_FAILED',
      'Cart quantity must be a positive whole number.',
    );
  }
  return BigInt(match[1]!);
}

/** Storefront V1 sells discrete units; floor ATS only for that availability hint. */
export function availableWholeUnits(value: string): bigint {
  const whole = value.split('.')[0] ?? '0';
  return /^\d+$/.test(whole) ? BigInt(whole) : 0n;
}

export function fingerprint(value: unknown): string {
  return hashToken(JSON.stringify(value));
}
