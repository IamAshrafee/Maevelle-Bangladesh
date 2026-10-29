'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, HelpCircle, ShieldCheck, Zap } from 'lucide-react';

export function DeliveryPricingInfoCard() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 sm:p-4 text-xs text-muted-foreground shadow-2xs">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-2 text-left font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <HelpCircle className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold">How Maevelle delivery pricing & resolution works</span>
        </button>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
          aria-label={expanded ? 'Collapse delivery pricing explanation' : 'Expand delivery pricing explanation'}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3.5 pt-3 border-t border-border/60 grid sm:grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <strong className="block text-foreground font-semibold flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" />
              <span>1. Priority & Hierarchy</span>
            </strong>
            <p className="text-[11px] leading-relaxed">
              Rules with higher priority evaluate first. For equal priority, specific local nodes (Thana / District)
              automatically beat country-level defaults.
            </p>
          </div>

          <div className="space-y-1">
            <strong className="block text-foreground font-semibold flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>2. Immutable Snapshots</span>
            </strong>
            <p className="text-[11px] leading-relaxed">
              When a customer completes checkout, the exact quote is snapshotted. Updating delivery rates
              will never alter past order amounts or accounting books.
            </p>
          </div>

          <div className="space-y-1">
            <strong className="block text-foreground font-semibold flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-primary" />
              <span>3. Server-Owned Rates</span>
            </strong>
            <p className="text-[11px] leading-relaxed">
              Delivery charges cannot be manipulated on the frontend. The server verifies and prices each
              cart directly from these authoritative rules.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

