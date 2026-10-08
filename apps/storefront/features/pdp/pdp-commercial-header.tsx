import type { ProductRatingSummaryDto } from '@maevelle/contracts';
import { StarIcon, TruckIcon } from '@/components/ui/icons';

function money(amount: string, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

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
    <div className="px-4 pt-4 flex flex-col gap-2">
      {/* Brand line + rating */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#8a7174]">
          Maevelle Atelier&nbsp;•&nbsp;Dhaka
        </span>
        {count > 0 && (
          <a
            href="#reviews"
            className="flex items-center gap-1 bg-[#eee7e3] px-2 py-0.5 rounded-full no-underline"
            aria-label={`Rated ${avg} out of 5, ${count} reviews`}
          >
            <StarIcon size={14} className="text-[#9e2a4b]" />
            <span className="text-[13px] font-semibold text-[#1e1b19]">{avg}</span>
            <span className="text-[12px] text-[#574144]">({count})</span>
          </a>
        )}
      </div>

      {/* Title */}
      <h1 className="text-[22px] leading-tight font-semibold font-serif text-[#1e1b19] tracking-tight">
        {title}
      </h1>

      {/* Price hierarchy */}
      {price?.type === 'exact' ? (
        <div className="flex items-baseline gap-2.5 pt-1 flex-wrap">
          <span className="text-[20px] font-bold leading-tight text-[#9e2a4b] tabular-nums">
            {money(price.amount, price.currency)}
          </span>
          {price.compareAtAmount && Number(price.compareAtAmount) > Number(price.amount) && (
            <span className="text-[15px] font-bold text-[#8a7174] line-through tabular-nums">
              {money(price.compareAtAmount, price.currency)}
            </span>
          )}
          {savings > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#ffd9e0] text-[#740734]">
              SAVE {savings}%
            </span>
          )}
          <span className="ml-auto text-[12px] text-[#574144]">Tax &amp; VAT incl.</span>
        </div>
      ) : null}

      {/* Dispatch status banner */}
      {(isAvailable || unselectedAxesCount === 0) && (
        <div className="flex items-center gap-2 mt-1 p-2.5 rounded-xl bg-[#faf2ee]">
          <div className="w-7 h-7 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0">
            <TruckIcon size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[#1e1b19]">Ready to Dispatch</span>
            <span className="text-[12px] text-[#574144]">
              Handcrafted in Banani atelier &bull; Ships within 24 hrs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
