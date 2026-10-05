'use client';

import * as React from 'react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';

export interface TotpCodeInputProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly hasError?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string;
}

export function TotpCodeInput({
  id = 'totp-verification-code',
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  hasError = false,
  className,
  'aria-label': ariaLabel = 'Six-digit verification code',
  'aria-describedby': ariaDescribedBy,
}: TotpCodeInputProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
      <InputOTP
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={(val) => {
          onChange(val);
          if (val.length === 6 && onComplete) {
            onComplete(val);
          }
        }}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={hasError}
        containerClassName="gap-2 sm:gap-3"
      >
        <InputOTPGroup
          className={cn(
            'shadow-2xs rounded-lg border border-border bg-card',
            hasError && 'border-destructive ring-1 ring-destructive/40',
          )}
        >
          <InputOTPSlot
            index={0}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
          <InputOTPSlot
            index={1}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
          <InputOTPSlot
            index={2}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
        </InputOTPGroup>

        <InputOTPSeparator className="text-muted-foreground" />

        <InputOTPGroup
          className={cn(
            'shadow-2xs rounded-lg border border-border bg-card',
            hasError && 'border-destructive ring-1 ring-destructive/40',
          )}
        >
          <InputOTPSlot
            index={3}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
          <InputOTPSlot
            index={4}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
          <InputOTPSlot
            index={5}
            className="size-10 sm:size-11 font-mono text-base sm:text-lg tabular-nums text-foreground"
          />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
