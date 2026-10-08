'use client';

import {
  CardGiftcardIcon,
  RotateCcwIcon,
  SparklesIcon,
  ThumbUpIcon,
  WhatsAppIcon,
} from '@/components/ui/icons';

export function CheckoutGuaranteeCard() {
  return (
    <section
      aria-labelledby="guaranteeHeading"
      className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-4 sm:p-5 border border-border-subtle"
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="text-primary shrink-0" size={20} />
        <h3
          className="font-serif text-base sm:text-lg font-semibold tracking-tight text-on-surface"
          id="guaranteeHeading"
        >
          The Maevelle Bangladesh Guarantee
        </h3>
      </div>

      {/* 3 Pillars Grid */}
      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        {/* Doorstep Check */}
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-container-lowest p-2.5 shadow-xs border border-border-subtle/50">
          <ThumbUpIcon className="text-secondary" size={20} />
          <span className="text-[11px] font-bold text-on-surface">Doorstep Check</span>
          <span className="text-[10px] text-on-surface-variant leading-tight">
            Inspect before final payment
          </span>
        </div>

        {/* 7-Day Return */}
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-container-lowest p-2.5 shadow-xs border border-border-subtle/50">
          <RotateCcwIcon className="text-secondary" size={20} />
          <span className="text-[11px] font-bold text-on-surface">7-Day Return</span>
          <span className="text-[10px] text-on-surface-variant leading-tight">
            Effortless exchange hotline
          </span>
        </div>

        {/* Luxury Box */}
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-container-lowest p-2.5 shadow-xs border border-border-subtle/50">
          <CardGiftcardIcon className="text-secondary" size={20} />
          <span className="text-[11px] font-bold text-on-surface">Luxury Box</span>
          <span className="text-[10px] text-on-surface-variant leading-tight">
            Atelier gift wrapping
          </span>
        </div>
      </div>

      {/* Concierge Assistance */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-center text-xs text-on-surface-variant">
        <span>Need assistance with your order? WhatsApp concierge:</span>
        <a
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          href="https://wa.me/8801894623835"
          rel="noreferrer"
          target="_blank"
        >
          <WhatsAppIcon size={14} />
          <span>+880 1894-MAEVELLE</span>
        </a>
      </div>
    </section>
  );
}
