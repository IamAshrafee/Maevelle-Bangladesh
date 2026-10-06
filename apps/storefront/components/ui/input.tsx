'use client';

import {
  type ComponentPropsWithRef,
  forwardRef,
  type ReactNode,
  useId,
  useState,
} from 'react';

import { cx } from '@/components/ui/classnames';
import { formControlClassName } from '@/components/ui/form-control-styles';
import { CloseIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icons';

export type InputSizeVariant = 'sm' | 'md' | 'lg';

export type InputProps = Omit<ComponentPropsWithRef<'input'>, 'size'> & {
  clearable?: boolean | undefined;
  hasError?: boolean | undefined;
  leftIcon?: ReactNode | undefined;
  onClear?: (() => void) | undefined;
  rightIcon?: ReactNode | undefined;
  showPasswordToggle?: boolean | undefined;
  sizeVariant?: InputSizeVariant | undefined;
};

const sizeClasses: Record<InputSizeVariant, string> = {
  sm: 'h-9 text-xs px-3',
  md: 'h-11 text-sm px-3.5',
  lg: 'h-12 text-sm px-4 min-h-12',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    clearable = false,
    disabled,
    hasError,
    id: providedId,
    leftIcon,
    onClear,
    rightIcon,
    showPasswordToggle = false,
    sizeVariant = 'md',
    type = 'text',
    value,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === 'password';
  const effectiveType = isPassword && showPassword ? 'text' : type;
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  const hasSuffix = rightIcon || (isPassword && showPasswordToggle) || (clearable && hasValue && !disabled);

  // If there are icons or suffixes, wrap in a relative container
  if (leftIcon || hasSuffix) {
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

        <input
          aria-invalid={hasError ? true : props['aria-invalid']}
          className={cx(
            formControlClassName,
            sizeClasses[sizeVariant],
            Boolean(leftIcon) && (sizeVariant === 'sm' ? 'pl-8' : 'pl-10'),
            Boolean(hasSuffix) && (sizeVariant === 'sm' ? 'pr-8' : 'pr-11'),
            hasError && 'border-error focus:border-error focus:ring-error/15',
            className,
          )}
          disabled={disabled}
          id={id}
          ref={ref}
          type={effectiveType}
          value={value}
          {...props}
        />

        <div className="absolute right-2.5 flex items-center gap-1 text-on-surface-variant/70">
          {clearable && hasValue && !disabled && (
            <button
              aria-label="Clear input value"
              className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
              onClick={onClear}
              tabIndex={-1}
              type="button"
            >
              <CloseIcon size={13} />
            </button>
          )}

          {isPassword && showPasswordToggle && !disabled && (
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              type="button"
            >
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          )}

          {rightIcon && !((isPassword && showPasswordToggle) || (clearable && hasValue)) ? (
            <span aria-hidden="true" className="flex items-center justify-center">
              {rightIcon}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <input
      aria-invalid={hasError ? true : props['aria-invalid']}
      className={cx(
        formControlClassName,
        sizeClasses[sizeVariant],
        hasError && 'border-error focus:border-error focus:ring-error/15',
        className,
      )}
      disabled={disabled}
      id={id}
      ref={ref}
      type={type}
      value={value}
      {...props}
    />
  );
});
