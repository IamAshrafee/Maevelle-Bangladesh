export interface DeliveryPricingRule {
  readonly id: string;
  readonly name: string;
  readonly country_code: string;
  readonly geography_node_id: string | null;
  readonly geography_node_name: string | null;
  readonly geography_node_type: string | null;
  readonly geography_parent_name: string | null;
  readonly flat_amount: string;
  readonly currency_code: string;
  readonly priority: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface GeographyNodeOption {
  readonly id: string;
  readonly name: string;
  readonly localName: string | null;
  readonly nodeType: string;
  readonly parentName: string | null;
}

export interface DeliveryQuoteSimulation {
  readonly matched: boolean;
  readonly quote?: {
    readonly ruleId: string;
    readonly ruleName: string;
    readonly amount: string;
    readonly currency: string;
    readonly priority?: number | null;
    readonly geographyNodeName?: string | null;
    readonly geographyNodeType?: string | null;
    readonly geographyParentName?: string | null;
  };
  readonly reason?: string;
}

export type DeliveryPricingStatusTab = 'ALL' | 'ACTIVE' | 'INACTIVE';

export type DeliveryPricingScopeFilter = 'ALL' | 'NATIONWIDE' | 'GEOGRAPHIC';

export type DeliveryPricingSortOption =
  | 'PRIORITY_DESC'
  | 'AMOUNT_ASC'
  | 'AMOUNT_DESC'
  | 'NAME_ASC';

export function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return '৳0.00';
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

