import type { ProductRatingSummaryDto } from '@maevelle/contracts';
import { StarIcon, TruckIcon } from '@/components/ui/icons';
import { formatTaka } from './pdp-money';

function savingsPercent(price: string, compareAt: string): number {
  const p = Number(price);
  const c = Number(compareAt);
  if (!c || c <= p) return 0;
  return Math.round(((c - p) / c) * 100);
}

export interface PriceDisplay {
  readonly type: 'exact';
  readonly amount: string;
  readonly compareAtAmount: string | null;
  readonly currency: string;
}

export interface PdpCommercialHeaderProps {
  readonly title: string;
  readonly price: PriceDisplay | null;
  readonly ratingSummary?: ProductRatingSummaryDto | null;
  readonly isAvailable: boolean;
  readonly unselectedAxesCount: number;
}

export function PdpCommercialHeader({
  title,
  price,
  ratingSummary,
  isAvailable,
  unselectedAxesCount,
}: PdpCommercialHeaderProps) {
  const avg = Number(
    ratingSummary?.formattedAverage ?? ratingSummary?.averageRating ?? 0,
  ).toFixed(1);
  const count = ratingSummary?.ratingCount ?? 0;
  const hasSavings =
    price?.type === 'exact' &&
    price.compareAtAmount &&
    Number(price.compareAtAmount) > Number(price.amount);
  const savings = hasSavings
    ? savingsPercent(price!.amount, price!.compareAtAmount!)
    : 0;

  return (
    <div className="px-4 pt-4 flex flex-col gap-1.5">
      {/* 1. Reviews indicator badge at the top */}
      <div className="flex items-center gap-2">
        {count > 0 ? (
          <a
            href="#reviews-mobile"
            className="inline-flex items-center gap-1.5 bg-[#faf2ee] hover:bg-[#eee7e3] px-2.5 py-1 rounded-full no-underline transition-colors"
            aria-label={`Rated ${avg} out of 5, ${count} reviews`}
          >
            <StarIcon size={13} className="text-[#9e2a4b] fill-current" />
            <span className="text-[12px] font-bold text-[#1e1b19]">{avg}</span>
            <span className="text-[11px] text-[#574144]">({count} reviews)</span>
          </a>
        ) : (
          <a
            href="#reviews-mobile"
            className="inline-flex items-center gap-1.5 bg-[#faf2ee] hover:bg-[#eee7e3] px-2.5 py-1 rounded-full no-underline text-primary text-[11px] font-semibold transition-colors"
          >
            <StarIcon size={13} className="text-[#9e2a4b]" />
            <span>Be the first reviewer</span>
          </a>
        )}
      </div>

      {/* 2. Title positioned closely underneath the review badge */}
      <h1 className="text-[22px] sm:text-[24px] leading-snug font-semibold font-serif text-[#1e1b19] tracking-tight">
        {title}
      </h1>

      {/* Price hierarchy */}
      {price?.type === 'exact' ? (
        <div className="flex items-baseline gap-2.5 pt-1 flex-wrap">
          <span className="text-[22px] font-bold leading-tight text-[#9e2a4b] tabular-nums font-mono">
            {formatTaka(price.amount, price.currency)}
          </span>
          {price.compareAtAmount && Number(price.compareAtAmount) > Number(price.amount) && (
            <span className="text-[16px] font-bold text-[#8a7174] line-through tabular-nums font-mono">
              {formatTaka(price.compareAtAmount, price.currency)}
            </span>
          )}
          {savings > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">
              {savings}% OFF
            </span>
          )}
        </div>
      ) : null}

      {/* Dispatch status banner */}
      {(isAvailable || unselectedAxesCount === 0) && (
        <div className="flex items-center gap-2.5 mt-1 p-3 rounded-2xl bg-[#faf2ee] border border-border/40 text-on-surface">
          <div className="w-7 h-7 rounded-full bg-[#eee7e3] flex items-center justify-center text-primary shrink-0">
            <TruckIcon size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[#1e1b19]">In Stock &amp; Ready to Ship</span>
            <span className="text-[12px] text-[#574144] leading-snug">
              Online Exclusive &middot; Dispatches within 24 hours across Bangladesh
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
