'use client';

import { VerifiedIcon, SupportAgentIcon, WhatsAppIcon } from '@/components/ui/icons';

export function OrderTrackReassurance() {
  return (
    <section className="w-full flex flex-col gap-3.5">
      {/* Doorstep Inspection Policy */}
      <div className="p-4 rounded-2xl bg-surface-container-low border border-border-subtle/80 flex items-start gap-3.5 shadow-xs">
        <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <VerifiedIcon size={18} />
        </div>
        <div>
          <h4 className="font-sans text-xs sm:text-sm font-semibold text-on-surface">
            Doorstep Inspection Policy
          </h4>
          <p className="font-sans text-xs text-on-surface-variant mt-1 leading-relaxed">
            You are welcome to inspect your velvet jewelry box upon rider arrival before sharing your delivery OTP. Maevelle ensures 100% peace of mind across all 64 districts.
          </p>
        </div>
      </div>

      {/* Urgent Assistance / WhatsApp Concierge */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-lowest shadow-sm border border-border-subtle flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center shrink-0">
              <SupportAgentIcon size={18} />
            </div>
            <div>
              <h4 className="font-sans text-xs sm:text-sm font-semibold text-on-surface">
                Need Urgent Assistance?
              </h4>
              <p className="font-sans text-[11px] text-on-surface-variant">
                Maevelle Client Experience Desk
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 font-sans text-xs text-primary font-bold px-2 py-0.5 rounded-full bg-primary-fixed/60">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Online
          </span>
        </div>

        <a
          className="h-12 w-full rounded-xl bg-surface-container-high text-on-surface font-sans text-xs sm:text-sm font-semibold flex items-center justify-center gap-2.5 hover:bg-surface-container-highest active:scale-[0.98] transition-all duration-150 shadow-xs border border-border-subtle"
          href="https://wa.me/8801894623835"
          rel="noopener noreferrer"
          target="_blank"
        >
          <WhatsAppIcon className="text-primary" size={18} />
          <span>WhatsApp Concierge (+880 1894-MAEVELLE)</span>
        </a>
      </div>
    </section>
  );
}
