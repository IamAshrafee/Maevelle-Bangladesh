'use client';

import { useState } from 'react';
import { TagIcon, HistoryIcon, ArrowRightIcon, SearchIcon } from '@/components/ui/icons';

export interface OrderTrackLookupCardProps {
  readonly orderId: string;
  readonly phone: string;
  readonly onOrderIdChange: (val: string) => void;
  readonly onPhoneChange: (val: string) => void;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly onLoadDemo: () => void;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
}

export function OrderTrackLookupCard({
  orderId,
  phone,
  onOrderIdChange,
  onPhoneChange,
  onSubmit,
  onLoadDemo,
  isLoading,
  errorMessage,
}: OrderTrackLookupCardProps) {
  const [highlightDemo, setHighlightDemo] = useState(false);

  const handleDemoClick = () => {
    setHighlightDemo(true);
    onLoadDemo();
    setTimeout(() => setHighlightDemo(false), 600);
  };

  return (
    <section className="w-full bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-border-subtle flex flex-col gap-4">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <SearchIcon size={18} />
          </div>
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            Order Lookup
          </h3>
        </div>
        <span className="font-sans text-xs text-on-surface-variant flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Real-time sync
        </span>
      </div>

      {/* Quick Autofill Banner / Pill */}
      <div
        className={`flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl bg-surface-container-low border border-border-subtle/70 transition-colors ${
          highlightDemo ? 'ring-2 ring-primary/40 bg-primary-fixed/20' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <HistoryIcon size={15} />
          </div>
          <div className="min-w-0">
            <p className="font-sans text-xs font-semibold text-on-surface truncate">
              Recent: #MB-84291
            </p>
            <p className="font-sans text-[11px] text-on-surface-variant truncate">
              Nusrat Jahan • Banani Delivery
            </p>
          </div>
        </div>

        <button
          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-sans text-xs font-semibold hover:bg-primary-fixed/80 active:scale-95 transition-all duration-150 cursor-pointer"
          onClick={handleDemoClick}
          type="button"
        >
          Load
        </button>
      </div>

      {/* Error Message */}
      {errorMessage ? (
        <div
          className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans leading-relaxed animate-in fade-in"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Lookup Form */}
      <form className="flex flex-col gap-3.5" onSubmit={onSubmit}>
        {/* Order ID Field */}
        <div>
          <label
            className="block font-sans text-xs sm:text-sm font-semibold text-on-surface mb-1.5"
            htmlFor="order-track-id"
          >
            Order Identifier / ID
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-on-surface-variant/70 flex items-center justify-center pointer-events-none">
              <TagIcon size={18} />
            </div>
            <input
              className="w-full h-12 pl-10 pr-3 rounded-xl bg-surface-container-low text-on-surface font-sans text-sm placeholder:text-outline border border-border-subtle/80 focus:outline-none focus:border-primary focus:bg-surface-container-lowest transition-colors"
              id="order-track-id"
              name="orderId"
              onChange={(e) => onOrderIdChange(e.target.value)}
              placeholder="e.g. MB-84291 or ORD-2026-..."
              required
              type="text"
              value={orderId}
            />
          </div>
          <p className="font-sans text-[11px] text-on-surface-variant mt-1">
            Found on your SMS receipt or confirmation email
          </p>
        </div>

        {/* Phone Number Field with Country Code */}
        <div>
          <label
            className="block font-sans text-xs sm:text-sm font-semibold text-on-surface mb-1.5"
            htmlFor="order-track-phone"
          >
            Phone Number
          </label>
          <div className="flex items-center gap-2">
            <div className="h-12 px-3 rounded-xl bg-surface-container-low border border-border-subtle/80 flex items-center justify-center shrink-0">
              <span className="font-mono text-xs sm:text-sm font-bold text-on-surface">
                🇧🇩 +880
              </span>
            </div>
            <div className="relative flex-1 flex items-center min-w-0">
              <input
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-sans text-sm placeholder:text-outline border border-border-subtle/80 focus:outline-none focus:border-primary focus:bg-surface-container-lowest transition-colors"
                id="order-track-phone"
                name="phone"
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="01712-345678"
                required
                type="tel"
                value={phone}
              />
            </div>
          </div>
          <p className="font-sans text-[11px] text-on-surface-variant mt-1">
            Used for courier OTP &amp; delivery rider contact
          </p>
        </div>

        {/* Submit CTA Button */}
        <button
          className="w-full h-12 sm:h-[50px] rounded-xl bg-primary text-on-primary font-sans text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-primary-hover active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={isLoading}
          type="submit"
        >
          <span>{isLoading ? 'Verifying Atelier Consignment…' : 'Track Parcel'}</span>
          <ArrowRightIcon size={18} />
        </button>
      </form>
    </section>
  );
}
