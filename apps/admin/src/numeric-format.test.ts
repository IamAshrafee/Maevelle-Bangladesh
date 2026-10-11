import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatQuantity,
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
});
