import { describe, expect, it } from 'vitest';

import {
  formatInternalMoney,
  formatMoney,
  formatQuantity,
  formatWholeTaka,
  normalizeDecimal,
  subtractDecimals,
} from '../lib/format/numbers';

describe('admin numeric presentation', () => {
  it('removes database scale padding without losing meaningful quantity precision', () => {
    expect(normalizeDecimal('12.000000')).toBe('12');
    expect(normalizeDecimal('12.250000')).toBe('12.25');
    expect(formatQuantity('1200.000000', 'en-US')).toBe('1,200');
  });

  it('subtracts transport decimals without JavaScript floating-point artifacts', () => {
    expect(subtractDecimals('0.300000', '0.200000')).toBe('0.1');
    expect(subtractDecimals('1.000000', '1.250000')).toBe('0');
  });

  it('rounds business money to two display decimals', () => {
    expect(normalizeDecimal('749.9999', 2)).toBe('750');
    expect(formatMoney('1234.5000', 'BDT', 'en-US')).toMatch(/1,234\.5/);
  });

  it('formats final payable BDT amounts in whole Taka while preserving internal decimal precision', () => {
    expect(formatWholeTaka('1249.5000', { locale: 'en-US' })).toBe('৳1,250');
    expect(formatWholeTaka('1249.4900', { locale: 'en-US' })).toBe('৳1,249');
    expect(formatWholeTaka('5000.00', { prefix: 'BDT ', locale: 'en-US' })).toBe('BDT 5,000');

    expect(formatInternalMoney('1250.3450', { locale: 'en-US' })).toBe('৳1,250.35');
    expect(formatInternalMoney('1000.0000', { locale: 'en-US' })).toBe('৳1,000');
    expect(formatInternalMoney('12.3456', { fractionDigits: 4, locale: 'en-US' })).toBe('৳12.3456');
  });
});
