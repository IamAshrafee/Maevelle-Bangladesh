'use client';
import { useState } from 'react';
import type { CheckoutDeliveryInput } from '@maevelle/contracts';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { DeliveryAreaPicker } from './delivery-area-picker';

export const blankDelivery: CheckoutDeliveryInput = {
  recipientName: '',
  mobile: '',
  geographyNodeId: '',
  addressLine1: '',
  addressLine2: null,
  instructions: null,
};
export type DeliveryErrors = Partial<Record<keyof CheckoutDeliveryInput, string>>;
export function validateDelivery(value: CheckoutDeliveryInput): DeliveryErrors {
  const errors: DeliveryErrors = {};
  for (const [key, label, max] of [
    ['recipientName', 'recipient name', 120],
    ['mobile', 'mobile number', 40],
    ['addressLine1', 'detailed address', 500],
  ] as const) {
    if (!value[key].trim()) errors[key] = `Enter your ${label}.`;
    else if ([...value[key]].length > max) errors[key] = `Use ${max} characters or fewer.`;
  }
  if (!value.geographyNodeId) errors.geographyNodeId = 'Choose a delivery area from the results.';
  for (const [key, max] of [
    ['addressLine2', 300],
    ['instructions', 500],
  ] as const)
    if ([...(value[key] ?? '')].length > max) errors[key] = `Use ${max} characters or fewer.`;
  return errors;
}
export function DeliveryFields({
  prefix,
  value,
  onChange,
  errors = {},
  disabled = false,
}: {
  prefix: string;
  value: CheckoutDeliveryInput;
  onChange(value: CheckoutDeliveryInput): void;
  errors?: DeliveryErrors;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(value.addressLine2 || value.instructions));
  const change = (field: keyof CheckoutDeliveryInput, text: string) =>
    onChange({ ...value, [field]: text });
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <legend className="sr-only">Recipient and delivery address</legend>
      <p className="text-xs text-on-surface-variant">
        Fields marked * are required. Email is not needed.
      </p>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Recipient name" required error={errors.recipientName}>
          <Input
            name="recipientName"
            autoComplete="shipping name"
            value={value.recipientName}
            className="text-[length:var(--text-base)] sm:text-sm"
            onChange={(e) => change('recipientName', e.target.value)}
            aria-required="true"
          />
        </Field>
        <Field
          id={`${prefix}-mobile`}
          label="Mobile number"
          required
          error={errors.mobile}
          description="Bangladesh mobile, such as 01712345678 or +8801712345678. বাংলা digits are welcome."
        >
          <Input
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="shipping tel"
            value={value.mobile}
            className="text-[length:var(--text-base)] sm:text-sm"
            onChange={(e) => change('mobile', e.target.value)}
            aria-required="true"
          />
        </Field>
      </div>
      <Field id={`${prefix}-area`} label="Delivery area" required error={errors.geographyNodeId}>
        <DeliveryAreaPicker
          value={value.geographyNodeId}
          onSelect={(area) => onChange({ ...value, geographyNodeId: area?.id ?? '' })}
          id={`${prefix}-area`}
          disabled={disabled}
        />
      </Field>
      <Field
        id={`${prefix}-address`}
        label="Detailed address"
        required
        error={errors.addressLine1}
        description="House, road, apartment or village, plus a useful landmark."
      >
        <Textarea
          name="addressLine1"
          autoComplete="shipping address-line1"
          value={value.addressLine1}
          className="text-[length:var(--text-base)] sm:text-sm"
          onChange={(e) => change('addressLine1', e.target.value)}
          aria-required="true"
        />
      </Field>
      <details
        className="rounded-xl border border-border-subtle p-3 sm:p-4"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">
          Additional address details & instructions{' '}
          <span className="font-normal text-on-surface-variant">(optional)</span>
        </summary>
        <div className="mt-4 space-y-4">
          <Field
            id={`${prefix}-address2`}
            label="Additional address details"
            optional
            error={errors.addressLine2}
          >
            <Input
              name="addressLine2"
              autoComplete="shipping address-line2"
              value={value.addressLine2 ?? ''}
              className="text-[length:var(--text-base)] sm:text-sm"
              onChange={(e) => change('addressLine2', e.target.value)}
            />
          </Field>
          <Field
            id={`${prefix}-instructions`}
            label="Delivery instructions"
            optional
            error={errors.instructions}
          >
            <Textarea
              name="instructions"
              value={value.instructions ?? ''}
              className="text-[length:var(--text-base)] sm:text-sm"
              onChange={(e) => change('instructions', e.target.value)}
            />
          </Field>
        </div>
      </details>
    </fieldset>
  );
}
