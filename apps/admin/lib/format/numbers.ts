export type NumericValue = string | number | null | undefined;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function scaledInteger(value: NumericValue, scale: number): bigint | null {
  if (value === null || value === undefined || scale < 0) return null;
  const source = String(value).trim();
  const match = DECIMAL_PATTERN.exec(source);
  if (!match) return null;

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const kept = fraction.slice(0, scale).padEnd(scale, '0');
  let result = BigInt(`${whole}${kept}` || '0');

  // Values entering through a JS calculation can contain more precision than the
  // database contract. Round once at the boundary instead of exposing binary noise.
  if (fraction.length > scale && Number(fraction[scale] ?? '0') >= 5) result += 1n;
  return result * sign;
}

function decimalText(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  if (scale === 0) return `${sign}${absolute}`;

  const padded = absolute.toString().padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Canonicalizes a transport decimal without converting exact database text to a float. */
export function normalizeDecimal(value: NumericValue, scale = 6): string {
  const scaled = scaledInteger(value, scale);
  return scaled === null ? '0' : decimalText(scaled, scale);
}

/** Exact subtraction for quantity strings returned by PostgreSQL. */
export function subtractDecimals(
  left: NumericValue,
  right: NumericValue,
  options: { minimum?: NumericValue; scale?: number } = {},
): string {
  const scale = options.scale ?? 6;
  const leftValue = scaledInteger(left, scale) ?? 0n;
  const rightValue = scaledInteger(right, scale) ?? 0n;
  const minimum = scaledInteger(options.minimum ?? '0', scale) ?? 0n;
  const result = leftValue - rightValue;
  return decimalText(result < minimum ? minimum : result, scale);
}

export function formatQuantity(value: NumericValue, locale = 'en-BD'): string {
  const normalized = normalizeDecimal(value, 6);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
    useGrouping: true,
  }).format(Number(normalized));
}

export function formatMoney(value: NumericValue, currency = 'BDT', locale = 'en-BD'): string {
  const normalized = normalizeDecimal(value, 2);
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(Number(normalized));
}
