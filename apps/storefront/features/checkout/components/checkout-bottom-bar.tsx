'use client';

import { ArrowRightIcon, VerifiedIcon } from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutBottomBarProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutBottomBar({ checkout }: CheckoutBottomBarProps) {
  const { ctaLabel, formattedTotal, handlePrimaryAction, isSubmitting } = checkout;

  return (
    <aside
      aria-label="Checkout action bar"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/92 backdrop-blur-xl shadow-[0_-8px_24px_rgba(30,27,25,0.08)] px-4 pt-3 pb-safe border-t border-border-subtle lg:hidden"
    >
      <div className="mx-auto flex max-w-md flex-col gap-2 pb-1">
        <div className="flex items-center justify-between gap-3">
          {/* Price display */}
          <div className="flex flex-col">
            <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-secondary">
              Final Payable
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-xl font-bold text-primary tabular-nums">
                {formattedTotal}
              </span>
              <span className="text-[11px] text-on-surface-variant">(VAT incl.)</span>
            </div>
          </div>

          {/* Dynamic CTA Button */}
          <button
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 sm:px-5 font-sans text-xs sm:text-sm font-semibold text-on-primary shadow-md hover:bg-primary-hover active:scale-[0.98] transition-colors duration-150 transition-transform disabled:opacity-50 shrink-0"
            disabled={isSubmitting}
            id="placeOrderBtn"
            onClick={handlePrimaryAction}
            type="button"
          >
            {isSubmitting ? (
              <>
                <span className="size-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span className="truncate max-w-[170px] sm:max-w-none">{ctaLabel}</span>
                <ArrowRightIcon className="shrink-0" size={16} />
              </>
            )}
          </button>
        </div>

        {/* Trust assurance note */}
        <div className="flex items-center justify-center gap-1.5 text-center">
          <VerifiedIcon className="text-primary shrink-0" size={13} />
          <span className="text-[10px] text-on-surface-variant">
            Authorized luxury retail. By completing, you accept Maevelle’s terms.
          </span>
        </div>
      </div>
    </aside>
  );
}
