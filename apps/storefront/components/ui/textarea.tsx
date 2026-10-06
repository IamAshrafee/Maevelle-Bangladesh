'use client';

import {
  type ComponentPropsWithRef,
  forwardRef,
} from 'react';

import { cx } from '@/components/ui/classnames';
import { formControlClassName } from '@/components/ui/form-control-styles';

export type TextareaProps = ComponentPropsWithRef<'textarea'> & {
  hasError?: boolean | undefined;
  maxCharacters?: number | undefined;
  showCharacterCount?: boolean | undefined;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    className,
    disabled,
    hasError,
    maxCharacters,
    maxLength,
    showCharacterCount = false,
    value,
    ...props
  },
  ref,
) {
  const effectiveMax = maxCharacters ?? maxLength;
  const currentLength = value !== undefined && value !== null ? String(value).length : 0;

  return (
    <div className="w-full space-y-1">
      <textarea
        aria-invalid={hasError ? true : props['aria-invalid']}
        className={cx(
          formControlClassName,
          'min-h-24 sm:min-h-28 resize-y py-3 px-3.5 leading-relaxed',
          hasError && 'border-error focus:border-error focus:ring-error/15',
          className,
        )}
        disabled={disabled}
        maxLength={effectiveMax}
        ref={ref}
        value={value}
        {...props}
      />
      {(showCharacterCount || effectiveMax) && (
        <div className="flex justify-end pr-1 text-[11px] font-mono text-on-surface-variant/70 tabular-nums">
          <span>{currentLength}</span>
          {effectiveMax && <span>/{effectiveMax}</span>}
        </div>
      )}
    </div>
  );
});
