'use client';

import { useRouter } from 'next/navigation';

import { HeartIcon, VerifiedIcon } from '@/components/ui/icons';
import type { PlacedOrderSummary } from '../types';

export interface CheckoutSuccessModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly orderSummary: PlacedOrderSummary | null;
}

export function CheckoutSuccessModal({
  isOpen,
  onClose,
  orderSummary,
}: CheckoutSuccessModalProps) {
  const router = useRouter();

  if (!isOpen || !orderSummary) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-6 shadow-2xl flex flex-col items-center text-center border border-border-subtle animate-in zoom-in-95 duration-200">
        {/* Heart Icon Circle */}
        <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-secondary-fixed text-primary">
          <HeartIcon className="animate-pulse" filled size={32} />
        </div>

        {/* Header */}
        <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-secondary">
          Dhanyabad! Order Placed
        </span>
        <h3 className="mt-1 font-serif text-2xl font-semibold text-on-surface">
          Thank you, {orderSummary.customerName}
        </h3>
        <p className="mt-2 text-xs text-on-surface-variant leading-relaxed">
          Your Maevelle bespoke parcel{' '}
          <span className="font-bold text-primary font-mono">{orderSummary.orderId}</span> has been
          received. Our team will verify shortly via SMS.
        </p>

        {/* Order Details Breakdown Box */}
        <div className="my-4 flex w-full flex-col gap-1.5 rounded-xl bg-surface-container-low p-3.5 text-left text-xs text-on-surface-variant border border-border-subtle">
          <div className="flex justify-between">
            <span>Delivery Mode:</span>
            <span className="font-semibold text-on-surface text-right">
              {orderSummary.deliveryZoneLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Payment Method:</span>
            <span className="font-semibold text-on-surface text-right">
              {orderSummary.paymentMethodLabel}
            </span>
          </div>
          {orderSummary.transactionId ? (
            <div className="flex justify-between items-center">
              <span>Transaction ID:</span>
              <span className="font-mono font-bold text-primary text-right bg-secondary-fixed/50 px-2 py-0.5 rounded text-[11px]">
                {orderSummary.transactionId}
              </span>
            </div>
          ) : null}
          <div className="my-1 h-px w-full bg-border-subtle" />
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-on-surface">Total BDT:</span>
            <span className="font-mono text-base font-bold text-primary tabular-nums">
              {orderSummary.totalFormatted}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col w-full gap-2">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-sans text-xs font-semibold shadow-sm hover:bg-primary-hover active:scale-95 transition-colors duration-150 transition-transform"
            onClick={() => {
              onClose();
              router.push('/');
            }}
            type="button"
          >
            <span>Continue Shopping</span>
            <VerifiedIcon size={16} />
          </button>

          <button
            className="h-10 w-full rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface hover:bg-surface-container active:scale-95 transition-colors duration-150 transition-transform"
            onClick={() => {
              onClose();
              router.push('/orders');
            }}
            type="button"
          >
            Track Order Status
          </button>
        </div>
      </div>
    </div>
  );
}
