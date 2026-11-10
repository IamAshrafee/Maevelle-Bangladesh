export interface WholeTakaPolicyDto {
  readonly version: string;
  readonly currency: 'BDT';
  readonly unit: '1.0000';
  readonly mode: 'HALF_UP' | 'EXACT';
  readonly boundary: 'AFTER_DISCOUNTS_SHIPPING_TAX_AND_FEES';
  readonly negativeTreatment: 'SYMMETRIC';
  readonly invoiceTreatmentReference: string;
  readonly approval: {
    readonly scope: 'SYNTHETIC' | 'BUSINESS';
    readonly reference: string;
    readonly approvedBy: string;
    readonly approvedAt: string;
  };
}

export interface CashShortfallPolicyInputDto {
  readonly revision: string;
  readonly scope: 'SYNTHETIC' | 'BUSINESS';
  readonly maximumPerAdjustment: string;
  readonly maximumPerOrder: string;
  readonly maximumPerStaffDay: string;
  readonly selfApprovalLimit: string;
  readonly allowedOrderStates: readonly ('PENDING' | 'CONFIRMED' | 'COMPLETED')[];
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly accountingReference: string;
  readonly invoiceTreatmentReference: string;
  readonly courierShortCollectionReference: string;
}

export interface SettleCashShortfallDto {
  readonly orderId: string;
  readonly paymentId: string;
  readonly policyId: string;
  readonly amount: string;
  readonly reason: string;
  readonly collectionEvidenceReference: string;
}

export interface CashSettlementDto {
  readonly originalPayable: string;
  readonly actualCollected: string;
  readonly authorizedWaiver: string;
  readonly refunded: string;
  readonly outstanding: string;
  readonly settlementStatus:
    'OPEN' | 'SETTLED_BY_RECEIPTS' | 'SETTLED_WITH_ADJUSTMENT' | 'CANCELLED';
  readonly accountingStatus: 'NON_CASH_OPERATIONAL_RECORD_ONLY';
}

export interface CashAdjustmentDto {
  readonly id: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly policyId: string;
  readonly amount: string;
  readonly state: 'REQUIRES_APPROVAL' | 'APPLIED' | 'REVERSED' | 'COLLECTION_REVERSED';
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly financeTransactionId: string | null;
  readonly createdAt: string;
  readonly reason: string;
  readonly collectionEvidenceReference: string;
  readonly policyRevision: string;
  readonly reversalReason: string | null;
  readonly reversalEvidenceReference: string | null;
}

export interface CashReadPageDto<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
export interface CashPolicyViewDto {
  readonly id: string;
  readonly policyId: string | null;
  readonly definition: CashShortfallPolicyInputDto;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvalReference: string | null;
  readonly status: 'PROPOSED' | 'APPROVED' | 'EXPIRED' | 'SCHEDULED';
  readonly activation: 'POLICY_BLOCKED';
}
export interface CashEligibilityDto {
  readonly canApply: false;
  readonly canApprove: false;
  readonly activation: 'POLICY_BLOCKED';
  readonly reasons: readonly (
    'POLICY_BLOCKED' | 'NOT_COD' | 'CANCELLED' | 'NO_OUTSTANDING' | 'REQUEST_PENDING'
  )[];
  readonly outstanding: string;
}
export interface FractionalRetailPriceDto {
  readonly source: string;
  readonly id: string;
  readonly amount: string;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly title: string;
  readonly status: string;
}
