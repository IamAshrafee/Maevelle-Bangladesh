'use client';

import type { ConsignmentData } from '../types';
import { ShoppingBagIcon, ReceiptIcon } from '@/components/ui/icons';

export interface OrderTrackParcelContentsProps {
  readonly consignment: ConsignmentData;
}

export function OrderTrackParcelContents({
  consignment,
}: OrderTrackParcelContentsProps) {
  const itemCountLabel =
    consignment.items.length === 1 ? '1 Heirloom' : `${consignment.items.length} Heirlooms`;

  return (
    <section className="w-full bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-border-subtle flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border-subtle/80">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShoppingBagIcon size={18} />
          </div>
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            Parcel Contents
          </h3>
        </div>
        <span className="font-sans text-xs text-on-surface-variant font-medium">
          {itemCountLabel}
        </span>
      </div>

      {/* Items List */}
      <div className="flex flex-col gap-2.5">
        {consignment.items.map((item) => (
          <div
            className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-surface-container-low border border-border-subtle/70"
            key={item.id}
          >
            {/* Image Thumbnail */}
            <div className="size-14 sm:size-16 rounded-lg overflow-hidden bg-surface-container shrink-0 border border-border-subtle/60 flex items-center justify-center">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={item.title}
                  className="size-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                  src={item.imageUrl}
                />
              ) : null}
              <div
                className={`size-full items-center justify-center text-outline ${
                  item.imageUrl ? 'hidden' : 'flex'
                }`}
              >
                <ReceiptIcon size={20} />
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h4 className="font-sans text-xs sm:text-sm text-on-surface font-semibold truncate">
                {item.title}
              </h4>
              <p className="font-sans text-[11px] text-on-surface-variant truncate mt-0.5">
                {item.variantDescription}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="font-sans text-[11px] text-on-surface-variant">
                  Qty: {item.quantity}
                </span>
                <span className="font-mono text-xs sm:text-sm font-bold text-primary tabular-nums">
                  ৳{item.netPrice.toLocaleString('en-BD')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement Breakdown */}
      <div className="pt-2 px-1 flex items-center justify-between border-t border-border-subtle/80">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-secondary-container" />
          <span className="font-sans text-xs text-on-surface-variant font-medium">
            {consignment.paymentMethodText}
          </span>
        </div>

        <div className="text-right">
          <span className="font-sans text-[11px] text-on-surface-variant block">
            Total Settled
          </span>
          <span className="font-mono text-base sm:text-lg text-on-surface font-bold tabular-nums">
            ৳{consignment.totalSettled.toLocaleString('en-BD')}
          </span>
        </div>
      </div>
    </section>
  );
}
