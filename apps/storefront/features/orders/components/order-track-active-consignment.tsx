'use client';

import { useState } from 'react';
import type { ConsignmentData } from '../types';
import {
  ClockIcon,
  TruckIcon,
  CopyIcon,
  CheckIcon,
  BikeIcon,
  PhoneIcon,
  CheckCircleIcon,
} from '@/components/ui/icons';

export interface OrderTrackActiveConsignmentProps {
  readonly consignment: ConsignmentData;
}

export function OrderTrackActiveConsignment({
  consignment,
}: OrderTrackActiveConsignmentProps) {
  const [copiedWaybill, setCopiedWaybill] = useState(false);

  const handleCopyWaybill = async () => {
    try {
      await navigator.clipboard.writeText(consignment.trackingWaybill);
      setCopiedWaybill(true);
      setTimeout(() => setCopiedWaybill(false), 2000);
    } catch {
      setCopiedWaybill(true);
      setTimeout(() => setCopiedWaybill(false), 2000);
    }
  };

  const formattedOrderNumber = consignment.orderNumber.startsWith('#')
    ? consignment.orderNumber
    : `#${consignment.orderNumber}`;

  return (
    <section
      className="w-full bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-5 transition-shadow"
      id="status-card"
    >
      {/* Header of Status Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border-subtle/80">
        <div>
          <span className="font-sans text-[10px] sm:text-xs font-bold uppercase tracking-wider text-secondary block">
            Active Consignment
          </span>
          <h3 className="font-serif text-lg sm:text-xl font-bold text-on-surface mt-0.5">
            Order {formattedOrderNumber}
          </h3>
          {consignment.customerName && (
            <p className="font-sans text-xs text-on-surface-variant">
              Recipient: {consignment.customerName} • {consignment.deliveryAddress}
            </p>
          )}
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-fixed text-primary font-sans text-xs font-semibold self-start sm:self-center shrink-0 border border-primary-fixed-dim/50 shadow-xs">
          {consignment.isPulseActive && (
            <span className="size-2 rounded-full bg-primary animate-pulse" />
          )}
          <span>{consignment.statusBadgeText}</span>
        </div>
      </div>

      {/* ETA & Courier Highlights Bento */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
        {/* Estimated Arrival Tile */}
        <div className="p-3 sm:p-4 rounded-xl bg-surface-container-low border border-border-subtle/70 flex flex-col justify-between">
          <span className="font-sans text-[11px] sm:text-xs text-on-surface-variant flex items-center gap-1.5 font-medium">
            <ClockIcon className="text-primary shrink-0" size={15} />
            Estimated Arrival
          </span>
          <div className="mt-2">
            <p className="font-serif text-base sm:text-lg text-on-surface font-bold leading-tight">
              {consignment.estimatedArrivalTitle}
            </p>
            <p className="font-sans text-xs text-on-surface-variant mt-0.5">
              {consignment.estimatedArrivalSubtitle}
            </p>
          </div>
        </div>

        {/* Logistics Partner Tile */}
        <div className="p-3 sm:p-4 rounded-xl bg-surface-container-low border border-border-subtle/70 flex flex-col justify-between">
          <span className="font-sans text-[11px] sm:text-xs text-on-surface-variant flex items-center gap-1.5 font-medium">
            <TruckIcon className="text-secondary shrink-0" size={15} />
            Logistics Partner
          </span>
          <div className="mt-2">
            <p className="font-sans text-xs sm:text-sm text-on-surface font-bold leading-tight truncate">
              {consignment.carrierName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-[11px] text-on-surface-variant truncate">
                {consignment.trackingWaybill}
              </span>
              <button
                aria-label="Copy Tracking Waybill"
                className="size-6 flex items-center justify-center text-primary hover:bg-surface-container-high rounded transition-colors cursor-pointer shrink-0"
                onClick={handleCopyWaybill}
                title="Copy tracking code"
                type="button"
              >
                {copiedWaybill ? (
                  <CheckIcon className="text-success" size={13} />
                ) : (
                  <CopyIcon size={13} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Progress Stepper */}
      <div className="pt-2">
        <h4 className="font-sans text-xs sm:text-sm text-on-surface font-semibold mb-4 flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          Journey Progress
        </h4>

        <div className="relative pl-6 sm:pl-7 space-y-6">
          {/* Connecting Line */}
          <div className="absolute left-[11px] sm:left-[13px] top-2 bottom-3 w-0.5 bg-surface-container-high" />

          {/* Stepper Nodes */}
          {consignment.timeline.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            const isPending = step.status === 'pending';

            return (
              <div
                className={`relative flex flex-col transition-opacity ${
                  isPending ? 'opacity-60' : 'opacity-100'
                }`}
                key={`step-${idx}-${step.title}`}
              >
                {/* Node Indicator */}
                {isCompleted ? (
                  <div className="absolute -left-[23px] sm:-left-[25px] top-0.5 size-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xs">
                    <CheckIcon size={13} />
                  </div>
                ) : isActive ? (
                  <div className="absolute -left-[23px] sm:-left-[25px] top-0.5 size-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm ring-4 ring-primary-fixed">
                    <span className="size-2 rounded-full bg-on-primary animate-pulse" />
                  </div>
                ) : (
                  <div className="absolute -left-[23px] sm:-left-[25px] top-0.5 size-6 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center">
                    <span className="size-1.5 rounded-full bg-outline" />
                  </div>
                )}

                {/* Step Content */}
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`font-sans text-xs sm:text-sm font-semibold ${
                      isActive ? 'text-primary' : 'text-on-surface'
                    }`}
                  >
                    {step.title}
                  </p>
                  <span
                    className={`font-sans text-[11px] shrink-0 ${
                      isActive ? 'text-primary font-bold' : 'text-on-surface-variant'
                    }`}
                  >
                    {step.timestamp}
                  </span>
                </div>

                <p className="font-sans text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  {step.description}
                </p>

                {/* Optional Rider Contact Callout */}
                {step.riderInfo ? (
                  <div className="mt-2.5 p-2.5 sm:p-3 rounded-xl bg-surface-container-low border border-border-subtle/80 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <BikeIcon size={16} />
                      </div>
                      <span className="font-sans text-xs text-on-surface font-medium truncate">
                        Rider Contact: {step.riderInfo.phone}
                      </span>
                    </div>

                    <a
                      aria-label={`Call Rider ${step.riderInfo.name}`}
                      className="size-8 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-hover active:scale-95 transition-all shadow-xs shrink-0"
                      href={`tel:${step.riderInfo.phone.replace(/[^0-9]/g, '')}`}
                    >
                      <PhoneIcon size={15} />
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
