'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

export interface MoneyFieldProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'prefix'> {
  /** Label for the money field */
  readonly label?: string;
  /** Descriptive hint rendered below the input */
  readonly description?: string;
  /** Inline validation error message */
  readonly error?: string | null | undefined;
  /** Current string value (e.g. "15000", "15000.50", or "" while editing) */
  readonly value: string;
  /** Callback fired when the sanitized numeric string value changes */
  readonly onChange: (value: string) => void;
  /** Currency symbol prefix (defaults to Bangladeshi Taka "৳") */
  readonly currencySymbol?: string;
  /** Whether fractional poisha/cents are allowed (default: true) */
  readonly allowDecimals?: boolean;
  /** Maximum number of decimal places allowed (default: 2) */
  readonly maxDecimals?: number;
  /** Whether the field is disabled/read-only */
  readonly disabled?: boolean;
  /** Optional container class name */
  readonly containerClassName?: string;
}

/**
 * Sanitizes user input string:
 * - Replaces Arabic/European comma ',' with dot '.'
 * - Strips negative signs (unless explicitly allowed, but finance amounts are non-negative here)
 * - Strips any non-numeric and non-dot characters
 * - Ensures at most one dot exists
 * - Enforces max decimal places
 */
export function sanitizeMoneyInput(raw: string, allowDecimals = true, maxDecimals = 2): string {
  if (!raw) return '';

  let cleaned = raw.trim();

  // Strip currency symbols and letters, keeping digits, dots, and commas
  cleaned = cleaned.replace(/[^0-9.,]/g, '');

  // If there is already a dot, commas are strictly grouping separators (e.g. 15,000.50)
  if (cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    const commaCount = (cleaned.match(/,/g) || []).length;
    if (commaCount > 1) {
      // Multiple commas (e.g. 1,000,000 or South Asian 1,50,000) are grouping separators
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Single comma: check digits after comma
      const commaIndex = cleaned.indexOf(',');
      const afterComma = cleaned.slice(commaIndex + 1);
      if (afterComma.length === 3) {
        // Exactly 3 trailing digits (e.g. 15,000 or 1,000) is thousands grouping in financial inputs
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // 1 or 2 digits (e.g. 1500,50 or 0,75) or trailing comma (1500,) is decimal separator
        cleaned = cleaned.replace(/,/g, '.');
      }
    }
  }

  // Remove any remaining invalid characters
  cleaned = cleaned.replace(/[^0-9.]/g, '');

  if (!allowDecimals) {
    return cleaned.replace(/\./g, '');
  }

  // Ensure at most one decimal point
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
  }

  // Truncate excess decimal places
  const finalParts = cleaned.split('.');
  if (finalParts.length === 2 && finalParts[1] && finalParts[1].length > maxDecimals) {
    cleaned = `${finalParts[0]}.${finalParts[1].slice(0, maxDecimals)}`;
  }

  return cleaned;
}

/**
 * Domain-aware MoneyField component for Maevelle Admin.
 *
 * Guarantees:
 * - Anti-zoom touch typography (`text-base md:text-sm pointer-coarse:text-base`).
 * - High-speed numeric entry via `inputMode="decimal"`.
 * - Clean intermediate editing states (never snaps to NaN or zero while backspacing).
 * - Fixed BDT `৳` prefix addon with high-contrast `tabular-nums font-mono`.
 * - No binary float rounding corruption.
 */
export const MoneyField = React.forwardRef<HTMLInputElement, MoneyFieldProps>(
  (
    {
      id,
      label,
      description,
      error,
      value,
      onChange,
      currencySymbol = '৳',
      allowDecimals = true,
      maxDecimals = 2,
      disabled = false,
      placeholder = '0.00',
      className,
      containerClassName,
      required,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? React.useId();
    const errorId = `${inputId}-error`;
    const descriptionId = `${inputId}-desc`;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeMoneyInput(e.target.value, allowDecimals, maxDecimals);
      onChange(sanitized);
    };

    const symbolPadding =
      currencySymbol.length > 2 ? 'pl-12' : currencySymbol.length === 2 ? 'pl-9' : 'pl-7';

    return (
      <Field className={containerClassName}>
        {label ? (
          <FieldLabel htmlFor={inputId} className="text-xs font-medium">
            {label}
            {required ? <span className="text-destructive ml-0.5">*</span> : null}
          </FieldLabel>
        ) : null}

        <div className="relative flex w-full items-center">
          <span
            className="pointer-events-none absolute left-3 flex items-center justify-center font-mono text-sm font-medium text-muted-foreground select-none"
            aria-hidden="true"
          >
            {currencySymbol}
          </span>
          <Input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : description ? descriptionId : undefined
            }
            className={cn(
              'font-mono tabular-nums text-base md:text-sm pointer-coarse:text-base',
              symbolPadding,
              className,
            )}
            {...props}
          />
        </div>

        {error ? (
          <FieldError id={errorId} className="text-xs">
            {error}
          </FieldError>
        ) : description ? (
          <FieldDescription id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </FieldDescription>
        ) : null}
      </Field>
    );
  },
);

MoneyField.displayName = 'MoneyField';
