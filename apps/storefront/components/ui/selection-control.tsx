'use client';

import {
  type ComponentPropsWithRef,
  forwardRef,
  type ReactNode,
  useId,
} from 'react';

import { cx } from '@/components/ui/classnames';
import { CheckIcon } from '@/components/ui/icons';

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  description?: ReactNode | undefined;
  hasError?: boolean | undefined;
  label?: ReactNode | undefined;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    className,
    defaultChecked,
    description,
    disabled,
    hasError,
    id: providedId,
    label,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <label
      className={cx(
        'group relative flex min-h-[40px] cursor-pointer select-none items-start gap-3 py-1.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      htmlFor={id}
    >
      <div className="relative flex items-center pt-0.5">
        <input
          checked={checked}
          className="peer sr-only"
          defaultChecked={defaultChecked}
          disabled={disabled}
          id={id}
          ref={ref}
          type="checkbox"
          {...props}
        />
        {/* Custom Luxury Checkbox Box */}
        <div
          className={cx(
            'flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-[background-color,border-color,box-shadow,transform] duration-150',
            // Default unchecked state
            'border-border-strong/60 bg-surface-container-lowest group-hover:border-primary/60 group-hover:bg-surface-container-low',
            // Checked state
            'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white',
            // Focus ring
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/25 peer-focus-visible:ring-offset-1',
            // Active tactile scale
            'group-active:scale-95',
            // Error state
            hasError && 'border-error peer-checked:bg-error peer-checked:border-error',
          )}
        >
          <CheckIcon
            className="opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
            size={13}
          />
        </div>
      </div>

      {(label || description) && (
        <div className="min-w-0 flex-1 text-left">
          {label && (
            <span className="block font-label-md text-sm font-medium text-on-surface leading-tight transition-colors duration-150 group-hover:text-primary">
              {label}
            </span>
          )}
          {description && (
            <span className="mt-0.5 block text-xs text-on-surface-variant/75 leading-normal">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
});

export type RadioProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  description?: ReactNode | undefined;
  hasError?: boolean | undefined;
  label?: ReactNode | undefined;
};

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  {
    checked,
    className,
    defaultChecked,
    description,
    disabled,
    hasError,
    id: providedId,
    label,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <label
      className={cx(
        'group relative flex min-h-[40px] cursor-pointer select-none items-start gap-3 py-1.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      htmlFor={id}
    >
      <div className="relative flex items-center pt-0.5">
        <input
          checked={checked}
          className="peer sr-only"
          defaultChecked={defaultChecked}
          disabled={disabled}
          id={id}
          ref={ref}
          type="radio"
          {...props}
        />
        {/* Custom Luxury Radio Circle */}
        <div
          className={cx(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,transform] duration-150',
            // Default unchecked state
            'border-border-strong/60 bg-surface-container-lowest group-hover:border-primary/60 group-hover:bg-surface-container-low',
            // Checked state
            'peer-checked:border-primary',
            // Focus ring
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/25 peer-focus-visible:ring-offset-1',
            // Active tactile scale
            'group-active:scale-95',
            // Error state
            hasError && 'border-error peer-checked:border-error',
          )}
        >
          <span className="size-2.5 rounded-full bg-primary opacity-0 scale-50 transition-[transform,opacity] duration-150 peer-checked:opacity-100 peer-checked:scale-100" />
        </div>
      </div>

      {(label || description) && (
        <div className="min-w-0 flex-1 text-left">
          {label && (
            <span className="block font-label-md text-sm font-medium text-on-surface leading-tight transition-colors duration-150 group-hover:text-primary">
              {label}
            </span>
          )}
          {description && (
            <span className="mt-0.5 block text-xs text-on-surface-variant/75 leading-normal">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
});

export type RadioCardProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  badge?: ReactNode | undefined;
  description?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  label: ReactNode;
  price?: ReactNode | undefined;
};

export const RadioCard = forwardRef<HTMLInputElement, RadioCardProps>(function RadioCard(
  {
    badge,
    checked,
    className,
    defaultChecked,
    description,
    disabled,
    icon,
    id: providedId,
    label,
    price,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <label
      className={cx(
        'group relative flex w-full cursor-pointer select-none items-start justify-between rounded-xl border p-4 transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99]',
        'bg-surface-container-lowest border-border/60 hover:border-border-strong/70 hover:bg-surface-container-low/40',
        'has-checked:border-primary has-checked:bg-primary-fixed/15 has-checked:shadow-xs',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      htmlFor={id}
    >
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <div className="pt-0.5">
          <input
            checked={checked}
            className="peer sr-only"
            defaultChecked={defaultChecked}
            disabled={disabled}
            id={id}
            ref={ref}
            type="radio"
            {...props}
          />
          <div
            className={cx(
              'flex size-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow] duration-150',
              'border-border-strong/60 bg-surface-container-lowest',
              'peer-checked:border-primary',
            )}
          >
            <span className="size-2.5 rounded-full bg-primary opacity-0 scale-50 transition-[transform,opacity] duration-150 peer-checked:opacity-100 peer-checked:scale-100" />
          </div>
        </div>

        {icon ? (
          <span className="text-primary pt-0.5">
            {icon}
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-label-md text-sm font-semibold text-on-surface">
              {label}
            </span>
            {badge ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label-sm text-[10px] font-bold text-primary uppercase tracking-wider">
                {badge}
              </span>
            ) : null}
          </div>
          {description && (
            <p className="mt-1 text-xs text-on-surface-variant/80 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {price && (
        <span className="shrink-0 font-mono text-xs font-bold text-primary tabular-nums pl-3 pt-0.5">
          {price}
        </span>
      )}
    </label>
  );
});
