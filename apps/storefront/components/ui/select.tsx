'use client';

import {
  type ComponentPropsWithRef,
  forwardRef,
  type ReactNode,
} from 'react';

import { cx } from '@/components/ui/classnames';
import { formControlClassName } from '@/components/ui/form-control-styles';
import { ChevronDownIcon } from '@/components/ui/icons';

export type SelectSizeVariant = 'sm' | 'md' | 'lg';

export type SelectProps = ComponentPropsWithRef<'select'> & {
  hasError?: boolean | undefined;
  leftIcon?: ReactNode | undefined;
  sizeVariant?: SelectSizeVariant | undefined;
};

const sizeClasses: Record<SelectSizeVariant, string> = {
  sm: 'h-9 text-xs pl-3 pr-8',
  md: 'h-11 text-sm pl-3.5 pr-10',
  lg: 'h-12 text-sm pl-4 pr-10 min-h-12',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    children,
    className,
    disabled,
    hasError,
    leftIcon,
    sizeVariant = 'md',
    ...props
  },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      {leftIcon ? (
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute left-3 flex items-center justify-center text-on-surface-variant/70',
            sizeVariant === 'sm' ? 'left-2.5 text-xs' : 'left-3.5',
          )}
        >
          {leftIcon}
        </span>
      ) : null}

      <select
        aria-invalid={hasError ? true : props['aria-invalid']}
        className={cx(
          formControlClassName,
          'appearance-none cursor-pointer pr-10 bg-no-repeat',
          sizeClasses[sizeVariant],
          Boolean(leftIcon) && (sizeVariant === 'sm' ? 'pl-8' : 'pl-10'),
          hasError && 'border-error focus:border-error focus:ring-error/15',
          className,
        )}
        disabled={disabled}
        ref={ref}
        {...props}
      >
        {children}
      </select>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 flex items-center justify-center text-on-surface-variant/70"
      >
        <ChevronDownIcon size={sizeVariant === 'sm' ? 14 : 16} />
      </span>
    </div>
  );
});
