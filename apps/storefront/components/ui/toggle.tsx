'use client';

import type { ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

export type ToggleProps = {
  checked?: boolean;
  className?: string;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  label: ReactNode;
  onChange?: (checked: boolean) => void;
};

export function Toggle({
  checked = false,
  className,
  description,
  disabled = false,
  id,
  label,
  onChange,
}: ToggleProps) {
  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  return (
    <div
      className={cx(
        'flex items-center justify-between rounded-xl bg-surface-container-low p-3 transition-colors',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div>
        <label
          className="block font-headline-sm text-[13px] font-semibold text-on-surface cursor-pointer select-none"
          htmlFor={id}
          onClick={handleToggle}
        >
          {label}
        </label>
        {description && (
          <span className="block text-body-sm text-[11px] text-on-surface-variant select-none">
            {description}
          </span>
        )}
      </div>

      <button
        aria-checked={checked}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-surface-container-highest',
        )}
        disabled={disabled}
        id={id}
        onClick={handleToggle}
        role="switch"
        type="button"
      >
        <span
          className={cx(
            'pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
