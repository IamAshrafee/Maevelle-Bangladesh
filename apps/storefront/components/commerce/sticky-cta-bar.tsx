'use client';

import { cx } from '@/components/ui/classnames';
import { ArrowRightIcon } from '@/components/ui/icons';
import { Money } from '@/components/commerce/price';

export type StickyCtaBarProps = {
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onAction?: () => void;
  price: number | string;
};

export function StickyCtaBar({
  buttonLabel = 'Continue to Secure Checkout',
  className,
  disabled = false,
  loading = false,
  onAction,
  price,
}: StickyCtaBarProps) {
  return (
    <div
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-container-lowest/95 p-3 pb-safe shadow-[0_-8px_24px_rgba(158,42,75,0.08)] backdrop-blur-xl',
        className,
      )}
    >
      <div className="mx-auto max-w-lg">
        <button
          className={cx(
            'flex h-13 w-full items-center justify-between rounded-xl bg-primary px-4 font-headline-sm font-semibold text-white shadow-md',
            'transition-[background-color,transform] duration-150 ease-maevelle active:scale-98 hover:bg-primary-hover',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
          )}
          disabled={disabled || loading}
          onClick={onAction}
          type="button"
        >
          <span className="font-price-md font-mono font-bold tabular-nums text-white">
            <Money amount={price} />
          </span>
          <span className="flex items-center gap-1.5 text-white">
            <span>{buttonLabel}</span>
            <ArrowRightIcon size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}
