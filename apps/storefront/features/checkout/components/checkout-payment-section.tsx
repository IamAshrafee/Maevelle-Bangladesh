'use client';

import { LockIcon, PackageCheckIcon, ShieldCheckIcon } from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutPaymentSectionProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutPaymentSection({ checkout }: CheckoutPaymentSectionProps) {
  const { paymentMethod, setPaymentMethod } = checkout;

  return (
    <section aria-labelledby="paymentHeading" className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
            3
          </span>
          <h2
            className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-on-surface"
            id="paymentHeading"
          >
            Payment Method
          </h2>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <LockIcon size={13} />
          Safe & Secure
        </span>
      </div>

      {/* Options List */}
      <div className="flex flex-col gap-2.5">
        {/* Option 1: bKash Manual Mobile Banking */}
        <label
          className={`relative flex flex-col p-4 rounded-xl cursor-pointer transition-colors duration-150 border ${
            paymentMethod === 'bkash'
              ? 'bg-secondary-fixed/20 border-primary ring-1 ring-primary/20 shadow-sm'
              : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/60 shadow-xs'
          }`}
          onClick={() => setPaymentMethod('bkash')}
        >
          <div className="flex items-start gap-3">
            <input
              checked={paymentMethod === 'bkash'}
              className="mt-1 size-4 accent-primary cursor-pointer shrink-0"
              name="paymentOption"
              onChange={() => setPaymentMethod('bkash')}
              type="radio"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-sm font-semibold text-on-surface">
                    bKash Manual Payment
                  </span>
                  <span className="size-2 rounded-full bg-[#E2136E]" />
                </div>
                <span className="rounded-full bg-[#E2136E]/10 px-2 py-0.5 text-[10px] font-bold text-[#E2136E] border border-[#E2136E]/20">
                  Manual Verification
                </span>
              </div>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                Send money to Maevelle bKash account and submit your Transaction ID (TrxID) in Step 2.
              </p>
            </div>
          </div>

          {/* Micro Prompt when selected */}
          {paymentMethod === 'bkash' ? (
            <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-primary-fixed/40 p-2.5 border border-primary-fixed/60 animate-in fade-in duration-150">
              <ShieldCheckIcon className="text-primary shrink-0" size={16} />
              <p className="text-xs text-on-primary-fixed-variant leading-snug">
                Step 2 will provide the official bKash account number and 1-click TrxID submission form.
              </p>
            </div>
          ) : null}
        </label>

        {/* Option 2: Nagad Manual Mobile Banking */}
        <label
          className={`relative flex flex-col p-4 rounded-xl cursor-pointer transition-colors duration-150 border ${
            paymentMethod === 'nagad'
              ? 'bg-secondary-fixed/20 border-primary ring-1 ring-primary/20 shadow-sm'
              : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/60 shadow-xs'
          }`}
          onClick={() => setPaymentMethod('nagad')}
        >
          <div className="flex items-start gap-3">
            <input
              checked={paymentMethod === 'nagad'}
              className="mt-1 size-4 accent-primary cursor-pointer shrink-0"
              name="paymentOption"
              onChange={() => setPaymentMethod('nagad')}
              type="radio"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-sm font-semibold text-on-surface">
                    Nagad Manual Payment
                  </span>
                  <span className="size-2 rounded-full bg-[#F7931E]" />
                </div>
                <span className="rounded-full bg-[#F7931E]/10 px-2 py-0.5 text-[10px] font-bold text-[#F7931E] border border-[#F7931E]/20">
                  Manual Verification
                </span>
              </div>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                Send money to Maevelle Nagad account and submit your Transaction ID (TrxID) in Step 2.
              </p>
            </div>
          </div>

          {/* Micro Prompt when selected */}
          {paymentMethod === 'nagad' ? (
            <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-primary-fixed/40 p-2.5 border border-primary-fixed/60 animate-in fade-in duration-150">
              <ShieldCheckIcon className="text-primary shrink-0" size={16} />
              <p className="text-xs text-on-primary-fixed-variant leading-snug">
                Step 2 will provide the official Nagad account number and 1-click TrxID submission form.
              </p>
            </div>
          ) : null}
        </label>

        {/* Option 3: Cash on Delivery (COD) */}
        <label
          className={`relative flex flex-col p-4 rounded-xl cursor-pointer transition-colors duration-150 border ${
            paymentMethod === 'cod'
              ? 'bg-secondary-fixed/20 border-primary ring-1 ring-primary/20 shadow-sm'
              : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/60 shadow-xs'
          }`}
          onClick={() => setPaymentMethod('cod')}
        >
          <div className="flex items-start gap-3">
            <input
              checked={paymentMethod === 'cod'}
              className="mt-1 size-4 accent-primary cursor-pointer shrink-0"
              name="paymentOption"
              onChange={() => setPaymentMethod('cod')}
              type="radio"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-sans text-sm font-semibold text-on-surface">
                  Cash on Delivery (COD)
                </span>
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                  ৳0 Extra Charge
                </span>
              </div>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                Pay with cash or mobile banking right at your doorstep. Open-box inspection supported before paying.
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-secondary text-xs font-semibold">
                <PackageCheckIcon size={15} />
                <span>Check product seal with courier rider</span>
              </div>
            </div>
          </div>
        </label>
      </div>
    </section>
  );
}
