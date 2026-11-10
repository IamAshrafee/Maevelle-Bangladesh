import type { WholeTakaPolicyDto } from '@maevelle/contracts';
import { money, parseMoney } from '../cart/value.js';

export function wholeBdtAmount(value: string): string {
  const amount = parseMoney(value);
  if (amount % 10000n !== 0n) throw new Error('WHOLE_BDT_REQUIRED');
  return money(amount);
}

/** Never rounds individual lines or hides a fraction through display formatting. */
export function roundWholeBdt(value: string, policy: WholeTakaPolicyDto) {
  if (
    policy.currency !== 'BDT' ||
    policy.unit !== '1.0000' ||
    !['HALF_UP', 'EXACT'].includes(policy.mode) ||
    policy.boundary !== 'AFTER_DISCOUNTS_SHIPPING_TAX_AND_FEES' ||
    policy.negativeTreatment !== 'SYMMETRIC' ||
    !policy.version.trim() ||
    !policy.invoiceTreatmentReference.trim() ||
    !policy.approval.reference.trim() ||
    !policy.approval.approvedBy.trim() ||
    !['SYNTHETIC', 'BUSINESS'].includes(policy.approval.scope) ||
    !Number.isFinite(Date.parse(policy.approval.approvedAt))
  )
    throw new Error('ROUNDING_POLICY_BLOCKED');
  const negative = value.startsWith('-'),
    units = parseMoney(negative ? value.slice(1) : value);
  if (policy.mode === 'EXACT' && units % 10000n) throw new Error('WHOLE_BDT_REQUIRED');
  const rounded = policy.mode === 'EXACT' ? units : ((units + 5000n) / 10000n) * 10000n;
  const signed = negative ? -units : units,
    payable = negative ? -rounded : rounded;
  return {
    preciseAmount: money(signed),
    roundingAdjustment: money(payable - signed),
    payable: money(payable),
    payableUnit: 'BDT_1' as const,
    policy,
  };
}
