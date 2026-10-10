import type {
  AnalyticsAvailabilityDto,
  AnalyticsCompletenessDto,
  AnalyticsFreshnessDto,
  AnalyticsGranularityDto,
  AnalyticsIntegrityFindingDto,
  AnalyticsMetricDefinitionDto,
  AnalyticsNormalizedQueryDto,
  AnalyticsOverviewDto,
  AnalyticsOverviewMetricDto,
  AnalyticsReportComparisonDto,
  AnalyticsReportEnvelopeDto,
  AnalyticsReportExportDto,
  AnalyticsReportKeyDto,
  AnalyticsReportPaginationDto,
  AnalyticsReportQueryDto,
  AssetsReportTotalsDto,
  CustomersReportBreakdownDto,
  DeliveryReportTotalsDto,
  FinanceReportTotalsDto,
  InventoryReportTotalsDto,
  InventorySnapshotItemDto,
  MarketingReportTotalsDto,
  NotificationsReportTotalsDto,
  OrdersReportBreakdownDto,
  OrdersReportTotalsDto,
  PaymentsReportTotalsDto,
  ProductsReportBreakdownDto,
  ReturnsReportTotalsDto,
  ReviewsReportTotalsDto,
  SalesReportSeriesDto,
  SalesReportTotalsDto,
  StorefrontReportTotalsDto,
  SupplyReportTotalsDto,
} from '@maevelle/contracts';

export type {
  AnalyticsAvailabilityDto,
  AnalyticsCompletenessDto,
  AnalyticsFreshnessDto,
  AnalyticsGranularityDto,
  AnalyticsIntegrityFindingDto,
  AnalyticsMetricDefinitionDto,
  AnalyticsNormalizedQueryDto,
  AnalyticsOverviewDto,
  AnalyticsOverviewMetricDto,
  AnalyticsReportComparisonDto,
  AnalyticsReportEnvelopeDto,
  AnalyticsReportExportDto,
  AnalyticsReportKeyDto,
  AnalyticsReportPaginationDto,
  AnalyticsReportQueryDto,
  AssetsReportTotalsDto,
  CustomersReportBreakdownDto,
  DeliveryReportTotalsDto,
  FinanceReportTotalsDto,
  InventoryReportTotalsDto,
  InventorySnapshotItemDto,
  MarketingReportTotalsDto,
  NotificationsReportTotalsDto,
  OrdersReportBreakdownDto,
  OrdersReportTotalsDto,
  PaymentsReportTotalsDto,
  ProductsReportBreakdownDto,
  ReturnsReportTotalsDto,
  ReviewsReportTotalsDto,
  SalesReportSeriesDto,
  SalesReportTotalsDto,
  StorefrontReportTotalsDto,
  SupplyReportTotalsDto,
};

export type AnalyticsViewKey =
  | 'overview'
  | 'sales'
  | 'products'
  | 'customers'
  | 'inventory'
  | 'finance'
  | 'supply'
  | 'delivery'
  | 'storefront'
  | 'marketing'
  | 'operations'
  | 'settings';

export type DateRangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM';

export interface DateRangeSelection {
  readonly preset: DateRangePreset;
  readonly from: string;
  readonly to: string;
  readonly granularity: AnalyticsGranularityDto;
  readonly currency: string;
}

export interface DestinationStatusDto {
  readonly providerCode: string;
  readonly name: string;
  readonly category: string;
  readonly status: 'CONNECTED' | 'EXTERNALLY_UNCONFIGURED' | 'DISABLED';
  readonly description: string;
  readonly browserTracking: {
    readonly status: string;
    readonly measurementId?: string | null;
    readonly pixelId?: string | null;
  };
  readonly serverTracking: {
    readonly status: string;
    readonly apiSecretConfigured?: boolean;
    readonly accessTokenConfigured?: boolean;
  };
  readonly eventDeduplication: {
    readonly status: string;
    readonly stableEventIdContract?: string;
    readonly sharedEventIdMapping?: string;
  };
  readonly notes: string;
}

/** Compute ISO date string YYYY-MM-DD in local time */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRangeFromPreset(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const today = toIsoDate(now);

  switch (preset) {
    case 'TODAY':
      return { from: today, to: today };
    case 'YESTERDAY': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const str = toIsoDate(yesterday);
      return { from: str, to: str };
    }
    case 'LAST_7_DAYS': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { from: toIsoDate(start), to: today };
    }
    case 'LAST_30_DAYS': {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return { from: toIsoDate(start), to: today };
    }
    case 'THIS_MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIsoDate(start), to: today };
    }
    case 'LAST_MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'THIS_YEAR': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toIsoDate(start), to: today };
    }
    case 'CUSTOM':
    default: {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return { from: toIsoDate(start), to: today };
    }
  }
}

/** Formats money in BDT with tabular nums */
export function formatAnalyticsMoney(
  value: string | number | null | undefined,
  currency = 'BDT',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(numeric)) return '—';

  const formatted = new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);

  return currency === 'BDT' ? `৳${formatted}` : `${formatted} ${currency}`;
}

/** Formats counts / integers */
export function formatAnalyticsCount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(numeric)) return '0';
  return new Intl.NumberFormat('en-US').format(numeric);
}

/** Formats percentage values with optional decimals */
export function formatAnalyticsPercent(
  value: string | number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(numeric)) return '—';
  // If the value is a ratio between 0 and 1, convert to 0-100%
  const percentage = numeric > 1 ? numeric : numeric * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/** Formats hours / duration */
export function formatAnalyticsDuration(hours: string | number | null | undefined): string {
  if (hours === null || hours === undefined || hours === '') return '—';
  const numeric = typeof hours === 'number' ? hours : Number.parseFloat(hours);
  if (Number.isNaN(numeric)) return '—';
  if (numeric < 24) {
    return `${numeric.toFixed(1)} hrs`;
  }
  const days = (numeric / 24).toFixed(1);
  return `${days} days (${numeric.toFixed(0)} hrs)`;
}

export type TrendDirection = 'positive' | 'negative' | 'neutral';

export interface ComparisonDelta {
  readonly percentage: number | null;
  readonly text: string;
  readonly tone: TrendDirection;
}

/**
 * Computes semantic comparison change between current and previous period.
 * When isLowerBetter is true (e.g. Return Rate, Delivery Failures, RTO), an increase is negative!
 */
export function calculateComparisonChange(
  current: number | string | null | undefined,
  previous: number | string | null | undefined,
  isLowerBetter = false,
): ComparisonDelta {
  const curr = Number(current ?? 0);
  const prev = Number(previous ?? 0);

  if (Number.isNaN(curr) || Number.isNaN(prev)) {
    return { percentage: null, text: 'No prior data', tone: 'neutral' };
  }

  if (prev === 0) {
    if (curr === 0) {
      return { percentage: 0, text: '0% change', tone: 'neutral' };
    }
    return {
      percentage: null,
      text: 'New activity',
      tone: isLowerBetter ? 'negative' : 'positive',
    };
  }

  const change = ((curr - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const text = `${sign}${rounded}% vs prior`;

  let tone: TrendDirection = 'neutral';
  if (rounded > 0) {
    tone = isLowerBetter ? 'negative' : 'positive';
  } else if (rounded < 0) {
    tone = isLowerBetter ? 'positive' : 'negative';
  }

  return { percentage: rounded, text, tone };
}
