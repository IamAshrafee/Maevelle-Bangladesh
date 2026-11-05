'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function QuoteCouponForm({
  initialCodes,
  disabled,
  loading,
  onEditing,
  onEvaluate,
}: {
  initialCodes: readonly string[];
  disabled: boolean;
  loading: boolean;
  onEditing(value: boolean): void;
  onEvaluate(codes: readonly string[]): Promise<unknown>;
}) {
  const id = useId(),
    field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => initialCodes.join(', ')),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const codes = value
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length > 10 || codes.some((c) => !/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(c))) {
      setError('Enter up to ten codes, using letters, numbers, hyphens or underscores.');
      field.current?.focus();
      return;
    }
    setError('');
    await onEvaluate(codes);
  }
  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e).catch(() => undefined)} noValidate>
      <label className="block text-sm font-semibold" htmlFor={id}>
        Coupon codes <span className="font-normal text-on-surface-variant">(optional)</span>
      </label>
      <Input
        ref={field}
        id={id}
        name="checkout-coupon-codes"
        autoComplete="off"
        spellCheck={false}
        maxLength={700}
        className="text-[16px] sm:text-sm"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          setError('');
          onEditing(next !== initialCodes.join(', '));
        }}
      />
      <p id={`${id}-hint`} className="text-xs text-on-surface-variant">
        Separate codes with commas. Up to ten codes; eligibility is checked when you evaluate.
      </p>
      {value !== initialCodes.join(', ') && (
        <p role="status" className="text-xs text-on-surface-variant">
          These coupon entries have not been evaluated.
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        fullWidth
        disabled={disabled}
        loading={loading}
        loadingLabel="Evaluating amounts"
      >
        {initialCodes.length ? 'Update evaluated amounts' : 'Evaluate selection'}
      </Button>
    </form>
  );
}
