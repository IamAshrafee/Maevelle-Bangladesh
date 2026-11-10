import { it, expect } from 'vitest';
import { presentMoney } from './money-presentation.js';
it.each([
  ['299.0000', '৳299'],
  ['12500.0000', '৳12,500'],
  ['0.0000', '৳0'],
  ['9999999999999999.0000', '৳9,999,999,999,999,999'],
  ['299.2500', '৳299.25'],
  ['-0.4000', '৳−0.4'],
])('preserves %s as %s', (amount, text) => expect(presentMoney(amount).text).toBe(text));
it('rejects fractions in a whole contract instead of hiding them', () => {
  expect(presentMoney('299.2500', { mode: 'WHOLE_BDT' })).toMatchObject({
    kind: 'INVALID',
    text: 'Amount needs review',
  });
  expect(presentMoney('81.0000', { mode: 'WHOLE_BDT' }).text).toBe('৳81');
});
it('retains exact internal cost, signed corrections and unavailable/nonfinal distinctions', () => {
  expect(presentMoney('123.45678901', { mode: 'EXACT' }).text).toBe('৳123.45678901');
  expect(presentMoney('-0.4000', { mode: 'EXACT' }).text).toBe('৳−0.4000');
  expect(presentMoney('0.4000', { mode: 'EXACT' }).text).toBe('৳0.4000');
  expect(presentMoney('0.0000', { mode: 'EXACT' }).text).toBe('৳0.0000');
  expect(presentMoney(null).kind).toBe('UNAVAILABLE');
  expect(presentMoney('NaN').kind).toBe('INVALID');
  expect(presentMoney('81.0000', { mode: 'NONFINAL' }).label).toContain('not final payable');
});
