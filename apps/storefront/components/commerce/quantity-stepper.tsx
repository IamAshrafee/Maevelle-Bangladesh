'use client';

import { cx } from '@/components/ui/classnames';

export type QuantityStepperSize = 'sm' | 'md' | 'lg';
export type QuantityStepperVariant = 'bordered' | 'pill';

export type QuantityStepperProps = {
  className?: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  size?: QuantityStepperSize;
  value: number;
  variant?: QuantityStepperVariant;
};

const sizeStyles: Record<
  QuantityStepperSize,
  {
    btn: string;
    container: string;
    text: string;
    val: string;
  }
> = {
  sm: {
    container: 'h-7 rounded-lg',
    btn: 'w-7 text-xs',
    val: 'w-7 text-xs',
    text: 'text-xs',
  },
  md: {
    container: 'h-9 rounded-lg',
    btn: 'w-9 text-sm',
    val: 'w-9 text-sm',
    text: 'text-sm',
  },
  lg: {
    container: 'h-11 rounded-xl',
    btn: 'w-11 text-base',
    val: 'w-11 text-base',
    text: 'text-base',
  },
};

export function QuantityStepper({
  className,
  disabled = false,
  max = 99,
  min = 1,
  onChange,
  size = 'md',
  value,
  variant = 'bordered',
}: QuantityStepperProps) {
  const handleDecrement = () => {
    if (value > min && !disabled) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max && !disabled) {
      onChange(value + 1);
    }
  };

  const currentSize = sizeStyles[size];

  return (
    <div
      className={cx(
        'inline-flex items-center overflow-hidden transition-colors',
        variant === 'bordered'
          ? 'border border-outline-variant/60 bg-surface-container-lowest'
          : 'border border-transparent bg-surface-container-low shadow-inner',
        currentSize.container,
        className,
      )}
    >
      <button
        aria-label="Decrease quantity"
        className={cx(
          'flex h-full items-center justify-center font-semibold text-on-surface-variant select-none',
          'transition-[background-color,transform] duration-150 ease-maevelle active:scale-95',
          'hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-focus',
          'disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100',
          currentSize.btn,
        )}
        disabled={disabled || value <= min}
        onClick={handleDecrement}
        type="button"
      >
        -
      </button>

      <span
        aria-live="polite"
        className={cx(
          'text-center font-label-md font-mono font-semibold text-on-surface tabular-nums select-none',
          currentSize.val,
        )}
      >
        {value}
      </span>

      <button
        aria-label="Increase quantity"
        className={cx(
          'flex h-full items-center justify-center font-semibold text-on-surface-variant select-none',
          'transition-[background-color,transform] duration-150 ease-maevelle active:scale-95',
          'hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-focus',
          'disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100',
          currentSize.btn,
        )}
        disabled={disabled || value >= max}
        onClick={handleIncrement}
        type="button"
      >
        +
      </button>
    </div>
  );
}
