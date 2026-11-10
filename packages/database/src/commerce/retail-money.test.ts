import { expect, it } from 'vitest';
import { syntheticWholePolicy } from '../testing/whole-taka-policy.js';
import { wholeBdtAmount, roundWholeBdt } from './retail-money.js';
it.each([
  ['80.4000', '80.0000', '-0.4000'],
  ['80.5000', '81.0000', '0.5000'],
  ['80.6000', '81.0000', '0.4000'],
  ['99.9900', '100.0000', '0.0100'],
  ['100.0000', '100.0000', '0.0000'],
  ['0.0000', '0.0000', '0.0000'],
  ['0.0001', '0.0000', '-0.0001'],
  ['-0.5000', '-1.0000', '-0.5000'],
  ['-80.6000', '-81.0000', '-0.4000'],
  ['999999999999999.6000', '1000000000000000.0000', '0.4000'],
])('rounds %s exactly once to %s with explicit adjustment %s', (amount, payable, adjustment) => {
  expect(roundWholeBdt(amount, syntheticWholePolicy)).toMatchObject({
    preciseAmount: amount,
    payable,
    roundingAdjustment: adjustment,
    payableUnit: 'BDT_1',
  });
});
it('validates whole customer authoring without truncating fractional costs or old prices', () => {
  expect(wholeBdtAmount('299.0000')).toBe('299.0000');
  expect(() => wholeBdtAmount('81.1250')).toThrow('WHOLE_BDT_REQUIRED');
  expect(() => roundWholeBdt('80.5', { ...syntheticWholePolicy, mode: 'EXACT' })).toThrow(
    'WHOLE_BDT_REQUIRED',
  );
});
it('rejects incomplete policy provenance', () => {
  expect(() =>
    roundWholeBdt('80.6', { ...syntheticWholePolicy, invoiceTreatmentReference: '' }),
  ).toThrow('ROUNDING_POLICY_BLOCKED');
});
