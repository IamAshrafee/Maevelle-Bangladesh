'use client';

import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { VerifiedIcon } from '@/components/ui/icons';

export type PhoneInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  helperText?: string;
  isVerified?: boolean;
  label?: string;
  requiredBadge?: string;
};

export function PhoneInput({
  className,
  defaultValue = '1755-890123',
  disabled = false,
  helperText = 'RedX & SteadFast riders will confirm via this number.',
  id = 'phone-input',
  isVerified = true,
  label = 'Courier Contact Number',
  requiredBadge = 'OTP Delivery',
  ...props
}: PhoneInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label
          className="flex items-center justify-between text-label-sm font-bold uppercase tracking-wider text-on-surface"
          htmlFor={id}
        >
          <span>{label}</span>
          {requiredBadge && (
            <span className="font-semibold text-primary">{requiredBadge}</span>
          )}
        </label>
      )}

      <div
        className={cx(
          'flex items-center rounded-xl bg-surface-container-low p-1 shadow-inner transition-[box-shadow,border-color]',
          'focus-within:ring-2 focus-within:ring-primary/20',
          disabled && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-1 rounded-lg bg-surface-container-lowest px-2.5 py-1.5 font-headline-sm text-[13px] font-bold text-on-surface shadow-xs select-none">
          <span aria-hidden="true" className="text-[14px]">
            🇧🇩
          </span>
          <span>+880</span>
        </div>

        <input
          autoComplete="tel"
          className={cx(
            'w-full bg-transparent px-3 font-headline-sm text-headline-sm tracking-wider text-on-surface outline-hidden placeholder:text-outline',
            className,
          )}
          defaultValue={defaultValue}
          disabled={disabled}
          id={id}
          inputMode="tel"
          placeholder="1712-345678"
          type="tel"
          {...props}
        />

        {isVerified && (
          <span
            aria-label="Verified phone number"
            className="flex pr-2 text-primary"
            title="Verified phone number"
          >
            <VerifiedIcon size={18} />
          </span>
        )}
      </div>

      {helperText && (
        <span className="block text-body-sm text-[11px] text-on-surface-variant">
          {helperText}
        </span>
      )}
    </div>
  );
}
