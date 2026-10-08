'use client';

import { BANGLADESH_DISTRICTS } from '../types';
import { CardGiftcardIcon, ChevronDownIcon } from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutShippingSectionProps {
  readonly checkout: UseCheckoutReturn;
}

export function CheckoutShippingSection({ checkout }: CheckoutShippingSectionProps) {
  const { address, setAddress, handleZoneChange, handleDistrictChange } = checkout;

  return (
    <section aria-labelledby="shippingHeading" className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
            2
          </span>
          <h2
            className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-on-surface"
            id="shippingHeading"
          >
            Shipping Destination
          </h2>
        </div>
        <span className="text-xs font-semibold text-secondary">64 Districts Covered</span>
      </div>

      {/* Main Container */}
      <div className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-4 sm:p-5 shadow-sm border border-border-subtle">
        {/* Delivery Zone Cards */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-on-surface">
            Delivery Location & Speed <span className="text-primary">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Inside Dhaka Option */}
            <label
              className={`relative flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all border ${
                address.zone === 'dhaka'
                  ? 'bg-secondary-fixed/30 border-primary ring-1 ring-primary/20 shadow-xs'
                  : 'bg-surface-container-low border-border-subtle hover:bg-surface-container'
              }`}
              onClick={() => handleZoneChange('dhaka')}
            >
              <input
                checked={address.zone === 'dhaka'}
                className="mt-1 size-4 accent-primary cursor-pointer shrink-0"
                name="deliveryZone"
                onChange={() => handleZoneChange('dhaka')}
                type="radio"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-sm font-semibold text-on-surface">
                    Inside Dhaka Express
                  </span>
                  <span className="font-mono text-sm font-bold text-primary tabular-nums">৳70</span>
                </div>
                <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">
                  Delivered in 24–48 hours via Pathao / Paperfly
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary">
                    Fast Dispatch
                  </span>
                  <span className="text-[11px] text-on-surface-variant">Same-day pickup</span>
                </div>
              </div>
            </label>

            {/* Outside Dhaka / Nationwide Option */}
            <label
              className={`relative flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all border ${
                address.zone === 'outside'
                  ? 'bg-secondary-fixed/30 border-primary ring-1 ring-primary/20 shadow-xs'
                  : 'bg-surface-container-low border-border-subtle hover:bg-surface-container'
              }`}
              onClick={() => handleZoneChange('outside')}
            >
              <input
                checked={address.zone === 'outside'}
                className="mt-1 size-4 accent-primary cursor-pointer shrink-0"
                name="deliveryZone"
                onChange={() => handleZoneChange('outside')}
                type="radio"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-sm font-semibold text-on-surface">
                    Outside Dhaka / Nationwide
                  </span>
                  <span className="font-mono text-sm font-bold text-on-surface tabular-nums">
                    ৳130
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-on-surface-variant leading-relaxed">
                  Delivered in 2–4 days via Steadfast / RedX
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                    Doorstep Service
                  </span>
                  <span className="text-[11px] text-on-surface-variant">All 64 Zilas</span>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Zone / District Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-on-surface" htmlFor="districtSelect">
            Zone / District Area <span className="text-primary">*</span>
          </label>
          <div className="relative">
            <select
              className="h-12 w-full appearance-none rounded-lg bg-surface-container-low px-3.5 pr-10 text-sm text-on-surface border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              id="districtSelect"
              value={address.district}
              onChange={(e) => handleDistrictChange(e.target.value)}
            >
              <optgroup label="Inside Dhaka Divisions">
                {BANGLADESH_DISTRICTS.filter((d) => d.zone === 'dhaka').map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Nationwide Districts & Divisions">
                {BANGLADESH_DISTRICTS.filter((d) => d.zone === 'outside').map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDownIcon
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
              size={18}
            />
          </div>
        </div>

        {/* Street Address & Flat Details */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-on-surface" htmlFor="streetAddress">
            Street Address / House / Road / Flat <span className="text-primary">*</span>
          </label>
          <textarea
            autoComplete="shipping street-address"
            className="w-full rounded-lg bg-surface-container-low p-3.5 text-sm text-on-surface placeholder:text-outline border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y min-h-[72px]"
            id="streetAddress"
            placeholder="House 42, Road 7/A, Apt 4B, Dhanmondi R/A"
            required
            rows={2}
            value={address.streetAddress}
            onChange={(e) => setAddress((prev) => ({ ...prev, streetAddress: e.target.value }))}
          />
        </div>

        {/* Delivery Rider Special Note / Gift Message */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              className="flex items-center gap-1.5 text-xs font-semibold text-on-surface"
              htmlFor="deliveryNotes"
            >
              <CardGiftcardIcon className="text-secondary shrink-0" size={15} />
              <span>Special Note or Gift Packaging Request</span>
            </label>
            <span className="text-[11px] text-on-surface-variant">Complimentary</span>
          </div>
          <input
            className="h-11 w-full rounded-lg bg-surface-container-low px-3.5 text-sm text-on-surface placeholder:text-outline border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            id="deliveryNotes"
            placeholder="e.g. Call before ringing bell / Handwrite birthday wish"
            type="text"
            value={address.specialNote}
            onChange={(e) => setAddress((prev) => ({ ...prev, specialNote: e.target.value }))}
          />
        </div>
      </div>
    </section>
  );
}
