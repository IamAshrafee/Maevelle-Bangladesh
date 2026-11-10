import type { CashShortfallPolicyInputDto } from '@maevelle/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { PaymentField } from './payment-ui';

export function cashPolicyBody(f: FormData): CashShortfallPolicyInputDto {
  const text = (key: string) => String(f.get(key) ?? '').trim();
  return {
    revision: text('revision'),
    scope: text('scope') as CashShortfallPolicyInputDto['scope'],
    maximumPerAdjustment: text('maximumPerAdjustment'),
    maximumPerOrder: text('maximumPerOrder'),
    maximumPerStaffDay: text('maximumPerStaffDay'),
    selfApprovalLimit: text('selfApprovalLimit'),
    allowedOrderStates: f
      .getAll('allowedOrderStates')
      .map(String) as CashShortfallPolicyInputDto['allowedOrderStates'],
    effectiveFrom: new Date(text('effectiveFrom')).toISOString(),
    expiresAt: new Date(text('expiresAt')).toISOString(),
    accountingReference: text('accountingReference'),
    invoiceTreatmentReference: text('invoiceTreatmentReference'),
    courierShortCollectionReference: text('courierShortCollectionReference'),
  };
}
export function CashPolicyFields() {
  return (
    <>
      <PaymentField label="Policy revision" name="revision" maxLength={64} />
      <PaymentField label="Evidence scope" name="scope">
        <option value="BUSINESS">Business proposal</option>
        <option value="SYNTHETIC">Synthetic test policy</option>
      </PaymentField>
      {(
        [
          ['maximumPerAdjustment', 'Maximum per adjustment'],
          ['maximumPerOrder', 'Gross maximum per Order'],
          ['maximumPerStaffDay', 'Gross maximum per staff / UTC day'],
          ['selfApprovalLimit', 'Self-authorization limit'],
        ] as const
      ).map(([name, label]) => (
        <PaymentField
          key={name}
          name={name}
          label={`${label} (whole BDT)`}
          pattern="[0-9]{1,16}"
          maxLength={16}
        />
      ))}
      <PaymentField
        label="Effective from (local time)"
        name="effectiveFrom"
        type="datetime-local"
      />
      <PaymentField label="Expires (local time)" name="expiresAt" type="datetime-local" />
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Eligible Order states (COD only)</legend>
        {['PENDING', 'CONFIRMED', 'COMPLETED'].map((s) => (
          <label className="flex min-h-10 items-center gap-3 text-sm" key={s}>
            <Checkbox name="allowedOrderStates" value={s} />
            {s.toLowerCase()}
          </label>
        ))}
      </fieldset>
      <PaymentField
        label="Accounting decision reference"
        name="accountingReference"
        maxLength={512}
      />
      <PaymentField
        label="Invoice treatment reference"
        name="invoiceTreatmentReference"
        maxLength={512}
      />
      <PaymentField
        label="Courier short-collection permission"
        name="courierShortCollectionReference"
        maxLength={512}
      />
    </>
  );
}
