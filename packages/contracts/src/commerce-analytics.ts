/** Server-owned commerce facts. Browser observations are a separate untrusted contract. */
export const commerceFactNames = [
  'ORDER_COMMITTED',
  'PAYMENT_CLAIM_SUBMITTED',
  'CLAIM_REJECTED',
  'CLAIM_CORRECTION_REQUESTED',
  'PAYMENT_VERIFIED',
  'OBLIGATION_SATISFIED',
  'COD_COLLECTED',
  'ORDER_CANCELLED',
  'REFUND_COMPLETED',
  'PAYMENT_REVERSED',
] as const;
export type CommerceFactName = (typeof commerceFactNames)[number];
export type CommerceTrafficClass = 'BUSINESS' | 'SYNTHETIC' | 'UNCLASSIFIED';
export interface CommerceMeasurementQueryDto {
  from: string;
  to: string;
  currency?: string;
  trafficClass?: CommerceTrafficClass;
}

export interface CommerceMeasurementReportDto {
  schemaVersion: 1;
  trafficClass: CommerceTrafficClass;
  timezone: 'UTC';
  facts: {
    name: CommerceFactName;
    currency: string | null;
    count: string;
    amount: string | null;
    allocated: string | null;
  }[];
  acceptedSteps: { action: string; count: string }[];
  entries: { source: 'CART' | 'BUY_NOW' | 'UNKNOWN'; count: string }[];
  health: { status: string; count: string; oldestAt: string | null }[];
  operations: {
    operation: string;
    outcome: string;
    count: string;
    duration_ms: string;
    max_duration_ms: string;
  }[];
  conversionRate: null;
  conversionRateReason: string;
  revenueAuthority: 'FINANCE';
  conversionPolicy: {
    version: string;
    ga4: false;
    meta: false;
    advancedMatching: false;
    purchaseQualification: 'UNAPPROVED';
  };
  coverage: string;
}
