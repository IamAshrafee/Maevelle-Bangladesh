'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ShopperAddressDto, ShopperAddressInput } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  blankDelivery,
  DeliveryFields,
  validateDelivery,
  type DeliveryErrors,
} from '@/features/checkout/components/delivery-fields';

/** The same fields and validation serve explicit new-address and edit workflows. */
export function AddressEditor({
  address,
  onSave,
  onClose,
  busy,
}: {
  address: ShopperAddressDto | null;
  onSave(value: ShopperAddressInput): Promise<unknown>;
  onClose(): void;
  busy: boolean;
}) {
  const prefix = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    summary = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<ShopperAddressInput>(() =>
    address
      ? { ...address, mobile: address.mobile ?? '', geographyNodeId: address.geographyNodeId ?? '' }
      : { ...blankDelivery, label: '', isDefault: false },
  );
  const [errors, setErrors] = useState<DeliveryErrors>({}),
    [message, setMessage] = useState('');
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = validateDelivery(value);
    setErrors(next);
    setMessage('');
    if (Object.keys(next).length) {
      setMessage('Check the highlighted fields.');
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    try {
      await onSave(value);
      onClose();
    } catch {
      setMessage(
        'The address could not be confirmed. Check the delivery message before retrying or making another edit.',
      );
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  return (
    <section
      className="rounded-2xl border border-primary/30 bg-surface-container-lowest p-4 sm:p-6"
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h3
          ref={heading}
          tabIndex={-1}
          id={`${prefix}-heading`}
          className="font-serif text-xl font-semibold"
        >
          {address ? 'Edit saved address' : 'Save a new address'}
        </h3>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <p className="mb-4 text-sm text-on-surface-variant">
        This changes your account address book. Your checkout destination changes only when you
        explicitly select an address.
      </p>
      <form onSubmit={submit} noValidate className="space-y-5">
        {message && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="rounded-xl bg-error-container p-3 text-sm text-on-error-container"
          >
            {message}
          </div>
        )}
        <DeliveryFields
          prefix={prefix}
          value={value}
          errors={errors}
          disabled={busy}
          onChange={(next) => setValue((old) => ({ ...old, ...next }))}
        />
        <Field id={`${prefix}-label`} label="Address label" optional>
          <Input
            value={value.label ?? ''}
            maxLength={60}
            placeholder="Home, work…"
            disabled={busy}
            onChange={(e) => setValue((old) => ({ ...old, label: e.target.value }))}
          />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={value.isDefault ?? false}
            disabled={busy}
            onChange={(e) => setValue((old) => ({ ...old, isDefault: e.target.checked }))}
          />
          Use as my default saved address
        </label>
        <Button type="submit" loading={busy} loadingLabel="Updating address book">
          {address ? 'Save address changes' : 'Save to my account'}
        </Button>
      </form>
    </section>
  );
}
