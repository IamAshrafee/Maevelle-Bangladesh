import { describe, expect, it } from 'vitest';

import { formatMoney, wholeQuantity } from './money';

describe('storefront numeric presentation', () => {
  it('keeps the quantity stepper on positive whole units', () => {
    expect(wholeQuantity('3.000000')).toBe(3);
    expect(wholeQuantity(3.9)).toBe(3);
    expect(wholeQuantity(Number.NaN)).toBe(1);
    expect(wholeQuantity(200, 1, 99)).toBe(99);
  });

  it('preserves fractional authority instead of silently rounding it', () => {
    expect(formatMoney('749.9999', 'BDT', 'en-US')).toBe('৳749.9999');
    expect(formatMoney('749.5000', 'BDT', 'en-US')).toMatch(/749\.5/);
  });
});
