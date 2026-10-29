export type PriceStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export type ScheduleCategory = 'LIVE_ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'DRAFT' | 'ARCHIVED';

export interface VariantPriceItem {
  readonly priceDefinitionId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly variantTitle: string | null;
  readonly sku: string;
  readonly amount: string;
  readonly compareAtAmount: string | null;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: PriceStatus;
  readonly version: number;
}

export interface CatalogProductSummary {
  readonly id: string;
  readonly title: string;
  readonly handle?: string;
}

export interface CatalogVariantOption {
  readonly id: string;
  readonly sku: string;
  readonly title: string | null;
  readonly status: string;
  readonly latestAcquisitionCost?: {
    readonly amount: string;
    readonly currency: string;
  } | null;
  readonly estimatedCostAmount?: string | null;
}

export interface CatalogProductDetail extends CatalogProductSummary {
  readonly variants: readonly CatalogVariantOption[];
}

/**
 * Classifies a price definition into its authoritative operational state based on
 * database status and temporal validity.
 */
export function getScheduleCategory(
  item: Pick<VariantPriceItem, 'status' | 'effectiveFrom' | 'effectiveTo'>,
  now = new Date(),
): ScheduleCategory {
  if (item.status === 'ARCHIVED') return 'ARCHIVED';
  if (item.status === 'DRAFT') return 'DRAFT';

  // Status is ACTIVE: check time window
  const from = new Date(item.effectiveFrom);
  const to = item.effectiveTo ? new Date(item.effectiveTo) : null;

  if (from > now) {
    return 'UPCOMING';
  }
  if (to && to <= now) {
    return 'EXPIRED';
  }
  return 'LIVE_ACTIVE';
}

/**
 * Calculates discount percentage if compareAtAmount > amount.
 */
export function calculateDiscountPercent(
  amount: string,
  compareAtAmount: string | null | undefined,
): number | null {
  if (!compareAtAmount) return null;
  const sell = Number(amount);
  const compare = Number(compareAtAmount);
  if (!Number.isFinite(sell) || !Number.isFinite(compare) || sell <= 0 || compare <= sell) {
    return null;
  }
  return Math.round(((compare - sell) / compare) * 100);
}

/**
 * Formats a date range into a concise human-readable schedule string.
 */
export function formatScheduleWindow(
  effectiveFrom: string,
  effectiveTo: string | null,
): { primary: string; secondary?: string } {
  const fromDate = new Date(effectiveFrom);
  const toDate = effectiveTo ? new Date(effectiveTo) : null;
  const now = new Date();

  const fromFormatted = fromDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: fromDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  if (!toDate) {
    return {
      primary: `From ${fromFormatted}`,
      secondary: 'Open-ended (No expiry)',
    };
  }

  const toFormatted = toDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: toDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  return {
    primary: `${fromFormatted} → ${toFormatted}`,
    secondary: `Ends ${toDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
  };
}

